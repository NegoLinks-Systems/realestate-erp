import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { Badge, EmptyState, PageSpinner } from '../../components/ui/Bits';

interface AuditRow {
  id: number;
  actor_id: string | null;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

export default function ActivityLog() {
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs' as never)
        .select('id, actor_id, module, action, entity_type, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data as unknown as AuditRow[];
    },
  });

  if (isLoading) return <PageSpinner />;

  const rows = (data ?? []).filter((r) =>
    !filter.trim()
      ? true
      : `${r.module} ${r.action} ${r.entity_type} ${r.entity_id ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader
        title="Activity log"
        subtitle="Every sensitive change, who made it, and when. Append-only."
        action={<Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" />}
      />
      <CardBody>
        {rows.length === 0 ? (
          <EmptyState title="No activity yet" hint="Settings changes will appear here as they happen." />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Badge tone="zinc">{r.module}</Badge>
                <span className="font-medium">{r.action}</span>
                <span className="text-zinc-500">{r.entity_type}</span>
                {r.entity_id && <span className="font-mono text-xs text-zinc-400">{r.entity_id}</span>}
                <span className="ml-auto font-mono text-xs text-zinc-400">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
