import { processInboundMessage } from '@/lib/server/whatsapp';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { getMediaBase64 } from '@/lib/server/evolution';
import { transcribeAudio } from '@/lib/server/gemini';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook chamado pelo Evolution API a cada evento (mensagem nova, QR atualizado, etc).
 * Eventos esperados:
 *   - MESSAGES_UPSERT          → mensagem inbound do lead
 *   - QRCODE_UPDATED           → novo QR pra escanear
 *   - CONNECTION_UPDATE        → status da instance mudou
 *
 * Sem auth dedicada (o tunnel já é "secreto" e a Evolution_API_KEY filtra na ponta de envio).
 * Pra segurança extra, dá pra validar shared secret no header — depois.
 */
export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const event = payload?.event || '';
  const instanceName = payload?.instance || payload?.instanceName || '';

  // Log resumido (sem PII pesado)
  console.log(JSON.stringify({
    level: 'info', msg: 'wa_webhook', event, instance: instanceName,
  }));

  try {
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const data = payload?.data || {};
      // Ignora mensagens que NÓS enviamos (fromMe = true)
      if (data?.key?.fromMe) return Response.json({ ok: true, ignored: 'from_me' });

      const remoteJid: string = data?.key?.remoteJid || '';
      // remoteJidAlt: JID alternativo (geralmente @s.whatsapp.net) quando o remoteJid é @lid.
      // Esse campo é o ouro pra match — vincula LID ↔ JID público sem ambiguidade.
      const remoteJidAlt: string | undefined = data?.key?.remoteJidAlt;
      console.log(JSON.stringify({
        level: 'info', msg: 'wa_msg_in',
        remoteJid, remoteJidAlt, pushName: data?.pushName,
      }));

      if (!remoteJid) {
        return Response.json({ ok: true, ignored: 'no_jid' });
      }
      // Grupos (@g.us) agora são aceitos no banco — UI do módulo IA de Atendimento
      // exibe-os. Marcamos via display_name como nome do grupo se vier.
      const isGroup = remoteJid.endsWith('@g.us');

      let text: string =
        data?.message?.conversation
        || data?.message?.extendedTextMessage?.text
        || data?.message?.imageMessage?.caption
        || '';

      // Detecta áudio (voz ou anexo) e transcreve via Gemini multimodal
      const audioPart =
        data?.message?.audioMessage
        || data?.message?.pttMessage
        || null;
      let wasAudio = false;
      if (!text.trim() && audioPart) {
        const media = await getMediaBase64(instanceName, { key: data.key, message: data.message });
        if (media?.base64) {
          const transcript = await transcribeAudio({
            base64: media.base64,
            mimetype: media.mimetype || audioPart?.mimetype || 'audio/ogg',
          });
          if (transcript) {
            text = transcript; // texto puro, sem prefixo (a IA processa como mensagem normal)
            wasAudio = true;
            console.log(JSON.stringify({
              level: 'info', msg: 'wa_audio_transcribed', chars: transcript.length, remoteJid,
            }));
          } else {
            // Transcrição falhou: ignora event, não envia nada (lead vai reenviar)
            console.log(JSON.stringify({
              level: 'warn', msg: 'wa_audio_transcribe_failed', remoteJid,
            }));
            return Response.json({ ok: true, ignored: 'transcribe_failed' });
          }
        } else {
          console.log(JSON.stringify({
            level: 'warn', msg: 'wa_audio_download_failed', remoteJid,
          }));
          return Response.json({ ok: true, ignored: 'audio_download_failed' });
        }
      }

      if (!text.trim()) return Response.json({ ok: true, ignored: 'no_text' });

      const displayName: string | null = data?.pushName || null;
      const evolutionMessageId: string | undefined = data?.key?.id;
      // Em grupos, key.participant é o jid do remetente; em contato direto, vem vazio.
      const senderJid: string | null = (isGroup && data?.key?.participant) ? data.key.participant : null;
      const senderName: string | null = isGroup ? (data?.pushName || null) : null;

      const result = await processInboundMessage({
        isGroup,
        wasAudio,
        evolutionInstance: instanceName,
        remoteJid,
        remoteJidAlt,
        displayName,
        senderJid,
        senderName,
        text: text.trim(),
        evolutionMessageId,
      });
      return Response.json({ ok: true, ...result });
    }

    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const qr = payload?.data?.qrcode?.base64 || payload?.qrcode?.base64 || null;
      if (instanceName) {
        await supabaseAdmin
          .from('whatsapp_instances')
          .update({ qr_code: qr, status: 'qr', last_event_at: new Date().toISOString() })
          .eq('evolution_instance', instanceName);
      }
      return Response.json({ ok: true });
    }

    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state: string = payload?.data?.state || payload?.state || '';
      const phone: string | null = payload?.data?.wuid?.replace(/@.*/, '') || null;
      const statusMap: Record<string, string> = {
        open: 'connected',
        connecting: 'connecting',
        close: 'disconnected',
      };
      const mapped = statusMap[state] || 'failed';
      if (instanceName) {
        await supabaseAdmin
          .from('whatsapp_instances')
          .update({
            status: mapped,
            phone_number: phone,
            connected_at: mapped === 'connected' ? new Date().toISOString() : null,
            qr_code: mapped === 'connected' ? null : undefined,
            last_event_at: new Date().toISOString(),
          })
          .eq('evolution_instance', instanceName);
      }
      return Response.json({ ok: true });
    }

    // Evento não-tratado — ack pra Evolution não reenviar
    return Response.json({ ok: true, event });
  } catch (err: any) {
    console.error('[wa_webhook] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'internal' }, { status: 500 });
  }
}
