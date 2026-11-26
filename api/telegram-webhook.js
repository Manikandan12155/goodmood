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

async function loadState(supabaseUrl, supabaseKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/pa_state?id=eq.main&select=data`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
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
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ id: 'main', data: db, updated_at: new Date().toISOString() })
  });
}

function applyActions(db, actions, todayStr, yesterdayStr) {
  for (const act of actions) {
    if (act.type === 'set_schedule') {
      db.schedule = db.schedule || { ...DEFAULT_SCHEDULE };
      for (const k of ['wake_time', 'gym_start', 'gym_end', 'office_start', 'office_end', 'sleep_time', 'daily_walk_km']) {
        if (act[k] !== undefined && act[k] !== null && act[k] !== '') db.schedule[k] = act[k];
      }
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
    return res.status(200).json({ ok: true, message: 'GoodMood PA Telegram Webhook is alive.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = String(process.env.TELEGRAM_CHAT_ID || '');
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
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

    const systemPrompt = `You are GoodMood PA, a warm, honest, brother-like personal assistant on Telegram.
Reply ONLY in Tanglish (Tamil words in English letters, NEVER use Tamil script).
Context: Goal 95kg -> 73kg, sole earner for family, office survival (under-promise, written trail, crisp English), avoid shiny object syndrome.
Current IST Date: ${todayStr}, Current IST Time: ${timeStr}.
Saved Schedule: ${JSON.stringify(db.schedule || DEFAULT_SCHEDULE)}
Saved Water Plan: ${JSON.stringify(db.water_plan || [])}
Active Reminders: ${JSON.stringify((db.reminders || []).filter(r => !r.done).slice(0, 8))}

Respond with valid JSON ONLY:
{
  "reply": "Your concise, practical Tanglish reply (2-4 sentences)",
  "actions": []
}

Supported actions:
- {"type":"set_schedule","wake_time":"HH:MM","gym_start":"HH:MM","gym_end":"HH:MM","office_start":"HH:MM","office_end":"HH:MM","sleep_time":"HH:MM","daily_walk_km":6}
- {"type":"set_water_plan","slots":[{"time":"HH:MM","amount_ml":500}]}
- {"type":"add_reminder","text":"...","target_date":"YYYY-MM-DD"}
- {"type":"office_reach"}
- {"type":"gym_done"}
- {"type":"gym_missed_yesterday"}
- {"type":"log_water","ml":500}
- {"type":"log_walk","km":1.5}
- {"type":"log_career","minutes":30}`;

    const recent = (db.mentor_history || []).slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    if (!groqKey) {
      await sendTelegram(botToken, chatId, 'Groq API key missing in Vercel Env Vars bro! Add GROQ_API_KEY in Vercel Settings -> Redeploy.');
      return res.status(200).json({ ok: true });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...recent,
          { role: 'user', content: userText }
        ]
      })
    });

    const groqData = await groqRes.json();
    if (groqData?.error) {
      await sendTelegram(botToken, chatId, `Groq Error bro: ${groqData.error.message}`);
      return res.status(200).json({ ok: true });
    }

    const rawContent = groqData?.choices?.[0]?.message?.content;
    let reply = 'Sollu bro, naan kekkuren. Enna help venum?';
    let actions = [];

    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent);
        reply = parsed.reply || reply;
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        reply = rawContent;
      }
    }

    if (actions.length > 0) {
      applyActions(db, actions, todayStr, yesterdayStr);
      reply += `\n\n✓ Saved (${actions.map(a => a.type).join(', ')})`;
    }

    db.mentor_history = [...(db.mentor_history || []), { role: 'user', text: userText }, { role: 'assistant', text: reply }].slice(-40);
    await saveState(supabaseUrl, supabaseKey, db);
    await sendTelegram(botToken, chatId, reply);
  } catch (err) {
    await sendTelegram(botToken, chatId, `Error bro: ${err.message}`);
  }

  return res.status(200).json({ ok: true });
}

