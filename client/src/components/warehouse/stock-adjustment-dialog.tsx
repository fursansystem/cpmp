import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Warehouse, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MANUAL_MOVEMENT_TYPES, MANUAL_MOVEMENT_LABELS, STOCK_IN_TYPES } from "@shared/schema";
import type { StockBalance } from "@shared/schema";

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  warehouses: any[];
}

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];
const isInbound = (t: string) => (STOCK_IN_TYPES as readonly string[]).includes(t);

export function StockAdjustmentDialog({ open, onOpenChange, projectId, warehouses }: StockAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [warehouseId, setWarehouseId] = useState("");
  const [movementType, setMovementType] = useState<string>("adjustment_in");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [notes, setNotes] = useState("");

  // Inbound adjustments may target a material with no stock yet, so the full catalog is
  // offered rather than only materials that already have a balance.
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: open,
  });

  const { data: balances = [] } = useQuery<StockBalance[]>({
    queryKey: ["/api/projects", projectId, "stock-balances", warehouseId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/stock-balances?warehouseId=${warehouseId}`);
      return await res.json();
    },
    enabled: open && !!warehouseId,
  });

  useEffect(() => {
    if (!open) return;
    setMovementType("adjustment_in");
    setMaterialId("");
    setQuantity("");
    setNotes("");
    setMovementDate(today());
  }, [open]);

  useEffect(() => {
    if (open && !warehouseId && warehouses.length > 0) {
      setWarehouseId((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
    }
  }, [open, warehouses, warehouseId]);

  const selected = materials.find((m) => m.id === materialId);
  const currentBalance = useMemo(
    () => balances.find((b) => b.materialId === materialId)?.balance ?? 0,
    [balances, materialId]
  );

  const outbound = !isInbound(movementType);
  const exceeds = outbound && Number(quantity) > currentBalance;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("اختر المستودع");
      if (!materialId) throw new Error("اختر المادة");
      if (!(Number(quantity) > 0)) throw new Error("أدخل كمية صحيحة");
      if (!notes.trim()) throw new Error("السبب مطلوب");

      const res = await apiRequest("POST", `/api/projects/${projectId}/stock-movements`, {
        warehouseId,
        materialId,
        movementType,
        quantity: Number(quantity).toFixed(2),
        unit: selected?.unit || "",
        movementDate,
        notes: notes.trim(),
      });
      return await res.json();
    },
    onSuccess: () => {
      ["stock-balances", "stock-movements", "low-stock"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] })
      );
      toast({ title: "تم تسجيل الحركة", description: "تم تحديث الرصيد." });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "تعذّر تسجيل الحركة", description: e?.message || "حدث خطأ", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            حركة مخزون يدوية
          </DialogTitle>
          <DialogDescription className="text-xs">
            تسوية جرد، تالف، مرتجع أو رصيد افتتاحي — السبب إلزامي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5" />
                المستودع <span className="text-destructive">*</span>
              </Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                نوع الحركة <span className="text-destructive">*</span>
              </Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span className={isInbound(t) ? "text-emerald-600" : "text-destructive"}>
                          {isInbound(t) ? "+" : "−"}
                        </span>
                        {MANUAL_MOVEMENT_LABELS[t]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              المادة <span className="text-destructive">*</span>
            </Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="اختر المادة من الكتالوج" />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.materialName} <span className="text-[10px] text-muted-foreground">({m.unit})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {materialId && warehouseId && (
              <p className="text-[11px] text-muted-foreground">
                الرصيد الحالي في هذا المستودع:{" "}
                <span className="font-black text-foreground">
                  {num(currentBalance)} {selected?.unit}
                </span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                الكمية <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                className={exceeds ? "h-10 rounded-xl border-destructive" : "h-10 rounded-xl"}
              />
              {exceeds && (
                <p className="text-[11px] font-bold text-destructive">الكمية تتجاوز المتوفر</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                التاريخ <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              السبب <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تلف بسبب المطر · فرق جرد شهر أكتوبر · مرتجع من الفيلا 12"
              className="rounded-xl min-h-[72px] text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              حركة تغيّر الرصيد بلا تفسير تجعل الدفتر غير موثوق — لذلك السبب إلزامي.
            </p>
          </div>

          {movementType === "opening_balance" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                الرصيد الافتتاحي يُقبل فقط لمادة لم تتحرك بعد في هذا المستودع. إن كانت لها حركات،
                استخدم «تسوية جرد» بدلًا منه.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !materialId || !notes.trim() || !(Number(quantity) > 0) || exceeds}
            className="rounded-xl font-bold"
          >
            {mutation.isPending ? "جارٍ التسجيل..." : "تسجيل الحركة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
