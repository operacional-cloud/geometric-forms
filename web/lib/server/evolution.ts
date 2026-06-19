/**
 * Cliente da Evolution API (WhatsApp).
 * Docs: https://doc.evolution-api.com/
 *
 * Cada `instance` é uma sessão WhatsApp (1 número conectado).
 * Operações principais:
 *   - createInstance(name)    → cria uma instância no servidor Evolution
 *   - connectInstance(name)   → retorna QR code base64 pra escanear
 *   - sendText(name, to, text) → envia mensagem de texto
 *   - logoutInstance(name)    → desconecta o número
 *   - deleteInstance(name)    → remove sessão
 */

const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL
  || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook` : '');

function assertConfigured() {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    throw new Error('Evolution API não configurada — defina EVOLUTION_API_URL e EVOLUTION_API_KEY.');
  }
}

async function evolutionFetch(path: string, init: RequestInit = {}): Promise<any> {
  assertConfigured();
  const url = `${EVOLUTION_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    // Cloudflare quick tunnel pode demorar
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `Evolution API ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data;
}

// =============================================================================
// Instance management
// =============================================================================

export type EvolutionInstanceState =
  | 'open'           // conectado
  | 'connecting'
  | 'close'          // desconectado
  | 'qrcode';

export async function createInstance(instanceName: string): Promise<{
  instance: { instanceName: string; instanceId?: string; status?: string };
  qrcode?: { base64?: string; code?: string };
}> {
  return evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      // Webhook por-instância (recebe eventos só dessa instance)
      webhook: WEBHOOK_URL ? {
        url: WEBHOOK_URL,
        byEvents: false,
        base64: false,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
        ],
      } : undefined,
    }),
  });
}

export async function connectInstance(instanceName: string): Promise<{
  base64?: string;
  code?: string;
  pairingCode?: string | null;
}> {
  return evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

export async function getInstanceState(instanceName: string): Promise<{
  instance: { instanceName: string; state: EvolutionInstanceState };
}> {
  return evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function logoutInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

export async function listInstances(): Promise<any[]> {
  const data = await evolutionFetch('/instance/fetchInstances');
  return Array.isArray(data) ? data : [];
}

// =============================================================================
// Number validation
// =============================================================================

/**
 * Consulta no WhatsApp se um número existe e retorna o JID real.
 * Necessário pra contornar a "lógica do 9": números BR podem estar registrados
 * sem o nono dígito (formato antigo) e o JID real diverge do número que digitamos.
 *
 * Ex: digitamos 5551996978439, mas o JID real no WhatsApp é 555196978439@s.whatsapp.net
 */
export async function checkWhatsAppNumber(
  instanceName: string,
  number: string,
): Promise<{ exists: boolean; jid: string | null; lid?: string | null; name?: string | null }> {
  const cleanNumber = number.replace(/\D/g, '');
  try {
    const result: Array<{ jid: string; exists: boolean; number: string; lid?: string; name?: string }> =
      await evolutionFetch(`/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: JSON.stringify({ numbers: [cleanNumber] }),
      });
    const hit = Array.isArray(result) ? result[0] : null;
    if (!hit || !hit.exists) return { exists: false, jid: null };
    return { exists: true, jid: hit.jid, lid: hit.lid, name: hit.name };
  } catch (err: any) {
    // Em caso de erro de rede / 5xx, NÃO marca como inexistente — só retorna null jid
    // pra deixar o caller decidir (provavelmente tentar enviar mesmo assim).
    console.log(JSON.stringify({ level: 'warn', msg: 'wa_number_check_failed', err: err?.message, number: cleanNumber }));
    return { exists: false, jid: null };
  }
}

// =============================================================================
// Messaging
// =============================================================================

/**
 * Envia uma mensagem de texto.
 * @param to Número OU JID. Sempre preserva JID se vier com @ (evita conversões erradas tipo "9 a mais").
 *
 * Tipos de JID que o WhatsApp usa hoje:
 *   - 5511999@s.whatsapp.net  → número público convencional
 *   - 27569562@lid            → Linked Identity (privacidade)
 *
 * Pra número BR puro (sem @), o JID pode divergir do número (formato antigo sem "9").
 * Prefere passar o JID já resolvido via checkWhatsAppNumber pra não errar destinatário.
 */
export async function sendText(
  instanceName: string,
  to: string,
  text: string,
): Promise<{ key: { id: string }; message: any }> {
  const trimmed = to.trim();
  // Se já vier como JID (qualquer sufixo @...), preserva — Evolution sabe rotear.
  const number = trimmed.includes('@') ? trimmed : trimmed.replace(/\D/g, '');
  return evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      text,
      // Sem delay grande: evita o WhatsApp agrupar mensagens como "reply".
      // 200ms é o suficiente pra parecer humano sem disparar o agrupamento.
      delay: 200,
    }),
  });
}


/**
 * Dispara uma "fake call" no WhatsApp do destinatário. Aparece como chamada
 * perdida no celular dele por alguns segundos. Não é conversa de voz real —
 * é só uma notificação que toca o ringtone e fica como "chamada perdida".
 *
 * Útil pra chamar atenção/urgência. Evolution endpoint: /call/offer/{instance}
 */
async function fakeCallOnce(instanceName: string, number: string, callDuration: number, isVideo: boolean): Promise<{ ok: boolean; data?: any; err?: string }> {
  try {
    const data = await evolutionFetch(`/call/offer/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({ number, isVideo, callDuration }),
    });
    return { ok: true, data };
  } catch (err: any) {
    try {
      const data = await evolutionFetch(`/call/fake/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: JSON.stringify({ number }),
      });
      return { ok: true, data };
    } catch (err2: any) {
      return { ok: false, err: `${err?.message || ''} | ${err2?.message || ''}` };
    }
  }
}

/**
 * Faz um BURST de fake calls (3 tentativas com 1.5s entre cada).
 * WhatsApp filtra fake calls de third-party às vezes — em burst, aumenta chance de uma passar.
 */
export async function fakeCall(
  instanceName: string,
  to: string,
  opts: { isVideo?: boolean; callDurationSec?: number; attempts?: number } = {},
): Promise<{ ok: boolean; attempts: number; successes: number; data?: any }> {
  const trimmed = to.trim();
  const number = trimmed.includes('@') ? trimmed : trimmed.replace(/\D/g, '');
  const duration = Math.min(Math.max(opts.callDurationSec ?? 5, 1), 30);
  const isVideo = !!opts.isVideo;
  const attempts = Math.max(1, Math.min(opts.attempts ?? 3, 5));

  let successes = 0;
  let lastData: any = null;
  for (let i = 0; i < attempts; i++) {
    const r = await fakeCallOnce(instanceName, number, duration, isVideo);
    if (r.ok) {
      successes++;
      lastData = r.data;
    } else {
      console.log(JSON.stringify({
        level: 'warn', msg: 'wa_fake_call_attempt_failed', attempt: i + 1, err: r.err,
      }));
    }
    // Delay 1.5s entre tentativas
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: successes > 0, attempts, successes, data: lastData };
}

/**
 * Envia uma mensagem de áudio (voice note / PTT).
 * @param audio Base64 de WAV/MP3/OGG. Evolution converte pra OGG/Opus interno se necessário.
 */
export async function sendAudio(
  instanceName: string,
  to: string,
  audioBase64: string,
): Promise<{ key: { id: string } }> {
  const trimmed = to.trim();
  const number = trimmed.includes('@') ? trimmed : trimmed.replace(/\D/g, '');
  return evolutionFetch(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      audio: audioBase64,
      delay: 200,
      encoding: true,
    }),
  });
}

/**
 * Busca informações de um grupo no WhatsApp (subject/nome, participantes, foto, etc).
 * Endpoint Evolution: GET /group/findGroupInfos/{instance}?groupJid=...
 */
export async function getGroupInfo(
  instanceName: string,
  groupJid: string,
): Promise<{ subject?: string; size?: number; pictureUrl?: string } | null> {
  try {
    const data: any = await evolutionFetch(
      `/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
    );
    return {
      subject: data?.subject || data?.name || undefined,
      size: data?.size || data?.participants?.length || undefined,
      pictureUrl: data?.pictureUrl || undefined,
    };
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'wa_group_info_failed', err: err?.message, groupJid }));
    return null;
  }
}

// =============================================================================
// Media
// =============================================================================

/**
 * Baixa o conteúdo binário (áudio/imagem/vídeo) de uma mensagem em base64.
 * Usado pra transcrever áudios recebidos.
 *
 * Evolution endpoint: POST /chat/getBase64FromMediaMessage/{instance}
 * Body aceita tanto a key direta quanto a mensagem inteira; mandamos o objeto completo
 * pra cobrir diferenças entre versões do Evolution.
 */
export async function getMediaBase64(
  instanceName: string,
  message: { key: any; message?: any },
): Promise<{ base64: string; mimetype?: string } | null> {
  try {
    const data: any = await evolutionFetch(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        body: JSON.stringify({ message, convertToMp4: false }),
      },
    );
    const base64 = data?.base64 || data?.media || data?.buffer || null;
    if (!base64) return null;
    return { base64, mimetype: data?.mimetype || data?.mediaType || undefined };
  } catch (err: any) {
    console.log(JSON.stringify({
      level: 'warn', msg: 'wa_media_download_failed', err: err?.message, instance: instanceName,
    }));
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extrai número limpo (só dígitos, com 55) a partir de um JID do WhatsApp.
 * Ex: "5511999999999@s.whatsapp.net" → "5511999999999"
 */
export function jidToNumber(jid: string): string {
  return jid.replace(/@.*$/, '').replace(/\D/g, '');
}

/**
 * Gera nome técnico de instância a partir do nome humano (slug + sufixo).
 */
export function makeInstanceName(humanName: string, suffix?: string): string {
  const slug = humanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return suffix ? `${slug}-${suffix}` : slug;
}
