import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBranding } from '../../providers/BrandingProvider';
import { organizationSettingsSchema, type OrganizationSettingsInput } from '../../schemas';
import { useOrgSettingsMutation } from './shared';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

export default function OrganizationSettings() {
  const { settings, isLoading } = useBranding();
  const mutation = useOrgSettingsMutation('organization');
  const [toast, setToast] = useState<string | null>(null);

  const form = useForm<OrganizationSettingsInput>({
    resolver: zodResolver(organizationSettingsSchema),
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        organization_name: settings.organization_name,
        product_name: settings.product_name,
        application_name: settings.application_name,
        address: settings.address ?? '',
        website: settings.website ?? '',
        currency: settings.currency,
        timezone: settings.timezone,
        date_format: settings.date_format,
        language: settings.language,
      });
    }
  }, [settings, form]);

  if (isLoading || !settings) return <PageSpinner />;

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync({
      organization_name: values.organization_name,
      product_name: values.product_name,
      application_name: values.application_name,
      address: values.address || null,
      website: values.website || null,
      currency: values.currency.toUpperCase(),
      timezone: values.timezone,
      date_format: values.date_format,
      language: values.language,
    });
    setToast('Organization details saved');
    setTimeout(() => setToast(null), 2500);
  });

  const err = form.formState.errors;

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader title="Organization" subtitle="Names, contact, and regional defaults." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Organization name" error={err.organization_name?.message}>
            <Input {...form.register('organization_name')} />
          </Field>
          <Field label="Application name" hint="Shown in the sidebar and browser tab." error={err.application_name?.message}>
            <Input {...form.register('application_name')} />
          </Field>
          <Field label="Product name" error={err.product_name?.message}>
            <Input {...form.register('product_name')} />
          </Field>
          <Field label="Website" error={err.website?.message}>
            <Input placeholder="https://…" {...form.register('website')} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address" error={err.address?.message}>
              <Textarea rows={2} {...form.register('address')} />
            </Field>
          </div>
          <Field label="Currency" hint="3-letter code, e.g. NGN" error={err.currency?.message}>
            <Input {...form.register('currency')} />
          </Field>
          <Field label="Timezone" error={err.timezone?.message}>
            <Input placeholder="Africa/Lagos" {...form.register('timezone')} />
          </Field>
          <Field label="Date format" error={err.date_format?.message}>
            <Select {...form.register('date_format')}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
          </Field>
          <Field label="Language" error={err.language?.message}>
            <Input placeholder="en" {...form.register('language')} />
          </Field>
        </CardBody>
        <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-[#1C1C34]">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Card>
      {toast && <Toast message={toast} tone="ok" />}
      {mutation.isError && <Toast message={(mutation.error as Error).message} tone="err" />}
    </form>
  );
}
