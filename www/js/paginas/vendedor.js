import { fmt } from "../utils.js";
import { CATEGORIAS, RESERVAS, addReserva } from "../data.js";
import { cartTotals, findProdutoByBarcode, matchesProdutoQuery, normalizeProdutoPDV, normalizeId } from "../pdv-utils.js";
import { getExpirationStatus } from "../produtos-calc.js";
import {
  alertaStock,
  addToCart,
  changeQty,
  renderCart,
  confirmarVenda,
  getCartState,
  getSaleDiscount,
  resetSaleDiscount,
  setCartState,
  setItemDiscount,
  setSaleDiscount,
  showNotification,
} from "./helpers.js";

let setCartCallback = null;
let currentProdutos = [];
let setProdutosCallback = null;
let currentUser = null;
let setVendasCallback = null;
let currentVendas = [];
let currentSearch = "";
let currentSellerHistory = [];
let currentSellerSales = [];
let suspendedCarts = [];
let currentReservas = [];

const SUSPENDED_CARTS_KEY = "bizcontrol_suspended_carts";
const CANCEL_REASONS_KEY = "bizcontrol_cancel_reasons";
const CASH_SESSIONS_KEY = "bizcontrol_cash_sessions";
const PAID_PENDING_KEY = "bizcontrol_paid_pending_sales";
const DISCOUNT_LIMIT_PERCENT = 10;

export function syncVendedorProdutos(produtos) {
  currentProdutos = Array.isArray(produtos) ? produtos.map(normalizeProdutoPDV).filter(Boolean) : [];
}

export function initVendedorPages(cart, setCart, produtos, setProdutos, user, vendas, setVendas) {
  setCartCallback = setCart;
  setProdutosCallback = setProdutos;
  syncVendedorProdutos(produtos);
  currentUser = user;
  currentVendas = vendas || [];
  setVendasCallback = setVendas;
  loadSuspendedCarts();
  refreshReservas();
}

async function refreshReservas() {
  try {
    if (window.api?.getReservas) {
      currentReservas = await window.api.getReservas();
    }
  } catch (err) {
    console.error("Erro ao carregar reservas:", err);
  }
}

function getCart() {
  const stateCart = window.STATE?.cart;
  if (Array.isArray(stateCart) && stateCart.length) return stateCart;
  const helperCart = getCartState();
  if (Array.isArray(helperCart) && helperCart.length) return helperCart;
  return Array.isArray(stateCart) ? stateCart : [];
}

function getActiveCategory() {
  return document.querySelector(".cat-btn.active")?.dataset.cat || "Todos";
}

function loadSuspendedCarts() {
  try {
    suspendedCarts = JSON.parse(localStorage.getItem(SUSPENDED_CARTS_KEY) || "[]");
  } catch {
    suspendedCarts = [];
  }
}

function saveSuspendedCarts() {
  localStorage.setItem(SUSPENDED_CARTS_KEY, JSON.stringify(suspendedCarts.slice(0, 12)));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserKey() {
  return currentUser?.id || currentUser?.email || "vendedor";
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getCashSession() {
  const sessions = readJson(CASH_SESSIONS_KEY, {});
  return sessions[`${getUserKey()}-${todayKey()}`] || null;
}

function saveCashSession(session) {
  const sessions = readJson(CASH_SESSIONS_KEY, {});
  sessions[`${getUserKey()}-${todayKey()}`] = session;
  writeJson(CASH_SESSIONS_KEY, sessions);
}

function getPaidPendingIds() {
  return readJson(PAID_PENDING_KEY, []);
}

function markPendingPaidLocal(id) {
  const ids = new Set(getPaidPendingIds().map(String));
  ids.add(String(id));
  writeJson(PAID_PENDING_KEY, [...ids]);
}

function recordCancelReason(item, reason) {
  const rows = JSON.parse(localStorage.getItem(CANCEL_REASONS_KEY) || "[]");
  rows.unshift({
    id: Date.now(),
    produto: item?.nome || "Produto",
    qty: item?.qty || 1,
    reason,
    vendedor: currentUser?.nome || "Vendedor",
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(CANCEL_REASONS_KEY, JSON.stringify(rows.slice(0, 100)));
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setCartSafe(cart) {
  const next = Array.isArray(cart) ? cart : [];
  if (typeof setCartCallback === "function") {
    setCartCallback(next);
    return;
  }
  if (window.STATE) window.STATE.cart = next;
  setCartState(next);
  renderCart();
}

function renderSuspendedCarts() {
  if (!suspendedCarts.length) {
    return '<div class="empty-state" style="padding:12px"><div>Sem carrinhos suspensos</div></div>';
  }
  return suspendedCarts
    .map(
      (s) => `
        <div class="suspended-row">
          <div>
            <strong>${s.cliente}</strong>
            <div>${s.items.length} item(ns) - ${fmt(s.total || 0)}</div>
          </div>
          <button class="btn btn-sm btn-blue" onclick="window.resumeSuspendedCartWrapper(${s.id})">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>`
    )
    .join("");
}

function renderQuickProducts() {
  const counts = new Map();
  (currentVendas || []).forEach((v) => {
    (v.produtos || []).forEach((p) => counts.set(p.nome, (counts.get(p.nome) || 0) + Number(p.qty || 1)));
  });
  const products = [...currentProdutos]
    .filter((p) => p.stock > 0)
    .sort((a, b) => (counts.get(b.nome) || 0) - (counts.get(a.nome) || 0) || b.stock - a.stock)
    .slice(0, 6);
  if (!products.length) return "";
  return `
    <div class="quick-products">
      ${products
        .map(
          (p) =>
            `<button type="button" class="quick-product-btn" onclick="window.addToCartWrapper(${p.id})">${p.icon || ""}<span>${p.nome}</span></button>`
        )
        .join("")}
    </div>`;
}

function salesToday() {
  const today = todayKey();
  return currentSellerSales.filter((v) => saleDate(v) === today);
}

function salesByPayment(rows = salesToday()) {
  return rows.reduce((acc, v) => {
    const method = v.metodo_pagamento || "dinheiro";
    acc[method] = (acc[method] || 0) + Number(v.total || 0);
    return acc;
  }, {});
}

function renderCashSummary() {
  const session = STATE.caixa;
  const isAberto = session && session.status === "aberto";

  if (!isAberto) {
    return `
      <div class="cash-status">
        <div><strong>Caixa fechado</strong><span>Abra o caixa antes do turno para registar vendas</span></div>
        <button class="btn btn-sm btn-green" onclick="window.navigateTo('caixa')"><i class="fa-solid fa-lock-open"></i> Ir para Caixa</button>
      </div>`;
  }

  // Se estiver aberto, mostramos um resumo rápido e link para a página detalhada
  return `
    <div class="cash-status">
      <div>
        <strong>Caixa Aberto</strong>
        <span>Iniciado em: ${new Date(session.aberto_em).toLocaleTimeString()}</span>
      </div>
      <button class="btn btn-sm btn-blue" onclick="window.navigateTo('caixa')"><i class="fa-solid fa-cash-register"></i> Gerir Caixa</button>
    </div>`;
}

function refreshCashSummary() {
  const box = document.getElementById("cash-summary");
  if (box) box.innerHTML = renderCashSummary();
}

function renderPendingSalesRows() {
  const paid = new Set(getPaidPendingIds().map(String));
  const rows = currentSellerSales
    .filter((v) => (v.status_pagamento || "pago") === "pendente" && !paid.has(String(v.id)))
    .slice(0, 6);
  if (!rows.length) {
    return '<div class="empty-state" style="padding:12px"><div>Sem vendas pendentes</div></div>';
  }
  return rows
    .map(
      (v) => `
      <div class="pending-row">
        <div>
          <strong>${escapeAttr(v.cliente_nome || "Cliente")}</strong>
          <div>${fmt(Number(v.total || 0))} - ${saleDate(v) || "Hoje"}</div>
        </div>
        <button class="btn btn-sm btn-green" onclick="window.markPendingSalePaidWrapper('${escapeAttr(v.id)}', ${Number(v.total || 0)})">
          <i class="fa-solid fa-check"></i>
        </button>
      </div>`
    )
    .join("");
}

function refreshPendingSales() {
  const box = document.getElementById("pending-sales");
  if (box) box.innerHTML = renderPendingSalesRows();
}

function getCartTotals() {
  return cartTotals(getCart(), getSaleDiscount());
}

function updateCartPaymentPreview() {
  const totals = getCartTotals();
  const metodo = document.getElementById("pdv-payment-method")?.value || "dinheiro";
  const status = document.getElementById("pdv-sale-status")?.value || "pago";
  const receivedInput = document.getElementById("pdv-received");
  const receivedWrap = document.getElementById("pdv-received-wrap");
  const changeEl = document.getElementById("pdv-change");
  const showCash = metodo === "dinheiro" && status === "pago";
  if (receivedWrap) receivedWrap.style.display = showCash ? "block" : "none";
  if (receivedInput && !receivedInput.value && totals.total > 0) receivedInput.value = totals.total;
  if (changeEl) changeEl.textContent = fmt(Math.max(0, Number(receivedInput?.value || 0) - totals.total));
  
  // Atualizar resumo (preview)
  const sTotal = document.getElementById("summary-total");
  const sClient = document.getElementById("summary-client");
  const sPayment = document.getElementById("summary-payment");
  const sStatus = document.getElementById("summary-status");

  if (sTotal) sTotal.textContent = fmt(totals.total);
  if (sClient) sClient.textContent = document.getElementById("pdv-client-name")?.value || "Cliente balcão";
  if (sPayment) sPayment.textContent = metodo;
  if (sStatus) {
    sStatus.textContent = status === "pago" ? "Pago" : "Pendente";
    sStatus.className = `badge ${status === "pago" ? "green" : "amber"}`;
  }

  const discountWarning = document.getElementById("pdv-discount-warning");
  const discountPercent = totals.subtotal > 0 ? Math.round((totals.descontoTotal / totals.subtotal) * 100) : 0;
  if (discountWarning) {
    discountWarning.style.display = discountPercent > DISCOUNT_LIMIT_PERCENT ? "block" : "none";
    discountWarning.textContent = `Desconto acima do limite do vendedor (${discountPercent}%).`;
  }
}

function saleDate(row) {
  return row.criado_em ? String(row.criado_em).split("T")[0].split(" ")[0] : row.data || "";
}

async function refreshSellerHistory() {
  const userId = currentUser?.id;
  let backendRows = [];
  try {
    if (window.api?.getVendas) {
      backendRows = await window.api.getVendas();
    } else if (window.api?.getMovimentos) {
      const movimentos = await window.api.getMovimentos();
      backendRows = movimentos
        .filter((m) => m.tipo === "venda")
        .map((m) => ({
          id: `mov-${m.id}`,
          usuario_id: m.usuario_id,
          vendedor: m.usuario_nome,
          total: Number(m.total || 0),
          criado_em: m.criado_em,
        }));
    }
  } catch (err) {
    console.warn("Histórico de vendas indisponível.", err);
  }

  const localRows = (currentVendas || []).map((v) => ({
    id: `local-${v.id}`,
    usuario_id: userId,
    vendedor: v.vendedor,
    total: Number(v.total || 0),
    criado_em: v.criado_em || v.data,
    metodo_pagamento: v.metodo_pagamento || "dinheiro",
    status_pagamento: v.status_pagamento || "pago",
    cliente_nome: v.cliente_nome || "Cliente balcão",
    cliente_contacto: v.cliente_contacto || "",
    valor_recebido: Number(v.valor_recebido || 0),
    troco: Number(v.troco || 0),
  }));

  const rows = [...backendRows, ...localRows]
    .filter((v) => !userId || !v.usuario_id || Number(v.usuario_id) === Number(userId))
    .filter((v, idx, arr) => arr.findIndex((x) => String(x.id) === String(v.id)) === idx)
    .sort((a, b) => String(b.criado_em || "").localeCompare(String(a.criado_em || "")));

  currentSellerSales = rows;
  currentSellerHistory = rows.slice(0, 8);
  const box = document.getElementById("seller-history");
  if (box) box.innerHTML = renderSellerHistoryRows();
  refreshCashSummary();
  refreshPendingSales();
}

function renderSellerHistoryRows() {
  if (!currentSellerHistory.length) {
    return '<div class="empty-state" style="padding:16px"><div class="es-icon"><i class="fa-solid fa-receipt"></i></div><div>Sem vendas recentes</div></div>';
  }
  return currentSellerHistory
    .map(
      (v) => `
      <div class="history-row">
        <div>
          <strong>${fmt(Number(v.total || 0))}</strong>
          <div>${saleDate(v) || "Hoje"}</div>
        </div>
        <span class="badge green">Concluida</span>
      </div>`
    )
    .join("");
}

function getCategoriasFromProdutos() {
  const fromProducts = [...new Set(currentProdutos.map((p) => p.cat || p.categoria).filter(Boolean))];
  return [...new Set([...CATEGORIAS, ...fromProducts])];
}

export function renderVender(el) {
  const categorias = getCategoriasFromProdutos();

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-credit-card" style="margin-right:8px"></i> Efectuar Venda</div>
      <div class="page-sub">Seleccione os produtos e confirme a venda</div>
    </div>
    <div class="pdv-layout">
      <div class="pdv-products">
        <div class="pdv-tools">
          <div class="field">
            <label>Pesquisar produto</label>
            <input id="pdv-search" placeholder="Nome, categoria ou codigo" value="${currentSearch}"/>
          </div>
          <div class="field">
            <label>Codigo de barras</label>
            <div class="input-with-btn">
              <input id="pdv-barcode" placeholder="Ler ou digitar codigo"/>
              <button type="button" class="btn btn-blue btn-sm" id="btn-barcode-add"><i class="fa-solid fa-barcode"></i></button>
            </div>
          </div>
        </div>
        ${renderQuickProducts()}
        <div class="cat-filters" id="cat-filters">
          <button type="button" class="btn btn-blue btn-sm cat-btn active" data-cat="Todos">Todos</button>
          ${categorias
            .map(
              (c) =>
                `<button type="button" class="btn btn-sm cat-btn" data-cat="${c}" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">${c}</button>`
            )
            .join("")}
        </div>
        <div class="product-grid" id="prod-grid"></div>
      </div>
      <div class="pdv-cart">
        <div class="cart-area">
          <div class="cart-header">
            <div class="cart-title"><i class="fa-solid fa-cart-shopping"></i> Carrinho</div>
            <span class="cart-qty-badge" id="cart-qty-total">0 itens</span>
          </div>
          <div class="cart-actions-row">
            <button type="button" class="btn btn-sm btn-blue" id="btn-suspend-cart" onclick="window.suspendCartWrapper()"><i class="fa-solid fa-pause"></i> Suspender</button>
            <button type="button" class="btn btn-sm btn-red" id="btn-clear-cart" onclick="window.clearCartWithReasonWrapper()"><i class="fa-solid fa-xmark"></i> Cancelar</button>
          </div>
          <div id="cart-feedback" class="cart-feedback" aria-live="polite"></div>
          <div id="cart-items">
            <div class="empty-state" style="padding:20px">
              <div class="es-icon"><i class="fa-solid fa-cart-shopping"></i></div>
              <div>Nenhum item</div>
            </div>
          </div>
          <div class="divider"></div>
          <div id="cart-subtotal" class="cart-summary-row">
            <span>Subtotal</span><span>MT 0.00</span>
          </div>
          <div id="cart-total" class="cart-total-row">
            <span>Total</span><span>MT 0.00</span>
          </div>
          <div class="cart-limit-warning" id="pdv-discount-warning" style="display:none"></div>
          
          <div class="cart-summary-preview" id="pdv-summary-preview" style="background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:12px; margin-top:12px; font-size:13px; cursor:pointer">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
              <span style="color:var(--text2)">Total</span>
              <strong id="summary-total" style="color:var(--accent); font-size:15px">MT 0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
              <span style="color:var(--text2)">Cliente</span>
              <span id="summary-client">Cliente balcão</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
              <span style="color:var(--text2)">Pagamento</span>
              <span id="summary-payment" style="text-transform:capitalize">Dinheiro</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px">
              <span style="color:var(--text2)">Estado</span>
              <span id="summary-status" class="badge green" style="font-size:10px">Pago</span>
            </div>
            <div style="text-align:center; color:var(--accent2); font-weight:600; font-size:12px; border-top:1px solid var(--border); pt-8px; margin-top:4px; padding-top:8px">
              <i class="fa-solid fa-chevron-down"></i> Ver mais detalhes
            </div>
          </div>

          <div class="cart-payment-box" id="pdv-details-form" style="display:none; margin-top:12px">
            <div class="form-row cols2">
              <div class="field"><label>Cliente</label><input id="pdv-client-name" placeholder="Cliente balcão"/></div>
              <div class="field"><label>Contacto</label><input id="pdv-client-contact" placeholder="Opcional"/></div>
            </div>
            <div class="form-row cols2">
              <div class="field"><label>Pagamento</label>
                <select id="pdv-payment-method">
                  <option value="dinheiro">Dinheiro</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="emola">E-Mola</option>
                  <option value="cartao">Cartão</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </div>
              <div class="field"><label>Estado</label>
                <select id="pdv-sale-status">
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                </select>
              </div>
            </div>
            <div class="form-row cols2" id="pdv-received-wrap">
              <div class="field"><label>Valor recebido</label><input id="pdv-received" type="number" min="0" step="0.01" placeholder="0.00"/></div>
              <div class="change-preview"><span>Troco</span><strong id="pdv-change">MT 0.00</strong></div>
            </div>
            <div style="text-align:center; margin-top:8px">
               <button type="button" class="btn btn-sm" id="btn-hide-details" style="width:100%; background:transparent; border:none; color:var(--text2)">
                 <i class="fa-solid fa-chevron-up"></i> Ocultar detalhes
               </button>
            </div>
          </div>
          <button type="button" class="btn btn-green cart-checkout-btn" id="btn-confirm-sale">
            <i class="fa-solid fa-check"></i> Confirmar Venda
          </button>
        </div>
        ${alertaStock(currentProdutos)}
      </div>
    </div>
  `;

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-btn").forEach((b) => {
        b.classList.remove("active");
        b.style.background = "var(--bg3)";
        b.style.color = "var(--text2)";
        b.style.borderColor = "var(--border)";
      });
      btn.classList.add("active");
      btn.style.background = "rgba(0,150,255,.15)";
      btn.style.color = "var(--accent2)";
      btn.style.borderColor = "rgba(0,150,255,.3)";
      renderProdGrid(btn.dataset.cat);
    });
  });

  document.getElementById("pdv-search")?.addEventListener("input", (e) => {
    currentSearch = e.target.value || "";
    renderProdGrid(getActiveCategory());
  });

  const addBarcodeProduct = () => {
    const input = document.getElementById("pdv-barcode");
    const product = findProdutoByBarcode(currentProdutos, input?.value);
    if (!product) {
      showNotification("Produto não encontrado para este código.", "warning");
      return;
    }
    window.addToCartWrapper(product.id);
    if (input) {
      input.value = "";
      input.focus();
    }
  };

  document.getElementById("btn-barcode-add")?.addEventListener("click", addBarcodeProduct);
  document.getElementById("pdv-barcode")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBarcodeProduct();
    }
  });
  document.getElementById("btn-refresh-history")?.addEventListener("click", () => refreshSellerHistory());
  document.getElementById("btn-confirm-sale")?.addEventListener("click", () => window.confirmarVendaWrapper());
  
  const summaryPreview = document.getElementById("pdv-summary-preview");
  const detailsForm = document.getElementById("pdv-details-form");
  const hideBtn = document.getElementById("btn-hide-details");

  summaryPreview?.addEventListener("click", () => {
    if (summaryPreview) summaryPreview.style.display = "none";
    if (detailsForm) detailsForm.style.display = "block";
  });

  hideBtn?.addEventListener("click", () => {
    if (summaryPreview) summaryPreview.style.display = "block";
    if (detailsForm) detailsForm.style.display = "none";
  });

  ["pdv-payment-method", "pdv-sale-status", "pdv-received", "pdv-client-name"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateCartPaymentPreview);
    document.getElementById(id)?.addEventListener("change", updateCartPaymentPreview);
  });

  renderProdGrid("Todos");
  renderCart();
  updateCartPaymentPreview();
  void refreshSellerHistory();
}

function renderProdGrid(cat) {
  const grid = document.getElementById("prod-grid");
  if (!grid) return;

  const list =
    cat === "Todos"
      ? currentProdutos.filter((p) => matchesProdutoQuery(p, currentSearch))
      : currentProdutos.filter((p) => (p.cat || p.categoria) === cat && matchesProdutoQuery(p, currentSearch));

  if (!list.length) {
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;padding:40px"><div class="es-icon"><i class="fa-solid fa-box-open"></i></div><div>Nenhum produto disponível</div></div>';
    return;
  }

  const cart = getCart();

  grid.innerHTML = list
    .map((raw) => {
      const p = normalizeProdutoPDV(raw);
      const oos = p.stock === 0;
      const low = p.stock > 0 && p.stock <= p.stockMin;
      const inCart = cart.find((c) => normalizeId(c.id) === p.id);

      return `<div class="product-card${oos ? " out-of-stock" : ""}${inCart ? " selected" : ""}" role="button" tabindex="0" data-id="${p.id}" ${oos ? 'aria-disabled="true"' : ""}>
      <div class="prod-icon">${p.image ? `<img src="${p.image}" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:6px">` : p.icon}</div>
      <div class="prod-name">${p.nome}</div>
      <div class="prod-price">${fmt(p.preco)}</div>
      <div class="prod-stock ${oos ? "stock-out" : low ? "stock-low" : "stock-ok"}">
        ${oos ? '<i class="fa-solid fa-ban"></i> Esgotado' : low ? `<i class="fa-solid fa-triangle-exclamation"></i> Baixo: ${p.stock}` : `<i class="fa-solid fa-check"></i> Stock: ${p.stock}`}
      </div>
      ${inCart ? `<div class="cart-badge">${inCart.qty}</div>` : ""}
    </div>`;
    })
    .join("");

  grid.querySelectorAll(".product-card:not(.out-of-stock)").forEach((card) => {
    const handler = () => {
      const id = Number(card.dataset.id);
      if (Number.isFinite(id)) window.addToCartWrapper(id);
    };
    card.addEventListener("click", handler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });
}

window.filterCat = function (cat, btn) {
  document.querySelectorAll(".cat-btn").forEach((b) => {
    b.classList.remove("active");
    b.style.background = "var(--bg3)";
    b.style.color = "var(--text2)";
    b.style.borderColor = "var(--border)";
  });
  if (btn) {
    btn.classList.add("active");
    btn.style.background = "rgba(0,150,255,.15)";
    btn.style.color = "var(--accent2)";
    btn.style.borderColor = "rgba(0,150,255,.3)";
  }
  renderProdGrid(cat);
};

window.addToCartWrapper = function (id) {
  const produto = currentProdutos.find(p => p.id === id);
  if (produto && produto.data_validade) {
    const statusVal = getExpirationStatus(produto.data_validade);
    if (statusVal.color === "red") {
      showNotification(`O produto <strong>${produto.nome}</strong> está VENCIDO (${produto.data_validade}) e não pode ser vendido.`, "error");
      return;
    }
    if (statusVal.color === "amber") {
      showNotification(`Atenção: O produto <strong>${produto.nome}</strong> está próximo da validade (${produto.data_validade}).`, "warning");
    }
  }

  const newCart = addToCart(id, getCart(), setCartCallback, currentProdutos);
  if (newCart) renderProdGrid(getActiveCategory());
  updateCartPaymentPreview();
};

function changeQtyHandler(id, delta) {
  const cart = getCart();
  const item = cart.find((c) => normalizeId(c.id) === normalizeId(id));
  
  if (delta < 0 && item && Number(item.qty || 0) <= 1) {
    // Substituir o prompt por um modal de confirmação de remoção com motivo
    window.showModalWrapper(`
      <div class="modal-title"><i class="fa-solid fa-trash" style="margin-right:8px"></i> Remover item do carrinho</div>
      <p class="modal-sub">Produto: <strong>${escapeHtml(item.nome)}</strong></p>
      <div class="field" style="margin-bottom:12px">
        <label>Motivo da remoção</label>
        <select id="remove-item-reason-qty">
          <option value="produto errado">Produto errado</option>
          <option value="erro de quantidade">Erro de quantidade</option>
          <option value="cliente desistiu">Cliente desistiu</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
        <button class="btn btn-red" id="confirm-modal-btn"><i class="fa-solid fa-trash"></i> Remover</button>
      </div>
    `, () => {
      const reason = document.getElementById("remove-item-reason-qty")?.value || "sem motivo";
      recordCancelReason(item, reason);
      changeQty(id, delta, cart, setCartCallback, currentProdutos);
      window.closeModal();
      renderProdGrid(getActiveCategory());
      updateCartPaymentPreview();
    });
    return;
  }
  
  changeQty(id, delta, cart, setCartCallback, currentProdutos);
  renderProdGrid(getActiveCategory());
  updateCartPaymentPreview();
}

window.changeQtyWrapper = changeQtyHandler;
window.changeQtyWrapperImpl = changeQtyHandler;

window.removeCartItemWrapper = function (id) {
  const cart = getCart();
  const item = cart.find((c) => normalizeId(c.id) === normalizeId(id));
  if (!item) return;

  window.showModalWrapper(`
    <div class="modal-title"><i class="fa-solid fa-trash" style="margin-right:8px"></i> Remover produto</div>
    <p class="modal-sub">Produto: <strong>${escapeHtml(item.nome || "Produto")}</strong></p>
    <div class="field" style="margin-bottom:12px">
      <label>Motivo</label>
      <select id="remove-item-reason">
        <option value="produto errado">Produto errado</option>
        <option value="erro de quantidade">Erro de quantidade</option>
        <option value="cliente desistiu">Cliente desistiu</option>
        <option value="outro">Outro</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>Observação</label>
      <input id="remove-item-note" placeholder="Opcional" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)"/>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Voltar</button>
      <button class="btn btn-red" id="confirm-modal-btn"><i class="fa-solid fa-trash"></i> Remover</button>
    </div>
  `, () => {
    const reason = document.getElementById("remove-item-reason")?.value || "sem motivo";
    const note = document.getElementById("remove-item-note")?.value?.trim();
    recordCancelReason(item, note ? `${reason}: ${note}` : reason);
    setCartSafe(cart.filter((c) => normalizeId(c.id) !== normalizeId(id)));
    showNotification(`${item.nome} removido.`, "success");
    window.closeModal();
    renderProdGrid(getActiveCategory());
    updateCartPaymentPreview();
  });
};

window.setItemDiscountWrapper = function (id, value) {
  setItemDiscount(id, value, getCart(), setCartCallback);
  renderProdGrid(getActiveCategory());
  updateCartPaymentPreview();
};

window.setSaleDiscountWrapper = function (value) {
  setSaleDiscount(value);
  updateCartPaymentPreview();
};

window.markPendingSalePaidWrapper = async function (id, total) {
  window.showModalWrapper(`
    <div class="modal-title"><i class="fa-solid fa-check" style="margin-right:8px"></i> Marcar como pago</div>
    <p class="modal-sub">Total pendente: <strong>${fmt(total)}</strong></p>
    <div class="form-row cols2">
      <div class="field"><label>Método</label>
        <select id="pending-pay-method">
          <option value="dinheiro">Dinheiro</option>
          <option value="mpesa">M-Pesa</option>
          <option value="emola">E-Mola</option>
          <option value="cartao">Cartão</option>
          <option value="transferencia">Transferência</option>
        </select>
      </div>
      <div class="field"><label>Valor recebido</label><input id="pending-received" type="number" min="0" step="0.01" value="${total}"/></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Voltar</button>
      <button class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check"></i> Confirmar</button>
    </div>
  `, async () => {
    const metodo = document.getElementById("pending-pay-method")?.value || "dinheiro";
    const recebido = Math.max(0, Number(document.getElementById("pending-received")?.value || 0));
    if (recebido < total) {
      showNotification("Valor recebido menor que o total pendente.", "warning");
      return;
    }
    try {
      if (window.api?.atualizarPagamentoVenda && /^\d+$/.test(String(id))) {
        await window.api.atualizarPagamentoVenda(id, {
          metodo_pagamento: metodo,
          status_pagamento: "pago",
          valor_recebido: recebido,
          troco: Math.max(0, recebido - total),
        });
      }
      markPendingPaidLocal(id);
      currentSellerSales = currentSellerSales.map((v) =>
        String(v.id) === String(id)
          ? { ...v, status_pagamento: "pago", metodo_pagamento: metodo, valor_recebido: recebido, troco: Math.max(0, recebido - total) }
          : v
      );
      window.closeModal();
      refreshPendingSales();
      refreshCashSummary();
      await refreshSellerHistory();
    } catch (err) {
      console.error(err);
      showNotification(err?.message || "Erro ao atualizar pagamento.", "error");
    }
  });
};

window.suspendCartWrapper = function () {
  const cart = getCart();
  if (!cart.length) {
    showNotification("Carrinho vazio.", "warning");
    return;
  }
  const total = cartTotals(cart, getSaleDiscount()).total;
  window.showModalWrapper(`
    <div class="modal-title"><i class="fa-solid fa-pause" style="margin-right:8px"></i> Suspender venda</div>
    <p class="modal-sub">Guarde este carrinho para atender outro cliente. O stock não será alterado.</p>
    <div class="field" style="margin-bottom:12px">
      <label>Nome do cliente</label>
      <input id="suspend-client-name" value="${escapeAttr(document.getElementById("pdv-client-name")?.value?.trim() || "Cliente balcão")}"/>
    </div>
    <div class="receipt">
      <div class="receipt-row"><span>Itens</span><span>${cart.length}</span></div>
      <div class="receipt-row"><span>Total</span><span>${fmt(total)}</span></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Voltar</button>
      <button class="btn btn-blue" id="confirm-modal-btn"><i class="fa-solid fa-pause"></i> Suspender</button>
    </div>
  `, () => {
    const cliente = document.getElementById("suspend-client-name")?.value?.trim() || "Cliente balcão";
    suspendedCarts.unshift({
      id: Date.now(),
      cliente,
      items: cart,
      descontoVenda: getSaleDiscount(),
      total,
      created_at: new Date().toISOString(),
    });
    saveSuspendedCarts();
    setCartSafe([]);
    resetSaleDiscount();
    const suspendedBox = document.getElementById("suspended-carts");
    if (suspendedBox) suspendedBox.innerHTML = renderSuspendedCarts();
    window.closeModal();
    renderProdGrid(getActiveCategory());
    updateCartPaymentPreview();
  });
  setTimeout(() => document.getElementById("suspend-client-name")?.focus(), 0);
};

window.resumeSuspendedCartWrapper = function (id) {
  const current = getCart();
  const doResume = () => {
    const sale = suspendedCarts.find((s) => Number(s.id) === Number(id));
    if (!sale) return;
    setCartSafe(sale.items || []);
    setSaleDiscount(sale.descontoVenda || 0);
    suspendedCarts = suspendedCarts.filter((s) => Number(s.id) !== Number(id));
    saveSuspendedCarts();
    const suspendedBox = document.getElementById("suspended-carts");
    if (suspendedBox) suspendedBox.innerHTML = renderSuspendedCarts();
    renderProdGrid(getActiveCategory());
    updateCartPaymentPreview();
    window.closeModal();
  };

  if (current.length) {
    showConfirmModal("O carrinho actual será substituído. Continuar?", doResume);
  } else {
    doResume();
  }
};

window.clearCartWithReasonWrapper = function () {
  const cart = getCart();
  if (!cart.length) {
    showNotification("Carrinho vazio.", "warning");
    return;
  }
  window.showModalWrapper(`
    <div class="modal-title"><i class="fa-solid fa-xmark" style="margin-right:8px"></i> Cancelar carrinho</div>
    <p class="modal-sub">Informe o motivo. Esta ação não finaliza venda e não baixa stock.</p>
    <div class="field" style="margin-bottom:12px">
      <label>Motivo</label>
      <select id="cancel-cart-reason">
        <option value="cliente desistiu">Cliente desistiu</option>
        <option value="produto errado">Produto errado</option>
        <option value="erro de quantidade">Erro de quantidade</option>
        <option value="sem pagamento">Sem pagamento</option>
        <option value="outro">Outro</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>Observação</label>
      <input id="cancel-cart-note" placeholder="Opcional"/>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Voltar</button>
      <button class="btn btn-red" id="confirm-modal-btn"><i class="fa-solid fa-xmark"></i> Cancelar carrinho</button>
    </div>
  `, () => {
    const reason = document.getElementById("cancel-cart-reason")?.value || "sem motivo";
    const note = document.getElementById("cancel-cart-note")?.value?.trim();
    const fullReason = note ? `${reason}: ${note}` : reason;
    cart.forEach((item) => recordCancelReason(item, fullReason));
    setCartSafe([]);
    resetSaleDiscount();
    window.closeModal();
    renderProdGrid(getActiveCategory());
    updateCartPaymentPreview();
  });
};

window.confirmarVendaWrapper = function () {
  const cart = getCart();
  const totals = cartTotals(cart, getSaleDiscount());
  const discountPercent = totals.subtotal > 0 ? Math.round((totals.descontoTotal / totals.subtotal) * 100) : 0;
  if (discountPercent > DISCOUNT_LIMIT_PERCENT) {
    showNotification(`Desconto bloqueado: vendedor pode aplicar até ${DISCOUNT_LIMIT_PERCENT}% sem autorização.`, "warning");
    return;
  }
  confirmarVenda(
    cart,
    setCartCallback,
    currentUser,
    currentVendas,
    setVendasCallback,
    currentProdutos,
    setProdutosCallback,
    window.closeModal,
    window.showModalWrapper
  ).then(() => refreshSellerHistory());
};

window.addEventListener("bizcontrol:sale-completed", (event) => {
  const venda = event.detail?.venda;
  if (!venda) return;
  currentVendas = [venda, ...(currentVendas || [])];
  currentSellerSales = [
    {
      ...venda,
      id: venda.id,
      usuario_id: currentUser?.id,
      criado_em: new Date().toISOString(),
    },
    ...currentSellerSales,
  ];
  refreshCashSummary();
  refreshPendingSales();
});

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select";
  if (e.key === "F2") {
    e.preventDefault();
    document.getElementById("pdv-search")?.focus();
    return;
  }
  if (e.key === "F9") {
    e.preventDefault();
    window.confirmarVendaWrapper?.();
    return;
  }
  if (typing) return;
  const cart = getCart();
  const last = cart[cart.length - 1];
  if (!last) return;
  if (e.key === "+") {
    e.preventDefault();
    changeQtyHandler(last.id, 1);
  } else if (e.key === "-") {
    e.preventDefault();
    changeQtyHandler(last.id, -1);
  }
});

export function renderProdutosV(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-box" style="margin-right:8px"></i> Produtos Disponíveis</div>
      <div class="page-sub">Lista de todos os produtos e seus stocks</div>
    </div>
    ${alertaStock(currentProdutos)}
    <div class="card" style="margin-top:16px">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Stock</th><th>Estado</th></tr></thead>
          <tbody>
            ${currentProdutos
              .map((raw) => {
                const p = normalizeProdutoPDV(raw);
                const oos = p.stock === 0;
                const low = p.stock > 0 && p.stock <= p.stockMin;
                return `<tr>
                <td><span style="font-size:18px;margin-right:8px">${p.icon}</span><strong>${p.nome}</strong></td>
                <td><span class="tag">${p.cat}</span></td>
                <td style="color:var(--accent);font-weight:600">${fmt(p.preco)}</td>
                <td style="font-weight:600">${p.stock}</td>
                <td><span class="badge ${oos ? "red" : low ? "amber" : "green"}">${oos ? "Esgotado" : low ? "Stock Baixo" : "Disponível"}</span></td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderReservar(el) {
  await refreshReservas();
  
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-clipboard" style="margin-right:8px"></i> Reservar Produtos</div>
      <div class="page-sub">Acumular material para um cliente</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Nova Reserva</div>
        <div class="form-row"><div class="field"><label>Nome do Titular</label><input id="r-nome" placeholder="Nome completo"/></div></div>
        <div class="form-row"><div class="field"><label>Número de BI</label><input id="r-bi" placeholder="ex: 12345678A"/></div></div>
        <div class="form-row cols2">
          <div class="field"><label>Produto</label>
            <select id="r-prod">${currentProdutos
              .filter((p) => p.stock > 0)
              .map((p) => `<option value="${p.id}">${p.nome} (${p.stock}un)</option>`)
              .join("")}</select>
          </div>
          <div class="field"><label>Quantidade</label><input type="number" id="r-qty" value="1" min="1"/></div>
        </div>
        <button class="btn btn-blue" onclick="window.criarReservaWrapper()"><i class="fa-solid fa-clipboard" style="margin-right:8px"></i> Criar Reserva</button>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Reservas Activas</div>
        <div id="reservas-ativas-list">
          ${currentReservas.filter((r) => r.status === "Activa")
            .map(
              (r) => `
            <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--sm-r);padding:14px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong>${escapeHtml(r.titular)}</strong><span class="badge blue">${r.status}</span>
              </div>
              <div style="font-size:12px;color:var(--text2)">BI: ${escapeHtml(r.bi || "—")} • ${String(r.criado_em).split(" ")[0]}</div>
              <div style="margin-top:8px;font-size:13px">${escapeHtml(r.produto_nome)} x${r.quantidade}</div>
              <div style="display:flex; gap: 8px; margin-top: 12px;">
                <button class="btn btn-sm btn-green" onclick="window.alterarStatusReservaWrapper(${r.id}, 'Levantada')"><i class="fa-solid fa-check" style="margin-right:6px"></i> Levantar</button>
                <button class="btn btn-sm btn-red" onclick="window.alterarStatusReservaWrapper(${r.id}, 'Cancelada')"><i class="fa-solid fa-xmark" style="margin-right:6px"></i> Cancelar</button>
              </div>
            </div>
          `
            )
            .join("") || '<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-clipboard"></i></div><div>Sem reservas activas</div></div>'}
        </div>
      </div>
    </div>
  `;
}

window.criarReservaWrapper = async function () {
  const nome = document.getElementById("r-nome").value.trim();
  const bi = document.getElementById("r-bi").value.trim();
  const pid = parseInt(document.getElementById("r-prod").value, 10);
  const qty = parseInt(document.getElementById("r-qty").value, 10);
  if (!nome || !bi) {
    showNotification("Preencha todos os campos", "warning");
    return;
  }
  
  try {
    await window.api.addReserva({
      produto_id: pid,
      quantidade: qty,
      titular: nome,
      bi: bi
    });
    
    // Atualizar produtos localmente
    if (window.api?.getProdutos) {
       const p = await window.api.getProdutos();
       if (setProdutosCallback) setProdutosCallback(p);
    }
    
    const ca = document.getElementById("content-area");
    if (ca) renderReservar(ca);
  } catch (err) {
    showNotification("Erro ao criar reserva: " + err.message, "error");
  }
};

window.alterarStatusReservaWrapper = async function (id, status) {
  const doUpdate = async () => {
    try {
      await window.api.atualizarStatusReserva(id, status);
      
      // Se cancelado, stock mudou
      if (status === 'Cancelada' && window.api?.getProdutos) {
         const p = await window.api.getProdutos();
         if (setProdutosCallback) setProdutosCallback(p);
      }
      
      const ca = document.getElementById("content-area");
      if (ca) renderReservar(ca);
      window.closeModal();
    } catch (err) {
      showNotification("Erro ao atualizar reserva: " + err.message, "error");
    }
  };

  if (status === 'Cancelada') {
    showConfirmModal("Deseja realmente cancelar esta reserva? O stock será devolvido.", doUpdate);
  } else {
    await doUpdate();
  }
};

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
