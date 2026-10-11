param([Parameter(Mandatory = $true)][string]$DataPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$targetPath = [IO.Path]::GetFullPath($DataPath).TrimEnd('\')
$userDirectory = [Environment]::GetFolderPath('UserProfile').TrimEnd('\')
if ($targetPath -eq [IO.Path]::GetPathRoot($targetPath).TrimEnd('\') -or $targetPath -eq $userDirectory -or $projectRoot -eq $targetPath -or $projectRoot.StartsWith($targetPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Choose a dedicated Leadrove data directory, not a drive, user, or project directory.'
}
foreach ($publicPath in @('public', 'dist', 'node_modules', '.git', '.runtime')) {
  $restricted = Join-Path $projectRoot $publicPath
  if ($targetPath -eq $restricted -or $targetPath.StartsWith($restricted + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'The data directory cannot be inside public assets or tooling.' }
}
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
if ((Get-Item -LiteralPath $targetPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Use a real data directory, not a junction or symbolic link.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $principal = New-Object Security.Principal.SecurityIdentifier($sid)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
# Change the DACL only; changing auditing rules would require admin privileges.
[IO.Directory]::SetAccessControl($targetPath, $acl)
