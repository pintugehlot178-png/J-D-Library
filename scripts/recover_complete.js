const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function readVarint(buffer, offset) {
  let val = 0;
  let len = 0;
  for (let i = 0; i < 9; i++) {
    if (offset + i >= buffer.length) break;
    const byte = buffer[offset + i];
    len++;
    if (i === 8) {
      val = (val << 8) | byte;
      break;
    }
    val = (val << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { value: val, length: len };
}

function recoverFromDbFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('File not found: ' + filePath);
    return [];
  }
  const buf = fs.readFileSync(filePath);
  const books = [];
  const seenAccessions = new Set();

  for (let offset = 0; offset < buf.length - 50; offset++) {
    const hdrSizeVar = readVarint(buf, offset);
    const hdrSize = hdrSizeVar.value;
    if (hdrSize < 10 || hdrSize > 120) continue;
    
    let currOffset = offset + hdrSizeVar.length;
    const types = [];
    let parseError = false;
    
    while (currOffset < offset + hdrSize) {
      if (currOffset >= buf.length) {
        parseError = true;
        break;
      }
      const typeVar = readVarint(buf, currOffset);
      types.push(typeVar.value);
      currOffset += typeVar.length;
    }
    if (parseError) continue;
    
    if (types.length !== 12 && types.length !== 17) continue;
    
    let valid = true;
    const textCols12 = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
    const numCols12 = [6];
    const textCols17 = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 15, 16];
    const numCols17 = [6, 12, 14];
    
    const textCols = types.length === 12 ? textCols12 : textCols17;
    const numCols = types.length === 12 ? numCols12 : numCols17;
    
    for (const idx of textCols) {
      if (idx >= types.length) continue;
      const t = types[idx];
      if (t !== 0 && (t < 13 || t % 2 === 0)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    
    for (const idx of numCols) {
      if (idx >= types.length) continue;
      const t = types[idx];
      if (t > 9) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    
    let valOffset = offset + hdrSize;
    const record = [];
    
    try {
      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        let val = null;
        if (type === 0) {
          val = null;
        } else if (type === 1) {
          val = buf.readInt8(valOffset);
          valOffset += 1;
        } else if (type === 2) {
          val = buf.readInt16BE(valOffset);
          valOffset += 2;
        } else if (type === 3) {
          val = (buf.readInt8(valOffset) << 16) | buf.readUInt16BE(valOffset + 1);
          valOffset += 3;
        } else if (type === 4) {
          val = buf.readInt32BE(valOffset);
          valOffset += 4;
        } else if (type === 5) {
          const hi = buf.readInt16BE(valOffset);
          const lo = buf.readUInt32BE(valOffset + 2);
          val = hi * 4294967296 + lo;
          valOffset += 6;
        } else if (type === 6) {
          val = Number(buf.readBigInt64BE(valOffset));
          valOffset += 8;
        } else if (type === 7) {
          val = buf.readDoubleBE(valOffset);
          valOffset += 8;
        } else if (type === 8) {
          val = 0;
        } else if (type === 9) {
          val = 1;
        } else if (type >= 12 && type % 2 === 0) {
          const len = (type - 12) / 2;
          val = buf.slice(valOffset, valOffset + len);
          valOffset += len;
        } else if (type >= 13 && type % 2 !== 0) {
          const len = (type - 13) / 2;
          val = buf.toString('utf8', valOffset, valOffset + len);
          valOffset += len;
        }
        record.push(val);
      }
      
      const acc = record[1];
      if (acc && typeof acc === 'string' && acc.trim() !== '' && !seenAccessions.has(acc.trim()) && acc.trim().length <= 20) {
        seenAccessions.add(acc.trim());
        
        let rawStatus = record[11] ? record[11].trim() : 'Available';
        if (!['Available', 'Issued', 'Under Maintenance/Binding'].includes(rawStatus)) {
          rawStatus = 'Available';
        }
        
        const formatted = {
          accession_no: acc.trim(),
          title: record[2] ? record[2].trim() : '',
          authors: record[3] ? record[3].trim() : '',
          edition: record[4] ? record[4].trim() : '',
          publisher: record[5] ? record[5].trim() : '',
          publishing_year: record[6] || 2020,
          isbn: record[7] ? record[7].trim() : '',
          specialty: record[8] ? record[8].trim() : 'General',
          rack_no: record[9] ? record[9].trim() : 'Rack A',
          shelf_no: record[10] ? record[10].trim() : 'Shelf A',
          status: rawStatus,
          pages: types.length === 17 ? record[12] : 0,
          volume: types.length === 17 ? (record[13] || '') : '',
          cost: types.length === 17 ? (record[14] || 0.0) : 0.0,
          bill_no: types.length === 17 ? (record[15] || '') : '',
          entry_date: types.length === 17 ? (record[16] || '') : ''
        };
        
        books.push(formatted);
      }
    } catch (e) {}
  }
  return books;
}

const db1Path = path.join(__dirname, '../backups/library_backup_2026-08-07_10-34-59.db');
const db2Path = path.join(__dirname, '../backups/library_backup_2026-08-08_08-14-13.db');

console.log('Recovering from db1 (yesterday post-delete)...');
const books1 = recoverFromDbFile(db1Path);
console.log('Recovered ' + books1.length + ' books from db1.');

console.log('Recovering from db2 (today pre-restore)...');
const books2 = recoverFromDbFile(db2Path);
console.log('Recovered ' + books2.length + ' books from db2.');

// Merge datasets
const mergedMap = new Map();
books1.forEach(b => mergedMap.set(b.accession_no, b));
books2.forEach(b => mergedMap.set(b.accession_no, b));

const allBooks = Array.from(mergedMap.values());
console.log('Merged total book count: ' + allBooks.length);

allBooks.sort((a, b) => {
  const numA = parseInt(a.accession_no, 10);
  const numB = parseInt(b.accession_no, 10);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  return a.accession_no.localeCompare(b.accession_no);
});

console.log('Recovered accession range: ' + allBooks[0].accession_no + ' to ' + allBooks[allBooks.length - 1].accession_no);

const activePath = path.join(__dirname, '../library.db');
const db = new sqlite3.Database(activePath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = OFF;');
  db.run('DELETE FROM books;');
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO books (
      accession_no, title, authors, edition, publisher, publishing_year, 
      isbn, specialty, rack_no, shelf_no, status, pages, volume, cost, bill_no, entry_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  allBooks.forEach(b => {
    stmt.run([
      b.accession_no,
      b.title,
      b.authors,
      b.edition,
      b.publisher,
      b.publishing_year,
      b.isbn,
      b.specialty,
      b.rack_no,
      b.shelf_no,
      b.status,
      b.pages,
      b.volume,
      b.cost,
      b.bill_no,
      b.entry_date
    ]);
  });
  
  stmt.finalize((err) => {
    if (err) {
      console.error('Error writing recovered books to library.db:', err);
    } else {
      console.log('Successfully recovered and merged ' + allBooks.length + ' books back into library.db!');
    }
    db.run('PRAGMA foreign_keys = ON;');
    db.close();
  });
});
