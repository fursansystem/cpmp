// The reader's latest notifications. Nothing here is counted again: it is the same feed as the bell.
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/i18n-format";
import type { Notification } from "@shared/schema";
import { EmptyNote, FOCUS, Panel, RowsSkeleton, SectionError } from "./parts";

interface Props {
  items: Notification[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  className?: string;
}

export function ActivityPanel({ items, isLoading, isError, refetch, className }: Props) {
  const { t } = useTranslation("home");
  return (
    <Panel
      id="activity"
      icon={History}
      title={t("activity.title")}
      subtitle={t("activity.subtitle")}
      className={className}
      action={
        <Link href="/notifications" className={cn("shrink-0 inline-flex items-center min-h-11 px-2 text-sm font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 rounded-lg", FOCUS)}>
          {t("activity.all")}
        </Link>
      }
    >
      {isLoading ? (
        <RowsSkeleton rows={5} />
      ) : isError ? (
        <SectionError onRetry={refetch} />
      ) : !items || items.length === 0 ? (
        <EmptyNote icon={History} text={t("activity.empty")} />
      ) : (
        <ul className="divide-y">
          {items.map((n) => {
            const body = (
              <>
                <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", n.isRead ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className={cn("block text-sm text-foreground truncate", !n.isRead && "font-bold")}>
                    {!n.isRead && <span className="sr-only">{t("activity.unread")}: </span>}
                    <bdi>{n.title}</bdi>
                  </span>
                  <span className="block text-xs text-muted-foreground/80 dark:text-foreground/70 truncate"><bdi>{n.message}</bdi></span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/80 dark:text-foreground/70 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
              </>
            );
            const row = "flex items-start gap-3 min-h-11 py-2.5 px-1";
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className={cn(row, "rounded-lg hover:bg-muted/50 transition-colors", FOCUS)}>{body}</Link>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
