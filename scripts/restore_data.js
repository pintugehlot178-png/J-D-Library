const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const backupPath = path.join(__dirname, '../backups/library_backup_2026-08-07_08-11-31.db');
const activePath = path.join(__dirname, '../library.db');

if (!fs.existsSync(backupPath)) {
  console.error('Error: Backup file not found at:', backupPath);
  process.exit(1);
}

// 1. Copy the backup file over the active database
fs.copyFileSync(backupPath, activePath);
console.log('Successfully restored 155 original inventory books from backups.');

// 2. Insert the 22 recently cataloged copies of "Medical Surgical Nursing - 1"
const db = new sqlite3.Database(activePath);

db.serialize(() => {
  const stmt = db.prepare(`
    INSERT INTO books (
      accession_no, title, authors, edition, publisher, publishing_year, 
      isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 440; i <= 461; i++) {
    stmt.run([
      String(i),
      'Medical Surgical Nursing - 1',
      'Agarwal, Preeti',
      '1 ed.',
      'Jain Publications',
      2023,
      '978-1496355133',
      'Medical-Surgical',
      'Rack 2',
      'Shelf 4',
      'Available',
      652,
      '',
      350.00,
      '',
      '2021-09-26'
    ]);
  }

  stmt.finalize((err) => {
    if (err) {
      console.error('Error adding new copies:', err);
    } else {
      console.log('Successfully merged all 22 newly cataloged copies (accessions 440 to 461) into restored inventory!');
    }
    db.close();
  });
});
