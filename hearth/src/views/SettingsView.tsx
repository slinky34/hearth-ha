import { Lock, Plus, Trash2 } from 'lucide-react';
import { useHa } from '../lib/ha';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useKiosk } from '../lib/kiosk';
import { LANGUAGES, t } from '../lib/i18n';
import { PALETTES, swatch } from '../lib/themes';
import { CONTROL_DOMAINS } from './HomeView';
import { EntityPicker } from '../components/EntityPicker';
import { Section } from '../components/Section';
import { Integrations } from '../components/Integrations';
import { useStore } from '../lib/store';
import type { Member, Settings } from '../lib/types';
import { PALETTE, initials, uid } from '../lib/util';

export function SettingsView() {
  const { data, set, mode } = useStore();
  const { calendars, entities, colorOf, error } = useHa();
  const { setKiosk } = useKiosk();
  const { members, settings } = data;
  const s = <K extends keyof Settings>(k: K, v: Settings[K]) => set('settings', (p) => ({ ...p, [k]: v }));
  const updateMember = (id: string, patch: Partial<Member>) =>
    set('members', (prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const todos = entities.filter((e) => e.entity_id.startsWith('todo.'));
  const weathers = entities.filter((e) => e.entity_id.startsWith('weather.'));
  const players = entities.filter((e) => e.entity_id.startsWith('media_player.'));
  const controllable = entities.filter((e) => CONTROL_DOMAINS.includes(e.entity_id.split('.')[0]));
  const n = (patch: Partial<Settings['notify']>) => set('settings', (p) => ({ ...p, notify: { ...p.notify, ...patch } }));
  const [targets, setTargets] = useState<string[]>([]);
  const [tested, setTested] = useState('');
  const isDark = document.documentElement.dataset.theme === 'dark';
  useEffect(() => {
    api.notifyTargets().then(setTargets).catch(() => setTargets([]));
  }, []);
  const [photoDir, setPhotoDir] = useState('');
  useEffect(() => {
    api.status().then((st) => setPhotoDir(st.photoDir)).catch(() => undefined);
  }, []);

  return (
    <div className="settings">
      <div className="view-head">
        <h1>{t('Settings')}</h1>
      </div>

      <Section id="family" title={t('Family')} summary={t('{n} people', { n: members.length })}>
        <p className="muted small">
          {t('Link each person to their calendars to color-code their events. Calendars not linked to anyone are treated as shared and always shown.')}
        </p>
        {members.map((m) => (
          <div key={m.id} className="member-row">
            <span className="avatar lg" style={{ background: m.color }}>
              {initials(m.name)}
            </span>
            <div className="grow">
              <input value={m.name} onChange={(e) => updateMember(m.id, { name: e.target.value })} aria-label="Name" />
              <div className="swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${m.color === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => updateMember(m.id, { color: c })}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="chips">
                {calendars.map((c) => {
                  const on = m.calendars.includes(c.entity_id);
                  return (
                    <button
                      key={c.entity_id}
                      className={`chip small ${on ? 'on' : ''}`}
                      style={on ? { background: m.color, borderColor: m.color } : {}}
                      onClick={() =>
                        updateMember(m.id, {
                          calendars: on ? m.calendars.filter((x) => x !== c.entity_id) : [...m.calendars, c.entity_id],
                        })
                      }
                    >
                      📅 {c.name}
                    </button>
                  );
                })}
              </div>
              <label className="inline-select">
                <span className="muted small">{t('Chore list from Home Assistant (TaskMate or any to-do list)')}</span>
                <select value={m.todo ?? ''} onChange={(e) => updateMember(m.id, { todo: e.target.value || undefined })}>
                  <option value="">{t('None')}</option>
                  {todos.map((t) => (
                    <option key={t.entity_id} value={t.entity_id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="icon-btn"
              aria-label={t('Remove {name}', { name: m.name })}
              onClick={() => confirm(t('Remove {name}? Their chores will be removed too.', { name: m.name })) && (set('members', (p) => p.filter((x) => x.id !== m.id)), set('chores', (p) => p.filter((c) => c.memberId !== m.id)))}
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set('members', (p) => [...p, { id: uid(), name: t('New person'), color: PALETTE[p.length % PALETTE.length], calendars: [] }])
          }
        >
          <Plus size={18} /> {t('Add person')}
        </button>
      </Section>

      <Section id="calendars" title={t('Calendars')} summary={t('{n} found', { n: calendars.length })}>
        {error && <p className="error">Home Assistant: {error}</p>}
        {calendars.length === 0 && !error && <p className="muted">{t('No calendar entities found in Home Assistant.')}</p>}
        {calendars.map((c) => {
          const owner = members.find((m) => m.calendars.includes(c.entity_id));
          const hidden = settings.hiddenCalendars.includes(c.entity_id);
          return (
            <div key={c.entity_id} className="list-row">
              <i className="dot" style={{ background: colorOf(c.entity_id) }} />
              <span className="grow">
                {c.name} <span className="muted small">{c.entity_id}</span>
              </span>
              {owner ? (
                <span className="muted small">{t('color from {name}', { name: owner.name })}</span>
              ) : (
                <div className="swatches">
                  {PALETTE.map((col) => (
                    <button
                      key={col}
                      className={`swatch sm ${colorOf(c.entity_id) === col ? 'on' : ''}`}
                      style={{ background: col }}
                      onClick={() => s('calendarColors', { ...settings.calendarColors, [c.entity_id]: col })}
                      aria-label={`Color ${col}`}
                    />
                  ))}
                </div>
              )}
              <label className="row small">
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={() =>
                    s('hiddenCalendars', hidden ? settings.hiddenCalendars.filter((x) => x !== c.entity_id) : [...settings.hiddenCalendars, c.entity_id])
                  }
                />
                {t('Show')}
              </label>
            </div>
          );
        })}
      </Section>

      <Section id="lists" title={t('Lists')} summary={settings.lists.length ? t('{n} chosen', { n: settings.lists.length }) : t('All lists')}>
        <p className="muted small">{t('Choose which Home Assistant to-do lists appear. None selected shows all of them.')}</p>
        <EntityPicker
          entities={todos}
          selected={settings.lists}
          onChange={(v) => s('lists', v)}
          placeholder={t('Search lists…')}
          emptyHint={todos.length ? t('Showing every list.') : t('No to-do entities found.')}
        />
      </Section>

      <Section id="display" title={t('Display')}>
        <div className="settings-grid">
          <label>
            {t('Weather')}
            <select value={settings.weatherEntity} onChange={(e) => s('weatherEntity', e.target.value)}>
              <option value="">{t('None')}</option>
              {weathers.map((w) => (
                <option key={w.entity_id} value={w.entity_id}>
                  {w.name}
                </option>
              ))}
              {settings.weatherEntity && !weathers.some((w) => w.entity_id === settings.weatherEntity) && (
                <option value={settings.weatherEntity}>{settings.weatherEntity} ({t('not found')})</option>
              )}
            </select>
          </label>
          <label>
            {t('Week starts on')}
            <select value={settings.weekStartsOn} onChange={(e) => s('weekStartsOn', Number(e.target.value) as 0 | 1)}>
              <option value={0}>{t('Sunday')}</option>
              <option value={1}>{t('Monday')}</option>
            </select>
          </label>
          <label>
            {t('Clock')}
            <select value={settings.clock24 ? '24' : '12'} onChange={(e) => s('clock24', e.target.value === '24')}>
              <option value="12">{t('12-hour')}</option>
              <option value="24">{t('24-hour')}</option>
            </select>
          </label>
          <label>
            {t('Screensaver after')}
            <select value={settings.screensaverMinutes} onChange={(e) => s('screensaverMinutes', Number(e.target.value))}>
              <option value={0}>{t('Never')}</option>
              {[2, 5, 10, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {t('{n} minutes idle', { n })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Photo every')}
            <select value={settings.photoSeconds} onChange={(e) => s('photoSeconds', Number(e.target.value))}>
              {[6, 12, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {t('{n} seconds', { n })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Day view starts at')}
            <select value={settings.dayStartHour} onChange={(e) => s('dayStartHour', Number(e.target.value))}>
              {[5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}:00
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section id="look-language" title={t('Look & language')} summary={PALETTES.find((x) => x.id === settings.palette)?.name}>
        <div className="palette-grid">
          {PALETTES.map((p) => {
            const sw = swatch(p, isDark);
            const on = settings.palette === p.id;
            return (
              <button key={p.id} className={`palette ${on ? 'on' : ''}`} onClick={() => s('palette', p.id)} style={{ background: sw.bg, color: sw.text }}>
                <span className="palette-dots">
                  <i style={{ background: sw.surface }} />
                  <i style={{ background: sw.accent }} />
                  <i style={{ background: sw.text }} />
                </span>
                <span className="palette-name">{p.name}</span>
                {!p.light && p.dark && <span className="palette-tag">{t('Dark')}</span>}
                {p.light && !p.dark && <span className="palette-tag">{t('Light')}</span>}
              </button>
            );
          })}
        </div>
        <div className="settings-grid">
          <label>
            {t('Appearance')}
            <select value={settings.theme} onChange={(e) => s('theme', e.target.value as Settings['theme'])}>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
              <option value="auto">{t('Match device')}</option>
            </select>
          </label>
          <label>
            {t('Language')}
            <select value={settings.language} onChange={(e) => s('language', e.target.value)}>
              <option value="auto">{t('Match device')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section id="notifications" title={t('Notifications')} summary={settings.notify.targets.length ? t('{n} phones', { n: settings.notify.targets.length }) : undefined}>
        <div className="settings-grid">
          <label>
            {t('Remind before events')}
            <select value={settings.notify.eventMinutes} onChange={(e) => n({ eventMinutes: Number(e.target.value) })}>
              <option value={0}>{t('Off')}</option>
              {[5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {t('{n} minutes before', { n: m })}
                </option>
              ))}
            </select>
          </label>
          <label className="row check-row">
            <input type="checkbox" checked={settings.notify.screen} onChange={(e) => n({ screen: e.target.checked })} />
            {t('Show reminders on this display')}
          </label>
        </div>
        <h3 className="sub">{t('Send to phones')}</h3>
        <p className="muted small">
          {t('Uses Home Assistant notify services (the Companion app adds one per phone). Sent once by the add-on, not once per screen.')}
        </p>
        <div className="notify-targets">
          {targets.map((tg) => {
            const on = settings.notify.targets.includes(tg);
            return (
              <div key={tg} className="list-row">
                <label className="row grow">
                  <input type="checkbox" checked={on} onChange={() => n({ targets: on ? settings.notify.targets.filter((x) => x !== tg) : [...settings.notify.targets, tg] })} />
                  {tg.replace('notify.', '').replace(/^mobile_app_/, '📱 ').replace(/_/g, ' ')}
                </label>
                <button className="btn small ghost" onClick={() => api.notifyTest(tg).then(() => setTested(tg)).catch(() => setTested('!' + tg))}>
                  {tested === tg ? t('Sent ✓') : tested === '!' + tg ? t('Failed') : t('Send test')}
                </button>
              </div>
            );
          })}
          {targets.length === 0 && <p className="muted small">{t('No notify services found in Home Assistant.')}</p>}
        </div>
        <div className="settings-grid">
          <label className="row check-row">
            <input type="checkbox" checked={settings.notify.timers} onChange={(e) => n({ timers: e.target.checked })} />
            {t('Timer alerts')}
          </label>
          <label>
            {t('Daily “chores left” reminder')}
            <input type="time" value={settings.notify.choreTime} onChange={(e) => n({ choreTime: e.target.value })} />
          </label>
        </div>
      </Section>

      <Section id="calendar" title={t('Calendar')}>
        <div className="settings-grid">
          <label>
            {t('Family name (shown in the header)')}
            <input value={settings.familyName} placeholder={t('e.g. Miller Family')} onChange={(e) => s('familyName', e.target.value)} />
          </label>
          <label>
            {t('Default calendar view')}
            <select value={settings.calendarView} onChange={(e) => s('calendarView', e.target.value as Settings['calendarView'])}>
              <option value="day">{t('Day')}</option>
              <option value="week">{t('Week (columns)')}</option>
              <option value="schedule">{t('Schedule (day cards)')}</option>
              <option value="grid">{t('Grid (hours)')}</option>
              <option value="month">{t('Month')}</option>
            </select>
          </label>
          <label>
            {t('Grid view shows')}
            <select value={settings.gridDays} onChange={(e) => s('gridDays', Number(e.target.value) as 5 | 7)}>
              <option value={5}>{t('Next 5 days')}</option>
              <option value={7}>{t('Whole week')}</option>
            </select>
          </label>
        </div>
        <h3 className="sub">{t('Countdowns')}</h3>
        <p className="muted small">{t('Shown as chips above the calendar, like “🌴 Vacation 48 days”.')}</p>
        {settings.countdowns.map((c) => (
          <div key={c.id} className="row countdown-row">
            <input className="emoji-input" value={c.emoji} onChange={(e) => s('countdowns', settings.countdowns.map((x) => (x.id === c.id ? { ...x, emoji: e.target.value } : x)))} />
            <input value={c.title} onChange={(e) => s('countdowns', settings.countdowns.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)))} />
            <input type="date" value={c.date} onChange={(e) => s('countdowns', settings.countdowns.map((x) => (x.id === c.id ? { ...x, date: e.target.value } : x)))} style={{ maxWidth: 180 }} />
            <button className="icon-btn" aria-label={t('Remove countdown')} onClick={() => s('countdowns', settings.countdowns.filter((x) => x.id !== c.id))}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <div>
          <button className="btn" onClick={() => s('countdowns', [...settings.countdowns, { id: uid(), title: t('Something fun'), emoji: '🎉', date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) }])}>
            <Plus size={18} /> {t('Add countdown')}
          </button>
        </div>
      </Section>

      <Section id="music" title={t('Music')} summary={settings.musicPlayers.length ? t('{n} chosen', { n: settings.musicPlayers.length }) : t('All speakers')}>
        <p className="muted small">{t('Speakers to show. None selected shows every media player (Sonos, Music Assistant, Cast, Spotify…).')}</p>
        <EntityPicker
          entities={players}
          selected={settings.musicPlayers}
          onChange={(v) => s('musicPlayers', v)}
          placeholder={t('Search speakers…')}
          emptyHint={players.length ? t('Showing every speaker.') : t('No media players found.')}
        />
      </Section>

      <Section id="home-controls" title={t('Home controls')} summary={t('{n} chosen', { n: settings.controls.length })}>
        <p className="muted small">
          {t('Lights, switches, fans, scenes, scripts, and sensors for the Home screen. Locks, alarms, and garage doors are intentionally not controllable from a wall display.')}
        </p>
        <EntityPicker
          entities={controllable}
          selected={settings.controls}
          onChange={(v) => s('controls', v)}
          placeholder={t('Search entities…')}
          emptyHint={t('Search above to add entities.')}
        />
      </Section>

      <Section id="photos" title={t('Photos')}>
        <p className="muted small">
          {t('Showing photos from {dir} and its subfolders.', { dir: photoDir || '…' })}{' '}
          {t('To use a different folder, change Photo folder on the Hearth add-on’s Configuration tab (anything under /media or /share, e.g. /media/Photos/Family), then restart the add-on.')}
        </p>
      </Section>

      <Section id="kiosk-mode" title={t('Kiosk mode')}>
        <p className="muted small">
          {t('For a wall tablet: goes fullscreen (hiding Home Assistant’s sidebar too), keeps the screen awake, hides the cursor, and locks Settings, chore editing, and photo deletion. It only applies to this screen. To leave, hold the 🏡 logo for 2 seconds or tap Locked. You can also add ?kiosk to the end of its address to turn it on.')}
        </p>
        <label className="pin-row">
          <span className="muted small">{t('PIN to leave kiosk mode (optional, digits only)')}</span>
          <input
            type="password"
            inputMode="numeric"
            placeholder={t('No PIN')}
            value={settings.kioskPin}
            onChange={(e) => s('kioskPin', e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{ maxWidth: 220 }}
          />
        </label>
        <div>
          <button className="btn primary" onClick={() => setKiosk(true)}>
            <Lock size={18} /> {t('Turn on kiosk mode on this screen')}
          </button>
        </div>
      </Section>

      <Integrations />

      <Section id="about" title={t('About')}>
        <p className="muted">
          {mode === 'addon' && t('Connected to Home Assistant (add-on).')}
          {mode === 'remote' && t('Connected to Home Assistant via HA_URL.')}
          {mode === 'demo' && t('Demo mode: showing sample calendars, lists, and weather. Run as a Home Assistant add-on, or set HA_URL and HA_TOKEN, to use your real data.')}
        </p>
      </Section>
    </div>
  );
}
