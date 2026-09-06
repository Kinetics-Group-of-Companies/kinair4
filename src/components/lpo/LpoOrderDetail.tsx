import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  computeHealth,
  formatDate,
  formatDateWindow,
  statusLabel,
  HEALTH_CLASSES,
  PRIORITY_CLASSES,
  materialList,
  leadTimeWeeks,
  commitmentBasisDate,
  supplierEstimatedDate,
  supplierEstimatedWindow,
  committedWindow,
  estimatedCommittedWindow,
  supplierConfirmedWindow,
  deliveryVariance,
  sentStatusLabel,
  orderMilestones,
  progressPercent,
  ageingDays,
  type LpoOrder,
} from '@/lib/lpoTracker';
import { downloadLpoStatusReport } from '@/lib/lpoStatusReport';
import { useTenantData } from '@/hooks/useFanDatabase';

interface Props {
  order: LpoOrder | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (order: LpoOrder) => void;
}



export function LpoOrderDetail({ order, onOpenChange, onEdit }: Props) {
  const tenantQuery = useTenantData();


  if (!order) return null;
  const health = computeHealth(order);
  const weeks = leadTimeWeeks(order);
  const progress = progressPercent(order);
  const ageing = ageingDays(order);
  const value = order.revised_order_value ?? order.order_value;
  const termsWin = estimatedCommittedWindow(order);
  const committedWin = committedWindow(order);
  const supplierWin = supplierConfirmedWindow(order);
  const delay = deliveryVariance(order);
  const supplierList = (order.suppliers ?? []).length
    ? order.suppliers ?? []
    : order.supplier_name
      ? [{ name: order.supplier_name, po_date: order.supplier_po_date, advance_payment_date: order.supplier_advance_payment_date, expected_delivery_date: order.expected_delivery_date }]
      : [];

  const latestOf = (dates: (string | null | undefined)[]) =>
    dates.filter(Boolean).sort().slice(-1)[0] ?? null;
  const confirmations = [
    { label: 'Order Acknowledgement', date: order.order_ack_sent_date, status: order.order_ack_status },
    { label: 'Proforma Invoice (PI)', date: order.pi_sent_date, status: order.pi_status },
    { label: 'Supplier PO sent', date: latestOf(supplierList.map((s) => s.po_date)), status: null },
    { label: 'Advance payment to supplier sent', date: latestOf(supplierList.map((s) => s.advance_payment_date)), status: null },
  ];

  const milestones = orderMilestones(order);

  return (
    <Sheet open={!!order} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{order.lpo_ref}</SheetTitle>
          <SheetDescription>
            {order.client_name} · {materialList(order).join(', ')} · Qty {order.quantity}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', HEALTH_CLASSES[health.level])}>
              {health.label}
            </span>
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium capitalize', PRIORITY_CLASSES[order.priority ?? 'normal'])}>
              {order.priority ?? 'normal'} priority
            </span>
            <span className="rounded-full border px-2 py-0.5 text-xs bg-muted text-muted-foreground">
              {statusLabel(order.status)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            {order.last_updated_by_name
              ? <>Last revised by <span className="font-medium text-foreground">{order.last_updated_by_name}</span> on {new Date(order.updated_at).toLocaleString()}</>
              : <>Created {new Date(order.created_at).toLocaleString()}</>}
          </div>

          <div className={cn('rounded-lg border px-3 py-2 text-sm', HEALTH_CLASSES[health.level])}>
            <div className="font-semibold">{health.label}</div>
            <div className="text-xs opacity-90">{health.detail}</div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
            <div className="mt-1 text-xs text-muted-foreground">
              {ageing != null ? `${ageing} day(s) since LPO` : 'LPO date not recorded'}
              {` · Revision R${order.revision_no ?? 0}`}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Estimated — our delivery terms</dt>
              <dd>{formatDateWindow(termsWin.min, termsWin.max)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Confirmed to contractor</dt>
              <dd>
                {formatDateWindow(committedWin.min, committedWin.max)}
                {order.commitment_matches_supplier ? ' (same as supplier)' : ''}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Delay</dt>
              <dd className={cn(
                (delay.minDays != null && delay.minDays > 0) || (delay.maxDays != null && delay.maxDays > 0) && 'text-destructive font-medium'
              )}>
                {delay.label}
              </dd>
            </div>
            <div><dt className="text-muted-foreground text-xs">Supplier estimated</dt><dd>{formatDate(supplierEstimatedDate(order))}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Supplier confirmed</dt><dd>{formatDateWindow(supplierWin.min, supplierWin.max)}</dd></div>
            
            <div><dt className="text-muted-foreground text-xs">Lead time</dt><dd>{weeks.min != null ? `${weeks.min}${weeks.max != null && weeks.max !== weeks.min ? `–${weeks.max}` : ''} weeks` : '—'}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Clock starts</dt><dd>{formatDate(commitmentBasisDate(order))}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Project</dt><dd>{order.project_name || '—'}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Order value</dt><dd>{value != null ? `${order.currency} ${value.toLocaleString()}` : '—'}</dd></div>
          </dl>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Confirmations</h3>
            <ul className="space-y-1.5">
              {confirmations.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.date ? (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={c.date ? '' : 'text-muted-foreground'}>{c.label}</span>
                  <span className="ml-auto text-muted-foreground text-xs">
                    {c.status ? `${sentStatusLabel(c.status)} · ` : ''}
                    <span className="tabular-nums">{formatDate(c.date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Suppliers</h3>
            {supplierList.length === 0 && <p className="text-sm text-muted-foreground">No supplier recorded.</p>}
            <ul className="space-y-2">
              {supplierList.map((s, i) => (
                <li key={i} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    PO received {formatDate(s.po_date)} · Clearance sent {formatDate(s.clearance_date)} · Advance released {formatDate(s.advance_payment_date)}
                    <br />
                    Estimated {formatDateWindow(supplierEstimatedWindow(s).start, supplierEstimatedWindow(s).end)} · Confirmed {formatDateWindow(s.confirmed_delivery_date_min ?? s.expected_delivery_date, s.confirmed_delivery_date_max ?? s.expected_delivery_date)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Timeline</h3>
            <ol className="space-y-2">
              {milestones.map((m) => (
                <li key={m.label} className="flex items-start gap-2 text-sm">
                  {m.date ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={m.date ? '' : 'text-muted-foreground'}>{m.label}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">{formatDate(m.date)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadLpoStatusReport(order, {
                  companyName: tenantQuery.data?.name ?? undefined,
                })
              }
            >

              <FileDown className="w-4 h-4" /> Customer status report
            </Button>
            <Button variant="outline" onClick={() => onEdit(order)}>
              Edit order details
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
