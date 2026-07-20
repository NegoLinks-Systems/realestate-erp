import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys, propertyKeys } from '../../api/keys';
import { expenseSchema, type ExpenseInput } from '../../schemas';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export function ExpensesPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const expenses = useQuery({
    queryKey: financeKeys.expenses(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('expenses').select('*').is('deleted_at', null).order('incurred_at', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      const [cats, props] = await Promise.all([
        supabase.from('expense_categories').select('id, name'),
        supabase.from('properties').select('id, name'),
      ]);
      return rows.map((e) => ({
        ...e,
        category: cats.data?.find((c) => c.id === e.category_id)?.name ?? '—',
        property_name: e.property_id ? props.data?.find((p) => p.id === e.property_id)?.name ?? '—' : 'General',
      }));
    },
  });

  const total = (expenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  if (expenses.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-500">
          {expenses.data?.length ?? 0} expenses · <span className="font-medium tabular-nums">{money(total)}</span> total
        </p>
        {perms.can('finance', 'create') && (
          <Button className="ml-auto" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add expense</Button>
        )}
      </div>

      {(expenses.data?.length ?? 0) === 0 ? (
        <EmptyState title="No expenses yet" hint="Verified maintenance work orders post here automatically; add ad-hoc costs manually." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.data!.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4 font-mono text-xs">{e.incurred_at}</td>
                    <td className="py-2.5 pr-4">
                      {e.description}
                    </td>
                    <td className="py-2.5 pr-4">{e.category}</td>
                    <td className="py-2.5 pr-4">{e.property_name}</td>
                    <td className="py-2.5 pr-4 tabular-nums font-medium">{money(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add expense">
        <ExpenseForm onDone={(m, t) => { setAddOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: financeKeys.expenses() }); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function ExpenseForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('*').order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'expense' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const form = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { incurred_at: new Date().toISOString().slice(0, 10) },
  });
  const err = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        property_id: values.property_id || null,
        category_id: values.category_id,
        description: values.description,
        amount: values.amount,
        incurred_at: values.incurred_at,
        vendor_name: values.vendor_name || null,
      })
      .select().single();
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'finance', action: 'expense_added', entityType: 'expense', entityId: data.id });
    onDone('Expense recorded');
  });

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Description" error={err.description?.message}><Input {...form.register('description')} /></Field>
      </div>
      <Field label="Category" error={err.category_id?.message}>
        <Select {...form.register('category_id')}>
          <option value="">Select…</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Property (optional)">
        <Select {...form.register('property_id')}>
          <option value="">General (no property)</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Amount" error={err.amount?.message}><Input type="number" min={0} step="0.01" {...form.register('amount')} /></Field>
      <Field label="Date" error={err.incurred_at?.message}><Input type="date" {...form.register('incurred_at')} /></Field>
      <div className="md:col-span-2">
        <Field label="Vendor (optional)"><Input {...form.register('vendor_name')} /></Field>
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Add expense'}</Button>
      </div>
    </form>
  );
}
