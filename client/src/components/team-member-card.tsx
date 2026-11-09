import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, MoreVertical, Pencil, Trash2, CheckSquare, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColor, getInitials } from "@/lib/member-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TeamMemberCardProps {
  id: string;
  name: string;
  email: string;
  position?: string | null;
  organizationName?: string | null;
  activeTasksCount?: number;
  canEdit?: boolean;
  canDelete?: boolean;
  usernames?: string[];
  onViewDetails?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

export function TeamMemberCard({
  id,
  name,
  email,
  position,
  organizationName,
  activeTasksCount = 0,
  canEdit = true,
  canDelete = false,
  usernames = [],
  onViewDetails,
  onEdit,
  onRemove,
}: TeamMemberCardProps) {
  const initials = getInitials(name);

  return (
    <Card
      className="hover-elevate cursor-pointer h-full flex flex-col"
      data-testid={`card-member-${id}`}
      onClick={onViewDetails}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="w-14 h-14 shrink-0">
              <AvatarFallback
                className={cn(
                  "font-semibold text-base ring-2",
                  avatarColor(id || name),
                )}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold font-display text-base leading-tight truncate">
                {name}
              </h3>
              {position ? (
                <p
                  className="text-sm font-medium text-primary truncate mt-0.5"
                  data-testid="text-position"
                >
                  {position}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 truncate mt-0.5">
                  No position set
                </p>
              )}
            </div>
          </div>
          {canEdit && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-options-${id}`}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-${id}`}>
                    <Pencil className="w-4 h-4 me-2" />
                    Edit
                  </DropdownMenuItem>
                  {canDelete && (
                    <DropdownMenuItem
                      onClick={onRemove}
                      className="text-destructive focus:text-destructive"
                      data-testid={`menu-delete-${id}`}
                    >
                      <Trash2 className="w-4 h-4 me-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-3">
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {email && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              <span className="truncate">{email}</span>
            </div>
          )}
          {usernames.length > 0 && (
            <div className="flex items-start gap-2" data-testid="member-usernames">
              <User className="w-3.5 h-3.5 flex-shrink-0 opacity-70 mt-0.5" />
              <div className="flex flex-wrap gap-1 min-w-0">
                {usernames.map((u) => (
                  <span
                    key={u}
                    className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 font-medium truncate max-w-full"
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {organizationName && (
          <Badge
            variant="secondary"
            className="w-fit max-w-full"
            data-testid="badge-organization"
          >
            <Building2 className="w-3 h-3 me-1 flex-shrink-0" />
            <span className="truncate">{organizationName}</span>
          </Badge>
        )}

        <div className="mt-auto pt-3 border-t flex items-center gap-2 text-sm">
          <CheckSquare
            className={cn(
              "w-4 h-4 flex-shrink-0",
              activeTasksCount > 0 ? "text-primary" : "text-muted-foreground/50",
            )}
          />
          {activeTasksCount > 0 ? (
            <>
              <span className="font-semibold">{activeTasksCount}</span>
              <span className="text-muted-foreground">
                {activeTasksCount === 1 ? "Active Task" : "Active Tasks"}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground/60">No active tasks</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
