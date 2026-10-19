import { db } from "./server/db";
import { sql } from "drizzle-orm";

// مصفوفة أوزان ونسب الإنجاز + المستخلصات (Progress Matrix & Payment Certificates)
// Additive only: creates new tables/indexes, never alters existing ones.
// Run: npx tsx --env-file=.env migrate_progress_matrix_tables.ts

async function main() {
  console.log("Creating progress matrix tables in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_matrix_settings (
      project_id VARCHAR PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      unit_weight_mode TEXT NOT NULL DEFAULT 'equal',
      default_unit_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      drive_project_progress BOOLEAN NOT NULL DEFAULT false,
      updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Table 'progress_matrix_settings' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_wbs_nodes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id VARCHAR REFERENCES progress_wbs_nodes(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      weight DECIMAL(9,4) NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      work_list_activity_id VARCHAR REFERENCES work_list_activities(id) ON DELETE SET NULL,
      work_level_id VARCHAR REFERENCES work_levels(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS progress_wbs_nodes_code_uq ON progress_wbs_nodes (project_id, code);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_wbs_nodes_parent_idx ON progress_wbs_nodes (parent_id);`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS progress_wbs_nodes_link_uq
    ON progress_wbs_nodes (project_id, work_list_activity_id, COALESCE(work_level_id, ''))
    WHERE work_list_activity_id IS NOT NULL;
  `);
  console.log("Table 'progress_wbs_nodes' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_units (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      work_location_id VARCHAR NOT NULL UNIQUE REFERENCES work_locations(id) ON DELETE CASCADE,
      unit_value DECIMAL(14,2),
      manual_weight DECIMAL(9,6),
      included BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_units_project_idx ON progress_units (project_id);`);
  console.log("Table 'progress_units' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_cells (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      node_id VARCHAR NOT NULL REFERENCES progress_wbs_nodes(id) ON DELETE CASCADE,
      work_location_id VARCHAR NOT NULL REFERENCES work_locations(id) ON DELETE CASCADE,
      percent DECIMAL(5,2) NOT NULL CONSTRAINT progress_cells_percent_range CHECK (percent >= 0 AND percent <= 100),
      source TEXT NOT NULL DEFAULT 'manual',
      locked BOOLEAN NOT NULL DEFAULT false,
      revision_id VARCHAR REFERENCES request_revisions(id) ON DELETE SET NULL,
      updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS progress_cells_node_unit_uq ON progress_cells (node_id, work_location_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_cells_project_idx ON progress_cells (project_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_cells_unit_idx ON progress_cells (work_location_id);`);
  console.log("Table 'progress_cells' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_cell_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      node_id VARCHAR REFERENCES progress_wbs_nodes(id) ON DELETE SET NULL,
      node_code VARCHAR(50),
      work_location_id VARCHAR REFERENCES work_locations(id) ON DELETE SET NULL,
      old_percent DECIMAL(5,2),
      new_percent DECIMAL(5,2),
      source TEXT NOT NULL,
      revision_id VARCHAR,
      request_number VARCHAR(50),
      reason TEXT,
      changed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_cell_logs_cell_idx ON progress_cell_logs (node_id, work_location_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS progress_cell_logs_project_idx ON progress_cell_logs (project_id);`);
  console.log("Table 'progress_cell_logs' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_payment_certificates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      cert_no INTEGER NOT NULL,
      title TEXT,
      period_from DATE,
      period_to DATE,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      reject_reason TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMP,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      paid_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      paid_at TIMESTAMP,
      rejected_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      rejected_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS progress_payment_certificates_no_uq ON progress_payment_certificates (project_id, cert_no);`);
  console.log("Table 'progress_payment_certificates' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS progress_payment_certificate_lines (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      certificate_id VARCHAR NOT NULL REFERENCES progress_payment_certificates(id) ON DELETE CASCADE,
      work_location_id VARCHAR REFERENCES work_locations(id) ON DELETE SET NULL,
      unit_label TEXT,
      unit_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      cumulative_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
      previous_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
      current_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      phase_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS progress_payment_certificate_lines_uq ON progress_payment_certificate_lines (certificate_id, work_location_id);`);
  console.log("Table 'progress_payment_certificate_lines' ready.");
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
