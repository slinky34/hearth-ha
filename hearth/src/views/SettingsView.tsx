import { Lock, Plus, Trash2 } from 'lucide-react';
import { useHa } from '../lib/ha';
import { useKiosk } from '../lib/kiosk';
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

  return (
    <div className="settings">
      <div className="view-head">
        <h1>Settings</h1>
      </div>

      <section className="card">
        <h2>Family</h2>
        <p className="muted small">
          Link each person to their calendars to color-code their events. Calendars not linked to anyone are treated as
          shared and always shown.
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
            </div>
            <button
              className="icon-btn"
              aria-label={`Remove ${m.name}`}
              onClick={() => confirm(`Remove ${m.name}? Their chores will be removed too.`) && (set('members', (p) => p.filter((x) => x.id !== m.id)), set('chores', (p) => p.filter((c) => c.memberId !== m.id)))}
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set('members', (p) => [...p, { id: uid(), name: 'New person', color: PALETTE[p.length % PALETTE.length], calendars: [] }])
          }
        >
          <Plus size={18} /> Add person
        </button>
      </section>

      <section className="card">
        <h2>Calendars</h2>
        {error && <p className="error">Home Assistant: {error}</p>}
        {calendars.length === 0 && !error && <p className="muted">No calendar entities found in Home Assistant.</p>}
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
                <span className="muted small">color from {owner.name}</span>
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
                Show
              </label>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>Lists</h2>
        <p className="muted small">Choose which Home Assistant to-do lists appear. None selected shows all of them.</p>
        <div className="chips">
          {todos.map((t) => {
            const on = settings.lists.includes(t.entity_id);
            return (
              <button
                key={t.entity_id}
                className={`chip ${on ? 'on' : ''}`}
                onClick={() => s('lists', on ? settings.lists.filter((x) => x !== t.entity_id) : [...settings.lists, t.entity_id])}
              >
                {t.name}
              </button>
            );
          })}
          {todos.length === 0 && <span className="muted">No to-do entities found.</span>}
        </div>
      </section>

      <section className="card">
        <h2>Display</h2>
        <div className="settings-grid">
          <label>
            Weather
            <select value={settings.weatherEntity} onChange={(e) => s('weatherEntity', e.target.value)}>
              <option value="">None</option>
              {weathers.map((w) => (
                <option key={w.entity_id} value={w.entity_id}>
                  {w.name}
                </option>
              ))}
              {settings.weatherEntity && !weathers.some((w) => w.entity_id === settings.weatherEntity) && (
                <option value={settings.weatherEntity}>{settings.weatherEntity} (not found)</option>
              )}
            </select>
          </label>
          <label>
            Theme
            <select value={settings.theme} onChange={(e) => s('theme', e.target.value as Settings['theme'])}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Match device</option>
            </select>
          </label>
          <label>
            Week starts on
            <select value={settings.weekStartsOn} onChange={(e) => s('weekStartsOn', Number(e.target.value) as 0 | 1)}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
          <label>
            Clock
            <select value={settings.clock24 ? '24' : '12'} onChange={(e) => s('clock24', e.target.value === '24')}>
              <option value="12">12-hour</option>
              <option value="24">24-hour</option>
            </select>
          </label>
          <label>
            Screensaver after
            <select value={settings.screensaverMinutes} onChange={(e) => s('screensaverMinutes', Number(e.target.value))}>
              <option value={0}>Never</option>
              {[2, 5, 10, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} minutes idle
                </option>
              ))}
            </select>
          </label>
          <label>
            Photo every
            <select value={settings.photoSeconds} onChange={(e) => s('photoSeconds', Number(e.target.value))}>
              {[6, 12, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            Day view starts at
            <select value={settings.dayStartHour} onChange={(e) => s('dayStartHour', Number(e.target.value))}>
              {[5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}:00
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Kiosk mode</h2>
        <p className="muted small">
          For a wall tablet: goes fullscreen (hiding Home Assistant’s sidebar too), keeps the screen awake, hides the
          cursor, and locks Settings, chore editing, and photo deletion. It only applies to this screen. To leave, hold
          the 🏡 logo for 2 seconds or tap <b>Locked</b>. You can also open Hearth with <code>?kiosk</code> at the end of
          its address (direct-port access) to turn it on.
        </p>
        <label className="pin-row">
          <span className="muted small">PIN to leave kiosk mode (optional, digits only)</span>
          <input
            type="password"
            inputMode="numeric"
            placeholder="No PIN"
            value={settings.kioskPin}
            onChange={(e) => s('kioskPin', e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{ maxWidth: 220 }}
          />
        </label>
        <div>
          <button className="btn primary" onClick={() => setKiosk(true)}>
            <Lock size={18} /> Turn on kiosk mode on this screen
          </button>
        </div>
      </section>

      <section className="card">
        <h2>About</h2>
        <p className="muted">
          {mode === 'addon' && 'Connected to Home Assistant (add-on).'}
          {mode === 'remote' && 'Connected to Home Assistant via HA_URL.'}
          {mode === 'demo' && 'Demo mode: showing sample calendars, lists, and weather. Run as a Home Assistant add-on, or set HA_URL and HA_TOKEN, to use your real data.'}
        </p>
      </section>
    </div>
  );
}
