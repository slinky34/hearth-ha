import { addDays, addWeeks, isToday, startOfWeek } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useGrocy } from '../lib/grocy';
import { mealPlan, type PlanEntry } from '../lib/mealie';
import { openRecipe } from './RecipesView';
import { useEffect } from 'react';
import { useStore } from '../lib/store';
import { useIsPhone } from '../lib/hooks';
import type { MealType } from '../lib/types';
import { dateKey } from '../lib/util';
import { dateShort, format, t } from '../lib/i18n';

const MEALS: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '🥣' },
  { key: 'lunch', label: 'Lunch', icon: '🥪' },
  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
];

export function MealsView() {
  const { data, set } = useStore();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: data.settings.weekStartsOn }));
  const [editing, setEditing] = useState<string | null>(null); // `${dateKey}|${meal}`
  const [draft, setDraft] = useState('');
  const phone = useIsPhone();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Meal rows can be folded (e.g. hide Breakfast); remembered on this device.
  const [foldedRows, setFoldedRows] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('hearth.fold.meals') || '[]');
    } catch {
      return [];
    }
  });
  const toggleRow = (k: string) =>
    setFoldedRows((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try {
        localStorage.setItem('hearth.fold.meals', JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  const { grocy } = useGrocy();
  const [mealie, setMealie] = useState<PlanEntry[]>([]);
  useEffect(() => {
    mealPlan(weekStart, 7).then(setMealie).catch(() => setMealie([]));
  }, [weekStart]);
  // Mealie "side" entries go with dinner.
  const mealieFor = (k: string, meal: MealType) =>
    mealie.filter((e) => e.date === k && (e.type === meal || (meal === 'dinner' && e.type === 'side')));
  // Grocy meal plan entries fill empty slots (sections without a name count as dinner).
  const grocyMeal = (k: string, meal: MealType) =>
    grocy.meals
      ?.filter((g) => g.day === k && (g.section.includes(meal) || (!g.section && meal === 'dinner')))
      .map((g) => g.name)
      .join(', ') || '';

  const begin = (k: string, meal: MealType) => {
    setEditing(`${k}|${meal}`);
    setDraft(data.meals[k]?.[meal] ?? '');
  };
  const commit = () => {
    if (!editing) return;
    const [k, meal] = editing.split('|') as [string, MealType];
    const value = draft.trim();
    set('meals', (prev) => {
      const day = { ...prev[k] };
      if (value) day[meal] = value;
      else delete day[meal];
      const next = { ...prev, [k]: day };
      if (!Object.keys(day).length) delete next[k];
      return next;
    });
    setEditing(null);
  };

  const cell = (d: Date, m: (typeof MEALS)[number]) => {
              const k = dateKey(d);
              const id = `${k}|${m.key}`;
              const value = data.meals[k]?.[m.key];
              return editing === id ? (
                <textarea
                  key={id}
                  className="meal-cell editing"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commit();
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                !value && mealieFor(k, m.key).length > 0 ? (
                  <div key={id} className={`meal-cell filled mealie ${m.key}`}>
                    {mealieFor(k, m.key).map((e, n) =>
                      e.recipe ? (
                        <button key={n} className="meal-recipe" onClick={() => openRecipe(e.recipe!.slug)}>
                          📖 {e.recipe.name}
                        </button>
                      ) : (
                        <span key={n}>{e.title}</span>
                      ),
                    )}
                    <span className="raw-tag">Mealie</span>
                    <button className="meal-edit" onClick={() => begin(k, m.key)} aria-label={t('Edit')}>
                      ✎
                    </button>
                  </div>
                ) : (
                <button key={id} className={`meal-cell ${value ? 'filled' : ''} ${m.key}`} onClick={() => begin(k, m.key)}>
                  {value ??
                    (grocyMeal(k, m.key) ? (
                      <span className="grocy-meal">
                        {grocyMeal(k, m.key)}
                        <span className="raw-tag">Grocy</span>
                      </span>
                    ) : (
                      <span className="plus">+</span>
                    ))}
                </button>
                )
              );
  };

  const header = (
    <div className="view-head">
      <div className="nav-group">
        <button className="icon-btn" onClick={() => setWeekStart((w) => addWeeks(w, -1))} aria-label={t('Previous week')}>
          <ChevronLeft />
        </button>
        <button className="icon-btn" onClick={() => setWeekStart((w) => addWeeks(w, 1))} aria-label={t('Next week')}>
          <ChevronRight />
        </button>
        <h1>{t('Meals')} · {dateShort(weekStart)}</h1>
      </div>
    </div>
  );

  // Phones: one card per day, meals stacked inside.
  if (phone)
    return (
      <div className="meals">
        {header}
        <div className="meal-days">
          {days.map((d) => (
            <section key={d.toISOString()} className={`meal-daycard ${isToday(d) ? 'today' : ''}`}>
              <h3>
                <span className="dow">{format(d, 'EEEE')}</span> <span className="muted">{format(d, 'd')}</span>
              </h3>
              {MEALS.map((m) => (
                <div key={m.key} className="meal-line">
                  <span className="meal-line-label" title={t(m.label)}>{m.icon}</span>
                  {cell(d, m)}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    );

  return (
    <div className="meals">
      {header}
      <div className="meal-grid">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={`meal-day ${isToday(d) ? 'today' : ''}`}>
            <span className="dow">{format(d, 'EEE')}</span>
            <span className="dnum">{format(d, 'd')}</span>
          </div>
        ))}
        {MEALS.map((m) => (
          <div key={m.key} className={`meal-row ${foldedRows.includes(m.key) ? 'folded' : ''}`}>
            <button className="meal-label" onClick={() => toggleRow(m.key)} aria-expanded={!foldedRows.includes(m.key)}>
              <span>{m.icon}</span>
              {t(m.label)}
              <ChevronDown size={16} className="section-chevron" />
            </button>
            {foldedRows.includes(m.key) ? (
              <button className="meal-folded" onClick={() => toggleRow(m.key)}>
                {t('{n} planned', { n: days.filter((d) => data.meals[dateKey(d)]?.[m.key] || mealieFor(dateKey(d), m.key).length || grocyMeal(dateKey(d), m.key)).length })}
              </button>
            ) : days.map((d) => cell(d, m))}
          </div>
        ))}
      </div>
    </div>
  );
}
