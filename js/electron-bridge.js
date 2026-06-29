/**
 * Liga `window.electronAPI` (preload) a `window.api` esperado por `app.js` e páginas.
 */

function unwrap(result) {
  if (result && typeof result === "object" && result.error != null && result.error !== "") {
    const msg = String(result.error);
    if (msg.includes("Token inválido") || msg.includes("Token não fornecido") || msg.includes("Erro HTTP 401")) {
      console.warn("Sessão expirada ou inválida. Redirecionando para login...");
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("biz_user");
        if (typeof window.logout === "function") {
          window.logout();
        } else {
          window.location.reload();
        }
      }
    }
    throw new Error(msg);
  }
  return result;
}

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

export function initElectronApiBridge() {
  if (typeof window === "undefined" || !window.electronAPI) {
    return false;
  }

  const e = window.electronAPI;

  window.api = {
    async authLogin({ email, password }) {
      const isOnline = navigator.onLine;
      return loginWithElectronApi(email, password, isOnline);
    },

    async getProdutos() {
      const rows = unwrap(await e.get("/produtos"));
      return Array.isArray(rows) ? rows.map(mapProdutoRow) : [];
    },

    async getCategorias() {
      const rows = unwrap(await e.get("/categorias"));
      return Array.isArray(rows) ? rows : [];
    },

    async addCategoria({ nome }) {
      return unwrap(await e.post("/categorias", { nome }));
    },

    async getMovimentos() {
      const rows = unwrap(await e.get("/movimentacoes"));
      return Array.isArray(rows) ? rows : [];
    },

    async getVendas() {
      const rows = unwrap(await e.get("/vendas"));
      return Array.isArray(rows) ? rows : [];
    },

    async addProduto(produto) {
      return unwrap(await e.post("/produtos", produto));
    },

    async atualizarProduto(id, dados) {
      return unwrap(await e.put(`/produtos/${id}`, dados));
    },

    async deleteProduto({ id }) {
      return unwrap(await e.delete(`/produtos/${id}`));
    },

    async addMovimento(movimento) {
      return unwrap(await e.post("/movimentacoes", movimento));
    },

    async registarVenda(venda) {
      return unwrap(await e.post("/vendas", venda));
    },

    async atualizarPagamentoVenda(id, dados) {
      return unwrap(await e.put(`/vendas/${id}/pagamento`, dados));
    },

    // ===== USUÁRIOS =====
    async getUsuarios() {
      const rows = unwrap(await e.get("/usuarios"));
      return Array.isArray(rows) ? rows : [];
    },

    async addUsuario(dados) {
      return unwrap(await e.post("/usuarios", dados));
    },

    async updateUsuario(id, dados) {
      return unwrap(await e.put(`/usuarios/${id}`, dados));
    },

    async deleteUsuario(id) {
      return unwrap(await e.delete(`/usuarios/${id}`));
    },

    // ===== RESERVAS =====
    async getReservas() {
      const rows = unwrap(await e.get("/reservas"));
      return Array.isArray(rows) ? rows : [];
    },

    async addReserva(dados) {
      return unwrap(await e.post("/reservas", dados));
    },

    async atualizarStatusReserva(id, status) {
      return unwrap(await e.put(`/reservas/${id}/status`, { status }));
    },

    // ===== CONFIGURAÇÕES / EMPRESA =====
    async getEmpresa() {
      return unwrap(await e.get("/empresa"));
    },

    async atualizarEmpresa(dados) {
      return unwrap(await e.put("/empresa", dados));
    },

    async atualizarMinhaSenha(senhaAtual, novaSenha) {
      return unwrap(await e.put("/usuarios/me/senha", { senhaAtual, novaSenha }));
    },

    // ===== CAIXA =====
    async getCaixaAtual() {
      return unwrap(await e.get("/caixas/atual"));
    },

    async abrirCaixa(valorInicial) {
      return unwrap(await e.post("/caixas/abrir", { valor_inicial: valorInicial }));
    },

    async reabrirCaixa(id) {
      return unwrap(await e.post("/caixas/reabrir", { id }));
    },

    async fecharCaixa(id, valorFechamento, observacoes) {
      return unwrap(await e.post("/caixas/fechar", { id, valor_fechamento: valorFechamento, observacoes }));
    },

    async getHistoricoCaixas() {
      const rows = unwrap(await e.get("/caixas/historico"));
      return Array.isArray(rows) ? rows : [];
    },

    // ===== FINANCEIRO =====
    async getFinanceiro() {
      const rows = unwrap(await e.get("/financeiro"));
      return Array.isArray(rows) ? rows : [];
    },

    async addFinanceiro(dados) {
      return unwrap(await e.post("/financeiro", dados));
    },

    // ===== SUPER ADMIN =====
    async getSuperStats() {
      return unwrap(await e.get("/super/stats"));
    },

    async getSuperEmpresas() {
      return unwrap(await e.get("/super/empresas"));
    },

    async createFullCompany(dados) {
      return unwrap(await e.post("/super/empresas/completo", dados));
    },

    async updateSuperEmpresa(id, dados) {
      return unwrap(await e.put(`/super/empresas/${id}`, dados));
    },

    async getSuperLicenses() {
      return unwrap(await e.get("/super/licenses"));
    },

    async blockLicenseRemote(license_key, status) {
      return unwrap(await e.post("/block", { license_key, status, api_key: "chave_mestra_bizcontrol" }));
    },

    // ===== LICENCIAMENTO =====
    async getLicenseStatus() {
      return unwrap(await e.get("/license/status"));
    },

    async activateLicense(license_key, company_name, phone) {
      return unwrap(await e.post("/activate", { license_key, company_name, phone }));
    },

    async validateLicense(license_key, version = "1.0.0") {
      return unwrap(await e.post("/validate", { license_key, version }));
    },
  };
  return true;
}

/** Login directo pelo preload (fallback se `window.api` não foi montado). */
export async function loginWithElectronApi(email, senha, isOnline = navigator.onLine) {
  if (typeof window === "undefined" || !window.electronAPI?.post) {
    throw new Error("API Electron indisponível. Abra a app com: npm start");
  }
  const data = unwrap(await window.electronAPI.post("/auth/login", { email, senha, isOnline }));
  if (data.token) localStorage.setItem("auth_token", data.token);
  if (!data.user) throw new Error("Resposta de login inválida.");
  return data.user;
}
