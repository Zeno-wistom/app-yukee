$ErrorActionPreference = 'Stop'
$target = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\ui'
New-Item -ItemType Directory -Force -Path $target | Out-Null
$icons = @{
 'power.png'='https://www.figma.com/api/mcp/asset/9336c417-73b1-4e5b-8d50-cca497a0ccc0.png'
 'arrow.png'='https://www.figma.com/api/mcp/asset/5c261ee9-b712-4d47-8276-a36888c0f9ea.png'
 'back.png'='https://www.figma.com/api/mcp/asset/f385e1c8-1a85-4b64-801c-1df3aca59c13.png'
 'play.png'='https://www.figma.com/api/mcp/asset/c948ec11-6f63-40bc-89c5-01a0a0bf15df.png'
 'pause.png'='https://www.figma.com/api/mcp/asset/420c8ec7-84c4-4b93-86cf-44e8007099f6.png'
}
foreach($name in $icons.Keys) {
 Invoke-WebRequest -Uri $icons[$name] -OutFile (Join-Path $target $name) -TimeoutSec 60
}
Write-Output 'Figma interface icons downloaded.'
