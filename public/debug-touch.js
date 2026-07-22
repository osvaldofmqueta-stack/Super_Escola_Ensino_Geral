(function () {
  'use strict';

  var STORAGE_KEY = 'siga_touch_debug_v1';
  var MAX_LOG = 40;

  var log = [];
  var hotspots = {};   /* key → { label, count, lastX, lastY, marker } */
  var totalCount = 0;
  var blockedCount = 0;

  var active = false;
  var panel, logList, hotList, statsOk, statsBad, toggleBadge, toggleBtn;

  /* ── Boot ── */
  try { if (localStorage.getItem(STORAGE_KEY) === '1') activate(); } catch (_) {}
  if (/[?&]touch-debug=1/.test(location.search)) activate();

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
      e.preventDefault();
      if (active) deactivate(); else activate();
    }
  });

  document.addEventListener('DOMContentLoaded', ensureToggleBtn);
  if (document.readyState !== 'loading') ensureToggleBtn();

  /* ══════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════ */
  function getPointerEventsChain(el) {
    var chain = [];
    var node = el;
    while (node && node !== document.documentElement) {
      var pe = window.getComputedStyle(node).pointerEvents;
      chain.push({ tag: node.tagName.toLowerCase(), id: node.id || null, pe: pe, blocks: pe === 'none' });
      node = node.parentElement;
    }
    return chain;
  }

  function getElementLabel(el) {
    if (!el || el === document) return '(document)';
    var tag = el.tagName ? el.tagName.toLowerCase() : '?';
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return tag + id + cls + (text ? ' "' + text + '"' : '');
  }

  function hotspotKey(el) {
    if (!el || !el.tagName) return 'document';
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return tag + id + cls;
  }

  function rgbForPe(pe) {
    if (pe === 'none') return '#e53e3e';
    if (pe === 'auto' || pe === 'all') return '#38a169';
    return '#d69e2e';
  }

  /* heat colour: 1 hit = yellow, many = deep red */
  function heatColor(count, max) {
    if (max <= 0) return '#e53e3e';
    var t = Math.min(count / Math.max(max, 1), 1);
    /* interpolate #d69e2e → #e53e3e → #7b0000 */
    if (t < 0.5) {
      var r = Math.round(214 + (229 - 214) * (t / 0.5));
      var g = Math.round(158 + (62  - 158) * (t / 0.5));
      var b = Math.round(46  + (62  - 46 ) * (t / 0.5));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      var r2 = Math.round(229 + (123 - 229) * ((t - 0.5) / 0.5));
      var g2 = Math.round(62  + (0   - 62 ) * ((t - 0.5) / 0.5));
      var b2 = Math.round(62  + (0   - 62 ) * ((t - 0.5) / 0.5));
      return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════
     Ripple dot
  ══════════════════════════════════════════ */
  function spawnDot(x, y, color, count) {
    var dot = document.createElement('div');
    dot.style.cssText = [
      'position:fixed','left:'+(x-18)+'px','top:'+(y-18)+'px',
      'width:36px','height:36px','border-radius:50%','pointer-events:none',
      'z-index:2147483646','border:3px solid '+color,
      'background:'+color+'22',
      'animation:siga-dbg-ripple 0.6s ease-out forwards',
      'box-sizing:border-box'
    ].join(';');
    document.body.appendChild(dot);
    setTimeout(function(){ dot.remove(); }, 700);

    var inner = document.createElement('div');
    inner.style.cssText = [
      'position:fixed','left:'+(x-6)+'px','top:'+(y-6)+'px',
      'width:12px','height:12px','border-radius:50%','pointer-events:none',
      'z-index:2147483647','background:'+color,
      'display:flex','align-items:center','justify-content:center',
      'font-size:8px','font-weight:700','color:#fff','font-family:monospace'
    ].join(';');
    if (count > 1) inner.textContent = count;
    document.body.appendChild(inner);
    setTimeout(function(){ inner.remove(); }, 700);
  }

  /* ══════════════════════════════════════════
     Persistent hotspot marker (stays on screen)
  ══════════════════════════════════════════ */
  function updateHotspotMarker(hs, maxCount) {
    if (!hs.marker) {
      hs.marker = document.createElement('div');
      hs.marker.className = 'siga-dbg-hs-marker';
      document.body.appendChild(hs.marker);
    }
    var m = hs.marker;
    var col = heatColor(hs.count, maxCount);
    m.style.cssText = [
      'position:fixed',
      'left:'+(hs.lastX - 14)+'px',
      'top:'+(hs.lastY - 14)+'px',
      'width:28px','height:28px','border-radius:50%',
      'pointer-events:none','z-index:2147483639',
      'background:'+col+'cc',
      'border:2px solid '+col,
      'display:flex','align-items:center','justify-content:center',
      'font-size:9px','font-weight:800','color:#fff',
      'font-family:monospace',
      'transition:background 0.3s,border-color 0.3s',
      'box-shadow:0 0 8px '+col+'88'
    ].join(';');
    m.textContent = hs.count;
  }

  function refreshAllMarkers() {
    var maxCount = 0;
    Object.keys(hotspots).forEach(function(k){ if (hotspots[k].count > maxCount) maxCount = hotspots[k].count; });
    Object.keys(hotspots).forEach(function(k){ updateHotspotMarker(hotspots[k], maxCount); });
  }

  function clearAllMarkers() {
    Object.keys(hotspots).forEach(function(k){
      if (hotspots[k].marker) { hotspots[k].marker.remove(); hotspots[k].marker = null; }
    });
  }

  /* ══════════════════════════════════════════
     Event capture
  ══════════════════════════════════════════ */
  function onEvent(e) {
    if (!active) return;
    /* only count each interaction once (prefer click over mousedown) */
    if (e.type === 'mousedown') return;

    var cx = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    var cy = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
    if (cx === null) return;

    var target = e.target;
    var chain = getPointerEventsChain(target);
    var blockerIdx = chain.findIndex(function(c){ return c.blocks; });
    var blocked = blockerIdx >= 0;
    var color = blocked ? '#e53e3e' : '#38a169';

    totalCount++;
    if (blocked) blockedCount++;

    /* hotspot tracking (only for blocked) */
    var hsCount = 1;
    if (blocked) {
      var key = hotspotKey(target);
      if (!hotspots[key]) hotspots[key] = { label: getElementLabel(target), count: 0, lastX: cx, lastY: cy, marker: null };
      hotspots[key].count++;
      hotspots[key].lastX = cx;
      hotspots[key].lastY = cy;
      hsCount = hotspots[key].count;
      refreshAllMarkers();
    }

    spawnDot(cx, cy, color, blocked ? hsCount : 0);

    var entry = {
      type: e.type,
      x: Math.round(cx),
      y: Math.round(cy),
      target: getElementLabel(target),
      targetPe: chain[0] ? chain[0].pe : '?',
      blocked: blocked,
      blockerDepth: blockerIdx,
      chain: chain.slice(0, 5),
      ts: Date.now()
    };

    log.unshift(entry);
    if (log.length > MAX_LOG) log.pop();

    renderStats();
    renderHotspots();
    renderLog();
  }

  /* ══════════════════════════════════════════
     Panel
  ══════════════════════════════════════════ */
  function buildPanel() {
    injectStyles();
    panel = document.createElement('div');
    panel.id = 'siga-dbg-panel';
    panel.innerHTML = [
      '<div id="siga-dbg-header">',
      '  <span id="siga-dbg-title">&#128269; Touch Debug</span>',
      '  <div id="siga-dbg-controls">',
      '    <button id="siga-dbg-clear">Limpar</button>',
      '    <button id="siga-dbg-close">&#10005;</button>',
      '  </div>',
      '</div>',

      /* Stats bar */
      '<div id="siga-dbg-stats">',
      '  <div class="siga-dbg-stat ok">',
      '    <span id="siga-dbg-stat-ok">0</span>',
      '    <label>OK</label>',
      '  </div>',
      '  <div class="siga-dbg-stat bad" id="siga-dbg-stat-bad-wrap">',
      '    <span id="siga-dbg-stat-bad">0</span>',
      '    <label>Bloqueados</label>',
      '  </div>',
      '  <div class="siga-dbg-stat total">',
      '    <span id="siga-dbg-stat-total">0</span>',
      '    <label>Total</label>',
      '  </div>',
      '</div>',

      /* Legend */
      '<div id="siga-dbg-legend">',
      '  <span class="siga-dbg-dot" style="background:#38a169"></span> OK &nbsp;',
      '  <span class="siga-dbg-dot" style="background:#d69e2e"></span> 1× &nbsp;',
      '  <span class="siga-dbg-dot" style="background:#e53e3e"></span> Recorrente &nbsp;',
      '  <span class="siga-dbg-dot" style="background:#7b0000"></span> Crítico',
      '</div>',
      '<div id="siga-dbg-hint">Ctrl+Shift+T para fechar &nbsp;·&nbsp; Marcadores fixos = pontos quentes</div>',

      /* Hotspots section */
      '<div id="siga-dbg-hs-title">&#128293; Pontos quentes (bloqueados) <span id="siga-dbg-hs-empty" style="opacity:0.4;font-weight:400">— nenhum ainda</span></div>',
      '<ul id="siga-dbg-hotlist"></ul>',

      /* Divider */
      '<div id="siga-dbg-divider">Registo de eventos</div>',
      '<ul id="siga-dbg-log"></ul>'
    ].join('');

    document.body.appendChild(panel);

    logList  = panel.querySelector('#siga-dbg-log');
    hotList  = panel.querySelector('#siga-dbg-hotlist');
    statsOk  = panel.querySelector('#siga-dbg-stat-ok');
    statsBad = panel.querySelector('#siga-dbg-stat-bad');

    panel.querySelector('#siga-dbg-clear').addEventListener('click', function () {
      log = []; hotspots = {}; totalCount = 0; blockedCount = 0;
      clearAllMarkers();
      renderStats(); renderHotspots(); renderLog();
      updateToggleBadge();
    });
    panel.querySelector('#siga-dbg-close').addEventListener('click', deactivate);

    makeDraggable(panel, panel.querySelector('#siga-dbg-header'));
  }

  /* ── Stats bar ── */
  function renderStats() {
    if (!statsOk) return;
    var ok = totalCount - blockedCount;
    statsOk.textContent = ok;
    statsBad.textContent = blockedCount;
    panel.querySelector('#siga-dbg-stat-total').textContent = totalCount;
    var wrap = panel.querySelector('#siga-dbg-stat-bad-wrap');
    if (wrap) {
      wrap.style.background = blockedCount > 0 ? 'rgba(229,62,62,0.18)' : 'rgba(255,255,255,0.04)';
      wrap.style.borderColor = blockedCount > 0 ? 'rgba(229,62,62,0.5)' : 'rgba(255,255,255,0.08)';
    }
    updateToggleBadge();
  }

  /* ── Hotspots list ── */
  function renderHotspots() {
    if (!hotList) return;
    var keys = Object.keys(hotspots).sort(function(a,b){ return hotspots[b].count - hotspots[a].count; });
    var emptyEl = panel.querySelector('#siga-dbg-hs-empty');
    if (emptyEl) emptyEl.style.display = keys.length ? 'none' : '';
    hotList.innerHTML = '';
    var maxCount = keys.length ? hotspots[keys[0]].count : 1;
    keys.slice(0, 8).forEach(function(k) {
      var hs = hotspots[k];
      var col = heatColor(hs.count, maxCount);
      var pct = Math.round((hs.count / maxCount) * 100);
      var li = document.createElement('li');
      li.className = 'siga-dbg-hs-entry';
      li.innerHTML = [
        '<div class="siga-dbg-hs-row">',
        '  <span class="siga-dbg-hs-badge" style="background:'+col+'">'+hs.count+'×</span>',
        '  <span class="siga-dbg-hs-label">'+escHtml(hs.label)+'</span>',
        '</div>',
        '<div class="siga-dbg-hs-bar-wrap">',
        '  <div class="siga-dbg-hs-bar" style="width:'+pct+'%;background:'+col+'"></div>',
        '</div>'
      ].join('');
      hotList.appendChild(li);
    });
  }

  /* ── Event log ── */
  function renderLog() {
    if (!logList) return;
    logList.innerHTML = '';
    if (!log.length) {
      logList.innerHTML = '<li class="siga-dbg-empty">Nenhum evento ainda.<br>Clica ou toca em qualquer elemento.</li>';
      return;
    }
    log.forEach(function(e) {
      var li = document.createElement('li');
      li.className = 'siga-dbg-entry' + (e.blocked ? ' siga-dbg-blocked' : '');
      var chainHtml = e.chain.map(function(c, ci) {
        var arrow = ci === 0 ? '' : '<span class="siga-dbg-arrow">&#8593;</span>';
        return arrow + '<span class="siga-dbg-pe-badge" style="background:'+rgbForPe(c.pe)+'">' +
          (c.tag + (c.id ? '#'+c.id : '')) + ' <em>'+c.pe+'</em></span>';
      }).join('');
      li.innerHTML = [
        '<div class="siga-dbg-row">',
        '  <span class="siga-dbg-type">'+e.type+'</span>',
        '  <span class="siga-dbg-coords">('+e.x+', '+e.y+')</span>',
        '  <span class="siga-dbg-status '+(e.blocked?'bad':'ok')+'">'+(e.blocked?'&#9888; BLOQ':'&#10003; OK')+'</span>',
        '</div>',
        '<div class="siga-dbg-target">'+escHtml(e.target)+'</div>',
        '<div class="siga-dbg-chain">'+chainHtml+'</div>'
      ].join('');
      logList.appendChild(li);
    });
  }

  /* ══════════════════════════════════════════
     Toggle button + badge
  ══════════════════════════════════════════ */
  function ensureToggleBtn() {
    if (toggleBtn) return;
    buildToggleBtn();
  }

  function buildToggleBtn() {
    if (toggleBtn) return;
    injectStyles();
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'siga-dbg-toggle';
    toggleBtn.title = 'Touch Debug (Ctrl+Shift+T)';
    toggleBtn.innerHTML = '&#128269;';

    toggleBadge = document.createElement('span');
    toggleBadge.id = 'siga-dbg-toggle-badge';
    toggleBtn.appendChild(toggleBadge);

    toggleBtn.addEventListener('click', function() {
      if (active) deactivate(); else activate();
    });
    document.body.appendChild(toggleBtn);
  }

  function updateToggleBadge() {
    if (!toggleBadge) return;
    if (blockedCount > 0) {
      toggleBadge.textContent = blockedCount;
      toggleBadge.style.display = 'flex';
    } else {
      toggleBadge.style.display = 'none';
    }
  }

  /* ══════════════════════════════════════════
     Draggable
  ══════════════════════════════════════════ */
  function makeDraggable(el, handle) {
    var ox = 0, oy = 0, mx = 0, my = 0;
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      mx = e.clientX; my = e.clientY;
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
    });
    function drag(e) {
      ox = mx - e.clientX; oy = my - e.clientY;
      mx = e.clientX; my = e.clientY;
      el.style.top  = (el.offsetTop  - oy) + 'px';
      el.style.left = (el.offsetLeft - ox) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }
    function stopDrag() {
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', stopDrag);
    }
  }

  /* ══════════════════════════════════════════
     Styles
  ══════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('siga-dbg-styles')) return;
    var s = document.createElement('style');
    s.id = 'siga-dbg-styles';
    s.textContent = [
      '@keyframes siga-dbg-ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(2.8);opacity:0}}',
      '@keyframes siga-dbg-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,62,62,0.5)}50%{box-shadow:0 0 0 6px rgba(229,62,62,0)}}',

      /* ── Toggle button ── */
      '#siga-dbg-toggle{',
      '  position:fixed;bottom:80px;right:12px;z-index:2147483640;',
      '  width:42px;height:42px;border-radius:50%;',
      '  border:2px solid rgba(212,175,55,0.55);',
      '  background:#0d1f35;color:#D4AF37;font-size:18px;cursor:pointer;',
      '  box-shadow:0 2px 12px rgba(0,0,0,0.5);',
      '  display:flex;align-items:center;justify-content:center;',
      '  transition:transform 0.15s,background 0.2s;',
      '}',
      '#siga-dbg-toggle:hover{transform:scale(1.15);}',

      '#siga-dbg-toggle-badge{',
      '  display:none;position:absolute;top:-4px;right:-4px;',
      '  min-width:18px;height:18px;border-radius:9px;',
      '  background:#e53e3e;color:#fff;font-size:9px;font-weight:800;',
      '  align-items:center;justify-content:center;padding:0 3px;',
      '  font-family:monospace;border:2px solid #0d1f35;',
      '  animation:siga-dbg-pulse 1.5s infinite;',
      '}',

      /* ── Panel ── */
      '#siga-dbg-panel{',
      '  position:fixed;top:60px;right:12px;z-index:2147483641;',
      '  width:330px;max-height:78vh;',
      '  background:#0a1828;border:1px solid rgba(212,175,55,0.3);border-radius:12px;',
      '  box-shadow:0 8px 32px rgba(0,0,0,0.75);',
      '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",monospace;',
      '  font-size:11px;color:#e2e8f0;overflow:hidden;',
      '  display:flex;flex-direction:column;',
      '}',

      '#siga-dbg-header{',
      '  display:flex;justify-content:space-between;align-items:center;',
      '  padding:8px 10px;border-bottom:1px solid rgba(212,175,55,0.18);',
      '  background:rgba(212,175,55,0.07);flex-shrink:0;user-select:none;',
      '}',
      '#siga-dbg-title{font-weight:700;color:#D4AF37;font-size:12px;}',
      '#siga-dbg-controls{display:flex;gap:6px;}',
      '#siga-dbg-controls button{',
      '  background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);',
      '  color:#e2e8f0;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px;',
      '}',
      '#siga-dbg-controls button:hover{background:rgba(255,255,255,0.14);}',

      /* Stats bar */
      '#siga-dbg-stats{',
      '  display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);',
      '  flex-shrink:0;',
      '}',
      '.siga-dbg-stat{',
      '  flex:1;text-align:center;padding:5px 4px;border-radius:7px;',
      '  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);',
      '  transition:background 0.3s,border-color 0.3s;',
      '}',
      '.siga-dbg-stat span{display:block;font-size:16px;font-weight:800;line-height:1.2;}',
      '.siga-dbg-stat label{font-size:9px;opacity:0.55;text-transform:uppercase;letter-spacing:0.5px;}',
      '.siga-dbg-stat.ok span{color:#68d391;}',
      '.siga-dbg-stat.bad span{color:#fc8181;}',
      '.siga-dbg-stat.total span{color:#90cdf4;}',

      /* Legend */
      '#siga-dbg-legend{padding:5px 10px 3px;font-size:10px;color:rgba(226,232,240,0.55);flex-shrink:0;}',
      '.siga-dbg-dot{display:inline-block;width:8px;height:8px;border-radius:50%;vertical-align:middle;margin-right:3px;}',
      '#siga-dbg-hint{padding:2px 10px 6px;font-size:9px;color:rgba(226,232,240,0.3);flex-shrink:0;}',

      /* Hotspots */
      '#siga-dbg-hs-title{',
      '  padding:5px 10px 3px;font-size:10px;font-weight:700;color:#fc8181;',
      '  flex-shrink:0;border-top:1px solid rgba(255,255,255,0.06);',
      '}',
      '#siga-dbg-hotlist{list-style:none;margin:0;padding:0 8px 4px;flex-shrink:0;}',
      '.siga-dbg-hs-entry{margin:3px 0;padding:4px 6px;border-radius:6px;background:rgba(229,62,62,0.07);}',
      '.siga-dbg-hs-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}',
      '.siga-dbg-hs-badge{',
      '  border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;color:#fff;flex-shrink:0;',
      '}',
      '.siga-dbg-hs-label{font-size:10px;color:#fefcbf;word-break:break-all;line-height:1.3;}',
      '.siga-dbg-hs-bar-wrap{height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;}',
      '.siga-dbg-hs-bar{height:3px;border-radius:2px;transition:width 0.3s,background 0.3s;}',

      /* Divider */
      '#siga-dbg-divider{',
      '  padding:5px 10px 3px;font-size:9px;color:rgba(226,232,240,0.3);',
      '  text-transform:uppercase;letter-spacing:1px;border-top:1px solid rgba(255,255,255,0.06);',
      '  flex-shrink:0;',
      '}',

      /* Log */
      '#siga-dbg-log{list-style:none;margin:0;padding:0 6px 8px;overflow-y:auto;flex:1;}',
      '.siga-dbg-empty{padding:12px;text-align:center;color:rgba(226,232,240,0.35);font-size:11px;line-height:1.6;}',
      '.siga-dbg-entry{border-radius:6px;padding:6px 7px;margin:3px 0;background:rgba(56,161,105,0.09);border-left:3px solid #38a169;}',
      '.siga-dbg-entry.siga-dbg-blocked{background:rgba(229,62,62,0.09);border-left-color:#e53e3e;}',
      '.siga-dbg-row{display:flex;align-items:center;gap:5px;margin-bottom:2px;}',
      '.siga-dbg-type{background:rgba(255,255,255,0.09);border-radius:3px;padding:1px 5px;font-size:10px;color:#90cdf4;}',
      '.siga-dbg-coords{color:rgba(226,232,240,0.4);font-size:10px;}',
      '.siga-dbg-status{font-size:10px;font-weight:700;margin-left:auto;}',
      '.siga-dbg-status.ok{color:#68d391;}',
      '.siga-dbg-status.bad{color:#fc8181;}',
      '.siga-dbg-target{color:#fefcbf;font-size:10px;margin-bottom:3px;word-break:break-all;}',
      '.siga-dbg-chain{display:flex;flex-wrap:wrap;gap:3px;align-items:center;}',
      '.siga-dbg-pe-badge{display:inline-flex;align-items:center;gap:2px;border-radius:4px;padding:1px 4px;font-size:9px;color:#fff;}',
      '.siga-dbg-pe-badge em{font-style:normal;opacity:0.75;font-size:8px;}',
      '.siga-dbg-arrow{color:rgba(226,232,240,0.25);font-size:9px;}',

      /* Hotspot markers */
      '.siga-dbg-hs-marker{pointer-events:none;z-index:2147483639;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════
     Activate / Deactivate
  ══════════════════════════════════════════ */
  function activate() {
    if (active) return;
    active = true;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}

    ensureToggleBtn();
    if (!panel) buildPanel();

    panel.style.display = 'flex';
    if (toggleBtn) {
      toggleBtn.style.background = '#1a3a5c';
      toggleBtn.style.borderColor = 'rgba(212,175,55,0.9)';
      toggleBtn.title = 'Touch Debug ACTIVO (Ctrl+Shift+T para fechar)';
    }

    document.addEventListener('click',      onEvent, true);
    document.addEventListener('touchstart', onEvent, { capture: true, passive: true });
    document.addEventListener('touchend',   onEvent, { capture: true, passive: true });

    renderStats(); renderHotspots(); renderLog();
    refreshAllMarkers();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}

    if (panel) panel.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.style.background = '#0d1f35';
      toggleBtn.style.borderColor = 'rgba(212,175,55,0.55)';
      toggleBtn.title = 'Touch Debug (Ctrl+Shift+T)';
    }
    clearAllMarkers();

    document.removeEventListener('click',      onEvent, true);
    document.removeEventListener('touchstart', onEvent, true);
    document.removeEventListener('touchend',   onEvent, true);
  }

})();
