import { db } from "./server/db";
import { sql } from "drizzle-orm";

// تسليم الوحدات (Unit Handover): clients, unit_handovers, attachments, activity, snag_lists.handover_id,
// and the "Customer Service" / "خدمة العملاء" position. Safe to run repeatedly.
// Run: npx tsx --env-file=.env migrate_handover_tables.ts

async function run() {
  await db.execute(sql`
    ALTER TABLE snag_lists
    ADD COLUMN IF NOT EXISTS handover_id VARCHAR;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      full_name_en TEXT,
      national_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      sec_account_number TEXT,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS clients_org_idx ON clients (organization_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS clients_national_id_idx ON clients (organization_id, national_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS unit_handovers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      work_location_id VARCHAR NOT NULL REFERENCES work_locations(id) ON DELETE CASCADE,
      client_id VARCHAR NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      snag_list_id VARCHAR REFERENCES snag_lists(id) ON DELETE SET NULL,
      seq INTEGER NOT NULL,
      handover_no TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      deed_number TEXT,
      contract_number TEXT,
      inspection_date DATE,
      handover_date DATE,
      meter_number TEXT,
      electricity_account_no TEXT,
      meter_reading_at_handover TEXT,
      meter_transfer_status TEXT NOT NULL DEFAULT 'not_started',
      sec_request_no TEXT,
      previous_bills_cleared BOOLEAN NOT NULL DEFAULT false,
      meter_transfer_date DATE,
      meter_transfer_notes TEXT,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      completed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS unit_handovers_seq_uq ON unit_handovers (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS unit_handovers_project_idx ON unit_handovers (project_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS unit_handovers_unit_idx ON unit_handovers (work_location_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS unit_handovers_client_idx ON unit_handovers (client_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS handover_attachments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      handover_id VARCHAR NOT NULL REFERENCES unit_handovers(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'other',
      file_name TEXT NOT NULL,
      object_path TEXT NOT NULL,
      content_type TEXT,
      size INTEGER,
      uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS handover_attachments_handover_idx ON handover_attachments (handover_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS handover_activity (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      handover_id VARCHAR NOT NULL REFERENCES unit_handovers(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS handover_activity_handover_idx ON handover_activity (handover_id);`);

  // Ensure "Customer Service" / "خدمة العملاء" position exists
  await db.execute(sql`
    INSERT INTO positions (title_english, title_arabic)
    SELECT 'Customer Service', 'خدمة العملاء'
    WHERE NOT EXISTS (
      SELECT 1 FROM positions WHERE lower(title_english) = 'customer service'
    );
  `);

  console.log("Unit Handover migration completed successfully.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Unit Handover migration failed:", err);
  process.exit(1);
});
