// Real-browser navigation test against the PRODUCTION bundle.
// Mocks Supabase at the network layer; pre-seeds a session in localStorage.
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const SB = 'https://stubproj.supabase.co';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'e2e@test.local',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities: [],
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const session = {
  access_token: 'e2e-fake-access-token', token_type: 'bearer',
  expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: 'e2e-fake-refresh', user,
};

const orgRow = {
  id: '11111111-1111-4111-8111-111111111111', singleton: true,
  organization_name: 'E2E Test Org', legal_name: null, logo_url: null,
  primary_color: null, secondary_color: null, accent_color: null,
  currency: 'NGN', timezone: 'Africa/Lagos', date_format: 'DD/MM/YYYY', language: 'en',
  contact_email: null, contact_phone: null, address: null, website: null,
  tax_info: {}, registration_details: {}, email_template_defaults: {}, document_template_defaults: {},
  feature_flags: {}, demo_mode: false,
  ai_config: { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.7, max_tokens: 4096, top_p: 1, streaming: true, timeout_seconds: 30, max_retries: 3, monthly_request_limit: 10000, modules: {} },
  notification_config: { channels: { in_app: true, email: false, sms: false, whatsapp: false, push: false } },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function restBody(pathname, wantsObject) {
  if (pathname.includes('/rest/v1/rpc/portfolio_stats')) {
    const row = { total_properties: 0, total_units: 0, occupied_units: 0, vacant_units: 0, occupancy_rate: 0 };
    return wantsObject ? row : [row];
  }
  if (pathname.includes('/rest/v1/user_roles')) return [{ role: 'super_admin' }];
  if (pathname.includes('/rest/v1/role_permissions')) return [];
  if (pathname.includes('/rest/v1/organization_settings')) return wantsObject ? orgRow : [orgRow];
  return wantsObject ? {} : [];
}

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext();
await ctx.addInitScript(([key, sess]) => {
  window.localStorage.setItem(key, JSON.stringify(sess));
}, ['sb-stubproj-auth-token', session]);

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 500)));

await page.route(`${SB}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const accept = req.headers()['accept'] ?? '';
  const wantsObject = accept.includes('vnd.pgrst.object');
  if (url.pathname.startsWith('/auth/v1/user')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
  }
  if (url.pathname.startsWith('/auth/v1/token')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
  }
  if (url.pathname.startsWith('/auth/v1/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  const body = restBody(url.pathname, wantsObject);
  return route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'content-range': '0-0/*' },
    body: JSON.stringify(body),
  });
});

const snap = async () => page.evaluate(() => ({
  url: window.location.pathname,
  h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()),
  hasExecDash: !!document.body.textContent?.includes('Executive dashboard'),
  activeNav: [...document.querySelectorAll('nav a[aria-current="page"], aside a[aria-current="page"]')].map((a) => a.textContent?.trim()),
}));

console.log('--- loading', BASE, '---');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('BOOT:', JSON.stringify(await snap()));

// If we ended up on the login screen, the session seed failed — report and stop.
const onLogin = await page.evaluate(() => !!document.body.textContent?.includes('Sign In') || !!document.body.textContent?.includes('Welcome back'));
if (onLogin) {
  console.log('RESULT: STUCK_ON_LOGIN (session seed failed — cannot test authed nav)');
} else {
  // Click Tenants in the sidebar
  const tenants = page.getByRole('link', { name: 'Tenants' }).first();
  await tenants.click();
  await page.waitForTimeout(2000);
  const afterTenants = await snap();
  console.log('AFTER_CLICK_TENANTS:', JSON.stringify(afterTenants));

  // exercise the (fixed) Universal Search itself: open, type, close
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const paletteOpen = await page.evaluate(() => !!document.querySelector('input[placeholder*="Search properties"]'));
  if (paletteOpen) { await page.keyboard.type('ten'); await page.waitForTimeout(700); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  console.log('PALETTE_TEST:', paletteOpen ? 'opened+typed+closed' : 'did not open');

  const finance = page.getByRole('link', { name: 'Finance' }).first();
  await finance.click();
  await page.waitForTimeout(2000);
  const afterFinance = await snap();
  console.log('AFTER_CLICK_FINANCE:', JSON.stringify(afterFinance));

  const navBroken =
    (afterTenants.url === '/tenants' && afterTenants.hasExecDash) ||
    (afterFinance.url === '/finance' && afterFinance.hasExecDash);
  console.log('RESULT:', navBroken ? 'REPRODUCED_NAV_FREEZE' : 'NAVIGATION_OK');
}

console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors, null, 1));
console.log('PAGE_ERRORS:', JSON.stringify(pageErrors, null, 1));
await browser.close();
