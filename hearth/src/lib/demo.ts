import { addDays, startOfWeek } from 'date-fns';
import type { Chore, Completions, Meals, Member, StoreData } from './types';
import { dateKey } from './util';

/** Sample family used only in demo mode (no Home Assistant connected). */
export function demoData(): Partial<StoreData> {
  const members: Member[] = [
    { id: 'jordan', name: 'Jordan', color: '#5B8DEF', calendars: ['calendar.jordan'] },
    { id: 'alex', name: 'Alex', color: '#9B7BEA', calendars: ['calendar.alex'] },
    { id: 'sam', name: 'Sam', color: '#6CBF84', calendars: ['calendar.sam'] },
  ];
  const chores: Chore[] = [
    { id: 'c1', title: 'Make bed', emoji: '🛏️', memberId: 'sam', days: [], points: 1, period: 'morning' },
    { id: 'c2', title: 'Feed the dog', emoji: '🐶', memberId: 'sam', days: [], points: 2, period: 'evening' },
    { id: 'c3', title: 'Homework', emoji: '📚', memberId: 'sam', days: [1, 2, 3, 4, 5], points: 2, period: 'afternoon' },
    { id: 'c4', title: 'Make bed', emoji: '🛏️', memberId: 'alex', days: [], points: 1, period: 'morning' },
    { id: 'c5', title: 'Set the table', emoji: '🍽️', memberId: 'alex', days: [], points: 1, period: 'evening' },
    { id: 'c6', title: 'Practice piano', emoji: '🎹', memberId: 'alex', days: [1, 2, 3, 4, 5], points: 2, period: 'afternoon' },
    { id: 'c7', title: 'Water plants', emoji: '🪴', memberId: 'jordan', days: [1, 4], points: 1 },
    { id: 'c8', title: 'Take out trash', emoji: '🗑️', memberId: 'jordan', days: [2, 5], points: 1 },
    { id: 'c9', title: 'Unload dishwasher', emoji: '🧽', memberId: 'jordan', days: [], points: 1 },
    { id: 'c10', title: 'Brush teeth', emoji: '🪥', memberId: 'sam', days: [], points: 1, period: 'morning' },
    { id: 'c11', title: 'Get dressed', emoji: '👕', memberId: 'sam', days: [], points: 1, period: 'morning' },
    { id: 'c12', title: 'Brush teeth', emoji: '🪥', memberId: 'alex', days: [], points: 1, period: 'morning' },
    { id: 'c13', title: 'Get dressed', emoji: '👕', memberId: 'alex', days: [], points: 1, period: 'morning' },
    { id: 'c14', title: 'Read for 20 minutes', emoji: '📖', memberId: 'alex', days: [], points: 2, period: 'evening' },
    { id: 'c15', title: 'Pack school bag', emoji: '🎒', memberId: 'sam', days: [0, 1, 2, 3, 4], points: 1, period: 'evening' },
  ];
  // Past few days fully done so streaks show up.
  const completions: Completions = {};
  const today = new Date();
  for (let i = 1; i <= 4; i++) {
    const d = addDays(today, -i);
    completions[dateKey(d)] = chores
      .filter((c) => c.days.length === 0 || c.days.includes(d.getDay()))
      .filter((c) => c.memberId !== 'jordan' || i < 3)
      .map((c) => c.id);
  }
  completions[dateKey(today)] = ['c1', 'c4'];

  const dinners = ['Tacos', 'Spaghetti & meatballs', 'Chicken stir fry', 'Leftovers', 'Pizza night 🍕', 'Grill out', 'Slow-cooker chili'];
  const meals: Meals = {};
  const ws = startOfWeek(today);
  dinners.forEach((dinner, i) => {
    meals[dateKey(addDays(ws, i))] = { dinner, ...(i === 6 ? { breakfast: 'Pancakes' } : {}) };
  });

  return { members, chores, completions, meals };
}

export function demoSettings() {
  const d = new Date();
  d.setDate(d.getDate() + 48);
  return { familyName: 'Rivera Family', countdowns: [{ id: 'cd1', title: 'Vacation', emoji: '🌴', date: dateKey(d) }] };
}
