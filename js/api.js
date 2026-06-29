// API Wrapper para comunicação com backend
// Este ficheiro abstrai a comunicação HTTP e IPC

class APIClient {
  constructor() {
    this.token = localStorage.getItem("auth_token");
    this.baseURL = window.electronAPI ? "http://127.0.0.1:3000/api" : "/api";
    this.isElectron = !!window.electronAPI;
  }

  // Definir token após login
  setToken(token) {
    this.token = token;
    localStorage.setItem("auth_token", token);
  }

  // Limpar token após logout
  clearToken() {
    this.token = null;
    localStorage.removeItem("auth_token");
  }

  // Método genérico de requisição
  async request(method, endpoint, data = null) {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (this.token) {
        options.headers.Authorization = `Bearer ${this.token}`;
      }

      if (data) {
        options.body = JSON.stringify(data);
      }

      const url = `${this.baseURL}${endpoint}`;

      let response;
      if (this.isElectron && window.electronAPI) {
        // Usar IPC quando em Electron
        response = await window.electronAPI.request(method, endpoint, data);
        
        // Se o IPC retornar um objeto com erro, lançar como exceção
        if (response && response.error) {
          throw new Error(response.error);
        }
      } else {
        // Usar fetch direto no browser
        response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Erro na requisição");
        }

        return result;
      }

      return response;
    } catch (error) {
      console.error(`[API] Erro em ${method} ${endpoint}:`, error);
      throw error;
    }
  }

  // Métodos alias convenientes
  get(endpoint) {
    return this.request("GET", endpoint);
  }

  post(endpoint, data) {
    return this.request("POST", endpoint, data);
  }

  put(endpoint, data) {
    return this.request("PUT", endpoint, data);
  }

  delete(endpoint) {
    return this.request("DELETE", endpoint);
  }

  // ===== AUTENTICAÇÃO =====
  async login(email, senha) {
    const isOnline = navigator.onLine;
    const result = await this.post("/auth/login", { email, senha, isOnline });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  logout() {
    this.clearToken();
  }

  // ===== CATEGORIAS =====
  async getCategorias() {
    return this.get("/categorias");
  }

  async addCategoria(dados) {
    return this.post("/categorias", dados);
  }

  // ===== PRODUTOS =====
  async getProdutos() {
    return this.get("/produtos");
  }

  async addProduto(produto) {
    return this.post("/produtos", produto);
  }

  async atualizarProduto(id, dados) {
    return this.put(`/produtos/${id}`, dados);
  }

  async deleteProduto(id) {
    return this.delete(`/produtos/${id}`);
  }

  // ===== VENDAS =====
  async registarVenda(dados) {
    return this.post("/vendas", dados);
  }

  async getVendas() {
    return this.get("/vendas");
  }

  async atualizarPagamentoVenda(id, dados) {
    return this.put(`/vendas/${id}/pagamento`, dados);
  }

  // ===== MOVIMENTAÇÕES DE STOCK =====
  async addMovimento(dados) {
    return this.post("/movimentacoes", dados);
  }

  async getMovimentos() {
    return this.get("/movimentacoes");
  }

  // ===== RESERVAS =====
  async addReserva(dados) {
    return this.post("/reservas", dados);
  }

  async getReservas() {
    return this.get("/reservas");
  }

  // ===== DASHBOARD =====
  async getDashboardStats() {
    return this.get("/dashboard/stats");
  }

  // ===== SUPER ADMIN (STATS) =====
  async getSuperStats() {
    return this.get("/super/stats");
  }

  // ===== SUPER ADMIN (EMPRESAS) =====
  async getSuperEmpresas() {
    return this.get("/super/empresas");
  }

  async addSuperEmpresa(dados) {
    return this.post("/super/empresas", dados);
  }

  async createFullCompany(dados) {
    return this.post("/super/empresas/completo", dados);
  }

  async updateSuperEmpresa(id, dados) {
    return this.put(`/super/empresas/${id}`, dados);
  }

  // ===== USUÁRIOS =====
  async getUsuarios() {
    return this.get("/usuarios");
  }

  async addUsuario(dados) {
    return this.post("/usuarios", dados);
  }

  async updateUsuario(id, dados) {
    return this.put(`/usuarios/${id}`, dados);
  }

  async deleteUsuario(id) {
    return this.delete(`/usuarios/${id}`);
  }

  // ===== LICENCIAMENTO =====
  async activateLicense(license_key, company_name, phone) {
    return this.post("/activate", { license_key, company_name, phone });
  }

  async validateLicense(license_key, version = "1.0.0") {
    return this.post("/validate", { license_key, version });
  }

  async getLicenseStatus() {
    return this.get("/license/status");
  }

  // ===== SUPER ADMIN (LICENÇAS) =====
  async getSuperLicenses() {
    return this.get("/super/licenses");
  }

  async blockLicenseRemote(license_key, status = "blocked") {
    return this.post("/block", { license_key, status, api_key: "chave_mestra_bizcontrol" }); // No mundo real, a chave estaria protegida
  }
}

// Instância global
export const api = new APIClient();
