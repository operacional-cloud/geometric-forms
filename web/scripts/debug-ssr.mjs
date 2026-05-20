// Login via Supabase, simula cookie do @supabase/ssr e hit nas rotas protegidas
// pra detectar qual servidora componente está errando.
import 'dotenv/config';

const SUPABASE_URL = 'https://cslyxnpxlytzqjurhdmd.supabase.co';
const ANON = 'sb_publishable_BptIxGEzYo_3JdhVP_G8tg_h60wKbkf';
const WEB = 'http://localhost:3001';
const PROJECT_REF = 'cslyxnpxlytzqjurhdmd';

async function login(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}

function buildSessionCookie(session) {
  const payload = [
    session.access_token,
    session.refresh_token,
    null,                          // provider_token
    null,                          // provider_refresh_token
    session.user,
  ];
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  // Cookie chunks: cada chunk até ~3180 chars
  const chunkSize = 3180;
  const value = 'base64-' + b64;
  const chunks = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  if (chunks.length === 1) {
    return [`${cookieName}=${chunks[0]}`];
  }
  return chunks.map((c, i) => `${cookieName}.${i}=${c}`);
}

async function hit(path, cookies) {
  const r = await fetch(WEB + path, {
    headers: { Cookie: cookies.join('; ') },
    redirect: 'manual',
  });
  const body = await r.text();
  // Procura sinais de erro do Next dev mode
  const hasError = /Server Error|Jest worker|exceeding retry limit|Application error/i.test(body);
  const status = r.status;
  return { status, hasError, snippet: hasError ? body.slice(0, 500) : null };
}

const sess = await login('carlos@pillar.com', 'SenhaForte123!');
if (!sess.access_token) { console.error('login fail', sess); process.exit(1); }
const ownerCookies = buildSessionCookie(sess);
console.log('owner cookie chunks:', ownerCookies.length);

const admin = await login('admin@admin.com', '123456');
const adminCookies = buildSessionCookie(admin);

// busca form id
const f = await fetch('http://localhost:3000/api/forms', { headers: { Authorization: 'Bearer ' + sess.access_token } });
const fj = await f.json();
const activeForm = fj.data.forms.find(x => x.is_active) || fj.data.forms[0];
const formId = activeForm.id;
console.log('using form:', activeForm.title, '·', formId);

const t = await fetch('http://localhost:3000/api/admin/tenants', { headers: { Authorization: 'Bearer ' + admin.access_token } });
const tj = await t.json();
const tenantId = tj.data.tenants[0].id;
console.log('using tenant:', tenantId);

const tests = [
  ['/',                                       null],
  ['/login',                                  null],
  ['/dashboard',                              ownerCookies],
  ['/dashboard/forms',                        ownerCookies],
  ['/dashboard/forms/new',                    ownerCookies],
  [`/dashboard/forms/${formId}`,              ownerCookies],
  [`/dashboard/forms/${formId}/leads`,        ownerCookies],
  ['/dashboard/leads',                        ownerCookies],
  ['/admin',                                  adminCookies],
  ['/admin/new',                              adminCookies],
  [`/admin/${tenantId}`,                      adminCookies],
];

for (const [path, cookies] of tests) {
  const result = await hit(path, cookies || []);
  const tag = result.hasError ? '⨯ ERRO' : (result.status >= 400 ? `! HTTP ${result.status}` : '✓');
  console.log(`${tag.padEnd(12)} ${path}`);
  if (result.hasError) {
    console.log('    snippet:', result.snippet.replace(/\s+/g, ' ').slice(0, 200));
  }
}
