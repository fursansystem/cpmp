import { storage } from "./storage";
import type { Request, TeamMember, WorkflowStep } from "@shared/schema";

const managerTitles = ["project manager", "مدير مشروع"];

export function isProjectManagerPosition(position: string | null | undefined): boolean {
  const pos = (position || "").toLowerCase();
  return managerTitles.some((title) => pos.includes(title));
}

// Steps only a manager decides ("Contractor Manager Approval", "Consultant PM Review", ...)
export function isManagerOnlyStep(step: WorkflowStep): boolean {
  return /manager|\bpm\b/i.test(step.stepName);
}

function stepOrganizationId(request: Pick<Request, "contractorId" | "consultantId">, step: WorkflowStep) {
  if (step.stepName.includes("Contractor")) return request.contractorId;
  if (
    step.stepName.includes("Consultant") ||
    step.stepName === "Engineer Review" ||
    step.stepName === "Site Inspection" ||
    step.stepName === "Final Approval"
  ) {
    return request.consultantId;
  }
  return undefined;
}

type PositionRef = { purposeId?: string | null };

// The rule itself, on data already in hand: may this team member act on a request at this step?
// The project manager of the organization that owns the step, plus members whose position's purpose
// matches one of the request's purposes. Steps owned by neither party fall back to purpose only.
export function memberCanActAtStep(
  member: Pick<TeamMember, "position" | "organizationId">,
  request: Pick<Request, "contractorId" | "consultantId">,
  step: WorkflowStep,
  requestPurposeIds: ReadonlySet<string>,
  positionByTitle: ReadonlyMap<string, PositionRef>,
): boolean {
  const position = member.position ? positionByTitle.get(member.position) : undefined;
  const matchesPurpose = !!position?.purposeId && requestPurposeIds.has(position.purposeId);

  const orgId = stepOrganizationId(request, step);
  if (orgId === undefined) return matchesPurpose;
  if (!orgId || member.organizationId !== orgId) return false;
  return isProjectManagerPosition(member.position) || matchesPurpose;
}

// The same rule narrowed the way step notifications narrow it: a manager-only step is the project
// manager's alone. This is what "waiting on me" means on the home page.
export function memberIsNotifiedAtStep(
  member: Pick<TeamMember, "position" | "organizationId">,
  request: Pick<Request, "contractorId" | "consultantId">,
  step: WorkflowStep,
  requestPurposeIds: ReadonlySet<string>,
  positionByTitle: ReadonlyMap<string, PositionRef>,
): boolean {
  if (!memberCanActAtStep(member, request, step, requestPurposeIds, positionByTitle)) return false;
  return !isManagerOnlyStep(step) || isProjectManagerPosition(member.position);
}

// Team members who can act on a request at a given workflow step (see memberCanActAtStep).
export async function getStepAuthorizedTeamMembers(
  request: Pick<Request, "contractorId" | "consultantId">,
  step: WorkflowStep,
  revisionId: string
): Promise<TeamMember[]> {
  const allPositions = await storage.getAllPositions();
  const positionByTitle = new Map(allPositions.map((p) => [p.titleEnglish, p]));

  const requestPurposes = await storage.getRequestPurposes(revisionId);
  const requestPurposeIds = new Set(requestPurposes.map((rp) => rp.purposeId));

  const orgId = stepOrganizationId(request, step);
  if (orgId !== undefined && !orgId) return [];
  const candidates = orgId === undefined ? await storage.getAllTeamMembers() : await storage.getTeamMembersByOrganization(orgId);
  return candidates.filter((tm) => memberCanActAtStep(tm, request, step, requestPurposeIds, positionByTitle));
}

// Users who should be told a request is waiting for them at this step. Manager-only
// steps go to the project manager alone, so the rest of the team is not distracted.
export async function getStepAuthorizedUserIds(
  request: Pick<Request, "contractorId" | "consultantId">,
  step: WorkflowStep,
  revisionId: string,
  excludeUserId?: string
): Promise<string[]> {
  let members = await getStepAuthorizedTeamMembers(request, step, revisionId);
  if (isManagerOnlyStep(step)) {
    members = members.filter((tm) => isProjectManagerPosition(tm.position));
  }

  const userIds = new Set<string>();
  for (const tm of members) {
    const tmUsers = await storage.getTeamMemberUsers(tm.id);
    for (const tmUser of tmUsers) {
      if (tmUser.userId !== excludeUserId) userIds.add(tmUser.userId);
    }
  }
  return Array.from(userIds);
}
