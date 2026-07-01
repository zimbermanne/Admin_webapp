-- Multi-tenant migration script for PostgreSQL
-- This script adds the new accounts table and account_id columns to existing tables

-- Add superadmin to the roleenum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'superadmin' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'roleenum')
    ) THEN
        ALTER TYPE roleenum ADD VALUE 'superadmin';
    END IF;
END $$;

-- Create the accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    business_structure VARCHAR(20) DEFAULT 'solo',
    name VARCHAR(150) NOT NULL,
    tin VARCHAR(50),
    owner_full_name VARCHAR(150) NOT NULL,
    business_type VARCHAR(80) DEFAULT 'retail',
    region VARCHAR(80) DEFAULT '',
    district VARCHAR(80) DEFAULT '',
    street_address VARCHAR(255) DEFAULT '',
    phone VARCHAR(40) DEFAULT '',
    email VARCHAR(120) DEFAULT '',
    logo_url VARCHAR(255) DEFAULT '',
    tax_rate FLOAT DEFAULT 0,
    invoice_prefix VARCHAR(20) DEFAULT 'INV',
    payment_terms_days INTEGER DEFAULT 7,
    is_active BOOLEAN DEFAULT TRUE,
    is_suspended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add account_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to inventory_items table
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to purchases table
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to debtors table
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to creditors table
ALTER TABLE creditors ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to invoice_items table
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to quotations table
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to quotation_items table
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Add account_id column to activity_logs table
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id);

-- Create indexes for account_id columns
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_account_id ON inventory_items(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_account_id ON sales(account_id);
CREATE INDEX IF NOT EXISTS idx_purchases_account_id ON purchases(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_debtors_account_id ON debtors(account_id);
CREATE INDEX IF NOT EXISTS idx_creditors_account_id ON creditors(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account_id ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_account_id ON invoice_items(account_id);
CREATE INDEX IF NOT EXISTS idx_quotations_account_id ON quotations(account_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_account_id ON quotation_items(account_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_account_id ON activity_logs(account_id);

-- Create default account for existing data
INSERT INTO accounts (business_structure, name, tin, owner_full_name, business_type, region, district, street_address, phone, email, logo_url, tax_rate, invoice_prefix, payment_terms_days, is_active, is_suspended)
SELECT 'company', 'Legacy Business', '', 'System Administrator', 'retail', '', '', '', '', '', '', 0, 'INV', 7, TRUE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Legacy Business');

-- Migrate existing data to default account
UPDATE users SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE inventory_items SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE sales SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE purchases SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE expenses SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE debtors SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE creditors SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE invoices SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE invoice_items SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE quotations SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE quotation_items SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;
UPDATE activity_logs SET account_id = (SELECT id FROM accounts WHERE name = 'Legacy Business') WHERE account_id IS NULL;