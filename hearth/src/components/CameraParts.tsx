import { formatDistanceToNowStrict } from 'date-fns';
import { Video, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { liveUrl, snapUrl, useCameraName } from '../lib/cameras';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';

export interface Detection {
  id: string;
  camera: string;
  label: string;
  sub_label?: string;
  start: number;
  score?: number;
}

export const LABEL_ICON: Record<string, string> = { person: '🧍', car: '🚗', package: '📦', dog: '🐕', cat: '🐈', bicycle: '🚲', bird: '🐦', motorcycle: '🏍️', truck: '🚚' };
export const labelName = (d: Detection) => d.sub_label || t(d.label.charAt(0).toUpperCase() + d.label.slice(1));

/** True while the page is on screen; streams stop when it isn't. */
function useVisible() {
  const [v, setV] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setV(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}

/** Live video for a camera. Falls back to a still that refreshes every 2 s if the camera can't stream. */
export function LiveImg({ cam, h = 720, fps = 10, className }: { cam: string; h?: number; fps?: number; className?: string }) {
  const visible = useVisible();
  const [still, setStill] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => setStill(false), [cam]);
  useEffect(() => {
    if (!still || !visible) return;
    const id = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(id);
  }, [still, visible]);
  if (!visible) return <img className={className} src={`${snapUrl(cam, h)}${snapUrl(cam).includes('?') ? '&' : '?'}t=0`} alt="" />;
  const src = still ? `${snapUrl(cam, h)}${snapUrl(cam).includes('?') ? '&' : '?'}t=${tick}` : liveUrl(cam, h, fps);
  return <img className={className} key={still ? 'still' : 'live'} src={src} alt="" onError={() => setStill(true)} />;
}

/** Full-screen live view. */
export function CameraFull({ cam, onClose }: { cam: string; onClose: () => void }) {
  const name = useCameraName();
  return (
    <div className="cam-full" onClick={onClose}>
      <header>
        <Video size={20} /> <b>{name(cam)}</b>
        <span className="live-dot">LIVE</span>
        <button className="icon-btn" aria-label={t('Close')}>
          <X />
        </button>
      </header>
      <LiveImg cam={cam} h={1080} fps={12} />
    </div>
  );
}

/** Full-screen snapshot of one detection. */
export function DetectionFull({ d, onClose }: { d: Detection; onClose: () => void }) {
  return (
    <div className="cam-full" onClick={onClose}>
      <header>
        <b>
          {LABEL_ICON[d.label] ?? ''} {labelName(d)} · {d.camera.replace(/_/g, ' ')}
        </b>
        <span className="muted">{new Date(d.start * 1000).toLocaleString()}</span>
        <button className="icon-btn" aria-label={t('Close')}>
          <X />
        </button>
      </header>
      <img src={`api/frigate/snapshot/${encodeURIComponent(d.id)}`} alt="" />
    </div>
  );
}

/** Frigate connection state and recent detections, refreshed every 30 s. */
export function useDetections(enabled = true) {
  const { cameras } = useStore().data.settings;
  const [status, setStatus] = useState<{ configured: boolean; ok: boolean; error?: string } | null>(null);
  const [events, setEvents] = useState<Detection[]>([]);
  const labels = cameras.labels.join(',');
  useEffect(() => {
    if (!enabled) return;
    fetch('api/frigate/status').then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !status?.ok) return;
    const load = () =>
      fetch(`api/frigate/events?${new URLSearchParams({ labels })}`)
        .then((r) => r.json())
        .then((l) => Array.isArray(l) && setEvents(l))
        .catch(() => undefined);
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [enabled, status?.ok, labels]);
  return { status, events };
}

/** One detection thumbnail with what and when. */
export function DetectionTile({ d, onClick }: { d: Detection; onClick: () => void }) {
  return (
    <button className="det" onClick={onClick}>
      <img src={`api/frigate/thumbnail/${encodeURIComponent(d.id)}`} alt="" loading="lazy" />
      <span className="det-info">
        <b>
          {LABEL_ICON[d.label] ?? '•'} {labelName(d)}
        </b>
        <span className="muted small">
          {d.camera.replace(/_/g, ' ')} · {formatDistanceToNowStrict(new Date(d.start * 1000), { addSuffix: true })}
        </span>
      </span>
    </button>
  );
}
