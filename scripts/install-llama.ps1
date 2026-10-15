$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $projectRoot 'bin'
$versionFile = Join-Path $binDir '.llama-version'
$tempDir = Join-Path $env:TEMP 'immersion-llama-setup'
$apiUrl = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor Gray }

function Get-AssetsByPattern {
    param([array]$Assets, [string]$Pattern)
    return $Assets | Where-Object { $_.name -match $Pattern }
}

function Install-FromZip {
    param([string]$Url, [string]$Label, [string]$ZipName)

    $zipPath = Join-Path $tempDir $ZipName
    $extractPath = Join-Path $tempDir ($ZipName -replace '\.zip$', '')

    Write-Step "Downloading $Label..."
    Invoke-WebRequest -Uri $Url -OutFile $zipPath -UseBasicParsing
    Write-Ok 'Download complete.'

    Write-Step 'Extracting...'
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
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    }

    Write-Step 'Fetching latest release info...'
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'Immersion-AI' }
    $tag = $release.tag_name
    Write-Ok "Latest version: $tag"

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

    $assets = $release.assets

    $mainAsset = $null
    $cudartAsset = $null

    switch ($Backend) {
        'cuda' {
            $cudaAssets = @(Get-AssetsByPattern $assets '-win-cuda-.*-x64\.zip$' |
                Where-Object { $_.name -notmatch '^cudart-' })

            if ($cudaAssets.Count -eq 0) {
                Write-Err "No CUDA build found in release $tag"
                exit 1
            }

            if ($cudaAssets.Count -gt 1) {
                Write-Host ''
                Write-Host '  Available CUDA versions:' -ForegroundColor Cyan
                for ($i = 0; $i -lt $cudaAssets.Count; $i++) {
                    if ($cudaAssets[$i].name -match 'cuda-([\d.]+)') {
                        $ver = $Matches[1]
                    }
                    else {
                        $ver = $cudaAssets[$i].name
                    }
                    Write-Host "    [$($i + 1)] CUDA $ver" -ForegroundColor White
                }
                Write-Host ''
                $cudaChoice = Read-Host '  Your choice'
                $cudaIdx = [int]$cudaChoice - 1
                if ($cudaIdx -lt 0 -or $cudaIdx -ge $cudaAssets.Count) {
                    Write-Err 'Invalid choice.'
                    exit 1
                }
                $mainAsset = $cudaAssets[$cudaIdx]
            }
            else {
                $mainAsset = $cudaAssets[0]
            }

            if ($mainAsset.name -match 'cuda-([\d.]+)') {
                $cudaVer = $Matches[1]
                $cudartAsset = $assets |
                    Where-Object { $_.name -match "^cudart-.*cuda-$([regex]::Escape($cudaVer)).*\.zip$" } |
                    Select-Object -First 1
            }
        }
        'vulkan' {
            $mainAsset = Get-AssetsByPattern $assets '-win-vulkan-x64\.zip$' | Select-Object -First 1
        }
        'cpu' {
            $mainAsset = Get-AssetsByPattern $assets '-win-cpu-x64\.zip$' | Select-Object -First 1
        }
    }

    if (-not $mainAsset) {
        Write-Err "Build '$Backend' not found in release $tag"
        exit 1
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

    Install-FromZip -Url $mainAsset.browser_download_url -Label 'llama-server' -ZipName 'llama-main.zip'

    if ($cudartAsset) {
        Write-Host ''
        Install-FromZip -Url $cudartAsset.browser_download_url -Label 'CUDA runtime' -ZipName 'cudart.zip'
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
