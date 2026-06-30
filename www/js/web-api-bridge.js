/**
 * BizController 360 — Web API Bridge
 * Bridge HTTP para browser/mobile (online + offline aware)
 * 
 * Quando não está no Electron, este módulo substitui o electron-bridge.js
 * Deteta automaticamente: online → fetch para servidor | offline → IndexedDB
 */

import {
  initOfflineDB,
  getProdutosOffline,
  getCategoriasOffline,
  getVendasOffline,
  getMovimentosOffline,
  getReservasOffline,
  getUsuariosOffline,
  getEmpresaOffline,
  getFinanceiroOffline,
  addVendaOffline,
  addMovimentoOffline,
  addToSyncQueue,
  processSyncQueue,
  fullSync,
  getDashboardStatsOffline,
  getSyncStatus,
  getMeta,
  setMeta,
  saveProdutos,
  saveCategorias,
  saveVendas,
  saveMovimentos,
  saveReservas,
  saveUsuarios,
  saveEmpresa,
  saveFinanceiro,
  updateProdutoOffline,
} from "./offline-db.js";

// =============================================
// CONFIGURAÇÃO
// =============================================

// URL do servidor remoto — configurar antes do deploy
// Em desenvolvimento local: usa localhost:3000
// Em produção (Railway/Render): usa a URL pública
function getServerURL() {
  // Verificar se há URL configurada manualmente (ex: no localStorage por settings)
  const saved = localStorage.getItem("biz_server_url");
  if (saved && saved.trim()) return saved.trim().replace(/\/$/, "");

  // Em desenvolvimento, usar localhost
  if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:3000";
  }

  // Em produção (PWA hospedada), o servidor está na mesma origem
  return window.location.origin;
}

// =============================================
// ESTADO GLOBAL
// =============================================

let _initialized = false;
let _serverURL = "";
let _syncInProgress = false;

// =============================================
// INICIALIZAÇÃO
// =============================================

export async function initWebApiBridge() {
  if (_initialized) return;

  _serverURL = getServerURL();
  console.log("[WebBridge] URL do servidor:", _serverURL);

  // Iniciar IndexedDB
  await initOfflineDB();
  _initialized = true;

  // Ouvir eventos de conectividade
  window.addEventListener("online", onCameOnline);
  window.addEventListener("offline", onWentOffline);

  // Ouvir mensagens do Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "PROCESS_SYNC_QUEUE") {
        triggerSync();
      }
    });
  }

  // Se online, fazer sync inicial
  if (navigator.onLine) {
    setTimeout(() => triggerSync(), 2000); // Aguardar login
  }

  console.log("[WebBridge] Inicializado. Online:", navigator.onLine);
}

function onCameOnline() {
  console.log("[WebBridge] Conexão restaurada! Sincronizando...");
  showSyncBanner("sync");
  triggerSync();
}

function onWentOffline() {
  console.log("[WebBridge] Conexão perdida. Modo offline ativo.");
  showOfflineBanner();
}

// =============================================
// BANNER DE STATUS (visível ao utilizador)
// =============================================

function showOfflineBanner() {
  let banner = document.getElementById("biz-offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "biz-offline-banner";
    banner.style.cssText = `
      position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
      background:#1e2d45; border:1px solid #ff6b35; color:#ff6b35;
      padding:10px 20px; border-radius:24px; font-size:13px; font-weight:600;
      z-index:99999; display:flex; align-items:center; gap:8px;
      box-shadow:0 4px 20px rgba(0,0,0,0.5); transition: all 0.3s;
      font-family:'DM Sans',sans-serif;
    `;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<i class="fa-solid fa-wifi" style="opacity:0.4"></i> Modo Offline — dados locais`;
  banner.style.display = "flex";
  banner.style.borderColor = "#ff6b35";
  banner.style.color = "#ff6b35";
}

function showSyncBanner(state = "sync") {
  let banner = document.getElementById("biz-offline-banner");
  if (!banner) return;
  if (state === "sync") {
    banner.innerHTML = `<i class="fa-solid fa-rotate" style="animation:spin 1s linear infinite"></i> A sincronizar...`;
    banner.style.borderColor = "#00d4aa";
    banner.style.color = "#00d4aa";
  } else if (state === "done") {
    banner.innerHTML = `<i class="fa-solid fa-check"></i> Dados sincronizados!`;
    banner.style.borderColor = "#00d4aa";
    banner.style.color = "#00d4aa";
    setTimeout(() => {
      if (banner) banner.style.display = "none";
    }, 3000);
  } else if (state === "hidden") {
    if (banner) banner.style.display = "none";
  }
}

// =============================================
// SINCRONIZAÇÃO
// =============================================

async function triggerSync() {
  if (_syncInProgress || !navigator.onLine) return;
  _syncInProgress = true;

  try {
    const token = localStorage.getItem("auth_token");

    // 1. Processar fila de operações pendentes
    const { synced, errors } = await processSyncQueue(_serverURL, token);
    if (synced > 0) {
      console.log(`[WebBridge] ${synced} operações sincronizadas.`);
    }

    // 2. Atualizar dados locais com dados do servidor
    await fullSync(_serverURL, token);

    showSyncBanner("done");
  } catch (err) {
    console.error("[WebBridge] Erro durante sync:", err);
  } finally {
    _syncInProgress = false;
  }
}

export function getSyncStatusInfo() {
  return getSyncStatus();
}

// =============================================
// REQUEST HELPER
// =============================================

async function request(method, endpoint, data = null, options = {}) {
  const token = localStorage.getItem("auth_token");
  const url = `${_serverURL}/api${endpoint}`;

  const fetchOptions = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data && method !== "GET" ? { body: JSON.stringify(data) } : {}),
  };

  if (!navigator.onLine) {
    throw new Error("OFFLINE");
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    // Token expirado
    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("biz_user");
      if (typeof window.logout === "function") window.logout();
      throw new Error("Sessão expirada. Por favor faça login novamente.");
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Erro ${response.status}`);
  }

  return response.json();
}

// =============================================
// MAPEAMENTO DE PRODUTO (igual ao electron-bridge)
// =============================================

function mapProdutoRow(row) {
  const preco = Number(row.preco_venda ?? row.preco ?? 0);
  const preco_custo = Number(row.preco_custo ?? row.custo ?? 0);
  const qtdCx = Math.max(1, Number(row.qtd_por_caixa) || 1);
  return {
    ...row,
    id: Number(row.id),
    nome: String(row.nome || "").trim() || "Produto",
    preco,
    preco_custo,
    custo: preco_custo,
    stock: Math.max(0, Number(row.stock) || 0),
    stockMin: Number(row.stock_minimo ?? row.stockMin ?? 10),
    icon: row.icon || "<i class='fa-solid fa-box'></i>",
    categoria: row.categoria_nome || row.categoria || row.cat || "Outros",
    cat: row.categoria_nome || row.categoria || row.cat || "Outros",
    unidade_medida: row.unidade_medida || "Unidade",
    qtd_por_caixa: qtdCx,
    preco_compra_caixa: Number(row.preco_compra_caixa ?? preco_custo * qtdCx),
    preco_venda_caixa: Number(row.preco_venda_caixa ?? preco * qtdCx),
    tamanho: row.tamanho || "",
    marca: row.marca || "",
    descricao: row.descricao || "",
    codigo_barras: row.codigo_barras || "",
    lote: row.lote || "",
    data_fabricacao: row.data_fabricacao || "",
    data_validade: row.data_validade || "",
  };
}

// =============================================
// API PÚBLICA (mesma interface do electron-bridge)
// =============================================

export function createWebApi() {
  return {

    // ===== AUTH =====
    async authLogin({ email, password }) {
      const isOnline = navigator.onLine;

      if (!isOnline) {
        // Login offline: verificar utilizador no IndexedDB
        const usuarios = await getUsuariosOffline();
        const user = usuarios.find(
          (u) => u.email === email && u._offline_password_hash === password
        );
        if (user) {
          const fakeToken = `offline_${btoa(JSON.stringify({ userId: user.id, role: user.role, empresaId: user.empresa_id }))}`;
          localStorage.setItem("auth_token", fakeToken);
          return user;
        }
        throw new Error("Sem internet e utilizador não encontrado localmente. Faça login online primeiro.");
      }

      const data = await request("POST", "/auth/login", { email, senha: password, isOnline });
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
      }
      if (!data.user) throw new Error("Resposta de login inválida.");

      // Guardar utilizadores offline
      const usuarios = await getUsuariosOffline();
      const exists = usuarios.find((u) => u.id === data.user.id);
      if (!exists) {
        await saveUsuarios([...usuarios, data.user]);
      }

      return data.user;
    },

    // ===== PRODUTOS =====
    async getProdutos() {
      try {
        const rows = await request("GET", "/produtos");
        const mapped = Array.isArray(rows) ? rows.map(mapProdutoRow) : [];
        await saveProdutos(rows); // Guardar offline
        return mapped;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          console.log("[WebBridge] Offline — usando produtos do IndexedDB");
          const rows = await getProdutosOffline();
          return rows.map(mapProdutoRow);
        }
        throw err;
      }
    },

    async addProduto(produto) {
      try {
        const result = await request("POST", "/produtos", produto);
        // Atualizar cache local
        const produtos = await getProdutosOffline();
        await saveProdutos([...produtos, result]);
        return result;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/produtos", produto, `Adicionar produto: ${produto.nome}`);
          const tempProduct = { ...produto, id: `offline_${Date.now()}`, _offline: true };
          const produtos = await getProdutosOffline();
          await saveProdutos([...produtos, tempProduct]);
          return tempProduct;
        }
        throw err;
      }
    },

    async atualizarProduto(id, dados) {
      try {
        const result = await request("PUT", `/produtos/${id}`, dados);
        await updateProdutoOffline(id, dados);
        return result;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("PUT", `/produtos/${id}`, dados, `Atualizar produto ID ${id}`);
          await updateProdutoOffline(id, dados);
          return { ...dados, id };
        }
        throw err;
      }
    },

    async deleteProduto({ id }) {
      try {
        return await request("DELETE", `/produtos/${id}`);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("DELETE", `/produtos/${id}`, {}, `Eliminar produto ID ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    // ===== CATEGORIAS =====
    async getCategorias() {
      try {
        const rows = await request("GET", "/categorias");
        const list = Array.isArray(rows) ? rows : [];
        await saveCategorias(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getCategoriasOffline();
        }
        throw err;
      }
    },

    async addCategoria({ nome }) {
      try {
        const result = await request("POST", "/categorias", { nome });
        const cats = await getCategoriasOffline();
        await saveCategorias([...cats, result]);
        return result;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/categorias", { nome }, `Adicionar categoria: ${nome}`);
          return { id: `offline_${Date.now()}`, nome, _offline: true };
        }
        throw err;
      }
    },

    // ===== VENDAS =====
    async getVendas() {
      try {
        const rows = await request("GET", "/vendas");
        const list = Array.isArray(rows) ? rows : [];
        await saveVendas(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getVendasOffline();
        }
        throw err;
      }
    },

    async registarVenda(venda) {
      try {
        const result = await request("POST", "/vendas", venda);
        return result;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          console.log("[WebBridge] Venda offline — guardando localmente");
          await addToSyncQueue("POST", "/vendas", venda, `Venda offline — Total: ${venda.total}`);
          const offlineVenda = await addVendaOffline(venda);
          if (window.showNotificationWrapper) {
            window.showNotificationWrapper("Venda guardada offline. Será sincronizada com o servidor quando houver internet.", "warning");
          }
          return offlineVenda;
        }
        throw err;
      }
    },

    async atualizarPagamentoVenda(id, dados) {
      try {
        return await request("PUT", `/vendas/${id}/pagamento`, dados);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("PUT", `/vendas/${id}/pagamento`, dados, `Atualizar pagamento venda ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    // ===== MOVIMENTAÇÕES =====
    async getMovimentos() {
      try {
        const rows = await request("GET", "/movimentacoes");
        const list = Array.isArray(rows) ? rows : [];
        await saveMovimentos(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getMovimentosOffline();
        }
        throw err;
      }
    },

    async addMovimento(movimento) {
      try {
        return await request("POST", "/movimentacoes", movimento);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/movimentacoes", movimento, `Movimento de stock offline`);
          return addMovimentoOffline(movimento);
        }
        throw err;
      }
    },

    // ===== RESERVAS =====
    async getReservas() {
      try {
        const rows = await request("GET", "/reservas");
        const list = Array.isArray(rows) ? rows : [];
        await saveReservas(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getReservasOffline();
        }
        throw err;
      }
    },

    async addReserva(dados) {
      try {
        return await request("POST", "/reservas", dados);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/reservas", dados, `Reserva offline`);
          return { ...dados, id: `offline_${Date.now()}`, _offline: true };
        }
        throw err;
      }
    },

    async atualizarStatusReserva(id, status) {
      try {
        return await request("PUT", `/reservas/${id}/status`, { status });
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("PUT", `/reservas/${id}/status`, { status }, `Atualizar reserva ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    // ===== UTILIZADORES =====
    async getUsuarios() {
      try {
        const rows = await request("GET", "/usuarios");
        const list = Array.isArray(rows) ? rows : [];
        await saveUsuarios(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getUsuariosOffline();
        }
        throw err;
      }
    },

    async addUsuario(dados) {
      try {
        return await request("POST", "/usuarios", dados);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/usuarios", dados, `Adicionar utilizador`);
          return { ...dados, id: `offline_${Date.now()}`, _offline: true };
        }
        throw err;
      }
    },

    async updateUsuario(id, dados) {
      try {
        return await request("PUT", `/usuarios/${id}`, dados);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("PUT", `/usuarios/${id}`, dados, `Atualizar utilizador ${id}`);
          return { ...dados, id };
        }
        throw err;
      }
    },

    async deleteUsuario(id) {
      try {
        return await request("DELETE", `/usuarios/${id}`);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("DELETE", `/usuarios/${id}`, {}, `Eliminar utilizador ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    async atualizarMinhaSenha(senhaAtual, novaSenha) {
      return request("PUT", "/usuarios/me/senha", { senhaAtual, novaSenha });
    },

    // ===== EMPRESA =====
    async getEmpresa() {
      try {
        const data = await request("GET", "/empresa");
        await saveEmpresa(data);
        return data;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getEmpresaOffline();
        }
        throw err;
      }
    },

    async atualizarEmpresa(dados) {
      try {
        const result = await request("PUT", "/empresa", dados);
        await saveEmpresa({ ...dados, id: dados.id || 1 });
        return result;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("PUT", "/empresa", dados, `Atualizar dados da empresa`);
          await saveEmpresa({ ...dados, id: dados.id || 1 });
          return { ...dados, _offline: true };
        }
        throw err;
      }
    },

    // ===== CAIXA =====
    async getCaixaAtual() {
      try {
        return await request("GET", "/caixas/atual");
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return null; // Sem caixa disponível offline
        }
        throw err;
      }
    },

    async abrirCaixa(valorInicial) {
      try {
        return await request("POST", "/caixas/abrir", { valor_inicial: valorInicial });
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/caixas/abrir", { valor_inicial: valorInicial }, `Abrir caixa`);
          return { id: `offline_${Date.now()}`, valor_inicial: valorInicial, _offline: true };
        }
        throw err;
      }
    },

    async reabrirCaixa(id) {
      try {
        return await request("POST", "/caixas/reabrir", { id });
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/caixas/reabrir", { id }, `Reabrir caixa ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    async fecharCaixa(id, valorFechamento, observacoes) {
      try {
        return await request("POST", "/caixas/fechar", { id, valor_fechamento: valorFechamento, observacoes });
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/caixas/fechar", { id, valor_fechamento: valorFechamento, observacoes }, `Fechar caixa ${id}`);
          return { success: true, _offline: true };
        }
        throw err;
      }
    },

    async getHistoricoCaixas() {
      try {
        return await request("GET", "/caixas/historico");
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return [];
        }
        throw err;
      }
    },

    // ===== FINANCEIRO =====
    async getFinanceiro() {
      try {
        const rows = await request("GET", "/financeiro");
        const list = Array.isArray(rows) ? rows : [];
        await saveFinanceiro(list);
        return list;
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getFinanceiroOffline();
        }
        throw err;
      }
    },

    async addFinanceiro(dados) {
      try {
        return await request("POST", "/financeiro", dados);
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          await addToSyncQueue("POST", "/financeiro", dados, `Lançamento financeiro offline`);
          return { ...dados, id: `offline_${Date.now()}`, _offline: true };
        }
        throw err;
      }
    },

    // ===== DASHBOARD =====
    async getDashboardStats() {
      try {
        return await request("GET", "/dashboard/stats");
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          return getDashboardStatsOffline();
        }
        throw err;
      }
    },

    // ===== LICENÇA =====
    async getLicenseStatus() {
      try {
        return await request("GET", "/license/status");
      } catch (err) {
        if (err.message === "OFFLINE" || !navigator.onLine) {
          const cached = localStorage.getItem("biz_license_cache");
          if (cached) {
            return { ...JSON.parse(cached), _offline: true };
          }
          return { status: "none", _offline: true };
        }
        throw err;
      }
    },

    async activateLicense(license_key, company_name, phone) {
      return request("POST", "/activate", { license_key, company_name, phone });
    },

    async validateLicense(license_key, version = "1.0.0") {
      if (!navigator.onLine) {
        console.warn("[WebBridge] Offline — validação de licença ignorada.");
        return { status: "ok", _offline: true };
      }
      return request("POST", "/validate", { license_key, version });
    },

    // ===== SUPER ADMIN =====
    async getSuperStats() {
      return request("GET", "/super/stats");
    },

    async getSuperEmpresas() {
      return request("GET", "/super/empresas");
    },

    async createFullCompany(dados) {
      return request("POST", "/super/empresas/completo", dados);
    },

    async updateSuperEmpresa(id, dados) {
      return request("PUT", `/super/empresas/${id}`, dados);
    },

    async getSuperLicenses() {
      return request("GET", "/super/licenses");
    },

    async blockLicenseRemote(license_key, status) {
      return request("POST", "/block", { license_key, status, api_key: "chave_mestra_bizcontrol" });
    },
  };
}
