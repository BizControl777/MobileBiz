# ⚡ Quick Start - BizController 360

## 🚀 Em 5 Minutos

### 1. Setup (60 segundos)
```bash
cd novoprojectobiz
npm install
mkdir -p data
cp .env.example .env
```

### 2. Executar (30 segundos)
```bash
npm start
```

### 3. Login (30 segundos)
- Email: `vendedor@bizcontrol.local`
- Senha: `demo123`

✅ Pronto! A aplicação está a funcionar.

---

## 📱 O que foi integrado?

| Feature | Status | Localização |
|---------|--------|-------------|
| ✅ Backend API | Completo | `electron/server.js` |
| ✅ Banco de Dados | SQLite | `data/bizcontrol.db` |
| ✅ Autenticação | JWT | `/api/auth/login` |
| ✅ Produtos | CRUD | `/api/produtos` |
| ✅ Vendas | Registar | `/api/vendas` |
| ✅ Reservas | CRUD | `/api/reservas` |
| ✅ Electron | Desktop App | `electron/main.js` |
| ✅ IPC | Comunicação | `electron/preload.js` |

---

## 📁 Ficheiros Criados

```
✅ package.json           - Dependências e scripts
✅ .env.example           - Configuração modelo
✅ electron/main.js       - Electron principal
✅ electron/preload.js    - Segurança Electron
✅ electron/server.js     - Backend Express
✅ js/api.js              - Cliente API
✅ js/app-backend.js      - App com backend
✅ setup.sh               - Setup automático Linux
✅ setup.bat              - Setup automático Windows
✅ .gitignore             - Git ignore rules
✅ README.md              - Documentação geral
✅ GUIA_INSTALACAO.md     - Guia completo
✅ INTEGRACAO_FRONTEND.md - Como usar no frontend
✅ INTEGRACAO.md          - Detalhes técnicos
✅ QUICK_START.md         - Este ficheiro
```

---

## 🎯 Próximas Ações

### Para Desenvolvedores
1. [ ] Ler `GUIA_INSTALACAO.md`
2. [ ] Ler `INTEGRACAO_FRONTEND.md`
3. [ ] Executar `npm start`
4. [ ] Testar login e funcionalidades
5. [ ] Modificar `js/paginas/*.js` para usar API

### Para Produção
1. [ ] Alterar `JWT_SECRET` em `.env`
2. [ ] Testar com dados reais
3. [ ] Configurar backup do banco de dados
4. [ ] `npm run build` para criar executável

---

## 🔒 Credenciais Demo

```
👑 Super Admin: admin@bizcontrol.local / demo123
💼 Gestor:      gestor@bizcontrol.local / demo123
💳 Vendedor:    vendedor@bizcontrol.local / demo123
```

---

## 🆘 Problemas?

| Problema | Solução |
|----------|---------|
| Port 3000 em uso | `lsof -ti:3000 \| xargs kill -9` |
| Módulo não encontrado | `npm install` de novo |
| Database erro | Apagar `data/bizcontrol.db` |
| Permissions | `chmod +x setup.sh` |

---

## 📞 Scripts Disponíveis

```bash
npm start                 # Electron desktop app
npm run server            # Apenas backend
npm run dev               # Backend com auto-reload
npm run build             # Build executable (depois)
```

---

## 📚 Documentação

- **README.md** - Visão geral completa
- **GUIA_INSTALACAO.md** - Passo a passo detalhado
- **INTEGRACAO_FRONTEND.md** - Como integrar no código
- **INTEGRACAO.md** - Detalhes técnicos

---

## ✨ Começar a Programar

```javascript
// Exemplo: Adicionar novo endpoint no backend
// Editar: electron/server.js

app.get("/api/meu-endpoint", verifyToken, (req, res) => {
  res.json({ message: "Novo endpoint" });
});

// Usar no frontend: js/paginas/...
const dados = await api.get("/meu-endpoint");
```

---

**Versão**: 1.0.0  
**Última atualização**: 12 de Maio de 2026  
**Estado**: ✅ Pronto para uso
