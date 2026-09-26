# Requires Docker Desktop. Reads production; restores only into a fresh local container.
$ErrorActionPreference = 'Stop'
Get-Command docker -ErrorAction Stop | Out-Null
$backupDirectory = Join-Path $env:LOCALAPPDATA ('FootyIQ\backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
$containerName = 'footyiq-restore-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$previousDatabase = $env:PGDATABASE
$previousPassword = $env:POSTGRES_PASSWORD
$created = $false
function Assert-DockerSuccess([string]$Operation) {
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed. The backup directory is retained for inspection." }
}
try {
    $secureConnection = Read-Host 'Paste the Neon production TLS connection string (hidden)' -AsSecureString
    $env:PGDATABASE = [System.Net.NetworkCredential]::new('', $secureConnection).Password
    if ($env:PGDATABASE -notmatch '^postgres(?:ql)?://' -or $env:PGDATABASE -notmatch 'sslmode=(require|verify-full)') {
        throw 'Expected a PostgreSQL connection string with TLS required.'
    }
    docker run --rm -e PGDATABASE -v "${backupDirectory}:/backup" postgres:18 pg_dump --format=custom --no-owner --no-acl --file=/backup/footyiq.dump
    Assert-DockerSuccess 'Neon backup'
    $env:PGDATABASE = $null
    $env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
    docker run -d --name $containerName -e POSTGRES_PASSWORD -e POSTGRES_DB=footyiq_restore -v "${backupDirectory}:/backup:ro" postgres:18 | Out-Null
    Assert-DockerSuccess 'Create isolated restore container'
    $created = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        docker exec $containerName pg_isready -U postgres -d footyiq_restore *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Restore database did not become ready.' }
    docker exec $containerName pg_restore -U postgres -d footyiq_restore --exit-on-error --single-transaction --no-owner --no-acl /backup/footyiq.dump
    Assert-DockerSuccess 'Restore archive'
    docker exec $containerName psql -U postgres -d footyiq_restore -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS restored_shots FROM shots; SELECT version FROM schema_migrations ORDER BY version;'
    Assert-DockerSuccess 'Read restored tables'
    Write-Output "PASS: Neon archive restored into a separate local PostgreSQL 18 database. Backup retained at $backupDirectory"
    Write-Output 'Keep this backup private: it contains saved shots and collection identifiers. Never commit it.'
} finally {
    $env:PGDATABASE = $previousDatabase
    $env:POSTGRES_PASSWORD = $previousPassword
    if ($created) {
        # Only the uniquely named container created by this run; production is untouched.
        docker rm -f -v $containerName | Out-Null
    }
}
