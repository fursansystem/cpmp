import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Calendar, User, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TaskItemProps {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in-progress" | "completed";
  type?: "general" | "inspection_request" | "permission_request" | "approval_request";
  assignedTo?: string;
  dueDate?: string;
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const priorityConfig = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-chart-3 text-white" },
  high: { label: "High", className: "bg-chart-1 text-white" },
  urgent: { label: "Urgent", className: "bg-destructive text-destructive-foreground" },
};

const typeConfig = {
  general: { label: "General", className: "bg-muted text-muted-foreground" },
  inspection_request: { label: "Inspection Request", className: "bg-blue-500 text-white" },
  permission_request: { label: "Permission to Work", className: "bg-purple-500 text-white" },
  approval_request: { label: "Approval Request", className: "bg-orange-500 text-white" },
};

export function TaskItem({
  title,
  priority,
  status,
  type = "general",
  assignedTo,
  dueDate,
  onToggle,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const priorityInfo = priorityConfig[priority];
  const typeInfo = typeConfig[type];
  const isCompleted = status === "completed";

  return (
    <div className="flex items-center gap-4 p-4 border rounded-md hover-elevate" data-testid="task-item">
      <Checkbox
        checked={isCompleted}
        onCheckedChange={onToggle}
        data-testid="checkbox-task"
      />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
            {title}
          </p>
          <Badge className={priorityInfo.className} data-testid={`badge-priority-${priority}`}>
            {priorityInfo.label}
          </Badge>
          <Badge className={typeInfo.className} data-testid={`badge-type-${type}`}>
            {typeInfo.label}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {assignedTo && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{assignedTo}</span>
            </div>
          )}
          {dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(dueDate), "MMM d, yyyy")}</span>
            </div>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" data-testid="button-task-menu">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} data-testid="menu-item-edit">
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive" data-testid="menu-item-delete">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
