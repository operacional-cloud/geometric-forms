// Helpers pra extrair contato dos answers de um lead.

export type FieldLite = { id: string; type: string; label: string };

/**
 * Encontra o telefone do lead. Tenta:
 *   1. Campo do tipo "phone" no schema do form
 *   2. Campo com id "telefone" ou "phone"
 *   3. Qualquer valor que pareça telefone via regex
 */
export function getLeadPhone(answers: Record<string, any>, fields: FieldLite[] = []): string | null {
  const phoneField = fields.find((f) => f.type === 'phone')
    || fields.find((f) => /^(telefone|phone|whatsapp|celular)$/i.test(f.id));
  if (phoneField) {
    const v = answers?.[phoneField.id];
    if (typeof v === 'string' && v.trim()) return v;
  }
  for (const v of Object.values(answers || {})) {
    if (typeof v === 'string' && /^[+(]?[\d\s()-]{8,}$/.test(v)) return v;
  }
  return null;
}

export function getLeadName(answers: Record<string, any>, fields: FieldLite[] = []): string | null {
  const nameField = fields.find((f) => f.id === 'nome' || f.id === 'name')
    || fields.find((f) => /nome|name|full_name/i.test(f.id));
  if (nameField) {
    const v = answers?.[nameField.id];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export function getLeadEmail(answers: Record<string, any>, fields: FieldLite[] = []): string | null {
  const emailField = fields.find((f) => f.type === 'email');
  if (emailField) {
    const v = answers?.[emailField.id];
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  for (const v of Object.values(answers || {})) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  return null;
}

/**
 * Converte um telefone bruto (com hifens/espaços/parênteses) em formato wa.me.
 * Se não tem código de país, assume Brasil (+55).
 * Retorna null se não conseguir extrair.
 */
export function whatsappLink(phoneRaw: string | null, message?: string): string | null {
  if (!phoneRaw) return null;
  let digits = String(phoneRaw).replace(/\D/g, '');
  if (!digits) return null;
  // Se começar com 0 (DDD nacional sem 55), tira o 0
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Se tiver menos que 10 dígitos não é telefone BR válido
  if (digits.length < 10) return null;
  // Se não começa com 55 e tem 10-11 dígitos (DDD + número), prepend 55
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  const q = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${q}`;
}

/** Formatação visual de telefone BR. */
export function formatPhone(raw: string | null): string {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw;
}
