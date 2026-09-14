process.env.PORT = 3030;
process.env.NODE_ENV = 'test';
const appInstance = require('../server'); // Start the Express application on port 3030

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { run } = require('../database');

const BASE_URL = 'http://localhost:3030/api';

test('Integration Test Suite - Library Management System', async (t) => {
  // Wait a short moment for server to bind to port 3030
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Reset database tables to ensure test isolation
  await run('PRAGMA foreign_keys = OFF;');
  await run('DELETE FROM transactions;');
  await run('DELETE FROM students;');
  await run('DELETE FROM books;');
  await run('DELETE FROM journals;');
  await run('DELETE FROM academic_years;');
  await run('PRAGMA foreign_keys = ON;');

  // Seed active academic year for testing
  await run("INSERT INTO academic_years (name, status) VALUES ('2026–2027', 'active')");

  let activeYearId = null;
  let studentId = null;

  await t.test('1. Setup Academic Year', async () => {
    const res = await fetch(`${BASE_URL}/academic-years`);
    const years = await res.json();
    assert.ok(years.length > 0, 'Should have seeded academic years');
    
    const active = years.find(y => y.status === 'active');
    assert.ok(active, 'Should have an active academic year');
    activeYearId = active.id;
  });

  await t.test('2. Register Student with Mobile Constraint', async () => {
    // 2.1 Register valid student
    const res = await fetch(`${BASE_URL}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Student',
        enrollment_no: 'TEST-ST-001',
        course: 'B.Sc. Nursing',
        division: 'Division A',
        mobile: '1234567890',
        academic_year_id: activeYearId,
        status: 'Active'
      })
    });
    assert.equal(res.status, 201, 'Valid student registration should return 201');
    const data = await res.json();
    studentId = data.id;

    // 2.2 Attempt registration with invalid mobile
    const resFail = await fetch(`${BASE_URL}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fail Student',
        enrollment_no: 'TEST-ST-002',
        course: 'B.Sc. Nursing',
        division: 'Division A',
        mobile: '12345', // Invalid length
        academic_year_id: activeYearId,
        status: 'Active'
      })
    });
    assert.equal(resFail.status, 400, 'Invalid student mobile length should return 400');
  });

  await t.test('3. Book Cataloging Accession Constraint', async () => {
    // Add unique books
    const bookList = [
      { accession_no: 'TEST-BK-001', title: 'Test Book 1', authors: 'Author 1', edition: '1st', publisher: 'Pub', publishing_year: 2020, specialty: 'Medical-Surgical', rack_no: 'R1', shelf_no: 'S1' },
      { accession_no: 'TEST-BK-002', title: 'Test Book 2', authors: 'Author 2', edition: '1st', publisher: 'Pub', publishing_year: 2020, specialty: 'Medical-Surgical', rack_no: 'R1', shelf_no: 'S1' },
      { accession_no: 'TEST-BK-003', title: 'Test Book 3', authors: 'Author 3', edition: '1st', publisher: 'Pub', publishing_year: 2020, specialty: 'Medical-Surgical', rack_no: 'R1', shelf_no: 'S1' },
      { accession_no: 'TEST-BK-004', title: 'Test Book 4', authors: 'Author 4', edition: '1st', publisher: 'Pub', publishing_year: 2020, specialty: 'Medical-Surgical', rack_no: 'R1', shelf_no: 'S1' }
    ];

    for (const bk of bookList) {
      const res = await fetch(`${BASE_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bk)
      });
      assert.equal(res.status, 201, `Book ${bk.accession_no} should be registered`);
    }

    // Attempt duplicate accession number
    const resDup = await fetch(`${BASE_URL}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accession_no: 'TEST-BK-001', title: 'Dup Book', authors: 'Author', edition: '1st', publisher: 'Pub', publishing_year: 2020, specialty: 'Medical-Surgical', rack_no: 'R1', shelf_no: 'S1' })
    });
    assert.equal(resDup.status, 400, 'Duplicate Accession Number should return 400 error');
  });

  await t.test('4. Issue Books (Rule 1: Max 3 Books)', async () => {
    // 4.1 Issue book 1, 2, 3
    for (const acc of ['TEST-BK-001', 'TEST-BK-002', 'TEST-BK-003']) {
      const res = await fetch(`${BASE_URL}/transactions/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, accession_no: acc })
      });
      assert.equal(res.status, 200, `Issuing ${acc} should succeed`);
    }

    // 4.2 Attempt to issue 4th book (TEST-BK-004) - should block
    const resBlocked = await fetch(`${BASE_URL}/transactions/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, accession_no: 'TEST-BK-004' })
    });
    assert.equal(resBlocked.status, 400, 'Issuing 4th book should return 400');
    const data = await resBlocked.json();
    assert.match(data.error, /Maximum borrowing limit of 3 books reached/, 'Should return maximum limit message');
  });

  await t.test('5. Renewal Limit (Rule 2: Max 3 Renewals)', async () => {
    // Get active transaction ID for book 1
    const resProfile = await fetch(`${BASE_URL}/students/${studentId}`);
    const profile = await resProfile.json();
    const loan = profile.activeLoans.find(l => l.accession_no === 'TEST-BK-001');
    assert.ok(loan, 'Should find active loan for TEST-BK-001');

    // Attempt renewal 3 times
    for (let cycle = 1; cycle <= 3; cycle++) {
      const resRenew = await fetch(`${BASE_URL}/transactions/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: loan.id })
      });
      assert.equal(resRenew.status, 200, `Renewal cycle ${cycle} should succeed`);
    }

    // 4th renewal attempt should block
    const resRenewBlocked = await fetch(`${BASE_URL}/transactions/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: loan.id })
    });
    assert.equal(resRenewBlocked.status, 400, '4th renewal cycle should be blocked');
    const data = await resRenewBlocked.json();
    assert.match(data.error, /Maximum 3 renewal cycles reached/, 'Should return renewal limit message');
  });

  await t.test('6. Return & Penalty Calculation (Rule 3: ₹10/Day Overdue)', async () => {
    // Return book 2 directly without overdue (issue and return today)
    const resRetClean = await fetch(`${BASE_URL}/transactions/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accession_no: 'TEST-BK-002' })
    });
    assert.equal(resRetClean.status, 200, 'Returning a non-overdue book should succeed');
    const cleanData = await resRetClean.json();
    assert.equal(cleanData.overdue_days, 0);
    assert.equal(cleanData.fine_amount, 0);

    // Let's create an overdue transaction manually via database helper for TEST-BK-004
    // Issue it first (student is now down to 2 active loans, so they can borrow TEST-BK-004)
    const resIssue4 = await fetch(`${BASE_URL}/transactions/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, accession_no: 'TEST-BK-004' })
    });
    assert.equal(resIssue4.status, 200, 'Should issue book 4 now that quota has opened');

    // Update active transaction in SQLite directly to set due_date 5 days in the past
    const sqlite3 = require('sqlite3').verbose();
    const dbFile = process.env.NODE_ENV === 'test' ? 'library_test.db' : 'library.db';
    const dbPath = path.join(__dirname, '../' + dbFile);
    const db = new sqlite3.Database(dbPath);
    
    const pad = (n) => String(n).padStart(2, '0');
    const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 5);
    const overdueDateStr = format(overdueDate);

    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE transactions SET due_date = ? WHERE book_id = (SELECT id FROM books WHERE accession_no = 'TEST-BK-004') AND return_date IS NULL",
        [overdueDateStr],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    db.close();

    // Now return TEST-BK-004 and verify ₹50 fine (5 days * ₹10)
    const resRetOverdue = await fetch(`${BASE_URL}/transactions/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accession_no: 'TEST-BK-004', action: 'Paid', notes: 'Collected late fee' })
    });
    assert.equal(resRetOverdue.status, 200);
    const overdueData = await resRetOverdue.json();
    assert.equal(overdueData.overdue_days, 5, 'Should be 5 days overdue');
    assert.equal(overdueData.fine_amount, 50, 'Fine should be ₹50');
    assert.equal(overdueData.fine_status, 'Paid', 'Fine status should be Paid');
  });

  await t.test('7. One-Click SQLite Backup', async () => {
    const resBackup = await fetch(`${BASE_URL}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(resBackup.status, 200, 'Backup endpoint should return 200');
    const backupData = await resBackup.json();
    assert.ok(fs.existsSync(backupData.path), 'Backup database file should physically exist');
  });

  // Teardown server listener so the test runner can exit cleanly
  appInstance.close();
});
