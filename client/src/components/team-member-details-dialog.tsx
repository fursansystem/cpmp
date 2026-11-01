import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Building2, CheckSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColor, getInitials } from "@/lib/member-avatar";
import type { TeamMember, Task } from "@shared/schema";

interface TeamMemberDetailsDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks?: Task[];
  organizationName?: string | null;
  usernames?: string[];
}

export function TeamMemberDetailsDialog({
  member,
  open,
  onOpenChange,
  tasks = [],
  organizationName,
  usernames = [],
}: TeamMemberDetailsDialogProps) {
  if (!member) return null;

  const activeTasks = tasks.filter(
    t => t.assignedTo === member.id && t.status !== "completed"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Member Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20 shrink-0">
              <AvatarFallback
                className={cn(
                  "font-semibold text-2xl ring-2",
                  avatarColor(member.id || member.name),
                )}
              >
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold font-display leading-tight break-words">
                {member.name}
              </h3>
              {member.position ? (
                <p className="text-sm font-medium text-primary mt-0.5">
                  {member.position}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 mt-0.5">
                  No position set
                </p>
              )}
              {organizationName && (
                <Badge variant="secondary" className="mt-2 max-w-full">
                  <Building2 className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{organizationName}</span>
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {usernames.length > 0 && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    {usernames.length === 1 ? "Username" : `Usernames (${usernames.length})`}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="details-usernames">
                    {usernames.map((u) => (
                      <span
                        key={u}
                        className="px-2 py-0.5 rounded-md bg-muted text-sm font-medium"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {member.email && (
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p className="text-sm break-all">{member.email}</p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center gap-3">
                <CheckSquare
                  className={cn(
                    "w-5 h-5 flex-shrink-0",
                    activeTasks.length > 0 ? "text-primary" : "text-muted-foreground/50",
                  )}
                />
                <p className="text-sm font-medium text-muted-foreground flex-1">
                  Active Tasks
                </p>
                <Badge variant={activeTasks.length > 0 ? "default" : "secondary"}>
                  {activeTasks.length}
                </Badge>
              </div>

              {activeTasks.length > 0 ? (
                <div className="space-y-2 mt-3 pl-8">
                  {activeTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{task.priority}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 mt-3 pl-8">
                  No active tasks
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
