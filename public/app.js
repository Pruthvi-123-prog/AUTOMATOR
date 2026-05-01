const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const loginError = document.getElementById('loginError');
const savedAccountsContainer = document.getElementById('savedAccounts');
const savedAccountsEmpty = document.getElementById('savedAccountsEmpty');
const useNewAccount = document.getElementById('useNewAccount');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const emailInput = document.getElementById('email');
const userEmail = document.getElementById('userEmail');
const courseList = document.getElementById('courseList');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');

const progressModal = document.getElementById('progressModal');
const progressTitle = document.getElementById('progressTitle');
const progressMeta = document.getElementById('progressMeta');
const progressList = document.getElementById('progressList');
const overallBar = document.getElementById('overallBar');
const overallText = document.getElementById('overallText');
const progressClose = document.getElementById('progressClose');
const progressStop = document.getElementById('progressStop');

let activeStream = null;
let progressState = {};
let totalLectures = 0;
let savedAccounts = {};

// Track per-course live progress so dashboard cards update in real time
let liveSlug = null;
let liveCourseDonePercent = null;

function showLogin() {
  loginView.classList.remove('hidden');
  loginView.removeAttribute('hidden');
  loginView.style.display = 'flex';
  dashboardView.classList.add('hidden');
  dashboardView.setAttribute('hidden', '');
  dashboardView.style.display = 'none';
}

function showDashboard(email) {
  loginView.classList.add('hidden');
  loginView.setAttribute('hidden', '');
  loginView.style.display = 'none';
  dashboardView.classList.remove('hidden');
  dashboardView.removeAttribute('hidden');
  dashboardView.style.display = 'flex';
  userEmail.textContent = email || '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || 'Request failed';
    throw new Error(message);
  }
  return data;
}

async function checkSession() {
  try {
    const data = await api('/api/session');
    if (data.loggedIn) {
      showDashboard(data.email);
      await loadCourses();
    } else {
      showLogin();
      await loadAccounts();
    }
  } catch {
    showLogin();
    await loadAccounts();
  }
}

async function loadAccounts() {
  try {
    const data = await api('/api/accounts');
    savedAccounts = {};
    savedAccountsContainer.innerHTML = '';
    const accounts = data.accounts || [];

    accounts.forEach((account) => {
      savedAccounts[account.id] = account;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ghost account-btn';
      button.innerHTML = `
        <div>${account.email}</div>
        <div class="muted small">Last used: ${account.lastUsed ? new Date(account.lastUsed).toLocaleString() : 'unknown'}</div>
      `;
      button.addEventListener('click', () => loginSavedAccount(account.id));
      savedAccountsContainer.appendChild(button);
    });

    if (accounts.length) {
      savedAccountsEmpty.classList.add('hidden');
    } else {
      savedAccountsEmpty.classList.remove('hidden');
    }
  } catch {
    savedAccountsContainer.innerHTML = '';
    savedAccountsEmpty.classList.remove('hidden');
  }
}

async function loginSavedAccount(accountId) {
  const account = savedAccounts[accountId];
  if (!account) return;

  loginError.classList.add('hidden');
  loginStatus.textContent = `Logging in as ${account.email}...`;

  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ accountId, useSaved: true })
    });
    loginStatus.textContent = '';
    showDashboard(account.email);
    await loadCourses();
  } catch (err) {
    loginStatus.textContent = '';
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.classList.add('hidden');
  loginStatus.textContent = 'Logging in... this may take a few seconds.';

  const formData = new FormData(loginForm);
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    loginStatus.textContent = '';
    showDashboard(email);
    await loadCourses();
  } catch (err) {
    loginStatus.textContent = '';
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

refreshBtn.addEventListener('click', () => {
  loadCourses();
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    showLogin();
    await loadAccounts();
  }
});

useNewAccount.addEventListener('click', () => {
  emailInput.value = '';
  passwordInput.value = '';
  passwordInput.disabled = false;
  passwordInput.type = 'password';
  passwordInput.placeholder = 'password';
  togglePassword.textContent = 'Show';
  emailInput.focus();
});

togglePassword.addEventListener('click', () => {
  if (passwordInput.disabled) return;
  const nextType = passwordInput.type === 'password' ? 'text' : 'password';
  passwordInput.type = nextType;
  togglePassword.textContent = nextType === 'password' ? 'Show' : 'Hide';
});

progressClose.addEventListener('click', () => {
  stopStream();
  progressModal.classList.add('hidden');
  progressModal.setAttribute('hidden', '');
  progressModal.style.display = 'none';
});

progressStop.addEventListener('click', () => {
  stopStream();
  progressMeta.textContent = 'Stopped.';
});

function stopStream() {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
}

async function loadCourses() {
  courseList.innerHTML = '<div class="muted">Loading courses...</div>';
  try {
    const data = await api('/api/courses');
    renderCourses(data.courses || []);
  } catch (err) {
    courseList.innerHTML = `<div class="muted">${err.message}</div>`;
  }
}

// Live update a single course card's progress bar without re-rendering everything
function updateCourseCardProgress(slug, percent) {
  const card = courseList.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
  if (!card) return;
  const fill = card.querySelector('.bar-fill');
  const label = card.querySelector('.progress-pct');
  if (fill) fill.style.width = `${Math.min(percent, 100)}%`;
  if (label) label.textContent = `${Math.min(Math.round(percent), 100)}%`;
}

function renderCourses(courses) {
  courseList.innerHTML = '';
  if (!courses.length) {
    courseList.innerHTML = '<div class="muted">No courses found.</div>';
    return;
  }

  courses.forEach((course) => {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.dataset.slug = course.slug;

    const title = document.createElement('div');
    title.className = 'course-title';
    title.textContent = course.title;

    const progressWrap = document.createElement('div');
    progressWrap.className = 'progress-wrap';

    const bar = document.createElement('div');
    bar.className = 'bar';

    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    const pct = Math.min(course.progress || 0, 100);
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const percent = document.createElement('div');
    percent.className = 'muted progress-pct';
    percent.textContent = `${Math.round(pct)}%`;

    progressWrap.appendChild(bar);
    progressWrap.appendChild(percent);

    const actions = document.createElement('div');
    const fillBtn = document.createElement('button');
    fillBtn.className = 'btn primary';
    fillBtn.textContent = pct >= 100 ? 'Completed ✓' : 'Fill';
    if (pct >= 100) {
      fillBtn.disabled = true;
      fillBtn.classList.add('done');
    }
    fillBtn.addEventListener('click', () => startFill(course.slug, course.title));
    actions.appendChild(fillBtn);

    card.appendChild(title);
    card.appendChild(progressWrap);
    card.appendChild(actions);

    courseList.appendChild(card);
  });
}

function startFill(slug, title) {
  stopStream();
  progressState = {};
  totalLectures = 0;
  liveSlug = slug;
  liveCourseDonePercent = null;
  progressList.innerHTML = '';
  overallBar.style.width = '0%';
  overallText.textContent = '0%';
  progressMeta.textContent = 'Starting...';
  progressTitle.textContent = `Filling: ${title}`;
  progressModal.classList.remove('hidden');
  progressModal.removeAttribute('hidden');
  progressModal.style.display = 'flex';

  const source = new EventSource(`/api/lectures/complete?slug=${encodeURIComponent(slug)}`);
  activeStream = source;

  source.addEventListener('status', (event) => {
    const data = JSON.parse(event.data);
    progressMeta.textContent = data.message || 'Working...';
  });

  source.addEventListener('meta', (event) => {
    const data = JSON.parse(event.data);
    totalLectures = data.total || 0;
    const pending = data.pending != null ? data.pending : totalLectures;
    progressMeta.textContent = `${totalLectures} lectures total — ${pending} to fill`;
  });

  source.addEventListener('progress', (event) => {
    const data = JSON.parse(event.data);
    const existing = progressState[data.id] || { percent: 0, status: 'running' };
    const incomingPercent = Number(data.percent || 0);
    const status = data.status || 'running';

    // Always allow increasing percent; if status is done, lock to 100
    const resolved = status === 'done'
      ? 100
      : Math.max(existing.percent, incomingPercent);
    const safePercent = Math.min(Math.max(resolved, 0), 100);

    progressState[data.id] = { ...data, percent: safePercent, status };
    renderProgress();
    // Live-update the dashboard card
    updateDashboardFromProgress();
  });

  source.addEventListener('done', () => {
    progressMeta.textContent = 'All done! ✓';
    stopStream();
    liveSlug = null;
    // Reload courses to get fresh server-side percentages
    loadCourses();
  });

  source.addEventListener('server-error', (event) => {
    const data = JSON.parse(event.data || '{}');
    progressMeta.textContent = data.message || 'Server error.';
    if (data.code === 'TOKEN_EXPIRED') {
      progressMeta.classList.add('error-text');
    }
    stopStream();
  });

  source.addEventListener('error', () => {
    if (!activeStream) return;
    progressMeta.textContent = 'Connection lost. Please try again.';
    stopStream();
  });
}

// Compute average percent from live progress and update dashboard card
function updateDashboardFromProgress() {
  if (!liveSlug) return;
  const entries = Object.values(progressState);
  if (!entries.length) return;
  const totalCount = totalLectures || entries.length;
  const totalPercent = entries.reduce((sum, item) => sum + (item.percent || 0), 0);
  const average = Math.round(totalPercent / totalCount);
  updateCourseCardProgress(liveSlug, average);
}

function renderProgress() {
  const entries = Object.values(progressState);
  if (!entries.length) return;

  const totalCount = totalLectures || entries.length;
  const totalPercent = entries.reduce((sum, item) => sum + (item.percent || 0), 0);
  const average = Math.round(totalPercent / totalCount);
  const cappedAvg = Math.min(average, 100);

  overallBar.style.width = `${cappedAvg}%`;
  overallText.textContent = `${cappedAvg}%`;

  progressList.innerHTML = '';
  entries
    .sort((a, b) => a.id - b.id)
    .forEach((item) => {
      const row = document.createElement('div');
      row.className = 'progress-item';

      const label = document.createElement('div');
      const statusEmoji = item.status === 'done' ? '✓' : item.status === 'retry' ? '↺' : '→';
      label.textContent = `Lecture ${item.id} ${statusEmoji} ${item.percent}%`;

      const bar = document.createElement('div');
      bar.className = 'bar';

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${Math.min(item.percent || 0, 100)}%`;
      if (item.status === 'done') fill.style.opacity = '0.6';

      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);

      progressList.appendChild(row);
    });
}

checkSession();
