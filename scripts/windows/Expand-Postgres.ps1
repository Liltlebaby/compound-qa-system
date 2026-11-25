param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.postgres'))
$qaArchive = [IO.Path]::GetFullPath($Archive)
$qaDestination = [IO.Path]::GetFullPath($Destination)
if (-not $qaArchive.StartsWith($qaRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $qaDestination.StartsWith($qaRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected PostgreSQL setup path.' }
if (Test-Path -LiteralPath $qaDestination) { throw 'Extraction directory already exists. Review .postgres/unpacked before retrying.' }
Expand-Archive -LiteralPath $qaArchive -DestinationPath $qaDestination
