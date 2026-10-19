import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, icon: Icon, trend }: StatCardProps) {
  return (
    <Card className="p-5 rounded-[1.5rem] border-none shadow-xl bg-white dark:bg-muted/5 group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
      
      <div className="relative flex items-center justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">{title}</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black font-display tracking-tighter text-foreground">{value}</p>
            {trend && (
              <p className={cn(
                "text-[10px] font-bold uppercase tracking-tight",
                trend.isPositive ? 'text-emerald-500' : 'text-rose-500'
              )}>
                {trend.value}
              </p>
            )}
          </div>
        </div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-110">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
    </Card>
  );
}
