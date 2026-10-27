function Get-AssetSha256 {
    param([object]$Asset)

    if ($null -eq $Asset.digest) {
        return $null
    }
    if ($Asset.digest -match '^sha256:([0-9a-f]{64})$') {
        return $Matches[1].ToLowerInvariant()
    }
    throw "Unknown checksum format for $($Asset.name): $($Asset.digest)"
}

Export-ModuleMember -Function Get-AssetSha256
