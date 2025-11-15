import type { LanguageCode } from '../../types.ts';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  de: 'Deutsch',
  ru: 'Русский',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  pl: 'Polski',
  zh: '中文',
  ja: '日本語',
  ar: 'العربية',
  hi: 'हिन्दी',
  ma: 'मराठी',
};

export const getLanguageLabel = (code: LanguageCode): string => LANGUAGE_LABELS[code] ?? code.toUpperCase();
