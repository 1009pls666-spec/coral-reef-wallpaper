param([switch]$Unattended)
$ErrorActionPreference = "Stop"

$SourceDir = Join-Path $PSScriptRoot "CoralReefWallpaper"
$TargetDir = Join-Path $env:LOCALAPPDATA "Programs\CoralReefWallpaper"
$Executable = Join-Path $TargetDir "CoralReefWallpaper.exe"
$ProgramsDir = [Environment]::GetFolderPath("Programs")
$MenuShortcut = Join-Path $ProgramsDir "나의 산호초 바탕화면.lnk"

try {
  if (-not (Test-Path (Join-Path $SourceDir "CoralReefWallpaper.exe"))) {
    throw "설치 앱을 찾지 못했습니다: $SourceDir"
  }
  Write-Host "나의 산호초 바탕화면을 설치하고 있습니다..."
  Get-Process "CoralReefWallpaper" -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 700
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  Get-ChildItem $TargetDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $SourceDir "*") $TargetDir -Recurse -Force
  Get-ChildItem $TargetDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

  $Shell = New-Object -ComObject WScript.Shell
  $Menu = $Shell.CreateShortcut($MenuShortcut)
  $Menu.TargetPath = $Executable
  $Menu.Arguments = "--editor"
  $Menu.WorkingDirectory = $TargetDir
  $Menu.IconLocation = "$Executable,0"
  $Menu.Save()

  Start-Process -FilePath $Executable -ArgumentList "--install-wallpaper"
  Write-Host ""
  Write-Host "설치 완료! 바탕화면이 실행되었고 로그인 시 자동으로 시작됩니다."
  Write-Host "편집: Ctrl + Shift + E"
  Write-Host "일시정지/재생: Ctrl + Shift + Space"
} catch {
  Write-Error $_
  if (-not $Unattended) { Read-Host "오류 내용을 확인한 뒤 Enter 키를 누르세요" }
  exit 1
}
if (-not $Unattended) { Read-Host "창을 닫으려면 Enter 키를 누르세요" }
