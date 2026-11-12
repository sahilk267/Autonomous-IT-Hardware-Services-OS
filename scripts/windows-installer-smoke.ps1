# Phase M disposable GitHub-hosted Windows runner only.
# Runs the *actual NSIS installer*, launches the installed GUI, confirms the
# offline first-run wizard without a server URL, then silently uninstalls.
# Does not exercise DPAPI persistence, real HTTPS login or upgrades with user data.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $env:GITHUB_ACTIONS -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Windows installer smoke is restricted to an ephemeral Windows GitHub Actions runner.'
}
$setups = @(Get-ChildItem -Path 'release/windows' -Filter '*Setup-x64.exe' -Recurse -File)
if ($setups.Count -ne 1) { throw "Expected exactly 1 preview installer; found $($setups.Count)" }
$setup = $setups[0].FullName
Write-Output "Running unattended NSIS install of $($setups[0].Name)"
$install = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "NSIS installer returned $($install.ExitCode)" }

# NSIS per-user install uses LOCALAPPDATA\Programs by default.
$roots = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Apex IT OS Desktop'),
  (Join-Path $env:LOCALAPPDATA 'Programs\apex-it-os-desktop')
)
$executables = @()
foreach ($root in $roots) {
  if (Test-Path $root) {
    $executables += @(Get-ChildItem -Path $root -Filter 'Apex IT OS Desktop.exe' -Recurse -File)
  }
}
if ($executables.Count -ne 1) {
  throw "Installed executable not found or duplicated. Found $($executables.Count)"
}
$exe = $executables[0].FullName
$rootDir = Split-Path -Parent $exe
$resources = Join-Path $rootDir 'resources'
if (-not (Test-Path (Join-Path $resources 'app.asar'))) {
  throw 'Installed app.asar missing from NSIS output'
}
if (-not (Test-Path (Join-Path $resources 'web\index.html'))) {
  throw 'Installed React frontend missing from resources/web'
}
Write-Output 'Installed EXE and embedded React assets exist.'

# GitHub-hosted Windows runners often execute as a service without an
# interactive desktop. Never misrepresent that scenario as a GUI PASS.
$interactive = [Environment]::UserInteractive -and
  $env:SESSIONNAME -match '^(Console|RDP-)'
$requireGui = $env:APEX_REQUIRE_INTERACTIVE_SMOKE -eq '1'
if ($requireGui -and -not $interactive) {
  throw 'Interactive GUI acceptance requested but the runner has no interactive Windows desktop session.'
}

$launched = Start-Process -FilePath $exe -PassThru
$found = $false
try {
  $cycles = if ($interactive) { 60 } else { 7 }
  for ($i=0; $i -lt $cycles; $i++) {
    Start-Sleep -Milliseconds 600
    # Main window may be owned by a child Electron process.
    $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessName -like 'Apex IT OS*' -and $_.MainWindowTitle -match 'Desktop Configuration'
    })
    if ($running.Count -gt 0) {
      $found = $true
      Write-Output 'GUI VERIFIED: the installed first-run configuration wizard is visible.'
      break
    }
    if ($launched.HasExited) { break }
  }
  if ($interactive -and -not $found) {
    $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessName -like 'Apex IT OS*'
    } | Select-Object -First 8 ProcessName, Id, MainWindowTitle)
    Write-Output ('Installed app processes: ' + ($processes | ConvertTo-Json -Compress))
    throw 'Interactive Windows runner did not show the first-run Desktop Configuration wizard.'
  }
  if (-not $interactive) {
    Write-Output '::warning::GUI UNVERIFIED (headless Windows runner); install and packaged frontend checks passed. Interactive Windows acceptance is still mandatory before production.'
  }
} finally {
  # Stop only processes belonging to this test install.
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($rootDir, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

$uninstallers = @(Get-ChildItem -Path $rootDir -Filter 'Uninstall*.exe' -File)
if ($uninstallers.Count -ne 1) { throw 'No unique NSIS uninstaller found for smoke test' }
$uninstall = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "NSIS uninstaller returned $($uninstall.ExitCode)" }
Start-Sleep -Seconds 2
if (Test-Path $exe) { throw 'Uninstaller left installed executable behind' }
Write-Output 'NSIS unattended uninstall completed without leaving executable.'
