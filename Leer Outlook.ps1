$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$app = $null
$session = $null
$inbox = $null
$items = $null
try {
    $app = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    $session = $app.GetNamespace('MAPI')
    $inbox = $session.GetDefaultFolder(6)
    $items = $inbox.Items
    $items.Sort('[ReceivedTime]', $true)
    $result = New-Object System.Collections.Generic.List[object]
    $limit = [Math]::Min($items.Count, 50)
    for ($i = 1; $i -le $limit; $i++) {
        $item = $items.Item($i)
        try {
            if ($item.Class -ne 43) { continue }
            if ($item.ReceivedTime -lt (Get-Date).AddDays(-7)) { break }
            $content = [string]$item.Body
            if ($content.Length -gt 12000) { $content = $content.Substring(0,12000) }
            $result.Add([pscustomobject]@{id=[string]$item.EntryID;subject=[string]$item.Subject;sender=[string]$item.SenderName;body=$content;received=$item.ReceivedTime.ToUniversalTime().ToString('o');unread=[bool]$item.UnRead;importance=[int]$item.Importance})
        } finally { if ($null -ne $item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) } }
    }
    @{messages=@($result.ToArray());checked=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 5 -Compress
} catch {
    @{error='Abre Outlook clásico con el perfil de correo que quieras consultar. El nuevo Outlook no permite esta conexión local. Outlook puede pedirte permiso de lectura.'} | ConvertTo-Json -Compress
} finally {
    foreach ($obj in @($items,$inbox,$session,$app)) { if ($null -ne $obj) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($obj) } }
}
