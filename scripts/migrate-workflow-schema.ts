import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("Starting workflow schema migration...");

    await client.query("BEGIN");

    // 1. Add new columns to requests table
    console.log("Adding new columns to requests table...");
    
    // Add reference_code column
    await client.query(`
      ALTER TABLE requests 
      ADD COLUMN IF NOT EXISTS reference_code TEXT;
    `);
    
    // Add current_step_id column
    await client.query(`
      ALTER TABLE requests 
      ADD COLUMN IF NOT EXISTS current_step_id INTEGER;
    `);

    // Update existing requests to have a reference_code based on request_number if null
    await client.query(`
      UPDATE requests 
      SET reference_code = COALESCE(reference_code, request_number)
      WHERE reference_code IS NULL;
    `);

    // Make reference_code NOT NULL after updating existing records
    await client.query(`
      ALTER TABLE requests 
      ALTER COLUMN reference_code SET NOT NULL;
    `);

    // 2. Add new columns to request_revisions table
    console.log("Adding new columns to request_revisions table...");
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS title TEXT;
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS work_list_activity_id VARCHAR REFERENCES work_list_activities(id);
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS work_location_id VARCHAR REFERENCES work_locations(id);
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS work_level_id VARCHAR REFERENCES work_levels(id);
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS scheduled_date DATE;
    `);
    
    await client.query(`
      ALTER TABLE request_revisions 
      ADD COLUMN IF NOT EXISTS remarks TEXT;
    `);

    // Check if requests table has title column before migrating data
    console.log("Checking for existing data to migrate...");
    const checkTitleColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'requests' AND column_name = 'title';
    `);
    
    if (checkTitleColumn.rows.length > 0) {
      console.log("Migrating existing request data to revisions...");
      await client.query(`
        UPDATE request_revisions rr
        SET 
          title = COALESCE(rr.title, r.title, 'Untitled'),
          description = COALESCE(rr.description, r.description),
          work_location_id = COALESCE(rr.work_location_id, r.work_location_id),
          work_level_id = COALESCE(rr.work_level_id, r.work_level_id),
          scheduled_date = COALESCE(rr.scheduled_date, r.inspection_date)
        FROM requests r
        WHERE rr.request_id = r.id
        AND rr.title IS NULL;
      `);
    } else {
      console.log("No title column found in requests table, skipping data migration.");
    }

    // Set default title for any remaining null titles
    await client.query(`
      UPDATE request_revisions 
      SET title = 'Untitled'
      WHERE title IS NULL;
    `);

    // Make title NOT NULL
    await client.query(`
      ALTER TABLE request_revisions 
      ALTER COLUMN title SET NOT NULL;
    `);

    // 3. Add request_id to activities table
    console.log("Adding request_id column to activities table...");
    await client.query(`
      ALTER TABLE activities 
      ADD COLUMN IF NOT EXISTS request_id VARCHAR REFERENCES requests(id) ON DELETE SET NULL;
    `);

    // 4. Remove old columns from requests table (optional - keeping for now for backward compatibility)
    // Uncomment these lines if you want to remove the deprecated columns
    // console.log("Removing deprecated columns from requests table...");
    // await client.query(`ALTER TABLE requests DROP COLUMN IF EXISTS title;`);
    // await client.query(`ALTER TABLE requests DROP COLUMN IF EXISTS description;`);
    // await client.query(`ALTER TABLE requests DROP COLUMN IF EXISTS work_location_id;`);
    // await client.query(`ALTER TABLE requests DROP COLUMN IF EXISTS work_level_id;`);
    // await client.query(`ALTER TABLE requests DROP COLUMN IF EXISTS inspection_date;`);

    await client.query("COMMIT");
    console.log("Migration completed successfully!");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration error:", error);
  process.exit(1);
});
