import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Warehouse,
  AlertTriangle,
  PackageCheck,
  Paperclip,
  FileText,
  X,
  Upload,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ReceivePoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  po: any;
}

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

export function ReceivePoDialog({ open, onOpenChange, projectId, po }: ReceivePoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [warehouseId, setWarehouseId] = useState("");
  const [arrivalDate, setArrivalDate] = useState(today());
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [deliveryNote, setDeliveryNote] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "warehouses"],
    enabled: !!projectId && open,
  });

  // Start clean every time the dialog opens, or a previous receipt's numbers linger.
  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setInvoiceNumber("");
    setDeliveryNote(null);
    setArrivalDate(today());
    setUploading(false);
  }, [open]);

  // Uploads the scanned delivery note straight from the device into the project's
  // "Delivery Note" folder, so every DN ends up in one place in project storage.
  const uploadDeliveryNote = async (file: File) => {
    setUploading(true);
    try {
      const folderRes = await apiRequest("GET", `/api/projects/${projectId}/delivery-note-folder`);
      const folder = await folderRes.json();

      const urlRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        folder: folder.id,
        projectId,
      });
      const { uploadURL, objectPath } = await urlRes.json();

      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("فشل رفع الملف");

      const sizeLabel =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`;

      const docRes = await apiRequest("POST", "/api/documents", {
        projectId,
        folderId: folder.id,
        name: file.name,
        fileName: file.name,
        type: (file.name.split(".").pop() || "FILE").toUpperCase(),
        category: "Delivery Note",
        size: sizeLabel,
        fileData: objectPath,
        tags: [],
      });
      const doc = await docRes.json();

      setDeliveryNote({ id: doc.id, name: doc.fileName || doc.name });
      toast({ title: "تم رفع مذكرة التسليم", description: `حُفظت في مجلد "${folder.name}"` });
    } catch (e: any) {
      toast({
        title: "تعذّر رفع مذكرة التسليم",
        description: e?.message || "حدث خطأ",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Default to the project's main warehouse so the common case needs no choice.
  useEffect(() => {
    if (open && !warehouseId && warehouses.length > 0) {
      setWarehouseId((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
    }
  }, [open, warehouses, warehouseId]);

  const items: any[] = po?.items ?? [];

  const receiveMutation = useMutation({
    mutationFn: async () => {
      const lines = items
        .map((i) => ({ poItemId: i.id, quantity: (quantities[i.id] || "").trim() }))
        .filter((l) => l.quantity !== "" && Number(l.quantity) > 0);

      if (lines.length === 0) throw new Error("أدخل كمية مستلمة لبند واحد على الأقل");
      if (!warehouseId) throw new Error("اختر المستودع المستلم");

      const res = await apiRequest("POST", `/api/purchase-orders/${po.id}/receipts`, {
        warehouseId,
        arrivalDate,
        deliveryInvoiceNumber: invoiceNumber || null,
        deliveryNoteId: deliveryNote?.id ?? null,
        lines,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", po.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "stock-movements"] });

      toast({
        title: `تم تسجيل الاستلام — ${data.shipmentNumber}`,
        description:
          data.overReceived?.length > 0
            ? `تنبيه: كميات تجاوزت المطلوب — ${data.overReceived.join("، ")}`
            : "تم تحديث المخزون وكميات أمر الشراء.",
      });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "تعذّر تسجيل الاستلام", description: e?.message || "حدث خطأ", variant: "destructive" }),
  });

  const fillRemaining = () => {
    const next: Record<string, string> = {};
    for (const i of items) {
      const remaining = Math.max(Number(i.remainingQuantity ?? 0), 0);
      if (remaining > 0) next[i.id] = remaining.toFixed(2);
    }
    setQuantities(next);
  };

  const totalEntered = useMemo(
    () => items.reduce((s, i) => s + (Number(quantities[i.id]) || 0), 0),
    [items, quantities]
  );

  const hasOverReceipt = items.some(
    (i) => (Number(quantities[i.id]) || 0) > Math.max(Number(i.remainingQuantity ?? 0), 0)
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <PackageCheck className="w-5 h-5 text-primary" />
              تسجيل استلام شحنة
            </DialogTitle>
            <DialogDescription className="text-xs">
              {po?.poNumber} · {po?.supplierName}
            </DialogDescription>
          </DialogHeader>

          {!po?.isReceivable ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
              <p className="font-black">لا يمكن تسجيل استلام على هذا الأمر</p>
              <p className="text-sm text-muted-foreground">
                حالة أمر الشراء <span className="font-bold">{po?.status}</span>. يجب اعتماد الأمر أولًا.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Shipment header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Warehouse className="w-3.5 h-3.5" />
                    المستودع المستلم <span className="text-destructive">*</span>
                  </Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="اختر المستودع" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                          {w.isDefault ? " (الافتراضي)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">
                    تاريخ الوصول <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">رقم فاتورة المورد</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="اختياري"
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              {/* Delivery note attachment */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  مذكرة التسليم من المورد
                </Label>
                {deliveryNote ? (
                  <div className="flex items-center justify-between gap-3 border rounded-xl p-3 bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate text-xs font-bold">{deliveryNote.name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeliveryNote(null)}
                      className="h-8 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDeliveryNote(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 rounded-xl w-full justify-start gap-2 text-xs font-bold text-muted-foreground"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          جارٍ الرفع...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          رفع مذكرة التسليم من الجهاز
                        </>
                      )}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      تُحفظ تلقائيًا في مجلد «Delivery Note» بمخزن المشروع · PDF أو صورة
                    </p>
                  </>
                )}
              </div>

              {/* Lines */}
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black">البنود — أدخل الكمية الواصلة فعليًا</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillRemaining}
                  className="rounded-xl font-bold text-[11px] h-8"
                >
                  تعبئة كامل المتبقي
                </Button>
              </div>

              <div className="rounded-xl border border-border/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-right text-[11px] font-black">المادة</TableHead>
                      <TableHead className="text-right text-[11px] font-black">الوحدة</TableHead>
                      <TableHead className="text-right text-[11px] font-black">المطلوب</TableHead>
                      <TableHead className="text-right text-[11px] font-black">المستلم سابقًا</TableHead>
                      <TableHead className="text-right text-[11px] font-black">المتبقي</TableHead>
                      <TableHead className="text-right text-[11px] font-black w-[140px]">الواصل الآن</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const remaining = Math.max(Number(item.remainingQuantity ?? 0), 0);
                      const entered = Number(quantities[item.id]) || 0;
                      const exceeds = entered > remaining;
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/20">
                          <TableCell className="min-w-[180px]">
                            <span className="font-bold text-xs">
                              {item.materialName || item.itemDescription}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{item.unit}</TableCell>
                          <TableCell className="text-xs font-bold">{num(item.orderedQuantity)}</TableCell>
                          <TableCell className="text-xs text-emerald-600 font-bold">
                            {num(item.receivedQuantity)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-xs font-black",
                              remaining > 0 ? "text-amber-600" : "text-muted-foreground"
                            )}
                          >
                            {num(remaining)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={quantities[item.id] ?? ""}
                              onChange={(e) =>
                                setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder="0.00"
                              className={cn(
                                "h-9 rounded-lg text-xs",
                                exceeds && "border-amber-500 focus-visible:ring-amber-500"
                              )}
                            />
                            {exceeds && (
                              <span className="text-[10px] font-bold text-amber-600 mt-1 block">
                                يتجاوز المتبقي
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {hasOverReceipt && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    بعض الكميات تتجاوز المطلوب في أمر الشراء. سيُسجَّل الاستلام كما هو ليطابق المخزون
                    الواقع، وستظهر الزيادة على بنود الأمر.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
            <Button
              onClick={() => receiveMutation.mutate()}
              disabled={
                receiveMutation.isPending || totalEntered <= 0 || !warehouseId || !po?.isReceivable
              }
              className="rounded-xl font-bold gap-2"
            >
              <PackageCheck className="w-4 h-4" />
              {receiveMutation.isPending ? "جارٍ التسجيل..." : "تسجيل الاستلام وإصدار DN"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
              إلغاء
            </Button>
            {totalEntered > 0 && (
              <Badge variant="secondary" className="rounded-full font-bold text-[11px] self-center mr-auto">
                إجمالي المُدخل: {num(totalEntered)}
              </Badge>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
