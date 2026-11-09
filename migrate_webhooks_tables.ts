import { db } from "./server/db";
import { sql } from "drizzle-orm";

// Outgoing webhooks (ERP integration): registered endpoints and their delivery log.
// Additive only: creates new tables/indexes, never alters existing ones.
// Run: npx tsx --env-file=.env migrate_webhooks_tables.ts

async function main() {
  console.log("Creating webhook tables in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      active BOOLEAN NOT NULL DEFAULT true,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS webhooks_org_idx ON webhooks (organization_id);`);
  console.log("Table 'webhooks' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id VARCHAR NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      action TEXT,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMP DEFAULT NOW(),
      response_status INTEGER,
      response_body TEXT,
      error TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries (webhook_id, created_at);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries (status, next_attempt_at);`);
  console.log("Table 'webhook_deliveries' ready.");

  // ---- Incoming from ERPNext ----
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS erp_connections (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      base_url TEXT NOT NULL,
      company TEXT,
      api_key TEXT,
      api_secret TEXT,
      webhook_secret TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Table 'erp_connections' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS erp_suppliers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      erp_name TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      tax_id TEXT,
      email TEXT,
      phone TEXT,
      supplier_group TEXT,
      disabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS erp_suppliers_org_name_uq ON erp_suppliers (organization_id, erp_name);`);
  console.log("Table 'erp_suppliers' ready.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS erp_inbound_log (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      doctype TEXT,
      doc_name TEXT,
      event TEXT,
      status TEXT NOT NULL,
      message TEXT,
      payload JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS erp_inbound_log_org_idx ON erp_inbound_log (organization_id, created_at);`);
  console.log("Table 'erp_inbound_log' ready.");

  // The only change to an existing table: an optional link from a project supplier to ERPNext
  await db.execute(sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS erp_supplier TEXT;`);
  console.log("Column 'suppliers.erp_supplier' ready.");

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
