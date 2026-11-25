#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$qaNode = Join-Path $qaRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $qaNode)) { $qaNode = (Get-Command node.exe -ErrorAction Stop).Source }
$qaPort = 3000
$qaEnv = Join-Path $qaRoot '.env.production.local'
if (Test-Path -LiteralPath $qaEnv) {
  $qaPortLine = Get-Content -LiteralPath $qaEnv | Where-Object { $_ -match '^QA_PORT=' } | Select-Object -First 1
  if ($qaPortLine) { $qaPort = [int](($qaPortLine -split '=',2)[1].Trim('"')) }
}
if ($qaPort -lt 1024 -or $qaPort -gt 65535) { throw 'Invalid QA_PORT.' }
$qaName = 'COMPOUND-QA-Server-LAN'
$qaExisting = Get-NetFirewallRule -Name $qaName -ErrorAction SilentlyContinue
if ($qaExisting) {
  $qaProgram = ($qaExisting | Get-NetFirewallApplicationFilter).Program
  if ($qaProgram -ne $qaNode) { throw 'Firewall rule belongs to a different installation.' }
  Set-NetFirewallRule -Name $qaName -Enabled True -Profile Private -RemoteAddress LocalSubnet
  $qaExisting | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $qaPort
} else {
  New-NetFirewallRule -Name $qaName -DisplayName 'COMPOUND QA server (factory LAN)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $qaPort -Program $qaNode -Profile Private -RemoteAddress LocalSubnet | Out-Null
}
Write-Host ('Allowed QA web port ' + $qaPort + ' on Private factory LAN only. PostgreSQL remains local.')
