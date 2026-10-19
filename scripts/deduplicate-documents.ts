import { db } from "../server/db";
import { documents, requestDocuments, requestAttachments, requestRevisions, requests } from "../shared/schema";
import { sql, and, eq, isNotNull } from "drizzle-orm";

async function main() {
  console.log("🔍 [PRO CLEANUP] Starting comprehensive cross-table deduplication...");

  try {
    // --- 1. Cleanup 'documents' table ---
    console.log("\n📁 Scanning 'documents' (Project Storage) table...");
    const allDocs = await db.select().from(documents).where(isNotNull(documents.fileName));
    console.log(`Found ${allDocs.length} project documents.`);

    const projectSeen = new Map<string, string>();
    const projectDuplicates: { idToRemove: string, idToKeep: string, fileName: string }[] = [];

    const sortedProjectDocs = [...allDocs].sort((a, b) => {
      const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
      const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return b.id.localeCompare(a.id);
    });

    for (const doc of sortedProjectDocs) {
      const key = `${doc.projectId}:${doc.folderId || "root"}:${doc.fileName?.toLowerCase()}`;
      if (projectSeen.has(key)) {
        projectDuplicates.push({ idToRemove: doc.id, idToKeep: projectSeen.get(key)!, fileName: doc.fileName! });
      } else {
        projectSeen.set(key, doc.id);
      }
    }

    for (const { idToRemove, idToKeep, fileName } of projectDuplicates) {
        console.log(`  🗑️ Removing duplicate in projects: "${fileName}"`);
        await db.update(requestDocuments).set({ projectDocumentId: idToKeep }).where(eq(requestDocuments.projectDocumentId, idToRemove));
        await db.delete(documents).where(eq(documents.id, idToRemove));
    }

    // --- 2. Cleanup 'request_documents' table ---
    console.log("\n📝 Scanning 'request_documents' (Contractor attachments)...");
    const rds = await db.select({
        id: requestDocuments.id,
        fileName: requestDocuments.fileName,
        fileUrl: requestDocuments.fileUrl,
        projectId: requests.projectId
    })
    .from(requestDocuments)
    .innerJoin(requestRevisions, eq(requestDocuments.revisionId, requestRevisions.id))
    .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
    .where(isNotNull(requestDocuments.fileName));

    const rdSeen = new Map<string, string>();
    const rdDuplicates: string[] = [];

    for (const rd of rds.sort((a,b) => b.id.localeCompare(a.id))) {
      const key = `${rd.projectId}:${rd.fileName?.toLowerCase()}:${rd.fileUrl || "none"}`;
      if (rdSeen.has(key)) rdDuplicates.push(rd.id);
      else rdSeen.set(key, rd.id);
    }

    if (rdDuplicates.length > 0) {
        console.log(`  🗑️ Removing ${rdDuplicates.length} duplicates in request_documents`);
        for (let i = 0; i < rdDuplicates.length; i += 100) {
            await db.delete(requestDocuments).where(sql`${requestDocuments.id} IN ${rdDuplicates.slice(i, i+100)}`);
        }
    }

    // --- 3. Cleanup 'request_attachments' table ---
    console.log("\n🖋️ Scanning 'request_attachments' (Consultant attachments)...");
    const ras = await db.select({
        id: requestAttachments.id,
        fileName: requestAttachments.fileName,
        fileUrl: requestAttachments.fileUrl,
        projectId: requests.projectId
    })
    .from(requestAttachments)
    .innerJoin(requestRevisions, eq(requestAttachments.revisionId, requestRevisions.id))
    .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
    .where(isNotNull(requestAttachments.fileName));

    const raSeen = new Map<string, string>();
    const raDuplicates: string[] = [];

    for (const ra of ras.sort((a,b) => b.id.localeCompare(a.id))) {
      const key = `${ra.projectId}:${ra.fileName?.toLowerCase()}:${ra.fileUrl || "none"}`;
      if (raSeen.has(key)) raDuplicates.push(ra.id);
      else raSeen.set(key, ra.id);
    }

    if (raDuplicates.length > 0) {
        console.log(`  🗑️ Removing ${raDuplicates.length} duplicates in request_attachments`);
        for (let i = 0; i < raDuplicates.length; i += 100) {
            await db.delete(requestAttachments).where(sql`${requestAttachments.id} IN ${raDuplicates.slice(i, i+100)}`);
        }
    }

    console.log("\n✨ All Database Cleanup Complete!");
    
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    process.exit(1);
  }
  process.exit(0);
}

main();
