import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Kiosk mode is per device (stored in this browser only), so turning it on for the
// wall tablet doesn't lock your phone. Open the app with ?kiosk to enable it, ?kiosk=0 to disable.
const KEY = 'hearth.kiosk';

function initial(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('kiosk')) {
    const on = q.get('kiosk') !== '0';
    save(on);
    return on;
  }
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function save(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage blocked; kiosk lasts for this page load only */
  }
}

export function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}

/**
 * Keeps the screen awake while `on` (kiosk mode). Two layers, because iPads are unreliable here:
 *  1. the Screen Wake Lock API, taken again whenever it drops;
 *  2. a tiny muted looping video (1 KB, invisible), which iOS treats as "something is playing".
 * Both are retried when the page comes back and on the next tap, in case a gesture is needed.
 */
function useWakeLock(on: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ released: boolean; release: () => Promise<void> }> } }).wakeLock;
    if (!on) return;
    let lock: { released: boolean; release: () => Promise<void> } | null = null;
    let alive = true;
    const video = document.createElement('video');
    video.src = 'keepawake.mp4';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(video);
    const take = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      if (video.paused) video.play().catch(() => undefined);
      if (!wl || (lock && !lock.released)) return;
      try {
        lock = await wl.request('screen');
      } catch {
        /* not allowed right now; try again on the next tap or when the page is shown */
      }
    };
    take();
    document.addEventListener('visibilitychange', take);
    window.addEventListener('pointerdown', take);
    const id = setInterval(take, 20000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', take);
      window.removeEventListener('pointerdown', take);
      clearInterval(id);
      lock?.release().catch(() => undefined);
      video.pause();
      video.remove();
    };
  }, [on]);
}

interface KioskCtx {
  kiosk: boolean;
  setKiosk: (on: boolean) => void;
}
const Ctx = createContext<KioskCtx>({ kiosk: false, setKiosk: () => undefined });

export function KioskProvider({ children }: { children: ReactNode }) {
  const [kiosk, setState] = useState(initial);
  useWakeLock(kiosk);

  const setKiosk = useCallback((on: boolean) => {
    save(on);
    setState(on);
    // Drop ?kiosk from the address so a reload doesn't flip the choice back.
    const url = new URL(location.href);
    if (url.searchParams.has('kiosk')) {
      url.searchParams.delete('kiosk');
      history.replaceState(null, '', url);
    }
    if (on) enterFullscreen();
    else exitFullscreen();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('kiosk', kiosk);
    if (!kiosk) return;

    // Browsers only allow fullscreen from a tap, so re-enter it on the next touch.
    const onTap = () => enterFullscreen();
    // Keep the screen awake (needs https or localhost; Fully Kiosk etc. can do this too).
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        if (document.visibilityState === 'visible' && 'wakeLock' in navigator)
          lock = await (navigator as any).wakeLock.request('screen');
      } catch {
        /* not allowed here */
      }
    };
    // Hide the mouse cursor after a few seconds without movement.
    let cursorTimer = 0;
    const onMove = () => {
      document.documentElement.classList.remove('hide-cursor');
      clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => document.documentElement.classList.add('hide-cursor'), 4000);
    };
    const noMenu = (e: Event) => e.preventDefault();

    wake();
    onMove();
    window.addEventListener('pointerdown', onTap);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('contextmenu', noMenu);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('pointerdown', onTap);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('contextmenu', noMenu);
      document.removeEventListener('visibilitychange', wake);
      clearTimeout(cursorTimer);
      document.documentElement.classList.remove('hide-cursor');
      lock?.release().catch(() => undefined);
    };
  }, [kiosk]);

  return <Ctx.Provider value={{ kiosk, setKiosk }}>{children}</Ctx.Provider>;
}

export const useKiosk = () => useContext(Ctx);
