# dims-extract - Windows Zero-Permission Installer
Write-Host "[dims-extract] Installing dims-extract for Windows..." -ForegroundColor Cyan

$binDir = Join-Path $HOME ".local\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

$cmdPath = Join-Path $binDir "dims-extract.cmd"
"@echo off`r`nnpx -y dims-extract %*" | Out-File -FilePath $cmdPath -Encoding ascii -Force

# Add to user environment PATH if not already present
$userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$binDir;$userPath", [EnvironmentVariableTarget]::User)
    $env:Path = "$binDir;$env:Path"
    Write-Host "[dims-extract] Added $binDir to user PATH." -ForegroundColor Green
}

Write-Host "`n🎉 dims-extract installed successfully!" -ForegroundColor Green
Write-Host "You can now run:" -ForegroundColor White
Write-Host "  dims-extract --help`n" -ForegroundColor Yellow
