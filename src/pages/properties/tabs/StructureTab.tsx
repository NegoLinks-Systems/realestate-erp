import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Wand2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys, unitKeys } from '../../../api/keys';
import type { UnitType } from '../../../lib/database.types';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';
import { UNIT_TYPES } from '../shared';

export default function StructureTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('properties', 'update');

  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };
  const [genFor, setGenFor] = useState<{ floorId: string; label: string } | null>(null);

  const structure = useQuery({
    queryKey: propertyKeys.structure(propertyId),
    queryFn: async () => {
      const [b, f, u] = await Promise.all([
        supabase.from('buildings').select('*').eq('property_id', propertyId).is('deleted_at', null).order('name'),
        supabase.from('floors').select('*').is('deleted_at', null).order('floor_number'),
        supabase.from('units').select('id, floor_id').eq('property_id', propertyId).is('deleted_at', null),
      ]);
      if (b.error) throw new Error(b.error.message);
      if (f.error) throw new Error(f.error.message);
      if (u.error) throw new Error(u.error.message);
      const buildingIds = new Set(b.data.map((x) => x.id));
      return {
        buildings: b.data,
        floors: f.data.filter((fl) => buildingIds.has(fl.building_id)),
        unitCountByFloor: (u.data ?? []).reduce<Record<string, number>>((acc, unit) => {
          if (unit.floor_id) acc[unit.floor_id] = (acc[unit.floor_id] ?? 0) + 1;
          return acc;
        }, {}),
      };
    },
  });

  const addBuilding = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from('buildings').insert({ property_id: propertyId, name }).select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'created', entityType: 'building', entityId: data.id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: propertyKeys.structure(propertyId) }); flash('Building added'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const addFloor = useMutation({
    mutationFn: async ({ buildingId, floorNumber }: { buildingId: string; floorNumber: number }) => {
      const { data, error } = await supabase.from('floors').insert({ building_id: buildingId, floor_number: floorNumber }).select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'created', entityType: 'floor', entityId: data.id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: propertyKeys.structure(propertyId) }); flash('Floor added'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (structure.isLoading) return <PageSpinner />;
  const { buildings, floors, unitCountByFloor } = structure.data!;

  return (
    <div className="space-y-4">
      {canEdit && (
        <AddBuildingBar pending={addBuilding.isPending} onAdd={(name) => addBuilding.mutate(name)} />
      )}

      {buildings.length === 0 ? (
        <EmptyState
          title="No buildings yet"
          hint="Add a building, give it floors, then generate units in bulk — a 40-unit block takes under a minute."
        />
      ) : (
        buildings.map((b) => {
          const bFloors = floors.filter((f) => f.building_id === b.id);
          return (
            <Card key={b.id}>
              <CardHeader
                title={b.name}
                subtitle={`${bFloors.length} floor${bFloors.length === 1 ? '' : 's'}`}
                action={canEdit ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = bFloors.length ? Math.max(...bFloors.map((f) => f.floor_number)) + 1 : 1;
                      addFloor.mutate({ buildingId: b.id, floorNumber: next });
                    }}
                    disabled={addFloor.isPending}
                  >
                    <Plus className="h-4 w-4" /> Add floor
                  </Button>
                ) : undefined}
              />
              <CardBody>
                {bFloors.length === 0 ? (
                  <p className="text-sm text-zinc-500">No floors yet.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {bFloors.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
                        <Layers className="h-4 w-4 text-zinc-400" />
                        <span className="font-medium">
                          {f.floor_number === 0 ? 'Ground floor' : f.floor_number < 0 ? `Basement ${-f.floor_number}` : `Floor ${f.floor_number}`}
                          {f.name ? ` · ${f.name}` : ''}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">{unitCountByFloor[f.id] ?? 0} units</span>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            className="ml-auto"
                            onClick={() => setGenFor({ floorId: f.id, label: `${b.name} · floor ${f.floor_number}` })}
                          >
                            <Wand2 className="h-4 w-4" /> Generate units
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })
      )}

      <Dialog open={genFor !== null} onClose={() => setGenFor(null)} title={`Generate units — ${genFor?.label ?? ''}`}>
        {genFor && (
          <GenerateUnitsForm
            floorId={genFor.floorId}
            onDone={(count) => {
              setGenFor(null);
              void qc.invalidateQueries({ queryKey: propertyKeys.structure(propertyId) });
              void qc.invalidateQueries({ queryKey: unitKeys.all });
              void qc.invalidateQueries({ queryKey: propertyKeys.stats() });
              flash(`${count} units created`);
            }}
            onError={(m) => flash(m, 'err')}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function AddBuildingBar({ onAdd, pending }: { onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <Input placeholder="Building name, e.g. Block A" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
      <Button
        variant="outline"
        disabled={!name.trim() || pending}
        onClick={() => { onAdd(name.trim()); setName(''); }}
      >
        <Plus className="h-4 w-4" /> Add building
      </Button>
    </div>
  );
}

function GenerateUnitsForm({
  floorId, onDone, onError,
}: {
  floorId: string;
  onDone: (count: number) => void;
  onError: (msg: string) => void;
}) {
  const [prefix, setPrefix] = useState('A-');
  const [count, setCount] = useState(10);
  const [unitType, setUnitType] = useState<UnitType>('apartment');
  const [baseRent, setBaseRent] = useState('0');
  const [serviceCharge, setServiceCharge] = useState('0');
  const [bedrooms, setBedrooms] = useState('');
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (count < 1 || count > 200) return onError('Count must be between 1 and 200');
    setPending(true);
    try {
      const units = await rpc.generateUnits({
        floorId, prefix, count, unitType,
        baseRent: Number(baseRent) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
      });
      await rpc.logActivity({
        module: 'units', action: 'bulk_generated', entityType: 'floor', entityId: floorId,
        after: { count: units.length, prefix, unitType } as never,
      });
      onDone(units.length);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Prefix" hint="Naming: prefix + floor + sequence, e.g. A-101"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
      <Field label="How many"><Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
      <Field label="Unit type">
        <Select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)}>
          {UNIT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Bedrooms (optional)"><Input type="number" min={0} value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} /></Field>
      <Field label="Base rent per period"><Input type="number" min={0} value={baseRent} onChange={(e) => setBaseRent(e.target.value)} /></Field>
      <Field label="Service charge"><Input type="number" min={0} value={serviceCharge} onChange={(e) => setServiceCharge(e.target.value)} /></Field>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={() => void run()} disabled={pending}>{pending ? 'Generating…' : `Generate ${count} units`}</Button>
      </div>
    </div>
  );
}
