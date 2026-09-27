const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'mm_session';

// ── Shared app state (Postgres) ──────────────────────────────────────────────
// Small key/value blobs (categories, locally-created tasks, todos, section
// settings) that need to look identical on every computer, not just cached
// per-browser. Only this fixed set of keys is ever read/written here.
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const ALLOWED_STATE_KEYS = new Set([
  'mossmind_categories',
  'mossmind_todos',
  'asana_section_gids',
  'quick_task_section_gid',
  'mossmind_local_tasks',
]);
const stateReady = pool
  ? pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  : Promise.resolve();

// ── Auth helpers ────────────────────────────────────────────────────────────

function makeToken(password) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(password).digest('hex');
}

function isAuthenticated(req) {
  if (!APP_PASSWORD) return true; // no password set = open
  const cookie = parseCookies(req)[COOKIE_NAME];
  return cookie === makeToken(APP_PASSWORD);
}

function parseCookies(req) {
  const list = {};
  const header = req.headers.cookie;
  if (!header) return list;
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}

// ── Auth routes ─────────────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!APP_PASSWORD || password === APP_PASSWORD) {
    const token = makeToken(APP_PASSWORD || '');
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Strict`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect password' });
});

app.post('/api/auth/check', (req, res) => {
  res.json({ ok: isAuthenticated(req) });
});

// ── Shared state proxy (auth required) ──────────────────────────────────────

app.get('/api/state/:key', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set on server' });
  if (!ALLOWED_STATE_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Unknown key' });
  try {
    await stateReady;
    const result = await pool.query('SELECT value FROM app_state WHERE key = $1', [req.params.key]);
    res.json({ value: result.rows[0]?.value ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/state/:key', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set on server' });
  if (!ALLOWED_STATE_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Unknown key' });
  const { value } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  try {
    await stateReady;
    await pool.query(
      `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Anthropic proxy (auth required) ─────────────────────────────────────────

app.post('/api/anthropic', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Asana proxy (auth required) ─────────────────────────────────────────────

app.get('/api/asana/*', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}, async (req, res) => {
  const pat = process.env.ASANA_PAT;
  if (!pat) return res.status(500).json({ error: 'ASANA_PAT not set on server' });
  const asanaPath = req.params[0];
  const qs = new URLSearchParams(req.query).toString();
  const url = `https://app.asana.com/api/1.0/${asanaPath}${qs ? '?' + qs : ''}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Write-back proxy (mark complete/reopen, post comments, etc.) — same auth
// gate and PAT as the read proxy above; forwards the JSON body as-is.
async function asanaWriteProxy(req, res) {
  const pat = process.env.ASANA_PAT;
  if (!pat) return res.status(500).json({ error: 'ASANA_PAT not set on server' });
  const asanaPath = req.params[0];
  const url = `https://app.asana.com/api/1.0/${asanaPath}`;
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.put('/api/asana/*', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}, asanaWriteProxy);
app.post('/api/asana/*', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}, asanaWriteProxy);

// ── Static files (auth required) ────────────────────────────────────────────

app.use((req, res, next) => {
  // Always allow auth endpoints and static assets (css/js/icons)
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|png|svg|mp4|mp3|ico|woff|woff2|ttf)$/)) {
    return next();
  }
  if (!isAuthenticated(req)) {
    return res.sendFile(path.join(__dirname, 'dist/mobile/index.html'));
  }
  next();
});

app.use(express.static(path.join(__dirname, 'dist/mobile')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist/mobile/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
