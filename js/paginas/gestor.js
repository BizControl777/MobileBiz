import { fmt, getRandomHour } from "../utils.js";
import { applyTheme } from "../theme.js";
import { t, setLanguage, getLanguage } from "../i18n.js";
import { CATEGORIAS, RESERVAS } from "../data.js";
import { UNIDADES_MEDIDA, TIPOS_PRODUTO, getTipoByUnidade, calcularLucro, safeNum, getExpirationBadge, getExpirationStatus } from "../produtos-calc.js";
import { openEditStockModal, showModal, closeModal, showNotification, showConfirmModal } from "./helpers.js";

// Tornar as funções de stock disponíveis globalmente logo no início
window.reporStockDirectWrapper = async function (id) {
  if (!currentUser) return showNotification("Utilizador não autenticado.", "error");
  const temPermissao =
    currentUser.role === "gestor" ||
    currentUser.role === "super" ||
    (Array.isArray(currentUser.permissoes) && currentUser.permissoes.includes("editar_stock"));

  if (!temPermissao) {
    showNotification("Sem permissão para alterar o stock.", "error");
    return;
  }

  const produto = currentProdutos.find((p) => p.id === id);
  if (!produto) return;

  showModal(`
    <div class="modal-title"><i class="fa-solid fa-plus-circle" style="margin-right:8px"></i> Repor Stock — ${escapeHtml(produto.nome)}</div>
    <div class="field" style="margin-bottom:16px">
      <label>Quantidade a ADICIONAR</label>
      <input type="number" id="input-qty" value="50" min="1" autofocus style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:12px;color:var(--text);font-size:16px"/>
    </div>
    <div style="font-size:13px;color:var(--text2)">Stock actual: <strong>${produto.stock}</strong></div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check" style="margin-right:6px"></i> Confirmar Reposição</button>
    </div>
  `, async () => {
    const qtyInput = document.getElementById("input-qty");
    const n = parseInt(qtyInput?.value, 10);

    if (isNaN(n) || n <= 0) {
      showNotification("Por favor, informe uma quantidade válida superior a zero.", "warning");
      return;
    }

    try {
      await window.api.addMovimento({
        produto_id: id,
        quantidade: n,
        tipo: "entrada",
        descricao: "Reposição directa via tabela de stock",
      });
      await refreshProdutos();
      closeModal();
      reRenderActiveGestorPage();
    } catch (err) {
      console.error(err);
      showNotification("Erro ao repor stock: " + (err.message || "Erro desconhecido"), "error");
    }
  });
};

window.removerStockDirectWrapper = async function (id) {
  if (!currentUser) return showNotification("Utilizador não autenticado.", "error");
  const temPermissao =
    currentUser.role === "gestor" ||
    currentUser.role === "super" ||
    (Array.isArray(currentUser.permissoes) && currentUser.permissoes.includes("editar_stock"));

  if (!temPermissao) {
    showNotification("Sem permissão para alterar o stock.", "error");
    return;
  }

  const produto = currentProdutos.find((p) => p.id === id);
  if (!produto) return;

  showModal(`
    <div class="modal-title"><i class="fa-solid fa-minus-circle" style="margin-right:8px"></i> Remover Stock — ${escapeHtml(produto.nome)}</div>
    <div class="field" style="margin-bottom:16px">
      <label>Quantidade a REMOVER</label>
      <input type="number" id="input-qty" value="10" min="1" autofocus style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:12px;color:var(--text);font-size:16px"/>
    </div>
    <div style="font-size:13px;color:var(--text2)">Stock actual: <strong>${produto.stock}</strong></div>
    <div id="stock-warning" class="alert-card alert-amber" style="display:none;margin-top:12px">
      <i class="fa-solid fa-triangle-exclamation"></i> Atenção: O stock ficará negativo.
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-red" id="confirm-modal-btn"><i class="fa-solid fa-check" style="margin-right:6px"></i> Confirmar Remoção</button>
    </div>
  `, async () => {
    const qtyInput = document.getElementById("input-qty");
    const n = parseInt(qtyInput?.value, 10);

    if (isNaN(n) || n <= 0) {
      showNotification("Por favor, informe uma quantidade válida superior a zero.", "warning");
      return;
    }

    if (n > produto.stock) {
      showConfirmModal(
        `Atenção: A quantidade a remover (${n}) é superior ao stock actual (${produto.stock}).\n\nO stock ficará negativo. Deseja continuar?`,
        async () => {
          try {
            await window.api.addMovimento({
              produto_id: id,
              quantidade: n,
              tipo: "saida",
              descricao: "Remoção directa via tabela de stock (Negativo)",
            });
            await refreshProdutos();
            closeModal();
            reRenderActiveGestorPage();
          } catch (err) {
            console.error(err);
            showNotification("Erro ao remover stock: " + (err.message || "Erro desconhecido"), "error");
          }
        }
      );
      return;
    }

    try {
      await window.api.addMovimento({
        produto_id: id,
        quantidade: n,
        tipo: "saida",
        descricao: "Remoção directa via tabela de stock",
      });
      await refreshProdutos();
      closeModal();
      reRenderActiveGestorPage();
    } catch (err) {
      console.error(err);
      showNotification("Erro ao remover stock: " + (err.message || "Erro desconhecido"), "error");
    }
  });

  // Listener para aviso de stock negativo em tempo real
  const input = document.getElementById("input-qty");
  const warning = document.getElementById("stock-warning");
  input?.addEventListener("input", () => {
    const val = parseInt(input.value, 10);
    if (warning) warning.style.display = val > produto.stock ? "flex" : "none";
  });
};

let currentProdutos = [];
let setProdutosCallback = null;
let currentVendas = [];
let setVendasCallback = null;
let currentUser = null;
let currentCategorias = [...CATEGORIAS];
let currentUsuarios = [];
let currentReservas = [];
let editingProdutoId = null;

const vendasExemplo = [
  { vendedor: "Ana Machado", data: "2025-04-02", hora: "09:15", total: 1250.5, lucro: 312.62 },
  { vendedor: "Pedro Silva", data: "2025-04-03", hora: "10:40", total: 980.0, lucro: 196.0 },
  { vendedor: "Rita Sousa", data: "2025-04-04", hora: "14:25", total: 1540.75, lucro: 308.15 },
  { vendedor: "João Almeida", data: "2025-04-05", hora: "11:05", total: 670.0, lucro: 134.0 },
  { vendedor: "Carla Fernandes", data: "2025-04-06", hora: "16:50", total: 2130.2, lucro: 426.04 },
];

function parseSaleDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(text);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    const [day, month, year] = text.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }
  const normalized = text.replace(/ /g, "T");
  const parsed = new Date(normalized);
  return isNaN(parsed) ? null : parsed;
}

function formatDateBR(value) {
  const date = parseSaleDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

function formatTime(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  const date = parseSaleDate(text);
  return date ? date.toTimeString().slice(0, 5) : "";
}

function normalizeHistoricoRow(venda) {
  const dataRaw = venda.data || venda.criado_em?.split("T")[0] || venda.created_at?.split("T")[0] || "";
  const horaRaw = venda.hora || formatTime(venda.criado_em || venda.created_at || venda.hora || "");
  const total = Number(venda.total || venda.valor || 0);
  let lucro = Number(venda.lucro ?? 0);
  if (!lucro && total) {
    lucro = Number((total * (0.1 + Math.random() * 0.3)).toFixed(2));
  }
  return {
    vendedor: venda.vendedor || venda.usuario_nome || venda.nome || "Desconhecido",
    data: dataRaw,
    hora: horaRaw || "00:00",
    total,
    lucro,
  };
}

function getHistoricoRows() {
  const source = Array.isArray(currentVendas) && currentVendas.length ? currentVendas : vendasExemplo;
  return source.map(normalizeHistoricoRow);
}

function getSortValue(row, key) {
  if (key === "total" || key === "lucro") return Number(row[key] || 0);
  if (key === "data") return parseSaleDate(row.data)?.getTime() || 0;
  if (key === "hora") {
    const [hours, minutes] = String(row.hora || "00:00").split(":").map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  }
  return String(row[key] || "").toLowerCase();
}

function sortHistoricoRows(rows, sortBy, sortDir) {
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sortBy);
    const bv = getSortValue(b, sortBy);
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function getUniqueVendedores(rows) {
  return [...new Set(rows.map((row) => String(row.vendedor || "").trim()))].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function initGestorPages(produtos, setProdutos, vendas, setVendas, user) {
  currentProdutos = produtos;
  setProdutosCallback = setProdutos;
  currentVendas = vendas;
  setVendasCallback = setVendas;
  currentUser = user;
  if (user && (user.role === "gestor" || user.role === "super")) {
    await refreshUsuarios();
    await refreshReservas();
  }
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

async function refreshUsuarios() {
  try {
    if (window.api?.getUsuarios) {
      currentUsuarios = await window.api.getUsuarios();
    }
  } catch (err) {
    console.error("Erro ao carregar utilizadores:", err);
  }
}

async function refreshProdutos() {
  const produtosAtualizados = await window.api.getProdutos();
  currentProdutos = produtosAtualizados;
  setProdutosCallback(produtosAtualizados);
  return produtosAtualizados;
}

async function loadCategorias() {
  try {
    if (window.api?.getCategorias) {
      const rows = await window.api.getCategorias();
      if (rows.length) {
        currentCategorias = rows.map((r) => r.nome);
        return;
      }
    }
  } catch (e) {
    console.warn("Categorias via API indisponíveis, usando lista local.", e);
  }
  currentCategorias = [...new Set([...CATEGORIAS, ...currentProdutos.map((p) => p.categoria || p.cat).filter(Boolean)])];
}

function reRenderActiveGestorPage() {
  const contentArea = document.getElementById("content-area");
  const page = window.STATE?.currentPage;
  if (!contentArea || !page) return;
  if (page === "cadastrar") void renderCadastrar(contentArea);
  else if (page === "stock") renderStock(contentArea);
}

function getFormLucroValues() {
  const unidade = document.getElementById("p-unidade")?.value || "Unidade";
  const tipo = getTipoByUnidade(unidade);
  const qtdEstoque = safeNum(document.getElementById("p-stock")?.value);
  const precoCompra = safeNum(document.getElementById("p-preco-compra")?.value);
  const precoVenda = safeNum(document.getElementById("p-preco-venda")?.value);
  const qtdPorCaixa = safeNum(document.getElementById("p-qtd-caixa")?.value, 1);
  const precoVendaCaixa = safeNum(document.getElementById("p-preco-venda-caixa")?.value);

  return calcularLucro({
    tipo,
    qtdEstoque,
    precoCompra,
    precoVenda,
    qtdPorCaixa,
    precoVendaCaixa
  });
}

function updateLucroPreview() {
  const unidade = document.getElementById("p-unidade")?.value || "Unidade";
  const tipo = getTipoByUnidade(unidade);
  const lucro = getFormLucroValues();
  
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = typeof val === "number" ? fmt(val) : val;
  };

  set("lucro-custo-unit", lucro.custoUnitario);
  set("lucro-por-unidade", lucro.lucroUnitario);
  set("lucro-por-caixa", lucro.lucroPorCaixa);
  set("lucro-total-estoque", lucro.lucroTotalEstoque);
  
  const margemEl = document.getElementById("lucro-margem");
  if (margemEl) margemEl.textContent = `${lucro.margemPercent}%`;
  
  const aviso = document.getElementById("lucro-aviso");
  if (aviso) {
    aviso.style.display = lucro.lucroUnitario < 0 ? "block" : "none";
  }

  // Atualizar labels dinamicamente baseados no tipo derivado da unidade
  const labelStock = document.getElementById("label-p-stock");
  const labelCompra = document.getElementById("label-p-compra");
  const labelVenda = document.getElementById("label-p-venda");
  const fieldQtdCaixa = document.getElementById("field-p-qtd-caixa");
  const fieldPrecoCx = document.getElementById("field-p-preco-venda-caixa");
  const itemCaixa = document.getElementById("lucro-item-caixa");
  const labelLucroCusto = document.getElementById("lucro-label-custo");

  if (tipo === TIPOS_PRODUTO.CAIXA) {
    if (labelStock) labelStock.textContent = "Quantidade de caixas em stock";
    if (labelCompra) labelCompra.textContent = "Preço de compra da CAIXA (MT)";
    if (labelVenda) labelVenda.textContent = "Preço de venda por UNIDADE (MT) *";
    if (fieldQtdCaixa) fieldQtdCaixa.style.display = "block";
    if (fieldPrecoCx) fieldPrecoCx.style.display = "block";
    if (itemCaixa) itemCaixa.style.display = "flex";
    if (labelLucroCusto) labelLucroCusto.textContent = "Custo por unidade";
  } else if (tipo === TIPOS_PRODUTO.UNIDADE) {
    if (labelStock) labelStock.textContent = "Quantidade total em stock";
    if (labelCompra) labelCompra.textContent = "Preço de compra da unidade (MT)";
    if (labelVenda) labelVenda.textContent = "Preço de venda da unidade (MT) *";
    if (fieldQtdCaixa) fieldQtdCaixa.style.display = "none";
    if (fieldPrecoCx) fieldPrecoCx.style.display = "none";
    if (itemCaixa) itemCaixa.style.display = "none";
    if (labelLucroCusto) labelLucroCusto.textContent = "Custo unitário";
  } else {
    // Granel (Litro, KG, etc)
    if (labelStock) labelStock.textContent = `Quantidade total (${unidade}) em stock`;
    if (labelCompra) labelCompra.textContent = "Valor total de compra (MT)";
    if (labelVenda) labelVenda.textContent = `Preço de venda por ${unidade} (MT) *`;
    if (fieldQtdCaixa) fieldQtdCaixa.style.display = "none";
    if (fieldPrecoCx) fieldPrecoCx.style.display = "none";
    if (itemCaixa) itemCaixa.style.display = "none";
    if (labelLucroCusto) labelLucroCusto.textContent = `Custo por ${unidade}`;
  }
}

function initProdutoFormListeners() {
  const ids = ["p-unidade", "p-stock", "p-preco-compra", "p-preco-venda", "p-qtd-caixa", "p-preco-venda-caixa"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const event = id === "p-unidade" ? "change" : "input";
    el.addEventListener(event, () => {
      updateLucroPreview();
    });
  });

  updateLucroPreview();
}

function buildCategoriaOptions() {
  return currentCategorias.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function getStockStatus(p) {
  const stock = Number(p.stock || 0);
  const min = Number(p.stockMin || p.stock_minimo || 10);
  if (stock === 0) return { label: "Sem Estoque", class: "out" };
  if (stock <= min) return { label: "Estoque Baixo", class: "low" };
  if (stock <= min * 2) return { label: "Estoque Médio", class: "medium" };
  return { label: "Estoque Alto", class: "high" };
}

function renderProductCard(p) {
  const status = getStockStatus(p);
  const profit = (p.preco_venda || p.preco || 0) - (p.preco_custo || 0);
  return `
    <div class="product-card-modern">
      <span class="type-badge">${p.unidade_medida || "Unidade"}</span>
      <div class="prod-name-modern" title="${escapeHtml(p.nome)}">${escapeHtml(p.nome)}</div>
      <div class="prod-info-list">
        <div class="prod-info-row"><span>Preço</span><span class="prod-info-value accent">${fmt(p.preco_venda || p.preco || 0)}</span></div>
        <div class="prod-info-row"><span>Estoque</span><span class="prod-info-value">${p.stock}</span></div>
        <div class="prod-info-row"><span>Lucro Un.</span><span class="prod-info-value green">${fmt(profit)}</span></div>
      </div>
      <div class="prod-status-badge">
        <div class="status-dot ${status.class}"></div>
        <span>${status.label}</span>
      </div>
    </div>
  `;
}

function renderCarouselSection(title, icon, products) {
  if (!products || !products.length) return "";
  return `
    <div class="carousel-section">
      <div class="carousel-header">
        <div class="carousel-title"><i class="fa-solid ${icon}"></i> ${title}</div>
        <div class="carousel-controls">
          <button class="carousel-btn btn-prev"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="carousel-btn btn-next"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
      <div class="carousel-container">
        <div class="carousel-track">
          ${products.map(p => renderProductCard(p)).join("")}
        </div>
      </div>
    </div>
  `;
}

function initDashboardCarousels() {
  document.querySelectorAll('.carousel-section').forEach(section => {
    const track = section.querySelector('.carousel-track');
    const prev = section.querySelector('.btn-prev');
    const next = section.querySelector('.btn-next');
    if (!track || !prev || !next) return;

    const scrollAmount = 260; // card + gap

    prev.onclick = () => track.scrollLeft -= scrollAmount;
    next.onclick = () => track.scrollLeft += scrollAmount;

    // Autoplay
    let interval = setInterval(() => {
      if (track.scrollLeft + track.offsetWidth >= track.scrollWidth - 10) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }, 5000);

    section.onmouseenter = () => clearInterval(interval);
    section.onmouseleave = () => {
      clearInterval(interval);
      interval = setInterval(() => {
        if (track.scrollLeft + track.offsetWidth >= track.scrollWidth - 10) {
          track.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      }, 5000);
    };
  });
}

export function renderDashboard(el) {
  const hoje = currentVendas.filter((v) => v.data === new Date().toISOString().split("T")[0]);
  const totalHoje = hoje.reduce((s, v) => s + v.total, 0);
  const lucroHoje = hoje.reduce((s, v) => s + v.lucro, 0);
  const stockDebilitado = currentProdutos.filter((p) => p.stock <= (p.stockMin || p.stock_minimo || 10)).length;

  // Categorização
  const bestSellersCounts = {};
  currentVendas.forEach(v => {
    if (Array.isArray(v.produtos)) {
      v.produtos.forEach(vp => {
        bestSellersCounts[vp.nome] = (bestSellersCounts[vp.nome] || 0) + (vp.qty || 1);
      });
    }
  });
  const bestSellers = currentProdutos
    .filter(p => bestSellersCounts[p.nome])
    .sort((a, b) => bestSellersCounts[b.nome] - bestSellersCounts[a.nome])
    .slice(0, 12);

  const featured = currentProdutos.slice(0, 12);
  const lowStock = currentProdutos.filter(p => p.stock <= (p.stockMin || p.stock_minimo || 10) && p.stock > 0);
  const mostProfitable = [...currentProdutos].sort((a, b) => {
    const profitA = (a.preco_venda || a.preco || 0) - (a.preco_custo || 0);
    const profitB = (b.preco_venda || b.preco || 0) - (b.preco_custo || 0);
    return profitB - profitA;
  }).slice(0, 12);

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-house" style="margin-right:8px"></i> Dashboard</div>
      <div class="page-sub">Visão geral rápida do stock e vendas</div>
    </div>
    
    <div class="cards-row cols4">
      <div class="card"><div class="card-title">Receita Hoje</div><div class="metric green">${fmt(totalHoje)}</div><div class="metric-sub">${hoje.length} vendas</div></div>
      <div class="card"><div class="card-title">Lucro Hoje</div><div class="metric blue">${fmt(lucroHoje)}</div><div class="metric-sub">Margem ${totalHoje ? Math.round((lucroHoje / totalHoje) * 100) : 0}%</div></div>
      <div class="card"><div class="card-title">Stock baixo</div><div class="metric ${stockDebilitado > 0 ? "amber" : "green"}">${stockDebilitado}</div><div class="metric-sub">produtos abaixo do mínimo</div></div>
      <div class="card"><div class="card-title">Base de produtos</div><div class="metric">${currentProdutos.length}</div><div class="metric-sub">${currentProdutos.filter((p) => p.stock > 0).length} em stock</div></div>
    </div>

    ${renderCarouselSection("Produtos com Baixo Estoque", "fa-triangle-exclamation", lowStock)}
    ${(() => {
      const expiring = currentProdutos
        .filter(p => p.data_validade && getExpirationStatus(p.data_validade).color !== "green")
        .sort((a, b) => new Date(a.data_validade) - new Date(b.data_validade));
      
      if (expiring.length === 0) return "";

      return `
        <div class="dashboard-section">
          <div class="section-header">
            <div class="section-title"><i class="fa-solid fa-hourglass-half"></i> Produtos Próximos da Validade</div>
          </div>
          <div class="carousel-container">
            <div class="carousel" id="expiring-carousel">
              ${expiring.map(p => {
                const status = getExpirationStatus(p.data_validade);
                return `
                <div class="carousel-card card-val-${status.color}">
                  <div class="cc-header">
                    <span class="cc-cat">${escapeHtml(p.categoria || "Geral")}</span>
                    <i class="fa-solid ${status.color === 'red' ? 'fa-circle-xmark' : 'fa-triangle-exclamation'} icon-${status.color}"></i>
                  </div>
                  <div class="cc-name">${escapeHtml(p.nome)}</div>
                  <div class="cc-stock">Stock: ${p.stock}</div>
                  <div class="cc-val-info">
                    <small>Validade: ${p.data_validade}</small><br>
                    <small>Lote: ${escapeHtml(p.lote || "—")}</small>
                  </div>
                  <div style="margin-top:10px">${getExpirationBadge(p.data_validade)}</div>
                </div>`;
              }).join("")}
            </div>
          </div>
        </div>
      `;
    })()}
    ${renderCarouselSection("Mais Vendidos", "fa-fire", bestSellers)}
    ${renderCarouselSection("Produtos com Maior Lucro", "fa-chart-line", mostProfitable)}
    ${renderCarouselSection("Explorar Inventário", "fa-box-open", featured)}
  `;

  setTimeout(initDashboardCarousels, 100);
}

export async function renderCadastrar(el) {
  await loadCategorias();

  el.innerHTML = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center">
      <div>
        <div class="page-title"><i class="fa-solid fa-plus" style="margin-right:8px"></i> Cadastrar Produtos</div>
        <div class="page-sub">Gestão avançada de inventário, preços e lucro</div>
      </div>
      <button class="btn btn-blue" id="btn-show-form">
        <i class="fa-solid fa-plus"></i> Novo Produto
      </button>
    </div>

    <div id="form-produto-container" class="hidden" style="margin-bottom:20px">
      <div class="card produto-form-card">
        <form id="form-produto" class="produto-form" onsubmit="return false">
          <section class="form-section">
            <h3 class="form-section-title"><i class="fa-solid fa-tag"></i> Informações do produto</h3>
            
            <div class="form-row cols2">
              <div class="field field-span2"><label>Nome do produto *</label><input id="p-nome" placeholder="Ex: Bolacha Maria" required/></div>
            </div>
            <div class="form-row cols3">
              <div class="field"><label>Unidade de medida *</label>
                <select id="p-unidade">${UNIDADES_MEDIDA.map((u) => `<option value="${u}">${u}</option>`).join("")}</select>
              </div>
              <div class="field"><label>Categoria</label><select id="p-cat">${buildCategoriaOptions()}</select></div>
              <div class="field"><label>Marca</label><input id="p-marca" placeholder="Opcional"/></div>
            </div>
            <div class="form-row cols3">
              <div class="field"><label>Nova categoria</label>
                <div class="input-with-btn">
                  <input id="p-nova-cat" placeholder="Criar categoria..."/>
                  <button type="button" class="btn btn-sm btn-blue" id="btn-add-cat">+</button>
                </div>
              </div>
              <div class="field"><label>Código de barras</label><input id="p-codigo-barras" placeholder="Opcional"/></div>
            </div>
            <div class="form-row cols1">
              <div class="field"><label>Descrição</label><textarea id="p-descricao" rows="2" placeholder="Descrição opcional"></textarea></div>
            </div>
          </section>

          <section class="form-section">
            <h3 class="form-section-title"><i class="fa-solid fa-boxes-stacked"></i> Stock e Quantidade</h3>
            <div class="form-row cols3">
              <div class="field"><label id="label-p-stock">Quantidade total em stock</label><input type="number" step="any" id="p-stock" min="0" value="0" placeholder="0"/></div>
              <div class="field" id="field-p-qtd-caixa"><label>Unidades dentro da caixa</label><input type="number" id="p-qtd-caixa" min="1" value="1" placeholder="1"/></div>
              <div class="field"><label>Stock mínimo</label><input type="number" step="any" id="p-stockmin" min="0" value="10" placeholder="10"/></div>
            </div>
          </section>

          <section class="form-section">
            <h3 class="form-section-title"><i class="fa-solid fa-coins"></i> Preços</h3>
            <div class="form-row cols3">
              <div class="field"><label id="label-p-compra">Preço de compra da unidade (MT)</label><input type="number" id="p-preco-compra" min="0" step="0.01" placeholder="0.00"/></div>
              <div class="field"><label id="label-p-venda">Preço de venda da unidade (MT) *</label><input type="number" id="p-preco-venda" min="0" step="0.01" placeholder="0.00" required/></div>
              <div class="field" id="field-p-preco-venda-caixa"><label>Preço de venda da caixa (MT)</label><input type="number" id="p-preco-venda-caixa" min="0" step="0.01" placeholder="0.00"/></div>
            </div>
          </section>

          <section class="form-section">
            <h3 class="form-section-title"><i class="fa-solid fa-calendar-check"></i> Validade e Lote</h3>
            <div class="form-row cols3">
              <div class="field"><label>Lote do produto *</label><input id="p-lote" placeholder="Ex: L1234" required/></div>
              <div class="field"><label>Data de fabricação</label><input type="date" id="p-data-fab"/></div>
              <div class="field"><label>Data de validade *</label><input type="date" id="p-data-val" required/></div>
            </div>
          </section>

          <section class="form-section form-section-lucro">
            <h3 class="form-section-title"><i class="fa-solid fa-chart-line"></i> Lucro e Projeção</h3>
            <div class="lucro-grid">
              <div class="lucro-item"><span class="lucro-label" id="lucro-label-custo">Custo unitário</span><span class="lucro-value" id="lucro-custo-unit">MT 0.00</span></div>
              <div class="lucro-item"><span class="lucro-label">Lucro unitário</span><span class="lucro-value lucro-positive" id="lucro-por-unidade">MT 0.00</span></div>
              <div class="lucro-item" id="lucro-item-caixa"><span class="lucro-label">Lucro por caixa</span><span class="lucro-value lucro-positive" id="lucro-por-caixa">MT 0.00</span></div>
              <div class="lucro-item"><span class="lucro-label">Lucro total estoque</span><span class="lucro-value lucro-positive" id="lucro-total-estoque">MT 0.00</span></div>
              <div class="lucro-item"><span class="lucro-label">Margem de lucro</span><span class="lucro-value lucro-margem" id="lucro-margem">0%</span></div>
            </div>
            <div class="alert-card alert-red" id="lucro-aviso" style="display:none;margin-top:12px">
              <i class="fa-solid fa-triangle-exclamation"></i> O preço de venda está abaixo do custo. Corrija antes de cadastrar.
            </div>
          </section>

          <div class="form-actions">
            <button type="button" class="btn btn-green btn-lg" id="btn-cadastrar-produto">
              <i class="fa-solid fa-check"></i> Cadastrar produto
            </button>
            <button type="button" class="btn btn-gray btn-lg" id="btn-cancelar-cadastro">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Produtos cadastrados (${currentProdutos.length})</div></div>
      <div class="table-toolbar">
        <button class="btn btn-sm btn-green" onclick="window.exportarInventarioExcelWrapper()"><i class="fa-solid fa-file-excel"></i> Excel</button>
        <button class="btn btn-sm btn-blue" onclick="window.exportarInventarioPdfWrapper()"><i class="fa-solid fa-file-pdf"></i> PDF</button>
      </div>
      <div class="table-wrap">
        <table class="table-produtos">
          <thead><tr>
            <th>Nome</th><th>Categoria</th><th>Unidade</th><th>Stock</th>
            <th>Preço un.</th><th>Lucro un.</th><th>Ações</th>
          </tr></thead>
          <tbody>${currentProdutos
            .map((p) => {
              const qtd = Math.max(1, p.qtd_por_caixa || 1);
              const custoU = p.preco_custo || (p.preco_compra_caixa || 0) / qtd;
              const precoV = p.preco_venda || p.preco || 0;
              const lucroU = precoV - custoU;
              return `
            <tr>
              <td><strong>${escapeHtml(p.nome)}</strong>${p.marca ? `<br><small class="text-muted">${escapeHtml(p.marca)}</small>` : ""}</td>
              <td>${escapeHtml(p.categoria || "Outros")}</td>
              <td>${escapeHtml(p.unidade_medida || "Unidade")}</td>
              <td><span class="${p.stock <= (p.stockMin || p.stock_minimo || 10) ? "stock-low" : "stock-ok"}">${p.stock}</span></td>
              <td>${fmt(precoV)}</td>
              <td class="${lucroU >= 0 ? "lucro-positive" : "lucro-negative"}">${fmt(lucroU)}</td>
              <td class="table-actions">
                <button class="btn btn-sm btn-blue" onclick="window.prepararEdicaoProduto(${p.id})">
                  <i class="fa-solid fa-pen-to-square"></i> Editar
                </button>
                <button class="btn btn-sm btn-red" onclick="window.removerProdutoWrapper(${p.id})">
                  <i class="fa-solid fa-trash"></i> Apagar
                </button>
              </td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>
      </div>
    </div>
  `;

  const btnShow = document.getElementById("btn-show-form");
  const formContainer = document.getElementById("form-produto-container");
  const btnCancel = document.getElementById("btn-cancelar-cadastro");

  btnShow?.addEventListener("click", () => {
    if (formContainer?.classList.contains("hidden")) {
      // Abrindo o formulário
      editingProdutoId = null;
      document.getElementById("form-produto")?.reset();
      const submitBtn = document.getElementById("btn-cadastrar-produto");
      if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar produto';
      formContainer.classList.remove("hidden");
      btnShow.innerHTML = '<i class="fa-solid fa-xmark"></i> Fechar';
      updateLucroPreview();
    } else {
      // Fechando o formulário
      formContainer?.classList.add("hidden");
      btnShow.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Produto';
    }
  });

  btnCancel?.addEventListener("click", () => {
    formContainer?.classList.add("hidden");
    editingProdutoId = null;
    if (btnShow) btnShow.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Produto';
  });

  document.getElementById("btn-cadastrar-produto")?.addEventListener("click", () => window.cadastrarProdutoWrapper());
  document.getElementById("btn-add-cat")?.addEventListener("click", () => window.adicionarCategoriaInlineWrapper());
  initProdutoFormListeners();
}

window.adicionarCategoriaInlineWrapper = async function () {
  const input = document.getElementById("p-nova-cat");
  const nome = input?.value?.trim();
  if (!nome) {
    showNotification("Informe o nome da nova categoria.", "warning");
    return;
  }
  try {
    if (window.api?.addCategoria) await window.api.addCategoria({ nome });
    if (!currentCategorias.includes(nome)) currentCategorias.push(nome);
    currentCategorias.sort((a, b) => a.localeCompare(b, "pt"));
    const select = document.getElementById("p-cat");
    if (select) {
      select.innerHTML = buildCategoriaOptions();
      select.value = nome;
    }
    if (input) input.value = "";
  } catch (err) {
    console.error(err);
    showNotification(err?.message || "Erro ao adicionar categoria.", "error");
  }
};

window.prepararEdicaoProduto = function (id) {
  const p = currentProdutos.find((item) => item.id === id);
  if (!p) return;

  editingProdutoId = id;
  const formContainer = document.getElementById("form-produto-container");
  const btnShow = document.getElementById("btn-show-form");
  const submitBtn = document.getElementById("btn-cadastrar-produto");

  // Mostrar form
  if (formContainer) formContainer.classList.remove("hidden");
  if (btnShow) btnShow.innerHTML = '<i class="fa-solid fa-xmark"></i> Fechar';
  if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Alterações';

  // Preencher campos
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setVal("p-nome", p.nome);
  setVal("p-unidade", p.unidade_medida || "Unidade");
  setVal("p-cat", p.categoria || p.categoria_id || "");
  setVal("p-marca", p.marca);
  setVal("p-codigo-barras", p.codigo_barras);
  setVal("p-descricao", p.descricao);
  setVal("p-stock", p.stock);
  setVal("p-qtd-caixa", p.qtd_por_caixa || 1);
  setVal("p-stockmin", p.stock_minimo || p.stockMin || 10);
  setVal("p-preco-compra", p.preco_custo || p.preco_compra_caixa || 0);
  setVal("p-preco-venda", p.preco_venda || p.preco || 0);
  setVal("p-preco-venda-caixa", p.preco_venda_caixa || 0);
  setVal("p-lote", p.lote);
  setVal("p-data-fab", p.data_fabricacao);
  setVal("p-data-val", p.data_validade);

  updateLucroPreview();
  
  // Scroll para o topo do form
  formContainer?.scrollIntoView({ behavior: "smooth" });
};

window.cadastrarProdutoWrapper = async function () {
  if (!currentUser?.id) {
    showNotification("Utilizador não autenticado.", "error");
    return;
  }

  const nome = document.getElementById("p-nome")?.value?.trim();
  const novaCat = document.getElementById("p-nova-cat")?.value?.trim();
  const categoria = novaCat || document.getElementById("p-cat")?.value;
  const unidade_medida = document.getElementById("p-unidade")?.value || "Unidade";
  const tipo_produto = getTipoByUnidade(unidade_medida);
  
  const stock = safeNum(document.getElementById("p-stock")?.value);
  const qtd_por_caixa = Math.max(1, safeNum(document.getElementById("p-qtd-caixa")?.value, 1));
  const stock_minimo = safeNum(document.getElementById("p-stockmin")?.value, 10);
  
  const preco_compra_input = safeNum(document.getElementById("p-preco-compra")?.value);
  const preco_venda = safeNum(document.getElementById("p-preco-venda")?.value);
  const preco_venda_caixa_input = safeNum(document.getElementById("p-preco-venda-caixa")?.value);
  
  const marca = document.getElementById("p-marca")?.value?.trim() || null;
  const codigo_barras = document.getElementById("p-codigo-barras")?.value?.trim() || null;
  const descricao = document.getElementById("p-descricao")?.value?.trim() || null;
  const lote = document.getElementById("p-lote")?.value?.trim() || null;
  const data_fabricacao = document.getElementById("p-data-fab")?.value || null;
  const data_validade = document.getElementById("p-data-val")?.value || null;

  if (!nome) {
    showNotification("Informe o nome do produto.", "warning");
    return;
  }
  if (!lote) {
    showNotification("Informe o lote do produto.", "warning");
    return;
  }
  if (!data_validade) {
    showNotification("Informe a data de validade.", "warning");
    return;
  }
  if (preco_venda <= 0) {
    showNotification("Informe o preço de venda (maior que zero).", "warning");
    return;
  }
  if (!categoria) {
    showNotification("Seleccione ou crie uma categoria.", "warning");
    return;
  }

  // Cálculos automáticos de lucro e custo
  const lucroData = calcularLucro({
    tipo: tipo_produto,
    qtdEstoque: stock,
    precoCompra: preco_compra_input,
    precoVenda: preco_venda,
    qtdPorCaixa: qtd_por_caixa,
    precoVendaCaixa: preco_venda_caixa_input
  });

  const preco_custo = lucroData.custoUnitario;
  const precoCx = (preco_venda * qtd_por_caixa);

  const payload = {
    nome,
    tipo_produto,
    categoria_id: categoria,
    preco_venda,
    preco_custo,
    stock_minimo,
    stock,
    unidade_medida,
    qtd_por_caixa,
    preco_compra_caixa: tipo_produto === TIPOS_PRODUTO.CAIXA ? preco_compra_input : (preco_custo * qtd_por_caixa),
    preco_venda_caixa: precoCx,
    marca,
    codigo_barras,
    descricao,
    lote,
    data_fabricacao,
    data_validade,
  };

  try {
    if (editingProdutoId) {
      await window.api.atualizarProduto(editingProdutoId, payload);
      showNotification("Produto atualizado com sucesso!", "success");
      editingProdutoId = null;
    } else {
      await window.api.addProduto(payload);
      showNotification("Produto cadastrado com sucesso!", "success");
    }
    
    await refreshProdutos();
    const contentArea = document.getElementById("content-area");
    if (contentArea) await renderCadastrar(contentArea);
  } catch (err) {
    console.error(err);
    showNotification(err?.message || "Erro ao processar produto.", "error");
  }
};

window.removerProdutoWrapper = async function (id) {
  if (!currentUser?.id) {
    showNotification("Utilizador não autenticado.", "error");
    return;
  }
  const produto = currentProdutos.find((p) => p.id === id);
  const nome = produto?.nome || "este produto";
  
  showConfirmModal(
    `Tem a certeza que deseja apagar "<strong>${escapeHtml(nome)}</strong>"?<br><br><em>Esta acção não pode ser desfeita.</em>`,
    async () => {
      try {
        await window.api.deleteProduto({ id });
        await refreshProdutos();
        closeModal();
        reRenderActiveGestorPage();
      } catch (err) {
        console.error(err);
        showNotification(err?.message || "Erro ao apagar produto.", "error");
      }
    }
  );
};

window.editarStockFromCadastrarWrapper = function (id) {
  const produto = currentProdutos.find((p) => p.id === id);
  if (!produto) {
    showNotification("Produto não encontrado.", "error");
    return;
  }
  openEditStockModal(produto, currentUser, async () => {
    await refreshProdutos();
    reRenderActiveGestorPage();
  });
};

window.updateStockFromTable = async function (id, newStock) {
  if (!currentUser?.id) return;
  const produto = currentProdutos.find((p) => p.id === id);
  if (!produto) return;

  const stock = Math.max(0, safeNum(newStock));
  if (stock === produto.stock) return;

  try {
    await window.api.atualizarProduto(id, { stock });
    await refreshProdutos();
    const contentArea = document.getElementById("content-area");
    if (contentArea && window.STATE?.currentPage === "stock") renderStock(contentArea);
  } catch (err) {
    console.error(err);
    showNotification(err?.message || "Erro ao atualizar stock.", "error");
  }
};

function inventarioRows() {
  return currentProdutos.map((p) => {
    const qtd = Math.max(1, Number(p.qtd_por_caixa) || 1);
    const custo = Number(p.preco_custo || 0);
    const preco = Number(p.preco || p.preco_venda || 0);
    return {
      nome: p.nome,
      categoria: p.categoria || p.cat || "Outros",
      codigo: p.codigo_barras || "",
      stock: Number(p.stock || 0),
      minimo: Number(p.stockMin ?? p.stock_minimo ?? 10),
      unidade: p.unidade_medida || "Unidade",
      qtdCaixa: qtd,
      custo,
      preco,
      lucro: preco - custo,
      valorStock: preco * Number(p.stock || 0),
    };
  });
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

window.exportarInventarioExcelWrapper = function () {
  const rows = inventarioRows();
  const totalStock = rows.reduce((s, r) => s + r.stock, 0);
  const totalValor = rows.reduce((s, r) => s + r.valorStock, 0);
  const html = `
    <html><head><meta charset="utf-8"></head><body>
      <table border="1">
        <thead>
          <tr><th>Produto</th><th>Categoria</th><th>Codigo</th><th>Stock</th><th>Minimo</th><th>Unidade</th><th>Qtd/Caixa</th><th>Custo</th><th>Preco</th><th>Lucro</th><th>Valor Stock</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(r.categoria)}</td><td>${escapeHtml(r.codigo)}</td><td>${r.stock}</td><td>${r.minimo}</td><td>${escapeHtml(r.unidade)}</td><td>${r.qtdCaixa}</td><td>${r.custo}</td><td>${r.preco}</td><td>${r.lucro}</td><td>${r.valorStock}</td></tr>`
            )
            .join("")}
          <tr><td colspan="3"><strong>Totais</strong></td><td><strong>${totalStock}</strong></td><td colspan="6"></td><td><strong>${totalValor}</strong></td></tr>
        </tbody>
      </table>
    </body></html>`;
  downloadBlob(`inventario-${new Date().toISOString().slice(0, 10)}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
};

window.exportarInventarioPdfWrapper = function () {
  const rows = inventarioRows();
  const win = window.open("", "_blank");
  if (!win) {
    showNotification("Permita pop-ups para exportar o PDF.", "warning");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Inventario</title>
        <style>
          body{font-family:Arial,sans-serif;color:#111;margin:24px}
          h1{font-size:20px;margin:0 0 4px}
          .sub{font-size:12px;color:#555;margin-bottom:18px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #ccc;padding:6px;text-align:left}
          th{background:#f2f2f2}
          .neg{color:#b00020;font-weight:700}
        </style>
      </head>
      <body>
        <h1>Inventario de Produtos</h1>
        <div class="sub">Gerado em ${new Date().toLocaleString("pt-PT")}</div>
        <table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Codigo</th><th>Stock</th><th>Min.</th><th>Preco</th><th>Lucro</th><th>Estado</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(r.categoria)}</td><td>${escapeHtml(r.codigo)}</td><td>${r.stock}</td><td>${r.minimo}</td><td>${fmt(r.preco)}</td><td class="${r.lucro < 0 ? "neg" : ""}">${fmt(r.lucro)}</td><td>${r.stock <= r.minimo ? "Atenção" : "OK"}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
};

export function renderStock(el) {
  let filterValidade = "todos"; // "todos", "vencidos", "proximos", "validos"

  const renderTable = () => {
    const filtered = currentProdutos.filter(p => {
      if (filterValidade === "todos") return true;
      const status = getExpirationStatus(p.data_validade).color;
      if (filterValidade === "vencidos") return status === "red";
      if (filterValidade === "proximos") return status === "amber";
      if (filterValidade === "validos") return status === "green";
      return true;
    });

    return `
      <div class="filter-group">
        <button class="btn-filter ${filterValidade === 'todos' ? 'active' : ''}" onclick="window.setFilterValidade('todos')">Todos</button>
        <button class="btn-filter ${filterValidade === 'vencidos' ? 'active' : ''}" onclick="window.setFilterValidade('vencidos')">Vencidos</button>
        <button class="btn-filter ${filterValidade === 'proximos' ? 'active' : ''}" onclick="window.setFilterValidade('proximos')">Próximos da Validade</button>
        <button class="btn-filter ${filterValidade === 'validos' ? 'active' : ''}" onclick="window.setFilterValidade('validos')">Válidos</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Validade / Lote</th><th>Stock Actual</th><th>Mínimo</th><th>Status</th><th style="text-align:center">Acções de Stock</th></tr></thead>
          <tbody>${filtered
            .map((p) => {
              const statusVal = getExpirationStatus(p.data_validade);
              const statusStock = p.stock === 0 ? "Esgotado" : p.stock <= (p.stockMin || p.stock_minimo || 10) ? "Baixo" : "OK";
              const badgeStock = statusStock === "Esgotado" ? "red" : statusStock === "Baixo" ? "amber" : "green";
              const isVencido = statusVal.color === "red";
              
              return `
            <tr class="${isVencido ? 'product-vencido-alert' : ''}">
              <td>
                <strong>${escapeHtml(p.nome)}</strong>
                ${isVencido ? '<i class="fa-solid fa-triangle-exclamation icon-red" title="Produto Vencido"></i>' : ''}
              </td>
              <td><span class="tag">${escapeHtml(p.categoria || "Outros")}</span></td>
              <td>
                ${getExpirationBadge(p.data_validade)}<br>
                <small class="text-muted">Lote: ${escapeHtml(p.lote || "—")}</small>
              </td>
              <td><strong class="${p.stock <= (p.stockMin || p.stock_minimo || 10) ? "stock-low" : "stock-ok"}" style="font-size:15px">${p.stock}</strong></td>
              <td>${p.stockMin || p.stock_minimo || 10}</td>
              <td><span class="badge ${badgeStock}">${statusStock}</span></td>
              <td class="table-actions" style="justify-content:center">
                <button class="btn btn-sm btn-green" onclick="window.reporStockDirectWrapper(${p.id})" title="Adicionar ao stock">
                  <i class="fa-solid fa-plus"></i> Repor
                </button>
                <button class="btn btn-sm btn-amber" onclick="window.removerStockDirectWrapper(${p.id})" title="Remover do stock">
                  <i class="fa-solid fa-minus"></i> Remover
                </button>
              </td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>
      </div>
    `;
  };

  window.setFilterValidade = (val) => {
    filterValidade = val;
    const container = document.getElementById("stock-table-container");
    if (container) container.innerHTML = renderTable();
  };

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-box" style="margin-right:8px"></i> Nível de Stock</div>
      <div class="page-sub">Gerencie quantidades de produtos e acompanhe o inventário</div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Produtos em stock (${currentProdutos.length})</div></div>
      <div class="table-toolbar">
        <button class="btn btn-sm btn-green" onclick="window.exportarInventarioExcelWrapper()"><i class="fa-solid fa-file-excel"></i> Excel</button>
        <button class="btn btn-sm btn-blue" onclick="window.exportarInventarioPdfWrapper()"><i class="fa-solid fa-file-pdf"></i> PDF</button>
      </div>
      <div id="stock-table-container">
        ${renderTable()}
      </div>
    </div>
  `;
}

export async function renderFinancas(el) {
  let transacoes = [];
  try {
    if (window.api?.getFinanceiro) {
      transacoes = await window.api.getFinanceiro();
    }
  } catch (err) {
    console.error("Erro ao carregar financeiro:", err);
  }

  const hoje = new Date().toISOString().split("T")[0];
  const vendasHoje = currentVendas.filter((v) => (v.data || "").startsWith(hoje));
  
  // Totais do Fluxo de Caixa (considerando transações registadas)
  const entradas = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const saidas = transacoes.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);
  const saldo = entradas - saidas;

  // Estatísticas Rápidas
  const receitaVendas = vendasHoje.reduce((s, v) => s + v.total, 0);
  const lucroVendas = vendasHoje.reduce((s, v) => s + v.lucro, 0);

  el.innerHTML = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center">
      <div>
        <div class="page-title"><i class="fa-solid fa-money-bill-wave" style="margin-right:8px"></i> Finanças</div>
        <div class="page-sub">Controlo de entradas, despesas e fluxo de caixa</div>
      </div>
      <div style="display:flex; gap:10px">
        <button class="btn btn-blue" onclick="window.novaDespesaWrapper()">
          <i class="fa-solid fa-minus-circle"></i> Adicionar Despesa
        </button>
        <button class="btn btn-green" onclick="window.pagarFuncionarioWrapper()">
          <i class="fa-solid fa-hand-holding-dollar"></i> Pagar Funcionário
        </button>
      </div>
    </div>

    <!-- SUMÁRIO DE FLUXO DE CAIXA -->
    <div class="cards-row cols3" style="margin-bottom:20px">
      <div class="card">
        <div class="card-title">Total Entradas</div>
        <div class="metric green">${fmt(entradas)}</div>
        <div class="metric-sub">Soma de todas as entradas</div>
      </div>
      <div class="card">
        <div class="card-title">Total Saídas</div>
        <div class="metric red">${fmt(saidas)}</div>
        <div class="metric-sub">Despesas e salários pagos</div>
      </div>
      <div class="card">
        <div class="card-title">Saldo Actual</div>
        <div class="metric ${saldo >= 0 ? 'blue' : 'red'}">${fmt(saldo)}</div>
        <div class="metric-sub">Entradas - Saídas</div>
      </div>
    </div>

    <!-- DASHBOARD DE VENDAS (Existente) -->
    <div class="cards-row cols2">
      <div class="card">
        <div class="card-title">Vendas de Hoje</div>
        <div class="metric green">${fmt(receitaVendas)}</div>
        <div class="metric-sub">${vendasHoje.length} transacções de venda</div>
      </div>
      <div class="card">
        <div class="card-title">Lucro Operacional (Hoje)</div>
        <div class="metric blue">${fmt(lucroVendas)}</div>
        <div class="metric-sub">Baseado na margem dos produtos</div>
      </div>
    </div>

    <!-- HISTÓRICO INTEGRADO -->
    <div class="card" style="margin-top:20px">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center">
        <div class="card-title">Movimentações Recentes</div>
        <div class="table-toolbar" style="margin:0">
          <input type="text" id="fin-search" placeholder="Pesquisar categoria ou entidade..." style="padding:6px 12px; border-radius:6px; border:1px solid var(--border2); background:var(--bg3); color:var(--text); font-size:13px; width:250px"/>
        </div>
      </div>
      <div class="table-wrap">
        <table id="table-financeiro">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Entidade/Obs</th>
              <th>Responsável</th>
              <th>M. Pagamento</th>
              <th style="text-align:right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${transacoes.length ? transacoes.map(t => `
              <tr>
                <td><small>${new Date(t.data).toLocaleString()}</small></td>
                <td><span class="badge ${t.tipo === 'entrada' ? 'green' : 'red'}">${t.tipo.toUpperCase()}</span></td>
                <td><strong>${t.categoria}</strong></td>
                <td>${t.entidade_nome || '-'} <br/><small style="color:var(--text2)">${t.observacao || ''}</small></td>
                <td>${t.usuario_nome || 'Sistema'}</td>
                <td><span class="tag">${t.metodo_pagamento || '-'}</span></td>
                <td style="text-align:right; font-weight:600; color: ${t.tipo === 'entrada' ? 'var(--green)' : 'var(--red)'}">
                  ${t.tipo === 'entrada' ? '+' : '-'}${fmt(t.valor)}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text2)">Nenhuma movimentação registada.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Listener para pesquisa
  document.getElementById("fin-search")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll("#table-financeiro tbody tr");
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? "" : "none";
    });
  });
}

window.novaDespesaWrapper = function() {
  const categorias = ["Energia", "Água", "Internet", "Aluguel", "Fornecedor", "Transporte", "Manutenção", "Impostos", "Outros"];
  
  const confirmar = async () => {
    const dados = {
      tipo: 'saida',
      categoria: document.getElementById("f-categoria").value,
      valor: Number(document.getElementById("f-valor").value),
      metodo_pagamento: document.getElementById("f-metodo").value,
      observacao: document.getElementById("f-obs").value,
      data: document.getElementById("f-data").value || new Date().toISOString()
    };

    if (!dados.valor || dados.valor <= 0) {
      showNotification("Informe um valor válido.", "warning");
      return;
    }

    try {
      await window.api.addFinanceiro(dados);
      showNotification("Despesa registada com sucesso!", "success");
      closeModal();
      const ca = document.getElementById("content-area");
      if (ca) renderFinancas(ca);
    } catch (err) {
      showNotification("Erro ao registar despesa: " + err.message, "error");
    }
  };

  showModal(`
    <div class="modal-title"><i class="fa-solid fa-minus-circle"></i> Registar Nova Despesa</div>
    <div class="form-row cols2">
      <div class="field">
        <label>Categoria</label>
        <select id="f-categoria" style="width:100%">
          ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Valor (MT)</label>
        <input id="f-valor" type="number" min="0.01" step="0.01" placeholder="0.00"/>
      </div>
    </div>
    <div class="form-row cols2">
      <div class="field">
        <label>Método de Pagamento</label>
        <select id="f-metodo" style="width:100%">
          <option value="dinheiro">Dinheiro</option>
          <option value="mpesa">M-Pesa</option>
          <option value="emola">E-Mola</option>
          <option value="cartao">Cartão</option>
          <option value="transferencia">Transferência</option>
        </select>
      </div>
      <div class="field">
        <label>Data</label>
        <input id="f-data" type="datetime-local" value="${new Date().toISOString().slice(0, 16)}"/>
      </div>
    </div>
    <div class="field">
      <label>Observação / Fornecedor</label>
      <textarea id="f-obs" placeholder="Ex: Pagamento da conta de luz de Janeiro"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-red" id="confirm-modal-btn">Registar Saída</button>
    </div>
  `, confirmar);
};

window.pagarFuncionarioWrapper = function() {
  const confirmar = async () => {
    const dados = {
      tipo: 'saida',
      categoria: 'Salário',
      entidade_nome: document.getElementById("s-nome").value,
      valor: Number(document.getElementById("s-valor").value),
      metodo_pagamento: document.getElementById("s-metodo").value,
      observacao: `Cargo: ${document.getElementById("s-cargo").value} | ${document.getElementById("s-obs").value}`,
      data: document.getElementById("s-data").value || new Date().toISOString()
    };

    if (!dados.entidade_nome || !dados.valor || dados.valor <= 0) {
      showNotification("Preencha o nome e um valor válido.", "warning");
      return;
    }

    try {
      await window.api.addFinanceiro(dados);
      showNotification("Pagamento de salário registado!", "success");
      closeModal();
      const ca = document.getElementById("content-area");
      if (ca) renderFinancas(ca);
    } catch (err) {
      showNotification("Erro ao registar pagamento: " + err.message, "error");
    }
  };

  showModal(`
    <div class="modal-title"><i class="fa-solid fa-hand-holding-dollar"></i> Pagar Funcionário</div>
    <div class="form-row cols2">
      <div class="field">
        <label>Nome do Funcionário</label>
        <input id="s-nome" placeholder="Ex: Ana Machava"/>
      </div>
      <div class="field">
        <label>Cargo</label>
        <input id="s-cargo" placeholder="Ex: Vendedor"/>
      </div>
    </div>
    <div class="form-row cols2">
      <div class="field">
        <label>Valor Pago (MT)</label>
        <input id="s-valor" type="number" min="0.01" step="0.01" placeholder="0.00"/>
      </div>
      <div class="field">
        <label>Método de Pagamento</label>
        <select id="s-metodo" style="width:100%">
          <option value="dinheiro">Dinheiro</option>
          <option value="transferencia">Transferência Bancária</option>
          <option value="mpesa">M-Pesa</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Data</label>
      <input id="s-data" type="datetime-local" value="${new Date().toISOString().slice(0, 16)}"/>
    </div>
    <div class="field">
      <label>Observações</label>
      <textarea id="s-obs" placeholder="Ex: Referente ao mês de Fevereiro"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-green" id="confirm-modal-btn">Confirmar Pagamento</button>
    </div>
  `, confirmar);
};

export function renderFuncionarios(el) {
  const filtrados = currentUsuarios.filter(u => u.role === "vendedor" || u.role === "gestor");

  el.innerHTML = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center">
      <div>
        <div class="page-title"><i class="fa-solid fa-user-group" style="margin-right:8px"></i> Funcionários</div>
        <div class="page-sub">Gestão de funcionários e utilizadores da empresa</div>
      </div>
      <button class="btn btn-green" onclick="window.novoUsuarioWrapper()">
        <i class="fa-solid fa-user-plus"></i> Novo Utilizador
      </button>
    </div>
    
    <div class="card">
      <div class="card-header"><div class="card-title">Utilizadores da Empresa (${filtrados.length})</div></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Role</th><th>Ativo</th><th>Acções</th></tr>
          </thead>
          <tbody>
            ${filtrados.map((u) => `
              <tr>
                <td><strong>${escapeHtml(u.nome)}</strong></td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="badge blue">${u.role}</span></td>
                <td><span class="badge ${u.ativo ? "green" : "red"}">${u.ativo ? "Sim" : "Não"}</span></td>
                <td class="table-actions">
                  <button class="btn btn-sm" onclick="window.toggleUsuarioWrapper(${u.id}, ${u.ativo})" title="Activar/Desactivar">
                    <i class="fa-solid ${u.ativo ? "fa-user-slash" : "fa-user-check"}"></i>
                  </button>
                  <button class="btn btn-sm btn-red" onclick="window.deleteUsuarioWrapper(${u.id})" title="Remover">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderHistoricoVendas(el) {
  const rows = getHistoricoRows();
  let sortBy = "data";
  let sortDir = "desc";

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-clock-rotate-left" style="margin-right:8px"></i> Histórico de Vendas</div>
      <div class="page-sub">Registo completo das vendas por vendedor com filtros e ordenação.</div>
    </div>
    <div class="card">
      <div class="table-toolbar historico-filters">
        <div class="field">
          <label>Vendedor</label>
          <select id="historico-filter-vendedor">
            <option value="">Todos</option>
            ${getUniqueVendedores(rows).map((nome) => `<option value="${nome}">${nome}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Data inicial</label>
          <input type="date" id="historico-filter-from" />
        </div>
        <div class="field">
          <label>Data final</label>
          <input type="date" id="historico-filter-to" />
        </div>
        <div class="field" style="flex:1; min-width:220px;">
          <label>Buscar vendedor</label>
          <input type="text" id="historico-filter-search" placeholder="Nome do vendedor" />
        </div>
      </div>
      <div class="table-wrap historico-table-wrap">
        <table class="table-sortable">
          <thead>
            <tr>
              <th data-sort="vendedor">Vendedor</th>
              <th data-sort="data">Data</th>
              <th data-sort="hora">Hora</th>
              <th data-sort="total">Total</th>
              <th data-sort="lucro">Lucro</th>
            </tr>
          </thead>
          <tbody id="historico-table-body"></tbody>
        </table>
      </div>
      <div class="table-footer" id="historico-table-info" style="margin-top:12px;color:var(--text2)"></div>
    </div>
  `;

  const filterVendedor = document.getElementById("historico-filter-vendedor");
  const filterFrom = document.getElementById("historico-filter-from");
  const filterTo = document.getElementById("historico-filter-to");
  const filterSearch = document.getElementById("historico-filter-search");
  const tableBody = document.getElementById("historico-table-body");
  const tableInfo = document.getElementById("historico-table-info");
  const headers = Array.from(el.querySelectorAll(".table-sortable th[data-sort]"));

  function matchesFilters(row) {
    const sellerFilter = String(filterVendedor.value || "").trim().toLowerCase();
    const searchFilter = String(filterSearch.value || "").trim().toLowerCase();
    const fromDate = parseSaleDate(filterFrom.value);
    const toDate = parseSaleDate(filterTo.value);
    const saleDate = parseSaleDate(row.data);

    if (sellerFilter && row.vendedor.toLowerCase() !== sellerFilter) return false;
    if (searchFilter && !row.vendedor.toLowerCase().includes(searchFilter)) return false;
    if (fromDate && saleDate && saleDate < fromDate) return false;
    if (toDate && saleDate && saleDate > new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59)) return false;
    return true;
  }

  function renderRows() {
    const filtered = rows.filter(matchesFilters);
    const sorted = sortHistoricoRows(filtered, sortBy, sortDir);
    tableBody.innerHTML = sorted
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.vendedor)}</td>
            <td>${escapeHtml(formatDateBR(row.data))}</td>
            <td>${escapeHtml(formatTime(row.hora))}</td>
            <td>${fmt(row.total)}</td>
            <td>${fmt(row.lucro)}</td>
          </tr>`
      )
      .join("");
    tableInfo.textContent = `${sorted.length} registro(s) exibido(s)`;
    headers.forEach((th) => {
      const key = th.dataset.sort;
      th.classList.toggle("active", key === sortBy);
      th.classList.toggle("asc", key === sortBy && sortDir === "asc");
      th.classList.toggle("desc", key === sortBy && sortDir === "desc");
    });
  }

  function attachListeners() {
    [filterVendedor, filterFrom, filterTo, filterSearch].forEach((input) => {
      input.addEventListener("input", renderRows);
      input.addEventListener("change", renderRows);
    });

    headers.forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortBy === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortBy = key;
          sortDir = key === "data" ? "desc" : "asc";
        }
        renderRows();
      });
    });
  }

  attachListeners();
  renderRows();
}

window.novoUsuarioWrapper = function() {
  const confirmar = async () => {
    const nome = document.getElementById("u-nome").value.trim();
    const email = document.getElementById("u-email").value.trim();
    const senha = document.getElementById("u-senha").value;
    const role = document.getElementById("u-role").value;
    
    if (!nome || !email || !senha) { showNotification("Preencha todos os campos obrigatórios", "warning"); return; }

    try {
      await window.api.addUsuario({ nome, email, senha, role });
      await refreshUsuarios();
      closeModal();
      const ca = document.getElementById("content-area");
      if (ca) renderFuncionarios(ca);
    } catch (err) {
      showNotification("Erro ao criar utilizador: " + err.message, "error");
    }

  };

  showModal(`
    <div class="modal-title">👤 Adicionar Novo Utilizador</div>
    <div class="field" style="margin-bottom:12px"><label>Nome Completo *</label><input id="u-nome" placeholder="ex: Ana Machava" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)"/></div>
    <div class="field" style="margin-bottom:12px"><label>Email / Login *</label><input id="u-email" placeholder="vendedor@empresa.com" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)"/></div>
    <div class="field" style="margin-bottom:12px"><label>Senha *</label><input id="u-senha" type="password" placeholder="••••••" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)"/></div>
    <div class="field" style="margin-bottom:12px">
      <label>Nível de Acesso</label>
      <select id="u-role" style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--sm-r);padding:10px;color:var(--text)">
        <option value="vendedor">Vendedor</option>
        <option value="gestor">Gestor (Admin da Empresa)</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="window.closeModal()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2)">Cancelar</button>
      <button class="btn btn-green" id="confirm-modal-btn"><i class="fa-solid fa-check"></i> Criar Utilizador</button>
    </div>
  `, confirmar);
};

window.toggleUsuarioWrapper = async function(id, currentAtivo) {
  try {
    await window.api.updateUsuario(id, { ativo: !currentAtivo });
    await refreshUsuarios();
    const ca = document.getElementById("content-area");
    if (ca) renderFuncionarios(ca);
  } catch (err) {
    showNotification("Erro ao atualizar utilizador", "error");
  }
};


window.deleteUsuarioWrapper = async function(id) {
  showConfirmModal(
    "Deseja realmente remover este utilizador?",
    async () => {
      closeModal();
      try {
        await window.api.deleteUsuario(id);
        await refreshUsuarios();
        const ca = document.getElementById("content-area");
        if (ca) renderFuncionarios(ca);
      } catch (err) {
        showNotification("Erro ao remover utilizador: " + err.message, "error");
      }
    }
  );
};

export function renderEstatisticas(el) {
  const totalVendas = currentVendas.length;
  const totalProdutos = currentProdutos.length;
  const totalStock = currentProdutos.reduce((s, p) => s + (p.stock || 0), 0);
  const stockBaixo = currentProdutos.filter((p) => p.stock <= p.stockMin).length;

  el.innerHTML = `
    <div class="page-header no-print">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="page-title"><i class="fa-solid fa-chart-line" style="margin-right:8px"></i> Estatísticas</div>
          <div class="page-sub">Principais indicadores de desempenho</div>
        </div>
        <button class="btn btn-blue" onclick="window.printReport()">
          <i class="fa-solid fa-print"></i> Imprimir Relatório
        </button>
      </div>
    </div>

    <div id="report-content">
      <div class="print-header only-print" style="margin-bottom: 30px; text-align: center;">
        <h1 class="syne" style="font-size: 28px; color: #000;">Relatório de Desempenho</h1>
        <p style="color: #666;">Gerado em: ${new Date().toLocaleString()}</p>
        <div style="height: 2px; background: #333; margin: 20px 0;"></div>
      </div>

      <div class="cards-row cols4">
        <div class="card">
          <div class="card-title">Vendas totais</div>
          <div class="metric">${totalVendas}</div>
        </div>
        <div class="card">
          <div class="card-title">Produtos registados</div>
          <div class="metric">${totalProdutos}</div>
        </div>
        <div class="card">
          <div class="card-title">Total de stock</div>
          <div class="metric">${totalStock}</div>
        </div>
        <div class="card">
          <div class="card-title">Stock baixo</div>
          <div class="metric ${stockBaixo > 0 ? "amber" : ""}">${stockBaixo}</div>
        </div>
      </div>

      <div class="cards-row cols2">
        <div class="card">
          <div class="card-header"><div class="card-title">Evolução de Vendas (7 dias)</div></div>
          <div class="chart-container">
            <canvas id="salesChart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Vendas por Categoria</div></div>
          <div class="chart-container">
            <canvas id="categoryChart"></canvas>
          </div>
        </div>
      </div>

      <div class="cards-row cols2">
        <div class="card">
          <div class="card-header"><div class="card-title">Top 5 Produtos Mais Vendidos</div></div>
          <div class="chart-container">
            <canvas id="topProductsChart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Ranking Detalhado</div></div>
          <div class="table-wrap">
            <table id="topProductsTable">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Qtd Vendida</th>
                </tr>
              </thead>
              <tbody>
                <!-- Preenchido via JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => initCharts(), 50);
}

function initCharts() {
  const salesCanvas = document.getElementById("salesChart");
  const categoryCanvas = document.getElementById("categoryChart");
  const topProductsCanvas = document.getElementById("topProductsChart");
  if (!salesCanvas || !categoryCanvas || !topProductsCanvas) return;

  // Dados para evolução de vendas
  const labels7 = [];
  const sales7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    labels7.push(ds.split("-").reverse().slice(0, 2).join("/"));
    const totalDia = currentVendas
      .filter((v) => v.data === ds)
      .reduce((sum, v) => sum + (v.total || 0), 0);
    sales7.push(totalDia);
  }

  // Vendas por categoria e Top Produtos
  const catStats = {};
  const productStats = {};
  currentVendas.forEach((v) => {
    (v.produtos || []).forEach((vp) => {
      // Categoria
      const p = currentProdutos.find((cp) => cp.nome === vp.nome);
      const cat = p ? p.cat : "Outros";
      catStats[cat] = (catStats[cat] || 0) + (vp.qty || 0);

      // Produto
      productStats[vp.nome] = (productStats[vp.nome] || 0) + (vp.qty || 0);
    });
  });

  const catLabels = Object.keys(catStats);
  const catValues = Object.values(catStats);

  // Top 5 Produtos
  const topProductsSorted = Object.entries(productStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const topProdLabels = topProductsSorted.map(x => x[0]);
  const topProdValues = topProductsSorted.map(x => x[1]);

  // Preencher tabela de ranking
  const tableBody = document.querySelector("#topProductsTable tbody");
  if (tableBody) {
    tableBody.innerHTML = topProductsSorted.map(([nome, qty]) => {
      const p = currentProdutos.find(cp => cp.nome === nome);
      const cat = p ? p.cat : "—";
      return `<tr><td>${nome}</td><td><span class="tag">${cat}</span></td><td><strong>${qty}</strong></td></tr>`;
    }).join("");
  }

  if (window.Chart) {
    if (window.STATE.charts.sales) window.STATE.charts.sales.destroy();
    if (window.STATE.charts.category) window.STATE.charts.category.destroy();
    if (window.STATE.charts.top) window.STATE.charts.top.destroy();

    window.STATE.charts.sales = new Chart(salesCanvas, {
      type: "line",
      data: {
        labels: labels7,
        datasets: [
          {
            label: "Vendas (MT)",
            data: sales7,
            borderColor: "#00d4aa",
            backgroundColor: "rgba(0, 212, 170, 0.1)",
            tension: 0.4,
            fill: true,
            pointBackgroundColor: "#00d4aa",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { 
            beginAtZero: true, 
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8fa3c0" }
          },
          x: { 
            grid: { display: false },
            ticks: { color: "#8fa3c0" }
          },
        },
      },
    });

    window.STATE.charts.category = new Chart(categoryCanvas, {
      type: "doughnut",
      data: {
        labels: catLabels,
        datasets: [
          {
            data: catValues,
            backgroundColor: ["#00d4aa", "#0096ff", "#ffb142", "#ff4757", "#a55eea", "#ff6b35", "#4a6080"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#8fa3c0", padding: 20, font: { size: 11 } },
          },
        },
        cutout: "70%",
      },
    });

    window.STATE.charts.top = new Chart(topProductsCanvas, {
      type: "bar",
      data: {
        labels: topProdLabels,
        datasets: [
          {
            label: "Quantidade Vendida",
            data: topProdValues,
            backgroundColor: "#0096ff",
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8fa3c0" }
          },
          y: { 
            grid: { display: false },
            ticks: { color: "#8fa3c0" }
          },
        },
      },
    });
  }
}

window.printReport = function () {
  window.print();
};

export async function renderReservasG(el) {
  await refreshReservas();

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-clipboard" style="margin-right:8px"></i> Reservas</div>
      <div class="page-sub">Gestão e controlo de reservas de clientes</div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Todas as Reservas</div></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Data</th>
              <th>Vendedor</th>
              <th>Status</th>
              <th>Acções</th>
            </tr>
          </thead>
          <tbody>
            ${currentReservas.map((r) => `
              <tr>
                <td><strong>${escapeHtml(r.titular)}</strong><br/><small style="color:var(--text2)">BI: ${escapeHtml(r.bi || "—")}</small></td>
                <td>${escapeHtml(r.produto_nome)}</td>
                <td>${r.quantidade}</td>
                <td>${String(r.criado_em).split(" ")[0]}</td>
                <td>${escapeHtml(r.usuario_nome)}</td>
                <td><span class="badge ${r.status === "Activa" ? "blue" : r.status === "Levantada" ? "green" : "red"}">${r.status}</span></td>
                <td class="table-actions">
                  ${r.status === "Activa" ? `
                    <button class="btn btn-sm btn-green" onclick="window.alterarStatusReservaGWrapper(${r.id}, 'Levantada')" title="Marcar como Levantada">
                      <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-red" onclick="window.alterarStatusReservaGWrapper(${r.id}, 'Cancelada')" title="Cancelar Reserva">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  ` : "—"}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.alterarStatusReservaGWrapper = async function (id, status) {
  const doUpdate = async () => {
    try {
      await window.api.atualizarStatusReserva(id, status);
      
      // Se cancelado, stock mudou no backend
      if (status === 'Cancelada' && window.api?.getProdutos) {
         const p = await window.api.getProdutos();
         if (setProdutosCallback) setProdutosCallback(p);
      }
      
      const ca = document.getElementById("content-area");
      if (ca) renderReservasG(ca);
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

export async function renderDefinicoes(el) {
  let empresa = {};
  try {
    if (window.api?.getEmpresa) {
      empresa = await window.api.getEmpresa();
    }
  } catch (err) {
    console.error("Erro ao carregar dados da empresa:", err);
  }

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-gear" style="margin-right:8px"></i> Definições</div>
      <div class="page-sub">Configurações da empresa e preferências do sistema</div>
    </div>

    <div class="cards-row cols2" style="align-items: start;">
      <!-- DADOS DA EMPRESA -->
      <div class="card">
        <div class="card-header"><div class="card-title">${t("company_data")}</div></div>
        <div class="form-row">
          <div class="field"><label>${t("company_name")}</label><input id="conf-emp-nome" value="${escapeAttr(empresa.nome || "")}"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>CNPJ / NUIT</label><input id="conf-emp-cnpj" value="${escapeAttr(empresa.cnpj || "")}"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>${t("address")}</label><input id="conf-emp-end" value="${escapeAttr(empresa.endereco || "")}"/></div>
        </div>
        <div class="form-row cols2">
          <div class="field"><label>${t("phone")}</label><input id="conf-emp-tel" value="${escapeAttr(empresa.telefone || "")}"/></div>
          <div class="field"><label>${t("email")}</label><input id="conf-emp-email" value="${escapeAttr(empresa.email || "")}"/></div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>${t("company_photo")}</label>
            <div style="display: flex; gap: 10px; align-items: center;">
              <input type="text" id="conf-emp-bg" value="${escapeAttr(empresa.background_image || "")}" placeholder="URL ou Base64" style="flex: 1;"/>
              <button class="btn btn-sm" onclick="document.getElementById('conf-emp-bg-file').click()"><i class="fa-solid fa-image"></i></button>
              <input type="file" id="conf-emp-bg-file" style="display: none;" accept="image/*" onchange="window.handleBgFileChange(this)"/>
            </div>
            <div id="conf-emp-bg-preview" style="margin-top: 10px; width: 100%; height: 60px; border-radius: 8px; background: ${empresa.background_image ? `url(${empresa.background_image})` : "var(--bg3)"}; background-size: cover; background-position: center; border: 1px dashed var(--border);"></div>
          </div>
        </div>
        <div style="margin-top: 20px;">
          <button class="btn btn-green" onclick="window.salvarDadosEmpresaWrapper()"><i class="fa-solid fa-save"></i> ${t("save")}</button>
        </div>
      </div>

      <div style="display: grid; gap: 20px;">
        <!-- SEGURANÇA / PERFIL -->
        <div class="card">
          <div class="card-header"><div class="card-title">${t("security")}</div></div>
          <div class="page-sub" style="margin-bottom: 15px;">Alterar a sua senha de acesso</div>
          <div class="form-row">
            <div class="field"><label>${t("password_old")}</label><input type="password" id="conf-pass-old" placeholder="••••••"/></div>
          </div>
          <div class="form-row">
            <div class="field"><label>${t("password_new")}</label><input type="password" id="conf-pass-new" placeholder="••••••"/></div>
          </div>
          <div style="margin-top: 15px;">
            <button class="btn btn-blue" onclick="window.alterarMinhaSenhaWrapper()"><i class="fa-solid fa-key"></i> ${t("update_password")}</button>
          </div>
        </div>

        <!-- PREFERÊNCIAS -->
        <div class="card">
          <div class="card-header"><div class="card-title">${t("preferencias") || "Preferências do Sistema"}</div></div>
          <div class="field">
            <label>${t("theme")}</label>
            <select id="conf-pref-theme">
              <option value="escuro" ${localStorage.getItem("biz_theme") !== "claro" ? "selected" : ""}>${t("dark")}</option>
              <option value="claro" ${localStorage.getItem("biz_theme") === "claro" ? "selected" : ""}>${t("light")}</option>
            </select>
          </div>
          <div class="field" style="margin-top: 15px;">
            <label>${t("language")}</label>
            <select id="conf-pref-lang">
              <option value="pt" ${getLanguage() === "pt" ? "selected" : ""}>Português (MZ)</option>
              <option value="en" ${getLanguage() === "en" ? "selected" : ""}>English</option>
            </select>
          </div>
          <div style="margin-top: 20px;">
            <button class="btn" onclick="window.aplicarPreferenciasWrapper()">${t("apply")}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.aplicarPreferenciasWrapper = function() {
  const theme = document.getElementById("conf-pref-theme").value;
  const lang = document.getElementById("conf-pref-lang").value;

  applyTheme(theme);
  setLanguage(lang);

  showNotification(t("success_pref"), "success");
  
  // Recarregar a página após um curto delay para aplicar idioma em todo o lado
  setTimeout(() => {
    window.location.reload();
  }, 1000);
};

window.handleBgFileChange = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    document.getElementById("conf-emp-bg").value = base64;
    document.getElementById("conf-emp-bg-preview").style.backgroundImage = `url(${base64})`;
  };
  reader.readAsDataURL(file);
};

window.salvarDadosEmpresaWrapper = async function() {
  const dados = {
    nome: document.getElementById("conf-emp-nome").value.trim(),
    cnpj: document.getElementById("conf-emp-cnpj").value.trim(),
    endereco: document.getElementById("conf-emp-end").value.trim(),
    telefone: document.getElementById("conf-emp-tel").value.trim(),
    email: document.getElementById("conf-emp-email").value.trim(),
    background_image: document.getElementById("conf-emp-bg").value.trim(),
  };

  if (!dados.nome) return showNotification("O nome da empresa é obrigatório.", "warning");

  try {
    await window.api.atualizarEmpresa(dados);
    showNotification("Dados da empresa atualizados com sucesso!", "success");
    
    // Atualizar fundo se necessário
    if (typeof window.applySystemBackground === "function") {
      window.applySystemBackground(dados.background_image);
    }

    const topName = document.getElementById("topbar-company");
    if (topName) topName.textContent = dados.nome;
  } catch (err) {
    showNotification("Erro ao atualizar empresa: " + err.message, "error");
  }
};

window.alterarMinhaSenhaWrapper = async function() {
  const senhaAtual = document.getElementById("conf-pass-old").value;
  const novaSenha = document.getElementById("conf-pass-new").value;

  if (!senhaAtual || !novaSenha) return showNotification("Preencha as duas senhas.", "warning");
  if (novaSenha.length < 4) return showNotification("A nova senha deve ter pelo menos 4 caracteres.", "warning");

  try {
    await window.api.atualizarMinhaSenha(senhaAtual, novaSenha);
    showNotification("Senha alterada com sucesso!", "success");
    document.getElementById("conf-pass-old").value = "";
    document.getElementById("conf-pass-new").value = "";
  } catch (err) {
    showNotification("Erro ao alterar senha: " + err.message, "error");
  }
};
