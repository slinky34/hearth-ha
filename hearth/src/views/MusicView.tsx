import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume1, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AlbumArt } from '../components/NowPlaying';
import { api } from '../lib/api';
import { useNow } from '../lib/hooks';
import { useMusic, type Player } from '../lib/music';

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
  const { players, active, select, call } = useMusic();
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
          <h1>Music</h1>
        </div>
        <div className="empty">No media players found in Home Assistant. Speakers from Sonos, Music Assistant, Spotify Connect, Google Cast, and others show up here.</div>
      </div>
    );

  const p = active!;
  const playing = p.state === 'playing';
  return (
    <div className="music">
      <div className="view-head">
        <h1>Music</h1>
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
            <h2>{p.title ?? (p.state === 'off' ? 'Off' : 'Nothing playing')}</h2>
            {p.artist && <p className="muted">{p.artist}</p>}
            {p.album && <p className="muted small">{p.album}</p>}
            <Progress p={p} />
            <div className="music-controls">
              <button className="icon-btn big" onClick={() => call('media_previous_track')} aria-label="Previous">
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button className="icon-btn play" onClick={() => call('media_play_pause')} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
              </button>
              <button className="icon-btn big" onClick={() => call('media_next_track')} aria-label="Next">
                <SkipForward size={28} fill="currentColor" />
              </button>
            </div>
            {p.volume != null && (
              <label className="volume">
                <Volume1 size={20} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={p.volume}
                  onChange={(e) => call('volume_set', { volume_level: Number(e.target.value) })}
                  aria-label="Volume"
                />
                <Volume2 size={20} />
              </label>
            )}
          </div>
        </div>

        {entry && playlists && playlists.length > 0 && (
          <section className="playlists">
            <h3 className="today-label">
              <ListMusic size={14} /> Playlists · Music Assistant
            </h3>
            <div className="playlist-grid">
              {playlists.map((pl) => (
                <button
                  key={pl.uri}
                  className="playlist"
                  onClick={() => call('music_assistant.play_media', { media_id: pl.uri, media_type: 'playlist' })}
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
