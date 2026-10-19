import { Card } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Request } from "@shared/schema";

export function PendingsCard({ projectId }: { projectId?: string }) {
  const { data: requests = [] } = useQuery<Request[]>({
    queryKey: ["/api/requests"],
  });

  const filteredRequests = projectId && projectId !== "all"
    ? requests.filter(r => r.projectId === projectId)
    : requests;

  // Terminal statuses that should not be counted as pending
  const terminalStatuses = ["Closed", "Approved"];

  // Count pending requests (anything not Closed or Approved)
  const pendingCount = filteredRequests.filter(r => 
    !["Closed", "Approved"].includes(r.currentStatus)
  ).length;

  return (
    <Card 
      className="p-7 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden" 
      data-testid="card-pendings"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl group-hover:bg-sky-500/10 transition-colors" />
      
      <div className="relative flex items-center justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
              Work In Progress
            </p>
          </div>
          
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-tight">Pendings</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black font-display tracking-tighter text-sky-600" data-testid="text-pending-count">
                {pendingCount}
              </p>
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                Requests
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
             <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 w-[60%] rounded-full shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
             </div>
             <span className="text-[9px] font-black text-sky-600 uppercase">Steady Flow</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:rotate-6 transition-transform duration-500">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <div className="px-3 py-1 bg-sky-500/5 rounded-lg border border-sky-500/10">
             <p className="text-[9px] font-black text-sky-600 uppercase">Active</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
