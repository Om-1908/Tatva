@echo off
title TATVA Quantum AI Platform
cls
echo ===================================================
echo             TATVA Quantum AI Platform              
echo ===================================================
echo.

IF NOT EXIST "%~dp0frontend\node_modules\" (
    echo [INFO] frontend/node_modules directory not found.
    echo [INFO] Installing frontend dependencies, please wait...
    cd /d "%~dp0frontend" && call npm install
    cd /d "%~dp0"
    echo.
)

echo [INFO] Starting TATVA Backend (Python Flask on http://localhost:5000)...
start "TATVA Backend" /min cmd /c "cd /d "%~dp0backend" && python app.py"
echo.

echo [INFO] Starting Vite Frontend Server...
echo [INFO] Application will be available at http://localhost:5173/
echo.

cd /d "%~dp0frontend" && call npm run dev
