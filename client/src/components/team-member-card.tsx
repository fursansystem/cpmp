import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, MoreVertical, Pencil, Trash2, CheckSquare, Briefcase, Building2, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TeamMemberCardProps {
  id: string;
  name: string;
  nameArabic?: string | null;
  email: string;
  position?: string | null;
  organizationName?: string | null;
  activeTasksCount?: number;
  canEdit?: boolean;
  canDelete?: boolean;
  username?: string | null;
  onViewDetails?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

export function TeamMemberCard({
  id,
  name,
  nameArabic,
  email,
  position,
  organizationName,
  activeTasksCount = 0,
  canEdit = true,
  canDelete = false,
  username,
  onViewDetails,
  onEdit,
  onRemove,
}: TeamMemberCardProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      data-testid={`card-member-${id}`}
      onClick={onViewDetails}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium font-display truncate">{name}</h3>
              {nameArabic && (
                <p className="text-sm text-muted-foreground truncate" dir="rtl">{nameArabic}</p>
              )}
              {organizationName && (
                <Badge variant="secondary" className="mt-1" data-testid="badge-organization">
                  <Building2 className="w-3 h-3 mr-1" />
                  {organizationName}
                </Badge>
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
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {canDelete && (
                    <DropdownMenuItem 
                      onClick={onRemove} 
                      className="text-destructive focus:text-destructive"
                      data-testid={`menu-delete-${id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          {username && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{username}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{email}</span>
          </div>
          {position && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{position}</span>
            </div>
          )}
        </div>
        {activeTasksCount > 0 && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeTasksCount}</span>
              <span className="text-muted-foreground">
                {activeTasksCount === 1 ? 'Active Task' : 'Active Tasks'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
