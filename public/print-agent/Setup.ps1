$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$site='https://klgcr-maintenance-system.vercel.app'
$root=Join-Path $env:LOCALAPPDATA 'KLGPrintAgent'
try {
    Write-Host 'KLG PRINT AGENT - WINDOWS SETUP' -ForegroundColor Yellow
    Write-Host 'Uses your chosen printer only. Does not change the Windows default printer.'
    Write-Host 'Leave this Windows account signed in for automatic rental printing.'
    $printers=@(Get-Printer | Where-Object {$_.Name -notmatch '"|[\r\n]' -and $_.Name -notmatch 'Microsoft Print to PDF|OneNote|XPS'} | Sort-Object Name)
    if (-not $printers.Count) { throw 'Install the office printer in Windows first, then run setup again.' }
    for($n=0;$n -lt $printers.Count;$n++){Write-Host (('{0}. {1}' -f ($n+1),$printers[$n].Name))}
    $choice=0
    if (-not [int]::TryParse((Read-Host 'Printer number'),[ref]$choice) -or $choice -lt 1 -or $choice -gt $printers.Count) { throw 'Invalid printer selection.' }
    $printer=$printers[$choice-1].Name
    $browser=@("${env:ProgramFiles}\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe") | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
    if (-not $browser) { throw 'Microsoft Edge or Google Chrome is required. Install one, then run setup again.' }
    function Find-Sumatra { @("$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe","${env:ProgramFiles}\SumatraPDF\SumatraPDF.exe","${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe") | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1 }
    $sumatra=Find-Sumatra
    if (-not $sumatra) {
        Write-Host 'Installing free SumatraPDF 3.6.1 for named-printer PDF submission...'
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { Start-Process 'https://www.sumatrapdfreader.org/download-free-pdf-viewer';throw 'Install SumatraPDF from the official page just opened, then run this setup again.' }
        & winget.exe install --id SumatraPDF.SumatraPDF --exact --version 3.6.1 --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
        $sumatra=Find-Sumatra
        if (-not $sumatra) { throw 'SumatraPDF installation did not finish. Install it from sumatrapdfreader.org and rerun setup.' }
    }
    Write-Host 'Open Billing > Office printer > Create connection code. Paste that code below.'
    $secure=Read-Host 'Connection code (hidden)' -AsSecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    $token=$token.Trim()
    if ($token -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Connection code is incomplete. Copy it again from the system.' }
    $null=Invoke-RestMethod -Uri ($site+'/api/print-agent/device') -Method Post -Headers @{Authorization=('Bearer '+$token)} -ContentType 'application/json' -Body (@{action='hello';printer=$printer}|ConvertTo-Json -Compress) -TimeoutSec 45 -MaximumRedirection 0
    [IO.Directory]::CreateDirectory($root) | Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $root /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not secure the local agent folder.' }
    $agentPath=Join-Path $root 'Agent.ps1'
    $download=Join-Path $root 'Agent.download'
    Invoke-WebRequest -UseBasicParsing -Uri ($site+'/print-agent/Agent.ps1') -OutFile $download -TimeoutSec 60
    if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne '709B3F60D76B3C258C1206173BDBA7DA46F51C36721F6A0CDBE43AAE26347819') { throw 'Agent download verification failed. Download the latest installer from the system.' }
    # Stop only this user's previously installed KLG agent before replacing its code.
    Get-CimInstance Win32_Process -Filter "name='powershell.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($agentPath)} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
    Move-Item -LiteralPath $download -Destination $agentPath -Force
    Add-Type -AssemblyName System.Security
    $bytes=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($token),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes((Join-Path $root 'connection.bin'),$bytes);$token=$null
    @{site=$site;printer=$printer;browser=$browser;sumatra=$sumatra;version='1.0.0'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'settings.json') -Encoding UTF8
    $shell=New-Object -ComObject WScript.Shell
    $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'KLG Print Agent.lnk'))
    $shortcut.TargetPath="$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$agentPath+'"'
    $shortcut.WorkingDirectory=$root;$shortcut.WindowStyle=7;$shortcut.Save()
    $desktop=[Environment]::GetFolderPath('Desktop')
    [IO.File]::WriteAllText((Join-Path $desktop 'KLG Print Agent - Status.url'),"[InternetShortcut]`r`nURL=$site/admin/billing/print-agent`r`n")
    $stopPath=Join-Path $root 'Stop-Agent.ps1'
    [IO.File]::WriteAllText($stopPath, 'Get-CimInstance Win32_Process -Filter "name=''powershell.exe''" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains('''+$agentPath.Replace("'","''")+''')} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}')
    Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
    Write-Host ('CONNECTED: '+$printer) -ForegroundColor Green
    Write-Host 'Return to the system and click Print one test page. Check that paper comes out once.'
    Write-Host 'Then check Schedule & holidays before enabling automatic rentals.'
    Start-Process ($site+'/admin/billing/print-agent')
} catch { Write-Host ('Setup stopped: '+$_.Exception.Message) -ForegroundColor Red }
Read-Host 'Press Enter to close'
