const path = require("path");
const { spawn } = require("child_process");

const electronApi = require("electron");
if (typeof electronApi === "string" || !electronApi.app) {
  console.error(
    "[Electron] O API do Electron não carregou. Causas comuns:\n" +
      "  • Correr com `node` em vez do binário: use `npm run electron`.\n" +
      "  • Variável ELECTRON_RUN_AS_NODE=1 (alguns IDEs): desative-a para abrir a app em modo gráfico.\n"
  );
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, Menu, dialog } = electronApi;

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  // Erros GetVSyncParametersIfAvailable / gl_surface_presentation em Intel+Mesa antigos
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  if (process.env.ELECTRON_USE_GPU !== "1") {
    app.disableHardwareAcceleration();
  }
}

let mainWindow;
let backendProcess;
let authToken = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../index.html"));
  let shown = false;
  const showMain = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
    mainWindow.focus();
  };
  const fallbackShow = setTimeout(showMain, 5000);
  mainWindow.once("ready-to-show", () => {
    clearTimeout(fallbackShow);
    showMain();
  });

  if (process.env.NODE_ENV !== "production") {
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

function startBackend() {
  console.log("[Electron] Iniciando servidor backend...");
  
  // Detecção robusta se a aplicação está empacotada
  // app.isPackaged pode falhar em algumas versões/ambientes, então usamos redundâncias
  const isPackaged = app.isPackaged || !process.defaultApp || (process.mainModule && process.mainModule.filename.includes('app.asar'));
  
  // Em produção (empacotado), usamos o próprio executável do Electron para rodar o backend
  // Isso resolve o erro "spawn node ENOENT" pois não depende do Node.js estar instalado no cliente
  // Em desenvolvimento, mantemos 'node' para usar a versão do sistema se desejado
  const nodePath = isPackaged ? process.execPath : "node";
  
  const appPath = app.getAppPath();
  const serverPath = path.join(appPath, "electron", "server.js");
  
  console.log(`[Electron] Modo: ${isPackaged ? "PRODUÇÃO" : "DESENVOLVIMENTO"}`);
  console.log(`[Electron] nodePath: ${nodePath}`);

  const env = { 
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1"
  };

  // Em modo empacotado, o banco de dados DEVE ficar fora do ASAR (que é somente-leitura)
  if (isPackaged) {
    env.DB_PATH = path.join(app.getPath("userData"), "bizcontrol.db");
    console.log(`[Electron] DB_PATH Produção: ${env.DB_PATH}`);
  }

  // Configuração do spawn
  const spawnOptions = {
    cwd: isPackaged ? path.dirname(process.execPath) : appPath,
    stdio: "pipe",
    env,
    windowsHide: true // Oculta a janela de terminal no Windows
  };

  try {
    backendProcess = spawn(nodePath, [serverPath], spawnOptions);

    backendProcess.stdout.on("data", (data) => {
      console.log(`[Backend] ${data}`);
    });

    backendProcess.stderr.on("data", (data) => {
      console.error(`[Backend Error] ${data}`);
    });

    backendProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Electron] Backend terminou com código ${code}`);
      }
    });

    backendProcess.on("error", (err) => {
      console.error(`[Electron] Falha ao iniciar processo backend:`, err);
      if (isPackaged) {
        dialog.showErrorBox(
          "Erro de Inicialização",
          `Não foi possível iniciar o servidor interno.\n\nDetalhe: ${err.message}`
        );
      }
    });
  } catch (err) {
    console.error(`[Electron] Erro ao tentar spawnar o backend:`, err);
  }
}

async function waitForBackend() {
  const maxRetries = 30;
  const url = "http://127.0.0.1:3000/health"; // Usar o endpoint health check

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Electron] Tentativa de conexão ${i + 1}/${maxRetries}...`);
      const response = await fetch(url);
      if (response.ok) {
        console.log("[Electron] Backend está pronto!");
        return true;
      }
    } catch (e) {
      // Backend ainda não subiu
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

app.on("ready", async () => {
  startBackend();
  
  const isReady = await waitForBackend();
  
  if (isReady) {
    createWindow();
    createMenu();
  } else {
    dialog.showErrorBox(
      "Erro de Inicialização",
      "Não foi possível conectar ao servidor backend após 30 segundos.\n\nPor favor, reinicie a aplicação. Se o problema persistir, contacte o suporte."
    );
    app.quit();
  }
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    if (backendProcess) {
      backendProcess.kill();
    }
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle("api:request", async (event, { method, endpoint, data, token }) => {
  try {
    const url = `http://127.0.0.1:3000/api${endpoint}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const effectiveToken = token || authToken;
    if (effectiveToken && effectiveToken !== "null" && effectiveToken !== "undefined") {
      options.headers.Authorization = `Bearer ${effectiveToken}`;
    }

    if (data) {
      options.body = JSON.stringify(data);
    }

    const ms = Number(process.env.ELECTRON_FETCH_TIMEOUT_MS) || 25000;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), ms);
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }
    const raw = await response.text();
    let result = {};
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 200) || `Resposta inválida (HTTP ${response.status})`);
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        authToken = null; // Limpar token global se der erro de autenticação
      }
      throw new Error(result.message || result.error || `Erro HTTP ${response.status}`);
    }

    if (result.token) {
      authToken = result.token;
      if (mainWindow) {
        mainWindow.webContents.send("auth:token-updated", result.token);
      }
    }

    return result;
  } catch (error) {
    console.error("[IPC Error]", error);
    // Lançar o erro para que a promessa no renderizador seja rejeitada
    throw error;
  }
});

const createMenu = () => {
  const template = [
    {
      label: "BizController 360",
      submenu: [
        {
          label: "Sobre",
          click: () => {
            if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "Sobre BizController 360",
                message: "Sistema de Gestão de Stock & Vendas v1.0.0",
                detail: "© 2026 Elvatech. Todos os direitos reservados.",
              });
            }
          },
        },
        { type: "separator" },
        {
          label: "Sair",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            if (backendProcess) {
              backendProcess.kill();
            }
            app.quit();
          },
        },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Refazer", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "Cortar", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copiar", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Colar", accelerator: "CmdOrCtrl+V", role: "paste" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        {
          label: "Recarregar",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: "Ferramentas de Desenvolvimento",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
