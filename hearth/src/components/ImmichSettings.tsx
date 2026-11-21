import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { EntityPicker } from './EntityPicker';

/** Settings → Photos: choose Immich albums (and favorites) to show. */
export function ImmichSettings() {
  const { data, set } = useStore();
  const cfg = data.settings.immich;
  const [status, setStatus] = useState<{ configured: boolean; ok: boolean; error?: string } | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; count: number }[]>([]);

  useEffect(() => {
    fetch('api/immich/status')
      .then((r) => r.json())
      .then((st) => {
        setStatus(st);
        if (st.ok) fetch('api/immich/albums').then((r) => r.json()).then(setAlbums).catch(() => setAlbums([]));
      })
      .catch(() => setStatus({ configured: false, ok: false }));
  }, []);

  const update = (patch: Partial<typeof cfg>) => set('settings', (p) => ({ ...p, immich: { ...p.immich, ...patch } }));

  return (
    <div className="immich-settings">
      <h3 className="sub">Immich</h3>
      {!status && <p className="muted small">{t('Loading…')}</p>}
      {status && !status.configured && (
        <p className="muted small">{t('To show photos from Immich, set the Immich address and API key on the Hearth add-on’s Configuration tab, then restart it.')}</p>
      )}
      {status?.configured && !status.ok && <p className="error small">{status.error}</p>}
      {status?.ok && (
        <>
          <p className="muted small">{t('Pick albums to mix into the photo frame and screensaver.')}</p>
          <EntityPicker
            entities={albums.map((a) => ({ entity_id: a.id, name: `${a.name} (${a.count})` }))}
            selected={cfg.albums}
            onChange={(v) => update({ albums: v })}
            placeholder={t('Search albums…')}
            emptyHint={albums.length ? t('No albums chosen yet.') : t('No albums found in Immich.')}
          />
          <label className="row check-row">
            <input type="checkbox" checked={cfg.favorites} onChange={(e) => update({ favorites: e.target.checked })} />
            {t('Include my Immich favorites')}
          </label>
        </>
      )}
    </div>
  );
}
