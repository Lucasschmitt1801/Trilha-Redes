@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado no PATH.
  echo Instale o Node.js 20 ou superior e tente novamente.
  pause
  exit /b 1
)

if not exist "client\dist\index.js" (
  echo Build do cliente nao encontrado: client\dist\index.js
  echo Execute npm install e npm run build na raiz do projeto.
  pause
  exit /b 1
)

if not exist "web\dist\index.html" (
  echo Interface web nao compilada: web\dist\index.html
  echo Execute npm install e npm run build na raiz do projeto.
  pause
  exit /b 1
)

powershell -NoProfile -Command "$ok=Test-NetConnection 127.0.0.1 -Port 5175 -InformationLevel Quiet -WarningAction SilentlyContinue; if ($ok) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
  echo O cliente ja esta rodando na porta HTTP 5175.
  echo Use http://127.0.0.1:5175 e nao inicie outro cliente.
  pause
  exit /b 0
)

echo Iniciando cliente Trilha Redes...
node "client\dist\index.js"
set "exitCode=%ERRORLEVEL%"
echo.
echo O cliente foi encerrado com codigo %exitCode%.
echo Se aparecer EADDRINUSE, a porta 5175 ja esta em uso.
pause
exit /b %exitCode%
