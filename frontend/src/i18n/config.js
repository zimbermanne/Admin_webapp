import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import en from './locales/en.json';
import sw from './locales/sw.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

const resources = {
  en: { translation: en },
  sw: { translation: sw },
  fr: { translation: fr },
  pt: { translation: pt },
  ar: { translation: ar },
};

const SUPPORTED_LANGUAGES = Object.keys(resources);
const STORAGE_KEY = 'moneytracer_lang';

// Languages that read right-to-left. Arabic is the only one in scope today,
// but keeping this as a set makes adding another RTL locale a one-line change.
const RTL_LANGUAGES = new Set(['ar']);

function applyDirection(lng) {
  const dir = RTL_LANGUAGES.has(lng) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
}

// Figures out which language to start in, in priority order:
// 1. A language the user explicitly picked before (saved in localStorage)
// 2. The device/browser's own language setting, if we support it
// 3. English, as the final fallback
function detectInitialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
  } catch {
    // localStorage unavailable (e.g. private browsing) — fall through to detection
  }

  const deviceLanguages = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const raw of deviceLanguages) {
    if (!raw) continue;
    const code = raw.toLowerCase().split('-')[0]; // "fr-FR" -> "fr"
    if (SUPPORTED_LANGUAGES.includes(code)) {
      return code;
    }
  }

  return 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

// Whenever the language changes (via the switcher or programmatically),
// remember the choice and fix up text direction for RTL languages.
i18n.on('languageChanged', (lng) => {
  applyDirection(lng);
  try {
    window.localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore — persistence is a nice-to-have, not a hard requirement
  }
});

// Set dir/lang correctly for whatever language we started in.
applyDirection(i18n.language);

export const SUPPORTED_LANGUAGE_LIST = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'ar', label: 'العربية' },
];

export default i18n;
