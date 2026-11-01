@echo off
cd /d "%~dp0"
echo ====================================================
echo Deploying Updated Editorial Worker to Cloudflare
echo ====================================================
echo.
echo Step 1: Authenticating with Cloudflare...
call npx wrangler login
echo.
echo Step 2: Uploading updated worker code...
call npx wrangler deploy
echo.
echo ====================================================
echo All set! Your Telegram bot now listens to links and /write.
echo ====================================================
pause
