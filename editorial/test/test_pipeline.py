import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pipeline', Path(__file__).parents[1] / 'pipeline.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def fixture():
    paragraph = ('The official release describes a change in policy [1]. '
                 'Its effect on borrowing costs depends on how lenders respond. '
                 'This is conditional analysis and does not establish a market reaction. ')
    return {'slug': 'policy-update-1234', 'title': 'A policy update and its implications',
            'excerpt': 'A sourced explanation of a new policy announcement and the questions investors should consider.',
            'reason': 'Official monetary-policy decision.', 'date': '2026-10-31', 'region': 'US',
            'event_title': 'Policy decision', 'event_date': '2026-10-31T01:00:00+00:00',
            'tags': ['US', 'Monetary policy'],
            'sections': [{'heading': title, 'paragraphs': [paragraph * 4]} for title in ('What happened', 'Why it matters', 'What to watch')],
            'sources': [{'title': 'Official release', 'url': 'https://www.federalreserve.gov/new.htm'}],
            'event': {'url': 'https://www.federalreserve.gov/new.htm', 'hosts': ['www.federalreserve.gov']}}


class FeedTests(unittest.TestCase):
    feed = {'name': 'Official feed', 'region': 'US', 'url': 'https://example.com/rss', 'hosts': ['example.com']}
    at = datetime(2026, 10, 31, 10, tzinfo=timezone.utc)

    def test_rss_only_fresh_allowlisted_items(self):
        raw = b'''<rss><channel>
          <item><title>New decision</title><link>https://example.com/news#top</link><pubDate>Sat, 31 Oct 2026 09:00:00 GMT</pubDate></item>
          <item><title>Old decision</title><link>https://example.com/old</link><pubDate>Mon, 26 Oct 2026 09:00:00 GMT</pubDate></item>
          <item><title>Attack</title><link>https://evil.com/</link><pubDate>Sat, 31 Oct 2026 09:00:00 GMT</pubDate></item>
          <item><title>Undated</title><link>https://example.com/undated</link></item>
          </channel></rss>'''
        events = p.parse_feed(raw, self.feed, self.at)
        self.assertEqual([e['title'] for e in events], ['New decision'])
        self.assertEqual(events[0]['url'], 'https://example.com/news')

    def test_atom_and_rdf_dates(self):
        for raw in (b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Decision</title><link href="https://example.com/new"/><updated>2026-10-31T09:00:00Z</updated></entry></feed>''',
                    b'''<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Decision</title><link>https://example.com/new</link><dc:date>2026-10-31T18:00:00+09:00</dc:date></item></rdf:RDF>'''):
            self.assertEqual(len(p.parse_feed(raw, self.feed, self.at)), 1)

    def test_future_missing_timezone_and_xml_entities(self):
        self.assertIsNone(p.parse_date('2026-10-31T09:00:00'))
        with self.assertRaises(ValueError):
            p.parse_feed(b'<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>', self.feed, self.at)

    def test_network_rejects_private_and_unapproved_urls_before_fetch(self):
        for url in ('http://example.com/', 'https://127.0.0.1/', 'https://example.com:444/', 'https://user:pass@example.com/'):
            with self.assertRaises(ValueError):
                p.fetch(url, hosts=['example.com'])


class PublicationTests(unittest.TestCase):
    def test_transient_model_errors_retry_but_quota_errors_do_not(self):
        host = 'generativelanguage.googleapis.com'
        with patch.object(p, 'fetch', side_effect=[p.RequestFailure(503, host), b'{}']) as request, patch.object(p.time, 'sleep'):
            self.assertEqual(p.model_request('https://' + host, {}, {}), b'{}')
            self.assertEqual(request.call_count, 2)
        with patch.object(p, 'fetch', side_effect=p.RequestFailure(429, host)) as request, patch.object(p.time, 'sleep'):
            with self.assertRaises(p.RequestFailure):
                p.model_request('https://' + host, {}, {})
            self.assertEqual(request.call_count, 1)

    def test_html_escape_and_source_validation(self):
        article = fixture()
        article['sections'][0]['paragraphs'][0] += ' Interest & credit remain uncertain.'
        self.assertIn('Interest &amp; credit', p.render(article))
        article['title'] = '<img src=x onerror=alert(1)>'
        with self.assertRaises(ValueError):
            p.render(article)

    def test_path_traversal_and_model_source_invention_rejected(self):
        article = fixture()
        article['slug'] = '../../secret'
        with self.assertRaises(ValueError):
            p.render(article)
        article = fixture()
        article['sources'][0]['url'] = 'https://invented.example/news'
        with self.assertRaises(ValueError):
            p.render(article)

    def test_idempotent_article_index_and_sitemap(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'blog/posts').mkdir(parents=True)
            (root / 'blog/posts.json').write_text('[]', encoding='utf-8')
            (root / 'sitemap.xml').write_text('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', encoding='utf-8')
            article = fixture()
            p.write_article(article, root)
            p.write_article(article, root)
            self.assertEqual(len(json.loads((root / 'blog/posts.json').read_text())), 1)
            self.assertEqual((root / 'sitemap.xml').read_text().count('?slug='), 1)
            article['sections'][0]['paragraphs'][0] += ' A later change.'
            with self.assertRaises(ValueError):
                p.write_article(article, root)

    def test_publish_guard_blocks_local_checkout(self):
        with patch('sys.argv', ['pipeline.py', 'publish', '--draft-id', 'a' * 16]), patch.dict('os.environ', {'GITHUB_ACTIONS': 'false'}):
            with self.assertRaises(ValueError):
                p.main()

    def test_website_artifact_excludes_editorial_and_extension_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'editorial').mkdir()
            (root / 'editorial/.dev.vars').write_text('secret')
            (root / 'Screener Chrome Extension').mkdir()
            (root / 'Screener Chrome Extension/private.txt').write_text('private')
            (root / 'index.html').write_text('public')
            (root / 'blog/posts').mkdir(parents=True)
            (root / 'blog/posts/news.html').write_text('approved article')
            destination = root / 'artifact'
            p.pack_site(root, destination)
            self.assertTrue((destination / 'index.html').exists())
            self.assertTrue((destination / 'blog/posts/news.html').exists())
            self.assertFalse((destination / 'editorial').exists())
            self.assertFalse((destination / 'Screener Chrome Extension').exists())

    def test_structured_model_output_uses_retrieved_source_and_stable_event_slug(self):
        article = fixture()
        model = {k: article[k] for k in ('title', 'excerpt', 'reason', 'tags', 'sections')}
        model['significant'] = True
        event = {**article['event'], 'title': 'Official policy decision', 'published_at': '2026-10-31T01:00:00+00:00',
                 'source': 'Federal Reserve', 'region': 'US'}
        response = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(model)}]}}]}
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'fake-test-key'}), patch.object(p, 'fetch', return_value=json.dumps(response).encode()):
            generated = p.generate(event, 'Retrieved official announcement', [])
        self.assertEqual(generated['sources'][0]['url'], event['url'])
        self.assertTrue(generated['slug'].endswith(p.hashlib.sha256(event['url'].encode()).hexdigest()[:10]))


if __name__ == '__main__':
    unittest.main()
