import { useEffect, useState } from "react";
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
      toast({ title: "تم حفظ المناصب المعتمدة" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "تعذّر الحفظ", description: e?.message || "حدث خطأ", variant: "destructive" }),
  });

  const coverage: any[] = data?.coverage ?? [];
  const canManage = data?.canManage !== false;
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  // A selected position whose holders have no login cannot actually approve anything.
  const selectedWithoutUsers = coverage.filter((c) => selected.includes(c.position.id) && c.userCount === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ShieldCheck className="w-5 h-5 text-primary" />
            المناصب المعتمدة لسندات الصرف
          </DialogTitle>
          <DialogDescription className="text-xs">
            من يحمل أحد هذه المناصب في المشروع يستطيع اعتماد سندات الصرف وتسجيل التسويات
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
            <p className="text-xs font-bold">لا توجد مناصب مشغولة في هذا المشروع</p>
            <p className="text-[11px] text-muted-foreground">
              أضف أعضاء الفريق وحدّد مناصبهم أولًا، ثم عُد لضبط المعتمدين.
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
                      {c.memberCount} عضو
                    </Badge>
                    {noUsers ? (
                      <Badge className="rounded-full border-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold gap-1">
                        <UserX className="w-3 h-3" />
                        بلا حساب
                      </Badge>
                    ) : (
                      <Badge className="rounded-full border-none bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px] font-bold">
                        {c.userCount} مستخدم
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
              بلا مناصب معتمدة، <span className="font-black">لن يستطيع أحد اعتماد سندات الصرف</span> عدا
              مدير النظام — وستبقى السندات التي تحتوي مواد تحتاج اعتمادًا معلّقة.
            </p>
          </div>
        )}

        {selectedWithoutUsers.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-black">
                {selectedWithoutUsers.map((c) => c.position.titleArabic || c.position.titleEnglish).join("، ")}
              </span>{" "}
              — لا يملك شاغلوها حسابات دخول، فلن يتمكنوا من الاعتماد فعليًا حتى تُربط حساباتهم.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !canManage || isLoading}
            className="rounded-xl font-bold"
          >
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
