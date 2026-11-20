$ErrorActionPreference = 'Stop'
$env:VITE_LOCAL_DEV = 'true'
$env:VITE_API_URL = 'http://127.0.0.1:8000'

Push-Location (Join-Path $PSScriptRoot '..\client')
try {
    npm run dev -- --host 127.0.0.1 --port 5173
} finally {
    Pop-Location
}
