import os
import json
from datetime import datetime, date
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

DB_FILE = "lifeos_records.json"

def get_db():
    if not os.path.exists(DB_FILE):
        data = {"daily_records": {}, "vault_items": []}
        save_db(data)
        return data
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {"daily_records": {}, "vault_items": []}

def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

class LifeOSHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="frontend", **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/sync":
            today_str = date.today().isoformat()
            db = get_db()
            today_data = db["daily_records"].get(today_str, None)
            self.send_json_response(200, {"today": today_data, "vault": db["vault_items"]})
        elif parsed.path == "/api/monthly-audit":
            self.handle_monthly_audit()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(length).decode('utf-8', errors='ignore')
            payload = json.loads(raw_body) if raw_body else {}
        except Exception as e:
            self.send_json_response(400, {"error": "Invalid JSON", "details": str(e)})
            return

        if parsed.path == "/api/save-day":
            today_str = payload.get("entry_date", date.today().isoformat())
            db = get_db()
            if today_str not in db["daily_records"]:
                db["daily_records"][today_str] = {}
            # Merge payload
            db["daily_records"][today_str].update(payload)
            db["daily_records"][today_str]["updated_at"] = datetime.now().isoformat()
            save_db(db)
            self.send_json_response(200, {"status": "saved", "date": today_str})

        elif parsed.path == "/api/save-vault":
            db = get_db()
            payload["id"] = int(datetime.now().timestamp() * 1000)
            payload["created_at"] = datetime.now().isoformat()
            db["vault_items"].insert(0, payload)
            save_db(db)
            self.send_json_response(200, {"status": "vault_saved"})
        else:
            self.send_error(404, "Not Found")

    def handle_monthly_audit(self):
        db = get_db()
        records = list(db["daily_records"].values())
        total_days = len(records)
        
        if total_days == 0:
            analysis = "Innum daily food / water logs enter aagala bro."
        else:
            water_missed = sum(1 for r in records if float(r.get('water_litres', 0.0) or 0.0) < 3.0)
            walk_missed = sum(1 for r in records if float(r.get('gps_distance_km', 0.0) or 0.0) < 2.0 and int(r.get('steps', 0) or 0) < 5000)
            
            junk_words = ['puff', 'samosa', 'tea', 'sweet', 'sugar', 'biscuit', 'cake', 'briyani', 'parotta', 'oil']
            junk_days = 0
            for r in records:
                snack_str = (r.get('slotMeals', {}).get('snack', '') or '').lower()
                dinner_str = (r.get('slotMeals', {}).get('dinner', '') or '').lower()
                if any(w in snack_str or w in dinner_str for w in junk_words):
                    junk_days += 1

            analysis = f"""📊 MONTH-END ROOT CAUSE DIAGNOSIS (Total Tracked: {total_days} Days)
-----------------------------------------------------------
1. 💧 Water Under-hydration: {water_missed}/{total_days} Days (< 3.0L). 
2. 🚶 Low Physical Movement: {walk_missed}/{total_days} Days (< 5K steps / 2km).
3. ☕ 4 PM Snack Traps: {junk_days} Days detected.
-----------------------------------------------------------
🎯 MONTHLY VERDICT & FIX:
Evening 4 PM boiled sundal + daily 4L water lock pannunga to drop next 4kg!"""

        self.send_json_response(200, {"days": total_days, "analysis": analysis})

    def send_json_response(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 3000), LifeOSHandler)
    print("Serving LifeOS JSON DB Engine on http://0.0.0.0:3000")
    server.serve_forever()
