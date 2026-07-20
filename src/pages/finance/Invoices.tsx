import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys } from '../../api/keys';
import type { InvoiceStatus, PaymentMethod } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ExportMenu } from '../../components/ui/ExportMenu';
import { Field, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { INVOICE_STATUSES, InvoiceStatusBadge } from './shared';

/* ============ list ============ */
export function InvoicesList() {
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');

  const invoices = useQuery({
    queryKey: financeKeys.invoices(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('invoices').select('*').is('deleted_at', null).order('due_date', { ascending: false });
      if (error) throw new Error(error.message);
      const tenantIds = [...new Set(rows.map((i) => i.tenant_id))];
      const { data: tenants } = tenantIds.length
        ? await supabase.from('tenants').select('id, full_name').in('id', tenantIds)
        : { data: [] };
      return rows.map((i) => ({ ...i, tenant_name: tenants?.find((t) => t.id === i.tenant_id)?.full_name ?? '—' }));
    },
  });

  const rows = useMemo(() => {
    const list = invoices.data ?? [];
    return statusFilter ? list.filter((i) => i.status === statusFilter) : list;
  }, [invoices.data, statusFilter]);

  if (invoices.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | InvoiceStatus)} className="w-44">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <span className="text-sm text-zinc-500">{rows.length} invoices</span>
        <div className="ml-auto">
          <ExportMenu
            rows={rows.map((i) => ({
              Invoice: i.invoice_number,
              Total: Number(i.total),
              Paid: Number(i.amount_paid),
              Balance: Math.max(0, Number(i.total) - Number(i.amount_paid)),
              Status: i.status,
              Due: i.due_date,
            }))}
            filename="invoices" sheetName="Invoices"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={invoices.data?.length ? 'No invoices in this status' : 'No invoices yet'}
          hint="Run billing from the Overview tab, or activate a lease — invoices generate from live leases."
        />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Invoice</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Balance</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const balance = Math.max(0, Number(i.total) - Number(i.amount_paid));
                  return (
                    <tr key={i.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                      <td className="py-2.5 pr-4">
                        <Link to={`/finance/invoices/${i.id}`} className="font-mono text-xs font-medium text-brand hover:underline">
                          {i.invoice_number}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">{i.tenant_name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{i.due_date}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{money(Number(i.total))}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{balance > 0 ? money(balance) : '—'}</td>
                      <td className="py-2.5 pr-4"><InvoiceStatusBadge status={i.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ============ detail ============ */
export function InvoiceDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [voidOpen, setVoidOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const invoice = useQuery({
    queryKey: financeKeys.invoice(id),
    queryFn: async () => {
      const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const [{ data: lines }, { data: tenant }, { data: allocations }] = await Promise.all([
        supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('created_at'),
        supabase.from('tenants').select('id, full_name').eq('id', inv.tenant_id).single(),
        supabase.from('payment_allocations').select('*').eq('invoice_id', id),
      ]);
      return { ...inv, lines: lines ?? [], tenant, allocations: allocations ?? [] };
    },
  });

  const voidInvoice = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.from('invoices').update({ status: 'void', void_reason: reason || null }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'finance', action: 'invoice_voided', entityType: 'invoice', entityId: id, after: { reason } as never });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: financeKeys.all }); setVoidOpen(false); flash('Invoice voided'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (invoice.isLoading) return <PageSpinner />;
  if (!invoice.data) return <EmptyState title="Invoice not found" />;
  const inv = invoice.data;
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Invoice</p>
          <h2 className="mt-0.5 font-display text-lg font-semibold">{inv.invoice_number}</h2>
        </div>
        <InvoiceStatusBadge status={inv.status} />
        {perms.can('finance', 'update') && inv.status !== 'void' && inv.status !== 'paid' && (
          <Button variant="outline" className="ml-auto" onClick={() => setVoidOpen(true)}>Void</Button>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader
          title={inv.tenant?.full_name ?? 'Tenant'}
          subtitle={`Issued ${inv.issue_date} · due ${inv.due_date}${inv.period_start ? ` · period ${inv.period_start} → ${inv.period_end}` : ''}`}
        />
        <CardBody>
          <table className="w-full text-sm">
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-zinc-100 last:border-0 dark:border-[#1C1C34]/60">
                  <td className="py-2">
                    <span className="font-medium">{l.description}</span>
                    <Badge tone={l.line_type === 'penalty' ? 'red' : 'zinc'}>{l.line_type.replace('_', ' ')}</Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(Number(l.amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-[#1C1C34]">
                <td className="py-2 font-medium">Total</td>
                <td className="py-2 text-right font-display font-semibold tabular-nums">{money(Number(inv.total))}</td>
              </tr>
              <tr>
                <td className="py-1 text-zinc-500">Paid</td>
                <td className="py-1 text-right tabular-nums text-emerald-600">{money(Number(inv.amount_paid))}</td>
              </tr>
              {balance > 0 && (
                <tr>
                  <td className="py-1 font-medium">Balance due</td>
                  <td className="py-1 text-right font-semibold tabular-nums text-brand">{money(balance)}</td>
                </tr>
              )}
            </tfoot>
          </table>
          {inv.void_reason && <p className="mt-3 text-sm text-zinc-500">Void reason: {inv.void_reason}</p>}
        </CardBody>
      </Card>

      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} title="Void invoice">
        <VoidForm pending={voidInvoice.isPending} onSubmit={(r) => voidInvoice.mutate(r)} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function VoidForm({ onSubmit, pending }: { onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Voiding removes this invoice from balances and aging. It can't be undone.</p>
      <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => onSubmit(reason.trim())} disabled={pending}>{pending ? 'Voiding…' : 'Void invoice'}</Button>
      </div>
    </div>
  );
}

/* ============ payments ============ */
export function PaymentsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [recordOpen, setRecordOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const payments = useQuery({
    queryKey: financeKeys.payments(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('payments').select('*').is('deleted_at', null).order('received_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      const tenantIds = [...new Set(rows.map((p) => p.tenant_id))];
      const { data: tenants } = tenantIds.length
        ? await supabase.from('tenants').select('id, full_name').in('id', tenantIds)
        : { data: [] };
      return rows.map((p) => ({ ...p, tenant_name: tenants?.find((t) => t.id === p.tenant_id)?.full_name ?? '—' }));
    },
  });

  if (payments.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {perms.can('finance', 'create') && (
        <Button onClick={() => setRecordOpen(true)}>Record payment</Button>
      )}
      {(payments.data?.length ?? 0) === 0 ? (
        <EmptyState title="No payments recorded" hint="Recording a payment allocates it to the tenant's oldest unpaid invoices automatically." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.data!.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4 font-mono text-xs">{new Date(p.received_at).toLocaleDateString()}</td>
                    <td className="py-2.5 pr-4">{p.tenant_name}</td>
                    <td className="py-2.5 pr-4">{p.method.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{p.reference ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular-nums font-medium">{money(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={recordOpen} onClose={() => setRecordOpen(false)} title="Record payment">
        <RecordPaymentForm
          onDone={(m, t) => { setRecordOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: financeKeys.all }); }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function RecordPaymentForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const money = useMoney();
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);

  const tenants = useQuery({
    queryKey: ['payment-tenant-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id, full_name').is('deleted_at', null).order('full_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const outstanding = useQuery({
    queryKey: ['tenant-outstanding', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('total, amount_paid')
        .eq('tenant_id', tenantId).in('status', ['issued', 'partially_paid', 'overdue']).is('deleted_at', null);
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
    },
  });

  const submit = async () => {
    if (!tenantId) return onDone('Choose a tenant', 'err');
    const amt = Number(amount);
    if (!(amt > 0)) return onDone('Enter an amount greater than zero', 'err');
    setPending(true);
    try {
      const { data: payment, error } = await supabase
        .from('payments')
        .insert({ tenant_id: tenantId, amount: amt, method, reference: reference.trim() || null, received_at: new Date().toISOString() })
        .select().single();
      if (error) throw new Error(error.message);
      // allocate oldest-first via the tested DB function
      const touched = await rpc.allocatePayment(payment.id);
      await rpc.logActivity({
        module: 'finance', action: 'payment_recorded', entityType: 'payment', entityId: payment.id,
        after: { amount: amt, allocated_invoices: touched } as never,
      });
      onDone(
        touched > 0
          ? `Payment recorded and allocated across ${touched} invoice${touched === 1 ? '' : 's'}`
          : 'Payment recorded (no open invoices to allocate against — held as credit)',
      );
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Tenant">
        <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Select…</option>
          {tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </Select>
      </Field>
      {tenantId && outstanding.data !== undefined && (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
          Outstanding balance: <span className="font-semibold tabular-nums">{money(outstanding.data)}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-[#1C1C34] dark:bg-[#131325]" /></Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="pos">POS</option>
            <option value="cheque">Cheque</option>
            <option value="online">Online</option>
          </Select>
        </Field>
      </div>
      <Field label="Reference (optional)"><input value={reference} onChange={(e) => setReference(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 dark:border-[#1C1C34] dark:bg-[#131325]" /></Field>
      <p className="text-xs text-zinc-500">Allocates to the oldest unpaid invoices first, then forward.</p>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Recording…' : 'Record payment'}</Button>
      </div>
    </div>
  );
}
