import { addDays, isToday, parseISO, startOfDay } from 'date-fns';
import { Avatar } from '../lib/presence';
import { RewardsView } from './RewardsView';
import { Check, ChevronLeft, ChevronRight, Flame, Pencil, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import { grocyDoChore, useGrocy } from '../lib/grocy';
import { toast } from '../components/Toast';
import { useHa } from '../lib/ha';
import { useKiosk } from '../lib/kiosk';
import { useFolded } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { Chore, Completions, Member, Period, TodoItem } from '../lib/types';
import { assigneeOn, choresFor, dateKey, involves, pastel, uid } from '../lib/util';
import { dateLong, t, weekdayNarrow } from '../lib/i18n';

export const PERIODS: { id: Period; label: string; icon: string }[] = [
  { id: 'morning', label: 'Morning', icon: '🌅' },
  { id: 'afternoon', label: 'Afternoon', icon: '☀️' },
  { id: 'evening', label: 'Evening', icon: '🌙' },
  { id: 'anytime', label: 'Chores', icon: '🧹' },
];
const periodOf = (c: Chore): Period => c.period ?? 'anytime';

function streakFor(member: Member, chores: Chore[], completions: Completions) {
  if (!chores.some((c) => involves(c, member.id))) return 0;
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(startOfDay(new Date()), -i);
    const due = choresFor(chores, member.id, d);
    if (!due.length) continue;
    const done = new Set(completions[dateKey(d)] ?? []);
    if (due.every((c) => done.has(c.id))) streak++;
    else if (i > 0) break; // today not finished yet doesn't break the streak
  }
  return streak;
}

/** Stars earned: each completed chore counts for whoever it was assigned to that day. */
export function pointsFor(member: Member, chores: Chore[], completions: Completions) {
  const byId = new Map(chores.map((c) => [c.id, c]));
  let total = 0;
  for (const [day, ids] of Object.entries(completions)) {
    const d = parseISO(day);
    for (const id of ids) {
      const c = byId.get(id);
      if (c && assigneeOn(c, d) === member.id) total += c.points;
    }
  }
  return total;
}

/** Items from a person's linked HA to-do list (e.g. a TaskMate child list). */
function useTodo(entity?: string) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const load = useCallback(async () => {
    if (!entity) return setItems([]);
    try {
      setItems(await api.todoItems(entity));
    } catch {
      setItems([]);
    }
  }, [entity]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  const toggle = async (it: TodoItem) => {
    const status = it.status === 'completed' ? 'needs_action' : 'completed';
    setItems((p) => p.map((x) => (x.uid === it.uid ? { ...x, status } : x)));
    await api.service('todo', 'update_item', { entity_id: entity, item: it.uid, status }).catch(() => undefined);
    load();
  };
  return { items, toggle };
}

function Ring({ pct, color, children, dim, on, onClick, label }: {
  pct: number; color: string; children: ReactNode; dim?: boolean; on?: boolean; onClick: () => void; label: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <button className={`ring ${dim ? 'dim' : ''} ${on ? 'on' : ''}`} onClick={onClick} disabled={dim}>
      <svg viewBox="0 0 64 64" width="60" height="60">
        <circle cx="32" cy="32" r={r} fill="var(--ring-bg)" stroke="var(--ring-track)" strokeWidth="5" />
        {pct > 0 && (
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
        )}
      </svg>
      <span className="ring-icon">{children}</span>
      <span className="ring-label">{label}</span>
    </button>
  );
}

function MemberColumn({ m, day, onToggle, layout }: {
  m: Member; day: Date; onToggle: (c: Chore, m: Member) => void; layout: 'cards' | 'compact';
}) {
  const { data } = useStore();
  const { entities } = useHa();
  const { chores, completions } = data;
  const [filter, setFilter] = useState<Period | null>(null);
  const todo = useTodo(m.todo);
  const done = new Set(completions[dateKey(day)] ?? []);
  const due = choresFor(chores, m.id, day);
  const todoOpen = isToday(day) ? todo.items : [];
  const total = due.length + todoOpen.length;
  const n = due.filter((c) => done.has(c.id)).length + todoOpen.filter((i) => i.status === 'completed').length;
  const streak = streakFor(m, chores, completions);
  const listName = entities.find((e) => e.entity_id === m.todo)?.name ?? t('To-do');
  const [folded, toggleFold] = useFolded(`task.${m.id}`);

  const ChoreCard = ({ c }: { c: Chore }) => {
    const isDone = done.has(c.id);
    return (
      <button
        className={`${layout === 'cards' ? 'task-card' : 'chore'} ${isDone ? 'done' : ''}`}
        style={isDone ? { background: pastel(m.color, layout === 'cards' ? 0.6 : 0.3) } : {}}
        onClick={() => onToggle(c, m)}
      >
        <span className="task-emoji">{c.emoji || '✅'}</span>
        <span className="task-title">{c.title}</span>
        {layout === 'cards' && c.points > 0 && (
          <span className="task-stars">
            <Star size={13} fill="currentColor" /> {c.points}
          </span>
        )}
        <span className="check" style={isDone ? { background: m.color, borderColor: m.color } : {}}>
          {isDone && <Check size={18} strokeWidth={3} />}
        </span>
      </button>
    );
  };

  if (folded)
    return (
      <section className="task-col folded" style={{ ['--member' as string]: m.color }}>
        <button className="fold-strip" onClick={toggleFold} aria-expanded={false} title={t('Show {name}', { name: m.name })}>
          <Avatar m={m} size="lg" />
          <span className="stat-pill">
            {n}/{total}
          </span>
          <span className="fold-name">{m.name}</span>
          <ChevronRight size={18} className="muted" />
        </button>
      </section>
    );

  return (
    <section className={`task-col ${layout} ${total > 0 && n === total ? 'all-done' : ''}`} style={{ ['--member' as string]: m.color }}>
      <header className="task-head">
        <Avatar m={m} size="lg" />
        <div className="grow">
          <h2>{m.name}</h2>
          <div className="task-stats">
            <span className="stat-pill">
              <Check size={13} strokeWidth={3} /> {n}/{total}
            </span>
            <span className="stat-pill star">
              <Star size={13} fill="currentColor" /> {pointsFor(m, chores, completions)}
            </span>
            {streak > 1 && (
              <span className="stat-pill flame">
                <Flame size={13} fill="currentColor" /> {streak}
              </span>
            )}
          </div>
        </div>
        <button className="icon-btn fold-btn" onClick={toggleFold} aria-label={t('Collapse')}>
          <ChevronLeft size={20} />
        </button>
      </header>

      {layout === 'cards' && (
        <div className="rings">
          {PERIODS.map((p) => {
            const list = due.filter((c) => periodOf(c) === p.id);
            const k = list.filter((c) => done.has(c.id)).length;
            return (
              <Ring
                key={p.id}
                label={t(p.label)}
                pct={list.length ? (k / list.length) * 100 : 0}
                color={m.color}
                dim={!list.length}
                on={filter === p.id}
                onClick={() => setFilter(filter === p.id ? null : p.id)}
              >
                {p.icon}
              </Ring>
            );
          })}
        </div>
      )}

      <div className="task-scroll">
        {PERIODS.filter((p) => !filter || filter === p.id).map((p) => {
          const list = due.filter((c) => periodOf(c) === p.id);
          if (!list.length) return null;
          return (
            <div key={p.id} className="task-section">
              {layout === 'cards' && <h3 className="task-section-title">{t(p.label)}</h3>}
              {list.map((c) => <ChoreCard key={c.id} c={c} />)}
            </div>
          );
        })}
        {!filter && todoOpen.length > 0 && (
          <div className="task-section">
            <h3 className="task-section-title small">{listName}</h3>
            {todoOpen.map((it) => {
              const isDone = it.status === 'completed';
              return (
                <button
                  key={it.uid}
                  className={`chore ${isDone ? 'done' : ''}`}
                  style={isDone ? { background: pastel(m.color, 0.3) } : {}}
                  onClick={() => todo.toggle(it)}
                >
                  <span className="task-emoji small">📝</span>
                  <span className="task-title">{it.summary}</span>
                  <span className="check" style={isDone ? { background: m.color, borderColor: m.color } : {}}>
                    {isDone && <Check size={18} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {total === 0 && <p className="muted center">{t('Nothing today')} 🎈</p>}
      </div>
    </section>
  );
}

function GrocyColumn() {
  const { grocy, reload } = useGrocy();
  const [busy, setBusy] = useState<number | null>(null);
  if (!grocy.chores) return null;
  const soon = addDays(startOfDay(new Date()), 1);
  const due = grocy.chores.filter((c) => !c.due || c.due < soon);
  return (
    <section className="task-col compact grocy-col">
      <header className="task-head">
        <span className="avatar lg grocy-avatar">🏠</span>
        <div className="grow">
          <h2>{t('Household')}</h2>
          <span className="muted small">{t('Grocy chores due')}</span>
        </div>
      </header>
      <div className="task-scroll">
        {due.map((c) => (
          <button
            key={c.id}
            className={`chore ${busy === c.id ? 'done' : ''}`}
            onClick={async () => {
              setBusy(c.id);
              await grocyDoChore(c.id).catch((e) => toast((e as Error).message));
              setTimeout(() => {
                setBusy(null);
                reload();
              }, 1200);
            }}
          >
            <span className="task-emoji small">🧽</span>
            <span className="task-title">
              {c.name}
              {c.due && c.due < startOfDay(new Date()) && <span className="overdue"> · {t('overdue')}</span>}
            </span>
            <span className="check">{busy === c.id && <Check size={18} strokeWidth={3} />}</span>
          </button>
        ))}
        {due.length === 0 && <p className="muted center">{t('All caught up')} ✨</p>}
      </div>
    </section>
  );
}

export function ChoresView() {
  const { nav } = useStore().data.settings;
  const [pane, setPane] = useState<'tasks' | 'rewards'>('tasks');
  if (!nav.rewardsInTasks) return <TasksBoard />;
  return (
    <div className="chores">
      <div className="segmented tasks-switch">
        <button className={pane === 'tasks' ? 'on' : ''} onClick={() => setPane('tasks')}>
          {t('Tasks')}
        </button>
        <button className={pane === 'rewards' ? 'on' : ''} onClick={() => setPane('rewards')}>
          🎁 {t('Rewards')}
        </button>
      </div>
      {pane === 'tasks' ? <TasksBoard /> : <RewardsView />}
    </div>
  );
}

function TasksBoard() {
  const { data, set } = useStore();
  const { selected } = useHa();
  const { kiosk } = useKiosk();
  const { members, chores, settings } = data;
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(false);
  const [party, setParty] = useState<Member | null>(null);
  const key = dateKey(day);
  const shown = members.filter((m) => selected.length === 0 || selected.includes(m.id));

  const toggle = (c: Chore, m: Member) => {
    const done = new Set(data.completions[key] ?? []);
    const wasDone = done.has(c.id);
    set('completions', (prev) => {
      const list = new Set(prev[key] ?? []);
      if (list.has(c.id)) list.delete(c.id);
      else list.add(c.id);
      return { ...prev, [key]: [...list] };
    });
    if (!wasDone) {
      const due = choresFor(chores, m.id, day);
      if (due.every((x) => x.id === c.id || done.has(x.id))) {
        setParty(m);
        setTimeout(() => setParty(null), 2600);
      }
    }
  };

  return (
    <div className="chores">
      <div className="view-head">
        <div className="nav-group">
          <button className="icon-btn" onClick={() => setDay((d) => addDays(d, -1))} aria-label={t('Previous day')}>
            <ChevronLeft />
          </button>
          <button className="icon-btn" onClick={() => setDay((d) => addDays(d, 1))} aria-label={t('Next day')}>
            <ChevronRight />
          </button>
          <h1>{isToday(day) ? t('Tasks') : dateLong(day)}</h1>
          {!isToday(day) && (
            <button className="btn ghost" onClick={() => setDay(startOfDay(new Date()))}>
              {t('Today')}
            </button>
          )}
        </div>
        <div className="nav-group">
          <div className="segmented">
            {(['cards', 'compact'] as const).map((l) => (
              <button key={l} className={settings.choreLayout === l ? 'on' : ''} onClick={() => set('settings', (p) => ({ ...p, choreLayout: l }))}>
                {l === 'cards' ? t('Cards') : t('Compact')}
              </button>
            ))}
          </div>
          {!kiosk && (
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil size={18} /> {t('Edit')}
            </button>
          )}
        </div>
      </div>

      {members.length === 0 ? (
        <div className="empty">{t('Add your family in Settings to start assigning chores.')}</div>
      ) : (
        <div className={`task-board ${settings.choreLayout}`}>
          {shown.map((m) => (
            <MemberColumn key={m.id} m={m} day={day} onToggle={toggle} layout={settings.choreLayout} />
          ))}
          {isToday(day) && selected.length === 0 && <GrocyColumn />}
        </div>
      )}

      {party && <Celebrate member={party} />}
      {editing && <ChoreEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

function Celebrate({ member }: { member: Member }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        rot: Math.random() * 360,
        e: ['🎉', '⭐', '✨', '🎊', '💫'][i % 5],
      })),
    [],
  );
  return (
    <div className="celebrate" aria-live="polite">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, rotate: `${b.rot}deg` }}>
          {b.e}
        </span>
      ))}
      <div className="celebrate-msg" style={{ background: member.color }}>
        {t('All done, {name}!', { name: member.name })} 🎉
      </div>
    </div>
  );
}

function ChoreEditor({ onClose }: { onClose: () => void }) {
  const { data, set } = useStore();
  const { members, chores } = data;
  const blank = (): Chore => ({ id: '', title: '', emoji: '', memberId: members[0]?.id ?? '', days: [], points: 1, period: 'anytime' });
  const [form, setForm] = useState<Chore>(blank);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    if (!form.title.trim()) return setErr(t('Name the chore.'));
    if (!form.memberId) return setErr(t('Pick who it’s for.'));
    const chore = { ...form, title: form.title.trim(), id: form.id || uid() };
    set('chores', (prev) => (form.id ? prev.map((c) => (c.id === form.id ? chore : c)) : [...prev, chore]));
    setForm(blank());
    setErr(null);
  };

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }));

  return (
    <Modal title={t('Edit chores')} onClose={onClose} wide>
      <div className="chore-editor">
        <div className="form card-inset">
          <h3>{form.id ? t('Edit chore') : t('Add a chore')}</h3>
          <div className="row">
            <input className="emoji-input" placeholder="🧹" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            <input placeholder={t('Chore name')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <label>
            {t('For')}
            <div className="chips">
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`chip ${form.memberId === m.id ? 'on' : ''}`}
                  style={form.memberId === m.id ? { background: m.color, borderColor: m.color } : {}}
                  onClick={() => setForm({ ...form, memberId: m.id })}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </label>
          <label>
            {t('When')}
            <div className="chips">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  className={`chip ${(form.period ?? 'anytime') === p.id ? 'on' : ''}`}
                  onClick={() => setForm({ ...form, period: p.id })}
                >
                  {p.icon} {p.id === 'anytime' ? t('Anytime') : t(p.label)}
                </button>
              ))}
            </div>
          </label>
          <label>
            {t('Rotate weekly between')} <span className="muted small">· {t('optional')}</span>
            <div className="chips">
              {members.map((m) => {
                const on = !!form.rotate?.includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`chip ${on ? 'on' : ''}`}
                    style={on ? { background: m.color, borderColor: m.color } : {}}
                    onClick={() => {
                      const r = on ? (form.rotate ?? []).filter((x) => x !== m.id) : [...(form.rotate ?? []), m.id];
                      setForm({ ...form, rotate: r.length ? r : undefined, memberId: r[0] ?? form.memberId });
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </label>
          <label>
            {t('How often')}
            <div className="chips">
              <button className={`chip ${!form.date ? 'on' : ''}`} onClick={() => setForm({ ...form, date: undefined })}>
                {t('Repeats')}
              </button>
              <button className={`chip ${form.date ? 'on' : ''}`} onClick={() => setForm({ ...form, date: form.date ?? dateKey(new Date()) })}>
                {t('Just once')}
              </button>
            </div>
          </label>
          {form.date ? (
            <label>
              {t('On')}
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ maxWidth: 200 }} />
            </label>
          ) : (
            <label>
              {t('Repeats')} {form.days.length === 0 && <span className="muted">· {t('every day')}</span>}
              <div className="chips">
                {weekdayNarrow().map((w, i) => (
                  <button key={i} className={`chip round ${form.days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>
                    {w}
                  </button>
                ))}
              </div>
            </label>
          )}
          <label className="row">
            {t('Stars')}
            <input type="number" min={0} max={20} value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) || 0 })} style={{ width: 90 }} />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="row">
            <button className="btn primary" onClick={save}>
              {form.id ? t('Save') : t('Add chore')}
            </button>
            {form.id && (
              <button className="btn ghost" onClick={() => setForm(blank())}>
                {t('Cancel')}
              </button>
            )}
          </div>
        </div>
        <div className="chore-existing">
          {members.map((m) => {
            const mine = chores.filter((c) => involves(c, m.id));
            if (!mine.length) return null;
            return (
              <div key={m.id}>
                <h3 style={{ color: m.color }}>{m.name}</h3>
                {mine.map((c) => (
                  <div key={c.id} className="list-row">
                    <span>{c.emoji}</span>
                    <span className="grow">{c.title}</span>
                    <span className="muted small">
                      {PERIODS.find((p) => p.id === (c.period ?? 'anytime'))?.icon}{' '}
                      {c.date ? `${t('Once')} ${c.date}` : c.days.length ? c.days.map((d) => weekdayNarrow()[d]).join(' ') : t('Daily')}
                      {c.rotate?.length ? ` · 🔄 ${c.rotate.map((id) => members.find((x) => x.id === id)?.name ?? '?').join('/')}` : ''} · {c.points}★
                    </span>
                    <button className="icon-btn" onClick={() => setForm(c)} aria-label="Edit">
                      <Pencil size={18} />
                    </button>
                    <button className="icon-btn" onClick={() => set('chores', (prev) => prev.filter((x) => x.id !== c.id))} aria-label="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
