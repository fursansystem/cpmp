import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating snag_lists and snag_items tables in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS snag_lists (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Table 'snag_lists' created successfully.");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS snag_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      snag_list_id VARCHAR NOT NULL REFERENCES snag_lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'architectural',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      work_location_id VARCHAR REFERENCES work_locations(id) ON DELETE SET NULL,
      work_level_id VARCHAR REFERENCES work_levels(id) ON DELETE SET NULL,
      location_details TEXT,
      assigned_to VARCHAR REFERENCES team_members(id) ON DELETE SET NULL,
      purpose_id VARCHAR REFERENCES purposes(id) ON DELETE SET NULL,
      due_date DATE,
      before_images JSONB NOT NULL DEFAULT '[]'::jsonb,
      after_images JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      closed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Table 'snag_items' created successfully.");
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
