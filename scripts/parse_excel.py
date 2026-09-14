import sys
import os
import json
import pandas as pd

def parse_excel(file_path):
    if not os.path.exists(file_path):
        return json.dumps({"error": f"File not found: {file_path}"})
    
    try:
        # Load excel file
        df = pd.read_excel(file_path)
        
        # Lowercase columns to ease mapping
        cols = [str(c).lower().strip() for c in df.columns]
        
        # Find key columns using fuzzy mapping
        acc_idx = next((i for i, c in enumerate(cols) if 'accession' in c or 'acc' in c or 'sr' in c), -1)
        title_idx = next((i for i, c in enumerate(cols) if 'title' in c or 'book' in c or 'name' in c), -1)
        author_idx = next((i for i, c in enumerate(cols) if 'author' in c or 'writer' in c), -1)
        edition_idx = next((i for i, c in enumerate(cols) if 'edition' in c or 'edit' in c), -1)
        publisher_idx = next((i for i, c in enumerate(cols) if 'publisher' in c or 'publish' in c or 'place' in c), -1)
        year_idx = next((i for i, c in enumerate(cols) if 'year' in c or 'date' in c), -1)
        pages_idx = next((i for i, c in enumerate(cols) if 'page' in c or 'pg' in c), -1)
        cost_idx = next((i for i, c in enumerate(cols) if 'cost' in c or 'price' in c or 'inr' in c or 'rs' in c), -1)
        isbn_idx = next((i for i, c in enumerate(cols) if 'isbn' in c), -1)
        specialty_idx = next((i for i, c in enumerate(cols) if 'specialty' in c or 'category' in c or 'spec' in c), -1)
        rack_idx = next((i for i, c in enumerate(cols) if 'rack' in c), -1)
        shelf_idx = next((i for i, c in enumerate(cols) if 'shelf' in c), -1)
        qty_idx = next((i for i, c in enumerate(cols) if 'qty' in c or 'quantity' in c or 'count' in c), -1)
        call_idx = next((i for i, c in enumerate(cols) if 'call' in c), -1)

        books = []
        for index, row in df.iterrows():
            # Get values safely
            raw_acc = str(row.iloc[acc_idx]).strip() if acc_idx != -1 else ""
            raw_title = str(row.iloc[title_idx]).strip() if title_idx != -1 else ""
            raw_author = str(row.iloc[author_idx]).strip() if author_idx != -1 else ""
            
            # Skip empty rows
            if not raw_title or pd.isna(row.iloc[title_idx]):
                continue
                
            # Formatting edition
            raw_edition = str(row.iloc[edition_idx]).strip() if edition_idx != -1 else "1st Edition"
            if raw_edition and raw_edition.isdigit():
                # Format single number edition, e.g. "01" or "1" -> "1st Edition"
                ed_num = int(raw_edition)
                suffix = "th"
                if ed_num == 1: suffix = "st"
                elif ed_num == 2: suffix = "nd"
                elif ed_num == 3: suffix = "rd"
                raw_edition = f"{ed_num}{suffix} Edition"
            elif not raw_edition or raw_edition == 'nan':
                raw_edition = "1st Edition"

            # Parse numeric fields safely
            try:
                raw_year = int(float(row.iloc[year_idx])) if year_idx != -1 and not pd.isna(row.iloc[year_idx]) else 2020
            except:
                raw_year = 2020
                
            try:
                raw_pages = int(float(row.iloc[pages_idx])) if pages_idx != -1 and not pd.isna(row.iloc[pages_idx]) else 0
            except:
                raw_pages = 0
                
            try:
                raw_cost = float(row.iloc[cost_idx]) if cost_idx != -1 and not pd.isna(row.iloc[cost_idx]) else 0.0
            except:
                raw_cost = 0.0

            book = {
                "accession_no": raw_acc if raw_acc != "nan" else "",
                "title": raw_title,
                "authors": raw_author if raw_author != "nan" else "Unknown Author",
                "edition": raw_edition,
                "publisher": str(row.iloc[publisher_idx]).strip() if publisher_idx != -1 and not pd.isna(row.iloc[publisher_idx]) else "Unknown Publisher",
                "publishing_year": raw_year,
                "isbn": str(row.iloc[isbn_idx]).strip() if isbn_idx != -1 and not pd.isna(row.iloc[isbn_idx]) else "",
                "specialty": str(row.iloc[specialty_idx]).strip() if specialty_idx != -1 and not pd.isna(row.iloc[specialty_idx]) else "General Nursing",
                "rack_no": str(row.iloc[rack_idx]).strip() if rack_idx != -1 and not pd.isna(row.iloc[rack_idx]) else "Rack 1",
                "shelf_no": str(row.iloc[shelf_idx]).strip() if shelf_idx != -1 and not pd.isna(row.iloc[shelf_idx]) else "Shelf A",
                "status": "Available",
                "qty": int(float(row.iloc[qty_idx])) if qty_idx != -1 and not pd.isna(row.iloc[qty_idx]) else 1,
                "pages": raw_pages,
                "volume": "",
                "cost": raw_cost,
                "bill_no": "",
                "entry_date": "",
                "call_no": str(row.iloc[call_idx]).strip() if call_idx != -1 and not pd.isna(row.iloc[call_idx]) else ""
            }
            # Clean "nan" values
            for k, v in book.items():
                if v == "nan":
                    book[k] = ""
                    
            books.append(book)
            
        return json.dumps({"success": True, "books": books})
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided."}))
        sys.exit(1)
        
    file_to_parse = sys.argv[1]
    result = parse_excel(file_to_parse)
    print(result)
