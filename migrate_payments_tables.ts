import { db } from "./server/db";
import { sql } from "drizzle-orm";

// المدفوعات (Payments): bill requests, payment orders, clearances, fines, attachments, activity.
// Additive only: creates new tables/indexes, never alters existing ones.
// Run: npx tsx --env-file=.env migrate_payments_tables.ts

async function main() {
  console.log("Creating payments tables in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_bill_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      request_no TEXT NOT NULL,
      supplier_id VARCHAR REFERENCES suppliers(id) ON DELETE SET NULL,
      purchase_order_id VARCHAR REFERENCES purchase_orders(id) ON DELETE SET NULL,
      certificate_id VARCHAR REFERENCES progress_payment_certificates(id) ON DELETE SET NULL,
      payee_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'requested',
      notes TEXT,
      requested_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMP,
      received_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      received_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_bill_requests_seq_uq ON payment_bill_requests (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_bill_requests_project_idx ON payment_bill_requests (project_id);`);
  console.log("Table 'payment_bill_requests' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      order_no TEXT NOT NULL,
      bill_request_id VARCHAR REFERENCES payment_bill_requests(id) ON DELETE SET NULL,
      fine_id VARCHAR,
      clearance_id VARCHAR,
      purchase_order_id VARCHAR REFERENCES purchase_orders(id) ON DELETE SET NULL,
      certificate_id VARCHAR REFERENCES progress_payment_certificates(id) ON DELETE SET NULL,
      payee_name TEXT NOT NULL,
      purpose TEXT,
      reason TEXT,
      amount DECIMAL(14,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      reject_reason TEXT,
      payment_method TEXT,
      payment_reference TEXT,
      paid_date DATE,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMP,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      paid_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      paid_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  // For databases that already ran an earlier version of this script
  await db.execute(sql`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS purpose TEXT;`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_seq_uq ON payment_orders (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_orders_project_idx ON payment_orders (project_id);`);
  console.log("Table 'payment_orders' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_clearances (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      authority TEXT,
      reference_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      responsible_name TEXT,
      due_date DATE,
      issue_date DATE,
      expiry_date DATE,
      fee_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      fee_paid BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_clearances_project_idx ON payment_clearances (project_id);`);
  console.log("Table 'payment_clearances' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_fines (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      authority TEXT,
      reference_no TEXT,
      reason TEXT,
      liable_party TEXT NOT NULL DEFAULT 'contractor',
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      issue_date DATE,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'open',
      waiver_reason TEXT,
      waiver_requested_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      waiver_decided_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  // For databases that already ran an earlier version of this script
  await db.execute(sql`ALTER TABLE payment_fines ADD COLUMN IF NOT EXISTS waiver_reason TEXT;`);
  await db.execute(sql`ALTER TABLE payment_fines ADD COLUMN IF NOT EXISTS waiver_requested_by VARCHAR REFERENCES users(id) ON DELETE SET NULL;`);
  await db.execute(sql`ALTER TABLE payment_fines ADD COLUMN IF NOT EXISTS waiver_decided_by VARCHAR REFERENCES users(id) ON DELETE SET NULL;`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_fines_project_idx ON payment_fines (project_id);`);
  console.log("Table 'payment_fines' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_attachments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR NOT NULL,
      file_name TEXT NOT NULL,
      object_path TEXT NOT NULL,
      content_type TEXT,
      size INTEGER,
      uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_attachments_entity_idx ON payment_attachments (entity_type, entity_id);`);
  console.log("Table 'payment_attachments' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_activity (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_activity_entity_idx ON payment_activity (entity_type, entity_id);`);
  console.log("Table 'payment_activity' ready.");
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
