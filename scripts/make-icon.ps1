$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../build'
[void][IO.Directory]::CreateDirectory($destination)
$bitmap = New-Object Drawing.Bitmap(256,256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([Drawing.Color]::FromArgb(21,59,66))
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = New-Object Drawing.Font('Segoe UI',168,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(167,240,112))
$format = New-Object Drawing.StringFormat
$format.Alignment = [Drawing.StringAlignment]::Center
$format.LineAlignment = [Drawing.StringAlignment]::Center
$rect = New-Object Drawing.RectangleF(0,0,256,256)
$graphics.DrawString('J',$font,$brush,$rect,$format)
$png = Join-Path $destination 'icon.png'
$bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png)
$bytes = [IO.File]::ReadAllBytes($png)
$stream = [IO.File]::Create((Join-Path $destination 'icon.ico'))
$writer = New-Object IO.BinaryWriter($stream)
# ICO de 256 px: cabecera de 6 bytes, entrada de 16 y contenido PNG.
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]1)
$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0)
$writer.Write([uint16]1);$writer.Write([uint16]32)
$writer.Write([uint32]$bytes.Length);$writer.Write([uint32]22);$writer.Write($bytes)
$writer.Dispose();$stream.Dispose();$graphics.Dispose();$bitmap.Dispose();$font.Dispose();$brush.Dispose();$format.Dispose()
