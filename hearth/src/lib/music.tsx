import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { useStore } from './store';
import type { HaState } from './types';

export interface Player {
  id: string;
  name: string;
  state: string; // playing | paused | idle | off | unavailable ...
  title?: string;
  artist?: string;
  album?: string;
  volume?: number;
  duration?: number;
  position?: number;
  positionAt?: number; // ms timestamp the position was reported
  hasArt: boolean;
  artKey: string;
}

function toPlayer(s: HaState): Player {
  const a = s.attributes;
  return {
    id: s.entity_id,
    name: a.friendly_name || s.entity_id,
    state: s.state,
    title: a.media_title,
    artist: a.media_artist || a.media_album_artist,
    album: a.media_album_name,
    volume: typeof a.volume_level === 'number' ? a.volume_level : undefined,
    duration: a.media_duration,
    position: a.media_position,
    positionAt: a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : undefined,
    hasArt: Boolean(a.entity_picture),
    artKey: `${a.media_title ?? ''}|${a.entity_picture ?? ''}`,
  };
}

interface MusicCtx {
  players: Player[];
  /** The player to show: the chosen one, else whatever is playing, else the first. */
  active: Player | null;
  select: (id: string) => void;
  call: (service: string, data?: Record<string, unknown>, player?: string) => Promise<void>;
}

const Ctx = createContext<MusicCtx>({ players: [], active: null, select: () => undefined, call: async () => undefined });

export function MusicProvider({ children }: { children: ReactNode }) {
  const { musicPlayers } = useStore().data.settings;
  const [players, setPlayers] = useState<Player[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = (await api.states({ domains: ['media_player'] }))
        .filter((s) => s.state !== 'unavailable')
        .filter((s) => musicPlayers.length === 0 || musicPlayers.includes(s.entity_id))
        .map(toPlayer)
        .sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(list);
    } catch {
      /* HA unreachable; keep last known */
    }
  }, [musicPlayers]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const active = useMemo(
    () =>
      players.find((p) => p.id === chosen) ??
      players.find((p) => p.state === 'playing') ??
      players.find((p) => p.state === 'paused') ??
      players[0] ??
      null,
    [players, chosen],
  );

  const call = useCallback<MusicCtx['call']>(
    async (service, data = {}, player) => {
      const id = player ?? active?.id;
      if (!id) return;
      const [domain, svc] = service.includes('.') ? service.split('.') : ['media_player', service];
      // Optimistic play/pause so the button responds instantly.
      if (svc === 'media_play_pause')
        setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, state: p.state === 'playing' ? 'paused' : 'playing' } : p)));
      if (svc === 'volume_set') setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, volume: Number(data.volume_level) } : p)));
      await api.service(domain, svc, { entity_id: id, ...data }).catch(() => undefined);
      setTimeout(load, 600);
    },
    [active, load],
  );

  return <Ctx.Provider value={{ players, active, select: setChosen, call }}>{children}</Ctx.Provider>;
}

export const useMusic = () => useContext(Ctx);
export const isActive = (p: Player | null) => !!p && (p.state === 'playing' || p.state === 'paused') && !!p.title;
