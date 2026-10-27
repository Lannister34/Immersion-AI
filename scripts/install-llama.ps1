$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $projectRoot 'bin'
$versionFile = Join-Path $binDir '.llama-version'
$tempDir = Join-Path $env:TEMP 'immersion-llama-setup'
$apiUrl = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30'

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor Gray }

function Save-Asset {
    param([object]$Asset, [string]$Sha256, [string]$Label, [string]$ZipName)

    $zipPath = Join-Path $tempDir $ZipName

    Write-Step "Downloading $Label..."
    Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Assert-FileSha256 -Path $zipPath -Expected $Sha256 -Name $Asset.name
    if ($Sha256) {
        Write-Ok 'Download complete, checksum verified.'
    }
    else {
        Write-Ok 'Download complete (the release publishes no checksum for it).'
    }
}

function Install-FromZip {
    param([string]$Label, [string]$ZipName)

    $zipPath = Join-Path $tempDir $ZipName
    $extractPath = Join-Path $tempDir ($ZipName -replace '\.zip$', '')

    Write-Step "Extracting $Label..."
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $serverExe = Get-ChildItem -Path $extractPath -Recurse -Filter 'llama-server.exe' |
        Select-Object -First 1

    if ($serverExe) {
        $sourceDir = $serverExe.DirectoryName
        Copy-Item -Path $serverExe.FullName -Destination $binDir -Force
        $dlls = Get-ChildItem -Path $sourceDir -Filter '*.dll'
        foreach ($dll in $dlls) {
            Copy-Item -Path $dll.FullName -Destination $binDir -Force
        }
        Write-Ok "Copied: llama-server.exe + $($dlls.Count) DLLs"
    }
    else {
        $dlls = Get-ChildItem -Path $extractPath -Recurse -Filter '*.dll'
        foreach ($dll in $dlls) {
            Copy-Item -Path $dll.FullName -Destination $binDir -Force
        }
        Write-Ok "Copied: $($dlls.Count) DLLs"
    }
}

Write-Host ''
Write-Host '  =========================================' -ForegroundColor Magenta
Write-Host '    Immersion AI - llama-server Setup' -ForegroundColor Magenta
Write-Host '  =========================================' -ForegroundColor Magenta
Write-Host ''
Write-Host '  Select llama-server build:' -ForegroundColor White
Write-Host ''
Write-Host '    [1] CUDA (NVIDIA GPU)' -ForegroundColor Yellow
Write-Host '    [2] Vulkan (AMD / Intel GPU)' -ForegroundColor Cyan
Write-Host '    [3] CPU (no GPU acceleration)' -ForegroundColor Gray
Write-Host ''

$choice = Read-Host '  Your choice (1-3)'

switch ($choice) {
    '1' { $Backend = 'cuda' }
    '2' { $Backend = 'vulkan' }
    '3' { $Backend = 'cpu' }
    default {
        Write-Err 'Invalid choice. Enter 1, 2, or 3.'
        exit 1
    }
}

Write-Host ''
Write-Step "Selected: $Backend"
Write-Host ''

try {
    foreach ($module in 'llama-build-selection.psm1', 'llama-asset-digest.psm1', 'file-sha256.psm1') {
        Import-Module (Join-Path $PSScriptRoot $module) -Force
    }

    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    }

    Write-Step 'Fetching the latest llama.cpp builds...'
    $releases = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'Immersion-AI' }
    $build = Select-LlamaBuild -Releases $releases -Backend $Backend
    $tag = $build.Tag
    Write-Ok "Latest build: $tag"

    if (Test-Path $versionFile) {
        $currentVersion = (Get-Content $versionFile -Raw).Trim()
        if ($currentVersion -eq $tag) {
            Write-Host ''
            Write-Ok "Already up to date ($tag)."
            Write-Dim 'No update needed.'
            exit 0
        }
        Write-Host "  Current: $currentVersion -> updating to $tag" -ForegroundColor Yellow
    }

    $option = $build.Options[0]

    if ($build.Options.Count -gt 1) {
        Write-Host ''
        Write-Host '  Available CUDA versions:' -ForegroundColor Cyan
        for ($i = 0; $i -lt $build.Options.Count; $i++) {
            if ($build.Options[$i].Main.name -match 'cuda-([\d.]+)') {
                $ver = $Matches[1]
            }
            else {
                $ver = $build.Options[$i].Main.name
            }
            Write-Host "    [$($i + 1)] CUDA $ver" -ForegroundColor White
        }
        Write-Host ''
        $cudaChoice = Read-Host '  Your choice'
        $cudaIdx = [int]$cudaChoice - 1
        if ($cudaIdx -lt 0 -or $cudaIdx -ge $build.Options.Count) {
            Write-Err 'Invalid choice.'
            exit 1
        }
        $option = $build.Options[$cudaIdx]
    }

    $mainAsset = $option.Main
    $cudartAsset = $option.Runtime
    $mainSha256 = Get-AssetSha256 $mainAsset
    $cudartSha256 = $null
    if ($cudartAsset) {
        $cudartSha256 = Get-AssetSha256 $cudartAsset
    }

    $sizeMain = [math]::Round($mainAsset.size / 1MB, 1)
    Write-Dim "File: $($mainAsset.name) ($sizeMain MB)"
    if ($cudartAsset) {
        $sizeCudart = [math]::Round($cudartAsset.size / 1MB, 1)
        Write-Dim "CUDA runtime: $($cudartAsset.name) ($sizeCudart MB)"
    }
    Write-Host ''

    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    Save-Asset -Asset $mainAsset -Sha256 $mainSha256 -Label 'llama-server' -ZipName 'llama-main.zip'
    if ($cudartAsset) {
        Save-Asset -Asset $cudartAsset -Sha256 $cudartSha256 -Label 'CUDA runtime' -ZipName 'cudart.zip'
    }

    Write-Host ''
    Install-FromZip -Label 'llama-server' -ZipName 'llama-main.zip'
    if ($cudartAsset) {
        Install-FromZip -Label 'CUDA runtime' -ZipName 'cudart.zip'
    }

    $finalExe = Join-Path $binDir 'llama-server.exe'
    if (-not (Test-Path $finalExe)) {
        Write-Err 'llama-server.exe not found after installation!'
        exit 1
    }

    Set-Content -Path $versionFile -Value $tag -NoNewline

    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host '  =========================================' -ForegroundColor Green
    Write-Ok "Installation complete! Version: $tag"
    Write-Ok 'llama-server is ready to use.'
    Write-Host '  =========================================' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Err $_.Exception.Message
    Write-Host ''
    Write-Host '  Possible causes:' -ForegroundColor Yellow
    Write-Host '    - No internet connection' -ForegroundColor Yellow
    Write-Host '    - GitHub API is unavailable' -ForegroundColor Yellow
    Write-Host '    - Antivirus is blocking the download' -ForegroundColor Yellow

    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
