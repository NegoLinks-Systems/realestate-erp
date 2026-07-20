import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { landlordKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export interface LandlordFormValues {
  kind: 'individual' | 'corporate';
  full_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  bank: string;
  account_name: string;
  account_no: string;
}

export default function LandlordsList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const landlords = useQuery({
    queryKey: landlordKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landlords').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (v: LandlordFormValues) => {
      const { data, error } = await supabase
        .from('landlords')
        .insert({
          kind: v.kind, full_name: v.full_name, contact_person: v.contact_person || null,
          phone: v.phone || null, email: v.email || null, address: v.address || null,
          bank_details: { bank: v.bank, account_name: v.account_name, account_no: v.account_no },
        })
        .select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'landlords', action: 'created', entityType: 'landlord', entityId: data.id });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: landlordKeys.all });
      setCreateOpen(false);
      setToast('Landlord created');
      setTimeout(() => setToast(null), 2500);
    },
  });

  const rows = useMemo(() => {
    const list = landlords.data ?? [];
    if (!q.trim()) return list;
    return list.filter((l) => `${l.full_name} ${l.phone ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  }, [landlords.data, q]);

  if (landlords.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Landlords</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{rows.length} of {landlords.data?.length ?? 0}</p>
        </div>
        {perms.can('landlords', 'create') && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add landlord</Button>
        )}
      </div>
      <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="mt-4 max-w-sm" />

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState title={landlords.data?.length ? 'No landlords match' : 'No landlords yet'}
            hint="Landlords own properties through ownership records; statements are computed from those." />
        ) : (
          <Card>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Kind</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Portal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                      <td className="py-2.5 pr-4">
                        <Link to={`/landlords/${l.id}`} className="font-medium text-brand hover:underline">{l.full_name}</Link>
                      </td>
                      <td className="py-2.5 pr-4">{l.kind}</td>
                      <td className="py-2.5 pr-4">{l.phone ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        {l.user_id ? <Badge tone="green">linked</Badge> : <Badge tone="zinc">no login</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add landlord">
        <LandlordForm
          pending={create.isPending}
          error={create.isError ? (create.error as Error).message : null}
          onSubmit={(v) => create.mutate(v)}
        />
      </Dialog>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

export function LandlordForm({
  initial, onSubmit, pending, error,
}: {
  initial?: Partial<LandlordFormValues>;
  onSubmit: (v: LandlordFormValues) => void;
  pending: boolean;
  error: string | null;
}) {
  const [v, setV] = useState<LandlordFormValues>({
    kind: initial?.kind ?? 'individual',
    full_name: initial?.full_name ?? '',
    contact_person: initial?.contact_person ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    bank: initial?.bank ?? '',
    account_name: initial?.account_name ?? '',
    account_no: initial?.account_no ?? '',
  });
  const set = (k: keyof LandlordFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Kind">
        <Select value={v.kind} onChange={set('kind')}>
          <option value="individual">Individual</option>
          <option value="corporate">Corporate</option>
        </Select>
      </Field>
      <Field label={v.kind === 'corporate' ? 'Company name' : 'Full name'}>
        <Input value={v.full_name} onChange={set('full_name')} />
      </Field>
      {v.kind === 'corporate' && (
        <Field label="Contact person"><Input value={v.contact_person} onChange={set('contact_person')} /></Field>
      )}
      <Field label="Phone"><Input value={v.phone} onChange={set('phone')} /></Field>
      <Field label="Email"><Input type="email" value={v.email} onChange={set('email')} /></Field>
      <div className="md:col-span-2"><Field label="Address"><Input value={v.address} onChange={set('address')} /></Field></div>
      <Field label="Bank" hint="For rent disbursements (Phase 3 statements)."><Input value={v.bank} onChange={set('bank')} /></Field>
      <Field label="Account name"><Input value={v.account_name} onChange={set('account_name')} /></Field>
      <Field label="Account number"><Input value={v.account_no} onChange={set('account_no')} /></Field>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <div className="flex justify-end md:col-span-2">
        <Button onClick={() => v.full_name.trim() && onSubmit(v)} disabled={pending || !v.full_name.trim()}>
          {pending ? 'Saving…' : 'Save landlord'}
        </Button>
      </div>
    </div>
  );
}
