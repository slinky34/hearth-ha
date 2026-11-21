import { addDays, format, isToday, startOfDay } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Flame, Pencil, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useHa } from '../lib/ha';
import { useKiosk } from '../lib/kiosk';
import { useStore } from '../lib/store';
import type { Chore, Completions, Member } from '../lib/types';
import { WEEKDAYS_SHORT, dateKey, initials, tint, uid } from '../lib/util';

const dueOn = (c: Chore, d: Date) => c.days.length === 0 || c.days.includes(d.getDay());

function streakFor(member: Member, chores: Chore[], completions: Completions) {
  const mine = chores.filter((c) => c.memberId === member.id);
  if (!mine.length) return 0;
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(startOfDay(new Date()), -i);
    const due = mine.filter((c) => dueOn(c, d));
    if (!due.length) continue;
    const done = new Set(completions[dateKey(d)] ?? []);
    if (due.every((c) => done.has(c.id))) streak++;
    else if (i > 0) break; // today not finished yet doesn't break the streak
  }
  return streak;
}

function pointsFor(member: Member, chores: Chore[], completions: Completions) {
  const byId = new Map(chores.filter((c) => c.memberId === member.id).map((c) => [c.id, c]));
  return Object.values(completions).reduce((sum, ids) => sum + ids.reduce((s, id) => s + (byId.get(id)?.points ?? 0), 0), 0);
}

export function ChoresView() {
  const { data, set } = useStore();
  const { selected } = useHa();
  const { kiosk } = useKiosk();
  const { members, chores, completions } = data;
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(false);
  const [party, setParty] = useState<Member | null>(null);
  const key = dateKey(day);
  const done = new Set(completions[key] ?? []);
  const shown = members.filter((m) => selected.length === 0 || selected.includes(m.id));

  const toggle = (c: Chore, m: Member) => {
    const wasDone = done.has(c.id);
    set('completions', (prev) => {
      const list = new Set(prev[key] ?? []);
      if (list.has(c.id)) list.delete(c.id);
      else list.add(c.id);
      return { ...prev, [key]: [...list] };
    });
    if (!wasDone) {
      const due = chores.filter((x) => x.memberId === m.id && dueOn(x, day));
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
          <button className="icon-btn" onClick={() => setDay((d) => addDays(d, -1))} aria-label="Previous day">
            <ChevronLeft />
          </button>
          <button className="icon-btn" onClick={() => setDay((d) => addDays(d, 1))} aria-label="Next day">
            <ChevronRight />
          </button>
          <h1>{isToday(day) ? 'Today’s chores' : format(day, 'EEEE, MMM d')}</h1>
          {!isToday(day) && (
            <button className="btn ghost" onClick={() => setDay(startOfDay(new Date()))}>
              Today
            </button>
          )}
        </div>
        {!kiosk && (
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={18} /> Edit chores
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="empty">Add your family in Settings to start assigning chores.</div>
      ) : (
        <div className="chore-board">
          {shown.map((m) => {
            const due = chores.filter((c) => c.memberId === m.id && dueOn(c, day));
            const n = due.filter((c) => done.has(c.id)).length;
            const streak = streakFor(m, chores, completions);
            const allDone = due.length > 0 && n === due.length;
            return (
              <section key={m.id} className={`chore-col ${allDone ? 'all-done' : ''}`} style={{ ['--member' as string]: m.color }}>
                <header>
                  <span className="avatar lg" style={{ background: m.color }}>
                    {initials(m.name)}
                  </span>
                  <div>
                    <h2>{m.name}</h2>
                    <div className="stats">
                      <span title="Total stars">
                        <Star size={15} fill="currentColor" /> {pointsFor(m, chores, completions)}
                      </span>
                      {streak > 0 && (
                        <span title="Days in a row with every chore done">
                          <Flame size={15} fill="currentColor" /> {streak}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="progress-num">
                    {n}/{due.length}
                  </span>
                </header>
                <div className="progress">
                  <div style={{ width: due.length ? `${(n / due.length) * 100}%` : 0, background: m.color }} />
                </div>
                <div className="chore-list">
                  {due.map((c) => {
                    const isDone = done.has(c.id);
                    return (
                      <button
                        key={c.id}
                        className={`chore ${isDone ? 'done' : ''}`}
                        style={isDone ? { background: tint(m.color, 0.2) } : {}}
                        onClick={() => toggle(c, m)}
                      >
                        <span className="chore-emoji">{c.emoji || '✅'}</span>
                        <span className="chore-title">{c.title}</span>
                        <span className="check" style={isDone ? { background: m.color, borderColor: m.color } : {}}>
                          {isDone && <Check size={20} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                  {due.length === 0 && <p className="muted center">Nothing today 🎈</p>}
                </div>
              </section>
            );
          })}
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
        All done, {member.name}! 🎉
      </div>
    </div>
  );
}

function ChoreEditor({ onClose }: { onClose: () => void }) {
  const { data, set } = useStore();
  const { members, chores } = data;
  const blank = (): Chore => ({ id: '', title: '', emoji: '', memberId: members[0]?.id ?? '', days: [], points: 1 });
  const [form, setForm] = useState<Chore>(blank);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    if (!form.title.trim()) return setErr('Name the chore.');
    if (!form.memberId) return setErr('Pick who it’s for.');
    const chore = { ...form, title: form.title.trim(), id: form.id || uid() };
    set('chores', (prev) => (form.id ? prev.map((c) => (c.id === form.id ? chore : c)) : [...prev, chore]));
    setForm(blank());
    setErr(null);
  };

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }));

  return (
    <Modal title="Edit chores" onClose={onClose} wide>
      <div className="chore-editor">
        <div className="form card-inset">
          <h3>{form.id ? 'Edit chore' : 'Add a chore'}</h3>
          <div className="row">
            <input className="emoji-input" placeholder="🧹" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            <input placeholder="Chore name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <label>
            For
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
            Repeats {form.days.length === 0 && <span className="muted">· every day</span>}
            <div className="chips">
              {WEEKDAYS_SHORT.map((w, i) => (
                <button key={i} className={`chip round ${form.days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>
                  {w}
                </button>
              ))}
            </div>
          </label>
          <label className="row">
            Stars
            <input type="number" min={0} max={20} value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) || 0 })} style={{ width: 90 }} />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="row">
            <button className="btn primary" onClick={save}>
              {form.id ? 'Save' : 'Add chore'}
            </button>
            {form.id && (
              <button className="btn ghost" onClick={() => setForm(blank())}>
                Cancel
              </button>
            )}
          </div>
        </div>
        <div className="chore-existing">
          {members.map((m) => {
            const mine = chores.filter((c) => c.memberId === m.id);
            if (!mine.length) return null;
            return (
              <div key={m.id}>
                <h3 style={{ color: m.color }}>{m.name}</h3>
                {mine.map((c) => (
                  <div key={c.id} className="list-row">
                    <span>{c.emoji}</span>
                    <span className="grow">{c.title}</span>
                    <span className="muted small">
                      {c.days.length ? c.days.map((d) => WEEKDAYS_SHORT[d]).join(' ') : 'Daily'} · {c.points}★
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
