import { BookOpen, CalendarDays, Gift, House, Image, LayoutGrid, ListChecks, Music, Video, Sparkles, UtensilsCrossed } from 'lucide-react';

/** Sidebar screens, in order. */
export const TABS = [
  { id: 'today', label: 'Today', Icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'chores', label: 'Tasks', Icon: Sparkles },
  { id: 'rewards', label: 'Rewards', Icon: Gift },
  { id: 'lists', label: 'Lists', Icon: ListChecks },
  { id: 'meals', label: 'Meals', Icon: UtensilsCrossed },
  { id: 'recipes', label: 'Recipes', Icon: BookOpen },
  { id: 'photos', label: 'Photos', Icon: Image },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'cameras', label: 'Cameras', Icon: Video },
  { id: 'home', label: 'Home', Icon: House },
] as const;
