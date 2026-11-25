import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Migrating project_workflow_assignments table in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_workflow_assignments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      stage TEXT NOT NULL,
      team_member_id VARCHAR REFERENCES team_members(id) ON DELETE CASCADE,
      position_id VARCHAR REFERENCES positions(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_proj_wf_assign_proj_mod_stage 
    ON project_workflow_assignments (project_id, module, stage);
  `);

  console.log("Table 'project_workflow_assignments' created successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
