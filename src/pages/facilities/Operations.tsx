import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { facilityKeys, propertyKeys } from '../../api/keys';
import type { OperationType } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { OPERATION_TYPES } from './shared';

export function OperationsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('facilities', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const [logFor, setLogFor] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const schedules = useQuery({
    queryKey: facilityKeys.schedules(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('operational_schedules').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((s) => s.property_id))];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      // recent log count
      const ids = rows.map((s) => s.id);
      const { data: logs } = ids.length
        ? await supabase.from('operational_logs').select('schedule_id, performed_at').in('schedule_id', ids).is('deleted_at', null).order('performed_at', { ascending: false })
        : { data: [] };
      const lastLog = (sid: string) => (logs ?? []).find((l) => l.schedule_id === sid)?.performed_at ?? null;
      return rows.map((s) => ({ ...s, property_name: props?.find((p) => p.id === s.property_id)?.name ?? '—', last_log: lastLog(s.id) }));
    },
  });

  if (schedules.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add schedule</Button>}

      {(schedules.data?.length ?? 0) === 0 ? (
        <EmptyState title="No operational schedules" hint="Recurring cleaning, security, waste, landscaping — track them and log each time they're done." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {schedules.data!.map((s) => (
            <Card key={s.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="truncate text-sm text-zinc-500">{s.property_name}</p>
                  </div>
                  <Badge tone={s.active ? 'green' : 'zinc'}>{s.op_type}</Badge>
                </div>
                {s.frequency && <p className="mt-2 text-xs text-zinc-500">Frequency: {s.frequency}</p>}
                <p className="mt-1 text-xs text-zinc-400">
                  {s.last_log ? `Last done ${new Date(s.last_log).toLocaleDateString()}` : 'No logs yet'}
                </p>
                {canEdit && (
                  <Button variant="outline" className="mt-2" onClick={() => setLogFor({ id: s.id, title: s.title })}>
                    <CheckCircle2 className="h-4 w-4" /> Log completion
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add operational schedule">
        <ScheduleForm onDone={(m, t) => { setAddOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: facilityKeys.schedules() }); }} />
      </Dialog>

      <Dialog open={logFor !== null} onClose={() => setLogFor(null)} title={`Log completion — ${logFor?.title ?? ''}`}>
        {logFor && (
          <LogForm scheduleId={logFor.id} onDone={(m, t) => { setLogFor(null); flash(m, t); void qc.invalidateQueries({ queryKey: facilityKeys.schedules() }); }} />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function ScheduleForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [opType, setOpType] = useState<OperationType>('cleaning');
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState('');
  const [assignedNote, setAssignedNote] = useState('');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'ops' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!propertyId) return onDone('Pick a property', 'err');
    if (!title.trim()) return onDone('Give it a title', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('operational_schedules')
      .insert({ property_id: propertyId, op_type: opType, title: title.trim(), frequency: frequency.trim() || null, assigned_note: assignedNote.trim() || null })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'facilities', action: 'schedule_added', entityType: 'operational_schedule', entityId: data.id });
    onDone('Schedule added');
  };

  return (
    <div className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={opType} onChange={(e) => setOpType(e.target.value as OperationType)}>
            {OPERATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Frequency"><Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. Daily 6am" /></Field>
      </div>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lobby deep clean" /></Field>
      <Field label="Assigned to (optional)"><Input value={assignedNote} onChange={(e) => setAssignedNote(e.target.value)} placeholder="Team or vendor" /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add schedule'}</Button>
      </div>
    </div>
  );
}

function LogForm({ scheduleId, onDone }: { scheduleId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    const { data, error } = await supabase
      .from('operational_logs')
      .insert({ schedule_id: scheduleId, notes: notes.trim() || null, performed_at: new Date().toISOString() })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'facilities', action: 'operation_logged', entityType: 'operational_log', entityId: data.id });
    onDone('Logged');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Records that this task was completed just now.</p>
      <Field label="Notes (optional)"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Logging…' : 'Log completion'}</Button>
      </div>
    </div>
  );
}
