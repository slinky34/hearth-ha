import {
  Activity, Clapperboard, DoorClosed, DoorOpen, Fan, Lightbulb, LightbulbOff, Play, Power, Thermometer, ToggleLeft,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { HaState } from '../lib/types';
import { t } from '../lib/i18n';

export const CONTROL_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'scene', 'script', 'sensor', 'binary_sensor', 'climate'];
const TOGGLES = ['light', 'switch', 'fan', 'input_boolean'];

function describe(s: HaState) {
  const d = s.entity_id.split('.')[0];
  const a = s.attributes;
  if (d === 'sensor') return `${s.state}${a.unit_of_measurement ? ` ${a.unit_of_measurement}` : ''}`;
  if (d === 'binary_sensor') {
    const open = s.state === 'on';
    const words: Record<string, [string, string]> = {
      door: ['Open', 'Closed'], window: ['Open', 'Closed'], garage_door: ['Open', 'Closed'], opening: ['Open', 'Closed'],
      motion: ['Motion', 'Clear'], occupancy: ['Occupied', 'Clear'], moisture: ['Wet', 'Dry'], lock: ['Unlocked', 'Locked'],
    };
    const w = words[a.device_class] ?? ['On', 'Off'];
    return t(open ? w[0] : w[1]);
  }
  if (d === 'climate') return `${a.current_temperature ?? '–'}° · ${s.state}`;
  if (d === 'scene' || d === 'script') return t('Tap to run');
  if (d === 'light' && s.state === 'on' && a.brightness) return `${Math.round((a.brightness / 255) * 100)}%`;
  return s.state === 'on' ? t('On') : s.state === 'off' ? t('Off') : s.state;
}

function Icon({ s }: { s: HaState }) {
  const d = s.entity_id.split('.')[0];
  const on = s.state === 'on';
  if (d === 'light') return on ? <Lightbulb /> : <LightbulbOff />;
  if (d === 'fan') return <Fan className={on ? 'spin-slow' : ''} />;
  if (d === 'scene') return <Clapperboard />;
  if (d === 'script') return <Play />;
  if (d === 'switch') return <Power />;
  if (d === 'input_boolean') return <ToggleLeft />;
  if (d === 'climate' || s.attributes.device_class === 'temperature') return <Thermometer />;
  if (d === 'binary_sensor' && /door|window|opening/.test(s.attributes.device_class ?? '')) return on ? <DoorOpen /> : <DoorClosed />;
  return <Activity />;
}

export function useEntityStates(ids: string[], every = 10000) {
  const [states, setStates] = useState<HaState[]>([]);
  const key = ids.join(',');
  const load = useCallback(async () => {
    if (!key) return setStates([]);
    try {
      setStates(await api.states({ ids: key.split(',') }));
    } catch {
      /* keep last */
    }
  }, [key]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), every);
    return () => clearInterval(t);
  }, [load, every]);
  return { states, setStates, reload: load };
}

export function HomeView() {
  const { controls } = useStore().data.settings;
  const { states, setStates, reload } = useEntityStates(controls);
  const [flash, setFlash] = useState<string | null>(null);
  const ordered = controls.map((id) => states.find((s) => s.entity_id === id)).filter(Boolean) as HaState[];

  const act = async (s: HaState) => {
    const d = s.entity_id.split('.')[0];
    if (TOGGLES.includes(d)) {
      setStates((all) => all.map((x) => (x.entity_id === s.entity_id ? { ...x, state: x.state === 'on' ? 'off' : 'on' } : x)));
      await api.service(d, 'toggle', { entity_id: s.entity_id }).catch(() => undefined);
    } else if (d === 'scene' || d === 'script') {
      setFlash(s.entity_id);
      setTimeout(() => setFlash(null), 900);
      await api.service(d, 'turn_on', { entity_id: s.entity_id }).catch(() => undefined);
    } else return;
    setTimeout(reload, 700);
  };

  return (
    <div className="home">
      <div className="view-head">
        <h1>{t('Home')}</h1>
      </div>
      {controls.length === 0 ? (
        <div className="empty">{t('Pick lights, switches, scenes, and sensors to show here in Settings → Home controls.')}</div>
      ) : (
        <div className="control-grid">
          {ordered.map((s) => {
            const d = s.entity_id.split('.')[0];
            const actionable = TOGGLES.includes(d) || d === 'scene' || d === 'script';
            const on = s.state === 'on' || flash === s.entity_id;
            return (
              <button
                key={s.entity_id}
                className={`control ${on ? 'on' : ''} ${actionable ? '' : 'readonly'} ${s.state === 'unavailable' ? 'unavailable' : ''}`}
                onClick={() => act(s)}
                disabled={!actionable || s.state === 'unavailable'}
              >
                <span className="control-icon">
                  <Icon s={s} />
                </span>
                <span className="control-name">{s.attributes.friendly_name ?? s.entity_id}</span>
                <span className="control-state">{s.state === 'unavailable' ? t('Unavailable') : describe(s)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
