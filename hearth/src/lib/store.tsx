import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { demoData } from './demo';
import type { Mode, Settings, StoreData } from './types';

export const DEFAULT_SETTINGS: Settings = {
  weatherEntity: 'weather.home',
  lists: [],
  screensaverMinutes: 10,
  photoSeconds: 12,
  theme: 'light',
  weekStartsOn: 0,
  clock24: false,
  calendarColors: { 'calendar.family': '#F2A541' },
  hiddenCalendars: [],
  dayStartHour: 7,
};

function normalize(raw: Partial<StoreData>): StoreData {
  return {
    members: raw.members ?? [],
    chores: raw.chores ?? [],
    completions: raw.completions ?? {},
    meals: raw.meals ?? {},
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
  };
}

type Updater<T> = T | ((prev: T) => T);
interface StoreCtx {
  data: StoreData;
  mode: Mode;
  set: <K extends keyof StoreData>(key: K, value: Updater<StoreData[K]>) => void;
  saveError: string | null;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [mode, setMode] = useState<Mode>('demo');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dataRef = useRef<StoreData | null>(null);
  const revRef = useRef(0);
  const pending = useRef(0);

  const set = useCallback<StoreCtx['set']>((key, value) => {
    const prev = dataRef.current!;
    const next = typeof value === 'function' ? (value as (p: StoreData[typeof key]) => StoreData[typeof key])(prev[key]) : value;
    dataRef.current = { ...prev, [key]: next };
    setData(dataRef.current);
    pending.current++;
    api
      .putStore(key, next)
      .then((r) => {
        revRef.current = Math.max(revRef.current, r.rev);
        setSaveError(null);
      })
      .catch((e) => setSaveError(String(e.message || e)))
      .finally(() => pending.current--);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [status, s] = await Promise.all([api.status(), api.store()]);
        if (!alive) return;
        setMode(status.mode);
        revRef.current = s.rev;
        const empty = s.rev === 0 && !s.data.members;
        dataRef.current = normalize(empty && status.mode === 'demo' ? demoData() : s.data);
        setData(dataRef.current);
        if (empty && status.mode === 'demo') {
          const seeded = dataRef.current;
          (['members', 'chores', 'completions', 'meals'] as const).forEach((k) => set(k, seeded[k]));
        }
      } catch (e) {
        if (alive) setLoadError(String((e as Error).message || e));
      }
    })();
    // Pick up changes made from other devices (phone, second tablet).
    const t = setInterval(async () => {
      if (pending.current || !dataRef.current) return;
      try {
        const s = await api.store();
        if (s.rev > revRef.current && !pending.current) {
          revRef.current = s.rev;
          dataRef.current = normalize(s.data);
          setData(dataRef.current);
        }
      } catch {
        /* offline; retry next tick */
      }
    }, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [set]);

  if (loadError) return <div className="boot">Couldn’t reach the Hearth server: {loadError}</div>;
  if (!data) return <div className="boot">Loading…</div>;
  return <Ctx.Provider value={{ data, mode, set, saveError }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}
