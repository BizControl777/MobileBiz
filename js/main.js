import { PRODUTOS, VENDAS } from "./data.js";
import { api } from "./api.js";
import { STATE, setDataCallbacks, navigateTo, PAGES, setInitVendedorCallback, doLogin, logout, restoreSession } from "./app.js";
import { initCartHelpers, renderCart, setCartState, showNotification } from "./paginas/helpers.js";
import { initVendedorPages, syncVendedorProdutos } from "./paginas/vendedor.js";
import { initGestorPages } from "./paginas/gestor.js";
import { initSuperPages } from "./paginas/super.js";
import { debounce } from "./utils.js";

import { initTheme } from "./theme.js";
import { getLanguage } from "./i18n.js";

// Inicializar preferências
initTheme();

// Estado reativo (simplificado)
let currentProdutos = PRODUTOS;
let currentVendas = VENDAS;

// Wrappers para atualizar estado
function setProdutos(newProdutos) {
  const arr = Array.isArray(newProdutos) ? newProdutos : [];
  currentProdutos.length = 0;
  currentProdutos.push(...arr);
  
  syncVendedorProdutos(currentProdutos);
  const ca = document.getElementById("content-area");
  if (ca && STATE.currentPage && PAGES[STATE.currentPage]) {
    ca.innerHTML = "";
    PAGES[STATE.currentPage](ca);
  }
}

function setVendas(newVendas) {
  const arr = Array.isArray(newVendas) ? newVendas : [];
  currentVendas.length = 0;
  currentVendas.push(...arr);
}

function setCart(newCart) {
  STATE.cart = Array.isArray(newCart) ? newCart : [];
  setCartState(STATE.cart);
  renderCart();
}

const formatSaleFromMovement = (movement) => {
  const data = movement.criado_em ? movement.criado_em.split("T")[0] : movement.data?.split(" ")[0] || "";
  const quantidade = Number(movement.quantidade || 0);
  const precoUnitario = Number(movement.preco_unitario || 0);
  const custoUnitario = Number(movement.produto_preco_custo || 0);
  const total = Number(movement.total || precoUnitario * quantidade);

  return {
    id: movement.id,
    data,
    vendedor: movement.usuario_nome || "—",
    produtos: [
      {
        nome: movement.produto_nome || "—",
        qty: quantidade,
        preco: precoUnitario,
      },
    ],
    total,
    lucro: Math.max(0, total - custoUnitario * quantidade),
  };
};

const formatSaleFromVenda = (venda) => {
  const data = venda.criado_em ? String(venda.criado_em).split("T")[0].split(" ")[0] : venda.data || "";
  return {
    id: venda.id,
    data,
    criado_em: venda.criado_em,
    usuario_id: venda.usuario_id,
    vendedor: venda.vendedor || venda.usuario_nome || "—",
    produtos: Array.isArray(venda.produtos) ? venda.produtos : [],
    total: Number(venda.total || 0),
    lucro: Number(venda.lucro || 0),
    metodo_pagamento: venda.metodo_pagamento || "dinheiro",
    status_pagamento: venda.status_pagamento || "pago",
    cliente_nome: venda.cliente_nome || "Cliente balcão",
    cliente_contacto: venda.cliente_contacto || "",
    valor_recebido: Number(venda.valor_recebido || 0),
    troco: Number(venda.troco || 0),
  };
};

const syncBackendData = async () => {
  if (!window.api) return;

  try {
    const produtos = await window.api.getProdutos();
    setProdutos(produtos);
  } catch (error) {
    console.error("Erro ao carregar produtos do backend:", error);
  }

  try {
    const vendasRows = window.api.getVendas ? await window.api.getVendas() : null;
    const vendas = Array.isArray(vendasRows)
      ? vendasRows.map(formatSaleFromVenda)
      : (await window.api.getMovimentos()).filter((m) => m.tipo === "venda").map(formatSaleFromMovement);
    setVendas(vendas);
  } catch (error) {
    console.error("Erro ao carregar vendas do backend:", error);
  }
};

function initVendedorAfterLogin(user) {
  initVendedorPages(STATE.cart, setCart, currentProdutos, setProdutos, user, currentVendas, setVendas);
  initGestorPages(currentProdutos, setProdutos, currentVendas, setVendas, user);
}

setDataCallbacks(currentProdutos, setProdutos, currentVendas, setVendas);
setInitVendedorCallback(async (user) => {
  await syncBackendData();
  initVendedorAfterLogin(user);
});
initCartHelpers(STATE.cart, setCart);
initGestorPages(currentProdutos, setProdutos, currentVendas, setVendas, null);
initSuperPages();

window.debounce = debounce;

window.fetchProductImageWrapper = async function() {
  const name = (document.getElementById("p-nome") || {}).value || "";
  const input = document.getElementById("p-image") || {};
  const preview = document.getElementById("p-image-preview");
  if (!preview || !input) return;
  let url = input.value && input.value.trim();
  if (!url && name) {
    url = `https://source.unsplash.com/400x300/?${encodeURIComponent(name)}`;
  }
  const saveBtn = document.getElementById("p-save-local");
  if (!url) {
    preview.style.display = "none";
    if (saveBtn) saveBtn.style.display = "none";
    return;
  }
  preview.src = url;
  preview.style.display = "block";
  if (saveBtn) saveBtn.style.display = "inline-flex";
  input.value = url;
};

window.saveImageToDiskWrapper = async function() {
  try {
    const url = (document.getElementById("p-image") || {}).value;
    if (!url) {
       if (window.showNotificationWrapper) window.showNotificationWrapper("Nenhuma imagem para salvar", "warning");
       return;
    }
    const resp = await fetch(url);
    if (!resp.ok) {
       if (window.showNotificationWrapper) window.showNotificationWrapper("Falha ao baixar a imagem", "error");
       return;
    }
    const blob = await resp.blob();
    const nomeBase = ((document.getElementById("p-nome") || {}).value || "image").replace(/[^a-z0-9\-]/gi, "_");
    const ext = (blob.type.split("/")[1] || "png").split("+")[0];
    const fileName = `${nomeBase}.${ext}`;

    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "Image", accept: { [blob.type]: ["." + ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      if (window.showNotificationWrapper) window.showNotificationWrapper("Imagem salva: " + handle.name, "success");
      return;
    }

    if (window.showDirectoryPicker) {
      const dir = await window.showDirectoryPicker();
      const fh = await dir.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();
      if (window.showNotificationWrapper) window.showNotificationWrapper("Imagem salva: " + fileName, "success");
      return;
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    if (window.showNotificationWrapper) window.showNotificationWrapper("Download iniciado: " + fileName, "info");
  } catch (e) {
    console.error(e);
    if (window.showNotificationWrapper) window.showNotificationWrapper("Erro ao salvar imagem: " + e.message, "error");
  }
};

(function attachAutoImage() {
  const nameEl = document.getElementById("p-nome");
  const auto = document.getElementById("p-autoimage");
  if (!nameEl || !auto) return;
  const deb = debounce(() => {
    if (auto.checked) window.fetchProductImageWrapper();
  }, 600);
  nameEl.addEventListener("input", deb);
})();

document.addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") window.closeModal();
});

function wireLoginUi() {
  const submit = document.getElementById("login-submit-btn");
  console.log("wireLoginUi: botão submit encontrado?", !!submit);
  if (submit) {
    submit.addEventListener("click", (ev) => {
      ev.preventDefault();
      console.log("Botão de login clicado");
      void doLogin();
    });
  }
  const pass = document.getElementById("login-pass");
  const user = document.getElementById("login-user");
  const onEnter = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      console.log("Enter pressionado no campo de login");
      void doLogin();
    }
  };
  if (pass) pass.addEventListener("keydown", onEnter);
  if (user) user.addEventListener("keydown", onEnter);

  const out = document.getElementById("logout-btn");
  if (out) {
    out.addEventListener("click", (ev) => {
      ev.preventDefault();
      logout();
    });
  }
}

async function checkLicenseAndInit() {
  const licenseScreen = document.getElementById("license-screen");
  const loginScreen = document.getElementById("login-screen");

  try {
    const license = await api.getLicenseStatus();
    console.log("Status da licença:", license);

    if (!license || license.status === "none" || !license.license_key) {
      licenseScreen?.classList.remove("hidden");
      loginScreen?.classList.add("hidden");
      setupActivationListener();
      return;
    }

    // Verificar Bloqueio Parcial (10 dias sem validar)
    const dezDias = 10 * 24 * 60 * 60 * 1000;
    const tempoSemValidar = new Date() - new Date(license.last_validation_at);
    
    if (tempoSemValidar > dezDias) {
      showNotification("Sua licença precisa ser validada. Conecte-se à internet para liberar todas as funções.", "warning");
      // Adicionar um banner visual se desejar
      const banner = document.createElement("div");
      banner.style = "background:var(--amber);color:#000;padding:8px;text-align:center;font-weight:bold;position:fixed;top:0;left:0;right:0;z-index:9999;font-size:12px";
      banner.innerHTML = "⚠️ MODO LIMITADO: Conecte-se à internet para validar sua licença.";
      banner.id = "validation-warning-banner";
      if (!document.getElementById("validation-warning-banner")) document.body.prepend(banner);
    }

    // Tentar validação silenciosa se houver internet
    if (navigator.onLine && license.license_key) {
      try {
        const res = await api.validateLicense(license.license_key);
        if (res.status === "blocked") {
           showNotification("Esta licença foi bloqueada.", "error");
           setTimeout(() => window.location.reload(), 2000);
           return;
        }
        // Se validou com sucesso, remover banner se existir
        document.getElementById("validation-warning-banner")?.remove();
      } catch (e) {
        console.warn("Validação silenciosa falhou, seguindo offline.");
      }
    }

    licenseScreen?.classList.add("hidden");
    loginScreen?.classList.remove("hidden");
    wireLoginUi();
    void restoreSession();
  } catch (err) {
    console.error("Erro ao verificar licença:", err);
    loginScreen?.classList.remove("hidden");
    wireLoginUi();
    void restoreSession();
  }
}

function setupActivationListener() {
  const activateBtn = document.getElementById("activate-btn");
  activateBtn?.addEventListener("click", async () => {
    const key = document.getElementById("license-key").value.trim();
    const company = document.getElementById("license-company").value.trim();
    const phone = document.getElementById("license-phone").value.trim();

    if (!key) return showNotification("Insira a chave de licença.", "warning");

    activateBtn.disabled = true;
    activateBtn.textContent = "Ativando...";

    try {
      await api.activateLicense(key, company, phone);
      showNotification("Sistema ativado com sucesso!", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showNotification(err.message || "Erro na ativação", "error");
      activateBtn.disabled = false;
      activateBtn.textContent = "Ativar Agora";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void checkLicenseAndInit();
  });
} else {
  void checkLicenseAndInit();
}

console.log("BizController 360 inicializado!");
