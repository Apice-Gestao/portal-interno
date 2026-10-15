[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$NoBrowser,
    [ValidateRange(5, 60)]
    [int]$TimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$webUrl = 'http://127.0.0.1:5173/'
$apiUrl = 'http://127.0.0.1:3001/api/v1/health'
$startupMutex = $null
$ownsMutex = $false
$launcherDirectory = $null
$process = $null
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

function Stop-PortalLaunch([string]$Message) {
    $failure = [System.InvalidOperationException]::new($Message)
    $failure.Data['PortalFriendly'] = $true
    throw $failure
}

function Get-RemainingMilliseconds {
    return [Math]::Max(0, [int][Math]::Floor(($deadline - [DateTime]::UtcNow).TotalMilliseconds))
}

function Write-LauncherEvent([string]$Message) {
    if ($launcherDirectory) {
        $entry = '{0} {1}' -f [DateTime]::UtcNow.ToString('o'), $Message
        Add-Content -LiteralPath (Join-Path $launcherDirectory 'launcher.log') -Value $entry -Encoding UTF8
    }
}

function Test-ProjectProcess([int]$ProcessId, [string]$ExpectedScript) {
    $visited = @{}
    for ($depth = 0; $depth -lt 8 -and $ProcessId -gt 0; $depth++) {
        if ($visited.ContainsKey($ProcessId)) { return $false }
        $visited[$ProcessId] = $true
        $processInfo = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if (-not $processInfo) { return $false }
        $commandLine = [string]$processInfo.CommandLine
        $normalizedCommand = $commandLine.Replace('/', '\').ToLowerInvariant()
        if ($processInfo.Name -eq 'node.exe' -and $normalizedCommand.Contains($ExpectedScript.ToLowerInvariant())) {
            return $true
        }
        $ProcessId = [int]$processInfo.ParentProcessId
    }
    return $false
}

function Test-PortalEndpoint([string]$Url, [switch]$Web) {
    $remaining = Get-RemainingMilliseconds
    if ($remaining -le 0) { return $false }
    $requestTimeout = [int][Math]::Max(1, [Math]::Min(2, [Math]::Ceiling($remaining / 1000)))
    try {
        if ($Web) {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $requestTimeout
            return $response.StatusCode -eq 200 -and $response.Content -match 'Portal interno</title>' -and $response.Content -match '/src/main.tsx'
        }
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec $requestTimeout
        return $response.status -eq 'ok' -and $response.persistence -eq 'postgres' -and $response.authentication -eq 'password+email-mfa'
    } catch {
        return $false
    }
}

function Get-PortalState {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort 3001, 5173 -ErrorAction SilentlyContinue)
    foreach ($connection in $connections) {
        $expectedScript = if ($connection.LocalPort -eq 5173) { $viteScript } else { $apiScript }
        if (-not (Test-ProjectProcess -ProcessId $connection.OwningProcess -ExpectedScript $expectedScript)) {
            Stop-PortalLaunch ('A porta {0} esta sendo usada por outro aplicativo. Feche esse aplicativo ou libere a porta antes de iniciar o Portal Apice.' -f $connection.LocalPort)
        }
    }
    $apiReady = Test-PortalEndpoint -Url $apiUrl
    $webReady = Test-PortalEndpoint -Url $webUrl -Web
    $proxyReady = if ($apiReady -and $webReady) { Test-PortalEndpoint -Url ($webUrl + 'api/v1/health') } else { $false }
    return [pscustomobject]@{
        Ready = $apiReady -and $webReady -and $proxyReady
        Listening = $connections.Count -gt 0
    }
}

function Initialize-LauncherDirectory {
    $localPath = Join-Path $projectRoot '.local'
    $privatePath = Join-Path $localPath 'launcher'
    foreach ($directory in @($localPath, $privatePath)) {
        if (Test-Path -LiteralPath $directory) {
            $item = Get-Item -LiteralPath $directory -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                Stop-PortalLaunch 'A pasta privada de execucao precisa ser um diretorio local dentro do projeto.'
            }
        } else {
            New-Item -ItemType Directory -Path $directory | Out-Null
        }
    }
    # Preserve ownership; replacing the entire descriptor can require privileges
    # unavailable to a normal Windows login even when this folder is already private.
    $access = Get-Acl -LiteralPath $privatePath
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $existingRules = @($access.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    $onlyPrivateRules = $existingRules.Count -eq 2 -and @($existingRules | Where-Object {
        $_.IdentityReference.Value -notin @($currentSid.Value, $systemSid.Value) -or
        $_.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
        $_.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl
    }).Count -eq 0
    if ($access.AreAccessRulesProtected -and $onlyPrivateRules) { return $privatePath }
    $access.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($access.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]))) {
        $access.RemoveAccessRuleSpecific($existingRule)
    }
    foreach ($accountSid in @($currentSid, $systemSid)) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $accountSid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $access.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $privatePath -AclObject $access
    return $privatePath
}

try {
    $projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath.TrimEnd('\')
    $devScript = Join-Path $projectRoot 'scripts\dev.mjs'
    $viteScript = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
    $apiScript = Join-Path $projectRoot 'node_modules\tsx\dist\cli.mjs'
    $packagePath = Join-Path $projectRoot 'package.json'
    if (-not (Test-Path -LiteralPath $packagePath) -or -not (Test-Path -LiteralPath $devScript)) {
        Stop-PortalLaunch 'Este iniciador deve permanecer dentro da pasta Portal-Apice, junto do projeto.'
    }
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne 'apice-portal') {
        Stop-PortalLaunch 'A pasta selecionada nao corresponde ao Portal Apice.'
    }
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        Stop-PortalLaunch 'Nao foi possivel verificar as portas locais neste Windows.'
    }

    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))
        $mutexKey = ([BitConverter]::ToString($digest)).Replace('-', '').Substring(0, 24)
    } finally {
        $hasher.Dispose()
    }
    $startupMutex = [Threading.Mutex]::new($false, ('Local\PortalApiceStart_' + $mutexKey))
    try {
        $ownsMutex = $startupMutex.WaitOne((Get-RemainingMilliseconds))
    } catch [Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (-not $ownsMutex) {
        Stop-PortalLaunch 'Outro clique ja esta iniciando o sistema. Aguarde e tente novamente.'
    }

    $state = Get-PortalState
    if ($CheckOnly) {
        if ($state.Ready) {
            Write-Host ('Sistema ativo: ' + $webUrl)
            exit 0
        }
        Write-Host 'Sistema ainda nao esta pronto. De duplo clique em Iniciar Sistema.cmd.'
        exit 3
    }

    if (-not $state.Ready) {
        foreach ($dependency in @($viteScript, $apiScript, (Join-Path $projectRoot 'node_modules\typescript\bin\tsc'))) {
            if (-not (Test-Path -LiteralPath $dependency -PathType Leaf)) {
                Stop-PortalLaunch 'As dependencias nao estao instaladas. Execute npm ci na pasta do projeto e tente novamente.'
            }
        }
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env') -PathType Leaf)) {
            Stop-PortalLaunch 'A configuracao local nao foi encontrada. Configure o banco local conforme o README antes de iniciar.'
        }
        $programFilesNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
        $nodePath = if (Test-Path -LiteralPath $programFilesNode -PathType Leaf) {
            $programFilesNode
        } else {
            $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($nodeCommand) { $nodeCommand.Source } else { $null }
        }
        if (-not $nodePath) { Stop-PortalLaunch 'Instale Node.js 22.12 ou superior para iniciar o sistema.' }
        $versionText = (& $nodePath --version | Out-String).Trim().TrimStart('v')
        if ($LASTEXITCODE -ne 0 -or [version]$versionText -lt [version]'22.12.0') {
            Stop-PortalLaunch 'O sistema precisa de Node.js 22.12 ou superior.'
        }

        $launcherDirectory = Initialize-LauncherDirectory
        $alreadyStarting = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
            ([string]$_.CommandLine).Replace('/', '\').ToLowerInvariant().Contains($devScript.ToLowerInvariant())
        }).Count -gt 0
        if (-not $state.Listening -and -not $alreadyStarting) {
            $runId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
            $outputLog = Join-Path $launcherDirectory ('system-' + $runId + '.out.log')
            $errorLog = Join-Path $launcherDirectory ('system-' + $runId + '.err.log')
            $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $devScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
            Write-LauncherEvent ('Inicio solicitado; processo local ' + $process.Id + '; arquivos ' + $runId + '.')
        } else {
            Write-LauncherEvent 'Inicializacao existente detectada; aguardando os servicos sem iniciar outra copia.'
        }

        while (-not $state.Ready -and (Get-RemainingMilliseconds) -gt 0) {
            Start-Sleep -Milliseconds ([Math]::Min(500, (Get-RemainingMilliseconds)))
            $state = Get-PortalState
            if ($process -and $process.HasExited -and -not $state.Ready) {
                Stop-PortalLaunch 'A inicializacao terminou com erro. Consulte os arquivos privados em .local\launcher e tente novamente apos corrigir a causa.'
            }
        }
        if (-not $state.Ready) {
            Stop-PortalLaunch 'O sistema nao ficou pronto em ate 60 segundos. Consulte .local\launcher; se ainda estiver iniciando, aguarde e clique novamente.'
        }
        Write-LauncherEvent 'Banco, API e interface respondendo; sistema pronto.'
    }

    if (-not $NoBrowser) { Start-Process -FilePath $webUrl }
    Write-Host ('Sistema ativo: ' + $webUrl)
    Write-Host 'Ele continua ligado em segundo plano. Um novo clique apenas abre o portal.'
    exit 0
} catch {
    $message = if ($_.Exception.Data.Contains('PortalFriendly')) {
        $_.Exception.Message
    } else {
        'Nao foi possivel iniciar o sistema. Confira Node.js, a instalacao do projeto e as permissoes da pasta.'
    }
    try { Write-LauncherEvent ('Falha: ' + $message) } catch { }
    Write-Host $message -ForegroundColor Red
    exit 1
} finally {
    if ($ownsMutex -and $startupMutex) { $startupMutex.ReleaseMutex() }
    if ($startupMutex) { $startupMutex.Dispose() }
}
