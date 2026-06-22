/* ════════════════════════════════════
   QuarryBook – app.js
   Full expense management logic
   Firestore-connected version
════════════════════════════════════ */

// ─── FIREBASE SETUP ──────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc,
  collection, getDocs, onSnapshot, writeBatch, query, collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWszVl7GivlfTLkeevl8lEK1YiO_GMaAE",
  authDomain: "quarry-book-yasir-c058e.firebaseapp.com",
  projectId: "quarry-book-yasir-c058e",
  storageBucket: "quarry-book-yasir-c058e.firebasestorage.app",
  messagingSenderId: "732130969655",
  appId: "1:732130969655:web:fca0828205fcefe5bc17b2",
  measurementId: "G-32FM86JYTC",
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ─── ADMIN CONFIG ────────────────────────────────────
const ADMIN_USERNAME = 'ASHMIL AP';
const ADMIN_PIN      = '9494';

// ─── FIRESTORE HELPERS (user-scoped) ─────────────────
// Data structure:
//   users/{username}/expenses/{id}
//   users/{username}/incomes/{id}
//   users/{username}/meta/settings
//   users/{username}/meta/categories
//   users/{username}/meta/profile  → { pin, role, createdAt }

function userCol(username, sub) {
  return collection(db, 'users', username, sub);
}
function userDoc(username, sub, id) {
  return doc(db, 'users', username, sub, String(id));
}
function userMetaDoc(username, key) {
  return doc(db, 'users', username, 'meta', key);
}

async function fsSet(username, colName, id, data) {
  try { await setDoc(userDoc(username, colName, id), data); }
  catch(e) { console.error(`Firestore set [users/${username}/${colName}/${id}]`, e); }
}
async function fsDel(username, colName, id) {
  try { await deleteDoc(userDoc(username, colName, id)); }
  catch(e) { console.error(`Firestore del [users/${username}/${colName}/${id}]`, e); }
}
async function fsGetAll(username, colName) {
  try {
    const snap = await getDocs(userCol(username, colName));
    return snap.docs.map(d => d.data());
  } catch(e) { console.error(`Firestore getAll [users/${username}/${colName}]`, e); return []; }
}

// Profile helpers
async function fsGetProfile(username) {
  try {
    const snap = await getDoc(userMetaDoc(username, 'profile'));
    return snap.exists() ? snap.data() : null;
  } catch(e) { return null; }
}
async function fsSetProfile(username, data) {
  try {
    // Create the parent user document AND the profile meta doc
    await setDoc(doc(db, 'users', username), { username, createdAt: data.createdAt });
    await setDoc(userMetaDoc(username, 'profile'), data);
  }
  catch(e) { console.error('Firestore set profile', e); }
}

// List all registered usernames
async function fsGetAllUsers() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = [];
    for (const d of snap.docs) {
      const profile = await fsGetProfile(d.id);
      if (profile) users.push({ username: d.id, ...profile });
    }
    return users;
  } catch(e) { return []; }
}

async function fsSetSettings(username, data) {
  try { await setDoc(userMetaDoc(username, 'settings'), data); }
  catch(e) { console.error('Firestore set settings', e); }
}
async function fsGetSettings(username) {
  try {
    const snap = await getDoc(userMetaDoc(username, 'settings'));
    return snap.exists() ? snap.data() : {};
  } catch(e) { return {}; }
}
async function fsSetCategories(username, data) {
  try { await setDoc(userMetaDoc(username, 'categories'), data); }
  catch(e) {}
}
async function fsGetCategories(username) {
  try {
    const snap = await getDoc(userMetaDoc(username, 'categories'));
    return snap.exists() ? snap.data() : { exp: [], inc: [] };
  } catch(e) { return { exp: [], inc: [] }; }
}

// ─── STATE ───────────────────────────────────────────
let state = {
  expenses: [],
  incomes: [],
  users: [],          // local users list (settings panel)
  allUsers: [],       // admin only: list of all registered users
  logs: [],
  currentUser: null,  // { username, role }
  settings: { autoLogout: 30, pinRequired: false },
  editingId: null,
  editingIncomeId: null,
  searchFilter: 'all',
  billData: null,
  incomeBillData: null,
  charts: {},
  customExpenseCategories: [],
  customIncomeCategories: [],
};

// ─── CATEGORIES ─────────────────────────────────────
const EXPENSE_CATEGORIES_DEFAULT = ['Fuel','Vehicle Maintenance','Driver Charges','Loading Charges','Food & Accommodation','Miscellaneous'];
const INCOME_CATEGORIES_DEFAULT  = ['Stone Load – First Quality','Stone Load – Second Quality','Stone Load – Third Quality'];
const CAT_COLORS = ['#4ade80','#22c55e','#86efac','#bbf7d0','#fbbf24','#60a5fa'];
const INCOME_COLORS = ['#34d399','#a3e635','#facc15','#fb923c','#c084fc','#38bdf8'];

function getExpenseCategories() {
  return [...EXPENSE_CATEGORIES_DEFAULT, ...state.customExpenseCategories];
}
function getIncomeCategories() {
  return [...INCOME_CATEGORIES_DEFAULT, ...state.customIncomeCategories];
}
// Keep alias for chart backward-compat
function getCATEGORIES() { return getExpenseCategories(); }

// ─── STORAGE (Firestore, user-scoped) ────────────────
function save() {
  try { localStorage.setItem('qb_theme', document.documentElement.getAttribute('data-theme') || 'dark'); }
  catch(e) {}
}

function currentUsername() { return state.currentUser?.username || ''; }
function isAdmin() { return state.currentUser?.role === 'admin'; }

async function saveExpense_fs(exp) {
  await fsSet(currentUsername(), 'expenses', exp.id, exp);
}
async function deleteExpense_fs(id) {
  await fsDel(currentUsername(), 'expenses', id);
}
async function saveIncome_fs(inc) {
  await fsSet(currentUsername(), 'incomes', inc.id, inc);
}
async function deleteIncome_fs(id) {
  await fsDel(currentUsername(), 'incomes', id);
}
async function saveLog_fs(log) {
  await fsSet(currentUsername(), 'logs', log.time.replace(/[:.]/g, '-'), log);
}
async function saveSettings_fs() {
  await fsSetSettings(currentUsername(), state.settings);
  await fsSetCategories(currentUsername(), { exp: state.customExpenseCategories, inc: state.customIncomeCategories });
}

// Load data for a specific user (or all users if admin)
async function load(username) {
  try {
    showToast('Loading data…', 'success');
    if (isAdmin()) {
      // Admin: load ALL users' expenses and incomes
      const allUsersList = await fsGetAllUsers();
      state.allUsers = allUsersList;
      let allExpenses = [], allIncomes = [], allLogs = [];
      for (const u of allUsersList) {
        const [exps, incs, logs] = await Promise.all([
          fsGetAll(u.username, 'expenses'),
          fsGetAll(u.username, 'incomes'),
          fsGetAll(u.username, 'logs'),
        ]);
        // Tag each entry with owner username
        exps.forEach(e => e._owner = u.username);
        incs.forEach(i => i._owner = u.username);
        allExpenses.push(...exps);
        allIncomes.push(...incs);
        allLogs.push(...logs);
      }
      state.expenses = allExpenses.sort((a,b) => b.id - a.id);
      state.incomes  = allIncomes.sort((a,b)  => b.id - a.id);
      state.logs     = allLogs.sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0, 500);
    } else {
      // Regular user: load only their data
      const [expenses, incomes, logs] = await Promise.all([
        fsGetAll(username, 'expenses'),
        fsGetAll(username, 'incomes'),
        fsGetAll(username, 'logs'),
      ]);
      state.expenses = expenses.sort((a,b) => b.id - a.id);
      state.incomes  = incomes.sort((a,b)  => b.id - a.id);
      state.logs     = logs.sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0, 200);
    }
    const [settings, cats] = await Promise.all([
      fsGetSettings(username),
      fsGetCategories(username),
    ]);
    state.settings = Object.keys(settings).length ? settings : { autoLogout: 30, pinRequired: false };
    state.customExpenseCategories = cats.exp || [];
    state.customIncomeCategories  = cats.inc || [];
  } catch(e) { console.warn('Load error', e); }
}

// ─── AUTH ─────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const uname = document.getElementById('loginUser').value.trim();
  const pin   = document.getElementById('loginPin').value.trim();

  if (!uname || !pin) { showToast('Enter username and PIN', 'error'); return; }

  // Admin check (hardcoded)
  if (uname.toUpperCase() === ADMIN_USERNAME.toUpperCase()) {
    if (pin !== ADMIN_PIN) { showToast('Invalid PIN', 'error'); return; }
    // Ensure admin user doc exists in Firestore
    const adminDoc = doc(db, 'users', ADMIN_USERNAME);
    const adminSnap = await getDoc(adminDoc);
    if (!adminSnap.exists()) {
      await setDoc(adminDoc, { username: ADMIN_USERNAME, createdAt: new Date().toISOString() });
      await setDoc(userMetaDoc(ADMIN_USERNAME, 'profile'), { pin: ADMIN_PIN, role: 'admin', createdAt: new Date().toISOString() });
    }
    state.currentUser = { username: ADMIN_USERNAME, role: 'admin' };
    await load(ADMIN_USERNAME);
    onLoginSuccess();
    return;
  }

  // Regular user — look up in Firestore
  const profile = await fsGetProfile(uname);
  if (!profile) { showToast('User not found. Please register.', 'error'); return; }
  if (profile.pin !== pin) { showToast('Invalid PIN', 'error'); return; }

  state.currentUser = { username: uname, role: 'user' };
  await load(uname);
  onLoginSuccess();
}

async function doRegister() {
  const uname = document.getElementById('regUser').value.trim();
  const pin   = document.getElementById('regPin').value.trim();
  const pin2  = document.getElementById('regPin2').value.trim();

  if (!uname || !pin) { showToast('Enter username and PIN', 'error'); return; }
  if (pin.length < 4 || pin.length > 6) { showToast('PIN must be 4–6 digits', 'error'); return; }
  if (!/^\d+$/.test(pin)) { showToast('PIN must be digits only', 'error'); return; }
  if (pin !== pin2) { showToast('PINs do not match', 'error'); return; }
  if (uname.toUpperCase() === ADMIN_USERNAME.toUpperCase()) { showToast('Username not allowed', 'error'); return; }

  const existing = await fsGetProfile(uname);
  if (existing) { showToast('Username already taken', 'error'); return; }

  await fsSetProfile(uname, { pin, role: 'user', createdAt: new Date().toISOString() });
  showToast(`Account created! You can now log in.`, 'success');
  showLoginForm();
  document.getElementById('loginUser').value = uname;
}

function onLoginSuccess() {
  const u = state.currentUser;
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainWrapper').style.display = 'flex';
  document.getElementById('sidebarUserName').textContent = u.username;
  document.getElementById('userAvatarSidebar').textContent = u.username[0].toUpperCase();
  // Show/hide admin-only nav items
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
  addLog('login', `Logged in as ${u.username}`);
  showToast(`Welcome, ${u.username}!`);
  // Defer dashboard render: wait for browser to paint the newly-visible mainWrapper
  // before calling initDashboard (canvas/layout needs to be visible first).
  // A second call after 300ms acts as a safety net for slow Firestore responses.
  requestAnimationFrame(() => {
    initDashboard();
    setTimeout(() => initDashboard(), 300);
  });
  scheduleAutoLogout();
}

function showLoginForm() {
  document.getElementById('loginFormWrap').style.display = '';
  document.getElementById('registerFormWrap').style.display = 'none';
}
function showRegisterForm() {
  document.getElementById('loginFormWrap').style.display = 'none';
  document.getElementById('registerFormWrap').style.display = '';
}

function logout() {
  if (!confirm('Sign out?')) return;
  clearTimeout(autoLogoutTimer);
  addLog('logout', `Signed out`);
  state.currentUser = null;
  state.expenses = []; state.incomes = []; state.logs = [];
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainWrapper').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPin').value = '';
  showLoginForm();
}

let autoLogoutTimer = null;
function scheduleAutoLogout() {
  clearTimeout(autoLogoutTimer);
  const mins = parseInt(state.settings.autoLogout || 0);
  if (!mins) return;
  autoLogoutTimer = setTimeout(() => {
    showToast('Auto-logged out due to inactivity', 'error');
    logout();
  }, mins * 60 * 1000);
}
document.addEventListener('click', scheduleAutoLogout);

// ─── NAVIGATION ──────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  expenses: 'Expenses',
  income: 'Income',
  reports: 'Reports',
  search: 'Search',
  logs: 'Activity Logs',
  settings: 'Settings',
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  // Sync mobile bottom nav
  document.querySelectorAll('.mobile-nav button').forEach(b => b.classList.remove('active'));
  document.querySelector(`.mobile-nav [data-mob-page="${page}"]`)?.classList.add('active');
  if (window.innerWidth <= 768) closeSidebar();
  if (page === 'dashboard')  initDashboard();
  if (page === 'expenses')   renderExpenses();
  if (page === 'income')     renderIncomes();
  if (page === 'logs')       renderLogs();
  if (page === 'settings')   { renderSettings(); renderCustomCategories(); }
  if (page === 'search') {
    document.getElementById('globalSearch').focus();
    performSearch();
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ─── THEME ───────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const icon = document.getElementById('themeIcon');
  if (isDark) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  const toggleEl = document.getElementById('darkToggle');
  if (toggleEl) toggleEl.checked = !isDark;
  localStorage.setItem('qb_theme', isDark ? 'light' : 'dark');
}

// ─── EXPENSE MODAL ───────────────────────────────────
function openExpenseModal(id = null) {
  state.editingId = id;
  const form = document.getElementById('expenseForm');
  form.reset();
  state.billData = null;
  document.getElementById('fileLabel').textContent = 'Click to upload bill';
  document.getElementById('fileDrop').classList.remove('has-file');

  // Restrict date picker to current month
  const expDateEl = document.getElementById('expDate');
  expDateEl.min = monthStart();
  expDateEl.max = monthEnd();

  // Populate categories dynamically
  const catSel = document.getElementById('expCategory');
  catSel.innerHTML = '<option value="">Select category</option>';
  getExpenseCategories().forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });

  if (id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    document.getElementById('modalTitle').textContent = 'Edit Expense';
    document.getElementById('saveBtn').textContent = 'Update Expense';
    document.getElementById('expDate').value      = exp.date;
    document.getElementById('expAmount').value    = exp.amount;
    document.getElementById('expCategory').value  = exp.category;
    document.getElementById('expMethod').value    = exp.method;
    document.getElementById('expVendor').value    = exp.vendor || '';
    document.getElementById('expDesc').value      = exp.description || '';
    if (exp.bill) {
      state.billData = exp.bill;
      document.getElementById('fileLabel').textContent = 'Bill attached ✓';
      document.getElementById('fileDrop').classList.add('has-file');
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Expense';
    document.getElementById('saveBtn').textContent = 'Save Expense';
    document.getElementById('expDate').value = today();
  }
  document.getElementById('expenseModal').classList.add('open');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.remove('open');
  state.editingId = null;
}

function closeOnOverlay(event, modalId) {
  if (event.target.id === modalId) {
    document.getElementById(modalId).classList.remove('open');
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    state.billData = { data: e.target.result, type: file.type, name: file.name };
    document.getElementById('fileLabel').textContent = `📎 ${file.name}`;
    document.getElementById('fileDrop').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

async function saveExpense(e) {
  e.preventDefault();
  const exp = {
    id:          state.editingId || Date.now(),
    date:        document.getElementById('expDate').value,
    amount:      parseFloat(document.getElementById('expAmount').value),
    category:    document.getElementById('expCategory').value,
    method:      document.getElementById('expMethod').value,
    vendor:      document.getElementById('expVendor').value.trim(),
    description: document.getElementById('expDesc').value.trim(),
    bill:        state.billData,
    createdBy:   state.currentUser?.username || state.currentUser?.name || 'Admin',
    createdAt:   new Date().toISOString(),
  };

  if (state.editingId) {
    const idx = state.expenses.findIndex(e => e.id === state.editingId);
    state.expenses[idx] = exp;
    addLog('edit', `Edited expense: ${exp.category} ₹${fmt(exp.amount)} (${exp.date})`);
    showToast('Expense updated!');
  } else {
    state.expenses.unshift(exp);
    addLog('add', `Added expense: ${exp.category} ₹${fmt(exp.amount)} (${exp.date})`);
    showToast('Expense added!');
  }

  await saveExpense_fs(exp);
  save();
  closeExpenseModal();
  renderExpenses();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
}

function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const exp = state.expenses.find(e => e.id === id);
  state.expenses = state.expenses.filter(e => e.id !== id);
  addLog('delete', `Deleted expense: ${exp?.category} ₹${fmt(exp?.amount)} (${exp?.date})`);
  deleteExpense_fs(id);
  save();
  renderExpenses();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
  showToast('Expense deleted');
}

// ─── RENDER EXPENSES ─────────────────────────────────
function clearFilters() {
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterMethod').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  renderExpenses();
}

function getFilteredExpenses() {
  const cat  = document.getElementById('filterCategory')?.value || '';
  const meth = document.getElementById('filterMethod')?.value || '';
  const from = document.getElementById('filterFrom')?.value || '';
  const to   = document.getElementById('filterTo')?.value || '';
  return state.expenses.filter(e => {
    if (cat  && e.category !== cat)  return false;
    if (meth && e.method   !== meth) return false;
    if (from && e.date < from)       return false;
    if (to   && e.date > to)         return false;
    return true;
  });
}

function renderExpenses() {
  const filtered = getFilteredExpenses();
  const tbody = document.getElementById('expensesBody');
  const empty = document.getElementById('expEmptyState');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    document.getElementById('expCount').textContent = '0 expenses';
    document.getElementById('expTotal').textContent = 'Total: ₹0';
    return;
  }
  empty.style.display = 'none';

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  document.getElementById('expCount').textContent = `${filtered.length} expense${filtered.length !== 1 ? 's' : ''}`;
  document.getElementById('expTotal').textContent = `Total: ₹${fmt(total)}`;

  tbody.innerHTML = filtered.map(exp => `
    <tr>
      <td><input type="checkbox" class="row-check" value="${exp.id}"></td>
      <td>${formatDate(exp.date)}</td>
      <td><span class="cat-badge">${exp.category}</span></td>
      <td title="${exp.description || ''}">${truncate(exp.description || '—', 30)}</td>
      <td>${exp.vendor || '—'}</td>
      <td><span class="method-badge method-${exp.method}">${exp.method}</span></td>
      <td class="amount-cell">₹${fmt(exp.amount)}</td>
      <td>${exp.bill
        ? `<button class="act-btn" onclick="viewBill(${exp.id})" title="View Bill"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>`
        : '<span style="color:var(--text-muted);font-size:11px">—</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn edit" onclick="openExpenseModal(${exp.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="act-btn delete" onclick="deleteExpense(${exp.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function toggleSelectAll() {
  const master = document.getElementById('selectAll').checked;
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = master);
}

// ─── DASHBOARD ───────────────────────────────────────
function initDashboard() {
  try {
  const now = new Date();
  const todayStr = today();
  const weekAgo  = dateStr(new Date(now - 7  * 86400000));
  const monthAgo = dateStr(new Date(now.getFullYear(), now.getMonth(), 1));

  const todayExp = state.expenses.filter(e => e.date === todayStr);
  const weekExp  = state.expenses.filter(e => e.date >= weekAgo && e.date <= todayStr);
  const monthExp = state.expenses.filter(e => e.date >= monthAgo && e.date <= todayStr);

  const todayInc = state.incomes.filter(i => i.date === todayStr);
  const weekInc  = state.incomes.filter(i => i.date >= weekAgo && i.date <= todayStr);
  const monthInc = state.incomes.filter(i => i.date >= monthAgo && i.date <= todayStr);

  document.getElementById('statToday').textContent  = '₹' + fmt(sum(todayExp));
  document.getElementById('statWeek').textContent   = '₹' + fmt(sum(weekExp));
  document.getElementById('statMonth').textContent  = '₹' + fmt(sum(monthExp));
  document.getElementById('statTotal').textContent  = '₹' + fmt(sum(state.expenses));

  document.getElementById('statIncToday').textContent  = '₹' + fmt(sum(todayInc));
  document.getElementById('statIncWeek').textContent   = '₹' + fmt(sum(weekInc));
  document.getElementById('statIncMonth').textContent  = '₹' + fmt(sum(monthInc));
  document.getElementById('statIncTotal').textContent  = '₹' + fmt(sum(state.incomes));

  const netWeek  = sum(weekInc)  - sum(weekExp);
  const netWeekEl = document.getElementById('statNetWeek');
  if (netWeekEl) {
    netWeekEl.textContent = (netWeek >= 0 ? '+' : '') + '₹' + fmt(netWeek);
    netWeekEl.style.color = netWeek >= 0 ? 'var(--green)' : '#f87171';
  }

  const netMonth = sum(monthInc) - sum(monthExp);
  const netEl = document.getElementById('statNetMonth');
  netEl.textContent = (netMonth >= 0 ? '+' : '') + '₹' + fmt(netMonth);
  netEl.style.color = netMonth >= 0 ? 'var(--green)' : '#f87171';

  // Recent transactions table (expenses + incomes combined, sorted by date desc)
  const allTx = [
    ...state.expenses.map(e => ({ ...e, _type: 'expense' })),
    ...state.incomes.map(i => ({ ...i, _type: 'income' })),
  ].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 8);

  const recentBody = document.getElementById('recentBody');
  const dashEmpty  = document.getElementById('dashEmptyState');

  if (!allTx.length) {
    recentBody.innerHTML = '';
    dashEmpty.style.display = 'flex';
  } else {
    dashEmpty.style.display = 'none';
    recentBody.innerHTML = allTx.map(tx => `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td><span class="cat-badge ${tx._type === 'income' ? 'cat-income' : ''}">${tx.category}</span></td>
        <td>${truncate(tx.description || '—', 25)}</td>
        <td>${tx.vendor || tx.buyer || '—'}</td>
        <td><span class="method-badge method-${tx.method}">${tx.method}</span></td>
        <td class="amount-cell ${tx._type === 'income' ? 'income-amount' : ''}">${tx._type === 'income' ? '+' : '-'}₹${fmt(tx.amount)}</td>
        <td>
          <div class="action-btns">
            ${tx._type === 'expense'
              ? `<button class="act-btn edit" onclick="openExpenseModal(${tx.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                 <button class="act-btn delete" onclick="deleteExpense(${tx.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>`
              : `<button class="act-btn edit income-edit" onclick="openIncomeModal(${tx.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                 <button class="act-btn delete" onclick="deleteIncome(${tx.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>`
            }
          </div>
        </td>
      </tr>
    `).join('');
  }

  initCharts();
  } catch (err) {
    var b = document.getElementById('debugBanner');
    if (b) {
      b.style.display = 'block';
      b.textContent += '[initDashboard ERROR] ' + err.message + '\n' + err.stack + '\n';
    }
    console.error('initDashboard failed:', err);
  }
}

// ─── CHARTS ──────────────────────────────────────────
function initCharts() {
  destroyChart('trendChart');
  destroyChart('categoryChart');
  initTrendChart('monthly');
  initCategoryChart();
}

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function switchChartView(mode, el) {
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  destroyChart('trendChart');
  initTrendChart(mode);
}

function initTrendChart(mode) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  const now = new Date();
  let labels = [], data = [];

  if (mode === 'monthly') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      labels.push(label);
      data.push(state.expenses.filter(e => e.date.startsWith(key)).reduce((s,e) => s+e.amount, 0));
    }
  } else {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = dateStr(d);
      labels.push(d.toLocaleString('default', { weekday: 'short' }));
      data.push(state.expenses.filter(e => e.date === key).reduce((s,e) => s+e.amount, 0));
    }
  }

  state.charts['trendChart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Expenses (₹)',
        data,
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#4ade80',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `₹${fmt(c.raw)}` } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a735a', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a735a', font: { size: 11 }, callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) } }
      }
    }
  });
}

function initCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  const cats = getExpenseCategories();
  const catData = cats.map(cat => state.expenses.filter(e => e.category === cat).reduce((s,e) => s+e.amount, 0));
  const colors = cats.map((_, i) => CAT_COLORS[i % CAT_COLORS.length]);

  state.charts['categoryChart'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data: catData,
        backgroundColor: colors.map(c => c + '99'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8fad8f', font: { size: 10 }, padding: 12, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => `${c.label}: ₹${fmt(c.raw)}` } }
      },
      cutout: '60%',
    }
  });
}

// ─── SEARCH ──────────────────────────────────────────
function setSearchFilter(filter, el) {
  state.searchFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  performSearch();
}

function performSearch() {
  const query = document.getElementById('globalSearch').value.toLowerCase().trim();
  const tbody = document.getElementById('searchBody');
  const empty = document.getElementById('searchEmptyState');
  const count = document.getElementById('searchCount');

  if (!query) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    count.textContent = '';
    return;
  }

  const results = state.expenses.filter(e => {
    const f = state.searchFilter;
    if (f === 'vendor')   return (e.vendor || '').toLowerCase().includes(query);
    if (f === 'category') return e.category.toLowerCase().includes(query);
    if (f === 'amount')   return String(e.amount).includes(query);
    return (
      e.category.toLowerCase().includes(query) ||
      (e.vendor || '').toLowerCase().includes(query) ||
      (e.description || '').toLowerCase().includes(query) ||
      String(e.amount).includes(query) ||
      e.method.toLowerCase().includes(query)
    );
  });

  empty.style.display = results.length ? 'none' : 'flex';
  if (!results.length) {
    tbody.innerHTML = '';
    empty.querySelector('p').textContent = `No results for "${query}"`;
    count.textContent = '';
    return;
  }

  count.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
  const hi = t => t?.toString().replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), m => `<mark>${m}</mark>`) || '';

  tbody.innerHTML = results.map(exp => `
    <tr>
      <td>${formatDate(exp.date)}</td>
      <td><span class="cat-badge">${hi(exp.category)}</span></td>
      <td>${hi(truncate(exp.description || '—', 30))}</td>
      <td>${hi(exp.vendor || '—')}</td>
      <td><span class="method-badge method-${exp.method}">${exp.method}</span></td>
      <td class="amount-cell">₹${hi(fmt(exp.amount))}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn edit" onclick="openExpenseModal(${exp.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="act-btn delete" onclick="deleteExpense(${exp.id});performSearch();" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── REPORTS ─────────────────────────────────────────
function generateReport() {
  const from = document.getElementById('reportFrom').value;
  const to   = document.getElementById('reportTo').value;
  const cat  = document.getElementById('reportCategory').value;

  let filtered = state.expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to)   filtered = filtered.filter(e => e.date <= to);
  if (cat)  filtered = filtered.filter(e => e.category === cat);

  if (!filtered.length) { showToast('No data for selected filters', 'error'); return; }

  const total = sum(filtered);
  const days  = from && to ? Math.max(1, (new Date(to) - new Date(from)) / 86400000 + 1) : 30;

  document.getElementById('rTotal').textContent = '₹' + fmt(total);
  document.getElementById('rCount').textContent = filtered.length;
  document.getElementById('rAvg').textContent   = '₹' + fmt(total / days);
  document.getElementById('rMax').textContent   = '₹' + fmt(Math.max(...filtered.map(e => e.amount)));

  const title = `${cat || 'All Categories'} | ${from || '—'} to ${to || '—'}`;
  document.getElementById('reportTitle').textContent = title;

  document.getElementById('reportBody').innerHTML = filtered.map((exp, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${formatDate(exp.date)}</td>
      <td><span class="cat-badge">${exp.category}</span></td>
      <td>${exp.description || '—'}</td>
      <td>${exp.vendor || '—'}</td>
      <td><span class="method-badge method-${exp.method}">${exp.method}</span></td>
      <td class="amount-cell">₹${fmt(exp.amount)}</td>
    </tr>
  `).join('');

  document.getElementById('reportSummary').style.display = 'grid';
  document.getElementById('reportTableCard').style.display = 'block';
  addLog('report', `Generated report: ${title}`);
}

// ─── EXPORT ──────────────────────────────────────────
function getReportData() {
  const from = document.getElementById('reportFrom').value;
  const to   = document.getElementById('reportTo').value;
  const cat  = document.getElementById('reportCategory').value;
  let filtered = state.expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to)   filtered = filtered.filter(e => e.date <= to);
  if (cat)  filtered = filtered.filter(e => e.category === cat);
  return filtered;
}

function exportExcel() {
  const data = getReportData();
  if (!data.length) { showToast('Generate a report first', 'error'); return; }
  const rows = data.map((e, i) => ({
    '#': i+1, Date: e.date, Category: e.category,
    Description: e.description || '', Vendor: e.vendor || '',
    Method: e.method, 'Amount (₹)': e.amount,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch:4},{wch:12},{wch:22},{wch:28},{wch:20},{wch:8},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  XLSX.writeFile(wb, `QuarryBook_Expenses_${today()}.xlsx`);
  addLog('export', `Exported ${data.length} records to Excel`);
  showToast('Excel file exported!');
}

function exportPDF() {
  const data = getReportData();
  if (!data.length) { showToast('Generate a report first', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  // Header
  doc.setFillColor(17, 24, 17);
  doc.rect(0, 0, 297, 30, 'F');
  doc.setTextColor(74, 222, 128);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('QuarryBook', 14, 18);
  doc.setTextColor(200,255,200);
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Stone Business Expense Report', 14, 25);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 25);

  doc.autoTable({
    startY: 36,
    head: [['#','Date','Category','Description','Vendor','Method','Amount (Rs.)']],
    body: data.map((e,i) => [i+1, e.date, e.category, e.description||'—', e.vendor||'—', e.method, `Rs.${fmt(e.amount)}`]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [17, 27, 17], textColor: [74, 222, 128], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [20, 28, 20] },
    bodyStyles: { textColor: [220, 240, 220] },
    foot: [[`Total: ${data.length} expenses`,'','','','','',`Rs.${fmt(sum(data))}`]],
    footStyles: { fillColor: [26, 80, 38], textColor: [74, 222, 128], fontStyle: 'bold' },
  });

  doc.save(`QuarryBook_Report_${today()}.pdf`);
  addLog('export', `Exported ${data.length} records to PDF`);
  showToast('PDF exported!');
}

function printReport() {
  window.print();
  addLog('print', 'Printed report');
}

// ─── BILL VIEWER ─────────────────────────────────────
function viewBill(id) {
  const exp = state.expenses.find(e => e.id === id);
  if (!exp?.bill) return;
  const img = document.getElementById('billViewerImg');
  const pdf = document.getElementById('billViewerPdf');
  if (exp.bill.type === 'application/pdf') {
    img.style.display = 'none'; pdf.style.display = 'block';
    pdf.src = exp.bill.data;
  } else {
    pdf.style.display = 'none'; img.style.display = 'block';
    img.src = exp.bill.data;
  }
  document.getElementById('billViewer').classList.add('open');
}

// ─── USERS ───────────────────────────────────────────
function openUserModal() {
  document.getElementById('userName').value = '';
  document.getElementById('userRole').value = '';
  document.getElementById('userPin').value  = '';
  document.getElementById('userModal').classList.add('open');
}

async function addUser(e) {
  e.preventDefault();
  const name = document.getElementById('userName').value.trim();
  const role = document.getElementById('userRole').value;
  const pin  = document.getElementById('userPin').value;
  if (state.users.find(u => (u.name || u.username || '').toLowerCase() === name.toLowerCase())) {
    showToast('Username already exists', 'error'); return;
  }
  const user = { id: Date.now(), name, role, pin };
  state.users.push(user);
  await fsSetProfile(user.name, { pin: user.pin, role: user.role, createdAt: new Date().toISOString() });
  save();
  renderSettings();
  document.getElementById('userModal').classList.remove('open');
  addLog('add', `Added user: ${name} (${role})`);
  showToast(`User ${name} added!`);
}

async function deleteUser(id) {
  if (state.users.find(u => u.id === id)?.name === state.currentUser?.name) {
    showToast("Can't delete yourself", 'error'); return;
  }
  if (!confirm('Delete this user?')) return;
  const user = state.users.find(u => u.id === id);
  state.users = state.users.filter(u => u.id !== id);
  // Note: deletes local entry only; Firestore user doc retained to preserve data
  save();
  renderSettings();
  addLog('delete', `Deleted user: ${user?.name}`);
  showToast('User deleted');
}

// ─── SETTINGS RENDER ─────────────────────────────────
function renderSettings() {
  const list = document.getElementById('usersList');
  list.innerHTML = (state.users || []).map(u => `
    <div class="user-list-item">
      <div class="ul-avatar">${u.name[0].toUpperCase()}</div>
      <div class="ul-info">
        <div class="ul-name">${u.name}</div>
        <div class="ul-role">${u.role}</div>
      </div>
      <span class="ul-badge role-${u.role}">${u.role}</span>
      ${u.name !== 'Admin' ? `<button class="act-btn delete" onclick="deleteUser(${u.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
    </div>
  `).join('');

  document.getElementById('autoLogout').value = state.settings.autoLogout || 30;
  document.getElementById('pinToggle').checked = !!state.settings.pinRequired;
}

function saveSettings() {
  state.settings.autoLogout   = parseInt(document.getElementById('autoLogout').value);
  state.settings.pinRequired  = document.getElementById('pinToggle').checked;
  saveSettings_fs();
  save();
  showToast('Settings saved');
}

// ─── BACKUP & RESTORE ────────────────────────────────
function backupData() {
  const backup = {
    version: 1,
    timestamp: new Date().toISOString(),
    expenses: state.expenses,
    incomes: state.incomes,
    logs: state.logs,
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `QuarryBook_Backup_${today()}.json`;
  a.click(); URL.revokeObjectURL(url);
  addLog('backup', 'Data backup downloaded');
  showToast('Backup downloaded!');
}

function restoreData(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!confirm('This will replace all data. Continue?')) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.expenses) throw new Error('Invalid backup file');
      state.expenses = backup.expenses || [];
      state.users    = backup.users    || state.users;
      state.logs     = backup.logs     || [];
      state.settings = backup.settings || {};
      // Push everything to Firestore
      await Promise.all([
        ...state.expenses.map(ex => fsSet(currentUsername(), 'expenses', ex.id, ex)),
        ...state.incomes.map(inc => fsSet(currentUsername(), 'incomes', inc.id, inc)),
        fsSetSettings(currentUsername(), state.settings),
      ]);
      save();
      addLog('restore', `Data restored from backup (${backup.timestamp || 'unknown date'})`);
      showToast('Data restored successfully!');
      initDashboard();
      renderSettings();
    } catch(err) {
      showToast('Invalid backup file', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── LOGS ────────────────────────────────────────────
function addLog(type, message) {
  const log = {
    type,
    message,
    user: state.currentUser?.username || state.currentUser?.name || 'System',
    time: new Date().toISOString(),
  };
  state.logs.unshift(log);
  if (state.logs.length > 200) state.logs = state.logs.slice(0, 200);
  saveLog_fs(log);
  save();
}

function renderLogs() {
  const list  = document.getElementById('logsList');
  const empty = document.getElementById('logsEmptyState');
  if (!state.logs.length) {
    list.innerHTML = ''; empty.style.display = 'flex'; return;
  }
  empty.style.display = 'none';
  list.innerHTML = state.logs.map(log => `
    <div class="log-item">
      <div class="log-dot ${log.type === 'delete' ? 'delete' : log.type === 'edit' ? 'edit' : ''}"></div>
      <div class="log-meta">
        <div class="log-action">${log.message}</div>
        <div>
          <span class="log-user">${log.user}</span>
          <span class="log-time"> · ${timeAgo(log.time)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

async function clearLogs() {
  if (!confirm('Clear all activity logs?')) return;
  // Delete all log docs from Firestore
  const snap = await getDocs(userCol(currentUsername(), 'logs')).catch(() => null);
  if (snap) {
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  state.logs = [];
  save();
  renderLogs();
  showToast('Logs cleared');
}

// ─── NOTIFICATIONS ───────────────────────────────────
function showNotifications() {
  const high = state.expenses.filter(e => e.amount > 10000).slice(0,3);
  const msg = high.length
    ? `High value expenses: ${high.map(e => '₹'+fmt(e.amount)).join(', ')}`
    : 'No alerts at the moment.';
  showToast(msg);
  document.getElementById('notifBadge').style.display = 'none';
}

// ─── TOAST ───────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ─── UTILS ───────────────────────────────────────────
function today() { return dateStr(new Date()); }
function dateStr(d) { return d.toISOString().split('T')[0]; }
function monthStart() {
  const d = new Date();
  return dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}
function monthEnd() {
  const d = new Date();
  return dateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function fmt(n) {
  if (isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function sum(arr) { return arr.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0); }
function truncate(str, len) { return str.length > len ? str.slice(0, len) + '…' : str; }
function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── INCOME MODAL ────────────────────────────────────
function openIncomeModal(id = null) {
  state.editingIncomeId = id;
  const form = document.getElementById('incomeForm');
  form.reset();
  state.incomeBillData = null;
  document.getElementById('incFileLabel').textContent = 'Click to upload receipt';
  document.getElementById('incFileDrop').classList.remove('has-file');
  populateIncomeCategories();

  // Restrict date picker to current month
  const incDateEl = document.getElementById('incDate');
  incDateEl.min = monthStart();
  incDateEl.max = monthEnd();

  if (id) {
    const inc = state.incomes.find(i => i.id === id);
    if (!inc) return;
    document.getElementById('incModalTitle').textContent = 'Edit Income';
    document.getElementById('incSaveBtn').textContent = 'Update Income';
    document.getElementById('incDate').value     = inc.date;
    document.getElementById('incAmount').value   = inc.amount;
    document.getElementById('incCategory').value = inc.category;
    document.getElementById('incMethod').value   = inc.method;
    document.getElementById('incBuyer').value    = inc.buyer || '';
    document.getElementById('incDesc').value     = inc.description || '';
    if (inc.quantity !== undefined) document.getElementById('incQuantity').value = inc.quantity;
    if (inc.ratePerUnit !== undefined) document.getElementById('incRatePerUnit').value = inc.ratePerUnit;
    if (inc.bill) {
      state.incomeBillData = inc.bill;
      document.getElementById('incFileLabel').textContent = 'Receipt attached ✓';
      document.getElementById('incFileDrop').classList.add('has-file');
    }
  } else {
    document.getElementById('incModalTitle').textContent = 'Add Income';
    document.getElementById('incSaveBtn').textContent = 'Save Income';
    document.getElementById('incDate').value = today();
  }
  document.getElementById('incomeModal').classList.add('open');
}

function populateIncomeCategories() {
  const sel = document.getElementById('incCategory');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select category</option>';
  getIncomeCategories().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function closeIncomeModal() {
  document.getElementById('incomeModal').classList.remove('open');
  state.editingIncomeId = null;
}

function handleIncFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    state.incomeBillData = { data: e.target.result, type: file.type, name: file.name };
    document.getElementById('incFileLabel').textContent = `📎 ${file.name}`;
    document.getElementById('incFileDrop').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

function calcIncomeTotal() {
  const qty  = parseFloat(document.getElementById('incQuantity').value) || 0;
  const rate = parseFloat(document.getElementById('incRatePerUnit').value) || 0;
  if (qty && rate) {
    document.getElementById('incAmount').value = (qty * rate).toFixed(2);
  }
}

async function saveIncome(e) {
  e.preventDefault();
  const inc = {
    id:          state.editingIncomeId || Date.now(),
    date:        document.getElementById('incDate').value,
    amount:      parseFloat(document.getElementById('incAmount').value),
    category:    document.getElementById('incCategory').value,
    method:      document.getElementById('incMethod').value,
    buyer:       document.getElementById('incBuyer').value.trim(),
    description: document.getElementById('incDesc').value.trim(),
    quantity:    parseFloat(document.getElementById('incQuantity').value) || null,
    ratePerUnit: parseFloat(document.getElementById('incRatePerUnit').value) || null,
    bill:        state.incomeBillData,
    createdBy:   state.currentUser?.username || state.currentUser?.name || 'Admin',
    createdAt:   new Date().toISOString(),
  };

  if (state.editingIncomeId) {
    const idx = state.incomes.findIndex(i => i.id === state.editingIncomeId);
    state.incomes[idx] = inc;
    addLog('edit', `Edited income: ${inc.category} ₹${fmt(inc.amount)} (${inc.date})`);
    showToast('Income updated!');
  } else {
    state.incomes.unshift(inc);
    addLog('add', `Added income: ${inc.category} ₹${fmt(inc.amount)} (${inc.date})`);
    showToast('Income added!');
  }

  await saveIncome_fs(inc);
  save();
  closeIncomeModal();
  renderIncomes();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
}

function deleteIncome(id) {
  if (!confirm('Delete this income entry?')) return;
  const inc = state.incomes.find(i => i.id === id);
  state.incomes = state.incomes.filter(i => i.id !== id);
  addLog('delete', `Deleted income: ${inc?.category} ₹${fmt(inc?.amount)} (${inc?.date})`);
  deleteIncome_fs(id);
  save();
  renderIncomes();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
  showToast('Income deleted');
}

// ─── RENDER INCOMES ──────────────────────────────────
function getFilteredIncomes() {
  const cat  = document.getElementById('filterIncCategory')?.value || '';
  const meth = document.getElementById('filterIncMethod')?.value || '';
  const from = document.getElementById('filterIncFrom')?.value || '';
  const to   = document.getElementById('filterIncTo')?.value || '';
  return state.incomes.filter(i => {
    if (cat  && i.category !== cat)  return false;
    if (meth && i.method   !== meth) return false;
    if (from && i.date < from)       return false;
    if (to   && i.date > to)         return false;
    return true;
  });
}

function clearIncomeFilters() {
  document.getElementById('filterIncCategory').value = '';
  document.getElementById('filterIncMethod').value = '';
  document.getElementById('filterIncFrom').value = '';
  document.getElementById('filterIncTo').value = '';
  renderIncomes();
}

function renderIncomes() {
  // populate filter dropdown dynamically
  const catSel = document.getElementById('filterIncCategory');
  if (catSel) {
    const prev = catSel.value;
    catSel.innerHTML = '<option value="">All Categories</option>';
    getIncomeCategories().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    catSel.value = prev;
  }

  const filtered = getFilteredIncomes();
  const tbody = document.getElementById('incomesBody');
  const empty = document.getElementById('incEmptyState');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    document.getElementById('incCount').textContent = '0 entries';
    document.getElementById('incTotal').textContent = 'Total: ₹0';
    return;
  }
  empty.style.display = 'none';

  const total = filtered.reduce((s, i) => s + i.amount, 0);
  document.getElementById('incCount').textContent = `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`;
  document.getElementById('incTotal').textContent = `Total: ₹${fmt(total)}`;

  tbody.innerHTML = filtered.map(inc => `
    <tr>
      <td>${formatDate(inc.date)}</td>
      <td><span class="cat-badge cat-income">${inc.category}</span></td>
      <td>${inc.quantity ? `${inc.quantity} units` : '—'}</td>
      <td>${inc.ratePerUnit ? '₹' + fmt(inc.ratePerUnit) : '—'}</td>
      <td>${inc.buyer || '—'}</td>
      <td><span class="method-badge method-${inc.method}">${inc.method}</span></td>
      <td class="amount-cell income-amount">+₹${fmt(inc.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn edit income-edit" onclick="openIncomeModal(${inc.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="act-btn delete" onclick="deleteIncome(${inc.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── CUSTOM CATEGORIES ───────────────────────────────
function renderCustomCategories() {
  // Expense custom cats
  const expList = document.getElementById('customExpCatList');
  if (expList) {
    expList.innerHTML = state.customExpenseCategories.length
      ? state.customExpenseCategories.map((c, i) => `
          <div class="custom-cat-item">
            <span>${c}</span>
            <button class="act-btn delete" onclick="removeCustomExpCat(${i})" title="Remove">×</button>
          </div>`).join('')
      : '<p class="muted" style="font-size:12px;padding:6px 0">No custom categories yet</p>';
  }
  // Income custom cats
  const incList = document.getElementById('customIncCatList');
  if (incList) {
    incList.innerHTML = state.customIncomeCategories.length
      ? state.customIncomeCategories.map((c, i) => `
          <div class="custom-cat-item">
            <span>${c}</span>
            <button class="act-btn delete" onclick="removeCustomIncCat(${i})" title="Remove">×</button>
          </div>`).join('')
      : '<p class="muted" style="font-size:12px;padding:6px 0">No custom categories yet</p>';
  }
  // Update expense filter & modal dropdowns
  updateExpenseCategorySelects();
}

function addCustomExpCat() {
  const input = document.getElementById('newExpCatInput');
  const val = input.value.trim();
  if (!val) return;
  if (getExpenseCategories().includes(val)) { showToast('Category already exists', 'error'); return; }
  state.customExpenseCategories.push(val);
  input.value = '';
  saveSettings_fs();
  save();
  renderCustomCategories();
  showToast(`Expense category "${val}" added`);
}

function removeCustomExpCat(idx) {
  state.customExpenseCategories.splice(idx, 1);
  saveSettings_fs();
  save();
  renderCustomCategories();
}

function addCustomIncCat() {
  const input = document.getElementById('newIncCatInput');
  const val = input.value.trim();
  if (!val) return;
  if (getIncomeCategories().includes(val)) { showToast('Category already exists', 'error'); return; }
  state.customIncomeCategories.push(val);
  input.value = '';
  saveSettings_fs();
  save();
  renderCustomCategories();
  showToast(`Income category "${val}" added`);
}

function removeCustomIncCat(idx) {
  state.customIncomeCategories.splice(idx, 1);
  saveSettings_fs();
  save();
  renderCustomCategories();
}

function updateExpenseCategorySelects() {
  const cats = getExpenseCategories();
  ['expCategory', 'filterCategory', 'reportCategory'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.value = prev;
  });
}

// ─── INIT ─────────────────────────────────────────────
(async function init() {
  const savedTheme = localStorage.getItem('qb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) darkToggle.checked = savedTheme === 'dark';
  if (savedTheme === 'light') {
    document.getElementById('themeIcon').innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }

  const fd = document.getElementById('filterFrom');
  const td = document.getElementById('filterTo');
  if (fd && td) {
    const m = new Date(); m.setDate(1);
    fd.value = dateStr(m);
    td.value = today();
  }

  // Show login screen — data loads after successful login
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainWrapper').style.display = 'none';
  showLoginForm();
})();

// Add highlight style for search
const s = document.createElement('style');
s.textContent = 'mark { background: rgba(74,222,128,0.25); color: var(--green); border-radius: 2px; padding: 0 2px; } .stat-sub-label { font-size: 11px; color: var(--text-muted); display: block; margin-top: 2px; } .stat-card { min-height: unset !important; height: auto !important; padding-bottom: 18px !important; } .stat-trend { display: none !important; }';
document.head.appendChild(s);

// ─── EXPOSE FUNCTIONS TO WINDOW (required for onclick= in ES module scope) ───
Object.assign(window, {
  navigateTo, toggleSidebar, closeSidebar, toggleTheme,
  openExpenseModal, closeExpenseModal, closeOnOverlay, handleFileUpload, saveExpense, deleteExpense,
  clearFilters, renderExpenses, toggleSelectAll,
  initDashboard, switchChartView,
  setSearchFilter, performSearch,
  generateReport, exportExcel, exportPDF, printReport,
  viewBill,
  openUserModal, addUser, deleteUser,
  saveSettings, backupData, restoreData,
  clearLogs,
  showNotifications, logout, downloadWeeklyReport,
  openIncomeModal, closeIncomeModal, saveIncome, deleteIncome,
  handleIncFileUpload, calcIncomeTotal,
  addCustomExpCat, addCustomIncCat, removeCustomExpCat, removeCustomIncCat,
  clearIncomeFilters, showRegisterForm, showLoginForm, doLogin, doRegister,
});

// ─── WEEKLY PROFIT REPORT PDF ─────────────────────────
function downloadWeeklyReport() {
  const { jsPDF } = window.jspdf;

  // Calculate this week Monday-Sunday
  const now    = new Date();
  const day    = now.getDay();
  const diff   = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now); monday.setDate(now.getDate() + diff); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);

  const weekStart = dateStr(monday);
  const weekEnd   = dateStr(sunday);
  // FIX: use plain hyphen instead of en-dash to avoid encoding issues
  const label = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

  const weekExp = state.expenses.filter(e => e.date >= weekStart && e.date <= weekEnd);
  const weekInc = (state.incomes || []).filter(i => i.date >= weekStart && i.date <= weekEnd);

  const totalExp = sum(weekExp);
  const totalInc = sum(weekInc);
  const profit   = totalInc - totalExp;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const PAGE_H = 297;

  // FIX 4: page border
  function drawPageBorder() {
    doc.setDrawColor(74, 222, 128);
    doc.setLineWidth(0.6);
    doc.rect(5, 5, W - 10, PAGE_H - 10);
  }
  drawPageBorder();

  // Header
  doc.setFillColor(10, 15, 10);
  doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(74, 222, 128);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('QuarryBook', 14, 16);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 220, 180);
  doc.text('Weekly Profit Report', 14, 24);
  doc.text(label, 14, 31);
  doc.setTextColor(120, 160, 120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36.5);

  // Summary boxes
  const boxY = 44; const boxH = 22; const gap = 4;
  const bw = (W - 28 - gap * 2) / 3;

  // FIX 1: plain numbers only — no currency symbol prefix on values
  doc.setFillColor(40, 15, 15);
  doc.roundedRect(14, boxY, bw, boxH, 3, 3, 'F');
  doc.setTextColor(248, 113, 113);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('TOTAL EXPENSES', 14 + bw/2, boxY + 7, { align: 'center' });
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(fmt(totalExp), 14 + bw/2, boxY + 16, { align: 'center' });

  doc.setFillColor(15, 35, 15);
  doc.roundedRect(14 + bw + gap, boxY, bw, boxH, 3, 3, 'F');
  doc.setTextColor(74, 222, 128);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('TOTAL INCOME', 14 + bw + gap + bw/2, boxY + 7, { align: 'center' });
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(fmt(totalInc), 14 + bw + gap + bw/2, boxY + 16, { align: 'center' });

  const pColor = profit >= 0 ? [74, 222, 128] : [248, 113, 113];
  doc.setFillColor(profit >= 0 ? 15 : 40, profit >= 0 ? 40 : 15, 15);
  doc.roundedRect(14 + (bw + gap) * 2, boxY, bw, boxH, 3, 3, 'F');
  doc.setTextColor(...pColor);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('WEEKLY PROFIT', 14 + (bw + gap) * 2 + bw/2, boxY + 7, { align: 'center' });
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(fmt(profit), 14 + (bw + gap) * 2 + bw/2, boxY + 16, { align: 'center' });

  let curY = boxY + boxH + 8;

  // Expenses table
  doc.setTextColor(200, 60, 60);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Expenses', 14, curY); curY += 4;

  if (weekExp.length) {
    doc.autoTable({
      startY: curY,
      head: [['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount (Rs.)']],
      // FIX 1: plain number values, no currency prefix
      body: weekExp.map(e => [formatDate(e.date), e.category, e.description || '-', e.vendor || '-', e.method, fmt(e.amount)]),
      foot: [['', '', '', '', 'Total', fmt(totalExp)]],
      // FIX 2: light background + dark text so ALL rows are equally visible
      styles:           { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 30], fillColor: [255, 255, 255] },
      headStyles:       { fillColor: [180, 40, 40],  textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles:       { fillColor: [180, 40, 40],  textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 235, 235] },
      margin: { left: 14, right: 14 },
    });
    curY = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('No expenses this week.', 14, curY + 4); curY += 12;
  }

  // Income table
  doc.setTextColor(30, 120, 60);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Income', 14, curY); curY += 4;

  if (weekInc.length) {
    doc.autoTable({
      startY: curY,
      head: [['Date', 'Category', 'Description', 'Method', 'Amount (Rs.)']],
      // FIX 1: plain number values, no currency prefix
      body: weekInc.map(i => [formatDate(i.date), i.category || '-', i.description || '-', i.method || '-', fmt(i.amount)]),
      foot: [['', '', '', 'Total', fmt(totalInc)]],
      // FIX 2: light background + dark text so ALL rows are equally visible
      styles:           { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 30], fillColor: [255, 255, 255] },
      headStyles:       { fillColor: [20, 120, 60],  textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles:       { fillColor: [20, 120, 60],  textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [235, 255, 240] },
      margin: { left: 14, right: 14 },
    });
    curY = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('No income this week.', 14, curY + 4); curY += 12;
  }

  // FIX 3: if footer won't fit on this page, add a new page
  if (curY + 20 > PAGE_H - 15) {
    doc.addPage();
    drawPageBorder();
    curY = 20;
  }

  // Profit footer line
  doc.setDrawColor(50, 160, 80);
  doc.setLineWidth(0.4);
  doc.line(14, curY, W - 14, curY); curY += 7;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...pColor);
  // FIX 1: plain number, no currency prefix
  doc.text(`Weekly Profit: ${fmt(profit)}`, W - 14, curY, { align: 'right' });

  // Bottom label — always at a safe fixed position
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('QuarryBook - Stone Business Manager', W / 2, PAGE_H - 8, { align: 'center' });

  doc.save(`QuarryBook_Weekly_${weekStart}.pdf`);
  addLog('export', `Downloaded weekly report: ${label}`);
  showToast('Weekly report downloaded!');
}
