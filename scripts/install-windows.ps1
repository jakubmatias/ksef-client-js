Param(
  [string]$Version = "latest",
  [string]$Repo = "jakubmatias/ksef-client-js"
)

$ErrorActionPreference = "Stop"
$required = @("Expand-Archive", "Get-FileHash", "Invoke-WebRequest")
foreach ($cmd in $required) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd is required."
  }
}
$fileName = "ksef-windows.zip"
$baseUrl = "https://github.com/$Repo/releases"

if ($Version -eq "latest") {
  $downloadUrl = "$baseUrl/latest/download/$fileName"
} else {
  $downloadUrl = "$baseUrl/download/v$Version/$fileName"
}

$destDir = Join-Path $env:LOCALAPPDATA "Programs\ksef"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$destPath = Join-Path $destDir "ksef.exe"
$tmpPath = Join-Path $env:TEMP $fileName
$checksumsPath = Join-Path $env:TEMP "checksums.sha256"

Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpPath
Invoke-WebRequest -Uri ($baseUrl + "/latest/download/checksums.sha256") -OutFile $checksumsPath
if ($Version -ne "latest") {
  Invoke-WebRequest -Uri ($baseUrl + "/download/v$Version/checksums.sha256") -OutFile $checksumsPath
}

$checksumLine = Get-Content $checksumsPath | Where-Object { $_ -match "ksef-windows.zip" } | Select-Object -First 1
if (-not $checksumLine) {
  throw "Checksum entry for ksef-windows.zip not found."
}

$expectedHash = $checksumLine.Split(" ")[0]
$actualHash = (Get-FileHash -Algorithm SHA256 $tmpPath).Hash.ToLower()
if ($expectedHash.ToLower() -ne $actualHash) {
  throw "Checksum verification failed."
}

Remove-Item -Force $checksumsPath
Expand-Archive -Path $tmpPath -DestinationPath $destDir -Force
Remove-Item -Force $tmpPath

$extractedPath = Join-Path $destDir "ksef-windows.exe"
Move-Item -Force $extractedPath $destPath

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$destDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$currentPath;$destDir", "User")
  Write-Host "Added $destDir to user PATH. Restart your terminal to use ksef."
}

Write-Host "Installed ksef to $destPath"
