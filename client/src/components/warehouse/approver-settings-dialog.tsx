import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Users, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ApproverSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ApproverSettingsDialog({ open, onOpenChange, projectId }: ApproverSettingsDialogProps) {
  const { t } = useTranslation("warehouse");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "inventory-approvers"],
    enabled: open && !!projectId,
  });

  // Re-seed the checkboxes from the server each time the dialog opens, so a cancelled
  // edit does not linger into the next visit.
  useEffect(() => {
    if (open && data) {
      setSelected((data.approvers ?? []).map((a: any) => a.positionId));
    }
  }, [open, data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/inventory-approvers`, {
        positionIds: selected,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "inventory-approvers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "inventory-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "material-issues"] });
      toast({ title: t("approvers_dialog.toasts.saved") });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: t("approvers_dialog.toasts.failed"), description: e?.message || t("approvers_dialog.toasts.failed"), variant: "destructive" }),
  });

  const coverage: any[] = data?.coverage ?? [];
  const canManage = data?.canManage !== false;
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  // A selected position whose holders have no login cannot actually approve anything.
  const selectedWithoutUsers = coverage.filter((c) => selected.includes(c.position.id) && c.userCount === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-end">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {t("approvers_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("approvers_dialog.description")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : coverage.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 flex flex-col items-center gap-2 text-center px-4">
            <Users className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs font-bold">{t("approvers_dialog.empty_title")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("approvers_dialog.empty_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {coverage.map((c) => {
              const checked = selected.includes(c.position.id);
              const noUsers = c.userCount === 0;
              return (
                <label
                  key={c.position.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                    checked ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/30",
                    !canManage && "cursor-not-allowed opacity-60"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!canManage}
                    onCheckedChange={() => canManage && toggle(c.position.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">
                      {c.position.titleArabic || c.position.titleEnglish}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.position.titleEnglish}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="rounded-full text-[10px] font-bold">
                      {t("approvers_dialog.member_count", { count: c.memberCount })}
                    </Badge>
                    {noUsers ? (
                      <Badge className="rounded-full border-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold gap-1">
                        <UserX className="w-3 h-3" />
                        {t("approvers_dialog.no_account")}
                      </Badge>
                    ) : (
                      <Badge className="rounded-full border-none bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px] font-bold">
                        {t("approvers_dialog.user_count", { count: c.userCount })}
                      </Badge>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {selected.length === 0 && coverage.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <Trans i18nKey="approvers_dialog.no_approvers_warning" t={t} components={[<span key="0" className="font-black" />]} />
            </p>
          </div>
        )}

        {selectedWithoutUsers.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-black">
                {selectedWithoutUsers.map((c) => c.position.titleArabic || c.position.titleEnglish).join(", ")}
              </span>{" "}
              {t("approvers_dialog.no_account_warning")}
            </p>
          </div>
        )}

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !canManage || isLoading}
            className="rounded-xl font-bold"
          >
            {save.isPending ? t("approvers_dialog.saving") : t("approvers_dialog.save")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            {t("approvers_dialog.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
