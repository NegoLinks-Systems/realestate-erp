import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { facilityKeys, propertyKeys } from '../../api/keys';
import type { AssetRow, AssetStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { ASSET_CATEGORIES, ASSET_STATUSES, AssetStatusBadge } from './shared';

const TABS = [
  { label: 'Assets', to: '/facilities', end: true },
  { label: 'Operations', to: '/facilities/operations' },
  { label: 'Inspections', to: '/facilities/inspections' },
];

export default function FacilitiesLayout() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold">Facilities</h1>
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

export function AssetsList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'' | AssetStatus>('');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const assets = useQuery({
    queryKey: facilityKeys.assets(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('assets').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((a) => a.property_id))];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      return rows.map((a) => ({ ...a, property_name: props?.find((p) => p.id === a.property_id)?.name ?? '—' }));
    },
  });

  const create = useMutation({
    mutationFn: async (values: AssetFormValues) => {
      const { data, error } = await supabase
        .from('assets')
        .insert({
          property_id: values.property_id, category: values.category, name: values.name,
          serial_number: values.serial_number || null, location_note: values.location_note || null,
          purchase_date: values.purchase_date || null, purchase_cost: values.purchase_cost ? Number(values.purchase_cost) : null,
          warranty_expiry: values.warranty_expiry || null, status: values.status,
        })
        .select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'facilities', action: 'asset_added', entityType: 'asset', entityId: data.id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: facilityKeys.assets() }); setCreateOpen(false); flash('Asset added'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const rows = useMemo(() => {
    let list = assets.data ?? [];
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    if (q.trim()) list = list.filter((a) => `${a.name} ${a.serial_number ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [assets.data, statusFilter, q]);

  if (assets.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, serial…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | AssetStatus)} className="w-44">
          <option value="">Any status</option>
          {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        {perms.can('facilities', 'create') && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add asset</Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={assets.data?.length ? 'No assets match' : 'No assets yet'} hint="Track generators, lifts, pumps, HVAC — anything that needs servicing." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4">Asset</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Last serviced</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2.5 pr-4">
                      <Link to={`/facilities/assets/${a.id}`} className="font-medium text-brand hover:underline">{a.name}</Link>
                      {a.serial_number && <span className="ml-1 font-mono text-xs text-zinc-400">{a.serial_number}</span>}
                    </td>
                    <td className="py-2.5 pr-4">{a.category.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-4">{a.property_name}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{a.last_serviced_at ?? '—'}</td>
                    <td className="py-2.5 pr-4"><AssetStatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add asset">
        <AssetForm pending={create.isPending} onSubmit={(v) => create.mutate(v)} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

interface AssetFormValues {
  property_id: string;
  category: AssetRow['category'];
  name: string;
  serial_number: string;
  location_note: string;
  purchase_date: string;
  purchase_cost: string;
  warranty_expiry: string;
  status: AssetStatus;
}

function AssetForm({ existing, onSubmit, pending }: { existing?: AssetRow; onSubmit: (v: AssetFormValues) => void; pending: boolean }) {
  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'asset' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const [v, setV] = useState<AssetFormValues>({
    property_id: existing?.property_id ?? '',
    category: existing?.category ?? 'other',
    name: existing?.name ?? '',
    serial_number: existing?.serial_number ?? '',
    location_note: existing?.location_note ?? '',
    purchase_date: existing?.purchase_date ?? '',
    purchase_cost: existing?.purchase_cost != null ? String(existing.purchase_cost) : '',
    warranty_expiry: existing?.warranty_expiry ?? '',
    status: existing?.status ?? 'operational',
  });
  const set = (k: keyof AssetFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><Field label="Name"><Input value={v.name} onChange={set('name')} /></Field></div>
      <Field label="Property">
        <Select value={v.property_id} onChange={set('property_id')}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Category">
        <Select value={v.category} onChange={set('category')}>
          {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Serial number"><Input value={v.serial_number} onChange={set('serial_number')} /></Field>
      <Field label="Status">
        <Select value={v.status} onChange={set('status')}>
          {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
      </Field>
      <div className="md:col-span-2"><Field label="Location"><Input value={v.location_note} onChange={set('location_note')} placeholder="e.g. Basement plant room" /></Field></div>
      <Field label="Purchase date"><Input type="date" value={v.purchase_date} onChange={set('purchase_date')} /></Field>
      <Field label="Purchase cost"><Input type="number" min={0} step="0.01" value={v.purchase_cost} onChange={set('purchase_cost')} /></Field>
      <Field label="Warranty expiry"><Input type="date" value={v.warranty_expiry} onChange={set('warranty_expiry')} /></Field>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={() => v.name.trim() && v.property_id && onSubmit(v)} disabled={pending || !v.name.trim() || !v.property_id}>
          {pending ? 'Saving…' : 'Save asset'}
        </Button>
      </div>
    </div>
  );
}

/* ============ asset detail ============ */
export function AssetDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canEdit = perms.can('facilities', 'update');
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const asset = useQuery({
    queryKey: facilityKeys.asset(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('assets').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const { data: property } = await supabase.from('properties').select('id, name').eq('id', data.property_id).single();
      return { ...data, property };
    },
  });

  const history = useQuery({
    queryKey: facilityKeys.serviceHistory(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_service_history').select('*').eq('asset_id', id).order('serviced_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (values: AssetFormValues) => {
      const { error } = await supabase
        .from('assets')
        .update({
          property_id: values.property_id, category: values.category, name: values.name,
          serial_number: values.serial_number || null, location_note: values.location_note || null,
          purchase_date: values.purchase_date || null, purchase_cost: values.purchase_cost ? Number(values.purchase_cost) : null,
          warranty_expiry: values.warranty_expiry || null, status: values.status,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'facilities', action: 'asset_updated', entityType: 'asset', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: facilityKeys.all }); setEditOpen(false); flash('Asset updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (asset.isLoading) return <PageSpinner />;
  if (!asset.data) return <div className="p-6"><EmptyState title="Asset not found" /></div>;
  const a = asset.data;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">{a.category.replace('_', ' ')} · {a.property?.name}</p>
          <h1 className="mt-0.5 font-display text-xl font-semibold">{a.name}</h1>
        </div>
        <AssetStatusBadge status={a.status} />
        {canEdit && <Button variant="outline" className="ml-auto" onClick={() => setEditOpen(true)}>Edit</Button>}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Serial" value={a.serial_number ?? '—'} mono />
            <Row label="Location" value={a.location_note ?? '—'} />
            <Row label="Purchased" value={a.purchase_date ?? '—'} mono />
            <Row label="Cost" value={a.purchase_cost != null ? money(Number(a.purchase_cost)) : '—'} />
            <Row label="Warranty until" value={a.warranty_expiry ?? '—'} mono />
            <Row label="Last serviced" value={a.last_serviced_at ?? 'never'} mono />
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader
            title="Service history"
            subtitle="Written automatically when a work order linked to this asset is verified."
          />
          <CardBody>
            {history.isLoading ? <PageSpinner /> : (history.data?.length ?? 0) === 0 ? (
              <EmptyState title="No service history" hint="Link a maintenance work order to this asset; verifying it records the service here." />
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {history.data!.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{h.summary ?? 'Service'}</p>
                      <p className="font-mono text-xs text-zinc-400">{h.serviced_at}</p>
                    </div>
                    <span className="ml-auto tabular-nums">{money(Number(h.cost))}</span>
                    <Link to={`/maintenance/work-orders/${h.work_order_id}`} className="text-xs font-medium text-brand hover:underline">view WO</Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit asset">
        <AssetForm existing={a} pending={update.isPending} onSubmit={(v) => update.mutate(v)} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  );
}
