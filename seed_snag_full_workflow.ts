import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/) || envContent.match(/DATABASE_URL=(.+)/);
const dbUrl = match ? match[1].trim() : process.env.DATABASE_URL;

const sql = neon(dbUrl!);

async function main() {
  console.log("Starting Snag List Full Workflow Migration...");

  // 1. Alter snag_lists table (INTEGER for current_step_id)
  await sql`
    ALTER TABLE snag_lists
    ADD COLUMN IF NOT EXISTS current_step_id INTEGER REFERENCES workflow_steps(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS building_no TEXT,
    ADD COLUMN IF NOT EXISTS zone_type TEXT;
  `;

  // 2. Alter snag_items table
  await sql`
    ALTER TABLE snag_items
    ADD COLUMN IF NOT EXISTS building_no TEXT,
    ADD COLUMN IF NOT EXISTS zone_type TEXT,
    ADD COLUMN IF NOT EXISTS floor_no TEXT,
    ADD COLUMN IF NOT EXISTS unit_no TEXT,
    ADD COLUMN IF NOT EXISTS location_room TEXT,
    ADD COLUMN IF NOT EXISTS discipline TEXT,
    ADD COLUMN IF NOT EXISTS element_name TEXT,
    ADD COLUMN IF NOT EXISTS image_markup_data JSONB,
    ADD COLUMN IF NOT EXISTS contractor_comment TEXT,
    ADD COLUMN IF NOT EXISTS rectification_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS pm_review_comment TEXT,
    ADD COLUMN IF NOT EXISTS consultant_review_comment TEXT,
    ADD COLUMN IF NOT EXISTS reinspection_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS raised_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS raised_date TIMESTAMP DEFAULT NOW();
  `;

  // 3. Create snag_item_history table
  await sql`
    CREATE TABLE IF NOT EXISTS snag_item_history (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      snag_item_id VARCHAR NOT NULL REFERENCES snag_items(id) ON DELETE CASCADE,
      snag_list_id VARCHAR NOT NULL REFERENCES snag_lists(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      comments TEXT,
      performed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      attachments JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  console.log("DB Tables & Columns created/updated successfully.");

  // 4. Ensure request_types has SL (id_number: 12)
  await sql`
    INSERT INTO request_types (id_number, code, name_english, name_arabic, description, is_active, sort_order)
    VALUES (12, 'SL', 'Snag List', 'طلب قائمة الملاحظات والعيوب', 'Formal snag list defect management workflow', true, 12)
    ON CONFLICT (id_number) DO UPDATE SET code = 'SL', name_english = 'Snag List';
  `;
  console.log("Updated SL code and name in request_types.");

  // 5. Setup workflow_steps for SLR (request_type_id = 12)
  await sql`
    INSERT INTO workflow_steps (id, request_type_id, step_name, role_required, sequence_order)
    VALUES 
    (1201, 12, 'إعداد وتوثيق الملاحظات', 2, 1),
    (1202, 12, 'معالجة وإصلاح العيوب', 1, 2),
    (1203, 12, 'معاينة واعتماد الإغلاق', 2, 3)
    ON CONFLICT (id) DO UPDATE SET
      step_name = EXCLUDED.step_name,
      role_required = EXCLUDED.role_required,
      sequence_order = EXCLUDED.sequence_order;
  `;
  console.log("Created/Updated workflow_steps for SLR (1201, 1202, 1203).");

  // 6. Setup workflow_transitions for SLR
  await sql`
    INSERT INTO workflow_transitions (transition_id, request_type_id, from_step_id, to_step_id, allowed_status)
    VALUES
    (1201, 12, 1201, 1202, 'Submitted'),
    (1202, 12, 1202, 1203, 'Under Review'),
    (1203, 12, 1203, 1202, 'Revision Required'),
    (1204, 12, 1203, 1203, 'Closed')
    ON CONFLICT (transition_id) DO UPDATE SET
      allowed_status = EXCLUDED.allowed_status;
  `;
  console.log("Created/Updated workflow_transitions for SLR (1201-1204).");

  // Set default step 1201 on existing snag_lists if current_step_id is null
  await sql`UPDATE snag_lists SET current_step_id = 1201 WHERE current_step_id IS NULL;`;

  console.log("Migration completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
