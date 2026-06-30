# 📱 BizController 360 — Guia de Deploy Remoto (PWA Mobile)

## Como tornar o sistema acessível em qualquer lugar via Android

---

## Opção A — Railway.app (Recomendado, Grátis)

### 1. Criar conta
- Aceder a [railway.app](https://railway.app)
- Fazer login com GitHub

### 2. Preparar o projeto para deploy

Adicionar ao `.env` (ou configurar nas variáveis do Railway):

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=meu_segredo_super_seguro_aqui
ALLOW_ALL_ORIGINS=true
SUPABASE_URL=https://fumeskdjohvhclnltlnv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui
```

### 3. Criar `Procfile` (já criado automaticamente pelo Railway)
```
web: node electron/server.js
```

### 4. Deploy via GitHub
```bash
git add .
git commit -m "feat: PWA mobile + deploy remoto"
git push origin main
```
- No Railway: New Project → Deploy from GitHub → Selecionar o repositório

### 5. Obter URL
Após o deploy, o Railway dará uma URL como:
```
https://bizcontrol-production-xxxx.railway.app
```

### 6. Configurar no Android
- Abrir Chrome no Android
- Navegar para a URL do Railway
- Introduzir as credenciais de login
- Chrome vai sugerir "Instalar app" → Aceitar
- A app fica no ecrã inicial como se fosse nativa! ✅

---

## Opção B — Render.com (Grátis)

### 1. Aceder a [render.com](https://render.com)
### 2. New → Web Service → Connect GitHub
### 3. Configurar:
- **Build Command**: `npm install`
- **Start Command**: `node electron/server.js`
- **Environment**: Node
### 4. Adicionar variáveis de ambiente (mesmas que acima)

---

## Ícones PWA necessários

Criar manualmente (ou usar ferramenta online como [realfavicongenerator.net](https://realfavicongenerator.net)):
- `icon/icon-192.png` — 192×192px
- `icon/icon-512.png` — 512×512px

---

## Testar em Android (sem servidor remoto)

### Testar localmente com Wi-Fi

Se o tablet/telemóvel estiver na mesma rede que o PC:

1. Iniciar o servidor: `npm run dev`
2. Descobrir o IP do PC: `ipconfig` → ex: `192.168.1.100`
3. No Android, abrir: `http://192.168.1.100:3000`
4. Funciona em Wi-Fi local!

---

## Testar no Chrome (Simular Mobile)

1. Abrir `http://localhost:3000` no Chrome
2. `F12` → Ícone de dispositivo (Toggle Device Toolbar)
3. Selecionar "Galaxy S20" ou "Pixel 7"
4. Testar navegação, offline (Network → Offline), instalação PWA

---

## Capacitor — Preparar Build Android (Android Studio)

Siga estes passos para gerar o projeto Android e abrir no Android Studio:

1. Atualize a URL do servidor remoto usada pela app (substitua no arquivo `www/js/web-api-bridge.js`):

    - Localize `DEFAULT_REMOTE_SERVER_URL` no início do arquivo e defina sua URL pública, por exemplo `https://seu-backend.railway.app`.
    - Alternativamente, no dispositivo você pode definir dinamicamente a URL abrindo o console do app e executando:

```bash
localStorage.setItem('biz_server_url', 'https://seu-backend.railway.app')
```
    - Isso é importante para o APK instalado, pois o app Capacitor não usa `localhost:3000` por padrão.

2. Gerar os assets web e copiar para o projeto Capacitor:

```bash
npm run build:web
npm run build:mobile
# ou para abrir direto no Android Studio
npm run build:android-studio
```

3. Abra o projeto Android no Android Studio (se não usou `build:android-studio`):

```bash
npx cap open android
```

4. No Android Studio:
    - Aguarde a sincronização Gradle.
    - Conecte um dispositivo ou use um emulador (recomendado: API 30+).
    - Execute `Run` → selecione o dispositivo.

5. Notas de rede durante desenvolvimento:
    - Para apontar o app para um servidor local durante emulador Android, use `http://10.0.2.2:3000` como `biz_server_url`.
    - Em dispositivos físicos na mesma rede, use `http://<IP_DO_PC>:3000`.

6. CORS e variáveis do backend:
    - No servidor (variáveis `.env` ou host): defina `ALLOW_ALL_ORIGINS=true` em desenvolvimento ou adicione `ALLOWED_ORIGINS` com a URL da PWA/Capacitor.
    - Assegure que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estejam configuradas no `.env` do servidor remoto.

7. Testes recomendados após build:
    - Abrir app no dispositivo e tentar login com credenciais demo (ex.: `admin@bizcontrol.local` / `demo123`) — se for ambiente remoto, use um usuário existente no Supabase.
    - Verificar logs do backend para ver conexões e CORS.
    - Testar fluxo online/offline e sincronização de dados.

---

## Variáveis de Ambiente para Produção

```env
# Obrigatório
NODE_ENV=production
PORT=3000
JWT_SECRET=chave_muito_longa_e_aleatoria_aqui

# CORS — permitir a URL da PWA
ALLOWED_ORIGINS=https://meu-bizcontrol.railway.app
# OU para abrir tudo:
ALLOW_ALL_ORIGINS=true

# Supabase (licenças)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Base de dados (em produção, usar caminho persistente)
DB_PATH=/data/bizcontrol.db
```

---

## Estrutura Final do Sistema

```
┌──────────────────────────────┐
│   ANDROID (PWA)              │
│   Chrome / Samsung Browser   │
│   → Instalada como app       │
│   → Funciona Offline         │
│   → Sync automático          │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│   SERVIDOR (Railway/Render)  │
│   electron/server.js         │
│   Express + SQLite           │
│   Serve o frontend + API     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   DESKTOP (Windows)          │
│   Electron app               │
│   localhost:3000             │
│   Funciona independentemente │
└──────────────────────────────┘
```
