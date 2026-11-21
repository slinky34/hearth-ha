import { useEffect, useState } from 'react';
import { api } from './api';
import { useStore } from './store';
import type { CalEvent } from './types';

// Travel minutes per destination, cached for 15 minutes.
const cache = new Map<string, { at: number; minutes: number | null }>();

async function travelMinutes(destination: string, region: string): Promise<number | null> {
  const hit = cache.get(destination);
  if (hit && Date.now() - hit.at < 15 * 60000) return hit.minutes;
  try {
    const r = await api.service<{ service_response: { routes?: { duration: number }[] } }>(
      'waze_travel_time', 'get_travel_times', { origin: 'zone.home', destination, region }, true,
    );
    const mins = r.service_response?.routes?.length ? Math.min(...r.service_response.routes.map((x) => x.duration)) : null;
    cache.set(destination, { at: Date.now(), minutes: mins == null ? null : Math.round(mins) });
  } catch {
    cache.set(destination, { at: Date.now(), minutes: null });
  }
  return cache.get(destination)!.minutes;
}

/** Event id -> { minutes of driving, time to leave } for today's upcoming events with a location. */
export function useLeaveBy(events: CalEvent[]) {
  const { leaveBy } = useStore().data.settings;
  const [map, setMap] = useState<Record<string, { minutes: number; leave: Date }>>({});
  const key = events.map((e) => e.id).join('|');
  useEffect(() => {
    if (!leaveBy.enabled) return setMap({});
    let alive = true;
    const run = async () => {
      const now = Date.now();
      const soon = events.filter((e) => !e.allDay && e.location && e.start.getTime() > now && e.start.getTime() - now < 6 * 3600000);
      const out: Record<string, { minutes: number; leave: Date }> = {};
      for (const e of soon) {
        const m = await travelMinutes(e.location!, leaveBy.region);
        if (m != null) out[e.id] = { minutes: m, leave: new Date(e.start.getTime() - (m + leaveBy.buffer) * 60000) };
      }
      if (alive) setMap(out);
    };
    run();
    const t = setInterval(run, 10 * 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, leaveBy.enabled, leaveBy.region, leaveBy.buffer]);
  return map;
}
