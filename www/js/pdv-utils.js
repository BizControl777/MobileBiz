/**
 * Utilitários partilhados pelo PDV / carrinho.
 */

export function normalizeId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : id;
}

export function findProduto(produtos, id) {
  const pid = normalizeId(id);
  return produtos.find((p) => normalizeId(p.id) === pid);
}

/** Garante campos mínimos para exibição e venda no PDV. */
export function normalizeProdutoPDV(p) {
  if (!p) return null;
  const preco = Number(p.preco ?? p.preco_venda ?? 0);
  const preco_custo = Number(p.preco_custo ?? p.custo ?? 0);
  return {
    ...p,
    id: normalizeId(p.id),
    nome: String(p.nome || p.name || "Produto").trim() || "Produto",
    tipo_produto: p.tipo_produto || "Unidade",
    unidade_medida: p.unidade_medida || "Unidade",
    preco: Number.isFinite(preco) ? preco : 0,
    preco_custo: Number.isFinite(preco_custo) ? preco_custo : 0,
    stock: Math.max(0, Number(p.stock) || 0),
    stockMin: Number(p.stockMin ?? p.stock_minimo ?? 10),
    cat: p.cat || p.categoria || p.categoria_nome || "Outros",
    categoria: p.categoria || p.cat || p.categoria_nome || "Outros",
    icon: p.icon || "<i class='fa-solid fa-box'></i>",
    codigo_barras: String(p.codigo_barras || p.barcode || p.sku || "").trim(),
  };
}

export function buildCartItem(produto) {
  const p = normalizeProdutoPDV(produto);
  return {
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    custo: p.preco_custo,
    qty: 1,
    desconto: 0,
    icon: p.icon,
    stockMax: p.stock,
    codigo_barras: p.codigo_barras,
  };
}

export function cartTotals(cart, descontoVenda = 0) {
  const items = Array.isArray(cart) ? cart : [];
  const subtotal = items.reduce((s, c) => s + (Number(c.preco) || 0) * (Number(c.qty) || 0), 0);
  const descontoItens = items.reduce((s, c) => {
    const bruto = (Number(c.preco) || 0) * (Number(c.qty) || 0);
    const desconto = Math.min(Math.max(0, Number(c.desconto) || 0), bruto);
    return s + desconto;
  }, 0);
  const maxDescontoVenda = Math.max(0, subtotal - descontoItens);
  const descontoTotalVenda = Math.min(Math.max(0, Number(descontoVenda) || 0), maxDescontoVenda);
  const qtyTotal = items.reduce((s, c) => s + (Number(c.qty) || 0), 0);
  const custoTotal = items.reduce((s, c) => s + (Number(c.custo) || 0) * (Number(c.qty) || 0), 0);
  const total = Math.max(0, subtotal - descontoItens - descontoTotalVenda);
  const lucro = total - custoTotal;
  const margemPercent = total > 0 ? ((total - custoTotal) / total) * 100 : (custoTotal > 0 ? -100 : 0);
  const linhas = items.map((c) => {
    const bruto = (Number(c.preco) || 0) * (Number(c.qty) || 0);
    const desconto = Math.min(Math.max(0, Number(c.desconto) || 0), bruto);
    return {
      ...c,
      subtotal: bruto,
      desconto,
      total: Math.max(0, bruto - desconto),
    };
  });
  return {
    subtotal,
    descontoItens,
    descontoVenda: descontoTotalVenda,
    descontoTotal: descontoItens + descontoTotalVenda,
    qtyTotal,
    custoTotal,
    lucro,
    margemPercent,
    total,
    linhas,
  };
}

export function matchesProdutoQuery(produto, query) {
  const p = normalizeProdutoPDV(produto);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [p.nome, p.cat, p.categoria, p.marca, p.codigo_barras, p.id]
    .filter((v) => v != null && v !== "")
    .some((v) => String(v).toLowerCase().includes(q));
}

export function findProdutoByBarcode(produtos, code) {
  const c = String(code || "").trim();
  if (!c) return null;
  return (
    produtos.find((p) => String(p.codigo_barras || p.barcode || p.sku || "").trim() === c) ||
    produtos.find((p) => String(p.id) === c) ||
    null
  );
}
