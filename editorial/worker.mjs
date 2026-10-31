// Draft contents never have a public endpoint. All writes require an internal
// secret or a Telegram webhook secret AND the configured private-chat owner.
export const now = () => Math.floor(Date.now() / 1000);
const json = (value, status = 200) => Response.json(value, { status });
export async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function secretEqual(a, b) {
  if (!a || !b) return false;
  return (await digest(a)) === (await digest(b));
}
export function isOwner(update, env) {
  const item = update.callback_query || update.message;
  const chat = update.callback_query?.message?.chat || update.message?.chat;
  return String(item?.from?.id) === env.TELEGRAM_OWNER_ID &&
    String(chat?.id) === env.TELEGRAM_CHAT_ID && chat?.type === 'private';
}
export function approvalAllowed(row, revision, time = now()) {
  return row && row.status === 'pending' && row.revision === revision && row.expires_at > time;
}
async function query(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).run(); }
async function first(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).first(); }
async function audit(env, id, action) {
  await query(env, 'INSERT INTO audit(draft_id,action,created_at) VALUES(?,?,?)', id, action, now());
}
async function telegram(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const value = await res.json();
  if (!res.ok || !value.ok) throw new Error(`Telegram ${method} failed (${res.status})`);
  return value.result;
}
const tell = (env, text, extra = {}) => telegram(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, ...extra });
async function dispatch(env, mode, draftId = '') {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/editorial.yml/dispatches`, {
    method: 'POST', headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Screener-Editorial', 'Content-Type': 'application/json'
    }, body: JSON.stringify({ ref: env.GITHUB_REF, inputs: { mode, draft_id: draftId } }), signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`GitHub dispatch failed (${res.status})`);
}
async function drainPublishQueue(env) {
  // One publication at a time prevents older website snapshots overwriting
  // newer ones and avoids GitHub concurrency dropping pending publications.
  // Lease exceeds the Actions job timeout (20 minutes).
  const old = await first(env, 'SELECT * FROM publish_lane WHERE slot=1');
  if (old && old.lease_until <= now()) {
    await query(env, "UPDATE drafts SET status='failed' WHERE id=? AND status IN ('queued','publishing')", old.draft_id);
    await query(env, 'DELETE FROM publish_lane WHERE slot=1 AND lease_until<=?', now());
    await tell(env, `Publication timed out for ${old.draft_id}. Check Actions and use /retry ${old.draft_id}.`);
  }
  const row = await first(env, "SELECT * FROM drafts WHERE status='queued' ORDER BY approved_at,created_at LIMIT 1");
  if (!row) return;
  if (row.expires_at <= now()) {
    await query(env, "UPDATE drafts SET status='failed' WHERE id=? AND status='queued'", row.id);
    await tell(env, `Queued draft ${row.id} expired. Use /revise ${row.id} refresh with current source facts.`);
    return;
  }
  const result = await query(env, 'INSERT OR IGNORE INTO publish_lane(slot,draft_id,lease_until) VALUES(1,?,?)', row.id, now() + 1800);
  if (!result.meta.changes) return;
  try {
    await dispatch(env, 'publish', row.id);
  } catch (e) {
    await query(env, 'DELETE FROM publish_lane WHERE slot=1 AND draft_id=?', row.id);
    // Leave it queued; the next cron run will retry dispatch.
    throw e;
  }
}
export function previewText(p) {
  return `${p.title}\n\n${p.excerpt}\n\nEvent: ${p.event_title}\nSource date: ${p.event_date}\nRegion: ${p.region}\n\n` +
    p.sections.map(s => `${s.heading}\n\n${s.paragraphs.join('\n\n')}`).join('\n\n') +
    '\n\nSources\n' + p.sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}`).join('\n\n') +
    '\n\nAI-assisted draft. Verify the facts before approving. Educational analysis; no investment recommendation.\n';
}
async function sendPreview(env, row) {
  const p = JSON.parse(row.payload);
  // Plain-text attachment carries the COMPLETE article, not just an excerpt.
  const form = new FormData();
  form.set('chat_id', env.TELEGRAM_CHAT_ID);
  form.set('document', new Blob([previewText(p)], { type: 'text/plain;charset=utf-8' }), `draft-${row.id}-v${row.revision}.txt`);
  form.set('caption', `Private draft ${row.id}, version ${row.revision}. Read the full article before approving.`);
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  const result = await res.json();
  if (!res.ok || !result.ok) throw new Error('Telegram draft attachment failed');
  const message = await tell(env, `${p.title}\n\n${p.excerpt}\n\n${p.reason}\n\nDraft: ${row.id} · v${row.revision}\nApproval expires: ${new Date(row.expires_at * 1000).toISOString()}\nFor edits: /revise ${row.id} your instructions`, {
    reply_markup: { inline_keyboard: [[
      { text: 'Approve & publish', callback_data: `approve:${row.id}:${row.revision}` },
      { text: 'Reject', callback_data: `reject:${row.id}:${row.revision}` }
    ]] }
  });
  await query(env, 'UPDATE drafts SET telegram_message_id=? WHERE id=?', message.message_id, row.id);
}
async function changeAndDispatch(env, row, status, mode, instructions = null) {
  const result = await query(env, 'UPDATE drafts SET status=?,instructions=? WHERE id=? AND status=? AND revision=?', status, instructions, row.id, row.status, row.revision);
  if (!result.meta.changes) return false;
  if (mode === 'publish') {
    await query(env, 'UPDATE drafts SET approved_at=? WHERE id=?', now(), row.id);
    await audit(env, row.id, `approved:v${row.revision}:${row.digest}`);
    // Approval remains durably queued if dispatch is temporarily unavailable.
    try { await drainPublishQueue(env); } catch { /* next cron retries */ }
    return true;
  }
  try {
    await dispatch(env, mode, row.id);
  } catch (e) {
    await query(env, 'UPDATE drafts SET status=? WHERE id=? AND status=?', row.status, row.id, status);
    throw e;
  }
  await audit(env, row.id, mode === 'publish' ? `approved:v${row.revision}:${row.digest}` : 'revision_requested');
  return true;
}
async function webhook(request, env) {
  if (!await secretEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: 'Unauthorized' }, 401);
  const update = await request.json();
  if (!isOwner(update, env)) return json({ ok: true });
  if (update.callback_query) {
    const cb = update.callback_query;
    await telegram(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    const match = /^(approve|reject):([a-f0-9]{16}):(\d+)$/.exec(cb.data || '');
    if (!match) return json({ ok: true });
    const [, action, id, version] = match;
    const row = await first(env, 'SELECT * FROM drafts WHERE id=?', id);
    if (!approvalAllowed(row, Number(version))) {
      await tell(env, `Draft ${id} is expired, changed, or already handled. Use /pending or /revise ${id} refresh using current source facts.`);
      return json({ ok: true });
    }
    if (action === 'reject') {
      const result = await query(env, "UPDATE drafts SET status='rejected' WHERE id=? AND status='pending' AND revision=?", id, row.revision);
      if (result.meta.changes) { await audit(env, id, 'rejected'); await tell(env, `Rejected ${id}. Nothing will be published.`); }
    } else {
      if (await changeAndDispatch(env, row, 'queued', 'publish')) {
        await query(env, 'UPDATE drafts SET approved_at=? WHERE id=?', now(), id);
        await tell(env, `Approved ${id} v${row.revision}. Publication queued; I’ll confirm after deployment.`);
      }
    }
    return json({ ok: true });
  }
  const text = update.message?.text || '';
  if (/^\/(start|help)(?:\s|$)/.test(text)) {
    await tell(env, 'Editorial autopilot: events create drafts, never automatic posts.\n/pending — resend pending drafts\n/status — health and queue\n/pause — stop detecting new stories\n/resume — resume detection\n/revise ID instructions — revise or refresh a draft\n/retry ID — retry an approved failed publication\nEvery revised draft needs fresh approval.');
  } else if (text === '/pause' || text === '/resume') {
    await query(env, "INSERT INTO settings(key,value) VALUES('paused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", text === '/pause' ? '1' : '0');
    await tell(env, text === '/pause' ? 'New-story detection paused. Pending drafts still need your decision.' : 'New-story detection resumed.');
  } else if (text === '/status') {
    const state = await first(env, "SELECT value FROM settings WHERE key='last_scan'");
    const count = await first(env, "SELECT COUNT(*) AS n FROM drafts WHERE status='pending'");
    const paused = await first(env, "SELECT value FROM settings WHERE key='paused'");
    await tell(env, `Enabled: ${env.ENABLED}\nPaused: ${paused?.value === '1'}\nLast completed scan: ${state?.value || 'none'}\nPending (including expired): ${count.n}\nFailed publication: use /retry ID. Secrets are never included in status.`);
  } else if (text === '/pending') {
    const rows = await env.DB.prepare("SELECT * FROM drafts WHERE status IN ('pending','failed','queued','publishing') ORDER BY created_at DESC LIMIT 10").all();
    if (!rows.results.length) await tell(env, 'No pending drafts.');
    for (const row of rows.results) {
      if (row.status === 'pending') await sendPreview(env, row);
      else await tell(env, `${row.id}: ${row.status}. ${row.status === 'failed' ? 'Use /retry ' + row.id : 'Publication is in progress.'}`);
    }
  } else if (/^\/revise /.test(text)) {
    const match = /^\/revise ([a-f0-9]{16}) ([\s\S]{1,2000})$/.exec(text);
    if (!match) { await tell(env, 'Use /revise DRAFT_ID your edit instructions'); return json({ ok: true }); }
    const row = await first(env, 'SELECT * FROM drafts WHERE id=?', match[1]);
    if (!row || !['pending', 'rejected', 'failed'].includes(row.status)) await tell(env, 'That draft cannot be revised while publishing, or does not exist.');
    else if (await changeAndDispatch(env, row, 'revising', 'revise', match[2])) await tell(env, `Revision requested for ${row.id}. The old approval buttons can no longer publish it.`);
  } else if (/^\/retry /.test(text)) {
    const id = text.slice(7).trim();
    const row = await first(env, 'SELECT * FROM drafts WHERE id=?', id);
    if (!row || row.status !== 'failed' || !row.approved_at || row.expires_at <= now()) await tell(env, 'Retry requires an unexpired, previously approved failed draft. Otherwise use /revise ID refresh with current sources.');
    else if (await changeAndDispatch(env, row, 'queued', 'publish')) await tell(env, `Retry queued for ${id}, using the same approved version.`);
  }
  return json({ ok: true });
}
async function internal(request, env, path) {
  if (!await secretEqual(request.headers.get('Authorization'), `Bearer ${env.INTERNAL_API_SECRET}`) || !env.INTERNAL_API_SECRET) return json({ error: 'Unauthorized' }, 401);
  const body = request.method === 'POST' ? await request.json() : {};
  if (path === '/internal/trigger-scan' && request.method === 'POST') {
    await dispatch(env, 'scan');
    return json({ dispatched: true });
  }
  if (path === '/internal/event/claim' && request.method === 'POST') {
    if (!/^[a-f0-9]{64}$/.test(body.id) || typeof body.url !== 'string') return json({ error: 'Invalid event' }, 400);
    const limit = Number(env.MAX_DRAFTS_PER_DAY || 6);
    const count = await first(env, "SELECT COUNT(*) AS n FROM drafts WHERE created_at>?", now() - 86400);
    if (count.n >= limit) return json({ claimed: false, budget: true });
    const calls = await first(env, 'SELECT COALESCE(SUM(attempts),0) AS n FROM events WHERE created_at>?', now() - 86400);
    if (calls.n >= Number(env.MAX_MODEL_CALLS_PER_DAY || 24)) return json({ claimed: false, budget: true });
    const out = await query(env, `INSERT INTO events(id,url,lease_until,created_at) VALUES(?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET lease_until=excluded.lease_until,attempts=events.attempts+1
      WHERE events.status='processing' AND events.lease_until<? AND events.attempts<3`, body.id, body.url, now() + 900, now(), now());
    return json({ claimed: out.meta.changes === 1 });
  }
  if (path === '/internal/event/ignore' && request.method === 'POST') {
    await query(env, "UPDATE events SET status='ignored' WHERE id=? AND status='processing'", body.id);
    return json({ ok: true });
  }
  if (path === '/internal/draft' && request.method === 'POST') {
    const p = body.payload;
    if (!p || typeof p.title !== 'string' || !Array.isArray(p.sections) || !/^[a-f0-9]{64}$/.test(body.event_id)) return json({ error: 'Invalid draft' }, 400);
    const event = await first(env, 'SELECT * FROM events WHERE id=?', body.event_id);
    if (!event) return json({ error: 'Unknown event' }, 409);
    const payload = JSON.stringify(p), hash = await digest(payload), id = body.event_id.slice(0, 16);
    if (payload.length > 60000) return json({ error: 'Draft too large' }, 400);
    if (body.revision) {
      const result = await query(env, `UPDATE drafts SET payload=?,digest=?,status='pending',revision=revision+1,expires_at=?,instructions=NULL,approved_at=NULL,run_id=NULL
        WHERE id=? AND status='revising' AND revision=?`, payload, hash, now() + Number(env.DRAFT_TTL_HOURS || 12) * 3600, id, body.revision);
      if (!result.meta.changes) return json({ error: 'Revision conflict' }, 409);
    } else {
      await query(env, 'INSERT OR IGNORE INTO drafts(id,event_id,payload,digest,created_at,expires_at) VALUES(?,?,?,?,?,?)', id, body.event_id, payload, hash, now(), now() + Number(env.DRAFT_TTL_HOURS || 12) * 3600);
    }
    await query(env, "UPDATE events SET status='drafted' WHERE id=?", body.event_id);
    await audit(env, id, body.revision ? 'revised' : 'drafted');
    await sendPreview(env, await first(env, 'SELECT * FROM drafts WHERE id=?', id));
    return json({ id });
  }
  if (path === '/internal/scan-complete' && request.method === 'POST') {
    await query(env, "INSERT INTO settings(key,value) VALUES('last_scan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", new Date().toISOString());
    const failure = [...new Set(body.failures || [])].sort().join(', ');
    const previous = await first(env, "SELECT value FROM settings WHERE key='scan_failure'");
    if (failure !== (previous?.value || '')) {
      await tell(env, failure ? `Editorial scan needs attention: ${failure}. Check Actions. Other available feeds continue to be monitored.` : 'Editorial feed checks recovered.');
      await query(env, "INSERT INTO settings(key,value) VALUES('scan_failure',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", failure);
    }
    return json({ ok: true });
  }
  const match = /^\/internal\/draft\/([a-f0-9]{16})(?:\/(claim|complete|failed))?$/.exec(path);
  if (match) {
    const [, id, action] = match;
    let row = await first(env, 'SELECT * FROM drafts WHERE id=?', id);
    if (!row) return json({ error: 'Unknown draft' }, 404);
    if (!action && request.method === 'GET') return json(row);
    if (request.method !== 'POST') return json({ error: 'Method' }, 405);
    if (action === 'claim') {
      if (!body.run_id || row.expires_at <= now()) return json({ error: 'Expired or invalid publication' }, 409);
      const lane = await first(env, 'SELECT * FROM publish_lane WHERE slot=1');
      if (lane?.draft_id !== id || lane.lease_until <= now()) return json({ error: 'Publication lane not reserved' }, 409);
      const result = await query(env, "UPDATE drafts SET status='publishing',run_id=? WHERE id=? AND status='queued'", body.run_id, id);
      row = await first(env, 'SELECT * FROM drafts WHERE id=?', id);
      if (!result.meta.changes && !(row.status === 'publishing' && row.run_id === body.run_id)) return json({ error: 'Not approved or already claimed' }, 409);
      return json({ payload: row.payload, digest: row.digest, revision: row.revision });
    }
    if (action === 'complete') {
      const expectedUrl = `${env.SITE_URL}/blog/post.html?slug=${JSON.parse(row.payload).slug}`;
      if (body.url !== expectedUrl || body.digest !== row.digest) return json({ error: 'Publication mismatch' }, 409);
      const result = await query(env, "UPDATE drafts SET status='published',published_url=? WHERE id=? AND status='publishing' AND run_id=?", body.url, id, body.run_id);
      if (result.meta.changes) {
        await query(env, 'DELETE FROM publish_lane WHERE slot=1 AND draft_id=?', id);
        await audit(env, id, 'published');
        await tell(env, `Published: ${JSON.parse(row.payload).title}\n${body.url}`);
        await drainPublishQueue(env);
      }
      return json({ ok: true });
    }
    if (action === 'failed') {
      const result = await query(env, "UPDATE drafts SET status='failed' WHERE id=? AND status='publishing' AND run_id=?", id, body.run_id);
      if (result.meta.changes) {
        await query(env, 'DELETE FROM publish_lane WHERE slot=1 AND draft_id=?', id);
        await tell(env, `Publication failed for ${id}. Check GitHub Actions, then /retry ${id}. Your approved version is preserved.`);
        await drainPublishQueue(env);
      }
      return json({ ok: true });
    }
  }
  if (path === '/internal/alert' && request.method === 'POST') {
    // Only bounded non-secret messages from the trusted workflow.
    await tell(env, String(body.message || 'Editorial workflow failed; check GitHub Actions.').slice(0, 1000));
    return json({ ok: true });
  }
  if (path === '/internal/revision-failed' && request.method === 'POST') {
    await query(env, "UPDATE drafts SET status='pending',revision=revision+1 WHERE id=? AND status='revising'", body.id);
    // Revision requests already invalidate old approval buttons by incrementing
    // the version. Recover the previous article but require a new decision.
    await tell(env, `Revision failed for ${body.id}. Original draft restored; use /pending or request another revision.`);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/health' && request.method === 'GET') return json({ ok: true });
      if (path === '/telegram' && request.method === 'POST') return await webhook(request, env);
      if (path.startsWith('/internal/')) return await internal(request, env, path);
      return json({ error: 'Not found' }, 404);
    } catch {
      // Never return upstream response bodies, tokens or draft contents.
      return json({ error: 'Operation failed; check configuration and retry.' }, 503);
    }
  },
  async scheduled(_event, env) {
    await drainPublishQueue(env);
    if (env.ENABLED !== 'true') return;
    if ((await first(env, "SELECT value FROM settings WHERE key='paused'"))?.value === '1') return;
    // Cloudflare owns the clock. GitHub's short-lived job does feed parsing,
    // source extraction and model calls; there is no scheduled publication.
    await dispatch(env, 'scan');
  }
};
