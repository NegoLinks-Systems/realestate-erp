import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { procurementKeys, propertyKeys } from '../../api/keys';
import type { MovementType } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export function InventoryPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canCreate = perms.can('procurement', 'create');
  const canAdjust = perms.can('procurement', 'update');
  const [q, setQ] = useState('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addWhOpen, setAddWhOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<{ id: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3500); };

  const items = useQuery({
    queryKey: procurementKeys.items(),
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_items').select('*').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const stock = useQuery({
    queryKey: procurementKeys.stock(),
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_levels').select('*');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const lowStock = useQuery({
    queryKey: procurementKeys.lowStock(),
    queryFn: async () => rpc.lowStockItems(),
  });

  const totalQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stock.data ?? []) map.set(s.item_id, (map.get(s.item_id) ?? 0) + Number(s.quantity));
    return map;
  }, [stock.data]);

  const lowIds = useMemo(() => new Set((lowStock.data ?? []).map((l) => l.item_id)), [lowStock.data]);

  const rows = useMemo(() => {
    const list = items.data ?? [];
    return q.trim() ? list.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q.toLowerCase())) : list;
  }, [items.data, q]);

  if (items.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {(lowStock.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" /> {lowStock.data!.length} item{lowStock.data!.length === 1 ? '' : 's'} at or below reorder level.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="ml-auto flex gap-2">
          {canCreate && <Button variant="outline" onClick={() => setAddWhOpen(true)}><Warehouse className="h-4 w-4" /> Add warehouse</Button>}
          {canCreate && <Button onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4" /> Add item</Button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={items.data?.length ? 'No items match' : 'No inventory items yet'} hint="Add items you stock; receiving a PO increases their quantity." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">On hand</th>
                  <th className="py-2 pr-4">Reorder at</th>
                  <th className="py-2 pr-4">Default cost</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const oh = totalQty.get(i.id) ?? 0;
                  return (
                    <tr key={i.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                      <td className="py-2.5 pr-4 font-medium">
                        {i.name}
                        {lowIds.has(i.id) && <Badge tone="amber">low</Badge>}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-500">{i.sku}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{oh} {i.unit}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-500">{Number(i.reorder_level)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{money(Number(i.default_cost))}</td>
                      <td className="py-2.5 text-right">
                        {canAdjust && (
                          <button className="text-sm font-medium text-brand hover:underline" onClick={() => setAdjustFor({ id: i.id, name: i.name })}>Adjust</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Add inventory item">
        <ItemForm onDone={(m, t) => { setAddItemOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: procurementKeys.items() }); }} />
      </Dialog>

      <Dialog open={addWhOpen} onClose={() => setAddWhOpen(false)} title="Add warehouse">
        <WarehouseForm onDone={(m, t) => { setAddWhOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: procurementKeys.warehouses() }); }} />
      </Dialog>

      <Dialog open={adjustFor !== null} onClose={() => setAdjustFor(null)} title={`Adjust stock — ${adjustFor?.name ?? ''}`}>
        {adjustFor && (
          <AdjustForm itemId={adjustFor.id} onDone={(m, t) => { setAdjustFor(null); flash(m, t); void qc.invalidateQueries({ queryKey: procurementKeys.stock() }); void qc.invalidateQueries({ queryKey: procurementKeys.lowStock() }); }} />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function ItemForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorder, setReorder] = useState('0');
  const [cost, setCost] = useState('0');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!sku.trim() || !name.trim()) return onDone('SKU and name are required', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ sku: sku.trim(), name: name.trim(), unit: unit.trim() || 'pcs', reorder_level: Number(reorder) || 0, default_cost: Number(cost) || 0 })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message.includes('inventory_items_sku') ? 'That SKU already exists.' : error.message, 'err');
    await rpc.logActivity({ module: 'procurement', action: 'item_added', entityType: 'inventory_item', entityId: data.id });
    onDone('Item added');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU"><Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" /></Field>
        <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, box, litre" /></Field>
      </div>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reorder level"><Input type="number" min={0} step="0.01" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>
        <Field label="Default cost"><Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add item'}</Button>
      </div>
    </div>
  );
}

function WarehouseForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [name, setName] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'warehouse' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!name.trim()) return onDone('Name the warehouse', 'err');
    setPending(true);
    const { data, error } = await supabase.from('warehouses').insert({ name: name.trim(), property_id: propertyId || null }).select().single();
    setPending(false);
    if (error) return onDone(error.message.includes('warehouses_name') ? 'A warehouse with that name exists.' : error.message, 'err');
    await rpc.logActivity({ module: 'procurement', action: 'warehouse_added', entityType: 'warehouse', entityId: data.id });
    onDone('Warehouse added');
  };

  return (
    <div className="space-y-4">
      <Field label="Warehouse name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Central Store" /></Field>
      <Field label="Property (optional)" hint="Leave blank for a central store not tied to one property.">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Central (no property)</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add warehouse'}</Button>
      </div>
    </div>
  );
}

function AdjustForm({ itemId, onDone }: { itemId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const warehouses = useQuery({
    queryKey: procurementKeys.warehouses(),
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!warehouseId) return onDone('Pick a warehouse', 'err');
    const qty = Number(quantity);
    if (!(qty > 0)) return onDone('Enter a quantity greater than zero', 'err');
    setPending(true);
    // Append an immutable movement; the trigger updates the derived stock level.
    const signed = direction === 'in' ? qty : -qty;
    const { data, error } = await supabase
      .from('stock_movements')
      .insert({ item_id: itemId, warehouse_id: warehouseId, movement_type: 'adjustment' as MovementType, quantity: signed, reference_type: 'manual', note: note.trim() || null })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message.includes('quantity >= 0') || error.message.includes('check') ? 'That would drive stock negative.' : error.message, 'err');
    await rpc.logActivity({ module: 'procurement', action: 'stock_adjusted', entityType: 'stock_movement', entityId: data.id });
    onDone('Stock adjusted');
  };

  return (
    <div className="space-y-4">
      <Field label="Warehouse">
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">Select…</option>
          {warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
            <option value="in">Increase (+)</option>
            <option value="out">Decrease (−)</option>
          </Select>
        </Field>
        <Field label="Quantity"><Input type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      </div>
      <Field label="Reason (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. stock-take correction" /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Apply adjustment'}</Button>
      </div>
    </div>
  );
}
