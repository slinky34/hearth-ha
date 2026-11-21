import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

interface Status {
  mode: string;
  domains: string[];
  counts: { calendar: number; todo: number; weather: number; media_player: number; notify: number };
  grocy: boolean;
  taskmate: boolean;
  barAssistant: boolean;
  mealieImages: boolean;
}

/** Settings → Integrations: what Hearth can see, and how to connect what's missing. */
export function Integrations() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch('api/integrations')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSt)
      .catch(() => setErr(true));
  }, []);

  const has = (d: string) => !!st?.domains.includes(d);
  const n = (k: keyof Status['counts']) => st?.counts[k] ?? 0;
  const rows: { icon: string; name: string; on: boolean; detail: string; how: string }[] = st
    ? [
        { icon: '📅', name: t('Calendars'), on: n('calendar') > 0, detail: t('{n} found', { n: n('calendar') }), how: t('Add Google Calendar, CalDAV (iCloud), Local Calendar, or another calendar integration in Home Assistant.') },
        { icon: '✅', name: t('To-do lists'), on: n('todo') > 0, detail: t('{n} found', { n: n('todo') }), how: t('Add Shopping List, Local To-do, Todoist, or AnyList in Home Assistant.') },
        { icon: '⛅', name: t('Weather'), on: n('weather') > 0, detail: t('{n} found', { n: n('weather') }), how: t('Add a weather integration (e.g. Met.no) in Home Assistant.') },
        { icon: '🎵', name: 'Music Assistant', on: has('music_assistant'), detail: t('{n} speakers', { n: n('media_player') }), how: t('Install Music Assistant and its Home Assistant integration for playlists, albums, and skipping on every speaker.') },
        { icon: '🍲', name: 'Mealie', on: has('mealie'), detail: st.mealieImages ? t('Recipes and photos') : t('Recipes (set mealie_url for photos)'), how: t('Add the Mealie integration in Home Assistant.') },
        { icon: '🍸', name: 'Bar Assistant', on: st.barAssistant, detail: t('Cocktail recipes'), how: t('Set the Bar Assistant address and token on the Hearth add-on’s Configuration tab.') },
        { icon: '🥫', name: 'Grocy', on: st.grocy, detail: t('Shopping, chores, expiring food, meal plan'), how: t('Install the Grocy custom integration (HACS) in Home Assistant.') },
        { icon: '⭐', name: 'TaskMate', on: st.taskmate, detail: t('Link kids’ chore lists under Family'), how: t('Install the TaskMate custom integration (HACS) in Home Assistant.') },
        { icon: '🛒', name: 'AnyList', on: has('anylist'), detail: t('Shows under Lists'), how: t('Install the AnyList custom integration (HACS); its lists appear as to-do lists.') },
        { icon: '📱', name: t('Phones'), on: n('notify') > 0, detail: t('{n} found', { n: n('notify') }), how: t('Install the Home Assistant Companion app on each phone.') },
      ]
    : [];

  return (
    <section className="card">
      <h2>{t('Integrations')}</h2>
      {err && <p className="error">{t('Couldn’t check integrations.')}</p>}
      {!st && !err && <p className="muted">{t('Loading…')}</p>}
      <div className="integrations">
        {rows.map((r) => (
          <div key={r.name} className={`integration ${r.on ? 'on' : ''}`}>
            <span className="int-icon">{r.icon}</span>
            <div className="grow">
              <b>{r.name}</b>
              <span className="muted small">{r.on ? r.detail : r.how}</span>
            </div>
            <span className={`int-status ${r.on ? 'on' : ''}`}>{r.on ? t('Connected') : t('Not set up')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
