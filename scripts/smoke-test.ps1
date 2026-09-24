param([switch]$RestartApi, [string]$ApiUrl = 'http://localhost:3001')
$ErrorActionPreference = 'Stop'

$health = Invoke-RestMethod "$ApiUrl/health" -TimeoutSec 10
if ($health.database -ne 'ok') { throw 'API database health failed. Rebuild the API container first.' }
$collection = Invoke-RestMethod "$ApiUrl/api/v1/session" -SessionVariable footyiqSession -TimeoutSec 10
$shotId = [guid]::NewGuid().ToString()
$body = @{ id = $shotId; x = 108; y = 40 } | ConvertTo-Json
$saved = Invoke-RestMethod "$ApiUrl/api/v1/shots" -Method Post -ContentType 'application/json' -Body $body -WebSession $footyiqSession -TimeoutSec 15
if ($saved.id -ne $shotId -or $saved.distance_yards -ne 12 -or $saved.xg_probability -lt 0 -or $saved.xg_probability -gt 1) {
  throw 'Saved shot response did not match the request.'
}
if ($saved.model_id -ne 'context-boosted-30k-v1') { throw 'Rebuild the API and ML containers: unexpected serving model.' }
if ($saved.context.body_part -ne 'Right Foot' -or $saved.context.technique -ne 'Normal') { throw 'Default shot context was not persisted.' }
$retry = Invoke-RestMethod "$ApiUrl/api/v1/shots" -Method Post -ContentType 'application/json' -Body $body -WebSession $footyiqSession -TimeoutSec 15
if ($retry.id -ne $saved.id -or $retry.created_at -ne $saved.created_at) { throw 'Retry was not idempotent.' }

if ($RestartApi) {
  docker compose restart api
  if ($LASTEXITCODE -ne 0) { throw 'Container restart failed.' }
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $health = Invoke-RestMethod "$ApiUrl/health" -TimeoutSec 2
      if ($health.database -eq 'ok') { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'API did not become ready after restart.' }
}

$history = Invoke-RestMethod "$ApiUrl/api/v1/shots?limit=50" -WebSession $footyiqSession -TimeoutSec 10
$matches = @($history.shots | Where-Object { $_.id -eq $shotId })
if ($matches.Count -ne 1) { throw 'Expected exactly one saved shot in recent history.' }
if ($matches[0].model_id -ne $saved.model_id) { throw 'Saved model identity was not preserved.' }
Write-Output "PASS: saved shot $shotId, model $($saved.model_id), safe retry, and history retrieval."
if ($RestartApi) { Write-Output 'PASS: saved shot survived API container restart.' }
Write-Output "The smoke-test shot remains in its separate test collection: $($collection.collection_id)"
