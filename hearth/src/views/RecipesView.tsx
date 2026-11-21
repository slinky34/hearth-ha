import { isToday, parseISO, startOfDay } from 'date-fns';
import { CalendarPlus, ChefHat, Wine, ChevronLeft, ChevronRight, Clock, ExternalLink, ListPlus, Search, Timer as TimerIcon, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toast';
import { useTimers } from '../components/Timers';
import { api } from '../lib/api';
import { useHa } from '../lib/ha';
import { dateMedium, t } from '../lib/i18n';
import {
  getRecipe, imageUrl, ingredientText, mealPlan, mealieEntry, planRecipe, searchRecipes, timersIn,
  type PlanEntry, type Recipe, type RecipeSummary,
} from '../lib/mealie';
import { dateKey } from '../lib/util';
import { barCocktail, barCocktails } from '../lib/bar';

/** Lets other screens (e.g. Meals) open a recipe: the app switches here and passes it in. */
export function openRecipe(idOrSlug: string) {
  window.dispatchEvent(new CustomEvent('hearth:open-recipe', { detail: idOrSlug }));
}

const TYPE_ICON: Record<string, string> = { breakfast: '🥣', lunch: '🥪', dinner: '🍽️', side: '🥗' };

function RecipeImage({ r, images, className }: { r: RecipeSummary; images: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = r.imageSrc ?? (images && r.hasImage ? imageUrl(r.id) : null);
  if (!src || broken)
    return (
      <span className={`recipe-img placeholder ${className ?? ''}`}>
        {r.source === 'bar' ? <Wine size={36} /> : <ChefHat size={36} />}
      </span>
    );
  return <img className={`recipe-img ${className ?? ''}`} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />;
}

type Source = 'mealie' | 'bar';

export function RecipesView({ openSlug, onOpened }: { openSlug?: string | null; onOpened?: () => void }) {
  const [mealie, setMealie] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [bar, setBar] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [barErr, setBarErr] = useState('');
  const [source, setSource] = useState<Source>('mealie');
  const [images, setImages] = useState(false);
  const [plan, setPlan] = useState<PlanEntry[]>([]);
  const [results, setResults] = useState<RecipeSummary[] | null>(null);
  const [noSearch, setNoSearch] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ id: string; source: Source } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const e = await mealieEntry();
        if (!e.entry_id) return setMealie('missing');
        setImages(e.images);
        setMealie('ready');
        mealPlan(startOfDay(new Date())).then(setPlan).catch(() => setPlan([]));
      } catch {
        setMealie('missing');
      }
    })();
    fetch('api/bar/status')
      .then((r) => r.json())
      .then((st: { configured: boolean; ok: boolean; error?: string }) => {
        if (!st.configured) return setBar('missing');
        if (!st.ok) {
          setBarErr(st.error ?? '');
          return setBar('error');
        }
        setBar('ready');
      })
      .catch(() => setBar('missing'));
  }, []);

  // Start on cocktails when Mealie isn't set up but Bar Assistant is.
  useEffect(() => {
    if (mealie === 'missing' && (bar === 'ready' || bar === 'error')) setSource('bar');
  }, [mealie, bar]);

  useEffect(() => {
    if (!openSlug) return;
    setOpen({ id: openSlug, source: 'mealie' });
    onOpened?.();
  }, [openSlug, onOpened]);

  const ready = source === 'mealie' ? mealie === 'ready' : bar === 'ready';

  // Search (debounced). Empty query lists recipes too.
  useEffect(() => {
    if (!ready) return;
    setResults(null);
    const id = setTimeout(() => {
      (source === 'mealie' ? searchRecipes(q.trim()) : barCocktails(q.trim()))
        .then((r) => {
          setResults(r);
          setNoSearch(false);
        })
        .catch(() => setNoSearch(true));
    }, 300);
    return () => clearTimeout(id);
  }, [q, ready, source]);

  if (mealie === 'missing' && bar === 'missing')
    return (
      <div className="recipes">
        <div className="view-head">
          <h1>{t('Recipes')}</h1>
        </div>
        <div className="empty">
          {t('Add the Mealie integration in Home Assistant (Settings → Devices & services) to see your recipes and meal plan here.')}
          <br />
          <br />
          {t('For cocktails, set your Bar Assistant address and token on the Hearth add-on’s Configuration tab.')}
        </div>
      </div>
    );

  const both = mealie === 'ready' && (bar === 'ready' || bar === 'error');
  return (
    <div className="recipes">
      <div className="view-head">
        <div className="nav-group">
          <h1>{t('Recipes')}</h1>
          {both && (
            <div className="segmented">
              <button className={source === 'mealie' ? 'on' : ''} onClick={() => setSource('mealie')}>
                🍽️ {t('Food')}
              </button>
              <button className={source === 'bar' ? 'on' : ''} onClick={() => setSource('bar')}>
                🍸 {t('Cocktails')}
              </button>
            </div>
          )}
        </div>
        {!noSearch && (
          <label className="search-box">
            <Search size={18} />
            <input placeholder={source === 'bar' ? t('Search cocktails…') : t('Search recipes…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
      </div>

      <div className="recipes-scroll">
        {source === 'mealie' && plan.length > 0 && !q && (
          <section>
            <h3 className="today-label">{t('Meal plan')}</h3>
            <div className="plan-row">
              {plan.map((p, i) => (
                <button key={i} className="plan-card" onClick={() => p.recipe && setOpen({ id: p.recipe.slug, source: 'mealie' })} disabled={!p.recipe}>
                  {p.recipe ? <RecipeImage r={p.recipe} images={images} /> : <span className="recipe-img placeholder">{TYPE_ICON[p.type] ?? '🍽️'}</span>}
                  <span className="plan-when">
                    {isToday(parseISO(p.date)) ? t('Today') : dateMedium(parseISO(p.date))} · {TYPE_ICON[p.type] ?? ''} {t(p.type.charAt(0).toUpperCase() + p.type.slice(1))}
                  </span>
                  <b>{p.recipe?.name ?? p.title ?? '—'}</b>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="today-label">{q ? t('Results') : source === 'bar' ? t('Cocktails') : t('All recipes')}</h3>
          {source === 'bar' && bar === 'error' ? (
            <div className="banner static">
              <b>{t('Couldn’t reach Bar Assistant.')}</b> {barErr}
            </div>
          ) : noSearch ? (
            <p className="muted">
              {source === 'bar'
                ? t('Couldn’t reach Bar Assistant.')
                : t('Browsing all recipes needs a newer Home Assistant (with the mealie.get_recipes action). Your meal plan still works.')}
            </p>
          ) : results === null ? (
            <p className="muted">{t('Loading…')}</p>
          ) : results.length === 0 ? (
            <p className="muted">{t('No recipes found.')}</p>
          ) : (
            <div className="recipe-grid">
              {results.map((r) => (
                <button key={r.id} className="recipe-card" onClick={() => setOpen({ id: r.slug, source })}>
                  <RecipeImage r={r} images={images} />
                  <span className="recipe-card-body">
                    <b>{r.name}</b>
                    {r.time && (
                      <span className="muted small">
                        <Clock size={13} /> {r.time}
                      </span>
                    )}
                    {!r.time && r.description && <span className="muted small clamp2">{r.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <RecipeDetail
          slug={open.id}
          source={open.source}
          images={images}
          onClose={() => setOpen(null)}
          onPlanned={() => mealPlan(startOfDay(new Date())).then(setPlan)}
        />
      )}
    </div>
  );
}

function RecipeDetail({ slug, source, images, onClose, onPlanned }: { slug: string; source: Source; images: boolean; onClose: () => void; onPlanned: () => void }) {
  const { entities } = useHa();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cooking, setCooking] = useState(false);
  const [panel, setPanel] = useState<'plan' | 'list' | null>(null);
  const [planDate, setPlanDate] = useState(dateKey(new Date()));
  const [planType, setPlanType] = useState('dinner');
  const lists = entities.filter((e) => e.entity_id.startsWith('todo.'));
  const [list, setList] = useState('');

  useEffect(() => {
    (source === 'bar' ? barCocktail(slug) : getRecipe(slug)).then(setRecipe).catch((e) => setErr((e as Error).message));
  }, [slug, source]);

  if (cooking && recipe) return <CookMode recipe={recipe} onClose={() => setCooking(false)} />;

  const addToList = async () => {
    if (!recipe || !list) return;
    const items = recipe.ingredients.filter((i) => !i.title || i.food || i.note).map((i) => ingredientText(i, 1)).filter(Boolean);
    let ok = 0;
    for (const item of items) {
      try {
        await api.service('todo', 'add_item', { entity_id: list, item });
        ok++;
      } catch (e) {
        toast((e as Error).message);
        break;
      }
    }
    if (ok) toast(t('Added {n} ingredients', { n: ok }), 'info');
    setPanel(null);
  };

  const plan = async () => {
    if (!recipe) return;
    try {
      await planRecipe(recipe.id, planDate, planType);
      toast(t('Added to the meal plan'), 'info');
      onPlanned();
      setPanel(null);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Modal title={recipe?.name ?? t('Recipe')} onClose={onClose} wide>
      {err && <p className="error">{err}</p>}
      {!recipe && !err && <p className="muted">{t('Loading…')}</p>}
      {recipe && (
        <div className="recipe-detail">
          <div className="recipe-hero">
            <RecipeImage r={recipe} images={images} className="hero" />
            <div className="recipe-hero-text">
              {recipe.description && <p>{recipe.description}</p>}
              <div className="recipe-meta">
                {recipe.extras?.map((x) => (
                  <span key={x}>{x}</span>
                ))}
                {recipe.time && (
                  <span>
                    <Clock size={16} /> {recipe.time}
                  </span>
                )}
                {recipe.yield && (
                  <span>
                    <Users size={16} /> {recipe.yield}
                  </span>
                )}
              </div>
              <div className="recipe-actions">
                <button className="btn primary big-btn" onClick={() => setCooking(true)} disabled={!recipe.steps.length && !recipe.ingredients.length}>
                  {source === 'bar' ? <Wine size={20} /> : <ChefHat size={20} />} {source === 'bar' ? t('Start mixing') : t('Start cooking')}
                </button>
{source === 'mealie' && (
                <button className={`btn ${panel === 'plan' ? 'on' : ''}`} onClick={() => setPanel(panel === 'plan' ? null : 'plan')}>
                  <CalendarPlus size={18} /> {t('Add to meal plan')}
                </button>
                )}
                <button className={`btn ${panel === 'list' ? 'on' : ''}`} onClick={() => setPanel(panel === 'list' ? null : 'list')}>
                  <ListPlus size={18} /> {t('Add ingredients to list')}
                </button>
                {recipe.url && (
                  <a className="btn ghost" href={recipe.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} /> {t('Source')}
                  </a>
                )}
              </div>
              {panel === 'plan' && (
                <div className="inline-panel">
                  <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                  <select value={planType} onChange={(e) => setPlanType(e.target.value)}>
                    {['breakfast', 'lunch', 'dinner', 'side'].map((x) => (
                      <option key={x} value={x}>
                        {TYPE_ICON[x]} {t(x.charAt(0).toUpperCase() + x.slice(1))}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" onClick={plan}>
                    {t('Add')}
                  </button>
                </div>
              )}
              {panel === 'list' && (
                <div className="inline-panel">
                  <select value={list} onChange={(e) => setList(e.target.value)}>
                    <option value="">{t('Choose a list…')}</option>
                    {lists.map((l) => (
                      <option key={l.entity_id} value={l.entity_id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" onClick={addToList} disabled={!list}>
                    {t('Add')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="recipe-columns">
            <section>
              <h3 className="today-label">{t('Ingredients')}</h3>
              <ul className="ing-list">
                {recipe.ingredients.map((i, k) =>
                  i.title && !i.food && !i.note ? (
                    <li key={k} className="ing-title">{i.title}</li>
                  ) : (
                    <li key={k}>{ingredientText(i, 1)}</li>
                  ),
                )}
              </ul>
            </section>
            <section>
              <h3 className="today-label">{t('Steps')}</h3>
              <ol className="step-list">
                {recipe.steps.map((s, k) => (
                  <li key={k}>
                    {s.title && <b>{s.title}. </b>}
                    {s.text}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Full-screen, step-by-step cooking with ingredient checklist and quick timers. */
function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { start } = useTimers();
  const [i, setI] = useState(-1); // -1 = gather ingredients
  const [scale, setScale] = useState(1);
  const [have, setHave] = useState<Set<number>>(new Set());
  const total = recipe.steps.length;
  const done = i >= total;

  // Keep the screen on while cooking.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => undefined);
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(total, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(-1, x - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [total, onClose]);

  const swipe = useRef<number | null>(null);
  const down = (e: RPointerEvent) => (swipe.current = e.clientX);
  const up = (e: RPointerEvent) => {
    if (swipe.current == null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) > 90) setI((x) => (dx < 0 ? Math.min(total, x + 1) : Math.max(-1, x - 1)));
  };

  const stepTimers = i >= 0 && i < total ? timersIn(recipe.steps[i].text) : [];

  return (
    <div className="cook" onPointerDown={down} onPointerUp={up}>
      <header className="cook-head">
        <h2>{recipe.name}</h2>
        <div className="segmented">
          {[0.5, 1, 2].map((s) => (
            <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>
              {s === 0.5 ? '½×' : `${s}×`}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>
          <X size={26} />
        </button>
      </header>
      <div className="cook-progress">
        {Array.from({ length: total + 1 }, (_, k) => (
          <i key={k} className={k - 1 <= i ? 'on' : ''} />
        ))}
      </div>

      <div className="cook-body">
        <aside className="cook-ings">
          <h3 className="today-label">{t('Ingredients')}</h3>
          {recipe.ingredients.map((ing, k) =>
            ing.title && !ing.food && !ing.note ? (
              <div key={k} className="ing-title">{ing.title}</div>
            ) : (
              <button
                key={k}
                className={`cook-ing ${have.has(k) ? 'have' : ''}`}
                onClick={() => setHave((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              >
                <span className="today-check">{have.has(k) ? '✓' : ''}</span>
                <span>{ingredientText(ing, scale)}</span>
              </button>
            ),
          )}
        </aside>

        <main className="cook-step">
          {i === -1 ? (
            <>
              <span className="cook-step-num">{t('Get ready')}</span>
              <p className="cook-text">{t('Gather the ingredients, then tap Next to start.')}</p>
              <p className="muted">{t('{n} of {total} ingredients ready', { n: have.size, total: recipe.ingredients.filter((x) => !x.title || x.food || x.note).length })}</p>
            </>
          ) : done ? (
            <>
              <span className="cook-step-num">{t('All done!')}</span>
              <p className="cook-text">{t('Enjoy your meal')} 🍽️</p>
              <button className="btn primary big-btn" onClick={onClose}>
                {t('Close')}
              </button>
            </>
          ) : (
            <>
              <span className="cook-step-num">{t('Step {n} of {total}', { n: i + 1, total })}</span>
              {recipe.steps[i].title && <h3 className="cook-step-title">{recipe.steps[i].title}</h3>}
              <p className="cook-text">{recipe.steps[i].text}</p>
              {stepTimers.length > 0 && (
                <div className="cook-timers">
                  {stepTimers.map((tm) => (
                    <button
                      key={tm.label}
                      className="btn"
                      onClick={() => {
                        start(recipe.name, '🍳', tm.minutes);
                        toast(t('Timer started: {label}', { label: tm.label }), 'info');
                      }}
                    >
                      <TimerIcon size={18} /> {t('Start {label} timer', { label: tm.label })}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <footer className="cook-nav">
        <button className="btn big-btn" onClick={() => setI((x) => Math.max(-1, x - 1))} disabled={i === -1}>
          <ChevronLeft /> {t('Back')}
        </button>
        <button className="btn primary big-btn" onClick={() => setI((x) => Math.min(total, x + 1))} disabled={done}>
          {i === -1 ? t('Start') : i === total - 1 ? t('Finish') : t('Next')} <ChevronRight />
        </button>
      </footer>
    </div>
  );
}

export const mealieTypeIcon = TYPE_ICON;
