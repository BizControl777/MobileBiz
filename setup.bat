@echo off
REM Script de setup e inicialização do projeto para Windows

echo 🚀 BizController 360 - Setup
echo ==============================

REM Verificar se Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js não está instalado. Instale primeiro.
    exit /b 1
)

echo ✓ Node.js detectado

REM Verificar se npm está instalado
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm não está instalado.
    exit /b 1
)

echo ✓ npm detectado

REM Instalar dependências se não existirem
if not exist "node_modules" (
    echo.
    echo 📦 Instalando dependências...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Erro ao instalar dependências
        exit /b 1
    )
    echo ✓ Dependências instaladas com sucesso
) else (
    echo ✓ Dependências já instaladas
)

REM Criar .env se não existir
if not exist ".env" (
    echo.
    echo ⚙️  Criando ficheiro .env...
    copy .env.example .env
    echo ✓ .env criado ^(edite conforme necessário^)
) else (
    echo ✓ .env já existe
)

REM Criar diretório de dados
if not exist "data" (
    echo.
    echo 📁 Criando diretório de dados...
    mkdir data
    echo ✓ Diretório criado
) else (
    echo ✓ Diretório de dados já existe
)

echo.
echo ==============================
echo ✅ Setup concluído!
echo.
echo Para iniciar a aplicação:
echo   npm start          - Desktop com Electron
echo   npm run server     - Apenas backend ^(server^)
echo   npm run dev        - Desenvolvimento com auto-reload
echo.
pause
