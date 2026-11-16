# Generates the app icons (PNG + SVG) with a banknote-style guilloche rosette.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$ink = [System.Drawing.ColorTranslator]::FromHtml('#1D3B33')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#EEF1EC')
$violet = [System.Drawing.ColorTranslator]::FromHtml('#9C82D4')

function Get-Ring([double]$c, [double]$R, [double]$amp, [int]$k, [double]$phase, [int]$n) {
  $pts = New-Object 'System.Drawing.PointF[]' $n
  for ($i = 0; $i -lt $n; $i++) {
    $t = $i / $n * 2 * [Math]::PI
    $rad = $R + $amp * [Math]::Sin($k * $t + $phase)
    $pts[$i] = [System.Drawing.PointF]::new([float]($c + $rad * [Math]::Cos($t)), [float]($c + $rad * [Math]::Sin($t)))
  }
  return ,$pts
}

function New-Icon([int]$size, [string]$file, [double]$scale, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $bg = New-Object System.Drawing.SolidBrush $ink
  if ($rounded) {
    $d = $size * 0.44
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bg, $path)
  } else {
    $g.FillRectangle($bg, 0, 0, $size, $size)
  }
  $c = $size / 2
  $R = $size * $scale
  $w = [Math]::Max(1.0, $size / 220)
  $pen = New-Object System.Drawing.Pen $paper, ([float]$w)
  for ($j = 0; $j -lt 8; $j++) {
    $g.DrawPolygon($pen, (Get-Ring $c ($R * 0.80) ($R * 0.13) 12 ($j * 2 * [Math]::PI / 8) 480))
  }
  $thin = New-Object System.Drawing.Pen $paper, ([float]($w * 0.8))
  $g.DrawEllipse($thin, [float]($c - $R), [float]($c - $R), [float]($R * 2), [float]($R * 2))
  $ri = $R * 0.6
  $g.DrawEllipse($thin, [float]($c - $ri), [float]($c - $ri), [float]($ri * 2), [float]($ri * 2))
  $rd = $R * 0.24
  $dot = New-Object System.Drawing.SolidBrush $violet
  $g.FillEllipse($dot, [float]($c - $rd), [float]($c - $rd), [float]($rd * 2), [float]($rd * 2))
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon 192 (Join-Path $out 'icon-192.png') 0.40 $true
New-Icon 512 (Join-Path $out 'icon-512.png') 0.40 $true
New-Icon 512 (Join-Path $out 'maskable-512.png') 0.30 $false
New-Icon 180 (Join-Path $out 'apple-touch-icon.png') 0.36 $false

# SVG favicon
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1D3B33"/><g fill="none" stroke="#EEF1EC" stroke-width="0.8">')
$c = 32.0
$R = 25.6
for ($j = 0; $j -lt 6; $j++) {
  $phase = $j * 2 * [Math]::PI / 6
  [void]$sb.Append('<path d="')
  for ($i = 0; $i -le 240; $i++) {
    $t = $i / 240 * 2 * [Math]::PI
    $rad = $R * 0.80 + $R * 0.13 * [Math]::Sin(12 * $t + $phase)
    $x = [string]::Format($inv, '{0:F2}', $c + $rad * [Math]::Cos($t))
    $y = [string]::Format($inv, '{0:F2}', $c + $rad * [Math]::Sin($t))
    if ($i -eq 0) { [void]$sb.Append("M$x $y") } else { [void]$sb.Append("L$x $y") }
  }
  [void]$sb.Append('Z"/>')
}
[void]$sb.Append([string]::Format($inv, '<circle cx="32" cy="32" r="{0:F2}"/><circle cx="32" cy="32" r="{1:F2}"/></g>', $R, $R * 0.6))
[void]$sb.Append([string]::Format($inv, '<circle cx="32" cy="32" r="{0:F2}" fill="#9C82D4"/></svg>', $R * 0.24))
[System.IO.File]::WriteAllText((Join-Path $out 'icon.svg'), $sb.ToString())
Write-Output 'icons done'
