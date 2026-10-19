import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating procurement tables in PostgreSQL...");

  // 1. rfqs
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rfqs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      rfq_number TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Table 'rfqs' verified/created.");

  // 2. rfq_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rfq_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      rfq_id VARCHAR NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL,
      item_description TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs',
      notes TEXT,
      sort_order INTEGER DEFAULT 0
    );
  `);
  console.log("Table 'rfq_items' verified/created.");

  // 3. rfq_suppliers
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rfq_suppliers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      rfq_id VARCHAR NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      supplier_id VARCHAR NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'invited',
      invited_at TIMESTAMP DEFAULT NOW(),
      submitted_at TIMESTAMP,
      notes TEXT
    );
  `);
  console.log("Table 'rfq_suppliers' verified/created.");

  // 4. quotations
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quotations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      rfq_id VARCHAR NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      supplier_id VARCHAR NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      quotation_number TEXT,
      submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      valid_until DATE,
      subtotal NUMERIC(12, 2) DEFAULT 0,
      tax_amount NUMERIC(12, 2) DEFAULT 0,
      discount_amount NUMERIC(12, 2) DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'SAR',
      payment_terms TEXT,
      delivery_terms TEXT,
      lead_time_days INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      document_id VARCHAR REFERENCES documents(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Table 'quotations' verified/created.");

  // 5. quotation_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quotation_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      quotation_id VARCHAR NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      rfq_item_id VARCHAR REFERENCES rfq_items(id) ON DELETE CASCADE,
      material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL,
      item_description TEXT,
      quantity NUMERIC(12, 2) NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      total_price NUMERIC(12, 2) NOT NULL,
      notes TEXT
    );
  `);
  console.log("Table 'quotation_items' verified/created.");

  // 6. purchase_orders
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      po_number TEXT NOT NULL,
      rfq_id VARCHAR REFERENCES rfqs(id) ON DELETE SET NULL,
      quotation_id VARCHAR REFERENCES quotations(id) ON DELETE SET NULL,
      supplier_id VARCHAR NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_date DATE NOT NULL DEFAULT CURRENT_DATE,
      expected_delivery_date DATE,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal NUMERIC(12, 2) DEFAULT 0,
      tax_amount NUMERIC(12, 2) DEFAULT 0,
      discount_amount NUMERIC(12, 2) DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      terms_and_conditions TEXT,
      delivery_address TEXT,
      payment_terms TEXT,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Table 'purchase_orders' verified/created.");

  // 7. po_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS po_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      po_id VARCHAR NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL,
      rfq_item_id VARCHAR REFERENCES rfq_items(id) ON DELETE SET NULL,
      item_description TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs',
      unit_price NUMERIC(12, 2) NOT NULL,
      total_price NUMERIC(12, 2) NOT NULL,
      received_quantity NUMERIC(12, 2) DEFAULT 0,
      notes TEXT
    );
  `);
  // Add missing columns if tables already existed
  await db.execute(sql`
    ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL;
    
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS submission_date DATE DEFAULT CURRENT_DATE;
    ALTER TABLE quotations ALTER COLUMN submission_date DROP NOT NULL;
    ALTER TABLE quotations ALTER COLUMN submission_date SET DEFAULT CURRENT_DATE;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'SAR';
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms TEXT;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_terms TEXT;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS document_id VARCHAR REFERENCES documents(id) ON DELETE SET NULL;

    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
    ALTER TABLE purchase_orders ALTER COLUMN order_date DROP NOT NULL;
    ALTER TABLE purchase_orders ALTER COLUMN order_date SET DEFAULT CURRENT_DATE;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

    ALTER TABLE rfq_items ADD COLUMN IF NOT EXISTS material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL;
    ALTER TABLE rfq_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
    ALTER TABLE rfq_items ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE rfq_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';

    ALTER TABLE rfq_suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE rfq_suppliers ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE rfq_suppliers ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
    ALTER TABLE rfq_suppliers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'invited';

    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
    ALTER TABLE quotation_items ALTER COLUMN unit DROP NOT NULL;
    ALTER TABLE quotation_items ALTER COLUMN unit SET DEFAULT 'pcs';
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS rfq_item_id VARCHAR REFERENCES rfq_items(id) ON DELETE CASCADE;

    ALTER TABLE po_items ADD COLUMN IF NOT EXISTS material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL;
    ALTER TABLE po_items ADD COLUMN IF NOT EXISTS rfq_item_id VARCHAR REFERENCES rfq_items(id) ON DELETE SET NULL;
    ALTER TABLE po_items ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(12, 2) DEFAULT 0;
    ALTER TABLE po_items ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE po_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';
  `);
  console.log("All columns verified and updated.");

  console.log("All procurement tables created successfully!");
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
