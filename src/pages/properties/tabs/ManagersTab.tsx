import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys } from '../../../api/keys';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';

export default function ManagersTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canManage = perms.can('users', 'update');
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const managers = useQuery({
    queryKey: propertyKeys.managers(propertyId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('property_managers').select('*')
        .eq('property_id', propertyId).is('deleted_at', null);
      if (error) throw new Error(error.message);
      if (!rows.length) return [] as { id: string; user_id: string; note: string | null; name: string }[];
      const { data: profiles } = await supabase
        .from('user_profiles').select('id, full_name').in('id', rows.map((r) => r.user_id));
      const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? id;
      return rows.map((r) => ({ id: r.id, user_id: r.user_id, note: r.note, name: nameOf(r.user_id) }));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_managers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'users', action: 'manager_unassigned', entityType: 'property_manager', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: propertyKeys.managers(propertyId) }); flash('Assignment removed'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (managers.isLoading) return <PageSpinner />;
  const list = managers.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Assigned team"
        subtitle="Assignment is what lets property-level roles (managers, leasing, security…) see this property at all."
        action={canManage ? (
          <Button variant="outline" onClick={() => setAssignOpen(true)}>
            <Plus className="h-4 w-4" /> Assign
          </Button>
        ) : undefined}
      />
      <CardBody>
        {list.length === 0 ? (
          <EmptyState
            title="Nobody is assigned yet"
            hint="Staff with property-level roles won't see this property until they're assigned here."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {list.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <UserRound className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  {m.note && <p className="truncate text-xs text-zinc-500">{m.note}</p>}
                </div>
                {canManage && (
                  <button aria-label="Remove assignment" onClick={() => remove.mutate(m.id)}
                    className="ml-auto rounded p-1 text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign team member">
        <AssignForm
          propertyId={propertyId}
          alreadyAssigned={list.map((m) => m.user_id)}
          onDone={(msg, tone) => {
            setAssignOpen(false);
            flash(msg, tone);
            void qc.invalidateQueries({ queryKey: propertyKeys.managers(propertyId) });
          }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </Card>
  );
}

function AssignForm({
  propertyId, alreadyAssigned, onDone,
}: {
  propertyId: string;
  alreadyAssigned: string[];
  onDone: (msg: string, tone?: 'ok' | 'err') => void;
}) {
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const profiles = useQuery({
    queryKey: ['assignable-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles').select('id, full_name').is('deleted_at', null).order('full_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const options = (profiles.data ?? []).filter((p) => !alreadyAssigned.includes(p.id));

  const submit = async () => {
    if (!userId) return onDone('Choose a person', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('property_managers')
      .insert({ property_id: propertyId, user_id: userId, note: note.trim() || null })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'users', action: 'manager_assigned', entityType: 'property_manager', entityId: data.id });
    onDone('Assigned');
  };

  return (
    <div className="space-y-4">
      <Field label="Team member" hint="Make sure they also hold a property-level role (Settings → Users & roles).">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Select…</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </Select>
      </Field>
      <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lead manager" /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Assigning…' : 'Assign'}</Button>
      </div>
    </div>
  );
}
