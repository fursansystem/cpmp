import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
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
import { enumText } from "@/lib/enums";

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
  const { t } = useTranslation("warehouse");
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
      if (!warehouseId) throw new Error(t("adjustment_dialog.errors.choose_warehouse"));
      if (!materialId) throw new Error(t("adjustment_dialog.errors.choose_material"));
      if (!(Number(quantity) > 0)) throw new Error(t("adjustment_dialog.errors.valid_quantity"));
      if (!notes.trim()) throw new Error(t("adjustment_dialog.errors.reason_required"));

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
      toast({ title: t("adjustment_dialog.toasts.recorded"), description: t("adjustment_dialog.toasts.balance_updated") });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: t("adjustment_dialog.errors.failed"), description: e?.message || t("adjustment_dialog.errors.failed"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader className="text-end">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            {t("adjustment_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("adjustment_dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5" />
                {t("adjustment_dialog.warehouse")} <span className="text-destructive">*</span>
              </Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={t("adjustment_dialog.select_placeholder")} />
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
                {t("adjustment_dialog.movement_type")} <span className="text-destructive">*</span>
              </Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_MOVEMENT_TYPES.map((tVal) => (
                    <SelectItem key={tVal} value={tVal}>
                      <span className="flex items-center gap-2">
                        <span className={isInbound(tVal) ? "text-emerald-600" : "text-destructive"}>
                          {isInbound(tVal) ? "+" : "−"}
                        </span>
                        {enumText("manual_movement", tVal)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              {t("adjustment_dialog.material")} <span className="text-destructive">*</span>
            </Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder={t("adjustment_dialog.select_material_placeholder")} />
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
                <Trans
                  i18nKey="adjustment_dialog.current_balance"
                  t={t}
                  values={{ balance: num(currentBalance), unit: selected?.unit ?? "" }}
                  components={[<span key="0" className="font-black text-foreground" />]}
                />
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                {t("adjustment_dialog.quantity")} <span className="text-destructive">*</span>
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
                <p className="text-[11px] font-bold text-destructive">{t("adjustment_dialog.quantity_exceeds")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                {t("adjustment_dialog.date")} <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              {t("adjustment_dialog.reason")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("adjustment_dialog.reason_placeholder")}
              className="rounded-xl min-h-[72px] text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("adjustment_dialog.reason_hint")}
            </p>
          </div>

          {movementType === "opening_balance" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {t("adjustment_dialog.opening_balance_warning")}
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
            {mutation.isPending ? t("adjustment_dialog.submitting") : t("adjustment_dialog.submit")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            {t("adjustment_dialog.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
