const STORAGE_KEY = 'goodmood_pa_db_v2';

export const DEFAULT_GYM_PLAN = [
  {
    day: 1,
    title: 'Push & TVA Core',
    focus: 'Chest, Shoulders & Belly Tightening',
    duration: '30-35 mins',
    exercises: [
      'Wall or Incline Pushups — 3 sets x 8-10 reps',
      'Light Dumbbell / Machine Chest Press — 3 sets x 10 reps',
      'TVA Hanging Belly Vacuum — 3 sets x 30 sec hold',
      '20-min Brisk Treadmill / Outdoor Walk (Fat Burn)'
    ],
    home_backup: 'Home Backup (10 mins): 3x8 Knee Pushups + 3x30s Belly Vacuum + 10-min brisk walk'
  },
  {
    day: 2,
    title: 'Pull & Posture',
    focus: 'Back Strength & Desk Posture Fix',
    duration: '30-35 mins',
    exercises: [
      'Dead Hang (or Assisted Lat Pulldown) — 3 sets x 20-30 sec / 10 reps',
      'Seated Cable Row — 3 sets x 10-12 reps',
      'Face Pulls / Band Pull-Aparts — 3 sets x 12 reps',
      '20-min Steady Walk (Zero Joint Load)'
    ],
    home_backup: 'Home Backup (10 mins): 3x15 Superman Back Extensions + 3x12 Towel Rows + 10-min walk'
  },
  {
    day: 3,
    title: 'Legs & Stamina',
    focus: 'Lower Body & Breathlessness Fix',
    duration: '30-35 mins',
    exercises: [
      'Bodyweight Box Squats — 3 sets x 12 reps',
      'Glute Bridges — 3 sets x 15 reps',
      'Standing Calf Raises — 3 sets x 15 reps',
      '25-min LISS Walk (Target 3,000+ steps)'
    ],
    home_backup: 'Home Backup (10 mins): 3x12 Chair Squats + 3x15 Glute Bridges + 10-min spot march'
  },
  {
    day: 4,
    title: 'Upper Tone & Core',
    focus: 'Arms, Shoulders & Energy',
    duration: '30 mins',
    exercises: [
      'Light Shoulder Press — 3 sets x 10 reps',
      'Dumbbell Bicep Curls + Tricep Pushdown — 3 sets x 10 reps',
      'Modified Plank / Belly Vacuum — 3 sets x 30 sec',
      '20-min Walk'
    ],
    home_backup: 'Home Backup (10 mins): 3x10 Water-bottle Shoulder Press + 3x30s Plank + 10-min walk'
  },
  {
    day: 5,
    title: 'Active Fat Burn',
    focus: 'Pure Visceral Fat Oxidation',
    duration: '35-40 mins',
    exercises: [
      '35-min Brisk Walk (8,000 steps target for the day)',
      '5-min Hip & Knee Mobility Stretching',
      '5-min Deep Breathing (4s Inhale - 4s Hold - 6s Exhale)'
    ],
    home_backup: 'Home Backup (15 mins): 15-min brisk walk + 5-min stretching'
  }
];

export const DEFAULT_REGULAR_TASKS = [];

export const DEFAULT_WATER_PLAN = [];

const WEEKDAYS = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 0, sun: 0
};

function toISODate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function parseNaturalDate(text) {
  const today = new Date();
  const low = text.toLowerCase().trim();

  const iso = low.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  if (/\b(today|innaiku|iniku)\b/.test(low)) return toISODate(today);
  if (/\b(tomorrow|naalaiku|nalaiku)\b/.test(low)) return toISODate(addDays(today, 1));

  const inDays = low.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) return toISODate(addDays(today, Number(inDays[1])));

  for (const [name, targetJsDay] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(low)) {
      const todayJsDay = today.getDay(); // 0=Sun..6=Sat
      const mondayOffset = todayJsDay === 0 ? -6 : 1 - todayJsDay;
      if (low.includes('next week') || low.includes('next wk') || low.includes('adutha varam')) {
        const nextMonday = addDays(today, mondayOffset + 7);
        const offsetFromMon = targetJsDay === 0 ? 6 : targetJsDay - 1;
        return toISODate(addDays(nextMonday, offsetFromMon));
      }
      let diff = (targetJsDay - todayJsDay + 7) % 7;
      if (diff === 0) diff = 7;
      return toISODate(addDays(today, diff));
    }
  }

  return toISODate(addDays(today, 1));
}

export const DEFAULT_SCHEDULE = {
  wake_time: '06:00',
  gym_start: '06:30',
  gym_end: '07:30',
  office_start: '09:30',
  office_end: '18:30',
  sleep_time: '22:30',
  daily_walk_km: 6.0
};

function timeToMins(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToTimeLabel(totalMins) {
  const wrapped = ((totalMins % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function buildMasterTimeline(schedule, now, waterLitres, walkedKm, customWaterPlan, completedWaterIds) {
  const s = { ...DEFAULT_SCHEDULE, ...(schedule || {}) };
  const curMins = now.getHours() * 60 + now.getMinutes();
  const wake = timeToMins(s.wake_time);
  const gymS = timeToMins(s.gym_start);
  const gymE = timeToMins(s.gym_end);
  const offS = timeToMins(s.office_start);
  const offE = timeToMins(s.office_end);
  const sleep = timeToMins(s.sleep_time);

  let phaseTitle = 'Rest & Recharge';
  let phaseAction = `Sleep well bro. Wake up target: ${minsToTimeLabel(wake)}.`;

  if (curMins >= wake && curMins < gymS) {
    phaseTitle = 'Morning Prep';
    phaseAction = `500ml warm water kudi + Gym-ku ready aagu (${minsToTimeLabel(gymS)}).`;
  } else if (curMins >= gymS && curMins < gymE) {
    phaseTitle = 'Gym Window';
    phaseAction = `Workout time! Gym tab-la irukura today's chart follow pannu (${minsToTimeLabel(gymE)} varaikkum).`;
  } else if (curMins >= gymE && curMins < offS) {
    phaseTitle = 'Breakfast & Commute';
    phaseAction = `Protein breakfast saapdu (3 eggs / sundal) + ${minsToTimeLabel(offS)}-ku Office reach aagu.`;
  } else if (curMins >= offS && curMins < offE) {
    const minsLeft = offE - curMins;
    phaseTitle = 'Office Hours';
    if (curMins >= 15 * 60 + 30 && curMins <= 17 * 60) {
      phaseAction = `4 PM Trap Zone! Tea kadai puffs/sugar tea venam — 500ml water + sundal edu. Leave at ${minsToTimeLabel(offE)}.`;
    } else {
      phaseAction = `Focus on work & written updates. Office kelamba innum ${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m irukku (${minsToTimeLabel(offE)}).`;
    }
  } else if (curMins >= offE && curMins < sleep) {
    phaseTitle = 'Post-Office & Recovery';
    phaseAction = `Office mudinchu! Evening walk + 45-min Career Safety Hour + light dinner before ${minsToTimeLabel(sleep)}.`;
  }

  // Custom user-defined water plan
  const rawPlan = customWaterPlan || [];
  const doneSet = new Set(completedWaterIds || []);
  const sortedPlan = [...rawPlan].sort((a, b) => timeToMins(a.time) - timeToMins(b.time));
  const totalWaterTargetL = +(sortedPlan.reduce((sum, w) => sum + Number(w.amount_ml || 0), 0) / 1000).toFixed(2);

  const waterSlots = sortedPlan.map(slot => {
    const slotMins = timeToMins(slot.time);
    const done = doneSet.has(slot.id);
    const dueNow = !done && curMins >= slotMins;
    return {
      ...slot,
      label: minsToTimeLabel(slotMins),
      slotMins,
      done,
      dueNow
    };
  });

  const dueWaterAlert = waterSlots.find(w => w.dueNow) || null;
  const nextWater = waterSlots.find(w => !w.done) || null;

  // Walk target calculation
  const targetKm = Number(s.daily_walk_km || 6.0);
  const remainingKm = Math.max(0, +(targetKm - walkedKm).toFixed(2));
  const remainingSteps = Math.round(remainingKm * 1300);

  const timelinePhases = [
    { id: 'wake', label: 'Wake & Prep', time: `${minsToTimeLabel(wake)} - ${minsToTimeLabel(gymS)}`, active: curMins >= wake && curMins < gymS, past: curMins >= gymS },
    { id: 'gym', label: 'Gym Window', time: `${minsToTimeLabel(gymS)} - ${minsToTimeLabel(gymE)}`, active: curMins >= gymS && curMins < gymE, past: curMins >= gymE },
    { id: 'commute', label: 'Breakfast & Commute', time: `${minsToTimeLabel(gymE)} - ${minsToTimeLabel(offS)}`, active: curMins >= gymE && curMins < offS, past: curMins >= offS },
    { id: 'office', label: 'Office Hours', time: `${minsToTimeLabel(offS)} - ${minsToTimeLabel(offE)}`, active: curMins >= offS && curMins < offE, past: curMins >= offE },
    { id: 'evening', label: 'Walk & Career Hour', time: `${minsToTimeLabel(offE)} - ${minsToTimeLabel(sleep)}`, active: curMins >= offE && curMins < sleep, past: curMins >= sleep }
  ];

  return {
    schedule: s,
    currentTimeLabel: minsToTimeLabel(curMins),
    phaseTitle,
    phaseAction,
    timelinePhases,
    waterSlots,
    dueWaterAlert,
    nextWater,
    totalWaterTargetL,
    targetKm,
    walkedKm,
    remainingKm,
    remainingSteps
  };
}

const ENV_SETTINGS = {
  groq_api_key: import.meta.env.VITE_GROQ_API_KEY || '',
  supabase_url: import.meta.env.VITE_SUPABASE_URL || '',
  supabase_anon_key: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
};

export function getInitialDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const s = parsed.settings || {};
      return {
        daily_records: parsed.daily_records || {},
        schedule: parsed.schedule || DEFAULT_SCHEDULE,
        water_plan: parsed.water_plan || DEFAULT_WATER_PLAN,
        gym_state: parsed.gym_state || { current_day_index: 0, plan: DEFAULT_GYM_PLAN, history: {} },
        office_state: parsed.office_state || { regular_tasks: DEFAULT_REGULAR_TASKS, daily_logs: {} },
        reminders: parsed.reminders || [],
        idea_judgements: parsed.idea_judgements || [],
        mentor_history: parsed.mentor_history || [],
        career_logs: parsed.career_logs || {},
        settings: {
          groq_api_key: s.groq_api_key || ENV_SETTINGS.groq_api_key,
          supabase_url: s.supabase_url || ENV_SETTINGS.supabase_url,
          supabase_anon_key: s.supabase_anon_key || ENV_SETTINGS.supabase_anon_key
        }
      };
    }
  } catch (e) {
    console.error('Failed to read localStorage', e);
  }
  return {
    daily_records: {},
    schedule: DEFAULT_SCHEDULE,
    water_plan: DEFAULT_WATER_PLAN,
    gym_state: { current_day_index: 0, plan: DEFAULT_GYM_PLAN, history: {} },
    office_state: { regular_tasks: DEFAULT_REGULAR_TASKS, daily_logs: {} },
    reminders: [],
    idea_judgements: [],
    mentor_history: [],
    career_logs: {},
    settings: { ...ENV_SETTINGS }
  };
}

export function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  syncToSupabase(db);
  return db;
}

export async function loadFromSupabase(url, anonKey) {
  if (!url || !anonKey) return null;
  try {
    const cleanUrl = url.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/pa_state?id=eq.main&select=data`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
      return rows[0].data;
    }
  } catch (e) {
    console.error('Supabase load error', e);
  }
  return null;
}

export async function syncToSupabase(db) {
  const url = db?.settings?.supabase_url;
  const anonKey = db?.settings?.supabase_anon_key;
  if (!url || !anonKey) return;
  try {
    const cleanUrl = url.replace(/\/$/, '');
    await fetch(`${cleanUrl}/rest/v1/pa_state`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: 'main', data: db, updated_at: new Date().toISOString() })
    });
  } catch (e) {
    console.error('Supabase sync error', e);
  }
}

export function resetAllDB() {
  localStorage.removeItem('goodmood_pa_db_v1');
  localStorage.removeItem(STORAGE_KEY);
  return getInitialDB();
}

export function buildCopilotView(db, now = new Date()) {
  const todayStr = toISODate(now);
  const yesterdayStr = toISODate(addDays(now, -1));
  const tomorrowStr = toISODate(addDays(now, 1));

  // Gym
  const plan = db.gym_state.plan?.length ? db.gym_state.plan : DEFAULT_GYM_PLAN;
  const idx = (db.gym_state.current_day_index || 0) % plan.length;
  const todayWorkout = plan[idx];
  const todayGymLog = db.gym_state.history?.[todayStr] || null;
  const yesterdayGymLog = db.gym_state.history?.[yesterdayStr] || null;

  let adaptiveMessage = `Today's Target: Day ${todayWorkout.day} — ${todayWorkout.title} (${todayWorkout.duration}).`;
  if (todayGymLog && (todayGymLog.status === 'done' || todayGymLog.status === 'home_backup')) {
    adaptiveMessage = `Super bro! Today's workout (${todayGymLog.status.replace('_', ' ')}) locked & done.`;
  } else if (yesterdayGymLog && yesterdayGymLog.status === 'missed') {
    adaptiveMessage = `Yesterday Day ${todayWorkout.day} (${todayWorkout.title}) miss aachu — zero guilt! Today adhe Day ${todayWorkout.day}-ah pannu, illana 10-min Home Backup edu.`;
  }

  // Office
  const regularTasks = db.office_state.regular_tasks || DEFAULT_REGULAR_TASKS;
  const dailyLogs = db.office_state.daily_logs || {};
  const todayOffice = dailyLogs[todayStr] || { reached_at: null, completed_ids: [], top3: ['', '', ''] };

  const prevDates = Object.keys(dailyLogs).filter(d => d < todayStr).sort().reverse();
  let missedPrevTasks = [];
  let missedFromDate = null;
  if (prevDates.length > 0) {
    missedFromDate = prevDates[0];
    const doneSet = new Set(dailyLogs[missedFromDate].completed_ids || []);
    missedPrevTasks = regularTasks.filter(t => !doneSet.has(t.id));
  }

  const completedToday = new Set(todayOffice.completed_ids || []);
  const remainingToday = regularTasks.filter(t => !completedToday.has(t.id));
  const hour = now.getHours();

  let nowGuidance = "Office reach aanadhum 'I Reached Office' tap pannu — unoda carry-forward & today's plan load aagum.";
  if (todayOffice.reached_at) {
    if (remainingToday.length === 0) {
      nowGuidance = 'All regular office checks done bro! Time-ku kelambu, boundary maintain pannu.';
    } else if (hour < 12) {
      nowGuidance = `Morning Phase: First '${remainingToday[0].title}' mudi. Under-promise & written-ah vai.`;
    } else if (hour >= 15 && hour <= 17) {
      nowGuidance = '4 PM Trap Zone! Tea kadai puffs/sugar tea venam — 500ml water + sundal/black tea edu.';
    } else {
      nowGuidance = `Next Step: '${remainingToday[0].title}' — 25 mins focus timer potu mudichu vai.`;
    }
  }

  // Reminders
  const urgentAlerts = (db.reminders || [])
    .filter(r => !r.done)
    .map(r => {
      if (r.target_date < todayStr) return { ...r, urgency: 'overdue', label: `Overdue (${r.target_date})` };
      if (r.target_date === todayStr) return { ...r, urgency: 'today', label: 'TODAY!' };
      if (r.target_date === tomorrowStr) return { ...r, urgency: 'tomorrow', label: 'Tomorrow (Early Alert)' };
      return null;
    })
    .filter(Boolean);

  const todayRecord = db.daily_records?.[todayStr] || {};
  const waterLitres = Number(todayRecord.water_litres || 0);
  const walkedKm = Number(todayRecord.gps_distance_km || 0);
  const master = buildMasterTimeline(
    db.schedule,
    now,
    waterLitres,
    walkedKm,
    db.water_plan,
    todayRecord.completed_water_ids
  );

  return {
    today: todayStr,
    daily_record: todayRecord,
    master,
    gym: {
      current_day_index: idx,
      today_workout: todayWorkout,
      adaptive_message: adaptiveMessage,
      plan
    },
    office: {
      regular_tasks: regularTasks,
      today_log: todayOffice,
      missed_prev_tasks: missedPrevTasks,
      missed_from_date: missedFromDate,
      now_guidance: nowGuidance
    },
    reminders: db.reminders || [],
    urgent_alerts: urgentAlerts,
    idea_judgements: (db.idea_judgements || []).slice(0, 10),
    mentor_history: (db.mentor_history || []).slice(-20),
    career: {
      today_minutes: db.career_logs?.[todayStr] || 0,
      streak_days: Object.values(db.career_logs || {}).filter(v => v >= 30).length
    },
    has_ai_key: Boolean(db.settings?.groq_api_key),
    has_supabase: Boolean(db.settings?.supabase_url && db.settings?.supabase_anon_key)
  };
}

export function judgeIdea(ideaText, category) {
  const low = ideaText.toLowerCase();
  const distraction = ['crypto', 'trading', 'dropship', 'youtube channel', 'instagram', 'game', 'saas', 'startup', '100x', 'passive income'];
  const safety = ['interview', 'resume', 'office', 'automation', 'python', 'react', 'ai', 'script', 'skill', 'walk', 'diet', 'leave', 'client'];

  const isDistraction = distraction.some(w => low.includes(w));
  const isSafety = safety.some(w => low.includes(w));

  if (isDistraction && !isSafety) {
    return {
      verdict: 'PARK FOR LATER (Shiny Object Alert)',
      tone: 'warn',
      reason: 'Bro, un pattern paatha idhu quick-excitement trap maari theriyudhu. Ippo family safety & job stability thaan #1 priority.',
      next_step: 'Idha vault-la save panniko, aana next 30 days-ku idhula time podatha. First daily 45-min career/skill block-ah complete pannu.'
    };
  }
  if (isSafety || category === 'office' || category === 'career') {
    return {
      verdict: 'GREEN LIGHT (Small 48-Hr Test)',
      tone: 'good',
      reason: 'Idhu unoda current job stability / skill confidence-ku direct-ah help pannum. Over-engineer pannaama chinna step-ah edu.',
      next_step: 'Next 48 hours-la idhula oru 25-minute mini version mattum build/practice panni paaru — paadhilaye drop aagama mudichu vai.'
    };
  }
  return {
    verdict: 'TEST SMALL (25-Min Rule)',
    tone: 'neutral',
    reason: 'Idea nalla irukku, aana periya project-ah edutha paadhilaye drop aagura chance irukku.',
    next_step: 'Innaiku just 25 mins mattum idha explore pannu. 3 days-ku apromum interest irundha continue pannu.'
  };
}

export function localRealityMentor(userMsg, view) {
  const low = userMsg.toLowerCase();
  const water = Number(view.daily_record?.water_litres || 0);
  const reached = view.office?.today_log?.reached_at;
  const careerMins = view.career?.today_minutes || 0;

  if (/(layoff|salary|family|relatives|job|bayam|fear|future)/.test(low)) {
    return `Bro, un bayam puriyudhu — nee oruthan thaan family-ku earn pandra. Aana layoff / relatives pathi yosichu freeze aagaatha. Innaiku unoda Career Safety Timer (${careerMins} mins done so far) 45 mins mudi — adhuve unna switch-ready-ah vachirukkum. Relatives pesa thaan seivanga, unoda security un skill-la thaan irukku.`;
  }
  if (/(office|manager|down|politics|tension|kolapam|english|standup)/.test(low)) {
    const note = reached ? `Office-la ${reached}-ku reach aayirukka.` : "Office tab-la 'I Reached Office' tap pannu.";
    return `Cool aagu bro. ${note} Office-la yaaravadhu down panna try pannaalum, silent-ah un work output-ah clean-ah deliver pannu. Verbal-ah edhuvum edukkaatha — written-ah Slack/Email podu. Ippo just oru task eduthu 25 mins focus pannu.`;
  }
  if (/(gym|lazy|mood|tired|weight|thoppa|95|73|sugar|snack|4 pm)/.test(low)) {
    return `All-or-nothing mindset venam bro! Today water ${water.toFixed(2)}L kudichirukka. Gym poga mudiyala na Gym tab-la irukura '10-Min Home Backup' mattum pannu — Zero Day aagama paathuko. 4 PM-ku first 500ml water kudi, craving 70% koraiyum.`;
  }
  return `Naan kekkuren bro. Ore time-la ella problems-aiyum thooki thalaila vaikkatha. Innaiku just 3 things podhum: 1) Water (${water.toFixed(2)}L/4L), 2) Office-la Top 1 task mudi, 3) 30-45 mins unoda career safety skill. Ippo unna romba disturb pandra exact vishayam enna nu sollu?`;
}

export async function askGroqPA(userMsg, view, groqKey) {
  if (!groqKey) {
    return { reply: localRealityMentor(userMsg, view), actions: [] };
  }

  const systemPrompt = `You are GoodMood PA, a warm, honest, brother-like personal assistant.
Reply ONLY in Tanglish (Tamil words written in English letters, NEVER use Tamil script).
Context about user: Goal is 95kg -> 73kg, sole earner for family, office survival (under-promise, written trail, crisp English), avoid shiny object syndrome.
Today's Date: ${view.today}, Current Time: ${view.master.currentTimeLabel}, Current Phase: ${view.master.phaseTitle}.
Saved Schedule: ${JSON.stringify(view.master.schedule)}
Saved Water Plan: ${JSON.stringify(view.master.waterSlots.map(w => ({ time: w.time, ml: w.amount_ml, done: w.done })))}
Active Reminders: ${JSON.stringify(view.reminders.filter(r => !r.done).slice(0, 8))}

You MUST respond with valid JSON ONLY in this format:
{
  "reply": "Your concise, empathetic, practical Tanglish response (2-4 sentences)",
  "actions": []
}

Supported actions you can include in "actions" array when the user asks to save/update something:
- {"type":"set_schedule","wake_time":"HH:MM","gym_start":"HH:MM","gym_end":"HH:MM","office_start":"HH:MM","office_end":"HH:MM","sleep_time":"HH:MM","daily_walk_km":6} (include only changed fields)
- {"type":"set_water_plan","slots":[{"time":"HH:MM","amount_ml":500}]}
- {"type":"add_reminder","text":"...","target_date":"YYYY-MM-DD"}
- {"type":"office_reach"}
- {"type":"gym_done"}
- {"type":"gym_missed_yesterday"}
- {"type":"log_water","ml":500}
- {"type":"log_walk","km":1.5}
- {"type":"log_career","minutes":30}`;

  const recentHistory = (view.mentor_history || []).slice(-6).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text
  }));

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
          { role: 'user', content: userMsg }
        ]
      })
    });
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        reply: parsed.reply || localRealityMentor(userMsg, view),
        actions: Array.isArray(parsed.actions) ? parsed.actions : []
      };
    }
  } catch (e) {
    console.error('Groq error:', e);
  }
  return { reply: localRealityMentor(userMsg, view), actions: [] };
}

