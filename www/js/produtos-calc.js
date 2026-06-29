import { round2 } from "./utils.js";

/**
 * Sistema de Unidades e Fatores de Conversão
 * 1 kg = 1000 g
 * 1 litro = 1000 ml
 * 1 caixa = fator (ex: 24 unidades)
 */
export const UNIDADES = {
  UNIDADE: "unidade",
  KG: "kg",
  G: "g",
  LITRO: "litro",
  ML: "ml",
  METRO: "metro",
  CAIXA: "caixa",
  PACOTE: "pacote"
};

export const TIPOS_PRODUTO = UNIDADES;

export const UNIDADES_MEDIDA = [
  "unidade",
  "kg",
  "g",
  "litro",
  "ml",
  "metro",
  "caixa",
  "pacote",
  "outros",
];

export function safeNum(value, fallback = 0) {
  const n = parseFloat(value);
  return isFinite(n) ? n : fallback;
}

/**
 * Calcula o custo unitário base.
 * Se comprou 100kg por 40000, custo unitário = 400/kg.
 * Se comprou 10 caixas (24un cada) por 24000, custo unitário = 100/unidade.
 */
export function calcularCustoUnitario(params) {
  const { precoCompra, qtdCompra, qtdPorCaixa, unidade } = params;
  const pCompra = safeNum(precoCompra);
  const qCompra = Math.max(0.0001, safeNum(qtdCompra, 1));
  const fator = Math.max(1, safeNum(qtdPorCaixa, 1));

  if (unidade === UNIDADES.CAIXA) {
    // Se comprou 10 caixas, o custo total é pCompra
    // Qtd total de unidades = 10 * fator
    return pCompra / (qCompra * fator);
  }

  // Para kg, litro, unidade, etc.
  return pCompra / qCompra;
}

/**
 * Calcula métricas de venda e lucro.
 * NÃO bloqueia venda se precoVenda < custoUnitario.
 */
export function calcularMetricasVenda(params) {
  const {
    custoUnitario,
    precoVenda,
    quantidade = 1
  } = params;

  const custoU = safeNum(custoUnitario);
  const vendaU = safeNum(precoVenda);
  const qtd = safeNum(quantidade, 1);

  const lucroUnitario = vendaU - custoU;
  const lucroTotal = lucroUnitario * qtd;
  const margemPercent = vendaU > 0 ? (lucroUnitario / vendaU) * 100 : (custoU > 0 ? -100 : 0);
  
  const temPrejuizo = lucroUnitario < 0;

  return {
    custoUnitario: round2(custoU),
    precoVenda: round2(vendaU),
    lucroUnitario: round2(lucroUnitario),
    lucroTotal: round2(lucroTotal),
    margemPercent: Math.round(margemPercent * 100) / 100,
    temPrejuizo,
    status: temPrejuizo ? "prejuizo" : "lucro",
    mensagem: temPrejuizo ? "Venda abaixo do custo (prejuízo)" : "Venda lucrativa"
  };
}

/**
 * Legado para manter compatibilidade enquanto refatoramos o resto do sistema.
 */
export function calcularLucro(params) {
  const {
    tipo,
    qtdEstoque,
    precoCompra,
    precoVenda,
    qtdPorCaixa
  } = params;

  // Adaptar para a nova lógica
  const custoU = calcularCustoUnitario({
    precoCompra,
    qtdCompra: tipo === UNIDADES.CAIXA ? safeNum(qtdEstoque) : safeNum(qtdEstoque),
    qtdPorCaixa,
    unidade: tipo
  });

  const metricas = calcularMetricasVenda({
    custoUnitario: custoU,
    precoVenda: precoVenda,
    quantidade: safeNum(qtdEstoque)
  });

  return {
    custoUnitario: metricas.custoUnitario,
    lucroUnitario: metricas.lucroUnitario,
    lucroTotalEstoque: metricas.lucroTotal,
    lucroPorCaixa: metricas.lucroUnitario * safeNum(qtdPorCaixa, 1),
    margemPercent: metricas.margemPercent,
    temPrejuizo: metricas.temPrejuizo
  };
}

export function getTipoByUnidade(unidade) {
  const u = String(unidade || "").toLowerCase();
  if ([UNIDADES.KG, UNIDADES.G, UNIDADES.LITRO, UNIDADES.ML, UNIDADES.METRO].includes(u)) return u;
  if (u === UNIDADES.CAIXA) return UNIDADES.CAIXA;
  return UNIDADES.UNIDADE;
}

export function getExpirationStatus(dateStr) {
  if (!dateStr) return { color: "green", days: 999, text: "Sem validade" };
  const val = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  val.setHours(0, 0, 0, 0);

  const diffTime = val - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { color: "red", days: diffDays, text: "Produto vencido" };
  if (diffDays <= 30) return { color: "amber", days: diffDays, text: "Próximo da validade" };
  return { color: "green", days: diffDays, text: "Dentro do prazo" };
}

export function getExpirationBadge(dateStr) {
  const status = getExpirationStatus(dateStr);
  if (!dateStr) return "";
  const icon = status.color === "red" ? "fa-circle-xmark" : status.color === "amber" ? "fa-triangle-exclamation" : "fa-circle-check";
  return `<span class="badge ${status.color}"><i class="fa-solid ${icon}"></i> ${status.text} (${status.days}d)</span>`;
}

