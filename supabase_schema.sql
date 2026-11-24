-- ==========================================================
-- SUPABASE SCHEMA: REAL-LIFE TRANSFORMATION OS (95KG -> 73KG)
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER PROFILE & BODY TRANSFORMATION
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT DEFAULT 'Commander',
    starting_weight NUMERIC(5,2) DEFAULT 95.0,
    current_weight NUMERIC(5,2) DEFAULT 95.0,
    target_weight NUMERIC(5,2) DEFAULT 73.0,
    current_streak INTEGER DEFAULT 1,
    best_streak INTEGER DEFAULT 1,
    mental_hp INTEGER DEFAULT 80, -- 0-100
    stamina_level INTEGER DEFAULT 70, -- 0-100
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DAILY CHECK-INS & HEALTH VITALS (Handles Desk Job, Water, Steps, Belly)
CREATE TABLE IF NOT EXISTS public.daily_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    morning_weight NUMERIC(5,2),
    water_glasses INTEGER DEFAULT 0, -- Target 8 glasses (3.5L)
    step_count INTEGER DEFAULT 0, -- Target 8,000 steps
    pushup_reps INTEGER DEFAULT 0, -- Progression from 0 to 20
    desk_breaks_taken INTEGER DEFAULT 0, -- 50m desk breaks taken
    tummy_vacuum_done BOOLEAN DEFAULT FALSE, -- Stomach vacuum for hanging belly
    craving_shield_activated BOOLEAN DEFAULT FALSE, -- 4 PM snack defense
    plate_method_followed BOOLEAN DEFAULT FALSE, -- 50% Veg / 25% Protein / 25% Carbs
    sleep_hours NUMERIC(3,1),
    mood_rating INTEGER, -- 1-5 scale
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, log_date)
);

-- 3. QUICK BRAIN DUMP & MEMORY VAULT (Handles: Forgotten Ideas, Commitments, Wishes)
CREATE TABLE IF NOT EXISTS public.brain_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('idea', 'commitment', 'wish', 'quick_note')),
    title TEXT NOT NULL,
    details TEXT,
    target_person TEXT, -- For friend/colleague commitment or wish
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. WORK & CAREER DEEP FOCUS SESSIONS (Handles: Job Fluctuation, Procrastination)
CREATE TABLE IF NOT EXISTS public.focus_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 25, -- 25 min pomodoro lock
    completed BOOLEAN DEFAULT TRUE,
    session_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DAILY 3-MIN ENGLISH SHADOWING LAB (Handles: 10 Years English Struggle)
CREATE TABLE IF NOT EXISTS public.english_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    phrase_learned TEXT NOT NULL,
    spoken_practice_done BOOLEAN DEFAULT FALSE,
    confidence_score INTEGER DEFAULT 3, -- 1-5 scale
    practice_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BRO-COACH AI CHAT LOG (Handles: Real-time Guidance, Mood & Accountability)
CREATE TABLE IF NOT EXISTS public.coach_chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'coach')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.english_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and edit own profile" ON public.profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage daily logs" ON public.daily_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage brain vault" ON public.brain_vault FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage focus sessions" ON public.focus_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage english logs" ON public.english_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage coach chats" ON public.coach_chat_history FOR ALL USING (auth.uid() = user_id);

