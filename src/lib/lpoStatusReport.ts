import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import brandLogoUrl from '@/assets/kinair-logo.png';
import {
  committedWindow,
  computeHealth,
  deliveryVariance,
  estimatedCommittedWindow,

  factoryVariance,
  formatDate,
  formatDateWindow,
  materialList,
  orderMilestones,
  progressPercent,
  statusLabel,
  supplierConfirmedWindow,
  supplierEstimatedWindow,
  supplierEstimatedWindowAll,
  leadTimeWeeks,
  baselineCommittedDate,
  type LpoOrder,
  type LpoOrderUpdate,
  type LpoRevision,
} from '@/lib/lpoTracker';

interface Options {
  companyName?: string;
  updates?: LpoOrderUpdate[];
  revisions?: LpoRevision[];
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Client-facing order status report — one page summary of where the order stands. */
export async function downloadLpoStatusReport(order: LpoOrder, opts: Options = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const committed = committedWindow(order);
  const supEstimate = supplierEstimatedWindowAll(order);
  const supConfirmed = supplierConfirmedWindow(order);
  const ourEstimate = estimatedCommittedWindow(order);
  const variance = deliveryVariance(order);
  const health = computeHealth(order);

  // Brand logo in place of the company name text

  const logo = await loadImageDataUrl(brandLogoUrl);
  if (logo) {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = logo;
    });
    if (img && img.naturalWidth > 0) {
      const h = 14;
      const w = (img.naturalWidth / img.naturalHeight) * h;
      doc.addImage(logo, 'PNG', 14, 8, w, h);
    }
  }
  doc.setFontSize(16);
  doc.text('Order Tracking Report', 14, 30);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Generated ${formatDate(new Date().toISOString().slice(0, 10))}`, 14, 36);
  doc.setTextColor(0);

  const sent = (status: string | null | undefined, date: string | null | undefined) =>
    `${status === 'sent' ? 'Sent' : 'Not sent'}${date ? ` · ${formatDate(date)}` : ''}`;

  autoTable(doc, {
    startY: 42,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [['Order details', '']],
    body: [
      ['LPO Ref. No.', order.lpo_ref],
      ...(order.revised_lpo_ref || order.revised_lpo_date
        ? [['Revised LPO', `${order.revised_lpo_ref || '—'} · ${formatDate(order.revised_lpo_date)}`] as string[]]
        : []),
      ['Revision No.', `R${order.revision_no ?? 0}`],
      ['Contractor', order.client_name],
      ['Project', order.project_name || '—'],
      ['Material type', materialList(order).join(', ') || '—'],
      ['Quantity', String(order.quantity)],
      ['Priority', (order.priority ?? 'normal').toUpperCase()],
      ['Order status', statusLabel(order.status)],
      ['Progress', `${progressPercent(order)}%`],
    ],
  });

  const nextY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: nextY(),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [['Contractor side (our commitment)', '']],
    body: [
      ['LPO date', formatDate(order.lpo_date)],
      ['LPO received', formatDate(order.revised_lpo_received_date ?? order.lpo_received_date)],
      ['Advance payment received', formatDate(order.advance_payment_date)],
      ['Manufacturing clearance', formatDate(order.manufacturing_clearance_date)],
      ['Lead time (weeks)', order.lead_time_weeks_max != null
        ? `${order.lead_time_weeks_min != null && order.lead_time_weeks_min !== order.lead_time_weeks_max ? `${order.lead_time_weeks_min} – ` : ''}${order.lead_time_weeks_max}`
        : '—'],
      ['Estimated delivery (min / max)', formatDateWindow(ourEstimate.min, ourEstimate.max)],
      ['Date confirmed to contractor', formatDateWindow(committed.min, committed.max)],
    ],
  });

  const suppliers = order.suppliers ?? [];
  autoTable(doc, {
    startY: nextY(),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    head: [['Supplier', 'PO released', 'Advance released', 'Clearance sent', 'Lead time (wk)', 'Estimated (min / max)', 'Confirmed (min / max)']],
    body: suppliers.length
      ? suppliers.map((s) => {
          const est = supplierEstimatedWindow(s);
          return [
            s.name || '—',
            formatDate(s.po_date),
            formatDate(s.advance_payment_date),
            formatDate(s.clearance_date),
            s.lead_time_weeks_max != null
              ? `${s.lead_time_weeks_min != null && s.lead_time_weeks_min !== s.lead_time_weeks_max ? `${s.lead_time_weeks_min} – ` : ''}${s.lead_time_weeks_max}`
              : '—',
            formatDateWindow(est.start, est.end),
            formatDateWindow(s.confirmed_delivery_date_min ?? s.expected_delivery_date, s.confirmed_delivery_date_max ?? s.expected_delivery_date),
          ];
        })
      : [['No supplier recorded', '—', '—', '—', '—', '—', '—']],
  });

  autoTable(doc, {
    startY: nextY(),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [['Delivery position', '']],
    body: [
      ['Confirmed to contractor', formatDateWindow(committed.min, committed.max)],
      ['Supplier estimated', formatDateWindow(supEstimate.min, supEstimate.max)],
      ['Supplier confirmed', formatDateWindow(supConfirmed.min, supConfirmed.max)],
      ['Delay (min / max)', variance.label],
      ['Delivery status', `${health.label} — ${health.detail}`],
      ['Delay reason', order.delay_reason || '—'],
    ],
  });


  autoTable(doc, {
    startY: nextY(),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [['Confirmations', '']],
    body: [
      ['Order acknowledgement', sent(order.order_ack_status, order.order_ack_sent_date)],
      ['Proforma invoice (PI)', sent(order.pi_status, order.pi_sent_date)],
    ],
  });

  autoTable(doc, {
    startY: nextY(),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [['Milestone', 'Date', 'Status']],
    body: orderMilestones(order).map((m) => [m.label, formatDate(m.date), m.date ? 'Completed' : 'Pending']),
  });

  if (order.notes) {
    autoTable(doc, {
      startY: nextY(),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      head: [['Notes']],
      body: [[order.notes]],
    });
  }

  if (order.last_updated_by_name) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Last revised by ${order.last_updated_by_name} · ${new Date(order.updated_at).toLocaleString('en-GB')}`, 14, nextY() + 2);
    doc.setTextColor(0);
  }

  const revisions = opts.revisions ?? [];
  if (revisions.length) {
    doc.addPage();
    autoTable(doc, {
      startY: 18,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      head: [['Rev.', 'LPO ref', 'Received', 'Value', 'Lead time', 'Committed was', 'Committed now', 'Reason']],
      body: revisions
        .slice()
        .sort((a, b) => a.revision_no - b.revision_no)
        .map((r) => [
          String(r.revision_no),
          r.revised_lpo_ref || '—',
          formatDate(r.revised_lpo_received_date),
          r.revised_order_value != null ? `${order.currency} ${r.revised_order_value.toLocaleString()}` : '—',
          r.revised_lead_time_weeks_min != null ? `${r.revised_lead_time_weeks_min}–${r.revised_lead_time_weeks_max ?? r.revised_lead_time_weeks_min} wk` : '—',
          formatDate(r.previous_committed_date),
          formatDate(r.revised_committed_date),
          r.reason || '—',
        ]),
    });
  }

  doc.save(`Order-Tracking-${order.lpo_ref.replace(/[^\w-]+/g, '_')}.pdf`);
}

/** Spreadsheet export of the whole tracker. */
export function downloadLpoCsv(orders: LpoOrder[]) {
  const header = [
    'LPO Ref', 'Revised LPO Ref', 'Contractor', 'Project', 'Material', 'Qty', 'Status', 'Priority',
    'Currency', 'Selling value', 'Cost value', 'LPO date', 'LPO received', 'Advance received',
    'Mfg. clearance', 'Lead time (wks)', 'Original committed', 'Committed', 'Supplier confirmed',
    'Supplier vs committed (days)', 'Dispatch', 'Site delivery', 'Actual delivery', 'Delivery Status',
    'Delay reason', 'Delay owner', 'Owner', 'Next follow-up',
  ];
  const rows = orders.map((o) => {
    const h = computeHealth(o);
    const v = factoryVariance(o);
    const w = leadTimeWeeks(o);
    return [
      o.lpo_ref, o.revised_lpo_ref ?? '', o.client_name, o.project_name ?? '',
      materialList(o).join(' / '), o.quantity, statusLabel(o.status), o.priority ?? '',
      o.currency, o.revised_order_value ?? o.order_value ?? '', o.cost_value ?? '',
      o.lpo_date ?? '', o.lpo_received_date ?? '', o.advance_payment_date ?? '',
      o.manufacturing_clearance_date ?? '',
      w.min != null ? `${w.min}-${w.max ?? w.min}` : '',
      baselineCommittedDate(o) ?? '', h.promisedDate ?? '', h.forecastDate ?? '',
      v.days ?? '', o.dispatch_date ?? '', o.site_delivery_date ?? '', o.actual_delivery_date ?? '',
      h.label, o.delay_reason ?? '', o.delay_owner ?? '', o.order_owner ?? '', o.next_followup_date ?? '',
    ];
  });
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LPO-Tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
