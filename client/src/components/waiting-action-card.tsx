import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Request } from "@shared/schema";

export function WaitingActionCard({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const { data: requests = [] } = useQuery<Request[]>({
    queryKey: ["/api/requests"],
  });

  const filteredRequests = projectId && projectId !== "all"
    ? requests.filter(r => r.projectId === projectId)
    : requests;

  // Simple mapping of workflow steps/statuses to which roles/orgs should act
  // Steps 101-103: Contractor (Draft, Submitted)
  // Steps 104-107: Approvers (Under Review)

  const waitingCount = filteredRequests.filter(r => {
    const status = r.currentStatus;

    // If it's a contractor role, they act on Draft and Requires Action
    if (user?.role === "org_admin" || user?.role === "user") {
      // Assuming contractor organization logic
      // In this specific system, Contractor organization usually starts the WIR
      if (status === "Draft" || status === "Requires Action") return true;
    }

    // If it's an approver role (Developer/Consultant), they act on Submitted or Under Review
    if (user?.role === "super_admin" || user?.role === "developer_admin" || user?.role === "org_admin") {
      if (status === "Submitted" || status === "Under Review") return true;
    }

    return false;
  }).length;

  return (
    <Card
      className="p-7 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden"
      data-testid="card-waiting-action"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors" />

      <div className="relative flex items-center justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
              Immediate Attention
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-tight">Waiting Action</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black font-display tracking-tighter text-amber-600" data-testid="text-waiting-count">
                {waitingCount}
              </p>
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                Actions
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[45%] rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
            </div>
            <span className="text-[9px] font-black text-amber-600 uppercase">Priority High</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:rotate-6 transition-transform duration-500">
            <AlertCircle className="w-7 h-7 text-white" />
          </div>
          <div className="px-3 py-1 bg-amber-500/5 rounded-lg border border-amber-500/10">
            <p className="text-[9px] font-black text-amber-600 uppercase">Alert</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
