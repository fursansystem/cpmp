// Building blocks shared by the home page's sections.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleMinus, OctagonAlert, RotateCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n-format";
import { formatLargeCurrency } from "@/lib/format";
import type { HealthReason, ProjectHealthState } from "@shared/home";

// Letter-spacing pulls joined Arabic letters apart, and Arabic has no capitals, so the small-caps
// label treatment is applied in LTR only.
export const EYEBROW = "ltr:uppercase ltr:tracking-wider";

// Every link and button on the page shows where the keyboard is.
export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// A state is never colour alone: each one carries its own icon and its name beside it.
// Red is kept for what is genuinely critical.
export const HEALTH_META: Record<ProjectHealthState, { icon: LucideIcon; ink: string; fill: string; soft: string }> = {
  healthy: { icon: CircleCheck, ink: "text-emerald-700 dark:text-emerald-400", fill: "bg-emerald-600 dark:bg-emerald-500", soft: "bg-emerald-500/10" },
  at_risk: { icon: TriangleAlert, ink: "text-amber-700 dark:text-amber-400", fill: "bg-amber-500", soft: "bg-amber-500/10" },
  critical: { icon: OctagonAlert, ink: "text-red-700 dark:text-red-400", fill: "bg-red-600 dark:bg-red-500", soft: "bg-red-500/10" },
  inactive: { icon: CircleMinus, ink: "text-slate-500 dark:text-slate-400", fill: "bg-slate-400 dark:bg-slate-600", soft: "bg-slate-500/10" },
};

export function HealthBadge({ state, className }: { state: ProjectHealthState; className?: string }) {
  const { t } = useTranslation("home");
  const meta = HEALTH_META[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", meta.soft, className)}>
      <meta.icon className={cn("w-3.5 h-3.5 shrink-0", meta.ink)} aria-hidden="true" />
      <span className="text-foreground">{t(`health.${state}`)}</span>
    </span>
  );
}

/**
 * A percentage that keeps its sign on the right side of the digits inside Arabic text. Without the
 * isolate, a figure at the end of a right-to-left sentence is drawn as "%53".
 */
export const pct = (v: number, decimals = 0) => `\u2066${num(v, decimals)}%\u2069`;

/** Money for a tight cell: 2.4M, 350K, and plain digits below a thousand (no trailing ".00"). */
export const compact = (v: number) => `\u2066${Math.abs(v) < 1000 ? num(v) : formatLargeCurrency(v)}\u2069`;

const PERCENT_REASONS: readonly HealthReason["code"][] = ["schedule_behind", "over_budget", "spend_ahead"];

/** Why a project has the colour it has, in the reader's language. */
export function useReasonText() {
  const { t } = useTranslation("home");
  return (r: HealthReason) =>
    r.code === "past_end_date"
      ? t("reason.past_end_date", { count: r.value })
      : t(`reason.${r.code}`, { value: PERCENT_REASONS.includes(r.code) ? pct(r.value, Number.isInteger(r.value) ? 0 : 1) : num(r.value) });
}

interface PanelProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ id, title, subtitle, icon: Icon, action, className, children }: PanelProps) {
  return (
    <Card id={`home-${id}`} role="region" aria-labelledby={`${id}-title`} className={cn("flex flex-col min-w-0 scroll-mt-4", className)} data-testid={`home-${id}`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-bold font-display text-foreground">
            {Icon && <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-muted-foreground/80 dark:text-foreground/70 mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 flex-1 min-w-0">{children}</div>
    </Card>
  );
}

/** Placeholder rows the height of real ones, so nothing shifts when the data arrives. */
export function RowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation("home");
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label={t("state.loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function SectionError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const { t } = useTranslation("home");
  return (
    <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3", className)}>
      <p className="text-sm text-muted-foreground">{t("state.error")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="min-h-11 gap-2" onClick={onRetry}>
          <RotateCw className="w-4 h-4" aria-hidden="true" />
          {t("state.retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyNote({ icon: Icon, title, text }: { icon?: LucideIcon; title?: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/40" aria-hidden="true" />}
      {title && <p className="text-sm font-bold text-foreground">{title}</p>}
      <p className="text-sm text-muted-foreground/80 dark:text-foreground/70 max-w-sm">{text}</p>
    </div>
  );
}

/**
 * One measure across a few named items, as plain bars: every value is printed beside its bar, so the
 * reading never depends on the colour, and the bars grow from the reading edge in either direction.
 */
export function BarList({ items, format = String }: { items: { key: string; label: string; value: number; note?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground" title={item.label}>{item.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">{format(item.value)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-muted/60 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-sky-600 dark:bg-sky-400" style={{ width: max > 0 ? `${Math.max(2, (item.value / max) * 100)}%` : 0 }} />
          </div>
          {item.note && <p className="mt-1 text-xs text-muted-foreground/80 dark:text-foreground/70">{item.note}</p>}
        </li>
      ))}
    </ul>
  );
}
