$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script as Administrator to allow mobile devices on the same local subnet.'
}
$name = 'COMPOUND-QA-Mobile-Preview'
$nodeProgram = (Get-Command node -ErrorAction Stop).Source
$existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Private,Public
    Get-NetFirewallPortFilter -AssociatedNetFirewallRule $existing | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 5173
    Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $existing | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet
    Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $existing | Set-NetFirewallApplicationFilter -Program $nodeProgram
} else {
    New-NetFirewallRule -Name $name -DisplayName 'COMPOUND QA Mobile Preview' -Direction Inbound -Action Allow -Enabled True -Profile Private,Public -Protocol TCP -LocalPort 5173 -RemoteAddress LocalSubnet -Program $nodeProgram | Out-Null
}
$rule = Get-NetFirewallRule -Name $name
[pscustomobject]@{
    Name = $rule.Name
    Enabled = [string]$rule.Enabled
    Action = [string]$rule.Action
    Profile = [string]$rule.Profile
    Port = (Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule).LocalPort
    RemoteAddress = (Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule).RemoteAddress
    Program = (Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule).Program
} | ConvertTo-Json
