import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { procurementKeys } from '../../api/keys';
import type { PoStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

function PoStatusBadge({ status }: { status: PoStatus }) {
  const tone =
    status === 'received' ? 'green'
    : status === 'partially_received' ? 'amber'
    : status === 'issued' ? 'brand'
    : status === 'cancelled' ? 'red'
    : 'zinc';
  return <Badge tone={tone as 'green' | 'amber' | 'brand' | 'red' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}

/* ============ list ============ */
export function PurchaseOrdersList() {
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<'' | PoStatus>('');

  const pos = useQuery({
    queryKey: procurementKeys.purchaseOrders(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('purchase_orders').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const vendorIds = [...new Set(rows.map((p) => p.vendor_id))];
      const ids = rows.map((p) => p.id);
      const [vendors, lines] = await Promise.all([
        vendorIds.length ? supabase.from('vendors').select('id, company_name').in('id', vendorIds) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('po_lines').select('po_id, quantity, unit_cost').in('po_id', ids).is('deleted_at', null) : Promise.resolve({ data: [] }),
      ]);
      const total = (pid: string) => (lines.data ?? []).filter((l) => l.po_id === pid).reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
      return rows.map((p) => ({ ...p, vendor_name: vendors.data?.find((v) => v.id === p.vendor_id)?.company_name ?? '—', total: total(p.id) }));
    },
  });

  const rows = useMemo(() => {
    const list = pos.data ?? [];
    return statusFilter ? list.filter((p) => p.status === statusFilter) : list;
  }, [pos.data, statusFilter]);

  if (pos.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | PoStatus)}
          className="w-48 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">All statuses</option>
          {(['draft', 'issued', 'partially_received', 'received', 'closed', 'cancelled'] as PoStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">{rows.length} orders</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={pos.data?.length ? 'None in this status' : 'No purchase orders yet'} hint="Approve a requisition and create a PO from it." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4">PO</th>
                  <th className="py-2 pr-4">Vendor</th>
                  <th className="py-2 pr-4">Value</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2.5 pr-4">
                      <Link to={`/procurement/orders/${p.id}`} className="font-mono text-xs font-medium text-brand hover:underline">{p.po_number}</Link>
                    </td>
                    <td className="py-2.5 pr-4">{p.vendor_name}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(p.total)}</td>
                    <td className="py-2.5 pr-4"><PoStatusBadge status={p.status} /></td>
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
export function PurchaseOrderDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canUpdate = perms.can('procurement', 'update');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const po = useQuery({
    queryKey: procurementKeys.purchaseOrder(id),
    queryFn: async () => {
      const { data: order, error } = await supabase.from('purchase_orders').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const [{ data: lines }, { data: vendor }, { data: warehouse }] = await Promise.all([
        supabase.from('po_lines').select('*').eq('po_id', id).is('deleted_at', null).order('created_at'),
        supabase.from('vendors').select('id, company_name').eq('id', order.vendor_id).single(),
        supabase.from('warehouses').select('id, name').eq('id', order.warehouse_id).single(),
      ]);
      return { ...order, lines: lines ?? [], vendor, warehouse };
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: procurementKeys.purchaseOrder(id) });
    void qc.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
    void qc.invalidateQueries({ queryKey: procurementKeys.stock() });
  };

  const issue = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('purchase_orders').update({ status: 'issued' }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'procurement', action: 'po_issued', entityType: 'purchase_order', entityId: id });
    },
    onSuccess: () => { refresh(); flash('Purchase order issued to vendor'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (po.isLoading) return <PageSpinner />;
  if (!po.data) return <div className="p-6"><EmptyState title="Purchase order not found" /></div>;
  const order = po.data;
  const total = order.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  const fullyReceived = order.lines.every((l) => Number(l.received_qty) >= Number(l.quantity));
  const canReceive = canUpdate && (order.status === 'issued' || order.status === 'partially_received');

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Purchase order</p>
          <h1 className="mt-0.5 font-mono text-lg font-semibold">{order.po_number}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{order.vendor?.company_name} · deliver to {order.warehouse?.name}</p>
        </div>
        <PoStatusBadge status={order.status} />
        <div className="ml-auto flex gap-2">
          {canUpdate && order.status === 'draft' && (
            <Button onClick={() => issue.mutate()} disabled={issue.isPending}><Send className="h-4 w-4" /> {issue.isPending ? 'Issuing…' : 'Issue PO'}</Button>
          )}
          {canReceive && (
            <Button variant="outline" onClick={() => setReceiveOpen(true)}><PackageCheck className="h-4 w-4" /> Receive goods</Button>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Lines" subtitle="Received quantity updates as goods arrive; stock posts automatically on receipt." />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Ordered</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => {
                const done = Number(l.received_qty) >= Number(l.quantity);
                return (
                  <tr key={l.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-medium">{l.description}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{Number(l.quantity)}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      <span className={done ? 'text-emerald-600' : ''}>{Number(l.received_qty)}</span>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(Number(l.unit_cost))}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(Number(l.quantity) * Number(l.unit_cost))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 font-medium" colSpan={4}>Total</td>
                <td className="py-2 font-display font-semibold tabular-nums">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
          {fullyReceived && order.status === 'received' && (
            <p className="mt-3 text-sm text-emerald-600">Fully received — stock has been posted to {order.warehouse?.name}.</p>
          )}
        </CardBody>
      </Card>

      <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Receive goods">
        <ReceiveForm
          poId={id}
          lines={order.lines.map((l) => ({ id: l.id, description: l.description, outstanding: Number(l.quantity) - Number(l.received_qty) }))}
          onDone={(m, t) => { setReceiveOpen(false); flash(m, t); refresh(); }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function ReceiveForm({ poId, lines, onDone }: {
  poId: string;
  lines: { id: string; description: string; outstanding: number }[];
  onDone: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const outstanding = lines.filter((l) => l.outstanding > 0);

  const submit = async () => {
    const payload = outstanding
      .map((l) => ({ po_line_id: l.id, quantity: Number(qty[l.id] || 0) }))
      .filter((x) => x.quantity > 0);
    if (payload.length === 0) return onDone('Enter at least one quantity to receive', 'err');
    const over = payload.find((p) => {
      const line = outstanding.find((l) => l.id === p.po_line_id)!;
      return p.quantity > line.outstanding;
    });
    if (over) return onDone('You cannot receive more than the outstanding quantity', 'err');
    setPending(true);
    try {
      await rpc.receiveGoods(poId, payload);
      await rpc.logActivity({ module: 'procurement', action: 'goods_received', entityType: 'purchase_order', entityId: poId, after: { lines: payload.length } as never });
      onDone('Goods received — stock updated');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  if (outstanding.length === 0) {
    return <p className="text-sm text-zinc-500">Everything on this order has already been received.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Enter the quantity received now for each line. Partial receipts are fine — receive the rest later.</p>
      <div className="space-y-2">
        {outstanding.map((l) => (
          <div key={l.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.description}</p>
              <p className="text-xs text-zinc-400">{l.outstanding} outstanding</p>
            </div>
            <Input
              type="number" min={0} max={l.outstanding} step="0.01" placeholder="0"
              value={qty[l.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))}
              className="w-24"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Receiving…' : 'Receive goods'}</Button>
      </div>
    </div>
  );
}
