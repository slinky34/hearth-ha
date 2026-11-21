import { addDays, startOfDay } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { dateLong, format } from '../lib/i18n';
import { isActive, useMusic } from '../lib/music';
import { useStore } from '../lib/store';
import { fmtShortTime } from '../lib/util';
import { useWeather, weatherIcon } from '../lib/weather';
import { usePhotos } from './PhotosView';

export const SS_STYLES = [
  { id: 'kenburns', label: 'Ken Burns', icon: '🎞️' },
  { id: 'classic', label: 'Classic', icon: '🖼️' },
  { id: 'floating', label: 'Floating', icon: '🫧' },
  { id: 'wall', label: 'Photo Wall', icon: '🧱' },
  { id: 'prints', label: 'Vintage Prints', icon: '📸' },
  { id: 'panels', label: 'Sliding Panels', icon: '🪟' },
  { id: 'flip', label: 'Flip-up', icon: '🃏' },
  { id: 'reflections', label: 'Reflections', icon: '🪞' },
  { id: 'mobile', label: 'Photo Mobile', icon: '🎐' },
  { id: 'random', label: 'Random', icon: '🎲' },
] as const;

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

type Feed = () => string;
/** Hands out photos one at a time, looping forever. */
function useFeed(list: string[]): Feed {
  const idx = useRef(0);
  const ref = useRef(list);
  ref.current = list;
  return useCallback(() => {
    const l = ref.current;
    if (!l.length) return '';
    const p = l[idx.current % l.length];
    idx.current++;
    return p;
  }, []);
}

const src = (p: string) => api.photoUrl(p);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const useEvery = (ms: number, fn: () => void) => {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    const t = setInterval(() => f.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
};

/* ---------- Ken Burns / Classic / Flip-up: one photo at a time ---------- */
function Crossfade({ feed, seconds, variant }: { feed: Feed; seconds: number; variant: 'kenburns' | 'classic' | 'flip' }) {
  const [slides, setSlides] = useState(() => [{ key: 0, p: feed() }]);
  useEvery(seconds * 1000, () => setSlides((s) => [...s.slice(-1), { key: s[s.length - 1].key + 1, p: feed() }]));
  return (
    <>
      {slides.map((s) => (
        <div key={s.key} className={`ss-slide ${variant} kb-${s.key % 4}`}>
          <img src={src(s.p)} alt="" className="ss-bg" />
          {variant === 'flip' ? (
            <div className="flip-card">
              <img src={src(s.p)} alt="" />
            </div>
          ) : (
            <img src={src(s.p)} alt="" className="ss-fg" />
          )}
        </div>
      ))}
    </>
  );
}

/* ---------- Floating: photos drift upward at different depths ---------- */
const FLOATERS = Array.from({ length: 7 }, (_, i) => ({
  left: 4 + ((i * 37) % 80),
  width: 16 + ((i * 7) % 4) * 4,
  duration: 26 + ((i * 11) % 16),
  delay: -((i * 29) % 34),
  rot: ((i % 2 ? 1 : -1) * (2 + (i % 3) * 2)),
}));
function FloatCard({ cfg, feed }: { cfg: (typeof FLOATERS)[number]; feed: Feed }) {
  const [p, setP] = useState(feed);
  return (
    <div
      className="ss-float"
      style={{ left: `${cfg.left}%`, width: `${cfg.width}vw`, animationDuration: `${cfg.duration}s`, animationDelay: `${cfg.delay}s`, ['--rot' as string]: `${cfg.rot}deg`, zIndex: cfg.width } as CSSProperties}
      onAnimationIteration={() => setP(feed())}
    >
      <img src={src(p)} alt="" />
    </div>
  );
}
function Floating({ feed }: { feed: Feed }) {
  return (
    <div className="ss-scene floating-scene">
      {FLOATERS.map((cfg, i) => (
        <FloatCard key={i} cfg={cfg} feed={feed} />
      ))}
    </div>
  );
}

/* ---------- Photo Wall: a grid whose tiles flip to new photos ---------- */
function Wall({ feed, seconds }: { feed: Feed; seconds: number }) {
  const [tiles, setTiles] = useState(() => Array.from({ length: 12 }, (_, i) => ({ k: i, p: feed() })));
  const n = useRef(100);
  useEvery(Math.max(1500, (seconds * 1000) / 3), () =>
    setTiles((t) => {
      const i = Math.floor(Math.random() * t.length);
      const next = [...t];
      next[i] = { k: n.current++, p: feed() };
      return next;
    }),
  );
  return (
    <div className="ss-scene wall-scene">
      {tiles.map((t, i) => (
        <div key={i} className="wall-tile">
          <img key={t.k} src={src(t.p)} alt="" className={t.k >= 100 ? 'flip-in' : ''} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Vintage Prints: prints tossed onto a table, piling up ---------- */
function Prints({ feed, seconds }: { feed: Feed; seconds: number }) {
  const make = (k: number) => ({ k, p: feed(), x: rand(6, 62), y: rand(4, 46), rot: rand(-16, 16) });
  const [prints, setPrints] = useState(() => [make(0), make(1), make(2)]);
  useEvery(Math.max(2500, (seconds * 1000) / 2), () => setPrints((ps) => [...ps.slice(-8), make(ps[ps.length - 1].k + 1)]));
  return (
    <div className="ss-scene prints-scene">
      {prints.map((pr) => (
        <figure key={pr.k} className="print" style={{ left: `${pr.x}%`, top: `${pr.y}%`, ['--rot' as string]: `${pr.rot}deg` } as CSSProperties}>
          <img src={src(pr.p)} alt="" />
        </figure>
      ))}
    </div>
  );
}

/* ---------- Sliding Panels: three panels that slide in new photos ---------- */
function Panels({ feed, seconds }: { feed: Feed; seconds: number }) {
  const [panels, setPanels] = useState(() => [0, 1, 2].map((i) => [{ k: i, p: feed(), dir: 'down' }]));
  const turn = useRef(0);
  const n = useRef(10);
  useEvery(Math.max(2000, (seconds * 1000) / 3), () => {
    const i = turn.current++ % 3;
    setPanels((ps) => ps.map((slides, j) => (j === i ? [...slides.slice(-1), { k: n.current++, p: feed(), dir: n.current % 2 ? 'up' : 'down' }] : slides)));
  });
  return (
    <div className="ss-scene panels-scene">
      {panels.map((slides, i) => (
        <div key={i} className="panel">
          {slides.map((s) => (
            <img key={s.k} src={src(s.p)} alt="" className={s.k >= 10 ? `slide-${s.dir}` : ''} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Reflections: a row of photos gliding over a glossy floor ---------- */
function Reflections({ feed }: { feed: Feed }) {
  const [set, setSet] = useState(() => Array.from({ length: 6 }, () => feed()));
  const row = [...set, ...set]; // duplicated so the loop is seamless
  return (
    <div className="ss-scene reflect-scene">
      <div className="reflect-track" onAnimationIteration={() => setSet(Array.from({ length: 6 }, () => feed()))}>
        {row.map((p, i) => (
          <div key={i} className="reflect-item">
            <img src={src(p)} alt="" />
            <img src={src(p)} alt="" className="mirror" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Photo Mobile: photos hanging on strings, gently swaying ---------- */
const HANGERS = [
  { x: 10, len: 18, w: 20, d: 6.5 },
  { x: 30, len: 34, w: 17, d: 7.6 },
  { x: 50, len: 12, w: 22, d: 6.1 },
  { x: 70, len: 30, w: 18, d: 8.2 },
  { x: 88, len: 20, w: 16, d: 7.1 },
];
function Mobile({ feed, seconds }: { feed: Feed; seconds: number }) {
  const [pics, setPics] = useState(() => HANGERS.map((_, i) => ({ k: i, p: feed() })));
  const turn = useRef(0);
  const n = useRef(10);
  useEvery(Math.max(2500, (seconds * 1000) / 2), () => {
    const i = turn.current++ % HANGERS.length;
    setPics((ps) => ps.map((x, j) => (j === i ? { k: n.current++, p: feed() } : x)));
  });
  return (
    <div className="ss-scene mobile-scene">
      <div className="mobile-bar" />
      {HANGERS.map((h, i) => (
        <div key={i} className="hanger" style={{ left: `${h.x}%`, animationDuration: `${h.d}s`, animationDelay: `${-i * 1.3}s` }}>
          <i className="string" style={{ height: `${h.len}vh` }} />
          <div className="hang-photo" style={{ width: `${h.w}vw` }}>
            <img key={pics[i].k} src={src(pics[i].p)} alt="" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Screensaver({ onClose, styleOverride }: { onClose: () => void; styleOverride?: string }) {
  const { settings } = useStore().data;
  const { visibleCalendars, colorOf } = useHa();
  const weather = useWeather();
  const now = useNow(5000);
  const { photos } = usePhotos();
  const { active } = useMusic();
  const order = useMemo(() => (settings.ssShuffle ? shuffle(photos) : photos), [photos, settings.ssShuffle]);
  const feed = useFeed(order);
  const seconds = Math.max(4, settings.photoSeconds);

  const style = useMemo(() => {
    const want = styleOverride ?? settings.screensaverStyle;
    if (want !== 'random') return want;
    const pool = SS_STYLES.filter((s) => s.id !== 'random');
    return pool[Math.floor(Math.random() * pool.length)].id;
  }, [styleOverride, settings.screensaverStyle]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const { events } = useEvents(visibleCalendars, today, addDays(today, 1));
  const upcoming = events.filter((e) => !e.allDay && e.end > now).slice(0, 3);

  return (
    <div
      className={`screensaver ss-${style}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      {order.length === 0 ? (
        <div className="ss-gradient" />
      ) : style === 'floating' ? (
        <Floating feed={feed} />
      ) : style === 'wall' ? (
        <Wall feed={feed} seconds={seconds} />
      ) : style === 'prints' ? (
        <Prints feed={feed} seconds={seconds} />
      ) : style === 'panels' ? (
        <Panels feed={feed} seconds={seconds} />
      ) : style === 'reflections' ? (
        <Reflections feed={feed} />
      ) : style === 'mobile' ? (
        <Mobile feed={feed} seconds={seconds} />
      ) : (
        <Crossfade feed={feed} seconds={seconds} variant={style === 'classic' ? 'classic' : style === 'flip' ? 'flip' : 'kenburns'} />
      )}

      {(settings.ssClock || settings.ssInfo) && (
        <div className="ss-overlay">
          <div>
            {settings.ssClock && (
              <>
                <div className="ss-time">{format(now, settings.clock24 ? 'HH:mm' : 'h:mm')}</div>
                <div className="ss-date">{dateLong(now)}</div>
              </>
            )}
          </div>
          {settings.ssInfo && (
            <div className="ss-side">
              {weather && (
                <div className="ss-weather">
                  {weatherIcon(weather.condition)} {weather.temp != null && `${weather.temp}°`}
                </div>
              )}
              {isActive(active) && (
                <div className="ss-event ss-music">
                  <span>{active!.state === 'playing' ? '♫' : '❚❚'}</span> {active!.title}
                  {active!.artist ? ` · ${active!.artist}` : ''}
                </div>
              )}
              {upcoming.map((e) => (
                <div key={e.id} className="ss-event">
                  <i style={{ background: colorOf(e.calendar) }} />
                  <span>{fmtShortTime(e.start, settings.clock24)}</span> {e.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
