import dotenv from "dotenv";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { registerMEDRoutes } from "./med";
import { registerPDFRoutes } from "./pdf";
import { registerSAFTRoutes } from "./saft";
import { registerConselhoRoutes } from "./conselho-routes";
import { registerExameExtraordinarioRoutes } from "./exame-extraordinario-routes";
import { registerExameRecursoRoutes } from "./exame-recurso-routes";
import { registerMelhoriaNotaRoutes } from "./melhoria-nota-routes";
import { registerReapreciacaoRoutes } from "./reapreciacao-routes";
import { runMigrations } from "./migrate";
import { startAutoLembretesPautas, startCobrancaPropinas, startBackupDiario, startPollingRupesPendentes, startAvisosPropinaEmAtraso } from "./scheduler";
import { isTelegramConfigured, setTelegramWebhook } from "./telegram";
import { initDbSync } from "./db-sync";
import { query as dbQuery } from "./db";
import { initWebSocketServer } from "./ws";
import { refreshSchoolName, getSchoolNameSync, getFaviconUrlSync, getDirectorGeralSync, getDirectorPedagogicoSync } from "./school-cache";
import { verifyToken } from "./auth";
import { initProtection, dominioMiddleware } from "./protection";
import * as fs from "fs";
import * as path from "path";
import * as jwt from "jsonwebtoken";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ── Evitar que erros assíncronos não capturados derrubem o servidor ────────
process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.warn("[server] ⚠️  Unhandled promise rejection (ignorado):", msg.slice(0, 200));
});
process.on("uncaughtException", (err: Error) => {
  console.error("[server] ❌ Uncaught exception:", err.message);
  // Não terminar — manter o servidor a correr
});

const app = express();
app.disable("etag");
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const WHEEL_SCROLL_FIX_SCRIPT = `
  <script>
    (function() {
      // Fix: React Native Web ScrollViews don't respond to mouse wheel until clicked.
      // Runs on ALL devices — wheel events only fire from a physical mouse/trackpad,
      // never from finger touch, so it's safe to always intercept them.
      // Also applies in Chrome DevTools mobile-emulation mode where isTouchDevice
      // would incorrectly be true despite a real mouse being used.
      var SCROLL_MULTIPLIER = 3; // amplify wheel delta — 1 turn = 3x distance
      function findScrollable(el, deltaY) {
        while (el && el !== document.documentElement) {
          var style = window.getComputedStyle(el);
          var overflowY = style.overflowY;
          var canScroll = overflowY === 'scroll' || overflowY === 'auto';
          if (canScroll) {
            var atTop = deltaY < 0 && el.scrollTop === 0;
            var atBottom = deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            if (!atTop && !atBottom) return el;
          }
          el = el.parentElement;
        }
        return null;
      }
      document.addEventListener('wheel', function(e) {
        var target = e.target;
        if (!target) return;
        var amplified = e.deltaY * SCROLL_MULTIPLIER;
        var scrollable = findScrollable(target, amplified);
        if (scrollable) {
          scrollable.scrollTop += amplified;
          e.preventDefault();
        }
      }, { passive: false, capture: true });
    })();
  </script>`;

const DRAG_SCROLL_SCRIPT = `
  <script>
    (function() {
      // Inject scrollbar styles (desktop only via media query)
      var styleEl = document.createElement('style');
      styleEl.id = 'rnw-hscroll-styles';
      styleEl.textContent = [
        '@media (hover: hover) {',
        '  .rnw-hscroll { cursor: grab !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,0.28) transparent !important; }',
        '  .rnw-hscroll:active { cursor: grabbing !important; }',
        '  .rnw-hscroll::-webkit-scrollbar { display: block !important; height: 5px !important; }',
        '  .rnw-hscroll::-webkit-scrollbar-track { background: transparent !important; }',
        '  .rnw-hscroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.28) !important; border-radius: 99px !important; }',
        '  .rnw-hscroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5) !important; }',
        '}'
      ].join('\\n');
      document.head.appendChild(styleEl);

      var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

      function enableDragScroll(el) {
        if (el._dragEnabled) return;
        el._dragEnabled = true;

        // No touch devices: o browser já trata do scroll horizontal nativamente.
        // NÃO alterar touch-action — a herança de "manipulation" no html é suficiente
        // e não interfere com taps ou scroll vertical em descendentes.
        if (isTouchDevice) {
          el.style.webkitOverflowScrolling = 'touch';
          return;
        }

        // Desktop only: pointer-based drag scroll with threshold so that
        // single clicks are NEVER blocked.
        el.classList.add('rnw-hscroll');
        var DRAG_THRESHOLD = 6;
        var pointerId = null, startX = 0, scrollLeft = 0, hasDragged = false;

        el.addEventListener('pointerdown', function(e) {
          if (e.button !== 0) return;
          pointerId = e.pointerId;
          startX = e.clientX;
          scrollLeft = el.scrollLeft;
          hasDragged = false;
          // NEVER preventDefault here — clicks must stay intact
        });

        el.addEventListener('pointermove', function(e) {
          if (pointerId === null || e.pointerId !== pointerId) return;
          var dx = e.clientX - startX;
          if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD) return;
          if (!hasDragged) {
            hasDragged = true;
            el.setPointerCapture(e.pointerId);
            el.style.cursor = 'grabbing';
          }
          e.preventDefault();
          el.scrollLeft = scrollLeft - dx;
        });

        function endDrag(e) {
          if (pointerId === null || e.pointerId !== pointerId) return;
          pointerId = null;
          el.style.cursor = 'grab';
          if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
          }
        }
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);

        // Block click propagation only when a real drag occurred
        el.addEventListener('click', function(e) {
          if (hasDragged) {
            e.stopPropagation();
            e.preventDefault();
            hasDragged = false;
          }
        }, true);
      }

      function scanAndEnable() {
        document.querySelectorAll('div').forEach(function(el) {
          var ov = el.style.overflowX;
          if ((ov === 'scroll' || ov === 'auto') && !el._dragEnabled) {
            enableDragScroll(el);
          }
        });
      }

      document.addEventListener('DOMContentLoaded', function() {
        scanAndEnable();
        new MutationObserver(scanAndEnable).observe(document.body, { childList: true, subtree: true });
      });
      window.addEventListener('load', scanAndEnable);
    })();
  </script>`;

const CONSOLE_SUPPRESSOR = `
  <script>
    (function() {
      var _w = console.warn.bind(console);
      var _i = console.info.bind(console);
      var _l = console.log.bind(console);
      function isSuppressed(msg) {
        if (typeof msg !== 'string') return false;
        return (
          (msg.indexOf('shadow') >= 0 && msg.indexOf('style props are deprecated') >= 0) ||
          (msg.indexOf('useNativeDriver') >= 0 && msg.indexOf('not supported') >= 0) ||
          (msg.indexOf('pointerEvents') >= 0 && msg.indexOf('deprecated') >= 0) ||
          msg.indexOf('[Intervention]') >= 0 ||
          msg.indexOf('Slow network is detected') >= 0 ||
          msg.indexOf('Fallback font will be used') >= 0 ||
          msg.indexOf('OTS parsing error') >= 0 ||
          msg.indexOf('Failed to decode downloaded font') >= 0
        );
      }
      console.warn = function() { if (!isSuppressed(arguments[0])) _w.apply(console, arguments); };
      console.info = function() { if (!isSuppressed(arguments[0])) _i.apply(console, arguments); };
      console.log  = function() { if (!isSuppressed(arguments[0])) _l.apply(console, arguments); };
      window.addEventListener('error', function(e) {
        if (e && e.message && e.message.indexOf('none') !== -1) {
          console.error('[SIGA-ERR] SyntaxError source:', e.filename || 'unknown', 'line:', e.lineno, 'col:', e.colno, 'msg:', e.message);
        }
      }, true);
    })();
  </script>`;

const FONT_STYLE = `
  <link rel="preload" href="/fonts/Inter_400Regular.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <link rel="preload" href="/fonts/Inter_500Medium.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <link rel="preload" href="/fonts/Inter_600SemiBold.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <link rel="preload" href="/fonts/Inter_700Bold.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <style>
    html, body, #root { min-height: 100%; height: 100%; margin: 0; }
    body { background: #0D1F35; }
    /* Melhora scroll em mobile sem bloquear gestos importantes */
    html, body { overscroll-behavior-y: contain; }
    /* Permite gestos touch naturais */
    html { touch-action: pan-x pan-y; }
    @font-face { font-family: 'Inter_400Regular'; src: url('/fonts/Inter_400Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
    @font-face { font-family: 'Inter_500Medium';  src: url('/fonts/Inter_500Medium.ttf')  format('truetype'); font-weight: 500; font-style: normal; font-display: swap; }
    @font-face { font-family: 'Inter_600SemiBold';src: url('/fonts/Inter_600SemiBold.ttf')format('truetype'); font-weight: 600; font-style: normal; font-display: swap; }
    @font-face { font-family: 'Inter_700Bold';    src: url('/fonts/Inter_700Bold.ttf')    format('truetype'); font-weight: 700; font-style: normal; font-display: swap; }
  </style>`;

const PWA_TAGS = `
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#0D1F35" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="QUETA" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
  <meta name="msapplication-TileColor" content="#0D1F35" />
  <meta name="msapplication-TileImage" content="/icons/icon-192.png" />`;

const PTR_BLOCK_SCRIPT = `
  <script>
    (function() {
      // Bloqueia pull-to-refresh no Android Chrome/WebView — v6
      // MÉTODO PRIMÁRIO: CSS overscroll-behavior-y:contain (Chrome 63+) — suficiente para
      // todos os dispositivos modernos. Este script é apenas o fallback para casos extremos.
      //
      // CORRECÇÃO CRÍTICA v6: adicionado threshold mínimo de 14px antes de chamar
      // preventDefault(). Um toque normal move 1-4px — sem threshold, todos os taps
      // eram cancelados. Um gesto real de pull-to-refresh move 20px+.
      var PTR_MIN_PX = 14;
      var __startY = 0;
      var __startX = 0;
      document.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          __startY = e.touches[0].clientY;
          __startX = e.touches[0].clientX;
        }
      }, { passive: true });
      document.addEventListener('touchmove', function(e) {
        if (e.touches.length !== 1) return;
        var deltaY = e.touches[0].clientY - __startY;
        var deltaX = e.touches[0].clientX - __startX;
        // Ignorar micro-movimentos (taps normais) e gestos horizontais
        if (deltaY < PTR_MIN_PX) return;
        if (Math.abs(deltaX) > deltaY * 0.8) return;
        // Permitir se existir contentor com scroll vertical na cadeia
        var el = e.target;
        while (el && el !== document.documentElement) {
          var ovY = window.getComputedStyle(el).overflowY;
          if (ovY === 'scroll' || ovY === 'auto') return;
          // Detectar contentores de scroll React Native Web que podem ter overflow:hidden
          // no elemento externo mas scrollHeight > clientHeight no interno
          if (el.scrollHeight > el.clientHeight + 4 && ovY !== 'visible') return;
          // Permitir se o elemento ou ancestral tiver classe de scroll conhecida
          var cn = (el.getAttribute && el.getAttribute('class')) || '';
          if (cn.indexOf('drawer-scroll') >= 0 || cn.indexOf('drawer-right-scroll') >= 0) return;
          el = el.parentElement;
        }
        // Gesto real de PTR sem contentor scrollável — bloquear
        e.preventDefault();
      }, { passive: false });
    })();
  </script>`;

const SW_SCRIPT = `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
          .then(function(reg) { console.log('[PWA] Service Worker registered:', reg.scope); })
          .catch(function(err) { console.warn('[PWA] Service Worker registration failed:', err); });
      });
    }
  </script>`;

const APP_DOWNLOAD_BANNER_SCRIPT = `
  <script>
    (function() {
      var ua = navigator.userAgent || '';
      var isAndroid = /Android/i.test(ua);
      var isIOS = /iPad|iPhone|iPod/i.test(ua) && !window.MSStream;
      if (!isAndroid && !isIOS) return;
      var isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
      if (isStandalone) return;
      var DISMISS_KEY = 'siga_app_banner_v2';
      try { if (localStorage.getItem(DISMISS_KEY)) return; } catch(_) {}

      setTimeout(function() {
        if (document.getElementById('siga-app-banner')) return;
        var banner = document.createElement('div');
        banner.id = 'siga-app-banner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99997;' +
          'background:linear-gradient(135deg,#0d1f35 0%,#0a1828 100%);' +
          'border-top:1px solid rgba(212,175,55,0.35);' +
          'padding:12px 16px 12px 16px;display:flex;align-items:center;gap:12px;' +
          'box-shadow:0 -4px 24px rgba(0,0,0,0.55);' +
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

        var icon = '<img src="/icons/icon-192.png" style="width:44px;height:44px;border-radius:12px;flex-shrink:0;" onerror="this.remove()" />';
        var textBlock = '<div style="flex:1;min-width:0;">' +
          '<div style="color:#f4e9c8;font-size:13px;font-weight:700;letter-spacing:0.3px;">' + (window.__ESCOLA_NOME__ || 'Super Escola') + '</div>' +
          '<div style="color:rgba(244,233,200,0.55);font-size:11px;margin-top:1px;">' +
            (isAndroid ? 'Instala a app nativa para melhor experiência' : 'Adiciona ao ecrã inicial para acesso rápido') +
          '</div></div>';

        var actionBtn = '';
        if (isAndroid) {
          actionBtn = '<a id="siga-dl-btn" href="/downloads/superescola.apk" ' +
            'style="background:linear-gradient(135deg,#D4AF37,#b8941f);color:#0a1828;border:none;' +
            'border-radius:10px;padding:9px 16px;font-size:12px;font-weight:800;cursor:pointer;' +
            'white-space:nowrap;flex-shrink:0;text-decoration:none;display:inline-block;" ' +
            'download="SuperEscola.apk">⬇ Download APK</a>';
        } else {
          actionBtn = '<button id="siga-ios-btn" ' +
            'style="background:linear-gradient(135deg,#D4AF37,#b8941f);color:#0a1828;border:none;' +
            'border-radius:10px;padding:9px 14px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
            '&#128279; Como instalar</button>';
        }
        var closeBtn = '<button id="siga-banner-close" ' +
          'style="background:transparent;border:none;color:rgba(244,233,200,0.4);font-size:24px;' +
          'cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;">&times;</button>';

        banner.innerHTML = icon + textBlock + actionBtn + closeBtn;
        document.body.appendChild(banner);

        // Empurra o conteúdo para cima para o botão não ficar tapado pelo banner
        var bannerH = banner.offsetHeight || 72;
        // O root Expo web é position:fixed — ajusta o "bottom" para encolher a área visível
        var appRoot = document.getElementById('root') || document.getElementById('app-root');
        if (appRoot) {
          appRoot.style.bottom = bannerH + 'px';
        } else {
          document.body.style.paddingBottom = bannerH + 'px';
        }

        function dismissBanner() {
          banner.remove();
          if (appRoot) {
            appRoot.style.bottom = '';
          } else {
            document.body.style.paddingBottom = '';
          }
          try { localStorage.setItem(DISMISS_KEY, '1'); } catch(_) {}
        }

        document.getElementById('siga-banner-close').addEventListener('click', dismissBanner);

        if (isIOS) {
          var iosBtn = document.getElementById('siga-ios-btn');
          if (iosBtn) {
            iosBtn.addEventListener('click', function() {
              dismissBanner();
              var tip = document.createElement('div');
              tip.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:flex-end;justify-content:center;padding:0 0 60px 0;';
              tip.innerHTML = '<div style="background:#0d1f35;border:1px solid rgba(212,175,55,0.4);border-radius:18px;padding:22px 24px;max-width:340px;width:90%;text-align:center;font-family:-apple-system,sans-serif;">' +
                '<div style="color:#D4AF37;font-size:32px;margin-bottom:8px;">&#8593;</div>' +
                '<div style="color:#f4e9c8;font-size:15px;font-weight:700;margin-bottom:8px;">Instalar ' + (window.__ESCOLA_NOME__ || 'Super Escola') + '</div>' +
                '<div style="color:rgba(244,233,200,0.7);font-size:13px;line-height:1.6;">' +
                  '1. Toca no botão <strong style="color:#D4AF37;">&#128279; Partilhar</strong> no Safari<br>' +
                  '2. Escolhe <strong style="color:#D4AF37;">&ldquo;Adicionar ao ecrã inicial&rdquo;</strong><br>' +
                  '3. Confirma com <strong style="color:#D4AF37;">Adicionar</strong>' +
                '</div>' +
                '<button style="margin-top:18px;background:#D4AF37;color:#0a1828;border:none;border-radius:10px;padding:10px 32px;font-size:14px;font-weight:800;cursor:pointer;">Fechar</button>' +
              '</div>';
              document.body.appendChild(tip);
              tip.querySelector('button').addEventListener('click', function() { tip.remove(); });
              tip.addEventListener('click', function(e) { if (e.target === tip) tip.remove(); });
            });
          }
        }
      }, 6000);
    })();
  </script>`;

const DEV_CACHE_RESET_SCRIPT = `
  <script>
    (function() {
      if (!('serviceWorker' in navigator)) return;
      var key = '__siga_dev_cache_reset_v9';
      var alreadyRan = false;
      try { alreadyRan = !!localStorage.getItem(key); } catch(_) {}
      if (alreadyRan) return;
      window.addEventListener('load', function() {
        Promise.all([
          navigator.serviceWorker.getRegistrations()
            .then(function(regs) { return Promise.all(regs.map(function(reg) { return reg.unregister(); })); })
            .catch(function() {}),
          window.caches
            ? caches.keys().then(function(keys) { return Promise.all(keys.map(function(key) { return caches.delete(key); })); }).catch(function() {})
            : Promise.resolve()
        ]).then(function() {
          try { localStorage.setItem(key, '1'); } catch(_) {}
          location.reload();
        });
      });
    })();
  </script>`;

const PAGE_LOADER_SCRIPT = `
  <style>
    #__siga_pl{position:fixed;inset:0;z-index:99970;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.18s ease}
    #__siga_pl.show{opacity:1}
    #__siga_pl_card{width:68px;height:68px;border-radius:50%;background:rgba(10,24,40,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.5);border:1px solid rgba(212,175,55,0.13)}
    #__siga_pl_ring{width:38px;height:38px;border-radius:50%;border:3.5px solid rgba(212,175,55,0.18);border-top-color:#D4AF37;border-right-color:#D4AF37;animation:__siga_spin 0.75s linear infinite}
    @keyframes __siga_spin{to{transform:rotate(360deg)}}
  </style>
  <script>
    (function() {
      var SHOW_DELAY = 400, pending = 0, timer = null, shown = false;
      function getEl() { return document.getElementById('__siga_pl'); }
      function show() {
        shown = true;
        var el = getEl();
        if (el) el.classList.add('show');
      }
      function hide() {
        shown = false;
        if (timer) { clearTimeout(timer); timer = null; }
        var el = getEl();
        if (el) el.classList.remove('show');
      }
      function onStart() {
        pending++;
        if (pending === 1 && !timer) {
          timer = setTimeout(function() { timer = null; if (pending > 0) show(); }, SHOW_DELAY);
        }
      }
      function onEnd() {
        pending = Math.max(0, pending - 1);
        if (pending === 0) hide();
      }
      var _fetch = window.fetch;
      window.fetch = function() {
        var args = arguments;
        // só mostrar para chamadas à API (evita assets, fonts, etc.)
        var url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) ? args[0].url : '';
        if (url.indexOf('/api/') !== -1) onStart();
        return _fetch.apply(window, args).then(function(r){ if (url.indexOf('/api/') !== -1) onEnd(); return r; }, function(e){ if (url.indexOf('/api/') !== -1) onEnd(); throw e; });
      };
      document.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('__siga_pl')) {
          var el = document.createElement('div');
          el.id = '__siga_pl';
          el.innerHTML = '<div id="__siga_pl_card"><div id="__siga_pl_ring"></div></div>';
          document.body.appendChild(el);
        }
      });
    })();
  </script>`;

function buildLoadingScreen(schoolName: string, faviconUrl?: string, directorGeral?: string, directorPedagogico?: string): string {
  const safeName = String(schoolName || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const safeDirector = String(directorGeral || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const safeDirectorPed = String(directorPedagogico || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // As letras animadas mostram sempre "SUPER ESCOLA" — nome fixo da aplicação
  const animText = "SUPER ESCOLA";

  // Build letter items array (words split into chars, first char of each word gets word-gap)
  const animWords = animText.split(/\s+/).filter(Boolean);
  const letterItems: { char: string; wordGap: boolean }[] = [];
  animWords.forEach((word, wi) => {
    [...word].forEach((char, ci) => {
      letterItems.push({ char, wordGap: wi > 0 && ci === 0 });
    });
  });
  const letterCount = letterItems.length || 1;

  // Dynamic letter HTML
  const letterHtml = letterItems.map(({ char, wordGap }) =>
    `<span class="sl-letter${wordGap ? ' sl-word-gap' : ''}"><span class="sl-letter-flash"></span><span class="sl-letter-char">${char}</span><span class="sl-letter-shine"></span></span>`
  ).join('\n        ');

  // Dynamic nth-child CSS (one rule-set per letter)
  const letterCss = letterItems.map((_, i) => {
    const n = i + 1;
    const delay  = (0.30 + i * 0.13).toFixed(2);
    const fDelay = (0.30 + i * 0.13 + 0.06).toFixed(2);
    return `    #siga-loader .sl-letters .sl-letter:nth-child(${n}) {
      animation: sl-letter-in 0.52s cubic-bezier(0.16, 1.35, 0.5, 1) ${delay}s forwards;
    }
    #siga-loader .sl-letters .sl-letter:nth-child(${n}) .sl-letter-flash {
      animation: sl-letter-flash 0.48s ease-out ${fDelay}s forwards;
    }
    #siga-loader .sl-letters .sl-letter:nth-child(${n}) .sl-letter-shine {
      animation: sl-letter-shine 0.32s ease-out ${fDelay}s forwards;
    }`;
  }).join('\n');

  // Adjust sizes for letter count
  const fontSize   = letterCount <= 8 ? 64 : letterCount <= 12 ? 52 : letterCount <= 16 ? 42 : 34;
  const letterW    = letterCount <= 8 ? 46 : letterCount <= 12 ? 38 : letterCount <= 16 ? 32 : 26;
  const letterH    = letterCount <= 8 ? 76 : letterCount <= 12 ? 64 : letterCount <= 16 ? 54 : 44;
  const mobFont    = letterCount <= 8 ? 44 : letterCount <= 12 ? 36 : 28;
  const mobW       = letterCount <= 8 ? 30 : letterCount <= 12 ? 25 : 20;
  const mobH       = letterCount <= 8 ? 54 : letterCount <= 12 ? 44 : 36;
  const xsFont     = letterCount <= 8 ? 36 : 26;
  const xsW        = letterCount <= 8 ? 24 : 18;
  const xsH        = letterCount <= 8 ? 44 : 32;
  const lettersEndMs = Math.round((0.30 + (letterCount - 1) * 0.13 + 0.52) * 1000) + 200;

  return `
  <style>
    #siga-loader {
      position: fixed; inset: 0; width: 100%; height: 100%;
      background: #050d18;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 99999;
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    #siga-loader.hide {
      animation: sl-exit 0.55s cubic-bezier(0.4, 0, 1, 1) forwards;
    }
    #siga-loader .sl-bg {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse 75% 60% at 50% 46%, rgba(13,31,53,0.96) 0%, #050d18 100%);
      opacity: 0; animation: sl-bgFadeIn 0.9s ease 0.1s forwards;
    }
    #siga-loader .sl-glow {
      position: absolute; width: 600px; height: 220px; border-radius: 50%;
      background: radial-gradient(ellipse, rgba(212,175,55,0.08) 0%, transparent 70%);
      filter: blur(60px); opacity: 0; pointer-events: none;
      animation: sl-bgFadeIn 1.4s ease 0.8s forwards;
    }
    #siga-loader .sl-card {
      position: relative; display: flex; flex-direction: column;
      align-items: center; text-align: center; padding: 0 16px;
    }
    #siga-loader .sl-letters {
      display: flex; flex-direction: row; align-items: flex-end;
      gap: 2px; margin-bottom: 0;
    }
    #siga-loader .sl-letter {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: ${letterW}px; height: ${letterH}px;
      opacity: 0; transform: translateY(-80px) scale(2.4);
    }
    #siga-loader .sl-letter.sl-word-gap {
      margin-left: 20px;
    }
    #siga-loader .sl-letter-char {
      position: relative; z-index: 2;
      font-size: ${fontSize}px; font-weight: 900; line-height: 1;
      color: #D4AF37;
      text-shadow: 0 0 28px rgba(212,175,55,0.85), 0 0 55px rgba(212,175,55,0.35), 0 3px 10px rgba(0,0,0,0.9);
    }
    #siga-loader .sl-letter-flash {
      position: absolute; width: 90px; height: 90px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,235,110,0.88) 0%, rgba(212,175,55,0.55) 32%, transparent 68%);
      filter: blur(8px); opacity: 0; transform: scale(0.2); z-index: 1; pointer-events: none;
    }
    #siga-loader .sl-letter-shine {
      position: absolute; top: 6px; left: 50%; transform: translateX(-50%);
      width: 28px; height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent);
      opacity: 0; z-index: 3; pointer-events: none;
    }
    #siga-loader .sl-line {
      width: 0; height: 1px; margin-top: 12px; margin-bottom: 14px; opacity: 0;
      background: linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent);
    }
    #siga-loader .sl-name {
      font-size: 12px; font-weight: 700; letter-spacing: 3.5px; text-transform: uppercase;
      background: linear-gradient(90deg, #b8941f 0%, #f4e9c8 35%, #D4AF37 60%, #f4e9c8 80%, #b8941f 100%);
      background-size: 300% auto;
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      opacity: 0; transform: translateY(10px);
    }
    #siga-loader .sl-director {
      color: rgba(244,233,200,0.52); font-size: 10px; letter-spacing: 1.5px;
      font-weight: 500; margin-top: 4px; margin-bottom: 0; opacity: 0;
      animation: none;
    }
    #siga-loader.letters-done .sl-director {
      animation: sl-fadeUp 0.45s ease 0.13s forwards;
    }
    #siga-loader .sl-subdirector {
      color: rgba(244,233,200,0.38); font-size: 9.5px; letter-spacing: 1.5px;
      font-weight: 400; margin-top: 2px; margin-bottom: 0; opacity: 0;
      animation: none;
    }
    #siga-loader.letters-done .sl-subdirector {
      animation: sl-fadeUp 0.45s ease 0.22s forwards;
    }
    #siga-loader .sl-tagline {
      color: rgba(244,233,200,0.28); font-size: 10px; letter-spacing: 2.5px;
      text-transform: uppercase; font-weight: 500; margin-top: 6px; margin-bottom: 30px; opacity: 0;
    }
    #siga-loader .sl-bar-wrap { opacity: 0; }
    #siga-loader .sl-bar {
      width: 230px; height: 2px; border-radius: 2px;
      background: rgba(212,175,55,0.1); overflow: hidden; position: relative;
    }
    #siga-loader .sl-bar::after {
      content: ''; position: absolute; top: 0; left: 0; height: 100%; width: 42%;
      background: linear-gradient(90deg, transparent 0%, #D4AF37 50%, rgba(212,175,55,0.2) 100%);
      border-radius: 2px; animation: sl-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite;
    }
    #siga-loader .sl-status {
      margin-top: 10px; font-size: 10px; color: rgba(244,233,200,0.26);
      letter-spacing: 2px; text-transform: uppercase; font-weight: 500;
    }
    #siga-loader .sl-dot {
      display: inline-block; width: 3px; height: 3px; border-radius: 50%;
      background: #D4AF37; margin: 0 1.5px; vertical-align: middle;
      animation: sl-blink 1.4s infinite both;
    }
    #siga-loader .sl-dot:nth-child(2) { animation-delay: 0.22s; }
    #siga-loader .sl-dot:nth-child(3) { animation-delay: 0.44s; }
    
${letterCss}
    #siga-loader.letters-done .sl-line {
      animation: sl-lineGrow 0.65s cubic-bezier(0.4,0,0.2,1) forwards;
    }
    #siga-loader.letters-done .sl-name {
      animation: sl-nameIn 0.55s cubic-bezier(0.2,0.8,0.4,1) 0.08s forwards,
                 sl-nameShine 3.8s linear 0.75s infinite;
    }
    #siga-loader.letters-done .sl-tagline {
      animation: sl-fadeUp 0.45s ease 0.18s forwards;
    }
    #siga-loader.letters-done .sl-bar-wrap {
      animation: sl-fadeUp 0.45s ease 0.38s forwards;
    }
    #siga-loader.letters-done .sl-letter-char {
      animation: sl-letterGlow 2.8s ease-in-out infinite alternate;
    }
    @keyframes sl-exit { 0% { opacity:1; } 100% { opacity:0; transform:scale(1.03); } }
    @keyframes sl-bgFadeIn { to { opacity:1; } }
    @keyframes sl-letter-in {
      0%   { opacity:0; transform:translateY(-80px) scale(2.4); filter:blur(6px); }
      52%  { opacity:1; transform:translateY(7px) scale(0.86); filter:blur(0); }
      74%  { transform:translateY(-4px) scale(1.07); }
      100% { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes sl-letter-flash {
      0%   { opacity:0; transform:scale(0.2); }
      32%  { opacity:1; transform:scale(1.4); }
      100% { opacity:0; transform:scale(2.4); }
    }
    @keyframes sl-letter-shine {
      0%   { opacity:0; transform:translateX(-50%) scaleX(0.2); }
      38%  { opacity:1; transform:translateX(-50%) scaleX(1); }
      100% { opacity:0; transform:translateX(-50%) scaleX(1.6); }
    }
    @keyframes sl-letterGlow {
      from { text-shadow: 0 0 18px rgba(212,175,55,0.55), 0 0 45px rgba(212,175,55,0.18), 0 3px 10px rgba(0,0,0,0.9); }
      to   { text-shadow: 0 0 32px rgba(212,175,55,0.95), 0 0 75px rgba(212,175,55,0.48), 0 3px 10px rgba(0,0,0,0.9); }
    }
    @keyframes sl-lineGrow { to { width:280px; opacity:1; } }
    @keyframes sl-nameIn { to { opacity:1; transform:translateY(0); } }
    @keyframes sl-nameShine {
      0%   { background-position:300% center; }
      100% { background-position:-300% center; }
    }
    @keyframes sl-fadeUp {
      0%   { opacity:0; transform:translateY(8px); }
      100% { opacity:1; transform:translateY(0); }
    }
    @keyframes sl-sweep { 0% { left:-45%; } 100% { left:115%; } }
    @keyframes sl-blink {
      0%,80%,100% { opacity:0.15; transform:scale(0.8); }
      40%          { opacity:1;    transform:scale(1.3); }
    }
    .sl-particle {
      position:absolute; border-radius:50%; pointer-events:none;
      background:radial-gradient(circle,#f4e9c8 0%,#D4AF37 55%,transparent 100%); opacity:0;
    }
    @media (max-width:600px) {
      #siga-loader .sl-letter { width:${mobW}px; height:${mobH}px; }
      #siga-loader .sl-letter-char { font-size:${mobFont}px; }
      #siga-loader .sl-letter-flash { width:60px; height:60px; }
      #siga-loader .sl-bar { width:180px; }
      #siga-loader .sl-letter.sl-word-gap { margin-left: 12px; }
    }
    @media (max-width:400px) {
      #siga-loader .sl-letter { width:${xsW}px; height:${xsH}px; }
      #siga-loader .sl-letter-char { font-size:${xsFont}px; }
    }
  </style>
  <div id="siga-loader" role="status" aria-live="polite" aria-label="A carregar ${safeName}">
    <div class="sl-bg"></div>
    <div class="sl-glow"></div>
    <div id="sl-particles"></div>
    <div class="sl-card">
      <div class="sl-letters">
        ${letterHtml}
      </div>
      <div class="sl-line"></div>
      ${safeName ? `<div class="sl-name">${safeName}</div>` : ''}
      ${safeDirector ? `<div class="sl-director">Dir. Geral: ${safeDirector}</div>` : ''}
      ${safeDirectorPed ? `<div class="sl-subdirector">Sub-Dir. Pedagógico: ${safeDirectorPed}</div>` : ''}
      <div class="sl-tagline">Sistema Integrado de Gestão Académica</div>
      <div class="sl-bar-wrap">
        <div class="sl-bar"></div>
        <div class="sl-status">A preparar a sua sessão<span class="sl-dot"></span><span class="sl-dot"></span><span class="sl-dot"></span></div>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var loader = document.getElementById('siga-loader');
      var container = document.getElementById('sl-particles');
      if (!container || !loader) return;
      var W = window.innerWidth, H = window.innerHeight;
      var cx = W / 2, cy = H / 2;
      function rand(a, b) { return a + Math.random() * (b - a); }

      /* Impact burst particles — one burst per letter as it lands */
      var letterEls = loader.querySelectorAll('.sl-letter');
      letterEls.forEach(function(el, idx) {
        var delay = 0.3 + idx * 0.13;
        setTimeout(function() {
          var rect = el.getBoundingClientRect();
          var lx = rect.left + rect.width / 2;
          var ly = rect.top + rect.height / 2;
          for (var i = 0; i < 10; i++) {
            (function(i) {
              var p = document.createElement('div');
              p.className = 'sl-particle';
              var size = rand(2, 5.5);
              var angle = (i / 10) * 2 * Math.PI + rand(-0.4, 0.4);
              var dist = rand(18, 90);
              var dx = Math.cos(angle) * dist;
              var dy = Math.sin(angle) * dist;
              var dur = rand(0.35, 0.75);
              p.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + lx + 'px;top:' + ly + 'px;transform:translate(-50%,-50%);box-shadow:0 0 ' + (size * 2.2) + 'px rgba(212,175,55,0.95);';
              container.appendChild(p);
              var start = null;
              var durMs = dur * 1000;
              function step(ts) {
                if (!start) start = ts;
                var t = Math.min((ts - start) / durMs, 1);
                var eased = 1 - Math.pow(1 - t, 3);
                var alpha = t < 0.18 ? t / 0.18 : t > 0.55 ? (1 - t) / 0.45 : 1;
                p.style.opacity = String(Math.max(0, Math.min(alpha * rand(0.65, 1), 1)));
                p.style.transform = 'translate(calc(-50% + ' + (dx * eased) + 'px), calc(-50% + ' + ((dy * eased) - 28 * eased) + 'px)) scale(' + (1 - 0.72 * eased) + ')';
                if (t < 1) requestAnimationFrame(step);
                else if (p.parentNode) p.parentNode.removeChild(p);
              }
              requestAnimationFrame(step);
            })(i);
          }
        }, Math.round((delay + 0.09) * 1000));
      });

      /* Trigger "letters-done" class when last letter finishes animating */
      setTimeout(function() {
        if (loader) loader.classList.add('letters-done');
      }, ${lettersEndMs});

      /* Rising gold sparkle particles */
      var risingInterval = null;
      function spawnRising() {
        var p = document.createElement('div');
        p.className = 'sl-particle';
        var size = rand(1.5, 4.2);
        var x = rand(cx - 240, cx + 240);
        var dur = rand(2, 4.5);
        var driftX = rand(-38, 38);
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = x + 'px';
        p.style.top = (cy + rand(15, 65)) + 'px';
        p.style.boxShadow = '0 0 ' + (size * 2.5) + 'px rgba(212,175,55,0.75)';
        container.appendChild(p);
        var start = null, durMs = dur * 1000;
        function step(ts) {
          if (!start) start = ts;
          var t = Math.min((ts - start) / durMs, 1);
          var alpha = t < 0.1 ? t / 0.1 : t > 0.7 ? (1 - t) / 0.3 : 1;
          p.style.opacity = String(alpha * rand(0.45, 0.88));
          p.style.transform = 'translate(' + (driftX * Math.sin(t * Math.PI)) + 'px,' + (-290 * t) + 'px) scale(' + (1 - 0.68 * t) + ')';
          if (t < 1) requestAnimationFrame(step);
          else if (p.parentNode) p.parentNode.removeChild(p);
        }
        requestAnimationFrame(step);
      }
      setTimeout(function() {
        spawnRising();
        risingInterval = setInterval(function() {
          spawnRising();
          if (Math.random() > 0.45) spawnRising();
        }, 280);
      }, 650);

      /* Stop rising particles when loader hides */
      var mo = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          if (m.type === 'attributes' && loader.classList.contains('hide')) {
            if (risingInterval) { clearInterval(risingInterval); risingInterval = null; }
            mo.disconnect();
          }
        });
      });
      mo.observe(loader, { attributes: true });
    })();
  </script>`;
}

const LOADING_SCREEN_SCRIPT = `
  <script>
    (function() {
      var loader = document.getElementById('siga-loader');
      if (!loader) return;
      var root = document.getElementById('root');
      var removed = false;
      var reactReady = false;
      var MIN_SHOW_MS = 2200;
      var shownAt = Date.now();
      function hide() {
        if (removed) return;
        removed = true;
        loader.classList.add('hide');
        setTimeout(function() { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 450);
      }
      function tryHide() {
        if (!reactReady) return;
        var elapsed = Date.now() - shownAt;
        var remaining = Math.max(0, MIN_SHOW_MS - elapsed);
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() { setTimeout(hide, Math.max(120, remaining)); });
        } else {
          setTimeout(hide, Math.max(250, remaining));
        }
      }
      var obs = new MutationObserver(function() {
        if (root && root.firstElementChild) {
          reactReady = true;
          obs.disconnect();
          tryHide();
        }
      });
      if (root) obs.observe(root, { childList: true });
      setTimeout(hide, 4500); // absolute safety fallback
    })();
  </script>`;

const MOBILE_TOUCH_CSS = `<style id="siga-mobile-touch">
  html, body {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    -webkit-text-size-adjust: 100%;
  }
  *, *::before, *::after {
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    box-sizing: border-box;
  }
  button, a, [role="button"] {
    touch-action: manipulation;
    cursor: pointer;
  }
  input, textarea, select {
    touch-action: auto;
    cursor: text;
  }
  [data-testid="scroll-view"], [style*="overflow-y: scroll"], [style*="overflow-y: auto"] {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
  /* Drawer/menu items — override pan-y herdado dos wrappers internos do ScrollView.
     Usa selectores de alta especificidade para garantir que taps funcionam
     em navegadores móveis mesmo com touch-action: pan-y nos ancestrais. */
  .drawer-scroll .drawer-cta-card,
  .drawer-scroll .drawer-nav-item,
  .drawer-scroll .drawer-section-header,
  .drawer-scroll .drawer-sub-item,
  .drawer-scroll [role="button"] {
    touch-action: manipulation !important;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    cursor: pointer;
  }
</style>`;

const DESKTOP_SCROLLBAR_CSS = `<style id="siga-desktop-scrollbar">
  /* Scrollbar vertical sempre visível no desktop — classe adicionada via JS */
  .siga-vscroll {
    scrollbar-width: auto !important;
    scrollbar-color: #4a90d9 rgba(255,255,255,0.08) !important;
  }
  .siga-vscroll::-webkit-scrollbar {
    display: block !important;
    width: 10px !important;
  }
  .siga-vscroll::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.06) !important;
    border-radius: 6px !important;
    margin: 4px 0 !important;
  }
  .siga-vscroll::-webkit-scrollbar-thumb {
    background: #4a90d9 !important;
    border-radius: 6px !important;
    border: 2px solid transparent !important;
    background-clip: padding-box !important;
    min-height: 48px !important;
  }
  .siga-vscroll::-webkit-scrollbar-thumb:hover {
    background: #6aaff0 !important;
    border-radius: 6px !important;
    border: 2px solid transparent !important;
    background-clip: padding-box !important;
  }
  .siga-vscroll::-webkit-scrollbar-thumb:active {
    background: #90c8ff !important;
    border-radius: 6px !important;
    border: 1px solid transparent !important;
    background-clip: padding-box !important;
  }
</style>`;

const VERTICAL_SCROLLBAR_SCRIPT = `
  <script id="siga-vscroll-script">
    (function() {
      // Apenas ignorar em ecrãs pequenos com toque (telemóveis/tablets reais)
      var isSmallTouch = (window.innerWidth < 768) && ('ontouchstart' in window);
      if (isSmallTouch) return;

      function markScrollContainers() {
        var els = document.querySelectorAll('div, section, main');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el._sigaVScrollMarked) continue;
          try {
            var cs = window.getComputedStyle(el);
            var ovY = cs.overflowY;
            if (ovY === 'scroll' || ovY === 'auto') {
              el._sigaVScrollMarked = true;
              el.classList.add('siga-vscroll');
            }
          } catch(e) {}
        }
      }

      function init() {
        markScrollContainers();
        var obs = new MutationObserver(function(mutations) {
          var hasNew = false;
          for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length > 0) { hasNew = true; break; }
          }
          if (hasNew) setTimeout(markScrollContainers, 80);
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // Re-verificar após a app estar totalmente carregada
        setTimeout(markScrollContainers, 1500);
        setTimeout(markScrollContainers, 3000);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
      window.addEventListener('load', markScrollContainers);
    })();
  </script>`;

const KEYBOARD_SCROLL_SCRIPT = `
  <script id="siga-keyboard-scroll">
    (function() {
      var isSmallTouch = (window.innerWidth < 768) && ('ontouchstart' in window);
      if (isSmallTouch) return;

      var ARROW_STEP = 120;
      var PAGE_FRAC  = 0.85;

      var SKIP_TAGS  = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };
      var SKIP_ROLES = { combobox: 1, listbox: 1, option: 1, slider: 1, spinbutton: 1, textbox: 1, tree: 1, treegrid: 1, treeitem: 1 };

      function activeIsEditable() {
        var el = document.activeElement;
        if (!el) return false;
        if (SKIP_TAGS[el.tagName]) return true;
        if (el.isContentEditable) return true;
        var role = (el.getAttribute('role') || '').toLowerCase();
        if (SKIP_ROLES[role]) return true;
        return false;
      }

      function nearestScrollable(start) {
        var el = start;
        while (el && el !== document.documentElement) {
          var cs = window.getComputedStyle(el);
          var ov = cs.overflowY;
          if ((ov === 'scroll' || ov === 'auto') && el.scrollHeight > el.clientHeight + 4) {
            return el;
          }
          el = el.parentElement;
        }
        return null;
      }

      function bestScrollable() {
        var candidates = document.querySelectorAll('.siga-vscroll');
        var best = null, bestArea = 0;
        for (var i = 0; i < candidates.length; i++) {
          var c = candidates[i];
          if (c.scrollHeight <= c.clientHeight + 4) continue;
          var r = c.getBoundingClientRect();
          var area = r.width * r.height;
          if (area > bestArea) { bestArea = area; best = c; }
        }
        return best;
      }

      document.addEventListener('keydown', function(e) {
        var key = e.key;
        if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'PageUp' && key !== 'PageDown') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (activeIsEditable()) return;

        var active = document.activeElement;
        var target = (active && active !== document.body)
          ? nearestScrollable(active)
          : null;
        if (!target) target = bestScrollable();
        if (!target) return;

        var delta = 0;
        if (key === 'ArrowUp')   delta = -ARROW_STEP;
        if (key === 'ArrowDown') delta =  ARROW_STEP;
        if (key === 'PageUp')    delta = -Math.round(window.innerHeight * PAGE_FRAC);
        if (key === 'PageDown')  delta =  Math.round(window.innerHeight * PAGE_FRAC);

        if (delta === 0) return;
        e.preventDefault();
        target.scrollBy({ top: delta, behavior: 'smooth' });
      }, { passive: false });
    })();
  </script>`;

function injectPwaTags(html: string): string {
  let result = html;

  // Inject mobile touch CSS as the very first style — fixes iOS Safari not responding to taps
  if (!result.includes('siga-mobile-touch')) {
    result = result.replace("<head>", `<head>\n${MOBILE_TOUCH_CSS}`);
  }

  // Inject desktop scrollbar CSS — makes vertical scrollbars always visible on desktop
  if (!result.includes('siga-desktop-scrollbar')) {
    result = result.replace("<head>", `<head>\n${DESKTOP_SCROLLBAR_CSS}`);
  }

  // Inject vertical scrollbar script — marks scroll containers with class for CSS targeting
  if (!result.includes('siga-vscroll-script')) {
    result = result.replace("</body>", `${VERTICAL_SCROLLBAR_SCRIPT}\n</body>`);
  }

  // Inject keyboard scroll script — arrow keys + PgUp/PgDn navigate scroll containers
  if (!result.includes('siga-keyboard-scroll')) {
    result = result.replace("</body>", `${KEYBOARD_SCROLL_SCRIPT}\n</body>`);
  }

  // Inject console suppressor as the very first thing in <head> so it runs before any JS bundle
  if (!result.includes('style props are deprecated')) {
    result = result.replace("<head>", `<head>\n${CONSOLE_SUPPRESSOR}`);
  }

  // Always ensure the proper mobile viewport tag is present
  // Melhorado: permite user-scalable para melhor acessibilidade e touch
  if (!result.includes('name="viewport"')) {
    result = result.replace("<head>", `<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />`);
  } else {
    // Replace any existing viewport meta with improved one (allows zoom for accessibility)
    result = result.replace(
      /<meta[^>]*name=["']viewport["'][^>]*>/gi,
      `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />`
    );
  }

  if (!html.includes("Inter_400Regular")) {
    result = result.replace("</head>", `${FONT_STYLE}\n</head>`);
  }

  if (!result.includes('_dragEnabled')) {
    result = result.replace("</body>", `${DRAG_SCROLL_SCRIPT}\n</body>`);
  }

  if (!result.includes('findScrollable')) {
    result = result.replace("</body>", `${WHEEL_SCROLL_FIX_SCRIPT}\n</body>`);
  }

  // Desativado: PTR_BLOCK_SCRIPT estava interferindo com gestos touch normais
  // if (!result.includes('__ptr_v5')) {
  //   result = result.replace("</head>", `${PTR_BLOCK_SCRIPT}\n</head>`);
  // }

  // Injectar nome da escola como variável JS global (usada pelo banner e outros scripts client-side)
  const escolaNomeJs = JSON.stringify(getSchoolNameSync());
  result = result.replace("</head>", `  <script>window.__ESCOLA_NOME__=${escolaNomeJs};</script>\n</head>`);

  if (!result.includes('siga_app_banner_v1')) {
    result = result.replace("</body>", `${APP_DOWNLOAD_BANNER_SCRIPT}\n</body>`);
  }

  // Always inject icon font CSS + preload hints for mobile web support
  if (!result.includes("Ionicons")) {
    const iconFontsCss = `
  <link rel="preload" href="/icon-fonts/Ionicons.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <link rel="preload" href="/icon-fonts/MaterialCommunityIcons.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <link rel="preload" href="/icon-fonts/MaterialIcons.ttf" as="font" type="font/ttf" crossorigin="anonymous" />
  <style>
    @font-face { font-family: 'Ionicons'; src: url('/icon-fonts/Ionicons.ttf') format('truetype'); font-display: fallback; }
    @font-face { font-family: 'MaterialCommunityIcons'; src: url('/icon-fonts/MaterialCommunityIcons.ttf') format('truetype'); font-display: fallback; }
    @font-face { font-family: 'MaterialIcons'; src: url('/icon-fonts/MaterialIcons.ttf') format('truetype'); font-display: fallback; }
    @font-face { font-family: 'FontAwesome5_Regular'; src: url('/icon-fonts/FontAwesome5_Regular.ttf') format('truetype'); font-display: fallback; }
    @font-face { font-family: 'FontAwesome5_Solid'; src: url('/icon-fonts/FontAwesome5_Solid.ttf') format('truetype'); font-display: fallback; }
    @font-face { font-family: 'FontAwesome5_Brands'; src: url('/icon-fonts/FontAwesome5_Brands.ttf') format('truetype'); font-display: fallback; }
  </style>`;
    result = result.replace("</head>", `${iconFontsCss}\n</head>`);
  }

  // Always remove any Expo-generated manifest link and replace with ours
  result = result.replace(/<link[^>]*rel=["']manifest["'][^>]*>/gi, "");

  // Always inject our PWA tags and service worker script
  result = result.replace("</head>", `${PWA_TAGS}\n</head>`);

  // Injectar favicon dinâmico se configurado (sobrepõe o padrão do Expo)
  const dynamicFavicon = getFaviconUrlSync();
  if (dynamicFavicon) {
    result = result.replace(/<link[^>]*rel=["']icon["'][^>]*>/gi, "");
    result = result.replace(/<link[^>]*rel=["']shortcut icon["'][^>]*>/gi, "");
    result = result.replace("</head>", `  <link rel="icon" type="image/png" href="${dynamicFavicon}" />\n  <link rel="shortcut icon" href="${dynamicFavicon}" />\n</head>`);
  }

  if (process.env.NODE_ENV === "production") {
    if (!result.includes("serviceWorker.register")) {
      result = result.replace("</body>", `${SW_SCRIPT}\n</body>`);
    }
  } else if (!result.includes("__siga_dev_cache_reset_v9")) {
    result = result.replace("</body>", `${DEV_CACHE_RESET_SCRIPT}\n</body>`);
  }

  if (!result.includes("siga-loader")) {
    const loadingScreen = `${buildLoadingScreen(getSchoolNameSync(), getFaviconUrlSync(), getDirectorGeralSync(), getDirectorPedagogicoSync())}${LOADING_SCREEN_SCRIPT}`;
    result = result.replace("<div id=\"root\"></div>", `<div id="root"></div>\n${loadingScreen}`);
  }

  if (!result.includes("__siga_pl")) {
    result = result.replace("</head>", `${PAGE_LOADER_SCRIPT}\n</head>`);
  }

  return result;
}

function setupFrameHeaders(app: express.Application) {
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    // Clear-Site-Data removed — was causing infinite reload loop via sessionStorage clear
    next();
  });
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    // Build allowed origins set
    const allowedOrigins = new Set<string>();
    if (process.env.REPLIT_DEV_DOMAIN) allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => allowedOrigins.add(`https://${d.trim()}`));
    }
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o) => allowedOrigins.add(o.trim()));
    }
    // Always allow the server's own HOST header (same-server requests with origin set)
    const host = req.header("host");
    if (host) {
      allowedOrigins.add(`http://${host}`);
      allowedOrigins.add(`https://${host}`);
    }

    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    // No configured origins = allow all (auth is JWT via Authorization header, not cookies)
    const noConfiguredOrigins = !process.env.REPLIT_DEV_DOMAIN && !process.env.REPLIT_DOMAINS &&
      !process.env.ALLOWED_ORIGINS;
    const isAllowed = !origin || isLocalhost || allowedOrigins.has(origin) || noConfiguredOrigins;

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (origin) res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function setupApiCacheHeaders(app: express.Application) {
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  });
}

function setupRequestTimeout(app: express.Application) {
  // Abort hanging API requests after 25 seconds to prevent ERR_CONNECTION_TIMED_OUT
  app.use("/api", (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: "O pedido demorou demasiado tempo. Tente novamente." });
      }
    }, 25000);
    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));
    next();
  });
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function setupMobileManifest(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    next();
  });
}

function setupPwaAssets(app: express.Application) {
  const publicPath = path.resolve(process.cwd(), "public");

  // Dedicated route for manifest.json — always accessible with open CORS
  app.get("/manifest.json", (_req: Request, res: Response) => {
    const manifestPath = path.join(publicPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: "manifest.json not found" });
    }
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(fs.readFileSync(manifestPath, "utf-8"));
  });

  // Dedicated route for service worker — must be served from root scope
  app.get("/sw.js", (_req: Request, res: Response) => {
    const swPath = path.join(publicPath, "sw.js");
    if (!fs.existsSync(swPath)) {
      return res.status(404).send("// sw not found");
    }
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(fs.readFileSync(swPath, "utf-8"));
  });

  // APK download endpoint — serves from public/downloads/superescola.apk
  // Place the built APK file at public/downloads/superescola.apk to activate
  app.get("/downloads/:filename", (req: Request, res: Response) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(publicPath, "downloads", safeFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Ficheiro não encontrado. Coloca o APK em public/downloads/superescola.apk" });
    }
    if (safeFilename.endsWith(".apk")) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    }
    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(filePath);
  });

  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath, { setHeaders: (res, filePath) => {
      if (filePath.endsWith(".png") || filePath.endsWith(".jpg") || filePath.endsWith(".ico")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    }}));
    log("PWA assets served from /public");
  }
}

async function setupWebProxy(app: express.Application) {
  const EXPO_WEB_PORT = parseInt(process.env.EXPO_WEB_PORT || "3001", 10);

  log(`Development mode: proxying web requests to Expo web server on port ${EXPO_WEB_PORT}`);

  let createProxyMiddleware: any;
  let responseInterceptor: any;
  try {
    const hpm = await import("http-proxy-middleware");
    createProxyMiddleware = hpm.createProxyMiddleware;
    responseInterceptor = hpm.responseInterceptor;
  } catch (e) {
    log("http-proxy-middleware not available — web proxy disabled.");
    return;
  }

  app.use(
    createProxyMiddleware({
      target: `http://localhost:${EXPO_WEB_PORT}`,
      changeOrigin: true,
      ws: true,
      selfHandleResponse: true,
      proxyTimeout: 120000,
      timeout: 120000,
      headers: {
        host: `localhost:${EXPO_WEB_PORT}`,
        origin: `http://localhost:${EXPO_WEB_PORT}`,
      },
      on: {
        proxyRes: responseInterceptor(async (responseBuffer: Buffer, proxyRes: any, _req: any, res: any) => {
          res.removeHeader('X-Frame-Options');
          res.removeHeader('Content-Security-Policy');
          res.removeHeader('x-frame-options');
          res.removeHeader('content-security-policy');

          const contentType = proxyRes.headers["content-type"] || "";
          if (contentType.includes("javascript") || contentType.includes("application/json")) {
            res.setHeader("Cache-Control", "no-cache");
            res.removeHeader("Pragma");
            res.removeHeader("Expires");
            res.removeHeader("Surrogate-Control");
            return responseBuffer;
          }
          if (!contentType.includes("text/html")) {
            return responseBuffer;
          }
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          const html = responseBuffer.toString("utf-8");
          return injectPwaTags(html);
        }),
        error: (_err: any, _req: any, res: any) => {
          if (res && "status" in res) {
            res.status(503).send(
              `<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0D1F35;color:#fff">
              <div style="text-align:center">
                <h2>A iniciar o servidor web...</h2>
                <p>Aguarda um momento enquanto o servidor Expo web arranca.</p>
                <script>setTimeout(()=>location.reload(),8000)</script>
              </div>
              </body></html>`,
            );
          }
        },
      },
    }),
  );
}

function setupStaticWeb(app: express.Application) {
  const distPath = path.resolve(process.cwd(), "dist");

  if (fs.existsSync(distPath)) {
    log(`Production mode: serving static web build from ${distPath}`);

    // Content-hashed assets — long cache in production, no-cache in development so patched files are always picked up
    const jsCacheControl = process.env.NODE_ENV === "production"
      ? "public, max-age=31536000, immutable"
      : "no-store, no-cache, must-revalidate";
    app.use("/_expo/static", express.static(path.join(distPath, "_expo/static"), {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", jsCacheControl);
      },
    }));

    // Font files — long cache
    app.use("/fonts", express.static(path.join(distPath, "fonts"), {
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "public, max-age=604800");
      },
    }));

    // All other static assets (images, icons, manifest) — 1 day cache
    // index: false ensures index.html is NOT served here, so all HTML requests
    // fall through to the *splat handler where injectPwaTags() transforms the HTML
    app.use(express.static(distPath, {
      index: false,
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "public, max-age=86400");
      },
    }));

    app.get("*splat", async (req: Request, res: Response) => {
      // Let Replit infrastructure handle its own internal paths
      if (req.path.startsWith("/__replco") || req.path.startsWith("/__repl")) {
        return res.status(404).send("Not Found");
      }

      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // Forçar refresh do cache da escola antes de gerar o HTML
        // Garante que o flash screen sempre tem dados actuais da BD
        await refreshSchoolName().catch(() => {});
        const html = fs.readFileSync(indexPath, "utf-8");
        const modified = injectPwaTags(html);
        res.send(modified);
      } else {
        res.status(404).send("Not Found");
      }
    });
  } else {
    log("WARNING: dist/ folder not found. Run 'npx expo export -p web' to build.");
  }
}

// ── Manutenção ────────────────────────────────────────────────────────────────
const MAINTENANCE_FILE = path.resolve(process.cwd(), ".maintenance");
const BYPASS_COOKIE    = "siga_admin_bypass";
const ADMIN_ROLES      = new Set(["ceo", "pca", "admin"]);

interface MaintenanceInfo {
  active: boolean;
  message: string;
  activatedAt?: string;
}

// Cache de memória para evitar leitura à BD em cada pedido
let _mCache: { info: MaintenanceInfo | null; ts: number } = { info: null, ts: 0 };
const MCACHE_TTL = 20_000; // 20 segundos

function _invalidateMCache() { _mCache = { info: null, ts: 0 }; }

function readMaintenanceFile(): MaintenanceInfo | null {
  try {
    if (!fs.existsSync(MAINTENANCE_FILE)) return null;
    const raw = fs.readFileSync(MAINTENANCE_FILE, "utf-8");
    const data = JSON.parse(raw) as MaintenanceInfo;
    return data.active ? data : null;
  } catch { return null; }
}

async function getMaintenanceState(): Promise<MaintenanceInfo | null> {
  const now = Date.now();
  if (now - _mCache.ts < MCACHE_TTL) return _mCache.info;

  // 1. Ficheiro local (dev)
  const fileInfo = readMaintenanceFile();
  if (fileInfo) {
    _mCache = { info: fileInfo, ts: now };
    return fileInfo;
  }

  // 2. Base de dados (funciona em produção)
  try {
    const rows = await dbQuery<{ manutencao_ativa: boolean; manutencao_mensagem: string; manutencao_ativada_em: string | null }>(
      `SELECT manutencao_ativa, manutencao_mensagem, manutencao_ativada_em FROM public.config_geral LIMIT 1`, []
    );
    const row = rows[0];
    if (row?.manutencao_ativa) {
      const info: MaintenanceInfo = {
        active: true,
        message: row.manutencao_mensagem || "Manutenção em curso. O sistema voltará em breve.",
        activatedAt: row.manutencao_ativada_em ?? new Date().toISOString(),
      };
      _mCache = { info, ts: now };
      return info;
    }
  } catch { /* silencioso — se a coluna não existir ainda */ }

  _mCache = { info: null, ts: now };
  return null;
}

async function setMaintenanceInDb(active: boolean, message = ""): Promise<void> {
  try {
    await dbQuery(
      `UPDATE public.config_geral SET manutencao_ativa=$1, manutencao_mensagem=$2, manutencao_ativada_em=$3`,
      [active, message, active ? new Date().toISOString() : null]
    );
  } catch { /* silencioso se a migração ainda não foi aplicada */ }
}

function jwtRoleFromToken(token: string): string | null {
  try {
    const payload = verifyToken(token);
    if (!payload) return null;
    return (payload.role || "") as string;
  } catch { return null; }
}

function hasAdminBypass(req: Request): boolean {
  const cookies = req.headers.cookie || "";
  if (cookies.includes(`${BYPASS_COOKIE}=1`)) return true;
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const role = jwtRoleFromToken(authHeader.slice(7));
    if (role && ADMIN_ROLES.has(role)) return true;
  }
  return false;
}

function setupMaintenanceMode(app: express.Application) {
  // Endpoints de API para a página de manutenção (sempre disponíveis)
  app.get("/api/manutencao-status", async (_req: Request, res: Response) => {
    const info = await getMaintenanceState();
    res.setHeader("Cache-Control", "no-cache");
    res.json(info ? { active: true, message: info.message, activatedAt: info.activatedAt }
                   : { active: false });
  });

  app.post("/api/manutencao/check-bypass", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.json({ allowed: false });
    const role = jwtRoleFromToken(authHeader.slice(7));
    res.json({ allowed: !!(role && ADMIN_ROLES.has(role)) });
  });

  app.post("/api/manutencao/bypass", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(403).json({ ok: false });
    const role = jwtRoleFromToken(authHeader.slice(7));
    if (!role || !ADMIN_ROLES.has(role)) return res.status(403).json({ ok: false });
    res.setHeader("Set-Cookie", `${BYPASS_COOKIE}=1; Path=/; HttpOnly; Max-Age=28800; SameSite=Lax`);
    res.json({ ok: true });
  });

  // ── Endpoints de controlo admin ────────────────────────────────────────────
  function requireAdminToken(req: Request, res: Response): boolean {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) { res.status(403).json({ error: "Não autorizado" }); return false; }
    const role = jwtRoleFromToken(authHeader.slice(7));
    if (!role || !ADMIN_ROLES.has(role)) { res.status(403).json({ error: "Acesso restrito a administradores" }); return false; }
    return true;
  }

  app.get("/api/admin/manutencao", async (req: Request, res: Response) => {
    if (!requireAdminToken(req, res)) return;
    const info = await getMaintenanceState();
    res.json(info ?? { active: false, message: "", activatedAt: null });
  });

  app.post("/api/admin/manutencao/ativar", async (req: Request, res: Response) => {
    if (!requireAdminToken(req, res)) return;
    const message = (req.body?.message || "Manutenção em curso. O sistema voltará em breve.").trim();
    const activatedAt = new Date().toISOString();
    const data: MaintenanceInfo = { active: true, message, activatedAt };
    try {
      // Escrever ficheiro (dev) + BD (produção)
      fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(data, null, 2), "utf-8");
      await setMaintenanceInDb(true, message);
      _invalidateMCache();
      log(`[manutencao] ⚠️  ACTIVADA: "${message}"`);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/admin/manutencao/desativar", async (req: Request, res: Response) => {
    if (!requireAdminToken(req, res)) return;
    try {
      if (fs.existsSync(MAINTENANCE_FILE)) fs.unlinkSync(MAINTENANCE_FILE);
      await setMaintenanceInDb(false, "");
      _invalidateMCache();
      log("[manutencao] ✅  DESACTIVADA");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Middleware de intercepção — actua sempre que manutencao_ativa=true na BD
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const p = req.path;
    if (
      p.startsWith("/api/") ||
      p.startsWith("/_expo/") ||
      p.startsWith("/fonts/") ||
      p.startsWith("/icon-fonts/") ||
      p.startsWith("/assets/") ||
      p.startsWith("/icons/") ||
      p.startsWith("/downloads/") ||
      p.startsWith("/__repl") ||
      p.startsWith("/sw.js") ||
      p.startsWith("/manifest.json") ||
      p.endsWith(".js") ||
      p.endsWith(".css") ||
      p.endsWith(".png") ||
      p.endsWith(".ico") ||
      p.endsWith(".ttf") ||
      p.endsWith(".woff") ||
      p.endsWith(".woff2") ||
      p.endsWith(".map") ||
      p.endsWith(".json")
    ) return next();

    const info = await getMaintenanceState();
    if (!info) return next();

    if (hasAdminBypass(req)) return next();

    const htmlPath = path.resolve(process.cwd(), "public/manutencao.html");
    if (fs.existsSync(htmlPath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(503).sendFile(htmlPath);
    } else {
      res.status(503).send(`<html><body style="font-family:sans-serif;background:#050d18;color:#D4AF37;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1>&#9881;&#65039; Em Manutenção</h1><p style="color:#f4e9c8;opacity:.7">${info.message}</p></div></body></html>`);
    }
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  app.use(compression());
  setupFrameHeaders(app);
  setupCors(app);
  setupApiCacheHeaders(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  setupMobileManifest(app);
  setupPwaAssets(app);
  setupMaintenanceMode(app);

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  // Serve icon fonts — primary: public/icon-fonts/ (committed to git, always available in production)
  // fallback: node_modules (for dev/local use)
  const iconFontsPublic = path.resolve(process.cwd(), "public/icon-fonts");
  const iconFontsNode = path.resolve(process.cwd(), "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts");
  const iconFontHeaders = (res: import('http').ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=604800"); // 7 days
    res.setHeader("Content-Type", "font/ttf");
  };
  app.use("/icon-fonts", express.static(iconFontsPublic, { setHeaders: iconFontHeaders }));
  app.use("/icon-fonts", express.static(iconFontsNode,   { setHeaders: iconFontHeaders }));
  const iconFontsPath = iconFontsPublic; // used by hashed-path handler below

  // Expo bundles fonts with hashed names like "Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf"
  // and tries to load them from /assets/node_modules/@expo/vector-icons/.../Fonts/*.ttf
  // Intercept these requests and serve the real font from node_modules
  app.use((req: Request, res: Response, next: NextFunction) => {
    const match = req.path.match(/^\/assets\/node_modules\/@expo\/vector-icons\/.*\/Fonts\/(.+\.ttf)$/i);
    if (!match) return next();
    const filename = match[1];
    // Strip any hash suffix: "Ionicons.b4eb097d.ttf" → "Ionicons.ttf"
    const baseName = filename.replace(/\.[a-f0-9]{8,}(\.ttf)$/i, '$1');
    // Look in public/icon-fonts first (git-tracked), then node_modules fallback
    const candidates = [
      path.join(iconFontsPublic, baseName),
      path.join(iconFontsNode,   baseName),
    ];
    const fontFile = candidates.find(f => fs.existsSync(f));
    if (fontFile) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.setHeader("Content-Type", "font/ttf");
      res.sendFile(fontFile);
    } else {
      next();
    }
  });

  // Inicializar base de dados — se falhar temporariamente, o servidor arranca
  // em modo degradado e reconecta automaticamente em background (ver db-sync.ts).
  try {
    await initDbSync();
  } catch (dbErr: any) {
    console.error("[startup] ❌ initDbSync falhou:", dbErr?.message ?? dbErr);
    console.error("[startup] O servidor vai arrancar sem base de dados. Verifica NEON_DATABASE_URL.");
  }

  // Aplicar migrações — também não-fatal: se a BD ainda não está disponível,
  // o servidor arranca e as migrações serão aplicadas no próximo reinício.
  try {
    await runMigrations();
  } catch (migErr: any) {
    console.warn("[startup] ⚠️  runMigrations falhou (BD indisponível?):", migErr?.message ?? migErr);
    console.warn("[startup] O servidor vai arrancar sem aplicar migrações.");
  }

  // Inicializar sistema de protecção Anti-Clonagem
  try {
    await initProtection();
  } catch (protErr: any) {
    console.warn("[startup] ⚠️  Protecção não iniciada:", protErr?.message ?? protErr);
  }

  // Middleware de bloqueio por domínio (após BD estar disponível)
  app.use(dominioMiddleware);

  const server = await registerRoutes(app);
  registerMEDRoutes(app);
  registerPDFRoutes(app);
  registerSAFTRoutes(app);
  registerConselhoRoutes(app);
  registerExameExtraordinarioRoutes(app);
  registerExameRecursoRoutes(app);
  registerMelhoriaNotaRoutes(app);
  registerReapreciacaoRoutes(app);
  initWebSocketServer(server);

  if (process.env.NODE_ENV === "development" && process.env.SERVE_STATIC_WEB !== "1") {
    await setupWebProxy(app);
  } else {
    setupStaticWeb(app);
  }

  setupErrorHandler(app);

  // Pré-carregar nome da escola antes de começar a servir — evita race condition
  // que mostraria "Escola" (valor por defeito) no flash screen da primeira visita
  await refreshSchoolName().catch(() => {});

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      ...(process.platform === "win32" ? {} : { reusePort: true }),
    },
    () => {
      log(`Express server running on port ${port}`)
      if (process.env.NODE_ENV === "development" && process.env.SERVE_STATIC_WEB !== "1") {
        log(`Proxying web requests to Expo web server on port ${process.env.EXPO_WEB_PORT || "3001"}`);
      }
      try { startAutoLembretesPautas(); } catch (e) { console.warn('[scheduler] failed to start:', (e as Error).message); }
      try { startCobrancaPropinas(); } catch (e) { console.warn('[scheduler] cobranca propinas failed to start:', (e as Error).message); }
      try { startBackupDiario(); } catch (e) { console.warn('[backup] failed to start:', (e as Error).message); }
      try { startPollingRupesPendentes(); } catch (e) { console.warn('[rupe-polling] failed to start:', (e as Error).message); }
      try { startAvisosPropinaEmAtraso(); } catch (e) { console.warn('[avisos-atraso] failed to start:', (e as Error).message); }
      // Auto-registar webhook do Telegram
      // Prioridade: APP_URL (produção liceun303.live) > REPLIT_DEV_DOMAIN (dev Replit)
      if (isTelegramConfigured()) {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0]?.trim();
        const baseUrl = process.env.APP_URL || (replitDomain ? `https://${replitDomain}` : null);
        if (baseUrl) {
          const webhookUrl = `${baseUrl}/api/telegram/webhook`;
          setTelegramWebhook(webhookUrl).catch(e => console.warn('[telegram] Falha ao registar webhook no arranque:', (e as Error).message));
        }
      }
    },
  );

  server.setTimeout(120000);
  server.headersTimeout = 120000;
  server.requestTimeout = 120000;
})();
