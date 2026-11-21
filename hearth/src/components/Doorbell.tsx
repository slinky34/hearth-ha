import { BellRing, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { LiveImg } from './CameraParts';
import { softChime } from '../lib/sound';
import { useStore } from '../lib/store';

/** When the doorbell trigger fires, show the camera full-screen for a little while. */
export function Doorbell() {
  const { doorbell } = useStore().data.settings;
  const [open, setOpen] = useState(false);
  const last = useRef<string | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (!doorbell.trigger || !doorbell.camera) return;
    last.current = null;
    const domain = doorbell.trigger.split('.')[0];
    const poll = async () => {
      try {
        const s = await api.state(doorbell.trigger);
        const prev = last.current;
        last.current = s.state;
        if (prev === null) return; // first read: just remember
        // binary_sensor rings when it turns on; event/button-style entities ring when their state (a timestamp) changes.
        const rang = domain === 'binary_sensor' ? s.state === 'on' && prev !== 'on' : s.state !== prev && s.state !== 'unavailable';
        if (rang) {
          setOpen(true);
          softChime();
          clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setOpen(false), Math.max(10, doorbell.seconds) * 1000);
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [doorbell.trigger, doorbell.camera, doorbell.seconds]);


  if (!open) return null;
  return (
    <div className="doorbell" onPointerDown={() => setOpen(false)}>
      <div className="doorbell-card">
        <header>
          <BellRing size={22} /> <b>{t('Someone’s at the door')}</b>
          <button className="icon-btn" aria-label={t('Close')}>
            <X />
          </button>
        </header>
        <LiveImg cam={doorbell.camera} h={720} fps={12} />
      </div>
    </div>
  );
}
