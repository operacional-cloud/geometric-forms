import { requireTenantMember } from '@/lib/server/auth';
import { isAiUnlocked } from '@/lib/server/ai-gate';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { Kicker } from '@/components/ui';
import { UnlockGate } from '../ai-attendance/unlock-gate';

export const dynamic = 'force-dynamic';

/**
 * /dashboard/integrations
 * Mostra como conectar sistemas externos (REST API + embed iframe).
 * Módulo RESTRITO: igual ao de IA, exige credenciais de admin do sistema
 * (mesmo gate/cookie `ai_unlock`). O cliente vê o menu com cadeado mas só
 * entra com liberação do admin.
 */
export default async function IntegrationsPage() {
  const ctx = await requireTenantMember();
  const unlocked = await isAiUnlocked();
  if (!unlocked) {
    return (
      <UnlockGate
        title="Integrações"
        description="Esse módulo expõe o token e os endpoints da API. Por isso exige credenciais de administrador do sistema. Peça pro seu gerente da Geometric Agency liberar o acesso."
      />
    );
  }
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', ctx.profile.tenant_id || '')
    .maybeSingle();

  const tokenSet = !!process.env.INTEGRATION_API_TOKEN;
  const tokenPrefix = (process.env.INTEGRATION_API_TOKEN || '').slice(0, 10);
  const base = 'https://forms.geometricagency.com';
  const tenantHeader = (tenant as any)?.id || '<TENANT_ID>';

  return (
    <main className="container-edge py-8 max-w-4xl">
      <Kicker>API PÚBLICA</Kicker>
      <h1 className="mt-2 text-3xl font-semibold tracking-tightest">Integrações</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Conecte outros sistemas (SaaS, automações, planilhas) ao Geometric Forms via REST ou iframe embed.
      </p>

      <section className="glass-static p-5 mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-mono text-fg-dim uppercase tracking-widest">Token de integração</div>
            <div className="mt-2 font-mono text-sm">
              {tokenSet
                ? <>Configurado · começa com <span className="px-2 py-0.5 rounded bg-white/10">{tokenPrefix}…</span></>
                : <span className="text-danger">⚠️ Não configurado. Adicione INTEGRATION_API_TOKEN nas env vars do Vercel.</span>}
            </div>
          </div>
          <div className="text-[11px] text-fg-dim max-w-xs text-right">
            Token global. Pra rotacionar, gere novo valor, atualize na Vercel e redeploye.
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Como autenticar</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Cada request precisa de DOIS headers:
        </p>
        <pre className="mt-3 glass-static p-4 text-xs font-mono overflow-x-auto"><code>{`Authorization: Bearer <INTEGRATION_API_TOKEN>
X-Tenant-Id: ${tenantHeader}`}</code></pre>
        <p className="mt-2 text-xs text-fg-dim">
          <strong>X-Tenant-Id</strong> aceita o UUID acima ou o slug do cliente ({(tenant as any)?.slug || 'ex: meu-cliente'}).
        </p>
      </section>

      <section className="mt-8 space-y-6">
        <h2 className="text-xl font-semibold">Endpoints disponíveis</h2>

        <EndpointBlock
          title="Listar leads"
          method="GET"
          path={`${base}/api/integrations/leads?limit=50&qualified=true`}
          body={`# Query params:
# - limit (default 50, max 200)
# - offset (paginação)
# - qualified=true (só qualificados)
# - since=2026-01-01 (ISO date)
# - stage_id=<uuid> (coluna do kanban)
# - q=joao (busca em nome/email/telefone)`}
        />
        <EndpointBlock
          title="Criar lead manual"
          method="POST"
          path={`${base}/api/integrations/leads`}
          body={`{
  "name": "João Silva",
  "phone": "5511999998888",
  "email": "joao@exemplo.com",
  "deal_value": 1500.00,
  "notes": "Veio do programa Indica",
  "source": "indica",
  "utm": { "source": "indica", "campaign": "ref_2026" }
}`}
        />
        <EndpointBlock
          title="Atualizar lead (mover de coluna, mudar valor, etc.)"
          method="PATCH"
          path={`${base}/api/integrations/leads/{lead_id}`}
          body={`{
  "stage_id": "<uuid_da_coluna>",
  "status": "ganho",
  "deal_value": 2000,
  "notes": "Cliente fechou hoje"
}`}
        />
        <EndpointBlock
          title="Board completo do kanban"
          method="GET"
          path={`${base}/api/integrations/kanban?days=60`}
          body={`# Retorna colunas + leads agrupados.
# Use no painel do Indica pra mostrar pipeline do cliente.`}
        />
        <EndpointBlock
          title="Conversas WhatsApp"
          method="GET"
          path={`${base}/api/integrations/whatsapp/chats?limit=50&include_groups=false`}
        />
        <EndpointBlock
          title="Mensagens de uma conversa"
          method="GET"
          path={`${base}/api/integrations/whatsapp/chats/{chat_id}/messages?limit=200`}
        />
        <EndpointBlock
          title="Enviar mensagem WhatsApp"
          method="POST"
          path={`${base}/api/integrations/whatsapp/chats/{chat_id}/send`}
          body={`{ "text": "Olá! Tudo bem?" }`}
        />
        <EndpointBlock
          title="Meta Ads — listar 55 tools disponíveis"
          method="GET"
          path={`${base}/api/integrations/meta-ads/tool`}
        />
        <EndpointBlock
          title="Meta Ads — executar tool"
          method="POST"
          path={`${base}/api/integrations/meta-ads/tool`}
          body={`{
  "name": "get_account_overview",
  "input": { "days": 30 }
}

# Exemplos de tools (lista completa via GET):
# - get_account_overview, list_campaigns, get_campaign_insights
# - pause_campaign, update_adset_budget, create_campaign
# - list_custom_audiences, list_catalogs, search_ads_library`}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Iframe embed</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Coloque o pipeline do cliente dentro de uma aba do seu outro sistema:
        </p>
        <pre className="mt-3 glass-static p-4 text-xs font-mono overflow-x-auto"><code>{`<iframe
  src="${base}/embed/kanban?token=<INTEGRATION_API_TOKEN>&tenant_id=${tenantHeader}"
  width="100%" height="800"
  style="border:0;border-radius:12px"
></iframe>`}</code></pre>
        <p className="mt-2 text-xs text-fg-dim">
          Domínios autorizados a embedar: <code>*.geometricagency.com</code> e localhost.
          Pra adicionar outros, edite <code>INTEGRATION_ALLOWED_ORIGINS</code> (CORS) + <code>next.config.mjs</code> (CSP frame-ancestors).
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Exemplo curl</h2>
        <pre className="mt-3 glass-static p-4 text-xs font-mono overflow-x-auto"><code>{`curl -X POST '${base}/api/integrations/leads' \\
  -H 'Authorization: Bearer <TOKEN>' \\
  -H 'X-Tenant-Id: ${tenantHeader}' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Teste","phone":"5511999998888","source":"indica"}'`}</code></pre>
      </section>
    </main>
  );
}

function EndpointBlock({
  title, method, path, body,
}: { title: string; method: string; path: string; body?: string }) {
  const methodColor =
    method === 'GET' ? '#5EE2FF' :
    method === 'POST' ? '#10F2A0' :
    method === 'PATCH' ? '#FFC857' :
    method === 'DELETE' ? '#FF6363' : '#A66EFC';
  return (
    <div className="glass-static p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
          style={{ background: `${methodColor}20`, color: methodColor, border: `1px solid ${methodColor}40` }}
        >{method}</span>
        <code className="text-xs font-mono break-all flex-1">{path}</code>
      </div>
      <div className="mt-2 text-sm">{title}</div>
      {body && (
        <pre className="mt-3 bg-bg-2/60 p-3 rounded text-[11px] font-mono overflow-x-auto"><code>{body}</code></pre>
      )}
    </div>
  );
}
