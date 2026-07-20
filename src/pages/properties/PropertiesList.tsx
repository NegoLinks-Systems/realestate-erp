import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, LayoutGrid, List, MapPin, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { branchKeys, propertyKeys } from '../../api/keys';
import { propertySchema, type PropertyInput } from '../../schemas';
import type { PropertyRow, PropertyType } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ExportMenu } from '../../components/ui/ExportMenu';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { PROPERTY_TYPES, PropertyStatusBadge, typeLabel } from './shared';

interface Filters { type: '' | PropertyType; branch: string; status: string; q: string }

export default function PropertiesList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [filters, setFilters] = useState<Filters>({ type: '', branch: '', status: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const branches = useQuery({
    queryKey: branchKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const properties = useQuery({
    queryKey: propertyKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: PropertyInput) => {
      const { data, error } = await supabase.from('properties').insert(values).select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'properties', action: 'created', entityType: 'property', entityId: data.id,
        after: JSON.parse(JSON.stringify(values)) as never,
      });
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyKeys.all });
      setCreateOpen(false);
      setToast('Property created');
      setTimeout(() => setToast(null), 2500);
    },
  });

  const rows = useMemo(() => {
    let list = properties.data ?? [];
    if (filters.type) list = list.filter((p) => p.property_type === filters.type);
    if (filters.branch) list = list.filter((p) => p.branch_id === filters.branch);
    if (filters.status) list = list.filter((p) => p.status === filters.status);
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase();
      list = list.filter((p) => `${p.name} ${p.city ?? ''} ${p.code ?? ''}`.toLowerCase().includes(q));
    }
    return list;
  }, [properties.data, filters]);

  if (properties.isLoading || branches.isLoading) return <PageSpinner />;

  const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? '—';

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Properties</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{rows.length} of {properties.data?.length ?? 0} in portfolio</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-zinc-200 dark:border-[#1C1C34]">
            <button aria-label="Card view" onClick={() => setView('cards')} className={`p-2 ${view === 'cards' ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}><LayoutGrid className="h-4 w-4" /></button>
            <button aria-label="Table view" onClick={() => setView('table')} className={`p-2 ${view === 'table' ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}><List className="h-4 w-4" /></button>
          </div>
          <ExportMenu rows={rows.map((p) => ({ Name: p.name, Type: p.property_type, Address: p.address ?? '', Status: p.status }))} filename="properties" sheetName="Properties" />
          {perms.can('properties', 'create') && (
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add property</Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search name, city, code…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <Select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters['type'] }))}>
          <option value="">All types</option>
          {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select value={filters.branch} onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}>
          <option value="">All branches</option>
          {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="under_development">Under development</option>
          <option value="inactive">Inactive</option>
          <option value="sold">Sold</option>
        </Select>
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState
            title={properties.data?.length ? 'Nothing matches those filters' : 'No properties yet'}
            hint={properties.data?.length ? 'Loosen a filter to see more.' : 'Add your first property to bring the dashboard to life.'}
          />
        ) : view === 'cards' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => <PropertyCard key={p.id} p={p} branch={branchName(p.branch_id)} />)}
          </div>
        ) : (
          <Card>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Branch</th>
                    <th className="py-2 pr-4">City</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                      <td className="py-2.5 pr-4">
                        <Link to={`/properties/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link>
                      </td>
                      <td className="py-2.5 pr-4">{typeLabel(p.property_type)}</td>
                      <td className="py-2.5 pr-4">{branchName(p.branch_id)}</td>
                      <td className="py-2.5 pr-4">{p.city ?? '—'}</td>
                      <td className="py-2.5 pr-4"><PropertyStatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add property">
        <PropertyForm
          branches={branches.data ?? []}
          pending={create.isPending}
          error={create.isError ? (create.error as Error).message : null}
          onSubmit={(v) => create.mutate(v)}
        />
      </Dialog>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

function PropertyCard({ p, branch }: { p: PropertyRow; branch: string }) {
  return (
    <Link to={`/properties/${p.id}`} className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardBody>
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <PropertyStatusBadge status={p.status} />
          </div>
          <p className="mt-3 font-display font-semibold group-hover:text-brand">{p.name}</p>
          <p className="mt-0.5 text-sm text-zinc-500">{typeLabel(p.property_type)} · {branch}</p>
          {(p.city || p.address) && (
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
              <MapPin className="h-3 w-3" /> {[p.address, p.city].filter(Boolean).join(', ')}
            </p>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

export function PropertyForm({
  branches, onSubmit, pending, error, existing,
}: {
  branches: { id: string; name: string }[];
  onSubmit: (v: PropertyInput) => void;
  pending: boolean;
  error: string | null;
  existing?: PropertyRow;
}) {
  const form = useForm<PropertyInput>({
    resolver: zodResolver(propertySchema),
    defaultValues: existing
      ? {
          branch_id: existing.branch_id, name: existing.name, property_type: existing.property_type,
          address: existing.address ?? '', city: existing.city ?? '', state: existing.state ?? '',
          country: existing.country, year_built: existing.year_built ?? undefined, description: existing.description ?? '',
        }
      : { country: 'Nigeria', branch_id: branches[0]?.id ?? '' },
  });
  const err = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Name" error={err.name?.message}><Input {...form.register('name')} /></Field>
      </div>
      <Field label="Type" error={err.property_type?.message}>
        <Select {...form.register('property_type')}>
          {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      <Field label="Branch" error={err.branch_id?.message}>
        <Select {...form.register('branch_id')}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <Field label="City" error={err.city?.message}><Input {...form.register('city')} /></Field>
      <Field label="State" error={err.state?.message}><Input {...form.register('state')} /></Field>
      <div className="md:col-span-2">
        <Field label="Address" error={err.address?.message}><Input {...form.register('address')} /></Field>
      </div>
      <Field label="Year built" error={err.year_built?.message}>
        <Input type="number" {...form.register('year_built')} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Description" error={err.description?.message}><Textarea rows={2} {...form.register('description')} /></Field>
      </div>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={pending || branches.length === 0}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create property'}
        </Button>
      </div>
      {branches.length === 0 && (
        <p className="text-xs text-amber-700 md:col-span-2">Create a branch in Settings first — every property belongs to one.</p>
      )}
    </form>
  );
}
