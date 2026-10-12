import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import it from '../locales/it/licserver.json';
import en from '../locales/en/licserver.json';

export const SUPPORTED_LANGUAGES = ['it', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const LANGUAGE_STORAGE_KEY = 'pramaia_licserver_language';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function detectInitialLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isSupportedLanguage(stored)) return stored;
  } catch {
    // localStorage non disponibile (es. storage bloccato): si procede col fallback
  }
  const browserLang = (navigator.language || 'it').slice(0, 2).toLowerCase();
  return isSupportedLanguage(browserLang) ? browserLang : 'it';
}

export function persistLanguage(language: SupportedLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignorato: la lingua resta applicata per la sessione corrente
  }
}

i18n.use(initReactI18next).init({
  resources: {
    it: { licserver: it },
    en: { licserver: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'it',
  defaultNS: 'licserver',
  ns: ['licserver'],
  interpolation: {
    escapeValue: false, // React già previene l'XSS nel rendering; serve per i tag <strong> nelle chiavi
  },
  react: {
    // Nessun fetch di traduzioni da remoto (bundle statico): non serve attendere la modalità Suspense
    useSuspense: false,
  },
});

export default i18n;
