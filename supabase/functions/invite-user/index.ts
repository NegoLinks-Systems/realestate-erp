// Deploy: supabase functions deploy invite-user
// Requires (set automatically on Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { email, full_name } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400 });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Only users.update holders may invite: verify the caller's JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: allowed } = await caller.rpc('has_permission', { p_module: 'users', p_action: 'update' });
    if (!allowed) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: full_name ?? email },
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
