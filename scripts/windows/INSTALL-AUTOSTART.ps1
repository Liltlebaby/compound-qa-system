#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$qaRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$qaEntry = Join-Path $qaRoot 'dist\server-tools.mjs'
$qaNode = Join-Path $qaRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $qaNode)) { $qaNode = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $qaEntry -PathType Leaf)) { throw 'Server entrypoint not found.' }
$qaTaskName = 'COMPOUND-QA-Server'
$qaExisting = Get-ScheduledTask -TaskName $qaTaskName -ErrorAction SilentlyContinue
if ($qaExisting -and $qaExisting.Actions[0].WorkingDirectory -ne $qaRoot) {
    throw 'A different COMPOUND-QA-Server task already exists. Review it in Task Scheduler first.'
}
$qaAction = New-ScheduledTaskAction -Execute $qaNode -Argument ('"' + $qaEntry + '" serve') -WorkingDirectory $qaRoot
$qaTrigger = New-ScheduledTaskTrigger -AtStartup
$qaPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$qaSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $qaTaskName -Action $qaAction -Trigger $qaTrigger -Principal $qaPrincipal -Settings $qaSettings -Force | Out-Null
Write-Host 'Installed COMPOUND-QA-Server. It will run as SYSTEM at Windows startup.'
Write-Host 'Keep this folder at its current path. Use Task Scheduler to start or stop the task.'
