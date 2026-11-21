import { parseISO } from 'date-fns';
import type { CalEvent, CalendarInfo, EntityInfo, HaState, Mode, StoreData, TodoItem } from './types';

// All URLs are relative so the app works under Home Assistant ingress paths.
async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

interface HaEvent {
  uid?: string;
  recurrence_id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

// A "Who: Oj, Omar" line in an event's description tags family members (works on any calendar).
const WHO_RE = /^\s*(?:who|👥)\s*:\s*(.+)$/im;
export const whoLine = (names: string[]) => `Who: ${names.join(', ')}`;

function splitWho(description?: string) {
  const m = description?.match(WHO_RE);
  if (!m) return { people: [] as string[], description: description || undefined };
  const people = m[1].split(/\s*(?:,|&|\band\b|\+)\s*/i).map((x) => x.trim()).filter(Boolean);
  const rest = description!.replace(m[0], '').trim();
  return { people, description: rest || undefined };
}

function toEvent(e: HaEvent, calendar: string): CalEvent {
  const allDay = !e.start.dateTime;
  const start = allDay ? parseISO(e.start.date!) : new Date(e.start.dateTime!);
  const end = allDay ? parseISO(e.end.date!) : new Date(e.end.dateTime!);
  return {
    id: `${calendar}|${e.uid ?? e.summary}|${e.recurrence_id ?? ''}|${start.getTime()}`,
    title: e.summary || '(No title)',
    start,
    end: end > start ? end : new Date(start.getTime() + (allDay ? 86400000 : 0)),
    allDay,
    calendar,
    calendars: [calendar],
    location: e.location || undefined,
    ...splitWho(e.description),
  };
}

export const api = {
  status: () => j<{ mode: Mode; version: string; photoDir: string }>('api/status'),
  states: (opts: { domains?: string[]; ids?: string[] }) =>
    j<HaState[]>(`api/ha/states?${new URLSearchParams({ domains: (opts.domains ?? []).join(','), ids: (opts.ids ?? []).join(',') })}`),
  mediaImageUrl: (entity: string, key: string) => `api/ha/media_image/${entity}?v=${encodeURIComponent(key)}`,
  notifyTargets: () => j<string[]>('api/ha/notify_targets'),
  notifyTest: (target: string) => j<{ ok: boolean }>('api/notify/test', post({ target })),
  mealieEntry: () => j<{ entry_id: string | null; images: boolean }>('api/ha/mealie'),
  browse: (entity: string, id: string, type: string) =>
    j<{ title: string; thumbnail?: string | null; children?: { title: string; media_content_id: string; media_content_type: string; can_play: boolean; thumbnail?: string | null }[] }>(
      `api/ha/browse/${entity}?${new URLSearchParams({ id, type })}`,
    ),
  /** Thumbnails HA serves behind login come back as /api/... paths; route them through the add-on. */
  artUrl: (u?: string | null) => (!u ? '' : u.startsWith('/api/') ? `api/ha/image?path=${encodeURIComponent(u)}` : u),
  musicAssistantEntry: () => j<{ entry_id: string | null }>('api/ha/music_assistant'),

  calendars: () => j<CalendarInfo[]>('api/ha/calendars'),
  entities: () => j<EntityInfo[]>('api/ha/entities'),
  state: (entity: string) => j<{ state: string; attributes: Record<string, any> }>(`api/ha/states/${entity}`),

  async events(calendar: string, start: Date, end: Date): Promise<CalEvent[]> {
    const q = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    const list = await j<HaEvent[]>(`api/ha/calendars/${calendar}?${q}`);
    return list.map((e) => toEvent(e, calendar));
  },

  service<T = unknown>(domain: string, service: string, data: object, returnResponse = false) {
    return j<T>(`api/ha/services/${domain}/${service}${returnResponse ? '?return_response' : ''}`, post(data));
  },

  async todoItems(entity: string): Promise<TodoItem[]> {
    const r = await api.service<{ service_response: Record<string, { items: TodoItem[] }> }>(
      'todo', 'get_items', { entity_id: entity }, true,
    );
    return r.service_response?.[entity]?.items ?? [];
  },

  store: () => j<{ rev: number; data: Partial<StoreData> }>('api/store'),
  putStore: (key: keyof StoreData, value: unknown) =>
    j<{ rev: number }>(`api/store/${key}`, { ...post({ value }), method: 'PUT' }),

  photos: () => j<string[]>('api/photos'),
  photoUrl: (name: string) => `photos/${name.split('/').map(encodeURIComponent).join('/')}`,
  uploadPhoto: (file: File) =>
    j<{ name: string }>(`api/photos?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }),
  deletePhoto: (name: string) => j(`api/photos/${name.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }),
};
