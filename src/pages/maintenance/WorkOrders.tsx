import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys, maintenanceKeys } from '../../api/keys';
import type { WorkOrderRow, WorkOrderStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { WORK_ORDER_STATUSES, WorkOrderStatusBadge } from './shared';

/* ============ list ============ */
export function WorkOrdersList() {
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<'' | WorkOrderStatus>('');

  const workOrders = useQuery({
    queryKey: maintenanceKeys.workOrders(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('work_orders').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((w) => w.property_id))];
      const contractorIds = [...new Set(rows.map((w) => w.contractor_id).filter(Boolean))] as string[];
      const [props, contractors] = await Promise.all([
        propIds.length ? supabase.from('properties').select('id, name').in('id', propIds) : Promise.resolve({ data: [] }),
        contractorIds.length ? supabase.from('contractors').select('id, company_name').in('id', contractorIds) : Promise.resolve({ data: [] }),
      ]);
      return rows.map((w) => ({
        ...w,
        property_name: props.data?.find((p) => p.id === w.property_id)?.name ?? '—',
        contractor_name: w.contractor_id ? contractors.data?.find((c) => c.id === w.contractor_id)?.company_name ?? '—' : null,
      }));
    },
  });

  const rows = useMemo(() => {
    const list = workOrders.data ?? [];
    return statusFilter ? list.filter((w) => w.status === statusFilter) : list;
  }, [workOrders.data, statusFilter]);

  if (workOrders.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | WorkOrderStatus)} className="w-44">
          <option value="">All statuses</option>
          {WORK_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <span className="text-sm text-zinc-500">{rows.length} work orders</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={workOrders.data?.length ? 'None in this status' : 'No work orders yet'} hint="Convert a maintenance request, and it appears here to assign and cost." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Contractor</th>
                  <th className="py-2 pr-4">Cost</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4">
                      <Link to={`/maintenance/work-orders/${w.id}`} className="font-medium text-brand hover:underline">{w.title}</Link>
                    </td>
                    <td className="py-2.5 pr-4">{w.property_name}</td>
                    <td className="py-2.5 pr-4">{w.contractor_name ?? <span className="text-zinc-400">unassigned</span>}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{w.total_cost > 0 ? money(Number(w.total_cost)) : '—'}</td>
                    <td className="py-2.5 pr-4"><WorkOrderStatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ============ detail ============ */
export function WorkOrderDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const canUpdate = perms.can('maintenance', 'update');
  const canApprove = perms.can('maintenance', 'approve');

  const wo = useQuery({
    queryKey: maintenanceKeys.workOrder(id),
    queryFn: async () => {
      const { data: order, error } = await supabase.from('work_orders').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const [{ data: items }, { data: property }, { data: contractor }] = await Promise.all([
        supabase.from('work_order_items').select('*').eq('work_order_id', id).is('deleted_at', null).order('created_at'),
        supabase.from('properties').select('id, name').eq('id', order.property_id).single(),
        order.contractor_id
          ? supabase.from('contractors').select('id, company_name').eq('id', order.contractor_id).single()
          : Promise.resolve({ data: null }),
      ]);
      return { ...order, items: items ?? [], property, contractor };
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: maintenanceKeys.workOrder(id) });
    void qc.invalidateQueries({ queryKey: maintenanceKeys.workOrders() });
  };

  const setStatus = useMutation({
    mutationFn: async (status: WorkOrderStatus) => {
      const patch: Partial<WorkOrderRow> =
        status === 'completed' ? { status, completed_at: new Date().toISOString() } : { status };
      const { error } = await supabase.from('work_orders').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'maintenance', action: 'work_order_' + status, entityType: 'work_order', entityId: id });
    },
    onSuccess: () => { refresh(); flash('Status updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const verify = useMutation({
    mutationFn: async () => {
      // The DB trigger posts an expense automatically when status flips to verified.
      const { error } = await supabase
        .from('work_orders')
        .update({ status: 'verified', verified_at: new Date().toISOString(), verified_by: user?.id })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'maintenance', action: 'work_order_verified', entityType: 'work_order', entityId: id });
    },
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      flash('Work order verified — cost posted to Finance as an expense');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('work_order_items').update({ deleted_at: new Date().toISOString() }).eq('id', itemId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); flash('Item removed'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (wo.isLoading) return <PageSpinner />;
  if (!wo.data) return <div className="p-6"><EmptyState title="Work order not found" hint="It may be outside your assignment." /></div>;
  const order = wo.data;
  const locked = order.status === 'verified' || order.status === 'cancelled';

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Work order</p>
          <h2 className="mt-0.5 truncate font-display text-lg font-semibold">{order.title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{order.property?.name}{order.description ? ` — ${order.description}` : ''}</p>
        </div>
        <WorkOrderStatusBadge status={order.status} />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader
            title="Cost items"
            subtitle={locked ? 'Locked — this work order is closed.' : 'Labor and parts. The total rolls up automatically.'}
            action={
              canUpdate && !locked ? (
                <Button variant="outline" onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4" /> Add item</Button>
              ) : undefined
            }
          />
          <CardBody>
            {order.items.length === 0 ? (
              <p className="text-sm text-zinc-500">No cost items yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-100 last:border-0 dark:border-[#1C1C34]/60">
                      <td className="py-2">
                        <span className="font-medium">{it.description}</span>
                        <Badge tone="zinc">{it.item_type}</Badge>
                        {it.quantity !== 1 && <span className="ml-1 text-xs text-zinc-400">×{it.quantity}</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{money(Number(it.unit_cost) * Number(it.quantity))}</td>
                      {canUpdate && !locked && (
                        <td className="w-8 py-2 text-right">
                          <button aria-label="Remove item" onClick={() => removeItem.mutate(it.id)} className="rounded p-1 text-zinc-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 dark:border-[#1C1C34]">
                    <td className="py-2 font-medium">Total</td>
                    <td className="py-2 text-right font-display font-semibold tabular-nums">{money(Number(order.total_cost))}</td>
                    {canUpdate && !locked && <td />}
                  </tr>
                </tfoot>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Assignment & status" />
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Contractor</p>
              <p className="text-sm">{order.contractor?.company_name ?? 'Unassigned'}</p>
              {canUpdate && !locked && (
                <button className="mt-1 text-sm font-medium text-brand hover:underline" onClick={() => setAssignOpen(true)}>
                  {order.contractor ? 'Reassign' : 'Assign contractor'}
                </button>
              )}
            </div>

            {canUpdate && !locked && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Move to</p>
                <Select
                  value={order.status}
                  onChange={(e) => setStatus.mutate(e.target.value as WorkOrderStatus)}
                  className="mt-1"
                  disabled={setStatus.isPending}
                >
                  {(['open', 'in_progress', 'on_hold', 'completed', 'cancelled'] as WorkOrderStatus[]).map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </Select>
              </div>
            )}

            {order.status === 'completed' && (
              canApprove ? (
                <div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-900/20">
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    Verifying finalizes the cost and posts it to Finance as an expense.
                  </p>
                  <Button className="mt-2 w-full" onClick={() => verify.mutate()} disabled={verify.isPending}>
                    {verify.isPending ? 'Verifying…' : 'Verify & post expense'}
                  </Button>
                </div>
              ) : (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  Completed — awaiting verification by someone with approval rights.
                </p>
              )
            )}

            {order.status === 'verified' && (
              <p className="text-sm text-zinc-500">
                Verified {order.verified_at ? new Date(order.verified_at).toLocaleDateString() : ''}. Cost posted to Finance.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Add cost item">
        <ItemForm workOrderId={id} onDone={(m, t) => { setAddItemOpen(false); flash(m, t); refresh(); }} />
      </Dialog>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign contractor">
        <AssignContractorForm workOrderId={id} onDone={(m, t) => { setAssignOpen(false); flash(m, t); refresh(); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function ItemForm({ workOrderId, onDone }: { workOrderId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [itemType, setItemType] = useState<'labor' | 'parts' | 'other'>('labor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!description.trim()) return onDone('Describe the item', 'err');
    const cost = Number(unitCost), qty = Number(quantity);
    if (!(cost >= 0) || !(qty > 0)) return onDone('Enter a valid quantity and cost', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('work_order_items')
      .insert({ work_order_id: workOrderId, item_type: itemType, description: description.trim(), quantity: qty, unit_cost: cost })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'maintenance', action: 'work_order_item_added', entityType: 'work_order_item', entityId: data.id });
    onDone('Item added — total updated');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={itemType} onChange={(e) => setItemType(e.target.value as 'labor' | 'parts' | 'other')}>
            <option value="labor">Labor</option>
            <option value="parts">Parts</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Quantity"><Input type="number" min={1} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      </div>
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Unit cost"><Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Adding…' : 'Add item'}</Button>
      </div>
    </div>
  );
}

function AssignContractorForm({ workOrderId, onDone }: { workOrderId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [contractorId, setContractorId] = useState('');
  const [pending, setPending] = useState(false);

  const contractors = useQuery({
    queryKey: maintenanceKeys.contractors(),
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('id, company_name, trades').is('deleted_at', null).order('company_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!contractorId) return onDone('Choose a contractor', 'err');
    setPending(true);
    const { error } = await supabase.from('work_orders').update({ contractor_id: contractorId }).eq('id', workOrderId);
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'maintenance', action: 'contractor_assigned', entityType: 'work_order', entityId: workOrderId });
    onDone('Contractor assigned');
  };

  return (
    <div className="space-y-4">
      <Field label="Contractor">
        <Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
          <option value="">Select…</option>
          {contractors.data?.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </Select>
      </Field>
      {contractors.data?.length === 0 && (
        <p className="text-xs text-amber-700">No contractors yet — add one on the Contractors tab first.</p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Assigning…' : 'Assign'}</Button>
      </div>
    </div>
  );
}
