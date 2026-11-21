import { addDays, startOfDay } from 'date-fns';
import { Bell, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEvents, useHa } from '../lib/ha';
import { t } from '../lib/i18n';
import { useNow } from '../lib/hooks';
import { softChime } from '../lib/sound';
import { useStore } from '../lib/store';
import type { CalEvent } from '../lib/types';
import { dateKey, fmtTime } from '../lib/util';

/** On-screen toasts shortly before events start (Settings → Notifications). */
export function Reminders() {
  const { settings } = useStore().data;
  const { visibleCalendars, colorOf } = useHa();
  const now = useNow(30000);
  const key = dateKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => startOfDay(new Date()), [key]);
  const { events } = useEvents(visibleCalendars, today, addDays(today, 2));
  const shown = useRef(new Set<string>());
  const [toasts, setToasts] = useState<CalEvent[]>([]);
  const ahead = settings.notify.eventMinutes;
  const on = settings.notify.screen && ahead > 0;

  useEffect(() => {
    if (!on) return;
    const fresh = events.filter((e) => {
      if (e.allDay || shown.current.has(e.id)) return false;
      const mins = (e.start.getTime() - now.getTime()) / 60000;
      return mins > 0 && mins <= ahead;
    });
    if (!fresh.length) return;
    fresh.forEach((e) => shown.current.add(e.id));
    setToasts((prev) => [...prev, ...fresh]);
    softChime();
    const ids = fresh.map((e) => e.id);
    setTimeout(() => setToasts((prev) => prev.filter((e) => !ids.includes(e.id))), 5 * 60000);
  }, [events, now, on, ahead]);

  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((e) => {
        const mins = Math.max(0, Math.round((e.start.getTime() - Date.now()) / 60000));
        return (
          <div key={e.id} className="toast" style={{ borderLeftColor: colorOf(e.calendar) }}>
            <Bell size={20} />
            <div className="grow">
              <b>{e.title}</b>
              <span className="muted">
                {fmtTime(e.start, settings.clock24)} · {mins === 0 ? t('starting now') : t('in {n} min', { n: mins })}
                {e.location ? ` · ${e.location}` : ''}
              </span>
            </div>
            <button className="icon-btn" onClick={() => setToasts((p) => p.filter((x) => x.id !== e.id))} aria-label={t('Dismiss')}>
              <X size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
