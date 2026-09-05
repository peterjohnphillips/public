# Starts the Vite dev server on port 5173.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Host "node_modules not found. Running npm install..."
    npm install
}

npm run dev
