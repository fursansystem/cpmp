import { BudgetTracker } from "@/components/budget-tracker";
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLargeCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";

export default function Budget() {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });


  // Calculate totals from real project data
  const totalContractValue = projects.reduce(
    (sum, p) => sum + parseFloat(p.contractValue),
    0
  );
  const totalEstimated = projects.reduce(
    (sum, p) => sum + parseFloat(p.estimatedCost),
    0
  );
  const totalSpent = projects.reduce(
    (sum, p) => sum + parseFloat(p.actualCost),
    0
  );
  const overBudgetCount = projects.filter(
    (p) => parseFloat(p.actualCost) > parseFloat(p.estimatedCost)
  ).length;

  const estimatedPercentage = totalContractValue > 0
    ? ((totalEstimated / totalContractValue) * 100).toFixed(0)
    : 0;

  const spentPercentage = totalEstimated > 0
    ? ((totalSpent / totalEstimated) * 100).toFixed(0)
    : 0;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Budget Overview</h1>
          <p className="text-muted-foreground">
            Track project budgets and financial performance
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>

        <div>
          <h2 className="text-xl font-semibold font-display mb-4">Project Budgets</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent px-6 lg:px-10 pt-2 pb-8 space-y-4 animate-in fade-in duration-700 relative overflow-hidden">
      <div>
        <h1 className="text-3xl font-black font-display tracking-tight text-foreground uppercase">Budget Overview</h1>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
          Financial Performance Tracking
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contract Value"
          value={formatLargeCurrency(totalContractValue)}
          icon={DollarSign}
        />
        <StatCard
          title="Total Estimated"
          value={formatLargeCurrency(totalEstimated)}
          icon={TrendingUp}
          trend={{ value: `${estimatedPercentage}% of contract`, isPositive: true }}
        />
        <StatCard
          title="Total Spent"
          value={formatLargeCurrency(totalSpent)}
          icon={CheckCircle}
          trend={{ value: `${spentPercentage}% of estimated`, isPositive: totalSpent <= totalEstimated }}
        />
        <StatCard
          title="Over Budget"
          value={overBudgetCount}
          icon={AlertTriangle}
        />
      </div>

      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/70">Project Budgets</h2>
        </div>
        {projects.length === 0 ? (
          <Card className="p-12 text-center border-none shadow-xl bg-white/50 dark:bg-muted/5 rounded-[1.5rem]">
            <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No projects found. Create a project to track budgets.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <BudgetTracker
                key={project.id}
                projectName={project.name}
                estimated={parseFloat(project.estimatedCost)}
                actual={parseFloat(project.actualCost)}
                contractValue={parseFloat(project.contractValue)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
