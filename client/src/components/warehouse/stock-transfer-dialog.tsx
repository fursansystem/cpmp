import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { StockBalance } from "@shared/schema";

interface StockTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  warehouses: any[];
}

type Line = { materialId: string; materialName: string; unit: string; quantity: string };

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

export function StockTransferDialog({ open, onOpenChange, projectId, warehouses }: StockTransferDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState("");

  const { data: balances = [] } = useQuery<StockBalance[]>({
    queryKey: ["/api/projects", projectId, "stock-balances", fromWarehouseId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/stock-balances?warehouseId=${fromWarehouseId}`);
      return await res.json();
    },
    enabled: open && !!fromWarehouseId,
  });

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setNotes("");
    setTransferDate(today());
    setToWarehouseId("");
  }, [open]);

  useEffect(() => {
    if (open && !fromWarehouseId && warehouses.length > 0) {
      setFromWarehouseId((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
    }
  }, [open, warehouses, fromWarehouseId]);

  // Picked lines belong to the source warehouse, so switching source clears them.
  useEffect(() => {
    setLines([]);
  }, [fromWarehouseId]);

  const available = useMemo(() => {
    const m = new Map<string, StockBalance>();
    balances.forEach((b) => m.set(b.materialId, b));
    return m;
  }, [balances]);

  const addLine = (materialId: string) => {
    const b = available.get(materialId);
    if (!b || lines.some((l) => l.materialId === materialId)) return;
    setLines((prev) => [...prev, { materialId, materialName: b.materialName, unit: b.unit, quantity: "" }]);
    setPicking("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!fromWarehouseId || !toWarehouseId) throw new Error("اختر المستودع المصدر والمستقبل");
      if (fromWarehouseId === toWarehouseId) throw new Error("لا يمكن التحويل إلى نفس المستودع");
      const payload = lines.filter((l) => Number(l.quantity) > 0);
      if (payload.length === 0) throw new Error("أدخل كمية لمادة واحدة على الأقل");

      const res = await apiRequest("POST", `/api/projects/${projectId}/stock-transfers`, {
        fromWarehouseId,
        toWarehouseId,
        transferDate,
        notes: notes || null,
        items: payload.map((l) => ({
          materialId: l.materialId,
          materialName: l.materialName,
          quantity: Number(l.quantity).toFixed(2),
          unit: l.unit,
        })),
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      ["stock-balances", "stock-movements", "stock-transfers"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] })
      );
      toast({
        title: `تم التحويل — ${data.transferNumber}`,
        description: `${data.fromWarehouseName} ← ${data.toWarehouseName}. إجمالي المشروع لم يتغيّر.`,
      });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "تعذّر التحويل", description: e?.message || "حدث خطأ", variant: "destructive" }),
  });

  const unpicked = balances.filter((b) => b.balance > 0 && !lines.some((l) => l.materialId === b.materialId));
  const sameWarehouse = !!fromWarehouseId && fromWarehouseId === toWarehouseId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            تحويل بين المستودعات
          </DialogTitle>
          <DialogDescription className="text-xs">
            ينقل الرصيد بين مستودعين — إجمالي المشروع يبقى كما هو
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                من مستودع <span className="text-destructive">*</span>
              </Label>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                إلى مستودع <span className="text-destructive">*</span>
              </Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger className={cn("h-10 rounded-xl", sameWarehouse && "border-destructive")}>
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                التاريخ <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black">إضافة مادة</Label>
            <Select value={picking} onValueChange={addLine} disabled={!fromWarehouseId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder={fromWarehouseId ? "اختر مادة من رصيد المصدر" : "اختر المستودع المصدر أولًا"} />
              </SelectTrigger>
              <SelectContent>
                {unpicked.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">لا توجد مواد برصيد متاح</div>
                ) : (
                  unpicked.map((b) => (
                    <SelectItem key={b.materialId} value={b.materialId}>
                      {b.materialName}{" "}
                      <span className="text-[10px] text-muted-foreground">
                        ({num(b.balance)} {b.unit})
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {lines.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-right text-[11px] font-black">المادة</TableHead>
                    <TableHead className="text-right text-[11px] font-black">المتاح</TableHead>
                    <TableHead className="text-right text-[11px] font-black w-[130px]">الكمية</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const bal = available.get(line.materialId);
                    const exceeds = Number(line.quantity) > (bal?.balance ?? 0);
                    return (
                      <TableRow key={line.materialId}>
                        <TableCell className="font-bold text-xs min-w-[180px]">{line.materialName}</TableCell>
                        <TableCell className="text-xs font-bold text-emerald-600 whitespace-nowrap">
                          {num(bal?.balance)} {line.unit}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))
                            }
                            className={cn("h-9 rounded-lg text-xs", exceeds && "border-destructive focus-visible:ring-destructive")}
                            placeholder="0.00"
                          />
                          {exceeds && <span className="text-[10px] font-bold text-destructive mt-1 block">يتجاوز المتاح</span>}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">ملاحظات</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" className="h-10 rounded-xl" />
          </div>

          {sameWarehouse && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">المستودع المصدر والمستقبل متطابقان.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || lines.length === 0 || !toWarehouseId || sameWarehouse}
            className="rounded-xl font-bold gap-2"
          >
            <ArrowLeftRight className="w-4 h-4" />
            {mutation.isPending ? "جارٍ التحويل..." : "تنفيذ التحويل"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
