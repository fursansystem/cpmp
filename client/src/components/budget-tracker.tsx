import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { formatLargeCurrency } from "@/lib/format";

interface BudgetTrackerProps {
  projectName: string;
  estimated: number;
  actual: number;
  contractValue: number;
}

export function BudgetTracker({
  projectName,
  estimated,
  actual,
  contractValue,
}: BudgetTrackerProps) {
  const percentSpent = (actual / estimated) * 100;
  const isOverBudget = actual > estimated;
  const isNearLimit = percentSpent > 80 && !isOverBudget;


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center justify-between">
          <span className="truncate">{projectName}</span>
          {isOverBudget && (
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" data-testid="icon-over-budget" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget Progress</span>
            <span className={`font-medium ${isOverBudget ? 'text-destructive' : isNearLimit ? 'text-chart-3' : ''}`}>
              {percentSpent.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={Math.min(percentSpent, 100)} 
            className={`h-2 ${isOverBudget ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-chart-3' : ''}`}
            data-testid="progress-budget"
          />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Estimated</p>
            <p className="font-medium">{formatLargeCurrency(estimated)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Actual</p>
            <div className="flex items-center gap-1">
              <p className={`font-medium ${isOverBudget ? 'text-destructive' : ''}`}>
                {formatLargeCurrency(actual)}
              </p>
              {isOverBudget ? (
                <TrendingUp className="w-4 h-4 text-destructive" />
              ) : (
                <TrendingDown className="w-4 h-4 text-chart-2" />
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Contract Value</p>
            <p className="font-medium">{formatLargeCurrency(contractValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Remaining</p>
            <p className={`font-medium ${isOverBudget ? 'text-destructive' : 'text-chart-2'}`}>
              {formatLargeCurrency(Math.max(0, estimated - actual))}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
