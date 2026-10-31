# Editorial autopilot

Cloudflare schedules short-lived GitHub Actions research jobs. New, significant
events create private drafts; there is **no publishing timetable**. Telegram is
the only approval interface. Nothing deploys without an owner approval of the
stored article version.

## What is implemented

- Official feeds: US Federal Reserve monetary policy, US BEA releases, ECB press
  releases, and Bank of Japan English updates. This first source set covers
  economic/policy announcements, not every global breaking-news story.
- RSS/Atom/RDF parsing, 24-hour freshness window, allowlisted source fetching,
  deduplication by announcement URL, maximum 3 preparation attempts per event.
- Gemini writes an original sourced explainer only when a release is significant.
  An official release establishes its own announcement; unsupported claims about
  market reactions and consensus expectations are excluded by the prompt.
- Complete article preview as a private Telegram text attachment, with source
  links and Approve/Reject buttons. Drafts are not public website pages, PRs or
  GitHub artifacts.
- Only the configured Telegram user in their configured private chat can approve.
  Webhook secret authentication, immutable stored payload SHA-256, revision checks,
  and an audit log bind publication to the reviewed article.
- `/revise ID instructions` fetches the source again and produces a new version
  requiring new approval. Failed revisions recover the original with a new version.
- Approval expires after 12 hours. Expired stories need a source refresh/revision.
- A durable, serial publication queue prevents concurrent deployments overwriting
  one another. Repeated approvals and successful publication retries are idempotent.
- Approved publication updates the root `blog/posts/*.html`, `blog/posts.json`,
  and `sitemap.xml`, commits only those files to main, then deploys a website-only
  artifact to GitHub Pages. The nested extension copy is intentionally not a website
  publishing target.

Cloudflare invokes feed checks at minutes 7, 22, 37 and 52 each hour. These are
**detection checks, not article intervals**. GitHub queueing, feed publication
latency and model quotas add delay. This is not a real-time financial-news service.

## Activation

Prerequisites: Node.js 22+, Python 3.12+, GitHub CLI, a Cloudflare Free account,
a dedicated Telegram bot, and a Gemini API project with eligible free quota.
Keep credentials out of chat, source files and shell command arguments.

1. Log in to GitHub with an account that can write to
   `VishwaroopG/Screener-Extension`: `gh auth login --hostname github.com --web`.
   Push **only** `.github/workflows/editorial.yml`, `.github/workflows/pages.yml`
   and `editorial/` to main first.
   Do not include unrelated extension edits. This is needed because GitHub can
   dispatch only a workflow already present in the repository.
2. In `editorial/`, run `npm install`, then `npx wrangler login`.
3. Run `npx wrangler d1 create screener-editorial`. Put its `database_id` into
   `wrangler.jsonc`. Leave `ENABLED` set to `false`.
4. Run `npx wrangler deploy` to obtain your Worker URL. At this point monitoring
   is off and no credentials have been installed. `/health` is a liveness endpoint,
   not proof that integrations are configured.
5. Create a **dedicated** private editorial bot using Telegram's `@BotFather`.
   Prepare a GitHub fine-grained PAT restricted to this repository, with
   **Actions: read and write** (metadata read is implicit). The Worker uses this
   token only for workflow dispatch. The publishing Action uses its own scoped
   `GITHUB_TOKEN` for repository writes and Pages deployments.
6. From the repository root run `python editorial/setup.py` in your own terminal.
   It prompts for secret values **without echo**, detects your private Telegram
   chat after you send `/start`, and pipes credentials directly into Wrangler and
   GitHub secret storage. It applies D1 migrations, redeploys and registers the
   webhook. No secret file is created. Re-running setup rotates internal secrets;
   wait for existing jobs to finish first.
7. In GitHub **Settings → Pages**, set **Source = GitHub Actions**. This replaces
   branch-based deployment; preserve any custom-domain setting. Ensure the
   `github-pages` environment allows deployments from main. Branch rules must
   allow the workflow's bot to commit the three article paths. If main requires
   PRs with no bot exception, publishing will fail safely until configured.
8. Send `/status` to your bot. In GitHub **Actions → Editorial autopilot → Run
   workflow**, run mode `scan` with an empty draft ID. No qualifying recent event
   means no draft; do not fabricate a news story just to test publishing.
9. Verify a real draft, reject it or approve it, and check the live article and
   Telegram confirmation. Then set `ENABLED` to `true` and run `npx wrangler deploy`.
   Your computer can now be switched off.

The setup helper checks the existing webhook and refuses to take over a bot
connected to another service. A bot's private chat is not end-to-end encrypted;
drafts are also stored in your Cloudflare D1 database. Never place sensitive
personal information in article revisions.

### Cloudflare secrets

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Dedicated bot authentication |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation |
| `INTERNAL_API_SECRET` | Authenticate GitHub jobs to the Worker |
| `GITHUB_TOKEN` | Fine-grained PAT for workflow dispatch only |

Non-secret configuration is in `wrangler.jsonc`: owner/chat IDs, repository,
branch, site URL, enabled flag and budgets. The publisher currently targets main
and this site's URL; update `pipeline.py` and `editorial.yml` as well if moving
the project to another repository/branch/site.

### GitHub secrets and variables

| Kind | Name |
|---|---|
| Secret | `EDITORIAL_API_SECRET` (same value as Cloudflare `INTERNAL_API_SECRET`) |
| Secret | `GEMINI_API_KEY` |
| Variable | `EDITORIAL_WORKER_URL` |
| Variable | `GEMINI_MODEL` (defaults to `gemini-3.5-flash-lite`; choose an available free-tier model) |

## Telegram commands

| Command | Effect |
|---|---|
| `/help` | Show commands |
| `/status` | Enabled/paused state, last successful scan, pending count |
| `/pending` | Resend up to 10 pending previews / show publication state |
| `/pause` | Stop new-story detection; approved queue continues |
| `/resume` | Resume detection (also needs `ENABLED=true` in Worker config) |
| `/revise ID your instructions` | Re-read source and rewrite; require fresh approval |
| `/retry ID` | Retry the exact approved, unexpired failed publication |

Approve and Reject buttons apply to their exact version. No response means no
publication. A queued publication can take up to the next detection tick if
GitHub dispatch is temporarily unavailable. A stalled publication is marked
failed after 30 minutes; inspect the Actions run before retrying.

## Free-tier controls and limitations

- Use a **public repository and standard Ubuntu runners** for free Actions compute.
- Default upper bounds: **24 event preparation/model attempts per rolling day**,
  **6 new drafts per rolling day**, 6 preparations per scan, 3 attempts per event.
  These are caps, not targets. Revise requests are user-initiated and additionally
  consume your AI quota. Expensive stories can exhaust the free quota earlier.
- Use a Gemini Free Tier project. Do not enable paid billing just to bypass quota
  failures. The system fails closed when generation or validation fails; it does
  not automatically upgrade plans or switch to a paid provider.
- Worker Free CPU limits are tight. Keep heavy research and generation in Actions.
  Database and request allowances must also be monitored in Cloudflare. Start at
  the default cadence and check real usage; zero cost cannot be guaranteed if
  provider plans, eligibility or pricing change.
- Partial feed/preparation failures notify only when the failure set changes;
  routine scans stay quiet. Failed whole workflows alert separately.
- PDF-only releases, unreadable pages, ambiguous/missing feed timestamps and old
  stories are skipped. This means some genuine events will need manual coverage.
- Factual accuracy is not mechanically guaranteed. The human review is essential;
  the code validates structure, source URLs and the approved version, not truth.
- No external news text is copied verbatim into articles by design. Expand
  `feeds.json` with appropriate source/usage permissions and explicit hosts.
  Do not add arbitrary untrusted sources and assume they are authoritative.
- Main-branch pushes from `GITHUB_TOKEN` don't trigger another Pages workflow;
  this workflow explicitly deploys the website after committing the approved post.
  The included `pages.yml` preserves deployment for ordinary main-branch website
  edits and provides a manual Deploy website workflow. It uses no editorial
  secrets. Avoid manual website deployments while an approved article is deploying;
  GitHub Pages may reject overlapping deployments, in which case use `/retry ID`.

## Local verification

From the repository root:

```powershell
python -m unittest discover -s editorial/test -p "test_*.py" -v
node --test editorial/test/worker.test.mjs
python editorial/pipeline.py check-feeds
```

From `editorial/` after installing dependencies:

```powershell
npx wrangler deploy --dry-run --outdir .wrangler/build
```

Tests use an in-memory SQLite database and mocked Telegram/GitHub services; they
do not send messages, generate posts or deploy. The feed check makes read-only
network requests. All four configured feeds passed live retrieval and parsing
checks. An initial ECB certificate-chain error cleared after Windows' native TLS
client populated the intermediate-certificate cache; verification stayed enabled.
Model generation, real Telegram delivery and Pages deployment still require the
account configuration and live acceptance test described above.

Reference docs: [Telegram webhooks](https://core.telegram.org/bots/api#setwebhook),
[Cloudflare cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[D1](https://developers.cloudflare.com/d1/),
[GitHub dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event),
[Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
