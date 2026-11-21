import { Play, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useKiosk } from '../lib/kiosk';
import { t } from '../lib/i18n';

export function usePhotos() {
  const [photos, setPhotos] = useState<string[]>([]);
  const load = () => api.photos().then(setPhotos).catch(() => setPhotos([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60000);
    return () => clearInterval(t);
  }, []);
  return { photos, reload: load };
}

export function PhotosView({ onSlideshow }: { onSlideshow: () => void }) {
  const { photos, reload } = usePhotos();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const { kiosk } = useKiosk();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    for (let i = 0; i < list.length; i++) {
      setBusy(t('Uploading {i} of {n}…', { i: i + 1, n: list.length }));
      try {
        await api.uploadPhoto(list[i]);
      } catch (e) {
        alert(`${list[i].name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    reload();
  };

  return (
    <div className="photos">
      <div className="view-head">
        <h1>{t('Photos')}</h1>
        <div className="nav-group">
          {busy && <span className="muted">{busy}</span>}
          {photos.length > 0 && !kiosk && (
            <button className={`btn ${manage ? 'on' : 'ghost'}`} onClick={() => setManage((m) => !m)}>
              {manage ? t('Done') : t('Manage')}
            </button>
          )}
          <button className="btn" onClick={() => input.current?.click()}>
            <Upload size={18} /> {t('Add photos')}
          </button>
          <button className="btn primary" onClick={onSlideshow} disabled={!photos.length}>
            <Play size={18} /> {t('Slideshow')}
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {photos.length === 0 ? (
        <div className="empty">
          {t('No photos yet. Tap Add photos, or copy pictures into the photo folder in Home Assistant (see Settings → Photos).')}
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <figure key={p}>
              <img src={api.photoUrl(p)} loading="lazy" alt="" />
              {manage && !kiosk && (
                <button
                  className="icon-btn filled danger"
                  aria-label={t('Delete photo')}
                  onClick={async () => {
                    if (!confirm(t('Delete this photo?'))) return;
                    await api.deletePhoto(p).catch(() => undefined);
                    reload();
                  }}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
