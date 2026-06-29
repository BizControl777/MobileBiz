## 🔐 Sistema de Licenciamento Híbrido

O sistema utiliza uma arquitetura híbrida para garantir o funcionamento offline sem comprometer o controle de segurança.

### Componentes:
1.  **Supabase (Nuvem):** Banco de dados central PostgreSQL que armazena todas as chaves de licença, `device_id`, status e datas de expiração.
2.  **API Intermediária (Node.js):** Servidor seguro que atua como ponte. O ERP nunca acessa o Supabase diretamente. Esta API valida as chaves, aplica regras de bloqueio e vincula hardware via `device_id`.
3.  **ERP Desktop (Local):** Cliente que armazena uma cópia local (cache) da licença no SQLite. Permite o funcionamento 100% offline.

### Regras de Negócio:
-   **Vinculação:** 1 Licença = 1 Dispositivo (ID único gerado via hardware).
-   **Validação Periódica:** O ERP deve validar a licença com o servidor a cada **10 dias**.
-   **Modo Limitado (Bloqueio Parcial):** Se o ERP ficar mais de 10 dias sem internet/validação, ele entra em modo de apenas leitura.
    -   Permitido: Consultas, relatórios, visualização de estoque.
    -   Bloqueado: Vendas, cadastros, alterações críticas.
-   **Planos:** Suporte a planos mensais (30 dias) e anuais (365 dias).

### Fluxo de Ativação:
1. Usuário insere a chave no ERP.
2. ERP envia chave + `device_id` para a API Node.js.
3. API valida no Supabase e retorna datas de expiração e próxima validação.
4. ERP salva dados no SQLite local e libera o sistema.

---

## 📊 Fluxo de Dados Atualizado (Hybrid)
```
[ ERP Local ] <---(10 dias)---> [ API Node.js ] <---> [ Supabase ]
      |                             |
   [SQLite]                  [Validação JWT]
 (Cache Licença)             (Segurança API)
```

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron (Desktop)                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Renderer Process (Frontend)                               │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  index.html                                          │  │ │
│  │  │  - UI responsiva                                     │  │ │
│  │  │  - JavaScript modules (ES6)                          │  │ │
│  │  │  - API client (js/api.js)                            │  │ │
│  │  │  - App logic (js/app-backend.js)                     │  │ │
│  │  │  - Pages (js/paginas/*.js)                           │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                         ↓                                    │ │
│  │              localStorage (tokens)                          │ │
│  │                         ↓                                    │ │
│  │              IPC Bridge (seguro)                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Main Process (Electron)                                   │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  electron/main.js                                    │  │ │
│  │  │  - Janela principal                                  │  │ │
│  │  │  - Menu nativo                                       │  │ │
│  │  │  - IPC handlers                                      │  │ │
│  │  │  - Processo do backend                              │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │              preload.js (segurança)                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                         ↓                                        │
│                    HTTP localhost:3000                          │
└─────────────────────────────────────────────────────────────────┘
                         ↓
            ┌────────────────────────────┐
            │   Backend (Node.js)        │
            │                            │
            │  electron/server.js        │
            │  - Express API             │
            │  - Autenticação JWT        │
            │  - Validação de dados      │
            │                            │
            ├────────────────────────────┤
            │   Banco de Dados           │
            │                            │
            │  data/bizcontrol.db        │
            │  - SQLite3                 │
            │  - Dados persistentes      │
            │  - Transações ACID         │
            │                            │
            └────────────────────────────┘
```

---

## 🔄 Fluxo de Dados: Login

```
1. Utilizador preenche email/senha no HTML
   ↓
2. Click em "Entrar no Sistema"
   ↓
3. window.doLogin() (js/app-backend.js)
   ↓
4. api.login(email, senha) (js/api.js)
   ↓
5. Electron IPC → ipcRenderer.invoke
   ↓
6. Main process → HTTP POST /api/auth/login
   ↓
7. Backend busca utilizador na DB
   ↓
8. Valida senha com bcrypt
   ↓
9. Gera JWT token
   ↓
10. Retorna token + user info
   ↓
11. localStorage.setItem("auth_token", token)
   ↓
12. Renderiza app-shell
   ↓
✅ Utilizador autenticado e pronto a usar
```

---

## 🔄 Fluxo de Dados: Registar Venda

```
1. Vendedor seleciona produtos no carrinho
   ↓
2. Click em "Finalizar Venda"
   ↓
3. registarVenda(itens, total) (js/app-backend.js)
   ↓
4. Formata dados (produto_id, quantidade, preço)
   ↓
5. api.post("/vendas", dados) (js/api.js)
   ↓
6. Electron IPC com token no header
   ↓
7. HTTP POST ao backend
   ↓
8. Valida JWT token
   ↓
9. Insere venda na DB
   ↓
10. Insere itens_venda na DB
   ↓
11. Atualiza stock dos produtos
   ↓
12. Retorna resultado (ID da venda)
   ↓
13. Limpa carrinho (STATE.cart = [])
   ↓
✅ Venda registada com sucesso
```

---

## 📦 Estrutura de Dados

### Utilizador (Login)
```javascript
{
  token: "eyJhbGciOiJIUzI1NiIs...",
  user: {
    id: 1,
    nome: "Admin",
    email: "admin@bizcontrol.local",
    role: "super"  // super | gestor | vendedor
  }
}
```

### Produto
```javascript
{
  id: 1,
  nome: "Coca-Cola 330ml",
  categoria_id: 1,
  empresa_id: 1,
  preco_venda: 50,
  preco_custo: 30,
  stock: 80,
  stock_minimo: 20,
  ativo: 1,
  criado_em: "2026-05-12T10:30:00"
}
```

### Venda
```javascript
{
  id: 1,
  usuario_id: 3,
  empresa_id: 1,
  total: 100,
  status: "concluida",
  criado_em: "2026-05-12T14:30:00",
  itens: [
    {
      id: 1,
      venda_id: 1,
      produto_id: 1,
      quantidade: 2,
      preco_unitario: 50,
      total: 100
    }
  ]
}
```

### Reserva
```javascript
{
  id: 1,
  usuario_id: 3,
  produto_id: 1,
  empresa_id: 1,
  quantidade: 5,
  status: "pendente",  // pendente | confirmada | cancelada
  criado_em: "2026-05-12T10:30:00",
  atualizado_em: "2026-05-12T14:30:00"
}
```

---

## 🔐 Fluxo de Segurança

```
┌─────────────┐
│ Credenciais │
└──────┬──────┘
       │
       ↓ (HTTPS em produção)
┌─────────────────────────┐
│ POST /api/auth/login    │
│ {email, senha}          │
└──────┬──────────────────┘
       │
       ↓
┌────────────────────────────────────┐
│ Validar email existe na DB         │
│ Comparar senha com hash (bcrypt)   │
└──────┬─────────────────────────────┘
       │
       ↓
┌────────────────────────────────────┐
│ Gerar JWT                          │
│ {userId, email, role, empresaId}   │
│ Secret: JWT_SECRET (env)           │
│ Expira em: 24h                     │
└──────┬─────────────────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Retornar token          │
│ localStorage.setItem()   │
└──────┬───────────────────┘
       │
       ↓ (Token em cada request)
┌──────────────────────────────┐
│ Header: Authorization        │
│ Bearer eyJhbGci...           │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│ Middleware verifyToken (backend)     │
│ - Valida assinatura                  │
│ - Verifica expiração                 │
│ - Extrai userId, role, empresaId     │
└──────┬───────────────────────────────┘
       │
       ↓
✅ Acesso autorizado para endpoint
```

---

## 📡 Ciclo de Requisição (com Electron IPC)

```
Frontend
   ↓
1. api.get("/produtos")
   ↓
2. Determina if Electron
   ↓
3. (Sim) electronAPI.get("/produtos")
   ↓
4. ipcRenderer.invoke("api:request", {...})
   ↓
────────────────── IPC BRIDGE ──────────────────
   ↓
Main Process
   ↓
5. ipcMain.handle("api:request", async ({method, endpoint, data, token}) => {
   ↓
6. Fetch HTTP para localhost:3000
   ↓
7. Retorna resultado
   ↓
────────────────── IPC BRIDGE ──────────────────
   ↓
Frontend
   ↓
8. Recebe resultado como Promise
   ↓
9. Renderiza UI
   ↓
✅ Pronto
```

---

## 🗂️ Camadas da Aplicação

### Camada de Apresentação (Renderer)
- `index.html` - Estrutura HTML
- `css/style.css` - Estilos
- `js/paginas/*.js` - Componentes das páginas

### Camada de Negócio (Renderer/IPC)
- `js/app-backend.js` - Lógica da aplicação
- `js/api.js` - Cliente HTTP/IPC

### Camada de Integração (Main Process)
- `electron/main.js` - Processo principal
- `electron/preload.js` - Bridge de segurança
- `electron/server.js` (rotas) - API REST

### Camada de Persistência (Backend)
- `electron/server.js` (DB) - SQLite
- `data/bizcontrol.db` - Arquivo de banco de dados

---

## 🚀 Como Adicionar Nova Funcionalidade

### 1. Backend
```javascript
// electron/server.js
app.post("/api/minha-funcao", verifyToken, (req, res) => {
  const { dados } = req.body;
  // ... lógica ...
  res.json({ resultado: "sucesso" });
});
```

### 2. Frontend API
```javascript
// js/api.js - adicionar método
async minhaFuncao(dados) {
  return this.post("/minha-funcao", dados);
}
```

### 3. Usar em Página
```javascript
// js/paginas/gestor.js
export function minhaPage(container) {
  const btn = container.querySelector("button");
  btn.onclick = async () => {
    const resultado = await api.minhaFuncao(dados);
    console.log(resultado);
  };
}
```

---

## 📈 Performance

- **IPC**: Muito rápido (processo local)
- **HTTP**: ±100ms por request (localhost)
- **SQLite**: Rápido para operações simples
- **Cache**: localStorage para tokens

---

**Versão**: 1.0.0  
**Documento**: Arquitetura v1  
**Última atualização**: 12 de Maio de 2026
