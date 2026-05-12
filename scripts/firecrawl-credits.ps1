# Monitoring interne des crédits Firecrawl.
# Usage : pwsh -ExecutionPolicy Bypass -File .\scripts\firecrawl-credits.ps1

[CmdletBinding()]
param(
  [string]$EnvPath = ".env.local"
)

$ErrorActionPreference = "Stop"
$Endpoint = "https://api.firecrawl.dev/v2/team/credit-usage"

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }

    $name, $rawValue = $trimmed.Split("=", 2)
    $value = $rawValue.Trim().Trim('"').Trim("'")
    if ($name.Trim()) {
      $values[$name.Trim()] = $value
    }
  }

  return $values
}

function Split-SecretList {
  param([string]$Value)

  if (-not $Value) {
    return @()
  }

  return $Value -split "[,;`n]" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

function Get-ConfigValue {
  param(
    [hashtable]$DotEnv,
    [string]$Name
  )

  if ($DotEnv.ContainsKey($Name) -and $DotEnv[$Name]) {
    return $DotEnv[$Name]
  }

  return [Environment]::GetEnvironmentVariable($Name, "Process") ??
    [Environment]::GetEnvironmentVariable($Name, "User") ??
    [Environment]::GetEnvironmentVariable($Name, "Machine")
}

function Get-CreditValue {
  param($Response)

  $candidates = @(
    $Response.remainingCredits,
    $Response.remaining_credits,
    $Response.creditsRemaining,
    $Response.credits_remaining,
    $Response.availableCredits,
    $Response.available_credits,
    $Response.data.remainingCredits,
    $Response.data.remaining_credits,
    $Response.data.creditsRemaining,
    $Response.data.credits_remaining,
    $Response.data.availableCredits,
    $Response.data.available_credits
  )

  foreach ($candidate in $candidates) {
    if ($null -ne $candidate) {
      return $candidate
    }
  }

  $limit = $Response.limit ?? $Response.creditLimit ?? $Response.data.limit ?? $Response.data.creditLimit
  $used = $Response.used ?? $Response.creditsUsed ?? $Response.data.used ?? $Response.data.creditsUsed
  if ($null -ne $limit -and $null -ne $used) {
    return [math]::Max(0, [double]$limit - [double]$used)
  }

  return $null
}

$dotEnv = Read-DotEnv -Path $EnvPath

$keys = @()
$keys += Split-SecretList (Get-ConfigValue -DotEnv $dotEnv -Name "FIRECRAWL_API_KEYS")
$singleKey = Get-ConfigValue -DotEnv $dotEnv -Name "FIRECRAWL_API_KEY"
if ($singleKey) {
  $keys += $singleKey
}

for ($i = 1; $i -le 20; $i++) {
  $key = Get-ConfigValue -DotEnv $dotEnv -Name "FIRECRAWL_API_KEY_$i"
  if ($key) {
    $keys += $key
  }
}

$keys = $keys | Select-Object -Unique
$emails = Split-SecretList (Get-ConfigValue -DotEnv $dotEnv -Name "FIRECRAWL_API_KEY_EMAILS")

if (-not $keys -or $keys.Count -eq 0) {
  Write-Error "Aucune clé Firecrawl trouvée dans $EnvPath ou dans les variables d'environnement."
  exit 1
}

for ($index = 0; $index -lt $keys.Count; $index++) {
  $apiKey = $keys[$index]
  $accountNumber = $index + 1
  $email = Get-ConfigValue -DotEnv $dotEnv -Name "FIRECRAWL_API_KEY_EMAIL_$accountNumber"
  if (-not $email -and $index -lt $emails.Count) {
    $email = $emails[$index]
  }
  if (-not $email) {
    $email = "email non renseigné"
  }

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Endpoint -Headers @{
      Authorization = "Bearer $apiKey"
    } -TimeoutSec 20

    $remaining = Get-CreditValue -Response $response
    if ($null -eq $remaining) {
      Write-Host "Compte Firecrawl $accountNumber ($email) : crédits restants non détectés dans la réponse API"
    } else {
      Write-Host "Compte Firecrawl $accountNumber ($email) : $remaining crédits restants"
    }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status) {
      Write-Host "Compte Firecrawl $accountNumber ($email) : erreur API HTTP $status"
    } else {
      Write-Host "Compte Firecrawl $accountNumber ($email) : erreur réseau/API - $($_.Exception.Message)"
    }
  }
}
