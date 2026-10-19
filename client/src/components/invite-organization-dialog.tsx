import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PROJECT_INVITATION_ROLES, type ProjectInvitationRole } from "@shared/schema";
import type { Project } from "@shared/schema";

interface InviteOrganizationDialogProps {
  trigger: React.ReactNode;
  onSubmit: (data: {
    projectId: string;
    role: ProjectInvitationRole;
    email?: string;
    organizationId?: string;
  }) => Promise<void>;
}

const ROLE_LABELS: Record<ProjectInvitationRole, string> = {
  contractor: "Contractor",
  consultant: "Consultant",
};

// A registered organization has already declared its sector, which is what decides the
// role it can take.
const SECTOR_ROLES: Record<string, ProjectInvitationRole> = {
  Contractor: "contractor",
  Consultant: "consultant",
};

interface EmailLookup {
  registered: boolean;
  organizationId?: string | null;
  organizationName?: string;
  sectorType?: string | null;
}

interface SentInvitation {
  projectId: string | null;
  role: string | null;
}

// A developer invites an organization to take a role on one of its projects. The
// organization answers for itself: the project's contractor or consultant is set only
// once that invitation is accepted.
export function InviteOrganizationDialog({ trigger, onSubmit }: InviteOrganizationDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [chosenRole, setChosenRole] = useState<ProjectInvitationRole>(PROJECT_INVITATION_ROLES[0]);
  const [projectId, setProjectId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only look the address up once it is complete enough to be one
  const [lookupEmail, setLookupEmail] = useState("");
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
    const timer = setTimeout(() => setLookupEmail(looksLikeEmail ? trimmed : ""), 400);
    return () => clearTimeout(timer);
  }, [email]);

  const { data: lookup, isFetching: isLookingUp } = useQuery<EmailLookup>({
    queryKey: [`/api/organizations/lookup-by-email?email=${encodeURIComponent(lookupEmail)}`],
    enabled: open && lookupEmail.length > 0,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const { data: sentInvitations = [] } = useQuery<SentInvitation[]>({
    queryKey: ["/api/project-invitations?scope=sent"],
    enabled: open,
  });

  // Nothing can be decided before the address has actually been looked up: an empty
  // field is not the same as an address known to be new.
  const hasAnswer = !!lookupEmail && !!lookup && !isLookingUp;

  const knownOrganization = lookup?.registered && lookup.organizationId ? lookup : null;
  const derivedRole = knownOrganization?.sectorType
    ? SECTOR_ROLES[knownOrganization.sectorType]
    : undefined;

  // The role is asked for only once the system has confirmed it cannot answer it
  // itself: a company that is not registered has not declared a sector yet.
  const askForRole = hasAnswer && !knownOrganization;
  const role = derivedRole ?? chosenRole;

  // A registered Developer organization cannot take either role on someone else's project
  const unusableOrganization = !!knownOrganization && !derivedRole;

  // A role can only be offered once at a time: the database holds one pending invitation
  // per project and role, and a filled role is not up for offer at all. Unavailable
  // projects are left out rather than failing after the user hits send.
  const availableProjects = useMemo(() => {
    const ownOrgId = user?.organizationId;
    const taken = new Set(
      sentInvitations
        .filter(invitation => invitation.projectId && invitation.role)
        .map(invitation => `${invitation.projectId}:${invitation.role}`),
    );

    return projects.filter(project => {
      if (ownOrgId && project.organizationId !== ownOrgId) return false;
      if (taken.has(`${project.id}:${role}`)) return false;
      const holder = role === "consultant" ? project.consultantId : project.contractorId;
      return !holder;
    });
  }, [projects, sentInvitations, role, user?.organizationId]);

  // The project list depends on the role, so a pick that no longer fits is dropped
  useEffect(() => {
    if (projectId && !availableProjects.some(project => project.id === projectId)) {
      setProjectId("");
    }
  }, [availableProjects, projectId]);

  const reset = () => {
    setEmail("");
    setLookupEmail("");
    setChosenRole(PROJECT_INVITATION_ROLES[0]);
    setProjectId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || unusableOrganization) return;
    setIsSubmitting(true);
    try {
      // Naming the organization is more precise than the address it was found by
      await onSubmit(
        knownOrganization
          ? { projectId, role, organizationId: knownOrganization.organizationId! }
          : { projectId, role, email: email.trim() },
      );
      reset();
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite Organization</DialogTitle>
            <DialogDescription>
              Invite an organization to take a role on one of your projects. They join it
              once they accept, and they keep ownership of their own company details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Administrator Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                required
                disabled={isSubmitting}
                data-testid="input-invite-email"
              />
              {isLookingUp && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking…
                </p>
              )}
              {!isLookingUp && knownOrganization && derivedRole && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  <span>
                    <strong className="font-medium text-foreground">
                      {knownOrganization.organizationName}
                    </strong>{" "}
                    will be invited as {ROLE_LABELS[derivedRole].toLowerCase()}.
                  </span>
                </p>
              )}
              {!isLookingUp && unusableOrganization && (
                <p className="text-xs text-destructive">
                  {knownOrganization?.organizationName} is registered as{" "}
                  {knownOrganization?.sectorType || "unclassified"}, so it cannot take
                  either role on a project.
                </p>
              )}
              {!isLookingUp && lookupEmail && lookup && !lookup.registered && (
                <p className="text-xs text-muted-foreground">
                  New to the system — they get a link to register their company first.
                </p>
              )}
            </div>

            {askForRole && (
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={chosenRole}
                  onValueChange={(value) => setChosenRole(value as ProjectInvitationRole)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="invite-role" data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_INVITATION_ROLES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {hasAnswer && !unusableOrganization && (
              <div className="space-y-2">
                <Label htmlFor="invite-project">Project</Label>
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={isSubmitting || availableProjects.length === 0}
                >
                  <SelectTrigger id="invite-project" data-testid="select-invite-project">
                    <SelectValue
                      placeholder={
                        availableProjects.length === 0
                          ? `No project needs a ${ROLE_LABELS[role].toLowerCase()}`
                          : "Select project"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Every project either has a {ROLE_LABELS[role].toLowerCase()} already
                    or is waiting on an answer.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              data-testid="button-cancel-invitation"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !projectId || unusableOrganization}
              data-testid="button-send-invitation"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
