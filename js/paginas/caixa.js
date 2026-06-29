import { fmt } from "../utils.js";
import { STATE, syncCaixaStatus } from "../app.js";
import { showNotification, showModal, closeModal, showConfirmModal } from "./helpers.js";

export async function renderCaixa(el) {
  await syncCaixaStatus();
  
  const isAberto = STATE.caixa && STATE.caixa.status === "aberto";
  
  el.innerHTML = ""; // Limpar antes de renderizar

  if (!isAberto) {
    if (STATE.role === "vendedor") {
      // Buscar histórico para ver se o ÚLTIMO caixa pode ser reaberto
      let historico = [];
      try {
        historico = await window.api.getHistoricoCaixas();
      } catch (e) {}

      const ultimoCaixa = historico[0]; // O primeiro é o mais recente devido ao ORDER BY DESC
      
      let podeReabrir = false;
      if (ultimoCaixa && ultimoCaixa.status === 'fechado') {
        const fechadoEm = new Date(ultimoCaixa.fechado_em).getTime();
        const agora = new Date().getTime();
        const horasPassadas = (agora - fechadoEm) / (1000 * 60 * 60);
        if (horasPassadas <= 4) podeReabrir = true;
      }

      if (podeReabrir) {
        renderOpcoesAbertura(el, ultimoCaixa);
      } else {
        renderAbertura(el);
      }
    } else {
      el.innerHTML = `
        <div class="page-header">
          <div class="page-title"><i class="fa-solid fa-cash-register" style="margin-right:8px"></i> Gestão de Caixa</div>
          <div class="page-sub">Nenhum caixa aberto no momento.</div>
        </div>
        <div class="alert-card alert-info"><i class="fa-solid fa-circle-info"></i> Aguarde que um vendedor inicie a abertura do caixa para visualizar o dashboard em tempo real.</div>
      `;
    }
  } else {
    await renderDashboardCaixa(el);
  }

  const historyEl = document.createElement("div");
  historyEl.style.marginTop = "30px";
  el.appendChild(historyEl);
  renderHistorico(historyEl);
}

function renderAbertura(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-lock-open" style="margin-right:8px"></i> Abrir Novo Caixa</div>
      <div class="page-sub">Inicie um novo turno registrando o valor inicial.</div>
    </div>
    <div class="card" style="max-width: 500px; margin: 20px auto;">
      <div class="form-row">
        <div class="field">
          <label>Valor Inicial (Dinheiro)</label>
          <input id="cx-valor-inicial" type="number" min="0" step="0.01" value="0.00" style="font-size: 20px; font-weight: bold; text-align: center; color: var(--accent)"/>
        </div>
      </div>
      <div style="margin-top: 20px">
        <button class="btn btn-green" id="btn-abrir-caixa" style="width: 100%; justify-content: center; padding: 15px;">
          <i class="fa-solid fa-check" style="margin-right:8px"></i> Abrir Caixa agora
        </button>
      </div>
    </div>
  `;

  document.getElementById("btn-abrir-caixa")?.addEventListener("click", async () => {
    const valor = parseFloat(document.getElementById("cx-valor-inicial")?.value || 0);
    try {
      await window.api.abrirCaixa(valor);
      showNotification("Caixa aberto com sucesso!", "success");
      const ca = document.getElementById("content-area");
      if (ca) renderCaixa(ca);
    } catch (err) {
      showNotification(err.message, "error");
    }
  });
}

function renderOpcoesAbertura(el, ultimoCaixa) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-cash-register" style="margin-right:8px"></i> Gestão de Turno</div>
      <div class="page-sub">O que deseja fazer agora?</div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 800px; margin: 20px auto;">
      <div class="card" style="border-top: 4px solid var(--accent2); text-align: center;">
        <div style="font-size: 30px; color: var(--accent2); margin-bottom: 15px;"><i class="fa-solid fa-rotate-left"></i></div>
        <h3>Reabrir Anterior</h3>
        <p style="font-size: 13px; color: var(--text2); margin: 10px 0;">Fechado há pouco tempo. Utilize para corrigir erros no fecho anterior.</p>
        <button class="btn btn-blue" id="btn-reabrir-caixa" style="width: 100%; justify-content: center; margin-top: 15px;">Reabrir Sessão</button>
      </div>

      <div class="card" style="border-top: 4px solid var(--green); text-align: center;">
        <div style="font-size: 30px; color: var(--green); margin-bottom: 15px;"><i class="fa-solid fa-plus"></i></div>
        <h3>Novo Turno</h3>
        <p style="font-size: 13px; color: var(--text2); margin: 10px 0;">Iniciar um novo caixa do zero para um novo colega ou dia.</p>
        <button class="btn btn-green" id="btn-mostrar-abertura" style="width: 100%; justify-content: center; margin-top: 15px;">Abrir Novo Caixa</button>
      </div>
    </div>
  `;

  document.getElementById("btn-reabrir-caixa")?.addEventListener("click", async () => {
    try {
      await window.api.reabrirCaixa(ultimoCaixa.id);
      showNotification("Sessão anterior recuperada!", "success");
      const ca = document.getElementById("content-area");
      if (ca) renderCaixa(ca);
    } catch (err) {
      showNotification(err.message, "error");
    }
  });

  document.getElementById("btn-mostrar-abertura")?.addEventListener("click", () => {
    renderAbertura(el);
  });
}

async function renderDashboardCaixa(el) {
  const caixa = STATE.caixa;
  let vendas = [];
  try {
    const todasVendas = await window.api.getVendas();
    vendas = todasVendas.filter(v => Number(v.caixa_id) === Number(caixa.id));
  } catch (err) {
    console.error("Erro ao buscar vendas do caixa:", err);
  }

  const totais = vendas.reduce((acc, v) => {
    const m = v.metodo_pagamento || "dinheiro";
    acc[m] = (acc[m] || 0) + Number(v.total || 0);
    acc.total += Number(v.total || 0);
    return acc;
  }, { dinheiro: 0, mpesa: 0, emola: 0, cartao: 0, transferencia: 0, total: 0 });

  const valorEsperado = Number(caixa.valor_inicial) + totais.dinheiro;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-cash-register" style="margin-right:8px"></i> Caixa Ativo</div>
      <div class="page-sub">Aberto em ${new Date(caixa.aberto_em).toLocaleString()} por ${caixa.operador_abertura || 'Operador'}</div>
    </div>

    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div class="stat-card">
        <div class="stat-label">Valor Inicial</div>
        <div class="stat-value">${fmt(caixa.valor_inicial)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Vendido</div>
        <div class="stat-value" style="color: var(--accent)">${fmt(totais.total)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dinheiro em Caixa</div>
        <div class="stat-value" style="color: var(--amber)">${fmt(valorEsperado)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Transações</div>
        <div class="stat-value">${vendas.length}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: ${STATE.role === 'vendedor' ? '1fr 350px' : '1fr'}; gap: 20px; align-items: start;">
      <div class="card">
        <div class="card-title">Resumo por Método</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Método</th><th style="text-align: right">Total</th></tr>
            </thead>
            <tbody>
              <tr><td><i class="fa-solid fa-money-bill-1" style="color:var(--green)"></i> Dinheiro</td><td style="text-align: right; font-weight: 600">${fmt(totais.dinheiro)}</td></tr>
              <tr><td><i class="fa-solid fa-mobile-screen" style="color:var(--accent2)"></i> M-Pesa</td><td style="text-align: right; font-weight: 600">${fmt(totais.mpesa)}</td></tr>
              <tr><td><i class="fa-solid fa-mobile-screen" style="color:var(--purple)"></i> E-Mola</td><td style="text-align: right; font-weight: 600">${fmt(totais.emola)}</td></tr>
              <tr><td><i class="fa-solid fa-credit-card" style="color:var(--amber)"></i> Cartão</td><td style="text-align: right; font-weight: 600">${fmt(totais.cartao)}</td></tr>
              <tr><td><i class="fa-solid fa-building-columns" style="color:var(--text2)"></i> Transferência</td><td style="text-align: right; font-weight: 600">${fmt(totais.transferencia)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      ${STATE.role === 'vendedor' ? `
      <div class="card" style="border-top: 4px solid var(--accent3)">
        <div class="card-title">Fechar Caixa</div>
        <p class="page-sub" style="margin-bottom: 15px">Insira o valor físico contado no caixa (apenas dinheiro).</p>
        <div class="field">
          <label>Valor Contado (Dinheiro)</label>
          <input id="cx-valor-contado" type="number" min="0" step="0.01" value="${valorEsperado}" style="font-size: 18px; font-weight: bold; text-align: center;"/>
        </div>
        <div class="field" style="margin-top: 10px">
          <label>Observações</label>
          <textarea id="cx-observacoes" placeholder="Opcional..." style="width: 100%; min-height: 80px;"></textarea>
        </div>
        <div id="cx-preview-resultado" style="margin-top: 15px; padding: 10px; border-radius: 8px; text-align: center; background: var(--bg3); font-weight: 600;">
           Diferença: MT 0.00
        </div>
        <button class="btn btn-blue" id="btn-fechar-caixa" style="width: 100%; justify-content: center; margin-top: 20px; padding: 12px;">
          <i class="fa-solid fa-lock" style="margin-right:8px"></i> Finalizar Fechamento
        </button>
      </div>
      ` : ''}
    </div>
  `;

  if (STATE.role === 'vendedor') {
    const inputContado = document.getElementById("cx-valor-contado");
    const preview = document.getElementById("cx-preview-resultado");
    
    const updatePreview = () => {
      const contado = parseFloat(inputContado?.value || 0);
      const dif = contado - valorEsperado;
      if (preview) {
        preview.style.color = dif === 0 ? "var(--green)" : dif > 0 ? "var(--accent2)" : "var(--red)";
        preview.textContent = `Diferença: ${fmt(dif)} (${dif === 0 ? "Correto" : dif > 0 ? "Sobra" : "Falta"})`;
      }
    };

    inputContado?.addEventListener("input", updatePreview);
    updatePreview();

    document.getElementById("btn-fechar-caixa")?.addEventListener("click", () => {
      const contado = parseFloat(inputContado?.value || 0);
      const obs = document.getElementById("cx-observacoes")?.value || "";
      
      showConfirmModal(`Deseja realmente fechar o caixa? Esta ação não pode ser desfeita.`, async () => {
        try {
          await window.api.fecharCaixa(caixa.id, contado, obs);
          showNotification("Caixa fechado com sucesso!", "success");
          const ca = document.getElementById("content-area");
          if (ca) renderCaixa(ca);
        } catch (err) {
          showNotification(err.message, "error");
        }
      });
    });
  }
}

async function renderHistorico(el) {
  let historico = [];
  try {
    historico = await window.api.getHistoricoCaixas();
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }

  el.innerHTML += `
    <div class="card" style="margin-top: 20px">
      <div class="card-title"><i class="fa-solid fa-clock-rotate-left" style="margin-right:8px"></i> Histórico de Fechamentos</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Abertura</th>
              <th>Fechamento</th>
              <th>Operador</th>
              <th style="text-align: right">Esperado</th>
              <th style="text-align: right">Contado</th>
              <th style="text-align: right">Diferença</th>
              <th style="text-align: center">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${historico.map(h => {
              const dif = Number(h.diferenca || 0);
              const statusClass = h.status === 'aberto' ? 'badge blue' : 'badge gray';
              const difColor = dif === 0 ? "var(--green)" : dif > 0 ? "var(--accent2)" : "var(--red)";
              return `
                <tr>
                  <td>${new Date(h.aberto_em).toLocaleString()}</td>
                  <td>${h.fechado_em ? new Date(h.fechado_em).toLocaleString() : "—"}</td>
                  <td>${h.operador_abertura || 'Operador'}</td>
                  <td style="text-align: right">${fmt(h.valor_esperado)}</td>
                  <td style="text-align: right">${fmt(h.valor_fechamento)}</td>
                  <td style="text-align: right; font-weight: 600; color: ${difColor}">${fmt(dif)}</td>
                  <td style="text-align: center"><span class="${statusClass}">${h.status}</span></td>
                  <td style="text-align: right">
                    <button class="btn btn-sm" onclick="window.imprimirFechoWrapper(${h.id})"><i class="fa-solid fa-print"></i></button>
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

function renderReceiptClosureHtml(h) {
  const dif = Number(h.diferenca || 0);
  const difText = dif === 0 ? "CORRETO" : dif > 0 ? "SOBRA" : "FALTA";
  return `
    <html>
      <head>
        <title>Recibo de Fechamento de Caixa</title>
        <style>
          body{font-family:Arial,sans-serif;color:#111;margin:18px;max-width:360px}
          h1{font-size:18px;margin:0 0 6px;text-align:center}
          .sub{font-size:11px;color:#555;text-align:center;margin-bottom:12px}
          .totals{margin-top:12px;font-size:12px;border-top:1px solid #ddd;padding-top:8px}
          .row{display:flex;justify-content:space-between;margin:5px 0}
          .total{font-size:14px;font-weight:700}
          .dif{font-size:15px;font-weight:700;margin-top:10px;text-align:center;padding:10px;border:1px dashed #333}
        </style>
      </head>
      <body>
        <h1>BizControl - Fecho de Caixa</h1>
        <div class="sub">ID: ${h.id} | Status: ${h.status.toUpperCase()}</div>
        <div class="sub">Aberto em: ${new Date(h.aberto_em).toLocaleString()}<br>Fechado em: ${h.fechado_em ? new Date(h.fechado_em).toLocaleString() : "N/A"}</div>
        <div class="sub">Operador: ${h.operador_abertura || 'Operador'}</div>
        
        <div class="totals">
          <div class="row"><span>Valor Inicial</span><span>${fmt(h.valor_inicial)}</span></div>
          <div class="row"><span>Valor Esperado (Sessão)</span><span>${fmt(h.valor_esperado)}</span></div>
          <div class="row total"><span>VALOR CONTADO</span><span>${fmt(h.valor_fechamento)}</span></div>
        </div>

        <div class="dif">
          DIFERENÇA: ${fmt(dif)}<br>
          <small>(${difText})</small>
        </div>

        ${h.observacoes ? `<div class="sub" style="margin-top:15px; text-align:left"><strong>Obs:</strong> ${h.observacoes}</div>` : ""}
        
        <div class="sub" style="margin-top:30px; border-top:1px solid #000; padding-top:10px">
          Assinatura do Operador
        </div>
      </body>
    </html>`;
}

window.imprimirFechoWrapper = async function(id) {
  try {
    const historico = await window.api.getHistoricoCaixas();
    const h = historico.find(x => x.id === id);
    if (!h) {
      showNotification("Registo de caixa não encontrado.", "error");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      showNotification("Permita pop-ups para imprimir o recibo.", "error");
      return;
    }
    win.document.write(renderReceiptClosureHtml(h));
    win.document.close();
    win.focus();
    win.print();
  } catch (err) {
    console.error(err);
    showNotification("Erro ao imprimir fecho.", "error");
  }
};
