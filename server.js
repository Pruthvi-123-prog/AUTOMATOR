const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const {
  CONFIG,
  loginAndGetToken,
  createClient,
  fetchCourses,
  getLectures,
  completeLecture,
  runParallel
} = require('./automation');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, 'data');
const CREDS_PATH = path.join(DATA_DIR, 'credentials.json');

async function ensureCredentialStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(CREDS_PATH);
  } catch {
    await fs.writeFile(CREDS_PATH, JSON.stringify({ accounts: [] }, null, 2));
  }
}

async function loadAccounts() {
  await ensureCredentialStore();
  const raw = await fs.readFile(CREDS_PATH, 'utf8');
  const data = raw ? JSON.parse(raw) : {};
  if (!data.accounts || !Array.isArray(data.accounts)) {
    return [];
  }
  return data.accounts;
}

async function saveAccounts(accounts) {
  await ensureCredentialStore();
  await fs.writeFile(CREDS_PATH, JSON.stringify({ accounts }, null, 2));
}

function upsertAccount(accounts, email, password) {
  const normalized = email.toLowerCase();
  const existing = accounts.find((account) => account.email.toLowerCase() === normalized);
  const now = new Date().toISOString();

  if (existing) {
    existing.password = password;
    existing.lastUsed = now;
    return accounts;
  }

  accounts.push({
    id: crypto.randomUUID(),
    email,
    password,
    lastUsed: now
  });
  return accounts;
}

async function refreshSessionToken(req, onStatus) {
  const email = req.session.email;
  if (!email) {
    throw new Error('Your session has expired. Please log in again.');
  }

  const accounts = await loadAccounts();
  const account = accounts.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
  if (!account) {
    throw new Error('Saved credentials not found. Please log in again.');
  }

  if (typeof onStatus === 'function') {
    onStatus('Session expired — re-authenticating automatically...');
  }

  try {
    const token = await loginAndGetToken(account.email, account.password, {
      logger: (msg) => console.log(`[TOKEN REFRESH] ${msg}`),
      headless: CONFIG.HEADLESS
    });
    req.session.access_token = token;
    if (typeof onStatus === 'function') {
      onStatus('Re-authenticated successfully. Continuing...');
    }
    return token;
  } catch (err) {
    throw new Error(`Token refresh failed: ${err.message}`);
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax' }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/session', (req, res) => {
  res.json({
    loggedIn: Boolean(req.session.access_token),
    email: req.session.email || null
  });
});

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await loadAccounts();
    const safe = accounts.map(({ id, email, lastUsed }) => ({ id, email, lastUsed }));
    res.json({ success: true, accounts: safe });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load accounts' });
  }
});

app.post('/api/login', async (req, res) => {
  const useSaved = Boolean(req.body?.useSaved);
  const accountId = String(req.body?.accountId || '').trim();
  let email = String(req.body?.email || '').trim();
  let password = String(req.body?.password || '').trim();

  if (useSaved && accountId) {
    const accounts = await loadAccounts();
    const account = accounts.find((entry) => entry.id === accountId);
    if (!account) {
      return res.status(400).json({ success: false, error: 'Saved account not found.' });
    }
    email = account.email;
    password = account.password;
  }

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  try {
    const token = await loginAndGetToken(email, password, {
      logger: (msg) => console.log(`[LOGIN] ${msg}`),
      headless: CONFIG.HEADLESS
    });

    req.session.access_token = token;
    req.session.email = email;

    const accounts = await loadAccounts();
    const updated = upsertAccount(accounts, email, password);
    await saveAccounts(updated);
    const matched = updated.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
    req.session.accountId = matched ? matched.id : null;

    return res.json({ success: true });
  } catch (err) {
    const message = err.message || 'Login failed. Check your credentials and try again.';
    return res.status(401).json({ success: false, error: message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/courses', async (req, res) => {
  const token = req.session.access_token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }

  try {
    const client = createClient(token, {
      refreshToken: () => refreshSessionToken(req)
    });
    const courses = await fetchCourses(client);
    return res.json({ success: true, courses });
  } catch (err) {
    const message = err.message || 'Failed to fetch courses.';
    return res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/lectures/complete', async (req, res) => {
  const token = req.session.access_token;
  const slug = String(req.query.slug || '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }

  if (!slug) {
    return res.status(400).json({ error: 'Missing course slug.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const abortSignal = { aborted: false };
  req.on('close', () => {
    abortSignal.aborted = true;
  });

  const sendEvent = (event, payload) => {
    if (abortSignal.aborted) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const client = createClient(token, {
      refreshToken: () => refreshSessionToken(req, (msg) => sendEvent('status', { message: msg }))
    });

    // Notify client that we are loading lecture list
    sendEvent('status', { message: 'Loading lectures...' });

    const lectures = await getLectures(client, slug);

    // Filter out already fully completed lectures
    const pending = lectures.filter(l => !l.isCompleted);
    const alreadyDone = lectures.filter(l => l.isCompleted);

    // Report already-done lectures immediately so the UI shows their real progress
    for (const l of alreadyDone) {
      sendEvent('progress', { id: l.id, percent: 100, status: 'done', current: l.duration, total: l.duration });
    }

    sendEvent('meta', { total: lectures.length, slug, pending: pending.length });

    if (pending.length === 0) {
      sendEvent('done', { message: 'All lectures already completed.' });
      res.end();
      return;
    }

    const tasks = pending.map((lecture) => async () => {
      if (abortSignal.aborted) return;
      await completeLecture(
        client,
        slug,
        lecture.id,
        lecture.duration,
        lecture.currentSeconds,
        (payload) => sendEvent('progress', payload),
        { abortSignal }
      );
    });

    await runParallel(tasks, CONFIG.PARALLEL_LIMIT);
    sendEvent('done', { message: 'Completed' });
  } catch (err) {
    const message = err.message || 'An error occurred.';
    // Differentiate token errors from general errors
    const isTokenError = message.includes('Session expired') || message.includes('Token refresh');
    sendEvent('server-error', {
      message: isTokenError
        ? 'Your session expired. Please close this and log in again.'
        : message,
      code: isTokenError ? 'TOKEN_EXPIRED' : 'GENERIC'
    });
  } finally {
    res.end();
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅  VTU Automator running at http://127.0.0.1:${PORT}\n`);
  console.log('   Open the URL above in your browser to get started.\n');
});

module.exports = { app, server };
