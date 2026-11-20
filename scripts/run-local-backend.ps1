$ErrorActionPreference = 'Stop'
$env:HTS_LOCAL_DEV = 'true'
$env:DJANGO_DEBUG = 'true'
$env:USE_SQLITE = 'true'

Push-Location (Join-Path $PSScriptRoot '..\server')
try {
    python manage.py migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    python manage.py runserver 127.0.0.1:8000
} finally {
    Pop-Location
}
