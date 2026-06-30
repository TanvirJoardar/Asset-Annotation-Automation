@echo off
echo ==========================================
echo   AssetBot - Production Build
echo ==========================================
echo.
echo Building React frontend...
cd /d %~dp0frontend
call npm run build
echo.
echo Build complete! Output in frontend\dist
echo.
echo To serve production:
echo   1. Run: python app.py
echo   2. Open: http://127.0.0.1:5000
echo.
pause
