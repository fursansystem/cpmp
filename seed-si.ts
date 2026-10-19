import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// Read .env file directly
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined in .env!");
}

console.log("Using Database URL:", databaseUrl.replace(/:[^:@]+@/, ":***@"));
const sql = neon(databaseUrl);

async function run() {
  console.log("Seeding Site Instruction (SI)...");

  // 1. Request Type for SI
  await sql`
    INSERT INTO request_types (id, id_number, code, name_english, name_arabic, description, is_active, sort_order)
    VALUES (gen_random_uuid(), 11, 'SI', 'Site Instruction', 'تعليمات الموقع', 'Consultant issued site instruction', true, 11)
    ON CONFLICT (id_number) DO UPDATE SET
      code = 'SI',
      name_english = EXCLUDED.name_english,
      name_arabic = EXCLUDED.name_arabic,
      description = EXCLUDED.description,
      is_active = true;
  `;
  console.log("SI request type seeded");

  // 2. Workflow steps for SI
  await sql`
    INSERT INTO workflow_steps (id, request_type_id, step_name, role_required, sequence_order)
    VALUES 
    (1101, 11, 'Consultant Preparation', 2, 1),
    (1102, 11, 'Consultant PM Approval', 7, 2),
    (1103, 11, 'Issued to Contractor', 1, 3)
    ON CONFLICT (id) DO UPDATE SET
      step_name = EXCLUDED.step_name,
      role_required = EXCLUDED.role_required,
      sequence_order = EXCLUDED.sequence_order;
  `;
  console.log("SI steps seeded");

  // 3. Workflow transitions for SI
  await sql`
    INSERT INTO workflow_transitions (transition_id, request_type_id, from_step_id, to_step_id, allowed_status)
    VALUES
    (1101, 11, 1101, 1102, 'Submitted'),
    (1102, 11, 1102, 1103, 'Approved')
    ON CONFLICT (transition_id) DO UPDATE SET
      from_step_id = EXCLUDED.from_step_id,
      to_step_id = EXCLUDED.to_step_id,
      allowed_status = EXCLUDED.allowed_status;
  `;
  console.log("SI transitions seeded");

  console.log("Site Instruction (SI) seeded successfully!");
}

run().catch(console.error);
