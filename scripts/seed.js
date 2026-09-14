const { db, run, initSchema } = require('../database');

async function seed() {
  console.log('Initializing database schema...');
  await initSchema();

  console.log('Clearing existing data...');
  // Disable foreign keys temporarily to clear tables
  await run('PRAGMA foreign_keys = OFF;');
  await run('DELETE FROM transactions;');
  await run('DELETE FROM students;');
  await run('DELETE FROM books;');
  await run('DELETE FROM journals;');
  await run('DELETE FROM academic_years;');
  await run('PRAGMA foreign_keys = ON;');

  console.log('Seeding Academic Years...');
  const years = [
    { name: '2025–2026', status: 'inactive' },
    { name: '2026–2027', status: 'active' },
    { name: '2027–2028', status: 'inactive' }
  ];
  for (const y of years) {
    await run('INSERT INTO academic_years (name, status) VALUES (?, ?)', [y.name, y.status]);
  }

  // Get academic year IDs
  const activeYear = await new Promise((resolve, reject) => {
    db.get("SELECT id FROM academic_years WHERE status = 'active'", (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  const activeYearId = activeYear ? activeYear.id : 1;

  const inactiveYear = await new Promise((resolve, reject) => {
    db.get("SELECT id FROM academic_years WHERE status = 'inactive' LIMIT 1", (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  const inactiveYearId = inactiveYear ? inactiveYear.id : 1;

  console.log('Seeding Students...');
  const students = [
    { name: 'Aarav Mehta', enrollment_no: 'JD-2026-001', course: 'B.Sc. Nursing', division: 'Division A', academic_year_id: activeYearId, mobile: '9876543210', status: 'Active' },
    { name: 'Ananya Sharma', enrollment_no: 'JD-2026-002', course: 'B.Sc. Nursing', division: 'Division A', academic_year_id: activeYearId, mobile: '8765432109', status: 'Active' },
    { name: 'Rahul Patel', enrollment_no: 'JD-2026-003', course: 'GNM', division: 'Batch 1', academic_year_id: activeYearId, mobile: '7654321098', status: 'Active' },
    { name: 'Priya Nair', enrollment_no: 'JD-2026-004', course: 'Post Basic B.Sc.', division: 'Division B', academic_year_id: activeYearId, mobile: '6543210987', status: 'On Hold' },
    { name: 'Sneha Reddy', enrollment_no: 'JD-2026-005', course: 'M.Sc. Nursing', division: 'Batch A', academic_year_id: activeYearId, mobile: '9123456789', status: 'Active' },
    { name: 'Kabir Singh', enrollment_no: 'JD-2025-099', course: 'B.Sc. Nursing', division: 'Division A', academic_year_id: inactiveYearId, mobile: '9988776655', status: 'Graduated' }
  ];
  for (const s of students) {
    await run(
      'INSERT INTO students (name, enrollment_no, course, division, academic_year_id, mobile, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.name, s.enrollment_no, s.course, s.division, s.academic_year_id, s.mobile, s.status]
    );
  }

  console.log('Seeding Books...');
  const books = [
    { accession_no: 'JD-LIB-0001', title: 'Brunner & Suddarth\'s Textbook of Medical-Surgical Nursing', authors: 'Janice L. Hinkle, Kerry H. Cheever', edition: '14th Edition', publisher: 'Wolters Kluwer', publishing_year: 2018, isbn: '9781496347992', specialty: 'Medical-Surgical', rack_no: 'Rack 1', shelf_no: 'Shelf A', status: 'Available' },
    { accession_no: 'JD-LIB-0002', title: 'Essential Pediatrics', authors: 'O.P. Ghai, Paul Vinod, Arvind Bagga', edition: '9th Edition', publisher: 'CBS Publishers', publishing_year: 2019, isbn: '9789388902847', specialty: 'Pediatrics', rack_no: 'Rack 2', shelf_no: 'Shelf B', status: 'Available' },
    { accession_no: 'JD-LIB-0003', title: 'DC Dutta\'s Textbook of Obstetrics', authors: 'Hiralal Konar', edition: '9th Edition', publisher: 'Jaypee Brothers Medical Publishers', publishing_year: 2018, isbn: '9789352702442', specialty: 'Obstetrics & Gynaecology', rack_no: 'Rack 3', shelf_no: 'Shelf C', status: 'Available' },
    { accession_no: 'JD-LIB-0004', title: 'Park\'s Textbook of Preventive and Social Medicine', authors: 'K. Park', edition: '25th Edition', publisher: 'Banarsidas Bhanot', publishing_year: 2019, isbn: '9789382219156', specialty: 'Community Health', rack_no: 'Rack 4', shelf_no: 'Shelf D', status: 'Available' },
    { accession_no: 'JD-LIB-0005', title: 'Anatomy and Physiology for Nurses', authors: 'Evelyn Pearce', edition: '16th Edition', publisher: 'Faber & Faber', publishing_year: 2012, isbn: '9780571046200', specialty: 'Anatomy & Physiology', rack_no: 'Rack 5', shelf_no: 'Shelf E', status: 'Available' },
    { accession_no: 'JD-LIB-0006', title: 'Kozier & Erb\'s Fundamentals of Nursing', authors: 'Audrey Berman, Shirlee Snyder', edition: '10th Edition', publisher: 'Pearson', publishing_year: 2015, isbn: '9780133974362', specialty: 'Nursing Foundations', rack_no: 'Rack 6', shelf_no: 'Shelf F', status: 'Available' },
    { accession_no: 'JD-LIB-0007', title: 'Pharmacology for Nurses', authors: 'Padmaja Udaykumar', edition: '4th Edition', publisher: 'Jaypee Brothers', publishing_year: 2016, isbn: '9789350906231', specialty: 'Pharmacology', rack_no: 'Rack 7', shelf_no: 'Shelf G', status: 'Available' },
    { accession_no: 'JD-LIB-0008', title: 'Stuart Textbook of Psychiatric Nursing', authors: 'Gail W. Stuart', edition: '11th Edition', publisher: 'Elsevier', publishing_year: 2020, isbn: '9780323640275', specialty: 'Anatomy & Physiology', rack_no: 'Rack 5', shelf_no: 'Shelf A', status: 'Under Maintenance/Binding' }
  ];
  for (const b of books) {
    await run(
      'INSERT INTO books (accession_no, title, authors, edition, publisher, publishing_year, isbn, specialty, rack_no, shelf_no, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.accession_no, b.title, b.authors, b.edition, b.publisher, b.publishing_year, b.isbn, b.specialty, b.rack_no, b.shelf_no, b.status]
    );
  }

  console.log('Seeding Journals & Periodicals...');
  const journals = [
    { name: 'Indian Journal of Nursing Studies', issn: '0974-9357', publisher: 'GNC Publications', frequency: 'Quarterly', volume_issue: 'Vol 14, Issue 2', subscription_period: 'Jan 2026 - Dec 2026', rack_no: 'Rack J1', shelf_no: 'Shelf A', status: 'Available' },
    { name: 'International Journal of Psychiatric Nursing', issn: '2395-180X', publisher: 'Red Flower Publication', frequency: 'Bi-monthly', volume_issue: 'Vol 8, Issue 1', subscription_period: 'Jul 2025 - Jun 2026', rack_no: 'Rack J2', shelf_no: 'Shelf B', status: 'Available' },
    { name: 'Asian Journal of Nursing Education and Research', issn: '2231-1149', publisher: 'A&V Publications', frequency: 'Quarterly', volume_issue: 'Vol 12, Issue 4', subscription_period: 'Jan 2026 - Dec 2027', rack_no: 'Rack J1', shelf_no: 'Shelf B', status: 'Available' }
  ];
  for (const j of journals) {
    await run(
      'INSERT INTO journals (name, issn, publisher, frequency, volume_issue, subscription_period, rack_no, shelf_no, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [j.name, j.issn, j.publisher, j.frequency, j.volume_issue, j.subscription_period, j.rack_no, j.shelf_no, j.status]
    );
  }

  console.log('Seeding Transactions...');
  // Let's seed a transaction for Student 1 borrowing Book 1 (due in past, to simulate fine)
  // Let's see what the ID of student Aarav Mehta is (usually 1) and Brunner & Suddarth is (usually 1)
  const st1 = await new Promise((resolve) => db.get("SELECT id FROM students WHERE name = 'Aarav Mehta'", (err, row) => resolve(row)));
  const bk1 = await new Promise((resolve) => db.get("SELECT id FROM books WHERE accession_no = 'JD-LIB-0001'", (err, row) => resolve(row)));
  const bk2 = await new Promise((resolve) => db.get("SELECT id FROM books WHERE accession_no = 'JD-LIB-0002'", (err, row) => resolve(row)));

  if (st1 && bk1 && bk2) {
    // Overdue transaction: issued 30 days ago, due 16 days ago, returned today (or pending return)
    const today = new Date();
    
    // Setup date strings
    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    const issueDate = new Date();
    issueDate.setDate(today.getDate() - 30);
    const dueDate = new Date();
    dueDate.setDate(today.getDate() - 16);

    // Let's insert a pending return overdue transaction (will calculate fine dynamically on return, or we pre-set fine status)
    await run(
      'INSERT INTO transactions (book_id, student_id, issue_date, due_date, return_date, renewal_count, fine_amount, fine_status, fine_notes) VALUES (?, ?, ?, ?, NULL, 0, 160.0, \'Pending\', \'Overdue by 16 days\')',
      [bk1.id, st1.id, formatDate(issueDate), formatDate(dueDate)]
    );
    await run('UPDATE books SET status = \'Issued\' WHERE id = ?', [bk1.id]);

    // Active loan, not overdue
    const issueDate2 = new Date();
    issueDate2.setDate(today.getDate() - 5);
    const dueDate2 = new Date();
    dueDate2.setDate(today.getDate() + 9);
    await run(
      'INSERT INTO transactions (book_id, student_id, issue_date, due_date, return_date, renewal_count, fine_amount, fine_status) VALUES (?, ?, ?, ?, NULL, 0, 0, \'None\')',
      [bk2.id, st1.id, formatDate(issueDate2), formatDate(dueDate2)]
    );
    await run('UPDATE books SET status = \'Issued\' WHERE id = ?', [bk2.id]);
  }

  console.log('Database seeding complete.');
}

if (require.main === module) {
  seed().then(() => {
    db.close();
    process.exit(0);
  }).catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}

module.exports = seed;
