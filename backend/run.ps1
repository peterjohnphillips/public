# Starts the FastAPI dev server on port 8000 with auto-reload.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Creating one and installing dependencies..."
    python -m venv (Join-Path $PSScriptRoot "..\.venv")
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
}

& $venvPython -m uvicorn app.main:app --reload --port 8000
