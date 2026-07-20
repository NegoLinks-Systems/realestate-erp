import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, PlayCircle, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { parkingKeys, propertyKeys } from '../../api/keys';
import type { SpaceStatus, SpaceType } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

function SpaceStatusBadge({ status }: { status: SpaceStatus }) {
  const tone = status === 'available' ? 'green' : status === 'allocated' ? 'brand' : 'zinc';
  return <Badge tone={tone as 'green' | 'brand' | 'zinc'}>{status}</Badge>;
}

const TABS = ['Spaces', 'Allocations', 'Vehicles'] as const;
type Tab = (typeof TABS)[number];

export default function ParkingPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canEdit = perms.can('parking', 'update');
  const [tab, setTab] = useState<Tab>('Spaces');
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const runBilling = useMutation({
    mutationFn: async () => {
      const created = await rpc.parkingBillingRun();
      await rpc.logActivity({ module: 'parking', action: 'parking_billing_run', entityType: 'system', entityId: 'parking_billing_run', after: { created } as never });
      return created;
    },
    onSuccess: (n) => flash(n > 0 ? `Billed ${n} parking allocation${n === 1 ? '' : 's'} this month` : 'Parking billing complete — nothing new to bill'),
    onError: (e) => flash((e as Error).message, 'err'),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-semibold">Parking</h1>
        {perms.can('parking', 'create') && (
          <Button variant="outline" className="ml-auto" onClick={() => runBilling.mutate()} disabled={runBilling.isPending}>
            <PlayCircle className="h-4 w-4" /> {runBilling.isPending ? 'Billing…' : 'Run parking billing'}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-500">Monthly parking fees invoice tenants automatically through Finance; run it on demand here.</p>

      <div className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-[#1C1C34]">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === x ? 'border-brand text-brand' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}>
            {x}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'Spaces' && <SpacesTab canEdit={canEdit} flash={flash} />}
        {tab === 'Allocations' && <AllocationsTab canEdit={canEdit} money={money} flash={flash} />}
        {tab === 'Vehicles' && <VehiclesTab canEdit={canEdit} flash={flash} />}
      </div>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

/* -------- spaces (zones + spaces) -------- */
function SpacesTab({ canEdit, flash }: { canEdit: boolean; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [addZoneOpen, setAddZoneOpen] = useState(false);
  const [addSpaceFor, setAddSpaceFor] = useState<{ id: string; name: string } | null>(null);

  const zones = useQuery({
    queryKey: parkingKeys.zones(),
    queryFn: async () => {
      const { data, error } = await supabase.from('parking_zones').select('*').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const spaces = useQuery({
    queryKey: parkingKeys.spaces(),
    queryFn: async () => {
      const { data, error } = await supabase.from('parking_spaces').select('*').is('deleted_at', null).order('space_number');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (zones.isLoading || spaces.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setAddZoneOpen(true)}><Plus className="h-4 w-4" /> Add zone</Button>}
      {(zones.data?.length ?? 0) === 0 ? (
        <EmptyState title="No parking zones yet" hint="Create a zone, then add spaces to it." />
      ) : (
        zones.data!.map((z) => {
          const zSpaces = (spaces.data ?? []).filter((s) => s.zone_id === z.id);
          return (
            <Card key={z.id}>
              <CardHeader
                title={z.name}
                subtitle={`${zSpaces.length} spaces · ${zSpaces.filter((s) => s.status === 'available').length} available`}
                action={canEdit ? <Button variant="outline" onClick={() => setAddSpaceFor({ id: z.id, name: z.name })}><Plus className="h-4 w-4" /> Add space</Button> : undefined}
              />
              <CardBody>
                {zSpaces.length === 0 ? (
                  <p className="text-sm text-zinc-500">No spaces yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {zSpaces.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-sm dark:border-[#1C1C34]">
                        <span className="font-mono text-xs font-medium">{s.space_number}</span>
                        <span className="text-xs text-zinc-400">{s.space_type}</span>
                        <SpaceStatusBadge status={s.status} />
                      </span>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })
      )}

      <Dialog open={addZoneOpen} onClose={() => setAddZoneOpen(false)} title="Add parking zone">
        <ZoneForm onDone={(m, t) => { setAddZoneOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: parkingKeys.zones() }); }} />
      </Dialog>

      <Dialog open={addSpaceFor !== null} onClose={() => setAddSpaceFor(null)} title={`Add space — ${addSpaceFor?.name ?? ''}`}>
        {addSpaceFor && (
          <SpaceForm zoneId={addSpaceFor.id} onDone={(m, t) => { setAddSpaceFor(null); flash(m, t); void qc.invalidateQueries({ queryKey: parkingKeys.spaces() }); }} />
        )}
      </Dialog>
    </div>
  );
}

function ZoneForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'parkingzone' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!propertyId) return onDone('Pick a property', 'err');
    if (!name.trim()) return onDone('Name the zone', 'err');
    setPending(true);
    const { data, error } = await supabase.from('parking_zones').insert({ property_id: propertyId, name: name.trim() }).select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'parking', action: 'zone_added', entityType: 'parking_zone', entityId: data.id });
    onDone('Zone added');
  };

  return (
    <div className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Zone name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basement Level 1" /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add zone'}</Button>
      </div>
    </div>
  );
}

function SpaceForm({ zoneId, onDone }: { zoneId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [spaceNumber, setSpaceNumber] = useState('');
  const [spaceType, setSpaceType] = useState<SpaceType>('resident');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!spaceNumber.trim()) return onDone('Enter a space number', 'err');
    setPending(true);
    const { data, error } = await supabase.from('parking_spaces').insert({ zone_id: zoneId, space_number: spaceNumber.trim(), space_type: spaceType }).select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'parking', action: 'space_added', entityType: 'parking_space', entityId: data.id });
    onDone('Space added');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Space number"><Input value={spaceNumber} onChange={(e) => setSpaceNumber(e.target.value)} placeholder="e.g. P-01" /></Field>
        <Field label="Type">
          <Select value={spaceType} onChange={(e) => setSpaceType(e.target.value as SpaceType)}>
            <option value="resident">Resident</option>
            <option value="visitor">Visitor</option>
            <option value="reserved">Reserved</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add space'}</Button>
      </div>
    </div>
  );
}

/* -------- allocations -------- */
function AllocationsTab({ canEdit, money, flash }: { canEdit: boolean; money: (n: number) => string; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);

  const allocations = useQuery({
    queryKey: parkingKeys.allocations(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('parking_allocations').select('*').eq('active', true).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const spaceIds = [...new Set(rows.map((a) => a.space_id))];
      const tenantIds = [...new Set(rows.map((a) => a.tenant_id).filter(Boolean))] as string[];
      const [spaces, tenants] = await Promise.all([
        spaceIds.length ? supabase.from('parking_spaces').select('id, space_number').in('id', spaceIds) : Promise.resolve({ data: [] }),
        tenantIds.length ? supabase.from('tenants').select('id, full_name').in('id', tenantIds) : Promise.resolve({ data: [] }),
      ]);
      return rows.map((a) => ({
        ...a,
        space_number: spaces.data?.find((s) => s.id === a.space_id)?.space_number ?? '—',
        tenant_name: a.tenant_id ? tenants.data?.find((t) => t.id === a.tenant_id)?.full_name ?? '—' : 'Unassigned',
      }));
    },
  });

  const end = useMutation({
    mutationFn: async (id: string) => {
      // deactivating frees the space via the DB trigger
      const { error } = await supabase.from('parking_allocations').update({ active: false, end_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'parking', action: 'allocation_ended', entityType: 'parking_allocation', entityId: id });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: parkingKeys.allocations() });
      void qc.invalidateQueries({ queryKey: parkingKeys.spaces() });
      flash('Allocation ended — space freed');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (allocations.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setAssignOpen(true)}><Plus className="h-4 w-4" /> Allocate space</Button>}
      {(allocations.data?.length ?? 0) === 0 ? (
        <EmptyState title="No active allocations" hint="Allocate a space to a tenant with a monthly fee; it bills through Finance each month." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Space</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Monthly fee</th>
                  <th className="py-2 pr-4">Since</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {allocations.data!.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4 font-mono text-xs font-medium">{a.space_number}</td>
                    <td className="py-2.5 pr-4">{a.tenant_name}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(Number(a.monthly_fee))}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{a.start_date}</td>
                    <td className="py-2.5 text-right">
                      {canEdit && (
                        <button onClick={() => end.mutate(a.id)} className="text-sm font-medium text-zinc-500 hover:text-red-600">End</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} title="Allocate parking space">
        <AllocateForm onDone={(m, t) => { setAssignOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: parkingKeys.allocations() }); void qc.invalidateQueries({ queryKey: parkingKeys.spaces() }); }} />
      </Dialog>
    </div>
  );
}

function AllocateForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [spaceId, setSpaceId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [fee, setFee] = useState('');
  const [pending, setPending] = useState(false);

  const spaces = useQuery({
    queryKey: [...parkingKeys.spaces(), 'available'],
    queryFn: async () => {
      const { data, error } = await supabase.from('parking_spaces').select('id, space_number').eq('status', 'available').is('deleted_at', null).order('space_number');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const tenants = useQuery({
    queryKey: ['parking-tenant-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id, full_name').is('deleted_at', null).order('full_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!spaceId) return onDone('Pick an available space', 'err');
    if (!tenantId) return onDone('Pick a tenant', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('parking_allocations')
      .insert({ space_id: spaceId, tenant_id: tenantId, monthly_fee: Number(fee) || 0 })
      .select().single();
    setPending(false);
    if (error) {
      return onDone(error.message.includes('one_active_allocation_per_space') ? 'That space is already allocated.' : error.message, 'err');
    }
    await rpc.logActivity({ module: 'parking', action: 'space_allocated', entityType: 'parking_allocation', entityId: data.id });
    onDone('Space allocated');
  };

  return (
    <div className="space-y-4">
      <Field label="Available space">
        <Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
          <option value="">{spaces.data?.length ? 'Select…' : 'No available spaces'}</option>
          {spaces.data?.map((s) => <option key={s.id} value={s.id}>{s.space_number}</option>)}
        </Select>
      </Field>
      <Field label="Tenant">
        <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Select…</option>
          {tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </Select>
      </Field>
      <Field label="Monthly fee"><Input type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Allocating…' : 'Allocate'}</Button>
      </div>
    </div>
  );
}

/* -------- vehicles -------- */
function VehiclesTab({ canEdit, flash }: { canEdit: boolean; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const vehicles = useQuery({
    queryKey: parkingKeys.vehicles(),
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('vehicles').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((v) => v.property_id))];
      const { data: props } = propIds.length ? await supabase.from('properties').select('id, name').in('id', propIds) : { data: [] };
      return rows.map((v) => ({ ...v, property_name: props?.find((p) => p.id === v.property_id)?.name ?? '—' }));
    },
  });

  if (vehicles.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Register vehicle</Button>}
      {(vehicles.data?.length ?? 0) === 0 ? (
        <EmptyState title="No vehicles registered" hint="Register resident and staff vehicles with plate and sticker." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.data!.map((v) => (
            <Card key={v.id}>
              <CardBody>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand"><Car className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.plate}</p>
                    <p className="truncate text-sm text-zinc-500">{[v.model, v.color].filter(Boolean).join(' · ') || v.owner_name}</p>
                  </div>
                  {v.sticker_no && <Badge tone="zinc">#{v.sticker_no}</Badge>}
                </div>
                <p className="mt-2 text-xs text-zinc-400">{v.owner_name} · {v.property_name}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Register vehicle">
        <VehicleForm onDone={(m, t) => { setAddOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: parkingKeys.vehicles() }); }} />
      </Dialog>
    </div>
  );
}

function VehicleForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [sticker, setSticker] = useState('');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'vehicle' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!propertyId) return onDone('Pick a property', 'err');
    if (!ownerName.trim() || !plate.trim()) return onDone('Owner and plate are required', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('vehicles')
      .insert({ property_id: propertyId, owner_name: ownerName.trim(), plate: plate.trim(), model: model.trim() || null, color: color.trim() || null, sticker_no: sticker.trim() || null })
      .select().single();
    setPending(false);
    if (error) {
      return onDone(error.message.includes('vehicles_property_id_plate') ? 'That plate is already registered at this property.' : error.message, 'err');
    }
    await rpc.logActivity({ module: 'parking', action: 'vehicle_registered', entityType: 'vehicle', entityId: data.id });
    onDone('Vehicle registered');
  };

  return (
    <div className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner name"><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></Field>
        <Field label="Plate"><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></Field>
        <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
        <Field label="Color"><Input value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="Sticker number (optional)"><Input value={sticker} onChange={(e) => setSticker(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Register vehicle'}</Button>
      </div>
    </div>
  );
}
