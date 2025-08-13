@echo off
echo Setting up Timeline Task Management App...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Install backend dependencies
echo Installing backend dependencies...
cd backend
call npm install

REM Copy environment file
if not exist .env (
    echo Creating .env file...
    copy .env.example .env
    echo Please review and update the .env file with your settings.
)

echo Backend setup complete!
echo.
echo Next steps:
echo 1. Review and update backend\.env file  
echo 2. Start MongoDB service
echo 3. Start the backend server: cd backend && npm run dev
echo 4. Open http://localhost:3001 in your browser

pause
