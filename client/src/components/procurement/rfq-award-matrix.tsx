import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, Lock, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface OrderedItem {
  rfqItemId: string;
  poId: string;
  poNumber: string;
  supplierName: string;
}

interface Props {
  rfq: any;
  quotations: any[];
  orderedItems: OrderedItem[];
  projectId: string;
  onCreated: (pos: any[]) => void;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RfqAwardMatrix({ rfq, quotations, orderedItems, projectId, onCreated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // rfqItemId -> quotationId chosen for that item
  const [selection, setSelection] = useState<Record<string, string>>({});

  const orderedMap = useMemo(() => {
    const m = new Map<string, OrderedItem>();
    orderedItems.forEach((o) => m.set(o.rfqItemId, o));
    return m;
  }, [orderedItems]);

  const priceOf = (quote: any, itemId: string) => {
    const qi = quote.items?.find((x: any) => x.rfqItemId === itemId);
    const unitPrice = Number(qi?.unitPrice || 0);
    return qi && unitPrice > 0 ? { qi, unitPrice } : null;
  };

  // Per item: cheapest quotation(s). More than one winner means a tie the user must resolve.
  const cheapest = useMemo(() => {
    const out: Record<string, { min: number; quoteIds: string[] }> = {};
    (rfq.items || []).forEach((item: any) => {
      let min = Infinity;
      let ids: string[] = [];
      quotations.forEach((q) => {
        const p = priceOf(q, item.id);
        if (!p) return;
        if (p.unitPrice < min) {
          min = p.unitPrice;
          ids = [q.id];
        } else if (p.unitPrice === min) {
          ids.push(q.id);
        }
      });
      if (ids.length) out[item.id] = { min, quoteIds: ids };
    });
    return out;
  }, [rfq, quotations]);

  // Pre-select the cheapest supplier for every open item that has a single winner.
  useEffect(() => {
    setSelection((prev) => {
      const next = { ...prev };
      (rfq.items || []).forEach((item: any) => {
        if (orderedMap.has(item.id) || next[item.id]) return;
        const c = cheapest[item.id];
        if (c && c.quoteIds.length === 1) next[item.id] = c.quoteIds[0];
      });
      return next;
    });
  }, [rfq, cheapest, orderedMap]);

  const openItems = (rfq.items || []).filter((i: any) => !orderedMap.has(i.id));
  const selectedOpen = openItems.filter((i: any) => selection[i.id]);
  const unassigned = openItems.filter((i: any) => !selection[i.id]);

  const bySupplier = useMemo(() => {
    const groups = new Map<string, { quote: any; count: number; total: number }>();
    selectedOpen.forEach((item: any) => {
      const quote = quotations.find((q) => q.id === selection[item.id]);
      const p = quote && priceOf(quote, item.id);
      if (!quote || !p) return;
      const g = groups.get(quote.id) || { quote, count: 0, total: 0 };
      g.count += 1;
      g.total += Number(p.qi.totalPrice || p.unitPrice * Number(p.qi.quantity));
      groups.set(quote.id, g);
    });
    return Array.from(groups.values());
  }, [selectedOpen, selection, quotations]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const assignments = selectedOpen.map((i: any) => ({ rfqItemId: i.id, quotationId: selection[i.id] }));
      const res = await apiRequest("POST", `/api/rfqs/${rfq.id}/create-purchase-orders`, { assignments });
      return (await res.json()) as any[];
    },
    onSuccess: (pos) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "ordered-items"] });
      toast({
        title: "Draft purchase orders created",
        description: pos.map((p) => `${p.poNumber} (${p.supplierName})`).join(", "),
      });
      setSelection({});
      onCreated(pos);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message || "Failed to create purchase orders", variant: "destructive" }),
  });

  if (quotations.length === 0) {
    return (
      <div className="text-center p-12 border border-dashed rounded-2xl text-muted-foreground text-sm">
        No quotations yet. Add supplier quotations first, then compare and award per item.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-2xl bg-card">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="p-3 text-left font-bold min-w-[220px]">Item</th>
              <th className="p-3 text-left font-bold w-24">Qty</th>
              {quotations.map((q) => (
                <th key={q.id} className="p-3 min-w-[170px] text-center border-l">
                  <div className="font-bold text-sm">{q.supplierName}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">{q.quotationNumber || "No number"}</div>
                  <div className="text-[10px] text-muted-foreground font-normal flex items-center justify-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {q.leadTimeDays ? `${q.leadTimeDays} days` : "Lead time n/a"}
                  </div>
                </th>
              ))}
              <th className="p-3 text-left font-bold min-w-[150px] border-l">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(rfq.items || []).map((item: any, idx: number) => {
              const ordered = orderedMap.get(item.id);
              const c = cheapest[item.id];
              const tie = c && c.quoteIds.length > 1;
              return (
                <tr key={item.id} className={cn(ordered && "bg-muted/30")}>
                  <td className="p-3">
                    <div className="font-bold">
                      {idx + 1}. {item.itemName || item.itemDescription}
                    </div>
                    {item.itemName && item.itemDescription && (
                      <div className="text-xs font-normal text-muted-foreground">{item.itemDescription}</div>
                    )}
                  </td>
                  <td className="p-3 font-semibold text-muted-foreground whitespace-nowrap">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  {quotations.map((q) => {
                    const p = priceOf(q, item.id);
                    const isLowest = !!p && !!c && p.unitPrice === c.min;
                    const isSelected = selection[item.id] === q.id;
                    const short = p && Number(p.qi.quantity) < Number(item.quantity);
                    return (
                      <td key={q.id} className="p-1.5 border-l text-center">
                        {p ? (
                          <button
                            type="button"
                            disabled={!!ordered}
                            onClick={() => setSelection((s) => ({ ...s, [item.id]: q.id }))}
                            className={cn(
                              "w-full rounded-xl border px-2 py-2 transition-colors",
                              ordered ? "cursor-default opacity-70" : "hover:border-primary/60",
                              isSelected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-transparent",
                              !isSelected && isLowest && !ordered && "bg-emerald-50 dark:bg-emerald-950/20"
                            )}
                          >
                            <div className="flex items-center justify-center gap-1 font-bold">
                              {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                              {money(p.unitPrice)}
                              {isLowest && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-emerald-100 text-emerald-700">
                                  Lowest
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Total {money(Number(p.qi.totalPrice || 0))}
                            </div>
                            {short && (
                              <div className="text-[10px] text-amber-600 flex items-center justify-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Offers {Number(p.qi.quantity)} of {Number(item.quantity)}
                              </div>
                            )}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 border-l">
                    {ordered ? (
                      <div className="space-y-0.5">
                        <Badge className="bg-emerald-600 text-white gap-1 text-[10px]">
                          <Lock className="w-3 h-3" /> {ordered.poNumber}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground">{ordered.supplierName}</div>
                      </div>
                    ) : !c ? (
                      <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">
                        No quotes
                      </Badge>
                    ) : tie && !selection[item.id] ? (
                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                        Tie — choose supplier
                      </Badge>
                    ) : selection[item.id] ? (
                      <span className="text-[11px] font-medium">
                        {quotations.find((q) => q.id === selection[item.id])?.supplierName}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Not selected
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30 font-semibold">
              <td className="p-3" colSpan={2}>
                Quotation total (incl. tax & discount)
              </td>
              {quotations.map((q) => (
                <td key={q.id} className="p-3 text-center border-l font-mono">
                  {money(Number(q.totalAmount || 0))} {q.currency}
                </td>
              ))}
              <td className="border-l" />
            </tr>
          </tbody>
        </table>
      </div>

      {openItems.length === 0 ? (
        <div className="p-4 border rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-sm text-emerald-700 font-medium">
          All items already have purchase orders.
        </div>
      ) : (
        <div className="border rounded-2xl p-4 bg-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm">
                {selectedOpen.length} of {openItems.length} open items assigned to {bySupplier.length} supplier
                {bySupplier.length === 1 ? "" : "s"}
              </p>
              {unassigned.length > 0 && (
                <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {unassigned.length} item{unassigned.length === 1 ? "" : "s"} will remain without a PO
                </p>
              )}
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={selectedOpen.length === 0 || createMutation.isPending}
              className="gap-1.5"
            >
              <ShoppingCart className="w-4 h-4" />
              Create {bySupplier.length} draft PO{bySupplier.length === 1 ? "" : "s"}
            </Button>
          </div>
          {bySupplier.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {bySupplier.map((g) => (
                <div key={g.quote.id} className="border rounded-xl p-3 text-xs">
                  <p className="font-bold text-sm">{g.quote.supplierName}</p>
                  <p className="text-muted-foreground">
                    {g.count} item{g.count === 1 ? "" : "s"}
                  </p>
                  <p className="font-mono font-bold mt-1">
                    {money(g.total)} {g.quote.currency}
                    <span className="text-[10px] text-muted-foreground font-normal"> before tax</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
