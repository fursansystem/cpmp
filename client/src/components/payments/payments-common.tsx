import { useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Trash2, Loader2, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PaymentEntityType } from "@shared/payments";

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
  draft: "muted", pending_approval: "amber", approved: "blue", paid: "emerald", rejected: "red", cancelled: "muted",
  // clearances
  pending: "muted", in_progress: "blue", obtained: "emerald", expired: "red",
  // fines
  open: "amber", under_appeal: "violet", payment_requested: "blue", waiver_requested: "violet", waived: "muted",
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  waiver_request: "طلب إعفاء",
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

export interface PaymentsContext {
  perms: { isAccounting: boolean; canApprove: boolean };
  projects: { id: string; name: string }[];
}

export interface PaymentsOverview {
  billRequests: any[];
  orders: any[];
  clearances: any[];
  fines: any[];
}
