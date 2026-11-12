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

$launched = Start-Process -FilePath $exe -PassThru
$found = $false
try {
  for ($i=0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 600
    # GUI process can differ from the initial Electron launch PID.
    $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessName -like 'Apex IT OS*' -and $_.MainWindowTitle -match 'Desktop Configuration'
    })
    if ($running.Count -gt 0) {
      $found = $true
      Write-Output 'First-run configuration wizard launched without any hosted server details.'
      break
    }
    if ($launched.HasExited) { break }
  }
  if (-not $found) {
    throw 'Installed EXE did not show the offline first-run Desktop Configuration wizard.'
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
