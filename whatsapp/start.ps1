# ============================================================================
# Geometric WhatsApp Startup
#
# Modos:
#   .\start.ps1            → Sobe Docker + Cloudflare Tunnel + atualiza Vercel
#   .\start.ps1 -Install   → Registra no Task Scheduler (roda no boot)
#   .\start.ps1 -Uninstall → Remove do Task Scheduler
#   .\start.ps1 -Status    → Mostra estado atual sem alterar nada
# ============================================================================

param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$LogFile = "$env:TEMP\geometric-whatsapp.log"
$CloudflaredLog = "$env:TEMP\cloudflared-geometric.log"
$VercelProjectId = "prj_78llVt8182iH2T1cTOFrI5LjFNSH"
$TaskName = "Geometric WhatsApp Startup"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Log {
    param([string]$Message, [string]$Color = 'White')
    $stamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$stamp] $Message" -ForegroundColor $Color
    Add-Content -Path $LogFile -Value "[$stamp] $Message" -ErrorAction SilentlyContinue
}

function Load-DotEnv {
    $envFile = "$ScriptDir\.env"
    if (-not (Test-Path $envFile)) {
        Write-Log "ERRO: .env não encontrado em $envFile" 'Red'
        Write-Log "Crie copiando de .env.example e preenchendo VERCEL_TOKEN, EVOLUTION_API_KEY, POSTGRES_PASSWORD." 'Red'
        exit 1
    }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*#') { return }
        if ($_ -match '^\s*([^=\s]+)\s*=\s*(.+?)\s*$') {
            Set-Item "Env:$($Matches[1])" $Matches[2].Trim("'`"")
        }
    }
}

function Get-CloudflareUrlFromLog {
    if (-not (Test-Path $CloudflaredLog)) { return $null }
    $content = Get-Content $CloudflaredLog -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $null }
    $match = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { return $match.Value }
    return $null
}

# Testa se Docker daemon esta pronto SEM disparar NativeCommandError.
# Usa Start-Process com redirect pra arquivos SEPARADOS (PS 5.1 nao permite mesmo arquivo).
function Test-DockerReady {
    $tmpOut = "$env:TEMP\docker-info-out.log"
    $tmpErr = "$env:TEMP\docker-info-err.log"
    Remove-Item $tmpOut, $tmpErr -ErrorAction SilentlyContinue
    try {
        $proc = Start-Process -FilePath 'docker' `
            -ArgumentList 'info' `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $tmpOut `
            -RedirectStandardError $tmpErr `
            -ErrorAction Stop
        return ($proc.ExitCode -eq 0)
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------------------
# Install / Uninstall (Task Scheduler)
# ---------------------------------------------------------------------------

if ($Install) {
    Write-Log "Registrando tarefa no Task Scheduler..." 'Cyan'
    $action = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptDir\start.ps1`""
    $trigger = New-ScheduledTaskTrigger -AtLogon
    # LeastPrivilege (default) — sem precisar de admin pra rodar Docker + cloudflared + HTTP
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0)
    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Principal $principal `
            -Settings $settings `
            -Description 'Sobe Docker + Cloudflare Tunnel + atualiza Vercel automaticamente' `
            -Force `
            -ErrorAction Stop | Out-Null
    } catch {
        Write-Log "ERRO ao registrar tarefa: $_" 'Red'
        Write-Log "Tenta abrir PowerShell como Administrador e rodar de novo:" 'Yellow'
        Write-Log "  cd $ScriptDir" 'Yellow'
        Write-Log "  .\start.ps1 -Install" 'Yellow'
        exit 1
    }
    Write-Log "OK. Vai rodar automaticamente quando voce fizer login no Windows." 'Green'
    Write-Log "Pra rodar agora sem reiniciar: Start-ScheduledTask -TaskName '$TaskName'" 'Yellow'
    exit 0
}

if ($Uninstall) {
    Write-Log "Removendo tarefa do Task Scheduler..." 'Cyan'
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Log "OK." 'Green'
    exit 0
}

if ($Status) {
    Write-Log "=== Status ===" 'Cyan'
    # Docker
    try {
        $containers = & docker compose -f "$ScriptDir\docker-compose.yml" ps --format json 2>$null | ConvertFrom-Json
        foreach ($c in $containers) {
            Write-Log "  Docker $($c.Service): $($c.State)" 'White'
        }
    } catch {
        Write-Log "  Docker: nao acessivel" 'Yellow'
    }
    # Tunnel
    $url = Get-CloudflareUrlFromLog
    Write-Log "  Tunnel URL: $(if ($url) { $url } else { 'OFFLINE' })" $(if ($url) { 'Green' } else { 'Yellow' })
    # Task
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Log "  Task Scheduler: $(if ($task) { 'registrado' } else { 'nao registrado' })" 'White'
    exit 0
}

# ---------------------------------------------------------------------------
# Startup (default mode)
# ---------------------------------------------------------------------------

Write-Log "=== Geometric WhatsApp Startup ===" 'Cyan'
Load-DotEnv

if (-not $env:VERCEL_TOKEN) {
    Write-Log "ERRO: VERCEL_TOKEN nao definido no .env" 'Red'
    exit 1
}

# 1. Aguarda Docker Desktop estar pronto (caso esteja iniciando).
#    Em boot, o Docker Desktop pode levar 2-3min pra ficar healthy.
Write-Log "Verificando Docker (pode demorar ate 3min no boot)..." 'White'

# Tenta iniciar Docker Desktop se estiver instalado mas processo nao rodando
$dockerProc = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue
if (-not $dockerProc) {
    $dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Write-Log "  Iniciando Docker Desktop..." 'Yellow'
        Start-Process -FilePath $dockerExe -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
}

$dockerReady = $false
$dockerTimeout = 180
$start = Get-Date
while (-not $dockerReady -and ((Get-Date) - $start).TotalSeconds -lt $dockerTimeout) {
    if (Test-DockerReady) { $dockerReady = $true; break }
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    if ($elapsed -gt 0 -and $elapsed % 30 -eq 0) {
        Write-Log "  Ainda esperando Docker... ($elapsed s)" 'DarkGray'
    }
    Start-Sleep -Seconds 4
}
if (-not $dockerReady) {
    Write-Log "ERRO: Docker Desktop nao subiu em $dockerTimeout s. Abre o app manualmente." 'Red'
    exit 1
}
Write-Log "OK." 'Green'

# 2. Sobe os containers (idempotente, restart: unless-stopped no compose).
#    Importante: PowerShell 5.1 trata stderr de executaveis nativos como erro fatal
#    quando usa &, pipe, ou redirect inline. Start-Process -Wait evita o wrapping.
function Invoke-ComposeUp {
    $out = "$env:TEMP\docker-compose-up.log"
    $err = "$env:TEMP\docker-compose-up-err.log"
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    $p = Start-Process -FilePath 'docker' `
        -ArgumentList 'compose','up','-d' `
        -WorkingDirectory $ScriptDir `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $out `
        -RedirectStandardError $err
    return @{
        ExitCode = $p.ExitCode
        Output = (Get-Content $err -Raw -ErrorAction SilentlyContinue) + (Get-Content $out -Raw -ErrorAction SilentlyContinue)
    }
}

function Invoke-ComposeDown {
    $out = "$env:TEMP\docker-compose-down.log"
    Start-Process -FilePath 'docker' `
        -ArgumentList 'compose','down' `
        -WorkingDirectory $ScriptDir `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $out | Out-Null
}

Write-Log "Subindo containers..." 'White'
$result = Invoke-ComposeUp
if ($result.ExitCode -ne 0) {
    # Auto-recovery: se for problema de port conflict/state ruim, tenta down + up
    if ($result.Output -match 'port is already allocated|already in use|driver failed') {
        Write-Log "  Conflito de porta detectado. Tentando down + up..." 'Yellow'
        Invoke-ComposeDown
        Start-Sleep -Seconds 2
        $result = Invoke-ComposeUp
    }
    if ($result.ExitCode -ne 0) {
        Write-Log "ERRO docker compose up (exit $($result.ExitCode)): $($result.Output)" 'Red'
        exit 1
    }
}
Write-Log "OK (Evolution + Postgres + Redis)." 'Green'

# 3. Mata cloudflared antigo (se houver) e sobe novo em background
Write-Log "Subindo Cloudflare Tunnel..." 'White'
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.Kill() } catch {}
}
Remove-Item $CloudflaredLog -ErrorAction SilentlyContinue

$null = Start-Process -FilePath 'cloudflared' `
    -ArgumentList 'tunnel','--url','http://localhost:8080','--logfile',$CloudflaredLog,'--no-autoupdate' `
    -WindowStyle Hidden `
    -PassThru

# 4. Captura URL do log (espera ate 45s)
$url = $null
$tunnelTimeout = 45
$start = Get-Date
while (-not $url -and ((Get-Date) - $start).TotalSeconds -lt $tunnelTimeout) {
    Start-Sleep -Seconds 1
    $url = Get-CloudflareUrlFromLog
}
if (-not $url) {
    Write-Log "ERRO: cloudflared nao gerou URL em ${tunnelTimeout}s. Veja $CloudflaredLog" 'Red'
    exit 1
}
Write-Log "OK. URL: $url" 'Green'

# 5. Testa que tunnel responde
try {
    $r = Invoke-RestMethod -Uri $url -TimeoutSec 10
    if ($r.status -ne 200) { throw "ping inesperado: $($r | ConvertTo-Json -Compress)" }
} catch {
    Write-Log "AVISO: tunnel UP mas Evolution nao respondeu ainda (pode demorar mais um pouco)." 'Yellow'
}

# 6. Atualiza EVOLUTION_API_URL no Vercel
Write-Log "Atualizando env do Vercel..." 'White'
$headers = @{ Authorization = "Bearer $env:VERCEL_TOKEN" }
try {
    $envList = Invoke-RestMethod `
        -Uri "https://api.vercel.com/v9/projects/$VercelProjectId/env" `
        -Headers $headers `
        -TimeoutSec 15
    $envVar = $envList.envs | Where-Object { $_.key -eq 'EVOLUTION_API_URL' } | Select-Object -First 1
    if (-not $envVar) { throw 'EVOLUTION_API_URL nao existe no projeto' }

    $body = @{
        value = $url
        target = @('production','preview','development')
    } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "https://api.vercel.com/v9/projects/$VercelProjectId/env/$($envVar.id)" `
        -Method PATCH -Headers $headers -Body $body -ContentType 'application/json' `
        -TimeoutSec 15 | Out-Null
    Write-Log "OK (env atualizado)." 'Green'
} catch {
    Write-Log "ERRO ao atualizar env: $_" 'Red'
    exit 1
}

# 7. Dispara redeploy do ultimo deployment de producao
Write-Log "Disparando redeploy..." 'White'
try {
    $deploys = Invoke-RestMethod `
        -Uri "https://api.vercel.com/v6/deployments?projectId=$VercelProjectId&target=production&limit=1&state=READY" `
        -Headers $headers `
        -TimeoutSec 15
    if (-not $deploys.deployments -or $deploys.deployments.Count -eq 0) {
        Write-Log "AVISO: nenhum deployment prod ready encontrado." 'Yellow'
    } else {
        $lastId = $deploys.deployments[0].uid
        $body = @{
            name = 'geometric-forms'
            deploymentId = $lastId
            target = 'production'
        } | ConvertTo-Json
        $newDeploy = Invoke-RestMethod `
            -Uri 'https://api.vercel.com/v13/deployments?forceNew=1' `
            -Method POST -Headers $headers -Body $body -ContentType 'application/json' `
            -TimeoutSec 30
        Write-Log "OK. Novo deploy: $($newDeploy.url)" 'Green'
    }
} catch {
    Write-Log "AVISO: redeploy falhou ($_). O env foi atualizado mas precisa redeploy manual." 'Yellow'
}

Write-Log "" 'White'
Write-Log "===================================================" 'Green'
Write-Log "  Tudo pronto! Cloudflare URL: $url" 'Green'
Write-Log "  Painel: https://geometric-forms.vercel.app/admin/whatsapp" 'Green'
Write-Log "===================================================" 'Green'
Write-Log "" 'White'
Write-Log "(O cloudflared continua rodando em background. Pra parar tudo: docker compose down + matar processo cloudflared)" 'DarkGray'
