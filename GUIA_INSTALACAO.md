# 📋 Guia Completo de Instalação e Uso

## ✅ Pré-requisitos

- **Node.js** v16+ ([Download](https://nodejs.org))
- **npm** (vem com Node.js)
- **Git** (opcional, para clonar)

---

## 🚀 Passo 1: Setup Automático

### Linux/macOS
```bash
cd novoprojectobiz
chmod +x setup.sh
./setup.sh
```

### Windows
```bash
cd novoprojectobiz
setup.bat
```

Isto irá:
- ✓ Instalar dependências npm
- ✓ Criar ficheiro `.env`
- ✓ Criar diretório `data/`

---

## 🚀 Passo 2: Setup Manual (se o automático falhar)

```bash
# Entrar na pasta
cd novoprojectobiz

# Instalar dependências
npm install

# Copiar arquivo de configuração
cp .env.example .env

# Criar diretório de dados
mkdir -p data
```

---

## 🔧 Passo 3: Configurar .env (Opcional)

Editar `.env`:
```env
NODE_ENV=development
PORT=3000
JWT_SECRET=seu_segredo_jwt_muito_seguro_aqui_minimo_32_chars!
DB_PATH=./data/bizcontrol.db
API_URL=http://localhost:3000
```

---

## 🎮 Passo 4: Executar o Projeto

### Opção 1: Aplicação Desktop (Electron)
```bash
npm start
```
Isto inicia:
- ✓ Backend em `http://localhost:3000`
- ✓ Aplicação desktop Electron
- ✓ Interface no window do Electron

### Opção 2: Apenas Backend (sem UI)
```bash
npm run server
```
Disponível em: `http://localhost:3000`

Use um cliente HTTP (Postman, Insomnia, curl) para testar.

### Opção 3: Desenvolvimento com Auto-reload
```bash
npm run dev
```
O backend reinicia automaticamente ao editar ficheiros.

---

## 🔓 Credenciais de Login

| Papel | Email | Senha |
|-------|-------|-------|
| 👑 Super Admin | admin@bizcontrol.local | demo123 |
| 💼 Gestor | gestor@bizcontrol.local | demo123 |
| 💳 Vendedor | vendedor@bizcontrol.local | demo123 |

---

## 📂 Estrutura Criada

```
novoprojectobiz/
├── 📁 electron/
│   ├── main.js          ← Processo principal Electron
│   ├── preload.js       ← Ponte de segurança
│   └── server.js        ← Backend Express + API
├── 📁 js/
│   ├── api.js           ← Cliente HTTP/IPC
│   ├── app-backend.js   ← App com integração backend
│   ├── data.js          ← Dados locais
│   └── paginas/         ← Páginas da aplicação
├── 📁 css/
│   └── style.css
├── 📁 data/             ← Banco de dados (criado automaticamente)
├── index.html
├── package.json         ← Dependências e scripts
├── .env                 ← Variáveis de ambiente
├── .env.example         ← Modelo de .env
├── .gitignore           ← Ficheiros a ignorar em git
├── setup.sh             ← Script de setup Linux/macOS
├── setup.bat            ← Script de setup Windows
└── README.md            ← Este arquivo

```

---

## 🔌 Endpoints da API

### Autenticação
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "vendedor@bizcontrol.local",
  "senha": "demo123"
}
```

Resposta:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 3,
    "nome": "Vendedor",
    "email": "vendedor@bizcontrol.local",
    "role": "vendedor"
  }
}
```

### Produtos
```http
GET /api/produtos?empresa_id=1
Authorization: Bearer {token}

POST /api/produtos
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Coca-Cola 500ml",
  "categoria_id": 1,
  "preco_venda": 50,
  "preco_custo": 30,
  "stock_minimo": 20
}
```

### Vendas
```http
POST /api/vendas
Authorization: Bearer {token}
Content-Type: application/json

{
  "empresaId": 1,
  "itens": [
    {
      "produto_id": 1,
      "quantidade": 2,
      "preco_unitario": 50,
      "total": 100
    }
  ],
  "total": 100
}
```

### Reservas
```http
POST /api/reservas
Authorization: Bearer {token}

{
  "empresaId": 1,
  "produto_id": 1,
  "quantidade": 5
}

GET /api/reservas?empresa_id=1
```

---

## 🐛 Troubleshooting

### "Port 3000 already in use"
```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Windows (em PowerShell como Admin)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
```

### "Database locked"
Certifique-se que:
- ✓ Apenas uma instância está executando
- ✓ O ficheiro `data/bizcontrol.db` não está corrompido

### "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Permission denied" (Linux/macOS)
```bash
chmod +x setup.sh
chmod +x electron/server.js
```

---

## 📚 Documentação Adicional

- [README.md](./README.md) - Visão geral do projeto
- [INTEGRACAO.md](./INTEGRACAO.md) - Detalhes técnicos de integração

---

## 🆘 Suporte

Para problemas, verificar:
1. Logs na pasta `data/` (se existirem)
2. Console do navegador (F12 no Electron)
3. Terminal onde executou `npm start/npm run server`

---

## 📝 Notas Importantes

- 🔒 Altere o `JWT_SECRET` em `.env` em produção
- 📱 Compatível com Electron 22+
- 🗄️ Banco de dados SQLite (sem configuração adicional)
- 🌐 Frontend responsivo para tablets e desktops
- ⚡ IPC eficiente entre processos Electron

---

**Versão**: 1.0.0  
**Última atualização**: 12 de Maio de 2026

Bom desenvolvimento! 🎉
