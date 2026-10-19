import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Starting manual migration...");
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "project_folders" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "parent_id" varchar REFERENCES "project_folders"("id") ON DELETE cascade,
        "created_by" varchar NOT NULL REFERENCES "users"("id"),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log("Table project_folders created or already exists.");

    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='folder_id') THEN
          ALTER TABLE "documents" ADD COLUMN "folder_id" varchar REFERENCES "project_folders"("id") ON DELETE set null;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='file_url') THEN
          ALTER TABLE "documents" ADD COLUMN "file_url" text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='file_name') THEN
          ALTER TABLE "documents" ADD COLUMN "file_name" text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='uploaded_by') THEN
          ALTER TABLE "documents" ADD COLUMN "uploaded_by" varchar REFERENCES "users"("id");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='tags') THEN
          ALTER TABLE "documents" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
        END IF;
      END
      $$;
    `);
    console.log("Columns added to documents table if they were missing.");
    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
