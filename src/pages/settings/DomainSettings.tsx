import { useEffect, useState } from 'react';
import { useBranding } from '../../providers/BrandingProvider';
import { useOrgSettingsMutation } from './shared';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

interface DomainSettingsShape {
  primary_domain?: string;
  app_url?: string;
  portal_url?: string;
  api_base_url?: string;
}

const FIELDS: { key: keyof DomainSettingsShape; label: string; hint?: string }[] = [
  { key: 'primary_domain', label: 'Primary domain', hint: 'Used in generated documents, e.g. erp.yourcompany.com' },
  { key: 'app_url', label: 'Application URL' },
  { key: 'portal_url', label: 'Client portal URL' },
  { key: 'api_base_url', label: 'API base URL' },
];

export default function DomainSettings() {
  const { settings, isLoading } = useBranding();
  const mutation = useOrgSettingsMutation('domain');
  const [values, setValues] = useState<DomainSettingsShape>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setValues((settings.domain_settings ?? {}) as DomainSettingsShape);
  }, [settings]);

  if (isLoading || !settings) return <PageSpinner />;

  const save = async () => {
    await mutation.mutateAsync({ domain_settings: values as never });
    setToast('Domain settings saved');
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <Card>
      <CardHeader
        title="Domain & deployment"
        subtitle="Nothing is hardcoded — move the app to a new domain without code changes."
      />
      <CardBody className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder="https://…"
            />
          </Field>
        ))}
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
