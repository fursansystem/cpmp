// The project forms (WIR, MIR, NCR, SI, drawings, approvals…) by type: what is open, what waits on the
// reader, what is stuck, and how decisions went in the period.
import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n-format";
import { localizedName } from "@/lib/localized";
import type { HomeRequestTypeRow, HomeSummary } from "@shared/home";
import { EYEBROW, EmptyNote, FOCUS, Panel, pct } from "./parts";

const NUMBER_LINK = "inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg px-2 text-sm font-bold tabular-nums text-foreground underline decoration-dotted underline-offset-4 hover:bg-muted/50 transition-colors";

/** The open count, leading to the request page of the project it belongs to; asks which one when there are several. */
function OpenCount({ row }: { row: HomeRequestTypeRow }) {
  const { t } = useTranslation("home");
  const href = (projectId: string) => `/projects/${projectId}/requests?tab=${row.tab}`;
  if (row.projects.length === 0) return <span className="inline-flex items-center justify-center min-h-11 min-w-11 text-sm tabular-nums text-muted-foreground/80 dark:text-foreground/70">{num(row.open)}</span>;
  if (row.projects.length === 1) {
    const [only] = row.projects;
    return (
      <Link href={href(only.id)} aria-label={t("forms.open_in", { code: row.code, name: only.name })} className={cn(NUMBER_LINK, FOCUS)}>
        {num(row.open)}
      </Link>
    );
  }
  return (
    <Popover>
      <PopoverTrigger className={cn(NUMBER_LINK, FOCUS)} aria-label={`${t("forms.choose_project", { code: row.code })} (${num(row.open)})`}>
        {num(row.open)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 py-1.5 text-xs font-bold text-muted-foreground/80 dark:text-foreground/70">{t("forms.choose_project", { code: row.code })}</p>
        <ul>
          {[...row.projects].sort((a, b) => b.open - a.open).map((p) => (
            <li key={p.id}>
              <Link href={href(p.id)} className={cn("flex items-center justify-between gap-3 min-h-11 rounded-lg px-2 text-sm hover:bg-muted/60", FOCUS)}>
                <span className="truncate">{p.name}</span>
                <span className="font-bold tabular-nums">{num(p.open)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function FormsPanel({ summary, className }: { summary: HomeSummary; className?: string }) {
  const { t } = useTranslation("home");
  const { byType, outcomes, firstPass } = summary.requests;
  const th = "px-2 py-2 text-xs font-bold text-muted-foreground/80 dark:text-foreground/70";
  const cell = "px-2 text-center text-sm tabular-nums";

  return (
    <Panel id="forms" icon={ClipboardList} title={t("forms.title")} subtitle={t("forms.subtitle")} className={className}>
      {byType.length === 0 ? (
        <EmptyNote text={t("forms.empty")} />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th scope="col" className={cn(th, "text-start")}>{t("forms.type")}</th>
                  <th scope="col" className={th}>{t("forms.open")}</th>
                  <th scope="col" className={th}>{t("forms.mine")}</th>
                  <th scope="col" className={th}>{t("forms.stalled")}</th>
                  <th scope="col" className={th}>{t("forms.closed")}</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row) => (
                  <tr key={row.code} className="border-b last:border-b-0" data-testid={`home-form-${row.code}`}>
                    <th scope="row" className="px-2 py-1.5 text-start font-normal">
                      <span className="block text-sm font-bold text-foreground"><span dir="ltr">{row.code}</span></span>
                      <span className="block text-xs text-muted-foreground/80 dark:text-foreground/70">{localizedName(row, "")}</span>
                    </th>
                    <td className="text-center"><OpenCount row={row} /></td>
                    <td className={cn(cell, row.mine ? "font-bold text-foreground" : "text-muted-foreground/70 dark:text-foreground/60")}>{num(row.mine)}</td>
                    <td className={cn(cell, row.stalled ? "font-bold text-foreground" : "text-muted-foreground/70 dark:text-foreground/60")}>{num(row.stalled)}</td>
                    <td className={cn(cell, "text-foreground")}>{num(row.closedInPeriod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border px-3 py-3 space-y-2">
            <h3 className={cn("text-xs font-bold text-muted-foreground/80 dark:text-foreground/70", EYEBROW)}>{t("forms.outcomes")}</h3>
            {outcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground/80 dark:text-foreground/70">{t("forms.no_outcomes")}</p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-2">
                  {outcomes.map((o) => (
                    <li key={o.code} className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs">
                      <span className="font-bold" dir="ltr">{o.code}</span>
                      <bdi className="text-muted-foreground/80 dark:text-foreground/70">{t(`outcome.${o.code}`, { defaultValue: o.label })}</bdi>
                      <span className="font-bold tabular-nums">{num(o.count)}</span>
                    </li>
                  ))}
                </ul>
                {/* the count sits beside the rate: a few decisions in a short period make a jumpy percentage */}
                {firstPass.decided > 0 && (
                  <p className="text-sm text-foreground">
                    {t("forms.first_pass")}:{" "}
                    <span className="font-bold tabular-nums">
                      {t("forms.first_pass_value", { pct: pct((firstPass.approved / firstPass.decided) * 100), approved: num(firstPass.approved), decided: num(firstPass.decided) })}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
