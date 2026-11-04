import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Webhook as WebhookIcon, Plus, Send, Pencil, Trash2, KeyRound, Copy, Check, RotateCw, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErpNextPanel } from "@/components/erp/erpnext-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorMessage, fmtDateTime, getJson } from "@/components/payments/payments-common";
import type { Organization } from "@shared/schema";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_INFO,
  WEBHOOK_HEADERS,
  type WebhookDeliveryDetail,
  type WebhookDeliverySummary,
  type WebhookEvent,
  type WebhookSummary,
} from "@shared/webhooks";

// Delivery logs change on their own as retries run, so they are never kept in localStorage
const liveQuery = { persist: false } as const;

const DELIVERY_TONE: Record<string, string> = {
  success: "border-green-500/40 text-green-700 dark:text-green-400",
  pending: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  failed: "border-destructive/40 text-destructive",
};

function DeliveryBadge({ status, responseStatus }: { status: string; responseStatus?: number | null }) {
  const label = status === "success" ? "Delivered" : status === "pending" ? "Retrying" : "Failed";
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", DELIVERY_TONE[status])}>
      {label}
      {responseStatus ? ` · ${responseStatus}` : ""}
    </Badge>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

const VERIFY_SNIPPET = `// Node.js / Express — check the request really came from ProjectManager Pro
const crypto = require("crypto");

app.post("/pmp-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.PMP_WEBHOOK_SECRET)
    .update(req.body)               // the raw body, exactly as received
    .digest("hex");
  const given = req.get("${WEBHOOK_HEADERS.signature}") || "";
  if (given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body);
  // ${WEBHOOK_HEADERS.delivery} is unique per delivery: use it to ignore repeats
  // payload.event = "payment_order", payload.action = "paid", payload.data = the record
  res.status(200).end();            // answer 2xx within 10 seconds, or it is retried
});`;

type FormState = { name: string; url: string; events: WebhookEvent[]; active: boolean };
const EMPTY_FORM: FormState = { name: "", url: "", events: ["payment_order", "purchase_order"], active: true };

function WebhookFormDialog({
  open,
  editing,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  editing: WebhookSummary | null;
  onClose: () => void;
  onSubmit: (form: FormState) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // Reset the fields each time the dialog opens for a different endpoint (or for a new one)
  const key = open ? editing?.id ?? "new" : null;
  if (key !== seededFor) {
    setSeededFor(key);
    if (key) setForm(editing ? { name: editing.name, url: editing.url, events: editing.events, active: editing.active } : EMPTY_FORM);
  }

  const toggle = (event: WebhookEvent, on: boolean) =>
    setForm((f) => ({ ...f, events: on ? [...f.events, event] : f.events.filter((e) => e !== event) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>
            We send a signed POST request to this URL each time one of the chosen events happens on your projects.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input id="wh-name" placeholder="ERP — production" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-webhook-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Payload URL</Label>
              <Input id="wh-url" type="url" placeholder="https://erp.example.com/pmp-webhook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} data-testid="input-webhook-url" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Events</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setForm({ ...form, events: [...WEBHOOK_EVENTS] })}>Select all</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-primary hover:underline" onClick={() => setForm({ ...form, events: [] })}>Clear</button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((event) => {
                const info = WEBHOOK_EVENT_INFO[event];
                const checked = form.events.includes(event);
                return (
                  <label
                    key={event}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={(v) => toggle(event, v === true)} className="mt-0.5" data-testid={`checkbox-event-${event}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{info.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                      <code className="text-[10px] text-muted-foreground">{event}</code>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">While off, events are not sent to this URL</p>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending || !form.name.trim() || !form.url.trim() || form.events.length === 0} data-testid="button-save-webhook">
              {pending ? "Saving…" : editing ? "Save changes" : "Add webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Signing secret</DialogTitle>
          <DialogDescription>
            Copy this into your ERP now. It is shown only once; if it is lost, generate a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs break-all" data-testid="text-webhook-secret">{secret}</code>
          {secret && <CopyButton text={secret} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Every request carries <code className="text-xs">{WEBHOOK_HEADERS.signature}: sha256=…</code>, an HMAC-SHA256 of the raw body made with this
          secret. The receiver should compute the same value and reject the request if they differ.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ deliveryId, onClose }: { deliveryId: string | null; onClose: () => void }) {
  const { data: d } = useQuery<WebhookDeliveryDetail>({
    queryKey: ["/api/webhooks/deliveries", deliveryId],
    queryFn: () => getJson(`/api/webhooks/deliveries/${deliveryId}`),
    enabled: !!deliveryId,
    meta: liveQuery,
  });
  const redeliver = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/webhooks/deliveries/${deliveryId}/redeliver`)).json() as Promise<WebhookDeliverySummary>,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: r.status === "success" ? "Redelivered" : "Redelivery failed", description: r.error ?? `HTTP ${r.responseStatus}`, variant: r.status === "success" ? "default" : "destructive" });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" }),
  });
  const payload = d ? JSON.stringify(d.payload, null, 2) : "";

  return (
    <Dialog open={!!deliveryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <code className="text-base">{d ? `${d.event}${d.action ? `.${d.action}` : ""}` : "…"}</code>
            {d && <DeliveryBadge status={d.status} responseStatus={d.responseStatus} />}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">{deliveryId}</DialogDescription>
        </DialogHeader>
        {!d ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-4 text-xs">
              <div><p className="text-muted-foreground">Created</p><p>{fmtDateTime(d.createdAt)}</p></div>
              <div><p className="text-muted-foreground">Attempts</p><p>{d.attempts}</p></div>
              <div><p className="text-muted-foreground">Duration</p><p>{d.durationMs != null ? `${d.durationMs} ms` : "—"}</p></div>
              <div><p className="text-muted-foreground">{d.status === "pending" ? "Next attempt" : "Delivered"}</p><p>{fmtDateTime(d.status === "pending" ? d.nextAttemptAt : d.deliveredAt)}</p></div>
            </div>
            {d.error && <p className="rounded-md bg-destructive/10 p-2 text-destructive text-xs">{d.error}</p>}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Payload</Label>
                <CopyButton text={payload} />
              </div>
              <pre className="rounded-md border bg-muted p-3 text-xs overflow-x-auto max-h-80" dir="ltr">{payload}</pre>
            </div>
            <div className="space-y-1.5">
              <Label>Response {d.responseStatus ? `(HTTP ${d.responseStatus})` : ""}</Label>
              <pre className="rounded-md border bg-muted p-3 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap" dir="ltr">{d.responseBody || "No response body"}</pre>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => redeliver.mutate()} disabled={!d || redeliver.isPending} data-testid="button-redeliver">
            <RotateCw className={cn("w-4 h-4 mr-1.5", redeliver.isPending && "animate-spin")} /> Redeliver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesTable({ webhookId, onOpen }: { webhookId: string; onOpen: (id: string) => void }) {
  const { data: deliveries, isLoading } = useQuery<WebhookDeliverySummary[]>({
    queryKey: ["/api/webhooks", webhookId, "deliveries"],
    queryFn: () => getJson(`/api/webhooks/${webhookId}/deliveries`),
    refetchInterval: 15_000,
    meta: liveQuery,
  });
  if (isLoading) return <Skeleton className="h-24" />;
  if (!deliveries?.length) return <p className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</p>;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Attempts</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((d) => (
            <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpen(d.id)} data-testid={`row-delivery-${d.id}`}>
              <TableCell><code className="text-xs">{d.event}{d.action ? `.${d.action}` : ""}</code></TableCell>
              <TableCell><DeliveryBadge status={d.status} responseStatus={d.responseStatus} /></TableCell>
              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{d.attempts}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(d.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function WebhooksPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "super_admin" || user?.role === "developer_admin";
  const canManage = isSystemAdmin || user?.role === "org_admin";
  const [orgId, setOrgId] = useState<string | null>(user?.organizationId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookSummary | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WebhookSummary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [tab, setTab] = useState("outgoing");

  const { data: organizations = [] } = useQuery<Organization[]>({ queryKey: ["/api/organizations"], enabled: isSystemAdmin });
  const orgQuery = orgId && orgId !== user?.organizationId ? `?organizationId=${encodeURIComponent(orgId)}` : "";

  const { data: hooks, isLoading } = useQuery<WebhookSummary[]>({
    queryKey: ["/api/webhooks", { org: orgId }],
    queryFn: () => getJson(`/api/webhooks${orgQuery}`),
    enabled: canManage && !!orgId,
    meta: liveQuery,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
  const onError = (e: unknown) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" });

  const save = useMutation({
    mutationFn: async (form: FormState) => {
      const res = editing
        ? await apiRequest("PATCH", `/api/webhooks/${editing.id}`, form)
        : await apiRequest("POST", `/api/webhooks${orgQuery}`, form);
      return res.json() as Promise<WebhookSummary & { secret?: string }>;
    },
    onSuccess: (r) => {
      refresh();
      setFormOpen(false);
      setEditing(null);
      if (r.secret) {
        setSecret(r.secret);
        setExpanded(r.id);
        const ok = r.lastDelivery?.status === "success";
        toast({
          title: ok ? "Webhook added — test ping delivered" : "Webhook added",
          description: ok ? undefined : "The test ping did not get a 2xx answer yet; check Recent deliveries.",
        });
      } else {
        toast({ title: "Webhook saved" });
      }
    },
    onError,
  });

  const toggleActive = useMutation({
    mutationFn: (w: WebhookSummary) => apiRequest("PATCH", `/api/webhooks/${w.id}`, { active: !w.active }),
    onSuccess: refresh,
    onError,
  });

  const ping = useMutation({
    mutationFn: async (w: WebhookSummary) => (await apiRequest("POST", `/api/webhooks/${w.id}/ping`)).json() as Promise<WebhookDeliverySummary>,
    onSuccess: (r, w) => {
      refresh();
      setExpanded(w.id);
      toast({
        title: r.status === "success" ? "Ping delivered" : "Ping failed",
        description: r.status === "success" ? `HTTP ${r.responseStatus} in ${r.durationMs} ms` : r.error ?? undefined,
        variant: r.status === "success" ? "default" : "destructive",
      });
    },
    onError,
  });

  const rotate = useMutation({
    mutationFn: async (w: WebhookSummary) => (await apiRequest("POST", `/api/webhooks/${w.id}/rotate-secret`)).json() as Promise<{ secret: string }>,
    onSuccess: (r) => setSecret(r.secret),
    onError,
  });

  const remove = useMutation({
    mutationFn: (w: WebhookSummary) => apiRequest("DELETE", `/api/webhooks/${w.id}`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast({ title: "Webhook deleted" });
    },
    onError,
  });

  if (!canManage) {
    return (
      <div className="p-6 lg:p-8">
        <Card><CardContent className="p-10 text-center text-muted-foreground">Only an organization's administrator can manage webhooks.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">ERP integration</h1>
          <p className="text-muted-foreground">Send events to your ERP, and receive suppliers and payments from ERPNext</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSystemAdmin && (
            <Select value={orgId ?? undefined} onValueChange={setOrgId}>
              <SelectTrigger className="w-[220px]" data-testid="select-webhook-org">
                <SelectValue placeholder="Choose an organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!orgId ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Choose an organization to manage its ERP integration.</CardContent></Card>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="outgoing" data-testid="tab-outgoing">Outgoing webhooks</TabsTrigger>
          <TabsTrigger value="erpnext" data-testid="tab-erpnext">ERPNext (incoming)</TabsTrigger>
        </TabsList>
        <TabsContent value="erpnext" className="mt-6">
          <ErpNextPanel orgId={orgId} orgQuery={orgQuery} />
        </TabsContent>
        <TabsContent value="outgoing" className="mt-6 space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="button-new-webhook">
          <Plus className="w-4 h-4 mr-2" /> Add webhook
        </Button>
      </div>

      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowGuide((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5" /> How deliveries work
            {showGuide ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
          </CardTitle>
          <CardDescription>Headers, signature check and retries, for whoever sets up the ERP side</CardDescription>
        </CardHeader>
        {showGuide && (
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Each event is a <code className="text-xs">POST</code> with a JSON body: <code className="text-xs">event</code>, <code className="text-xs">action</code>, <code className="text-xs">project</code>, <code className="text-xs">actor</code>, <code className="text-xs">change</code> and the record itself in <code className="text-xs">data</code>.</li>
              <li><code className="text-xs">{WEBHOOK_HEADERS.event}</code> names the event type, <code className="text-xs">{WEBHOOK_HEADERS.delivery}</code> is a unique id per delivery, and <code className="text-xs">{WEBHOOK_HEADERS.signature}</code> is the HMAC-SHA256 signature.</li>
              <li>Answer with any 2xx status within 10 seconds. Anything else is retried after 1 min, 5 min, 30 min, 2 h, 6 h and 12 h, then marked failed. Failed deliveries can be sent again from the log.</li>
              <li>Events cover the projects your organization owns or is the contractor on.</li>
            </ul>
            <div className="flex justify-end"><CopyButton text={VERIFY_SNIPPET} label="Copy example" /></div>
            <pre className="rounded-md border bg-muted p-3 text-xs overflow-x-auto" dir="ltr">{VERIFY_SNIPPET}</pre>
          </CardContent>
        )}
      </Card>

      {isLoading ? (
        <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !orgId ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Choose an organization to see its webhooks.</CardContent></Card>
      ) : !hooks?.length ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto max-w-sm space-y-3">
              <WebhookIcon className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium">No webhooks yet</p>
              <p className="text-sm text-muted-foreground">Add your ERP's URL to start receiving payment orders, purchase orders and stock movements as they happen.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {hooks.map((w) => {
            const open = expanded === w.id;
            return (
              <Card key={w.id} className={cn(!w.active && "opacity-75")} data-testid={`card-webhook-${w.id}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{w.name}</p>
                        {!w.active && <Badge variant="secondary" className="text-[11px]">Paused</Badge>}
                        {w.lastDelivery && <DeliveryBadge status={w.lastDelivery.status} responseStatus={w.lastDelivery.responseStatus} />}
                      </div>
                      <p className="text-sm text-muted-foreground font-mono break-all" dir="ltr">{w.url}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {w.events.map((e) => <Badge key={e} variant="outline" className="text-[10px] font-mono">{e}</Badge>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Switch checked={w.active} onCheckedChange={() => toggleActive.mutate(w)} aria-label="Active" />
                      <Button variant="outline" size="sm" onClick={() => ping.mutate(w)} disabled={ping.isPending} data-testid={`button-ping-${w.id}`}>
                        <Send className="w-4 h-4 mr-1.5" /> Test
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(w); setFormOpen(true); }} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => rotate.mutate(w)} disabled={rotate.isPending} aria-label="New secret" title="Generate a new secret"><KeyRound className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(w)} aria-label="Delete"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <button type="button" className="flex items-center gap-1 text-sm font-medium text-primary" onClick={() => setExpanded(open ? null : w.id)}>
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Recent deliveries
                  </button>
                  {open && <DeliveriesTable webhookId={w.id} onOpen={setDeliveryId} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>
      </Tabs>
      )}

      <WebhookFormDialog
        open={formOpen}
        editing={editing}
        pending={save.isPending}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(form) => save.mutate(form)}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <DeliveryDialog deliveryId={deliveryId} onClose={() => setDeliveryId(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Events stop going to this URL and its delivery log is deleted with it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
