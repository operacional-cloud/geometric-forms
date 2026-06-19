import { supabaseAdmin } from '@/lib/server/supabase-admin';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const log: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || 'd822fe1f-e8ce-43ba-8444-fd3b01e0ca3c'); // default: Pillar
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('anthropic_api_key, name')
      .eq('id', tenantId)
      .single();
    if (!(tenant as any)?.anthropic_api_key) return Response.json({ ok: false, log: ['No key'] });
    log.push(`Key prefix: ${String((tenant as any).anthropic_api_key).slice(0, 15)}...`);
    const client = new Anthropic({ apiKey: (tenant as any).anthropic_api_key });

    // Tenta vários nomes de modelo até achar um que funciona
    const modelsToTry = [
      'claude-sonnet-4-6',
      'claude-sonnet-4-6-20251001',
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-0',
      'claude-3-5-sonnet-latest',
    ];
    for (const model of modelsToTry) {
      try {
        const r = await client.messages.create({
          model,
          max_tokens: 64,
          messages: [{ role: 'user', content: 'Responda apenas "ok"' }],
        });
        const text = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        log.push(`MODEL OK: ${model} -> ${text}`);
        return Response.json({ ok: true, working_model: model, log });
      } catch (e: any) {
        log.push(`MODEL ${model}: ${e?.message?.slice(0, 200) || 'fail'}`);
      }
    }
    return Response.json({ ok: false, log });
  } catch (e: any) {
    log.push(`OUTER ERR: ${e?.message || e}`);
    return Response.json({ ok: false, log });
  }
}
