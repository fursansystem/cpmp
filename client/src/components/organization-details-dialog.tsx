import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Building2, Mail, Phone, MapPin, User, Briefcase, FileText, Hash, Users, UserPlus, X, Calendar, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import type { Organization, TeamMember, Project } from "@shared/schema";

interface OrganizationDetailsDialogProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
  canDeleteMember?: boolean;
  projects?: Project[];
  teamMembers?: TeamMember[];
  onAddMember?: (organizationId: string, memberId: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
}

export function OrganizationDetailsDialog({
  organization,
  open,
  onOpenChange,
  canEdit = true,
  canDeleteMember = false,
  projects = [],
  teamMembers = [],
  onAddMember,
  onRemoveMember,
}: OrganizationDetailsDialogProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  if (!organization) return null;

  const organizationMembers = teamMembers.filter(m => m.organizationId === organization.id);
  const availableMembers = teamMembers.filter(m => m.organizationId !== organization.id);
  
  // Filter projects based on organization's sector type
  // - Developer organizations: show projects where they are the developer (organizationId)
  // - Contractor organizations: show projects where they are the contractor (contractorId)
  // - Consultant organizations: show projects where they are the consultant (consultantId)
  const organizationProjects = projects.filter(p => {
    if (organization.sectorType === "Developer") {
      return p.organizationId === organization.id;
    } else if (organization.sectorType === "Contractor") {
      return p.contractorId === organization.id;
    } else if (organization.sectorType === "Consultant") {
      return p.consultantId === organization.id;
    }
    // For other sector types, show projects where they are the developer
    return p.organizationId === organization.id;
  });

  const handleAddMember = async (memberId: string) => {
    if (!onAddMember) return;
    setIsUpdating(true);
    try {
      await onAddMember(organization.id, memberId);
      setPopoverOpen(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!onRemoveMember) return;
    setIsUpdating(true);
    try {
      await onRemoveMember(memberId);
    } finally {
      setIsUpdating(false);
    }
  };

  const initials = organization.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-background rounded-[1.5rem] sm:rounded-[1.5rem] flex flex-col [&>button]:hidden">
        {/* Manual Close Button - Premium Style */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-5 right-5 z-[100] w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-all duration-300 text-primary border border-primary/20 group active:scale-90"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Premium Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <DialogHeader className="p-8 pb-4 relative z-10">
          <div className="flex items-center gap-5">
            {organization.logo ? (
              <div className="w-16 h-16 bg-white dark:bg-card border border-primary/20 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 hover:scale-105 overflow-hidden shrink-0">
                <img 
                  src={organization.logo} 
                  alt={organization.name} 
                  className="w-full h-full object-contain p-2" 
                />
              </div>
            ) : (
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/5 transition-transform duration-500 hover:scale-105 shrink-0">
                <Building2 className="w-8 h-8" />
              </div>
            )}
            <div className="flex-grow text-left">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Organization Details</span>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tighter text-foreground uppercase leading-none mb-1">
                {organization.name}
              </DialogTitle>
              {organization.nameArabic && (
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60 mt-1" dir="rtl">
                  {organization.nameArabic}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 pb-8 relative z-10 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contact Information Card */}
            <div className="bg-muted/35 p-5 rounded-[1.5rem] border border-primary/20 backdrop-blur-sm group hover:border-primary/50 transition-colors space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block border-b border-primary/10 pb-2">
                Contact Info
              </span>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                      Email
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {organization.email || "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                      Phone
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {organization.phone || "—"}
                    </span>
                  </div>
                </div>

                {organization.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                        Address
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {organization.address}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Compliance & Status Card */}
            <div className="bg-muted/35 p-5 rounded-[1.5rem] border border-primary/20 backdrop-blur-sm group hover:border-primary/50 transition-colors space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block border-b border-primary/10 pb-2">
                Compliance & Status
              </span>
              
              <div className="space-y-3">
                {organization.sectorType && (
                  <div className="flex items-start gap-3">
                    <Briefcase className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                        Sector Type
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {organization.sectorType}
                      </span>
                    </div>
                  </div>
                )}

                {organization.vatNumber && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                        VAT Number
                      </span>
                      <span className="text-xs font-mono font-bold text-foreground tracking-wider">
                        {organization.vatNumber}
                      </span>
                    </div>
                  </div>
                )}

                {organization.ccrNumber && (
                  <div className="flex items-start gap-3">
                    <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground block mb-0.5 opacity-60">
                        CCR Number
                      </span>
                      <span className="text-xs font-mono font-bold text-foreground tracking-wider">
                        {organization.ccrNumber}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assigned Projects Section */}
          <div className="bg-muted/35 p-5 rounded-[1.5rem] border border-primary/20 backdrop-blur-sm space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/70">
                Assigned Projects ({organizationProjects.length})
              </span>
            </div>
            
            {organizationProjects.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {organizationProjects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between p-3 bg-white dark:bg-muted/10 rounded-xl border border-primary/20">
                    <div className="min-w-0 flex-1 mr-2">
                      <span className="text-xs font-bold text-foreground truncate block">{project.name}</span>
                      <div className="flex items-center gap-1 text-[9px] font-semibold text-muted-foreground mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "No start date"}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 shrink-0 rounded-md">
                      {project.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-muted-foreground/75 py-2">No projects assigned</p>
            )}
          </div>

          {/* Team Members Section */}
          <div className="bg-muted/35 p-5 rounded-[1.5rem] border border-primary/20 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/70">
                  Team Members ({organizationMembers.length})
                </span>
              </div>
              
              {canEdit && availableMembers.length > 0 && onAddMember && (
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs font-bold border-primary/35 hover:bg-primary/5 text-primary hover:text-primary" data-testid="button-add-member">
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Add Member
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2 rounded-xl shadow-xl animate-in fade-in-50 zoom-in-95">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5">Available Members</p>
                      <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                        {availableMembers.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => handleAddMember(member.id)}
                            disabled={isUpdating}
                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                            data-testid={`button-add-member-${member.id}`}
                          >
                            <Avatar className="w-8 h-8 rounded-lg">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold rounded-lg">
                                {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-foreground truncate text-left">{member.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate text-left">{member.position || 'No position'} • {member.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {organizationMembers.length > 0 ? (
              <div className="space-y-2">
                {organizationMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-white dark:bg-muted/10 rounded-xl border border-primary/20 group">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="w-8 h-8 rounded-lg">
                        <AvatarFallback className="bg-slate-100 text-foreground text-xs font-bold rounded-lg border border-primary/20">
                          {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-bold text-foreground truncate">{member.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{member.position || 'No position'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0.5 rounded-md max-w-[150px] truncate">
                        {member.email}
                      </Badge>
                      {canDeleteMember && onRemoveMember && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={isUpdating}
                          data-testid={`button-remove-member-${member.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-muted-foreground/75 py-2">No members assigned</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
