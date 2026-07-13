import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../hooks/useAuth';
import { useBranding } from '../../providers/BrandingProvider';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { signIn } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const login = (branding.settings?.login_branding ?? {}) as { headline?: string };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      setServerError(error);
      return;
    }
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
    navigate(from, { replace: true });
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="mx-auto h-12 object-contain" />
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand font-display text-lg font-bold text-white">
              {branding.organizationName.charAt(0)}
            </div>
          )}
          <h1 className="mt-4 font-display text-xl font-semibold">{branding.applicationName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {login.headline ?? `Sign in to ${branding.organizationName}`}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Field label="Email" error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Password" error={formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          <Button type="submit" disabled={formState.isSubmitting} className="w-full">
            {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <a href="/forgot-password" className="block text-center text-sm text-brand hover:underline">
            Forgot your password?
          </a>
        </form>
      </div>
    </div>
  );
}
