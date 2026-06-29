// Integração com o backend e configuração da aplicação

import { api } from "./api.js";
import { PRODUTOS, VENDAS } from "./data.js";
import { showNotification } from "./paginas/helpers.js";

// Estado da aplicação
export const STATE = {
  role: "vendedor",
  user: null,
  empresa: null,
  currentPage: "",
  cart: [],
  charts: {},
  token: localStorage.getItem("auth_token"),
};

// Callbacks para atualizar estado
let setProdutosCallback = null;
let setVendasCallback = null;
let initVendedorPagesCallback = null;

export function setInitVendedorCallback(callback) {
  initVendedorPagesCallback = callback;
}

// ===== SISTEMA DE AUTENTICAÇÃO =====

/**
 * Realiza login do utilizador
 */
export async function doLogin() {
  const emailInput = document.getElementById("login-user");
  const passInput = document.getElementById("login-pass");
  const email = emailInput.value.trim();
  const senha = passInput.value;

  if (!email || !senha) {
    showNotification("Por favor, preencha email e senha", "info");
    return;
  }

  try {
    const response = await api.login(email, senha);

    STATE.user = response.user;
    STATE.role = response.user.role;
    STATE.token = response.token;

    // Armazenar token
    localStorage.setItem("auth_token", response.token);

    // Carregar dados do backend
    await loadUserData();

    // Mostrar app shell
    showAppShell();
  } catch (error) {
    showNotification(`Erro ao fazer login: ${error.message}`, "error");
    console.error("Erro de login:", error);
  }
}

/**
 * Carrega dados do utilizador após login
 */
export async function loadUserData() {
  try {
    // Carregar produtos do backend
    // const produtos = await api.getProdutos(STATE.empresa.id);
    // Se backend não tiver dados ainda, usar dados locais
    updateProdutos();

    // Carregar vendas
    // const vendas = await api.getVendas(STATE.empresa.id);
    updateVendas();
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
  }
}

export function doLogout() {
  STATE.user = null;
  STATE.token = null;
  STATE.role = "vendedor";
  STATE.cart = [];
  STATE.currentPage = "";

  localStorage.removeItem("auth_token");
  api.logout();

  // Mostrar login
  const loginScreen = document.getElementById("login-screen");
  const appShell = document.getElementById("app-shell");

  if (loginScreen) loginScreen.classList.remove("hidden");
  if (appShell) appShell.classList.add("hidden");

  // Limpar inputs
  document.getElementById("login-user").value = "";
  document.getElementById("login-pass").value = "";
}

/**
 * Exibe o app shell após login
 */
function showAppShell() {
  const loginScreen = document.getElementById("login-screen");
  const appShell = document.getElementById("app-shell");
  const userAvatarEl = document.getElementById("topbar-avatar");
  const userNameEl = document.getElementById("topbar-username");
  const userRoleEl = document.getElementById("topbar-userrole");

  if (loginScreen) loginScreen.classList.add("hidden");
  if (appShell) appShell.classList.remove("hidden");

  // Atualizar informações do utilizador
  if (STATE.user) {
    const nameLetters = STATE.user.nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

    if (userAvatarEl) userAvatarEl.textContent = nameLetters;
    if (userNameEl) userNameEl.textContent = STATE.user.nome;
    if (userRoleEl) userRoleEl.textContent = getRoleLabel(STATE.user.role);
  }

  // Inicializar menu e páginas
  initMenu();
}

/**
 * Traduz role para português
 */
function getRoleLabel(role) {
  const labels = {
    vendedor: "Vendedor",
    gestor: "Gestor",
    super: "Super Admin",
  };
  return labels[role] || role;
}

// ===== MENUS POR ROLE =====

const MENUS = {
  vendedor: [
    { id: "vender", icon: "<i class='fa-solid fa-credit-card'></i>", label: "Efectuar Venda" },
    { id: "produtos-v", icon: "<i class='fa-solid fa-box'></i>", label: "Produtos" },
    { id: "reservar", icon: "<i class='fa-solid fa-clipboard'></i>", label: "Reservar Produtos" },
  ],
  gestor: [
    { id: "dashboard", icon: "<i class='fa-solid fa-house'></i>", label: "Dashboard" },
    { id: "cadastrar", icon: "<i class='fa-solid fa-plus'></i>", label: "Cadastrar Produtos" },
    { id: "stock", icon: "<i class='fa-solid fa-box'></i>", label: "Nível de Stock" },
    { id: "financas", icon: "<i class='fa-solid fa-money-bill-wave'></i>", label: "Finanças" },
    { id: "funcionarios", icon: "<i class='fa-solid fa-user-group'></i>", label: "Funcionários" },
    { id: "historico", icon: "<i class='fa-solid fa-clock-rotate-left'></i>", label: "Historico" },
    { id: "estatisticas", icon: "<i class='fa-solid fa-chart-line'></i>", label: "Estatísticas" },
    { id: "reservas-g", icon: "<i class='fa-solid fa-clipboard'></i>", label: "Reservas" },
    { id: "definicoes", icon: "<i class='fa-solid fa-gear'></i>", label: "Definições" },
  ],
  super: [
    // { id: "empresas", icon: "<i class='fa-solid fa-building'></i>", label: "Empresas" },
    // { id: "subscricoes", icon: "<i class='fa-solid fa-credit-card'></i>", label: "Subscrições" },
    // { id: "super-stats", icon: "<i class='fa-solid fa-chart-simple'></i>", label: "Estatísticas Globais" },
  ],
};

export const PAGES = {};

/**
 * Inicializa o menu com base no role
 */
function initMenu() {
  const sidebar = document.querySelector(".sidebar ul");
  if (!sidebar) return;

  sidebar.innerHTML = "";

  const menu = MENUS[STATE.role] || MENUS.vendedor;
  const logoutBtn = document.querySelector(".logout-btn");

  menu.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `${item.icon} <span>${item.label}</span>`;
    li.className = "menu-item";
    li.dataset.pageId = item.id;
    li.onclick = () => navigateTo(item.id);

    sidebar.appendChild(li);
  });

  // Adicionar botão de logout
  if (logoutBtn) {
    logoutBtn.onclick = doLogout;
  }

  // Navegar para primeira página
  const firstPage = menu[0]?.id || "vender";
  navigateTo(firstPage);
}

/**
 * Navega para uma página
 */
export function navigateTo(pageId) {
  STATE.currentPage = pageId;

  const contentArea = document.getElementById("content-area");
  if (!contentArea) return;

  contentArea.innerHTML = "";

  // Marcar item do menu como ativo
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.pageId === pageId);
  });

  // Chamar página correspondente
  if (PAGES[pageId]) {
    PAGES[pageId](contentArea);
  }
}

// ===== FUNÇÕES DE ATUALIZAÇÃO DE DADOS =====

export function setDataCallbacks(setProdutosCallback, setVendasCallback) {
  setProdutosCallback = setProdutosCallback;
  setVendasCallback = setVendasCallback;
}

function updateProdutos() {
  if (setProdutosCallback) {
    setProdutosCallback(PRODUTOS);
  }
}

function updateVendas() {
  if (setVendasCallback) {
    setVendasCallback(VENDAS);
  }
}

/**
 * Registar nova venda
 */
export async function registarVenda(itens, total) {
  try {
    const result = await api.registarVenda(STATE.empresa?.id || 1, itens, total);
    return result;
  } catch (error) {
    console.error("Erro ao registar venda:", error);
    throw error;
  }
}

/**
 * Criar nova reserva
 */
export async function criarReserva(produtoId, quantidade) {
  try {
    const result = await api.criarReserva(STATE.empresa?.id || 1, produtoId, quantidade);
    return result;
  } catch (error) {
    console.error("Erro ao criar reserva:", error);
    throw error;
  }
}

/**
 * Criar novo produto
 */
export async function criarProduto(produto) {
  try {
    const result = await api.criarProduto(produto);
    return result;
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    throw error;
  }
}

// Exportar função doLogin para uso global
window.doLogin = doLogin;
