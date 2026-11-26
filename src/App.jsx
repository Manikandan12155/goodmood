import { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  Droplets,
  Footprints,
  Timer,
  Send,
  ArrowLeft,
  Cloud,
  Sparkles
} from 'lucide-react';
import {
  getInitialDB,
  saveDB,
  resetAllDB,
  loadFromSupabase,
  buildCopilotView,
  parseNaturalDate,
  judgeIdea,
  askGroqPA
} from './utils/copilotEngine';

const QUICK_CHIPS = [
  'Daily 6:00 wake, 6:30 gym, 9:30 office, 6:30 kelambuva',
  'Water 10:00 500ml, 13:00 500ml, 16:00 500ml',
  'Next week wednesday leave venum',
  'Office reach aagiten',
  'Yesterday gym miss panniten',
  'Office-la tension-ah irukku bro'
];

export default function App() {
  const [db, setDb] = useState(() => getInitialDB());
  const [now, setNow] = useState(() => new Date());
  const [showSettings, setShowSettings] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [groqKey, setGroqKey] = useState(() => db.settings?.groq_api_key || '');
  const [sbUrl, setSbUrl] = useState(() => db.settings?.supabase_url || '');
  const [sbKey, setSbKey] = useState(() => db.settings?.supabase_anon_key || '');
  const [savedToast, setSavedToast] = useState(false);

  const streamEndRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    const onVis = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onVis);

    if (db.settings?.supabase_url && db.settings?.supabase_anon_key) {
      loadFromSupabase(db.settings.supabase_url, db.settings.supabase_anon_key).then(cloud => {
        if (cloud) {
          setDb(prev => saveDB({ ...prev, ...cloud, settings: prev.settings }));
        }
      });
    }

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [db.mentor_history?.length]);

  const state = buildCopilotView(db, now);
  const { master } = state;
  const waterLitres = Number(state.daily_record?.water_litres || 0);
  const walkedKm = Number(state.daily_record?.gps_distance_km || 0);
  const careerMins = state.career?.today_minutes || 0;

  function mutateDB(updater) {
    setDb(prev => {
      const next = structuredClone(prev);
      updater(next);
      return saveDB(next);
    });
  }

  function applyAIActions(d, actions) {
    const todayStr = state.today;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    for (const act of actions) {
      if (act.type === 'set_schedule') {
        const keys = ['wake_time', 'gym_start', 'gym_end', 'office_start', 'office_end', 'sleep_time', 'daily_walk_km'];
        for (const k of keys) {
          if (act[k] !== undefined && act[k] !== null && act[k] !== '') {
            d.schedule[k] = act[k];
          }
        }
      } else if (act.type === 'set_water_plan' && Array.isArray(act.slots)) {
        d.water_plan = act.slots.map((s, idx) => ({
          id: `w_${Date.now()}_${idx}`,
          time: s.time || '10:00',
          amount_ml: Number(s.amount_ml || 500)
        }));
      } else if (act.type === 'add_reminder' && act.text) {
        d.reminders.unshift({
          id: Date.now() + Math.floor(Math.random() * 100),
          text: act.text,
          target_date: act.target_date || parseNaturalDate(act.text),
          done: false
        });
      } else if (act.type === 'office_reach') {
        if (!d.office_state.daily_logs[todayStr]) {
          d.office_state.daily_logs[todayStr] = { reached_at: new Date().toTimeString().slice(0, 5), completed_ids: [] };
        }
      } else if (act.type === 'gym_done') {
        const planLen = d.gym_state.plan.length;
        const idx = (d.gym_state.current_day_index || 0) % planLen;
        d.gym_state.history[todayStr] = { status: 'done', day_index: idx };
        d.gym_state.current_day_index = (idx + 1) % planLen;
      } else if (act.type === 'gym_missed_yesterday') {
        const idx = (d.gym_state.current_day_index || 0) % d.gym_state.plan.length;
        d.gym_state.history[yStr] = { status: 'missed', day_index: idx };
      } else if (act.type === 'log_water') {
        const rec = d.daily_records[todayStr] || {};
        rec.water_litres = +(Number(rec.water_litres || 0) + Number(act.ml || 250) / 1000).toFixed(2);
        d.daily_records[todayStr] = rec;
      } else if (act.type === 'log_walk') {
        const rec = d.daily_records[todayStr] || {};
        rec.gps_distance_km = +(Number(rec.gps_distance_km || 0) + Number(act.km || 0.5)).toFixed(2);
        d.daily_records[todayStr] = rec;
      } else if (act.type === 'log_career') {
        d.career_logs[todayStr] = (d.career_logs[todayStr] || 0) + Number(act.minutes || 15);
      }
    }
  }

  async function sendMessage(rawText) {
    const text = rawText.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    // Push user message immediately for responsive chat feel
    mutateDB(d => {
      d.mentor_history.push({ role: 'user', text });
    });

    const key = db.settings?.groq_api_key || '';
    let reply = '';
    let actions = [];

    if (key) {
      const res = await askGroqPA(text, state, key);
      reply = res.reply;
      actions = res.actions;
    } else {
      // Local smart fallback when Groq key is not set yet
      const low = text.toLowerCase();
      if (/(remind|leave|wednesday|thursday|friday|monday|tuesday|saturday|sunday|tomorrow|naalaiku|next week)/.test(low)) {
        const td = parseNaturalDate(text);
        actions = [{ type: 'add_reminder', text, target_date: td }];
        reply = `Done bro! "${text}" (${td})-ku save panniten. Settings-la Groq API key pota innum smart-ah ellame auto-update aagum.`;
      } else if (/(reach|reached|office vandhuten)/.test(low)) {
        actions = [{ type: 'office_reach' }];
        reply = 'Office reach locked bro! Under-promise & written trail follow pannu.';
      } else if (/(gym miss|missed gym)/.test(low)) {
        actions = [{ type: 'gym_missed_yesterday' }];
        reply = `Zero guilt bro! Yesterday miss aana workout-ah today adjust panniten.`;
      } else if (/(idea|startup|app|side income)/.test(low)) {
        const v = judgeIdea(text, 'general');
        reply = `${v.verdict}: ${v.reason} Next Step: ${v.next_step}`;
      } else {
        const res = await askGroqPA(text, state, '');
        reply = res.reply;
      }
    }

    mutateDB(d => {
      if (actions.length > 0) applyAIActions(d, actions);
      d.mentor_history.push({
        role: 'assistant',
        text: reply,
        savedTag: actions.length > 0 ? `Saved (${actions.map(a => a.type).join(', ')})` : null
      });
      d.mentor_history = d.mentor_history.slice(-40);
    });
    setSending(false);
  }

  return (
    <div className="shell" style={{ paddingBottom: 16 }}>
      {/* Minimal Header */}
      <header className="header">
        <div>
          <div className="header-time">
            {state.today} • {master.currentTimeLabel} • <span style={{ color: '#34c759' }}>{master.phaseTitle}</span>
          </div>
          <h1 className="header-title">
            {showSettings ? 'Settings & Cloud' : 'Arunika'}
          </h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {state.has_supabase && <Cloud size={16} color="#34c759" title="Supabase Synced" />}
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? <ArrowLeft size={18} /> : <SlidersHorizontal size={18} />}
          </button>
        </div>
      </header>

      {showSettings ? (
        <div>
          <div className="section">
            <h2 className="section-title" style={{ marginBottom: 6 }}><Sparkles size={15} color="#34c759" /> Groq AI + Supabase Sync</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Groq API key &amp; Supabase credentials paste panna, nee chat-la solra timings, water plan, reminders ellam cloud-la save aagum + Telegram lock-screen alerts varum.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label className="muted">Groq API Key (gsk_...)</label>
                <input type="password" className="input" placeholder="gsk_..." value={groqKey} onChange={e => setGroqKey(e.target.value)} />
              </div>
              <div>
                <label className="muted">Supabase Project URL</label>
                <input className="input" placeholder="https://xxxx.supabase.co" value={sbUrl} onChange={e => setSbUrl(e.target.value)} />
              </div>
              <div>
                <label className="muted">Supabase Anon Key</label>
                <input type="password" className="input" placeholder="eyJ..." value={sbKey} onChange={e => setSbKey(e.target.value)} />
              </div>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  mutateDB(d => {
                    d.settings = {
                      groq_api_key: groqKey.trim(),
                      supabase_url: sbUrl.trim(),
                      supabase_anon_key: sbKey.trim()
                    };
                  });
                  setSavedToast(true);
                  setTimeout(() => setSavedToast(false), 1800);
                }}
              >
                {savedToast ? 'Saved & Synced!' : 'Save Keys'}
              </button>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title" style={{ marginBottom: 8 }}>AI Saved Memory (Live)</h2>
            <div className="list-item">
              <span className="muted">Schedule</span>
              <span>Wake {master.schedule.wake_time} • Gym {master.schedule.gym_start} • Office {master.schedule.office_start}-{master.schedule.office_end}</span>
            </div>
            <div className="list-item">
              <span className="muted">Water Plan</span>
              <span>{master.waterSlots.length} slots ({master.totalWaterTargetL}L)</span>
            </div>
            <div className="list-item">
              <span className="muted">Active Reminders</span>
              <span>{state.reminders.filter(r => !r.done).length} pending</span>
            </div>
          </div>

          <div className="section">
            <button
              className="btn"
              style={{ width: '100%', color: '#ff453a', borderColor: 'rgba(255,69,58,0.4)' }}
              onClick={() => {
                const fresh = resetAllDB();
                setDb(fresh);
                setShowSettings(false);
              }}
            >
              Reset All Data (Fresh Start)
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Compact 3-Metric Strip */}
          <div className="metrics-row" style={{ marginBottom: 12 }}>
            <button
              className="metric-tile"
              onClick={() => mutateDB(d => {
                const rec = d.daily_records[state.today] || {};
                rec.water_litres = +(Number(rec.water_litres || 0) + 0.25).toFixed(2);
                d.daily_records[state.today] = rec;
              })}
            >
              <div className="metric-label"><Droplets size={12} color="#34c759" /> Water (+250ml)</div>
              <div className="metric-val">{waterLitres.toFixed(2)} / {master.totalWaterTargetL || 4}L</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (waterLitres / (master.totalWaterTargetL || 4)) * 100)}%` }} />
              </div>
            </button>

            <button
              className="metric-tile"
              onClick={() => mutateDB(d => {
                const rec = d.daily_records[state.today] || {};
                rec.gps_distance_km = +(Number(rec.gps_distance_km || 0) + 0.5).toFixed(2);
                d.daily_records[state.today] = rec;
              })}
            >
              <div className="metric-label"><Footprints size={12} /> Walk (+0.5km)</div>
              <div className="metric-val">{walkedKm.toFixed(1)} / {master.targetKm}km</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (walkedKm / (master.targetKm || 6)) * 100)}%` }} />
              </div>
            </button>

            <button
              className="metric-tile"
              onClick={() => mutateDB(d => { d.career_logs[state.today] = (d.career_logs[state.today] || 0) + 15; })}
            >
              <div className="metric-label"><Timer size={12} /> Safety (+15m)</div>
              <div className="metric-val">{careerMins} / 45m</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (careerMins / 45) * 100)}%` }} />
              </div>
            </button>
          </div>

          {master.dueWaterAlert && (
            <div className="nudge-pill">
              <span><strong>Water ({master.dueWaterAlert.label}):</strong> {master.dueWaterAlert.amount_ml}ml kudi bro</span>
              <button
                className="nudge-btn"
                onClick={() => mutateDB(d => {
                  const rec = d.daily_records[state.today] || {};
                  const ids = new Set(rec.completed_water_ids || []);
                  ids.add(master.dueWaterAlert.id);
                  rec.completed_water_ids = [...ids];
                  rec.water_litres = +(Number(rec.water_litres || 0) + master.dueWaterAlert.amount_ml / 1000).toFixed(2);
                  d.daily_records[state.today] = rec;
                })}
              >
                Done
              </button>
            </div>
          )}

          {state.urgent_alerts?.length > 0 && (
            <div className="nudge-pill">
              <span><strong>{state.urgent_alerts[0].label}:</strong> {state.urgent_alerts[0].text}</span>
              <button
                className="nudge-btn"
                onClick={() => mutateDB(d => {
                  const r = d.reminders.find(x => x.id === state.urgent_alerts[0].id);
                  if (r) r.done = true;
                })}
              >
                Done
              </button>
            </div>
          )}

          {/* Pure Chat Stream */}
          <div className="pa-stream" style={{ overflowY: 'auto', minHeight: 260 }}>
            {(!state.mentor_history || state.mentor_history.length === 0) ? (
              <div className="bubble bubble-pa">
                Bro, naan unoda Chat PA. Epdi software/forms ellam venam — just enkitta normal-ah sollu:
                &quot;Daily 6am wake, 9:30 office&quot;, &quot;Water 10am 500ml&quot;, &quot;Next week wednesday leave venum&quot;, illa manasula irukkuradha pesu. Naan Supabase-la save panni Telegram-la remind pannuven!
              </div>
            ) : (
              state.mentor_history.map((m, i) => (
                <div key={i} className={`bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-pa'}`}>
                  <div>{m.text}</div>
                  {m.savedTag && (
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#34c759', fontWeight: 600 }}>
                      ✓ {m.savedTag}
                    </div>
                  )}
                </div>
              ))
            )}
            {sending && <div className="bubble bubble-pa muted">Thinking...</div>}
            <div ref={streamEndRef} />
          </div>

          <div className="chips-scroll">
            {QUICK_CHIPS.map(c => (
              <button key={c} className="chip" onClick={() => sendMessage(c)}>{c}</button>
            ))}
          </div>

          <div className="composer">
            <input
              placeholder="Enkitta sollu bro... (timings, water, leave, tension)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
            />
            <button className="send-btn" disabled={sending} onClick={() => sendMessage(input)}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
