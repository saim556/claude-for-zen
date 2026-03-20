@echo off
echo Building Claude for Zen extension...

:: Clean previous build
if exist "claude-for-zen.xpi" del "claude-for-zen.xpi"

:: Package as .xpi (zip with .xpi extension)
powershell -Command "Compress-Archive -Path 'manifest.json','background.js','content\*','sidebar\*','options\*','icons\*' -DestinationPath 'claude-for-zen.zip' -Force"
if exist "claude-for-zen.zip" (
    ren "claude-for-zen.zip" "claude-for-zen.xpi"
    echo.
    echo Done! Created claude-for-zen.xpi
    echo.
    echo To install permanently in Zen Browser:
    echo   1. Open about:config and set xpinstall.signatures.required to false
    echo   2. Open about:addons
    echo   3. Click the gear icon ^> "Install Add-on From File..."
    echo   4. Select claude-for-zen.xpi
) else (
    echo Build failed!
)
