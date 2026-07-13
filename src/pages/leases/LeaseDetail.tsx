import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { leaseDetailKeys, leaseKeys, propertyKeys, unitKeys } from '../../api/keys';
import type { LeaseRow } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { LeaseStatusBadge } from './shared';

export default function LeaseDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canEdit = perms.can('leases', 'update');

  const [terminateOpen, setTerminateOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3500); };

  const lease = useQuery({
    queryKey: leaseKeys.detail(id),
    queryFn: async () => {
      const { data: l, error } = await supabase.from('leases').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const [{ data: unit }, { data: tenant }] = await Promise.all([
        supabase.from('units').select('id, unit_number, property_id').eq('id', l.unit_id).single(),
        supabase.from('tenants').select('id, full_name').eq('id', l.tenant_id).single(),
      ]);
      return { ...l, unit, tenant };
    },
  });

  const deposits = useQuery({
    queryKey: leaseDetailKeys.deposits(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_deposits').select('*').eq('lease_id', id).is('deleted_at', null);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: leaseKeys.all });
    void qc.invalidateQueries({ queryKey: unitKeys.all });
    void qc.invalidateQueries({ queryKey: propertyKeys.stats() });
    void qc.invalidateQueries({ queryKey: leaseDetailKeys.deposits(id) });
  };

  const activate = useMutation({
    mutationFn: async () => {
      const l = lease.data;
      if (!l) throw new Error('Not loaded');
      const { error } = await supabase.from('leases').update({ status: 'active' }).eq('id', id);
      if (error) {
        throw new Error(
          error.message.includes('one_live_lease_per_unit')
            ? 'That unit already has a live lease — terminate it first.'
            : error.message,
        );
      }
      if (l.deposit_amount > 0 && (deposits.data?.length ?? 0) === 0) {
        await supabase.from('security_deposits').insert({ lease_id: id, amount: l.deposit_amount, status: 'held' });
      }
      await rpc.logActivity({ module: 'leases', action: 'activated', entityType: 'lease', entityId: id });
    },
    onSuccess: () => { refreshAll(); flash('Lease activated — unit is now occupied'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const terminate = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase
        .from('leases')
        .update({ status: 'terminated', terminated_at: new Date().toISOString(), termination_reason: reason || null })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'leases', action: 'terminated', entityType: 'lease', entityId: id, after: { reason } as never });
    },
    onSuccess: () => { refreshAll(); setTerminateOpen(false); flash('Lease terminated — unit released'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const renew = useMutation({
    mutationFn: async ({ endDate, rent }: { endDate: string; rent: number }) => {
      const l = lease.data;
      if (!l) throw new Error('Not loaded');
      const newStart = addDays(l.end_date, 1);
      if (endDate <= newStart) throw new Error('New end date must be after ' + newStart);
      const { error: oldErr } = await supabase.from('leases').update({ status: 'renewed' }).eq('id', id);
      if (oldErr) throw new Error(oldErr.message);
      const { data, error } = await supabase
        .from('leases')
        .insert({
          unit_id: l.unit_id, tenant_id: l.tenant_id, status: 'active',
          start_date: newStart, end_date: endDate,
          rent_amount: rent, rent_frequency: l.rent_frequency,
          service_charge: l.service_charge, deposit_amount: 0,
          renewed_from: id,
        })
        .select().single();
      if (error) {
        // roll the old lease back so we don't strand it
        await supabase.from('leases').update({ status: l.status }).eq('id', id);
        throw new Error(error.message);
      }
      await rpc.logActivity({
        module: 'leases', action: 'renewed', entityType: 'lease', entityId: data.id,
        after: { renewed_from: id, end_date: endDate, rent } as never,
      });
      return data.id;
    },
    onSuccess: () => { refreshAll(); setRenewOpen(false); flash('Renewal created and activated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (lease.isLoading) return <PageSpinner />;
  if (!lease.data) return <div className="p-6"><EmptyState title="Lease not found" /></div>;
  const l = lease.data;
  const live = l.status === 'active' || l.status === 'expiring';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Lease</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-semibold">
          Unit {l.unit?.unit_number ?? '—'} · {l.tenant?.full_name ?? '—'}
        </h1>
        <LeaseStatusBadge status={l.status} />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader title="Terms" />
          <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row label="Period" value={`${l.start_date} → ${l.end_date}`} mono />
            <Row label="Rent" value={`${money(l.rent_amount)} / ${l.rent_frequency}`} />
            <Row label="Service charge" value={l.service_charge ? money(l.service_charge) : '—'} />
            <Row label="Deposit" value={l.deposit_amount ? money(l.deposit_amount) : '—'} />
            <Row label="Tenant" value={l.tenant?.full_name ?? '—'} link={l.tenant ? `/tenants/${l.tenant.id}` : undefined} />
            <Row label="Property" value="Open property" link={l.unit ? `/properties/${l.unit.property_id}` : undefined} />
            {l.termination_reason && <Row label="Termination reason" value={l.termination_reason} />}
            {l.renewed_from && <Row label="Renewed from" value="Previous lease" link={`/leases/${l.renewed_from}`} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Actions" />
          <CardBody className="space-y-2">
            {canEdit && l.status === 'draft' && (
              <Button className="w-full" onClick={() => activate.mutate()} disabled={activate.isPending}>
                {activate.isPending ? 'Activating…' : 'Activate lease'}
              </Button>
            )}
            {canEdit && live && (
              <>
                <Button className="w-full" variant="outline" onClick={() => setRenewOpen(true)}>Renew</Button>
                <Button className="w-full" variant="danger" onClick={() => setTerminateOpen(true)}>Terminate</Button>
              </>
            )}
            {!canEdit && <p className="text-sm text-zinc-500">Read-only for your role.</p>}
            {canEdit && !live && l.status !== 'draft' && (
              <p className="text-sm text-zinc-500">This lease is closed — no actions available.</p>
            )}
            <p className="pt-1 text-xs text-zinc-400">
              Unit status follows the lease automatically: activation occupies it, termination or expiry releases it.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Security deposits" />
        <CardBody>
          {(deposits.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">No deposit recorded.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {deposits.data!.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="tabular-nums font-medium">{money(d.amount)}</span>
                  <Badge tone={d.status === 'held' ? 'brand' : d.status === 'refunded' ? 'green' : d.status === 'forfeited' ? 'red' : 'amber'}>
                    {d.status.replace('_', ' ')}
                  </Badge>
                  {d.refunded_amount > 0 && <span className="text-xs text-zinc-500">refunded {money(d.refunded_amount)}</span>}
                  <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(d.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Dialog open={terminateOpen} onClose={() => setTerminateOpen(false)} title="Terminate lease">
        <TerminateForm pending={terminate.isPending} onSubmit={(reason) => terminate.mutate(reason)} />
      </Dialog>

      <Dialog open={renewOpen} onClose={() => setRenewOpen(false)} title="Renew lease">
        <RenewForm
          currentEnd={l.end_date}
          currentRent={l.rent_amount}
          pending={renew.isPending}
          onSubmit={(v) => renew.mutate(v)}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function Row({ label, value, mono = false, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      {link ? (
        <Link to={link} className={`text-brand hover:underline ${mono ? 'font-mono text-xs' : ''}`}>{value}</Link>
      ) : (
        <p className={mono ? 'font-mono text-xs' : ''}>{value}</p>
      )}
    </div>
  );
}

function TerminateForm({ onSubmit, pending }: { onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        This ends the tenancy and releases the unit back to available. It can't be undone — a new tenancy needs a new lease.
      </p>
      <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => onSubmit(reason.trim())} disabled={pending}>
          {pending ? 'Terminating…' : 'Terminate lease'}
        </Button>
      </div>
    </div>
  );
}

function RenewForm({
  currentEnd, currentRent, onSubmit, pending,
}: {
  currentEnd: string;
  currentRent: number;
  onSubmit: (v: { endDate: string; rent: number }) => void;
  pending: boolean;
}) {
  const newStart = addDays(currentEnd, 1);
  const [endDate, setEndDate] = useState(addDays(currentEnd, 365));
  const [rent, setRent] = useState(String(currentRent));
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Creates a new active lease starting <span className="font-mono text-xs">{newStart}</span> (the day after the current one ends) and marks this one as renewed. The unit stays occupied throughout.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="New end date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="New rent / period"><Input type="number" min={0} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSubmit({ endDate, rent: Number(rent) || 0 })} disabled={pending}>
          {pending ? 'Renewing…' : 'Create renewal'}
        </Button>
      </div>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
