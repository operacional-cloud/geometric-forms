'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Botão "Importar formulário" — lê um JSON de template (exportado de outro
 * cliente) e cria o formulário no cliente em foco. Fica no cabeçalho da página
 * de Formulários, então aparece mesmo quando o cliente ainda não tem nenhum.
 */
export function ImportFormButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reimportar o mesmo arquivo
    if (!file) return;
    setImporting(true);
    try {
      const tpl = JSON.parse(await file.text());
      const res = await apiFetch<{ data: { form: { title: string } } }>('/api/forms/import', {
        method: 'POST',
        body: tpl,
      });
      alert(`Formulário "${res.data.form.title}" importado neste cliente.`);
      window.location.reload();
    } catch (err: any) {
      alert(`Falha ao importar: ${err?.message || 'arquivo JSON inválido'}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="btn btn-ghost !py-2 disabled:opacity-50"
        title="Importar um formulário exportado (JSON) neste cliente"
      >
        {importing ? 'Importando…' : '⬆ Importar'}
      </button>
    </>
  );
}
