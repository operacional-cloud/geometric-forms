# Deploy — Geometric Forms

Arquitetura de produção:

```
Vercel (Next.js front)  ←→  Railway (Express back)  ←→  Supabase
```

## Pré-requisitos

- Conta no [GitHub](https://github.com) (você já tem login Google? Loga com ele)
- Conta no [Vercel](https://vercel.com) (loga com GitHub)
- Conta no [Railway](https://railway.app) (loga com GitHub)
- Código commitado num repo (público OU privado, ambos funcionam)

Todos free.

## Passo 1 — Subir o código no GitHub

```bash
cd C:\Users\lucas\geometric-forms

git add .
git commit -m "Initial commit"
git branch -M main

# Criar repo em https://github.com/new (ex: "geometric-forms"), copiar o URL,
# então:
git remote add origin https://github.com/SEU-USUARIO/geometric-forms.git
git push -u origin main
```

## Passo 2 — Deploy do BACKEND (Railway)

1. Entre em https://railway.com/new
2. Clique em **Deploy from GitHub repo** → autorize → escolha o repo `geometric-forms`
3. Quando perguntar o **Root directory**, deixe **vazio** (raiz do repo). Railway vai detectar o Node automaticamente.
4. Vá em **Settings → Variables** e cole as variáveis abaixo (uma por linha):

```
SUPABASE_URL=https://cslyxnpxlytzqjurhdmd.supabase.co
SUPABASE_ANON_KEY=sb_publishable_BptIxGEzYo_3JdhVP_G8tg_h60wKbkf
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbHl4bnB4bHl0enFqdXJoZG1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA2NzU1MCwiZXhwIjoyMDk0NjQzNTUwfQ.riK-cYBZGXHqLWqlO56XRkXWXksm97dRGSOUDdHT5p0
NODE_ENV=production
```

> **Importante:** `PORT` é fornecido pelo Railway automaticamente, **não setar manualmente**.

5. Em **Settings → Networking → Public Networking**, clique em **Generate Domain**. Vai gerar algo como `geometric-forms-production.up.railway.app`. **Copie esse URL** — vai usar no Vercel.
6. Aguarde o build (~2 min). Quando ficar verde, teste: `https://SEU-URL.up.railway.app/health` deve retornar `{"ok":true}`.

## Passo 3 — Deploy do FRONTEND (Vercel)

1. Entre em https://vercel.com/new
2. **Import Git Repository** → escolha `geometric-forms`
3. Em **Configure Project**:
   - **Root Directory**: clique em "Edit" e escolha `web` (importante!)
   - **Framework Preset**: deve detectar Next.js automaticamente
4. Em **Environment Variables**, cole:

```
NEXT_PUBLIC_SUPABASE_URL=https://cslyxnpxlytzqjurhdmd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BptIxGEzYo_3JdhVP_G8tg_h60wKbkf
NEXT_PUBLIC_API_BASE_URL=https://SEU-URL.up.railway.app
```

> Substitua `SEU-URL.up.railway.app` pelo URL que o Railway gerou no Passo 2.5.

5. Clique em **Deploy**. ~2 min.
6. Vai gerar um URL tipo `https://geometric-forms-web.vercel.app`. **É o seu sistema online.**

## Passo 4 — Testar

Abre em outro computador (ou celular, etc):

- **Sistema:** `https://geometric-forms-web.vercel.app`
- **Login Admin:** `admin@admin.com` / `123456`
- **Form público:** `https://geometric-forms-web.vercel.app/f/pillar-consorcios/qualificacao-consorcio`

## Manutenção

- **Atualizar código** — qualquer `git push origin main` redeploya os 2 automaticamente
- **Logs do backend** — Railway dashboard → projeto → Deployments → View Logs
- **Logs do frontend** — Vercel dashboard → projeto → Deployments → View Function Logs
- **Custom domain** — Vercel/Railway permitem adicionar `forms.geometricagency.com` etc. nas configurações do projeto, dão DNS pra apontar.

## Trocar de senha do admin / regenerar tokens

Se quiser regenerar credenciais (recomendado pra prod):
1. Supabase Dashboard → Settings → API → **Rotate** service_role
2. Atualize `SUPABASE_SERVICE_ROLE_KEY` no Railway → ele redeploya sozinho
3. Trocar senha do admin: Supabase Dashboard → Authentication → Users → `admin@admin.com` → ⋯ → Send password recovery (ou setar nova senha direto)
