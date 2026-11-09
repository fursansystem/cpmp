import { PoPaymentsPanel } from "@/components/payments/payment-actions";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Printer,
  Package,
  Truck,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
  FileSignature,
  Paperclip,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PoDetailsPrintDialog } from "@/components/procurement/po-details-print-dialog";
import { ReceivePoDialog } from "@/components/procurement/receive-po-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const STATUS_STEPS = [
  { key: "draft", labelKey: "po_status.draft" as const },
  { key: "approved", labelKey: "po_status.approved" as const },
  { key: "partially_received", labelKey: "po_status.partially_received" as const },
  { key: "completed", labelKey: "po_status.completed" as const },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  issued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-destructive/10 text-destructive",
};

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProjectPurchaseOrderDetail() {
  const { t } = useTranslation(["procurement", "common"]);
  const { projectId, poId } = useParams<{ projectId: string; poId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [printOpen, setPrintOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data: po, isLoading } = useQuery<any>({
    queryKey: ["/api/purchase-orders", poId],
    enabled: !!poId,
  });

  const approveMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/purchase-orders/${poId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "purchase-orders"] });
      setApproveOpen(false);
      toast({ title: t("detail.toasts.approve_success_title"), description: t("detail.toasts.approve_success_desc") });
    },
    onError: (e: any) => {
      setApproveOpen(false);
      toast({ title: t("detail.toasts.approve_error_title"), description: e?.message || t("detail.toasts.error_generic"), variant: "destructive" });
    },
  });

  const items: any[] = po?.items ?? [];
  const receipts: any[] = po?.receipts ?? [];

  const totals = useMemo(() => {
    const ordered = items.reduce((s, i) => s + Number(i.orderedQuantity ?? 0), 0);
    const received = items.reduce((s, i) => s + Number(i.receivedQuantity ?? 0), 0);
    return {
      ordered,
      received,
      remaining: Math.max(ordered - received, 0),
      percent: ordered > 0 ? Math.min((received / ordered) * 100, 100) : 0,
      hasOverReceipt: items.some((i) => i.isOverReceived),
      unlinkedLines: items.filter((i) => !i.materialId).length,
    };
  }, [items]);

  if (isLoading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 pt-4 pb-10 space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">{t("detail.not_found")}</p>
        <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/purchase-orders`)}>
          {t("detail.back_to_pos")}
        </Button>
      </div>
    );
  }

  const activeStep = STATUS_STEPS.findIndex((s) =>
    po.status === "issued" ? s.key === "approved" : s.key === po.status
  );

  return (
    <div className="min-h-screen px-4 lg:px-10 pt-4 pb-12 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/purchase-orders?tab=purchase_orders`)}
            className="rounded-xl gap-1.5 shrink-0"
          >
            <ArrowRight className="w-4 h-4 ltr:rotate-180" />
            {t("detail.back")}
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-black truncate">{po.poNumber}</h1>
              <Badge className={cn("rounded-full font-bold border-none", STATUS_STYLES[po.status])}>
                {t(`po_status.${po.status}` as any, { defaultValue: po.status })}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{po.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPrintOpen(true)} className="rounded-xl gap-1.5">
            <Printer className="w-4 h-4" />
            {t("detail.print")}
          </Button>
          {po.status === "draft" && (
            <Button onClick={() => setApproveOpen(true)} className="rounded-xl gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {t("detail.approve_btn")}
            </Button>
          )}
          {/* Hidden once every line is fully received: a completed order has nothing left
              to receive, and a primary action there is just noise. */}
          {po.isReceivable && !po.fullyReceived && (
            <Button onClick={() => setReceiveOpen(true)} className="rounded-xl gap-1.5 font-bold">
              <Warehouse className="w-4 h-4" />
              {t("detail.receive_btn")}
            </Button>
          )}
        </div>
      </div>

      {/* Status stepper */}
      <Card className="rounded-2xl border-border/60">
        <CardContent className="py-5">
          <div className="flex items-center">
            {STATUS_STEPS.map((step, idx) => {
              const done = activeStep >= 0 && idx <= activeStep;
              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors",
                        done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {done ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-bold whitespace-nowrap",
                        done ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {t(step.labelKey as any)}
                    </span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1 mx-2 mb-5 rounded-full",
                        activeStep > idx ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {po.status === "draft" && (
            <p className="mt-4 text-xs text-muted-foreground flex items-center gap-2 justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {t("detail.cannot_receive_before_approval")}
            </p>
          )}
          {po.approvedAt && (
            <p className="mt-4 text-xs text-muted-foreground text-center">
              {t("detail.approved_by", { name: po.approverName || "—" })}
              {" · "}
              {new Date(po.approvedAt).toLocaleDateString("en-GB")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              {t("detail.supplier")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-black text-sm">{po.supplierName}</p>
            {po.supplierContactPerson && (
              <p className="text-xs text-muted-foreground">{po.supplierContactPerson}</p>
            )}
            {po.supplierPhone && <p className="text-xs text-muted-foreground" dir="ltr">{po.supplierPhone}</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              {t("detail.dates")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("detail.order_date")}</span>
              <span className="font-bold">{po.orderDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("detail.expected_delivery")}</span>
              <span className="font-bold">{po.expectedDeliveryDate || "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Package className="w-3.5 h-3.5" />
              {t("detail.receipt_rate")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={totals.percent} className="h-2" />
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("detail.percent_received", { percent: totals.percent.toFixed(0) })}</span>
              <span className="font-bold">
                {num(totals.received)} / {num(totals.ordered)}
              </span>
            </div>
            <div className="flex justify-between font-black text-sm text-primary pt-1 border-t border-border/40">
              <span>{t("detail.total")}</span>
              <span>{num(po.totalAmount)} SAR</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Procurement trail: RFQ → supplier quotation → this order */}
      {(po.quotation || po.rfqNumber) && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <FileSignature className="w-4 h-4" />
              {t("detail.supplier_quote")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {po.rfqNumber && (
                <Badge variant="secondary" className="rounded-full font-bold">
                  {t("detail.rfq_label", { number: po.rfqNumber })}
                </Badge>
              )}
              {po.quotation?.quotationNumber && (
                <Badge variant="secondary" className="rounded-full font-bold">
                  {t("detail.quote_label", { number: po.quotation.quotationNumber })}
                </Badge>
              )}
              {po.quotation?.submissionDate && (
                <span className="text-muted-foreground">{t("detail.quote_date", { date: po.quotation.submissionDate })}</span>
              )}
              {po.quotation?.validUntil && (
                <span className="text-muted-foreground">{t("detail.valid_until", { date: po.quotation.validUntil })}</span>
              )}
              {po.quotation?.leadTimeDays != null && (
                <span className="text-muted-foreground">{t("detail.lead_time", { days: po.quotation.leadTimeDays })}</span>
              )}
            </div>

            {po.quotation?.document ? (
              <a
                href={po.quotation.document.fileUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border/60 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Paperclip className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black truncate">
                    {po.quotation.document.name || po.quotation.document.fileName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {po.quotation.document.type} · {po.quotation.document.size}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-primary shrink-0">{t("detail.open_doc")}</span>
              </a>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  {t("detail.no_quote_doc")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {totals.unlinkedLines > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-black">{t("detail.unlinked_warning", { count: totals.unlinkedLines })}</span>
          </p>
        </div>
      )}

      {/* Items */}
      <Card className="rounded-2xl border-border/60 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t("detail.items_title", { count: items.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-end text-[11px] font-black">#</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.material")}</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.unit")}</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.ordered")}</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.received")}</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.remaining")}</TableHead>
                  <TableHead className="text-end text-[11px] font-black">{t("detail.items_table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-bold text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex flex-col">
                        <span className="font-bold text-xs">
                          {item.materialName || item.itemName || item.itemDescription}
                        </span>
                        {item.itemDescription && item.materialName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[280px]">
                            {item.itemDescription}
                          </span>
                        )}
                        {!item.materialId && (
                          <span className="text-[10px] font-bold text-amber-600">{t("detail.items_table.unlinked_badge")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{item.unit}</TableCell>
                    <TableCell className="text-xs font-bold">{num(item.orderedQuantity)}</TableCell>
                    <TableCell className="text-xs font-bold text-emerald-600">
                      {num(item.receivedQuantity)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs font-black",
                        item.remainingQuantity > 0 ? "text-amber-600" : "text-muted-foreground"
                      )}
                    >
                      {num(Math.max(item.remainingQuantity, 0))}
                    </TableCell>
                    <TableCell>
                      {item.isOverReceived ? (
                        <Badge className="rounded-full border-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold">
                          {t("detail.item_status.over")}
                        </Badge>
                      ) : item.isFullyReceived ? (
                        <Badge className="rounded-full border-none bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px] font-bold">
                          {t("detail.item_status.completed")}
                        </Badge>
                      ) : item.receivedQuantity > 0 ? (
                        <Badge className="rounded-full border-none bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-bold">
                          {t("detail.item_status.partial")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-full text-[10px] font-bold">
                          {t("detail.item_status.unreceived")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Receipts */}
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Truck className="w-4 h-4" />
            {t("detail.receipts_title", { count: receipts.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 flex flex-col items-center gap-2">
              <Truck className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground font-bold">{t("detail.receipts_empty")}</p>
              {!po.isReceivable && (
                <p className="text-[11px] text-muted-foreground">{t("detail.must_approve_first")}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r) => (
                <div key={r.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="rounded-full border-none bg-primary/10 text-primary text-[11px] font-black">
                        {r.shipmentNumber}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{r.arrivalDate}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {r.warehouseName && (
                        <span className="flex items-center gap-1">
                          <Warehouse className="w-3 h-3" />
                          {r.warehouseName}
                        </span>
                      )}
                      {r.deliveryInvoiceNumber && <span>{t("detail.invoice_label", { number: r.deliveryInvoiceNumber })}</span>}
                      {r.noteDocument ? (
                        <a
                          href={r.noteDocument.fileUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-bold text-primary hover:underline"
                        >
                          <Paperclip className="w-3 h-3" />
                          {t("detail.delivery_note")}
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 opacity-60">
                          <Paperclip className="w-3 h-3" />
                          {t("detail.no_delivery_note")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(r.items ?? []).map((li: any) => (
                      <span
                        key={li.id}
                        className="text-[11px] bg-muted/50 rounded-lg px-2 py-1 font-medium"
                      >
                        {li.materialName}: <span className="font-black">{num(li.arrivalQuantity)}</span> {li.unit}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PoPaymentsPanel projectId={projectId || ""} poId={po.id} poNumber={po.poNumber} supplierId={po.supplierId} supplierName={po.supplierName} />

      <PoDetailsPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        poId={poId || null}
        projectId={projectId || ""}
      />

      <ReceivePoDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        projectId={projectId || ""}
        po={po}
      />

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detail.approve_dialog.title", { poNumber: po.poNumber })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("detail.approve_dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.approve_dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                approveMutation.mutate();
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? t("detail.approve_dialog.submitting") : t("detail.approve_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
