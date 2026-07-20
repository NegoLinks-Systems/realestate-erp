import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { NegoLinksLogo } from '../../components/brand/NegoLinks';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

const PRODUCT_SUBTITLE = 'Real Estate & Property Management ERP';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await signIn(values.email, values.password);
    if (error) { setServerError(error); return; }
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
    navigate(from, { replace: true });
  });

  return (
    <div className="grid min-h-full grid-cols-1 bg-[#080810] lg:grid-cols-2">
      {/* ---- LEFT HERO PANEL (product-specific: real estate) ---- */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(1000px 600px at 25% 20%, var(--accent-glow), transparent 60%), linear-gradient(160deg, #0E0E1C, #080810)' }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(var(--accent-light) 1px, transparent 1px), linear-gradient(90deg, var(--accent-light) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
        <svg className="absolute bottom-0 left-0 w-full opacity-30" viewBox="0 0 800 240" fill="none" preserveAspectRatio="xMidYMax slice">
          <g stroke="var(--accent-primary)" strokeWidth="1.5" fill="rgba(148,163,184,0.06)">
            {[40, 130, 210, 300, 400, 500, 590, 680].map((x, i) => (
              <rect key={x} x={x} y={140 - (i % 4) * 26} width="64" height={100 + (i % 4) * 26} rx="3" />
            ))}
          </g>
        </svg>

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <NegoLinksLogo size={40} />
            <span className="ng-wordmark font-display text-xl font-extrabold">NegoLinks</span>
          </div>

          <div className="max-w-md">
            <h2 className="font-display text-4xl font-bold leading-tight text-white">
              Run every property,<br />lease and payment<br />in one place.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#A0A0B8]">
              The enterprise, AI-powered platform for real estate and property management —
              from tenancies and rent billing to maintenance, facilities and procurement.
            </p>
            <div className="mt-8 space-y-3">
              {[
                { icon: Building2, text: 'Portfolio, leasing & tenant portal' },
                { icon: Sparkles, text: 'AI insights across every module' },
                { icon: ShieldCheck, text: 'Role-based access, enforced at the database' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-[#CBD5E1]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#5A5A78]">Powered by NegoLinks Enterprise Suite</p>
        </div>
      </div>

      {/* ---- RIGHT LOGIN CARD ---- */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <NegoLinksLogo size={52} />
            <h1 className="ng-wordmark mt-3 font-display text-2xl font-extrabold">NegoLinks</h1>
            <p className="mt-1 text-sm text-white/90">{PRODUCT_SUBTITLE}</p>
          </div>

          <div className="ng-glass-strong rounded-[20px] p-7 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <div className="mb-6 hidden text-center lg:block">
              <h1 className="font-display text-xl font-bold text-white">Welcome back</h1>
              <p className="mt-1 text-sm text-[#A0A0B8]">Sign in to your workspace</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#CBD5E1]">Email</label>
                <input
                  type="email" autoComplete="email" {...register('email')}
                  className="w-full rounded-lg border border-[#1C1C34] bg-[#0E0E1C] px-3 py-2.5 text-sm text-white placeholder:text-[#5A5A78] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)]"
                  placeholder="you@company.com"
                />
                {formState.errors.email && <p className="mt-1 text-xs text-red-400">{formState.errors.email.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#CBD5E1]">Password</label>
                <input
                  type="password" autoComplete="current-password" {...register('password')}
                  className="w-full rounded-lg border border-[#1C1C34] bg-[#0E0E1C] px-3 py-2.5 text-sm text-white placeholder:text-[#5A5A78] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)]"
                  placeholder="••••••••"
                />
                {formState.errors.password && <p className="mt-1 text-xs text-red-400">{formState.errors.password.message}</p>}
              </div>

              {serverError && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{serverError}</p>
              )}

              <button
                type="submit" disabled={formState.isSubmitting}
                className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-px disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-deep))', boxShadow: '0 4px 20px var(--accent-glow)' }}
              >
                {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>

              <a href="/forgot-password" className="block text-center text-sm text-[var(--accent-light)] hover:underline">
                Forgot your password?
              </a>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] text-[#5A5A78]">
            © {new Date().getFullYear()} Nego Links Systems Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
