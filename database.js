require('dotenv').config();
const path = require('path');

const isPostgres = Boolean(process.env.DATABASE_URL);

let db = null;
let run, get, all, exec, initSchema;

if (isPostgres) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log('Connected to Neon PostgreSQL database.');

  let transactionClient = null;

  const getActiveClient = async () => {
    if (transactionClient) return transactionClient;
    return pool;
  };

  // Converts SQLite "?" placeholders to PostgreSQL "$1, $2, ..."
  // and converts LIKE to ILIKE for case-insensitive matching
  const toPgSql = (sql) => {
    let paramIdx = 1;
    let converted = sql.replace(/\?/g, () => `$${paramIdx++}`);
    converted = converted.replace(/\bLIKE\b/gi, 'ILIKE');
    return converted;
  };

  run = async (sql, params = []) => {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed === 'BEGIN TRANSACTION' || trimmed === 'BEGIN') {
      if (!transactionClient) {
        transactionClient = await pool.connect();
      }
      await transactionClient.query('BEGIN');
      return { lastID: null, changes: 0 };
    }
    if (trimmed === 'COMMIT') {
      if (transactionClient) {
        await transactionClient.query('COMMIT');
        transactionClient.release();
        transactionClient = null;
      }
      return { lastID: null, changes: 0 };
    }
    if (trimmed === 'ROLLBACK') {
      if (transactionClient) {
        try {
          await transactionClient.query('ROLLBACK');
        } catch (e) {
          // ignore rollback errors if already aborted
        } finally {
          transactionClient.release();
          transactionClient = null;
        }
      }
      return { lastID: null, changes: 0 };
    }

    let pgSql = toPgSql(sql);
    const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
    if (isInsert && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id';
    }

    const client = await getActiveClient();
    const res = await client.query(pgSql, params);
    const lastID = (res.rows && res.rows.length > 0 && res.rows[0].id) ? res.rows[0].id : null;
    return { lastID, changes: res.rowCount };
  };

  get = async (sql, params = []) => {
    const client = await getActiveClient();
    const pgSql = toPgSql(sql);
    const res = await client.query(pgSql, params);
    return res.rows[0] || null;
  };

  all = async (sql, params = []) => {
    const client = await getActiveClient();
    const pgSql = toPgSql(sql);
    const res = await client.query(pgSql, params);
    return res.rows;
  };

  exec = async (sql) => {
    const client = await getActiveClient();
    await client.query(sql);
  };

  initSchema = async () => {
    const pgSchema = `
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
    await exec(pgSchema);
  };

  db = pool;
} else {
  // SQLite Fallback (Local Offline Mode)
  const sqlite3 = require('sqlite3').verbose();
  const dbFile = process.env.NODE_ENV === 'test' ? 'library_test.db' : 'library.db';
  const dbPath = path.join(__dirname, dbFile);

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to connect to SQLite database:', err);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
    }
  });

  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
  });

  run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  exec = (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  initSchema = async () => {
    const schema = `
      CREATE TABLE IF NOT EXISTS academic_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'inactive'
      );

      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        enrollment_no TEXT UNIQUE NOT NULL,
        course TEXT CHECK(course IN ('B.Sc. Nursing', 'GNM', 'Post Basic B.Sc.', 'M.Sc. Nursing')) NOT NULL,
        division TEXT NOT NULL,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        mobile TEXT NOT NULL CHECK(length(mobile) == 10),
        status TEXT CHECK(status IN ('Active', 'On Hold', 'Graduated')) DEFAULT 'Active'
      );

      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        accession_no TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        edition TEXT NOT NULL,
        publisher TEXT NOT NULL,
        publishing_year INTEGER NOT NULL,
        isbn TEXT,
        specialty TEXT NOT NULL,
        rack_no TEXT NOT NULL,
        shelf_no TEXT NOT NULL,
        status TEXT CHECK(status IN ('Available', 'Issued', 'Under Maintenance/Binding')) DEFAULT 'Available',
        pages INTEGER DEFAULT 0,
        volume TEXT DEFAULT '',
        cost REAL DEFAULT 0.0,
        bill_no TEXT DEFAULT '',
        entry_date TEXT DEFAULT '',
        call_no TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        return_date TEXT,
        renewal_count INTEGER DEFAULT 0,
        fine_amount REAL DEFAULT 0.0,
        fine_status TEXT CHECK(fine_status IN ('None', 'Pending', 'Paid', 'Waived')) DEFAULT 'None',
        fine_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS journals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        issn TEXT NOT NULL,
        publisher TEXT NOT NULL,
        frequency TEXT CHECK(frequency IN ('Monthly', 'Bi-monthly', 'Quarterly')) NOT NULL,
        volume_issue TEXT NOT NULL,
        subscription_period TEXT NOT NULL,
        rack_no TEXT NOT NULL,
        shelf_no TEXT NOT NULL,
        status TEXT CHECK(status IN ('Available', 'Not Available')) DEFAULT 'Available'
      );
    `;

    await exec(schema);

    const columnsToMigrate = [
      { name: 'pages', type: 'INTEGER DEFAULT 0' },
      { name: 'volume', type: 'TEXT DEFAULT \'\'' },
      { name: 'cost', type: 'REAL DEFAULT 0.0' },
      { name: 'bill_no', type: 'TEXT DEFAULT \'\'' },
      { name: 'entry_date', type: 'TEXT DEFAULT \'\'' },
      { name: 'call_no', type: 'TEXT DEFAULT \'\'' }
    ];

    for (const col of columnsToMigrate) {
      try {
        await run(`ALTER TABLE books ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) {
        if (!err.message.includes('duplicate column name')) {
          console.error(`Migration error for ${col.name}:`, err.message);
        }
      }
    }
  };
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  initSchema,
  isPostgres
};
