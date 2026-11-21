import {
  CalendarDays, Image, LayoutGrid, ListChecks, Lock, Maximize, Settings as Gear, Sparkles, UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './components/Modal';
import { TopBar } from './components/TopBar';
import { HaProvider } from './lib/ha';
import { useIdle } from './lib/hooks';
import { KioskProvider, enterFullscreen, useKiosk } from './lib/kiosk';
import { StoreProvider, useStore } from './lib/store';
import { WeatherProvider } from './lib/weather';
import { CalendarView } from './views/CalendarView';
import { ChoresView } from './views/ChoresView';
import { ListsView } from './views/ListsView';
import { MealsView } from './views/MealsView';
import { PhotosView } from './views/PhotosView';
import { Screensaver } from './views/Screensaver';
import { SettingsView } from './views/SettingsView';
import { TodayView } from './views/TodayView';

const TABS = [
  { id: 'today', label: 'Today', Icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'chores', label: 'Chores', Icon: Sparkles },
  { id: 'lists', label: 'Lists', Icon: ListChecks },
  { id: 'meals', label: 'Meals', Icon: UtensilsCrossed },
  { id: 'photos', label: 'Photos', Icon: Image },
] as const;
type Tab = (typeof TABS)[number]['id'] | 'settings';
const ALL_TABS: string[] = [...TABS.map((t) => t.id), 'settings'];

function useTheme(theme: 'light' | 'dark' | 'auto') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121521' : '#FBF8F4');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Asks for the kiosk PIN (if one is set) before leaving kiosk mode. */
function ExitKiosk({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const { setKiosk } = useKiosk();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const pinSet = Boolean(data.settings.kioskPin);
  const unlock = () => {
    if (pinSet && pin !== data.settings.kioskPin) {
      setErr(true);
      setPin('');
      return;
    }
    setKiosk(false);
    onClose();
  };
  return (
    <Modal
      title="Leave kiosk mode?"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={unlock}>
            Unlock
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>
          This unlocks Settings and editing on this screen.
        </p>
        {pinSet && (
          <input
            autoFocus
            className="big pin-input"
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setErr(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
          />
        )}
        {err && <p className="error">Wrong PIN.</p>}
      </div>
    </Modal>
  );
}

function Shell() {
  const { data, saveError } = useStore();
  const { kiosk } = useKiosk();
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return (ALL_TABS.includes(h) ? h : 'today') as Tab;
  });
  const [idle, setIdle] = useIdle(data.settings.screensaverMinutes);
  const [exiting, setExiting] = useState(false);
  const press = useRef(0);
  useTheme(data.settings.theme);

  useEffect(() => {
    history.replaceState(null, '', `${location.search}#${tab}`);
  }, [tab]);

  // Drift back home while nobody is using the screen.
  useEffect(() => {
    if (idle) setTab('today');
  }, [idle]);

  // Settings is locked in kiosk mode.
  useEffect(() => {
    if (kiosk && tab === 'settings') setTab('today');
  }, [kiosk, tab]);

  // Long-press the logo (2 s) to leave kiosk mode.
  const logoDown = () => {
    if (!kiosk) return;
    press.current = window.setTimeout(() => setExiting(true), 2000);
  };
  const logoUp = () => clearTimeout(press.current);

  return (
    <div className="app">
      <nav className="rail">
        <div
          className="logo"
          onPointerDown={logoDown}
          onPointerUp={logoUp}
          onPointerLeave={logoUp}
          title={kiosk ? 'Hold to leave kiosk mode' : undefined}
        >
          🏡
        </div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`rail-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            <Icon size={26} />
            <span>{label}</span>
          </button>
        ))}
        <div className="grow" />
        {kiosk ? (
          <button className="rail-btn" onClick={() => setExiting(true)} title="Kiosk mode is on">
            <Lock size={22} />
            <span>Locked</span>
          </button>
        ) : (
          <>
            <button className="rail-btn full" onClick={enterFullscreen} title="Fullscreen">
              <Maximize size={22} />
              <span>Full</span>
            </button>
            <button className={`rail-btn ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}>
              <Gear size={26} />
              <span>Settings</span>
            </button>
          </>
        )}
      </nav>
      <main>
        <TopBar />
        {saveError && <div className="banner">Couldn’t save changes: {saveError}</div>}
        <div className="view">
          {tab === 'today' && <TodayView />}
          {tab === 'calendar' && <CalendarView />}
          {tab === 'chores' && <ChoresView />}
          {tab === 'lists' && <ListsView />}
          {tab === 'meals' && <MealsView />}
          {tab === 'photos' && <PhotosView onSlideshow={() => setIdle(true)} />}
          {tab === 'settings' && !kiosk && <SettingsView />}
        </div>
      </main>
      {idle && <Screensaver onClose={() => setIdle(false)} />}
      {exiting && <ExitKiosk onClose={() => setExiting(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <KioskProvider>
      <StoreProvider>
        <HaProvider>
          <WeatherProvider>
            <Shell />
          </WeatherProvider>
        </HaProvider>
      </StoreProvider>
    </KioskProvider>
  );
}
