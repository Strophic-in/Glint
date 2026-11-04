# Run all of Glint locally: API + website in their own windows, then the desktop app.
#
#   .\dev.ps1          Real AI if server\.env has OPENAI_API_KEY=sk-..., otherwise simulated AI
#   .\dev.ps1 -Mock    Force simulated AI (no OpenAI cost)
#
# Local mode always enables email "dev login" (no Google setup needed). The database is DATABASE_URL in
# server\.env (your VibeDB "glint-dev" project).
param([switch]$Mock)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$shell = (Get-Process -Id $PID).Path
$cargo = "$env:USERPROFILE\.cargo\bin"

foreach ($dir in 'server', 'web', 'desktop') {
  if (-not (Test-Path "$root\$dir\node_modules")) {
    Write-Host "Installing $dir dependencies..." -ForegroundColor Cyan
    Push-Location "$root\$dir"; pnpm install; Pop-Location
  }
}

# Serve the locally built installer from the website so the Download button works.
$installer = Get-ChildItem "$root\desktop\src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$downloadUrl = ''
if ($installer) {
  New-Item -ItemType Directory -Force "$root\web\static\downloads" | Out-Null
  Copy-Item $installer.FullName "$root\web\static\downloads\Glint-Setup.exe" -Force
  $downloadUrl = '/downloads/Glint-Setup.exe'
} else {
  Write-Host 'No installer built yet (cd desktop; pnpm tauri build). Download button will go to the dashboard.' -ForegroundColor Yellow
}

$envFile = "$root\server\.env"
if (-not ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^\s*DATABASE_URL\s*=\s*postgres' -Quiet))) {
  Write-Host 'server\.env needs DATABASE_URL (VibeDB: sudo vibedb project credentials glint-dev --role owner --url direct).' -ForegroundColor Red
  exit 1
}
$hasKey = (Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^\s*OPENAI_API_KEY\s*=\s*sk-' -Quiet)
$mockAI = if ($Mock -or -not $hasKey) { '1' } else { '0' }

# Shell variables win over server\.env, so a production-style .env is safe to keep.
$api = @"
`$Host.UI.RawUI.WindowTitle = 'Glint API :8787'
Set-Location '$root\server'
`$env:NODE_ENV = 'development'; `$env:DEV_LOGIN = '1'; `$env:MOCK_AI = '$mockAI'
`$env:WEB_URL = 'http://localhost:5173'; `$env:CORS_ORIGINS = 'http://localhost:5173'
`$env:PORT = '8787'; `$env:HOST = '::'
pnpm dev
"@
$web = @"
`$Host.UI.RawUI.WindowTitle = 'Glint web :5173'
Set-Location '$root\web'
`$env:PUBLIC_DEV_LOGIN = '1'; `$env:PUBLIC_API_URL = 'http://localhost:8787'; `$env:PUBLIC_DOWNLOAD_URL = '$downloadUrl'
pnpm dev --port 5173 --strictPort
"@
$app = @"
`$Host.UI.RawUI.WindowTitle = 'Glint desktop'
Set-Location '$root\desktop'
`$env:Path = '$cargo;' + `$env:Path
`$env:GLINT_API_URL = 'http://localhost:8787'; `$env:GLINT_WEB_URL = 'http://localhost:5173'
pnpm tauri dev
"@

Start-Process $shell -ArgumentList '-NoExit', '-Command', $api
Start-Process $shell -ArgumentList '-NoExit', '-Command', $web

Write-Host 'Waiting for the API...' -NoNewline
for ($i = 0; $i -lt 90; $i++) {
  try { $h = Invoke-RestMethod http://127.0.0.1:8787/health -TimeoutSec 2; break } catch { Start-Sleep -Milliseconds 500; Write-Host '.' -NoNewline }
}
Write-Host ''
if (-not $h) { Write-Host 'API did not start. Check the "Glint API" window.' -ForegroundColor Red; exit 1 }

Start-Process $shell -ArgumentList '-NoExit', '-Command', $app

$mode = if ($h.mock) { 'SIMULATED AI (add OPENAI_API_KEY to server\.env for real answers)' } else { 'REAL OpenAI' }
Write-Host ''
Write-Host "Glint is starting  ·  $mode" -ForegroundColor Green
Write-Host '  Website   http://localhost:5173  (sign in with any email: dev login)'
Write-Host '  API       http://localhost:8787/health'
Write-Host '  App       appears at the top of your screen in ~30 s (first run compiles longer)'
Write-Host '  Stop      close the three Glint windows'
