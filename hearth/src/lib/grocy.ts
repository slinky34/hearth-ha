import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { HaState } from './types';

// Grocy through the Home Assistant Grocy integration (custom-components/grocy).
// Its sensors carry their data in an attribute array; the key varies by version, so take the first array.
const IDS = ['sensor.grocy_shopping_list', 'sensor.grocy_chores', 'sensor.grocy_expiring_products', 'sensor.grocy_meal_plan'];

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

export function useGrocy() {
  const [g, setG] = useState<Grocy>(EMPTY);
  const load = useCallback(async () => {
    try {
      const states = await api.states({ ids: IDS });
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
