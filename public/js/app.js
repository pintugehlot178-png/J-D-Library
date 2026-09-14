// J & D Institute of Nursing Library - Core SPA Script

// State variables
let currentAcademicYearId = null;
let academicYears = [];
let selectedStudent = null;
let verifiedBook = null;
let currentActiveLoan = null;
let activeTab = 'circulation';
let currentReportData = [];
let currentReportType = 'accession-register';
let currentLabelViewMode = 'grid';
let specialtiesPopulated = false;

// On Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Automatically attach Bearer auth token to all /api/ requests
const _nativeFetch = window.fetch;
window.fetch = function(url, options = {}) {
  const token = localStorage.getItem('jd_library_auth_token') || sessionStorage.getItem('jd_library_auth_token');
  if (token && typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/login')) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(options.headers)) {
      options.headers.push(['Authorization', `Bearer ${token}`]);
    } else {
      if (!options.headers['Authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return _nativeFetch(url, options);
};

let isPortalDataLoaded = false;

async function checkAuthStatus() {
  const token = localStorage.getItem('jd_library_auth_token') || sessionStorage.getItem('jd_library_auth_token');
  if (!token) return false;

  try {
    const res = await _nativeFetch('/api/auth/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      localStorage.removeItem('jd_library_auth_token');
      sessionStorage.removeItem('jd_library_auth_token');
      return false;
    }
    const data = await res.json();
    if (data && data.authenticated) {
      const displayName = data.user?.displayName || data.user?.username || 'Admin';
      const userDisplayEl = document.getElementById('user-display-name');
      if (userDisplayEl) userDisplayEl.textContent = displayName;
      return true;
    }
    localStorage.removeItem('jd_library_auth_token');
    sessionStorage.removeItem('jd_library_auth_token');
    return false;
  } catch (err) {
    console.error('Error checking auth status:', err);
    return false;
  }
}

async function unlockMainPortal() {
  const loginView = document.getElementById('login-view');
  const mainLayout = document.getElementById('main-layout');
  const userBadge = document.getElementById('user-badge');

  if (loginView) loginView.classList.add('hidden');
  if (mainLayout) mainLayout.classList.remove('hidden');
  if (userBadge) userBadge.classList.remove('hidden');

  if (!isPortalDataLoaded) {
    await loadAcademicYears();
    const today = new Date();
    const deskDateEl = document.getElementById('desk-current-date');
    if (deskDateEl) {
      deskDateEl.innerText = `Date: ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    updateIssueDates();
    switchTab('circulation');
    isPortalDataLoaded = true;
  }
}

function lockMainPortal() {
  const loginView = document.getElementById('login-view');
  const mainLayout = document.getElementById('main-layout');
  const userBadge = document.getElementById('user-badge');

  if (mainLayout) mainLayout.classList.add('hidden');
  if (loginView) loginView.classList.remove('hidden');
  if (userBadge) userBadge.classList.add('hidden');

  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.classList.add('hidden');

  const passwordInput = document.getElementById('login-password');
  if (passwordInput) passwordInput.value = '';

  const userIdInput = document.getElementById('login-userid');
  if (userIdInput) {
    userIdInput.focus();
  }
}

function setupAuth() {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('btn-login-submit');
  const btnText = document.getElementById('btn-login-text');
  const btnSpinner = document.getElementById('btn-login-spinner');
  const togglePassBtn = document.getElementById('btn-toggle-password');
  const passwordInput = document.getElementById('login-password');
  const eyeShow = document.getElementById('eye-icon-show');
  const eyeHide = document.getElementById('eye-icon-hide');
  const logoutBtn = document.getElementById('btn-logout');

  // Show/Hide Password
  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      if (eyeShow) eyeShow.classList.toggle('hidden', isPassword);
      if (eyeHide) eyeHide.classList.toggle('hidden', !isPassword);
    });
  }

  // Handle Login Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = (document.getElementById('login-userid')?.value || '').trim();
      const password = (document.getElementById('login-password')?.value || '').trim();

      if (!userId || !password) {
        if (loginError) {
          loginError.classList.remove('hidden');
          if (loginErrorMsg) loginErrorMsg.textContent = 'Please enter both User ID and Password.';
        }
        return;
      }

      // Show loading spinner
      if (submitBtn) submitBtn.disabled = true;
      if (btnSpinner) btnSpinner.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Verifying Credentials...';
      if (loginError) loginError.classList.add('hidden');

      try {
        const res = await _nativeFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          localStorage.setItem('jd_library_auth_token', data.token);
          const userDisplayEl = document.getElementById('user-display-name');
          if (userDisplayEl && data.user) {
            userDisplayEl.textContent = data.user.displayName || data.user.username;
          }
          await unlockMainPortal();
        } else {
          if (loginError) {
            loginError.classList.remove('hidden');
            if (loginErrorMsg) loginErrorMsg.textContent = data.message || 'Invalid User ID or Password. Please try again.';
          }
          if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
          }
        }
      } catch (err) {
        console.error('Login error:', err);
        if (loginError) {
          loginError.classList.remove('hidden');
          if (loginErrorMsg) loginErrorMsg.textContent = 'Unable to connect to server. Please try again.';
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnSpinner) btnSpinner.classList.add('hidden');
        if (btnText) btnText.textContent = 'Sign In to Library Portal';
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const confirmLogout = confirm('Are you sure you want to log out of the Library Portal?');
      if (!confirmLogout) return;

      localStorage.removeItem('jd_library_auth_token');
      sessionStorage.removeItem('jd_library_auth_token');

      try {
        await _nativeFetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        // ignore logout network errors
      }

      lockMainPortal();
    });
  }
}

// ==========================================
// 1. APP SETUP & NAV
// ==========================================
async function initApp() {
  setupTheme();
  setupNavigation();
  setupEventListeners();
  setupAuth();

  const isAuthenticated = await checkAuthStatus();
  if (isAuthenticated) {
    unlockMainPortal();
  } else {
    lockMainPortal();
  }
}

function setupTheme() {
  const toggleBtn = document.getElementById('btn-toggle-theme');
  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon = document.getElementById('theme-icon-sun');

  const enableLightMode = () => {
    document.body.classList.add('light-mode');
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
    localStorage.setItem('theme', 'light');
  };

  const disableLightMode = () => {
    document.body.classList.remove('light-mode');
    moonIcon.classList.add('hidden');
    sunIcon.classList.remove('hidden');
    localStorage.setItem('theme', 'dark');
  };

  if (localStorage.getItem('theme') === 'light') {
    enableLightMode();
  } else {
    disableLightMode();
  }

  toggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('light-mode')) {
      disableLightMode();
    } else {
      enableLightMode();
    }
  });
}

function setupNavigation() {
  const tabLinks = document.querySelectorAll('.tab-link');
  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav menu active states
  const tabLinks = document.querySelectorAll('.tab-link');
  tabLinks.forEach(link => {
    const isMatched = link.getAttribute('data-tab') === tabId;
    if (isMatched) {
      link.classList.add('active', 'bg-teal-500/10', 'text-teal-400', 'border-l-4', 'border-teal-500');
      link.classList.remove('text-slate-400');
    } else {
      link.classList.remove('active', 'bg-teal-500/10', 'text-teal-400', 'border-l-4', 'border-teal-500');
      link.classList.add('text-slate-400');
    }
  });

  // Toggle Tab Panels
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabPanels.forEach(panel => {
    if (panel.id === `panel-${tabId}`) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });

  // Refresh tab data
  if (tabId === 'students') {
    loadStudents();
  } else if (tabId === 'books') {
    populateMasterBookCategories();
    loadBooks();
  } else if (tabId === 'journals') {
    loadJournals();
  } else if (tabId === 'reports') {
    loadReportPreview();
  }
}

// Update Issue date labels (today and +14 days)
function updateIssueDates() {
  const today = new Date();
  const due = new Date();
  due.setDate(today.getDate() + 15);

  const pad = (n) => String(n).padStart(2, '0');
  const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  document.getElementById('issue-date-label').innerText = format(today);
  document.getElementById('due-date-label').innerText = format(due);
}

// Helper: Toast Notifications
function showNotification(msg, type = 'info') {
  const banner = document.getElementById('notification-banner');
  const icon = document.getElementById('notification-icon');
  const text = document.getElementById('notification-msg');

  text.innerText = msg;

  // Clear colors
  banner.className = 'mb-6 p-4 rounded-xl border flex items-center justify-between shadow-md transition-all ';
  
  if (type === 'success') {
    banner.classList.add('bg-emerald-950/40', 'border-emerald-800', 'text-emerald-300');
    icon.innerHTML = `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  } else if (type === 'error') {
    banner.classList.add('bg-red-950/40', 'border-red-800', 'text-red-300');
    icon.innerHTML = `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  } else {
    banner.classList.add('bg-slate-800/80', 'border-slate-700', 'text-slate-300');
    icon.innerHTML = `<svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  }

  banner.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    banner.classList.add('hidden');
  }, 5000);
}

// ==========================================
// 2. ACADEMIC YEARS
// ==========================================
async function loadAcademicYears() {
  try {
    const res = await fetch('/api/academic-years');
    academicYears = await res.json();
    
    const dropdown = document.getElementById('global-academic-year');
    dropdown.innerHTML = '';
    
    academicYears.forEach(ay => {
      const option = document.createElement('option');
      option.value = ay.id;
      option.innerText = ay.name;
      if (ay.status === 'active') {
        option.selected = true;
        currentAcademicYearId = ay.id;
      }
      dropdown.appendChild(option);
    });

    if (!currentAcademicYearId && academicYears.length > 0) {
      currentAcademicYearId = academicYears[0].id;
    }

    const reportDropdown = document.getElementById('reports-year-select');
    if (reportDropdown) {
      reportDropdown.innerHTML = '<option value="all">All Sessions</option>';
      academicYears.forEach(ay => {
        const option = document.createElement('option');
        option.value = ay.id;
        option.innerText = ay.name;
        reportDropdown.appendChild(option);
      });
    }
  } catch (err) {
    showNotification('Error loading academic sessions: ' + err.message, 'error');
  }
}

// ==========================================
// 3. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Global Notification Banner Close Button
  document.getElementById('btn-close-notification').addEventListener('click', () => {
    document.getElementById('notification-banner').classList.add('hidden');
  });

  // Global Academic Year Selector Switch
  document.getElementById('global-academic-year').addEventListener('change', (e) => {
    currentAcademicYearId = parseInt(e.target.value);
    setActiveAcademicYear(currentAcademicYearId);
  });

  // Open Create Academic Year Modal
  document.getElementById('btn-new-ay').addEventListener('click', () => {
    document.getElementById('modal-ay').classList.remove('hidden');
  });
  
  // Close Create Academic Year Modal
  document.getElementById('btn-close-ay').addEventListener('click', () => {
    document.getElementById('modal-ay').classList.add('hidden');
  });

  // Save Academic Year
  document.getElementById('btn-save-ay').addEventListener('click', async () => {
    const inputName = document.getElementById('input-ay-name').value.trim();
    if (!inputName) {
      showNotification('Academic Year name cannot be empty', 'error');
      return;
    }
    try {
      const res = await fetch('/api/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inputName })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Academic Year "${data.name}" created successfully.`, 'success');
        document.getElementById('input-ay-name').value = '';
        document.getElementById('modal-ay').classList.add('hidden');
        await loadAcademicYears();
        // Switch to the newly created year
        document.getElementById('global-academic-year').value = data.id;
        currentAcademicYearId = data.id;
        setActiveAcademicYear(data.id);
      } else {
        showNotification(data.error || 'Failed to create academic year', 'error');
      }
    } catch (err) {
      showNotification('Error: ' + err.message, 'error');
    }
  });

  // Backup DB
  document.getElementById('btn-backup').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification(`One-Click SQLite Backup complete! Location: ${data.path}`, 'success');
      } else {
        showNotification('Backup failed: ' + data.error, 'error');
      }
    } catch (err) {
      showNotification('Error creating backup: ' + err.message, 'error');
    }
  });

  // --- Circulation Desk: Issue Book Search ---
  const issueSearchInput = document.getElementById('issue-student-search');
  issueSearchInput.addEventListener('input', async (e) => {
    const val = e.target.value.trim();
    const resultsBox = document.getElementById('issue-student-results');
    
    if (val.length < 2) {
      resultsBox.classList.add('hidden');
      return;
    }
    
    try {
      // Find students in current academic year
      const res = await fetch(`/api/students?academic_year_id=${currentAcademicYearId}&search=${encodeURIComponent(val)}`);
      const students = await res.json();
      
      if (students.length === 0) {
        resultsBox.innerHTML = '<div class="p-3 text-xs text-slate-500">No students found matching query</div>';
        resultsBox.classList.remove('hidden');
        return;
      }
      
      resultsBox.innerHTML = '';
      students.forEach(s => {
        const item = document.createElement('div');
        item.className = 'p-3 text-xs hover:bg-slate-800 cursor-pointer flex justify-between items-center';
        item.innerHTML = `
          <div>
            <strong class="text-white block">${s.name}</strong>
            <span class="text-slate-400">${s.course} (${s.division})</span>
          </div>
          <div class="text-right">
            <span class="text-slate-500 font-mono text-[10px] block">${s.enrollment_no}</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${s.status === 'Active' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">${s.status}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          selectStudentForIssue(s);
          resultsBox.classList.add('hidden');
          issueSearchInput.value = '';
        });
        resultsBox.appendChild(item);
      });
      resultsBox.classList.remove('hidden');
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('btn-clear-sel-student').addEventListener('click', () => {
    selectedStudent = null;
    document.getElementById('selected-student-card').classList.add('hidden');
    document.getElementById('issue-student-search').classList.remove('hidden');
    validateIssueForm();
  });

  // Book search input listener
  const bookSearchInput = document.getElementById('issue-book-accession');
  bookSearchInput.addEventListener('input', async (e) => {
    const val = e.target.value.trim();
    const resultsBox = document.getElementById('issue-book-results');

    if (val.length < 2) {
      resultsBox.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/books?search=${encodeURIComponent(val)}`);
      const books = await res.json();

      if (books.length === 0) {
        resultsBox.innerHTML = '<div class="p-3 text-xs text-slate-500">No books found matching query</div>';
        resultsBox.classList.remove('hidden');
        return;
      }

      resultsBox.innerHTML = '';
      books.forEach(b => {
        const item = document.createElement('div');
        item.className = 'p-3 text-xs hover:bg-slate-800 cursor-pointer flex justify-between items-center';
        item.innerHTML = `
          <div>
            <strong class="text-white block text-xs">${b.title}</strong>
            <span class="text-slate-400 text-[10px]">By ${b.authors} | ${b.publisher}</span>
          </div>
          <div class="text-right">
            <span class="text-teal-400 font-mono font-bold text-[10px] block">${b.accession_no}</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${b.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">${b.status}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          selectBookForIssue(b);
          resultsBox.classList.add('hidden');
          bookSearchInput.value = '';
        });
        resultsBox.appendChild(item);
      });
      resultsBox.classList.remove('hidden');
    } catch (err) {
      console.error(err);
    }
  });

  // Handle Enter key for manual confirm or barcode scanner
  bookSearchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (!val) return;

      try {
        const res = await fetch(`/api/books?search=${encodeURIComponent(val)}`);
        const books = await res.json();

        // Check if query matches an accession number exactly
        const exactMatch = books.find(b => b.accession_no.toLowerCase() === val.toLowerCase());
        if (exactMatch) {
          selectBookForIssue(exactMatch);
          document.getElementById('issue-book-results').classList.add('hidden');
          bookSearchInput.value = '';
        } else if (books.length > 0) {
          // Fallback to the first matching search result
          selectBookForIssue(books[0]);
          document.getElementById('issue-book-results').classList.add('hidden');
          bookSearchInput.value = '';
        }
      } catch (err) {
        console.error('Error selecting book on Enter:', err);
      }
    }
  });

  // Clear selected book card
  document.getElementById('btn-clear-verified-book').addEventListener('click', () => {
    verifiedBook = null;
    document.getElementById('verified-book-card').classList.add('hidden');
    document.getElementById('issue-book-accession').classList.remove('hidden');
    document.getElementById('issue-book-accession').value = '';
    validateIssueForm();
  });

  // Issue Book Confirmation
  document.getElementById('btn-issue-confirm').addEventListener('click', async () => {
    if (!selectedStudent || !verifiedBook) return;
    
    try {
      const res = await fetch('/api/transactions/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          accession_no: verifiedBook.accession_no
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        showNotification(`Success! Book issued. Due Date: ${data.due_date}`, 'success');
        // Reset issue form
        selectedStudent = null;
        verifiedBook = null;
        document.getElementById('selected-student-card').classList.add('hidden');
        document.getElementById('issue-student-search').classList.remove('hidden');
        document.getElementById('verified-book-card').classList.add('hidden');
        document.getElementById('issue-book-accession').classList.remove('hidden');
        document.getElementById('issue-book-accession').value = '';
        validateIssueForm();
      } else {
        showNotification(data.error || 'Failed to issue book', 'error');
      }
    } catch (err) {
      showNotification('Error: ' + err.message, 'error');
    }
  });

  // Return search input listener
  const returnSearchInput = document.getElementById('return-book-accession');
  returnSearchInput.addEventListener('input', async (e) => {
    const val = e.target.value.trim();
    const resultsBox = document.getElementById('return-loan-results');

    if (val.length < 2) {
      resultsBox.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/transactions/search?search=${encodeURIComponent(val)}`);
      const loans = await res.json();

      if (loans.length === 0) {
        resultsBox.innerHTML = '<div class="p-3 text-xs text-slate-500">No active loans found matching query</div>';
        resultsBox.classList.remove('hidden');
        return;
      }

      resultsBox.innerHTML = '';
      loans.forEach(loan => {
        const overdueDays = getDaysOverdueFromLoan(loan);
        const item = document.createElement('div');
        item.className = 'p-3 text-xs hover:bg-slate-800 cursor-pointer flex justify-between items-center';
        item.innerHTML = `
          <div>
            <strong class="text-white block text-xs">${loan.book_title} (${loan.accession_no})</strong>
            <span class="text-slate-400 text-[10px]">Issued to: ${loan.student_name} (${loan.enrollment_no})</span>
          </div>
          <div class="text-right">
            <span class="text-slate-400 font-mono text-[10px] block">Due: ${loan.due_date}</span>
            ${overdueDays > 0 ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-950 text-red-400 animate-pulse">${overdueDays}d Overdue</span>` : `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400">On Time</span>`}
          </div>
        `;
        item.addEventListener('click', () => {
          selectLoanForReturn(loan);
          resultsBox.classList.add('hidden');
          returnSearchInput.value = '';
        });
        resultsBox.appendChild(item);
      });
      resultsBox.classList.remove('hidden');
    } catch (err) {
      console.error(err);
    }
  });

  // Handle Enter key for manual confirm or barcode scanner
  returnSearchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (!val) return;

      try {
        const res = await fetch(`/api/transactions/search?search=${encodeURIComponent(val)}`);
        const loans = await res.json();

        // Check if query matches an accession number exactly
        const exactMatch = loans.find(l => l.accession_no.toLowerCase() === val.toLowerCase());
        if (exactMatch) {
          selectLoanForReturn(exactMatch);
          document.getElementById('return-loan-results').classList.add('hidden');
          returnSearchInput.value = '';
        } else if (loans.length > 0) {
          // Fallback to the first matching active loan search result
          selectLoanForReturn(loans[0]);
          document.getElementById('return-loan-results').classList.add('hidden');
          returnSearchInput.value = '';
        }
      } catch (err) {
        console.error('Error selecting return loan on Enter:', err);
      }
    }
  });

  // Return Book Action
  document.getElementById('btn-return-action').addEventListener('click', async () => {
    if (!currentActiveLoan) return;
    
    // Check if there is an overdue fine pending
    const overdueDays = getDaysOverdueFromLoan(currentActiveLoan);
    if (overdueDays > 0) {
      // Trigger Pay/Waive Fine Modal
      openFineSettleModal(currentActiveLoan.fine_amount + (overdueDays * 10), true);
    } else {
      // Return directly
      await processReturn(currentActiveLoan.accession_no, 'None');
    }
  });

  // Renew Book Action
  document.getElementById('btn-renew-action').addEventListener('click', async () => {
    if (!currentActiveLoan) return;
    
    // Rule: Max 3 renewals check
    if (currentActiveLoan.renewal_count >= 3) {
      showNotification('Maximum 3 renewal cycles reached. Book must be returned.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/transactions/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: currentActiveLoan.id })
      });
      const data = await res.json();
      
      if (res.ok) {
        let successMsg = `Book renewed successfully. New Due Date: ${data.new_due_date}.`;
        if (data.fine_added > 0) {
          successMsg += ` Overdue fine of ₹${data.fine_added} attached to record.`;
        }
        showNotification(successMsg, 'success');
        
        // Reset active return panel
        document.getElementById('return-loan-details').classList.add('hidden');
        document.getElementById('return-book-accession').value = '';
        currentActiveLoan = null;
      } else {
        showNotification(data.error || 'Failed to renew book', 'error');
      }
    } catch (err) {
      showNotification('Error renewing: ' + err.message, 'error');
    }
  });

  // Fine Payment Confirm Button in Modal
  document.getElementById('btn-confirm-fine').addEventListener('click', async () => {
    const action = document.querySelector('input[name="settle-action"]:checked').value;
    const notes = document.getElementById('fine-settle-notes').value.trim();
    
    document.getElementById('modal-fine-pay').classList.add('hidden');
    
    if (window.settlingViaReturn) {
      // This settling is part of return process
      await processReturn(currentActiveLoan.accession_no, action, notes);
    } else {
      // This is a direct payment from student profile
      try {
        const res = await fetch(`/api/transactions/${window.settlingTransactionId}/fine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes })
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(`Fine recorded as ${action} successfully.`, 'success');
          // Reload student profile modal
          if (selectedStudent) {
            viewStudentProfile(selectedStudent.id);
          }
        } else {
          showNotification(data.error || 'Failed to record fine payment', 'error');
        }
      } catch (err) {
        showNotification('Error recording payment: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('btn-close-fine').addEventListener('click', () => {
    document.getElementById('modal-fine-pay').classList.add('hidden');
  });

  // --- Student Registry Events ---
  document.getElementById('students-search-input').addEventListener('input', () => {
    loadStudents();
  });

  document.getElementById('btn-new-student-modal').addEventListener('click', () => {
    document.getElementById('form-new-student').reset();
    document.getElementById('new-student-id').value = '';
    document.getElementById('student-modal-title').innerText = 'Register Student Form';
    document.getElementById('btn-submit-student').innerText = 'Submit Registration';
    document.getElementById('modal-new-student').classList.remove('hidden');
  });
  document.getElementById('btn-close-new-student').addEventListener('click', () => {
    document.getElementById('modal-new-student').classList.add('hidden');
  });

  // Create / Update Student Submit
  document.getElementById('form-new-student').addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('new-student-id').value;
    const payload = {
      name: document.getElementById('new-student-name').value.trim(),
      enrollment_no: document.getElementById('new-student-enroll').value.trim(),
      course: document.getElementById('new-student-course').value,
      division: document.getElementById('new-student-division').value.trim(),
      mobile: document.getElementById('new-student-mobile').value.trim(),
      status: document.getElementById('new-student-status').value,
      academic_year_id: currentAcademicYearId
    };

    const method = studentId ? 'PUT' : 'POST';
    const url = studentId ? `/api/students/${studentId}` : '/api/students';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(studentId ? 'Student profile updated successfully.' : `Student "${data.name}" enrolled successfully.`, 'success');
        document.getElementById('form-new-student').reset();
        document.getElementById('modal-new-student').classList.add('hidden');
        loadStudents();
      } else {
        showNotification(data.error || 'Operation failed', 'error');
      }
    } catch (err) {
      showNotification('Error saving student profile: ' + err.message, 'error');
    }
  });

  // Student Profile Modals
  document.getElementById('btn-close-profile').addEventListener('click', () => {
    document.getElementById('modal-student-profile').classList.add('hidden');
    selectedStudent = null;
    loadStudents(); // Refresh table status
  });

  // Printable clearance certificate button
  document.getElementById('btn-print-nodues').addEventListener('click', () => {
    if (!selectedStudent) return;
    printNoDuesCertificate();
  });

  // Student bulk import modal
  document.getElementById('btn-import-students-modal').addEventListener('click', () => {
    document.getElementById('modal-import-students').classList.remove('hidden');
  });
  document.getElementById('btn-close-import-students').addEventListener('click', () => {
    document.getElementById('modal-import-students').classList.add('hidden');
  });
  document.getElementById('btn-submit-import-students').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-students-file');
    const csvText = document.getElementById('import-students-csv-text').value.trim();
    const overwriteChecked = document.getElementById('import-students-overwrite').checked;

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        try {
          showNotification('Uploading and processing student spreadsheet...', 'info');
          const res = await fetch(`/api/students/upload-excel?academic_year_id=${currentAcademicYearId}&overwrite=${overwriteChecked}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: arrayBuffer
          });
          const data = await res.json();
          if (res.ok) {
            let msg = data.message;
            if (data.details && data.details.length > 0) {
              msg += ` Note: Some rows had warnings/duplicate errors.`;
            }
            showNotification(msg, data.details && data.details.length > 0 ? 'info' : 'success');
            fileInput.value = '';
            document.getElementById('modal-import-students').classList.add('hidden');
            loadStudents();
          } else {
            showNotification(data.error || 'Excel student import failed', 'error');
          }
        } catch (err) {
          showNotification('Upload error: ' + err.message, 'error');
        }
      };

      reader.onerror = () => {
        showNotification('Failed to read local spreadsheet file.', 'error');
      };

      reader.readAsArrayBuffer(file);
      return;
    }

    if (!csvText) {
      showNotification('Please select an Excel file to upload or paste raw CSV text.', 'error');
      return;
    }
    
    const parsed = parseCSVText(csvText);
    if (parsed.length === 0) {
      showNotification('Failed to parse CSV lines or headers', 'error');
      return;
    }
    
    // Map CSV keys to API field formats
    // CSV standard header: Name, Enrollment Number, Course, Division, Mobile Number
    const studentsPayload = parsed.map(row => {
      const nameKey = Object.keys(row).find(k => k.includes('name'));
      const enrollKey = Object.keys(row).find(k => k.includes('enroll') || k.includes('id'));
      const courseKey = Object.keys(row).find(k => k.includes('course') || k.includes('class'));
      const divKey = Object.keys(row).find(k => k.includes('div') || k.includes('sec'));
      const mobKey = Object.keys(row).find(k => k.includes('mob') || k.includes('phone'));
      
      return {
        name: row[nameKey] || '',
        enrollment_no: row[enrollKey] || '',
        course: row[courseKey] || '',
        division: row[divKey] || '',
        mobile: row[mobKey] || '',
        status: 'Active'
      };
    });

    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentsPayload, academic_year_id: currentAcademicYearId, overwrite: overwriteChecked })
      });
      const data = await res.json();
      if (res.ok) {
        let msg = data.message;
        if (data.details && data.details.length > 0) {
          msg += ` Warning: ${data.details.length} lines skipped (errors: ${data.details.slice(0,2).join(', ')})`;
        }
        showNotification(msg, data.details.length > 0 ? 'info' : 'success');
        document.getElementById('import-students-csv-text').value = '';
        document.getElementById('modal-import-students').classList.add('hidden');
        loadStudents();
      } else {
        showNotification(data.error || 'Import failed', 'error');
      }
    } catch (err) {
      showNotification('Import failed: ' + err.message, 'error');
    }
  });

  // --- Book Inventory Events ---
  const booksSearchEl = document.getElementById('books-search-input');
  if (booksSearchEl) {
    booksSearchEl.addEventListener('input', () => {
      loadBooks();
    });
  }

  const booksCategoryFilterEl = document.getElementById('books-category-filter');
  if (booksCategoryFilterEl) {
    booksCategoryFilterEl.addEventListener('change', (e) => {
      updateActiveCategoryChip(e.target.value);
      loadBooks();
    });
  }

  document.getElementById('new-book-specialty').addEventListener('change', (e) => {
    const customInput = document.getElementById('new-book-custom-specialty');
    if (e.target.value === 'custom') {
      customInput.classList.remove('hidden');
      customInput.required = true;
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
      customInput.required = false;
      customInput.value = '';
    }
  });
  
  document.getElementById('btn-new-book-modal').addEventListener('click', async () => {
    // Reset form
    document.getElementById('form-new-book').reset();
    
    document.getElementById('new-book-id').value = '';
    document.getElementById('new-book-call-no').value = '';
    document.getElementById('book-modal-title').innerText = 'Manual Book Registry';
    document.getElementById('new-book-qty-container').classList.remove('hidden');
    document.getElementById('btn-submit-book').innerText = 'Catalog Book';

    // Set default book entry date to today
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    document.getElementById('new-book-entry-date').value = todayStr;
    
    await loadSpecialtyDropdown();
    
    document.getElementById('modal-new-book').classList.remove('hidden');
  });
  document.getElementById('btn-close-new-book').addEventListener('click', () => {
    document.getElementById('modal-new-book').classList.add('hidden');
  });

  // Add Book manual submit
  document.getElementById('form-new-book').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookId = document.getElementById('new-book-id').value;
    
    const specialtySelect = document.getElementById('new-book-specialty').value;
    const customSpecialty = document.getElementById('new-book-custom-specialty').value.trim();
    const finalSpecialty = specialtySelect === 'custom' ? customSpecialty : specialtySelect;
    
    if (specialtySelect === 'custom' && !customSpecialty) {
      showNotification('Please enter a custom specialty name.', 'error');
      return;
    }

    const payload = {
      accession_no: document.getElementById('new-book-accession').value.trim(),
      title: document.getElementById('new-book-title').value.trim(),
      authors: document.getElementById('new-book-authors').value.trim(),
      edition: document.getElementById('new-book-edition').value.trim(),
      publisher: document.getElementById('new-book-publisher').value.trim(),
      publishing_year: document.getElementById('new-book-year').value,
      isbn: document.getElementById('new-book-isbn').value.trim(),
      specialty: finalSpecialty,
      rack_no: document.getElementById('new-book-rack').value.trim(),
      shelf_no: document.getElementById('new-book-shelf').value.trim(),
      status: document.getElementById('new-book-status').value,
      qty: parseInt(document.getElementById('new-book-qty').value) || 1,
      pages: parseInt(document.getElementById('new-book-pages').value) || 0,
      volume: document.getElementById('new-book-volume').value.trim(),
      cost: parseFloat(document.getElementById('new-book-cost').value) || 0.0,
      bill_no: document.getElementById('new-book-bill-no').value.trim(),
      entry_date: document.getElementById('new-book-entry-date').value,
      call_no: document.getElementById('new-book-call-no').value.trim()
    };

    const isEdit = bookId !== '';
    const url = isEdit ? `/api/books/${bookId}` : '/api/books';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        const successMsg = isEdit ? 'Book details updated successfully.' : `Book "${data.title}" cataloged successfully.`;
        showNotification(successMsg, 'success');
        document.getElementById('form-new-book').reset();
        document.getElementById('modal-new-book').classList.add('hidden');
        loadBooks();
      } else {
        showNotification(data.error || 'Book saving failed', 'error');
      }
    } catch (err) {
      showNotification('Error saving book: ' + err.message, 'error');
    }
  });

  // Book CSV Import modal
  document.getElementById('btn-import-books-modal').addEventListener('click', () => {
    document.getElementById('modal-import-books').classList.remove('hidden');
  });
  document.getElementById('btn-close-import-books').addEventListener('click', () => {
    document.getElementById('modal-import-books').classList.add('hidden');
  });
  document.getElementById('btn-submit-import-books').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-books-file');
    const csvText = document.getElementById('import-books-csv-text').value.trim();

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        try {
          showNotification('Uploading and processing spreadsheet...', 'info');
          const res = await fetch('/api/books/upload-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: arrayBuffer
          });
          const data = await res.json();
          if (res.ok) {
            let msg = data.message;
            if (data.details && data.details.length > 0) {
              msg += ` Note: Some rows had warnings/duplicate errors.`;
            }
            showNotification(msg, data.details && data.details.length > 0 ? 'info' : 'success');
            fileInput.value = '';
            document.getElementById('modal-import-books').classList.add('hidden');
            loadBooks();
          } else {
            showNotification(data.error || 'Excel import failed', 'error');
          }
        } catch (err) {
          showNotification('Upload error: ' + err.message, 'error');
        }
      };

      reader.onerror = () => {
        showNotification('Failed to read local spreadsheet file.', 'error');
      };

      reader.readAsArrayBuffer(file);
      return;
    }

    if (!csvText) {
      showNotification('Please select an Excel file to upload or paste raw CSV text.', 'error');
      return;
    }

    const parsed = parseCSVText(csvText);
    if (parsed.length === 0) {
      showNotification('Failed to parse CSV lines or headers', 'error');
      return;
    }

    // Map CSV keys to API field formats
    // CSV standard header: Accession Number, Book Title, Primary Authors, Edition, Publisher, Publishing Year, ISBN, Specialty, Rack Number, Shelf Number
    const booksPayload = parsed.map(row => {
      const accKey = Object.keys(row).find(k => k.includes('accession') || k.includes('acc'));
      const titleKey = Object.keys(row).find(k => k.includes('title') || k.includes('book'));
      const authorKey = Object.keys(row).find(k => k.includes('author'));
      const editKey = Object.keys(row).find(k => k.includes('edition') || k.includes('edit'));
      const pubKey = Object.keys(row).find(k => k.includes('pub') && !k.includes('year'));
      const yearKey = Object.keys(row).find(k => k.includes('year') || k.includes('date'));
      const isbnKey = Object.keys(row).find(k => k.includes('isbn'));
      const specKey = Object.keys(row).find(k => k.includes('specialty') || k.includes('cat'));
      const rackKey = Object.keys(row).find(k => k.includes('rack'));
      const shelfKey = Object.keys(row).find(k => k.includes('shelf'));
      const qtyKey = Object.keys(row).find(k => k.includes('qty') || k.includes('quant'));
      
      const pagesKey = Object.keys(row).find(k => k.includes('page') || k.includes('pg'));
      const volKey = Object.keys(row).find(k => k.includes('vol'));
      const costKey = Object.keys(row).find(k => k.includes('cost') || k.includes('price'));
      const billKey = Object.keys(row).find(k => k.includes('bill'));
      const entryKey = Object.keys(row).find(k => k.includes('entry') || k.includes('catalog'));

      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      return {
        accession_no: row[accKey] || '',
        title: row[titleKey] || '',
        authors: row[authorKey] || '',
        edition: row[editKey] || '1st Edition',
        publisher: row[pubKey] || '',
        publishing_year: row[yearKey] || '2020',
        isbn: row[isbnKey] || '',
        specialty: row[specKey] || 'General Nursing',
        rack_no: row[rackKey] || 'Rack 1',
        shelf_no: row[shelfKey] || 'Shelf A',
        status: 'Available',
        qty: parseInt(row[qtyKey]) || 1,
        pages: parseInt(row[pagesKey]) || 0,
        volume: row[volKey] || '',
        cost: parseFloat(row[costKey]) || 0.0,
        bill_no: row[billKey] || '',
        entry_date: row[entryKey] || todayStr
      };
    });

    try {
      const res = await fetch('/api/books/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: booksPayload })
      });
      const data = await res.json();
      if (res.ok) {
        let msg = data.message;
        if (data.details && data.details.length > 0) {
          msg += ` skipped lines: ${data.details.length}`;
        }
        showNotification(msg, data.details.length > 0 ? 'info' : 'success');
        document.getElementById('import-books-csv-text').value = '';
        document.getElementById('modal-import-books').classList.add('hidden');
        loadBooks();
      } else {
        showNotification(data.error || 'Import failed', 'error');
      }
    } catch (err) {
      showNotification('Import failed: ' + err.message, 'error');
    }
  });

  // --- Journals Registry ---
  document.getElementById('btn-new-journal-modal').addEventListener('click', () => {
    document.getElementById('journal-id').value = '';
    document.getElementById('journal-modal-title').innerText = 'New Journal Subscription';
    document.getElementById('form-journal').reset();
    document.getElementById('modal-journal').classList.remove('hidden');
  });
  document.getElementById('btn-close-journal').addEventListener('click', () => {
    document.getElementById('modal-journal').classList.add('hidden');
  });

  // Journal form submit
  document.getElementById('form-journal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const jId = document.getElementById('journal-id').value;
    const payload = {
      name: document.getElementById('journal-name').value.trim(),
      issn: document.getElementById('journal-issn').value.trim(),
      publisher: document.getElementById('journal-publisher').value.trim(),
      frequency: document.getElementById('journal-frequency').value,
      volume_issue: document.getElementById('journal-volume').value.trim(),
      subscription_period: document.getElementById('journal-sub-period').value.trim(),
      rack_no: document.getElementById('journal-rack').value.trim(),
      shelf_no: document.getElementById('journal-shelf').value.trim(),
      status: document.getElementById('journal-status').value
    };

    try {
      let res, message;
      if (jId) {
        res = await fetch(`/api/journals/${jId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        message = `Journal updated successfully.`;
      } else {
        res = await fetch('/api/journals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        message = `Journal registered successfully.`;
      }
      
      const data = await res.json();
      if (res.ok) {
        showNotification(message, 'success');
        document.getElementById('form-journal').reset();
        document.getElementById('modal-journal').classList.add('hidden');
        loadJournals();
      } else {
        showNotification(data.error || 'Operation failed', 'error');
      }
    } catch (err) {
      showNotification('Error saving journal: ' + err.message, 'error');
    }
  });

  // --- Reports Tab Events ---
  document.getElementById('reports-type-select').addEventListener('change', (e) => {
    currentReportType = e.target.value;
    document.getElementById('reports-year-select').value = 'all';
    document.getElementById('reports-month-select').value = 'all';
    loadReportPreview();
  });

  document.getElementById('reports-year-select').addEventListener('change', () => {
    loadReportPreview();
  });

  document.getElementById('reports-month-select').addEventListener('change', () => {
    loadReportPreview();
  });
  
  document.getElementById('btn-print-report').addEventListener('click', () => {
    printCurrentReport();
  });

  document.getElementById('btn-export-excel').addEventListener('click', () => {
    exportCurrentReportToCSV();
  });

  // --- Book Labels Specific Controls ---
  const btnLabelGrid = document.getElementById('btn-label-grid-view');
  const btnLabelTable = document.getElementById('btn-label-table-view');
  if (btnLabelGrid && btnLabelTable) {
    btnLabelGrid.addEventListener('click', () => {
      setLabelViewMode('grid');
    });
    btnLabelTable.addEventListener('click', () => {
      setLabelViewMode('table');
    });
  }

  let labelDebounceTimer = null;
  const debouncedLabelReload = () => {
    clearTimeout(labelDebounceTimer);
    labelDebounceTimer = setTimeout(() => {
      loadReportPreview();
    }, 350);
  };

  const labelFromAcc = document.getElementById('label-from-acc');
  const labelToAcc = document.getElementById('label-to-acc');
  const labelSpecialty = document.getElementById('label-specialty-select');
  const labelSearch = document.getElementById('label-search-input');

  if (labelFromAcc) labelFromAcc.addEventListener('input', debouncedLabelReload);
  if (labelToAcc) labelToAcc.addEventListener('input', debouncedLabelReload);
  if (labelSpecialty) labelSpecialty.addEventListener('change', () => loadReportPreview());
  if (labelSearch) labelSearch.addEventListener('input', debouncedLabelReload);

  document.getElementById('btn-print-rules').addEventListener('click', () => {
    const printContent = document.getElementById('print-content');
    const printLetterhead = document.getElementById('print-letterhead');
    const printFooter = document.getElementById('print-footer');

    // Ensure official letterhead is visible with rules title
    if (printLetterhead) {
      printLetterhead.classList.remove('hidden');
      printLetterhead.className = 'text-center mb-3 border-b-2 border-slate-900 pb-2';
    }
    const printSubheading = document.getElementById('print-subheading');
    if (printSubheading) {
      printSubheading.innerText = 'OFFICIAL LIBRARY POLICIES & CODE OF CONDUCT';
    }

    // Keep footer compact to prevent 2nd page spillover
    if (printFooter) {
      printFooter.classList.remove('hidden');
      printFooter.className = 'mt-5 flex justify-between items-end border-t border-slate-300 pt-2 text-[11px]';
    }

    const now = new Date();
    const timestampEl = document.getElementById('print-timestamp');
    if (timestampEl) timestampEl.innerText = now.toLocaleString();

    // Clean, structured rules body formatted specifically for print (single page)
    printContent.innerHTML = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #0f172a; line-height: 1.35; padding: 0 4px;">
        <div style="text-align: center; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1;">
          <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #0f766e;">Official Regulations & Code of Conduct • Academic Session 2026–2027</span>
          <span style="font-size: 10px; color: #64748b; font-family: monospace; display: block; margin-top: 1px;">Document Ref: JD-LIB-RULES-2026</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11px;">
          <div style="border-left: 3px solid #0d9488; padding-left: 10px; background: #f8fafc; padding-top: 4px; padding-bottom: 4px; border-radius: 0 4px 4px 0;">
            <div style="font-weight: 800; font-size: 11.5px; color: #0f172a; margin-bottom: 2px;">01. General Borrowing Quotas</div>
            <ul style="margin: 0; padding-left: 16px; list-style-type: disc; color: #334155;">
              <li>Students are permitted to borrow a maximum of <strong>three (3) books</strong> concurrently.</li>
              <li>No additional books will be issued if the borrowing count is at capacity.</li>
              <li>Clearance (No-Dues) is strictly conditional on having zero active loans.</li>
            </ul>
          </div>

          <div style="border-left: 3px solid #0d9488; padding-left: 10px; background: #f8fafc; padding-top: 4px; padding-bottom: 4px; border-radius: 0 4px 4px 0;">
            <div style="font-weight: 800; font-size: 11.5px; color: #0f172a; margin-bottom: 2px;">02. Loan Period & Renewal Limits</div>
            <ul style="margin: 0; padding-left: 16px; list-style-type: disc; color: #334155;">
              <li>The standard loan period for all textbook copies is <strong>fifteen (15) days</strong>.</li>
              <li>A book must be returned or renewed on or before the due date.</li>
              <li>A single issue transaction can be renewed for a maximum of <strong>three (3) consecutive cycles</strong>.</li>
              <li>Upon reaching the 3rd renewal limit, the book must be returned to the library counter before it can be re-issued.</li>
            </ul>
          </div>

          <div style="border-left: 3px solid #0d9488; padding-left: 10px; background: #f8fafc; padding-top: 4px; padding-bottom: 4px; border-radius: 0 4px 4px 0;">
            <div style="font-weight: 800; font-size: 11.5px; color: #0f172a; margin-bottom: 2px;">03. Late Returns & Overdue Penalties</div>
            <ul style="margin: 0; padding-left: 16px; list-style-type: disc; color: #334155;">
              <li>Any student failing to return or renew a book after the <strong>15-day period</strong> will incur an overdue penalty.</li>
              <li>The overdue penalty is set at a flat rate of <strong>₹10 per day</strong> for each overdue day.</li>
              <li>Fines accumulate automatically in the system and must be paid in full or waived by authorized personnel prior to clearance.</li>
            </ul>
          </div>

          <div style="border-left: 3px solid #0d9488; padding-left: 10px; background: #f8fafc; padding-top: 4px; padding-bottom: 4px; border-radius: 0 4px 4px 0;">
            <div style="font-weight: 800; font-size: 11.5px; color: #0f172a; margin-bottom: 2px;">04. Care of Library Assets</div>
            <ul style="margin: 0; padding-left: 16px; list-style-type: disc; color: #334155;">
              <li>Mutilation, underlining, highlighting, or tearing pages of books is strictly forbidden.</li>
              <li>In the event of total loss or structural damage, the borrower is liable to replace the volume or pay double the list price.</li>
              <li>Academic journals and reference periodicals are strictly for in-library reading and cannot be checked out.</li>
            </ul>
          </div>
        </div>

        <div style="margin-top: 10px; padding-top: 6px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; color: #475569;">
          <span><strong>Approved By:</strong> Principal, J & D Institute of Nursing</span>
          <span><strong>Effective Date:</strong> Academic Session 2026–2027</span>
        </div>
      </div>
    `;

    window.print();
  });
}

// Global active session switch handler
async function setActiveAcademicYear(id) {
  try {
    const res = await fetch(`/api/academic-years/${id}/active`, { method: 'PUT' });
    if (res.ok) {
      showNotification(`Switched active academic session successfully.`, 'success');
      // If we are currently on Students view, reload them
      if (activeTab === 'students') {
        loadStudents();
      }
      // Reset selected student in Circulation Desk to avoid mismatch
      selectedStudent = null;
      document.getElementById('selected-student-card').classList.add('hidden');
      document.getElementById('issue-student-search').classList.remove('hidden');
      validateIssueForm();
    } else {
      const data = await res.json();
      showNotification(data.error || 'Failed to switch active year', 'error');
    }
  } catch (err) {
    showNotification('Error switching session: ' + err.message, 'error');
  }
}

// ==========================================
// 4. CIRCULATION PROCESSES
// ==========================================
function selectBookForIssue(book) {
  verifiedBook = book;
  document.getElementById('ver-book-title').innerText = book.title;
  document.getElementById('ver-book-authors').innerText = `By ${book.authors} (${book.edition})`;
  
  const statusSpan = document.getElementById('ver-book-status');
  statusSpan.innerText = book.status;
  if (book.status === 'Available') {
    statusSpan.className = 'font-bold text-emerald-400';
  } else {
    statusSpan.className = 'font-bold text-red-400';
  }
  
  document.getElementById('ver-book-location').innerText = `${book.rack_no}, ${book.shelf_no}${book.call_no ? ` • Call: ${book.call_no}` : ''}`;
  document.getElementById('verified-book-card').classList.remove('hidden');
  document.getElementById('issue-book-accession').classList.add('hidden');
  validateIssueForm();
}

function selectStudentForIssue(student) {
  selectedStudent = student;
  
  // Show select card
  document.getElementById('sel-student-name').innerText = student.name;
  document.getElementById('sel-student-meta').innerText = `${student.course} | ${student.division} | Enrollment: ${student.enrollment_no}`;
  document.getElementById('sel-student-mobile').innerText = `Mob: ${student.mobile}`;
  
  // Fetch active borrowing count to enforce max 3 books
  fetch(`/api/students/${student.id}`)
    .then(r => r.json())
    .then(data => {
      const loanCount = data.activeLoans.length;
      const quotaSpan = document.getElementById('sel-student-quota');
      quotaSpan.innerText = `Loans: ${loanCount}/3`;
      
      if (loanCount >= 3) {
        quotaSpan.className = 'inline-block bg-red-950 text-red-400 border border-red-900 px-2.5 py-0.5 rounded-full text-xs font-bold';
        showNotification('Maximum borrowing limit of 3 books reached.', 'error');
      } else {
        quotaSpan.className = 'inline-block bg-emerald-950 text-emerald-400 border border-emerald-900 px-2.5 py-0.5 rounded-full text-xs font-bold';
      }
      
      document.getElementById('selected-student-card').classList.remove('hidden');
      document.getElementById('issue-student-search').classList.add('hidden');
      validateIssueForm();
    })
    .catch(err => {
      showNotification('Error fetching student loan count: ' + err.message, 'error');
    });
}

function validateIssueForm() {
  const confirmBtn = document.getElementById('btn-issue-confirm');
  
  const hasStudent = !!selectedStudent;
  const hasBook = !!verifiedBook;
  const isBookAvailable = verifiedBook ? verifiedBook.status === 'Available' : false;
  
  if (hasStudent && hasBook && isBookAvailable) {
    // Check quota
    const quotaText = document.getElementById('sel-student-quota').innerText;
    const currentLoansCount = parseInt(quotaText.match(/Loans: (\d)\/3/)[1]);
    
    if (currentLoansCount < 3) {
      confirmBtn.removeAttribute('disabled');
      confirmBtn.className = 'w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold tracking-wide shadow-md active:scale-98 cursor-pointer transition-all';
      return;
    }
  }
  
  confirmBtn.setAttribute('disabled', 'true');
  confirmBtn.className = 'w-full py-3.5 bg-slate-700 text-slate-400 cursor-not-allowed rounded-xl text-sm font-bold tracking-wide shadow-md active:scale-98 transition-all';
}

function selectLoanForReturn(loan) {
  currentActiveLoan = loan;
  
  // Populate details view
  document.getElementById('ret-book-title').innerText = loan.book_title;
  document.getElementById('ret-book-acc').innerText = loan.accession_no;
  document.getElementById('ret-renewal-badge').innerText = `Renewals: ${loan.renewal_count}/3`;
  document.getElementById('ret-student-name').innerText = loan.student_name;
  document.getElementById('ret-student-enroll').innerText = `Enrollment: ${loan.enrollment_no}`;
  document.getElementById('ret-issue-date').innerText = loan.issue_date;
  document.getElementById('ret-due-date').innerText = loan.due_date;
  
  // Dynamic Overdue calculation (today)
  const overdueDays = getDaysOverdueFromLoan(loan);
  const overdueBox = document.getElementById('ret-overdue-box');
  const overdueDaysLabel = document.getElementById('ret-overdue-days');
  const fineTotalLabel = document.getElementById('ret-fine-total');
  
  if (overdueDays > 0) {
    overdueBox.className = 'bg-red-950/40 border border-red-900/50 rounded-lg p-3.5 flex items-center justify-between text-xs animate-pulse';
    overdueDaysLabel.innerText = `${overdueDays} Days Overdue * ₹10/day`;
    fineTotalLabel.innerText = `₹${loan.fine_amount + (overdueDays * 10)}`;
  } else {
    overdueBox.className = 'bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between text-xs';
    overdueDaysLabel.innerText = `No overdue fine pending.`;
    fineTotalLabel.innerText = `₹0`;
  }

  document.getElementById('return-loan-details').classList.remove('hidden');
}

async function loadActiveLoanForReturn(accessionNo) {
  try {
    const res = await fetch(`/api/books?search=${encodeURIComponent(accessionNo)}`);
    const books = await res.json();
    const book = books.find(b => b.accession_no.toLowerCase() === accessionNo.toLowerCase());
    
    if (!book) {
      showNotification(`Book with Accession Number "${accessionNo}" not found.`, 'error');
      document.getElementById('return-loan-details').classList.add('hidden');
      currentActiveLoan = null;
      return;
    }
    
    if (book.status !== 'Issued') {
      showNotification(`Book is not currently issued (Status: ${book.status}).`, 'info');
      document.getElementById('return-loan-details').classList.add('hidden');
      currentActiveLoan = null;
      return;
    }

    // Locate active transaction for this book
    const reportsRes = await fetch('/api/reports/issue-return-register');
    const transactions = await reportsRes.json();
    const activeLoan = transactions.find(t => t.accession_no.toLowerCase() === accessionNo.toLowerCase() && t.return_date === null);
    
    if (!activeLoan) {
      showNotification(`Active transaction record missing for book: ${accessionNo}`, 'error');
      document.getElementById('return-loan-details').classList.add('hidden');
      currentActiveLoan = null;
      return;
    }

    currentActiveLoan = activeLoan;
    
    // Populate details view
    document.getElementById('ret-book-title').innerText = activeLoan.book_title;
    document.getElementById('ret-book-acc').innerText = activeLoan.accession_no;
    document.getElementById('ret-renewal-badge').innerText = `Renewals: ${activeLoan.renewal_count}/3`;
    document.getElementById('ret-student-name').innerText = activeLoan.student_name;
    document.getElementById('ret-student-enroll').innerText = `Enrollment: ${activeLoan.enrollment_no}`;
    document.getElementById('ret-issue-date').innerText = activeLoan.issue_date;
    document.getElementById('ret-due-date').innerText = activeLoan.due_date;
    
    // Dynamic Overdue calculation (today)
    const overdueDays = getDaysOverdueFromLoan(activeLoan);
    const overdueBox = document.getElementById('ret-overdue-box');
    const overdueDaysLabel = document.getElementById('ret-overdue-days');
    const fineTotalLabel = document.getElementById('ret-fine-total');
    
    if (overdueDays > 0) {
      overdueBox.className = 'bg-red-950/40 border border-red-900/50 rounded-lg p-3.5 flex items-center justify-between text-xs animate-pulse';
      overdueDaysLabel.innerText = `${overdueDays} Days Overdue * ₹10/day`;
      fineTotalLabel.innerText = `₹${activeLoan.fine_amount + (overdueDays * 10)}`;
    } else {
      overdueBox.className = 'bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between text-xs';
      overdueDaysLabel.innerText = `No overdue fine pending.`;
      fineTotalLabel.innerText = `₹0`;
    }

    document.getElementById('return-loan-details').classList.remove('hidden');
  } catch (err) {
    showNotification('Error loading loan details: ' + err.message, 'error');
  }
}

function getDaysOverdueFromLoan(loan) {
  const due = new Date(loan.due_date + 'T00:00:00');
  const today = new Date();
  due.setHours(0,0,0,0);
  today.setHours(0,0,0,0);
  const diff = today.getTime() - due.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Fine dialog handler
function openFineSettleModal(amount, viaReturn = false, transactionId = null) {
  window.settlingViaReturn = viaReturn;
  window.settlingTransactionId = transactionId;
  document.getElementById('fine-settle-amount').innerText = `₹${amount}`;
  document.getElementById('fine-settle-notes').value = '';
  document.getElementById('modal-fine-pay').classList.remove('hidden');
}

async function processReturn(accessionNo, action, notes = '') {
  try {
    const res = await fetch('/api/transactions/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accession_no: accessionNo,
        action: action, // 'Paid' or 'Waived' or 'None'
        notes: notes
      })
    });
    const data = await res.json();
    if (res.ok) {
      showNotification(`Book returned successfully. Fines: ₹${data.fine_amount} (${data.fine_status})`, 'success');
      
      // Reset return panel
      document.getElementById('return-loan-details').classList.add('hidden');
      document.getElementById('return-book-accession').value = '';
      currentActiveLoan = null;
    } else {
      showNotification(data.error || 'Failed to process return', 'error');
    }
  } catch (err) {
    showNotification('Error: ' + err.message, 'error');
  }
}

// ==========================================
// 5. STUDENT REGISTRY MODULE
// ==========================================
async function loadStudents() {
  const searchVal = document.getElementById('students-search-input').value.trim();
  const url = `/api/students?academic_year_id=${currentAcademicYearId}&search=${encodeURIComponent(searchVal)}`;
  
  try {
    const res = await fetch(url);
    const students = await res.json();
    
    const tbody = document.getElementById('students-table-body');
    tbody.innerHTML = '';
    
    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-xs text-slate-500 font-semibold">No students found matching your filters.</td></tr>';
      return;
    }
    
    students.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/30 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4 font-mono text-xs font-bold text-teal-400">${s.enrollment_no}</td>
        <td class="px-6 py-4 font-bold text-white">${s.name}</td>
        <td class="px-6 py-4 text-xs font-semibold">${s.course}</td>
        <td class="px-6 py-4 text-xs text-slate-400">${s.division}</td>
        <td class="px-6 py-4 text-xs text-slate-400 font-mono">${s.mobile}</td>
        <td class="px-6 py-4 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${s.status === 'Active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' : s.status === 'On Hold' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' : 'bg-slate-800 text-slate-400 border border-slate-700/60'}">
            ${s.status}
          </span>
        </td>
        <td class="px-6 py-4 text-right flex justify-end gap-3 items-center">
          <button class="btn-view-profile text-teal-400 hover:text-teal-300 text-xs font-extrabold" data-id="${s.id}">
            View Profile
          </button>
          <button class="btn-edit-student text-amber-500 hover:text-amber-400 text-xs font-bold" data-id="${s.id}">
            Edit
          </button>
          <button class="btn-delete-student text-red-500 hover:text-red-400 text-xs font-bold" data-id="${s.id}" data-name="${s.name}">
            Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Add profile trigger events
    document.querySelectorAll('.btn-view-profile').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const studentId = btn.getAttribute('data-id');
        viewStudentProfile(studentId);
      });
    });

    // Add edit student trigger events
    document.querySelectorAll('.btn-edit-student').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const studentId = btn.getAttribute('data-id');
        const s = students.find(x => String(x.id) === String(studentId));
        if (s) {
          openStudentEditModal(s);
        }
      });
    });

    // Add delete student trigger events
    document.querySelectorAll('.btn-delete-student').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const studentId = btn.getAttribute('data-id');
        const studentName = btn.getAttribute('data-name');
        if (confirm(`Are you sure you want to delete student "${studentName}"?`)) {
          try {
            const deleteRes = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
            const deleteData = await deleteRes.json();
            if (deleteRes.ok) {
              showNotification(deleteData.message, 'success');
              loadStudents();
            } else {
              showNotification(deleteData.error || 'Failed to delete student.', 'error');
            }
          } catch (err) {
            showNotification('Error deleting student: ' + err.message, 'error');
          }
        }
      });
    });
  } catch (err) {
    showNotification('Error loading students: ' + err.message, 'error');
  }

  // Edit student modal open helper
  function openStudentEditModal(s) {
    document.getElementById('new-student-id').value = s.id;
    document.getElementById('student-modal-title').innerText = 'Edit Student Details';
    
    document.getElementById('new-student-name').value = s.name;
    document.getElementById('new-student-enroll').value = s.enrollment_no;
    document.getElementById('new-student-course').value = s.course;
    document.getElementById('new-student-division').value = s.division;
    document.getElementById('new-student-mobile').value = s.mobile || '';
    document.getElementById('new-student-status').value = s.status || 'Active';
    
    document.getElementById('btn-submit-student').innerText = 'Update Student Details';
    document.getElementById('modal-new-student').classList.remove('hidden');
  }
}

async function viewStudentProfile(studentId) {
  try {
    const res = await fetch(`/api/students/${studentId}`);
    const data = await res.json();
    
    if (!res.ok) {
      showNotification(data.error || 'Failed to load profile', 'error');
      return;
    }

    selectedStudent = data.student;

    // Set standard profile tags
    document.getElementById('prof-name').innerText = data.student.name;
    document.getElementById('prof-enrollment').innerText = data.student.enrollment_no;
    document.getElementById('prof-course').innerText = data.student.course;
    document.getElementById('prof-division').innerText = data.student.division;
    document.getElementById('prof-mobile').innerText = data.student.mobile;
    document.getElementById('prof-status').innerText = data.student.status;
    
    // Set fine ledger
    document.getElementById('prof-fine-paid').innerText = `₹${data.fines.paid}`;
    document.getElementById('prof-fine-pending').innerText = `₹${data.fines.pending}`;
    document.getElementById('prof-fine-waived').innerText = `₹${data.fines.waived}`;

    // Populate active loans
    const activeBody = document.getElementById('prof-active-loans');
    activeBody.innerHTML = '';
    
    let hasOverdueBooks = false;
    
    if (data.activeLoans.length === 0) {
      activeBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-slate-500">No books currently borrowed.</td></tr>';
    } else {
      data.activeLoans.forEach(loan => {
        const isOverdue = loan.dynamic_fine > 0;
        if (isOverdue) hasOverdueBooks = true;

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800';
        tr.innerHTML = `
          <td class="px-4 py-3 font-mono font-bold text-teal-400">${loan.accession_no}</td>
          <td class="px-4 py-3 text-slate-200 font-semibold">${loan.title}</td>
          <td class="px-4 py-3 text-slate-400 font-mono">${loan.issue_date}</td>
          <td class="px-4 py-3 font-mono font-bold ${isOverdue ? 'text-red-400 animate-pulse' : 'text-slate-400'}">${loan.due_date}</td>
          <td class="px-4 py-3 font-bold font-mono ${isOverdue ? 'text-red-400' : 'text-slate-500'}">₹${loan.dynamic_fine}</td>
          <td class="px-4 py-3 text-right">
            ${isOverdue ? `
              <button class="bg-red-950/80 hover:bg-red-900 border border-red-900/50 text-[10px] font-black text-red-400 px-2.5 py-1 rounded transition-colors" onclick="openDirectFineSettle(${loan.id}, ${loan.dynamic_fine})">
                Settle Fine
              </button>
            ` : `<span class="text-slate-600 font-medium">None</span>`}
          </td>
        `;
        activeBody.appendChild(tr);
      });
    }

    // Populate history loans
    const historyBody = document.getElementById('prof-history-loans');
    historyBody.innerHTML = '';
    if (data.history.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-slate-500">No borrowing history found.</td></tr>';
    } else {
      data.history.forEach(hist => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800';
        tr.innerHTML = `
          <td class="px-4 py-3 font-mono text-slate-400">${hist.accession_no}</td>
          <td class="px-4 py-3 text-slate-400">${hist.title}</td>
          <td class="px-4 py-3 text-slate-500 font-mono">${hist.issue_date}</td>
          <td class="px-4 py-3 text-slate-500 font-mono">${hist.return_date}</td>
          <td class="px-4 py-3 font-mono font-bold ${hist.fine_status === 'Paid' ? 'text-emerald-400' : hist.fine_status === 'Waived' ? 'text-slate-400' : 'text-slate-600'}">
            ${hist.fine_amount > 0 ? `₹${hist.fine_amount} (${hist.fine_status})` : '₹0'}
          </td>
        `;
        historyBody.appendChild(tr);
      });
    }

    // Process Clearance Certificate badge
    const badgeBox = document.getElementById('clearance-status-box');
    const canClear = (data.activeLoans.length === 0) && (data.fines.pending === 0);
    
    if (canClear) {
      badgeBox.className = 'mt-3 p-3 rounded-lg text-xs font-bold flex items-center justify-between bg-emerald-950/40 border border-emerald-900/60 text-emerald-400';
      badgeBox.innerHTML = `
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
          ELIGIBLE FOR NO-DUES CLEARANCE
        </span>
        <span class="bg-emerald-900/60 px-2 py-0.5 rounded">All Clear</span>
      `;
      document.getElementById('btn-print-nodues').removeAttribute('disabled');
      document.getElementById('btn-print-nodues').className = 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all';
    } else {
      badgeBox.className = 'mt-3 p-3 rounded-lg text-xs font-bold flex items-center justify-between bg-red-950/40 border border-red-900/60 text-red-400';
      badgeBox.innerHTML = `
        <span class="flex items-center gap-1.5 animate-pulse">
          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          CLEARANCE BLOCKED: ${data.activeLoans.length > 0 ? 'Pending Returns' : 'Pending Fines'}
        </span>
        <span class="bg-red-900/60 px-2 py-0.5 rounded">Dues Found</span>
      `;
      document.getElementById('btn-print-nodues').setAttribute('disabled', 'true');
      document.getElementById('btn-print-nodues').className = 'bg-slate-700 text-slate-400 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-not-allowed';
    }

    document.getElementById('modal-student-profile').classList.remove('hidden');
  } catch (err) {
    showNotification('Error loading profile: ' + err.message, 'error');
  }
}

// Global hook for direct fine settlement in student profile
window.openDirectFineSettle = function(transactionId, amount) {
  openFineSettleModal(amount, false, transactionId);
};

// ==========================================
// 6. BOOK INVENTORY MODULE
// ==========================================
let masterCategoriesPopulated = false;

async function populateMasterBookCategories(forceReload = false) {
  if (masterCategoriesPopulated && !forceReload) return;

  try {
    const res = await fetch('/api/books/categories-summary');
    const categories = await res.json();

    const dropdown = document.getElementById('books-category-filter');
    const chipsContainer = document.getElementById('books-category-chips');
    const currentVal = dropdown?.value || 'all';

    let totalBooks = 0;
    categories.forEach(c => { totalBooks += parseInt(c.count, 10); });

    if (dropdown) {
      dropdown.innerHTML = '';
      const allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.innerText = `All Categories / Specialties (${totalBooks.toLocaleString()})`;
      dropdown.appendChild(allOpt);

      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.specialty;
        opt.innerText = `${c.specialty} (${parseInt(c.count, 10).toLocaleString()})`;
        dropdown.appendChild(opt);
      });

      if (currentVal && categories.some(c => c.specialty === currentVal)) {
        dropdown.value = currentVal;
      } else {
        dropdown.value = 'all';
      }
    }

    if (chipsContainer) {
      chipsContainer.innerHTML = '';

      // "All" chip
      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = `category-chip px-3 py-1 rounded-lg transition-all whitespace-nowrap text-xs shrink-0 ${
        (dropdown?.value || 'all') === 'all'
          ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/30 ring-1 ring-teal-400'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
      }`;
      allChip.innerHTML = `All <span class="opacity-75 font-mono text-[10px]">(${totalBooks.toLocaleString()})</span>`;
      allChip.addEventListener('click', () => {
        if (dropdown) dropdown.value = 'all';
        updateActiveCategoryChip('all');
        loadBooks();
      });
      chipsContainer.appendChild(allChip);

      // Add chips for categories
      categories.forEach(c => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.specialty = c.specialty;
        const isActive = dropdown?.value === c.specialty;
        chip.className = `category-chip px-3 py-1 rounded-lg transition-all whitespace-nowrap text-xs shrink-0 ${
          isActive
            ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/30 ring-1 ring-teal-400'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
        }`;
        chip.innerHTML = `${c.specialty} <span class="opacity-75 font-mono text-[10px]">(${parseInt(c.count, 10).toLocaleString()})</span>`;
        chip.addEventListener('click', () => {
          if (dropdown) dropdown.value = c.specialty;
          updateActiveCategoryChip(c.specialty);
          loadBooks();
        });
        chipsContainer.appendChild(chip);
      });
    }

    masterCategoriesPopulated = true;
  } catch (err) {
    console.error('Error populating master book categories:', err);
  }
}

function updateActiveCategoryChip(selectedSpecialty) {
  document.querySelectorAll('.category-chip').forEach(chip => {
    const isAll = chip.textContent.startsWith('All') && selectedSpecialty === 'all';
    const isMatch = chip.dataset.specialty === selectedSpecialty;
    if (isAll || isMatch) {
      chip.className = 'category-chip px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap text-xs shrink-0 bg-teal-600 text-white shadow-md shadow-teal-600/30 ring-1 ring-teal-400';
    } else {
      chip.className = 'category-chip px-3 py-1 rounded-lg font-medium transition-all whitespace-nowrap text-xs shrink-0 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700';
    }
  });
}

async function loadBooks() {
  const searchVal = document.getElementById('books-search-input')?.value.trim() || '';
  const categoryFilter = document.getElementById('books-category-filter')?.value || 'all';

  const params = new URLSearchParams();
  if (searchVal) params.append('search', searchVal);
  if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);

  const url = `/api/books${params.toString() ? '?' + params.toString() : ''}`;
  
  try {
    const res = await fetch(url);
    const books = await res.json();
    
    // Update live count summary badge
    const summaryEl = document.getElementById('books-count-summary');
    if (summaryEl) {
      if (categoryFilter !== 'all' && searchVal) {
        summaryEl.innerHTML = `Found <span class="text-teal-400 font-extrabold">${books.length.toLocaleString()}</span> books in <span class="text-amber-300 font-bold">${categoryFilter}</span> matching "${searchVal}"`;
      } else if (categoryFilter !== 'all') {
        summaryEl.innerHTML = `Showing <span class="text-teal-400 font-extrabold">${books.length.toLocaleString()}</span> books in <span class="text-amber-300 font-bold">${categoryFilter}</span>`;
      } else if (searchVal) {
        summaryEl.innerHTML = `Found <span class="text-teal-400 font-extrabold">${books.length.toLocaleString()}</span> books matching "${searchVal}"`;
      } else {
        summaryEl.innerHTML = `Total Master Catalog: <span class="text-teal-400 font-extrabold">${books.length.toLocaleString()}</span> Books`;
      }
    }

    const tbody = document.getElementById('books-table-body');
    tbody.innerHTML = '';
    
    if (books.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-xs text-slate-500 font-semibold">No books found in master catalog matching query.</td></tr>';
      return;
    }
    
    books.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/30 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4">
          <span class="font-mono text-xs font-bold text-teal-400 block">${b.accession_no}</span>
          ${b.call_no ? `<span class="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-amber-300 font-semibold" title="Call Number">${b.call_no}</span>` : ''}
        </td>
        <td class="px-6 py-4">
          <strong class="text-white block text-sm">${b.title} ${b.volume ? `<span class="text-teal-400 text-xs font-bold">(${b.volume})</span>` : ''}</strong>
          <div class="text-slate-400 text-xs mt-0.5 space-y-0.5">
            <span>${b.edition} | ${b.publisher} (${b.publishing_year})</span>
            <span class="block text-[10px] text-slate-500 font-medium">Pages: ${b.pages || 'N/A'} | Cost: ₹${b.cost || '0.00'} | Bill: ${b.bill_no || 'N/A'} | Entry: ${b.entry_date || 'N/A'}${b.call_no ? ` | Call: ${b.call_no}` : ''}</span>
          </div>
        </td>
        <td class="px-6 py-4 text-xs text-slate-350 font-semibold">${b.authors}</td>
        <td class="px-6 py-4 text-xs font-medium text-slate-400">${b.specialty}</td>
        <td class="px-6 py-4 text-xs font-mono text-slate-500">${b.rack_no} - ${b.shelf_no}</td>
        <td class="px-6 py-4 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${b.status === 'Available' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' : b.status === 'Issued' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' : 'bg-slate-800 text-slate-400 border border-slate-700/60'}">
            ${b.status}
          </span>
        </td>
        <td class="px-6 py-4 text-right flex items-center justify-end gap-3.5">
          <button class="btn-edit-book text-teal-400 hover:text-teal-300 text-xs font-bold" data-id="${b.id}">
            Edit
          </button>
          ${b.status === 'Issued' ? `
            <span class="text-slate-500 text-xs font-bold cursor-not-allowed select-none bg-slate-950/20 px-2.5 py-1 rounded border border-slate-800" title="Cannot delete issued books">Locked</span>
          ` : `
            <button class="btn-delete-book text-red-500 hover:text-red-400 text-xs font-bold" data-id="${b.id}" data-acc="${b.accession_no}">
              Delete
            </button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Add delete book trigger events
    document.querySelectorAll('.btn-delete-book').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const bookId = btn.getAttribute('data-id');
        const accession = btn.getAttribute('data-acc');
        if (confirm(`Are you sure you want to delete book copy "${accession}"?`)) {
          try {
            const deleteRes = await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
            const deleteData = await deleteRes.json();
            if (deleteRes.ok) {
              showNotification(deleteData.message, 'success');
              loadBooks();
            } else {
              showNotification(deleteData.error || 'Failed to delete book.', 'error');
            }
          } catch (err) {
            showNotification('Error deleting book: ' + err.message, 'error');
          }
        }
      });
    });

    // Add edit book trigger events
    document.querySelectorAll('.btn-edit-book').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = parseInt(btn.getAttribute('data-id'), 10);
        const book = books.find(x => x.id === bookId);
        if (book) {
          openBookEditModal(book);
        }
      });
    });
  } catch (err) {
    showNotification('Error loading books: ' + err.message, 'error');
  }
}

async function openBookEditModal(b) {
  document.getElementById('new-book-id').value = b.id;
  document.getElementById('book-modal-title').innerText = 'Edit Book Details';
  
  document.getElementById('new-book-accession').value = b.accession_no;
  document.getElementById('new-book-title').value = b.title;
  document.getElementById('new-book-authors').value = b.authors;
  document.getElementById('new-book-edition').value = b.edition;
  document.getElementById('new-book-publisher').value = b.publisher;
  document.getElementById('new-book-year').value = b.publishing_year;
  document.getElementById('new-book-isbn').value = b.isbn || '';
  
  await loadSpecialtyDropdown(b.specialty);
  
  document.getElementById('new-book-rack').value = b.rack_no;
  document.getElementById('new-book-shelf').value = b.shelf_no;
  document.getElementById('new-book-status').value = b.status;
  document.getElementById('new-book-pages').value = b.pages || 0;
  document.getElementById('new-book-volume').value = b.volume || '';
  document.getElementById('new-book-cost').value = b.cost || 0.00;
  document.getElementById('new-book-bill-no').value = b.bill_no || '';
  document.getElementById('new-book-entry-date').value = b.entry_date || '';
  document.getElementById('new-book-call-no').value = b.call_no || '';
  
  document.getElementById('new-book-qty-container').classList.add('hidden');
  document.getElementById('btn-submit-book').innerText = 'Update Book Details';
  
  document.getElementById('modal-new-book').classList.remove('hidden');
}

async function loadSpecialtyDropdown(selectedVal = '') {
  try {
    const res = await fetch('/api/books/specialties');
    const dbSpecs = await res.json();

    const defaults = [
      "Medical-Surgical",
      "Pediatrics",
      "Obstetrics & Gynaecology",
      "Community Health",
      "Anatomy & Physiology",
      "Nursing Foundations",
      "Pharmacology",
      "Psychiatric Nursing",
      "Nursing Research",
      "Nutrition & Biochemistry"
    ];

    const uniqueSpecs = Array.from(new Set([...defaults, ...dbSpecs])).filter(s => s && s.trim() !== '').sort((a, b) => a.localeCompare(b));

    const dropdown = document.getElementById('new-book-specialty');
    dropdown.innerHTML = '';

    uniqueSpecs.forEach(spec => {
      const opt = document.createElement('option');
      opt.value = spec;
      opt.innerText = spec;
      dropdown.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.innerText = '+ Add Custom Specialty / Category...';
    dropdown.appendChild(customOpt);

    document.getElementById('new-book-custom-specialty').classList.add('hidden');
    document.getElementById('new-book-custom-specialty').value = '';

    if (selectedVal) {
      if (!uniqueSpecs.includes(selectedVal)) {
        const opt = document.createElement('option');
        opt.value = selectedVal;
        opt.innerText = selectedVal;
        dropdown.insertBefore(opt, customOpt);
      }
      dropdown.value = selectedVal;
    }
  } catch (err) {
    console.error('Error loading specialties:', err);
  }
}

// ==========================================
// 7. JOURNALS & PERIODICALS MODULE
// ==========================================
async function loadJournals() {
  try {
    const res = await fetch('/api/journals');
    const journals = await res.json();
    
    const tbody = document.getElementById('journals-table-body');
    tbody.innerHTML = '';
    
    if (journals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-xs text-slate-500 font-semibold">No serial subscriptions currently active.</td></tr>';
      return;
    }
    
    journals.forEach(j => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/30 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4 font-bold text-white text-sm">${j.name}</td>
        <td class="px-6 py-4 text-xs font-mono text-slate-400">${j.issn}</td>
        <td class="px-6 py-4 text-xs font-semibold text-slate-350">${j.publisher}</td>
        <td class="px-6 py-4 text-xs text-slate-400">${j.frequency}</td>
        <td class="px-6 py-4 text-xs text-slate-400 font-mono">${j.volume_issue}</td>
        <td class="px-6 py-4 text-xs text-slate-400">${j.subscription_period}</td>
        <td class="px-6 py-4 text-xs text-slate-500 font-mono">${j.rack_no} - ${j.shelf_no}</td>
        <td class="px-6 py-4 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${j.status === 'Available' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' : 'bg-red-950 text-red-400 border border-red-900/60'}">
            ${j.status}
          </span>
        </td>
        <td class="px-6 py-4 text-right">
          <button class="btn-edit-journal text-teal-400 hover:text-teal-350 text-xs font-extrabold" data-id="${j.id}">
            Edit
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach edit trigger events
    document.querySelectorAll('.btn-edit-journal').forEach(btn => {
      btn.addEventListener('click', () => {
        const jId = parseInt(btn.getAttribute('data-id'));
        const journal = journals.find(x => x.id === jId);
        if (journal) {
          openJournalEditModal(journal);
        }
      });
    });
  } catch (err) {
    showNotification('Error loading journals: ' + err.message, 'error');
  }
}

function openJournalEditModal(j) {
  document.getElementById('journal-id').value = j.id;
  document.getElementById('journal-modal-title').innerText = 'Edit Journal Subscription';
  document.getElementById('journal-name').value = j.name;
  document.getElementById('journal-issn').value = j.issn;
  document.getElementById('journal-publisher').value = j.publisher;
  document.getElementById('journal-frequency').value = j.frequency;
  document.getElementById('journal-volume').value = j.volume_issue;
  document.getElementById('journal-sub-period').value = j.subscription_period;
  document.getElementById('journal-rack').value = j.rack_no;
  document.getElementById('journal-shelf').value = j.shelf_no;
  document.getElementById('journal-status').value = j.status;
  document.getElementById('modal-journal').classList.remove('hidden');
}

// // Helper functions to format call numbers for spine edge stickers
function formatSpineCallNoPrint(callNo) {
  if (!callNo || callNo.trim() === '') return '<span style="color:#999;font-size:10px;">[NO CALL NO]</span>';
  const parts = callNo.trim().split(/\s+/);
  if (parts.length >= 2) {
    const classNum = parts[0];
    const authorMark = parts.slice(1).join(' ');
    return `<div style="font-size: 13.5px; font-weight: 900; line-height: 1.15; letter-spacing: 0.5px;">${classNum}</div><div style="font-size: 11.5px; font-weight: 800; line-height: 1.15; margin-top: 2px; letter-spacing: 0.5px;">${authorMark}</div>`;
  }
  return `<div style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px;">${callNo}</div>`;
}

function formatSpineCallNoDisplay(callNo) {
  if (!callNo || callNo.trim() === '') return '<span class="text-slate-600 text-xs font-mono">[NO CALL NO]</span>';
  const parts = callNo.trim().split(/\s+/);
  if (parts.length >= 2) {
    const classNum = parts[0];
    const authorMark = parts.slice(1).join(' ');
    return `<div class="text-sm font-black text-amber-300 leading-tight tracking-wider">${classNum}</div><div class="text-xs font-bold text-amber-200 mt-1 tracking-wide">${authorMark}</div>`;
  }
  return `<div class="text-sm font-black text-amber-300 leading-tight tracking-wider">${callNo}</div>`;
}

function parseCallNo(callNo) {
  if (!callNo || typeof callNo !== 'string') {
    return { num: Infinity, text: '', raw: '' };
  }
  const str = callNo.trim();
  const match = str.match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    const text = match[2].trim().replace(/\s+/g, ' ');
    return { num, text, raw: str };
  }
  return { num: Infinity, text: str, raw: str };
}

function compareSpineCallNo(a, b) {
  const parsedA = parseCallNo(a.call_no);
  const parsedB = parseCallNo(b.call_no);

  // 1. Compare numeric classification part from small to large
  if (parsedA.num !== parsedB.num) {
    return parsedA.num - parsedB.num;
  }

  // 2. If number is same, compare letters/text alphabetically
  const textCmp = parsedA.text.localeCompare(parsedB.text, undefined, { sensitivity: 'base', numeric: true });
  if (textCmp !== 0) {
    return textCmp;
  }

  // 3. If call number is identical, sort by accession number
  const accA = parseInt(a.accession_no, 10);
  const accB = parseInt(b.accession_no, 10);
  if (!isNaN(accA) && !isNaN(accB) && accA !== accB) {
    return accA - accB;
  }
  return String(a.accession_no).localeCompare(String(b.accession_no), undefined, { numeric: true });
}

// ==========================================
// 8. REPORTS & COMPREHENSIVE REGISTERS
// ==========================================
async function loadReportPreview() {
  const headerRow = document.getElementById('reports-table-headers');
  const body = document.getElementById('reports-table-body');
  const labelsGrid = document.getElementById('reports-labels-grid');
  
  headerRow.innerHTML = '';
  body.innerHTML = '<tr><td class="px-6 py-8 text-center text-slate-500 font-semibold" colspan="7">Loading register data...</td></tr>';
  if (labelsGrid) {
    labelsGrid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-500 font-semibold">Loading book label cards...</div>';
  }
  
  const yearContainer = document.getElementById('reports-year-filter-container');
  const monthContainer = document.getElementById('reports-month-filter-container');
  const labelFilterContainer = document.getElementById('reports-label-filter-container');
  const labelViewToggle = document.getElementById('label-view-toggle-container');
  const tableContainer = document.getElementById('reports-table-container');
  const labelsContainer = document.getElementById('reports-labels-container');
  
  if (currentReportType === 'issue-return-register' || currentReportType === 'fines-log') {
    yearContainer.classList.remove('hidden');
    monthContainer.classList.remove('hidden');
    if (labelFilterContainer) labelFilterContainer.classList.add('hidden');
    if (labelViewToggle) labelViewToggle.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (labelsContainer) labelsContainer.classList.add('hidden');
  } else if (currentReportType === 'book-labels' || currentReportType === 'spine-callno-labels') {
    yearContainer.classList.add('hidden');
    monthContainer.classList.add('hidden');
    if (labelFilterContainer) labelFilterContainer.classList.remove('hidden');
    if (labelViewToggle) labelViewToggle.classList.remove('hidden');
    setLabelViewMode(currentLabelViewMode);
  } else {
    yearContainer.classList.add('hidden');
    monthContainer.classList.add('hidden');
    if (labelFilterContainer) labelFilterContainer.classList.add('hidden');
    if (labelViewToggle) labelViewToggle.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (labelsContainer) labelsContainer.classList.add('hidden');
  }

  const reportsYear = document.getElementById('reports-year-select').value;
  const reportsMonth = document.getElementById('reports-month-select').value;

  try {
    let url = `/api/reports/${currentReportType}?academic_year_id=${reportsYear}&month=${reportsMonth}`;
    if (currentReportType === 'book-labels' || currentReportType === 'spine-callno-labels') {
      const fromAcc = document.getElementById('label-from-acc') ? document.getElementById('label-from-acc').value : '';
      const toAcc = document.getElementById('label-to-acc') ? document.getElementById('label-to-acc').value : '';
      const specialty = document.getElementById('label-specialty-select') ? document.getElementById('label-specialty-select').value : 'all';
      const search = document.getElementById('label-search-input') ? document.getElementById('label-search-input').value : '';
      url = `/api/reports/${currentReportType}?from_acc=${encodeURIComponent(fromAcc)}&to_acc=${encodeURIComponent(toAcc)}&specialty=${encodeURIComponent(specialty)}&search=${encodeURIComponent(search)}`;
    }

    const res = await fetch(url);
    currentReportData = await res.json();
    
    // Sort spine call numbers strictly from small number to large number, then alphabetically by letters
    if (currentReportType === 'spine-callno-labels') {
      currentReportData.sort(compareSpineCallNo);
    }
    
    // Set layout counts
    if (currentReportType === 'spine-callno-labels') {
      document.getElementById('report-title-display').innerText = 'Book Spine Edge Stickers (Call Number Only)';
      document.getElementById('report-count-display').innerText = `Total Stickers: ${currentReportData.length}`;
    } else if (currentReportType === 'book-labels') {
      document.getElementById('report-title-display').innerText = 'Book Spine & Pocket Labels';
      document.getElementById('report-count-display').innerText = `Total Labels: ${currentReportData.length}`;
    } else {
      document.getElementById('report-title-display').innerText = currentReportType.replace(/-/g, ' ');
      document.getElementById('report-count-display').innerText = `Total Rows: ${currentReportData.length}`;
    }

    body.innerHTML = '';
    if (labelsGrid) labelsGrid.innerHTML = '';

    if (currentReportData.length === 0) {
      body.innerHTML = '<tr><td class="px-6 py-8 text-center text-slate-500 font-semibold" colspan="7">No records found for this register query.</td></tr>';
      if (labelsGrid) {
        labelsGrid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-500 font-semibold">No books match the selected label filters.</div>';
      }
      return;
    }

    // Configure headers and row templates based on type
    if (currentReportType === 'spine-callno-labels') {
      if (labelsGrid) {
        labelsGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3';
      }
      headerRow.innerHTML = `
        <th class="px-6 py-4">Accession No</th>
        <th class="px-6 py-4">Spine Call Number</th>
        <th class="px-6 py-4">Book Title</th>
        <th class="px-6 py-4">Location (Rack - Shelf)</th>
        <th class="px-6 py-4">Specialty</th>
        <th class="px-6 py-4">Status</th>
      `;
      currentReportData.forEach(row => {
        // Table row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4 font-mono font-bold text-teal-400 text-xs">#${row.accession_no}</td>
          <td class="px-6 py-4">
            <span class="inline-block text-xs font-mono font-black px-2.5 py-1 rounded bg-slate-900 border border-amber-500/40 text-amber-300 shadow-sm">${row.call_no || 'None'}</span>
          </td>
          <td class="px-6 py-4">
            <strong class="text-white block font-semibold text-sm">${row.title}</strong>
            <span class="text-[11px] text-slate-500">${row.authors || '-'}</span>
          </td>
          <td class="px-6 py-4 font-mono text-xs text-teal-300 font-bold">R: ${row.rack_no || '-'} | S: ${row.shelf_no || '-'}</td>
          <td class="px-6 py-4 text-slate-400 text-xs">${row.specialty || '-'}</td>
          <td class="px-6 py-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}">${row.status}</span>
          </td>
        `;
        body.appendChild(tr);

        // Spine Sticker Card (Compact Narrow Edge View)
        if (labelsGrid) {
          const card = document.createElement('div');
          card.className = 'bg-slate-900 border-2 border-dashed border-slate-700 hover:border-amber-400/80 rounded-xl p-3 shadow-md flex flex-col items-center justify-between text-center transition-all group min-h-[110px]';
          card.innerHTML = `
            <div class="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">SPINE EDGE</div>
            <div class="bg-slate-950/90 border border-slate-800 rounded-lg px-2 py-2 w-full flex-grow flex items-center justify-center shadow-inner">
              <div class="font-mono text-center">
                ${formatSpineCallNoDisplay(row.call_no)}
              </div>
            </div>
            <div class="mt-2 text-[9px] font-mono text-teal-400 flex items-center justify-between w-full px-1 pt-1.5 border-t border-slate-800">
              <span>#${row.accession_no}</span>
              <span class="text-slate-500 font-sans text-[8.5px]">R:${row.rack_no || '-'}/S:${row.shelf_no || '-'}</span>
            </div>
          `;
          labelsGrid.appendChild(card);
        }
      });

      populateSpecialtyFilterOptions();

    } else if (currentReportType === 'book-labels') {
      if (labelsGrid) {
        labelsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
      }
      headerRow.innerHTML = `
        <th class="px-6 py-4">Accession No</th>
        <th class="px-6 py-4">Call Number</th>
        <th class="px-6 py-4">Book Title</th>
        <th class="px-6 py-4">Primary Authors</th>
        <th class="px-6 py-4">Specialty</th>
        <th class="px-6 py-4">Rack & Shelf</th>
        <th class="px-6 py-4">Status</th>
      `;
      currentReportData.forEach(row => {
        // 1. Table row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4 font-mono font-bold text-teal-400 text-xs">#${row.accession_no}</td>
          <td class="px-6 py-4">
            <span class="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">${row.call_no || 'None'}</span>
          </td>
          <td class="px-6 py-4">
            <strong class="text-white block font-semibold text-sm">${row.title}</strong>
            <span class="text-[11px] text-slate-500">${row.edition || ''} ${row.publisher ? '• ' + row.publisher : ''}</span>
          </td>
          <td class="px-6 py-4 text-slate-300 text-xs">${row.authors || '-'}</td>
          <td class="px-6 py-4 text-slate-400 text-xs font-semibold">${row.specialty || '-'}</td>
          <td class="px-6 py-4 font-mono text-xs text-slate-300">R: ${row.rack_no || '-'} | S: ${row.shelf_no || '-'}</td>
          <td class="px-6 py-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}">${row.status}</span>
          </td>
        `;
        body.appendChild(tr);

        // 2. Sticker Card (for Grid View)
        if (labelsGrid) {
          const card = document.createElement('div');
          card.className = 'bg-slate-900/90 border border-slate-700 hover:border-teal-500/60 rounded-xl p-4 shadow-md flex flex-col justify-between transition-all group';
          card.innerHTML = `
            <div>
              <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                <div class="flex items-center gap-1.5">
                  <img src="img/logo.png" width="20" height="20" style="width: 20px; height: 20px; min-width: 20px; object-fit: contain;" class="rounded-full flex-shrink-0">
                  <span class="text-[10px] font-black uppercase tracking-wider text-slate-300">J & D Inst. of Nursing</span>
                </div>
                <span class="text-[9px] font-bold text-teal-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-teal-950/80 border border-teal-800/50">LIBRARY</span>
              </div>

              <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 mb-2.5 flex items-center justify-between gap-2 shadow-inner">
                <div>
                  <span class="block text-[8px] uppercase tracking-widest text-slate-500 font-bold">Call Number</span>
                  <span class="text-xs font-mono font-black text-amber-300 tracking-wide">${row.call_no || 'NO CALL NO'}</span>
                </div>
                <div class="text-right">
                  <span class="block text-[8px] uppercase tracking-widest text-slate-500 font-bold">Acc No</span>
                  <span class="text-xs font-mono font-black text-teal-300">#${row.accession_no}</span>
                </div>
              </div>

              <h4 class="text-xs font-bold text-white leading-tight line-clamp-2" title="${row.title}">${row.title}</h4>
              <p class="text-[11px] text-slate-400 mt-1 truncate" title="${row.authors}">By ${row.authors || 'Unknown'}</p>
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span class="font-mono text-slate-300 flex items-center gap-1">
                <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                R: <strong class="text-teal-400">${row.rack_no || '-'}</strong> | S: <strong class="text-teal-400">${row.shelf_no || '-'}</strong>
              </span>
              <span class="text-[9px] text-slate-500 font-semibold truncate max-w-[100px]">${row.specialty || ''}</span>
            </div>
          `;
          labelsGrid.appendChild(card);
        }
      });

      // Populate specialty dropdown options if not yet populated
      populateSpecialtyFilterOptions();

    } else if (currentReportType === 'accession-register') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Accession No</th>
        <th class="px-6 py-4">Title</th>
        <th class="px-6 py-4">Primary Authors</th>
        <th class="px-6 py-4">Specialty</th>
        <th class="px-6 py-4">Rack - Shelf</th>
        <th class="px-6 py-4">Status</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4">
            <span class="font-mono text-xs font-bold text-teal-400 block">${row.accession_no}</span>
            ${row.call_no ? `<span class="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-amber-300 font-semibold" title="Call Number">${row.call_no}</span>` : ''}
          </td>
          <td class="px-6 py-4">
            <strong class="text-white block font-semibold">${row.title} ${row.volume ? `<span class="text-teal-400 text-xs font-mono">(${row.volume})</span>` : ''}</strong>
            <div class="text-[10px] text-slate-500 font-medium space-y-0.5 mt-0.5">
              <span>Pages: ${row.pages || 'N/A'} | Cost: ₹${row.cost || '0.00'} | Bill: ${row.bill_no || 'N/A'} | Date: ${row.entry_date || 'N/A'}${row.call_no ? ` | Call: ${row.call_no}` : ''}</span>
            </div>
          </td>
          <td class="px-6 py-4 text-slate-350">${row.authors}</td>
          <td class="px-6 py-4 text-slate-400">${row.specialty}</td>
          <td class="px-6 py-4 font-mono text-slate-500">${row.rack_no} - ${row.shelf_no}</td>
          <td class="px-6 py-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}">${row.status}</span>
          </td>
        `;
        body.appendChild(tr);
      });

    } else if (currentReportType === 'issue-return-register') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Transaction ID</th>
        <th class="px-6 py-4">Student Name (ID)</th>
        <th class="px-6 py-4">Book Accession (Title)</th>
        <th class="px-6 py-4">Issue Date</th>
        <th class="px-6 py-4">Due Date</th>
        <th class="px-6 py-4">Return Date</th>
        <th class="px-6 py-4">Penalty Dues</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        const fineText = row.fine_amount > 0 ? `₹${row.fine_amount} (${row.fine_status})` : '₹0';
        tr.innerHTML = `
          <td class="px-6 py-4 font-mono text-xs text-slate-500">#TX-${row.id}</td>
          <td class="px-6 py-4">
            <strong class="text-white block">${row.student_name}</strong>
            <span class="text-xs text-slate-400 font-mono">${row.enrollment_no}</span>
          </td>
          <td class="px-6 py-4">
            <strong class="text-white block font-mono text-xs text-teal-400">${row.accession_no}</strong>
            <span class="text-xs text-slate-400 max-w-xs block truncate">${row.book_title}</span>
          </td>
          <td class="px-6 py-4 font-mono text-xs text-slate-400">${row.issue_date}</td>
          <td class="px-6 py-4 font-mono text-xs text-slate-400">${row.due_date}</td>
          <td class="px-6 py-4 font-mono text-xs">${row.return_date ? `<span class="text-emerald-400">${row.return_date}</span>` : '<span class="text-red-400 font-bold animate-pulse">Issued</span>'}</td>
          <td class="px-6 py-4 font-mono text-xs font-bold ${row.fine_status === 'Pending' ? 'text-red-400' : row.fine_status === 'Paid' ? 'text-emerald-400' : 'text-slate-500'}">${fineText}</td>
        `;
        body.appendChild(tr);
      });

    } else if (currentReportType === 'author-wise') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Primary Authors</th>
        <th class="px-6 py-4">Book Title</th>
        <th class="px-6 py-4">Edition</th>
        <th class="px-6 py-4">Publisher</th>
        <th class="px-6 py-4 text-center">Total Copies</th>
        <th class="px-6 py-4 text-center">Available Copies</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4 font-bold text-white text-sm">${row.authors}</td>
          <td class="px-6 py-4 text-slate-200 font-semibold">${row.title}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${row.edition}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${row.publisher}</td>
          <td class="px-6 py-4 text-center text-sm font-semibold">${row.copy_count}</td>
          <td class="px-6 py-4 text-center text-sm font-bold text-emerald-400">${row.available_copy_count}</td>
        `;
        body.appendChild(tr);
      });

    } else if (currentReportType === 'master-catalog') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Accession No</th>
        <th class="px-6 py-4">Title & Edition</th>
        <th class="px-6 py-4">Publisher & ISBN</th>
        <th class="px-6 py-4">Specialty</th>
        <th class="px-6 py-4">Rack & Shelf</th>
        <th class="px-6 py-4">Status</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4 font-mono text-xs font-bold text-teal-400">${row.accession_no}</td>
          <td class="px-6 py-4">
            <strong class="text-white block text-sm">${row.title} ${row.volume ? `<span class="text-teal-400 text-xs font-mono">(${row.volume})</span>` : ''}</strong>
            <div class="text-slate-400 text-xs mt-0.5 space-y-0.5">
              <span>${row.authors} (${row.edition})</span>
              <span class="block text-[10px] text-slate-500 font-medium">Pages: ${row.pages || 'N/A'} | Cost: ₹${row.cost || '0.00'} | Bill: ${row.bill_no || 'N/A'} | Date: ${row.entry_date || 'N/A'}</span>
            </div>
          </td>
          <td class="px-6 py-4 text-xs">
            <span class="block text-slate-300 font-medium">${row.publisher}</span>
            <span class="block text-slate-500 font-mono font-semibold">${row.isbn || 'No ISBN'}</span>
          </td>
          <td class="px-6 py-4 text-xs text-slate-400 font-semibold">${row.specialty}</td>
          <td class="px-6 py-4 text-xs font-mono text-slate-400">${row.rack_no} - ${row.shelf_no}</td>
          <td class="px-6 py-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">${row.status}</span>
          </td>
        `;
        body.appendChild(tr);
      });

    } else if (currentReportType === 'fines-log') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Student Name (ID)</th>
        <th class="px-6 py-4">Book Title (Accession)</th>
        <th class="px-6 py-4">Loan Dates</th>
        <th class="px-6 py-4">Due Date</th>
        <th class="px-6 py-4">Return Date</th>
        <th class="px-6 py-4">Penalty Charged</th>
        <th class="px-6 py-4">Status</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4">
            <strong class="text-white block">${row.student_name}</strong>
            <span class="text-xs text-slate-400 font-mono block">${row.enrollment_no}</span>
            <span class="text-xs text-slate-500 font-mono">${row.mobile}</span>
          </td>
          <td class="px-6 py-4">
            <strong class="text-white text-xs block">${row.book_title}</strong>
            <span class="text-xs font-bold text-teal-400 font-mono">${row.accession_no}</span>
          </td>
          <td class="px-6 py-4 text-xs text-slate-400 font-mono">${row.issue_date}</td>
          <td class="px-6 py-4 text-xs text-slate-400 font-mono">${row.due_date}</td>
          <td class="px-6 py-4 text-xs font-mono">${row.return_date ? `<span class="text-emerald-400">${row.return_date}</span>` : '<span class="text-amber-400">Not Returned</span>'}</td>
          <td class="px-6 py-4 text-sm font-mono font-black text-red-400">₹${row.fine_amount}</td>
          <td class="px-6 py-4 text-xs font-semibold text-slate-350">
            <div class="px-2 py-0.5 rounded text-[10px] text-center font-bold uppercase ${row.fine_status === 'Paid' ? 'bg-emerald-950 text-emerald-400' : row.fine_status === 'Waived' ? 'bg-slate-800 text-slate-400' : 'bg-red-950 text-red-400 animate-pulse'}">
              ${row.fine_status}
            </div>
            <p class="text-[9px] text-slate-500 mt-1 max-w-[150px] truncate" title="${row.fine_notes || ''}">${row.fine_notes || '-'}</p>
          </td>
        `;
        body.appendChild(tr);
      });

    } else if (currentReportType === 'journals') {
      headerRow.innerHTML = `
        <th class="px-6 py-4">Journal Name</th>
        <th class="px-6 py-4">ISSN Code</th>
        <th class="px-6 py-4">Publisher</th>
        <th class="px-6 py-4">Frequency</th>
        <th class="px-6 py-4">Vol / Issue</th>
        <th class="px-6 py-4">Sub Period</th>
        <th class="px-6 py-4">Rack & Shelf</th>
        <th class="px-6 py-4">Availability</th>
      `;
      currentReportData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/30 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-4 font-bold text-white text-sm">${row.name}</td>
          <td class="px-6 py-4 text-xs font-mono text-slate-400">${row.issn}</td>
          <td class="px-6 py-4 text-xs font-semibold text-slate-350">${row.publisher}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${row.frequency}</td>
          <td class="px-6 py-4 text-xs font-mono text-slate-400">${row.volume_issue}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${row.subscription_period}</td>
          <td class="px-6 py-4 font-mono text-xs text-slate-500">${row.rack_no} - ${row.shelf_no}</td>
          <td class="px-6 py-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Available' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">${row.status}</span>
          </td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (err) {
    showNotification('Error loading reports: ' + err.message, 'error');
  }
}

// Switch between Sticker Grid View and Table View for Book Labels
function setLabelViewMode(mode) {
  currentLabelViewMode = mode;
  const gridBtn = document.getElementById('btn-label-grid-view');
  const tableBtn = document.getElementById('btn-label-table-view');
  const tableContainer = document.getElementById('reports-table-container');
  const labelsContainer = document.getElementById('reports-labels-container');

  if (!tableContainer || !labelsContainer) return;

  if (mode === 'grid') {
    if (gridBtn) gridBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-teal-400 bg-slate-800 flex items-center gap-1.5 transition-all shadow-sm';
    if (tableBtn) tableBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-all';
    labelsContainer.classList.remove('hidden');
    tableContainer.classList.add('hidden');
  } else {
    if (tableBtn) tableBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-teal-400 bg-slate-800 flex items-center gap-1.5 transition-all shadow-sm';
    if (gridBtn) gridBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-all';
    tableContainer.classList.remove('hidden');
    labelsContainer.classList.add('hidden');
  }
}

// Populate Specialty dropdown for labels filter
async function populateSpecialtyFilterOptions() {
  if (specialtiesPopulated) return;
  const select = document.getElementById('label-specialty-select');
  if (!select) return;

  try {
    const res = await fetch('/api/books/specialties');
    if (res.ok) {
      const list = await res.json();
      select.innerHTML = '<option value="all">All Specialties</option>';
      list.forEach(item => {
        const val = typeof item === 'object' ? (item.specialty || item.name) : item;
        if (val) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.innerText = val;
          select.appendChild(opt);
        }
      });
      specialtiesPopulated = true;
    }
  } catch (e) {
    const unique = [...new Set(currentReportData.map(b => b.specialty).filter(Boolean))].sort();
    select.innerHTML = '<option value="all">All Specialties</option>';
    unique.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.innerText = s;
      select.appendChild(opt);
    });
    if (unique.length > 0) specialtiesPopulated = true;
  }
}

// Print official report function
function printCurrentReport() {
  const container = document.getElementById('print-content');
  container.innerHTML = '';
  
  // Set report metadata timestamp
  const now = new Date();
  document.getElementById('print-timestamp').innerText = now.toLocaleString();

  const printLetterhead = document.getElementById('print-letterhead');
  const printFooter = document.getElementById('print-footer');

  // Specific layout for pure Book Spine Edge Stickers (Call Number Only)
  if (currentReportType === 'spine-callno-labels') {
    if (printLetterhead) printLetterhead.classList.add('hidden');
    if (printFooter) printFooter.classList.add('hidden');

    const spineWrapper = document.createElement('div');
    spineWrapper.className = 'print-spine-grid';

    currentReportData.forEach(row => {
      const item = document.createElement('div');
      item.className = 'print-spine-item';
      item.innerHTML = `
        <div style="font-family: monospace; font-size: 13px; font-weight: 900; color: #000; letter-spacing: 0.5px; line-height: 1.25; width: 100%;">
          ${formatSpineCallNoPrint(row.call_no)}
        </div>
        <div style="font-size: 7px; color: #555; font-family: monospace; margin-top: 3px; border-top: 1px dotted #bbb; width: 100%; padding-top: 2px; display: flex; justify-content: space-between;">
          <span>#${row.accession_no}</span>
          <span>R:${row.rack_no || '-'}/S:${row.shelf_no || '-'}</span>
        </div>
      `;
      spineWrapper.appendChild(item);
    });

    container.appendChild(spineWrapper);

    window.print();

    setTimeout(() => {
      if (printLetterhead) printLetterhead.classList.remove('hidden');
      if (printFooter) printFooter.classList.remove('hidden');
    }, 1000);
    return;
  }

  // Specific layout for adhesive Book Labels / Stickers
  if (currentReportType === 'book-labels') {
    if (printLetterhead) printLetterhead.classList.add('hidden');
    if (printFooter) printFooter.classList.add('hidden');

    const labelsWrapper = document.createElement('div');
    labelsWrapper.className = 'print-labels-grid';

    currentReportData.forEach(row => {
      const item = document.createElement('div');
      item.className = 'print-label-item';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #777; padding-bottom: 3px; margin-bottom: 3px;">
          <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; color: #111;">J & D Institute of Nursing</span>
          <span style="font-size: 7px; font-weight: bold; border: 1px solid #444; padding: 0 3px; border-radius: 2px;">LIBRARY</span>
        </div>

        <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 3px 5px; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 6px; text-transform: uppercase; font-weight: bold; color: #475569;">CALL NUMBER</div>
            <div style="font-family: monospace; font-size: 11px; font-weight: 900; color: #000; letter-spacing: 0.3px; line-height: 1.1;">${row.call_no || 'NO CALL NO'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 6px; text-transform: uppercase; font-weight: bold; color: #475569;">ACC NO</div>
            <div style="font-family: monospace; font-size: 11px; font-weight: 900; color: #000;">${row.accession_no}</div>
          </div>
        </div>

        <div style="flex-grow: 1; margin-bottom: 2px; overflow: hidden;">
          <div style="font-size: 8.5px; font-weight: bold; color: #000; line-height: 1.15; max-height: 22px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${row.title}</div>
          <div style="font-size: 7px; color: #333; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">By: ${row.authors || '-'}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dotted #888; padding-top: 2px; font-size: 7px; color: #222; font-family: monospace;">
          <span>LOC: <b>R-${row.rack_no || '-'} / S-${row.shelf_no || '-'}</b></span>
          <span style="text-transform: uppercase; font-size: 6.5px; color: #444;">${row.specialty ? row.specialty.substring(0, 15) : ''}</span>
        </div>
      `;
      labelsWrapper.appendChild(item);
    });

    container.appendChild(labelsWrapper);

    window.print();

    // Restore letterhead and footer for future standard reports
    setTimeout(() => {
      if (printLetterhead) printLetterhead.classList.remove('hidden');
      if (printFooter) printFooter.classList.remove('hidden');
    }, 1000);
    return;
  }

  // Regular report print
  if (printLetterhead) printLetterhead.classList.remove('hidden');
  if (printFooter) printFooter.classList.remove('hidden');

  const title = currentReportType.replace(/-/g, ' ').toUpperCase();
  const titleHeader = document.createElement('div');
  titleHeader.className = 'mb-6 flex justify-between items-center';
  titleHeader.innerHTML = `
    <div>
      <h2 class="text-xl font-bold uppercase tracking-wider text-slate-800">${title}</h2>
      <p class="text-xs text-slate-500">Official Register Copy</p>
    </div>
    <div class="text-right text-xs text-slate-600">
      <p>Academic Year ID: ${currentAcademicYearId}</p>
      <p>Records Loaded: ${currentReportData.length}</p>
    </div>
  `;
  container.appendChild(titleHeader);

  // Copy preview table header and body content
  const previewTable = document.getElementById('reports-preview-table');
  const printTable = document.createElement('table');
  printTable.className = 'w-full text-left text-xs border border-slate-300 border-collapse';
  printTable.innerHTML = previewTable.innerHTML;
  
  // Strip tailwind styles that might conflict with print styles
  printTable.querySelectorAll('tr').forEach(row => {
    row.className = '';
  });
  
  container.appendChild(printTable);

  // Trigger browser print
  window.print();
}

// Export Report to Excel/CSV
function exportCurrentReportToCSV() {
  if (currentReportData.length === 0) {
    showNotification('No data to export', 'error');
    return;
  }

  let csvContent = '';

  if (currentReportType === 'spine-callno-labels') {
    // Custom Call-Number focused CSV for spine edge stickers
    const headers = ['Accession No', 'Call Number', 'Rack No', 'Shelf No', 'Title', 'Authors', 'Specialty', 'Status', 'Institution'];
    csvContent = headers.join(',') + '\n';

    currentReportData.forEach(row => {
      const vals = [
        row.accession_no || '',
        row.call_no || '',
        row.rack_no || '',
        row.shelf_no || '',
        row.title || '',
        row.authors || '',
        row.specialty || '',
        row.status || '',
        'J & D Institute of Nursing'
      ].map(v => {
        let str = String(v);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvContent += vals.join(',') + '\n';
    });
  } else if (currentReportType === 'book-labels') {
    // Custom label-focused CSV for label printing software or mail merge
    const headers = ['Accession No', 'Call Number', 'Title', 'Authors', 'Edition', 'Publisher', 'Specialty', 'Rack No', 'Shelf No', 'Status', 'Institution'];
    csvContent = headers.join(',') + '\n';

    currentReportData.forEach(row => {
      const vals = [
        row.accession_no || '',
        row.call_no || '',
        row.title || '',
        row.authors || '',
        row.edition || '',
        row.publisher || '',
        row.specialty || '',
        row.rack_no || '',
        row.shelf_no || '',
        row.status || '',
        'J & D Institute of Nursing'
      ].map(v => {
        let str = String(v);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvContent += vals.join(',') + '\n';
    });
  } else {
    // Standard register export
    const keys = Object.keys(currentReportData[0]);
    csvContent = keys.join(',') + '\n';

    currentReportData.forEach(row => {
      const rowValues = keys.map(k => {
        let val = row[k] === null ? '' : String(row[k]);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvContent += rowValues.join(',') + '\n';
    });
  }

  const filename = `${currentReportType}_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showNotification(`Exported register successfully as: ${filename}`, 'success');
}

// ==========================================
// 9. STUDENT CLEARANCE NO-DUES PRINT
// ==========================================
function printNoDuesCertificate() {
  if (!selectedStudent) return;

  const container = document.getElementById('print-content');
  container.innerHTML = '';

  const now = new Date();
  document.getElementById('print-timestamp').innerText = now.toLocaleString();

  // Draw No-Dues Certificate Layout
  const cert = document.createElement('div');
  cert.className = 'my-12 px-8 py-10 border-4 double border-slate-900 bg-white text-black max-w-3xl mx-auto space-y-8';
  cert.innerHTML = `
    <div class="text-center space-y-1">
      <h2 class="text-2xl font-extrabold uppercase tracking-widest text-slate-800">NO-DUES CLEARANCE CERTIFICATE</h2>
      <p class="text-xs font-semibold text-slate-500">LIBRARY DEPARTMENT - ACADEMIC SESSION: ${document.getElementById('global-academic-year').options[document.getElementById('global-academic-year').selectedIndex].text}</p>
    </div>

    <div class="pt-8 text-sm leading-relaxed text-slate-700 space-y-6">
      <p>This is to officially certify that the student whose academic credentials are listed below has returned all borrowed books, periodicals, and academic resources, and has fully cleared all pending late-return penalty dues to the library department.</p>

      <!-- Student metadata grid -->
      <table class="w-full text-left my-6 border border-slate-350 text-xs">
        <tbody>
          <tr>
            <td class="p-3 bg-slate-100 font-bold border border-slate-300 w-1/3">Student Full Name:</td>
            <td class="p-3 border border-slate-300 font-semibold">${selectedStudent.name}</td>
          </tr>
          <tr>
            <td class="p-3 bg-slate-100 font-bold border border-slate-300">Enrollment number:</td>
            <td class="p-3 border border-slate-300 font-mono font-bold">${selectedStudent.enrollment_no}</td>
          </tr>
          <tr>
            <td class="p-3 bg-slate-100 font-bold border border-slate-300">Class / Program Course:</td>
            <td class="p-3 border border-slate-300 font-semibold">${selectedStudent.course}</td>
          </tr>
          <tr>
            <td class="p-3 bg-slate-100 font-bold border border-slate-300">Division / Section:</td>
            <td class="p-3 border border-slate-300">${selectedStudent.division}</td>
          </tr>
          <tr>
            <td class="p-3 bg-slate-100 font-bold border border-slate-300">Mandatory Contact Number:</td>
            <td class="p-3 border border-slate-300 font-mono">${selectedStudent.mobile}</td>
          </tr>
        </tbody>
      </table>

      <div class="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded text-xs font-bold text-center">
        CLEARANCE RECORD: APPROVED - ZERO DUES DETECTED
      </div>
      
      <p class="text-xs text-slate-400 mt-6 text-center italic">Hence, the student is cleared of all academic and physical asset liabilities in relation to the J & D Nursing Institute library department.</p>
    </div>
  `;
  
  container.appendChild(cert);

  // Close profile modal and trigger print
  document.getElementById('modal-student-profile').classList.add('hidden');
  window.print();
}

// ==========================================
// 10. UTILITY CSV PARSERS
// ==========================================
function parseCSVText(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  
  // Extract headers
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] !== undefined ? values[index] : '';
    });
    results.push(obj);
  }
  return results;
}
