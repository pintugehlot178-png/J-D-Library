import sys
import os
import json
import pandas as pd
from bs4 import BeautifulSoup

def parse_students_file(file_path):
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}
    
    try:
        # Check if it is XML Spreadsheet 2003
        is_xml = False
        with open(file_path, 'rb') as f:
            head = f.read(100)
            if b'<?xml' in head or b'<Workbook' in head:
                is_xml = True
                
        students = []
        
        if is_xml:
            # Parse XML format
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            soup = BeautifulSoup(content, 'xml')
            table = soup.find('Table')
            if not table:
                return {"success": False, "error": "No table found in XML sheet."}
            
            rows = table.find_all('Row')
            if not rows:
                return {"success": False, "error": "No rows found in XML sheet."}
                
            # Extract headers from first row
            headers = [cell.get_text().strip().lower() for cell in rows[0].find_all('Cell')]
            
            # Find indexes using fuzzy match
            name_idx = next((i for i, h in enumerate(headers) if 'name' in h or 'student' in h), -1)
            code_idx = next((i for i, h in enumerate(headers) if 'code' in h or 'enroll' in h or 'id' in h or 'roll' in h), -1)
            course_idx = next((i for i, h in enumerate(headers) if 'course' in h or 'class' in h or 'degree' in h), -1)
            division_idx = next((i for i, h in enumerate(headers) if 'division' in h or 'div' in h or 'section' in h or 'batch' in h), -1)
            mobile_idx = next((i for i, h in enumerate(headers) if 'contact' in h or 'mobile' in h or 'phone' in h or 'number' in h or 'tel' in h or 'no' in h), -1)
            
            for index, r in enumerate(rows[1:]):
                cells = [cell.get_text().strip() for cell in r.find_all('Cell')]
                if len(cells) == 0:
                    continue
                
                raw_name = cells[name_idx] if name_idx != -1 and name_idx < len(cells) else ""
                if not raw_name or raw_name == 'nan' or raw_name == "":
                    continue
                    
                raw_code = cells[code_idx] if code_idx != -1 and code_idx < len(cells) else ""
                raw_course = cells[course_idx] if course_idx != -1 and course_idx < len(cells) else "General"
                raw_division = cells[division_idx] if division_idx != -1 and division_idx < len(cells) else "Default"
                raw_mobile = cells[mobile_idx] if mobile_idx != -1 and mobile_idx < len(cells) else ""
                
                if raw_mobile.endswith('.0'):
                    raw_mobile = raw_mobile[:-2]
                if raw_mobile == 'nan':
                    raw_mobile = ""
                    
                students.append({
                    "name": raw_name,
                    "enrollment_no": raw_code,
                    "course": raw_course,
                    "division": raw_division,
                    "mobile": raw_mobile
                })
        else:
            # Parse standard xlsx / xls using pandas
            # Check engine based on file extension
            ext = os.path.splitext(file_path)[1].lower()
            engine = 'xlrd' if ext == '.xls' else None
            df = pd.read_excel(file_path, engine=engine)
            
            cols = [str(c).lower().strip() for c in df.columns]
            name_idx = next((i for i, c in enumerate(cols) if 'name' in c or 'student' in c), -1)
            code_idx = next((i for i, c in enumerate(cols) if 'code' in c or 'enroll' in c or 'id' in c or 'roll' in c), -1)
            course_idx = next((i for i, c in enumerate(cols) if 'course' in c or 'class' in c or 'degree' in c), -1)
            division_idx = next((i for i, c in enumerate(cols) if 'division' in c or 'div' in c or 'section' in c or 'batch' in c), -1)
            mobile_idx = next((i for i, c in enumerate(cols) if 'contact' in c or 'mobile' in c or 'phone' in c or 'number' in c or 'tel' in c or 'no' in c), -1)
            
            for index, row in df.iterrows():
                raw_name = str(row.iloc[name_idx]).strip() if name_idx != -1 else ""
                if not raw_name or pd.isna(row.iloc[name_idx]) or raw_name == 'nan' or raw_name == "":
                    continue
                    
                raw_code = str(row.iloc[code_idx]).strip() if code_idx != -1 else ""
                raw_course = str(row.iloc[course_idx]).strip() if course_idx != -1 else "General"
                raw_division = str(row.iloc[division_idx]).strip() if division_idx != -1 and not pd.isna(row.iloc[division_idx]) else "Default"
                raw_mobile = str(row.iloc[mobile_idx]).strip() if mobile_idx != -1 and not pd.isna(row.iloc[mobile_idx]) else ""
                
                if raw_mobile.endswith('.0'):
                    raw_mobile = raw_mobile[:-2]
                if raw_mobile == 'nan':
                    raw_mobile = ""
                    
                students.append({
                    "name": raw_name,
                    "enrollment_no": raw_code if raw_code != "nan" else "",
                    "course": raw_course if raw_course != "nan" else "General",
                    "division": raw_division if raw_division != "nan" else "Default",
                    "mobile": raw_mobile
                })
                
        return {"success": True, "students": students}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided."}))
        sys.exit(1)
        
    file_to_parse = sys.argv[1]
    result = parse_students_file(file_to_parse)
    print(json.dumps(result))
