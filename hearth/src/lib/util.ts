import { format } from 'date-fns';
import type { CalendarInfo, Member, Settings } from './types';

export const PALETTE = [
  '#E9736B', // coral
  '#F2A541', // orange
  '#E3B92F', // mustard
  '#6CBF84', // green
  '#3FB0AC', // teal
  '#5B8DEF', // blue
  '#9B7BEA', // purple
  '#E77FB4', // pink
  '#8D99AE', // slate
];

export const uid = () => Math.random().toString(36).slice(2, 10);
export const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const fmtTime = (d: Date, clock24: boolean) => format(d, clock24 ? 'HH:mm' : 'h:mm a');
export const fmtShortTime = (d: Date, clock24: boolean) =>
  clock24 ? format(d, 'HH:mm') : format(d, d.getMinutes() ? 'h:mma' : 'ha').toLowerCase();

export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function calendarColor(entity: string, members: Member[], settings: Settings, calendars: CalendarInfo[]) {
  const m = members.find((x) => x.calendars.includes(entity));
  if (m) return m.color;
  if (settings.calendarColors[entity]) return settings.calendarColors[entity];
  const i = Math.max(0, calendars.findIndex((c) => c.entity_id === entity));
  return PALETTE[(i + 4) % PALETTE.length];
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Solid pastel version of a color (mixed with white), for cards that stay light in dark mode. */
export function pastel(hex: string, amount = 0.32) {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

import type { Chore as _Chore } from './types';
/** Whether a chore is due on a given day. */
/** Whether a chore happens on a day (one-off date, or repeating weekdays). */
export const dueOn = (c: _Chore, d: Date) =>
  c.date ? c.date === dateKey(d) : c.days.length === 0 || c.days.includes(d.getDay());
/** Week number used for weekly chore rotation (weeks start Monday). */
export const weekIndex = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 3) / 7);
/** Who does a chore on a given day (rotation-aware). */
export const assigneeOn = (c: _Chore, d: Date) => (c.rotate?.length ? c.rotate[weekIndex(d) % c.rotate.length] : c.memberId);
/** A person's chores for a day. */
export const choresFor = (chores: _Chore[], memberId: string, d: Date) =>
  chores.filter((c) => dueOn(c, d) && assigneeOn(c, d) === memberId);
/** Chores that can ever belong to a person. */
export const involves = (c: _Chore, memberId: string) => c.memberId === memberId || !!c.rotate?.includes(memberId);

/** Diagonal stripes in several people's colors, for shared events. */
export function stripes(colors: string[], amount = 0.42) {
  const w = 22;
  const stops = colors.map((c, i) => `${pastel(c, amount)} ${i * w}px ${(i + 1) * w}px`).join(', ');
  return `repeating-linear-gradient(120deg, ${stops})`;
}

import type { CalEvent as _CalEvent, Member as _Member } from './types';
const _norm = (s: string) => s.trim().toLowerCase();
/** Family members an event belongs to: via their linked calendars or tagged by name ("Who: …"). */
export function eventMembers(e: _CalEvent, members: _Member[]) {
  const tagged = new Set(e.people.map(_norm));
  return members.filter((m) => e.calendars.some((c) => m.calendars.includes(c)) || tagged.has(_norm(m.name)));
}
