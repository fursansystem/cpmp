import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { passport } from "./app";
import { notificationWss, broadcastActivityUpdate } from "./websocket";
import { notificationService } from "./notification-service";
import { insertNotificationSchema } from "@shared/schema";
import {
  insertProjectSchema, updateProjectSchema,
  insertOrganizationSchema, updateOrganizationSchema,
  insertTaskSchema, updateTaskSchema,
  insertTeamMemberSchema, updateTeamMemberSchema,
  insertDocumentSchema, insertActivitySchema, updateActivitySchema,
  insertWorkLocationSchema, updateWorkLocationSchema,
  insertProjectFormSettingsSchema, updateProjectFormSettingsSchema,
  insertRequestTypeSettingsSchema, updateRequestTypeSettingsSchema,
  insertWorkListDivisionSchema,
  insertWorkListChapterSchema, updateWorkListChapterSchema,
  insertWorkListActivitySchema, updateWorkListActivitySchema,
  insertChecklistItemSchema, updateChecklistItemSchema,
  insertWorkLevelSchema, updateWorkLevelSchema,
  insertUserSchema, updateUserSchema, updatePasswordSchema,
  forgotPasswordSchema, resetPasswordSchema,
  createProjectInvitationSchema, respondToProjectInvitationSchema, acceptOrganizationInvitationSchema,
  type OrganizationInvitation, type ProjectInvitationRole,
  insertPositionSchema, updatePositionSchema,
  insertPurposeSchema, updatePurposeSchema,
  insertRequestTypeSchema, updateRequestTypeSchema,
  insertProjectFolderSchema, updateProjectFolderSchema, updateDocumentSchema,
  insertDeliverySchema, updateDeliverySchema, insertDeliveryItemSchema, updateDeliveryItemSchema, insertRequestDeliverySchema,
  insertRequestSupplierSchema, insertRequestMaterialSchema,
  insertMaterialSchema, updateMaterialSchema, insertSupplierSchema, updateSupplierSchema, insertMaterialSupplierSchema, updateMaterialSupplierSchema,
  insertSupplierAttachmentSchema, insertMaterialAttachmentSchema,
  insertSnagListSchema, updateSnagListSchema, insertSnagItemSchema, updateSnagItemSchema,
  insertRfqSchema, updateRfqSchema, insertRfqItemSchema, updateRfqItemSchema, insertRfqSupplierSchema, updateRfqSupplierSchema,
  insertQuotationSchema, updateQuotationSchema, insertQuotationItemSchema, updateQuotationItemSchema,
  createPoReceiptSchema, createMaterialIssueSchema, rejectMaterialIssueSchema,
  createManualStockMovementSchema, createStockTransferSchema,
  insertWarehouseSchema, updateWarehouseSchema, stockDirection,
  insertPurchaseOrderSchema, updatePurchaseOrderSchema, insertPoItemSchema, updatePoItemSchema,
  type InsertDocument, type InsertActivity,
  type User, type Project, type RequestType
} from "@shared/schema";
import {
  ProjectPermissions,
  MemberPermissions,
  UserCreationPermissions,
  UserEditingPermissions,
  OrganizationPermissions,
  ProjectInvitationPermissions,
  InventoryPermissions,
  type PermissionUser,
  type PermissionEditUser,
  type UserRole,
  type DeveloperAdminContext
} from "@shared/permissions";
import { ZodError, z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import { inArray, eq, and, sql, or, isNotNull, isNull, desc, notInArray, gte, lte } from "drizzle-orm";
import { requests, requestRevisions, requestWorkLocations, requestPurposes, workListActivities, workListChapters, workListDivisions, workLevels, requestWorkLevels, projectFolders, requestDeliveries, deliveries, deliveryItems, suppliers, requestSuppliers, materials, documents, requestDocuments, requestAttachments, requestTypes, users, snagLists } from "@shared/schema";
import { Resend } from "resend";
import { registerProgressMatrixRoutes } from "./progress-matrix-routes";
import { registerPaymentsRoutes } from "./payments-routes";
import { applyApprovedWirRevision, countCertificatesByProject } from "./progress-matrix-service";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

// --- Cloudflare R2 Setup ---
const R2_ENDPOINT = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : 'https://dummy.r2.cloudflarestorage.com';
const R2_BUCKET = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'dummy',
  },
  forcePathStyle: true,
});

// Helper to get current user with organization info
async function getCurrentUserWithOrg(req: Request): Promise<{ user: PermissionUser; orgId: string | null; teamMemberIds: string[] } | null> {
  if (!req.isAuthenticated() || !req.user) return null;

  const user = req.user as User;
  let orgId: string | null = null;
  const teamMemberIds: string[] = [];

  // Get all linked team members from junction table
  const userTeamMembers = await storage.getUserTeamMembers(user.id);
  for (const utm of userTeamMembers) {
    teamMemberIds.push(utm.teamMemberId);
  }

  // Get organization from first team member (primary org for permissions)
  let orgSectorType: string | null = null;
  if (teamMemberIds.length > 0) {
    const teamMember = await storage.getTeamMember(teamMemberIds[0]);
    if (teamMember) {
      orgId = teamMember.organizationId || null;
    }
  }
  if (orgId) {
    const organization = await storage.getOrganization(orgId);
    orgSectorType = organization?.sectorType || null;
  }

  return {
    user: {
      id: user.id,
      role: user.role as UserRole,
      teamMemberId: teamMemberIds.length > 0 ? teamMemberIds[0] : null,
      organizationId: orgId,
      organizationSectorType: orgSectorType,
    },
    orgId,
    teamMemberIds,
  };
}

// Helper to get a user's organization from their team member links
// Single place that knows how this application sends email.
//
// Two things make a thin wrapper worth it. The Resend SDK reports API failures in the
// returned `error` field rather than by throwing, so a bare try/catch around `send()`
// silently swallows a rejected message. And the sender address must be on a domain
// verified with Resend: there is no usable default, so a missing EMAIL_FROM is a
// configuration error to report, not something to paper over with a placeholder.
async function sendTransactionalEmail(message: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { ok: false, error: "Email is not configured on the server (RESEND_API_KEY is missing)." };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    return {
      ok: false,
      error: "Email is not configured on the server: EMAIL_FROM is missing. It must be an address on a domain verified with Resend.",
    };
  }

  try {
    const { error } = await new Resend(resendApiKey).emails.send({ from, ...message });
    if (error) {
      console.error("Email send rejected by Resend:", error);
      return { ok: false, error: error.message || "The email provider rejected the message." };
    }
    return { ok: true };
  } catch (sendError: any) {
    console.error("Email send failed:", sendError);
    return { ok: false, error: sendError?.message || "The email could not be sent." };
  }
}

async function getUserOrganizationId(userId: string): Promise<string | null> {
  const userTeamMembers = await storage.getUserTeamMembers(userId);
  if (userTeamMembers.length > 0) {
    const teamMember = await storage.getTeamMember(userTeamMembers[0].teamMemberId);
    if (teamMember) {
      return teamMember.organizationId || null;
    }
  }
  return null;
}

// Helper to get developer admin context (member IDs from projects they created)
// Developer admins can access:
// 1. Members assigned to tasks in their projects
// 2. Members belonging to organizations of their projects (so they can assign them)
async function getDeveloperAdminContext(userId: string): Promise<DeveloperAdminContext> {
  const allProjects = await storage.getAllProjects();
  const userProjects = allProjects.filter(p => p.creatorId === userId);

  // Get organization IDs from user's projects
  const projectOrgIds = new Set<string>();
  for (const project of userProjects) {
    projectOrgIds.add(project.organizationId);
  }

  // Get all members and filter to those in relevant organizations
  const allMembers = await storage.getAllTeamMembers();
  const memberIdSet = new Set<string>();

  for (const member of allMembers) {
    // Include members in organizations connected to user's projects
    if (member.organizationId && projectOrgIds.has(member.organizationId)) {
      memberIdSet.add(member.id);
    }
  }

  // Also include members assigned to tasks in user's projects (even if no org)
  for (const project of userProjects) {
    const tasks = await storage.getTasksByProject(project.id);
    for (const task of tasks) {
      if (task.assignedTo) {
        memberIdSet.add(task.assignedTo);
      }
    }
  }

  return { allowedMemberIds: Array.from(memberIdSet) };
}

// Helper to infer current workflow step based on request status
function inferCurrentStep(
  steps: Array<{ id: number; requestTypeId: number; stepName: string; sequenceOrder: number }>,
  currentStatus: string,
  currentStepId?: number | null
) {
  console.log(`[inferCurrentStep] status='${currentStatus}', currentStepId=${currentStepId}, stepsCount=${steps.length}`);

  // 1. If we have an explicit currentStepId, try to find that specific step
  if (currentStepId != null) {
    const foundStep = steps.find(s => s.id === currentStepId);
    if (foundStep) {
      console.log(`[inferCurrentStep] Found step by explicit ID: ${foundStep.stepName} (${foundStep.id})`);
      return foundStep;
    }
    console.warn(`[inferCurrentStep] Step ID ${currentStepId} not found in this request type's workflow steps.`);
  }

  // 2. Try mapping status to step index
  const statusToStepMap: Record<string, number> = {
    'Draft': 0,
    'Submitted': 1,
    'Under Review': 2,
    'Review in Progress': 2,
    'Consultant Review': 2,
    'Requires Action': 0,
    'Approved': -2,
    'Closed': -1,
  };

  let stepIndex = statusToStepMap[currentStatus];

  // If status not in map, try to find a step that contains the status in its name
  if (stepIndex === undefined && steps.length > 0) {
    const matchingNameStep = steps.find(s =>
      s.stepName.toLowerCase().includes(currentStatus.toLowerCase())
    );
    if (matchingNameStep) {
      console.log(`[inferCurrentStep] Found step by status name match: ${matchingNameStep.stepName}`);
      return matchingNameStep;
    }
  }

  // Fallback to basic mapping or first/last step
  if (stepIndex !== undefined) {
    if (stepIndex < 0) {
      const targetStep = steps[steps.length + stepIndex] || (steps.length > 0 ? steps[steps.length - 1] : undefined);
      if (targetStep) {
        console.log(`[inferCurrentStep] Mapped to relative step index ${stepIndex}: ${targetStep.stepName}`);
        return targetStep;
      }
    } else {
      const targetStep = steps[stepIndex] || (steps.length > 0 ? steps[0] : undefined);
      if (targetStep) {
        console.log(`[inferCurrentStep] Mapped to absolute step index ${stepIndex}: ${targetStep.stepName}`);
        return targetStep;
      }
    }
  }

  // Final fallback: just return the first step if any exist
  if (steps.length > 0) {
    console.log(`[inferCurrentStep] Final fallback: returning first step: ${steps[0].stepName}`);
    return steps[0];
  }

  console.error(`[inferCurrentStep] Could not determine step. steps is empty.`);
  return undefined;
}

// Initialize default workflows for WIR and MIR if missing
async function initializeWorkflows(storage: IStorage) {
  try {
    const types = await storage.getAllRequestTypes();
    const wirType = types.find((t: RequestType) => t.code === 'WIR');
    const mirType = types.find((t: RequestType) => t.code === 'MIR');

    if (wirType) {
      const typeId = wirType.id_number;
      const wirSteps = await storage.getWorkflowSteps(typeId);
      if (wirSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding WIR workflow steps...`);
        const steps = [
          { id: 101, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 102, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 103, requestTypeId: typeId, stepName: "Contractor Manager Approval", roleRequired: 1, sequenceOrder: 3 },
          { id: 104, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 105, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 106, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 107, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 1001, requestTypeId: typeId, fromStepId: 101, toStepId: 102, allowedStatus: "Submitted" },
          { transitionId: 1002, requestTypeId: typeId, fromStepId: 102, toStepId: 103, allowedStatus: "Submitted" },
          { transitionId: 1003, requestTypeId: typeId, fromStepId: 103, toStepId: 104, allowedStatus: "Submitted" },
          { transitionId: 1004, requestTypeId: typeId, fromStepId: 104, toStepId: 105, allowedStatus: "Under Review" },
          { transitionId: 1005, requestTypeId: typeId, fromStepId: 105, toStepId: 106, allowedStatus: "Under Review" },
          { transitionId: 1006, requestTypeId: typeId, fromStepId: 106, toStepId: 107, allowedStatus: "Under Review" },
          { transitionId: 1007, requestTypeId: typeId, fromStepId: 104, toStepId: 101, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }

    if (mirType) {
      const typeId = mirType.id_number;
      const mirSteps = await storage.getWorkflowSteps(typeId);
      if (mirSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding MIR workflow steps and transitions...`);
        const steps = [
          { id: 201, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 202, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 203, requestTypeId: typeId, stepName: "Contractor Manager Approval", roleRequired: 1, sequenceOrder: 3 },
          { id: 204, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 205, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 206, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 207, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 2001, requestTypeId: typeId, fromStepId: 201, toStepId: 202, allowedStatus: "Submitted" },
          { transitionId: 2002, requestTypeId: typeId, fromStepId: 202, toStepId: 203, allowedStatus: "Submitted" },
          { transitionId: 2003, requestTypeId: typeId, fromStepId: 203, toStepId: 204, allowedStatus: "Submitted" },
          { transitionId: 2004, requestTypeId: typeId, fromStepId: 204, toStepId: 205, allowedStatus: "Under Review" },
          { transitionId: 2005, requestTypeId: typeId, fromStepId: 205, toStepId: 206, allowedStatus: "Under Review" },
          { transitionId: 2006, requestTypeId: typeId, fromStepId: 206, toStepId: 207, allowedStatus: "Under Review" },
          { transitionId: 2007, requestTypeId: typeId, fromStepId: 204, toStepId: 201, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }

    const ssrType = types.find((t: RequestType) => t.code === 'SSR');
    if (ssrType) {
      const typeId = ssrType.id_number;
      const ssrSteps = await storage.getWorkflowSteps(typeId);
      if (ssrSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding SSR workflow steps and transitions...`);
        const steps = [
          { id: 301, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 302, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 303, requestTypeId: typeId, stepName: "Contractor Manager Approval", roleRequired: 1, sequenceOrder: 3 },
          { id: 304, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 305, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 306, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 307, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 3001, requestTypeId: typeId, fromStepId: 301, toStepId: 302, allowedStatus: "Submitted" },
          { transitionId: 3002, requestTypeId: typeId, fromStepId: 302, toStepId: 303, allowedStatus: "Submitted" },
          { transitionId: 3003, requestTypeId: typeId, fromStepId: 303, toStepId: 304, allowedStatus: "Submitted" },
          { transitionId: 3004, requestTypeId: typeId, fromStepId: 304, toStepId: 305, allowedStatus: "Under Review" },
          { transitionId: 3005, requestTypeId: typeId, fromStepId: 305, toStepId: 306, allowedStatus: "Under Review" },
          { transitionId: 3006, requestTypeId: typeId, fromStepId: 306, toStepId: 307, allowedStatus: "Under Review" },
          { transitionId: 3007, requestTypeId: typeId, fromStepId: 304, toStepId: 301, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }

    const marType = types.find((t: RequestType) => t.code === 'MAR');
    if (marType) {
      const typeId = marType.id_number;
      const marSteps = await storage.getWorkflowSteps(typeId);
      if (marSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding MAR workflow steps and transitions...`);
        const steps = [
          { id: 501, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 502, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 503, requestTypeId: typeId, stepName: "Contractor PM Approval", roleRequired: 2, sequenceOrder: 3 },
          { id: 504, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 505, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 506, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 507, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 5001, requestTypeId: typeId, fromStepId: 501, toStepId: 502, allowedStatus: "Submitted" },
          { transitionId: 5002, requestTypeId: typeId, fromStepId: 502, toStepId: 503, allowedStatus: "Submitted" },
          { transitionId: 5003, requestTypeId: typeId, fromStepId: 503, toStepId: 504, allowedStatus: "Submitted" },
          { transitionId: 5004, requestTypeId: typeId, fromStepId: 504, toStepId: 505, allowedStatus: "Under Review" },
          { transitionId: 5005, requestTypeId: typeId, fromStepId: 505, toStepId: 506, allowedStatus: "Under Review" },
          { transitionId: 5006, requestTypeId: typeId, fromStepId: 506, toStepId: 507, allowedStatus: "Under Review" },
          { transitionId: 5007, requestTypeId: typeId, fromStepId: 504, toStepId: 501, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }

    const dsrType = types.find((t: RequestType) => t.code === 'DSR');
    if (dsrType) {
      const typeId = dsrType.id_number;
      const dsrSteps = await storage.getWorkflowSteps(typeId);
      if (dsrSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding DSR workflow steps and transitions...`);
        const steps = [
          { id: 601, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 602, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 603, requestTypeId: typeId, stepName: "Contractor PM Approval", roleRequired: 2, sequenceOrder: 3 },
          { id: 604, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 605, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 606, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 607, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 6001, requestTypeId: typeId, fromStepId: 601, toStepId: 602, allowedStatus: "Submitted" },
          { transitionId: 6002, requestTypeId: typeId, fromStepId: 602, toStepId: 603, allowedStatus: "Submitted" },
          { transitionId: 6003, requestTypeId: typeId, fromStepId: 603, toStepId: 604, allowedStatus: "Submitted" },
          { transitionId: 6004, requestTypeId: typeId, fromStepId: 604, toStepId: 605, allowedStatus: "Under Review" },
          { transitionId: 6005, requestTypeId: typeId, fromStepId: 605, toStepId: 606, allowedStatus: "Under Review" },
          { transitionId: 6006, requestTypeId: typeId, fromStepId: 606, toStepId: 607, allowedStatus: "Under Review" },
          { transitionId: 6007, requestTypeId: typeId, fromStepId: 604, toStepId: 601, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }

    const sdType = types.find((t: RequestType) => t.code === 'SD');
    if (sdType) {
      const typeId = sdType.id_number;
      const sdSteps = await storage.getWorkflowSteps(typeId);
      if (sdSteps.length === 0) {
        console.log(`[WorkflowInit] Seeding SD workflow steps and transitions...`);
        const steps = [
          { id: 701, requestTypeId: typeId, stepName: "Draft", roleRequired: 1, sequenceOrder: 1 },
          { id: 702, requestTypeId: typeId, stepName: "Contractor Team Approval", roleRequired: 1, sequenceOrder: 2 },
          { id: 703, requestTypeId: typeId, stepName: "Contractor PM Approval", roleRequired: 2, sequenceOrder: 3 },
          { id: 704, requestTypeId: typeId, stepName: "Engineer Review", roleRequired: 3, sequenceOrder: 4 },
          { id: 705, requestTypeId: typeId, stepName: "Consultant Team Approval", roleRequired: 3, sequenceOrder: 5 },
          { id: 706, requestTypeId: typeId, stepName: "Consultant PM Review", roleRequired: 3, sequenceOrder: 6 },
          { id: 707, requestTypeId: typeId, stepName: "Consultant Manager Approval", roleRequired: 3, sequenceOrder: 7 },
        ];

        for (const s of steps) {
          const existing = await storage.getWorkflowStep(s.id);
          if (!existing) await (storage as any).createWorkflowStep?.(s);
        }

        const transitions = [
          { transitionId: 7001, requestTypeId: typeId, fromStepId: 701, toStepId: 702, allowedStatus: "Submitted" },
          { transitionId: 7002, requestTypeId: typeId, fromStepId: 702, toStepId: 703, allowedStatus: "Submitted" },
          { transitionId: 7003, requestTypeId: typeId, fromStepId: 703, toStepId: 704, allowedStatus: "Submitted" },
          { transitionId: 7004, requestTypeId: typeId, fromStepId: 704, toStepId: 705, allowedStatus: "Under Review" },
          { transitionId: 7005, requestTypeId: typeId, fromStepId: 705, toStepId: 706, allowedStatus: "Under Review" },
          { transitionId: 7006, requestTypeId: typeId, fromStepId: 706, toStepId: 707, allowedStatus: "Under Review" },
          { transitionId: 7007, requestTypeId: typeId, fromStepId: 704, toStepId: 701, allowedStatus: "Requires Action" },
        ];

        for (const t of transitions) {
          try { await (storage as any).createWorkflowTransition?.(t); } catch (e) { }
        }
      }
    }
  } catch (err) {
    console.error(`[WorkflowInit] Failed to initialize workflows:`, err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize workflows on startup
  initializeWorkflows(storage);

  // Error handling helper
  const handleError = (res: any, error: unknown) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }

    if (error instanceof Error) {
      // Handle database constraint violations or manual association checks
      if (error.message.includes("foreign key") ||
        error.message.includes("violates") ||
        error.message.includes("associated with") ||
        error.message.includes("مربوطة")) {
        return res.status(409).json({
          error: "Cannot complete operation due to existing dependencies",
          details: error.message
        });
      }

      // Handle not found errors
      if (error.message.includes("not found") || error.message.includes("غير موجود")) {
        return res.status(404).json({ error: error.message });
      }

      // Business-rule rejections raised deliberately in the storage layer. These are the
      // caller's fault, not the server's, so they must not surface as 500s.
      if (
        error.message.includes("تعارض") ||
        error.message.includes("لا يمكن") ||
        error.message.includes("يجب") ||
        error.message.includes("مطلوب") ||
        error.message.includes("لا ينتمي")
      ) {
        return res.status(400).json({ error: error.message });
      }

      // Handle specific user errors
      if (error.message.includes("Organization not found") ||
        error.message.includes("Project not found") ||
        error.message.includes("Team member not found")) {
        return res.status(400).json({ error: error.message });
      }

      // All other errors are internal server errors
      return res.status(500).json({ error: "Internal server error", details: error.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  };

  // Progress Matrix & Payment Certificates (مصفوفة الإنجاز والمستخلصات)
  registerProgressMatrixRoutes(app, { getCurrentUserWithOrg, handleError });
  registerPaymentsRoutes(app, { getCurrentUserWithOrg, handleError });

  app.post("/api/deliveries/bulk", async (req, res) => {
    try {
      // Support both { delivery, items } and { ...deliveryFields, items }
      const items = req.body.items;
      const deliveryData = req.body.delivery || { ...req.body };
      delete (deliveryData as any).items;

      const validatedDelivery = insertDeliverySchema.parse(deliveryData);
      const validatedItems = z.array(insertDeliveryItemSchema.omit({ deliveryId: true })).parse(items);

      // This path records a receipt that no purchase order stands behind, so it is gated
      // above ordinary receiving.
      const ctx = await getInventoryContext(req, validatedDelivery.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canReceiveWithoutPo) {
        return res.status(403).json({
          error: "الاستلام بدون أمر شراء يحتاج صلاحية أعلى. سجّل الاستلام من أمر الشراء المعتمد.",
        });
      }

      const result = await storage.createDeliveryWithItems(validatedDelivery, validatedItems);
      res.status(201).json(result);
    } catch (error) {
      console.error("[API] Bulk delivery error:", error);
      handleError(res, error);
    }
  });

  app.patch("/api/deliveries/:id", async (req, res) => {
    try {
      const items = req.body.items;
      const deliveryData = { ...req.body };
      delete deliveryData.items;

      const validatedDelivery = updateDeliverySchema.parse(deliveryData);
      // Items are optional in PATCH, if provided we update them
      if (items && Array.isArray(items)) {
        const result = await storage.updateDeliveryWithItems(req.params.id, validatedDelivery, items);
        res.json(result);
      } else {
        const result = await storage.updateDelivery(req.params.id, validatedDelivery);
        res.json(result);
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  // Helper function to enrich projects with organization names
  async function enrichProjectsWithOrgNames(projectsList: Project[], req?: Request) {
    const projectIds = projectsList.map(p => p.id);
    if (projectIds.length === 0) return [];

    const user = req?.user as User | undefined;
    const organizationId = user ? await getUserOrganizationId(user.id) : null;
    const organization = organizationId ? await storage.getOrganization(organizationId) : null;
    const isContractor = organization?.sectorType === "Contractor";

    const allOrganizations = await storage.getAllOrganizations();
    const orgMap = new Map(allOrganizations.map(org => [org.id, org.name]));

    const requestCounts = await db
      .select({
        projectId: requests.projectId,
        count: sql<number>`cast(count(${requests.id}) as integer)`
      })
      .from(requests)
      .where(inArray(requests.projectId, projectIds))
      .groupBy(requests.projectId);

    const deliveryCounts = await db
      .select({
        projectId: deliveries.projectId,
        count: sql<number>`cast(count(${deliveries.id}) as integer)`
      })
      .from(deliveries)
      .where(inArray(deliveries.projectId, projectIds))
      .groupBy(deliveries.projectId);

    const supplierCounts = await db
      .select({
        projectId: suppliers.projectId,
        count: sql<number>`cast(count(${suppliers.id}) as integer)`
      })
      .from(suppliers)
      .where(inArray(suppliers.projectId, projectIds))
      .groupBy(suppliers.projectId);

    const materialCounts = await db
      .select({
        projectId: materials.projectId,
        count: sql<number>`cast(count(${materials.id}) as integer)`
      })
      .from(materials)
      .where(inArray(materials.projectId, projectIds))
      .groupBy(materials.projectId);

    const snagCounts = await db
      .select({
        projectId: snagLists.projectId,
        count: sql<number>`cast(count(${snagLists.id}) as integer)`
      })
      .from(snagLists)
      .where(
        isContractor
          ? and(inArray(snagLists.projectId, projectIds), notInArray(snagLists.status, ["draft"]))
          : inArray(snagLists.projectId, projectIds)
      )
      .groupBy(snagLists.projectId);

    const docMap = new Map<string, number>();

    try {
      const sqlChunks = projectIds.map(id => sql`${id}`);
      const joinedIds = sql.join(sqlChunks, sql`, `);

      const result = await db.execute(sql`
        SELECT project_id, COUNT(DISTINCT lowercase_name) as count
        FROM (
          SELECT project_id, LOWER(COALESCE(file_name, name, '')) as lowercase_name
          FROM documents
          WHERE project_id IN (${joinedIds})

          UNION

          SELECT r.project_id, LOWER(COALESCE(rd.file_name, d.name, rd.title, 'Untitled')) as lowercase_name
          FROM request_documents rd
          LEFT JOIN documents d ON rd.project_document_id = d.id
          INNER JOIN request_revisions rr ON rd.revision_id = rr.id
          INNER JOIN requests r ON rr.request_id = r.id
          WHERE r.project_id IN (${joinedIds})
            AND (rd.source_type = 'project' OR rd.project_document_id IS NOT NULL)

          UNION

          SELECT r.project_id, LOWER(COALESCE(ra.file_name, ra.title, 'Untitled')) as lowercase_name
          FROM request_attachments ra
          INNER JOIN request_revisions rr ON ra.revision_id = rr.id
          INNER JOIN requests r ON rr.request_id = r.id
          WHERE r.project_id IN (${joinedIds})
        ) subquery
        GROUP BY project_id
      `);

      const rows = result.rows as { project_id: string; count: string | number }[];
      rows.forEach(row => {
        docMap.set(row.project_id, typeof row.count === 'string' ? parseInt(row.count, 10) : Number(row.count));
      });
    } catch (err) {
      console.error("Error bulk calculating document counts:", err);
      projectIds.forEach(id => docMap.set(id, 0));
    }

    const countMap = new Map(requestCounts.map(rc => [rc.projectId, rc.count]));
    const delMap = new Map(deliveryCounts.map(dc => [dc.projectId, dc.count]));
    const supMap = new Map(supplierCounts.map(sc => [sc.projectId, sc.count]));
    const matMap = new Map(materialCounts.map(mc => [mc.projectId, mc.count]));
    const snagMap = new Map(snagCounts.map(sc => [sc.projectId, sc.count]));
    const certMap = await countCertificatesByProject(projectIds);

    return projectsList.map(project => ({
      ...project,
      developerName: project.organizationId ? orgMap.get(project.organizationId) || null : null,
      contractorName: project.contractorId ? orgMap.get(project.contractorId) || null : null,
      consultantName: project.consultantId ? orgMap.get(project.consultantId) || null : null,
      requestCount: countMap.get(project.id) || 0,
      deliveryCount: delMap.get(project.id) || 0,
      supplierCount: supMap.get(project.id) || 0,
      materialCount: matMap.get(project.id) || 0,
      snagCount: snagMap.get(project.id) || 0,
      documentCount: docMap.get(project.id) || 0,
      purchaseOrderCount: 0,
      paymentCertificateCount: certMap.get(project.id) || 0,
    }));
  }

  // Projects API
  app.get("/api/projects", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);

      // Require authentication for filtered access
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      let projectsToEnrich: Project[] = [];

      if (ProjectPermissions.canViewAll(currentUser.user)) {
        projectsToEnrich = await storage.getAllProjects();
      } else {
        // Fetch projects where the user's organization is involved
        if (currentUser.orgId) {
          const orgProjects = await storage.getProjectsByOrganization(currentUser.orgId);
          // Apply strict permission check for Edge Cases, but the result set is already filtered heavily by DB
          projectsToEnrich = orgProjects.filter(project =>
            ProjectPermissions.canView(currentUser.user, {
              id: project.id,
              creatorId: project.creatorId,
              organizationId: project.organizationId,
              contractorId: project.contractorId,
              consultantId: project.consultantId,
            }, currentUser.orgId)
          );
        }
      }

      const enrichedProjects = await enrichProjectsWithOrgNames(projectsToEnrich, req);
      res.json(enrichedProjects);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!ProjectPermissions.canView(currentUser.user, {
        id: project.id,
        creatorId: project.creatorId,
        organizationId: project.organizationId,
        contractorId: project.contractorId,
        consultantId: project.consultantId,
      }, currentUser.orgId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const enriched = await enrichProjectsWithOrgNames([project], req);
      res.json(enriched[0]);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!ProjectPermissions.canCreate(currentUser.user)) {
        return res.status(403).json({ error: "You don't have permission to create projects" });
      }

      // For org_admin users, check if their organization is a Developer
      if (currentUser.user.role === "org_admin" && currentUser.orgId) {
        const userOrg = await storage.getOrganization(currentUser.orgId);
        if (!userOrg || userOrg.sectorType !== "Developer") {
          return res.status(403).json({ error: "Only Developer organizations can create projects" });
        }
      }

      const validatedData = insertProjectSchema.parse(req.body);

      // A contractor or consultant is never assigned by the developer alone. The project
      // starts with the role empty and is filled when an invitation is accepted, so
      // these two fields are dropped here rather than trusted from the request.
      const { contractorId: _contractor, consultantId: _consultant, ...projectFields } =
        validatedData as typeof validatedData & { contractorId?: unknown; consultantId?: unknown };

      const projectData = {
        ...projectFields,
        creatorId: currentUser?.user.id || null,
      };
      const project = await storage.createProject(projectData as typeof validatedData);
      res.status(201).json(project);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!ProjectPermissions.canEdit(currentUser.user, {
        id: project.id,
        creatorId: project.creatorId,
        organizationId: project.organizationId,
      }, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to edit this project" });
      }

      const validatedData = updateProjectSchema.parse(req.body);

      // Joining a project needs the organization's consent, so filling one of these
      // roles always goes through an invitation. Ending the engagement is the project
      // owner's own call, so clearing a role is allowed here — an organization does not
      // get to stay on a project because it will not agree to leave.
      const clears = (value: unknown) => value === null || value === "";
      const roleChanges = [
        { field: "contractor", next: validatedData.contractorId, current: project.contractorId },
        { field: "consultant", next: validatedData.consultantId, current: project.consultantId },
      ].filter(change => change.next !== undefined && (change.next || null) !== change.current);

      const attemptedAssignment = roleChanges.some(change => !clears(change.next));
      if (attemptedAssignment && currentUser.user.role !== "super_admin") {
        return res.status(403).json({
          error: "Invite the organization to the project instead. The contractor and consultant are set when the invitation is accepted.",
        });
      }

      const removals = roleChanges.filter(change => clears(change.next) && change.current);

      // Normalise "" to null so the column is actually emptied
      const updateData = {
        ...validatedData,
        ...(validatedData.contractorId !== undefined
          ? { contractorId: validatedData.contractorId || null }
          : {}),
        ...(validatedData.consultantId !== undefined
          ? { consultantId: validatedData.consultantId || null }
          : {}),
      };

      const updatedProject = await storage.updateProject(req.params.id, updateData);

      // Being removed from a project is not something to discover by its absence
      for (const removal of removals) {
        const removedOrgId = removal.current!;
        const adminIds = await storage.getOrganizationAdminUserIds(removedOrgId);
        for (const userId of adminIds) {
          await notificationService.notifyRemovedFromProject({
            userId,
            projectName: project.name,
            roleLabel: removal.field === "contractor" ? "مقاول" : "استشاري",
          });
        }
      }
      res.json(updatedProject);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!ProjectPermissions.canDelete(currentUser.user, {
        id: project.id,
        creatorId: project.creatorId,
        organizationId: project.organizationId,
      }, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to delete this project" });
      }

      await storage.deleteProject(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      // Check if deletion failed due to foreign key constraints
      if (error?.code === '23503' || error?.message?.includes('foreign key')) {
        return res.status(409).json({
          error: "Cannot delete project with existing tasks. All tasks will be deleted with this project."
        });
      }
      handleError(res, error);
    }
  });

  // Organizations API
  app.get("/api/organizations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const allOrganizations = await storage.getAllOrganizations();

      if (OrganizationPermissions.canViewAll(currentUser.user)) {
        return res.json(allOrganizations);
      }

      // Visibility follows accepted invitations: the user's own organization plus the
      // ones it invited and that registered themselves.
      const linkedOrgIds = currentUser.orgId
        ? await storage.getLinkedOrganizationIds(currentUser.orgId)
        : [];
      const filteredOrgs = allOrganizations.filter(org =>
        OrganizationPermissions.canView(currentUser.user, org, currentUser.orgId, linkedOrgIds)
      );
      res.json(filteredOrgs);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Who an email belongs to, for the invite dialog. When the address is already in the
  // system there is no need to ask the developer which role to offer: the organization
  // has declared its own sector, and that decides it.
  //
  // This does tell an authenticated developer whether an address is registered. That is
  // a deliberate trade for not making them restate something the system already knows,
  // and it is limited to users who may invite in the first place.
  app.get("/api/organizations/lookup-by-email", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!OrganizationPermissions.canInvite(currentUser.user)) {
        return res.status(403).json({ error: "You don't have permission to invite organizations" });
      }

      const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (!email) {
        return res.status(400).json({ error: "An email address is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ registered: false });
      }

      const organizationId = await getUserOrganizationId(user.id);
      const organization = organizationId ? await storage.getOrganization(organizationId) : undefined;
      if (!organization) {
        // An account with no organization behind it cannot be invited as one
        return res.json({ registered: true, organizationId: null });
      }

      // Nothing about the person, only the organization they can answer for
      res.json({
        registered: true,
        organizationId: organization.id,
        organizationName: organization.name,
        sectorType: organization.sectorType || null,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/organizations/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const linkedOrgIds = currentUser.orgId
        ? await storage.getLinkedOrganizationIds(currentUser.orgId)
        : [];
      if (!OrganizationPermissions.canView(currentUser.user, organization, currentUser.orgId, linkedOrgIds)) {
        return res.status(403).json({ error: "You don't have permission to view this organization" });
      }

      res.json(organization);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/organizations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      // Organizations maintain their own data: a developer invites rather than creates
      if (!OrganizationPermissions.canCreate(currentUser.user)) {
        return res.status(403).json({
          error: "Only a system administrator can add an organization directly. Invite the organization instead so it registers its own details.",
        });
      }

      const validatedData = insertOrganizationSchema.parse(req.body);

      // CCR number identifies a company, so it may only exist once in the system
      const duplicate = await storage.getOrganizationByCcrNumber(validatedData.ccrNumber);
      if (duplicate) {
        return res.status(409).json({
          error: `An organization with CCR number ${validatedData.ccrNumber} already exists in the system (${duplicate.name}).`,
        });
      }

      const organization = await storage.createOrganization(validatedData);
      res.status(201).json(organization);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/organizations/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const existing = await storage.getOrganization(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Organization not found" });
      }
      if (!OrganizationPermissions.canEdit(currentUser.user, existing, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to edit this organization" });
      }

      const validatedData = updateOrganizationSchema.parse(req.body);

      if (validatedData.ccrNumber && validatedData.ccrNumber !== existing.ccrNumber) {
        const duplicate = await storage.getOrganizationByCcrNumber(validatedData.ccrNumber);
        if (duplicate && duplicate.id !== existing.id) {
          return res.status(409).json({
            error: `An organization with CCR number ${validatedData.ccrNumber} already exists in the system (${duplicate.name}).`,
          });
        }
      }

      // The sector decides what an organization is allowed to do, so it is not something
      // an organization may change about itself.
      if (
        validatedData.sectorType !== undefined &&
        validatedData.sectorType !== existing.sectorType &&
        currentUser.user.role !== "super_admin"
      ) {
        return res.status(403).json({
          error: "Only a system administrator can change an organization's sector type",
        });
      }

      const organization = await storage.updateOrganization(req.params.id, validatedData);
      res.json(organization);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/organizations/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!OrganizationPermissions.canDelete(currentUser.user)) {
        return res.status(403).json({ error: "You don't have permission to delete organizations" });
      }

      await storage.deleteOrganization(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      // Check if deletion failed due to foreign key constraints
      if (error?.code === '23503' || error?.message?.includes('foreign key')) {
        return res.status(409).json({
          error: "Cannot delete organization with existing projects. Delete all associated projects first."
        });
      }
      handleError(res, error);
    }
  });

  // Project Invitations API
  //
  // A developer offers the contractor or consultant role on one of its projects. The
  // project field is written only when the invited organization accepts, so there is no
  // path by which a developer assigns an organization to a project without its consent —
  // not even an organization it already works with on another project.
  //
  // Three ways to invite, one row either way:
  //   - an organization already in the system  -> notified in the app, no token
  //   - an email that belongs to an account    -> resolved to that organization, same
  //   - an email with no account               -> emailed link, registers, then answers
  //
  // Tokens follow the password-reset rules: random, stored as a sha256 hash, time
  // limited, single use.
  const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const ROLE_FIELD: Record<ProjectInvitationRole, "contractorId" | "consultantId"> = {
    contractor: "contractorId",
    consultant: "consultantId",
  };
  const ROLE_SECTOR: Record<ProjectInvitationRole, string> = {
    contractor: "Contractor",
    consultant: "Consultant",
  };

  // An invitation says nothing about the project beyond what the invited party needs in
  // order to decide: which project, whose, and in what role.
  async function describeInvitation(invitation: OrganizationInvitation) {
    const [project, invitingOrganization, invitedOrganization] = await Promise.all([
      invitation.projectId ? storage.getProject(invitation.projectId) : undefined,
      storage.getOrganization(invitation.invitingOrganizationId),
      invitation.invitedOrganizationId
        ? storage.getOrganization(invitation.invitedOrganizationId)
        : undefined,
    ]);
    const { tokenHash: _hidden, ...safe } = invitation;
    return {
      ...safe,
      projectName: project?.name || null,
      projectLocation: project?.location || null,
      invitingOrganizationName: invitingOrganization?.name || null,
      invitedOrganizationName: invitedOrganization?.name || null,
    };
  }

  app.post("/api/project-invitations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const payload = createProjectInvitationSchema.parse(req.body);

      const project = await storage.getProject(payload.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (!ProjectInvitationPermissions.canInvite(currentUser.user, project, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to invite organizations to this project" });
      }
      if (!currentUser.orgId) {
        return res.status(400).json({ error: "Your account is not linked to an organization" });
      }

      // One outstanding invitation per role: a second one would make it unclear which
      // answer assigns the project.
      const outstanding = await storage.getPendingInvitationForRole(payload.projectId, payload.role);
      if (outstanding) {
        return res.status(409).json({
          error: "This project already has an invitation awaiting an answer for that role. Withdraw it first.",
        });
      }

      const expectedSector = ROLE_SECTOR[payload.role];

      // Resolve who is being invited: a named organization, or one found from the email
      let invitedOrganization = payload.organizationId
        ? await storage.getOrganization(payload.organizationId)
        : undefined;
      const normalizedEmail = payload.email?.trim().toLowerCase();

      if (!invitedOrganization && normalizedEmail) {
        const existingUser = await storage.getUserByEmail(normalizedEmail);
        if (existingUser) {
          const orgId = await getUserOrganizationId(existingUser.id);
          invitedOrganization = orgId ? await storage.getOrganization(orgId) : undefined;
          if (!invitedOrganization) {
            return res.status(409).json({
              error: "That email belongs to an account that is not linked to any organization yet.",
            });
          }
        }
      }

      if (payload.organizationId && !invitedOrganization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      if (invitedOrganization) {
        if (invitedOrganization.id === currentUser.orgId) {
          return res.status(400).json({ error: "An organization cannot be invited to its own project" });
        }
        if (invitedOrganization.sectorType !== expectedSector) {
          return res.status(409).json({
            error: `${invitedOrganization.name} is registered as ${invitedOrganization.sectorType || "unclassified"}, so it cannot take the ${payload.role} role.`,
          });
        }
        const assignedId = payload.role === "consultant" ? project.consultantId : project.contractorId;
        if (assignedId === invitedOrganization.id) {
          return res.status(409).json({
            error: `${invitedOrganization.name} already holds that role on this project.`,
          });
        }
      }

      // Replacing an organization frees the role straight away, so the outgoing one
      // loses access the moment the invitation goes out.
      const currentlyAssigned = payload.role === "consultant" ? project.consultantId : project.contractorId;
      if (currentlyAssigned) {
        await storage.updateProject(project.id, { [ROLE_FIELD[payload.role]]: null } as any);
      }

      const needsRegistrationLink = !invitedOrganization && !!normalizedEmail;
      const token = needsRegistrationLink ? crypto.randomBytes(32).toString("hex") : null;
      const tokenHash = token ? crypto.createHash("sha256").update(token).digest("hex") : null;

      const invitation = await storage.createOrganizationInvitation({
        invitingOrganizationId: currentUser.orgId,
        invitedByUserId: currentUser.user.id,
        projectId: project.id,
        role: payload.role,
        invitedOrganizationId: invitedOrganization?.id ?? null,
        email: normalizedEmail ?? null,
        sectorType: expectedSector,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
        status: "pending",
      });

      const invitingOrganization = await storage.getOrganization(currentUser.orgId);
      const inviterName = invitingOrganization?.nameArabic || invitingOrganization?.name || "";
      const roleLabel = payload.role === "contractor" ? "مقاول" : "استشاري";

      if (invitedOrganization) {
        // Already in the system: the invitation arrives where they already work
        const adminIds = await storage.getOrganizationAdminUserIds(invitedOrganization.id);
        for (const userId of adminIds) {
          await notificationService.notifyProjectInvitation({
            userId,
            projectId: project.id,
            projectName: project.name,
            invitingOrganizationName: inviterName,
            roleLabel,
          });
        }
        if (adminIds.length === 0) {
          console.warn(`Project invitation ${invitation.id}: ${invitedOrganization.name} has no admin to notify`);
        }
      } else if (needsRegistrationLink && token) {
        const inviteUrl = `${process.env.APP_URL || 'http://localhost:5000'}/accept-invitation?token=${token}`;
        const sendResult = await sendTransactionalEmail({
          to: normalizedEmail!,
          subject: `دعوة للمشاركة في مشروع ${project.name} - نظام إدارة المشاريع`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">دعوة للمشاركة في مشروع</h2>
              <p>السلام عليكم،</p>
              <p>دعتكم <strong>${inviterName}</strong> للمشاركة في مشروع <strong>${project.name}</strong> بصفة <strong>${roleLabel}</strong>.</p>
              <p>سجّلوا بيانات منشأتكم من الرابط أدناه، ثم تجدون الدعوة بانتظار ردّكم عند أول دخول:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  تسجيل المنشأة
                </a>
              </div>
              <p>أو انسخ الرابط التالي:</p>
              <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all;">
                ${inviteUrl}
              </p>
              <p style="color: #666; font-size: 14px;">
                بيانات منشأتكم تدخلونها بأنفسكم وتبقى تحت إدارتكم وحدكم، ولكم قبول المشروع أو رفضه.
              </p>
              <p style="color: #666; font-size: 14px;">
                هذا الرابط صالح لمدة 7 أيام ويُستخدم مرة واحدة.
              </p>
            </div>
          `,
        });

        if (!sendResult.ok) {
          await storage.deleteOrganizationInvitation(invitation.id);
          return res.status(502).json({
            error: `The invitation could not be emailed, so it was not created. ${sendResult.error}`,
          });
        }
      }

      res.status(201).json(await describeInvitation(invitation));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Pending invitations, from either side of the relationship:
  //   default      - waiting for an answer from organizations this user administers
  //   ?scope=sent  - still unanswered, sent by this user's own organization
  //
  // The sent view is what lets the invite dialog grey out a project whose role is
  // already spoken for, rather than letting the request fail on the unique index.
  app.get("/api/project-invitations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (req.query.scope === "sent") {
        if (!currentUser.orgId || !OrganizationPermissions.canInvite(currentUser.user)) {
          return res.json([]);
        }
        const sent = await storage.getOrganizationInvitationsByInviter(currentUser.orgId);
        const pending = sent.filter(invitation => invitation.status === "pending");
        return res.json(await Promise.all(pending.map(describeInvitation)));
      }

      const organizationIds = await storage.getUserAdministeredOrganizationIds(currentUser.user.id);
      if (organizationIds.length === 0) {
        return res.json([]);
      }

      const invitations = await storage.getPendingInvitationsForOrganizations(organizationIds);
      res.json(await Promise.all(invitations.map(describeInvitation)));
    } catch (error) {
      handleError(res, error);
    }
  });

  // What a project is still waiting on, for the developer's own project pages
  app.get("/api/projects/:projectId/invitations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (!ProjectPermissions.canView(currentUser.user, project, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to view this project" });
      }

      const invitations = await storage.getPendingInvitationsForProjects([project.id]);
      res.json(await Promise.all(invitations.map(describeInvitation)));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/project-invitations/:id/accept", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = respondToProjectInvitationSchema.parse(req.body ?? {});
      const invitation = await storage.getOrganizationInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Which organization is answering is never guessed: with more than one, the
      // caller has to say, because getUserOrganizationId would just take the first.
      const administered = await storage.getUserAdministeredOrganizationIds(currentUser.user.id);
      const respondingOrgId = organizationId ?? (administered.length === 1 ? administered[0] : null);
      if (!respondingOrgId) {
        return res.status(400).json({
          error: "You administer more than one organization. Say which one is accepting.",
          organizationIds: administered,
        });
      }
      if (!administered.includes(respondingOrgId) && currentUser.user.role !== "super_admin") {
        return res.status(403).json({ error: "You cannot answer on behalf of that organization" });
      }

      if (!ProjectInvitationPermissions.canRespond(currentUser.user, invitation, respondingOrgId)) {
        return res.status(403).json({ error: "This invitation is not yours to answer, or it has already been answered" });
      }
      if (new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      const respondingOrg = await storage.getOrganization(respondingOrgId);
      if (respondingOrg?.sectorType !== invitation.sectorType) {
        return res.status(409).json({
          error: `This invitation is for a ${invitation.sectorType}, and your organization is registered as ${respondingOrg?.sectorType || "unclassified"}.`,
        });
      }

      const accepted = await storage.acceptProjectInvitation(invitation.id, respondingOrgId, currentUser.user.id);

      const project = accepted.projectId ? await storage.getProject(accepted.projectId) : undefined;
      if (project && invitation.invitedByUserId) {
        await notificationService.notifyProjectInvitationAnswer({
          userId: invitation.invitedByUserId,
          projectId: project.id,
          projectName: project.name,
          organizationName: respondingOrg?.name || "",
          accepted: true,
        });
      }

      res.json(await describeInvitation(accepted));
    } catch (error: any) {
      if (error?.message === "INVITATION_ALREADY_ANSWERED") {
        return res.status(409).json({ error: "This invitation has already been answered" });
      }
      handleError(res, error);
    }
  });

  app.post("/api/project-invitations/:id/reject", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = respondToProjectInvitationSchema.parse(req.body ?? {});
      const invitation = await storage.getOrganizationInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const administered = await storage.getUserAdministeredOrganizationIds(currentUser.user.id);
      const respondingOrgId = organizationId ?? (administered.length === 1 ? administered[0] : null);
      if (!respondingOrgId) {
        return res.status(400).json({
          error: "You administer more than one organization. Say which one is rejecting.",
          organizationIds: administered,
        });
      }
      if (!administered.includes(respondingOrgId) && currentUser.user.role !== "super_admin") {
        return res.status(403).json({ error: "You cannot answer on behalf of that organization" });
      }
      if (!ProjectInvitationPermissions.canRespond(currentUser.user, invitation, respondingOrgId)) {
        return res.status(403).json({ error: "This invitation is not yours to answer, or it has already been answered" });
      }

      const rejected = await storage.rejectProjectInvitation(invitation.id, currentUser.user.id);
      if (!rejected) {
        return res.status(409).json({ error: "This invitation has already been answered" });
      }

      // A rejection is a normal outcome, not a dead end: the developer is told so they
      // can invite someone else, and the project simply stays without that role filled.
      const project = rejected.projectId ? await storage.getProject(rejected.projectId) : undefined;
      const respondingOrg = await storage.getOrganization(respondingOrgId);
      if (project && invitation.invitedByUserId) {
        await notificationService.notifyProjectInvitationAnswer({
          userId: invitation.invitedByUserId,
          projectId: project.id,
          projectName: project.name,
          organizationName: respondingOrg?.name || "",
          accepted: false,
        });
      }

      res.json(await describeInvitation(rejected));
    } catch (error) {
      handleError(res, error);
    }
  });

  // The developer takes back an invitation that has not been answered yet
  app.post("/api/project-invitations/:id/withdraw", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const invitation = await storage.getOrganizationInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      const project = invitation.projectId ? await storage.getProject(invitation.projectId) : undefined;
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (!ProjectInvitationPermissions.canWithdraw(currentUser.user, project, currentUser.orgId)) {
        return res.status(403).json({ error: "You don't have permission to withdraw this invitation" });
      }

      const revoked = await storage.revokeOrganizationInvitation(invitation.id, invitation.invitingOrganizationId);
      if (!revoked) {
        return res.status(409).json({ error: "This invitation has already been answered" });
      }

      if (invitation.invitedOrganizationId) {
        const adminIds = await storage.getOrganizationAdminUserIds(invitation.invitedOrganizationId);
        for (const userId of adminIds) {
          await notificationService.notifyProjectInvitationWithdrawn({
            userId,
            projectId: project.id,
            projectName: project.name,
          });
        }
      }

      res.json(await describeInvitation(revoked));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Public: the invitee is not signed in yet. The token is checked before anything is
  // read, and the response says only what the registration form needs to render.
  app.get("/api/invitations/verify", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!token) {
        return res.status(400).json({ error: "Invitation token is required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invitation = await storage.getOrganizationInvitationByTokenHash(tokenHash);
      if (!invitation || invitation.status !== "pending") {
        return res.status(400).json({ error: "This invitation link is not valid or has already been used" });
      }
      if (new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This invitation link has expired" });
      }

      const invitingOrganization = await storage.getOrganization(invitation.invitingOrganizationId);
      const project = invitation.projectId ? await storage.getProject(invitation.projectId) : undefined;
      res.json({
        email: invitation.email,
        sectorType: invitation.sectorType,
        invitingOrganizationName: invitingOrganization?.name || "",
        projectName: project?.name || null,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Public: the only way an organization enters the system by itself. The token is
  // verified first; the email and sector come from the invitation, not from the payload.
  //
  // Registering is not the same as agreeing to the project. This creates the
  // organization and its first admin and burns the link; the project invitation stays
  // pending, and the new admin answers it explicitly after signing in.
  app.post("/api/invitations/accept", async (req, res) => {
    try {
      const payload = acceptOrganizationInvitationSchema.parse(req.body);

      const tokenHash = crypto.createHash("sha256").update(payload.token).digest("hex");
      const invitation = await storage.getOrganizationInvitationByTokenHash(tokenHash);
      if (!invitation || invitation.status !== "pending") {
        return res.status(400).json({ error: "This invitation link is not valid or has already been used" });
      }
      if (new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This invitation link has expired" });
      }
      if (!invitation.email) {
        return res.status(400).json({ error: "This invitation is not a registration link" });
      }

      // A company exists once in the system, identified by its CCR number. Hitting this
      // means the company is already registered, so the way in is to sign in and answer
      // the invitation rather than to create a second record.
      const duplicateOrg = await storage.getOrganizationByCcrNumber(payload.organization.ccrNumber);
      if (duplicateOrg) {
        return res.status(409).json({
          error: `${duplicateOrg.name} is already registered with this commercial registration number. Sign in with an administrator account for it and answer the invitation from there, instead of registering it again.`,
        });
      }

      const existingEmail = await storage.getUserByEmail(invitation.email);
      if (existingEmail) {
        return res.status(409).json({ error: "An account already exists for this email address" });
      }
      const existingUsername = await storage.getUserByUsername(payload.admin.username);
      if (existingUsername) {
        return res.status(409).json({ error: "This username is already taken" });
      }

      const hashedPassword = await bcrypt.hash(payload.admin.password, 10);

      const { organization } = await storage.acceptOrganizationInvitation({
        invitationId: invitation.id,
        email: invitation.email,
        sectorType: invitation.sectorType,
        organization: {
          name: payload.organization.name,
          nameArabic: payload.organization.nameArabic || undefined,
          phone: payload.organization.phone,
          address: payload.organization.address || undefined,
          vatNumber: payload.organization.vatNumber || undefined,
          ccrNumber: payload.organization.ccrNumber,
          logo: payload.organization.logo || undefined,
        },
        admin: {
          fullName: payload.admin.fullName,
          fullNameArabic: payload.admin.fullNameArabic || undefined,
          username: payload.admin.username,
          hashedPassword,
          phone: payload.admin.phone || undefined,
        },
      });

      const project = invitation.projectId ? await storage.getProject(invitation.projectId) : undefined;
      res.status(201).json({
        organizationName: organization.name,
        projectName: project?.name || null,
      });
    } catch (error: any) {
      if (error?.message === "INVITATION_ALREADY_USED") {
        return res.status(400).json({ error: "This invitation link has already been used" });
      }
      handleError(res, error);
    }
  });

  // Tasks API
  app.get("/api/tasks", async (req, res) => {
    try {
      const { projectId } = req.query;
      const tasks = projectId
        ? await storage.getTasksByProject(projectId as string)
        : await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);

      // Create audit log for approval/special request tasks
      if (validatedData.type === "approval_request" || validatedData.type === "inspection_request" || validatedData.type === "permission_request") {
        const typeLabel = {
          approval_request: "Approval Request",
          inspection_request: "Inspection Request",
          permission_request: "Permission to Work Request"
        }[validatedData.type] || "Request";

        const taskActivity = await storage.createActivity({
          projectId: validatedData.projectId,
          type: validatedData.type as any,
          title: `${typeLabel}: ${validatedData.title}`,
          description: validatedData.description || "New request created",
          userName: "System",
        });
        broadcastActivityUpdate(taskActivity);
      }

      res.status(201).json(task);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const existingTask = await storage.getTask(req.params.id);
      const validatedData = updateTaskSchema.parse(req.body);
      const task = await storage.updateTask(req.params.id, validatedData);

      // Create audit log if status changed
      if (existingTask && validatedData.status && existingTask.status !== validatedData.status) {
        const statusActivity = await storage.createActivity({
          projectId: task.projectId,
          type: "status_changed",
          title: `Activity status changed: ${task.title}`,
          description: `Status changed from ${existingTask.status} to ${validatedData.status}`,
          userName: "System",
        });
        broadcastActivityUpdate(statusActivity);
      }

      res.json(task);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Team Members API
  app.get("/api/team", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      const allMembers = await storage.getAllTeamMembers();

      // Require authentication for filtered access
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (MemberPermissions.canViewAll(currentUser.user)) {
        return res.json(allMembers);
      }

      // Get developer admin context if applicable
      const devAdminContext = currentUser.user.role === "developer_admin"
        ? await getDeveloperAdminContext(currentUser.user.id)
        : undefined;

      // Filter based on permissions
      const filteredMembers = allMembers.filter(member =>
        MemberPermissions.canView(currentUser.user, {
          id: member.id,
          organizationId: member.organizationId,
        }, currentUser.orgId, devAdminContext)
      );

      res.json(filteredMembers);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/team/:id", async (req, res) => {
    try {
      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get developer admin context if applicable
      const devAdminContext = currentUser.user.role === "developer_admin"
        ? await getDeveloperAdminContext(currentUser.user.id)
        : undefined;

      if (!MemberPermissions.canView(currentUser.user, {
        id: member.id,
        organizationId: member.organizationId,
      }, currentUser.orgId, devAdminContext)) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(member);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/team", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!MemberPermissions.canCreate(currentUser.user)) {
        return res.status(403).json({ error: "You don't have permission to create team members" });
      }

      const validatedData = insertTeamMemberSchema.parse(req.body);
      const member = await storage.createTeamMember(validatedData);
      res.status(201).json(member);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/team/:id", async (req, res) => {
    try {
      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get developer admin context if applicable
      const devAdminContext = currentUser.user.role === "developer_admin"
        ? await getDeveloperAdminContext(currentUser.user.id)
        : undefined;

      if (!MemberPermissions.canEdit(currentUser.user, {
        id: member.id,
        organizationId: member.organizationId,
      }, currentUser.orgId, devAdminContext)) {
        return res.status(403).json({ error: "You don't have permission to edit this team member" });
      }

      const validatedData = updateTeamMemberSchema.parse(req.body);
      const updatedMember = await storage.updateTeamMember(req.params.id, validatedData);
      res.json(updatedMember);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/team/:id", async (req, res) => {
    try {
      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Team member not found" });
      }

      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get developer admin context if applicable
      const devAdminContext = currentUser.user.role === "developer_admin"
        ? await getDeveloperAdminContext(currentUser.user.id)
        : undefined;

      if (!MemberPermissions.canDelete(currentUser.user, {
        id: member.id,
        organizationId: member.organizationId,
      }, currentUser.orgId, devAdminContext)) {
        return res.status(403).json({ error: "You don't have permission to delete this team member" });
      }

      await storage.deleteTeamMember(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // File Upload APIs (Cloudflare R2)
  app.post("/api/uploads/request-url", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { name, size, contentType, folder = 'objects/uploads', projectId } = req.body;
      if (!name || !contentType) throw new Error('name and contentType required');

      const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')) : '';
      const nameWithoutExt = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;
      const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_');

      const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
      const objectKey = projectId
        ? `projects/${projectId}/${safeFolder}/${randomUUID()}-${cleanName}${ext}`
        : `${safeFolder}/${randomUUID()}-${cleanName}${ext}`;

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        ContentType: contentType,
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      return res.json({
        uploadURL: presignedUrl,
        objectPath: `/${objectKey}`,
        metadata: {
          name,
          size,
          contentType
        }
      });
    } catch (error: any) {
      console.error('Presign Error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to prepare upload' });
    }
  });

  app.post("/api/save-metadata", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { objectKey, publicFileUrl, projectId, category, size } = req.body;

      if (!objectKey || !projectId) throw new Error('objectKey and projectId required');

      const finalFileUrl =
        publicFileUrl ||
        (R2_PUBLIC_BASE_URL
          ? (objectKey.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${objectKey}` : `${R2_PUBLIC_BASE_URL}/${objectKey}`)
          : 'URL not available');

      let folderId: string | null = null;
      if (category === "snag list") {
        const folders = await storage.getProjectFolders(projectId);
        const snagListFolder = folders.find(f => f.name.toLowerCase() === "snag list");
        if (snagListFolder) {
          folderId = snagListFolder.id;
        } else {
          const user = req.user as User;
          const newFolder = await storage.createProjectFolder({
            projectId,
            name: "Snag List",
            createdBy: user.id,
          });
          folderId = newFolder.id;
        }
      }

      const savedDoc = await storage.createDocument({
        projectId: projectId,
        folderId: folderId || undefined,
        name: objectKey.split('/').pop() || objectKey,
        type: "cloud_file",
        category: category || "general",
        size: size ? String(size) : "unknown",
        fileData: objectKey.startsWith('/') ? objectKey : `/${objectKey}`,
        fileUrl: objectKey,
        fileName: objectKey.split('/').pop() || objectKey,
      });

      res.json({ success: true, document: savedDoc });
    } catch (error) {
      handleError(res, error);
    }
  });


  app.get("/api/project-folders/:id/contents", async (req, res) => {
    try {
      const folders = await storage.getProjectFoldersByParent(req.params.id);
      const files = await storage.getDocumentsByFolder(req.params.id);
      res.json({ folders, files });
    } catch (error) {
      handleError(res, error);
    }
  });


  app.patch("/api/project-folders/:id", async (req, res) => {
    try {
      const validatedData = updateProjectFolderSchema.parse(req.body);
      const folder = await storage.updateProjectFolder(req.params.id, validatedData);
      res.json(folder);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/project-folders/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser || currentUser.user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admins can delete storage items" });
      }
      // "Orphan them" - The database schema on documents table has folder_id REFERENCES project_folders(id) ON DELETE SET NULL
      // And subfolders have parent_id REFERENCES project_folders(id) ON DELETE CASCADE.
      // So deleting a folder will cascade delete subfolders, but documents will remain with folderId = null.
      await storage.deleteProjectFolder(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });


  // Documents API
  app.get("/api/documents", async (req, res) => {
    try {
      const docs = await storage.getAllDocuments();
      const mappedDocs = docs.map(doc => ({
        ...doc,
        fileData: (doc.fileData && !doc.fileData.startsWith('http') && !doc.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileData.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileData}` : `${R2_PUBLIC_BASE_URL}/${doc.fileData}`)
          : doc.fileData,
        fileUrl: (doc.fileUrl && !doc.fileUrl.startsWith('http') && !doc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${doc.fileUrl}`)
          : doc.fileUrl
      }));
      res.json(mappedDocs);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/documents/project/:projectId", async (req, res) => {
    try {
      const docs = await storage.getDocumentsByProject(req.params.projectId);
      const mappedDocs = docs.map(doc => ({
        ...doc,
        fileData: (doc.fileData && !doc.fileData.startsWith('http') && !doc.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileData.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileData}` : `${R2_PUBLIC_BASE_URL}/${doc.fileData}`)
          : doc.fileData,
        fileUrl: (doc.fileUrl && !doc.fileUrl.startsWith('http') && !doc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${doc.fileUrl}`)
          : doc.fileUrl
      }));
      res.json(mappedDocs);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const mappedDoc = {
        ...doc,
        fileData: (doc.fileData && !doc.fileData.startsWith('http') && !doc.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileData.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileData}` : `${R2_PUBLIC_BASE_URL}/${doc.fileData}`)
          : doc.fileData,
        fileUrl: (doc.fileUrl && !doc.fileUrl.startsWith('http') && !doc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL)
          ? (doc.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${doc.fileUrl}`)
          : doc.fileUrl
      };
      res.json(mappedDoc);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const validatedData = insertDocumentSchema.parse(req.body);
      const doc = await storage.createDocument(validatedData);

      // Create audit log for document upload
      const docActivity = await storage.createActivity({
        projectId: validatedData.projectId,
        type: "document_added",
        title: `Document uploaded: ${validatedData.name}`,
        description: `${validatedData.type} document (${validatedData.size}) uploaded to ${validatedData.category} category`,
        userName: "System",
      });
      broadcastActivityUpdate(docActivity);

      const responseDoc = { ...doc };
      if (responseDoc.fileData && !responseDoc.fileData.startsWith('http') && !responseDoc.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL) {
        responseDoc.fileData = responseDoc.fileData.startsWith('/')
          ? `${R2_PUBLIC_BASE_URL}${responseDoc.fileData}`
          : `${R2_PUBLIC_BASE_URL}/${responseDoc.fileData}`;
      }
      res.status(201).json(responseDoc);
    } catch (error) {
      handleError(res, error);
    }
  });


  app.get("/api/projects/:projectId/storage", async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await storage.getProject(projectId);
      const userContext = await getCurrentUserWithOrg(req);

      // Strict Access Control: Consultants are blocked from project storage per user requirement
      if (userContext && userContext.user.role !== 'super_admin' && project?.consultantId === userContext.orgId) {
        console.log(`[Storage API] Access denied for Consultant organization: ${userContext.orgId} on Project: ${projectId}`);
        return res.status(403).json({ error: "Access denied: Consultant members are not authorized to view project storage." });
      }

      console.log(`[Storage API] Request for Project ID: "${projectId}"`);
      console.log(`[Storage API] Project found in DB: ${Boolean(project)}`);

      const folders = await storage.getProjectFolders(projectId);
      const projectDocs = (await storage.getDocumentsByProject(projectId)).map(d => ({ ...d, sourceType: 'project' as const }));
      const requestDocs = (await storage.getRequestDocumentsByProject(projectId)).map(d => ({ ...d, sourceType: 'request' as const }));

      console.log(`[Storage API] Project: ${projectId}`);
      console.log(`[Storage API] Folders: ${folders.length}`);
      console.log(`[Storage API] Project Docs: ${projectDocs.length}`);
      console.log(`[Storage API] Request Docs: ${requestDocs.length}`);

      // Combine and filter duplicates by filename
      const allDocsMap = new Map<string, any>();

      // 1. Process project docs first (they take priority)
      projectDocs.forEach(doc => {
        const key = (doc.fileName || doc.name).toLowerCase();
        allDocsMap.set(key, doc);
      });

      // 2. Add request docs only if they don't overwrite a project doc
      requestDocs.forEach(rd => {
        const key = (rd.fileName || (rd as any).name || "").toLowerCase();
        if (!key) return;

        if (!allDocsMap.has(key)) {
          allDocsMap.set(key, rd);
        } else {
          const existing = allDocsMap.get(key);
          // If we have multiple request docs with same name, keep the one with higher ID (proxy for newer)
          if (existing.sourceType === 'request' && rd.id.localeCompare(existing.id) > 0) {
            allDocsMap.set(key, rd);
          }
        }
      });

      const allDocs = Array.from(allDocsMap.values());

      const standaloneRequestDocs = allDocs.filter(d => d.sourceType === 'request' && !d.folderId);
      if (standaloneRequestDocs.length > 0) {
        const virtualFolderId = 'virtual-request-attachments';
        folders.push({
          id: virtualFolderId,
          projectId: projectId,
          name: 'Consultant Attachments',
          parentId: null,
          createdBy: 'system',
          createdAt: new Date().toISOString()
        } as any);

        allDocs.forEach(d => {
          if (d.sourceType === 'request' && !d.folderId) {
            d.folderId = virtualFolderId;
          }
        });
      }

      const mappedDocs = allDocs.map(doc => {
        let fileData = (doc as any).fileData || (doc as any).fileUrl;
        if (fileData && typeof fileData === 'string' && !fileData.startsWith('http') && !fileData.startsWith('data:') && R2_PUBLIC_BASE_URL) {
          fileData = fileData.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${fileData}` : `${R2_PUBLIC_BASE_URL}/${fileData}`;
        }
        return {
          ...doc,
          fileData,
          fileUrl: fileData, // Ensure fileUrl also has the fully qualified URL
          folderId: doc.folderId || null,
        };
      });

      const sortedDocs = mappedDocs.sort((a, b) => {
        const d1 = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const d2 = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
        const dateA = isNaN(d1) ? 0 : d1;
        const dateB = isNaN(d2) ? 0 : d2;
        return dateB - dateA;
      });

      res.json({
        folders,
        documents: sortedDocs
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Storage Object Proxy - Handles direct links to objects by redirecting to storage provider
  // This prevents the SPA from catching these URLs and showing "404 Page Not Found"
  // Narrowed to only match paths with file extensions (e.g., .pdf, .jpg) to avoid clashing with project pages
  app.get(["/objects/*", "/projects/*.*", "/delivery-notes/*"], async (req, res) => {
    try {
      if (R2_PUBLIC_BASE_URL) {
        // Ensure the path is properly formatted with the base URL
        const path = req.path.startsWith('/') ? req.path : `/${req.path}`;
        return res.redirect(`${R2_PUBLIC_BASE_URL}${path}`);
      }

      // If no public base URL, we can't easily redirect.
      // But we must NOT let this fall through to the SPA index.html
      res.status(404).send("File not found or storage not configured. Please check R2_PUBLIC_BASE_URL environment variable.");
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/project-folders", async (req, res) => {
    try {
      const validatedData = insertProjectFolderSchema.parse(req.body);
      const folder = await storage.createProjectFolder(validatedData);
      res.json(folder);
    } catch (error) {
      handleError(res, error);
    }
  });



  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const validatedData = updateDocumentSchema.parse(req.body);
      const doc = await storage.updateDocument(req.params.id, validatedData);
      res.json(doc);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/tags", async (req, res) => {
    try {
      const docs = await storage.getDocumentsByProject(req.params.projectId);
      const tags = Array.from(new Set(docs.flatMap(d => d.tags || []))).sort();
      res.json(tags);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser || currentUser.user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admins can delete storage items" });
      }
      await storage.deleteDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/project-storage/bulk-delete", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser || currentUser.user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admins can delete storage items" });
      }
      const { documentIds, folderIds } = req.body;
      if (Array.isArray(documentIds)) {
        await storage.bulkDeleteDocuments(documentIds);
      }
      if (Array.isArray(folderIds)) {
        await storage.bulkDeleteFolders(folderIds);
      }
      res.status(200).json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/project-storage/bulk-move", async (req, res) => {
    try {
      const { documentIds, folderIds, targetFolderId } = req.body;
      if (Array.isArray(documentIds)) {
        await storage.bulkMoveDocuments(documentIds, targetFolderId);
      }
      if (Array.isArray(folderIds)) {
        await storage.bulkMoveFolders(folderIds, targetFolderId);
      }
      res.status(200).json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Activities API
  app.get("/api/activities", async (req, res) => {
    try {
      const { projectId } = req.query;
      const activities = projectId
        ? await storage.getActivitiesByProject(projectId as string)
        : await storage.getAllActivities();
      res.json(activities);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/activities/:id", async (req, res) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const validated = insertActivitySchema.parse(req.body);
      const activity = await storage.createActivity(validated);
      broadcastActivityUpdate(activity);
      res.status(201).json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/activities/:id", async (req, res) => {
    try {
      const validated = updateActivitySchema.parse(req.body);
      const activity = await storage.updateActivity(req.params.id, validated);
      res.json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Work Locations API
  app.get("/api/projects/:projectId/work-locations", async (req, res) => {
    try {
      const locations = await storage.getWorkLocationsByProject(req.params.projectId);
      res.json(locations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-locations", async (req, res) => {
    try {
      const validatedData = insertWorkLocationSchema.parse(req.body);
      const location = await storage.createWorkLocation(validatedData);
      res.status(201).json(location);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/work-locations/:id", async (req, res) => {
    try {
      const validatedData = updateWorkLocationSchema.parse(req.body);
      const location = await storage.updateWorkLocation(req.params.id, validatedData);
      res.json(location);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/work-locations/:id", async (req, res) => {
    try {
      await storage.deleteWorkLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Extract unique locations from all request revisions in a project
  app.get("/api/projects/:projectId/request-locations", async (req, res) => {
    try {
      const { projectId } = req.params;
      const requests = await storage.getRequestsByProject(projectId);
      const validRevisionIds = requests.map(r => r.currentRevisionId).filter(Boolean) as string[];

      if (validRevisionIds.length === 0) {
        return res.json({ buildings: [], floors: [], parts: [] });
      }

      const locations = await db.select().from(requestWorkLocations).where(inArray(requestWorkLocations.revisionId, validRevisionIds));

      const buildings = new Set<string>();
      const floors = new Set<string>();
      const parts = new Set<string>();

      locations.forEach(loc => {
        if (loc.building && loc.building.trim()) buildings.add(loc.building.trim());
        if (loc.floor && loc.floor.trim()) floors.add(loc.floor.trim());
        if (loc.part && loc.part.trim()) parts.add(loc.part.trim());
      });

      res.json({
        buildings: Array.from(buildings).sort(),
        floors: Array.from(floors).sort(),
        parts: Array.from(parts).sort()
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Type Settings API (Dynamic Schema)
  app.get("/api/projects/:projectId/request-type-settings", async (req, res) => {
    try {
      const settings = await storage.getRequestTypeSettings(req.params.projectId);
      res.json(settings);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/request-type-settings", async (req, res) => {
    try {
      const validatedData = insertRequestTypeSettingsSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const settings = await storage.createRequestTypeSetting(validatedData);
      res.status(201).json(settings);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/projects/:projectId/request-type-settings/:id", async (req, res) => {
    try {
      const validatedData = updateRequestTypeSettingsSchema.parse(req.body);
      const settings = await storage.updateRequestTypeSetting(req.params.id, validatedData);
      res.json(settings);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Team Member Permissions (RBAC) API
  app.get("/api/projects/:projectId/permissions/:requestTypeId", async (req, res) => {
    try {
      const { projectId, requestTypeId } = req.params;
      const permissions = await storage.getTeamMemberPermissions(projectId, requestTypeId);
      res.json(permissions);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/permissions", async (req, res) => {
    try {
      // Check if user is authenticated and has admin/super_admin role
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = req.user as User;
      if (user.role !== 'org_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only administrators can modify permissions" });
      }

      const { projectId } = req.params;
      const { teamMemberId, requestTypeId, canView, canCreate, canEdit } = req.body;

      if (!teamMemberId || !requestTypeId) {
        return res.status(400).json({ error: "teamMemberId and requestTypeId are required" });
      }

      const permission = await storage.upsertTeamMemberPermission(
        projectId,
        teamMemberId,
        requestTypeId,
        canView ?? true,
        canCreate ?? false,
        canEdit ?? false
      );
      res.json(permission);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/projects/:projectId/permissions/:id", async (req, res) => {
    try {
      // Check if user is authenticated and has admin/super_admin role
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = req.user as User;
      if (user.role !== 'org_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only administrators can modify permissions" });
      }

      await storage.deleteTeamMemberPermission(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Work List Divisions API
  app.get("/api/work-list-divisions", async (req, res) => {
    try {
      const divisions = await storage.getAllWorkListDivisions();
      res.json(divisions);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/work-list-divisions/:id", async (req, res) => {
    try {
      const division = await storage.getWorkListDivision(req.params.id);
      if (!division) {
        return res.status(404).json({ error: "Work list division not found" });
      }
      res.json(division);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-list-divisions", async (req, res) => {
    try {
      const validatedData = insertWorkListDivisionSchema.parse(req.body);
      const division = await storage.createWorkListDivision(validatedData);
      res.status(201).json(division);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Work List Chapters API
  app.get("/api/work-list-chapters", async (req, res) => {
    try {
      const { divisionId } = req.query;
      const chapters = divisionId
        ? await storage.getWorkListChaptersByDivision(divisionId as string)
        : await storage.getAllWorkListChapters();
      res.json(chapters);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/work-list-chapters/:id", async (req, res) => {
    try {
      const chapter = await storage.getWorkListChapter(req.params.id);
      if (!chapter) {
        return res.status(404).json({ error: "Work list chapter not found" });
      }
      res.json(chapter);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-list-chapters", async (req, res) => {
    try {
      const validatedData = insertWorkListChapterSchema.parse(req.body);
      const chapter = await storage.createWorkListChapter(validatedData);
      res.status(201).json(chapter);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/work-list-chapters/:id", async (req, res) => {
    try {
      const validatedData = updateWorkListChapterSchema.parse(req.body);
      const chapter = await storage.updateWorkListChapter(req.params.id, validatedData);
      res.json(chapter);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/work-list-chapters/:id", async (req, res) => {
    try {
      await storage.deleteWorkListChapter(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Work List Activities API
  app.get("/api/work-list-activities", async (req, res) => {
    try {
      const { chapterId } = req.query;
      const activities = chapterId
        ? await storage.getWorkListActivitiesByChapter(chapterId as string)
        : await storage.getAllWorkListActivities();
      res.json(activities);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/work-list-activities/:id", async (req, res) => {
    try {
      const activity = await storage.getWorkListActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Work list activity not found" });
      }
      res.json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-list-activities", async (req, res) => {
    try {
      const validatedData = insertWorkListActivitySchema.parse(req.body);
      const activity = await storage.createWorkListActivity(validatedData);
      res.status(201).json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/work-list-activities/:id", async (req, res) => {
    try {
      const validatedData = updateWorkListActivitySchema.parse(req.body);
      const activity = await storage.updateWorkListActivity(req.params.id, validatedData);
      res.json(activity);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/work-list-activities/:id", async (req, res) => {
    try {
      await storage.deleteWorkListActivity(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Checklist Items API
  // Dedicated search endpoint for checklist items
  app.get("/api/checklist-items/search", async (req, res) => {
    try {
      const { q, category } = req.query;
      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json([]);
      }

      // Map category name to system category if needed
      let searchCategory = category as string | undefined;

      const items = await storage.searchChecklistItems(q.trim(), searchCategory);
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/checklist-items", async (req, res) => {
    try {
      const { category, q } = req.query;
      let items;
      if (q && typeof q === 'string' && q.trim()) {
        items = await storage.searchChecklistItems(q.trim(), category as string | undefined);
      } else if (category) {
        items = await storage.getChecklistItemsByCategory(category as string);
      } else {
        items = await storage.getAllChecklistItems();
      }
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/checklist-items", async (req, res) => {
    try {
      const validatedData = insertChecklistItemSchema.parse(req.body);
      const item = await storage.createChecklistItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/checklist-items/:id", async (req, res) => {
    try {
      const validatedData = updateChecklistItemSchema.parse(req.body);
      const item = await storage.updateChecklistItem(req.params.id, validatedData);
      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/checklist-items/:id", async (req, res) => {
    try {
      await storage.deleteChecklistItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Activity Checklist Items API (Junction table)
  app.get("/api/work-list-activities/:activityId/checklist-items", async (req, res) => {
    try {
      const items = await storage.getChecklistItemsByActivity(req.params.activityId);
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/work-list-activities/:activityId/checklist-items", async (req, res) => {
    try {
      const { checklistItemIds, addedBy } = req.body;
      if (!Array.isArray(checklistItemIds)) {
        return res.status(400).json({ error: "checklistItemIds must be an array" });
      }
      await storage.setChecklistItemsForActivity(req.params.activityId, checklistItemIds, addedBy);
      const items = await storage.getChecklistItemsByActivity(req.params.activityId);
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-list-activities/:activityId/checklist-items", async (req, res) => {
    try {
      const { checklistItemId, addedBy } = req.body;
      if (!checklistItemId) {
        return res.status(400).json({ error: "checklistItemId is required" });
      }
      const item = await storage.addChecklistItemToActivity(req.params.activityId, checklistItemId, addedBy);
      res.status(201).json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/work-list-activities/:activityId/checklist-items/:checklistItemId", async (req, res) => {
    try {
      await storage.removeChecklistItemFromActivity(req.params.activityId, req.params.checklistItemId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Work Levels API
  app.get("/api/projects/:projectId/work-levels", async (req, res) => {
    try {
      const levels = await storage.getWorkLevelsByProject(req.params.projectId);
      res.json(levels);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/work-levels", async (req, res) => {
    try {
      const validatedData = insertWorkLevelSchema.parse(req.body);
      const level = await storage.createWorkLevel(validatedData);
      res.status(201).json(level);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/work-levels/:id", async (req, res) => {
    try {
      const validatedData = updateWorkLevelSchema.parse(req.body);
      const level = await storage.updateWorkLevel(req.params.id, validatedData);
      res.json(level);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/work-levels/:id", async (req, res) => {
    try {
      await storage.deleteWorkLevel(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Deliveries API
  app.get("/api/projects/:projectId/deliveries", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if user is admin who can see everything
      const isAdmin = currentUser.user.role === "super_admin" ||
        currentUser.user.role === "developer_admin" ||
        currentUser.user.role === "org_admin";

      const deliveriesData = await storage.getDeliveriesByProject(req.params.projectId);

      const deliveryIds = deliveriesData.map(d => d.id);
      let requestLinks: any[] = [];
      if (deliveryIds.length > 0) {
        requestLinks = await db.select({
          deliveryId: requestDeliveries.deliveryId,
          requestNumber: requests.requestNumber,
          currentStatus: requests.currentStatus,
          requestId: requests.id,
          revisionId: requestRevisions.id,
          approvalStatusCode: requestRevisions.approvalStatusCode,
        })
          .from(requestDeliveries)
          .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
          .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
          .where(inArray(requestDeliveries.deliveryId, deliveryIds));

        // Fetch purposes for these linked requests to check permissions
        const revisionIds = Array.from(new Set(requestLinks.map(l => l.revisionId).filter(Boolean)));
        if (revisionIds.length > 0) {
          const linksPurposes = await db.select().from(requestPurposes).where(inArray(requestPurposes.revisionId, revisionIds));
          requestLinks.forEach(link => {
            link.purposes = linksPurposes.filter(p => p.revisionId === link.revisionId);
          });
        }
      }


      // Get user's purposes for visibility filtering
      const allUserTeamMembers = await storage.getAllUserTeamMembers();
      const userTeamMemberIds = allUserTeamMembers
        .filter(utm => utm.userId === currentUser.user.id)
        .map(utm => utm.teamMemberId);

      const teamMembers = await storage.getAllTeamMembers();
      const userTeamMembersList = teamMembers.filter(tm => userTeamMemberIds.includes(tm.id));

      const allPositions = await storage.getAllPositions();
      const userPurposeIds = new Set<string>();
      let userHasNoPurpose = false;

      for (const tm of userTeamMembersList) {
        if (tm.position) {
          const position = allPositions.find(p => p.titleEnglish === tm.position);
          if (position?.purposeId) {
            userPurposeIds.add(position.purposeId);
          } else {
            userHasNoPurpose = true;
          }
        }
      }

      const requestLinkMap = new Map();
      requestLinks.forEach(link => {
        if (!requestLinkMap.has(link.deliveryId)) requestLinkMap.set(link.deliveryId, []);
        requestLinkMap.get(link.deliveryId).push(link);
      });

      const mappedDeliveries = deliveriesData.map(d => {
        const links = requestLinkMap.get(d.id) || [];

        // Visibility check based on purpose
        if (!isAdmin && !userHasNoPurpose) {
          // If a DN is associated with MIR(s), check if user has matching purpose for ANY of them
          if (links.length > 0) {
            const hasMatchingPurpose = links.some((link: any) =>
              link.purposes?.some((rp: any) => userPurposeIds.has(rp.purposeId))
            );
            if (!hasMatchingPurpose) return null;
          }
          // DNs not linked to any MIR are currently visible to all authenticated users
        }

        const mapUrl = (url: string | null | undefined): string | null => {
          if (url && !url.startsWith('http') && R2_PUBLIC_BASE_URL) {
            return url.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${url}` : `${R2_PUBLIC_BASE_URL}/${url}`;
          }
          return url ?? null;
        };

        let mappedD = d;
        if (d.attachment) {
          mappedD = {
            ...d,
            attachment: {
              ...d.attachment,
              fileData: mapUrl(d.attachment.fileData) as string,
              fileUrl: mapUrl(d.attachment.fileUrl)
            }
          };
        }

        // Define status priority to handle multiple linked revisions correctly
        // Approved (A, B) > Resubmit (C) > Rejected (D, E)
        const hasApproved = links.some((l: any) => l.approvalStatusCode === 'A' || l.approvalStatusCode === 'B');
        const hasResubmit = links.some((l: any) => l.approvalStatusCode === 'C');
        const hasRejected = links.some((l: any) => l.approvalStatusCode === 'D' || l.approvalStatusCode === 'E');

        const isRejected = hasRejected && !hasApproved && !hasResubmit;
        const isResubmit = hasResubmit && !hasApproved;
        const isFinalApproved = hasApproved || links.some((l: any) =>
          l.currentStatus?.toLowerCase().includes('approved') ||
          l.currentStatus?.toLowerCase().includes('closed')
        );

        const isInspected = isFinalApproved || isResubmit || isRejected || links.some((l: any) =>
          l.approvalStatusCode !== null ||
          l.currentStatus?.toLowerCase().includes('approved') ||
          l.currentStatus?.toLowerCase() === 'inspected' ||
          l.currentStatus?.toLowerCase().includes('closed') ||
          l.currentStatus?.toLowerCase().includes('rejected') ||
          l.currentStatus?.toLowerCase().includes('resubmit')
        );

        // Deduplicate links for display, while keeping raw links for status logic
        const uniqueLinksMap = new Map();
        const revCountsMap = new Map();

        links.forEach((l: any) => {
          revCountsMap.set(l.requestId, (revCountsMap.get(l.requestId) || 0) + 1);
          const existing = uniqueLinksMap.get(l.requestId);
          if (!existing || (l.approvalStatusCode && !existing.approvalStatusCode)) {
            uniqueLinksMap.set(l.requestId, l);
          }
        });

        const deduplicatedLinks = Array.from(uniqueLinksMap.values()).map(l => ({
          ...l,
          revCount: revCountsMap.get(l.requestId)
        }));

        return {
          ...mappedD,
          linkedRequests: deduplicatedLinks,
          revisionCount: links.length,
          isInspected,
          isRejected,
          isResubmit,
          isFinalApproved
        };
      }).filter(Boolean);

      res.json(mappedDeliveries);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/deliveries/:id", async (req, res) => {
    try {
      const delivery = await storage.getDelivery(req.params.id);
      if (!delivery) return res.status(404).json({ error: "Delivery not found" });
      const items = await storage.getDeliveryItems(delivery.id);

      // Map attachment if exists (we might need to fetch it explicitly if getDelivery doesn't include it, but let's check getDelivery)
      // Actually, storage.getDelivery usually returns just the delivery row.
      // If the frontend needs the attachment, the list endpoint is more important, but let's be safe.
      res.json({ ...delivery, items });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/deliveries/:id", async (req, res) => {
    try {
      const validatedData = updateDeliverySchema.parse(req.body);
      const delivery = await storage.updateDelivery(req.params.id, validatedData);
      res.json(delivery);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/deliveries/:id", async (req, res) => {
    try {
      await storage.deleteDelivery(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delivery Items API
  app.patch("/api/delivery-items/:id", async (req, res) => {
    try {
      const validatedData = updateDeliveryItemSchema.parse(req.body);
      const item = await storage.updateDeliveryItem(req.params.id, validatedData);
      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/delivery-items/:id", async (req, res) => {
    try {
      await storage.deleteDeliveryItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // ==========================================
  // Inventory API - warehouses, balances and the stock ledger.
  // Every endpoint here requires authentication: unlike /api/materials, these read and
  // write quantities that the project's accounting depends on.
  // Balances are intentionally NOT purpose-filtered the way deliveries are; a stock
  // balance must read the same for every member of the project.
  // ==========================================

  // Resolves everything the inventory permission checks need in one place: the user, the
  // project, and whether the user holds an approver position on it.
  const getInventoryContext = async (req: any, projectId: string) => {
    const currentUser = await getCurrentUserWithOrg(req);
    if (!currentUser) return null;

    const project = await storage.getProject(projectId);
    if (!project) return null;

    const isApproverPosition = await storage.canUserApproveIssues(currentUser.user.id, projectId);
    const permissions = InventoryPermissions.forProject(
      currentUser.user as any,
      project as any,
      currentUser.orgId,
      isApproverPosition
    );
    return { currentUser, project, isApproverPosition, permissions };
  };

  // Fires low-stock alerts after a stock-reducing operation has already committed. Kept
  // outside the transaction on purpose: a failed notification must never undo a movement
  // that physically happened.
  const alertLowStock = async (
    projectId: string,
    changes: { materialId: string; delta: number }[],
    senderId?: string
  ) => {
    try {
      const crossings = await storage.getLowStockCrossings(projectId, changes);
      await notificationService.notifyLowStock(
        projectId,
        crossings.map((c) => ({
          materialName: c.materialName,
          balance: c.balance,
          minStockLevel: c.minStockLevel,
          unit: c.unit,
        })),
        senderId
      );
    } catch (error) {
      console.error("[alertLowStock] Failed:", error);
    }
  };

  // Delivery notes all land in one folder so they are findable in project storage
  // instead of scattered wherever each uploader happened to be. Created on first use.
  const DELIVERY_NOTE_FOLDER = "Delivery Note";

  app.get("/api/projects/:projectId/delivery-note-folder", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const projectId = req.params.projectId;

      const [existing] = await db
        .select()
        .from(projectFolders)
        .where(
          and(
            eq(projectFolders.projectId, projectId),
            eq(projectFolders.name, DELIVERY_NOTE_FOLDER),
            isNull(projectFolders.parentId)
          )
        )
        .limit(1);

      if (existing) return res.json(existing);

      const [created] = await db
        .insert(projectFolders)
        .values({
          projectId,
          name: DELIVERY_NOTE_FOLDER,
          parentId: null,
          createdBy: currentUser.user.id,
        })
        .returning();
      res.json(created);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/warehouses", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const result = await storage.getWarehousesByProject(req.params.projectId);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/warehouses", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canManageWarehouses) {
        return res.status(403).json({ error: "ليس لديك صلاحية إدارة المستودعات" });
      }
      const validated = insertWarehouseSchema.parse({ ...req.body, projectId: req.params.projectId });
      res.status(201).json(await storage.createWarehouse(validated));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/warehouses/:id", async (req, res) => {
    try {
      const warehouse = await storage.getWarehouse(req.params.id);
      if (!warehouse) return res.status(404).json({ error: "المستودع غير موجود" });

      const ctx = await getInventoryContext(req, warehouse.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canManageWarehouses) {
        return res.status(403).json({ error: "ليس لديك صلاحية إدارة المستودعات" });
      }
      const validated = updateWarehouseSchema.parse(req.body);
      res.json(await storage.updateWarehouse(req.params.id, validated));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      const warehouse = await storage.getWarehouse(req.params.id);
      if (!warehouse) return res.status(404).json({ error: "المستودع غير موجود" });

      const ctx = await getInventoryContext(req, warehouse.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canManageWarehouses) {
        return res.status(403).json({ error: "ليس لديك صلاحية إدارة المستودعات" });
      }
      await storage.deleteWarehouse(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/stock-balances", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const warehouseId = typeof req.query.warehouseId === "string" && req.query.warehouseId
        ? req.query.warehouseId
        : undefined;
      const result = await storage.getStockBalances(req.params.projectId, warehouseId);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/stock-movements", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const str = (key: string) =>
        typeof req.query[key] === "string" && req.query[key] ? (req.query[key] as string) : undefined;
      const limitRaw = parseInt(str("limit") ?? "", 10);
      const result = await storage.getStockMovements(req.params.projectId, {
        warehouseId: str("warehouseId"),
        materialId: str("materialId"),
        movementType: str("movementType") as any,
        sourceType: str("sourceType") as any,
        dateFrom: str("dateFrom"),
        dateTo: str("dateTo"),
        limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : undefined,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Manual ledger entries. Gated more tightly than receipts and issues: an adjustment can
  // change a balance with no document behind it, so it is the most abuse-prone action here.
  app.post("/api/projects/:projectId/stock-movements", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canAdjust) {
        return res.status(403).json({ error: "ليس لديك صلاحية تسجيل تسويات المخزون" });
      }

      const validated = createManualStockMovementSchema.parse(req.body);
      const movement = await storage.createManualStockMovement(req.params.projectId, {
        ...validated,
        performedBy: ctx.currentUser.user.id,
      });
      res.status(201).json(movement);

      if (stockDirection(movement.movementType) === "out") {
        void alertLowStock(
          req.params.projectId,
          [{ materialId: movement.materialId, delta: -Number(movement.quantity) }],
          ctx.currentUser.user.id
        );
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  // Bulk data for exporting request forms. One grouped fetch for the whole batch: the
  // browser then renders and zips the PDFs without touching the database again.
  app.get("/api/projects/:projectId/request-forms/export-data", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) return res.status(401).json({ error: "Authentication required" });

      const typeCode = String(req.query.typeCode || "").trim();
      if (!typeCode) return res.status(400).json({ error: "نوع الطلب مطلوب" });

      const str = (k: string) =>
        typeof req.query[k] === "string" && req.query[k] ? (req.query[k] as string) : undefined;
      const limitRaw = parseInt(str("limit") ?? "", 10);

      const data = await storage.getRequestFormsExportData(req.params.projectId, typeCode, {
        dateFrom: str("dateFrom"),
        dateTo: str("dateTo"),
        status: str("status"),
        // Capped: the browser has to render and convert every form, and an unbounded
        // batch would exhaust the tab long before the database noticed.
        limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 200,
      });

      // File URLs are stored as R2 object keys. Left relative they resolve against the
      // app's own origin and 404, so the exported form would print empty image boxes.
      const mapUrl = (url: string | null | undefined): string | null => {
        if (url && !url.startsWith("http") && !url.startsWith("data:") && R2_PUBLIC_BASE_URL) {
          return url.startsWith("/") ? `${R2_PUBLIC_BASE_URL}${url}` : `${R2_PUBLIC_BASE_URL}/${url}`;
        }
        return url ?? null;
      };

      data.attachments = (data.attachments ?? []).map((a: any) => ({
        ...a,
        fileUrl: mapUrl(a.fileUrl),
        fileData: mapUrl(a.fileData),
      }));
      data.documents = (data.documents ?? []).map((d: any) => ({
        ...d,
        fileUrl: mapUrl(d.fileUrl),
      }));
      // Delivery note documents are printed on their own page of the MIR form.
      data.deliveries = (data.deliveries ?? []).map((rd: any) => ({
        ...rd,
        delivery: rd.delivery
          ? {
              ...rd.delivery,
              attachment: rd.delivery.attachment
                ? {
                    ...rd.delivery.attachment,
                    fileUrl: mapUrl(rd.delivery.attachment.fileUrl),
                    fileData: mapUrl(rd.delivery.attachment.fileData),
                  }
                : null,
            }
          : rd.delivery,
      }));
      for (const key of ["developer", "contractor", "consultant"] as const) {
        if (data[key]) data[key] = { ...data[key], logoUrl: mapUrl(data[key].logoUrl) };
      }
      if (data.project) data.project = { ...data.project, logoUrl: mapUrl(data.project.logoUrl) };

      res.json(data);
    } catch (error) {
      handleError(res, error);
    }
  });

  // How many forms a given filter would export, so the user sees the size before starting.
  app.get("/api/projects/:projectId/request-forms/export-count", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) return res.status(401).json({ error: "Authentication required" });

      const typeCode = String(req.query.typeCode || "").trim();
      if (!typeCode) return res.status(400).json({ error: "نوع الطلب مطلوب" });

      const [type] = await db.select().from(requestTypes).where(eq(requestTypes.code, typeCode));
      if (!type) return res.status(404).json({ error: "نوع الطلب غير موجود" });

      const str = (k: string) =>
        typeof req.query[k] === "string" && req.query[k] ? (req.query[k] as string) : undefined;
      const conditions = [
        eq(requests.projectId, req.params.projectId),
        eq(requests.requestTypeId, type.id),
        eq(requests.is_deleted, false),
      ];
      const dateFrom = str("dateFrom");
      const dateTo = str("dateTo");
      const status = str("status");
      if (dateFrom) conditions.push(gte(requests.createdAt, dateFrom as any));
      if (dateTo) conditions.push(lte(requests.createdAt, dateTo as any));
      if (status) conditions.push(eq(requests.currentStatus, status));

      const [row] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(requests)
        .where(and(...conditions));
      res.json({ count: row?.count ?? 0 });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ---- Transfers between warehouses ----

  app.get("/api/projects/:projectId/stock-transfers", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canView) {
        return res.status(403).json({ error: "ليس لديك صلاحية عرض مخزون هذا المشروع" });
      }
      res.json(await storage.getStockTransfersByProject(req.params.projectId));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/stock-transfers", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canTransfer) {
        return res.status(403).json({ error: "ليس لديك صلاحية التحويل بين المستودعات" });
      }

      const validated = createStockTransferSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      const transfer = await storage.createStockTransfer({
        ...validated,
        createdBy: ctx.currentUser.user.id,
      });
      res.status(201).json(transfer);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ---- Material issues (صرف المواد) ----

  app.get("/api/projects/:projectId/material-issues", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canView) {
        return res.status(403).json({ error: "ليس لديك صلاحية عرض مخزون هذا المشروع" });
      }

      const issues = await storage.getMaterialIssuesByProject(req.params.projectId);
      // The client uses these to decide which actions to render at all.
      res.json({ issues, permissions: ctx.permissions });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Single source of truth for what the warehouse UI may offer this user.
  app.get("/api/projects/:projectId/inventory-permissions", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      res.json(ctx.permissions);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/material-issues/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) return res.status(401).json({ error: "Authentication required" });

      const issue = await storage.getMaterialIssue(req.params.id);
      if (!issue) return res.status(404).json({ error: "سند الصرف غير موجود" });
      res.json(issue);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/material-issues", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canIssue) {
        return res.status(403).json({ error: "ليس لديك صلاحية صرف مواد من هذا المشروع" });
      }

      const validated = createMaterialIssueSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      const issue = await storage.createMaterialIssueWithItems({
        ...validated,
        createdBy: ctx.currentUser.user.id,
      });
      res.status(201).json(issue);

      // A pending voucher has not moved any stock yet, so there is nothing to alert on.
      if (issue.status === "issued") {
        void alertLowStock(
          req.params.projectId,
          (issue.items ?? []).map((i: any) => ({ materialId: i.materialId, delta: -Number(i.quantity) })),
          ctx.currentUser.user.id
        );
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/material-issues/:id/approve", async (req, res) => {
    try {
      const issue = await storage.getMaterialIssue(req.params.id);
      if (!issue) return res.status(404).json({ error: "سند الصرف غير موجود" });

      const ctx = await getInventoryContext(req, issue.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canApproveIssue) {
        return res.status(403).json({ error: "منصبك لا يملك صلاحية اعتماد سندات الصرف في هذا المشروع" });
      }
      res.json(await storage.approveMaterialIssue(req.params.id, ctx.currentUser.user.id));

      // Approval is where a pending voucher's stock actually leaves the warehouse.
      void alertLowStock(
        issue.projectId,
        (issue.items ?? []).map((i: any) => ({ materialId: i.materialId, delta: -Number(i.quantity) })),
        ctx.currentUser.user.id
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/material-issues/:id/reject", async (req, res) => {
    try {
      const issue = await storage.getMaterialIssue(req.params.id);
      if (!issue) return res.status(404).json({ error: "سند الصرف غير موجود" });

      const ctx = await getInventoryContext(req, issue.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canApproveIssue) {
        return res.status(403).json({ error: "منصبك لا يملك صلاحية رفض سندات الصرف في هذا المشروع" });
      }
      const { rejectionReason } = rejectMaterialIssueSchema.parse(req.body);
      res.json(await storage.rejectMaterialIssue(req.params.id, ctx.currentUser.user.id, rejectionReason));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/material-issues/:id/cancel", async (req, res) => {
    try {
      const issue = await storage.getMaterialIssue(req.params.id);
      if (!issue) return res.status(404).json({ error: "سند الصرف غير موجود" });

      const ctx = await getInventoryContext(req, issue.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canCancelIssue) {
        return res.status(403).json({ error: "ليس لديك صلاحية إلغاء سندات الصرف" });
      }
      res.json(await storage.cancelMaterialIssue(req.params.id, ctx.currentUser.user.id));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Which positions may approve issue vouchers in this project.
  app.get("/api/projects/:projectId/inventory-approvers", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const [approvers, coverage] = await Promise.all([
        storage.getInventoryApproverPositions(req.params.projectId),
        storage.getProjectPositionCoverage(req.params.projectId),
      ]);
      res.json({ approvers, coverage, canManage: ctx.permissions.canManageApprovers });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/projects/:projectId/inventory-approvers", async (req, res) => {
    try {
      const ctx = await getInventoryContext(req, req.params.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canManageApprovers) {
        return res.status(403).json({ error: "ليس لديك صلاحية تعديل معتمدي سندات الصرف" });
      }

      const { positionIds } = z.object({ positionIds: z.array(z.string()) }).parse(req.body);
      await storage.setInventoryApproverPositions(req.params.projectId, positionIds);
      res.json(await storage.getInventoryApproverPositions(req.params.projectId));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/low-stock", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const result = await storage.getLowStockMaterials(req.params.projectId);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Deliveries API
  app.get("/api/revisions/:revisionId/deliveries", async (req, res) => {
    try {
      const deliveries = await storage.getRequestDeliveries(req.params.revisionId);
      const mappedDeliveries = deliveries.map(d => {
        if (d.delivery.attachment) {
          const attachment = d.delivery.attachment;
          const mapUrl = (url: string | null | undefined): string | null => {
            if (url && !url.startsWith('http') && !url.startsWith('data:') && R2_PUBLIC_BASE_URL) {
              return url.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${url}` : `${R2_PUBLIC_BASE_URL}/${url}`;
            }
            return url ?? null;
          };

          return {
            ...d,
            delivery: {
              ...d.delivery,
              attachment: {
                ...attachment,
                fileData: mapUrl(attachment.fileData) as string,
                fileUrl: mapUrl(attachment.fileUrl)
              }
            }
          };
        }
        return d;
      });
      res.json(mappedDeliveries);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:revisionId/deliveries", async (req, res) => {
    try {
      const validatedData = insertRequestDeliverySchema.parse({
        ...req.body,
        revisionId: req.params.revisionId,
      });
      const result = await storage.createRequestDelivery(validatedData);
      res.status(201).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:revisionId/deliveries", async (req, res) => {
    try {
      await storage.deleteRequestDeliveriesByRevision(req.params.revisionId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Suppliers API
  app.get("/api/revisions/:revisionId/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getRevisionSuppliers(req.params.revisionId);
      res.json(suppliers);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:revisionId/suppliers", async (req, res) => {
    try {
      const validatedData = insertRequestSupplierSchema.parse({
        ...req.body,
        revisionId: req.params.revisionId,
      });
      const result = await storage.linkSupplierToRevision(validatedData);
      res.status(201).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:revisionId/suppliers", async (req, res) => {
    try {
      await storage.deleteRevisionSuppliersByRevision(req.params.revisionId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Materials API
  app.get("/api/revisions/:revisionId/materials", async (req, res) => {
    try {
      const requestMaterialsList = await storage.getRequestMaterials(req.params.revisionId);
      res.json(requestMaterialsList);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:revisionId/materials", async (req, res) => {
    try {
      const validatedData = insertRequestMaterialSchema.parse({
        ...req.body,
        revisionId: req.params.revisionId,
      });
      const result = await storage.linkMaterialToRevision(validatedData);
      res.status(201).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:revisionId/materials", async (req, res) => {
    try {
      await storage.deleteRequestMaterialsByRevision(req.params.revisionId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Purposes API
  app.get("/api/purposes", async (req, res) => {
    try {
      const purposes = await storage.getAllPurposes();
      res.json(purposes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/purposes/:id", async (req, res) => {
    try {
      const purpose = await storage.getPurpose(req.params.id);
      if (!purpose) {
        return res.status(404).json({ error: "Purpose not found" });
      }
      res.json(purpose);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/purposes", async (req, res) => {
    try {
      const validatedData = insertPurposeSchema.parse(req.body);
      const purpose = await storage.createPurpose(validatedData);
      res.status(201).json(purpose);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/purposes/:id", async (req, res) => {
    try {
      const validatedData = updatePurposeSchema.parse(req.body);
      const purpose = await storage.updatePurpose(req.params.id, validatedData);
      res.json(purpose);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/purposes/:id", async (req, res) => {
    try {
      await storage.deletePurpose(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Positions API
  app.get("/api/positions", async (req, res) => {
    try {
      const positions = await storage.getAllPositions();
      res.json(positions);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/positions/:id", async (req, res) => {
    try {
      const position = await storage.getPosition(req.params.id);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      res.json(position);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/positions", async (req, res) => {
    try {
      const validatedData = insertPositionSchema.parse(req.body);
      const position = await storage.createPosition(validatedData);
      res.status(201).json(position);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/positions/:id", async (req, res) => {
    try {
      const validatedData = updatePositionSchema.parse(req.body);
      const position = await storage.updatePosition(req.params.id, validatedData);
      res.json(position);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/positions/:id", async (req, res) => {
    try {
      await storage.deletePosition(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Types API
  app.get("/api/request-types", async (req, res) => {
    try {
      const types = await storage.getAllRequestTypes();
      res.json(types);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/request-types/:id", async (req, res) => {
    try {
      const type = await storage.getRequestType(req.params.id);
      if (!type) {
        return res.status(404).json({ error: "Request type not found" });
      }
      res.json(type);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/request-types", async (req, res) => {
    try {
      console.log("POST /api/request-types body:", JSON.stringify(req.body));
      const validatedData = insertRequestTypeSchema.parse(req.body);
      const type = await storage.createRequestType(validatedData);
      res.status(201).json(type);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/request-types/:id", async (req, res) => {
    try {
      console.log(`PATCH /api/request-types/${req.params.id} body:`, JSON.stringify(req.body));
      const validatedData = updateRequestTypeSchema.parse(req.body);
      const type = await storage.updateRequestType(req.params.id, validatedData);
      res.json(type);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/request-types/:id", async (req, res) => {
    try {
      await storage.deleteRequestType(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // WIR Requests API
  app.get("/api/requests", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { projectId } = req.query;

      // Get user's linked team member and position purpose
      const allUserTeamMembers = await storage.getAllUserTeamMembers();
      const userTeamMemberIds = allUserTeamMembers
        .filter(utm => utm.userId === currentUser.user.id)
        .map(utm => utm.teamMemberId);

      const teamMembers = await storage.getAllTeamMembers();
      const userTeamMembersList = teamMembers.filter(tm => userTeamMemberIds.includes(tm.id));

      const allPositions = await storage.getAllPositions();
      const userPurposeIds = new Set<string>();
      let userHasNoPurpose = false;

      for (const tm of userTeamMembersList) {
        if (tm.position) {
          const position = allPositions.find(p => p.titleEnglish === tm.position);
          if (position?.purposeId) {
            userPurposeIds.add(position.purposeId);
          } else {
            // Position exists but has no purpose assigned - user can view all
            userHasNoPurpose = true;
          }
        }
      }

      const isAdmin = currentUser.user.role === "super_admin" ||
        currentUser.user.role === "developer_admin" ||
        currentUser.user.role === "org_admin";

      const allTypes = await storage.getAllRequestTypes();
      const ncrTypeId = allTypes.find(t => t.code === "NCR")?.id;
      const rncrTypeId = allTypes.find(t => t.code === "RNCR")?.id;

      // ----------------------------------------------------
      // Pass 1: Filtering and Pagination at Database Level
      // ----------------------------------------------------
      const whereClauses: any[] = [eq(requests.is_deleted, false)];

      if (projectId && typeof projectId === 'string') {
        whereClauses.push(eq(requests.projectId, projectId));
      }

      // Filter by activeTab
      const activeTab = req.query.activeTab as string;
      let allowedTypeIds: string[] | null = null;
      if (activeTab) {
        const nonApprovalIds = allTypes.filter(t => {
          if (t.code === "MIR") return true;
          return !t.code.toLowerCase().includes("approval") && !t.name_english.toLowerCase().includes("approval") && t.code?.toUpperCase() !== "SSR";
        }).map(t => t.id);
        const approvalIds = allTypes.filter(t => {
          if (t.code === "MIR") return false;
          return t.code.toLowerCase().includes("approval") || t.name_english.toLowerCase().includes("approval") || t.code?.toUpperCase() === "SSR";
        }).map(t => t.id);

        if (activeTab === "request") {
          const excludedIds = allTypes.filter(t => ["WIR", "DSR", "SD", "ASD"].includes(t.code)).map(t => t.id);
          allowedTypeIds = nonApprovalIds.filter(id => !excludedIds.includes(id));
        } else if (activeTab === "wir" || activeTab === "dsr" || activeTab === "sd" || activeTab === "asd") {
          const targetCode = activeTab.toUpperCase();
          const typeId = allTypes.find(t => t.code === targetCode)?.id;
          allowedTypeIds = typeId ? [typeId] : [];
        } else if (activeTab === "approvals") {
          allowedTypeIds = approvalIds;
        }
      }
      if (allowedTypeIds !== null) {
        if (allowedTypeIds.length > 0) {
          whereClauses.push(inArray(requests.requestTypeId, allowedTypeIds));
        } else {
          whereClauses.push(sql`false`);
        }
      }

      // Filter by Search Term
      const searchTerm = req.query.searchTerm as string;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        whereClauses.push(
          or(
            sql`lower(${requests.requestNumber}) like ${`%${term}%`}`,
            sql`lower(${requestRevisions.activityName}) like ${`%${term}%`}`,
            sql`lower(${requestRevisions.description}) like ${`%${term}%`}`,
            sql`exists (
              select 1 from ${requestWorkLocations} 
              where ${requestWorkLocations.revisionId} = ${requestRevisions.id} 
              and (lower(coalesce(${requestWorkLocations.building}, '')) || ' ' || lower(coalesce(${requestWorkLocations.floor}, '')) || ' ' || lower(coalesce(${requestWorkLocations.part}, ''))) like ${`%${term}%`}
            )`
          )
        );
      }

      // Filter by Status
      const statusFilters = req.query.status as string;
      if (statusFilters) {
        const statuses = statusFilters.split(",");
        const statusSqlList = sql.join(statuses.map(s => sql`${s}`), sql`, `);
        whereClauses.push(
          sql`(
            CASE 
              WHEN ${requestRevisions.approvalStatusCode} = 'C' AND ${requests.currentStatus} <> 'Closed' THEN 'Pending Revision'
              WHEN ${requestRevisions.approvalStatusCode} = 'D' AND ${requests.currentStatus} <> 'Closed' THEN 'Rejected'
              WHEN ${requestRevisions.approvalStatusCode} IN ('A', 'B') AND ${requests.currentStatus} <> 'Closed' THEN 'Approved'
              ELSE COALESCE(${requests.currentStatus}, '')
            END
          ) IN (${statusSqlList})`
        );
      }

      // Filter by Division / Chapter
      const divisionFilter = req.query.division as string;
      if (divisionFilter) {
        whereClauses.push(eq(workListChapters.divisionId, divisionFilter));
      }

      const chapterFilter = req.query.chapter as string;
      if (chapterFilter) {
        whereClauses.push(eq(workListActivities.chapterId, chapterFilter));
      }

      // Filter by Writer
      const writerFilter = req.query.writer as string;
      if (writerFilter) {
        const writers = writerFilter.split(",");
        whereClauses.push(inArray(requests.createdBy, writers));
      }

      // Filter by Location Details (Building, Floor, Part)
      const buildingFilter = req.query.building as string;
      if (buildingFilter) {
        const bfs = buildingFilter.toLowerCase().split(",");
        const buildingConds = bfs.map(bf => sql`lower(${requestWorkLocations.building}) like ${`%${bf}%`}`);
        whereClauses.push(
          sql`exists (
            select 1 from ${requestWorkLocations} 
            where ${requestWorkLocations.revisionId} = ${requestRevisions.id} 
            and (${or(...buildingConds)})
          )`
        );
      }

      const floorFilter = req.query.floor as string;
      if (floorFilter) {
        const ffs = floorFilter.toLowerCase().split(",");
        const floorConds = ffs.map(ff => sql`lower(${requestWorkLocations.floor}) like ${`%${ff}%`}`);
        whereClauses.push(
          sql`exists (
            select 1 from ${requestWorkLocations} 
            where ${requestWorkLocations.revisionId} = ${requestRevisions.id} 
            and (${or(...floorConds)})
          )`
        );
      }

      const partFilter = req.query.part as string;
      if (partFilter) {
        const pfs = partFilter.toLowerCase().split(",");
        const partConds = pfs.map(pf => sql`lower(${requestWorkLocations.part}) like ${`%${pf}%`}`);
        whereClauses.push(
          sql`exists (
            select 1 from ${requestWorkLocations} 
            where ${requestWorkLocations.revisionId} = ${requestRevisions.id} 
            and (${or(...partConds)})
          )`
        );
      }

      // Filter by Activity Name
      const activityFilter = req.query.activity as string;
      if (activityFilter) {
        const af = activityFilter.toLowerCase();
        whereClauses.push(sql`lower(${requestRevisions.activityName}) like ${`%${af}%`}`);
      }

      // Filter by Purpose
      const purposeFilter = req.query.purpose as string;
      if (purposeFilter) {
        const purposes = purposeFilter.split(",");
        const purposeSqlList = sql.join(purposes.map(p => sql`${p}`), sql`, `);
        whereClauses.push(
          sql`exists (
            select 1 from ${requestPurposes} rp 
            where rp.revision_id = ${requestRevisions.id} 
            and rp.purpose_id in (${purposeSqlList})
          )`
        );
      }

      // Filter by Step ID
      const stepFilter = req.query.step as string;
      if (stepFilter) {
        const stepIds = stepFilter.split(",").map(s => parseInt(s)).filter(Number.isInteger);
        if (stepIds.length > 0) {
          whereClauses.push(inArray(requestRevisions.currentStepId, stepIds));
        }
      }

      // Filter by Approval Status Code
      const approvalStatusFilters = req.query.approvalStatus as string;
      if (approvalStatusFilters) {
        const apStatuses = approvalStatusFilters.split(",");
        whereClauses.push(inArray(requestRevisions.approvalStatusCode, apStatuses));
      }

      // Permissions check: Filter based on user purposes
      if (!isAdmin && !userHasNoPurpose) {
        const purposeIdsArr = Array.from(userPurposeIds);
        const matchPurposeCond = purposeIdsArr.length > 0 
          ? sql`exists (
              select 1 from ${requestPurposes} rp 
              where rp.revision_id = ${requestRevisions.id} 
              and rp.purpose_id in (${sql.join(purposeIdsArr.map(id => sql`${id}`), sql`, `)})
            )`
          : sql`false`;

        whereClauses.push(
          or(
            eq(requests.createdBy, currentUser.user.id),
            sql`not exists (
              select 1 from ${requestPurposes} rp 
              where rp.revision_id = ${requestRevisions.id}
            )`,
            matchPurposeCond
          )
        );
      }

      // Permissions check: NCR/RNCR visibility logic
      const isGlobalAdmin = currentUser.user.role === "super_admin" || currentUser.user.role === "developer_admin";
      if (!isGlobalAdmin) {
        const userOrgId = currentUser.user.organizationId;
        const userTmOrgIds = userTeamMembersList.map(tm => tm.organizationId).filter((id): id is string => !!id);
        const contractorConds = [];
        if (userOrgId) {
          contractorConds.push(eq(requests.contractorId, userOrgId));
        }
        if (userTmOrgIds.length > 0) {
          contractorConds.push(inArray(requests.contractorId, userTmOrgIds));
        }
        const isContractorSql = contractorConds.length > 0 ? or(...contractorConds) : sql`false`;

        if (ncrTypeId) {
          whereClauses.push(
            sql`NOT (${requests.requestTypeId} = ${ncrTypeId} AND ${isContractorSql} AND ${requestRevisions.approvalStatusCode} IS NULL)`
          );
        }

        if (rncrTypeId) {
          whereClauses.push(
            sql`NOT (${requests.requestTypeId} = ${rncrTypeId} AND NOT ${isContractorSql} AND ${requestRevisions.currentStepId} IS NOT NULL AND ${requestRevisions.currentStepId} < 1003)`
          );
        }
      }

      // Count total matches
      const countResult = await db
        .select({ count: sql<number>`cast(count(${requests.id}) as integer)` })
        .from(requests)
        .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
        .leftJoin(workListActivities, eq(requestRevisions.workListActivityId, workListActivities.id))
        .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
        .where(and(...whereClauses));
      const total = countResult[0]?.count || 0;

      // Retrieve matching request IDs for current page
      const pageStr = req.query.page as string;
      const limitStr = req.query.limit as string;
      let paginatedRequestIds: string[] = [];

      if (limitStr) {
        const limit = parseInt(limitStr) || 12;
        const page = parseInt(pageStr) || 1;
        const offset = (page - 1) * limit;

        const rows = await db
          .select({ id: requests.id })
          .from(requests)
          .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
          .leftJoin(workListActivities, eq(requestRevisions.workListActivityId, workListActivities.id))
          .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
          .where(and(...whereClauses))
          .orderBy(desc(requests.createdAt))
          .limit(limit)
          .offset(offset);

        paginatedRequestIds = rows.map(r => r.id);
      } else {
        const rows = await db
          .select({ id: requests.id })
          .from(requests)
          .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
          .leftJoin(workListActivities, eq(requestRevisions.workListActivityId, workListActivities.id))
          .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
          .where(and(...whereClauses))
          .orderBy(desc(requests.createdAt));

        paginatedRequestIds = rows.map(r => r.id);
      }

      if (paginatedRequestIds.length === 0) {
        if (limitStr) {
          return res.json({
            data: [],
            total
          });
        }
        return res.json([]);
      }

      // ----------------------------------------------------
      // Pass 2: Enrichment of Paginated Request Rows
      // ----------------------------------------------------
      const pageRequests = await db
        .select({
          id: requests.id,
          requestNumber: requests.requestNumber,
          referenceCode: requests.referenceCode,
          requestTypeId: requests.requestTypeId,
          projectId: requests.projectId,
          projectName: requests.projectName,
          contractorId: requests.contractorId,
          contractorName: requests.contractorName,
          consultantId: requests.consultantId,
          consultantName: requests.consultantName,
          currentStatus: requests.currentStatus,
          currentStepId: requestRevisions.currentStepId,
          currentRevisionId: requests.currentRevisionId,
          createdBy: requests.createdBy,
          userName: users.username,
          createdAt: requests.createdAt,
          updatedAt: requests.updatedAt,
          chapterName: workListChapters.nameEnglish,
          divisionName: workListDivisions.nameEnglish,
          metadata: requestRevisions.metadata,
        })
        .from(requests)
        .leftJoin(users, eq(requests.createdBy, users.id))
        .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
        .leftJoin(workListActivities, eq(requestRevisions.workListActivityId, workListActivities.id))
        .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
        .leftJoin(workListDivisions, eq(workListChapters.divisionId, workListDivisions.id))
        .where(inArray(requests.id, paginatedRequestIds))
        .orderBy(desc(requests.createdAt));

      const validRevisionIds = pageRequests.map(r => r.currentRevisionId).filter(Boolean) as string[];

      let allRevisions: any[] = [];
      let allWorkLocations: any[] = [];
      let allPurposes: any[] = [];
      let allActivities: any[] = [];
      let allChapters: any[] = [];
      let allRequestDeliveries: any[] = [];
      let allDeliveries: any[] = [];
      let allDeliveryItems: any[] = [];
      let allRequestSuppliers: any[] = [];
      let allSuppliers: any[] = [];
      let allRequestWorkLevels: any[] = [];
      let allWorkLevels: any[] = [];

      if (validRevisionIds.length > 0) {
        [allRevisions, allWorkLocations, allPurposes, allRequestDeliveries, allRequestSuppliers, allRequestWorkLevels] = await Promise.all([
          db.select().from(requestRevisions).where(inArray(requestRevisions.id, validRevisionIds)),
          db.select().from(requestWorkLocations).where(inArray(requestWorkLocations.revisionId, validRevisionIds)),
          db.select().from(requestPurposes).where(inArray(requestPurposes.revisionId, validRevisionIds)),
          db.select().from(requestDeliveries).where(inArray(requestDeliveries.revisionId, validRevisionIds)),
          db.select().from(requestSuppliers).where(inArray(requestSuppliers.revisionId, validRevisionIds)),
          db.select().from(requestWorkLevels).where(inArray(requestWorkLevels.revisionId, validRevisionIds))
        ]);

        const deliveryIds = allRequestDeliveries.map(rd => rd.deliveryId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
        if (deliveryIds.length > 0) {
          allDeliveries = await db.select().from(deliveries).where(inArray(deliveries.id, deliveryIds));
          allDeliveryItems = await db.select().from(deliveryItems).where(inArray(deliveryItems.deliveryId, deliveryIds));
        }

        const supplierIds = allRequestSuppliers.map(rs => rs.supplierId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
        if (supplierIds.length > 0) {
          allSuppliers = await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds));
        }

        const workLevelIds = allRequestWorkLevels.map(rwl => rwl.workLevelId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
        if (workLevelIds.length > 0) {
          allWorkLevels = await db.select().from(workLevels).where(inArray(workLevels.id, workLevelIds));
        }

        const activityIds = allRevisions.map(r => r.workListActivityId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
        if (activityIds.length > 0) {
          allActivities = await db.select().from(workListActivities).where(inArray(workListActivities.id, activityIds));
          const chapterIds = allActivities.map(a => a.chapterId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
          if (chapterIds.length > 0) {
            allChapters = await db.select().from(workListChapters).where(inArray(workListChapters.id, chapterIds));
          }
        }
      }

      const revMap = new Map(allRevisions.map(r => [r.id, r]));
      const locMap = new Map();
      allWorkLocations.forEach(l => {
        if (!locMap.has(l.revisionId)) locMap.set(l.revisionId, []);
        locMap.get(l.revisionId).push(l);
      });
      const purpMap = new Map();
      allPurposes.forEach(p => {
        if (!purpMap.has(p.revisionId)) purpMap.set(p.revisionId, []);
        purpMap.get(p.revisionId).push(p);
      });
      const actMap = new Map(allActivities.map(a => [a.id, a]));
      const chapMap = new Map(allChapters.map(c => [c.id, c]));
      const rdMap = new Map();
      allRequestDeliveries.forEach(rd => {
        if (!rdMap.has(rd.revisionId)) rdMap.set(rd.revisionId, []);
        rdMap.get(rd.revisionId).push(rd);
      });
      const rsMap = new Map();
      allRequestSuppliers.forEach(rs => {
        if (!rsMap.has(rs.revisionId)) rsMap.set(rs.revisionId, []);
        rsMap.get(rs.revisionId).push(rs);
      });
      const supMap = new Map(allSuppliers.map(s => [s.id, s]));
      const delMap = new Map(allDeliveries.map(d => [d.id, d]));
      const delItemsMap = new Map();
      allDeliveryItems.forEach(di => {
        if (!delItemsMap.has(di.deliveryId)) delItemsMap.set(di.deliveryId, []);
        delItemsMap.get(di.deliveryId).push(di);
      });
      const rwlMap = new Map();
      allRequestWorkLevels.forEach(rwl => {
        if (!rwlMap.has(rwl.revisionId)) rwlMap.set(rwl.revisionId, []);
        rwlMap.get(rwl.revisionId).push(rwl);
      });
      const wlMap = new Map(allWorkLevels.map(wl => [wl.id, wl]));

      const enrichedRequests = pageRequests.map((request) => {
        if (!request.currentRevisionId) return request;

        const revision = revMap.get(request.currentRevisionId);
        const workLocations = locMap.get(request.currentRevisionId) || [];
        const requestPurposes = purpMap.get(request.currentRevisionId) || [];

        const buildings = workLocations.map((wl: any) => wl.building).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        const floors = workLocations.map((wl: any) => wl.floor).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        const parts = workLocations.map((wl: any) => wl.part).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        const units = workLocations.map((wl: any) => wl.unit).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

        let divisionId = null;
        let chapterId = null;
        if (revision?.workListActivityId) {
          const workListActivity = actMap.get(revision.workListActivityId);
          if (workListActivity) {
            chapterId = workListActivity.chapterId;
            if (chapterId) {
              const chapter = chapMap.get(chapterId);
              if (chapter) {
                divisionId = chapter.divisionId;
              }
            }
          }
        }

        const reqDeliveries = rdMap.get(request.currentRevisionId) || [];
        const deliveryNumbers = reqDeliveries
          .map((rd: any) => delMap.get(rd.deliveryId)?.shipmentNumber)
          .filter(Boolean)
          .join(", ");

        const materialNames = reqDeliveries
          .flatMap((rd: any) => delItemsMap.get(rd.deliveryId) || [])
          .map((di: any) => di.materialName)
          .filter(Boolean)
          .join(", ") || null;

        const reqSuppliers = rsMap.get(request.currentRevisionId) || [];
        const supplierNames = reqSuppliers
          .map((rs: any) => supMap.get(rs.supplierId)?.name)
          .filter(Boolean)
          .join(", ") || null;

        const reqWorkLevels = rwlMap.get(request.currentRevisionId) || [];
        const workLevelNames = reqWorkLevels
          .map((rwl: any) => wlMap.get(rwl.workLevelId)?.nameEnglish)
          .filter(Boolean)
          .join(", ") || null;

        return {
          ...request,
          divisionId,
          chapterId,
          purposeIds: requestPurposes.map((rp: any) => rp.purposeId),
          purposeNames: requestPurposes.map((rp: any) => rp.purposeName),
          deliveryNumbers,
          materialNames,
          supplierNames,
          currentRevision: {
            description: revision?.description || null,
            buildingNo: buildings.join(",") || null,
            floor: floors.join(",") || null,
            workLevels: workLevelNames || null,
            part: parts.join(",") || null,
            units: units.join(",") || null,
            scheduledDate: revision?.scheduledDate || null,
            approvedAt: revision?.approvedAt || null,
            currentStepId: revision?.currentStepId || null,
            approvalStatusCode: revision?.approvalStatusCode || null,
            activityName: revision?.activityName || null,
            chapterName: revision?.chapterName || null,
            divisionName: revision?.divisionName || null,
            revisionNo: revision?.revisionNo || 0,
            metadata: revision?.metadata || null,
          }
        };
      });

      if (limitStr) {
        return res.json({
          data: enrichedRequests,
          total
        });
      }

      res.json(enrichedRequests);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/request-types/:requestTypeId/next-number", async (req, res) => {
    try {
      const nextNumber = await storage.previewNextRequestNumber(req.params.projectId, req.params.requestTypeId);
      res.json({ nextNumber });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id", async (req, res) => {
    try {
      const request = await storage.getRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json(request);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/requests", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const requestData = {
        ...req.body,
        createdBy: currentUser.user.id,
      };

      const request = await storage.createRequest(requestData);

      // Create initial revision (Revision 0)
      const revision = await storage.createRequestRevision({
        requestId: request.id,
        revisionNo: 0,
        createdBy: currentUser.user.id,
        title: requestData.title || "Initial Request",
      });

      // Update request with the revision id
      await storage.updateRequest(request.id, { currentRevisionId: revision.id });

      // Create initial status history entry
      await storage.createRequestStatusHistory({
        revisionId: revision.id,
        oldStatus: "",
        newStatus: request.currentStatus,
        changedBy: currentUser.user.id,
        remarks: "Request created",
      });

      res.status(201).json(request);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create request with revision and activity (transactional workflow endpoint)
  app.post("/api/requests/create-with-revision", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const {
        requestTypeId,
        projectId,
        referenceCode,
        title,
        description,
        workListActivityId,
        workLocationId,
        workLevelId,
        scheduledDate,
        remarks,
        metadata,
      } = req.body;

      // Validate required fields
      if (!requestTypeId || !projectId || !referenceCode || !title) {
        return res.status(400).json({
          error: "Missing required fields: requestTypeId, projectId, referenceCode, and title are required"
        });
      }

      // Fetch project to get contractor and consultant IDs
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get the first workflow step for this request type
      const requestType = await storage.getRequestType(requestTypeId);
      let currentStepId: number | null = null;
      if (requestType?.id_number) {
        const steps = await storage.getWorkflowSteps(requestType.id_number);
        if (steps.length > 0) {
          currentStepId = steps[0].id;
        }
      }

      // Create request with initial revision using transactional method
      // requestNumber will be auto-generated in format XXX-000 (e.g., WIR-001)
      // contractor_id and consultant_id are fetched from the project
      const { request, revision, statusHistory } = await storage.createRequestWithRevision(
        {
          // requestNumber is omitted - will be auto-generated
          referenceCode,
          requestTypeId,
          projectId,
          createdBy: currentUser.user.id,
          contractorId: project.contractorId || null,
          consultantId: project.consultantId || null,
        },
        {
          currentStepId,
          title,
          description: description || null,
          workListActivityId: workListActivityId || null,
          workLocationId: workLocationId || null,
          workLevelId: workLevelId || null,
          scheduledDate: scheduledDate || null,
          divisionName: req.body.divisionName || null,
          chapterName: req.body.chapterName || null,
          activityName: req.body.activityName || null,
          activityCode: req.body.activityCode || null,
          metadata: metadata || null,
        }
      );

      // If this request is linked to a parent NCR (it's an RNCR)
      if (metadata && typeof metadata === 'object' && metadata.linkedNcrId) {
        const parentNcr = await storage.getRequest(metadata.linkedNcrId);
        if (parentNcr) {
          // Update parent NCR status to "In Process"
          await db.update(requests)
            .set({ 
              currentStatus: "In Process",
              updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(requests.id, parentNcr.id));

          // Invalidate/broadcast parent update
          notificationWss.broadcastRequestUpdate(parentNcr.id, currentUser.user.id, "status_changed");
        }
      }


      // 4. Create local activity record for the timeline
      const fullUser = await storage.getUser(currentUser.user.id);
      const activity = await storage.createActivity({
        projectId,
        type: "inspection_request",
        title,
        description: description || `Request ${referenceCode} created`,
        userName: fullUser?.username || fullUser?.email || currentUser.user.id,
        requestId: request.id,
        requestTypeId: request.requestTypeId,
      });
      broadcastActivityUpdate(activity);

      res.status(201).json({ request, revision, statusHistory, activity });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/requests/:id", async (req, res) => {
    try {
      const request = await storage.updateRequest(req.params.id, req.body);
      res.json(request);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/requests/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { reason } = req.body;
      await storage.deleteRequest(req.params.id, reason || null, currentUser.user.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/requests/:id/restore", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      await storage.restoreRequest(req.params.id, currentUser.user.id);
      res.status(200).json({ message: "Request restored successfully" });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/deleted/:projectId", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const requests = await storage.getDeletedRequestsByProject(req.params.projectId);
      res.json(requests);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Revisions API
  app.get("/api/requests/:id/revisions", async (req, res) => {
    try {
      const revisions = await storage.getRequestRevisions(req.params.id);
      res.json(revisions);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create new revision for a request (when statusCode is C or E)
  app.post("/api/requests/:id/revisions", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const requestId = req.params.id;

      // Get the request
      const request = await storage.getRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Get the latest revision to copy data from
      const latestRevision = await storage.getLatestRevision(requestId);
      if (!latestRevision) {
        return res.status(404).json({ error: "No existing revision found" });
      }

      // Check if there's an approval status with code C or E on the revision
      if (!latestRevision.approvalStatusCode || !['C', 'E'].includes(latestRevision.approvalStatusCode)) {
        return res.status(400).json({
          error: "Cannot create new revision. Status code must be C or E"
        });
      }

      // Get workflow step 102 for this request type (skip step 101 on revision)
      const requestType = await storage.getRequestType(request.requestTypeId);
      let currentStepId: number | null = null;
      if (requestType?.id_number) {
        const steps = await storage.getWorkflowSteps(requestType.id_number);
        // Step 102/202 is usually the second step in the sequence
        const step2 = steps.find(s => s.sequenceOrder === 2);
        if (step2) {
          currentStepId = step2.id;
        } else if (steps.length > 1) {
          currentStepId = steps[1].id;
        } else if (steps.length > 0) {
          currentStepId = steps[0].id;
        }
      }

      // Get next revision number (starts from 0)
      const nextRevisionNo = await storage.getNextRevisionNo(requestId);

      // Copy data from previous revision
      const newRevision = await storage.createRequestRevision({
        requestId,
        revisionNo: nextRevisionNo,
        currentStepId,
        title: latestRevision.title,
        description: latestRevision.description ?? undefined,
        workListActivityId: latestRevision.workListActivityId ?? undefined,
        activityCode: latestRevision.activityCode ?? undefined,
        activityName: latestRevision.activityName ?? undefined,
        chapterName: latestRevision.chapterName ?? undefined,
        divisionName: latestRevision.divisionName ?? undefined,
        workLocationId: latestRevision.workLocationId ?? undefined,
        workLevelId: latestRevision.workLevelId ?? undefined,
        workLevelName: latestRevision.workLevelName ?? undefined,
        scheduledDate: latestRevision.scheduledDate ?? undefined,
        remarks: latestRevision.remarks ?? undefined,
        createdBy: currentUser.user.id,
      });

      // Copy purposes from previous revision
      const previousPurposes = await storage.getRequestPurposes(latestRevision.id);
      for (const purpose of previousPurposes) {
        await storage.createRequestPurpose({
          revisionId: newRevision.id,
          purposeId: purpose.purposeId,
          purposeName: purpose.purposeName,
          purposeCategory: purpose.purposeCategory || undefined,
          remarks: purpose.remarks || undefined,
        });
      }

      // Copy work locations from previous revision
      const previousLocations = await storage.getRequestWorkLocations(latestRevision.id);
      for (const location of previousLocations) {
        await storage.createRequestWorkLocation({
          revisionId: newRevision.id,
          workLocationId: location.workLocationId,
          unit: location.unit || undefined,
          zone: location.zone || undefined,
          block: location.block || undefined,
          building: location.building || undefined,
          floor: location.floor || undefined,
          part: location.part || undefined,
        });
      }

      // Copy linked deliveries from previous revision to the new one
      const previousDeliveries = await db.select().from(requestDeliveries).where(eq(requestDeliveries.revisionId, latestRevision.id));
      for (const rd of previousDeliveries) {
        await db.insert(requestDeliveries).values({
          revisionId: newRevision.id,
          deliveryId: rd.deliveryId,
        });
      }

      // Create initial status history for new revision
      await storage.createRequestStatusHistory({
        revisionId: newRevision.id,
        oldStatus: "Created",
        newStatus: "Submitted",
        changedBy: currentUser.user.id,
        remarks: `Revision ${nextRevisionNo} created and submitted`,
      });

      // Update request's currentRevisionId and status
      await storage.updateRequest(requestId, {
        currentRevisionId: newRevision.id,
        currentStatus: "Submitted",
      });

      // Send notifications to team members (matching purposes OR Project Managers)
      const project = await storage.getProject(request.projectId);
      const recipientUserIdSet = new Set<string>();

      // Get all team members from relevant organizations
      const orgIdArr = [request.contractorId, request.consultantId, project?.organizationId].filter(Boolean) as string[];
      const orgIds = Array.from(new Set(orgIdArr));
      let projectTeamMembers: any[] = [];
      for (const orgId of orgIds) {
        const orgMembers = await storage.getTeamMembersByOrganization(orgId);
        projectTeamMembers.push(...orgMembers);
      }

      // 1. Identify positions matching the revision purposes
      const purposeIds = previousPurposes.map(p => p.purposeId);
      let matchingPositionTitles = new Set<string>();

      if (purposeIds.length > 0) {
        const allPositions = await storage.getAllPositions();
        matchingPositionTitles = new Set(
          allPositions
            .filter(p => p.purposeId && purposeIds.includes(p.purposeId))
            .map(p => p.titleEnglish)
        );
      }

      // 2. Target titles for Project Manager
      const managerTitles = ["project manager", "مدير مشروع"];

      // 3. Filter members and collect User IDs
      for (const tm of projectTeamMembers) {
        let shouldNotify = false;
        const position = tm.position ? tm.position.toLowerCase() : "";

        // Check if matches purpose
        // Note: matchingPositionTitles contains exact strings from the DB, so we rely on exact match or strict inclusion logic if needed. 
        // The previous code used `matchingPositionTitles.has(tm.position)`. We keep that.
        if (tm.position && matchingPositionTitles.has(tm.position)) {
          shouldNotify = true;
        }

        // Check if Project Manager (explicit check for partial match)
        if (managerTitles.some(title => position.includes(title))) {
          shouldNotify = true;
        }

        if (shouldNotify) {
          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            if (tmUser.userId !== currentUser.user.id) {
              recipientUserIdSet.add(tmUser.userId);
            }
          }
        }
      }

      const recipientUserIds = Array.from(recipientUserIdSet);
      if (recipientUserIds.length > 0) {
        const fullUser = await storage.getUser(currentUser.user.id);
        await notificationService.notifyNewRevision(
          requestId,
          request.requestNumber || "",
          request.projectId,
          nextRevisionNo,
          fullUser?.username || "مستخدم",
          recipientUserIds
        );
      }

      notificationWss.broadcastRequestUpdate(requestId, currentUser.user.id, "revision_created");

      res.status(201).json(newRevision);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Status History API
  app.get("/api/revisions/:id/history", async (req, res) => {
    try {
      const history = await storage.getRequestStatusHistory(req.params.id);
      res.json(history);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get latest revision for a request
  app.get("/api/requests/:id/latest-revision", async (req, res) => {
    try {
      const revision = await storage.getLatestRevision(req.params.id);
      if (!revision) {
        return res.status(404).json({ error: "No revision found for this request" });
      }
      res.json(revision);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id/latest-revision/documents", async (req, res) => {
    try {
      const revision = await storage.getLatestRevision(req.params.id);
      if (!revision) {
        return res.json([]);
      }
      const documents = await storage.getRequestDocuments(revision.id);
      const mappedDocuments = documents.map(doc => {
        if (doc.fileUrl && !doc.fileUrl.startsWith('http') && !doc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL) {
          return {
            ...doc,
            fileUrl: doc.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${doc.fileUrl}`
          };
        }
        return doc;
      });
      res.json(mappedDocuments);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id/latest-revision/purposes", async (req, res) => {
    try {
      const revision = await storage.getLatestRevision(req.params.id);
      if (!revision) return res.json([]);
      const purposes = await storage.getRequestPurposes(revision.id);
      res.json(purposes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id/latest-revision/work-locations", async (req, res) => {
    try {
      const revision = await storage.getLatestRevision(req.params.id);
      if (!revision) return res.json([]);
      const locations = await storage.getRequestWorkLocations(revision.id);
      res.json(locations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id/latest-revision/materials", async (req, res) => {
    try {
      const revision = await storage.getLatestRevision(req.params.id);
      if (!revision) return res.json([]);
      const requestMaterialsList = await storage.getRequestMaterials(revision.id);
      res.json(requestMaterialsList);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Purposes API
  app.get("/api/revisions/:id/purposes", async (req, res) => {
    try {
      const purposes = await storage.getRequestPurposes(req.params.id);
      res.json(purposes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/purposes", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { purposeId, purposeName, purposeCategory, remarks } = req.body;

      if (!purposeId || !purposeName) {
        return res.status(400).json({ error: "Missing required fields: purposeId and purposeName are required" });
      }

      const requestPurpose = await storage.createRequestPurpose({
        revisionId: req.params.id,
        purposeId,
        purposeName,
        purposeCategory: purposeCategory || null,
        remarks: remarks || null,
      });

      res.status(201).json(requestPurpose);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/purposes", async (req, res) => {
    try {
      await storage.deleteRequestPurposesByRevision(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Documents API
  app.get("/api/revisions/:id/documents", async (req, res) => {
    try {
      const documents = await storage.getRequestDocuments(req.params.id);
      const mappedDocuments = documents.map(doc => {
        if (doc.fileUrl && !doc.fileUrl.startsWith('http') && !doc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL) {
          return {
            ...doc,
            fileUrl: doc.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${doc.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${doc.fileUrl}`
          };
        }
        return doc;
      });
      res.json(mappedDocuments);
    } catch (error) {
      handleError(res, error);
    }
  });

   app.post("/api/revisions/:id/documents", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      const { title, fileName, fileUrl, fileSize, mimeType, remarks, sourceType, projectDocumentId, documentType, documentRef } = req.body;

      if (!fileName) {
        return res.status(400).json({ error: "Missing required fields: fileName is required" });
      }

      const requestDocument = await storage.createRequestDocument({
        revisionId: req.params.id,
        title,
        fileName,
        fileUrl: fileUrl || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedBy: currentUser.user.id,
        remarks: remarks || null,
        sourceType: sourceType || "upload",
        projectDocumentId: projectDocumentId || null,
        documentType: documentType || null,
        documentRef: documentRef || null,
      });

      // Broadcast update to all users viewing this request
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (revision) {
        notificationWss.broadcastRequestUpdate(revision.requestId, currentUser.user.id, "document_added");
      }

      const responseDoc = { ...requestDocument };
      if (responseDoc.fileUrl && !responseDoc.fileUrl.startsWith('http') && !responseDoc.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL) {
        responseDoc.fileUrl = responseDoc.fileUrl.startsWith('/')
          ? `${R2_PUBLIC_BASE_URL}${responseDoc.fileUrl}`
          : `${R2_PUBLIC_BASE_URL}/${responseDoc.fileUrl}`;
      }

      res.status(201).json(responseDoc);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/documents", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      await storage.deleteRequestDocumentsByRevision(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/request-documents/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [doc] = await db.select().from(requestDocuments).where(eq(requestDocuments.id, req.params.id));
      if (doc && doc.revisionId) {
        if (await isRncrLockedForContractor(doc.revisionId, currentUser)) {
          return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
        }
      }

      await storage.deleteRequestDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/request-documents/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { title, documentType, documentRef } = req.body;
      const updated = await storage.updateRequestDocument(req.params.id, {
        title,
        documentType,
        documentRef
      });
      res.json(updated);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Work Locations API
  app.get("/api/revisions/:id/work-locations", async (req, res) => {
    try {
      const locations = await storage.getRequestWorkLocations(req.params.id);
      res.json(locations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/work-locations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      const { workLocationId, unit, zone, block, building, floor, part, remarks } = req.body;

      if (!workLocationId) {
        return res.status(400).json({ error: "Missing required field: workLocationId is required" });
      }

      const requestWorkLocation = await storage.createRequestWorkLocation({
        revisionId: req.params.id,
        workLocationId,
        unit: unit || null,
        zone: zone || null,
        block: block || null,
        building: building || null,
        floor: floor || null,
        part: part || null,
        remarks: remarks || null,
      });

      res.status(201).json(requestWorkLocation);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/work-locations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      await storage.deleteRequestWorkLocationsByRevision(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/work-locations/:locationId", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      await storage.deleteRequestWorkLocation(req.params.locationId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Work Levels API
  app.get("/api/revisions/:id/work-levels", async (req, res) => {
    try {
      const levels = await storage.getRequestWorkLevels(req.params.id);
      res.json(levels);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/work-levels", async (req, res) => {
    try {
      const { workLevelId, remarks } = req.body;

      if (!workLevelId) {
        return res.status(400).json({ error: "Missing required field: workLevelId is required" });
      }

      const requestWorkLevel = await storage.createRequestWorkLevel({
        revisionId: req.params.id,
        workLevelId,
        remarks: remarks || null,
      });

      res.status(201).json(requestWorkLevel);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/work-levels", async (req, res) => {
    try {
      await storage.deleteRequestWorkLevelsByRevision(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/work-levels/:levelId", async (req, res) => {
    try {
      await storage.deleteRequestWorkLevel(req.params.levelId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/assigned-suppliers", async (req, res) => {
    try {
      let excludeRequestId = req.query.excludeRequestId as string | undefined;
      if (excludeRequestId === "undefined" || excludeRequestId === "null") {
        excludeRequestId = undefined;
      }
      const assigned = await storage.getAssignedSupplierIdsForProject(req.params.projectId, excludeRequestId);
      res.json(assigned);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/assigned-materials", async (req, res) => {
    try {
      let excludeRequestId = req.query.excludeRequestId as string | undefined;
      if (excludeRequestId === "undefined" || excludeRequestId === "null") {
        excludeRequestId = undefined;
      }
      const assigned = await storage.getAssignedMaterialIdsForProject(req.params.projectId, excludeRequestId);
      res.json(assigned);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Suppliers API
  app.get("/api/revisions/:id/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getRequestSuppliers(req.params.id);
      res.json(suppliers);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/suppliers", async (req, res) => {
    try {
      const { supplierId, remarks } = req.body;
      if (!supplierId) {
        return res.status(400).json({ error: "supplierId is required" });
      }
      const requestSupplier = await storage.createRequestSupplier({
        revisionId: req.params.id,
        supplierId,
        remarks: remarks || null,
      });
      res.status(201).json(requestSupplier);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/suppliers", async (req, res) => {
    try {
      await storage.deleteRequestSuppliersByRevision(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Inquiries
  app.get("/api/revisions/:id/inquiries", async (req, res) => {
    try {
      const inquiries = await storage.getRequestInquiries(req.params.id);
      res.json(inquiries);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/inquiries", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { question, isRequired } = req.body;

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const inquiry = await storage.createRequestInquiry({
        revisionId: req.params.id,
        question,
        isRequired: isRequired || false,
        askedBy: currentUser.user.id,
      });

      // Send notification for new inquiry
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (revision) {
        const request = await storage.getRequest(revision.requestId);
        if (request && request.projectId) {
          const project = await storage.getProject(request.projectId);
          const askerUser = await storage.getUser(currentUser.user.id);

          // Notify contractor team about the inquiry
          if (project?.contractorId) {
            const contractorTeamMembers = await storage.getTeamMembersByOrganization(project.contractorId);
            const contractorUserIdSet = new Set<string>();
            for (const tm of contractorTeamMembers) {
              const tmUsers = await storage.getTeamMemberUsers(tm.id);
              for (const tmUser of tmUsers) {
                if (tmUser.userId !== currentUser.user.id) {
                  contractorUserIdSet.add(tmUser.userId);
                }
              }
            }
            const contractorUserIds = Array.from(contractorUserIdSet);
            if (contractorUserIds.length > 0) {
              await notificationService.notifyInquiry(
                request.id,
                request.requestNumber || "",
                request.projectId,
                "created",
                askerUser?.username || "مستشار",
                contractorUserIds
              );
            }
          }
        }
      }

      res.status(201).json(inquiry);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/inquiries/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { answer } = req.body;

      const inquiry = await storage.updateRequestInquiry(req.params.id, {
        answer,
        answeredBy: currentUser.user.id,
      });

      // Send notification for inquiry response
      const revision = await storage.getRequestRevisionById(inquiry.revisionId);
      if (revision) {
        const request = await storage.getRequest(revision.requestId);
        if (request && request.projectId) {
          const project = await storage.getProject(request.projectId);
          const responderUser = await storage.getUser(currentUser.user.id);

          // Notify consultant team about the response
          if (project?.consultantId) {
            const consultantTeamMembers = await storage.getTeamMembersByOrganization(project.consultantId);
            const consultantUserIdSet = new Set<string>();
            for (const tm of consultantTeamMembers) {
              const tmUsers = await storage.getTeamMemberUsers(tm.id);
              for (const tmUser of tmUsers) {
                if (tmUser.userId !== currentUser.user.id) {
                  consultantUserIdSet.add(tmUser.userId);
                }
              }
            }
            const consultantUserIds = Array.from(consultantUserIdSet);
            if (consultantUserIds.length > 0) {
              await notificationService.notifyInquiry(
                request.id,
                request.requestNumber || "",
                request.projectId,
                "responded",
                responderUser?.username || "مقاول",
                consultantUserIds
              );
            }
          }
        }
      }

      res.json(inquiry);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/inquiries/:id", async (req, res) => {
    try {
      await storage.deleteRequestInquiry(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Messages (Chat) API
  app.get("/api/revisions/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getRequestMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/requests/:id/all-messages", async (req, res) => {
    try {
      const messages = await storage.getAllRequestMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/messages", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { message, attachments } = req.body;

      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: "Message or attachment is required" });
      }

      const newMessage = await storage.createRequestMessage({
        revisionId: req.params.id,
        message: message || null,
        senderId: currentUser.user.id,
      });

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          await storage.createMessageAttachment({
            messageId: newMessage.id,
            title: att.title || null,
            fileName: att.fileName,
            fileType: att.fileType || null,
            fileUrl: att.fileUrl || null,
            fileSize: att.fileSize || null,
          });
        }
      }

      const messageWithAttachments = await storage.getRequestMessages(req.params.id);
      const createdMessage = messageWithAttachments.find(m => m.id === newMessage.id);

      // Send notification for new message
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (revision) {
        const request = await storage.getRequest(revision.requestId);
        if (request && request.projectId) {
          const project = await storage.getProject(request.projectId);
          const senderUser = await storage.getUser(currentUser.user.id);

          // Get recipients based on specialization (purpose) and PM roles
          const targetUserIds = await notificationService.getQualifiedRecipients(
            request.id,
            revision.id,
            currentUser.user.id
          );

          if (targetUserIds.length > 0) {
            // 1. Persistent Notification
            notificationService.notifyMessage(
              request.id,
              request.requestNumber || "",
              request.projectId,
              senderUser?.username || "مستخدم",
              targetUserIds
            ).catch(err => console.error("[MessageNotify] Notification error:", err));

            // 2. Direct WebSocket notification to targeted users
            for (const userId of targetUserIds) {
              notificationWss.broadcastToUser(userId, {
                type: "new_message",
                data: {
                  requestId: request.id,
                  revisionId: req.params.id,
                  message: createdMessage
                }
              });
            }
          }

          // 3. CRITICAL: Broadast to anyone currently viewing THIS specific request in their browser
          // This ensures the chat UI updates instantly for active users.
          notificationWss.broadcastToRequestViewers(request.id, {
            type: "new_message",
            data: {
              requestId: request.id,
              revisionId: req.params.id,
              message: createdMessage
            }
          });
        }
      }

      res.status(201).json(createdMessage);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      await storage.deleteRequestMessage(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Approval Status Codes API (lookup table)
  app.get("/api/approval-status-codes", async (req, res) => {
    try {
      const codes = await storage.getAllApprovalStatusCodes();
      res.json(codes);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Workflow Steps API - Get all workflow steps
  app.get("/api/workflow-steps", async (req, res) => {
    try {
      const steps = await storage.getAllWorkflowSteps();
      res.json(steps);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Workflow Steps API - Get a single workflow step by ID
  app.get("/api/workflow-steps/:id", async (req, res) => {
    try {
      const stepId = parseInt(req.params.id);
      if (isNaN(stepId)) {
        return res.status(400).json({ error: "Invalid step ID" });
      }
      const step = await storage.getWorkflowStep(stepId);
      if (!step) {
        return res.status(404).json({ error: "Workflow step not found" });
      }
      res.json(step);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Revision Approval Status API - Get current approval status from revision
  app.get("/api/revisions/:id/approval-status", async (req, res) => {
    try {
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      // Return approval status info from the revision itself
      const statusCode = revision.approvalStatusCode;
      let statusInfo = null;
      if (statusCode) {
        const codeInfo = await storage.getApprovalStatusCode(statusCode);
        statusInfo = {
          statusCode: revision.approvalStatusCode,
          statusLabel: codeInfo?.label || statusCode,
          comments: revision.approvalComments,
          approvedBy: revision.approvedBy,
          approvedAt: revision.approvedAt
        };
      }
      res.json(statusInfo);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/approval-status", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { statusCode, comments } = req.body;

      if (!statusCode) {
        return res.status(400).json({ error: "Status code is required" });
      }

      // Validate status code exists in lookup table
      const validCode = await storage.getApprovalStatusCode(statusCode);
      if (!validCode) {
        return res.status(400).json({ error: "Invalid status code" });
      }

      // Set approval status on the revision
      const updatedRevision = await storage.setRevisionApprovalStatus(
        req.params.id,
        statusCode,
        comments || null,
        currentUser.user.id
      );

      // Send notification for approval status
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (revision) {
        const request = await storage.getRequest(revision.requestId);
        if (request && request.projectId) {
          // Broadcast update to all users viewing this request
          notificationWss.broadcastRequestUpdate(request.id, currentUser.user.id, "approval_status");

          const project = await storage.getProject(request.projectId);
          const approverUser = await storage.getUser(currentUser.user.id);

          // Notify Contractor team, DC, and PM of the result
          if (request) {
            await notifyRequestResult(
              request as any,
              statusCode,
              validCode.label,
              approverUser?.username || "مستشار",
              currentUser.user.id
            );
          }
        }
      }

      res.status(201).json({
        statusCode: updatedRevision.approvalStatusCode,
        statusLabel: validCode.label,
        comments: updatedRevision.approvalComments,
        approvedBy: updatedRevision.approvedBy,
        approvedAt: updatedRevision.approvedAt
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Revision Checklist Responses API
  app.get("/api/revisions/:id/checklist-responses", async (req, res) => {
    try {
      const responses = await storage.getRevisionChecklistResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:id/checklist-responses", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { checklistItemId, response, remarks } = req.body;

      if (!checklistItemId || !response) {
        return res.status(400).json({ error: "Checklist item ID and response are required" });
      }

      if (!["yes", "no", "na"].includes(response)) {
        return res.status(400).json({ error: "Response must be 'yes', 'no', or 'na'" });
      }

      const checklistResponse = await storage.upsertRevisionChecklistResponse({
        revisionId: req.params.id,
        checklistItemId,
        response,
        respondedBy: currentUser.user.id,
        remarks: remarks || null,
      });

      // Broadcast update to all users viewing this request
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (revision) {
        notificationWss.broadcastRequestUpdate(revision.requestId, currentUser.user.id, "checklist_updated");
      }

      res.status(201).json(checklistResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/revisions/:id/checklist-responses/:checklistItemId", async (req, res) => {
    try {
      await storage.deleteRevisionChecklistResponse(req.params.id, req.params.checklistItemId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Add recommendation to activity (consultant users)
  app.post("/api/revisions/:id/recommendations", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { checklistItemId, customText } = req.body;

      if (!checklistItemId && !customText) {
        return res.status(400).json({ error: "Either checklistItemId or customText is required" });
      }

      // Get the revision to find the activity
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      if (await isConsultantManagerApproved(req.params.id)) {
        return res.status(403).json({ error: "Revision has been approved by the manager and cannot be modified" });
      }

      if (!revision.workListActivityId) {
        return res.status(400).json({ error: "Revision has no associated activity" });
      }

      let itemId = checklistItemId;

      // If custom text provided, create a new checklist item
      if (customText && !checklistItemId) {
        const newItem = await storage.createChecklistItem({
          category: "recommendations",
          code: `REC-${Date.now()}`,
          nameEnglish: customText,
          nameArabic: customText,
          description: `Custom recommendation added`,
          sortOrder: 999,
        });
        itemId = newItem.id;
      }

      // Link the checklist item to the activity
      const linkedItem = await storage.addChecklistItemToActivity(
        revision.workListActivityId,
        itemId,
        currentUser.user.id
      );

      // Get the full checklist item details to return
      const checklistItem = await storage.getChecklistItem(itemId);

      res.status(201).json({
        ...linkedItem,
        checklistItem,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete recommendation from activity (consultant users)
  app.delete("/api/revisions/:id/recommendations/:checklistItemId", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get the revision to find the activity
      const revision = await storage.getRequestRevisionById(req.params.id);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      if (await isConsultantManagerApproved(req.params.id)) {
        return res.status(403).json({ error: "Revision has been approved by the manager and cannot be modified" });
      }

      if (!revision.workListActivityId) {
        return res.status(400).json({ error: "Revision has no associated activity" });
      }

      // Remove the link between the checklist item and the activity
      await storage.removeChecklistItemFromActivity(
        revision.workListActivityId,
        req.params.checklistItemId
      );

      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Consultant Reviews API
  app.get("/api/revisions/:id/consultant-reviews", async (req, res) => {
    try {
      const reviews = await storage.getRequestConsultantReviews(req.params.id);
      res.json(reviews);
    } catch (error) {
      handleError(res, error);
    }
  });

  const allowedConsultantStatusCodes = [
    "Approved by Consultant Team Approval",
    "Approved by Consultant Manager Approval",
    "Pending",
    "Rejected",
    "Revise and Resubmit",
    "A",
    "B",
    "C",
    "D",
    "E",
  ] as const;

  const updateConsultantReviewSchema = z.object({
    comments: z.string().optional(),
    statusCode: z.enum(allowedConsultantStatusCodes).optional(),
    receivedAt: z.string().datetime().optional(),
    reviewedAt: z.string().datetime().optional(),
  });

  app.patch("/api/consultant-reviews/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const review = await storage.getRequestConsultantReview(req.params.id);
      if (!review) {
        return res.status(404).json({ error: "Consultant review not found" });
      }

      if (await isConsultantManagerApproved(review.revisionId)) {
        return res.status(403).json({ error: "Revision has been approved by the manager and cannot be modified" });
      }

      const revision = await storage.getRequestRevisionById(review.revisionId);
      if (!revision) {
        return res.status(404).json({ error: "Associated revision not found" });
      }

      const associatedRequest = await storage.getRequest(revision.requestId);
      if (!associatedRequest) {
        return res.status(404).json({ error: "Associated request not found" });
      }

      const hasAccess = currentUser.orgId === associatedRequest.consultantId ||
        currentUser.user.role === 'super_admin' ||
        currentUser.user.role === 'org_admin';
      if (!hasAccess) {
        return res.status(403).json({ error: "Not authorized to update this review" });
      }

      // At step x06, only Project Managers can change approval status
      if (revision.currentStepId && (revision.currentStepId % 100 === 6) && req.body.statusCode !== undefined) {
        const isPM = await isUserProjectManager(currentUser.user.id);
        if (!isPM) {
          return res.status(403).json({ error: "Only Project Managers can change approval status at this step" });
        }
      }

      // For RNCR requests, the only allowed status codes are Approved (A) and Rejected (D)
      if (req.body.statusCode !== undefined) {
        const requestType = await storage.getRequestType(associatedRequest.requestTypeId);
        if (requestType?.code?.toUpperCase() === "RNCR" && !["A", "D"].includes(req.body.statusCode)) {
          return res.status(400).json({ error: "RNCR only supports Approved (A) or Rejected (D) status codes" });
        }
      }

      const validatedData = updateConsultantReviewSchema.parse(req.body);

      const updateData: { comments?: string; statusCode?: string; receivedAt?: string; reviewedAt?: string; residentEngineerUserId?: string } = {};
      if (validatedData.comments !== undefined) updateData.comments = validatedData.comments;
      if (validatedData.statusCode !== undefined) updateData.statusCode = validatedData.statusCode;
      if (validatedData.receivedAt !== undefined) updateData.receivedAt = validatedData.receivedAt;
      if (validatedData.reviewedAt !== undefined) updateData.reviewedAt = validatedData.reviewedAt;
      
      // Always register the review under the user who submits/updates it
      updateData.residentEngineerUserId = currentUser.user.id;

      const updated = await storage.updateRequestConsultantReview(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Request Attachments API (for consultant image uploads)
  app.get("/api/revisions/:id/attachments", async (req, res) => {
    try {
      const attachments = await storage.getRequestAttachments(req.params.id);
      const mappedAttachments = attachments.map(att => {
        const mapped = { ...att };

        // Handle legacy fileData if present and looks like a relative path
        if (mapped.fileData && !mapped.fileData.startsWith('http') && !mapped.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL) {
          mapped.fileData = mapped.fileData.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${mapped.fileData}` : `${R2_PUBLIC_BASE_URL}/${mapped.fileData}`;
        }

        // Handle new fileUrl
        if (mapped.fileUrl && !mapped.fileUrl.startsWith('http') && !mapped.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL) {
          mapped.fileUrl = mapped.fileUrl.startsWith('/') ? `${R2_PUBLIC_BASE_URL}${mapped.fileUrl}` : `${R2_PUBLIC_BASE_URL}/${mapped.fileUrl}`;
        }

        return mapped;
      });
      res.json(mappedAttachments);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:revisionId/attachments", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const revision = await storage.getRequestRevisionById(req.params.revisionId);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      if (await isConsultantManagerApproved(req.params.revisionId)) {
        return res.status(403).json({ error: "Revision has been approved by the manager and cannot be modified" });
      }

      const associatedRequest = await storage.getRequest(revision.requestId);
      if (!associatedRequest) {
        return res.status(404).json({ error: "Associated request not found" });
      }

      // Only consultant users or admins can add attachments
      const isConsultant = currentUser.orgId === associatedRequest.consultantId;
      const isAdmin = currentUser.user.role === 'super_admin' || currentUser.user.role === 'org_admin';
      if (!isConsultant && !isAdmin) {
        return res.status(403).json({ error: "Only consultant team members can add attachments" });
      }

      const { fileName, fileType, fileData, fileUrl, fileSize, title } = req.body;
      if (!fileName) {
        return res.status(400).json({ error: "File name is required" });
      }

      const attachment = await storage.createRequestAttachment({
        revisionId: req.params.revisionId,
        fileName,
        fileType: fileType || null,
        fileData: fileData || null,
        fileUrl: fileUrl || null,
        fileSize: fileSize || null,
        title: title || null,
        uploadedBy: currentUser.user.id,
      });

      // Broadcast update to all users viewing this request
      notificationWss.broadcastRequestUpdate(associatedRequest.id, currentUser.user.id, "attachment_added");

      // Send notification for new attachment
      const uploaderUser = await storage.getUser(currentUser.user.id);
      // Notify contractor team
      if (associatedRequest.contractorId) {
        const contractorTeamMembers = await storage.getTeamMembersByOrganization(associatedRequest.contractorId);
        const contractorUserIdSet = new Set<string>();
        for (const tm of contractorTeamMembers) {
          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            if (tmUser.userId !== currentUser.user.id) {
              contractorUserIdSet.add(tmUser.userId);
            }
          }
        }
        const contractorUserIds = Array.from(contractorUserIdSet);
        if (contractorUserIds.length > 0) {
          await notificationService.notifyAttachment(
            associatedRequest.id,
            associatedRequest.requestNumber || "",
            associatedRequest.projectId,
            uploaderUser?.username || "مستشار",
            fileName,
            contractorUserIds
          );
        }
      }

      const responseAtt = { ...attachment };
      if (responseAtt.fileData && !responseAtt.fileData.startsWith('http') && !responseAtt.fileData.startsWith('data:') && R2_PUBLIC_BASE_URL) {
        responseAtt.fileData = responseAtt.fileData.startsWith('/')
          ? `${R2_PUBLIC_BASE_URL}${responseAtt.fileData}`
          : `${R2_PUBLIC_BASE_URL}/${responseAtt.fileData}`;
      }
      if (responseAtt.fileUrl && !responseAtt.fileUrl.startsWith('http') && !responseAtt.fileUrl.startsWith('data:') && R2_PUBLIC_BASE_URL) {
        responseAtt.fileUrl = responseAtt.fileUrl.startsWith('/')
          ? `${R2_PUBLIC_BASE_URL}${responseAtt.fileUrl}`
          : `${R2_PUBLIC_BASE_URL}/${responseAtt.fileUrl}`;
      }

      res.status(201).json(responseAtt);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [att] = await db.select().from(requestAttachments).where(eq(requestAttachments.id, req.params.id));
      if (att && att.revisionId) {
        if (await isConsultantManagerApproved(att.revisionId)) {
          return res.status(403).json({ error: "Revision has been approved by the manager and cannot be modified" });
        }
      }

      await storage.deleteRequestAttachment(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  async function isRncrLockedForContractor(revisionId: string, currentUser: any): Promise<boolean> {
    try {
      const revision = await storage.getRequestRevisionById(revisionId);
      if (!revision) return false;
      const request = await storage.getRequest(revision.requestId);
      if (!request) return false;

      // Check if user is from the contractor organization
      const userTeamMember = currentUser?.user?.teamMemberId
        ? await storage.getTeamMember(currentUser.user.teamMemberId)
        : null;
      const isFromContractorOrg = userTeamMember?.organizationId === request.contractorId;
      if (!isFromContractorOrg) return false;

      const requestType = await storage.getRequestType(request.requestTypeId);
      if (!requestType || requestType.code.toUpperCase() !== "RNCR") return false;

      const reviews = await storage.getRequestConsultantReviews(revisionId);
      return reviews.some(r => r.receivedAt !== null);
    } catch (e) {
      console.error("Error in isRncrLockedForContractor:", e);
      return false;
    }
  }

  async function isConsultantManagerApproved(revisionId: string): Promise<boolean> {
    try {
      const revision = await storage.getRequestRevisionById(revisionId);
      if (!revision) return false;
      const request = await storage.getRequest(revision.requestId);
      if (!request) return false;
      const requestType = await storage.getRequestType(request.requestTypeId);
      if (!requestType || requestType.code.toUpperCase() !== "RNCR") return false;

      const history = await storage.getRequestStatusHistory(revisionId);
      return history.some(h => h.newStatus.includes("Consultant Manager Approval"));
    } catch (e) {
      console.error("Error in isConsultantManagerApproved:", e);
      return false;
    }
  }

  // Update Request Revision (PATCH)
  app.patch("/api/revisions/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (await isRncrLockedForContractor(req.params.id, currentUser)) {
        return res.status(403).json({ error: "RNCR request is received by consultant and cannot be modified by contractor" });
      }

      const revision = await storage.getRequestRevisionById(req.params.id);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      const associatedRequest = await storage.getRequest(revision.requestId);
      if (!associatedRequest) {
        return res.status(404).json({ error: "Associated request not found" });
      }

      const isCreator = revision.createdBy === currentUser.user.id;
      const isAdmin = currentUser.user.role === 'super_admin' || currentUser.user.role === 'org_admin';

      // Check if user is from the contractor organization
      const userTeamMember = currentUser.user.teamMemberId
        ? await storage.getTeamMember(currentUser.user.teamMemberId)
        : null;
      const isFromContractorOrg = userTeamMember?.organizationId === associatedRequest.contractorId;

      if (!isCreator && !isAdmin && !isFromContractorOrg) {
        return res.status(403).json({ error: "Only contractor organization members can update this revision" });
      }

      const { workLevelId, description, remarks, workListActivityId, scheduledDate, metadata } = req.body;

      const updateData: Record<string, any> = {};

      if (scheduledDate !== undefined) {
        // Handle ISO date or YYYY-MM-DD
        updateData.scheduledDate = scheduledDate;
      }

      if (workLevelId !== undefined) {
        updateData.workLevelId = workLevelId;
        if (workLevelId) {
          const [wl] = await db.select().from(workLevels).where(eq(workLevels.id, workLevelId));
          if (wl) {
            updateData.workLevelName = wl.nameEnglish;
          }
        }
      }

      if (description !== undefined) updateData.description = description;
      if (remarks !== undefined) updateData.remarks = remarks;

      if (workListActivityId !== undefined) {
        updateData.workListActivityId = workListActivityId;
        if (workListActivityId) {
          const [act] = await db.select().from(workListActivities).where(eq(workListActivities.id, workListActivityId));
          if (act) {
            updateData.activityCode = act.code;
            updateData.activityName = act.nameEnglish;
            const [ch] = await db.select().from(workListChapters).where(eq(workListChapters.id, act.chapterId));
            if (ch) {
              updateData.chapterName = ch.nameEnglish;
              const [div] = await db.select().from(workListDivisions).where(eq(workListDivisions.id, ch.divisionId));
              if (div) {
                updateData.divisionName = div.nameEnglish;
              }
            }
          }
        }
      }

      if (req.body.divisionName !== undefined) updateData.divisionName = req.body.divisionName;
      if (req.body.chapterName !== undefined) updateData.chapterName = req.body.chapterName;
      if (req.body.activityName !== undefined) updateData.activityName = req.body.activityName;
      if (req.body.activityCode !== undefined) updateData.activityCode = req.body.activityCode;
      
      if (metadata !== undefined) updateData.metadata = metadata;

      if (Object.keys(updateData).length === 0) {
        const currentRev = await storage.getRequestRevisionById(req.params.id);
        return res.json(currentRev);
      }

      const updatedRevision = await storage.updateRequestRevision(req.params.id, updateData);
      res.json(updatedRevision);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Workflow Engine API - Get allowed transitions for a request
  app.get("/api/requests/:id/transitions", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const request = await storage.getRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Get current revision to access currentStepId
      const currentRevision = request.currentRevisionId
        ? await storage.getRequestRevisionById(request.currentRevisionId)
        : null;

      // Get request type to find workflow steps
      const requestType = await storage.getRequestType(request.requestTypeId);
      if (!requestType) {
        return res.status(404).json({ error: "Request type not found" });
      }

      // Get workflow steps for this request type
      const steps = await storage.getWorkflowSteps(requestType.id_number);
      if (steps.length === 0) {
        return res.json({ transitions: [], message: "No workflow configured for this request type" });
      }

      // Get current step from revision.currentStepId or infer from status
      const currentStep = inferCurrentStep(steps, request.currentStatus, currentRevision?.currentStepId);
      if (!currentStep) {
        return res.json({ transitions: [], message: "No matching workflow step for current status" });
      }

      // Get transitions from current step
      const transitions = await storage.getWorkflowTransitions(currentStep.requestTypeId, currentStep.id);

      // Filter transitions based on user roles and organization
      const allowedTransitions = [];
      const user = currentUser.user;
      const userTeamMember = user.teamMemberId
        ? await storage.getTeamMember(user.teamMemberId)
        : null;

      // Get all positions to map roleRequired IDs
      const allPositions = await storage.getAllPositions();
      const positionMap = new Map(allPositions.map(p => [p.id, p]));

      for (const t of transitions) {
        const targetStep = steps.find(s => s.id === t.toStepId);
        if (!targetStep) continue;

        let hasAccess = false;

        // Super admins and developer admins can perform any transition
        if (user.role === 'super_admin' || user.role === 'developer_admin') {
          hasAccess = true;
        }
        // Special case: Allow any Contractor to submit RNCR from Preparation
        else if (requestType.code === 'RNCR' && currentStep.stepName === 'Contractor Preparation' && t.toStepId === 1002) {
          if (userTeamMember?.organizationId === request.contractorId) {
            hasAccess = true;
          }
        }
        // Check role-based access for PM approvals (organization-specific)
        else if ((targetStep.stepName === 'Contractor PM Approval' || targetStep.stepName.includes('Contractor')) && targetStep.stepName !== 'Issued to Contractor') {
          // User must be from contractor organization
          if (userTeamMember?.organizationId === request.contractorId) {
            // Check if user has the required position/role
            const requiredPosition = positionMap.get(String(targetStep.roleRequired));
            if (requiredPosition && userTeamMember.position === requiredPosition.titleEnglish) {
              hasAccess = true;
            }
            // Allow specific positions to perform contractor workflow transitions
            const allowedContractorPositions = ['Project Manager', 'Document controller', 'Document Controller'];
            if (userTeamMember.position && allowedContractorPositions.includes(userTeamMember.position)) {
              hasAccess = true;
            }
            // Allow org_admin to approve on behalf of their organization
            if (user.role === 'org_admin') {
              hasAccess = true;
            }
          }
        }
        // Special case: Allow contractor PM users at step x03 to see transition to step x04 (Engineer Review)
        // This enables frontend auto-advance after Contractor Manager Approval
        else if (targetStep.stepName === 'Engineer Review' && (currentStep.id % 100 === 3) && (t.toStepId % 100 === 4)) {
          if (userTeamMember?.organizationId === request.contractorId) {
            const allowedContractorPositions = ['Project Manager', 'Document controller', 'Document Controller'];
            if (userTeamMember.position && allowedContractorPositions.includes(userTeamMember.position)) {
              hasAccess = true;
            }
            if (user.role === 'org_admin') {
              hasAccess = true;
            }
          }
        } else if (targetStep.stepName === 'Consultant PM Approval' || targetStep.stepName.includes('Consultant') ||
          targetStep.stepName === 'Engineer Review' || targetStep.stepName === 'Site Inspection' ||
          targetStep.stepName === 'Final Approval' || targetStep.stepName === 'Issued to Contractor') {
          // User must be from consultant organization - any team member can approve
          if (userTeamMember?.organizationId === request.consultantId) {
            hasAccess = true;
          }
        } else {
          // For other steps, check if user's position matches the required role
          const requiredPosition = positionMap.get(String(targetStep.roleRequired));
          if (requiredPosition && userTeamMember?.position === requiredPosition.titleEnglish) {
            hasAccess = true;
          }
          // org_admin can perform transitions within their organization
          if (user.role === 'org_admin' && userTeamMember?.organizationId) {
            hasAccess = true;
          }
        }

        if (hasAccess) {
          allowedTransitions.push({ ...t, targetStep });
        }
      }

      res.json({ currentStep, transitions: allowedTransitions });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get team members authorized to perform a workflow step for a request
  app.get("/api/requests/:requestId/step-authorized-members", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { requestId } = req.params;

    try {
      const request = await storage.getRequest(requestId);
      if (!request) return res.status(404).json({ error: "Request not found" });

      // Get the current revision to find the current step
      if (!request.currentRevisionId) {
        return res.json([]);
      }

      const revision = await storage.getRequestRevisionById(request.currentRevisionId);
      if (!revision?.currentStepId) {
        return res.json([]);
      }

      // Get the current workflow step
      const currentStep = await storage.getWorkflowStep(revision.currentStepId);
      if (!currentStep) {
        return res.json([]);
      }

      // Get all positions to map position titles to purpose IDs
      const allPositions = await storage.getAllPositions();
      const positionByTitle = new Map(allPositions.map(p => [p.titleEnglish, p]));

      // Get the request's purposes
      const requestPurposes = await storage.getRequestPurposes(revision.id);
      const requestPurposeIds = new Set(requestPurposes.map(rp => rp.purposeId));

      // Get all team members and their linked users
      const allTeamMembers = await storage.getAllTeamMembers();
      const userTeamMembers = await storage.getAllUserTeamMembers(); // Need to implement this or use a query
      const allUsers = await storage.getAllUsers();

      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const teamMemberToUserMap = new Map();
      userTeamMembers.forEach(utm => {
        const user = userMap.get(utm.userId);
        if (user) {
          if (!teamMemberToUserMap.has(utm.teamMemberId)) {
            teamMemberToUserMap.set(utm.teamMemberId, []);
          }
          teamMemberToUserMap.get(utm.teamMemberId).push({
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            fullNameArabic: user.fullNameArabic,
            email: user.email,
            avatar: user.avatar,
            isActive: user.isActive
          });
        }
      });

      // Filter team members based on step requirements
      let authorizedMembers: any[] = [];

      if (currentStep.stepName.includes('Contractor')) {
        // Contractor steps: team members from contractor org whose position purpose matches request purposes
        // Or PM/DC who can always act on contractor steps
        const alwaysAllowedPositions = ['Project Manager'];
        authorizedMembers = allTeamMembers.filter(tm => {
          if (tm.organizationId !== request.contractorId) return false;

          // PM always allowed
          if (tm.position && alwaysAllowedPositions.includes(tm.position)) return true;

          // Check if team member's position purpose matches request purposes
          if (tm.position) {
            const position = positionByTitle.get(tm.position);
            if (position?.purposeId && requestPurposeIds.has(position.purposeId)) {
              return true;
            }
          }

          return false;
        });
      } else if (currentStep.stepName === 'Consultant PM Approval' || currentStep.stepName.includes('Consultant') ||
        currentStep.stepName === 'Engineer Review' || currentStep.stepName === 'Site Inspection' ||
        currentStep.stepName === 'Final Approval') {
        // Consultant steps: team members from consultant org whose position purpose matches request purposes
        // Or any consultant team member if they have PM role
        const alwaysAllowedPositions = ['Project Manager'];
        authorizedMembers = allTeamMembers.filter(tm => {
          if (tm.organizationId !== request.consultantId) return false;

          // PM always allowed
          if (tm.position && alwaysAllowedPositions.includes(tm.position)) return true;

          // Check if team member's position purpose matches request purposes
          if (tm.position) {
            const position = positionByTitle.get(tm.position);
            if (position?.purposeId && requestPurposeIds.has(position.purposeId)) {
              return true;
            }
          }

          return false;
        });
      } else {
        // Other steps: team members with matching purpose
        authorizedMembers = allTeamMembers.filter(tm => {
          if (tm.position) {
            const position = positionByTitle.get(tm.position);
            if (position?.purposeId && requestPurposeIds.has(position.purposeId)) {
              return true;
            }
          }
          return false;
        });
      }

      // Return team member info with organization
      const organizations = await storage.getAllOrganizations();
      const orgMap = new Map(organizations.map(o => [o.id, o]));

      const result = authorizedMembers.map(tm => ({
        id: tm.id,
        nameEnglish: tm.name,
        nameArabic: tm.nameArabic,
        position: tm.position,
        organizationId: tm.organizationId,
        organizationName: tm.organizationId ? orgMap.get(tm.organizationId)?.name : null,
        users: teamMemberToUserMap.get(tm.id) || []
      }));

      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/revisions/:revisionId/approve", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { revisionId } = req.params;
    const { stepName, approvalStatusCode, approvalComments, autoAdvanceToStep } = req.body;
    const userId = (req.user as any).id;
    console.log(`[Approve] revisionId=${revisionId}, stepName=${stepName}, autoAdvanceToStep=${autoAdvanceToStep}`);

    try {
      // Step 106 (Consultant Manager Approval) and SI Step 1102 (Consultant PM Approval) are restricted to Project Managers only
      if (stepName === "Consultant Manager Approval" || stepName === "Consultant PM Approval") {
        const isPM = await isUserProjectManager(userId);
        if (!isPM) {
          console.log(`[Approve] Step ${stepName} rejected: user ${userId} is not a Project Manager`);
          return res.status(403).json({ error: "Only Project Managers can approve this step" });
        }
      }

      const history = await storage.createRequestStatusHistory({
        revisionId,
        oldStatus: "Pending",
        newStatus: `Approved by ${stepName}`,
        changedBy: userId,
        remarks: `Step approved: ${stepName}`,
      });

      const revision = await storage.getRequestRevisionById(revisionId);
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      if (approvalStatusCode) {
        const validCode = await storage.getApprovalStatusCode(approvalStatusCode);
        if (validCode) {
          await storage.setRevisionApprovalStatus(
            revisionId,
            approvalStatusCode,
            approvalComments || null,
            userId
          );
        }
      }

      const getGMT3Timestamp = () => {
        const now = new Date();
        const gmt3Offset = 3 * 60 * 60 * 1000;
        const gmt3Time = new Date(now.getTime() + gmt3Offset);
        return gmt3Time.toISOString();
      };

      if (stepName === "Consultant Team Approval") {
        const consultantReviews = await storage.getRequestConsultantReviews(revisionId);
        for (const review of consultantReviews) {
          if (!review.receivedAt) {
            await storage.updateRequestConsultantReview(review.id, {
              receivedAt: getGMT3Timestamp(),
            });
          }
        }
      }

      if (stepName === "Consultant Manager Approval") {
        const consultantReviews = await storage.getRequestConsultantReviews(revisionId);
        for (const review of consultantReviews) {
          if (!review.reviewedAt) {
            await storage.updateRequestConsultantReview(review.id, {
              reviewedAt: getGMT3Timestamp(),
            });
          }
        }

      }

      // Notify Contractor team, DC, and PM whenever the final result is set or the Manager approves
      const isManagerStep = (stepName || "").toLowerCase().includes("manager");
      const effectiveCode = approvalStatusCode || revision.approvalStatusCode;

      if (effectiveCode && revision && isManagerStep) {
        const request = await storage.getRequest(revision.requestId);
        const validCode = await storage.getApprovalStatusCode(effectiveCode);
        const approverUser = await storage.getUser(userId);

        if (request && validCode) {
          console.log(`[Approve] Final result notification triggered by ${stepName}: ${effectiveCode}`);
          await notifyRequestResult(
            request,
            effectiveCode,
            validCode.label,
            approverUser?.username || "مدير المشروع",
            userId
          );
        }
      }


      if (autoAdvanceToStep && revision) {
        const targetStepId = parseInt(autoAdvanceToStep.toString());
        console.log(`Attempting auto-advance to step ${targetStepId} for request ${revision.requestId}`);
        const request = await storage.getRequest(revision.requestId);
        if (request) {
          const requestType = await storage.getRequestType(request.requestTypeId);
          if (requestType) {
            const stepsList = await storage.getWorkflowSteps(requestType.id_number);
            const fromStep = inferCurrentStep(stepsList, request.currentStatus, revision.currentStepId);
            const targetStep = stepsList.find(s => s.id === targetStepId);

            console.log(`Current step inferred: ${fromStep?.stepName} (ID: ${fromStep?.id}), status: ${request.currentStatus}`);

            if (fromStep && targetStep) {
              const transitions = await storage.getWorkflowTransitions(fromStep.requestTypeId, fromStep.id);
              const transition = transitions.find(t => t.toStepId == targetStepId);

              // If standard transition not found, use target step's default logic or allow it if PM/DC
              // Force 'Approved' status for step x07 or Manager Approval
              let allowedStatus = (targetStepId % 100 === 7) ? 'Approved' : (stepName === "Consultant Manager Approval" ? 'Submitted' : (transition?.allowedStatus || 'Under Review'));

              if (requestType.code === 'RNCR' && stepName === "Consultant Manager Approval") {
                allowedStatus = effectiveCode === 'A' ? 'Approved' : 'Rejected';
              }

              console.log(`Advancing to status: ${allowedStatus}`);
              const oldStatus = request.currentStatus;

              await storage.updateRequest(request.id, {
                currentStatus: allowedStatus as any,
              });
              await storage.updateRequestRevision(revisionId, {
                currentStepId: targetStepId,
              });
              await storage.createRequestStatusHistory({
                revisionId,
                oldStatus,
                newStatus: allowedStatus,
                changedBy: userId,
                remarks: `Auto-advanced after ${stepName}`,
              });
              notificationWss.broadcastRequestUpdate(revision.requestId, userId, "status_changed");

              // Approved WIR (A/B at final step x07) → progress matrix cells for its item/units become 100% and locked.
              // Non-blocking: never affects the approval itself.
              if (requestType.code === 'WIR' && targetStepId % 100 === 7 && effectiveCode && ['A', 'B'].includes(effectiveCode)) {
                void applyApprovedWirRevision(revisionId, userId).catch(err =>
                  console.error(`[ProgressMatrix] Failed to apply WIR revision ${revisionId}:`, err));
              }

              // If this request is an RNCR and it has been approved by the Contractor Manager (status Under Review / step 1003) or fully Approved, update parent NCR status to "Resolved"
              if (requestType.code === 'RNCR' && (allowedStatus === 'Under Review' || targetStepId === 1003 || allowedStatus === 'Approved')) {
                const metadata = revision.metadata;
                if (metadata && typeof metadata === 'object' && metadata.linkedNcrId) {
                  const parentNcr = await storage.getRequest(metadata.linkedNcrId);
                  if (parentNcr) {
                    await db.update(requests)
                      .set({
                        currentStatus: "Resolved",
                        updatedAt: sql`CURRENT_TIMESTAMP`
                      })
                      .where(eq(requests.id, parentNcr.id));

                    notificationWss.broadcastRequestUpdate(parentNcr.id, userId, "status_changed");
                  }
                }
              }

              // Notify Consultant PM when request reaches step x06 or x07
              if (targetStepId % 100 === 6 || targetStepId % 100 === 7) {
                console.log(`[AutoAdvance] Step ${targetStepId} reached, triggering PM notification`);
                await notifyConsultantPMs(request, targetStepId, userId);
              }

              // Notify relevant specialist team members when the request reaches Consultant Review step for RNCR (1003) via auto-advance
              if (targetStepId === 1003) {
                console.log(`[AutoAdvance] Step ${targetStepId} reached, triggering purpose-based notification`);
                await notifyTeamByPurpose(request, revisionId, userId);
              }
            } else {
              console.log(`Missing fromStep (${fromStep?.id}) or targetStep (${targetStepId})`);
            }
          }
        }
      }

      if (revision) {
        notificationWss.broadcastRequestUpdate(revision.requestId, userId, "step_approved");
      }

      res.json(history);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Helper: Notify Consultant PMs when request reaches step x06 or x07
  async function notifyConsultantPMs(
    request: { id: string; requestNumber: string | null; projectId: string; consultantId: string | null },
    stepId: number,
    excludeUserId?: string
  ) {
    if (!request.consultantId) {
      console.log(`[PMNotify] No consultantId on request ${request.id}, skipping`);
      return;
    }
    const stepLabel = (stepId % 100 === 6) ? "Consultant PM Review" : "Consultant Manager Approval";
    console.log(`[PMNotify] Step ${stepId} reached - Notifying Consultant PM for request ${request.id}, consultantId: ${request.consultantId}`);
    try {
      const consultantMembers = await storage.getTeamMembersByOrganization(request.consultantId);
      console.log(`[PMNotify] Found ${consultantMembers.length} team members in consultant org`);

      const pmUserIds = new Set<string>();
      for (const tm of consultantMembers) {
        const posLower = (tm.position || "").toLowerCase();
        console.log(`[PMNotify] Checking member: ${tm.name}, position: "${tm.position}"`);
        if (posLower.includes("project manager")) {
          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          console.log(`[PMNotify] PM match! Found ${tmUsers.length} linked users`);
          for (const tmUser of tmUsers) {
            pmUserIds.add(tmUser.userId);
          }
        }
      }

      if (excludeUserId) {
        pmUserIds.delete(excludeUserId);
      }

      console.log(`[PMNotify] Final PM user IDs to notify: [${Array.from(pmUserIds).join(', ')}]`);

      if (pmUserIds.size > 0) {
        await notificationService.notifyStatusChange(
          request.id,
          request.requestNumber || "",
          request.projectId,
          "Under Review",
          stepLabel,
          "System",
          Array.from(pmUserIds)
        );
        console.log(`[PMNotify] Notification sent successfully to ${pmUserIds.size} users`);
      } else {
        console.log(`[PMNotify] No Consultant PM users found to notify`);
      }
    } catch (e) {
      console.error("[PMNotify] Failed to notify:", e);
    }
  }

  // Helper: Notify Contractor, DC, and PM of the final inspection result
  async function notifyRequestResult(
    request: { id: string; requestNumber: string | null; projectId: string; contractorId: string | null; consultantId: string | null },
    statusCode: string,
    statusLabel: string,
    approverName: string,
    excludeUserId?: string
  ) {
    try {
      const recipientUserIds = new Set<string>();

      // 1. Get Contractor Team members (always notify everyone in contractor org)
      if (request.contractorId) {
        const contractorMembers = await storage.getTeamMembersByOrganization(request.contractorId);
        for (const tm of contractorMembers) {
          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            recipientUserIds.add(tmUser.userId);
          }
        }
      }

      // 2. Get Document Controllers and Managers from Contractor and Consultant organizations
      const orgIds = [request.contractorId, request.consultantId].filter(Boolean) as string[];
      for (const orgId of orgIds) {
        const members = await storage.getTeamMembersByOrganization(orgId);
        for (const tm of members) {
          const pos = (tm.position || "").toLowerCase();

          const isDMorPM = pos.includes("document controller") ||
            pos.includes("project Manager");

          if (isDMorPM) {
            const tmUsers = await storage.getTeamMemberUsers(tm.id);
            for (const tmUser of tmUsers) {
              recipientUserIds.add(tmUser.userId);
            }
          }
        }
      }

      if (excludeUserId) {
        recipientUserIds.delete(excludeUserId);
      }

      if (recipientUserIds.size > 0) {
        const userIds = Array.from(recipientUserIds);
        console.log(`[ResultNotify] Sending result ${statusCode} for request ${request.requestNumber} to ${userIds.length} users`);
        await notificationService.notifyApprovalStatus(
          request.id,
          request.requestNumber || "",
          request.projectId,
          statusCode,
          statusLabel,
          approverName,
          userIds
        );
      } else {
        console.log(`[ResultNotify] No recipients found for result notification`);
      }
    } catch (e) {
      console.error("[ResultNotify] Failed to notify result:", e);
    }
  }

  // Helper: Check if user is a Project Manager in their organization
  async function isUserProjectManager(userId: string): Promise<boolean> {
    const userTeamMembers = await storage.getUserTeamMembers(userId);
    for (const utm of userTeamMembers) {
      const tm = await storage.getTeamMember(utm.teamMemberId);
      if (tm) {
        const pos = (tm.position || "").toLowerCase();
        if (pos.includes("project manager") || pos.includes("مدير")) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper: Targeted notification based on specialization/purpose
  async function notifyTeamByPurpose(request: any, revisionId: string, senderId: string) {
    try {
      console.log(`[notifyTeamByPurpose] Starting for request=${request.id}, revision=${revisionId}`);

      const recipientUserIds = await notificationService.getQualifiedRecipients(request.id, revisionId, senderId);

      if (recipientUserIds.length > 0) {
        const sender = await storage.getUser(senderId);
        console.log(`[notifyTeamByPurpose] Notifying ${recipientUserIds.length} users`);
        await notificationService.notifyNewRequest(
          request.id,
          request.requestNumber || "Request",
          request.projectId,
          sender ? (sender.username || sender.email || "User") : "User",
          recipientUserIds
        );
      } else {
        console.log(`[notifyTeamByPurpose] No recipients found`);
      }
    } catch (e) {
      console.error("[notifyTeamByPurpose] Failed:", e);
    }
  }

  // Workflow Engine API - Move request to new step
  app.post("/api/requests/:id/move", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { toStepId, newStatus, remarks } = req.body;
      console.log(`[Move] toStepId=${toStepId}, newStatus=${newStatus}, requestId=${req.params.id}`);
      if (!toStepId || !newStatus) {
        return res.status(400).json({ error: "toStepId and newStatus are required" });
      }

      const request = await storage.getRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Get current revision to access currentStepId
      const currentRevision = request.currentRevisionId
        ? await storage.getRequestRevisionById(request.currentRevisionId)
        : null;

      const requestType = await storage.getRequestType(request.requestTypeId);
      if (!requestType) {
        return res.status(404).json({ error: "Request type not found" });
      }

      console.log(`[Move] RequestID: ${request.id}, RequestType: ${request.requestTypeId}, TypeIdNum: ${requestType.id_number}`);
      const steps = await storage.getWorkflowSteps(requestType.id_number);
      console.log(`[Move] Workflow steps found: ${steps.length} for TypeIdNum ${requestType.id_number}`);

      if (steps.length === 0) {
        // Diagnostic: What steps DO exist?
        const allSteps = await storage.getAllWorkflowSteps();
        console.warn(`[Move Diagnostic] Type ${requestType.id_number} has no steps. Total steps in DB: ${allSteps.length}`);
        if (allSteps.length > 0) {
          const typeIds = Array.from(new Set(allSteps.map(s => s.requestTypeId)));
          console.warn(`[Move Diagnostic] Steps exist for Type IDs: ${typeIds.join(', ')}`);
        }
      } else {
        console.log(`[Move] Step IDs: ${steps.map(s => s.id).join(', ')}`);
      }

      const fromStep = inferCurrentStep(steps, request.currentStatus, currentRevision?.currentStepId);

      if (!fromStep) {
        console.error(`[Move Error] Failed to determine fromStep. Status: ${request.currentStatus}, RevisionStepID: ${currentRevision?.currentStepId}`);
        // Even more details for the client
        const allStepsInfo = await storage.getAllWorkflowSteps();
        const availableTypeIds = Array.from(new Set(allStepsInfo.map(s => s.requestTypeId)));

        return res.status(400).json({
          error: "Cannot determine current workflow step",
          details: {
            status: request.currentStatus,
            revisionStepId: currentRevision?.currentStepId,
            stepsCount: steps.length,
            requestTypeIdNum: requestType.id_number,
            availableTypeIdsInDB: availableTypeIds
          }
        });
      }

      // Validate transition exists
      const transition = await storage.getWorkflowTransition(
        fromStep.requestTypeId,
        fromStep.id,
        toStepId,
        newStatus
      );

      if (!transition) {
        return res.status(400).json({ error: "Invalid transition" });
      }

      const oldStatus = request.currentStatus;
      let currentRevisionId = request.currentRevisionId;

      // Handle revision logic - create new revision if status is "Requires Action"
      if (newStatus === 'Requires Action') {
        const newRevisionNo = await storage.getNextRevisionNo(request.id);
        const currentRevision = await storage.getRequestRevisionById(request.currentRevisionId || "");
        const newRevision = await storage.createRequestRevision({
          requestId: request.id,
          revisionNo: newRevisionNo,
          createdBy: currentUser.user.id,
          title: currentRevision?.title || "Revision",
        });
        currentRevisionId = newRevision.id;
      }

      // Update request status
      const updatedRequest = await storage.updateRequest(request.id, {
        currentStatus: newStatus,
        currentRevisionId,
      });

      // Update revision with currentStepId
      if (currentRevisionId) {
        await storage.updateRequestRevision(currentRevisionId, {
          currentStepId: toStepId,
        });
      }

      // Log status history
      if (currentRevisionId) {
        await storage.createRequestStatusHistory({
          revisionId: currentRevisionId,
          oldStatus,
          newStatus,
          changedBy: currentUser.user.id,
          remarks: remarks || "",
        });
      }

      // Broadcast update to all users viewing this request
      notificationWss.broadcastRequestUpdate(request.id, currentUser.user.id, "status_changed");

      // If this request is an RNCR and it has been approved by the Contractor Manager (status Under Review / step 1003) or fully Approved, update parent NCR status to "Resolved"
      if (requestType.code === 'RNCR' && (newStatus === 'Under Review' || toStepId === 1003 || newStatus === 'Approved')) {
        const metadata = currentRevision?.metadata;
        if (metadata && typeof metadata === 'object' && metadata.linkedNcrId) {
          const parentNcr = await storage.getRequest(metadata.linkedNcrId);
          if (parentNcr) {
            await db.update(requests)
              .set({
                currentStatus: "Resolved",
                updatedAt: sql`CURRENT_TIMESTAMP`
              })
              .where(eq(requests.id, parentNcr.id));

            notificationWss.broadcastRequestUpdate(parentNcr.id, currentUser.user.id, "status_changed");
          }
        }
      }

      // Notify Consultant PM when request reaches step x06 or x07 via move
      if (toStepId % 100 === 6 || toStepId % 100 === 7) {
        console.log(`[Move] Step ${toStepId} reached, triggering PM notification`);
        await notifyConsultantPMs(request, toStepId, currentUser.user.id);
      }

      // Notify relevant specialist team members when the request is first submitted (Step x02)
      // OR when a RNCR request reaches Consultant Review (Step 1003)
      if (toStepId % 100 === 2 || toStepId === 1003) {
        console.log(`[Move] Step ${toStepId} reached, triggering purpose-based notification`);
        await notifyTeamByPurpose(request, currentRevisionId || "", currentUser.user.id);
      }

      res.json(updatedRequest);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Close request - move to final step after all approvals are complete
  app.post("/api/requests/:id/close", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const request = await storage.getRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Check user is from contractor organization
      if (currentUser.user.organizationId !== request.contractorId) {
        return res.status(403).json({ error: "Only contractor team members can close this request" });
      }

      const requestType = await storage.getRequestType(request.requestTypeId);
      if (!requestType) {
        return res.status(404).json({ error: "Request type not found" });
      }

      // Get all status history for current revision to check approvals
      const currentRevisionId = request.currentRevisionId;
      if (!currentRevisionId) {
        return res.status(400).json({ error: "No current revision found" });
      }

      // Check current revision and step
      const currentRevision = await storage.getRequestRevisionById(currentRevisionId);
      if (!currentRevision) {
        return res.status(400).json({ error: "Current revision not found" });
      }

      // Get all workflow steps and find the final step
      const steps = await storage.getWorkflowSteps(requestType.id_number);
      if (steps.length === 0) {
        return res.status(400).json({ error: "No workflow steps found" });
      }

      const finalStep = steps.reduce((prev, curr) =>
        curr.sequenceOrder > prev.sequenceOrder ? curr : prev
      );

      // Only allow closing on the final step
      if (currentRevision.currentStepId !== finalStep.id) {
        return res.status(400).json({
          error: `Cannot close request - request must be at the final approval step to close.`,
          currentStepId: currentRevision.currentStepId,
          finalStepId: finalStep.id
        });
      }

      // Check approval status code - only allow closing if status is A, B, or D
      const approvalStatusCode = currentRevision.approvalStatusCode;
      if (!approvalStatusCode || !['A', 'B', 'D'].includes(approvalStatusCode)) {
        const statusInfo = approvalStatusCode
          ? await storage.getApprovalStatusCode(approvalStatusCode)
          : null;
        return res.status(400).json({
          error: approvalStatusCode
            ? `Cannot close request - approval status is "${statusInfo?.label || approvalStatusCode}". Only "Approved" (A), "Approved As Noted" (B), or "Not Inspected" (D) status allows closing.`
            : "Cannot close request - no approval status set. Request must be approved before closing.",
          approvalStatusCode: approvalStatusCode || null
        });
      }

      const statusHistory = await storage.getRequestStatusHistory(currentRevisionId);

      // Check required approvals dynamically or rely on workflow engine
      // Since the workflow engine enforces transitions, being at the final step 
      // with a valid approval status is sufficient to close the request.

      const oldStatus = request.currentStatus;
      const newStatus = "Closed";

      // Update request status
      const updatedRequest = await storage.updateRequest(request.id, {
        currentStatus: newStatus,
      });

      // Update revision with currentStepId
      await storage.updateRequestRevision(currentRevisionId, {
        currentStepId: finalStep.id,
      });

      // Log status history
      await storage.createRequestStatusHistory({
        revisionId: currentRevisionId,
        oldStatus,
        newStatus,
        changedBy: currentUser.user.id,
        remarks: "Request closed after all approvals completed",
      });

      // Broadcast update to all users viewing this request
      notificationWss.broadcastRequestUpdate(request.id, currentUser.user.id, "request_closed");

      // Closed WIR with A/B → progress matrix (idempotent: skips cells already applied by /approve)
      if (requestType.code === 'WIR' && ['A', 'B'].includes(approvalStatusCode)) {
        void applyApprovedWirRevision(currentRevisionId, currentUser.user.id).catch(err =>
          console.error(`[ProgressMatrix] Failed to apply WIR revision ${currentRevisionId}:`, err));
      }

      res.json(updatedRequest);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Users API
  app.get("/api/users", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const users = await storage.getAllUsers();
      // Exclude password and heavy fields (signature, photo) from bulk user list to save bandwidth
      const safeUsers = users.map(({ password, signature, photo, ...user }) => user);

      // Fetch team members and user-team member links for position lookup
      const teamMembers = await storage.getAllTeamMembers();
      const allUserTeamMembers = await storage.getAllUserTeamMembers();
      const allPositions = await storage.getAllPositions();
      const purposeIdByPositionTitle = new Map(allPositions.map(p => [p.titleEnglish, p.purposeId]));

      // Create a map of userId to position (first linked position, kept for backward compatibility)
      // and a map of userId to ALL linked positions with their purpose, so callers can pick the
      // position matching a specific item's purpose (e.g. an Electrical vs Mechanical snag item).
      const userPositionMap = new Map<string, string>();
      const userPositionsMap = new Map<string, { title: string; purposeId: string | null }[]>();
      for (const utm of allUserTeamMembers) {
        const teamMember = teamMembers.find(tm => tm.id === utm.teamMemberId);
        if (teamMember?.position) {
          if (!userPositionMap.has(utm.userId)) {
            userPositionMap.set(utm.userId, teamMember.position);
          }
          const list = userPositionsMap.get(utm.userId) || [];
          if (!list.some(p => p.title === teamMember.position)) {
            list.push({ title: teamMember.position, purposeId: purposeIdByPositionTitle.get(teamMember.position) || null });
          }
          userPositionsMap.set(utm.userId, list);
        }
      }

      // Add position to each user
      const usersWithPosition = safeUsers.map(user => ({
        ...user,
        position: userPositionMap.get(user.id) || null,
        positions: userPositionsMap.get(user.id) || [],
      }));

      // Check for explicit skipFiltering query parameter
      // We also check referer as a fallback to ensure Request Details page always works
      const referer = req.headers.referer || "";
      const isRequestDetail = referer.includes("/requests/");
      const skipFiltering = req.query.skipFiltering === "true" || isRequestDetail;

      // If skipFiltering is true, return all users (for approval display purposes)
      if (skipFiltering) {
        return res.json(usersWithPosition);
      }

      // Default filtering for User Management page
      // super_admin sees everyone
      if (currentUser.user.role === "super_admin") {
        return res.json(usersWithPosition);
      }

      // Filter users by organization for developer_admin and org_admin
      if (currentUser.user.role === "developer_admin" || currentUser.user.role === "org_admin") {
        if (!currentUser.orgId) {
          return res.json(usersWithPosition.filter(u => u.id === currentUser.user.id));
        }

        // Get all team members that belong to current user's organization
        const orgTeamMemberIds = new Set(
          teamMembers
            .filter(m => m.organizationId === currentUser.orgId)
            .map(m => m.id)
        );

        // Find user IDs that have at least one team member in the org
        const userIdsInOrg = new Set<string>();
        userIdsInOrg.add(currentUser.user.id);
        for (const utm of allUserTeamMembers) {
          if (orgTeamMemberIds.has(utm.teamMemberId)) {
            userIdsInOrg.add(utm.userId);
          }
        }

        const filteredUsers = usersWithPosition.filter(u => userIdsInOrg.has(u.id));
        return res.json(filteredUsers);
      }

      // Standard users only see themselves
      res.json(usersWithPosition.filter(u => u.id === currentUser.user.id));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/users/signatures", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userIds } = req.body;
      if (!Array.isArray(userIds)) {
        return res.status(400).json({ error: "userIds must be an array" });
      }

      const signatures = await storage.getUsersSignatures(userIds);
      res.json(signatures);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Users can view their own profile, or admins can view any profile
      if (currentUser.user.id !== user.id && !UserCreationPermissions.canCreateUsers(currentUser.user)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);

      // Require authentication
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if user can create users at all
      if (!UserCreationPermissions.canCreateUsers(currentUser.user)) {
        return res.status(403).json({ error: "You don't have permission to create users" });
      }

      const validatedData = insertUserSchema.parse(req.body);

      // Check if user can create the specified role
      if (validatedData.role) {
        const targetRole = validatedData.role as UserRole;
        if (!UserCreationPermissions.canCreateRole(currentUser.user.role, targetRole)) {
          return res.status(403).json({ error: `You don't have permission to create users with role: ${targetRole}` });
        }
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      const userWithHashedPassword = { ...validatedData, password: hashedPassword };

      const user = await storage.createUser(userWithHashedPassword);
      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get target user's organization from junction table
      const targetUserOrgId = await getUserOrganizationId(targetUser.id);

      // Check permissions
      const targetUserPermissions: PermissionEditUser = {
        id: targetUser.id,
        organizationId: targetUserOrgId,
      };

      if (!UserEditingPermissions.canEdit(currentUser.user, targetUserPermissions, currentUser.orgId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(req.params.id, validatedData);
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/users/:id/password", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get target user's organization from junction table
      const targetUserOrgId = await getUserOrganizationId(targetUser.id);

      // Check permissions
      const targetUserPermissions: PermissionEditUser = {
        id: targetUser.id,
        organizationId: targetUserOrgId,
      };

      if (!UserEditingPermissions.canEdit(currentUser.user, targetUserPermissions, currentUser.orgId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updatePasswordSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      const user = await storage.updateUserPassword(req.params.id, hashedPassword);
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get target user's organization from junction table
      const targetUserOrgId = await getUserOrganizationId(targetUser.id);

      // Check permissions
      const targetUserPermissions: PermissionEditUser = {
        id: targetUser.id,
        organizationId: targetUserOrgId,
      };

      if (!UserEditingPermissions.canDelete(currentUser.user, targetUserPermissions, currentUser.orgId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // User-Team Member Associations API (Admin only)
  app.get("/api/user-team-members", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Only admins can view user-team member associations
      if (!["super_admin", "developer_admin", "org_admin"].includes(currentUser.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const associations = await storage.getAllUserTeamMembers();

      // For org_admin, filter to show only associations where team member belongs to their org
      if (currentUser.user.role === "org_admin" && currentUser.orgId) {
        const teamMembers = await storage.getAllTeamMembers();
        const orgTeamMemberIds = new Set(
          teamMembers.filter(tm => tm.organizationId === currentUser.orgId).map(tm => tm.id)
        );
        const filteredAssociations = associations.filter(a => orgTeamMemberIds.has(a.teamMemberId));
        return res.json(filteredAssociations);
      }

      res.json(associations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/users/:userId/team-members", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Only admins can view user team member links
      if (!["super_admin", "developer_admin", "org_admin"].includes(currentUser.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const associations = await storage.getUserTeamMembers(req.params.userId);

      // For org_admin, filter to show only associations where team member belongs to their org
      if (currentUser.user.role === "org_admin" && currentUser.orgId) {
        const teamMembers = await storage.getAllTeamMembers();
        const orgTeamMemberIds = new Set(
          teamMembers.filter(tm => tm.organizationId === currentUser.orgId).map(tm => tm.id)
        );
        const filteredAssociations = associations.filter(a => orgTeamMemberIds.has(a.teamMemberId));
        return res.json(filteredAssociations);
      }

      res.json(associations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/users/:userId/team-members", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Admins can manage user-team member links
      if (!["super_admin", "developer_admin", "org_admin"].includes(currentUser.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { teamMemberIds } = req.body;
      if (!Array.isArray(teamMemberIds)) {
        return res.status(400).json({ error: "teamMemberIds must be an array" });
      }

      // Verify user exists
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify all team members exist and belong to org_admin's organization if applicable
      for (const tmId of teamMemberIds) {
        const tm = await storage.getTeamMember(tmId);
        if (!tm) {
          return res.status(400).json({ error: `Team member ${tmId} not found` });
        }
        // For org_admin, verify team member belongs to their organization
        if (currentUser.user.role === "org_admin" && currentUser.orgId && tm.organizationId !== currentUser.orgId) {
          return res.status(403).json({ error: "You can only link team members from your organization" });
        }
      }

      // For org_admin, we need to preserve links to team members from other organizations
      if (currentUser.user.role === "org_admin" && currentUser.orgId) {
        const existingAssociations = await storage.getUserTeamMembers(req.params.userId);
        const teamMembers = await storage.getAllTeamMembers();
        const orgTeamMemberIds = new Set(
          teamMembers.filter(tm => tm.organizationId === currentUser.orgId).map(tm => tm.id)
        );
        // Keep existing links to team members from other organizations
        const otherOrgLinks = existingAssociations.filter(a => !orgTeamMemberIds.has(a.teamMemberId)).map(a => a.teamMemberId);
        // Combine with new links for this org (remove duplicates)
        const combinedSet = new Set([...otherOrgLinks, ...teamMemberIds]);
        const allTeamMemberIds = Array.from(combinedSet);
        await storage.setUserTeamMembers(req.params.userId, allTeamMemberIds);
      } else {
        await storage.setUserTeamMembers(req.params.userId, teamMemberIds);
      }

      const associations = await storage.getUserTeamMembers(req.params.userId);
      res.json(associations);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/users/:userId/team-members/:teamMemberId", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Admins can add user-team member links
      if (!["super_admin", "developer_admin", "org_admin"].includes(currentUser.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const teamMember = await storage.getTeamMember(req.params.teamMemberId);
      if (!teamMember) {
        return res.status(404).json({ error: "Team member not found" });
      }

      // For org_admin, verify team member belongs to their organization
      if (currentUser.user.role === "org_admin" && currentUser.orgId && teamMember.organizationId !== currentUser.orgId) {
        return res.status(403).json({ error: "You can only link team members from your organization" });
      }

      const association = await storage.addUserTeamMember(req.params.userId, req.params.teamMemberId);
      res.status(201).json(association);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/users/:userId/team-members/:teamMemberId", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Admins can remove user-team member links
      if (!["super_admin", "developer_admin", "org_admin"].includes(currentUser.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // For org_admin, verify the team member being removed belongs to their organization
      if (currentUser.user.role === "org_admin" && currentUser.orgId) {
        const teamMember = await storage.getTeamMember(req.params.teamMemberId);
        if (teamMember && teamMember.organizationId !== currentUser.orgId) {
          return res.status(403).json({ error: "You can only manage links for team members in your organization" });
        }
      }

      await storage.removeUserTeamMember(req.params.userId, req.params.teamMemberId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Authentication routes
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ error: "خطأ في الخادم" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "فشل تسجيل الدخول" });
      }
      req.logIn(user, async (err) => {
        if (err) {
          return res.status(500).json({ error: "خطأ في تسجيل الدخول" });
        }
        const { password, ...safeUser } = user;

        // Get organization from junction table (same as session endpoint)
        const organizationId = await getUserOrganizationId(user.id);

        // Get organization sectorType
        let organizationSectorType: string | null = null;
        if (organizationId) {
          const organization = await storage.getOrganization(organizationId);
          if (organization) {
            organizationSectorType = organization.sectorType || null;
          }
        }

        // Get linked team member IDs and positions
        const userTeamMembers = await storage.getUserTeamMembers(user.id);
        const teamMemberIds = userTeamMembers.map(utm => utm.teamMemberId);

        // Get positions from linked team members
        const positions: string[] = [];
        for (const utm of userTeamMembers) {
          const teamMember = await storage.getTeamMember(utm.teamMemberId);
          if (teamMember?.position) {
            positions.push(teamMember.position);
          }
        }

        return res.json({ user: { ...safeUser, organizationId, organizationSectorType, teamMemberIds, positions } });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "خطأ في تسجيل الخروج" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/session", async (req: Request, res: Response) => {
    if (req.isAuthenticated() && req.user) {
      const user = req.user as User;
      const { password, ...safeUser } = user;

      // Get organization from junction table
      const organizationId = await getUserOrganizationId(user.id);

      // Get organization sectorType
      let organizationSectorType: string | null = null;
      if (organizationId) {
        const organization = await storage.getOrganization(organizationId);
        if (organization) {
          organizationSectorType = organization.sectorType || null;
        }
      }

      // Get linked team member IDs and positions
      const userTeamMembers = await storage.getUserTeamMembers(user.id);
      const teamMemberIds = userTeamMembers.map(utm => utm.teamMemberId);

      // Get positions from linked team members
      const positions: string[] = [];
      for (const utm of userTeamMembers) {
        const teamMember = await storage.getTeamMember(utm.teamMemberId);
        if (teamMember?.position) {
          positions.push(teamMember.position);
        }
      }

      return res.json({ user: { ...safeUser, organizationId, organizationSectorType, teamMemberIds, positions } });
    }
    return res.json({ user: null });
  });

  // Permissions endpoint - returns user's allowed roles and permissions
  app.get("/api/auth/permissions", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.json({
        canCreateUsers: false,
        canCreateProjects: false,
        canCreateMembers: false,
        canCreateOrganizations: false,
        canInviteOrganizations: false,
        allowedRoles: [],
      });
    }

    const user = req.user as User;

    // Get organization and team members from junction table
    const userTeamMembers = await storage.getUserTeamMembers(user.id);
    const firstTeamMemberId = userTeamMembers.length > 0 ? userTeamMembers[0].teamMemberId : null;
    const organizationId = await getUserOrganizationId(user.id);

    const permOrganization = organizationId ? await storage.getOrganization(organizationId) : null;
    const permUser: PermissionUser = {
      id: user.id,
      role: user.role as UserRole,
      teamMemberId: firstTeamMemberId,
      organizationId,
      organizationSectorType: permOrganization?.sectorType || null,
    };

    return res.json({
      canCreateUsers: UserCreationPermissions.canCreateUsers(permUser),
      canCreateProjects: ProjectPermissions.canCreate(permUser),
      canCreateMembers: MemberPermissions.canCreate(permUser),
      canCreateOrganizations: OrganizationPermissions.canCreate(permUser),
      canInviteOrganizations: OrganizationPermissions.canInvite(permUser),
      allowedRoles: UserCreationPermissions.getAllowedRolesToCreate(permUser.role),
    });
  });

  // Forgot Password - Request reset email
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      // Always respond with success to prevent email enumeration
      const successMessage = "إذا كان البريد الإلكتروني مسجلاً لدينا، ستتلقى رابط لاسترجاع كلمة المرور";

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: successMessage });
      }

      // Delete any existing tokens for this user
      await storage.deleteUserTokens(user.id);

      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Clean up expired tokens periodically
      await storage.deleteExpiredTokens();

      const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${token}`;
      const userName = user.fullNameArabic || user.fullName || user.username || "المستخدم";

      // The response stays identical either way so it cannot be used to probe which
      // addresses are registered; a failure is recorded in the server log instead.
      const sendResult = await sendTransactionalEmail({
            to: email,
            subject: "استرجاع كلمة المرور - نظام إدارة المشاريع",
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">استرجاع كلمة المرور</h2>
                <p>مرحباً ${userName}،</p>
                <p>لقد تلقينا طلباً لاسترجاع كلمة المرور الخاصة بحسابك.</p>
                <p>اضغط على الزر أدناه لإعادة تعيين كلمة المرور:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    إعادة تعيين كلمة المرور
                  </a>
                </div>
                <p>أو انسخ الرابط التالي:</p>
                <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all;">
                  ${resetUrl}
                </p>
                <p style="color: #666; font-size: 14px;">
                  هذا الرابط صالح لمدة ساعة واحدة فقط.
                </p>
                <p style="color: #666; font-size: 14px;">
                  إذا لم تطلب استرجاع كلمة المرور، يمكنك تجاهل هذه الرسالة.
                </p>
              </div>
            `,
      });

      if (!sendResult.ok) {
        console.error("Password reset email not delivered:", sendResult.error);
      }

      res.json({ message: successMessage });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Reset Password - Set new password with token
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);

      // Hash the token to find it in database
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);
      if (!resetToken) {
        return res.status(400).json({ error: "رمز الاسترجاع غير صالح أو منتهي الصلاحية" });
      }

      // Check if token is expired
      if (new Date(resetToken.expiresAt) < new Date()) {
        await storage.markTokenAsUsed(resetToken.id);
        return res.status(400).json({ error: "رمز الاسترجاع منتهي الصلاحية" });
      }

      // Hash the new password and update
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(resetToken.userId, hashedPassword);

      // Mark token as used
      await storage.markTokenAsUsed(resetToken.id);

      // Clean up expired tokens
      await storage.deleteExpiredTokens();

      res.json({ message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Verify reset token (check if valid before showing reset form)
  app.get("/api/auth/verify-reset-token/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);
      if (!resetToken) {
        return res.status(400).json({ valid: false, error: "رمز الاسترجاع غير صالح" });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, error: "رمز الاسترجاع منتهي الصلاحية" });
      }

      res.json({ valid: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Notification API routes
  app.get("/api/notifications", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = req.user as User;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const notifications = await storage.getNotificationsByUser(user.id, limit);
      res.json(notifications);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = req.user as User;
      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);

      // Send real-time notification via WebSocket
      notificationWss.sendNotification(validatedData.userId, notification);

      res.status(201).json(notification);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const notification = await storage.markNotificationAsRead(req.params.id);
      res.json(notification);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = req.user as User;
      await storage.markAllNotificationsAsRead(user.id);

      // Notify via WebSocket
      notificationWss.broadcastToUser(user.id, { type: "all_read" });

      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      await storage.deleteNotification(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/notifications", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const user = req.user as User;
      await storage.deleteAllNotifications(user.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Materials API
  app.get("/api/materials", async (req, res) => {
    try {
      const { projectId } = req.query;
      const materials = projectId
        ? await storage.getMaterialsByProject(projectId as string)
        : await storage.getAllMaterials();
      res.json(materials);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/materials", async (req, res) => {
    try {
      const validatedData = insertMaterialSchema.parse(req.body);
      const material = await storage.createMaterial(validatedData);
      res.status(201).json(material);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/materials/:id", async (req, res) => {
    try {
      const validatedData = updateMaterialSchema.parse(req.body);
      const material = await storage.updateMaterial(req.params.id, validatedData);
      res.json(material);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/materials/:id", async (req, res) => {
    try {
      const materialId = req.params.id;
      const linkedRequests = await storage.getMaterialRequests(materialId);
      if (linkedRequests.length > 0) {
        throw new Error("لا يمكن حذف المادة لأنها مربوطة بطلب اعتماد مواد (MAR).");
      }

      const linkedSuppliers = await storage.getMaterialSuppliers(materialId);
      if (linkedSuppliers.length > 0) {
        throw new Error("لا يمكن حذف المادة لأنها مربوطة بمورد.");
      }

      await storage.deleteMaterial(materialId);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Suppliers API
  app.get("/api/suppliers", async (req, res) => {
    try {
      const { projectId } = req.query;
      const suppliers = projectId
        ? await storage.getSuppliersByProject(projectId as string)
        : await storage.getAllSuppliers();
      res.json(suppliers);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validatedData);
      res.status(201).json(supplier);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/suppliers/:id", async (req, res) => {
    try {
      const validatedData = updateSupplierSchema.parse(req.body);
      const supplier = await storage.updateSupplier(req.params.id, validatedData);
      res.json(supplier);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Material Suppliers API (Links)
  app.get("/api/materials/:id/suppliers", async (req, res) => {
    try {
      const links = await storage.getMaterialSuppliers(req.params.id);
      res.json(links);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/materials/:id/requests", async (req, res) => {
    try {
      const { id } = req.params;
      const uniqueRequests = await storage.getMaterialRequests(id);
      res.json(uniqueRequests);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/suppliers/:id/materials", async (req, res) => {
    try {
      const links = await storage.getSupplierMaterials(req.params.id);
      res.json(links);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/suppliers/:id/requests", async (req, res) => {
    try {
      const { id } = req.params;
      const results = await db
        .select({
          requestId: requests.id,
          requestNumber: requests.requestNumber,
          title: requestRevisions.title,
          currentStatus: requests.currentStatus,
          projectId: requests.projectId,
          approvalStatusCode: requestRevisions.approvalStatusCode,
        })
        .from(requestSuppliers)
        .innerJoin(requestRevisions, eq(requestSuppliers.revisionId, requestRevisions.id))
        .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
        .where(and(eq(requestSuppliers.supplierId, id), eq(requests.is_deleted, false)));

      // Get unique requests by ID
      const uniqueRequests = [];
      const seenIds = new Set();
      for (const r of results) {
        if (!seenIds.has(r.requestId)) {
          seenIds.add(r.requestId);
          uniqueRequests.push(r);
        }
      }

      res.json(uniqueRequests);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/material-suppliers", async (req, res) => {
    try {
      const validatedData = insertMaterialSupplierSchema.parse(req.body);
      const link = await storage.createMaterialSupplier(validatedData);
      res.status(201).json(link);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/material-suppliers/:id", async (req, res) => {
    try {
      const validatedData = updateMaterialSupplierSchema.parse(req.body);
      const link = await storage.updateMaterialSupplier(req.params.id, validatedData);
      res.json(link);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/material-suppliers/:id", async (req, res) => {
    try {
      await storage.deleteMaterialSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Supplier Attachments API
  app.get("/api/suppliers/:id/attachments", async (req, res) => {
    try {
      const attachments = await storage.getSupplierAttachments(req.params.id);
      res.json(attachments);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/suppliers/:id/attachments", async (req, res) => {
    try {
      const validatedData = insertSupplierAttachmentSchema.parse({
        ...req.body,
        supplierId: req.params.id,
      });
      const attachment = await storage.createSupplierAttachment(validatedData);
      res.status(201).json(attachment);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/suppliers/attachments/:id", async (req, res) => {
    try {
      await storage.deleteSupplierAttachment(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Material Attachments API
  app.get("/api/materials/:id/attachments", async (req, res) => {
    try {
      const attachments = await storage.getMaterialAttachments(req.params.id);
      res.json(attachments);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/materials/:id/attachments", async (req, res) => {
    try {
      const validatedData = insertMaterialAttachmentSchema.parse({
        ...req.body,
        materialId: req.params.id,
      });
      const attachment = await storage.createMaterialAttachment(validatedData);
      res.status(201).json(attachment);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/materials/attachments/:id", async (req, res) => {
    try {
      await storage.deleteMaterialAttachment(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // ==========================================
  // Snag List & Snag Items APIs
  // ==========================================

  // Helper to check if a user is allowed to view a snag list based on purpose specialization and roles
  async function canUserAccessSnagListByPurpose(user: User | undefined, list: any): Promise<boolean> {
    if (!user || !list) return false;
    // Admins, PMs, Super Admins, Developer Admins, Org Admins have full access
    if (user.role === "super_admin" || user.role === "org_admin" || user.role === "developer_admin") {
      return true;
    }
    // List creator or assignee always has access
    if (list.createdBy === user.id || list.assignedTo === user.id) {
      return true;
    }
    // If no purpose set on list, allow access
    if (!list.purposeId) {
      return true;
    }

    // Check user's team member positions
    const allUserTeamMembers = await storage.getAllUserTeamMembers();
    const allTeamMembers = await storage.getAllTeamMembers();
    const userTeamMemberIds = new Set(
      allUserTeamMembers
        .filter(utm => utm.userId === user.id)
        .map(utm => utm.teamMemberId)
    );

    const teamMembers = allTeamMembers.filter(tm => userTeamMemberIds.has(tm.id));
    const managerTitles = ["project manager", "مدير مشروع"];
    const allPositions = await storage.getAllPositions();
    const matchingPositionTitles = new Set(
      allPositions
        .filter(p => p.purposeId === list.purposeId)
        .map(p => p.titleEnglish)
    );

    for (const tm of teamMembers) {
      const posTitle = tm.position || "";
      const posLower = posTitle.toLowerCase();
      // PMs can see all purposes
      if (managerTitles.some(title => posLower.includes(title))) {
        return true;
      }
      // Specialized engineers whose position matches the list's purposeId
      if (matchingPositionTitles.has(posTitle)) {
        return true;
      }
    }

    return false;
  }

  // Get all snag lists for a project
  app.get("/api/projects/:projectId/snag-lists", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const organizationId = user ? await getUserOrganizationId(user.id) : null;
      const organization = organizationId ? await storage.getOrganization(organizationId) : null;
      const isContractor = organization?.sectorType === "Contractor";

      let lists = await storage.getSnagListsByProject(req.params.projectId);

      // Filter by Purpose Specialization and Role:
      // Contractors NEVER see draft lists.
      // Consultants (creators, PMs, admins, or specialized engineers) CAN see draft lists for collaboration.
      const filteredLists: any[] = [];
      for (const l of lists) {
        if (l.status === "draft" && isContractor) {
          continue;
        }
        if (await canUserAccessSnagListByPurpose(user, l)) {
          filteredLists.push(l);
        }
      }

      res.json(filteredLists);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get a single snag list
  app.get("/api/snag-lists/:id", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const organizationId = user ? await getUserOrganizationId(user.id) : null;
      const organization = organizationId ? await storage.getOrganization(organizationId) : null;
      const isContractor = organization?.sectorType === "Contractor";

      const list = await storage.getSnagList(req.params.id);
      if (!list) return res.status(404).json({ message: "Snag list not found" });

      if (list.status === "draft" && isContractor) {
        return res.status(403).json({ message: "Access denied to draft snag list" });
      }

      const hasPurposeAccess = await canUserAccessSnagListByPurpose(user, list);
      if (!hasPurposeAccess) {
        return res.status(403).json({ message: "Access denied to snag list for this specialization" });
      }

      res.json(list);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create a snag list
  app.post("/api/projects/:projectId/snag-lists", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const validated = insertSnagListSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
        createdBy: user?.id,
      });
      const list = await storage.createSnagList(validated);
      res.status(201).json(list);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Update a snag list
  app.patch("/api/snag-lists/:id", async (req, res) => {
    try {
      const existing = await storage.getSnagList(req.params.id);
      const validated = updateSnagListSchema.parse(req.body);

      // Prevent closing a snag list while it still has unclosed items
      if (validated.status === "completed" && existing?.status !== "completed") {
        const items = await storage.getSnagItemsByList(req.params.id);
        const unclosedCount = items.filter((i: any) => {
          const status = i.item ? i.item.status : i.status;
          return status !== "closed" && status !== "rejected";
        }).length;
        if (unclosedCount > 0) {
          return res.status(400).json({
            message: `لا يمكن إغلاق القائمة، يوجد ${unclosedCount} ملاحظة لم يتم إغلاقها بعد`,
          });
        }
      }

      const list = await storage.updateSnagList(req.params.id, validated);

      // Trigger notification if list was submitted (transitioned from draft to in_progress or open)
      if (existing && existing.status === "draft" && (validated.status === "in_progress" || validated.status === "open")) {
        const user = req.user as User | undefined;
        const senderName = user?.fullName || user?.username || "Consultant Representative";
        notificationService.notifySnagListSubmitted(
          list.id,
          list.title,
          list.serialNumber || 1,
          list.projectId,
          senderName,
          user?.id
        );
      }

      res.json(list);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete a snag list
  app.delete("/api/snag-lists/:id", async (req, res) => {
    try {
      await storage.deleteSnagList(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get snag items by list ID
  app.get("/api/snag-lists/:id/items", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const organizationId = user ? await getUserOrganizationId(user.id) : null;
      const organization = organizationId ? await storage.getOrganization(organizationId) : null;
      const isContractor = organization?.sectorType === "Contractor";
      const list = await storage.getSnagList(req.params.id);
      if (isContractor && (!list || list.status === "draft")) {
        return res.status(403).json({ message: "Access denied to draft snag list items" });
      }
      const items = await storage.getSnagItemsByList(req.params.id);
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get all snag items for a project (for overview / dashboard)
  app.get("/api/projects/:projectId/snag-items", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const organizationId = user ? await getUserOrganizationId(user.id) : null;
      const organization = organizationId ? await storage.getOrganization(organizationId) : null;
      const isContractor = organization?.sectorType === "Contractor";
      let items = await storage.getSnagItemsByProject(req.params.projectId);
      if (isContractor) {
        items = items.filter(item => item.listStatus !== "draft");
      }
      res.json(items);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create a snag item
  app.post("/api/snag-lists/:id/items", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const validated = insertSnagItemSchema.parse({
        ...req.body,
        snagListId: req.params.id,
        raisedBy: user?.id,
        createdBy: user?.id,
      });
      const item = await storage.createSnagItem(validated);
      
      // Auto-log creation history
      await storage.createSnagItemHistory({
        snagItemId: item.id,
        snagListId: req.params.id,
        action: "CREATED",
        fromStatus: null,
        toStatus: item.status || "open",
        comments: "تم توثيق وتوجيه الملاحظة الميدانية",
        performedBy: user?.id || null,
      });

      res.status(201).json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Batch Sign-off / Close snag items (Bulk Consultant Approval)
  app.post("/api/snag-items/batch-close", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const { itemIds, comment } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "itemIds array is required and must not be empty" });
      }

      const results = [];
      for (const id of itemIds) {
        const existing = await storage.getSnagItem(id);
        if (!existing) continue;

        const updated = await storage.updateSnagItem(id, {
          status: "closed",
          closedBy: user?.id,
          closedAt: new Date(),
        });

        await storage.createSnagItemHistory({
          snagItemId: updated.id,
          snagListId: updated.snagListId,
          action: "CLOSED",
          fromStatus: existing.status || null,
          toStatus: "closed",
          comments: comment || "Bulk sign-off and closed by consultant",
          performedBy: user?.id || null,
          attachments: existing.afterImages || [],
        });

        results.push(updated);
      }

      res.json({ success: true, count: results.length, items: results });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Update a snag item (status, assignment, images, comments, etc.)
  app.patch("/api/snag-items/:id", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const existing = await storage.getSnagItem(req.params.id);
      const data = { ...req.body };
      
      // Handle auto sign-off timestamp when status changes to 'closed'
      if (data.status === "closed") {
        data.closedBy = user?.id;
        data.closedAt = new Date();
      }

      // Track who actually submitted the contractor resolution (repair notes/photos + move to review)
      if (data.status === "pending_inspection") {
        data.resolvedBy = user?.id;
        data.resolvedAt = new Date();
      }

      // Handle reinspection count increment if returned for rework
      if (data.status === "reinspection" || data.status === "open" && existing?.status === "pending_inspection") {
        data.reinspectionCount = (existing?.reinspectionCount || 0) + 1;
      }

      const validated = updateSnagItemSchema.parse(data);
      const item = await storage.updateSnagItem(req.params.id, validated);

      // Auto-log audit history entry
      const logAction = data.status === "closed" 
        ? "CLOSED" 
        : data.contractorComment 
          ? "REPAIRED" 
          : data.consultantReviewComment 
            ? "REVIEWED" 
            : "UPDATED";

      const commentText = data.contractorComment 
        || data.consultantReviewComment 
        || data.pmReviewComment 
        || data.resolutionDescription 
        || `تحديث حالة الملاحظة إلى ${data.status || item.status}`;

      await storage.createSnagItemHistory({
        snagItemId: item.id,
        snagListId: item.snagListId,
        action: logAction,
        fromStatus: existing?.status || null,
        toStatus: item.status,
        comments: commentText,
        performedBy: user?.id || null,
        attachments: data.rectificationPhotos || data.afterImages || [],
      });

      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete a snag item
  app.delete("/api/snag-items/:id", async (req, res) => {
    try {
      await storage.deleteSnagItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // Execute workflow transition on Snag List Group
  app.post("/api/snag-lists/:id/transition", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const { action, comments, targetStepId, status } = req.body;
      const list = await storage.getSnagList(req.params.id);
      if (!list) return res.status(404).json({ message: "Snag list not found" });

      // Prevent closing a snag list while it still has unclosed items
      const items = await storage.getSnagItemsByList(req.params.id);
      if (status === "completed" && list.status !== "completed") {
        const unclosedCount = items.filter((i: any) => i.status !== "closed" && i.status !== "rejected").length;
        if (unclosedCount > 0) {
          return res.status(400).json({
            message: `لا يمكن إغلاق القائمة، يوجد ${unclosedCount} ملاحظة لم يتم إغلاقها بعد`,
          });
        }
      }

      const updated = await storage.updateSnagList(req.params.id, {
        currentStepId: targetStepId || list.currentStepId,
        status: status || list.status,
      });

      // Log history for all items in list
      for (const item of items) {
        await storage.createSnagItemHistory({
          snagItemId: item.id,
          snagListId: req.params.id,
          action: action || "WORKFLOW_TRANSITION",
          fromStatus: list.status,
          toStatus: status || list.status,
          comments: comments || `تحويل حالة القائمة: ${action}`,
          performedBy: user?.id || null,
        });
      }

      res.json(updated);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get history for a snag item
  app.get("/api/snag-items/:id/history", async (req, res) => {
    try {
      const history = await storage.getSnagItemHistory(req.params.id);
      res.json(history);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Post history entry for a snag item
  app.post("/api/snag-items/:id/history", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const entry = await storage.createSnagItemHistory({
        ...req.body,
        snagItemId: req.params.id,
        performedBy: user?.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ==================== RFQ ROUTES ====================
  app.get("/api/projects/:projectId/rfqs", async (req, res) => {
    try {
      const rfqsList = await storage.getRfqsByProject(req.params.projectId);
      res.json(rfqsList);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/rfqs/:id", async (req, res) => {
    try {
      const rfq = await storage.getRfq(req.params.id);
      if (!rfq) {
        return res.status(404).json({ message: "Request for Quotation not found" });
      }
      res.json(rfq);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/rfqs", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const projectId = req.params.projectId;
      const { items, supplierIds, ...rfqData } = req.body;

      const rfqNumber = rfqData.rfqNumber || (await storage.getNextRfqNumber(projectId));

      const rfq = await storage.createRfq({
        ...rfqData,
        projectId,
        rfqNumber,
        createdBy: user?.id,
      });

      // Insert items if provided
      if (Array.isArray(items) && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await storage.createRfqItem({
            rfqId: rfq.id,
            materialId: item.materialId || null,
            itemName: item.itemName || null,
            itemDescription: item.itemDescription || "",
            quantity: item.quantity,
            unit: item.unit || "pcs",
            notes: item.notes || null,
            sortOrder: i,
          });
        }
      }

      // Invite suppliers if provided
      if (Array.isArray(supplierIds) && supplierIds.length > 0) {
        for (const supplierId of supplierIds) {
          await storage.addSupplierToRfq({
            rfqId: rfq.id,
            supplierId,
            status: "invited",
          });
        }
      }

      const completeRfq = await storage.getRfq(rfq.id);
      res.status(201).json(completeRfq);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/rfqs/:id", async (req, res) => {
    try {
      const rfq = await storage.updateRfq(req.params.id, req.body);
      res.json(rfq);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/rfqs/:id", async (req, res) => {
    try {
      await storage.deleteRfq(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/rfqs/:id/items", async (req, res) => {
    try {
      const item = await storage.createRfqItem({
        ...req.body,
        rfqId: req.params.id,
      });
      res.status(201).json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/rfqs/items/:id", async (req, res) => {
    try {
      const item = await storage.updateRfqItem(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/rfqs/items/:id", async (req, res) => {
    try {
      await storage.deleteRfqItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/rfqs/:id/suppliers", async (req, res) => {
    try {
      const entry = await storage.addSupplierToRfq({
        ...req.body,
        rfqId: req.params.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/rfqs/suppliers/:id", async (req, res) => {
    try {
      await storage.removeSupplierFromRfq(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  // ==================== QUOTATION ROUTES ====================
  app.get("/api/rfqs/:rfqId/quotations", async (req, res) => {
    try {
      const quotes = await storage.getQuotationsByRfq(req.params.rfqId);
      res.json(quotes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/projects/:projectId/quotations", async (req, res) => {
    try {
      const quotes = await storage.getQuotationsByProject(req.params.projectId);
      res.json(quotes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/quotations/:id", async (req, res) => {
    try {
      const quote = await storage.getQuotation(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quotation not found" });
      }
      res.json(quote);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/rfqs/:rfqId/quotations", async (req, res) => {
    try {
      const { items, ...quoteData } = req.body;
      // Validate through the schema so the mandatory supplier document is actually enforced
      // here, not only in the form.
      const validatedQuote = insertQuotationSchema.parse({
        ...quoteData,
        submissionDate: quoteData.submissionDate || new Date().toISOString().split("T")[0],
        rfqId: req.params.rfqId,
      });
      const quote = await storage.createQuotation(validatedQuote);

      // Insert quotation items
      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          await storage.createQuotationItem({
            quotationId: quote.id,
            rfqItemId: item.rfqItemId || null,
            materialId: item.materialId || null,
            itemDescription: item.itemDescription,
            quantity: item.quantity,
            unit: item.unit || "pcs",
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            notes: item.notes || null,
          });
        }
      }

      // Update RFQ status to 'evaluating' if still in 'draft' or 'sent'
      const rfq = await storage.getRfq(req.params.rfqId);
      if (rfq && (rfq.status === "draft" || rfq.status === "sent")) {
        await storage.updateRfq(rfq.id, { status: "evaluating" });
      }

      // Update supplier status in rfq_suppliers to 'submitted'
      const rfqSuppliersList = await storage.getRfqSuppliers(req.params.rfqId);
      const matched = rfqSuppliersList.find(s => s.supplierId === quoteData.supplierId);
      if (matched) {
        await storage.updateRfqSupplier(matched.id, {
          status: "submitted",
          submittedAt: new Date(),
        });
      }

      const completeQuote = await storage.getQuotation(quote.id);
      res.status(201).json(completeQuote);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/quotations/:id", async (req, res) => {
    try {
      const quote = await storage.updateQuotation(req.params.id, req.body);
      res.json(quote);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/quotations/:id", async (req, res) => {
    try {
      await storage.deleteQuotation(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/rfqs/:rfqId/ordered-items", async (req, res) => {
    try {
      res.json(await storage.getRfqOrderedItems(req.params.rfqId));
    } catch (error) {
      handleError(res, error);
    }
  });

  // Award per item: one draft PO per supplier from { rfqItemId, quotationId } assignments.
  app.post("/api/rfqs/:rfqId/create-purchase-orders", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      const pos = await storage.createPurchaseOrdersFromAssignments(req.params.rfqId, assignments, user?.id);
      res.status(201).json(pos);
    } catch (error: any) {
      if (error instanceof Error && !(error as any).code) {
        return res.status(400).json({ message: error.message });
      }
      handleError(res, error);
    }
  });

  // ==================== PURCHASE ORDER ROUTES ====================
  app.get("/api/projects/:projectId/purchase-orders", async (req, res) => {
    try {
      const pos = await storage.getPurchaseOrdersByProject(req.params.projectId);
      res.json(pos);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) {
        return res.status(404).json({ message: "Purchase Order not found" });
      }
      res.json(po);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/projects/:projectId/purchase-orders", async (req, res) => {
    try {
      const user = req.user as User | undefined;
      const projectId = req.params.projectId;
      const { items, ...poData } = req.body;

      const poNumber = poData.poNumber || (await storage.getNextPoNumber(projectId));

      const po = await storage.createPurchaseOrder({
        ...poData,
        projectId,
        poNumber,
        createdBy: user?.id,
        // Approval is a deliberate step on the detail page; an order cannot be created
        // already approved, or the approval gate would mean nothing.
        status: "draft",
        approvedBy: null,
        approvedAt: null,
      });

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          // Validate through the schema rather than hand-building the row: this is what
          // enforces that every line carries a catalog material.
          const validatedItem = insertPoItemSchema.parse({
            poId: po.id,
            materialId: item.materialId,
            rfqItemId: item.rfqItemId || null,
            itemName: item.itemName || null,
            itemDescription: item.itemDescription || "",
            quantity: item.quantity,
            unit: item.unit || "pcs",
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            notes: item.notes || null,
          });
          await storage.createPoItem(validatedItem);
        }
      }

      const fullPo = await storage.getPurchaseOrder(po.id);
      res.status(201).json(fullPo);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Approval gate: only an approved order can be received against in the warehouse.
  app.post("/api/purchase-orders/:id/approve", async (req, res) => {
    try {
      const currentUser = await getCurrentUserWithOrg(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const canApprove =
        currentUser.user.role === "super_admin" ||
        currentUser.user.role === "developer_admin" ||
        currentUser.user.role === "org_admin";
      if (!canApprove) {
        return res.status(403).json({ error: "ليس لديك صلاحية اعتماد أوامر الشراء" });
      }
      const po = await storage.approvePurchaseOrder(req.params.id, currentUser.user.id);
      res.json(po);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Record a shipment against an approved order: creates the DN, the stock movements,
  // and advances the order's received quantities and status in one transaction.
  app.post("/api/purchase-orders/:id/receipts", async (req, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) {
        return res.status(404).json({ error: "أمر الشراء غير موجود" });
      }

      const ctx = await getInventoryContext(req, po.projectId);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.permissions.canReceive) {
        return res.status(403).json({ error: "ليس لديك صلاحية تسجيل استلام في هذا المشروع" });
      }

      const validated = createPoReceiptSchema.parse(req.body);
      const receipt = await storage.createReceiptFromPo({
        ...validated,
        purchaseOrderId: po.id,
        supplierName: po.supplierName,
        performedBy: ctx.currentUser.user.id,
      });
      res.status(201).json(receipt);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/purchase-orders/:id", async (req, res) => {
    try {
      // status moves through the approve endpoint and the receipt flow, never a raw edit.
      const { status, approvedBy, approvedAt, ...safeData } = req.body ?? {};
      const po = await storage.updatePurchaseOrder(req.params.id, safeData);
      res.json(po);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/purchase-orders/:id", async (req, res) => {
    try {
      await storage.deletePurchaseOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/purchase-orders/:id/items", async (req, res) => {
    try {
      const item = await storage.createPoItem({
        ...req.body,
        poId: req.params.id,
      });
      res.status(201).json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch("/api/purchase-orders/items/:id", async (req, res) => {
    try {
      const item = await storage.updatePoItem(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/purchase-orders/items/:id", async (req, res) => {
    try {
      await storage.deletePoItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(res, error);
    }
  });

  const httpServer = createServer(app);

  // Initialize WebSocket server for real-time notifications
  notificationWss.initialize(httpServer);

  return httpServer;
}
