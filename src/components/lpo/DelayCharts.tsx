import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, PieChart, Pie, Legend, ResponsiveContainer } from 'recharts';
import { computeHealth, deliveryVariance, isOpenOrder, type LpoOrder } from '@/lib/lpoTracker';

const STATUS_COLORS: Record<string, string> = {
  Overdue: 'hsl(0 72% 51%)',
  'At risk': 'hsl(38 92% 45%)',
  'On track': 'hsl(160 60% 40%)',
  'Delivered on time': 'hsl(160 60% 40%)',
  'Delivered late': 'hsl(0 72% 51%)',
  Cancelled: 'hsl(0 0% 55%)',
};

function statusBucket(level: string): string {
  switch (level) {
    case 'overdue': return 'Overdue';
    case 'at_risk': return 'At risk';
    case 'on_track': return 'On track';
    case 'delivered_on_time': return 'Delivered on time';
    case 'delivered_late': return 'Delivered late';
    case 'cancelled': return 'Cancelled';
    default: return 'On track';
  }
}

export function DelayCharts({ orders }: { orders: LpoOrder[] }) {
  const real = useMemo(() => orders.filter((o) => !o.is_draft), [orders]);

  const delayBars = useMemo(() => {
    return real
      .map((o) => {
        const v = deliveryVariance(o);
        const days = v.maxDays ?? v.minDays;
        return days == null ? null : { name: o.lpo_ref, days, label: v.label };
      })
      .filter((d): d is { name: string; days: number; label: string } => d !== null)
      .sort((a, b) => b.days - a.days)
      .slice(0, 12);
  }, [real]);

  const statusPie = useMemo(() => {
    const counts = new Map<string, number>();
    real.forEach((o) => {
      const bucket = statusBucket(computeHealth(o).level);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    });
    const order = ['Overdue', 'At risk', 'On track', 'Delivered on time', 'Delivered late', 'Cancelled'];
    return order
      .filter((k) => counts.has(k))
      .map((k) => ({ name: k, value: counts.get(k)!, fill: STATUS_COLORS[k] }));
  }, [real]);

  const hasDelayData = delayBars.length > 0;
  if (real.length === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delay per order (days)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Supplier confirmed date vs. date confirmed to contractor. Bars to the right of zero are delays.
          </p>
        </CardHeader>
        <CardContent>
          {hasDelayData ? (
            <ResponsiveContainer width="100%" height={Math.max(160, delayBars.length * 34)}>
              <BarChart data={delayBars} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="#000" fontSize={11} tickLine={false} unit="d" />
                <YAxis type="category" dataKey="name" width={110} stroke="#000" fontSize={11} tickLine={false} />
                <Tooltip
                  formatter={(value: number) => [value > 0 ? `+${value} days late` : value < 0 ? `${Math.abs(value)} days early` : 'On time', 'Delay']}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine x={0} stroke="#000" />
                <Bar dataKey="days" radius={[3, 3, 3, 3]} barSize={16}>
                  {delayBars.map((d) => (
                    <Cell key={d.name} fill={d.days > 0 ? 'hsl(0 72% 51%)' : 'hsl(160 60% 40%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No delay data yet — add confirmed dates on orders to see this chart.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delivery status overview</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                {statusPie.map((s) => (
                  <Cell key={s.name} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
