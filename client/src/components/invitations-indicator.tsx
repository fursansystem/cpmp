import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

// Project invitations waiting on an organization this user administers, shown beside the
// notification bell. A notification can be dismissed and lost; this stays until the
// invitation is actually answered, so the accept/reject path is never unreachable.
export function InvitationsIndicator() {
  const { user } = useAuth();
  const isViewOnlyUser = user?.role === "user";

  const { data: pendingInvitations = [] } = useQuery<unknown[]>({
    queryKey: ["/api/project-invitations"],
    enabled: !!user && !isViewOnlyUser,
  });

  // Answering is an administrator's job, so the icon is theirs. It also appears for
  // anyone who actually has one waiting, whatever their role.
  const isOrgAdmin = user?.role === "org_admin" || user?.role === "developer_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const count = pendingInvitations.length;

  if (!user || (!isOrgAdmin && !isSuperAdmin && count === 0)) {
    return null;
  }

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 rounded-md hover:bg-transparent hover:text-primary transition-all"
      data-testid="button-invitations"
    >
      <Link
        href="/invitations"
        title={count > 0 ? `${count} invitation${count === 1 ? "" : "s"} waiting` : "Invitations"}
      >
        <MailOpen className="h-5 w-5" />
        {count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
