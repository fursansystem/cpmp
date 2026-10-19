import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Warehouse, AlertTriangle, ShieldCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { StockBalance } from "@shared/schema";

interface MaterialIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  warehouses: any[];
}

type Line = { materialId: string; materialName: string; unit: string; quantity: string; notes: string };

const num = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

export function MaterialIssueDialog({ open, onOpenChange, projectId, warehouses }: MaterialIssueDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [warehouseId, setWarehouseId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [issuedTo, setIssuedTo] = useState("");
  const [recipientType, setRecipientType] = useState("subcontractor");
  const [workLocationId, setWorkLocationId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState("");

  // Balances are scoped to the chosen warehouse: issuing draws from one warehouse only,
  // so the project-wide total would be misleading here.
  const { data: balances = [] } = useQuery<StockBalance[]>({
    queryKey: ["/api/projects", projectId, "stock-balances", warehouseId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/stock-balances?warehouseId=${warehouseId}`);
      return await res.json();
    },
    enabled: open && !!warehouseId,
  });

  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setIssuedTo("");
    setPurpose("");
    setWorkLocationId("");
    setIssueDate(today());
    setRecipientType("subcontractor");
  }, [open]);

  useEffect(() => {
    if (open && !warehouseId && warehouses.length > 0) {
      setWarehouseId((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
    }
  }, [open, warehouses, warehouseId]);

  // Changing warehouse invalidates the picked lines: their availability was read from
  // the previous warehouse.
  useEffect(() => {
    setLines([]);
  }, [warehouseId]);

  const available = useMemo(() => {
    const m = new Map<string, StockBalance>();
    balances.forEach((b) => m.set(b.materialId, b));
    return m;
  }, [balances]);

  const addLine = (materialId: string) => {
    const b = available.get(materialId);
    if (!b || lines.some((l) => l.materialId === materialId)) return;
    setLines((prev) => [
      ...prev,
      { materialId, materialName: b.materialName, unit: b.unit, quantity: "", notes: "" },
    ]);
    setPicking("");
  };

  const needsApproval = lines.some((l) => available.get(l.materialId)?.requiresIssueApproval);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("اختر المستودع");
      if (!issuedTo.trim()) throw new Error("اسم المستلم مطلوب");
      const payload = lines.filter((l) => Number(l.quantity) > 0);
      if (payload.length === 0) throw new Error("أدخل كمية لمادة واحدة على الأقل");

      const over = payload.filter((l) => Number(l.quantity) > (available.get(l.materialId)?.balance ?? 0));
      if (over.length > 0) {
        throw new Error(`الكمية تتجاوز المتوفر: ${over.map((l) => l.materialName).join("، ")}`);
      }

      const res = await apiRequest("POST", `/api/projects/${projectId}/material-issues`, {
        warehouseId,
        issueDate,
        issuedTo: issuedTo.trim(),
        recipientType,
        workLocationId: workLocationId || null,
        purpose: purpose || null,
        items: payload.map((l) => ({
          materialId: l.materialId,
          materialName: l.materialName,
          quantity: Number(l.quantity).toFixed(2),
          unit: l.unit,
          notes: l.notes || null,
        })),
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      ["stock-balances", "stock-movements", "material-issues", "low-stock"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] })
      );
      toast({
        title: `تم تسجيل سند الصرف — ${data.issueNumber}`,
        description:
          data.status === "pending_approval"
            ? "السند بانتظار الاعتماد. لن يتغيّر الرصيد قبل اعتماده."
            : "تم خصم الكميات من المخزون.",
      });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "تعذّر تسجيل الصرف", description: e?.message || "حدث خطأ", variant: "destructive" }),
  });

  const unpicked = balances.filter((b) => b.balance > 0 && !lines.some((l) => l.materialId === b.materialId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Send className="w-5 h-5 text-primary" />
            سند صرف مواد
          </DialogTitle>
          <DialogDescription className="text-xs">
            الكميات تُخصم من المستودع المحدد فقط
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                      {w.isDefault ? " (الافتراضي)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                تاريخ الصرف <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                المستلم <span className="text-destructive">*</span>
              </Label>
              <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="اسم المستلم" className="h-10 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">صفة المستلم</Label>
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subcontractor">مقاول باطن</SelectItem>
                  <SelectItem value="internal">فريق داخلي</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">موقع العمل (اختياري)</Label>
              <Select value={workLocationId || "none"} onValueChange={(v) => setWorkLocationId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="بلا تحديد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بلا تحديد</SelectItem>
                  {workLocations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {[l.unitCustomNumber, l.villaType, l.buildingNo, l.flatNo].filter(Boolean).join(" · ") ||
                        l.unitDescription ||
                        l.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الغرض</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="اختياري" className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black">إضافة مادة</Label>
            <Select value={picking} onValueChange={addLine} disabled={!warehouseId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder={warehouseId ? "اختر مادة من رصيد المستودع" : "اختر المستودع أولًا"} />
              </SelectTrigger>
              <SelectContent>
                {unpicked.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">لا توجد مواد برصيد متاح</div>
                ) : (
                  unpicked.map((b) => (
                    <SelectItem key={b.materialId} value={b.materialId}>
                      <span className="flex items-center gap-2">
                        {b.materialName}
                        <span className="text-[10px] text-muted-foreground">
                          ({num(b.balance)} {b.unit})
                        </span>
                        {b.requiresIssueApproval && (
                          <ShieldCheck className="w-3 h-3 text-amber-600" />
                        )}
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
                    <TableHead className="text-right text-[11px] font-black">ملاحظة</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const bal = available.get(line.materialId);
                    const exceeds = Number(line.quantity) > (bal?.balance ?? 0);
                    return (
                      <TableRow key={line.materialId}>
                        <TableCell className="min-w-[180px]">
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">{line.materialName}</span>
                            {bal?.requiresIssueApproval && (
                              <Badge className="rounded-full border-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[9px] font-bold w-fit mt-0.5">
                                يحتاج اعتماد
                              </Badge>
                            )}
                          </div>
                        </TableCell>
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
                              setLines((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                              )
                            }
                            className={cn("h-9 rounded-lg text-xs", exceeds && "border-destructive focus-visible:ring-destructive")}
                            placeholder="0.00"
                          />
                          {exceeds && (
                            <span className="text-[10px] font-bold text-destructive mt-1 block">يتجاوز المتاح</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.notes}
                            onChange={(e) =>
                              setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, notes: e.target.value } : l)))
                            }
                            className="h-9 rounded-lg text-xs"
                            placeholder="اختياري"
                          />
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

          {needsApproval && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                السند يحتوي مادة تحتاج اعتمادًا، فسيُسجَّل كـ<span className="font-black"> معلّق </span>
                ولن يتغيّر الرصيد حتى يُعتمد — بما في ذلك باقي المواد في السند.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-start">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || lines.length === 0}
            className="rounded-xl font-bold gap-2"
          >
            <Send className="w-4 h-4" />
            {mutation.isPending ? "جارٍ الحفظ..." : needsApproval ? "إرسال للاعتماد" : "صرف وتسجيل"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
