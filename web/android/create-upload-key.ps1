# Создаёт ключ загрузки (upload key) для Google Play и keystore.properties,
# который читает app/build.gradle. Запускать ОДИН раз, вручную:
#   powershell -ExecutionPolicy Bypass -File web\android\create-upload-key.ps1
#
# Play App Signing: Google хранит настоящий ключ подписи приложения, а этим
# ключом ты только подписываешь загрузки. Потерю upload-ключа можно пережить
# (сброс через поддержку Play Console), но лучше не терять: сохрани .jks и
# пароль в менеджере паролей. В git они не попадают (android/.gitignore).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$jks = Join-Path $here "upload-key.jks"
$props = Join-Path $here "keystore.properties"

if (Test-Path $jks) { throw "$jks уже существует — не перезаписываю." }

$keytool = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*\bin\keytool.exe", "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $keytool) { throw "keytool не найден — нужен JDK 21 (Eclipse Adoptium) или Android Studio." }

$secure = Read-Host "Пароль для ключа (мин. 6 символов)" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

& $keytool.FullName -genkeypair -v -keystore $jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $password -keypass $password -dname "CN=ZR, C=PL"

@"
storeFile=upload-key.jks
storePassword=$password
keyAlias=upload
keyPassword=$password
"@ | Set-Content -Encoding ascii $props

Write-Host "Готово: $jks и $props. Теперь: cd web\android; .\gradlew bundleRelease"
