param([string[]]$Scenes=@('dashboard','select','detail','choice','records','calibrate','play','pause','quit','win','drink','emotion','light','sound'))
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1')
$java='C:\Program Files\Processing\app\resources\jdk\bin\java.exe'
$core='C:\Program Files\Processing\app\resources\core\library\core-4.5.6.jar'
$cp=(Join-Path $projectRoot 'build')+';'+$core
$out=Join-Path $projectRoot 'checks\v2'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Push-Location $projectRoot
try{
 foreach($scene in $Scenes){
  $image=Join-Path $out ($scene+'.png')
  & $java '-Dfile.encoding=UTF-8' ('-Dcloudhop.capture='+$image) ('-Dcloudhop.scene='+$scene) -cp $cp CloudHop
  if($LASTEXITCODE -ne 0){throw ('Capture failed: '+$scene)}
  Write-Output ('Captured '+$scene)
 }
}finally{Pop-Location}
