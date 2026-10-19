import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  client: string;
  status: "active" | "pending" | "completed" | "overdue" | "on-hold";
  requestCount?: number;
  startDate: string;
  endDate: string;
  progress: number;
}

interface ProjectsTableProps {
  projects: Project[];
  canEdit?: boolean;
  currentUserOrgId?: string | null;
  currentUserRole?: string;
  projectsData?: any[];
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const statusConfig = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "on-hold": { label: "On Hold", className: "bg-muted text-muted-foreground border-border" },
};

export function ProjectsTable({ projects, canEdit = true, currentUserOrgId, currentUserRole, projectsData = [], onView, onDelete }: ProjectsTableProps) {
  const [, navigate] = useLocation();
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project Name</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>Timeline</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const statusInfo = statusConfig[project.status];
            return (
              <TableRow key={project.id} className="hover-elevate" data-testid={`row-project-${project.id}`}>
                <TableCell className="font-medium">
                  <span 
                    className="hover:text-primary cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    {project.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{project.client}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("border-none shadow-sm", statusInfo.className)} data-testid={`badge-status-${project.status}`}>
                    {statusInfo.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => navigate(`/projects/${project.id}/requests`)}
                  >
                    <span className="font-medium text-foreground">{project.requestCount || 0}</span>
                    <span className="text-xs">Requests</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(project.startDate), "MMM d")} - {format(new Date(project.endDate), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Progress value={project.progress} className="h-2 flex-1" />
                    <span className="text-sm text-muted-foreground">{project.progress}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const fullProject = projectsData.find(p => p.id === project.id);
                    const projectOrgId = (fullProject as any)?.organizationId;
                    const canEditThisProject = canEdit && (currentUserRole === "super_admin" || currentUserRole === "developer_admin" || (currentUserRole === "org_admin" && projectOrgId === currentUserOrgId));
                    const canDeleteProject = currentUserRole === "super_admin";
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid="button-project-menu">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onView?.(project.id)} data-testid="menu-item-view">
                            View Details
                          </DropdownMenuItem>
                          {canEditThisProject && (
                            <DropdownMenuItem 
                              onClick={() => {}} // Placeholder for edit action if added
                              data-testid="menu-item-edit"
                            >
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDeleteProject && (
                            <DropdownMenuItem 
                              onClick={() => onDelete?.(project.id)} 
                              className="text-destructive"
                              data-testid="menu-item-delete"
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
