import { NavLink, Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

const TABS = [
  { label: 'Overview', to: '/finance', end: true },
  { label: 'Invoices', to: '/finance/invoices' },
  { label: 'Payments', to: '/finance/payments' },
  { label: 'Expenses', to: '/finance/expenses' },
  { label: 'Landlord statements', to: '/finance/statements' },
  { label: 'Penalty rules', to: '/finance/penalties' },
];

export default function FinanceLayout() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold">Finance</h1>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                isActive ? 'border-brand text-brand' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="py-5">
        <Outlet />
      </div>
    </div>
  );
}

export function FinanceOverview() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };
  const canRun = perms.can('finance', 'create');

  const summary = useQuery({
    queryKey: financeKeys.dashboard(),
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      const startIso = monthStart.toISOString().slice(0, 10);

      const [{ data: invoices, error: invErr }, { data: payments, error: payErr }] = await Promise.all([
        supabase.from('invoices').select('total, amount_paid, status, due_date').is('deleted_at', null),
        supabase.from('payments').select('amount, received_at').is('deleted_at', null).gte('received_at', startIso),
      ]);
      if (invErr) throw new Error(invErr.message);
      if (payErr) throw new Error(payErr.message);

      const inv = invoices ?? [];
      const outstanding = inv.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
      const billed = inv.reduce((s, i) => s + Number(i.total), 0);
      const collected = inv.reduce((s, i) => s + Number(i.amount_paid), 0);
      const collectedThisMonth = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

      const today = new Date().toISOString().slice(0, 10);
      const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
      for (const i of inv) {
        const bal = Math.max(0, Number(i.total) - Number(i.amount_paid));
        if (bal <= 0 || i.status === 'void') continue;
        const days = Math.floor((Date.parse(today) - Date.parse(i.due_date)) / 86400000);
        if (days <= 30) aging.d0_30 += bal;
        else if (days <= 60) aging.d31_60 += bal;
        else if (days <= 90) aging.d61_90 += bal;
        else aging.d90p += bal;
      }
      const collectionRate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;
      return { outstanding, collectedThisMonth, collectionRate, aging };
    },
  });

  const runBilling = useMutation({
    mutationFn: async () => {
      const created = await rpc.billingRun();
      await rpc.logActivity({ module: 'finance', action: 'billing_run', entityType: 'system', entityId: 'billing_run', after: { created } as never });
      return created;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      flash(n > 0 ? `Billing run created ${n} invoice${n === 1 ? '' : 's'}` : 'Billing run complete — nothing new was due');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const runPenalties = useMutation({
    mutationFn: async () => {
      const added = await rpc.applyPenalties();
      await rpc.logActivity({ module: 'finance', action: 'apply_penalties', entityType: 'system', entityId: 'apply_penalties', after: { added } as never });
      return added;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      flash(n > 0 ? `Applied ${n} penalt${n === 1 ? 'y' : 'ies'}` : 'No overdue invoices needed penalties');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (summary.isLoading) return <PageSpinner />;
  const s = summary.data!;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Outstanding rent" value={money(s.outstanding)} accent />
        <Metric label="Collected this month" value={money(s.collectedThisMonth)} />
        <Metric label="Collection rate" value={`${s.collectionRate}%`} />
      </div>

      <Card>
        <CardHeader title="Arrears aging" subtitle="Unpaid invoice balances by how overdue they are." />
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <AgingCell label="0–30 days" value={money(s.aging.d0_30)} />
          <AgingCell label="31–60 days" value={money(s.aging.d31_60)} />
          <AgingCell label="61–90 days" value={money(s.aging.d61_90)} />
          <AgingCell label="90+ days" value={money(s.aging.d90p)} danger={s.aging.d90p > 0} />
        </CardBody>
      </Card>

      {canRun && (
        <Card>
          <CardHeader
            title="Billing operations"
            subtitle="These run automatically every night. Run them on demand here when you need to catch up immediately."
          />
          <CardBody className="flex flex-wrap gap-3">
            <Button onClick={() => runBilling.mutate()} disabled={runBilling.isPending}>
              <PlayCircle className="h-4 w-4" /> {runBilling.isPending ? 'Running…' : 'Run billing now'}
            </Button>
            <Button variant="outline" onClick={() => runPenalties.mutate()} disabled={runPenalties.isPending}>
              <PlayCircle className="h-4 w-4" /> {runPenalties.isPending ? 'Running…' : 'Apply penalties now'}
            </Button>
          </CardBody>
        </Card>
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${accent ? 'text-brand' : ''}`}>{value}</p>
      </CardBody>
    </Card>
  );
}

function AgingCell({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold tabular-nums ${danger ? 'text-red-600' : ''}`}>{value}</p>
    </div>
  );
}
