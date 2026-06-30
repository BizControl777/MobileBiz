/**
 * BizController 360 — Offline Database (IndexedDB)
 * Camada de persistência local para modo mobile/PWA
 * 
 * Stores:
 *   - produtos       → catálogo completo de produtos
 *   - categorias     → categorias
 *   - vendas         → vendas registadas (incluindo offline)
 *   - movimentacoes  → movimentos de stock
 *   - reservas       → reservas de produtos
 *   - usuarios       → utilizadores
 *   - empresa        → dados da empresa
 *   - caixas         → histórico de caixas
 *   - financeiro     → lançamentos financeiros
 *   - sync_queue     → fila de operações a sincronizar
 *   - meta           → metadados (última sync, versão, etc.)
 */

const DB_NAME = "bizcontrol_offline";
const DB_VERSION = 1;

let _db = null;

// =============================================
// INICIALIZAÇÃO
// =============================================

export async function initOfflineDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Produtos
      if (!db.objectStoreNames.contains("produtos")) {
        const store = db.createObjectStore("produtos", { keyPath: "id" });
        store.createIndex("categoria_id", "categoria_id", { unique: false });
        store.createIndex("ativo", "ativo", { unique: false });
        store.createIndex("empresa_id", "empresa_id", { unique: false });
      }

      // Categorias
      if (!db.objectStoreNames.contains("categorias")) {
        db.createObjectStore("categorias", { keyPath: "id" });
      }

      // Vendas
      if (!db.objectStoreNames.contains("vendas")) {
        const store = db.createObjectStore("vendas", { keyPath: "id", autoIncrement: true });
        store.createIndex("data", "criado_em", { unique: false });
        store.createIndex("usuario_id", "usuario_id", { unique: false });
        store.createIndex("offline", "_offline", { unique: false });
      }

      // Movimentações
      if (!db.objectStoreNames.contains("movimentacoes")) {
        const store = db.createObjectStore("movimentacoes", { keyPath: "id", autoIncrement: true });
        store.createIndex("produto_id", "produto_id", { unique: false });
        store.createIndex("offline", "_offline", { unique: false });
      }

      // Reservas
      if (!db.objectStoreNames.contains("reservas")) {
        db.createObjectStore("reservas", { keyPath: "id", autoIncrement: true });
      }

      // Utilizadores
      if (!db.objectStoreNames.contains("usuarios")) {
        const store = db.createObjectStore("usuarios", { keyPath: "id" });
        store.createIndex("email", "email", { unique: true });
      }

      // Empresa
      if (!db.objectStoreNames.contains("empresa")) {
        db.createObjectStore("empresa", { keyPath: "id" });
      }

      // Caixas
      if (!db.objectStoreNames.contains("caixas")) {
        db.createObjectStore("caixas", { keyPath: "id", autoIncrement: true });
      }

      // Financeiro
      if (!db.objectStoreNames.contains("financeiro")) {
        db.createObjectStore("financeiro", { keyPath: "id", autoIncrement: true });
      }

      // Fila de sincronização (operações pendentes)
      if (!db.objectStoreNames.contains("sync_queue")) {
        const store = db.createObjectStore("sync_queue", { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("endpoint", "endpoint", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }

      // Metadados
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }

      console.log("[OfflineDB] Schema criado com sucesso.");
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      console.log("[OfflineDB] Base de dados iniciada.");
      resolve(_db);
    };

    req.onerror = (event) => {
      console.error("[OfflineDB] Erro ao abrir BD:", event.target.error);
      reject(event.target.error);
    };
  });
}

function getDB() {
  if (!_db) throw new Error("[OfflineDB] Base de dados não inicializada. Chame initOfflineDB() primeiro.");
  return _db;
}

// =============================================
// HELPERS GENÉRICOS
// =============================================

function txGet(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function txGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function txPut(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txAdd(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDelete(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function txClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// =============================================
// PRODUTOS
// =============================================

export async function saveProdutos(produtos) {
  await txClear("produtos");
  for (const p of produtos) {
    await txPut("produtos", p);
  }
  await setMeta("produtos_sync", new Date().toISOString());
  console.log(`[OfflineDB] ${produtos.length} produtos guardados.`);
}

export async function getProdutosOffline() {
  return txGetAll("produtos");
}

export async function updateProdutoOffline(id, dados) {
  const existing = await txGet("produtos", id);
  if (existing) {
    await txPut("produtos", { ...existing, ...dados });
  }
}

// =============================================
// CATEGORIAS
// =============================================

export async function saveCategorias(categorias) {
  await txClear("categorias");
  for (const c of categorias) {
    await txPut("categorias", c);
  }
}

export async function getCategoriasOffline() {
  return txGetAll("categorias");
}

// =============================================
// VENDAS
// =============================================

export async function saveVendas(vendas) {
  // Guardar apenas vendas do servidor (não apagar as offline pendentes)
  const offlineVendas = (await txGetAll("vendas")).filter((v) => v._offline);
  await txClear("vendas");
  for (const v of vendas) {
    await txPut("vendas", { ...v, _offline: false });
  }
  // Re-inserir vendas offline pendentes
  for (const v of offlineVendas) {
    await txAdd("vendas", v);
  }
  await setMeta("vendas_sync", new Date().toISOString());
}

export async function getVendasOffline() {
  return txGetAll("vendas");
}

export async function addVendaOffline(venda) {
  const offlineVenda = {
    ...venda,
    _offline: true,
    _offline_id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    criado_em: new Date().toISOString(),
  };
  const id = await txAdd("vendas", offlineVenda);
  console.log("[OfflineDB] Venda offline guardada com ID:", id);
  return { ...offlineVenda, id };
}

// =============================================
// MOVIMENTAÇÕES
// =============================================

export async function saveMovimentos(movimentos) {
  const offlineMovs = (await txGetAll("movimentacoes")).filter((m) => m._offline);
  await txClear("movimentacoes");
  for (const m of movimentos) {
    await txPut("movimentacoes", { ...m, _offline: false });
  }
  for (const m of offlineMovs) {
    await txAdd("movimentacoes", m);
  }
}

export async function getMovimentosOffline() {
  return txGetAll("movimentacoes");
}

export async function addMovimentoOffline(movimento) {
  const offlineMov = {
    ...movimento,
    _offline: true,
    criado_em: new Date().toISOString(),
  };
  return txAdd("movimentacoes", offlineMov);
}

// =============================================
// RESERVAS
// =============================================

export async function saveReservas(reservas) {
  await txClear("reservas");
  for (const r of reservas) {
    await txPut("reservas", r);
  }
}

export async function getReservasOffline() {
  return txGetAll("reservas");
}

// =============================================
// UTILIZADORES
// =============================================

export async function saveUsuarios(usuarios) {
  await txClear("usuarios");
  const deduped = [];
  const seenIds = new Set();
  const seenEmails = new Set();
  for (const u of usuarios) {
    if (!u || u.id == null) continue;
    const emailKey = String(u.email || "").toLowerCase();
    if (seenIds.has(u.id) || (emailKey && seenEmails.has(emailKey))) continue;
    seenIds.add(u.id);
    if (emailKey) seenEmails.add(emailKey);
    deduped.push(u);
  }
  for (const u of deduped) {
    await txPut("usuarios", u);
  }
}

export async function getUsuariosOffline() {
  return txGetAll("usuarios");
}

// =============================================
// EMPRESA
// =============================================

export async function saveEmpresa(empresa) {
  if (!empresa) return;
  await txPut("empresa", { ...empresa, id: empresa.id || 1 });
}

export async function getEmpresaOffline() {
  const all = await txGetAll("empresa");
  return all[0] || null;
}

// =============================================
// FINANCEIRO
// =============================================

export async function saveFinanceiro(lancamentos) {
  await txClear("financeiro");
  for (const l of lancamentos) {
    await txPut("financeiro", l);
  }
}

export async function getFinanceiroOffline() {
  return txGetAll("financeiro");
}

// =============================================
// FILA DE SINCRONIZAÇÃO
// =============================================

/**
 * Adiciona uma operação à fila de sync (para executar quando voltar internet)
 * @param {string} method - GET, POST, PUT, DELETE
 * @param {string} endpoint - ex: "/vendas"
 * @param {object} data - dados da operação
 * @param {string} description - descrição legível (para UI)
 */
export async function addToSyncQueue(method, endpoint, data, description = "") {
  const item = {
    method,
    endpoint,
    data,
    description,
    timestamp: new Date().toISOString(),
    status: "pending", // pending | syncing | done | error
    attempts: 0,
    last_error: null,
  };
  const id = await txAdd("sync_queue", item);
  console.log(`[OfflineDB] Operação adicionada à fila de sync: ${method} ${endpoint} (ID: ${id})`);

  // Registar Background Sync se disponível
  if ("serviceWorker" in navigator && "sync" in window.ServiceWorkerRegistration.prototype) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("biz-sync");
    } catch (e) {
      console.warn("[OfflineDB] Background Sync não disponível:", e);
    }
  }

  return id;
}

export async function getSyncQueue() {
  return (await txGetAll("sync_queue")).filter((i) => i.status === "pending");
}

export async function getAllSyncQueue() {
  return txGetAll("sync_queue");
}

export async function updateSyncItem(id, updates) {
  const item = await txGet("sync_queue", id);
  if (item) await txPut("sync_queue", { ...item, ...updates });
}

export async function removeSyncItem(id) {
  return txDelete("sync_queue", id);
}

export async function clearDoneSyncItems() {
  const all = await txGetAll("sync_queue");
  const done = all.filter((i) => i.status === "done" || i.status === "error");
  for (const item of done) {
    await txDelete("sync_queue", item.id);
  }
}

/**
 * Processa a fila de sync — envia operações pendentes ao servidor
 * @param {function} fetchFn - função fetch para fazer requests (padrão: window.fetch)
 * @param {string} baseURL - URL base do servidor
 * @param {string} token - JWT token
 */
export async function processSyncQueue(baseURL, token, onProgress = null) {
  const queue = await getSyncQueue();
  if (queue.length === 0) {
    console.log("[OfflineDB] Fila de sync vazia.");
    return { synced: 0, errors: 0 };
  }

  console.log(`[OfflineDB] Processando ${queue.length} operações pendentes...`);
  let synced = 0;
  let errors = 0;

  for (const item of queue) {
    await updateSyncItem(item.id, { status: "syncing", attempts: (item.attempts || 0) + 1 });

    try {
      const response = await fetch(`${baseURL}${item.endpoint}`, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: item.method !== "GET" ? JSON.stringify(item.data) : undefined,
      });

      if (response.ok) {
        await updateSyncItem(item.id, { status: "done" });
        synced++;
        if (onProgress) onProgress({ type: "success", item, synced, total: queue.length });
        console.log(`[OfflineDB] Sync OK: ${item.method} ${item.endpoint}`);
      } else {
        const err = await response.text();
        await updateSyncItem(item.id, { status: "error", last_error: err });
        errors++;
        if (onProgress) onProgress({ type: "error", item, error: err });
        console.error(`[OfflineDB] Sync ERRO: ${item.method} ${item.endpoint} — ${err}`);
      }
    } catch (err) {
      await updateSyncItem(item.id, { status: "pending", last_error: err.message });
      errors++;
      if (onProgress) onProgress({ type: "network_error", item, error: err.message });
      console.warn(`[OfflineDB] Sync falhou (rede): ${item.method} ${item.endpoint}`);
    }
  }

  // Limpar itens concluídos
  await clearDoneSyncItems();

  return { synced, errors };
}

// =============================================
// METADADOS
// =============================================

export async function setMeta(key, value) {
  return txPut("meta", { key, value, updated_at: new Date().toISOString() });
}

export async function getMeta(key) {
  const record = await txGet("meta", key);
  return record ? record.value : null;
}

// =============================================
// SYNC STATUS
// =============================================

export async function getSyncStatus() {
  const queue = await getSyncQueue();
  const lastSync = await getMeta("last_full_sync");
  return {
    pending: queue.length,
    lastSync,
    isOnline: navigator.onLine,
  };
}

// =============================================
// FULL SYNC (baixar todos os dados do servidor)
// =============================================

export async function fullSync(baseURL, token) {
  if (!navigator.onLine) {
    console.warn("[OfflineDB] Offline — não é possível fazer full sync.");
    return false;
  }

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const endpoints = [
    { key: "produtos", url: "/api/produtos", save: saveProdutos },
    { key: "categorias", url: "/api/categorias", save: saveCategorias },
    { key: "vendas", url: "/api/vendas", save: saveVendas },
    { key: "movimentacoes", url: "/api/movimentacoes", save: saveMovimentos },
    { key: "reservas", url: "/api/reservas", save: saveReservas },
    { key: "usuarios", url: "/api/usuarios", save: saveUsuarios },
  ];

  let success = 0;
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseURL}${ep.url}`, { headers });
      if (res.ok) {
        const data = await res.json();
        await ep.save(Array.isArray(data) ? data : data[ep.key] || []);
        success++;
      }
    } catch (e) {
      console.warn(`[OfflineDB] Erro ao sincronizar ${ep.key}:`, e);
    }
  }

  // Empresa
  try {
    const res = await fetch(`${baseURL}/api/empresa`, { headers });
    if (res.ok) {
      const empresa = await res.json();
      await saveEmpresa(empresa);
      success++;
    }
  } catch (e) {}

  await setMeta("last_full_sync", new Date().toISOString());
  console.log(`[OfflineDB] Full sync completo: ${success}/${endpoints.length + 1} endpoints.`);
  return true;
}

// =============================================
// DASHBOARD STATS (calculadas localmente)
// =============================================

export async function getDashboardStatsOffline() {
  const [produtos, vendas, movimentos] = await Promise.all([
    getProdutosOffline(),
    getVendasOffline(),
    getMovimentosOffline(),
  ]);

  const hoje = new Date().toDateString();
  const vendasHoje = vendas.filter((v) => {
    const d = v.criado_em ? new Date(v.criado_em).toDateString() : "";
    return d === hoje;
  });

  const totalHoje = vendasHoje.reduce((s, v) => s + Number(v.total || 0), 0);
  const lucroHoje = vendasHoje.reduce((s, v) => s + Number(v.lucro || 0), 0);
  const produtosAtivos = produtos.filter((p) => p.ativo !== 0 && p.ativo !== false);
  const stockBaixo = produtosAtivos.filter(
    (p) => Number(p.stock || 0) <= Number(p.stock_minimo || p.stockMin || 10)
  );

  return {
    vendas_hoje: vendasHoje.length,
    total_hoje: totalHoje,
    lucro_hoje: lucroHoje,
    total_produtos: produtosAtivos.length,
    stock_baixo: stockBaixo.length,
    offline: true,
    last_sync: await getMeta("last_full_sync"),
  };
}
