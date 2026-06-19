# WhatsApp Setup — Geometric Forms

Guia passo a passo pra deixar o Evolution API rodando no seu PC e plugado no painel admin.

**Tempo estimado:** 30-45min. Faça uma vez só.

---

## Visão geral do que vai rodar

```
[Lead WhatsApp] ─→ [Seu celular com WhatsApp]
                          ↑
                    QR code scan
                          ↓
[Evolution API local]  ─webhook→  [Vercel /api/whatsapp/webhook]
   (Docker no seu PC)                         ↓
        ↑                                [Gemini Flash]
        │                                     ↓
        └────  envio de respostas ─────  resposta humanizada
```

- **Evolution API** roda no seu PC dentro do Docker (porta 8080)
- **Cloudflare Tunnel** expõe essa porta com uma URL `https://*.trycloudflare.com` pública
- **Vercel** chama essa URL pra enviar mensagens. O Evolution chama o Vercel quando chega msg nova.

---

## Passo 1 — Instalar Docker Desktop

1. Baixa em: https://www.docker.com/products/docker-desktop/
2. Roda o instalador (Windows). Aceita os defaults.
3. Reinicia o PC se ele pedir.
4. Abre o Docker Desktop. Espera o ícone da baleia ficar verde no canto da tela.
5. Confirma no PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```
   Tem que retornar versões.

---

## Passo 2 — Configurar variáveis

No PowerShell, vai pra pasta do whatsapp do projeto:

```powershell
cd C:\Users\lucas\geometric-forms\whatsapp
```

Copia o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Abre o `.env` no VSCode (ou Notepad) e troca os valores TROCAR:

- `EVOLUTION_API_KEY` — gera uma string aleatória (qualquer 32+ chars). Pode usar este comando pra gerar uma:
  ```powershell
  [Guid]::NewGuid().ToString() + [Guid]::NewGuid().ToString()
  ```
- `POSTGRES_PASSWORD` — qualquer senha forte (ex: `MinhaS3nhaForte!2026`)
- `WEBHOOK_URL` — deixa como tá (`https://geometric-forms.vercel.app/api/whatsapp/webhook`)
- `EVOLUTION_PUBLIC_URL` — deixa `http://localhost:8080` por enquanto, vai trocar no passo 4

**Importante:** anota a `EVOLUTION_API_KEY` em algum lugar seguro — vai precisar dela depois pra colocar no Vercel.

---

## Passo 3 — Subir Evolution API

Ainda na pasta `whatsapp/`:

```powershell
docker compose up -d
```

Esse comando baixa as imagens (~500MB) e sobe 3 containers: Evolution, Postgres e Redis.

Confirma que tá rodando:

```powershell
docker compose ps
```

Tem que mostrar 3 services como `running` ou `healthy`.

Testa que API tá respondendo:

```powershell
curl http://localhost:8080
```

Tem que retornar um JSON tipo `{"status":200,"message":"Welcome to the Evolution API..."}`.

**Pra ver logs em tempo real:**
```powershell
docker compose logs -f evolution
```
(Ctrl+C pra sair, não para o container.)

**Pra parar tudo:**
```powershell
docker compose down
```

**Pra parar e apagar dados:**
```powershell
docker compose down -v
```

---

## Passo 4 — Cloudflare Tunnel (expor pra internet)

Sem isso, o Vercel não consegue conversar com seu PC.

### 4a. Instalar `cloudflared`

No PowerShell como administrador:

```powershell
winget install --id Cloudflare.cloudflared
```

Se der erro, baixa o instalador direto: https://github.com/cloudflare/cloudflared/releases/latest

Confirma:
```powershell
cloudflared --version
```

### 4b. Subir o tunnel

Em um PowerShell **deixado aberto** (esse precisa ficar rodando):

```powershell
cloudflared tunnel --url http://localhost:8080
```

Vai imprimir algo como:
```
2026-05-23T15:30:01Z INF +--------------------------------------------------------------------------------------------+
2026-05-23T15:30:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
2026-05-23T15:30:01Z INF |  https://abc-random-words-xyz.trycloudflare.com                                            |
2026-05-23T15:30:01Z INF +--------------------------------------------------------------------------------------------+
```

**Copia essa URL** (`https://abc-random-words-xyz.trycloudflare.com`). É temporária — toda vez que rodar o comando, gera uma nova.

> **Nota:** a Quick Tunnel é grátis sem cartão, mas a URL muda a cada restart. Quando o projeto estiver maduro, dá pra criar tunnel com domínio fixo (Cloudflare Tunnel proper, ainda grátis, mas precisa domínio).

Testa que tá funcionando:

```powershell
curl https://SUA-URL.trycloudflare.com
```

Deve retornar o mesmo JSON do passo 3.

---

## Passo 5 — Pegar API key do Gemini

1. Vai em https://aistudio.google.com/app/apikey
2. Login com sua conta Google (gmail mesmo)
3. Clica **"Create API key"** → **"Create API key in new project"**
4. Copia a key (formato `AIzaSy...`)

Tier free do Gemini Flash:
- 1.500 requests/dia
- 1M tokens/minuto
- Suficiente pra ~100 leads conversando por dia

---

## Passo 6 — Configurar variáveis no Vercel

Vai em https://vercel.com → seu projeto `geometric-forms` → **Settings → Environment Variables**.

Adiciona 3 variáveis (todas em **Production**):

| Nome | Valor |
|---|---|
| `EVOLUTION_API_URL` | URL do passo 4b (ex: `https://abc-xyz.trycloudflare.com`) |
| `EVOLUTION_API_KEY` | A key que você gerou no passo 2 |
| `GEMINI_API_KEY` | A key do passo 5 |

Salva. Próximo deploy vai pegar essas variáveis.

---

## Passo 7 — Avisa o Claude que terminou

Quando esses 6 passos estiverem concluídos, me avisa pra eu codar:
- Migration do Supabase (tabelas wa_*)
- Backend de integração com Evolution + Gemini
- UI no /admin/whatsapp

---

## Troubleshooting

### "docker compose up" falha com porta 8080 em uso
Algo já tá usando essa porta. Pra ver o que:
```powershell
netstat -ano | findstr :8080
```
Ou muda a porta no `docker-compose.yml` (`'8080:8080'` → `'9090:8080'`) e ajusta `EVOLUTION_PUBLIC_URL` pra `http://localhost:9090`.

### "cloudflared" não é reconhecido
Reabre o PowerShell depois de instalar pra o PATH atualizar.

### Cloudflare Tunnel cai sozinho
A Quick Tunnel é grátis mas instável. Pra produção, crie tunnel nomeado:
```powershell
cloudflared tunnel login
cloudflared tunnel create geometric-wa
cloudflared tunnel route dns geometric-wa wa.seudominio.com
cloudflared tunnel run geometric-wa
```
Precisa domínio configurado no Cloudflare (grátis).

### Evolution API não conecta no WhatsApp (QR não aparece)
- Confirma que `AUTHENTICATION_API_KEY` no `.env` bate com a que tá no Vercel
- Verifica logs: `docker compose logs evolution`
- Reinicia o container: `docker compose restart evolution`

### Webhook não chega no Vercel
- Confirma `WEBHOOK_URL` aponta pra prod (`geometric-forms.vercel.app`), não localhost
- Testa manualmente: `curl https://geometric-forms.vercel.app/api/whatsapp/webhook -X POST -d '{}'` deve voltar 200/401 (não 404)

---

## Custos

**Tudo nesse setup é R$ 0,00:**
- Docker Desktop: grátis pra uso pessoal
- Evolution API: open source
- Cloudflare Tunnel: grátis (Quick Tunnel)
- Gemini Flash: free tier (1500 req/dia)
- Postgres/Redis no Docker: rodam local, grátis

**Limitações desse setup grátis:**
- PC precisa estar ligado pra WhatsApp funcionar
- URL do tunnel muda quando restart (vai precisar atualizar no Vercel)
- Tier Gemini free tem rate limit (suficiente pra MVP)
- Risco baixo-médio de banimento do número WhatsApp (uso não-oficial)

**Pra escalar depois:**
- VPS Hetzner CX11: $4/mês → roda Docker 24/7 sem mexer no PC
- Cloudflare Tunnel nomeado: grátis se tiver domínio
- Gemini pago: ~$0,10 por 1000 mensagens (depois do free tier)
