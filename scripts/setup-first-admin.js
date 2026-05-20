// Cria o primeiro admin do sistema + roda um fluxo end-to-end de teste.
// Uso: node scripts/setup-first-admin.js <email> <password>
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = `http://localhost:${process.env.PORT || 3000}`;

const adminEmail = process.argv[2];
const adminPassword = process.argv[3];
if (!adminEmail || !adminPassword) {
  console.error('Uso: node scripts/setup-first-admin.js <email> <password>');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(step, payload) {
  console.log(`\n=== ${step} ===`);
  if (payload !== undefined) console.log(JSON.stringify(payload, null, 2));
}

// 1) Cria (ou recupera) o usuário admin
async function ensureAdminUser() {
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list?.users?.find((u) => u.email === adminEmail);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Admin Geometric', role: 'admin' },
    });
    if (error) throw new Error(`createUser falhou: ${error.message}`);
    user = data.user;
    log('1. admin criado em auth.users', { id: user.id, email: user.email });
  } else {
    log('1. admin já existia em auth.users', { id: user.id, email: user.email });
  }

  // Promove a role=admin no profile (caso o trigger tenha criado com client)
  const { error: upErr } = await admin
    .from('profiles')
    .update({ role: 'admin', tenant_id: null, full_name: 'Admin Geometric' })
    .eq('id', user.id);
  if (upErr) throw new Error(`update profile falhou: ${upErr.message}`);

  const { data: prof } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  log('2. profile do admin', prof);
  return user;
}

// 2) Login → JWT
async function login(email, password) {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login(${email}) falhou: ${error.message}`);
  return data.session.access_token;
}

// 3) Cria tenant via API
async function createTenant(adminJwt) {
  const res = await fetch(`${API_BASE}/api/admin/tenants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant: {
        name: 'Pillar Consórcios',
        slug: 'pillar-consorcios',
        primary_color: '#1a3a2e',
        secondary_color: '#FFFFFF',
        plan: 'starter',
      },
      owner: {
        email: 'carlos@pillar.com',
        full_name: 'Carlos Yoshimori',
        password: 'SenhaForte123!',
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`createTenant falhou: ${JSON.stringify(json)}`);
  return json.data;
}

// 4) Cria form via API (como owner)
async function createForm(ownerJwt) {
  const res = await fetch(`${API_BASE}/api/forms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Qualificação Consórcio',
      description: 'Preencha para receber proposta personalizada',
      qualification_threshold: 5,
      fields: [
        {
          id: 'renda',
          type: 'radio',
          label: 'Qual sua renda mensal?',
          required: true,
          order: 1,
          options: [
            { label: 'Até R$ 3 mil', value: 'ate_3k', score: 1 },
            { label: 'R$ 3 mil a R$ 10 mil', value: '3k_10k', score: 5 },
            { label: 'Acima de R$ 10 mil', value: 'acima_10k', score: 10 },
          ],
        },
        {
          id: 'email',
          type: 'email',
          label: 'Seu melhor email',
          required: true,
          order: 2,
        },
        {
          id: 'telefone',
          type: 'phone',
          label: 'WhatsApp',
          required: true,
          order: 3,
        },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`createForm falhou: ${JSON.stringify(json)}`);
  return json.data;
}

// 5) Submete lead público
async function submitLead(formId) {
  const res = await fetch(`${API_BASE}/api/public/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      form_id: formId,
      event_id: `lead-${Date.now()}`,
      answers: {
        renda: 'acima_10k',
        email: 'leadteste@exemplo.com',
        telefone: '+5511912345678',
      },
      tracking: {
        utm_source: 'facebook',
        utm_campaign: 'consorcio-jan',
        fbp: 'fb.1.test',
        fbc: 'fb.1.test_click',
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`submitLead falhou: ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  await ensureAdminUser();

  const adminJwt = await login(adminEmail, adminPassword);
  log('3. JWT admin obtido', { length: adminJwt.length });

  const tenantResult = await createTenant(adminJwt);
  log('4. tenant criado', tenantResult);

  const ownerJwt = await login('carlos@pillar.com', 'SenhaForte123!');
  log('5. JWT owner obtido', { length: ownerJwt.length });

  const formResult = await createForm(ownerJwt);
  log('6. form criado', formResult);

  const leadResult = await submitLead(formResult.form.id);
  log('7. lead submetido', leadResult);

  // Bônus: lista leads como o owner
  const leadsRes = await fetch(`${API_BASE}/api/leads`, {
    headers: { Authorization: `Bearer ${ownerJwt}` },
  });
  const leadsJson = await leadsRes.json();
  log('8. owner lista seus leads', leadsJson.data);
}

main().catch((err) => {
  console.error('\nFALHA:', err.message);
  process.exit(1);
});
