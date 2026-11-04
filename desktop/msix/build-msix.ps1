# Builds the Microsoft Store package (MSIX) from the release build of the desktop app.
#
#   1. Build the app with the production URLs (from desktop/):
#        $env:GLINT_API_URL = "https://glint-api.strophic.in"; $env:GLINT_WEB_URL = "https://glint.strophic.in"
#        pnpm tauri build
#   2. .\msix\build-msix.ps1                -> release\Glint.msix (unsigned: the Store signs it)
#      .\msix\build-msix.ps1 -LocalTest     -> registers a "Glint (test)" copy on this PC to try the
#                                              packaged app. Needs Windows Developer Mode (Settings >
#                                              System > For developers). Remove it with:
#                                              Get-AppxPackage Glint.LocalTest | Remove-AppxPackage
#
# Store identity values come from msix\store.json (copy them from Partner Center).
param([switch]$LocalTest)

$ErrorActionPreference = 'Stop'
$desktop = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $desktop 'src-tauri\target\release\glint.exe'
$icon = Join-Path $desktop 'src-tauri\icons\icon.png'
$work = Join-Path $desktop 'src-tauri\target\msix'
$layout = Join-Path $work 'layout'
$outDir = Join-Path $desktop 'release'
if (-not (Test-Path $exe)) { throw "Missing $exe. Run 'pnpm tauri build' first." }

$sdkBin = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory -Filter '10.*' |
  Sort-Object { [version]$_.Name } -Descending |
  Where-Object { Test-Path (Join-Path $_.FullName 'x64\makeappx.exe') } | Select-Object -First 1
if (-not $sdkBin) { throw 'Windows SDK (makeappx.exe) not found.' }
$makeappx = Join-Path $sdkBin.FullName 'x64\makeappx.exe'
$makepri = Join-Path $sdkBin.FullName 'x64\makepri.exe'

$store = Get-Content (Join-Path $PSScriptRoot 'store.json') -Raw | ConvertFrom-Json
$appVersion = (Get-Content (Join-Path $desktop 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
$version = "$appVersion.0" # Store versions have four parts and the last must be 0

$identityName = $store.identityName
$publisher = $store.publisher
$displayName = $store.displayName
if ($LocalTest) {
  $identityName = 'Glint.LocalTest'
  $publisher = 'CN=Glint Local Test'
  $displayName = "$($store.displayName) (test)"
}

# Fresh layout: the app plus its manifest and icons.
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $layout 'Assets'), $outDir | Out-Null
Copy-Item $exe $layout

$tokens = [ordered]@{
  '{{IDENTITY_NAME}}'          = $identityName
  '{{PUBLISHER_DISPLAY_NAME}}' = $store.publisherDisplayName
  '{{PUBLISHER}}'              = $publisher
  '{{DISPLAY_NAME}}'           = $displayName
  '{{DESCRIPTION}}'            = $store.description
  '{{VERSION}}'                = $version
}
$manifest = Get-Content (Join-Path $PSScriptRoot 'AppxManifest.xml') -Raw
foreach ($k in $tokens.Keys) { $manifest = $manifest.Replace($k, [System.Security.SecurityElement]::Escape($tokens[$k])) }
Set-Content (Join-Path $layout 'AppxManifest.xml') $manifest -Encoding utf8 -NoNewline

# Icons. The source is the 512 px app icon; tiles get padding, taskbar/list icons are full size.
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($icon)
function Save-Asset([string]$name, [int]$w, [int]$h, [double]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.CompositingQuality = 'HighQuality'
  $side = [int][Math]::Round([Math]::Min($w, $h) * $fill)
  $g.DrawImage($src, [int](($w - $side) / 2), [int](($h - $side) / 2), $side, $side)
  $bmp.Save((Join-Path $layout "Assets\$name"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
foreach ($s in 100, 200, 400) {
  $k = $s / 100
  Save-Asset "Square44x44Logo.scale-$s.png" (44 * $k) (44 * $k) 1.0
  Save-Asset "Square150x150Logo.scale-$s.png" (150 * $k) (150 * $k) 0.6
  Save-Asset "Wide310x150Logo.scale-$s.png" (310 * $k) (150 * $k) 0.6
  Save-Asset "StoreLogo.scale-$s.png" (50 * $k) (50 * $k) 1.0
}
foreach ($t in 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256) {
  Save-Asset "Square44x44Logo.targetsize-$t.png" $t $t 1.0
  Save-Asset "Square44x44Logo.targetsize-${t}_altform-unplated.png" $t $t 1.0
  Save-Asset "Square44x44Logo.targetsize-${t}_altform-lightunplated.png" $t $t 1.0
}
$src.Dispose()

# Resource index so Windows picks the right icon size, then the package itself.
& $makepri createconfig /cf (Join-Path $work 'priconfig.xml') /dq en-US /pv 10.0.0 /o | Out-Null
if ($LASTEXITCODE) { throw 'makepri createconfig failed' }
# Single package, not a bundle: keep every scale in one resources.pri instead of split packages.
[xml]$pri = Get-Content (Join-Path $work 'priconfig.xml') -Raw
$pri.SelectNodes('//packaging') | ForEach-Object { [void]$_.ParentNode.RemoveChild($_) }
$pri.Save((Join-Path $work 'priconfig.xml'))
& $makepri new /pr $layout /cf (Join-Path $work 'priconfig.xml') /mn (Join-Path $layout 'AppxManifest.xml') /of (Join-Path $layout 'resources.pri') /o | Out-Null
if ($LASTEXITCODE) { throw 'makepri new failed' }

if ($LocalTest) {
  # Unsigned packages can't launch an .exe, so the test copy is registered from the folder instead.
  Get-AppxPackage -Name 'Glint.LocalTest' | Remove-AppxPackage
  Add-AppxPackage -Register (Join-Path $layout 'AppxManifest.xml')
  Get-AppxPackage -Name 'Glint.LocalTest' | Select-Object Name, Version, InstallLocation | Format-List
  return
}

$out = Join-Path $outDir 'Glint.msix'
& $makeappx pack /d $layout /p $out /o | Select-String -Pattern 'error|succeeded' | ForEach-Object { $_.Line }
if ($LASTEXITCODE) { throw 'makeappx pack failed' }
Write-Host "MSIX: $out ($([math]::Round((Get-Item $out).Length / 1MB, 2)) MB, version $version)"
