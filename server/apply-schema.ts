
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log('Applying schema changes...');
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS request_work_levels (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        revision_id VARCHAR NOT NULL REFERENCES request_revisions(id) ON DELETE CASCADE,
        work_level_id VARCHAR NOT NULL REFERENCES work_levels(id) ON DELETE CASCADE,
        remarks TEXT,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('Table request_work_levels ensured.');

    await sql`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS activity_code TEXT,
      ADD COLUMN IF NOT EXISTS activity_name TEXT,
      ADD COLUMN IF NOT EXISTS chapter_name TEXT,
      ADD COLUMN IF NOT EXISTS division_name TEXT,
      ADD COLUMN IF NOT EXISTS work_level_name TEXT,
      ADD COLUMN IF NOT EXISTS project_name TEXT,
      ADD COLUMN IF NOT EXISTS contractor_name TEXT,
      ADD COLUMN IF NOT EXISTS consultant_name TEXT;
    `;
    console.log('Columns added successfully.');
  } catch (error) {
    console.error('Error adding columns:', error);
  }
}

run();
