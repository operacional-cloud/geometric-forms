# Deploy — Geometric Forms

Arquitetura final:

```
Vercel (Next.js: frontend + API routes)  ←→  Supabase
```

Tudo num projeto só. Sem servidor extra, sem CORS.

## Passo 1 — Subir código no GitHub

Já feito. Repo: https://github.com/operacional-cloud/geometric-forms

## Passo 2 — Deploy no Vercel

1. Entre em https://vercel.com/new
2. Logue com o **mesmo GitHub** (`operacional-cloud`)
3. Importe o repo `geometric-forms`
4. Em **Configure Project**:
   - **Root Directory**: clique em "Edit" e escolha **`web`** (obrigatório — o Next.js fica nessa subpasta)
   - **Framework Preset**: detecta Next.js automaticamente
   - **Build Command / Output**: deixa default
5. Em **Environment Variables**, cole:

```
NEXT_PUBLIC_SUPABASE_URL=https://cslyxnpxlytzqjurhdmd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BptIxGEzYo_3JdhVP_G8tg_h60wKbkf
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbHl4bnB4bHl0enFqdXJoZG1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA2NzU1MCwiZXhwIjoyMDk0NjQzNTUwfQ.riK-cYBZGXHqLWqlO56XRkXWXksm97dRGSOUDdHT5p0
```

> O service_role key fica **server-side only** (nunca exposto ao browser) — é usado dentro das route handlers e server components.

6. Clica **Deploy**. ~2-3 min de build.
7. Vercel gera URL `https://geometric-forms-web-xxxx.vercel.app`

## Passo 3 — Testar

Abre em qualquer computador/celular:

- **Sistema:** sua URL Vercel
- **Login Admin:** `admin@admin.com` / `123456`
- **Login Cliente:** `carlos@pillar.com` / `SenhaForte123!`
- **Form público:** `<sua-url>/f/pillar-consorcios/qualificacao-consorcio`

## Atualizar código

Qualquer `git push origin master` redeploya automaticamente no Vercel (~1-2 min).

## Custom domain

Vercel → seu projeto → **Settings → Domains → Add**. Aponta o DNS conforme instruções (ex: `forms.geometricagency.com`).

## Logs

Vercel → seu projeto → **Logs** mostra requests + erros das route handlers em tempo real.
