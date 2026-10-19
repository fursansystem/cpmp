import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Inbox, Building2, MapPin } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { Organization } from "@shared/schema";

// What GET /api/project-invitations returns: the invitation plus the names needed to
// decide. Nothing about the project itself is readable until the invitation is accepted.
interface PendingInvitation {
  id: string;
  role: string | null;
  sectorType: string;
  projectId: string | null;
  projectName: string | null;
  projectLocation: string | null;
  invitingOrganizationName: string | null;
  invitedOrganizationId: string | null;
  invitedOrganizationName: string | null;
  expiresAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  contractor: "Contractor",
  consultant: "Consultant",
};

export default function Invitations() {
  // Only asked for when the user administers more than one organization, so the system
  // never answers on behalf of an organization they did not name.
  const [answeringAs, setAnsweringAs] = useState<Record<string, string>>({});

  const { data: invitations = [], isLoading } = useQuery<PendingInvitation[]>({
    queryKey: ["/api/project-invitations"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const respond = useMutation({
    mutationFn: async ({
      id,
      action,
      organizationId,
    }: {
      id: string;
      action: "accept" | "reject";
      organizationId?: string;
    }) => {
      return await apiRequest(
        "POST",
        `/api/project-invitations/${id}/${action}`,
        organizationId ? { organizationId } : {},
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({
        title: variables.action === "accept" ? "Invitation accepted" : "Invitation declined",
        description:
          variables.action === "accept"
            ? "The project is now available to your organization."
            : "The developer has been told the role is still open.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display mb-2">Invitations</h1>
        <p className="text-muted-foreground">
          Projects you have been invited to join. A project becomes visible to your
          organization only after you accept.
        </p>
      </div>

      {invitations.length === 0 ? (
        <Card className="max-w-2xl">
          <CardContent className="p-10 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">No invitations waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When a developer invites your organization to a project, it appears here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {invitations.map((invitation) => {
            // The invited organization is known from the invitation itself; a chooser
            // only appears when this user could be answering for more than one.
            const candidates = organizations.filter(
              (org) => org.sectorType === invitation.sectorType,
            );
            const needsChoice = candidates.length > 1 && !invitation.invitedOrganizationId;
            const chosen = answeringAs[invitation.id];
            const blocked = needsChoice && !chosen;

            return (
              <Card key={invitation.id} data-testid={`invitation-${invitation.id}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-medium font-display text-lg leading-snug">
                        {invitation.projectName || "Project"}
                      </h2>
                      {invitation.role && (
                        <Badge variant="secondary" className="shrink-0">
                          {ROLE_LABELS[invitation.role] || invitation.role}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0" />
                      Invited by {invitation.invitingOrganizationName}
                    </p>
                    {invitation.projectLocation && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0" />
                        {invitation.projectLocation}
                      </p>
                    )}
                    {invitation.invitedOrganizationName && (
                      <p className="text-sm">
                        Answering as{" "}
                        <span className="font-medium">{invitation.invitedOrganizationName}</span>
                      </p>
                    )}
                  </div>

                  {needsChoice && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Which organization is answering?
                      </p>
                      <Select
                        value={chosen || ""}
                        onValueChange={(value) =>
                          setAnsweringAs((prev) => ({ ...prev, [invitation.id]: value }))
                        }
                      >
                        <SelectTrigger data-testid={`select-answering-as-${invitation.id}`}>
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        respond.mutate({
                          id: invitation.id,
                          action: "accept",
                          organizationId: chosen,
                        })
                      }
                      disabled={blocked || respond.isPending}
                      data-testid={`button-accept-${invitation.id}`}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        respond.mutate({
                          id: invitation.id,
                          action: "reject",
                          organizationId: chosen,
                        })
                      }
                      disabled={blocked || respond.isPending}
                      data-testid={`button-reject-${invitation.id}`}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
