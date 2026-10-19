import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProjectsTable } from "@/components/projects-table";
import { ProjectCard } from "@/components/project-card";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { ProjectDetailModal } from "@/components/project-detail-modal";
import { ProjectPropertiesDialog } from "@/components/project-properties-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
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
import type { Project, Organization, InsertProject } from "@shared/schema";
import { formatLargeCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Projects() {
  const { user } = useAuth();

  // Get organizations to check sector type
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  // Check if user's organization is a Developer
  const userOrganization = user?.organizationId
    ? organizations.find(org => org.id === user.organizationId)
    : null;

  const canEdit = user?.role !== "user";
  const canCreateProject = canEdit && (user?.role === "super_admin" || user?.role === "developer_admin" || (user?.role === "org_admin" && userOrganization?.sectorType === "Developer"));

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [propertiesProject, setPropertiesProject] = useState<Project | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      return await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: "Project created successfully",
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
    mutationFn: async ({ id, data }: { id: string; data: InsertProject }) => {
      return await apiRequest("PATCH", `/api/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingProject(null);
      toast({
        title: "Success",
        description: "Project updated successfully",
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
      return await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: "Project deleted successfully",
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


  const filteredProjects = useMemo(() => {
    return projects
      .filter(project => {
        const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          project.location.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || project.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .map(project => {
        return {
          id: project.id,
          name: project.name,
          client: (project as any).developerName || "Unknown Developer",
          status: project.status as "active" | "pending" | "completed" | "overdue" | "on-hold",
          location: project.location,
          requestCount: (project as any).requestCount || 0,
          startDate: project.startDate,
          endDate: project.endDate,
          progress: project.progress,
        };
      });
  }, [projects, searchQuery, statusFilter]);

  const handleSubmitProject = async (data: InsertProject) => {
    // Picking a contractor or consultant invites them; it does not assign them. The
    // project is saved without those fields, then an invitation goes out for each one
    // chosen, and the field is filled only when that organization accepts.
    //
    // Clearing one is the opposite case and does travel with the save: ending the
    // engagement is the project owner's decision, so "None" means None.
    const { contractorId, consultantId, ...projectFields } = data;

    const removals: Record<string, null> = {};
    if (editingProject?.contractorId && !contractorId) removals.contractorId = null;
    if (editingProject?.consultantId && !consultantId) removals.consultantId = null;

    if (Object.keys(removals).length > 0) {
      const names = [
        removals.contractorId !== undefined ? "contractor" : null,
        removals.consultantId !== undefined ? "consultant" : null,
      ].filter(Boolean).join(" and ");
      const confirmed = confirm(
        `Remove the ${names} from this project? They lose access to it immediately, and the role stays open until you invite someone else.`,
      );
      if (!confirmed) return;
    }

    const project = editingProject
      ? await updateMutation.mutateAsync({
          id: editingProject.id,
          data: { ...projectFields, ...removals } as InsertProject,
        })
      : await createMutation.mutateAsync(projectFields as InsertProject);

    const projectId = editingProject ? editingProject.id : (project as any)?.id;
    if (!projectId) return;

    const invites: { role: "contractor" | "consultant"; organizationId: string }[] = [];
    if (contractorId && contractorId !== editingProject?.contractorId) {
      invites.push({ role: "contractor", organizationId: contractorId });
    }
    if (consultantId && consultantId !== editingProject?.consultantId) {
      invites.push({ role: "consultant", organizationId: consultantId });
    }

    for (const invite of invites) {
      try {
        await apiRequest("POST", "/api/project-invitations", { projectId, ...invite });
        toast({
          title: "Invitation sent",
          description: `Waiting for the ${invite.role} to accept before they join the project.`,
        });
      } catch (error: any) {
        toast({
          title: "Invitation not sent",
          description: error?.message || "The invitation could not be sent.",
          variant: "destructive",
        });
      }
    }

    if (invites.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingProject(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 pt-2 pb-8 space-y-10 animate-in fade-in duration-700 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-foreground/90 uppercase">Project Portfolio</h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Manage & Monitor Active Contracting Operations</p>
        </div>
        <div className="flex gap-2">
          {canCreateProject && (
            <ProjectFormDialog
              trigger={
                <Button 
                  data-testid="button-new-project" 
                  disabled={!canCreateProject}
                  className="bg-primary text-primary-foreground rounded-xl h-11 px-6 font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  {user?.role !== "org_admin" && <Plus className="w-4 h-4 mr-2" />}
                  New Project
                </Button>
              }
              project={editingProject || undefined}
              onSubmit={handleSubmitProject}
              open={dialogOpen}
              onOpenChange={handleDialogClose}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white dark:bg-muted/10 border-none shadow-sm rounded-xl h-11 focus-visible:ring-primary/20"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-muted/10 border-none shadow-sm rounded-xl h-11" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-2xl">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on-hold">On Hold</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 bg-white dark:bg-muted/10 p-1.5 rounded-xl shadow-sm border border-white dark:border-muted/20 h-11">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            className={cn("rounded-lg w-9 h-9", viewMode === "grid" && "bg-primary text-primary-foreground shadow-md")}
            data-testid="button-view-grid"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("table")}
            className={cn("rounded-lg w-9 h-9", viewMode === "table" && "bg-primary text-primary-foreground shadow-md")}
            data-testid="button-view-table"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {projectsLoading ? (
        viewMode === "grid" ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
                <div className="p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-2 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 flex-1" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        )
      ) : filteredProjects.length === 0 ? (
        <Card className="rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden">
          <div className="p-6 text-center text-muted-foreground">
            No projects found
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project: any) => {
            const fullProject = projects.find(p => p.id === project.id);
            const projectOrgId = (fullProject as any)?.organizationId || project.id;
            const isUserDevOrg = user?.role === "super_admin" || user?.role === "developer_admin" || (user?.role === "org_admin" && projectOrgId === user?.organizationId);
            return (
              <ProjectCard
                key={project.id}
                {...project}
                canEdit={canEdit && isUserDevOrg}
                onEdit={() => {
                  if (fullProject) {
                    setEditingProject(fullProject);
                    setDialogOpen(true);
                  }
                }}
                onDelete={() => {
                  if (confirm('Are you sure you want to delete this project?')) {
                    deleteMutation.mutate(project.id);
                  }
                }}
                onProperties={() => {
                  if (fullProject) {
                    setPropertiesProject(fullProject);
                    setPropertiesOpen(true);
                  }
                }}
              />
            );
          })}
        </div>
      ) : (
        <ProjectsTable
          projects={filteredProjects}
          canEdit={canEdit}
          currentUserOrgId={user?.organizationId}
          currentUserRole={user?.role}
          projectsData={projects}
          onView={(id) => {
            const fullProject = projects.find(p => p.id === id);
            if (fullProject) {
              setDetailProject(fullProject);
              setDetailsOpen(true);
            }
          }}
          onDelete={async (id) => {
            if (confirm('Are you sure you want to delete this project?')) {
              await deleteMutation.mutateAsync(id);
            }
          }}
        />
      )}

      <ProjectDetailModal
        project={detailProject}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      <ProjectPropertiesDialog
        project={propertiesProject}
        open={propertiesOpen}
        onOpenChange={setPropertiesOpen}
      />
    </div>
  );
}
