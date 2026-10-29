import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, boolean, timestamp, uniqueIndex, index, check, json, jsonb, AnyPgColumn, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameArabic: text("name_arabic"),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"),
  address: text("address"),
  sectorType: text("sector_type"),
  vatNumber: varchar("vat_number", { length: 15 }),
  // Commercial registration number: the unique identity of a company in the system
  ccrNumber: varchar("ccr_number", { length: 10 }).unique(),
  logo: text("logo"),
});

export const userSessions = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contractorId: varchar("contractor_id").references(() => organizations.id, { onDelete: "set null" }),
  consultantId: varchar("consultant_id").references(() => organizations.id, { onDelete: "set null" }),
  creatorId: varchar("creator_id"),
  status: text("status").notNull(),
  location: text("location").notNull(),
  contractValue: decimal("contract_value", { precision: 12, scale: 2 }).notNull(),
  estimatedCost: decimal("estimated_cost", { precision: 12, scale: 2 }).notNull(),
  actualCost: decimal("actual_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  progress: integer("progress").notNull().default(0),
  description: text("description"),
});

// Project Folders - Hierarchical folder structure for Project Storage
export const projectFolders = pgTable("project_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: varchar("parent_id").references((): AnyPgColumn => projectFolders.id, { onDelete: "cascade" }), // Self-reference for hierarchy
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameArabic: text("name_arabic"),
  email: text("email").notNull(),
  position: text("position"),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("general"),
  assignedTo: varchar("assigned_to").references(() => teamMembers.id, { onDelete: "set null" }),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  dueDate: date("due_date"),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => projectFolders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  size: text("size").notNull(),
  uploadDate: timestamp("upload_date").notNull().defaultNow(),
  fileData: text("file_data").notNull(),
  fileUrl: text("file_url"), // GCS/R2 path
  fileName: text("file_name"), // Original filename
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  tags: json("tags").$type<string[]>().default([]).notNull(),
}, (table) => ({
  projectIdIdx: uniqueIndex("docs_project_id_idx").on(table.projectId, table.id),
}));

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestId: varchar("request_id").references(() => requests.id, { onDelete: "set null" }), // Link to workflow request
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  userId: varchar("user_id"),
  userName: text("user_name").notNull().default("System"),
  workListActivityId: varchar("work_list_activity_id"),
  requestTypeId: varchar("request_type_id"),
  activityCode: text("activity_code"),
  scheduledDate: text("scheduled_date"),
  createdAt: date("created_at").notNull().default(sql`CURRENT_DATE`),
});

// Work Locations - Flat structure based on CSV format
export const workLocations = pgTable("work_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  unitCustomNumber: text("unit_custom_number"),
  unitDescription: text("unit_description"),
  unitZone: text("unit_zone"),
  unitCluster: text("unit_cluster"),
  unitBlock: text("unit_block"),
  buildingNo: text("building_no"),
  flatNo: text("flat_no"),
  areaM2: text("area_m2"),
  floor: text("floor"),
  villaType: text("villa_type"),
  part: text("part"),
});

// Work List Divisions - Top level of hierarchy (read-only)
export const workListDivisions = pgTable("work_list_divisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Work List Chapters - Child of Division
export const workListChapters = pgTable("work_list_chapters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  divisionId: varchar("division_id").notNull().references(() => workListDivisions.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Work List Activities - Child of Chapter
export const workListActivities = pgTable("work_list_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => workListChapters.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 20 }).notNull(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Checklist Items - Three categories: main, sbc (Saudi Building Codes), recommendations, mir, ssr
export const checklistItems = pgTable("checklist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: varchar("category", { length: 20 }).notNull(), // main, sbc, recommendations, mir, ssr
  code: varchar("code", { length: 20 }).notNull(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Work Levels - Project-specific work level definitions
export const workLevels = pgTable("work_levels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 20 }).notNull(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Users - Application users with role and admin settings
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  fullNameArabic: text("full_name_arabic"),
  role: text("role").notNull().default("user"), // user, super_admin, org_admin
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  avatar: text("avatar"),
  phone: text("phone"),
  photo: text("photo"),
  signature: text("signature"),
});

// User-Team Member Junction Table - Many-to-many relationship
export const userTeamMembers = pgTable("user_team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamMemberId: varchar("team_member_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }),
});

// Team Member Permissions - RBAC per team member per request type per project
export const teamMemberPermissions = pgTable("team_member_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  teamMemberId: varchar("team_member_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }),
  requestTypeId: varchar("request_type_id").notNull().references(() => requestTypes.id, { onDelete: "cascade" }),
  canView: boolean("can_view").notNull().default(true),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
});

// User Permissions - RBAC synced from team member permissions for linked users
export const userPermissions = pgTable("user_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestTypeId: varchar("request_type_id").notNull().references(() => requestTypes.id, { onDelete: "cascade" }),
  canView: boolean("can_view").notNull().default(true),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
});

// Password Reset Tokens - For email-based password recovery
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

// Project Invitations - a developer asks an organization to take the contractor or
// consultant role on one specific project. Nothing is assigned by the developer alone:
// projects.contractorId / consultantId is written only when the invited organization
// accepts, so every assignment carries that organization's own consent.
//
// Three ways in, one row out:
//   - the organization is already in the system  -> invitedOrganizationId is set, an
//     in-app notification goes to its admins, and no token or email is needed
//   - the email belongs to an existing account   -> the same, resolved from the email
//   - the email is new                           -> tokenHash + email, an emailed link,
//     and the organization registers itself before answering the invitation
//
// The table keeps its name because it is still the same object; what it points at is now
// a project rather than the system as a whole.
export const organizationInvitations = pgTable("organization_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invitingOrganizationId: varchar("inviting_organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  invitedByUserId: varchar("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  // The project this invitation is about, and which side of it is being offered
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }),
  role: text("role"), // contractor | consultant
  // Set when the target organization is known up front; null until a new one registers
  invitedOrganizationId: varchar("invited_organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  // Email and token exist only for the "organization is not in the system yet" path
  email: text("email"),
  sectorType: text("sector_type").notNull(), // Contractor | Consultant
  // Only the hash is stored; the token itself lives only in the emailed link
  tokenHash: text("token_hash"),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | revoked
  acceptedOrganizationId: varchar("accepted_organization_id").references(() => organizations.id, { onDelete: "set null" }),
  acceptedAt: text("accepted_at"),
  // Who answered, so an acceptance is attributable to a person
  respondedByUserId: varchar("responded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashIdx: uniqueIndex("organization_invitations_token_hash_idx").on(table.tokenHash),
  invitingOrgIdx: index("organization_invitations_inviting_org_idx").on(table.invitingOrganizationId),
  invitedOrgIdx: index("organization_invitations_invited_org_idx").on(table.invitedOrganizationId),
  projectIdx: index("organization_invitations_project_idx").on(table.projectId),
  // One outstanding invitation per role per project. The old uniqueness rules were per
  // developer/organization pair, which would have blocked inviting the same contractor
  // to a second project.
  pendingProjectRoleIdx: uniqueIndex("organization_invitations_pending_project_role_idx")
    .on(table.projectId, table.role)
    .where(sql`status = 'pending'`),
}));

// Form Settings for Work Acceptance and Material Approval
export const projectFormSettings = pgTable("project_form_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
});

// Normalized Request Type Settings
export const requestTypeSettings = pgTable("request_type_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestTypeId: varchar("request_type_id").notNull().references(() => requestTypes.id, { onDelete: "cascade" }),
  prefix: varchar("prefix", { length: 20 }).notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectRequestTypeIdx: uniqueIndex("project_request_type_idx").on(table.projectId, table.requestTypeId),
}));

// Request Types - Definitions for different types of requests in the workflow
// id_number is used to link with workflow_steps and workflow_transitions tables (which use integer IDs)
export const requestTypes = pgTable("request_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  id_number: integer("id_number").notNull().unique(), // Integer ID for workflow table linking
  code: varchar("code", { length: 50 }).notNull(),
  name_english: text("name_english").notNull(),
  name_arabic: text("name_arabic").notNull(),
  description: text("description"),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
});

// Request Counters - Track naming series counter per project per request type
export const requestCounters = pgTable("request_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestTypeId: varchar("request_type_id").notNull().references(() => requestTypes.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
}, (table) => ({
  uniqueConstraint: uniqueIndex("request_counters_unique").on(table.projectId, table.requestTypeId),
}));

// Workflow Steps - Define the approval workflow for different request types
export const workflowSteps = pgTable("workflow_steps", {
  id: integer("id").primaryKey(),
  requestTypeId: integer("request_type_id").notNull(),
  stepName: text("step_name").notNull(),
  roleRequired: integer("role_required").notNull(),
  sequenceOrder: integer("sequence_order").notNull(),
}, (table) => []);

// Workflow Transitions - Define allowed transitions between workflow steps
export const workflowTransitions = pgTable("workflow_transitions", {
  transitionId: integer("transition_id").primaryKey(),
  requestTypeId: integer("request_type_id").notNull(),
  fromStepId: integer("from_step_id").notNull(),
  toStepId: integer("to_step_id").notNull(),
  allowedStatus: text("allowed_status").notNull(),
}, (table) => []);

// WIR Requests - Work Inspection Request records (Header - Immutable)
export const requests = pgTable("requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestNumber: varchar("request_number", { length: 50 }).notNull(),
  referenceCode: text("reference_code").notNull(), // Generated from Division+Chapter+Activity
  requestTypeId: varchar("request_type_id").notNull().references(() => requestTypes.id),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  projectName: text("project_name"), // Stored at creation for snapshotting
  contractorId: varchar("contractor_id").references(() => organizations.id),
  contractorName: text("contractor_name"), // Stored at creation for snapshotting
  consultantId: varchar("consultant_id").references(() => organizations.id),
  consultantName: text("consultant_name"), // Stored at creation for snapshotting
  currentStatus: text("current_status").notNull().default(""),
  currentRevisionId: varchar("current_revision_id"),
  createdBy: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  is_deleted: boolean("is_deleted").notNull().default(false),
}, (table) => ({
  projectIdIdx: uniqueIndex("requests_project_id_idx").on(table.projectId, table.id),
}));

// Request Revisions - Mutable payload data for each revision
export const requestRevisions = pgTable("request_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull().default(0),
  currentStepId: integer("current_step_id"), // FK to workflow_steps.id - moved from requests table
  approvalStatusCode: varchar("approval_status_code", { length: 10 }), // FK to approval_status_codes.code (A, B, C, D, E)
  approvalComments: text("approval_comments"), // Comments when approval status is set
  approvedBy: varchar("approved_by_user_id"), // User who set the approval status
  approvedAt: text("approved_at"), // When approval status was set
  // Mutable payload fields
  title: text("title").notNull(),
  description: text("description"),
  workListActivityId: varchar("work_list_activity_id").references(() => workListActivities.id),
  activityCode: text("activity_code"), // Snapshot
  activityName: text("activity_name"), // Snapshot
  chapterName: text("chapter_name"), // Snapshot
  divisionName: text("division_name"), // Snapshot
  workLocationId: varchar("work_location_id").references(() => workLocations.id),
  workLevelId: varchar("work_level_id").references(() => workLevels.id),
  workLevelName: text("work_level_name"), // Snapshot
  scheduledDate: date("scheduled_date"),
  remarks: text("remarks"),
  metadata: json("metadata").$type<Record<string, any>>().default({}),
  createdBy: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  requestIdIdx: uniqueIndex("revisions_request_id_idx").on(table.requestId, table.id),
}));

// Request Status History - Audit trail for status changes
export const requestStatusHistory = pgTable("request_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  oldStatus: text("old_status").notNull(),
  newStatus: text("new_status").notNull(),
  changedBy: varchar("changed_by_user_id").notNull().references(() => users.id),
  remarks: text("remarks"),
  changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Purposes - Link requests to purposes
export const requestPurposes = pgTable("request_purposes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  purposeId: varchar("purpose_id").notNull().references(() => purposes.id, { onDelete: "cascade" }),
  purposeName: text("purpose_name").notNull(),
  purposeCategory: varchar("purpose_category", { length: 50 }),
  remarks: text("remarks"),
});

// Request Documents - Link requests to documents/attachments
export const requestDocuments = pgTable("request_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 20 }).notNull().default("upload"), // 'upload' or 'project'
  projectDocumentId: varchar("project_document_id"), // Link to project document if source is 'project'
  documentType: varchar("document_type", { length: 100 }),
  documentRef: varchar("document_ref", { length: 255 }),
  description: text("description"),
  title: text("title"),
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: text("uploaded_at").default(sql`CURRENT_TIMESTAMP`),
  remarks: text("remarks"),
}, (table) => ({
  projectDocumentFk: foreignKey({
    columns: [table.projectDocumentId],
    foreignColumns: [documents.id],
    name: "request_documents_project_document_id_fkey"
  }).onDelete("set null"),
  revisionIdIdx: uniqueIndex("req_docs_revision_id_idx").on(table.revisionId, table.id),
}));

// Request Work Locations - Junction table linking revisions to work locations
export const requestWorkLocations = pgTable("request_work_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  workLocationId: varchar("work_location_id").notNull().references(() => workLocations.id, { onDelete: "cascade" }),
  unit: varchar("unit", { length: 100 }),
  zone: varchar("zone", { length: 100 }),
  block: varchar("block", { length: 100 }),
  building: varchar("building", { length: 100 }),
  floor: varchar("floor", { length: 50 }),
  part: varchar("part", { length: 100 }),
  remarks: text("remarks"),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Work Levels - Junction table linking revisions to work levels
export const requestWorkLevels = pgTable("request_work_levels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  workLevelId: varchar("work_level_id").notNull().references(() => workLevels.id, { onDelete: "cascade" }),
  remarks: text("remarks"),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Deliveries - Junction table linking revisions to deliveries (for MIR)
export const requestDeliveries = pgTable("request_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  deliveryId: varchar("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  remarks: text("remarks"),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Suppliers - Junction table linking revisions to suppliers (for SSR)
export const requestSuppliers = pgTable("request_suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  remarks: text("remarks"),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Materials - Junction table linking revisions to materials (for MAR)
export const requestMaterials = pgTable("request_materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  remarks: text("remarks"),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Activity Checklist Items - Junction table for many-to-many relationship
export const activityChecklistItems = pgTable("activity_checklist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => workListActivities.id, { onDelete: "cascade" }),
  checklistItemId: varchar("checklist_item_id").notNull().references(() => checklistItems.id, { onDelete: "cascade" }),
  addedBy: varchar("added_by").references(() => users.id),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Request Inquiries - Questions and answers for WIR requests (legacy)
export const requestInquiries = pgTable("request_inquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer"),
  isRequired: boolean("is_required").notNull().default(false),
  askedBy: varchar("asked_by").notNull().references(() => users.id),
  answeredBy: varchar("answered_by").references(() => users.id),
  askedAt: text("asked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  answeredAt: text("answered_at"),
});

// Request Messages - Chat-style messaging for WIR requests with attachment support
export const requestMessages = pgTable("request_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  message: text("message"),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  sentAt: text("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Message Attachments - Files attached to messages
export const messageAttachments = pgTable("message_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => requestMessages.id, { onDelete: "cascade" }),
  title: text("title"),
  fileName: text("file_name").notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Revision Checklist Responses - Stores Yes/No/N/A responses for checklist items per revision
export const revisionChecklistResponses = pgTable("revision_checklist_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  checklistItemId: varchar("checklist_item_id").notNull().references(() => checklistItems.id, { onDelete: "cascade" }),
  response: varchar("response", { length: 10 }).notNull(), // 'yes', 'no', 'na'
  respondedBy: varchar("responded_by").references(() => users.id),
  respondedAt: text("responded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  remarks: text("remarks"),
});

// Request Consultant Reviews - Consultant reviews for WIR requests
export const requestConsultantReviews = pgTable("request_consultant_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  residentEngineerUserId: varchar("resident_engineer_user_id").references(() => users.id),
  comments: text("comments"),
  statusCode: varchar("status_code", { length: 50 }),
  receivedAt: text("received_at"),
  reviewedAt: text("reviewed_at").default(sql`CURRENT_TIMESTAMP`),
});

// Request Attachments - Image/file attachments for consultant reviews
export const requestAttachments = pgTable("request_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => requestRevisions.id, { onDelete: "cascade" }),
  title: text("title"),
  fileName: text("file_name").notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileData: text("file_data"),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  uploadedBy: varchar("uploaded_by_user_id").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  revisionIdIdx: uniqueIndex("req_attach_revision_id_idx").on(table.revisionId, table.id),
}));

// Approval Status Codes - Lookup table for approval status codes (A/B/C/D/E)
export const approvalStatusCodes = pgTable("approval_status_codes", {
  code: varchar("code", { length: 10 }).primaryKey(), // A, B, C, D, E
  label: text("label").notNull(), // Approved, Approved As Noted, etc.
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Notifications - User notifications for system events
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // info, success, warning, error, assignment, status_change, approval, mention, document
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  requestId: varchar("request_id").references(() => requests.id, { onDelete: "set null" }),
  activityId: varchar("activity_id"),
  link: text("link"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const requestDeletions = pgTable("request_deletions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  deletedBy: varchar("deleted_by").notNull().references(() => users.id),
  deletedAt: text("deleted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reason: text("reason"),
  restoredBy: varchar("restored_by").references(() => users.id),
  restoredAt: text("restored_at"),
});

// Deliveries - Logistic records for truck arrivals/shipments (Header Info)
export const deliveries = pgTable("deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  shipmentNumber: text("shipment_number").notNull(), // رقم الشحنة
  deliveryInvoiceNumber: text("delivery_invoice_number"), // رقم فاتورة التوريد
  supplier: text("supplier").notNull(), // المورد
  supplierId: varchar("supplier_id").references(() => suppliers.id, { onDelete: "set null" }), // المورد المرتبط
  arrivalDate: date("arrival_date").notNull(), // تاريخ الوصول
  deliveryNoteId: varchar("delivery_note_id").references(() => documents.id, { onDelete: "set null" }), // رابط مستند التوريد
  // Nullable for rows that predate the inventory feature; the migration backfills them to the
  // project's default warehouse, and new deliveries are required to name one.
  warehouseId: varchar("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }), // المستودع المستلم
  // Where this receipt came from. 'purchase_order' is the normal path and requires
  // purchaseOrderId; every other value is an exception and requires sourceReason.
  receiptSource: text("receipt_source").notNull().default("legacy"), // مصدر الاستلام
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }), // أمر الشراء
  sourceReason: text("source_reason"), // سبب الاستلام بلا أمر شراء
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Delivery Items - Specific materials within a shipment
export const deliveryItems = pgTable("delivery_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deliveryId: varchar("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  materialName: text("material_name").notNull(), // اسم المادة
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }), // المادة المرتبطة
  materialDescription: text("material_description"), // وصف المادة
  arrivalQuantity: decimal("arrival_quantity", { precision: 12, scale: 2 }).notNull(), // الكمية الواصلة
  unit: text("unit").notNull(), // الوحدة
  // Set when the receipt came from a purchase order; drives poItems.receivedQuantity.
  poItemId: varchar("po_item_id").references(() => poItems.id, { onDelete: "set null" }), // بند أمر الشراء
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Materials - Central registry of construction materials
export const materials = pgTable("materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), // المشروع المرتبط
  materialCode: text("material_code"), // كود المادة (ID)
  materialName: text("material_name").notNull(), // اسم المادة
  unit: text("unit").notNull(), // الوحدة
  minStockLevel: integer("min_stock_level").notNull().default(0), // الحد الأدنى للمخزون (على مستوى المشروع كله)
  category: text("category").notNull(), // الفئة
  description: text("description"), // وصف المادة
  originCountry: text("origin_country"), // بلد المنشأ
  imageUrl: text("image_url"), // صورة المادة لمعرض المواد
  // When true, any issue voucher containing this material waits for approval before stock moves.
  requiresIssueApproval: boolean("requires_issue_approval").notNull().default(false), // يحتاج اعتماد قبل الصرف
});

// Suppliers - Database of material suppliers
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), // المشروع المرتبط
  supplierName: text("supplier_name").notNull(), // اسم المورد
  contactPerson: text("contact_person"), // شخص التواصل
  email: text("email"), // البريد الإلكتروني
  phone: text("phone"), // الهاتف
  address: text("address"), // العنوان
  taxNumber: varchar("tax_number"), // الرقم الضريبي
  contactInfo: text("contact_info"), // معلومات إضافية
  logoUrl: text("logo_url"), // شعار المورد
  category: text("category"), // فئة المورد (مثل: مدني، ميكانيكا، إلخ)
  experienceYears: integer("experience_years"), // سنوات الخبرة
});

// Material Suppliers - Junction table for many-to-many relationship
export const materialSuppliers = pgTable("material_suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  lastPrice: decimal("last_price", { precision: 12, scale: 2 }), // آخر سعر توريد
  leadTime: text("lead_time"), // مدة التوريد
});

// Supplier Attachments - Link suppliers to documents in Project Storage
export const supplierAttachments = pgTable("supplier_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  category: text("category"), // e.g., "Commercial Register", "Tax Certificate"
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Material Attachments - Link materials to documents in Project Storage
export const materialAttachments = pgTable("material_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  category: text("category"), // e.g., "TDS", "MSDS", "Test Report", "Catalogue"
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Warehouses - مستودعات المشروع. كل حركة مخزون تنتمي لمستودع واحد.
export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // اسم المستودع
  code: text("code"), // كود المستودع
  location: text("location"), // الموقع
  keeperName: text("keeper_name"), // أمين المستودع
  // Exactly one warehouse per project should carry this flag; it receives deliveries that
  // do not name a warehouse and absorbs the migration backfill.
  isDefault: boolean("is_default").notNull().default(false), // المستودع الافتراضي
  isActive: boolean("is_active").notNull().default(true), // نشط
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Inventory Approver Positions - المناصب التي يحق لها اعتماد سندات الصرف في المشروع.
// يتبع نمط workflowSteps.roleRequired الذي يطابق positions.numericId.
export const inventoryApproverPositions = pgTable("inventory_approver_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  positionId: varchar("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Stock movement direction is derived from movementType, never stored as a sign on quantity.
// Both client and server must classify through these two lists.
export const STOCK_IN_TYPES = ["in", "return_from_site", "adjustment_in", "opening_balance", "transfer_in"] as const;
export const STOCK_OUT_TYPES = ["out", "return_to_supplier", "adjustment_out", "waste", "transfer_out"] as const;
export const STOCK_MOVEMENT_TYPES = [...STOCK_IN_TYPES, ...STOCK_OUT_TYPES] as const;
export const STOCK_SOURCE_TYPES = ["delivery", "issue", "adjustment", "opening_balance", "transfer"] as const;

export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[number];
export type StockSourceType = typeof STOCK_SOURCE_TYPES[number];

// Stock Movements - دفتر حركة المخزون، المصدر الوحيد للحقيقة. الرصيد يُحسب جمعًا منه ولا يُخزَّن.
export const stockMovements = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }), // المستودع
  materialId: varchar("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  movementType: text("movement_type").notNull(), // نوع الحركة - انظر STOCK_MOVEMENT_TYPES
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(), // الكمية - موجبة دائمًا
  unit: text("unit").notNull(), // الوحدة
  sourceType: text("source_type").notNull(), // مصدر الحركة - انظر STOCK_SOURCE_TYPES
  // Deliberately not a foreign key: the ledger must survive deletion of its source document.
  sourceId: varchar("source_id"), // معرّف المستند المصدر
  movementDate: date("movement_date").notNull(), // تاريخ الحركة
  performedBy: varchar("performed_by").references(() => users.id, { onDelete: "set null" }), // المنفّذ
  notes: text("notes"), // ملاحظات / سبب التسوية
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Stock Transfers - تحويل مواد بين مستودعات المشروع. كل تحويل يولّد حركتين مقترنتين.
export const stockTransfers = pgTable("stock_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  transferNumber: text("transfer_number").notNull(), // رقم التحويل
  fromWarehouseId: varchar("from_warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  toWarehouseId: varchar("to_warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  transferDate: date("transfer_date").notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transferId: varchar("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }),
  materialName: text("material_name").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  notes: text("notes"),
});

// Material Issues - سندات صرف المواد من المستودع (رأس السند).
// الحالة تبدأ pending_approval إذا احتوى السند مادة واحدة على الأقل requiresIssueApproval،
// وإلا تبدأ issued مباشرة. الرصيد لا يتحرك إلا في حالة issued.
export const materialIssues = pgTable("material_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }), // المستودع الصارف
  issueNumber: text("issue_number").notNull(), // رقم السند
  issueDate: date("issue_date").notNull(), // تاريخ الصرف
  issuedTo: text("issued_to").notNull(), // المستلم
  recipientType: text("recipient_type").notNull().default("subcontractor"), // subcontractor, internal, other
  // The subcontractor from the project's register when the recipient is one; issuedTo keeps its name as written
  subcontractorId: varchar("subcontractor_id").references(() => projectSubcontractors.id, { onDelete: "set null" }),
  workLocationId: varchar("work_location_id").references(() => workLocations.id, { onDelete: "set null" }), // موقع العمل (اختياري)
  purpose: text("purpose"), // الغرض من الصرف
  status: text("status").notNull().default("issued"), // pending_approval, issued, rejected, cancelled
  requiresApproval: boolean("requires_approval").notNull().default(false), // محسوب من مواد السند وقت الإنشاء
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Material Issue Items - بنود سند الصرف
export const materialIssueItems = pgTable("material_issue_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  issueId: varchar("issue_id").notNull().references(() => materialIssues.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }),
  materialName: text("material_name").notNull(), // اسم المادة وقت الصرف - نسخة مجمّدة تبقى بعد حذف المادة
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(), // الكمية المصروفة
  unit: text("unit").notNull(), // الوحدة
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// RFQs (Request For Quotations)
export const rfqs = pgTable("rfqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  rfqNumber: text("rfq_number").notNull(), // e.g. RFQ-2026-001
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("draft"), // draft, sent, evaluating, awarded, closed, cancelled
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// RFQ Items
export const rfqItems = pgTable("rfq_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }),
  itemName: text("item_name"),
  itemDescription: text("item_description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("pcs"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
});

// RFQ Invited Suppliers
export const rfqSuppliers = pgTable("rfq_suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("invited"), // invited, submitted, declined
  invitedAt: timestamp("invited_at").defaultNow(),
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),
});

// Quotations from Suppliers
export const quotations = pgTable("quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  quotationNumber: text("quotation_number"),
  submissionDate: date("submission_date").notNull().default(sql`CURRENT_DATE`),
  validUntil: date("valid_until"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").default("SAR"),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  leadTimeDays: integer("lead_time_days"),
  status: text("status").notNull().default("pending"), // pending, under_review, accepted, rejected
  notes: text("notes"),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Quotation Items
export const quotationItems = pgTable("quotation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationId: varchar("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  rfqItemId: varchar("rfq_item_id").references(() => rfqItems.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }),
  itemDescription: text("item_description"),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").default("pcs"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
});

// Purchase Orders (POs)
export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  poNumber: text("po_number").notNull(), // e.g. PO-2026-001
  rfqId: varchar("rfq_id").references(() => rfqs.id, { onDelete: "set null" }),
  quotationId: varchar("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  orderDate: date("order_date").notNull().default(sql`CURRENT_DATE`),
  expectedDeliveryDate: date("expected_delivery_date"),
  status: text("status").notNull().default("draft"), // draft, approved, issued, partially_received, completed, cancelled
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  termsAndConditions: text("terms_and_conditions"),
  deliveryAddress: text("delivery_address"),
  paymentTerms: text("payment_terms"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Purchase Order Items
export const poItems = pgTable("po_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poId: varchar("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  materialId: varchar("material_id").references(() => materials.id, { onDelete: "set null" }),
  rfqItemId: varchar("rfq_item_id").references(() => rfqItems.id, { onDelete: "set null" }),
  itemName: text("item_name"),
  itemDescription: text("item_description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("pcs"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  receivedQuantity: decimal("received_quantity", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
});

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  projects: many(projects),
  teamMembers: many(teamMembers),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  contractor: one(organizations, {
    fields: [projects.contractorId],
    references: [organizations.id],
  }),
  consultant: one(organizations, {
    fields: [projects.consultantId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
  workLocations: many(workLocations),
  formSettings: one(projectFormSettings),
  requests: many(requests),
  deliveries: many(deliveries),
}));

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  project: one(projects, {
    fields: [deliveries.projectId],
    references: [projects.id],
  }),
  supplier: one(suppliers, {
    fields: [deliveries.supplierId],
    references: [suppliers.id],
  }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryItems.deliveryId],
    references: [deliveries.id],
  }),
  material: one(materials, {
    fields: [deliveryItems.materialId],
    references: [materials.id],
  }),
}));

export const workLocationsRelations = relations(workLocations, ({ one }) => ({
  project: one(projects, {
    fields: [workLocations.projectId],
    references: [projects.id],
  }),
}));

export const projectFormSettingsRelations = relations(projectFormSettings, ({ one }) => ({
  project: one(projects, {
    fields: [projectFormSettings.projectId],
    references: [projects.id],
  }),
}));

export const requestTypeSettingsRelations = relations(requestTypeSettings, ({ one }) => ({
  project: one(projects, {
    fields: [requestTypeSettings.projectId],
    references: [projects.id],
  }),
  requestType: one(requestTypes, {
    fields: [requestTypeSettings.requestTypeId],
    references: [requestTypes.id],
  }),
}));

export const requestDeliveriesRelations = relations(requestDeliveries, ({ one }) => ({
  revision: one(requestRevisions, {
    fields: [requestDeliveries.revisionId],
    references: [requestRevisions.id],
  }),
  delivery: one(deliveries, {
    fields: [requestDeliveries.deliveryId],
    references: [deliveries.id],
  }),
}));

export const requestSuppliersRelations = relations(requestSuppliers, ({ one }) => ({
  revision: one(requestRevisions, {
    fields: [requestSuppliers.revisionId],
    references: [requestRevisions.id],
  }),
  supplier: one(suppliers, {
    fields: [requestSuppliers.supplierId],
    references: [suppliers.id],
  }),
}));

export const requestMaterialsRelations = relations(requestMaterials, ({ one }) => ({
  revision: one(requestRevisions, {
    fields: [requestMaterials.revisionId],
    references: [requestRevisions.id],
  }),
  material: one(materials, {
    fields: [requestMaterials.materialId],
    references: [materials.id],
  }),
}));

export const materialsRelations = relations(materials, ({ many }) => ({
  suppliers: many(materialSuppliers),
  attachments: many(materialAttachments),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  materials: many(materialSuppliers),
  attachments: many(supplierAttachments),
}));

export const supplierAttachmentsRelations = relations(supplierAttachments, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierAttachments.supplierId],
    references: [suppliers.id],
  }),
  document: one(documents, {
    fields: [supplierAttachments.documentId],
    references: [documents.id],
  }),
}));

export const materialAttachmentsRelations = relations(materialAttachments, ({ one }) => ({
  material: one(materials, {
    fields: [materialAttachments.materialId],
    references: [materials.id],
  }),
  document: one(documents, {
    fields: [materialAttachments.documentId],
    references: [documents.id],
  }),
}));

export const materialSuppliersRelations = relations(materialSuppliers, ({ one }) => ({
  material: one(materials, {
    fields: [materialSuppliers.materialId],
    references: [materials.id],
  }),
  supplier: one(suppliers, {
    fields: [materialSuppliers.supplierId],
    references: [suppliers.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  tasks: many(tasks),
  organization: one(organizations, {
    fields: [teamMembers.organizationId],
    references: [organizations.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(teamMembers, {
    fields: [tasks.assignedTo],
    references: [teamMembers.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  project: one(projects, {
    fields: [activities.projectId],
    references: [projects.id],
  }),
}));

// Work List Activities Relations
export const workListActivitiesRelations = relations(workListActivities, ({ one, many }) => ({
  chapter: one(workListChapters, {
    fields: [workListActivities.chapterId],
    references: [workListChapters.id],
  }),
  checklistItems: many(activityChecklistItems),
}));

// Checklist Items Relations
export const checklistItemsRelations = relations(checklistItems, ({ many }) => ({
  activities: many(activityChecklistItems),
}));

// Activity Checklist Items Relations (Junction table)
export const activityChecklistItemsRelations = relations(activityChecklistItems, ({ one }) => ({
  activity: one(workListActivities, {
    fields: [activityChecklistItems.activityId],
    references: [workListActivities.id],
  }),
  checklistItem: one(checklistItems, {
    fields: [activityChecklistItems.checklistItemId],
    references: [checklistItems.id],
  }),
  addedByUser: one(users, {
    fields: [activityChecklistItems.addedBy],
    references: [users.id],
  }),
}));

// Insert schemas with proper validation
export const insertProjectSchema = createInsertSchema(projects).extend({
  contractValue: z.string()
    .min(1, "Contract value is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number"),
  estimatedCost: z.string()
    .min(1, "Estimated cost is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number"),
  actualCost: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number")
    .optional()
    .default("0"),
  progress: z.number().int().min(0).max(100),
  status: z.enum(["pending", "active", "completed", "on-hold", "overdue"]),
  // null clears the role. Filling it is a different act entirely: that goes through an
  // invitation the organization accepts, never through a write here.
  contractorId: z.string().nullable().optional().or(z.literal("")),
  consultantId: z.string().nullable().optional().or(z.literal("")),
  id: z.string().optional(),
});

export const updateProjectSchema = insertProjectSchema.partial().strict().refine(
  (data) => {
    if (typeof data.contractValue === 'string' && data.contractValue.trim() === "") return false;
    if (typeof data.estimatedCost === 'string' && data.estimatedCost.trim() === "") return false;
    if (typeof data.actualCost === 'string' && data.actualCost.trim() === "") return false;
    return true;
  },
  { message: "Numeric fields cannot be empty strings" }
);

export const insertOrganizationSchema = createInsertSchema(organizations).extend({
  vatNumber: z.string().length(15, "VAT Number must be exactly 15 digits").regex(/^\d{15}$/, "VAT Number must be 15 digits only").optional().or(z.literal("")),
  ccrNumber: z.string().length(10, "CCR Number must be exactly 10 digits").regex(/^\d{10}$/, "CCR Number must be 10 digits only"),
  sectorType: z.enum(["Developer", "Contractor", "Consultant"]).optional().or(z.literal("")),
  id: z.string().optional(),
});
export const updateOrganizationSchema = insertOrganizationSchema.partial();

// Project invitation schemas
//
// A developer either names an organization already in the system, or supplies an email
// for one that is not. Exactly one of the two, never both and never neither.
export const PROJECT_INVITATION_ROLES = ["contractor", "consultant"] as const;
export type ProjectInvitationRole = (typeof PROJECT_INVITATION_ROLES)[number];

export const createProjectInvitationSchema = z
  .object({
    projectId: z.string().min(1, "A project is required"),
    role: z.enum(PROJECT_INVITATION_ROLES),
    organizationId: z.string().min(1).optional(),
    email: z.string().email("A valid email address is required").optional(),
  })
  .refine(
    data => !!data.organizationId !== !!data.email,
    { message: "Provide either an existing organization or an email address, not both" },
  );

export const respondToProjectInvitationSchema = z.object({
  // Which of the responder's organizations is answering. Required only when they
  // administer more than one, so the system never guesses on their behalf.
  organizationId: z.string().min(1).optional(),
});

// Payload the invitee posts from the invitation link: their organization and their account.
// sectorType is NOT accepted here — it comes from the invitation itself.
export const acceptOrganizationInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  organization: z.object({
    name: z.string().min(1, "Organization name is required"),
    nameArabic: z.string().optional().or(z.literal("")),
    phone: z.string().min(1, "Phone is required"),
    address: z.string().optional().or(z.literal("")),
    vatNumber: z.string().length(15, "VAT Number must be exactly 15 digits").regex(/^\d{15}$/, "VAT Number must be 15 digits only").optional().or(z.literal("")),
    ccrNumber: z.string().length(10, "CCR Number must be exactly 10 digits").regex(/^\d{10}$/, "CCR Number must be 10 digits only"),
    logo: z.string().optional().or(z.literal("")),
  }),
  admin: z.object({
    fullName: z.string().min(1, "Full name is required"),
    fullNameArabic: z.string().optional().or(z.literal("")),
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().optional().or(z.literal("")),
  }),
});

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type InsertOrganizationInvitation = typeof organizationInvitations.$inferInsert;
export type CreateProjectInvitation = z.infer<typeof createProjectInvitationSchema>;
export type RespondToProjectInvitation = z.infer<typeof respondToProjectInvitationSchema>;
export type AcceptOrganizationInvitation = z.infer<typeof acceptOrganizationInvitationSchema>;

export const insertTaskSchema = createInsertSchema(tasks).extend({
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["todo", "in-progress", "completed"]),
  type: z.enum(["general", "inspection_request", "permission_request", "approval_request"]),
  id: z.string().optional(),
});

export const updateTaskSchema = insertTaskSchema.partial();

// Purposes - Define purpose categories that positions can belong to
export const purposes = pgTable("purposes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameEnglish: text("name_english").notNull(),
  nameArabic: text("name_arabic").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Job Positions - Database table for managing positions
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numericId: integer("numeric_id").notNull().unique(),
  titleEnglish: text("title_english").notNull(),
  titleArabic: text("title_arabic").notNull(),
  purposeId: varchar("purpose_id").references(() => purposes.id, { onDelete: "set null" }),
});

// Default positions for seeding
export const DEFAULT_POSITIONS = [
  { titleEnglish: "Project Manager", titleArabic: "مدير مشروع" },
  { titleEnglish: "Civil Engineer", titleArabic: "مهندس مدني" },
  { titleEnglish: "Architect Engineer", titleArabic: "مهندس معماري" },
  { titleEnglish: "Mechanical Engineer", titleArabic: "مهندس ميكانيكي" },
  { titleEnglish: "Customer Team", titleArabic: "فريق المالك" },
  { titleEnglish: "Owner Representative", titleArabic: "ممثل المالك" },
  { titleEnglish: "Electrical Engineer", titleArabic: "مهندس كهربائي" },
  { titleEnglish: "Quantity Surveyor", titleArabic: "محاسب كميات" },
  { titleEnglish: "Surveyor", titleArabic: "مساح" },
  { titleEnglish: "General Inspector", titleArabic: "مراقب عام" },
  { titleEnglish: "Fresh Graduated Engineer", titleArabic: "مهندس حديث تخرج" },
  { titleEnglish: "Civil Inspector", titleArabic: "مراقب مدني" },
  { titleEnglish: "Architectural Inspector", titleArabic: "مراقب معماري" },
  { titleEnglish: "Electrical Inspector", titleArabic: "مراقب كهربائي" },
  { titleEnglish: "Mechanical Inspector", titleArabic: "مراقب ميكانيكي" },
  { titleEnglish: "Safety Officer", titleArabic: "مسؤول امن وسلامة" },
  { titleEnglish: "Document Controller", titleArabic: "مراقب المستندات" },
  { titleEnglish: "Accountant", titleArabic: "محاسب" },
  { titleEnglish: "Administrative Manager", titleArabic: "مدير إداري" },
  { titleEnglish: "Administrative Assistant", titleArabic: "مساعد إداري" },
  { titleEnglish: "Reporter", titleArabic: "مراسل" },
  { titleEnglish: "Technician", titleArabic: "فني" },
  { titleEnglish: "HR Operation Specialist", titleArabic: "أخصائي عمليات موارد بشرية" },
  { titleEnglish: "Project Engineer", titleArabic: "مهندس مشروع" },
  { titleEnglish: "Draftsman Map", titleArabic: "رسام خرائط و مخططات" },
  { titleEnglish: "Sales Engineer", titleArabic: "مهندس مبيعات" },
  { titleEnglish: "Building Technician and Supervisor", titleArabic: "فني و مراقب أبنية" },
  { titleEnglish: "Secretary", titleArabic: "سكرتيرة" },
  { titleEnglish: "Buildings Technician", titleArabic: "فني أبنية" },
  { titleEnglish: "Draftsman", titleArabic: "رسام عام" },
  { titleEnglish: "Marketing Specialist", titleArabic: "أخصائي تسويق" },
  { titleEnglish: "Man Draft Architect", titleArabic: "رسام معماري" },
  { titleEnglish: "Survey Technician", titleArabic: "فني مساحة" },
  { titleEnglish: "General Maintenance Mechanic", titleArabic: "فني ميكانيك صيانة عامة" },
  { titleEnglish: "Administrative Officer", titleArabic: "موظف إداري" },
  { titleEnglish: "Design Manager", titleArabic: "مدير تصميم" },
  { titleEnglish: "Building Carpenter", titleArabic: "نجار مباني" },
  { titleEnglish: "Document Keeper", titleArabic: "حافظ وثائق" },
  { titleEnglish: "Planning Engineer", titleArabic: "مهندس تنظيم" },
  { titleEnglish: "Chief Surveyor", titleArabic: "رئيس المساح" },
  { titleEnglish: "QA/QC HSE Manager", titleArabic: "مدير ضمان / مراقبة الجودة، الصحة والسلامة والبيئة" },
  { titleEnglish: "QA/QC", titleArabic: "ضمان / مراقبة الجودة" },
  { titleEnglish: "Construction Manager", titleArabic: "مدير التشييد" },
  { titleEnglish: "Technical Office Manager", titleArabic: "مدير المكتب الفني" },
  { titleEnglish: "Project Coordinator", titleArabic: "منسق المشروع" },
  { titleEnglish: "CEO", titleArabic: "المدير التنفيذي" },
  { titleEnglish: "General Manager", titleArabic: "المدير العام" },
];

// Purpose schemas and types
export const insertPurposeSchema = createInsertSchema(purposes, {
  code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updatePurposeSchema = insertPurposeSchema.partial();
export type InsertPurpose = z.infer<typeof insertPurposeSchema>;
export type UpdatePurpose = z.infer<typeof updatePurposeSchema>;
export type Purpose = typeof purposes.$inferSelect;

// Position schemas and types
export const insertPositionSchema = createInsertSchema(positions, {
  numericId: z.number().int().min(1, "ID is required"),
  titleEnglish: z.string().min(1, "English title is required"),
  titleArabic: z.string().min(1, "Arabic title is required"),
  purposeId: z.string().optional().nullable(),
  id: z.string().optional(),
});
export const updatePositionSchema = insertPositionSchema.partial();
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type UpdatePosition = z.infer<typeof updatePositionSchema>;
export type Position = typeof positions.$inferSelect;

export const insertTeamMemberSchema = createInsertSchema(teamMembers, {
  position: z.string().optional(),
  id: z.string().optional(),
});
export const updateTeamMemberSchema = insertTeamMemberSchema.partial();

export const insertDocumentSchema = createInsertSchema(documents).extend({
  id: z.string().optional(),
  uploadDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const updateDocumentSchema = insertDocumentSchema.partial().omit({ id: true, projectId: true });
export type UpdateDocument = z.infer<typeof updateDocumentSchema>;

export const insertActivitySchema = createInsertSchema(activities).extend({
  type: z.enum(["task_created", "task_updated", "document_added", "status_changed", "progress_updated", "comment", "general", "inspection_request", "approval_request", "wir"]),
  id: z.string().optional(),
  createdAt: z.string().optional()
});
export const updateActivitySchema = insertActivitySchema.partial();
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type Activity = typeof activities.$inferSelect;

// Export types
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type UpdateTeamMember = z.infer<typeof updateTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// Work Location schemas and types
export const insertWorkLocationSchema = createInsertSchema(workLocations, {
  unitCustomNumber: z.string().optional().nullable(),
  unitDescription: z.string().optional().nullable(),
  unitZone: z.string().optional().nullable(),
  unitCluster: z.string().optional().nullable(),
  unitBlock: z.string().optional().nullable(),
  buildingNo: z.string().optional().nullable(),
  flatNo: z.string().optional().nullable(),
  areaM2: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  villaType: z.string().optional().nullable(),
  part: z.string().optional().nullable(),
  id: z.string().optional(),
});
export const updateWorkLocationSchema = insertWorkLocationSchema.partial();
export type InsertWorkLocation = z.infer<typeof insertWorkLocationSchema>;
export type UpdateWorkLocation = z.infer<typeof updateWorkLocationSchema>;
export type WorkLocation = typeof workLocations.$inferSelect;

// Project Form Settings schemas and types
export const insertProjectFormSettingsSchema = createInsertSchema(projectFormSettings, {
  id: z.string().optional(),
});
export const updateProjectFormSettingsSchema = insertProjectFormSettingsSchema.partial();
export type InsertProjectFormSettings = z.infer<typeof insertProjectFormSettingsSchema>;
export type UpdateProjectFormSettings = z.infer<typeof updateProjectFormSettingsSchema>;
export type ProjectFormSettings = typeof projectFormSettings.$inferSelect;

// Request Type Settings schemas and types
export const insertRequestTypeSettingsSchema = createInsertSchema(requestTypeSettings, {
  id: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export const updateRequestTypeSettingsSchema = insertRequestTypeSettingsSchema.partial();
export type InsertRequestTypeSettings = z.infer<typeof insertRequestTypeSettingsSchema>;
export type UpdateRequestTypeSettings = z.infer<typeof updateRequestTypeSettingsSchema>;
export type RequestTypeSettings = typeof requestTypeSettings.$inferSelect;

// Team Member Permissions schemas and types
export const insertTeamMemberPermissionSchema = createInsertSchema(teamMemberPermissions, {
  id: z.string().optional(),
});
export const updateTeamMemberPermissionSchema = insertTeamMemberPermissionSchema.partial();
export type InsertTeamMemberPermission = z.infer<typeof insertTeamMemberPermissionSchema>;
export type UpdateTeamMemberPermission = z.infer<typeof updateTeamMemberPermissionSchema>;
export type TeamMemberPermission = typeof teamMemberPermissions.$inferSelect;

// User Permissions schemas and types (synced from team member permissions)
export const insertUserPermissionSchema = createInsertSchema(userPermissions, {
  id: z.string().optional(),
});
export const updateUserPermissionSchema = insertUserPermissionSchema.partial();
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UpdateUserPermission = z.infer<typeof updateUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// Work List Divisions schemas and types
export const insertWorkListDivisionSchema = createInsertSchema(workListDivisions, {
  code: z.string().min(1, "Code is required").max(10, "Code must be 10 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updateWorkListDivisionSchema = insertWorkListDivisionSchema.partial();
export type InsertWorkListDivision = z.infer<typeof insertWorkListDivisionSchema>;
export type UpdateWorkListDivision = z.infer<typeof updateWorkListDivisionSchema>;
export type WorkListDivision = typeof workListDivisions.$inferSelect;

// Work List Chapters schemas and types
export const insertWorkListChapterSchema = createInsertSchema(workListChapters, {
  code: z.string().min(1, "Code is required").max(10, "Code must be 10 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updateWorkListChapterSchema = insertWorkListChapterSchema.partial();
export type InsertWorkListChapter = z.infer<typeof insertWorkListChapterSchema>;
export type UpdateWorkListChapter = z.infer<typeof updateWorkListChapterSchema>;
export type WorkListChapter = typeof workListChapters.$inferSelect;

// Work List Activities schemas and types
export const insertWorkListActivitySchema = createInsertSchema(workListActivities, {
  code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updateWorkListActivitySchema = insertWorkListActivitySchema.partial();
export type InsertWorkListActivity = z.infer<typeof insertWorkListActivitySchema>;
export type UpdateWorkListActivity = z.infer<typeof updateWorkListActivitySchema>;
export type WorkListActivity = typeof workListActivities.$inferSelect;

// Checklist Items schemas and types
export const insertChecklistItemSchema = createInsertSchema(checklistItems, {
  category: z.enum(["main", "sbc", "recommendations"]),
  code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updateChecklistItemSchema = insertChecklistItemSchema.partial();
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type UpdateChecklistItem = z.infer<typeof updateChecklistItemSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;

// Work Levels schemas and types
export const insertWorkLevelSchema = createInsertSchema(workLevels, {
  code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
  nameEnglish: z.string().min(1, "English name is required"),
  nameArabic: z.string().min(1, "Arabic name is required"),
  sortOrder: z.number().int().optional(),
}).extend({ id: z.string().optional() });
export const updateWorkLevelSchema = insertWorkLevelSchema.partial();
export type InsertWorkLevel = z.infer<typeof insertWorkLevelSchema>;
export type UpdateWorkLevel = z.infer<typeof updateWorkLevelSchema>;
export type WorkLevel = typeof workLevels.$inferSelect;

// Users schemas and types
export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username must be 50 characters or less"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(1, "Full name is required"),
  fullNameArabic: z.string().optional(),
  role: z.enum(["user", "super_admin", "org_admin", "developer_admin"]),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  id: z.string().optional(),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  fullNameArabic: z.string().optional().nullable(),
  role: z.enum(["user", "super_admin", "org_admin", "developer_admin"]).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  signature: z.string().optional().nullable(),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdatePassword = z.infer<typeof updatePasswordSchema>;
export type User = typeof users.$inferSelect;

// Password Reset Token types
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens, {
  id: z.string().optional(),
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const forgotPasswordSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "رمز الاسترجاع مطلوب"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// User-Team Member Junction schemas and types
export const insertUserTeamMemberSchema = createInsertSchema(userTeamMembers, {
  userId: z.string().min(1, "User ID is required"),
  teamMemberId: z.string().min(1, "Team member ID is required"),
  id: z.string().optional(),
});
export type InsertUserTeamMember = z.infer<typeof insertUserTeamMemberSchema>;
export type UserTeamMember = typeof userTeamMembers.$inferSelect;

// Workflow Steps schemas and types
export const insertWorkflowStepSchema = createInsertSchema(workflowSteps, {
  id: z.number().int().optional(),
});
export const updateWorkflowStepSchema = insertWorkflowStepSchema.partial();
export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;
export type UpdateWorkflowStep = z.infer<typeof updateWorkflowStepSchema>;
export type WorkflowStep = typeof workflowSteps.$inferSelect;

// Workflow Transitions schemas and types
export const insertWorkflowTransitionSchema = createInsertSchema(workflowTransitions, {
  transitionId: z.number().int().optional(),
});
export const updateWorkflowTransitionSchema = insertWorkflowTransitionSchema.partial();
export type InsertWorkflowTransition = z.infer<typeof insertWorkflowTransitionSchema>;
export type UpdateWorkflowTransition = z.infer<typeof updateWorkflowTransitionSchema>;
export type WorkflowTransition = typeof workflowTransitions.$inferSelect;

// Request Types schemas and types
export const insertRequestTypeSchema = createInsertSchema(requestTypes, {
  id_number: z.number().int().optional(),
  code: z.string().min(1, "Code is required"),
  name_english: z.string().min(1, "English name is required"),
  name_arabic: z.string().min(1, "Arabic name is required"),
}).extend({ id: z.string().optional() });
export const updateRequestTypeSchema = insertRequestTypeSchema.partial();
export type InsertRequestType = z.infer<typeof insertRequestTypeSchema>;
export type UpdateRequestType = z.infer<typeof updateRequestTypeSchema>;
export type RequestType = typeof requestTypes.$inferSelect;

// Request Counters schemas and types
export const insertRequestCounterSchema = createInsertSchema(requestCounters, {
  projectId: z.string().min(1, "Project ID is required"),
  requestTypeId: z.string().min(1, "Request type ID is required"),
  lastNumber: z.number().int().min(0),
  id: z.string().optional(),
});
export type InsertRequestCounter = z.infer<typeof insertRequestCounterSchema>;
export type RequestCounter = typeof requestCounters.$inferSelect;

// WIR Requests schemas and types
export const insertRequestSchema = createInsertSchema(requests, {
  requestNumber: z.string().optional(), // Auto-generated from naming series (XXX-000)
  referenceCode: z.string().min(1, "Reference code is required"),
  requestTypeId: z.string().min(1, "Request type is required"),
  projectId: z.string().min(1, "Project is required"),
  projectName: z.string().optional(),
  contractorName: z.string().optional(),
  consultantName: z.string().optional(),
  currentStatus: z.enum(["Draft", "Submitted", "Under Review", "Requires Action", "Approved", "Rejected", "Closed"]),
}).extend({
  id: z.string().optional(),
  createdAt: z.string().optional()
});
export const updateRequestSchema = insertRequestSchema.partial();
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type UpdateRequest = z.infer<typeof updateRequestSchema>;
export type Request = typeof requests.$inferSelect;

// Request Deletions schemas and types
export const insertRequestDeletionSchema = createInsertSchema(requestDeletions, {
  requestId: z.string().min(1, "Request ID is required"),
  deletedBy: z.string().min(1, "User ID is required"),
  reason: z.string().optional(),
}).extend({
  id: z.string().optional(),
  deletedAt: z.string().optional(),
  restoredAt: z.string().optional()
});
export type InsertRequestDeletion = z.infer<typeof insertRequestDeletionSchema>;
export type RequestDeletion = typeof requestDeletions.$inferSelect;

// Request Revisions schemas and types
export const insertRequestRevisionSchema = createInsertSchema(requestRevisions, {
  requestId: z.string().min(1, "Request ID is required"),
  revisionNo: z.number().int().min(0),
  title: z.string().min(1, "Title is required"),
  createdBy: z.string().min(1, "Created by is required"),
  activityCode: z.string().optional(),
  activityName: z.string().optional(),
  chapterName: z.string().optional(),
  divisionName: z.string().optional(),
  workLevelName: z.string().optional(),
}).extend({
  id: z.string().optional(),
  createdAt: z.string().optional()
});
export type InsertRequestRevision = z.infer<typeof insertRequestRevisionSchema>;
export type RequestRevision = typeof requestRevisions.$inferSelect;

// Request Status History schemas and types
export const insertRequestStatusHistorySchema = createInsertSchema(requestStatusHistory, {
  revisionId: z.string().min(1, "Revision ID is required"),
  oldStatus: z.string().min(1, "Old status is required"),
  newStatus: z.string().min(1, "New status is required"),
  changedBy: z.string().min(1, "Changed by is required"),
}).extend({
  id: z.string().optional(),
  changedAt: z.string().optional()
});
export type InsertRequestStatusHistory = z.infer<typeof insertRequestStatusHistorySchema>;
export type RequestStatusHistory = typeof requestStatusHistory.$inferSelect;

// Activity Checklist Items schemas and types (Junction table)
export const insertActivityChecklistItemSchema = createInsertSchema(activityChecklistItems, {
  activityId: z.string().min(1, "Activity ID is required"),
  checklistItemId: z.string().min(1, "Checklist item ID is required"),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export type InsertActivityChecklistItem = z.infer<typeof insertActivityChecklistItemSchema>;
export type ActivityChecklistItem = typeof activityChecklistItems.$inferSelect;

// Request Purposes schemas and types
export const insertRequestPurposeSchema = createInsertSchema(requestPurposes, {
  revisionId: z.string().min(1, "Revision ID is required"),
  purposeId: z.string().min(1, "Purpose is required"),
  purposeName: z.string().min(1, "Purpose name is required"),
  purposeCategory: z.string().optional(),
  remarks: z.string().optional(),
  id: z.string().optional(),
});
export const updateRequestPurposeSchema = insertRequestPurposeSchema.partial();
export type InsertRequestPurpose = z.infer<typeof insertRequestPurposeSchema>;
export type UpdateRequestPurpose = z.infer<typeof updateRequestPurposeSchema>;
export type RequestPurpose = typeof requestPurposes.$inferSelect;

// Request Documents schemas and types
export const insertRequestDocumentSchema = createInsertSchema(requestDocuments, {
  revisionId: z.string().min(1, "Revision ID is required"),
  sourceType: z.enum(["upload", "project"]).default("upload"),
  projectDocumentId: z.string().optional().nullable(),
  documentType: z.string().optional(),
  documentRef: z.string().optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  uploadedBy: z.string().optional(),
  remarks: z.string().optional(),
}).extend({
  id: z.string().optional(),
  uploadedAt: z.string().optional()
});
export const updateRequestDocumentSchema = insertRequestDocumentSchema.partial();
export type InsertRequestDocument = z.infer<typeof insertRequestDocumentSchema>;
export type UpdateRequestDocument = z.infer<typeof updateRequestDocumentSchema>;
export type RequestDocument = typeof requestDocuments.$inferSelect;

// Request Work Locations schemas and types
export const insertRequestWorkLocationSchema = createInsertSchema(requestWorkLocations, {
  revisionId: z.string().min(1, "Revision ID is required"),
  workLocationId: z.string().min(1, "Work location ID is required"),
  unit: z.string().optional(),
  zone: z.string().optional(),
  block: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  part: z.string().optional(),
  remarks: z.string().optional(),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export const updateRequestWorkLocationSchema = insertRequestWorkLocationSchema.partial();
export type InsertRequestWorkLocation = z.infer<typeof insertRequestWorkLocationSchema>;
export type UpdateRequestWorkLocation = z.infer<typeof updateRequestWorkLocationSchema>;
export type RequestWorkLocation = typeof requestWorkLocations.$inferSelect;

// Request Work Levels schemas and types
export const insertRequestWorkLevelSchema = createInsertSchema(requestWorkLevels, {
  revisionId: z.string().min(1, "Revision ID is required"),
  workLevelId: z.string().min(1, "Work level ID is required"),
  remarks: z.string().optional(),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export const updateRequestWorkLevelSchema = insertRequestWorkLevelSchema.partial();
export type InsertRequestWorkLevel = z.infer<typeof insertRequestWorkLevelSchema>;
export type UpdateRequestWorkLevel = z.infer<typeof updateRequestWorkLevelSchema>;
export type RequestWorkLevel = typeof requestWorkLevels.$inferSelect;

// Request Inquiries schemas and types
export const insertRequestInquirySchema = createInsertSchema(requestInquiries, {
  revisionId: z.string().min(1, "Revision ID is required"),
  question: z.string().min(1, "Question is required"),
  answer: z.string().optional(),
  isRequired: z.boolean().optional(),
  askedBy: z.string().min(1, "Asked by is required"),
  answeredBy: z.string().optional(),
}).extend({
  id: z.string().optional(),
  askedAt: z.string().optional(),
  answeredAt: z.string().optional()
});
export const updateRequestInquirySchema = z.object({
  answer: z.string().optional(),
  answeredBy: z.string().optional(),
  answeredAt: z.string().optional(),
});
export type InsertRequestInquiry = z.infer<typeof insertRequestInquirySchema>;
export type UpdateRequestInquiry = z.infer<typeof updateRequestInquirySchema>;
export type RequestInquiry = typeof requestInquiries.$inferSelect;

// Revision Checklist Response schemas and types
export const insertRevisionChecklistResponseSchema = createInsertSchema(revisionChecklistResponses, {
  revisionId: z.string().min(1, "Revision ID is required"),
  checklistItemId: z.string().min(1, "Checklist Item ID is required"),
  response: z.enum(["yes", "no", "na"]),
  respondedBy: z.string().optional(),
  remarks: z.string().optional(),
}).extend({
  id: z.string().optional(),
  respondedAt: z.string().optional()
});
export const updateRevisionChecklistResponseSchema = z.object({
  response: z.enum(["yes", "no", "na"]).optional(),
  remarks: z.string().optional(),
});
export type InsertRevisionChecklistResponse = z.infer<typeof insertRevisionChecklistResponseSchema>;
export type UpdateRevisionChecklistResponse = z.infer<typeof updateRevisionChecklistResponseSchema>;
export type RevisionChecklistResponse = typeof revisionChecklistResponses.$inferSelect;

// Request Consultant Reviews schemas and types
export const insertRequestConsultantReviewSchema = createInsertSchema(requestConsultantReviews, {
  revisionId: z.string().min(1, "Revision ID is required"),
  residentEngineerUserId: z.string().optional(),
  comments: z.string().optional(),
  statusCode: z.string().optional(),
}).extend({
  id: z.string().optional(),
  receivedAt: z.string().optional(),
  reviewedAt: z.string().optional()
});
export type InsertRequestConsultantReview = z.infer<typeof insertRequestConsultantReviewSchema>;
export type RequestConsultantReview = typeof requestConsultantReviews.$inferSelect;

// Request Attachments schemas and types
export const insertRequestAttachmentSchema = createInsertSchema(requestAttachments, {
  revisionId: z.string().min(1, "Revision ID is required"),
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().optional(),
  fileData: z.string().optional(),
  uploadedBy: z.string().optional(),
}).extend({
  id: z.string().optional(),
  uploadedAt: z.coerce.date().optional()
});
export type InsertRequestAttachment = z.infer<typeof insertRequestAttachmentSchema>;
export type RequestAttachment = typeof requestAttachments.$inferSelect;

// Request Messages schemas and types
export const insertRequestMessageSchema = createInsertSchema(requestMessages, {
  revisionId: z.string().min(1, "Revision ID is required"),
  message: z.string().optional(),
  senderId: z.string().min(1, "Sender ID is required"),
}).extend({
  id: z.string().optional(),
  sentAt: z.string().optional()
});
export type InsertRequestMessage = z.infer<typeof insertRequestMessageSchema>;
export type RequestMessage = typeof requestMessages.$inferSelect;

// Message Attachments schemas and types
export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments, {
  messageId: z.string().min(1, "Message ID is required"),
  title: z.string().optional(),
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().optional(),
  fileUrl: z.string().optional(),
  fileSize: z.number().optional(),
}).extend({
  id: z.string().optional(),
  uploadedAt: z.string().optional()
});
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;
export type MessageAttachment = typeof messageAttachments.$inferSelect;

// Approval Status Codes schemas and types
export const insertApprovalStatusCodeSchema = createInsertSchema(approvalStatusCodes, {
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});
export type InsertApprovalStatusCode = z.infer<typeof insertApprovalStatusCodeSchema>;
export type ApprovalStatusCode = typeof approvalStatusCodes.$inferSelect;

// Update revision approval status schema (for setting approval on a revision)
export const updateRevisionApprovalSchema = z.object({
  approvalStatusCode: z.string().min(1, "Approval status code is required"),
  approvalComments: z.string().optional(),
});
export type UpdateRevisionApproval = z.infer<typeof updateRevisionApprovalSchema>;

// Notifications schemas and types
export const insertNotificationSchema = createInsertSchema(notifications, {
  userId: z.string().min(1, "User ID is required"),
  type: z.enum(["info", "success", "warning", "error", "assignment", "status_change", "approval", "mention", "document"]),
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  projectId: z.string().optional().nullable(),
  requestId: z.string().optional().nullable(),
  activityId: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  isRead: z.boolean().optional()
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Project Folders schemas and types
export const insertProjectFolderSchema = createInsertSchema(projectFolders, {
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().optional().nullable(),
  createdBy: z.string().min(1, "Creator ID is required"),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export type InsertProjectFolder = z.infer<typeof insertProjectFolderSchema>;
export type ProjectFolder = typeof projectFolders.$inferSelect;

export const updateProjectFolderSchema = insertProjectFolderSchema.partial().omit({ id: true, projectId: true });
export type UpdateProjectFolder = z.infer<typeof updateProjectFolderSchema>;

// Deliveries schemas and types
// 'legacy' covers rows created before receipts were tied to purchase orders; it is never
// selectable for a new receipt.
export const RECEIPT_SOURCES = [
  "purchase_order",
  "owner_supplied",
  "project_transfer",
  "sample",
  "emergency",
  "legacy",
] as const;
export type ReceiptSource = typeof RECEIPT_SOURCES[number];

// Everything a user may pick when recording a receipt that has no purchase order.
export const NON_PO_RECEIPT_SOURCES = [
  "owner_supplied",
  "project_transfer",
  "sample",
  "emergency",
] as const;

export const RECEIPT_SOURCE_LABELS: Record<ReceiptSource, string> = {
  purchase_order: "أمر شراء",
  owner_supplied: "مواد من المالك",
  project_transfer: "نقل من مشروع آخر",
  sample: "عينة",
  emergency: "شراء طارئ",
  legacy: "سابق للنظام",
};

export const insertDeliverySchema = createInsertSchema(deliveries, {
  projectId: z.string().min(1, "Project ID is required"),
  shipmentNumber: z.string().optional(),
  deliveryInvoiceNumber: z.string().optional().nullable(),
  supplier: z.string().min(1, "Supplier is required"),
  supplierId: z.string().optional().nullable(),
  arrivalDate: z.string().min(1, "Arrival date is required"),
  deliveryNoteId: z.string().optional().nullable().transform(v => v === "" ? null : v),
  receiptSource: z.enum(RECEIPT_SOURCES).optional(),
  purchaseOrderId: z.string().optional().nullable().transform(v => v === "" ? null : v),
  sourceReason: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});

export const updateDeliverySchema = insertDeliverySchema.partial().extend({
  deliveryNoteId: z.string().optional().nullable().transform(v => v === "" ? null : v),
});

// A receipt must say where it came from: a purchase order, or a written reason.
// Applied to the create payloads rather than to insertDeliverySchema itself, so that
// partial updates and the legacy rows keep validating.
export function refineReceiptSource<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (v: any) => v.receiptSource !== "purchase_order" || !!v.purchaseOrderId,
      { message: "أمر الشراء مطلوب لهذا النوع من الاستلام", path: ["purchaseOrderId"] }
    )
    .refine(
      (v: any) =>
        !v.receiptSource ||
        v.receiptSource === "purchase_order" ||
        v.receiptSource === "legacy" ||
        !!(v.sourceReason && String(v.sourceReason).trim()),
      { message: "سبب الاستلام بدون أمر شراء مطلوب", path: ["sourceReason"] }
    );
}
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type UpdateDelivery = z.infer<typeof updateDeliverySchema>;
export type Delivery = typeof deliveries.$inferSelect;

// Delivery Items schemas and types
export const insertDeliveryItemSchema = createInsertSchema(deliveryItems, {
  deliveryId: z.string().min(1, "Delivery ID is required"),
  materialName: z.string().min(1, "Material name is required"),
  materialId: z.string().optional().nullable(),
  materialDescription: z.string().optional().nullable(),
  arrivalQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number"),
  unit: z.string().min(1, "Unit is required"),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});

export const updateDeliveryItemSchema = insertDeliveryItemSchema.partial();
export type InsertDeliveryItem = z.infer<typeof insertDeliveryItemSchema>;
export type UpdateDeliveryItem = z.infer<typeof updateDeliveryItemSchema>;
export type DeliveryItem = typeof deliveryItems.$inferSelect;

// Request Deliveries schemas and types
export const insertRequestDeliverySchema = createInsertSchema(requestDeliveries, {
  revisionId: z.string().min(1, "Revision ID is required"),
  deliveryId: z.string().min(1, "Delivery ID is required"),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export const updateRequestDeliverySchema = createInsertSchema(requestDeliveries).partial();
export type InsertRequestDelivery = z.infer<typeof insertRequestDeliverySchema>;
export type UpdateRequestDelivery = z.infer<typeof updateRequestDeliverySchema>;
export type RequestDelivery = typeof requestDeliveries.$inferSelect;

// Request Suppliers schemas and types
export const insertRequestSupplierSchema = createInsertSchema(requestSuppliers, {
  revisionId: z.string().min(1, "Revision ID is required"),
  supplierId: z.string().min(1, "Supplier ID is required"),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export const updateRequestSupplierSchema = createInsertSchema(requestSuppliers).partial();
export type InsertRequestSupplier = z.infer<typeof insertRequestSupplierSchema>;
export type UpdateRequestSupplier = z.infer<typeof updateRequestSupplierSchema>;
export type RequestSupplier = typeof requestSuppliers.$inferSelect;

// Request Materials schemas and types
export const insertRequestMaterialSchema = createInsertSchema(requestMaterials, {
  revisionId: z.string().min(1, "Revision ID is required"),
  materialId: z.string().min(1, "Material ID is required"),
}).extend({
  id: z.string().optional(),
  addedAt: z.string().optional()
});
export const updateRequestMaterialSchema = createInsertSchema(requestMaterials).partial();
export type InsertRequestMaterial = z.infer<typeof insertRequestMaterialSchema>;
export type UpdateRequestMaterial = z.infer<typeof updateRequestMaterialSchema>;
export type RequestMaterial = typeof requestMaterials.$inferSelect;

// Materials schemas and types
export const insertMaterialSchema = createInsertSchema(materials, {
  materialName: z.string().min(1, "Material name is required"),
  unit: z.string().min(1, "Unit is required"),
  category: z.string().min(1, "Category is required"),
}).extend({
  id: z.string().optional(),
});
export const updateMaterialSchema = insertMaterialSchema.partial();
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type UpdateMaterial = z.infer<typeof updateMaterialSchema>;
export type Material = typeof materials.$inferSelect;

// Suppliers schemas and types
export const insertSupplierSchema = createInsertSchema(suppliers, {
  supplierName: z.string().min(1, "Supplier name is required"),
  email: z.string().email("Invalid email address").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable().refine(
    (val) => !val || (val.length === 15 && /^3[0-2][0-9]{13}$/.test(val)),
    "Tax number must be exactly 15 digits and start with 30, 31, or 32 (Saudi VAT format)"
  ),
  logoUrl: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  experienceYears: z.coerce.number().int().min(0).optional().nullable(),
}).extend({
  id: z.string().optional(),
});
export const updateSupplierSchema = insertSupplierSchema.partial();
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

// Material Suppliers schemas and types
export const insertMaterialSupplierSchema = createInsertSchema(materialSuppliers, {
  materialId: z.string().min(1, "Material ID is required"),
  supplierId: z.string().min(1, "Supplier ID is required"),
  lastPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number").optional().nullable(),
}).extend({
  id: z.string().optional(),
});
export const updateMaterialSupplierSchema = insertMaterialSupplierSchema.partial();
export type InsertMaterialSupplier = z.infer<typeof insertMaterialSupplierSchema>;
export type UpdateMaterialSupplier = z.infer<typeof updateMaterialSupplierSchema>;
export type MaterialSupplier = typeof materialSuppliers.$inferSelect;

// Supplier Attachments schemas and types
export const insertSupplierAttachmentSchema = createInsertSchema(supplierAttachments, {
  supplierId: z.string().min(1, "Supplier ID is required"),
  documentId: z.string().min(1, "Document ID is required"),
}).extend({
  id: z.string().optional(),
  createdAt: z.date().optional(),
});
export type InsertSupplierAttachment = z.infer<typeof insertSupplierAttachmentSchema>;
export type SupplierAttachment = typeof supplierAttachments.$inferSelect;

// Material Attachments schemas and types
export const insertMaterialAttachmentSchema = createInsertSchema(materialAttachments, {
  materialId: z.string().min(1, "Material ID is required"),
  documentId: z.string().min(1, "Document ID is required"),
}).extend({
  id: z.string().optional(),
  createdAt: z.date().optional(),
});
export type InsertMaterialAttachment = z.infer<typeof insertMaterialAttachmentSchema>;
export type MaterialAttachment = typeof materialAttachments.$inferSelect;

// Warehouses schemas and types
export const insertWarehouseSchema = createInsertSchema(warehouses, {
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().min(1, "اسم المستودع مطلوب"),
  code: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  keeperName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export const updateWarehouseSchema = insertWarehouseSchema.partial().omit({ projectId: true });
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type UpdateWarehouse = z.infer<typeof updateWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

// Inventory Approver Positions schemas and types
export const insertInventoryApproverPositionSchema = createInsertSchema(inventoryApproverPositions, {
  projectId: z.string().min(1, "Project ID is required"),
  positionId: z.string().min(1, "Position ID is required"),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export type InsertInventoryApproverPosition = z.infer<typeof insertInventoryApproverPositionSchema>;
export type InventoryApproverPosition = typeof inventoryApproverPositions.$inferSelect;

// Stock Movements schemas and types
const positiveQuantity = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number")
  .refine((v) => parseFloat(v) > 0, "Quantity must be greater than zero");

export const insertStockMovementSchema = createInsertSchema(stockMovements, {
  projectId: z.string().min(1, "Project ID is required"),
  warehouseId: z.string().min(1, "المستودع مطلوب"),
  materialId: z.string().min(1, "Material ID is required"),
  movementType: z.enum(STOCK_MOVEMENT_TYPES),
  quantity: positiveQuantity,
  unit: z.string().min(1, "Unit is required"),
  sourceType: z.enum(STOCK_SOURCE_TYPES),
  sourceId: z.string().optional().nullable(),
  movementDate: z.string().min(1, "Movement date is required"),
  performedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

// Manual movements (adjustments, waste, returns, opening balance) require an explicit reason.
// Transfers are excluded: they are created through the transfer endpoint as a paired pair of movements.
// 'in' and 'out' are excluded too: those belong to receipts and issue vouchers, which carry
// their own documents, and must never be writable as a loose ledger entry.
export const MANUAL_MOVEMENT_TYPES = [
  "adjustment_in",
  "adjustment_out",
  "waste",
  "return_to_supplier",
  "return_from_site",
  "opening_balance",
] as const;

export const MANUAL_MOVEMENT_LABELS: Record<(typeof MANUAL_MOVEMENT_TYPES)[number], string> = {
  adjustment_in: "تسوية جرد - زيادة",
  adjustment_out: "تسوية جرد - نقص",
  waste: "تالف / مفقود",
  return_to_supplier: "إرجاع للمورد",
  return_from_site: "مرتجع من موقع العمل",
  opening_balance: "رصيد افتتاحي",
};

export const createManualStockMovementSchema = insertStockMovementSchema
  .omit({ sourceType: true, sourceId: true, projectId: true })
  .extend({
    movementType: z.enum(MANUAL_MOVEMENT_TYPES),
    notes: z.string().trim().min(1, "السبب مطلوب"),
  });
export type CreateManualStockMovement = z.infer<typeof createManualStockMovementSchema>;

// Stock Transfers schemas and types
export const insertStockTransferSchema = createInsertSchema(stockTransfers, {
  projectId: z.string().min(1, "Project ID is required"),
  transferNumber: z.string().optional(),
  fromWarehouseId: z.string().min(1, "المستودع المصدر مطلوب"),
  toWarehouseId: z.string().min(1, "المستودع المستقبل مطلوب"),
  transferDate: z.string().min(1, "تاريخ التحويل مطلوب"),
  notes: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransfer = typeof stockTransfers.$inferSelect;

export const insertStockTransferItemSchema = createInsertSchema(stockTransferItems, {
  transferId: z.string().min(1, "Transfer ID is required"),
  materialId: z.string().min(1, "Material ID is required"),
  materialName: z.string().min(1, "Material name is required"),
  quantity: positiveQuantity,
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().optional().nullable(),
}).extend({ id: z.string().optional() });
export type InsertStockTransferItem = z.infer<typeof insertStockTransferItemSchema>;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;

export const createStockTransferSchema = insertStockTransferSchema
  .extend({
    items: z.array(insertStockTransferItemSchema.omit({ transferId: true })).min(1, "يجب إضافة مادة واحدة على الأقل"),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "لا يمكن التحويل إلى نفس المستودع",
    path: ["toWarehouseId"],
  });
export type CreateStockTransfer = z.infer<typeof createStockTransferSchema>;

// Material Issues schemas and types
export const MATERIAL_ISSUE_STATUSES = ["pending_approval", "issued", "rejected", "cancelled"] as const;
export type MaterialIssueStatus = typeof MATERIAL_ISSUE_STATUSES[number];

export const insertMaterialIssueSchema = createInsertSchema(materialIssues, {
  projectId: z.string().min(1, "Project ID is required"),
  warehouseId: z.string().min(1, "المستودع مطلوب"),
  issueNumber: z.string().optional(),
  issueDate: z.string().min(1, "Issue date is required"),
  issuedTo: z.string().min(1, "Recipient is required"),
  recipientType: z.enum(["subcontractor", "internal", "other"]),
  workLocationId: z.string().optional().nullable().transform((v) => (v === "" ? null : v)),
  purpose: z.string().optional().nullable(),
  // status and requiresApproval are derived on the server from the voucher's materials,
  // never accepted from the client.
  status: z.enum(MATERIAL_ISSUE_STATUSES).optional(),
  notes: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export const updateMaterialIssueSchema = insertMaterialIssueSchema.partial();
export type InsertMaterialIssue = z.infer<typeof insertMaterialIssueSchema>;
export type UpdateMaterialIssue = z.infer<typeof updateMaterialIssueSchema>;
export type MaterialIssue = typeof materialIssues.$inferSelect;

// Material Issue Items schemas and types
export const insertMaterialIssueItemSchema = createInsertSchema(materialIssueItems, {
  issueId: z.string().min(1, "Issue ID is required"),
  materialId: z.string().min(1, "Material ID is required"),
  materialName: z.string().min(1, "Material name is required"),
  quantity: positiveQuantity,
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().optional().nullable(),
}).extend({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});
export type InsertMaterialIssueItem = z.infer<typeof insertMaterialIssueItemSchema>;
export type MaterialIssueItem = typeof materialIssueItems.$inferSelect;

// Bulk payload: issue header plus its items in one request.
export const createMaterialIssueSchema = insertMaterialIssueSchema
  .omit({ status: true })
  .extend({
    items: z.array(insertMaterialIssueItemSchema.omit({ issueId: true })).min(1, "يجب إضافة مادة واحدة على الأقل"),
  });
export type CreateMaterialIssue = z.infer<typeof createMaterialIssueSchema>;

export const rejectMaterialIssueSchema = z.object({
  rejectionReason: z.string().min(1, "سبب الرفض مطلوب"),
});

// Recording a shipment against an approved purchase order.
export const createPoReceiptSchema = z.object({
  warehouseId: z.string().min(1, "المستودع مطلوب"),
  arrivalDate: z.string().min(1, "تاريخ الوصول مطلوب"),
  shipmentNumber: z.string().optional(),
  deliveryInvoiceNumber: z.string().optional().nullable(),
  deliveryNoteId: z.string().optional().nullable().transform((v) => (v === "" ? null : v)),
  lines: z
    .array(
      z.object({
        poItemId: z.string().min(1, "بند أمر الشراء مطلوب"),
        quantity: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, "كمية غير صالحة"),
        notes: z.string().optional().nullable(),
      })
    )
    .min(1, "يجب إدخال كمية مستلمة لبند واحد على الأقل"),
});
export type CreatePoReceipt = z.infer<typeof createPoReceiptSchema>;

export type CreatePoReceiptInput = CreatePoReceipt & {
  purchaseOrderId: string;
  supplierName: string;
  performedBy?: string | null;
};

// ---- Inventory read models (computed, not tables) ----

// One row per material, per warehouse when scoped to one, otherwise aggregated across the project.
export type StockBalance = {
  materialId: string;
  materialName: string;
  materialCode: string | null;
  category: string | null;
  unit: string;
  warehouseId: string | null; // null when the row aggregates every warehouse
  warehouseName: string | null;
  totalIn: number;
  totalOut: number;
  balance: number;
  minStockLevel: number;
  isLowStock: boolean;
  requiresIssueApproval: boolean;
  // True when the same material was moved under more than one unit, which makes `balance` meaningless.
  hasUnitConflict: boolean;
};

export type StockMovementFilters = {
  warehouseId?: string;
  materialId?: string;
  movementType?: StockMovementType;
  sourceType?: StockSourceType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type EnrichedStockMovement = StockMovement & {
  materialName: string;
  materialCode: string | null;
  warehouseName: string;
  performedByName: string | null;
  direction: "in" | "out";
};

export function stockDirection(type: string): "in" | "out" {
  return (STOCK_IN_TYPES as readonly string[]).includes(type) ? "in" : "out";
}

// Units are compared normalised so that "PCs", "pcs" and " PCS " count as one unit.
// Only genuinely different units (kg vs m3) are treated as a conflict.
export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ==========================================
// Snag List (Punch List) Tables & Schemas
// ==========================================

export const snagLists = pgTable("snag_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  purposeId: varchar("purpose_id").references(() => purposes.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft, in_progress, completed, approved
  currentStepId: integer("current_step_id").references(() => workflowSteps.id, { onDelete: "set null" }),
  buildingNo: text("building_no"),
  zoneType: text("zone_type"), // INTERIOR, EXTERIOR
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  listDate: date("list_date").default(sql`CURRENT_DATE`),
  serialNumber: integer("serial_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const snagItems = pgTable("snag_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snagListId: varchar("snag_list_id").notNull().references(() => snagLists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("architectural"), // architectural, electrical, plumbing, hvac, safety, civil, other
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  status: text("status").notNull().default("open"), // open, in_progress, pending_inspection, closed, rejected
  
  // الربط مع مواقع ومستويات وديكورات المشروع
  workLocationId: varchar("work_location_id").references(() => workLocations.id, { onDelete: "set null" }),
  workLevelId: varchar("work_level_id").references(() => workLevels.id, { onDelete: "set null" }),
  divisionId: varchar("division_id").references(() => workListDivisions.id, { onDelete: "set null" }),
  locationDetails: text("location_details"), // e.g. Room 302 - East Wall

  buildingNo: text("building_no"),
  zoneType: text("zone_type"), // INTERIOR, EXTERIOR
  floorNo: text("floor_no"),
  unitNo: text("unit_no"),
  locationRoom: text("location_room"), // المجلس، صالة المعيشة، المطبخ...
  discipline: text("discipline"), // Architectural, Civil, MEP...
  elementName: text("element_name"), // Doors, Windows, Tiles...
  imageMarkupData: json("image_markup_data"),

  // الإسناد والمتابعة
  assignedTo: varchar("assigned_to").references(() => teamMembers.id, { onDelete: "set null" }),
  purposeId: varchar("purpose_id").references(() => purposes.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  beforeImages: json("before_images").$type<string[]>().default([]).notNull(),
  afterImages: json("after_images").$type<string[]>().default([]).notNull(),
  resolutionDescription: text("resolution_description"),

  // الردود والتعليقات الميدانية للجهات المعنية
  contractorComment: text("contractor_comment"),
  rectificationPhotos: json("rectification_photos").$type<string[]>().default([]).notNull(),
  pmReviewComment: text("pm_review_comment"),
  consultantReviewComment: text("consultant_review_comment"),
  reinspectionCount: integer("reinspection_count").default(0).notNull(),

  raisedBy: varchar("raised_by").references(() => users.id, { onDelete: "set null" }),
  raisedDate: timestamp("raised_date").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  closedBy: varchar("closed_by").references(() => users.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const snagItemHistory = pgTable("snag_item_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snagItemId: varchar("snag_item_id").notNull().references(() => snagItems.id, { onDelete: "cascade" }),
  snagListId: varchar("snag_list_id").notNull().references(() => snagLists.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // CREATED, SUBMITTED_FOR_REPAIR, REPAIRED, REAPPROVED, RETURNED_FOR_REWORK, CLOSED
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  comments: text("comments"),
  performedBy: varchar("performed_by").references(() => users.id, { onDelete: "set null" }),
  attachments: json("attachments").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Zod Schemas & Types for Snag List
export const insertSnagListSchema = createInsertSchema(snagLists, {
  title: z.string().min(1, "عنوان قائمة الملاحظات مطلوب"),
  projectId: z.string().min(1, "معرف المشروع مطلوب"),
}).extend({
  id: z.string().optional(),
  purposeId: z.string().optional(),
  listDate: z.string().optional(),
  currentStepId: z.number().optional(),
  buildingNo: z.string().optional(),
  zoneType: z.string().optional(),
});
export const updateSnagListSchema = insertSnagListSchema.partial();
export type InsertSnagList = z.infer<typeof insertSnagListSchema>;
export type UpdateSnagList = z.infer<typeof updateSnagListSchema>;
export type SnagList = typeof snagLists.$inferSelect;

// Zod Schemas & Types for Snag Item
export const insertSnagItemSchema = createInsertSchema(snagItems, {
  title: z.string().min(1, "عنوان الملاحظة مطلوب"),
  snagListId: z.string().min(1, "معرف قائمة الملاحظات مطلوب"),
}).extend({
  id: z.string().optional(),
  beforeImages: z.array(z.string()).optional(),
  afterImages: z.array(z.string()).optional(),
  rectificationPhotos: z.array(z.string()).optional(),
  imageMarkupData: z.any().optional(),
});
export const updateSnagItemSchema = insertSnagItemSchema.partial();
export type InsertSnagItem = z.infer<typeof insertSnagItemSchema>;
export type UpdateSnagItem = z.infer<typeof updateSnagItemSchema>;
export type SnagItem = typeof snagItems.$inferSelect;

export const insertSnagItemHistorySchema = createInsertSchema(snagItemHistory);
export type InsertSnagItemHistory = z.infer<typeof insertSnagItemHistorySchema>;
export type SnagItemHistory = typeof snagItemHistory.$inferSelect;

// RFQ Schemas & Types
export const insertRfqSchema = createInsertSchema(rfqs, {
  title: z.string().min(1, "عنوان طلب عرض السعر مطلوب"),
  projectId: z.string().min(1, "معرف المشروع مطلوب"),
}).extend({
  id: z.string().optional(),
});
export const updateRfqSchema = insertRfqSchema.partial();
export type InsertRfq = z.infer<typeof insertRfqSchema>;
export type UpdateRfq = z.infer<typeof updateRfqSchema>;
export type Rfq = typeof rfqs.$inferSelect;

export const insertRfqItemSchema = createInsertSchema(rfqItems).extend({
  id: z.string().optional(),
});
export const updateRfqItemSchema = insertRfqItemSchema.partial();
export type InsertRfqItem = z.infer<typeof insertRfqItemSchema>;
export type UpdateRfqItem = z.infer<typeof updateRfqItemSchema>;
export type RfqItem = typeof rfqItems.$inferSelect;

export const insertRfqSupplierSchema = createInsertSchema(rfqSuppliers).extend({
  id: z.string().optional(),
});
export const updateRfqSupplierSchema = insertRfqSupplierSchema.partial();
export type InsertRfqSupplier = z.infer<typeof insertRfqSupplierSchema>;
export type UpdateRfqSupplier = z.infer<typeof updateRfqSupplierSchema>;
export type RfqSupplier = typeof rfqSuppliers.$inferSelect;

// Quotation Schemas & Types
export const insertQuotationSchema = createInsertSchema(quotations, {
  rfqId: z.string().min(1, "معرف طلب عرض السعر مطلوب"),
  supplierId: z.string().min(1, "معرف المورد مطلوب"),
  // A quotation without the supplier's own document is just numbers with nothing behind
  // them, and the purchase order built from it has no evidence trail.
  // required_error covers a missing key; min(1) covers null/empty sent by a form.
  documentId: z
    .string({ required_error: "مستند عرض المورد مطلوب", invalid_type_error: "مستند عرض المورد مطلوب" })
    .min(1, "مستند عرض المورد مطلوب"),
}).extend({
  id: z.string().optional(),
});
// Partial by design: quotations recorded before the document became mandatory stay editable
// without forcing an attachment onto historical records.
export const updateQuotationSchema = insertQuotationSchema.partial();
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type UpdateQuotation = z.infer<typeof updateQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export const insertQuotationItemSchema = createInsertSchema(quotationItems).extend({
  id: z.string().optional(),
});
export const updateQuotationItemSchema = insertQuotationItemSchema.partial();
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type UpdateQuotationItem = z.infer<typeof updateQuotationItemSchema>;
export type QuotationItem = typeof quotationItems.$inferSelect;

// Purchase Order Schemas & Types
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders, {
  title: z.string().min(1, "عنوان أمر الشراء مطلوب"),
  projectId: z.string().min(1, "معرف المشروع مطلوب"),
  supplierId: z.string().min(1, "المورد مطلوب"),
}).extend({
  id: z.string().optional(),
});
export const updatePurchaseOrderSchema = insertPurchaseOrderSchema.partial();
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type UpdatePurchaseOrder = z.infer<typeof updatePurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

// materialId is required: a line with only free text cannot post to stock, which would
// leave a purchase order that is only half receivable.
export const insertPoItemSchema = createInsertSchema(poItems, {
  materialId: z.string().min(1, "يجب اختيار المادة من الكتالوج"),
}).extend({
  id: z.string().optional(),
});
export const updatePoItemSchema = insertPoItemSchema.partial();
export type InsertPoItem = z.infer<typeof insertPoItemSchema>;
export type UpdatePoItem = z.infer<typeof updatePoItemSchema>;
export type PoItem = typeof poItems.$inferSelect;

// ==========================================
// Progress Matrix (مصفوفة أوزان ونسب الإنجاز) & Payment Certificates (المستخلصات)
// Created by migrate_progress_matrix_tables.ts
// ==========================================

export const progressMatrixSettings = pgTable("progress_matrix_settings", {
  projectId: varchar("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  unitWeightMode: text("unit_weight_mode").notNull().default("equal"), // equal, area, value, manual
  defaultUnitValue: decimal("default_unit_value", { precision: 14, scale: 2 }).notNull().default("0"),
  driveProjectProgress: boolean("drive_project_progress").notNull().default(false),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// WBS tree: phases (roots) → items → optional sub-items. weight = % among siblings.
export const progressWbsNodes = pgTable("progress_wbs_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id").references((): AnyPgColumn => progressWbsNodes.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 50 }).notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  weight: decimal("weight", { precision: 9, scale: 4 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  workListActivityId: varchar("work_list_activity_id").references(() => workListActivities.id, { onDelete: "set null" }),
  workLevelId: varchar("work_level_id").references(() => workLevels.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  codeUq: uniqueIndex("progress_wbs_nodes_code_uq").on(table.projectId, table.code),
  parentIdx: index("progress_wbs_nodes_parent_idx").on(table.parentId),
  linkUq: uniqueIndex("progress_wbs_nodes_link_uq")
    .on(table.projectId, table.workListActivityId, sql`COALESCE(${table.workLevelId}, '')`)
    .where(sql`${table.workListActivityId} IS NOT NULL`),
}));

// Optional per-unit overrides; the units themselves are the project's work_locations.
export const progressUnits = pgTable("progress_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  workLocationId: varchar("work_location_id").notNull().unique().references(() => workLocations.id, { onDelete: "cascade" }),
  unitValue: decimal("unit_value", { precision: 14, scale: 2 }),
  manualWeight: decimal("manual_weight", { precision: 9, scale: 6 }),
  included: boolean("included").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("progress_units_project_idx").on(table.projectId),
}));

export const progressCells = pgTable("progress_cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  nodeId: varchar("node_id").notNull().references(() => progressWbsNodes.id, { onDelete: "cascade" }),
  workLocationId: varchar("work_location_id").notNull().references(() => workLocations.id, { onDelete: "cascade" }),
  percent: decimal("percent", { precision: 5, scale: 2 }).notNull(),
  source: text("source").notNull().default("manual"), // manual, wir, override
  locked: boolean("locked").notNull().default(false),
  revisionId: varchar("revision_id").references(() => requestRevisions.id, { onDelete: "set null" }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nodeUnitUq: uniqueIndex("progress_cells_node_unit_uq").on(table.nodeId, table.workLocationId),
  projectIdx: index("progress_cells_project_idx").on(table.projectId),
  unitIdx: index("progress_cells_unit_idx").on(table.workLocationId),
  percentRange: check("progress_cells_percent_range", sql`${table.percent} >= 0 AND ${table.percent} <= 100`),
}));

export const progressCellLogs = pgTable("progress_cell_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  nodeId: varchar("node_id").references(() => progressWbsNodes.id, { onDelete: "set null" }),
  nodeCode: varchar("node_code", { length: 50 }),
  workLocationId: varchar("work_location_id").references(() => workLocations.id, { onDelete: "set null" }),
  oldPercent: decimal("old_percent", { precision: 5, scale: 2 }),
  newPercent: decimal("new_percent", { precision: 5, scale: 2 }),
  source: text("source").notNull(), // manual, wir, override, relink, delete
  revisionId: varchar("revision_id"),
  requestNumber: varchar("request_number", { length: 50 }),
  reason: text("reason"),
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
}, (table) => ({
  cellIdx: index("progress_cell_logs_cell_idx").on(table.nodeId, table.workLocationId),
  projectIdx: index("progress_cell_logs_project_idx").on(table.projectId),
}));

export const progressPaymentCertificates = pgTable("progress_payment_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  certNo: integer("cert_no").notNull(),
  title: text("title"),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  status: text("status").notNull().default("draft"), // draft, submitted, approved, paid, rejected
  notes: text("notes"),
  totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  rejectReason: text("reject_reason"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  submittedBy: varchar("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  paidBy: varchar("paid_by").references(() => users.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  certNoUq: uniqueIndex("progress_payment_certificates_no_uq").on(table.projectId, table.certNo),
}));

export const progressPaymentCertificateLines = pgTable("progress_payment_certificate_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => progressPaymentCertificates.id, { onDelete: "cascade" }),
  workLocationId: varchar("work_location_id").references(() => workLocations.id, { onDelete: "set null" }),
  unitLabel: text("unit_label"),
  unitValue: decimal("unit_value", { precision: 14, scale: 2 }).notNull().default("0"),
  cumulativePercent: decimal("cumulative_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  previousPercent: decimal("previous_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  currentPercent: decimal("current_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  phaseBreakdown: jsonb("phase_breakdown").$type<Record<string, number>>().notNull().default({}),
}, (table) => ({
  certUnitUq: uniqueIndex("progress_payment_certificate_lines_uq").on(table.certificateId, table.workLocationId),
}));

// Zod Schemas & Types for Progress Matrix
export const insertProgressWbsNodeSchema = createInsertSchema(progressWbsNodes, {
  code: z.string().min(1, "كود البند مطلوب").max(50),
  nameAr: z.string().min(1, "اسم البند مطلوب"),
}).omit({ id: true, projectId: true, createdAt: true, updatedAt: true });
export const updateProgressWbsNodeSchema = insertProgressWbsNodeSchema.partial();
export type InsertProgressWbsNode = z.infer<typeof insertProgressWbsNodeSchema>;
export type ProgressWbsNode = typeof progressWbsNodes.$inferSelect;
export type ProgressMatrixSettings = typeof progressMatrixSettings.$inferSelect;
export type ProgressUnit = typeof progressUnits.$inferSelect;
export type ProgressCell = typeof progressCells.$inferSelect;
export type ProgressCellLog = typeof progressCellLogs.$inferSelect;
export type ProgressPaymentCertificate = typeof progressPaymentCertificates.$inferSelect;
export type ProgressPaymentCertificateLine = typeof progressPaymentCertificateLines.$inferSelect;

// ---------------------------------------------------------------------------
// Payments (المدفوعات): bill-attachment requests, payment orders, clearances and fines.
// The status vocabularies live in shared/payments.ts.
// ---------------------------------------------------------------------------

// Accounting asks the project side for the original bills/attachments behind a payment
export const paymentBillRequests = pgTable("payment_bill_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  requestNo: text("request_no").notNull(), // BR-0001, numbered per project
  supplierId: varchar("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  certificateId: varchar("certificate_id").references(() => progressPaymentCertificates.id, { onDelete: "set null" }),
  // Set when the payment was made first and accounting then asked for the original invoice behind it
  paymentOrderId: varchar("payment_order_id"),
  // The page this request was started from (a purchase order, a delivery...)
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  payeeName: text("payee_name").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("requested"), // requested, submitted, received, returned, cancelled
  notes: text("notes"),
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: "set null" }),
  submittedBy: varchar("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  receivedBy: varchar("received_by").references(() => users.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  seqUq: uniqueIndex("payment_bill_requests_seq_uq").on(table.projectId, table.seq),
  projectIdx: index("payment_bill_requests_project_idx").on(table.projectId),
}));

// The invoices listed on a bill request. A payment order raised from the request pays them.
export const paymentInvoices = pgTable("payment_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  billRequestId: varchar("bill_request_id").notNull().references(() => paymentBillRequests.id, { onDelete: "cascade" }),
  invoiceNo: text("invoice_no").notNull(),
  invoiceDate: date("invoice_date"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"), // invoice total including VAT
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  requestIdx: index("payment_invoices_request_idx").on(table.billRequestId),
  noUq: uniqueIndex("payment_invoices_no_uq").on(table.billRequestId, table.invoiceNo),
}));

// مقاولو الباطن: the project's register of subcontractors. Kept apart from suppliers on purpose, so they never
// show up in purchase-order or request pickers. Certificates, charge-backs and deductions point here by id.
export const projectSubcontractors = pgTable("project_subcontractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  taxNumber: varchar("tax_number"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  scope: text("scope"), // trade / work the subcontractor does
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("project_subcontractors_project_idx").on(table.projectId),
}));

// Part or all of a supplier invoice charged to a subcontractor. Leaves the invoice's own workflow untouched.
export const paymentChargebacks = pgTable("payment_chargebacks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  chargeNo: text("charge_no").notNull(), // CB-0001, numbered per project
  invoiceId: varchar("invoice_id").notNull().references(() => paymentInvoices.id, { onDelete: "cascade" }),
  billRequestId: varchar("bill_request_id").notNull().references(() => paymentBillRequests.id, { onDelete: "cascade" }),
  subcontractorId: varchar("subcontractor_id").references(() => projectSubcontractors.id, { onDelete: "restrict" }),
  subcontractorName: text("subcontractor_name").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(), // VAT included, like the invoice
  isFull: boolean("is_full").notNull().default(false),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("proposed"), // proposed, approved, applied, converted, cancelled
  rejectReason: text("reject_reason"),
  certificateId: varchar("certificate_id"), // the subcontractor certificate it was deducted on
  fineId: varchar("fine_id"), // the deduction record it was converted to
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  seqUq: uniqueIndex("payment_chargebacks_seq_uq").on(table.projectId, table.seq),
  invoiceIdx: index("payment_chargebacks_invoice_idx").on(table.invoiceId),
}));

// A payment order is the instruction to pay. It has one source: a received bill request, a
// fine, a clearance fee, or none, in which case `reason` explains what it is for.
export const paymentOrders = pgTable("payment_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  orderNo: text("order_no").notNull(), // PO-... is taken by purchase orders, so payment orders are PAY-0001
  billRequestId: varchar("bill_request_id").references(() => paymentBillRequests.id, { onDelete: "set null" }),
  fineId: varchar("fine_id"),
  clearanceId: varchar("clearance_id"),
  subcontractorCertificateId: varchar("subcontractor_certificate_id"),
  // The page this order was started from (a purchase order, a delivery...)
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  supplierId: varchar("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  certificateId: varchar("certificate_id").references(() => progressPaymentCertificates.id, { onDelete: "set null" }),
  payeeName: text("payee_name").notNull(),
  purpose: text("purpose"), // bill, fine, clearance, advance, other (null on rows made before this column existed)
  reason: text("reason"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, pending_approval, approved, paid, rejected, cancelled
  rejectReason: text("reject_reason"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  paidDate: date("paid_date"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  paidBy: varchar("paid_by").references(() => users.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  seqUq: uniqueIndex("payment_orders_seq_uq").on(table.projectId, table.seq),
  projectIdx: index("payment_orders_project_idx").on(table.projectId),
}));

// مستخلصات مقاولي الباطن: a subcontractor's payment certificate for one period of work
export const paymentSubcontractorCertificates = pgTable("payment_subcontractor_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  certNo: text("cert_no").notNull(), // SC-0001, numbered per project
  subcontractorId: varchar("subcontractor_id").references(() => projectSubcontractors.id, { onDelete: "restrict" }),
  subcontractorName: text("subcontractor_name").notNull(),
  scope: text("scope"), // trade / work covered by the subcontract
  contractValue: decimal("contract_value", { precision: 14, scale: 2 }).notNull().default("0"),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  grossAmount: decimal("gross_amount", { precision: 14, scale: 2 }).notNull().default("0"), // value of work this period
  retentionPercent: decimal("retention_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  retentionAmount: decimal("retention_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  advanceRecovery: decimal("advance_recovery", { precision: 14, scale: 2 }).notNull().default("0"),
  otherDeductions: decimal("other_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
  deductionsNote: text("deductions_note"),
  vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Invoice charge-backs applied to this certificate, deducted together with otherDeductions
  chargebackDeductions: decimal("chargeback_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
  netPayable: decimal("net_payable", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"), // draft, submitted, approved, rejected, paid, cancelled
  rejectReason: text("reject_reason"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  seqUq: uniqueIndex("payment_sub_certs_seq_uq").on(table.projectId, table.seq),
  projectIdx: index("payment_sub_certs_project_idx").on(table.projectId),
}));

// Permits and clearances (authority approvals, handover/utility clearances...) tracked per project
export const paymentClearances = pgTable("payment_clearances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  authority: text("authority"),
  referenceNo: text("reference_no"),
  status: text("status").notNull().default("pending"), // pending, in_progress, obtained, rejected, expired
  responsibleName: text("responsible_name"),
  dueDate: date("due_date"),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  feeAmount: decimal("fee_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  feePaid: boolean("fee_paid").notNull().default(false),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("payment_clearances_project_idx").on(table.projectId),
}));

export const paymentFines = pgTable("payment_fines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  authority: text("authority"),
  referenceNo: text("reference_no"),
  reason: text("reason"),
  liableParty: text("liable_party").notNull().default("contractor"),
  // Which subcontractor, when the liable party is a subcontractor
  subcontractorId: varchar("subcontractor_id").references(() => projectSubcontractors.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("open"), // open, under_appeal, waiver_requested, payment_requested, paid, waived, cancelled
  waiverReason: text("waiver_reason"),
  waiverRequestedBy: varchar("waiver_requested_by").references(() => users.id, { onDelete: "set null" }),
  waiverDecidedBy: varchar("waiver_decided_by").references(() => users.id, { onDelete: "set null" }),
  // The page this deduction was started from (a snag item, an NCR...)
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("payment_fines_project_idx").on(table.projectId),
}));

// Files attached to any of the four records above (original bills, clearance copies, fine notices...)
export const paymentAttachments = pgTable("payment_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // bill_request, payment_order, clearance, fine
  entityId: varchar("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("payment_attachments_entity_idx").on(table.entityType, table.entityId),
}));

// Who did what and when, for every record: the tracking trail managers read
export const paymentActivity = pgTable("payment_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  note: text("note"),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("payment_activity_entity_idx").on(table.entityType, table.entityId),
}));

export type PaymentBillRequest = typeof paymentBillRequests.$inferSelect;
export type PaymentInvoice = typeof paymentInvoices.$inferSelect;
export type PaymentChargeback = typeof paymentChargebacks.$inferSelect;
export type ProjectSubcontractor = typeof projectSubcontractors.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type PaymentSubcontractorCertificate = typeof paymentSubcontractorCertificates.$inferSelect;
export type PaymentClearance = typeof paymentClearances.$inferSelect;
export type PaymentFine = typeof paymentFines.$inferSelect;
export type PaymentAttachment = typeof paymentAttachments.$inferSelect;
export type PaymentActivity = typeof paymentActivity.$inferSelect;


