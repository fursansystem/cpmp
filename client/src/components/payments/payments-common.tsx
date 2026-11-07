import type { PermitFeeRow } from "@shared/permits";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Paperclip, Trash2, Loader2, FileText, Upload, AlertTriangle, ShoppingCart, BarChart3, X, History, Clock, User, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PaymentEntityType, PoSummary } from "@shared/payments";

export interface PaymentFile {
  id: string;
  fileName: string;
  objectPath: string;
  contentType: string | null;
  size: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

// Financial figures are fetched fresh and kept out of the localStorage query cache (meta.persist)
export const paymentsQuery = { persist: false } as const;

export const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

export const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

export async function getJson<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return res.json();
}

// apiRequest throws "<status>: <body>" — show the server's own message, not the wrapper
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON */
  }
  return body || "حدث خطأ";
}

// A notification links to a record (?focus=<id>). The tab that owns that record opens it once, then the parameter
// is dropped so going back or refreshing does not open it again.
export function useFocusFromUrl(owns: (id: string) => boolean, open: (id: string) => void) {
  // Following a notification while already on this page changes only the query string, so react to it
  const search = useSearch();
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("focus");
      if (!id || !owns(id)) return;
      open(id);
      params.delete("focus");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } catch {
      /* a link that cannot be read just opens the tab */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
}

export function invalidatePayments(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["payments"] });
}

const TONES: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  red: "bg-destructive/10 text-destructive",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  muted: "bg-muted text-muted-foreground",
};

export const STATUS_TONE: Record<string, string> = {
  // bill requests
  requested: "amber", submitted: "blue", received: "emerald", returned: "red",
  // payment orders
  draft: "muted", pending_approval: "amber", approved: "blue", paid: "emerald", rejected: "red", cancelled: "muted", request_approved: "violet",
  // licences & transactions (الرخص والمعاملات), their steps and requirements
  pending: "muted", in_progress: "blue", expired: "red", not_started: "muted", completed: "emerald",
  done: "emerald", skipped: "muted", missing: "amber", provided: "emerald", not_applicable: "muted",
  // fines
  open: "amber", under_appeal: "violet", payment_requested: "blue", waiver_requested: "violet", waived: "muted", recovered: "emerald",
  // invoice charge-backs
  proposed: "amber", applied: "emerald", converted: "violet",
};

export function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return (
    <Badge variant="secondary" className={cn("border-none font-semibold whitespace-nowrap", TONES[STATUS_TONE[status] ?? "muted"])}>
      {labels[status] ?? status}
    </Badge>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// The Saudi Riyal sign. Drawn rather than typed: few fonts carry U+20C1 yet
export function RiyalSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1124.14 1256.39" fill="currentColor" role="img" aria-label="ريال سعودي" className={cn("block", className)}>
      <path d="M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z" />
      <path d="M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z" />
    </svg>
  );
}

const DIALOG_SIZES ={ sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" } as const;

interface PaymentDialogProps {
  // Forms kept mounted pass their own open state; record dialogs are mounted only while open
  open?: boolean;
  onClose: () => void;
  size?: keyof typeof DIALOG_SIZES;
  icon: LucideIcon;
  // What kind of record this is, shown above the title (أمر دفع، مستخلص…)
  kind: string;
  title: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  // The record's amount, on one line above the actions
  amount?: ReactNode;
  amountLabel?: string;
  // Small buttons next to the close button, such as the record's history
  headerActions?: ReactNode;
  // A form the user opened from the actions (reject, pay…): kept above the actions, outside the scrolling body
  panel?: ReactNode;
  // Main action first: the bar starts on the right, where an Arabic line starts
  footer?: ReactNode;
  children: ReactNode;
}

// One shell for the payments dialogs: the header and the actions stay in place while the body scrolls
export function PaymentDialog({ open = true, onClose, size = "lg", icon: Icon, kind, title, badge, description, amount, amountLabel = "المبلغ", headerActions, panel, footer, children }: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* No focus jump on open: the first focusable control sits low in the body and would scroll it down */}
      <DialogContent hideCloseButton dir="rtl" onOpenAutoFocus={(e) => e.preventDefault()} className={cn("flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden border-none shadow-2xl rounded-[1.5rem] sm:rounded-[1.5rem]", DIALOG_SIZES[size])}>
        {/* Soft glow behind the header, as on the delivery overview */}
        {/* Clipped in its own layer: sticking out, it would make the dialog scroll sideways */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />
        </div>
        <DialogHeader className="relative flex-row flex-wrap items-center gap-x-4 gap-y-3 space-y-0 px-6 pt-6 pb-4 text-start sm:text-start">
          <div className="w-14 h-14 rounded-md bg-primary text-primary-foreground shadow-xl shadow-primary/30 flex items-center justify-center shrink-0">
            <Icon className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-2xl font-black leading-tight">
              {title}
              {badge}
            </DialogTitle>
            {/* The record kind and its project on one line */}
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {kind}
              </span>
              {description && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{description}</span>
                </>
              )}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0 self-start">
            {headerActions}
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="rounded-full bg-muted/50 hover:bg-muted">
                <X className="w-4 h-4" />
                <span className="sr-only">إغلاق</span>
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="relative flex-1 overflow-y-auto px-6 pt-2 pb-6 space-y-6">{children}</div>
        {panel && <div className="border-t px-6 py-4">{panel}</div>}
        {amount != null && (
          // The amount on one line, just above the actions
          // Same size as the title; padded alike on the sides and below
          <div className="flex items-center gap-3 border-t px-6 pt-4 pb-6 text-2xl font-black leading-tight">
            <span className="text-muted-foreground">{amountLabel}</span>
            <span className="ms-auto flex items-center gap-2 tabular-nums text-primary">
              {amount}
              <RiyalSymbol className="h-6 w-auto" />
            </span>
          </div>
        )}
        {footer && (
          <DialogFooter className="flex-row flex-wrap items-center justify-start sm:justify-start gap-2 sm:space-x-0 border-t bg-muted/30 px-6 py-4 [&_button]:h-11 empty:hidden">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A group inside a payments dialog (details, approvals…): a dotted heading over its tiles, like the delivery overview
export function Section({ title, icon: Icon, tone, children }: { title?: string; icon?: LucideIcon; tone?: "danger"; children: ReactNode }) {
  return (
    <section className={cn("space-y-3", tone === "danger" && "rounded-md border border-destructive/30 bg-destructive/5 p-3")}>
      {title && (
        <div className={cn("flex items-center gap-2 text-sm font-bold", tone === "danger" ? "text-destructive" : "text-foreground/70")}>
          {Icon ? <Icon className={cn("w-4 h-4", tone !== "danger" && "text-primary")} /> : <span className="w-2 h-2 rounded-full bg-primary/40" />}
          {title}
        </div>
      )}
      {children}
    </section>
  );
}

// One row of values in a single tinted rectangle, split by thin rules (stacked on a phone)
export function TileRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid auto-cols-fr rounded-md border border-muted/50 bg-muted/30 transition-colors hover:border-primary/30 sm:grid-flow-col",
        "[&>*+*]:border-t [&>*+*]:border-muted/60 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-s",
        className,
      )}
    >
      {children}
    </div>
  );
}

// One value inside a TileRow: the label small above it
export function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-[11px] font-bold text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-bold text-foreground">{children}</div>
    </div>
  );
}

// The last thing done on the record, with the full history a click away
export function LatestActivity({ entityType, entityId, labels }: { entityType: PaymentEntityType; entityId: string; labels: Record<string, string> }) {
  const { data = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["payments", "activity", entityType, entityId],
    queryFn: () => getJson(`/api/payments/activity?entityType=${entityType}&entityId=${entityId}`),
    meta: paymentsQuery,
  });
  const last = data[0];

  return (
    <div className="flex items-center gap-3 rounded-md border border-muted/50 bg-muted/30 px-3 py-2.5">
      <div className="w-8 h-8 rounded-full bg-background border border-primary/20 flex items-center justify-center shadow-sm shrink-0">
        <Clock className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold text-muted-foreground">آخر إجراء</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : !last ? (
          <div className="text-sm text-muted-foreground">لا يوجد سجل</div>
        ) : (
          <>
            <div className="text-sm font-bold truncate">
              {ACTION_LABELS[last.action] ?? last.action}
              {last.toStatus && last.fromStatus !== last.toStatus && (
                <span className="font-normal text-muted-foreground"> · {labels[last.toStatus] ?? last.toStatus}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {last.userName ?? "—"} · <span dir="ltr">{fmtDateTime(last.createdAt)}</span>
            </div>
          </>
        )}
      </div>
      <ActivityHistory entityType={entityType} entityId={entityId} labels={labels} />
    </div>
  );
}

// The server only accepts files under /projects/<id>/payments/, which is where this uploads them
async function uploadToPayments(file: File, projectId: string) {
  const presign = await fetch("/api/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      folder: "payments",
      projectId,
    }),
  });
  if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error || "Failed to prepare upload");
  const { uploadURL, objectPath } = await presign.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!put.ok) throw new Error("Failed to upload the file");
  return objectPath as string;
}

interface AttachmentsPanelProps {
  entityType: PaymentEntityType;
  entityId: string;
  projectId: string;
  files: PaymentFile[];
  // Whether the viewer may add/remove files right now (depends on the record's status)
  editable: boolean;
  // Shown above the list so the user knows what to attach
  hint?: string;
  canRemove: (file: PaymentFile) => boolean;
}

export function AttachmentsPanel({ entityType, entityId, projectId, files, editable, hint, canRemove }: AttachmentsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/attachments/${id}`),
    onSuccess: () => invalidatePayments(queryClient),
    onError: (e) => toast({ title: "تعذّر حذف الملف", description: errorMessage(e), variant: "destructive" }),
  });

  const onPick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 25 * 1024 * 1024) {
          toast({ title: `${file.name} أكبر من 25MB`, variant: "destructive" });
          continue;
        }
        const objectPath = await uploadToPayments(file, projectId);
        await apiRequest("POST", "/api/payments/attachments", {
          entityType,
          entityId,
          fileName: file.name,
          objectPath,
          contentType: file.type || null,
          size: file.size,
        });
      }
      invalidatePayments(queryClient);
    } catch (e) {
      toast({ title: "تعذّر رفع الملف", description: errorMessage(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Paperclip className="w-4 h-4" /> المرفقات (Attachments) <span className="text-muted-foreground font-normal">({files.length})</span>
        </div>
        {editable && (
          <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              رفع ملف
            </Button>
          </>
        )}
      </div>
      {hint && editable && <p className="text-xs text-muted-foreground">{hint}</p>}
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-xl p-4 text-center">لا توجد مرفقات</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <a href={f.objectPath} target="_blank" rel="noreferrer" className="truncate flex-1 text-primary hover:underline">
                {f.fileName}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">{fmtDate(f.createdAt)}</span>
              {editable && canRemove(f) && (
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(f.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ActivityRow {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
  userName: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  created: "تم الإنشاء",
  originals_requested: "طلب أصل الفاتورة",
  invoice_added: "إضافة فاتورة",
  invoice_removed: "حذف فاتورة",
  chargeback_created: "تحميل جزء من فاتورة على مقاول",
  applied: "خُصم في مستخلص",
  released: "أُعيد للانتظار",
  convert: "حُوّل إلى خصم",
  recover: "تسجيل الاسترداد",
  reserved: "حُجز للخصم من مستخلص",
  withdraw: "سحب",
  chargebacks_changed: "تغيير خصومات الفواتير",
  waiver_request: "طلب إعفاء",
  requested: "طلب تحويل",
  approve_request: "موافقة مدير المشروع على الطلب",
  decline_request: "رفض الطلب",
  accept_request: "قبول المحاسبة للطلب",
  withdraw_request: "سحب الطلب",
  waiver_withdraw: "سحب طلب الإعفاء",
  waiver_approve: "اعتماد الإعفاء",
  waiver_reject: "رفض الإعفاء",
  edited: "تم التعديل",
  submit: "إرسال",
  receive: "تأكيد الاستلام",
  return: "إعادة للتصحيح",
  cancel: "إلغاء",
  approve: "اعتماد",
  reject: "رفض",
  pay: "صرف الدفعة",
  status_changed: "تغيير الحالة",
  file_added: "إضافة ملف",
  file_removed: "حذف ملف",
};

export function ActivityTimeline({ entityType, entityId, labels }: { entityType: PaymentEntityType; entityId: string; labels: Record<string, string> }) {
  const { data = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["payments", "activity", entityType, entityId],
    queryFn: () => getJson(`/api/payments/activity?entityType=${entityType}&entityId=${entityId}`),
    meta: paymentsQuery,
  });

  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">سجل المتابعة (Tracking)</div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا يوجد سجل</p>
      ) : (
        <ol className="space-y-2 border-s ps-4">
          {data.map((a) => (
            <li key={a.id} className="relative text-sm">
              <span className="absolute -start-[21px] top-1.5 w-2 h-2 rounded-full bg-primary" />
              <div className="font-semibold">
                {ACTION_LABELS[a.action] ?? a.action}
                {a.toStatus && a.fromStatus !== a.toStatus && (
                  <span className="font-normal text-muted-foreground"> → {labels[a.toStatus] ?? a.toStatus}</span>
                )}
              </div>
              {a.note && <div className="text-muted-foreground">{a.note}</div>}
              <div className="text-xs text-muted-foreground">
                {a.userName ?? "—"} · {fmtDateTime(a.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The record's tracking log in a popover under a header icon, laid out like the History card on request pages
export function ActivityHistory({ entityType, entityId, labels }: { entityType: PaymentEntityType; entityId: string; labels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["payments", "activity", entityType, entityId],
    queryFn: () => getJson(`/api/payments/activity?entityType=${entityType}&entityId=${entityId}`),
    meta: paymentsQuery,
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10 hover:text-primary" title="السجل (History)">
          <History className="w-4 h-4" />
          <span className="sr-only">السجل</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" dir="rtl" className="w-80 p-0 overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b bg-gradient-to-br from-primary/5 via-background to-background px-4 py-3">
          <div className="p-1.5 rounded-lg bg-primary shadow-md shadow-primary/10">
            <Clock className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">السجل</span>
          <span className="text-xs text-muted-foreground">History</span>
        </div>
        {/* The popover sits outside the dialog, whose scroll lock cancels the wheel there, so scroll it by hand */}
        <div className="max-h-[360px] overflow-y-auto px-4 py-4" onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد سجل</p>
          ) : (
            <ol className="space-y-5">
              {data.map((a, index) => (
                <li key={a.id} className="relative ps-10">
                  {index !== data.length - 1 && <div className="absolute start-[13px] top-8 -bottom-5 w-[2px] bg-muted" />}
                  <div className="absolute start-0 top-0 w-7 h-7 rounded-full bg-background border border-primary/20 flex items-center justify-center shadow-sm">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="text-[11px] font-bold px-2 py-0 h-5">{ACTION_LABELS[a.action] ?? a.action}</Badge>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap" dir="ltr">{fmtDateTime(a.createdAt)}</span>
                    </div>
                    {a.toStatus && a.fromStatus !== a.toStatus && (
                      <div className="text-xs text-muted-foreground">الحالة: <span className="font-semibold text-foreground">{labels[a.toStatus] ?? a.toStatus}</span></div>
                    )}
                    {a.note && <p className="text-sm leading-relaxed bg-muted/30 px-3 py-2 rounded-xl border border-muted/50">{a.note}</p>}
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <User className="w-3 h-3" />
                      {a.userName ?? "—"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface PaymentsContext {
  perms: { isAccounting: boolean; canApprove: boolean };
  projects: { id: string; name: string; canRequest: boolean }[];
}

export interface PaymentsOverview {
  billRequests: any[];
  orders: any[];
  subcontractorCertificates: any[];
  chargebacks: any[];
  subcontractors: any[];
  // licence and transaction fees from الرخص والمعاملات
  permits: PermitFeeRow[];
  fines: any[];
  purchaseOrders: PoSummary[];
  suppliers: { id: string; projectId: string; name: string; taxNumber: string | null }[];
}

// Suppliers are kept per project, so one company in two projects is two rows. For a statement they count as
// one supplier when the tax number matches, or the name when there is no tax number.
export const supplierKey = (s: { name: string; taxNumber: string | null }) => (s.taxNumber?.trim() || s.name.trim()).toLowerCase();

export const poLabel =(po?: { poNumber: string; supplierName: string | null } | null) =>
  po ? `${po.poNumber}${po.supplierName ? ` · ${po.supplierName}` : ""}` : "";

// A visible alert, never a block: the PO's invoices/payments exceed its value
export function PoOverAlert({ po, projected }: { po: { poNumber: string; value: number }; projected: number }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        <b>تنبيه:</b> إجمالي المفوتر والمدفوع على أمر الشراء {po.poNumber} ({money(projected)}) يتجاوز قيمته ({money(po.value)}) بمقدار {money(projected - po.value)}. يمكنك المتابعة، لكن راجع أمر الشراء أو ملاحقه.
      </span>
    </div>
  );
}

// Where a purchase order stands: its value, what is invoiced, ordered and paid, and what is left
export function PoCard({ po }: { po: PoSummary }) {
  const stat = (label: string, value: number, cls = "") => (
    <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("font-semibold tabular-nums", cls)}>{money(value)}</div></div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold"><ShoppingCart className="w-4 h-4" /> أمر الشراء <span className="font-mono">{po.poNumber}</span>{po.supplierName && <span className="font-normal text-muted-foreground">· {po.supplierName}</span>}
        <Link href={`/reports?report=po&po=${po.id}&project=${po.projectId}`} className="ms-auto inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline" title="كشف أمر الشراء">
          <BarChart3 className="w-3.5 h-3.5" /> كشف أمر الشراء
        </Link>
      </div>
      <div className="rounded-2xl border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
        {stat("قيمة الأمر", po.value)}
        <div>
          <div className="text-xs text-muted-foreground">المستلم</div>
          <div className="font-semibold tabular-nums">{money(po.receivedValue)} <span className="text-xs font-normal text-muted-foreground">({po.receivedPct.toFixed(0)}%)</span></div>
        </div>
        {stat("المفوتر", po.invoiced)}
        {stat("أوامر الدفع", po.ordered)}
        {stat("المدفوع", po.paid, "text-emerald-700 dark:text-emerald-300")}
        {stat("المتبقي", po.remaining, po.over ? "text-destructive" : "")}
      </div>
      {po.over && <PoOverAlert po={po} projected={po.committed} />}
    </div>
  );
}
