/**
 * NegoLinks brand marks.
 *
 * The official logo is a gold infinity-loop emblem. This renders a faithful
 * inline-SVG version in the metallic-gold gradient so there is no missing-asset
 * dependency and it stays crisp at any size. To use the official raster asset
 * instead, drop `negolinks-logo.png` into /public and swap <NegoLinksLogo/> for
 * an <img> — the surrounding markup is unchanged.
 *
 * The gold never changes regardless of a product's accent color (brand rule).
 */
export function NegoLinksLogo({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ng-gold" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7E7A8" />
          <stop offset="0.45" stopColor="#E9C767" />
          <stop offset="1" stopColor="#B8901F" />
        </linearGradient>
      </defs>
      {/* interlinked infinity loops */}
      <path
        d="M22 20c-7 0-12 5-12 12s5 12 12 12c5 0 8.5-3 11-6.5l7-9.5c2.2-3 4.6-5 8-5 4.4 0 8 3.6 8 8s-3.6 8-8 8c-3.2 0-5.6-1.8-7.6-4.4"
        stroke="url(#ng-gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M42 44c7 0 12-5 12-12S49 20 42 20c-5 0-8.5 3-11 6.5l-7 9.5c-2.2 3-4.6 5-8 5-4.4 0-8-3.6-8-8s3.6-8 8-8c3.2 0 5.6 1.8 7.6 4.4"
        stroke="url(#ng-gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.92"
      />
    </svg>
  );
}

/**
 * Full-screen NegoLinks splash / loading screen.
 * Product-mood background (Real Estate = sophisticated silver on dark),
 * gold logo centered, accent-color progress bar at the bottom.
 */
export function Splash({ subtitle = 'Real Estate & Property Management ERP' }: { subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#080810]">
      {/* accent glow field */}
      <div className="pointer-events-none absolute inset-0">
        <div className="ng-pulse absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 62%)' }} />
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'linear-gradient(var(--accent-light) 1px, transparent 1px), linear-gradient(90deg, var(--accent-light) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      </div>

      <div className="relative flex flex-col items-center">
        <div className="ng-float">
          <NegoLinksLogo size={72} />
        </div>
        <h1 className="ng-wordmark mt-5 font-display text-3xl font-extrabold tracking-tight">NegoLinks</h1>
        <p className="mt-1 text-sm font-medium text-white/90">{subtitle}</p>
        <p className="mt-6 text-xs tracking-wide text-[#5A5A78]">Loading Enterprise Platform…</p>
      </div>

      <div className="relative mt-6 h-[3px] w-56 overflow-hidden rounded-full bg-white/5">
        <div className="ng-progress-bar absolute inset-0" />
      </div>

      <div className="absolute bottom-6 text-[11px] text-[#5A5A78]">Powered by NegoLinks Enterprise Suite</div>
    </div>
  );
}
