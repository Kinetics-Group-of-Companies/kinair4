// Domain logic for the LPO / delivery tracker.

export const MATERIAL_TYPES = [
  'FAHU',
  'AHU',
  'ECU',
  'FAN',
  'ACU',
  'FCU',
  'DX-ODU',
  'VRF ODU',
  'ERV',
  'CP',
  'ACC',
  'OTHER',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const ORDER_STATUSES = [
  { value: 'new', label: 'New Order' },
  { value: 'awaiting_advance', label: 'Awaiting Advance' },
  { value: 'awaiting_clearance', label: 'Awaiting Mfg. Clearance' },
  { value: 'in_production', label: 'In Production' },
  { value: 'ready', label: 'Ready for Dispatch' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]['value'];

export function statusLabel(value: string): string {
  return ORDER_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export interface LpoSupplier {
  name: string;
  /** Date our PO reached the supplier. */
  po_date?: string | null;
  /** Manufacturing clearance sent to the supplier. */
  clearance_date?: string | null;
  /** Advance payment released to the supplier. */
  advance_payment_date?: string | null;
  /** Supplier lead-time range in weeks. */
  lead_time_weeks_min?: number | null;
  lead_time_weeks_max?: number | null;
  /** Delivery date confirmed by the supplier (latest / legacy single date). */
  expected_delivery_date?: string | null;
  /** Delivery window confirmed by the supplier. */
  confirmed_delivery_date_min?: string | null;
  confirmed_delivery_date_max?: string | null;
  po_value?: number | null;
  advance_amount?: number | null;
  balance_amount?: number | null;
  balance_payment_date?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
}


export interface LpoOrder {
  id: string;
  tenant_id: string;
  user_id: string;
  notify_email: string | null;
  lpo_ref: string;
  lpo_date: string | null;
  client_name: string;
  client_contact: string | null;
  client_email: string | null;
  project_name: string | null;
  material_type: string;
  material_types: string[] | null;
  description: string | null;
  quantity: number;
  order_value: number | null;
  cost_value: number | null;
  currency: string;
  quoted_lead_time_days: number | null;
  factory_lead_time_days: number | null;
  lead_time_weeks_min: number | null;
  lead_time_weeks_max: number | null;
  lpo_received_date: string | null;
  advance_payment_date: string | null;
  manufacturing_clearance_date: string | null;
  supplier_name: string | null;
  supplier_po_date: string | null;
  supplier_advance_payment_date: string | null;
  suppliers: LpoSupplier[] | null;
  revised_lpo_ref: string | null;
  revised_lpo_date: string | null;
  revised_lpo_received_date: string | null;
  revision_no: number;
  is_draft: boolean;
  last_updated_by_name: string | null;
  revised_order_value: number | null;
  revised_lead_time_weeks_min: number | null;
  revised_lead_time_weeks_max: number | null;
  revision_notes: string | null;
  committed_delivery_date: string | null;
  committed_delivery_date_min: string | null;
  order_ack_status: string | null;
  pi_status: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: string;
  next_followup_date: string | null;
  last_followup_date: string | null;
  notes: string | null;
  baseline_committed_date: string | null;
  /** Tick: the date committed to the contractor is the supplier's confirmed date. */
  commitment_matches_supplier: boolean | null;
  priority: string;
  order_owner: string | null;
  delay_reason: string | null;
  delay_owner: string | null;
  production_start_date: string | null;
  inspection_date: string | null;
  ready_date: string | null;
  dispatch_date: string | null;
  transport_mode: string | null;
  shipment_ref: string | null;
  port_eta_date: string | null;
  customs_clearance_date: string | null;
  site_delivery_date: string | null;
  installation_date: string | null;
  advance_percent: number | null;
  balance_payment_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  warranty_start_date: string | null;
  quotation_ref: string | null;
  quotation_date: string | null;
  pi_number: string | null;
  pi_sent_date: string | null;
  order_ack_sent_date: string | null;
  payment_terms: string | null;
  supplier_payment_terms: string | null;
  warranty_terms: string | null;
  warranty_months: number | null;
  warranty_end_date: string | null;
  vat_percent: number | null;
  vat_amount: number | null;
  delivery_terms: string | null;
  delivery_location: string | null;
  retention_percent: number | null;
  retention_release_date: string | null;
  advance_amount: number | null;
  advance_received_amount: number | null;
  balance_amount: number | null;
  balance_received_amount: number | null;
  supplier_order_value: number | null;
  supplier_advance_percent: number | null;
  supplier_advance_amount: number | null;
  supplier_balance_amount: number | null;
  supplier_balance_payment_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface LpoContact {
  id: string;
  tenant_id: string;
  contact_type: 'customer' | 'supplier';
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  trn: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const DOC_TYPES = [
  { value: 'client_lpo', label: 'Client LPO' },
  { value: 'supplier_lpo', label: 'Supplier LPO / PO' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'proforma_invoice', label: 'Proforma Invoice' },
  { value: 'order_ack', label: 'Order Acknowledgement' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_proof', label: 'Payment Proof' },
  { value: 'drawing', label: 'Drawing / Submittal' },
  { value: 'delivery_note', label: 'Delivery Note' },
  { value: 'warranty', label: 'Warranty Certificate' },
  { value: 'other', label: 'Other Supporting Document' },
] as const;

export function docTypeLabel(value: string): string {
  return DOC_TYPES.find((d) => d.value === value)?.label ?? value;
}

export interface LpoDocument {
  id: string;
  order_id: string;
  tenant_id: string;
  user_id: string | null;
  uploaded_by_name: string | null;
  doc_type: string;
  title: string | null;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}

export const PAYMENT_TERMS_PRESETS = [
  '100% advance',
  '50% advance, 50% before delivery',
  '30% advance, 70% before delivery',
  '30 days from invoice',
  '45 days from invoice',
  '60 days from invoice',
  '90 days from invoice',
  'Letter of Credit (LC)',
  'Cash against documents',
] as const;

export const WARRANTY_TERMS_PRESETS = [
  '12 months from delivery',
  '12 months from commissioning',
  '18 months from delivery',
  '24 months from delivery',
  'Manufacturer standard warranty',
] as const;

export const DELIVERY_TERMS = ['EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'Ex-stock', 'Site delivery'] as const;


export interface LpoRevision {
  id: string;
  order_id: string;
  tenant_id: string;
  user_id: string | null;
  author_name: string | null;
  revision_no: number;
  revised_lpo_ref: string | null;
  revised_lpo_date: string | null;
  revised_lpo_received_date: string | null;
  revised_order_value: number | null;
  revised_lead_time_weeks_min: number | null;
  revised_lead_time_weeks_max: number | null;
  revised_committed_date: string | null;
  previous_committed_date: string | null;
  reason: string | null;
  created_at: string;
}

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

export const PRIORITY_CLASSES: Record<string, string> = {
  low: 'bg-muted text-muted-foreground border-border',
  normal: 'bg-primary/10 text-primary border-primary/20',
  high: 'bg-amber-100 text-amber-900 border-amber-200',
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const DELAY_REASONS = [
  'Client scope change / revised LPO',
  'Awaiting advance payment',
  'Awaiting drawing / submittal approval',
  'Material shortage',
  'Supplier / factory delay',
  'Production capacity',
  'Inspection / QC hold',
  'Shipping & logistics',
  'Customs clearance',
  'Site not ready',
  'Other',
] as const;

export const DELAY_OWNERS = ['Client', 'Us', 'Supplier', 'Logistics', 'Authority', 'Other'] as const;

export const TRANSPORT_MODES = ['Road', 'Sea', 'Air', 'Courier', 'Client pickup'] as const;

export interface LpoOrderUpdate {
  id: string;
  order_id: string;
  tenant_id: string;
  user_id: string | null;
  author_name: string | null;
  note: string;
  status_at_time: string | null;
  created_at: string;
}

export type HealthLevel = 'delivered_early' | 'delivered_ontime' | 'delivered_late' | 'overdue' | 'at_risk' | 'on_track' | 'no_dates' | 'closed';

export interface OrderHealth {
  level: HealthLevel;
  label: string;
  /** Positive = days late, negative = days early. Null when not computable. */
  varianceDays: number | null;
  /** Date we promised the client. */
  promisedDate: string | null;
  /** Date we currently forecast delivery on. */
  forecastDate: string | null;
  daysRemaining: number | null;
  detail: string;
}

const DAY = 86400000;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY,
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function latest(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a > b ? a : b));
}

/** The clock only starts once LPO, advance payment and manufacturing clearance are all in. */
export function commitmentBasisDate(o: Partial<LpoOrder>): string | null {
  return latest(
    o.revised_lpo_received_date ?? o.lpo_received_date ?? o.revised_lpo_date ?? o.lpo_date,
    o.advance_payment_date,
    o.manufacturing_clearance_date,
  );
}

/** Effective lead-time range in weeks (revised range overrides the original). */
export function leadTimeWeeks(o: Partial<LpoOrder>): { min: number | null; max: number | null } {
  const min = o.revised_lead_time_weeks_min ?? o.lead_time_weeks_min ?? null;
  const max = o.revised_lead_time_weeks_max ?? o.lead_time_weeks_max ?? min;
  return { min: min ?? max ?? null, max: max ?? min ?? null };
}

/** Earliest date of the estimated window (contractor side). */
export function earliestCommittedDate(o: Partial<LpoOrder>): string | null {
  const basis = commitmentBasisDate(o);
  const { min } = leadTimeWeeks(o);
  if (basis && min != null) return addDays(basis, min * 7);
  return null;
}

/** Estimated date from our own delivery terms — basis + max weeks (legacy quoted days as fallback). */
export function estimatedCommittedDate(o: Partial<LpoOrder>): string | null {
  const basis = commitmentBasisDate(o);
  const { max } = leadTimeWeeks(o);
  if (basis && max != null) return addDays(basis, max * 7);
  const start = o.lpo_received_date ?? o.lpo_date ?? null;
  if (start && o.quoted_lead_time_days != null) return addDays(start, o.quoted_lead_time_days);
  return null;
}

/** The clock on the supplier side: latest of PO released, clearance sent, advance released. */
export function supplierBasisDate(s: LpoSupplier): string | null {
  return latest(s.po_date, s.clearance_date, s.advance_payment_date);
}

/** Estimated supplier date window from the supplier's own lead-time range. */
export function supplierEstimatedWindow(s: LpoSupplier): { start: string | null; end: string | null } {
  const basis = supplierBasisDate(s);
  const min = s.lead_time_weeks_min ?? s.lead_time_weeks_max ?? null;
  const max = s.lead_time_weeks_max ?? s.lead_time_weeks_min ?? null;
  return {
    start: basis && min != null ? addDays(basis, min * 7) : null,
    end: basis && max != null ? addDays(basis, max * 7) : null,
  };
}

/** Latest estimated date across all suppliers. */
export function supplierEstimatedDate(o: Partial<LpoOrder>): string | null {
  return latest(...(o.suppliers ?? []).map((s) => supplierEstimatedWindow(s).end));
}

export interface DateWindow {
  min: string | null;
  max: string | null;
}

/** Estimated window from our own delivery terms (basis + min/max weeks). */
export function estimatedCommittedWindow(o: Partial<LpoOrder>): DateWindow {
  return { min: earliestCommittedDate(o), max: estimatedCommittedDate(o) };
}

/** Estimated supplier window across all suppliers (latest of each side). */
export function supplierEstimatedWindowAll(o: Partial<LpoOrder>): DateWindow {
  const list = o.suppliers ?? [];
  return {
    min: latest(...list.map((s) => supplierEstimatedWindow(s).start)),
    max: latest(...list.map((s) => supplierEstimatedWindow(s).end)),
  };
}

/** Delivery window confirmed by the supplier(s) — latest of each side. */
export function supplierConfirmedWindow(o: Partial<LpoOrder>): DateWindow {
  const list = o.suppliers ?? [];
  const min = latest(...list.map((s) => s.confirmed_delivery_date_min ?? s.expected_delivery_date ?? null));
  const max = latest(
    ...list.map((s) => s.confirmed_delivery_date_max ?? s.expected_delivery_date ?? null),
    o.expected_delivery_date,
  );
  return { min: min ?? max, max: max ?? min };
}

/** The window confirmed to the contractor — supplier's confirmed window when the tick is on. */
export function committedWindow(o: Partial<LpoOrder>): DateWindow {
  const estimate = estimatedCommittedWindow(o);
  if (o.commitment_matches_supplier) {
    const sup = supplierConfirmedWindow(o);
    return { min: sup.min ?? estimate.min, max: sup.max ?? estimate.max };
  }
  const max = o.committed_delivery_date ?? estimate.max;
  return {
    min: o.committed_delivery_date_min ?? max ?? estimate.min,
    max: max ?? o.committed_delivery_date_min ?? estimate.max,
  };
}

/** Date confirmed to the contractor — the latest of the committed window. */
export function promisedDeliveryDate(o: Partial<LpoOrder>): string | null {
  const w = committedWindow(o);
  return w.max ?? w.min;
}

/** Latest date promised by any supplier. */
export function deliveredDate(o: Partial<LpoOrder>): string | null {
  return o.actual_delivery_date ?? o.site_delivery_date ?? null;
}

/** Delivery date confirmed by the supplier(s), falling back to their estimate. */
export function supplierConfirmedDate(o: Partial<LpoOrder>): string | null {
  const w = supplierConfirmedWindow(o);
  return w.max ?? w.min;
}

export function factoryDeliveryDate(o: Partial<LpoOrder>): string | null {
  return supplierConfirmedDate(o) ?? supplierEstimatedDate(o);
}

/** Delay between what we confirmed to the contractor and what the supplier confirmed — on both the earliest and latest dates. */
export function deliveryVariance(o: Partial<LpoOrder>): {
  committed: DateWindow;
  supplier: DateWindow;
  minDays: number | null;
  maxDays: number | null;
  label: string;
} {
  const committed = committedWindow(o);
  const supEstimate = supplierEstimatedWindowAll(o);
  const supConfirmed = supplierConfirmedWindow(o);
  const supplier = {
    min: supConfirmed.min ?? supEstimate.min,
    max: supConfirmed.max ?? supEstimate.max,
  };
  const minDays = committed.min && supplier.min ? diffDays(supplier.min, committed.min) : null;
  const maxDays = committed.max && supplier.max ? diffDays(supplier.max, committed.max) : null;
  const part = (d: number | null) => (d == null ? '—' : d > 0 ? `+${d}d` : d < 0 ? `${d}d` : '0d');
  const label =
    minDays == null && maxDays == null
      ? '—'
      : minDays === maxDays
        ? part(minDays)
        : `${part(minDays)} / ${part(maxDays)}`;
  return { committed, supplier, minDays, maxDays, label };
}




/** Date the supplier realistically delivers on. */
export function forecastDeliveryDate(o: Partial<LpoOrder>): string | null {
  const done = deliveredDate(o);
  if (done) return done;
  return factoryDeliveryDate(o);
}

export interface FactoryVariance {
  committedDate: string | null;
  factoryDate: string | null;
  days: number | null;
  weeks: number | null;
  label: string;
}

/** Committed date vs. factory date — delay in days and weeks. */
export function factoryVariance(o: Partial<LpoOrder>): FactoryVariance {
  const committedDate = promisedDeliveryDate(o);
  const factoryDate = factoryDeliveryDate(o);
  if (!committedDate || !factoryDate) {
    return { committedDate, factoryDate, days: null, weeks: null, label: '—' };
  }
  const days = diffDays(factoryDate, committedDate);
  const weeks = Math.round((days / 7) * 10) / 10;
  const label =
    days > 0
      ? `${days} d late (${weeks} wk)`
      : days < 0
        ? `${Math.abs(days)} d early (${Math.abs(weeks)} wk)`
        : 'Matches commitment';
  return { committedDate, factoryDate, days, weeks, label };
}

/** First commitment ever made — used to measure total slippage across revisions. */
export function baselineCommittedDate(o: Partial<LpoOrder>): string | null {
  if (o.baseline_committed_date) return o.baseline_committed_date;
  const basis = o.lpo_received_date ?? o.lpo_date ?? null;
  const max = o.lead_time_weeks_max ?? o.lead_time_weeks_min ?? null;
  if (basis && max != null) return addDays(basis, max * 7);
  if (basis && o.quoted_lead_time_days != null) return addDays(basis, o.quoted_lead_time_days);
  return null;
}

/** How far the current commitment has moved from the original one (days). */
export function baselineSlippageDays(o: Partial<LpoOrder>): number | null {
  const base = baselineCommittedDate(o);
  const now = promisedDeliveryDate(o);
  if (!base || !now) return null;
  return diffDays(now, base);
}

export function hasRevision(o: Partial<LpoOrder>): boolean {
  return !!(o.revised_lpo_ref || o.revised_lpo_date || o.revised_lpo_received_date ||
    o.revised_order_value != null || o.revised_lead_time_weeks_min != null || o.revised_lead_time_weeks_max != null);
}

/** Ordered process milestones used by the timeline and the progress bar. */
export function orderMilestones(o: Partial<LpoOrder>): { label: string; date: string | null }[] {
  return [
    { label: 'LPO received', date: o.lpo_received_date ?? o.lpo_date ?? null },
    { label: 'Advance payment received', date: o.advance_payment_date ?? null },
    { label: 'Manufacturing clearance', date: o.manufacturing_clearance_date ?? null },
    { label: 'PO released to supplier', date: o.supplier_po_date ?? (o.suppliers ?? [])[0]?.po_date ?? null },
    { label: 'Advance released to supplier', date: o.supplier_advance_payment_date ?? (o.suppliers ?? [])[0]?.advance_payment_date ?? null },
    { label: 'Mfg. clearance sent to supplier', date: (o.suppliers ?? [])[0]?.clearance_date ?? null },
    { label: 'Supplier confirmed delivery', date: supplierConfirmedDate(o) },
    { label: 'Delivered', date: o.actual_delivery_date ?? o.site_delivery_date ?? null },
  ];
}

/** Rough completion of the process, based on milestones achieved. */
export function progressPercent(o: Partial<LpoOrder>): number {
  if (o.status === 'cancelled') return 0;
  if (o.actual_delivery_date || o.site_delivery_date) return 100;
  const list = orderMilestones(o).slice(0, -1);
  const done = list.filter((m) => !!m.date).length;
  return Math.min(95, Math.round((done / list.length) * 100));
}

/** Days since the LPO landed. */
export function ageingDays(o: Partial<LpoOrder>, today = todayIso()): number | null {
  const start = o.lpo_received_date ?? o.lpo_date ?? null;
  if (!start) return null;
  const end = o.actual_delivery_date ?? o.site_delivery_date ?? today;
  return diffDays(end, start);
}

/** True when the next follow-up date has passed on an open order. */
export function followupOverdue(o: Partial<LpoOrder>, today = todayIso()): boolean {
  if (!o.next_followup_date) return false;
  if (o.actual_delivery_date || o.status === 'cancelled' || o.status === 'delivered') return false;
  return o.next_followup_date <= today;
}

/** Days since the last recorded client follow-up. */
export function daysSinceFollowup(o: Partial<LpoOrder>, today = todayIso()): number | null {
  if (!o.last_followup_date) return null;
  return diffDays(today, o.last_followup_date);
}

export function grossMarginPercent(o: Partial<LpoOrder>): number | null {
  const sell = o.revised_order_value ?? o.order_value ?? null;
  const cost = o.cost_value ?? null;
  if (sell == null || cost == null || sell === 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

export function materialList(o: Partial<LpoOrder>): string[] {
  const list = o.material_types && o.material_types.length > 0 ? o.material_types : [];
  if (list.length > 0) return list;
  return o.material_type ? [o.material_type] : [];
}

export const RISK_WINDOW_DAYS = 7;

export function computeHealth(o: Partial<LpoOrder>, today = todayIso()): OrderHealth {
  const promised = promisedDeliveryDate(o);
  const forecast = forecastDeliveryDate(o);

  if (o.status === 'cancelled') {
    return { level: 'closed', label: 'Cancelled', varianceDays: null, promisedDate: promised, forecastDate: forecast, daysRemaining: null, detail: 'Order cancelled' };
  }

  const delivered = deliveredDate(o);
  if (delivered) {
    const variance = promised ? diffDays(delivered, promised) : null;
    if (variance == null) {
      return { level: 'delivered_ontime', label: 'Delivered', varianceDays: null, promisedDate: promised, forecastDate: forecast, daysRemaining: null, detail: 'Delivered' };
    }
    if (variance < 0) {
      return { level: 'delivered_early', label: `Delivered ${Math.abs(variance)}d early`, varianceDays: variance, promisedDate: promised, forecastDate: forecast, daysRemaining: null, detail: `Delivered ${Math.abs(variance)} day(s) ahead of the committed date` };
    }
    if (variance === 0) {
      return { level: 'delivered_ontime', label: 'Delivered on time', varianceDays: 0, promisedDate: promised, forecastDate: forecast, daysRemaining: null, detail: 'Delivered exactly on the committed date' };
    }
    return { level: 'delivered_late', label: `Delivered ${variance}d late`, varianceDays: variance, promisedDate: promised, forecastDate: forecast, daysRemaining: null, detail: `Delivered ${variance} day(s) after the committed date` };
  }

  if (!promised) {
    return { level: 'no_dates', label: 'Dates missing', varianceDays: null, promisedDate: null, forecastDate: forecast, daysRemaining: null, detail: 'Add a committed delivery date or a quoted lead time' };
  }

  const daysRemaining = diffDays(promised, today);
  const variance = forecast ? diffDays(forecast, promised) : null;

  if (daysRemaining < 0) {
    return { level: 'overdue', label: `Overdue ${Math.abs(daysRemaining)}d`, varianceDays: variance ?? Math.abs(daysRemaining), promisedDate: promised, forecastDate: forecast, daysRemaining, detail: `Committed date passed ${Math.abs(daysRemaining)} day(s) ago and the order is not delivered` };
  }

  if (variance != null && variance > 0) {
    return { level: 'at_risk', label: `At risk +${variance}d`, varianceDays: variance, promisedDate: promised, forecastDate: forecast, daysRemaining, detail: `Supplier forecast is ${variance} day(s) later than the committed date` };
  }

  if (daysRemaining <= RISK_WINDOW_DAYS && !forecast) {
    return { level: 'at_risk', label: 'Confirm delivery', varianceDays: null, promisedDate: promised, forecastDate: forecast, daysRemaining, detail: `Due in ${daysRemaining} day(s) with no supplier date recorded` };
  }

  return {
    level: 'on_track',
    label: variance != null && variance < 0 ? `Early by ${Math.abs(variance)}d` : 'On track',
    varianceDays: variance,
    promisedDate: promised,
    forecastDate: forecast,
    daysRemaining,
    detail: `Due in ${daysRemaining} day(s)`,
  };
}

export const HEALTH_CLASSES: Record<HealthLevel, string> = {
  delivered_early: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  delivered_ontime: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  delivered_late: 'bg-amber-100 text-amber-900 border-amber-200',
  overdue: 'bg-destructive/10 text-destructive border-destructive/20',
  at_risk: 'bg-amber-100 text-amber-900 border-amber-200',
  on_track: 'bg-primary/10 text-primary border-primary/20',
  no_dates: 'bg-muted text-muted-foreground border-border',
  closed: 'bg-muted text-muted-foreground border-border',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return '—';
  const [, year, month, day] = match;
  const monthName = SHORT_MONTHS[Number(month) - 1];
  return monthName ? `${day} ${monthName} ${year}` : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const datePart = formatDate(date.toISOString().slice(0, 10));
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dubai',
  }).format(date);
  return `${datePart}, ${timePart} GST`;
}

/** Format a min/max date window; shows a single date when both sides are the same or the min is missing. */
export function formatDateWindow(min: string | null | undefined, max: string | null | undefined): string {
  const a = formatDate(min);
  const b = formatDate(max);
  if (a === '—' || a === b) return b;
  return `${a} → ${b}`;
}

export function isOpenOrder(o: Partial<LpoOrder>): boolean {
  return !deliveredDate(o) && o.status !== 'cancelled' && o.status !== 'delivered';
}

/** VAT amount — stored value wins, else computed from the VAT % on the selling value. */
export function vatAmount(o: Partial<LpoOrder>): number | null {
  if (o.vat_amount != null) return o.vat_amount;
  const net = o.revised_order_value ?? o.order_value ?? null;
  if (net == null || o.vat_percent == null) return null;
  return Math.round(net * (o.vat_percent / 100) * 100) / 100;
}

/** Selling value including VAT. */
export function grossOrderValue(o: Partial<LpoOrder>): number | null {
  const net = o.revised_order_value ?? o.order_value ?? null;
  if (net == null) return null;
  const vat = vatAmount(o) ?? 0;
  return Math.round((net + vat) * 100) / 100;
}

/** Advance / balance split on the customer side, derived from % when amounts are not entered. */
export function paymentSplit(o: Partial<LpoOrder>): { advance: number | null; balance: number | null } {
  const gross = grossOrderValue(o);
  const advance =
    o.advance_amount ?? (gross != null && o.advance_percent != null
      ? Math.round(gross * (o.advance_percent / 100) * 100) / 100
      : null);
  const balance =
    o.balance_amount ?? (gross != null && advance != null ? Math.round((gross - advance) * 100) / 100 : null);
  return { advance, balance };
}

/** Advance / balance split on the supplier side. */
export function supplierPaymentSplit(o: Partial<LpoOrder>): { advance: number | null; balance: number | null } {
  const total = o.supplier_order_value ?? o.cost_value ?? null;
  const advance =
    o.supplier_advance_amount ?? (total != null && o.supplier_advance_percent != null
      ? Math.round(total * (o.supplier_advance_percent / 100) * 100) / 100
      : null);
  const balance =
    o.supplier_balance_amount ?? (total != null && advance != null ? Math.round((total - advance) * 100) / 100 : null);
  return { advance, balance };
}

/** Warranty expiry — stored value wins, else warranty start (or delivery) + warranty months. */
export function warrantyEndDate(o: Partial<LpoOrder>): string | null {
  if (o.warranty_end_date) return o.warranty_end_date;
  const start = o.warranty_start_date ?? deliveredDate(o);
  if (!start || o.warranty_months == null) return null;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + o.warranty_months);
  return d.toISOString().slice(0, 10);
}

export function warrantyActive(o: Partial<LpoOrder>, today = todayIso()): boolean {
  const end = warrantyEndDate(o);
  return !!end && end >= today;
}

/** Delivered orders are auto-purged from the server two years after delivery. */
export const RETENTION_YEARS = 2;

export function purgeDate(o: Partial<LpoOrder>): string | null {
  const delivered = deliveredDate(o);
  if (!delivered) return null;
  const d = new Date(`${delivered}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}

/** Sent / not-sent options used by the confirmation checklist. */
export const SENT_STATUSES = [
  { value: 'not_sent', label: 'Not sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'na', label: 'Not applicable' },
] as const;

export function sentStatusLabel(value: string | null | undefined): string {
  return SENT_STATUSES.find((s) => s.value === (value ?? 'not_sent'))?.label ?? 'Not sent';
}
