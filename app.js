document.getElementById('billModal').classList.add('open');
function closeBillModal() {
  document.getElementById('billModal').classList.remove('open');
  document.getElementById('billViewerImg').src = '';
  document.getElementById('billViewerPdf').src = '';
}

// ─── INCOME MODAL & MANAGEMENT ───────────────────────
function openIncomeModal(id = null) {
  state.editingIncomeId = id;
  const form = document.getElementById('incomeForm');
  form.reset();
  state.incomeBillData = null;
  document.getElementById('incomeFileLabel').textContent = 'Click to upload slip/invoice';
  document.getElementById('incomeFileDrop').classList.remove('has-file');

  const catSel = document.getElementById('incCategory');
  catSel.innerHTML = '<option value="">Select category</option>';
  getIncomeCategories().forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });

  if (id) {
    const inc = state.incomes.find(i => i.id === id);
    if (!inc) return;
    document.getElementById('incomeModalTitle').textContent = 'Edit Income Record';
    document.getElementById('incomeSaveBtn').textContent = 'Update Income';
    document.getElementById('incDate').value      = inc.date;
    document.getElementById('incAmount').value    = inc.amount;
    document.getElementById('incCategory').value  = inc.category;
    document.getElementById('incMethod').value    = inc.method;
    document.getElementById('incBuyer').value     = inc.buyer || '';
    document.getElementById('incDesc').value      = inc.description || '';
    if (inc.bill) {
      state.incomeBillData = inc.bill;
      document.getElementById('incomeFileLabel').textContent = 'Slip attached ✓';
      document.getElementById('incomeFileDrop').classList.add('has-file');
    }
  } else {
    document.getElementById('incomeModalTitle').textContent = 'Add Income Record';
    document.getElementById('incomeSaveBtn').textContent = 'Save Income';
    document.getElementById('incDate').value = today();
  }
  document.getElementById('incomeModal').classList.add('open');
}

function closeIncomeModal() {
  document.getElementById('incomeModal').classList.remove('open');
  state.editingIncomeId = null;
}

function handleIncomeFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    state.incomeBillData = { data: e.target.result, type: file.type, name: file.name };
    document.getElementById('incomeFileLabel').textContent = `📎 ${file.name}`;
    document.getElementById('incomeFileDrop').classList.add('has-file');
  };
  reader.readAsDataURL(file);
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
    bill:        state.incomeBillData,
    createdBy:   state.currentUser?.name || 'Admin',
    createdAt:   new Date().toISOString(),
  };

  if (state.editingIncomeId) {
    const idx = state.incomes.findIndex(i => i.id === state.editingIncomeId);
    state.incomes[idx] = inc;
    addLog('edit', `Edited income: ${inc.category} ₹${fmt(inc.amount)} (${inc.date})`);
    showToast('Income record updated!');
  } else {
    state.incomes.unshift(inc);
    addLog('add', `Added income: ${inc.category} ₹${fmt(inc.amount)} (${inc.date})`);
    showToast('Income record added!');
  }

  await saveIncome_fs(inc);
  save();
  closeIncomeModal();
  renderIncomes();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
}

function deleteIncome(id) {
  if (!confirm('Delete this income record?')) return;
  const inc = state.incomes.find(i => i.id === id);
  state.incomes = state.incomes.filter(i => i.id !== id);
  addLog('delete', `Deleted income: ${inc?.category} ₹${fmt(inc?.amount)} (${inc?.date})`);
  deleteIncome_fs(id);
  save();
  renderIncomes();
  if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard();
  showToast('Income record deleted');
}

function renderIncomes() {
  const tbody = document.getElementById('incomeBody');
  const empty = document.getElementById('incEmptyState');

  if (!state.incomes.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    document.getElementById('incCount').textContent = '0 records';
    document.getElementById('incTotalSummary').textContent = 'Total: ₹0';
    return;
  }
  empty.style.display = 'none';

  const total = state.incomes.reduce((s, i) => s + i.amount, 0);
  document.getElementById('incCount').textContent = `${state.incomes.length} record${state.incomes.length !== 1 ? 's' : ''}`;
  document.getElementById('incTotalSummary').textContent = `Total: ₹${fmt(total)}`;

  tbody.innerHTML = state.incomes.map(inc => `
    <tr>
      <td>${formatDate(inc.date)}</td>
      <td><span class="cat-badge cat-income">${inc.category}</span></td>
      <td title="${inc.description || ''}">${truncate(inc.description || '—', 30)}</td>
      <td>${inc.buyer || '—'}</td>
      <td><span class="method-badge method-${inc.method}">${inc.method}</span></td>
      <td class="amount-cell income-amount">₹${fmt(inc.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="act-btn edit" onclick="openIncomeModal(${inc.id})" title="Edit"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="act-btn delete" onclick="deleteIncome(${inc.id})" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── LOGS & SETTINGS ─────────────────────────────────
function renderLogs() {
  const tbody = document.getElementById('logsBody');
  if (!state.logs.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No activity records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.logs.map(l => `
    <tr>
      <td><small>${new Date(l.time).toLocaleString()}</small></td>
      <td><span class="user-tag">${l.user}</span></td>
      <td><strong class="action-type type-${l.type}">${l.type.toUpperCase()}</strong></td>
      <td>${l.details}</td>
    </tr>
  `).join('');
}

function renderSettings() {
  document.getElementById('setLogoutTimer').value = state.settings.autoLogout || 30;
  document.getElementById('setPinReq').checked = state.settings.pinRequired || false;
}

async function saveSystemSettings(e) {
  e.preventDefault();
  state.settings.autoLogout = parseInt(document.getElementById('setLogoutTimer').value) || 0;
  state.settings.pinRequired = document.getElementById('setPinReq').checked;
  await saveSettings_fs();
  addLog('settings', 'Updated system preferences');
  showToast('Settings saved successfully!');
  scheduleAutoLogout();
}

function renderCustomCategories() {
  const expList = document.getElementById('customExpCategoriesList');
  const incList = document.getElementById('customIncCategoriesList');

  expList.innerHTML = state.customExpenseCategories.map((c, idx) => `
    <div class="category-item-chip">
      <span>${c}</span>
      <button onclick="removeCustomCategory('exp', ${idx})">&times;</button>
    </div>
  `).join('');

  incList.innerHTML = state.customIncomeCategories.map((c, idx) => `
    <div class="category-item-chip">
      <span>${c}</span>
      <button onclick="removeCustomCategory('inc', ${idx})">&times;</button>
    </div>
  `).join('');
}

async function addCustomCategory(type) {
  const inputId = type === 'exp' ? 'newExpCategory' : 'newIncCategory';
  const input = document.getElementById(inputId);
  const val = input.value.trim();
  if (!val) return;

  if (type === 'exp') {
    if (getExpenseCategories().includes(val)) { showToast('Category already exists', 'error'); return; }
    state.customExpenseCategories.push(val);
  } else {
    if (getIncomeCategories().includes(val)) { showToast('Category already exists', 'error'); return; }
    state.customIncomeCategories.push(val);
  }

  input.value = '';
  await saveSettings_fs();
  renderCustomCategories();
  showToast('Category added!');
}

async function removeCustomCategory(type, idx) {
  if (!confirm('Remove this custom category?')) return;
  if (type === 'exp') {
    state.customExpenseCategories.splice(idx, 1);
  } else {
    state.customIncomeCategories.splice(idx, 1);
  }
  await saveSettings_fs();
  renderCustomCategories();
  showToast('Category removed');
}

// ─── UTILITIES & SYSTEM APP INITIALIZATION ───────────
function addLog(type, details) {
  const entry = {
    time: new Date().toISOString(),
    user: state.currentUser?.name || 'System',
    type,
    details
  };
  state.logs.unshift(entry);
  if (state.logs.length > 200) state.logs.pop();
  saveLog_fs(entry);
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer') || createToastContainer();
  const box = document.createElement('div');
  box.className = `toast-box toast-${type}`;
  box.textContent = msg;
  container.appendChild(box);
  setTimeout(() => box.classList.add('visible'), 10);
  setTimeout(() => {
    box.classList.remove('visible');
    setTimeout(() => box.remove(), 300);
  }, 3500);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toastContainer';
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
}

function today() { return dateStr(new Date()); }
function dateStr(d) { return d.toISOString().split('T')[0]; }
function fmt(v) { return Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function sum(arr) { return arr.reduce((s, x) => s + x.amount, 0); }
function truncate(str, len) { return str.length > len ? str.substring(0, len - 3) + '...' : str; }
function formatDate(dStr) {
  if (!dStr) return '—';
  const parts = dStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dStr;
}

// Global exposure for structural HTML binding inline clicks
window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleTheme = toggleTheme;
window.logout = logout;
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.openIncomeModal = openIncomeModal;
window.closeIncomeModal = closeIncomeModal;
window.handleFileUpload = handleFileUpload;
window.handleIncomeFileUpload = handleIncomeFileUpload;
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.saveIncome = saveIncome;
window.deleteIncome = deleteIncome;
window.viewBill = viewBill;
window.closeBillModal = closeBillModal;
window.clearFilters = clearFilters;
window.renderExpenses = renderExpenses;
window.toggleSelectAll = toggleSelectAll;
window.switchChartView = switchChartView;
window.setSearchFilter = setSearchFilter;
window.performSearch = performSearch;
window.generateReport = generateReport;
window.exportExcel = exportExcel;
window.exportPDF = exportPDF;
window.printReport = printReport;
window.addCustomCategory = addCustomCategory;
window.removeCustomCategory = removeCustomCategory;
window.saveSystemSettings = saveSystemSettings;
window.closeOnOverlay = closeOnOverlay;

// ─── INITIALIZATION ON BOOT ──────────────────────────
async function initApp() {
  // Theme load
  const cachedTheme = localStorage.getItem('qb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', cachedTheme);
  
  // Elements hook
  document.getElementById('loginForm')?.addEventListener('submit', doLogin);
  document.getElementById('expenseForm')?.addEventListener('submit', saveExpense);
  document.getElementById('incomeForm')?.addEventListener('submit', saveIncome);
  document.getElementById('globalSearch')?.addEventListener('input', performSearch);
  
  await load();
  
  // Skip or show login view wrapper based on session
  if (!state.settings
