export interface Member {
  id: string;
  name: string;
  color: string;
  /** Calendar entity ids whose events belong to this person. */
  calendars: string[];
  /** Optional HA to-do list with this person's chores (e.g. a TaskMate child list). */
  todo?: string;
}

export type Period = 'morning' | 'afternoon' | 'evening' | 'anytime';

export interface Chore {
  id: string;
  title: string;
  emoji: string;
  memberId: string;
  /** Weekdays (0 = Sunday) the chore is due. Empty = every day. */
  days: number[];
  points: number;
  /** Time of day for routine grouping; missing = anytime chore. */
  period?: Period;
}

/** dateKey (yyyy-MM-dd) -> ids of chores completed that day */
export type Completions = Record<string, string[]>;

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type MealDay = Partial<Record<MealType, string>>;
export type Meals = Record<string, MealDay>;

export interface Settings {
  weatherEntity: string;
  /** todo entities shown on the Lists screen; empty = all */
  lists: string[];
  screensaverMinutes: number;
  photoSeconds: number;
  theme: 'light' | 'dark' | 'auto';
  weekStartsOn: 0 | 1;
  clock24: boolean;
  calendarColors: Record<string, string>;
  hiddenCalendars: string[];
  dayStartHour: number;
  /** Optional PIN required to leave kiosk mode (child lock, not real security). */
  kioskPin: string;
  /** media_player entities shown in Music; empty = all */
  musicPlayers: string[];
  /** Entities shown on the Home screen (lights, switches, scenes, sensors...) */
  controls: string[];
  calendarView: CalendarViewMode;
  /** Grid view: 5 = rolling five days from today, 7 = the whole week. */
  gridDays: 5 | 7;
  familyName: string;
  countdowns: Countdown[];
  choreLayout: 'cards' | 'compact';
}

export interface Countdown {
  id: string;
  title: string;
  emoji: string;
  date: string; // yyyy-MM-dd
}

export type CalendarViewMode = 'day' | 'week' | 'schedule' | 'grid' | 'month';

export interface StoreData {
  members: Member[];
  chores: Chore[];
  completions: Completions;
  meals: Meals;
  settings: Settings;
}

export interface CalendarInfo {
  entity_id: string;
  name: string;
}

export interface EntityInfo {
  entity_id: string;
  name: string;
}

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendar: string;
  location?: string;
  description?: string;
}

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

export type Mode = 'demo' | 'addon' | 'remote';

export interface HaState {
  entity_id: string;
  state: string;
  last_updated?: string;
  attributes: Record<string, any>;
}
