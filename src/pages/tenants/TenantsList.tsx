import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { tenantKeys } from '../../api/keys';
import { tenantSchema, type TenantInput } from '../../schemas';
import type { TenantRow } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export default function TenantsList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tenants = useQuery({
    queryKey: tenantKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: TenantInput) => {
      const { data, error } = await supabase.from('tenants').insert(values).select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'tenants', action: 'created', entityType: 'tenant', entityId: data.id });
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tenantKeys.all });
      setCreateOpen(false);
      setToast('Tenant created');
      setTimeout(() => setToast(null), 2500);
    },
  });

  const rows = useMemo(() => {
    const list = tenants.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((t) => `${t.full_name} ${t.phone ?? ''} ${t.email ?? ''}`.toLowerCase().includes(s));
  }, [tenants.data, q]);

  if (tenants.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Tenants</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{rows.length} of {tenants.data?.length ?? 0}</p>
        </div>
        {perms.can('tenants', 'create') && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add tenant</Button>
        )}
      </div>
      <Input placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} className="mt-4 max-w-sm" />

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState title={tenants.data?.length ? 'No tenants match' : 'No tenants yet'} hint="Tenants attach to units through leases." />
        ) : (
          <Card>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Kind</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Portal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <td className="py-2.5 pr-4">
                        <Link to={`/tenants/${t.id}`} className="font-medium text-brand hover:underline">{t.full_name}</Link>
                      </td>
                      <td className="py-2.5 pr-4">{t.kind}</td>
                      <td className="py-2.5 pr-4">{t.phone ?? '—'}</td>
                      <td className="py-2.5 pr-4">{t.email ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        {t.user_id ? <Badge tone="green">linked</Badge> : <Badge tone="zinc">no login</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add tenant">
        <TenantForm
          pending={create.isPending}
          error={create.isError ? (create.error as Error).message : null}
          onSubmit={(v) => create.mutate(v)}
        />
      </Dialog>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

export function TenantForm({
  existing, onSubmit, pending, error,
}: {
  existing?: TenantRow;
  onSubmit: (v: TenantInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const form = useForm<TenantInput>({
    resolver: zodResolver(tenantSchema),
    defaultValues: existing
      ? {
          kind: existing.kind, full_name: existing.full_name, contact_person: existing.contact_person ?? '',
          phone: existing.phone ?? '', email: existing.email ?? '', id_type: existing.id_type ?? '',
          id_number: existing.id_number ?? '', employer: existing.employer ?? '',
        }
      : { kind: 'individual' },
  });
  const err = form.formState.errors;
  const kind = form.watch('kind');

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
      <Field label="Kind" error={err.kind?.message}>
        <Select {...form.register('kind')}>
          <option value="individual">Individual</option>
          <option value="corporate">Corporate</option>
        </Select>
      </Field>
      <Field label={kind === 'corporate' ? 'Company name' : 'Full name'} error={err.full_name?.message}>
        <Input {...form.register('full_name')} />
      </Field>
      {kind === 'corporate' && (
        <Field label="Contact person" error={err.contact_person?.message}><Input {...form.register('contact_person')} /></Field>
      )}
      <Field label="Phone" error={err.phone?.message}><Input {...form.register('phone')} /></Field>
      <Field label="Email" error={err.email?.message}><Input type="email" {...form.register('email')} /></Field>
      <Field label="ID type" error={err.id_type?.message}><Input placeholder="e.g. National ID, Passport" {...form.register('id_type')} /></Field>
      <Field label="ID number" error={err.id_number?.message}><Input {...form.register('id_number')} /></Field>
      <Field label="Employer" error={err.employer?.message}><Input {...form.register('employer')} /></Field>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : existing ? 'Save changes' : 'Create tenant'}</Button>
      </div>
    </form>
  );
}
