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

if not exist "server\dist\index.js" (
  echo Build do servidor nao encontrado: server\dist\index.js
  echo Execute npm install e npm run build na raiz do projeto.
  pause
  exit /b 1
)

echo Iniciando servidor Trilha Redes...
node "server\dist\index.js"
set "exitCode=%ERRORLEVEL%"
echo.
echo O servidor foi encerrado com codigo %exitCode%.
echo Se aparecer EADDRINUSE, as portas 4000 ou 4001 ja estao em uso.
pause
exit /b %exitCode%
