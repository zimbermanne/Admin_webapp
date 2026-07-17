"""
Seed data for Pan-African Reference App tables.

Populates Country, RevenueAuthority, and Language tables with the seed data
from Section 5 of the project notes (July 2026).

Run this after creating the new tables via migration.
"""

from sqlalchemy.orm import Session
from models import Country, RevenueAuthority, Language, AfricanRegion, LanguageStatus
from african_currencies import AFRICAN_COUNTRY_CURRENCIES


def seed_countries(db: Session):
    """Seed countries table from african_currencies.py data."""
    print("Seeding countries...")
    
    for country_data in AFRICAN_COUNTRY_CURRENCIES:
        name, iso_code, currency_code, currency_name, region = country_data
        
        # Map region string to enum
        region_map = {
            "North Africa": AfricanRegion.north,
            "West Africa": AfricanRegion.west,
            "Central Africa": AfricanRegion.central,
            "East Africa": AfricanRegion.east,
            "Southern Africa": AfricanRegion.southern,
        }
        
        existing = db.query(Country).filter(Country.name == name).first()
        if not existing:
            country = Country(
                name=name,
                iso_code=iso_code,
                region=region_map.get(region, AfricanRegion.east)
            )
            db.add(country)
            print(f"  Added: {name}")
    
    db.commit()
    print("Countries seeded successfully.")


def seed_revenue_authorities(db: Session):
    """Seed revenue authorities table from Section 5 data."""
    print("Seeding revenue authorities...")
    
    revenue_authorities_data = [
        ("Algeria", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Angola", "Administração Geral Tributária (AGT)", "AGT"),
        ("Benin", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Botswana", "Botswana Unified Revenue Service (BURS)", "BURS"),
        ("Burkina Faso", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Burundi", "Office Burundais des Recettes (OBR)", "OBR"),
        ("Cabo Verde", "Direção Nacional de Receitas do Estado (DNRE)", "DNRE"),
        ("Cameroon", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Central African Republic", "Direction Générale des Impôts et des Domaines (DGID)", "DGID"),
        ("Chad", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Comoros", "Direction Générale des Impôts", None),
        ("Congo (Republic of)", "Direction Générale des Impôts et des Domaines (DGID)", "DGID"),
        ("Congo (DRC)", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Côte d'Ivoire", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Djibouti", "Direction Générale des Impôts", None),
        ("Egypt", "Egyptian Tax Authority (ETA)", "ETA"),
        ("Equatorial Guinea", "Dirección General de Impuestos", None),
        ("Eritrea", "Inland Revenue Department", None),
        ("Eswatini", "Eswatini Revenue Service (ERS)", "ERS"),
        ("Ethiopia", "Ministry of Revenues (MOR)", "MOR"),
        ("Gabon", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Gambia", "Gambia Revenue Authority (GRA)", "GRA"),
        ("Ghana", "Ghana Revenue Authority (GRA)", "GRA"),
        ("Guinea", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Guinea-Bissau", "Direção Geral das Contribuições e Impostos (DGCI)", "DGCI"),
        ("Kenya", "Kenya Revenue Authority (KRA)", "KRA"),
        ("Lesotho", "Lesotho Revenue Authority (LRA)", "LRA"),
        ("Liberia", "Liberia Revenue Authority (LRA)", "LRA"),
        ("Libya", "Tax Department (Libyan Tax Authority)", None),
        ("Madagascar", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Malawi", "Malawi Revenue Authority (MRA)", "MRA"),
        ("Mali", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Mauritania", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Mauritius", "Mauritius Revenue Authority (MRA)", "MRA"),
        ("Morocco", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Mozambique", "Autoridade Tributária de Moçambique (AT)", "AT"),
        ("Namibia", "Namibia Revenue Agency (NamRA)", "NamRA"),
        ("Niger", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Nigeria", "Federal Inland Revenue Service (FIRS)", "FIRS"),
        ("Rwanda", "Rwanda Revenue Authority (RRA)", "RRA"),
        ("São Tomé and Príncipe", "Direção Geral das Contribuições e Impostos", None),
        ("Senegal", "Direction Générale des Impôts et des Domaines (DGID)", "DGID"),
        ("Seychelles", "Seychelles Revenue Commission (SRC)", "SRC"),
        ("Sierra Leone", "National Revenue Authority (NRA)", "NRA"),
        ("Somalia", "Somali Revenue Authority", None),
        ("South Africa", "South African Revenue Service (SARS)", "SARS"),
        ("South Sudan", "South Sudan National Revenue Authority (NRA)", "NRA"),
        ("Sudan", "Sudan Taxation Chamber", None),
        ("Tanzania", "Tanzania Revenue Authority (TRA)", "TRA"),
        ("Togo", "Office Togolais des Recettes (OTR)", "OTR"),
        ("Tunisia", "Direction Générale des Impôts (DGI)", "DGI"),
        ("Uganda", "Uganda Revenue Authority (URA)", "URA"),
        ("Zambia", "Zambia Revenue Authority (ZRA)", "ZRA"),
        ("Zimbabwe", "Zimbabwe Revenue Authority (ZIMRA)", "ZIMRA"),
    ]
    
    for country_name, authority_name, acronym in revenue_authorities_data:
        country = db.query(Country).filter(Country.name == country_name).first()
        if country:
            existing = db.query(RevenueAuthority).filter(
                RevenueAuthority.country_id == country.id
            ).first()
            if not existing:
                authority = RevenueAuthority(
                    country_id=country.id,
                    name=authority_name,
                    acronym=acronym,
                    effective_year=2026
                )
                db.add(authority)
                print(f"  Added: {country_name} - {authority_name}")
    
    db.commit()
    print("Revenue authorities seeded successfully.")


def seed_languages(db: Session):
    """Seed languages table with official languages from Section 5."""
    print("Seeding languages...")
    
    languages_data = [
        # (country_name, language_name, iso_639_code, status)
        ("Algeria", "Arabic", "ara", LanguageStatus.official),
        ("Algeria", "Tamazight", "tmz", LanguageStatus.official),
        ("Angola", "Portuguese", "por", LanguageStatus.official),
        ("Benin", "French", "fra", LanguageStatus.official),
        ("Botswana", "English", "eng", LanguageStatus.official),
        ("Botswana", "Setswana", "tsn", LanguageStatus.official),
        ("Burkina Faso", "French", "fra", LanguageStatus.official),
        ("Burundi", "Kirundi", "run", LanguageStatus.official),
        ("Burundi", "French", "fra", LanguageStatus.official),
        ("Burundi", "English", "eng", LanguageStatus.official),
        ("Cabo Verde", "Portuguese", "por", LanguageStatus.official),
        ("Cameroon", "French", "fra", LanguageStatus.official),
        ("Cameroon", "English", "eng", LanguageStatus.official),
        ("Central African Republic", "French", "fra", LanguageStatus.official),
        ("Central African Republic", "Sango", "sag", LanguageStatus.official),
        ("Chad", "French", "fra", LanguageStatus.official),
        ("Chad", "Arabic", "ara", LanguageStatus.official),
        ("Comoros", "Comorian", "com", LanguageStatus.official),
        ("Comoros", "Arabic", "ara", LanguageStatus.official),
        ("Comoros", "French", "fra", LanguageStatus.official),
        ("Congo (Republic of)", "French", "fra", LanguageStatus.official),
        ("Congo (DRC)", "French", "fra", LanguageStatus.official),
        ("Côte d'Ivoire", "French", "fra", LanguageStatus.official),
        ("Djibouti", "French", "fra", LanguageStatus.official),
        ("Djibouti", "Arabic", "ara", LanguageStatus.official),
        ("Egypt", "Arabic", "ara", LanguageStatus.official),
        ("Equatorial Guinea", "Spanish", "spa", LanguageStatus.official),
        ("Equatorial Guinea", "French", "fra", LanguageStatus.official),
        ("Equatorial Guinea", "Portuguese", "por", LanguageStatus.official),
        ("Eritrea", "Tigrinya", "tir", LanguageStatus.official),
        ("Eritrea", "Arabic", "ara", LanguageStatus.official),
        ("Eritrea", "English", "eng", LanguageStatus.official),
        ("Eswatini", "Swati", "ssw", LanguageStatus.official),
        ("Eswatini", "English", "eng", LanguageStatus.official),
        ("Ethiopia", "Amharic", "amh", LanguageStatus.official),
        ("Gabon", "French", "fra", LanguageStatus.official),
        ("Gambia", "English", "eng", LanguageStatus.official),
        ("Ghana", "English", "eng", LanguageStatus.official),
        ("Guinea", "French", "fra", LanguageStatus.official),
        ("Guinea-Bissau", "Portuguese", "por", LanguageStatus.official),
        ("Kenya", "Swahili", "swa", LanguageStatus.official),
        ("Kenya", "English", "eng", LanguageStatus.official),
        ("Lesotho", "Sesotho", "sot", LanguageStatus.official),
        ("Lesotho", "English", "eng", LanguageStatus.official),
        ("Liberia", "English", "eng", LanguageStatus.official),
        ("Libya", "Arabic", "ara", LanguageStatus.official),
        ("Madagascar", "Malagasy", "mlg", LanguageStatus.official),
        ("Madagascar", "French", "fra", LanguageStatus.official),
        ("Malawi", "English", "eng", LanguageStatus.official),
        ("Malawi", "Chichewa", "nya", LanguageStatus.official),
        ("Mali", "French", "fra", LanguageStatus.official),
        ("Mali", "Bambara", "bam", LanguageStatus.official),
        ("Mauritania", "Arabic", "ara", LanguageStatus.official),
        ("Mauritius", "English", "eng", LanguageStatus.official),
        ("Mauritius", "French", "fra", LanguageStatus.official),
        ("Morocco", "Arabic", "ara", LanguageStatus.official),
        ("Morocco", "Tamazight", "tmz", LanguageStatus.official),
        ("Mozambique", "Portuguese", "por", LanguageStatus.official),
        ("Namibia", "English", "eng", LanguageStatus.official),
        ("Niger", "French", "fra", LanguageStatus.official),
        ("Nigeria", "English", "eng", LanguageStatus.official),
        ("Rwanda", "Kinyarwanda", "kin", LanguageStatus.official),
        ("Rwanda", "English", "eng", LanguageStatus.official),
        ("Rwanda", "French", "fra", LanguageStatus.official),
        ("Rwanda", "Swahili", "swa", LanguageStatus.official),
        ("São Tomé and Príncipe", "Portuguese", "por", LanguageStatus.official),
        ("Senegal", "French", "fra", LanguageStatus.official),
        ("Seychelles", "Seychellois Creole", "crs", LanguageStatus.official),
        ("Seychelles", "English", "eng", LanguageStatus.official),
        ("Seychelles", "French", "fra", LanguageStatus.official),
        ("Sierra Leone", "English", "eng", LanguageStatus.official),
        ("Somalia", "Somali", "som", LanguageStatus.official),
        ("Somalia", "Arabic", "ara", LanguageStatus.official),
        ("South Africa", "Afrikaans", "afr", LanguageStatus.official),
        ("South Africa", "English", "eng", LanguageStatus.official),
        ("South Africa", "isiNdebele", "nbl", LanguageStatus.official),
        ("South Africa", "isiXhosa", "xho", LanguageStatus.official),
        ("South Africa", "isiZulu", "zul", LanguageStatus.official),
        ("South Africa", "Sepedi", "nso", LanguageStatus.official),
        ("South Africa", "Sesotho", "sot", LanguageStatus.official),
        ("South Africa", "Setswana", "tsn", LanguageStatus.official),
        ("South Africa", "siSwati", "ssw", LanguageStatus.official),
        ("South Africa", "Tshivenda", "ven", LanguageStatus.official),
        ("South Africa", "Xitsonga", "tso", LanguageStatus.official),
        ("South Sudan", "English", "eng", LanguageStatus.official),
        ("Sudan", "Arabic", "ara", LanguageStatus.official),
        ("Sudan", "English", "eng", LanguageStatus.official),
        ("Tanzania", "Swahili", "swa", LanguageStatus.official),
        ("Tanzania", "English", "eng", LanguageStatus.official),
        ("Togo", "French", "fra", LanguageStatus.official),
        ("Tunisia", "Arabic", "ara", LanguageStatus.official),
        ("Uganda", "English", "eng", LanguageStatus.official),
        ("Uganda", "Swahili", "swa", LanguageStatus.official),
        ("Zambia", "English", "eng", LanguageStatus.official),
        ("Zimbabwe", "English", "eng", LanguageStatus.official),
        ("Zimbabwe", "Shona", "sna", LanguageStatus.official),
        ("Zimbabwe", "Ndebele", "nde", LanguageStatus.official),
    ]
    
    for country_name, language_name, iso_code, status in languages_data:
        country = db.query(Country).filter(Country.name == country_name).first()
        if country:
            existing = db.query(Language).filter(
                Language.country_id == country.id,
                Language.name == language_name
            ).first()
            if not existing:
                language = Language(
                    name=language_name,
                    iso_639_code=iso_code,
                    country_id=country.id,
                    status=status
                )
                db.add(language)
                print(f"  Added: {country_name} - {language_name}")
    
    db.commit()
    print("Languages seeded successfully.")


def seed_all_pan_african_data(db: Session):
    """Run all seed functions."""
    print("=" * 60)
    print("Seeding Pan-African Reference Data")
    print("=" * 60)
    
    seed_countries(db)
    seed_revenue_authorities(db)
    seed_languages(db)
    
    print("=" * 60)
    print("Pan-African data seeding completed!")
    print("=" * 60)


if __name__ == "__main__":
    from database import SessionLocal, engine, Base
    
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        seed_all_pan_african_data(db)
    finally:
        db.close()
