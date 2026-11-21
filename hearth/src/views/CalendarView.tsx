import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { CalEvent } from '../lib/types';
import { dateKey, fmtShortTime, fmtTime, tint } from '../lib/util';
import { useWeather, weatherIcon } from '../lib/weather';

type ViewMode = 'day' | 'week' | 'month';

const overlapsDay = (e: CalEvent, d: Date) => e.start < addDays(startOfDay(d), 1) && e.end > startOfDay(d);

export function CalendarView() {
  const { data } = useStore();
  const { visibleCalendars, calendars, error: haError } = useHa();
  const { weekStartsOn } = data.settings;
  const [mode, setMode] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [picked, setPicked] = useState<CalEvent | null>(null);
  const [adding, setAdding] = useState(false);

  const range = useMemo(() => {
    if (mode === 'day') return { start: cursor, end: addDays(cursor, 1) };
    if (mode === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn });
      return { start, end: addDays(start, 7) };
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn });
    return { start, end: startOfDay(addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn }), 1)) };
  }, [mode, cursor, weekStartsOn]);

  const { events, error, loading, reload } = useEvents(visibleCalendars, range.start, range.end);

  const step = (dir: 1 | -1) =>
    setCursor((c) => (mode === 'day' ? addDays(c, dir) : mode === 'week' ? addWeeks(c, dir) : addMonths(c, dir)));

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
    if (mode === 'day') return format(cursor, 'EEEE, MMMM d');
    if (mode === 'month') return format(cursor, 'MMMM yyyy');
    const last = addDays(range.start, 6);
    return `${format(range.start, 'MMM d')} – ${format(last, isSameMonth(range.start, last) ? 'd' : 'MMM d')}, ${format(last, 'yyyy')}`;
  })();

  const openDay = (d: Date) => {
    setCursor(startOfDay(d));
    setMode('day');
  };

  return (
    <div className="calendar">
      <div className="view-head">
        <div className="nav-group">
          <button className="btn ghost" onClick={() => setCursor(startOfDay(new Date()))}>
            Today
          </button>
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft />
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
            <ChevronRight />
          </button>
          <h1>{title}</h1>
          {loading && <RefreshCw className="spin muted" size={18} />}
        </div>
        <div className="nav-group">
          <div className="segmented">
            {(['day', 'week', 'month'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={() => setAdding(true)} disabled={calendars.length === 0}>
            <Plus size={20} /> Event
          </button>
        </div>
      </div>

      {(haError || error) && (
        <div className="banner" onClick={reload}>
          {haError ? `Home Assistant: ${haError}` : error} · tap to retry
        </div>
      )}

      <div className="calendar-body" onPointerDown={onDown} onPointerUp={onUp}>
        {mode === 'week' && <WeekView start={range.start} events={events} onPick={setPicked} onDay={openDay} />}
        {mode === 'month' && (
          <MonthView start={range.start} end={range.end} cursor={cursor} events={events} onPick={setPicked} onDay={openDay} />
        )}
        {mode === 'day' && <DayView day={cursor} events={events} onPick={setPicked} />}
      </div>

      {picked && <EventDetail event={picked} onClose={() => setPicked(null)} />}
      {adding && (
        <AddEvent
          defaultDate={mode === 'day' ? cursor : new Date()}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
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

function EventCard({ e, onPick, compact }: { e: CalEvent; onPick: (e: CalEvent) => void; compact?: boolean }) {
  const { colorOf } = useHa();
  const { clock24 } = useStore().data.settings;
  const color = colorOf(e.calendar);
  if (e.allDay)
    return (
      <button className="ev-allday" style={{ background: color }} onClick={() => onPick(e)}>
        {e.title}
      </button>
    );
  if (compact)
    return (
      <button className="ev-compact" onClick={() => onPick(e)}>
        <i style={{ background: color }} />
        <span className="ev-time">{fmtShortTime(e.start, clock24)}</span> {e.title}
      </button>
    );
  return (
    <button
      className={`ev-card ${e.end < new Date() ? 'past' : ''}`}
      style={{ background: tint(color, 0.16), borderLeftColor: color }}
      onClick={() => onPick(e)}
    >
      <span className="ev-time">
        {fmtShortTime(e.start, clock24)} – {fmtShortTime(e.end, clock24)}
      </span>
      <span className="ev-title">{e.title}</span>
      {e.location && <span className="ev-loc">{e.location}</span>}
    </button>
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
              {dayEvents.filter((e) => e.allDay).map((e) => <EventCard key={e.id} e={e} onPick={onPick} />)}
              {dayEvents.filter((e) => !e.allDay).map((e) => <EventCard key={e.id} e={e} onPick={onPick} />)}
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
              {sorted.slice(0, 3).map((e) => <EventCard key={e.id} e={e} onPick={onPick} compact />)}
              {sorted.length > 3 && (
                <button className="more" onClick={() => onDay(d)}>
                  +{sorted.length - 3} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const HOUR = 64;

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

function DayView({ day, events, onPick }: ViewProps & { day: Date }) {
  const { colorOf } = useHa();
  const { settings, meals } = useStore().data;
  const now = useNow(60000);
  const scroller = useRef<HTMLDivElement>(null);
  const dayEvents = events.filter((e) => overlapsDay(e, day));
  const allDay = dayEvents.filter((e) => e.allDay);
  const placed = layoutDay(dayEvents.filter((e) => !e.allDay), day);
  const meal = meals[dateKey(day)];
  const s0 = startOfDay(day).getTime();

  useEffect(() => {
    const h = isSameDay(day, new Date()) ? Math.max(0, new Date().getHours() - 1) : settings.dayStartHour;
    scroller.current?.scrollTo({ top: h * HOUR });
  }, [day, settings.dayStartHour]);

  return (
    <div className="day">
      {(allDay.length > 0 || meal) && (
        <div className="day-top">
          {allDay.map((e) => <EventCard key={e.id} e={e} onPick={onPick} />)}
          {meal &&
            (['breakfast', 'lunch', 'dinner'] as const)
              .filter((k) => meal[k])
              .map((k) => (
                <span key={k} className="meal-pill">
                  {k === 'breakfast' ? '🥣' : k === 'lunch' ? '🥪' : '🍽️'} {meal[k]}
                </span>
              ))}
        </div>
      )}
      <div className="day-grid" ref={scroller}>
        <div className="day-inner" style={{ height: 24 * HOUR }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="hour" style={{ top: h * HOUR }}>
              <span>{h === 0 ? '' : fmtShortTime(new Date(2000, 0, 1, h), settings.clock24)}</span>
            </div>
          ))}
          <div className="day-events">
            {placed.map(({ e, s, en, col, cols }) => {
              const color = colorOf(e.calendar);
              return (
                <button
                  key={e.id}
                  className="ev-block"
                  style={{
                    top: ((s - s0) / 3600000) * HOUR,
                    height: Math.max(((en - s) / 3600000) * HOUR - 3, 26),
                    left: `${(col / cols) * 100}%`,
                    width: `calc(${100 / cols}% - 6px)`,
                    background: tint(color, 0.18),
                    borderLeftColor: color,
                  }}
                  onClick={() => onPick(e)}
                >
                  <span className="ev-title">{e.title}</span>
                  <span className="ev-time">
                    {fmtShortTime(e.start, settings.clock24)} – {fmtShortTime(e.end, settings.clock24)}
                    {e.location ? ` · ${e.location}` : ''}
                  </span>
                </button>
              );
            })}
            {isSameDay(day, now) && (
              <div className="now-line" style={{ top: ((now.getTime() - s0) / 3600000) * HOUR }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventDetail({ event: e, onClose }: { event: CalEvent; onClose: () => void }) {
  const { colorOf, calendars } = useHa();
  const { members, settings } = useStore().data;
  const cal = calendars.find((c) => c.entity_id === e.calendar);
  const who = members.filter((m) => m.calendars.includes(e.calendar));
  const lastDay = addDays(e.end, -1);
  return (
    <Modal title={e.title} onClose={onClose}>
      <div className="detail">
        <p>
          <Clock size={18} />
          {e.allDay
            ? isSameDay(e.start, lastDay)
              ? format(e.start, 'EEEE, MMMM d') + ' · All day'
              : `${format(e.start, 'EEE, MMM d')} – ${format(lastDay, 'EEE, MMM d')}`
            : `${format(e.start, 'EEEE, MMMM d')} · ${fmtTime(e.start, settings.clock24)} – ${fmtTime(e.end, settings.clock24)}`}
        </p>
        {e.location && (
          <p>
            <MapPin size={18} />
            {e.location}
          </p>
        )}
        <p>
          <i className="dot" style={{ background: colorOf(e.calendar) }} />
          {cal?.name ?? e.calendar}
          {who.length > 0 && <span className="muted"> · {who.map((m) => m.name).join(', ')}</span>}
        </p>
        {e.description && <p className="desc">{e.description}</p>}
      </div>
    </Modal>
  );
}

export function AddEvent({ defaultDate, onClose, onCreated }: { defaultDate: Date; onClose: () => void; onCreated: () => void }) {
  const { calendars, selected, colorOf } = useHa();
  const { members, settings } = useStore().data;
  const preferred =
    members.find((m) => selected.includes(m.id))?.calendars[0] ??
    calendars.find((c) => !settings.hiddenCalendars.includes(c.entity_id))?.entity_id ??
    '';
  const [title, setTitle] = useState('');
  const [cal, setCal] = useState(preferred);
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const nextHour = new Date().getHours() + 1;
  const [startT, setStartT] = useState(`${String(Math.min(nextHour, 22)).padStart(2, '0')}:00`);
  const [endT, setEndT] = useState(`${String(Math.min(nextHour + 1, 23)).padStart(2, '0')}:00`);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr('Give the event a name.');
    const data: Record<string, string> = { entity_id: cal, summary: title.trim() };
    if (location.trim()) data.location = location.trim();
    if (allDay) {
      if (endDate < date) return setErr('End date is before the start date.');
      data.start_date = date;
      data.end_date = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
    } else {
      if (endT <= startT) return setErr('End time must be after the start time.');
      data.start_date_time = `${date} ${startT}:00`;
      data.end_date_time = `${date} ${endT}:00`;
    }
    setBusy(true);
    try {
      await api.service('calendar', 'create_event', data);
      onCreated();
    } catch (e) {
      setErr(`Couldn’t create the event: ${(e as Error).message}. Some calendars (like subscribed ICS feeds) are read-only.`);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New event"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Add event'}
          </button>
        </>
      }
    >
      <div className="form">
        <input autoFocus className="big" placeholder="What’s happening?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>
          Calendar
          <div className="chips">
            {calendars
              .filter((c) => !settings.hiddenCalendars.includes(c.entity_id))
              .map((c) => (
                <button
                  key={c.entity_id}
                  className={`chip ${cal === c.entity_id ? 'on' : ''}`}
                  style={cal === c.entity_id ? { background: colorOf(c.entity_id), borderColor: colorOf(c.entity_id) } : {}}
                  onClick={() => setCal(c.entity_id)}
                >
                  {c.name}
                </button>
              ))}
          </div>
        </label>
        <label className="row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className="row">
          <label>
            {allDay ? 'Starts' : 'Date'}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
          </label>
          {allDay ? (
            <label>
              Ends
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          ) : (
            <>
              <label>
                From
                <input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
              </label>
              <label>
                To
                <input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        {err && <p className="error">{err}</p>}
      </div>
    </Modal>
  );
}
