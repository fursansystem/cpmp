import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, PackageOpen, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StockActivity } from "@shared/schema";

const WINDOW_DAYS = 30;

const qty = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} />
    </div>
  );
}

export function WarehouseActivity({ projectId }: { projectId: string }) {
  const { t } = useTranslation("warehouse");

  const { data } = useQuery<StockActivity>({
    queryKey: ["/api/projects", projectId, "stock-activity"],
    enabled: !!projectId,
  });

  // The server only returns days that had movement; the chart needs every day of the window
  const days = useMemo(() => {
    const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
    const out: { date: string; in: number; out: number }[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = isoDate(d);
      out.push(byDate.get(date) ?? { date, in: 0, out: 0 });
    }
    return out;
  }, [data]);

  if (!data) return null;

  const totalIn = days.reduce((s, d) => s + d.in, 0);
  const totalOut = days.reduce((s, d) => s + d.out, 0);
  const peak = Math.max(1, ...days.map((d) => Math.max(d.in, d.out)));
  const topCount = Math.max(1, ...data.topIssued.map((m) => m.count));
  const topLines = Math.max(1, ...data.recipients.map((r) => r.lines));

  if (totalIn + totalOut === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-8 flex flex-col items-center gap-2">
          <Activity className="w-7 h-7 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground font-bold">{t("activity.empty", { n: WINDOW_DAYS })}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {t("activity.title", { n: WINDOW_DAYS })}
            </CardTitle>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                {t("activity.in")} <span className="font-black">{totalIn}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                {t("activity.out")} <span className="font-black">{totalOut}</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("activity.hint")}</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[3px] h-32" role="img" aria-label={t("activity.aria", { in: totalIn, out: totalOut, n: WINDOW_DAYS })}>
            {days.map((d) => (
              <div
                key={d.date}
                className="flex-1 h-full flex items-end justify-center gap-px min-w-0"
                title={`${d.date} · ${t("activity.in")} ${d.in} · ${t("activity.out")} ${d.out}`}
                data-testid={`activity-day-${d.date}`}
              >
                <div className={cn("w-1/2 rounded-t-sm bg-emerald-500", d.in === 0 && "opacity-0")} style={{ height: `${(d.in / peak) * 100}%` }} />
                <div className={cn("w-1/2 rounded-t-sm bg-amber-500", d.out === 0 && "opacity-0")} style={{ height: `${(d.out / peak) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-border/60 flex justify-between text-[10px] text-muted-foreground">
            <span>{days[0].date}</span>
            <span>{t("activity.peak", { n: peak })}</span>
            <span>{days[days.length - 1].date}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <PackageOpen className="w-4 h-4 text-primary" />
              {t("activity.top_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topIssued.length === 0 && <p className="text-xs text-muted-foreground">{t("activity.top_empty")}</p>}
            {data.topIssued.map((m) => (
              <div key={m.materialId} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-bold truncate" dir="auto">{m.materialName}</span>
                  <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                    <span className="font-black text-foreground">{t("activity.times", { n: m.count })}</span> · {qty(m.quantity)} {m.unit}
                  </span>
                </div>
                <ShareBar share={m.count / topCount} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {t("activity.recipients_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recipients.length === 0 && <p className="text-xs text-muted-foreground">{t("activity.recipients_empty")}</p>}
            {data.recipients.map((r) => (
              <div key={`${r.recipientType}:${r.name}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-bold truncate" dir="auto">{r.name}</span>
                  <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                    <span className="font-black text-foreground">{t("activity.lines", { n: r.lines })}</span> · {t("activity.vouchers", { n: r.vouchers })}
                  </span>
                </div>
                <ShareBar share={r.lines / topLines} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
