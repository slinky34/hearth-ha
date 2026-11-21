import { CalendarPlus, ListPlus, StickyNote, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useHa } from '../lib/ha';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import type { MealType } from '../lib/types';
import { dateKey } from '../lib/util';
import { AddEvent } from '../views/CalendarView';
import { MagicImport } from './MagicImport';
import { Modal } from './Modal';
import { NoteForm } from './NotesBoard';
import { toast } from './Toast';

type Kind = 'menu' | 'event' | 'magic' | 'item' | 'meal' | 'note';

/** One "+" for everything: event, Magic Import, list item, meal, or note. */
export function QuickAdd({ onClose, onChanged, date }: { onClose: () => void; onChanged: () => void; date: Date }) {
  const [kind, setKind] = useState<Kind>('menu');
  const { calendars } = useHa();
  const { settings } = useStore().data;
  const done = () => {
    onChanged();
    onClose();
  };

  if (kind === 'event') return <AddEvent defaultDate={date} onClose={onClose} onCreated={done} />;
  if (kind === 'magic') return <MagicImport onClose={onClose} onDone={done} />;
  if (kind === 'note') return <NoteForm onClose={onClose} canSpeak={!!(settings.tts.engine && settings.tts.speaker)} />;
  if (kind === 'item') return <ItemForm onClose={onClose} />;
  if (kind === 'meal') return <MealForm onClose={onClose} />;

  const options: [Kind, string, ReactNode, boolean][] = [
    ['event', t('Event'), <CalendarPlus key="e" />, calendars.length > 0],
    ['magic', t('Magic Import'), <Sparkles key="m" />, calendars.length > 0],
    ['item', t('List item'), <ListPlus key="i" />, true],
    ['meal', t('Meal'), <UtensilsCrossed key="f" />, true],
    ['note', t('Note'), <StickyNote key="n" />, true],
  ];
  return (
    <Modal title={t('Add')} onClose={onClose}>
      <div className="quick-grid">
        {options.map(([k, label, icon, ok]) => (
          <button key={k} className="quick-opt" disabled={!ok} onClick={() => setKind(k)}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ItemForm({ onClose }: { onClose: () => void }) {
  const { entities } = useHa();
  const { settings } = useStore().data;
  const todos = entities.filter((e) => e.entity_id.startsWith('todo.') && (!settings.lists.length || settings.lists.includes(e.entity_id)));
  const [list, setList] = useState(() => {
    try {
      return localStorage.getItem('hearth.quick.list') || todos[0]?.entity_id || '';
    } catch {
      return todos[0]?.entity_id || '';
    }
  });
  const [text, setText] = useState('');
  const save = async () => {
    if (!text.trim() || !list) return;
    try {
      await api.service('todo', 'add_item', { entity_id: list, item: text.trim() });
      try {
        localStorage.setItem('hearth.quick.list', list);
      } catch {
        /* ignore */
      }
      toast(t('Added to {list}', { list: todos.find((x) => x.entity_id === list)?.name ?? list }), 'info');
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Modal title={t('List item')} onClose={onClose} footer={<button className="btn primary" onClick={save}>{t('Add')}</button>}>
      <div className="form">
        <input autoFocus className="big" placeholder={t('Add an item')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <div className="chips">
          {todos.map((l) => (
            <button key={l.entity_id} className={`chip ${list === l.entity_id ? 'on' : ''}`} onClick={() => setList(l.entity_id)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function MealForm({ onClose }: { onClose: () => void }) {
  const { set } = useStore();
  const [date, setDate] = useState(dateKey(new Date()));
  const [meal, setMeal] = useState<MealType>('dinner');
  const [text, setText] = useState('');
  const save = () => {
    if (!text.trim()) return;
    set('meals', (prev) => ({ ...prev, [date]: { ...prev[date], [meal]: text.trim() } }));
    toast(t('Meal saved'), 'info');
    onClose();
  };
  return (
    <Modal title={t('Meal')} onClose={onClose} footer={<button className="btn primary" onClick={save}>{t('Save')}</button>}>
      <div className="form">
        <input autoFocus className="big" placeholder={t('Tacos')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
          <div className="chips">
            {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
              <button key={m} className={`chip ${meal === m ? 'on' : ''}`} onClick={() => setMeal(m)}>
                {t(m.charAt(0).toUpperCase() + m.slice(1))}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
