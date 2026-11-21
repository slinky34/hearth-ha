import { Pause, Play, Plus, Timer as TimerIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { useNow } from '../lib/hooks';
import { alarmChime } from '../lib/sound';
import { useStore } from '../lib/store';
import type { Timer } from '../lib/types';
import { uid } from '../lib/util';
import { Modal } from './Modal';

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
const LABELS: [string, string][] = [
  ['🍝', 'Pasta'], ['🍪', 'Oven'], ['📚', 'Homework'], ['📱', 'Screen time'], ['🛁', 'Bath'], ['🦷', 'Brush teeth'], ['🧘', 'Quiet time'],
];

export const leftOf = (tm: Timer, now: number) => (tm.pausedLeft != null ? tm.pausedLeft : Math.max(0, tm.endsAt - now));
export const isDone = (tm: Timer, now: number) => tm.pausedLeft == null && tm.endsAt <= now;

export function fmtLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function useTimers() {
  const { data, set } = useStore();
  const timers = data.timers;
  const update = (id: string, fn: (tm: Timer) => Timer | null) =>
    set('timers', (prev) => prev.map((tm) => (tm.id === id ? fn(tm) : tm)).filter(Boolean) as Timer[]);
  return {
    timers,
    start: (label: string, emoji: string, minutes: number) => {
      const duration = Math.round(minutes * 60000);
      set('timers', (prev) => [...prev, { id: uid(), label, emoji, duration, endsAt: Date.now() + duration }]);
    },
    pause: (id: string) => update(id, (tm) => ({ ...tm, pausedLeft: Math.max(0, tm.endsAt - Date.now()) })),
    resume: (id: string) => update(id, (tm) => ({ ...tm, endsAt: Date.now() + (tm.pausedLeft ?? 0), pausedLeft: undefined })),
    addMinute: (id: string) =>
      update(id, (tm) =>
        tm.pausedLeft != null
          ? { ...tm, pausedLeft: tm.pausedLeft + 60000 }
          : { ...tm, endsAt: Math.max(tm.endsAt, Date.now()) + 60000 },
      ),
    cancel: (id: string) => update(id, () => null),
  };
}

/** Running-timer chips plus a timer button, for the top bar. */
export function TimerChips() {
  const { timers } = useTimers();
  const now = useNow(timers.length ? 1000 : 60000).getTime();
  const [open, setOpen] = useState(false);
  return (
    <>
      {timers
        .filter((tm) => !isDone(tm, now))
        .map((tm) => {
          const pct = 1 - leftOf(tm, now) / tm.duration;
          return (
            <button key={tm.id} className={`timer-chip ${tm.pausedLeft != null ? 'paused' : ''}`} onClick={() => setOpen(true)}
              style={{ background: `linear-gradient(to right, var(--timer-fill) ${pct * 100}%, var(--surface) ${pct * 100}%)` }}>
              <span>{tm.emoji || '⏱️'}</span>
              <b>{fmtLeft(leftOf(tm, now))}</b>
            </button>
          );
        })}
      <button className="icon-btn timer-btn" onClick={() => setOpen(true)} aria-label={t('Timers')}>
        <TimerIcon size={22} />
      </button>
      {open && <TimerSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function TimerSheet({ onClose }: { onClose: () => void }) {
  const { timers, start, pause, resume, addMinute, cancel } = useTimers();
  const now = useNow(1000).getTime();
  const [label, setLabel] = useState<[string, string]>(['⏱️', '']);
  const [custom, setCustom] = useState('');
  const go = (minutes: number) => {
    if (!(minutes > 0)) return;
    start(label[1].trim() || t('Timer'), label[0], minutes);
    setCustom('');
  };
  return (
    <Modal title={t('Timers')} onClose={onClose} wide>
      <div className="timer-sheet">
        <div className="form">
          <label>
            {t('What for?')}
            <div className="chips">
              {LABELS.map(([e, l]) => (
                <button key={l} className={`chip ${label[1] === t(l) ? 'on' : ''}`} onClick={() => setLabel([e, t(l)])}>
                  {e} {t(l)}
                </button>
              ))}
            </div>
            <input placeholder={t('Or type a name')} value={label[1]} onChange={(e) => setLabel(['⏱️', e.target.value])} />
          </label>
          <label>
            {t('Start a timer')}
            <div className="preset-grid">
              {PRESETS.map((m) => (
                <button key={m} className="preset" onClick={() => go(m)}>
                  <b>{m}</b>
                  <span>{t('min')}</span>
                </button>
              ))}
            </div>
          </label>
          <form className="add-row" onSubmit={(e) => { e.preventDefault(); go(Number(custom)); }}>
            <input type="number" min={0.5} step={0.5} inputMode="decimal" placeholder={t('Minutes')} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn primary" type="submit">
              <Play size={18} /> {t('Start')}
            </button>
          </form>
        </div>
        <div className="timer-list">
          {timers.length === 0 && <p className="muted center">{t('No timers running')}</p>}
          {timers.map((tm) => {
            const left = leftOf(tm, now);
            const done = isDone(tm, now);
            const r = 34;
            const c = 2 * Math.PI * r;
            return (
              <div key={tm.id} className={`timer-row ${done ? 'done' : ''}`}>
                <div className="timer-ring">
                  <svg viewBox="0 0 80 80" width="80" height="80">
                    <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
                    <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(left / tm.duration) * c} ${c}`} transform="rotate(-90 40 40)" />
                  </svg>
                  <span>{tm.emoji || '⏱️'}</span>
                </div>
                <div className="grow">
                  <div className="timer-left">{done ? t('Done!') : fmtLeft(left)}</div>
                  <div className="muted">{tm.label}</div>
                </div>
                {!done && (tm.pausedLeft != null ? (
                  <button className="icon-btn" onClick={() => resume(tm.id)} aria-label={t('Resume')}><Play /></button>
                ) : (
                  <button className="icon-btn" onClick={() => pause(tm.id)} aria-label={t('Pause')}><Pause /></button>
                ))}
                <button className="btn small" onClick={() => addMinute(tm.id)}>
                  <Plus size={14} /> 1 {t('min')}
                </button>
                <button className="icon-btn" onClick={() => cancel(tm.id)} aria-label={t('Cancel')}><X /></button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** Full-screen alarm while any timer has finished; rings until dismissed. */
export function TimerAlarm() {
  const { timers, cancel, addMinute } = useTimers();
  const now = useNow(1000).getTime();
  const done = timers.filter((tm) => isDone(tm, now));
  const ringing = done.length > 0;
  useEffect(() => {
    if (!ringing) return;
    alarmChime();
    const id = setInterval(alarmChime, 2000);
    return () => clearInterval(id);
  }, [ringing]);
  if (!ringing) return null;
  const tm = done[0];
  return (
    <div className="timer-alarm" role="alertdialog">
      <div className="alarm-card">
        <div className="alarm-emoji">{tm.emoji || '⏰'}</div>
        <h2>{t('{name} is done!', { name: tm.label })}</h2>
        {done.length > 1 && <p className="muted">{t('{n} more timers finished', { n: done.length - 1 })}</p>}
        <div className="row">
          <button className="btn" onClick={() => addMinute(tm.id)}>
            <Plus size={18} /> 1 {t('min')}
          </button>
          <button className="btn primary big-btn" onClick={() => cancel(tm.id)}>
            {t('Dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
