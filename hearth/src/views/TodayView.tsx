import { addDays, startOfDay } from 'date-fns';
import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { CalEvent, Chore } from '../lib/types';
import { dateKey, fmtTime, pastel } from '../lib/util';
import { AddEvent, EventDetail } from './CalendarView';

const dueOn = (c: Chore, d: Date) => c.days.length === 0 || c.days.includes(d.getDay());

export function TodayView() {
  const { data, set } = useStore();
  const { visibleCalendars, calendars, colorOf, selected } = useHa();
  const { members, chores, completions, settings } = data;
  const now = useNow(60000);
  const todayKey = dateKey(now);
  // Re-key on the date so the view rolls over at midnight.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => startOfDay(new Date()), [todayKey]);
  const { events, loading, reload } = useEvents(visibleCalendars, today, addDays(today, 1));
  const [picked, setPicked] = useState<CalEvent | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = [...events.filter((e) => e.allDay), ...events.filter((e) => !e.allDay)];
  const calName = (id: string) => calendars.find((c) => c.entity_id === id)?.name ?? id;

  const shownMembers = members.filter((m) => selected.length === 0 || selected.includes(m.id));
  const tasks = shownMembers.flatMap((m) =>
    chores.filter((c) => c.memberId === m.id && dueOn(c, today)).map((c) => ({ chore: c, member: m })),
  );
  const done = new Set(completions[todayKey] ?? []);
  const toggle = (c: Chore) =>
    set('completions', (prev) => {
      const list = new Set(prev[todayKey] ?? []);
      if (list.has(c.id)) list.delete(c.id);
      else list.add(c.id);
      return { ...prev, [todayKey]: [...list] };
    });

  return (
    <div className="today">
      <section className="today-main">
        <h2 className="today-heading">Today</h2>
        <div className="today-events">
          {sorted.map((e) => {
            const color = colorOf(e.calendar);
            return (
              <button
                key={e.id}
                className={`today-card ${!e.allDay && e.end < now ? 'past' : ''}`}
                style={{ background: pastel(color), borderLeftColor: color }}
                onClick={() => setPicked(e)}
              >
                <span className="today-cal">{calName(e.calendar)}</span>
                <span className="today-title">{e.title}</span>
                <span className="today-time">
                  {e.allDay ? 'All day' : `${fmtTime(e.start, settings.clock24)} - ${fmtTime(e.end, settings.clock24)}`}
                  {e.location ? ` · ${e.location}` : ''}
                </span>
              </button>
            );
          })}
          {!loading && sorted.length === 0 && <p className="today-empty">Nothing on the calendar today.</p>}
        </div>
      </section>

      <aside className="today-tasks">
        <h3 className="today-label">Tasks</h3>
        {tasks.length === 0 ? (
          <p className="today-empty">No tasks for today — enjoy the free time</p>
        ) : (
          <div className="today-task-list">
            {tasks.map(({ chore, member }) => {
              const isDone = done.has(chore.id);
              return (
                <button key={chore.id} className={`today-task ${isDone ? 'done' : ''}`} onClick={() => toggle(chore)}>
                  <span
                    className="today-check"
                    style={isDone ? { background: member.color, borderColor: member.color } : { borderColor: member.color }}
                  >
                    {isDone && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="grow">
                    {chore.emoji} {chore.title}
                  </span>
                  <span className="today-who" style={{ color: member.color }}>
                    {member.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add event" disabled={calendars.length === 0}>
        <Plus size={26} />
      </button>

      {picked && <EventDetail event={picked} onClose={() => setPicked(null)} />}
      {adding && <AddEvent defaultDate={today} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); reload(); }} />}
    </div>
  );
}
