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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Trash2, UserPlus, Package, Calendar, FileText, Check, CheckCircle2, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Material, Supplier } from "@shared/schema";
import { MaterialCombobox } from "@/components/procurement/material-combobox";

interface RfqItemInput {
  materialId?: string;
  materialName?: string;
  itemDescription: string;
  quantity: string;
  unit: string;
  notes?: string;
}

interface RfqFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onQuickAddSupplier?: () => void;
  onQuickAddMaterial?: () => void;
}

export function RfqFormDialog({
  open,
  onOpenChange,
  projectId,
  onQuickAddSupplier,
  onQuickAddMaterial,
}: RfqFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [items, setItems] = useState<RfqItemInput[]>([
    { materialName: "", itemDescription: "", quantity: "1", unit: "pcs", notes: "" },
  ]);

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials", { projectId }],
    enabled: open && !!projectId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", { projectId }],
    enabled: open && !!projectId,
  });

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setDueDate("");
      setSelectedSupplierIds([]);
      setItems([{ materialName: "", itemDescription: "", quantity: "1", unit: "pcs", notes: "" }]);
    }
  }, [open]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { materialName: "", itemDescription: "", quantity: "1", unit: "pcs", notes: "" },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof RfqItemInput, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectMaterial = (index: number, material: Material) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialId: material.id,
        materialName: material.materialName,
        itemDescription: material.description || "",
        unit: material.unit || updated[index].unit || "pcs",
      };
      return updated;
    });
  };

  const handleAddCustomMaterial = (index: number, materialName: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialId: "",
        materialName: materialName,
        itemDescription: "",
      };
      return updated;
    });
  };

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const createRfqMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("RFQ title is required");
      const validItems = items.filter(
        (i) => (i.materialName?.trim() || i.itemDescription.trim()) && Number(i.quantity) > 0
      );
      if (validItems.length === 0) throw new Error("Please add at least one item with a valid name or description and quantity");

      const payload = {
        title,
        description,
        dueDate: dueDate || null,
        supplierIds: selectedSupplierIds,
        items: validItems.map((i) => {
          return {
            materialId: i.materialId || null,
            itemName: i.materialName?.trim() || null,
            itemDescription: i.itemDescription.trim(),
            quantity: i.quantity,
            unit: i.unit,
            notes: i.notes || null,
          };
        }),
      };

      const res = await apiRequest("POST", `/api/projects/${projectId}/rfqs`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      toast({
        title: "RFQ Created Successfully",
        description: "Request for quotation created and suppliers notified",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to create RFQ",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Create New Request for Quotation (RFQ)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* General Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label className="font-bold text-sm">
                RFQ Title / Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g., Supply of rebar for Main Building - Phase 2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-sm flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Submission Due Date
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="font-bold text-sm">General Notes & Terms</Label>
              <Textarea
                placeholder="Any special conditions regarding delivery, payment, or sample testing..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="rounded-xl resize-none"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Required Materials & Quantities
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="rounded-xl h-8 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-3"
                >
                  <div className="grid grid-cols-12 gap-3 items-center">
                    {/* Material Combobox */}
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" /> Material Name
                      </Label>

                      <MaterialCombobox
                        materials={materials}
                        selectedMaterialId={item.materialId}
                        materialName={item.materialName}
                        onSelectMaterial={(mat) => handleSelectMaterial(index, mat)}
                        onAddCustomMaterial={(name) => handleAddCustomMaterial(index, name)}
                        onQuickAddMaterial={onQuickAddMaterial}
                      />
                    </div>

                    {/* Description */}
                    <div className="col-span-12 md:col-span-7">
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Item Description / Specification (Optional)
                      </Label>
                      <Input
                        placeholder="Color, grade, dimensions, or specific specs..."
                        value={item.itemDescription}
                        onChange={(e) => handleItemChange(index, "itemDescription", e.target.value)}
                        className="h-9 rounded-lg text-xs bg-white dark:bg-slate-950"
                      />
                    </div>

                    {/* Quantity */}
                    <div className="col-span-6 md:col-span-4">
                      <Label className="text-xs text-muted-foreground mb-1 block">Quantity</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        placeholder="Quantity"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.length <= 5) {
                            handleItemChange(index, "quantity", val);
                          }
                        }}
                        className="h-9 rounded-lg text-xs bg-white dark:bg-slate-950 px-1.5"
                      />
                    </div>

                    {/* Unit */}
                    <div className="col-span-6 md:col-span-3">
                      <Label className="text-xs text-muted-foreground mb-1 block">Unit</Label>
                      <Input
                        placeholder="m, ton, pcs..."
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                        className="h-9 rounded-lg text-xs bg-white dark:bg-slate-950"
                      />
                    </div>

                    {/* Notes */}
                    <div className="col-span-10 md:col-span-4">
                      <Label className="text-xs text-muted-foreground mb-1 block">Item Notes</Label>
                      <Input
                        placeholder="e.g., Includes delivery"
                        value={item.notes || ""}
                        onChange={(e) => handleItemChange(index, "notes", e.target.value)}
                        className="h-9 rounded-lg text-xs bg-white dark:bg-slate-950"
                      />
                    </div>

                    {/* Delete item button */}
                    <div className="col-span-2 md:col-span-1 flex justify-end pt-5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={items.length <= 1}
                        onClick={() => handleRemoveItem(index)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invited Suppliers Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-bold text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Invited Suppliers for Bidding
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select target suppliers for this request from directory
                </p>
              </div>

              {onQuickAddSupplier && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickAddSupplier}
                  className="rounded-xl h-8 text-xs font-bold gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add New Supplier
                </Button>
              )}
            </div>

            {suppliers.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-xl text-muted-foreground text-xs space-y-2">
                <p>No registered suppliers found in this project.</p>
                {onQuickAddSupplier && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onQuickAddSupplier}
                    className="rounded-xl text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add First Supplier Now
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1 border rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                {suppliers.map((supplier) => {
                  const isChecked = selectedSupplierIds.includes(supplier.id);
                  return (
                    <div
                      key={supplier.id}
                      onClick={() => toggleSupplier(supplier.id)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
                          : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleSupplier(supplier.id)}
                        className="mt-0.5"
                      />
                      <div className="overflow-hidden">
                        <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {supplier.supplierName}
                          {(supplier as any).isApproved && (
  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 shrink-0 inline-block ms-1.5 align-text-bottom" />
)}
                        </p>
                        {supplier.phone && (
                          <p className="text-[10px] text-muted-foreground truncate">{supplier.phone}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
            onClick={() => createRfqMutation.mutate()}
            disabled={createRfqMutation.isPending}
            className="rounded-xl font-bold gap-2 bg-primary text-primary-foreground"
          >
            {createRfqMutation.isPending ? "Saving..." : "Save & Create RFQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
