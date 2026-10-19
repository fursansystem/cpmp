import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Building2, Mail, Phone, MapPin, MoreVertical, Pencil, Trash2, Users,
  Briefcase, Hammer, Lightbulb, Cog
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrganizationCardProps {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  sectorType?: string;
  logo?: string | null;
  projectCount: number;
  memberCount: number;
  canEdit?: boolean;
  canDelete?: boolean;
  onViewDetails?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

const sectorIcons: Record<string, typeof Building2> = {
  "Developer": Lightbulb,
  "Contractor": Hammer,
  "Consultant": Briefcase,
} as const;

const sectorColors: Record<string, { bg: string; text: string; border: string }> = {
  "Developer": { bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  "Contractor": { bg: "bg-orange-50 dark:bg-orange-950", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  "Consultant": { bg: "bg-blue-50 dark:bg-blue-950", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
};

export function OrganizationCard({
  id,
  name,
  email,
  phone,
  address,
  sectorType,
  logo,
  projectCount,
  memberCount,
  canEdit = true,
  canDelete = false,
  onViewDetails,
  onEdit,
  onRemove,
}: OrganizationCardProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      onClick={onViewDetails}
      data-testid={`card-organization-${id}`}
    >
      <CardHeader>
        <div className="relative">
          {/* Identity block, centred: logo, name, role. The contact rows below stay
              start-aligned so their icons keep a single column. */}
          <div className="flex flex-col items-center gap-2 text-center">
            {logo ? (
              <img
                src={logo}
                alt={name}
                className="w-20 h-20 object-contain rounded-md bg-muted/40 p-1"
              />
            ) : (
              <Avatar className="w-20 h-20">
                <AvatarFallback className="bg-primary text-primary-foreground font-medium text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="w-full min-w-0 space-y-2">
              {/* One name for now. Which name to show per locale belongs to the
                  localisation work, not here. */}
              <h3 className="font-medium font-display leading-snug line-clamp-2 px-5 text-[0.95rem]">{name}</h3>
              {sectorType && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${sectorColors[sectorType]?.bg || ""} ${sectorColors[sectorType]?.text || ""} ${sectorColors[sectorType]?.border || ""}`}
                >
                  {(() => {
                    const Icon = sectorIcons[sectorType];
                    return Icon ? <Icon className="w-4 h-4 flex-shrink-0" /> : null;
                  })()}
                  <span className="font-semibold text-xs">{sectorType}</span>
                </div>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="absolute right-0 top-0" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{email}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{phone}</span>
          </div>
          {address && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
        </div>
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{projectCount}</span>
              <span className="text-muted-foreground">
                {projectCount === 1 ? 'Project' : 'Projects'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{memberCount}</span>
              <span className="text-muted-foreground">
                {memberCount === 1 ? 'Member' : 'Members'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
