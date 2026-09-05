# Opens the backend and frontend dev servers in separate windows.
$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-File", (Join-Path $root "backend\run.ps1")
Start-Process powershell -ArgumentList "-NoExit", "-File", (Join-Path $root "frontend\run.ps1")

Write-Host "Backend starting on http://localhost:8000"
Write-Host "Frontend starting on http://localhost:5173"
