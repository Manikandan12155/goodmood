import os
import json
import sqlite3
from datetime import datetime, date
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Clash of Life - Real Life RPG System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "clash_of_life.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # User Profile / Base State
    c.execute("""
    CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY,
        town_hall_level INTEGER DEFAULT 1,
        builder_count INTEGER DEFAULT 2,
        active_builders INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        gold INTEGER DEFAULT 150,
        elixir INTEGER DEFAULT 100,
        gems INTEGER DEFAULT 25,
        current_weight REAL DEFAULT 95.0,
        target_weight REAL DEFAULT 73.0,
        current_streak INTEGER DEFAULT 1,
        mental_hp INTEGER DEFAULT 85,
        stamina INTEGER DEFAULT 75
    )
    """)
    
    # Buildings / Stats to Upgrade
    c.execute("""
    CREATE TABLE IF NOT EXISTS buildings (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        level INTEGER,
        max_level INTEGER,
        icon TEXT,
        description TEXT,
        upgrade_cost_gold INTEGER,
        upgrade_cost_elixir INTEGER,
        upgrade_time_minutes INTEGER,
        status TEXT DEFAULT 'idle',
        upgrade_finish_time TEXT
    )
    """)

    # Daily Quests / Directives
    c.execute("""
    CREATE TABLE IF NOT EXISTS quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT,
        xp_reward INTEGER,
        gold_reward INTEGER,
        elixir_reward INTEGER,
        completed INTEGER DEFAULT 0,
        date_assigned TEXT,
        instruction TEXT,
        builder_action TEXT
    )
    """)

    # Coach Chat Log
    c.execute("""
    CREATE TABLE IF NOT EXISTS chat_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        message TEXT,
        timestamp TEXT
    )
    """)

    # Default profile check
    c.execute("SELECT COUNT(*) FROM profile")
    if c.fetchone()[0] == 0:
        c.execute("""
        INSERT INTO profile (id, town_hall_level, builder_count, active_builders, xp, gold, elixir, gems, current_weight, target_weight, current_streak, mental_hp, stamina)
        VALUES (1, 1, 2, 0, 50, 200, 150, 50, 95.0, 73.0, 1, 80, 70)
        """)

    # Default buildings
    default_buildings = [
        ("th", "Town Hall (Your Mind & Body Core)", "Core", 1, 10, "🏰", "Overall biological & mental baseline. Current TH1 (95kg) -> Target TH10 (73kg lean)", 500, 500, 1440, "idle", None),
        ("stamina_camp", "Army Camp (Endurance & Steps)", "Activity", 1, 10, "⛺", "Daily 8K-10K steps & cardiorespiratory capacity. Level up by hitting step streak.", 100, 50, 60, "idle", None),
        ("muscle_barracks", "Barracks (Muscle & Strength)", "Workout", 1, 10, "⚔️", "Home / Gym strength training. Prevents loose skin and burns resting calories.", 120, 80, 120, "idle", None),
        ("nutrition_storage", "Elixir Storage (Nutrition Discipline)", "Diet", 1, 10, "🧪", "Portion control, clean whole foods, zero liquid sugars.", 150, 100, 90, "idle", None),
        ("water_well", "Elixir Collector (Hydration Engine)", "Habit", 1, 10, "💧", "Daily 3.5 Litres hydration tracker. Cleanses water retention.", 80, 40, 30, "idle", None),
        ("sleep_forge", "Gold Mine (Recovery & Mental HP)", "Recovery", 1, 10, "🛡️", "7.5 hrs uninterrupted deep sleep and stress shield.", 90, 60, 45, "idle", None)
    ]
    for b in default_buildings:
        c.execute("INSERT OR IGNORE INTO buildings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", b)

    # Seed daily quests if empty
    today_str = date.today().isoformat()
    c.execute("SELECT COUNT(*) FROM quests WHERE date_assigned = ?", (today_str,))
    if c.fetchone()[0] == 0:
        today_quests = [
            ("Morning Hydration Protocol (500ml warm water)", "Habit", 20, 50, 30, 0, today_str, "Elunthona 500ml thanni kudinga bro. Metabolism boot aagum.", "Upgrade Elixir Collector"),
            ("8,000 Daily Step March (Fat Burn Deficit)", "Activity", 50, 100, 60, 0, today_str, "Morning or evening walk la continuous ah 8000 steps achieve pannunga.", "Army Camp Expedition"),
            ("Plate Method Lunch (50% Veggies + 25% Protein)", "Diet", 40, 80, 50, 0, today_str, "Half plate salad/keerai, Quarter boiled egg/chicken/sundal, Quarter rice mattum.", "Elixir Storage Defense"),
            ("4 PM Craving Shield (Tea sugar cut + Sundal)", "Mindset", 30, 60, 40, 0, today_str, "Bakery snacks avoid panni boiled egg or sundal + black coffee edukunga.", "Castle Defense Guard"),
            ("20-Min Home Strength Circuit (Squats + Pushups)", "Workout", 45, 90, 70, 0, today_str, "Gym poga mudiyalana 3 sets squats (15) + pushups (10) finish pannunga.", "Barracks Training"),
            ("Night Mental HP Decompress (No phone 30m before sleep)", "Recovery", 25, 40, 30, 0, today_str, "Thoongurathukku 30 min munnadi screen off. 7.5 hrs sleep lock pannunga.", "Gold Mine Extraction")
        ]
        for q in today_quests:
            c.execute("""
            INSERT INTO quests (title, category, xp_reward, gold_reward, elixir_reward, completed, date_assigned, instruction, builder_action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, q)

    conn.commit()
    conn.close()

init_db()

class QuestUpdate(BaseModel):
    quest_id: int

class ChatMessage(BaseModel):
    message: str

class WeightUpdate(BaseModel):
    weight: float

class BuildingUpgrade(BaseModel):
    building_id: str

@app.get("/api/state")
def get_state():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    c.execute("SELECT * FROM profile WHERE id = 1")
    profile = dict(c.fetchone())

    c.execute("SELECT * FROM buildings")
    buildings = [dict(r) for r in c.fetchall()]

    today_str = date.today().isoformat()
    c.execute("SELECT * FROM quests WHERE date_assigned = ?", (today_str,))
    quests = [dict(r) for r in c.fetchall()]

    c.execute("SELECT * FROM chat_log ORDER BY id DESC LIMIT 20")
    messages = [dict(r) for r in c.fetchall()]
    messages.reverse()

    conn.close()
    return {
        "profile": profile,
        "buildings": buildings,
        "quests": quests,
        "chat_log": messages
    }

@app.post("/api/quest/complete")
def complete_quest(data: QuestUpdate):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM quests WHERE id = ?", (data.quest_id,))
    q = c.fetchone()
    if not q:
        conn.close()
        raise HTTPException(status_code=404, detail="Quest not found")
    
    if q[6] == 1:
        conn.close()
        return {"status": "already_completed"}

    xp = q[3]
    gold = q[4]
    elixir = q[5]

    c.execute("UPDATE quests SET completed = 1 WHERE id = ?", (data.quest_id,))
    c.execute("""
    UPDATE profile SET 
        xp = xp + ?, 
        gold = gold + ?, 
        elixir = elixir + ?, 
        mental_hp = MIN(100, mental_hp + 5),
        stamina = MIN(100, stamina + 4)
    WHERE id = 1
    """, (xp, gold, elixir))

    # Add AI Coach celebratory Tanglish message
    coach_text = f"🔥 Semma bro! '{q[1]}' mudichuteenga. +{gold} Gold, +{elixir} Elixir, +{xp} XP added! Builder unga base-ah upgrade panna ready aayitaaru."
    now_ts = datetime.now().strftime("%I:%M %p")
    c.execute("INSERT INTO chat_log (sender, message, timestamp) VALUES (?, ?, ?)", ("AI Coach", coach_text, now_ts))

    conn.commit()
    conn.close()
    return {"status": "success", "gold": gold, "elixir": elixir, "xp": xp}

@app.post("/api/building/upgrade")
def upgrade_building(data: BuildingUpgrade):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM buildings WHERE id = ?", (data.building_id,))
    b = c.fetchone()
    c.execute("SELECT * FROM profile WHERE id = 1")
    p = c.fetchone()

    if not b or not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Building or profile not found")

    gold_cost = b[7]
    elixir_cost = b[8]
    user_gold = p[5]
    user_elixir = p[6]

    if user_gold < gold_cost or user_elixir < elixir_cost:
        conn.close()
        raise HTTPException(status_code=400, detail="Insufficient Gold/Elixir! Daily quests mudichu resources farm pannunga bro.")

    new_level = b[3] + 1
    c.execute("""
    UPDATE profile SET 
        gold = gold - ?, 
        elixir = elixir - ?,
        xp = xp + 100
    WHERE id = 1
    """, (gold_cost, elixir_cost))

    c.execute("""
    UPDATE buildings SET 
        level = ?,
        upgrade_cost_gold = upgrade_cost_gold * 2,
        upgrade_cost_elixir = upgrade_cost_elixir * 2
    WHERE id = ?
    """, (new_level, data.building_id))

    now_ts = datetime.now().strftime("%I:%M %p")
    coach_text = f"🏰 LEVEL UP! {b[1]} level {new_level}-ku upgrade aagiruchu bro! Ungaloda real body & mental power increase aaguthu!"
    c.execute("INSERT INTO chat_log (sender, message, timestamp) VALUES (?, ?, ?)", ("AI Coach", coach_text, now_ts))

    conn.commit()
    conn.close()
    return {"status": "upgraded", "new_level": new_level}

@app.post("/api/profile/weight")
def update_weight(data: WeightUpdate):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT current_weight FROM profile WHERE id = 1")
    old_w = c.fetchone()[0]
    diff = round(old_w - data.weight, 2)
    
    c.execute("UPDATE profile SET current_weight = ? WHERE id = 1", (data.weight,))

    now_ts = datetime.now().strftime("%I:%M %p")
    if diff > 0:
        coach_text = f"⚖️ MASSIVE WIN BRO! Weight {old_w}kg la irundhu {data.weight}kg aairukku (-{diff}kg)! Unga Town Hall defense super strong!"
    elif diff < 0:
        coach_text = f"⚖️ Weight {data.weight}kg log aairukku (+{abs(diff)}kg). Don't panic bro, water retention or digestion variation thaan. Innaiku 3.5L water & 10K steps focus pannuvom!"
    else:
        coach_text = f"⚖️ Weight {data.weight}kg maintain aaguthu. Plateaus are normal, consistency thaan key!"

    c.execute("INSERT INTO chat_log (sender, message, timestamp) VALUES (?, ?, ?)", ("AI Coach", coach_text, now_ts))
    conn.commit()
    conn.close()
    return {"status": "success", "new_weight": data.weight}

@app.post("/api/chat")
def post_chat(data: ChatMessage):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now_ts = datetime.now().strftime("%I:%M %p")
    c.execute("INSERT INTO chat_log (sender, message, timestamp) VALUES (?, ?, ?)", ("User", data.message, now_ts))

    # Real-time intelligent coach logic with Tanglish persona
    msg = data.message.lower()
    if "gym" in msg or "workout" in msg:
        reply = "Bro, gym poga mudiyala na kooda guilt aagathinga! Daily 8,000 steps + 3 sets squats & knee pushups potu mudicha podhum, innaiku barracks upgraded!"
    elif "eat" in msg or "food" in msg or "saap" in msg or "briyani" in msg or "hungry" in msg:
        reply = "Food vishayathula Plate Method use pannunga bro: 50% kai-kari/salad, 25% protein (boiled eggs/chicken/sundal), 25% mattum rice. Liquid juice, cool drinks strictly zero!"
    elif "sad" in msg or "worst" in msg or "depress" in msg or "tired" in msg or "kundu" in msg or "stress" in msg:
        reply = "Bro, naan unga kooda irukken. Last 5 years nadanthathu mudinjupochu. Innaiku namma day 1. Unga body oru Town Hall maari — daily chinna chinna upgrade panna, automatic-ah 73kg mass avatar varum. One day at a time, kalakkidalam!"
    elif "next" in msg or "enna pannanum" in msg or "builder" in msg or "task" in msg:
        reply = "Ippo unga builder ku command: 1) 500ml water kudinga, 2) Innaiku 8K steps complete panni Elixir farm pannunga, 3) Plate method follow pannunga. Unga builder ready bro!"
    else:
        reply = f"Ketaen bro! Unga message note panniten ('{data.message}'). Namma target 95kg -> 73kg. Innaiku unga base upgrade panna ready ah? Quests check pannunga!"

    c.execute("INSERT INTO chat_log (sender, message, timestamp) VALUES (?, ?, ?)", ("AI Coach", reply, now_ts))
    conn.commit()
    conn.close()
    return {"reply": reply}

# Serve frontend static assets
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

