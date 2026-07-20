import { NavLink, Outlet } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { procurementKeys, propertyKeys } from '../../api/keys';
import type { RequisitionStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

const TABS = [
  { label: 'Requisitions', to: '/procurement', end: true },
  { label: 'Purchase orders', to: '/procurement/orders' },
  { label: 'Inventory', to: '/procurement/inventory' },
  { label: 'Vendors', to: '/procurement/vendors' },
];

export default function ProcurementLayout() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold">Procurement & Inventory</h1>
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

export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  const tone = status === 'approved' ? 'green' : status === 'submitted' ? 'amber' : status === 'rejected' ? 'red' : 'zinc';
  return <Badge tone={tone as 'green' | 'amber' | 'red' | 'zinc'}>{status}</Badge>;
}

export function RequisitionsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canCreate = perms.can('procurement', 'create');
  const canApprove = perms.can('procurement', 'approve');
  const [statusFilter, setStatusFilter] = useState<'' | RequisitionStatus>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const requisitions = useQuery({
    queryKey: procurementKeys.requisitions(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('purchase_requisitions').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const ids = rows.map((r) => r.id);
      const { data: lines } = ids.length
        ? await supabase.from('requisition_lines').select('requisition_id, quantity, est_unit_cost').in('requisition_id', ids).is('deleted_at', null)
        : { data: [] };
      const total = (rid: string) =>
        (lines ?? []).filter((l) => l.requisition_id === rid).reduce((s, l) => s + Number(l.quantity) * Number(l.est_unit_cost), 0);
      const count = (rid: string) => (lines ?? []).filter((l) => l.requisition_id === rid).length;
      return rows.map((r) => ({ ...r, est_total: total(r.id), line_count: count(r.id) }));
    },
  });

  const submit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('purchase_requisitions').update({ status: 'submitted' }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'procurement', action: 'requisition_submitted', entityType: 'purchase_requisition', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: procurementKeys.requisitions() }); flash('Submitted for approval'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) => {
      // Server enforces separation of duties (no self-approval, needs procurement.approve).
      await rpc.approveRequisition(id, approve, reason);
      await rpc.logActivity({ module: 'procurement', action: approve ? 'requisition_approved' : 'requisition_rejected', entityType: 'purchase_requisition', entityId: id });
    },
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: procurementKeys.requisitions() }); setRejectFor(null); flash(v.approve ? 'Approved' : 'Rejected'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const rows = useMemo(() => {
    const list = requisitions.data ?? [];
    return statusFilter ? list.filter((r) => r.status === statusFilter) : list;
  }, [requisitions.data, statusFilter]);

  if (requisitions.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | RequisitionStatus)} className="w-40">
          <option value="">All statuses</option>
          {(['draft', 'submitted', 'approved', 'rejected'] as RequisitionStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <span className="text-sm text-zinc-500">{rows.length} requisitions</span>
        {canCreate && <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New requisition</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={requisitions.data?.length ? 'None in this status' : 'No requisitions yet'} hint="Raise a requisition; someone with approval rights (not you) approves it, then it becomes a purchase order." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const mine = r.requested_by === user?.id;
            return (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <RequisitionStatusBadge status={r.status} />
                    <span className="text-sm font-medium">{r.line_count} item{r.line_count === 1 ? '' : 's'}</span>
                    <span className="tabular-nums text-sm text-zinc-500">est. {money(r.est_total)}</span>
                    {mine && <Badge tone="zinc">raised by you</Badge>}
                    <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.notes && <p className="mt-1 text-sm text-zinc-500">{r.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canCreate && mine && r.status === 'draft' && (
                      <Button variant="outline" onClick={() => submit.mutate(r.id)}><Send className="h-4 w-4" /> Submit</Button>
                    )}
                    {canApprove && r.status === 'submitted' && !mine && (
                      <>
                        <Button variant="outline" onClick={() => decide.mutate({ id: r.id, approve: true })}><Check className="h-4 w-4" /> Approve</Button>
                        <Button variant="ghost" onClick={() => setRejectFor(r.id)}><X className="h-4 w-4" /> Reject</Button>
                      </>
                    )}
                    {canApprove && r.status === 'submitted' && mine && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">You raised this — someone else must approve it.</p>
                    )}
                    {r.status === 'approved' && (
                      <CreatePoButton requisitionId={r.id} onDone={flash} />
                    )}
                  </div>
                  {r.rejection_reason && <p className="mt-2 text-sm text-red-600">Rejected: {r.rejection_reason}</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New requisition">
        <RequisitionForm onDone={(m, t) => { setCreateOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: procurementKeys.requisitions() }); }} />
      </Dialog>

      <Dialog open={rejectFor !== null} onClose={() => setRejectFor(null)} title="Reject requisition">
        {rejectFor && (
          <RejectForm pending={decide.isPending} onSubmit={(reason) => decide.mutate({ id: rejectFor, approve: false, reason })} />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function RejectForm({ onSubmit, pending }: { onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-4">
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => onSubmit(reason.trim())} disabled={pending}>{pending ? 'Rejecting…' : 'Reject'}</Button>
      </div>
    </div>
  );
}

function CreatePoButton({ requisitionId, onDone }: { requisitionId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!perms.can('procurement', 'create')) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Create purchase order</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create purchase order">
        <CreatePoForm
          requisitionId={requisitionId}
          onDone={(m, t) => { setOpen(false); onDone(m, t); void qc.invalidateQueries({ queryKey: procurementKeys.all }); }}
        />
      </Dialog>
    </>
  );
}

function CreatePoForm({ requisitionId, onDone }: { requisitionId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [vendorId, setVendorId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [pending, setPending] = useState(false);

  const vendors = useQuery({
    queryKey: procurementKeys.vendors(),
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, company_name').is('deleted_at', null).order('company_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const warehouses = useQuery({
    queryKey: procurementKeys.warehouses(),
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!vendorId) return onDone('Pick a vendor', 'err');
    if (!warehouseId) return onDone('Pick a delivery warehouse', 'err');
    setPending(true);
    try {
      // Copy approved requisition lines onto a draft PO.
      const { data: reqLines, error: rlErr } = await supabase
        .from('requisition_lines').select('*').eq('requisition_id', requisitionId).is('deleted_at', null);
      if (rlErr) throw new Error(rlErr.message);
      const { data: po, error: poErr } = await supabase
        .from('purchase_orders').insert({ vendor_id: vendorId, warehouse_id: warehouseId, requisition_id: requisitionId, status: 'draft' }).select().single();
      if (poErr) throw new Error(poErr.message);
      if (reqLines?.length) {
        const { error: lineErr } = await supabase.from('po_lines').insert(
          reqLines.map((l) => ({ po_id: po.id, item_id: l.item_id, description: l.description, quantity: l.quantity, unit_cost: l.est_unit_cost })),
        );
        if (lineErr) throw new Error(lineErr.message);
      }
      await rpc.logActivity({ module: 'procurement', action: 'po_created', entityType: 'purchase_order', entityId: po.id });
      onDone(`Purchase order ${po.po_number} created as draft`);
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Vendor">
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Select…</option>
          {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.company_name}</option>)}
        </Select>
      </Field>
      <Field label="Deliver to warehouse">
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">Select…</option>
          {warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <p className="text-xs text-zinc-500">The approved requisition's lines are copied onto the order. Issue and receive it on the Purchase Orders tab.</p>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Creating…' : 'Create PO'}</Button>
      </div>
    </div>
  );
}

function RequisitionForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ description: string; quantity: string; est_unit_cost: string }[]>([
    { description: '', quantity: '1', est_unit_cost: '' },
  ]);
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'requisition' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const setLine = (i: number, k: 'description' | 'quantity' | 'est_unit_cost', v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const submit = async () => {
    const valid = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    if (valid.length === 0) return onDone('Add at least one line item', 'err');
    setPending(true);
    try {
      const { data: req, error } = await supabase
        .from('purchase_requisitions').insert({ property_id: propertyId || null, notes: notes.trim() || null, status: 'draft' }).select().single();
      if (error) throw new Error(error.message);
      const { error: lineErr } = await supabase.from('requisition_lines').insert(
        valid.map((l) => ({ requisition_id: req.id, description: l.description.trim(), quantity: Number(l.quantity), est_unit_cost: Number(l.est_unit_cost) || 0 })),
      );
      if (lineErr) throw new Error(lineErr.message);
      await rpc.logActivity({ module: 'procurement', action: 'requisition_created', entityType: 'purchase_requisition', entityId: req.id });
      onDone('Requisition saved as draft');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Property (optional)">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">None</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Line items</p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} className="flex-1" />
              <Input type="number" min={1} placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="w-20" />
              <Input type="number" min={0} step="0.01" placeholder="Est. cost" value={l.est_unit_cost} onChange={(e) => setLine(i, 'est_unit_cost', e.target.value)} className="w-28" />
              {lines.length > 1 && (
                <button aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="rounded p-2 text-zinc-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-2" onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', est_unit_cost: '' }])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
      </div>
      <Field label="Notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Save requisition'}</Button>
      </div>
    </div>
  );
}
