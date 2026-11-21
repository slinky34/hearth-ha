import { formatDistanceToNowStrict } from 'date-fns';
import { Video, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useHa } from '../lib/ha';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';

interface Detection {
  id: string;
  camera: string;
  label: string;
  sub_label?: string;
  start: number;
  score?: number;
}

const LABEL_ICON: Record<string, string> = { person: '🧍', car: '🚗', package: '📦', dog: '🐕', cat: '🐈', bicycle: '🚲', bird: '🐦', motorcycle: '🏍️', truck: '🚚' };

/** A camera tile that refreshes its snapshot every few seconds. */
function CameraTile({ id, name, onOpen }: { id: string; name: string; onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <button className="cam-tile" onClick={onOpen}>
      <img src={`${api.cameraUrl(id)}?t=${tick}`} alt="" />
      <span className="cam-name">{name}</span>
    </button>
  );
}

export function CamerasView() {
  const { settings } = useStore().data;
  const { entities } = useHa();
  const [live, setLive] = useState<string | null>(null);
  const [frigate, setFrigate] = useState<{ configured: boolean; ok: boolean; error?: string } | null>(null);
  const [events, setEvents] = useState<Detection[]>([]);
  const [snap, setSnap] = useState<Detection | null>(null);
  const name = (id: string) => entities.find((e) => e.entity_id === id)?.name ?? id;
  const cams = settings.cameras.list;

  useEffect(() => {
    fetch('api/frigate/status').then((r) => r.json()).then(setFrigate).catch(() => setFrigate(null));
  }, []);
  useEffect(() => {
    if (!frigate?.ok || !settings.cameras.detections) return;
    const load = () =>
      fetch(`api/frigate/events?${new URLSearchParams({ labels: settings.cameras.labels.join(',') })}`)
        .then((r) => r.json())
        .then((l) => Array.isArray(l) && setEvents(l))
        .catch(() => undefined);
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [frigate?.ok, settings.cameras.detections, settings.cameras.labels.join(',')]);

  return (
    <div className="cameras">
      <div className="view-head">
        <h1>{t('Cameras')}</h1>
      </div>
      <div className="cameras-scroll">
        {cams.length === 0 ? (
          <div className="empty">{t('Pick cameras in Settings → Cameras. Frigate, UniFi Protect, Reolink, and other Home Assistant cameras all work.')}</div>
        ) : (
          <div className={`cam-grid n${Math.min(cams.length, 4)}`}>
            {cams.map((id) => (
              <CameraTile key={id} id={id} name={name(id)} onOpen={() => setLive(id)} />
            ))}
          </div>
        )}

        {settings.cameras.detections && frigate?.configured && (
          <section>
            <h3 className="today-label">{t('Recent detections')} · Frigate</h3>
            {!frigate.ok && <p className="error small">{frigate.error}</p>}
            {frigate.ok && events.length === 0 && <p className="muted">{t('Nothing detected recently.')}</p>}
            <div className="det-grid">
              {events.map((e) => (
                <button key={e.id} className="det" onClick={() => setSnap(e)}>
                  <img src={`api/frigate/thumbnail/${encodeURIComponent(e.id)}`} alt="" loading="lazy" />
                  <span className="det-info">
                    <b>
                      {LABEL_ICON[e.label] ?? '•'} {e.sub_label || t(e.label.charAt(0).toUpperCase() + e.label.slice(1))}
                    </b>
                    <span className="muted small">
                      {e.camera.replace(/_/g, ' ')} · {formatDistanceToNowStrict(new Date(e.start * 1000), { addSuffix: true })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {live && (
        <div className="cam-full" onClick={() => setLive(null)}>
          <header>
            <Video size={20} /> <b>{name(live)}</b>
            <span className="live-dot">LIVE</span>
            <button className="icon-btn" aria-label={t('Close')}>
              <X />
            </button>
          </header>
          {/* MJPEG stream through the add-on; falls back to snapshots if the camera can't stream */}
          <img src={`api/ha/camera_stream/${live}`} alt="" onError={(ev) => ((ev.target as HTMLImageElement).src = `${api.cameraUrl(live)}?t=${Date.now()}`)} />
        </div>
      )}
      {snap && (
        <div className="cam-full" onClick={() => setSnap(null)}>
          <header>
            <b>
              {LABEL_ICON[snap.label] ?? ''} {snap.sub_label || snap.label} · {snap.camera.replace(/_/g, ' ')}
            </b>
            <span className="muted">{new Date(snap.start * 1000).toLocaleString()}</span>
            <button className="icon-btn" aria-label={t('Close')}>
              <X />
            </button>
          </header>
          <img src={`api/frigate/snapshot/${encodeURIComponent(snap.id)}`} alt="" />
        </div>
      )}
    </div>
  );
}
