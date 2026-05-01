const { chromium } = require('playwright');
const axios = require('axios');

const BASE_URL = 'https://online.vtu.ac.in';

const CONFIG = {
  CHUNK_SECONDS: parseInt(process.env.CHUNK_SECONDS || '10', 10),
  DELAY_MS: parseInt(process.env.DELAY_MS || '250', 10),
  FINAL_DELAY: parseInt(process.env.FINAL_DELAY || '1200', 10),
  PARALLEL_LIMIT: parseInt(process.env.PARALLEL_LIMIT || '3', 10),
  HEADLESS: process.env.HEADLESS ? process.env.HEADLESS !== 'false' : false
};

function logSafe(logger, message) {
  if (typeof logger === 'function') {
    logger(message);
  }
}

function createClient(token, options = {}) {
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Cookie: `access_token=${token}`,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (typeof options.refreshToken === 'function') {
    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error?.response?.status;
        const original = error?.config;

        if (status === 401 && original && !original._retry) {
          original._retry = true;
          try {
            // Re-login using saved credentials and retry the original request
            const newToken = await options.refreshToken();
            client.defaults.headers.Cookie = `access_token=${newToken}`;
            client.defaults.headers.Authorization = `Bearer ${newToken}`;
            original.headers = original.headers || {};
            original.headers.Cookie = `access_token=${newToken}`;
            original.headers.Authorization = `Bearer ${newToken}`;
            return client.request(original);
          } catch (refreshErr) {
            // Re-login itself failed — surface this clearly
            return Promise.reject(new Error('__TOKEN_RELOGIN_FAILED__'));
          }
        }

        return Promise.reject(error);
      }
    );
  }

  return client;
}

async function loginAndGetToken(email, password, options = {}) {
  const logger = options.logger || console.log;
  const headless = options.headless ?? CONFIG.HEADLESS;

  logSafe(logger, 'Launching browser to authenticate...');
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    logSafe(logger, 'Opening VTU login page...');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });

    logSafe(logger, 'Entering credentials...');
    await page.fill('input[name="email"]', email);
    await page.fill('input[type="password"]', password);

    logSafe(logger, 'Submitting login form...');
    await page.click('button[type="submit"]');

    logSafe(logger, 'Waiting for redirect...');
    try {
      await page.waitForURL(/\/student\//, { timeout: 20000 });
    } catch {
      const currentUrl = page.url();
      if (!currentUrl.includes('/student/')) {
        throw new Error('Login failed — incorrect email or password.');
      }
    }

    const cookies = await context.cookies(BASE_URL);
    let token = cookies.find(c => c.name === 'access_token')?.value;

    if (!token) {
      logSafe(logger, 'Checking localStorage for token...');
      const data = await page.evaluate(() => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
      });
      token = data?.access_token;
    }

    if (!token) {
      throw new Error('Could not retrieve session token after login.');
    }

    logSafe(logger, 'Login successful — session token obtained.');
    await browser.close();
    return token;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function fetchCourses(client) {
  const res = await client.get('/api/v1/student/my-enrollments');
  return res.data.data.map(c => ({
    title: c.details.title,
    slug: c.details.slug,
    progress: parseFloat(c.progress_percent) || 0
  }));
}

function parseDuration(str) {
  if (!str) return 600;
  const normalized = String(str).toLowerCase().replace('mins', '').trim();
  const parts = normalized.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 600;
}

async function getLectures(client, slug) {
  const res = await client.get(`/api/v1/student/my-courses/${slug}`);
  const raw = res.data.data.lessons.flatMap(l => l.lectures || []);

  const ordered = raw
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const lectures = [];
  for (let i = 0; i < ordered.length; i++) {
    const id = ordered[i].id;
    try {
      const detail = await client.get(
        `/api/v1/student/my-courses/${slug}/lectures/${id}`
      );
      const lectureData = detail.data.data;
      const duration = parseDuration(lectureData.duration);

      // Get the actual current progress so we resume from the right position
      const currentSeconds = lectureData.current_time_seconds
        ? parseInt(lectureData.current_time_seconds, 10)
        : 0;
      const isCompleted = lectureData.is_completed === true
        || lectureData.percent >= 100;

      lectures.push({ id, duration, currentSeconds, isCompleted });
    } catch {
      lectures.push({ id, duration: 600, currentSeconds: 0, isCompleted: false });
    }
  }

  return lectures;
}

async function sendProgress(client, slug, id, current, watched, total) {
  const res = await client.post(
    `/api/v1/student/my-courses/${slug}/lectures/${id}/progress`,
    {
      current_time_seconds: current,
      total_duration_seconds: total,
      seconds_just_watched: watched
    }
  );
  return res.data;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function completeLecture(client, slug, id, duration, currentSeconds, onProgress, options = {}) {
  const abortSignal = options.abortSignal;

  // Resume from actual current position reported by the server
  let current = typeof currentSeconds === 'number' ? currentSeconds : 0;
  // Cap to avoid going past duration
  current = Math.min(current, duration);

  // Calculate real starting percent
  const startPercent = duration > 0 ? Math.round((current / duration) * 100) : 0;

  if (typeof onProgress === 'function') {
    onProgress({ id, percent: startPercent, status: 'start', current, total: duration });
  }

  while (current < duration) {
    if (abortSignal && abortSignal.aborted) {
      throw new Error('aborted');
    }

    const next = Math.min(current + CONFIG.CHUNK_SECONDS, duration);

    try {
      const data = await sendProgress(client, slug, id, next, next - current, duration);
      const percent = data?.data?.percent ?? Math.round((next / duration) * 100);
      const isDone = data?.data?.is_completed === true || percent >= 100;

      current = next;

      if (typeof onProgress === 'function') {
        onProgress({
          id,
          percent: Math.min(percent, 100),
          status: isDone ? 'done' : 'running',
          current,
          total: duration
        });
      }

      if (isDone) {
        return;
      }

      await delay(percent > 90 ? CONFIG.FINAL_DELAY : CONFIG.DELAY_MS);
    } catch (err) {
      // If re-login itself failed, propagate — nothing we can do
      if (err.message === '__TOKEN_RELOGIN_FAILED__') {
        throw new Error('Your session expired and re-login failed. Please log in again.');
      }
      // All other errors (network blips, timeouts) — retry the chunk
      if (typeof onProgress === 'function') {
        onProgress({ id, percent: Math.min(Math.round((current / duration) * 100), 100), status: 'retry', current, total: duration });
      }
      await delay(1500);
    }
  }

  // Ensure final done event
  if (typeof onProgress === 'function') {
    onProgress({ id, percent: 100, status: 'done', current: duration, total: duration });
  }
}

async function runParallel(tasks, limit) {
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= tasks.length) break;
      await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
}

module.exports = {
  BASE_URL,
  CONFIG,
  createClient,
  loginAndGetToken,
  fetchCourses,
  parseDuration,
  getLectures,
  sendProgress,
  completeLecture,
  runParallel
};