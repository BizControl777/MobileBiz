// Dados da aplicação — listas vazias por defeito; dados reais vêm da API / IndexedDB

export const CATEGORIAS = [
  "Bebidas",
  "Alimentos",
  "Higiene",
  "Electrónica",
  "Vestuário",
  "Ferramentas",
  "Outros",
];

export let PRODUTOS = [];
export let VENDAS = [];
export let RESERVAS = [];
export let VENDEDORES = [];
export const COMPANIES = [];
export const USERS = {};

export function addVenda(venda) {
  VENDAS.unshift(venda);
}

export function addProduto(produto) {
  PRODUTOS.push(produto);
}

export function updateProdutoStock(id, quantidade) {
  const p = PRODUTOS.find((x) => x.id === id);
  if (p) p.stock += quantidade;
}

export function removeProduto(id) {
  PRODUTOS = PRODUTOS.filter((p) => p.id !== id);
}

export function addReserva(reserva) {
  RESERVAS.push(reserva);
}

export function updateReservaStatus(id, status) {
  const r = RESERVAS.find((x) => x.id === id);
  if (r) r.status = status;
}
