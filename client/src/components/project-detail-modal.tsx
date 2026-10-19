import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";

interface ProjectDetailModalProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "on-hold": { label: "On Hold", className: "bg-muted text-muted-foreground border-border" },
};

export function ProjectDetailModal({ project, open, onOpenChange }: ProjectDetailModalProps) {
  const { data: tasks = [] } = useQuery({
    queryKey: ["/api/tasks", project?.id],
    enabled: !!project,
    queryFn: async () => {
      const response = await fetch("/api/tasks");
      if (!response.ok) throw new Error("Failed to fetch tasks");
      const allTasks = await response.json();
      return allTasks.filter((t: any) => t.projectId === project?.id);
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents", project?.id],
    enabled: !!project,
    queryFn: async () => {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error("Failed to fetch documents");
      const allDocs = await response.json();
      return allDocs.filter((d: any) => d.projectId === project?.id);
    },
  });

  if (!project) return null;

  const statusInfo = statusConfig[project.status as keyof typeof statusConfig];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl">{project.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Project Details</p>
            </div>
            <Badge variant="outline" className={cn("border-none shadow-sm", statusInfo.className)}>
              {statusInfo.label}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Organization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{project.organizationId}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{project.location}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Contract Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">${project.contractValue}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Estimated Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">${project.estimatedCost}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Actual Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">${project.actualCost}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{project.progress}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {format(new Date(project.startDate), "MMM d, yyyy")} - {format(new Date(project.endDate), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>

            {project.description && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-2">
            {tasks.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No tasks for this project
                </CardContent>
              </Card>
            ) : (
              tasks.map((task: any) => (
                <Card key={task.id}>
                  <CardContent className="p-4">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">Status: {task.status}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-2">
            {documents.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No documents for this project
                </CardContent>
              </Card>
            ) : (
              documents.map((doc: any) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{doc.type} • {doc.size}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
