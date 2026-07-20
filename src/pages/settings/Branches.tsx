import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { branchKeys } from '../../api/keys';
import { branchSchema, type BranchInput } from '../../schemas';
import type { BranchRow } from '../../lib/database.types';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export default function Branches() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<BranchRow | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: branchKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ values, existing }: { values: BranchInput; existing: BranchRow | null }) => {
      if (existing) {
        const { error } = await supabase.from('branches').update(values).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await rpc.logActivity({
          module: 'branches', action: 'updated', entityType: 'branch', entityId: existing.id,
          before: JSON.parse(JSON.stringify(existing)) as never,
          after: JSON.parse(JSON.stringify(values)) as never,
        });
      } else {
        const { data, error } = await supabase.from('branches').insert(values).select().single();
        if (error) throw new Error(error.message);
        await rpc.logActivity({
          module: 'branches', action: 'created', entityType: 'branch', entityId: data.id,
          after: JSON.parse(JSON.stringify(values)) as never,
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: branchKeys.all });
      setEditing(null);
      setToast('Branch saved');
      setTimeout(() => setToast(null), 2500);
    },
  });

  if (isLoading) return <PageSpinner />;

  return (
    <Card>
      <CardHeader
        title="Branches"
        subtitle="Branch assignment scopes what branch-level roles can see."
        action={
          <Button variant="outline" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add branch
          </Button>
        }
      />
      <CardBody>
        {!branches?.length ? (
          <EmptyState title="No branches yet" hint="Add your head office to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4 font-medium">
                      {b.name} {b.is_head_office && <Badge tone="brand">HQ</Badge>}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{b.code ?? '—'}</td>
                    <td className="py-2.5 pr-4">{b.city ?? '—'}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={b.status === 'active' ? 'green' : 'zinc'}>{b.status}</Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <button className="text-sm font-medium text-brand hover:underline" onClick={() => setEditing(b)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add branch' : 'Edit branch'}>
        {editing !== null && (
          <BranchForm
            existing={editing === 'new' ? null : editing}
            pending={save.isPending}
            error={save.isError ? (save.error as Error).message : null}
            onSubmit={(values) => save.mutate({ values, existing: editing === 'new' ? null : editing })}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast} tone="ok" />}
    </Card>
  );
}

function BranchForm({
  existing, onSubmit, pending, error,
}: {
  existing: BranchRow | null;
  onSubmit: (v: BranchInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const form = useForm<BranchInput>({
    resolver: zodResolver(branchSchema),
    defaultValues: existing
      ? { name: existing.name, code: existing.code ?? '', address: existing.address ?? '', city: existing.city ?? '', state: existing.state ?? '', country: existing.country, phone: existing.phone ?? '', email: existing.email ?? '', is_head_office: existing.is_head_office }
      : { country: 'Nigeria', is_head_office: false },
  });
  const err = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
      <Field label="Name" error={err.name?.message}><Input {...form.register('name')} /></Field>
      <Field label="Code" hint="e.g. LAG-01" error={err.code?.message}><Input {...form.register('code')} /></Field>
      <Field label="City" error={err.city?.message}><Input {...form.register('city')} /></Field>
      <Field label="State" error={err.state?.message}><Input {...form.register('state')} /></Field>
      <Field label="Country" error={err.country?.message}><Input {...form.register('country')} /></Field>
      <Field label="Phone" error={err.phone?.message}><Input {...form.register('phone')} /></Field>
      <div className="md:col-span-2">
        <Field label="Email" error={err.email?.message}><Input type="email" {...form.register('email')} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" {...form.register('is_head_office')} className="h-4 w-4 accent-[var(--brand-primary)]" />
        This is the head office
      </label>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save branch'}</Button>
      </div>
    </form>
  );
}
