function Assert-FileSha256 {
    param([string]$Path, [string]$Expected, [string]$Name)

    if (-not $Expected) {
        return
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) {
        throw "Checksum of $Name does not match the digest published with the release."
    }
}

Export-ModuleMember -Function Assert-FileSha256
