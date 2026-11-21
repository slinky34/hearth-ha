import { Lock, Play, Plus, Trash2 } from 'lucide-react';
import { PhotoPicker } from '../components/PhotoPicker';
import { useHa } from '../lib/ha';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useKiosk } from '../lib/kiosk';
import { LANGUAGES, t } from '../lib/i18n';
import { PALETTES, swatch } from '../lib/themes';
import { CONTROL_DOMAINS } from './HomeView';
import { EntityPicker } from '../components/EntityPicker';
import { Section } from '../components/Section';
import { Integrations } from '../components/Integrations';
import { toast } from '../components/Toast';
import { ImmichSettings } from '../components/ImmichSettings';
import { SS_STYLES } from './Screensaver';
import { TABS } from '../lib/tabs';
import { cameraLabel, useAllCameras } from '../lib/cameras';
import { useStore } from '../lib/store';
import type { Member, Settings } from '../lib/types';
import { PALETTE, uid } from '../lib/util';

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
  const persons = entities.filter((e) => e.entity_id.startsWith('person.'));
  const ttsEngines = entities.filter((e) => e.entity_id.startsWith('tts.'));
  const cameras = useAllCameras();
  const doorbellTriggers = entities.filter((e) => e.entity_id.startsWith('binary_sensor.') || e.entity_id.startsWith('event.'));
  const screenSwitches = entities.filter((e) => /^(switch|light|input_boolean)\./.test(e.entity_id));
  const restoreInput = useRef<HTMLInputElement>(null);
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ hearth: 1, exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hearth-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text());
      const d = parsed?.data ?? parsed;
      if (!d || typeof d !== 'object' || !Array.isArray(d.members)) throw new Error(t('That file isn’t a Hearth backup.'));
      if (!confirm(t('Replace all of Hearth’s family data and settings with this backup?'))) return;
      (['members', 'chores', 'completions', 'meals', 'settings', 'rewards', 'redemptions', 'notes', 'timers'] as const).forEach((k) => {
        if (d[k] !== undefined) set(k, d[k]);
      });
      toast(t('Backup restored'), 'info');
    } catch (e) {
      toast((e as Error).message);
    }
  };
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
            <PhotoPicker m={m} onChange={(photo) => updateMember(m.id, { photo })} />
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
              <div className="row wrap-row">
                <label className="inline-select">
                  <span className="muted small">{t('Who’s home (HA person)')}</span>
                  <select value={m.person ?? ''} onChange={(e) => updateMember(m.id, { person: e.target.value || undefined })}>
                    <option value="">{t('None')}</option>
                    {persons.map((p) => (
                      <option key={p.entity_id} value={p.entity_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-select">
                  <span className="muted small">{t('Birthday')}</span>
                  <input type="date" value={m.birthday ?? ''} onChange={(e) => updateMember(m.id, { birthday: e.target.value || undefined })} />
                </label>
              </div>
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
        <h3 className="sub">{t('Read notes aloud')}</h3>
        <div className="settings-grid">
          <label>
            {t('Voice (text-to-speech)')}
            <select value={settings.tts.engine} onChange={(e) => s('tts', { ...settings.tts, engine: e.target.value })}>
              <option value="">{t('None')}</option>
              {ttsEngines.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            {t('Speaker')}
            <select value={settings.tts.speaker} onChange={(e) => s('tts', { ...settings.tts, speaker: e.target.value })}>
              <option value="">{t('None')}</option>
              {players.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.name}</option>)}
            </select>
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
        <h3 className="sub">{t('Leave-by times')}</h3>
        <p className="muted small">{t('Shows drive time and when to leave for events with a location, using the Waze Travel Time integration in Home Assistant.')}</p>
        <div className="settings-grid">
          <label className="row check-row">
            <input type="checkbox" checked={settings.leaveBy.enabled} onChange={(e) => s('leaveBy', { ...settings.leaveBy, enabled: e.target.checked })} />
            {t('Show leave-by times')}
          </label>
          <label>
            {t('Region')}
            <select value={settings.leaveBy.region} onChange={(e) => s('leaveBy', { ...settings.leaveBy, region: e.target.value })}>
              {[['us', 'US'], ['na', 'North America'], ['eu', 'Europe'], ['il', 'Israel'], ['au', 'Australia']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>
            {t('Extra minutes')}
            <input type="number" min={0} max={60} value={settings.leaveBy.buffer} onChange={(e) => s('leaveBy', { ...settings.leaveBy, buffer: Number(e.target.value) || 0 })} />
          </label>
        </div>
      </Section>

      <Section id="sleep" title={t('Sleep mode')} summary={settings.sleep.enabled ? `${settings.sleep.start}–${settings.sleep.end}` : t('Off')}>
        <p className="muted small">{t('At night the screen dims to a faint clock (or goes black). Tap to wake it for 5 minutes. Pick a Fully Kiosk “Screen” switch to also turn the tablet’s screen fully off and back on in the morning.')}</p>
        <div className="settings-grid">
          <label className="row check-row">
            <input type="checkbox" checked={settings.sleep.enabled} onChange={(e) => s('sleep', { ...settings.sleep, enabled: e.target.checked })} />
            {t('Use sleep mode')}
          </label>
          <label>
            {t('Bedtime')}
            <input type="time" value={settings.sleep.start} onChange={(e) => s('sleep', { ...settings.sleep, start: e.target.value })} />
          </label>
          <label>
            {t('Wake up')}
            <input type="time" value={settings.sleep.end} onChange={(e) => s('sleep', { ...settings.sleep, end: e.target.value })} />
          </label>
          <label>
            {t('Look')}
            <select value={settings.sleep.mode} onChange={(e) => s('sleep', { ...settings.sleep, mode: e.target.value as 'dim' | 'black' })}>
              <option value="dim">{t('Dim clock')}</option>
              <option value="black">{t('Black')}</option>
            </select>
          </label>
          <label>
            {t('Tablet screen switch (optional)')}
            <select value={settings.sleep.screenEntity} onChange={(e) => s('sleep', { ...settings.sleep, screenEntity: e.target.value })}>
              <option value="">{t('None')}</option>
              {screenSwitches.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.name}</option>)}
            </select>
          </label>
        </div>
      </Section>

      <Section id="cameras" title={t('Cameras')} summary={settings.cameras.list.length ? t('{n} chosen', { n: settings.cameras.list.length }) : undefined}>
        <EntityPicker
          entities={cameras}
          labelFor={cameraLabel}
          selected={settings.cameras.list}
          onChange={(v) => s('cameras', { ...settings.cameras, list: v })}
          placeholder={t('Search cameras…')}
          emptyHint={cameras.length ? t('No cameras chosen yet.') : t('No cameras found in Home Assistant.')}
        />
        <label className="row check-row">
          <input type="checkbox" checked={settings.cameras.detections} onChange={(e) => s('cameras', { ...settings.cameras, detections: e.target.checked })} />
          {t('Show recent Frigate detections')}
        </label>
        <h3 className="today-label">{t('Today screen')}</h3>
        <div className="settings-grid">
          <label className="row check-row">
            <input type="checkbox" checked={settings.cameras.today.show} onChange={(e) => s('cameras', { ...settings.cameras, today: { ...settings.cameras.today, show: e.target.checked } })} />
            {t('Show a live camera on Today')}
          </label>
          {settings.cameras.today.show && (
            <>
              <div className="today-cam-picker">
                <EntityPicker
                  entities={cameras}
          labelFor={cameraLabel}
                  selected={settings.cameras.today.cameras}
                  onChange={(v) => s('cameras', { ...settings.cameras, today: { ...settings.cameras.today, cameras: v } })}
                  placeholder={t('Add cameras to Today…')}
                  emptyHint={t('None picked: Today shows the first chosen camera.')}
                />
              </div>
              <label className="row check-row">
                <input type="checkbox" checked={settings.cameras.today.detections} onChange={(e) => s('cameras', { ...settings.cameras, today: { ...settings.cameras.today, detections: e.target.checked } })} />
                {t('Show latest detections next to it')}
              </label>
            </>
          )}
        </div>
        {settings.cameras.detections && (
          <div className="chips">
            {['person', 'car', 'package', 'dog', 'cat', 'bicycle'].map((l) => {
              const on = settings.cameras.labels.includes(l);
              return (
                <button key={l} className={`chip small ${on ? 'on' : ''}`} onClick={() => s('cameras', { ...settings.cameras, labels: on ? settings.cameras.labels.filter((x) => x !== l) : [...settings.cameras.labels, l] })}>
                  {t(l.charAt(0).toUpperCase() + l.slice(1))}
                </button>
              );
            })}
          </div>
        )}
        <p className="muted small">{t('Hearth finds the Frigate add-on on its own. If Frigate runs on another machine, set the Frigate address on the Hearth add-on’s Configuration tab (http://<its IP>:5000). For the doorbell pop-up, a Frigate “person occupancy” sensor works as the trigger.')}</p>
      </Section>

      <Section id="doorbell" title={t('Doorbell')} summary={settings.doorbell.trigger ? undefined : t('Off')}>
        <p className="muted small">{t('When the doorbell rings, show the camera on screen.')}</p>
        <div className="settings-grid">
          <label>
            {t('Doorbell sensor or event')}
            <select value={settings.doorbell.trigger} onChange={(e) => s('doorbell', { ...settings.doorbell, trigger: e.target.value })}>
              <option value="">{t('None')}</option>
              {doorbellTriggers.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            {t('Camera')}
            <select value={settings.doorbell.camera} onChange={(e) => s('doorbell', { ...settings.doorbell, camera: e.target.value })}>
              <option value="">{t('None')}</option>
              {cameras.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            {t('Show for (seconds)')}
            <input type="number" min={10} max={300} value={settings.doorbell.seconds} onChange={(e) => s('doorbell', { ...settings.doorbell, seconds: Number(e.target.value) || 30 })} />
          </label>
        </div>
        {mode === 'demo' && settings.doorbell.trigger && (
          <div>
            <button className="btn" onClick={() => fetch('api/mock/ring')}>🔔 {t('Ring (demo)')}</button>
          </div>
        )}
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

      <Section id="photos" title={t('Photos')} summary={settings.immich.albums.length ? t('{n} Immich albums', { n: settings.immich.albums.length }) : undefined}>
        <p className="muted small">
          {t('Showing photos from {dir} and its subfolders.', { dir: photoDir || '…' })}{' '}
          {t('To use a different folder, change Photo folder on the Hearth add-on’s Configuration tab (anything under /media or /share, e.g. /media/Photos/Family), then restart the add-on.')}
        </p>
        <ImmichSettings />
      </Section>

      <Section id="screensaver" title={t('Screensaver')} summary={t(SS_STYLES.find((x) => x.id === settings.screensaverStyle)?.label ?? 'Ken Burns')}>
        <div className="ss-style-grid">
          {SS_STYLES.map((st) => (
            <button key={st.id} className={`ss-style ${settings.screensaverStyle === st.id ? 'on' : ''}`} onClick={() => s('screensaverStyle', st.id)}>
              <span>{st.icon}</span>
              <span>{t(st.label)}</span>
            </button>
          ))}
        </div>
        <div>
          <button className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent('hearth:screensaver', { detail: settings.screensaverStyle }))}>
            <Play size={18} /> {t('Preview')}
          </button>
        </div>
        <div className="settings-grid">
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
          <label className="row check-row">
            <input type="checkbox" checked={settings.ssShuffle} onChange={(e) => s('ssShuffle', e.target.checked)} />
            {t('Shuffle photos')}
          </label>
          <label className="row check-row">
            <input type="checkbox" checked={settings.ssClock} onChange={(e) => s('ssClock', e.target.checked)} />
            {t('Show clock')}
          </label>
          <label className="row check-row">
            <input type="checkbox" checked={settings.ssInfo} onChange={(e) => s('ssInfo', e.target.checked)} />
            {t('Show weather, next events, and music')}
          </label>
        </div>
      </Section>

      <Section id="sidebar" title={t('Sidebar')} summary={settings.nav.hidden.length ? t('{n} hidden', { n: settings.nav.hidden.length }) : undefined}>
        <p className="muted small">{t('Choose which screens appear in the sidebar. Today and Settings are always there.')}</p>
        <div className="settings-grid">
          <label>
            {t('Space above the sidebar')}
            <select
              value={String(settings.nav.topGap)}
              onChange={(e) => s('nav', { ...settings.nav, topGap: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
            >
              <option value="auto">{t('Automatic')}</option>
              <option value="0">{t('None')}</option>
              <option value="50">{t('Small')}</option>
              <option value="90">{t('Medium')}</option>
              <option value="130">{t('Large')}</option>
            </select>
          </label>
        </div>
        <p className="muted small">{t('If something covers the top of the sidebar (like iPad window controls), add space here.')} {t('This screen:')} <ScreenInfo /></p>
        <div className="nav-list">
          {TABS.filter((x) => x.id !== 'today').map(({ id, label, Icon }) => {
            const shown = !settings.nav.hidden.includes(id);
            const merged = id === 'rewards' && settings.nav.rewardsInTasks;
            return (
              <label key={id} className="list-row row">
                <input
                  type="checkbox"
                  checked={shown && !merged}
                  disabled={merged}
                  onChange={() => s('nav', { ...settings.nav, hidden: shown ? [...settings.nav.hidden, id] : settings.nav.hidden.filter((x) => x !== id) })}
                />
                <Icon size={20} />
                <span className="grow">{t(label)}</span>
                {merged && <span className="muted small">{t('inside Tasks')}</span>}
              </label>
            );
          })}
        </div>
        <label className="row check-row">
          <input type="checkbox" checked={settings.nav.rewardsInTasks} onChange={(e) => s('nav', { ...settings.nav, rewardsInTasks: e.target.checked })} />
          {t('Show Rewards inside Tasks instead of its own tab')}
        </label>
        <label className="row check-row">
          <input type="checkbox" checked={settings.nav.showFull} onChange={(e) => s('nav', { ...settings.nav, showFull: e.target.checked })} />
          {t('Show the Fullscreen button')}
        </label>
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
        <label className="row check-row">
          <input type="checkbox" checked={settings.rewardPin} onChange={(e) => s('rewardPin', e.target.checked)} />
          {t('Ask for this PIN before approving rewards')}
        </label>
      </Section>

      <Integrations />

      <Section id="about" title={t('About')}>
        <p className="muted">
          {mode === 'addon' && t('Connected to Home Assistant (add-on).')}
          {mode === 'remote' && t('Connected to Home Assistant via HA_URL.')}
          {mode === 'demo' && t('Demo mode: showing sample calendars, lists, and weather. Run as a Home Assistant add-on, or set HA_URL and HA_TOKEN, to use your real data.')}
        </p>
        <h3 className="sub">{t('Backup')}</h3>
        <p className="muted small">{t('Hearth’s data (family, chores, rewards, meals, notes, settings) is included in Home Assistant backups. You can also save a copy here.')}</p>
        <div className="row">
          <button className="btn" onClick={exportData}>{t('Download backup')}</button>
          <button className="btn ghost" onClick={() => restoreInput.current?.click()}>{t('Restore from file')}</button>
          <input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importData(f); }} />
        </div>
      </Section>
    </div>
  );
}

/** What Hearth detects about this screen (helps sort out layout problems on tablets). */
function ScreenInfo() {
  const [info, setInfo] = useState('');
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-left:env(safe-area-inset-left);visibility:hidden';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const cls = document.documentElement.classList;
    const nav = navigator as Navigator & { standalone?: boolean };
    setInfo(
      [
        cls.contains('standalone') ? 'home-screen app' : 'browser',
        cls.contains('ipad-app') ? 'iPad' : /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 ? 'iPad (browser)' : '',
        `display-mode ${['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => window.matchMedia(`(display-mode: ${m})`).matches) ?? '?'}`,
        nav.standalone !== undefined ? `navigator.standalone ${nav.standalone}` : '',
        `safe area ${cs.paddingTop} / ${cs.paddingLeft}`,
        `${window.innerWidth}×${window.innerHeight}`,
      ].filter(Boolean).join(' · '),
    );
    probe.remove();
  }, []);
  return <code>{info}</code>;
}
