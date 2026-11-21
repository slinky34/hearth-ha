import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useStore } from './store';
import type { Member } from './types';
import { initials } from './util';

/** person.* entity -> state ('home', 'not_home', or a zone name). */
const Ctx = createContext<Record<string, string>>({});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const people = useStore()
    .data.members.map((m) => m.person)
    .filter(Boolean) as string[];
  const key = people.join(',');
  const [states, setStates] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return setStates({});
    const load = () =>
      api
        .states({ ids: key.split(',') })
        .then((l) => setStates(Object.fromEntries(l.map((s) => [s.entity_id, s.state]))))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [key]);
  return <Ctx.Provider value={states}>{children}</Ctx.Provider>;
}

export const usePresence = () => useContext(Ctx);

/** Inside of an avatar (photo or initials, plus home dot) for custom wrappers like buttons. */
export function AvatarFace({ m }: { m: Member }) {
  const presence = usePresence();
  const where = m.person ? presence[m.person] : undefined;
  return (
    <>
      {m.photo ? <img src={m.photo} alt="" /> : initials(m.name)}
      {where && <i className={`presence ${where === 'home' ? 'home' : 'away'}`} />}
    </>
  );
}

/** A person's avatar: their photo (or initials), with a dot when we know if they're home. */
export function Avatar({ m, size = 'md', className = '', title }: { m: Member; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string; title?: string }) {
  const presence = usePresence();
  const where = m.person ? presence[m.person] : undefined;
  const home = where === 'home';
  const cls = size === 'xs' ? 'badge' : `avatar ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''}`;
  return (
    <span
      className={`${cls} ${m.photo ? 'has-photo' : ''} ${className}`}
      style={{ background: m.color }}
      title={title ?? (where ? `${m.name} · ${home ? 'home' : where.replace(/_/g, ' ')}` : m.name)}
    >
      {m.photo ? <img src={m.photo} alt="" /> : size === 'xs' ? initials(m.name).slice(0, 1) : initials(m.name)}
      {where && size !== 'xs' && <i className={`presence ${home ? 'home' : 'away'}`} />}
    </span>
  );
}
