// Which requests a person may see. One definition, used by the request list and by the home summary,
// so a count on the home page can never include a request the list would hide.
//
// The clauses assume the query selects from `requests` left-joined to `requestRevisions` on the
// request's current revision.
import { eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { requests, requestRevisions, requestPurposes, type RequestType } from "@shared/schema";
import type { PermissionUser } from "@shared/permissions";
import { storage } from "./storage";

export async function requestVisibilityClauses(user: PermissionUser, allTypes: RequestType[]): Promise<SQL[]> {
  const clauses: SQL[] = [];

  // The viewer's linked team members and the purposes of their positions
  const allUserTeamMembers = await storage.getAllUserTeamMembers();
  const userTeamMemberIds = allUserTeamMembers.filter((utm) => utm.userId === user.id).map((utm) => utm.teamMemberId);
  const teamMembers = await storage.getAllTeamMembers();
  const userTeamMembersList = teamMembers.filter((tm) => userTeamMemberIds.includes(tm.id));

  const allPositions = await storage.getAllPositions();
  const userPurposeIds = new Set<string>();
  let userHasNoPurpose = false;
  for (const tm of userTeamMembersList) {
    if (!tm.position) continue;
    const position = allPositions.find((p) => p.titleEnglish === tm.position);
    if (position?.purposeId) userPurposeIds.add(position.purposeId);
    // A position with no purpose assigned sees every purpose
    else userHasNoPurpose = true;
  }

  const isAdmin = user.role === "super_admin" || user.role === "developer_admin" || user.role === "org_admin";

  // By purpose: their own requests, requests with no purpose, and requests sharing one of their purposes
  if (!isAdmin && !userHasNoPurpose) {
    const purposeIdsArr = Array.from(userPurposeIds);
    const matchPurposeCond = purposeIdsArr.length > 0
      ? sql`exists (
          select 1 from ${requestPurposes} rp
          where rp.revision_id = ${requestRevisions.id}
          and rp.purpose_id in (${sql.join(purposeIdsArr.map((id) => sql`${id}`), sql`, `)})
        )`
      : sql`false`;

    clauses.push(
      or(
        eq(requests.createdBy, user.id),
        sql`not exists (
          select 1 from ${requestPurposes} rp
          where rp.revision_id = ${requestRevisions.id}
        )`,
        matchPurposeCond,
      ) as SQL,
    );
  }

  // NCR / RNCR: the contractor does not see an NCR before the consultant has decided on it, and the
  // consultant does not see the contractor's reply while it is still being prepared.
  const isGlobalAdmin = user.role === "super_admin" || user.role === "developer_admin";
  if (!isGlobalAdmin) {
    const ncrTypeId = allTypes.find((t) => t.code === "NCR")?.id;
    const rncrTypeId = allTypes.find((t) => t.code === "RNCR")?.id;
    const userOrgId = user.organizationId;
    const userTmOrgIds = userTeamMembersList.map((tm) => tm.organizationId).filter((id): id is string => !!id);
    const contractorConds: SQL[] = [];
    if (userOrgId) contractorConds.push(eq(requests.contractorId, userOrgId));
    if (userTmOrgIds.length > 0) contractorConds.push(inArray(requests.contractorId, userTmOrgIds));
    const isContractorSql = contractorConds.length > 0 ? or(...contractorConds) : sql`false`;

    if (ncrTypeId) {
      clauses.push(
        sql`NOT (${requests.requestTypeId} = ${ncrTypeId} AND ${isContractorSql} AND ${requestRevisions.approvalStatusCode} IS NULL)`,
      );
    }
    if (rncrTypeId) {
      clauses.push(
        sql`NOT (${requests.requestTypeId} = ${rncrTypeId} AND NOT ${isContractorSql} AND ${requestRevisions.currentStepId} IS NOT NULL AND ${requestRevisions.currentStepId} < 1003)`,
      );
    }
  }

  return clauses;
}
