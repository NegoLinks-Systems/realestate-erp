import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    const { error } = await updatePassword(password);
    if (error) setServerError(error);
    else navigate('/', { replace: true });
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="font-display text-lg font-semibold">Choose a new password</h1>
        {!session && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Open this page from the link in your reset email so we can verify it's you.
          </p>
        )}
        <Field label="New password" error={formState.errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" error={formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <Button type="submit" disabled={formState.isSubmitting || !session} className="w-full">
          {formState.isSubmitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </div>
  );
}
