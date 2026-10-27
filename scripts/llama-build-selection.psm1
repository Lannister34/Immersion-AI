function Get-LlamaBuildNumber {
    param([string]$Tag)

    if ($Tag -match '^b(\d{1,18})$') {
        return [long]$Matches[1]
    }
    return $null
}

function Get-LlamaBackendOptions {
    param([object[]]$Assets, [string]$Backend)

    switch ($Backend) {
        'cpu' {
            return @($Assets | Where-Object { $_.name -match '^llama-b\d+-bin-win-cpu-x64\.zip$' } |
                ForEach-Object { [pscustomobject]@{ Main = $_; Runtime = $null } })
        }
        'vulkan' {
            return @($Assets | Where-Object { $_.name -match '^llama-b\d+-bin-win-vulkan-x64\.zip$' } |
                ForEach-Object { [pscustomobject]@{ Main = $_; Runtime = $null } })
        }
        'cuda' {
            return @(foreach ($asset in $Assets) {
                if ($asset.name -notmatch '^llama-b\d+-bin-win-cuda-([\d.]+)-x64\.zip$') {
                    continue
                }
                $runtimeName = "cudart-llama-bin-win-cuda-$($Matches[1])-x64.zip"
                $runtime = $Assets | Where-Object { $_.name -eq $runtimeName } | Select-Object -First 1
                if ($runtime) {
                    [pscustomobject]@{ Main = $asset; Runtime = $runtime }
                }
            })
        }
        default {
            throw "Unknown backend '$Backend'."
        }
    }
}

function Select-LlamaBuild {
    param([object[]]$Releases, [string]$Backend)

    $builds = @(@(foreach ($release in $Releases) {
        $number = Get-LlamaBuildNumber $release.tag_name
        if ($release.draft -or $null -eq $number) {
            continue
        }
        [pscustomobject]@{ Number = $number; Release = $release }
    }) | Sort-Object -Property Number -Descending)

    if ($builds.Count -eq 0) {
        throw 'No llama.cpp build (bNNNNN) among the latest releases.'
    }

    foreach ($build in $builds) {
        $options = @(Get-LlamaBackendOptions -Assets $build.Release.assets -Backend $Backend)
        if ($options.Count -gt 0) {
            return [pscustomobject]@{ Tag = $build.Release.tag_name; Options = $options }
        }
    }

    throw "No '$Backend' build among the latest llama.cpp builds (newest: $($builds[0].Release.tag_name))."
}

Export-ModuleMember -Function Select-LlamaBuild
