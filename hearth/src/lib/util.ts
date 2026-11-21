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
