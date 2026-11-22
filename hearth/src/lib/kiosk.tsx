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

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Home-screen apps are already as full screen as the device allows. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Whether this browser can go fullscreen at all (iPhone Safari and home-screen apps can't). */
export function canFullscreen() {
  const d = document as FsDoc;
  return !isStandalone() && !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function enterFullscreen() {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  if (d.fullscreenElement || d.webkitFullscreenElement) return true;
  if (el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    return true;
  }
  if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
    return true;
  }
  return false;
}
function exitFullscreen() {
  const d = document as FsDoc;
  if (d.fullscreenElement) d.exitFullscreen().catch(() => undefined);
  else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
}

/**
 * Keeps the screen awake while `on` (kiosk mode). Two layers, because iPads are unreliable here:
 *  1. the Screen Wake Lock API (only over https, so it's missing at http://<ip>:8099);
 *  2. a tiny invisible video with a silent sound track. Safari keeps the screen on for a playing
 *     video only if it has sound, isn't muted and isn't set to loop, so we rewind it ourselves.
 *     Playing sound needs a real tap, so it starts on the first tap after kiosk mode turns on.
 */
type Lock = { released: boolean; release: () => Promise<void> };
function useWakeLock(on: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock;
    if (!on) return;
    // Don't pause music from other apps on the tablet (Safari 17+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    let lock: Lock | null = null;
    let alive = true;
    const video = document.createElement('video');
    video.src = 'keepawake.mp4';
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    const rewind = () => {
      if (video.duration && video.currentTime > video.duration - 1) video.currentTime = 0;
    };
    const again = () => {
      video.currentTime = 0;
      video.play().catch(() => undefined);
    };
    video.addEventListener('timeupdate', rewind);
    video.addEventListener('ended', again);
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
    // click/touchend count as a real tap on iPad; pointerdown doesn't.
    document.addEventListener('visibilitychange', take);
    window.addEventListener('click', take, true);
    window.addEventListener('touchend', take, true);
    const id = setInterval(take, 20000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', take);
      window.removeEventListener('click', take, true);
      window.removeEventListener('touchend', take, true);
      clearInterval(id);
      lock?.release().catch(() => undefined);
      video.pause();
      video.remove();
      if (session) session.type = 'auto';
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
    if (on && canFullscreen()) enterFullscreen();
    else exitFullscreen();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('kiosk', kiosk);
    if (!kiosk) return;

    // Browsers only allow fullscreen from a tap, so re-enter it on the next one.
    const onTap = () => {
      if (canFullscreen()) enterFullscreen();
    };
    // Hide the mouse cursor after a few seconds without movement.
    let cursorTimer = 0;
    const onMove = () => {
      document.documentElement.classList.remove('hide-cursor');
      clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => document.documentElement.classList.add('hide-cursor'), 4000);
    };
    const noMenu = (e: Event) => e.preventDefault();

    onMove();
    window.addEventListener('click', onTap);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener('click', onTap);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('contextmenu', noMenu);
      clearTimeout(cursorTimer);
      document.documentElement.classList.remove('hide-cursor');
    };
  }, [kiosk]);

  return <Ctx.Provider value={{ kiosk, setKiosk }}>{children}</Ctx.Provider>;
}

export const useKiosk = () => useContext(Ctx);
