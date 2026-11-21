// Bar Assistant (cocktails), reached through the Hearth add-on (it holds the API token).
import type { Recipe, RecipeSummary } from './mealie';

async function j<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || body?.message || `${r.status}`);
  return body as T;
}

interface BarSummary {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
}
interface BarFull extends BarSummary {
  garnish?: string | null;
  glass?: string | null;
  method?: string | null;
  instructions: string;
  ingredients: { name: string; amount: number | null; amount_max: number | null; units: string; optional: boolean; note: string | null }[];
}

const summary = (c: BarSummary): RecipeSummary => ({
  id: c.id,
  slug: c.id,
  name: c.name,
  description: c.description ?? undefined,
  hasImage: Boolean(c.image),
  imageSrc: c.image ?? null,
  source: 'bar',
});

/** Instructions are free text / markdown: one step per line, numbering and bullets removed. */
function steps(text: string) {
  return text
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/\*\*|__/g, '').trim())
    .filter(Boolean)
    .map((t) => ({ text: t }));
}

export const barCocktails = (q: string) =>
  j<BarSummary[]>(`api/bar/cocktails?${new URLSearchParams({ q })}`).then((l) => l.map(summary));

export async function barCocktail(id: string): Promise<Recipe> {
  const c = await j<BarFull>(`api/bar/cocktails/${encodeURIComponent(id)}`);
  return {
    ...summary(c),
    extras: [c.glass && `🍸 ${c.glass}`, c.method, c.garnish && `🌿 ${c.garnish}`].filter(Boolean) as string[],
    ingredients: c.ingredients.map((i) => ({
      quantity: i.amount,
      unit: i.units || undefined,
      food: i.name,
      note: [i.optional ? 'optional' : '', i.note ?? ''].filter(Boolean).join(', ') || undefined,
    })),
    steps: steps(c.instructions),
  };
}
