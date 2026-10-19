import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Building2, MapPin, ClipboardList, Calendar, MoreVertical, Pencil, Trash2, Settings, Folder } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectCardProps {
  id: string;
  name: string;
  client: string;
  status: "active" | "pending" | "completed" | "overdue" | "on-hold";
  location: string;
  requestCount?: number;
  startDate: string;
  endDate: string;
  progress: number;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onProperties?: () => void;
  showActions?: boolean;
}

const statusConfig = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "on-hold": { label: "On Hold", className: "bg-muted text-muted-foreground border-border" },
};

export function ProjectCard({
  id,
  name,
  client,
  status,
  location,
  requestCount = 0,
  startDate,
  endDate,
  progress,
  canEdit = true,
  onEdit,
  onDelete,
  onProperties,
  showActions = true,
}: ProjectCardProps) {
  const [, navigate] = useLocation();
  const statusInfo = statusConfig[status];

  return (
    <Card
      className="hover-elevate cursor-pointer rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl"
      onClick={() => navigate(`/projects/${id}`)}
      data-testid={`card-project-${id}`}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-medium font-display line-clamp-1">{name}</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("border-none shadow-sm", statusInfo.className)} data-testid={`badge-status-${status}`}>
              {statusInfo.label}
            </Badge>
            {showActions && (
              <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onProperties}
                  data-testid={`button-properties-${id}`}
                  title="Project Properties"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-options-${id}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-${id}`}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive focus:text-destructive"
                        data-testid={`menu-delete-${id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-foreground">Progress: {progress}%</p>
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{client}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="w-4 h-4 flex-shrink-0" />
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{requestCount}</span>
              <span className="text-xs">Requests</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span className="truncate text-xs">
              {format(new Date(startDate), "MMM d")} - {format(new Date(endDate), "MMM d")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
