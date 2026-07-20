import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys, unitKeys } from '../../../api/keys';
import { unitSchema, type UnitInput } from '../../../schemas';
import type { UnitRow, UnitStatus } from '../../../lib/database.types';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { useMoney } from '../../../providers/BrandingProvider';
import { Card, CardBody } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';
import { UNIT_TYPES, UnitStatusBadge } from '../shared';

const STATUSES: UnitStatus[] = ['available', 'reserved', 'occupied', 'maintenance', 'unlisted'];

export default function UnitsTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();

  const [statusFilter, setStatusFilter] = useState<'' | UnitStatus>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<UnitRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const units = useQuery({
    queryKey: unitKeys.list(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units').select('*').eq('property_id', propertyId).is('deleted_at', null).order('unit_number');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ values, existing }: { values: UnitInput & { status?: UnitStatus; notes?: string | null }; existing: UnitRow | null }) => {
      if (existing) {
        const { error } = await supabase.from('units').update(values).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await rpc.logActivity({
          module: 'units', action: 'updated', entityType: 'unit', entityId: existing.id,
          before: JSON.parse(JSON.stringify(existing)) as never,
          after: JSON.parse(JSON.stringify(values)) as never,
        });
      } else {
        const { data, error } = await supabase.from('units').insert(values).select().single();
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'units', action: 'created', entityType: 'unit', entityId: data.id });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: unitKeys.list(propertyId) });
      void qc.invalidateQueries({ queryKey: propertyKeys.stats() });
      setSelected(null);
      flash('Unit saved');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const rows = useMemo(() => {
    let list = units.data ?? [];
    if (statusFilter) list = list.filter((u) => u.status === statusFilter);
    if (q.trim()) list = list.filter((u) => u.unit_number.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [units.data, statusFilter, q]);

  if (units.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search unit number…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | UnitStatus)} className="w-40">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {perms.can('units', 'create') && (
          <Button className="ml-auto" onClick={() => setSelected('new')}>
            <Plus className="h-4 w-4" /> Add unit
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={units.data?.length ? 'No units match' : 'No units yet'}
          hint={units.data?.length ? 'Adjust the filters.' : 'Add one here, or use the Structure tab to generate a whole floor at once.'}
        />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Beds</th>
                  <th className="py-2 pr-4">Rent / period</th>
                  <th className="py-2 pr-4">Service charge</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-[#1C1C34]/60 dark:hover:bg-zinc-800/40"
                  >
                    <td className="py-2.5 pr-4 font-mono text-xs font-medium">{u.unit_number}</td>
                    <td className="py-2.5 pr-4">{u.unit_type.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-4">{u.bedrooms ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(u.base_rent)} <span className="text-xs text-zinc-400">/{u.rent_frequency}</span></td>
                    <td className="py-2.5 pr-4 tabular-nums">{u.service_charge ? money(u.service_charge) : '—'}</td>
                    <td className="py-2.5 pr-4"><UnitStatusBadge status={u.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected === 'new' ? 'Add unit' : `Unit ${selected?.unit_number ?? ''}`}
      >
        {selected !== null && (
          <UnitForm
            propertyId={propertyId}
            existing={selected === 'new' ? null : selected}
            canEdit={perms.can('units', selected === 'new' ? 'create' : 'update')}
            pending={save.isPending}
            onSubmit={(values) => save.mutate({ values, existing: selected === 'new' ? null : selected })}
          />
        )}
      </Drawer>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function UnitForm({
  propertyId, existing, onSubmit, pending, canEdit,
}: {
  propertyId: string;
  existing: UnitRow | null;
  onSubmit: (v: UnitInput & { status: UnitStatus; notes: string | null }) => void;
  pending: boolean;
  canEdit: boolean;
}) {
  const [status, setStatus] = useState<UnitStatus>(existing?.status ?? 'available');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const form = useForm<UnitInput>({
    resolver: zodResolver(unitSchema),
    defaultValues: existing
      ? {
          property_id: propertyId, unit_number: existing.unit_number, unit_type: existing.unit_type,
          bedrooms: existing.bedrooms ?? undefined, bathrooms: existing.bathrooms ?? undefined,
          size_sqm: existing.size_sqm ?? undefined, base_rent: existing.base_rent,
          rent_frequency: existing.rent_frequency, service_charge: existing.service_charge,
        }
      : { property_id: propertyId, unit_type: 'apartment', rent_frequency: 'annual', base_rent: 0, service_charge: 0 },
  });
  const err = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit((v) => onSubmit({ ...v, status, notes: notes.trim() || null }))}
      className="space-y-4"
    >
      <Field label="Unit number" error={err.unit_number?.message}><Input {...form.register('unit_number')} disabled={!canEdit} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" error={err.unit_type?.message}>
          <Select {...form.register('unit_type')} disabled={!canEdit}>
            {UNIT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)} disabled={!canEdit}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Bedrooms" error={err.bedrooms?.message}><Input type="number" min={0} {...form.register('bedrooms')} disabled={!canEdit} /></Field>
        <Field label="Bathrooms" error={err.bathrooms?.message}><Input type="number" min={0} {...form.register('bathrooms')} disabled={!canEdit} /></Field>
        <Field label="Size (sqm)" error={err.size_sqm?.message}><Input type="number" step="0.01" {...form.register('size_sqm')} disabled={!canEdit} /></Field>
        <Field label="Rent frequency" error={err.rent_frequency?.message}>
          <Select {...form.register('rent_frequency')} disabled={!canEdit}>
            <option value="annual">Annual</option>
            <option value="biannual">Biannual</option>
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Base rent / period" error={err.base_rent?.message}><Input type="number" min={0} step="0.01" {...form.register('base_rent')} disabled={!canEdit} /></Field>
        <Field label="Service charge" error={err.service_charge?.message}><Input type="number" min={0} step="0.01" {...form.register('service_charge')} disabled={!canEdit} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} /></Field>
      {existing && status !== existing.status && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Heads up: when Leases ship, occupied/available flips automatically with the lease — manual status is for setup and exceptions.
        </p>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save unit'}</Button>
        </div>
      )}
    </form>
  );
}
