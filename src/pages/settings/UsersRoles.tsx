import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { MODULES, ACTIONS, type Module, type Action } from '../../lib/modules';
import type { AppRole, UserRoleRow } from '../../lib/database.types';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

const ALL_ROLES: AppRole[] = [
  'super_admin','company_owner','regional_manager','branch_manager','property_manager',
  'estate_manager','facility_manager','leasing_officer','sales_officer','accountant',
  'procurement_officer','maintenance_officer','security_officer','receptionist',
  'landlord','tenant','property_owner','contractor','vendor','auditor',
];

const usersKey = ['settings-users'] as const;
const matrixKey = (role: AppRole) => ['permission-matrix', role] as const;

export default function UsersRoles() {
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  };
  return (
    <div className="space-y-5">
      <TeamCard flash={flash} />
      <PermissionMatrixCard flash={flash} />
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

/* ---------------- team ---------------- */
function TeamCard({ flash }: { flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }, { data: branches, error: be }] =
        await Promise.all([
          supabase.from('user_profiles').select('*').is('deleted_at', null).order('created_at'),
          supabase.from('user_roles').select('*').is('deleted_at', null),
          supabase.from('branches').select('id, name').is('deleted_at', null),
        ]);
      if (pe) throw new Error(pe.message);
      if (re) throw new Error(re.message);
      if (be) throw new Error(be.message);
      return { profiles: profiles ?? [], roles: (roles ?? []) as UserRoleRow[], branches: branches ?? [] };
    },
  });

  const removeRole = useMutation({
    mutationFn: async (row: UserRoleRow) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'users', action: 'role_removed', entityType: 'user_role', entityId: row.id,
        before: JSON.parse(JSON.stringify(row)) as never,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: usersKey });
      flash('Role removed');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (isLoading || !data) return <Card><CardBody><PageSpinner /></CardBody></Card>;

  const branchName = (id: string | null) => data.branches.find((b) => b.id === id)?.name ?? null;

  return (
    <Card>
      <CardHeader
        title="Team"
        subtitle="People and the roles that scope what they can see."
        action={
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Invite user
          </Button>
        }
      />
      <CardBody>
        {!data.profiles.length ? (
          <EmptyState title="No team members yet" hint="Invite your first colleague to get started." />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {data.profiles.map((p) => {
              const roles = data.roles.filter((r) => r.user_id === p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.full_name}</p>
                    <p className="truncate font-mono text-[11px] text-zinc-500">{p.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {roles.length === 0 && <Badge tone="amber">no role — cannot see anything</Badge>}
                    {roles.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1">
                        <Badge tone="brand">
                          {r.role}
                          {r.branch_id && ` · ${branchName(r.branch_id) ?? 'branch'}`}
                        </Badge>
                        <button
                          aria-label={`Remove ${r.role}`}
                          onClick={() => removeRole.mutate(r)}
                          className="rounded p-0.5 text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Button variant="ghost" onClick={() => setAssignFor({ id: p.id, name: p.full_name })}>
                    Assign role
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite user">
        <InviteForm
          onDone={(msg, tone) => {
            setInviteOpen(false);
            flash(msg, tone);
            void qc.invalidateQueries({ queryKey: usersKey });
          }}
        />
      </Dialog>

      <Dialog open={assignFor !== null} onClose={() => setAssignFor(null)} title={`Assign role — ${assignFor?.name ?? ''}`}>
        {assignFor && (
          <AssignRoleForm
            userId={assignFor.id}
            branches={data.branches}
            onDone={(msg, tone) => {
              setAssignFor(null);
              flash(msg, tone);
              void qc.invalidateQueries({ queryKey: usersKey });
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function InviteForm({ onDone }: { onDone: (msg: string, tone?: 'ok' | 'err') => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [pending, setPending] = useState(false);

  const invite = async () => {
    if (!/.+@.+\..+/.test(email)) return onDone('Enter a valid email', 'err');
    setPending(true);
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email, full_name: fullName || email },
    });
    setPending(false);
    if (error) {
      onDone(
        'Invite failed — deploy the invite-user edge function (supabase functions deploy invite-user) and try again.',
        'err',
      );
      return;
    }
    await rpc.logActivity({ module: 'users', action: 'invited', entityType: 'user', entityId: email });
    onDone(`Invitation sent to ${email}`);
  };

  return (
    <div className="space-y-4">
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <p className="text-xs text-zinc-500">
        They'll get an email to set their password. Assign a role after they appear in the list — until then they can sign in but see nothing.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => void invite()} disabled={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      </div>
    </div>
  );
}

function AssignRoleForm({
  userId, branches, onDone,
}: {
  userId: string;
  branches: { id: string; name: string }[];
  onDone: (msg: string, tone?: 'ok' | 'err') => void;
}) {
  const [role, setRole] = useState<AppRole>('property_manager');
  const [branchId, setBranchId] = useState<string>('');
  const [pending, setPending] = useState(false);

  const assign = async () => {
    setPending(true);
    const payload = { user_id: userId, role, branch_id: branchId || null };
    const { data, error } = await supabase.from('user_roles').insert(payload).select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({
      module: 'users', action: 'role_assigned', entityType: 'user_role', entityId: data.id,
      after: JSON.parse(JSON.stringify(payload)) as never,
    });
    onDone('Role assigned');
  };

  return (
    <div className="space-y-4">
      <Field label="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label="Branch scope" hint="Leave as organization-wide unless this role should be limited to one branch.">
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Organization-wide</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => void assign()} disabled={pending}>{pending ? 'Assigning…' : 'Assign role'}</Button>
      </div>
    </div>
  );
}

/* ---------------- permission matrix ---------------- */
function PermissionMatrixCard({ flash }: { flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<AppRole>('property_manager');
  const locked = role === 'super_admin';

  const { data, isLoading } = useQuery({
    queryKey: matrixKey(role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('module, action, allowed')
        .eq('role', role);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).filter((r) => r.allowed).map((r) => `${r.module}:${r.action}`));
    },
  });

  const granted = useMemo(() => data ?? new Set<string>(), [data]);

  const toggle = useMutation({
    mutationFn: async ({ module, action, allowed }: { module: Module; action: Action; allowed: boolean }) => {
      const { error } = await supabase
        .from('role_permissions')
        .upsert({ role, module, action, allowed }, { onConflict: 'role,module,action' });
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'permissions', action: allowed ? 'granted' : 'revoked',
        entityType: 'role_permission', entityId: `${role}:${module}:${action}`,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matrixKey(role) }),
    onError: (e) => flash((e as Error).message, 'err'),
  });

  return (
    <Card>
      <CardHeader
        title="Permission matrix"
        subtitle={locked ? 'super_admin permissions are locked so nobody can lock themselves out.' : "Changes apply on the user's next data load."}
        action={
          <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className="w-52">
            {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        }
      />
      <CardBody>
        {isLoading ? (
          <PageSpinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4">Module</th>
                  {ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2 pr-4 font-mono text-xs">{m}</td>
                    {ACTIONS.map((a) => {
                      const on = granted.has(`${m}:${a}`);
                      return (
                        <td key={a} className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked || toggle.isPending}
                            onChange={() => toggle.mutate({ module: m, action: a, allowed: !on })}
                            aria-label={`${role} ${m} ${a}`}
                            className="h-4 w-4 accent-[var(--brand-primary)] disabled:opacity-40"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
