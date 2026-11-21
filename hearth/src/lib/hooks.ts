import { useEffect, useState } from 'react';

/** Current time, re-rendering every `ms` milliseconds. */
export function useNow(ms = 10000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** True once there has been no touch, click, or key press for `minutes`. 0 disables. */
export function useIdle(minutes: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!minutes) return;
    let last = Date.now();
    const poke = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - last > minutes * 60000) setIdle(true);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, poke));
      clearInterval(t);
    };
  }, [minutes]);
  return [idle, setIdle] as const;
}

/** A folded/unfolded flag remembered on this device (localStorage), e.g. for collapsible cards. */
export function useFolded(key: string, initial = false) {
  const k = `hearth.fold.${key}`;
  const [folded, setFolded] = useState(() => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const toggle = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(k, f ? '0' : '1');
      } catch {
        /* storage blocked */
      }
      return !f;
    });
  return [folded, toggle] as const;
}

const PHONE_QUERY = '(max-width: 760px)';
/** True on phone-sized screens; follows rotation and resizing. */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
