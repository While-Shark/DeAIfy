#requires -Version 5.1
# Generates local-only random credentials and passes them to an opt-in seed.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$file = Join-Path $root '.env.demo-users.local'

if (-not (Test-Path -LiteralPath (Join-Path $root '.env.commercial.local'))) {
    throw 'Local backend config missing. Run init-local-env.ps1 first.'
}

if (-not (Test-Path -LiteralPath $file)) {
    $lines = @('# Generated LOCAL-ONLY demo logins. Never copy to production or commit.')
    foreach ($i in 1..3) {
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $password = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $lines += 'DEMO_' + $i + '_EMAIL=demo' + $i + '@local.test'
        $lines += 'DEMO_' + $i + '_PASSWORD=' + $password
    }
    $stream = [System.IO.File]::Open($file,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None)
    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($lines -join [Environment]::NewLine))
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    Write-Host 'Generated .env.demo-users.local (Git-ignored; passwords not printed).'
}

$values = @{}
foreach ($line in (Get-Content -LiteralPath $file)) {
    if ($line -match '^([A-Z0-9_]+)=([a-z0-9@.]+)$') {
        $values[$matches[1]] = $matches[2]
    }
}
foreach ($i in 1..3) {
    if ($values['DEMO_' + $i + '_EMAIL'] -ne ('demo' + $i + '@local.test') -or
        $values['DEMO_' + $i + '_PASSWORD'] -notmatch '^[a-f0-9]{64}$') {
        throw 'Invalid local demo credentials file'
    }
}

try {
    foreach ($i in 1..3) {
        [Environment]::SetEnvironmentVariable(
            'DEMO_' + $i + '_PASSWORD', $values['DEMO_' + $i + '_PASSWORD'], 'Process')
    }
    $env:LOCAL_DEMO_SEED_ENABLED = '1'
    Push-Location $root
    try {
        $dc = @('--env-file', '.env.commercial.local',
            '-f', 'docker-compose.commercial.yml', '-f', 'docker-compose.local.yml')
        docker compose @dc run --rm --no-deps -e LOCAL_DEMO_SEED_ENABLED -e DEMO_1_PASSWORD -e DEMO_2_PASSWORD -e DEMO_3_PASSWORD api node dist/scripts/seedLocalDemoUsers.js
        if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed (no existing users modified)' }
    } finally { Pop-Location }
} finally {
    Remove-Item Env:\LOCAL_DEMO_SEED_ENABLED -ErrorAction SilentlyContinue
    foreach ($i in 1..3) { Remove-Item ('Env:\DEMO_' + $i + '_PASSWORD') -ErrorAction SilentlyContinue }
}
Write-Host 'Demo accounts ready; credentials are in .env.demo-users.local.'
