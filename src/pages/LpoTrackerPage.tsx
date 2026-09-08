import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Truck, Plus, Search, AlertTriangle, Clock, CheckCircle2, Pencil, Trash2, FileDown } from 'lucide-react';
import { downloadLpoCsv } from '@/lib/lpoStatusReport';
import { useAuth } from '@/lib/authContext';
import { useLpoOrders } from '@/hooks/useLpoOrders';
import { LpoOrderDialog } from '@/components/lpo/LpoOrderDialog';
import { LpoOrderDetail } from '@/components/lpo/LpoOrderDetail';
import { DelayCharts } from '@/components/lpo/DelayCharts';
import {
  MATERIAL_TYPES,
  ORDER_STATUSES,
  computeHealth,
  formatDate,
  formatDateWindow,
  statusLabel,
  isOpenOrder,
  materialList,
  deliveryVariance,

  PRIORITIES,
  PRIORITY_CLASSES,
  HEALTH_CLASSES,
  type LpoOrder,
} from '@/lib/lpoTracker';
import { cn } from '@/lib/utils';

export default function LpoTrackerPage() {
  const { user, isLoading, isAdmin, canAccessLpo } = useAuth();
  const { orders, isLoading: ordersLoading, deleteOrder } = useLpoOrders();

  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LpoOrder | null>(null);
  const [detail, setDetail] = useState<LpoOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LpoOrder | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .map((o) => ({ order: o, health: computeHealth(o), variance: deliveryVariance(o) }))
      .filter(({ order, health }) => {
        if (q && ![order.lpo_ref, order.client_name, order.project_name ?? '', order.supplier_name ?? '']
          .some((v) => v.toLowerCase().includes(q))) return false;
        if (materialFilter !== 'all' && !materialList(order).includes(materialFilter)) return false;
        if (statusFilter === 'open' && !isOpenOrder(order)) return false;
        if (statusFilter === 'delayed' && health.level !== 'overdue' && health.level !== 'at_risk') return false;
        if (statusFilter === 'delivered' && !(order.actual_delivery_date || order.site_delivery_date)) return false;
        
        if (priorityFilter !== 'all' && (order.priority ?? 'normal') !== priorityFilter) return false;
        if (!['all', 'open', 'delayed', 'delivered'].includes(statusFilter) && order.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const prio = (o: LpoOrder) => ({ critical: 0, high: 1, normal: 2, low: 3 })[o.priority ?? 'normal'] ?? 2;
        const rank = (l: string) => (l === 'overdue' ? 0 : l === 'at_risk' ? 1 : l === 'on_track' ? 2 : 3);
        const r = rank(a.health.level) - rank(b.health.level);
        if (r !== 0) return r;
        const p = prio(a.order) - prio(b.order);
        if (p !== 0) return p;
        return (a.health.promisedDate ?? '9999').localeCompare(b.health.promisedDate ?? '9999');
      });
  }, [orders, search, materialFilter, statusFilter, priorityFilter]);

  const allMaterials = useMemo(
    () => Array.from(new Set([...MATERIAL_TYPES, ...orders.flatMap((o) => materialList(o))])),
    [orders],
  );

  const stats = useMemo(() => {
    const all = orders.map((o) => ({ o, h: computeHealth(o) }));
    return {
      open: all.filter(({ o }) => isOpenOrder(o)).length,
      overdue: all.filter(({ h }) => h.level === 'overdue').length,
      atRisk: all.filter(({ h }) => h.level === 'at_risk').length,
      delivered: all.filter(({ o }) => !!(o.actual_delivery_date || o.site_delivery_date)).length,
      
      onTimePercent: (() => {
        const done = all.filter(({ h }) => h.level.startsWith('delivered'));
        if (done.length === 0) return null;
        const good = done.filter(({ h }) => h.level !== 'delivered_late').length;
        return Math.round((good / done.length) * 100);
      })(),
    };
  }, [orders]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessLpo) return <Navigate to="/" replace />;

  return (
    <MainLayout>
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-8 px-4 border-b">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Truck className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">LPO &amp; Delivery Tracker</h1>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Estimated and confirmed dates on both sides — contractor and supplier — calculated from the lead times you enter.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <StatCard icon={<Clock className="w-4 h-4" />} label="Open orders" value={stats.open} />
          <StatCard icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Overdue" value={stats.overdue} />
          <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} label="At risk" value={stats.atRisk} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Delivered" value={stats.delivered} />
          
          <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="On-time %" value={stats.onTimePercent ?? 0} />
        </div>

        <DelayCharts orders={orders} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search LPO ref, contractor, project or supplier"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={materialFilter} onValueChange={setMaterialFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Material" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All materials</SelectItem>
              {allMaterials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-52"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open orders</SelectItem>
              <SelectItem value="delayed">Delayed / at risk</SelectItem>
              
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="all">All orders</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="md:w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => downloadLpoCsv(orders)}>
            <FileDown className="w-4 h-4" /> Export
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" />
            New Order
          </Button>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LPO Ref</TableHead>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confirmed to contractor</TableHead>
                  <TableHead>Supplier confirmed</TableHead>
                  <TableHead>Delay (min / max)</TableHead>
                  <TableHead>Delivery Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading orders…</TableCell></TableRow>
                )}
                {!ordersLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No orders match this view.</TableCell></TableRow>
                )}
                {rows.map(({ order, health, variance }) => (
                  <TableRow
                    key={order.id}
                    className={cn('cursor-pointer', order.is_draft && 'opacity-70')}
                    onClick={() => (order.is_draft ? (setEditing(order), setDialogOpen(true)) : setDetail(order))}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {order.lpo_ref}
                      {order.is_draft && <Badge variant="outline" className="ml-1.5 border-amber-500 text-amber-600">Draft</Badge>}
                      {(order.revision_no ?? 0) > 0 && (
                        <Badge variant="secondary" className="ml-1.5">R{order.revision_no}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{order.client_name}</div>
                      {order.project_name && <div className="text-xs text-muted-foreground">{order.project_name}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {materialList(order).map((m) => <Badge key={m} variant="outline">{m}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize', PRIORITY_CLASSES[order.priority ?? 'normal'])}>
                        {order.priority ?? 'normal'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {statusLabel(order.status)}
                      
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateWindow(variance.committed.min, variance.committed.max)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {order.actual_delivery_date
                        ? formatDate(order.actual_delivery_date)
                        : formatDateWindow(variance.supplier.min, variance.supplier.max)}
                    </TableCell>
                    <TableCell className={cn('whitespace-nowrap text-sm', ((variance.minDays ?? 0) > 0 || (variance.maxDays ?? 0) > 0) && 'text-destructive font-medium')}>{variance.label}</TableCell>
                    <TableCell>
                      <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', HEALTH_CLASSES[health.level])}>
                        {health.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" aria-label="Edit order" onClick={() => { setEditing(order); setDialogOpen(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" aria-label="Delete order" onClick={() => setDeleteTarget(order)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Delay alerts are emailed automatically when an order is overdue or the factory forecast slips past the
          committed date, and a summary of all ongoing deliveries is sent every Monday.
        </p>
      </div>

      <LpoOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} order={editing} />
      <LpoOrderDetail
        order={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(o) => { setDetail(null); setEditing(o); setDialogOpen(true); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.lpo_ref} will be removed from the tracker.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteOrder.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>
    </MainLayout>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
