import { addDays, format, parseISO } from 'date-fns';
import { Camera, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, whoLine } from '../lib/api';
import { useHa } from '../lib/ha';
import { t } from '../lib/i18n';
import { Avatar } from '../lib/presence';
import { useStore } from '../lib/store';
import { Modal } from './Modal';
import { toast } from './Toast';

interface Draft {
  on: boolean;
  title: string;
  date: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
}

/** Ask Home Assistant's AI Task to pull events out of a photo (flyer, letter) or pasted text. */
async function extract(text: string, file: File | null): Promise<Draft[]> {
  let attachments: { media_content_id: string; media_content_type: string }[] | undefined;
  if (file) {
    const r = await fetch(`api/import/image?${new URLSearchParams({ name: file.name || 'flyer.jpg' })}`, { method: 'POST', body: file });
    if (!r.ok) throw new Error(await r.text());
    const { media_id } = await r.json();
    attachments = [{ media_content_id: media_id, media_content_type: file.type || 'image/jpeg' }];
  }
  const today = format(new Date(), 'yyyy-MM-dd (EEEE)');
  const instructions =
    `Today is ${today}. Find every event, appointment, or deadline in the ${file ? 'attached image' : 'text below'}. ` +
    'Reply with ONLY a JSON array and nothing else, like ' +
    '[{"title":"Picture day","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","allDay":false,"location":""}]. ' +
    'Use 24-hour times. If there is no time, set "allDay": true and leave out start and end. ' +
    'If the year is missing, use the next upcoming date. If there are no events, reply [].' +
    (text.trim() ? `\n\nText:\n${text.trim()}` : '');
  const r = await api.service<{ service_response: { data: unknown } }>(
    'ai_task', 'generate_data', { task_name: 'Hearth Magic Import', instructions, ...(attachments ? { attachments } : {}) }, true,
  );
  let data = r.service_response?.data;
  if (typeof data === 'string') {
    const a = data.indexOf('[');
    const b = data.lastIndexOf(']');
    data = a >= 0 && b > a ? JSON.parse(data.slice(a, b + 1)) : [];
  }
  const list = Array.isArray(data) ? data : (data as { events?: unknown[] })?.events ?? [];
  return (list as Record<string, unknown>[])
    .filter((e) => e && typeof e.title === 'string' && typeof e.date === 'string')
    .map((e) => ({
      on: true,
      title: String(e.title),
      date: String(e.date).slice(0, 10),
      start: e.start ? String(e.start).slice(0, 5) : undefined,
      end: e.end ? String(e.end).slice(0, 5) : undefined,
      allDay: Boolean(e.allDay) || !e.start,
      location: e.location ? String(e.location) : undefined,
    }));
}

export function MagicImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { calendars, colorOf } = useHa();
  const { members, settings } = useStore().data;
  const usable = calendars.filter((c) => !settings.hiddenCalendars.includes(c.entity_id));
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [cal, setCal] = useState(usable[0]?.entity_id ?? '');
  const [people, setPeople] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const find = async () => {
    setErr(null);
    setBusy(true);
    try {
      const d = await extract(text, file);
      setDrafts(d);
      if (!d.length) setErr(t('No events found. Try a clearer photo, or paste the text.'));
    } catch (e) {
      const msg = (e as Error).message;
      setErr(/ai_task|not found|Service/i.test(msg) ? t('Magic Import needs an AI provider and AI Task set up in Home Assistant (Settings → Devices & services). Error: {error}', { error: msg }) : msg);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const chosen = drafts!.filter((d) => d.on);
    const names = members.filter((m) => people.includes(m.id)).map((m) => m.name);
    let ok = 0;
    for (const d of chosen) {
      const data: Record<string, string> = { entity_id: cal, summary: d.title };
      if (d.location) data.location = d.location;
      if (names.length) data.description = whoLine(names);
      if (d.allDay || !d.start) {
        data.start_date = d.date;
        data.end_date = format(addDays(parseISO(d.date), 1), 'yyyy-MM-dd');
      } else {
        const end = d.end && d.end > d.start ? d.end : `${String(Math.min(23, Number(d.start.slice(0, 2)) + 1)).padStart(2, '0')}:${d.start.slice(3, 5)}`;
        data.start_date_time = `${d.date} ${d.start}:00`;
        data.end_date_time = `${d.date} ${end}:00`;
      }
      try {
        await api.service('calendar', 'create_event', data);
        ok++;
      } catch (e) {
        toast(`${d.title}: ${(e as Error).message}`);
      }
    }
    if (ok) toast(t('Added {n} events', { n: ok }), 'info');
    onDone();
  };

  const upd = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds!.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  return (
    <Modal
      title={<span><Sparkles size={20} /> {t('Magic Import')}</span>}
      onClose={onClose}
      wide
      footer={
        drafts?.length ? (
          <>
            <button className="btn ghost" onClick={() => setDrafts(null)}>{t('Back')}</button>
            <button className="btn primary" onClick={add} disabled={!cal || !drafts.some((d) => d.on)}>
              {t('Add {n} events', { n: drafts.filter((d) => d.on).length })}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>{t('Cancel')}</button>
            <button className="btn primary" onClick={find} disabled={busy || (!text.trim() && !file)}>
              <Sparkles size={18} /> {busy ? t('Reading…') : t('Find events')}
            </button>
          </>
        )
      }
    >
      {!drafts?.length ? (
        <div className="form">
          <p className="muted" style={{ margin: 0 }}>{t('Snap a school flyer or invitation, or paste an email. Hearth’s AI finds the dates for you to check.')}</p>
          <div className="row">
            <button className="btn" onClick={() => input.current?.click()}>
              <Camera size={18} /> {file ? file.name : t('Photo of a flyer')}
            </button>
            {file && <button className="link" onClick={() => setFile(null)}>{t('Remove')}</button>}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <textarea rows={6} placeholder={t('…or paste text from an email or website')} value={text} onChange={(e) => setText(e.target.value)} />
          {err && <p className="error">{err}</p>}
        </div>
      ) : (
        <div className="form">
          <div className="drafts">
            {drafts.map((d, i) => (
              <div key={i} className={`draft ${d.on ? '' : 'off'}`}>
                <input type="checkbox" checked={d.on} onChange={(e) => upd(i, { on: e.target.checked })} />
                <div className="grow draft-fields">
                  <input value={d.title} onChange={(e) => upd(i, { title: e.target.value })} />
                  <div className="row">
                    <input type="date" value={d.date} onChange={(e) => upd(i, { date: e.target.value })} />
                    {!d.allDay && <input type="time" value={d.start ?? ''} onChange={(e) => upd(i, { start: e.target.value })} />}
                    {!d.allDay && <input type="time" value={d.end ?? ''} onChange={(e) => upd(i, { end: e.target.value })} />}
                    <label className="row small"><input type="checkbox" checked={d.allDay} onChange={(e) => upd(i, { allDay: e.target.checked })} /> {t('All day')}</label>
                  </div>
                  {d.location && <span className="muted small">📍 {d.location}</span>}
                </div>
              </div>
            ))}
          </div>
          <label>
            {t('Calendar')}
            <div className="chips">
              {usable.map((c) => (
                <button key={c.entity_id} className={`chip ${cal === c.entity_id ? 'on' : ''}`}
                  style={cal === c.entity_id ? { background: colorOf(c.entity_id), borderColor: colorOf(c.entity_id) } : {}}
                  onClick={() => setCal(c.entity_id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </label>
          {members.length > 0 && (
            <label>
              {t('Who’s going?')}
              <div className="chips">
                {members.map((m) => {
                  const on = people.includes(m.id);
                  return (
                    <button key={m.id} className={`chip person ${on ? 'on' : ''}`} style={on ? { background: m.color, borderColor: m.color } : {}}
                      onClick={() => setPeople(on ? people.filter((x) => x !== m.id) : [...people, m.id])}>
                      <Avatar m={m} size="xs" /> {m.name}
                    </button>
                  );
                })}
              </div>
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
