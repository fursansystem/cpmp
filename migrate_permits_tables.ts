import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { SEED_AUTHORITIES, SEED_SERVICES } from "./server/permit-catalog-seed";

// الرخص والمعاملات (Permits & transactions): the service catalogue, the transactions run from it, their steps,
// requirements, files and activity. Safe to run again: tables and columns are created only when missing, the
// built-in catalogue only adds services it does not have yet, and the one-time move of the licences that used
// to live in المدفوعات (payment_clearances) runs only while that table still exists.
// Run: npx tsx --env-file=.env migrate_permits_tables.ts   (after migrate_payments_tables.ts)

async function createTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_authorities (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT,
      name TEXT NOT NULL,
      name_en TEXT,
      portal_url TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS permit_authorities_code_uq ON permit_authorities (code) WHERE organization_id IS NULL;`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_services (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id VARCHAR REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT,
      authority_id VARCHAR REFERENCES permit_authorities(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      service_url TEXT,
      channels TEXT,
      is_license BOOLEAN NOT NULL DEFAULT false,
      validity_months INTEGER,
      renewal_lead_days INTEGER NOT NULL DEFAULT 30,
      fee_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      fee_note TEXT,
      sla_days INTEGER,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_services_org_idx ON permit_services (organization_id);`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS permit_services_code_uq ON permit_services (code) WHERE organization_id IS NULL;`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_service_steps (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id VARCHAR NOT NULL REFERENCES permit_services(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      party TEXT NOT NULL DEFAULT 'any',
      sla_days INTEGER,
      is_payment_step BOOLEAN NOT NULL DEFAULT false
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_service_steps_service_idx ON permit_service_steps (service_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_service_requirements (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id VARCHAR NOT NULL REFERENCES permit_services(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'document',
      title TEXT NOT NULL,
      description TEXT,
      mandatory BOOLEAN NOT NULL DEFAULT true
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_service_requirements_service_idx ON permit_service_requirements (service_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_transactions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      transaction_no TEXT NOT NULL,
      service_id VARCHAR REFERENCES permit_services(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'transaction',
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      authority_name TEXT,
      portal_url TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      assignee_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      responsible_name TEXT,
      reference_no TEXT,
      license_no TEXT,
      start_date DATE,
      due_date DATE,
      submitted_at TIMESTAMP,
      issue_date DATE,
      expiry_date DATE,
      renewal_lead_days INTEGER,
      fee_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      fee_paid BOOLEAN NOT NULL DEFAULT false,
      fee_paid_at TIMESTAMP,
      renewal_of_id VARCHAR,
      expiry_notice_level INTEGER,
      notes TEXT,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS permit_transactions_seq_uq ON permit_transactions (project_id, seq);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_transactions_project_idx ON permit_transactions (project_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_transaction_steps (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id VARCHAR NOT NULL REFERENCES permit_transactions(id) ON DELETE CASCADE,
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      party TEXT NOT NULL DEFAULT 'any',
      is_payment_step BOOLEAN NOT NULL DEFAULT false,
      assignee_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMP,
      note TEXT,
      overdue_notified_at TIMESTAMP
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_transaction_steps_tx_idx ON permit_transaction_steps (transaction_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_transaction_steps_assignee_idx ON permit_transaction_steps (assignee_user_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_transaction_requirements (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id VARCHAR NOT NULL REFERENCES permit_transactions(id) ON DELETE CASCADE,
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'document',
      title TEXT NOT NULL,
      description TEXT,
      mandatory BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'missing',
      updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_transaction_requirements_tx_idx ON permit_transaction_requirements (transaction_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_attachments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      transaction_id VARCHAR NOT NULL REFERENCES permit_transactions(id) ON DELETE CASCADE,
      requirement_id VARCHAR,
      step_id VARCHAR,
      file_name TEXT NOT NULL,
      object_path TEXT NOT NULL,
      content_type TEXT,
      size INTEGER,
      uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_attachments_tx_idx ON permit_attachments (transaction_id);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permit_activity (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      transaction_id VARCHAR NOT NULL REFERENCES permit_transactions(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS permit_activity_tx_idx ON permit_activity (transaction_id);`);

  // A payment order can pay a transaction's fee
  await db.execute(sql`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS permit_transaction_id VARCHAR;`);
  // Activity (tasks) mirrors the transaction steps assigned to people
  await db.execute(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type TEXT;`);
  await db.execute(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_id VARCHAR;`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tasks_source_idx ON tasks (source_type, source_id);`);
  console.log("Permit tables ready.");
}

async function seedCatalogue() {
  for (const a of SEED_AUTHORITIES) {
    await db.execute(sql`
      INSERT INTO permit_authorities (code, name, name_en, portal_url)
      VALUES (${a.code}, ${a.name}, ${a.nameEn}, ${a.portalUrl})
      ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING
    `);
  }
  let added = 0;
  for (const s of SEED_SERVICES) {
    // Only services the catalogue does not have yet: an administrator's edits to a built-in service are kept
    const inserted = await db.execute(sql`
      INSERT INTO permit_services (code, authority_id, name, category, description, service_url, channels, is_license, fee_note)
      SELECT ${s.code}, a.id, ${s.name}, ${s.category}, ${s.description}, ${s.serviceUrl}, ${s.channels}, ${s.isLicense}, ${s.feeNote}
      FROM permit_authorities a WHERE a.code = ${s.authority} AND a.organization_id IS NULL
      ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING
      RETURNING id
    `);
    const id = (inserted.rows[0] as { id?: string } | undefined)?.id;
    if (!id) continue;
    added += 1;
    for (const [i, step] of s.steps.entries()) {
      await db.execute(sql`
        INSERT INTO permit_service_steps (service_id, seq, title, description, party, is_payment_step)
        VALUES (${id}, ${i + 1}, ${step.title}, ${step.description ?? null}, ${step.party}, ${!!step.isPaymentStep})
      `);
    }
    for (const [i, r] of s.requirements.entries()) {
      await db.execute(sql`
        INSERT INTO permit_service_requirements (service_id, seq, kind, title, mandatory)
        VALUES (${id}, ${i + 1}, ${r.kind}, ${r.title}, ${r.mandatory ?? true})
      `);
    }
  }
  console.log(`Built-in catalogue ready (${added} new services).`);
}

// One time: the licences recorded under المدفوعات → الرخص move here with their files, history and payment orders.
// They keep their ids, so the payment orders that paid them point at the same records. The old table is then dropped.
async function moveClearances() {
  const found = await db.execute(sql`SELECT to_regclass('public.payment_clearances') AS t`);
  if (!(found.rows[0] as { t: string | null }).t) {
    console.log("No payment_clearances table: nothing to move.");
    return;
  }

  await db.transaction(async (tx) => {
    const moved = await tx.execute(sql`
      WITH base AS (
        SELECT COALESCE(MAX(seq), 0) AS mx, project_id FROM permit_transactions GROUP BY project_id
      ), numbered AS (
        SELECT c.*, COALESCE(b.mx, 0) + row_number() OVER (PARTITION BY c.project_id ORDER BY c.created_at, c.id) AS new_seq
        FROM payment_clearances c
        LEFT JOIN base b ON b.project_id = c.project_id
        WHERE NOT EXISTS (SELECT 1 FROM permit_transactions t WHERE t.id = c.id)
      )
      INSERT INTO permit_transactions (
        id, project_id, seq, transaction_no, kind, title, category, authority_name, status, responsible_name,
        reference_no, due_date, issue_date, expiry_date, fee_amount, fee_paid, fee_paid_at, notes, created_by, created_at, updated_at
      )
      SELECT
        n.id, n.project_id, n.new_seq, 'TR-' || lpad(n.new_seq::text, 4, '0'),
        CASE WHEN n.expiry_date IS NOT NULL THEN 'license' ELSE 'transaction' END,
        n.title, 'other', n.authority,
        CASE n.status WHEN 'pending' THEN 'not_started' WHEN 'obtained' THEN 'completed' ELSE n.status END,
        n.responsible_name, n.reference_no, n.due_date, n.issue_date, n.expiry_date, n.fee_amount, n.fee_paid,
        CASE WHEN n.fee_paid THEN (SELECT MAX(o.paid_at) FROM payment_orders o WHERE o.clearance_id = n.id AND o.status = 'paid') END,
        n.notes, n.created_by, n.created_at, n.updated_at
      FROM numbered n
      RETURNING id
    `);
    console.log(`Moved ${moved.rows.length} licences from payment_clearances.`);

    // The fee becomes the transaction's payment step
    await tx.execute(sql`
      INSERT INTO permit_transaction_steps (transaction_id, project_id, seq, title, party, is_payment_step, status, completed_at, note)
      SELECT t.id, t.project_id, 1, 'سداد الرسوم', 'developer', true,
        CASE
          WHEN t.fee_paid THEN 'done'
          WHEN EXISTS (SELECT 1 FROM payment_orders o WHERE o.clearance_id = t.id AND o.status NOT IN ('rejected', 'cancelled')) THEN 'in_progress'
          ELSE 'pending'
        END,
        t.fee_paid_at,
        NULL
      FROM permit_transactions t
      JOIN payment_clearances c ON c.id = t.id
      WHERE t.fee_amount > 0 AND NOT EXISTS (SELECT 1 FROM permit_transaction_steps s WHERE s.transaction_id = t.id)
    `);

    await tx.execute(sql`
      INSERT INTO permit_attachments (id, project_id, transaction_id, file_name, object_path, content_type, size, uploaded_by, created_at)
      SELECT a.id, a.project_id, a.entity_id, a.file_name, a.object_path, a.content_type, a.size, a.uploaded_by, a.created_at
      FROM payment_attachments a
      JOIN permit_transactions t ON t.id = a.entity_id
      WHERE a.entity_type = 'clearance' AND NOT EXISTS (SELECT 1 FROM permit_attachments p WHERE p.id = a.id)
    `);

    const mapStatus = (col: string) => sql.raw(`CASE ${col} WHEN 'pending' THEN 'not_started' WHEN 'obtained' THEN 'completed' ELSE ${col} END`);
    await tx.execute(sql`
      INSERT INTO permit_activity (id, project_id, transaction_id, action, from_status, to_status, note, user_id, created_at)
      SELECT a.id, a.project_id, a.entity_id, a.action, ${mapStatus("a.from_status")}, ${mapStatus("a.to_status")}, a.note, a.user_id, a.created_at
      FROM payment_activity a
      JOIN permit_transactions t ON t.id = a.entity_id
      WHERE a.entity_type = 'clearance' AND NOT EXISTS (SELECT 1 FROM permit_activity p WHERE p.id = a.id)
    `);

    // Payment orders follow their licence to the new record
    const cols = await tx.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_orders' AND column_name = 'clearance_id'`);
    if (cols.rows.length > 0) {
      await tx.execute(sql`UPDATE payment_orders SET permit_transaction_id = clearance_id WHERE clearance_id IS NOT NULL AND permit_transaction_id IS NULL`);
    }

    await tx.execute(sql`DELETE FROM payment_attachments WHERE entity_type = 'clearance'`);
    await tx.execute(sql`DELETE FROM payment_activity WHERE entity_type = 'clearance'`);
    await tx.execute(sql`UPDATE notifications SET link = '/permits' WHERE link LIKE '/payments?tab=clearances%'`);
    const hooks = await tx.execute(sql`SELECT to_regclass('public.webhooks') AS w, to_regclass('public.webhook_deliveries') AS d`);
    const { w, d } = hooks.rows[0] as { w: string | null; d: string | null };
    if (w) await tx.execute(sql`UPDATE webhooks SET events = array_replace(events, 'clearance', 'permit') WHERE 'clearance' = ANY(events)`);
    if (d) await tx.execute(sql`UPDATE webhook_deliveries SET event = 'permit' WHERE event = 'clearance' AND status = 'pending'`);

    if (cols.rows.length > 0) await tx.execute(sql`ALTER TABLE payment_orders DROP COLUMN clearance_id`);
    await tx.execute(sql`DROP TABLE payment_clearances`);
  });
  console.log("Dropped payment_clearances and payment_orders.clearance_id.");
}

async function main() {
  console.log("Creating permits tables in PostgreSQL...");
  await createTables();
  await seedCatalogue();
  await moveClearances();
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
