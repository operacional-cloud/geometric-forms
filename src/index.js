import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requireAuth, requireAdmin, requireTenantMember } from './lib/auth.js';
import { errorHandler } from './utils/errors.js';

import { createClientTenant, listTenants } from './functions/createClientTenant.js';
import { createForm, updateForm, listForms, listLeads, deleteForm } from './functions/saveForm.js';
import { getPublicForm, submitPublicLead } from './functions/submitPublicLead.js';
import { trackFormEvent } from './functions/trackFormEvent.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// CORS — público nas rotas /api/public/*, restritivo nas autenticadas.
// Pra MVP: liberamos tudo. Em produção, configurar uma allowlist por header Origin.
app.use(cors({ origin: true, credentials: false }));

// Log estruturado JSON por requisição
app.use((req, _res, next) => {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'http_request',
    method: req.method,
    path: req.path,
    ip: req.ip,
    ua: req.header('user-agent'),
  }));
  next();
});

// -------- Health -----------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

// -------- Admin (role=admin via JWT) ---------------------------------------
app.post('/api/admin/tenants', requireAuth, requireAdmin, createClientTenant);
app.get('/api/admin/tenants',  requireAuth, requireAdmin, listTenants);

// -------- Cliente do tenant (role=admin OU client do mesmo tenant) ---------
app.post('/api/forms',       requireAuth, requireTenantMember, createForm);
app.put('/api/forms/:id',    requireAuth, requireTenantMember, updateForm);
app.delete('/api/forms/:id', requireAuth, requireTenantMember, deleteForm);
app.get('/api/forms',        requireAuth, requireTenantMember, listForms);
app.get('/api/leads',        requireAuth, requireTenantMember, listLeads);

// -------- Público (sem auth) -----------------------------------------------
app.get('/api/public/forms/:tenantSlug/:formSlug', getPublicForm);
app.post('/api/public/leads',  submitPublicLead);
app.post('/api/public/events', trackFormEvent);

// 404 + erro
app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'not_found', message: 'Rota não encontrada' } }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'server_started', port: PORT }));
});
