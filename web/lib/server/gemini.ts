/**
 * Cliente Gemini (Google AI Studio) pra qualificação de leads.
 *
 * Modelo: gemini-1.5-flash (free tier: 1500 req/dia, 1M tokens/min)
 * Docs:   https://ai.google.dev/api/generate-content
 *
 * O engine recebe:
 *   - System prompt (personalidade + critérios)
 *   - Histórico da conversa (turn-by-turn)
 *   - Última mensagem do lead
 * E retorna:
 *   - Texto da resposta humanizada
 *   - Decisão de qualificação (qualified | rejected | continue)
 *   - Resumo opcional (quando qualifica)
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
// gemini-1.5-flash foi descontinuado pra novas keys. Usando 2.5 flash que tá
// no tier gratuito atual (https://ai.google.dev/gemini-api/docs/rate-limits).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function assertConfigured() {
  if (!GEMINI_KEY) throw new Error('Gemini não configurado — defina GEMINI_API_KEY.');
}

export type ChatTurn = {
  role: 'user' | 'model';
  text: string;
};

/**
 * Sintetiza um texto em áudio via Gemini 2.5 Flash TTS (free tier).
 * Retorna áudio WAV base64 (24kHz, 16-bit PCM mono) pronto pra mandar ao Evolution.
 *
 * Custo: free tier dá 1500 requests/dia, suficiente pra MVP.
 * Em caso de falha, retorna null e o caller cai pro fallback (envia texto).
 */
export async function synthesizeSpeech(text: string, opts: { voice?: string; style?: string } = {}): Promise<{ base64: string; mimetype: string } | null> {
  assertConfigured();
  // Vozes pré-construídas (Gemini 2.5 TTS) que rendem PT-BR mais natural:
  //   Achird=friendly/amigável (boa pra brasileiro descontraído)
  //   Sulafat=warm/calorosa, Vindemiatrix=gentle, Algieba=smooth, Aoede=breezy
  // Achird é a que melhor entrega sotaque brasileiro natural.
  const voice = opts.voice || 'Achird';
  const clean = text.trim().slice(0, 2000);
  if (!clean) return null;

  // Style instruction reforça sotaque BR natural + tom humano. Gemini TTS é
  // sensível a instruções explícitas — quanto mais específica, melhor.
  const styleInstruction = opts.style
    || 'Fale em português brasileiro com sotaque natural do Brasil, tom caloroso, descontraído e completamente humano, '
       + 'como um amigo conversando casualmente no WhatsApp. Use entonação variada, pausas naturais entre frases, '
       + 'e ritmo de fala espontâneo (nem rápido demais nem lento). NÃO soe robótico nem formal. '
       + 'Pronuncie as palavras como um brasileiro nato pronunciaria. Fale o seguinte texto: ';
  const promptedText = `${styleInstruction}${clean}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptedText }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log(JSON.stringify({ level: 'warn', msg: 'gemini_tts_failed', status: res.status, err: errText.slice(0, 200) }));
      return null;
    }
    const data: any = await res.json();
    const pcmB64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!pcmB64) {
      console.log(JSON.stringify({ level: 'warn', msg: 'gemini_tts_no_audio', data_keys: Object.keys(data || {}) }));
      return null;
    }
    // Resposta vem como PCM raw (audio/L16;rate=24000). Empacota num WAV pra Evolution converter.
    const wav = wrapPcmInWav(Buffer.from(pcmB64, 'base64'), 24000, 1, 16);
    return { base64: wav.toString('base64'), mimetype: 'audio/wav' };
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'gemini_tts_exception', err: err?.message }));
    return null;
  }
}

/** Empacota PCM raw num container WAV mínimo (44 bytes de header). */
function wrapPcmInWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);          // fmt chunk size
  buf.writeUInt16LE(1, 20);           // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

/**
 * Transcreve um áudio (base64) pra texto usando Gemini multimodal.
 * Funciona com qualquer áudio que o WhatsApp produz (ogg/opus, mp4, etc).
 *
 * Retorna a string transcrita em PT-BR. Em caso de falha, retorna null pra
 * o caller decidir o fallback (ex: pedir pro lead escrever).
 */
export async function transcribeAudio(input: {
  base64: string;
  mimetype?: string;
}): Promise<string | null> {
  assertConfigured();
  const mime = (input.mimetype || 'audio/ogg').split(';')[0].trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text:
                'Transcreva este áudio fielmente em português do Brasil. '
                + 'Responda apenas o texto transcrito, sem prefixos, aspas ou comentários. '
                + 'Se o áudio estiver inaudível ou vazio, responda exatamente: [audio_inaudivel]',
            },
            { inlineData: { mimeType: mime, data: input.base64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log(JSON.stringify({ level: 'warn', msg: 'gemini_transcribe_failed', status: res.status, err: errText.slice(0, 200) }));
      return null;
    }
    const data: any = await res.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const text = raw.trim();
    if (!text || text === '[audio_inaudivel]') return null;
    return text;
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'gemini_transcribe_exception', err: err?.message }));
    return null;
  }
}

export type QualifierDecision = 'continue' | 'qualified' | 'rejected';

export type QualifierResponse = {
  reply: string;                          // texto humanizado pra enviar ao lead
  decision: QualifierDecision;            // continue = segue conversando, qualified = transferir, rejected = encerrar
  summary?: string;                       // preenchido quando decision != continue
};

/**
 * Parser robusto da resposta JSON do Gemini.
 * Lida com: markdown fences (```json...```), JSON truncado, texto extra antes/depois.
 * NUNCA retorna o raw com `{"reply":` literal — se não conseguir extrair o reply,
 * cai num fallback humanizado.
 */
function parseQualifierJson(raw: string): { reply: string; decision: QualifierDecision; summary?: string } {
  const fallback = 'Pode me explicar melhor? Não peguei direito.';
  if (!raw || !raw.trim()) {
    return { reply: fallback, decision: 'continue' };
  }
  // 1. Strip markdown fences (```json ... ```)
  let cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  // 2. Se começa com { mas não fecha, tenta apenas extrair o "reply" via regex
  try {
    const parsed = JSON.parse(cleaned);
    const reply = String(parsed.reply || '').trim();
    if (!reply) return { reply: fallback, decision: 'continue' };
    const decision: QualifierDecision =
      parsed.decision === 'qualified' || parsed.decision === 'rejected' ? parsed.decision : 'continue';
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined;
    return { reply, decision, summary };
  } catch {
    // 3. Tenta extrair "reply": "..." via regex (cobre JSON truncado)
    const m = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      const reply = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      if (reply) {
        const decM = cleaned.match(/"decision"\s*:\s*"(qualified|rejected|continue)"/);
        const sumM = cleaned.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return {
          reply,
          decision: (decM?.[1] as QualifierDecision) || 'continue',
          summary: sumM ? sumM[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() : undefined,
        };
      }
    }
    // 4. Último recurso: se o raw parece texto puro (não JSON), usa como reply
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      return { reply: cleaned, decision: 'continue' };
    }
    // 5. JSON malformado sem conteúdo aproveitável → fallback humanizado
    console.log(JSON.stringify({ level: 'warn', msg: 'gemini_parse_failed', raw_prefix: raw.slice(0, 200) }));
    return { reply: fallback, decision: 'continue' };
  }
}

/**
 * Roda 1 turno da IA qualificadora.
 *
 * @param systemPrompt    Personalidade da IA (definido pelo admin)
 * @param qualificationCriteria  Critérios pra qualificar
 * @param history         Conversa até agora (sem a mensagem nova)
 * @param userMessage     Última mensagem do lead
 */
export async function runQualifier({
  systemPrompt,
  qualificationCriteria,
  history,
  userMessage,
}: {
  systemPrompt: string;
  qualificationCriteria: string;
  history: ChatTurn[];
  userMessage: string;
}): Promise<QualifierResponse> {
  assertConfigured();

  // Constrói instrução do sistema que força a IA a responder em JSON estruturado.
  // Gemini não tem "system role" nativo, então prefixamos como instrução.
  const system = [
    systemPrompt.trim() || 'Você é um assistente humanizado de qualificação de leads via WhatsApp.',
    '',
    '---',
    'CRITÉRIOS DE QUALIFICAÇÃO:',
    qualificationCriteria.trim() || 'O lead é qualificado quando demonstra interesse claro no produto/serviço.',
    '',
    '---',
    'INSTRUÇÕES IMPORTANTES:',
    '- Escreva como uma pessoa real conversando no WhatsApp: frases curtas, naturais, sem exagero de emojis.',
    '- NÃO se identifique como IA ou bot. Você é parte da equipe.',
    '- Faça UMA pergunta de qualificação por vez.',
    '- Se o lead mostrar desinteresse claro ou rejeitar, encerre educadamente (decision="rejected").',
    '- Se o lead atender aos critérios acima, marque como qualificado (decision="qualified") e escreva uma resposta de transição avisando que alguém vai entrar em contato.',
    '- Senão, continue conversando (decision="continue").',
    '',
    'RESPONDA SEMPRE EM JSON VÁLIDO no formato:',
    '{"reply": "<mensagem humanizada pro lead>", "decision": "continue|qualified|rejected", "summary": "<resumo curto da conversa, opcional>"}',
    '',
    'NÃO inclua nada fora do JSON. Sem markdown, sem ```json```, só o objeto.',
  ].join('\n');

  // Monta histórico no formato do Gemini
  const contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = [];

  // Primeira turn = system prompt (truque do Gemini)
  contents.push({ role: 'user', parts: [{ text: system }] });
  contents.push({ role: 'model', parts: [{ text: 'Entendido. Vou responder em JSON conforme instruído.' }] });

  // Histórico real
  for (const turn of history) {
    contents.push({ role: turn.role, parts: [{ text: turn.text }] });
  }

  // Última mensagem do lead
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
      safetySettings: [
        // Permissivo pra conversas de vendas BR — sem bloquear palavras comuns
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseQualifierJson(raw);
}

/**
 * Gera uma mensagem de RETOMADA de conversa existente.
 * Usado quando o operador clica "Qualificar" em um lead que já tem histórico.
 * A IA analisa o histórico e escreve uma mensagem natural de continuidade.
 */
export async function runResume({
  systemPrompt,
  qualificationCriteria,
  history,
}: {
  systemPrompt: string;
  qualificationCriteria: string;
  history: ChatTurn[];
}): Promise<{ reply: string }> {
  assertConfigured();

  const system = [
    systemPrompt.trim() || 'Você é um assistente humanizado de qualificação de leads via WhatsApp.',
    '',
    '---',
    'CRITÉRIOS DE QUALIFICAÇÃO:',
    qualificationCriteria.trim() || 'O lead é qualificado quando demonstra interesse claro no produto/serviço.',
    '',
    '---',
    'INSTRUÇÃO ESPECIAL: Você está RETOMANDO uma conversa antiga com este lead.',
    'Olhe o histórico abaixo e escreva UMA mensagem natural de retomada:',
    '- Reconheça que ficou um tempo sem falar (se passou bastante tempo)',
    '- Não recomece do zero — faça referência sutil ao que já foi conversado',
    '- Faça UMA pergunta nova que avance pra qualificação, considerando onde a conversa parou',
    '- Escreva como pessoa real: frases curtas, sem exagero de emojis',
    '- NÃO se identifique como IA',
    '',
    'RESPONDA SEMPRE EM JSON VÁLIDO:',
    '{"reply": "<mensagem humanizada pro lead>"}',
    '',
    'NÃO inclua nada fora do JSON. Sem markdown, sem ```json```.',
  ].join('\n');

  const contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = [];
  contents.push({ role: 'user', parts: [{ text: system }] });
  contents.push({ role: 'model', parts: [{ text: 'Entendido. Vou gerar a mensagem de retomada em JSON.' }] });

  // Adiciona histórico real
  for (const turn of history) {
    contents.push({ role: turn.role, parts: [{ text: turn.text }] });
  }

  // Mensagem "trigger" do sistema pedindo a retomada
  contents.push({ role: 'user', parts: [{ text: '[Sistema: gere agora a mensagem de retomada conforme instruído.]' }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}`);
  }
  const data: any = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = parseQualifierJson(raw);
  return { reply: parsed.reply || 'Oi, tudo bem? Posso continuar nosso papo?' };
}
