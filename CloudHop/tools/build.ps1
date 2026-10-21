param([switch]$Run, [string]$Capture = '', [string]$Scene = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$processingRoot = 'C:\Program Files\Processing'
if (!(Test-Path -LiteralPath $processingRoot)) { throw 'Processing not found. Open CloudHop.pde in Processing 4 instead.' }
$jdk = Join-Path $processingRoot 'app\resources\jdk\bin'
$core = Get-ChildItem -LiteralPath (Join-Path $processingRoot 'app\resources\core\library') -Filter 'core*.jar' | Select-Object -First 1
$build = Join-Path $projectRoot 'build'
New-Item -ItemType Directory -Force -Path $build | Out-Null
$main = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot 'CloudHop.pde')
$imports = [regex]::Matches($main, '(?m)^import .+;\r?$') | ForEach-Object { $_.Value }
$main = [regex]::Replace($main, '(?m)^import .+;\r?\n', '')
$extra = (Get-ChildItem -LiteralPath $projectRoot -Filter '*.pde' | Where-Object { $_.Name -ne 'CloudHop.pde' } | Sort-Object Name | ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }) -join "`n"
$source = "import processing.core.*;`nimport processing.data.*;`nimport java.util.*;`n" + ($imports -join "`n") + "`npublic class CloudHop extends PApplet {`n" + $main + "`n" + $extra + "`npublic static void main(String[] args) { PApplet.main(CloudHop.class.getName()); }`n}"
[IO.File]::WriteAllText((Join-Path $build 'CloudHop.java'), $source, [Text.UTF8Encoding]::new($false))
& (Join-Path $jdk 'javac.exe') '-J-Dfile.encoding=UTF-8' -encoding UTF-8 -cp $core.FullName -d $build (Join-Path $build 'CloudHop.java')
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
Write-Output 'Processing game compiled successfully.'
if ($Run) {
  Push-Location $projectRoot
  try {
    $javaArgs = @('-Dfile.encoding=UTF-8', '-cp', ($build + ';' + $core.FullName))
    if ($Capture) { $javaArgs += '-Dcloudhop.capture=' + $Capture }
    if ($Scene) { $javaArgs += '-Dcloudhop.scene=' + $Scene }
    $javaArgs += 'CloudHop'
    & (Join-Path $jdk 'java.exe') @javaArgs
  } finally { Pop-Location }
}
