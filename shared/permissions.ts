// Role-based permission utilities for the application
// Based on privileges matrix:
// - Super Admin: Full access to everything
// - Developer Admin: Projects (only if creator), Members (same project), Users (all except super_admin)
// - Organization Admin: View company projects, Same org members, Create org_admin/user
// - User: View company projects, Own member only, Cannot create users

export type UserRole = "user" | "super_admin" | "org_admin" | "developer_admin";

export interface PermissionUser {
  id: string;
  role: UserRole;
  teamMemberId?: string | null;
  organizationId?: string | null; // From linked team member
  organizationSectorType?: string | null; // Sector of the linked organization
}

export interface PermissionProject {
  id: string;
  creatorId?: string | null;
  organizationId: string;
  contractorId?: string | null;
  consultantId?: string | null;
}

export interface PermissionMember {
  id: string;
  organizationId?: string | null;
}

// Context for developer admin project-scoped access
export interface DeveloperAdminContext {
  allowedMemberIds: string[]; // Member IDs from projects the developer created
}

// Project Permissions
export const ProjectPermissions = {
  canViewAll(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },

  canView(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (!userOrgId) return false;
    
    // Check if user's organization is linked as Developer, Contractor, or Consultant
    const isLinkedOrg = project.organizationId === userOrgId || 
                        project.contractorId === userOrgId || 
                        project.consultantId === userOrgId;
    
    return isLinkedOrg;
  },

  canCreate(user: PermissionUser): boolean {
    return user.role === "super_admin" || user.role === "developer_admin" || user.role === "org_admin";
  },

  canEdit(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can edit projects in their organization (only if they are the Developer)
      return project.organizationId === userOrgId;
    }
    if (user.role === "org_admin") {
      // Org admin can only edit projects if their organization is the Developer
      return project.organizationId === userOrgId;
    }
    return false;
  },

  canDelete(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can delete projects only if they are the Developer organization
      return project.organizationId === userOrgId;
    }
    if (user.role === "org_admin") {
      // Org admin can only delete projects if their organization is the Developer
      return project.organizationId === userOrgId;
    }
    return false;
  },
};

// Member Permissions
export const MemberPermissions = {
  canViewAll(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },

  canView(user: PermissionUser, member: PermissionMember, userOrgId?: string | null, devAdminContext?: DeveloperAdminContext): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can view members in their organization
      return member.organizationId === userOrgId;
    }
    if (user.role === "org_admin") {
      return member.organizationId === userOrgId;
    }
    if (user.role === "user") {
      // User can view all members in their organization
      return member.organizationId === userOrgId;
    }
    return false;
  },

  canCreate(user: PermissionUser): boolean {
    return user.role === "super_admin" || user.role === "developer_admin" || user.role === "org_admin";
  },

  canEdit(user: PermissionUser, member: PermissionMember, userOrgId?: string | null, devAdminContext?: DeveloperAdminContext): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can only edit members assigned to their projects
      if (!devAdminContext) return false;
      return devAdminContext.allowedMemberIds.includes(member.id);
    }
    if (user.role === "org_admin") {
      return member.organizationId === userOrgId;
    }
    if (user.role === "user") {
      return member.id === user.teamMemberId;
    }
    return false;
  },

  canDelete(user: PermissionUser, member: PermissionMember, userOrgId?: string | null, devAdminContext?: DeveloperAdminContext): boolean {
    // Only super_admin can delete team members
    return user.role === "super_admin";
  },
};

// User Creation Permissions
export const UserCreationPermissions = {
  canCreateUsers(user: PermissionUser): boolean {
    return user.role !== "user";
  },

  getAllowedRolesToCreate(creatorRole: UserRole): UserRole[] {
    switch (creatorRole) {
      case "super_admin":
        return ["user", "super_admin", "org_admin", "developer_admin"];
      case "developer_admin":
        return ["user"]; // Only user role
      case "org_admin":
        return ["user"]; // Only user role
      default:
        return [];
    }
  },

  canCreateRole(creatorRole: UserRole, targetRole: UserRole): boolean {
    const allowed = this.getAllowedRolesToCreate(creatorRole);
    return allowed.includes(targetRole);
  },
};

// User Editing Permissions
export interface PermissionEditUser {
  id: string;
  organizationId?: string | null; // From linked team member
}

export const UserEditingPermissions = {
  canEdit(user: PermissionUser, targetUser: PermissionEditUser, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can edit users in their organization
      return targetUser.organizationId === userOrgId;
    }
    if (user.role === "org_admin") {
      // Org admin can edit users in their organization
      return targetUser.organizationId === userOrgId;
    }
    // Users can only edit their own profile
    if (user.role === "user") {
      return user.id === targetUser.id;
    }
    return false;
  },

  canDelete(user: PermissionUser, targetUser: PermissionEditUser, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (user.role === "developer_admin") {
      // Developer admin can delete users in their organization
      return targetUser.organizationId === userOrgId;
    }
    if (user.role === "org_admin") {
      // Org admin can delete users in their organization
      return targetUser.organizationId === userOrgId;
    }
    return false;
  },
};

// Organization Permissions
//
// An organization's own data belongs to that organization alone. Nobody enters it on
// someone else's behalf: a developer_admin from a Developer organization *invites* a
// contractor or consultant by email, and the invitee registers its own organization from
// the invitation link.
//
// Visibility therefore follows real working relationships, not who typed the record in.
// The caller passes the organization IDs related to the user's own organization
// (`linkedOrgIds`), which the server derives from two places: organizations that share a
// project, and organizations with a live project invitation either way. The link is
// one-directional: the inviting developer sees the organizations it invited.
export interface PermissionOrganization {
  id: string;
}

const DEVELOPER_SECTOR = "Developer";

// Sectors a developer_admin is allowed to invite
export const CREATABLE_SECTOR_TYPES = ["Contractor", "Consultant"] as const;

export const OrganizationPermissions = {
  canViewAll(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },

  canView(
    user: PermissionUser,
    organization: PermissionOrganization,
    userOrgId?: string | null,
    linkedOrgIds?: string[],
  ): boolean {
    if (user.role === "super_admin") return true;
    if (!userOrgId) return false;
    if (organization.id === userOrgId) return true;
    // Organizations that accepted an invitation from the user's own organization
    return !!linkedOrgIds?.includes(organization.id);
  },

  // Creating an organization by hand is a super_admin action. A developer invites.
  canCreate(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },

  // Who may send an invitation to a contractor or consultant
  canInvite(user: PermissionUser): boolean {
    if (user.role === "super_admin") return true;
    return user.role === "developer_admin" && user.organizationSectorType === DEVELOPER_SECTOR;
  },

  // Which sector types may be invited
  canInviteSector(user: PermissionUser, sectorType?: string | null): boolean {
    if (!sectorType) return false;
    return (CREATABLE_SECTOR_TYPES as readonly string[]).includes(sectorType);
  },

  // Which sector types the user may give to an organization they create
  canCreateSector(user: PermissionUser, sectorType?: string | null): boolean {
    if (user.role === "super_admin") return true;
    return false;
  },

  // An organization's data is maintained by that organization alone. A developer who can
  // see an invited organization still cannot change anything about it.
  canEdit(
    user: PermissionUser,
    organization: PermissionOrganization,
    userOrgId?: string | null,
  ): boolean {
    if (user.role === "super_admin") return true;
    if (!userOrgId) return false;
    // An admin of an organization — whichever sector it is in — maintains its own record
    const isOrganizationAdmin = user.role === "org_admin" || user.role === "developer_admin";
    return isOrganizationAdmin && organization.id === userOrgId;
  },

  canDelete(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },
};

// Project Invitations
//
// A developer offers the contractor or consultant role on one of its projects; the
// invited organization accepts or rejects. Until it accepts, projects.contractorId /
// consultantId stays empty, so the invitation grants no access to the project itself —
// only the right to answer it.
export interface PermissionInvitation {
  invitingOrganizationId: string;
  invitedOrganizationId?: string | null;
  status: string;
}

export const ProjectInvitationPermissions = {
  // Inviting is an act of the project's developer organization
  canInvite(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (!userOrgId || project.organizationId !== userOrgId) return false;
    return user.role === "developer_admin" || user.role === "org_admin";
  },

  // Withdrawing one is the same act, so the same people may do it
  canWithdraw(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return this.canInvite(user, project, userOrgId);
  },

  // Taking on a project commits the organization, so it is an administrator's decision,
  // and only for the organization actually being invited.
  canRespond(
    user: PermissionUser,
    invitation: PermissionInvitation,
    respondingOrgId?: string | null,
  ): boolean {
    if (invitation.status !== "pending") return false;
    if (user.role === "super_admin") return true;
    if (!respondingOrgId) return false;
    if (invitation.invitedOrganizationId !== respondingOrgId) return false;
    return user.role === "org_admin" || user.role === "developer_admin";
  },
};

// Progress Matrix & Payment Certificates (مصفوفة الإنجاز والمستخلصات)
// - Edit weights/units/manual cells: Contractor or Owner (Developer) organization, or super_admin. Consultant is view-only.
// - Locked cells (from approved WIRs): only super_admin, with a mandatory reason.
// - Certificates: Contractor creates/submits → Consultant approves/rejects → Owner marks paid. super_admin can do all.
export const ProgressMatrixPermissions = {
  canView(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return ProjectPermissions.canView(user, project, userOrgId);
  },

  canEdit(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (!userOrgId) return false;
    return project.contractorId === userOrgId || project.organizationId === userOrgId;
  },

  canOverrideLocked(user: PermissionUser): boolean {
    return user.role === "super_admin";
  },

  canSubmitCertificate(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    return !!userOrgId && project.contractorId === userOrgId;
  },

  canApproveCertificate(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    return !!userOrgId && project.consultantId === userOrgId;
  },

  canMarkPaid(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    return !!userOrgId && project.organizationId === userOrgId;
  },

  forProject(user: PermissionUser, project: PermissionProject, userOrgId?: string | null) {
    return {
      canView: this.canView(user, project, userOrgId),
      canEdit: this.canEdit(user, project, userOrgId),
      canOverrideLocked: this.canOverrideLocked(user),
      canSubmitCertificate: this.canSubmitCertificate(user, project, userOrgId),
      canApproveCertificate: this.canApproveCertificate(user, project, userOrgId),
      canMarkPaid: this.canMarkPaid(user, project, userOrgId),
    };
  },
};

// Warehouse / inventory permissions.
//
// Two things make this module different from the rest:
//  1. Balances and the ledger are deliberately NOT filtered per user. A stock balance that
//     reads differently for two members of the same project is worse than useless, so
//     viewing is gated only by project membership.
//  2. Approving an issue voucher depends on the user's POSITION, not their role, and the
//     allowed positions are configured per project. That lookup needs the database, so it
//     lives in storage.canUserApproveIssues() and is passed in here as `isApproverPosition`.
export const InventoryPermissions = {
  canView(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return ProjectPermissions.canView(user, project, userOrgId);
  },

  // Recording what physically arrived or left is day-to-day storekeeper work: any member of
  // a linked organisation may do it. The documents behind it are what provide the control.
  canReceive(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return this.canView(user, project, userOrgId);
  },

  canIssue(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return this.canView(user, project, userOrgId);
  },

  // Receiving without a purchase order bypasses procurement entirely, so it sits above the
  // storekeeper: an admin, or someone holding an approver position on the project.
  canReceiveWithoutPo(
    user: PermissionUser,
    project: PermissionProject,
    userOrgId: string | null | undefined,
    isApproverPosition: boolean
  ): boolean {
    if (user.role === "super_admin") return true;
    if (!this.canView(user, project, userOrgId)) return false;
    return isApproverPosition || user.role === "developer_admin" || user.role === "org_admin";
  },

  // An adjustment changes a balance with no document behind it — the most abuse-prone
  // action in the module, so it is the most tightly gated.
  canAdjust(
    user: PermissionUser,
    project: PermissionProject,
    userOrgId: string | null | undefined,
    isApproverPosition: boolean
  ): boolean {
    if (user.role === "super_admin") return true;
    if (!this.canView(user, project, userOrgId)) return false;
    return isApproverPosition || user.role === "developer_admin" || user.role === "org_admin";
  },

  // Decided by position, configured per project. Closed by default: with no approver
  // positions configured, nobody but a super admin can approve.
  canApproveIssue(user: PermissionUser, isApproverPosition: boolean): boolean {
    if (user.role === "super_admin") return true;
    return isApproverPosition;
  },

  canCancelIssue(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return this.canView(user, project, userOrgId);
  },

  canTransfer(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    return this.canView(user, project, userOrgId);
  },

  canManageWarehouses(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (!this.canView(user, project, userOrgId)) return false;
    return user.role === "developer_admin" || user.role === "org_admin";
  },

  // Who may approve is itself an administrative setting, not something an approver can
  // widen for themselves.
  canManageApprovers(user: PermissionUser, project: PermissionProject, userOrgId?: string | null): boolean {
    if (user.role === "super_admin") return true;
    if (!this.canView(user, project, userOrgId)) return false;
    return user.role === "developer_admin" || user.role === "org_admin";
  },

  forProject(
    user: PermissionUser,
    project: PermissionProject,
    userOrgId: string | null | undefined,
    isApproverPosition: boolean
  ) {
    return {
      canView: this.canView(user, project, userOrgId),
      canReceive: this.canReceive(user, project, userOrgId),
      canIssue: this.canIssue(user, project, userOrgId),
      canReceiveWithoutPo: this.canReceiveWithoutPo(user, project, userOrgId, isApproverPosition),
      canAdjust: this.canAdjust(user, project, userOrgId, isApproverPosition),
      canApproveIssue: this.canApproveIssue(user, isApproverPosition),
      canCancelIssue: this.canCancelIssue(user, project, userOrgId),
      canTransfer: this.canTransfer(user, project, userOrgId),
      canManageWarehouses: this.canManageWarehouses(user, project, userOrgId),
      canManageApprovers: this.canManageApprovers(user, project, userOrgId),
    };
  },
};
