import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useStore } from './store';
import { dateKey } from './util';

export interface ForecastDay {
  date: string; // yyyy-MM-dd
  condition: string;
  high: number;
  low?: number;
  precip?: number;
}
export interface Weather {
  condition: string;
  temp?: number;
  unit: string;
  forecast: ForecastDay[];
}

const ICONS: Record<string, string> = {
  'clear-night': '🌙',
  cloudy: '☁️',
  fog: '🌫️',
  hail: '🌨️',
  lightning: '🌩️',
  'lightning-rainy': '⛈️',
  partlycloudy: '⛅',
  pouring: '🌧️',
  rainy: '🌦️',
  snowy: '❄️',
  'snowy-rainy': '🌨️',
  sunny: '☀️',
  windy: '💨',
  'windy-variant': '💨',
  exceptional: '⚠️',
};
export const weatherIcon = (c: string) => ICONS[c] ?? '🌡️';
export const weatherLabel = (c: string) =>
  c === 'partlycloudy' ? 'Partly cloudy' : c === 'clear-night' ? 'Clear' : c.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase());

const Ctx = createContext<Weather | null>(null);

export function WeatherProvider({ children }: { children: ReactNode }) {
  const entity = useStore().data.settings.weatherEntity;
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    if (!entity) {
      setWeather(null);
      return;
    }
    const load = async () => {
      try {
        const s = await api.state(entity);
        let forecast: ForecastDay[] = [];
        try {
          const r = await api.service<{ service_response: Record<string, { forecast: any[] }> }>(
            'weather', 'get_forecasts', { entity_id: entity, type: 'daily' }, true,
          );
          forecast = (r.service_response?.[entity]?.forecast ?? []).map((f) => ({
            date: dateKey(new Date(f.datetime)),
            condition: f.condition,
            high: Math.round(f.temperature),
            low: f.templow != null ? Math.round(f.templow) : undefined,
            precip: f.precipitation_probability,
          }));
        } catch {
          /* entity may not support daily forecasts */
        }
        setWeather({
          condition: s.state,
          temp: s.attributes.temperature != null ? Math.round(s.attributes.temperature) : undefined,
          unit: s.attributes.temperature_unit ?? '°',
          forecast,
        });
      } catch {
        setWeather(null);
      }
    };
    load();
    const t = setInterval(load, 15 * 60000);
    return () => clearInterval(t);
  }, [entity]);

  return <Ctx.Provider value={weather}>{children}</Ctx.Provider>;
}

export const useWeather = () => useContext(Ctx);
