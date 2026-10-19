import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { OrganizationCard } from "@/components/organization-card";
import { OrganizationFormDialog } from "@/components/organization-form-dialog";
import { OrganizationDetailsDialog } from "@/components/organization-details-dialog";
import { InviteOrganizationDialog } from "@/components/invite-organization-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { OrganizationPermissions, type UserRole } from "@shared/permissions";
import type { Organization, Project, InsertOrganization, TeamMember } from "@shared/schema";

export default function Organizations() {
  const { user } = useAuth();
  // Permissions come from the shared OrganizationPermissions rules the API enforces
  const permissionUser = user
    ? {
        id: user.id,
        role: user.role as UserRole,
        organizationId: user.organizationId,
        organizationSectorType: user.organizationSectorType,
      }
    : null;
  const canCreateOrg = !!permissionUser && OrganizationPermissions.canCreate(permissionUser);
  const canDelete = !!permissionUser && OrganizationPermissions.canDelete(permissionUser);
  const canInvite = !!permissionUser && OrganizationPermissions.canInvite(permissionUser);
  const canEditOrganization = (organization: Organization) =>
    !!permissionUser &&
    OrganizationPermissions.canEdit(permissionUser, organization, permissionUser.organizationId);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [viewingOrganization, setViewingOrganization] = useState<Organization | null>(null);

  const { data: organizations = [], isLoading: organizationsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertOrganization) => {
      return await apiRequest("POST", "/api/organizations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Success", description: "Organization created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertOrganization }) => {
      return await apiRequest("PATCH", `/api/organizations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Success", description: "Organization updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/organizations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Success", description: "Organization deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { projectId: string; role: string; email?: string; organizationId?: string }) => {
      return await apiRequest("POST", "/api/project-invitations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-invitations?scope=sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({
        title: "Invitation sent",
        description: "They join the project once they accept it.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const organizationsWithCounts = useMemo(() => {
    return organizations.map(organization => {
      // Calculate project count based on organization's sector type
      let projectCount = 0;
      if (organization.sectorType === "Developer") {
        projectCount = projects.filter(p => p.organizationId === organization.id).length;
      } else if (organization.sectorType === "Contractor") {
        projectCount = projects.filter(p => p.contractorId === organization.id).length;
      } else if (organization.sectorType === "Consultant") {
        projectCount = projects.filter(p => p.consultantId === organization.id).length;
      } else {
        // For other sector types, count as developer
        projectCount = projects.filter(p => p.organizationId === organization.id).length;
      }
      
      const memberCount = teamMembers.filter(m => m.organizationId === organization.id).length;
      return {
        id: organization.id,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        address: organization.address || undefined,
        sectorType: organization.sectorType || undefined,
        projectCount,
        memberCount,
      };
    });
  }, [organizations, projects, teamMembers]);

  const filteredOrganizations = useMemo(() => {
    return organizationsWithCounts.filter(organization => {
      const searchLower = searchQuery.toLowerCase();
      return (
        organization.name.toLowerCase().includes(searchLower) ||
        organization.email.toLowerCase().includes(searchLower)
      );
    });
  }, [organizationsWithCounts, searchQuery]);

  const handleCreateOrganization = async (data: InsertOrganization) => {
    if (editingOrganization) {
      await updateMutation.mutateAsync({ id: editingOrganization.id, data });
      setEditingOrganization(null);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleAddMember = async (organizationId: string, memberId: string) => {
    await apiRequest("PATCH", `/api/team/${memberId}`, { organizationId });
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
  };

  const handleRemoveMember = async (memberId: string) => {
    await apiRequest("PATCH", `/api/team/${memberId}`, { organizationId: null });
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Organizations</h1>
          <p className="text-muted-foreground">
            Manage your organization contacts and relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
        {canInvite && (
          <InviteOrganizationDialog
            trigger={
              <Button variant={canCreateOrg ? "outline" : "default"} data-testid="button-invite-organization">
                <Mail className="w-4 h-4 mr-2" />
                Invite Organization
              </Button>
            }
            onSubmit={async (data) => {
              await inviteMutation.mutateAsync(data);
            }}
          />
        )}
        {canCreateOrg && (
          <Button
            onClick={() => {
              setEditingOrganization(null);
              setDialogOpen(true);
            }}
            data-testid="button-new-organization"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Organization
          </Button>
        )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search organizations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {organizationsLoading ? (
        <div
          // Columns follow the card's own width rather than a fixed count, so a card
          // keeps a portrait shape instead of stretching across a third of a wide screen.
          className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
        >
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <div className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            {searchQuery ? (
              <p className="text-muted-foreground">
                No organizations match "{searchQuery}"
              </p>
            ) : (
              <div className="mx-auto max-w-sm space-y-3">
                <Building2 className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <p className="font-medium">No organizations yet</p>
                <p className="text-sm text-muted-foreground">
                  Organizations appear here once you invite them to one of your
                  projects, or once you share a project with them.
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div
          // Columns follow the card's own width rather than a fixed count, so a card
          // keeps a portrait shape instead of stretching across a third of a wide screen.
          className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
        >
          {filteredOrganizations.map((organization) => {
            const fullOrganization = organizations.find(o => o.id === organization.id);
            const canEditThisOrg = !!fullOrganization && canEditOrganization(fullOrganization);
            return (
              <OrganizationCard
                key={organization.id}
                {...organization}
                logo={fullOrganization?.logo}
                canEdit={canEditThisOrg}
                canDelete={canDelete}
                onViewDetails={() => {
                  if (fullOrganization) {
                    setViewingOrganization(fullOrganization);
                    setDetailsDialogOpen(true);
                  }
                }}
                onEdit={() => {
                  if (fullOrganization) {
                    setEditingOrganization(fullOrganization);
                    setDialogOpen(true);
                  }
                }}
                onRemove={() => {
                  if (confirm('Are you sure you want to delete this organization?')) {
                    deleteMutation.mutate(organization.id);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      <OrganizationFormDialog
        organization={editingOrganization || undefined}
        // Only a system administrator may set or change an organization's sector: it is
        // what the permission rules key off, so an organization cannot relabel itself.
        canChangeSector={user?.role === "super_admin"}
        onSubmit={handleCreateOrganization}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingOrganization(null);
        }}
      />

      <OrganizationDetailsDialog
        organization={viewingOrganization}
        open={detailsDialogOpen}
        onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) setViewingOrganization(null);
        }}
        canEdit={!!viewingOrganization && canEditOrganization(viewingOrganization)}
        canDeleteMember={canDelete}
        projects={projects}
        teamMembers={teamMembers}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
      />
    </div>
  );
}
