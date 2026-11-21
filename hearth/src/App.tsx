import { Ellipsis, Lock, Maximize, Settings as Gear } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './components/Modal';
import { TopBar } from './components/TopBar';
import { HaProvider } from './lib/ha';
import { useIdle, useIsPhone } from './lib/hooks';
import { KioskProvider, enterFullscreen, useKiosk } from './lib/kiosk';
import { MusicProvider } from './lib/music';
import { TABS } from './lib/tabs';
import { PresenceProvider } from './lib/presence';
import { StoreProvider, useStore } from './lib/store';
import { WeatherProvider } from './lib/weather';
import { applyPalette } from './lib/themes';
import { setLanguage, t } from './lib/i18n';
import { TimerAlarm } from './components/Timers';
import { Reminders } from './components/Reminders';
import { Toaster } from './components/Toast';
import { SleepOverlay } from './components/SleepOverlay';
import { Doorbell } from './components/Doorbell';
import { CalendarView } from './views/CalendarView';
import { ChoresView } from './views/ChoresView';
import { HomeView } from './views/HomeView';
import { ListsView } from './views/ListsView';
import { MealsView } from './views/MealsView';
import { MusicView } from './views/MusicView';
import { RecipesView } from './views/RecipesView';
import { RewardsView } from './views/RewardsView';
import { CamerasView } from './views/CamerasView';
import { PhotosView } from './views/PhotosView';
import { Screensaver } from './views/Screensaver';
import { SettingsView } from './views/SettingsView';
import { TodayView } from './views/TodayView';

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
  const { nav } = data.settings;
  const visibleTabs = TABS.filter((x) => x.id === 'today' || (!nav.hidden.includes(x.id) && !(x.id === 'rewards' && nav.rewardsInTasks)));
  // If the current tab was hidden, go home (Rewards moves inside Tasks).
  useEffect(() => {
    if (tab === 'settings' || visibleTabs.some((x) => x.id === tab)) return;
    setTab(tab === 'rewards' && nav.rewardsInTasks ? 'chores' : 'today');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, nav.hidden.join(','), nav.rewardsInTasks]);
  useTheme(data.settings.theme, data.settings.palette);

  useEffect(() => {
    history.replaceState(null, '', `${location.search}#${tab}`);
  }, [tab]);

  // Settings → Screensaver → Preview.
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  useEffect(() => {
    const go = (e: Event) => {
      setPreviewStyle((e as CustomEvent<string>).detail);
      setIdle(true);
    };
    window.addEventListener('hearth:screensaver', go);
    return () => window.removeEventListener('hearth:screensaver', go);
  }, [setIdle]);

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

  const views = () => (
    <>
          {tab === 'today' && <TodayView />}
          {tab === 'calendar' && <CalendarView />}
          {tab === 'chores' && <ChoresView />}
          {tab === 'rewards' && <RewardsView />}
          {tab === 'lists' && <ListsView />}
          {tab === 'meals' && <MealsView />}
          {tab === 'photos' && <PhotosView onSlideshow={() => setIdle(true)} />}
          {tab === 'recipes' && <RecipesView openSlug={recipeToOpen} onOpened={clearRecipe} />}
          {tab === 'music' && <MusicView />}
          {tab === 'cameras' && <CamerasView />}
          {tab === 'home' && <HomeView />}
          {tab === 'settings' && !kiosk && <SettingsView />}
    </>
  );
  const overlays = (
    <>
      {idle && <Screensaver styleOverride={previewStyle ?? undefined} onClose={() => { setIdle(false); setPreviewStyle(null); }} />}
      {exiting && <ExitKiosk onClose={() => setExiting(false)} />}
      <Reminders />
      <TimerAlarm />
      <Toaster />
      <SleepOverlay />
      <Doorbell />
    </>
  );

  // Long-press the logo (2 s) to leave kiosk mode.
  const logoDown = () => {
    if (!kiosk) return;
    press.current = window.setTimeout(() => setExiting(true), 2000);
  };
  const logoUp = () => clearTimeout(press.current);

  // Phones get a bottom bar with four main screens; the rest live under More.
  const phone = useIsPhone();
  const [more, setMore] = useState(false);
  const PRIMARY = ['today', 'calendar', 'chores', 'lists', 'meals', 'music'];
  const phoneTabs = PRIMARY.map((id) => visibleTabs.find((x) => x.id === id)).filter(Boolean).slice(0, 4) as typeof visibleTabs;
  const moreTabs = visibleTabs.filter((x) => !phoneTabs.includes(x));
  const go = (id: Tab) => {
    setTab(id);
    setMore(false);
  };

  if (phone) {
    const inMore = tab === 'settings' || moreTabs.some((x) => x.id === tab);
    return (
      <div className="app phone">
        <main>
          <TopBar onMusic={() => setTab('music')} />
          {saveError && <div className="banner">{t('Couldn’t save changes')}: {saveError}</div>}
          <div className="view">{views()}</div>
        </main>
        <nav className="tabbar">
          {phoneTabs.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
              <Icon size={24} />
              <span>{t(label)}</span>
            </button>
          ))}
          <button className={inMore ? 'on' : ''} onClick={() => setMore(true)}>
            <Ellipsis size={24} />
            <span>{t('More')}</span>
          </button>
        </nav>
        {more && (
          <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setMore(false)}>
            <div className="sheet more-sheet" role="dialog" aria-modal="true">
              <i className="sheet-grip" />
              <div className="more-grid">
                {moreTabs.map(({ id, label, Icon }) => (
                  <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
                    <Icon size={26} />
                    <span>{t(label)}</span>
                  </button>
                ))}
                {kiosk ? (
                  <button onClick={() => { setMore(false); setExiting(true); }}>
                    <Lock size={26} />
                    <span>{t('Locked')}</span>
                  </button>
                ) : (
                  <button className={tab === 'settings' ? 'on' : ''} onClick={() => go('settings')}>
                    <Gear size={26} />
                    <span>{t('Settings')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="rail" style={nav.topGap === 'auto' ? undefined : { paddingTop: `calc(env(safe-area-inset-top, 0px) + ${12 + nav.topGap}px)` }}>
        <div
          className="logo"
          onPointerDown={logoDown}
          onPointerUp={logoUp}
          onPointerLeave={logoUp}
          title={kiosk ? t('Hold to leave kiosk mode') : undefined}
        >
          🏡
        </div>
        {visibleTabs.map(({ id, label, Icon }) => (
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
            {nav.showFull && <button className="rail-btn full" onClick={enterFullscreen} title="Fullscreen">
              <Maximize size={22} />
              <span>{t('Full')}</span>
            </button>}
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
        <div className="view">{views()}</div>
      </main>
      {overlays}
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
              <PresenceProvider>
                <LanguageGate />
              </PresenceProvider>
            </MusicProvider>
          </WeatherProvider>
        </HaProvider>
      </StoreProvider>
    </KioskProvider>
  );
}
