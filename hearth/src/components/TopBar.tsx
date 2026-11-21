
import { useState } from 'react';
import { useHa } from '../lib/ha';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { initials } from '../lib/util';
import { useWeather, weatherIcon, weatherLabel } from '../lib/weather';
import { Modal } from './Modal';
import { NowPlayingPill } from './NowPlaying';
import { TimerChips } from './Timers';
import { dateLong, format, t } from '../lib/i18n';

export function TopBar({ onMusic }: { onMusic: () => void }) {
  const { data } = useStore();
  const { selected, setSelected } = useHa();
  const weather = useWeather();
  const now = useNow();
  const [showForecast, setShowForecast] = useState(false);
  const { clock24 } = data.settings;

  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <header className="topbar">
      <div className="clock">
        {data.settings.familyName && <span className="family-name">{data.settings.familyName}</span>}
        <span className="time">{format(now, clock24 ? 'HH:mm' : 'h:mm')}</span>
        {!clock24 && <span className="ampm">{format(now, 'a')}</span>}
        <span className="date">{dateLong(now)}</span>
      </div>

      <div className="topbar-right">
        <TimerChips />
        <NowPlayingPill onOpen={onMusic} />
        {data.members.length > 0 && (
          <div className="member-filter" aria-label={t('Filter by family member')}>
            <button className={`chip ${selected.length === 0 ? 'on' : ''}`} onClick={() => setSelected([])}>
              {t('Everyone')}
            </button>
            {data.members.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  className={`avatar ${on ? 'on' : ''} ${selected.length && !on ? 'dim' : ''}`}
                  style={{ background: m.color }}
                  onClick={() => toggle(m.id)}
                  title={m.name}
                  aria-pressed={on}
                >
                  {initials(m.name)}
                </button>
              );
            })}
          </div>
        )}
        {weather && (
          <button className="weather-now" onClick={() => setShowForecast(true)}>
            <span className="wx-icon">{weatherIcon(weather.condition)}</span>
            {weather.temp != null && <span className="wx-temp">{weather.temp}°</span>}
          </button>
        )}
      </div>

      {showForecast && weather && (
        <Modal title={t('Forecast')} onClose={() => setShowForecast(false)}>
          <p className="muted">
            {t('Now')}: {t(weatherLabel(weather.condition))}
            {weather.temp != null && `, ${weather.temp}${weather.unit}`}
          </p>
          <div className="forecast">
            {weather.forecast.slice(0, 7).map((f) => (
              <div key={f.date} className="forecast-day">
                <span className="muted">{format(new Date(f.date + 'T12:00'), 'EEE')}</span>
                <span className="wx-icon">{weatherIcon(f.condition)}</span>
                <strong>{f.high}°</strong>
                {f.low != null && <span className="muted">{f.low}°</span>}
                {f.precip ? <span className="precip">💧{f.precip}%</span> : null}
              </div>
            ))}
            {weather.forecast.length === 0 && <p className="muted">{t('No daily forecast from this weather entity.')}</p>}
          </div>
        </Modal>
      )}
    </header>
  );
}
