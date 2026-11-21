import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from '../components/Toast';
import { api } from './api';
import { t } from './i18n';
import { useStore } from './store';
import type { HaState } from './types';

// media_player supported_features bits (homeassistant.components.media_player.MediaPlayerEntityFeature)
export const F = { PAUSE: 1, SEEK: 2, VOLUME_SET: 4, PREVIOUS: 16, NEXT: 32, PLAY_MEDIA: 512, PLAY: 16384 };

// Placeholder titles some integrations report when they don't know what's playing.
const NO_TITLE = /^(not provided|unknown|none|null|n\/a|-)$/i;

export interface Player {
  id: string;
  name: string;
  state: string; // playing | paused | idle | off | unavailable ...
  title?: string;
  artist?: string;
  album?: string;
  app?: string;
  volume?: number;
  duration?: number;
  position?: number;
  positionAt?: number; // ms timestamp the position was reported
  hasArt: boolean;
  artKey: string;
  features: number;
  /** A Music Assistant player (only these can play MA playlists). */
  mass: boolean;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() && !NO_TITLE.test(v.trim()) ? v.trim() : undefined);

function toPlayer(s: HaState): Player {
  const a = s.attributes;
  return {
    id: s.entity_id,
    name: a.friendly_name || s.entity_id,
    state: s.state,
    title: clean(a.media_title),
    artist: clean(a.media_artist) || clean(a.media_album_artist),
    album: clean(a.media_album_name),
    app: clean(a.app_name) || clean(a.source),
    volume: typeof a.volume_level === 'number' ? a.volume_level : undefined,
    duration: a.media_duration,
    position: a.media_position,
    positionAt: a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : undefined,
    hasArt: Boolean(a.entity_picture),
    artKey: `${a.media_title ?? ''}|${a.entity_picture ?? ''}`,
    features: Number(a.supported_features) || 0,
    mass: a.mass_player_type != null || a.active_queue != null || a.app_id === 'music_assistant',
  };
}

export const can = (p: Player | null, feature: number) => !!p && (p.features & feature) !== 0;

interface MusicCtx {
  players: Player[];
  /** Every Music Assistant player, even ones hidden in Settings (playlist targets). */
  massPlayers: Player[];
  /** The player to show: the chosen one, else whatever is playing, else the first. */
  active: Player | null;
  select: (id: string) => void;
  /** Calls a media service; shows the error from Home Assistant if it fails. Returns success. */
  call: (service: string, data?: Record<string, unknown>, player?: string) => Promise<boolean>;
}

const Ctx = createContext<MusicCtx>({ players: [], massPlayers: [], active: null, select: () => undefined, call: async () => false });

export function MusicProvider({ children }: { children: ReactNode }) {
  const { musicPlayers } = useStore().data.settings;
  const [players, setPlayers] = useState<Player[]>([]);
  const [massPlayers, setMass] = useState<Player[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = (await api.states({ domains: ['media_player'] }))
        .filter((s) => s.state !== 'unavailable')
        .map(toPlayer)
        .sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(all.filter((p) => musicPlayers.length === 0 || musicPlayers.includes(p.id)));
      setMass(all.filter((p) => p.mass));
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
      if (!id) return false;
      let [domain, svc] = service.includes('.') ? service.split('.') : ['media_player', service];
      const p = players.find((x) => x.id === id);
      // Prefer explicit play/pause: some players support those but not the toggle.
      if (svc === 'media_play_pause' && p) svc = p.state === 'playing' ? 'media_pause' : 'media_play';
      const prev = players;
      if (svc === 'media_pause' || svc === 'media_play')
        setPlayers((ps) => ps.map((x) => (x.id === id ? { ...x, state: svc === 'media_pause' ? 'paused' : 'playing' } : x)));
      if (svc === 'volume_set') setPlayers((ps) => ps.map((x) => (x.id === id ? { ...x, volume: Number(data.volume_level) } : x)));
      try {
        await api.service(domain, svc, { entity_id: id, ...data });
        setTimeout(load, 700);
        return true;
      } catch (e) {
        setPlayers(prev);
        toast(t('{player}: {error}', { player: p?.name ?? id, error: (e as Error).message }));
        return false;
      }
    },
    [active, players, load],
  );

  return <Ctx.Provider value={{ players, massPlayers, active, select: setChosen, call }}>{children}</Ctx.Provider>;
}

export const useMusic = () => useContext(Ctx);
export const isActive = (p: Player | null) => !!p && (p.state === 'playing' || p.state === 'paused');
export const titleOf = (p: Player) => p.title ?? p.app ?? (p.state === 'playing' ? t('Playing') : t('Paused'));
