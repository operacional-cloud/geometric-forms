import { synthesizeSpeech } from '@/lib/server/gemini';

export const dynamic = 'force-dynamic';

/** Endpoint diagnóstico (público): testa se o Gemini TTS está funcionando. */
export async function GET() {
  const t0 = Date.now();
  const r = await synthesizeSpeech('Olá, isso é um teste de áudio gerado pela inteligência artificial.');
  const ms = Date.now() - t0;
  if (!r) {
    return Response.json({ success: false, ms, error: 'synthesizeSpeech retornou null — checa logs do servidor pra erro do Gemini' });
  }
  return Response.json({
    success: true,
    ms,
    mimetype: r.mimetype,
    base64_length: r.base64.length,
    base64_prefix: r.base64.slice(0, 60),
  });
}
