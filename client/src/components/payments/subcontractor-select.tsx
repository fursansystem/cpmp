// مقاولو الباطن: the project's register of subcontractors and the picker that every form uses instead of a typed name.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, CheckCircle2, FileSignature, HardHat, MapPin, Pencil, Plug, Plus, RefreshCw, RotateCcw, Save, Search, Trash2, X, XCircle } from "lucide-react";
import { isErpContractorGroup, type ErpSupplierEntry } from "@shared/erp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PaymentDialog, Section, errorMessage, getJson, invalidatePayments, money, paymentsQuery, useSystemVatRate, type PaymentsContext } from "./payments-common";

export interface SubcontractorRow {
  id: string;
  projectId: string;
  name: string;
  taxNumber: string | null;
  contactPerson: string | null;
  phone: string | null;
  scope: string | null;
  erpSupplier?: string | null;
  workLocationIds?: string[];
}

export interface SubcontractorContractRow {
  id: string;
  projectId: string;
  seq: number;
  contractNo: string;
  subcontractorId: string;
  subcontractorName: string;
  title: string;
  scope: string | null;
  contractValue: string | number;
  retentionPercent: string | number;
  vatPercent: string | number;
  defaultBillingMode?: "qty" | "progress" | string;
  boqItemCount?: number;
  boqOriginalTotal?: number;
  boqVariationsTotal?: number;
  pendingVoCount?: number;
  startDate: string | null;
  endDate: string | null;
  workLocationIds: string[];
  status: "active" | "settled" | "terminated" | string;
  settlementDate: string | null;
  settlementNote: string | null;
  notes: string | null;
}

export function compareAlphaNum(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function sortWorkLocations<T extends Record<string, any>>(locations: T[]): T[] {
  return [...locations].sort((a, b) => {
    const byBldg = compareAlphaNum(a.buildingNo, b.buildingNo);
    if (byBldg !== 0) return byBldg;
    const byUnit = compareAlphaNum(a.unitCustomNumber, b.unitCustomNumber);
    if (byUnit !== 0) return byUnit;
    const byFloor = compareAlphaNum(a.floor, b.floor);
    if (byFloor !== 0) return byFloor;
    return compareAlphaNum(a.part, b.part);
  });
}

export function formatWorkLocationLabel(location: any): string {
  if (!location) return "";
  const unit = location.unitCustomNumber || "N/A";
  const zoneFloor = [location.unitZone, location.floor].filter(Boolean).join(" ");
  const bldg = location.buildingNo || "No Bldg";
  const part = location.part || "No Part";
  return `${unit} - ${zoneFloor} (${bldg}, ${part})`.replace(/\s+/g, " ").trim();
}

export function summarizeWorkLocations(locations: any[], selectedIds: string[]): string {
  if (!selectedIds || selectedIds.length === 0) return "";
  const set = new Set(selectedIds);
  const picked = locations.filter((l) => set.has(l.id));
  if (picked.length === 0) return `${selectedIds.length} selected`;
  if (picked.length === 1) return formatWorkLocationLabel(picked[0]);
  const buildings = Array.from(new Set(picked.map((l) => l.buildingNo).filter(Boolean))).sort(compareAlphaNum);
  if (buildings.length === 1) {
    return `Building ${buildings[0]} (${picked.length} units)`;
  }
  if (buildings.length > 1) {
    return `Buildings ${buildings.join(", ")} (${picked.length} units)`;
  }
  return `${picked.length} units`;
}

export function GroupedLocationBadges({
  locations,
  onRemoveOne,
  onRemoveMany,
  className,
}: {
  locations: any[];
  onRemoveOne?: (id: string) => void;
  onRemoveMany?: (ids: string[]) => void;
  className?: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    const sorted = sortWorkLocations(locations);
    for (const loc of sorted) {
      const b = String(loc.buildingNo || loc.building || "No Bldg").trim();
      const list = map.get(b) ?? [];
      list.push(loc);
      map.set(b, list);
    }
    return Array.from(map.entries()).sort((a, b) => compareAlphaNum(a[0], b[0]));
  }, [locations]);

  if (groups.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1", className)}>
      {groups.map(([bNo, items]) => (
        <div
          key={bNo}
          className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 px-2.5 py-1.5 shadow-sm"
        >
          <span className="inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-2.5 py-0.5 text-xs font-bold tabular-nums shadow-xs">
            <Building2 className="w-3 h-3 shrink-0" />
            <span>{bNo}</span>
            {onRemoveMany && (
              <button
                type="button"
                onClick={() => onRemoveMany(items.map((i) => i.id))}
                className="ms-0.5 rounded-full p-0.5 hover:bg-black/15 transition-colors"
                title="Remove building"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {items.map((loc: any) => (
              <span
                key={loc.id}
                className="inline-flex items-center gap-1 rounded-lg bg-background border border-border/80 px-2 py-0.5 text-xs font-semibold tabular-nums shadow-xs"
              >
                <span>{loc.unitCustomNumber || loc.unit || "—"}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkLocationPickerDialog({
  open,
  onOpenChange,
  locations,
  selectedIds,
  onChangeSelectedIds,
  multiple = true,
  title = "Add Work Locations",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: any[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  multiple?: boolean;
  title?: string;
}) {
  const [buildingFilter, setBuildingFilter] = useState("all-buildings");
  const [floorFilter, setFloorFilter] = useState("all-floors");
  const [partFilter, setPartFilter] = useState("all-parts");
  const [locationSearch, setLocationSearch] = useState("");

  const sortedLocations = useMemo(() => sortWorkLocations(locations), [locations]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const buildings = useMemo(
    () => Array.from(new Set(sortedLocations.map((l: any) => l.buildingNo).filter(Boolean))).sort(compareAlphaNum),
    [sortedLocations]
  );
  const floors = useMemo(
    () => Array.from(new Set(sortedLocations.map((l: any) => l.floor).filter(Boolean))).sort(compareAlphaNum),
    [sortedLocations]
  );
  const parts = useMemo(
    () => Array.from(new Set(sortedLocations.map((l: any) => l.part).filter(Boolean))).sort(compareAlphaNum),
    [sortedLocations]
  );

  const filteredWorkLocations = useMemo(() => {
    return sortedLocations.filter((loc: any) => {
      const matchesBuilding = !buildingFilter || buildingFilter === "all-buildings" || loc.buildingNo === buildingFilter;
      const matchesFloor = !floorFilter || floorFilter === "all-floors" || loc.floor === floorFilter;
      const matchesPart = !partFilter || partFilter === "all-parts" || loc.part === partFilter;

      if (!matchesBuilding || !matchesFloor || !matchesPart) return false;

      if (!locationSearch) return true;
      const search = locationSearch.toLowerCase();
      return (
        loc.unitCustomNumber?.toLowerCase().includes(search) ||
        loc.unitZone?.toLowerCase().includes(search) ||
        loc.unitBlock?.toLowerCase().includes(search) ||
        loc.buildingNo?.toLowerCase().includes(search) ||
        loc.floor?.toLowerCase().includes(search) ||
        loc.part?.toLowerCase().includes(search)
      );
    });
  }, [sortedLocations, buildingFilter, floorFilter, partFilter, locationSearch]);

  const selectedLocations = useMemo(
    () => sortedLocations.filter((l: any) => selectedSet.has(l.id)),
    [sortedLocations, selectedSet]
  );

  const handleSelectLocation = (id: string) => {
    if (!multiple) {
      if (selectedSet.has(id)) {
        onChangeSelectedIds([]);
      } else {
        onChangeSelectedIds([id]);
      }
      return;
    }
    if (selectedSet.has(id)) {
      onChangeSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      onChangeSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredWorkLocations.forEach((l: any) => next.add(l.id));
    onChangeSelectedIds(Array.from(next));
  };

  const handleDeselectAll = () => {
    onChangeSelectedIds([]);
  };

  const handleRemoveLocation = (id: string) => {
    onChangeSelectedIds(selectedIds.filter((x) => x !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Building</Label>
              <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                <SelectTrigger className="h-8 shadow-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-buildings">All Buildings</SelectItem>
                  {buildings.map((b) => (
                    <SelectItem key={b} value={b || ""}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Floor</Label>
              <Select value={floorFilter} onValueChange={setFloorFilter}>
                <SelectTrigger className="h-8 shadow-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-floors">All Floors</SelectItem>
                  {floors.map((f) => (
                    <SelectItem key={f} value={f || ""}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Part</Label>
              <Select value={partFilter} onValueChange={setPartFilter}>
                <SelectTrigger className="h-8 shadow-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-parts">All Parts</SelectItem>
                  {parts.map((p) => (
                    <SelectItem key={p} value={p || ""}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Search & Select Locations</Label>
              <div className="flex gap-1">
                {multiple && filteredWorkLocations.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSelectAllFiltered}
                  >
                    Select All ({filteredWorkLocations.length})
                  </Button>
                )}
                {selectedLocations.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={handleDeselectAll}
                  >
                    Deselect All
                  </Button>
                )}
              </div>
            </div>
            <Command className="border rounded-md shadow-sm" shouldFilter={false}>
              <CommandInput
                placeholder="Search unit, zone, block..."
                value={locationSearch}
                onValueChange={setLocationSearch}
              />
              <div className="grid grid-cols-[1fr_1fr_1.4fr_1.2fr_0.8fr_28px] items-center gap-2 px-3 py-2 bg-muted/60 border-b text-[11px] font-bold text-muted-foreground">
                <span>Unit</span>
                <span>Zone</span>
                <span>Floor</span>
                <span>Building</span>
                <span>Part</span>
                <span className="text-center"></span>
              </div>
              <CommandList className="max-h-[280px]">
                <CommandEmpty>No locations found.</CommandEmpty>
                <CommandGroup className="p-0">
                  {filteredWorkLocations.map((location: any) => {
                    const isSelected = selectedSet.has(location.id);
                    return (
                      <CommandItem
                        key={location.id}
                        value={`${location.unitCustomNumber} ${location.unitZone} ${location.unitBlock} ${location.buildingNo} ${location.floor} ${location.part}`}
                        onSelect={() => handleSelectLocation(location.id)}
                        className={cn(
                          "cursor-pointer px-3 py-2 rounded-none border-b border-border/40 last:border-b-0",
                          isSelected && "bg-primary/10 font-semibold"
                        )}
                      >
                        <div className="grid grid-cols-[1fr_1fr_1.4fr_1.2fr_0.8fr_28px] items-center gap-2 w-full text-xs">
                          <span className="font-semibold tabular-nums">{location.unitCustomNumber || "—"}</span>
                          <span className="text-muted-foreground tabular-nums">{location.unitZone || "—"}</span>
                          <span className="truncate">{location.floor || "—"}</span>
                          <span className="font-medium tabular-nums">{location.buildingNo || "—"}</span>
                          <span className="text-muted-foreground tabular-nums">{location.part || "—"}</span>
                          <span className="flex justify-center">
                            {isSelected ? (
                              <Check className="h-4 w-4 text-primary" />
                            ) : (
                              <Plus className="h-4 w-4 opacity-50" />
                            )}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          {selectedLocations.length > 0 && (
            <GroupedLocationBadges
              locations={selectedLocations}
              onRemoveOne={handleRemoveLocation}
              onRemoveMany={(ids) => {
                const removeSet = new Set(ids);
                onChangeSelectedIds(selectedIds.filter((x) => !removeSet.has(x)));
              }}
              className="mt-2"
            />
          )}
        </div>
        <DialogFooter className="pt-4 mt-2">
          <Button type="button" variant="default" onClick={() => onOpenChange(false)} className="w-full shadow-md">
            Done ({selectedLocations.length} selected)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useSubcontractors(projectId: string) {
  return useQuery<SubcontractorRow[]>({
    queryKey: ["payments", "subcontractors", projectId],
    queryFn: () => getJson(`/api/payments/subcontractors?projectId=${projectId}`),
    enabled: !!projectId,
    meta: paymentsQuery,
  });
}

export function useSubcontractorContracts(projectId: string) {
  return useQuery<SubcontractorContractRow[]>({
    queryKey: ["payments", "subcontractor-contracts", projectId],
    queryFn: () => getJson(`/api/payments/subcontractor-contracts?projectId=${projectId}`),
    enabled: !!projectId && projectId !== "all",
    meta: paymentsQuery,
  });
}

const NEW = "__new__";

// Choose a subcontractor of the project, or add one without leaving the form
export function SubcontractorSelect({ projectId, value, onChange, disabled, placeholder }: {
  projectId: string; value: string; onChange: (id: string, sub?: SubcontractorRow) => void; disabled?: boolean; placeholder?: string;
}) {
  const { t } = useTranslation("payments");
  const resolvedPlaceholder = placeholder ?? t("subcontractors.select_placeholder");
  const { data: subs = [] } = useSubcontractors(projectId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Select
        value={value}
        disabled={disabled || !projectId}
        onValueChange={(v) => (v === NEW ? setAdding(true) : onChange(v, subs.find((s) => s.id === v)))}
      >
        <SelectTrigger><SelectValue placeholder={projectId ? resolvedPlaceholder : t("common.select_project_first")} /></SelectTrigger>
        <SelectContent>
          {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.scope ? ` — ${s.scope}` : ""}</SelectItem>)}
          <SelectItem value={NEW}><span className="flex items-center gap-1 font-semibold text-primary"><Plus className="w-3.5 h-3.5" /> {t("subcontractors.new_inline")}</span></SelectItem>
        </SelectContent>
      </Select>
      {adding && <SubcontractorDialog projectId={projectId} onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); onChange(s.id, s); }} />}
    </>
  );
}

export function SubcontractorDialog({ projectId, row, onClose, onSaved }: {
  projectId: string; row?: SubcontractorRow | null; onClose: () => void; onSaved?: (s: SubcontractorRow) => void;
}) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: row?.name ?? "",
    taxNumber: row?.taxNumber ?? "",
    contactPerson: row?.contactPerson ?? "",
    phone: row?.phone ?? "",
    scope: row?.scope ?? "",
    erpSupplier: row?.erpSupplier ?? null,
  });
  const [erpSearch, setErpSearch] = useState("");
  const [showErpDropdown, setShowErpDropdown] = useState(false);
  const [strictContractorGroup, setStrictContractorGroup] = useState(true);

  const set = (k: "name" | "taxNumber" | "contactPerson" | "phone" | "scope") => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: erpContractors = [] } = useQuery<ErpSupplierEntry[]>({
    queryKey: ["/api/erp/project-suppliers", { projectId, role: "subcontractor" }],
    queryFn: async () => {
      const res = await fetch(`/api/erp/project-suppliers?projectId=${encodeURIComponent(projectId)}&role=subcontractor`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId && projectId !== "all",
  });

  const strictCount = useMemo(
    () => erpContractors.filter((s) => isErpContractorGroup(s.supplierGroup)).length,
    [erpContractors],
  );

  const filteredErpContractors = useMemo(() => {
    const baseList =
      strictContractorGroup && strictCount > 0
        ? erpContractors.filter((s) => isErpContractorGroup(s.supplierGroup))
        : erpContractors;
    const q = erpSearch.trim().toLowerCase();
    if (!q) return baseList.slice(0, 40);
    return baseList
      .filter((s) =>
        [s.supplierName, s.erpName, s.taxId, s.supplierGroup, s.phone, s.contactPerson]
          .some((v) => (v ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 40);
  }, [erpContractors, erpSearch, strictContractorGroup, strictCount]);

  const applyErpEntry = (entry: ErpSupplierEntry) => {
    setForm((f) => ({
      ...f,
      erpSupplier: entry.erpName,
      name: entry.supplierName || f.name,
      taxNumber: entry.taxId || f.taxNumber,
      contactPerson: entry.contactPerson || f.contactPerson,
      phone: entry.phone || f.phone,
    }));
  };

  const syncErpMutation = useMutation({
    mutationFn: async (erpName: string) => {
      const res = await apiRequest("POST", "/api/erp/project-suppliers/fetch", { projectId, erpName });
      return (await res.json()) as ErpSupplierEntry;
    },
    onSuccess: (fresh) => {
      applyErpEntry(fresh);
      queryClient.invalidateQueries({ queryKey: ["/api/erp/project-suppliers"] });
      toast({
        title: "تمت مزامنة بيانات المقاول من ERPNext",
        description: `${fresh.supplierName}${fresh.taxId ? ` · الرقم الضريبي: ${fresh.taxId}` : ""}`,
      });
    },
    onError: (e) => toast({ title: "تعذر تحديث المقاول من ERPNext", description: errorMessage(e), variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = row
        ? await apiRequest("PATCH", `/api/payments/subcontractors/${row.id}`, form)
        : await apiRequest("POST", "/api/payments/subcontractors", { projectId, ...form });
      return row ? ({ ...row, ...form } as SubcontractorRow) : ((await res.json()) as SubcontractorRow);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: row ? t("toasts.sub_saved") : t("toasts.sub_added") });
      if (onSaved) onSaved(saved); else onClose();
    },
    onError: (e) => toast({ title: t("errors.save_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={HardHat}
      kind={t("subcontractors.kind")}
      title={row ? t("subcontractors.edit_title") : t("subcontractors.new_title")}
      description={t("subcontractors.new_description")}
      footer={
        <>
          <Button disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}><Save className="w-4 h-4 me-1" /> {t("common.save")}</Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        {/* ERPNext Contractor Selection & Sync Section (Filtered by Supplier Group = مقاول) */}
        {erpContractors.length > 0 && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-xs font-bold">
                    اختيار ومزامنة مقاول من ERPNext (فئة: مقاول)
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    مفلتر تلقائياً على مجموعة «مقاول» مع استبعاد الموردين ({strictContractorGroup && strictCount > 0 ? strictCount : erpContractors.length} مقاول متاح)
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={strictContractorGroup ? "default" : "outline"}
                  className="h-6 rounded-lg text-[10px] px-2"
                  onClick={() => setStrictContractorGroup(true)}
                >
                  مجموعة «مقاول» فقط ({strictCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!strictContractorGroup ? "default" : "outline"}
                  className="h-6 rounded-lg text-[10px] px-2"
                  onClick={() => setStrictContractorGroup(false)}
                >
                  تضمين غير المصنفين ({erpContractors.length})
                </Button>
              </div>
            </div>

            {form.erpSupplier && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>مرتبط بـ ERPNext: {form.erpSupplier}</span>
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={syncErpMutation.isPending}
                    onClick={() => form.erpSupplier && syncErpMutation.mutate(form.erpSupplier)}
                  >
                    <RefreshCw className={`w-3 h-3 me-1 ${syncErpMutation.isPending ? "animate-spin" : ""}`} />
                    مزامنة
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => setForm((f) => ({ ...f, erpSupplier: null }))}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute start-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={erpSearch}
                onFocus={() => setShowErpDropdown(true)}
                onChange={(e) => {
                  setErpSearch(e.target.value);
                  setShowErpDropdown(true);
                }}
                placeholder="ابحث باسم المقاول في ERPNext أو الرقم الضريبي..."
                className="ps-8 h-8 text-xs bg-background"
                data-testid="input-search-erp-subcontractor"
              />
              {showErpDropdown && (
                <button
                  type="button"
                  onClick={() => setShowErpDropdown(false)}
                  className="absolute end-2 top-1.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5"
                >
                  إغلاق
                </button>
              )}
            </div>

            {showErpDropdown && (
              <div className="max-h-44 overflow-y-auto rounded-xl border bg-background shadow-lg divide-y">
                {filteredErpContractors.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    لا يوجد مقاول مطابق في ERPNext
                  </div>
                ) : (
                  filteredErpContractors.map((item) => {
                    const isSelected = form.erpSupplier === item.erpName;
                    return (
                      <button
                        key={item.erpName}
                        type="button"
                        onClick={() => {
                          applyErpEntry(item);
                          setShowErpDropdown(false);
                          setErpSearch(item.supplierName);
                          syncErpMutation.mutate(item.erpName);
                        }}
                        className={`w-full text-start px-3 py-2 text-xs hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 ${
                          isSelected ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold truncate">{item.supplierName}</span>
                            {item.supplierGroup && (
                              <Badge variant="secondary" className="text-[10px]">
                                {item.supplierGroup}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                            {item.taxId && <span className="font-mono">الضريبي: {item.taxId}</span>}
                            {item.phone && <span>هاتف: {item.phone}</span>}
                            {item.contactPerson && <span>جهة الاتصال: {item.contactPerson}</span>}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-primary shrink-0">
                          {isSelected ? "مختار ✓" : "اختيار ومزامنة"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5"><Label>{t("subcontractors.name")}</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("subcontractors.scope")}</Label><Input value={form.scope} onChange={(e) => set("scope")(e.target.value)} placeholder={t("subcontractors.scope_placeholder")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>{t("subcontractors.tax_number")}</Label><Input value={form.taxNumber} onChange={(e) => set("taxNumber")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("subcontractors.phone")}</Label><Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>{t("subcontractors.contact_person")}</Label><Input value={form.contactPerson} onChange={(e) => set("contactPerson")(e.target.value)} /></div>
      </div>
    </PaymentDialog>
  );
}

export function SubcontractorContractDialog({
  projectId,
  row,
  defaultSubcontractorId,
  onClose,
  onSaved,
}: {
  projectId: string;
  row?: SubcontractorContractRow | null;
  defaultSubcontractorId?: string;
  onClose: () => void;
  onSaved?: (c: SubcontractorContractRow) => void;
}) {
  const { t, i18n } = useTranslation("payments");
  const isAr = (i18n.language || "ar").startsWith("ar");
  const systemVatRate = useSystemVatRate(15);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(row && row.id);
  const isActive = !isEditing || row?.status === "active";

  const [form, setForm] = useState({
    subcontractorId: row?.subcontractorId ?? defaultSubcontractorId ?? "",
    title: row?.title ?? "",
    scope: row?.scope ?? "",
    contractValue: row && row.contractValue ? String(Number(row.contractValue || 0) || "") : "",
    retentionPercent: row && row.retentionPercent !== undefined ? String(Number(row.retentionPercent ?? 10)) : "10",
    vatPercent: row && row.vatPercent !== undefined ? String(Number(row.vatPercent ?? 15)) : "15",
    defaultBillingMode: (row?.defaultBillingMode === "progress" ? "progress" : "qty") as "qty" | "progress",
    startDate: row?.startDate ?? "",
    endDate: row?.endDate ?? "",
    workLocationIds: row?.workLocationIds ?? ([] as string[]),
    notes: row?.notes ?? "",
  });
  const hasBoqItems = Boolean(row && (row.boqItemCount ?? 0) > 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [transitionMode, setTransitionMode] = useState<"settle" | "terminate" | null>(null);
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settlementNote, setSettlementNote] = useState("");

  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: !!projectId,
  });

  const selectedSet = useMemo(() => new Set(form.workLocationIds), [form.workLocationIds]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        contractValue: Number(form.contractValue || 0),
        retentionPercent: Number(form.retentionPercent || 0),
        vatPercent: Number(form.vatPercent || 0),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        scope: form.scope || null,
        notes: form.notes || null,
      };
      const res = isEditing
        ? await apiRequest("PATCH", `/api/payments/subcontractor-contracts/${row!.id}`, payload)
        : await apiRequest("POST", "/api/payments/subcontractor-contracts", { projectId, ...payload });
      return isEditing ? ({ ...row, ...payload } as unknown as SubcontractorContractRow) : ((await res.json()) as SubcontractorContractRow);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: isEditing ? t("contracts.saved_toast") : t("contracts.created_toast") });
      if (onSaved) onSaved(saved);
      else onClose();
    },
    onError: (e) => toast({ title: t("errors.save_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  const transition = useMutation({
    mutationFn: async (action: "settle" | "terminate" | "reopen") => {
      await apiRequest("POST", `/api/payments/subcontractor-contracts/${row!.id}/transition`, {
        action,
        settlementDate: action === "reopen" ? null : settlementDate,
        note: settlementNote || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: t("contracts.status_updated_toast") });
      onClose();
    },
    onError: (e) => toast({ title: t("errors.action_failed"), description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <PaymentDialog
      onClose={onClose}
      size="md"
      icon={FileSignature}
      kind={t("contracts.kind")}
      title={isEditing && row ? <span className="font-mono">{row.contractNo} — {row.title}</span> : t("contracts.new_title")}
      description={t("contracts.new_description")}
      amount={Number(form.contractValue || 0) > 0 ? money(Number(form.contractValue || 0)) : undefined}
      amountLabel={t("contracts.contract_value")}
      panel={
        transitionMode && isEditing && row && (
          <Section
            title={transitionMode === "settle" ? t("contracts.settle_title") : t("contracts.terminate_title")}
            icon={transitionMode === "settle" ? CheckCircle2 : XCircle}
            tone={transitionMode === "terminate" ? "danger" : undefined}
          >
            <p className="text-xs text-muted-foreground">
              {transitionMode === "settle" ? t("contracts.settle_hint") : t("contracts.terminate_hint")}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("contracts.settlement_date")}</Label>
                <Input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("contracts.settlement_note")}</Label>
                <Textarea
                  rows={2}
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  placeholder={t("contracts.settlement_note_placeholder")}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setTransitionMode(null)}>
                {t("common.back_btn")}
              </Button>
              <Button
                size="sm"
                variant={transitionMode === "settle" ? "default" : "destructive"}
                disabled={transition.isPending}
                onClick={() => transition.mutate(transitionMode)}
              >
                {transitionMode === "settle" ? t("contracts.confirm_settle") : t("contracts.confirm_terminate")}
              </Button>
            </div>
          </Section>
        )
      }
      footer={
        <>
          {isActive && (
            <Button
              disabled={save.isPending || !form.subcontractorId || !form.title.trim()}
              onClick={() => save.mutate()}
            >
              <Save className="w-4 h-4 me-1" /> {t("common.save")}
            </Button>
          )}
          {row && isActive && !transitionMode && (
            <>
              <Button variant="outline" onClick={() => setTransitionMode("settle")}>
                <CheckCircle2 className="w-4 h-4 me-1 text-emerald-600" /> {t("contracts.settle_btn")}
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => setTransitionMode("terminate")}>
                <XCircle className="w-4 h-4 me-1" /> {t("contracts.terminate_btn")}
              </Button>
            </>
          )}
          {isEditing && row && !isActive && (
            <Button variant="outline" disabled={transition.isPending} onClick={() => transition.mutate("reopen")}>
              <RotateCcw className="w-4 h-4 me-1" /> {t("contracts.reopen_btn")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      {isEditing && row && !isActive && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            {row.status === "settled" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
            {row.status === "settled" ? t("contracts.status_settled") : t("contracts.status_terminated")}
            {row.settlementDate && <span className="text-muted-foreground">({row.settlementDate})</span>}
          </div>
          {row.settlementNote && <p className="text-muted-foreground">{row.settlementNote}</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("certificates.subcontractor")} *</Label>
          <SubcontractorSelect
            projectId={projectId}
            value={form.subcontractorId}
            disabled={!isActive}
            onChange={(id, sub) =>
              setForm((f) => ({
                ...f,
                subcontractorId: id,
                scope: f.scope || (sub?.scope ?? ""),
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("contracts.title_label")} *</Label>
          <Input
            value={form.title}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t("contracts.title_placeholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("certificates.scope")}</Label>
          <Input
            value={form.scope}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
            placeholder={t("subcontractors.scope_placeholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("contracts.contract_value")}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.contractValue}
            disabled={!isActive || hasBoqItems}
            onChange={(e) => setForm((f) => ({ ...f, contractValue: e.target.value }))}
          />
          {hasBoqItems && (
            <p className="text-[11px] text-primary">
              {t("boq.auto_synced_from_boq", { count: row?.boqItemCount ?? 0 })}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("boq.default_billing_mode")}</Label>
          <Select
            value={form.defaultBillingMode}
            disabled={!isActive}
            onValueChange={(v) => setForm((f) => ({ ...f, defaultBillingMode: v as "qty" | "progress" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qty">{t("boq.mode_qty")}</SelectItem>
              <SelectItem value="progress">{t("boq.mode_progress")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("certificates.retention_pct")}</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.retentionPercent}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, retentionPercent: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("certificates.vat_pct")}</Label>
          <Select
            value={Number(form.vatPercent) > 0 ? "applied" : "not_applied"}
            disabled={!isActive}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, vatPercent: v === "applied" ? String(systemVatRate) : "0" }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="applied">
                {isAr
                  ? `مطبقة (${Number(form.vatPercent) > 0 ? Number(form.vatPercent) : systemVatRate}%)`
                  : `Applied (${Number(form.vatPercent) > 0 ? Number(form.vatPercent) : systemVatRate}%)`}
              </SelectItem>
              <SelectItem value="not_applied">{isAr ? "غير مطبقة (0%)" : "Not Applied (0%)"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("contracts.start_date")}</Label>
          <Input
            type="date"
            value={form.startDate}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("contracts.end_date")}</Label>
          <Input
            type="date"
            value={form.endDate}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>

        {/* Buildings / Work Locations assigned to this Contract */}
        <div className="space-y-2 sm:col-span-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5 font-bold">
              <Building2 className="w-4 h-4 text-primary" />
              {t("contracts.assigned_buildings")}
            </Label>
            {isActive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 rounded-xl"
                onClick={() => setPickerOpen(true)}
              >
                <MapPin className="w-3.5 h-3.5 text-primary" />
                Add Work Locations
                <Badge variant="secondary" className="text-[10px]">
                  {form.workLocationIds.length} selected
                </Badge>
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("contracts.assigned_buildings_hint")}</p>

          {form.workLocationIds.length > 0 ? (
            <GroupedLocationBadges
              locations={workLocations.filter((l) => selectedSet.has(l.id))}
              onRemoveOne={(id) => {
                if (!isActive) return;
                setForm((f) => ({ ...f, workLocationIds: f.workLocationIds.filter((x) => x !== id) }));
              }}
              onRemoveMany={
                isActive
                  ? (ids) => {
                    const removeSet = new Set(ids);
                    setForm((f) => ({
                      ...f,
                      workLocationIds: f.workLocationIds.filter((x) => !removeSet.has(x)),
                    }));
                  }
                  : undefined
              }
            />
          ) : (
            <p className="text-xs text-muted-foreground py-1">{t("subcontractors.all_locations_allowed")}</p>
          )}

          <WorkLocationPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            locations={workLocations}
            selectedIds={form.workLocationIds}
            onChangeSelectedIds={(ids) => setForm((f) => ({ ...f, workLocationIds: ids }))}
            multiple={true}
            title="Add Work Locations"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("common.notes")}</Label>
          <Textarea
            rows={2}
            value={form.notes}
            disabled={!isActive}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>
    </PaymentDialog>
  );
}

// The register itself, shown above the certificates
export function SubcontractorsPanel({ ctx, projectId, rows, certificates }: { ctx: PaymentsContext; projectId: string; rows: SubcontractorRow[]; certificates: any[] }) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SubcontractorRow | "new" | null>(null);
  const projectName = (id: string) => ctx.projects.find((p) => p.id === id)?.name ?? "";

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/subcontractors/${id}`),
    onSuccess: () => invalidatePayments(queryClient),
    onError: (e) => toast({ title: t("errors.delete_failed"), description: errorMessage(e), variant: "destructive" }),
  });
  const canManage = ctx.perms.isAccounting || ctx.perms.canApprove;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{t("subcontractors.title")}</span>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
          {projectId !== "all" && <Button size="sm" variant="outline" className="ms-auto" onClick={() => setEditing("new")}><Plus className="w-4 h-4 me-1" /> {t("subcontractors.new_btn")}</Button>}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("subcontractors.none")}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {rows.map((s) => {
              const count = certificates.filter((c) => c.subcontractorId === s.id && c.status !== "cancelled").length;
              return (
                <li key={s.id} className="rounded-xl border px-3 py-2 text-sm flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[projectId === "all" ? projectName(s.projectId) : null, s.scope, s.taxNumber, s.phone].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs text-muted-foreground">{t("subcontractors.cert_count", { count })}</span>
                    </div>
                  </div>
                  <div className="ms-auto flex shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    {canManage && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing && (
        <SubcontractorDialog
          projectId={editing === "new" ? projectId : editing.projectId}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

export function SubcontractorContractsPanel({
  ctx,
  projectId,
  contracts,
  certificates,
}: {
  ctx: PaymentsContext;
  projectId: string;
  contracts: SubcontractorContractRow[];
  certificates: any[];
}) {
  const { t } = useTranslation("payments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SubcontractorContractRow | "new" | null>(null);
  const projectName = (id: string) => ctx.projects.find((p) => p.id === id)?.name ?? "";

  const { data: workLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "work-locations"],
    enabled: !!projectId && projectId !== "all",
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payments/subcontractor-contracts/${id}`),
    onSuccess: () => invalidatePayments(queryClient),
    onError: (e) => toast({ title: t("errors.delete_failed"), description: errorMessage(e), variant: "destructive" }),
  });
  const canManage = ctx.perms.isAccounting || ctx.perms.canApprove;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">{t("contracts.title")}</span>
          <span className="text-xs text-muted-foreground">({contracts.length})</span>
          {projectId !== "all" && (
            <Button size="sm" variant="outline" className="ms-auto" onClick={() => setEditing("new")}>
              <Plus className="w-4 h-4 me-1" /> {t("contracts.new_btn")}
            </Button>
          )}
        </div>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("contracts.none")}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {contracts.map((c) => {
              const certified = certificates
                .filter((cert) => cert.contractId === c.id && ["approved", "paid"].includes(cert.status))
                .reduce((s, cert) => s + (Number(cert.grossAmount) || 0), 0);
              const val = Number(c.contractValue || 0);
              const locIds = c.workLocationIds ?? [];
              const locSummary =
                locIds.length > 0
                  ? workLocations.length > 0
                    ? summarizeWorkLocations(workLocations, locIds)
                    : `${locIds.length} units`
                  : t("subcontractors.all_locations_allowed");

              return (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 text-sm flex flex-col gap-1.5 transition-colors",
                    c.status === "settled"
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : c.status === "terminated"
                        ? "bg-destructive/5 border-destructive/30"
                        : "bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{c.contractNo}</span>
                        <Badge
                          variant={c.status === "active" ? "default" : c.status === "settled" ? "secondary" : "destructive"}
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {c.status === "active"
                            ? t("contracts.status_active")
                            : c.status === "settled"
                              ? t("contracts.status_settled")
                              : t("contracts.status_terminated")}
                        </Badge>
                      </div>
                      <div className="font-bold truncate mt-0.5">{c.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[projectId === "all" ? projectName(c.projectId) : null, c.subcontractorName, c.scope]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(c.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      {t("contracts.contract_value")}: <b className="text-foreground tabular-nums">{money(val)}</b>
                    </span>
                    <span className="text-muted-foreground">
                      {t("contracts.certified")}: <b className="text-foreground tabular-nums">{money(certified)}</b>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                      <Building2 className="w-3 h-3 text-primary" />
                      {locSummary}
                    </Badge>
                    {c.settlementDate && (
                      <span className="text-[10px] text-muted-foreground ms-auto">
                        {t("contracts.settlement_date")}: {c.settlementDate}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing && (
        <SubcontractorContractDialog
          projectId={editing === "new" ? projectId : editing.projectId}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
