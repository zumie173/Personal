@echo off
title Fulfillment House — Lead Scoring Agent
color 1F

echo.
echo  ============================================================
echo   FULFILLMENT HOUSE — WEEKLY LEAD SCORING AGENT
echo  ============================================================
echo.

cd /d "%~dp0"

:: Detect Python
where py >nul 2>&1
if %errorlevel% == 0 (set PY=py) else (
  where python >nul 2>&1
  if %errorlevel% == 0 (set PY=python) else (
    echo  ERROR: Python not found. Install from python.org and check "Add to PATH".
    pause & exit /b 1
  )
)

echo  Starting agent — scraping fresh leads, this takes 3-8 minutes...
echo.

%PY% lead_scoring_agent.py

if %errorlevel% neq 0 (
  echo.
  echo  Something went wrong. See the error above.
  pause & exit /b 1
)

echo.
echo  All done! Browser and email should be open.
echo.
pause
