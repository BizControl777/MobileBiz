/**
 * BizController 360 — Mobile UI
 * Hamburger menu, gestos touch, UX mobile
 */

// =============================================
// HAMBURGER MENU
// =============================================

let _sidebarOpen = false;
let _touchStartX = 0;
let _touchStartY = 0;
const SWIPE_THRESHOLD = 60;

export function initMobileUI() {
  createHamburgerBtn();
  createSidebarOverlay();
  wireGestures();
  wireWindowResize();
  injectMobileCSS();

  console.log("[MobileUI] Inicializado.");
}

function createHamburgerBtn() {
  if (document.getElementById("hamburger-btn")) return;

  const btn = document.createElement("button");
  btn.id = "hamburger-btn";
  btn.setAttribute("aria-label", "Abrir menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `
    <span class="ham-line"></span>
    <span class="ham-line"></span>
    <span class="ham-line"></span>
  `;
  btn.onclick = toggleSidebar;

  // Inserir no topbar-left
  const topbarLeft = document.querySelector(".topbar-left");
  if (topbarLeft) {
    topbarLeft.insertBefore(btn, topbarLeft.firstChild);
  }
}

function createSidebarOverlay() {
  if (document.getElementById("sidebar-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "sidebar-overlay";
  overlay.onclick = closeSidebar;
  document.body.appendChild(overlay);
}

export function toggleSidebar() {
  _sidebarOpen ? closeSidebar() : openSidebar();
}

export function openSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const btn = document.getElementById("hamburger-btn");

  if (sidebar) sidebar.classList.add("sidebar-open");
  if (overlay) overlay.classList.add("active");
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }
  document.body.classList.add("sidebar-locked");
  _sidebarOpen = true;
}

export function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const btn = document.getElementById("hamburger-btn");

  if (sidebar) sidebar.classList.remove("sidebar-open");
  if (overlay) overlay.classList.remove("active");
  if (btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
  document.body.classList.remove("sidebar-locked");
  _sidebarOpen = false;
}

// Fechar sidebar ao navegar (mobile)
export function onNavigateMobile() {
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

// =============================================
// GESTOS TOUCH (swipe para abrir/fechar sidebar)
// =============================================

function wireGestures() {
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
}

function onTouchStart(e) {
  _touchStartX = e.touches[0].clientX;
  _touchStartY = e.touches[0].clientY;
}

function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - _touchStartX;
  const dy = e.changedTouches[0].clientY - _touchStartY;

  // Ignorar swipes verticais
  if (Math.abs(dy) > Math.abs(dx)) return;
  if (Math.abs(dx) < SWIPE_THRESHOLD) return;

  // Swipe da esquerda para direita (abrir sidebar)
  if (dx > 0 && _touchStartX < 30 && !_sidebarOpen) {
    openSidebar();
  }

  // Swipe da direita para esquerda (fechar sidebar)
  if (dx < 0 && _sidebarOpen) {
    closeSidebar();
  }
}

// =============================================
// RESIZE
// =============================================

function wireWindowResize() {
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Em desktop, garantir que sidebar está sempre visível
      if (window.innerWidth > 768) {
        closeSidebar();
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.remove("sidebar-open");
      }
    }, 100);
  });
}

// =============================================
// INDICADOR OFFLINE PERMANENTE (canto superior)
// =============================================

export function initOfflineIndicator() {
  const indicator = document.createElement("div");
  indicator.id = "online-indicator";
  indicator.style.cssText = `
    position: fixed;
    top: 62px;
    right: 12px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    z-index: 9999;
    transition: background 0.3s;
    box-shadow: 0 0 6px currentColor;
  `;
  document.body.appendChild(indicator);

  function update() {
    if (navigator.onLine) {
      indicator.style.background = "#00d4aa";
      indicator.style.color = "#00d4aa";
      indicator.title = "Online";
    } else {
      indicator.style.background = "#ff4757";
      indicator.style.color = "#ff4757";
      indicator.title = "Offline";
    }
  }

  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
}

// =============================================
// SYNC STATUS BADGE (no topbar)
// =============================================

export function initSyncBadge() {
  const topbarUser = document.querySelector(".topbar-user");
  if (!topbarUser || document.getElementById("sync-badge")) return;

  const badge = document.createElement("div");
  badge.id = "sync-badge";
  badge.style.cssText = `
    display: none;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--amber);
    background: rgba(255,177,66,0.1);
    border: 1px solid rgba(255,177,66,0.3);
    padding: 4px 10px;
    border-radius: 20px;
    cursor: pointer;
  `;
  badge.title = "Operações pendentes de sincronização";
  badge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <span id="sync-count">0</span>`;
  badge.onclick = () => {
    if (window.showNotificationWrapper) {
      window.showNotificationWrapper(
        "Há operações offline pendentes. Serão sincronizadas automaticamente quando houver internet.",
        "warning"
      );
    }
  };

  topbarUser.insertBefore(badge, topbarUser.firstChild);
}

export function updateSyncBadge(count) {
  const badge = document.getElementById("sync-badge");
  const countEl = document.getElementById("sync-count");
  if (!badge) return;

  if (count > 0) {
    badge.style.display = "flex";
    if (countEl) countEl.textContent = count;
  } else {
    badge.style.display = "none";
  }
}

// =============================================
// CSS DINÂMICO (injetado no head)
// =============================================

function injectMobileCSS() {
  if (document.getElementById("mobile-ui-style")) return;

  const style = document.createElement("style");
  style.id = "mobile-ui-style";
  style.textContent = `
    /* Hamburger button */
    #hamburger-btn {
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 5px;
      width: 40px;
      height: 40px;
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      padding: 8px;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    #hamburger-btn:hover {
      background: var(--bg4);
      border-color: var(--accent);
    }
    .ham-line {
      display: block;
      width: 18px;
      height: 2px;
      background: var(--text);
      border-radius: 2px;
      transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
      transform-origin: center;
    }
    #hamburger-btn.active .ham-line:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    #hamburger-btn.active .ham-line:nth-child(2) {
      opacity: 0; transform: scaleX(0);
    }
    #hamburger-btn.active .ham-line:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    /* Sidebar overlay */
    #sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 199;
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }
    #sidebar-overlay.active {
      display: block;
    }

    /* Spin animation para ícone de sync */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Pull-to-refresh indicator */
    #ptr-indicator {
      position: fixed;
      top: 58px;
      left: 50%;
      transform: translateX(-50%) translateY(-60px);
      background: var(--accent);
      color: #0a0e17;
      padding: 8px 20px;
      border-radius: 0 0 20px 20px;
      font-size: 12px;
      font-weight: 700;
      z-index: 9998;
      transition: transform 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #ptr-indicator.visible {
      transform: translateX(-50%) translateY(0);
    }

    /* Mobile breakpoint */
    @media (max-width: 768px) {
      #hamburger-btn {
        display: flex !important;
      }
      
      .sidebar {
        position: fixed !important;
        left: 0;
        top: 58px;
        height: calc(100vh - 58px);
        width: 260px !important;
        z-index: 200;
        transform: translateX(-100%);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
        box-shadow: 4px 0 24px rgba(0,0,0,0.4);
        padding: 16px 12px !important;
        overflow-y: auto;
      }
      .sidebar.sidebar-open {
        transform: translateX(0);
      }
      .nav-item span {
        display: inline !important;
      }
      .nav-section {
        display: block !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// =============================================
// PULL-TO-REFRESH
// =============================================

export function initPullToRefresh(onRefresh) {
  let startY = 0;
  let pulling = false;

  const indicator = document.createElement("div");
  indicator.id = "ptr-indicator";
  indicator.innerHTML = `<i class="fa-solid fa-rotate"></i> Soltar para atualizar`;
  document.body.appendChild(indicator);

  const contentArea = document.getElementById("content-area");
  if (!contentArea) return;

  contentArea.addEventListener("touchstart", (e) => {
    if (contentArea.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  contentArea.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 60) {
      indicator.classList.add("visible");
      indicator.innerHTML = `<i class="fa-solid fa-rotate"></i> Soltar para atualizar`;
    }
  }, { passive: true });

  contentArea.addEventListener("touchend", async (e) => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - startY;
    pulling = false;

    if (dy > 60) {
      indicator.innerHTML = `<i class="fa-solid fa-rotate" style="animation:spin 1s linear infinite"></i> A atualizar...`;
      try {
        if (typeof onRefresh === "function") await onRefresh();
      } finally {
        setTimeout(() => indicator.classList.remove("visible"), 500);
      }
    } else {
      indicator.classList.remove("visible");
    }
  }, { passive: true });
}
