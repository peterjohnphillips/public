# Builds the single-file static app into docs/ for GitHub Pages.
#
#   1. Re-parse content/ into frontend/src/generated/content.json.
#   2. Bundle the React app + inlined in-browser backend into one docs/index.html.
#
# GitHub Pages: Settings -> Pages -> Deploy from branch -> main / docs.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

python "$root/scripts/build_content.py"

Push-Location "$root/frontend"
try {
    npm install
    npm run build
}
finally {
    Pop-Location
}

Write-Host "`nBuilt $root/docs/index.html" -ForegroundColor Green
