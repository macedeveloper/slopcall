Add-Type -AssemblyName System.Drawing

$size = 1024
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $r * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$baseBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#18181c'))
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#ff7a15'))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 34)
$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$background = New-RoundedPath 32 32 960 960 220
$graphics.FillPath($baseBrush, $background)
$graphics.FillEllipse($accentBrush, 152, 152, 720, 720)

$capsule = New-RoundedPath 446 272 132 300 66
$graphics.FillPath($whiteBrush, $capsule)
$graphics.DrawArc($whitePen, 366, 400, 292, 292, 0, 180)
$graphics.DrawLine($whitePen, 512, 664, 512, 770)
$graphics.DrawLine($whitePen, 414, 782, 610, 782)

$output = Join-Path $PSScriptRoot '..\app-icon.png'
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$whitePen.Dispose()
$whiteBrush.Dispose()
$accentBrush.Dispose()
$baseBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Wrote $output"
