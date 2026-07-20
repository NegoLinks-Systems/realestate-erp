import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Building2, DoorOpen, Home, Wallet, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { rpc } from '../lib/rpc';
import { propertyKeys } from '../api/keys';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useBranding, useMoney } from '../providers/BrandingProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { KPICard } from '../components/ui/KPICard';
import { ChartCard } from '../components/ui/ChartCard';
import { SmartInsights, type Insight } from '../components/dashboard/SmartInsights';
import { CHART_COLORS, CHART_GRID, CHART_AXIS, chartTooltip } from '../components/dashboard/chartTheme';
import { PageSpinner, EmptyState } from '../components/ui/Bits';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { organizationName } = useBranding();
  const money = useMoney();

  const canPortfolio = perms.can('properties', 'view') || perms.isAdmin;
  const canFinance = perms.can('finance', 'view') || perms.isAdmin;
  const canMaint = perms.can('maintenance', 'view') || perms.isAdmin;

  const stats = useQuery({
    queryKey: propertyKeys.stats(),
    queryFn: rpc.portfolioStats,
    enabled: canPortfolio,
  });

  const expiring = useQuery({
    queryKey: ['dashboard-expiring'],
    enabled: perms.can('leases', 'view') || perms.isAdmin,
    queryFn: async () => {
      const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { count, error } = await supabase.from('leases').select('id', { count: 'exact', head: true })
        .in('status', ['active', 'expiring']).lte('end_date', horizon).is('deleted_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const finance = useQuery({
    queryKey: ['dashboard-finance'],
    enabled: canFinance,
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const [{ data: invoices, error: iErr }, { data: payments, error: pErr }] = await Promise.all([
        supabase.from('invoices').select('total, amount_paid, status, due_date').is('deleted_at', null),
        supabase.from('payments').select('amount, received_at').is('deleted_at', null).gte('received_at', sixMonthsAgo.toISOString()),
      ]);
      if (iErr) throw new Error(iErr.message);
      if (pErr) throw new Error(pErr.message);

      const inv = invoices ?? [];
      const outstanding = inv.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
      const billed = inv.reduce((s, i) => s + Number(i.total), 0);
      const collected = inv.reduce((s, i) => s + Number(i.amount_paid), 0);
      const collectionRate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;

      const buckets = new Map<string, number>();
      for (let k = 5; k >= 0; k--) {
        const d = new Date(); d.setMonth(d.getMonth() - k); d.setDate(1);
        buckets.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
      }
      let collectedThisMonth = 0;
      const thisKey = (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}`; })();
      for (const p of payments ?? []) {
        const d = new Date(p.received_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(p.amount));
        if (key === thisKey) collectedThisMonth += Number(p.amount);
      }
      const trend = [...buckets.entries()].map(([key, value]) => {
        const [, m] = key.split('-').map(Number);
        return { month: MONTHS[m], amount: Math.round(value) };
      });

      const today = Date.parse(new Date().toISOString().slice(0, 10));
      const aging = [
        { bucket: '0-30', amount: 0 }, { bucket: '31-60', amount: 0 },
        { bucket: '61-90', amount: 0 }, { bucket: '90+', amount: 0 },
      ];
      for (const i of inv) {
        const bal = Math.max(0, Number(i.total) - Number(i.amount_paid));
        if (bal <= 0 || i.status === 'void') continue;
        const days = Math.floor((today - Date.parse(i.due_date)) / 86400000);
        if (days <= 30) aging[0].amount += bal;
        else if (days <= 60) aging[1].amount += bal;
        else if (days <= 90) aging[2].amount += bal;
        else aging[3].amount += bal;
      }
      aging.forEach((a) => (a.amount = Math.round(a.amount)));
      return { outstanding, collected, collectedThisMonth, collectionRate, trend, aging };
    },
  });

  const maintenance = useQuery({
    queryKey: ['dashboard-maintenance'],
    enabled: canMaint,
    queryFn: async () => {
      const { data, error } = await supabase.from('work_orders').select('status').is('deleted_at', null);
      if (error) throw new Error(error.message);
      const order = ['open', 'in_progress', 'on_hold', 'completed', 'verified'];
      const counts = new Map<string, number>();
      for (const w of data ?? []) counts.set(w.status, (counts.get(w.status) ?? 0) + 1);
      return order.filter((st) => counts.has(st)).map((st) => ({ status: st.replace('_', ' '), count: counts.get(st) ?? 0 }));
    },
  });

  if (perms.isLoading) return <PageSpinner />;

  if (perms.roles.includes('tenant') && !perms.isAdmin && !perms.can('properties', 'view')) {
    return <Navigate to="/portal" replace />;
  }

  const s = stats.data;
  const f = finance.data;
  const occupancyData = s
    ? [
        { name: 'Occupied', value: Number(s.occupied_units) },
        { name: 'Vacant', value: Number(s.vacant_units) },
      ]
    : [];

  const insights: Insight[] = [];
  if (f) {
    insights.push({ category: 'Revenue', text: `Collection rate is ${f.collectionRate}% of all billed rent; ${money(f.collectedThisMonth)} collected so far this month.` });
    const over90 = f.aging[3].amount;
    if (over90 > 0) insights.push({ category: 'Alert', text: `${money(over90)} of rent is more than 90 days overdue - prioritise these for follow-up.` });
    if (f.outstanding > 0 && over90 === 0) insights.push({ category: 'Forecast', text: `${money(f.outstanding)} outstanding, all within 90 days - healthy arrears profile.` });
  }
  if (s && Number(s.total_units) > 0) {
    insights.push({ category: Number(s.vacant_units) > 0 ? 'Opportunity' : 'Revenue', text: `Occupancy is ${s.occupancy_rate}% (${s.occupied_units}/${s.total_units} units).${Number(s.vacant_units) > 0 ? ` ${s.vacant_units} vacant unit(s) available to let.` : ''}` });
  }
  if (expiring.data && expiring.data > 0) {
    insights.push({ category: 'Alert', text: `${expiring.data} lease(s) expire within 30 days - start renewals now to avoid vacancy.` });
  }

  const nothingVisible = !canPortfolio && !canFinance && !canMaint;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader title="Executive dashboard" subtitle={organizationName} />

      {nothingVisible ? (
        <EmptyState icon={Home} title="Welcome" hint="Your dashboard will populate as you're granted access to modules." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {canPortfolio && <KPICard title="Properties" value={s?.total_properties ?? '-'} icon={Building2} loading={stats.isLoading} />}
            {canPortfolio && <KPICard title="Occupancy" value={s ? `${s.occupancy_rate}%` : '-'} trend={s ? `${s.occupied_units}/${s.total_units} units` : undefined} trendUp={s ? Number(s.occupancy_rate) >= 50 : undefined} icon={DoorOpen} loading={stats.isLoading} />}
            {canFinance && <KPICard title="Collected (MTD)" value={f ? money(f.collectedThisMonth) : '-'} icon={Wallet} loading={finance.isLoading} />}
            {canFinance && <KPICard title="Outstanding rent" value={f ? money(f.outstanding) : '-'} trend={f ? `${f.collectionRate}% collection rate` : undefined} trendUp={f ? f.collectionRate >= 80 : undefined} icon={Wallet} loading={finance.isLoading} />}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {canFinance ? (
                <ChartCard title="Collections trend" subtitle="Rent collected over the last 6 months">
                  {f && f.trend.some((t) => t.amount > 0) ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={f.trend} margin={{ left: -10, right: 8, top: 4 }}>
                        <defs>
                          <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.5} />
                            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={CHART_GRID} vertical={false} />
                        <XAxis dataKey="month" stroke={CHART_AXIS} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={64}
                          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                        <Tooltip {...chartTooltip} formatter={(v: number) => money(v)} />
                        <Area type="monotone" dataKey="amount" stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#collGrad)" name="Collected" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon={Wallet} title="No collections yet" hint="Record payments and this trend fills in." />
                  )}
                </ChartCard>
              ) : (
                <ChartCard title="Portfolio" subtitle="Occupancy overview">
                  <OccupancyChart data={occupancyData} loading={stats.isLoading} />
                </ChartCard>
              )}
            </div>
            <div>
              <SmartInsights insights={insights} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {canPortfolio && (
              <ChartCard title="Occupancy" subtitle="Occupied vs vacant units">
                <OccupancyChart data={occupancyData} loading={stats.isLoading} />
              </ChartCard>
            )}
            {canFinance && (
              <ChartCard title="Arrears aging" subtitle="Unpaid balances by age">
                {f && f.aging.some((a) => a.amount > 0) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={f.aging} margin={{ left: -10, right: 8, top: 4 }}>
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="bucket" stroke={CHART_AXIS} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={56}
                        tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                      <Tooltip {...chartTooltip} formatter={(v: number) => money(v)} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Bar dataKey="amount" name="Overdue" radius={[4, 4, 0, 0]}>
                        {f.aging.map((_, i) => <Cell key={i} fill={i === 3 ? '#EF4444' : CHART_COLORS[0]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={Wallet} title="No arrears" hint="Overdue balances would appear here." />
                )}
              </ChartCard>
            )}
            {canMaint && (
              <ChartCard title="Maintenance" subtitle="Work orders by status">
                {maintenance.data && maintenance.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={maintenance.data} margin={{ left: -10, right: 8, top: 4 }}>
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="status" stroke={CHART_AXIS} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                      <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Bar dataKey="count" name="Work orders" radius={[4, 4, 0, 0]} fill={CHART_COLORS[1]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={Wrench} title="No work orders" hint="Maintenance activity would appear here." />
                )}
              </ChartCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OccupancyChart({ data, loading }: { data: { name: string; value: number }[]; loading: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (loading) return <PageSpinner />;
  if (total === 0) return <EmptyState icon={Home} title="No units yet" hint="Add properties and units to see occupancy." />;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} strokeWidth={0}>
            <Cell fill={CHART_COLORS[0]} />
            <Cell fill="#2A2A40" />
          </Pie>
          <Tooltip {...chartTooltip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold" style={{ color: 'var(--accent-light)' }}>
          {Math.round((data[0].value / total) * 100)}%
        </span>
        <span className="text-[11px] text-zinc-500">occupied</span>
      </div>
    </div>
  );
}
