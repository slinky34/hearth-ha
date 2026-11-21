import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume1, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AlbumArt } from '../components/NowPlaying';
import { api } from '../lib/api';
import { useNow } from '../lib/hooks';
import { F, can, titleOf, useMusic, type Player } from '../lib/music';
import { t } from '../lib/i18n';

interface Playlist {
  name: string;
  uri: string;
  image?: string | null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Progress({ p }: { p: Player }) {
  const now = useNow(1000);
  if (!p.duration || p.position == null) return null;
  const elapsed = Math.min(
    p.duration,
    p.position + (p.state === 'playing' && p.positionAt ? (now.getTime() - p.positionAt) / 1000 : 0),
  );
  return (
    <div className="music-progress">
      <div className="bar">
        <div style={{ width: `${(elapsed / p.duration) * 100}%` }} />
      </div>
      <span>{mmss(elapsed)}</span>
      <span>{mmss(p.duration)}</span>
    </div>
  );
}

export function MusicView() {
  const { players, massPlayers, active, select, call } = useMusic();
  const [target, setTarget] = useState<string>('');
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [entry, setEntry] = useState<string | null>(null);

  // Music Assistant playlists, when it's installed.
  useEffect(() => {
    (async () => {
      try {
        const { entry_id } = await api.musicAssistantEntry();
        if (!entry_id) return;
        setEntry(entry_id);
        const r = await api.service<{ service_response: { items: Playlist[] } }>(
          'music_assistant', 'get_library', { config_entry_id: entry_id, media_type: 'playlist', limit: 24 }, true,
        );
        setPlaylists(r.service_response?.items ?? []);
      } catch {
        setPlaylists(null);
      }
    })();
  }, []);

  if (players.length === 0)
    return (
      <div className="music">
        <div className="view-head">
          <h1>{t('Music')}</h1>
        </div>
        <div className="empty">{t('No media players found in Home Assistant. Speakers from Sonos, Music Assistant, Spotify Connect, Google Cast, and others show up here.')}</div>
      </div>
    );

  const p = active!;
  const playing = p.state === 'playing';
  // Music Assistant can only play to its own players: use the chosen one, else the active
  // speaker if it's an MA player, else the MA player with the same name, else the first.
  const playTarget =
    massPlayers.find((m) => m.id === target) ??
    (p.mass ? p : undefined) ??
    massPlayers.find((m) => m.name.toLowerCase() === p.name.toLowerCase()) ??
    massPlayers[0];
  return (
    <div className="music">
      <div className="view-head">
        <h1>{t('Music')}</h1>
        <div className="chips">
          {players.map((pl) => (
            <button key={pl.id} className={`chip ${pl.id === p.id ? 'on' : ''}`} onClick={() => select(pl.id)}>
              {pl.state === 'playing' && <span className="eq" aria-hidden><i /><i /><i /></span>}
              {pl.name}
            </button>
          ))}
        </div>
      </div>

      <div className="music-main">
        <div className="music-now card">
          <AlbumArt player={p} size={220} />
          <div className="music-meta">
            <h2>{p.state === 'playing' || p.state === 'paused' ? titleOf(p) : p.state === 'off' ? t('Off') : t('Nothing playing')}</h2>
            {p.artist && <p className="muted">{p.artist}</p>}
            {!p.title && p.app && <p className="muted small">{p.app}</p>}
            {p.album && <p className="muted small">{p.album}</p>}
            <Progress p={p} />
            <div className="music-controls">
              <button className="icon-btn big" onClick={() => call('media_previous_track')} aria-label={t('Previous')} disabled={!can(p, F.PREVIOUS)}>
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button className="icon-btn play" onClick={() => call('media_play_pause')} aria-label={playing ? t('Pause') : t('Play')} disabled={!can(p, F.PAUSE) && !can(p, F.PLAY)}>
                {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
              </button>
              <button className="icon-btn big" onClick={() => call('media_next_track')} aria-label={t('Next')} disabled={!can(p, F.NEXT)}>
                <SkipForward size={28} fill="currentColor" />
              </button>
            </div>
            {p.volume != null && can(p, F.VOLUME_SET) && (
              <label className="volume">
                <Volume1 size={20} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={p.volume}
                  onChange={(e) => call('volume_set', { volume_level: Number(e.target.value) })}
                  aria-label={t('Volume')}
                />
                <Volume2 size={20} />
              </label>
            )}
          </div>
        </div>

        {entry && playlists && playlists.length > 0 && (
          <section className="playlists">
            <div className="playlist-head">
              <h3 className="today-label">
                <ListMusic size={14} /> {t('Playlists')} · Music Assistant
              </h3>
              {massPlayers.length > 1 && (
                <label className="play-on">
                  {t('Play on')}
                  <select value={playTarget?.id ?? ''} onChange={(e) => setTarget(e.target.value)}>
                    {massPlayers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {massPlayers.length === 0 && <p className="muted small">{t('No Music Assistant speakers found. Playlists can only play on Music Assistant players.')}</p>}
            <div className="playlist-grid">
              {playlists.map((pl) => (
                <button
                  key={pl.uri}
                  className="playlist"
                  disabled={!playTarget}
                  onClick={async () => {
                    if (!playTarget) return;
                    if (await call('music_assistant.play_media', { media_id: pl.uri, media_type: 'playlist' }, playTarget.id)) select(playTarget.id);
                  }}
                >
                  {pl.image ? <img src={pl.image} alt="" /> : <span className="playlist-art"><ListMusic size={28} /></span>}
                  <span>{pl.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
