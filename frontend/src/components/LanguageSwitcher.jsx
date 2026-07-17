import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGE_LIST } from '../i18n/config';

/**
 * Dropdown for picking a display language. Works anywhere i18n is initialized
 * (it is, globally, via main.jsx). Selecting a language updates i18next,
 * which re-renders every component using useTranslation(), and persists the
 * choice to localStorage so it's remembered on the next visit.
 *
 * Usage: <LanguageSwitcher /> — drop it in a nav bar, footer, or settings page.
 */
export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();

  return (
    <select
      className={`language-switcher ${className}`}
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label="Choose language"
    >
      {SUPPORTED_LANGUAGE_LIST.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
