import { useEffect, useState } from 'react';
import { useBranding } from '../../providers/BrandingProvider';
import { useOrgSettingsMutation } from './shared';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

export default function AiSettings() {
  const { settings, isLoading } = useBranding();
  const mutation = useOrgSettingsMutation('ai_branding');
  const [name, setName] = useState('Assistant');
  const [tagline, setTagline] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const ai = (settings.ai_branding ?? {}) as { name?: string; tagline?: string };
      setName(ai.name ?? 'Assistant');
      setTagline(ai.tagline ?? '');
    }
  }, [settings]);

  if (isLoading || !settings) return <PageSpinner />;

  const save = async () => {
    if (!name.trim()) {
      setToast('Give the assistant a name');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    await mutation.mutateAsync({ ai_branding: { name: name.trim(), tagline: tagline.trim() } as never });
    setToast('Assistant branding saved');
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <Card>
      <CardHeader
        title="AI assistant branding"
        subtitle="The assistant ships in a later phase; its name is configured here from day one and is never hardcoded."
      />
      <CardBody className="grid gap-4 md:grid-cols-2">
        <Field label="Assistant name" hint='e.g. "Property Intelligence" or "Executive Assistant"'>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tagline">
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </Field>
      </CardBody>
      <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <Button onClick={() => void save()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
      {toast && <Toast message={toast} tone="ok" />}
    </Card>
  );
}
