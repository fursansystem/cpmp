import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
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
import { SubcontractorSelect } from "@/components/payments/subcontractor-select";

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
  const { t } = useTranslation("warehouse");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [warehouseId, setWarehouseId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [issuedTo, setIssuedTo] = useState("");
  const [subcontractorId, setSubcontractorId] = useState("");
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
    setSubcontractorId("");
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
      if (!warehouseId) throw new Error(t("issue_dialog.errors.choose_warehouse"));
      if (!issuedTo.trim()) throw new Error(t("issue_dialog.errors.recipient_required"));
      const payload = lines.filter((l) => Number(l.quantity) > 0);
      if (payload.length === 0) throw new Error(t("issue_dialog.errors.enter_at_least_one"));

      const over = payload.filter((l) => Number(l.quantity) > (available.get(l.materialId)?.balance ?? 0));
      if (over.length > 0) {
        throw new Error(t("issue_dialog.errors.quantity_exceeds", { items: over.map((l) => l.materialName).join(", ") }));
      }

      const res = await apiRequest("POST", `/api/projects/${projectId}/material-issues`, {
        warehouseId,
        issueDate,
        issuedTo: issuedTo.trim(),
        subcontractorId: recipientType === "subcontractor" && subcontractorId ? subcontractorId : null,
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
        title: t("issue_dialog.toasts.title", { number: data.issueNumber }),
        description:
          data.status === "pending_approval"
            ? t("issue_dialog.toasts.pending_desc")
            : t("issue_dialog.toasts.deducted_desc"),
      });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: t("issue_dialog.errors.failed"), description: e?.message || t("issue_dialog.errors.failed"), variant: "destructive" }),
  });

  const unpicked = balances.filter((b) => b.balance > 0 && !lines.some((l) => l.materialId === b.materialId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-end">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Send className="w-5 h-5 text-primary" />
            {t("issue_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("issue_dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5" />
                {t("issue_dialog.warehouse")} <span className="text-destructive">*</span>
              </Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={t("issue_dialog.select_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.isDefault ? t("issue_dialog.default_suffix") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                {t("issue_dialog.issue_date")} <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                {t("issue_dialog.recipient")} <span className="text-destructive">*</span>
              </Label>
              {recipientType === "subcontractor" ? (
                <SubcontractorSelect
                  projectId={projectId}
                  value={subcontractorId}
                  onChange={(id, sub) => { setSubcontractorId(id); setIssuedTo(sub?.name ?? ""); }}
                />
              ) : (
                <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder={t("issue_dialog.recipient_name_placeholder")} className="h-10 rounded-xl" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("issue_dialog.recipient_type")}</Label>
              <Select value={recipientType} onValueChange={(v) => { setRecipientType(v); setIssuedTo(""); setSubcontractorId(""); }}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subcontractor">{t("issue_dialog.recipient_types.subcontractor")}</SelectItem>
                  <SelectItem value="internal">{t("issue_dialog.recipient_types.internal")}</SelectItem>
                  <SelectItem value="other">{t("issue_dialog.recipient_types.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("issue_dialog.work_location")}</Label>
              <Select value={workLocationId || "none"} onValueChange={(v) => setWorkLocationId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={t("issue_dialog.unassigned")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("issue_dialog.unassigned")}</SelectItem>
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
              <Label className="text-xs font-bold">{t("issue_dialog.purpose")}</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("issue_dialog.optional")} className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black">{t("issue_dialog.add_material")}</Label>
            <Select value={picking} onValueChange={addLine} disabled={!warehouseId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder={warehouseId ? t("issue_dialog.select_from_warehouse") : t("issue_dialog.select_warehouse_first")} />
              </SelectTrigger>
              <SelectContent>
                {unpicked.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">{t("issue_dialog.no_available_materials")}</div>
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
                    <TableHead className="text-end text-[11px] font-black">{t("issue_dialog.table.material")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("issue_dialog.table.available")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black w-[130px]">{t("issue_dialog.table.quantity")}</TableHead>
                    <TableHead className="text-end text-[11px] font-black">{t("issue_dialog.table.note")}</TableHead>
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
                                {t("issue_dialog.requires_approval")}
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
                            <span className="text-[10px] font-bold text-destructive mt-1 block">{t("issue_dialog.table.exceeds_available")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.notes}
                            onChange={(e) =>
                              setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, notes: e.target.value } : l)))
                            }
                            className="h-9 rounded-lg text-xs"
                            placeholder={t("issue_dialog.optional")}
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
                <Trans i18nKey="issue_dialog.needs_approval_warning" t={t} components={[<span key="0" className="font-black" />]} />
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
            {mutation.isPending ? t("issue_dialog.submitting") : needsApproval ? t("issue_dialog.submit_approval") : t("issue_dialog.submit_direct")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">
            {t("issue_dialog.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
