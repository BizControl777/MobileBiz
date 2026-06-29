// Dados da aplicação

export const CATEGORIAS = [
  "Bebidas",
  "Alimentos",
  "Higiene",
  "Electrónica",
  "Vestuário",
  "Ferramentas",
  "Outros"
];

export let PRODUTOS = [
  {
    id: 1,
    nome: "Coca-Cola 330ml",
    cat: "Bebidas",
    preco: 50,
    custo: 30,
    stock: 80,
    stockMin: 20,
    icon: "<i class='fa-solid fa-bottle-water'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 2,
    nome: "Pão Baguete",
    cat: "Alimentos",
    preco: 25,
    custo: 12,
    stock: 5,
    stockMin: 10,
    icon: "<i class='fa-solid fa-bread-slice'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 3,
    nome: "Sabão Omo 500g",
    cat: "Higiene",
    preco: 180,
    custo: 120,
    stock: 30,
    stockMin: 10,
    icon: "<i class='fa-solid fa-soap'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 4,
    nome: "Arroz 1kg",
    cat: "Alimentos",
    preco: 95,
    custo: 60,
    stock: 0,
    stockMin: 15,
    icon: "<i class='fa-solid fa-wheat'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 5,
    nome: "Água 1.5L",
    cat: "Bebidas",
    preco: 30,
    custo: 15,
    stock: 120,
    stockMin: 30,
    icon: "<i class='fa-solid fa-droplet'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 6,
    nome: "Fanta 330ml",
    cat: "Bebidas",
    preco: 50,
    custo: 30,
    stock: 60,
    stockMin: 20,
    icon: "<i class='fa-solid fa-bottle-water'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 7,
    nome: "Detergente AZ",
    cat: "Higiene",
    preco: 75,
    custo: 45,
    stock: 8,
    stockMin: 10,
    icon: "<i class='fa-solid fa-soap'></i>",
    image: "",
    ativo: true,
  },
  {
    id: 8,
    nome: "Pilhas AA (par)",
    cat: "Electrónica",
    preco: 120,
    custo: 70,
    stock: 25,
    stockMin: 10,
    icon: "<i class='fa-solid fa-battery-full'></i>",
    image: "",
    ativo: true,
  },
];

export let VENDAS = [
  {
    id: 1,
    data: "2026-05-04",
    vendedor: "Ana Machava",
    produtos: [
      { nome: "Coca-Cola 330ml", qty: 3, preco: 50 },
      { nome: "Água 1.5L", qty: 2, preco: 30 },
    ],
    total: 210,
    lucro: 90,
  },
  {
    id: 2,
    data: "2026-05-04",
    vendedor: "Ana Machava",
    produtos: [{ nome: "Sabão Omo 500g", qty: 1, preco: 180 }],
    total: 180,
    lucro: 60,
  },
  {
    id: 3,
    data: "2026-05-03",
    vendedor: "Pedro Juma",
    produtos: [{ nome: "Pão Baguete", qty: 5, preco: 25 }],
    total: 125,
    lucro: 65,
  },
  {
    id: 4,
    data: "2026-05-03",
    vendedor: "Ana Machava",
    produtos: [{ nome: "Fanta 330ml", qty: 4, preco: 50 }],
    total: 200,
    lucro: 80,
  },
  {
    id: 5,
    data: "2026-05-02",
    vendedor: "Pedro Juma",
    produtos: [
      { nome: "Arroz 1kg", qty: 2, preco: 95 },
      { nome: "Água 1.5L", qty: 3, preco: 30 },
    ],
    total: 280,
    lucro: 100,
  },
];

export let RESERVAS = [
  {
    id: 1,
    titular: "João Mário",
    bi: "12345678A",
    data: "2026-05-03",
    produtos: [{ nome: "Coca-Cola 330ml", qty: 6 }],
    status: "Activa",
  },
  {
    id: 2,
    titular: "Maria Fátima",
    bi: "87654321B",
    data: "2026-05-01",
    produtos: [{ nome: "Sabão Omo 500g", qty: 2 }],
    status: "Levantada",
  },
];

export let VENDEDORES = [
  { id: 1, nome: "Ana Machava", user: "vendedor1", activo: true, vendas: 12 },
  { id: 2, nome: "Pedro Juma", user: "vendedor2", activo: true, vendas: 8 },
];

export const COMPANIES = [
  {
    id: 1,
    name: "Loja Central Maputo",
    plan: "Anual",
    active: true,
    vendedores: 3,
    expires: "2026-12-31",
  },
  {
    id: 2,
    name: "MercadoPlus Beira",
    plan: "Mensal",
    active: true,
    vendedores: 5,
    expires: "2026-05-30",
  },
  {
    id: 3,
    name: "TechStore Nampula",
    plan: "Mensal",
    active: false,
    vendedores: 2,
    expires: "2026-04-01",
  },
];

export const USERS = {
  vendedor1: {
    pass: "1234",
    role: "vendedor",
    name: "Ana Machava",
    company: "Loja Central Maputo",
  },
  gestor1: {
    pass: "1234",
    role: "gestor",
    name: "Carlos Tembe",
    company: "Loja Central Maputo",
  },
  super: {
    pass: "1234",
    role: "super",
    name: "Super Admin",
    company: "BizController",
  },
};

// Funções auxiliares para dados
export function addVenda(venda) {
  VENDAS.unshift(venda);
}

export function addProduto(produto) {
  PRODUTOS.push(produto);
}

export function updateProdutoStock(id, quantidade) {
  const p = PRODUTOS.find(x => x.id === id);
  if (p) p.stock += quantidade;
}

export function removeProduto(id) {
  PRODUTOS = PRODUTOS.filter(p => p.id !== id);
}

export function addReserva(reserva) {
  RESERVAS.push(reserva);
}

export function updateReservaStatus(id, status) {
  const r = RESERVAS.find(x => x.id === id);
  if (r) r.status = status;
}