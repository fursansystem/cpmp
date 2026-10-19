import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function migratePhonePhotoSignature() {
  console.log("Starting migration: Moving phone, photo, signature from team_members to users...");

  try {
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS photo text,
      ADD COLUMN IF NOT EXISTS signature text
    `);
    console.log("Added phone, photo, signature columns to users table.");

    const usersWithLinks = await db.execute(sql`
      SELECT u.id as user_id, 
             COUNT(utm.team_member_id) as link_count,
             array_agg(utm.team_member_id) as team_member_ids
      FROM users u
      LEFT JOIN user_team_members utm ON u.id = utm.user_id
      GROUP BY u.id
    `);

    console.log(`Found ${usersWithLinks.rows.length} users to process.`);

    for (const row of usersWithLinks.rows) {
      const userId = row.user_id as string;
      const linkCount = Number(row.link_count);
      const teamMemberIds = row.team_member_ids as string[] | null;

      if (linkCount === 1 && teamMemberIds && teamMemberIds[0]) {
        const teamMemberId = teamMemberIds[0];
        
        const teamMemberData = await db.execute(sql`
          SELECT phone, photo, signature FROM team_members WHERE id = ${teamMemberId}
        `);

        if (teamMemberData.rows.length > 0) {
          const { phone, photo, signature } = teamMemberData.rows[0] as any;
          
          if (phone || photo || signature) {
            await db.execute(sql`
              UPDATE users 
              SET phone = ${phone}, photo = ${photo}, signature = ${signature}
              WHERE id = ${userId}
            `);
            console.log(`Migrated data for user ${userId} from team member ${teamMemberId}`);
          }
        }
      } else if (linkCount > 1) {
        console.log(`User ${userId} has ${linkCount} links - data will not be migrated (multiple links)`);
      }
    }

    const columnExists = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'team_members' AND column_name = 'phone'
    `);

    if (columnExists.rows.length > 0) {
      await db.execute(sql`
        ALTER TABLE team_members 
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS photo,
        DROP COLUMN IF EXISTS signature
      `);
      console.log("Removed phone, photo, signature columns from team_members table.");
    }

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

migratePhonePhotoSignature()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
