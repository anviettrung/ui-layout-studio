# Kiểm chứng importer UI Layout Studio bằng Unity thật (batchmode).
# Chạy: powershell -ExecutionPolicy Bypass -File unity-verify\run.ps1
# Xem unity-verify\README.md.
[CmdletBinding()]
param(
    [string]$UnityPath = 'C:\Program Files\Unity\Hub\Editor\6000.3.10f1\Editor\Unity.exe',
    [string]$ProjectPath = 'E:\Work\_tmp\uls-verify',
    # Thư mục Runtime của NotchSolution để kiểm với SafePadding thật. Không có thì dùng component giả lập.
    [string]$NotchSolutionPath = $env:ULS_NOTCH_RUNTIME,
    [switch]$NoNotch,
    # Xoá project tạm và tạo lại từ đầu (lâu hơn vì phải dựng lại Library).
    [switch]$Clean
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$package = Join-Path $repo 'unity\com.anviettrung.ui-layout-studio'
$fixture = Join-Path $here 'fixture'

if (-not (Test-Path $UnityPath)) { throw "Không thấy Unity: $UnityPath" }
if ($Clean -and (Test-Path $ProjectPath)) { Remove-Item -Recurse -Force $ProjectPath }

# 1. Project tạm: manifest trỏ package qua file:
foreach ($d in 'Assets', 'Packages', 'ProjectSettings') { New-Item -ItemType Directory -Force (Join-Path $ProjectPath $d) | Out-Null }
$pkgUri = ($package -replace '\\', '/')
$manifest = @"
{
  "dependencies": {
    "com.anviettrung.ui-layout-studio": "file:$pkgUri",
    "com.unity.ugui": "2.0.0",
    "com.unity.modules.imgui": "1.0.0",
    "com.unity.modules.ui": "1.0.0",
    "com.unity.modules.uielements": "1.0.0",
    "com.unity.modules.imageconversion": "1.0.0",
    "com.unity.modules.animation": "1.0.0"
  }
}
"@
[IO.File]::WriteAllText((Join-Path $ProjectPath 'Packages\manifest.json'), $manifest)
$verFile = Join-Path $ProjectPath 'ProjectSettings\ProjectVersion.txt'
if (-not (Test-Path $verFile)) { [IO.File]::WriteAllText($verFile, "m_EditorVersion: 6000.3.10f1`n") }

# 2. Chép script test (và NotchSolution nếu có), dọn kết quả lần trước.
$assets = Join-Path $ProjectPath 'Assets'
foreach ($p in 'ULSVerify', 'UI', 'Plugins\NotchSolution') {
    $full = Join-Path $assets $p
    if (Test-Path $full) { Remove-Item -Recurse -Force $full }
    if (Test-Path "$full.meta") { Remove-Item -Force "$full.meta" }
}
$verifyData = Join-Path $ProjectPath 'VerifyData'
if (Test-Path $verifyData) { Remove-Item -Recurse -Force $verifyData }
New-Item -ItemType Directory -Force (Join-Path $assets 'ULSVerify') | Out-Null
Copy-Item -Recurse (Join-Path $here 'Editor') (Join-Path $assets 'ULSVerify\Editor')
Copy-Item -Recurse (Join-Path $here 'Runtime') (Join-Path $assets 'ULSVerify\Runtime')
if (-not $NoNotch -and $NotchSolutionPath -and (Test-Path $NotchSolutionPath)) {
    New-Item -ItemType Directory -Force (Join-Path $assets 'Plugins\NotchSolution') | Out-Null
    Copy-Item -Recurse $NotchSolutionPath (Join-Path $assets 'Plugins\NotchSolution\Runtime')
    Write-Host "Dùng NotchSolution thật từ $NotchSolutionPath"
} else {
    Write-Host 'Không dùng NotchSolution: SafeArea kiểm bằng component giả lập.'
}

function Invoke-Unity([string]$method, [string[]]$extra, [string]$log) {
    $argList = @('-batchmode', '-nographics', '-projectPath', "`"$ProjectPath`"", '-executeMethod', $method, '-logFile', "`"$log`"") + $extra
    # Không dùng -Wait: nó chờ cả tiến trình con Unity để lại (shader compiler, licensing) nên có thể treo.
    $p = Start-Process -FilePath $UnityPath -ArgumentList $argList -PassThru -NoNewWindow
    $null = $p.Handle # giữ handle để đọc được ExitCode sau khi thoát
    $p.WaitForExit()
    return $p.ExitCode
}

$logs = Join-Path $ProjectPath 'Logs'
New-Item -ItemType Directory -Force $logs | Out-Null

# 3. Chuẩn bị (import TMP Essential Resources nếu thiếu).
Write-Host 'Unity: chuẩn bị project…'
$code = Invoke-Unity 'ULSVerify.ULSVerifyRunner.Setup' @() (Join-Path $logs 'uls-setup.log')
if ($code -ne 0) {
    Get-Content (Join-Path $logs 'uls-setup.log') -Tail 60 -Encoding UTF8
    throw "Bước chuẩn bị lỗi (exit $code). Log: $logs\uls-setup.log"
}

# 4. Kiểm chứng.
Write-Host 'Unity: chạy kiểm chứng…'
$report = Join-Path $ProjectPath 'VerifyData\report.txt'
$runLog = Join-Path $logs 'uls-run.log'
$code = Invoke-Unity 'ULSVerify.ULSVerifyRunner.Run' @('-ulsFixture', "`"$fixture`"", '-ulsReport', "`"$report`"") $runLog
if (Test-Path $report) {
    Get-Content $report -Encoding UTF8
} else {
    Get-Content $runLog -Tail 80 -Encoding UTF8
    Write-Host 'Không có báo cáo: xem lỗi biên dịch/ngoại lệ trong log ở trên.'
}
Write-Host ''
Write-Host "Log Unity: $runLog"
Write-Host "Báo cáo: $report"
exit $code
