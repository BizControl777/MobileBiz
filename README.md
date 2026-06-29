# BizController 360 - Sistema de Gestão de Stock & Vendas

## 🚀 Integração Backend & Electron

Este projecto tem agora:

### ✅ Backend (Node.js + Express)
- API RESTful em `http://localhost:3000/api`
- Banco de dados SQLite3
- Autenticação com JWT
- Endpoints para: Produtos, Vendas, Reservas, Dashboard

### ✅ Desktop (Electron)
- Aplicação desktop com Electron
- Comunicação Frontend-Backend via IPC
- Menu nativo do SO
- Inicialização automática do backend

### ✅ Frontend
- Interface web responsiva (HTML/CSS/JS)
- Suporte para 3 roles: Vendedor, Gestor, Super Admin
- Integração transparente com backend

---

## 📦 Instalação

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Editar `.env` e configurar:
```
NODE_ENV=development
PORT=3000
JWT_SECRET=seu_segredo_muito_seguro_aqui
DB_PATH=./data/bizcontrol.db
API_URL=http://localhost:3000
```

### 3. Criar diretório de dados
```bash
mkdir -p data
```

---

## 🎯 Como executar

### Apenas o Backend (modo servidor)
```bash
npm run server
```

### Desktop App (com Electron)
```bash
npm start
```

### Desenvolvimento com auto-reload
```bash
npm run dev
```

---

## 🔓 Credenciais de Demo

Após instalação, use:

| Papel | Email | Senha |
|-------|-------|-------|
| Super Admin | admin@bizcontrol.local | demo123 |
| Gestor | gestor@bizcontrol.local | demo123 |
| Vendedor | vendedor@bizcontrol.local | demo123 |

---

## 📂 Estrutura do Projecto

```
novoprojectobiz/
├── electron/
│   ├── main.js           # Processo principal do Electron
│   ├── preload.js        # Ponte de segurança
│   └── server.js         # Backend Express
├── js/
│   ├── api.js            # Cliente API
│   ├── app-backend.js    # App com integração backend
│   ├── app.js            # App original
│   ├── data.js           # Dados locais
│   ├── main.js           # Script principal
│   ├── utils.js          # Utilitários
│   └── paginas/
│       ├── gestor.js
│       ├── helpers.js
│       ├── super.js
│       └── vendedor.js
├── css/
│   └── style.css
├── data/                 # Banco de dados (gerado)
│   └── bizcontrol.db
├── index.html            # Interface
├── package.json
├── .env                  # Variáveis ambiente
└── .gitignore
```

---

## 🔌 APIs Disponíveis

### Autenticação
- `POST /api/auth/login` - Login

### Produtos
- `GET /api/produtos` - Listar produtos
- `POST /api/produtos` - Criar produto
- `PUT /api/produtos/:id` - Atualizar produto
- `DELETE /api/produtos/:id` - Deletar produto

### Vendas
- `POST /api/vendas` - Registar venda
- `GET /api/vendas` - Listar vendas

### Reservas
- `POST /api/reservas` - Criar reserva
- `GET /api/reservas` - Listar reservas
- `DELETE /api/reservas/:id` - Cancelar reserva

### Dashboard
- `GET /api/dashboard/stats` - Estatísticas

---

## 🔒 Segurança

- Senhas hasheadas com bcrypt
- Autenticação JWT
- Isolamento de contexto Electron
- Validação de tokens em todas as rotas protegidas

---

## 🛠️ Desenvolvimento

Para adicionar novas funcionalidades:

1. **Backend**: Adicionar endpoints em `electron/server.js`
2. **Frontend**: Adicionar métodos em `js/api.js`
3. **UI**: Atualizar em `js/paginas/*.js`

---

## 📝 Notas

- O banco de dados é criado automaticamente na primeira execução
- Dados de demo são inseridos automaticamente
- O backend inicia automaticamente com o Electron
- Os tokens JWT expiram em 24h

---

## 🤝 Suporte

Para problemas ou dúvidas, abra uma issue ou contacte o suporte.

**Versão**: 1.0.0  
**Data**: 12 de Maio de 2026
