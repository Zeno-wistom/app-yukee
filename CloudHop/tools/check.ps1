$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1')
$jdk='C:\Program Files\Processing\app\resources\jdk\bin'
$core='C:\Program Files\Processing\app\resources\core\library\core-4.5.6.jar'
$build=Join-Path $projectRoot 'build'
$classpath=$build+';'+$core
& (Join-Path $jdk 'javac.exe') '-J-Dfile.encoding=UTF-8' -encoding UTF-8 -cp $core -d $build (Join-Path $build 'CloudHop.java') (Join-Path $projectRoot 'checks\GameChecks.java') (Join-Path $projectRoot 'checks\BridgeChecks.java') (Join-Path $projectRoot 'checks\FlowChecks.java')
if($LASTEXITCODE -ne 0){throw 'Test compilation failed'}
Push-Location $projectRoot
try {
  & (Join-Path $jdk 'java.exe') '-Dfile.encoding=UTF-8' -cp $classpath GameChecks
  if($LASTEXITCODE -ne 0){throw 'Game checks failed'}
  & (Join-Path $jdk 'java.exe') '-Dfile.encoding=UTF-8' -cp $classpath BridgeChecks
  if($LASTEXITCODE -ne 0){throw 'Bridge checks failed'}
  & (Join-Path $jdk 'java.exe') '-Dfile.encoding=UTF-8' -cp $classpath FlowChecks
  if($LASTEXITCODE -ne 0){throw 'Interaction checks failed'}
}finally{Pop-Location}
$node=Get-Command node -ErrorAction SilentlyContinue
if($node){& $node.Source (Join-Path $projectRoot 'checks\pose-control.test.mjs');if($LASTEXITCODE -ne 0){throw 'Pose checks failed'}}
