const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'mm_session';

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
