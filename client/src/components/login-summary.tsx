// ملخص ما ينتظرك: shown once after signing in, only when something is waiting or unread.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BellRing, ChevronLeft, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

// Set by login(), read once here, so a page refresh in the same session does not bring the summary back
export const SUMMARY_FLAG = "pm-show-login-summary";
const hiddenKey = (userId: string) => `login-summary-hidden-${userId}`;

// The same preference is changed from here ("do not show again") and from the user settings
export function isLoginSummaryEnabled(userId: string): boolean {
  try { return localStorage.getItem(hiddenKey(userId)) !== "1"; } catch { return true; }
}
export function setLoginSummaryEnabled(userId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(hiddenKey(userId));
    else localStorage.setItem(hiddenKey(userId), "1");
  } catch { /* storage can be blocked */ }
}

interface SummaryGroup { key: string; label: string; count: number; latestTitle: string; latestMessage: string; link: string | null; payments: boolean }
interface InboxItem { key: string; label: string; count: number; tab: string; ids: string[]; projectId: string | null }

export function LoginSummary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hideNext, setHideNext] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (sessionStorage.getItem(SUMMARY_FLAG) !== "1") return;
      sessionStorage.removeItem(SUMMARY_FLAG);
      if (!isLoginSummaryEnabled(user.id)) return;
      setArmed(true);
    } catch {
      /* storage can be blocked: simply no summary */
    }
  }, [user?.id]);

  const summary = useQuery<{ total: number; groups: SummaryGroup[] }>({
    queryKey: ["/api/notifications/summary"],
    enabled: armed,
    retry: false,
    meta: { persist: false },
  });
  const inbox = useQuery<{ items: InboxItem[] }>({
    queryKey: ["/api/payments/inbox"],
    enabled: armed,
    retry: false,
    meta: { persist: false },
  });

  const loaded = armed && !summary.isLoading && !inbox.isLoading;
  const waiting = inbox.data?.items ?? [];
  const groups = summary.data?.groups ?? [];

  useEffect(() => {
    if (loaded && (waiting.length > 0 || groups.length > 0)) setOpen(true);
  }, [loaded, waiting.length, groups.length]);

  const markAll = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/summary"] });
      close();
    },
  });

  function close() {
    if (hideNext && user?.id) setLoginSummaryEnabled(user.id, false);
    setOpen(false);
    setArmed(false);
  }

  const go = (href: string) => { close(); navigate(href); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent hideCloseButton className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" /> ملخص ما ينتظرك</DialogTitle>
          <DialogDescription>أهم ما يحتاج متابعتك الآن وما وصلك منذ آخر زيارة.</DialogDescription>
        </DialogHeader>

        {waiting.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> المطلوب منك</h3>
            <ul className="space-y-1.5">
              {waiting.map((i) => (
                <li key={i.key}>
                  <button type="button" onClick={() => go(`/payments?tab=${i.tab}${i.projectId ? `&project=${i.projectId}` : ""}${i.ids.length === 1 ? `&focus=${i.ids[0]}` : ""}`)} className="w-full flex items-center gap-3 rounded-xl border bg-primary/5 px-3 py-2 text-start hover-elevate">
                    <span className="min-w-8 text-center rounded-full bg-primary text-primary-foreground text-sm font-bold px-2">{i.count}</span>
                    <span className="flex-1 text-sm">{i.label}</span>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold">تنبيهات غير مقروءة ({summary.data?.total ?? 0})</h3>
            <ul className="space-y-1.5">
              {groups.map((g) => (
                <li key={g.key}>
                  <button type="button" disabled={!g.link} onClick={() => g.link && go(g.link)} className="w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-start hover-elevate">
                    <span className="min-w-8 text-center rounded-full bg-muted text-sm font-bold px-2">{g.count}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold">{g.label}</span>
                      <span className="block text-xs text-muted-foreground truncate" dir="auto">{g.latestTitle}{g.latestMessage ? ` — ${g.latestMessage}` : ""}</span>
                    </span>
                    {g.link && <ChevronLeft className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer" htmlFor="login-summary-hide">
          <input id="login-summary-hide" type="checkbox" className="h-4 w-4" checked={hideNext} onChange={(e) => setHideNext(e.target.checked)} />
          لا تُظهر هذا الملخص عند تسجيل الدخول
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          {groups.length > 0 && <Button variant="outline" disabled={markAll.isPending} onClick={() => markAll.mutate()}>تحديد الكل كمقروء</Button>}
          <Button onClick={close}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
