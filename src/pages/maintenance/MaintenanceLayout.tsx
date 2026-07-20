import { NavLink, Outlet } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { maintenanceKeys, propertyKeys } from '../../api/keys';
import { maintenanceRequestSchema, type MaintenanceRequestInput } from '../../schemas';
import type { MaintenanceRequestRow, RequestStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { CATEGORIES, PRIORITIES, PriorityBadge, RequestStatusBadge } from './shared';

const TABS = [
  { label: 'Requests', to: '/maintenance', end: true },
  { label: 'Work orders', to: '/maintenance/work-orders' },
  { label: 'Contractors', to: '/maintenance/contractors' },
];

export default function MaintenanceLayout() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold">Maintenance</h1>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-[#1C1C34]">
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

export function RequestsList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'' | RequestStatus>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [convertFor, setConvertFor] = useState<MaintenanceRequestRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3500); };

  const requests = useQuery({
    queryKey: maintenanceKeys.requests(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('maintenance_requests').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((r) => r.property_id))];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      return rows.map((r) => ({ ...r, property_name: props?.find((p) => p.id === r.property_id)?.name ?? '—' }));
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_requests').update({ status: 'acknowledged' }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'maintenance', action: 'request_acknowledged', entityType: 'maintenance_request', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: maintenanceKeys.requests() }); flash('Acknowledged'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const rows = useMemo(() => {
    const list = requests.data ?? [];
    return statusFilter ? list.filter((r) => r.status === statusFilter) : list;
  }, [requests.data, statusFilter]);

  if (requests.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | RequestStatus)} className="w-40">
          <option value="">All statuses</option>
          {(['new', 'acknowledged', 'converted', 'rejected'] as RequestStatus[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <span className="text-sm text-zinc-500">{rows.length} requests</span>
        {perms.can('maintenance', 'create') && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Log request</Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={requests.data?.length ? 'No requests in this status' : 'No requests yet'} hint="Tenants raise these from their portal; staff can log them here." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={r.priority} />
                  <p className="font-medium">{r.title}</p>
                  <RequestStatusBadge status={r.status} />
                  <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {r.property_name} · {r.category}
                  {r.description ? ` — ${r.description}` : ''}
                </p>
                {perms.can('maintenance', 'update') && (r.status === 'new' || r.status === 'acknowledged') && (
                  <div className="mt-2 flex gap-2">
                    {r.status === 'new' && (
                      <Button variant="ghost" onClick={() => acknowledge.mutate(r.id)}>Acknowledge</Button>
                    )}
                    <Button variant="outline" onClick={() => setConvertFor(r)}>Convert to work order</Button>
                  </div>
                )}
                {r.rejected_reason && <p className="mt-2 text-sm text-red-600">Rejected: {r.rejected_reason}</p>}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Log maintenance request">
        <RequestForm onDone={(m, t) => { setCreateOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: maintenanceKeys.requests() }); }} />
      </Dialog>

      <Dialog open={convertFor !== null} onClose={() => setConvertFor(null)} title="Convert to work order">
        {convertFor && (
          <ConvertForm
            request={convertFor}
            onDone={(m, t) => { setConvertFor(null); flash(m, t); void qc.invalidateQueries({ queryKey: maintenanceKeys.all }); }}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function RequestForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'maintenance' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const form = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(maintenanceRequestSchema),
    defaultValues: { category: 'other', priority: 'medium' },
  });
  const err = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .insert({
        property_id: values.property_id, category: values.category, priority: values.priority,
        title: values.title, description: values.description || null,
      })
      .select().single();
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'maintenance', action: 'request_logged', entityType: 'maintenance_request', entityId: data.id });
    onDone('Request logged');
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Property" error={err.property_id?.message}>
        <Select {...form.register('property_id')}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Title" error={err.title?.message}><Input {...form.register('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={err.category?.message}>
          <Select {...form.register('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Priority" error={err.priority?.message}>
          <Select {...form.register('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Description" error={err.description?.message}><Textarea rows={3} {...form.register('description')} /></Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Log request'}</Button>
      </div>
    </form>
  );
}

function ConvertForm({ request, onDone }: { request: MaintenanceRequestRow; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [title, setTitle] = useState(request.title);
  const [scheduledDate, setScheduledDate] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const { data: wo, error } = await supabase
        .from('work_orders')
        .insert({
          request_id: request.id, property_id: request.property_id, unit_id: request.unit_id,
          title: title.trim() || request.title, description: request.description,
          scheduled_date: scheduledDate || null, status: 'open',
        })
        .select().single();
      if (error) throw new Error(error.message);
      const { error: reqErr } = await supabase.from('maintenance_requests').update({ status: 'converted' }).eq('id', request.id);
      if (reqErr) throw new Error(reqErr.message);
      await rpc.logActivity({ module: 'maintenance', action: 'request_converted', entityType: 'work_order', entityId: wo.id });
      onDone('Work order created from request');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Creates a work order linked to this request and marks the request converted. Assign a contractor and add costs on the work order.
      </p>
      <Field label="Work order title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Scheduled date (optional)"><Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Creating…' : 'Create work order'}</Button>
      </div>
    </div>
  );
}
