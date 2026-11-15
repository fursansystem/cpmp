// What is waiting on the reader, from every module, in one list. Each source loads and fails on its
// own, so a slow or broken module never hides the others.
import { ChevronLeft, ClipboardList, Hourglass, Inbox, Landmark, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { fmtDate, num } from "@/lib/i18n-format";
import type { HomeActionRequest } from "@shared/home";
import { EYEBROW, EmptyNote, FOCUS, Panel, RowsSkeleton, SectionError } from "./parts";

export interface InboxItem {
  key: string;
  label: string;
  count: number;
  tab: string;
  ids: string[];
  projectId: string | null;
}

export interface PermitTask {
  id: string;
  transactionId: string;
  title: string;
  dueDate: string | null;
  transactionTitle: string;
  projectName: string;
}

interface Source<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface Props {
  requests: Source<{ items: HomeActionRequest[]; total: number }>;
  payments: Source<InboxItem[]>;
  permits: Source<PermitTask[]>;
  className?: string;
}

const PERMITS_SHOWN = 5;

// `wideLead` is a lead too long for a phone (a request number): there it moves into the detail line,
// and the trailing note drops under the title, so the title keeps the width.
function Row({ href, lead, wideLead, title, detail, trail }: { href: string; lead: ReactNode; wideLead?: boolean; title: ReactNode; detail?: ReactNode; trail?: ReactNode }) {
  return (
    <li>
      <Link href={href} className={cn("flex items-center gap-3 min-h-11 rounded-xl border bg-background/40 px-3 py-2 hover:border-primary/50 transition-colors", FOCUS)}>
        <span className={cn("shrink-0", wideLead && "hidden sm:block")}>{lead}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground truncate">{title}</span>
          {detail && <span className="block text-xs text-muted-foreground/80 dark:text-foreground/70 truncate">{detail}</span>}
          {trail && <span className="mt-0.5 block sm:hidden">{trail}</span>}
        </span>
        {trail && <span className="hidden sm:block shrink-0">{trail}</span>}
        <ChevronLeft className="w-4 h-4 text-muted-foreground/60 dark:text-foreground/50 shrink-0 ltr:rotate-180" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Group<T>({ icon: Icon, title, source, rows, children }: { icon: LucideIcon; title: string; source: Source<T>; rows: number; children: ReactNode }) {
  // an empty group takes no room: the panel's own empty state covers "nothing at all"
  if (!source.isLoading && !source.isError && rows === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={cn("flex items-center gap-2 text-xs font-bold text-muted-foreground/80 dark:text-foreground/70", EYEBROW)}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {title}
      </h3>
      {source.isLoading ? <RowsSkeleton rows={2} /> : source.isError ? <SectionError onRetry={source.refetch} /> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

export function MyActions({ requests, payments, permits, className }: Props) {
  const { t } = useTranslation(["home", "notifications", "enums"]);
  const todayIso = new Date().toISOString().slice(0, 10);

  const forms = requests.data?.items ?? [];
  const formsTotal = requests.data?.total ?? 0;
  const inbox = payments.data ?? [];
  const tasks = permits.data ?? [];
  const settled = [requests, payments, permits].every((s) => !s.isLoading && !s.isError);
  const nothing = settled && forms.length === 0 && inbox.length === 0 && tasks.length === 0;

  return (
    <Panel id="actions" icon={Inbox} title={t("home:actions.title")} subtitle={t("home:actions.subtitle")} className={className}>
      {nothing ? (
        <EmptyNote icon={Inbox} title={t("home:actions.empty_title")} text={t("home:actions.empty_text")} />
      ) : (
        <div className="space-y-5">
          <Group icon={ClipboardList} title={t("home:actions.forms")} source={requests} rows={forms.length}>
            {forms.map((r) => (
              <Row
                key={r.id}
                href={`/requests/${r.id}`}
                wideLead
                lead={<span dir="ltr" className="block rounded-lg bg-muted/70 px-2 py-1 text-xs font-bold tabular-nums text-foreground">{r.requestNumber}</span>}
                title={<bdi>{r.title || r.typeCode}</bdi>}
                detail={<><span className="sm:hidden"><bdi>{r.requestNumber}</bdi> · </span><bdi>{r.projectName}</bdi> · {t(`enums:workflow_step.${r.stepName}`, { defaultValue: r.stepName })}</>}
                trail={
                  <span className={cn("shrink-0 inline-flex items-center gap-1 text-xs tabular-nums", r.stalled ? "font-bold text-foreground" : "text-muted-foreground/80 dark:text-foreground/70")}>
                    {r.stalled && (
                      <>
                        <Hourglass className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <span className="sr-only">{t("home:actions.stalled")}: </span>
                      </>
                    )}
                    {r.ageDays === 0 ? t("home:actions.waiting_today") : t("home:actions.waiting_days", { count: r.ageDays })}
                  </span>
                }
              />
            ))}
            {formsTotal > forms.length && (
              <li className="px-3 text-xs text-muted-foreground/80 dark:text-foreground/70">{t("home:actions.more_forms", { count: formsTotal - forms.length })}</li>
            )}
          </Group>

          <Group icon={Wallet} title={t("home:actions.payments")} source={payments} rows={inbox.length}>
            {inbox.map((i) => (
              <Row
                key={i.key}
                href={`/payments?tab=${i.tab}${i.projectId ? `&project=${i.projectId}` : ""}${i.ids.length === 1 ? `&focus=${i.ids[0]}` : ""}`}
                lead={<span className="block min-w-8 text-center rounded-full bg-foreground text-background text-sm font-bold px-2 tabular-nums">{num(i.count)}</span>}
                title={t(`notifications:summary.inbox.${i.key}`, { defaultValue: i.label })}
              />
            ))}
          </Group>

          <Group icon={Landmark} title={t("home:actions.permits")} source={permits} rows={tasks.length}>
            {tasks.slice(0, PERMITS_SHOWN).map((s) => {
              const overdue = !!s.dueDate && s.dueDate < todayIso;
              return (
                <Row
                  key={s.id}
                  href={`/permits/${s.transactionId}`}
                  lead={<Landmark className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                  title={<bdi>{s.title}</bdi>}
                  detail={<><bdi>{s.projectName}</bdi> · <bdi>{s.transactionTitle}</bdi></>}
                  trail={
                    s.dueDate ? (
                      <span className={cn("shrink-0 inline-flex items-center gap-1 text-xs", overdue ? "font-bold text-foreground" : "text-muted-foreground/80 dark:text-foreground/70")}>
                        {overdue && (
                          <>
                            <Hourglass className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            <span className="sr-only">{t("home:actions.overdue")}: </span>
                          </>
                        )}
                        {t("home:actions.due", { date: fmtDate(s.dueDate) })}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
            {tasks.length > PERMITS_SHOWN && (
              <li>
                <Link href="/permits?tab=mine" className={cn("inline-flex items-center min-h-11 px-3 text-sm font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 rounded-lg", FOCUS)}>
                  {t("home:state.view_all")} ({num(tasks.length)})
                </Link>
              </li>
            )}
          </Group>
        </div>
      )}
    </Panel>
  );
}
