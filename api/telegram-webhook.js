// Vercel Serverless Endpoint: /api/telegram-webhook
// Handles incoming Telegram messages to @GoodMoodPABot using Groq AI + Supabase

const DEFAULT_SCHEDULE = {
  wake_time: '06:00',
  gym_start: '06:30',
  gym_end: '07:30',
  office_start: '09:30',
  office_end: '18:30',
  sleep_time: '22:30',
  daily_walk_km: 6.0
};

function getISTNow() {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}

async function sendTelegram(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

function sbHeaders(key, extra = {}) {
  const h = { apikey: key, ...extra };
  if (key && key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function loadState(supabaseUrl, supabaseKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/pa_state?id=eq.main&select=data`, {
    headers: sbHeaders(supabaseKey)
  });
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
    return rows[0].data;
  }
  return {
    daily_records: {},
    schedule: DEFAULT_SCHEDULE,
    water_plan: [],
    gym_state: { current_day_index: 0, plan: [], history: {} },
    office_state: { regular_tasks: [], daily_logs: {} },
    reminders: [],
    mentor_history: [],
    career_logs: {}
  };
}

async function saveState(supabaseUrl, supabaseKey, db) {
  await fetch(`${supabaseUrl}/rest/v1/pa_state`, {
    method: 'POST',
    headers: sbHeaders(supabaseKey, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    }),
    body: JSON.stringify({ id: 'main', data: db, updated_at: new Date().toISOString() })
  });
}

function extractTimeHHMM(text) {
  const low = text.toLowerCase();
  const m12 = low.match(/\b(\d{1,2})(?::(\d{1,2}))?\s*(am|pm|o'?clock|maniku|mani)\b/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const mins = parseInt(m12[2] || '0', 10);
    const suffix = m12[3];
    if (suffix === 'pm' && h < 12) h += 12;
    else if (suffix === 'am' && h === 12) h = 0;
    else if (suffix.includes('clock') || suffix.includes('mani')) {
      const istHour = getISTNow().getUTCHours();
      if (h < 12 && (h + 12) >= istHour) h += 12;
    }
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  const m24 = low.match(/\b([01]?\d|2[0-3]):(\d{1,2})\b/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const mins = parseInt(m24[2], 10);
    const istHour = getISTNow().getUTCHours();
    if (h < 12 && (h + 12) >= istHour) h += 12;
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return null;
}

function detectExplicitAction(text, todayStr, istNow) {
  const low = text.toLowerCase();
  const wantsSet = /(set|add|save|remind|reminder|venum|pannu|podu|vaiko|sollu)/.test(low);
  const refuses = /(panna venam|venam|cancel|vendam|stop)/.test(low);
  if (!wantsSet || refuses) return [];

  const timeHHMM = extractTimeHHMM(text);

  // Water reminder with a specific time (e.g., "water reminder 2 o clock set pannu")
  if (/(water|thanni)/.test(low) && timeHHMM) {
    const mlMatch = low.match(/(\d{2,4})\s*ml/);
    const amount_ml = mlMatch ? parseInt(mlMatch[1], 10) : 500;
    return [{ type: 'add_water_slot', time: timeHHMM, amount_ml }];
  }

  // General reminder with date/time
  if (/(remind|reminder|leave|call|meeting|mail|wish|birthday)/.test(low)) {
    let targetDate = todayStr;
    if (/(tomorrow|naalaiku|nalaiku)/.test(low)) {
      targetDate = new Date(istNow.getTime() + 86400000).toISOString().slice(0, 10);
    } else if (/(next week|wednesday|thursday|friday|monday|tuesday|saturday|sunday)/.test(low)) {
      const days = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
      for (const [k, wd] of Object.entries(days)) {
        if (new RegExp(`\\b${k}\\b`).test(low)) {
          const curWd = istNow.getUTCDay();
          let diff = (wd - curWd + 7) % 7;
          if (low.includes('next week') || diff === 0) diff += (diff === 0 ? 7 : 7 - curWd + wd > 7 ? 0 : 7);
          targetDate = new Date(istNow.getTime() + diff * 86400000).toISOString().slice(0, 10);
          break;
        }
      }
    }
    return [{ type: 'add_reminder', text, target_date: targetDate, target_time: timeHHMM || '' }];
  }
  return [];
}

function applyActions(db, actions, todayStr, yesterdayStr) {
  for (const act of actions) {
    if (act.type === 'set_schedule') {
      db.schedule = db.schedule || { ...DEFAULT_SCHEDULE };
      for (const k of ['wake_time', 'gym_start', 'gym_end', 'office_start', 'office_end', 'sleep_time', 'daily_walk_km']) {
        if (act[k] !== undefined && act[k] !== null && act[k] !== '') db.schedule[k] = act[k];
      }
    } else if (act.type === 'add_water_slot') {
      db.water_plan = db.water_plan || [];
      db.water_plan.push({
        id: `w_${Date.now()}`,
        time: act.time || '14:00',
        amount_ml: Number(act.amount_ml || 500)
      });
    } else if (act.type === 'set_water_plan' && Array.isArray(act.slots)) {
      db.water_plan = act.slots.map((s, idx) => ({
        id: `w_${Date.now()}_${idx}`,
        time: s.time || '10:00',
        amount_ml: Number(s.amount_ml || 500)
      }));
    } else if (act.type === 'add_reminder' && act.text) {
      db.reminders = db.reminders || [];
      db.reminders.unshift({
        id: Date.now() + Math.floor(Math.random() * 100),
        text: act.text,
        target_date: act.target_date || todayStr,
        target_time: act.target_time || '',
        done: false
      });
    } else if (act.type === 'office_reach') {
      db.office_state = db.office_state || { regular_tasks: [], daily_logs: {} };
      db.office_state.daily_logs = db.office_state.daily_logs || {};
      if (!db.office_state.daily_logs[todayStr]) {
        const ist = getISTNow();
        db.office_state.daily_logs[todayStr] = {
          reached_at: ist.toISOString().slice(11, 16),
          completed_ids: []
        };
      }
    } else if (act.type === 'gym_done') {
      db.gym_state = db.gym_state || { current_day_index: 0, plan: [], history: {} };
      const idx = db.gym_state.current_day_index || 0;
      db.gym_state.history[todayStr] = { status: 'done', day_index: idx };
      db.gym_state.current_day_index = (idx + 1) % 5;
    } else if (act.type === 'gym_missed_yesterday') {
      db.gym_state = db.gym_state || { current_day_index: 0, plan: [], history: {} };
      db.gym_state.history[yesterdayStr] = { status: 'missed', day_index: db.gym_state.current_day_index || 0 };
    } else if (act.type === 'log_water') {
      db.daily_records = db.daily_records || {};
      const rec = db.daily_records[todayStr] || {};
      rec.water_litres = +(Number(rec.water_litres || 0) + Number(act.ml || 250) / 1000).toFixed(2);
      db.daily_records[todayStr] = rec;
    } else if (act.type === 'log_walk') {
      db.daily_records = db.daily_records || {};
      const rec = db.daily_records[todayStr] || {};
      rec.gps_distance_km = +(Number(rec.gps_distance_km || 0) + Number(act.km || 0.5)).toFixed(2);
      db.daily_records[todayStr] = rec;
    } else if (act.type === 'log_career') {
      db.career_logs = db.career_logs || {};
      db.career_logs[todayStr] = (db.career_logs[todayStr] || 0) + Number(act.minutes || 15);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Arunika Telegram Webhook is alive.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = String(process.env.TELEGRAM_CHAT_ID || '');
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';

  const message = req.body?.message;
  const chatId = String(message?.chat?.id || '');
  const userText = (message?.text || '').trim();

  if (!chatId || !userText) {
    return res.status(200).json({ ok: true });
  }

  // Only respond to the owner
  if (allowedChatId && chatId !== allowedChatId) {
    await sendTelegram(botToken, chatId, 'Sorry, this is a private Personal Assistant bot.');
    return res.status(200).json({ ok: true });
  }

  try {
    const db = await loadState(supabaseUrl, supabaseKey);
    const ist = getISTNow();
    const todayStr = ist.toISOString().slice(0, 10);
    const yesterdayStr = new Date(ist.getTime() - 86400000).toISOString().slice(0, 10);
    const timeStr = ist.toISOString().slice(11, 16);

    const preActions = detectExplicitAction(userText, todayStr, ist);
    const savedNotice = preActions.length > 0
      ? `\nSYSTEM NOTE: Already saved to database: ${JSON.stringify(preActions)}. Just confirm warmly to Mani in 1-2 short Tanglish sentences that it's set, do NOT argue or lecture.`
      : '';

    const systemPrompt = `You are Arunika, Mani's (Manikandan's) closest real-life best friend on Telegram.
Language: Speak ONLY in super natural, flowing, everyday spoken Tanglish — the exact way two close Tamil friends text each other on WhatsApp. NEVER use Tamil script. NEVER sound like translated English or an AI bot.

WHO YOU ARE:
- Name: Arunika.
- Boss/Owner/Creator: Manikandan (call him "Mani" warmly, never "bro").
- Vibe: Warm, supportive, motivating best friend who listens and responds to what Mani actually says.${savedNotice}

ACTIONS (ONLY when Mani explicitly asks to save/set/remind/log something and not already saved above):
Append ONE line at the end: [ACTION:{"type":"..."}]
Supported: set_schedule, add_water_slot, set_water_plan, add_reminder, office_reach, gym_done, gym_missed_yesterday, log_water, log_walk, log_career.

Context (${todayStr} ${timeStr} IST): Schedule=${JSON.stringify(db.schedule || DEFAULT_SCHEDULE)}, WaterPlan=${JSON.stringify(db.water_plan || [])}, Reminders=${JSON.stringify((db.reminders || []).filter(r => !r.done).slice(0, 6))}.`;

    const recent = (db.mentor_history || []).slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    let rawContent = '';

    if (geminiKey) {
      try {
        const gemUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
        const gemHistory = recent.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));
        const gemRes = await fetch(gemUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(6000),
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [...gemHistory, { role: 'user', parts: [{ text: userText }] }],
            generationConfig: { temperature: 0.9 }
          })
        });
        const gemData = await gemRes.json();
        rawContent = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      } catch {}
    }

    if (!rawContent && groqKey) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          temperature: 0.9,
          messages: [
            { role: 'system', content: systemPrompt },
            ...recent,
            { role: 'user', content: userText }
          ]
        })
      });
      const groqData = await groqRes.json();
      if (groqData?.error) {
        await sendTelegram(botToken, chatId, `Groq Error: ${groqData.error.message}`);
        return res.status(200).json({ ok: true });
      }
      rawContent = (groqData?.choices?.[0]?.message?.content || '').trim();
    }
    if (!rawContent && !geminiKey && !groqKey) {
      await sendTelegram(botToken, chatId, 'GEMINI_API_KEY or GROQ_API_KEY missing in Vercel Env Vars Mani!');
      return res.status(200).json({ ok: true });
    }

    let reply = rawContent || 'Enna Mani, sollunga — naan inga thaan irukken.';
    const actions = [...preActions];
    if (actions.length === 0) {
      for (const m of reply.matchAll(/\[ACTION:(\{.*?\})\]/g)) {
        try {
          actions.push(JSON.parse(m[1]));
        } catch {}
      }
    }
    reply = reply.replace(/\[ACTION:\{.*?\}\]/g, '').trim();

    if (actions.length > 0) {
      applyActions(db, actions, todayStr, yesterdayStr);
    }

    db.mentor_history = [...(db.mentor_history || []), { role: 'user', text: userText }, { role: 'assistant', text: reply }].slice(-40);
    await saveState(supabaseUrl, supabaseKey, db);
    await sendTelegram(botToken, chatId, reply);
  } catch (err) {
    await sendTelegram(botToken, chatId, `Error bro: ${err.message}`);
  }

  return res.status(200).json({ ok: true });
}

