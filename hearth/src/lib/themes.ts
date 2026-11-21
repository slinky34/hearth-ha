// Color palettes (matching Beacon's set). Each sets the CSS variables the app uses.
// A palette may have only a dark or only a light variant; otherwise Appearance picks.

type Vars = {
  bg: string; surface: string; surface2: string; text: string; muted: string; border: string;
  accent: string; accentText?: string; clock?: string;
};
export interface Palette {
  id: string;
  name: string;
  light?: Vars;
  dark?: Vars;
}

export const PALETTES: Palette[] = [
  { id: 'hearth', name: 'Hearth' }, // the stylesheet defaults
  {
    id: 'skylight',
    name: 'Skylight',
    light: { bg: '#f6f8fa', surface: '#ffffff', surface2: '#edf2f6', text: '#22313f', muted: '#6b7c8c', border: '#e2e9ef', accent: '#2f7fd8', clock: '#22313f' },
    dark: { bg: '#0f1822', surface: '#17222e', surface2: '#1f2c3a', text: '#e8eef4', muted: '#93a3b3', border: '#2a3846', accent: '#4c9be8' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: { bg: '#0b1020', surface: '#141a2e', surface2: '#1c2440', text: '#e6e9f5', muted: '#8e96b3', border: '#252e4d', accent: '#7c8cff' },
  },
  {
    id: 'midnight-light',
    name: 'Midnight Light',
    light: { bg: '#f4f6fb', surface: '#ffffff', surface2: '#e9edf7', text: '#1a2040', muted: '#6a7290', border: '#dde2ef', accent: '#4f5fe0' },
  },
  {
    id: 'nord',
    name: 'Nord',
    light: { bg: '#eceff4', surface: '#ffffff', surface2: '#e5e9f0', text: '#2e3440', muted: '#4c566a', border: '#d8dee9', accent: '#5e81ac', clock: '#2e3440' },
    dark: { bg: '#2e3440', surface: '#3b4252', surface2: '#434c5e', text: '#eceff4', muted: '#a3acbf', border: '#4c566a', accent: '#88c0d0', accentText: '#2e3440' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: { bg: '#282a36', surface: '#2f3241', surface2: '#383a4a', text: '#f8f8f2', muted: '#a0a4c0', border: '#44475a', accent: '#bd93f9', accentText: '#282a36' },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: { bg: '#272822', surface: '#2f302a', surface2: '#3a3b33', text: '#f8f8f2', muted: '#a59f85', border: '#49483e', accent: '#a6e22e', accentText: '#272822' },
  },
  {
    id: 'rose',
    name: 'Rose',
    light: { bg: '#fff7f8', surface: '#ffffff', surface2: '#fdecef', text: '#3b2a30', muted: '#8f7480', border: '#f4dde2', accent: '#e05a7a' },
    dark: { bg: '#1f1418', surface: '#2a1c22', surface2: '#36242c', text: '#f7e9ee', muted: '#b8939f', border: '#432e37', accent: '#f07c98' },
  },
  {
    id: 'forest',
    name: 'Forest',
    light: { bg: '#f5f7f2', surface: '#ffffff', surface2: '#e9efe4', text: '#22301f', muted: '#6b7a63', border: '#dde5d6', accent: '#4f8a3f' },
    dark: { bg: '#141a13', surface: '#1c241b', surface2: '#253023', text: '#e6eee2', muted: '#9aab92', border: '#2f3b2c', accent: '#7cb860' },
  },
];

const KEYS: [keyof Vars, string][] = [
  ['bg', '--bg'], ['surface', '--surface'], ['surface2', '--surface-2'], ['text', '--text'], ['muted', '--muted'],
  ['border', '--border'], ['accent', '--accent'],
];

/** Applies a palette; returns whether the result is dark. */
export function applyPalette(id: string, wantDark: boolean): boolean {
  const p = PALETTES.find((x) => x.id === id) ?? PALETTES[0];
  const dark = p.dark && p.light ? wantDark : p.dark ? true : p.light ? false : wantDark;
  const v = dark ? p.dark : p.light;
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.palette = p.id;
  const all = ['--bg', '--surface', '--surface-2', '--text', '--muted', '--border', '--accent', '--accent-text', '--today', '--clock'];
  all.forEach((k) => root.style.removeProperty(k));
  if (v) {
    KEYS.forEach(([k, css]) => root.style.setProperty(css, v[k] as string));
    root.style.setProperty('--accent-text', v.accentText ?? '#ffffff');
    root.style.setProperty('--today', v.accent);
    root.style.setProperty('--clock', v.clock ?? (dark ? v.text : v.accent));
  }
  const bg = v?.bg ?? (dark ? '#121521' : '#FBF8F4');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
  return dark;
}

export function swatch(p: Palette, wantDark: boolean) {
  const v = (wantDark ? p.dark ?? p.light : p.light ?? p.dark) ?? (wantDark
    ? { bg: '#121521', surface: '#1a1f2e', accent: '#f59e0b', text: '#eef0f5' }
    : { bg: '#fbf8f4', surface: '#ffffff', accent: '#f59e0b', text: '#2b2a33' });
  return v as { bg: string; surface: string; accent: string; text: string };
}
