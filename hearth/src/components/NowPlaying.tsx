import { Music, Pause, Play } from 'lucide-react';
import { api } from '../lib/api';
import { isActive, useMusic, type Player } from '../lib/music';

export function AlbumArt({ player, size }: { player: Player; size: number }) {
  return player.hasArt ? (
    <img className="album-art" src={api.mediaImageUrl(player.id, player.artKey)} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="album-art placeholder" style={{ width: size, height: size }}>
      <Music size={size * 0.45} />
    </span>
  );
}

/** Compact now-playing pill for the top bar. Hidden when nothing is playing. */
export function NowPlayingPill({ onOpen }: { onOpen: () => void }) {
  const { active, call } = useMusic();
  if (!isActive(active)) return null;
  const p = active!;
  return (
    <div className="np-pill">
      <button className="np-info" onClick={onOpen}>
        <AlbumArt player={p} size={36} />
        <span className="np-text">
          <b>{p.title}</b>
          <span>{p.artist ?? p.name}</span>
        </span>
      </button>
      <button className="icon-btn np-btn" onClick={() => call('media_play_pause')} aria-label={p.state === 'playing' ? 'Pause' : 'Play'}>
        {p.state === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
    </div>
  );
}
