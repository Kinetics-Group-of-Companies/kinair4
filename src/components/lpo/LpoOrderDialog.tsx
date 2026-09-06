import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, X } from 'lucide-react';
import {
  MATERIAL_TYPES,
  ORDER_STATUSES,
  PRIORITIES,
  baselineCommittedDate,
  supplierEstimatedWindow,
  estimatedCommittedWindow,
  SENT_STATUSES,
  formatDate,
  formatDateWindow,
  type LpoOrder,
  type LpoSupplier,
} from '@/lib/lpoTracker';
import { useLpoOrders, type LpoOrderInput } from '@/hooks/useLpoOrders';
import { toast } from '@/hooks/use-toast';
import { useLpoContacts } from '@/hooks/useLpoContacts';
import { useAuth } from '@/lib/authContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: LpoOrder | null;
}

type FormState = Record<string, string>;

const EMPTY: FormState = {
  lpo_ref: '',
  lpo_date: '',
  lpo_received_date: '',
  revised_lpo_ref: '',
  revised_lpo_date: '',
  revised_lpo_received_date: '',
  revision_no: '0',
  client_name: '',
  project_name: '',
  committed_delivery_date: '',
  committed_delivery_date_min: '',
  quantity: '1',
  order_value: '',
  currency: 'AED',
  lead_time_weeks_min: '',
  lead_time_weeks_max: '',
  advance_payment_date: '',
  manufacturing_clearance_date: '',
  expected_delivery_date: '',
  priority: 'normal',
  status: 'new',
  actual_delivery_date: '',
  order_ack_sent_date: '',
  order_ack_status: 'not_sent',
  pi_sent_date: '',
  pi_status: 'not_sent',
  delay_reason: '',
  notes: '',
};

const text = (v: string) => (v.trim() === '' ? null : v.trim());
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const int = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)));

const EMPTY_SUPPLIER: LpoSupplier = {
  name: '',
  po_date: '',
  clearance_date: '',
  advance_payment_date: '',
  lead_time_weeks_min: null,
  lead_time_weeks_max: null,
  expected_delivery_date: '',
  confirmed_delivery_date_min: '',
  confirmed_delivery_date_max: '',
};

export function LpoOrderDialog({ open, onOpenChange, order }: Props) {
  const { user } = useAuth();
  const { orders, createOrder, updateOrder, upsertDraft } = useLpoOrders();
  const { customers, suppliers: supplierBook, saveContact } = useLpoContacts();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [materials, setMaterials] = useState<string[]>(['FAN']);
  const [customMaterial, setCustomMaterial] = useState('');
  const [suppliers, setSuppliers] = useState<LpoSupplier[]>([]);
  type DateMode = 'both' | 'max';
  const [contractorMode, setContractorMode] = useState<DateMode>('both');
  const [supplierModes, setSupplierModes] = useState<DateMode[]>([]);

  const knownClients = useMemo(
    () => Array.from(new Set([
      ...customers.map((c) => c.name),
      ...orders.map((o) => o.client_name),
    ].filter(Boolean))).sort(),
    [orders, customers],
  );
  const knownSuppliers = useMemo(() => {
    const all = [
      ...supplierBook.map((c) => c.name),
      ...orders.flatMap((o) => [o.supplier_name ?? '', ...(o.suppliers ?? []).map((s) => s.name)]),
    ];
    return Array.from(new Set(all.filter(Boolean))).sort();
  }, [orders, supplierBook]);
  const knownMaterials = useMemo(() => {
    const all = orders.flatMap((o) => (o.material_types?.length ? o.material_types : [o.material_type]));
    return Array.from(new Set([...MATERIAL_TYPES, ...all.filter(Boolean)]));
  }, [orders]);

  useEffect(() => {
    if (!open) return;
    if (order) {
      const next: FormState = { ...EMPTY };
      Object.keys(EMPTY).forEach((k) => {
        const v = (order as unknown as Record<string, unknown>)[k];
        next[k] = v === null || v === undefined ? '' : String(v);
      });
      if (!next.lpo_date) next.lpo_date = order.lpo_received_date ?? '';
      setForm(next);
      setMaterials(order.material_types?.length ? order.material_types : order.material_type ? [order.material_type] : []);
      const nextSuppliers =
        (order.suppliers ?? []).length > 0
          ? (order.suppliers as LpoSupplier[])
          : order.supplier_name
            ? [{
                name: order.supplier_name,
                po_date: order.supplier_po_date ?? '',
                advance_payment_date: order.supplier_advance_payment_date ?? '',
                expected_delivery_date: order.expected_delivery_date ?? '',
              }]
            : [];
      setSuppliers(nextSuppliers);
      const modeOf = (min?: string | null, max?: string | null): DateMode =>
        min && max && min !== max ? 'both' : 'max';
      setContractorMode(modeOf(order.committed_delivery_date_min, order.committed_delivery_date));
      setSupplierModes(nextSuppliers.map((s) => modeOf(s.confirmed_delivery_date_min, s.confirmed_delivery_date_max ?? s.expected_delivery_date)));
    } else {
      setForm({ ...EMPTY });
      setMaterials(['FAN']);
      setSuppliers([]);
      setContractorMode('both');
      setSupplierModes([]);
    }
    setCustomMaterial('');
    setMissing([]);
  }, [open, order, user?.email]);

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Warn when the same LPO ref is already punched for the same contractor
  const duplicate = useMemo(() => {
    const ref = form.lpo_ref.trim().toLowerCase();
    const client = form.client_name.trim().toLowerCase();
    if (!ref || !client) return null;
    return (
      orders.find(
        (o) =>
          o.id !== order?.id &&
          !o.is_draft &&
          o.lpo_ref.trim().toLowerCase() === ref &&
          o.client_name.trim().toLowerCase() === client,
      ) ?? null
    );
  }, [orders, form.lpo_ref, form.client_name, order?.id]);

  const toggleMaterial = (m: string) =>
    setMaterials((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));

  const addCustomMaterial = () => {
    const v = customMaterial.trim().toUpperCase();
    if (!v) return;
    setMaterials((list) => (list.includes(v) ? list : [...list, v]));
    setCustomMaterial('');
  };

  const updateSupplier = (i: number, patch: Partial<LpoSupplier>) =>
    setSuppliers((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const draftBusyRef = useRef(false);
  const publishingRef = useRef(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);

  /** Never let a stalled request leave the form stuck on "Saving…". */
  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('The server did not respond. Check your connection and try again.')), ms),
      ),
    ]);

  const buildPayload = (forDraft: boolean) => {
    const cleanSuppliers = suppliers
      .filter((s) => s.name.trim() !== '')
      .map((s, i) => {
        const mode = supplierModes[i] ?? 'both';
        const rawMin = text(s.confirmed_delivery_date_min ?? '');
        const rawMax = text(s.confirmed_delivery_date_max ?? s.expected_delivery_date ?? '');
        const cMin = mode === 'max' ? null : rawMin ?? rawMax;
        const cMax = rawMax ?? rawMin;
        return {
          name: s.name.trim(),
          po_date: text(s.po_date ?? ''),
          clearance_date: text(s.clearance_date ?? ''),
          advance_payment_date: text(s.advance_payment_date ?? ''),
          lead_time_weeks_min: mode === 'max' ? null : s.lead_time_weeks_min ?? null,
          lead_time_weeks_max: s.lead_time_weeks_max ?? s.lead_time_weeks_min ?? null,
          expected_delivery_date: cMax,
          confirmed_delivery_date_min: cMin,
          confirmed_delivery_date_max: cMax,
        };
      });

    const contractorMin = contractorMode === 'max' ? null : text(form.committed_delivery_date_min) ?? text(form.committed_delivery_date);
    const contractorMax = text(form.committed_delivery_date) ?? text(form.committed_delivery_date_min);

    return {
      lpo_ref: form.lpo_ref.trim() || (forDraft ? 'DRAFT' : ''),
      client_name: form.client_name.trim() || (forDraft ? 'New order (draft)' : ''),
      project_name: text(form.project_name),
      material_type: materials[0] ?? 'OTHER',
      material_types: materials,
      quantity: int(form.quantity) ?? 1,
      order_value: num(form.order_value),
      currency: form.currency.trim() || 'AED',
      lead_time_weeks_min: contractorMode === 'max' ? null : int(form.lead_time_weeks_min),
      lead_time_weeks_max: int(form.lead_time_weeks_max) ?? int(form.lead_time_weeks_min),
      lpo_date: text(form.lpo_date),
      lpo_received_date: text(form.lpo_received_date) ?? text(form.lpo_date),
      revised_lpo_ref: text(form.revised_lpo_ref),
      revised_lpo_date: text(form.revised_lpo_date),
      revised_lpo_received_date: text(form.revised_lpo_received_date),
      revision_no: int(form.revision_no) ?? 0,
      advance_payment_date: text(form.advance_payment_date),
      manufacturing_clearance_date: text(form.manufacturing_clearance_date),
      supplier_name: cleanSuppliers[0]?.name ?? null,
      supplier_po_date: cleanSuppliers[0]?.po_date ?? null,
      supplier_advance_payment_date: cleanSuppliers[0]?.advance_payment_date ?? null,
      suppliers: cleanSuppliers,
      expected_delivery_date: text(form.expected_delivery_date) ?? cleanSuppliers[0]?.expected_delivery_date ?? null,
      priority: form.priority || 'normal',
      baseline_committed_date:
        order?.baseline_committed_date ??
        baselineCommittedDate({
          lpo_received_date: text(form.lpo_received_date) ?? text(form.lpo_date),
          lpo_date: text(form.lpo_date),
          lead_time_weeks_min: int(form.lead_time_weeks_min),
          lead_time_weeks_max: int(form.lead_time_weeks_max),
        }),
      status: form.status,
      actual_delivery_date: text(form.actual_delivery_date),
      committed_delivery_date: contractorMax,
      committed_delivery_date_min: contractorMin,
      order_ack_sent_date: text(form.order_ack_sent_date),
      order_ack_status: form.order_ack_status || 'not_sent',
      pi_sent_date: text(form.pi_sent_date),
      pi_status: form.pi_status || 'not_sent',
      delay_reason: text(form.delay_reason),
      notes: text(form.notes),
    };
  };

  // Reset draft tracking whenever the dialog is (re)opened
  useEffect(() => {
    draftIdRef.current = order?.is_draft ? order.id : null;
    setDraftSavedAt(null);
    setDraftSaving(false);
    draftBusyRef.current = false;
    publishingRef.current = false;
  }, [open, order?.id, order?.is_draft]);

  // Auto-save everything to the server as a draft while typing (new orders only)
  useEffect(() => {
    if (!open || (order && !order.is_draft)) return;
    if (!form.lpo_ref.trim() && !form.client_name.trim()) return;
    const timer = setTimeout(async () => {
      // Never let two drafts save at once (that used to create duplicate rows),
      // and never re-draft an order that is being published.
      if (draftBusyRef.current || publishingRef.current) return;
      draftBusyRef.current = true;
      setDraftSaving(true);
      try {
        const saved = await withTimeout(
          upsertDraft.mutateAsync({ id: draftIdRef.current, payload: buildPayload(true) as Record<string, unknown> }),
          15000,
        );
        if (!publishingRef.current) {
          draftIdRef.current = saved.id;
          setDraftSavedAt(new Date());
        }
      } catch {
        // Silent — the final Add Order surfaces any real error.
      } finally {
        draftBusyRef.current = false;
        setDraftSaving(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, form, materials, suppliers, contractorMode, supplierModes]);

  const handleSubmit = async () => {
    if (saving) return;
    const missingNow: string[] = [];
    if (!form.lpo_ref.trim()) missingNow.push('lpo_ref');
    if (!form.client_name.trim()) missingNow.push('client_name');
    setMissing(missingNow);
    if (missingNow.length > 0) {
      toast({
        title: 'Required fields missing',
        description: 'Please fill in LPO Ref. No. and Contractor Name (highlighted in red).',
        variant: 'destructive',
      });
      document.getElementById(missingNow[0] === 'lpo_ref' ? 'lpo-lpo_ref' : 'lpo-client_name')?.focus();
      return;
    }

    const payload = buildPayload(false);
    if (!payload.lpo_ref || !payload.client_name) return;

    publishingRef.current = true;
    setSaving(true);
    // Saving names to the address book is a nice-to-have: fire and forget so it
    // can never hold up the order.
    void (async () => {
      await saveContact.mutateAsync({ contact_type: 'customer', name: payload.client_name }).catch(() => undefined);
      for (const s of payload.suppliers) {
        await saveContact.mutateAsync({ contact_type: 'supplier', name: s.name }).catch(() => undefined);
      }
    })();

    try {
      const existingId = order && !order.is_draft ? order.id : draftIdRef.current;
      if (existingId) {
        await withTimeout(updateOrder.mutateAsync({ id: existingId, ...(payload as Partial<LpoOrder>), is_draft: false }), 15000);
        if (!order || order.is_draft) toast({ title: 'Order added to the tracker' });
      } else {
        await withTimeout(createOrder.mutateAsync({ ...payload, is_draft: false } as unknown as LpoOrderInput), 15000);
      }
      onOpenChange(false);
    } catch (err) {
      console.error('LPO save failed', err);
      publishingRef.current = false;
      toast({
        title: 'Could not save the order',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };


  const field = (key: string, label: string, type = 'text', placeholder?: string, list?: string, className?: string) => {
    const isMissing = missing.includes(key);
    return (
      <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
        <Label htmlFor={`lpo-${key}`} className={isMissing ? 'text-destructive' : undefined}>{label}</Label>
        <Input
          id={`lpo-${key}`}
          type={type}
          list={list}
          value={form[key]}
          placeholder={placeholder}
          className={isMissing ? 'border-destructive ring-1 ring-destructive' : undefined}
          onChange={(e) => { set(key)(e.target.value); if (isMissing) setMissing((m) => m.filter((x) => x !== key)); }}
        />
        {isMissing && <p className="text-xs text-destructive">Required</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Edit LPO ${order.lpo_ref}` : 'Punch New Order'}</DialogTitle>
          <DialogDescription>
            Only the essentials — both commitment dates are calculated for you.
          </DialogDescription>
        </DialogHeader>

        {duplicate && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="font-medium">Duplicate:</span>
            <span>
              LPO <strong>{duplicate.lpo_ref}</strong> is already punched for {duplicate.client_name}
              {duplicate.project_name ? ` (${duplicate.project_name})` : ''}. Check before adding again.
            </span>
          </div>
        )}

        <datalist id="lpo-client-list">
          {knownClients.map((c) => <option key={c} value={c} />)}
        </datalist>
        <datalist id="lpo-supplier-list">
          {knownSuppliers.map((s) => <option key={s} value={s} />)}
        </datalist>

        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-4">
            {field('lpo_ref', 'LPO Ref. No. *', 'text', undefined, undefined, 'sm:col-span-2')}
            {field('lpo_date', 'LPO Date', 'date', undefined, undefined, 'sm:col-span-1')}
            {field('lpo_received_date', 'LPO Received Date', 'date', undefined, undefined, 'sm:col-span-1')}
            {field('revised_lpo_ref', 'Revised LPO Ref. No. (if revised)', 'text', undefined, undefined, 'sm:col-span-2')}
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Revision</Label>
              <Select value={form.revision_no} onValueChange={set('revision_no')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>R{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field('revised_lpo_date', 'Revised LPO Date', 'date', undefined, undefined, 'sm:col-span-1')}
            {field('revised_lpo_received_date', 'Revised LPO Received Date', 'date', undefined, undefined, 'sm:col-span-2')}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lpo-client_name" className={missing.includes('client_name') ? 'text-destructive' : undefined}>Contractor Name *</Label>
              <Input
                id="lpo-client_name"
                list="lpo-client-list"
                placeholder="Search saved contractors or type a new one"
                value={form.client_name}
                className={missing.includes('client_name') ? 'border-destructive ring-1 ring-destructive' : undefined}
                onChange={(e) => { set('client_name')(e.target.value); setMissing((m) => m.filter((x) => x !== 'client_name')); }}
              />
              {missing.includes('client_name') && <p className="text-xs text-destructive">Required</p>}
            </div>
            {field('project_name', 'Project Name', 'text', undefined, undefined, 'sm:col-span-2')}
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set('status')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={set('priority')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field('quantity', 'Quantity', 'number', undefined, undefined, 'sm:col-span-1')}
            {field('order_value', 'Order Value', 'number', undefined, undefined, 'sm:col-span-2')}
            {field('currency', 'Currency', 'text', undefined, undefined, 'sm:col-span-1')}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Material Types</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {knownMaterials.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={materials.includes(m)} onCheckedChange={() => toggleMaterial(m)} />
                  {m}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add new material type"
                value={customMaterial}
                onChange={(e) => setCustomMaterial(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomMaterial(); } }}
              />
              <Button type="button" variant="outline" onClick={addCustomMaterial}>
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
            {materials.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {materials.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1">
                    {m}
                    <button type="button" onClick={() => toggleMaterial(m)} aria-label={`Remove ${m}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Our Delivery Terms (contractor side)</h3>
            <div className="grid gap-4 sm:grid-cols-4">
              {contractorMode === 'both' && field('lead_time_weeks_min', 'Lead Time Min (weeks)', 'number', '8')}
              {field('lead_time_weeks_max', contractorMode === 'both' ? 'Lead Time Max (weeks)' : 'Lead Time (weeks)', 'number', '10')}
              {field('advance_payment_date', 'Advance Payment Received', 'date')}
              {field('manufacturing_clearance_date', 'Manufacturing Clearance Date', 'date')}
            </div>
            {(() => {
              const win = estimatedCommittedWindow({
                lpo_date: text(form.lpo_date),
                lpo_received_date: text(form.lpo_received_date) ?? text(form.lpo_date),
                revised_lpo_received_date: text(form.revised_lpo_received_date),
                revised_lpo_date: text(form.revised_lpo_date),
                advance_payment_date: text(form.advance_payment_date),
                manufacturing_clearance_date: text(form.manufacturing_clearance_date),
                lead_time_weeks_min: contractorMode === 'max' ? null : int(form.lead_time_weeks_min),
                lead_time_weeks_max: int(form.lead_time_weeks_max),
              });
              const leadTimeMissing = contractorMode === 'max' ? !form.lead_time_weeks_max : (!form.lead_time_weeks_min && !form.lead_time_weeks_max);
              const missing = !(form.lpo_received_date || form.lpo_date) || !form.advance_payment_date || !form.manufacturing_clearance_date || leadTimeMissing;
              return (
                <p className="text-xs text-muted-foreground">
                  Estimated delivery (our terms):{' '}
                  {missing
                    ? 'fill LPO received, advance received, clearance and lead time'
                    : formatDateWindow(win.min, win.max)}
                </p>
              );
            })()}
            <div className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Confirmed to Contractor (Min / Max)</Label>
                <Select value={contractorMode} onValueChange={(v) => setContractorMode(v as DateMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Min & Max</SelectItem>
                    <SelectItem value="max">Max only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {contractorMode === 'both' && field('committed_delivery_date_min', 'Date Confirmed to Contractor — Min', 'date', undefined, undefined)}
              {field('committed_delivery_date', contractorMode === 'both' ? 'Date Confirmed to Contractor — Max' : 'Date Confirmed to Contractor', 'date', undefined, undefined)}
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Supplier Side</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => { setSuppliers((l) => [...l, { ...EMPTY_SUPPLIER }]); setSupplierModes((m) => [...m, 'both']); }}>
                <Plus className="w-4 h-4" /> Add supplier
              </Button>
            </div>
            {suppliers.length === 0 && (
              <p className="text-sm text-muted-foreground">No supplier added yet.</p>
            )}
            {suppliers.map((s, i) => {
              const mode = supplierModes[i] ?? 'both';
              const win = supplierEstimatedWindow({ ...s, lead_time_weeks_min: mode === 'max' ? null : s.lead_time_weeks_min });
              return (
              <div key={i} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    list="lpo-supplier-list"
                    placeholder="Supplier name"
                    value={s.name}
                    onChange={(e) => updateSupplier(i, { name: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="sm" aria-label="Remove supplier"
                    onClick={() => { setSuppliers((l) => l.filter((_, idx) => idx !== i)); setSupplierModes((m) => m.filter((_, idx) => idx !== i)); }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">PO released to supplier</Label>
                    <Input type="date" value={s.po_date ?? ''} onChange={(e) => updateSupplier(i, { po_date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mfg. clearance sent</Label>
                    <Input type="date" value={s.clearance_date ?? ''} onChange={(e) => updateSupplier(i, { clearance_date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Advance released</Label>
                    <Input type="date" value={s.advance_payment_date ?? ''} onChange={(e) => updateSupplier(i, { advance_payment_date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirmed (Min / Max)</Label>
                    <Select
                      value={mode}
                      onValueChange={(v) => setSupplierModes((m) => m.map((x, idx) => (idx === i ? (v as DateMode) : x)))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Min & Max</SelectItem>
                        <SelectItem value="max">Max only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {mode === 'both' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Lead Time Min (weeks)</Label>
                      <Input type="number" value={s.lead_time_weeks_min ?? ''} onChange={(e) => updateSupplier(i, { lead_time_weeks_min: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">{mode === 'both' ? 'Lead Time Max (weeks)' : 'Lead Time (weeks)'}</Label>
                    <Input type="number" value={s.lead_time_weeks_max ?? ''} onChange={(e) => updateSupplier(i, { lead_time_weeks_max: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />
                  </div>
                  {mode === 'both' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Supplier Confirmed — Min</Label>
                      <Input type="date" value={s.confirmed_delivery_date_min ?? ''} onChange={(e) => updateSupplier(i, { confirmed_delivery_date_min: e.target.value })} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">{mode === 'both' ? 'Supplier Confirmed — Max' : 'Supplier Confirmed Date'}</Label>
                    <Input
                      type="date"
                      value={s.confirmed_delivery_date_max ?? s.expected_delivery_date ?? ''}
                      onChange={(e) => updateSupplier(i, { confirmed_delivery_date_max: e.target.value, expected_delivery_date: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated delivery (supplier lead time):{' '}
                  {!(s.po_date || s.clearance_date || s.advance_payment_date) || (mode === 'both' ? (s.lead_time_weeks_min == null && s.lead_time_weeks_max == null) : s.lead_time_weeks_max == null)
                    ? 'fill PO released / clearance sent / advance released and lead time'
                    : formatDateWindow(win.start, win.end)}
                </p>
              </div>
            );})}
          </section>


          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Confirmations</h3>
            <div className="space-y-3">
              {[
                { statusKey: 'order_ack_status', dateKey: 'order_ack_sent_date', label: 'Order Acknowledgement' },
                { statusKey: 'pi_status', dateKey: 'pi_sent_date', label: 'Proforma Invoice (PI)' },
              ].map((c) => (
                <div key={c.statusKey} className="grid gap-3 sm:grid-cols-4 items-center">
                  <Label className="text-sm sm:col-span-1">{c.label}</Label>
                  <Select value={form[c.statusKey] || 'not_sent'} onValueChange={set(c.statusKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SENT_STATUSES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="sm:col-span-2" type="date" value={form[c.dateKey]} onChange={(e) => set(c.dateKey)(e.target.value)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Supplier PO sent and supplier advance released dates are captured per supplier above.
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lpo-actual_delivery_date">Actual Delivery Date</Label>
              <Input
                id="lpo-actual_delivery_date"
                type="date"
                value={form.actual_delivery_date}
                onChange={(e) => set('actual_delivery_date')(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpo-delay_reason">Delay Reason</Label>
              <Input
                id="lpo-delay_reason"
                placeholder="e.g. waiting for advance, factory capacity"
                value={form.delay_reason}
                onChange={(e) => set('delay_reason')(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpo-notes">Notes</Label>
              <Textarea id="lpo-notes" rows={2} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground self-center">
            {(!order || order.is_draft) && (draftSaving
              ? 'Saving to server…'
              : draftSavedAt
                ? `All changes saved on server (draft) · ${draftSavedAt.toLocaleTimeString()}`
                : 'Everything you type is saved on the server automatically')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Saving…' : order && !order.is_draft ? 'Save Changes' : 'Add Order'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
