import { Video } from 'lucide-react';
import { useState } from 'react';
import { useCameraName, useChosenCameras } from '../lib/cameras';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { CameraFull, DetectionFull, LiveImg, useDetections, LABEL_ICON, labelName, type Detection } from './CameraParts';
import { formatDistanceToNowStrict } from 'date-fns';

/** Today screen: one live camera, with the latest Frigate detections under it. */
export function TodayCamera({ asColumn = true }: { asColumn?: boolean }) {
  const { cameras } = useStore().data.settings;
  const chosen = useChosenCameras(cameras.list);
  const cam = cameras.today.camera || chosen[0];
  const name = useCameraName();
  const { status, events } = useDetections(cameras.today.show && cameras.today.detections);
  const [full, setFull] = useState(false);
  const [snap, setSnap] = useState<Detection | null>(null);
  if (!cameras.today.show || !cam) return null;

  return (
    <section className={asColumn ? 'person-col cam-col' : 'cam-card'}>
      <header className="person-head">
        <span className="avatar cam-avatar">
          <Video size={20} />
        </span>
        <h2>{name(cam)}</h2>
        <span className="live-dot">LIVE</span>
      </header>
      <button className="today-live" onClick={() => setFull(true)} aria-label={t('Open live view')}>
        <LiveImg cam={cam} h={360} fps={5} />
      </button>
      {cameras.today.detections && status?.ok && (
        <div className="person-tasks">
          <h3 className="today-label">{t('Recent detections')}</h3>
          {events.length === 0 && <p className="today-empty small">{t('Nothing detected recently.')}</p>}
          {events.slice(0, 4).map((d) => (
            <button key={d.id} className="today-det" onClick={() => setSnap(d)}>
              <img src={`api/frigate/thumbnail/${encodeURIComponent(d.id)}`} alt="" loading="lazy" />
              <span className="grow">
                <b>
                  {LABEL_ICON[d.label] ?? '•'} {labelName(d)}
                </b>
                <span className="muted small">
                  {d.camera.replace(/_/g, ' ')} · {formatDistanceToNowStrict(new Date(d.start * 1000), { addSuffix: true })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {full && <CameraFull cam={cam} onClose={() => setFull(false)} />}
      {snap && <DetectionFull d={snap} onClose={() => setSnap(null)} />}
    </section>
  );
}
