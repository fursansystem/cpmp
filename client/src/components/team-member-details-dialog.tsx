import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Briefcase, Building2, CheckSquare, User } from "lucide-react";
import type { TeamMember, Task } from "@shared/schema";

interface TeamMemberDetailsDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks?: Task[];
  organizationName?: string | null;
  username?: string | null;
}

export function TeamMemberDetailsDialog({
  member,
  open,
  onOpenChange,
  tasks = [],
  organizationName,
  username,
}: TeamMemberDetailsDialogProps) {
  if (!member) return null;

  const activeTasks = tasks.filter(
    t => t.assignedTo === member.id && t.status !== "completed"
  );

  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Member Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{member.name}</h3>
              {member.nameArabic && (
                <p className="text-sm text-muted-foreground" dir="rtl">{member.nameArabic}</p>
              )}
              {organizationName && (
                <Badge variant="secondary" className="mt-1">
                  <Building2 className="w-3 h-3 mr-1" />
                  {organizationName}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {username && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-sm">{username}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-sm">{member.email}</p>
              </div>
            </div>

            {member.position && (
              <div className="flex items-start gap-3">
                <Briefcase className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Position</p>
                  <p className="text-sm">{member.position}</p>
                </div>
              </div>
            )}

            {organizationName && (
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Organization</p>
                  <p className="text-sm">{organizationName}</p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center gap-3 mb-3">
                <CheckSquare className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Tasks</p>
                  <p className="text-sm text-muted-foreground">
                    {activeTasks.length} {activeTasks.length === 1 ? "Task" : "Tasks"}
                  </p>
                </div>
              </div>
              {activeTasks.length > 0 ? (
                <div className="space-y-2 pl-8">
                  {activeTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{task.title}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{task.priority}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{task.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-8">No active tasks</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
