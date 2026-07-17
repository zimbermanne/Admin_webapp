from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Country, Language, RevenueAuthority, User
from auth import get_current_user

router = APIRouter(prefix="/api/reference", tags=["reference"])


def _country_out(c: Country) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "iso_code": c.iso_code,
        "region": c.region.value if c.region else None,
        "languages": [
            {"id": l.id, "name": l.name, "iso_639_code": l.iso_639_code, "status": l.status.value}
            for l in c.languages
        ],
        "revenue_authority": (
            {
                "name": c.revenue_authority.name,
                "acronym": c.revenue_authority.acronym,
                "website_url": c.revenue_authority.website_url,
                "default_vat_rate": c.revenue_authority.default_vat_rate,
                "effective_year": c.revenue_authority.effective_year,
                "source_url": c.revenue_authority.source_url,
            }
            if c.revenue_authority else None
        ),
    }


@router.get("/countries")
def list_countries(region: Optional[str] = None, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """All African countries with their languages and revenue authority,
    for the account-setup wizard's country picker."""
    query = db.query(Country).options(
        joinedload(Country.languages), joinedload(Country.revenue_authority)
    )
    if region:
        query = query.filter(Country.region == region)
    countries = query.order_by(Country.name).all()
    return [_country_out(c) for c in countries]


@router.get("/countries/{country_id}")
def get_country(country_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    country = (
        db.query(Country)
        .options(joinedload(Country.languages), joinedload(Country.revenue_authority))
        .filter(Country.id == country_id)
        .first()
    )
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    return _country_out(country)


@router.get("/countries/{country_id}/default-tax-rate")
def get_default_tax_rate(country_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """Used by account setup / settings to pre-fill Account.tax_rate and
    show which revenue authority the rate comes from."""
    authority = db.query(RevenueAuthority).filter(RevenueAuthority.country_id == country_id).first()
    if not authority:
        raise HTTPException(status_code=404, detail="No revenue authority on file for this country")
    return {
        "authority_name": authority.name,
        "acronym": authority.acronym,
        "default_vat_rate": authority.default_vat_rate,
        "effective_year": authority.effective_year,
        "source_url": authority.source_url,
    }


@router.get("/languages", response_model=None)
def list_languages(country_id: Optional[int] = None, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    query = db.query(Language)
    if country_id:
        query = query.filter(Language.country_id == country_id)
    languages = query.order_by(Language.name).all()
    return [
        {"id": l.id, "name": l.name, "iso_639_code": l.iso_639_code,
         "country_id": l.country_id, "status": l.status.value}
        for l in languages
    ]


@router.get("/revenue-authorities", response_model=None)
def list_revenue_authorities(db: Session = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    authorities = db.query(RevenueAuthority).options(joinedload(RevenueAuthority.country)).all()
    return [
        {
            "country": a.country.name if a.country else None,
            "country_id": a.country_id,
            "name": a.name,
            "acronym": a.acronym,
            "website_url": a.website_url,
            "default_vat_rate": a.default_vat_rate,
            "effective_year": a.effective_year,
            "source_url": a.source_url,
        }
        for a in authorities
    ]
