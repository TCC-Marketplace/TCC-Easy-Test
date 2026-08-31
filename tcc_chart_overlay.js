// ── Fullscreen Chart Overlay ──
let cfoMode = 'spot'; // 'spot' or 'futures'
let cfoTF = '5m';
let cfoCtx = null;
let cfoAnimId = null;
let cfoCandles = [];
let _cfoRealtimeInterval = null;
let _cfoCountdownTimer = null;

// ── CFO Pan/Zoom State ──
const CFO = {
  viewStart: null,   // null = auto (show latest)
  visCount:  80,
  minVis:    10,
  maxVis:    500,
  yPadFactor: 0.15,
  _userZoomed: false,  // true = user has manually panned/zoomed → don't auto-reset on re-open
};

// ── CFO Pan/Zoom Interactions ──
function _initCfoPanZoom() {
  const wrap = document.querySelector('.cfo-wrap');
  if (!wrap || wrap._cfoInited) return;
  wrap._cfoInited = true;

  const PAD_R_W = 58;

  function _inPriceAxis(clientX) {
    const rect = wrap.getBoundingClientRect();
    return (clientX - rect.left) > (rect.width - PAD_R_W);
  }

  // ── Y-axis drag (price zoom) ──
  let yDragStart = 0, yDragStartPad = 0, isYDrag = false;
  wrap.addEventListener('mousedown', ev => {
    if (_inPriceAxis(ev)) { ev.preventDefault(); isYDrag = true; yDragStart = ev.clientY; yDragStartPad = CFO.yPadFactor; wrap.style.cursor = 'ns-resize'; }
  });
  document.addEventListener('mousemove', ev => {
    if (!isYDrag) return;
    CFO.yPadFactor = Math.max(0.02, Math.min(1.5, yDragStartPad + (yDragStart - ev.clientY) * 0.005));
    drawCfoChart();
  });
  document.addEventListener('mouseup', () => { if (isYDrag) { isYDrag = false; wrap.style.cursor = ''; } });

  // ── Mouse pan ──
  let panStartX = 0, panStartVS = null, panStartVis = 0, isPanning = false;
  function startPan(x) {
    const all = cfoCandles;
    if (CFO.viewStart === null) CFO.viewStart = all.length - CFO.visCount;
    panStartX = x; panStartVS = CFO.viewStart; panStartVis = CFO.visCount;
    isPanning = true; wrap.style.cursor = 'grabbing';
  }
  function movePan(x) {
    if (!isPanning) return;
    const wrapW = wrap.clientWidth || 400;
    const dx = x - panStartX;
    const dCandles = Math.round(dx / (wrapW / panStartVis));
    const total = cfoCandles.length;
    const vis = CFO.visCount;
    const minVS = -Math.floor(vis / 2);
    const maxVS = total - Math.ceil(vis / 2);
    CFO.viewStart = Math.max(minVS, Math.min(maxVS, panStartVS - dCandles));
    CFO._userZoomed = true;
    drawCfoChart();
  }
  function endPan() { if (isPanning) { isPanning = false; wrap.style.cursor = ''; } }

  wrap.addEventListener('mousedown', e => {
    if (!_inPriceAxis(e)) { e.preventDefault(); startPan(e.clientX); }
  });
  document.addEventListener('mousemove', e => { if (isPanning) movePan(e.clientX); });
  document.addEventListener('mouseup', endPan);

  // ── Mouse wheel zoom ──
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    const rect = wrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width - PAD_R_W)));
    const total = cfoCandles.length;
    if (!total) return;
    const oldVis = CFO.visCount;
    const newVis = Math.round(Math.max(CFO.minVis, Math.min(CFO.maxVis, oldVis * factor)));
    if (newVis === oldVis) return;
    const curStart = CFO.viewStart !== null ? CFO.viewStart : Math.max(0, total - oldVis);
    const center = curStart + frac * oldVis;
    CFO.visCount = newVis;
    const newStart = Math.round(center - frac * newVis);
    CFO.viewStart = Math.max(-Math.floor(newVis / 2), Math.min(total - Math.ceil(newVis / 2), newStart));
    CFO._userZoomed = true;
    drawCfoChart();
  }, { passive: false });

  // ── Touch system: pan / pinch / crosshair ──
  const LONG_MS = 320, PAN_THRESH = 6;
  let _lpt = null, _lpActive = false, _tMode = '', _committed = false;
  let _tsx = 0, _tsy = 0;
  let pinchDist0 = 0, pinchVis0 = 0, pinchVS0 = null, pinchMidX = 0;

  // Crosshair overlay elements for CFO
  const cfoCHL  = document.getElementById('cfoCurLine');
  const cfoCHT  = document.getElementById('cfoCurTag');
  const cfoChOhlc    = document.getElementById('cfoChOhlc');
  const cfoChTooltip = document.getElementById('cfoChTooltip');
  const cfoChO  = document.getElementById('cfoChO');
  const cfoChH  = document.getElementById('cfoChH');
  const cfoChL  = document.getElementById('cfoChL');
  const cfoChC  = document.getElementById('cfoChC');
  const cfoChV  = document.getElementById('cfoChV');
  const cfoChTTTime  = document.getElementById('cfoChTTTime');
  const cfoChTTOpen  = document.getElementById('cfoChTTOpen');
  const cfoChTTHigh  = document.getElementById('cfoChTTHigh');
  const cfoChTTLow   = document.getElementById('cfoChTTLow');
  const cfoChTTClose = document.getElementById('cfoChTTClose');
  const cfoChTTChg   = document.getElementById('cfoChTTChg');
  const cfoChTTPchg  = document.getElementById('cfoChTTPchg');
  const cfoChTTRange = document.getElementById('cfoChTTRange');
  const cfoChTTVol   = document.getElementById('cfoChTTVol');

  const _cfFmtV = v => !v ? '—' : v >= 1e9 ? (v/1e9).toFixed(2)+'B' : v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
  const _cfFmtT = ms => { if (!ms) return '—'; const d = new Date(ms); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };

  function _showCfoCrosshair(clientX) {
    const rect = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    // Vertical line
    if (cfoCHL) { cfoCHL.style.left = x + 'px'; cfoCHL.style.display = 'block'; }
    // Find candle at x → price tag
    const PAD_L = 4, PAD_R = 58, PAD_T = 12, PAD_B = 4;
    const W = rect.width, H = rect.height;
    const chartW = W - PAD_L - PAD_R;
    const all = cfoCandles;
    const total = all.length;
    const vis = CFO.visCount;
    const vStart = CFO.viewStart !== null ? CFO.viewStart : total - vis;
    const slot = Math.floor((x - PAD_L) / (chartW / vis));
    const idx = Math.max(0, Math.min(total - 1, vStart + slot));
    const c = all[idx];
    if (!c) return;

    // Y position from price
    let lo = Infinity, hi = -Infinity;
    const vEnd = Math.min(total, vStart + vis);
    for (let i = Math.max(0, vStart); i < vEnd; i++) { if (all[i].l < lo) lo = all[i].l; if (all[i].h > hi) hi = all[i].h; }
    const pad = (hi - lo) * (CFO.yPadFactor || 0.15) || 1;
    const rng = hi - lo + pad * 2 || 1;
    const chartH = H - PAD_T - PAD_B;
    const py = PAD_T + chartH - ((c.c - (lo - pad)) / rng) * chartH;

    if (cfoCHT) {
      cfoCHT.style.top = Math.max(8, Math.min(H - 20, py - 9)) + 'px';
      cfoCHT.textContent = (typeof fmtP === 'function') ? fmtP(c.c) : c.c.toFixed(1);
      cfoCHT.style.display = 'block';
    }

    // OHLCV box (top)
    if (cfoChOhlc) {
      cfoChOhlc.style.display = 'flex';
      if (cfoChO) cfoChO.textContent = 'O: ' + ((typeof fmtP === 'function') ? fmtP(c.o) : c.o.toFixed(1));
      if (cfoChH) cfoChH.textContent = 'H: ' + ((typeof fmtP === 'function') ? fmtP(c.h) : c.h.toFixed(1));
      if (cfoChL) cfoChL.textContent = 'L: ' + ((typeof fmtP === 'function') ? fmtP(c.l) : c.l.toFixed(1));
      if (cfoChC) { cfoChC.textContent = 'C: ' + ((typeof fmtP === 'function') ? fmtP(c.c) : c.c.toFixed(1)); cfoChC.style.color = c.c >= c.o ? '#0ecb81' : '#f6465d'; }
      if (cfoChV) cfoChV.textContent = 'V: ' + _cfFmtV(c.v);
    }

    // Candle detail tooltip
    if (cfoChTooltip) {
      const chg = c.c - c.o;
      const pchg = c.o > 0 ? (chg / c.o * 100) : 0;
      const isUp = chg >= 0;
      const chgCol = isUp ? '#0ecb81' : '#f6465d';
      const sign = isUp ? '+' : '';
      if (cfoChTTTime)  cfoChTTTime.textContent = _cfFmtT(c.t);
      if (cfoChTTOpen)  cfoChTTOpen.textContent = (typeof fmtP === 'function') ? fmtP(c.o) : c.o.toFixed(1);
      if (cfoChTTHigh)  cfoChTTHigh.textContent = (typeof fmtP === 'function') ? fmtP(c.h) : c.h.toFixed(1);
      if (cfoChTTLow)   cfoChTTLow.textContent  = (typeof fmtP === 'function') ? fmtP(c.l) : c.l.toFixed(1);
      if (cfoChTTClose) cfoChTTClose.textContent = (typeof fmtP === 'function') ? fmtP(c.c) : c.c.toFixed(1);
      if (cfoChTTChg)   { cfoChTTChg.textContent = sign + chg.toFixed(2); cfoChTTChg.style.color = chgCol; }
      if (cfoChTTPchg)  { cfoChTTPchg.textContent = sign + pchg.toFixed(2) + '%'; cfoChTTPchg.style.color = chgCol; }
      if (cfoChTTRange) cfoChTTRange.textContent = (typeof fmtP === 'function') ? fmtP(c.h - c.l) : (c.h - c.l).toFixed(2);
      if (cfoChTTVol)   cfoChTTVol.textContent = _cfFmtV(c.v);

      // Position tooltip to left or right of cursor
      const tooltipW = 130;
      const leftPos = x + 10 + tooltipW > W ? Math.max(4, x - tooltipW - 10) : x + 10;
      cfoChTooltip.style.left = leftPos + 'px';
      cfoChTooltip.style.top = '24px';
      cfoChTooltip.style.display = 'block';
    }
  }
  function _hideCfoCrosshair() {
    if (cfoCHL) cfoCHL.style.display = 'none';
    if (cfoCHT) cfoCHT.style.display = 'none';
    if (cfoChOhlc) cfoChOhlc.style.display = 'none';
    if (cfoChTooltip) cfoChTooltip.style.display = 'none';
  }

  // Y-axis touch drag
  let yTouchStart = 0, yTouchPad0 = 0, isYTouch = false;
  wrap.addEventListener('touchstart', ev => {
    if (ev.touches.length === 1 && _inPriceAxis(ev.touches[0])) {
      ev.preventDefault(); isYTouch = true;
      yTouchStart = ev.touches[0].clientY; yTouchPad0 = CFO.yPadFactor;
    }
  }, { passive: false });
  wrap.addEventListener('touchmove', ev => {
    if (isYTouch && ev.touches.length === 1) {
      ev.preventDefault();
      CFO.yPadFactor = Math.max(0.02, Math.min(1.5, yTouchPad0 + (yTouchStart - ev.touches[0].clientY) * 0.005));
      drawCfoChart();
    }
  }, { passive: false });
  wrap.addEventListener('touchend', () => { isYTouch = false; });

  wrap.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1 && !_inPriceAxis(e.touches[0])) {
      _tsx = e.touches[0].clientX; _tsy = e.touches[0].clientY;
      _committed = false; _tMode = ''; _lpActive = false;
      _lpt = setTimeout(() => {
        if (!_committed) { _lpActive = true; _tMode = 'crosshair'; _committed = true; if (navigator.vibrate) navigator.vibrate(25); }
      }, LONG_MS);
    } else if (e.touches.length === 2) {
      if (_lpt) { clearTimeout(_lpt); _lpt = null; }
      endPan(); _hideCfoCrosshair(); _tMode = 'pinch'; _committed = true;
      const t0 = e.touches[0], t1 = e.touches[1];
      pinchDist0 = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      pinchVis0 = CFO.visCount;
      if (CFO.viewStart === null) CFO.viewStart = cfoCandles.length - CFO.visCount;
      pinchVS0 = CFO.viewStart;
      const rect = wrap.getBoundingClientRect();
      pinchMidX = ((t0.clientX + t1.clientX) / 2) - rect.left;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
      if (!_committed) {
        if (Math.abs(tx - _tsx) > PAN_THRESH || Math.abs(ty - _tsy) > PAN_THRESH) {
          if (_lpt) { clearTimeout(_lpt); _lpt = null; }
          _tMode = 'pan'; _committed = true; startPan(_tsx);
        }
        return;
      }
      if (_tMode === 'pan') movePan(tx);
      else if (_tMode === 'crosshair') _showCfoCrosshair(tx);
    } else if (e.touches.length === 2 && _tMode === 'pinch') {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (pinchDist0 > 0) {
        const scale = dist / pinchDist0;
        const newVis = Math.round(Math.max(CFO.minVis, Math.min(CFO.maxVis, pinchVis0 / scale)));
        if (newVis !== CFO.visCount) {
          const total = cfoCandles.length;
          const wrapW = wrap.clientWidth || 400;
          const frac = Math.max(0, Math.min(1, pinchMidX / wrapW));
          const center = (pinchVS0 || 0) + frac * pinchVis0;
          CFO.visCount = newVis;
          const newStart = Math.round(center - frac * newVis);
          CFO.viewStart = Math.max(-Math.floor(newVis / 2), Math.min(total - Math.ceil(newVis / 2), newStart));
          CFO._userZoomed = true;
          drawCfoChart();
        }
      }
    }
  }, { passive: false });

  let _pinchEndedAt = 0; // timestamp ที่ pinch จบ — ป้องกัน double-tap reset ยิงผิด
  wrap.addEventListener('touchend', e => {
    if (_lpt) { clearTimeout(_lpt); _lpt = null; }
    if (e.touches.length < 2 && _tMode === 'pinch') {
      _tMode = ''; _committed = false; pinchDist0 = 0;
      _pinchEndedAt = Date.now(); // บันทึกเวลาที่ pinch จบ
    }
    if (e.touches.length === 0) {
      endPan();
      if (_tMode === 'crosshair') setTimeout(_hideCfoCrosshair, 900);
      _tMode = ''; _committed = false; _lpActive = false;
    }
  });

  // Double-tap / double-click to reset
  let lastTap = 0;
  wrap.addEventListener('touchend', e => {
    const now = Date.now();
    // บล็อกถ้า pinch เพิ่งจบ (ภายใน 500ms) เพื่อป้องกัน reset ผิดพลาด
    if (now - lastTap < 300 && _tMode !== 'pan' && (now - _pinchEndedAt) > 500) {
      CFO.viewStart = null; CFO.visCount = 80; CFO.yPadFactor = 0.15; CFO._userZoomed = false; drawCfoChart();
    }
    lastTap = now;
  });
  wrap.addEventListener('dblclick', () => { CFO.viewStart = null; CFO.visCount = 80; CFO.yPadFactor = 0.15; CFO._userZoomed = false; drawCfoChart(); });

  // Hover crosshair on desktop
  wrap.addEventListener('mousemove', e => {
    if (isPanning) return;
    if (!_inPriceAxis(e)) _showCfoCrosshair(e.clientX);
  });
  wrap.addEventListener('mouseleave', _hideCfoCrosshair);
}

function _cfoStartRealtime() {
  _cfoClearRealtime();
  // ── countdown นับถอยหลัง (แยก timer เพื่อให้ราบรื่น) ──
  _startCfoCountdown();
  _cfoRealtimeInterval = setInterval(function() {
    // Sync latest candles from live source
    if (cfoMode === 'spot' && typeof SP !== 'undefined' && SP.candles && SP.candles.length) {
      cfoCandles = SP.candles.slice();
    } else if (cfoMode === 'futures' && typeof S !== 'undefined' && S.candles && S.candles.length) {
      cfoCandles = S.candles.slice();
    }
    drawCfoChart();
    // Sync symbol change label
    if (cfoMode === 'futures' && typeof S !== 'undefined') {
      const chg = document.getElementById('topChg');
      const cfoChgEl = document.getElementById('cfoChg');
      if (chg && cfoChgEl) { cfoChgEl.textContent = chg.textContent; cfoChgEl.className = chg.className; }
    } else if (cfoMode === 'spot' && typeof SP !== 'undefined') {
      const chg = document.getElementById('spChartChg');
      const cfoChgEl = document.getElementById('cfoChg');
      if (chg && cfoChgEl) { cfoChgEl.textContent = chg.textContent; cfoChgEl.className = chg.className; }
    }
  }, 1000);
}

function _cfoClearRealtime() {
  if (_cfoRealtimeInterval) { clearInterval(_cfoRealtimeInterval); _cfoRealtimeInterval = null; }
  if (_cfoCountdownTimer)   { clearInterval(_cfoCountdownTimer);   _cfoCountdownTimer = null; }
}

// ── CFO Countdown (แยกจาก realtime interval เพื่อให้อัพเดทราบรื่น) ──
function _startCfoCountdown() {
  if (_cfoCountdownTimer) { clearInterval(_cfoCountdownTimer); _cfoCountdownTimer = null; }
  const el = document.getElementById('cfoCountdown');
  if (!el) return;
  function tick() {
    const ms = (typeof _tfToMs === 'function') ? _tfToMs(cfoTF) : 300000;
    if (!ms) { el.textContent = '--:--'; el.classList.remove('cd-pulse'); return; }
    if (typeof _updateCountdownEl === 'function') {
      _updateCountdownEl(el, ms);
    } else {
      const now = Date.now();
      const barOpen = Math.floor(now / ms) * ms;
      const remaining = (barOpen + ms) - now;
      el.textContent = (typeof _fmtCountdown === 'function') ? _fmtCountdown(Math.max(0, remaining)) : '--:--';
    }
  }
  tick();
  _cfoCountdownTimer = setInterval(tick, 1000);
}

function expandChart(mode) {
  cfoMode = mode;
  const overlay = document.getElementById('chartFullOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Sync symbol label
  if (mode === 'spot') {
    const sym = document.getElementById('spChartSymDetail');
    document.getElementById('cfoSym').textContent = sym ? sym.textContent : 'ETH/USDT';
    const chg = document.getElementById('spChartChg');
    const cfoChgEl = document.getElementById('cfoChg');
    if (chg && cfoChgEl) { cfoChgEl.textContent = chg.textContent; cfoChgEl.className = chg.className; }
    // Sync active TF from spot
    const activeTF = document.querySelector('#spTFBar .tf-label.active');
    cfoTF = activeTF ? activeTF.textContent : '5m';
  } else {
    const sym = document.getElementById('topSym');
    document.getElementById('cfoSym').textContent = sym ? sym.textContent.replace('USDT','') + '/USDT' : 'BTC/USDT';
    const chg = document.getElementById('topChg');
    const cfoChgEl = document.getElementById('cfoChg');
    if (chg && cfoChgEl) { cfoChgEl.textContent = chg.textContent; cfoChgEl.className = chg.className; }
    const activeTF = document.querySelector('#chartSec .tf-label.active');
    cfoTF = activeTF ? activeTF.textContent : '3m';
  }

  // Sync active TF button in overlay
  document.querySelectorAll('.cfo-tf').forEach(b => {
    b.classList.toggle('active', b.textContent === cfoTF);
  });

  // Copy candles from source chart
  if (mode === 'spot' && typeof SP !== 'undefined' && SP.candles) {
    cfoCandles = SP.candles.slice();
  } else if (mode === 'futures' && typeof S !== 'undefined' && S.candles) {
    cfoCandles = S.candles.slice();
  }

  // Reset view state on each open — แต่ถ้า user เคย zoom/pan ค้างไว้ ให้ keep state
  if (!CFO._userZoomed) {
    CFO.viewStart = null;
    CFO.visCount = 80;
    CFO.yPadFactor = 0.15;
  }

  setTimeout(function(){ _initCfoPanZoom(); drawCfoChart(); _cfoStartRealtime(); }, 60);
}

function closeChartFull() {
  document.getElementById('chartFullOverlay').classList.remove('active');
  document.body.style.overflow = '';
  _cfoClearRealtime();
}

function cfoSetTF(el, tf) {
  cfoTF = tf;
  document.querySelectorAll('.cfo-tf').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  // Reset view state when switching TF
  CFO.viewStart = null;
  CFO.visCount = 80;
  CFO._userZoomed = false;
  // Restart countdown for new TF
  _startCfoCountdown();
  // Fetch new candles for the selected TF
  if (cfoMode === 'spot' && typeof fetchSpCandles === 'function') {
    fetchSpCandlesFor(tf, function(candles){ cfoCandles = candles; drawCfoChart(); });
  } else if (cfoMode === 'futures' && typeof fetchCandlesFor === 'function') {
    fetchCandlesFor(tf, function(candles){ cfoCandles = candles; drawCfoChart(); });
  } else {
    drawCfoChart();
  }
}

function drawCfoChart() {
  const canvas = document.getElementById('cfoCanvas');
  if (!canvas) return;
  const wrap = canvas.parentElement;

  // ── DPR-correct sizing ──
  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth  || 0;
  const H = wrap.clientHeight || 0;
  if (W < 10 || H < 10) return;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!cfoCandles || cfoCandles.length < 2) {
    ctx.fillStyle = '#0b0e11';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading chart…', W/2, H/2);
    return;
  }

  // Draw candles using generic fullscreen renderer
  _drawCandlesGeneric(ctx, W, H, cfoCandles);
  _updateCfoMaLabels();
  // Draw fullscreen volume histogram
  _drawCfoVolume(cfoCandles);
}

// ══════════════════════════════════════════════════════════════
//  VOLUME HISTOGRAM — Fullscreen Chart
// ══════════════════════════════════════════════════════════════
function _drawCfoVolume(candles) {
  const volCanvas = document.getElementById('cfoVolCanvas');
  if (!volCanvas || !candles || !candles.length) return;
  const wrap = volCanvas.parentElement;
  const W = wrap.clientWidth || 0;
  const H = wrap.clientHeight || 0;
  if (W < 10 || H < 10) return;

  const dpr = window.devicePixelRatio || 1;
  volCanvas.style.width  = W + 'px';
  volCanvas.style.height = H + 'px';
  volCanvas.width  = Math.round(W * dpr);
  volCanvas.height = Math.round(H * dpr);

  const vc = volCanvas.getContext('2d');
  vc.setTransform(1, 0, 0, 1, 0, 0);
  vc.scale(dpr, dpr);
  vc.clearRect(0, 0, W, H);
  vc.fillStyle = '#0b0e11';
  vc.fillRect(0, 0, W, H);

  const vis = Math.max(CFO.minVis, Math.min(CFO.maxVis, CFO.visCount));
  const total = candles.length;
  const vStart = (CFO._vStart !== undefined) ? CFO._vStart : (CFO.viewStart !== null ? CFO.viewStart : total - vis);

  const PAD_R = 58, PAD_L = 4;
  const CW = W - PAD_L - PAD_R;
  const PAD_T = 3, PAD_B = 3;
  const CH = H - PAD_T - PAD_B;
  const slotW = CW / vis;
  const barW  = Math.max(1, slotW * 0.65);

  const visBars = [];
  for (let slot = 0; slot < vis; slot++) {
    const idx = vStart + slot;
    if (idx >= 0 && idx < total) visBars.push({ c: candles[idx], slot });
  }
  if (!visBars.length) return;

  const maxVol = Math.max(...visBars.map(b => b.c.v || 0), 1);

  vc.beginPath();
  vc.strokeStyle = 'rgba(240,185,11,0.35)';
  vc.lineWidth = 1;
  let first = true;
  for (let slot = 0; slot < vis; slot++) {
    const idx = vStart + slot;
    if (idx < 0 || idx >= total) continue;
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, idx - 4); j <= idx; j++) { sum += candles[j].v || 0; cnt++; }
    const mv = cnt ? sum / cnt : 0;
    const x = PAD_L + (slot + 0.5) * slotW;
    const y = PAD_T + (1 - mv / maxVol) * CH;
    if (first) { vc.moveTo(x, y); first = false; } else vc.lineTo(x, y);
  }
  vc.stroke();

  visBars.forEach(({ c, slot }) => {
    const vol = c.v || 0;
    const cx = PAD_L + (slot + 0.5) * slotW;
    const barH = Math.max(1, (vol / maxVol) * CH);
    const isUp = c.c >= c.o;
    vc.fillStyle = isUp ? 'rgba(14,203,129,0.55)' : 'rgba(246,70,93,0.55)';
    vc.fillRect(cx - barW / 2, PAD_T + CH - barH, barW, barH);
  });

  vc.font = '8px Roboto Mono, monospace';
  vc.fillStyle = 'rgba(132,142,156,0.6)';
  vc.textAlign = 'left';
  vc.fillText('VOL', PAD_L + 2, PAD_T + 9);
  vc.textAlign = 'right';
  vc.fillStyle = 'rgba(132,142,156,0.5)';
  const fv = v => !v ? '\u2014' : v >= 1e9 ? (v/1e9).toFixed(2)+'B' : v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
  vc.fillText(fv(maxVol), W - 2, PAD_T + 9);
}

function _updateCfoMaLabels() {
  if (cfoMode === 'spot') {
    ['spma7','spma25','spma99'].forEach((id,i) => {
      const src = document.getElementById(id);
      const dst = document.getElementById(['cfoma7','cfoma25','cfoma99'][i]);
      if (src && dst) dst.textContent = src.textContent;
    });
  } else {
    ['ma7lbl','ma25lbl','ma99lbl'].forEach((id,i) => {
      const src = document.getElementById(id);
      const dst = document.getElementById(['cfoma7','cfoma25','cfoma99'][i]);
      if (src && dst) dst.textContent = src.textContent;
    });
  }
}

function _drawCandlesGeneric(ctx, W, H, candles) {
  // ── Viewport: ใช้ CFO state สำหรับ pan/zoom ──
  const PAD_R = 58, PAD_L = 4, PAD_T = 12, PAD_B = 4;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const total = candles.length;
  if (total < 2) return;

  // คำนวณ viewStart / visCount จาก CFO state
  const vis = Math.max(CFO.minVis, Math.min(CFO.maxVis, CFO.visCount));
  let vStart = CFO.viewStart !== null ? CFO.viewStart : total - vis;
  const minVS = -Math.floor(vis / 2);
  const maxVS = total - Math.ceil(vis / 2);
  vStart = Math.max(minVS, Math.min(maxVS, vStart));

  // slot width (รวมช่องว่าง)
  const slotW = chartW / vis;
  const cw = Math.max(1, slotW - 1);

  // เก็บไว้ใช้ใน crosshair (expose ผ่าน CFO)
  CFO._vStart = vStart; CFO._vis = vis; CFO._slotW = slotW;

  // คำนวณ hi/lo จาก visible window (เฉพาะ real candles)
  let lo = Infinity, hi = -Infinity;
  for (let i = Math.max(0, vStart); i < Math.min(total, vStart + vis); i++) {
    if (candles[i].l < lo) lo = candles[i].l;
    if (candles[i].h > hi) hi = candles[i].h;
  }
  if (!isFinite(lo)) return;

  // Y-axis padding (draggable)
  const pad = (hi - lo) * (CFO.yPadFactor || 0.15) || 1;
  const rng = hi - lo + pad * 2 || 1;
  const loP = lo - pad;
  const toY = v => PAD_T + chartH - ((v - loP) / rng) * chartH;

  ctx.clearRect(0, 0, W, H);

  // ── Watermark Logo (fullscreen chart) ──
  if (typeof _chartLogoReady !== 'undefined' && _chartLogoReady && _chartLogoImg.complete) {
    const logoSize = Math.min(W, H) * 0.42;
    const logoX = W / 2 - logoSize / 2;
    const logoY = H / 2 - logoSize / 2;
    ctx.save();
    const glow = ctx.createRadialGradient(W/2,H/2,logoSize*0.1,W/2,H/2,logoSize*0.62);
    glow.addColorStop(0,'rgba(212,168,84,0.06)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(W/2,H/2,logoSize*0.62,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=0.055; ctx.filter='blur(0.5px)';
    ctx.drawImage(_chartLogoImg,logoX,logoY,logoSize,logoSize);
    ctx.filter='none'; ctx.globalAlpha=0.07;
    ctx.drawImage(_chartLogoImg,logoX,logoY,logoSize,logoSize);
    ctx.globalAlpha = 0.10;
    ctx.font = `bold ${Math.round(logoSize * 0.135)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4a854';
    ctx.letterSpacing = `${Math.round(logoSize * 0.025)}px`;
    ctx.fillText('Trader Cafe Club', W / 2, logoY + logoSize + logoSize * 0.22);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  // ── Grid lines + Y price labels (nice round numbers) ──
  ctx.lineWidth = 1;
  const _cfoGridLevels = _niceGridLevels(loP, loP + rng, 5);
  _cfoGridLevels.forEach(price => {
    if (price < loP || price > loP + rng) return;
    const y = toY(price);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(fmtP(price), W - PAD_R + 4, y + 3);
  });

  // ── MA lines (computed on full visible range for accuracy) ──
  function calcMAOnWindow(n) {
    // ต้องมี candles ก่อน vStart เพื่อ MA จึง look back จาก candles ทั้งหมด
    const result = [];
    for (let slot = 0; slot < vis; slot++) {
      const idx = vStart + slot;
      if (idx < 0 || idx >= total || idx < n - 1) { result.push(null); continue; }
      let sum = 0;
      for (let j = idx - n + 1; j <= idx; j++) {
        if (j < 0) { sum = null; break; }
        sum += candles[j].c;
      }
      result.push(sum !== null ? sum / n : null);
    }
    return result;
  }
  const maColors = { 7: '#f0a500', 25: '#e040fb', 99: '#26c6da' };
  [7, 25, 99].forEach(period => {
    const ma = calcMAOnWindow(period);
    ctx.beginPath(); ctx.strokeStyle = maColors[period]; ctx.lineWidth = 1.2;
    let first = true;
    ma.forEach((v, slot) => {
      if (v === null) return;
      const x = PAD_L + (slot + 0.5) * slotW;
      const y = toY(v);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = ma.filter(v => v !== null).pop();
    if (last) {
      const ids = { 7:'cfoma7', 25:'cfoma25', 99:'cfoma99' };
      const el = document.getElementById(ids[period]);
      if (el) el.textContent = ' ' + last.toFixed(1);
    }
  });

  // ── Candles ──
  for (let slot = 0; slot < vis; slot++) {
    const idx = vStart + slot;
    if (idx < 0 || idx >= total) continue;   // empty slot (pan beyond edge)
    const c = candles[idx];
    const x = PAD_L + slot * slotW;
    const isUp = c.c >= c.o;
    const col = isUp ? '#0ecb81' : '#f6465d';
    const openY = toY(c.o), closeY = toY(c.c);
    const hiY = toY(c.h), loY2 = toY(c.l);
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 1);
    const cx = x + cw / 2;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, hiY); ctx.lineTo(cx, loY2); ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(x, bodyY, cw, bodyH);
  }

  // ── Current price tag (สำหรับ candle ล่าสุด) ──
  const last = candles[total - 1];
  const curY = toY(last.c);
  ctx.strokeStyle = 'rgba(240,185,11,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(PAD_L, curY); ctx.lineTo(W - PAD_R, curY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f0b90b'; ctx.beginPath();
  ctx.roundRect(W - PAD_R + 2, curY - 9, PAD_R - 4, 18, 3); ctx.fill();
  ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(last.c.toFixed(1), W - PAD_R + (PAD_R - 4)/2 + 2, curY + 4);

  // ── Position Lines (Entry, TP, SL) ──
  (function() {
    const src = (cfoMode === 'spot')
      ? (typeof SP !== 'undefined' ? SP : null)
      : (typeof S !== 'undefined' ? S : null);
    if (!src || !src.positions || !src.positions.length) return;
    let visPos = (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId)
      ? src.positions.filter(p => p.earnContractId === selectedEarnContractId)
      : src.positions;
    visPos = visPos.filter(p => p.symbol === src.symbol);
    if (!visPos.length) return;
    ctx.save();
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    visPos.forEach(p => {
      const isLong = p.side === 'long';
      const entryCol = isLong ? '#0ecb81' : '#f6465d';
      const ey = toY(p.entry);
      if (ey >= PAD_T - 2 && ey <= H - PAD_B + 2) {
        ctx.save();
        ctx.setLineDash([5,3]); ctx.strokeStyle = entryCol; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(PAD_L, ey); ctx.lineTo(W - PAD_R - 2, ey); ctx.stroke();
        ctx.globalAlpha = 1; ctx.setLineDash([]);
        const lbl = (isLong ? 'L' : 'S') + ' ' + (typeof fmtP === 'function' ? fmtP(p.entry) : p.entry.toFixed(1));
        const tw = ctx.measureText(lbl).width + 8;
        ctx.fillStyle = entryCol;
        ctx.fillRect(PAD_L, ey - 7, tw, 14);
        ctx.fillStyle = isLong ? '#000' : '#fff';
        ctx.textAlign = 'left'; ctx.fillText(lbl, PAD_L + 4, ey + 3); ctx.textAlign = 'right';
        ctx.restore();
      }
      if (p.tp) {
        const ty = toY(p.tp);
        if (ty >= PAD_T - 2 && ty <= H - PAD_B + 2) {
          ctx.save();
          ctx.setLineDash([4,4]); ctx.strokeStyle = 'rgba(14,203,129,0.5)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(PAD_L, ty); ctx.lineTo(W - PAD_R - 2, ty); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(14,203,129,0.75)';
          const tpTxt = 'TP ' + (typeof fmtP === 'function' ? fmtP(p.tp) : p.tp.toFixed(1));
          const tw = ctx.measureText(tpTxt).width + 8;
          ctx.fillRect(PAD_L, ty - 7, tw, 14);
          ctx.fillStyle = '#000'; ctx.textAlign = 'left';
          ctx.fillText(tpTxt, PAD_L + 4, ty + 3);
          ctx.textAlign = 'right'; ctx.restore();
        }
      }
      if (p.sl) {
        const sy = toY(p.sl);
        if (sy >= PAD_T - 2 && sy <= H - PAD_B + 2) {
          ctx.save();
          ctx.setLineDash([4,4]); ctx.strokeStyle = 'rgba(246,70,93,0.5)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(PAD_L, sy); ctx.lineTo(W - PAD_R - 2, sy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(246,70,93,0.75)';
          const slTxt = 'SL ' + (typeof fmtP === 'function' ? fmtP(p.sl) : p.sl.toFixed(1));
          const tw = ctx.measureText(slTxt).width + 8;
          ctx.fillRect(PAD_L, sy - 7, tw, 14);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
          ctx.fillText(slTxt, PAD_L + 4, sy + 3);
          ctx.textAlign = 'right'; ctx.restore();
        }
      }
    });
    ctx.restore();
  })();

  // ── Time labels (first & last visible real candle) ──
  let firstReal = null, lastReal = null;
  for (let slot = 0; slot < vis; slot++) {
    const idx = vStart + slot;
    if (idx >= 0 && idx < total) { if (!firstReal) firstReal = candles[idx]; lastReal = candles[idx]; }
  }
  function fmtT(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
      +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }
  const t1el = document.getElementById('cfoT1');
  const t2el = document.getElementById('cfoT2');
  if (t1el) t1el.textContent = firstReal ? fmtT(firstReal.t || firstReal.time) : '—';
  if (t2el) t2el.textContent = lastReal  ? fmtT(lastReal.t  || lastReal.time)  : '—';
}

// Resize support
window.addEventListener('resize', () => {
  if (document.getElementById('chartFullOverlay').classList.contains('active')) {
    drawCfoChart();
  }
});

// Swipe down to close
(function(){
  let startY = 0;
  const ov = document.getElementById('chartFullOverlay');
  ov.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, {passive:true});
  ov.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - startY > 80) closeChartFull();
  }, {passive:true});
})();
