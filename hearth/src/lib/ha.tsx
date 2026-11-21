import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { useStore } from './store';
import type { CalEvent, CalendarInfo, EntityInfo } from './types';
import { calendarColor } from './util';

interface HaCtx {
  calendars: CalendarInfo[];
  entities: EntityInfo[];
  error: string | null;
  colorOf: (calendar: string) => string;
  /** Members currently selected in the top-bar filter (empty = everyone). */
  selected: string[];
  setSelected: (ids: string[]) => void;
  /** Calendars to show, after hidden-calendar settings and the member filter. */
  visibleCalendars: CalendarInfo[];
}

const Ctx = createContext<HaCtx | null>(null);

export function HaProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const load = () =>
      Promise.all([api.calendars(), api.entities()])
        .then(([c, e]) => {
          setCalendars(c);
          setEntities(e);
          setError(null);
        })
        .catch((e) => setError(String(e.message || e)));
    load();
    const t = setInterval(load, 10 * 60000);
    return () => clearInterval(t);
  }, []);

  const { members, settings } = data;
  const value = useMemo<HaCtx>(() => {
    const linked = new Set(members.flatMap((m) => m.calendars));
    const chosen = new Set(members.filter((m) => selected.includes(m.id)).flatMap((m) => m.calendars));
    const visibleCalendars = calendars.filter(
      (c) =>
        !settings.hiddenCalendars.includes(c.entity_id) &&
        // Calendars not linked to anyone are "shared" and always shown.
        (selected.length === 0 || chosen.has(c.entity_id) || !linked.has(c.entity_id)),
    );
    return {
      calendars,
      entities,
      error,
      selected,
      setSelected,
      visibleCalendars,
      colorOf: (cal) => calendarColor(cal, members, settings, calendars),
    };
  }, [calendars, entities, error, selected, members, settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHa() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHa outside HaProvider');
  return c;
}

/** Loads events for the given calendars and range; refreshes every 5 minutes. */
export function useEvents(calendars: CalendarInfo[], start: Date, end: Date) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = `${calendars.map((c) => c.entity_id).join(',')}|${start.getTime()}|${end.getTime()}`;

  const load = useCallback(async () => {
    const results = await Promise.allSettled(calendars.map((c) => api.events(c.entity_id, start, end)));
    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    // The same event added to several calendars shows once, belonging to all of them.
    const merged = new Map<string, CalEvent>();
    for (const e of all) {
      const k = `${e.title.trim().toLowerCase()}|${e.start.getTime()}|${e.end.getTime()}|${e.allDay}`;
      const prev = merged.get(k);
      if (!prev) merged.set(k, { ...e });
      else {
        prev.calendars = [...new Set([...prev.calendars, ...e.calendars])];
        prev.people = [...new Set([...prev.people, ...e.people])];
      }
    }
    const ok = [...merged.values()];
    const failed = results.filter((r) => r.status === 'rejected').length;
    setEvents(ok.sort((a, b) => a.start.getTime() - b.start.getTime()));
    setError(failed ? `${failed} calendar${failed > 1 ? 's' : ''} failed to load` : null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 5 * 60000);
    return () => clearInterval(t);
  }, [load]);

  return { events, error, loading, reload: load };
}
