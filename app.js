/* =========================================================
   STATE & PERSISTENCE
   ========================================================= */
const STORAGE_KEY = 'jp_shift_manager_v1';

const DEFAULT_SETTINGS = {
  currency: '¥',
  defaultWage: 1200,
  defaultBreak: 60,
  regularHours: 8,
  overtimeEnabled: true,
  overtimeMultiplier: 1.25,
  includeTransport: true,
  monthlyGoal: 150000,
  theme: 'light'
};

const JOB_COLORS = ['#4f46e5', '#f472b6', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

const DEFAULT_JOBS = [
  { id: 'j1', name: 'Restaurant', company: 'Sakura Dining', wage: 1200, transport: 500, color: '#f472b6', notes: 'Evening shifts' },
  { id: 'j2', name: 'Convenience Store', company: 'Lawson #2041', wage: 1100, transport: 300, color: '#4f46e5', notes: 'Morning shifts' }
];

function generateDefaultShifts() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const shifts = [];
  const templates = [
    { jobId: 'j1', dayOffset: 2, start: '17:00', end: '22:00', brk: 60 },
    { jobId: 'j2', dayOffset: 4, start: '06:00', end: '13:00', brk: 60 },
    { jobId: 'j1', dayOffset: 6, start: '17:00', end: '23:00', brk: 60 },
    { jobId: 'j2', dayOffset: 9, start: '06:00', end: '12:00', brk: 60 },
    { jobId: 'j1', dayOffset: 12, start: '18:00', end: '23:00', brk: 60 },
    { jobId: 'j2', dayOffset: -3, start: '06:00', end: '14:00', brk: 60 },
    { jobId: 'j1', dayOffset: -6, start: '17:00', end: '22:00', brk: 60 },
    { jobId: 'j2', dayOffset: -10, start: '07:00', end: '13:00', brk: 60 }
  ];
  templates.forEach((t, i) => {
    const d = new Date(y, m, today.getDate() + t.dayOffset);
    const job = DEFAULT_JOBS.find(j => j.id === t.jobId);
    const dateStr = d.toISOString().slice(0, 10);
    shifts.push({
      id: 's' + (i+1),
      jobId: t.jobId,
      date: dateStr,
      start: t.start,
      end: t.end,
      break: t.brk,
      wage: job.wage,
      transport: job.transport,
      notes: ''
    });
  });
  return shifts;
}

let state = {
  jobs: [],
  shifts: [],
  settings: { ...DEFAULT_SETTINGS }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.jobs = parsed.jobs || [];
      state.shifts = parsed.shifts || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
    } else {
      state.jobs = JSON.parse(JSON.stringify(DEFAULT_JOBS));
      state.shifts = generateDefaultShifts();
      state.settings = { ...DEFAULT_SETTINGS };
      saveState();
    }
  } catch (e) {
    console.error('Load failed', e);
    state.jobs = JSON.parse(JSON.stringify(DEFAULT_JOBS));
    state.shifts = generateDefaultShifts();
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* =========================================================
   UTILS
   ========================================================= */
function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }

function fmtCurrency(n) {
  const c = state.settings.currency;
  const num = Math.round(n);
  if (c === '¥') return '¥' + num.toLocaleString();
  return c + num.toLocaleString();
}

function fmtHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcShift(shift) {
  const startMin = timeToMinutes(shift.start);
  let endMin = timeToMinutes(shift.end);
  if (endMin <= startMin) endMin += 24 * 60; // overnight
  const breakMin = Number(shift.break) || 0;
  const workMin = Math.max(0, endMin - startMin - breakMin);
  const workHours = workMin / 60;

  const s = state.settings;
  let regularHours = workHours;
  let overtimeHours = 0;
  if (s.overtimeEnabled && workHours > s.regularHours) {
    regularHours = s.regularHours;
    overtimeHours = workHours - s.regularHours;
  }
  const wage = Number(shift.wage) || 0;
  const regularPay = regularHours * wage;
  const overtimePay = overtimeHours * wage * (s.overtimeMultiplier || 1);
  const baseSalary = regularPay + overtimePay;
  const transport = s.includeTransport ? (Number(shift.transport) || 0) : 0;
  const total = baseSalary + transport;

  return {
    workHours,
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    baseSalary,
    transport,
    total
  };
}

function getJob(id) { return state.jobs.find(j => j.id === id); }

function getMonthShifts(year, month) {
  return state.shifts.filter(sh => {
    const d = new Date(sh.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function isToday(dateStr) {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isUpcoming(dateStr) {
  const d = new Date(dateStr + 'T23:59:59');
  return d >= new Date();
}

/* =========================================================
   NAVIGATION
   ========================================================= */
const pageMeta = {
  dashboard: { title: 'Dashboard', sub: 'Overview of your work and earnings' },
  calendar: { title: 'Calendar', sub: 'Monthly schedule at a glance' },
  shifts: { title: 'Shifts', sub: 'Manage all your work shifts' },
  jobs: { title: 'Jobs', sub: 'Your workplaces' },
  salary: { title: 'Salary', sub: 'Detailed earnings breakdown' },
  analytics: { title: 'Analytics', sub: 'Insights and statistics' },
  transport: { title: 'Transportation', sub: 'Track commuting expenses' },
  settings: { title: 'Settings', sub: 'Customize your experience' }
};

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.mobile-nav button').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const meta = pageMeta[page];
  document.getElementById('pageTitle').textContent = meta.title;
  document.getElementById('pageSub').textContent = meta.sub;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');

  renderPage(page);
}

function renderPage(page) {
  switch(page) {
    case 'dashboard': renderDashboard(); break;
    case 'calendar': renderCalendar(); break;
    case 'shifts': renderShifts(); break;
    case 'jobs': renderJobs(); break;
    case 'salary': renderSalary(); break;
    case 'analytics': renderAnalytics(); break;
    case 'transport': renderTransport(); break;
    case 'settings': renderSettings(); break;
  }
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard() {
  const now = new Date();
  const monthShifts = getMonthShifts(now.getFullYear(), now.getMonth());

  let totalHours = 0, totalEarnings = 0, totalTransport = 0, totalShifts = monthShifts.length;
  monthShifts.forEach(sh => {
    const c = calcShift(sh);
    totalHours += c.workHours;
    totalEarnings += c.total;
    totalTransport += c.transport;
  });
  const avgDaily = totalShifts > 0 ? totalEarnings / totalShifts : 0;

  const stats = [
    { label: 'Expected Monthly Salary', value: fmtCurrency(totalEarnings), icon: 'wallet-outline', color: 'var(--primary)', bg: 'var(--primary-soft)', delta: null },
    { label: 'Total Working Hours', value: fmtHours(totalHours), icon: 'time-outline', color: 'var(--accent)', bg: 'var(--accent-soft)', delta: null },
    { label: 'Total Shifts', value: totalShifts, icon: 'briefcase-outline', color: 'var(--success)', bg: 'var(--success-soft)', delta: null },
    { label: 'Avg Daily Income', value: fmtCurrency(avgDaily), icon: 'trending-up-outline', color: 'var(--warning)', bg: 'var(--warning-soft)', delta: null }
  ];

  document.getElementById('statsGrid').innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-icon" style="background:${s.bg}; color:${s.color};">
        <ion-icon name="${s.icon}"></ion-icon>
      </div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
    </div>
  `).join('');

  // Goal progress
  const goal = state.settings.monthlyGoal || 0;
  const pct = goal > 0 ? Math.min(100, (totalEarnings / goal) * 100) : 0;
  const remaining = Math.max(0, goal - totalEarnings);
  document.getElementById('goalBadge').textContent = pct.toFixed(0) + '%';
  document.getElementById('goalContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
      <div>
        <div style="font-size:24px; font-weight:700;">${fmtCurrency(totalEarnings)}</div>
        <div style="font-size:12px; color:var(--text-muted);">of ${fmtCurrency(goal)} goal</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px; color:var(--text-muted);">Remaining</div>
        <div style="font-size:16px; font-weight:600; color:var(--primary);">${fmtCurrency(remaining)}</div>
      </div>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-labels">
        <span>${pct.toFixed(0)}% complete</span>
        <span>${totalHours > 0 ? fmtHours(remaining / (totalEarnings / totalHours)) + ' more needed' : '—'}</span>
      </div>
    </div>
  `;

  // Upcoming shifts
  const upcoming = state.shifts
    .filter(sh => isUpcoming(sh.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 5);
  const upEl = document.getElementById('upcomingList');
  if (upcoming.length === 0) {
    upEl.innerHTML = `<div class="empty" style="padding:20px;"><ion-icon name="calendar-clear-outline"></ion-icon><div class="empty-sub">No upcoming shifts</div></div>`;
  } else {
    upEl.innerHTML = upcoming.map(sh => {
      const job = getJob(sh.jobId);
      const d = new Date(sh.date);
      const c = calcShift(sh);
      return `
        <div class="list-item">
          <div class="job-dot" style="background:${job?.color || '#888'}"></div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:13px;">${job?.name || 'Unknown'}</div>
            <div style="font-size:11px; color:var(--text-muted);">${d.toLocaleDateString('en-US', { month:'short', day:'numeric', weekday:'short' })} • ${sh.start}–${sh.end}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700; font-size:13px; color:var(--success);">${fmtCurrency(c.total)}</div>
            <div style="font-size:10px; color:var(--text-muted);">${fmtHours(c.workHours)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Insights
  renderInsights();

  // Breakdown chart
  drawBreakdownChart();
}

function renderInsights() {
  const now = new Date();
  const thisMonth = getMonthShifts(now.getFullYear(), now.getMonth());
  const lastMonth = getMonthShifts(now.getFullYear(), now.getMonth() - 1);
  const insights = [];

  // Compare to last month
  const thisEarnings = thisMonth.reduce((s, sh) => s + calcShift(sh).total, 0);
  const lastEarnings = lastMonth.reduce((s, sh) => s + calcShift(sh).total, 0);
  if (lastEarnings > 0) {
    const pct = ((thisEarnings - lastEarnings) / lastEarnings * 100).toFixed(0);
    const up = thisEarnings >= lastEarnings;
    insights.push({
      icon: up ? 'trending-up-outline' : 'trending-down-outline',
      color: up ? 'var(--success)' : 'var(--danger)',
      bg: up ? 'var(--success-soft)' : 'var(--danger-soft)',
      text: `You're earning ${up ? '+' : ''}${pct}% ${up ? 'more' : 'less'} than last month.`,
      sub: `${fmtCurrency(thisEarnings)} vs ${fmtCurrency(lastEarnings)}`
    });
  }

  // This week shifts
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekShifts = state.shifts.filter(sh => {
    const d = new Date(sh.date);
    return d >= weekStart && d < weekEnd;
  });
  if (weekShifts.length > 0) {
    insights.push({
      icon: 'calendar-outline',
      color: 'var(--primary)',
      bg: 'var(--primary-soft)',
      text: `You have ${weekShifts.length} shift${weekShifts.length > 1 ? 's' : ''} this week.`,
      sub: `${fmtHours(weekShifts.reduce((s, sh) => s + calcShift(sh).workHours, 0))} total`
    });
  }

  // Goal remaining
  const goal = state.settings.monthlyGoal;
  const remaining = goal - thisEarnings;
  if (remaining > 0) {
    insights.push({
      icon: 'flag-outline',
      color: 'var(--warning)',
      bg: 'var(--warning-soft)',
      text: `Only ${fmtCurrency(remaining)} remains to reach your monthly goal.`,
      sub: `Keep going!`
    });
  } else if (thisEarnings > 0) {
    insights.push({
      icon: 'trophy-outline',
      color: 'var(--success)',
      bg: 'var(--success-soft)',
      text: `You've exceeded your monthly goal by ${fmtCurrency(-remaining)}!`,
      sub: `Great work this month`
    });
  }

  // Busiest day
  if (thisMonth.length > 0) {
    const dayCounts = [0,0,0,0,0,0,0];
    thisMonth.forEach(sh => dayCounts[new Date(sh.date).getDay()]++);
    const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (dayCounts[maxDay] > 0) {
      insights.push({
        icon: 'flash-outline',
        color: 'var(--accent)',
        bg: 'var(--accent-soft)',
        text: `${dayNames[maxDay]} is your busiest workday.`,
        sub: `${dayCounts[maxDay]} shifts this month`
      });
    }
  }

  const el = document.getElementById('insightsList');
  if (insights.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-sub">Add shifts to see insights</div></div>`;
  } else {
    el.innerHTML = insights.map(i => `
      <div class="insight">
        <div class="insight-icon" style="background:${i.bg}; color:${i.color};">
          <ion-icon name="${i.icon}"></ion-icon>
        </div>
        <div>
          <div class="insight-text">${i.text}</div>
          <div class="insight-sub">${i.sub}</div>
        </div>
      </div>
    `).join('');
  }
}

function drawBreakdownChart() {
  const canvas = document.getElementById('dashBreakdownChart');
  if (!canvas) return;
  const now = new Date();
  const monthShifts = getMonthShifts(now.getFullYear(), now.getMonth());

  const byJob = {};
  monthShifts.forEach(sh => {
    const job = getJob(sh.jobId);
    const name = job?.name || 'Unknown';
    const c = calcShift(sh);
    byJob[name] = (byJob[name] || 0) + c.baseSalary;
  });

  const data = Object.entries(byJob).map(([name, value]) => ({ name, value }));
  drawDonut(canvas, data);
}

/* =========================================================
   CALENDAR
   ========================================================= */
let calDate = new Date();

function renderCalendar() {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const shifts = getMonthShifts(y, m);
  const byDate = {};
  shifts.forEach(sh => {
    const d = new Date(sh.date).getDate();
    byDate[d] = byDate[d] || [];
    byDate[d].push(sh);
  });

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    html += `<div class="cal-day other"><div class="cal-day-num">${prevDays - i}</div></div>`;
  }

  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isT = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    const dayShifts = byDate[d] || [];
    const hasShift = dayShifts.length > 0;
    const totalEarn = dayShifts.reduce((s, sh) => s + calcShift(sh).total, 0);

    let cls = 'cal-day';
    if (isT) cls += ' today';
    if (hasShift) cls += ' has-shift';

    const chips = dayShifts.slice(0, 2).map(sh => {
      const job = getJob(sh.jobId);
      return `<div class="cal-shift-chip" style="background:${job?.color || '#888'}">${job?.name || 'Work'}</div>`;
    }).join('');
    const more = dayShifts.length > 2 ? `<div class="cal-shift-chip" style="background:var(--text-soft)">+${dayShifts.length - 2}</div>` : '';

    html += `
      <div class="${cls}" data-date="${dateStr}">
        <div class="cal-day-num">${d}</div>
        <div class="cal-shifts">${chips}${more}</div>
        ${hasShift ? `<div style="font-size:10px; color:var(--success); font-weight:600; margin-top:auto;">${fmtCurrency(totalEarn)}</div>` : ''}
      </div>
    `;
  }

  // Next month padding
  const totalCells = startDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="cal-day other"><div class="cal-day-num">${i}</div></div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  // Click handlers
  document.querySelectorAll('.cal-day:not(.other)').forEach(el => {
    el.addEventListener('click', () => {
      openShiftModal(null, el.dataset.date);
    });
  });
}

/* =========================================================
   SHIFTS
   ========================================================= */
let shiftFilter = 'all';

function renderShifts() {
  let list = [...state.shifts];
  const todayStr = new Date().toISOString().slice(0, 10);
  if (shiftFilter === 'upcoming') list = list.filter(sh => sh.date >= todayStr);
  else if (shiftFilter === 'past') list = list.filter(sh => sh.date < todayStr);
  list.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));

  const el = document.getElementById('shiftList');
  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty">
        <ion-icon name="briefcase-outline"></ion-icon>
        <div class="empty-title">No shifts yet</div>
        <div class="empty-sub">Add your first shift to get started</div>
      </div>
    `;
    return;
  }

  el.innerHTML = list.map(sh => {
    const job = getJob(sh.jobId);
    const d = new Date(sh.date);
    const c = calcShift(sh);
    return `
      <div class="shift-row">
        <div class="shift-date">
          ${d.toLocaleDateString('en-US', { month:'short', day:'numeric' })}
          <small>${d.toLocaleDateString('en-US', { weekday:'short' })}</small>
        </div>
        <div class="shift-job">
          <div class="job-dot" style="background:${job?.color || '#888'}"></div>
          <div>
            <div>${job?.name || 'Unknown'}</div>
            <div class="shift-meta">${sh.start} – ${sh.end} • ${fmtHours(c.workHours)}</div>
          </div>
        </div>
        <div>
          <div class="shift-meta">Wage</div>
          <div style="font-weight:600; font-size:13px;">${fmtCurrency(sh.wage)}/h</div>
        </div>
        <div>
          <div class="shift-meta">Transport</div>
          <div style="font-weight:600; font-size:13px;">${fmtCurrency(sh.transport)}</div>
        </div>
        <div class="shift-earn">${fmtCurrency(c.total)}</div>
        <div class="shift-actions">
          <button title="Duplicate" data-dup="${sh.id}"><ion-icon name="copy-outline"></ion-icon></button>
          <button title="Edit" data-edit="${sh.id}"><ion-icon name="create-outline"></ion-icon></button>
          <button class="del" title="Delete" data-del="${sh.id}"><ion-icon name="trash-outline"></ion-icon></button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openShiftModal(b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Delete this shift?')) {
      state.shifts = state.shifts.filter(s => s.id !== b.dataset.del);
      saveState();
      renderShifts();
    }
  }));
  el.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => {
    const orig = state.shifts.find(s => s.id === b.dataset.dup);
    if (orig) {
      const copy = { ...orig, id: uid() };
      state.shifts.push(copy);
      saveState();
      renderShifts();
    }
  }));
}

/* =========================================================
   JOBS
   ========================================================= */
function renderJobs() {
  const el = document.getElementById('jobsList');
  if (state.jobs.length === 0) {
    el.innerHTML = `
      <div class="empty" style="grid-column: 1/-1;">
        <ion-icon name="business-outline"></ion-icon>
        <div class="empty-title">No jobs yet</div>
        <div class="empty-sub">Add your first workplace</div>
      </div>
    `;
    return;
  }
  el.innerHTML = state.jobs.map(j => {
    const shiftsCount = state.shifts.filter(s => s.jobId === j.id).length;
    const earnings = state.shifts.filter(s => s.jobId === j.id).reduce((sum, s) => sum + calcShift(s).total, 0);
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
          <div style="display:flex; gap:12px; align-items:center;">
            <div style="width:42px; height:42px; border-radius:12px; background:${j.color}22; display:grid; place-items: center;">
              <div style="width:16px; height:16px; border-radius:50%; background:${j.color}"></div>
            </div>
            <div>
              <div style="font-weight:700; font-size:15px;">${escapeHtml(j.name)}</div>
              <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(j.company || '—')}</div>
            </div>
          </div>
          <div style="display:flex; gap:4px;">
            <button class="icon-btn" data-edit-job="${j.id}"><ion-icon name="create-outline"></ion-icon></button>
            <button class="icon-btn" data-del-job="${j.id}"><ion-icon name="trash-outline"></ion-icon></button>
          </div>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
          <div style="padding:10px; background:var(--bg-soft); border-radius:10px;">
            <div style="font-size:11px; color:var(--text-muted);">Hourly Wage</div>
            <div style="font-weight:700; font-size:14px;">${fmtCurrency(j.wage)}</div>
          </div>
          <div style="padding:10px; background:var(--bg-soft); border-radius:10px;">
            <div style="font-size:11px; color:var(--text-muted);">Transport</div>
            <div style="font-weight:700; font-size:14px;">${fmtCurrency(j.transport)}</div>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:1px solid var(--border);">
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Shifts</div>
            <div style="font-weight:600; font-size:13px;">${shiftsCount}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--text-muted);">Total Earned</div>
            <div style="font-weight:700; font-size:14px; color:var(--success);">${fmtCurrency(earnings)}</div>
          </div>
        </div>
        ${j.notes ? `<div style="margin-top:10px; font-size:12px; color:var(--text-muted); font-style:italic;">${escapeHtml(j.notes)}</div>` : ''}
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-edit-job]').forEach(b => b.addEventListener('click', () => openJobModal(b.dataset.editJob)));
  el.querySelectorAll('[data-del-job]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Delete this job? Associated shifts will remain but show as unknown.')) {
      state.jobs = state.jobs.filter(j => j.id !== b.dataset.delJob);
      saveState();
      renderJobs();
    }
  }));
}

/* =========================================================
   SALARY
   ========================================================= */
function renderSalary() {
  const now = new Date();
  const monthShifts = getMonthShifts(now.getFullYear(), now.getMonth());

  let regular = 0, overtime = 0, transport = 0, total = 0, hours = 0;
  monthShifts.forEach(sh => {
    const c = calcShift(sh);
    regular += c.regularPay;
    overtime += c.overtimePay;
    transport += c.transport;
    total += c.total;
    hours += c.workHours;
  });

  // Weekly
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekTotal = state.shifts.filter(sh => {
    const d = new Date(sh.date);
    return d >= weekStart && d < weekEnd;
  }).reduce((s, sh) => s + calcShift(sh).total, 0);

  // Yearly estimate
  const yearlyEstimate = total * 12;

  const stats = [
    { label: 'This Week', value: fmtCurrency(weekTotal), icon: 'calendar-outline', color: 'var(--primary)', bg: 'var(--primary-soft)' },
    { label: 'This Month', value: fmtCurrency(total), icon: 'wallet-outline', color: 'var(--success)', bg: 'var(--success-soft)' },
    { label: 'Yearly Estimate', value: fmtCurrency(yearlyEstimate), icon: 'trending-up-outline', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    { label: 'Hours Worked', value: fmtHours(hours), icon: 'time-outline', color: 'var(--warning)', bg: 'var(--warning-soft)' }
  ];

  document.getElementById('salaryStats').innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-icon" style="background:${s.bg}; color:${s.color};">
        <ion-icon name="${s.icon}"></ion-icon>
      </div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
    </div>
  `).join('');

  // Breakdown
  const rows = [
    { label: 'Regular Pay', value: regular, color: 'var(--primary)' },
    { label: 'Overtime Pay', value: overtime, color: 'var(--accent)' },
    { label: 'Transportation', value: transport, color: 'var(--warning)' },
    { label: 'Total Expected', value: total, color: 'var(--success)', bold: true }
  ];

  document.getElementById('salaryBreakdown').innerHTML = rows.map(r => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px solid var(--border);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:8px; height:8px; border-radius:50%; background:${r.color};"></div>
        <div style="font-size:13px; font-weight:${r.bold ? 700 : 500};">${r.label}</div>
      </div>
      <div style="font-size:${r.bold ? 18 : 14}px; font-weight:${r.bold ? 700 : 600}; color:${r.color};">${fmtCurrency(r.value)}</div>
    </div>
  `).join('');
}

/* =========================================================
   ANALYTICS
   ========================================================= */
function renderAnalytics() {
  drawWeeklyIncomeChart();
  drawHoursChart();
  drawJobIncomeChart();
  drawTrendChart();
  renderStatistics();
}

function renderStatistics() {
  if (state.shifts.length === 0) {
    document.getElementById('statsList').innerHTML = `<div class="empty" style="grid-column:1/-1;"><div class="empty-sub">Add shifts to see statistics</div></div>`;
    return;
  }

  const totalShifts = state.shifts.length;
  let totalHours = 0, totalEarnings = 0;
  const byJob = {}, byDay = [0,0,0,0,0,0,0];
  let maxEarn = 0, maxEarnDate = '';

  state.shifts.forEach(sh => {
    const c = calcShift(sh);
    totalHours += c.workHours;
    totalEarnings += c.total;
    const job = getJob(sh.jobId);
    const name = job?.name || 'Unknown';
    byJob[name] = (byJob[name] || 0) + 1;
    byDay[new Date(sh.date).getDay()]++;
    if (c.total > maxEarn) { maxEarn = c.total; maxEarnDate = sh.date; }
  });

  const avgDuration = totalHours / totalShifts;
  const avgDaily = totalEarnings / totalShifts;
  const topJob = Object.entries(byJob).sort((a,b) => b[1]-a[1])[0];
  const topDay = byDay.indexOf(Math.max(...byDay));
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const stats = [
    { label: 'Total Shifts', value: totalShifts },
    { label: 'Total Working Hours', value: fmtHours(totalHours) },
    { label: 'Avg Shift Duration', value: fmtHours(avgDuration) },
    { label: 'Avg Daily Income', value: fmtCurrency(avgDaily) },
    { label: 'Highest Earning Day', value: fmtCurrency(maxEarn) + (maxEarnDate ? ` (${new Date(maxEarnDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})})` : '') },
    { label: 'Most Worked Job', value: topJob ? `${topJob[0]} (${topJob[1]})` : '—' },
    { label: 'Busiest Weekday', value: `${dayNames[topDay]} (${byDay[topDay]} shifts)` }
  ];

  document.getElementById('statsList').innerHTML = stats.map(s => `
    <div style="padding:14px; background:var(--bg-soft); border-radius:10px;">
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${s.label}</div>
      <div style="font-weight:700; font-size:14px;">${s.value}</div>
    </div>
  `).join('');
}

/* =========================================================
   TRANSPORTATION
   ========================================================= */
function renderTransport() {
  const now = new Date();
  const monthShifts = getMonthShifts(now.getFullYear(), now.getMonth());

  let daily = 0, weekly = 0, monthly = 0;
  const byJob = {};

  // Daily (today)
  const todayStr = now.toISOString().slice(0, 10);
  state.shifts.filter(sh => sh.date === todayStr).forEach(sh => daily += Number(sh.transport) || 0);

  // Weekly
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  state.shifts.filter(sh => {
    const d = new Date(sh.date);
    return d >= weekStart && d < weekEnd;
  }).forEach(sh => weekly += Number(sh.transport) || 0);

  // Monthly
  monthShifts.forEach(sh => {
    monthly += Number(sh.transport) || 0;
    const job = getJob(sh.jobId);
    const name = job?.name || 'Unknown';
    byJob[name] = (byJob[name] || 0) + (Number(sh.transport) || 0);
  });

  const stats = [
    { label: 'Today', value: fmtCurrency(daily), icon: 'today-outline', color: 'var(--primary)', bg: 'var(--primary-soft)' },
    { label: 'This Week', value: fmtCurrency(weekly), icon: 'calendar-outline', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    { label: 'This Month', value: fmtCurrency(monthly), icon: 'wallet-outline', color: 'var(--success)', bg: 'var(--success-soft)' }
  ];

  document.getElementById('transportStats').innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-icon" style="background:${s.bg}; color:${s.color};">
        <ion-icon name="${s.icon}"></ion-icon>
      </div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
    </div>
  `).join('');

  const byJobEl = document.getElementById('transportByJob');
  const entries = Object.entries(byJob).sort((a,b) => b[1] - a[1]);
  if (entries.length === 0) {
    byJobEl.innerHTML = `<div class="empty"><div class="empty-sub">No transportation data</div></div>`;
  } else {
    const max = Math.max(...entries.map(e => e[1]));
    byJobEl.innerHTML = entries.map(([name, val]) => {
      const job = state.jobs.find(j => j.name === name);
      const pct = (val / max) * 100;
      return `
        <div style="padding:12px 0; border-bottom:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="job-dot" style="background:${job?.color || '#888'}"></div>
              <span style="font-weight:500; font-size:13px;">${escapeHtml(name)}</span>
            </div>
            <span style="font-weight:700; font-size:13px;">${fmtCurrency(val)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${job?.color || '#888'}"></div></div>
        </div>
      `;
    }).join('');
  }
}

/* =========================================================
   SETTINGS
   ========================================================= */
function renderSettings() {
  const s = state.settings;
  document.getElementById('setCurrency').value = s.currency;
  document.getElementById('setWage').value = s.defaultWage;
  document.getElementById('setBreak').value = s.defaultBreak;
  document.getElementById('setGoal').value = s.monthlyGoal;
  document.getElementById('setRegHours').value = s.regularHours;
  document.getElementById('setOtMult').value = s.overtimeMultiplier;
  document.getElementById('setOtToggle').classList.toggle('on', s.overtimeEnabled);
  document.getElementById('setTransportToggle').classList.toggle('on', s.includeTransport);
  document.getElementById('setThemeToggle').classList.toggle('on', s.theme === 'dark');
}

/* =========================================================
   CHARTS (Canvas)
   ========================================================= */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

function getThemeColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

function drawDonut(canvas, data) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (data.length === 0) {
    ctx.fillStyle = getThemeColor('--text-muted');
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', w/2, h/2);
    return;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = w/2, cy = h/2;
  const radius = Math.min(w, h) / 2 - 20;
  const inner = radius * 0.65;
  let start = -Math.PI / 2;
  const colors = ['#4f46e5', '#f472b6', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];

  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.arc(cx, cy, inner, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start += angle;
  });

  // Center text
  ctx.fillStyle = getThemeColor('--text');
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtCurrency(total), cx, cy - 6);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = getThemeColor('--text-muted');
  ctx.fillText('Total', cx, cy + 14);

  // Legend
  const legendY = h - 10;
  const legendWidth = data.length * 90;
  let lx = (w - legendWidth) / 2;
  data.forEach((d, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, legendY - 8, 8, 8);
    ctx.fillStyle = getThemeColor('--text-muted');
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.name, lx + 12, legendY);
    lx += 90;
  });
}

function drawBarChart(canvas, labels, values, color) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (values.length === 0) return;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const max = Math.max(...values, 1);
  const barW = chartW / values.length * 0.6;
  const gap = chartW / values.length * 0.4;

  // Grid lines
  ctx.strokeStyle = getThemeColor('--border');
  ctx.fillStyle = getThemeColor('--text-muted');
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    const val = max - (max / 4) * i;
    ctx.fillText(val >= 1000 ? (val/1000).toFixed(0) + 'k' : Math.round(val), padding.left - 6, y);
  }

  // Bars
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  values.forEach((v, i) => {
    const barH = (v / max) * chartH;
    const x = padding.left + i * (barW + gap) + gap/2;
    const y = padding.top + chartH - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '66');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, barH, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = getThemeColor('--text-muted');
    ctx.font = '10px sans-serif';
    ctx.fillText(labels[i], x + barW/2, padding.top + chartH + 8);
  });
}

function drawLineChart(canvas, labels, values) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (values.length === 0) return;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const max = Math.max(...values, 1);

  // Grid
  ctx.strokeStyle = getThemeColor('--border');
  ctx.fillStyle = getThemeColor('--text-muted');
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    const val = max - (max / 4) * i;
    ctx.fillText(val >= 1000 ? (val/1000).toFixed(0) + 'k' : Math.round(val), padding.left - 6, y);
  }

  // Line
  const points = values.map((v, i) => ({
    x: padding.left + (chartW / (values.length - 1 || 1)) * i,
    y: padding.top + chartH - (v / max) * chartH
  }));

  // Area
  const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  grad.addColorStop(0, '#4f46e5' + '44');
  grad.addColorStop(1, '#4f46e5' + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Points
  points.forEach(p => {
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = getThemeColor('--bg-elev');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels
  ctx.fillStyle = getThemeColor('--text-muted');
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  labels.forEach((l, i) => {
    if (i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1) {
      ctx.fillText(l, points[i].x, padding.top + chartH + 8);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < 0) { y += h; h = -h; }
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawWeeklyIncomeChart() {
  const canvas = document.getElementById('weeklyIncomeChart');
  const now = new Date();
  const labels = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const total = state.shifts.filter(sh => {
      const d = new Date(sh.date);
      return d >= weekStart && d < weekEnd;
    }).reduce((s, sh) => s + calcShift(sh).total, 0);
    labels.push('W-' + (6 - i));
    values.push(total);
  }
  drawBarChart(canvas, labels, values, '#4f46e5');
}

function drawHoursChart() {
  const canvas = document.getElementById('hoursChart');
  const now = new Date();
  const labels = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const total = state.shifts.filter(sh => {
      const d = new Date(sh.date);
      return d >= weekStart && d < weekEnd;
    }).reduce((s, sh) => s + calcShift(sh).workHours, 0);
    labels.push('W-' + (6 - i));
    values.push(Math.round(total * 10) / 10);
  }
  drawBarChart(canvas, labels, values, '#f472b6');
}

function drawJobIncomeChart() {
  const canvas = document.getElementById('jobIncomeChart');
  const byJob = {};
  state.shifts.forEach(sh => {
    const job = getJob(sh.jobId);
    const name = job?.name || 'Unknown';
    byJob[name] = (byJob[name] || 0) + calcShift(sh).total;
  });
  const data = Object.entries(byJob).map(([name, value]) => ({ name, value }));
  drawDonut(canvas, data);
}

function drawTrendChart() {
  const canvas = document.getElementById('trendChart');
  const now = new Date();
  const labels = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const shifts = getMonthShifts(d.getFullYear(), d.getMonth());
    const total = shifts.reduce((s, sh) => s + calcShift(sh).total, 0);
    labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    values.push(total);
  }
  drawLineChart(canvas, labels, values);
}

/* =========================================================
   MODALS
   ========================================================= */
let editingShiftId = null;
let editingJobId = null;
let selectedColor = JOB_COLORS[0];

function openShiftModal(shiftId, prefillDate) {
  editingShiftId = shiftId;
  const modal = document.getElementById('shiftModal');
  document.getElementById('shiftModalTitle').textContent = shiftId ? 'Edit Shift' : 'New Shift';

  // Populate jobs
  const jobSel = document.getElementById('shiftJob');
  jobSel.innerHTML = state.jobs.map(j => `<option value="${j.id}">${escapeHtml(j.name)}</option>`).join('');

  if (shiftId) {
    const sh = state.shifts.find(s => s.id === shiftId);
    document.getElementById('shiftJob').value = sh.jobId;
    document.getElementById('shiftDate').value = sh.date;
    document.getElementById('shiftStart').value = sh.start;
    document.getElementById('shiftEnd').value = sh.end;
    document.getElementById('shiftBreak').value = sh.break;
    document.getElementById('shiftWage').value = sh.wage;
    document.getElementById('shiftTransport').value = sh.transport;
    document.getElementById('shiftNotes').value = sh.notes || '';
  } else {
    const today = prefillDate || new Date().toISOString().slice(0, 10);
    document.getElementById('shiftDate').value = today;
    document.getElementById('shiftStart').value = '09:00';
    document.getElementById('shiftEnd').value = '17:00';
    document.getElementById('shiftBreak').value = state.settings.defaultBreak;
    document.getElementById('shiftNotes').value = '';
    // Load defaults from first job
    if (state.jobs.length > 0) {
      const j = state.jobs[0];
      document.getElementById('shiftJob').value = j.id;
      document.getElementById('shiftWage').value = j.wage;
      document.getElementById('shiftTransport').value = j.transport;
    } else {
      document.getElementById('shiftWage').value = state.settings.defaultWage;
      document.getElementById('shiftTransport').value = 0;
    }
  }
  updateShiftPreview();
  modal.classList.add('show');
}

function updateShiftPreview() {
  const sh = {
    start: document.getElementById('shiftStart').value,
    end: document.getElementById('shiftEnd').value,
    break: document.getElementById('shiftBreak').value,
    wage: document.getElementById('shiftWage').value,
    transport: document.getElementById('shiftTransport').value
  };
  const c = calcShift(sh);
  document.getElementById('shiftPreview').textContent = fmtCurrency(c.total);
}

function openJobModal(jobId) {
  editingJobId = jobId;
  const modal = document.getElementById('jobModal');
  document.getElementById('jobModalTitle').textContent = jobId ? 'Edit Job' : 'New Job';

  // Color picker
  document.getElementById('colorPicker').innerHTML = JOB_COLORS.map(c =>
    `<div class="color-swatch" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      selectedColor = sw.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === selectedColor));
    });
  });

  if (jobId) {
    const j = state.jobs.find(x => x.id === jobId);
    document.getElementById('jobName').value = j.name;
    document.getElementById('jobCompany').value = j.company || '';
    document.getElementById('jobWage').value = j.wage;
    document.getElementById('jobTransport').value = j.transport;
    document.getElementById('jobNotes').value = j.notes || '';
    selectedColor = j.color;
  } else {
    document.getElementById('jobName').value = '';
    document.getElementById('jobCompany').value = '';
    document.getElementById('jobWage').value = state.settings.defaultWage;
    document.getElementById('jobTransport').value = 0;
    document.getElementById('jobNotes').value = '';
    selectedColor = JOB_COLORS[state.jobs.length % JOB_COLORS.length];
  }
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === selectedColor));
  modal.classList.add('show');
}

function closeModal(el) {
  el.classList.remove('show');
}

/* =========================================================
   EVENTS
   ========================================================= */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function initEvents() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => navigate(n.dataset.page)));
  document.querySelectorAll('.mobile-nav button').forEach(n => n.addEventListener('click', () => navigate(n.dataset.page)));

  // Menu toggle
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  });

  // Theme
  document.getElementById('themeToggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveState();
    renderSettings();
    // Redraw charts
    const activePage = document.querySelector('.page.active').id.replace('page-', '');
    renderPage(activePage);
  });

  // Quick add
  document.getElementById('quickAdd').addEventListener('click', () => openShiftModal(null));

  // Calendar nav
  document.getElementById('calPrev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
  document.getElementById('calToday').addEventListener('click', () => { calDate = new Date(); renderCalendar(); });

  // Shift filter
  document.querySelectorAll('#shiftFilter .chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#shiftFilter .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    shiftFilter = c.dataset.filter;
    renderShifts();
  }));

  // Add job
  document.getElementById('addJobBtn').addEventListener('click', () => openJobModal(null));

  // Shift modal
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', e => closeModal(e.target.closest('.modal-backdrop'))));
  document.querySelectorAll('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m); }));

  // Shift inputs preview
  ['shiftStart','shiftEnd','shiftBreak','shiftWage','shiftTransport','shiftJob'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'shiftJob') {
        const job = getJob(document.getElementById('shiftJob').value);
        if (job && !editingShiftId) {
          document.getElementById('shiftWage').value = job.wage;
          document.getElementById('shiftTransport').value = job.transport;
        }
      }
      updateShiftPreview();
    });
  });

  // Save shift
  document.getElementById('saveShiftBtn').addEventListener('click', () => {
    const data = {
      jobId: document.getElementById('shiftJob').value,
      date: document.getElementById('shiftDate').value,
      start: document.getElementById('shiftStart').value,
      end: document.getElementById('shiftEnd').value,
      break: Number(document.getElementById('shiftBreak').value) || 0,
      wage: Number(document.getElementById('shiftWage').value) || 0,
      transport: Number(document.getElementById('shiftTransport').value) || 0,
      notes: document.getElementById('shiftNotes').value
    };
    if (!data.date || !data.start || !data.end) { alert('Please fill date and times'); return; }
    if (editingShiftId) {
      const sh = state.shifts.find(s => s.id === editingShiftId);
      Object.assign(sh, data);
    } else {
      state.shifts.push({ id: uid(), ...data });
    }
    saveState();
    closeModal(document.getElementById('shiftModal'));
    const activePage = document.querySelector('.page.active').id.replace('page-', '');
    renderPage(activePage);
  });

  // Save job
  document.getElementById('saveJobBtn').addEventListener('click', () => {
    const data = {
      name: document.getElementById('jobName').value.trim(),
      company: document.getElementById('jobCompany').value.trim(),
      wage: Number(document.getElementById('jobWage').value) || 0,
      transport: Number(document.getElementById('jobTransport').value) || 0,
      color: selectedColor,
      notes: document.getElementById('jobNotes').value
    };
    if (!data.name) { alert('Please enter a job name'); return; }
    if (editingJobId) {
      const j = state.jobs.find(x => x.id === editingJobId);
      Object.assign(j, data);
    } else {
      state.jobs.push({ id: uid(), ...data });
    }
    saveState();
    closeModal(document.getElementById('jobModal'));
    renderJobs();
  });

  // Settings
  ['setCurrency','setWage','setBreak','setGoal','setRegHours','setOtMult'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const map = {
        setCurrency: 'currency',
        setWage: 'defaultWage',
        setBreak: 'defaultBreak',
        setGoal: 'monthlyGoal',
        setRegHours: 'regularHours',
        setOtMult: 'overtimeMultiplier'
      };
      const key = map[id];
      const val = document.getElementById(id).value;
      state.settings[key] = key === 'currency' ? val : Number(val);
      saveState();
      renderDashboard();
    });
  });

  document.getElementById('setOtToggle').addEventListener('click', (e) => {
    state.settings.overtimeEnabled = !state.settings.overtimeEnabled;
    e.currentTarget.classList.toggle('on', state.settings.overtimeEnabled);
    saveState();
    renderDashboard();
  });

  document.getElementById('setTransportToggle').addEventListener('click', (e) => {
    state.settings.includeTransport = !state.settings.includeTransport;
    e.currentTarget.classList.toggle('on', state.settings.includeTransport);
    saveState();
    renderDashboard();
  });

  document.getElementById('setThemeToggle').addEventListener('click', (e) => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    e.currentTarget.classList.toggle('on', state.settings.theme === 'dark');
    saveState();
    const activePage = document.querySelector('.page.active').id.replace('page-', '');
    renderPage(activePage);
  });

  // Export / Import / Reset
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-manager-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.jobs && data.shifts && data.settings) {
          state = data;
          saveState();
          applyTheme();
          navigate('dashboard');
          alert('Data imported successfully!');
        } else {
          alert('Invalid backup file');
        }
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset all data? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      loadState();
      applyTheme();
      navigate('dashboard');
    }
  });

  // Resize handler for charts
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const activePage = document.querySelector('.page.active').id.replace('page-', '');
      if (['dashboard','analytics'].includes(activePage)) renderPage(activePage);
    }, 200);
  });
}

function applyTheme() {
  document.body.dataset.theme = state.settings.theme;
  const icon = document.querySelector('#themeToggle ion-icon');
  if (icon) icon.setAttribute('name', state.settings.theme === 'dark' ? 'sunny-outline' : 'moon-outline');
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  loadState();
  applyTheme();
  initEvents();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
