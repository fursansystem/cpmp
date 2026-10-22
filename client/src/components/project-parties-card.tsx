import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Hammer, Briefcase, Lightbulb, Clock, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ProjectInvitationPermissions, type UserRole } from "@shared/permissions";
import type { Organization, Project } from "@shared/schema";

interface PendingInvitation {
  id: string;
  role: string | null;
  invitedOrganizationName: string | null;
  email: string | null;
}

// Who is on the project, and who has been asked but has not answered yet. A role that
// is waiting on an answer reads as waiting — not as empty, which would suggest nobody
// was approached, and not as filled, which would be untrue until they accept.
export function ProjectPartiesCard({ project }: { project: Project }) {
  const { user } = useAuth();

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: invitations = [] } = useQuery<PendingInvitation[]>({
    queryKey: [`/api/projects/${project.id}/invitations`],
    enabled: !!project.id,
  });

  const withdraw = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest("POST", `/api/project-invitations/${invitationId}/withdraw`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/invitations`] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-invitations?scope=sent"] });
      toast({
        title: "Invitation withdrawn",
        description: "The role is open again, so you can invite someone else.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const canWithdraw =
    !!user &&
    ProjectInvitationPermissions.canWithdraw(
      { id: user.id, role: user.role as UserRole, organizationId: user.organizationId },
      { id: project.id, organizationId: project.organizationId },
      user.organizationId,
    );

  const nameOf = (id?: string | null) =>
    id ? organizations.find((org) => org.id === id)?.name ?? "—" : null;

  const rows = [
    {
      key: "developer",
      label: "Developer",
      icon: Lightbulb,
      assigned: nameOf(project.organizationId),
      invitation: undefined as PendingInvitation | undefined,
    },
    {
      key: "contractor",
      label: "Contractor",
      icon: Hammer,
      assigned: nameOf(project.contractorId),
      invitation: invitations.find((i) => i.role === "contractor"),
    },
    {
      key: "consultant",
      label: "Consultant",
      icon: Briefcase,
      assigned: nameOf(project.consultantId),
      invitation: invitations.find((i) => i.role === "consultant"),
    },
  ];

  return (
    <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">
          Project Parties
        </p>
      </div>

      {/* One column per party on a wide screen; they stack again when it is narrow */}
      <div className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0"
            data-testid={`party-${row.key}`}
          >
            <div className="flex items-center gap-2">
              <row.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {row.label}
              </p>
            </div>

            {row.assigned ? (
              <p className="font-medium truncate">{row.assigned}</p>
            ) : row.invitation ? (
              <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  Waiting for{" "}
                  {row.invitation.invitedOrganizationName || row.invitation.email} to
                  accept
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not assigned</p>
            )}

            {/* Withdrawing only makes sense while an answer is still outstanding */}
            {row.invitation && canWithdraw && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mt-1 self-start"
                onClick={() => withdraw.mutate(row.invitation!.id)}
                disabled={withdraw.isPending}
                data-testid={`button-withdraw-${row.key}`}
              >
                <X className="w-4 h-4 mr-1" />
                Withdraw
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
