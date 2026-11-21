import { parseISO } from 'date-fns';
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useGrocy } from '../lib/grocy';
import { useHa } from '../lib/ha';
import { useStore } from '../lib/store';
import type { TodoItem } from '../lib/types';
import { dateShort, t } from '../lib/i18n';

/**
 * Some apps (e.g. Mealie's device sync) write raw JSON into HA to-do lists.
 * Show those as a short readable label instead of a wall of text.
 */
export function readableItem(summary: string): { text: string; raw: boolean } {
  const i = summary.indexOf('{');
  if (i < 0 || !summary.trim().endsWith('}')) return { text: summary, raw: false };
  const prefix = summary.slice(0, i).replace(/[:\s]+$/, '').trim();
  let label = '';
  try {
    const obj = JSON.parse(summary.slice(i));
    label = obj.name ?? obj.title ?? obj.summary ?? obj.label ?? '';
  } catch {
    /* not valid JSON; fall through */
  }
  const text = [prefix, label].filter(Boolean).join(' · ') || t('Data item');
  return { text, raw: true };
}

export function ListsView() {
  const { settings } = useStore().data;
  const { entities, error } = useHa();
  const { grocy, reload: reloadGrocy } = useGrocy();
  const todos = entities.filter((e) => e.entity_id.startsWith('todo.'));
  const shown = settings.lists.length ? todos.filter((t) => settings.lists.includes(t.entity_id)) : todos;

  return (
    <div className="lists">
      <div className="view-head">
        <h1>{t('Lists')}</h1>
      </div>
      {error && <div className="banner">Home Assistant: {error}</div>}
      {shown.length === 0 && !grocy.shopping && !error && (
        <div className="empty">
          {t('No lists found. Add Shopping List, Local To-do, AnyList, Todoist, or Grocy in Home Assistant, then pick lists in Settings.')}
        </div>
      )}
      <div className="list-grid">
        {grocy.shopping && <GrocyShopping items={grocy.shopping} reload={reloadGrocy} />}
        {shown.map((t) => (
          <TodoCard key={t.entity_id} entity={t.entity_id} name={t.name} />
        ))}
        {grocy.expiring && grocy.expiring.length > 0 && (
          <ListCard id="grocy-expiring" title={t('Expiring soon')} count={grocy.expiring.length} tag="Grocy">
            <div className="todo-items">
              {grocy.expiring.map((p) => (
                <div key={p.id} className="todo-item static">
                  <span className="expiry">{p.date ? dateShort(parseISO(p.date)) : '—'}</span>
                  <span className="item-text">
                    {p.name}
                    {p.amount > 1 && <span className="muted"> × {p.amount}</span>}
                  </span>
                </div>
              ))}
            </div>
          </ListCard>
        )}
      </div>
    </div>
  );
}

function ItemText({ summary }: { summary: string }) {
  const r = readableItem(summary);
  return (
    <span className="item-text" title={r.raw ? summary : undefined}>
      {r.text}
      {r.raw && <span className="raw-tag">{t('data')}</span>}
    </span>
  );
}

function TodoCard({ entity, name }: { entity: string; name: string }) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.todoItems(entity));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
    load();
  };

  const add = () => {
    const item = text.trim();
    if (!item) return;
    setText('');
    setItems((p) => [...p, { uid: 'tmp' + Date.now(), summary: item, status: 'needs_action' }]);
    run(() => api.service('todo', 'add_item', { entity_id: entity, item }));
  };

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const rename = (it: TodoItem) => {
    const v = draft.trim();
    setEditing(null);
    if (!v || v === it.summary) return;
    setItems((p) => p.map((x) => (x.uid === it.uid ? { ...x, summary: v } : x)));
    run(() => api.service('todo', 'update_item', { entity_id: entity, item: it.uid, rename: v }));
  };
  const remove = (it: TodoItem) => {
    setEditing(null);
    setItems((p) => p.filter((x) => x.uid !== it.uid));
    run(() => api.service('todo', 'remove_item', { entity_id: entity, item: it.uid }));
  };

  const toggle = (it: TodoItem) => {
    const status = it.status === 'completed' ? 'needs_action' : 'completed';
    setItems((p) => p.map((x) => (x.uid === it.uid ? { ...x, status } : x)));
    run(() => api.service('todo', 'update_item', { entity_id: entity, item: it.uid, status }));
  };

  const open = items.filter((i) => i.status !== 'completed');
  const done = items.filter((i) => i.status === 'completed');

  return (
    <ListCard id={entity} title={name} count={open.length} loading={loading}>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input placeholder={t('Add an item')} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn filled" type="submit" aria-label={t('Add')}>
          <Plus />
        </button>
      </form>
      {err && <p className="error small">{err}</p>}
      <div className="todo-items">
        {open.map((it) =>
          editing === it.uid ? (
            <form
              key={it.uid}
              className="todo-edit"
              onSubmit={(e) => {
                e.preventDefault();
                rename(it);
              }}
            >
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
              <button className="btn small primary" type="submit">
                {t('Save')}
              </button>
              <button className="icon-btn" type="button" onClick={() => remove(it)} aria-label={t('Delete')}>
                <Trash2 size={18} />
              </button>
              <button className="icon-btn" type="button" onClick={() => setEditing(null)} aria-label={t('Cancel')}>
                <X size={18} />
              </button>
            </form>
          ) : (
            <div key={it.uid} className="todo-row">
              <button className="todo-item" onClick={() => toggle(it)}>
                <span className="check" />
                <ItemText summary={it.summary} />
              </button>
              <button
                className="icon-btn item-edit"
                onClick={() => {
                  setEditing(it.uid);
                  setDraft(it.summary);
                }}
                aria-label={t('Edit')}
              >
                <Pencil size={16} />
              </button>
            </div>
          ),
        )}
        {open.length === 0 && !loading && <p className="muted center">{t('All clear')} ✨</p>}
      </div>
      {done.length > 0 && (
        <div className="todo-done">
          <button className="link" onClick={() => setShowDone((s) => !s)}>
            <ChevronDown size={16} style={{ rotate: showDone ? '180deg' : '0deg' }} /> {t('Completed')} ({done.length})
          </button>
          {showDone && (
            <>
              {done.map((it) => (
                <button key={it.uid} className="todo-item done" onClick={() => toggle(it)}>
                  <span className="check on">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <ItemText summary={it.summary} />
                </button>
              ))}
              <button className="btn ghost small" onClick={() => run(() => api.service('todo', 'remove_completed_items', { entity_id: entity }))}>
                {t('Clear completed')}
              </button>
            </>
          )}
        </div>
      )}
    </ListCard>
  );
}

function GrocyShopping({ items, reload }: { items: { id: number; name: string; amount: number; done: boolean }[]; reload: () => void }) {
  const [text, setText] = useState('');
  const [local, setLocal] = useState(items);
  useEffect(() => setLocal(items), [items]);
  const later = () => setTimeout(reload, 1500); // the Grocy sensor refreshes on its own schedule

  const add = async () => {
    const note = text.trim();
    if (!note) return;
    setText('');
    setLocal((p) => [...p, { id: -Date.now(), name: note, amount: 1, done: false }]);
    await api.service('grocy', 'add_generic', { entity_type: 'shopping_list', data: { note, amount: 1, shopping_list_id: 1 } }).catch(() => undefined);
    later();
  };
  const toggle = async (id: number, done: boolean) => {
    setLocal((p) => p.map((x) => (x.id === id ? { ...x, done: !done } : x)));
    await api.service('grocy', 'update_generic', { entity_type: 'shopping_list', object_id: id, data: { done: done ? 0 : 1 } }).catch(() => undefined);
    later();
  };
  const open = local.filter((i) => !i.done);
  const done = local.filter((i) => i.done);
  return (
    <ListCard id="grocy-shopping" title={t('Grocy shopping')} count={open.length}>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input placeholder={t('Add an item')} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn filled" type="submit" aria-label={t('Add')}>
          <Plus />
        </button>
      </form>
      <div className="todo-items">
        {[...open, ...done].map((it) => (
          <button key={it.id} className={`todo-item ${it.done ? 'done' : ''}`} onClick={() => toggle(it.id, it.done)}>
            <span className={`check ${it.done ? 'on' : ''}`}>{it.done && <Check size={16} strokeWidth={3} />}</span>
            <span className="item-text">
              {it.name}
              {it.amount > 1 && <span className="muted"> × {it.amount}</span>}
            </span>
          </button>
        ))}
        {local.length === 0 && <p className="muted center">{t('All clear')} ✨</p>}
      </div>
    </ListCard>
  );
}

/** A list card that folds to its header; folded state is remembered on this device. */
function ListCard({ id, title, count, tag, loading, children }: {
  id: string; title: string; count: number; tag?: string; loading?: boolean; children: ReactNode;
}) {
  const key = `hearth.list.${id}`;
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setClosed((c) => {
      try {
        localStorage.setItem(key, c ? '0' : '1');
      } catch {
        /* storage blocked */
      }
      return !c;
    });
  return (
    <section className={`card todo ${closed ? 'closed' : ''}`}>
      <button className="list-head" onClick={toggle} aria-expanded={!closed}>
        <h2>{title}</h2>
        {tag && <span className="muted small">{tag}</span>}
        <span className="list-count">{count}</span>
        {loading && <RefreshCw size={16} className="spin muted" />}
        <ChevronDown size={20} className="section-chevron" />
      </button>
      {!closed && children}
    </section>
  );
}
