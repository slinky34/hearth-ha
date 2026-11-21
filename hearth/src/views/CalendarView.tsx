import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, endOfWeek, isSameDay, isSameMonth, isToday, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { Modal } from '../components/Modal';
import { api, whoLine } from '../lib/api';
import { toast } from '../components/Toast';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { CalEvent, CalendarViewMode, Member } from '../lib/types';
import { dateKey, dueOn, eventMembers, fmtShortTime, fmtTime, initials, pastel, stripes } from '../lib/util';
import { useWeather, weatherIcon } from '../lib/weather';
import { dateLong, dateMedium, dateShort, format, monthYear, t } from '../lib/i18n';

const overlapsDay = (e: CalEvent, d: Date) => e.start < addDays(startOfDay(d), 1) && e.end > startOfDay(d);

const MODES: { id: CalendarViewMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'grid', label: 'Grid' },
  { id: 'month', label: 'Month' },
];

/** Colors and people for an event: one person = their pastel, several = stripes. */
export function useEventLook() {
  const { members } = useStore().data;
  const { colorOf } = useHa();
  return (e: CalEvent) => {
    const who = eventMembers(e, members);
    const colors = who.length ? who.map((m) => m.color) : [colorOf(e.calendar)];
    const style: CSSProperties = colors.length > 1 ? { background: stripes(colors) } : { background: pastel(colors[0], 0.42) };
    return { who, style, color: colors[0] };
  };
}

export function Badges({ who, max = 3 }: { who: Member[]; max?: number }) {
  if (!who.length) return null;
  return (
    <span className="badges">
      {who.slice(0, max).map((m) => (
        <span key={m.id} className="badge" style={{ background: m.color }} title={m.name}>
          {initials(m.name).slice(0, 1)}
        </span>
      ))}
      {who.length > max && <span className="badge more">+{who.length - max}</span>}
    </span>
  );
}

/** Countdown chips and each person's chore progress for today (tap a person to filter). */
export function MemberStrip() {
  const { members, chores, completions, settings } = useStore().data;
  const { selected, setSelected } = useHa();
  const today = startOfDay(new Date());
  const done = new Set(completions[dateKey(today)] ?? []);
  const countdowns = settings.countdowns
    .map((c) => ({ ...c, days: differenceInCalendarDays(parseISO(c.date), today) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2);
  if (!members.length && !countdowns.length) return null;
  return (
    <div className="member-strip">
      {countdowns.map((c) => (
        <span key={c.id} className="countdown-chip">
          <span className="cd-emoji">{c.emoji || '⏳'}</span> {c.title}{' '}
          <b>{c.days === 0 ? t('today!') : c.days === 1 ? t('1 day') : t('{n} days', { n: c.days })}</b>
        </span>
      ))}
      {members.map((m) => {
        const due = chores.filter((c) => c.memberId === m.id && dueOn(c, today));
        const n = due.filter((c) => done.has(c.id)).length;
        const pct = due.length ? (n / due.length) * 100 : 0;
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            className={`member-chip ${on ? 'on' : ''} ${selected.length && !on ? 'dim' : ''}`}
            style={{
              background: `linear-gradient(to right, ${pastel(m.color, 0.55)} ${pct}%, ${pastel(m.color, 0.2)} ${pct}%)`,
              borderColor: on ? m.color : 'transparent',
            }}
            onClick={() => setSelected(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])}
          >
            <span className="badge" style={{ background: m.color }}>
              {initials(m.name).slice(0, 1)}
            </span>
            {m.name} <span className="chip-count">{n}/{due.length}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarView() {
  const { data } = useStore();
  const { visibleCalendars, calendars, selected, error: haError } = useHa();
  const { weekStartsOn, gridDays } = data.settings;
  const [mode, setMode] = useState<CalendarViewMode>(data.settings.calendarView);
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [picked, setPicked] = useState<CalEvent | null>(null);
  const [addOn, setAddOn] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (mode === 'day') return { start: cursor, end: addDays(cursor, 1) };
    if (mode === 'grid' && gridDays === 5) return { start: cursor, end: addDays(cursor, 5) };
    if (mode !== 'month') {
      const start = startOfWeek(cursor, { weekStartsOn });
      return { start, end: addDays(start, 7) };
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn });
    return { start, end: startOfDay(addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn }), 1)) };
  }, [mode, cursor, weekStartsOn, gridDays]);

  const { events: allEvents, error, loading, reload } = useEvents(visibleCalendars, range.start, range.end);
  // With people selected, hide shared-calendar events tagged only for someone else.
  const events = selected.length
    ? allEvents.filter((e) => {
        const w = eventMembers(e, data.members);
        return w.length === 0 || w.some((m) => selected.includes(m.id));
      })
    : allEvents;

  const step = (dir: 1 | -1) =>
    setCursor((c) =>
      mode === 'day' ? addDays(c, dir) : mode === 'month' ? addMonths(c, dir) : mode === 'grid' && gridDays === 5 ? addDays(c, 5 * dir) : addWeeks(c, dir),
    );

  // Horizontal swipe to change period on touch screens.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: RPointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onUp = (e: RPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 90 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };

  const title = (() => {
    if (mode === 'day') return dateLong(cursor);
    if (mode === 'month') return monthYear(cursor);
    const last = addDays(range.end, -1);
    return `${dateShort(range.start)} – ${isSameMonth(range.start, last) ? format(last, 'd') : dateShort(last)}`;
  })();

  const openDay = (d: Date) => {
    setCursor(startOfDay(d));
    setMode('day');
  };
  const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(range.start, i));

  return (
    <div className="calendar">
      <div className="view-head">
        <div className="nav-group">
          <button className="btn ghost" onClick={() => setCursor(startOfDay(new Date()))}>
            {t('Today')}
          </button>
          <button className="icon-btn" onClick={() => step(-1)} aria-label={t('Previous')}>
            <ChevronLeft />
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label={t('Next')}>
            <ChevronRight />
          </button>
          <h1>{title}</h1>
          {loading && <RefreshCw className="spin muted" size={18} />}
        </div>
        <div className="nav-group">
          <div className="segmented">
            {MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <MemberStrip />

      {(haError || error) && (
        <div className="banner" onClick={reload}>
          {haError ? `Home Assistant: ${haError}` : error} · {t('tap to retry')}
        </div>
      )}

      <div className="calendar-body" onPointerDown={onDown} onPointerUp={onUp}>
        {mode === 'week' && <WeekView start={range.start} events={events} onPick={setPicked} onDay={openDay} />}
        {mode === 'schedule' && (
          <ScheduleView
            start={range.start}
            events={events}
            onPick={setPicked}
            onDay={openDay}
            onAdd={(d) => setAddOn(d)}
            onNext={() => step(1)}
          />
        )}
        {mode === 'grid' && <TimeGrid days={days(gridDays === 5 ? 5 : 7)} events={events} onPick={setPicked} />}
        {mode === 'month' && (
          <MonthView start={range.start} end={range.end} cursor={cursor} events={events} onPick={setPicked} onDay={openDay} />
        )}
        {mode === 'day' && <TimeGrid days={[cursor]} events={events} onPick={setPicked} />}
      </div>

      <button
        className="fab"
        onClick={() => setAddOn(mode === 'day' ? cursor : new Date())}
        aria-label={t('Add event')}
        disabled={calendars.length === 0}
      >
        <Plus size={26} />
      </button>

      {picked && <EventDetail event={picked} onClose={() => setPicked(null)} />}
      {addOn && (
        <AddEvent
          defaultDate={addOn}
          onClose={() => setAddOn(null)}
          onCreated={() => {
            setAddOn(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface ViewProps {
  events: CalEvent[];
  onPick: (e: CalEvent) => void;
}

/** Skylight-style event pill: pastel (or striped) with people badges. */
function EventPill({ e, onPick, showTime = true }: { e: CalEvent; onPick: (e: CalEvent) => void; showTime?: boolean }) {
  const look = useEventLook();
  const { clock24 } = useStore().data.settings;
  const { who, style } = look(e);
  return (
    <button className={`ev-pill ${!e.allDay && e.end < new Date() ? 'past' : ''}`} style={style} onClick={() => onPick(e)}>
      <span className="ev-pill-text">
        <span className="ev-title">{e.title}</span>
        {showTime && (
          <span className="ev-time">
            {e.allDay ? t('All day') : `${fmtShortTime(e.start, clock24)} – ${fmtShortTime(e.end, clock24)}`}
          </span>
        )}
      </span>
      <Badges who={who} />
    </button>
  );
}

function CompactEvent({ e, onPick }: { e: CalEvent; onPick: (e: CalEvent) => void }) {
  const look = useEventLook();
  const { clock24 } = useStore().data.settings;
  const { style, color } = look(e);
  if (e.allDay)
    return (
      <button className="ev-allday" style={style} onClick={() => onPick(e)}>
        {e.title}
      </button>
    );
  return (
    <button className="ev-compact" onClick={() => onPick(e)}>
      <i style={{ background: color }} />
      <span className="ev-time">{fmtShortTime(e.start, clock24)}</span> {e.title}
    </button>
  );
}

function DayNum({ d }: { d: Date }) {
  return (
    <span className="day-label">
      {format(d, 'EEE')} <span className={`dnum-inline ${isToday(d) ? 'today' : ''}`}>{format(d, 'd')}</span>
    </span>
  );
}

function WeekView({ start, events, onPick, onDay }: ViewProps & { start: Date; onDay: (d: Date) => void }) {
  const { meals } = useStore().data;
  const weather = useWeather();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = startOfDay(new Date());
  return (
    <div className="week">
      {days.map((d) => {
        const dayEvents = events.filter((e) => overlapsDay(e, d));
        const fc = weather?.forecast.find((f) => f.date === dateKey(d));
        const dinner = meals[dateKey(d)]?.dinner;
        return (
          <div key={d.toISOString()} className={`week-col ${isToday(d) ? 'today' : ''} ${d < today ? 'past' : ''}`}>
            <button className="week-head" onClick={() => onDay(d)}>
              <span className="dow">{format(d, 'EEE')}</span>
              <span className="dnum">{format(d, 'd')}</span>
              {fc && (
                <span className="wx">
                  {weatherIcon(fc.condition)} {fc.high}°
                </span>
              )}
            </button>
            <div className="week-body">
              {dayEvents.filter((e) => e.allDay).map((e) => <EventPill key={e.id} e={e} onPick={onPick} />)}
              {dayEvents.filter((e) => !e.allDay).map((e) => <EventPill key={e.id} e={e} onPick={onPick} />)}
            </div>
            {dinner && (
              <div className="meal-foot" title="Dinner">
                🍽️ <span>{dinner}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleView({
  start, events, onPick, onDay, onAdd, onNext,
}: ViewProps & { start: Date; onDay: (d: Date) => void; onAdd: (d: Date) => void; onNext: () => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = startOfDay(new Date());
  return (
    <div className="schedule">
      {days.map((d) => {
        const dayEvents = events.filter((e) => overlapsDay(e, d));
        const sorted = [...dayEvents.filter((e) => e.allDay), ...dayEvents.filter((e) => !e.allDay)];
        return (
          <section key={d.toISOString()} className={`sched-day ${d < today ? 'past' : ''}`}>
            <header>
              <button className="sched-title" onClick={() => onDay(d)}>
                <DayNum d={d} />
              </button>
              <div className="sched-sub">
                <span className="muted">
                  {sorted.length === 1 ? t('1 event') : t('{n} events', { n: sorted.length })}
                </span>
                <button className="link add-link" onClick={() => onAdd(d)}>
                  + {t('Add event')}
                </button>
              </div>
            </header>
            <div className="sched-events">
              {sorted.map((e) => <EventPill key={e.id} e={e} onPick={onPick} />)}
            </div>
          </section>
        );
      })}
      <button className="sched-day next-week" onClick={onNext}>
        <span className="day-label">{t('Next week')}</span>
        <span className="muted">
          {dateShort(addDays(start, 7))} – {dateShort(addDays(start, 13))}
        </span>
      </button>
    </div>
  );
}

function MonthView({
  start, end, cursor, events, onPick, onDay,
}: ViewProps & { start: Date; end: Date; cursor: Date; onDay: (d: Date) => void }) {
  const days: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return (
    <div className="month">
      {days.slice(0, 7).map((d) => (
        <div key={'h' + d.getDay()} className="month-dow">
          {format(d, 'EEE')}
        </div>
      ))}
      {days.map((d) => {
        const dayEvents = events.filter((e) => overlapsDay(e, d));
        const sorted = [...dayEvents.filter((e) => e.allDay), ...dayEvents.filter((e) => !e.allDay)];
        return (
          <div
            key={d.toISOString()}
            className={`month-cell ${isSameMonth(d, cursor) ? '' : 'other'} ${isToday(d) ? 'today' : ''}`}
            onClick={() => onDay(d)}
          >
            <span className="dnum">{format(d, 'd')}</span>
            <div className="month-events" onClick={(ev) => ev.stopPropagation()}>
              {sorted.slice(0, 3).map((e) => <CompactEvent key={e.id} e={e} onPick={onPick} />)}
              {sorted.length > 3 && (
                <button className="more" onClick={() => onDay(d)}>
                  {t('+{n} more', { n: sorted.length - 3 })}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const HOUR = 62;

function layoutDay(timed: CalEvent[], day: Date) {
  const s0 = startOfDay(day).getTime();
  const e0 = addDays(startOfDay(day), 1).getTime();
  const items = timed
    .map((e) => ({ e, s: Math.max(e.start.getTime(), s0), en: Math.min(Math.max(e.end.getTime(), e.start.getTime() + 20 * 60000), e0) }))
    .sort((a, b) => a.s - b.s || b.en - a.en);
  const out: ((typeof items)[number] & { col: number; cols: number })[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols: number[] = [];
    const placed = cluster.map((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) c = cols.push(it.en) - 1;
      else cols[c] = it.en;
      return { ...it, col: c };
    });
    placed.forEach((p) => out.push({ ...p, cols: cols.length }));
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = cluster.length === 1 ? it.en : Math.max(clusterEnd, it.en);
  }
  if (cluster.length) flush();
  return out;
}

/** Hour grid for one or more days, with an all-day row on top. */
function TimeGrid({ days, events, onPick }: ViewProps & { days: Date[] }) {
  const { settings, meals } = useStore().data;
  const look = useEventLook();
  const now = useNow(60000);
  const scroller = useRef<HTMLDivElement>(null);
  const single = days.length === 1;
  const cols = `64px repeat(${days.length}, minmax(${single ? 200 : 120}px, 1fr))`;
  const showsToday = days.some((d) => isSameDay(d, new Date()));

  useEffect(() => {
    const h = showsToday ? Math.max(0, new Date().getHours() - 1) : settings.dayStartHour;
    scroller.current?.scrollTo({ top: h * HOUR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime(), settings.dayStartHour]);

  const meal = single ? meals[dateKey(days[0])] : undefined;

  return (
    <div className="tgrid">
      <div className="tgrid-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const allDay = events.filter((e) => e.allDay && overlapsDay(e, d));
          return (
            <div key={d.toISOString()} className="tgrid-day">
              {!single && <DayNum d={d} />}
              {allDay.map((e) => (
                <button key={e.id} className="ev-allday" style={look(e).style} onClick={() => onPick(e)}>
                  {e.title}
                </button>
              ))}
              {meal &&
                (['breakfast', 'lunch', 'dinner'] as const)
                  .filter((k) => meal[k])
                  .map((k) => (
                    <span key={k} className="meal-pill">
                      {k === 'breakfast' ? '🥣' : k === 'lunch' ? '🥪' : '🍽️'} {meal[k]}
                    </span>
                  ))}
            </div>
          );
        })}
      </div>
      <div className="tgrid-scroll" ref={scroller}>
        <div className="tgrid-body" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="tgrid-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {h === 0 ? '' : fmtShortTime(new Date(2000, 0, 1, h), settings.clock24)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const s0 = startOfDay(d).getTime();
            const placed = layoutDay(events.filter((e) => !e.allDay && overlapsDay(e, d)), d);
            return (
              <div key={d.toISOString()} className={`tgrid-col ${isToday(d) ? 'today' : ''}`}>
                {Array.from({ length: 24 }, (_, h) => (
                  <i key={h} className="hline" style={{ top: h * HOUR }} />
                ))}
                {placed.map(({ e, s, en, col, cols: n }) => {
                  const { who, style } = look(e);
                  const short = en - s < 50 * 60000;
                  return (
                    <button
                      key={e.id}
                      className={`ev-block ${short ? 'short' : ''} ${e.end < now ? 'past' : ''}`}
                      style={{
                        ...style,
                        top: ((s - s0) / 3600000) * HOUR + 1,
                        height: Math.max(((en - s) / 3600000) * HOUR - 3, 24),
                        left: `calc(${(col / n) * 100}% + 2px)`,
                        width: `calc(${100 / n}% - 5px)`,
                      }}
                      onClick={() => onPick(e)}
                    >
                      <span className="ev-title">{e.title}</span>
                      <span className="ev-time">
                        {fmtShortTime(e.start, settings.clock24)} – {fmtShortTime(e.end, settings.clock24)}
                      </span>
                      <Badges who={who} max={2} />
                    </button>
                  );
                })}
                {isSameDay(d, now) && <div className="now-line" style={{ top: ((now.getTime() - s0) / 3600000) * HOUR }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EventDetail({ event: e, onClose }: { event: CalEvent; onClose: () => void }) {
  const { colorOf, calendars } = useHa();
  const { members, settings } = useStore().data;
  const who = eventMembers(e, members);
  const lastDay = addDays(e.end, -1);
  return (
    <Modal title={e.title} onClose={onClose}>
      <div className="detail">
        <p>
          <Clock size={18} />
          {e.allDay
            ? isSameDay(e.start, lastDay)
              ? dateLong(e.start) + ' · ' + t('All day')
              : `${dateMedium(e.start)} – ${dateMedium(lastDay)}`
            : `${dateLong(e.start)} · ${fmtTime(e.start, settings.clock24)} – ${fmtTime(e.end, settings.clock24)}`}
        </p>
        {e.location && (
          <p>
            <MapPin size={18} />
            {e.location}
          </p>
        )}
        <p>
          <i className="dot" style={{ background: colorOf(e.calendar) }} />
          {e.calendars.map((c) => calendars.find((x) => x.entity_id === c)?.name ?? c).join(', ')}
        </p>
        {who.length > 0 && (
          <p className="who-row">
            {who.map((m) => (
              <span key={m.id} className="member-chip" style={{ background: pastel(m.color, 0.45) }}>
                <span className="badge" style={{ background: m.color }}>{initials(m.name).slice(0, 1)}</span>
                {m.name}
              </span>
            ))}
          </p>
        )}
        {e.description && <p className="desc">{e.description}</p>}
      </div>
    </Modal>
  );
}

export function AddEvent({ defaultDate, onClose, onCreated }: { defaultDate: Date; onClose: () => void; onCreated: () => void }) {
  const { calendars, selected, colorOf } = useHa();
  const { members, settings } = useStore().data;
  const usable = calendars.filter((c) => !settings.hiddenCalendars.includes(c.entity_id));
  const preferred = members.find((m) => selected.includes(m.id))?.calendars[0] ?? usable[0]?.entity_id;
  const [title, setTitle] = useState('');
  const [cals, setCals] = useState<string[]>(preferred ? [preferred] : []);
  const [people, setPeople] = useState<string[]>(selected);
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const nextHour = new Date().getHours() + 1;
  const [startT, setStartT] = useState(`${String(Math.min(nextHour, 22)).padStart(2, '0')}:00`);
  const [endT, setEndT] = useState(`${String(Math.min(nextHour + 1, 23)).padStart(2, '0')}:00`);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // People already covered by a chosen calendar don't need tagging.
  const coveredByCalendar = (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    return !!m && m.calendars.some((c) => cals.includes(c));
  };

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr(t('Give the event a name.'));
    if (!cals.length) return setErr(t('Pick at least one calendar.'));
    const base: Record<string, string> = { summary: title.trim() };
    if (location.trim()) base.location = location.trim();
    const tagged = members.filter((m) => people.includes(m.id) && !coveredByCalendar(m.id)).map((m) => m.name);
    if (tagged.length) base.description = whoLine(tagged);
    if (allDay) {
      if (endDate < date) return setErr(t('End date is before the start date.'));
      base.start_date = date;
      base.end_date = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
    } else {
      if (endT <= startT) return setErr(t('End time must be after the start time.'));
      base.start_date_time = `${date} ${startT}:00`;
      base.end_date_time = `${date} ${endT}:00`;
    }
    setBusy(true);
    const failed: string[] = [];
    let lastError = '';
    for (const cal of cals) {
      try {
        await api.service('calendar', 'create_event', { entity_id: cal, ...base });
      } catch (e) {
        failed.push(calendars.find((c) => c.entity_id === cal)?.name ?? cal);
        lastError = (e as Error).message;
      }
    }
    if (failed.length === cals.length) {
      setErr(t('Couldn’t create the event: {error}. Some calendars (like subscribed ICS feeds) are read-only.', { error: lastError }));
      setBusy(false);
      return;
    }
    if (failed.length) toast(t('Not added to: {names}', { names: failed.join(', ') }));
    onCreated();
  };

  return (
    <Modal
      title={t('New event')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? t('Saving…') : t('Add event')}
          </button>
        </>
      }
    >
      <div className="form">
        <input autoFocus className="big" placeholder={t('What’s happening?')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>
          <span>
            {t('Calendars')} <span className="muted small">· {t('pick one or more')}</span>
          </span>
          <div className="chips">
            {usable.map((c) => {
              const on = cals.includes(c.entity_id);
              return (
                <button
                  key={c.entity_id}
                  className={`chip ${on ? 'on' : ''}`}
                  style={on ? { background: colorOf(c.entity_id), borderColor: colorOf(c.entity_id) } : {}}
                  onClick={() => toggle(cals, setCals, c.entity_id)}
                  aria-pressed={on}
                >
                  {on && '✓ '}
                  {c.name}
                </button>
              );
            })}
          </div>
        </label>
        {members.length > 0 && (
          <label>
            {t('Who’s going?')}
            <div className="chips">
              {members.map((m) => {
                const viaCal = coveredByCalendar(m.id);
                const on = viaCal || people.includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`chip person ${on ? 'on' : ''}`}
                    style={on ? { background: m.color, borderColor: m.color } : {}}
                    onClick={() => !viaCal && toggle(people, setPeople, m.id)}
                    title={viaCal ? t('Included through their calendar') : undefined}
                    aria-pressed={on}
                  >
                    <span className="badge" style={{ background: m.color }}>
                      {initials(m.name).slice(0, 1)}
                    </span>
                    {m.name}
                  </button>
                );
              })}
            </div>
          </label>
        )}
        <label className="row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {t('All day')}
        </label>
        <div className="row">
          <label>
            {allDay ? t('Starts') : t('Date')}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
          </label>
          {allDay ? (
            <label>
              {t('Ends')}
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          ) : (
            <>
              <label>
                {t('From')}
                <input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
              </label>
              <label>
                {t('To')}
                <input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <LocationInput value={location} onChange={setLocation} />
        {err && <p className="error">{err}</p>}
      </div>
    </Modal>
  );
}

/** Location box with place suggestions (looked up by the add-on). */
function LocationInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hits, setHits] = useState<{ label: string; sub?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const picked = useRef('');
  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === picked.current) return setHits([]);
    const id = setTimeout(() => {
      fetch(`api/places?${new URLSearchParams({ q })}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((l) => {
          setHits(l);
          setOpen(true);
        })
        .catch(() => setHits([]));
    }, 350);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <div className="location-box">
      <label className="search-box">
        <MapPin size={18} />
        <input
          placeholder={t('Location (optional)')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </label>
      {open && hits.length > 0 && (
        <div className="picker-results">
          {hits.map((h, i) => (
            <button
              key={i}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                const v = h.sub ? `${h.label}, ${h.sub}` : h.label;
                picked.current = v;
                onChange(v);
                setHits([]);
                setOpen(false);
              }}
            >
              <b>{h.label}</b>
              {h.sub && <span className="muted small">{h.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
