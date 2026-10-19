import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, FileText, Calendar, Building2, Percent, CheckCircle2, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ProjectStorageModal } from "@/components/ProjectStorageModal";
import type { Supplier, Document } from "@shared/schema";

interface QuotationItemInput {
  rfqItemId?: string;
  materialId?: string;
  itemName?: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  totalPrice: number;
  notes?: string;
}

interface QuotationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  rfqId?: string; // Pre-selected RFQ
  supplierId?: string; // Pre-selected Supplier
}

export function QuotationFormDialog({
  open,
  onOpenChange,
  projectId,
  rfqId: initialRfqId,
  supplierId: initialSupplierId,
}: QuotationFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRfqId, setSelectedRfqId] = useState<string>(initialRfqId || "");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(initialSupplierId || "");
  const [quotationNumber, setQuotationNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 days from receipt and inspection");
  const [deliveryTerms, setDeliveryTerms] = useState("Delivery to project site");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [taxRate, setTaxRate] = useState("15"); // 15% VAT default
  const [discountAmount, setDiscountAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [attachedDoc, setAttachedDoc] = useState<Document | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);

  const [quoteItems, setQuoteItems] = useState<QuotationItemInput[]>([]);

  // Fetch RFQs for project
  const { data: rfqs = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "rfqs"],
    enabled: open && !!projectId,
  });

  // Fetch specific RFQ details to get its items
  const { data: currentRfq } = useQuery<any>({
    queryKey: ["/api/rfqs", selectedRfqId],
    enabled: open && !!selectedRfqId,
  });

  // Fetch Suppliers for project
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: open && !!projectId,
  });

  useEffect(() => {
    if (initialRfqId) setSelectedRfqId(initialRfqId);
    if (initialSupplierId) setSelectedSupplierId(initialSupplierId);
  }, [initialRfqId, initialSupplierId, open]);

  // When RFQ changes or is loaded, initialize quote items
  useEffect(() => {
    if (currentRfq && Array.isArray(currentRfq.items)) {
      setQuoteItems(
        currentRfq.items.map((item: any) => ({
          rfqItemId: item.id,
          materialId: item.materialId || undefined,
          itemName: item.itemName || "",
          itemDescription: item.itemDescription,
          quantity: Number(item.quantity) || 1,
          unit: item.unit || "pcs",
          unitPrice: "0",
          totalPrice: 0,
          notes: "",
        }))
      );
    }
  }, [currentRfq]);

  const handlePriceChange = (index: number, priceStr: string) => {
    const price = parseFloat(priceStr) || 0;
    setQuoteItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        unitPrice: priceStr,
        totalPrice: price * updated[index].quantity,
      };
      return updated;
    });
  };

  // Calculations
  const subtotal = quoteItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const discount = parseFloat(discountAmount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = taxableAmount * ((parseFloat(taxRate) || 0) / 100);
  const grandTotal = taxableAmount + tax;

  const createQuotationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRfqId) throw new Error("Please select an RFQ");
      if (!selectedSupplierId) throw new Error("Please select a supplier");
      if (quoteItems.length === 0) throw new Error("The RFQ has no items");
      if (!attachedDoc?.id) {
        throw new Error("مستند عرض المورد مطلوب. أرفق ملف العرض قبل الحفظ.");
      }

      const payload = {
        rfqId: selectedRfqId,
        supplierId: selectedSupplierId,
        quotationNumber: quotationNumber || `QUOT-${Date.now().toString().slice(-4)}`,
        submissionDate: new Date().toISOString().split("T")[0],
        validUntil: validUntil || null,
        subtotal: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        discountAmount: discount.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        paymentTerms,
        deliveryTerms,
        leadTimeDays: parseInt(leadTimeDays) || null,
        notes: notes || null,
        documentId: attachedDoc.id,
        items: quoteItems.map((i) => ({
          rfqItemId: i.rfqItemId,
          materialId: i.materialId,
          itemDescription: [i.itemName, i.itemDescription].filter(Boolean).join(" - "),
          quantity: i.quantity.toString(),
          unit: i.unit || "pcs",
          unitPrice: (parseFloat(i.unitPrice) || 0).toFixed(2),
          totalPrice: (i.totalPrice || 0).toFixed(2),
          notes: i.notes || null,
        })),
      };

      const res = await apiRequest("POST", `/api/rfqs/${selectedRfqId}/quotations`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", selectedRfqId, "quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      toast({
        title: "Saved successfully",
        description: "Supplier quotation recorded successfully",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to record quotation",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-600" />
            Record Supplier Quotation / Bid
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Select RFQ */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">
                Linked RFQ <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedRfqId} onValueChange={setSelectedRfqId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select RFQ..." />
                </SelectTrigger>
                <SelectContent>
                  {rfqs.map((rfq) => (
                    <SelectItem key={rfq.id} value={rfq.id}>
                      {rfq.rfqNumber} - {rfq.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Select Supplier */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">
                Quoting Supplier <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-1.5">
                        {s.supplierName}
                        {(s as any).isApproved && (
  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0" />
)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quotation Number */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">Supplier Quotation No.</Label>
              <Input
                placeholder="e.g. QT-2026-9812"
                value={quotationNumber}
                onChange={(e) => setQuotationNumber(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Valid Until */}
            <div className="space-y-2">
              <Label className="font-bold text-sm flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Valid Until
              </Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Terms */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">Payment Terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-sm">Delivery Terms</Label>
              <Input
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-sm">Lead Time (days)</Label>
              <Input
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {/* Supplier Quotation Document */}
          <div className="space-y-2">
            <Label className="font-bold text-sm flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              Supplier Quotation Document (Attachment)
              <span className="text-destructive">*</span>
              {!attachedDoc && (
                <span className="text-[11px] font-normal text-destructive">— مطلوب</span>
              )}
            </Label>
            {attachedDoc ? (
              <div className="flex items-center justify-between gap-3 border rounded-xl p-3 bg-slate-50 dark:bg-slate-900/40">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate text-xs font-bold">
                    {(attachedDoc as any).fileName || attachedDoc.name}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={() => setAttachedDoc(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStorageOpen(true)}
                className="w-full h-11 rounded-xl border-dashed gap-2 text-xs font-bold"
              >
                <Paperclip className="w-4 h-4" />
                Attach a document from project files
              </Button>
            )}
          </div>

          {/* Pricing Items Table */}
          <div className="space-y-3 pt-2">
            <Label className="font-bold text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              Item Pricing
            </Label>

            {quoteItems.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-xl text-muted-foreground text-xs">
                Select an RFQ first to load the requested items.
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 border-b font-bold text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Item Description & Specification</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3 w-32">Unit Price (SAR)</th>
                      <th className="p-3 w-32">Total (SAR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {quoteItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="p-3 font-semibold text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-bold">{item.itemName || item.itemDescription}</div>
                          {item.itemName && item.itemDescription && (
                            <div className="text-[11px] text-muted-foreground font-normal">{item.itemDescription}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="font-bold">{item.quantity}</span> {item.unit}
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) => handlePriceChange(idx, e.target.value)}
                            className="h-8 rounded-lg text-xs font-bold text-left bg-slate-50 dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                          {item.totalPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Financial Summary Card */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <Label className="text-xs mb-1 block">Discount, if any (SAR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="h-8 rounded-lg text-xs bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <Label className="text-xs mb-1 block">VAT Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="h-8 rounded-lg text-xs bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex flex-col justify-end space-y-1 text-left">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{subtotal.toFixed(2)} SAR</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Discount:</span>
                    <span className="font-semibold">-{discount.toFixed(2)} SAR</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT ({taxRate}%):</span>
                  <span className="font-semibold">+{tax.toFixed(2)} SAR</span>
                </div>
                <div className="flex justify-between font-bold text-base text-primary border-t pt-1">
                  <span>Grand Total:</span>
                  <span>{grandTotal.toFixed(2)} SAR</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createQuotationMutation.mutate()}
            disabled={createQuotationMutation.isPending || !attachedDoc}
            title={!attachedDoc ? "أرفق مستند عرض المورد أولًا" : undefined}
            className="rounded-xl font-bold gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {createQuotationMutation.isPending ? "Saving..." : "Save Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ProjectStorageModal
        projectId={projectId}
        isOpen={storageOpen}
        onClose={() => setStorageOpen(false)}
        onSelect={(selections) => {
          if (selections[0]) setAttachedDoc(selections[0].document);
          setStorageOpen(false);
        }}
        skipLabels
      />
    </Dialog>
  );
}
