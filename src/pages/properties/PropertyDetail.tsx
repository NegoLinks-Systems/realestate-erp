import { useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { branchKeys, propertyKeys } from '../../api/keys';
import type { PropertyInput } from '../../schemas';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { PropertyForm } from './PropertiesList';
import { PropertyStatusBadge, typeLabel } from './shared';

export function usePropertyId() {
  return useParams<{ id: string }>().id as string;
}

export function useProperty() {
  const id = usePropertyId();
  return useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

const TABS = [
  { label: 'Overview', to: '', end: true },
  { label: 'Structure', to: 'structure' },
  { label: 'Units', to: 'units' },
  { label: 'Photos', to: 'photos' },
  { label: 'Documents', to: 'documents' },
  { label: 'Managers', to: 'managers' },
];

export default function PropertyDetail() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const property = useProperty();
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const branches = useQuery({
    queryKey: branchKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name').is('deleted_at', null);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (values: PropertyInput) => {
      const p = property.data;
      if (!p) throw new Error('Property not loaded');
      const { error } = await supabase.from('properties').update(values).eq('id', p.id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'properties', action: 'updated', entityType: 'property', entityId: p.id,
        before: JSON.parse(JSON.stringify(p)) as never,
        after: JSON.parse(JSON.stringify(values)) as never,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyKeys.all });
      setEditOpen(false);
      setToast('Property updated');
      setTimeout(() => setToast(null), 2500);
    },
  });

  if (property.isLoading) return <PageSpinner />;
  if (!property.data) {
    return <div className="p-6"><EmptyState title="Property not found" hint="It may be outside your assigned scope." /></div>;
  }
  const p = property.data;
  const tabs = p.property_type === 'land' ? [...TABS, { label: 'Land parcels', to: 'parcels' }] : TABS;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">{typeLabel(p.property_type)}</p>
          <h1 className="mt-0.5 truncate font-display text-xl font-semibold">{p.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {[p.address, p.city, p.state].filter(Boolean).join(', ') || 'No address recorded'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PropertyStatusBadge status={p.status} />
          {perms.can('properties', 'update') && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
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

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit property">
        <PropertyForm
          existing={p}
          branches={branches.data ?? []}
          pending={update.isPending}
          error={update.isError ? (update.error as Error).message : null}
          onSubmit={(v) => update.mutate(v)}
        />
      </Dialog>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}
