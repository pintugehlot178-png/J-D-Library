require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('===============================================================');
  console.error('ERROR: DATABASE_URL is not defined in your environment or .env!');
  console.error('===============================================================');
  console.error('To migrate your library data to Neon PostgreSQL:');
  console.error('1. Create a free project at https://neon.tech');
  console.error('2. Copy your connection string:');
  console.error('   postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require');
  console.error('3. Add it to a .env file in the root folder:');
  console.error('   DATABASE_URL="postgresql://..."');
  console.error('4. Re-run: npm run migrate:neon');
  console.error('===============================================================');
  process.exit(1);
}

const isClean = process.argv.includes('--clean') || process.argv.includes('--force');

const sqliteDbPath = path.join(__dirname, '..', 'library.db');
if (!fs.existsSync(sqliteDbPath)) {
  console.error('Error: SQLite database file "library.db" not found at:', sqliteDbPath);
  process.exit(1);
}

const sqliteDb = new sqlite3.Database(sqliteDbPath);

const sqliteAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const schemaSql = `
  CREATE TABLE IF NOT EXISTS academic_years (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive'))
  );

  CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    enrollment_no VARCHAR(100) UNIQUE NOT NULL,
    course VARCHAR(100) NOT NULL,
    division VARCHAR(50) NOT NULL,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    mobile VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    accession_no VARCHAR(100) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    edition VARCHAR(100) NOT NULL,
    publisher VARCHAR(255) NOT NULL,
    publishing_year INTEGER NOT NULL,
    isbn VARCHAR(100),
    specialty VARCHAR(100) NOT NULL,
    rack_no VARCHAR(50) NOT NULL,
    shelf_no VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Available',
    pages INTEGER DEFAULT 0,
    volume VARCHAR(50) DEFAULT '',
    cost NUMERIC(10, 2) DEFAULT 0.0,
    bill_no VARCHAR(100) DEFAULT '',
    entry_date VARCHAR(50) DEFAULT '',
    call_no VARCHAR(100) DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issue_date VARCHAR(50) NOT NULL,
    due_date VARCHAR(50) NOT NULL,
    return_date VARCHAR(50),
    renewal_count INTEGER DEFAULT 0,
    fine_amount NUMERIC(10, 2) DEFAULT 0.0,
    fine_status VARCHAR(50) DEFAULT 'None',
    fine_notes TEXT
  );

  CREATE TABLE IF NOT EXISTS journals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    issn VARCHAR(100) NOT NULL,
    publisher VARCHAR(255) NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    volume_issue VARCHAR(100) NOT NULL,
    subscription_period VARCHAR(100) NOT NULL,
    rack_no VARCHAR(50) NOT NULL,
    shelf_no VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Available'
  );
`;

async function batchInsert(client, tableName, columns, rows, batchSize = 250) {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valuePlaceholders = [];
    const flatParams = [];
    let paramIndex = 1;

    for (const row of batch) {
      const rowPlaceholders = [];
      for (const col of columns) {
        rowPlaceholders.push('$' + paramIndex++);
        flatParams.push(row[col] !== undefined ? row[col] : null);
      }
      valuePlaceholders.push('(' + rowPlaceholders.join(', ') + ')');
    }

    const updateSet = columns
      .filter(c => c !== 'id')
      .map(c => c + ' = EXCLUDED.' + c)
      .join(', ');

    const query = 'INSERT INTO ' + tableName + ' (' + columns.join(', ') + ') ' +
      'VALUES ' + valuePlaceholders.join(', ') + ' ' +
      'ON CONFLICT (id) DO UPDATE SET ' + updateSet;

    await client.query(query, flatParams);
    inserted += batch.length;
    process.stdout.write('  - Migrated ' + inserted + '/' + rows.length + ' ' + tableName + '...\r');
  }
  process.stdout.write('\n');
  return inserted;
}

async function migrate() {
  console.log('===============================================================');
  console.log('  J & D Nursing Library: SQLite -> Neon PostgreSQL Migration   ');
  console.log('===============================================================');
  console.log('Source SQLite DB:', sqliteDbPath);
  console.log('Target Neon DB  :', DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

  const client = await pgPool.connect();

  try {
    console.log('\n1. Initializing schema on Neon PostgreSQL...');
    await client.query(schemaSql);
    console.log('   Schema successfully verified.');

    if (isClean) {
      console.log('\n2. Truncating existing PostgreSQL tables (--clean mode)...');
      await client.query('TRUNCATE transactions, students, books, journals, academic_years RESTART IDENTITY CASCADE;');
      console.log('   All target tables truncated cleanly.');
    }

    console.log('\n3. Fetching data from local SQLite database...');
    const academicYears = await sqliteAll('SELECT * FROM academic_years ORDER BY id ASC');
    const students = await sqliteAll('SELECT * FROM students ORDER BY id ASC');
    const books = await sqliteAll('SELECT * FROM books ORDER BY id ASC');
    const transactions = await sqliteAll('SELECT * FROM transactions ORDER BY id ASC');
    const journals = await sqliteAll('SELECT * FROM journals ORDER BY id ASC');

    console.log('   Found: ' + academicYears.length + ' academic years, ' +
      students.length + ' students, ' +
      books.length + ' books, ' +
      transactions.length + ' transactions, ' +
      journals.length + ' journals.');

    console.log('\n4. Migrating records to Neon PostgreSQL...');

    await client.query('BEGIN');

    // academic_years
    if (academicYears.length > 0) {
      await batchInsert(client, 'academic_years', ['id', 'name', 'status'], academicYears);
      await client.query("SELECT setval(pg_get_serial_sequence('academic_years', 'id'), COALESCE(MAX(id), 1)) FROM academic_years;");
    }

    // students
    if (students.length > 0) {
      await batchInsert(client, 'students', ['id', 'name', 'enrollment_no', 'course', 'division', 'academic_year_id', 'mobile', 'status'], students);
      await client.query("SELECT setval(pg_get_serial_sequence('students', 'id'), COALESCE(MAX(id), 1)) FROM students;");
    }

    // books
    if (books.length > 0) {
      const bookColumns = [
        'id', 'accession_no', 'title', 'authors', 'edition', 'publisher',
        'publishing_year', 'isbn', 'specialty', 'rack_no', 'shelf_no',
        'status', 'pages', 'volume', 'cost', 'bill_no', 'entry_date', 'call_no'
      ];
      await batchInsert(client, 'books', bookColumns, books, 200);
      await client.query("SELECT setval(pg_get_serial_sequence('books', 'id'), COALESCE(MAX(id), 1)) FROM books;");
    }

    // transactions
    if (transactions.length > 0) {
      const txColumns = [
        'id', 'book_id', 'student_id', 'issue_date', 'due_date',
        'return_date', 'renewal_count', 'fine_amount', 'fine_status', 'fine_notes'
      ];
      await batchInsert(client, 'transactions', txColumns, transactions);
      await client.query("SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE(MAX(id), 1)) FROM transactions;");
    }

    // journals
    if (journals.length > 0) {
      const journalColumns = [
        'id', 'name', 'issn', 'publisher', 'frequency',
        'volume_issue', 'subscription_period', 'rack_no', 'shelf_no', 'status'
      ];
      await batchInsert(client, 'journals', journalColumns, journals);
      await client.query("SELECT setval(pg_get_serial_sequence('journals', 'id'), COALESCE(MAX(id), 1)) FROM journals;");
    }

    await client.query('COMMIT');
    console.log('   All records committed successfully.');

    console.log('\n5. Verifying Neon PostgreSQL row counts...');
    const tables = ['academic_years', 'students', 'books', 'transactions', 'journals'];
    const expected = {
      academic_years: academicYears.length,
      students: students.length,
      books: books.length,
      transactions: transactions.length,
      journals: journals.length
    };

    console.log('\n+------------------+----------------+---------------+---------+');
    console.log('| Table Name       | SQLite Records | Neon Postgres | Status  |');
    console.log('+------------------+----------------+---------------+---------+');

    let allMatched = true;
    for (const t of tables) {
      const res = await client.query('SELECT count(*)::int as count FROM ' + t);
      const pgCount = res.rows[0].count;
      const match = pgCount === expected[t];
      if (!match) allMatched = false;
      const status = match ? 'PASS' : 'WARN';
      console.log(
        '| ' + t.padEnd(16) + ' | ' + String(expected[t]).padStart(14) + ' | ' + String(pgCount).padStart(13) + ' | ' + status.padEnd(7) + ' |'
      );
    }
    console.log('+------------------+----------------+---------------+---------+');

    if (allMatched) {
      console.log('\nSUCCESS: All data successfully migrated to Neon PostgreSQL with zero loss!');
    } else {
      console.log('\nNOTE: Some record counts differ. If you ran without --clean, existing records may have been updated.');
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nMigration FAILED:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    sqliteDb.close();
  }
}

migrate();
