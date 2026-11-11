import { storage } from "./storage";
import { notificationWss } from "./websocket";
import type { InsertNotification, Request, WorkflowStep } from "@shared/schema";
import { getStepAuthorizedUserIds } from "./step-authorization";
import { enumLabel, translate } from "@shared/i18n";

// "Your turn" notifications are the assignment-type ones tied to a request
const STEP_TURN_TYPE = "assignment";

// Reaching these steps means the decision is made; the result notification already
// tells the contractor, so nobody gets a "your turn" notification for them
const STEPS_WITHOUT_TURN = new Set(["Final Approval"]);

type NotificationType = "info" | "success" | "warning" | "error" | "assignment" | "status_change" | "approval" | "mention" | "document";

interface NotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  projectId?: string;
  requestId?: string;
  activityId?: string;
  link?: string;
}

class NotificationService {
  private async createAndSend(params: NotificationParams) {
    try {
      const notificationData: InsertNotification = {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        projectId: params.projectId || null,
        requestId: params.requestId || null,
        activityId: params.activityId || null,
        link: params.link || null,
      };

      const notification = await storage.createNotification(notificationData);
      notificationWss.sendNotification(params.userId, notification);
      return notification;
    } catch (error) {
      console.error("Failed to create notification:", error);
    }
  }

  // Something in المدفوعات is waiting for these people, or has been decided. The link opens the right tab.
  async notifyPayments(params: { userIds: string[]; title: string; message: string; projectId?: string; link: string; type?: NotificationType }) {
    for (const userId of params.userIds) {
      await this.createAndSend({ userId, type: params.type ?? "approval", title: params.title, message: params.message, projectId: params.projectId, link: params.link });
    }
  }

  // الرخص والمعاملات: a transaction or step was assigned, paid, is overdue or about to expire. The link opens it.
  async notifyPermits(params: { userIds: string[]; title: string; message: string; projectId?: string; link: string; type?: NotificationType }) {
    for (const userId of Array.from(new Set(params.userIds))) {
      await this.createAndSend({ userId, type: params.type ?? "assignment", title: params.title, message: params.message, projectId: params.projectId, link: params.link });
    }
  }

  // A developer has offered this organization a role on one of its projects. Until the
  // invitation is answered the project itself is not visible to them, so the
  // notification carries everything needed to decide, and links to the answer screen.
  async notifyProjectInvitation(params: {
    userId: string;
    projectId: string;
    projectName: string;
    invitingOrganizationName: string;
    roleLabel: string;
  }) {
    return this.createAndSend({
      userId: params.userId,
      type: "assignment",
      title: translate("notifications", "invitation.title"),
      message: translate("notifications", "invitation.message", {
        invitingOrganizationName: params.invitingOrganizationName,
        projectName: params.projectName,
        roleLabel: params.roleLabel,
      }),
      // Deliberately no projectId: the project is not theirs to open until they accept
      link: "/invitations",
    });
  }

  // Both answers go back to whoever sent the invitation. A rejection is ordinary news,
  // not an error: the role is simply still open and they can invite someone else.
  async notifyProjectInvitationAnswer(params: {
    userId: string;
    projectId: string;
    projectName: string;
    organizationName: string;
    accepted: boolean;
  }) {
    return this.createAndSend({
      userId: params.userId,
      type: params.accepted ? "success" : "info",
      title: translate("notifications", params.accepted ? "invitation.accepted_title" : "invitation.declined_title"),
      message: translate("notifications", params.accepted ? "invitation.accepted_message" : "invitation.declined_message", {
        organizationName: params.organizationName,
        projectName: params.projectName,
      }),
      projectId: params.projectId,
      link: `/projects/${params.projectId}`,
    });
  }

  // The project is no longer theirs to open, so this carries no link to it
  async notifyRemovedFromProject(params: {
    userId: string;
    projectName: string;
    roleLabel: string;
  }) {
    return this.createAndSend({
      userId: params.userId,
      type: "warning",
      title: translate("notifications", "invitation.ended_title"),
      message: translate("notifications", "invitation.ended_message", {
        roleLabel: params.roleLabel,
        projectName: params.projectName,
      }),
    });
  }

  async notifyProjectInvitationWithdrawn(params: {
    userId: string;
    projectId: string;
    projectName: string;
  }) {
    return this.createAndSend({
      userId: params.userId,
      type: "info",
      title: translate("notifications", "invitation.withdrawn_title"),
      message: translate("notifications", "invitation.withdrawn_message", {
        projectName: params.projectName,
      }),
      link: "/invitations",
    });
  }

  // A request has reached a new workflow step: tell only the people who can act on it.
  // Whatever "your turn" notifications the previous step left behind are marked read
  // first, so colleagues who did not act are not left with a task that is already done.
  async notifyStepTurn(params: {
    request: Pick<Request, "id" | "requestNumber" | "projectId" | "contractorId" | "consultantId">;
    step: WorkflowStep;
    revisionId: string;
    senderId?: string;
  }) {
    const { request, step, revisionId, senderId } = params;
    try {
      await this.clearStepTurn(request.id);
      if (STEPS_WITHOUT_TURN.has(step.stepName)) return;

      const recipientUserIds = await getStepAuthorizedUserIds(request, step, revisionId, senderId);
      if (recipientUserIds.length === 0) {
        console.log(`[notifyStepTurn] No authorized users for step ${step.id} (${step.stepName}) of request ${request.id}`);
        return;
      }

      const requestNumber = request.requestNumber || "";
      const stepLabel = enumLabel("workflow_step", step.stepName);

      await Promise.all(recipientUserIds.map(userId =>
        this.createAndSend({
          userId,
          type: STEP_TURN_TYPE,
          title: translate("notifications", "requests.awaiting_action_title"),
          message: translate("notifications", "requests.awaiting_action_message", {
            requestNumber,
            stepLabel,
          }),
          projectId: request.projectId,
          requestId: request.id,
          link: `/requests/${request.id}`,
        })
      ));
    } catch (error) {
      // A failed notification must never undo the workflow move that already happened
      console.error("[notifyStepTurn] Failed:", error);
    }
  }

  // The step was acted on (or the request closed): earlier "your turn" notifications are stale
  async clearStepTurn(requestId: string) {
    const affectedUserIds = await storage.markRequestNotificationsAsRead(requestId, STEP_TURN_TYPE);
    for (const userId of affectedUserIds) {
      notificationWss.broadcastToUser(userId, { type: "all_read" });
    }
  }

  // Notify when approval status is recorded (A/B/C/D/E)
  async notifyApprovalStatus(
    requestId: string,
    requestNumber: string,
    projectId: string,
    statusCode: string,
    statusLabel: string,
    approverName: string,
    recipientUserIds: string[]
  ) {
    const isNCR = requestNumber.toUpperCase().startsWith("NCR");
    const isRNCR = requestNumber.toUpperCase().startsWith("RNCR");
    
    // For NCRs, even if "Approved", it's a non-conformance warning
    const type = isNCR ? "warning" : (statusCode === "A" || statusCode === "B" ? "success" : statusCode === "C" ? "warning" : "error");
    const title = isNCR ? "NCR Warning" : isRNCR ? "RNCR Result" : "Inspection Result";

    const promises = recipientUserIds.map(userId =>
      this.createAndSend({
        userId,
        type,
        title,
        message: `Request ${requestNumber}: ${statusLabel} (${statusCode}) by ${approverName}`,
        projectId,
        requestId,
        link: `/requests/${requestId}`,
      })
    );
    await Promise.all(promises);
  }

  // Notify when a consultant review is added
  async notifyConsultantReview(
    requestId: string,
    requestNumber: string,
    projectId: string,
    reviewerName: string,
    decision: string,
    recipientUserIds: string[]
  ) {
    const decisionText = decision === "approved" ? "Approved" :
      decision === "rejected" ? "Rejected" : "Pending";

    for (const userId of recipientUserIds) {
      await this.createAndSend({
        userId,
        type: "approval",
        title: "Consultant Review",
        message: `${reviewerName} added a review for request ${requestNumber}: ${decisionText}`,
        projectId,
        requestId,
        link: `/requests/${requestId}`,
      });
    }
  }

  // Notify when an inquiry is created or responded to
  async notifyInquiry(
    requestId: string,
    requestNumber: string,
    projectId: string,
    action: "created" | "responded",
    byName: string,
    recipientUserIds: string[]
  ) {
    const actionText = action === "created" ? "New Inquiry" : "Inquiry Response";

    for (const userId of recipientUserIds) {
      await this.createAndSend({
        userId,
        type: "info",
        title: actionText,
        message: `${byName} ${action === "created" ? "added an inquiry" : "responded to an inquiry"} in request ${requestNumber}`,
        projectId,
        requestId,
        link: `/requests/${requestId}`,
      });
    }
  }

  // Notify when attachment is uploaded
  async notifyAttachment(
    requestId: string,
    requestNumber: string,
    projectId: string,
    uploaderName: string,
    fileName: string,
    recipientUserIds: string[]
  ) {
    for (const userId of recipientUserIds) {
      await this.createAndSend({
        userId,
        type: "document",
        title: "New Attachment",
        message: `${uploaderName} uploaded a new file "${fileName}" in request ${requestNumber}`,
        projectId,
        requestId,
        link: `/requests/${requestId}`,
      });
    }
  }

  // Notify when a message is added to the request conversation
  async notifyMessage(
    requestId: string,
    requestNumber: string,
    projectId: string,
    senderName: string,
    recipientUserIds: string[]
  ) {
    const promises = recipientUserIds.map(async (userId) => {
      try {
        // 1. Skip if user is already viewing the request
        if (notificationWss.isUserViewingRequest(userId, requestId)) {
          return;
        }

        // 2. Check for an existing unread message notification for this request
        const existing = await storage.findUnreadNotification(userId, requestId, "mention");

        if (existing) {
          // Update existing notification to bring it to top and show latest message
          const updated = await storage.updateNotification(existing.id, {
            title: "New Message",
            message: `${senderName} sent a message in request ${requestNumber}`,
            createdAt: new Date().toISOString()
          });

          if (updated) {
            // Notify UI via WebSocket
            notificationWss.sendNotification(userId, updated);
          }
        } else {
          // Create new notification
          await this.createAndSend({
            userId,
            type: "mention",
            title: "New Message",
            message: `${senderName} sent a message in request ${requestNumber}`,
            projectId,
            requestId,
            link: `/requests/${requestId}`,
          });
        }
      } catch (err) {
        console.error(`[notifyMessage] Notification failed for user ${userId}:`, err);
      }
    });

    await Promise.all(promises);
  }

  // Helper to determine who should receive notifications for a request/message
  // based on their specialization (purpose) and if they are Project Managers
  async getQualifiedRecipients(requestId: string, revisionId: string, senderId: string) {
    try {
      const request = await storage.getRequest(requestId);
      if (!request) return [];

      const project = await storage.getProject(request.projectId);
      const purposes = await storage.getRequestPurposes(revisionId);

      const recipientUserIdSet = new Set<string>();
      const managerTitles = ["project manager", "مدير مشروع"];

      const purposeIds = purposes.map(p => p.purposeId);
      let matchingPositionTitles = new Set<string>();

      if (purposeIds.length > 0) {
        const allPositions = await storage.getAllPositions();
        matchingPositionTitles = new Set(
          allPositions
            .filter(p => p.purposeId && purposeIds.includes(p.purposeId))
            .map(p => p.titleEnglish)
        );
      }

      // Collect organizations involved: Contractor, Consultant, and the Project's own Org (Client)
      let orgIdArr = [request.contractorId, request.consultantId, project?.organizationId].filter(Boolean) as string[];

      const allTypes = await storage.getAllRequestTypes();
      const ncrTypeId = allTypes.find(t => t.code === "NCR")?.id;
      const rncrTypeId = allTypes.find(t => t.code === "RNCR")?.id;

      // Do not notify Contractors about NCRs until Consultant Manager Approval
      if (request.requestTypeId === ncrTypeId) {
        const revision = await storage.getRequestRevisionById(revisionId);
        // If the revision doesn't have a final approval status code, it's still with the consultant
        if (!revision?.approvalStatusCode) {
          orgIdArr = orgIdArr.filter(id => id !== request.contractorId);
        }
      }

      // Do not notify Consultant/Client about RNCRs until Contractor Manager Approval
      if (request.requestTypeId === rncrTypeId) {
        const revision = await storage.getRequestRevisionById(revisionId);
        // If the revision is still in preparation or PM approval (step < 1003), do not notify consultant/client
        if (revision?.currentStepId && revision.currentStepId < 1003) {
          orgIdArr = orgIdArr.filter(id => id === request.contractorId);
        }
      }

      const orgIds = Array.from(new Set(orgIdArr));

      for (const orgId of orgIds) {
        const members = await storage.getTeamMembersByOrganization(orgId);
        const isClientOrg = orgId === project?.organizationId;

        for (const tm of members) {
          const position = tm.position?.toLowerCase() || "";
          const isPM = managerTitles.some(title => position.includes(title));

          // Filtering logic:
          // 1. Client Org members only get notified if they are PMs.
          // 2. Others get notified if they are PMs OR if their position matches one of the request purposes.
          if (isClientOrg) {
            if (!isPM) continue;
          } else if (purposeIds.length > 0) {
            const isMatch = matchingPositionTitles.has(tm.position || "");
            if (!isPM && !isMatch) continue;
          }

          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            // Don't notify the sender themselves
            if (tmUser.userId !== senderId) {
              recipientUserIdSet.add(tmUser.userId);
            }
          }
        }
      }

      return Array.from(recipientUserIdSet);
    } catch (e) {
      console.error("[getQualifiedRecipients] Failed:", e);
      return [];
    }
  }

  // Notify Contractor members when a Snag List is submitted with smart specialization filtering
  async notifySnagListSubmitted(
    snagListId: string,
    snagListTitle: string,
    serialNumber: number,
    projectId: string,
    submittedByName: string,
    senderId?: string
  ) {
    try {
      const project = await storage.getProject(projectId);
      if (!project?.contractorId) return;

      const list = await storage.getSnagList(snagListId);
      const contractorMembers = await storage.getTeamMembersByOrganization(project.contractorId);
      const recipientUserIds = new Set<string>();
      const managerTitles = ["project manager", "مدير مشروع"];

      let matchingPositionTitles = new Set<string>();
      if (list?.purposeId) {
        const allPositions = await storage.getAllPositions();
        matchingPositionTitles = new Set(
          allPositions
            .filter(p => p.purposeId === list.purposeId)
            .map(p => p.titleEnglish)
        );
      }

      for (const tm of contractorMembers) {
        const position = tm.position?.toLowerCase() || "";
        const isPM = managerTitles.some(title => position.includes(title));
        const isMatch = matchingPositionTitles.has(tm.position || "");

        // If list has a specific purpose, only notify PMs or matching specialized engineers
        if (list?.purposeId && !isPM && !isMatch) {
          continue;
        }

        const tmUsers = await storage.getTeamMemberUsers(tm.id);
        for (const tmUser of tmUsers) {
          if (!senderId || tmUser.userId !== senderId) {
            recipientUserIds.add(tmUser.userId);
          }
        }
      }

      const listNumber = `SL_${String(serialNumber).padStart(2, '0')}`;

      for (const userId of Array.from(recipientUserIds)) {
        await this.createAndSend({
          userId,
          type: "assignment",
          title: "New Snag List Submitted",
          message: `Snag List ${listNumber} (${snagListTitle}) has been submitted by ${submittedByName}`,
          projectId,
          link: `/projects/${projectId}/snag-list?listId=${snagListId}`,
        });
      }
    } catch (error) {
      console.error("[notifySnagListSubmitted] Failed:", error);
    }
  }

  // Alerts the people who can act on a shortage: project managers and whoever keeps the
  // store. Called only with materials that have just crossed below their minimum, so a
  // material sitting below the line does not re-alert on every subsequent movement.
  async notifyLowStock(
    projectId: string,
    materials: { materialName: string; balance: number; minStockLevel: number; unit: string }[],
    senderId?: string
  ) {
    if (materials.length === 0) return;
    try {
      const project = await storage.getProject(projectId);
      if (!project) return;

      // Both the developer and the contractor organisation may hold the storekeeper.
      const orgIds = Array.from(
        new Set([project.organizationId, project.contractorId].filter(Boolean) as string[])
      );

      const titles = ["project manager", "مدير مشروع", "storekeeper", "store keeper", "أمين مستودع", "أمين المستودع"];
      const recipientUserIds = new Set<string>();

      for (const orgId of orgIds) {
        const members = await storage.getTeamMembersByOrganization(orgId);
        for (const tm of members) {
          const position = (tm.position || "").trim().toLowerCase();
          if (!position || !titles.some((t) => position.includes(t))) continue;

          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            // The person who caused the shortage already knows; telling them adds nothing.
            if (!senderId || tmUser.userId !== senderId) recipientUserIds.add(tmUser.userId);
          }
        }
      }

      if (recipientUserIds.size === 0) return;

      const minLabel = translate("notifications", "warehouse.min_stock_label");
      const summary = materials
        .map((m) => `${m.materialName}: ${m.balance} ${m.unit} (${minLabel} ${m.minStockLevel})`)
        .join(" · ");
      const title =
        materials.length === 1
          ? translate("notifications", "warehouse.low_stock_single")
          : translate("notifications", "warehouse.low_stock_multiple", { count: materials.length });

      for (const userId of Array.from(recipientUserIds)) {
        await this.createAndSend({
          userId,
          type: "warning",
          title,
          message: translate("notifications", "warehouse.low_stock_message", { summary }),
          projectId,
          link: `/projects/${projectId}/warehouse?tab=balances`,
        });
      }
    } catch (error) {
      // A failed alert must never roll back a stock movement that already happened.
      console.error("[notifyLowStock] Failed:", error);
    }
  }
  // ==================== PROCUREMENT ====================

  // Helper: find project managers (and optionally a specific user) for a project's organisations.
  private async getProcurementRecipients(projectId: string, excludeUserId?: string): Promise<string[]> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) return [];

      const orgIds = Array.from(
        new Set([project.organizationId, project.contractorId].filter(Boolean) as string[])
      );
      const managerTitles = ["project manager", "مدير مشروع"];
      const recipients = new Set<string>();

      for (const orgId of orgIds) {
        const members = await storage.getTeamMembersByOrganization(orgId);
        for (const tm of members) {
          const position = (tm.position || "").trim().toLowerCase();
          if (!managerTitles.some((t) => position.includes(t))) continue;
          const tmUsers = await storage.getTeamMemberUsers(tm.id);
          for (const tmUser of tmUsers) {
            if (!excludeUserId || tmUser.userId !== excludeUserId) recipients.add(tmUser.userId);
          }
        }
      }
      return Array.from(recipients);
    } catch (error) {
      console.error("[getProcurementRecipients] Failed:", error);
      return [];
    }
  }

  async notifyPoCreated(params: {
    projectId: string;
    poNumber: string;
    title: string;
    supplierName: string;
    totalAmount: string;
    poId: string;
    createdByUserId: string;
  }) {
    try {
      const recipients = await this.getProcurementRecipients(params.projectId, params.createdByUserId);
      for (const userId of recipients) {
        await this.createAndSend({
          userId,
          type: "info",
          title: translate("notifications", "procurement.po_created"),
          message: translate("notifications", "procurement.po_created_message", {
            poNumber: params.poNumber,
            supplierName: params.supplierName,
          }),
          projectId: params.projectId,
          link: `/projects/${params.projectId}/purchase-orders/${params.poId}`,
        });
      }
    } catch (error) {
      console.error("[notifyPoCreated] Failed:", error);
    }
  }

  async notifyPoApproved(params: {
    projectId: string;
    poNumber: string;
    approvedByName: string;
    poId: string;
    createdByUserId?: string | null;
    approvedByUserId: string;
  }) {
    try {
      const recipients = new Set<string>();
      // Always notify the person who created the PO
      if (params.createdByUserId && params.createdByUserId !== params.approvedByUserId) {
        recipients.add(params.createdByUserId);
      }
      // Also notify project managers
      const managers = await this.getProcurementRecipients(params.projectId, params.approvedByUserId);
      for (const id of managers) recipients.add(id);

      for (const userId of Array.from(recipients)) {
        await this.createAndSend({
          userId,
          type: "success",
          title: translate("notifications", "procurement.po_approved"),
          message: translate("notifications", "procurement.po_approved_message", {
            poNumber: params.poNumber,
            approvedByName: params.approvedByName,
          }),
          projectId: params.projectId,
          link: `/projects/${params.projectId}/purchase-orders/${params.poId}`,
        });
      }
    } catch (error) {
      console.error("[notifyPoApproved] Failed:", error);
    }
  }

  async notifyPoReceived(params: {
    projectId: string;
    poNumber: string;
    receivedByName: string;
    poId: string;
    receivedByUserId: string;
    isPartial: boolean;
    createdByUserId?: string | null;
  }) {
    try {
      const recipients = new Set<string>();
      if (params.createdByUserId && params.createdByUserId !== params.receivedByUserId) {
        recipients.add(params.createdByUserId);
      }
      const managers = await this.getProcurementRecipients(params.projectId, params.receivedByUserId);
      for (const id of managers) recipients.add(id);

      const titleKey = params.isPartial ? "procurement.po_partially_received" : "procurement.po_received";
      for (const userId of Array.from(recipients)) {
        await this.createAndSend({
          userId,
          type: params.isPartial ? "info" : "success",
          title: translate("notifications", titleKey),
          message: translate("notifications", "procurement.po_received_message", {
            poNumber: params.poNumber,
            receivedByName: params.receivedByName,
          }),
          projectId: params.projectId,
          link: `/projects/${params.projectId}/purchase-orders/${params.poId}`,
        });
      }
    } catch (error) {
      console.error("[notifyPoReceived] Failed:", error);
    }
  }

  async notifyRfqCreated(params: {
    projectId: string;
    rfqNumber: string;
    rfqId: string;
    createdByUserId: string;
  }) {
    try {
      const recipients = await this.getProcurementRecipients(params.projectId, params.createdByUserId);
      for (const userId of recipients) {
        await this.createAndSend({
          userId,
          type: "info",
          title: translate("notifications", "procurement.rfq_created"),
          message: translate("notifications", "procurement.rfq_created_message", {
            rfqNumber: params.rfqNumber,
          }),
          projectId: params.projectId,
          link: `/projects/${params.projectId}/rfqs/${params.rfqId}`,
        });
      }
    } catch (error) {
      console.error("[notifyRfqCreated] Failed:", error);
    }
  }

  async notifyQuotationReceived(params: {
    projectId: string;
    rfqNumber: string;
    supplierName: string;
    createdByUserId: string;
    rfqCreatedByUserId?: string | null;
    rfqId: string;
  }) {
    try {
      const recipients = new Set<string>();
      // Notify the person who created the RFQ
      if (params.rfqCreatedByUserId && params.rfqCreatedByUserId !== params.createdByUserId) {
        recipients.add(params.rfqCreatedByUserId);
      }
      const managers = await this.getProcurementRecipients(params.projectId, params.createdByUserId);
      for (const id of managers) recipients.add(id);

      for (const userId of Array.from(recipients)) {
        await this.createAndSend({
          userId,
          type: "info",
          title: translate("notifications", "procurement.quotation_received"),
          message: translate("notifications", "procurement.quotation_received_message", {
            supplierName: params.supplierName,
            rfqNumber: params.rfqNumber,
          }),
          projectId: params.projectId,
          link: `/projects/${params.projectId}/rfqs/${params.rfqId}`,
        });
      }
    } catch (error) {
      console.error("[notifyQuotationReceived] Failed:", error);
    }
  }
}

export const notificationService = new NotificationService();
