import { Check, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useHa } from '../lib/ha';
import { useStore } from '../lib/store';
import type { TodoItem } from '../lib/types';

export function ListsView() {
  const { settings } = useStore().data;
  const { entities, error } = useHa();
  const todos = entities.filter((e) => e.entity_id.startsWith('todo.'));
  const shown = settings.lists.length ? todos.filter((t) => settings.lists.includes(t.entity_id)) : todos;

  return (
    <div className="lists">
      <div className="view-head">
        <h1>Lists</h1>
      </div>
      {error && <div className="banner">Home Assistant: {error}</div>}
      {shown.length === 0 && !error && (
        <div className="empty">
          No to-do lists found. Add a Shopping List or Local To-do integration in Home Assistant, then pick lists in Settings.
        </div>
      )}
      <div className="list-grid">
        {shown.map((t) => (
          <TodoCard key={t.entity_id} entity={t.entity_id} name={t.name} />
        ))}
      </div>
    </div>
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

  const toggle = (it: TodoItem) => {
    const status = it.status === 'completed' ? 'needs_action' : 'completed';
    setItems((p) => p.map((x) => (x.uid === it.uid ? { ...x, status } : x)));
    run(() => api.service('todo', 'update_item', { entity_id: entity, item: it.uid, status }));
  };

  const open = items.filter((i) => i.status !== 'completed');
  const done = items.filter((i) => i.status === 'completed');

  return (
    <section className="card todo">
      <header>
        <h2>{name}</h2>
        <span className="muted">{open.length}</span>
        {loading && <RefreshCw size={16} className="spin muted" />}
      </header>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input placeholder="Add an item" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn filled" type="submit" aria-label="Add">
          <Plus />
        </button>
      </form>
      {err && <p className="error small">{err}</p>}
      <div className="todo-items">
        {open.map((it) => (
          <button key={it.uid} className="todo-item" onClick={() => toggle(it)}>
            <span className="check" />
            {it.summary}
          </button>
        ))}
        {open.length === 0 && !loading && <p className="muted center">All clear ✨</p>}
      </div>
      {done.length > 0 && (
        <div className="todo-done">
          <button className="link" onClick={() => setShowDone((s) => !s)}>
            <ChevronDown size={16} style={{ rotate: showDone ? '180deg' : '0deg' }} /> Completed ({done.length})
          </button>
          {showDone && (
            <>
              {done.map((it) => (
                <button key={it.uid} className="todo-item done" onClick={() => toggle(it)}>
                  <span className="check on">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  {it.summary}
                </button>
              ))}
              <button className="btn ghost small" onClick={() => run(() => api.service('todo', 'remove_completed_items', { entity_id: entity }))}>
                Clear completed
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
