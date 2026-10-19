import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating inventory tables in PostgreSQL...");

  // 1. warehouses - every project gets a default warehouse further down
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS warehouses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT,
      location TEXT,
      keeper_name TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_warehouses_project ON warehouses (project_id);
  `);
  // At most one default warehouse per project, enforced by the database rather than by convention.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_one_default
      ON warehouses (project_id) WHERE is_default;
  `);
  console.log("Table 'warehouses' verified/created.");

  // 2. inventory_approver_positions - positions allowed to approve issue vouchers
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_approver_positions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position_id VARCHAR NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_approver_unique
      ON inventory_approver_positions (project_id, position_id);
  `);
  console.log("Table 'inventory_approver_positions' verified/created.");

  // 3. stock_movements - the ledger
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      warehouse_id VARCHAR NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      material_id VARCHAR NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id VARCHAR,
      movement_date DATE NOT NULL,
      performed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stock_movements_wh_material ON stock_movements (warehouse_id, material_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stock_movements_project_material ON stock_movements (project_id, material_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stock_movements_material_date ON stock_movements (material_id, movement_date);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON stock_movements (source_type, source_id);
  `);
  console.log("Table 'stock_movements' verified/created.");

  // 4. stock_transfers + items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      transfer_number TEXT NOT NULL,
      from_warehouse_id VARCHAR NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      to_warehouse_id VARCHAR NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      transfer_date DATE NOT NULL,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_id VARCHAR NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
      material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL,
      material_name TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit TEXT NOT NULL,
      notes TEXT
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_project ON stock_transfers (project_id, transfer_date);
  `);
  console.log("Tables 'stock_transfers' and 'stock_transfer_items' verified/created.");

  // 5. material_issues - issue voucher header
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS material_issues (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      warehouse_id VARCHAR NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      issue_number TEXT NOT NULL,
      issue_date DATE NOT NULL,
      issued_to TEXT NOT NULL,
      recipient_type TEXT NOT NULL DEFAULT 'subcontractor',
      work_location_id VARCHAR REFERENCES work_locations(id) ON DELETE SET NULL,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'issued',
      requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      rejected_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      rejected_at TIMESTAMP,
      rejection_reason TEXT,
      cancelled_at TIMESTAMP,
      cancelled_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_material_issues_project ON material_issues (project_id, issue_date);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_material_issues_status ON material_issues (project_id, status);
  `);
  console.log("Table 'material_issues' verified/created.");

  // 6. material_issue_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS material_issue_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      issue_id VARCHAR NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
      material_id VARCHAR REFERENCES materials(id) ON DELETE SET NULL,
      material_name TEXT NOT NULL,
      quantity NUMERIC(12, 2) NOT NULL,
      unit TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_material_issue_items_issue ON material_issue_items (issue_id);
  `);
  console.log("Table 'material_issue_items' verified/created.");

  // 7. New columns on existing tables
  await db.execute(sql`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS requires_issue_approval BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR REFERENCES warehouses(id) ON DELETE SET NULL;
  `);
  console.log("Columns on 'materials' and 'deliveries' verified/added.");

  // 8. Give every project a default warehouse so existing data has somewhere to live.
  const defaults = await db.execute(sql`
    INSERT INTO warehouses (project_id, name, code, is_default)
    SELECT p.id, 'المستودع الرئيسي', 'WH-01', TRUE
    FROM projects p
    WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.project_id = p.id);
  `);
  console.log(`Default warehouses created: ${defaults.rowCount ?? 0}`);

  // 9. Point existing deliveries at their project's default warehouse.
  const linked = await db.execute(sql`
    UPDATE deliveries d
    SET warehouse_id = w.id
    FROM warehouses w
    WHERE w.project_id = d.project_id
      AND w.is_default
      AND d.warehouse_id IS NULL;
  `);
  console.log(`Existing deliveries linked to default warehouse: ${linked.rowCount ?? 0}`);

  // 10. Backfill 'in' movements from existing delivery items.
  // Guarded by NOT EXISTS so re-running the script never duplicates rows.
  const backfill = await db.execute(sql`
    INSERT INTO stock_movements (project_id, warehouse_id, material_id, movement_type, quantity, unit, source_type, source_id, movement_date, notes)
    SELECT d.project_id,
           d.warehouse_id,
           di.material_id,
           'in',
           di.arrival_quantity,
           di.unit,
           'delivery',
           d.id,
           d.arrival_date,
           'ترحيل تلقائي من سجل التوريدات'
    FROM delivery_items di
    JOIN deliveries d ON d.id = di.delivery_id
    WHERE di.material_id IS NOT NULL
      AND d.warehouse_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm
        WHERE sm.source_type = 'delivery'
          AND sm.source_id = d.id
          AND sm.material_id = di.material_id
      );
  `);
  console.log(`Backfilled delivery movements. Rows inserted: ${backfill.rowCount ?? 0}`);

  // 11. Data quality reports - printed only, never auto-corrected.
  const orphanItems = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM delivery_items WHERE material_id IS NULL;
  `);
  const orphanCount = (orphanItems.rows[0] as any)?.count ?? 0;
  if (orphanCount > 0) {
    console.warn(
      `\n[تنبيه] ${orphanCount} بند توريد بدون مادة مرتبطة (material_id IS NULL). هذه البنود لن تدخل المخزون. راجعها يدويًا.`
    );
  }

  const unitConflicts = await db.execute(sql`
    SELECT m.material_name, m.unit AS catalog_unit,
           STRING_AGG(DISTINCT di.unit, ', ') AS delivered_units
    FROM materials m
    JOIN delivery_items di ON di.material_id = m.id
    GROUP BY m.id, m.material_name, m.unit
    HAVING COUNT(DISTINCT di.unit) > 1;
  `);
  if (unitConflicts.rows.length > 0) {
    console.warn(`\n[تنبيه] ${unitConflicts.rows.length} مادة بوحدات متعارضة - رصيدها سيكون غير صحيح حتى تُصحّح:`);
    for (const row of unitConflicts.rows as any[]) {
      console.warn(`  - ${row.material_name}: الكتالوج "${row.catalog_unit}" / التوريدات "${row.delivered_units}"`);
    }
  }

  const duplicateNames = await db.execute(sql`
    SELECT STRING_AGG(material_name, ' | ') AS variants
    FROM materials
    GROUP BY project_id, LOWER(TRIM(material_name))
    HAVING COUNT(*) > 1;
  `);
  if (duplicateNames.rows.length > 0) {
    console.warn(`\n[تنبيه] ${duplicateNames.rows.length} اسم مادة مكرر بفروق في الحالة/المسافات - الأرصدة ستكون مجزّأة:`);
    for (const row of duplicateNames.rows as any[]) {
      console.warn(`  - ${row.variants}`);
    }
  }

  console.log("\nAll inventory tables created successfully!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
