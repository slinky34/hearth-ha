// Tiny i18n: English text is the key; DICT holds the other languages in LANG_ORDER.
import { format as dfFormat, type Locale } from 'date-fns';
import { de, enUS, es, fr, it, ja, ko, nl, pt } from 'date-fns/locale';
import { DICT, LANG_ORDER } from './i18n-dict';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pt', name: 'Português' },
];
const LOCALES: Record<string, Locale> = { en: enUS, de, es, fr, it, ja, ko, nl, pt };

let lang = 'en';
let locale: Locale = enUS;

export function resolveLanguage(setting: string) {
  const want = setting === 'auto' ? (navigator.language || 'en').slice(0, 2).toLowerCase() : setting;
  return LOCALES[want] ? want : 'en';
}

export function setLanguage(setting: string) {
  lang = resolveLanguage(setting);
  locale = LOCALES[lang];
  document.documentElement.lang = lang;
  return lang;
}

export const currentLanguage = () => lang;

/** Translate; {name} placeholders are filled from vars. */
export function t(key: string, vars?: Record<string, string | number>) {
  let s = key;
  if (lang !== 'en') s = DICT[key]?.[LANG_ORDER.indexOf(lang)] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

/** date-fns format in the current language (weekday/month names). */
export const format = (d: Date | number, pattern: string) => dfFormat(d, pattern, { locale });

const intl = (opts: Intl.DateTimeFormatOptions) => (d: Date) => new Intl.DateTimeFormat(lang, opts).format(d);
/** "Friday, November 20" in the right word order for each language. */
export const dateLong = (d: Date) => intl({ weekday: 'long', month: 'long', day: 'numeric' })(d);
/** "Nov 20" */
export const dateShort = (d: Date) => intl({ month: 'short', day: 'numeric' })(d);
/** "Fri, Nov 20" */
export const dateMedium = (d: Date) => intl({ weekday: 'short', month: 'short', day: 'numeric' })(d);
/** "November 2026" */
export const monthYear = (d: Date) => intl({ month: 'long', year: 'numeric' })(d);
/** One-letter-ish weekday names starting Sunday. */
export const weekdayNarrow = () =>
  Array.from({ length: 7 }, (_, i) => intl({ weekday: 'narrow' })(new Date(2024, 0, 7 + i)));
