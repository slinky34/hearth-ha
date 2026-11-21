import { addDays, format, startOfDay } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useEvents, useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { fmtShortTime } from '../lib/util';
import { useWeather, weatherIcon } from '../lib/weather';
import { usePhotos } from './PhotosView';

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function Screensaver({ onClose }: { onClose: () => void }) {
  const { settings } = useStore().data;
  const { visibleCalendars, colorOf } = useHa();
  const weather = useWeather();
  const now = useNow(5000);
  const { photos } = usePhotos();
  const order = useMemo(() => shuffle(photos), [photos]);
  const [i, setI] = useState(0);

  const today = useMemo(() => startOfDay(new Date()), []);
  const { events } = useEvents(visibleCalendars, today, addDays(today, 1));
  const upcoming = events.filter((e) => !e.allDay && e.end > now).slice(0, 3);

  useEffect(() => {
    if (order.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % order.length), Math.max(4, settings.photoSeconds) * 1000);
    return () => clearInterval(t);
  }, [order.length, settings.photoSeconds]);

  return (
    <div
      className="screensaver"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      {order.length === 0 && <div className="ss-gradient" />}
      {order.map((p, idx) => (
        // Only the current and next images are mounted to keep memory low on tablets.
        (idx === i || idx === (i + 1) % order.length) && (
          <div key={p} className={`ss-photo ${idx === i ? 'show' : ''}`}>
            <img src={api.photoUrl(p)} alt="" className="ss-bg" />
            <img src={api.photoUrl(p)} alt="" className="ss-fg" />
          </div>
        )
      ))}
      <div className="ss-overlay">
        <div>
          <div className="ss-time">{format(now, settings.clock24 ? 'HH:mm' : 'h:mm')}</div>
          <div className="ss-date">{format(now, 'EEEE, MMMM d')}</div>
        </div>
        <div className="ss-side">
          {weather && (
            <div className="ss-weather">
              {weatherIcon(weather.condition)} {weather.temp != null && `${weather.temp}°`}
            </div>
          )}
          {upcoming.map((e) => (
            <div key={e.id} className="ss-event">
              <i style={{ background: colorOf(e.calendar) }} />
              <span>{fmtShortTime(e.start, settings.clock24)}</span> {e.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
