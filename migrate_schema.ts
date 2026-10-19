import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Starting DB migration logic...");
  
  // 1. Create the table manually
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS request_type_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      request_type_id VARCHAR NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
      prefix VARCHAR(20) NOT NULL,
      next_number INTEGER NOT NULL DEFAULT 1,
      requires_approval BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    
    CREATE UNIQUE INDEX IF NOT EXISTS project_request_type_idx 
    ON request_type_settings(project_id, request_type_id);
  `);
  
  console.log("Created table request_type_settings (if not exists).");
  
  // 2. Fetch required request types
  const reqTypes = await db.execute(sql`SELECT id, code FROM request_types;`);
  const typeMap = reqTypes.rows.reduce((acc, cur) => { acc[cur.code as string] = cur.id as string; return acc; }, {} as Record<string, string>);
  
  const oldSettings = await db.execute(sql`SELECT * FROM project_form_settings;`);
  console.log(`Found ${oldSettings.rows.length} old project form settings. Migrating data...`);
  
  for (const row of oldSettings.rows) {
    const projectId = row.project_id;
    
    const migrateType = async (code: string, prefixCol: string, numCol: string, reqAppCol: string, enCol: string) => {
      const typeId = typeMap[code];
      if (!typeId) return;
      
      const prefix = row[prefixCol] || code;
      const nextNum = row[numCol] || 1;
      const requiresApproval = row[reqAppCol] !== undefined ? row[reqAppCol] : true;
      const enabled = row[enCol] !== undefined ? row[enCol] : true;
      
      await db.execute(sql`
        INSERT INTO request_type_settings (project_id, request_type_id, prefix, next_number, requires_approval, enabled)
        VALUES (${projectId}, ${typeId}, ${prefix}, ${nextNum}, ${requiresApproval}, ${enabled})
        ON CONFLICT (project_id, request_type_id) DO UPDATE 
        SET prefix = EXCLUDED.prefix, next_number = EXCLUDED.next_number;
      `);
    };
    
    await migrateType('WAR', 'work_acceptance_prefix', 'work_acceptance_next_number', 'work_acceptance_requires_approval', 'work_acceptance_enabled');
    await migrateType('MAR', 'material_approval_prefix', 'material_approval_next_number', 'material_approval_requires_approval', 'material_approval_enabled');
    await migrateType('DN', 'delivery_prefix', 'delivery_next_number', 'non_existent_approval', 'non_existent_enabled');
    await migrateType('WIR', 'wir_prefix', 'wir_next_number', 'non_existent_approval', 'non_existent_enabled');
    await migrateType('MIR', 'mir_prefix', 'mir_next_number', 'non_existent_approval', 'non_existent_enabled');
  }
  
  console.log("Migration completed.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
