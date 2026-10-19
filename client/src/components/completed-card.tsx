import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Request } from "@shared/schema";

export function CompletedCard({ projectId }: { projectId?: string }) {
  const { data: requests = [] } = useQuery<Request[]>({
    queryKey: ["/api/requests"],
  });

  const filteredRequests = projectId && projectId !== "all"
    ? requests.filter(r => r.projectId === projectId)
    : requests;

  // Count completed requests (Closed)
  const completedCount = filteredRequests.filter(r => 
    r.currentStatus === "Closed"
  ).length;

  return (
    <Card 
      className="p-7 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden" 
      data-testid="card-completed"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
      
      <div className="relative flex items-center justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
              Successfully Closed
            </p>
          </div>
          
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-tight">Completed</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black font-display tracking-tighter text-emerald-600" data-testid="text-completed-count">
                {completedCount}
              </p>
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                Closed
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
             <div className="h-1 flex-1 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
             </div>
             <span className="text-[9px] font-black text-emerald-600 uppercase">100% Success</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:rotate-6 transition-transform duration-500">
            <CheckCircle2 className="w-7 h-7 text-white" />
          </div>
          <div className="px-3 py-1 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
             <p className="text-[9px] font-black text-emerald-600 uppercase">Done</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
