"""
African countries and their official currencies.

Used to populate the country/currency picker in the account-setup wizard
and to drive per-account currency formatting on invoices, quotations and
reports.

Updated to match Pan-African Reference App seed data (July 2026).
"""

# (country_name, ISO 3166-1 alpha-2, currency_code, currency_name, region)
AFRICAN_COUNTRY_CURRENCIES = [
    ("Algeria", "DZ", "DZD", "Algerian Dinar", "North Africa"),
    ("Angola", "AO", "AOA", "Angolan Kwanza", "Southern Africa"),
    ("Benin", "BJ", "XOF", "West African CFA Franc", "West Africa"),
    ("Botswana", "BW", "BWP", "Botswana Pula", "Southern Africa"),
    ("Burkina Faso", "BF", "XOF", "West African CFA Franc", "West Africa"),
    ("Burundi", "BI", "BIF", "Burundian Franc", "East Africa"),
    ("Cabo Verde", "CV", "CVE", "Cape Verdean Escudo", "West Africa"),
    ("Cameroon", "CM", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Central African Republic", "CF", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Chad", "TD", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Comoros", "KM", "KMF", "Comorian Franc", "East Africa"),
    ("Congo (Republic of)", "CG", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Congo (DRC)", "CD", "CDF", "Congolese Franc", "Central Africa"),
    ("Côte d'Ivoire", "CI", "XOF", "West African CFA Franc", "West Africa"),
    ("Djibouti", "DJ", "DJF", "Djiboutian Franc", "East Africa"),
    ("Egypt", "EG", "EGP", "Egyptian Pound", "North Africa"),
    ("Equatorial Guinea", "GQ", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Eritrea", "ER", "ERN", "Eritrean Nakfa", "East Africa"),
    ("Eswatini", "SZ", "SZL", "Swazi Lilangeni", "Southern Africa"),
    ("Ethiopia", "ET", "ETB", "Ethiopian Birr", "East Africa"),
    ("Gabon", "GA", "XAF", "Central African CFA Franc", "Central Africa"),
    ("Gambia", "GM", "GMD", "Gambian Dalasi", "West Africa"),
    ("Ghana", "GH", "GHS", "Ghanaian Cedi", "West Africa"),
    ("Guinea", "GN", "GNF", "Guinean Franc", "West Africa"),
    ("Guinea-Bissau", "GW", "XOF", "West African CFA Franc", "West Africa"),
    ("Kenya", "KE", "KES", "Kenyan Shilling", "East Africa"),
    ("Lesotho", "LS", "LSL", "Lesotho Loti", "Southern Africa"),
    ("Liberia", "LR", "LRD", "Liberian Dollar", "West Africa"),
    ("Libya", "LY", "LYD", "Libyan Dinar", "North Africa"),
    ("Madagascar", "MG", "MGA", "Malagasy Ariary", "East Africa"),
    ("Malawi", "MW", "MWK", "Malawian Kwacha", "Southern Africa"),
    ("Mali", "ML", "XOF", "West African CFA Franc", "West Africa"),
    ("Mauritania", "MR", "MRU", "Mauritanian Ouguiya", "West Africa"),
    ("Mauritius", "MU", "MUR", "Mauritian Rupee", "East Africa"),
    ("Morocco", "MA", "MAD", "Moroccan Dirham", "North Africa"),
    ("Mozambique", "MZ", "MZN", "Mozambican Metical", "Southern Africa"),
    ("Namibia", "NA", "NAD", "Namibian Dollar", "Southern Africa"),
    ("Niger", "NE", "XOF", "West African CFA Franc", "West Africa"),
    ("Nigeria", "NG", "NGN", "Nigerian Naira", "West Africa"),
    ("Rwanda", "RW", "RWF", "Rwandan Franc", "East Africa"),
    ("São Tomé and Príncipe", "ST", "STN", "São Tomé and Príncipe Dobra", "Central Africa"),
    ("Senegal", "SN", "XOF", "West African CFA Franc", "West Africa"),
    ("Seychelles", "SC", "SCR", "Seychellois Rupee", "East Africa"),
    ("Sierra Leone", "SL", "SLE", "Sierra Leonean Leone", "West Africa"),
    ("Somalia", "SO", "SOS", "Somali Shilling", "East Africa"),
    ("South Africa", "ZA", "ZAR", "South African Rand", "Southern Africa"),
    ("South Sudan", "SS", "SSP", "South Sudanese Pound", "East Africa"),
    ("Sudan", "SD", "SDG", "Sudanese Pound", "North Africa"),
    ("Tanzania", "TZ", "TZS", "Tanzanian Shilling", "East Africa"),
    ("Togo", "TG", "XOF", "West African CFA Franc", "West Africa"),
    ("Tunisia", "TN", "TND", "Tunisian Dinar", "North Africa"),
    ("Uganda", "UG", "UGX", "Ugandan Shilling", "East Africa"),
    ("Zambia", "ZM", "ZMW", "Zambian Kwacha", "Southern Africa"),
    ("Zimbabwe", "ZW", "ZiG", "Zimbabwe Gold (ZiG) / USD (multi-currency)", "Southern Africa"),
]

# Convenience lookups
COUNTRY_TO_CURRENCY = {c[0]: c[2] for c in AFRICAN_COUNTRY_CURRENCIES}
VALID_COUNTRIES = {c[0] for c in AFRICAN_COUNTRY_CURRENCIES}
VALID_CURRENCY_CODES = {c[2] for c in AFRICAN_COUNTRY_CURRENCIES}


def default_currency_for_country(country: str) -> str:
    return COUNTRY_TO_CURRENCY.get(country, "TZS")
