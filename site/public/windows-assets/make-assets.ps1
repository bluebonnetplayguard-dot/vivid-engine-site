# Run with Windows PowerShell. Keep this file outside temporary session folders.
[CmdletBinding()]
param(
  [string]$ImgDir = (Join-Path $PSScriptRoot 'images'),
  [string]$Out = (Join-Path $PSScriptRoot 'output')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase

function Read-Frame([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create(
      $stream,
      [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
      [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    )
    $frame = $decoder.Frames[0]
    $frame.Freeze()
    return $frame
  } finally {
    $stream.Dispose()
  }
}

function Load-Image([string]$Path) {
  try { return (Read-Frame $Path) } catch {
    $decodeError = $_.Exception.Message
  }

  # WPF cannot decode WebP on every Windows installation. Prefer an existing
  # PNG/JPEG copy, or use ImageMagick if it is already installed.
  if ([IO.Path]::GetExtension($Path) -eq '.webp') {
    foreach ($extension in @('.png', '.jpg', '.jpeg')) {
      $alternative = [IO.Path]::ChangeExtension($Path, $extension)
      if (Test-Path -LiteralPath $alternative -PathType Leaf) {
        return (Read-Frame $alternative)
      }
    }
    $magick = Get-Command 'magick.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -ne $magick) {
      $temporary = Join-Path ([IO.Path]::GetTempPath()) (([guid]::NewGuid().ToString()) + '.png')
      try {
        & $magick.Source $Path $temporary
        if ($LASTEXITCODE -ne 0) { throw 'ImageMagick conversion failed.' }
        return (Read-Frame $temporary)
      } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
      }
    }
    throw "Windows could not decode '$Path'. Put a PNG copy with the same base name alongside it (1.png or 2.png), or install ImageMagick and rerun. Keep 2.webp for the original banner. Details: $decodeError"
  }
  throw "Could not open '$Path': $decodeError"
}

function Save-Image($Bitmap, [string]$Path, [ValidateSet('png', 'jpg')][string]$Kind, [int]$Quality = 84) {
  if ($Kind -eq 'png') {
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  } else {
    $encoder = New-Object Windows.Media.Imaging.JpegBitmapEncoder
    $encoder.QualityLevel = $Quality
  }
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($Bitmap))
  $stream = [IO.File]::Create($Path)
  try { $encoder.Save($stream) } finally { $stream.Dispose() }
}

function Square-Image($Source, [int]$Size, [double]$Fraction, [string]$Background = '#000000') {
  $visual = New-Object Windows.Media.DrawingVisual
  $context = $visual.RenderOpen()
  try {
    $brush = New-Object Windows.Media.SolidColorBrush ([Windows.Media.ColorConverter]::ConvertFromString($Background))
    $context.DrawRectangle($brush, $null, (New-Object Windows.Rect -ArgumentList 0, 0, $Size, $Size))
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($visual, [Windows.Media.BitmapScalingMode]::HighQuality)
    # Fit without stretching non-square source images.
    $scale = ($Size * $Fraction) / [Math]::Max($Source.PixelWidth, $Source.PixelHeight)
    $width = $Source.PixelWidth * $scale
    $height = $Source.PixelHeight * $scale
    $left = ($Size - $width) / 2
    $top = ($Size - $height) / 2
    $context.DrawImage($Source, (New-Object Windows.Rect -ArgumentList $left, $top, $width, $height))
  } finally {
    $context.Close()
  }
  $target = New-Object Windows.Media.Imaging.RenderTargetBitmap -ArgumentList $Size, $Size, 96, 96, ([Windows.Media.PixelFormats]::Pbgra32)
  $target.Render($visual)
  $target.Freeze()
  return $target
}

if (-not (Test-Path -LiteralPath $ImgDir -PathType Container)) {
  throw "Image folder not found: $ImgDir. Create an 'images' folder beside this script and put 1.webp and 2.webp inside it, or supply -ImgDir with the correct folder."
}
$ImgDir = (Resolve-Path -LiteralPath $ImgDir).Path
$logoPath = Join-Path $ImgDir '1.webp'
$bannerPath = Join-Path $ImgDir '2.webp'
foreach ($path in @($logoPath, $bannerPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required image is missing: $path" }
}
$logo = Load-Image $logoPath
$banner = Load-Image $bannerPath
if ($banner.PixelWidth -lt 2000 -or $banner.PixelHeight -lt 744) {
  throw "The fixed phone crop requires a banner at least 2000 x 744 pixels. Actual size: $($banner.PixelWidth) x $($banner.PixelHeight). No assets were written."
}
$Out = [IO.Path]::GetFullPath($Out)
$assets = Join-Path $Out 'assets'
$icons = Join-Path $Out 'icons'
New-Item -ItemType Directory -Force -Path $assets, $icons | Out-Null

Save-Image (Square-Image $logo 512 1.0) (Join-Path $assets 'logo-512.png') 'png'
Save-Image (Square-Image $logo 160 1.0) (Join-Path $assets 'logo-160.png') 'png'
$bannerCopy = Join-Path $assets 'banner.webp'
if (-not [string]::Equals([IO.Path]::GetFullPath($bannerPath), $bannerCopy, [StringComparison]::OrdinalIgnoreCase)) {
  Copy-Item -LiteralPath $bannerPath -Destination $bannerCopy -Force
}
Save-Image $banner (Join-Path $assets 'banner.jpg') 'jpg' 84
$rectangle = New-Object Windows.Int32Rect -ArgumentList 1280, 0, 720, 744
$crop = New-Object Windows.Media.Imaging.CroppedBitmap -ArgumentList $banner, $rectangle
Save-Image $crop (Join-Path $assets 'hero-mobile.jpg') 'jpg' 82

Save-Image (Square-Image $logo 192 1.0) (Join-Path $icons 'icon-192.png') 'png'
Save-Image (Square-Image $logo 512 1.0) (Join-Path $icons 'icon-512.png') 'png'
Save-Image (Square-Image $logo 512 0.80) (Join-Path $icons 'maskable-512.png') 'png'
Save-Image (Square-Image $logo 180 1.0) (Join-Path $icons 'apple-touch-icon.png') 'png'
Save-Image (Square-Image $logo 48 1.0) (Join-Path $icons 'favicon-48.png') 'png'

Write-Host "Assets created in: $Out"
Get-ChildItem -LiteralPath $assets, $icons -File | Select-Object Name, Length | Format-Table -AutoSize
