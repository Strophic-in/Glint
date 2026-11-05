# Builds a signed release of the desktop app and (with -Upload) publishes it, which makes every
# installed copy offer the update.
#
#   1. Bump "version" in src-tauri/tauri.conf.json (+ Cargo.toml, package.json).
#   2. .\release.ps1 -Notes "What changed"            -> release\ (installer, latest.json)
#      .\release.ps1 -Notes "What changed" -Upload    -> also uploads to glint-api.strophic.in/downloads
#
# Updates are verified with the key in %USERPROFILE%\.tauri\glint-updater.key (generated once with
# `pnpm tauri signer generate`). Back it up: without it, installed apps can't accept new updates.
param(
  [string]$Notes = '',
  [switch]$Upload,
  [string]$ApiUrl = 'https://glint-api.strophic.in',
  [string]$WebUrl = 'https://glint.strophic.in',
  [string]$Server = 'ubuntu@140.245.196.3',
  [string]$SshKey = "$env:USERPROFILE\.ssh\oracle.key"
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$key = "$env:USERPROFILE\.tauri\glint-updater.key"
if (-not (Test-Path $key)) { throw "Missing updater key $key" }

$version = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
Write-Host "Building Glint $version for $ApiUrl"

$env:GLINT_API_URL = $ApiUrl
$env:GLINT_WEB_URL = $WebUrl
$env:TAURI_SIGNING_PRIVATE_KEY = $key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
pnpm tauri build
if ($LASTEXITCODE) { throw 'tauri build failed' }

$name = "Glint_${version}_x64-setup.exe"
$exe = "src-tauri\target\release\bundle\nsis\$name"
if (-not (Test-Path "$exe.sig")) { throw "Missing $exe.sig (updater signature)" }

New-Item -ItemType Directory -Force release | Out-Null
Copy-Item $exe "release\$name" -Force
Copy-Item $exe 'release\Glint-Setup.exe' -Force
$manifest = [ordered]@{
  version   = $version
  notes     = $Notes
  pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{
    'windows-x86_64' = [ordered]@{
      signature = (Get-Content "$exe.sig" -Raw).Trim()
      url       = "$ApiUrl/downloads/$name"
    }
  }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content release\latest.json -Encoding utf8NoBOM
Write-Host "release\$name  ($([math]::Round((Get-Item $exe).Length / 1MB, 2)) MB) + latest.json"

if ($Upload) {
  $dest = "${Server}:/opt/glint/downloads"
  # Installers first, latest.json last: clients only hear about the update once it can be downloaded.
  scp -i $SshKey -q "release\$name" "$dest/$name"
  scp -i $SshKey -q "release\$name" "$dest/Glint-Setup.exe.new"
  ssh -i $SshKey $Server 'mv /opt/glint/downloads/Glint-Setup.exe.new /opt/glint/downloads/Glint-Setup.exe'
  scp -i $SshKey -q release\latest.json "$dest/latest.json"
  if ($LASTEXITCODE) { throw 'upload failed' }
  Write-Host "Published ${version}: $ApiUrl/downloads/latest.json"
}
