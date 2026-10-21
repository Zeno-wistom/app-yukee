$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $projectRoot 'data\tracker\vendor'
$wasm = Join-Path $vendor 'wasm'
New-Item -ItemType Directory -Force -Path $vendor,$wasm | Out-Null
$version = '0.10.32'
$baseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$version"
$files = @(
  @{ Url="$baseUrl/vision_bundle.mjs"; File=(Join-Path $vendor 'vision_bundle.mjs') },
  @{ Url="$baseUrl/wasm/vision_wasm_internal.js"; File=(Join-Path $wasm 'vision_wasm_internal.js') },
  @{ Url="$baseUrl/wasm/vision_wasm_internal.wasm"; File=(Join-Path $wasm 'vision_wasm_internal.wasm') },
  @{ Url="$baseUrl/wasm/vision_wasm_nosimd_internal.js"; File=(Join-Path $wasm 'vision_wasm_nosimd_internal.js') },
  @{ Url="$baseUrl/wasm/vision_wasm_nosimd_internal.wasm"; File=(Join-Path $wasm 'vision_wasm_nosimd_internal.wasm') },
  @{ Url="$baseUrl/vision_bundle.mjs.map"; File=(Join-Path $vendor 'vision_bundle.mjs.map') },
  @{ Url='https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE'; File=(Join-Path $vendor 'LICENSE') },
  @{ Url='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'; File=(Join-Path $vendor 'face_landmarker.task') }
)
foreach ($item in $files) {
  if (!(Test-Path -LiteralPath $item.File)) {
    Write-Output ('Downloading ' + [IO.Path]::GetFileName($item.File))
    Invoke-WebRequest -Uri $item.Url -OutFile ($item.File + '.part') -TimeoutSec 180
    Move-Item -LiteralPath ($item.File + '.part') -Destination $item.File
  }
}
Write-Output 'Camera model and runtime are ready for offline use.'
