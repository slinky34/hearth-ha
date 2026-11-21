import { addDays, startOfDay } from 'date-fns';
import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { CalEvent, Chore, Member } from '../lib/types';
import { dateKey, dueOn, fmtTime, initials, pastel, stripes } from '../lib/util';
import { AddEvent, EventDetail, MemberStrip } from './CalendarView';
import { t } from '../lib/i18n';

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
  const done = new Set(completions[todayKey] ?? []);
  const toggle = (c: Chore) =>
    set('completions', (prev) => {
      const list = new Set(prev[todayKey] ?? []);
      if (list.has(c.id)) list.delete(c.id);
      else list.add(c.id);
      return { ...prev, [todayKey]: [...list] };
    });

  const card = (e: CalEvent) => {
    const who = members.filter((m) => m.calendars.includes(e.calendar));
    const colors = who.length ? who.map((m) => m.color) : [colorOf(e.calendar)];
    return (
      <button
        key={e.id}
        className={`today-card ${!e.allDay && e.end < now ? 'past' : ''}`}
        style={{ background: colors.length > 1 ? stripes(colors, 0.32) : pastel(colors[0]), borderLeftColor: colors[0] }}
        onClick={() => setPicked(e)}
      >
        <span className="today-cal">{calName(e.calendar)}</span>
        <span className="today-title">{e.title}</span>
        <span className="today-time">
          {e.allDay ? t('All day') : `${fmtTime(e.start, settings.clock24)} - ${fmtTime(e.end, settings.clock24)}`}
          {e.location ? ` · ${e.location}` : ''}
        </span>
      </button>
    );
  };

  const taskRow = (c: Chore, m: Member, showWho: boolean) => {
    const isDone = done.has(c.id);
    return (
      <button key={c.id} className={`today-task ${isDone ? 'done' : ''}`} onClick={() => toggle(c)}>
        <span className="today-check" style={isDone ? { background: m.color, borderColor: m.color } : { borderColor: m.color }}>
          {isDone && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="grow">
          {c.emoji} {c.title}
        </span>
        {showWho && (
          <span className="today-who" style={{ color: m.color }}>
            {m.name}
          </span>
        )}
      </button>
    );
  };

  const fab = (
    <button className="fab" onClick={() => setAdding(true)} aria-label={t('Add event')} disabled={calendars.length === 0}>
      <Plus size={26} />
    </button>
  );
  const modals = (
    <>
      {picked && <EventDetail event={picked} onClose={() => setPicked(null)} />}
      {adding && (
        <AddEvent
          defaultDate={today}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </>
  );

  // Everyone: one column per person, plus a Family column for shared calendars.
  if (selected.length === 0 && members.length > 0) {
    const linked = new Set(members.flatMap((m) => m.calendars));
    const shared = sorted.filter((e) => !linked.has(e.calendar));
    return (
      <div className="today-split-wrap">
        <MemberStrip />
        <div className="today-split">
          {shared.length > 0 && (
            <section className="person-col">
              <header className="person-head">
                <span className="avatar" style={{ background: 'var(--accent)' }}>
                  🏡
                </span>
                <h2>{settings.familyName || t('Family')}</h2>
              </header>
              <div className="person-events">{shared.map(card)}</div>
            </section>
          )}
          {members.map((m) => {
            const mine = sorted.filter((e) => m.calendars.includes(e.calendar));
            const tasks = chores.filter((c) => c.memberId === m.id && dueOn(c, today));
            const n = tasks.filter((c) => done.has(c.id)).length;
            return (
              <section key={m.id} className="person-col" style={{ ['--member' as string]: m.color }}>
                <header className="person-head">
                  <span className="avatar" style={{ background: m.color }}>
                    {initials(m.name)}
                  </span>
                  <h2>{m.name}</h2>
                  {tasks.length > 0 && (
                    <span className="stat-pill">
                      <Check size={13} strokeWidth={3} /> {n}/{tasks.length}
                    </span>
                  )}
                </header>
                <div className="person-events">
                  {mine.map(card)}
                  {!loading && mine.length === 0 && <p className="today-empty small">{t('No events today')}</p>}
                </div>
                {tasks.length > 0 && (
                  <div className="person-tasks">
                    <h3 className="today-label">{t('Tasks')}</h3>
                    {tasks.map((c) => taskRow(c, m, false))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {fab}
        {modals}
      </div>
    );
  }

  // One or more people selected: single timeline + their tasks.
  const shownMembers = members.filter((m) => selected.length === 0 || selected.includes(m.id));
  const tasks = shownMembers.flatMap((m) =>
    chores.filter((c) => c.memberId === m.id && dueOn(c, today)).map((c) => ({ chore: c, member: m })),
  );
  return (
    <div className="today-view">
      <section className="today-main">
        <h2 className="today-heading">{t('Today')}</h2>
        <div className="today-events">
          {sorted.map(card)}
          {!loading && sorted.length === 0 && <p className="today-empty">{t('Nothing on the calendar today.')}</p>}
        </div>
      </section>
      <aside className="today-tasks">
        <h3 className="today-label">{t('Tasks')}</h3>
        {tasks.length === 0 ? (
          <p className="today-empty">{t('No tasks for today — enjoy the free time')}</p>
        ) : (
          <div className="today-task-list">{tasks.map(({ chore, member }) => taskRow(chore, member, shownMembers.length > 1))}</div>
        )}
      </aside>
      {fab}
      {modals}
    </div>
  );
}
