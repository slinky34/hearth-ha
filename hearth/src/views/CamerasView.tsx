import { useEffect, useState } from 'react';
import { CameraFull, DetectionFull, DetectionTile, useDetections, type Detection } from '../components/CameraParts';
import { snapUrl, useCameraName, useChosenCameras } from '../lib/cameras';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';

/** A camera tile showing a still that refreshes every few seconds; tap for live video. */
function CameraTile({ cam, name, onOpen }: { cam: string; name: string; onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && setTick((x) => x + 1), 3000);
    return () => clearInterval(id);
  }, []);
  const src = snapUrl(cam, 480);
  return (
    <button className="cam-tile" onClick={onOpen}>
      <img src={`${src}${src.includes('?') ? '&' : '?'}t=${tick}`} alt="" />
      <span className="cam-name">{name}</span>
    </button>
  );
}

export function CamerasView() {
  const { settings } = useStore().data;
  const name = useCameraName();
  const cams = useChosenCameras(settings.cameras.list);
  const [live, setLive] = useState<string | null>(null);
  const [snap, setSnap] = useState<Detection | null>(null);
  const { status: frigate, events } = useDetections(settings.cameras.detections);

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
              <CameraTile key={id} cam={id} name={name(id)} onOpen={() => setLive(id)} />
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
                <DetectionTile key={e.id} d={e} onClick={() => setSnap(e)} />
              ))}
            </div>
          </section>
        )}
      </div>
      {live && <CameraFull cam={live} onClose={() => setLive(null)} />}
      {snap && <DetectionFull d={snap} onClose={() => setSnap(null)} />}
    </div>
  );
}
