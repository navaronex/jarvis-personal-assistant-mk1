$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# La interfaz espera sin bloquearse: el trabajo lento ocurre en otro proceso.
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Jarvis · Preparación inicial'
$form.Size = New-Object System.Drawing.Size(620, 260)
$form.StartPosition = 'CenterScreen'
$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(24, 24)
$label.Size = New-Object System.Drawing.Size(550, 120)
$label.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$label.Text = 'Preparando la inteligencia local. La primera descarga requiere Internet y varios GB libres.'
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(24, 158)
$bar.Size = New-Object System.Drawing.Size(550, 24)
$bar.Style = 'Marquee'
$form.Controls.AddRange(@($label, $bar))
$log = Join-Path $PSScriptRoot 'preparacion.log'
$errorLog = Join-Path $PSScriptRoot 'preparacion-error.log'
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = Join-Path $PSScriptRoot 'runtime/node.exe'
$info.Arguments = '"' + (Join-Path $PSScriptRoot 'setup.mjs') + '"'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$info.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$worker = [System.Diagnostics.Process]::Start($info)
$pendingLine = $worker.StandardOutput.ReadLineAsync()
$errors = $worker.StandardError.ReadToEndAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.add_Tick({
    while ($pendingLine -and $pendingLine.IsCompleted) {
        $line = $pendingLine.Result
        if ($null -eq $line) { $pendingLine = $null; break }
        $label.Text = $line
        $line | Add-Content -LiteralPath $log -Encoding UTF8
        $pendingLine = $worker.StandardOutput.ReadLineAsync()
    }
    if ($worker.HasExited) {
        if ($errors.IsCompleted) { $errors.Result | Set-Content -LiteralPath $errorLog -Encoding UTF8 }
        $timer.Stop()
        $bar.Style = 'Blocks'
        if ($worker.ExitCode -eq 0) { $bar.Value = 100; $label.Text = 'Preparación completada. Cierra esta ventana para continuar.' }
        else { $label.Text = 'No se ha podido completar. Consulta preparacion-error.log. Tus tareas y avisos siguen funcionando.' }
    }
})
$form.add_FormClosing({
    if (-not $worker.HasExited) {
        $_.Cancel = $true
        [void][System.Windows.Forms.MessageBox]::Show('La descarga sigue en marcha. Puedes minimizar esta ventana. Si se interrumpe Internet, podrás reintentarlo al finalizar.','Jarvis')
    }
})
$timer.Start()
[void]$form.ShowDialog()
$timer.Dispose()
$form.Dispose()
