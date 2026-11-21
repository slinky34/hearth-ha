import { useState } from 'react';
import { format } from '../lib/i18n';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True during the sleep window (handles windows that cross midnight). */
export function inSleepWindow(now: Date, start: string, end: string) {
  const n = now.getHours() * 60 + now.getMinutes();
  const s = minutes(start);
  const e = minutes(end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

/** Night mode: dims the display to a faint clock (or black). A tap wakes it for 5 minutes. */
export function SleepOverlay() {
  const { sleep, clock24 } = useStore().data.settings;
  const now = useNow(30000);
  const [wokeUntil, setWokeUntil] = useState(0);
  if (!sleep.enabled || !inSleepWindow(now, sleep.start, sleep.end) || Date.now() < wokeUntil) return null;
  return (
    <div
      className={`sleep-overlay ${sleep.mode}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setWokeUntil(Date.now() + 5 * 60000);
      }}
    >
      {sleep.mode === 'dim' && <div className="sleep-clock">{format(now, clock24 ? 'HH:mm' : 'h:mm')}</div>}
    </div>
  );
}
