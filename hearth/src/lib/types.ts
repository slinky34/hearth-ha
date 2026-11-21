export interface Member {
  id: string;
  name: string;
  color: string;
  /** Calendar entity ids whose events belong to this person. */
  calendars: string[];
  /** Optional HA to-do list with this person's chores (e.g. a TaskMate child list). */
  todo?: string;
  /** Small profile photo (data URL, resized in the browser). */
  photo?: string;
  /** HA person entity, for the "who's home" dot. */
  person?: string;
  /** Birthday as yyyy-MM-dd (year optional: 0000-MM-dd). */
  birthday?: string;
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
  /** Rotate weekly between these people (overrides memberId). */
  rotate?: string[];
  /** One-off chore on this date (yyyy-MM-dd) instead of repeating. */
  date?: string;
}

export interface Reward {
  id: string;
  title: string;
  emoji: string;
  cost: number;
}

export interface Redemption {
  id: string;
  memberId: string;
  rewardId: string;
  title: string;
  cost: number;
  at: number;
  status: 'pending' | 'approved' | 'denied';
}

export interface Note {
  id: string;
  text: string;
  color: string;
  from?: string;
  at: number;
}

/** dateKey (yyyy-MM-dd) -> ids of chores completed that day */
export type Completions = Record<string, string[]>;

export type MealType = 'breakfast' | 'lunch' | 'dinner';
/** A day's meals. `hide` lists slots where Mealie/Grocy entries are hidden in Hearth. */
export type MealDay = Partial<Record<MealType, string>> & { hide?: MealType[] };
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
  notify: NotifySettings;
  /** Color palette; see lib/themes.ts */
  palette: string;
  /** 'auto' follows the device language */
  language: string;
  /** Screensaver look (see SS_STYLES) and options. */
  screensaverStyle: string;
  ssShuffle: boolean;
  ssClock: boolean;
  ssInfo: boolean;
  /** Immich photo sources (albums by id, plus favorites). */
  immich: { albums: string[]; favorites: boolean };
  choreLayout: 'cards' | 'compact';
  /** Night sleep mode (dims the screen; can turn a Fully Kiosk tablet screen off). */
  sleep: { enabled: boolean; start: string; end: string; mode: 'dim' | 'black'; screenEntity: string };
  /** Doorbell pop-up: when the trigger fires, show the camera. */
  doorbell: { trigger: string; camera: string; seconds: number };
  /** Read notes aloud: TTS entity + speaker. */
  tts: { engine: string; speaker: string };
  /** "Leave by" hints using Waze travel time from home. */
  leaveBy: { enabled: boolean; region: string; buffer: number };
  /** Ask for the kiosk PIN before approving rewards. */
  rewardPin: boolean;
  /** Cameras screen: which cameras, and the Frigate detections feed. */
  cameras: { list: string[]; detections: boolean; labels: string[] };
  /** Sidebar: hidden tabs, and Rewards shown inside Tasks instead of its own tab. */
  nav: { hidden: string[]; rewardsInTasks: boolean; showFull: boolean };
}

export interface Countdown {
  id: string;
  title: string;
  emoji: string;
  date: string; // yyyy-MM-dd
}

export type CalendarViewMode = 'day' | 'week' | 'schedule' | 'grid' | 'month';

export interface Timer {
  id: string;
  label: string;
  emoji: string;
  duration: number; // ms
  endsAt: number; // epoch ms
  /** Set while paused: ms left. */
  pausedLeft?: number;
}

export interface NotifySettings {
  /** notify.* services to send to (phones etc.) */
  targets: string[];
  /** Remind this many minutes before timed events; 0 = off */
  eventMinutes: number;
  timers: boolean;
  /** HH:mm for the daily chores-left nudge; '' = off */
  choreTime: string;
  /** Show reminders on the wall display too */
  screen: boolean;
}

export interface StoreData {
  members: Member[];
  chores: Chore[];
  completions: Completions;
  meals: Meals;
  settings: Settings;
  timers: Timer[];
  rewards: Reward[];
  redemptions: Redemption[];
  notes: Note[];
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
  /** Every calendar this event appears in (identical events across calendars are merged). */
  calendars: string[];
  /** The underlying event in each calendar (needed to edit or delete it). */
  copies: { calendar: string; uid?: string; recurrenceId?: string }[];
  /** Names from a "Who: …" line in the description (people tagged on a shared calendar). */
  people: string[];
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
