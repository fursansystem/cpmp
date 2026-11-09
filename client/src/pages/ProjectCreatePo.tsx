import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, Calendar, MapPin, DollarSign, ArrowRight, Building2, CheckCircle2 } from "lucide-react";
import { MaterialCombobox } from "@/components/procurement/material-combobox";
import { MaterialFormDialog } from "@/components/material-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Supplier, Material, Project } from "@shared/schema";

interface PoItemInput {
  materialId?: string;
  itemName: string;
  itemDescription: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: number;
  notes?: string;
}

export default function ProjectCreatePo() {
  const { t } = useTranslation(["procurement", "common"]);
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const backToList = () => setLocation(`/projects/${projectId}/purchase-orders?tab=purchase_orders`);

  const [newMaterialDialog, setNewMaterialDialog] = useState<{ open: boolean; name: string; index: number | null }>({
    open: false,
    name: "",
    index: null,
  });
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(t("create_po.default_payment_terms"));
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [taxRate, setTaxRate] = useState("15");
  const [discountAmount, setDiscountAmount] = useState("0");

  const [items, setItems] = useState<PoItemInput[]>([
    { itemName: "", itemDescription: "", quantity: "1", unit: "pcs", unitPrice: "0", totalPrice: 0, notes: "" },
  ]);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: !!projectId,
  });

  const { data: materials = [] } = useQuery<(Material & { isApproved?: boolean })[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: !!projectId,
  });

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { itemName: "", itemDescription: "", quantity: "1", unit: "pcs", unitPrice: "0", totalPrice: 0, notes: "" },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof PoItemInput, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === "materialId") {
        const mat = materials.find((m) => m.id === value);
        if (mat) {
          updated[index].itemName = mat.materialName;
          updated[index].itemDescription = mat.description || "";
          updated[index].unit = mat.unit || "pcs";
        }
        if (!value) updated[index].itemName = "";
      }

      const qty = parseFloat(updated[index].quantity) || 0;
      const price = parseFloat(updated[index].unitPrice) || 0;
      updated[index].totalPrice = qty * price;

      return updated;
    });
  };

  const applyMaterial = (index: number, mat: Material) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialId: mat.id,
        itemName: mat.materialName,
        itemDescription: mat.description || "",
        unit: mat.unit || "pcs",
      };
      return updated;
    });
  };

  const openNewMaterial = (name: string, index: number | null) =>
    setNewMaterialDialog({ open: true, name, index });

  const applyNewMaterial = (mat: Material) => {
    setItems((prev) => {
      const row = {
        materialId: mat.id,
        itemName: mat.materialName,
        itemDescription: mat.description || "",
        unit: mat.unit || "pcs",
      };
      const updated = [...prev];
      let target = newMaterialDialog.index;
      if (target === null) {
        target = updated.findIndex((i) => !i.materialId && !i.itemDescription.trim());
      }
      if (target === -1) {
        updated.push({ quantity: "1", unitPrice: "0", totalPrice: 0, notes: "", ...row });
      } else {
        updated[target] = { ...updated[target], ...row };
      }
      return updated;
    });
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const discount = parseFloat(discountAmount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = taxableAmount * ((parseFloat(taxRate) || 0) / 100);
  const grandTotal = taxableAmount + tax;

  const createPoMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error(t("create_po.errors.title_required"));
      if (!supplierId) throw new Error(t("create_po.errors.supplier_required"));
      // A line without a catalog material cannot be received into stock later, which would
      // leave an order that is only half receivable. Reject it here rather than at submit.
      const filledRows = items.filter((i) => i.materialId || i.itemDescription.trim() || Number(i.quantity) > 0);
      const unlinkedRows = filledRows.filter((i) => !i.materialId);
      if (unlinkedRows.length > 0) {
        throw new Error(
          t("create_po.errors.unlinked_materials", { count: unlinkedRows.length })
        );
      }
      const validItems = filledRows.filter((i) => Number(i.quantity) > 0);
      if (validItems.length === 0) throw new Error(t("create_po.errors.items_required"));

      const payload = {
        title,
        supplierId,
        poNumber: poNumber || undefined,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || null,
        deliveryAddress: deliveryAddress || null,
        paymentTerms,
        termsAndConditions: termsAndConditions || null,
        status: "approved",
        subtotal: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        discountAmount: discount.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        items: validItems.map((i) => ({
          materialId: i.materialId,
          itemName: i.itemName.trim() || null,
          itemDescription: i.itemDescription.trim(),
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: (parseFloat(i.unitPrice) || 0).toFixed(2),
          totalPrice: (i.totalPrice || 0).toFixed(2),
          notes: i.notes || null,
        })),
      };

      const res = await apiRequest("POST", `/api/projects/${projectId}/purchase-orders`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "purchase-orders"] });
      toast({
        title: t("create_po.toasts.success_title"),
        description: t("create_po.toasts.success_desc"),
      });
      setLocation(`/projects/${projectId}/purchase-orders?tab=purchase_orders`);
    },
    onError: (err: any) => {
      toast({
        title: t("create_po.toasts.error_title"),
        description: err.message || t("create_po.errors.generic_failed"),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background pb-20">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={backToList}
              className="rounded-xl h-9 gap-1.5 font-bold hover:bg-muted"
            >
              <ArrowRight className="w-4 h-4 ltr:rotate-180" />
              {t("create_po.back")}
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                {t("create_po.page_title")}
              </h1>
              {project && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {project.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={backToList} className="rounded-xl font-bold">
              {t("create_po.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => createPoMutation.mutate()}
              disabled={createPoMutation.isPending}
              className="rounded-xl font-bold gap-2 bg-primary text-primary-foreground"
            >
              {createPoMutation.isPending ? t("create_po.saving") : t("create_po.save_btn")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-background border rounded-2xl shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label className="font-bold text-sm">
              {t("create_po.title_label")} <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder={t("create_po.title_placeholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold text-sm">
              {t("create_po.supplier_label")} <span className="text-destructive">*</span>
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder={t("create_po.supplier_placeholder")} />
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

          <div className="space-y-2">
            <Label className="font-bold text-sm">{t("create_po.po_number_label")}</Label>
            <Input
              placeholder={t("create_po.po_number_placeholder")}
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold text-sm flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {t("create_po.order_date_label")}
            </Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold text-sm flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {t("create_po.delivery_date_label")}
            </Label>
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="font-bold text-sm flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              {t("create_po.delivery_address_label")}
            </Label>
            <Input
              placeholder={t("create_po.delivery_address_placeholder")}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        {/* Items Section */}
        <div className="border border-border/60 rounded-[1.5rem] overflow-hidden bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20">
            <Label className="font-bold text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              {t("create_po.items_section_title")}
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {items.length === 1 ? t("create_po.items_count_one") : t("create_po.items_count", { count: items.length })}
              </span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openNewMaterial("", null)}
              className="rounded-xl h-9 text-xs font-bold gap-1.5 border-primary/40 text-primary hover:bg-primary/5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {t("create_po.add_material_btn")}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-3 w-[260px] text-center">
                    {t("create_po.table.material")}
                  </th>
                  <th className="py-3 px-3 min-w-[200px] text-center">
                    {t("create_po.table.specs")}{" "}
                    <span className="text-destructive">*</span>
                  </th>
                  <th className="py-3 px-3 w-24 text-center">
                    {t("create_po.table.qty")}{" "}
                    <span className="text-destructive">*</span>
                  </th>
                  <th className="py-3 px-3 w-24 text-center">
                    {t("create_po.table.unit")}
                  </th>
                  <th className="py-3 px-3 w-32 text-center">
                    {t("create_po.table.unit_price")}
                  </th>
                  <th className="py-3 px-3 w-32 text-center">
                    {t("create_po.table.total")}
                  </th>
                  <th className="py-3 px-3 w-12 text-center">{t("create_po.table.delete")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 text-center text-xs font-bold text-muted-foreground">{index + 1}</td>

                    <td className="py-2.5 px-3">
                      <MaterialCombobox
                        materials={materials}
                        selectedMaterialId={item.materialId}
                        onSelectMaterial={(mat) => applyMaterial(index, mat)}
                        onAddCustomMaterial={(name) => openNewMaterial(name, index)}
                      />
                    </td>

                    <td className="py-2.5 px-3">
                      <Input
                        placeholder={t("create_po.table.specs_placeholder")}
                        value={item.itemDescription}
                        onChange={(e) => handleItemChange(index, "itemDescription", e.target.value)}
                        className="h-9 rounded-lg text-xs bg-background"
                      />
                    </td>

                    <td className="py-2.5 px-3">
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                        className="h-9 rounded-lg text-xs font-bold text-center bg-background px-1"
                      />
                    </td>

                    <td className="py-2.5 px-3">
                      <Input
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                        className="h-9 rounded-lg text-xs text-center bg-background"
                      />
                    </td>

                    <td className="py-2.5 px-3">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                        className="h-9 rounded-lg text-xs font-bold text-center bg-background"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {item.totalPrice.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={items.length <= 1}
                        onClick={() => handleRemoveItem(index)}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                        title={t("create_po.table.delete_row_title")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border/40 bg-muted/10 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddItem}
              className="h-8 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("create_po.add_row_btn")}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t("create_po.total_items_label")} <strong className="text-foreground">{items.length}</strong>
            </span>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <Label className="text-xs mb-1 block">{t("create_po.discount_label")}</Label>
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
              <Label className="text-xs mb-1 block">{t("create_po.tax_label")}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="h-8 rounded-lg text-xs bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex flex-col justify-end space-y-1 text-left rtl:text-right">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("create_po.subtotal")}</span>
                <span className="font-semibold">{subtotal.toFixed(2)} SAR</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>{t("create_po.discount")}</span>
                  <span className="font-semibold">-{discount.toFixed(2)} SAR</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>{t("create_po.tax", { rate: taxRate })}</span>
                <span className="font-semibold">+{tax.toFixed(2)} SAR</span>
              </div>
              <div className="flex justify-between font-bold text-base text-primary border-t pt-1">
                <span>{t("create_po.grand_total")}</span>
                <span>{grandTotal.toFixed(2)} SAR</span>
              </div>
            </div>
          </div>
        </div>

        </div>
      </div>

      <MaterialFormDialog
        isOpen={newMaterialDialog.open}
        onOpenChange={(open) => setNewMaterialDialog((s) => ({ ...s, open }))}
        projectId={projectId}
        initialName={newMaterialDialog.name}
        onSuccess={applyNewMaterial}
      />
    </div>
  );
}
