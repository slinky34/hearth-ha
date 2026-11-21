import { Megaphone, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { Avatar } from '../lib/presence';
import { useStore } from '../lib/store';
import { dateKey, uid } from '../lib/util';
import { Modal } from './Modal';
import { toast } from './Toast';

const NOTE_COLORS = ['#FFF3B0', '#FFD6E0', '#CDEBFF', '#D6F5D6', '#EADCFF'];

/** Speak a message on the chosen speaker (Settings → Notes). */
export async function announce(message: string, tts: { engine: string; speaker: string }) {
  if (!tts.engine || !tts.speaker) return;
  try {
    await api.service('tts', 'speak', { entity_id: tts.engine, media_player_entity_id: tts.speaker, message });
  } catch (e) {
    toast(t('Couldn’t announce: {error}', { error: (e as Error).message }));
  }
}

/** Family message board + birthday banner, shown on Today. */
export function NotesBoard() {
  const { data, set } = useStore();
  const { notes, members, settings } = data;
  const [adding, setAdding] = useState(false);
  const todayMD = dateKey(new Date()).slice(5);
  const birthdays = members.filter((m) => m.birthday?.slice(-5) === todayMD);

  return (
    <div className="notes-board">
      {birthdays.map((m) => (
        <div key={m.id} className="birthday-banner" style={{ ['--member' as string]: m.color }}>
          <span className="bday-emoji">🎂</span>
          <Avatar m={m} />
          <b>{t('Happy birthday, {name}!', { name: m.name })}</b>
          <span className="bday-emoji">🎉</span>
        </div>
      ))}
      {notes.map((n) => {
        const from = members.find((m) => m.id === n.from);
        return (
          <div key={n.id} className="sticky" style={{ background: n.color }}>
            <button className="sticky-x" onClick={() => set('notes', (p) => p.filter((x) => x.id !== n.id))} aria-label={t('Delete')}>
              <X size={14} />
            </button>
            <p>{n.text}</p>
            {from && <span className="sticky-from">— {from.name}</span>}
          </div>
        );
      })}
      <button className="sticky add" onClick={() => setAdding(true)}>
        <Plus size={18} /> {t('Note')}
      </button>
      {adding && <NoteForm onClose={() => setAdding(false)} canSpeak={!!(settings.tts.engine && settings.tts.speaker)} />}
    </div>
  );
}

export function NoteForm({ onClose, canSpeak }: { onClose: () => void; canSpeak: boolean }) {
  const { data, set } = useStore();
  const [text, setText] = useState('');
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [speak, setSpeak] = useState(false);
  const save = () => {
    const v = text.trim();
    if (!v) return;
    set('notes', (p) => [...p, { id: uid(), text: v, color, from, at: Date.now() }]);
    if (speak) {
      const who = data.members.find((m) => m.id === from)?.name;
      announce(who ? `${who} says: ${v}` : v, data.settings.tts);
    }
    onClose();
  };
  return (
    <Modal
      title={t('New note')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" onClick={save}>{t('Post')}</button>
        </>
      }
    >
      <div className="form">
        <textarea autoFocus rows={3} placeholder={t('Dinner at 6! Don’t forget soccer cleats…')} value={text} onChange={(e) => setText(e.target.value)} style={{ background: color }} />
        <div className="swatches">
          {NOTE_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        {data.members.length > 0 && (
          <label>
            {t('From')}
            <div className="chips">
              {data.members.map((m) => (
                <button key={m.id} className={`chip person ${from === m.id ? 'on' : ''}`} style={from === m.id ? { background: m.color, borderColor: m.color } : {}}
                  onClick={() => setFrom(from === m.id ? undefined : m.id)}>
                  <Avatar m={m} size="xs" /> {m.name}
                </button>
              ))}
            </div>
          </label>
        )}
        {canSpeak && (
          <label className="row">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
            <Megaphone size={16} /> {t('Also read it aloud')}
          </label>
        )}
      </div>
    </Modal>
  );
}
