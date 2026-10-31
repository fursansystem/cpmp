import {
  projects, organizations, tasks, teamMembers, documents, activities,
  workLocations, projectFormSettings, requestTypes, requestCounters,
  workListDivisions, workListChapters, workListActivities, checklistItems, workLevels, users,
  passwordResetTokens, organizationInvitations, positions, requests, requestRevisions, requestStatusHistory, requestDeletions,
  workflowSteps, workflowTransitions, activityChecklistItems, purposes, requestPurposes, requestDocuments, requestWorkLocations, requestWorkLevels, userTeamMembers, requestInquiries, revisionChecklistResponses, requestConsultantReviews, requestAttachments, teamMemberPermissions, userPermissions,
  projectFolders,
  requestMessages, messageAttachments, approvalStatusCodes, notifications,
  deliveries, deliveryItems, requestDeliveries,
  materials, suppliers, materialSuppliers, supplierAttachments, materialAttachments, requestSuppliers, requestMaterials,
  snagLists, snagItems, snagItemHistory,
  type SnagList, type InsertSnagList, type UpdateSnagList,
  type SnagItem, type InsertSnagItem, type UpdateSnagItem,
  type SnagItemHistory, type InsertSnagItemHistory,
  type Project, type InsertProject, type UpdateProject,
  type Organization, type InsertOrganization, type UpdateOrganization,
  type Task, type InsertTask, type UpdateTask,
  type TeamMember, type InsertTeamMember, type UpdateTeamMember,
  type Document, type InsertDocument, type UpdateDocument,
  type ProjectFolder, type InsertProjectFolder, type UpdateProjectFolder,
  type Activity, type InsertActivity, type UpdateActivity,
  type WorkLocation, type InsertWorkLocation, type UpdateWorkLocation,
  type ProjectFormSettings, type InsertProjectFormSettings, type UpdateProjectFormSettings,
  type WorkListDivision, type InsertWorkListDivision, type UpdateWorkListDivision,
  type WorkListChapter, type InsertWorkListChapter, type UpdateWorkListChapter,
  type WorkListActivity, type InsertWorkListActivity, type UpdateWorkListActivity,
  type ChecklistItem, type InsertChecklistItem, type UpdateChecklistItem,
  type WorkLevel, type InsertWorkLevel, type UpdateWorkLevel,
  type User, type InsertUser, type UpdateUser,
  type PasswordResetToken, type InsertPasswordResetToken,
  type OrganizationInvitation, type InsertOrganizationInvitation,
  type Position, type InsertPosition, type UpdatePosition,
  type Purpose, type InsertPurpose, type UpdatePurpose,
  type Request, type InsertRequest, type UpdateRequest,
  type RequestRevision, type InsertRequestRevision,
  type RequestStatusHistory, type InsertRequestStatusHistory,
  type RequestDeletion, type InsertRequestDeletion,
  type RequestPurpose, type InsertRequestPurpose, type UpdateRequestPurpose,
  type RequestDocument, type InsertRequestDocument,
  type RequestWorkLocation, type InsertRequestWorkLocation,
  type RequestWorkLevel, type InsertRequestWorkLevel,
  type WorkflowStep, type WorkflowTransition, type RequestType,
  type UserTeamMember, type InsertUserTeamMember,
  type RequestInquiry, type InsertRequestInquiry, type UpdateRequestInquiry,
  type RevisionChecklistResponse, type InsertRevisionChecklistResponse,
  type RequestConsultantReview,
  type RequestAttachment, type InsertRequestAttachment,
  type RequestMessage, type InsertRequestMessage,
  type MessageAttachment, type InsertMessageAttachment,
  type ApprovalStatusCode, type InsertApprovalStatusCode,
  type Notification, type InsertNotification,
  type Delivery, type InsertDelivery, type UpdateDelivery,
  type DeliveryItem, type InsertDeliveryItem, type UpdateDeliveryItem,
  type RequestDelivery, type InsertRequestDelivery,
  type Material, type InsertMaterial, type UpdateMaterial,
  type Supplier, type InsertSupplier, type UpdateSupplier,
  type SupplierAttachment, type InsertSupplierAttachment,
  type MaterialAttachment, type InsertMaterialAttachment,
  type MaterialSupplier, type InsertMaterialSupplier, type UpdateMaterialSupplier,
  type RequestSupplier, type InsertRequestSupplier,
  type RequestMaterial, type InsertRequestMaterial,
  requestTypeSettings, type RequestTypeSettings, type InsertRequestTypeSettings, type UpdateRequestTypeSettings,
  rfqs, rfqItems, rfqSuppliers, quotations, quotationItems, purchaseOrders, poItems,
  type Rfq, type InsertRfq, type UpdateRfq,
  type RfqItem, type InsertRfqItem, type UpdateRfqItem,
  type RfqSupplier, type InsertRfqSupplier, type UpdateRfqSupplier,
  type Quotation, type InsertQuotation, type UpdateQuotation,
  type QuotationItem, type InsertQuotationItem, type UpdateQuotationItem,
  type PurchaseOrder, type InsertPurchaseOrder, type UpdatePurchaseOrder,
  type PoItem, type InsertPoItem, type UpdatePoItem,
  warehouses, stockMovements, stockTransfers, stockTransferItems,
  materialIssues, materialIssueItems, inventoryApproverPositions, projectSubcontractors,
  STOCK_IN_TYPES, stockDirection, normalizeUnit,
  type Warehouse, type InsertWarehouse, type UpdateWarehouse,
  type StockMovement, type InsertStockMovement,
  type StockBalance, type StockMovementFilters, type EnrichedStockMovement,
  type MaterialIssue, type InsertMaterialIssue, type UpdateMaterialIssue,
  type MaterialIssueItem, type InsertMaterialIssueItem,
  type StockTransfer, type InsertStockTransfer,
  type StockTransferItem, type InsertStockTransferItem,
  type InventoryApproverPosition, type InsertInventoryApproverPosition,
  type CreatePoReceiptInput, type CreateMaterialIssue, type CreateManualStockMovement,
  type CreateStockTransfer
} from "@shared/schema";
import { db } from "./db";
import { eq, lt, lte, gte, and, or, isNull, isNotNull, max, sql, desc, inArray, not } from "drizzle-orm";
import { pgTable, varchar, text, alias } from "drizzle-orm/pg-core";

// Everything needed to turn an accepted invitation into an organization and its first
// admin. The email and the sector come from the invitation, not from the submitted form.
export interface AcceptInvitationParams {
  invitationId: string;
  email: string;
  sectorType: string;
  organization: {
    name: string;
    nameArabic?: string;
    phone: string;
    address?: string;
    vatNumber?: string;
    ccrNumber: string;
    logo?: string;
  };
  admin: {
    fullName: string;
    fullNameArabic?: string;
    username: string;
    hashedPassword: string;
    phone?: string;
  };
}

export interface IStorage {
  // Projects
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  getProjectsByOrganization(orgId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: UpdateProject): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationByCcrNumber(ccrNumber: string): Promise<Organization | undefined>;
  getAllOrganizations(): Promise<Organization[]>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, organization: UpdateOrganization): Promise<Organization>;
  deleteOrganization(id: string): Promise<void>;

  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getAllTasks(): Promise<Task[]>;
  getTasksByProject(projectId: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, task: UpdateTask): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Team Members
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  getAllTeamMembers(): Promise<TeamMember[]>;
  getTeamMembersByOrganization(organizationId: string): Promise<TeamMember[]>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, member: UpdateTeamMember): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  // Documents
  getDocument(id: string): Promise<Document | undefined>;
  getAllDocuments(): Promise<Document[]>;
  getDocumentsByProject(projectId: string): Promise<Document[]>;
  getDocumentsByFolder(folderId: string): Promise<Document[]>;
  getRequestDocumentsByProject(projectId: string): Promise<any[]>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: string, doc: UpdateDocument): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  bulkDeleteDocuments(ids: string[]): Promise<void>;
  bulkMoveDocuments(ids: string[], folderId: string | null): Promise<void>;

  // Project Folders
  getProjectFolders(projectId: string): Promise<ProjectFolder[]>;
  getProjectFoldersByParent(parentId: string): Promise<ProjectFolder[]>;
  getProjectFolder(id: string): Promise<ProjectFolder | undefined>;
  createProjectFolder(folder: InsertProjectFolder): Promise<ProjectFolder>;
  updateProjectFolder(id: string, folder: UpdateProjectFolder): Promise<ProjectFolder>;
  deleteProjectFolder(id: string): Promise<void>;
  bulkDeleteFolders(ids: string[]): Promise<void>;
  bulkMoveFolders(ids: string[], parentId: string | null): Promise<void>;

  // Activities
  getActivity(id: string): Promise<Activity | undefined>;
  getAllActivities(): Promise<(Activity & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]>;
  getActivitiesByProject(projectId: string): Promise<(Activity & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: string, activity: UpdateActivity): Promise<Activity>;

  // Work Locations
  getWorkLocation(id: string): Promise<WorkLocation | undefined>;
  getWorkLocationsByProject(projectId: string): Promise<WorkLocation[]>;
  createWorkLocation(workLocation: InsertWorkLocation): Promise<WorkLocation>;
  updateWorkLocation(id: string, workLocation: UpdateWorkLocation): Promise<WorkLocation>;
  deleteWorkLocation(id: string): Promise<void>;

  // Project Form Settings
  getProjectFormSettings(projectId: string): Promise<ProjectFormSettings | undefined>;
  createProjectFormSettings(settings: InsertProjectFormSettings): Promise<ProjectFormSettings>;
  updateProjectFormSettings(projectId: string, settings: UpdateProjectFormSettings): Promise<ProjectFormSettings>;

  // Request Type Settings (Dynamic Form Numbers)
  getRequestTypeSettings(projectId: string): Promise<RequestTypeSettings[]>;
  getRequestTypeSetting(projectId: string, requestTypeId: string): Promise<RequestTypeSettings | undefined>;
  createRequestTypeSetting(settings: InsertRequestTypeSettings): Promise<RequestTypeSettings>;
  updateRequestTypeSetting(id: string, settings: UpdateRequestTypeSettings): Promise<RequestTypeSettings>;

  // Work List Divisions
  getAllWorkListDivisions(): Promise<WorkListDivision[]>;
  getWorkListDivision(id: string): Promise<WorkListDivision | undefined>;
  createWorkListDivision(division: InsertWorkListDivision): Promise<WorkListDivision>;

  // Work List Chapters
  getAllWorkListChapters(): Promise<WorkListChapter[]>;
  getWorkListChaptersByDivision(divisionId: string): Promise<WorkListChapter[]>;
  getWorkListChapter(id: string): Promise<WorkListChapter | undefined>;
  createWorkListChapter(chapter: InsertWorkListChapter): Promise<WorkListChapter>;
  updateWorkListChapter(id: string, chapter: UpdateWorkListChapter): Promise<WorkListChapter>;
  deleteWorkListChapter(id: string): Promise<void>;

  // Work List Activities
  getAllWorkListActivities(): Promise<WorkListActivity[]>;
  getWorkListActivitiesByChapter(chapterId: string): Promise<WorkListActivity[]>;
  getWorkListActivity(id: string): Promise<WorkListActivity | undefined>;
  createWorkListActivity(activity: InsertWorkListActivity): Promise<WorkListActivity>;
  updateWorkListActivity(id: string, activity: UpdateWorkListActivity): Promise<WorkListActivity>;
  deleteWorkListActivity(id: string): Promise<void>;

  // Checklist Items
  getAllChecklistItems(): Promise<ChecklistItem[]>;
  getChecklistItemsByCategory(category: string): Promise<ChecklistItem[]>;
  searchChecklistItems(query: string, category?: string): Promise<ChecklistItem[]>;
  getChecklistItem(id: string): Promise<ChecklistItem | undefined>;
  createChecklistItem(item: InsertChecklistItem): Promise<ChecklistItem>;
  updateChecklistItem(id: string, item: UpdateChecklistItem): Promise<ChecklistItem>;
  deleteChecklistItem(id: string): Promise<void>;

  // Work Levels
  getWorkLevelsByProject(projectId: string): Promise<WorkLevel[]>;
  getWorkLevel(id: string): Promise<WorkLevel | undefined>;
  createWorkLevel(workLevel: InsertWorkLevel): Promise<WorkLevel>;
  updateWorkLevel(id: string, workLevel: UpdateWorkLevel): Promise<WorkLevel>;
  deleteWorkLevel(id: string): Promise<void>;

  // Deliveries
  getDelivery(id: string): Promise<Delivery | undefined>;
  getDeliveriesByProject(projectId: string): Promise<(Delivery & { items: DeliveryItem[], attachment?: Document | null, linkedRequestId?: string | null, linkedRequestNumber?: string | null })[]>;
  getDeliveryItems(deliveryId: string): Promise<DeliveryItem[]>;
  createDeliveryWithItems(delivery: InsertDelivery, items: Omit<InsertDeliveryItem, "deliveryId">[]): Promise<Delivery & { items: DeliveryItem[] }>;
  updateDeliveryWithItems(id: string, delivery: UpdateDelivery, items: (Omit<InsertDeliveryItem, "deliveryId"> & { id?: string })[]): Promise<Delivery & { items: DeliveryItem[] }>;
  deleteDelivery(id: string): Promise<void>;
  deleteDeliveryItem(id: string): Promise<void>;

  // Request Deliveries
  getRequestDeliveries(revisionId: string): Promise<(RequestDelivery & { delivery: Delivery & { items: DeliveryItem[], attachment?: Document | null, supplierLogo?: string | null } })[]>;
  createRequestDelivery(data: InsertRequestDelivery): Promise<RequestDelivery>;
  deleteRequestDeliveriesByRevision(revisionId: string): Promise<void>;

  // Request Suppliers
  getRequestSuppliers(revisionId: string): Promise<(RequestSupplier & { supplier: Supplier })[]>;
  getAssignedSupplierIdsForProject(projectId: string, excludeRequestId?: string): Promise<string[]>;
  createRequestSupplier(data: InsertRequestSupplier): Promise<RequestSupplier>;
  deleteRequestSuppliersByRevision(revisionId: string): Promise<void>;

  // Request Materials
  getRequestMaterials(revisionId: string): Promise<(RequestMaterial & { material: Material })[]>;
  linkMaterialToRevision(data: InsertRequestMaterial): Promise<RequestMaterial>;
  deleteRequestMaterialsByRevision(revisionId: string): Promise<void>;

  getAssignedMaterialIdsForProject(projectId: string, excludeRequestId?: string): Promise<string[]>;

  // Materials
  getMaterial(id: string): Promise<Material | undefined>;
  getMaterialsByProject(projectId: string): Promise<(Material & { isApproved?: boolean; hasRequests?: boolean; hasSuppliers?: boolean; attachmentCount?: number })[]>;
  getMaterialRequests(materialId: string): Promise<any[]>;
  createMaterial(material: InsertMaterial): Promise<Material>;
  updateMaterial(id: string, material: UpdateMaterial): Promise<Material>;
  deleteMaterial(id: string): Promise<void>;

  // Material Attachments
  getMaterialAttachments(materialId: string): Promise<(MaterialAttachment & { document: Document })[]>;
  createMaterialAttachment(data: InsertMaterialAttachment): Promise<MaterialAttachment>;
  deleteMaterialAttachment(id: string): Promise<void>;

  // Warehouses
  getWarehouse(id: string): Promise<Warehouse | undefined>;
  getWarehousesByProject(projectId: string): Promise<(Warehouse & { materialCount: number; movementCount: number })[]>;
  getDefaultWarehouse(projectId: string): Promise<Warehouse | undefined>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: string, warehouse: UpdateWarehouse): Promise<Warehouse>;
  deleteWarehouse(id: string): Promise<void>;

  // Stock - balances are always computed from the ledger, never stored.
  getStockBalances(projectId: string, warehouseId?: string): Promise<StockBalance[]>;
  getStockMovements(projectId: string, filters?: StockMovementFilters): Promise<EnrichedStockMovement[]>;
  getLowStockMaterials(projectId: string): Promise<StockBalance[]>;
  getLowStockCrossings(projectId: string, changes: { materialId: string; delta: number }[]): Promise<StockBalance[]>;
  getRequestFormsExportData(
    projectId: string,
    typeCode: string,
    filters?: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }
  ): Promise<any>;
  createManualStockMovement(projectId: string, input: CreateManualStockMovement): Promise<StockMovement>;
  createStockTransfer(input: CreateStockTransfer & { createdBy?: string | null }): Promise<any>;
  getStockTransfersByProject(projectId: string): Promise<any[]>;

  // Material Issues
  getMaterialIssue(id: string): Promise<any | undefined>;
  getMaterialIssuesByProject(projectId: string): Promise<any[]>;
  createMaterialIssueWithItems(input: CreateMaterialIssue & { createdBy?: string | null }): Promise<any>;
  approveMaterialIssue(id: string, userId: string): Promise<any>;
  rejectMaterialIssue(id: string, userId: string, reason: string): Promise<MaterialIssue>;
  cancelMaterialIssue(id: string, userId: string): Promise<MaterialIssue>;
  getInventoryApproverPositions(projectId: string): Promise<(InventoryApproverPosition & { position: Position })[]>;
  getProjectPositionCoverage(projectId: string): Promise<{ position: Position; memberCount: number; userCount: number }[]>;
  setInventoryApproverPositions(projectId: string, positionIds: string[]): Promise<void>;
  canUserApproveIssues(userId: string, projectId: string): Promise<boolean>;

  // Suppliers
  getSupplier(id: string): Promise<Supplier | undefined>;
  getSuppliersByProject(projectId: string): Promise<Supplier[]>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: UpdateSupplier): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;
  getSupplierAttachments(supplierId: string): Promise<(SupplierAttachment & { document: Document })[]>;
  createSupplierAttachment(data: InsertSupplierAttachment): Promise<SupplierAttachment>;
  deleteSupplierAttachment(id: string): Promise<void>;

  // Material Suppliers
  getMaterialSuppliers(materialId: string): Promise<(MaterialSupplier & { supplier: Supplier })[]>;
  getSupplierMaterials(supplierId: string): Promise<(MaterialSupplier & { material: Material })[]>;
  createMaterialSupplier(data: InsertMaterialSupplier): Promise<MaterialSupplier>;
  deleteMaterialSupplier(id: string): Promise<void>;

  // Users
  getAllUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: UpdateUser): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getUsersSignatures(userIds: string[]): Promise<{ id: string, signature: string | null }[]>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(id: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;
  deleteUserTokens(userId: string): Promise<void>;

  // Organization Invitations
  createOrganizationInvitation(invitation: InsertOrganizationInvitation): Promise<OrganizationInvitation>;
  getOrganizationInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | undefined>;
  getOrganizationInvitationsByInviter(invitingOrganizationId: string): Promise<OrganizationInvitation[]>;
  getOrganizationInvitation(id: string): Promise<OrganizationInvitation | undefined>;
  getPendingInvitationForRole(projectId: string, role: string): Promise<OrganizationInvitation | undefined>;
  getPendingInvitationsForProjects(projectIds: string[]): Promise<OrganizationInvitation[]>;
  getPendingInvitationsForOrganizations(organizationIds: string[]): Promise<OrganizationInvitation[]>;
  revokeOrganizationInvitation(id: string, invitingOrganizationId: string): Promise<OrganizationInvitation | undefined>;
  deleteOrganizationInvitation(id: string): Promise<void>;
  getOrganizationAdminUserIds(organizationId: string): Promise<string[]>;
  getUserAdministeredOrganizationIds(userId: string): Promise<string[]>;
  getLinkedOrganizationIds(organizationId: string): Promise<string[]>;
  acceptProjectInvitation(invitationId: string, organizationId: string, userId: string): Promise<OrganizationInvitation>;
  rejectProjectInvitation(invitationId: string, userId: string): Promise<OrganizationInvitation | undefined>;
  acceptOrganizationInvitation(params: AcceptInvitationParams): Promise<{ organization: Organization; user: User }>;

  // Purposes
  getAllPurposes(): Promise<Purpose[]>;
  getPurpose(id: string): Promise<Purpose | undefined>;
  createPurpose(purpose: InsertPurpose): Promise<Purpose>;
  updatePurpose(id: string, purpose: UpdatePurpose): Promise<Purpose>;
  deletePurpose(id: string): Promise<void>;

  // Positions
  getAllPositions(): Promise<Position[]>;
  getPosition(id: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, position: UpdatePosition): Promise<Position>;
  deletePosition(id: string): Promise<void>;

  // Request Types
  getAllRequestTypes(): Promise<RequestType[]>;
  getRequestType(id: string): Promise<RequestType | undefined>;
  createRequestType(data: any): Promise<RequestType>;
  updateRequestType(id: string, data: any): Promise<RequestType>;
  deleteRequestType(id: string): Promise<void>;

  getAllRequests(): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]>;
  getRequest(id: string): Promise<Request | undefined>;
  getRequestsByProject(projectId: string): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]>;
  createRequest(data: InsertRequest): Promise<Request>;
  updateRequest(id: string, data: UpdateRequest): Promise<Request>;
  deleteRequest(id: string, reason: string | null, userId: string): Promise<void>;
  restoreRequest(id: string, userId: string): Promise<void>;
  getDeletedRequestsByProject(projectId: string): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null; deletedBy_name?: string | null; deletedAt?: string | null; reason?: string | null })[]>;

  // Request Revisions
  getRequestRevisions(requestId: string): Promise<RequestRevision[]>;
  getRequestRevisionById(revisionId: string): Promise<RequestRevision | undefined>;
  getNextRevisionNo(requestId: string): Promise<number>;
  createRequestRevision(data: InsertRequestRevision): Promise<RequestRevision>;
  updateRequestRevision(id: string, data: Partial<InsertRequestRevision>): Promise<RequestRevision>;

  // Request Status History
  getRequestStatusHistory(revisionId: string): Promise<RequestStatusHistory[]>;
  createRequestStatusHistory(data: InsertRequestStatusHistory): Promise<RequestStatusHistory>;

  // Request Purposes
  getRequestPurposes(revisionId: string): Promise<RequestPurpose[]>;
  createRequestPurpose(data: InsertRequestPurpose): Promise<RequestPurpose>;
  deleteRequestPurposesByRevision(revisionId: string): Promise<void>;
  getLatestRevision(requestId: string): Promise<RequestRevision | undefined>;

  // Request Documents
  getRequestDocuments(revisionId: string): Promise<RequestDocument[]>;
  createRequestDocument(data: InsertRequestDocument): Promise<RequestDocument>;
  updateRequestDocument(id: string, data: Partial<InsertRequestDocument>): Promise<RequestDocument>;
  deleteRequestDocument(id: string): Promise<void>;
  deleteRequestDocumentsByRevision(revisionId: string): Promise<void>;

  // Workflow Steps & Transitions
  getAllWorkflowSteps(): Promise<WorkflowStep[]>;
  getWorkflowSteps(requestTypeId: number): Promise<WorkflowStep[]>;
  getWorkflowStep(stepId: number): Promise<WorkflowStep | undefined>;
  getWorkflowTransitions(requestTypeId: number, fromStepId: number): Promise<WorkflowTransition[]>;
  getWorkflowTransition(requestTypeId: number, fromStepId: number, toStepId: number, allowedStatus: string): Promise<WorkflowTransition | undefined>;
  createWorkflowStep(data: any): Promise<WorkflowStep>;
  createWorkflowTransition(data: any): Promise<WorkflowTransition>;

  // Request Work Locations
  getRequestWorkLocations(revisionId: string): Promise<RequestWorkLocation[]>;
  createRequestWorkLocation(data: InsertRequestWorkLocation): Promise<RequestWorkLocation>;
  deleteRequestWorkLocationsByRevision(revisionId: string): Promise<void>;

  // Request Work Levels
  getRequestWorkLevels(revisionId: string): Promise<RequestWorkLevel[]>;
  createRequestWorkLevel(data: InsertRequestWorkLevel): Promise<RequestWorkLevel>;
  deleteRequestWorkLevelsByRevision(revisionId: string): Promise<void>;

  // Request Deliveries
  getRequestDeliveries(revisionId: string): Promise<any[]>;
  createRequestDelivery(data: InsertRequestDelivery): Promise<RequestDelivery>;
  deleteRequestDeliveriesByRevision(revisionId: string): Promise<void>;

  // Request Suppliers (SSR)
  getRevisionSuppliers(revisionId: string): Promise<any[]>;
  linkSupplierToRevision(data: InsertRequestSupplier): Promise<any>;
  deleteRevisionSuppliersByRevision(revisionId: string): Promise<void>;
  // Request Inquiries
  getRequestInquiries(revisionId: string): Promise<RequestInquiry[]>;
  createRequestInquiry(data: InsertRequestInquiry): Promise<RequestInquiry>;
  updateRequestInquiry(id: string, data: UpdateRequestInquiry): Promise<RequestInquiry>;
  deleteRequestInquiry(id: string): Promise<void>;

  // Revision Checklist Responses
  getRevisionChecklistResponses(revisionId: string): Promise<RevisionChecklistResponse[]>;
  upsertRevisionChecklistResponse(data: InsertRevisionChecklistResponse): Promise<RevisionChecklistResponse>;
  deleteRevisionChecklistResponse(revisionId: string, checklistItemId: string): Promise<void>;

  // Request Consultant Reviews
  getRequestConsultantReviews(revisionId: string): Promise<RequestConsultantReview[]>;
  getRequestConsultantReview(id: string): Promise<RequestConsultantReview | undefined>;
  createRequestConsultantReview(data: { revisionId: string; residentEngineerUserId?: string | null; comments?: string | null; statusCode?: string | null }): Promise<RequestConsultantReview>;
  updateRequestConsultantReview(id: string, data: { comments?: string; statusCode?: string; receivedAt?: string; reviewedAt?: string; residentEngineerUserId?: string | null }): Promise<RequestConsultantReview>;

  // Request Attachments
  getRequestAttachments(revisionId: string): Promise<RequestAttachment[]>;
  createRequestAttachment(data: InsertRequestAttachment): Promise<RequestAttachment>;
  deleteRequestAttachment(id: string): Promise<void>;

  // Request Messages (Chat)
  getRequestMessages(revisionId: string): Promise<(RequestMessage & { attachments: MessageAttachment[] })[]>;
  getAllRequestMessages(requestId: string): Promise<(RequestMessage & { attachments: MessageAttachment[] })[]>;
  createRequestMessage(data: InsertRequestMessage): Promise<RequestMessage>;
  deleteRequestMessage(id: string): Promise<void>;

  // Message Attachments
  getMessageAttachments(messageId: string): Promise<MessageAttachment[]>;
  createMessageAttachment(data: InsertMessageAttachment): Promise<MessageAttachment>;
  deleteMessageAttachment(id: string): Promise<void>;

  // Approval Status Codes (Lookup table)
  getAllApprovalStatusCodes(): Promise<ApprovalStatusCode[]>;
  getApprovalStatusCode(code: string): Promise<ApprovalStatusCode | undefined>;

  // Revision Approval (set/get approval status on a revision)
  setRevisionApprovalStatus(revisionId: string, statusCode: string, comments: string | null, approvedByUserId: string): Promise<RequestRevision>;

  // Workflow Steps & Transitions
  getAllWorkflowSteps(): Promise<WorkflowStep[]>;
  getWorkflowSteps(requestTypeId: number): Promise<WorkflowStep[]>;
  getWorkflowStep(stepId: number): Promise<WorkflowStep | undefined>;
  getWorkflowTransitions(requestTypeId: number, fromStepId: number): Promise<WorkflowTransition[]>;
  getWorkflowTransition(requestTypeId: number, fromStepId: number, toStepId: number, allowedStatus: string): Promise<WorkflowTransition | undefined>;

  // Activity Checklist Items (Junction table)
  getChecklistItemsByActivity(activityId: string): Promise<any[]>;
  setChecklistItemsForActivity(activityId: string, checklistItemIds: string[], addedBy?: string): Promise<void>;
  addChecklistItemToActivity(activityId: string, checklistItemId: string, addedBy?: string): Promise<any>;
  removeChecklistItemFromActivity(activityId: string, checklistItemId: string): Promise<void>;

  // User-Team Member Associations (Junction table)
  getUserTeamMembers(userId: string): Promise<UserTeamMember[]>;
  getTeamMemberUsers(teamMemberId: string): Promise<UserTeamMember[]>;
  getAllUserTeamMembers(): Promise<UserTeamMember[]>;
  setUserTeamMembers(userId: string, teamMemberIds: string[]): Promise<void>;
  addUserTeamMember(userId: string, teamMemberId: string): Promise<UserTeamMember>;
  removeUserTeamMember(userId: string, teamMemberId: string): Promise<void>;

  // Team Member Permissions (RBAC)
  getTeamMemberPermissions(projectId: string, requestTypeId: string): Promise<any[]>;
  upsertTeamMemberPermission(projectId: string, teamMemberId: string, requestTypeId: string, canView: boolean, canCreate: boolean, canEdit: boolean): Promise<any>;
  deleteTeamMemberPermission(id: string): Promise<void>;

  // Create request with initial revision (transactional)
  createRequestWithRevision(requestData: {
    requestNumber?: string; // Optional - auto-generated from naming series
    referenceCode: string;
    requestTypeId: string;
    projectId: string;
    createdBy: string;
    contractorId?: string | null;
    consultantId?: string | null;
  }, revisionData: {
    currentStepId?: number | null;
    title: string;
    description?: string | null;
    workListActivityId?: string | null;
    workLocationId?: string | null;
    workLevelId?: string | null;
    scheduledDate?: string | null;
    remarks?: string | null;
  }): Promise<{ request: Request; revision: RequestRevision; statusHistory: RequestStatusHistory }>;

  // Get next request number for a project
  getNextRequestNumber(projectId: string): Promise<number>;
  previewNextRequestNumber(projectId: string, requestTypeId: string): Promise<string>;

  // Notifications
  getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  findUnreadNotification(userId: string, requestId: string, type: string): Promise<Notification | undefined>;
  createNotification(data: InsertNotification): Promise<Notification>;
  updateNotification(id: string, data: Partial<InsertNotification>): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  deleteAllNotifications(userId: string): Promise<void>;

  // Snag Lists & Items
  getSnagListsByProject(projectId: string): Promise<SnagList[]>;
  getSnagList(id: string): Promise<SnagList | undefined>;
  createSnagList(data: InsertSnagList): Promise<SnagList>;
  updateSnagList(id: string, data: UpdateSnagList): Promise<SnagList>;
  deleteSnagList(id: string): Promise<void>;

  getSnagItemsByList(snagListId: string): Promise<any[]>;
  getSnagItemsByProject(projectId: string): Promise<any[]>;
  getSnagItem(id: string): Promise<SnagItem | undefined>;
  createSnagItem(data: InsertSnagItem): Promise<SnagItem>;
  updateSnagItem(id: string, data: UpdateSnagItem): Promise<SnagItem>;
  deleteSnagItem(id: string): Promise<void>;

  getSnagItemHistory(snagItemId: string): Promise<any[]>;
  createSnagItemHistory(data: InsertSnagItemHistory): Promise<SnagItemHistory>;

  // RFQs (Request For Quotations)
  getRfqsByProject(projectId: string): Promise<any[]>;
  getRfq(id: string): Promise<any | undefined>;
  createRfq(data: InsertRfq): Promise<Rfq>;
  updateRfq(id: string, data: UpdateRfq): Promise<Rfq>;
  deleteRfq(id: string): Promise<void>;
  getNextRfqNumber(projectId: string): Promise<string>;

  // RFQ Items
  getRfqItems(rfqId: string): Promise<any[]>;
  createRfqItem(data: InsertRfqItem): Promise<RfqItem>;
  updateRfqItem(id: string, data: UpdateRfqItem): Promise<RfqItem>;
  deleteRfqItem(id: string): Promise<void>;

  // RFQ Suppliers
  getRfqSuppliers(rfqId: string): Promise<any[]>;
  addSupplierToRfq(data: InsertRfqSupplier): Promise<RfqSupplier>;
  updateRfqSupplier(id: string, data: UpdateRfqSupplier): Promise<RfqSupplier>;
  removeSupplierFromRfq(id: string): Promise<void>;

  // Quotations
  getQuotationsByRfq(rfqId: string): Promise<any[]>;
  getQuotationsByProject(projectId: string): Promise<any[]>;
  getQuotation(id: string): Promise<any | undefined>;
  createQuotation(data: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: string, data: UpdateQuotation): Promise<Quotation>;
  deleteQuotation(id: string): Promise<void>;

  // Quotation Items
  getQuotationItems(quotationId: string): Promise<any[]>;
  createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem>;
  updateQuotationItem(id: string, data: UpdateQuotationItem): Promise<QuotationItem>;
  deleteQuotationItem(id: string): Promise<void>;

  // Purchase Orders
  getPurchaseOrdersByProject(projectId: string): Promise<any[]>;
  getPurchaseOrder(id: string): Promise<any | undefined>;
  createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder>;
  approvePurchaseOrder(id: string, userId: string): Promise<PurchaseOrder>;
  createReceiptFromPo(input: CreatePoReceiptInput): Promise<any>;
  updatePurchaseOrder(id: string, data: UpdatePurchaseOrder): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: string): Promise<void>;
  getNextPoNumber(projectId: string): Promise<string>;
  getRfqOrderedItems(rfqId: string): Promise<any[]>;
  createPurchaseOrdersFromAssignments(
    rfqId: string,
    assignments: { rfqItemId: string; quotationId: string }[],
    userId?: string,
  ): Promise<any[]>;

  // Purchase Order Items
  getPoItems(poId: string): Promise<any[]>;
  createPoItem(data: InsertPoItem): Promise<PoItem>;
  updatePoItem(id: string, data: UpdatePoItem): Promise<PoItem>;
  deletePoItem(id: string): Promise<void>;
}

// Reserves the next DN number for a project and advances the counter. Must run inside the
// caller's transaction so the number is rolled back with the receipt if anything fails.
async function nextShipmentNumber(tx: any, projectId: string): Promise<string> {
  const [dnType] = await tx.select().from(requestTypes).where(eq(requestTypes.code, "DN"));

  let prefix = "DN";
  let nextNum = 1;

  if (dnType) {
    const [settings] = await tx
      .select()
      .from(requestTypeSettings)
      .where(and(eq(requestTypeSettings.projectId, projectId), eq(requestTypeSettings.requestTypeId, dnType.id)));

    if (settings) {
      prefix = settings.prefix || "DN";
      nextNum = settings.nextNumber || 1;
      await tx
        .update(requestTypeSettings)
        .set({ nextNumber: nextNum + 1, updatedAt: new Date() })
        .where(eq(requestTypeSettings.id, settings.id));
    } else {
      await tx.insert(requestTypeSettings).values({
        projectId,
        requestTypeId: dnType.id,
        prefix: "DN",
        nextNumber: 2,
      });
    }
  }

  return `${prefix}-${String(nextNum).padStart(2, "0")}`;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProjectsByOrganization(orgId: string): Promise<Project[]> {
    return await db.select().from(projects).where(
      or(
        eq(projects.organizationId, orgId),
        eq(projects.contractorId, orgId),
        eq(projects.consultantId, orgId)
      )
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    // Verify organization exists
    const organizationExists = await this.getOrganization(insertProject.organizationId);
    if (!organizationExists) {
      throw new Error("Organization not found");
    }

    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async updateProject(id: string, updateData: UpdateProject): Promise<Project> {
    // Verify project exists
    const existingProject = await this.getProject(id);
    if (!existingProject) {
      throw new Error("Project not found");
    }

    // If updating organizationId, verify new organization exists
    if (updateData.organizationId) {
      const organizationExists = await this.getOrganization(updateData.organizationId);
      if (!organizationExists) {
        throw new Error("Organization not found");
      }
    }

    const [project] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Organizations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization || undefined;
  }

  async getOrganizationByCcrNumber(ccrNumber: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ccrNumber, ccrNumber));
    return organization || undefined;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
  }

  async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
    const [organization] = await db
      .insert(organizations)
      .values(insertOrganization)
      .returning();
    return organization;
  }

  async updateOrganization(id: string, updateData: UpdateOrganization): Promise<Organization> {
    // Verify organization exists
    const existingOrganization = await this.getOrganization(id);
    if (!existingOrganization) {
      throw new Error("Organization not found");
    }

    const [organization] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning();
    return organization;
  }

  async deleteOrganization(id: string): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  // Tasks
  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks);
  }

  async getTasksByProject(projectId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    // Verify project exists
    const projectExists = await this.getProject(insertTask.projectId);
    if (!projectExists) {
      throw new Error("Project not found");
    }

    // Verify assignee exists if provided
    if (insertTask.assignedTo) {
      const memberExists = await this.getTeamMember(insertTask.assignedTo);
      if (!memberExists) {
        throw new Error("Team member not found");
      }
    }

    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: string, updateData: UpdateTask): Promise<Task> {
    // Verify task exists
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      throw new Error("Task not found");
    }

    // If updating projectId, verify new project exists
    if (updateData.projectId) {
      const projectExists = await this.getProject(updateData.projectId);
      if (!projectExists) {
        throw new Error("Project not found");
      }
    }

    // If updating assignedTo, verify team member exists
    if (updateData.assignedTo) {
      const memberExists = await this.getTeamMember(updateData.assignedTo);
      if (!memberExists) {
        throw new Error("Team member not found");
      }
    }

    const [task] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Team Members
  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member || undefined;
  }

  async getAllTeamMembers(): Promise<TeamMember[]> {
    return await db.select().from(teamMembers);
  }

  async getTeamMembersByOrganization(organizationId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.organizationId, organizationId));
  }

  async createTeamMember(insertMember: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db
      .insert(teamMembers)
      .values(insertMember)
      .returning();
    return member;
  }

  async updateTeamMember(id: string, updateData: UpdateTeamMember): Promise<TeamMember> {
    // Verify team member exists
    const existingMember = await this.getTeamMember(id);
    if (!existingMember) {
      throw new Error("Team member not found");
    }

    const [member] = await db
      .update(teamMembers)
      .set(updateData)
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // Documents
  async getDocument(id: string): Promise<Document | undefined> {
    // 1. Try documents table
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (doc) return doc as any;

    // 2. Try request_documents table (Contractor Attachments)
    const [reqDoc] = await db.select().from(requestDocuments).where(eq(requestDocuments.id, id));
    if (reqDoc) {
      return {
        id: reqDoc.id,
        projectId: "", // Not stored directly in requestDocuments, but we can return empty
        folderId: null,
        name: reqDoc.fileName || reqDoc.title || "Untitled",
        type: reqDoc.documentType || reqDoc.mimeType || "Contractor Attachment",
        category: "Contractor Attachment",
        size: reqDoc.fileSize?.toString() || "0",
        uploadDate: reqDoc.uploadedAt ? new Date(reqDoc.uploadedAt) : new Date(),
        fileData: reqDoc.fileUrl || "", // In requestDocuments, fileUrl is the data/link
        fileUrl: reqDoc.fileUrl || null,
        fileName: reqDoc.fileName || null,
        uploadedBy: reqDoc.uploadedBy || null,
        tags: []
      } as any;
    }

    // 3. Try request_attachments table (Consultant Attachments)
    const [reqAttach] = await db.select().from(requestAttachments).where(eq(requestAttachments.id, id));
    if (reqAttach) {
      return {
        id: reqAttach.id,
        projectId: "",
        folderId: null,
        name: reqAttach.fileName || reqAttach.title || "Untitled",
        type: reqAttach.fileType || "Consultant Attachment",
        category: "Consultant Attachment",
        size: reqAttach.fileSize?.toString() || "0",
        uploadDate: reqAttach.uploadedAt ? new Date(reqAttach.uploadedAt) : new Date(),
        fileData: reqAttach.fileUrl || reqAttach.fileData || "",
        fileUrl: reqAttach.fileUrl || null,
        fileName: reqAttach.fileName || null,
        uploadedBy: reqAttach.uploadedBy || null,
        tags: []
      } as any;
    }

    // 4. Try message_attachments table
    const [msgAttach] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id));
    if (msgAttach) {
      return {
        id: msgAttach.id,
        projectId: "",
        folderId: null,
        name: msgAttach.fileName || msgAttach.title || "Untitled",
        type: msgAttach.fileType || "Message Attachment",
        category: "Message Attachment",
        size: msgAttach.fileSize?.toString() || "0",
        uploadDate: msgAttach.uploadedAt ? new Date(msgAttach.uploadedAt) : new Date(),
        fileData: msgAttach.fileUrl || "",
        fileUrl: msgAttach.fileUrl || null,
        fileName: msgAttach.fileName || null,
        uploadedBy: null,
        tags: []
      } as any;
    }

    return undefined;
  }

  async getAllDocuments(): Promise<Document[]> {
    return await db.select({
      id: documents.id,
      projectId: documents.projectId,
      folderId: documents.folderId,
      name: documents.name,
      type: documents.type,
      category: documents.category,
      size: documents.size,
      uploadDate: documents.uploadDate,
      fileUrl: documents.fileUrl,
      fileName: documents.fileName,
      uploadedBy: documents.uploadedBy,
      tags: documents.tags,
    }).from(documents).orderBy(desc(documents.uploadDate)) as any;
  }

  async getDocumentsByProject(projectId: string): Promise<Document[]> {
    return await db.select({
      id: documents.id,
      projectId: documents.projectId,
      folderId: documents.folderId,
      name: documents.name,
      type: documents.type,
      category: documents.category,
      size: documents.size,
      uploadDate: documents.uploadDate,
      fileUrl: documents.fileUrl,
      fileName: documents.fileName,
      uploadedBy: documents.uploadedBy,
      tags: documents.tags,
    }).from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.uploadDate)) as any;
  }

  async getRequestDocumentsByProject(projectId: string): Promise<any[]> {
    try {
      const contractorDocs = await db
        .select({
          id: requestDocuments.id,
          projectId: requests.projectId,
          name: sql<string>`COALESCE(${requestDocuments.fileName}, ${documents.name}, ${requestDocuments.title}, 'Untitled')`,
          type: sql<string>`COALESCE(${requestDocuments.documentType}, 'Contractor Attachment')`,
          size: sql<string>`COALESCE(CAST(${requestDocuments.fileSize} AS text), ${documents.size}, '0')`,
          fileUrl: sql<string>`COALESCE(${requestDocuments.fileUrl}, ${documents.fileUrl}, ${documents.fileData})`,
          // fileData EXCLUDED here to avoid massive response payload
          uploadDate: requestDocuments.uploadedAt,
          category: sql<string>`'Contractor Attachment'`,
          folderId: documents.folderId,
          tags: documents.tags,
        })
        .from(requestDocuments)
        .leftJoin(documents, eq(requestDocuments.projectDocumentId, documents.id))
        .innerJoin(requestRevisions, eq(requestDocuments.revisionId, requestRevisions.id))
        .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
        .innerJoin(requestTypes, eq(requests.requestTypeId, requestTypes.id))
        .where(and(
          eq(requests.projectId, projectId),
          or(
            eq(requestDocuments.sourceType, 'project'),
            isNotNull(requestDocuments.projectDocumentId),
            eq(requestTypes.code, 'NCR') // Include direct device uploads for NCR
          )
        ));

      const consultantAttachments = await db
        .select({
          id: requestAttachments.id,
          projectId: requests.projectId,
          name: sql<string>`COALESCE(${requestAttachments.fileName}, ${requestAttachments.title}, 'Untitled')`,
          type: sql<string>`COALESCE(${requestAttachments.fileType}, 'Consultant Attachment')`,
          size: sql<string>`COALESCE(CAST(${requestAttachments.fileSize} AS text), '0')`,
          fileUrl: requestAttachments.fileUrl,
          // fileData EXCLUDED here to avoid massive response payload
          uploadDate: requestAttachments.uploadedAt,
          category: sql<string>`'Consultant Attachment'`,
          folderId: sql<string | null>`null`,
        })
        .from(requestAttachments)
        .innerJoin(requestRevisions, eq(requestAttachments.revisionId, requestRevisions.id))
        .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
        .where(eq(requests.projectId, projectId));

      return [...contractorDocs, ...consultantAttachments].sort((a, b) => {
        const d1 = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const d2 = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
        const dateA = isNaN(d1) ? 0 : d1;
        const dateB = isNaN(d2) ? 0 : d2;
        return dateB - dateA;
      });
    } catch (error) {
      console.error("[Storage] Error getting request documents:", error);
      return []; // Return empty instead of crashing
    }
  }

  async createDocument(insertDoc: InsertDocument): Promise<Document> {
    const projectExists = await this.getProject(insertDoc.projectId);
    if (!projectExists) {
      throw new Error("Project not found");
    }

    const [doc] = await db
      .insert(documents)
      .values({
        ...insertDoc,
        uploadDate: insertDoc.uploadDate ? new Date(insertDoc.uploadDate as string) : new Date(),
        tags: insertDoc.tags || []
      })
      .returning();
    return doc;
  }

  async updateDocument(id: string, updateData: UpdateDocument): Promise<Document> {
    const [doc] = await db
      .update(documents)
      .set({
        ...updateData,
        uploadDate: updateData.uploadDate ? new Date(updateData.uploadDate as string) : undefined
      })
      .where(eq(documents.id, id))
      .returning();
    if (!doc) throw new Error("Document not found");
    return doc;
  }

  async deleteDocument(id: string): Promise<void> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return;

    // Check if it's explicitly linked to any request document
    const linkedRequests = await db.select().from(requestDocuments).where(eq(requestDocuments.projectDocumentId, id));

    // Check if it's used as a Delivery Note in any delivery that is linked to a request
    const linkedViaDeliveries = await db
      .select({ id: requests.id })
      .from(deliveries)
      .innerJoin(requestDeliveries, eq(deliveries.id, requestDeliveries.deliveryId))
      .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(eq(deliveries.deliveryNoteId, id));

    const isLinked = linkedRequests.length > 0 || linkedViaDeliveries.length > 0;

    // Check if it's already in the recycle bin
    let isAlreadyInRecycleBin = false;
    if (doc.folderId) {
      const [currentFolder] = await db.select().from(projectFolders).where(eq(projectFolders.id, doc.folderId));
      if (currentFolder && (currentFolder.name === "سلة المحذوفات" || currentFolder.name === "Recycle Bin")) {
        isAlreadyInRecycleBin = true;
      }
    }

    // If it's not linked to any request, or it is already in the recycle bin -> PERMANENT DELETE
    if (!isLinked || isAlreadyInRecycleBin) {
      if (isLinked) {
        // Just in case we are hard deleting from the recycle bin, unlink it to prevent constraint errors
        await db.update(requestDocuments)
          .set({ projectDocumentId: null })
          .where(eq(requestDocuments.projectDocumentId, id));
      }
      await db.delete(documents).where(eq(documents.id, id));
    } else {
      // It is linked to a request AND not in the recycle bin -> MOVE TO RECYCLE BIN to preserve the link
      let [recycleBin] = await db.select().from(projectFolders).where(
        and(eq(projectFolders.projectId, doc.projectId), eq(projectFolders.name, "Recycle Bin"), isNull(projectFolders.parentId))
      ).limit(1);

      if (!recycleBin) {
        // Support arabic older name as fallback query
        let [arabicBin] = await db.select().from(projectFolders).where(
          and(eq(projectFolders.projectId, doc.projectId), eq(projectFolders.name, "سلة المحذوفات"), isNull(projectFolders.parentId))
        ).limit(1);
        recycleBin = arabicBin;
      }

      if (!recycleBin) {
        let createdBy = doc.uploadedBy;
        if (!createdBy) {
          const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);
          createdBy = firstUser?.id || "";
        }

        try {
          const [newFolder] = await db.insert(projectFolders).values({
            projectId: doc.projectId,
            name: "Recycle Bin",
            createdBy
          } as any).returning();
          recycleBin = newFolder;
        } catch (e) {
          console.error("Could not create recycle bin folder:", e);
          // If we fail to create the recycle bin, fallback to unlinking and permanent delete
          await db.update(requestDocuments)
            .set({ projectDocumentId: null })
            .where(eq(requestDocuments.projectDocumentId, id));
          await db.delete(documents).where(eq(documents.id, id));
          return;
        }
      }

      await db.update(documents)
        .set({ folderId: recycleBin.id })
        .where(eq(documents.id, id));
    }
  }

  async bulkDeleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const docs = await db.select().from(documents).where(sql`${documents.id} IN ${ids}`);
    for (const doc of docs) {
      await this.deleteDocument(doc.id);
    }
  }

  async bulkMoveDocuments(ids: string[], folderId: string | null): Promise<void> {
    if (ids.length === 0) return;
    await db.update(documents)
      .set({ folderId })
      .where(sql`${documents.id} IN ${ids}`);
  }

  // Project Folders
  async getProjectFolders(projectId: string): Promise<ProjectFolder[]> {
    return await db.select().from(projectFolders).where(eq(projectFolders.projectId, projectId)).orderBy(desc(projectFolders.createdAt));
  }

  async getProjectFoldersByParent(parentId: string): Promise<ProjectFolder[]> {
    return await db.select().from(projectFolders).where(eq(projectFolders.parentId, parentId)).orderBy(desc(projectFolders.createdAt));
  }

  async getProjectFolder(id: string): Promise<ProjectFolder | undefined> {
    const [folder] = await db.select().from(projectFolders).where(eq(projectFolders.id, id));
    return folder || undefined;
  }

  async createProjectFolder(insertFolder: InsertProjectFolder): Promise<ProjectFolder> {
    const [folder] = (await db
      .insert(projectFolders)
      .values(insertFolder)
      .returning()) as any[];
    return folder;
  }

  async updateProjectFolder(id: string, updateData: Partial<InsertProjectFolder>): Promise<ProjectFolder> {
    const [folder] = await db
      .update(projectFolders)
      .set(updateData)
      .where(eq(projectFolders.id, id))
      .returning();
    return folder;
  }

  async deleteProjectFolder(id: string): Promise<void> {
    const [folder] = await db.select().from(projectFolders).where(eq(projectFolders.id, id));
    if (!folder) return;

    // Prevent deleting the recycle bin itself or if it's already in the recycle bin
    let isAlreadyInRecycleBin = false;
    if (folder.name === "Recycle Bin") {
      isAlreadyInRecycleBin = true;
    }

    if (folder.parentId) {
      const [currentParent] = await db.select().from(projectFolders).where(eq(projectFolders.id, folder.parentId));
      if (currentParent && (currentParent.name === "Recycle Bin")) {
        isAlreadyInRecycleBin = true;
      }
    }

    if (isAlreadyInRecycleBin) {
      // PERMANENT DELETE
      await db.delete(projectFolders).where(eq(projectFolders.id, id));
    } else {
      // MOVE TO RECYCLE BIN
      let [recycleBin] = await db.select().from(projectFolders).where(
        and(
          eq(projectFolders.projectId, folder.projectId),
          eq(projectFolders.name, "Recycle Bin"),
          isNull(projectFolders.parentId)
        )
      ).limit(1);

      if (!recycleBin) {
        let createdBy = folder.createdBy;
        if (!createdBy) {
          const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);
          createdBy = firstUser?.id || "";
        }

        try {
          const [newFolder] = await db.insert(projectFolders).values({
            projectId: folder.projectId,
            name: "Recycle Bin",
            createdBy
          } as any).returning();
          recycleBin = newFolder;
        } catch (e) {
          console.error("Could not create recycle bin folder:", e);
          // Fallback to permanent delete if recycle bin creation fails
          await db.delete(projectFolders).where(eq(projectFolders.id, id));
          return;
        }
      }

      // Update to move under the recycle bin
      await db.update(projectFolders)
        .set({ parentId: recycleBin.id })
        .where(eq(projectFolders.id, id));
    }
  }

  async bulkDeleteFolders(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const foldersArray = await db.select().from(projectFolders).where(sql`${projectFolders.id} IN ${ids}`);
    for (const folder of foldersArray) {
      if (folder) await this.deleteProjectFolder(folder.id);
    }
  }

  async bulkMoveFolders(ids: string[], parentId: string | null): Promise<void> {
    if (ids.length === 0) return;
    await db.update(projectFolders)
      .set({ parentId })
      .where(sql`${projectFolders.id} IN ${ids}`);
  }

  async getDocumentsByFolder(folderId: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.folderId, folderId)).orderBy(desc(documents.uploadDate));
  }

  // Activities
  async getActivity(id: string): Promise<(Activity & { chapterName?: string | null; divisionName?: string | null; chapterCode?: string | null; divisionCode?: string | null; userName?: string | null }) | undefined> {
    const [result] = await db
      .select({
        id: activities.id,
        projectId: activities.projectId,
        requestId: activities.requestId,
        type: activities.type,
        title: activities.title,
        description: activities.description,
        userId: activities.userId,
        userName: sql<string | null>`${users.username}`,
        workListActivityId: activities.workListActivityId,
        requestTypeId: sql<string | null>`COALESCE(${activities.requestTypeId}, ${requests.requestTypeId})`,
        activityCode: activities.activityCode,
        scheduledDate: activities.scheduledDate,
        createdAt: activities.createdAt,
        latestRevisionId: requests.currentRevisionId,
        chapterName: sql<string | null>`COALESCE(${workListChapters.nameEnglish}, ${requestRevisions.chapterName})`,
        divisionName: sql<string | null>`COALESCE(${workListDivisions.nameEnglish}, ${requestRevisions.divisionName})`,
        chapterCode: workListChapters.code,
        divisionCode: workListDivisions.code,
      })
      .from(activities)
      .leftJoin(requests, eq(activities.requestId, requests.id))
      .leftJoin(users, eq(activities.userId, users.id))
      .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
      .leftJoin(workListActivities, eq(activities.workListActivityId, workListActivities.id))
      .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
      .leftJoin(workListDivisions, eq(workListChapters.divisionId, workListDivisions.id))
      .where(eq(activities.id, id));

    return (result as any) || undefined;
  }

  async getAllActivities(): Promise<(Activity & { chapterName?: string | null; divisionName?: string | null; chapterCode?: string | null; divisionCode?: string | null; userName?: string | null })[]> {
    const result = await db
      .select({
        id: activities.id,
        projectId: activities.projectId,
        requestId: activities.requestId,
        type: activities.type,
        title: activities.title,
        description: activities.description,
        userId: activities.userId,
        userName: sql<string | null>`${users.username}`,
        workListActivityId: activities.workListActivityId,
        requestTypeId: sql<string | null>`COALESCE(${activities.requestTypeId}, ${requests.requestTypeId})`,
        activityCode: activities.activityCode,
        scheduledDate: activities.scheduledDate,
        createdAt: activities.createdAt,
        latestRevisionId: requests.currentRevisionId,
        chapterName: sql<string | null>`COALESCE(${workListChapters.nameEnglish}, ${requestRevisions.chapterName})`,
        divisionName: sql<string | null>`COALESCE(${workListDivisions.nameEnglish}, ${requestRevisions.divisionName})`,
        chapterCode: workListChapters.code,
        divisionCode: workListDivisions.code,
      })
      .from(activities)
      .leftJoin(requests, eq(activities.requestId, requests.id))
      .leftJoin(users, eq(activities.userId, users.id))
      .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
      .leftJoin(workListActivities, eq(activities.workListActivityId, workListActivities.id))
      .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
      .leftJoin(workListDivisions, eq(workListChapters.divisionId, workListDivisions.id))
      .orderBy(activities.createdAt);

    return result as any;
  }

  async getActivitiesByProject(projectId: string): Promise<(Activity & { chapterName?: string | null; divisionName?: string | null; chapterCode?: string | null; divisionCode?: string | null; userName?: string | null })[]> {
    const result = await db
      .select({
        id: activities.id,
        projectId: activities.projectId,
        requestId: activities.requestId,
        type: activities.type,
        title: activities.title,
        description: activities.description,
        userId: activities.userId,
        userName: sql<string | null>`${users.username}`,
        workListActivityId: activities.workListActivityId,
        requestTypeId: sql<string | null>`COALESCE(${activities.requestTypeId}, ${requests.requestTypeId})`,
        activityCode: activities.activityCode,
        scheduledDate: activities.scheduledDate,
        createdAt: activities.createdAt,
        latestRevisionId: requests.currentRevisionId,
        chapterName: sql<string | null>`COALESCE(${workListChapters.nameEnglish}, ${requestRevisions.chapterName})`,
        divisionName: sql<string | null>`COALESCE(${workListDivisions.nameEnglish}, ${requestRevisions.divisionName})`,
        chapterCode: workListChapters.code,
        divisionCode: workListDivisions.code,
      })
      .from(activities)
      .leftJoin(requests, eq(activities.requestId, requests.id))
      .leftJoin(users, eq(activities.userId, users.id))
      .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
      .leftJoin(workListActivities, eq(activities.workListActivityId, workListActivities.id))
      .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
      .leftJoin(workListDivisions, eq(workListChapters.divisionId, workListDivisions.id))
      .where(eq(activities.projectId, projectId))
      .orderBy(activities.createdAt);

    return result as any;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db
      .insert(activities)
      .values({
        ...insertActivity,
        userName: insertActivity.userName || "System"
      })
      .returning();
    return activity;
  }

  async updateActivity(id: string, updateData: UpdateActivity): Promise<Activity> {
    const [activity] = await db
      .update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning();
    return activity;
  }

  // Work Locations
  async getWorkLocation(id: string): Promise<WorkLocation | undefined> {
    const [location] = await db.select().from(workLocations).where(eq(workLocations.id, id));
    return location || undefined;
  }

  async getWorkLocationsByProject(projectId: string): Promise<WorkLocation[]> {
    return await db.select().from(workLocations).where(eq(workLocations.projectId, projectId));
  }

  async createWorkLocation(insertLocation: InsertWorkLocation): Promise<WorkLocation> {
    const [location] = await db
      .insert(workLocations)
      .values(insertLocation)
      .returning();
    return location;
  }

  async updateWorkLocation(id: string, updateData: UpdateWorkLocation): Promise<WorkLocation> {
    const [location] = await db
      .update(workLocations)
      .set(updateData)
      .where(eq(workLocations.id, id))
      .returning();
    return location;
  }

  async deleteWorkLocation(id: string): Promise<void> {
    await db.delete(workLocations).where(eq(workLocations.id, id));
  }

  // Project Form Settings
  async getProjectFormSettings(projectId: string): Promise<ProjectFormSettings | undefined> {
    const [settings] = await db.select().from(projectFormSettings).where(eq(projectFormSettings.projectId, projectId));
    return settings || undefined;
  }

  async createProjectFormSettings(insertSettings: InsertProjectFormSettings): Promise<ProjectFormSettings> {
    const [settings] = await db
      .insert(projectFormSettings)
      .values(insertSettings)
      .returning();
    return settings;
  }

  async updateProjectFormSettings(projectId: string, updateData: UpdateProjectFormSettings): Promise<ProjectFormSettings> {
    const [settings] = await db
      .update(projectFormSettings)
      .set(updateData)
      .where(eq(projectFormSettings.projectId, projectId))
      .returning();
    return settings;
  }

  // Request Type Settings
  async getRequestTypeSettings(projectId: string): Promise<RequestTypeSettings[]> {
    return await db.select().from(requestTypeSettings).where(eq(requestTypeSettings.projectId, projectId));
  }

  async getRequestTypeSetting(projectId: string, requestTypeId: string): Promise<RequestTypeSettings | undefined> {
    const [settings] = await db
      .select()
      .from(requestTypeSettings)
      .where(and(eq(requestTypeSettings.projectId, projectId), eq(requestTypeSettings.requestTypeId, requestTypeId)));
    return settings || undefined;
  }

  async createRequestTypeSetting(insertSettings: InsertRequestTypeSettings): Promise<RequestTypeSettings> {
    if (insertSettings.nextNumber !== undefined) {
      // Find the actual maximum number currently in the database
      const allRequests = await db
        .select({ requestNumber: requests.requestNumber })
        .from(requests)
        .where(
          and(
            eq(requests.projectId, insertSettings.projectId),
            eq(requests.requestTypeId, insertSettings.requestTypeId)
          )
        );

      let actualMax = 0;
      for (const req of allRequests) {
        if (!req.requestNumber) continue;
        const parts = req.requestNumber.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num) && num > actualMax) {
          actualMax = num;
        }
      }

      if (insertSettings.nextNumber <= actualMax) {
        throw new Error(`Cannot set next number to ${insertSettings.nextNumber}. The highest request number currently in the database is ${actualMax}. Please choose a number greater than ${actualMax} to prevent duplicates.`);
      }
    }

    const [settings] = await db
      .insert(requestTypeSettings)
      .values({
        ...insertSettings,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return settings;
  }

  async updateRequestTypeSetting(id: string, updateData: UpdateRequestTypeSettings): Promise<RequestTypeSettings> {
    updateData.updatedAt = new Date();

    if (updateData.nextNumber !== undefined) {
      const [currentSettings] = await db
        .select()
        .from(requestTypeSettings)
        .where(eq(requestTypeSettings.id, id));

      if (currentSettings) {
        // Find the actual maximum number currently in the database
        const allRequests = await db
          .select({ requestNumber: requests.requestNumber })
          .from(requests)
          .where(
            and(
              eq(requests.projectId, currentSettings.projectId),
              eq(requests.requestTypeId, currentSettings.requestTypeId)
            )
          );

        let actualMax = 0;
        for (const req of allRequests) {
          if (!req.requestNumber) continue;
          const parts = req.requestNumber.split('-');
          const lastPart = parts[parts.length - 1];
          const num = parseInt(lastPart, 10);
          if (!isNaN(num) && num > actualMax) {
            actualMax = num;
          }
        }

        if (updateData.nextNumber <= actualMax) {
          throw new Error(`Cannot set next number to ${updateData.nextNumber}. The highest request number currently in the database is ${actualMax}. Please choose a number greater than ${actualMax} to prevent duplicates.`);
        }
      }
    }

    const [settings] = await db
      .update(requestTypeSettings)
      .set(updateData)
      .where(eq(requestTypeSettings.id, id))
      .returning();
    return settings;
  }

  // Work List Divisions
  async getAllWorkListDivisions(): Promise<WorkListDivision[]> {
    return await db.select().from(workListDivisions).orderBy(workListDivisions.sortOrder);
  }

  async getWorkListDivision(id: string): Promise<WorkListDivision | undefined> {
    const [division] = await db.select().from(workListDivisions).where(eq(workListDivisions.id, id));
    return division || undefined;
  }

  async createWorkListDivision(insertDivision: InsertWorkListDivision): Promise<WorkListDivision> {
    const [division] = await db
      .insert(workListDivisions)
      .values(insertDivision)
      .returning();
    return division;
  }

  // Work List Chapters
  async getAllWorkListChapters(): Promise<WorkListChapter[]> {
    return await db.select().from(workListChapters).orderBy(workListChapters.sortOrder);
  }

  async getWorkListChaptersByDivision(divisionId: string): Promise<WorkListChapter[]> {
    return await db.select().from(workListChapters).where(eq(workListChapters.divisionId, divisionId)).orderBy(workListChapters.sortOrder);
  }

  async getWorkListChapter(id: string): Promise<WorkListChapter | undefined> {
    const [chapter] = await db.select().from(workListChapters).where(eq(workListChapters.id, id));
    return chapter || undefined;
  }

  async createWorkListChapter(insertChapter: InsertWorkListChapter): Promise<WorkListChapter> {
    const [chapter] = await db
      .insert(workListChapters)
      .values(insertChapter)
      .returning();
    return chapter;
  }

  async updateWorkListChapter(id: string, updateData: UpdateWorkListChapter): Promise<WorkListChapter> {
    const existingChapter = await this.getWorkListChapter(id);
    if (!existingChapter) {
      throw new Error("Work list chapter not found");
    }

    const [chapter] = await db
      .update(workListChapters)
      .set(updateData)
      .where(eq(workListChapters.id, id))
      .returning();
    return chapter;
  }

  async deleteWorkListChapter(id: string): Promise<void> {
    await db.delete(workListChapters).where(eq(workListChapters.id, id));
  }

  // Work List Activities
  async getAllWorkListActivities(): Promise<WorkListActivity[]> {
    return await db.select().from(workListActivities).orderBy(workListActivities.sortOrder);
  }

  async getWorkListActivitiesByChapter(chapterId: string): Promise<WorkListActivity[]> {
    return await db.select().from(workListActivities).where(eq(workListActivities.chapterId, chapterId)).orderBy(workListActivities.sortOrder);
  }

  async getWorkListActivity(id: string): Promise<WorkListActivity | undefined> {
    const [activity] = await db.select().from(workListActivities).where(eq(workListActivities.id, id));
    return activity || undefined;
  }

  async createWorkListActivity(insertActivity: InsertWorkListActivity): Promise<WorkListActivity> {
    const [activity] = await db
      .insert(workListActivities)
      .values(insertActivity)
      .returning();
    return activity;
  }

  async updateWorkListActivity(id: string, updateData: UpdateWorkListActivity): Promise<WorkListActivity> {
    const existingActivity = await this.getWorkListActivity(id);
    if (!existingActivity) {
      throw new Error("Work list activity not found");
    }

    const [activity] = await db
      .update(workListActivities)
      .set(updateData)
      .where(eq(workListActivities.id, id))
      .returning();
    return activity;
  }

  async deleteWorkListActivity(id: string): Promise<void> {
    await db.delete(workListActivities).where(eq(workListActivities.id, id));
  }

  // Checklist Items
  async getAllChecklistItems(): Promise<ChecklistItem[]> {
    return await db.select().from(checklistItems).orderBy(checklistItems.sortOrder);
  }

  async getChecklistItemsByCategory(category: string): Promise<ChecklistItem[]> {
    return await db.select().from(checklistItems).where(eq(checklistItems.category, category)).orderBy(checklistItems.sortOrder);
  }

  async searchChecklistItems(query: string, category?: string): Promise<ChecklistItem[]> {
    const searchPattern = `%${query.toLowerCase()}%`;
    if (category) {
      return await db.select().from(checklistItems)
        .where(and(
          eq(checklistItems.category, category),
          sql`LOWER(${checklistItems.nameEnglish}) LIKE ${searchPattern}`
        ))
        .orderBy(checklistItems.sortOrder)
        .limit(50);
    }
    return await db.select().from(checklistItems)
      .where(sql`LOWER(${checklistItems.nameEnglish}) LIKE ${searchPattern}`)
      .orderBy(checklistItems.sortOrder)
      .limit(50);
  }

  async getChecklistItem(id: string): Promise<ChecklistItem | undefined> {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id));
    return item || undefined;
  }

  async createChecklistItem(insertItem: InsertChecklistItem): Promise<ChecklistItem> {
    const [item] = await db
      .insert(checklistItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async updateChecklistItem(id: string, updateData: UpdateChecklistItem): Promise<ChecklistItem> {
    const existingItem = await this.getChecklistItem(id);
    if (!existingItem) {
      throw new Error("Checklist item not found");
    }

    const [item] = await db
      .update(checklistItems)
      .set(updateData)
      .where(eq(checklistItems.id, id))
      .returning();
    return item;
  }

  async deleteChecklistItem(id: string): Promise<void> {
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
  }

  // Work Levels
  async getWorkLevelsByProject(projectId: string): Promise<WorkLevel[]> {
    return await db.select().from(workLevels).where(eq(workLevels.projectId, projectId)).orderBy(workLevels.sortOrder);
  }

  async getWorkLevel(id: string): Promise<WorkLevel | undefined> {
    const [level] = await db.select().from(workLevels).where(eq(workLevels.id, id));
    return level || undefined;
  }

  async createWorkLevel(insertLevel: InsertWorkLevel): Promise<WorkLevel> {
    const [level] = await db
      .insert(workLevels)
      .values(insertLevel)
      .returning();
    return level;
  }

  async updateWorkLevel(id: string, updateData: UpdateWorkLevel): Promise<WorkLevel> {
    const existingLevel = await this.getWorkLevel(id);
    if (!existingLevel) {
      throw new Error("Work level not found");
    }

    const [level] = await db
      .update(workLevels)
      .set(updateData)
      .where(eq(workLevels.id, id))
      .returning();
    return level;
  }

  async deleteWorkLevel(id: string): Promise<void> {
    await db.delete(workLevels).where(eq(workLevels.id, id));
  }

  // Deliveries
  async getDelivery(id: string): Promise<Delivery | undefined> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    return delivery || undefined;
  }

  async getDeliveriesByProject(projectId: string): Promise<(Delivery & { items: DeliveryItem[], attachment?: Document | null, linkedRequestId?: string | null, linkedRequestNumber?: string | null, supplierName?: string | null, supplierLogo?: string | null })[]> {
    const results = await db
      .select({
        delivery: deliveries,
        attachment: documents,
        requestId: requestRevisions.requestId,
        requestNumber: requests.requestNumber,
        supplierName: suppliers.supplierName,
        supplierLogo: suppliers.logoUrl,
      })
      .from(deliveries)
      .leftJoin(documents, eq(deliveries.deliveryNoteId, documents.id))
      .leftJoin(suppliers, eq(deliveries.supplierId, suppliers.id))
      .leftJoin(requestDeliveries, eq(deliveries.id, requestDeliveries.deliveryId))
      .leftJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .leftJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(eq(deliveries.projectId, projectId))
      .orderBy(desc(deliveries.createdAt));

    if (results.length === 0) return [];

    // Fetch items for all deliveries
    const deliveryIds = results.map(r => r.delivery.id);
    const allItems = await db.select().from(deliveryItems).where(inArray(deliveryItems.deliveryId, deliveryIds));

    // Use a Map to handle the join results which might have duplicates if a delivery is linked to multiple revisions
    // (though our logic should prevent multiple requests, a single request might have multiple revisions)
    const deliveryMap = new Map<string, Delivery & { items: DeliveryItem[], attachment?: Document | null, linkedRequestId?: string | null, linkedRequestNumber?: string | null, supplierName?: string | null, supplierLogo?: string | null }>();

    results.forEach(r => {
      const existing = deliveryMap.get(r.delivery.id);
      if (!existing) {
        deliveryMap.set(r.delivery.id, {
          ...r.delivery,
          attachment: r.attachment,
          linkedRequestId: r.requestId,
          linkedRequestNumber: r.requestNumber,
          supplierName: r.supplierName,
          supplierLogo: r.supplierLogo,
          items: allItems.filter(item => item.deliveryId === r.delivery.id)
        });
      } else if (r.requestId && !existing.linkedRequestId) {
        // Prefer a result that has a linked request if we find one
        existing.linkedRequestId = r.requestId;
        existing.linkedRequestNumber = r.requestNumber;
      }
    });

    return Array.from(deliveryMap.values());
  }

  async getDeliveryItems(deliveryId: string): Promise<DeliveryItem[]> {
    return await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId));
  }

  async createDeliveryWithItems(delivery: InsertDelivery, items: Omit<InsertDeliveryItem, "deliveryId">[]): Promise<Delivery & { items: DeliveryItem[] }> {
    console.log("[STORAGE] createDeliveryWithItems started", { delivery, itemCount: items.length });
    return await db.transaction(async (tx) => {
      // 1. Supplier must already exist in the project register.
      // Auto-creating one from a typed name produced near-duplicate suppliers that
      // fragmented the material/supplier history.
      const finalSupplierId = delivery.supplierId;
      if (!finalSupplierId) {
        throw new Error("يجب اختيار المورد من سجل الموردين. لم يعد يُنشأ المورد تلقائيًا من الاسم المكتوب.");
      }
      const [supplierRow] = await tx.select().from(suppliers).where(eq(suppliers.id, finalSupplierId));
      if (!supplierRow) throw new Error("المورد غير موجود");
      if (supplierRow.projectId !== delivery.projectId) {
        throw new Error("المورد لا ينتمي لهذا المشروع");
      }

      let shipmentNumber = delivery.shipmentNumber;

      // Auto-generate shipment number if not provided or empty
      if (!shipmentNumber || shipmentNumber === "" || shipmentNumber === "AUTO") {
        shipmentNumber = await nextShipmentNumber(tx, delivery.projectId);
        console.log(`[STORAGE] Generated shipment number: ${shipmentNumber}`);
      }

      const [newDelivery] = await tx.insert(deliveries).values({
        ...delivery,
        supplierId: finalSupplierId,
        shipmentNumber,
      }).returning();

      // 2. Every item must name a catalog material. Auto-creating one from free text is
      // what produced the fragmented balances ("tiles" / "Tiles" as separate materials),
      // and silently gave each new material category "General" and minStockLevel 0.
      const finalItems = [];
      for (const item of items) {
        if (!item.materialId) {
          throw new Error(
            `المادة "${item.materialName}" غير مرتبطة بالكتالوج. اختر المادة من الكتالوج أو أنشئها أولًا.`
          );
        }

        const [material] = await tx.select().from(materials).where(eq(materials.id, item.materialId));
        if (!material) throw new Error(`المادة "${item.materialName}" غير موجودة في الكتالوج`);
        if (material.projectId !== delivery.projectId) {
          throw new Error(`المادة "${material.materialName}" لا تنتمي لهذا المشروع`);
        }
        if (material.unit && item.unit && normalizeUnit(material.unit) !== normalizeUnit(item.unit)) {
          throw new Error(
            `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" والتوريد "${item.unit}"`
          );
        }

        // Keep the supplier/material link: it feeds price history and supplier lookups.
        const [existingLink] = await tx
          .select()
          .from(materialSuppliers)
          .where(and(eq(materialSuppliers.supplierId, finalSupplierId), eq(materialSuppliers.materialId, item.materialId)));
        if (!existingLink) {
          await tx.insert(materialSuppliers).values({
            supplierId: finalSupplierId,
            materialId: item.materialId,
          });
        }

        finalItems.push({ ...item, deliveryId: newDelivery.id, materialId: item.materialId });
      }

      if (finalItems.length === 0) {
        return { ...newDelivery, items: [] };
      }

      const newItems = await tx.insert(deliveryItems).values(finalItems as any).returning();

      // Post the arrival to the stock ledger in the same transaction, so a receipt
      // recorded here moves stock exactly as a purchase-order receipt does.
      if (newDelivery.warehouseId) {
        await tx.insert(stockMovements).values(
          newItems.map((it) => ({
            projectId: newDelivery.projectId,
            warehouseId: newDelivery.warehouseId!,
            materialId: it.materialId!,
            movementType: "in" as const,
            quantity: it.arrivalQuantity,
            unit: it.unit,
            sourceType: "delivery" as const,
            sourceId: newDelivery.id,
            movementDate: newDelivery.arrivalDate,
            performedBy: null,
            notes: null,
          }))
        );
      }

      return { ...newDelivery, items: newItems };
    });
  }

  async updateDelivery(id: string, updateData: UpdateDelivery): Promise<Delivery> {
    // Check if this delivery is linked to any request revision
    const linkedRequests = await db
      .select({
        requestNumber: requests.requestNumber,
        approvalStatusCode: requestRevisions.approvalStatusCode,
      })
      .from(requestDeliveries)
      .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(eq(requestDeliveries.deliveryId, id));

    const finalApprovals = linkedRequests.filter(r => r.approvalStatusCode === 'A' || r.approvalStatusCode === 'B');
    if (finalApprovals.length > 0) {
      const requestNumbers = Array.from(new Set(finalApprovals.map(r => r.requestNumber))).join(", ");
      throw new Error(`Cannot update delivery: It has already received final approval (Code A or B) in request(s): ${requestNumbers}. Records cannot be modified after final approval.`);
    }

    const [delivery] = await db
      .update(deliveries)
      .set(updateData as any)
      .where(eq(deliveries.id, id))
      .returning();
    if (!delivery) throw new Error("Delivery not found");
    return delivery;
  }

  async updateDeliveryWithItems(id: string, updateData: UpdateDelivery, items: (Omit<InsertDeliveryItem, "deliveryId"> & { id?: string })[]): Promise<Delivery & { items: DeliveryItem[] }> {
    return await db.transaction(async (tx) => {
      // Check if this delivery is linked to any request revision
      const linkedRequests = await tx
        .select({
          requestNumber: requests.requestNumber,
          approvalStatusCode: requestRevisions.approvalStatusCode,
        })
        .from(requestDeliveries)
        .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
        .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
        .where(eq(requestDeliveries.deliveryId, id));

      const finalApprovals = linkedRequests.filter(r => r.approvalStatusCode === 'A' || r.approvalStatusCode === 'B');
      if (finalApprovals.length > 0) {
        const requestNumbers = Array.from(new Set(finalApprovals.map(r => r.requestNumber))).join(", ");
        throw new Error(`Cannot update delivery: It has already received final approval (Code A or B) in request(s): ${requestNumbers}. Records cannot be modified after final approval.`);
      }

      // Supplier must come from the register; it is no longer created from a typed name.
      const finalSupplierId = updateData.supplierId;
      if (!finalSupplierId) {
        throw new Error("يجب اختيار المورد من سجل الموردين. لم يعد يُنشأ المورد تلقائيًا من الاسم المكتوب.");
      }

      // 1. Update delivery header
      const [updatedDelivery] = await tx
        .update(deliveries)
        .set({
          ...updateData,
          supplierId: finalSupplierId,
        } as any)
        .where(eq(deliveries.id, id))
        .returning();

      if (!updatedDelivery) throw new Error("Delivery not found");

      // 2. Get current items to determine what to delete
      const currentItems = await tx.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, id));
      const newItemIds = items.filter(item => item.id).map(item => item.id as string);
      const itemsToDelete = currentItems.filter(item => !newItemIds.includes(item.id));

      // 3. Delete items
      if (itemsToDelete.length > 0) {
        await tx.delete(deliveryItems).where(inArray(deliveryItems.id, itemsToDelete.map(i => i.id)));
      }

      // 4. Update or Insert items
      const finalItems: DeliveryItem[] = [];
      for (const item of items) {
        const finalMaterialId = item.materialId;
        if (!finalMaterialId) {
          throw new Error(
            `المادة "${item.materialName}" غير مرتبطة بالكتالوج. اختر المادة من الكتالوج أو أنشئها أولًا.`
          );
        }

        const [material] = await tx.select().from(materials).where(eq(materials.id, finalMaterialId));
        if (!material) throw new Error(`المادة "${item.materialName}" غير موجودة في الكتالوج`);
        if (material.projectId !== updatedDelivery.projectId) {
          throw new Error(`المادة "${material.materialName}" لا تنتمي لهذا المشروع`);
        }
        if (material.unit && item.unit && normalizeUnit(material.unit) !== normalizeUnit(item.unit)) {
          throw new Error(
            `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" والتوريد "${item.unit}"`
          );
        }

        // Ensure material is linked to supplier
        if (finalSupplierId && finalMaterialId) {
          const [existingLink] = await tx
            .select()
            .from(materialSuppliers)
            .where(and(eq(materialSuppliers.supplierId, finalSupplierId), eq(materialSuppliers.materialId, finalMaterialId)));

          if (!existingLink) {
            await tx.insert(materialSuppliers).values({
              supplierId: finalSupplierId,
              materialId: finalMaterialId,
            });
          }
        }

        if (item.id) {
          const [updatedItem] = await tx
            .update(deliveryItems)
            .set({
              materialName: item.materialName,
              materialId: finalMaterialId,
              materialDescription: item.materialDescription,
              arrivalQuantity: item.arrivalQuantity,
              unit: item.unit,
            })
            .where(eq(deliveryItems.id, item.id))
            .returning();
          finalItems.push(updatedItem);
        } else {
          const [newItem] = await tx
            .insert(deliveryItems)
            .values({
              deliveryId: id,
              materialName: item.materialName,
              materialId: finalMaterialId,
              materialDescription: item.materialDescription,
              arrivalQuantity: item.arrivalQuantity,
              unit: item.unit,
            } as any)
            .returning();
          finalItems.push(newItem);
        }
      }

      // Re-sync the ledger from the delivery's current items. These movements are derived
      // data, so delete-and-reinsert is safe here — and it must happen inside this
      // transaction, or a failure would leave the ledger drifted from the delivery.
      await tx
        .delete(stockMovements)
        .where(and(eq(stockMovements.sourceType, "delivery"), eq(stockMovements.sourceId, id)));

      if (updatedDelivery.warehouseId && finalItems.length > 0) {
        await tx.insert(stockMovements).values(
          finalItems.map((it) => ({
            projectId: updatedDelivery.projectId,
            warehouseId: updatedDelivery.warehouseId!,
            materialId: it.materialId!,
            movementType: "in" as const,
            quantity: it.arrivalQuantity,
            unit: it.unit,
            sourceType: "delivery" as const,
            sourceId: id,
            movementDate: updatedDelivery.arrivalDate,
            performedBy: null,
            notes: null,
          }))
        );
      }

      return { ...updatedDelivery, items: finalItems };
    });
  }

  async updateDeliveryItem(id: string, updateData: UpdateDeliveryItem): Promise<DeliveryItem> {
    const [item] = await db
      .update(deliveryItems)
      .set(updateData)
      .where(eq(deliveryItems.id, id))
      .returning();
    if (!item) throw new Error("Delivery item not found");
    return item;
  }

  async deleteDelivery(id: string): Promise<void> {
    // Check if this delivery is linked to any request revision
    // This prevents deleting deliveries that are part of an MIR or other request workflow
    const linkedRequests = await db
      .select({
        requestId: requests.id,
        requestNumber: requests.requestNumber,
        approvalStatusCode: requestRevisions.approvalStatusCode,
      })
      .from(requestDeliveries)
      .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(eq(requestDeliveries.deliveryId, id));

    if (linkedRequests.length > 0) {
      const requestNumbers = Array.from(new Set(linkedRequests.map(r => r.requestNumber))).join(", ");
      throw new Error(`Cannot delete delivery: It is currently linked to MIR(s): ${requestNumbers}. You must remove the link from the MIR before you can delete this delivery record.`);
    }

    // The ledger has no foreign key to deliveries (by design), so its rows must be removed
    // here, in the same transaction, or the stock balance would keep counting a deleted receipt.
    await db.transaction(async (tx) => {
      await tx
        .delete(stockMovements)
        .where(and(eq(stockMovements.sourceType, "delivery"), eq(stockMovements.sourceId, id)));
      await tx.delete(deliveries).where(eq(deliveries.id, id));
    });
  }

  async deleteDeliveryItem(id: string): Promise<void> {
    await db.delete(deliveryItems).where(eq(deliveryItems.id, id));
  }

  // Request Deliveries
  async getRequestDeliveries(revisionId: string): Promise<(RequestDelivery & { delivery: Delivery & { items: DeliveryItem[], attachment?: Document | null, supplierLogo?: string | null } })[]> {
    const results = await db
      .select({
        requestDelivery: requestDeliveries,
        delivery: deliveries,
        attachment: documents,
        supplierDetails: suppliers,
      })
      .from(requestDeliveries)
      .innerJoin(deliveries, eq(requestDeliveries.deliveryId, deliveries.id))
      .leftJoin(documents, eq(deliveries.deliveryNoteId, documents.id))
      .leftJoin(suppliers, eq(deliveries.supplierId, suppliers.id))
      .where(eq(requestDeliveries.revisionId, revisionId));

    if (results.length === 0) return [];

    const deliveryIds = results.map(r => r.delivery.id);
    const allItems = await db.select().from(deliveryItems).where(inArray(deliveryItems.deliveryId, deliveryIds));

    return results.map(r => ({
      ...r.requestDelivery,
      delivery: {
        ...r.delivery,
        supplier: r.supplierDetails?.supplierName || r.delivery.supplier,
        supplierLogo: r.supplierDetails?.logoUrl || null,
        attachment: r.attachment,
        items: allItems.filter(item => item.deliveryId === r.delivery.id)
      }
    }));
  }

  async createRequestDelivery(data: InsertRequestDelivery): Promise<RequestDelivery> {
    // Check if this delivery is already linked to a DIFFERENT request
    const [currentRevision] = await db.select().from(requestRevisions).where(eq(requestRevisions.id, data.revisionId));
    if (!currentRevision) throw new Error("Revision not found");

    const existingLinks = await db
      .select({
        requestId: requestRevisions.requestId,
        requestNumber: requests.requestNumber,
      })
      .from(requestDeliveries)
      .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(eq(requestDeliveries.deliveryId, data.deliveryId));

    const otherRequestLink = existingLinks.find(link => link.requestId !== currentRevision.requestId);
    if (otherRequestLink) {
      throw new Error(`This Delivery Note is already linked to request: ${otherRequestLink.requestNumber}`);
    }

    // Also avoid duplicate links in the same revision
    const sameRevisionLink = await db
      .select()
      .from(requestDeliveries)
      .where(and(
        eq(requestDeliveries.revisionId, data.revisionId),
        eq(requestDeliveries.deliveryId, data.deliveryId)
      ));

    if (sameRevisionLink.length > 0) {
      return sameRevisionLink[0];
    }

    const [result] = await db
      .insert(requestDeliveries)
      .values(data)
      .returning();
    return result;
  }

  async deleteRequestDeliveriesByRevision(revisionId: string): Promise<void> {
    await db.delete(requestDeliveries).where(eq(requestDeliveries.revisionId, revisionId));
  }

  // Request Suppliers
  async getRequestSuppliers(revisionId: string): Promise<(RequestSupplier & { supplier: Supplier })[]> {
    const results = await db
      .select({
        requestSupplier: requestSuppliers,
        supplier: suppliers,
      })
      .from(requestSuppliers)
      .innerJoin(suppliers, eq(requestSuppliers.supplierId, suppliers.id))
      .where(eq(requestSuppliers.revisionId, revisionId));

    return results.map(r => ({ ...r.requestSupplier, supplier: r.supplier }));
  }

  async getAssignedSupplierIdsForProject(projectId: string, excludeRequestId?: string): Promise<string[]> {
    const conditions = [
      eq(requests.projectId, projectId),
      not(eq(requests.is_deleted, true))
    ];
    if (excludeRequestId) {
      conditions.push(not(eq(requests.id, excludeRequestId)));
    }

    const results = await db
      .select({ supplierId: requestSuppliers.supplierId })
      .from(requestSuppliers)
      .innerJoin(requestRevisions, eq(requestSuppliers.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(and(...conditions));

    return Array.from(new Set(results.map(r => r.supplierId)));
  }

  async createRequestSupplier(data: InsertRequestSupplier): Promise<RequestSupplier> {
    const [result] = await db
      .insert(requestSuppliers)
      .values(data)
      .returning();
    return result;
  }

  async deleteRequestSuppliersByRevision(revisionId: string): Promise<void> {
    await db.delete(requestSuppliers).where(eq(requestSuppliers.revisionId, revisionId));
  }

  // Request Materials
  async getRequestMaterials(revisionId: string): Promise<(RequestMaterial & { material: Material })[]> {
    const results = await db
      .select({
        requestMaterial: requestMaterials,
        material: materials,
      })
      .from(requestMaterials)
      .innerJoin(materials, eq(requestMaterials.materialId, materials.id))
      .where(eq(requestMaterials.revisionId, revisionId));

    return results.map(r => ({ ...r.requestMaterial, material: r.material }));
  }

  async linkMaterialToRevision(data: InsertRequestMaterial): Promise<RequestMaterial> {
    const [result] = await db.insert(requestMaterials).values(data).returning();
    return result;
  }

  async deleteRequestMaterialsByRevision(revisionId: string): Promise<void> {
    await db.delete(requestMaterials).where(eq(requestMaterials.revisionId, revisionId));
  }

  async getAssignedMaterialIdsForProject(projectId: string, excludeRequestId?: string): Promise<string[]> {
    const conditions = [
      eq(requests.projectId, projectId),
      not(eq(requests.is_deleted, true))
    ];
    if (excludeRequestId) {
      conditions.push(not(eq(requests.id, excludeRequestId)));
    }

    const results = await db
      .select({ materialId: requestMaterials.materialId })
      .from(requestMaterials)
      .innerJoin(requestRevisions, eq(requestMaterials.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(and(...conditions));

    return Array.from(new Set(results.map(r => r.materialId)));
  }

  // Materials
  async getMaterial(id: string): Promise<Material | undefined> {
    const [material] = await db.select().from(materials).where(eq(materials.id, id));
    return material || undefined;
  }

  async getMaterialsByProject(projectId: string): Promise<(Material & { isApproved?: boolean; hasRequests?: boolean; hasSuppliers?: boolean; attachmentCount?: number })[]> {
    const mats = await db.select().from(materials).where(eq(materials.projectId, projectId)).orderBy(materials.materialName);
    
    if (mats.length === 0) return [];
    const matIds = mats.map(m => m.id);
    
    // Fetch all approved request_materials for this project
    const approvedRelations = await db
      .select({
        materialId: requestMaterials.materialId,
      })
      .from(requestMaterials)
      .innerJoin(requestRevisions, eq(requestMaterials.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(
        and(
          eq(requests.projectId, projectId),
          eq(requests.is_deleted, false),
          inArray(requestRevisions.approvalStatusCode, ['A', 'B'])
        )
      );
      
    const approvedMaterialIds = new Set(approvedRelations.map(r => r.materialId));

    // Fetch all requests relations (regardless of approval status) to determine hasRequests
    const allRequestsRelations = await db
      .select({
        materialId: requestMaterials.materialId,
      })
      .from(requestMaterials)
      .innerJoin(requestRevisions, eq(requestMaterials.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(
        and(
          eq(requests.projectId, projectId),
          eq(requests.is_deleted, false)
        )
      );
    const hasRequestsIds = new Set(allRequestsRelations.map(r => r.materialId));

    // Fetch all supplier relations for these materials
    const supplierRelations = await db
      .select({
        materialId: materialSuppliers.materialId,
      })
      .from(materialSuppliers)
      .where(inArray(materialSuppliers.materialId, matIds));
    const hasSuppliersIds = new Set(supplierRelations.map(r => r.materialId));

    // Fetch attachment relations for these materials
    const attachmentRelations = await db
      .select({
        materialId: materialAttachments.materialId,
      })
      .from(materialAttachments)
      .where(inArray(materialAttachments.materialId, matIds));
      
    const attachmentCounts = new Map<string, number>();
    attachmentRelations.forEach(r => {
      attachmentCounts.set(r.materialId, (attachmentCounts.get(r.materialId) || 0) + 1);
    });
    
    return mats.map(m => ({
      ...m,
      isApproved: approvedMaterialIds.has(m.id),
      hasRequests: hasRequestsIds.has(m.id),
      hasSuppliers: hasSuppliersIds.has(m.id),
      attachmentCount: attachmentCounts.get(m.id) || 0
    }));
  }

  async getMaterialRequests(materialId: string): Promise<any[]> {
    const results = await db
      .select({
        requestId: requests.id,
        requestNumber: requests.requestNumber,
        title: requestRevisions.title,
        currentStatus: requests.currentStatus,
        projectId: requests.projectId,
        approvalStatusCode: requestRevisions.approvalStatusCode,
      })
      .from(requestMaterials)
      .innerJoin(requestRevisions, eq(requestMaterials.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(
        and(
          eq(requestMaterials.materialId, materialId),
          eq(requests.is_deleted, false)
        )
      );

    // Get unique requests by ID
    const uniqueRequests = [];
    const seenIds = new Set();
    for (const r of results) {
      if (!seenIds.has(r.requestId)) {
        seenIds.add(r.requestId);
        uniqueRequests.push(r);
      }
    }
    return uniqueRequests;
  }

  async getAllMaterials(): Promise<Material[]> {
    return await db.select().from(materials).orderBy(materials.materialName);
  }

  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const [material] = await db.insert(materials).values(insertMaterial).returning();
    return material;
  }

  async updateMaterial(id: string, updateData: UpdateMaterial): Promise<Material> {
    const [material] = await db.update(materials).set(updateData).where(eq(materials.id, id)).returning();
    if (!material) throw new Error("Material not found");
    return material;
  }

  async deleteMaterial(id: string): Promise<void> {
    await db.delete(materials).where(eq(materials.id, id));
  }

  // Suppliers
  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier || undefined;
  }

  // Suppliers with at least one request revision approved (A / B)
  private async withSupplierApproval(list: Supplier[]): Promise<(Supplier & { isApproved: boolean })[]> {
    if (list.length === 0) return [];
    const rows = await db
      .select({ supplierId: requestSuppliers.supplierId })
      .from(requestSuppliers)
      .innerJoin(requestRevisions, eq(requestSuppliers.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .where(
        and(
          eq(requests.is_deleted, false),
          inArray(requestSuppliers.supplierId, list.map((s) => s.id)),
          inArray(requestRevisions.approvalStatusCode, ['A', 'B'])
        )
      );
    const approved = new Set(rows.map((r) => r.supplierId));
    return list.map((s) => ({ ...s, isApproved: approved.has(s.id) }));
  }

  async getSuppliersByProject(projectId: string): Promise<Supplier[]> {
    const list = await db.select().from(suppliers).where(eq(suppliers.projectId, projectId)).orderBy(suppliers.supplierName);
    return await this.withSupplierApproval(list);
  }

  async getAllSuppliers(): Promise<Supplier[]> {
    const list = await db.select().from(suppliers).orderBy(suppliers.supplierName);
    return await this.withSupplierApproval(list);
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const [supplier] = await db.insert(suppliers).values(insertSupplier).returning();
    return supplier;
  }

  async updateSupplier(id: string, updateData: UpdateSupplier): Promise<Supplier> {
    const [supplier] = await db.update(suppliers).set(updateData).where(eq(suppliers.id, id)).returning();
    if (!supplier) throw new Error("Supplier not found");
    return supplier;
  }

  async deleteSupplier(id: string): Promise<void> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
  }

  // Supplier Attachments
  async getSupplierAttachments(supplierId: string): Promise<(SupplierAttachment & { document: Document })[]> {
    const results = await db
      .select({
        attachment: supplierAttachments,
        document: documents,
      })
      .from(supplierAttachments)
      .innerJoin(documents, eq(supplierAttachments.documentId, documents.id))
      .where(eq(supplierAttachments.supplierId, supplierId));

    return results.map(r => ({ ...r.attachment, document: r.document })) as any;
  }

  async createSupplierAttachment(data: InsertSupplierAttachment): Promise<SupplierAttachment> {
    const [attachment] = await db
      .insert(supplierAttachments)
      .values(data)
      .returning();
    return attachment;
  }

  async deleteSupplierAttachment(id: string): Promise<void> {
    await db.delete(supplierAttachments).where(eq(supplierAttachments.id, id));
  }

  // Material Attachments
  async getMaterialAttachments(materialId: string): Promise<(MaterialAttachment & { document: Document })[]> {
    const results = await db
      .select({
        attachment: materialAttachments,
        document: documents,
      })
      .from(materialAttachments)
      .innerJoin(documents, eq(materialAttachments.documentId, documents.id))
      .where(eq(materialAttachments.materialId, materialId));

    return results.map(r => ({ ...r.attachment, document: r.document })) as any;
  }

  async createMaterialAttachment(data: InsertMaterialAttachment): Promise<MaterialAttachment> {
    const [attachment] = await db
      .insert(materialAttachments)
      .values(data)
      .returning();
    return attachment;
  }

  async deleteMaterialAttachment(id: string): Promise<void> {
    await db.delete(materialAttachments).where(eq(materialAttachments.id, id));
  }

  // ==========================================
  // Warehouses
  // ==========================================

  async getWarehouse(id: string): Promise<Warehouse | undefined> {
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return warehouse || undefined;
  }

  async getWarehousesByProject(projectId: string): Promise<(Warehouse & { materialCount: number; movementCount: number })[]> {
    const rows = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.projectId, projectId))
      .orderBy(desc(warehouses.isDefault), warehouses.name);

    if (rows.length === 0) return [];

    const stats = await db
      .select({
        warehouseId: stockMovements.warehouseId,
        materialCount: sql<number>`COUNT(DISTINCT ${stockMovements.materialId})::int`,
        movementCount: sql<number>`COUNT(*)::int`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.projectId, projectId))
      .groupBy(stockMovements.warehouseId);

    const statsByWarehouse = new Map(stats.map((s) => [s.warehouseId, s]));

    return rows.map((w) => ({
      ...w,
      materialCount: statsByWarehouse.get(w.id)?.materialCount ?? 0,
      movementCount: statsByWarehouse.get(w.id)?.movementCount ?? 0,
    }));
  }

  async getDefaultWarehouse(projectId: string): Promise<Warehouse | undefined> {
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.projectId, projectId), eq(warehouses.isDefault, true)));
    return warehouse || undefined;
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    return await db.transaction(async (tx) => {
      // The partial unique index allows only one default per project, so clear the old one first.
      if (warehouse.isDefault) {
        await tx
          .update(warehouses)
          .set({ isDefault: false })
          .where(and(eq(warehouses.projectId, warehouse.projectId), eq(warehouses.isDefault, true)));
      }
      const [created] = await tx.insert(warehouses).values(warehouse).returning();
      return created;
    });
  }

  async updateWarehouse(id: string, updateData: UpdateWarehouse): Promise<Warehouse> {
    return await db.transaction(async (tx) => {
      if (updateData.isDefault) {
        const [current] = await tx.select().from(warehouses).where(eq(warehouses.id, id));
        if (!current) throw new Error("المستودع غير موجود");
        await tx
          .update(warehouses)
          .set({ isDefault: false })
          .where(and(eq(warehouses.projectId, current.projectId), eq(warehouses.isDefault, true)));
      }
      const [warehouse] = await tx.update(warehouses).set(updateData).where(eq(warehouses.id, id)).returning();
      if (!warehouse) throw new Error("المستودع غير موجود");
      return warehouse;
    });
  }

  async deleteWarehouse(id: string): Promise<void> {
    const [movement] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.warehouseId, id))
      .limit(1);
    if (movement) {
      throw new Error("لا يمكن حذف المستودع لأنه يحتوي على حركات مخزون. حوّل محتوياته أولًا أو اجعله غير نشط.");
    }
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    if (warehouse?.isDefault) {
      throw new Error("لا يمكن حذف المستودع الافتراضي. اجعل مستودعًا آخر افتراضيًا أولًا.");
    }
    await db.delete(warehouses).where(eq(warehouses.id, id));
  }

  // ==========================================
  // Stock - balances are derived from the ledger on every read, never stored.
  // ==========================================

  async getStockBalances(projectId: string, warehouseId?: string): Promise<StockBalance[]> {
    const inTypes = STOCK_IN_TYPES as readonly string[];
    const signedQuantity = sql<string>`SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN ${stockMovements.quantity} ELSE -${stockMovements.quantity} END)`;
    const inQuantity = sql<string>`SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN ${stockMovements.quantity} ELSE 0 END)`;
    const outQuantity = sql<string>`SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN 0 ELSE ${stockMovements.quantity} END)`;

    // Scoping to one warehouse keeps the warehouse on each row; otherwise rows roll up per material.
    const groupByWarehouse = !!warehouseId;

    const conditions = [eq(stockMovements.projectId, projectId)];
    if (warehouseId) conditions.push(eq(stockMovements.warehouseId, warehouseId));

    const rows = await db
      .select({
        materialId: stockMovements.materialId,
        warehouseId: groupByWarehouse ? stockMovements.warehouseId : sql<string | null>`NULL`,
        warehouseName: groupByWarehouse ? warehouses.name : sql<string | null>`NULL`,
        totalIn: inQuantity,
        totalOut: outQuantity,
        balance: signedQuantity,
        unit: sql<string>`MIN(${stockMovements.unit})`,
        // Normalised the same way as the write-time check, so a material moved as both
        // "PCs" and "pcs" is not reported as a unit conflict.
        distinctUnits: sql<number>`COUNT(DISTINCT LOWER(BTRIM(${stockMovements.unit})))::int`,
        materialName: materials.materialName,
        materialCode: materials.materialCode,
        category: materials.category,
        catalogUnit: materials.unit,
        minStockLevel: materials.minStockLevel,
        requiresIssueApproval: materials.requiresIssueApproval,
      })
      .from(stockMovements)
      .innerJoin(materials, eq(stockMovements.materialId, materials.id))
      .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .where(and(...conditions))
      .groupBy(
        stockMovements.materialId,
        materials.materialName,
        materials.materialCode,
        materials.category,
        materials.unit,
        materials.minStockLevel,
        materials.requiresIssueApproval,
        ...(groupByWarehouse ? [stockMovements.warehouseId, warehouses.name] : [])
      )
      .orderBy(materials.materialName);

    return rows.map((r) => {
      const balance = parseFloat(r.balance ?? "0");
      return {
        materialId: r.materialId,
        materialName: r.materialName,
        materialCode: r.materialCode,
        category: r.category,
        unit: r.catalogUnit || r.unit,
        warehouseId: r.warehouseId ?? null,
        warehouseName: r.warehouseName ?? null,
        totalIn: parseFloat(r.totalIn ?? "0"),
        totalOut: parseFloat(r.totalOut ?? "0"),
        balance,
        minStockLevel: r.minStockLevel,
        // minStockLevel of 0 means "untracked", so a zero balance is not a shortage.
        isLowStock: r.minStockLevel > 0 && balance < r.minStockLevel,
        requiresIssueApproval: r.requiresIssueApproval,
        hasUnitConflict: r.distinctUnits > 1,
      };
    });
  }

  async getLowStockMaterials(projectId: string): Promise<StockBalance[]> {
    const balances = await this.getStockBalances(projectId);
    return balances.filter((b) => b.isLowStock);
  }

  // Everything needed to render a batch of request forms, fetched as a handful of grouped
  // queries instead of one round trip per request. The naive shape (loading each request
  // the way the detail page does) would be ~25 queries per form; this is 11 in total.
  async getRequestFormsExportData(
    projectId: string,
    typeCode: string,
    filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number } = {}
  ): Promise<any> {
    const [type] = await db.select().from(requestTypes).where(eq(requestTypes.code, typeCode));
    if (!type) throw new Error(`نوع الطلب "${typeCode}" غير موجود`);

    const conditions = [
      eq(requests.projectId, projectId),
      eq(requests.requestTypeId, type.id),
      eq(requests.is_deleted, false),
    ];
    if (filters.dateFrom) conditions.push(gte(requests.createdAt, filters.dateFrom as any));
    if (filters.dateTo) conditions.push(lte(requests.createdAt, filters.dateTo as any));
    if (filters.status) conditions.push(eq(requests.currentStatus, filters.status));

    const reqRows = await db
      .select()
      .from(requests)
      .where(and(...conditions))
      .orderBy(desc(requests.createdAt))
      .limit(filters.limit ?? 200);

    // The form header prints the project and the three organisations, so they ship with
    // the batch rather than being fetched per form.
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    const orgIds = Array.from(
      new Set([project?.organizationId, project?.contractorId, project?.consultantId].filter(Boolean) as string[])
    );
    const orgs = orgIds.length ? await db.select().from(organizations).where(inArray(organizations.id, orgIds)) : [];
    const checklist = await db.select().from(checklistItems);

    // The form prints each signer's position. teamMembers holds it, linked to the user
    // through userTeamMembers, so resolve it once for the whole batch.
    const allUsers = await db.select().from(users);
    const userPositions = await db
      .select({ userId: userTeamMembers.userId, position: teamMembers.position })
      .from(userTeamMembers)
      .innerJoin(teamMembers, eq(userTeamMembers.teamMemberId, teamMembers.id));
    const positionByUser = new Map<string, string>();
    for (const row of userPositions) {
      if (row.position && !positionByUser.has(row.userId)) positionByUser.set(row.userId, row.position);
    }

    // Activity → chapter → division, which the header prints as the activity code line.
    const activities_ = await db.select().from(workListActivities);
    const chapters_ = await db.select().from(workListChapters);
    const divisions_ = await db.select().from(workListDivisions);

    const context = {
      project,
      developer: orgs.find((o) => o.id === project?.organizationId) ?? null,
      contractor: orgs.find((o) => o.id === project?.contractorId) ?? null,
      consultant: orgs.find((o) => o.id === project?.consultantId) ?? null,
      checklistItems: checklist,
      users: allUsers.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        fullNameArabic: u.fullNameArabic,
        username: u.username,
        signature: u.signature,
        position: positionByUser.get(u.id) ?? "",
      })),
      workListActivities: activities_,
      workListChapters: chapters_,
      workListDivisions: divisions_,
    };

    if (reqRows.length === 0) {
      return { ...context, requests: [], revisions: [], documents: [], attachments: [], locations: [],
        checklistResponses: [], purposes: [], statusHistory: [], consultantReviews: [],
        materials: [], suppliers: [], deliveries: [] };
    }

    const requestIds = reqRows.map((r) => r.id);
    const allRevisions = await db
      .select()
      .from(requestRevisions)
      .where(inArray(requestRevisions.requestId, requestIds));

    // Only the current revision of each request is exported: earlier revisions are
    // superseded drafts, and including them would multiply the output for no benefit.
    const currentByRequest = new Map<string, any>();
    for (const rev of allRevisions) {
      const existing = currentByRequest.get(rev.requestId);
      if (!existing || (rev.revisionNo ?? 0) > (existing.revisionNo ?? 0)) {
        currentByRequest.set(rev.requestId, rev);
      }
    }
    const revisions = Array.from(currentByRequest.values());
    const revisionIds = revisions.map((r) => r.id);
    if (revisionIds.length === 0) revisionIds.push("-");

    const [
      documents_, attachments, locations, checklistResponses, purposes,
      statusHistory, consultantReviews, materials_, suppliers_, deliveries_,
    ] = await Promise.all([
      db.select().from(requestDocuments).where(inArray(requestDocuments.revisionId, revisionIds)),
      db.select().from(requestAttachments).where(inArray(requestAttachments.revisionId, revisionIds)),
      db.select().from(requestWorkLocations).where(inArray(requestWorkLocations.revisionId, revisionIds)),
      db.select().from(revisionChecklistResponses).where(inArray(revisionChecklistResponses.revisionId, revisionIds)),
      db.select().from(requestPurposes).where(inArray(requestPurposes.revisionId, revisionIds)),
      db.select().from(requestStatusHistory).where(inArray(requestStatusHistory.revisionId, revisionIds)),
      db.select().from(requestConsultantReviews).where(inArray(requestConsultantReviews.revisionId, revisionIds)),
      // These three must arrive in the shape the form expects: it reads rd.delivery.items,
      // rs.supplier.supplierName and rm.material.* without guards, so raw junction rows
      // would crash the render.
      db
        .select({ link: requestMaterials, material: materials })
        .from(requestMaterials)
        .leftJoin(materials, eq(requestMaterials.materialId, materials.id))
        .where(inArray(requestMaterials.revisionId, revisionIds)),
      db
        .select({ link: requestSuppliers, supplier: suppliers })
        .from(requestSuppliers)
        .leftJoin(suppliers, eq(requestSuppliers.supplierId, suppliers.id))
        .where(inArray(requestSuppliers.revisionId, revisionIds)),
      db
        .select({ link: requestDeliveries, delivery: deliveries })
        .from(requestDeliveries)
        .leftJoin(deliveries, eq(requestDeliveries.deliveryId, deliveries.id))
        .where(inArray(requestDeliveries.revisionId, revisionIds)),
    ]);

    const deliveryIds = deliveries_.map((d: any) => d.delivery?.id).filter(Boolean);
    const deliveryLines = deliveryIds.length
      ? await db.select().from(deliveryItems).where(inArray(deliveryItems.deliveryId, deliveryIds))
      : [];

    // The MIR form prints each delivery note document on its own page, reading
    // rd.delivery.attachment — without it that whole section silently disappears.
    const noteIds = deliveries_.map((d: any) => d.delivery?.deliveryNoteId).filter(Boolean);
    const noteDocs = noteIds.length
      ? await db.select().from(documents).where(inArray(documents.id, noteIds))
      : [];

    return {
      ...context,
      requestType: type,
      requests: reqRows,
      revisions,
      attachments,
      locations,
      checklistResponses,
      purposes,
      documents: documents_,
      statusHistory,
      consultantReviews,
      materials: materials_.map((r: any) => ({ ...r.link, material: r.material })),
      suppliers: suppliers_.map((r: any) => ({ ...r.link, supplier: r.supplier })),
      // items defaults to [] so the form's unguarded rd.delivery.items.some() is safe even
      // when the delivery row was removed.
      deliveries: deliveries_.map((r: any) => ({
        ...r.link,
        delivery: r.delivery
          ? {
              ...r.delivery,
              items: deliveryLines.filter((l) => l.deliveryId === r.delivery.id),
              attachment: noteDocs.find((d) => d.id === r.delivery.deliveryNoteId) ?? null,
            }
          : { items: [], attachment: null },
      })),
    };
  }

  // Which materials have only just dropped below their minimum as a result of the changes
  // that were applied. The previous balance is derived by reversing the delta, so no
  // "before" snapshot has to be taken around every write.
  //
  // Crossing-only by design: alerting on every movement while a material sits below its
  // minimum turns the alert into noise that gets ignored. It re-arms by itself once the
  // balance returns above the threshold.
  async getLowStockCrossings(
    projectId: string,
    changes: { materialId: string; delta: number }[]
  ): Promise<StockBalance[]> {
    if (changes.length === 0) return [];

    const totals = new Map<string, number>();
    for (const c of changes) {
      totals.set(c.materialId, (totals.get(c.materialId) ?? 0) + c.delta);
    }

    const balances = await this.getStockBalances(projectId);
    return balances.filter((b) => {
      const delta = totals.get(b.materialId);
      if (delta === undefined || delta >= 0) return false;
      if (b.minStockLevel <= 0) return false;
      const previous = b.balance - delta;
      return b.balance < b.minStockLevel && previous >= b.minStockLevel;
    });
  }

  async getStockMovements(projectId: string, filters: StockMovementFilters = {}): Promise<EnrichedStockMovement[]> {
    const conditions = [eq(stockMovements.projectId, projectId)];
    if (filters.warehouseId) conditions.push(eq(stockMovements.warehouseId, filters.warehouseId));
    if (filters.materialId) conditions.push(eq(stockMovements.materialId, filters.materialId));
    if (filters.movementType) conditions.push(eq(stockMovements.movementType, filters.movementType));
    if (filters.sourceType) conditions.push(eq(stockMovements.sourceType, filters.sourceType));
    if (filters.dateFrom) conditions.push(gte(stockMovements.movementDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(stockMovements.movementDate, filters.dateTo));

    const rows = await db
      .select({
        movement: stockMovements,
        materialName: materials.materialName,
        materialCode: materials.materialCode,
        warehouseName: warehouses.name,
        performedByName: users.fullName,
      })
      .from(stockMovements)
      .innerJoin(materials, eq(stockMovements.materialId, materials.id))
      .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .leftJoin(users, eq(stockMovements.performedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(stockMovements.movementDate), desc(stockMovements.createdAt))
      .limit(filters.limit ?? 500);

    return rows.map((r) => ({
      ...r.movement,
      materialName: r.materialName,
      materialCode: r.materialCode,
      warehouseName: r.warehouseName,
      performedByName: r.performedByName ?? null,
      direction: stockDirection(r.movement.movementType),
    }));
  }

  // Material Suppliers
  async getMaterialSuppliers(materialId: string): Promise<(MaterialSupplier & { supplier: Supplier })[]> {
    const results = await db
      .select({
        link: materialSuppliers,
        supplier: suppliers,
      })
      .from(materialSuppliers)
      .innerJoin(suppliers, eq(materialSuppliers.supplierId, suppliers.id))
      .where(eq(materialSuppliers.materialId, materialId));

    return results.map(r => ({ ...r.link, supplier: r.supplier }));
  }

  async getSupplierMaterials(supplierId: string): Promise<(MaterialSupplier & { material: Material, totalDelivered?: number })[]> {
    const results = await db
      .select({
        link: materialSuppliers,
        material: materials,
      })
      .from(materialSuppliers)
      .innerJoin(materials, eq(materialSuppliers.materialId, materials.id))
      .where(eq(materialSuppliers.supplierId, supplierId));

    // Get list of delivery IDs that are linked to requests whose current revision is rejected (C, D, or E)
    const currentRevs = alias(requestRevisions, "current_revs");
    const rejectedDeliveries = await db
      .select({ deliveryId: requestDeliveries.deliveryId })
      .from(requestDeliveries)
      .innerJoin(requestRevisions, eq(requestDeliveries.revisionId, requestRevisions.id))
      .innerJoin(requests, eq(requestRevisions.requestId, requests.id))
      .innerJoin(currentRevs, eq(requests.currentRevisionId, currentRevs.id))
      .where(inArray(currentRevs.approvalStatusCode, ['C', 'D', 'E']));

    const rejectedIds = rejectedDeliveries.map(d => d.deliveryId).filter(Boolean);

    // Fetch total delivered quantity for each material
    // We exclude deliveries that are in the rejectedIds list
    const deliveryTotals = await db
      .select({
        materialId: deliveryItems.materialId,
        total: sql<number>`SUM(CAST(${deliveryItems.arrivalQuantity} AS numeric))`
      })
      .from(deliveryItems)
      .innerJoin(deliveries, eq(deliveryItems.deliveryId, deliveries.id))
      .where(and(
        eq(deliveries.supplierId, supplierId),
        rejectedIds.length > 0 ? not(inArray(deliveries.id, rejectedIds)) : undefined
      ))
      .groupBy(deliveryItems.materialId);

    const totalMap = new Map(deliveryTotals.map(t => [t.materialId, Number(t.total) || 0]));

    return results.map(r => ({
      ...r.link,
      material: r.material,
      totalDelivered: totalMap.get(r.material.id) || 0
    }));
  }

  async createMaterialSupplier(data: InsertMaterialSupplier): Promise<MaterialSupplier> {
    const [result] = await db.insert(materialSuppliers).values(data).returning();
    return result;
  }

  async updateMaterialSupplier(id: string, updateData: Partial<InsertMaterialSupplier>): Promise<MaterialSupplier> {
    const [result] = await db
      .update(materialSuppliers)
      .set(updateData)
      .where(eq(materialSuppliers.id, id))
      .returning();
    if (!result) throw new Error("Link not found");
    return result;
  }

  async deleteMaterialSupplier(id: string): Promise<void> {
    await db.delete(materialSuppliers).where(eq(materialSuppliers.id, id));
  }

  // Users
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updateData: UpdateUser): Promise<User> {
    const existingUser = await this.getUser(id);
    if (!existingUser) {
      throw new Error("User not found");
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<User> {
    const existingUser = await this.getUser(id);
    if (!existingUser) {
      throw new Error("User not found");
    }

    const [user] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getUsersSignatures(userIds: string[]): Promise<{ id: string, signature: string | null }[]> {
    if (userIds.length === 0) return [];
    return await db
      .select({ id: users.id, signature: users.signature })
      .from(users)
      .where(inArray(users.id, userIds));
  }

  // Password Reset Tokens
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)));
    return token || undefined;
  }

  async markTokenAsUsed(id: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(passwordResetTokens.id, id));
  }

  async deleteExpiredTokens(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
  }

  async deleteUserTokens(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  // Organization Invitations
  async createOrganizationInvitation(invitation: InsertOrganizationInvitation): Promise<OrganizationInvitation> {
    const [created] = await db
      .insert(organizationInvitations)
      .values(invitation)
      .returning();
    return created;
  }

  async getOrganizationInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.tokenHash, tokenHash));
    return invitation || undefined;
  }

  async getOrganizationInvitationsByInviter(invitingOrganizationId: string): Promise<OrganizationInvitation[]> {
    return await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.invitingOrganizationId, invitingOrganizationId))
      .orderBy(desc(organizationInvitations.createdAt));
  }

  async getOrganizationInvitation(id: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, id));
    return invitation || undefined;
  }

  // At most one invitation can be outstanding for a role on a project
  async getPendingInvitationForRole(projectId: string, role: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.projectId, projectId),
        eq(organizationInvitations.role, role),
        eq(organizationInvitations.status, "pending"),
      ));
    return invitation || undefined;
  }

  // What the project pages show as "waiting for X to accept"
  async getPendingInvitationsForProjects(projectIds: string[]): Promise<OrganizationInvitation[]> {
    if (projectIds.length === 0) return [];
    return await db
      .select()
      .from(organizationInvitations)
      .where(and(
        inArray(organizationInvitations.projectId, projectIds),
        eq(organizationInvitations.status, "pending"),
      ));
  }

  // What an invited organization has waiting for an answer
  async getPendingInvitationsForOrganizations(organizationIds: string[]): Promise<OrganizationInvitation[]> {
    if (organizationIds.length === 0) return [];
    return await db
      .select()
      .from(organizationInvitations)
      .where(and(
        inArray(organizationInvitations.invitedOrganizationId, organizationIds),
        eq(organizationInvitations.status, "pending"),
      ))
      .orderBy(desc(organizationInvitations.createdAt));
  }

  async revokeOrganizationInvitation(id: string, invitingOrganizationId: string): Promise<OrganizationInvitation | undefined> {
    // Scoped to the inviter, and only while still pending: an accepted invitation is a
    // standing relationship and is not undone by revoking the link that created it.
    const [revoked] = await db
      .update(organizationInvitations)
      .set({ status: "revoked" })
      .where(and(
        eq(organizationInvitations.id, id),
        eq(organizationInvitations.invitingOrganizationId, invitingOrganizationId),
        eq(organizationInvitations.status, "pending"),
      ))
      .returning();
    return revoked || undefined;
  }

  // Who can answer on an organization's behalf, and therefore who gets notified when it
  // is invited to a project.
  async getOrganizationAdminUserIds(organizationId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ userId: users.id })
      .from(users)
      .innerJoin(userTeamMembers, eq(userTeamMembers.userId, users.id))
      .innerJoin(teamMembers, eq(teamMembers.id, userTeamMembers.teamMemberId))
      .where(and(
        eq(teamMembers.organizationId, organizationId),
        inArray(users.role, ["org_admin", "developer_admin"]),
        eq(users.isActive, true),
      ));
    return rows.map(row => row.userId);
  }

  // Every organization the user administers, used when answering an invitation so the
  // system never assumes which one they mean.
  async getUserAdministeredOrganizationIds(userId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ organizationId: teamMembers.organizationId })
      .from(teamMembers)
      .innerJoin(userTeamMembers, eq(userTeamMembers.teamMemberId, teamMembers.id))
      .where(and(
        eq(userTeamMembers.userId, userId),
        isNotNull(teamMembers.organizationId),
      ));
    return rows.map(row => row.organizationId).filter((id): id is string => !!id);
  }

  // Used to undo an invitation whose email never went out, so no unusable row is left
  // behind holding the address against a later retry.
  async deleteOrganizationInvitation(id: string): Promise<void> {
    await db.delete(organizationInvitations).where(eq(organizationInvitations.id, id));
  }

  // Organizations this one has a working relationship with: anyone it shares a project
  // with, plus anyone it currently has an invitation out to. Sharing a project is the
  // real relationship; the invitation covers the gap before the first one is accepted.
  async getLinkedOrganizationIds(organizationId: string): Promise<string[]> {
    const linked = new Set<string>();

    const sharedProjects = await db
      .select({
        developerId: projects.organizationId,
        contractorId: projects.contractorId,
        consultantId: projects.consultantId,
      })
      .from(projects)
      .where(or(
        eq(projects.organizationId, organizationId),
        eq(projects.contractorId, organizationId),
        eq(projects.consultantId, organizationId),
      ));
    for (const row of sharedProjects) {
      for (const id of [row.developerId, row.contractorId, row.consultantId]) {
        if (id && id !== organizationId) linked.add(id);
      }
    }

    // Invitations this organization sent and that are still live, so an invited
    // contractor is visible to the developer while it makes up its mind.
    const invited = await db
      .select({
        invitedId: organizationInvitations.invitedOrganizationId,
        acceptedId: organizationInvitations.acceptedOrganizationId,
      })
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.invitingOrganizationId, organizationId),
        inArray(organizationInvitations.status, ["pending", "accepted"]),
      ));
    for (const row of invited) {
      for (const id of [row.invitedId, row.acceptedId]) {
        if (id && id !== organizationId) linked.add(id);
      }
    }

    return Array.from(linked);
  }

  // Accepting is what actually assigns the organization to the project. The invitation is
  // claimed with a conditional update first, so two admins answering at the same moment
  // cannot both get through, and the project field is written in the same transaction.
  async acceptProjectInvitation(
    invitationId: string,
    organizationId: string,
    userId: string,
  ): Promise<OrganizationInvitation> {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(organizationInvitations)
        .set({
          status: "accepted",
          acceptedOrganizationId: organizationId,
          acceptedAt: new Date().toISOString(),
          respondedByUserId: userId,
        })
        .where(and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.status, "pending"),
        ))
        .returning();
      if (!claimed) {
        throw new Error("INVITATION_ALREADY_ANSWERED");
      }

      if (claimed.projectId) {
        const assignment = claimed.role === "consultant"
          ? { consultantId: organizationId }
          : { contractorId: organizationId };
        await tx
          .update(projects)
          .set(assignment)
          .where(eq(projects.id, claimed.projectId));
      }

      return claimed;
    });
  }

  // Rejecting changes nothing about the project: it was never assigned in the first
  // place, which is the whole point of holding the assignment back until acceptance.
  async rejectProjectInvitation(invitationId: string, userId: string): Promise<OrganizationInvitation | undefined> {
    const [rejected] = await db
      .update(organizationInvitations)
      .set({
        status: "rejected",
        acceptedAt: new Date().toISOString(),
        respondedByUserId: userId,
      })
      .where(and(
        eq(organizationInvitations.id, invitationId),
        eq(organizationInvitations.status, "pending"),
      ))
      .returning();
    return rejected || undefined;
  }

  // The whole acceptance happens in one transaction: the organization, its first team
  // member, the admin user and the link between them, plus the invitation being consumed.
  // The invitation is claimed first with a conditional update, so two requests racing on
  // the same link cannot both get through.
  async acceptOrganizationInvitation(params: AcceptInvitationParams): Promise<{ organization: Organization; user: User }> {
    return await db.transaction(async (tx) => {
      // Burning the token is what makes the link single-use. The invitation stays
      // pending on purpose: registering is not the same as agreeing to the project, and
      // the new admin answers it explicitly after signing in.
      const [claimed] = await tx
        .update(organizationInvitations)
        .set({ tokenHash: null })
        .where(and(
          eq(organizationInvitations.id, params.invitationId),
          eq(organizationInvitations.status, "pending"),
          isNotNull(organizationInvitations.tokenHash),
        ))
        .returning();
      if (!claimed) {
        throw new Error("INVITATION_ALREADY_USED");
      }

      const [organization] = await tx
        .insert(organizations)
        .values({
          name: params.organization.name,
          nameArabic: params.organization.nameArabic || null,
          email: params.email,
          phone: params.organization.phone,
          address: params.organization.address || null,
          // Taken from the invitation, never from the submitted payload
          sectorType: params.sectorType,
          vatNumber: params.organization.vatNumber || null,
          ccrNumber: params.organization.ccrNumber,
          logo: params.organization.logo || null,
        })
        .returning();

      const [teamMember] = await tx
        .insert(teamMembers)
        .values({
          name: params.admin.fullName,
          nameArabic: params.admin.fullNameArabic || null,
          email: params.email,
          position: "Organization Admin",
          organizationId: organization.id,
        })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({
          username: params.admin.username,
          email: params.email,
          password: params.admin.hashedPassword,
          fullName: params.admin.fullName,
          fullNameArabic: params.admin.fullNameArabic || null,
          phone: params.admin.phone || null,
          role: "org_admin",
          isActive: true,
        })
        .returning();

      // How the rest of the system resolves a user's organization
      await tx.insert(userTeamMembers).values({
        userId: user.id,
        teamMemberId: teamMember.id,
      });

      // The invitation now knows which organization it is waiting on
      await tx
        .update(organizationInvitations)
        .set({ invitedOrganizationId: organization.id })
        .where(eq(organizationInvitations.id, claimed.id));

      return { organization, user };
    });
  }

  // Purposes
  async getAllPurposes(): Promise<Purpose[]> {
    return await db.select().from(purposes).orderBy(purposes.sortOrder);
  }

  async getPurpose(id: string): Promise<Purpose | undefined> {
    const [purpose] = await db.select().from(purposes).where(eq(purposes.id, id));
    return purpose || undefined;
  }

  async createPurpose(insertPurpose: InsertPurpose): Promise<Purpose> {
    const [purpose] = await db
      .insert(purposes)
      .values(insertPurpose)
      .returning();
    return purpose;
  }

  async updatePurpose(id: string, updateData: UpdatePurpose): Promise<Purpose> {
    const existingPurpose = await this.getPurpose(id);
    if (!existingPurpose) {
      throw new Error("Purpose not found");
    }

    const [purpose] = await db
      .update(purposes)
      .set(updateData)
      .where(eq(purposes.id, id))
      .returning();
    return purpose;
  }

  async deletePurpose(id: string): Promise<void> {
    await db.delete(purposes).where(eq(purposes.id, id));
  }

  // Positions
  async getAllPositions(): Promise<Position[]> {
    return await db.select().from(positions);
  }

  async getPosition(id: string): Promise<Position | undefined> {
    const [position] = await db.select().from(positions).where(eq(positions.id, id));
    return position || undefined;
  }

  async createPosition(insertPosition: InsertPosition): Promise<Position> {
    const [position] = await db
      .insert(positions)
      .values(insertPosition)
      .returning();
    return position;
  }

  async updatePosition(id: string, updateData: UpdatePosition): Promise<Position> {
    const existingPosition = await this.getPosition(id);
    if (!existingPosition) {
      throw new Error("Position not found");
    }

    const [position] = await db
      .update(positions)
      .set(updateData)
      .where(eq(positions.id, id))
      .returning();
    return position;
  }

  async deletePosition(id: string): Promise<void> {
    await db.delete(positions).where(eq(positions.id, id));
  }

  // Request Types
  async getAllRequestTypes(): Promise<any[]> {
    return await db.select().from(requestTypes).orderBy(requestTypes.name_english);
  }

  async getRequestType(id: string): Promise<any | undefined> {
    const [type] = await db.select().from(requestTypes).where(eq(requestTypes.id, id));
    return type || undefined;
  }

  async createRequestType(data: any): Promise<any> {
    if (!data.id_number) {
      const [result] = await db.select({ max: max(requestTypes.id_number) }).from(requestTypes);
      data.id_number = (result?.max || 0) + 1;
    }
    const [type] = await db
      .insert(requestTypes)
      .values(data)
      .returning();
    return type;
  }

  async updateRequestType(id: string, data: any): Promise<any> {
    const [type] = await db
      .update(requestTypes)
      .set(data)
      .where(eq(requestTypes.id, id))
      .returning();
    return type;
  }

  async deleteRequestType(id: string): Promise<void> {
    await db.delete(requestTypes).where(eq(requestTypes.id, id));
  }

  // WIR Requests
  async getAllRequests(): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]> {
    const result = await db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        referenceCode: requests.referenceCode,
        requestTypeId: requests.requestTypeId,
        projectId: requests.projectId,
        contractorId: requests.contractorId,
        consultantId: requests.consultantId,
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
      .where(eq(requests.is_deleted, false))
      .orderBy(desc(requests.createdAt));

    return result as any;
  }

  async getRequest(id: string): Promise<Request | undefined> {
    const [request] = await db.select().from(requests).where(eq(requests.id, id));
    return request || undefined;
  }

  async getRequestsByProject(projectId: string): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null })[]> {
    const result = await db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        referenceCode: requests.referenceCode,
        requestTypeId: requests.requestTypeId,
        projectId: requests.projectId,
        contractorId: requests.contractorId,
        consultantId: requests.consultantId,
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
      .where(and(eq(requests.projectId, projectId), eq(requests.is_deleted, false)))
      .orderBy(desc(requests.createdAt));

    return result as any;
  }

  async createRequest(data: InsertRequest): Promise<Request> {
    return await db.transaction(async (tx) => {
      // If requestNumber is not provided, auto-generate it
      let requestNumber = data.requestNumber;
      if (!requestNumber) {
        const [requestType] = await tx
          .select()
          .from(requestTypes)
          .where(eq(requestTypes.id, data.requestTypeId));

        if (!requestType) {
          throw new Error("Request type not found");
        }

        // Universal Dynamic Numbering Logic
        const [settings] = await tx
          .select()
          .from(requestTypeSettings)
          .where(and(
            eq(requestTypeSettings.projectId, data.projectId),
            eq(requestTypeSettings.requestTypeId, data.requestTypeId)
          ));

        if (settings) {
          const prefix = settings.prefix || requestType.code;
          const nextNumber = settings.nextNumber || 1;
          await tx.update(requestTypeSettings)
            .set({ nextNumber: nextNumber + 1, updatedAt: new Date() })
            .where(eq(requestTypeSettings.id, settings.id));

          requestNumber = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
        } else {
          // Fallback to legacy generic counters or create dynamic setting
          const [newSettings] = await tx.insert(requestTypeSettings).values({
            projectId: data.projectId,
            requestTypeId: data.requestTypeId,
            prefix: requestType.code,
            nextNumber: 2,
          }).returning();

          requestNumber = `${newSettings.prefix}-001`;
        }
      }

      const [request] = await tx
        .insert(requests)
        .values({ ...data, requestNumber })
        .returning();
      return request;
    });
  }

  async updateRequest(id: string, data: UpdateRequest): Promise<Request> {
    const [request] = await db
      .update(requests)
      .set(data)
      .where(eq(requests.id, id))
      .returning();
    return request;
  }

  async deleteRequest(id: string, reason: string | null, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(requests)
        .set({ is_deleted: true, updatedAt: new Date().toISOString() })
        .where(eq(requests.id, id));

      // Deleting something already deleted must not add a second open record. It used to,
      // so a double-click left two rows here and the recycle bin listed the request twice
      // (the bin joins this table). Seconds apart in the data, so a slip of the mouse.
      const [existing] = await tx
        .select({ id: requestDeletions.id })
        .from(requestDeletions)
        .where(and(eq(requestDeletions.requestId, id), isNull(requestDeletions.restoredAt)))
        .limit(1);
      if (existing) return;

      await tx.insert(requestDeletions).values({
        requestId: id,
        deletedBy: userId,
        reason: reason,
      });
    });
  }

  async restoreRequest(id: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(requests)
        .set({ is_deleted: false, updatedAt: new Date().toISOString() })
        .where(eq(requests.id, id));

      await tx.update(requestDeletions)
        .set({
          restoredBy: userId,
          restoredAt: new Date().toISOString()
        })
        .where(and(eq(requestDeletions.requestId, id), isNull(requestDeletions.restoredAt)));
    });
  }

  async getDeletedRequestsByProject(projectId: string): Promise<(Request & { chapterName?: string | null; divisionName?: string | null; userName?: string | null; deletedBy_name?: string | null; deletedAt?: string | null; reason?: string | null })[]> {
    const deletedByUser = alias(users, "deletedByUser");

    const result = await db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        referenceCode: requests.referenceCode,
        requestTypeId: requests.requestTypeId,
        projectId: requests.projectId,
        contractorId: requests.contractorId,
        consultantId: requests.consultantId,
        currentStatus: requests.currentStatus,
        currentRevisionId: requests.currentRevisionId,
        createdBy: requests.createdBy,
        userName: users.username,
        createdAt: requests.createdAt,
        updatedAt: requests.updatedAt,
        chapterName: workListChapters.nameEnglish,
        divisionName: workListDivisions.nameEnglish,
        deletedBy_name: deletedByUser.username,
        deletedAt: requestDeletions.deletedAt,
        reason: requestDeletions.reason,
      })
      .from(requests)
      .leftJoin(users, eq(requests.createdBy, users.id))
      .leftJoin(requestRevisions, eq(requests.currentRevisionId, requestRevisions.id))
      .leftJoin(workListActivities, eq(requestRevisions.workListActivityId, workListActivities.id))
      .leftJoin(workListChapters, eq(workListActivities.chapterId, workListChapters.id))
      .leftJoin(workListDivisions, eq(workListChapters.divisionId, workListDivisions.id))
      .innerJoin(requestDeletions, eq(requests.id, requestDeletions.requestId))
      .leftJoin(deletedByUser, eq(requestDeletions.deletedBy, deletedByUser.id))
      .where(and(eq(requests.projectId, projectId), eq(requests.is_deleted, true), isNull(requestDeletions.restoredAt)))
      .orderBy(desc(requestDeletions.deletedAt));

    // One row per request, keeping the most recent deletion. The join above fans out when
    // a request has more than one open deletion record, which historic double-clicks
    // produced; deleteRequest now prevents new ones, but old rows are still in the table.
    const seen = new Set<string>();
    return result.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }) as any;
  }

  // Request Revisions
  async getRequestRevisions(requestId: string): Promise<RequestRevision[]> {
    return await db.select().from(requestRevisions).where(eq(requestRevisions.requestId, requestId));
  }

  async getRequestRevisionById(revisionId: string): Promise<RequestRevision | undefined> {
    const [revision] = await db.select().from(requestRevisions).where(eq(requestRevisions.id, revisionId));
    return revision || undefined;
  }

  async getNextRevisionNo(requestId: string): Promise<number> {
    const result = await db.select({ maxRevision: max(requestRevisions.revisionNo) })
      .from(requestRevisions)
      .where(eq(requestRevisions.requestId, requestId));
    return (result[0]?.maxRevision || 0) + 1;
  }

  async createRequestRevision(data: InsertRequestRevision): Promise<RequestRevision> {
    const [revision] = await db
      .insert(requestRevisions)
      .values(data)
      .returning();

    // Automatically create a blank consultant review for each new revision
    await db.insert(requestConsultantReviews).values({
      revisionId: revision.id,
      residentEngineerUserId: data.createdBy,
      statusCode: "Pending",
    });

    return revision;
  }

  async updateRequestRevision(id: string, data: Partial<InsertRequestRevision>): Promise<RequestRevision> {
    const [revision] = await db
      .update(requestRevisions)
      .set(data)
      .where(eq(requestRevisions.id, id))
      .returning();
    return revision;
  }

  // Request Status History
  async getRequestStatusHistory(revisionId: string): Promise<RequestStatusHistory[]> {
    return await db.select().from(requestStatusHistory).where(eq(requestStatusHistory.revisionId, revisionId));
  }

  async createRequestStatusHistory(data: InsertRequestStatusHistory): Promise<RequestStatusHistory> {
    const [history] = await db
      .insert(requestStatusHistory)
      .values(data)
      .returning();
    return history;
  }

  // Request Purposes
  async getRequestPurposes(revisionId: string): Promise<RequestPurpose[]> {
    return await db.select().from(requestPurposes).where(eq(requestPurposes.revisionId, revisionId));
  }

  async createRequestPurpose(data: InsertRequestPurpose): Promise<RequestPurpose> {
    const [purpose] = await db
      .insert(requestPurposes)
      .values(data)
      .returning();
    return purpose;
  }

  async deleteRequestPurposesByRevision(revisionId: string): Promise<void> {
    await db.delete(requestPurposes).where(eq(requestPurposes.revisionId, revisionId));
  }

  async getLatestRevision(requestId: string): Promise<RequestRevision | undefined> {
    const [revision] = await db
      .select()
      .from(requestRevisions)
      .where(eq(requestRevisions.requestId, requestId))
      .orderBy(desc(requestRevisions.revisionNo))
      .limit(1);
    return revision || undefined;
  }

  // Request Documents
  async getRequestDocuments(revisionId: string): Promise<RequestDocument[]> {
    // Return request documents joined with project documents to enrich fields like fileName, fileUrl when source is 'project'
    const results = await db
      .select({
        id: requestDocuments.id,
        revisionId: requestDocuments.revisionId,
        sourceType: requestDocuments.sourceType,
        projectDocumentId: requestDocuments.projectDocumentId,
        documentType: requestDocuments.documentType,
        documentRef: requestDocuments.documentRef,
        description: requestDocuments.description,
        title: requestDocuments.title,
        fileName: sql<string | null>`COALESCE(${requestDocuments.fileName}, ${documents.fileName}, ${documents.name})`,
        fileUrl: sql<string | null>`COALESCE(${requestDocuments.fileUrl}, ${documents.fileUrl}, ${documents.fileData})`,
        fileSize: sql<number | null>`COALESCE(${requestDocuments.fileSize}, CAST(NULLIF(regexp_replace(${documents.size}, '[^0-9]', '', 'g'), '') AS integer))`,
        mimeType: sql<string | null>`COALESCE(${requestDocuments.mimeType}, ${documents.type})`,
        uploadedBy: sql<string | null>`COALESCE(${requestDocuments.uploadedBy}, ${documents.uploadedBy})`,
        uploadedAt: requestDocuments.uploadedAt,
        remarks: requestDocuments.remarks,
        folderId: documents.folderId,
        folderName: projectFolders.name,
      })
      .from(requestDocuments)
      .leftJoin(documents, eq(requestDocuments.projectDocumentId, documents.id))
      .leftJoin(projectFolders, eq(documents.folderId, projectFolders.id))
      .where(eq(requestDocuments.revisionId, revisionId));

    return results as any;
  }

  async createRequestDocument(data: InsertRequestDocument): Promise<RequestDocument> {
    const [document] = await db
      .insert(requestDocuments)
      .values(data)
      .returning();
    return document;
  }

  async updateRequestDocument(id: string, data: Partial<InsertRequestDocument>): Promise<RequestDocument> {
    const [document] = await db
      .update(requestDocuments)
      .set(data)
      .where(eq(requestDocuments.id, id))
      .returning();
    if (!document) {
      throw new Error(`Request document with id ${id} not found`);
    }
    return document;
  }

  async deleteRequestDocument(id: string): Promise<void> {
    await db.delete(requestDocuments).where(eq(requestDocuments.id, id));
  }

  async deleteRequestDocumentsByRevision(revisionId: string): Promise<void> {
    await db.delete(requestDocuments).where(eq(requestDocuments.revisionId, revisionId));
  }

  // Request Work Locations
  async getRequestWorkLocations(revisionId: string): Promise<RequestWorkLocation[]> {
    return await db.select().from(requestWorkLocations).where(eq(requestWorkLocations.revisionId, revisionId));
  }

  async createRequestWorkLocation(data: InsertRequestWorkLocation): Promise<RequestWorkLocation> {
    const [location] = await db
      .insert(requestWorkLocations)
      .values(data)
      .returning();
    return location;
  }

  async deleteRequestWorkLocation(id: string): Promise<void> {
    await db.delete(requestWorkLocations).where(eq(requestWorkLocations.id, id));
  }

  async deleteRequestWorkLocationsByRevision(revisionId: string): Promise<void> {
    await db.delete(requestWorkLocations).where(eq(requestWorkLocations.revisionId, revisionId));
  }

  // Request Work Levels
  async getRequestWorkLevels(revisionId: string): Promise<RequestWorkLevel[]> {
    return await db.select().from(requestWorkLevels).where(eq(requestWorkLevels.revisionId, revisionId));
  }

  async createRequestWorkLevel(data: InsertRequestWorkLevel): Promise<RequestWorkLevel> {
    const [level] = await db
      .insert(requestWorkLevels)
      .values(data)
      .returning();
    return level;
  }

  async deleteRequestWorkLevel(id: string): Promise<void> {
    await db.delete(requestWorkLevels).where(eq(requestWorkLevels.id, id));
  }

  async deleteRequestWorkLevelsByRevision(revisionId: string): Promise<void> {
    await db.delete(requestWorkLevels).where(eq(requestWorkLevels.revisionId, revisionId));
  }

  // Request Inquiries
  async getRequestInquiries(revisionId: string): Promise<RequestInquiry[]> {
    return await db.select().from(requestInquiries).where(eq(requestInquiries.revisionId, revisionId));
  }

  async createRequestInquiry(data: InsertRequestInquiry): Promise<RequestInquiry> {
    const [inquiry] = await db
      .insert(requestInquiries)
      .values(data)
      .returning();
    return inquiry;
  }

  async updateRequestInquiry(id: string, data: UpdateRequestInquiry): Promise<RequestInquiry> {
    const [inquiry] = await db
      .update(requestInquiries)
      .set({ ...data, answeredAt: data.answer ? new Date().toISOString() : undefined })
      .where(eq(requestInquiries.id, id))
      .returning();
    return inquiry;
  }

  async deleteRequestInquiry(id: string): Promise<void> {
    await db.delete(requestInquiries).where(eq(requestInquiries.id, id));
  }

  // Revision Checklist Responses
  async getRevisionChecklistResponses(revisionId: string): Promise<RevisionChecklistResponse[]> {
    return await db.select().from(revisionChecklistResponses).where(eq(revisionChecklistResponses.revisionId, revisionId));
  }

  async upsertRevisionChecklistResponse(data: InsertRevisionChecklistResponse): Promise<RevisionChecklistResponse> {
    const existing = await db.select().from(revisionChecklistResponses)
      .where(and(
        eq(revisionChecklistResponses.revisionId, data.revisionId),
        eq(revisionChecklistResponses.checklistItemId, data.checklistItemId)
      ));

    if (existing.length > 0) {
      const [updated] = await db.update(revisionChecklistResponses)
        .set({
          response: data.response,
          respondedBy: data.respondedBy,
          respondedAt: new Date().toISOString(),
          remarks: data.remarks
        })
        .where(eq(revisionChecklistResponses.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(revisionChecklistResponses).values(data).returning();
      return created;
    }
  }

  async deleteRevisionChecklistResponse(revisionId: string, checklistItemId: string): Promise<void> {
    await db.delete(revisionChecklistResponses)
      .where(and(
        eq(revisionChecklistResponses.revisionId, revisionId),
        eq(revisionChecklistResponses.checklistItemId, checklistItemId)
      ));
  }

  // Request Consultant Reviews
  async getRequestConsultantReviews(revisionId: string): Promise<RequestConsultantReview[]> {
    return await db.select().from(requestConsultantReviews).where(eq(requestConsultantReviews.revisionId, revisionId));
  }

  async getRequestConsultantReview(id: string): Promise<RequestConsultantReview | undefined> {
    const [review] = await db.select().from(requestConsultantReviews).where(eq(requestConsultantReviews.id, id));
    return review || undefined;
  }

  async createRequestConsultantReview(data: { revisionId: string; residentEngineerUserId?: string | null; comments?: string | null; statusCode?: string | null }): Promise<RequestConsultantReview> {
    const [created] = await db.insert(requestConsultantReviews).values({
      revisionId: data.revisionId,
      residentEngineerUserId: data.residentEngineerUserId || null,
      comments: data.comments || null,
      statusCode: data.statusCode || "Pending",
    }).returning();
    return created;
  }

  async updateRequestConsultantReview(id: string, data: { comments?: string; statusCode?: string; receivedAt?: string; reviewedAt?: string; residentEngineerUserId?: string | null }): Promise<RequestConsultantReview> {
    const updateData: Record<string, any> = {};
    if (data.comments !== undefined) updateData.comments = data.comments;
    if (data.statusCode !== undefined) updateData.statusCode = data.statusCode;
    if (data.receivedAt !== undefined) updateData.receivedAt = new Date(data.receivedAt);
    if (data.reviewedAt !== undefined) updateData.reviewedAt = new Date(data.reviewedAt);
    if (data.residentEngineerUserId !== undefined) updateData.residentEngineerUserId = data.residentEngineerUserId;

    const [updated] = await db.update(requestConsultantReviews)
      .set(updateData)
      .where(eq(requestConsultantReviews.id, id))
      .returning();
    return updated;
  }

  // Request Attachments
  async getRequestAttachments(revisionId: string): Promise<RequestAttachment[]> {
    return await db.select({
      id: requestAttachments.id,
      revisionId: requestAttachments.revisionId,
      title: requestAttachments.title,
      fileName: requestAttachments.fileName,
      fileType: requestAttachments.fileType,
      fileData: requestAttachments.fileData,
      fileUrl: requestAttachments.fileUrl,
      fileSize: requestAttachments.fileSize,
      uploadedBy: requestAttachments.uploadedBy,
      uploadedAt: requestAttachments.uploadedAt,
    }).from(requestAttachments).where(eq(requestAttachments.revisionId, revisionId)) as any;
  }

  async createRequestAttachment(data: InsertRequestAttachment): Promise<RequestAttachment> {
    const [created] = await db.insert(requestAttachments).values({
      revisionId: data.revisionId,
      fileName: data.fileName,
      fileType: data.fileType || null,
      fileData: data.fileData || null,
      fileUrl: data.fileUrl || null,
      fileSize: data.fileSize || null,
      title: data.title || null,
      uploadedBy: data.uploadedBy || null,
    }).returning();
    return created;
  }

  async deleteRequestAttachment(id: string): Promise<void> {
    await db.delete(requestAttachments).where(eq(requestAttachments.id, id));
  }

  // Request Messages (Chat)
  async getRequestMessages(revisionId: string): Promise<(RequestMessage & { attachments: MessageAttachment[] })[]> {
    const messages = await db.select().from(requestMessages)
      .where(eq(requestMessages.revisionId, revisionId))
      .orderBy(requestMessages.sentAt);

    const messagesWithAttachments = await Promise.all(
      messages.map(async (msg) => {
        const attachments = await db.select({
          id: messageAttachments.id,
          messageId: messageAttachments.messageId,
          title: messageAttachments.title,
          fileName: messageAttachments.fileName,
          fileType: messageAttachments.fileType,
          fileUrl: messageAttachments.fileUrl,
          fileSize: messageAttachments.fileSize,
          uploadedAt: messageAttachments.uploadedAt,
        }).from(messageAttachments)
          .where(eq(messageAttachments.messageId, msg.id));
        return { ...msg, attachments };
      })
    );

    return messagesWithAttachments;
  }

  async getAllRequestMessages(requestId: string): Promise<(RequestMessage & { attachments: MessageAttachment[] })[]> {
    const messages = await db.select({
      id: requestMessages.id,
      revisionId: requestMessages.revisionId,
      senderId: requestMessages.senderId,
      message: requestMessages.message,
      sentAt: requestMessages.sentAt,
    })
      .from(requestMessages)
      .innerJoin(requestRevisions, eq(requestMessages.revisionId, requestRevisions.id))
      .where(eq(requestRevisions.requestId, requestId))
      .orderBy(requestMessages.sentAt);

    const messagesWithAttachments = await Promise.all(
      messages.map(async (msg) => {
        const attachments = await db.select({
          id: messageAttachments.id,
          messageId: messageAttachments.messageId,
          title: messageAttachments.title,
          fileName: messageAttachments.fileName,
          fileType: messageAttachments.fileType,
          fileUrl: messageAttachments.fileUrl,
          fileSize: messageAttachments.fileSize,
          uploadedAt: messageAttachments.uploadedAt,
        }).from(messageAttachments)
          .where(eq(messageAttachments.messageId, msg.id));
        return { ...msg, attachments };
      })
    );

    return messagesWithAttachments;
  }

  async createRequestMessage(data: InsertRequestMessage): Promise<RequestMessage> {
    const [message] = await db
      .insert(requestMessages)
      .values(data)
      .returning();
    return message;
  }

  async deleteRequestMessage(id: string): Promise<void> {
    await db.delete(requestMessages).where(eq(requestMessages.id, id));
  }

  // Message Attachments
  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return await db.select().from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
  }

  async createMessageAttachment(data: InsertMessageAttachment): Promise<MessageAttachment> {
    const [attachment] = await db
      .insert(messageAttachments)
      .values(data)
      .returning();
    return attachment;
  }

  async deleteMessageAttachment(id: string): Promise<void> {
    await db.delete(messageAttachments).where(eq(messageAttachments.id, id));
  }

  // Approval Status Codes (Lookup table)
  async getAllApprovalStatusCodes(): Promise<ApprovalStatusCode[]> {
    return db.select().from(approvalStatusCodes).orderBy(approvalStatusCodes.sortOrder);
  }

  async getApprovalStatusCode(code: string): Promise<ApprovalStatusCode | undefined> {
    const [result] = await db.select().from(approvalStatusCodes).where(eq(approvalStatusCodes.code, code));
    return result || undefined;
  }

  // Revision Approval (set/get approval status on a revision)
  async setRevisionApprovalStatus(revisionId: string, statusCode: string, comments: string | null, approvedByUserId: string): Promise<RequestRevision> {
    const [result] = await db.update(requestRevisions)
      .set({
        approvalStatusCode: statusCode,
        approvalComments: comments,
        approvedBy: approvedByUserId,
        approvedAt: new Date().toISOString()
      })
      .where(eq(requestRevisions.id, revisionId))
      .returning();
    return result;
  }

  // Workflow Steps & Transitions
  async getAllWorkflowSteps(): Promise<WorkflowStep[]> {
    return await db.select().from(workflowSteps)
      .orderBy(workflowSteps.sequenceOrder);
  }

  async getWorkflowSteps(requestTypeId: number): Promise<WorkflowStep[]> {
    return await db.select().from(workflowSteps)
      .where(eq(workflowSteps.requestTypeId, requestTypeId))
      .orderBy(workflowSteps.sequenceOrder);
  }

  async getWorkflowStep(stepId: number): Promise<WorkflowStep | undefined> {
    const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.id, stepId));
    return step || undefined;
  }

  async getWorkflowTransitions(requestTypeId: number, fromStepId: number): Promise<WorkflowTransition[]> {
    return await db.select().from(workflowTransitions)
      .where(and(
        eq(workflowTransitions.requestTypeId, requestTypeId),
        eq(workflowTransitions.fromStepId, fromStepId)
      ));
  }

  async getWorkflowTransition(requestTypeId: number, fromStepId: number, toStepId: number, allowedStatus: string): Promise<WorkflowTransition | undefined> {
    const [transition] = await db.select().from(workflowTransitions)
      .where(and(
        eq(workflowTransitions.requestTypeId, requestTypeId),
        eq(workflowTransitions.fromStepId, fromStepId),
        eq(workflowTransitions.toStepId, toStepId),
        eq(workflowTransitions.allowedStatus, allowedStatus)
      ));
    return transition || undefined;
  }

  async createWorkflowStep(data: any): Promise<WorkflowStep> {
    const [step] = await db.insert(workflowSteps).values(data).returning();
    return step;
  }

  async createWorkflowTransition(data: any): Promise<WorkflowTransition> {
    const [transition] = await db.insert(workflowTransitions).values(data).returning();
    return transition;
  }

  // Activity Checklist Items (Junction table)
  async getChecklistItemsByActivity(activityId: string): Promise<any[]> {
    const results = await db.select({
      id: activityChecklistItems.id,
      activityId: activityChecklistItems.activityId,
      checklistItemId: activityChecklistItems.checklistItemId,
      addedBy: activityChecklistItems.addedBy,
      addedAt: activityChecklistItems.addedAt,
      checklistItem: {
        id: checklistItems.id,
        category: checklistItems.category,
        code: checklistItems.code,
        nameEnglish: checklistItems.nameEnglish,
        nameArabic: checklistItems.nameArabic,
        description: checklistItems.description,
        sortOrder: checklistItems.sortOrder,
      }
    })
      .from(activityChecklistItems)
      .innerJoin(checklistItems, eq(activityChecklistItems.checklistItemId, checklistItems.id))
      .where(eq(activityChecklistItems.activityId, activityId));
    return results;
  }

  async setChecklistItemsForActivity(activityId: string, checklistItemIds: string[], addedBy?: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(activityChecklistItems).where(eq(activityChecklistItems.activityId, activityId));

      if (checklistItemIds.length > 0) {
        const values = checklistItemIds.map(checklistItemId => ({
          activityId,
          checklistItemId,
          addedBy: addedBy || null,
        }));
        await tx.insert(activityChecklistItems).values(values);
      }
    });
  }

  async addChecklistItemToActivity(activityId: string, checklistItemId: string, addedBy?: string): Promise<any> {
    const existing = await db.select()
      .from(activityChecklistItems)
      .where(and(
        eq(activityChecklistItems.activityId, activityId),
        eq(activityChecklistItems.checklistItemId, checklistItemId)
      ));

    if (existing.length > 0) {
      return existing[0];
    }

    const [result] = await db.insert(activityChecklistItems)
      .values({
        activityId,
        checklistItemId,
        addedBy: addedBy || null,
      })
      .returning();
    return result;
  }

  async removeChecklistItemFromActivity(activityId: string, checklistItemId: string): Promise<void> {
    await db.delete(activityChecklistItems)
      .where(and(
        eq(activityChecklistItems.activityId, activityId),
        eq(activityChecklistItems.checklistItemId, checklistItemId)
      ));
  }

  // User-Team Member Associations
  async getUserTeamMembers(userId: string): Promise<UserTeamMember[]> {
    return await db.select()
      .from(userTeamMembers)
      .where(eq(userTeamMembers.userId, userId));
  }

  async getTeamMemberUsers(teamMemberId: string): Promise<UserTeamMember[]> {
    return await db.select()
      .from(userTeamMembers)
      .where(eq(userTeamMembers.teamMemberId, teamMemberId));
  }

  async getAllUserTeamMembers(): Promise<UserTeamMember[]> {
    return await db.select().from(userTeamMembers);
  }

  async setUserTeamMembers(userId: string, teamMemberIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));

      if (teamMemberIds.length > 0) {
        const values = teamMemberIds.map(teamMemberId => ({
          userId,
          teamMemberId,
        }));
        await tx.insert(userTeamMembers).values(values);
      }
    });
  }

  async addUserTeamMember(userId: string, teamMemberId: string): Promise<UserTeamMember> {
    const existing = await db.select()
      .from(userTeamMembers)
      .where(and(
        eq(userTeamMembers.userId, userId),
        eq(userTeamMembers.teamMemberId, teamMemberId)
      ));

    if (existing.length > 0) {
      return existing[0];
    }

    const [result] = await db.insert(userTeamMembers)
      .values({ userId, teamMemberId })
      .returning();
    return result;
  }

  async removeUserTeamMember(userId: string, teamMemberId: string): Promise<void> {
    await db.delete(userTeamMembers)
      .where(and(
        eq(userTeamMembers.userId, userId),
        eq(userTeamMembers.teamMemberId, teamMemberId)
      ));
  }

  // Create request with initial revision (transactional)
  async createRequestWithRevision(requestData: {
    requestNumber?: string; // Optional - will be auto-generated if not provided
    referenceCode: string;
    requestTypeId: string;
    projectId: string;
    createdBy: string;
    contractorId?: string | null;
    consultantId?: string | null;
  }, revisionData: {
    currentStepId?: number | null;
    title: string;
    description?: string | null;
    workListActivityId?: string | null;
    workLocationId?: string | null;
    workLevelId?: string | null;
    scheduledDate?: string | null;
    remarks?: string | null;
    divisionName?: string | null;
    chapterName?: string | null;
    activityName?: string | null;
    activityCode?: string | null;
    workLevelName?: string | null;
    metadata?: any | null;
  }): Promise<{ request: Request; revision: RequestRevision; statusHistory: RequestStatusHistory }> {
    return await db.transaction(async (tx) => {
      let finalRequestNumber = requestData.requestNumber;

      // Only generate request number if not provided
      if (!finalRequestNumber) {
        // Get the request type to retrieve the code
        const [requestType] = await tx
          .select()
          .from(requestTypes)
          .where(eq(requestTypes.id, requestData.requestTypeId));

        if (!requestType) {
          throw new Error("Request type not found");
        }

        // Check requestTypeSettings first
        const [settings] = await tx
          .select()
          .from(requestTypeSettings)
          .where(and(
            eq(requestTypeSettings.projectId, requestData.projectId),
            eq(requestTypeSettings.requestTypeId, requestData.requestTypeId)
          ));

        if (settings) {
          const prefix = settings.prefix || requestType.code;
          const nextNumber = settings.nextNumber || 1;
          await tx.update(requestTypeSettings)
            .set({ nextNumber: nextNumber + 1, updatedAt: new Date() })
            .where(eq(requestTypeSettings.id, settings.id));

          // If prefix is SD-MECH (or is exactly SD), pad to 2 digits, otherwise 3
          const isSD = prefix.toUpperCase() === "SD" || prefix.toUpperCase().startsWith("SD-");
          const padding = isSD ? 2 : 3;
          finalRequestNumber = `${prefix}-${nextNumber.toString().padStart(padding, '0')}`;
        } else {
          // Atomically get next number using INSERT ON CONFLICT
          const result = await tx.execute(sql`
            INSERT INTO request_counters (project_id, request_type_id, last_number)
            VALUES (${requestData.projectId}, ${requestData.requestTypeId}, 1)
            ON CONFLICT (project_id, request_type_id) 
            DO UPDATE SET last_number = request_counters.last_number + 1
            RETURNING last_number
          `);

          const nextNumber = (result.rows[0] as { last_number: number }).last_number;
          finalRequestNumber = `${requestType.code}-${nextNumber.toString().padStart(3, '0')}`;
        }
      }

      // Fetch Snapshot data
      let projectName = null, contractorName = null, consultantName = null;
      let activityCode = revisionData.activityCode || null;
      let activityName = revisionData.activityName || null;
      let chapterName = revisionData.chapterName || null;
      let divisionName = revisionData.divisionName || null;
      let workLevelName = revisionData.workLevelName || null;

      if (requestData.projectId) {
        const [proj] = await tx.select().from(projects).where(eq(projects.id, requestData.projectId));
        if (proj) projectName = proj.name;
      }
      if (requestData.contractorId) {
        const [org] = await tx.select().from(organizations).where(eq(organizations.id, requestData.contractorId));
        if (org) contractorName = org.name;
      }
      if (requestData.consultantId) {
        const [org] = await tx.select().from(organizations).where(eq(organizations.id, requestData.consultantId));
        if (org) consultantName = org.name;
      }

      if (revisionData.workLevelId) {
        const [wl] = await tx.select().from(workLevels).where(eq(workLevels.id, revisionData.workLevelId));
        if (wl) workLevelName = wl.nameEnglish;
      }

      if (revisionData.workListActivityId && (!activityName || !chapterName || !divisionName)) {
        const [act] = await tx.select().from(workListActivities).where(eq(workListActivities.id, revisionData.workListActivityId));
        if (act) {
          if (!activityCode) activityCode = act.code;
          if (!activityName) activityName = act.nameEnglish;
          if (act.chapterId) {
            const [chap] = await tx.select().from(workListChapters).where(eq(workListChapters.id, act.chapterId));
            if (chap) {
              if (!chapterName) chapterName = chap.nameEnglish;
              if (chap.divisionId) {
                const [div] = await tx.select().from(workListDivisions).where(eq(workListDivisions.id, chap.divisionId));
                if (div) {
                  if (!divisionName) divisionName = div.nameEnglish;
                }
              }
            }
          }
        }
      }

      // Create the request header
      const [request] = await tx
        .insert(requests)
        .values({
          requestNumber: finalRequestNumber,
          referenceCode: requestData.referenceCode,
          requestTypeId: requestData.requestTypeId,
          projectId: requestData.projectId,
          projectName: projectName,
          createdBy: requestData.createdBy,
          contractorId: requestData.contractorId || null,
          contractorName: contractorName,
          consultantId: requestData.consultantId || null,
          consultantName: consultantName,
          currentStatus: "Draft",
        })
        .returning();

      // Create the first revision with payload data (starts from revision 0)
      const [revision] = await tx
        .insert(requestRevisions)
        .values({
          requestId: request.id,
          revisionNo: 0,
          currentStepId: revisionData.currentStepId || null,
          title: revisionData.title,
          description: revisionData.description || null,
          workListActivityId: revisionData.workListActivityId || null,
          activityCode: activityCode,
          activityName: activityName,
          chapterName: chapterName,
          divisionName: divisionName,
          workLocationId: revisionData.workLocationId || null,
          workLevelId: revisionData.workLevelId || null,
          workLevelName: workLevelName,
          scheduledDate: revisionData.scheduledDate || null,
          remarks: revisionData.remarks || null,
          createdBy: requestData.createdBy,
          metadata: revisionData.metadata || null,
        })
        .returning();

      // Create initial status history entry
      const [statusHistory] = await tx
        .insert(requestStatusHistory)
        .values({
          revisionId: revision.id,
          oldStatus: "",
          newStatus: "Draft",
          changedBy: requestData.createdBy,
          remarks: "Request created",
        })
        .returning();

      // Create blank consultant review for this revision (within the transaction)
      await tx.insert(requestConsultantReviews).values({
        revisionId: revision.id,
        residentEngineerUserId: requestData.createdBy,
        statusCode: "Pending",
      });

      // Update request with the current revision ID to maintain the header-revision link
      const [updatedRequest] = await tx
        .update(requests)
        .set({ currentRevisionId: revision.id })
        .where(eq(requests.id, request.id))
        .returning();

      return { request: updatedRequest, revision, statusHistory };
    });
  }

  // Get next request number for a project
  async getNextRequestNumber(projectId: string): Promise<number> {
    const result = await db.select({ maxNumber: max(requests.requestNumber) })
      .from(requests)
      .where(eq(requests.projectId, projectId));

    // Parse the current max number and increment
    const maxNum = result[0]?.maxNumber;
    if (!maxNum) return 1;

    // Try to extract number from format like "001" or just "1"
    const parsed = parseInt(maxNum, 10);
    return isNaN(parsed) ? 1 : parsed + 1;
  }

  async previewNextRequestNumber(projectId: string, requestTypeId: string): Promise<string> {
    const [requestType] = await db
      .select()
      .from(requestTypes)
      .where(eq(requestTypes.id, requestTypeId));

    if (!requestType) return "REQ-000";

    const [settings] = await db
      .select()
      .from(requestTypeSettings)
      .where(and(
        eq(requestTypeSettings.projectId, projectId),
        eq(requestTypeSettings.requestTypeId, requestTypeId)
      ));

    if (settings) {
      const prefix = settings.prefix || requestType.code;
      const nextNumber = settings.nextNumber || 1;
      const isSD = prefix.toUpperCase() === "SD" || prefix.toUpperCase().startsWith("SD-");
      const padding = isSD ? 2 : 3;
      return `${prefix}-${nextNumber.toString().padStart(padding, '0')}`;
    } else {
      const result = await db.execute(sql`
        SELECT last_number FROM request_counters
        WHERE project_id = ${projectId} AND request_type_id = ${requestTypeId}
      `);
      
      const lastNumber = result.rows.length > 0 ? (result.rows[0] as { last_number: number }).last_number : 0;
      const nextNumber = lastNumber + 1;
      return `${requestType.code}-${nextNumber.toString().padStart(3, '0')}`;
    }
  }

  // Team Member Permissions (RBAC)
  async getTeamMemberPermissions(projectId: string, requestTypeId: string): Promise<any[]> {
    return await db.select()
      .from(teamMemberPermissions)
      .where(and(
        eq(teamMemberPermissions.projectId, projectId),
        eq(teamMemberPermissions.requestTypeId, requestTypeId)
      ));
  }

  async upsertTeamMemberPermission(
    projectId: string,
    teamMemberId: string,
    requestTypeId: string,
    canView: boolean,
    canCreate: boolean,
    canEdit: boolean
  ): Promise<any> {
    // Check if permission already exists
    const [existing] = await db.select()
      .from(teamMemberPermissions)
      .where(and(
        eq(teamMemberPermissions.projectId, projectId),
        eq(teamMemberPermissions.teamMemberId, teamMemberId),
        eq(teamMemberPermissions.requestTypeId, requestTypeId)
      ));

    let result;
    if (existing) {
      const [updated] = await db.update(teamMemberPermissions)
        .set({ canView, canCreate, canEdit })
        .where(eq(teamMemberPermissions.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [created] = await db.insert(teamMemberPermissions)
        .values({ projectId, teamMemberId, requestTypeId, canView, canCreate, canEdit })
        .returning();
      result = created;
    }

    // Propagate permissions to all users linked to this team member
    await this.syncUserPermissionsForTeamMember(projectId, teamMemberId, requestTypeId, canView, canCreate, canEdit);

    return result;
  }

  // Sync permissions from team member to all linked users
  private async syncUserPermissionsForTeamMember(
    projectId: string,
    teamMemberId: string,
    requestTypeId: string,
    canView: boolean,
    canCreate: boolean,
    canEdit: boolean
  ): Promise<void> {
    // Find all users linked to this team member
    const linkedUsers = await db.select({ userId: userTeamMembers.userId })
      .from(userTeamMembers)
      .where(eq(userTeamMembers.teamMemberId, teamMemberId));

    // Upsert permission for each linked user
    for (const { userId } of linkedUsers) {
      const [existingUserPerm] = await db.select()
        .from(userPermissions)
        .where(and(
          eq(userPermissions.projectId, projectId),
          eq(userPermissions.userId, userId),
          eq(userPermissions.requestTypeId, requestTypeId)
        ));

      if (existingUserPerm) {
        await db.update(userPermissions)
          .set({ canView, canCreate, canEdit })
          .where(eq(userPermissions.id, existingUserPerm.id));
      } else {
        await db.insert(userPermissions)
          .values({ projectId, userId, requestTypeId, canView, canCreate, canEdit });
      }
    }
  }

  async deleteTeamMemberPermission(id: string): Promise<void> {
    await db.delete(teamMemberPermissions).where(eq(teamMemberPermissions.id, id));
  }

  // Notifications
  async getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]> {
    const query = db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async findUnreadNotification(userId: string, requestId: string, type: string): Promise<Notification | undefined> {
    const [notification] = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.requestId, requestId),
        eq(notifications.type, type),
        eq(notifications.isRead, false)
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    return notification || undefined;
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications)
      .values(data)
      .returning();
    return notification;
  }

  async updateNotification(id: string, data: Partial<InsertNotification>): Promise<Notification> {
    const [notification] = await db.update(notifications)
      .set(data)
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [notification] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async deleteAllNotifications(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  // Request Suppliers (SSR)
  async getRevisionSuppliers(revisionId: string): Promise<any[]> {
    const results = await db
      .select({
        id: requestSuppliers.id,
        revisionId: requestSuppliers.revisionId,
        supplierId: requestSuppliers.supplierId,
        addedAt: requestSuppliers.addedAt,
        remarks: requestSuppliers.remarks,
        supplier: suppliers,
      })
      .from(requestSuppliers)
      .innerJoin(suppliers, eq(requestSuppliers.supplierId, suppliers.id))
      .where(eq(requestSuppliers.revisionId, revisionId));

    return results;
  }

  async linkSupplierToRevision(data: InsertRequestSupplier): Promise<any> {
    const [result] = await db.insert(requestSuppliers).values(data).returning();
    return result;
  }

  async deleteRevisionSuppliersByRevision(revisionId: string): Promise<void> {
    await db.delete(requestSuppliers).where(eq(requestSuppliers.revisionId, revisionId));
  }

  // Snag Lists & Items Implementation
  async getSnagListsByProject(projectId: string): Promise<any[]> {
    const lists = await db
      .select({
        list: snagLists,
        purpose: purposes,
      })
      .from(snagLists)
      .leftJoin(purposes, eq(snagLists.purposeId, purposes.id))
      .where(eq(snagLists.projectId, projectId))
      .orderBy(desc(snagLists.createdAt));

    return lists.map(({ list, purpose }) => ({
      ...list,
      purpose,
    }));
  }

  async getSnagList(id: string): Promise<any | undefined> {
    const [result] = await db
      .select({
        list: snagLists,
        purpose: purposes,
      })
      .from(snagLists)
      .leftJoin(purposes, eq(snagLists.purposeId, purposes.id))
      .where(eq(snagLists.id, id));

    if (!result) return undefined;
    return {
      ...result.list,
      purpose: result.purpose,
    };
  }

  async createSnagList(data: InsertSnagList): Promise<SnagList> {
    const maxList = await db
      .select({ serialNumber: snagLists.serialNumber })
      .from(snagLists)
      .where(eq(snagLists.projectId, data.projectId))
      .orderBy(desc(snagLists.serialNumber))
      .limit(1);
    
    const nextSerial = maxList.length > 0 ? (maxList[0].serialNumber || 0) + 1 : 1;

    const [list] = await db
      .insert(snagLists)
      .values({
        ...data,
        serialNumber: nextSerial,
      })
      .returning();
    return list;
  }

  async updateSnagList(id: string, data: UpdateSnagList): Promise<SnagList> {
    const [list] = await db
      .update(snagLists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(snagLists.id, id))
      .returning();
    return list;
  }

  async deleteSnagList(id: string): Promise<void> {
    await db.delete(snagLists).where(eq(snagLists.id, id));
  }

  async getSnagItemsByList(snagListId: string): Promise<any[]> {
    const items = await db
      .select({
        item: snagItems,
        assignedMember: teamMembers,
        purpose: purposes,
        workLocation: workLocations,
        workLevel: workLevels,
        division: workListDivisions,
      })
      .from(snagItems)
      .leftJoin(teamMembers, eq(snagItems.assignedTo, teamMembers.id))
      .leftJoin(purposes, eq(snagItems.purposeId, purposes.id))
      .leftJoin(workLocations, eq(snagItems.workLocationId, workLocations.id))
      .leftJoin(workLevels, eq(snagItems.workLevelId, workLevels.id))
      .leftJoin(workListDivisions, eq(snagItems.divisionId, workListDivisions.id))
      .where(eq(snagItems.snagListId, snagListId))
      .orderBy(desc(snagItems.createdAt));

    return items.map(({ item, assignedMember, purpose, workLocation, workLevel, division }) => ({
      ...item,
      assignedMember,
      purpose,
      workLocation,
      workLevel,
      division,
    }));
  }

  async getSnagItemsByProject(projectId: string): Promise<any[]> {
    const items = await db
      .select({
        item: snagItems,
        list: snagLists,
        assignedMember: teamMembers,
        purpose: purposes,
        workLocation: workLocations,
        workLevel: workLevels,
        division: workListDivisions,
      })
      .from(snagItems)
      .innerJoin(snagLists, eq(snagItems.snagListId, snagLists.id))
      .leftJoin(teamMembers, eq(snagItems.assignedTo, teamMembers.id))
      .leftJoin(purposes, eq(snagItems.purposeId, purposes.id))
      .leftJoin(workLocations, eq(snagItems.workLocationId, workLocations.id))
      .leftJoin(workLevels, eq(snagItems.workLevelId, workLevels.id))
      .leftJoin(workListDivisions, eq(snagItems.divisionId, workListDivisions.id))
      .where(eq(snagLists.projectId, projectId))
      .orderBy(desc(snagItems.createdAt));

    return items.map(({ item, list, assignedMember, purpose, workLocation, workLevel, division }) => ({
      ...item,
      listTitle: list.title,
      listStatus: list.status,
      assignedMember,
      purpose,
      workLocation,
      workLevel,
      division,
    }));
  }

  async getSnagItem(id: string): Promise<SnagItem | undefined> {
    const [item] = await db.select().from(snagItems).where(eq(snagItems.id, id));
    return item || undefined;
  }

  async createSnagItem(data: InsertSnagItem): Promise<SnagItem> {
    const [item] = await db.insert(snagItems).values(data).returning();
    return item;
  }

  async updateSnagItem(id: string, data: UpdateSnagItem): Promise<SnagItem> {
    const [item] = await db
      .update(snagItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(snagItems.id, id))
      .returning();
    return item;
  }

  async deleteSnagItem(id: string): Promise<void> {
    await db.delete(snagItems).where(eq(snagItems.id, id));
  }

  async getSnagItemHistory(snagItemId: string): Promise<any[]> {
    const history = await db
      .select({
        log: snagItemHistory,
        user: users,
      })
      .from(snagItemHistory)
      .leftJoin(users, eq(snagItemHistory.performedBy, users.id))
      .where(eq(snagItemHistory.snagItemId, snagItemId))
      .orderBy(desc(snagItemHistory.createdAt));

    return history.map(({ log, user }) => ({
      ...log,
      performedByName: user ? (user.fullName || user.username) : null,
    }));
  }

  async createSnagItemHistory(data: InsertSnagItemHistory): Promise<SnagItemHistory> {
    const [entry] = await db
      .insert(snagItemHistory)
      .values({
        ...data,
        attachments: (data.attachments as string[]) || [],
      })
      .returning();
    return entry;
  }

  // ==================== RFQs ====================
  async getRfqsByProject(projectId: string): Promise<any[]> {
    const rfqList = await db
      .select({
        rfq: rfqs,
        creator: users,
      })
      .from(rfqs)
      .leftJoin(users, eq(rfqs.createdBy, users.id))
      .where(eq(rfqs.projectId, projectId))
      .orderBy(desc(rfqs.createdAt));

    const result = await Promise.all(
      rfqList.map(async ({ rfq, creator }) => {
        const items = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfq.id));
        const suppliersList = await db
          .select({
            rfqSupplier: rfqSuppliers,
            supplier: suppliers,
          })
          .from(rfqSuppliers)
          .innerJoin(suppliers, eq(rfqSuppliers.supplierId, suppliers.id))
          .where(eq(rfqSuppliers.rfqId, rfq.id));

        const quotationsList = await db.select().from(quotations).where(eq(quotations.rfqId, rfq.id));
        const orderedItems = await this.getRfqOrderedItems(rfq.id);

        return {
          ...rfq,
          creatorName: creator ? (creator.fullName || creator.username) : null,
          itemsCount: items.length,
          orderedItemsCount: new Set(orderedItems.map((o) => o.rfqItemId)).size,
          suppliersCount: suppliersList.length,
          quotationsCount: quotationsList.length,
          items,
          suppliers: suppliersList.map(s => ({
            ...s.rfqSupplier,
            supplierName: s.supplier.supplierName,
            contactPerson: s.supplier.contactPerson,
            phone: s.supplier.phone,
            email: s.supplier.email,
          })),
        };
      })
    );

    return result;
  }

  async getRfq(id: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        rfq: rfqs,
        creator: users,
      })
      .from(rfqs)
      .leftJoin(users, eq(rfqs.createdBy, users.id))
      .where(eq(rfqs.id, id));

    if (!row) return undefined;

    const items = await db
      .select({
        item: rfqItems,
        material: materials,
      })
      .from(rfqItems)
      .leftJoin(materials, eq(rfqItems.materialId, materials.id))
      .where(eq(rfqItems.rfqId, id))
      .orderBy(rfqItems.sortOrder);

    const suppliersList = await db
      .select({
        rfqSupplier: rfqSuppliers,
        supplier: suppliers,
      })
      .from(rfqSuppliers)
      .innerJoin(suppliers, eq(rfqSuppliers.supplierId, suppliers.id))
      .where(eq(rfqSuppliers.rfqId, id));

    return {
      ...row.rfq,
      creatorName: row.creator ? (row.creator.fullName || row.creator.username) : null,
      items: items.map(i => ({
        ...i.item,
        materialName: i.material?.materialName || null,
        materialCategory: i.material?.category || null,
      })),
      suppliers: suppliersList.map(s => ({
        ...s.rfqSupplier,
        supplierName: s.supplier.supplierName,
        contactPerson: s.supplier.contactPerson,
        phone: s.supplier.phone,
        email: s.supplier.email,
      })),
    };
  }

  async createRfq(data: InsertRfq): Promise<Rfq> {
    const [rfq] = await db.insert(rfqs).values(data).returning();
    return rfq;
  }

  async updateRfq(id: string, data: UpdateRfq): Promise<Rfq> {
    const [rfq] = await db
      .update(rfqs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rfqs.id, id))
      .returning();
    return rfq;
  }

  async deleteRfq(id: string): Promise<void> {
    await db.delete(rfqs).where(eq(rfqs.id, id));
  }

  async getNextRfqNumber(projectId: string): Promise<string> {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(rfqs)
      .where(eq(rfqs.projectId, projectId));
    const count = Number(countResult[0]?.count || 0) + 1;
    const year = new Date().getFullYear();
    return `RFQ-${year}-${count.toString().padStart(3, "0")}`;
  }

  // ==================== RFQ Items ====================
  async getRfqItems(rfqId: string): Promise<any[]> {
    const rows = await db
      .select({
        item: rfqItems,
        material: materials,
      })
      .from(rfqItems)
      .leftJoin(materials, eq(rfqItems.materialId, materials.id))
      .where(eq(rfqItems.rfqId, rfqId))
      .orderBy(rfqItems.sortOrder);

    return rows.map(r => ({
      ...r.item,
      materialName: r.material?.materialName || null,
    }));
  }

  async createRfqItem(data: InsertRfqItem): Promise<RfqItem> {
    const [item] = await db.insert(rfqItems).values(data).returning();
    return item;
  }

  async updateRfqItem(id: string, data: UpdateRfqItem): Promise<RfqItem> {
    const [item] = await db.update(rfqItems).set(data).where(eq(rfqItems.id, id)).returning();
    return item;
  }

  async deleteRfqItem(id: string): Promise<void> {
    await db.delete(rfqItems).where(eq(rfqItems.id, id));
  }

  // ==================== RFQ Suppliers ====================
  async getRfqSuppliers(rfqId: string): Promise<any[]> {
    const rows = await db
      .select({
        rfqSupplier: rfqSuppliers,
        supplier: suppliers,
      })
      .from(rfqSuppliers)
      .innerJoin(suppliers, eq(rfqSuppliers.supplierId, suppliers.id))
      .where(eq(rfqSuppliers.rfqId, rfqId));

    return rows.map(r => ({
      ...r.rfqSupplier,
      supplierName: r.supplier.supplierName,
      contactPerson: r.supplier.contactPerson,
      phone: r.supplier.phone,
      email: r.supplier.email,
    }));
  }

  async addSupplierToRfq(data: InsertRfqSupplier): Promise<RfqSupplier> {
    const [row] = await db.insert(rfqSuppliers).values(data).returning();
    return row;
  }

  async updateRfqSupplier(id: string, data: UpdateRfqSupplier): Promise<RfqSupplier> {
    const [row] = await db.update(rfqSuppliers).set(data).where(eq(rfqSuppliers.id, id)).returning();
    return row;
  }

  async removeSupplierFromRfq(id: string): Promise<void> {
    await db.delete(rfqSuppliers).where(eq(rfqSuppliers.id, id));
  }

  // ==================== Quotations ====================
  async getQuotationsByRfq(rfqId: string): Promise<any[]> {
    const rows = await db
      .select({
        quote: quotations,
        supplier: suppliers,
        document: documents,
      })
      .from(quotations)
      .innerJoin(suppliers, eq(quotations.supplierId, suppliers.id))
      .leftJoin(documents, eq(quotations.documentId, documents.id))
      .where(eq(quotations.rfqId, rfqId))
      .orderBy(desc(quotations.createdAt));

    const result = await Promise.all(
      rows.map(async ({ quote, supplier, document }) => {
        const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quote.id));
        return {
          ...quote,
          supplierName: supplier.supplierName,
          contactPerson: supplier.contactPerson,
          phone: supplier.phone,
          email: supplier.email,
          document: document || null,
          itemsCount: items.length,
          items,
        };
      })
    );

    return result;
  }

  async getQuotationsByProject(projectId: string): Promise<any[]> {
    const rows = await db
      .select({
        quote: quotations,
        supplier: suppliers,
        rfq: rfqs,
        document: documents,
      })
      .from(quotations)
      .innerJoin(suppliers, eq(quotations.supplierId, suppliers.id))
      .innerJoin(rfqs, eq(quotations.rfqId, rfqs.id))
      .leftJoin(documents, eq(quotations.documentId, documents.id))
      .where(eq(rfqs.projectId, projectId))
      .orderBy(desc(quotations.createdAt));

    return rows.map(({ quote, supplier, rfq, document }) => ({
      ...quote,
      document: document || null,
      supplierName: supplier.supplierName,
      rfqTitle: rfq.title,
      rfqNumber: rfq.rfqNumber,
    }));
  }

  async getQuotation(id: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        quote: quotations,
        supplier: suppliers,
        rfq: rfqs,
        document: documents,
      })
      .from(quotations)
      .innerJoin(suppliers, eq(quotations.supplierId, suppliers.id))
      .innerJoin(rfqs, eq(quotations.rfqId, rfqs.id))
      .leftJoin(documents, eq(quotations.documentId, documents.id))
      .where(eq(quotations.id, id));

    if (!row) return undefined;

    const items = await db
      .select({
        item: quotationItems,
        rfqItem: rfqItems,
        material: materials,
      })
      .from(quotationItems)
      .leftJoin(rfqItems, eq(quotationItems.rfqItemId, rfqItems.id))
      .leftJoin(materials, eq(quotationItems.materialId, materials.id))
      .where(eq(quotationItems.quotationId, id));

    return {
      ...row.quote,
      document: row.document || null,
      supplierName: row.supplier.supplierName,
      contactPerson: row.supplier.contactPerson,
      phone: row.supplier.phone,
      email: row.supplier.email,
      rfqTitle: row.rfq.title,
      rfqNumber: row.rfq.rfqNumber,
      items: items.map(i => ({
        ...i.item,
        rfqItemName: i.rfqItem?.itemName || null,
        rfqItemDescription: i.rfqItem?.itemDescription || i.item.itemDescription,
        materialName: i.material?.materialName || null,
        unit: i.rfqItem?.unit || "pcs",
      })),
    };
  }

  async createQuotation(data: InsertQuotation): Promise<Quotation> {
    const [quote] = await db.insert(quotations).values(data).returning();
    return quote;
  }

  async updateQuotation(id: string, data: UpdateQuotation): Promise<Quotation> {
    const [quote] = await db
      .update(quotations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(quotations.id, id))
      .returning();
    return quote;
  }

  async deleteQuotation(id: string): Promise<void> {
    await db.delete(quotations).where(eq(quotations.id, id));
  }

  // ==================== Quotation Items ====================
  async getQuotationItems(quotationId: string): Promise<any[]> {
    const rows = await db
      .select({
        item: quotationItems,
        rfqItem: rfqItems,
        material: materials,
      })
      .from(quotationItems)
      .leftJoin(rfqItems, eq(quotationItems.rfqItemId, rfqItems.id))
      .leftJoin(materials, eq(quotationItems.materialId, materials.id))
      .where(eq(quotationItems.quotationId, quotationId));

    return rows.map(i => ({
      ...i.item,
      rfqItemName: i.rfqItem?.itemName || null,
      rfqItemDescription: i.rfqItem?.itemDescription || i.item.itemDescription,
      materialName: i.material?.materialName || null,
      unit: i.rfqItem?.unit || "pcs",
    }));
  }

  async createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem> {
    const [item] = await db.insert(quotationItems).values(data).returning();
    return item;
  }

  async updateQuotationItem(id: string, data: UpdateQuotationItem): Promise<QuotationItem> {
    const [item] = await db.update(quotationItems).set(data).where(eq(quotationItems.id, id)).returning();
    return item;
  }

  async deleteQuotationItem(id: string): Promise<void> {
    await db.delete(quotationItems).where(eq(quotationItems.id, id));
  }

  // ==================== Purchase Orders ====================
  async getPurchaseOrdersByProject(projectId: string): Promise<any[]> {
    const rows = await db
      .select({
        po: purchaseOrders,
        supplier: suppliers,
        creator: users,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
      .where(eq(purchaseOrders.projectId, projectId))
      .orderBy(desc(purchaseOrders.createdAt));

    const result = await Promise.all(
      rows.map(async ({ po, supplier, creator }) => {
        const items = await db.select().from(poItems).where(eq(poItems.poId, po.id));
        return {
          ...po,
          supplierName: supplier.supplierName,
          supplierPhone: supplier.phone,
          supplierEmail: supplier.email,
          creatorName: creator ? (creator.fullName || creator.username) : null,
          itemsCount: items.length,
          items,
        };
      })
    );

    return result;
  }

  async getPurchaseOrder(id: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        po: purchaseOrders,
        supplier: suppliers,
        creator: users,
        approver: users,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
      .where(eq(purchaseOrders.id, id));

    if (!row) return undefined;

    const items = await db
      .select({
        item: poItems,
        material: materials,
      })
      .from(poItems)
      .leftJoin(materials, eq(poItems.materialId, materials.id))
      .where(eq(poItems.poId, id));

    // Receipts recorded against this order, newest first, each with the supplier's
    // delivery note document when one was attached.
    const receipts = await db
      .select({
        delivery: deliveries,
        warehouseName: warehouses.name,
        noteDocument: documents,
      })
      .from(deliveries)
      .leftJoin(warehouses, eq(deliveries.warehouseId, warehouses.id))
      .leftJoin(documents, eq(deliveries.deliveryNoteId, documents.id))
      .where(eq(deliveries.purchaseOrderId, id))
      .orderBy(desc(deliveries.arrivalDate));

    const receiptIds = receipts.map((r) => r.delivery.id);
    const receiptLines = receiptIds.length
      ? await db.select().from(deliveryItems).where(inArray(deliveryItems.deliveryId, receiptIds))
      : [];

    const [approver] = row.po.approvedBy
      ? await db.select().from(users).where(eq(users.id, row.po.approvedBy))
      : [];

    // Procurement trail: the RFQ this order came from, the supplier's winning quotation,
    // and the quote document the supplier submitted.
    const [quotationRow] = row.po.quotationId
      ? await db
          .select({ quotation: quotations, document: documents })
          .from(quotations)
          .leftJoin(documents, eq(quotations.documentId, documents.id))
          .where(eq(quotations.id, row.po.quotationId))
      : [];

    const [rfqRow] = row.po.rfqId
      ? await db.select().from(rfqs).where(eq(rfqs.id, row.po.rfqId))
      : [];

    const enrichedItems = items.map((i) => {
      const ordered = parseFloat(i.item.quantity ?? "0");
      const received = parseFloat(i.item.receivedQuantity ?? "0");
      const remaining = ordered - received;
      return {
        ...i.item,
        materialName: i.material?.materialName || null,
        materialCategory: i.material?.category || null,
        orderedQuantity: ordered,
        receivedQuantity: received,
        remainingQuantity: remaining,
        // Over-receipt is allowed but surfaced, so the discrepancy is visible rather than silent.
        isOverReceived: received > ordered,
        isFullyReceived: ordered > 0 && received >= ordered,
      };
    });

    const fullyReceived = enrichedItems.length > 0 && enrichedItems.every((i) => i.isFullyReceived);
    const partiallyReceived = enrichedItems.some((i) => i.receivedQuantity > 0);

    return {
      ...row.po,
      supplierName: row.supplier.supplierName,
      supplierContactPerson: row.supplier.contactPerson,
      supplierPhone: row.supplier.phone,
      supplierEmail: row.supplier.email,
      supplierAddress: row.supplier.address,
      supplierTaxNumber: row.supplier.taxNumber,
      creatorName: row.creator ? (row.creator.fullName || row.creator.username) : null,
      approverName: approver ? (approver.fullName || approver.username) : null,
      rfqNumber: rfqRow?.rfqNumber ?? null,
      rfqTitle: rfqRow?.title ?? null,
      quotation: quotationRow
        ? {
            id: quotationRow.quotation.id,
            quotationNumber: quotationRow.quotation.quotationNumber,
            submissionDate: quotationRow.quotation.submissionDate,
            validUntil: quotationRow.quotation.validUntil,
            totalAmount: quotationRow.quotation.totalAmount,
            currency: quotationRow.quotation.currency,
            paymentTerms: quotationRow.quotation.paymentTerms,
            deliveryTerms: quotationRow.quotation.deliveryTerms,
            leadTimeDays: quotationRow.quotation.leadTimeDays,
            // null when the supplier's quote was recorded without attaching its document.
            document: quotationRow.document
              ? {
                  id: quotationRow.document.id,
                  name: quotationRow.document.name,
                  type: quotationRow.document.type,
                  size: quotationRow.document.size,
                  fileUrl: quotationRow.document.fileUrl,
                  fileName: quotationRow.document.fileName,
                }
              : null,
          }
        : null,
      items: enrichedItems,
      fullyReceived,
      partiallyReceived,
      // An order can only be received against once it has been approved. 'completed' stays
      // receivable so a late extra shipment can still be recorded (over-receipt is allowed).
      isReceivable: ["approved", "issued", "partially_received", "completed"].includes(row.po.status),
      receipts: receipts.map((r) => ({
        ...r.delivery,
        warehouseName: r.warehouseName,
        noteDocument: r.noteDocument
          ? {
              id: r.noteDocument.id,
              name: r.noteDocument.name,
              fileName: r.noteDocument.fileName,
              fileUrl: r.noteDocument.fileUrl,
              type: r.noteDocument.type,
            }
          : null,
        items: receiptLines.filter((l) => l.deliveryId === r.delivery.id),
      })),
    };
  }

  async createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }

  // Standalone ledger entries: stock-take corrections, waste, returns and opening counts.
  // Everything here needs a written reason — an unexplained quantity change is the one
  // thing that makes a ledger untrustworthy.
  async createManualStockMovement(
    projectId: string,
    input: CreateManualStockMovement
  ): Promise<StockMovement> {
    return await db.transaction(async (tx) => {
      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
      if (!warehouse) throw new Error("المستودع غير موجود");
      if (warehouse.projectId !== projectId) throw new Error("المستودع لا ينتمي لهذا المشروع");

      const [material] = await tx.select().from(materials).where(eq(materials.id, input.materialId));
      if (!material) throw new Error("المادة غير موجودة في الكتالوج");
      if (material.projectId !== projectId) throw new Error("المادة لا تنتمي لهذا المشروع");

      const unit = input.unit || material.unit;
      if (material.unit && unit && normalizeUnit(material.unit) !== normalizeUnit(unit)) {
        throw new Error(
          `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" والحركة "${unit}"`
        );
      }

      // Lock first, then read the balance, so two concurrent write-offs cannot both pass.
      await tx.select().from(materials).where(eq(materials.id, input.materialId)).for("update");

      const inTypes = STOCK_IN_TYPES as readonly string[];
      const [row] = await tx
        .select({
          balance: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN ${stockMovements.quantity} ELSE -${stockMovements.quantity} END), 0)`,
          movementCount: sql<number>`COUNT(*)::int`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.warehouseId, input.warehouseId),
            eq(stockMovements.materialId, input.materialId)
          )
        );

      const available = parseFloat(row?.balance ?? "0");
      const quantity = parseFloat(input.quantity);

      // An opening balance recorded after the material has already moved is almost always
      // a mistake; the user wants an adjustment instead.
      if (input.movementType === "opening_balance" && (row?.movementCount ?? 0) > 0) {
        throw new Error(
          `للمادة "${material.materialName}" حركات مسجّلة في هذا المستودع، فلا يصلح لها رصيد افتتاحي. استخدم "تسوية جرد" بدلًا منه.`
        );
      }

      if (!inTypes.includes(input.movementType) && quantity > available) {
        throw new Error(
          `الكمية (${quantity}) تتجاوز المتوفر من "${material.materialName}" في المستودع (${available})`
        );
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          projectId,
          warehouseId: input.warehouseId,
          materialId: input.materialId,
          movementType: input.movementType,
          quantity: input.quantity,
          unit,
          sourceType: input.movementType === "opening_balance" ? "opening_balance" : "adjustment",
          sourceId: null,
          movementDate: input.movementDate,
          performedBy: input.performedBy ?? null,
          notes: input.notes,
        })
        .returning();
      return movement;
    });
  }

  // Moves stock between two warehouses of the same project as a pair of movements, so the
  // project-wide total stays unchanged while the per-warehouse balances shift.
  async createStockTransfer(input: CreateStockTransfer & { createdBy?: string | null }): Promise<any> {
    return await db.transaction(async (tx) => {
      if (input.fromWarehouseId === input.toWarehouseId) {
        throw new Error("لا يمكن التحويل إلى نفس المستودع");
      }

      const whs = await tx
        .select()
        .from(warehouses)
        .where(inArray(warehouses.id, [input.fromWarehouseId, input.toWarehouseId]));
      const from = whs.find((w) => w.id === input.fromWarehouseId);
      const to = whs.find((w) => w.id === input.toWarehouseId);
      if (!from || !to) throw new Error("المستودع غير موجود");
      if (from.projectId !== input.projectId || to.projectId !== input.projectId) {
        throw new Error("المستودع لا ينتمي لهذا المشروع");
      }

      // Lock in a deterministic order so two transfers can never deadlock each other.
      const materialIds = Array.from(new Set(input.items.map((i) => i.materialId!))).sort();
      await tx.select().from(materials).where(inArray(materials.id, materialIds)).for("update");

      const inTypes = STOCK_IN_TYPES as readonly string[];
      const prepared = [];
      for (const item of input.items) {
        const [material] = await tx.select().from(materials).where(eq(materials.id, item.materialId!));
        if (!material) throw new Error(`المادة "${item.materialName}" غير موجودة في الكتالوج`);
        if (material.projectId !== input.projectId) {
          throw new Error(`المادة "${material.materialName}" لا تنتمي لهذا المشروع`);
        }
        if (material.unit && item.unit && normalizeUnit(material.unit) !== normalizeUnit(item.unit)) {
          throw new Error(
            `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" والتحويل "${item.unit}"`
          );
        }

        const [row] = await tx
          .select({
            balance: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN ${stockMovements.quantity} ELSE -${stockMovements.quantity} END), 0)`,
          })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.warehouseId, input.fromWarehouseId),
              eq(stockMovements.materialId, item.materialId!)
            )
          );

        const available = parseFloat(row?.balance ?? "0");
        const requested = parseFloat(item.quantity);
        if (requested > available) {
          throw new Error(
            `الكمية المطلوبة من "${material.materialName}" (${requested}) تتجاوز المتوفر في "${from.name}" (${available})`
          );
        }

        prepared.push({ ...item, materialName: material.materialName, materialId: material.id });
      }

      const count = await tx
        .select({ c: sql<number>`count(*)` })
        .from(stockTransfers)
        .where(eq(stockTransfers.projectId, input.projectId));
      const transferNumber =
        input.transferNumber?.trim() ||
        `TR-${new Date().getFullYear()}-${(Number(count[0]?.c || 0) + 1).toString().padStart(3, "0")}`;

      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          projectId: input.projectId,
          transferNumber,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          transferDate: input.transferDate,
          notes: input.notes ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      const items = await tx
        .insert(stockTransferItems)
        .values(prepared.map((p) => ({ ...p, transferId: transfer.id })) as any)
        .returning();

      for (const item of items) {
        const shared = {
          projectId: input.projectId,
          materialId: item.materialId!,
          quantity: item.quantity,
          unit: item.unit,
          sourceType: "transfer" as const,
          sourceId: transfer.id,
          movementDate: input.transferDate,
          performedBy: input.createdBy ?? null,
          notes: `تحويل ${transferNumber}: ${from.name} ← ${to.name}`,
        };
        await tx.insert(stockMovements).values([
          { ...shared, warehouseId: input.fromWarehouseId, movementType: "transfer_out" as const },
          { ...shared, warehouseId: input.toWarehouseId, movementType: "transfer_in" as const },
        ]);
      }

      return { ...transfer, items, fromWarehouseName: from.name, toWarehouseName: to.name };
    });
  }

  async getStockTransfersByProject(projectId: string): Promise<any[]> {
    const rows = await db
      .select({ transfer: stockTransfers })
      .from(stockTransfers)
      .where(eq(stockTransfers.projectId, projectId))
      .orderBy(desc(stockTransfers.transferDate), desc(stockTransfers.createdAt));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.transfer.id);
    const allItems = await db
      .select()
      .from(stockTransferItems)
      .where(inArray(stockTransferItems.transferId, ids));
    const whs = await db.select().from(warehouses).where(eq(warehouses.projectId, projectId));
    const nameOf = (id: string) => whs.find((w) => w.id === id)?.name ?? null;

    return rows.map((r) => ({
      ...r.transfer,
      fromWarehouseName: nameOf(r.transfer.fromWarehouseId),
      toWarehouseName: nameOf(r.transfer.toWarehouseId),
      items: allItems.filter((i) => i.transferId === r.transfer.id),
    }));
  }

  // ==========================================
  // Material Issues - صرف المواد
  // ==========================================

  // Positions allowed to approve issue vouchers in this project.
  async getInventoryApproverPositions(projectId: string): Promise<(InventoryApproverPosition & { position: Position })[]> {
    const rows = await db
      .select({ link: inventoryApproverPositions, position: positions })
      .from(inventoryApproverPositions)
      .innerJoin(positions, eq(inventoryApproverPositions.positionId, positions.id))
      .where(eq(inventoryApproverPositions.projectId, projectId));
    return rows.map((r) => ({ ...r.link, position: r.position })) as any;
  }

  // Positions the project's organisations actually staff, each with how many of their
  // holders are linked to a login. A position nobody holds — or whose holders have no
  // user account — can be selected as an approver and still approve nothing, so the
  // settings screen has to show that plainly rather than offer a theoretical list.
  async getProjectPositionCoverage(
    projectId: string
  ): Promise<{ position: Position; memberCount: number; userCount: number }[]> {
    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    const p = project[0];
    if (!p) return [];

    const orgIds = Array.from(
      new Set([p.organizationId, p.contractorId, p.consultantId].filter(Boolean) as string[])
    );
    if (orgIds.length === 0) return [];

    const members = await db.select().from(teamMembers).where(inArray(teamMembers.organizationId, orgIds));
    const allPositions = await db.select().from(positions);

    const linked = await db
      .select({ teamMemberId: userTeamMembers.teamMemberId })
      .from(userTeamMembers)
      .where(inArray(userTeamMembers.teamMemberId, members.length ? members.map((m) => m.id) : ["-"]));
    const linkedIds = new Set(linked.map((l) => l.teamMemberId));

    const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

    return allPositions
      .map((position) => {
        const holders = members.filter(
          (m) => norm(m.position) === norm(position.titleEnglish) || norm(m.position) === norm(position.titleArabic)
        );
        return {
          position,
          memberCount: holders.length,
          userCount: holders.filter((h) => linkedIds.has(h.id)).length,
        };
      })
      .filter((r) => r.memberCount > 0)
      .sort((a, b) => b.userCount - a.userCount);
  }

  async setInventoryApproverPositions(projectId: string, positionIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(inventoryApproverPositions).where(eq(inventoryApproverPositions.projectId, projectId));
      if (positionIds.length > 0) {
        await tx
          .insert(inventoryApproverPositions)
          .values(positionIds.map((positionId) => ({ projectId, positionId })));
      }
    });
  }

  // teamMembers.position is free text, not a foreign key, so the user's position title is
  // matched against the positions table by normalised title (English or Arabic).
  async canUserApproveIssues(userId: string, projectId: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return false;
    if (user.role === "super_admin") return true;

    const approvers = await this.getInventoryApproverPositions(projectId);
    if (approvers.length === 0) return false;

    const allowed = new Set<string>();
    for (const a of approvers) {
      if (a.position.titleEnglish) allowed.add(a.position.titleEnglish.trim().toLowerCase());
      if (a.position.titleArabic) allowed.add(a.position.titleArabic.trim().toLowerCase());
    }

    const memberRows = await db
      .select({ position: teamMembers.position })
      .from(userTeamMembers)
      .innerJoin(teamMembers, eq(userTeamMembers.teamMemberId, teamMembers.id))
      .where(eq(userTeamMembers.userId, userId));

    return memberRows.some((m) => m.position && allowed.has(m.position.trim().toLowerCase()));
  }

  // Writes the outgoing movements for an issue. Shared by the direct-issue path and the
  // approval path so the stock checks can never diverge between them.
  private async postIssueMovements(tx: any, issue: MaterialIssue): Promise<void> {
    const lines = await tx.select().from(materialIssueItems).where(eq(materialIssueItems.issueId, issue.id));
    if (lines.length === 0) throw new Error("سند الصرف بلا بنود");

    // Lock the material rows in a deterministic order. Without the lock two concurrent
    // issues both read the same balance and both succeed, driving stock negative
    // (Postgres defaults to READ COMMITTED). Sorting prevents deadlocks between them.
    const materialIds = Array.from(new Set(lines.map((l: any) => l.materialId).filter(Boolean))).sort() as string[];
    if (materialIds.length > 0) {
      await tx.select().from(materials).where(inArray(materials.id, materialIds)).for("update");
    }

    const inTypes = STOCK_IN_TYPES as readonly string[];
    for (const line of lines as any[]) {
      if (!line.materialId) {
        throw new Error(`المادة "${line.materialName}" غير مرتبطة بالكتالوج فلا يمكن صرفها`);
      }

      const [row] = await tx
        .select({
          balance: sql<string>`COALESCE(SUM(CASE WHEN ${stockMovements.movementType} IN ${inTypes} THEN ${stockMovements.quantity} ELSE -${stockMovements.quantity} END), 0)`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.warehouseId, issue.warehouseId),
            eq(stockMovements.materialId, line.materialId)
          )
        );

      const available = parseFloat(row?.balance ?? "0");
      const requested = parseFloat(line.quantity);
      if (requested > available) {
        throw new Error(
          `الكمية المطلوبة من "${line.materialName}" (${requested}) تتجاوز المتوفر في المستودع (${available})`
        );
      }

      await tx.insert(stockMovements).values({
        projectId: issue.projectId,
        warehouseId: issue.warehouseId,
        materialId: line.materialId,
        movementType: "out",
        quantity: line.quantity,
        unit: line.unit,
        sourceType: "issue",
        sourceId: issue.id,
        movementDate: issue.issueDate,
        performedBy: issue.createdBy ?? null,
        notes: line.notes ?? null,
      });
    }
  }

  async createMaterialIssueWithItems(input: CreateMaterialIssue & { createdBy?: string | null }): Promise<any> {
    return await db.transaction(async (tx) => {
      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
      if (!warehouse) throw new Error("المستودع غير موجود");
      if (warehouse.projectId !== input.projectId) {
        throw new Error("المستودع لا ينتمي لهذا المشروع");
      }

      // A subcontractor recipient is one of this project's registered subcontractors; its name is what the voucher shows
      let issuedTo = input.issuedTo;
      let subcontractorId: string | null = null;
      if (input.subcontractorId) {
        if (input.recipientType !== "subcontractor") throw new Error("مقاول الباطن يُحدَّد فقط عندما تكون صفة المستلم مقاول باطن");
        const [sub] = await tx.select().from(projectSubcontractors).where(eq(projectSubcontractors.id, input.subcontractorId));
        if (!sub || sub.projectId !== input.projectId) throw new Error("مقاول الباطن لا ينتمي لهذا المشروع");
        issuedTo = sub.name;
        subcontractorId = sub.id;
      }

      // Validate every line and work out whether the voucher needs approval before
      // writing anything.
      const prepared = [];
      let requiresApproval = false;
      for (const item of input.items) {
        const [material] = await tx.select().from(materials).where(eq(materials.id, item.materialId!));
        if (!material) throw new Error(`المادة "${item.materialName}" غير موجودة في الكتالوج`);
        if (material.projectId !== input.projectId) {
          throw new Error(`المادة "${material.materialName}" لا تنتمي لهذا المشروع`);
        }
        if (material.unit && item.unit && normalizeUnit(material.unit) !== normalizeUnit(item.unit)) {
          throw new Error(
            `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" والصرف "${item.unit}"`
          );
        }
        if (material.requiresIssueApproval) requiresApproval = true;
        prepared.push({ ...item, materialName: material.materialName, materialId: material.id });
      }

      const count = await tx
        .select({ c: sql<number>`count(*)` })
        .from(materialIssues)
        .where(eq(materialIssues.projectId, input.projectId));
      const issueNumber =
        input.issueNumber?.trim() ||
        `MI-${new Date().getFullYear()}-${(Number(count[0]?.c || 0) + 1).toString().padStart(3, "0")}`;

      const [issue] = await tx
        .insert(materialIssues)
        .values({
          projectId: input.projectId,
          warehouseId: input.warehouseId,
          issueNumber,
          issueDate: input.issueDate,
          issuedTo,
          recipientType: input.recipientType,
          subcontractorId,
          workLocationId: input.workLocationId ?? null,
          purpose: input.purpose ?? null,
          // Stock only moves when the voucher reaches 'issued'.
          status: requiresApproval ? "pending_approval" : "issued",
          requiresApproval,
          notes: input.notes ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      const items = await tx
        .insert(materialIssueItems)
        .values(prepared.map((p) => ({ ...p, issueId: issue.id })) as any)
        .returning();

      if (!requiresApproval) {
        await this.postIssueMovements(tx, issue);
      }

      return { ...issue, items };
    });
  }

  // Sufficiency is checked here, not at creation: two pending vouchers may both have been
  // raised against the same stock, and the second one must fail at approval time.
  async approveMaterialIssue(id: string, userId: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [issue] = await tx.select().from(materialIssues).where(eq(materialIssues.id, id));
      if (!issue) throw new Error("سند الصرف غير موجود");
      if (issue.status !== "pending_approval") {
        throw new Error(`لا يمكن اعتماد سند بحالة "${issue.status}". الاعتماد متاح للسندات المعلّقة فقط.`);
      }

      const [updated] = await tx
        .update(materialIssues)
        .set({ status: "issued", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(materialIssues.id, id))
        .returning();

      await this.postIssueMovements(tx, updated);
      return updated;
    });
  }

  async rejectMaterialIssue(id: string, userId: string, reason: string): Promise<MaterialIssue> {
    const [issue] = await db.select().from(materialIssues).where(eq(materialIssues.id, id));
    if (!issue) throw new Error("سند الصرف غير موجود");
    if (issue.status !== "pending_approval") {
      throw new Error(`لا يمكن رفض سند بحالة "${issue.status}". الرفض متاح للسندات المعلّقة فقط.`);
    }
    const [updated] = await db
      .update(materialIssues)
      .set({
        status: "rejected",
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(materialIssues.id, id))
      .returning();
    return updated;
  }

  // Cancelling never deletes rows. An issued voucher is reversed with return movements so
  // the ledger keeps both the issue and its reversal.
  async cancelMaterialIssue(id: string, userId: string): Promise<MaterialIssue> {
    return await db.transaction(async (tx) => {
      const [issue] = await tx.select().from(materialIssues).where(eq(materialIssues.id, id));
      if (!issue) throw new Error("سند الصرف غير موجود");
      if (issue.status === "cancelled") throw new Error("السند ملغي بالفعل");
      if (issue.status === "rejected") throw new Error("لا يمكن إلغاء سند مرفوض");

      if (issue.status === "issued") {
        const lines = await tx.select().from(materialIssueItems).where(eq(materialIssueItems.issueId, id));
        for (const line of lines) {
          if (!line.materialId) continue;
          await tx.insert(stockMovements).values({
            projectId: issue.projectId,
            warehouseId: issue.warehouseId,
            materialId: line.materialId,
            movementType: "return_from_site",
            quantity: line.quantity,
            unit: line.unit,
            sourceType: "issue",
            sourceId: issue.id,
            movementDate: new Date().toISOString().split("T")[0],
            performedBy: userId,
            notes: `إلغاء سند الصرف ${issue.issueNumber}`,
          });
        }
      }

      const [updated] = await tx
        .update(materialIssues)
        .set({ status: "cancelled", cancelledBy: userId, cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(materialIssues.id, id))
        .returning();
      return updated;
    });
  }

  async getMaterialIssue(id: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        issue: materialIssues,
        warehouseName: warehouses.name,
      })
      .from(materialIssues)
      .leftJoin(warehouses, eq(materialIssues.warehouseId, warehouses.id))
      .where(eq(materialIssues.id, id));
    if (!row) return undefined;

    const items = await db.select().from(materialIssueItems).where(eq(materialIssueItems.issueId, id));
    return { ...row.issue, warehouseName: row.warehouseName, items };
  }

  async getMaterialIssuesByProject(projectId: string): Promise<any[]> {
    const rows = await db
      .select({
        issue: materialIssues,
        warehouseName: warehouses.name,
      })
      .from(materialIssues)
      .leftJoin(warehouses, eq(materialIssues.warehouseId, warehouses.id))
      .where(eq(materialIssues.projectId, projectId))
      .orderBy(desc(materialIssues.issueDate), desc(materialIssues.createdAt));

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.issue.id);
    const allItems = await db
      .select()
      .from(materialIssueItems)
      .where(inArray(materialIssueItems.issueId, ids));

    return rows.map((r) => ({
      ...r.issue,
      warehouseName: r.warehouseName,
      items: allItems.filter((i) => i.issueId === r.issue.id),
    }));
  }

  // Records a shipment against an approved purchase order. Everything happens in one
  // transaction: the receipt, its DN number, the stock movements, the received quantities
  // on the order, and the order's status. A failure anywhere leaves none of it behind.
  async createReceiptFromPo(input: CreatePoReceiptInput): Promise<any> {
    return await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.purchaseOrderId));
      if (!po) throw new Error("أمر الشراء غير موجود");
      // 'completed' is included on purpose: over-receipt is allowed, so a late extra shipment
      // must still be recordable. Blocking it would leave stock lower than what is on site,
      // while allowing it inside a single receipt — an inconsistency.
      if (!["approved", "issued", "partially_received", "completed"].includes(po.status)) {
        throw new Error(`لا يمكن تسجيل استلام على أمر شراء بحالة "${po.status}". يجب اعتماد الأمر أولًا.`);
      }

      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
      if (!warehouse) throw new Error("المستودع غير موجود");
      if (warehouse.projectId !== po.projectId) {
        throw new Error("المستودع لا ينتمي لمشروع أمر الشراء");
      }

      const lines = input.lines.filter((l) => parseFloat(l.quantity) > 0);
      if (lines.length === 0) throw new Error("يجب إدخال كمية مستلمة لبند واحد على الأقل");

      const orderLines = await tx.select().from(poItems).where(eq(poItems.poId, po.id));
      const orderLineById = new Map(orderLines.map((l) => [l.id, l]));

      // Validate every line before writing anything, so a bad line cannot leave a
      // half-written receipt behind.
      const prepared = [];
      for (const line of lines) {
        const orderLine = orderLineById.get(line.poItemId);
        if (!orderLine) throw new Error("بند الاستلام لا ينتمي لأمر الشراء");
        if (!orderLine.materialId) {
          throw new Error(`البند "${orderLine.itemDescription}" بلا مادة من الكتالوج فلا يمكن استلامه في المخزون`);
        }

        const [material] = await tx.select().from(materials).where(eq(materials.id, orderLine.materialId));
        if (!material) throw new Error("المادة غير موجودة في الكتالوج");

        // Mixing units silently would make the balance meaningless (m³ added to kg).
        // Compared normalised: "PCs" and "pcs" are the same unit typed differently, and
        // rejecting those would block legitimate receipts over nothing.
        const unit = orderLine.unit || material.unit;
        if (material.unit && unit && normalizeUnit(material.unit) !== normalizeUnit(unit)) {
          throw new Error(
            `تعارض في الوحدة للمادة "${material.materialName}": الكتالوج "${material.unit}" وأمر الشراء "${unit}"`
          );
        }

        prepared.push({ orderLine, material, quantity: line.quantity, notes: line.notes ?? null });
      }

      const shipmentNumber = input.shipmentNumber?.trim() || (await nextShipmentNumber(tx, po.projectId));

      const [receipt] = await tx
        .insert(deliveries)
        .values({
          projectId: po.projectId,
          shipmentNumber,
          deliveryInvoiceNumber: input.deliveryInvoiceNumber ?? null,
          supplier: input.supplierName,
          supplierId: po.supplierId,
          arrivalDate: input.arrivalDate,
          deliveryNoteId: input.deliveryNoteId ?? null,
          warehouseId: input.warehouseId,
          receiptSource: "purchase_order",
          purchaseOrderId: po.id,
          sourceReason: null,
        })
        .returning();

      const createdItems = [];
      const overReceived: string[] = [];

      for (const p of prepared) {
        const [item] = await tx
          .insert(deliveryItems)
          .values({
            deliveryId: receipt.id,
            materialName: p.material.materialName,
            materialId: p.material.id,
            materialDescription: p.orderLine.itemDescription ?? null,
            arrivalQuantity: p.quantity,
            unit: p.orderLine.unit || p.material.unit,
            poItemId: p.orderLine.id,
          })
          .returning();
        createdItems.push(item);

        await tx.insert(stockMovements).values({
          projectId: po.projectId,
          warehouseId: input.warehouseId,
          materialId: p.material.id,
          movementType: "in",
          quantity: p.quantity,
          unit: p.orderLine.unit || p.material.unit,
          sourceType: "delivery",
          sourceId: receipt.id,
          movementDate: input.arrivalDate,
          performedBy: input.performedBy ?? null,
          notes: p.notes,
        });

        const ordered = parseFloat(p.orderLine.quantity ?? "0");
        const alreadyReceived = parseFloat(p.orderLine.receivedQuantity ?? "0");
        const newReceived = alreadyReceived + parseFloat(p.quantity);
        // Over-receipt is recorded rather than blocked: stock must match what is physically
        // on site. The discrepancy is reported back to the caller instead.
        if (newReceived > ordered) {
          overReceived.push(`${p.material.materialName} (${newReceived} من ${ordered})`);
        }

        await tx
          .update(poItems)
          .set({ receivedQuantity: newReceived.toFixed(2) })
          .where(eq(poItems.id, p.orderLine.id));
      }

      // Recompute the order's status from all of its lines, not just the ones in this receipt.
      const refreshed = await tx.select().from(poItems).where(eq(poItems.poId, po.id));
      const allReceived = refreshed.every(
        (l) => parseFloat(l.receivedQuantity ?? "0") >= parseFloat(l.quantity ?? "0")
      );
      const anyReceived = refreshed.some((l) => parseFloat(l.receivedQuantity ?? "0") > 0);
      const nextStatus = allReceived ? "completed" : anyReceived ? "partially_received" : po.status;

      if (nextStatus !== po.status) {
        await tx
          .update(purchaseOrders)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(purchaseOrders.id, po.id));
      }

      return { ...receipt, items: createdItems, purchaseOrderStatus: nextStatus, overReceived };
    });
  }

  // Only an approved order can be received against, so approval is an explicit step
  // rather than a free-form status edit.
  async approvePurchaseOrder(id: string, userId: string): Promise<PurchaseOrder> {
    return await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po) throw new Error("أمر الشراء غير موجود");
      if (po.status !== "draft") {
        throw new Error(`لا يمكن اعتماد أمر شراء بحالة "${po.status}". الاعتماد متاح للمسودات فقط.`);
      }

      const lines = await tx.select().from(poItems).where(eq(poItems.poId, id));
      if (lines.length === 0) {
        throw new Error("لا يمكن اعتماد أمر شراء بلا بنود.");
      }
      // A line with no catalog material can never be received into stock, which would leave
      // an approved order that is only partly receivable.
      const unlinked = lines.filter((l) => !l.materialId);
      if (unlinked.length > 0) {
        throw new Error(
          `${unlinked.length} بند بلا مادة من الكتالوج. اربط كل البنود بمواد قبل الاعتماد، وإلا تعذّر استلامها في المخزون.`
        );
      }

      const [updated] = await tx
        .update(purchaseOrders)
        .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      return updated;
    });
  }

  async updatePurchaseOrder(id: string, data: UpdatePurchaseOrder): Promise<PurchaseOrder> {
    const [po] = await db
      .update(purchaseOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return po;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async getNextPoNumber(projectId: string): Promise<string> {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.projectId, projectId));
    const count = Number(countResult[0]?.count || 0) + 1;
    const year = new Date().getFullYear();
    return `PO-${year}-${count.toString().padStart(3, "0")}`;
  }


  // Items of an RFQ that already appear on a non-cancelled PO.
  async getRfqOrderedItems(rfqId: string): Promise<any[]> {
    const rows = await db
      .select({
        rfqItemId: poItems.rfqItemId,
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        poStatus: purchaseOrders.status,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.supplierName,
      })
      .from(poItems)
      .innerJoin(purchaseOrders, eq(poItems.poId, purchaseOrders.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(eq(purchaseOrders.rfqId, rfqId), not(eq(purchaseOrders.status, "cancelled"))));
    return rows.filter((r) => r.rfqItemId);
  }

  // One draft PO per supplier, built from per-item (rfqItem -> quotation) assignments.
  async createPurchaseOrdersFromAssignments(
    rfqId: string,
    assignments: { rfqItemId: string; quotationId: string }[],
    userId?: string,
  ): Promise<any[]> {
    const rfq = await this.getRfq(rfqId);
    if (!rfq) throw new Error("RFQ not found");
    if (!assignments.length) throw new Error("No items selected");

    const rfqItemMap = new Map<string, any>((rfq.items || []).map((i: any) => [i.id, i]));
    const quotes = await this.getQuotationsByRfq(rfqId);
    const quoteMap = new Map<string, any>(quotes.map((q) => [q.id, q]));
    const alreadyOrdered = new Set((await this.getRfqOrderedItems(rfqId)).map((o) => o.rfqItemId));

    const seen = new Set<string>();
    const groups = new Map<string, { quote: any; lines: any[] }>();
    for (const a of assignments) {
      if (seen.has(a.rfqItemId)) throw new Error("Duplicate item in assignments");
      seen.add(a.rfqItemId);
      const rfqItem = rfqItemMap.get(a.rfqItemId);
      if (!rfqItem) throw new Error("Item does not belong to this RFQ");
      if (alreadyOrdered.has(a.rfqItemId)) {
        throw new Error(`Item "${rfqItem.itemName || rfqItem.itemDescription}" already has a purchase order`);
      }
      const quote = quoteMap.get(a.quotationId);
      if (!quote) throw new Error("Quotation does not belong to this RFQ");
      const qItem = (quote.items || []).find((qi: any) => qi.rfqItemId === a.rfqItemId);
      if (!qItem || Number(qItem.unitPrice) <= 0) {
        throw new Error(`${quote.supplierName} has not priced "${rfqItem.itemName || rfqItem.itemDescription}"`);
      }
      if (!groups.has(quote.id)) groups.set(quote.id, { quote, lines: [] });
      groups.get(quote.id)!.lines.push({ rfqItem, qItem });
    }

    const createdIds = await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.projectId, rfq.projectId));
      let seq = Number(count || 0);
      const ids: string[] = [];

      for (const { quote, lines } of Array.from(groups.values())) {
        seq += 1;
        const subtotal = lines.reduce((sum, l) => sum + Number(l.qItem.totalPrice || 0), 0);
        const quoteSubtotal = Number(quote.subtotal || 0);
        const ratio = quoteSubtotal > 0 ? Math.min(1, subtotal / quoteSubtotal) : 1;
        const tax = Number(quote.taxAmount || 0) * ratio;
        const discount = Number(quote.discountAmount || 0) * ratio;

        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            projectId: rfq.projectId,
            poNumber: `PO-${year}-${seq.toString().padStart(3, "0")}`,
            rfqId,
            quotationId: quote.id,
            supplierId: quote.supplierId,
            title: `${rfq.rfqNumber} - ${quote.supplierName}`,
            status: "draft",
            subtotal: subtotal.toFixed(2),
            taxAmount: tax.toFixed(2),
            discountAmount: discount.toFixed(2),
            totalAmount: (subtotal + tax - discount).toFixed(2),
            paymentTerms: quote.paymentTerms,
            termsAndConditions: quote.paymentTerms,
            createdBy: userId,
          })
          .returning();

        await tx.insert(poItems).values(
          lines.map(({ rfqItem, qItem }) => ({
            poId: po.id,
            materialId: qItem.materialId || rfqItem.materialId || null,
            rfqItemId: rfqItem.id,
            itemName: rfqItem.itemName || null,
            itemDescription: rfqItem.itemDescription || "",
            quantity: qItem.quantity,
            unit: qItem.unit || rfqItem.unit || "pcs",
            unitPrice: qItem.unitPrice,
            totalPrice: qItem.totalPrice,
            notes: qItem.notes || null,
          })),
        );
        await tx.update(quotations).set({ status: "accepted" }).where(eq(quotations.id, quote.id));
        ids.push(po.id);
      }

      // Whole RFQ covered -> awarded, and quotes that won nothing are rejected.
      const covered = alreadyOrdered.size + seen.size;
      if (covered >= rfqItemMap.size) {
        for (const q of quotes) {
          if (!groups.has(q.id) && q.status !== "accepted") {
            await tx.update(quotations).set({ status: "rejected" }).where(eq(quotations.id, q.id));
          }
        }
        await tx.update(rfqs).set({ status: "awarded" }).where(eq(rfqs.id, rfqId));
      } else {
        await tx.update(rfqs).set({ status: "evaluating" }).where(eq(rfqs.id, rfqId));
      }
      return ids;
    });

    return await Promise.all(createdIds.map((id) => this.getPurchaseOrder(id)));
  }

  // ==================== PO Items ====================
  async getPoItems(poId: string): Promise<any[]> {
    const rows = await db
      .select({
        item: poItems,
        material: materials,
      })
      .from(poItems)
      .leftJoin(materials, eq(poItems.materialId, materials.id))
      .where(eq(poItems.poId, poId));

    return rows.map(i => ({
      ...i.item,
      materialName: i.material?.materialName || null,
    }));
  }

  async createPoItem(data: InsertPoItem): Promise<PoItem> {
    const [item] = await db.insert(poItems).values(data).returning();
    return item;
  }

  async updatePoItem(id: string, data: UpdatePoItem): Promise<PoItem> {
    const [item] = await db.update(poItems).set(data).where(eq(poItems.id, id)).returning();
    return item;
  }

  async deletePoItem(id: string): Promise<void> {
    await db.delete(poItems).where(eq(poItems.id, id));
  }
}

export const storage = new DatabaseStorage();
