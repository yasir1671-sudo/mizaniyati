# Generates the app icons (PNG + SVG): dark squircle, mint-teal gradient ring, gold coin.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function C([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

function New-Icon([int]$size, [string]$file, [double]$ringScale, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $S = [float]$size

  # الخلفية
  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($rounded) {
    $d = $S * 0.44
    $shape.AddArc(0, 0, $d, $d, 180, 90)
    $shape.AddArc($S - $d, 0, $d, $d, 270, 90)
    $shape.AddArc($S - $d, $S - $d, $d, $d, 0, 90)
    $shape.AddArc(0, $S - $d, $d, $d, 90, 90)
    $shape.CloseFigure()
  } else {
    $shape.AddRectangle((New-Object System.Drawing.RectangleF 0, 0, $S, $S))
  }
  $bgRect = New-Object System.Drawing.RectangleF 0, 0, $S, $S
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, (C '#1A1D26'), (C '#07080B'), ([single]45)
  $g.FillPath($bg, $shape)
  $g.SetClip($shape)

  # توهج نعناعي فوق
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([float]($S * 0.35), [float](-$S * 0.35), [float]($S * 1.0), [float]($S * 0.9))
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
  $pg.CenterColor = C '#3DD39A' 70
  $pg.SurroundColors = @((C '#3DD39A' 0))
  $g.FillPath($pg, $glow)

  # الحلقة
  $c = $S / 2
  $R = $S * $ringScale
  $w = $S * 0.085
  $rect = New-Object System.Drawing.RectangleF ([float]($c - $R)), ([float]($c - $R)), ([float]($R * 2)), ([float]($R * 2))
  $track = New-Object System.Drawing.Pen (C '#FFFFFF' 22), ([float]$w)
  $g.DrawEllipse($track, $rect)
  $gradRect = New-Object System.Drawing.RectangleF ([float]($c - $R - $w)), ([float]($c - $R - $w)), ([float](($R + $w) * 2)), ([float](($R + $w) * 2))
  $ringBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $gradRect, (C '#56DEA8'), (C '#1C98A6'), ([single]60)
  $pen = New-Object System.Drawing.Pen $ringBrush, ([float]$w)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawArc($pen, $rect, -90, 270)

  # العملة الذهبية
  $rd = $S * 0.095
  $coinRect = New-Object System.Drawing.RectangleF ([float]($c - $rd)), ([float]($c - $rd)), ([float]($rd * 2)), ([float]($rd * 2))
  $coin = New-Object System.Drawing.Drawing2D.LinearGradientBrush $coinRect, (C '#F6D484'), (C '#C98F34'), ([single]60)
  $g.FillEllipse($coin, $coinRect)

  $g.ResetClip()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon 192 (Join-Path $out 'icon-192.png') 0.27 $true
New-Icon 512 (Join-Path $out 'icon-512.png') 0.27 $true
New-Icon 512 (Join-Path $out 'maskable-512.png') 0.21 $false
New-Icon 180 (Join-Path $out 'apple-touch-icon.png') 0.25 $false

$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A1D26"/><stop offset="1" stop-color="#07080B"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#56DEA8"/><stop offset="1" stop-color="#1C98A6"/></linearGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6D484"/><stop offset="1" stop-color="#C98F34"/></linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="17.3" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="5.4"/>
  <path d="M32 14.7A17.3 17.3 0 1 1 14.7 32" fill="none" stroke="url(#ring)" stroke-width="5.4" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="6.1" fill="url(#coin)"/>
</svg>
'@
[System.IO.File]::WriteAllText((Join-Path $out 'icon.svg'), $svg)
Write-Output 'icons done'
