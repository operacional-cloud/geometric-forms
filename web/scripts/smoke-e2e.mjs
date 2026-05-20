// Smoke test end-to-end: login admin → abrir tenant → login cliente → criar form → ver leads
import 'dotenv/config';

const SUPABASE_URL = 'https://cslyxnpxlytzqjurhdmd.supabase.co';
const ANON = 'sb_publishable_BptIxGEzYo_3JdhVP_G8tg_h60wKbkf';
const API = 'http://localhost:3000';
const WEB = 'http://localhost:3001';

async function login(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function api(path, opts = {}, jwt) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, ...(opts.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} -> ${JSON.stringify(j)}`);
  return j;
}

function ok(label) { console.log(`✓ ${label}`); }

const adminJwt = await login('admin@admin.com', '123456');
ok('login admin');

const { data: { tenants } } = await api('/api/admin/tenants', {}, adminJwt);
ok(`admin lista ${tenants.length} tenants — primeiro: ${tenants[0].name}`);
const tenantId = tenants[0].id;
const tenantSlug = tenants[0].slug;

const ownerJwt = await login('carlos@pillar.com', 'SenhaForte123!');
ok('login owner');

// Cria um form novo (testa builder)
const formPayload = {
  title: `Form smoke ${Date.now()}`,
  qualification_threshold: 5,
  is_active: true,
  fields: [
    { id: 'nome', type: 'text', label: 'Seu nome', required: true, system: true, order: 1 },
    { id: 'telefone', type: 'phone', label: 'WhatsApp', required: true, system: true, order: 2 },
    {
      id: 'renda', type: 'radio', label: 'Renda?', required: true, order: 3,
      options: [
        { label: 'Baixa', value: 'baixa', score: 1 },
        { label: 'Alta', value: 'alta', score: 10 },
      ],
    },
  ],
};
const created = await api('/api/forms', { method: 'POST', body: JSON.stringify(formPayload) }, ownerJwt);
const newFormId = created.data.form.id;
const newFormSlug = created.data.form.slug;
ok(`form criado: ${newFormSlug}`);

// Submete lead público nesse form
const submitR = await fetch(`${API}/api/public/leads`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    form_id: newFormId,
    event_id: `smoke-${Date.now()}`,
    answers: { nome: 'João Smoke', telefone: '+5511988887777', renda: 'alta' },
    tracking: { utm_source: 'smoke' },
  }),
});
const submitJ = await submitR.json();
if (!submitJ.success) throw new Error('submit failed: ' + JSON.stringify(submitJ));
ok(`lead submetido: score ${submitJ.data.lead_score}, qualificado=${submitJ.data.is_qualified}`);

// Edita o form (testa PUT)
const edited = await api(`/api/forms/${newFormId}`, {
  method: 'PUT',
  body: JSON.stringify({ qualification_threshold: 15, is_active: false }),
}, ownerJwt);
ok(`form editado: threshold=${edited.data.form.qualification_threshold} is_active=${edited.data.form.is_active}`);

// Lista leads do form específico
const leadsR = await api(`/api/leads?form_id=${newFormId}`, {}, ownerJwt);
ok(`${leadsR.data.leads.length} lead(s) do form encontrado(s)`);

// Testa rotas web (pra confirmar que páginas compilam)
async function checkPage(path, expectStatus = 200) {
  const r = await fetch(WEB + path, { redirect: 'manual' });
  const status = r.status;
  if (status !== expectStatus) throw new Error(`${path} -> HTTP ${status} (esperado ${expectStatus})`);
  return status;
}
await checkPage(`/f/${tenantSlug}/${newFormSlug}`, 200);
ok(`/f/${tenantSlug}/${newFormSlug} renderiza OK`);

console.log('\n✅ TUDO PASSOU — frontend + backend consistentes');
