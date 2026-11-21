import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { HaState } from './types';

// Grocy through the Home Assistant Grocy integration (custom-components/grocy).
// Its sensors carry their data in an attribute array; the key varies by version, so take the first array.
const KEYS = ['shopping_list', 'chores', 'expiring_products', 'meal_plan'] as const;

// Find each sensor by the key in its registry id (names can be renamed or translated), else by the default name.
let idsPromise: Promise<string[]> | null = null;
function grocyIds(): Promise<string[]> {
  idsPromise ??= fetch('api/integration_entities/grocy')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((list: { entity_id: string; key: string }[]) => {
      const ents = Array.isArray(list) ? list : [];
      return KEYS.map((k) => {
        const hits = ents.filter((e) => e.key.endsWith(k) || e.entity_id.endsWith(`_${k}`) || e.entity_id.endsWith(`.${k}`));
        // Prefer the sensor (it carries the item list) over a binary_sensor with the same key.
        return (hits.find((e) => e.entity_id.startsWith('sensor.')) ?? hits[0])?.entity_id ?? `sensor.grocy_${k}`;
      });
    });
  return idsPromise;
}

function arr(s: HaState | undefined): any[] {
  if (!s) return [];
  return (Object.values(s.attributes).find((v) => Array.isArray(v)) as any[]) ?? [];
}

export interface GrocyItem { id: number; name: string; amount: number; done: boolean }
export interface GrocyChore { id: number; name: string; due?: Date }
export interface GrocyExpiring { id: number; name: string; date: string; amount: number }
export interface GrocyMeal { day: string; name: string; section: string }

export interface Grocy {
  available: boolean;
  shopping: GrocyItem[] | null;
  chores: GrocyChore[] | null;
  expiring: GrocyExpiring[] | null;
  meals: GrocyMeal[] | null;
}

const EMPTY: Grocy = { available: false, shopping: null, chores: null, expiring: null, meals: null };

// Where Grocy data comes from: the HA integration's sensors, or Grocy's own API through the add-on.
let source: 'ha' | 'direct' = 'ha';

async function direct(): Promise<Grocy | null> {
  const r = await fetch('api/grocy/data').catch(() => null);
  if (!r?.ok) return null;
  const d = await r.json();
  return {
    available: true,
    shopping: d.shopping ?? [],
    chores: (d.chores ?? []).map((c: { id: number; name: string; due?: string }) => ({ ...c, due: c.due ? new Date(c.due) : undefined })),
    expiring: d.expiring ?? [],
    meals: d.meals ?? [],
  };
}

async function post(path: string, method: string, body: unknown) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Grocy: ${r.status}`);
}
/** Add an item to Grocy's shopping list. */
export const grocyAddItem = (note: string) =>
  source === 'direct'
    ? post('api/grocy/shopping', 'POST', { note })
    : api.service('grocy', 'add_generic', { entity_type: 'shopping_list', data: { note, amount: 1, shopping_list_id: 1 } });
/** Tick or untick a shopping list item. */
export const grocySetDone = (id: number, done: boolean) =>
  source === 'direct'
    ? post(`api/grocy/shopping/${id}`, 'PUT', { done })
    : api.service('grocy', 'update_generic', { entity_type: 'shopping_list', object_id: id, data: { done: done ? 1 : 0 } });
/** Mark a Grocy chore as done. */
export const grocyDoChore = (id: number) =>
  source === 'direct' ? post(`api/grocy/chores/${id}/execute`, 'POST', {}) : api.service('grocy', 'execute_chore', { chore_id: id });

export function useGrocy() {
  const [g, setG] = useState<Grocy>(EMPTY);
  const load = useCallback(async () => {
    try {
      const IDS = await grocyIds();
      const states = await api.states({ ids: IDS });
      if (states.length === 0) {
        // No Grocy integration in HA: try Grocy's own API (the Grocy add-on).
        const d = await direct();
        source = d ? 'direct' : 'ha';
        setG(d ?? EMPTY);
        return;
      }
      source = 'ha';
      const by = (id: string) => states.find((s) => s.entity_id === id);
      const shop = by(IDS[0]);
      const chores = by(IDS[1]);
      const exp = by(IDS[2]);
      const meals = by(IDS[3]);
      setG({
        available: states.length > 0,
        shopping: shop
          ? arr(shop).map((i) => ({
              id: Number(i.id),
              name: i.product?.name || i.note || `Item ${i.id}`,
              amount: Number(i.amount) || 1,
              done: Number(i.done) === 1 || i.done === true,
            }))
          : null,
        chores: chores
          ? arr(chores).map((c) => ({
              id: Number(c.id ?? c.chore_id),
              name: c.name ?? c.chore?.name ?? `Chore ${c.id}`,
              due: c.next_estimated_execution_time ? new Date(c.next_estimated_execution_time) : undefined,
            }))
          : null,
        expiring: exp
          ? arr(exp).map((p) => ({
              id: Number(p.id ?? p.product_id),
              name: p.name ?? p.product?.name ?? `Product ${p.id}`,
              date: String(p.best_before_date ?? '').slice(0, 10),
              amount: Number(p.amount) || 1,
            }))
          : null,
        meals: meals
          ? arr(meals).map((m) => ({
              day: String(m.day).slice(0, 10),
              name: m.recipe?.name ?? m.product?.name ?? m.note ?? 'Meal',
              section: String(m.section?.name ?? m.section ?? '').toLowerCase(),
            }))
          : null,
      });
    } catch {
      setG(EMPTY);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  return { grocy: g, reload: load };
}
