import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { FileDown, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { WirFormDialog, PRINT_STYLES_FOR_CAPTURE } from "@/components/wir-form-dialog";

interface RequestFormsExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  // Preselects the type; the dialog still lets the user change it.
  defaultTypeCode?: string;
}

// Each form has to be rendered, rasterised and converted before the next one starts, so
// the ceiling is the browser's, not the database's.
const BATCH_LIMIT = 200;
const SLOW_THRESHOLD = 60;

// Catches a crash inside the form so the export can report which request failed and why,
// instead of silently producing a blank page.
class ExportErrorBoundary extends Component<
  { children: ReactNode; onError: (e: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function RequestFormsExportDialog({
  open,
  onOpenChange,
  projectId,
  defaultTypeCode = "MIR",
}: RequestFormsExportDialogProps) {
  const { toast } = useToast();
  const [typeCode, setTypeCode] = useState(defaultTypeCode);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: requestTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/request-types"],
    enabled: open,
  });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const cancelRef = useRef(false);
  const renderErrorRef = useRef<Error | null>(null);
  const [exportProps, setExportProps] = useState<any>(null);

  // Offscreen host for the portal. Positioned far off-screen rather than display:none,
  // which would collapse the layout html2canvas needs to measure.
  const [hostEl] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;";
    return el;
  });

  useEffect(() => {
    if (!hostEl) return;
    document.body.appendChild(hostEl);
    return () => {
      hostEl.remove();
    };
  }, [hostEl]);

  const params = new URLSearchParams({ typeCode });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: countData, isFetching: counting } = useQuery<{ count: number }>({
    queryKey: ["/api/projects", projectId, "request-forms/export-count", typeCode, dateFrom, dateTo],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/projects/${projectId}/request-forms/export-count?${params.toString()}`
      );
      return await res.json();
    },
    enabled: open && !!projectId && !!typeCode,
  });

  const matching = countData?.count ?? 0;
  const willExport = Math.min(matching, BATCH_LIMIT);

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      setRunning(false);
      setDone(0);
      setTotal(0);
      setCurrentName("");
    }
  }, [open]);


  // Renders the form offscreen through a PORTAL rather than a separate React root. A
  // second root has no access to the app's providers, so the form's own useQuery calls
  // fail with "No QueryClient set"; a portal stays inside this tree and inherits them all.
  //
  // The node handed back is live and in the document: html2canvas measures real layout,
  // so a detached element would capture a blank page.
  const renderFormNode = (props: any, key: string): Promise<HTMLElement | null> =>
    new Promise((resolve, reject) => {
      renderErrorRef.current = null;
      setExportProps({ ...props, __key: key });

      void (async () => {
        try {
          const started = Date.now();
          let node: HTMLElement | null = null;
          // React commits asynchronously; poll for the node belonging to THIS request
          // rather than assuming a fixed number of frames is enough.
          while (Date.now() - started < 8000) {
            if (renderErrorRef.current) throw renderErrorRef.current;
            node = hostEl?.querySelector(
              `[data-export-id="${key}"] [data-print-root]`
            ) as HTMLElement | null;
            if (node) break;
            await new Promise((r) => requestAnimationFrame(() => r(null)));
          }

          if (node) {
            // MIR forms embed delivery notes rendered by pdf.js, which rasterises each
            // page asynchronously. Capturing before it finishes prints "Loading PDF
            // pages..." instead of the note, so wait for every viewer to settle first.
            const pdfDeadline = Date.now() + 60000;
            while (Date.now() < pdfDeadline) {
              const pending = node.querySelectorAll('[data-pdf-loading="1"]').length;
              if (pending === 0) break;
              setCurrentName(`${props.requestNumber} — تحميل مذكرات التسليم...`);
              await new Promise((r) => setTimeout(r, 200));
            }

            // Logos and signatures are <img>; capturing before they decode yields blanks.
            const images = Array.from(node.querySelectorAll("img"));
            await Promise.all(
              images.map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise<void>((done) => {
                      img.addEventListener("load", () => done(), { once: true });
                      img.addEventListener("error", () => done(), { once: true });
                      setTimeout(done, 3000);
                    })
              )
            );
          }
          resolve(node);
        } catch (e) {
          reject(e);
        }
      })();
    });

  const runExport = async () => {
    cancelRef.current = false;
    setRunning(true);
    setDone(0);

    try {
      const [{ default: JSZip }, html2pdfMod] = await Promise.all([
        import("jszip"),
        import("html2pdf.js"),
      ]);
      const html2pdf: any = (html2pdfMod as any).default ?? html2pdfMod;

      const res = await apiRequest(
        "GET",
        `/api/projects/${projectId}/request-forms/export-data?${params.toString()}&limit=${BATCH_LIMIT}`
      );
      const data = await res.json();

      const requests: any[] = data.requests ?? [];
      setTotal(requests.length);
      if (requests.length === 0) {
        toast({ title: "لا توجد طلبات مطابقة", variant: "destructive" });
        setRunning(false);
        return;
      }

      const by = <T extends { revisionId?: string }>(rows: T[], revId: string) =>
        rows.filter((r) => r.revisionId === revId);

      // Signatures and names are printed on the form, so resolve them from the batch.
      const usersById = new Map<string, any>((data.users ?? []).map((u: any) => [u.id, u]));
      const userName = (id: string) => {
        const u = usersById.get(id);
        return u ? u.fullName || u.username || "" : "";
      };
      const userSig = (id: string) => usersById.get(id)?.signature || "";
      const userPos = (id: string) => usersById.get(id)?.position || "";

      // Activity → chapter → division, printed on the header's activity code line.
      const activityById = new Map<string, any>((data.workListActivities ?? []).map((a: any) => [a.id, a]));
      const chapterById = new Map<string, any>((data.workListChapters ?? []).map((c: any) => [c.id, c]));
      const divisionById = new Map<string, any>((data.workListDivisions ?? []).map((d: any) => [d.id, d]));
      // Mirrors request-detail.tsx: most revisions carry activityCode/activityName and
      // divisionName denormalised, and only some link through workListActivityId. Using
      // only the id would print a bare "MIR" instead of "MIR 8.31 ( … )".
      const activityChain = (revision: any) => {
        const linked = revision.workListActivityId ? activityById.get(revision.workListActivityId) : null;
        const chapter = linked ? chapterById.get(linked.chapterId) : null;
        const linkedDivision = chapter ? divisionById.get(chapter.divisionId) : null;

        const activity =
          linked ??
          (revision.activityName || revision.activityCode
            ? { code: revision.activityCode || undefined, nameEnglish: revision.activityName || undefined }
            : null);
        const division =
          linkedDivision ??
          (revision.divisionName ? { nameEnglish: revision.divisionName } : null);

        return { activity, division };
      };

      const zip = new JSZip();
      let exported = 0;

      for (const request of requests) {
        if (cancelRef.current) break;
        const revision = (data.revisions ?? []).find((r: any) => r.requestId === request.id);
        if (!revision) continue;

        setCurrentName(request.requestNumber);

        const node = await renderFormNode({
          requestNumber: request.requestNumber,
          referenceCode: request.referenceCode,
          requestTypeCode: typeCode,
          project: data.project,
          developer: data.developer,
          contractor: data.contractor,
          consultant: data.consultant,
          projectName: data.project?.name,
          contractorName: data.contractor?.name,
          consultantName: data.consultant?.name,
          checklistItems: data.checklistItems ?? [],
          currentRevision: revision,
          statusHistory: by(data.statusHistory ?? [], revision.id),
          revisionDocuments: by(data.documents ?? [], revision.id),
          revisionAttachments: by(data.attachments ?? [], revision.id),
          revisionLocations: by(data.locations ?? [], revision.id),
          checklistResponses: by(data.checklistResponses ?? [], revision.id),
          revisionPurposes: by(data.purposes ?? [], revision.id),
          consultantReviews: by(data.consultantReviews ?? [], revision.id),
          revisionMaterials: by(data.materials ?? [], revision.id),
          revisionSuppliers: by(data.suppliers ?? [], revision.id),
          revisionDeliveries: by(data.deliveries ?? [], revision.id),
          createdAt: request.createdAt,
          workListActivity: activityChain(revision).activity,
          division: activityChain(revision).division,
          getUserName: (id: string) => userName(id),
          getUserPosition: (id: string) => userPos(id),
          getUserSignature: (id: string) => userSig(id),
          onOpenChange: () => {},
        }, request.id);

        if (!node) {
          throw new Error(`تعذّر رسم نموذج ${request.requestNumber} خلال المهلة المحددة`);
        }

        // Captured as a standalone HTML string so html2canvas renders it in its own
        // iframe with the print rules applied. Passing the live node instead would use
        // the on-screen styles — the @media print block never matches during capture,
        // which is why the first exports came out laid out differently from Print.
        const html = `<style>${PRINT_STYLES_FOR_CAPTURE}</style>${node.outerHTML}`;

        const blob = await html2pdf()
          .set({
            margin: [5, 8, 5, 8],
            filename: `${request.requestNumber}.pdf`,
            image: { type: "jpeg", quality: 0.95 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: "#ffffff",
              windowWidth: 794,
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["css", "legacy"], before: ".page-break-before" },
          })
          .from(html, "string")
          .outputPdf("blob");

        zip.file(`${request.requestNumber}.pdf`, blob);
        exported += 1;
        setDone(exported);
      }

      if (cancelRef.current) {
        toast({ title: "أُلغي التصدير", description: `تم إنشاء ${exported} ملفًا قبل الإلغاء.` });
        setRunning(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${typeCode}-Forms-${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "اكتمل التصدير",
        description: `${exported} ملف PDF داخل ملف مضغوط واحد.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      // Log the full error: the toast is truncated, and a render crash inside the form
      // needs its stack to be diagnosable.
      console.error("[request-forms-export] failed:", e);
      toast({
        title: "تعذّر التصدير",
        description: `${e?.message || "حدث خطأ"} — التفاصيل في وحدة التحكم (F12)`,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setCurrentName("");
      // Unmount the offscreen form so a finished or failed export leaves nothing rendered.
      setExportProps(null);
    }
  };

  const slow = willExport >= SLOW_THRESHOLD;

  return (
    <>
      {/* Lives inside this component's tree, so the form inherits the query client,
          auth and theme providers it depends on. */}
      {hostEl &&
        exportProps &&
        createPortal(
          <div data-export-id={exportProps.__key}>
            <ExportErrorBoundary
              key={exportProps.__key}
              onError={(e) => (renderErrorRef.current = e)}
            >
              <WirFormDialog {...exportProps} open={false} renderInline />
            </ExportErrorBoundary>
          </div>,
          hostEl
        )}

    <Dialog open={open} onOpenChange={(o) => (running ? null : onOpenChange(o))}>
      <DialogContent dir="rtl" className="max-w-xl rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <FileDown className="w-5 h-5 text-primary" />
            تصدير نماذج الطلبات
          </DialogTitle>
          <DialogDescription className="text-xs">
            ملف PDF منفصل لكل طلب، داخل ملف مضغوط واحد
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="space-y-3 py-2">
            <Progress value={total ? (done / total) * 100 : 0} className="h-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {currentName || "جارٍ التحضير..."}
              </span>
              <span className="font-black">
                {done} / {total}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              لا تغلق التبويب. التحميل يبدأ تلقائيًا عند الانتهاء.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">نوع الطلب</Label>
              <Select value={typeCode} onValueChange={setTypeCode}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {requestTypes.map((t) => (
                    <SelectItem key={t.id} value={t.code}>
                      {t.code} — {t.nameEnglish || t.name || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">من تاريخ</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">إلى تاريخ</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl" />
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold">الطلبات المطابقة</span>
              <Badge variant="secondary" className="rounded-full font-black">
                {counting ? "..." : matching}
              </Badge>
            </div>

            {matching > BATCH_LIMIT && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  سيُصدَّر <span className="font-black">{BATCH_LIMIT}</span> طلبًا فقط من أصل{" "}
                  <span className="font-black">{matching}</span>. ضيّق النطاق بالتاريخ لتصدير الباقي
                  على دفعات — المتصفح لا يحتمل أكثر من ذلك دفعة واحدة.
                </p>
              </div>
            )}

            {slow && matching <= BATCH_LIMIT && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {willExport} نموذجًا قد يستغرق عدة دقائق. أبقِ التبويب مفتوحًا حتى ينتهي.
                </p>
              </div>
            )}

            {matching === 0 && !counting && (
              <p className="text-xs text-muted-foreground text-center py-2">
                لا توجد طلبات مطابقة لهذا النطاق.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="rounded-xl font-bold"
            >
              إلغاء
            </Button>
          ) : (
            <>
              <Button
                onClick={runExport}
                disabled={matching === 0 || counting}
                className="rounded-xl font-bold gap-2"
              >
                <FileDown className="w-4 h-4" />
                تصدير {willExport > 0 ? `${willExport} نموذجًا` : ""}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
                إغلاق
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
