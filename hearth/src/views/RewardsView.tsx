import { Check, Gift, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toast';
import { useHa } from '../lib/ha';
import { t } from '../lib/i18n';
import { useKiosk } from '../lib/kiosk';
import { Avatar } from '../lib/presence';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Member, Redemption, Reward } from '../lib/types';
import { uid } from '../lib/util';
import { pointsFor } from './ChoresView';

/** Stars a person can spend: earned minus rewards claimed (approved or waiting). */
export function useBalances() {
  const { chores, completions, redemptions } = useStore().data;
  return (m: Member) => {
    const spent = redemptions.filter((r) => r.memberId === m.id && r.status !== 'denied').reduce((s, r) => s + r.cost, 0);
    return pointsFor(m, chores, completions) - spent;
  };
}

function PinCheck({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState<string | false>(false);
  const go = async () => {
    const r = await api.checkPin(pin).catch((e: Error) => ({ ok: false, error: e.message }));
    if (r.ok) onOk();
    else {
      setBad('error' in r ? r.error : t('Wrong PIN.'));
      setPin('');
    }
  };
  return (
    <Modal
      title={t('Parent PIN')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" onClick={go}>{t('OK')}</button>
        </>
      }
    >
      <div className="form">
        <input autoFocus className="big pin-input" type="password" inputMode="numeric" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setBad(false); }}
          onKeyDown={(e) => e.key === 'Enter' && go()} />
        {bad && <p className="error">{bad}</p>}
      </div>
    </Modal>
  );
}

export function RewardsView() {
  const { data, set } = useStore();
  const { selected } = useHa();
  const { kiosk } = useKiosk();
  const { members, rewards, redemptions, settings } = data;
  const balance = useBalances();
  const [claim, setClaim] = useState<Reward | null>(null);
  const [editing, setEditing] = useState(false);
  const [pinFor, setPinFor] = useState<(() => void) | null>(null);
  const shown = members.filter((m) => selected.length === 0 || selected.includes(m.id));
  const pending = redemptions.filter((r) => r.status === 'pending');
  const recent = redemptions.filter((r) => r.status === 'approved').slice(-6).reverse();

  const guarded = (fn: () => void) => (settings.rewardPin && settings.hasKioskPin ? setPinFor(() => fn) : fn());
  const decide = (r: Redemption, status: 'approved' | 'denied') =>
    guarded(() => {
      set('redemptions', (prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
      toast(status === 'approved' ? t('Approved: {title}', { title: r.title }) : t('Denied: {title}', { title: r.title }), 'info');
    });

  const redeem = (m: Member, r: Reward) => {
    set('redemptions', (prev) => [...prev, { id: uid(), memberId: m.id, rewardId: r.id, title: r.title, cost: r.cost, at: Date.now(), status: 'pending' }]);
    setClaim(null);
    toast(t('Asked a grown-up for “{title}”', { title: r.title }), 'info');
  };

  return (
    <div className="rewards">
      <div className="view-head">
        <h1>{t('Rewards')}</h1>
        {!kiosk && (
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={18} /> {t('Edit rewards')}
          </button>
        )}
      </div>

      <div className="rewards-scroll">
        <div className="balances">
          {shown.map((m) => (
            <div key={m.id} className="balance" style={{ ['--member' as string]: m.color }}>
              <Avatar m={m} size="lg" />
              <div>
                <b>{m.name}</b>
                <span className="balance-stars">
                  <Star size={18} fill="currentColor" /> {balance(m)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {pending.length > 0 && (
          <section className="card requests">
            <h3 className="today-label">{t('Waiting for a grown-up')}</h3>
            {pending.map((r) => {
              const m = members.find((x) => x.id === r.memberId);
              return (
                <div key={r.id} className="list-row">
                  {m && <Avatar m={m} size="sm" />}
                  <span className="grow">
                    <b>{m?.name}</b> · {r.title} <span className="muted">({r.cost}⭐)</span>
                  </span>
                  <button className="btn small ghost" onClick={() => decide(r, 'denied')}>
                    <X size={16} /> {t('Deny')}
                  </button>
                  <button className="btn small primary" onClick={() => decide(r, 'approved')}>
                    <Check size={16} /> {t('Approve')}
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {rewards.length === 0 ? (
          <div className="empty">{t('No rewards yet. Tap Edit rewards to add some, like “Pick the movie” for 20 stars.')}</div>
        ) : (
          <div className="reward-grid">
            {rewards.map((r) => (
              <button key={r.id} className="reward-card" onClick={() => setClaim(r)}>
                <span className="reward-emoji">{r.emoji || '🎁'}</span>
                <b>{r.title}</b>
                <span className="reward-cost">
                  <Star size={15} fill="currentColor" /> {r.cost}
                </span>
              </button>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <section>
            <h3 className="today-label">{t('Recently earned')}</h3>
            <div className="chips">
              {recent.map((r) => (
                <span key={r.id} className="chip">
                  {members.find((x) => x.id === r.memberId)?.name}: {r.title}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {claim && (
        <Modal title={`${claim.emoji || '🎁'} ${claim.title}`} onClose={() => setClaim(null)}>
          <p className="muted">{t('Who wants it? It costs {n} stars.', { n: claim.cost })}</p>
          <div className="claim-people">
            {shown.map((m) => {
              const b = balance(m);
              return (
                <button key={m.id} className="claim-person" disabled={b < claim.cost} onClick={() => redeem(m, claim)}>
                  <Avatar m={m} size="lg" />
                  <b>{m.name}</b>
                  <span className="muted small">
                    {b >= claim.cost ? `${b}⭐` : t('Needs {n} more', { n: claim.cost - b })}
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {editing && <RewardEditor onClose={() => setEditing(false)} />}
      {pinFor && (
        <PinCheck
          onClose={() => setPinFor(null)}
          onOk={() => {
            pinFor();
            setPinFor(null);
          }}
        />
      )}
    </div>
  );
}

function RewardEditor({ onClose }: { onClose: () => void }) {
  const { data, set } = useStore();
  const blank = (): Reward => ({ id: '', title: '', emoji: '', cost: 10 });
  const [form, setForm] = useState<Reward>(blank);
  const save = () => {
    if (!form.title.trim()) return;
    const r = { ...form, title: form.title.trim(), id: form.id || uid() };
    set('rewards', (prev) => (form.id ? prev.map((x) => (x.id === form.id ? r : x)) : [...prev, r]));
    setForm(blank());
  };
  return (
    <Modal title={t('Edit rewards')} onClose={onClose} wide>
      <div className="chore-editor">
        <div className="form card-inset">
          <h3>{form.id ? t('Edit reward') : t('Add a reward')}</h3>
          <div className="row">
            <input className="emoji-input" placeholder="🎁" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            <input placeholder={t('Reward name')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <label className="row">
            {t('Costs')}
            <input type="number" min={1} max={999} value={form.cost} onChange={(e) => setForm({ ...form, cost: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 100 }} />
            ⭐
          </label>
          <div className="row">
            <button className="btn primary" onClick={save}>
              <Plus size={18} /> {form.id ? t('Save') : t('Add reward')}
            </button>
            {form.id && (
              <button className="btn ghost" onClick={() => setForm(blank())}>
                {t('Cancel')}
              </button>
            )}
          </div>
          <p className="muted small">{t('Ideas: pick dinner, 30 min screen time, stay up late, choose the movie, a trip for ice cream.')}</p>
        </div>
        <div className="chore-existing">
          {data.rewards.map((r) => (
            <div key={r.id} className="list-row">
              <span>{r.emoji || '🎁'}</span>
              <span className="grow">{r.title}</span>
              <span className="muted small">{r.cost}⭐</span>
              <button className="icon-btn" onClick={() => setForm(r)} aria-label={t('Edit')}>
                <Pencil size={18} />
              </button>
              <button className="icon-btn" onClick={() => set('rewards', (p) => p.filter((x) => x.id !== r.id))} aria-label={t('Delete')}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {data.rewards.length === 0 && (
            <p className="muted">
              <Gift size={16} /> {t('No rewards yet.')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
