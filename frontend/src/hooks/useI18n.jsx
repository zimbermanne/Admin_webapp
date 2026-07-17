import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

/**
 * Custom hook for internationalization with RTL support
 * Handles language switching and automatically applies RTL direction for Arabic
 */
export const useI18n = () => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const currentLanguage = i18n.language;

  // Check if current language is RTL
  const isRTL = currentLanguage === 'ar';

  // Apply RTL direction to document when language changes
  useEffect(() => {
    const dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', currentLanguage);
  }, [isRTL, currentLanguage]);

  return {
    t,
    changeLanguage,
    currentLanguage,
    isRTL,
    availableLanguages: [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
    ],
  };
};
