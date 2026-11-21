import { CalendarDays, Image, ListChecks, Settings as Gear, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { HaProvider } from './lib/ha';
import { useIdle } from './lib/hooks';
import { StoreProvider, useStore } from './lib/store';
import { WeatherProvider } from './lib/weather';
import { CalendarView } from './views/CalendarView';
import { ChoresView } from './views/ChoresView';
import { ListsView } from './views/ListsView';
import { MealsView } from './views/MealsView';
import { PhotosView } from './views/PhotosView';
import { Screensaver } from './views/Screensaver';
import { SettingsView } from './views/SettingsView';

const TABS = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'chores', label: 'Chores', Icon: Sparkles },
  { id: 'lists', label: 'Lists', Icon: ListChecks },
  { id: 'meals', label: 'Meals', Icon: UtensilsCrossed },
  { id: 'photos', label: 'Photos', Icon: Image },
] as const;
type Tab = (typeof TABS)[number]['id'] | 'settings';

function useTheme(theme: 'light' | 'dark' | 'auto') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#15161C' : '#FBF8F4');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function Shell() {
  const { data, saveError } = useStore();
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'calendar');
  const [idle, setIdle] = useIdle(data.settings.screensaverMinutes);
  useTheme(data.settings.theme);

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
  }, [tab]);

  // Drift back to the calendar while nobody is using the screen.
  useEffect(() => {
    if (idle) setTab('calendar');
  }, [idle]);

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo" aria-hidden>
          🏡
        </div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`rail-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            <Icon size={26} />
            <span>{label}</span>
          </button>
        ))}
        <div className="grow" />
        <button className={`rail-btn ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}>
          <Gear size={26} />
          <span>Settings</span>
        </button>
      </nav>
      <main>
        <TopBar />
        {saveError && <div className="banner">Couldn’t save changes: {saveError}</div>}
        <div className="view">
          {tab === 'calendar' && <CalendarView />}
          {tab === 'chores' && <ChoresView />}
          {tab === 'lists' && <ListsView />}
          {tab === 'meals' && <MealsView />}
          {tab === 'photos' && <PhotosView onSlideshow={() => setIdle(true)} />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>
      {idle && <Screensaver onClose={() => setIdle(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HaProvider>
        <WeatherProvider>
          <Shell />
        </WeatherProvider>
      </HaProvider>
    </StoreProvider>
  );
}
