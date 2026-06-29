/**
 * BizController 360 — Service Worker
 * Versão: 1.0.0
 * Responsável por: cache de assets, intercepção offline, fila de sync
 */

const CACHE_NAME = "bizcontrol-v1";
const SYNC_QUEUE_KEY = "biz_sync_queue";

// Assets a cachear (shell da aplicação)
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/main.js",
  "/js/app.js",
  "/js/api.js",
  "/js/data.js",
  "/js/electron-bridge.js",
  "/js/i18n.js",
  "/js/mobile-ui.js",
  "/js/offline-db.js",
  "/js/pdv-utils.js",
  "/js/produtos-calc.js",
  "/js/theme.js",
  "/js/utils.js",
  "/js/web-api-bridge.js",
  "/js/paginas/caixa.js",
  "/js/paginas/gestor.js",
  "/js/paginas/helpers.js",
  "/js/paginas/super.js",
  "/js/paginas/vendedor.js",
];

// CDN assets (podem falhar offline — usamos cache-first)
const CDN_PATTERNS = [
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// =============================================
// INSTALL: Cachear todos os assets estáticos
// =============================================
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando Service Worker...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Cacheando assets estáticos...");
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn("[SW] Alguns assets não puderam ser cacheados:", err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// =============================================
// ACTIVATE: Limpar caches antigas
// =============================================
self.addEventListener("activate", (event) => {
  console.log("[SW] Ativando Service Worker...");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Removendo cache antigo:", key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// =============================================
// FETCH: Estratégia de intercepção de requests
// =============================================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-HTTP (chrome-extension, etc.)
  if (!request.url.startsWith("http")) return;

  // Ignorar IPC do Electron
  if (url.hostname === "127.0.0.1" && url.port === "3000") {
    return; // Electron usa localhost direto
  }

  // === CDN: Cache-first (funcionam offline com cache) ===
  if (CDN_PATTERNS.some((p) => url.hostname.includes(p))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // === API calls: Network-first com fallback offline ===
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // === Assets estáticos: Cache-first ===
  event.respondWith(cacheFirst(request));
});

// =============================================
// Estratégia: Cache-First
// Serve do cache; só vai à rede se não estiver cacheado
// =============================================
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Offline e não está cacheado
    return offlineFallback(request);
  }
}

// =============================================
// Estratégia: Network-First (para APIs)
// Tenta rede; se falhar, usa IndexedDB / resposta offline
// =============================================
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (err) {
    // Offline: para GETs, notificamos o app que está offline
    // Para POSTs/PUTs/DELETEs, eles ficam na fila (gerido pelo offline-db.js)
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          offline: true,
          message: "Sem conexão — a usar dados locais",
          data: [],
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "X-Offline": "true",
          },
        }
      );
    }

    // Para mutações offline, retornar resposta que o cliente processará
    return new Response(
      JSON.stringify({
        offline: true,
        queued: true,
        message: "Operação guardada — será sincronizada quando voltar internet",
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "X-Offline": "true",
          "X-Queued": "true",
        },
      }
    );
  }
}

// =============================================
// Fallback para páginas não cacheadas offline
// =============================================
async function offlineFallback(request) {
  const cached = await caches.match("/index.html");
  if (cached) return cached;

  return new Response(
    `<!DOCTYPE html>
    <html lang="pt">
    <head><meta charset="UTF-8"><title>BizController 360 — Offline</title>
    <style>
      body { font-family: sans-serif; background: #0a0e17; color: #e8edf5; 
             display: flex; align-items: center; justify-content: center; 
             height: 100vh; margin: 0; text-align: center; }
      h1 { color: #00d4aa; }
    </style>
    </head>
    <body>
      <div>
        <h1>📱 BizController 360</h1>
        <p>Sem conexão à internet.</p>
        <p>Abra a app novamente quando tiver internet para sincronizar.</p>
        <button onclick="window.location.reload()" 
                style="background:#00d4aa;color:#000;border:none;padding:12px 24px;
                       border-radius:8px;cursor:pointer;font-size:16px;margin-top:16px;">
          Tentar Novamente
        </button>
      </div>
    </body>
    </html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// =============================================
// BACKGROUND SYNC: Sincronizar fila offline
// =============================================
self.addEventListener("sync", (event) => {
  if (event.tag === "biz-sync") {
    console.log("[SW] Background Sync disparado: biz-sync");
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  // Notificar o cliente para processar a fila
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "PROCESS_SYNC_QUEUE" });
  });
}

// =============================================
// PUSH NOTIFICATIONS (futuro)
// =============================================
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "BizController 360", {
    body: data.body || "",
    icon: "/icon/iconiconbiz.ico",
    badge: "/icon/iconiconbiz.ico",
  });
});

// =============================================
// MENSAGENS do cliente
// =============================================
self.addEventListener("message", (event) => {
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data.type === "CACHE_URLS") {
    caches.open(CACHE_NAME).then((cache) => cache.addAll(event.data.urls));
  }
});

console.log("[SW] Service Worker BizController 360 carregado.");
