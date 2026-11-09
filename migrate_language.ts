import { db } from "./server/db";
import { sql } from "drizzle-orm";

// Each user picks their display language, and it follows them across devices. Direction is derived from
// it, so there is no separate column for that. Safe to run again: the column and the constraint are
// only added when missing, and existing rows default to Arabic.
// Run: npx tsx --env-file=.env migrate_language.ts

async function main() {
  console.log("Adding users.language…");

  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar';`);

  // ADD CONSTRAINT has no IF NOT EXISTS, so check the catalogue first
  const [{ exists }] = (await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_language_check'
    ) AS exists;
  `)).rows as { exists: boolean }[];

  if (!exists) {
    await db.execute(sql`ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('ar', 'en'));`);
    console.log("  added users_language_check");
  } else {
    console.log("  users_language_check already present");
  }

  const [{ count }] = (await db.execute(sql`SELECT count(*)::int AS count FROM users WHERE language = 'ar';`)).rows as { count: number }[];
  console.log(`  ${count} user(s) now on Arabic`);
}

main().then(() => {
  console.log("Migration finished successfully.");
  process.exit(0);
}).catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
