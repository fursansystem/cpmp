import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plug, RefreshCw, FileText, KeyRound, Copy, Check, Trash2, ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { errorMessage, fmtDateTime, getJson, money } from "@/components/payments/payments-common";
import {
  FRAPPE_SIGNATURE_HEADER,
  PAYMENT_ORDER_FIELD,
  type ErpConnectionSummary,
  type ErpInboundEntry,
  type ErpStatement,
  type ErpSupplierEntry,
} from "@shared/erp";

const liveQuery = { persist: false } as const;

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
    >
      {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all" dir="ltr">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  applied: "border-green-500/40 text-green-700 dark:text-green-400",
  ignored: "border-muted-foreground/30 text-muted-foreground",
  rejected: "border-destructive/40 text-destructive",
};

const BODY_TEMPLATE = "{{ doc.as_json() }}";

function SetupGuide({ conn }: { conn: ErpConnectionSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="w-5 h-5" /> Set up ERPNext · خطوات الإعداد في ERPNext
          {open ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
        </CardTitle>
        <CardDescription>Two webhooks in ERPNext send supplier and payment changes here</CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
          <CopyRow label="Request URL (for both webhooks)" value={conn.inboundUrl} />
          <CopyRow label="JSON Request Body (for both webhooks)" value={BODY_TEMPLATE} />
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>In ERPNext open <b>Integrations → Webhook → New</b>.</li>
            <li>
              Webhook 1: <b>DocType</b> = <code className="text-xs">Supplier</code>, <b>Doc Event</b> = <code className="text-xs">after_insert</code>.
              Then make a copy with <code className="text-xs">on_update</code>.
            </li>
            <li>
              Webhook 2: <b>DocType</b> = <code className="text-xs">Payment Entry</code>, <b>Doc Event</b> = <code className="text-xs">on_submit</code>
              {" "}(optionally another for <code className="text-xs">on_cancel</code>, which is logged only).
            </li>
            <li>For each: <b>Request Method</b> POST, <b>Request Structure</b> JSON, paste the Request URL and JSON Request Body above.</li>
            <li>
              Tick <b>Enable Security</b> and paste the webhook secret (shown when you connected, or make a new one with the key button). ERPNext then signs every
              request in <code className="text-xs">{FRAPPE_SIGNATURE_HEADER}</code>; unsigned requests are refused.
            </li>
            <li>
              For payments: add a <b>Data</b> custom field <code className="text-xs">{PAYMENT_ORDER_FIELD}</code> to Payment Entry (Customize Form) and fill it
              with the payment order's id (the <code className="text-xs">data.id</code> of our <code className="text-xs">payment_order</code> webhook). A submitted
              Payment Entry of type <b>Pay</b> then marks that order paid, but only if it is already approved here and the amount matches.
            </li>
            <li>
              For statements and the first supplier sync: in ERPNext create an <b>API key and secret</b> for a user who can read Suppliers and the General Ledger,
              and save them on the connection below with the <b>Company</b> name.
            </li>
          </ol>
        </CardContent>
      )}
    </Card>
  );
}

function StatementDialog({ supplier, orgQuery, onClose }: { supplier: ErpSupplierEntry | null; orgQuery: string; onClose: () => void }) {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const params = supplier ? `supplier=${encodeURIComponent(supplier.erpName)}&from=${from}&to=${to}` : "";
  const { data, isFetching, error } = useQuery<ErpStatement>({
    queryKey: ["/api/erp/statement", orgQuery, params],
    queryFn: () => getJson(`/api/erp/statement${orgQuery ? `${orgQuery}&` : "?"}${params}`),
    enabled: !!supplier && !!from && !!to,
    meta: liveQuery,
  });

  return (
    <Dialog open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>كشف حساب · {supplier?.supplierName}</DialogTitle>
          <DialogDescription>From ERPNext's General Ledger{data ? ` · ${data.company}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" /></div>
          <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" /></div>
          {isFetching && <span className="text-sm text-muted-foreground pb-2">Loading from ERPNext…</span>}
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorMessage(error)}</p>
        ) : !data ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-sm">
              {[
                ["Opening", data.opening],
                ["Debit", data.totalDebit],
                ["Credit", data.totalCredit],
                ["Closing", data.closing],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{l}</p>
                  <p className="font-semibold tabular-nums">{money(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No entries in this period</TableCell></TableRow>
                  ) : data.entries.map((e, i) => (
                    <TableRow key={`${e.voucherNo}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs">{e.date}</TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{e.voucherNo}</p>
                        <p className="text-[11px] text-muted-foreground">{e.voucherType}{e.remarks ? ` · ${e.remarks}` : ""}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{e.debit ? money(e.debit) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{e.credit ? money(e.credit) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{money(e.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ErpNextPanel({ orgId, orgQuery }: { orgId: string; orgQuery: string }) {
  const [form, setForm] = useState({ baseUrl: "", company: "", apiKey: "", apiSecret: "" });
  const [seeded, setSeeded] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<ErpSupplierEntry | null>(null);

  const { data: conn, isLoading } = useQuery<ErpConnectionSummary | null>({
    queryKey: ["/api/erp/connection", { org: orgId }],
    queryFn: () => getJson(`/api/erp/connection${orgQuery}`),
    meta: liveQuery,
  });
  // Fill the form from the saved connection once per organization
  const seedKey = isLoading ? null : `${orgId}:${conn?.id ?? "none"}`;
  if (seedKey && seedKey !== seeded) {
    setSeeded(seedKey);
    setForm({ baseUrl: conn?.baseUrl ?? "", company: conn?.company ?? "", apiKey: "", apiSecret: "" });
  }

  const { data: log } = useQuery<ErpInboundEntry[]>({
    queryKey: ["/api/erp/inbound-log", { org: orgId }],
    queryFn: () => getJson(`/api/erp/inbound-log${orgQuery}`),
    enabled: !!conn,
    refetchInterval: 15_000,
    meta: liveQuery,
  });
  const { data: erpSuppliers } = useQuery<ErpSupplierEntry[]>({
    queryKey: ["/api/erp/suppliers", { org: orgId }],
    queryFn: () => getJson(`/api/erp/suppliers${orgQuery}`),
    enabled: !!conn,
    meta: liveQuery,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/erp/connection"] });
    queryClient.invalidateQueries({ queryKey: ["/api/erp/suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/erp/inbound-log"] });
  };
  const onError = (e: unknown) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" });

  const save = useMutation({
    mutationFn: async (active?: boolean) => {
      const body = {
        baseUrl: form.baseUrl,
        company: form.company || null,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        ...(form.apiSecret ? { apiSecret: form.apiSecret } : {}),
        ...(active !== undefined ? { active } : {}),
      };
      return (await apiRequest("PUT", `/api/erp/connection${orgQuery}`, body)).json() as Promise<ErpConnectionSummary & { webhookSecret?: string }>;
    },
    onSuccess: (r) => {
      refresh();
      setForm((f) => ({ ...f, apiKey: "", apiSecret: "" }));
      if (r.webhookSecret) setSecret(r.webhookSecret);
      toast({ title: r.webhookSecret ? "ERPNext connected" : "Connection saved" });
    },
    onError,
  });

  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/erp/connection/test${orgQuery}`)).json() as Promise<{ user: string | null }>,
    onSuccess: (r) => toast({ title: "ERPNext answered", description: r.user ? `Signed in as ${r.user}` : undefined }),
    onError,
  });
  const rotate = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/erp/connection/rotate-secret${orgQuery}`)).json() as Promise<{ webhookSecret: string }>,
    onSuccess: (r) => setSecret(r.webhookSecret),
    onError,
  });
  const disconnect = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/erp/connection${orgQuery}`),
    onSuccess: () => { refresh(); toast({ title: "ERPNext disconnected" }); },
    onError,
  });
  const sync = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/erp/suppliers/sync${orgQuery}`)).json() as Promise<{ suppliers: number; projectSuppliersUpdated: number }>,
    onSuccess: (r) => { refresh(); toast({ title: `${r.suppliers} suppliers synced`, description: `${r.projectSuppliersUpdated} project supplier(s) updated` }); },
    onError,
  });

  if (isLoading) return <Skeleton className="h-60" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="w-5 h-5" /> ERPNext connection
            {conn && <Badge variant="outline" className={cn("text-[11px]", conn.active ? STATUS_TONE.applied : STATUS_TONE.ignored)}>{conn.active ? "Connected" : "Paused"}</Badge>}
          </CardTitle>
          <CardDescription>Receive suppliers and payment confirmations from ERPNext, and view supplier statements</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="erp-url">ERPNext address</Label>
                <Input id="erp-url" dir="ltr" placeholder="https://erp.example.com" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} data-testid="input-erp-url" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="erp-company">Company (as named in ERPNext)</Label>
                <Input id="erp-company" placeholder="Fursan Al-Nama" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="input-erp-company" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="erp-key">API key</Label>
                <Input id="erp-key" dir="ltr" placeholder={conn?.hasApiKey ? "Saved — leave empty to keep" : ""} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="erp-secret">API secret</Label>
                <Input id="erp-secret" dir="ltr" type="password" placeholder={conn?.hasApiKey ? "Saved — leave empty to keep" : ""} value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} autoComplete="new-password" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={save.isPending || !form.baseUrl.trim()} data-testid="button-save-erp">
                {save.isPending ? "Saving…" : conn ? "Save" : "Connect"}
              </Button>
              {conn && (
                <>
                  <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !conn.hasApiKey}>
                    <RefreshCw className={cn("w-4 h-4 mr-1.5", test.isPending && "animate-spin")} /> Test connection
                  </Button>
                  <Button type="button" variant="outline" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
                    <KeyRound className="w-4 h-4 mr-1.5" /> New webhook secret
                  </Button>
                  <div className="flex items-center gap-2 ml-auto">
                    <Label className="text-sm">Active</Label>
                    <Switch checked={conn.active} onCheckedChange={(v) => save.mutate(v)} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Disconnect" onClick={() => confirm("Disconnect ERPNext? Incoming requests will be refused.") && disconnect.mutate()}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {conn && <SetupGuide conn={conn} />}

      {conn && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">الموردون · Suppliers from ERPNext</CardTitle>
              <CardDescription>Project suppliers with the same tax number are linked and kept up to date</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending || !conn.hasApiKey} data-testid="button-sync-suppliers">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", sync.isPending && "animate-spin")} /> Sync now
            </Button>
          </CardHeader>
          <CardContent>
            {!erpSuppliers?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No suppliers yet. Use “Sync now”, or they arrive as they change in ERPNext.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="hidden sm:table-cell">Tax number</TableHead>
                      <TableHead className="hidden md:table-cell">Linked</TableHead>
                      <TableHead className="text-right">Statement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {erpSuppliers.map((s) => (
                      <TableRow key={s.erpName}>
                        <TableCell>
                          <p className="text-sm font-medium">{s.supplierName} {s.disabled && <Badge variant="secondary" className="text-[10px] ml-1">Disabled</Badge>}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{s.erpName}</p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs font-mono">{s.taxId ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs">{s.linkedProjectSuppliers ? `${s.linkedProjectSuppliers} project(s)` : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setStatementFor(s)} disabled={!conn.hasApiKey || !conn.company}>
                            <FileText className="w-4 h-4 mr-1.5" /> كشف حساب
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {conn && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received from ERPNext</CardTitle>
            <CardDescription>Every request ERPNext sent, and what was done with it</CardDescription>
          </CardHeader>
          <CardContent>
            {!log?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nothing received yet</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <p className="text-xs font-medium">{l.doctype ?? "—"}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{l.docName}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px]", STATUS_TONE[l.status])}>{l.status}</Badge>
                          <p className="text-[11px] text-muted-foreground mt-1">{l.message}</p>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(l.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Webhook secret for ERPNext</DialogTitle>
            <DialogDescription>Paste this into the “Webhook Secret” of both ERPNext webhooks. It is shown only once.</DialogDescription>
          </DialogHeader>
          {secret && <CopyRow label="Webhook Secret" value={secret} />}
          <DialogFooter><Button onClick={() => setSecret(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <StatementDialog supplier={statementFor} orgQuery={orgQuery} onClose={() => setStatementFor(null)} />
    </div>
  );
}
