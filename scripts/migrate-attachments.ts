import { db } from "../server/db";
import { requestAttachments } from "../shared/schema";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { isNotNull, isNull, and, eq } from "drizzle-orm";
import { randomUUID } from 'crypto';

const R2_ENDPOINT = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : 'https://dummy.r2.cloudflarestorage.com';
const R2_BUCKET = process.env.R2_BUCKET_NAME || '';

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'dummy',
  },
  forcePathStyle: true,
});

async function main() {
  console.log("Starting migration of consultant attachments to R2...");

  // Find attachments that have fileData but no fileUrl
  const attachments = await db.select().from(requestAttachments).where(
    and(
      isNotNull(requestAttachments.fileData),
      isNull(requestAttachments.fileUrl)
    )
  );

  console.log(`Found ${attachments.length} attachments to migrate.`);

  let successCount = 0;
  let failCount = 0;

  for (const att of attachments) {
    if (!att.fileData) continue;
    
    console.log(`[ ] Migrating attachment ${att.id} (${att.fileName})...`);

    // Extract base64 data
    let base64Data = att.fileData;
    let buffer: Buffer;
    let contentType = att.fileType || 'application/octet-stream';

    try {
      if (base64Data.startsWith('data:')) {
        const matches = base64Data.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          contentType = matches[1];
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          // If regex doesn't match perfectly but it's data URI
          const parts = base64Data.split(',');
          if (parts.length > 1) {
             const meta = parts[0].split(';')[0].replace('data:', '');
             if (meta) contentType = meta;
             buffer = Buffer.from(parts[1], 'base64');
          } else {
             throw new Error("Invalid data URI format");
          }
        }
      } else {
        if (base64Data.startsWith('http') || base64Data.startsWith('/images/')) {
             console.log(`[!] Skipping ${att.id}, fileData seems to be already a URL: ${base64Data}`);
             continue;
        }
        buffer = Buffer.from(base64Data, 'base64');
      }

      // Generate a unique object path in the 'images' folder
      const extension = att.fileName.split('.').pop() || 'bin';
      const fileKey = randomUUID() + '.' + extension;
      const objectPath = `images/${fileKey}`;

      console.log(`    Uploading to ${R2_ENDPOINT}/${R2_BUCKET}/${objectPath} ...`);
      // Upload to R2
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectPath,
        Body: buffer,
        ContentType: contentType,
      }));

      console.log(`    Updating database record for ${att.id} ...`);
      // Update the database record
      await db.update(requestAttachments)
        .set({
          fileUrl: objectPath,
          fileSize: buffer.length,
          // You can set fileData to null here if you want to free up DB space immediately:
          fileData: null 
        })
        .where(eq(requestAttachments.id, att.id));
        
      console.log(`✅ Successfully migrated ${att.id} -> ${objectPath}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to migrate ${att.id}:`, error);
      failCount++;
    }
  }

  console.log(`\nMigration complete. Successfully migrated: ${successCount}, Failed: ${failCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
