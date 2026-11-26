param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,
  [ValidateSet('all', 'preview', 'production')]
  [string]$Profile = 'all'
)

$ErrorActionPreference = 'Stop'

if (Test-Path 'D:\nvm\v22.22.2') {
  $env:Path = 'D:\nvm\v22.22.2;' + $env:Path
}

$cleanUrl = $ApiUrl.Trim().TrimEnd('/')
$parsed = $null
if (-not [System.Uri]::TryCreate($cleanUrl, [System.UriKind]::Absolute, [ref]$parsed)) {
  Write-Error "URL không hợp lệ: '$ApiUrl'. Ví dụ đúng: https://chiane-api.onrender.com"
  exit 1
}

if ($parsed.Scheme -ne 'https' -or $parsed.AbsolutePath -ne '/' -or -not [string]::IsNullOrEmpty($parsed.Query) -or -not [string]::IsNullOrEmpty($parsed.Fragment)) {
  Write-Error "ApiUrl phải là HTTPS origin gốc (không kèm /api/v1 hay tham số). Ví dụ đúng: https://chiane-api.onrender.com"
  exit 1
}

Write-Host "1/4. Kiểm tra máy chủ API tại $cleanUrl/health ..." -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$cleanUrl/health" -Method Get -TimeoutSec 30
if ($health.status -ne 'ok') {
  Write-Error "Endpoint /health không trả về status=ok. Phản hồi: $($health | ConvertTo-Json -Compress)"
  exit 1
}
Write-Host "   -> OK ($($health.status))" -ForegroundColor Green

$mobileDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\apps\mobile')).Path
Push-Location $mobileDir
try {
  Write-Host '2/4. Kiểm tra đăng nhập Expo EAS ...' -ForegroundColor Cyan
  $easUser = & eas whoami
  if ($LASTEXITCODE -ne 0) {
    Write-Error 'Chưa đăng nhập EAS CLI. Hãy chạy "eas login" trước.'
    exit $LASTEXITCODE
  }
  Write-Host "   -> Đang đăng nhập tài khoản: $easUser" -ForegroundColor Green

  Write-Host "3/4. Nạp biến EXPO_PUBLIC_API_URL = $cleanUrl cho preview & production ..." -ForegroundColor Cyan
  & eas env:set preview --name EXPO_PUBLIC_API_URL --value $cleanUrl --type string --visibility plaintext --scope project --non-interactive
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & eas env:set production --name EXPO_PUBLIC_API_URL --value $cleanUrl --type string --visibility plaintext --scope project --non-interactive
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host '   -> Đã cập nhật biến môi trường EAS thành công.' -ForegroundColor Green

  if ($Profile -eq 'all' -or $Profile -eq 'preview') {
    Write-Host '4a/4. Đang chạy EAS Build Android (preview -> .apk cài trực tiếp) ...' -ForegroundColor Cyan
    & eas build --platform android --profile preview
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  if ($Profile -eq 'all' -or $Profile -eq 'production') {
    Write-Host '4b/4. Đang chạy EAS Build Android (production -> .aab nộp Google Play) ...' -ForegroundColor Cyan
    & eas build --platform android --profile production
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  Write-Host 'Hoàn tất quá trình build EAS Android! Vào link EAS Build phía trên để tải file .apk / .aab.' -ForegroundColor Green
} finally {
  Pop-Location
}
