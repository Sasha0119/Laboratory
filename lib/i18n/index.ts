/**
 * Translation setup.
 *
 * Deliberately does NOT use a language detector: the language is chosen by
 * hand on the Settings screen and nowhere else, so the app never guesses from
 * the device locale. `LanguageProvider` restores the saved choice at startup.
 *
 * To add a language: drop a new file in /locales, import it below, and add an
 * entry to SUPPORTED_LANGUAGES. Nothing else needs to change — screens read
 * keys, never literals.
 *
 * To add a string: add the key to locales/en.json first (it is the source of
 * truth and the fallback), then to each translation.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../../locales/en.json';
import ru from '../../locales/ru.json';
import tr from '../../locales/tr.json';
import uz from '../../locales/uz.json';
import zh from '../../locales/zh.json';

export interface SupportedLanguage {
  code: string;
  /** The language's own name for itself — what the picker shows. */
  endonym: string;
  /** English name, shown underneath so the list is navigable when lost. */
  english: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', endonym: 'English', english: 'English' },
  { code: 'uz', endonym: "O'zbekcha", english: 'Uzbek' },
  { code: 'ru', endonym: 'Русский', english: 'Russian' },
  { code: 'zh', endonym: '中文', english: 'Chinese' },
  { code: 'tr', endonym: 'Türkçe', english: 'Turkish' },
];

export const DEFAULT_LANGUAGE = 'en';

export function isSupportedLanguage(code: string | null | undefined): boolean {
  return !!code && SUPPORTED_LANGUAGES.some((l) => l.code === code);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uz: { translation: uz },
    ru: { translation: ru },
    zh: { translation: zh },
    tr: { translation: tr },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  // React already escapes everything it renders.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
