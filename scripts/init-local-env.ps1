#requires -Version 5.1
# Creates local-only credentials. Never overwrites an existing environment file.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function New-SecureHex {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) }
    finally { $random.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Write-IfMissing([string]$name, [string]$content) {
    $path = Join-Path $root $name
    if (Test-Path -LiteralPath $path) {
        Write-Host ("Preserved existing " + $name)
        return
    }
    # CreateNew avoids overwriting credentials even if two scripts run at once.
    $stream = [System.IO.File]::Open($path,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None)
    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        $bytes = $utf8.GetBytes($content.Trim() + [Environment]::NewLine)
        $stream.Write($bytes, 0, $bytes.Length)
    }
    finally { $stream.Dispose() }
    Write-Host ("Created " + $name + " (Git ignored)")
}

if (-not (Test-Path -LiteralPath (Join-Path $root '.env.commercial.local'))) {
    $mysqlPassword = New-SecureHex
    $mysqlRootPassword = New-SecureHex
    $resultsKey = New-SecureHex
    $processorToken = New-SecureHex

    $backend = @"
# DeAIfy LOCAL ONLY. Never copy credentials to production.
MYSQL_MODE=bundled
FRONTEND_ORIGIN=http://localhost:5173
API_PUBLIC_ORIGIN=http://127.0.0.1:18088
API_BIND_PORT=18088

MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=deaify
MYSQL_USER=deaify
MYSQL_PASSWORD=$mysqlPassword
MYSQL_ROOT_PASSWORD=$mysqlRootPassword
MYSQL_SSL_MODE=disabled

RESULT_ENCRYPTION_KEY_HEX=$resultsKey
PROCESSOR_SHARED_TOKEN=$processorToken
FREE_USES_PER_DAY=5
TRUSTED_PROXY_CIDRS=

REGISTRATION_ENABLED=false
RECOVERY_ENABLED=false
PAYMENTS_ENABLED=false
MERCHANT_APPROVED=false
"@
    Write-IfMissing '.env.commercial.local' $backend
}
else {
    Write-Host 'Preserved existing .env.commercial.local'
}

$frontend = @'
# Development-only public API origin. No private credentials belong in VITE_*.
VITE_COMMERCIAL_API_URL=http://127.0.0.1:18088
'@
Write-IfMissing '.env.development.local' $frontend
Write-Host 'Local environment ready. See docs/environments.md for Docker commands.'
