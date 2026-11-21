// Small Web Audio chimes, so alarms work offline with no sound files.
// Browsers only allow audio after a tap, so we unlock the context on the first touch.
let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
}

if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', () => audio(), { once: true, passive: true });

function tone(freq: number, start: number, dur: number, gain = 0.25) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

/** Three rising notes: timer finished. */
export function alarmChime() {
  tone(784, 0, 0.35);
  tone(988, 0.18, 0.35);
  tone(1319, 0.36, 0.6);
}

/** Two soft notes: reminder. */
export function softChime() {
  tone(659, 0, 0.4, 0.15);
  tone(880, 0.2, 0.6, 0.15);
}
