import {
  BookOpen, CalendarDays, House, Image, LayoutGrid, ListChecks, Lock, Maximize, Music, Settings as Gear, Sparkles, UtensilsCrossed,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './components/Modal';
import { TopBar } from './components/TopBar';
import { HaProvider } from './lib/ha';
import { useIdle } from './lib/hooks';
import { KioskProvider, enterFullscreen, useKiosk } from './lib/kiosk';
import { MusicProvider } from './lib/music';
import { StoreProvider, useStore } from './lib/store';
import { WeatherProvider } from './lib/weather';
import { applyPalette } from './lib/themes';
import { setLanguage, t } from './lib/i18n';
import { TimerAlarm } from './components/Timers';
import { Reminders } from './components/Reminders';
import { Toaster } from './components/Toast';
import { CalendarView } from './views/CalendarView';
import { ChoresView } from './views/ChoresView';
import { HomeView } from './views/HomeView';
import { ListsView } from './views/ListsView';
import { MealsView } from './views/MealsView';
import { MusicView } from './views/MusicView';
import { RecipesView } from './views/RecipesView';
import { PhotosView } from './views/PhotosView';
import { Screensaver } from './views/Screensaver';
import { SettingsView } from './views/SettingsView';
import { TodayView } from './views/TodayView';

const TABS = [
  { id: 'today', label: 'Today', Icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'chores', label: 'Tasks', Icon: Sparkles },
  { id: 'lists', label: 'Lists', Icon: ListChecks },
  { id: 'meals', label: 'Meals', Icon: UtensilsCrossed },
  { id: 'recipes', label: 'Recipes', Icon: BookOpen },
  { id: 'photos', label: 'Photos', Icon: Image },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'home', label: 'Home', Icon: House },
] as const;
type Tab = (typeof TABS)[number]['id'] | 'settings';
const ALL_TABS: string[] = [...TABS.map((t) => t.id), 'settings'];

function useTheme(theme: 'light' | 'dark' | 'auto', palette: string) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyPalette(palette, theme === 'dark' || (theme === 'auto' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, palette]);
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
      title={t('Leave kiosk mode?')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn primary" onClick={unlock}>
            {t('Unlock')}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>
          {t('This unlocks Settings and editing on this screen.')}
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
        {err && <p className="error">{t('Wrong PIN.')}</p>}
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
  const [recipeToOpen, setRecipeToOpen] = useState<string | null>(null);
  const clearRecipe = useCallback(() => setRecipeToOpen(null), []);
  const press = useRef(0);
  useTheme(data.settings.theme, data.settings.palette);

  useEffect(() => {
    history.replaceState(null, '', `${location.search}#${tab}`);
  }, [tab]);

  // Other screens can ask to open a recipe.
  useEffect(() => {
    const go = (e: Event) => {
      setRecipeToOpen((e as CustomEvent<string>).detail);
      setTab('recipes');
    };
    window.addEventListener('hearth:open-recipe', go);
    return () => window.removeEventListener('hearth:open-recipe', go);
  }, []);

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
          title={kiosk ? t('Hold to leave kiosk mode') : undefined}
        >
          🏡
        </div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`rail-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            <Icon size={26} />
            <span>{t(label)}</span>
          </button>
        ))}
        <div className="grow" />
        {kiosk ? (
          <button className="rail-btn" onClick={() => setExiting(true)} title="Kiosk mode is on">
            <Lock size={22} />
            <span>{t('Locked')}</span>
          </button>
        ) : (
          <>
            <button className="rail-btn full" onClick={enterFullscreen} title="Fullscreen">
              <Maximize size={22} />
              <span>{t('Full')}</span>
            </button>
            <button className={`rail-btn ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}>
              <Gear size={26} />
              <span>{t('Settings')}</span>
            </button>
          </>
        )}
      </nav>
      <main>
        <TopBar onMusic={() => setTab('music')} />
        {saveError && <div className="banner">{t('Couldn’t save changes')}: {saveError}</div>}
        <div className="view">
          {tab === 'today' && <TodayView />}
          {tab === 'calendar' && <CalendarView />}
          {tab === 'chores' && <ChoresView />}
          {tab === 'lists' && <ListsView />}
          {tab === 'meals' && <MealsView />}
          {tab === 'photos' && <PhotosView onSlideshow={() => setIdle(true)} />}
          {tab === 'recipes' && <RecipesView openSlug={recipeToOpen} onOpened={clearRecipe} />}
          {tab === 'music' && <MusicView />}
          {tab === 'home' && <HomeView />}
          {tab === 'settings' && !kiosk && <SettingsView />}
        </div>
      </main>
      {idle && <Screensaver onClose={() => setIdle(false)} />}
      {exiting && <ExitKiosk onClose={() => setExiting(false)} />}
      <Reminders />
      <TimerAlarm />
      <Toaster />
    </div>
  );
}

/** Sets the UI language before anything renders, and remounts the app when it changes. */
function LanguageGate() {
  const lang = setLanguage(useStore().data.settings.language);
  return <Shell key={lang} />;
}

export default function App() {
  return (
    <KioskProvider>
      <StoreProvider>
        <HaProvider>
          <WeatherProvider>
            <MusicProvider>
              <LanguageGate />
            </MusicProvider>
          </WeatherProvider>
        </HaProvider>
      </StoreProvider>
    </KioskProvider>
  );
}
