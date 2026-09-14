require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, run, get, all, initSchema } = require('./database');
const backupDatabase = require('./scripts/backup');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const AUTH_SECRET = process.env.AUTH_SECRET || 'jd-nursing-library-secret-2026';

function generateAuthToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data.user;
  } catch (e) {
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let isInitialized = false;
let initPromise = null;
const ensureInitialized = () => {
  if (isInitialized) return Promise.resolve();
  if (!initPromise) {
    initPromise = initSchema().then(() => {
      isInitialized = true;
    }).catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Database initialization error' });
  }
});

// Client logging endpoint for debugging
app.post('/api/logs', (req, res) => {
  const { type, args } = req.body;
  console.log(`[BROWSER LOG] [${type}]`, args);
  res.sendStatus(200);
});

// Authentication Endpoints
app.post('/api/auth/login', (req, res) => {
  const { userId, username, password } = req.body || {};
  const inputUser = String(userId || username || '').trim();
  const inputPass = String(password || '').trim();

  if (!inputUser || !inputPass) {
    return res.status(400).json({ success: false, message: 'User ID and Password are required' });
  }

  // Validate credentials against configured admin credentials
  const isValidUser = inputUser.toLowerCase() === ADMIN_USER.toLowerCase();
  const isValidPass = inputPass === ADMIN_PASSWORD || (isValidUser && inputPass === inputUser);

  if (isValidUser && isValidPass) {
    const token = generateAuthToken(ADMIN_USER);
    return res.json({
      success: true,
      token,
      user: {
        username: ADMIN_USER,
        displayName: 'Authorized Librarian',
        role: 'Administrator'
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid User ID or Password'
  });
});

app.get('/api/auth/status', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || '');
  const user = verifyAuthToken(token);

  if (user) {
    return res.json({
      authenticated: true,
      user: {
        username: user,
        displayName: 'Authorized Librarian',
        role: 'Administrator'
      }
    });
  }
  return res.json({ authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Signed out successfully' });
});

// Date utilities
const pad = (n) => String(n).padStart(2, '0');
const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getDaysOverdue = (dueDateStr, returnDateStr) => {
  const due = new Date(dueDateStr + 'T00:00:00');
  const ret = returnDateStr ? new Date(returnDateStr + 'T00:00:00') : new Date();
  due.setHours(0, 0, 0, 0);
  ret.setHours(0, 0, 0, 0);
  const diffTime = ret.getTime() - due.getTime();
  if (diffTime <= 0) return 0;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// ==========================================
// 1. ACADEMIC YEARS API
// ==========================================
app.get('/api/academic-years', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM academic_years ORDER BY name DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/academic-years', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await run('INSERT INTO academic_years (name, status) VALUES (?, \'inactive\')', [name]);
    res.status(201).json({ id: result.lastID, name, status: 'inactive' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/academic-years/:id/active', async (req, res) => {
  const { id } = req.params;
  try {
    await run('UPDATE academic_years SET status = \'inactive\'');
    const result = await run('UPDATE academic_years SET status = \'active\' WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Academic Year not found' });
    res.json({ message: 'Academic Year set to active successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. STUDENTS API
// ==========================================
app.get('/api/students', async (req, res) => {
  const { academic_year_id, search } = req.query;
  let query = `
    SELECT s.*, y.name AS academic_year_name 
    FROM students s
    JOIN academic_years y ON s.academic_year_id = y.id
  `;
  const params = [];
  const whereClauses = [];

  if (academic_year_id && academic_year_id !== 'all') {
    whereClauses.push('s.academic_year_id = ?');
    params.push(parseInt(academic_year_id, 10));
  }

  if (search) {
    whereClauses.push('(s.name LIKE ? OR s.enrollment_no LIKE ? OR s.mobile LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }
  query += ' ORDER BY s.name ASC';

  try {
    const rows = await all(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const student = await get(`
      SELECT s.*, y.name AS academic_year_name 
      FROM students s
      JOIN academic_years y ON s.academic_year_id = y.id
      WHERE s.id = ?
    `, [id]);
    
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Get active loans
    const activeLoans = await all(`
      SELECT t.*, b.accession_no, b.title, b.authors 
      FROM transactions t
      JOIN books b ON t.book_id = b.id
      WHERE t.student_id = ? AND t.return_date IS NULL
    `, [id]);

    // Calculate current dynamic overdue fines for active loans
    activeLoans.forEach(loan => {
      const overdueDays = getDaysOverdue(loan.due_date);
      if (overdueDays > 0) {
        loan.dynamic_fine = overdueDays * 10;
      } else {
        loan.dynamic_fine = 0;
      }
    });

    // Get history (returned books)
    const history = await all(`
      SELECT t.*, b.accession_no, b.title, b.authors 
      FROM transactions t
      JOIN books b ON t.book_id = b.id
      WHERE t.student_id = ? AND t.return_date IS NOT NULL
      ORDER BY t.return_date DESC
    `, [id]);

    // Calculate fine summary
    // Fines paid/waived
    const summary = await get(`
      SELECT 
        SUM(CASE WHEN fine_status = 'Paid' THEN fine_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN fine_status = 'Pending' THEN fine_amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN fine_status = 'Waived' THEN fine_amount ELSE 0 END) as total_waived
      FROM transactions
      WHERE student_id = ?
    `, [id]);

    res.json({
      student,
      activeLoans,
      history,
      fines: {
        paid: summary.total_paid || 0,
        pending: summary.total_pending || 0,
        waived: summary.total_waived || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  const { name, enrollment_no, course, division, academic_year_id, mobile, status } = req.body;
  if (!name || !enrollment_no || !course || !mobile) {
    return res.status(400).json({ error: 'Name, Enrollment Number, Course, and Mobile are required' });
  }
  const mobileClean = String(mobile).replace(/\D/g, '').trim();
  if (mobileClean.length !== 10) {
    return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
  }

  let targetYearId = academic_year_id;
  if (!targetYearId) {
    const activeYear = await get("SELECT id FROM academic_years WHERE status = 'active' LIMIT 1");
    targetYearId = activeYear ? activeYear.id : 6;
  }

  try {
    const result = await run(
      'INSERT INTO students (name, enrollment_no, course, division, academic_year_id, mobile, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), enrollment_no.trim(), course.trim(), (division || '-').trim(), targetYearId, mobileClean, status || 'Active']
    );
    res.status(201).json({ id: result.lastID, name: name.trim(), enrollment_no: enrollment_no.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk student upload
app.post('/api/students/bulk', async (req, res) => {
  const { students, academic_year_id, overwrite } = req.body;
  if (!students || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Invalid payload: students list required' });
  }

  let targetYearId = academic_year_id;
  if (!targetYearId) {
    const activeYear = await get("SELECT id FROM academic_years WHERE status = 'active' LIMIT 1");
    targetYearId = activeYear ? activeYear.id : 6;
  }

  try {
    await run('BEGIN TRANSACTION');
    const errors = [];
    const inserted = [];
    const updated = [];

    for (let index = 0; index < students.length; index++) {
      const s = students[index];
      // Basic validation
      if (!s.name || !s.enrollment_no || !s.course || !s.mobile) {
        errors.push(`Row ${index + 1}: Missing required fields (Name, Enrollment No, Course, Mobile)`);
        continue;
      }
      const mobileClean = String(s.mobile).replace(/\D/g, '').trim();
      if (mobileClean.length !== 10) {
        errors.push(`Row ${index + 1}: Mobile must be exactly 10 digits`);
        continue;
      }

      const divVal = (s.division || '-').trim();

      try {
        const existing = await get('SELECT id FROM students WHERE enrollment_no = ?', [s.enrollment_no.trim()]);
        if (existing && overwrite) {
          await run(
            'UPDATE students SET name = ?, course = ?, division = ?, mobile = ?, status = ? WHERE id = ?',
            [s.name.trim(), s.course.trim(), divVal, mobileClean, s.status || 'Active', existing.id]
          );
          updated.push(s.enrollment_no);
        } else {
          await run(
            'INSERT INTO students (name, enrollment_no, course, division, academic_year_id, mobile, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [s.name.trim(), s.enrollment_no.trim(), s.course.trim(), divVal, targetYearId, mobileClean, s.status || 'Active']
          );
          inserted.push(s.enrollment_no);
        }
      } catch (err) {
        errors.push(`Row ${index + 1} (${s.enrollment_no}): ${err.message.includes('UNIQUE') ? 'Enrollment number already exists' : err.message}`);
      }
    }

    if (errors.length > 0 && inserted.length === 0 && updated.length === 0) {
      await run('ROLLBACK');
      return res.status(400).json({ error: 'Bulk upload failed', details: errors });
    }

    await run('COMMIT');
    res.json({ message: `Successfully processed: ${inserted.length} enrolled, ${updated.length} updated.`, details: errors });
  } catch (err) {
    await run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Excel Spreadsheet Student Bulk Enrollment
app.post('/api/students/upload-excel', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  const { academic_year_id, overwrite } = req.query;
  const overwriteBool = overwrite === 'true';

  if (!academic_year_id) {
    return res.status(400).json({ error: 'academic_year_id is required' });
  }

  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'Empty file payload' });
  }

  const tempPath = path.join(__dirname, 'temp_students_' + Date.now() + '.xls');
  
  try {
    fs.writeFileSync(tempPath, req.body);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write temp upload file: ' + err.message });
  }

  const { execFile } = require('child_process');
  
  execFile('python', [path.join(__dirname, 'scripts/parse_students_excel.py'), tempPath], async (error, stdout, stderr) => {
    // Delete temp file immediately
    try { fs.unlinkSync(tempPath); } catch (e) {}

    if (error) {
      console.error('Students parse child process execution error:', error);
      return res.status(500).json({ error: 'Students parser helper execution failed: ' + error.message });
    }

    try {
      const result = JSON.parse(stdout.trim());
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Excel file parsing failed.' });
      }

      const students = result.students;
      if (!students || students.length === 0) {
        return res.status(400).json({ error: 'No valid students found in the uploaded Excel file.' });
      }

      const normalizeCourse = (c) => {
        const clean = String(c).trim().toLowerCase();
        if (clean.includes('b.sc') || clean.includes('bsc')) return 'B.Sc. Nursing';
        if (clean.includes('gnm')) return 'GNM';
        if (clean.includes('post basic') || clean.includes('pbbsc') || clean.includes('p.b.sc')) return 'Post Basic B.Sc.';
        if (clean.includes('m.sc') || clean.includes('msc')) return 'M.Sc. Nursing';
        return 'B.Sc. Nursing'; // default fallback
      };

      const normalizeMobile = (m) => {
        const clean = String(m).replace(/\D/g, '').trim();
        if (clean.length === 10) return clean;
        return '0000000000'; // fallback to satisfy CHECK(length(mobile) == 10)
      };

      await run('BEGIN TRANSACTION');
      const errors = [];
      const inserted = [];
      const updated = [];

      for (let index = 0; index < students.length; index++) {
        const s = students[index];
        if (!s.name || !s.enrollment_no) {
          errors.push(`Row ${index + 2}: Missing student Name or Code`);
          continue;
        }

        const courseNorm = normalizeCourse(s.course);
        const mobileNorm = normalizeMobile(s.mobile);
        const divNorm = s.division ? s.division.trim() : 'Default';

        try {
          const existing = await get('SELECT id FROM students WHERE enrollment_no = ?', [s.enrollment_no.trim()]);
          if (existing && overwriteBool) {
            await run(
              'UPDATE students SET name = ?, course = ?, division = ?, mobile = ? WHERE id = ?',
              [s.name.trim(), courseNorm, divNorm, mobileNorm, existing.id]
            );
            updated.push(s.enrollment_no);
          } else {
            await run(
              'INSERT INTO students (name, enrollment_no, course, division, academic_year_id, mobile, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [s.name.trim(), s.enrollment_no.trim(), courseNorm, divNorm, parseInt(academic_year_id), mobileNorm, 'Active']
            );
            inserted.push(s.enrollment_no);
          }
        } catch (err) {
          errors.push(`Row ${index + 2} (${s.name}): ${err.message.includes('UNIQUE') ? 'Enrollment Code already exists' : err.message}`);
        }
      }

      if (errors.length > 0 && inserted.length === 0 && updated.length === 0) {
        await run('ROLLBACK');
        return res.status(400).json({ error: 'Excel student import failed completely', details: errors });
      }

      await run('COMMIT');
      res.status(201).json({ message: `Successfully processed: ${inserted.length} enrolled, ${updated.length} updated.`, details: errors });

    } catch (parseErr) {
      console.error('Students parser output parsing failed:', parseErr, stdout);
      return res.status(500).json({ error: 'Failed to process student extraction result: ' + parseErr.message });
    }
  });
});

// Individual Student Profile Update
app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { name, enrollment_no, course, division, mobile, status } = req.body;
  
  if (!name || !enrollment_no || !course || !mobile) {
    return res.status(400).json({ error: 'Name, Enrollment Number, Course, and Mobile are required' });
  }
  const mobileClean = String(mobile).replace(/\D/g, '').trim();
  if (mobileClean.length !== 10) {
    return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
  }

  try {
    const result = await run(
      'UPDATE students SET name = ?, enrollment_no = ?, course = ?, division = ?, mobile = ?, status = ? WHERE id = ?',
      [name.trim(), enrollment_no.trim(), course.trim(), (division || '-').trim(), mobileClean, status || 'Active', id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json({ message: 'Student profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message.includes('UNIQUE') ? 'Enrollment Code already exists' : err.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const activeLoans = await all('SELECT id FROM transactions WHERE student_id = ? AND return_date IS NULL', [id]);
    if (activeLoans.length > 0) {
      return res.status(400).json({ error: 'Cannot delete student with active borrowed books.' });
    }
    const result = await run('DELETE FROM students WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json({ message: 'Student deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. BOOKS API
// ==========================================
app.get('/api/books', async (req, res) => {
  const { search, category, specialty } = req.query;
  const filterCategory = category || specialty;
  let query = 'SELECT * FROM books';
  const params = [];
  const whereClauses = [];

  if (search && search.trim()) {
    whereClauses.push('(title LIKE ? OR authors LIKE ? OR accession_no LIKE ? OR isbn LIKE ? OR specialty LIKE ? OR publisher LIKE ? OR call_no LIKE ?)');
    const searchVal = `%${search.trim()}%`;
    params.push(searchVal, searchVal, searchVal, searchVal, searchVal, searchVal, searchVal);
  }

  if (filterCategory && filterCategory.trim() && filterCategory.toLowerCase() !== 'all') {
    whereClauses.push('specialty = ?');
    params.push(filterCategory.trim());
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  query += ' ORDER BY length(accession_no) ASC, accession_no ASC';

  try {
    const rows = await all(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/books/specialties', async (req, res) => {
  try {
    const rows = await all('SELECT DISTINCT specialty FROM books WHERE specialty IS NOT NULL AND specialty != \'\' ORDER BY specialty ASC');
    const dbSpecialties = rows.map(r => r.specialty).filter(s => s && s.trim() !== '');
    res.json(dbSpecialties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/books/categories-summary', async (req, res) => {
  try {
    const rows = await all('SELECT specialty, count(*) as count FROM books WHERE specialty IS NOT NULL AND specialty != \'\' GROUP BY specialty ORDER BY count(*) DESC, specialty ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const generateAccessionNumbers = (baseAccession, qty) => {
  const match = baseAccession.match(/^(.*?)(\d+)$/);
  if (!match) {
    const accessions = [baseAccession];
    for (let i = 2; i <= qty; i++) {
      accessions.push(`${baseAccession}_${i}`);
    }
    return accessions;
  }
  const prefix = match[1];
  const numStr = match[2];
  const padLen = numStr.length;
  const startNum = parseInt(numStr, 10);
  
  const accessions = [];
  for (let i = 0; i < qty; i++) {
    const currentNum = startNum + i;
    const currentNumStr = String(currentNum).padStart(padLen, '0');
    accessions.push(`${prefix}${currentNumStr}`);
  }
  return accessions;
};

app.post('/api/books', async (req, res) => {
  const { accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status, qty, pages, volume, cost, bill_no, entry_date, call_no } = req.body;
  if (!accession_no || !title || !authors || !edition || !publisher || !publishing_year || !specialty || !rack_no || !shelf_no) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const count = parseInt(qty) || 1;
  const accessions = generateAccessionNumbers(accession_no.trim(), count);

  try {
    await run('BEGIN TRANSACTION');
    for (const acc of accessions) {
      const existing = await get('SELECT id FROM books WHERE accession_no = ?', [acc]);
      if (existing) {
        throw new Error(`Accession Number "${acc}" already exists.`);
      }
      await run(
        'INSERT INTO books (accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date, call_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          acc, 
          title.trim(), 
          authors.trim(), 
          edition.trim(), 
          publisher.trim(), 
          parseInt(publishing_year), 
          isbn ? isbn.trim() : '', 
          specialty.trim(), 
          rack_no.trim(), 
          shelf_no.trim(), 
          status || 'Available',
          parseInt(pages) || 0,
          volume ? volume.trim() : '',
          parseFloat(cost) || 0.0,
          bill_no ? bill_no.trim() : '',
          entry_date ? entry_date.trim() : '',
          call_no ? call_no.trim() : ''
        ]
      );
    }
    await run('COMMIT');
    res.status(201).json({ accession_no, title, qty: count });
  } catch (err) {
    await run('ROLLBACK');
    res.status(400).json({ error: err.message });
  }
});

// Bulk book upload
app.post('/api/books/bulk', async (req, res) => {
  const { books } = req.body;
  if (!books || !Array.isArray(books)) {
    return res.status(400).json({ error: 'Invalid payload: books array required' });
  }

  try {
    await run('BEGIN TRANSACTION');
    const errors = [];
    const inserted = [];

    for (let index = 0; index < books.length; index++) {
      const b = books[index];
      if (!b.accession_no || !b.title || !b.authors || !b.edition || !b.publisher || !b.publishing_year || !b.specialty || !b.rack_no || !b.shelf_no) {
        errors.push(`Row ${index + 1}: Missing required fields`);
        continue;
      }
      
      const count = parseInt(b.qty) || 1;
      const accessions = generateAccessionNumbers(b.accession_no.trim(), count);
      let rowFailed = false;

      for (const acc of accessions) {
        try {
          const existing = await get('SELECT id FROM books WHERE accession_no = ?', [acc]);
          if (existing) {
            throw new Error('Accession Number already exists');
          }
          await run(
            'INSERT INTO books (accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date, call_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              acc, 
              b.title.trim(), 
              b.authors.trim(), 
              b.edition.trim(), 
              b.publisher.trim(), 
              parseInt(b.publishing_year), 
              b.isbn ? b.isbn.trim() : '', 
              b.specialty.trim(), 
              b.rack_no.trim(), 
              b.shelf_no.trim(), 
              b.status || 'Available',
              parseInt(b.pages) || 0,
              b.volume ? b.volume.trim() : '',
              parseFloat(b.cost) || 0.0,
              b.bill_no ? b.bill_no.trim() : '',
              b.entry_date ? b.entry_date.trim() : '',
              b.call_no ? b.call_no.trim() : ''
            ]
          );
          inserted.push(acc);
        } catch (err) {
          errors.push(`Row ${index + 1} (${acc}): ${err.message}`);
          rowFailed = true;
          break; // Stop adding sequence for this CSV row if a duplicate or other issue is found
        }
      }
    }

    if (errors.length > 0 && inserted.length === 0) {
      await run('ROLLBACK');
      return res.status(400).json({ error: 'Bulk upload failed', details: errors });
    }

    await run('COMMIT');
    res.json({ message: `Successfully imported ${inserted.length} book copies.`, details: errors });
  } catch (err) {
    await run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Excel Spreadsheet Book Bulk Upload
app.post('/api/books/upload-excel', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'Empty file payload' });
  }

  const tempPath = path.join(__dirname, 'temp_upload_' + Date.now() + '.xlsx');
  
  try {
    fs.writeFileSync(tempPath, req.body);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write temp upload file: ' + err.message });
  }

  const { execFile } = require('child_process');
  
  execFile('python', [path.join(__dirname, 'scripts/parse_excel.py'), tempPath], async (error, stdout, stderr) => {
    // Delete temp file immediately
    try { fs.unlinkSync(tempPath); } catch (e) {}

    if (error) {
      console.error('Excel parse child process execution error:', error);
      return res.status(500).json({ error: 'Excel parser helper execution failed: ' + error.message });
    }

    try {
      const result = JSON.parse(stdout.trim());
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Excel file parsing failed.' });
      }

      const books = result.books;
      if (!books || books.length === 0) {
        return res.status(400).json({ error: 'No valid books found in the uploaded Excel file.' });
      }

      await run('BEGIN TRANSACTION');
      const errors = [];
      const inserted = [];

      for (let index = 0; index < books.length; index++) {
        const b = books[index];
        if (!b.accession_no || !b.title || !b.authors || !b.edition || !b.publisher || !b.publishing_year || !b.specialty || !b.rack_no || !b.shelf_no) {
          errors.push(`Row ${index + 2}: Missing required fields in Excel sheet`);
          continue;
        }

        const count = parseInt(b.qty) || 1;
        const accessions = generateAccessionNumbers(b.accession_no.trim(), count);
        let rowFailed = false;

        for (const acc of accessions) {
          try {
            const existing = await get('SELECT id FROM books WHERE accession_no = ?', [acc]);
            if (existing) {
              throw new Error(`Accession Number "${acc}" already exists.`);
            }
            await run(
              'INSERT INTO books (accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date, call_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                acc,
                b.title.trim(),
                b.authors.trim(),
                b.edition.trim(),
                b.publisher.trim(),
                parseInt(b.publishing_year),
                b.isbn ? b.isbn.trim() : '',
                b.specialty.trim(),
                b.rack_no.trim(),
                b.shelf_no.trim(),
                b.status || 'Available',
                parseInt(b.pages) || 0,
                b.volume ? b.volume.trim() : '',
                parseFloat(b.cost) || 0.0,
                b.bill_no ? b.bill_no.trim() : '',
                b.entry_date ? b.entry_date.trim() : '',
                b.call_no ? b.call_no.trim() : ''
              ]
            );
            inserted.push(acc);
          } catch (err) {
            errors.push(`Row ${index + 2} (${b.title}): ${err.message}`);
            rowFailed = true;
            break; // Stop adding sequence for this Excel row
          }
        }
      }

      if (errors.length > 0 && inserted.length === 0) {
        await run('ROLLBACK');
        return res.status(400).json({ error: 'Excel import failed completely', details: errors });
      }

      await run('COMMIT');
      res.status(201).json({ message: `Successfully imported ${inserted.length} book copies.`, details: errors });

    } catch (parseErr) {
      console.error('Excel parser output parsing failed:', parseErr, stdout);
      return res.status(500).json({ error: 'Failed to process spreadsheet extraction result: ' + parseErr.message });
    }
  });
});

app.delete('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const activeLoan = await get('SELECT id FROM transactions WHERE book_id = ? AND return_date IS NULL', [id]);
    if (activeLoan) {
      return res.status(400).json({ error: 'Cannot delete a book copy that is currently issued. Please return the book first.' });
    }
    const result = await run('DELETE FROM books WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Book copy not found.' });
    res.json({ message: 'Book copy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  const { accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date, call_no } = req.body;
  
  if (!accession_no || !title || !authors || !edition || !publisher || !publishing_year || !specialty || !rack_no || !shelf_no) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const duplicate = await get('SELECT id FROM books WHERE accession_no = ? AND id != ?', [accession_no.trim(), id]);
    if (duplicate) {
      return res.status(400).json({ error: `Accession Number "${accession_no.trim()}" is already assigned to another book.` });
    }

    const result = await run(
      `UPDATE books 
       SET accession_no = ?, title = ?, authors = ?, edition = ?, publisher = ?, publishing_year = ?, isbn = ?, specialty = ?, rack_no = ?, shelf_no = ?, status = ?, pages = ?, volume = ?, cost = ?, bill_no = ?, entry_date = ?, call_no = ? 
       WHERE id = ?`,
      [
        accession_no.trim(),
        title.trim(),
        authors.trim(),
        edition.trim(),
        publisher.trim(),
        parseInt(publishing_year, 10),
        isbn ? isbn.trim() : '',
        specialty.trim(),
        rack_no.trim(),
        shelf_no.trim(),
        status || 'Available',
        parseInt(pages, 10) || 0,
        volume ? volume.trim() : '',
        parseFloat(cost) || 0.0,
        bill_no ? bill_no.trim() : '',
        entry_date ? entry_date.trim() : '',
        call_no ? call_no.trim() : '',
        id
      ]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }

    res.json({ message: 'Book details updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. CIRCULATION COUNTER (ISSUE / RENEW / RETURN)
// ==========================================

// SEARCH ACTIVE TRANSACTIONS
app.get('/api/transactions/search', async (req, res) => {
  const { search } = req.query;
  if (!search) {
    return res.json([]);
  }
  
  const term = `%${search}%`;
  const query = `
    SELECT 
      t.id, t.issue_date, t.due_date, t.return_date, t.renewal_count, t.fine_amount, t.fine_status, t.fine_notes,
      b.accession_no, b.title AS book_title, b.authors AS book_authors, b.publisher AS book_publisher, b.rack_no, b.shelf_no,
      s.name AS student_name, s.enrollment_no, s.mobile
    FROM transactions t
    JOIN books b ON t.book_id = b.id
    JOIN students s ON t.student_id = s.id
    WHERE t.return_date IS NULL
      AND (b.accession_no LIKE ? OR s.name LIKE ? OR b.title LIKE ? OR b.authors LIKE ? OR b.publisher LIKE ?)
    ORDER BY t.due_date ASC
  `;
  try {
    const rows = await all(query, [term, term, term, term, term]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ISSUE BOOK
app.post('/api/transactions/issue', async (req, res) => {
  const { student_id, accession_no } = req.body;
  if (!student_id || !accession_no) {
    return res.status(400).json({ error: 'student_id and accession_no are required' });
  }

  try {
    // 1. Get Student & Check borrowing limit (Max 3 books)
    const activeLoans = await all('SELECT id FROM transactions WHERE student_id = ? AND return_date IS NULL', [student_id]);
    if (activeLoans.length >= 3) {
      return res.status(400).json({ error: 'Maximum borrowing limit of 3 books reached.' });
    }

    // 2. Get Book & Check availability
    const book = await get('SELECT * FROM books WHERE accession_no = ?', [accession_no]);
    if (!book) {
      return res.status(404).json({ error: `Book with Accession Number "${accession_no}" not found.` });
    }
    if (book.status !== 'Available') {
      return res.status(400).json({ error: `Book is currently "${book.status}" and cannot be issued.` });
    }

    // 3. Issue Book: Set issue date and due date (today + 15 days)
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 15);

    const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const issueDateStr = format(today);
    const dueDateStr = format(due);

    await run('BEGIN TRANSACTION');
    // Insert Transaction
    await run(
      'INSERT INTO transactions (book_id, student_id, issue_date, due_date, return_date, renewal_count, fine_amount, fine_status) VALUES (?, ?, ?, ?, NULL, 0, 0.0, \'None\')',
      [book.id, student_id, issueDateStr, dueDateStr]
    );
    // Update Book Status
    await run('UPDATE books SET status = \'Issued\' WHERE id = ?', [book.id]);
    await run('COMMIT');

    res.json({ message: 'Book issued successfully.', due_date: dueDateStr });
  } catch (err) {
    await run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// RENEW BOOK
app.post('/api/transactions/renew', async (req, res) => {
  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id is required' });

  try {
    const loan = await get('SELECT * FROM transactions WHERE id = ? AND return_date IS NULL', [transaction_id]);
    if (!loan) return res.status(404).json({ error: 'Active borrowing record not found.' });

    // Rule: Max 3 renewals
    if (loan.renewal_count >= 3) {
      return res.status(400).json({ error: 'Maximum 3 renewal cycles reached. Book must be returned.' });
    }

    const todayStr = getTodayString();
    const overdueDays = getDaysOverdue(loan.due_date, todayStr);
    
    let fineAmount = loan.fine_amount;
    let fineStatus = loan.fine_status;
    let fineNotes = loan.fine_notes;

    if (overdueDays > 0) {
      // Calculate pending penalty
      const dailyFine = overdueDays * 10;
      fineAmount += dailyFine;
      fineStatus = 'Pending';
      fineNotes = (fineNotes ? fineNotes + '; ' : '') + `Late renewal penalty: ₹${dailyFine} for ${overdueDays} days overdue`;
    }

    // Extend due date by 15 days from renewal date (or from previous due date, let's say from today)
    const today = new Date();
    const nextDue = new Date();
    nextDue.setDate(today.getDate() + 15);

    const pad = (n) => String(n).padStart(2, '0');
    const newDueDateStr = `${nextDue.getFullYear()}-${pad(nextDue.getMonth() + 1)}-${pad(nextDue.getDate())}`;

    await run(
      `UPDATE transactions 
       SET due_date = ?, renewal_count = renewal_count + 1, fine_amount = ?, fine_status = ?, fine_notes = ? 
       WHERE id = ?`,
      [newDueDateStr, fineAmount, fineStatus, fineNotes, transaction_id]
    );

    res.json({
      message: 'Book renewed successfully.',
      new_due_date: newDueDateStr,
      fine_added: overdueDays > 0 ? overdueDays * 10 : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RETURN BOOK
app.post('/api/transactions/return', async (req, res) => {
  const { accession_no, return_date, action, notes } = req.body; 
  // action: 'Paid' or 'Waived' or 'Pending' (just return the book and pay later)
  if (!accession_no) return res.status(400).json({ error: 'Accession Number is required' });

  try {
    const loan = await get(`
      SELECT t.*, b.id AS book_real_id 
      FROM transactions t
      JOIN books b ON t.book_id = b.id
      WHERE b.accession_no = ? AND t.return_date IS NULL
    `, [accession_no]);

    if (!loan) return res.status(404).json({ error: 'Active borrowing transaction not found for this Accession Number.' });

    const retDateStr = return_date || getTodayString();
    const overdueDays = getDaysOverdue(loan.due_date, retDateStr);
    
    let fineAmount = loan.fine_amount;
    let fineStatus = loan.fine_status;
    let fineNotes = loan.fine_notes;

    if (overdueDays > 0) {
      const calculatedFine = overdueDays * 10;
      fineAmount += calculatedFine;
      fineStatus = 'Pending';
      fineNotes = (fineNotes ? fineNotes + '; ' : '') + `Return overdue penalty: ₹${calculatedFine} for ${overdueDays} days`;
    }

    // Process payment/waiver action if provided
    if (action === 'Paid') {
      fineStatus = 'Paid';
      fineNotes = (fineNotes ? fineNotes + '; ' : '') + `Paid in full on return.`;
    } else if (action === 'Waived') {
      fineStatus = 'Waived';
      fineNotes = (fineNotes ? fineNotes + '; ' : '') + `Waived on return. Note: ${notes || 'None'}`;
    }

    await run('BEGIN TRANSACTION');
    // Update Transaction
    await run(
      'UPDATE transactions SET return_date = ?, fine_amount = ?, fine_status = ?, fine_notes = ? WHERE id = ?',
      [retDateStr, fineAmount, fineStatus, fineNotes, loan.id]
    );
    // Set Book as Available
    await run('UPDATE books SET status = \'Available\' WHERE id = ?', [loan.book_real_id]);
    await run('COMMIT');

    res.json({
      message: 'Book returned successfully.',
      overdue_days: overdueDays,
      fine_amount: fineAmount,
      fine_status: fineStatus
    });
  } catch (err) {
    await run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// PAY/WAIVE PENDING FINE DIRECTLY
app.post('/api/transactions/:id/fine', async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // action: 'Paid' or 'Waived'
  if (!['Paid', 'Waived'].includes(action)) {
    return res.status(400).json({ error: 'Action must be Paid or Waived' });
  }

  try {
    const loan = await get('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!loan) return res.status(404).json({ error: 'Transaction not found' });

    let fineNotes = loan.fine_notes || '';
    fineNotes += `; Fine marked as ${action}. ${notes ? 'Note: ' + notes : ''}`;

    await run(
      'UPDATE transactions SET fine_status = ?, fine_notes = ? WHERE id = ?',
      [action, fineNotes, id]
    );

    res.json({ message: `Fine status updated to ${action}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. JOURNALS & PERIODICALS API
// ==========================================
app.get('/api/journals', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM journals ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/journals', async (req, res) => {
  const { name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status } = req.body;
  if (!name || !issn || !publisher || !frequency || !volume_issue || !subscription_period || !rack_no || !shelf_no) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const result = await run(
      'INSERT INTO journals (name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status || 'Available']
    );
    res.status(201).json({ id: result.lastID, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/journals/:id', async (req, res) => {
  const { id } = req.params;
  const { name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status } = req.body;
  try {
    const result = await run(
      `UPDATE journals 
       SET name = ?, issn = ?, publisher = ?, frequency = ?, volume_issue = ?, subscription_period = ?, rack_no = ?, shelf_no = ?, status = ? 
       WHERE id = ?`,
      [name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Journal not found' });
    res.json({ message: 'Journal updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. REPORTS API
// ==========================================

// Accession Register Report
app.get('/api/reports/accession-register', async (req, res) => {
  try {
    const rows = await all('SELECT accession_no, title, authors, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date, call_no FROM books ORDER BY length(accession_no) ASC, accession_no ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to parse Call Number into numeric classification and cutter/letter parts
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

// Book Spine & Pocket Labels / Spine Call Number Only Report
app.get(['/api/reports/book-labels', '/api/reports/spine-callno-labels'], async (req, res) => {
  try {
    const { from_acc, to_acc, specialty, search } = req.query;
    let sql = 'SELECT id, accession_no, call_no, title, authors, edition, volume, publisher, specialty, rack_no, shelf_no, status FROM books WHERE 1=1';
    const params = [];

    if (specialty && specialty !== 'all') {
      sql += ' AND specialty = ?';
      params.push(specialty);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      sql += ' AND (accession_no LIKE ? OR call_no LIKE ? OR title LIKE ? OR authors LIKE ?)';
      params.push(term, term, term, term);
    }

    if (from_acc && from_acc.trim() !== '' && to_acc && to_acc.trim() !== '') {
      const fromNum = parseInt(from_acc.trim(), 10);
      const toNum = parseInt(to_acc.trim(), 10);
      if (!isNaN(fromNum) && !isNaN(toNum)) {
        sql += ' AND (CAST(accession_no AS INTEGER) >= ? AND CAST(accession_no AS INTEGER) <= ?)';
        params.push(fromNum, toNum);
      }
    } else if (from_acc && from_acc.trim() !== '') {
      const fromNum = parseInt(from_acc.trim(), 10);
      if (!isNaN(fromNum)) {
        sql += ' AND CAST(accession_no AS INTEGER) >= ?';
        params.push(fromNum);
      }
    } else if (to_acc && to_acc.trim() !== '') {
      const toNum = parseInt(to_acc.trim(), 10);
      if (!isNaN(toNum)) {
        sql += ' AND CAST(accession_no AS INTEGER) <= ?';
        params.push(toNum);
      }
    }

    sql += ' ORDER BY length(accession_no) ASC, accession_no ASC';
    const rows = await all(sql, params);

    // If requested route is spine-callno-labels, sort strictly from small number to large number,
    // and if the number is same, sort the letters alphabetically!
    if (req.path.includes('spine-callno-labels')) {
      rows.sort(compareSpineCallNo);
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue & Return Register
app.get('/api/reports/issue-return-register', async (req, res) => {
  const { academic_year_id, month } = req.query;
  let sql = `
    SELECT 
      t.id, t.issue_date, t.due_date, t.return_date, t.renewal_count, t.fine_amount, t.fine_status,
      b.accession_no, b.title AS book_title,
      s.name AS student_name, s.enrollment_no, s.course, s.division
    FROM transactions t
    JOIN books b ON t.book_id = b.id
    JOIN students s ON t.student_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (academic_year_id && academic_year_id !== 'all') {
    sql += ' AND s.academic_year_id = ?';
    params.push(parseInt(academic_year_id, 10));
  }

  if (month && month !== 'all') {
    sql += " AND strftime('%m', t.issue_date) = ?";
    params.push(month);
  }

  sql += ' ORDER BY t.issue_date DESC';

  try {
    const rows = await all(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Author-Wise Book List
app.get('/api/reports/author-wise', async (req, res) => {
  try {
    const rows = await all(`
      SELECT authors, title, edition, publisher, COUNT(*) as copy_count,
             SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_copy_count
      FROM books
      GROUP BY authors, title, edition, publisher
      ORDER BY authors ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Master Book Catalog
app.get('/api/reports/master-catalog', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM books ORDER BY title ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Penalty & Fine Collection Log
app.get('/api/reports/fines-log', async (req, res) => {
  const { academic_year_id, month } = req.query;
  let sql = `
    SELECT 
      t.id, t.fine_amount, t.fine_status, t.fine_notes, t.issue_date, t.due_date, t.return_date,
      s.name AS student_name, s.enrollment_no, s.mobile,
      b.accession_no, b.title AS book_title
    FROM transactions t
    JOIN students s ON t.student_id = s.id
    JOIN books b ON t.book_id = b.id
    WHERE t.fine_amount > 0
  `;
  const params = [];

  if (academic_year_id && academic_year_id !== 'all') {
    sql += ' AND s.academic_year_id = ?';
    params.push(parseInt(academic_year_id, 10));
  }

  if (month && month !== 'all') {
    sql += " AND strftime('%m', t.issue_date) = ?";
    params.push(month);
  }

  sql += ' ORDER BY t.due_date DESC';

  try {
    const rows = await all(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Journal & Periodical List
app.get('/api/reports/journals', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM journals ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. BACKUP API
// ==========================================
app.post('/api/backup', (req, res) => {
  const { path: customPath } = req.body;
  try {
    const dest = backupDatabase(customPath);
    res.json({ message: 'Backup successfully completed.', path: dest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start-up & Initialisation
let serverInstance;
const startServer = async () => {
  try {
    await ensureInitialized();
    if (!process.env.VERCEL) {
      serverInstance = app.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`J & D Institute of Nursing Library server is active!`);
        console.log(`Access standard web application at: http://localhost:${PORT}`);
        console.log(`==================================================`);
      });
    }
  } catch (error) {
    console.error('Error starting application server:', error);
  }
};

startServer();

const closeServer = () => {
  if (serverInstance) {
    serverInstance.close();
  }
};

app.close = closeServer;

module.exports = app;
module.exports.app = app;
module.exports.close = closeServer;
