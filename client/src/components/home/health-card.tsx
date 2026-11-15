// How many projects are healthy, at risk or critical, and which ones need a look first.
import { HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n-format";
import { HEALTH_STATES, type HomeSummary } from "@shared/home";
import { EYEBROW, EmptyNote, FOCUS, HEALTH_META, Panel, useReasonText } from "./parts";

const NAMED = 4;

export function HealthCard({ summary, className }: { summary: HomeSummary; className?: string }) {
  const { t } = useTranslation("home");
  const reasonText = useReasonText();
  const { health, viewer, projects } = summary;
  const judged = health.healthy + health.at_risk + health.critical;
  const flagged = projects.filter((p) => p.health === "critical" || p.health === "at_risk");
  // worst first in the list; the bar reads the same way
  const order = [...HEALTH_STATES].reverse();

  return (
    <Panel
      id="health"
      icon={HeartPulse}
      title={t("health_card.title")}
      subtitle={t(viewer.canSeeBudget ? "health_card.subtitle" : "health_card.subtitle_no_budget")}
      className={className}
    >
      {summary.scopeCount === 0 ? (
        <EmptyNote text={t("health_card.empty")} />
      ) : (
        <div className="space-y-4">
          {/* one bar, split by state, with a gap between the parts so they read without the colour */}
          {judged > 0 && (
            <div className="flex h-2.5 gap-0.5" aria-hidden="true">
              {order.map((state) =>
                health[state] > 0 ? <div key={state} className={cn("h-full rounded-full", HEALTH_META[state].fill)} style={{ flexGrow: health[state], flexBasis: 0 }} /> : null,
              )}
            </div>
          )}

          <dl className="grid grid-cols-3 gap-2">
            {order.map((state) => {
              const meta = HEALTH_META[state];
              return (
                <div key={state} className="rounded-xl border px-2.5 py-2">
                  <dt className="flex items-start gap-1.5 min-h-8 text-xs font-semibold leading-tight text-muted-foreground/80 dark:text-foreground/70">
                    <meta.icon className={cn("w-3.5 h-3.5 shrink-0", meta.ink)} aria-hidden="true" />
                    <span>{t(`health.${state}`)}</span>
                  </dt>
                  <dd className="mt-1 text-2xl font-bold font-display tabular-nums text-foreground" data-testid={`home-health-${state}`}>{num(health[state])}</dd>
                </div>
              );
            })}
          </dl>

          {viewer.canSeeProjectTable && (
            <div className="space-y-2">
              <h3 className={cn("text-xs font-bold text-muted-foreground/80 dark:text-foreground/70", EYEBROW)}>{t("health_card.needs_attention")}</h3>
              {flagged.length === 0 ? (
                <p className="text-sm text-muted-foreground/80 dark:text-foreground/70">{t("health_card.all_healthy")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {flagged.slice(0, NAMED).map((p) => {
                    const meta = HEALTH_META[p.health];
                    return (
                      <li key={p.id}>
                        <Link href={`/projects/${p.id}`} className={cn("flex items-start gap-2.5 min-h-11 rounded-xl px-2 py-1.5 hover:bg-muted/50 transition-colors", FOCUS)}>
                          <meta.icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.ink)} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground truncate">
                              <span className="sr-only">{t(`health.${p.health}`)}: </span>
                              {p.name}
                            </span>
                            {p.reasons[0] && <span className="block text-xs text-muted-foreground/80 dark:text-foreground/70 truncate">{reasonText(p.reasons[0])}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {flagged.length > NAMED && <p className="text-xs text-muted-foreground/80 dark:text-foreground/70">{t("health_card.more", { count: flagged.length - NAMED })}</p>}
            </div>
          )}

          {health.inactive > 0 && <p className="text-xs text-muted-foreground/80 dark:text-foreground/70">{t("health_card.not_assessed", { count: health.inactive })}</p>}
        </div>
      )}
    </Panel>
  );
}
