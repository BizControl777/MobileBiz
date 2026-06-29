#!/bin/bash
# Script de setup e inicialização do projeto

echo "🚀 BizController 360 - Setup"
echo "=============================="

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Instale primeiro."
    exit 1
fi

echo "✓ Node.js detectado: $(node -v)"

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não está instalado."
    exit 1
fi

echo "✓ npm detectado: $(npm -v)"

# Instalar dependências se não existirem
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Instalando dependências..."
    npm install
    if [ $? -eq 0 ]; then
        echo "✓ Dependências instaladas com sucesso"
    else
        echo "❌ Erro ao instalar dependências"
        exit 1
    fi
else
    echo "✓ Dependências já instaladas"
fi

# Criar .env se não existir
if [ ! -f ".env" ]; then
    echo ""
    echo "⚙️  Criando ficheiro .env..."
    cp .env.example .env
    echo "✓ .env criado (edite conforme necessário)"
else
    echo "✓ .env já existe"
fi

# Criar diretório de dados
if [ ! -d "data" ]; then
    echo ""
    echo "📁 Criando diretório de dados..."
    mkdir -p data
    echo "✓ Diretório criado"
else
    echo "✓ Diretório de dados já existe"
fi

echo ""
echo "=============================="
echo "✅ Setup concluído!"
echo ""
echo "Para iniciar a aplicação:"
echo "  npm start          - Desktop com Electron"
echo "  npm run server     - Apenas backend (server)"
echo "  npm run dev        - Desenvolvimento com auto-reload"
echo ""
