import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;
import axios from "axios";

// Carregamento dinâmico do .env conforme o ambiente
const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const possibleEnvPaths = [
  path.join(appRoot, ".env"), // Desenvolvimento
  path.join(process.cwd(), ".env"), // Executável (mesma pasta)
  path.join(path.dirname(process.execPath), ".env") // Executável (pasta do .exe)
];

// Se houver uma variável de ambiente DB_PATH, o .env provavelmente está na pasta de dados do usuário
if (process.env.DB_PATH) {
  possibleEnvPaths.push(path.join(path.dirname(process.env.DB_PATH), ".env"));
}

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`[BACKEND] Carregando configurações de: ${envPath}`);
    dotenv.config({ path: envPath });
    break;
  }
}

// Polyfill WebSocket para evitar erro no Node < 20 com Supabase
if (typeof global.WebSocket === "undefined") {
  global.WebSocket = class {};
}

// Configurações Globais e Padrões de Produção
const DEFAULTS = {
  PORT: 3000,
  JWT_SECRET: "seu_segredo_jwt_muito_seguro_aqui",
  ADMIN_API_KEY: "chave_mestra_bizcontrol",
  SUPABASE_URL: "https://fumeskdjohvhclnltlnv.supabase.co",
  SUPABASE_KEY: "sb_secret_lT3AE9GChULI2BbtG7s5Hw_zDd7pfkS",
  REMOTE_LICENSE_API_URL: "https://api.bizcontrol.com",
  IS_LICENSING_SERVER: false
};

const PORT = process.env.PORT || DEFAULTS.PORT;
const JWT_SECRET = process.env.JWT_SECRET || DEFAULTS.JWT_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || DEFAULTS.ADMIN_API_KEY;
const IS_LICENSING_SERVER = process.env.IS_LICENSING_SERVER === "true" || DEFAULTS.IS_LICENSING_SERVER;
const REMOTE_LICENSE_API_URL = process.env.REMOTE_LICENSE_API_URL || DEFAULTS.REMOTE_LICENSE_API_URL;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || DEFAULTS.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULTS.SUPABASE_KEY;

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  realtime: {
    enabled: false
  }
}) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Helper para ID de máquina
const getDeviceId = () => {
  try {
    return machineIdSync();
  } catch (e) {
    return "unknown-device";
  }
};

// Helper para contar funcionários locais
const getLocalEmployeesCount = () => {
  return new Promise((resolve) => {
    try {
      const row = db.prepare("SELECT COUNT(*) as total FROM usuarios WHERE ativo = 1").get();
      const count = row ? (row.total || 0) : 0;
      console.log(`[COUNT SUCCESS] Total de funcionários ativos encontrados localmente: ${count}`);
      resolve(count);
    } catch (err) {
      console.error("[COUNT ERROR] Falha ao contar funcionários na tabela 'usuarios':", err.message);
      resolve(0);
    }
  });
};

// Middleware de Verificação de Licença (para uso no ERP Local)
const checkLocalLicense = (req, res, next) => {
  // Ignorar rotas de login, api de licença e estáticos
  if (req.path === "/health" || req.path.startsWith("/api/auth") || req.path.startsWith("/api/license") || req.path === "/api/login" || req.path.startsWith("/api/activate") || req.path.startsWith("/api/validate")) {
    return next();
  }

  try {
    const license = db.prepare("SELECT * FROM local_license LIMIT 1").get();
    if (!license) {
      return res.status(403).json({ message: "Licença não encontrada. Ative o sistema.", code: "NO_LICENSE" });
    }

    if (license.status === "blocked") {
      return res.status(403).json({ message: "Sua licença está bloqueada. Contacte o suporte.", code: "LICENSE_BLOCKED" });
    }

    if (new Date(license.expires_at) < new Date()) {
      return res.status(403).json({ message: "Sua licença expirou.", code: "LICENSE_EXPIRED" });
    }

    // Bloqueio parcial após 10 dias sem validação
    const dezDias = 10 * 24 * 60 * 60 * 1000;
    const tempoSemValidar = new Date() - new Date(license.last_validation_at);

    // Permitir apenas GET (visualizar dados) em bloqueio parcial
    const isCriticalRoute = req.method !== "GET";

    if (tempoSemValidar > dezDias) {
      if (isCriticalRoute) {
        return res.status(403).json({ 
          message: "Sua licença precisa ser validada. Conecte-se à internet para continuar realizando operações críticas (vendas, cadastros, etc).", 
          code: "VALIDATION_REQUIRED" 
        });
      }
    }

    next();
  } catch (err) {
    console.error("[LICENSE ERROR] Falha ao verificar licença:", err.message);
    return res.status(500).json({ message: "Erro interno ao verificar licença" });
  }
};

// ─────────────────────────────────────────────────────
// CORS — permite acesso local (Electron) E remoto (PWA)
// ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost",
  "http://127.0.0.1",
  // Adicionar origens de produção via variável de ambiente
  // ex: ALLOWED_ORIGINS=https://meu-bizcontrol.railway.app
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()) : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Electron e requests sem origem (curl, Postman) — sempre permitir
    if (!origin) return callback(null, true);
    // Origens explicitamente permitidas
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Railway/Render/Vercel deployments — permitir qualquer HTTPS em produção
    if (process.env.NODE_ENV === "production" || process.env.ALLOW_ALL_ORIGINS === "true") {
      return callback(null, true);
    }
    console.warn(`[CORS] Origem bloqueada: ${origin}`);
    callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Aplicar checkLocalLicense apenas se não estivermos no modo "Licensing Server"
if (!IS_LICENSING_SERVER) {
  app.use(checkLocalLicense);
}

// ... rest of setup ...

// Resolve DB path and ensure directory/file exist to avoid SQLITE_CANTOPEN
const defaultDbPath = path.resolve(path.join(__dirname, "..", "data", "bizcontrol.db"));
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

try {
  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });
  // Ensure the DB file exists (open with append flag creates if missing)
  const fd = fs.openSync(dbPath, "a");
  fs.closeSync(fd);
  try {
    fs.chmodSync(dbPath, 0o644);
  } catch (e) {
    // Non-fatal: permission change may fail on some filesystems
  }
} catch (err) {
  console.error("Erro ao criar diretório/ficheiro do DB:", err);
}

// Inicializar banco de dados
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
console.log("✓ Banco de dados conectado ->", dbPath);
initDatabase();

// Inicializar tabelas
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_license (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT,
      device_id TEXT,
      company_name TEXT,
      status TEXT,
      expires_at DATETIME,
      last_validation_at DATETIME,
      next_validation_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT DEFAULT 'vendedor',
      empresa_id INTEGER,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cnpj TEXT UNIQUE,
      endereco TEXT,
      telefone TEXT,
      email TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      empresa_id INTEGER,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria_id INTEGER,
      empresa_id INTEGER,
      preco_venda REAL NOT NULL,
      preco_custo REAL NOT NULL,
      stock REAL DEFAULT 0,
      stock_minimo REAL DEFAULT 10,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(categoria_id) REFERENCES categorias(id),
      FOREIGN KEY(empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      empresa_id INTEGER,
      total REAL NOT NULL,
      status TEXT DEFAULT 'concluida',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY(empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER,
      produto_id INTEGER,
      quantidade REAL NOT NULL,
      preco_unitario REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY(venda_id) REFERENCES vendas(id),
      FOREIGN KEY(produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER,
      empresa_id INTEGER,
      tipo TEXT,
      quantidade REAL,
      usuario_id INTEGER,
      descricao TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(produto_id) REFERENCES produtos(id),
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY(empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      produto_id INTEGER,
      empresa_id INTEGER,
      quantidade REAL NOT NULL,
      titular TEXT,
      bi TEXT,
      status TEXT DEFAULT 'Activa',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY(produto_id) REFERENCES produtos(id),
      FOREIGN KEY(empresa_id) REFERENCES empresas(id)
    );

    CREATE TABLE IF NOT EXISTS caixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER,
      usuario_abertura_id INTEGER,
      usuario_fechamento_id INTEGER,
      valor_inicial REAL DEFAULT 0,
      valor_fechamento REAL DEFAULT 0,
      valor_esperado REAL DEFAULT 0,
      diferenca REAL DEFAULT 0,
      status TEXT DEFAULT 'aberto',
      aberto_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      fechado_em DATETIME,
      observacoes TEXT,
      FOREIGN KEY(empresa_id) REFERENCES empresas(id),
      FOREIGN KEY(usuario_abertura_id) REFERENCES usuarios(id),
      FOREIGN KEY(usuario_fechamento_id) REFERENCES usuarios(id)
    );
  `);

  migrateProdutosColumns();
  migrateVendasColumns();
  migrateEmpresasColumns();
  migrateUsuariosColumns();
  migrateReservasColumns();
  migrateCaixasColumns();
  createFinanceiroTable();

  // Inserir dados demo
  const row = db.prepare("SELECT COUNT(*) as count FROM usuarios").get();
  if (row && row.count === 0) {
    insertDemoData();
  }
}

function migrateProdutosColumns() {
  const columns = [
    ["unidade_medida", "TEXT DEFAULT 'Unidade'"],
    ["qtd_por_caixa", "INTEGER DEFAULT 1"],
    ["preco_compra_caixa", "REAL DEFAULT 0"],
    ["preco_venda_caixa", "REAL DEFAULT 0"],
    ["tamanho", "TEXT"],
    ["marca", "TEXT"],
    ["descricao", "TEXT"],
    ["codigo_barras", "TEXT"],
    ["tipo_produto", "TEXT DEFAULT 'Unidade'"],
    ["lote", "TEXT"],
    ["data_fabricacao", "DATE"],
    ["data_validade", "DATE"],
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE produtos ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        // console.warn(`Falha ao migrar produtos.${name}:`, err.message);
      }
    }
  });
}

function migrateVendasColumns() {
  const columns = [
    ["metodo_pagamento", "TEXT DEFAULT 'dinheiro'"],
    ["status_pagamento", "TEXT DEFAULT 'pago'"],
    ["cliente_nome", "TEXT DEFAULT 'Cliente balcão'"],
    ["cliente_contacto", "TEXT"],
    ["valor_recebido", "REAL DEFAULT 0"],
    ["troco", "REAL DEFAULT 0"],
    ["caixa_id", "INTEGER"],
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE vendas ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        console.warn(`Falha ao migrar vendas.${name}:`, err.message);
      }
    }
  });
}

function migrateCaixasColumns() {
  const columns = [
    ["empresa_id", "INTEGER"],
    ["usuario_abertura_id", "INTEGER"],
    ["usuario_fechamento_id", "INTEGER"],
    ["valor_inicial", "REAL DEFAULT 0"],
    ["valor_fechamento", "REAL DEFAULT 0"],
    ["valor_esperado", "REAL DEFAULT 0"],
    ["diferenca", "REAL DEFAULT 0"],
    ["status", "TEXT DEFAULT 'aberto'"],
    ["aberto_em", "DATETIME DEFAULT CURRENT_TIMESTAMP"],
    ["fechado_em", "DATETIME"],
    ["observacoes", "TEXT"],
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE caixas ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        // ignorar
      }
    }
  });
}

function createFinanceiroTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transacoes_financeiras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER,
      usuario_id INTEGER,
      tipo TEXT,
      categoria TEXT,
      valor REAL,
      metodo_pagamento TEXT,
      data DATETIME DEFAULT CURRENT_TIMESTAMP,
      entidade_nome TEXT,
      observacao TEXT,
      FOREIGN KEY(empresa_id) REFERENCES empresas(id),
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )
  `);
}

function migrateEmpresasColumns() {
  const columns = [
    ["plano", "TEXT DEFAULT 'Mensal'"],
    ["data_expiracao", "DATETIME"],
    ["background_image", "TEXT"],
    ["bi", "TEXT"],
    ["empresario_nome", "TEXT"],
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE empresas ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        // ignorar
      }
    }
  });
}

function migrateUsuariosColumns() {
  const columns = [
    ["permissoes", "TEXT"], // JSON array
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE usuarios ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        // ignorar
      }
    }
  });
}

function migrateReservasColumns() {
  const columns = [
    ["titular", "TEXT"],
    ["bi", "TEXT"],
  ];
  columns.forEach(([name, type]) => {
    try {
      db.exec(`ALTER TABLE reservas ADD COLUMN ${name} ${type}`);
    } catch (err) {
      if (!String(err.message).includes("duplicate column")) {
        // ignorar
      }
    }
  });
}

function resolveCategoriaId(categoria_id, empresaId, callback) {
  if (categoria_id == null || categoria_id === "") return callback(null, null);

  const empresa = Number(empresaId);
  if (!empresa || Number.isNaN(empresa)) {
    return callback(new Error("Empresa não identificada na sessão"));
  }

  const isNumericId =
    typeof categoria_id === "number" ||
    (typeof categoria_id === "string" && /^\d+$/.test(categoria_id.trim()));

  if (isNumericId) {
    const id = Number(categoria_id);
    try {
      const row = db
        .prepare("SELECT id FROM categorias WHERE id = ? AND empresa_id = ? AND ativo = 1")
        .get(id, empresa);
      if (row) return callback(null, row.id);
      return callback(new Error(`Categoria inválida (ID ${id}). Seleccione outra categoria.`));
    } catch (err) {
      return callback(err);
    }
  }

  const nome = String(categoria_id).trim();
  if (!nome) return callback(null, null);

  try {
    const row = db
      .prepare("SELECT id FROM categorias WHERE nome = ? AND empresa_id = ? AND ativo = 1")
      .get(nome, empresa);
    if (row) return callback(null, row.id);
    const info = db.prepare("INSERT INTO categorias (nome, empresa_id) VALUES (?, ?)").run(nome, empresa);
    callback(null, info.lastInsertRowid);
  } catch (err) {
    callback(err);
  }
}

function getEmpresaIdForRequest(req) {
  const fromToken = Number(req.empresaId);
  if (fromToken && !Number.isNaN(fromToken)) {
    const row = db.prepare("SELECT id FROM empresas WHERE id = ? AND ativo = 1").get(fromToken);
    if (row) return row.id;
  }

  const userId = req.userId;
  const email = req.userEmail || "";
  if (userId != null || email) {
    const user = db
      .prepare("SELECT empresa_id FROM usuarios WHERE (id = ? OR email = ?) AND ativo = 1 LIMIT 1")
      .get(userId, email);
    if (user?.empresa_id) {
      const row = db.prepare("SELECT id FROM empresas WHERE id = ? AND ativo = 1").get(user.empresa_id);
      if (row) return row.id;
    }
  }

  const fallback = db.prepare("SELECT id FROM empresas WHERE ativo = 1 ORDER BY id LIMIT 1").get();
  return fallback?.id || null;
}

// Inserir dados de demonstração
function insertDemoData() {
  const hashedPassword = bcrypt.hashSync("demo123", 10);

  try {
    db.prepare("INSERT INTO empresas (nome, cnpj, endereco, telefone, email) VALUES (?, ?, ?, ?, ?)").run(
      "BizControl Demo",
      "12345678000100",
      "Maputo, Moçambique",
      "+258123456789",
      "contact@bizcontrol.local"
    );

    const row = db.prepare("SELECT id FROM empresas LIMIT 1").get();
    if (row) {
      const empresaId = row.id;

      db.prepare(
        "INSERT INTO usuarios (nome, email, senha, role, empresa_id) VALUES (?, ?, ?, ?, ?)"
      ).run("Admin", "admin@bizcontrol.local", hashedPassword, "super", empresaId);

      db.prepare(
        "INSERT INTO usuarios (nome, email, senha, role, empresa_id) VALUES (?, ?, ?, ?, ?)"
      ).run("Gestor", "gestor@bizcontrol.local", hashedPassword, "gestor", empresaId);

      db.prepare(
        "INSERT INTO usuarios (nome, email, senha, role, empresa_id) VALUES (?, ?, ?, ?, ?)"
      ).run("Vendedor", "vendedor@bizcontrol.local", hashedPassword, "vendedor", empresaId);

      // Categorias
      const categorias = ["Bebidas", "Alimentos", "Higiene", "Electrónica"];
      const insertCat = db.prepare("INSERT INTO categorias (nome, empresa_id) VALUES (?, ?)");
      categorias.forEach((cat) => {
        insertCat.run(cat, empresaId);
      });

      // Inserir licença demo local para permitir o fluxo de teste do app mobile
      const now = new Date();
      const nextValidation = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      db.prepare(
        "INSERT INTO local_license (license_key, device_id, company_name, status, expires_at, last_validation_at, next_validation_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "DEMO-0000-0000-0000",
        "demo-device",
        "BizControl Demo",
        "active",
        new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        nextValidation.toISOString()
      );

      console.log("✓ Dados de demonstração inseridos");
    }
  } catch (err) {
    console.error("Erro ao inserir dados demo:", err.message);
  }
}

// Middleware de autenticação
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.role = decoded.role;
    req.empresaId = decoded.empresaId;
    // Resolver empresa real (token pode ter empresaId ausente/incorreto após login Supabase)
    req.empresaId = getEmpresaIdForRequest(req);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

// ===== SISTEMA DE LICENCIAMENTO (SUPABASE / HYBRID) =====

// ATIVAÇÃO (Chamado pelo ERP para ativar uma chave)
app.post("/api/activate", async (req, res) => {
  const { license_key, company_name, phone } = req.body;
  const device_id = getDeviceId();
  const ip = req.ip;

  console.log(`[LICENSE] Tentativa de ativação: Key=${license_key}, Device=${device_id}`);

  if (!license_key) return res.status(400).json({ message: "Chave de licença obrigatória" });

  try {
    let activationData = null;

    // 1. Tentar ativação direta via Supabase se configurado
    if (supabase) {
      console.log("[LICENSE] Tentando ativação direta via Supabase...");
      const { data: license, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("license_key", license_key)
        .single();

      if (error || !license) {
        return res.status(404).json({ message: "Chave de licença não encontrada ou inválida no Supabase." });
      }

      if (license.device_id && license.device_id !== device_id) {
        return res.status(403).json({ message: "Esta licença já está vinculada a outro computador." });
      }

      const isYearly = license.plan === "yearly";
      const expiresAt = license.expires_at ? new Date(license.expires_at) : new Date();
      if (!license.expires_at) {
        expiresAt.setDate(expiresAt.getDate() + (isYearly ? 365 : 30));
      }
      
      const nextValidation = new Date();
      nextValidation.setDate(nextValidation.getDate() + 10);

      const { error: updError } = await supabase
        .from("licenses")
        .update({
          device_id,
          company_name: company_name || license.company_name,
          phone: phone || license.phone,
          status: "active",
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          last_validation_at: new Date().toISOString(),
          next_validation_at: nextValidation.toISOString(),
          last_ip: ip
        })
        .eq("license_key", license_key);

      if (updError) throw updError;

      activationData = {
        status: "active",
        expires_at: expiresAt.toISOString(),
        next_validation_at: nextValidation.toISOString(),
        company_name: company_name || license.company_name
      };
    } 
    // 2. Se não houver Supabase, tentar via API remota
    else {
      const apiUrl = REMOTE_LICENSE_API_URL;
      if (!apiUrl) return res.status(500).json({ message: "Configuração de conexão (Supabase ou API Remota) ausente." });

      console.log("[LICENSE] Tentando ativação via API remota...");
      const response = await axios.post(`${apiUrl}/api/activate`, {
        license_key, company_name, phone, device_id
      });
      activationData = response.data;
    }

    // 3. Guardar localmente para funcionamento offline (Sempre ocorre se a ativação acima deu certo)
    if (activationData) {
      db.prepare(`
        INSERT OR REPLACE INTO local_license 
        (id, license_key, device_id, company_name, status, expires_at, last_validation_at, next_validation_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        license_key, 
        device_id, 
        company_name || activationData.company_name, 
        activationData.status, 
        activationData.expires_at, 
        new Date().toISOString(), 
        activationData.next_validation_at
      );

      console.log(`[LICENSE] Ativação concluída e salva localmente: ${license_key}`);
      return res.json(activationData);
    }

  } catch (err) {
    console.error("[LICENSE] Erro na ativação:", err.message);
    res.status(500).json({ 
      message: "Erro ao processar ativação: " + (err.response?.data?.message || err.message) 
    });
  }
});

// VALIDAÇÃO PERIÓDICA
app.post("/api/validate", async (req, res) => {
  const { license_key, version } = req.body;
  const device_id = getDeviceId();
  const ip = req.ip;

  try {
    let statusData = null;

    // 1. Tentar validação direta via Supabase
    if (supabase) {
      console.log(`[VALIDATE] Validando chave ${license_key} via Supabase...`);
      const { data: license, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("license_key", license_key)
        .single();

      if (error || !license) return res.status(404).json({ message: "Licença inválida no Supabase" });
      
      if (license.device_id && license.device_id !== device_id) {
        return res.status(403).json({ message: "Este dispositivo não tem permissão para usar esta licença." });
      }

      if (license.status === "blocked") {
        statusData = { status: "blocked", message: "Esta licença foi bloqueada pelo administrador." };
      } else if (new Date(license.expires_at) < new Date()) {
        await supabase.from("licenses").update({ status: "expired" }).eq("license_key", license_key);
        statusData = { status: "expired", message: "Sua licença expirou." };
      } else {
        const nextValidation = new Date();
        nextValidation.setDate(nextValidation.getDate() + 10);
        const totalEmployees = await getLocalEmployeesCount();

        await supabase
          .from("licenses")
          .update({
            last_validation_at: new Date().toISOString(),
            next_validation_at: nextValidation.toISOString(),
            version: version || license.version,
            last_ip: ip,
            device_id: device_id,
            total_employees: totalEmployees
          })
          .eq("license_key", license_key);

        statusData = {
          status: license.status,
          expires_at: license.expires_at,
          next_validation_at: nextValidation.toISOString()
        };
      }
    } 
    // 2. Se não houver Supabase, tentar API remota
    else {
      const apiUrl = REMOTE_LICENSE_API_URL;
      if (apiUrl) {
        console.log("[VALIDATE] Tentando via API remota...");
        const response = await axios.post(`${apiUrl}/api/validate`, { license_key, device_id, version });
        statusData = response.data;
      }
    }

    // 3. Atualizar Cache Local ou Fallback Offline
    if (statusData) {
      db.prepare(`
        UPDATE local_license SET 
        status = ?, expires_at = ?, last_validation_at = ?, next_validation_at = ?
        WHERE license_key = ?`
      ).run(statusData.status, statusData.expires_at, new Date().toISOString(), statusData.next_validation_at, license_key);
      
      return res.json(statusData);
    } else {
      // Fallback local se estiver offline e sem comunicação
      const license = db.prepare("SELECT * FROM local_license WHERE license_key = ?").get(license_key);
      if (!license) return res.status(404).json({ message: "Licença não encontrada localmente. Conecte-se à internet." });
      
      return res.json({
        status: license.status,
        expires_at: license.expires_at,
        next_validation_at: license.next_validation_at,
        offline: true
      });
    }

  } catch (err) {
    console.error("[LICENSE] Erro na validação:", err.message);
    res.status(500).json({ message: "Erro na validação" });
  }
});

// BLOQUEIO/DESBLOQUEIO (ADMIN)
app.post("/api/block", async (req, res) => {
  const { license_key, api_key, status } = req.body;
  const newStatus = status === "active" ? "active" : "blocked";

  if (api_key !== ADMIN_API_KEY) {
    console.warn(`[SECURITY] Tentativa de acesso não autorizado ao endpoint de bloqueio. IP=${req.ip}`);
    return res.status(401).json({ message: "Acesso negado. Chave de API inválida." });
  }

  try {
    if (IS_LICENSING_SERVER && supabase) {
      const { error } = await supabase
        .from("licenses")
        .update({ status: newStatus })
        .eq("license_key", license_key);
      
      if (error) throw error;
      
      console.log(`[LICENSE] Status da licença ${license_key} alterado para ${newStatus} via Admin.`);
      res.json({ message: `Licença ${newStatus === "active" ? "desbloqueada" : "bloqueada"} com sucesso` });
    } else {
      // MODO CLIENTE: Repassar para o servidor de licenciamento
      const apiUrl = REMOTE_LICENSE_API_URL;
      if (!apiUrl) return res.status(500).json({ message: "Configuração de servidor remoto ausente." });

      const response = await axios.post(`${apiUrl}/api/block`, { license_key, api_key, status: newStatus });
      res.json(response.data);
    }
  } catch (err) {
    console.error("[LICENSE] Erro ao alterar status da licença:", err.message);
    res.status(500).json({ message: "Erro ao processar alteração de status" });
  }
});

// GET STATUS LOCAL
app.get("/api/license/status", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM local_license LIMIT 1").get();
    const status = row || { status: "none" };
    console.log("[LICENSE] Status local solicitado:", status.status, row ? `(Key: ${row.license_key})` : "(Sem licença)");
    res.json(status);
  } catch (err) {
    console.error("[LICENSE] Erro ao buscar status local:", err);
    return res.status(500).json({ message: "Erro ao buscar licença" });
  }
});

// LISTAR LICENÇAS (SUPER ADMIN)
app.get("/api/super/licenses", verifyToken, async (req, res) => {
  if (req.role !== "super") return res.status(403).json({ message: "Acesso negado" });

  try {
    if (IS_LICENSING_SERVER && supabase) {
      const { data, error } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data);
    } else {
      const apiUrl = REMOTE_LICENSE_API_URL;
      const response = await axios.get(`${apiUrl}/api/super/licenses`, {
        params: { api_key: ADMIN_API_KEY }
      });
      res.json(response.data);
    }
  } catch (err) {
    res.status(500).json({ message: "Erro ao listar licenças" });
  }
});

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post("/api/auth/login", async (req, res) => {
  const { email, senha, isOnline } = req.body;

  try {
    let user = null;

    // 1. TENTATIVA DE LOGIN ONLINE (Prioritário se houver internet)
    if (isOnline && supabase) {
      console.log("ONLINE LOGIN");
      
      // Consultar Supabase na tabela 'licenses' conforme nova estrutura
      const { data: license, error: supaError } = await supabase
        .from("licenses")
        .select("*")
        .eq("login_email", email)
        .single();

      if (license && !supaError) {
        console.log("USER FOUND IN SUPABASE (LICENSES TABLE)");

        // Verificar se a licença está bloqueada
        if (license.status === "blocked") {
          return res.status(403).json({ message: "Esta licença está bloqueada. Contacte o suporte." });
        }
        
        // Verificar senha (login_password)
        const senhaHash = license.login_password;
        if (!senhaHash) {
          return res.status(401).json({ message: "Utilizador sem senha configurada no Supabase." });
        }

        // Suporte Híbrido: Bcrypt ou Texto Limpo (para migração automática)
        const isBcrypt = senhaHash.startsWith("$2b$") || senhaHash.startsWith("$2a$");
        let passwordValid = false;

        if (isBcrypt) {
          passwordValid = bcrypt.compareSync(senha, senhaHash);
        } else {
          // Se não for bcrypt, comparamos texto limpo diretamente
          passwordValid = (senha === senhaHash);
          
          // AUTO-MIGRAÇÃO: Se a senha em texto limpo estiver correta, convertemos para Bcrypt no Supabase agora mesmo
          if (passwordValid) {
            console.log(`[AUTH] Migrando senha de texto limpo para Bcrypt para: ${email}`);
            const newHash = bcrypt.hashSync(senha, 10);
            await supabase.from("licenses").update({ login_password: newHash }).eq("login_email", email);
            // Usamos o novo hash para a sincronização local abaixo
            license.login_password = newHash;
          }
        }
        
        if (passwordValid) {
          // SINCRONIZAÇÃO: Garantir que a empresa existe localmente
          let empresaId;
          const empresaRow = db.prepare("SELECT id FROM empresas WHERE nome = ?").get(license.company_name);
          if (empresaRow) {
            empresaId = empresaRow.id;
          } else {
            const info = db.prepare("INSERT INTO empresas (nome, email, telefone, ativo) VALUES (?, ?, ?, ?)").run(
              license.company_name, license.login_email, license.phone, 1
            );
            empresaId = info.lastInsertRowid;
          }

          // SINCRONIZAÇÃO: Atualizar cache do utilizador
          const currentHash = license.login_password; // Pode ter sido atualizado na auto-migração
          const perms = JSON.stringify(["admin", "all"]);
          
          // HEARTBEAT: Atualizar Supabase com dados do hardware e acesso
          const currentDeviceId = getDeviceId();
          const currentIp = req.ip;
          const totalEmployees = await getLocalEmployeesCount();
          
          if (supabase) {
            await supabase
              .from("licenses")
              .update({
                last_validation_at: new Date().toISOString(),
                device_id: currentDeviceId,
                last_ip: currentIp,
                total_employees: totalEmployees
              })
              .eq("license_key", license.license_key);
            console.log(`[HEARTBEAT] Atualizado via Login: ${license.license_key} (Funcionários: ${totalEmployees})`);
          }
          
          try {
            const existingUser = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(license.login_email);
            if (existingUser) {
              db.prepare(`
                UPDATE usuarios SET
                  nome = ?,
                  senha = ?,
                  role = ?,
                  empresa_id = ?,
                  ativo = ?,
                  permissoes = ?
                WHERE email = ?`
              ).run(license.owner_name || license.company_name, currentHash, "gestor", empresaId, 1, perms, license.login_email);
            } else {
              db.prepare(`
                INSERT INTO usuarios (nome, email, senha, role, empresa_id, ativo, permissoes)
                VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).run(license.owner_name || license.company_name, license.login_email, currentHash, "gestor", empresaId, 1, perms);
            }
            console.log("[SYNC] Dados locais atualizados com sucesso");
          } catch (syncErr) {
            console.error("[SYNC] Erro ao atualizar cache local:", syncErr.message);
          }

          // SINCRONIZAÇÃO DA LICENÇA: Atualizar a licença local com a do Supabase
          try {
            let nextVal = license.next_validation_at;
            if (!nextVal) {
              const d = new Date();
              d.setDate(d.getDate() + 10);
              nextVal = d.toISOString();
            }
            db.prepare(`
              INSERT OR REPLACE INTO local_license 
              (id, license_key, device_id, company_name, status, expires_at, last_validation_at, next_validation_at)
              VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              license.license_key,
              currentDeviceId,
              license.company_name,
              license.status,
              license.expires_at,
              new Date().toISOString(),
              nextVal
            );
            console.log(`[SYNC] Licença local sincronizada com sucesso no login. Key: ${license.license_key}`);
          } catch (licSyncErr) {
            console.error("[SYNC] Erro ao sincronizar licença local no login:", licSyncErr.message);
          }

          // Preparar objeto do utilizador para a resposta (ID numérico da BD local)
          const syncedUser = db.prepare("SELECT id, nome, email, role, empresa_id, permissoes FROM usuarios WHERE email = ?").get(license.login_email);
          user = {
            id: syncedUser?.id ?? license.login_email,
            nome: syncedUser?.nome || license.owner_name || license.company_name,
            email: license.login_email,
            role: syncedUser?.role || "gestor",
            empresa_id: syncedUser?.empresa_id || empresaId,
            permissoes: syncedUser?.permissoes
              ? (typeof syncedUser.permissoes === "string" ? JSON.parse(syncedUser.permissoes) : syncedUser.permissoes)
              : ["admin", "all"],
          };
        } else {
          return res.status(401).json({ message: "Senha incorreta no Supabase" });
        }
      } else if (supaError && supaError.code !== 'PGRST116') {
        console.warn("[ONLINE] Erro ao conectar ao Supabase, tentando fallback offline...");
      } else if (!license) {
        console.log("USER NOT FOUND IN SUPABASE");
        // Não retornar erro aqui, permitir tentar offline caso o utilizador já exista localmente
      }
    }

    // 2. TENTATIVA DE LOGIN OFFLINE (Fallback ou Sem Internet)
    if (!user) {
      console.log("OFFLINE LOGIN");
      
      const localUser = db.prepare("SELECT * FROM usuarios WHERE email = ? AND ativo = 1").get(email);
      if (!localUser) {
        console.log("USER NOT FOUND");
        return res.status(401).json({ message: "Sem dados locais disponíveis para este email. Conecte-se à internet para o primeiro acesso." });
      }

      console.log("USER FOUND IN LOCAL CACHE");
      
      const passwordValid = bcrypt.compareSync(senha, localUser.senha);
      if (!passwordValid) {
        return res.status(401).json({ message: "Senha incorreta (Modo Offline)" });
      }

      user = localUser;
    }

    if (user) {
      return finalizeLogin(user, res);
    }

  } catch (error) {
    console.error("[LOGIN ERROR]", error);
    res.status(500).json({ message: "Erro ao processar login: " + error.message });
  }
});

function finalizeLogin(user, res) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, empresaId: user.empresa_id },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      empresa_id: user.empresa_id,
      permissoes: typeof user.permissoes === 'string' ? JSON.parse(user.permissoes) : (user.permissoes || [])
    },
  });
}

// ===== ROTAS DE CATEGORIAS =====
app.get("/api/categorias", verifyToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT id, nome FROM categorias WHERE empresa_id = ? AND ativo = 1 ORDER BY nome").all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar categorias" });
  }
});

app.post("/api/categorias", verifyToken, (req, res) => {
  const { nome } = req.body;
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ message: "Nome da categoria é obrigatório" });
  }
  try {
    const row = db.prepare("SELECT id FROM categorias WHERE nome = ? AND empresa_id = ?").get(nome.trim(), req.empresaId);
    if (row) return res.json({ id: row.id, message: "Categoria já existe" });
    
    const info = db.prepare("INSERT INTO categorias (nome, empresa_id) VALUES (?, ?)").run(nome.trim(), req.empresaId);
    res.json({ id: info.lastInsertRowid, message: "Categoria criada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao criar categoria" });
  }
});

function fetchProdutoRow(id, empresaId) {
  return db
    .prepare(
      `SELECT p.*, c.nome AS categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = ? AND p.empresa_id = ? AND p.ativo = 1`
    )
    .get(id, empresaId);
}

const PRODUTOS_SELECT = `
  SELECT p.*, c.nome AS categoria_nome
  FROM produtos p
  LEFT JOIN categorias c ON p.categoria_id = c.id
  WHERE p.empresa_id = ? AND p.ativo = 1
  ORDER BY p.nome
`;

app.get("/api/produtos", verifyToken, (req, res) => {
  try {
    if (!req.empresaId) {
      return res.status(400).json({ message: "Empresa não encontrada para esta sessão." });
    }
    const rows = db.prepare(PRODUTOS_SELECT).all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar produtos" });
  }
});

app.post("/api/produtos", verifyToken, (req, res) => {
  const {
    nome,
    tipo_produto,
    categoria_id,
    preco_venda,
    preco_custo,
    stock_minimo,
    stock,
    unidade_medida,
    qtd_por_caixa,
    preco_compra_caixa,
    preco_venda_caixa,
    tamanho,
    marca,
    descricao,
    codigo_barras,
    lote,
    data_fabricacao,
    data_validade,
  } = req.body;

  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ message: "Nome do produto é obrigatório" });
  }

  const custo = Number(preco_custo ?? 0);
  const venda = Number(preco_venda ?? 0);
  if (venda <= 0) {
    return res.status(400).json({ message: "Preço de venda deve ser maior que zero" });
  }
  if (custo > 0 && venda < custo) {
    return res.status(400).json({ message: "Margem negativa bloqueada: preço de venda abaixo do custo" });
  }

  const empresaId = getEmpresaIdForRequest(req);
  if (!empresaId) {
    return res.status(400).json({ message: "Empresa não encontrada para esta sessão. Faça login novamente." });
  }

  resolveCategoriaId(categoria_id, empresaId, (catErr, catId) => {
    if (catErr) {
      const msg = String(catErr.message || "");
      if (msg.includes("Categoria inválida") || msg.includes("Empresa não identificada")) {
        return res.status(400).json({ message: msg });
      }
      return res.status(500).json({ message: "Erro ao resolver categoria" });
    }

    const qtdCx = Math.max(1, Number(qtd_por_caixa) || 1);
    const precoCx = Number(preco_venda_caixa) || venda * qtdCx;
    const compraCx = Number(preco_compra_caixa) || custo * qtdCx;

    try {
      const info = db.prepare(
        `INSERT INTO produtos (
          nome, tipo_produto, categoria_id, empresa_id, preco_venda, preco_custo, stock, stock_minimo,
          unidade_medida, qtd_por_caixa, preco_compra_caixa, preco_venda_caixa, tamanho, marca, descricao, codigo_barras,
          lote, data_fabricacao, data_validade
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        nome.trim(),
        tipo_produto || "Unidade",
        catId,
        empresaId,
        venda,
        custo,
        Number(stock) || 0,
        Number(stock_minimo) ?? 10,
        unidade_medida || "Unidade",
        qtdCx,
        compraCx,
        precoCx,
        tamanho || null,
        marca || null,
        descricao || null,
        codigo_barras || null,
        lote || null,
        data_fabricacao || null,
        data_validade || null,
      );
      const row = fetchProdutoRow(info.lastInsertRowid, empresaId);
      res.json(row || { id: info.lastInsertRowid, message: "Produto criado com sucesso" });
    } catch (err) {
      res.status(500).json({ message: "Erro ao criar produto: " + err.message });
    }
  });
});

app.put("/api/produtos/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const empresaId = getEmpresaIdForRequest(req);
  if (!empresaId) {
    return res.status(400).json({ message: "Empresa não encontrada para esta sessão. Faça login novamente." });
  }

  try {
    const produto = db.prepare("SELECT * FROM produtos WHERE id = ? AND empresa_id = ?").get(id, empresaId);
    if (!produto) return res.status(404).json({ message: "Produto não encontrado" });

    const applyUpdate = (catId) => {
      const nome = body.nome != null ? body.nome : produto.nome;
      const tipo_produto = body.tipo_produto != null ? body.tipo_produto : produto.tipo_produto;
      const preco_venda = body.preco_venda != null ? Number(body.preco_venda) : produto.preco_venda;
      const preco_custo = body.preco_custo != null ? Number(body.preco_custo) : produto.preco_custo;
      const stock = body.stock != null ? Number(body.stock) : produto.stock;
      const stock_minimo = body.stock_minimo != null ? Number(body.stock_minimo) : produto.stock_minimo;
      const categoria_id = catId != null ? catId : produto.categoria_id;
      const unidade_medida = body.unidade_medida ?? produto.unidade_medida;
      const qtd_por_caixa = body.qtd_por_caixa != null ? Math.max(1, Number(body.qtd_por_caixa)) : produto.qtd_por_caixa;
      const preco_compra_caixa = body.preco_compra_caixa != null ? Number(body.preco_compra_caixa) : produto.preco_compra_caixa;
      const preco_venda_caixa = body.preco_venda_caixa != null ? Number(body.preco_venda_caixa) : produto.preco_venda_caixa;
      const tamanho = body.tamanho !== undefined ? body.tamanho : produto.tamanho;
      const marca = body.marca !== undefined ? body.marca : produto.marca;
      const descricao = body.descricao !== undefined ? body.descricao : produto.descricao;
      const codigo_barras = body.codigo_barras !== undefined ? body.codigo_barras : produto.codigo_barras;

      if (preco_venda <= 0) {
        return res.status(400).json({ message: "Preço de venda deve ser maior que zero" });
      }
      if (preco_custo > 0 && preco_venda < preco_custo) {
        return res.status(400).json({ message: "Margem negativa bloqueada: preço de venda abaixo do custo" });
      }

      db.prepare(
        `UPDATE produtos SET
          nome = ?, tipo_produto = ?, categoria_id = ?, preco_venda = ?, preco_custo = ?, stock = ?, stock_minimo = ?,
          unidade_medida = ?, qtd_por_caixa = ?, preco_compra_caixa = ?, preco_venda_caixa = ?,
          tamanho = ?, marca = ?, descricao = ?, codigo_barras = ?
        WHERE id = ? AND empresa_id = ?`
      ).run(
        nome,
        tipo_produto,
        categoria_id,
        preco_venda,
        preco_custo,
        stock,
        stock_minimo,
        unidade_medida,
        qtd_por_caixa,
        preco_compra_caixa,
        preco_venda_caixa,
        tamanho,
        marca,
        descricao,
        codigo_barras,
        id,
        empresaId,
      );
      res.json({ message: "Produto atualizado com sucesso" });
    };

    if (body.categoria_id != null) {
      resolveCategoriaId(body.categoria_id, empresaId, (catErr, catId) => {
        if (catErr) {
          const msg = String(catErr.message || "");
          if (msg.includes("Categoria inválida") || msg.includes("Empresa não identificada")) {
            return res.status(400).json({ message: msg });
          }
          return res.status(500).json({ message: "Erro ao resolver categoria" });
        }
        applyUpdate(catId);
      });
    } else {
      applyUpdate(null);
    }
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar produto" });
  }
});

app.delete("/api/produtos/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  try {
    const info = db.prepare("UPDATE produtos SET ativo = 0 WHERE id = ? AND empresa_id = ?").run(id, req.empresaId);
    if (info.changes === 0) return res.status(404).json({ message: "Produto não encontrado" });
    res.json({ message: "Produto removido com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao remover produto" });
  }
});

// ===== MOVIMENTAÇÕES DE STOCK =====
app.post("/api/movimentacoes", verifyToken, (req, res) => {
  const { produto_id, quantidade, tipo, descricao, observacao } = req.body;
  const qty = Math.abs(Number(quantidade) || 0);
  if (!produto_id || qty <= 0) {
    return res.status(400).json({ message: "Produto e quantidade são obrigatórios" });
  }

  const tipoNorm = String(tipo || "entrada").toLowerCase();
  const desc = descricao || observacao || `Movimento: ${tipoNorm}`;

  try {
    const produto = db.prepare("SELECT stock FROM produtos WHERE id = ? AND empresa_id = ? AND ativo = 1").get(produto_id, req.empresaId);
    if (!produto) return res.status(404).json({ message: "Produto não encontrado" });

    let delta = qty;
    if (tipoNorm === "saida" || tipoNorm === "venda") delta = -qty;
    if (tipoNorm === "entrada") delta = qty;

    const novoStock = produto.stock + delta;
    if (novoStock < 0) {
      return res.status(400).json({ message: "Stock insuficiente para esta operação" });
    }

    const info = db.prepare(
      "INSERT INTO movimentacoes_stock (produto_id, empresa_id, tipo, quantidade, usuario_id, descricao) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(produto_id, req.empresaId, tipoNorm, qty, req.userId, desc);
    
    db.prepare("UPDATE produtos SET stock = ? WHERE id = ?").run(novoStock, produto_id);
    res.json({ id: info.lastInsertRowid, stock: novoStock, message: "Movimento registado com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao registar movimento" });
  }
});

app.get("/api/movimentacoes", verifyToken, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT m.*, p.nome AS produto_nome, p.preco_custo AS produto_preco_custo,
              u.nome AS usuario_nome
       FROM movimentacoes_stock m
       LEFT JOIN produtos p ON m.produto_id = p.id
       LEFT JOIN usuarios u ON m.usuario_id = u.id
       WHERE m.empresa_id = ?
       ORDER BY m.criado_em DESC
       LIMIT 500`
    ).all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar movimentos" });
  }
});

// ===== ROTAS DE CAIXA =====
app.get("/api/caixas/atual", verifyToken, (req, res) => {
  try {
    const row = db.prepare(
      `SELECT c.*, u.nome as operador_abertura 
       FROM caixas c 
       LEFT JOIN usuarios u ON c.usuario_abertura_id = u.id
       WHERE c.empresa_id = ? AND c.status = 'aberto' 
       ORDER BY c.aberto_em DESC LIMIT 1`
    ).get(req.empresaId);
    res.json(row || null);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar caixa" });
  }
});

app.post("/api/caixas/abrir", verifyToken, (req, res) => {
  const { valor_inicial } = req.body;
  
  try {
    // 1. Verificar se já existe um caixa ABERTO
    const row = db.prepare("SELECT id FROM caixas WHERE empresa_id = ? AND status = 'aberto'").get(req.empresaId);
    if (row) return res.status(400).json({ message: "Já existe um caixa aberto para esta empresa. Feche-o antes de abrir um novo." });

    const info = db.prepare(
      `INSERT INTO caixas (empresa_id, usuario_abertura_id, valor_inicial, status, aberto_em) 
       VALUES (?, ?, ?, 'aberto', datetime('now', 'localtime'))`
    ).run(req.empresaId, req.userId, Number(valor_inicial) || 0);
    res.json({ id: info.lastInsertRowid, message: "Caixa aberto com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao abrir caixa" });
  }
});

app.post("/api/caixas/reabrir", verifyToken, (req, res) => {
  const { id } = req.body;
  
  try {
    const caixa = db.prepare("SELECT * FROM caixas WHERE id = ? AND empresa_id = ?").get(id, req.empresaId);
    if (!caixa) return res.status(404).json({ message: "Caixa não encontrado" });
    if (caixa.status === 'aberto') return res.status(400).json({ message: "O caixa já está aberto" });

    // Validar janela de 4 horas usando a hora do servidor para consistência
    const fechadoEm = new Date(caixa.fechado_em).getTime();
    const agora = new Date().getTime();
    const milissegundosPassados = agora - fechadoEm;
    const horasPassadas = milissegundosPassados / (1000 * 60 * 60);

    if (horasPassadas > 4) {
      return res.status(403).json({ message: "A janela de 4 horas para reabertura expirou." });
    }

    db.prepare("UPDATE caixas SET status = 'aberto', fechado_em = NULL, usuario_fechamento_id = NULL WHERE id = ?").run(id);
    res.json({ message: "Caixa reaberto com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao reabrir caixa" });
  }
});

app.post("/api/caixas/fechar", verifyToken, (req, res) => {
  const { id, valor_fechamento, observacoes } = req.body;

  try {
    const caixa = db.prepare("SELECT * FROM caixas WHERE id = ? AND empresa_id = ?").get(id, req.empresaId);
    if (!caixa) return res.status(404).json({ message: "Caixa não encontrado" });
    if (caixa.status === "fechado") return res.status(400).json({ message: "Este caixa já foi fechado" });

    // Calcular total de vendas vinculadas
    const result = db.prepare("SELECT SUM(total) as totalVendido FROM vendas WHERE caixa_id = ? AND empresa_id = ?").get(id, req.empresaId);
    const totalVendido = Number(result?.totalVendido || 0);
    const valorEsperado = Number(caixa.valor_inicial || 0) + totalVendido;
    const valorContado = Number(valor_fechamento || 0);
    const diferenca = valorContado - valorEsperado;

    db.prepare(
      `UPDATE caixas 
       SET status = 'fechado', valor_fechamento = ?, valor_esperado = ?, diferenca = ?, 
           usuario_fechamento_id = ?, fechado_em = datetime('now', 'localtime'), observacoes = ?
       WHERE id = ?`
    ).run(valorContado, valorEsperado, diferenca, req.userId, observacoes, id);
    res.json({ message: "Caixa fechado com sucesso", totalVendido, valorEsperado, diferenca });
  } catch (err) {
    res.status(500).json({ message: "Erro ao fechar caixa" });
  }
});

app.get("/api/caixas/historico", verifyToken, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT c.*, u1.nome as operador_abertura, u2.nome as operador_fechamento
       FROM caixas c
       LEFT JOIN usuarios u1 ON c.usuario_abertura_id = u1.id
       LEFT JOIN usuarios u2 ON c.usuario_fechamento_id = u2.id
       WHERE c.empresa_id = ?
       ORDER BY c.aberto_em DESC
       LIMIT 100`
    ).all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar histórico de caixas" });
  }
});

// ===== ROTAS DE VENDAS =====
app.post("/api/vendas", verifyToken, (req, res) => {
  const {
    itens,
    total,
    metodo_pagamento = "dinheiro",
    status_pagamento = "pago",
    cliente_nome = "Cliente balcão",
    cliente_contacto = "",
    valor_recebido = 0,
    troco = 0,
    caixa_id
  } = req.body;

  if (!caixa_id) {
    return res.status(400).json({ message: "O caixa deve estar aberto para realizar vendas" });
  }

  if (!Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ message: "Itens da venda são obrigatórios" });
  }

  try {
    // 1. Validar stock e calcular totais
    let custoTotal = 0;
    let totalCalculado = 0;

    for (const item of itens) {
      const qty = Number(item.quantidade) || 0;
      const pid = item.produto_id;
      const lineTotal = Number(item.total) || 0;
      
      if (qty <= 0) return res.status(400).json({ message: "Quantidade inválida na venda" });
      if (lineTotal <= 0) return res.status(400).json({ message: "Total inválido na venda" });

      const row = db.prepare("SELECT id, nome, stock, preco_custo FROM produtos WHERE id = ? AND empresa_id = ? AND ativo = 1").get(pid, req.empresaId);
      if (!row) return res.status(400).json({ message: `Produto não encontrado: ${pid}` });
      if (row.stock < qty) return res.status(400).json({ message: `Stock insuficiente para ${row.nome}` });

      custoTotal += (Number(row.preco_custo) || 0) * qty;
      totalCalculado += lineTotal;
    }

    const vendaTotal = Number(totalCalculado || total || 0);
    if (vendaTotal <= 0) return res.status(400).json({ message: "Total da venda deve ser maior que zero" });

    // 2. Processar venda em transação
    const executeVenda = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO vendas (
          usuario_id, empresa_id, total, metodo_pagamento, status_pagamento,
          cliente_nome, cliente_contacto, valor_recebido, troco, caixa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        req.userId,
        req.empresaId,
        vendaTotal,
        String(metodo_pagamento || "dinheiro"),
        String(status_pagamento || "pago"),
        String(cliente_nome || "Cliente balcão"),
        String(cliente_contacto || ""),
        Number(valor_recebido) || 0,
        Number(troco) || 0,
        caixa_id
      );

      const vendaId = info.lastInsertRowid;

      const stmtItem = db.prepare("INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, total) VALUES (?, ?, ?, ?, ?)");
      const stmtUpdateStock = db.prepare("UPDATE produtos SET stock = stock - ? WHERE id = ? AND empresa_id = ?");
      const stmtMovStock = db.prepare("INSERT INTO movimentacoes_stock (produto_id, empresa_id, tipo, quantidade, usuario_id, descricao) VALUES (?, ?, ?, ?, ?, ?)");

      for (const item of itens) {
        const qty = Number(item.quantidade) || 0;
        stmtItem.run(vendaId, item.produto_id, qty, item.preco_unitario, item.total);
        stmtUpdateStock.run(qty, item.produto_id, req.empresaId);
        stmtMovStock.run(item.produto_id, req.empresaId, "venda", qty, req.userId, "Venda POS");
      }

      // Registar automaticamente no financeiro
      db.prepare(
        `INSERT INTO transacoes_financeiras 
         (empresa_id, usuario_id, tipo, categoria, valor, metodo_pagamento, entidade_nome, observacao) 
         VALUES (?, ?, 'entrada', 'Venda', ?, ?, 'Cliente POS', ?)`
      ).run(req.empresaId, req.userId, vendaTotal, String(metodo_pagamento || "dinheiro"), `Venda ID: ${vendaId}`);

      return vendaId;
    });

    const vendaId = executeVenda();
    res.json({ id: vendaId, message: "Venda registada com sucesso" });

  } catch (err) {
    console.error("Erro ao processar venda:", err.message);
    res.status(500).json({ message: "Erro ao registar venda: " + err.message });
  }
});

app.get("/api/vendas", verifyToken, (req, res) => {
  try {
    const vendas = db.prepare(
      `SELECT v.*, u.nome AS vendedor,
              COALESCE(v.total - SUM(iv.quantidade * COALESCE(p.preco_custo, 0)), v.total) AS lucro
       FROM vendas v
       LEFT JOIN usuarios u ON v.usuario_id = u.id
       LEFT JOIN itens_venda iv ON iv.venda_id = v.id
       LEFT JOIN produtos p ON p.id = iv.produto_id
       WHERE v.empresa_id = ?
       GROUP BY v.id
       ORDER BY v.criado_em DESC
       LIMIT 300`
    ).all(req.empresaId);
    
    if (!vendas || vendas.length === 0) {
      return res.json([]);
    }

    const vendaIds = vendas.map(v => v.id);
    const items = db.prepare(
      `SELECT iv.*, p.nome as produto_nome 
       FROM itens_venda iv
       JOIN produtos p ON iv.produto_id = p.id
       WHERE iv.venda_id IN (${vendaIds.map(() => '?').join(',')})`
    ).all(...vendaIds);

    const vendasComItens = vendas.map(v => ({
      ...v,
      produtos: items
        .filter(i => i.venda_id === v.id)
        .map(i => ({
          nome: i.produto_nome,
          qty: i.quantidade,
          preco: i.preco_unitario
        }))
    }));
    res.json(vendasComItens);
  } catch (err) {
    console.error("Erro ao buscar vendas:", err.message);
    res.status(500).json({ message: "Erro ao buscar vendas" });
  }
});

app.put("/api/vendas/:id/pagamento", verifyToken, (req, res) => {
  const { id } = req.params;
  const {
    metodo_pagamento = "dinheiro",
    status_pagamento = "pago",
    valor_recebido = 0,
    troco = 0,
  } = req.body;

  try {
    const info = db.prepare(
      `UPDATE vendas
       SET metodo_pagamento = ?, status_pagamento = ?, valor_recebido = ?, troco = ?
       WHERE id = ? AND empresa_id = ?`
    ).run(
      String(metodo_pagamento || "dinheiro"),
      String(status_pagamento || "pago"),
      Number(valor_recebido) || 0,
      Number(troco) || 0,
      id,
      req.empresaId,
    );
    if (info.changes === 0) return res.status(404).json({ message: "Venda não encontrada" });
    res.json({ message: "Pagamento atualizado com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar pagamento" });
  }
});

// ===== ROTAS DE RESERVAS =====
app.post("/api/reservas", verifyToken, (req, res) => {
  const { produto_id, quantidade, titular, bi } = req.body;
  if (!produto_id || !quantidade || !titular) {
    return res.status(400).json({ message: "Dados incompletos para reserva" });
  }

  try {
    const row = db.prepare("SELECT stock, nome FROM produtos WHERE id = ? AND empresa_id = ?").get(produto_id, req.empresaId);
    if (!row) return res.status(404).json({ message: "Produto não encontrado" });
    if (row.stock < quantidade) return res.status(400).json({ message: `Stock insuficiente para ${row.nome}` });

    const executeReserva = db.transaction(() => {
      const info = db.prepare(
        "INSERT INTO reservas (usuario_id, produto_id, empresa_id, quantidade, titular, bi, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(req.userId, produto_id, req.empresaId, quantidade, titular, bi, "Activa");
      
      const resId = info.lastInsertRowid;

      db.prepare("UPDATE produtos SET stock = stock - ? WHERE id = ?").run(quantidade, produto_id);
      
      db.prepare(
        "INSERT INTO movimentacoes_stock (produto_id, empresa_id, tipo, quantidade, usuario_id, descricao) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(produto_id, req.empresaId, "saida", quantidade, req.userId, `Reserva criada: ${titular}`);

      return resId;
    });

    const resId = executeReserva();
    res.json({ id: resId, message: "Reserva criada com sucesso" });
  } catch (err) {
    console.error("Erro ao criar reserva:", err.message);
    res.status(500).json({ message: "Erro ao criar reserva" });
  }
});

app.get("/api/reservas", verifyToken, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT r.*, p.nome AS produto_nome, u.nome AS usuario_nome 
       FROM reservas r
       JOIN produtos p ON r.produto_id = p.id
       JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.empresa_id = ?
       ORDER BY r.criado_em DESC`
    ).all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar reservas" });
  }
});

app.put("/api/reservas/:id/status", verifyToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "Activa", "Levantada", "Cancelada"

  try {
    const reserva = db.prepare("SELECT * FROM reservas WHERE id = ? AND empresa_id = ?").get(id, req.empresaId);
    if (!reserva) return res.status(404).json({ message: "Reserva não encontrada" });

    if (status === "Cancelada" && reserva.status !== "Cancelada") {
      // Devolver stock se cancelar
      const cancelReserva = db.transaction(() => {
        db.prepare("UPDATE reservas SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
        db.prepare("UPDATE produtos SET stock = stock + ? WHERE id = ?").run(reserva.quantidade, reserva.produto_id);
        db.prepare(
          "INSERT INTO movimentacoes_stock (produto_id, empresa_id, tipo, quantidade, usuario_id, descricao) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(reserva.produto_id, req.empresaId, "entrada", reserva.quantidade, req.userId, `Reserva cancelada: ${reserva.titular}`);
      });
      cancelReserva();
      res.json({ message: "Reserva cancelada e stock devolvido" });
    } else {
      db.prepare("UPDATE reservas SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
      res.json({ message: "Status da reserva atualizado" });
    }
  } catch (err) {
    console.error("Erro ao atualizar reserva:", err.message);
    res.status(500).json({ message: "Erro ao atualizar reserva" });
  }
});

// ===== ROTAS DE EMPRESA (CONFIGURAÇÕES) =====
app.get("/api/empresa", verifyToken, (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM empresas WHERE id = ?").get(req.empresaId);
    if (!row) return res.status(404).json({ message: "Empresa não encontrada" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar empresa" });
  }
});

app.put("/api/empresa", verifyToken, (req, res) => {
  const { nome, cnpj, endereco, telefone, email, background_image } = req.body;
  if (!nome) return res.status(400).json({ message: "Nome da empresa é obrigatório" });

  try {
    db.prepare(
      "UPDATE empresas SET nome = ?, cnpj = ?, endereco = ?, telefone = ?, email = ?, background_image = ? WHERE id = ?"
    ).run(nome, cnpj, endereco, telefone, email, background_image, req.empresaId);
    res.json({ message: "Dados da empresa atualizados com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar empresa" });
  }
});

// Alterar senha do próprio usuário
app.put("/api/usuarios/me/senha", verifyToken, (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  if (!senhaAtual || !novaSenha) return res.status(400).json({ message: "Informe a senha atual e a nova senha" });

  try {
    const user = db.prepare("SELECT senha FROM usuarios WHERE id = ?").get(req.userId);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

    const valid = bcrypt.compareSync(senhaAtual, user.senha);
    if (!valid) return res.status(401).json({ message: "Senha atual incorreta" });

    const hashed = bcrypt.hashSync(novaSenha, 10);
    db.prepare("UPDATE usuarios SET senha = ? WHERE id = ?").run(hashed, req.userId);
    res.json({ message: "Senha atualizada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar senha" });
  }
});

// ===== ROTAS FINANCEIRAS =====
app.get("/api/financeiro", verifyToken, (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT t.*, u.nome as usuario_nome 
       FROM transacoes_financeiras t
       LEFT JOIN usuarios u ON t.usuario_id = u.id
       WHERE t.empresa_id = ? 
       ORDER BY t.data DESC LIMIT 500`
    ).all(req.empresaId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar histórico financeiro" });
  }
});

app.post("/api/financeiro", verifyToken, (req, res) => {
  const { tipo, categoria, valor, metodo_pagamento, entidade_nome, observacao, data } = req.body;
  
  if (!tipo || !valor || !categoria) {
    return res.status(400).json({ message: "Tipo, valor e categoria são obrigatórios" });
  }

  try {
    const info = db.prepare(
      `INSERT INTO transacoes_financeiras 
       (empresa_id, usuario_id, tipo, categoria, valor, metodo_pagamento, entidade_nome, observacao, data) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
    ).run(req.empresaId, req.userId, tipo, categoria, Number(valor), metodo_pagamento, entidade_nome, observacao, data);
    res.json({ id: info.lastInsertRowid, message: "Transação registada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao registar transação financeira" });
  }
});

// ===== ROTAS DE DASHBOARD =====
app.get("/api/dashboard/stats", verifyToken, (req, res) => {
  const empresaId = req.empresaId;

  try {
    const stats = db.prepare(
      `
      SELECT 
        (SELECT COUNT(*) FROM produtos WHERE empresa_id = ?) as totalProdutos,
        (SELECT COUNT(*) FROM vendas WHERE empresa_id = ?) as totalVendas,
        (SELECT SUM(total) FROM vendas WHERE empresa_id = ?) as totalVendido
    `
    ).get(empresaId, empresaId, empresaId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar estatísticas" });
  }
});

// ...

// ===== ROTAS SUPER ADMIN (EMPRESAS) =====
app.get("/api/super/empresas", verifyToken, (req, res) => {
  if (req.role !== "super") return res.status(403).json({ message: "Acesso negado" });
  try {
    const rows = db.prepare("SELECT e.*, (SELECT COUNT(*) FROM usuarios WHERE empresa_id = e.id) as vendedores FROM empresas e ORDER BY e.nome").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar empresas" });
  }
});

app.post("/api/super/empresas", verifyToken, (req, res) => {
  if (req.role !== "super") return res.status(403).json({ message: "Acesso negado" });
  const { nome, plano, data_expiracao, ativo } = req.body;
  if (!nome) return res.status(400).json({ message: "Nome é obrigatório" });
  
  try {
    const info = db.prepare("INSERT INTO empresas (nome, plano, data_expiracao, ativo) VALUES (?, ?, ?, ?)").run(
      nome, plano || "Mensal", data_expiracao || null, ativo ?? 1
    );
    res.json({ id: info.lastInsertRowid, message: "Empresa criada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao criar empresa" });
  }
});

// ...

app.post("/api/super/empresas/completo", verifyToken, async (req, res) => {
  if (req.role !== "super") return res.status(403).json({ message: "Acesso negado" });

  const { nomeEmpresa, bi, nomeEmpresario, email, senha, plano, dataExpiracao } = req.body;

  if (!nomeEmpresa || !email || !senha) {
    return res.status(400).json({ message: "Dados obrigatórios ausentes" });
  }

  try {
    const result = db.transaction(() => {
      // 1. Criar Empresa localmente
      const infoEmpresa = db.prepare(
        "INSERT INTO empresas (nome, bi, empresario_nome, email, plano, data_expiracao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(nomeEmpresa, bi, nomeEmpresario, email, plano || "Mensal", dataExpiracao || null, 1);

      const empresaId = infoEmpresa.lastInsertRowid;

      // 2. Criar Gestor localmente
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(senha, salt);

      const infoUser = db.prepare(
        "INSERT INTO usuarios (nome, email, senha, role, empresa_id, ativo) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(nomeEmpresario, email, hash, 'gestor', empresaId, 1);

      return empresaId;
    })();

    const empresaId = result;

    // 3. Criar Licença no Supabase (se aplicável)
    let licenseKey = "";
    if (IS_LICENSING_SERVER && supabase) {
      licenseKey = generateLicenseKey();
      const expiresAt = dataExpiracao ? new Date(dataExpiracao) : new Date();
      if (!dataExpiracao) {
        if (plano === "Anual") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      try {
        const { error } = await supabase.from("licenses").insert({
          license_key: licenseKey,
          company_name: nomeEmpresa,
          plan: plano === "Anual" ? "yearly" : "monthly",
          status: "pending",
          expires_at: expiresAt.toISOString()
        });

        if (error) throw error;
        console.log(`[SUPER] Licença criada no Supabase: ${licenseKey}`);
      } catch (supaErr) {
        console.error("Erro ao criar licença no Supabase:", supaErr.message);
      }
    }

    res.json({
      message: "Empresa, Gestor e Licença criados com sucesso!",
      empresaId,
      licenseKey: licenseKey || "Offline-Mode"
    });
  } catch (err) {
    console.error("Erro ao criar empresa completa:", err.message);
    res.status(500).json({ message: "Erro ao criar empresa local" });
  }
});

app.put("/api/super/empresas/:id", verifyToken, (req, res) => {
  if (req.role !== "super") return res.status(403).json({ message: "Acesso negado" });
  const { id } = req.params;
  const { nome, plano, data_expiracao, ativo } = req.body;
  
  try {
    db.prepare("UPDATE empresas SET nome = COALESCE(?, nome), plano = COALESCE(?, plano), data_expiracao = COALESCE(?, data_expiracao), ativo = COALESCE(?, ativo) WHERE id = ?").run(nome, plano, data_expiracao, ativo, id);
    res.json({ message: "Empresa atualizada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar empresa" });
  }
});

// ===== ROTAS DE USUÁRIOS =====
app.get("/api/usuarios", verifyToken, (req, res) => {
  if (req.role !== "super" && req.role !== "gestor") return res.status(403).json({ message: "Acesso negado" });
  
  let query = "SELECT id, nome, email, role, empresa_id, ativo, criado_em, permissoes FROM usuarios WHERE empresa_id = ?";
  let params = [req.empresaId];
  
  if (req.role === "super") {
    query = "SELECT id, nome, email, role, empresa_id, ativo, criado_em, permissoes FROM usuarios";
    params = [];
  }

  try {
    const rows = db.prepare(query).all(...params);
    res.json(rows.map(u => ({ ...u, permissoes: u.permissoes ? JSON.parse(u.permissoes) : [] })));
  } catch (err) {
    res.status(500).json({ message: "Erro ao buscar utilizadores" });
  }
});

app.post("/api/usuarios", verifyToken, (req, res) => {
  if (req.role !== "super" && req.role !== "gestor") return res.status(403).json({ message: "Acesso negado" });
  const { nome, email, senha, role, empresa_id, permissoes } = req.body;
  
  if (!nome || !email || !senha) return res.status(400).json({ message: "Nome, email e senha são obrigatórios" });
  
  const targetEmpresaId = req.role === "super" ? (empresa_id || req.empresaId) : req.empresaId;
  const targetRole = req.role === "gestor" ? "vendedor" : (role || "vendedor");
  const hashed = bcrypt.hashSync(senha, 10);
  const perms = Array.isArray(permissoes) ? JSON.stringify(permissoes) : "[]";

  try {
    const info = db.prepare("INSERT INTO usuarios (nome, email, senha, role, empresa_id, permissoes) VALUES (?, ?, ?, ?, ?, ?)").run(
      nome, email, hashed, targetRole, targetEmpresaId, perms
    );
    res.json({ id: info.lastInsertRowid, message: "Utilizador criado com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao criar utilizador: " + err.message });
  }
});

app.put("/api/usuarios/:id", verifyToken, (req, res) => {
  if (req.role !== "super" && req.role !== "gestor") return res.status(403).json({ message: "Acesso negado" });
  const { id } = req.params;
  const { nome, email, role, ativo, permissoes } = req.body;

  try {
    const checkQuery = req.role === "super" ? "SELECT id FROM usuarios WHERE id = ?" : "SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?";
    const checkParams = req.role === "super" ? [id] : [id, req.empresaId];

    const row = db.prepare(checkQuery).get(...checkParams);
    if (!row) return res.status(404).json({ message: "Utilizador não encontrado ou sem permissão" });
    
    const perms = Array.isArray(permissoes) ? JSON.stringify(permissoes) : undefined;
    const targetRole = req.role === "gestor" ? "vendedor" : role;

    db.prepare("UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), role = COALESCE(?, role), ativo = COALESCE(?, ativo), permissoes = COALESCE(?, permissoes) WHERE id = ?").run(
      nome, email, targetRole, ativo, perms, id
    );
    res.json({ message: "Utilizador atualizado com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar utilizador" });
  }
});

app.delete("/api/usuarios/:id", verifyToken, (req, res) => {
  if (req.role !== "super" && req.role !== "gestor") return res.status(403).json({ message: "Acesso negado" });
  const { id } = req.params;

  try {
    const checkQuery = req.role === "super" ? "SELECT id FROM usuarios WHERE id = ?" : "SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?";
    const checkParams = req.role === "super" ? [id] : [id, req.empresaId];

    const row = db.prepare(checkQuery).get(...checkParams);
    if (!row) return res.status(404).json({ message: "Utilizador não encontrado ou sem permissão" });
    
    db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
    res.json({ message: "Utilizador removido com sucesso" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao remover utilizador" });
  }
});

// Health check aprimorado (útil para Railway/Render)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    mode: IS_LICENSING_SERVER ? "licensing" : "erp",
    uptime: process.uptime(),
  });
});

// ─────────────────────────────────────────────────────
// SERVIR FRONTEND ESTÁTICO (para acesso via browser/PWA)
// Quando deployed num servidor remoto, serve o index.html e assets
// ─────────────────────────────────────────────────────
const frontendPath = path.resolve(path.join(__dirname, ".."));

// Servir ficheiros estáticos (CSS, JS, ícones, manifest, sw.js)
app.use(express.static(frontendPath, {
  // Não cachear sw.js (para atualizações imediatas)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Service-Worker-Allowed", "/");
    }
    if (filePath.endsWith("manifest.json")) {
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Content-Type", "application/manifest+json");
    }
  },
}));

// SPA fallback — qualquer rota não-API devolve o index.html
app.get("*", (req, res) => {
  // Não interferir com rotas de API
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Rota não encontrada" });
  }
  const indexPath = path.join(frontendPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend não encontrado. Certifique-se que o index.html está na raiz do projeto.");
  }
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Servidor backend rodando em http://127.0.0.1:${PORT}`);
  console.log(`✓ Frontend acessível em http://localhost:${PORT}`);
  if (process.env.NODE_ENV === "production") {
    console.log(`✓ Modo produção — CORS aberto para PWA`);
  }
});

// Tratamento de erros não capturados
process.on("uncaughtException", (err) => {
  console.error("Erro não capturado:", err);
});
