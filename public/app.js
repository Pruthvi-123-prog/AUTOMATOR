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
const fillAllBtn = document.getElementById('fillAllBtn');

const progressModal = document.getElementById('progressModal');
const progressTitle = document.getElementById('progressTitle');
const progressTabs = document.getElementById('progressTabs');
const progressMeta = document.getElementById('progressMeta');
const progressList = document.getElementById('progressList');
const overallBar = document.getElementById('overallBar');
const overallText = document.getElementById('overallText');
const progressClose = document.getElementById('progressClose');
const progressStop = document.getElementById('progressStop');

let savedAccounts = {};
let currentCourses = [];

// Track multiple concurrent streams
let activeStreams = {}; // slug -> EventSource
let courseData = {}; // slug -> { title, metaText, totalLectures, progressState }
let activeTabSlug = null;

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

fillAllBtn?.addEventListener('click', () => {
  const incomplete = currentCourses.filter(c => (c.progress || 0) < 100);
  if (!incomplete.length) {
    alert("All courses are already completed!");
    return;
  }
  
  progressModal.classList.remove('hidden');
  progressModal.removeAttribute('hidden');
  progressModal.style.display = 'flex';
  
  incomplete.forEach(c => {
    startFill(c.slug, c.title);
  });
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
  stopAllStreams();
  progressModal.classList.add('hidden');
  progressModal.setAttribute('hidden', '');
  progressModal.style.display = 'none';
});

progressStop.addEventListener('click', () => {
  if (activeTabSlug) {
    stopStream(activeTabSlug);
    if (courseData[activeTabSlug]) {
      courseData[activeTabSlug].metaText = 'Stopped.';
    }
    renderTabs();
    renderProgress();
  }
});

function stopStream(slug) {
  if (activeStreams[slug]) {
    activeStreams[slug].close();
    delete activeStreams[slug];
  }
}

function stopAllStreams() {
  Object.keys(activeStreams).forEach(slug => stopStream(slug));
  activeStreams = {};
  courseData = {};
  activeTabSlug = null;
  if (progressTabs) progressTabs.innerHTML = '';
}

async function loadCourses() {
  courseList.innerHTML = '<div class="muted">Loading courses...</div>';
  try {
    const data = await api('/api/courses');
    currentCourses = data.courses || [];
    renderCourses(currentCourses);
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
    fillBtn.addEventListener('click', () => {
      progressModal.classList.remove('hidden');
      progressModal.removeAttribute('hidden');
      progressModal.style.display = 'flex';
      startFill(course.slug, course.title);
    });
    actions.appendChild(fillBtn);

    card.appendChild(title);
    card.appendChild(progressWrap);
    card.appendChild(actions);

    courseList.appendChild(card);
  });
}

function startFill(slug, title) {
  stopStream(slug);
  
  if (!activeTabSlug) {
    activeTabSlug = slug;
  }
  
  courseData[slug] = {
    title,
    metaText: 'Starting...',
    totalLectures: 0,
    progressState: {}
  };
  
  progressTitle.textContent = 'Filling courses';
  
  renderTabs();
  renderProgress();

  const source = new EventSource(`/api/lectures/complete?slug=${encodeURIComponent(slug)}`);
  activeStreams[slug] = source;

  source.addEventListener('status', (event) => {
    if (!courseData[slug]) return;
    const data = JSON.parse(event.data);
    courseData[slug].metaText = data.message || 'Working...';
    if (activeTabSlug === slug) renderProgress();
  });

  source.addEventListener('meta', (event) => {
    if (!courseData[slug]) return;
    const data = JSON.parse(event.data);
    courseData[slug].totalLectures = data.total || 0;
    const pending = data.pending != null ? data.pending : courseData[slug].totalLectures;
    courseData[slug].metaText = `${courseData[slug].totalLectures} lectures total — ${pending} to fill`;
    if (activeTabSlug === slug) renderProgress();
  });

  source.addEventListener('progress', (event) => {
    if (!courseData[slug]) return;
    const data = JSON.parse(event.data);
    const existing = courseData[slug].progressState[data.id] || { percent: 0, status: 'running' };
    const incomingPercent = Number(data.percent || 0);
    const status = data.status || 'running';

    const resolved = status === 'done'
      ? 100
      : Math.max(existing.percent, incomingPercent);
    const safePercent = Math.min(Math.max(resolved, 0), 100);

    courseData[slug].progressState[data.id] = { ...data, percent: safePercent, status };
    if (activeTabSlug === slug) {
      renderProgress();
    }
    updateDashboardFromProgress(slug);
  });

  source.addEventListener('done', () => {
    if (!courseData[slug]) return;
    
    const entries = Object.values(courseData[slug].progressState);
    const hasVtuError = entries.some(e => e.status === 'vtu_error');
    const totalCount = courseData[slug].totalLectures || entries.length;
    const totalPercent = entries.reduce((sum, item) => sum + (item.percent || 0), 0);
    const average = totalCount > 0 ? Math.round(totalPercent / totalCount) : 100;
    
    if (hasVtuError || average < 100) {
      courseData[slug].metaText = 'Completed with errors ⚠️';
      if (!hasVtuError) {
        const firstIncomplete = entries.find(e => (e.percent || 0) < 100);
        if (firstIncomplete) firstIncomplete.status = 'vtu_error';
      }
    } else {
      courseData[slug].metaText = 'All done! ✓';
    }
    
    stopStream(slug);
    renderTabs();
    if (activeTabSlug === slug) renderProgress();
    loadCourses(); // update dashboard
  });

  source.addEventListener('server-error', (event) => {
    if (!courseData[slug]) return;
    const data = JSON.parse(event.data || '{}');
    courseData[slug].metaText = data.message || 'Server error.';
    stopStream(slug);
    renderTabs();
    if (activeTabSlug === slug) renderProgress();
  });

  source.addEventListener('error', () => {
    if (!courseData[slug]) return;
    if (!activeStreams[slug]) return;
    courseData[slug].metaText = 'Connection lost. Please try again.';
    stopStream(slug);
    renderTabs();
    if (activeTabSlug === slug) renderProgress();
  });
}

function renderTabs() {
  if (!progressTabs) return;
  progressTabs.innerHTML = '';
  const slugs = Object.keys(courseData);
  if (slugs.length === 0) return;
  
  if (!slugs.includes(activeTabSlug)) {
    activeTabSlug = slugs[0];
  }
  
  slugs.forEach(slug => {
    const tab = document.createElement('div');
    tab.className = `modal-tab ${slug === activeTabSlug ? 'active' : ''}`;
    // Simple short title
    const shortTitle = courseData[slug].title.length > 25 
      ? courseData[slug].title.substring(0, 25) + '...'
      : courseData[slug].title;
      
    const isDone = !activeStreams[slug] && courseData[slug].metaText.includes('done');
    const isError = !activeStreams[slug] && (courseData[slug].metaText.includes('error') || courseData[slug].metaText.includes('lost') || courseData[slug].metaText.includes('errors'));
    
    let indicator = '';
    if (isDone) indicator = ' ✓';
    if (isError) indicator = ' ⚠️';
    
    tab.textContent = shortTitle + indicator;
    
    tab.addEventListener('click', () => {
      activeTabSlug = slug;
      renderTabs();
      renderProgress();
    });
    progressTabs.appendChild(tab);
  });
}

function updateDashboardFromProgress(slug) {
  const cd = courseData[slug];
  if (!cd) return;
  const entries = Object.values(cd.progressState);
  if (!entries.length) return;
  const totalCount = cd.totalLectures || entries.length;
  const totalPercent = entries.reduce((sum, item) => sum + (item.percent || 0), 0);
  const average = Math.round(totalPercent / totalCount);
  updateCourseCardProgress(slug, average);
}

function renderProgress() {
  if (!activeTabSlug || !courseData[activeTabSlug]) {
    progressMeta.textContent = 'No active course';
    overallBar.style.width = '0%';
    overallText.textContent = '0%';
    progressList.innerHTML = '';
    return;
  }
  
  const cd = courseData[activeTabSlug];
  progressMeta.textContent = cd.metaText;
  
  if (cd.metaText.includes('error') || cd.metaText.includes('expired') || cd.metaText.includes('lost')) {
    progressMeta.classList.add('error-text');
  } else {
    progressMeta.classList.remove('error-text');
  }
  
  const entries = Object.values(cd.progressState);
  if (!entries.length) {
    overallBar.style.width = '0%';
    overallText.textContent = '0%';
    progressList.innerHTML = '';
    return;
  }

  const totalCount = cd.totalLectures || entries.length;
  const totalPercent = entries.reduce((sum, item) => sum + (item.percent || 0), 0);
  const average = Math.round(totalPercent / totalCount);
  const cappedAvg = Math.min(average, 100);

  overallBar.style.width = `${cappedAvg}%`;
  overallText.textContent = `${cappedAvg}%`;

  progressList.innerHTML = '';
  
  const hasVtuError = entries.some(e => e.status === 'vtu_error');
  if (hasVtuError) {
    const warningNote = document.createElement('div');
    warningNote.className = 'error-text';
    warningNote.style.fontSize = '13px';
    warningNote.style.padding = '10px';
    warningNote.style.border = '1px solid #ff6b6b';
    warningNote.style.borderRadius = '4px';
    warningNote.style.marginBottom = '10px';
    warningNote.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
    warningNote.textContent = 'Note: VTU returned a server error for some lectures. This is not a script fault, it is a VTU side error. Please wait for VTU to update its website. The progress for affected lectures is stopped, but other valid IDs will continue filling.';
    progressList.appendChild(warningNote);
  }

  entries
    .sort((a, b) => a.id - b.id)
    .forEach((item) => {
      const row = document.createElement('div');
      row.className = 'progress-item';

      const label = document.createElement('div');
      let statusEmoji = '→';
      if (item.status === 'done') statusEmoji = '✓';
      else if (item.status === 'retry') statusEmoji = '↺';
      else if (item.status === 'vtu_error') statusEmoji = '⚠️';
      
      label.textContent = `Lecture ${item.id} ${statusEmoji} ${item.percent}%`;
      
      if (item.status === 'vtu_error') {
        label.classList.add('error-text');
        label.textContent += ' (VTU Server Error)';
      }

      const bar = document.createElement('div');
      bar.className = 'bar';

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${Math.min(item.percent || 0, 100)}%`;
      if (item.status === 'done' || item.status === 'vtu_error') fill.style.opacity = '0.6';
      if (item.status === 'vtu_error') fill.style.backgroundColor = '#ff6b6b';

      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);

      progressList.appendChild(row);
    });
}

checkSession();
