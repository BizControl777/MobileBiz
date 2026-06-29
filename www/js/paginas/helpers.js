import { fmt, round2 } from "../utils.js";
import { calcularLucro, safeNum } from "../produtos-calc.js";
import {
  buildCartItem,
  cartTotals,
  findProduto,
  normalizeId,
  normalizeProdutoPDV,
} from "../pdv-utils.js";

let STATE_CART = [];
let setCartCallback = null;
let SALE_DISCOUNT = 0;
let LAST_RECEIPT = null;

export function initCartHelpers(cart, setCart) {
  STATE_CART = Array.isArray(cart) ? cart : [];
  setCartCallback = setCart;
}

/** Mantém o espelho local do carrinho sincronizado com STATE.cart */
export function setCartState(cart) {
  STATE_CART = Array.isArray(cart) ? cart : [];
}

export function getCartState() {
  return STATE_CART;
}

export function getSaleDiscount() {
  return SALE_DISCOUNT;
}

export function setSaleDiscount(value) {
  SALE_DISCOUNT = cartTotals(STATE_CART, safeNum(value)).descontoVenda;
  renderCart();
}

export function resetSaleDiscount() {
  SALE_DISCOUNT = 0;
  renderCart();
}

function showCartFeedback(message) {
  const el = document.getElementById("cart-feedback");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(showCartFeedback._tid);
  showCartFeedback._tid = setTimeout(() => el.classList.remove("visible"), 2200);
}

export function showNotification(message, type = "info") {
  const modalOverlay = document.getElementById("modal-overlay");
  if (!modalOverlay) return;

  const colors = {
    info: "var(--accent2)",
    success: "var(--green)",
    error: "var(--red)",
    warning: "var(--amber)",
  };

  const icons = {
    info: "fa-circle-info",
    success: "fa-circle-check",
    error: "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
  };

  showModal(`
    <div style="text-align: center; padding: 10px 0;">
      <div style="font-size: 48px; color: ${colors[type]}; margin-bottom: 15px;">
        <i class="fa-solid ${icons[type]}"></i>
      </div>
      <div class="modal-title" style="margin-bottom: 10px;">${type.toUpperCase()}</div>
      <p style="font-size: 15px; color: var(--text); line-height: 1.5;">${message}</p>
      <div class="modal-footer" style="justify-content: center; margin-top: 25px;">
        <button class="btn btn-blue" onclick="window.closeModal()" style="min-width: 120px; justify-content: center;">OK</button>
      </div>
    </div>
  `);
}

export function showConfirmModal(message, onConfirm, onCancel) {
  const modalOverlay = document.getElementById("modal-overlay");
  if (!modalOverlay) return;

  showModal(`
    <div style="text-align: center; padding: 10px 0;">
      <div style="font-size: 48px; color: var(--amber); margin-bottom: 15px;">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="modal-title" style="margin-bottom: 10px;">CONFIRMAÇÃO</div>
      <p style="font-size: 15px; color: var(--text); line-height: 1.5;">${message}</p>
      <div class="modal-footer" style="justify-content: center; gap: 10px; margin-top: 25px;">
        <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2); min-width: 120px;">Cancelar</button>
        <button class="btn btn-red" id="confirm-modal-btn" style="min-width: 120px;">Confirmar</button>
      </div>
    </div>
  `, onConfirm);
}

export function showModal(html, onConfirm) {
  const modalOverlay = document.getElementById("modal-overlay");
  const modalBody = document.getElementById("modal-body");
  if (!modalOverlay || !modalBody) return;

  modalBody.innerHTML = html;
  modalOverlay.classList.remove("hidden");

  // Re-attach close event if needed or just rely on global click
  if (onConfirm) {
    const confirmBtn = modalBody.querySelector("#confirm-modal-btn");
    if (confirmBtn) confirmBtn.onclick = async () => {
       await onConfirm();
    };
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function saleMetaFromModal(total) {
  const metodo = document.getElementById("sale-payment-method")?.value || document.getElementById("pdv-payment-method")?.value || "dinheiro";
  const status = document.getElementById("sale-status")?.value || document.getElementById("pdv-sale-status")?.value || "pago";
  const clienteNome =
    document.getElementById("sale-client-name")?.value?.trim() ||
    document.getElementById("pdv-client-name")?.value?.trim() ||
    "Cliente balcão";
  const clienteContacto =
    document.getElementById("sale-client-contact")?.value?.trim() ||
    document.getElementById("pdv-client-contact")?.value?.trim() ||
    "";
  const recebido = safeNum(document.getElementById("sale-received")?.value ?? document.getElementById("pdv-received")?.value);
  const valorRecebido = status === "pago" && metodo === "dinheiro" ? recebido : 0;
  const troco = status === "pago" && metodo === "dinheiro" ? Math.max(0, valorRecebido - total) : 0;
  return {
    metodo_pagamento: metodo,
    status_pagamento: status,
    cliente_nome: clienteNome,
    cliente_contacto: clienteContacto,
    valor_recebido: valorRecebido,
    troco,
  };
}

function renderReceiptHtml(receipt) {
  const rows = receipt.items
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.nome || "Produto")}</td><td>${c.qty}</td><td>${fmt(c.preco)}</td><td>${fmt(c.total)}</td></tr>`
    )
    .join("");
  return `
    <html>
      <head>
        <title>Recibo</title>
        <style>
          body{font-family:Arial,sans-serif;color:#111;margin:18px;max-width:360px}
          h1{font-size:18px;margin:0 0 6px;text-align:center}
          .sub{font-size:11px;color:#555;text-align:center;margin-bottom:12px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border-bottom:1px solid #ddd;padding:6px 2px;text-align:left}
          th:last-child,td:last-child{text-align:right}
          .totals{margin-top:12px;font-size:12px}
          .row{display:flex;justify-content:space-between;margin:5px 0}
          .total{font-size:15px;font-weight:700}
        </style>
      </head>
      <body>
        <h1>BizControl</h1>
        <div class="sub">Recibo ${escapeHtml(receipt.id)} - ${escapeHtml(receipt.data)}</div>
        <div class="sub">Vendedor: ${escapeHtml(receipt.vendedor)}<br>Cliente: ${escapeHtml(receipt.cliente_nome)}</div>
        <table>
          <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${fmt(receipt.subtotal)}</span></div>
          <div class="row"><span>Desconto</span><span>${fmt(receipt.desconto)}</span></div>
          <div class="row total"><span>Total</span><span>${fmt(receipt.total)}</span></div>
          <div class="row"><span>Pagamento</span><span>${escapeHtml(receipt.metodo_pagamento)} / ${escapeHtml(receipt.status_pagamento)}</span></div>
          ${receipt.valor_recebido ? `<div class="row"><span>Recebido</span><span>${fmt(receipt.valor_recebido)}</span></div>` : ""}
          ${receipt.troco ? `<div class="row"><span>Troco</span><span>${fmt(receipt.troco)}</span></div>` : ""}
        </div>
      </body>
    </html>`;
}

window.printLastReceiptWrapper = function () {
  if (!LAST_RECEIPT) {
    showNotification("Nenhum recibo disponível.", "warning");
    return;
  }
  const win = window.open("", "_blank");
  if (!win) {
    showNotification("Permita pop-ups para imprimir o recibo.", "error");
    return;
  }
  win.document.write(renderReceiptHtml(LAST_RECEIPT));
  win.document.close();
  win.focus();
  win.print();
};

window.updatePaymentFieldsWrapper = function () {
  const total = safeNum(document.getElementById("sale-total-value")?.value);
  const metodo = document.getElementById("sale-payment-method")?.value || "dinheiro";
  const status = document.getElementById("sale-status")?.value || "pago";
  const receivedWrap = document.getElementById("sale-received-wrap");
  const creditHint = document.getElementById("sale-credit-hint");
  const received = document.getElementById("sale-received");
  const change = document.getElementById("sale-change");
  const showCash = metodo === "dinheiro" && status === "pago";
  if (receivedWrap) receivedWrap.style.display = showCash ? "block" : "none";
  if (creditHint) creditHint.style.display = status === "pendente" ? "block" : "none";
  if (change) change.textContent = fmt(Math.max(0, safeNum(received?.value) - total));
};

export function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

/**
 * Modal completo para editar stock e preços de um produto.
 */
export function openEditStockModal(produto, user, onSuccess) {
  if (!produto) return;

  const qtdCx = Math.max(1, produto.qtd_por_caixa || 1);
  const precoCompraCx = produto.preco_compra_caixa ?? (produto.preco_custo || 0) * qtdCx;
  const precoVendaCx = produto.preco_venda_caixa ?? (produto.preco || 0) * qtdCx;

  const updateModalLucro = () => {
    const lucro = calcularLucro({
      precoCompraCaixa: safeNum(document.getElementById("es-preco-caixa")?.value),
      qtdPorCaixa: safeNum(document.getElementById("es-qtd-caixa")?.value, 1),
      precoVendaUnidade: safeNum(document.getElementById("es-preco-unidade")?.value),
      precoVendaCaixa: safeNum(document.getElementById("es-preco-venda-caixa")?.value),
    });
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt(v);
    };
    set("es-lucro-custo", lucro.custoPorUnidade);
    set("es-lucro-unit", lucro.lucroPorUnidade);
    set("es-lucro-caixa", lucro.lucroPorCaixa);
    const m = document.getElementById("es-lucro-margem");
    if (m) m.textContent = `${lucro.margemPercent}%`;
  };

  showModal(
    `
    
    <div class="modal-title"><i class="fa-solid fa-pen-to-square"></i> Editar Stock — ${produto.nome}</div>
    <p class="modal-sub">Stock actual: <strong>${produto.stock}</strong> unidades</p>

    <div class="stock-modal-tabs">
      <button type="button" class="stock-tab active" data-tab="definir">Definir quantidade</button>
      <button type="button" class="stock-tab" data-tab="adicionar">Adicionar</button>
      <button type="button" class="stock-tab" data-tab="reduzir">Reduzir</button>
    </div>

    <input type="hidden" id="es-modo" value="definir"/>

    <div class="form-row cols2" style="margin-top:14px">
      <div class="field"><label id="es-qty-label">Nova quantidade em stock</label>
        <input type="number" id="es-quantidade" min="0" value="${produto.stock}"/>
      </div>
      <div class="field"><label>Stock mínimo</label>
        <input type="number" id="es-stockmin" min="0" value="${produto.stockMin ?? 10}"/>
      </div>
    </div>

    <div class="form-section" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <h4 class="form-section-title" style="font-size:14px;margin-bottom:12px"><i class="fa-solid fa-coins"></i> Preços (opcional)</h4>
      <div class="form-row cols2">
        <div class="field"><label>Preço compra caixa (MT)</label>
          <input type="number" id="es-preco-caixa" min="0" step="0.01" value="${precoCompraCx}"/>
        </div>
        <div class="field"><label>Qtd. por caixa</label>
          <input type="number" id="es-qtd-caixa" min="1" value="${qtdCx}"/>
        </div>
      </div>
      <div class="form-row cols2">
        <div class="field"><label>Preço venda unidade (MT)</label>
          <input type="number" id="es-preco-unidade" min="0" step="0.01" value="${produto.preco || 0}"/>
        </div>
        <div class="field"><label>Preço venda caixa (MT)</label>
          <input type="number" id="es-preco-venda-caixa" min="0" step="0.01" value="${precoVendaCx}"/>
        </div>
      </div>
      <div class="lucro-grid lucro-grid-compact">
        <div class="lucro-item"><span class="lucro-label">Custo/un.</span><span class="lucro-value" id="es-lucro-custo">—</span></div>
        <div class="lucro-item"><span class="lucro-label">Lucro/un.</span><span class="lucro-value lucro-positive" id="es-lucro-unit">—</span></div>
        <div class="lucro-item"><span class="lucro-label">Lucro/caixa</span><span class="lucro-value lucro-positive" id="es-lucro-caixa">—</span></div>
        <div class="lucro-item"><span class="lucro-label">Margem</span><span class="lucro-value" id="es-lucro-margem">—</span></div>
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button type="button" class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check"></i> Guardar</button>
    </div>
  `,
    null
  );

  const modalBody = document.getElementById("modal-body");
  modalBody?.querySelectorAll(".stock-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalBody.querySelectorAll(".stock-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const modo = btn.dataset.tab;
      document.getElementById("es-modo").value = modo;
      const label = document.getElementById("es-qty-label");
      const input = document.getElementById("es-quantidade");
      if (modo === "definir") {
        label.textContent = "Nova quantidade em stock";
        input.value = produto.stock;
        input.min = "0";
      } else if (modo === "adicionar") {
        label.textContent = "Quantidade a adicionar";
        input.value = "";
        input.min = "1";
        input.placeholder = "Ex: 50";
      } else {
        label.textContent = "Quantidade a reduzir";
        input.value = "";
        input.min = "1";
        input.placeholder = "Ex: 10";
      }
    });
  });

  ["es-preco-caixa", "es-qtd-caixa", "es-preco-unidade", "es-preco-venda-caixa"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateModalLucro);
  });
  updateModalLucro();

  const confirmBtn = document.getElementById("confirm-modal-btn");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      if (!user?.id) {
        showNotification("Utilizador não autenticado.", "error");
        return;
      }

      const modo = document.getElementById("es-modo")?.value || "definir";
      const qty = safeNum(document.getElementById("es-quantidade")?.value);
      const stockMin = safeNum(document.getElementById("es-stockmin")?.value, 10);
      const preco_compra_caixa = safeNum(document.getElementById("es-preco-caixa")?.value);
      const qtd_por_caixa = Math.max(1, safeNum(document.getElementById("es-qtd-caixa")?.value, 1));
      const preco_venda = safeNum(document.getElementById("es-preco-unidade")?.value);
      const preco_venda_caixa = safeNum(document.getElementById("es-preco-venda-caixa")?.value);
      const preco_custo = round2(preco_compra_caixa / qtd_por_caixa);

      try {
        if (modo === "definir") {
          if (qty < 0) {
            showNotification("Stock inválido.", "info");
            return;
          }
          await window.api.atualizarProduto(produto.id, {
            stock: qty,
            stock_minimo: stockMin,
            preco_venda,
            preco_custo,
            qtd_por_caixa,
            preco_compra_caixa,
            preco_venda_caixa: preco_venda_caixa || preco_venda * qtd_por_caixa,
          });
        } else {
          if (qty <= 0) {
            showNotification("Informe uma quantidade válida.", "info");
            return;
          }
          const tipo = modo === "adicionar" ? "entrada" : "saida";
          await window.api.addMovimento({
            produto_id: produto.id,
            quantidade: qty,
            tipo,
            descricao: `Stock ${tipo} via modal`,
          });
          await window.api.atualizarProduto(produto.id, {
            stock_minimo: stockMin,
            preco_venda,
            preco_custo,
            qtd_por_caixa,
            preco_compra_caixa,
            preco_venda_caixa: preco_venda_caixa || preco_venda * qtd_por_caixa,
          });
        }
        closeModal();
        if (onSuccess) await onSuccess();
      } catch (err) {
        console.error(err);
        showNotification(err?.message || "Erro ao actualizar stock.", "error");
      }
    };
  }
}

export function alertaStock(produtos = []) {
  const low = produtos.filter((p) => p.stock > 0 && p.stock <= p.stockMin);
  const oos = produtos.filter((p) => p.stock === 0);
  if (!low.length && !oos.length) return "";
  return `<div class="stock-alerts-container" style="margin-top:16px; display: flex; flex-direction: column; gap: 8px;">
    ${oos.map((p) => `<div class="alert-card alert-red" style="display:flex; align-items:center; padding: 12px 16px; border-radius: 8px; border-left: 4px solid var(--red); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <i class='fa-solid fa-ban' style='margin-right:12px; font-size: 1.2em;'></i> 
      <div style="flex:1"><strong>${p.nome}</strong> — Esgotado!</div>
    </div>`).join("")}
    ${low.map((p) => `<div class="alert-card alert-amber" style="display:flex; align-items:center; padding: 12px 16px; border-radius: 8px; border-left: 4px solid var(--amber); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <i class='fa-solid fa-triangle-exclamation' style='margin-right:12px; font-size: 1.2em;'></i> 
      <div style="flex:1"><strong>${p.nome}</strong> — Stock baixo (${p.stock} un.)</div>
    </div>`).join("")}
  </div>`;
}

export function renderCart() {
  const ci = document.getElementById("cart-items");
  const ct = document.getElementById("cart-total");
  const cs = document.getElementById("cart-subtotal");
  const cq = document.getElementById("cart-qty-total");
  if (!ci) return;

  const totals = cartTotals(STATE_CART, SALE_DISCOUNT);
  SALE_DISCOUNT = totals.descontoVenda;
  const { subtotal, qtyTotal, total, descontoItens, descontoVenda, lucro, margemPercent, linhas } = totals;

  if (!STATE_CART.length) {
    ci.innerHTML = '<div class="empty-state" style="padding:20px"><div class="es-icon"><i class="fa-solid fa-cart-shopping"></i></div><div>Nenhum item</div></div>';
    if (ct) ct.innerHTML = "<span>Total</span><span>MT 0.00</span>";
    if (cs) cs.innerHTML = "<span>Subtotal</span><span>MT 0.00</span>";
    if (cq) cq.textContent = "0 itens";
    SALE_DISCOUNT = 0;
    return;
  }

  ci.innerHTML = linhas.map((c) => {
    const isPrejuizo = Number(c.preco) < Number(c.custo);
    return `
    <div class="cart-item ${isPrejuizo ? "prejuizo-row" : ""}">
      <div class="cart-item-main">
        <div>
          <span style="font-size:18px">${c.icon || "<i class='fa-solid fa-box'></i>"}</span> 
          <span style="font-size:13px;font-weight:500">${c.nome || "Produto"}</span>
          ${isPrejuizo ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--red); margin-left:5px" title="Preço abaixo do custo"></i>` : ""}
        </div>
        <div class="cart-item-sub">${fmt(c.preco)} x ${c.qty} <small>${c.unidade_medida || ""}</small></div>
        <label class="cart-discount-field">
          <span>Desc.</span>
          <input type="number" min="0" step="0.01" value="${c.desconto || ""}" onchange="window.setItemDiscountWrapper(${c.id}, this.value)" />
        </label>
      </div>
      <div class="cart-item-side">
        <div class="qty-ctrl">
          <button type="button" class="qty-btn" onclick="window.changeQtyWrapper(${c.id},-1)">-</button>
          <span class="qty-value">${c.qty}</span>
          <button type="button" class="qty-btn" onclick="window.changeQtyWrapper(${c.id},1)">+</button>
        </div>
        <button type="button" class="qty-btn cart-remove-btn" title="Remover produto" onclick="window.removeCartItemWrapper(${c.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
        <span style="color:${isPrejuizo ? "var(--red)" : "var(--accent)"};font-weight:600;min-width:70px;text-align:right">${fmt(c.total)}</span>
      </div>
    </div>
  `}).join("");

  const marginClass = lucro < 0 ? "stock-out" : "stock-ok";
  const discountRate = subtotal > 0 ? Math.round(((descontoItens + descontoVenda) / subtotal) * 100) : 0;
  const stockWarnings = STATE_CART.filter((c) => Number(c.stockMax || 0) > 0 && Number(c.stockMax || 0) <= 3);
  const alerts = [
    lucro < 0 ? "Venda com PREJUÍZO (preço total menor que custo)." : "",
    lucro >= 0 && margemPercent < 5 ? "Margem muito baixa nesta venda." : "",
    discountRate >= 20 ? `Desconto alto: ${discountRate}% do subtotal.` : "",
    stockWarnings.length ? `${stockWarnings.length} item(ns) com stock quase no fim.` : "",
  ].filter(Boolean);
  if (cs) {
    cs.innerHTML = `
      <span>Subtotal</span><span>${fmt(subtotal)}</span>
      ${descontoItens > 0 ? `<span>Desconto itens</span><span>-${fmt(descontoItens)}</span>` : ""}
      <label class="sale-discount-field"><span>Desconto venda</span><input type="number" min="0" step="0.01" value="${SALE_DISCOUNT || ""}" onchange="window.setSaleDiscountWrapper(this.value)" /></label>
      ${descontoVenda > 0 ? `<span>Desconto aplicado</span><span>-${fmt(descontoVenda)}</span>` : ""}
      <span>Margem</span><span class="${marginClass}">${fmt(lucro)} (${margemPercent}%)</span>
      ${alerts.length ? `<div class="cart-alerts">${alerts.map((a) => `<div><i class="fa-solid fa-triangle-exclamation"></i> ${a}</div>`).join("")}</div>` : ""}
    `;
  }
  if (cq) cq.textContent = `${qtyTotal} ${qtyTotal === 1 ? "item" : "itens"}`;
  if (ct) ct.innerHTML = `<span>Total</span><span>${fmt(total)}</span>`;
}

export function addToCart(id, cart, setCart, produtos) {
  const pid = normalizeId(id);
  const list = Array.isArray(cart) ? cart : [];

  const p = findProduto(produtos, pid);
  if (!p) {
    showNotification("Produto não encontrado.", "info");
    return list;
  }

  const prod = normalizeProdutoPDV(p);
  if (prod.stock <= 0) {
    showNotification(`${prod.nome} está esgotado.`, "info");
    return list;
  }

  const isGranel = ["Litro", "Grama", "Kilograma", "Metro"].includes(prod.tipo_produto);

  const performAdd = (qtyToAdd) => {
    const ex = list.find((x) => normalizeId(x.id) === pid);
    let newCart;

    if (ex) {
      const newQty = ex.qty + qtyToAdd;
      if (newQty > prod.stock) {
        showNotification(`Stock máximo disponível: ${prod.stock} ${prod.unidade_medida || "un"}.`, "info");
        return;
      }
      newCart = list.map((x) => {
        if (normalizeId(x.id) !== pid) return x;
        const maxDiscount = (Number(x.preco) || 0) * newQty;
        return { ...x, qty: newQty, stockMax: prod.stock, desconto: Math.min(Number(x.desconto) || 0, maxDiscount) };
      });
      showCartFeedback(`${prod.nome} — ${newQty} ${prod.unidade_medida || "un"}.`);
    } else {
      if (qtyToAdd > prod.stock) {
        showNotification(`Stock máximo disponível: ${prod.stock} ${prod.unidade_medida || "un"}.`, "info");
        return;
      }
      const newItem = buildCartItem(prod);
      newItem.qty = qtyToAdd;
      newCart = [...list, newItem];
      showCartFeedback(`${prod.nome} adicionado`);
    }

    if (setCart) setCart(newCart);
    renderCart();
  };

  if (isGranel) {
    showModal(`
      <div class="modal-title"><i class="fa-solid fa-scale-balanced" style="margin-right:8px"></i> Venda por Medida</div>
      <p class="modal-sub">Produto: <strong>${prod.nome}</strong></p>
      <div class="field" style="margin-bottom:12px">
        <label>Informe a quantidade em ${prod.unidade_medida || "unidades"}</label>
        <input type="number" id="granel-qty" step="any" min="0.001" placeholder="Ex: 0.5" autofocus style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:12px;color:var(--text);font-size:18px"/>
      </div>
      <div style="font-size:13px;color:var(--text2)">Disponível: <strong>${prod.stock} ${prod.unidade_medida}</strong></div>
      <div class="modal-footer">
        <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
        <button class="btn btn-blue" id="confirm-modal-btn"><i class="fa-solid fa-plus"></i> Adicionar ao Carrinho</button>
      </div>
    `, () => {
      const qty = safeNum(document.getElementById("granel-qty")?.value);
      if (qty <= 0) {
        showNotification("Informe uma quantidade válida.", "warning");
        return;
      }
      performAdd(qty);
      closeModal();
    });
    setTimeout(() => document.getElementById("granel-qty")?.focus(), 100);
    return list;
  } else {
    performAdd(1);
    return list;
  }
}

export function changeQty(id, delta, cart, setCart, produtos) {
  const pid = normalizeId(id);
  const list = Array.isArray(cart) ? cart : [];
  const ex = list.find((x) => normalizeId(x.id) === pid);
  if (!ex) return list;

  const p = findProduto(produtos, pid);
  const prod = p ? normalizeProdutoPDV(p) : null;
  const stockMax = prod ? prod.stock : ex.stockMax || 9999;

  let newQty = (Number(ex.qty) || 0) + delta;
  newQty = Math.max(0, Math.min(newQty, stockMax));

  let newCart;
  if (newQty === 0) {
    newCart = list.filter((x) => normalizeId(x.id) !== pid);
  } else {
    newCart = list.map((x) => {
      if (normalizeId(x.id) !== pid) return x;
      const maxDiscount = (Number(x.preco) || 0) * newQty;
      return { ...x, qty: newQty, stockMax, desconto: Math.min(Number(x.desconto) || 0, maxDiscount) };
    });
  }

  if (setCart) setCart(newCart);
  renderCart();
  return newCart;
}

export function setItemDiscount(id, value, cart, setCart) {
  const pid = normalizeId(id);
  const list = Array.isArray(cart) ? cart : [];
  const newCart = list.map((x) => {
    if (normalizeId(x.id) !== pid) return x;
    const maxDiscount = (Number(x.preco) || 0) * (Number(x.qty) || 0);
    return { ...x, desconto: Math.min(Math.max(0, safeNum(value)), maxDiscount) };
  });
  if (setCart) setCart(newCart);
  return newCart;
}

export async function confirmarVenda(cart, setCart, user, vendas, setVendas, produtos, setProdutos, closeModal, showModal) {
  const items = Array.isArray(cart) ? cart : getCartState();
  if (!items.length) {
    showNotification("Carrinho vazio!", "warning");
    return;
  }
  if (!user?.id) {
    showNotification("Utilizador não autenticado.", "error");
    return;
  }

  // Verificar se o caixa está aberto (OBRIGATÓRIO)
  if (!STATE.caixa || STATE.caixa.status !== "aberto") {
    showNotification("O caixa deve estar aberto para realizar vendas. Por favor, aceda ao menu 'Caixa'.", "warning");
    if (typeof window.navigateTo === "function") window.navigateTo("caixa");
    return;
  }

  for (const c of items) {
    const p = findProduto(produtos, c.id);
    if (!p) {
      showNotification(`Produto inválido no carrinho (ID ${c.id}).`, "error");
      return;
    }
    const prod = normalizeProdutoPDV(p);
    if (c.qty > prod.stock) {
      showNotification(`${prod.nome}: stock insuficiente (disponível: ${prod.stock}).`, "error");
      return;
    }
  }

  const totals = cartTotals(items, SALE_DISCOUNT);
  const { total, lucro, subtotal, descontoTotal, custoTotal } = totals;
  const defaultMetodo = document.getElementById("pdv-payment-method")?.value || "dinheiro";
  const defaultStatus = document.getElementById("pdv-sale-status")?.value || "pago";
  const defaultCliente = document.getElementById("pdv-client-name")?.value?.trim() || "";
  const defaultContacto = document.getElementById("pdv-client-contact")?.value?.trim() || "";
  const defaultRecebido = safeNum(document.getElementById("pdv-received")?.value, total) || total;
  if (total <= 0) {
    showNotification("Total da venda deve ser maior que zero.", "error");
    return;
  }
  if (lucro < 0) {
    showNotification(`Venda bloqueada: o desconto deixa a margem negativa.\n\nCusto: ${fmt(custoTotal)}\nTotal após descontos: ${fmt(total)}`, "error");
    return;
  }

  const finalizar = async () => {
    try {
      const meta = saleMetaFromModal(total);
      if (meta.status_pagamento === "pendente" && meta.cliente_nome === "Cliente balcão") {
        showNotification("Informe o nome do cliente para venda pendente/crédito.", "warning");
        return;
      }
      if (meta.status_pagamento === "pago" && meta.metodo_pagamento === "dinheiro" && meta.valor_recebido < total) {
        showNotification("Valor recebido é menor que o total da venda.", "error");
        return;
      }

      const lineSubtotalAfterItemDiscount = totals.linhas.reduce((s, c) => s + c.total, 0) || 1;
      const itens = totals.linhas.map((c) => {
        const vendaDiscountShare = totals.descontoVenda > 0 ? (c.total / lineSubtotalAfterItemDiscount) * totals.descontoVenda : 0;
        const lineTotal = Math.max(0, c.total - vendaDiscountShare);
        const qty = Number(c.qty) || 0;
        return {
          produto_id: normalizeId(c.id),
          quantidade: qty,
          preco_unitario: qty > 0 ? lineTotal / qty : 0,
          desconto: (Number(c.desconto) || 0) + vendaDiscountShare,
          total: lineTotal,
        };
      });

      if (!window.api?.registarVenda) {
        throw new Error("API de vendas indisponível. Inicie a app com npm start.");
      }
      const result = await window.api.registarVenda({ itens, total, ...meta, caixa_id: STATE.caixa.id });

      const produtosAtualizados = await window.api.getProdutos();
      if (typeof setProdutos === "function") {
        setProdutos(produtosAtualizados);
      }
      const venda = {
        id: Date.now(),
        data: new Date().toISOString().split("T")[0],
        vendedor: user.nome || "Vendedor",
        produtos: items.map((c) => ({ nome: c.nome || "Produto", qty: c.qty, preco: c.preco })),
        total,
        lucro,
        ...meta,
      };
      if (typeof setVendas === "function") {
        setVendas([venda, ...(vendas || [])]);
      }
      if (typeof setCart === "function") {
        setCart([]);
      }
      SALE_DISCOUNT = 0;
      LAST_RECEIPT = {
        id: result?.id || venda.id,
        data: new Date().toLocaleString("pt-PT"),
        vendedor: user.nome || "Vendedor",
        items: totals.linhas.map((c) => ({ nome: c.nome, qty: c.qty, preco: c.preco, total: c.total })),
        subtotal,
        desconto: descontoTotal,
        total,
        ...meta,
      };
      window.dispatchEvent(new CustomEvent("bizcontrol:sale-completed", { detail: { venda, recibo: LAST_RECEIPT } }));
      if (typeof closeModal === "function") {
        closeModal();
      }
      showModal(`
        <div class="modal-title"><i class="fa-solid fa-circle-check" style="margin-right:8px"></i> Venda Registada!</div>
        <div class="alert-card alert-green" style="margin-bottom:16px"><i class='fa-solid fa-check' style='margin-right:8px'></i> Venda de ${fmt(total)} registada com sucesso!</div>
        <div style="font-size:13px;color:var(--text2)">Lucro desta venda: <strong style="color:var(--accent)">${fmt(lucro)}</strong></div>
        ${meta.troco ? `<div style="font-size:13px;color:var(--text2);margin-top:8px">Troco: <strong style="color:var(--green)">${fmt(meta.troco)}</strong></div>` : ""}
        <div class="modal-footer">
          <button class="btn btn-blue" onclick="window.printLastReceiptWrapper()"><i class="fa-solid fa-print"></i> Imprimir recibo</button>
          <button class="btn btn-green" onclick="window.closeModal()">Continuar</button>
        </div>
      `, null);
    } catch (error) {
      console.error("Erro ao registar venda:", error);
      showNotification(error?.message || "Falha ao registar venda.", "error");
    }
  };

  showModal(`
    <div class="modal-title"><i class="fa-solid fa-check" style="margin-right:8px"></i> Confirmar Venda</div>
    <div class="receipt">
      ${totals.linhas.map((c) => `<div class="receipt-row"><span>${c.icon} ${c.nome || "Produto"} x${c.qty}</span><span>${fmt(c.total)}</span></div>`).join("")}
      ${descontoTotal > 0 ? `<div class="receipt-row"><span>Descontos</span><span>-${fmt(descontoTotal)}</span></div>` : ""}
      <div class="receipt-row"><span>SUBTOTAL</span><span>${fmt(subtotal)}</span></div>
      <div class="receipt-row"><span>TOTAL</span><span>${fmt(total)}</span></div>
      <div class="receipt-row"><span>MARGEM</span><span>${fmt(lucro)}</span></div>
    </div>
    <input type="hidden" id="sale-total-value" value="${total}"/>
    <div class="form-row cols2" style="margin-top:14px">
      <div class="field"><label>Cliente</label><input id="sale-client-name" placeholder="Cliente balcão" value="${escapeHtml(defaultCliente)}"/></div>
      <div class="field"><label>Contacto</label><input id="sale-client-contact" placeholder="Opcional" value="${escapeHtml(defaultContacto)}"/></div>
    </div>
    <div class="form-row cols2">
      <div class="field"><label>Método de pagamento</label>
        <select id="sale-payment-method" onchange="window.updatePaymentFieldsWrapper()">
          <option value="dinheiro" ${defaultMetodo === "dinheiro" ? "selected" : ""}>Dinheiro</option>
          <option value="mpesa" ${defaultMetodo === "mpesa" ? "selected" : ""}>M-Pesa</option>
          <option value="emola" ${defaultMetodo === "emola" ? "selected" : ""}>E-Mola</option>
          <option value="cartao" ${defaultMetodo === "cartao" ? "selected" : ""}>Cartão</option>
          <option value="transferencia" ${defaultMetodo === "transferencia" ? "selected" : ""}>Transferência</option>
        </select>
      </div>
      <div class="field"><label>Estado</label>
        <select id="sale-status" onchange="window.updatePaymentFieldsWrapper()">
          <option value="pago" ${defaultStatus === "pago" ? "selected" : ""}>Pago</option>
          <option value="pendente" ${defaultStatus === "pendente" ? "selected" : ""}>Pendente / crédito</option>
        </select>
      </div>
    </div>
    <div class="form-row cols2" id="sale-received-wrap">
      <div class="field"><label>Valor recebido</label><input id="sale-received" type="number" min="0" step="0.01" value="${defaultRecebido}" oninput="window.updatePaymentFieldsWrapper()"/></div>
      <div class="lucro-item"><span class="lucro-label">Troco</span><span class="lucro-value lucro-positive" id="sale-change">MT 0.00</span></div>
    </div>
    <div class="alert-card alert-amber" id="sale-credit-hint" style="display:none;margin-top:10px">
      <i class="fa-solid fa-circle-info"></i> Venda pendente exige nome do cliente para controlo da dívida.
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check" style="margin-right:8px"></i> Finalizar</button>
    </div>
  `, finalizar);
  window.updatePaymentFieldsWrapper();
}

export function reporStock(id, produtos, setProdutos, showModal, closeModal) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;

  const confirmarRestock = async () => {
    const qty = parseInt(document.getElementById("restock-qty").value) || 0;
    if (qty > 0) {
      try {
        await window.api.addMovimento({
          produto_id: id,
          quantidade: qty,
          tipo: "entrada",
          usuario_id: window.STATE?.user?.id || null,
          observacao: "Reposição de stock",
          status_pagamento: "pago",
        });
        const produtosAtualizados = await window.api.getProdutos();
        setProdutos(produtosAtualizados);
      } catch (error) {
        console.error("Erro ao repor stock:", error);
        showNotification(error?.message || "Falha ao repor stock.", "error");
      }
    }
    closeModal();
  };

  showModal(`
    <div class="modal-title"><i class='fa-solid fa-box' style='margin-right:8px'></i> Repor Stock — ${p.nome}</div>
    <div class="field" style="margin-bottom:16px"><label>Quantidade a adicionar</label><input type="number" id="restock-qty" value="50" min="1" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)"/></div>
    <div style="font-size:13px;color:var(--text2)">Stock actual: <strong>${p.stock}</strong></div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check" style="margin-right:6px"></i> Repor</button>
    </div>
  `, confirmarRestock);
}

