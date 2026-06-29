import { fmt } from "../utils.js";
import { showModal, closeModal, showNotification, showConfirmModal } from "./helpers.js";

let STATE_charts = {};
let currentLicenses = [];
let currentEmpresas = [];
let superStats = {
  totalEmpresas: 0,
  activeEmpresas: 0,
  totalUsuarios: 0,
  totalProdutos: 0,
  totalVendasGlobal: 0
};

export async function initSuperPages() {
  if (window.STATE?.role === "super") {
    await Promise.all([
      refreshLicenses(),
      refreshEmpresas(),
      refreshStats()
    ]);
  }
}

async function refreshLicenses() {
  try {
    if (window.api?.getSuperLicenses) {
      currentLicenses = await window.api.getSuperLicenses();
    }
  } catch (err) {
    console.error("Erro ao carregar licenças:", err);
  }
}

async function refreshEmpresas() {
  try {
    if (window.api?.getSuperEmpresas) {
      currentEmpresas = await window.api.getSuperEmpresas();
    }
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
  }
}

async function refreshStats() {
  try {
    if (window.api?.getSuperStats) {
      superStats = await window.api.getSuperStats();
    }
  } catch (err) {
    console.error("Erro ao carregar estatísticas:", err);
  }
}

function reRender() {
  const ca = document.getElementById("content-area");
  const page = window.STATE?.currentPage;
  if (!ca || !page) return;

  if (page === "empresas") renderEmpresas(ca);
  else if (page === "criar-empresa") renderCriarEmpresa(ca);
  else if (page === "subscricoes") renderLicenses(ca);
  else if (page === "super-stats") renderSuperStats(ca);
}

export function cleanup() {
  Object.values(STATE_charts).forEach((c) => {
    try {
      c.destroy();
    } catch (e) {}
  });
  STATE_charts = {};
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renderiza formulário para criar empresa completa
 */
export function renderCriarEmpresa(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-plus" style="margin-right:8px"></i> Criar Nova Empresa</div>
      <div class="page-sub">Registe uma empresa, crie o gestor e gere a licença automaticamente</div>
    </div>

    <div class="card" style="max-width: 600px; margin: 0 auto">
      <form id="form-criar-empresa" class="form-standard">
        <div class="form-section-title">Dados da Empresa</div>
        <div class="form-group">
          <label>Nome da Empresa *</label>
          <input type="text" id="ce-nome-empresa" placeholder="Ex: Biz Store Lda" required />
        </div>
        <div class="form-group">
          <label>BI / Documento de Identificação</label>
          <input type="text" id="ce-bi" placeholder="Ex: 123456789LA012" />
        </div>
        <div class="form-group">
          <label>Nome do Empresário *</label>
          <input type="text" id="ce-nome-empresario" placeholder="Ex: João Silva" required />
        </div>

        <div class="form-section-title" style="margin-top:20px">Dados de Acesso (Gestor)</div>
        <div class="form-group">
          <label>Email de Acesso *</label>
          <input type="email" id="ce-email" placeholder="gestor@empresa.com" required />
        </div>
        <div class="form-group">
          <label>Senha Provisória *</label>
          <input type="password" id="ce-senha" placeholder="••••••••" required />
        </div>

        <div class="form-section-title" style="margin-top:20px">Plano e Licença</div>
        <div class="form-row cols2">
          <div class="form-group">
            <label>Plano de Pagamento</label>
            <select id="ce-plano">
              <option value="Mensal">Mensal (30 dias)</option>
              <option value="Anual">Anual (365 dias)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data de Expiração *</label>
            <input type="date" id="ce-expiracao" required />
          </div>
        </div>

        <div style="margin-top:30px">
          <button type="submit" class="btn-primary" style="width:100%">
            <i class="fa-solid fa-check" style="margin-right:8px"></i> Criar Empresa e Licença
          </button>
        </div>
      </form>
    </div>

    <div id="ce-result" class="hidden" style="max-width: 600px; margin: 20px auto; padding: 20px; border-radius: 8px; background: var(--bg2); border: 1px solid var(--green)">
       <h3 style="color:var(--green); margin-bottom:10px">✓ Empresa Criada com Sucesso!</h3>
       <p style="margin-bottom:15px">A empresa e o utilizador gestor foram registados no banco local.</p>
       <div style="background:var(--bg1); padding:15px; border-radius:4px; font-family:monospace">
          <strong>CHAVE DE LICENÇA (SUPABASE):</strong>
          <div id="ce-license-key" style="font-size:20px; color:var(--blue); margin-top:10px; font-weight:bold; letter-spacing:2px">XXXX-XXXX-XXXX-XXXX</div>
       </div>
       <button class="btn btn-sm btn-blue" style="margin-top:15px" onclick="window.navigateTo('empresas')">Ver Lista de Empresas</button>
    </div>
  `;

  // Preencher data padrão
  const planoSelect = el.querySelector("#ce-plano");
  const expInput = el.querySelector("#ce-expiracao");
  const updateDate = () => {
    const d = new Date();
    if (planoSelect.value === "Anual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    expInput.value = d.toISOString().split("T")[0];
  };
  planoSelect.onchange = updateDate;
  updateDate();

  const form = el.querySelector("#form-criar-empresa");
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Criando...";

    const data = {
      nomeEmpresa: el.querySelector("#ce-nome-empresa").value.trim(),
      bi: el.querySelector("#ce-bi").value.trim(),
      nomeEmpresario: el.querySelector("#ce-nome-empresario").value.trim(),
      email: el.querySelector("#ce-email").value.trim(),
      senha: el.querySelector("#ce-senha").value,
      plano: el.querySelector("#ce-plano").value,
      dataExpiracao: el.querySelector("#ce-expiracao").value
    };

    try {
      const result = await window.api.createFullCompany(data);
      
      form.classList.add("hidden");
      const resDiv = el.querySelector("#ce-result");
      resDiv.classList.remove("hidden");
      el.querySelector("#ce-license-key").textContent = result.licenseKey;
      
      showNotification("Empresa e Gestor criados com sucesso!", "success");
    } catch (err) {
      showNotification(err.message || "Erro ao criar empresa", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = "<i class='fa-solid fa-check' style='margin-right:8px'></i> Criar Empresa e Licença";
    }
  };
}

/**
 * Renderiza lista de empresas cadastradas
 */
export async function renderEmpresas(el) {
  await refreshEmpresas();
  
  const total = currentEmpresas.length;
  const active = currentEmpresas.filter(e => e.ativo).length;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-building" style="margin-right:8px"></i> Gestão de Empresas</div>
      <div class="page-sub">Visualize e controle o acesso das empresas cadastradas no sistema</div>
    </div>
    
    <div class="cards-row cols2" style="margin-bottom:20px">
      <div class="card"><div class="card-title">Total de Empresas</div><div class="metric">${total}</div></div>
      <div class="card"><div class="card-title">Empresas Ativas</div><div class="metric green">${active}</div></div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome da Empresa</th>
              <th>Plano</th>
              <th>Utilizadores</th>
              <th>Status</th>
              <th>Expiração</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${currentEmpresas.map(e => {
              const statusClass = e.ativo ? "green" : "red";
              return `
                <tr>
                  <td style="font-weight:600">${escapeHtml(e.nome)}</td>
                  <td><span class="badge blue">${e.plano || "Mensal"}</span></td>
                  <td>${e.vendedores || 0}</td>
                  <td><span class="badge ${statusClass}">${e.ativo ? "Ativa" : "Desativada"}</span></td>
                  <td>${e.data_expiracao ? new Date(e.data_expiracao).toLocaleDateString() : "Sem limite"}</td>
                  <td>
                    <button class="btn btn-sm ${e.ativo ? "btn-red" : "btn-green"}" 
                      onclick="window.toggleEmpresaStatusWrapper(${e.id}, ${e.ativo})">
                      ${e.ativo ? "Desativar" : "Activar"}
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renderiza lista de licenças (Supabase)
 */
export function renderLicenses(el) {
  const total = currentLicenses.length;
  const active = currentLicenses.filter(l => l.status === "active").length;
  const blocked = currentLicenses.filter(l => l.status === "blocked").length;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-key" style="margin-right:8px"></i> Gestão de Licenças (Supabase)</div>
      <div class="page-sub">Controlo centralizado de ativações e bloqueios na nuvem</div>
    </div>
    
    <div class="cards-row cols3" style="margin-bottom:20px">
      <div class="card"><div class="card-title">Total Licenças</div><div class="metric">${total}</div></div>
      <div class="card"><div class="card-title">Ativas</div><div class="metric green">${active}</div></div>
      <div class="card"><div class="card-title">Bloqueadas</div><div class="metric red">${blocked}</div></div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Empresa / Chave</th>
              <th>Dispositivo (ID)</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Expiração</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${currentLicenses.map(l => {
              const statusClass = l.status === "active" ? "green" : l.status === "blocked" ? "red" : "amber";
              return `
                <tr>
                  <td>
                    <div style="font-weight:600">${escapeHtml(l.company_name || "Pendente")}</div>
                    <div style="font-size:11px;color:var(--text2)">${l.license_key}</div>
                  </td>
                  <td style="font-size:11px;font-family:monospace">${l.device_id || "—"}</td>
                  <td><span class="badge blue">${l.plan}</span></td>
                  <td><span class="badge ${statusClass}">${l.status}</span></td>
                  <td>${l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <button class="btn btn-sm ${l.status === "blocked" ? "btn-green" : "btn-red"}" 
                      onclick="window.toggleLicenseBlockWrapper('${l.license_key}', '${l.status}')">
                      ${l.status === "blocked" ? "Desbloquear" : "Bloquear"}
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderSubscricoes(el) {
  renderLicenses(el);
}

// Wrapper global para toggle de status de empresa
window.toggleEmpresaStatusWrapper = async function(id, currentAtivo) {
  const newAtivo = currentAtivo ? 0 : 1;
  const action = currentAtivo ? "desativar" : "ativar";
  
  showConfirmModal(`Tem certeza que deseja <strong>${action}</strong> esta empresa?`, async () => {
    try {
      await window.api.updateSuperEmpresa(id, { ativo: newAtivo }); 
      showNotification(`Empresa ${action}ada com sucesso`, "success");
      await refreshEmpresas();
      reRender();
    } catch (err) {
      showNotification("Erro ao atualizar status da empresa", "error");
    }
  });
};

window.toggleLicenseBlockWrapper = async function(key, currentStatus) {
  const isBlocked = currentStatus === "blocked";
  const action = isBlocked ? "desbloquear" : "bloquear";
  const newStatus = isBlocked ? "active" : "blocked";
  
  showConfirmModal(`Tem certeza que deseja <strong>${action}</strong> esta licença?`, async () => {
    try {
      await window.api.blockLicenseRemote(key, newStatus); 
      showNotification(`Licença ${isBlocked ? "desbloqueada" : "bloqueada"} com sucesso`, "success");
      await refreshLicenses();
      reRender();
    } catch (err) {
      showNotification("Erro ao atualizar licença", "error");
    }
  });
};

export async function renderSuperStats(el) {
  await refreshStats();

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-chart-simple" style="margin-right:8px"></i> Estatísticas Globais</div>
      <div class="page-sub">Visão geral de toda a plataforma BizController em tempo real</div>
    </div>
    
    <div class="cards-row cols4">
      <div class="card">
        <div class="card-title">Empresas</div>
        <div class="metric">${superStats.totalEmpresas || 0}</div>
        <div style="font-size:12px; color:var(--green)">${superStats.activeEmpresas || 0} Ativas</div>
      </div>
      <div class="card">
        <div class="card-title">Utilizadores</div>
        <div class="metric blue">${superStats.totalUsuarios || 0}</div>
      </div>
      <div class="card">
        <div class="card-title">Produtos Totais</div>
        <div class="metric amber">${superStats.totalProdutos || 0}</div>
      </div>
      <div class="card">
        <div class="card-title">Volume de Vendas</div>
        <div class="metric green">${fmt(superStats.totalVendasGlobal || 0)}</div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <div class="card-title">Distribuição de Planos</div>
      </div>
      <div class="chart-container" style="height:300px">
        <canvas id="chart-super-trend"></canvas>
      </div>
    </div>
  `;

  setTimeout(() => {
    const ctx = document.getElementById("chart-super-trend");
    if (ctx) {
      STATE_charts["super-trend"] = new Chart(ctx, { 
        type: "bar", 
        data: { 
          labels: ["Total de Empresas", "Empresas Ativas", "Utilizadores"], 
          datasets: [
            { 
              label: "Métricas Gerais", 
              data: [superStats.totalEmpresas, superStats.activeEmpresas, superStats.totalUsuarios], 
              backgroundColor: ["rgba(0,150,255,0.5)", "rgba(0,212,170,0.5)", "rgba(255,180,0,0.5)"], 
              borderRadius: 4 
            }
          ] 
        }, 
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          plugins: { 
            legend: { display: false } 
          }, 
          scales: { 
            x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8fa3c0" } }, 
            y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8fa3c0" } } 
          } 
        } 
      });
    }
  }, 200);
}

export const pageEmpresas = renderEmpresas;
export const pageCriarEmpresa = renderCriarEmpresa;
export const pageSubscricoes = renderSubscricoes;
export const pageStats = renderSuperStats;
