param([switch]$Once)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Join-Path $env:LOCALAPPDATA 'KLGPrintAgent'
Add-Type -AssemblyName System.Security
$mutex = New-Object Threading.Mutex($false, 'Local\KLGPrintAgent')
if (-not $mutex.WaitOne(0)) { exit 0 }
function Save-Json($path, $value) {
    $temp = $path + '.tmp'
    [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temp -Destination $path -Force
}
function Log($text) {
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $text
    Add-Content -LiteralPath (Join-Path $root 'agent.log') -Value $line
}
function Api($body) {
    Invoke-RestMethod -Uri ($settings.site + '/api/print-agent/device') -Method Post -Headers @{Authorization=('Bearer '+$token)} -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 90 -MaximumRedirection 0
}
function Ack($entry) {
    $null = Api @{action='ack';id=$entry.id;attempt=$entry.attempt;status=$entry.status;printer=$settings.printer;error=$entry.error}
}
function Run-Process($exe, $arguments, $timeout) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName=$exe; $psi.Arguments=$arguments; $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
    $process = [Diagnostics.Process]::Start($psi)
    if (-not $process.WaitForExit($timeout)) { try { $process.Kill() } catch {}; throw 'Print helper timed out; check the printer queue before retrying.' }
    $code=$process.ExitCode; $process.Dispose(); return $code
}
try {
    $settings = Get-Content -LiteralPath (Join-Path $root 'settings.json') -Raw | ConvertFrom-Json
    if ($settings.site -ne 'https://klgcr-maintenance-system.vercel.app') { throw 'Unrecognized system address. Run setup again.' }
    $encrypted=[IO.File]::ReadAllBytes((Join-Path $root 'connection.bin'))
    $token=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
    if ($token -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Invalid connection code. Run setup again.' }
    $jobsFolder=Join-Path $root 'jobs'; [IO.Directory]::CreateDirectory($jobsFolder) | Out-Null
    do {
        try {
            # A terminal local result can be acknowledged repeatedly without printing again.
            foreach ($file in Get-ChildItem -LiteralPath $jobsFolder -Filter '*.json') {
                $entry=Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
                if ($entry.status -in @('submitted','failed') -and -not $entry.acked) {
                    try { Ack $entry; $entry.acked=$true; Save-Json $file.FullName $entry } catch { Log 'Acknowledgement pending; no reprint attempted.' }
                }
            }
            if (-not (Get-Printer -Name $settings.printer -ErrorAction SilentlyContinue)) { throw 'Selected printer is missing. Run setup to select it again.' }
            $response=Api @{action='poll';printer=$settings.printer;version='1.0.0'}
            if ($response.job) {
                $job=$response.job
                if ($job.id -notmatch '^[0-9a-f-]{36}$' -or [int]$job.attempt -lt 1 -or $job.kind -notin @('rental','test')) { throw 'Invalid print job received.' }
                $key=$job.id+'-'+[int]$job.attempt; $record=Join-Path $jobsFolder ($key+'.json')
                if (Test-Path -LiteralPath $record) { Log 'Delivery already exists locally; held to avoid duplicate printing.' }
                else {
                    $entry=@{id=$job.id;attempt=[int]$job.attempt;status='preparing';error='';acked=$false}
                    Save-Json $record $entry
                    try {
                        $htmlPath=Join-Path $jobsFolder ($key+'.html'); $pdfPath=Join-Path $jobsFolder ($key+'.pdf')
                        [IO.File]::WriteAllText($htmlPath,[string]$job.html,(New-Object Text.UTF8Encoding($false)))
                        $url=([Uri]$htmlPath).AbsoluteUri
                        $profile=Join-Path $root ('render-'+$key)
                        $renderArgs='--headless --disable-gpu --no-first-run --no-pdf-header-footer --no-default-browser-check --user-data-dir="'+$profile+'" --print-to-pdf="'+$pdfPath+'" "'+$url+'"'
                        $code=Run-Process $settings.browser $renderArgs 90000
                        if ($code -ne 0 -or -not (Test-Path -LiteralPath $pdfPath) -or (Get-Item -LiteralPath $pdfPath).Length -lt 100) { throw 'Could not render invoice PDF. Nothing sent to printer.' }
                        $stream=[IO.File]::OpenRead($pdfPath);try{$header=New-Object byte[] 5;$null=$stream.Read($header,0,5)}finally{$stream.Dispose()}
                        if ([Text.Encoding]::ASCII.GetString($header) -ne '%PDF-') { throw 'Invalid PDF. Nothing sent to printer.' }
                        # Persist the uncertain boundary BEFORE handing off to Windows.
                        $entry.status='submitting'; Save-Json $record $entry
                        $printArgs='-print-to "'+$settings.printer+'" -print-settings "paper=A4,fit,simplex" -silent "'+$pdfPath+'"'
                        $code=Run-Process $settings.sumatra $printArgs 120000
                        if ($code -ne 0) { throw ('PDF print helper returned '+$code+'. Check the Windows queue before retrying.') }
                        $entry.status='submitted'; Save-Json $record $entry
                        Ack $entry; $entry.acked=$true; Save-Json $record $entry
                        Log ('Submitted '+$job.kind+' job '+$key+' to Windows. Physical output must be checked at printer.')
                    } catch {
                        # Never turn an ACK/network failure after submission into a new print.
                        if ($entry.status -eq 'submitted') { Log 'Submitted; server acknowledgement pending.' }
                        elseif ($entry.status -eq 'submitting') { Log ('Uncertain print result for '+$key+'. Manual review required.'); $entry.error='Submission interrupted; check Windows queue and pages. No automatic retry.'; Save-Json $record $entry }
                        else { $entry.status='failed';$entry.error='PDF preparation failed. See office agent log.';Save-Json $record $entry;try{Ack $entry;$entry.acked=$true;Save-Json $record $entry}catch{};Log ('PDF preparation failed for '+$key) }
                    } finally {
                        if ($profile -and (Test-Path -LiteralPath $profile)) { Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue }
                        Remove-Item -LiteralPath $htmlPath -Force -ErrorAction SilentlyContinue
                    }
                }
            }
            Save-Json (Join-Path $root 'status.json') @{lastContact=(Get-Date).ToString('o');printer=$settings.printer;state='Connected';version='1.0.0'}
        } catch { Log 'Connection or printer check failed. Will check again in 60 seconds; claimed jobs are not reprinted.';Save-Json (Join-Path $root 'status.json') @{lastContact=(Get-Date).ToString('o');printer=$settings.printer;state='Check connection or printer';version='1.0.0'} }
        if (-not $Once) { Start-Sleep -Seconds 60 }
    } while (-not $Once)
} finally { $mutex.ReleaseMutex();$mutex.Dispose() }
