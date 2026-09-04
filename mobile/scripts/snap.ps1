# Sends me your phone's screen. PowerShell version of snap.sh.
#
# PowerShell cannot run .sh files, and Windows offers to "open" them in Notepad
# instead, which is why this exists rather than asking anyone to install a
# second shell.
#
# Usage:
#   .\scripts\snap.ps1 "day mode home"
#
# The report is written to disk for you to attach. It is deliberately not
# pushed: the repo is public and a screenshot captures whatever is on screen.
#
# If PowerShell refuses to run it ("running scripts is disabled"), either:
#   powershell -ExecutionPolicy Bypass -File scripts\snap.ps1 "day mode home"
# or allow local scripts once, for your user only:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param([string]$Label = "snap")

$ErrorActionPreference = "Stop"

# Push rather than Set: the script would otherwise leave the shell sitting in
# the repo root, so the next run of `.\scripts\snap.ps1` fails with a confusing
# "not found" from the wrong directory.
Push-Location (Join-Path $PSScriptRoot "..\..")   # repo root
try {

$PKG = "com.loophole.app"

function Blue($m) { Write-Host $m -ForegroundColor Cyan }
function Die($m)  { Write-Host $m -ForegroundColor Red; Pop-Location; exit 1 }

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  Die @"
adb is not installed, or is not on PATH.

Install Android SDK platform-tools:
  winget install --id Google.PlatformTools
then close and reopen PowerShell so PATH updates.
"@
}

$device = (adb devices | Select-Object -Skip 1 |
  Where-Object { $_ -match "\sdevice$" } |
  ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)

if (-not $device) {
  Die @"
No phone found. Plug it in, make sure USB debugging is on, and accept the
'Allow USB debugging?' prompt on the phone's screen. Then check with:
  adb devices
A line ending in 'unauthorized' means that prompt has not been accepted yet.
"@
}

$slug = ($Label.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
if (-not $slug) { $slug = "snap" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = "device-reports/$stamp-$slug"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# A screenshot is of whatever is on screen right now, which the first time was
# a home screen rather than the app. Count down so there is time to get to it.
Write-Host "Open the screen you want captured on the phone."
5..1 | ForEach-Object { Write-Host -NoNewline "`r  capturing in $_... "; Start-Sleep 1 }
Write-Host "`r                        `r" -NoNewline

Blue "Capturing from $device..."

# Screenshot via the phone's own storage rather than a pipe: PowerShell's
# redirection re-encodes bytes as text and corrupts a PNG on the way through.
adb -s $device shell screencap -p /sdcard/loophole-snap.png
adb -s $device pull /sdcard/loophole-snap.png "$dir/screen.png" | Out-Null
adb -s $device shell rm /sdcard/loophole-snap.png

function Prop($name) { (adb -s $device shell getprop $name).Trim() }

@(
  "device:  $(Prop 'ro.product.manufacturer') $(Prop 'ro.product.model')"
  "android: $(Prop 'ro.build.version.release') (API $(Prop 'ro.build.version.sdk'))"
  "screen:  $((adb -s $device shell wm size).Trim())"
  "density: $((adb -s $device shell wm density).Trim())"
  "label:   $Label"
) | Set-Content "$dir/device.txt"

# The crash buffer survives the process dying, so it holds the last crash
# whether or not one just happened. Empty is good news.
# Only this app's crashes. The buffer holds every crash on the phone, and
# flagging an unrelated app's startup failure sends everyone chasing nothing.
$blocks = (adb -s $device logcat -b crash -d) -join "`n" -split "(?=FATAL EXCEPTION)"
($blocks | Where-Object { $_ -match [regex]::Escape($PKG) }) -join "`n" |
  Set-Content "$dir/crash.log"
adb -s $device logcat -d ReactNative:V ReactNativeJS:V AndroidRuntime:E "${PKG}:V" "*:S" |
  Select-Object -Last 400 | Set-Content "$dir/app.log"

Blue "Wrote $dir"
Get-Content "$dir/device.txt" | ForEach-Object { "  $_" }
if ((Get-Item "$dir/crash.log").Length -gt 2) {
  Write-Host "  crash.log has a Loophole crash in it" -ForegroundColor Yellow
} else {
  Write-Host "  no Loophole crash"
}

Blue "Attach these two files in the chat:"
Write-Host "  $(Resolve-Path "$dir/screen.png")"
Write-Host "  $(Resolve-Path "$dir/crash.log")"
Write-Host ""
Write-Host "Reports are not pushed: this repo is public, and a screenshot is whatever"
Write-Host "was on screen - which the first time was a home screen, not the app."

}
finally { Pop-Location }
