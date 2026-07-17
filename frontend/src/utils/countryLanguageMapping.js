/**
 * Maps African countries to their suggested default languages
 * Based on official languages from Section 5 seed data
 */

export const COUNTRY_LANGUAGE_MAPPING = {
  // North Africa
  "Algeria": "ar",
  "Egypt": "ar",
  "Libya": "ar",
  "Morocco": "ar",
  "Tunisia": "ar",
  
  // West Africa (French-speaking majority)
  "Benin": "fr",
  "Burkina Faso": "fr",
  "Côte d'Ivoire": "fr",
  "Guinea": "fr",
  "Mali": "fr",
  "Mauritania": "ar",
  "Niger": "fr",
  "Senegal": "fr",
  "Togo": "fr",
  
  // West Africa (English-speaking)
  "Gambia": "en",
  "Ghana": "en",
  "Liberia": "en",
  "Nigeria": "en",
  "Sierra Leone": "en",
  
  // West Africa (Portuguese-speaking)
  "Cabo Verde": "pt",
  "Guinea-Bissau": "pt",
  
  // Central Africa (French-speaking)
  "Cameroon": "fr",
  "Central African Republic": "fr",
  "Chad": "ar",
  "Congo (Republic of)": "fr",
  "Congo (DRC)": "fr",
  "Equatorial Guinea": "es",
  "Gabon": "fr",
  "São Tomé and Príncipe": "pt",
  
  // East Africa (Swahili/English)
  "Burundi": "fr",
  "Comoros": "ar",
  "Djibouti": "ar",
  "Eritrea": "en",
  "Ethiopia": "en",
  "Kenya": "sw",
  "Madagascar": "fr",
  "Mauritius": "en",
  "Rwanda": "en",
  "Seychelles": "en",
  "Somalia": "ar",
  "South Sudan": "en",
  "Tanzania": "sw",
  "Uganda": "en",
  
  // Southern Africa (English-speaking)
  "Botswana": "en",
  "Eswatini": "en",
  "Lesotho": "en",
  "Malawi": "en",
  "Mozambique": "pt",
  "Namibia": "en",
  "South Africa": "en",
  "Zambia": "en",
  "Zimbabwe": "en",
};

/**
 * Get suggested language for a given country
 * @param {string} countryName - Name of the country
 * @returns {string} Language code (en, sw, fr, ar)
 */
export const getSuggestedLanguage = (countryName) => {
  return COUNTRY_LANGUAGE_MAPPING[countryName] || "en";
};

/**
 * Get all available languages with their native names
 */
export const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];
