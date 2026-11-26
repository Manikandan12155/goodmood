// Vercel Serverless Endpoint: /api/cron-notify
// Checks Supabase pa_state and pushes lock-screen alerts to Telegram

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return res.ok;
}

function getISTNow() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffsetMs);
}

function timeToMins(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function sbHeaders(key, extra = {}) {
  const h = { apikey: key, ...extra };
  if (key && key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!supabaseUrl || !supabaseKey || !botToken || !chatId) {
    return res.status(400).json({
      error: 'Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID'
    });
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/pa_state?id=eq.main&select=data`, {
      headers: sbHeaders(supabaseKey)
    });
    const rows = await dbRes.json();
    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: 'Supabase error', details: rows });
    }
    if (rows.length === 0) {
      return res.status(200).json({ ok: true, message: 'No state yet' });
    }

    const db = rows[0].data || {};
    const ist = getISTNow();
    const todayStr = ist.toISOString().slice(0, 10);
    const tomorrowDate = new Date(ist.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
    const curMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();

    const notified = db.notified_today?.[todayStr] || [];
    const sent = [];

    // 1. Check Custom Water Plan
    for (const slot of db.water_plan || []) {
      const slotMins = timeToMins(slot.time);
      const key = `water_${slot.id}`;
      const alreadyDone = (db.daily_records?.[todayStr]?.completed_water_ids || []).includes(slot.id);
      if (!alreadyDone && !notified.includes(key) && curMins >= slotMins && curMins <= slotMins + 20) {
        await sendTelegram(botToken, chatId, `💧 Water Time (${slot.time}): ${slot.amount_ml}ml thanni kudi bro!`);
        notified.push(key);
        sent.push(key);
      }
    }

    // 2. Check Schedule Milestones (Gym Start, Office Leave)
    const sched = db.schedule || {};
    if (sched.gym_start) {
      const gymMins = timeToMins(sched.gym_start);
      if (!notified.includes('gym_start') && curMins >= gymMins && curMins <= gymMins + 15) {
        await sendTelegram(botToken, chatId, `🏋️‍♂️ Gym Time (${sched.gym_start})! Gear up bro — Zero Day vendam.`);
        notified.push('gym_start');
        sent.push('gym_start');
      }
    }
    if (sched.office_end) {
      const offEndMins = timeToMins(sched.office_end);
      if (!notified.includes('office_end') && curMins >= offEndMins && curMins <= offEndMins + 15) {
        await sendTelegram(botToken, chatId, `🚪 Office Time Over (${sched.office_end})! Boundary maintain pannu — system close pannitu walk + 45m Career Hour start pannu.`);
        notified.push('office_end');
        sent.push('office_end');
      }
    }

    // 3. Check Reminders (Exact target_time OR 9 AM for date-only reminders)
    for (const r of db.reminders || []) {
      if (r.done) continue;
      const rKey = `rem_${r.id}_${todayStr}`;
      if (notified.includes(rKey)) continue;

      if (r.target_date === todayStr && r.target_time) {
        const rMins = timeToMins(r.target_time);
        if (curMins >= rMins && curMins <= rMins + 20) {
          await sendTelegram(botToken, chatId, `🔔 Reminder (${r.target_time}): ${r.text}`);
          notified.push(rKey);
          sent.push(rKey);
        }
      } else if (curMins >= 9 * 60 && curMins <= 9 * 60 + 20) {
        if (r.target_date === todayStr) {
          await sendTelegram(botToken, chatId, `🔔 TODAY Reminder: ${r.text}`);
          notified.push(rKey);
          sent.push(rKey);
        } else if (r.target_date === tomorrowStr) {
          await sendTelegram(botToken, chatId, `📅 Tomorrow Alert: ${r.text} — innaike ready aagiko Mani!`);
          notified.push(rKey);
          sent.push(rKey);
        }
      }
    }

    if (sent.length > 0) {
      db.notified_today = { [todayStr]: notified };
      await fetch(`${supabaseUrl}/rest/v1/pa_state?id=eq.main`, {
        method: 'PATCH',
        headers: sbHeaders(supabaseKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: db, updated_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

