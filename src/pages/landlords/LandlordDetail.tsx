import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { landlordKeys, propertyKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { LandlordForm, type LandlordFormValues } from './LandlordsList';

export default function LandlordDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('landlords', 'update');
  const [tab, setTab] = useState<'Profile' | 'Ownership'>('Profile');
  const [addOwnOpen, setAddOwnOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const landlord = useQuery({
    queryKey: landlordKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('landlords').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const ownership = useQuery({
    queryKey: landlordKeys.ownership(id),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('ownership_records').select('*').eq('landlord_id', id).is('deleted_at', null);
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((r) => r.property_id))];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      return rows.map((r) => ({
        ...r,
        property_name: props?.find((p) => p.id === r.property_id)?.name ?? '—',
      }));
    },
  });

  const update = useMutation({
    mutationFn: async (v: LandlordFormValues) => {
      const l = landlord.data;
      if (!l) throw new Error('Not loaded');
      const patch = {
        kind: v.kind, full_name: v.full_name, contact_person: v.contact_person || null,
        phone: v.phone || null, email: v.email || null, address: v.address || null,
        bank_details: { bank: v.bank, account_name: v.account_name, account_no: v.account_no },
      };
      const { error } = await supabase.from('landlords').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'landlords', action: 'updated', entityType: 'landlord', entityId: id,
        before: JSON.parse(JSON.stringify(l)) as never, after: JSON.parse(JSON.stringify(patch)) as never,
      });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: landlordKeys.all }); flash('Landlord updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (landlord.isLoading) return <PageSpinner />;
  if (!landlord.data) return <div className="p-6"><EmptyState title="Landlord not found" /></div>;
  const l = landlord.data;
  const bank = (l.bank_details ?? {}) as { bank?: string; account_name?: string; account_no?: string };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Landlord · {l.kind}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-semibold">{l.full_name}</h1>
        {l.user_id ? <Badge tone="green">portal linked</Badge> : <Badge tone="zinc">no portal login</Badge>}
      </div>

      <div className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-[#1C1C34]">
        {(['Profile', 'Ownership'] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === x ? 'border-brand text-brand' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}>
            {x}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'Profile' && (
          <Card>
            <CardHeader title="Profile & disbursement details" />
            <CardBody>
              {canEdit ? (
                <LandlordForm
                  initial={{
                    kind: l.kind, full_name: l.full_name, contact_person: l.contact_person ?? '',
                    phone: l.phone ?? '', email: l.email ?? '', address: l.address ?? '',
                    bank: bank.bank ?? '', account_name: bank.account_name ?? '', account_no: bank.account_no ?? '',
                  }}
                  pending={update.isPending}
                  error={update.isError ? (update.error as Error).message : null}
                  onSubmit={(v) => update.mutate(v)}
                />
              ) : (
                <p className="text-sm text-zinc-500">Read-only for your role.</p>
              )}
            </CardBody>
          </Card>
        )}

        {tab === 'Ownership' && (
          <Card>
            <CardHeader
              title="Ownership records"
              subtitle="Ownership is what makes properties visible on the landlord's portal and drives statement math."
              action={canEdit ? (
                <Button variant="outline" onClick={() => setAddOwnOpen(true)}><Plus className="h-4 w-4" /> Add</Button>
              ) : undefined}
            />
            <CardBody>
              {ownership.isLoading ? <PageSpinner /> : (ownership.data?.length ?? 0) === 0 ? (
                <EmptyState title="No ownership recorded" hint="Link this landlord to a property with their ownership % and management fee." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                        <th className="py-2 pr-4">Property</th>
                        <th className="py-2 pr-4">Ownership</th>
                        <th className="py-2 pr-4">Mgmt fee</th>
                        <th className="py-2 pr-4">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownership.data!.map((o) => (
                        <tr key={o.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                          <td className="py-2.5 pr-4">
                            <Link to={`/properties/${o.property_id}`} className="font-medium text-brand hover:underline">{o.property_name}</Link>
                            {o.unit_id && <span className="ml-1 text-xs text-zinc-400">(single unit)</span>}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums">{o.ownership_percent}%</td>
                          <td className="py-2.5 pr-4 tabular-nums">{o.management_fee_percent}%</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{o.start_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <Dialog open={addOwnOpen} onClose={() => setAddOwnOpen(false)} title="Add ownership record">
        <OwnershipForm
          landlordId={id}
          onDone={(m, t) => { setAddOwnOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: landlordKeys.ownership(id) }); }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function OwnershipForm({ landlordId, onDone }: { landlordId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [percent, setPercent] = useState('100');
  const [fee, setFee] = useState('10');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'ownership' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!propertyId) return onDone('Pick a property', 'err');
    const pct = Number(percent), f = Number(fee);
    if (!(pct > 0 && pct <= 100)) return onDone('Ownership must be between 0 and 100%', 'err');
    if (!(f >= 0 && f < 100)) return onDone('Management fee must be below 100%', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('ownership_records')
      .insert({ landlord_id: landlordId, property_id: propertyId, ownership_percent: pct, management_fee_percent: f, start_date: start })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'landlords', action: 'ownership_added', entityType: 'ownership_record', entityId: data.id });
    onDone('Ownership recorded');
  };

  return (
    <div className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Ownership %"><Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>
        <Field label="Mgmt fee %"><Input type="number" min={0} max={99} value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
        <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add ownership'}</Button>
      </div>
    </div>
  );
}
