import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { leaseKeys, propertyKeys, tenantKeys, unitKeys } from '../../api/keys';
import { leaseSchema, type LeaseInput } from '../../schemas';
import type { LeaseStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { LEASE_STATUSES, LeaseStatusBadge } from './shared';

export default function LeasesList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<'' | LeaseStatus>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const leases = useQuery({
    queryKey: leaseKeys.list(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('leases').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const unitIds = [...new Set(rows.map((l) => l.unit_id))];
      const tenantIds = [...new Set(rows.map((l) => l.tenant_id))];
      const [units, tenants] = await Promise.all([
        unitIds.length ? supabase.from('units').select('id, unit_number, property_id').in('id', unitIds) : Promise.resolve({ data: [] }),
        tenantIds.length ? supabase.from('tenants').select('id, full_name').in('id', tenantIds) : Promise.resolve({ data: [] }),
      ]);
      return rows.map((l) => ({
        ...l,
        unit_number: units.data?.find((u) => u.id === l.unit_id)?.unit_number ?? '—',
        tenant_name: tenants.data?.find((t) => t.id === l.tenant_id)?.full_name ?? '—',
      }));
    },
  });

  const rows = useMemo(() => {
    const list = leases.data ?? [];
    return statusFilter ? list.filter((l) => l.status === statusFilter) : list;
  }, [leases.data, statusFilter]);

  const countOf = (s: LeaseStatus) => (leases.data ?? []).filter((l) => l.status === s).length;

  if (leases.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Leases</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{rows.length} shown</p>
        </div>
        {perms.can('leases', 'create') && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New lease</Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
          All · {(leases.data ?? []).length}
        </FilterChip>
        {LEASE_STATUSES.map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s} · {countOf(s)}
          </FilterChip>
        ))}
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState
            title={leases.data?.length ? 'No leases in this status' : 'No leases yet'}
            hint="A lease binds a tenant to a unit — activating one flips the unit to occupied automatically."
          />
        ) : (
          <Card>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-4">Unit</th>
                    <th className="py-2 pr-4">Tenant</th>
                    <th className="py-2 pr-4">Period</th>
                    <th className="py-2 pr-4">Rent</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <td className="py-2.5 pr-4">
                        <Link to={`/leases/${l.id}`} className="font-mono text-xs font-medium text-brand hover:underline">{l.unit_number}</Link>
                      </td>
                      <td className="py-2.5 pr-4">{l.tenant_name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{l.start_date} → {l.end_date}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{money(l.rent_amount)} <span className="text-xs text-zinc-400">/{l.rent_frequency}</span></td>
                      <td className="py-2.5 pr-4"><LeaseStatusBadge status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New lease">
        <LeaseWizard
          onDone={(msg, tone) => {
            setCreateOpen(false);
            flash(msg, tone);
            void qc.invalidateQueries({ queryKey: leaseKeys.all });
            void qc.invalidateQueries({ queryKey: unitKeys.all });
            void qc.invalidateQueries({ queryKey: propertyKeys.stats() });
          }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-400'
      }`}
    >
      {children}
    </button>
  );
}

function LeaseWizard({ onDone }: { onDone: (msg: string, tone?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [activateNow, setActivateNow] = useState(true);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: true }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const units = useQuery({
    queryKey: [...unitKeys.list(propertyId || 'none'), 'available'],
    enabled: Boolean(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units').select('id, unit_number, base_rent, rent_frequency, service_charge')
        .eq('property_id', propertyId).eq('status', 'available').is('deleted_at', null).order('unit_number');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const tenants = useQuery({
    queryKey: tenantKeys.list({ picker: true }),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id, full_name').is('deleted_at', null).order('full_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 364 * 86400000).toISOString().slice(0, 10);

  const form = useForm<LeaseInput>({
    resolver: zodResolver(leaseSchema),
    defaultValues: { start_date: today, end_date: nextYear, rent_frequency: 'annual', rent_amount: 0, service_charge: 0, deposit_amount: 0 },
  });
  const err = form.formState.errors;

  const pickUnit = (unitId: string) => {
    form.setValue('unit_id', unitId);
    const u = units.data?.find((x) => x.id === unitId);
    if (u) {
      form.setValue('rent_amount', u.base_rent);
      form.setValue('rent_frequency', u.rent_frequency);
      form.setValue('service_charge', u.service_charge);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    const payload = { ...values, status: activateNow ? ('active' as const) : ('draft' as const) };
    const { data, error } = await supabase.from('leases').insert(payload).select().single();
    if (error) {
      onDone(
        error.message.includes('one_live_lease_per_unit')
          ? 'That unit already has a live lease.'
          : error.message,
        'err',
      );
      return;
    }
    if (activateNow && values.deposit_amount > 0) {
      await supabase.from('security_deposits').insert({ lease_id: data.id, amount: values.deposit_amount, status: 'held' });
    }
    await rpc.logActivity({
      module: 'leases', action: activateNow ? 'created_active' : 'created_draft',
      entityType: 'lease', entityId: data.id,
      after: JSON.parse(JSON.stringify(payload)) as never,
    });
    onDone(activateNow ? 'Lease activated — unit is now occupied' : 'Draft lease created');
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); form.setValue('unit_id', ''); }}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Unit" hint="Only available units are listed." error={err.unit_id?.message}>
        <Select value={form.watch('unit_id') ?? ''} onChange={(e) => pickUnit(e.target.value)} disabled={!propertyId}>
          <option value="">{propertyId ? (units.data?.length ? 'Select…' : 'No available units') : 'Pick a property first'}</option>
          {units.data?.map((u) => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
        </Select>
      </Field>
      <Field label="Tenant" error={err.tenant_id?.message}>
        <Select {...form.register('tenant_id')}>
          <option value="">Select…</option>
          {tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" error={err.start_date?.message}><Input type="date" {...form.register('start_date')} /></Field>
        <Field label="End date" error={err.end_date?.message}><Input type="date" {...form.register('end_date')} /></Field>
        <Field label="Rent / period" error={err.rent_amount?.message}><Input type="number" min={0} step="0.01" {...form.register('rent_amount')} /></Field>
        <Field label="Frequency" error={err.rent_frequency?.message}>
          <Select {...form.register('rent_frequency')}>
            <option value="annual">Annual</option><option value="biannual">Biannual</option>
            <option value="quarterly">Quarterly</option><option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Service charge" error={err.service_charge?.message}><Input type="number" min={0} step="0.01" {...form.register('service_charge')} /></Field>
        <Field label="Security deposit" error={err.deposit_amount?.message}><Input type="number" min={0} step="0.01" {...form.register('deposit_amount')} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} className="h-4 w-4 accent-[var(--brand-primary)]" />
        Activate immediately (marks the unit occupied{form.watch('deposit_amount') > 0 ? ', records the deposit as held' : ''})
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating…' : activateNow ? 'Create & activate' : 'Create draft'}
        </Button>
      </div>
    </form>
  );
}
