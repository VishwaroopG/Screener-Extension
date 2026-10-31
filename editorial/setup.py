"""Interactive activation helper. Secrets are read without echo and piped to
Wrangler / GitHub CLI; they are never written to files or command arguments.
Run only after Cloudflare login, D1 creation, and pushing editorial.yml to main.
"""
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
from urllib.parse import urlparse

from pipeline import fetch

HERE = Path(__file__).resolve().parent
REPO = 'VishwaroopG/Screener-Extension'


def run(args, secret=None):
    return subprocess.run(args, cwd=HERE, input=secret, text=True, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env={**os.environ, 'CI': 'true', 'WRANGLER_SEND_METRICS': 'false'}).stdout.strip()


def telegram(token, method, body=None):
    return json.loads(fetch(f'https://api.telegram.org/bot{token}/{method}', hosts=['api.telegram.org'],
        data=json.dumps(body or {}).encode(), headers={'Content-Type': 'application/json'}))


def main():
    gh = shutil.which('gh')
    npx = shutil.which('npx.cmd') or shutil.which('npx')
    if not gh or not npx:
        raise ValueError('Install Node.js and GitHub CLI first.')
    run([gh, 'auth', 'status'])
    run([npx, '--no-install', 'wrangler', 'whoami'])
    # Ensure the dispatch target actually exists before wiring the bot.
    run([gh, 'api', f'repos/{REPO}/actions/workflows/editorial.yml'])
    config = json.loads((HERE / 'wrangler.jsonc').read_text(encoding='utf-8'))
    if config['d1_databases'][0]['database_id'].startswith('REPLACE_'):
        raise ValueError('Create the D1 database and enter its database_id in wrangler.jsonc first.')
    worker = input('Deployed Worker HTTPS URL (for example https://screener-editorial.YOUR-SUBDOMAIN.workers.dev): ').strip().rstrip('/')
    parsed = urlparse(worker)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Enter the bare HTTPS Worker origin.')
    token = getpass.getpass('Telegram bot token from BotFather (hidden): ').strip()
    if not telegram(token, 'getMe').get('ok'):
        raise ValueError('Telegram rejected the bot token.')
    # Removing an existing webhook would disrupt another service. Refuse to
    # silently replace one; use a dedicated bot for this autopilot.
    hook = telegram(token, 'getWebhookInfo').get('result', {}).get('url', '')
    if hook and hook != worker + '/telegram':
        raise ValueError('This bot already has another webhook. Create a dedicated editorial bot.')
    if hook:
        owner = input('Your numeric Telegram user ID (must be the private chat ID too): ').strip()
    else:
        print('Open a PRIVATE chat with your bot and send /start.')
        input('Press Enter after sending it: ')
        updates = telegram(token, 'getUpdates', {'allowed_updates': ['message'], 'timeout': 0})
        owners = {}
        for update in updates.get('result', []):
            message = update.get('message', {})
            chat, sender = message.get('chat', {}), message.get('from', {})
            if chat.get('type') == 'private' and chat.get('id') == sender.get('id') and not sender.get('is_bot'):
                owners[str(sender['id'])] = sender.get('username', sender.get('first_name', 'Telegram user'))
        for uid, name in owners.items():
            print(f'Private chat: {uid} ({name})')
        owner = input('Enter YOUR numeric user ID from the list above: ').strip()
        if owner not in owners:
            raise ValueError('User ID does not match a private chat observed by this bot.')
    if not owner.isdigit():
        raise ValueError('A numeric private-chat user ID is required.')
    github = getpass.getpass('Fine-grained GitHub token: this repo only, Actions read/write (hidden): ').strip()
    gemini = getpass.getpass('Gemini API key from an eligible free-tier project (hidden): ').strip()
    model = input('Gemini model [gemini-2.5-flash]: ').strip() or 'gemini-2.5-flash'
    if not github or not gemini:
        raise ValueError('Both API credentials are required.')
    internal, webhook = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    print('Saving secrets directly to Cloudflare and GitHub. Secret values will not be printed.')
    for name, value in {'TELEGRAM_BOT_TOKEN': token, 'TELEGRAM_WEBHOOK_SECRET': webhook,
                        'INTERNAL_API_SECRET': internal, 'GITHUB_TOKEN': github}.items():
        run([npx, '--no-install', 'wrangler', 'secret', 'put', name], value)
    for name, value in {'EDITORIAL_API_SECRET': internal, 'GEMINI_API_KEY': gemini}.items():
        run([gh, 'secret', 'set', name, '--repo', REPO], value)
    for name, value in {'EDITORIAL_WORKER_URL': worker, 'GEMINI_MODEL': model}.items():
        run([gh, 'variable', 'set', name, '--repo', REPO, '--body', value])
    config['vars']['TELEGRAM_OWNER_ID'] = owner
    config['vars']['TELEGRAM_CHAT_ID'] = owner
    config['vars']['ENABLED'] = 'false'
    (HERE / 'wrangler.jsonc').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
    run([npx, '--no-install', 'wrangler', 'd1', 'migrations', 'apply', 'screener-editorial', '--remote'])
    run([npx, '--no-install', 'wrangler', 'deploy'])
    result = telegram(token, 'setWebhook', {'url': worker + '/telegram', 'secret_token': webhook,
                                          'allowed_updates': ['message', 'callback_query'], 'drop_pending_updates': True})
    if not result.get('ok'):
        raise ValueError('Webhook registration failed. Re-run setup to retry.')
    print('Private bot connected. Send /status in Telegram to test it.')
    print('Detection is OFF. Run a manual scan in GitHub Actions first; then set ENABLED=true in wrangler.jsonc and deploy.')
    print('Set GitHub Settings → Pages → Source to GitHub Actions before approving your first article.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        # Exceptions from CLI / urllib can contain URLs or token-bearing data.
        print('Setup did not complete. Check login, database ID, dedicated bot and repository permissions. No secret values were logged.', file=sys.stderr)
        sys.exit(1)
