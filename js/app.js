import { destroyCharts } from "./utils.js";
import { t } from "./i18n.js";
import { applySystemBackground } from "./theme.js";
import { showModal, closeModal, showNotification } from "./paginas/helpers.js";
import * as vendedorPages from "./paginas/vendedor.js";
import * as gestorPages from "./paginas/gestor.js";
import * as superPages from "./paginas/super.js";
import * as caixaPages from "./paginas/caixa.js";
import { initElectronApiBridge, loginWithElectronApi } from "./electron-bridge.js";
import { initWebApiBridge, ensureWebApiReady } from "./web-api-bridge.js";
import {
  initMobileUI,
  initOfflineIndicator,
  initSyncBadge,
  initPullToRefresh,
  updateSyncBadge,
  onNavigateMobile,
} from "./mobile-ui.js";
import { getSyncStatus } from "./offline-db.js";

// ──────────────────────────────────────────────
// Deteção de ambiente: Electron vs. Web/Mobile
// ──────────────────────────────────────────────
const IS_ELECTRON = !!window.electronAPI;
const IS_WEB = !IS_ELECTRON;

// Inicializar Mobile UI sempre (hamburguer, gestos, indicadores)
initMobileUI();
initOfflineIndicator();

// Inicializar Web Bridge se não estiver no Electron
if (IS_WEB) {
  ensureWebApiReady()
    .then(() => {
      console.log("[App] Web API Bridge inicializado.");
    })
    .catch((err) => {
      console.error("[App] Erro ao inicializar Web Bridge:", err);
    });
}

// Estado global
export const STATE = {
  role: "vendedor",
  user: null,
  currentPage: "",
  cart: [],
  charts: {},
  caixa: null,
};

// Callbacks para atualizar estado
let setProdutosCallback = null;
let setVendasCallback = null;
let currentProdutos = null;
let currentVendas = null;
let initVendedorPagesCallback = null;

export function setInitVendedorCallback(callback) {
  initVendedorPagesCallback = callback;
}

// Menus por role
const MENUS = {
  vendedor: [
    { id: "vender", icon: "<i class='fa-solid fa-credit-card'></i>", label: t("vender") },
    { id: "produtos-v", icon: "<i class='fa-solid fa-box'></i>", label: t("produtos_v") },
    { id: "caixa", icon: "<i class='fa-solid fa-cash-register'></i>", label: "Caixa" },
    { id: "reservar", icon: "<i class='fa-solid fa-clipboard'></i>", label: t("reservar") }
  ],
  gestor: [
    { id: "dashboard", icon: "<i class='fa-solid fa-house'></i>", label: t("dashboard") },
    { id: "cadastrar", icon: "<i class='fa-solid fa-plus'></i>", label: t("cadastrar") },
    { id: "stock", icon: "<i class='fa-solid fa-box'></i>", label: t("stock") },
    { id: "caixa", icon: "<i class='fa-solid fa-cash-register'></i>", label: "Caixa" },
    { id: "financas", icon: "<i class='fa-solid fa-money-bill-wave'></i>", label: t("financas") },
    { id: "funcionarios", icon: "<i class='fa-solid fa-user-group'></i>", label: t("funcionarios") },
    { id: "historico", icon: "<i class='fa-solid fa-clock-rotate-left'></i>", label: t("historico") },
    { id: "estatisticas", icon: "<i class='fa-solid fa-chart-line'></i>", label: t("estatisticas") },
    { id: "reservas-g", icon: "<i class='fa-solid fa-clipboard'></i>", label: t("reservas") },
    { id: "definicoes", icon: "<i class='fa-solid fa-gear'></i>", label: t("definicoes") }
  ],
  super: [
    // { id: "empresas", icon: "<i class='fa-solid fa-building'></i>", label: t("empresas") },
    // { id: "criar-empresa", icon: "<i class='fa-solid fa-plus'></i>", label: "Criar Empresa" },
    // { id: "subscricoes", icon: "<i class='fa-solid fa-credit-card'></i>", label: t("subscricoes") },
    // { id: "super-stats", icon: "<i class='fa-solid fa-chart-simple'></i>", label: t("super_stats") }
  ]
};

// Registro de páginas
export const PAGES = {
  // Vendedor
  vender: vendedorPages.renderVender,
  "produtos-v": vendedorPages.renderProdutosV,
  caixa: caixaPages.renderCaixa,
  reservar: vendedorPages.renderReservar,
  // Gestor
  dashboard: gestorPages.renderDashboard,
  cadastrar: gestorPages.renderCadastrar,
  stock: gestorPages.renderStock,
  financas: gestorPages.renderFinancas,
  "funcionarios": gestorPages.renderFuncionarios,
  "historico": gestorPages.renderHistoricoVendas,
  estatisticas: gestorPages.renderEstatisticas,
  "reservas-g": gestorPages.renderReservasG,
  definicoes: gestorPages.renderDefinicoes,
  // Super
  empresas: superPages.renderEmpresas,
  "criar-empresa": superPages.renderCriarEmpresa,
  subscricoes: superPages.renderSubscricoes,
  "super-stats": superPages.renderSuperStats
};

export function setDataCallbacks(produtos, setProdutos, vendas, setVendas) {
  currentProdutos = produtos;
  setProdutosCallback = setProdutos;
  currentVendas = vendas;
  setVendasCallback = setVendas;
}

const mapUserRole = (user) => {
  if (!user) return "vendedor";
  const r = String(user.role || "").toLowerCase().trim();
  const p = String(user.perfil || "").toLowerCase().trim();
  
  if (r === "super" || r === "administrator" || p === "super") return "super";
  if (r === "gestor" || r === "admin" || r === "gerente" || p === "admin") return "gestor";
  
  if (Array.isArray(user.permissoes) && user.permissoes.includes("criar_produto")) return "gestor";
  
  return "vendedor";
};

async function refreshSystemBackground() {
  if (STATE.role === "gestor" || STATE.role === "vendedor") {
    try {
      if (window.api && window.api.getEmpresa) {
        const empresa = await window.api.getEmpresa();
        if (empresa && empresa.background_image) {
          applySystemBackground(empresa.background_image);
          return;
        }
      }
    } catch (e) {
      console.error("Erro ao carregar fundo da empresa:", e);
    }
  }
  applySystemBackground(null);
}

export async function syncCaixaStatus() {
  if (!window.api?.getCaixaAtual) return;
  try {
    STATE.caixa = await window.api.getCaixaAtual();
  } catch (err) {
    console.error("Erro ao sincronizar caixa:", err);
  }
}

export async function doLogin() {
  console.log("doLogin() chamado");
  const email = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  console.log("Email:", email, "Senha:", password ? "***" : "(vazia)");

  if (!email || !password) {
    showNotification("Informe email e senha para entrar.", "warning");
    return;
  }

  // Garantir bridge offline pronta no mobile/web
  if (IS_WEB) {
    await ensureWebApiReady();
  }

  // Inicializar bridge correta conforme o ambiente
  if (IS_ELECTRON) {
    initElectronApiBridge();
  }

  const runLogin = () => {
    if (window.api?.authLogin) {
      return window.api.authLogin({ email, password });
    }
    if (IS_ELECTRON) {
      return loginWithElectronApi(email, password);
    }
    throw new Error("Nenhuma API disponível. Verifique a configuração do servidor.");
  };

  if (!window.api?.authLogin && !window.electronAPI?.post) {
    showNotification("API não disponível. Em modo web, verifique a URL do servidor.", "error");
    return;
  }

  console.log("Iniciando login...", { hasElectronAPI: !!window.electronAPI?.post, hasApiAuthLogin: !!window.api?.authLogin });

  const btn = document.querySelector("#login-screen .btn-primary");
  if (btn) {
    btn.disabled = true;
    btn.dataset.prevText = btn.textContent;
    btn.textContent = "A entrar…";
  }

  let user;
  try {
    user = await runLogin();
  } catch (error) {
    console.error("Falha ao autenticar:", error);
    showNotification(error?.message || "Não foi possível autenticar.", "error");
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.prevText || "Entrar no Sistema";
    }
  }

  const nome = String(user?.nome || "Utilizador").trim() || "Utilizador";
  const initials =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  STATE.user = user;
  STATE.role = mapUserRole(user);
  localStorage.setItem("biz_user", JSON.stringify(user));
  console.log("Login bem-sucedido. Role identificado:", STATE.role);

  await syncCaixaStatus();

  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");

  document.getElementById("topbar-username").textContent = nome;
  document.getElementById("topbar-userrole").textContent = t("role_" + STATE.role);
  document.getElementById("topbar-avatar").textContent = initials;
  document.getElementById("topbar-company").textContent = user.email || email;
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.textContent = t("logout");

  try {
    if (initVendedorPagesCallback) {
      await initVendedorPagesCallback(user);
    }
    await syncCaixaStatus();
    await refreshSystemBackground();
    buildSidebar();
    // Inicializar sync badge e pull-to-refresh em modo web
    if (IS_WEB) {
      initSyncBadge();
      initPullToRefresh(async () => {
        if (initVendedorPagesCallback) await initVendedorPagesCallback(user);
        showNotification("Dados atualizados!", "success");
      });
      // Atualizar badge de sync a cada 30s
      setInterval(async () => {
        try {
          const status = await getSyncStatus();
          updateSyncBadge(status.pending || 0);
        } catch (_) {}
      }, 30000);
    }
  } catch (syncErr) {
    console.error("Erro após login (dados/menu):", syncErr);
    try {
      buildSidebar();
    } catch (e2) {
      console.error(e2);
    }
    showNotification(
      "Entrou no sistema, mas houve um erro ao preparar o ecrã: " + (syncErr?.message || String(syncErr)),
      "warning"
    );
  }
}

export function logout() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
  STATE.user = null;
  STATE.role = "vendedor";
  applySystemBackground(null);
  try {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("biz_user");
  } catch (_) {
    /* ignore */
  }
  STATE.cart = [];
  STATE.charts = destroyCharts(STATE.charts);
}

export async function restoreSession() {
  if (IS_WEB) {
    await ensureWebApiReady();
  }

  const savedUser = localStorage.getItem("biz_user");
  const savedToken = localStorage.getItem("auth_token");
  
  if (!savedUser || !savedToken) {
    if (savedUser || savedToken) logout(); // Limpar se estiver inconsistente
    return;
  }

  try {
    const user = JSON.parse(savedUser);
    STATE.user = user;
    STATE.role = mapUserRole(user);

    await syncCaixaStatus();

    const nome = String(user?.nome || "Utilizador").trim() || "Utilizador";
    const initials = nome.split(/\s+/).filter(Boolean).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "?";

    // Ocultar login antes de sincronizar para dar sensação de rapidez
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");

    document.getElementById("topbar-username").textContent = nome;
    document.getElementById("topbar-userrole").textContent = t("role_" + STATE.role);
    document.getElementById("topbar-avatar").textContent = initials;
    document.getElementById("topbar-company").textContent = user.email || user.nome;
    
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.textContent = t("logout");

    if (initVendedorPagesCallback) {
      // O syncBackendData é chamado dentro do initVendedorPagesCallback
      // Se falhar com 401, o unwrap no electron-bridge chamará logout()
      await initVendedorPagesCallback(user);
    }
    await refreshSystemBackground();
    buildSidebar();
    
    // Se estávamos em uma página específica antes do reload, tentar voltar para ela
    const lastPage = sessionStorage.getItem("biz_last_page");
    if (lastPage && PAGES[lastPage]) {
      navigateTo(lastPage);
    }

  } catch (e) {
    console.error("Erro ao restaurar sessão:", e);
    logout();
  }
}

export function buildSidebar() {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  const items = MENUS[STATE.role] || MENUS.vendedor;
  sb.innerHTML = '<div class="nav-section">Menu</div>';
  items.forEach((m) => {
    const div = document.createElement("div");
    div.className = "nav-item";
    div.id = "nav-" + m.id;
    div.innerHTML = `<span class="nav-icon">${m.icon}</span><span>${m.label}</span>`;
    div.onclick = () => navigateTo(m.id);
    sb.appendChild(div);
  });
  navigateTo(items[0].id);
}

export async function navigateTo(page) {
  STATE.currentPage = page;
  sessionStorage.setItem("biz_last_page", page);
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const ni = document.getElementById("nav-" + page);
  if (ni) ni.classList.add("active");
  STATE.charts = destroyCharts(STATE.charts);
  const ca = document.getElementById("content-area");
  if (!ca) return;
  ca.innerHTML = "";
  if (PAGES[page]) {
    await PAGES[page](ca);
  }
  // Fechar sidebar em mobile após navegação
  onNavigateMobile();
}

window.STATE = STATE;
window.navigateTo = navigateTo;
window.doLogin = doLogin;
window.logout = logout;
window.closeModal = closeModal;
window.showModalWrapper = showModal;
window.showNotificationWrapper = showNotification;

/** Delegado pelo carrinho (helpers) — implementação em vendedor.js */
window.changeQtyWrapper = function (id, delta) {
  if (typeof window.changeQtyWrapperImpl === "function") {
    window.changeQtyWrapperImpl(id, delta);
  }
};

initElectronApiBridge();
