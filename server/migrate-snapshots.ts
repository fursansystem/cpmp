import { db } from "./db";
import { requests, requestRevisions, projects, organizations, workLevels, workListActivities, workListChapters, workListDivisions } from "../shared/schema";
import { eq } from "drizzle-orm";

async function runMigration() {
    console.log("Starting migration...");

    try {
        // Migrate requests
        const allRequests = await db.select().from(requests);
        console.log(`Found ${allRequests.length} requests to migrate.`);

        for (const req of allRequests) {
            let projectName = null, contractorName = null, consultantName = null;

            if (req.projectId) {
                const [proj] = await db.select().from(projects).where(eq(projects.id, req.projectId));
                if (proj) projectName = proj.name;
            }
            if (req.contractorId) {
                const [org] = await db.select().from(organizations).where(eq(organizations.id, req.contractorId));
                if (org) contractorName = org.name;
            }
            if (req.consultantId) {
                const [org] = await db.select().from(organizations).where(eq(organizations.id, req.consultantId));
                if (org) consultantName = org.name;
            }

            if (projectName !== null || contractorName !== null || consultantName !== null) {
                await db.update(requests).set({
                    projectName: projectName,
                    contractorName: contractorName,
                    consultantName: consultantName
                }).where(eq(requests.id, req.id));
            }
        }
        console.log("Requests migration completed.");

        // Migrate request revisions
        const allRevisions = await db.select().from(requestRevisions);
        console.log(`Found ${allRevisions.length} revisions to migrate.`);

        for (const rev of allRevisions) {
            let activityCode = null, activityName = null, chapterName = null, divisionName = null, workLevelName = null;

            if (rev.workLevelId) {
                const [wl] = await db.select().from(workLevels).where(eq(workLevels.id, rev.workLevelId));
                if (wl) workLevelName = wl.nameEnglish;
            }

            if (rev.workListActivityId) {
                const [act] = await db.select().from(workListActivities).where(eq(workListActivities.id, rev.workListActivityId));
                if (act) {
                    activityCode = act.code;
                    activityName = act.nameEnglish;
                    if (act.chapterId) {
                        const [chap] = await db.select().from(workListChapters).where(eq(workListChapters.id, act.chapterId));
                        if (chap) {
                            chapterName = chap.nameEnglish;
                            if (chap.divisionId) {
                                const [div] = await db.select().from(workListDivisions).where(eq(workListDivisions.id, chap.divisionId));
                                if (div) divisionName = div.nameEnglish;
                            }
                        }
                    }
                }
            }

            if (activityCode !== null || activityName !== null || chapterName !== null || divisionName !== null || workLevelName !== null) {
                await db.update(requestRevisions).set({
                    activityCode,
                    activityName,
                    chapterName,
                    divisionName,
                    workLevelName,
                }).where(eq(requestRevisions.id, rev.id));
            }
        }
        console.log("Revisions migration completed.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

runMigration();
