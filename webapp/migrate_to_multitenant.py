"""
Migration script to convert single-tenant database to multi-tenant.
This script creates a default account and assigns all existing data to it.
Run this after updating the models but before using the application.
"""

import sys
import os
from datetime import datetime

# Add the webapp directory to the path
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine
from models import Base, Account, User, InventoryItem, Sale, Purchase, Expense, Debtor, Creditor, Invoice, InvoiceItem, Quotation, QuotationItem, ActivityLog


def migrate_to_multitenant():
    """Migrate existing single-tenant data to a default account."""
    db = SessionLocal()
    
    try:
        print("Starting multi-tenant migration...")
        
        # Create tables if they don't exist
        Base.metadata.create_all(bind=engine)
        print("[OK] Tables created/verified")
        
        # Check if migration has already been run
        existing_accounts = db.query(Account).count()
        if existing_accounts > 0:
            print(f"[WARN] Migration already run ({existing_accounts} accounts exist). Skipping.")
            return
        
        # Create a default account for existing data
        default_account = Account(
            business_structure="company",
            name="Legacy Business",
            tin="",
            owner_full_name="System Administrator",
            business_type="retail",
            region="",
            district="",
            street_address="",
            phone="",
            email="",
            logo_url="",
            tax_rate=0,
            invoice_prefix="INV",
            payment_terms_days=7,
            is_active=True,
            is_suspended=False,
        )
        db.add(default_account)
        db.commit()
        db.refresh(default_account)
        print(f"[OK] Created default account: {default_account.name} (ID: {default_account.id})")
        
        # Migrate users
        users_updated = db.query(User).filter(User.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {users_updated} users to default account")
        
        # Migrate inventory items
        inventory_updated = db.query(InventoryItem).filter(InventoryItem.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {inventory_updated} inventory items to default account")
        
        # Migrate sales
        sales_updated = db.query(Sale).filter(Sale.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {sales_updated} sales to default account")
        
        # Migrate purchases
        purchases_updated = db.query(Purchase).filter(Purchase.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {purchases_updated} purchases to default account")
        
        # Migrate expenses
        expenses_updated = db.query(Expense).filter(Expense.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {expenses_updated} expenses to default account")
        
        # Migrate debtors
        debtors_updated = db.query(Debtor).filter(Debtor.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {debtors_updated} debtors to default account")
        
        # Migrate creditors
        creditors_updated = db.query(Creditor).filter(Creditor.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {creditors_updated} creditors to default account")
        
        # Migrate invoices
        invoices_updated = db.query(Invoice).filter(Invoice.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {invoices_updated} invoices to default account")
        
        # Migrate invoice items
        invoice_items_updated = db.query(InvoiceItem).filter(InvoiceItem.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {invoice_items_updated} invoice items to default account")
        
        # Migrate quotations
        quotations_updated = db.query(Quotation).filter(Quotation.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {quotations_updated} quotations to default account")
        
        # Migrate quotation items
        quotation_items_updated = db.query(QuotationItem).filter(QuotationItem.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {quotation_items_updated} quotation items to default account")
        
        # Migrate activity logs
        activity_updated = db.query(ActivityLog).filter(ActivityLog.account_id.is_(None)).update({"account_id": default_account.id})
        db.commit()
        print(f"[OK] Migrated {activity_updated} activity logs to default account")
        
        print("\n[SUCCESS] Migration completed successfully!")
        print(f"Default Account ID: {default_account.id}")
        print(f"Default Account Name: {default_account.name}")
        print("\nYou can now update this account's details through the API or directly in the database.")
        
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_to_multitenant()