# Starts Joules for the demo: starts Ollama and OmniRoute if they are down, rebuilds the UI if its source changed,
# then serves UI + API on http://localhost:8010 with the full source index. Ctrl+C stops Joules (not the model servers).
# Usage: .\run.ps1   (add -Public for the public-only index)
# OmniRoute is started with OMNIROUTE_START (.env), else ~\.omniroute\omniroute-launch.cmd, else `omniroute` on PATH.
param([switch]$Public)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .env)) { throw ".env is missing: copy .env.example to .env and set PASSWORD" }
if (Get-NetTCPConnection -LocalPort 8010 -State Listen -ErrorAction SilentlyContinue) { throw "Port 8010 is already in use" }
$uv = if (Test-Path .tools\bin\uv.exe) { ".\.tools\bin\uv.exe" } else { "uv" }

function Test-Up($url) {  # any HTTP answer, even 401, means the server is up
    try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return [bool]$_.Exception.Response }
}
function Start-IfDown($name, $url, $cmd) {
    if (Test-Up $url) { Write-Host ("{0,-10} up" -f $name); return }
    if (-not $cmd) { Write-Host ("{0,-10} DOWN, no start command found (the chain skips it)" -f $name); return }
    Write-Host ("{0,-10} starting: {1}" -f $name, $cmd)
    if (Test-Path -LiteralPath $cmd) { Start-Process -LiteralPath $cmd -WindowStyle Minimized }  # a launcher file
    else { Start-Process powershell -WindowStyle Minimized -ArgumentList "-NoProfile", "-Command", $cmd }
    foreach ($i in 1..30) { Start-Sleep 1; if (Test-Up $url) { Write-Host ("{0,-10} up" -f $name); return } }
    Write-Host ("{0,-10} still DOWN after 30 s (the chain skips it)" -f $name)
}
$envCmd = (Select-String -Path .env -Pattern '^OMNIROUTE_START=(.+)$' | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
$launcher = Join-Path $env:USERPROFILE ".omniroute\omniroute-launch.cmd"
$omni = if ($envCmd) { $envCmd } elseif (Test-Path $launcher) { $launcher } elseif (Get-Command omniroute -ErrorAction SilentlyContinue) { "omniroute" }
$olla = if (Get-Command ollama -ErrorAction SilentlyContinue) { "ollama serve" }
Start-IfDown "Ollama" "http://localhost:11434/api/tags" $olla
Start-IfDown "OmniRoute" "http://localhost:20128/v1/models" $omni

# UI: build when dist is missing or older than the newest source file
$dist = "frontend\dist\index.html"
$newest = (Get-ChildItem frontend\src -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
if (-not (Test-Path $dist) -or $newest -gt (Get-Item $dist).LastWriteTime) {
    Write-Host "Building the UI..."
    Push-Location frontend; npm install --silent; npm run build --silent; Pop-Location
}

$env:PUBLIC_ONLY = if ($Public) { "1" } else { "0" }
Start-Job { Start-Sleep 6; Start-Process "http://localhost:8010" } | Out-Null
Write-Host "Joules on http://localhost:8010 (sign in as admin@joules.app with PASSWORD from .env). Ctrl+C to stop."
# short graceful timeout: open SSE streams and keep-alive connections would otherwise block Ctrl+C
& $uv run uvicorn app:app --app-dir backend --port 8010 --timeout-graceful-shutdown 2
