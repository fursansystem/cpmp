import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, FileText, ExternalLink, Phone, Mail, DollarSign } from "lucide-react";

interface QuotationDetailsDialogProps {
  quotationId: string | null;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABELS: Record<string, string> = {
  accepted: "Accepted / Winner",
  rejected: "Rejected",
  under_review: "Under Review",
  pending: "Under Review",
};

const fmt = (v: any) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuotationDetailsDialog({ quotationId, onOpenChange }: QuotationDetailsDialogProps) {
  const { data: quote, isLoading } = useQuery<any>({
    queryKey: ["/api/quotations", quotationId],
    enabled: !!quotationId,
  });

  const docUrl = quote?.document?.fileUrl || quote?.document?.fileData;
  const currency = quote?.currency || "SAR";

  return (
    <Dialog open={!!quotationId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-600" />
            Quotation Details {quote?.quotationNumber ? `(${quote.quotationNumber})` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !quote ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
            {/* Supplier */}
            <div className="flex items-start justify-between gap-4 border rounded-xl p-4 bg-muted/20">
              <div className="space-y-1">
                <p className="font-bold text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  {quote.supplierName}
                </p>
                {quote.contactPerson && <p className="text-xs text-muted-foreground">{quote.contactPerson}</p>}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {quote.phone && (
                    <span className="flex items-center gap-1" dir="ltr">
                      <Phone className="w-3 h-3" />
                      {quote.phone}
                    </span>
                  )}
                  {quote.email && (
                    <span className="flex items-center gap-1" dir="ltr">
                      <Mail className="w-3 h-3" />
                      {quote.email}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="text-[11px] font-bold">
                {STATUS_LABELS[quote.status] || quote.status}
              </Badge>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <Info label="RFQ" value={[quote.rfqNumber, quote.rfqTitle].filter(Boolean).join(" - ")} />
              <Info label="Submission Date" value={quote.submissionDate} />
              <Info label="Valid Until" value={quote.validUntil} />
              <Info label="Lead Time" value={quote.leadTimeDays ? `${quote.leadTimeDays} days` : null} />
              <Info label="Payment Terms" value={quote.paymentTerms} />
              <Info label="Delivery Terms" value={quote.deliveryTerms} />
            </div>

            {/* Items */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b font-bold">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Unit Price</th>
                    <th className="p-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(quote.items || []).map((it: any, idx: number) => (
                    <tr key={it.id}>
                      <td className="p-3 text-muted-foreground">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold">{it.rfqItemName || it.rfqItemDescription || it.itemDescription}</div>
                        {it.rfqItemName && it.rfqItemDescription && (
                          <div className="text-[11px] text-muted-foreground">{it.rfqItemDescription}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-bold">{Number(it.quantity)}</span> {it.unit}
                      </td>
                      <td className="p-3">{fmt(it.unitPrice)}</td>
                      <td className="p-3 font-bold text-emerald-600">{fmt(it.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="ml-auto max-w-xs space-y-1 text-xs">
              <Row label="Subtotal" value={`${fmt(quote.subtotal)} ${currency}`} />
              {Number(quote.discountAmount) > 0 && (
                <Row label="Discount" value={`-${fmt(quote.discountAmount)} ${currency}`} />
              )}
              <Row label="VAT" value={`+${fmt(quote.taxAmount)} ${currency}`} />
              <div className="flex justify-between font-bold text-base border-t pt-1">
                <span>Grand Total</span>
                <span>
                  {fmt(quote.totalAmount)} {currency}
                </span>
              </div>
            </div>

            {quote.notes && (
              <div className="text-xs border rounded-xl p-3 bg-muted/20">
                <p className="font-bold mb-1">Notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
              </div>
            )}

            {/* Document */}
            <div className="flex items-center justify-between gap-3 border rounded-xl p-3">
              <span className="flex items-center gap-2 text-xs font-bold min-w-0">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">
                  {quote.document ? quote.document.fileName || quote.document.name : "No attached document"}
                </span>
              </span>
              {docUrl && (
                <Button asChild variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs font-bold">
                  <a href={docUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Document
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border rounded-lg p-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold">{value || "-"}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
