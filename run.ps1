# Starts Joules for the demo: rebuilds the UI if its source changed, then serves UI + API on http://localhost:8010
# with the full source index. Ctrl+C stops it. Usage: .\run.ps1   (add -Public for the public-only index)
param([switch]$Public)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .env)) { throw ".env is missing: copy .env.example to .env and set PASSWORD" }
if (Get-NetTCPConnection -LocalPort 8010 -State Listen -ErrorAction SilentlyContinue) { throw "Port 8010 is already in use" }
$uv = if (Test-Path .tools\bin\uv.exe) { ".\.tools\bin\uv.exe" } else { "uv" }

# UI: build when dist is missing or older than the newest source file
$dist = "frontend\dist\index.html"
$newest = (Get-ChildItem frontend\src -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
if (-not (Test-Path $dist) -or $newest -gt (Get-Item $dist).LastWriteTime) {
    Write-Host "Building the UI..."
    Push-Location frontend; npm install --silent; npm run build --silent; Pop-Location
}

# Models: report what is reachable (any HTTP answer, even 401, means the server is up)
foreach ($s in @(@("OmniRoute (live models)", "http://localhost:20128/v1/models"), @("Ollama (local model)", "http://localhost:11434/api/tags"))) {
    try { Invoke-WebRequest $s[1] -UseBasicParsing -TimeoutSec 3 | Out-Null; $up = $true }
    catch { $up = [bool]$_.Exception.Response }
    Write-Host ("{0,-24} {1}" -f $s[0], $(if ($up) { "up" } else { "DOWN (the chain skips it)" }))
}

$env:PUBLIC_ONLY = if ($Public) { "1" } else { "0" }
Start-Job { Start-Sleep 6; Start-Process "http://localhost:8010" } | Out-Null
Write-Host "Joules on http://localhost:8010 (sign in as admin@joules.app with PASSWORD from .env)"
& $uv run uvicorn app:app --app-dir backend --port 8010
