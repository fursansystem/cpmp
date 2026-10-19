import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TeamMemberCard } from "@/components/team-member-card";
import { TeamMemberFormDialog } from "@/components/team-member-form-dialog";
import { TeamMemberDetailsDialog } from "@/components/team-member-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { TeamMember, Task, InsertTeamMember, Organization } from "@shared/schema";

export default function Team() {
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin" || user?.role === "developer_admin" || user?.role === "org_admin";
  const canDelete = user?.role === "super_admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [viewingMember, setViewingMember] = useState<TeamMember | null>(null);

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: userTeamMembers = [] } = useQuery<{ userId: string; teamMemberId: string }[]>({
    queryKey: ["/api/user-team-members"],
  });

  const { data: users = [] } = useQuery<{ id: string; username: string }[]>({
    queryKey: ["/api/users"],
  });

  // Get user's organization directly from session (populated by backend)
  const userOrganizationId = (user?.role === "developer_admin" || user?.role === "org_admin") 
    ? user?.organizationId 
    : null;

  const [organizationFilter, setOrganizationFilter] = useState("all");

  // Set default organization filter when userOrganizationId is available
  useEffect(() => {
    if ((user?.role === "developer_admin" || user?.role === "org_admin") && userOrganizationId) {
      setOrganizationFilter(userOrganizationId);
    }
  }, [userOrganizationId, user?.role]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertTeamMember) => {
      return await apiRequest("POST", "/api/team", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      toast({
        title: "Success",
        description: "Team member added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertTeamMember }) => {
      return await apiRequest("PATCH", `/api/team/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      toast({
        title: "Success",
        description: "Team member updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/team/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-team-members"] });
      toast({
        title: "Success",
        description: "Team member removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const teamMembersWithTaskCount = useMemo(() => {
    return teamMembers.map(member => {
      const activeTasksCount = tasks.filter(
        t => t.assignedTo === member.id && t.status !== "completed"
      ).length;
      const organization = organizations.find(o => o.id === member.organizationId);
      
      // Find associated username
      const utm = userTeamMembers.find(link => link.teamMemberId === member.id);
      const associatedUser = utm ? users.find(u => u.id === utm.userId) : null;
      
      return {
        id: member.id,
        name: member.name,
        nameArabic: member.nameArabic,
        email: member.email,
        position: member.position,
        organizationId: member.organizationId,
        organizationName: organization?.name || null,
        activeTasksCount,
        username: associatedUser?.username || null,
      };
    });
  }, [teamMembers, tasks, organizations, userTeamMembers, users]);

  const filteredTeamMembers = useMemo(() => {
    return teamMembersWithTaskCount.filter(member => {
      const matchesSearch = 
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.position?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (member.organizationName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
      // Apply role-based visibility
      if (user?.role === "developer_admin" || user?.role === "org_admin") {
        // Only show members from their organization
        const memberVisible = member.organizationId === userOrganizationId;
        if (!memberVisible) return false;
      }
      
      const matchesOrg = organizationFilter === "all" || member.organizationId === organizationFilter;
      return matchesSearch && matchesOrg;
    });
  }, [teamMembersWithTaskCount, searchQuery, organizationFilter, user?.role, userOrganizationId]);

  const handleCreateTeamMember = async (data: InsertTeamMember) => {
    // Auto-assign to developer_admin's organization
    const finalData = {
      ...data,
      organizationId: user?.role === "developer_admin" ? (userOrganizationId || data.organizationId) : data.organizationId,
    };
    await createMutation.mutateAsync(finalData);
  };

  const handleEditMember = (member: typeof filteredTeamMembers[0]) => {
    const fullMember = teamMembers.find(m => m.id === member.id);
    if (fullMember) {
      setEditingMember(fullMember);
      setDialogOpen(true);
    }
  };

  const handleUpdateMember = async (data: InsertTeamMember) => {
    if (editingMember) {
      await updateMutation.mutateAsync({ id: editingMember.id, data });
      setEditingMember(null);
    }
  };

  const handleDeleteMember = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Members</h1>
          <p className="text-muted-foreground">
            Manage your team members and assignments
          </p>
        </div>
        {canEdit && (
          <TeamMemberFormDialog
            trigger={
              <Button data-testid="button-new-member">
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            }
            onSubmit={editingMember ? handleUpdateMember : handleCreateTeamMember}
            member={editingMember || undefined}
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setEditingMember(null);
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        {(user?.role === "super_admin" || user?.role === "developer_admin" || user?.role === "org_admin") ? (
          <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-organization-filter">
              <SelectValue placeholder="Filter by organization" />
            </SelectTrigger>
            <SelectContent>
              {user?.role === "super_admin" && <SelectItem value="all">All Organizations</SelectItem>}
              {organizations
                .filter(org => {
                  if (user?.role === "super_admin") return true;
                  return org.id === userOrganizationId;
                })
                .map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {teamLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
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
      ) : filteredTeamMembers.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-muted-foreground">
            No team members found
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {filteredTeamMembers.map((member) => {
            const fullMember = teamMembers.find(m => m.id === member.id);
            return (
              <TeamMemberCard
                key={member.id}
                {...member}
                canEdit={canEdit}
                canDelete={canDelete}
                onViewDetails={() => {
                  if (fullMember) {
                    setViewingMember(fullMember);
                    setDetailsDialogOpen(true);
                  }
                }}
                onEdit={() => handleEditMember(member)}
                onRemove={() => handleDeleteMember(member.id)}
              />
            );
          })}
        </div>
      )}

      <TeamMemberDetailsDialog
        member={viewingMember}
        open={detailsDialogOpen}
        onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) setViewingMember(null);
        }}
        tasks={tasks}
        organizationName={viewingMember ? organizations.find(o => o.id === viewingMember.organizationId)?.name || null : null}
        username={viewingMember ? teamMembersWithTaskCount.find(m => m.id === viewingMember.id)?.username : null}
      />
    </div>
  );
}
