import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { approvalAllowed, digest, isOwner, previewText } from '../worker.mjs';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) {
    let args = [];
    const q = {
      bind(...values) { args = values; return q; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; }
    };
    return q;
  } };
  const env = { DB, INTERNAL_API_SECRET: 'private-internal', TELEGRAM_WEBHOOK_SECRET: 'private-hook',
    TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_OWNER_ID: '123', TELEGRAM_CHAT_ID: '123',
    GITHUB_TOKEN: 'test-github', GITHUB_REPOSITORY: 'owner/repo', GITHUB_REF: 'main',
    SITE_URL: 'https://site.example', MAX_DRAFTS_PER_DAY: '6', MAX_MODEL_CALLS_PER_DAY: '24', DRAFT_TTL_HOURS: '12', ENABLED: 'true' };
  return { env, sqlite };
}
function req(path, data, secret = 'private-internal') {
  return new Request('https://worker.example' + path, { method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
}
function callback(action, id, revision, owner = 123) {
  return new Request('https://worker.example/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'private-hook' },
    body: JSON.stringify({ callback_query: { id: 'cb', from: { id: owner }, message: { chat: { id: 123, type: 'private' } }, data: `${action}:${id}:${revision}` } }) });
}
const payload = { title: 'Official policy decision', excerpt: 'A contemporary policy explainer.', reason: 'Material policy update.', slug: 'policy-update',
  event_title: 'A policy event', event_date: '2026-10-31', region: 'US', sections: [{ heading: 'What happened', paragraphs: ['Full private draft [1].'] }],
  sources: [{ title: 'Official source', url: 'https://official.example/news' }] };

test('private owner, expiry, revision and status gates', () => {
  const { env } = setup();
  assert.equal(isOwner({ message: { from: { id: 123 }, chat: { id: 123, type: 'private' } } }, env), true);
  assert.equal(isOwner({ message: { from: { id: 999 }, chat: { id: 123, type: 'private' } } }, env), false);
  assert.equal(isOwner({ message: { from: { id: 123 }, chat: { id: 123, type: 'group' } } }, env), false);
  assert.equal(approvalAllowed({ status: 'pending', revision: 2, expires_at: 200 }, 1, 100), false);
  assert.equal(approvalAllowed({ status: 'pending', revision: 2, expires_at: 100 }, 2, 100), false);
  assert.equal(approvalAllowed({ status: 'published', revision: 2, expires_at: 200 }, 2, 100), false);
});

test('unauthorized requests cannot read drafts or forge Telegram approvals', async () => {
  const { env } = setup();
  assert.equal((await worker.fetch(req('/internal/draft/aaaaaaaaaaaaaaaa', undefined, 'wrong'), env)).status, 401);
  const request = new Request('https://worker.example/telegram', { method: 'POST', body: '{}' });
  assert.equal((await worker.fetch(request, env)).status, 401);
  assert.equal((await worker.fetch(req('/draft/aaaaaaaaaaaaaaaa'), env)).status, 404);
});

test('draft → Telegram approval → claim → deployment receipt, with dedupe and replay protection', async t => {
  const { env, sqlite } = setup();
  let dispatches = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).startsWith('https://api.github.com/')) { dispatches++; return new Response(null, { status: 204 }); }
    return Response.json({ ok: true, result: { message_id: 42 } });
  });
  const eventId = 'a'.repeat(64), id = eventId.slice(0, 16);
  const call = async (path, data) => {
    const response = await worker.fetch(req(path, data), env);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await call('/internal/event/claim', { id: eventId, url: 'https://official.example/news' })).claimed, true);
  assert.equal((await call('/internal/event/claim', { id: eventId, url: 'https://official.example/news' })).claimed, false);
  await call('/internal/draft', { event_id: eventId, payload });
  assert.equal(dispatches, 0, 'Drafting never triggers publication');
  assert.equal((await worker.fetch(req(`/internal/draft/${id}/claim`, { run_id: '1' }), env)).status, 409);
  await worker.fetch(callback('approve', id, 1, 999), env);
  assert.equal(dispatches, 0, 'Another user cannot approve');
  await worker.fetch(callback('approve', id, 1), env);
  assert.equal(dispatches, 1);
  await worker.fetch(callback('approve', id, 1), env);
  assert.equal(dispatches, 1, 'Repeated approval is idempotent');
  const claimed = await call(`/internal/draft/${id}/claim`, { run_id: '1' });
  assert.equal(claimed.digest, await digest(claimed.payload));
  assert.equal((await worker.fetch(req(`/internal/draft/${id}/claim`, { run_id: '2' }), env)).status, 409);
  assert.equal((await worker.fetch(req(`/internal/draft/${id}/complete`, { run_id: '1', digest: 'wrong', url: 'https://site.example/blog/post.html?slug=policy-update' }), env)).status, 409);
  await call(`/internal/draft/${id}/complete`, { run_id: '1', digest: claimed.digest, url: 'https://site.example/blog/post.html?slug=policy-update' });
  assert.equal(sqlite.prepare('SELECT status FROM drafts WHERE id=?').get(id).status, 'published');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM publish_lane').get().n, 0);
});

test('publication queue serializes multiple approvals and dispatch failures retain approvals', async t => {
  const { env, sqlite } = setup();
  let fail = true, dispatches = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('https://api.github.com/')) {
      if (fail) return new Response(null, { status: 503 });
      dispatches++; return new Response(null, { status: 204 });
    }
    return Response.json({ ok: true, result: { message_id: 42 } });
  });
  for (const letter of ['a', 'b']) {
    const id = letter.repeat(16);
    sqlite.prepare('INSERT INTO events(id,url,lease_until,created_at) VALUES(?,?,?,?)').run(letter.repeat(64), 'https://official.example/news', 1, 1);
    sqlite.prepare('INSERT INTO drafts(id,event_id,payload,digest,created_at,expires_at) VALUES(?,?,?,?,?,?)')
      .run(id, letter.repeat(64), JSON.stringify(payload), await digest(JSON.stringify(payload)), 1, Math.floor(Date.now() / 1000) + 1000);
    await worker.fetch(callback('approve', id, 1), env);
    assert.equal(sqlite.prepare('SELECT status FROM drafts WHERE id=?').get(id).status, 'queued');
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM publish_lane').get().n, 0);
  fail = false;
  env.ENABLED = 'false'; // publication queue still drains when detection disabled
  await worker.scheduled({}, env);
  await worker.scheduled({}, env);
  assert.equal(dispatches, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM publish_lane').get().n, 1);
});

test('full preview includes every paragraph and source', () => {
  const text = previewText(payload);
  assert.ok(text.includes('Full private draft [1].'));
  assert.ok(text.includes('https://official.example/news'));
});

test('revisions invalidate approval, recover on failure and require the new version', async t => {
  const { env, sqlite } = setup();
  const id = 'c'.repeat(16), eventId = 'c'.repeat(64);
  let dispatches = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('https://api.github.com/')) { dispatches++; return new Response(null, { status: 204 }); }
    return Response.json({ ok: true, result: { message_id: 42 } });
  });
  sqlite.prepare('INSERT INTO events(id,url,lease_until,created_at) VALUES(?,?,?,?)').run(eventId, 'https://official.example/news', 1, 1);
  const stored = JSON.stringify(payload);
  sqlite.prepare('INSERT INTO drafts(id,event_id,payload,digest,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .run(id, eventId, stored, await digest(stored), 1, Math.floor(Date.now() / 1000) + 1000);
  const revise = new Request('https://worker.example/telegram', { method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'private-hook', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, text: `/revise ${id} Explain the uncertainty more clearly` } }) });
  assert.equal((await worker.fetch(revise, env)).status, 200);
  assert.equal(sqlite.prepare('SELECT status FROM drafts WHERE id=?').get(id).status, 'revising');
  await worker.fetch(callback('approve', id, 1), env);
  assert.equal(dispatches, 1, 'Only revision, no publication');
  await worker.fetch(req('/internal/revision-failed', { id }), env);
  const recovered = sqlite.prepare('SELECT * FROM drafts WHERE id=?').get(id);
  assert.equal(recovered.status, 'pending');
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.payload, stored, 'Failed revision preserves previous article');
  await worker.fetch(callback('approve', id, 1), env);
  assert.equal(dispatches, 1, 'Old button is invalid after recovery');
  await worker.fetch(callback('reject', id, 2), env);
  await worker.fetch(callback('approve', id, 2), env);
  assert.equal(dispatches, 1, 'Rejected version cannot be approved later');
});

test('daily model budget stops further claims without calling external services', async () => {
  const { env, sqlite } = setup();
  env.MAX_MODEL_CALLS_PER_DAY = '1';
  const time = Math.floor(Date.now() / 1000);
  sqlite.prepare('INSERT INTO events(id,url,lease_until,created_at) VALUES(?,?,?,?)').run('d'.repeat(64), 'https://official.example/news', time, time);
  const response = await worker.fetch(req('/internal/event/claim', { id: 'e'.repeat(64), url: 'https://official.example/next' }), env);
  assert.equal((await response.json()).budget, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
});
