@echo off
echo ==========================================
echo   AssetBot - Development Mode
echo ==========================================
echo.
echo Starting Flask API backend on port 5000...
start "Flask API" cmd /k "cd /d %~dp0 && venv\Scripts\python.exe app.py"
timeout /t 2 /nobreak >nul

echo Starting Vite dev server on port 3000...
start "Vite Dev" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ==========================================
echo   Both servers starting...
echo   Frontend: http://localhost:3000
echo   Backend:  http://127.0.0.1:5000
echo ==========================================
echo.
pause
