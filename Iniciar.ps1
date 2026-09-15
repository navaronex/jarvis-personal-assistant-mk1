$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$base = 'http://127.0.0.1:3210'
$nativeNode = Join-Path $root 'runtime/node.exe'
$serverProcess = $null
$ollamaProcess = $null
$script:setupProcess = $null
# ProcessStartInfo hereda el entorno sin reconstruirlo. Evita el fallo Path/PATH
# de Start-Process en algunos entornos de Windows PowerShell 5.1.
function Start-HiddenProcess([string]$File, [string]$Arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    return [System.Diagnostics.Process]::Start($info)
}
function Open-Jarvis {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $base
    $info.UseShellExecute = $true
    try {
        [System.Diagnostics.Process]::Start($info) | Out-Null
    } catch {
        # Abrir el navegador es opcional: su fallo no debe detener la bandeja.
        ('No se pudo abrir el navegador. Abre manualmente ' + $base + '. ' + $_.Exception.Message) |
            Set-Content -LiteralPath (Join-Path $root 'navegador-error.log') -Encoding UTF8
    }
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\JarvisPersonalTray3210')
if (-not $mutex.WaitOne(0,$false)) { Open-Jarvis; exit }
$tray = $null
function Api-Post($endpoint,$value) { Invoke-RestMethod -Uri ($base+$endpoint) -Method Post -Headers @{'X-Jarvis'='local'} -ContentType 'application/json' -Body ($value | ConvertTo-Json -Compress) -TimeoutSec 10 }
function Start-LocalAI {
    try { return Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 } catch {}
    $portable = Join-Path $root 'motor/ollama.exe'
    if (Test-Path -LiteralPath $portable) {
        $env:OLLAMA_HOST = '127.0.0.1:11434'
        $env:OLLAMA_MODELS = Join-Path $root 'modelos'
        $env:OLLAMA_NO_CLOUD = '1'
        $script:ollamaProcess = Start-HiddenProcess $portable 'serve'
        for($i=0;$i -lt 30;$i++) { Start-Sleep -Milliseconds 500; try { return Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 } catch {} }
    }
    return $null
}
try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Esta entrega necesita Windows 11 de 64 bits.' }
    if (-not (Test-Path -LiteralPath $nativeNode)) { throw 'Falta el motor de Jarvis. Extrae la carpeta completa del ZIP antes de abrirlo.' }
    $probe = $null
    try { $probe = Invoke-RestMethod ($base+'/api/health') -TimeoutSec 2 } catch {}
    if ($probe -and $probe.app -ne 'jarvis-personal') { throw 'El puerto local 3210 está ocupado por otra aplicación.' }
    if (-not $probe) {
        $serverProcess = Start-HiddenProcess $nativeNode ('"'+(Join-Path $root 'server.mjs')+'"')
        for($i=0;$i -lt 30;$i++) { Start-Sleep -Milliseconds 300; try { $probe=Invoke-RestMethod ($base+'/api/health') -TimeoutSec 2; break } catch {} }
        if(-not $probe) { throw 'Jarvis no pudo arrancar. Prueba Diagnosticar Jarvis.cmd para ver el error.' }
    }
    $models = Start-LocalAI
    if (-not $models -or @($models.models | Where-Object { $_.name -notmatch 'embed|bert|cloud' }).Count -eq 0) {
        $choice = [System.Windows.Forms.MessageBox]::Show('Jarvis ya puede guardar tareas y avisarte. Para conversar necesita descargar su inteligencia local (varios GB y al menos 10 GB libres). Solo se hace una vez y no tiene coste de API. ¿Prepararla ahora?','Jarvis · Primera puesta en marcha','YesNo','Question')
        if ($choice -eq 'Yes') { & (Join-Path $root 'Preparar IA.ps1'); $models=Start-LocalAI }
    }
    if ($models) {
        $current=Invoke-RestMethod ($base+'/api/state') -TimeoutSec 5
        if(-not $current.model) {
            $options=@($models.models | Where-Object { $_.name -notmatch 'embed|bert|cloud' })
            if($options.Count -gt 0) { $preferred=@($options | Where-Object name -eq 'qwen2.5:3b');if($preferred.Count -gt 0){$chosen=$preferred[0].name}else{$chosen=$options[0].name};Api-Post '/api/settings' @{model=$chosen} | Out-Null }
        }
    }
    $tray=New-Object System.Windows.Forms.NotifyIcon
    $tray.Icon=[System.Drawing.SystemIcons]::Information
    $tray.Text='Jarvis · Recordatorios activos'
    $tray.Visible=$true
    $menu=New-Object System.Windows.Forms.ContextMenuStrip
    $open=$menu.Items.Add('Abrir Jarvis')
    $open.add_Click({Open-Jarvis})
    $setup=$menu.Items.Add('Preparar inteligencia local')
    $setup.add_Click({
        if ($script:setupProcess -and -not $script:setupProcess.HasExited) { return }
        $script:setupProcess = Start-HiddenProcess 'powershell.exe' ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root 'Preparar IA.ps1') + '"')
        $setup.Enabled = $false
    })
    $startup=$menu.Items.Add('Iniciar Jarvis al entrar en Windows')
    $startup.CheckOnClick=$true
    $startupPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'Jarvis personal.lnk'
    $startup.Checked=Test-Path -LiteralPath $startupPath
    $startup.add_Click({
        try {
            if($startup.Checked) {
                $shell=New-Object -ComObject WScript.Shell
                $shortcut=$shell.CreateShortcut($startupPath)
                $shortcut.TargetPath=Join-Path $root 'Iniciar Jarvis.cmd'
                $shortcut.WorkingDirectory=$root
                $shortcut.WindowStyle=7
                $shortcut.Save()
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
            } elseif(Test-Path -LiteralPath $startupPath) { Remove-Item -LiteralPath $startupPath }
        } catch { [System.Windows.Forms.MessageBox]::Show('No se pudo cambiar el inicio con Windows.','Jarvis') | Out-Null }
    })
    $quit=$menu.Items.Add('Salir y detener recordatorios')
    $quit.add_Click({[System.Windows.Forms.Application]::Exit()})
    $tray.ContextMenuStrip=$menu
    $tray.add_DoubleClick({Open-Jarvis})
    $timer=New-Object System.Windows.Forms.Timer
    $timer.Interval=10000
    $timer.add_Tick({
        try {
            if ($script:setupProcess -and $script:setupProcess.HasExited) {
                $script:setupProcess = $null
                $setup.Enabled = $true
                Start-LocalAI | Out-Null
            }
            $result=Invoke-RestMethod ($base+'/api/reminders') -TimeoutSec 3
            if($result.alerts.Count -gt 0) {
                $item=$result.alerts[0]
                $tray.ShowBalloonTip(9000, ('Jarvis · '+$item.title), $item.body, [System.Windows.Forms.ToolTipIcon]::Info)
                Api-Post '/api/reminders/ack' @{id=$item.id} | Out-Null
            }
            $tray.Text='Jarvis · Recordatorios activos'
        } catch { $tray.Text='Jarvis · Sin conexión: vuelve a iniciarlo' }
    })
    $timer.Start()
    Open-Jarvis
    $tray.ShowBalloonTip(6000,'Jarvis está en marcha','Puedes cerrar el navegador. Jarvis seguirá avisando junto al reloj mientras el PC esté encendido.','Info')
    [System.Windows.Forms.Application]::Run()
} catch {
    ($_ | Out-String) | Set-Content -LiteralPath (Join-Path $root 'inicio-error.log') -Encoding UTF8
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Jarvis · No se pudo iniciar','OK','Error') | Out-Null
}
finally {
    if($tray){$tray.Visible=$false;$tray.Dispose()}
    if($serverProcess -and -not $serverProcess.HasExited){Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue}
    if($ollamaProcess -and -not $ollamaProcess.HasExited){Stop-Process -Id $ollamaProcess.Id -ErrorAction SilentlyContinue}
    $mutex.ReleaseMutex();$mutex.Dispose()
}
