// Mealie through Home Assistant's Mealie integration (mealie.* services).
import { addDays, format } from 'date-fns';
import { api } from './api';

export interface RecipeSummary {
  id: string;
  slug: string;
  name: string;
  description?: string;
  hasImage: boolean;
  yield?: string;
  time?: string;
  /** Direct image URL (Bar Assistant); Mealie images use imageUrl(id). */
  imageSrc?: string | null;
  source?: 'mealie' | 'bar';
}
export interface Ingredient {
  quantity?: number | null;
  unit?: string;
  food?: string;
  note?: string;
  /** Section heading (Mealie lets ingredients carry one). */
  title?: string;
  display?: string;
}
export interface Step {
  title?: string;
  text: string;
}
export interface Recipe extends RecipeSummary {
  /** Extra facts shown as chips (glass, method, garnish…). */
  extras?: string[];
  ingredients: Ingredient[];
  steps: Step[];
  url?: string;
}
export interface PlanEntry {
  date: string; // yyyy-MM-dd
  type: string; // breakfast | lunch | dinner | side
  title?: string;
  recipe?: RecipeSummary;
}

const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (v && typeof v === 'object' && 'name' in v) return str((v as { name: unknown }).name);
  return undefined;
};

function toSummary(r: any): RecipeSummary {
  return {
    id: String(r.recipe_id ?? r.id ?? r.slug),
    slug: String(r.slug ?? r.recipe_id ?? r.id),
    name: str(r.name) ?? 'Recipe',
    description: str(r.description),
    hasImage: Boolean(r.image),
    yield: str(r.recipe_yield),
    time: str(r.total_time) ?? str(r.perform_time) ?? str(r.prep_time),
  };
}

let entry: Promise<{ entry_id: string | null; images: boolean }> | null = null;
export function mealieEntry() {
  entry ??= api.mealieEntry().catch((e) => {
    entry = null;
    throw e;
  });
  return entry;
}

async function call<T>(service: string, data: object) {
  const { entry_id } = await mealieEntry();
  if (!entry_id) throw new Error('Mealie is not set up in Home Assistant');
  const r = await api.service<{ service_response: T }>('mealie', service, { config_entry_id: entry_id, ...data }, true);
  return r.service_response;
}

export async function mealPlan(start: Date, days = 7): Promise<PlanEntry[]> {
  const r = await call<{ mealplan: any[] }>('get_mealplan', {
    start_date: format(start, 'yyyy-MM-dd'),
    end_date: format(addDays(start, days - 1), 'yyyy-MM-dd'),
  });
  return (r?.mealplan ?? []).map((m) => ({
    date: String(m.mealplan_date ?? m.date).slice(0, 10),
    type: String(m.entry_type ?? 'dinner').toLowerCase(),
    title: str(m.title),
    recipe: m.recipe ? toSummary(m.recipe) : undefined,
  }));
}

/** Search recipes (needs a Home Assistant version with mealie.get_recipes). */
export async function searchRecipes(q: string, limit = 48): Promise<RecipeSummary[]> {
  const r = await call<{ recipes: any }>('get_recipes', { ...(q ? { search_terms: q } : {}), result_limit: limit });
  const items = Array.isArray(r?.recipes) ? r.recipes : r?.recipes?.items ?? [];
  return items.map(toSummary);
}

export async function getRecipe(idOrSlug: string): Promise<Recipe> {
  const r = await call<{ recipe: any }>('get_recipe', { recipe_id: idOrSlug });
  const x = r.recipe;
  return {
    ...toSummary(x),
    url: str(x.original_url),
    ingredients: (x.ingredients ?? x.recipe_ingredient ?? []).map((i: any) => ({
      quantity: typeof i.quantity === 'number' && !i.disable_amount ? i.quantity : null,
      unit: str(i.unit),
      food: str(i.food),
      note: str(i.note),
      title: str(i.title),
      display: str(i.display),
    })),
    steps: (x.instructions ?? x.recipe_instructions ?? [])
      .map((s: any) => ({ title: str(s.title) || str(s.summary), text: str(s.text) ?? '' }))
      .filter((s: Step) => s.text),
  };
}

export async function planRecipe(recipeId: string, date: string, type: string) {
  await call('set_mealplan', { date, entry_type: type, recipe_id: recipeId });
}

export const imageUrl = (id: string) => `api/mealie/image/${encodeURIComponent(id)}`;

const FRACTIONS: [number, string][] = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
export function niceQty(q: number) {
  const whole = Math.floor(q + 1e-6);
  const frac = q - whole;
  if (frac < 0.06) return String(whole);
  const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.05);
  if (f) return `${whole ? whole : ''}${f[1]}`;
  return String(Math.round(q * 100) / 100);
}

/** One line of an ingredient, scaled. */
export function ingredientText(i: Ingredient, scale: number) {
  if (i.quantity == null && i.display && scale === 1) return i.display;
  const parts = [i.quantity != null ? niceQty(i.quantity * scale) : '', i.unit ?? '', i.food ?? ''].filter(Boolean).join(' ');
  if (!parts) return i.note ?? i.display ?? '';
  return i.note ? `${parts}, ${i.note}` : parts;
}

/** Minutes mentioned in a step ("bake 25 minutes", "2 to 3 minutes", "1 hour") for quick timers. */
export function timersIn(text: string) {
  const out: { minutes: number; label: string }[] = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:[.,]\d+)?))?\s*(hours?|hrs?|h\b|minutes?|mins?|seconds?|secs?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat((m[2] ?? m[1]).replace(',', '.'));
    const unit = m[3].toLowerCase();
    const minutes = unit.startsWith('h') ? n * 60 : unit.startsWith('s') ? n / 60 : n;
    if (minutes > 0 && minutes <= 24 * 60 && !out.some((o) => o.minutes === minutes)) out.push({ minutes, label: m[0] });
  }
  return out;
}
