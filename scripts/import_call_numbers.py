import os
import shutil
import sqlite3
from datetime import datetime
import pandas as pd

def import_call_numbers():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'library.db')
    excel_path = 'C:/Users/pintu/Downloads/Copy of accession-register_2026-09-09.xlsx'
    
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        return False
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found at {excel_path}")
        return False

    # 1. Create a safe backup
    backup_dir = os.path.join(os.path.dirname(__file__), '..', 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    backup_path = os.path.join(backup_dir, f'library_backup_pre_callno_{timestamp}.db')
    shutil.copy2(db_path, backup_path)
    print(f"[1/4] Safe backup created: {backup_path}")

    # 2. Ensure call_no column exists
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(books)")
    cols = [r[1] for r in cursor.fetchall()]
    if 'call_no' not in cols:
        cursor.execute("ALTER TABLE books ADD COLUMN call_no TEXT DEFAULT ''")
        conn.commit()
        print("[2/4] Added 'call_no' column to 'books' table.")
    else:
        print("[2/4] 'call_no' column already exists in 'books' table.")

    # 3. Read Excel file
    df = pd.read_excel(excel_path)
    print(f"[3/4] Loaded Excel file with {len(df)} rows.")

    def norm_acc(x):
        s = str(x).strip()
        if s.isdigit():
            return str(int(s))
        return s.lower()

    # Load existing books from DB
    cursor.execute("SELECT id, accession_no FROM books")
    db_books = cursor.fetchall()
    # Map normalized accession to book id
    acc_to_id = {}
    for book_id, acc in db_books:
        acc_to_id[norm_acc(acc)] = book_id

    # 4. Update call numbers
    updates = []
    skipped = 0
    for idx, row in df.iterrows():
        raw_acc = row.get('accession_no')
        call_no = str(row.get('Call No', '')).strip()
        if pd.isna(row.get('Call No')) or call_no == 'nan':
            call_no = ''
        
        n_acc = norm_acc(raw_acc)
        book_id = acc_to_id.get(n_acc)
        if book_id:
            updates.append((call_no, book_id))
        else:
            skipped += 1

    cursor.executemany("UPDATE books SET call_no = ? WHERE id = ?", updates)
    conn.commit()

    # Verification
    cursor.execute("SELECT COUNT(*) FROM books WHERE call_no IS NOT NULL AND call_no != ''")
    filled_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM books")
    total_count = cursor.fetchone()[0]

    print(f"[4/4] Successfully updated {len(updates)} books.")
    print(f"      Total books in DB: {total_count}")
    print(f"      Books with non-empty Call No: {filled_count}")
    if skipped > 0:
        print(f"      Warning: {skipped} rows could not be matched.")

    # Sample check
    cursor.execute("SELECT accession_no, title, call_no FROM books WHERE call_no != '' LIMIT 5")
    sample = cursor.fetchall()
    print("\nSample updated books:")
    for acc, title, cno in sample:
        print(f" - Acc [{acc}]: Call No [{cno}] | Title: {title[:40]}")

    conn.close()
    return True

if __name__ == '__main__':
    import_call_numbers()
