import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Award, Plus, Calendar, User, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { QuotationFormDialog } from "@/components/procurement/quotation-form-dialog";
import { QuotationDetailsDialog } from "@/components/procurement/quotation-details-dialog";
import { RfqAwardMatrix, type OrderedItem } from "@/components/procurement/rfq-award-matrix";

const STATUS_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "evaluating", label: "Evaluating" },
  { key: "awarded", label: "Awarded" },
];

const SUPPLIER_STATUS: Record<string, string> = {
  invited: "Invited",
  submitted: "Quoted",
  declined: "Declined",
};

export default function ProjectRfqDetail() {
  const { projectId, rfqId } = useParams<{ projectId: string; rfqId: string }>();
  const [, navigate] = useLocation();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [viewQuotationId, setViewQuotationId] = useState<string | null>(null);
  const [quoteSupplierId, setQuoteSupplierId] = useState<string | undefined>();
  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("tab") || "items";
    } catch {
      return "items";
    }
  });
  const [onlyWithoutPo, setOnlyWithoutPo] = useState(false);

  const { data: rfq, isLoading } = useQuery<any>({
    queryKey: ["/api/rfqs", rfqId],
    enabled: !!rfqId,
  });
  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/rfqs", rfqId, "quotations"],
    enabled: !!rfqId,
  });

  const { data: orderedItems = [] } = useQuery<OrderedItem[]>({
    queryKey: ["/api/rfqs", rfqId, "ordered-items"],
    enabled: !!rfqId,
  });
  const orderedMap = useMemo(() => {
    const m = new Map<string, OrderedItem>();
    orderedItems.forEach((o) => m.set(o.rfqItemId, o));
    return m;
  }, [orderedItems]);

  if (isLoading || !rfq) {
    return (
      <div className="p-6 space-y-4" dir="ltr">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const currentStep = Math.max(0, STATUS_STEPS.findIndex((s) => s.key === rfq.status));
  const overdue =
    rfq.dueDate && rfq.status !== "awarded" && new Date(rfq.dueDate) < new Date(new Date().toDateString());
  const totalItems = rfq.items?.length || 0;
  const orderedCount = (rfq.items || []).filter((i: any) => orderedMap.has(i.id)).length;
  const itemStatus = (itemId: string) => {
    const o = orderedMap.get(itemId);
    if (o) return { label: `PO ${o.poNumber}`, sub: o.supplierName, cls: "bg-emerald-100 text-emerald-700" };
    const hasQuote = quotations.some((q) =>
      q.items?.some((qi: any) => qi.rfqItemId === itemId && Number(qi.unitPrice) > 0)
    );
    return hasQuote
      ? { label: "Quoted - awaiting award", sub: "", cls: "bg-amber-100 text-amber-700" }
      : { label: "No quotes", sub: "", cls: "bg-red-100 text-red-700" };
  };
  const lowestTotal = quotations.length ? Math.min(...quotations.map((q) => Number(q.totalAmount))) : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto" dir="ltr">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/projects/${projectId}/purchase-orders?tab=rfqs`)}
        className="gap-1.5 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Back to RFQs
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">{rfq.rfqNumber}</span>
            <Badge variant="secondary" className="text-xs font-bold">
              {STATUS_STEPS[currentStep].label}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold">{rfq.title}</h1>
          {rfq.description && <p className="text-sm text-muted-foreground max-w-2xl">{rfq.description}</p>}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {rfq.creatorName || "System"}
            </span>
            {rfq.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {new Date(rfq.createdAt).toLocaleDateString("en-GB")}
              </span>
            )}
            {rfq.dueDate && (
              <span className={cn("flex items-center gap-1", overdue && "text-red-600 font-bold")}>
                <Calendar className="w-3.5 h-3.5" /> Due {rfq.dueDate}
                {overdue && " (overdue)"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setQuoteSupplierId(undefined);
              setQuoteOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Quotation
          </Button>
          <Button onClick={() => setTab("award")} disabled={quotations.length === 0} className="gap-1.5">
            <Award className="w-4 h-4" /> Compare & Award ({quotations.length})
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 p-3 border rounded-2xl bg-card overflow-x-auto">
        {STATUS_STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2 flex-1 min-w-[110px]">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                i < currentStep || rfq.status === "awarded"
                  ? "bg-emerald-500 text-white"
                  : i === currentStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i < currentStep || rfq.status === "awarded" ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs font-medium", i === currentStep ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
            {i < STATUS_STEPS.length - 1 && <div className="h-px bg-border flex-1" />}
          </div>
        ))}
      </div>

      {totalItems > 0 && (
        <div className="p-3 border rounded-2xl bg-card space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span>Purchase order coverage</span>
            <span className={cn(orderedCount < totalItems && "text-amber-700")}>
              {orderedCount} of {totalItems} items have a PO
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(orderedCount / totalItems) * 100}%` }} />
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Items ({rfq.items?.length || 0})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({rfq.suppliers?.length || 0})</TabsTrigger>
          <TabsTrigger value="quotes">Quotations ({quotations.length})</TabsTrigger>
          <TabsTrigger value="award">Compare & Award</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer w-fit">
            <input type="checkbox" checked={onlyWithoutPo} onChange={(e) => setOnlyWithoutPo(e.target.checked)} />
            Show only items without a purchase order
          </label>
          <div className="border rounded-2xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rfq.items || []).map((it: any, idx: number) => ({ it, idx })).filter(({ it }: any) => !onlyWithoutPo || !orderedMap.has(it.id)).map(({ it, idx }: any) => (
                  <TableRow key={it.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{it.itemName || it.itemDescription || it.materialName}</div>
                      {it.itemName && it.itemDescription && (
                        <div className="text-xs text-muted-foreground">{it.itemDescription}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{Number(it.quantity)}</TableCell>
                    <TableCell>{it.unit}</TableCell>
                    <TableCell className="text-muted-foreground">{it.notes || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-[11px]", itemStatus(it.id).cls)}>
                        {itemStatus(it.id).label}
                      </Badge>
                      {itemStatus(it.id).sub && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{itemStatus(it.id).sub}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="award">
          <RfqAwardMatrix
            rfq={rfq}
            quotations={quotations}
            orderedItems={orderedItems}
            projectId={projectId || ""}
            onCreated={() => navigate(`/projects/${projectId}/purchase-orders?tab=purchase_orders`)}
          />
        </TabsContent>

        <TabsContent value="suppliers">
          <div className="border rounded-2xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rfq.suppliers || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No suppliers were invited to this RFQ
                    </TableCell>
                  </TableRow>
                ) : (
                  rfq.suppliers.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.supplierName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[s.contactPerson, s.phone, s.email].filter(Boolean).join(" • ") || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {SUPPLIER_STATUS[s.status] || s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status !== "submitted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setQuoteSupplierId(s.supplierId);
                              setQuoteOpen(true);
                            }}
                          >
                            Enter quote
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="quotes">
          <div className="border rounded-2xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Quote No.</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No quotations received yet
                    </TableCell>
                  </TableRow>
                ) : (
                  quotations.map((q: any) => (
                    <TableRow key={q.id} className="cursor-pointer" onClick={() => setViewQuotationId(q.id)}>
                      <TableCell className="font-medium">{q.supplierName}</TableCell>
                      <TableCell className="font-mono text-xs">{q.quotationNumber || "-"}</TableCell>
                      <TableCell className="text-xs">{q.submissionDate}</TableCell>
                      <TableCell className="text-xs">{q.leadTimeDays ? `${q.leadTimeDays} days` : "-"}</TableCell>
                      <TableCell className="font-mono font-bold">
                        {Number(q.totalAmount).toLocaleString()} {q.currency}
                        {Number(q.totalAmount) === lowestTotal && quotations.length > 1 && (
                          <Badge className="ml-2 text-[10px] bg-emerald-100 text-emerald-700" variant="secondary">
                            Lowest
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {String(q.status).replace("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <QuotationDetailsDialog quotationId={viewQuotationId} onOpenChange={(o) => !o && setViewQuotationId(null)} />
      <QuotationFormDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        projectId={projectId || ""}
        rfqId={rfqId}
        supplierId={quoteSupplierId}
      />

    </div>
  );
}
