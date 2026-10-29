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
  // For databases that already ran an earlier version of this script
  await db.execute(sql`ALTER TABLE payment_bill_requests ADD COLUMN IF NOT EXISTS payment_order_id VARCHAR;`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_bill_requests_seq_uq ON payment_bill_requests (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_bill_requests_project_idx ON payment_bill_requests (project_id);`);
  console.log("Table 'payment_bill_requests' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_invoices (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      bill_request_id VARCHAR NOT NULL REFERENCES payment_bill_requests(id) ON DELETE CASCADE,
      invoice_no TEXT NOT NULL,
      invoice_date DATE,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_invoices_request_idx ON payment_invoices (bill_request_id);`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_invoices_no_uq ON payment_invoices (bill_request_id, invoice_no);`);
  console.log("Table 'payment_invoices' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_chargebacks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      charge_no TEXT NOT NULL,
      invoice_id VARCHAR NOT NULL REFERENCES payment_invoices(id) ON DELETE CASCADE,
      bill_request_id VARCHAR NOT NULL REFERENCES payment_bill_requests(id) ON DELETE CASCADE,
      subcontractor_name TEXT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      is_full BOOLEAN NOT NULL DEFAULT false,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      reject_reason TEXT,
      certificate_id VARCHAR,
      fine_id VARCHAR,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_chargebacks_seq_uq ON payment_chargebacks (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_chargebacks_invoice_idx ON payment_chargebacks (invoice_id);`);
  console.log("Table 'payment_chargebacks' ready.");

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
  await db.execute(sql`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS supplier_id VARCHAR REFERENCES suppliers(id) ON DELETE SET NULL;`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_seq_uq ON payment_orders (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_orders_project_idx ON payment_orders (project_id);`);
  console.log("Table 'payment_orders' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_subcontractor_certificates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      cert_no TEXT NOT NULL,
      subcontractor_name TEXT NOT NULL,
      scope TEXT,
      contract_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      period_from DATE,
      period_to DATE,
      gross_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      retention_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      retention_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      advance_recovery DECIMAL(14,2) NOT NULL DEFAULT 0,
      other_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
      deductions_note TEXT,
      vat_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      vat_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      net_payable DECIMAL(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      reject_reason TEXT,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMP,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_sub_certs_seq_uq ON payment_subcontractor_certificates (project_id, seq);`);
  await db.execute(sql`ALTER TABLE payment_subcontractor_certificates ADD COLUMN IF NOT EXISTS chargeback_deductions DECIMAL(14,2) NOT NULL DEFAULT 0;`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_sub_certs_project_idx ON payment_subcontractor_certificates (project_id);`);
  await db.execute(sql`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS subcontractor_certificate_id VARCHAR;`);
  console.log("Table 'payment_subcontractor_certificates' ready.");

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

  // Where each request / order / deduction was started from (a purchase order, a delivery, a snag item...)
  for (const table of ["payment_bill_requests", "payment_orders", "payment_fines"]) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS source_type TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS source_id VARCHAR;`));
  }
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_orders_source_idx ON payment_orders (source_type, source_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_bill_requests_source_idx ON payment_bill_requests (source_type, source_id);`);
  console.log("Source columns ready.");

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

  // The subcontractor register, and the id that replaces matching subcontractors by their typed name
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_subcontractors (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tax_number VARCHAR,
      contact_person TEXT,
      phone TEXT,
      scope TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS project_subcontractors_project_idx ON project_subcontractors (project_id);`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS project_subcontractors_name_uq ON project_subcontractors (project_id, lower(name));`);
  await db.execute(sql`ALTER TABLE payment_subcontractor_certificates ADD COLUMN IF NOT EXISTS subcontractor_id VARCHAR REFERENCES project_subcontractors(id) ON DELETE RESTRICT;`);
  await db.execute(sql`ALTER TABLE payment_chargebacks ADD COLUMN IF NOT EXISTS subcontractor_id VARCHAR REFERENCES project_subcontractors(id) ON DELETE RESTRICT;`);
  await db.execute(sql`ALTER TABLE payment_fines ADD COLUMN IF NOT EXISTS subcontractor_id VARCHAR REFERENCES project_subcontractors(id) ON DELETE SET NULL;`);
  await db.execute(sql`ALTER TABLE IF EXISTS material_issues ADD COLUMN IF NOT EXISTS subcontractor_id VARCHAR REFERENCES project_subcontractors(id) ON DELETE SET NULL;`);
  // One register entry per distinct name already typed on a certificate or charge-back (same project, ignoring case)
  await db.execute(sql`
    INSERT INTO project_subcontractors (project_id, name, scope)
    SELECT DISTINCT ON (project_id, lower(trim(subcontractor_name))) project_id, trim(subcontractor_name), scope
    FROM (
      SELECT project_id, subcontractor_name, scope, created_at FROM payment_subcontractor_certificates
      UNION ALL
      SELECT project_id, subcontractor_name, NULL, created_at FROM payment_chargebacks
    ) x
    ORDER BY project_id, lower(trim(subcontractor_name)), created_at DESC
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    UPDATE payment_subcontractor_certificates c SET subcontractor_id = s.id
    FROM project_subcontractors s
    WHERE c.subcontractor_id IS NULL AND s.project_id = c.project_id AND lower(s.name) = lower(trim(c.subcontractor_name))
  `);
  await db.execute(sql`
    UPDATE payment_chargebacks c SET subcontractor_id = s.id
    FROM project_subcontractors s
    WHERE c.subcontractor_id IS NULL AND s.project_id = c.project_id AND lower(s.name) = lower(trim(c.subcontractor_name))
  `);
  console.log("Table 'project_subcontractors' ready.");
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
