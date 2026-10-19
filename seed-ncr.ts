import { neon } from '@neondatabase/serverless';

// Read from the environment like the other seed scripts: this file is in version control,
// and a connection string committed here would expose the database password.
// Run with: npx tsx --env-file=.env seed-ncr.ts
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined — run with: npx tsx --env-file=.env seed-ncr.ts");
}

const sql = neon(databaseUrl);

async function run() {
  console.log("Seeding NCR and RNCR...");

  // 1. NCR
  await sql`
    INSERT INTO request_types (id, id_number, code, name_english, name_arabic, description, is_active, sort_order)
    VALUES (gen_random_uuid(), 9, 'NCR', 'Non-Conformance Report', 'تقرير عدم المطابقة', 'Consultant issued non-conformance report', true, 9)
    ON CONFLICT (id_number) DO NOTHING;
  `;
  console.log("NCR type seeded");

  // Workflow steps for NCR
  await sql`
    INSERT INTO workflow_steps (id, request_type_id, step_name, role_required, sequence_order)
    VALUES 
    (901, 9, 'Consultant Preparation', 2, 1),
    (902, 9, 'Consultant PM Approval', 7, 2),
    (903, 9, 'Issued to Contractor', 1, 3)
    ON CONFLICT (id) DO NOTHING;
  `;
  console.log("NCR steps seeded");

  // Workflow transitions for NCR
  await sql`
    INSERT INTO workflow_transitions (transition_id, request_type_id, from_step_id, to_step_id, allowed_status)
    VALUES
    (901, 9, 901, 902, 'Submitted'),
    (902, 9, 902, 903, 'Approved')
    ON CONFLICT (transition_id) DO NOTHING;
  `;
  console.log("NCR transitions seeded");

  // 2. RNCR
  await sql`
    INSERT INTO request_types (id, id_number, code, name_english, name_arabic, description, is_active, sort_order)
    VALUES (gen_random_uuid(), 10, 'RNCR', 'Reply to NCR', 'رد على تقرير عدم المطابقة', 'Contractor reply to NCR', true, 10)
    ON CONFLICT (id_number) DO NOTHING;
  `;
  console.log("RNCR type seeded");

  // Workflow steps for RNCR
  await sql`
    INSERT INTO workflow_steps (id, request_type_id, step_name, role_required, sequence_order)
    VALUES 
    (1001, 10, 'Contractor Preparation', 1, 1),
    (1002, 10, 'Contractor PM Approval', 7, 2),
    (1003, 10, 'Consultant Review', 2, 3),
    (1004, 10, 'Consultant Manager Approval', 7, 4)
    ON CONFLICT (id) DO UPDATE SET 
      step_name = EXCLUDED.step_name,
      role_required = EXCLUDED.role_required,
      sequence_order = EXCLUDED.sequence_order;
  `;
  console.log("RNCR steps seeded");

  // Workflow transitions for RNCR
  await sql`
    INSERT INTO workflow_transitions (transition_id, request_type_id, from_step_id, to_step_id, allowed_status)
    VALUES
    (10001, 10, 1001, 1002, 'Submitted'),
    (10002, 10, 1002, 1003, 'Under Review'),
    (10003, 10, 1003, 1004, 'Under Review'),
    (10004, 10, 1004, 1004, 'Approved'),
    (10005, 10, 1004, 1004, 'Rejected'),
    (10006, 10, 1004, 1001, 'Requires Action')
    ON CONFLICT (transition_id) DO UPDATE SET
      from_step_id = EXCLUDED.from_step_id,
      to_step_id = EXCLUDED.to_step_id,
      allowed_status = EXCLUDED.allowed_status;
  `;
  console.log("RNCR transitions seeded");

  console.log("All seeded successfully!");
}

run().catch(console.error);
