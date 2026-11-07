[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.-]*$')]
    [string]$ServerAddress = '3.39.11.29',
    [string]$KeyFile = 'E:\desktop\wegotrip-key.pem'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $backendRoot 'build\libs\travel-backend-0.0.1-SNAPSHOT.jar'
$checkSource = Join-Path $PSScriptRoot 'deploy\WeGoTripDeploymentCheck.java'
$checkDirectory = Join-Path $backendRoot 'build\redeploy\remote-check'
$tempDirectory = Join-Path $backendRoot 'build\tmp\java'
$sshDirectory = Join-Path $env:WINDIR 'System32\OpenSSH'
$sshExecutable = Join-Path $sshDirectory 'ssh.exe'
$scpExecutable = Join-Path $sshDirectory 'scp.exe'
$previousPath = $env:Path
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
$previousOutputEncoding = $OutputEncoding

foreach ($requiredPath in @($KeyFile, $sshExecutable, $scpExecutable, $checkSource)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required file not found: $requiredPath"
    }
}

$compiler = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
    Join-Path $env:JAVA_HOME 'bin\javac.exe'
} else {
    (Get-Command javac.exe -ErrorAction Stop).Source
}

try {
    # PowerShell must not prefix SSH stdin with a UTF-8 BOM.
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $env:Path = $sshDirectory + ';' + $env:Path
    New-Item -ItemType Directory -Path $tempDirectory, $checkDirectory -Force | Out-Null
    $tempOption = '-Djava.io.tmpdir="' + $tempDirectory.Replace('\', '/') + '"'
    $env:JAVA_TOOL_OPTIONS = (($previousJavaOptions, $tempOption) -join ' ').Trim()

    Write-Host '[1/4] Running backend tests and building the JAR...'
    Push-Location -LiteralPath $backendRoot
    try {
        & (Join-Path $backendRoot 'gradlew.bat') test bootJar
        if ($LASTEXITCODE -ne 0) { throw 'Tests or JAR build failed. Deployment stopped.' }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $jarPath -PathType Leaf)) { throw 'The deployable JAR was not produced.' }

    & $compiler --release 21 -encoding UTF-8 -d $checkDirectory $checkSource
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the read-only deployment preflight.' }

    $expectedHash = (Get-FileHash -LiteralPath $jarPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $deploymentId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
    $remoteTarget = 'ec2-user@' + $ServerAddress
    $remoteStage = '/home/ec2-user/wegotrip-deploy-' + $deploymentId
    $sshArguments = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10')

    Write-Host '[2/4] Connecting to EC2 and uploading the staged JAR...'
    & $sshExecutable @sshArguments $remoteTarget "mkdir -p $remoteStage && chmod 700 $remoteStage"
    if ($LASTEXITCODE -ne 0) { throw 'EC2 SSH connection failed. The running application was not replaced.' }

    & $scpExecutable @sshArguments $jarPath ($remoteTarget + ':' + $remoteStage + '/app.jar')
    if ($LASTEXITCODE -ne 0) { throw 'JAR upload failed. The running application was not replaced.' }
    & $scpExecutable @sshArguments (Join-Path $checkDirectory 'WeGoTripDeploymentCheck.class') ($remoteTarget + ':' + $remoteStage + '/WeGoTripDeploymentCheck.class')
    if ($LASTEXITCODE -ne 0) { throw 'Preflight upload failed. The running application was not replaced.' }

    $remoteScript = @'
set -eu
stage='__REMOTE_STAGE__'
app='/home/ec2-user/app.jar'
backup='/home/ec2-user/app.jar.bak-__DEPLOYMENT_ID__'
cleanup() {
    rm -f "$stage/app.jar" "$stage/rollback.jar" "$stage/WeGoTripDeploymentCheck.class"
    rmdir "$stage" 2>/dev/null || true
}
trap cleanup EXIT
cd /home/ec2-user
test -f "$app"
test -f /home/ec2-user/.env
printf '%s  %s\n' '__EXPECTED_HASH__' "$stage/app.jar" | sha256sum -c -
java -Dloader.path="$stage/" -Dloader.main=WeGoTripDeploymentCheck -cp "$stage/app.jar" org.springframework.boot.loader.launch.PropertiesLauncher

wait_healthy() {
    remaining="$1"
    while [ "$remaining" -gt 0 ]; do
        if systemctl is-active --quiet wegotrip && curl --fail --silent --max-time 2 http://127.0.0.1:8080/api/test >/dev/null; then
            return 0
        fi
        sleep 1
        remaining=$((remaining - 1))
    done
    return 1
}

cp -p "$app" "$backup"
cp -p "$app" /home/ec2-user/app.jar.bak
mv "$stage/app.jar" "$app"
if sudo systemctl restart wegotrip && wait_healthy 60; then
    printf '%s  %s\n' '__EXPECTED_HASH__' "$app" | sha256sum -c -
    current_pid="$(systemctl show wegotrip -p MainPID --value)"
    echo "DEPLOYMENT_OK pid=$current_pid"
    echo "BACKUP=$backup"
    sudo journalctl -u wegotrip _PID="$current_pid" -n 30 --no-pager -o cat
else
    sudo journalctl -u wegotrip -n 60 --no-pager -o cat || true
    cp -p "$backup" "$stage/rollback.jar"
    mv "$stage/rollback.jar" "$app"
    if sudo systemctl restart wegotrip && wait_healthy 30; then
        echo 'DEPLOYMENT_FAILED_PREVIOUS_JAR_RESTORED' >&2
    else
        echo 'DEPLOYMENT_FAILED_ROLLBACK_NEEDS_ATTENTION' >&2
    fi
    exit 1
fi
'@
    $remoteScript = $remoteScript.Replace('__REMOTE_STAGE__', $remoteStage).Replace('__DEPLOYMENT_ID__', $deploymentId).Replace('__EXPECTED_HASH__', $expectedHash).Replace("`r`n", "`n")
    Write-Host '[3/4] Checking DB schema, replacing the JAR, and verifying startup...'
    $remoteScript | & $sshExecutable @sshArguments $remoteTarget "tr -d '\r' | bash -eu"
    if ($LASTEXITCODE -ne 0) { throw 'EC2 deployment did not finish successfully. Review the preflight or rollback output above.' }

    Write-Host '[4/4] Deployment complete. Verify login, chat, push delivery, and location sharing in the app.'
    Write-Host ('JAR SHA-256: ' + $expectedHash)
} finally {
    $OutputEncoding = $previousOutputEncoding
    $env:Path = $previousPath
    $env:JAVA_TOOL_OPTIONS = $previousJavaOptions
}
