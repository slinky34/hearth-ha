import { Disc3, ListMusic, Pause, Play, Shuffle, SkipBack, SkipForward, Volume1, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { AlbumArt } from '../components/NowPlaying';
import { api } from '../lib/api';
import { useNow } from '../lib/hooks';
import { t } from '../lib/i18n';
import { F, can, massOf, titleOf, useMusic, type Player } from '../lib/music';

interface LibItem {
  name: string;
  uri: string;
  image?: string | null;
  subtitle?: string;
  kind: 'playlist' | 'album';
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const imageOf = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'path' in v ? String((v as { path: string }).path) : null);

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

function Cover({ item, size }: { item: LibItem; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = api.artUrl(item.image);
  if (!src || broken)
    return (
      <span className="playlist-art" style={size ? { width: size, height: size } : undefined}>
        {item.kind === 'album' ? <Disc3 size={28} /> : <ListMusic size={28} />}
      </span>
    );
  return <img src={src} alt="" onError={() => setBroken(true)} style={size ? { width: size, height: size } : undefined} />;
}

export function MusicView() {
  const { players, massPlayers, active, select, call } = useMusic();
  const [target, setTarget] = useState<string>('');
  const [lib, setLib] = useState<{ playlists: LibItem[]; albums: LibItem[] } | null>(null);
  const [open, setOpen] = useState<LibItem | null>(null);

  // Music Assistant library, when it's installed.
  useEffect(() => {
    (async () => {
      try {
        const { entry_id } = await api.musicAssistantEntry();
        if (!entry_id) return;
        const get = (media_type: string) =>
          api
            .service<{ service_response: { items: any[] } }>('music_assistant', 'get_library', { config_entry_id: entry_id, media_type, limit: 30 }, true)
            .then((r) => r.service_response?.items ?? [])
            .catch(() => []);
        const [pls, als] = await Promise.all([get('playlist'), get('album')]);
        setLib({
          playlists: pls.map((x) => ({ name: x.name, uri: x.uri, image: imageOf(x.image), kind: 'playlist' })),
          albums: als.map((x) => ({
            name: x.name,
            uri: x.uri,
            image: imageOf(x.image),
            subtitle: (x.artists ?? []).map((a: any) => a?.name).filter(Boolean).join(', '),
            kind: 'album',
          })),
        });
      } catch {
        setLib(null);
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
  // Music Assistant can only play to its own players: the chosen one, else this speaker's
  // Music Assistant entity, else the first one.
  const playTarget = massPlayers.find((m) => m.id === target) ?? massOf(p) ?? massPlayers[0];

  const section = (title: string, items: LibItem[]) =>
    items.length > 0 && (
      <section className="playlists">
        <h3 className="today-label">{title}</h3>
        <div className="playlist-grid">
          {items.map((it) => (
            <button key={it.uri} className="playlist" onClick={() => setOpen(it)}>
              <Cover item={it} />
              <span>{it.name}</span>
              {it.subtitle && <span className="muted small">{it.subtitle}</span>}
            </button>
          ))}
        </div>
      </section>
    );

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

        {lib && (lib.playlists.length > 0 || lib.albums.length > 0) && (
          <>
            <div className="playlist-head">
              <span className="muted small">Music Assistant</span>
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
            {section(t('Playlists'), lib.playlists)}
            {section(t('Albums'), lib.albums)}
          </>
        )}
      </div>

      {open && playTarget && (
        <TrackList
          item={open}
          player={playTarget}
          onClose={() => setOpen(null)}
          onPlay={async (data) => {
            if (await call('music_assistant.play_media', data, playTarget.id)) {
              select(playTarget.id);
              setOpen(null);
            }
          }}
          onShuffle={() => call('media_player.shuffle_set', { shuffle: true }, playTarget.id)}
        />
      )}
    </div>
  );
}

interface Track {
  id: string;
  title: string;
  sub?: string;
}

function TrackList({ item, player, onClose, onPlay, onShuffle }: {
  item: LibItem;
  player: Player;
  onClose: () => void;
  onPlay: (data: Record<string, unknown>) => void;
  onShuffle: () => Promise<boolean>;
}) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .browse(player.id, item.uri, item.kind)
      .then((r) =>
        setTracks(
          (r.children ?? [])
            .filter((c) => c.can_play)
            .map((c) => {
              const [title, ...rest] = c.title.split(' - ');
              return { id: c.media_content_id, title, sub: rest.join(' - ') || undefined };
            }),
        ),
      )
      .catch((e) => setErr((e as Error).message));
  }, [player.id, item.uri, item.kind]);

  const playAll = () => onPlay({ media_id: item.uri, media_type: item.kind, enqueue: 'replace' });
  return (
    <Modal title={item.name} onClose={onClose} wide>
      <div className="tracklist">
        <div className="tracklist-head">
          <Cover item={item} size={120} />
          <div className="grow">
            <span className="muted small">
              {item.kind === 'album' ? t('Album') : t('Playlist')}
              {item.subtitle ? ` · ${item.subtitle}` : ''}
            </span>
            <h2>{item.name}</h2>
            {tracks && (
              <span className="muted small">
                {t('{n} songs', { n: tracks.length })} · {t('on {player}', { player: player.name })}
              </span>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={playAll}>
                <Play size={18} fill="currentColor" /> {t('Play all')}
              </button>
              <button className="btn" onClick={async () => { if (await onShuffle()) playAll(); }}>
                <Shuffle size={18} /> {t('Shuffle')}
              </button>
            </div>
          </div>
        </div>
        {err && <p className="error">{t('Couldn’t load the songs: {error}', { error: err })}</p>}
        {!tracks && !err && <p className="muted">{t('Loading…')}</p>}
        {tracks && (
          <ol className="tracks">
            {tracks.map((tr, k) => (
              <li key={tr.id}>
                {/* Play this song and the rest of the list after it. */}
                <button onClick={() => onPlay({ media_id: tracks.slice(k).map((x) => x.id), media_type: 'track', enqueue: 'replace' })}>
                  <span className="track-num">{k + 1}</span>
                  <span className="grow">
                    <b>{tr.title}</b>
                    {tr.sub && <span className="muted small">{tr.sub}</span>}
                  </span>
                  <Play size={16} className="track-play" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
