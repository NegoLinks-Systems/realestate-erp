import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const { sendReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await sendReset(email);
    if (error) setServerError(error);
    else setSent(true);
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#1C1C34] dark:bg-[#131325]">
        <h1 className="font-display text-lg font-semibold">Reset your password</h1>
        {sent ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            If an account exists for that email, a reset link is on its way. Open it on this device to choose a new password.
          </p>
        ) : (
          <>
            <Field label="Email" error={formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            {serverError && <p className="text-sm text-red-600">{serverError}</p>}
            <Button type="submit" disabled={formState.isSubmitting} className="w-full">
              {formState.isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </>
        )}
        <a href="/login" className="block text-center text-sm text-brand hover:underline">Back to sign in</a>
      </form>
    </div>
  );
}
