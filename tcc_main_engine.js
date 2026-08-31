// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
const S = {
  coin: 'BTC', symbol: 'BTCUSDT',
  markPrice: 0, prevPrice: 0,
  asks: [], bids: [],
  candles: [],
  positions: [],
  openOrders: [],   // Limit orders รอ fill
  funding: { rate: 0, countdown: '' },
  oc: 'open', side: 'S', lev: 150,
  orderType: 'Limit', tpslOn: false,
  hideOthers: true, chartVisible: true,
  tf: '3m', tab: 'pos',
  apiOk: false,
  wsConnected: false,
  // coin map: Hyperliquid uses coin name without USDT — populated dynamically from loadPerpList
  coinMap: {},
  allPerps: [],   // populated from Hyperliquid metaAndAssetCtxs
  coinPrices: {}
};

// ═══════════════════════════════════════════════
//  HYPERLIQUID API
// ═══════════════════════════════════════════════
const HL_API = 'https://api.hyperliquid.xyz/info';

// ── Throttle queue: จำกัดจำนวน request พร้อมกันไป Hyperliquid /info ──
// ป้องกัน 429/500 ตอน initial load ที่ยิงหลาย hlPost พร้อมกัน
const _HL_MAX_CONCURRENT = 4;
let _hlActive = 0;
const _hlQueue = [];

function _hlRunNext() {
  if (_hlActive >= _HL_MAX_CONCURRENT || !_hlQueue.length) return;
  const { fn, resolve, reject } = _hlQueue.shift();
  _hlActive++;
  fn().then(resolve, reject).finally(() => {
    _hlActive--;
    _hlRunNext();
  });
}

function _hlEnqueue(fn) {
  return new Promise((resolve, reject) => {
    _hlQueue.push({ fn, resolve, reject });
    _hlRunNext();
  });
}

async function hlPost(body, _retries = 2) {
  return _hlEnqueue(async () => {
    let lastErr;
    for (let attempt = 0; attempt <= _retries; attempt++) {
      try {
        const r = await fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!r.ok) {
          // 429 (rate limit) / 500 (server error ชั่วคราว) → retry หลัง delay
          if ((r.status === 429 || r.status >= 500) && attempt < _retries) {
            await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
            continue;
          }
          throw new Error('HTTP ' + r.status);
        }
        return r.json();
      } catch (e) {
        lastErr = e;
        if (attempt < _retries) {
          await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
          continue;
        }
      }
    }
    throw lastErr;
  });
}

async function fetchMeta() {
  try {
    const d = await hlPost({ type: 'meta' });
    setApiStatus(true, 'เชื่อมต่อ Hyperliquid สำเร็จ');
    return d;
  } catch(e) {
    setApiStatus(false, 'API Error: ' + e.message);
  }
}

async function fetchAllMids() {
  try {
    const d = await hlPost({ type: 'allMids' });
    // d is object {coin: price_str, ...}
    S.coinPrices = d;
    // update dropdown prices for all loaded perps
    (S.allPerps.length ? S.allPerps : Object.entries(S.coinMap).map(([sym,coin]) => ({coin,sym}))).forEach(p => {
      const el = document.getElementById('dd-' + p.coin);
      if (el && d[p.coin]) el.textContent = parseFloat(d[p.coin]).toLocaleString('en',{maximumFractionDigits:4});
    });
    // update current symbol price
    const curCoin = S.coinMap[S.symbol] || S.coin;
    if (d[curCoin]) {
      S.prevPrice = S.markPrice;
      S.markPrice = parseFloat(d[curCoin]);
      _checkLimitOrderFill(); // ── ตรวจ Limit Order fill ทุก poll tick ──
      updateTopBar();
      updatePositionsPNL();
    }
  } catch(e) {}
}

async function fetchOrderBook() {
  try {
    const coin = S.coinMap[S.symbol] || S.coin;
    const d = await hlPost({ type: 'l2Book', coin: _wsCoinName(coin), ..._dexParam(coin) });
    // d.levels = [[asks...],[bids...]] each item {px, sz, n}
    if (d && d.levels) {
      S.asks = d.levels[0].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)})).reverse();
      S.bids = d.levels[1].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)}));
      renderOrderBook();
    }
  } catch(e) {}
}

// ── Candle fetch helpers ──
const CANDLE_BATCH = 500; // candles per fetch
const CANDLE_MAX   = 2000; // max stored candles

function _parseCandles(raw) {
  return (raw || []).map(c => ({
    t: Number(c.t),
    o: parseFloat(c.o), h: parseFloat(c.h),
    l: parseFloat(c.l), c: parseFloat(c.c),
    v: parseFloat(c.v || 0)
  })).filter(c =>
    isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c)
    && c.h >= c.l && c.h > 0 && c.l > 0
    && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c)
  );
}

function _candleInterval(tf) {
  return { '1s':'1m','1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','2h':'2h','4h':'4h' }[tf] || '5m';
}

function _candleMs(interval) {
  return { '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000 }[interval] || 300000;
}

async function fetchCandles(tf) {
  showChartLoading(true);
  const coin = S.coinMap[S.symbol] || S.coin;
  try {
    const interval = _candleInterval(tf);
    const ms = _candleMs(interval);
    const now = Date.now();
    const startTime = now - ms * CANDLE_BATCH;

    const d = await hlPost({ type:'candleSnapshot', req:{ coin: _wsCoinName(coin), interval, startTime, endTime: now }, ..._dexParam(coin) });
    const candles = _parseCandles(d);
    if (!candles.length) { showChartLoading(false); return; }

    S.candles = candles.slice(-CANDLE_BATCH);
    S._candleTf       = tf;
    S._candleInterval = interval;
    S._candleCoin     = coin;
    S._loadingMore    = false;

    // อัพเดท candleMs เฉพาะเมื่อ TF เปลี่ยน (ป้องกัน countdown กระโดดจาก periodic refresh)
    const tfChanged = S._candleMs !== ms;
    S._candleMs = ms;

    CHART_PANELS.fut.viewStart = null;
    drawChart();
    // เริ่ม countdown ใหม่เฉพาะเมื่อ TF เปลี่ยน ไม่ใช่ทุกครั้งที่ refresh
    if (tfChanged && typeof startFutCountdown === 'function') startFutCountdown();
  } catch(e) {
    console.warn('fetchCandles error:', e);
    // ไม่สร้างข้อมูลปลอม (demo candles) — ถ้า API ล้ม ให้กราฟว่าง/loading รอข้อมูลจริงรอบถัดไป
  }
  showChartLoading(false);
}

// Load older candles when user pans near the left edge
async function fetchMoreCandlesBefore() {
  if (S._loadingMore) return;
  if (!S.candles.length) return;
  S._loadingMore = true;
  try {
    const coin = S.coinMap[S.symbol] || S.coin;
    const interval = S._candleInterval || _candleInterval(S.tf);
    const ms       = S._candleMs      || _candleMs(interval);
    const endTime  = S.candles[0].t - 1; // just before first candle
    const startTime = endTime - ms * CANDLE_BATCH;

    const d = await hlPost({ type:'candleSnapshot', req:{ coin: _wsCoinName(coin), interval, startTime, endTime }, ..._dexParam(coin) });
    const older = _parseCandles(d);
    if (older.length) {
      // Prepend, deduplicate by t, cap total
      const merged = [...older, ...S.candles];
      const seen = new Set();
      const deduped = merged.filter(c => { if (seen.has(c.t)) return false; seen.add(c.t); return true; });
      deduped.sort((a, b) => a.t - b.t);
      S.candles = deduped.slice(-CANDLE_MAX);
      // Shift viewStart to keep same visual position
      const added = S.candles.length - (deduped.length < CANDLE_MAX ? older.length : 0);
      if (CHART_PANELS.fut.viewStart !== null) {
        CHART_PANELS.fut.viewStart += older.length;
      }
      drawChart();
    }
  } catch(e) {
    console.warn('fetchMoreCandlesBefore error:', e);
  }
  S._loadingMore = false;
}

function showChartLoading(show) {
  let el = document.getElementById('chartLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chartLoading';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(11,14,17,.8);display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none;transition:opacity .2s';
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div style="width:20px;height:20px;border:2px solid #363c46;border-top-color:#f0b90b;border-radius:50%;animation:spin .7s linear infinite"></div><span style="font-size:10px;color:#848e9c">Loading chart...</span></div>';
    const wrap = document.getElementById('chartCanvas')?.parentElement;
    if (wrap) wrap.appendChild(el);
    // add keyframe if missing
    if (!document.getElementById('spinStyle')) {
      const s = document.createElement('style');
      s.id = 'spinStyle';
      s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }
  el.style.opacity = show ? '1' : '0';
  el.style.pointerEvents = show ? 'all' : 'none';
}

async function fetchFunding() {
  if (!S._fundingRates) S._fundingRates = {};
  // [FIX funding-all-coins] ดึง rate ของ coin ที่กำลังดูอยู่ก่อน (เพื่อ UI topbar)
  try {
    const coin = S.coinMap[S.symbol] || S.coin;
    const d = await hlPost({ type: 'fundingHistory', coin, startTime: Date.now() - 28800000 });
    if (d && d.length) {
      const latest = d[d.length - 1];
      S.funding.rate = parseFloat(latest.fundingRate) * 100;
      S._fundingRates[coin] = parseFloat(latest.fundingRate);
      updateFunding();
    }
  } catch(e) {}

  // [FIX funding-all-coins] ดึง rate ของทุก coin ที่มี open position (parallel)
  // เพื่อให้ startFundingTimer หัก funding ได้ถูกต้องแม้ไม่ได้ดูเหรียญนั้นอยู่
  const positionCoins = [...new Set(
    (S.positions || []).map(p => p.coin).filter(c => c && c !== (S.coinMap[S.symbol] || S.coin))
  )];
  if (!positionCoins.length) return;
  await Promise.allSettled(positionCoins.map(async (coin) => {
    try {
      const d = await hlPost({ type: 'fundingHistory', coin, startTime: Date.now() - 28800000 });
      if (d && d.length) {
        S._fundingRates[coin] = parseFloat(d[d.length - 1].fundingRate);
      }
    } catch(e) {}
  }));
}

function startFundingTimer() {
  let _lastFundingHour = -1;
  function tick() {
    const now = new Date();
    const h = now.getUTCHours();
    const next8h = (Math.floor(h / 8) + 1) * 8;
    const nextTime = new Date(now);
    nextTime.setUTCHours(next8h % 24, 0, 0, 0);
    if (next8h >= 24) nextTime.setUTCDate(nextTime.getUTCDate() + 1);
    const diff = nextTime - now;
    const hh = Math.floor(diff / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    S.funding.countdown = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    // Log funding fee when crossing the 8h mark
    const currentFundingHour = Math.floor(h / 8) * 8;
    if (_lastFundingHour !== currentFundingHour && typeof HIST !== 'undefined' && S.positions.length > 0) {
      // ⚠️ [AI WARNING - Fix4][v9 FIX] ตรวจ Sync Lock ก่อนหัก funding เสมอ
      // ถ้า loadOfflineState ยังไม่เสร็จ (refresh lock/grace period ยังคงอยู่) → ข้าม funding tick รอบนี้
      // ป้องกัน _lastFundingHour reset เป็น -1 ทุก refresh → funding หัก realizedPnl ซ้ำก่อน GAS โหลดกลับมา
      if (_isSyncLocked()) {
        // ยังอยู่ใน grace period → อัพเดท _lastFundingHour เพื่อไม่ให้ tick รอบนี้ยิงซ้ำ แต่ไม่หัก
        _lastFundingHour = currentFundingHour;
      } else {
      _lastFundingHour = currentFundingHour;
      // [FIX Bug5] แต่ละ position ใช้ funding rate ของ coin ตัวเองจาก cache
      // ถ้าไม่มี cache ให้ fallback ไป S.funding.rate (ของเหรียญที่กำลังดูกราฟ)
      // แต่เฉพาะกรณีที่ coin ตรงกับ S.coin เท่านั้น ป้องกัน cross-coin contamination
      // [FIX funding-all-coins] ดึง rate ทุก coin ที่มี position ก่อนหัก
      // เพื่อให้ cache ครบก่อนวนหัก (async แต่ไม่ await — ใช้ cache ที่มีอยู่ก่อน)
      fetchFunding();

      // [FIX FREEZE-ON-REFRESH v9.8] pre-build set ของ contracts ที่หักรอบนี้แล้ว
      // ก่อนเข้า loop — ป้องกัน multi-position ใน contract เดียวกัน
      // หัก realizedPnl ซ้ำกัน (bug ใน v9.7 ที่ mark หลัง loop ช้าเกินไป)
      const alreadyChargedThisHour = new Set(
        (typeof earnContracts !== 'undefined' ? earnContracts : [])
          .filter(c => c._lastFundedHour === currentFundingHour)
          .map(c => c.contractId)
      );

      // [v8 FIX DUPLICATE-FUNDING] สะสม charged ต่อ contract รอบนี้ก่อน แล้วค่อยหักครั้งเดียว
      // ป้องกัน 3 positions ใน contract เดียว → หัก realizedPnl 3 ครั้งต่อ funding tick
      // เดิม: alreadyChargedThisHour.add() หลัง forEach แต่ forEach ยังวน → charged ซ้ำก่อน add
      const fundingChargedPerContract = {}; // { contractId: totalCharged }

      const affectedContracts = new Set();
      S.positions.forEach(p => {
        const coinPrice = parseFloat(S.coinPrices[p.coin]) || p.mark || p.entry;
        const notional = coinPrice * p.size;
        // ใช้ funding rate จาก S._fundingRates cache (per-coin)
        // fetchFunding() อัปเดต cache ของทุก coin ที่มี position แล้ว
        const fundingRate = (S._fundingRates && S._fundingRates[p.coin] !== undefined)
          ? S._fundingRates[p.coin]
          : (p.coin === S.coin ? S.funding.rate / 100 : 0);
        if (!fundingRate) return; // ยังไม่มี rate → ข้าม (จะได้รอบหน้าที่ cache พร้อม)
        const fundingAmt = notional * fundingRate;
        const charged = p.side === 'long' ? -fundingAmt : fundingAmt; // long pays, short receives
        // บันทึกประวัติ funding ทุก position (log ปกติทุก position)
        HIST.logFunding(p.symbol || (p.coin + 'USDT'), charged);
        // [v8 FIX] ข้าม contract ที่ _lastFundedHour ตรงแล้ว (หักไปรอบก่อนแล้ว)
        if (alreadyChargedThisHour.has(p.earnContractId)) return;
        // [v8 FIX] สะสม charged ต่อ contract — ยังไม่หักทันที (ป้องกัน multi-position)
        if (p.earnContractId) {
          fundingChargedPerContract[p.earnContractId] = (fundingChargedPerContract[p.earnContractId] || 0) + charged;
        }
      });

      // [v8 FIX] หัก realizedPnl ต่อ contract ครั้งเดียวหลังรวม charged ครบทุก position
      Object.entries(fundingChargedPerContract).forEach(([cid, totalCharged]) => {
        const c = earnContracts.find(x => x.contractId === cid);
        if (c) {
          c.realizedPnl = (c.realizedPnl || 0) + totalCharged;
          syncContractBalance(c);
          _refreshAvbl(c);
          affectedContracts.add(c.contractId);
        }
      });
      // mark _lastFundedHour บน contract object เพื่อ persist ข้าม tick
      affectedContracts.forEach(cid => {
        const _c = earnContracts.find(x => x.contractId === cid);
        if (_c) _c._lastFundedHour = currentFundingHour;
      });
      // อัปเดต UI หลังหัก funding ครบทุก position
      if (affectedContracts.size > 0) {
        renderEarnContracts();
        if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
      }
      } // end else (not in grace period) — Fix4 grace period guard
    }

    updateFunding();
  }
  tick();
  setInterval(tick, 1000);
}

function updateFunding() {
  const el = document.getElementById('fundingVal');
  if (el) el.textContent = `${S.funding.rate.toFixed(5)}%/${S.funding.countdown||'--:--:--'}`;
}

function setApiStatus(ok, msg) {
  S.apiOk = ok;
  const dot = document.getElementById('apiDot');
  const txt = document.getElementById('apiStatusText');
  if (dot) { dot.className = 'api-dot ' + (ok ? 'ok' : 'err'); }
  if (txt) txt.textContent = msg;
}

// WebSocket for real-time L2 book
let ws = null;
function connectWS() {
  try {
    ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
    ws.onopen = () => {
      S.wsConnected = true;
      const coin = S.coinMap[S.symbol] || S.coin;
      ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'l2Book', coin: _wsCoinName(coin) } }));
      ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'trades', coin: _wsCoinName(coin) } }));
      // [FIX Bug6] subscribe coins ของทุก position ที่เปิดอยู่ เพื่อให้ PnL real-time ครบทุก coin
      const extraCoins = new Set(S.positions.map(p => p.coin).filter(c => c && c !== coin));
      extraCoins.forEach(c => {
        ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'trades', coin: _wsCoinName(c) } }));
      });
      setApiStatus(true, 'WebSocket เชื่อมต่อสำเร็จ — TCC Market Live');
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.channel === 'l2Book' && d.data) {
          const book = d.data;
          // Ignore messages for coins other than current (stale/in-flight from previous subscription)
          if (book.coin && _normWsCoin(book.coin) !== S.coin) return;
          if (book.levels) {
            S.asks = book.levels[0].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)})).reverse();
            S.bids = book.levels[1].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)}));
            if (S.asks.length && S.bids.length) {
              const midPrice = (S.asks[S.asks.length-1].p + S.bids[0].p) / 2;
              // EMA smoothing: α=0.3 — blends new mid-price with existing markPrice
              const alpha = 0.3;
              S.prevPrice = S.markPrice;
              S.markPrice = S.markPrice > 0
                ? S.markPrice * (1 - alpha) + midPrice * alpha
                : midPrice;
              updateTopBar();
              renderOrderBook();
              updatePositionsPNL();
              _checkLimitOrderFill(); // [v13.9 FIX1a] ตรวจ fill ทุกครั้งที่ราคา l2Book อัปเดต
            }
          }
        }
        if (d.channel === 'trades' && d.data && d.data.length) {
          const t = d.data[0];
          const tradeCoin = _normWsCoin(t.coin);
          const tradePrice = parseFloat(t.px);
          if (!tradeCoin || !tradePrice) return; // ข้ามถ้าข้อมูลไม่ครบ

          if (tradeCoin === S.coin) {
            // coin ที่กำลังดูกราฟอยู่ → filter noise เหมือนเดิม + อัปเดต markPrice
            if (S.markPrice > 0) {
              const deviation = Math.abs(tradePrice - S.markPrice) / S.markPrice;
              if (deviation < 0.0005) {
                S.prevPrice = S.markPrice;
                S.markPrice = tradePrice;
              }
            } else {
              S.prevPrice = S.markPrice;
              S.markPrice = tradePrice;
            }
            // cache ไว้ใน coinPrices ด้วย
            if (!S.coinPrices) S.coinPrices = {};
            S.coinPrices[tradeCoin] = String(tradePrice);
            updateTopBar();
            updateChart(S.markPrice);
            updatePositionsPNL();
            _checkLimitOrderFill();
          } else {
            // [FIX Bug6] coin อื่น (position อื่น) → อัปเดต coinPrices เท่านั้น
            // ไม่อัปเดต S.markPrice หรือ chart ของเหรียญที่กำลังดูอยู่
            if (!S.coinPrices) S.coinPrices = {};
            const prevCoinPrice = parseFloat(S.coinPrices[tradeCoin]) || 0;
            if (prevCoinPrice > 0) {
              const dev = Math.abs(tradePrice - prevCoinPrice) / prevCoinPrice;
              if (dev < 0.005) S.coinPrices[tradeCoin] = String(tradePrice); // filter outlier 0.5%
            } else {
              S.coinPrices[tradeCoin] = String(tradePrice);
            }
            // อัปเดต PnL ของ positions เฉพาะเหรียญที่ได้ราคาใหม่ (ไม่ full re-render)
            const hasCoinPos = S.positions.some(p => p.coin === tradeCoin);
            if (hasCoinPos) updatePositionsPNL();
            // [v13.9 FIX1b] ตรวจ limit orders ของเหรียญนี้ด้วย ไม่รอ poll
            const hasCoinOrder = (S.openOrders || []).some(o => o.coin === tradeCoin);
            if (hasCoinOrder) _checkLimitOrderFill();
          }
        }
      } catch(ex) {}
    };
    ws.onerror = () => { S.wsConnected = false; };
    ws.onclose = () => {
      S.wsConnected = false;
      setApiStatus(false, 'WebSocket ตัดการเชื่อมต่อ — กำลังเชื่อมต่อใหม่...');
      setTimeout(connectWS, 3000);
    };
  } catch(ex) {
    setApiStatus(false, 'WebSocket ไม่รองรับ — ใช้ polling แทน');
    startPolling();
  }
}

function startPolling() {
  setInterval(async () => {
    await fetchAllMids();
    await fetchOrderBook();
  }, 2000);
}

// ═══════════════════════════════════════════════
//  RENDER ORDER BOOK
// ═══════════════════════════════════════════════
function renderOrderBook() {
  // Fix 1: separate maxAsk / maxBid so each side normalizes independently
  const maxAsk = Math.max(...S.asks.map(a=>a.s), 0.001);
  const maxBid = Math.max(...S.bids.map(b=>b.s), 0.001);

  // ASKS (sell side - red) - reversed so lowest ask at bottom
  const askList = document.getElementById('askList');
  if (askList && S.asks.length) {
    askList.innerHTML = S.asks.map(a => {
      const pct = Math.min(100, (a.s / maxAsk) * 100);
      return `<div class="ob-row" onclick="fillPrice(${a.p})">
        <div class="ob-bar ask" style="width:${pct}%"></div>
        <span class="ob-price ask">${fmtP(a.p)}</span>
        <span class="ob-amt">${a.s.toFixed(3)}</span>
      </div>`;
    }).join('');
  }

  // BIDS (buy side - green)
  const bidList = document.getElementById('bidList');
  if (bidList && S.bids.length) {
    bidList.innerHTML = S.bids.map(b => {
      const pct = Math.min(100, (b.s / maxBid) * 100);
      return `<div class="ob-row" onclick="fillPrice(${b.p})">
        <div class="ob-bar bid" style="width:${pct}%"></div>
        <span class="ob-price bid">${fmtP(b.p)}</span>
        <span class="ob-amt">${b.s.toFixed(3)}</span>
      </div>`;
    }).join('');
  }

  // Mid price
  const mid = document.getElementById('obMidPrice');
  const mark = document.getElementById('obMarkPrice');
  if (mid && S.markPrice) {
    const isUp = S.markPrice >= S.prevPrice;
    mid.textContent = fmtP(S.markPrice);
    mid.className = 'ob-mid-price ' + (isUp ? 'up' : 'dn');
  }
  if (mark && S.asks.length && S.bids.length) {
    const spread = S.asks[S.asks.length-1].p - S.bids[0].p;
    mark.textContent = fmtP(S.bids[0].p + spread * 0.5 + spread * 0.1);
  }

  // Ratio
  if (S.asks.length && S.bids.length) {
    const totalBid = S.bids.reduce((s,b)=>s+b.s*b.p,0);
    const totalAsk = S.asks.reduce((s,a)=>s+a.s*a.p,0);
    const total = totalBid + totalAsk;
    const bidPct = total > 0 ? (totalBid / total * 100) : 50;
    const askPct = 100 - bidPct;
    const rFill = document.getElementById('obRatioFill');
    const rL = document.getElementById('obLongR');
    const rR = document.getElementById('obShortR');
    if (rFill) rFill.style.width = bidPct.toFixed(2) + '%';
    if (rL) rL.textContent = bidPct.toFixed(2) + '%';
    if (rR) rR.textContent = askPct.toFixed(2) + '%';
  }
}

// ═══════════════════════════════════════════════
//  CANDLESTICK CHART
// ═══════════════════════════════════════════════
// ── Chart Watermark Logo ──
const _chartLogoImg = new Image();
_chartLogoImg.src = 'data:image/png;base64,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';
let _chartLogoReady = false;
_chartLogoImg.onload = () => { _chartLogoReady = true; if(typeof drawChart === 'function') drawChart(); };

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');

// ══════════════════════════════════════════════════════════════
//  CHART UTILITY — Nice round grid step (shared by all charts)
// ══════════════════════════════════════════════════════════════
function _niceGridStep(range, targetDivisions) {
  if (!range || range <= 0) return 1;
  const rough = range / targetDivisions;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if      (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else                 step = 10;
  return step * mag;
}
// Returns array of nice price levels within [lo, hi]
function _niceGridLevels(lo, hi, targetDivisions) {
  const step = _niceGridStep(hi - lo, targetDivisions);
  const first = Math.ceil(lo / step) * step;
  const levels = [];
  for (let p = first; p <= hi + 1e-9; p += step) {
    levels.push(parseFloat(p.toPrecision(12)));
  }
  return levels;
}

function drawChart() {
  if (!S.candles.length) return;
  // Pan/Zoom via unified CHART_PANELS viewStart/visCount
  const vp = (typeof chartViewSlice !== 'undefined')
    ? chartViewSlice('fut')
    : { viewStart: S.candles.length - 80, visCount: 80, all: S.candles, candles: S.candles.slice(-80) };
  const { viewStart: vs, visCount: vis, all } = vp;
  if (!all.length) return;

  // ── Canvas setup with correct DPR reset ──
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 0;
  const H = wrap.clientHeight || 0;
  // Skip draw if container is hidden (page not active)
  if (W < 10 || H < 10) return;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const PAD_R = 64, PAD_T = 12, PAD_B = 22, PAD_L = 2;
  const CW = W - PAD_R - PAD_L;
  const CH = H - PAD_T - PAD_B;

  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, W, H);

  // ── Watermark Logo — centered on full canvas (not chart area) ──
  if (_chartLogoReady && _chartLogoImg.complete) {
    const logoSize = Math.min(W, H) * 0.48;
    const logoX = W / 2 - logoSize / 2;
    const logoY = H / 2 - logoSize / 2;

    ctx.save();
    // Outer soft radial glow — premium gold aura
    const glow = ctx.createRadialGradient(
      W / 2, H / 2, logoSize * 0.1,
      W / 2, H / 2, logoSize * 0.62
    );
    glow.addColorStop(0,   'rgba(212,168,84, 0.07)');
    glow.addColorStop(0.5, 'rgba(180,140,60, 0.03)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, logoSize * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.055;
    ctx.filter = 'blur(0.5px)';
    ctx.drawImage(_chartLogoImg, logoX, logoY, logoSize, logoSize);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.07;
    ctx.drawImage(_chartLogoImg, logoX, logoY, logoSize, logoSize);
    // Trader Cafe Club text below logo
    ctx.globalAlpha = 0.10;
    ctx.font = `bold ${Math.round(logoSize * 0.135)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4a854';
    ctx.letterSpacing = `${Math.round(logoSize * 0.025)}px`;
    ctx.fillText('Trader Cafe Club', W / 2, logoY + logoSize + logoSize * 0.22);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
  const realStart = Math.max(0, vs);
  const realEnd   = Math.min(all.length, vs + vis);
  const visCandles = all.slice(realStart, realEnd);
  if (!visCandles.length) return;

  const allCloses = [...visCandles.map(c => c.c)].sort((a,b) => a-b);
  const p05 = allCloses[Math.max(0, Math.floor(allCloses.length * 0.05))];
  const p95 = allCloses[Math.min(allCloses.length-1, Math.floor(allCloses.length * 0.95))];
  const spread = (p95 - p05) || p05 * 0.02 || 1;
  const yPad = (typeof CHART_PANELS !== 'undefined' ? (CHART_PANELS.fut.yPadFactor || 0.15) : 0.15);
  const yOffset = (typeof CHART_PANELS !== 'undefined' ? (CHART_PANELS.fut.yOffset || 0) : 0);
  const pad = spread * yPad;
  let minP = p05 - pad;
  let maxP = p95 + pad;
  // expand to actual h/l but cap extreme outlier wicks (>50% from body range)
  visCandles.forEach(c => {
    const capH = Math.min(c.h, maxP + spread * 0.5);
    const capL = Math.max(c.l, minP - spread * 0.5);
    if (capH > maxP) maxP = capH;
    if (capL < minP) minP = capL;
  });
  const range = maxP - minP || 1;
  // yOffset shifts the visible price window up/down by adjusting minP/maxP
  // yOffset > 0 → pan up (show lower prices), yOffset < 0 → pan down (show higher prices)
  const _priceShift = yOffset * range;
  const _minPv = minP + _priceShift;
  const _maxPv = maxP + _priceShift;
  const scY = p => PAD_T + (1 - (p - _minPv) / range) * CH;

  // ── slot width — based on visCount, not actual candle count ──
  const slotW = CW / vis;

  // ── Grid lines + price labels (nice round numbers) ──
  ctx.font = '9px Roboto Mono, monospace';
  ctx.textAlign = 'right';
  const _futGridLevels = _niceGridLevels(_minPv, _maxPv, 5);
  _futGridLevels.forEach(price => {
    if (price < _minPv || price > _maxPv) return;
    const y = scY(price);
    ctx.strokeStyle = 'rgba(43,49,57,0.6)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.fillStyle = '#848e9c';
    ctx.fillText(fmtP(price), W - 2, y + 3);
  });

  // ── MA lines — use all candles for accurate MA, map array index to slot ──
  const maCols = ['#f0a500','#e040fb','#26c6da'];
  const maLW   = [1.5, 1.2, 1.0];
  [7, 25, 99].forEach((period, idx) => {
    ctx.beginPath();
    ctx.strokeStyle = maCols[idx];
    ctx.lineWidth   = maLW[idx];
    ctx.lineJoin    = 'round';
    let started = false;
    for (let ai = realStart; ai < realEnd; ai++) {
      const sl = all.slice(Math.max(0, ai - period + 1), ai + 1);
      const ma = sl.reduce((s, c) => s + c.c, 0) / sl.length;
      // slot index = ai - vs  (may be fractional but we use ai-vs directly)
      const slotIdx = ai - vs;
      const x = PAD_L + (slotIdx + 0.5) * slotW;
      if (!started) { ctx.moveTo(x, scY(ma)); started = true; }
      else { ctx.lineTo(x, scY(ma)); }
    }
    ctx.stroke();
    const lblEl = document.getElementById(['ma7lbl','ma25lbl','ma99lbl'][idx]);
    if (lblEl) {
      // MA value at last visible candle
      const lastI = realEnd - 1;
      const sl = all.slice(Math.max(0, lastI - period + 1), lastI + 1);
      const ma = sl.reduce((s, c) => s + c.c, 0) / sl.length;
      lblEl.textContent = ' ' + fmtP(ma);
    }
  });

  // ── Candlestick bodies + wicks ──
  const bodyW = Math.max(1.5, Math.min(slotW * 0.65, 10));
  const wickW = Math.max(0.5, bodyW * 0.12);

  for (let ai = realStart; ai < realEnd; ai++) {
    const c = all[ai];
    const slotIdx = ai - vs;
    const cx  = PAD_L + (slotIdx + 0.5) * slotW;
    const isUp = c.c >= c.o;
    const col  = isUp ? '#0ecb81' : '#f6465d';
    // wick
    ctx.strokeStyle = col;
    ctx.lineWidth   = wickW;
    ctx.beginPath();
    ctx.moveTo(cx, scY(c.h));
    ctx.lineTo(cx, scY(c.l));
    ctx.stroke();
    // body
    const yTop = Math.min(scY(c.o), scY(c.c));
    const yH   = Math.max(1.5, Math.abs(scY(c.c) - scY(c.o)));
    ctx.fillStyle = col;
    ctx.fillRect(cx - bodyW / 2, yTop, bodyW, yH);
  }

  // ── Current price reference (needed for price overlay below) ──
  const lastC = all[all.length - 1];

  // ── High / Low price markers (Binance style) ──
  {
    let hiIdx = realStart, loIdx = realStart;
    let hiVal = -Infinity, loVal = Infinity;
    for (let ai = realStart; ai < realEnd; ai++) {
      if (all[ai].h > hiVal) { hiVal = all[ai].h; hiIdx = ai; }
      if (all[ai].l < loVal) { loVal = all[ai].l; loIdx = ai; }
    }
    const hiX = PAD_L + (hiIdx - vs + 0.5) * slotW;
    const loX = PAD_L + (loIdx - vs + 0.5) * slotW;
    const hiY = scY(hiVal);
    const loY = scY(loVal);

    ctx.save();
    ctx.font = 'bold 10px Roboto Mono, monospace';

    // High marker
    const hiLabel = fmtP(hiVal);
    const hiLabelW = ctx.measureText(hiLabel).width;
    ctx.beginPath();
    ctx.arc(hiX, hiY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const hiOnLeft = hiX > (W - PAD_R) * 0.55;
    const hiLX = hiOnLeft ? hiX - 6 - hiLabelW - 8 : hiX + 6;
    const hiLY = Math.max(PAD_T + 12, hiY - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(hiX, hiY);
    ctx.lineTo(hiOnLeft ? hiX - 5 : hiX + 5, hiLY + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,34,40,0.82)';
    ctx.fillRect(hiLX - 2, hiLY - 11, hiLabelW + 12, 15);
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.fillText(hiLabel, hiLX + 2, hiLY);

    // Low marker
    const loLabel = fmtP(loVal);
    const loLabelW = ctx.measureText(loLabel).width;
    ctx.beginPath();
    ctx.arc(loX, loY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const loOnLeft = loX > (W - PAD_R) * 0.55;
    const loLX = loOnLeft ? loX - 6 - loLabelW - 8 : loX + 6;
    const loLY = Math.min(PAD_T + CH - 4, loY + 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(loX, loY);
    ctx.lineTo(loOnLeft ? loX - 5 : loX + 5, loLY - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,34,40,0.82)';
    ctx.fillRect(loLX - 2, loLY - 11, loLabelW + 12, 15);
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.fillText(loLabel, loLX + 2, loLY);

    ctx.restore();
  }

  // ── Current price dashed overlay ──
  const priceDiff = S.markPrice > 0 ? Math.abs(S.markPrice - lastC.c) / lastC.c : 1;
  const curP = (S.markPrice > 0 && priceDiff < 0.15) ? S.markPrice : lastC.c;
  const cy   = scY(curP);
  ctx.save();
  ctx.strokeStyle = 'rgba(240,185,11,0.55)';
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(PAD_L, cy); ctx.lineTo(W - PAD_R, cy);
  ctx.stroke();
  ctx.restore();

  const line = document.getElementById('cCurLine');
  const tag  = document.getElementById('cCurTag');
  // Only show current price line if within visible price window
  const _cyMin = PAD_T, _cyMax = PAD_T + CH;
  const _cyVisible = cy >= _cyMin - 2 && cy <= _cyMax + 2;
  if (line) { line.style.top = cy + 'px'; line.style.display = _cyVisible ? '' : 'none'; }
  if (tag)  { tag.style.top = cy + 'px'; tag.textContent = fmtP(curP); tag.style.display = _cyVisible ? '' : 'none'; }

  // ── Position Lines (Entry, TP, SL) — กรอง 2 ชั้นเหมือน renderPositions ──
  if (typeof S !== 'undefined' && S.positions && S.positions.length) {
    // ชั้น 1: กรองตาม selectedEarnContractId
    let visPositions = (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId)
      ? S.positions.filter(p => p.earnContractId === selectedEarnContractId)
      : S.positions;
    // ชั้น 2: กรองเฉพาะ symbol ที่กำลังดูกราฟอยู่ (chart แสดงได้แค่เหรียญเดียว)
    visPositions = visPositions.filter(p => p.symbol === S.symbol);
    ctx.save();
    ctx.font = 'bold 9px Roboto Mono, monospace';
    ctx.textAlign = 'right';
    visPositions.forEach(p => {
      const isLong = p.side === 'long';
      const entryCol = isLong ? '#0ecb81' : '#f6465d';
      const pnlCol   = (p.pnl || 0) >= 0 ? '#0ecb81' : '#f6465d';
      const pnlBg    = (p.pnl || 0) >= 0 ? 'rgba(14,203,129,0.88)' : 'rgba(246,70,93,0.88)';
      const levTxt   = (p.lev || '') + 'x';

      // ── Entry line ──
      const ey = scY(p.entry);
      if (ey >= PAD_T - 2 && ey <= H - PAD_B + 2) {
        ctx.save();
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = entryCol;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(PAD_L, ey); ctx.lineTo(W - PAD_R - 2, ey); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // ── PNL tag (ฝั่งซ้าย) — แบบ Binance ──
        ctx.font = 'bold 9.5px Roboto Mono, monospace';
        const pnlSign = (p.pnl || 0) >= 0 ? '+' : '';
        const pnlTxt  = 'PNL ' + pnlSign + (typeof fmtNum === 'function' ? fmtNum(p.pnl || 0, 2) : (p.pnl || 0).toFixed(2));
        const pnlW = ctx.measureText(pnlTxt).width + 10;
        const tagH = 16, tagY = ey - tagH / 2;
        ctx.fillStyle = pnlBg;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(PAD_L, tagY, pnlW, tagH, 3) : ctx.fillRect(PAD_L, tagY, pnlW, tagH);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(pnlTxt, PAD_L + 5, ey + 3.5);

        // ── Leverage tag (ติดกับ PNL) ──
        ctx.font = 'bold 8.5px Roboto Mono, monospace';
        const levW = ctx.measureText(levTxt).width + 8;
        const levX = PAD_L + pnlW + 2;
        ctx.fillStyle = 'rgba(43,49,57,0.92)';
        ctx.strokeStyle = entryCol;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(levX, tagY, levW, tagH, 3) : ctx.fillRect(levX, tagY, levW, tagH);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = entryCol;
        ctx.textAlign = 'left';
        ctx.fillText(levTxt, levX + 4, ey + 3.5);

        // ── Entry price tag (ฝั่งขวา, ติด price axis) ──
        ctx.font = 'bold 10px Roboto Mono, monospace';
        const ePriceTxt = fmtP(p.entry);
        const ePriceX = W - PAD_R + 2;
        const ePriceRectW = PAD_R - 4;
        ctx.fillStyle = entryCol;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ePriceX, ey - 9, ePriceRectW, 18, 3);
        else ctx.rect(ePriceX, ey - 9, ePriceRectW, 18);
        ctx.fill();
        ctx.fillStyle = isLong ? '#000' : '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(ePriceTxt, ePriceX + 3, ey + 4);

        ctx.textAlign = 'right';
        ctx.restore();
      }

      // ── TP line + right-side tag ──
      if (p.tp) {
        const ty = scY(p.tp);
        if (ty >= PAD_T - 2 && ty <= H - PAD_B + 2) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(14,203,129,0.6)';
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(PAD_L, ty); ctx.lineTo(W - PAD_R - 2, ty); ctx.stroke();
          ctx.setLineDash([]);
          // Right-side price tag (like current price tag)
          ctx.font = 'bold 10px Roboto Mono, monospace';
          ctx.fillStyle = 'rgba(14,203,129,0.88)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(W - PAD_R + 2, ty - 9, PAD_R - 4, 18, 3);
          else ctx.rect(W - PAD_R + 2, ty - 9, PAD_R - 4, 18);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.textAlign = 'left';
          ctx.fillText(fmtP(p.tp), W - PAD_R + 4, ty + 4);
          // Left mini label
          ctx.font = 'bold 8.5px Roboto Mono, monospace';
          const tpLblW = ctx.measureText('TP').width + 8;
          ctx.fillStyle = 'rgba(14,203,129,0.82)';
          ctx.fillRect(PAD_L, ty - 7, tpLblW, 14);
          ctx.fillStyle = '#000';
          ctx.fillText('TP', PAD_L + 4, ty + 3);
          ctx.restore();
        }
      }

      // ── SL line + right-side tag ──
      if (p.sl) {
        const sy = scY(p.sl);
        if (sy >= PAD_T - 2 && sy <= H - PAD_B + 2) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(246,70,93,0.6)';
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(PAD_L, sy); ctx.lineTo(W - PAD_R - 2, sy); ctx.stroke();
          ctx.setLineDash([]);
          // Right-side price tag
          ctx.font = 'bold 10px Roboto Mono, monospace';
          ctx.fillStyle = 'rgba(246,70,93,0.88)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(W - PAD_R + 2, sy - 9, PAD_R - 4, 18, 3);
          else ctx.rect(W - PAD_R + 2, sy - 9, PAD_R - 4, 18);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.fillText(fmtP(p.sl), W - PAD_R + 4, sy + 4);
          // Left mini label
          ctx.font = 'bold 8.5px Roboto Mono, monospace';
          const slLblW = ctx.measureText('SL').width + 8;
          ctx.fillStyle = 'rgba(246,70,93,0.82)';
          ctx.fillRect(PAD_L, sy - 7, slLblW, 14);
          ctx.fillStyle = '#fff';
          ctx.fillText('SL', PAD_L + 4, sy + 3);
          ctx.restore();
        }
      }
      // ── Liq. Price line ──
      if (p.liq && p.liq > 0) {
        const ly = scY(p.liq);
        if (ly >= PAD_T - 2 && ly <= H - PAD_B + 2) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255,255,80,0.55)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(PAD_L, ly); ctx.lineTo(W - PAD_R - 2, ly); ctx.stroke();
          ctx.setLineDash([]);
          // Right-side Liq tag
          ctx.font = 'bold 9px Roboto Mono, monospace';
          ctx.fillStyle = 'rgba(200,180,0,0.82)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(W - PAD_R + 2, ly - 9, PAD_R - 4, 18, 3);
          else ctx.rect(W - PAD_R + 2, ly - 9, PAD_R - 4, 18);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.textAlign = 'left';
          ctx.fillText(fmtP(p.liq), W - PAD_R + 4, ly + 3.5);
          // Left mini label
          const liqLblW = ctx.measureText('Liq').width + 8;
          ctx.fillStyle = 'rgba(200,180,0,0.75)';
          ctx.fillRect(PAD_L, ly - 7, liqLblW, 14);
          ctx.fillStyle = '#000';
          ctx.fillText('Liq', PAD_L + 4, ly + 3);
          ctx.restore();
        }
      }
    });
    ctx.restore();
  }

  // ── Time axis labels ──
  const tRow = document.getElementById('chartTimeRow');
  if (tRow && visCandles.length >= 2) {
    const fmtT = ms => {
      const d = new Date(ms);
      return d.getFullYear() + '-'
        + String(d.getMonth()+1).padStart(2,'0') + '-'
        + String(d.getDate()).padStart(2,'0') + ' '
        + String(d.getHours()).padStart(2,'0') + ':'
        + String(d.getMinutes()).padStart(2,'0');
    };
    tRow.innerHTML =
      `<span class="ct-lbl">${fmtT(visCandles[0].t)}</span>` +
      `<span class="ct-lbl">${fmtT(visCandles[visCandles.length-1].t)}</span>`;
  }
  // Draw volume histogram in sync with candle chart
  drawVolume(all, vs, vis);
}

// ══════════════════════════════════════════════════════════════
//  VOLUME HISTOGRAM — Futures Chart (v10)
// ══════════════════════════════════════════════════════════════
function _fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function drawVolume(all, vs, vis) {
  const volCanvas = document.getElementById('futVolCanvas');
  if (!volCanvas) return;
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

  const PAD_R = 64, PAD_L = 2;
  const CW = W - PAD_R - PAD_L;
  const PAD_T = 3, PAD_B = 3;
  const CH = H - PAD_T - PAD_B;

  const realStart = Math.max(0, vs);
  const realEnd   = Math.min(all.length, vs + vis);
  const visCandles = all.slice(realStart, realEnd);
  if (!visCandles.length) return;

  // Max volume in visible range
  const vols = visCandles.map(c => c.v || 0);
  const maxVol = Math.max(...vols, 1);

  const slotW = CW / vis;
  const barW  = Math.max(1, slotW * 0.65);

  // Draw MA-vol line (simple 5-bar avg) as subtle reference
  const maVol5 = [];
  for (let ai = realStart; ai < realEnd; ai++) {
    const sl = all.slice(Math.max(0, ai - 4), ai + 1);
    maVol5.push(sl.reduce((s, c) => s + (c.v || 0), 0) / sl.length);
  }
  vc.beginPath();
  vc.strokeStyle = 'rgba(240,185,11,0.35)';
  vc.lineWidth = 1;
  maVol5.forEach((mv, i) => {
    const x = PAD_L + ((realStart - vs + i) + 0.5) * slotW;
    const y = PAD_T + (1 - mv / maxVol) * CH;
    i === 0 ? vc.moveTo(x, y) : vc.lineTo(x, y);
  });
  vc.stroke();

  // Draw bars
  for (let ai = realStart; ai < realEnd; ai++) {
    const c = all[ai];
    const vol = c.v || 0;
    const slotIdx = ai - vs;
    const cx = PAD_L + (slotIdx + 0.5) * slotW;
    const barH = Math.max(1, (vol / maxVol) * CH);
    const isUp = c.c >= c.o;
    vc.fillStyle = isUp ? 'rgba(14,203,129,0.55)' : 'rgba(246,70,93,0.55)';
    vc.fillRect(cx - barW / 2, PAD_T + CH - barH, barW, barH);
  }

  // Volume label (top-left)
  vc.font = '8px Roboto Mono, monospace';
  vc.fillStyle = 'rgba(132,142,156,0.6)';
  vc.textAlign = 'left';
  vc.fillText('VOL', PAD_L + 2, PAD_T + 9);

  // Max vol label (right side)
  vc.textAlign = 'right';
  vc.fillStyle = 'rgba(132,142,156,0.5)';
  vc.fillText(_fmtVol(maxVol), W - 2, PAD_T + 9);
}

let _chartRafPending = false;
function updateChart(price) {
  if (!S.candles.length) return;
  if (S._switchingCoin) return; // suppress stale-coin draws during coin switch
  const last = S.candles[S.candles.length-1];
  last.c = price;
  last.h = Math.max(last.h, price);
  last.l = Math.min(last.l, price);
  // Throttle: only schedule one redraw per animation frame
  if (_chartRafPending) return;
  _chartRafPending = true;
  requestAnimationFrame(() => {
    _chartRafPending = false;
    drawChart();
  });
}

// ═══════════════════════════════════════════════
//  CANDLE COUNTDOWN TIMERS
// ═══════════════════════════════════════════════
let _futCountdownTimer = null;
let _spCountdownTimer  = null;

function _tfToMs(tf) {
  return {'1s':1000,'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000}[tf] || 300000;
}

function _fmtCountdown(ms) {
  if (ms <= 0) return '00:00';
  const s = Math.ceil(ms / 1000);
  if (s < 60) {
    return '00:' + String(s).padStart(2,'0');
  }
  if (s < 3600) {
    const mm = Math.floor(s / 60), ss = s % 60;
    return String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  }
  // ≥ 1h: แสดง HH:MM:SS ครบ
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}

// Compute current bar close time from wall-clock — works continuously across bars
function _barCloseTime(candleMs) {
  const now = Date.now();
  const barOpen = Math.floor(now / candleMs) * candleMs;
  return barOpen + candleMs;
}

function _updateCountdownEl(el, candleMs) {
  if (!el || !candleMs) return;
  const closeTime = _barCloseTime(candleMs);
  const remaining = closeTime - Date.now();
  el.textContent = _fmtCountdown(Math.max(0, remaining));
  // Pulse when < 10s remaining
  if (remaining <= 10000 && remaining > 0) {
    el.classList.add('cd-pulse');
  } else {
    el.classList.remove('cd-pulse');
  }
}

function startFutCountdown() {
  if (_futCountdownTimer) clearInterval(_futCountdownTimer);
  const el = document.getElementById('futCandleCountdown');
  if (!el) return;
  function tick() {
    const candleMs = S._candleMs;
    if (!candleMs) { el.textContent = '--:--'; el.classList.remove('cd-pulse'); return; }
    _updateCountdownEl(el, candleMs);
  }
  tick();
  _futCountdownTimer = setInterval(tick, 1000);
}

function startSpCountdown() {
  if (_spCountdownTimer) clearInterval(_spCountdownTimer);
  const el = document.getElementById('spCandleCountdown');
  if (!el) return;
  function tick() {
    const candleMs = SP._candleMs;
    if (!candleMs) { el.textContent = '--:--'; el.classList.remove('cd-pulse'); return; }
    _updateCountdownEl(el, candleMs);
  }
  tick();
  _spCountdownTimer = setInterval(tick, 1000);
}
// ═══════════════════════════════════════════════
function updateTopBar() {
  const chgEl = document.getElementById('topChg');
  if (!chgEl || !S.markPrice) return;
  const base = S.candles.length ? S.candles[0].c : S.markPrice;
  const chg = base ? ((S.markPrice - base) / base * 100) : 0;
  const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
  const chgCls = 'tb-chg ' + (chg >= 0 ? 'up' : 'dn');
  chgEl.textContent = chgStr;
  chgEl.className = chgCls;
  // Mirror to collapsed header
  const collChg = document.getElementById('futCollapsedChg');
  if (collChg) { collChg.textContent = chgStr; collChg.className = chgCls; }
  // update cur price tag
  const tag = document.getElementById('cCurTag');
  if (tag) tag.textContent = fmtP(S.markPrice);
  // update ticker mark
  const tkMark = document.getElementById('tk-mark');
  if (tkMark) tkMark.textContent = fmtP(S.markPrice);
  // update max/cost
  updateMaxCost();
}

// ═══════════════════════════════════════════════
//  POSITIONS
// ═══════════════════════════════════════════════
// [FIX Bug2] helper: อัปเดต cntPos badge ให้สอดคล้องกับ filter ของ renderPositions
function _updatePosBadge() {
  const cnt = document.getElementById('cntPos');
  if (!cnt) return;
  const filtered = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId).length
    : S.positions.length;
  cnt.textContent = filtered;
}

function renderPositions() {
  const list = document.getElementById('posList');
  const cnt = document.getElementById('cntPos');
  if (!list) return;

  // ── กรองตาม selectedEarnContractId ก่อน (แสดงเฉพาะ positions ของสัญญาที่เลือกอยู่) ──
  let positions = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId)
    : S.positions;

  // ── ต่อด้วย Hide Other Pairs (ถ้าเปิด) ──
  if (S.hideOthers) {
    positions = positions.filter(p => p.symbol === S.symbol);
  }

  // Badge count แสดงจำนวน positions ของสัญญาที่เลือก (ไม่ใช่ทั้งหมด)
  if (cnt) cnt.textContent = (selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId).length
    : S.positions.length);

  if (S.tab !== 'pos' || !positions.length) {
    const contractLabel = selectedEarnContractId ? ' ในสัญญา ' + selectedEarnContractId : '';
    const hideLabel = S.hideOthers && positions.length === 0 && S.positions.length ? ' สำหรับ ' + S.symbol : '';
    list.innerHTML = `<div class="empty">
      <div class="empty-ico">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="1.5" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <div style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:var(--rbg);border:1.5px solid var(--r);display:flex;align-items:center;justify-content:center">
          <span style="color:var(--r);font-size:9px;font-weight:700">!</span>
        </div>
      </div>
      <span style="font-size:11px">${tccT('no_position_open')}${contractLabel}${hideLabel}</span>
    </div>`;
    return;
  }
  list.innerHTML = positions.map(p => buildPosCard(p)).join('');

  // [v8] Toast alert เมื่อ DD ใกล้ threshold (throttle 60s)
  // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ถ้าไม่มีข้อมูลจาก GAS ไม่แสดง toast
  if (selectedEarnContractId && typeof earnContracts !== 'undefined') {
    const _sC = earnContracts.find(x => x.contractId === selectedEarnContractId);
    if (_sC && typeof getRiskLevel === 'function') {
      const _ddVal = _gasDDStrict(_sC);
      if (_ddVal !== null) {
        const _r = getRiskLevel(_sC);
        const _d = _ddVal.toFixed(1);
        const _n = Date.now();
        const _wk = '_ddW_' + selectedEarnContractId;
        const _lt = window[_wk] || 0;
        if (_r >= 2 && _n - _lt > 60000) {
          window[_wk] = _n;
          showToast(tccTF('toast_dd_critical',{d:_d}));
        } else if (_r === 1 && _n - _lt > 180000) {
          window[_wk] = _n;
          showToast(tccTF('toast_dd_warning',{d:_d}));
        }
      }
    }
  }
}

function _mrColor(mr) {
  return mr > 50 ? 'var(--r)' : mr > 35 ? 'var(--y)' : 'var(--g)';
}
function buildPosCard(p) {
  const mr = Math.min(p.marginRatio, 100);
  const barCol = mr > 70 ? '#f6465d' : mr > 40 ? '#f0b90b' : '#0ecb81';
  return `<div class="pos-card" id="pc-${p.id}">
    <div class="pc-hdr">
      <div class="side-badge ${p.side==='long'?'l':'s'}">${p.side==='long'?'L':'S'}</div>
      <span class="pc-sym">${p.symbol}</span>
      <span class="pbadge">${p.type}</span>
      <span class="pbadge">${p.mode} ${p.lev}x</span>
      ${(()=>{
        if (!p.earnContractId) return '';
        // [v12 FIX 2] ใช้ drawdown_pct จาก getContractStatus (ผ่าน _contractDDMap) เท่านั้น
        // ไม่ fallback ไป calcDrawdown() local อีกต่อไป — ป้องกันค่า DD ไม่ตรงกับ GAS
        const _ddInfo = (window._contractDDMap && window._contractDDMap[p.earnContractId]) || null;
        if (!_ddInfo) return ''; // ยังไม่มีข้อมูลจาก getContractStatus — ไม่แสดง
        if (_ddInfo.isFrozen) {
          return '<span style="font-size:9px;font-weight:700;color:var(--r);background:rgba(246,70,93,0.12);padding:1px 6px;border-radius:3px;flex-shrink:0">🔒 FROZEN DD:'+(_ddInfo.drawdown_pct||'—')+'%</span>';
        }
        if (_ddInfo.isWarning) {
          return '<span style="font-size:9px;font-weight:700;color:var(--y);background:rgba(240,185,11,0.12);padding:1px 6px;border-radius:3px;flex-shrink:0">⚠️ DD:'+(_ddInfo.drawdown_pct||'—')+'%</span>';
        }
        // แสดง DD ปกติ (ไม่ warning/frozen) จาก server
        const _ddPct = parseFloat(_ddInfo.drawdown_pct);
        if (isNaN(_ddPct) || _ddPct <= 0) return '';
        const _col = _ddPct >= 35 ? 'var(--r)' : _ddPct >= 30 ? 'var(--y)' : 'var(--g)';
        const _bg  = _ddPct >= 35 ? 'rgba(246,70,93,0.12)' : _ddPct >= 30 ? 'rgba(240,185,11,0.12)' : 'rgba(14,203,129,0.10)';
        const _pfx = _ddPct >= 35 ? '🚨' : _ddPct >= 30 ? '⚠️' : '';
        return '<span style="font-size:9px;font-weight:700;color:'+_col+';background:'+_bg+';padding:1px 6px;border-radius:3px;flex-shrink:0">'+(_pfx?_pfx+' ':'')+'DD:'+_ddPct.toFixed(1)+'%</span>';
      })()}
      <div class="bar-ind"><span></span><span></span><span></span><span></span></div>
      <span class="pc-share" onclick="openShareCard('${p.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </span>
    </div>
    <div class="pnl-row">
      <div><div class="pnl-label">PNL (USDT)</div><div class="pnl-val ${p.pnl<0?'neg':'pos'}" id="pv-${p.id}">${sgn(p.pnl)}</div></div>
      <div class="roi-blk"><div class="pnl-label">ROI</div><div class="roi-val ${p.roi<0?'neg':'pos'}" id="rv-${p.id}">${sgnP(p.roi)}%</div></div>
    </div>
    <div class="dg">
      <div><div class="di-label">Size (${p.coin || S.coin})</div><div class="di-val">${fmtNum(p.size,3)}</div></div>
      <div><div class="di-label">Margin (USDT)</div><div class="di-val">${fmtNum(p.margin,2)} <span style="color:var(--t2);font-size:10px">(≈$${fmtNum(p.size*(p.mark||p.entry),2)})</span></div></div>
      <div style="text-align:right"><div class="di-label">Margin Ratio</div><div class="di-val" id="mr-${p.id}" style="color:${_mrColor(mr)};font-weight:700">${fmtNum(p.marginRatio,2)}%</div></div>
      <div><div class="di-label">Avg Entry</div><div class="di-val">${fmtP(p.entry)}</div></div>
      <div><div class="di-label">Mark Price</div><div class="di-val" id="mp-${p.id}">${fmtP(p.mark)}</div></div>
      <div style="text-align:right"><div class="di-label">Liq. Price <span style="font-size:9px;color:var(--t3)">(DD≥40%→Freeze)</span></div><div class="di-val hl">${fmtP(p.liq)}</div></div>
    </div>
    <div style="font-size:9px;color:var(--t3);margin:-4px 0 6px;line-height:1.4">
      ${tccT('liq_price_hint')}
    </div>
    <div class="mpb"><div class="mpbf" style="width:${mr}%;background:${barCol}"></div></div>
    <div class="realized-row col-mode" style="margin-bottom:9px">
      <div class="rr-top" onclick="showToast('Realized PNL History')">
        <span class="rl-label">Realized PNL (USDT)</span>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="rl-val ${(p.realized||0)<0?'neg':'pos'}">${sgn(p.realized||0)}</span>
          <span style="color:var(--t3)">›</span>
        </div>
      </div>
      ${(p.tp || p.sl) ? `<div style="display:flex;gap:6px;padding:5px 9px 7px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.15)">
        ${p.tp ? `<div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">
          <span style="font-size:9px;font-weight:700;color:var(--g);background:rgba(14,203,129,0.12);padding:1px 5px;border-radius:3px;flex-shrink:0">TP</span>
          <span style="font-size:11px;font-weight:600;color:var(--g);font-family:var(--mono)">${typeof fmtP==='function'?fmtP(p.tp):p.tp}</span>
        </div>` : '<div style="flex:1"></div>'}
        ${(p.tp && p.sl) ? '<div style="width:1px;background:rgba(255,255,255,0.08);align-self:stretch;margin:0 2px;flex-shrink:0"></div>' : ''}
        ${p.sl ? `<div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;justify-content:${p.tp?'flex-end':'flex-start'}">
          <span style="font-size:9px;font-weight:700;color:var(--r);background:rgba(246,70,93,0.12);padding:1px 5px;border-radius:3px;flex-shrink:0">SL</span>
          <span style="font-size:11px;font-weight:600;color:var(--r);font-family:var(--mono)">${typeof fmtP==='function'?fmtP(p.sl):p.sl}</span>
        </div>` : '<div style="flex:1"></div>'}
      </div>` : ''}
    </div>
    <div class="act-btns">
      <button class="act-btn" onclick="posAdjLeverage('${p.id}')">Leverage</button>
      <button class="act-btn" onclick="openTpslSheet('${p.id}')">TP/SL</button>
      <button class="act-btn cl" onclick="openCloseConfirm('${p.id}')">Close</button>
    </div>
  </div>`;
}

// ── Position card action helpers ──
// ── Margin helpers ──
function _getSelectedContract() {
  if (!selectedEarnContractId) return null;
  return earnContracts.find(c => c.contractId === selectedEarnContractId) || null;
}

// Refresh Avbl display + badge color based on margin usage
// Avbl = stakedAmount − totalUsedMargin +/− unrealizedPnL  (ไม่รวม realizedPnl)
function _refreshAvbl(c) {
  if (!c) return;

  // ── Frozen contract: แสดง 0.00 เสมอ — ห้ามเทรด ──
  if (c.status === 'frozen') {
    const avblEl = document.getElementById('avblVal');
    if (avblEl) avblEl.textContent = '0.00 USDT';
    const badgeEl = document.getElementById('earnMarginBadge');
    if (badgeEl) {
      badgeEl.className = 'earn-margin-badge danger';
      badgeEl.textContent = '🔒 Avbl: 0.00 (FROZEN)';
    }
    const budgetBar = document.getElementById('budgetWarnBar');
    if (budgetBar) budgetBar.style.display = 'none';
    return;
  }

  // ── Sync balance จาก positions จริงก่อนเสมอ ──
  syncContractBalance(c);

  const maxAllowed     = c.stakedAmount * 0.10;
  const cPos           = S.positions.filter(p => p.earnContractId === c.contractId);
  const marginUsed     = cPos.reduce((s, p) => s + p.margin, 0);
  const unrealizedPnl  = cPos.reduce((s, p) => s + (p.pnl || 0), 0);
  // [v13.9 FIX5] รวม pending margin ของ OpenOrders — ให้ capRemaining ตรงกับ logic ใน placeOrder()
  const pendingMargin  = (S.openOrders || [])
    .filter(o => o.earnContractId === c.contractId)
    .reduce((s, o) => s + (o.margin || 0), 0);
  // [FIX MARGIN-POOL] realized loss สะสม (ถ้าเป็นบวก/กำไร ไม่กระทบ quota) กิน static pool 10%
  // ถาวร — เดิมไม่ถูกหักตรงนี้เลย ทำให้ "วงเงินคงเหลือในสัญญา" เด้งกลับเต็มทุกครั้งที่ปิด position
  // ไม่ว่าจะขาดทุนสะสมไปเท่าไหร่ (ต้องดู realizedLoss รวมใน overusePct/capRemaining ด้วย)
  const realizedLoss   = Math.max(0, -(c.realizedPnl || 0));
  const capRemaining   = Math.max(0, maxAllowed - marginUsed - pendingMargin - realizedLoss);
  const usedForPct     = marginUsed + pendingMargin + realizedLoss;
  const overusePct     = maxAllowed > 0 ? (usedForPct / maxAllowed) * 100 : 0;

  // [FIX-SYNC-3] Avbl display: ใช้ avail_margin จาก GAS ถ้ามี (single source of truth)
  // GAS คำนวณ: avail_margin = marginCap − marginUsedTotal − realizedLoss (นับ pending orders รวมด้วย)
  // HTML เดิมคำนวณ: stakedAmount − marginUsed + unrealizedPnl — วัดคนละอย่างกัน
  // → ถ้า _contractDDMap มี avail_margin ให้ใช้ค่านั้นแทน ป้องกัน user เห็นยอดที่ GAS จะ reject
  const _ddCacheEntry = window._contractDDMap && window._contractDDMap[c.contractId];
  const _gasAvailMargin = (_ddCacheEntry && _ddCacheEntry.avail_margin !== undefined)
    ? parseFloat(_ddCacheEntry.avail_margin) : null;
  // fallback สูตรเดิม (ใช้เมื่อยังไม่มีข้อมูลจาก GAS)
  const avbl = (_gasAvailMargin !== null && !isNaN(_gasAvailMargin))
    ? _gasAvailMargin
    : (c.stakedAmount - marginUsed + unrealizedPnl);

  const avblEl = document.getElementById('avblVal');
  if (avblEl) avblEl.textContent = `${fmtNum(avbl,2)} USDT`;

  const badgeEl = document.getElementById('earnMarginBadge');
  if (badgeEl) {
    badgeEl.className = 'earn-margin-badge';
    if (overusePct > 110) {
      badgeEl.classList.add('danger');
      badgeEl.textContent = `⚠ Avbl: ${fmtNum(avbl,2)} (${tccT('principal_label')})`;
    } else if (overusePct > 100) {
      badgeEl.classList.add('warn');
      badgeEl.textContent = `! Avbl: ${fmtNum(avbl,2)} (>10%)`;
    } else {
      badgeEl.textContent = `Avbl: ${fmtNum(avbl,2)}`;
    }
  }

  // ── Budget warning bar ──
  const budgetBar = document.getElementById('budgetWarnBar');
  if (budgetBar) {
    if (overusePct >= 100) {
      const warnTxt = document.getElementById('budgetWarnTxt');
      if (warnTxt) {
        if (realizedLoss >= maxAllowed) {
          warnTxt.textContent =
            `⛔ วงเงินเทรด 10% เต็มแล้วจากขาดทุนสะสม (Realized Loss ${fmtNum(realizedLoss,2)} / ${fmtNum(maxAllowed,2)} USDT) — เปิดออเดอร์ใหม่ไม่ได้จนกว่าจะ Claim/Redeem สัญญา`;
        } else {
          const usedPct = (usedForPct / maxAllowed * 100).toFixed(1);
          warnTxt.textContent =
            `⛔ วงเงินเทรดเกินลิมิต 10% (ใช้ไป ${fmtNum(usedForPct,2)} / ${fmtNum(maxAllowed,2)} USDT = ${usedPct}%, รวมขาดทุนสะสม ${fmtNum(realizedLoss,2)} USDT)`;
        }
      }
      budgetBar.classList.add('show');
    } else {
      budgetBar.classList.remove('show');
    }
  }

  // ── Remaining budget bar + switch-coin hint ──
  const remBar     = document.getElementById('remainingBudgetBar');
  const remTxt     = document.getElementById('remainingBudgetTxt');
  const switchHint = document.getElementById('switchCoinHint');
  if (remBar && remTxt) {
    if (capRemaining > 0 && overusePct < 100) {
      remBar.style.display = 'flex';
      remTxt.textContent = realizedLoss > 0
        ? `${tccT('budget_remaining')}: ${fmtNum(capRemaining,2)} USDT (${tccT('budget_remaining_loss').replace('—',fmtNum(realizedLoss,2))})`
        : `${tccT('budget_remaining')}: ${fmtNum(capRemaining,2)} USDT`;
      if (switchHint) switchHint.style.display = marginUsed > 0 ? 'inline' : 'none';
    } else {
      remBar.style.display = 'none';
      if (switchHint) switchHint.style.display = 'none';
    }
  }

  // ── Dropdown text — [v48 FIX B] อัปเดตเฉพาะสัญญาที่ selected อยู่ ป้องกัน override หลังสลับ ──
  if (c.contractId === selectedEarnContractId) {
    const txtEl  = document.getElementById('earnSelText');
    // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → '—' (ไม่มี local formula fallback)
    const dd_pct = _gasDDPctStr(c);
    if (txtEl) txtEl.textContent =
      `${c.planDays}D · ${c.contractId} · Bal:${fmtNum((c.status === 'frozen' ? (c.frozenBalance ?? c.currentBalance) : c.currentBalance),0)} · DD:${dd_pct}${dd_pct === '—' ? '' : '%'}`;
  }
}

function posClose(id, isAutoLiq = false) {
  const p = S.positions.find(x => x.id == id);
  if (!p) return;
  // [FIX Bug3] ใช้ราคาของ coin ของ position นั้นๆ เท่านั้น
  // fallback chain: coinPrices[coin] → p.mark (ราคาล่าสุดที่ sync มา) → p.entry
  // ไม่ใช้ S.markPrice เป็น fallback เด็ดขาด เพราะเป็นราคาของ S.coin ที่กำลังดูกราฟอยู่
  const coinPrice = parseFloat(S.coinPrices[p.coin]);
  const exitPrice = coinPrice > 0 ? coinPrice
                  : (p.mark  > 0 ? p.mark : p.entry);
  const priceDiff  = p.side === 'long' ? exitPrice - p.entry : p.entry - exitPrice;
  const realizedPnl = priceDiff * p.size;

  const c = earnContracts.find(x => x.contractId === p.earnContractId);

  // ลบ position ออกก่อน
  S.positions = S.positions.filter(x => x.id != id);

  if (c) {
    // สะสม realizedPnl (กฎ 2: realized loss ≥ 10% → บล็อกเปิดใหม่)
    c.realizedPnl = (c.realizedPnl || 0) + realizedPnl;
    // [FIX Bug#6] กัน GAS sync รอบถัดไปทับค่า realizedPnl/currentBalance นี้ด้วยค่าเก่า
    // ก่อนที่ write การปิด position นี้จะ commit เสร็จจริงบน GAS (latency ~3-5s)
    window._pendingEarnSync[c.contractId] = Date.now() + 12000;
    // sync balance จาก positions ที่เหลือ
    syncContractBalance(c);
    _refreshAvbl(c);
    // กฎ 3: drawdown ≥ 40% → freeze
    // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ไม่มีข้อมูล → ไม่ trigger liquidate
    const _ddPC = _gasDDStrict(c);
    if (!isAutoLiq && _ddPC !== null && _ddPC >= 40) {
      _autoLiquidate(c);
      return;
    }
  }

  if (!isAutoLiq) {
    // ── HIST: log full close from posClose ──
    if (typeof HIST !== 'undefined') HIST.logClose(p, p.size, exitPrice, realizedPnl, true);
    showToast(tccTF('toast_close_position_full',{side:p.side.toUpperCase(),size:p.size.toFixed(3),coin:p.coin,pnl:sgn(realizedPnl)}));
  }
  renderPositions();
  renderOpenOrders();                                                          // [FIX Bug#2] sync UI orders หลัง TP/SL/posClose
  if (typeof syncOpenOrdersToGAS === 'function') syncOpenOrdersToGAS();       // [FIX Bug#2] sync GAS
  // [v4 FIX DOUBLE-WRITE] ตัด syncEarnContractsToGAS ออกจาก close path
  // HIST.logClose → updateEarnContract (single path) เป็นเส้นทางเดียวสำหรับ realized_pnl
  // syncEarnContractsToGAS จะ overwrite realized_pnl ซ้ำ → ยอดบวม 2x
  // [FIX Bug1.1] Full re-render EarnContracts แทน inline patch เพื่ออัพเดท
  // Realized PnL, Total Balance, canClaim button ทุก element พร้อมกัน
  if (typeof renderEarnContracts === 'function') renderEarnContracts();
  _updatePosBadge();
  if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
}

// Auto Liquidation: ปิดทุก Position ในสัญญา + Freeze
function _autoLiquidate(c) {
  // Guard: ถ้า frozen อยู่แล้วไม่ต้องทำซ้ำ
  if (!c || c.status === 'frozen') return;
  // [v9 FIX] Contract Lock รวมศูนย์ — กัน Auto-Liquidate ผิดพลาดระหว่าง Refresh/Sync
  // ครอบคลุมทุกจุดที่เรียก _autoLiquidate() (posClose, limit fill, placeOrder, tickDailyYield)
  // โดยไม่ต้องเติม guard แยกที่ทุก call site
  if (_isSyncLocked()) {
    console.warn('[_autoLiquidate] blocked — sync/refresh lock active for', c.contractId);
    return;
  }

  // ปิดทุก position + สะสม realizedPnl
  // [v48 FIX D] ใช้ราคาของ coin นั้นๆ ไม่ใช่ S.markPrice ซึ่งอาจเป็นราคาเหรียญอื่น
  const cPositions = S.positions.filter(p => p.earnContractId === c.contractId);
  cPositions.forEach(p => {
    // [FIX Bug3] ราคาของ coin นั้นๆ เท่านั้น ไม่ fallback ไป S.markPrice
    const coinPrice  = parseFloat(S.coinPrices[p.coin]);
    const exitPrice  = coinPrice > 0 ? coinPrice : (p.mark > 0 ? p.mark : p.entry);
    const priceDiff   = p.side === 'long' ? exitPrice - p.entry : p.entry - exitPrice;
    c.realizedPnl = (c.realizedPnl || 0) + (priceDiff * p.size);
  });
  S.positions = S.positions.filter(p => p.earnContractId !== c.contractId);

  // sync balance ก่อน freeze (ไม่มี position เหลือ → balance = stakedAmount + realizedPnl)
  // snapshot ไว้ใน frozenBalance เพื่อแสดงค่าที่ถูกต้องหลัง freeze
  syncContractBalance(c);
  c.frozenBalance = c.currentBalance;
  c.status = 'frozen';
  // [v9 FIX] กัน loadOfflineState() merge สถานะเก่าจาก GAS (ยังไม่ทัน sync) ทับ status='frozen' นี้
  window._pendingFreeze[c.contractId] = Date.now() + 30000; // 30s ให้เวลา GAS write+poll รอบถัดไปตามทัน
  // [v16 FIX] อัปเดต window._contractDDMap (SSOT ที่ _gasDD()/_gasDDStrict() อ่าน) ให้ isFrozen:true ทันที
  // กัน UI ช่วงสั้นๆ ที่ c.status เป็น 'frozen' แล้วแต่ _contractDDMap ยังเป็นค่าเก่าก่อน GAS sync รอบหน้า
  window._contractDDMap = window._contractDDMap || {};
  window._contractDDMap[c.contractId] = Object.assign(
    {}, window._contractDDMap[c.contractId], { isFrozen: true }
  );

  // บันทึก reason ที่ถูกต้อง
  const realizedNegTrigger = (c.realizedPnl || 0) < -(c.stakedAmount * 0.10);
  const reason = realizedNegTrigger ? 'Realized PnL ติดลบเกิน 10%' : 'Drawdown ≥ 40%';
  if (typeof recordTx === 'function') recordTx(c.contractId, 'liquidate', 0, 'Auto-Liquidate: ' + reason);

  // [FIX #1] บันทึก Earn Liquidate เข้า GAS → หัก loss + คืน remaining ใน Users sheet
  // คำนวณ loss = stakedAmount - frozenBalance (เงินที่สูญ)
  // remaining = frozenBalance (เงินที่เหลือคืน ≥ 0)
  const _liqLoss      = Math.max(0, (c.stakedAmount || 0) - (c.frozenBalance || 0));
  const _liqRemaining = Math.max(0, c.frozenBalance || 0);
  // [v8] hook → saveEarnLiquidate (GAS logEarnLiquidate) — เรียกทั้ง 2 เส้นทาง
  if (typeof saveEarnLiquidate === 'function') {
    saveEarnLiquidate({ contractId: c.contractId, loss: _liqLoss, remaining: _liqRemaining });
  } else if (typeof window._onEarnLiquidate === 'function') {
    window._onEarnLiquidate(c.contractId, _liqLoss, _liqRemaining);
  }

  _refreshAvbl(c);
  updateRiskWarnings(c);
  renderPositions();
  const posCount = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId).length
    : S.positions.length;
  document.getElementById('cntPos').textContent = posCount;
  showToast(tccTF('toast_auto_liq',{cid:c.contractId,reason}));
  renderEarnContracts();
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
  // [v4 FIX DOUBLE-WRITE] sync เฉพาะ status=frozen ผ่าน updateEarnContract (ไม่ส่ง realized_pnl)
  // ห้ามใช้ syncEarnContractsToGAS ที่นี่ — จะส่ง realizedPnl บวมทับ GAS
  if (typeof dbWrite === 'function') {
    dbWrite('updateEarnContract', {
      contract_id:    c.contractId,
      status:         'frozen',
      frozen_balance: c.frozenBalance || 0,
      // [v2.20 FIX-N2b] ตัด current_balance ออก — GAS เป็น Source of Truth
    });
  }
}

function posAdjLeverage(id) {
  const p = S.positions.find(x => x.id == id);
  if (!p) return;
  const steps = [10,25,50,75,100,125,150];
  const ci = steps.indexOf(p.lev);
  p.lev = steps[(ci + 1) % steps.length];
  showToast('Leverage → ' + p.lev + 'x');
  renderPositions();
}

function posEditTPSL(id) {
  // [FIX Bug7] ใช้ openTpslSheet() (sheet UI) แทน prompt() แบบ native browser
  // ซึ่งอาจถูกบล็อกบน iOS/Android และ UX ไม่สอดคล้องกับ design
  if (typeof openTpslSheet === 'function') {
    openTpslSheet(id);
  } else {
    // fallback กรณี openTpslSheet ยังไม่ถูก define (เช่น โหลดช้า)
    const p = S.positions.find(x => x.id == id);
    if (!p) return;
    const tpVal = prompt('Take Profit Price (0 = ยกเลิก)', p.tp || '');
    const slVal = prompt('Stop Loss Price (0 = ยกเลิก)', p.sl || '');
    p.tp = parseFloat(tpVal) || null;
    p.sl = parseFloat(slVal) || null;
    showToast(tccT('tpsl_updated') + (p.tp ? ' TP:'+p.tp : '') + (p.sl ? ' SL:'+p.sl : ''));
    renderPositions();
  }
}

// ── Close Position Confirm Sheet ──
let _closeConfirmPosId = null;

function openCloseConfirm(id) {
  const p = S.positions.find(x => x.id == id);
  if (!p) return;
  _closeConfirmPosId = id;

  // [v4 FIX] ใช้ราคาของ coin ของ position ไม่ใช่ S.markPrice (ซึ่งเป็นราคาเหรียญที่กำลังดูกราฟอยู่)
  const coinPrice = parseFloat(S.coinPrices[p.coin]);
  const mp = coinPrice > 0 ? coinPrice : (p.mark > 0 ? p.mark : p.entry);
  const priceDiff = p.side === 'long' ? mp - p.entry : p.entry - mp;
  const estPnl = priceDiff * p.size;
  const pnlSign = estPnl >= 0 ? '+' : '';
  const pnlColor = estPnl >= 0 ? 'var(--g)' : 'var(--r)';

  document.getElementById('ccs-sym').textContent   = p.symbol;
  const sideEl = document.getElementById('ccs-side');
  sideEl.textContent  = p.side === 'long' ? 'Long ▲' : 'Short ▼';
  sideEl.style.color  = p.side === 'long' ? 'var(--g)' : 'var(--r)';
  document.getElementById('ccs-size').textContent  = p.size.toFixed(3) + ' ' + (p.coin || '');
  document.getElementById('ccs-entry').textContent = fmtP(p.entry);
  document.getElementById('ccs-mark').textContent  = fmtP(mp);
  const pnlEl = document.getElementById('ccs-pnl');
  pnlEl.textContent   = pnlSign + fmtM(estPnl) + ' USDT';
  pnlEl.style.color   = pnlColor;

  document.getElementById('closeConfirmSheet').classList.add('open');
}

function cancelClosePos() {
  document.getElementById('closeConfirmSheet').classList.remove('open');
  _closeConfirmPosId = null;
}

function confirmClosePos() {
  if (_closeConfirmPosId == null) return;
  const id = _closeConfirmPosId;
  cancelClosePos();
  posClose(id);
}
// ── [v9] TP/SL Grace Period Helper ─────────────────────────────────────
// ป้องกัน TP/SL trigger ทันทีหลังเปิด position หรือหลัง set TP/SL ใหม่
// (รอให้ S.coinPrices stabilize ก่อน) — ยืดเป็น 25 วินาที
const TPSL_GRACE_MS = 25000; // 25 วินาที
function isTpslReady(p) {
  return !p._tpslSetAt || (Date.now() - p._tpslSetAt) > TPSL_GRACE_MS;
}

function updatePositionsPNL() {
  if (!S.positions.length) return;
  // [v49 FIX] ไม่ block ถ้า S.markPrice=0 เพราะแต่ละ position ใช้ S.coinPrices[p.coin] อยู่แล้ว
  const hasPrices = Object.keys(S.coinPrices || {}).length > 0 || S.markPrice > 0;
  if (!hasPrices) return;
  const affectedContracts = new Set();

  S.positions.forEach(p => {
    // [v48 FIX A] ใช้ราคาของ coin นั้นๆ จาก S.coinPrices แทน S.markPrice ซึ่งเป็นราคาเหรียญปัจจุบันเท่านั้น
    // S.coinPrices เก็บ {BTC: price, ETH: price, ...} อัปเดตทุก 10 วิจาก fetchAllMids
    const mp = parseFloat(S.coinPrices[p.coin]) || p.mark || p.entry;
    if (!mp) return; // ยังไม่มีราคา → ข้ามไปก่อน

    // [v6 FIX] ถ้า entry = 0 (load จาก GAS แต่ entry_price ไม่ถูก save / ไม่มีใน response)
    // → ใช้ mark price ปัจจุบันเป็น entry fallback เพื่อไม่ให้ PNL overflow
    // และ recalculate margin ด้วย leverage จริง
    if (!p.entry || p.entry <= 0) {
      p.entry = mp;
      if (!p.margin || p.margin <= 0) {
        const lv = p.lev || 150;
        p.margin = (mp * p.size) / lv;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // [v13 FIX] LIQ PRICE — Single Source of Truth จาก GAS เท่านั้น
    // ════════════════════════════════════════════════════════════════════════
    // local cross-margin formula (เดิม [v11 FIX]) ถูกลบออกทั้งหมดแล้วตาม Refactor Summary
    // p.liq มาจาก window._liqPriceMap (ที่ GAS ส่งผ่าน getContractStatus) เท่านั้น
    // ถ้ายังไม่มีข้อมูล → p.liq = 0 (ไม่คำนวณ local fallback อีกต่อไป)
    // ════════════════════════════════════════════════════════════════════════
    if (p.size > 0 && p.margin > 0) {
      // [v10 FIX] Single Source of Truth: ดึง liq_price จาก liq_price_map ที่ backend ส่งมา
      // (set ไว้ใน window._liqPriceMap ตอน loadOfflineState รับ getOpenPositions response)
      // ถ้า map มีค่า → ใช้เลย ไม่คำนวณเอง
      // [v13 FIX] ลบ cross-margin formula fallback ทั้งหมดแล้ว — ถ้า GAS ยังไม่ส่ง liq_price_map
      // มาให้ position นี้ → p.liq = 0 (รอข้อมูลจาก GAS) แทนที่จะคำนวณ local ที่อาจผิดพลาด
      const _liqMap = window._liqPriceMap;
      if (_liqMap && _liqMap[p.id] != null) {
        p.liq = parseFloat(_liqMap[p.id]) || 0;
        if (p.side === 'long' && p.liq < 0) p.liq = 0;
      } else {
        p.liq = 0; // ยังไม่มีข้อมูลจาก GAS — ห้าม fallback ไป local cross-margin formula
      }
    }
    // ════════════════════════════════════════════════════════════════════════
    // END LIQ PRICE BLOCK — ห้ามแก้ไขโดยไม่เข้าใจกฎ 3 ข้อข้างบน
    // ════════════════════════════════════════════════════════════════════════
    // priceDiff ต่อ 1 หน่วย coin
    const priceDiff = p.side === 'long' ? mp - p.entry : p.entry - mp;
    // PNL = priceDiff * size (USDT)
    p.pnl = priceDiff * p.size;
    // ROI คิดเทียบกับ margin ที่ใช้จริง
    p.roi = p.margin > 0 ? (p.pnl / p.margin) * 100 : 0;
    p.mark = mp;
    // [v8.9 FIX Bug3] marginRatio ใช้สูตรเดียวกับ Liq.Price (DD≥40%):
    // = unrealized loss รวม (ทุก position Active/Partially Closed ในสัญญาเดียวกัน) / staked_amount * 100
    // cap ที่ 100% เหมือนเดิม
    {
      const _c = earnContracts.find(x => x.contractId === p.earnContractId);
      if (_c && _c.stakedAmount > 0) {
        // รวม unrealized loss ทุก position ในสัญญาเดียวกัน (เฉพาะตัวที่ loss เท่านั้น)
        const _contractPositions = S.positions.filter(
          pp => pp.earnContractId === p.earnContractId && (pp.status === 'Active' || pp.status === 'Partially Closed' || !pp.status)
        );
        const _totalContractLoss = _contractPositions.reduce((sum, pp) => {
          // ใช้ pnl ที่คำนวณแล้วสำหรับ position นี้ หรือ property pnl สำหรับ position อื่นในสัญญา
          const ppPnl = (pp.id === p.id) ? p.pnl : (pp.pnl || 0);
          return ppPnl < 0 ? sum + Math.abs(ppPnl) : sum;
        }, 0);
        p.marginRatio = Math.min(100, (_totalContractLoss / _c.stakedAmount) * 100);
      } else {
        // fallback: ถ้าไม่มีสัญญาหรือ stakedAmount=0 ใช้ per-position loss / margin
        p.marginRatio = p.margin > 0 ? Math.min(100, Math.abs(Math.min(0, p.pnl)) / p.margin * 100) : 0;
      }
    }

    if (p.earnContractId) affectedContracts.add(p.earnContractId);

    // [v10 FIX] TP/SL trigger ทุก coin (ไม่จำกัดแค่ S.symbol ที่กำลังดูอยู่)
    // ใช้ mp ที่ดึงจาก S.coinPrices[p.coin] ซึ่งอัปเดตทุก 10 วิ
    // [v4 FIX Bug1] เพิ่ม grace period เป็น 10 วิ (จาก 3 วิ)
    // เหตุผล: WS อัปเดตทุก tick เร็วมาก 3 วิไม่พอ โดยเฉพาะหลัง refresh ที่ coinPrices ยังไม่ stable
    const _tpslReady = isTpslReady(p);
    if (_tpslReady && p.tp && ((p.side === 'long' && mp >= p.tp) || (p.side === 'short' && mp <= p.tp))) {
      showToast(tccTF('toast_tp_triggered',{coin:p.coin,price:fmtP(mp)}));
      posClose(p.id); return;
    }
    if (_tpslReady && p.sl && ((p.side === 'long' && mp <= p.sl) || (p.side === 'short' && mp >= p.sl))) {
      showToast(tccTF('toast_sl_triggered',{coin:p.coin,price:fmtP(mp)}));
      posClose(p.id); return;
    }

    // [v50 FIX A] Trailing Stop — ทำงานกับทุก position (ทุก coin) ไม่ใช่แค่เหรียญที่กำลังดูอยู่
    if (p.trailingActive && p.trailingCb > 0) {
      const cbFrac = p.trailingCb / 100;
      if (p.side === 'long') {
        // อัปเดต peak price สูงสุด
        if (!p.trailingPeak || mp > p.trailingPeak) p.trailingPeak = mp;
        // ราคา stop = peak * (1 - callback%)
        const trailStop = p.trailingPeak * (1 - cbFrac);
        if (mp <= trailStop) {
          showToast('📉 Trailing Stop! ' + p.coin + ' @ ' + fmtP(mp) + ' (peak: ' + fmtP(p.trailingPeak) + ')');
          posClose(p.id); return;
        }
      } else {
        // Short: อัปเดต trough price ต่ำสุด
        if (!p.trailingPeak || mp < p.trailingPeak) p.trailingPeak = mp;
        const trailStop = p.trailingPeak * (1 + cbFrac);
        if (mp >= trailStop) {
          showToast('📈 Trailing Stop! ' + p.coin + ' @ ' + fmtP(mp) + ' (trough: ' + fmtP(p.trailingPeak) + ')');
          posClose(p.id); return;
        }
      }
    }

    // Inline DOM update (no full re-render needed)
    const pv = document.getElementById('pv-' + p.id);
    const rv = document.getElementById('rv-' + p.id);
    const mpEl = document.getElementById('mp-' + p.id);
    const mrEl = document.getElementById('mr-' + p.id);
    if (pv) { pv.textContent = sgn(p.pnl); pv.className = 'pnl-val ' + (p.pnl < 0 ? 'neg' : 'pos'); }
    if (rv) { rv.textContent = sgnP(p.roi) + '%'; rv.className = 'roi-val ' + (p.roi < 0 ? 'neg' : 'pos'); }
    if (mpEl) mpEl.textContent = fmtP(mp);
    if (mrEl) { mrEl.textContent = p.marginRatio.toFixed(2) + '%'; mrEl.style.color = _mrColor(Math.min(p.marginRatio, 100)); }
  });

  // ── Throttled chart redraw เพื่ออัปเดต PNL tag บน canvas (max 2fps) ──
  if (typeof drawChart === 'function' && typeof CHART_PANELS !== 'undefined' && CHART_PANELS.fut.open) {
    if (!updatePositionsPNL._rafPending) {
      updatePositionsPNL._rafPending = true;
      requestAnimationFrame(() => {
        updatePositionsPNL._rafPending = false;
        drawChart();
      });
    }
  }

  // Refresh Avbl + check กฎ 3: Drawdown ≥ 40% → Auto Liquidate
  // [v48 FIX A] อัปเดต Avbl เฉพาะ selectedEarnContractId เพื่อไม่ให้ทับ display ตอนสลับสัญญา
  affectedContracts.forEach(cid => {
    const c = earnContracts.find(x => x.contractId === cid);
    if (!c || c.status === 'frozen') return;
    syncContractBalance(c);
    // [FIX FREEZE-ON-REFRESH][v9 FIX] ห้าม _autoLiquidate ระหว่าง Sync Lock หลัง restore
    // (coinPrices ยังไม่ stable → pnl=0 → currentBalance ต่ำผิดปกติ → false-freeze)
    const _inGrace = _isSyncLocked();
    // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ไม่มีข้อมูล → ไม่ trigger liquidate
    const _ddUP = _gasDDStrict(c);
    if (_ddUP !== null && _ddUP >= 40) {
      if (!_inGrace) _autoLiquidate(c);
    } else if (cid === selectedEarnContractId) {
      // อัปเดต Avbl/badge เฉพาะสัญญาที่ selected อยู่ ป้องกัน override display หลังสลับสัญญา
      _refreshAvbl(c);
    }
    // [FIX-A] อัปเดต Unrealized PnL ใน EarnCard inline (ไม่ต้อง re-render ทั้ง card)
    // buildEarnCard สร้าง id="ec-upnl-{contractId}" ไว้แล้ว → อัปเดตตาม price tick ได้โดยตรง
    const _upnlEl = document.getElementById('ec-upnl-' + cid);
    if (_upnlEl) {
      const _liveU = S.positions
        .filter(p => p.earnContractId === cid)
        .reduce((s, p) => s + (p.pnl || 0), 0);
      _upnlEl.textContent = (_liveU >= 0 ? '+' : '') + fmtM(_liveU);
      _upnlEl.style.color = _liveU >= 0 ? 'var(--g)' : 'var(--r)';
    }
  });

  // ── [v49 MERGED] อัปเดต Assets Futures tab ถ้ากำลังแสดงอยู่ ──
  if (typeof astCurrentTab !== 'undefined' && astCurrentTab === 'futures-a') {
    const totalUnrealized = S.positions.reduce((s, p) => s + (p.pnl || 0), 0);
    const totalMarginUsed = S.positions.reduce((s, p) => s + (p.margin || 0), 0);
    // [v50 FIX] Margin Balance = walletBal + marginUsed (รวม margin ที่ใช้เปิดออเดอร์)
    const walletBal = earnContracts.reduce((s, c) => s + (c.currentBalance || 0), 0);
    const marginBal = walletBal + totalMarginUsed;
    const fmt2 = v => v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtSign = v => (v >= 0 ? '+' : '') + fmt2(v);

    if (typeof _setTxt === 'function') {
      _setTxt('aft-margin-bal', fmt2(marginBal));
      _setTxt('aft-margin-usd', '≈ $' + fmt2(marginBal));
      _setTxt('aft-wallet-bal', fmt2(walletBal));
      _setTxt('aft-wallet-usd', '≈ $' + fmt2(walletBal));
    }

    const upnlEl    = document.getElementById('aft-unrealized-pnl');
    const upnlUsdEl = document.getElementById('aft-unrealized-usd');
    if (upnlEl) {
      upnlEl.textContent = fmtSign(totalUnrealized);
      upnlEl.style.color = totalUnrealized >= 0 ? 'var(--g)' : 'var(--r)';
    }
    if (upnlUsdEl) {
      upnlUsdEl.textContent = '≈ $' + fmtSign(totalUnrealized);
      upnlUsdEl.style.color = totalUnrealized >= 0 ? 'var(--g)' : 'var(--r)';
    }

    // อัปเดต inline DOM ของแต่ละ position card ใน AFT tab
    S.positions.forEach(p => {
      const pvEl = document.getElementById('aft-pv-' + p.id);
      const rvEl = document.getElementById('aft-rv-' + p.id);
      const mpEl = document.getElementById('aft-mp-' + p.id);
      const mrEl = document.getElementById('aft-mr-' + p.id);
      const pnlPos = (p.pnl || 0) >= 0;
      if (pvEl) {
        pvEl.textContent = (p.pnl >= 0 ? '+' : '') + fmt2(p.pnl || 0);
        pvEl.className = 'aft-pos-pnl-val ' + (pnlPos ? 'pos' : 'neg');
      }
      if (rvEl) {
        rvEl.textContent = (p.roi >= 0 ? '+' : '') + (p.roi || 0).toFixed(2) + '%';
        rvEl.className = 'aft-pos-pnl-roi ' + (pnlPos ? 'pos' : 'neg');
      }
      if (mpEl) mpEl.textContent = typeof fmtP === 'function' ? fmtP(p.mark || 0) : (p.mark || 0);
      if (mrEl) {
        mrEl.textContent = (p.marginRatio || 0).toFixed(2) + '%';
        mrEl.className = 'aft-pg-val' + ((p.marginRatio || 0) > 50 ? ' warn' : '');
      }
    });
  }
}

// ═══════════════════════════════════════════════
//  UI CONTROLS
// ═══════════════════════════════════════════════
function setOC(v) {
  S.oc = v;
  document.getElementById('ocOpen').className = 'oc-btn' + (v==='open'?' active':'');
  document.getElementById('ocClose').className = 'oc-btn' + (v==='close'?' active':'');
  _updateTradeBtnLabels();
}

function _updateTradeBtnLabels() {
  const isClose = S.oc === 'close';
  const ll = document.getElementById('tradeBtnLongLabel');
  const ls = document.getElementById('tradeBtnLongSub');
  const sl = document.getElementById('tradeBtnShortLabel');
  const ss = document.getElementById('tradeBtnShortSub');
  const btnLong  = document.getElementById('tradeBtnLong');
  const btnShort = document.getElementById('tradeBtnShort');

  // [v2.34 FIX-Q] ตรวจสอบว่า contract ที่เลือกอยู่เป็น Fixed mode หรือไม่
  const _selC = (typeof earnContracts !== 'undefined' && selectedEarnContractId)
    ? earnContracts.find(x => x.contractId === selectedEarnContractId)
    : null;
  const _isContractFixed = _selC ? !!_selC.isFixed : false;

  if (_isContractFixed) {
    // Fixed mode: เปลี่ยนปุ่มทั้งสองให้แสดงสถานะ Fixed
    if (ll) ll.textContent = '🔒 Fixed';
    if (ls) ls.textContent = 'APT Only';
    if (sl) sl.textContent = '🔒 Fixed';
    if (ss) ss.textContent = 'APT Only';
    // ปรับ opacity ให้ดูเป็น disabled โดยไม่ต้องแก้ onclick (guard อยู่ใน _placeOrderCore แล้ว)
    if (btnLong)  { btnLong.style.opacity  = '0.45'; btnLong.style.cursor  = 'not-allowed'; }
    if (btnShort) { btnShort.style.opacity = '0.45'; btnShort.style.cursor = 'not-allowed'; }
  } else {
    if (ll) ll.textContent = isClose ? 'Close Short' : 'Open Long';
    if (ls) ls.textContent = isClose ? 'Buy' : 'Buy';
    if (sl) sl.textContent = isClose ? 'Close Long' : 'Open Short';
    if (ss) ss.textContent = isClose ? 'Sell' : 'Sell';
    // คืนค่า style ปกติ
    if (btnLong)  { btnLong.style.opacity  = ''; btnLong.style.cursor  = ''; }
    if (btnShort) { btnShort.style.opacity = ''; btnShort.style.cursor = ''; }
  }
}

const levCycle = [10,25,50,75,100,125,150];
const levCycleGold = [500,800,1000,1200,1500,1800,2000];
let levIdx = 6;

// ── helper: sync goldLevNote visibility ทุกครั้งที่ coin เปลี่ยน ──
function _syncGoldLevNote() {
  const el = document.getElementById('goldLevNote');
  if (el) el.style.display = _isGoldCoin(S.coin) ? 'block' : 'none';
}

function _isGoldCoin(coin) {
  // Hyperliquid Gold Future ใช้ coin name "GOLD" (perp: GOLD-USDC)
  return coin === 'GOLD' || coin === '@XAU' || coin === 'XAU' || coin === 'XAUUSDT';
}

// ── HIP-3 Metal coins (dex: 'xyz') ──
const METAL_COINS = ['GOLD','SILVER','PLATINUM','PALLADIUM','COPPER'];
const METAL_DEX   = 'xyz';

function _isMetalCoin(coin) {
  return METAL_COINS.includes(coin);
}

// ── ชื่อ coin สำหรับ WS subscription: HIP-3 metal dex ต้องใช้ 'xyz:GOLD' (มี dex prefix) ──
function _wsCoinName(coin) {
  return _isMetalCoin(coin) ? (METAL_DEX + ':' + coin) : coin;
}
// ── ตัด dex prefix ออกจาก coin ที่ได้รับจาก WS feed (เช่น 'xyz:GOLD' -> 'GOLD') ──
function _normWsCoin(coin) {
  return (coin && coin.includes(':')) ? coin.split(':').pop() : coin;
}

function _dexParam(coin) {
  return _isMetalCoin(coin) ? { dex: METAL_DEX } : {};
}

function _getActiveLevCycle() {
  return _isGoldCoin(S.coin) ? levCycleGold : levCycle;
}

// ── [Gold High-Lev] ตรวจสิทธิ์ leverage > 1000x สำหรับ Gold Future ──
// เงื่อนไข: ปลดล็อค >1000x ได้เฉพาะตอนที่สัญญาที่ "กำลังเลือก/ใช้งานอยู่"
// (selectedEarnContractId) ผ่านเกณฑ์เท่านั้น — planDays >= 30 AND
// (currentBalance >= 1000 OR stakedAmount >= 1000) และต้อง status === 'active'
// ถ้าไม่ได้เลือกสัญญาไว้ หรือสัญญาที่เลือกไม่ผ่านเกณฑ์ → lock ที่ 1000x
// แม้สัญญาอื่นในระบบจะผ่านเกณฑ์ก็ตาม (ไม่ปลดล็อคทั้งระบบอีกต่อไป)
function _checkGoldHighLevPerm() {
  if (typeof earnContracts === 'undefined' || !earnContracts.length) return false;
  if (typeof selectedEarnContractId === 'undefined' || !selectedEarnContractId) return false;
  const c = earnContracts.find(x => x.contractId === selectedEarnContractId);
  if (!c) return false;
  return c.status === 'active' &&
    (c.planDays || 0) >= 30 &&
    ((c.currentBalance || 0) >= 1000 || (c.stakedAmount || 0) >= 1000);
}
// async version — retry 700ms เมื่อ earnContracts ยังว่าง (race condition guard)
async function _checkGoldHighLevPermAsync() {
  if (typeof earnContracts !== 'undefined' && earnContracts.length) {
    return _checkGoldHighLevPerm();
  }
  // รอ earnContracts โหลด (loadOfflineState ใช้เวลา ~5 วิ)
  await new Promise(r => setTimeout(r, 700));
  return _checkGoldHighLevPerm();
}

// แสดง modal แจ้งเงื่อนไข Gold High-Leverage
function _showGoldHighLevModal(lev) {
  // สร้าง overlay modal
  const id = '_goldLevModal';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);padding:20px;box-sizing:border-box`;
    el.innerHTML = `
      <div style="background:var(--bg2);border-radius:16px;padding:24px 22px;max-width:340px;width:100%;border:1px solid var(--y);text-align:center">
        <div style="font-size:28px;margin-bottom:10px">🥇</div>
        <div style="font-size:15px;font-weight:700;color:var(--y);margin-bottom:8px">Gold Future · Leverage ${lev}x</div>
        <div style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:18px">
          การใช้ Leverage <b style="color:var(--t1)">&gt; 1,000x</b> สำหรับ Gold Future<br>
          ต้องมีคุณสมบัติดังนี้<br><br>
          <span style="color:var(--y)">📋 สัญญาเทรด ≥ 30 วัน</span><br>
          <span style="color:var(--y)">💰 ยอดสัญญา ≥ $1,000 USDT</span>
        </div>
        <button onclick="document.getElementById('${id}').remove()" style="background:linear-gradient(90deg,#b8860b,#f0b90b);color:#000;font-weight:700;border:none;border-radius:10px;padding:11px 28px;font-size:14px;cursor:pointer;width:100%"><span data-i18n="acknowledge">${tccT('acknowledge')}</span></button>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  } else {
    el.style.display = 'flex';
    el.querySelector('[style*="font-size:15px"]').textContent = 'Gold Future · Leverage ' + lev + 'x';
  }
}

async function cycleLev() {
  const cycle = _getActiveLevCycle();
  const isGold = _isGoldCoin(S.coin);
  // leverage ที่ต้องการสิทธิ์พิเศษ (Gold > 1000x)
  const GOLD_RESTRICTED = [1200, 1500, 1800, 2000];
  // ใช้ async version เพื่อ handle race condition (earnContracts ยังว่าง)
  const hasPerm = isGold ? (await _checkGoldHighLevPermAsync()) : true;

  // วนหา index ถัดไปที่ผ่านเงื่อนไข โดยข้าม restricted lev ถ้าไม่มีสิทธิ์
  let nextIdx = (levIdx + 1) % cycle.length;
  let shownModal = false;
  for (let tries = 0; tries < cycle.length; tries++) {
    const candidateLev = cycle[nextIdx];
    if (isGold && GOLD_RESTRICTED.includes(candidateLev) && !hasPerm) {
      // แสดง modal ครั้งเดียว แล้ว ข้าม lev นี้ ไปหาตัวถัดไป
      if (!shownModal) { _showGoldHighLevModal(candidateLev); shownModal = true; }
      nextIdx = (nextIdx + 1) % cycle.length;
      continue;
    }
    // ผ่านเงื่อนไข → set leverage
    levIdx = nextIdx;
    S.lev = candidateLev;
    document.getElementById('levBtn').textContent = S.lev + 'x';
    if (!shownModal) showToast('Leverage: ' + S.lev + 'x');
    return;
  }
}

function toggleSide() {
  S.side = S.side === 'S' ? 'L' : 'S';
  const btn = document.getElementById('sideBtn');
  btn.textContent = S.side;
  btn.style.color = S.side === 'L' ? 'var(--g)' : 'var(--r)';
}

const orderTypes = ['Limit','Market','Stop Limit','Stop Market'];
let otIdx = 0;
function cycleOrderType() {
  otIdx = (otIdx + 1) % orderTypes.length;
  S.orderType = orderTypes[otIdx];
  document.getElementById('orderTypeLabel').textContent = S.orderType;
  const lpr = document.getElementById('limitPriceRow');
  if (lpr) lpr.style.display = S.orderType === 'Market' ? 'none' : '';
}

// ══════════════════════════════════════════════════════════════
//  BBO STATE
// ══════════════════════════════════════════════════════════════
const BBO = {
  active: true,       // BBO button เปิดอยู่ (default = on ตามมาตรฐาน Binance)
  mode:   'Counterparty 1'  // mode ที่เลือก
};

// ── _getBBOPrice: คืนราคา BBO ตาม mode และ side ──
// Counterparty = เข้าฝั่งตรงข้าม (Long→Ask, Short→Bid) — fill ทันที
// Queue        = เข้าฝั่งเดียวกัน (Long→Bid, Short→Ask) — รอคิว
function _getBBOPrice(side) {
  const n = BBO.mode.includes('5') ? 4 : 0; // index 0=best, 4=5th level
  if (BBO.mode.startsWith('Counterparty')) {
    // Long: ซื้อที่ ask (ราคาขายดีที่สุด), Short: ขายที่ bid (ราคาซื้อดีที่สุด)
    if (side === 'long')  return S.asks.length > n ? S.asks[n].p : S.markPrice;
    else                  return S.bids.length > n ? S.bids[n].p : S.markPrice;
  } else {
    // Queue mode: เข้าคิวฝั่งเดียวกัน
    // Long: เสนอซื้อที่ bid, Short: เสนอขายที่ ask
    if (side === 'long')  return S.bids.length > n ? S.bids[n].p : S.markPrice;
    else                  return S.asks.length > n ? S.asks[n].p : S.markPrice;
  }
}

// ── toggleBBOActive: กด BBO button on/off ──
function toggleBBOActive() {
  BBO.active = !BBO.active;
  const btn = document.getElementById('bboBtn');
  const priceInp = document.getElementById('limitPriceInp');
  if (btn) {
    if (BBO.active) {
      btn.classList.add('active');
      // ล้างช่อง price เพื่อให้ระบบใช้ BBO อัตโนมัติ
      if (priceInp) { priceInp.value = ''; priceInp.placeholder = 'BBO - ' + BBO.mode; }
    } else {
      btn.classList.remove('active');
      if (priceInp) priceInp.placeholder = 'Price (USDT)';
    }
  }
  updateMaxCost();
}

// ── toggleBBODropdown: toggle dropdown ──
function toggleBBODropdown() {
  const dd = document.getElementById('bboDropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? '' : 'none';
}

// ── selectBBOMode: เลือก mode จาก dropdown ──
function selectBBOMode(mode) {
  BBO.mode = mode;
  BBO.active = true;
  // อัปเดต label
  const label = document.getElementById('cpSelectLabel');
  if (label) label.textContent = mode;
  // อัปเดต checkmarks
  const modeMap = { 'Counterparty 1':'cp1','Counterparty 5':'cp5','Queue 1':'q1','Queue 5':'q5' };
  Object.values(modeMap).forEach(id => {
    const el = document.getElementById('bboCheck_' + id);
    if (el) el.style.display = 'none';
  });
  const activeId = modeMap[mode];
  if (activeId) {
    const el = document.getElementById('bboCheck_' + activeId);
    if (el) el.style.display = '';
  }
  // highlight BBO button
  const btn = document.getElementById('bboBtn');
  if (btn) btn.classList.add('active');
  // อัปเดต placeholder ช่อง Price
  const priceInp = document.getElementById('limitPriceInp');
  if (priceInp) { priceInp.value = ''; priceInp.placeholder = 'BBO - ' + mode; }
  // ปิด dropdown
  const dd = document.getElementById('bboDropdown');
  if (dd) dd.style.display = 'none';
  updateMaxCost();
}

// ── setBBO (legacy compat): กดปุ่ม BBO เติมราคาในช่อง — ยังใช้ได้ ──
function setBBO() {
  toggleBBOActive();
}

// ── ปิด BBO dropdown เมื่อคลิกนอก ──
document.addEventListener('click', function(e) {
  const dd  = document.getElementById('bboDropdown');
  const row = document.getElementById('cpSelectBtn');
  if (dd && dd.style.display !== 'none' && row && !row.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none';
  }
});

// ── เมื่อผู้ใช้พิมพ์ในช่อง Price ให้ปิด BBO อัตโนมัติ ──
(function _patchPriceInput() {
  document.addEventListener('DOMContentLoaded', function() {
    const inp = document.getElementById('limitPriceInp');
    if (!inp) return;
    inp.addEventListener('input', function() {
      if (inp.value && BBO.active) {
        BBO.active = false;
        const btn = document.getElementById('bboBtn');
        if (btn) btn.classList.remove('active');
        inp.placeholder = 'Price (USDT)';
      }
    });
  });
})();

function adjAmt(dir) {
  const inp = document.getElementById('amtInp');
  const v = parseFloat(inp.value) || 0;
  const step = S.coin === 'BTC' ? 0.001 : S.coin === 'ETH' ? 0.01 : S.coin === 'SOL' ? 0.1 : 0.01;
  inp.value = Math.max(0, v + dir * step).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1);
}

function adjPrice(dir) {
  const inp = document.getElementById('limitPriceInp');
  const v = parseFloat(inp.value) || (S.markPrice || 0);
  const step = S.coin === 'BTC' ? 0.5 : 0.1;
  inp.value = Math.max(0, v + dir * step).toFixed(1);
}

let amtUnit = 'BTC';
function toggleAmtUnit() {
  amtUnit = amtUnit === 'BTC' ? 'USDT' : 'BTC';
  document.getElementById('amtUnit').textContent = amtUnit;
}

function onSlider(el) {
  const v = parseInt(el.value);
  el.style.setProperty('--pct', v + '%');
  const price = parseFloat(document.getElementById('limitPriceInp')?.value) || S.markPrice;
  if (price > 0) {
    let maxMarginAvbl = 0;
    if (selectedEarnContractId) {
      const c = earnContracts.find(x => x.contractId === selectedEarnContractId);
      if (c) {
        // Slider คิดจาก remaining cap (10% stakedAmount - usedMargin)
        const maxAllowed = c.stakedAmount * 0.10;
        const totalUsed = S.positions.filter(p => p.earnContractId === c.contractId)
                                     .reduce((s, p) => s + p.margin, 0);
        maxMarginAvbl = Math.max(0, maxAllowed - totalUsed);
      }
    }
    const marginToUse = (v / 100) * maxMarginAvbl;
    const notional = marginToUse * S.lev;
    const btcAmt = notional / price;
    document.getElementById('amtInp').value = btcAmt > 0 ? btcAmt.toFixed(3) : '';
    updateMaxCost();
  }
}

function setSlider(v) {
  const sl = document.getElementById('pctSlider');
  sl.value = v;
  sl.style.setProperty('--pct', v + '%');
  onSlider(sl);
}

function toggleTPSL() {
  S.tpslOn = !S.tpslOn;
  const el = document.getElementById('tpslCheck');
  const panel = document.getElementById('tpslPanel');
  if (el) el.classList.toggle('on', S.tpslOn);
  if (panel) panel.style.display = S.tpslOn ? 'flex' : 'none';
}

function closeAllPositions() {
  // ปิดเฉพาะ positions ของสัญญาที่เลือกอยู่
  const targetPositions = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId)
    : S.positions;

  if (!targetPositions.length) { showToast(tccT('toast_no_position_short')); return; }
  const count = targetPositions.length;
  let totalPnl = 0;
  const affectedContracts = new Set();

  targetPositions.forEach(p => {
    // [v50 FIX D] ใช้ราคาของ coin นั้นๆ ไม่ใช่ S.markPrice ซึ่งอาจเป็นราคาเหรียญอื่น
    const mp = parseFloat(S.coinPrices[p.coin]) || p.mark || p.entry;
    const diff = p.side === 'long' ? mp - p.entry : p.entry - mp;
    const realizedPnl = diff * p.size;
    totalPnl += realizedPnl;
    const c = earnContracts.find(x => x.contractId === p.earnContractId);
    if (c) {
      c.realizedPnl = (c.realizedPnl || 0) + realizedPnl;
      affectedContracts.add(c.contractId);
    }
    // ── HIST: log close ──
    if (typeof HIST !== 'undefined') HIST.logClose(p, p.size, mp, realizedPnl, true);
  });

  // ลบเฉพาะ positions ที่ปิด
  const closedIds = new Set(targetPositions.map(p => p.id));
  S.positions = S.positions.filter(p => !closedIds.has(p.id));

  affectedContracts.forEach(cid => {
    const c = earnContracts.find(x => x.contractId === cid);
    if (c) { syncContractBalance(c); _refreshAvbl(c); }
  });

  renderPositions();
  const posCount = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId).length
    : S.positions.length;
  document.getElementById('cntPos').textContent = posCount;
  showToast(tccTF('toast_close_all',{count,pnl:sgn(totalPnl)}));
  // [FIX-D] อัปเดต EarnCard inline ทันทีหลังปิดทุก position
  affectedContracts.forEach(cid => {
    const _c = earnContracts.find(x => x.contractId === cid);
    if (!_c) return;
    // Realized PnL
    const _rpEl = document.getElementById('ec-rpnl-' + cid);
    if (_rpEl) {
      const _rpnl = _c.realizedPnl || 0;
      _rpEl.textContent = (_rpnl >= 0 ? '+' : '') + fmtM(_rpnl);
      _rpEl.style.color = _rpnl >= 0 ? 'var(--g)' : 'var(--r)';
    }
    // Unrealized PnL (= 0 หลังปิดหมด)
    const _upEl = document.getElementById('ec-upnl-' + cid);
    if (_upEl) {
      const _liveU = S.positions.filter(p => p.earnContractId === cid).reduce((s, p) => s + (p.pnl || 0), 0);
      _upEl.textContent = (_liveU >= 0 ? '+' : '') + fmtM(_liveU);
      _upEl.style.color = _liveU >= 0 ? 'var(--g)' : 'var(--r)';
    }
  });
  // [v4 FIX DOUBLE-WRITE] ตัด syncEarnContractsToGAS ออก — HIST.logClose เรียก updateEarnContract ต่อ position แล้ว
  // syncEarnContractsToGAS จะส่ง realizedPnl ที่บวมสะสมใน local state ทับ GAS ซ้ำ
  // [FIX-3] Re-fetch EarnContracts จาก GAS หลังปิดทุก position
  // เพื่อให้ EarnContracts card แสดง Realized PnL ที่ถูกต้องจาก GAS Source of Truth
  setTimeout(() => {
    if (typeof dbCallRaw === 'function' && typeof _mergeDashEarnContracts === 'function' && typeof USER_PROFILE !== 'undefined') {
      dbCallRaw('getEarnContracts', { uid: USER_PROFILE.uid })
        .then(ecResult => {
          if (!ecResult) return;
          const ecList = Array.isArray(ecResult) ? ecResult
                       : (ecResult && Array.isArray(ecResult.contracts) ? ecResult.contracts : []);
          if (ecList.length) {
            _mergeDashEarnContracts(ecList);
            if (typeof renderEarnContracts === 'function') renderEarnContracts();
          }
        })
        .catch(() => {});
    }
  }, 1500);
  if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
}

function toggleHide() {
  S.hideOthers = !S.hideOthers;
  const el = document.getElementById('hideChk');
  if (el) el.classList.toggle('on', S.hideOthers);
  if (S.tab === 'ord') renderOpenOrders();
  else renderPositions();
}

function switchTab(t) {
  S.tab = t;
  ['pos','ord','bot'].forEach(id => {
    const el = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1));
    if (el) el.classList.toggle('active', id === t);
  });
  // show/hide panels
  const posListEl = document.getElementById('posList');
  const ordListEl = document.getElementById('ordList');
  if (posListEl) posListEl.style.display = (t === 'pos') ? '' : 'none';
  if (ordListEl) ordListEl.style.display = (t === 'ord') ? '' : 'none';
  if (t === 'ord') renderOpenOrders();
  else renderPositions();
}

// toggleChart is now handled by unified initChartPanels → _chartPanelToggle('fut')
// kept as thin wrapper so S.chartVisible stays in sync
function toggleChart() {
  S.chartVisible = CHART_PANELS.fut.open; // will flip inside
  _chartPanelToggle('fut');
  S.chartVisible = CHART_PANELS.fut.open;
}

function setTF(el, tf) {
  document.querySelectorAll('.tf-label').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  S.tf = tf;
  // Force candleMs update immediately so countdown shows correct TF while loading
  S._candleMs = _candleMs(_candleInterval(tf));
  if (typeof CHART_PANELS !== 'undefined') { CHART_PANELS.fut.viewStart = null; CHART_PANELS.fut.visCount = 80; CHART_PANELS.fut.yOffset = 0; }
  startFutCountdown(); // restart immediately with new TF
  fetchCandles(tf);    // fetchCandles will NOT restart again (tfChanged=false after this)
}

function toggleCoinDD() {
  const dd = document.getElementById('coinDD');
  const isOpen = dd.classList.toggle('open');
  if (isOpen) {
    setTimeout(() => { const s = document.getElementById('coinDDSearch'); if (s) { s.focus(); s.value = ''; filterCoinDD(''); } }, 50);
  }
}

// Load full perps list from Hyperliquid
async function loadPerpList() {
  try {
    // ── ดึง main universe + metal dex (xyz) + allMids พร้อมกัน ──
    const [meta, metalMeta, mids, metalMids] = await Promise.all([
      hlPost({ type: 'metaAndAssetCtxs' }),
      hlPost({ type: 'metaAndAssetCtxs', dex: METAL_DEX }).catch(() => null),
      hlPost({ type: 'allMids' }),
      hlPost({ type: 'allMids', dex: METAL_DEX }).catch(() => null)
    ]);

    if (!meta || !meta[0]) return;

    // ── Main universe (crypto) ──
    const universe = meta[0].universe || [];
    const ctxs     = meta[1] || [];
    const mainPerps = universe.map((m, i) => {
      const coin = m.name;
      const price = parseFloat(mids[coin]) || 0;
      const ctx = ctxs[i] || {};
      const prevDay = parseFloat(ctx.prevDayPx) || 0;
      const chg = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
      return { coin, sym: coin + 'USDT', price, chg, isMetal: false };
    }).filter(r => r.price > 0);

    // ── Metal universe (HIP-3 dex xyz) ──
    let metalPerps = [];
    if (metalMeta && metalMeta[0]) {
      const mUniverse = metalMeta[0].universe || [];
      const mCtxs     = metalMeta[1] || [];
      const mMids      = metalMids || {};
      metalPerps = mUniverse.map((m, i) => {
        // Hyperliquid HIP-3 dex อาจตั้งชื่อ asset เป็น 'xyz:GOLD' (มี dex prefix)
        // ต้องตัด prefix ออกให้เหลือ 'GOLD' เพื่อให้ตรงกับ _isGoldCoin/_isMetalCoin/METAL_LABELS/METAL_ICONS
        const rawName = m.name;
        const coin  = rawName.includes(':') ? rawName.split(':').pop() : rawName;
        const price = parseFloat(mMids[rawName] ?? mMids[coin]) || 0;
        const ctx   = mCtxs[i] || {};
        const prevDay = parseFloat(ctx.prevDayPx) || 0;
        const chg   = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
        return { coin, sym: coin + 'USDT', price, chg, isMetal: true };
      }).filter(r => r.price > 0 || _isMetalCoin(r.coin));
      console.log('[Metal DEX] coins:', metalPerps.map(p => p.coin + '=' + p.price));
    } else {
      console.warn('[Metal DEX] ดึงข้อมูลไม่ได้ — แสดงเฉพาะ crypto');
    }

    // ── Merge: metal ก่อน (pin ด้านบน), ตามด้วย crypto ──
    const existingCoins = new Set(metalPerps.map(p => p.coin));
    const cryptoOnly = mainPerps.filter(p => !existingCoins.has(p.coin));
    S.allPerps = [...metalPerps, ...cryptoOnly];

    // Build coinMap dynamically
    S.allPerps.forEach(p => { S.coinMap[p.sym] = p.coin; });

    renderCoinDD(S.allPerps);
  } catch(e) { console.warn('loadPerpList error', e); }
}

const PINNED_COINS   = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const METAL_ICONS    = { GOLD:'Au', SILVER:'Ag', PLATINUM:'Pt', PALLADIUM:'Pd', COPPER:'Cu' };
const METAL_LABELS   = { GOLD:'GOLDUSDT', SILVER:'SILVERUSDT', PLATINUM:'PLATINUMUSDT', PALLADIUM:'PALLADIUMUSDT', COPPER:'COPPERUSDT' };
// สีธาตุโลหะ (ใช้ใน icon badge)
const METAL_COLORS   = { GOLD:'#c9960c,#f0d060', SILVER:'#8a9bb0,#c8d8e8', PLATINUM:'#6a9ab0,#a0c8d8', PALLADIUM:'#7a8090,#b0b8c8', COPPER:'#b06040,#d89060' };

function renderCoinDD(perps) {
  const list = document.getElementById('coinDDList');
  if (!list) return;
  if (!perps.length) { list.innerHTML = `<div style="padding:10px 12px;font-size:11px;color:var(--t2)"><span data-i18n="no_result">${tccT('no_result')}</span></div>`; return; }

  const makeCoinRow = (p) => {
    const chgColor  = p.chg >= 0 ? 'var(--g)' : 'var(--r)';
    const chgSign   = p.chg >= 0 ? '+' : '';
    const isMetal   = _isMetalCoin(p.coin);
    const isGold    = _isGoldCoin(p.coin);
    const iconSym   = METAL_ICONS[p.coin] || '';
    const iconColor = METAL_COLORS ? METAL_COLORS[p.coin] : null;
    const METAL_ATOMIC = { GOLD:'79', SILVER:'47', PLATINUM:'78', PALLADIUM:'46', COPPER:'29' };
    const METAL_ATOMIC_NAMES = { GOLD:'Aurum', SILVER:'Argentum', PLATINUM:'Platinum', PALLADIUM:'Palladium', COPPER:'Cuprum' };
    const atomicNum = METAL_ATOMIC[p.coin] || '';
    const atomicName = METAL_ATOMIC_NAMES[p.coin] || '';
    const [c1, c2] = (iconColor||'#7a6010,#c9960c').split(',');
    const iconBadge = isMetal && iconSym
      ? `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,${c1},${c2});color:#fff;font-family:'Roboto Mono',monospace;padding:1px 3px;border-radius:3px;min-width:19px;line-height:1;border:1px solid rgba(255,255,255,.3);box-shadow:0 1px 3px rgba(0,0,0,.4);position:relative"><span style="font-size:4.5px;opacity:.75;align-self:flex-end;margin-bottom:1px">${atomicNum}</span><span style="font-size:8px;font-weight:900;letter-spacing:-.5px">${iconSym}</span><span style="font-size:3.5px;opacity:.7;letter-spacing:.3px;margin-top:1px;text-transform:uppercase">${atomicName.slice(0,6)}</span></span>`
      : '';
    const displaySym = isMetal ? (iconBadge + ' ' + (METAL_LABELS[p.coin] || p.coin)) : p.sym;
    const metalBadge = isMetal
      ? `<span style="background:linear-gradient(90deg,#7a6010,#c9960c);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px">Metal</span>`
      : '';
    const goldBadge = isGold
      ? `<span style="background:linear-gradient(90deg,#b8860b,#f0b90b);color:#000;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:3px">Lev ×2000</span>`
      : '';
    const safeId    = p.coin.replace('@','');
    const rowStyle  = isMetal ? 'background:rgba(240,185,11,.05);border-left:2px solid rgba(240,185,11,.4);' : '';
    return `<div class="cd-item" onclick="selectCoin('${p.sym}')" style="${rowStyle}">
      <span style="display:flex;align-items:center;gap:4px">${displaySym}${metalBadge}${goldBadge}</span>
      <span style="display:flex;gap:8px;align-items:center">
        <span style="color:${chgColor};font-size:10px">${chgSign}${p.chg.toFixed(2)}%</span>
        <span class="cd-price" id="dd-${safeId}">${p.price > 0 ? p.price.toLocaleString('en',{maximumFractionDigits:2}) : '—'}</span>
      </span>
    </div>`;
  };

  // Search result — แสดงตรงๆ
  const isSearch = perps !== S.allPerps;
  if (isSearch) {
    list.innerHTML = perps.slice(0, 100).map(makeCoinRow).join('');
    return;
  }

  // Default view: แบ่ง 2 กลุ่ม — เหรียญหลัก | โลหะมีค่า
  const metalRows  = perps.filter(p => _isMetalCoin(p.coin) && !_isGoldCoin(p.coin));
  // เรียงโลหะตาม METAL_COINS order
  metalRows.sort((a, b) => METAL_COINS.indexOf(a.coin) - METAL_COINS.indexOf(b.coin));

  const pinnedRows = perps.filter(p => PINNED_COINS.includes(p.coin) && !_isMetalCoin(p.coin));
  pinnedRows.sort((a, b) => PINNED_COINS.indexOf(a.coin) - PINNED_COINS.indexOf(b.coin));
  // เพิ่ม GOLD เข้า pinnedRows ท้ายสุด (ตำแหน่งที่ 6 = แสดงในกลุ่มเหรียญหลัก)
  const goldPinned = perps.filter(p => _isGoldCoin(p.coin));

  let html = '';

  if (pinnedRows.length) {
    html += `<div style="padding:4px 12px 2px;font-size:10px;color:var(--t3);letter-spacing:.5px">เหรียญหลัก</div>`;
    html += pinnedRows.map(makeCoinRow).join('');
    html += `<div style="border-top:1px solid var(--border);margin:4px 0"></div>`;
  }

  if (metalRows.length) {
    html += `<div style="padding:6px 12px 2px;font-size:10px;color:var(--y);letter-spacing:.5px;font-weight:600">🏅 โลหะมีค่า (HIP-3)</div>`;
    // แสดง GOLD ก่อนในกลุ่มโลหะมีค่า
    if (goldPinned.length) html += goldPinned.map(makeCoinRow).join('');
    html += metalRows.map(makeCoinRow).join('');
  }

  list.innerHTML = html;
}

function filterCoinDD(query) {
  const q = query.trim().toUpperCase();
  if (!q) { renderCoinDD(S.allPerps); return; }
  // Metal aliases: รองรับค้นหา XAU→GOLD, XAG→SILVER, XPT→PLATINUM, XPD→PALLADIUM
  const METAL_ALIASES = {
    'XAU':'GOLD','GOLDFUTURE':'GOLD','@XAU':'GOLD',
    'XAG':'SILVER','SILVERFUTURE':'SILVER',
    'XPT':'PLATINUM','PLATINUMFUTURE':'PLATINUM',
    'XPD':'PALLADIUM','PALLADIUMFUTURE':'PALLADIUM',
    'CU':'COPPER','COPPERFUTURE':'COPPER',
  };
  // แปลง alias → ชื่อ coin จริง
  const aliasTarget = Object.entries(METAL_ALIASES).find(([alias]) => alias.startsWith(q) || q.startsWith(alias));
  const targetCoin  = aliasTarget ? aliasTarget[1] : null;

  const filtered = S.allPerps.filter(p => {
    if (targetCoin && p.coin === targetCoin) return true;
    if (_isMetalCoin(p.coin) && (METAL_LABELS[p.coin]||'').toUpperCase().includes(q)) return true;
    return p.coin.toUpperCase().includes(q) || p.sym.toUpperCase().includes(q);
  });
  renderCoinDD(filtered);
}

// ── Gold Leverage Manager (แยกออกมาเพื่อความสะอาด) ──
const GoldLevManager = {
  restricted: [1200, 1500, 1800, 2000],

  isHighLev(lev) {
    return this.restricted.includes(lev);
  },

  hasPermission() {
    return typeof _checkGoldHighLevPerm === 'function' ? _checkGoldHighLevPerm() : false;
  },

  async hasPermissionAsync() {
    return typeof _checkGoldHighLevPermAsync === 'function' ?
           await _checkGoldHighLevPermAsync() : false;
  }
};

// ── Finalize Leverage หลังตรวจสอบสิทธิ์ (hasPerm คำนวณล่วงหน้าด้วย async ก่อนเรียกฟังก์ชันนี้) ──
function finalizeLeverage(coin, requestedLev, hasPerm) {
  const cycle = _getActiveLevCycle();

  if (!_isGoldCoin(coin)) {
    return cycle.includes(requestedLev) ? requestedLev : cycle[cycle.length-1];
  }

  // เป็น Gold
  if (!GoldLevManager.isHighLev(requestedLev)) {
    return requestedLev; // 1000x หรือต่ำกว่า = ใช้ได้
  }

  if (hasPerm) {
    return requestedLev; // มีสิทธิ์ → ใช้ lev ที่ต้องการ
  }

  // ไม่มีสิทธิ์ → ใช้ค่ามาตรฐาน เริ่มต้นที่ 500x (ค่าแรกของ levCycleGold)
  return cycle[0];
}

let _selectCoinToken = 0; // guard against stale responses when switching coins fast

async function selectCoin(sym) {
  const token = ++_selectCoinToken;
  S.symbol = sym;
  S.coin = S.coinMap[sym] || sym.replace('USDT','');
  // บันทึก coin ล่าสุดเพื่อ restore หลัง reload
  try { localStorage.setItem('tcc_lastCoin', sym); } catch(e) {}
  // ── Pretty display name สำหรับโลหะ (แสดง "Au Gold" แทน "GOLDUSDT") ──
  const _metalSym = _isMetalCoin(S.coin) ? (METAL_ICONS[S.coin] || '') : '';
  const _metalLabel = _isMetalCoin(S.coin) ? (METAL_LABELS[S.coin] || sym) : null;
  const _dispSym = _metalLabel ? (_metalSym + ' ' + _metalLabel) : sym;
  const _topSymEl = document.getElementById('topSym');
  if (_topSymEl) _topSymEl.textContent = _dispSym;
  document.querySelectorAll('#chartHdrTitle').forEach(el => el.textContent = _dispSym + ' Perp Chart');
  const collTitle = document.getElementById('chartHdrTitleCollapsed');
  if (collTitle) collTitle.textContent = _dispSym;
  // update order book header
  const obUnit = document.getElementById('obAmtUnit');
  if (obUnit) obUnit.textContent = '(' + S.coin + ')';
  // update amount unit
  const _amtUnitEl = document.getElementById('amtUnit');
  if (_amtUnitEl) _amtUnitEl.textContent = S.coin;

  // ── [Gold] Reset leverage ให้ตรงกับ coin ที่เลือก (Permission Check → Final State → Render) ──
  {
    const cycle = _getActiveLevCycle();
    // ใช้ lev เดิมถ้ายังอยู่ใน cycle ใหม่ ไม่งั้นใช้ค่า default (สูงสุดของ cycle)
    const targetLev = (cycle.indexOf(S.lev) !== -1) ? S.lev : cycle[cycle.length - 1];

    // ตรวจสิทธิ์ก่อนเสมอ (async, รองรับ race condition ตอน earnContracts ยังโหลดไม่เสร็จ)
    // ไม่ force ค่าใดๆ ก่อนตรวจสิทธิ์เสร็จ
    const hasPerm = (_isGoldCoin(S.coin) && GoldLevManager.isHighLev(targetLev))
      ? await GoldLevManager.hasPermissionAsync()
      : true;

    const finalLev = finalizeLeverage(S.coin, targetLev, hasPerm);
    S.lev = finalLev;
    levIdx = cycle.indexOf(finalLev);
    if (levIdx === -1) levIdx = cycle.length - 1;

    const levBtnEl = document.getElementById('levBtn');
    if (levBtnEl) levBtnEl.textContent = S.lev + 'x';
    // ── แสดง/ซ่อน Gold Leverage Condition Note ──
    const goldLevNote = document.getElementById('goldLevNote');
    if (goldLevNote) goldLevNote.style.display = _isGoldCoin(S.coin) ? 'block' : 'none';
    _syncGoldLevNote();
  }

  // ── Reset inputs และ Max Open/Cost เมื่อสลับเหรียญ ──
  const amtInp = document.getElementById('amtInp');
  const limitPriceInp = document.getElementById('limitPriceInp');
  if (amtInp) amtInp.value = '';
  if (limitPriceInp) limitPriceInp.value = '';
  const pctSlider = document.getElementById('pctSlider');
  if (pctSlider) { pctSlider.value = 0; pctSlider.style.setProperty('--pct', '0%'); }
  // Clear Max Open / Cost display
  ['maxOpen','maxOpenS'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0.000 ' + S.coin; });
  ['costVal','costValS'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0.00 USDT'; });

  // Clear search box
  const ddSearch = document.getElementById('coinDDSearch');
  if (ddSearch) ddSearch.value = '';
  const _coinDDEl = document.getElementById('coinDD');
  if (_coinDDEl) _coinDDEl.classList.remove('open');
  S.markPrice = 0; S.asks = []; S.bids = [];
  S._switchingCoin = true;
  if (typeof CHART_PANELS !== 'undefined') { CHART_PANELS.fut.viewStart = null; CHART_PANELS.fut.visCount = 80; CHART_PANELS.fut.yOffset = 0; }
  renderOrderBook2();
  setApiStatus(false, 'กำลังโหลดข้อมูล ' + _dispSym + '...');
  showChartLoading(true);
  // reconnect WS
  if (ws && ws.readyState === 1) {
    if (S._prevCoin && S._prevCoin !== S.coin) {
      ws.send(JSON.stringify({ method:'unsubscribe', subscription:{ type:'l2Book', coin: _wsCoinName(S._prevCoin) } }));
      ws.send(JSON.stringify({ method:'unsubscribe', subscription:{ type:'trades', coin: _wsCoinName(S._prevCoin) } }));
    }
    ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'l2Book', coin: _wsCoinName(S.coin) } }));
    ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'trades', coin: _wsCoinName(S.coin) } }));
    setApiStatus(true, 'WebSocket เชื่อมต่อ ' + sym + ' สำเร็จ');
  }
  S._prevCoin = S.coin;
  await fetchCandles(S.tf);
  S._switchingCoin = false;
  if (token !== _selectCoinToken) return;
  await fetchFunding();
  await fetchOrderBook();
  await fetch24h();
  renderCoinDD(S.allPerps);
  renderPositions();
  renderOpenOrders(); // [v13.9 FIX4] re-filter Open Orders ตาม S.symbol ใหม่ทันที
  // [v13.9 FIX3] sync risk banner เมื่อเปลี่ยนเหรียญ — ป้องกัน banner FROZEN ค้าง
  // ถ้า contract ที่เลือกอยู่ FROZEN และมี active อื่น → auto-switch ก่อน
  {
    const _selC = earnContracts.find(x => x.contractId === selectedEarnContractId);
    if (_selC && _selC.status === 'frozen') {
      const _activeC = earnContracts.find(c => c.status === 'active');
      if (_activeC) {
        selectEarnContract(_activeC.contractId);
      } else {
        updateRiskWarnings(_selC); // ไม่มี active เลย → แสดง frozen state ตามจริง
      }
    } else if (_selC) {
      updateRiskWarnings(_selC);
    }
  }
}

function renderOrderBook2() {
  ['askList','bidList'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  const mid = document.getElementById('obMidPrice');
  if (mid) { mid.textContent = '—'; }
}

function fillPrice(p) {
  const inp = document.getElementById('limitPriceInp');
  if (inp) { inp.value = p.toFixed(1); updateMaxCost(); }
}

function updateMaxCost() {
  const priceRaw = parseFloat(document.getElementById('limitPriceInp').value);
  let price;
  if (S.orderType === 'Market') {
    price = S.markPrice;
  } else if (priceRaw > 0) {
    price = priceRaw;
  } else if (typeof BBO !== 'undefined' && BBO.active) {
    // BBO เปิด: ใช้ราคา ask/bid สำหรับ preview cost (ใช้ long side เป็น default)
    price = _getBBOPrice ? _getBBOPrice('long') : S.markPrice;
  } else {
    price = 0;
  }
  const amt = parseFloat(document.getElementById('amtInp').value) || 0;
  const lev = S.lev;
  if (price && amt) {
    const notional = price * amt;
    const margin = notional / lev;
    const moEl = document.getElementById('maxOpen');
    const cvEl = document.getElementById('costVal');
    const mosEl = document.getElementById('maxOpenS');
    const cvsEl = document.getElementById('costValS');
    if (moEl) moEl.textContent = amt.toFixed(3) + ' ' + S.coin;
    if (cvEl) cvEl.textContent = fmtNum(margin,2) + ' USDT';
    if (mosEl) mosEl.textContent = amt.toFixed(3) + ' ' + S.coin;
    if (cvsEl) cvsEl.textContent = fmtNum(margin,2) + ' USDT';
  }
}

function _placeOrderCore(side) {
  // [v2.41 FIX-U3] ตรวจ EarnContract ก่อนสิ่งอื่นทั้งหมด
  // เดิม: guard นี้อยู่หลัง amount/price validation → user กรอกข้อมูลครบแล้วโดน block
  // ใหม่: ย้ายขึ้นมาบนสุด — ถ้าไม่มีสัญญา block ทันที ก่อนตรวจ input อื่น
  // (checkCanOpenPosition ใน placeOrder() ก็ block แล้ว แต่ _placeOrderCore อาจถูกเรียก
  //  จาก path อื่นในอนาคต — guard ที่นี่เป็น defense-in-depth)
  const _cEarly = (typeof _getSelectedContract === 'function') ? _getSelectedContract() : null;
  if (!_cEarly) {
    showToast(tccT('toast_select_earn_first'));
    return;
  }

  const amtStr  = document.getElementById('amtInp').value;
  const priceStr = document.getElementById('limitPriceInp')?.value;
  const amt = parseFloat(amtStr);

  // ── ตรวจสอบ Amount ──
  if (!amt || amt <= 0) { showToast(tccT('toast_enter_amount')); return; }

  // ── ตรวจสอบราคา ──
  let price;
  if (S.orderType === 'Market') {
    // Market Order: ใช้ markPrice เสมอ
    price = S.markPrice;
    if (!price || price <= 0) { showToast(tccT('toast_no_market_price')); return; }
  } else {
    const typedPrice = parseFloat(priceStr);
    if (typedPrice > 0) {
      // ผู้ใช้กรอกราคาเอง → ใช้ราคานั้น (BBO ปิดอัตโนมัติแล้วเมื่อพิมพ์)
      price = typedPrice;
    } else if (typeof BBO !== 'undefined' && BBO.active) {
      // BBO เปิดอยู่ + ช่องว่าง → ใช้ราคา BBO ตาม mode และ side
      price = _getBBOPrice(side);
      if (!price || price <= 0) {
        showToast(tccT('toast_no_orderbook'));
        return;
      }
      // แสดงราคา BBO ในช่อง briefly ให้ผู้ใช้เห็น
      const priceInpEl = document.getElementById('limitPriceInp');
      if (priceInpEl) priceInpEl.placeholder = fmtP(price);
    } else {
      // BBO ปิด และไม่ได้กรอก → บล็อก
      showToast(tccT('toast_enter_price_or_bbo'));
      document.getElementById('limitPriceInp')?.focus();
      return;
    }
  }

  // ── [FIX-F1] Limit Price Deviation Guard (Frontend) ──────────────────────────
  // เหตุผล: กรณี entry_price=6,200 (ตลาดจริง ~60,000) ทำให้ PnL/ROI ผิดทั้งหมด
  // ป้องกันตั้งแต่ต้นทาง ก่อนส่ง order ไป GAS — GAS ก็มี FIX-R1 เป็นด่านที่ 2
  // Rule: ถ้า orderType=Limit และ price ห่างจาก markPrice เกิน 20% → ปฏิเสธ
  // ยกเว้น: Market Order (price = markPrice เสมอ), BBO (ราคาจาก order book live)
  if (S.orderType !== 'Market') {
    const _markNow = S.markPrice || 0;
    const _isBBO   = typeof BBO !== 'undefined' && BBO.active;
    if (_markNow > 0 && !_isBBO) {
      // BBO ใช้ราคา order book live → ไม่ต้องตรวจ deviation (ราคาจาก feed จริง)
      // Manual price → ตรวจ deviation vs markPrice
      const _fDev = Math.abs(price - _markNow) / _markNow;
      const _F_DEV_MAX = 0.20; // 20% — เท่ากับ GAS FIX-R1
      if (_fDev > _F_DEV_MAX) {
        const _devPct   = (_fDev * 100).toFixed(1);
        const _markFmt  = _markNow.toLocaleString('en', { maximumFractionDigits: 2 });
        const _priceFmt = price.toLocaleString('en', { maximumFractionDigits: 2 });
        showToast(
          '❌ Limit Price (' + _priceFmt + ') ห่างจากราคาตลาด (' + _markFmt + ') ' +
          _devPct + '% — เกินขีดจำกัด 20%\n' +
          'กรุณากรอกราคาใหม่ให้ใกล้กับราคาตลาดจริง'
        );
        console.warn('[FIX-F1] Limit price rejected: price=' + price + ' mark=' + _markNow +
                     ' deviation=' + _devPct + '%');
        return;
      }
    }
  }
  // ─── End FIX-F1 ────────────────────────────────────────────────────────────

  // ── Validate Earn Contract ──
  const c = _getSelectedContract();
  if (!c) { showToast(tccT('toast_select_earn_contract')); return; }
  if (c.status === 'frozen') { showToast(tccT('toast_contract_frozen_no_order')); return; }
  // [v2.34 FIX-Q] บล็อก Fixed mode — แอดมินสลับเป็น Fixed แล้วห้ามเทรด
  if (c.isFixed) { showToast(tccT('toast_fixed_mode_no_trade')); return; }

  // ── คำนวณ margin & validate cap ──
  // [FIX MARGIN-POOL] รวมเป็นเช็คเดียว: static pool 10% ของ stakedAmount ลบด้วย
  //   (margin ที่เปิดอยู่ + pending order margin + realized loss สะสม)
  //   เดิมมี 2 เช็คแยกกัน (margin cap ล้วนๆ กับ realized loss ≥10% แยกต่างหาก) ที่ไม่ sync
  //   กับตัวเลข "วงเงินคงเหลือในสัญญา" ที่แสดงบนจอ (_refreshAvbl/calcAvailMargin) — สมาชิก
  //   เลยเห็นวงเงินเต็ม 100 ทั้งที่ปิดออเดอร์ติดลบสะสมไปแล้ว ตอนนี้ใช้สูตรเดียวกันทั้ง 3 จุด
  syncContractBalance(c);
  const notional         = price * amt;
  // [v2.44 FIX-OSC2-E] ใช้ S.lev ที่บันทึกไว้ ณ เวลาที่กด — ถูกต้องอยู่แล้ว
  //   แต่เพิ่ม snapshot ไว้ใน const เพื่อให้ pendingOrder บันทึก lev ตรงกับ margin ที่คำนวณ
  //   ป้องกันกรณี user สลับ leverage หลัง place order แล้ว pendingOrder.margin กับ pendingOrder.lev ไม่ sync
  const _snapLev         = S.lev; // snapshot lev ณ เวลา place — ใช้ใน pendingOrder และ margin calc
  const margin           = notional / _snapLev;
  const maxAllowedMargin = c.stakedAmount * 0.10;
  const totalUsedMargin  = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + p.margin, 0);
  // นับ margin ของ pending orders ที่รอ fill ด้วย (ไม่รวมออเดอร์ที่กำลังจะ place อยู่นี้)
  const pendingMargin = (S.openOrders || [])
    .filter(o => o.earnContractId === c.contractId)
    .reduce((s, o) => s + o.margin, 0);
  const realizedLoss  = Math.max(0, -(c.realizedPnl || 0)); // ขาดทุนสะสม (0 ถ้ากำไร)
  const capRemaining  = Math.max(0, maxAllowedMargin - totalUsedMargin - pendingMargin - realizedLoss);

  // [FIX-OSC] Per-order size cap: margin ต่อออเดอร์ ≤ 50% ของ maxAllowedMargin (= staked × 5%)
  //   ป้องกันออเดอร์ครั้งเดียวกินวงเงินทั้งหมด — บังคับกระจายอย่างน้อย 2 ออเดอร์
  //   GAS ก็เช็คซ้ำเป็น server-side guard (FIX-OSC2-B) เช่นกัน
  const maxPerOrderMargin = maxAllowedMargin * 0.50; // 50% ของ 10% = staked × 5%
  if (margin > maxPerOrderMargin) {
    showToast(
      '❌ ขนาดออเดอร์เกินขีดจำกัดต่อครั้ง\n' +
      'Margin ที่ขอ: ' + fmtNum(margin, 2) + ' USDT\n' +
      'สูงสุดต่อออเดอร์: ' + fmtNum(maxPerOrderMargin, 2) + ' USDT (50% ของวงเงิน ' + fmtNum(maxAllowedMargin, 2) + ' USDT)\n' +
      'ลดขนาด Position หรือลด Leverage ลง'
    );
    return;
  }

  if (margin > capRemaining) {
    if (realizedLoss >= maxAllowedMargin) {
      showToast(tccTF('toast_budget_full_loss',{realized:fmtNum(realizedLoss,2),max:fmtNum(maxAllowedMargin,2)}));
    } else if (capRemaining > 0) {
      showToast(tccTF('toast_margin_exceed',{margin:fmtNum(margin,2),cap:fmtNum(capRemaining,2)}));
    } else {
      showToast(tccTF('toast_budget_full',{max:fmtNum(maxAllowedMargin,2)}));
    }
    return;
  }

  const isClose = S.oc === 'close';

  if (isClose) {
    // ══ CLOSE MODE ══
    const match = S.positions.find(p =>
      p.symbol === S.symbol &&
      ((side === 'long' && p.side === 'short') || (side === 'short' && p.side === 'long'))
    );
    if (!match) { showToast(tccTF('toast_no_position_side',{side:(side==='long'?'Short':'Long')})); return; }

    const closeAmt = Math.min(amt, match.size);
    const priceDiff = side === 'long' ? match.entry - price : price - match.entry;
    const realizedPnl = priceDiff * closeAmt;
    const originalSize = match.size;   // [FIX Bug#1] บันทึกก่อนหัก
    match.size -= closeAmt;
    match.realized = (match.realized || 0) + realizedPnl;

    if (match.size <= 0.0001) {
      S.positions = S.positions.filter(p => p.id !== match.id);
      const cc = earnContracts.find(x => x.contractId === match.earnContractId);
      if (cc) {
        cc.realizedPnl = (cc.realizedPnl || 0) + realizedPnl;
        // [FIX Bug#6] กัน GAS sync รอบถัดไปทับค่านี้ด้วยค่าเก่าก่อน write commit เสร็จ
        window._pendingEarnSync[cc.contractId] = Date.now() + 12000;
        _refreshAvbl(cc);
      }
      if (typeof HIST !== 'undefined') HIST.logClose(match, closeAmt, price, realizedPnl, true);
      showToast(tccTF('toast_position_closed',{pnl:sgn(realizedPnl)}));
    } else {
      const closedRatio = closeAmt / originalSize;   // [FIX Bug#1] ใช้ originalSize แทน
      match.margin = match.margin * (1 - closedRatio);
      const cc = earnContracts.find(x => x.contractId === match.earnContractId);
      if (cc) {
        cc.realizedPnl = (cc.realizedPnl || 0) + realizedPnl;
        // [FIX Bug#6] กัน GAS sync รอบถัดไปทับค่านี้ด้วยค่าเก่าก่อน write commit เสร็จ
        window._pendingEarnSync[cc.contractId] = Date.now() + 12000;
        _refreshAvbl(cc);
      }
      if (typeof HIST !== 'undefined') HIST.logClose(match, closeAmt, price, realizedPnl, false);
      showToast(tccTF('toast_reduce_position',{amt:fmtNum(closeAmt,3),coin:S.coin,size:fmtNum(match.size,3)}));
    }

    renderPositions();
    if (typeof renderEarnContracts === 'function') renderEarnContracts(); // [FIX Bug#1] sync My Contracts card ทันทีหลังปิด position
    _updatePosBadge();
    switchTab('pos');
    if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
    return;
  }

  // ══ OPEN MODE ══
  const tp = parseFloat(document.getElementById('tpInp')?.value) || null;
  const sl = parseFloat(document.getElementById('slInp')?.value) || null;

  // ── Reset inputs ──
  document.getElementById('amtInp').value = '';
  const _priceInpEl = document.getElementById('limitPriceInp');
  if (_priceInpEl) _priceInpEl.value = '';
  document.getElementById('pctSlider').value = 0;
  document.getElementById('pctSlider').style.setProperty('--pct', '0%');
  if (S.tpslOn && document.getElementById('tpInp')) document.getElementById('tpInp').value = '';
  if (S.tpslOn && document.getElementById('slInp')) document.getElementById('slInp').value = '';
  // [v_commtf_v3 FIX] บันทึก orderType ก่อน reset — ใช้ตัดสิน route (Market vs Limit)
  // เดิม reset S.orderType = 'Limit' ก่อน แล้วค่อย if (S.orderType === 'Market')
  // → S.orderType เป็น 'Limit' เสมอ → Market Order ไม่เคย route ไป _fillOrderToPosition เลย
  // → Market Order ถูกบันทึกเป็น Limit Order ใน OpenOrders Sheet แทน Positions Sheet
  const _placedOrderType = S.orderType; // [FIX] เก็บ type จริงก่อน reset
  // [FIX Bug2] Reset orderType กลับ Limit หลัง place order ทุกครั้ง
  // ป้องกัน Stop Limit / Stop Market ค้างเมื่อผู้ใช้กดสลับเผลอ
  otIdx = 0; S.orderType = 'Limit';
  const _otLbl = document.getElementById('orderTypeLabel');
  if (_otLbl) _otLbl.textContent = 'Limit';
  const _lprRow = document.getElementById('limitPriceRow');
  if (_lprRow) _lprRow.style.display = '';
  updateMaxCost();

  if (_placedOrderType === 'Market') { // [FIX] ใช้ _placedOrderType แทน S.orderType (ที่ถูก reset ไปแล้ว)
    // ══ Market Order: เข้า Position ทันที ══
    _fillOrderToPosition({ side, price, amt, margin, tp, sl, type: 'Market', earnContractId: selectedEarnContractId });
    renderPositions();
    _updatePosBadge();
    _refreshAvbl(c);
    renderEarnContracts();
    selectEarnContract(selectedEarnContractId);
    switchTab('pos');
    if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  } else {
    // ══ Limit Order: ใส่ใน Open Orders รอ fill ══
    // [v10 FIX] ไม่คำนวณ liq ที่นี่อีกต่อไป (MMR formula เก่าถูกลบออก)
    // liq=0 ใน pendingOrder — recalcPositions() จะ set จาก liq_price_map หลัง fill
    const pendingOrder = {
      id:             Date.now(),
      symbol:         S.symbol,
      coin:           S.coin,
      side,
      type:           S.orderType,
      // [v2.44 FIX-OSC2-E] ใช้ _snapLev แทน S.lev เพื่อให้ lev และ margin ใน order ตรงกันเสมอ
      //   ถ้าใช้ S.lev ที่อาจเปลี่ยนหลัง place → margin ใน order ผิด → pendingMargin ใน
      //   capRemaining คำนวณผิด → check ต่อๆ ไป (_placeOrderCore, _refreshAvbl) อาจผ่านทั้งที่ควร block
      lev:            _snapLev,
      size:           amt,
      limitPrice:     price,
      margin,
      liq:            0,  // [v10 FIX] ไม่คำนวณเอง — recalcPositions() จะ set จาก liq_price_map หลัง fill
      tp, sl,
      earnContractId: selectedEarnContractId,
      createdAt:      Date.now()
    };
    S.openOrders = S.openOrders || [];
    S.openOrders.push(pendingOrder);
    // sync pending order ใหม่ไป GAS
    if (typeof syncOpenOrdersToGAS === 'function') syncOpenOrdersToGAS();
    renderOpenOrders();
    showToast('📋 Limit ' + (side === 'long' ? 'Long' : 'Short') +
      ' ' + amt.toFixed(3) + ' ' + S.coin +
      ' @ ' + price.toLocaleString('en', {maximumFractionDigits: 2}) +
      ' USDT — รอราคาตลาดถึง');
    switchTab('ord');
    if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  }
}

// ══════════════════════════════════════════════════════════════
//  _fillOrderToPosition — สร้าง / merge Position จาก order ที่ fill แล้ว
// ══════════════════════════════════════════════════════════════
// [v9 FIX] Date.now() อย่างเดียวชนกันได้ถ้าสร้าง position 2 รายการในมิลลิวินาทีเดียวกัน
// (เช่น toFill.forEach fill หลาย order รวดเดียว) → เติม random suffix กันชน
function _genUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}
function _fillOrderToPosition(order) {
  const { side, price, amt, margin, tp, sl, type, earnContractId } = order;
  // [FIX cross-coin] ใช้ symbol/coin จาก order เสมอ ไม่ใช้ S.symbol/S.coin
  // เพราะ order อาจเป็นเหรียญอื่นที่ fill ขณะกำลังดูกราฟเหรียญอื่นอยู่
  const orderSymbol = order.symbol || S.symbol;
  const orderCoin   = order.coin   || S.coin;
  // mark price ใช้ราคาของ coin ใน order เท่านั้น — ไม่ fallback ไป S.markPrice (ราคาเหรียญที่กำลังดูอยู่)
  const orderMark   = parseFloat(S.coinPrices[orderCoin]) || price;

  // [v10 FIX] liq ไม่คำนวณที่นี่อีกต่อไป — recalcPositions() จะ set จาก liq_price_map (backend SSOT)
  // MMR formula เก่าถูกลบออก ดู recalcPositions() สำหรับ fallback ถ้า map ยังไม่มา

  // [BUGFIX] เดิม HIST.logOpen(...) (เขียน Position ลง Sheet) กับ _refreshContractLiqMap(...)
  // (อ่าน Sheet มาคำนวณ liq) ถูกยิงพร้อมกันแบบไม่รอกัน → getContractStatus มีโอกาสอ่าน Sheet
  // ก่อนแถว Position ใหม่ถูกเขียนเสร็จจริง → liq_price_map ไม่มี id นี้ → "Liq. Price" ค้าง "—"
  // ตลอดไปจนกว่าจะ reload แอปใหม่ทั้งหมด แก้โดยรอ promise ของ logOpen ให้เสร็จก่อน
  // ค่อย refresh liq map (ถ้า logOpen ไม่ใช่ promise หรือ error ก็ fallback กลับไป refresh ทันทีเหมือนเดิม)
  const _refreshLiqAfterLogOpen = (logOpenResult) => {
    if (typeof _refreshContractLiqMap !== 'function') return;
    if (logOpenResult && typeof logOpenResult.then === 'function') {
      logOpenResult.then(() => _refreshContractLiqMap(earnContractId))
                   .catch(() => _refreshContractLiqMap(earnContractId));
    } else {
      _refreshContractLiqMap(earnContractId);
    }
  };

  // [FIX cross-coin] match ด้วย order.symbol ไม่ใช่ S.symbol
  const existing = S.positions.find(p =>
    p.symbol === orderSymbol &&
    p.side   === side &&
    p.earnContractId === earnContractId
  );

  if (existing) {
    const totalSize    = existing.size + amt;
    const avgEntry     = (existing.entry * existing.size + price * amt) / totalSize;
    const newMarginTot = existing.margin + margin;
    existing.size   = totalSize;
    existing.entry  = avgEntry;
    existing.margin = newMarginTot;
    existing.liq    = 0;  // [v10 FIX] รีเซ็ต — recalcPositions() จะ overwrite จาก liq_price_map
    existing.mark   = orderMark;
    if (tp) existing.tp = tp;
    if (sl) existing.sl = sl;
    const _logOpenP = (typeof HIST !== 'undefined')
      ? HIST.logOpen({...existing, size: amt, entry: price, id: _genUniqueId()})
      : null;
    // [BUGFIX] ดึง liq_price_map ใหม่หลัง logOpen เขียนเสร็จ — กัน "Liq. Price" โชว์ "—" ค้าง
    _refreshLiqAfterLogOpen(_logOpenP);
    return existing;
  } else {
    const newPos = {
      id: _genUniqueId(), symbol: orderSymbol, coin: orderCoin,
      side, type, mode: 'Cross', lev: order.lev || S.lev,   // [FIX Bug#5] ใช้ leverage ตอนสั่ง order ก่อน ป้องกันเปลี่ยน lev ระหว่างรอ fill
      size: amt, entry: price, mark: orderMark,
      liq: 0, margin, marginRatio: 0.5,  // [v10 FIX] liq=0 ชั่วคราว — recalcPositions() จะ set จาก liq_price_map
      pnl: 0, roi: 0, realized: 0, tp, sl, earnContractId,
      _tpslSetAt: Date.now(), // [v9] grace period ป้องกัน trigger ทันทีหลังเปิด position (ทุกครั้ง)
    };
    S.positions.push(newPos);
    // [FIX Bug6] subscribe WS สำหรับ coin ของ position ใหม่ เพื่อ real-time PnL
    if (typeof ws !== 'undefined' && ws && ws.readyState === 1 && orderCoin !== S.coin) {
      ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'trades', coin: orderCoin } }));
    }
    const _logOpenP = (typeof HIST !== 'undefined') ? HIST.logOpen(newPos) : null;
    // [BUGFIX] ดึง liq_price_map ใหม่หลัง logOpen เขียนเสร็จ — กัน "Liq. Price" โชว์ "—" ค้าง
    _refreshLiqAfterLogOpen(_logOpenP);
    return newPos;
  }
}

// ══════════════════════════════════════════════════════════════
//  renderOpenOrders — แสดง Limit Orders ที่รอ fill
// ══════════════════════════════════════════════════════════════
function renderOpenOrders() {
  const list   = document.getElementById('ordList');
  const cntEl  = document.getElementById('cntOrd');
  const posListEl = document.getElementById('posList');
  if (!list) return;

  // badge แสดงจำนวน orders ทั้งหมดทุกเหรียญ (ไม่กรอง)
  const totalOrders = (S.openOrders || []).length;
  if (cntEl) cntEl.textContent = totalOrders;

  // list แสดงเฉพาะ orders ของ contract/symbol ที่เลือกอยู่
  const orders = (S.openOrders || []).filter(o =>
    (!selectedEarnContractId || o.earnContractId === selectedEarnContractId) &&
    (!S.hideOthers || o.symbol === S.symbol)
  );

  // Toggle panel
  const isOrdTab = S.tab === 'ord';
  list.style.display    = isOrdTab ? '' : 'none';
  if (posListEl) posListEl.style.display = isOrdTab ? 'none' : '';

  if (!isOrdTab) return;

  if (!orders.length) {
    list.innerHTML = `<div class="empty">
      <div class="empty-ico">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
      </div>
      <span style="font-size:11px"><span data-i18n="no_order">${tccT('no_order')}</span></span>
    </div>`;
    return;
  }

  list.innerHTML = orders.map(o => {
    const isBuy  = o.side === 'long';
    const clr    = isBuy ? 'var(--g)' : 'var(--r)';
    const bgClr  = isBuy ? 'var(--gbg)' : 'var(--rbg)';
    const lbl    = isBuy ? 'Long' : 'Short';
    const mark   = S.markPrice || 0;
    const diff   = mark > 0 ? ((o.limitPrice - mark) / mark * 100).toFixed(2) : '—';
    const diffTxt = mark > 0
      ? (parseFloat(diff) >= 0 ? '+' + diff : diff) + '% จากตลาด'
      : '';
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rmd);margin:6px 10px;padding:10px 12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;font-weight:800;color:${clr};background:${bgClr};padding:2px 7px;border-radius:3px">${lbl}</span>
          <span style="font-size:12px;font-weight:700;color:var(--t1)">${o.symbol}</span>
          <span style="font-size:10px;color:var(--t2);background:var(--bg4);padding:1px 5px;border-radius:3px">${o.type} ${o.lev}x</span>
        </div>
        <button onclick="cancelOrder(${o.id})" style="font-size:11px;color:var(--r);background:var(--rbg);border:1px solid var(--r);border-radius:4px;padding:2px 9px;cursor:pointer;font-family:inherit">Cancel</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px">
        <div><div style="color:var(--t2);margin-bottom:2px">Limit Price</div>
          <div style="font-family:var(--mono);font-weight:700;color:${clr}">${o.limitPrice.toLocaleString('en',{maximumFractionDigits:2})}</div>
          <div style="font-size:9px;color:var(--t3)">${diffTxt}</div>
        </div>
        <div><div style="color:var(--t2);margin-bottom:2px">Size</div>
          <div style="font-family:var(--mono);font-weight:600;color:var(--t1)">${o.size.toFixed(3)} ${o.coin}</div>
        </div>
        <div><div style="color:var(--t2);margin-bottom:2px">Margin</div>
          <div style="font-family:var(--mono);font-weight:600;color:var(--t1)">${fmtNum(o.margin,2)} USDT</div>
        </div>
      </div>
      ${(o.tp || o.sl) ? `<div style="display:flex;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        ${o.tp ? '<span style="font-size:10px;color:var(--g)">TP: ' + o.tp.toLocaleString('en') + '</span>' : ''}
        ${o.sl ? '<span style="font-size:10px;color:var(--r)">SL: ' + o.sl.toLocaleString('en') + '</span>' : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  cancelOrder — ยกเลิก pending order
// ══════════════════════════════════════════════════════════════
function cancelOrder(id) {
  const idx = (S.openOrders || []).findIndex(o => o.id === id);
  if (idx === -1) return;
  const o = S.openOrders[idx];
  S.openOrders.splice(idx, 1);
  // [BUGFIX] เดิมพึ่งพา syncOpenOrdersToGAS (ส่งแค่ list ที่เหลือ) ให้ GAS เดาเอาเองว่า
  // order ไหนถูกลบไป → ถ้า GAS ไม่ลบ/อัปเดตแถวเดิม แถวจะค้างเป็น Pending ตลอดไป
  // แล้วพอ refresh แอป getOpenOrders ดึงแถว Pending ค้างนี้กลับมา → ถูก fill ซ้ำเป็น
  // Position ใหม่ทั้งที่ผู้ใช้ยกเลิกไปแล้ว → แก้โดยเรียก action 'cancelOrder' ที่ GAS v8.7
  // มีอยู่แล้ว (set status='Cancelled' เจาะจงรายตัว) และกันไว้ฝั่ง client ไม่ให้ id นี้
  // ถูก fill ซ้ำในเซสชันนี้ด้วย (เผื่อ GAS sync ช้า/ล้มเหลวชั่วคราว)
  window._filledOrderIds = window._filledOrderIds || new Set();
  window._filledOrderIds.add(o.id);
  if (typeof dbCallRaw === 'function') {
    dbCallRaw('cancelOrder', { order_id: o.id }).catch(()=>{});
  }
  // sync orders ที่เหลือหลัง cancel ไป GAS
  if (typeof syncOpenOrdersToGAS === 'function') syncOpenOrdersToGAS();
  renderOpenOrders();
  showToast(tccTF('toast_cancel_order',{side:(o.side==='long'?'Long':'Short'),price:o.limitPrice.toLocaleString('en',{maximumFractionDigits:2})}));
}

// ══════════════════════════════════════════════════════════════
//  _checkLimitOrderFill — ตรวจทุก tick ว่า pending orders fill หรือยัง
//  Long  fill เมื่อ markPrice ≤ limitPrice  (ราคาลงมาถึงที่ตั้งซื้อ)
//  Short fill เมื่อ markPrice ≥ limitPrice  (ราคาขึ้นมาถึงที่ตั้งขาย)
// ══════════════════════════════════════════════════════════════
function _checkLimitOrderFill() {
  if (!S.openOrders || !S.openOrders.length) return;
  // [v15 FIX][v9 FIX] ป้องกัน Limit Order fill ทันทีหลัง restore จาก GAS
  // ราคา coinPrices ยังไม่ stable → mark อาจผิด → order fill ผิดพลาด → margin พุ่ง → drawdown freeze
  if (_isSyncLocked()) {
    console.warn('[_checkLimitOrderFill] skipped — sync/refresh lock active');
    return;
  }
  // [v9 FIX] dedupe: กัน order เดียวกันถูก fill ซ้ำถ้ามีจุดเรียกซ้อนกัน (defense-in-depth)
  window._filledOrderIds = window._filledOrderIds || new Set();
  // [v50 FIX B] ใช้ราคาของ coin ของแต่ละ order แทน S.markPrice (ซึ่งเป็นราคาเหรียญที่กำลังดูอยู่เท่านั้น)
  // ทำให้ ETH/SOL orders fill ได้แม้จะกำลังดู BTC chart อยู่
  const toFill = S.openOrders.filter(o => {
    if (window._filledOrderIds.has(o.id)) return false; // [v9 FIX] กัน fill ซ้ำ
    const mark = parseFloat(S.coinPrices[o.coin]) || (o.coin === S.coin ? S.markPrice : 0);
    if (!mark) return false;
    return (o.side === 'long'  && mark <= o.limitPrice) ||
           (o.side === 'short' && mark >= o.limitPrice);
  });
  if (!toFill.length) return;

  toFill.forEach(o => {
    window._filledOrderIds.add(o.id); // [v9 FIX] mark ว่า fill แล้วก่อนทำงานต่อ
    // ลบออกจาก pending ก่อน
    S.openOrders = S.openOrders.filter(x => x.id !== o.id);
    // สร้าง/merge position
    const _newPos = _fillOrderToPosition({ ...o, price: o.limitPrice, amt: o.size });
    // [v2.36 FIX-S2] เปลี่ยนจาก fire-and-forget → retry สูงสุด 3 ครั้ง
    // เดิม: .catch(()=>{}) เงียบสนิท — ถ้า network หลุดชั่วคราว order ค้างเป็น Pending
    //        → Server trigger รอบถัดไป (ทุก 1 นาที) เห็น Pending → fill ซ้ำ สร้าง Position ซ้ำ
    // ใหม่: retry 5s / 10s / 20s — ครอบคลุมช่วง Server trigger window (60s) ได้อย่างน้อย 2 รอบ
    //        FIX-S1 ใน GAS ยังทำหน้าที่ปิดช่องว่างสุดท้ายถ้า retry ทั้ง 3 รอบล้มเหลวทั้งหมด
    if (typeof dbCallRaw === 'function') {
      const _markFilled = (orderId, posId, attempt) => {
        dbCallRaw('markOrderFilled', { order_id: orderId, position_id: posId })
          .catch(err => {
            const _delays = [5000, 10000, 20000]; // 5s, 10s, 20s
            if (attempt < _delays.length) {
              console.warn('[markOrderFilled] attempt ' + (attempt + 1) + ' failed (' + (err && err.message) + '), retry in ' + (_delays[attempt] / 1000) + 's...');
              setTimeout(() => _markFilled(orderId, posId, attempt + 1), _delays[attempt]);
            } else {
              console.warn('[markOrderFilled] all retries failed for order_id=' + orderId + '. FIX-S1 server-side guard will handle dedup on next trigger.');
            }
          });
      };
      _markFilled(o.id, _newPos && _newPos.id, 0);
    }
    // ตรวจ margin cap หลัง fill
    const c = earnContracts.find(x => x.contractId === o.earnContractId);
    if (c) {
      _refreshAvbl(c);
      syncContractBalance(c);
      // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ไม่มีข้อมูล → ไม่ trigger liquidate
      const _ddLF = _gasDDStrict(c);
      if (_ddLF !== null && _ddLF >= 40) _autoLiquidate(c);
    }
    showToast('✅ Limit Order Filled! ' + (o.side === 'long' ? 'Long' : 'Short') +
      ' ' + o.size.toFixed(3) + ' ' + o.coin +
      ' @ ' + o.limitPrice.toLocaleString('en', {maximumFractionDigits: 2}) + ' USDT');
  });

  // [BUGFIX] เดิมไม่มีการ sync การลบ pending order ที่ fill แล้วกลับไป GAS
  // → แถว OpenOrders บน Sheet ยังคงค้างเป็น "Pending" ตลอดไป
  // → ทุกครั้งที่ loadOfflineState() ดึง getOpenOrders มา (เช่น ตอน refresh/reload แอป)
  //   order เดิมที่ fill ไปแล้วจะถูก "คืนชีพ" กลับเข้า S.openOrders อีกครั้ง (เพราะ GAS ยังเห็นว่า Pending)
  //   แล้ว _checkLimitOrderFill() ก็มา fill มันซ้ำอีกรอบ สร้าง Position ใหม่ (id ใหม่) ซ้ำๆไม่จบไม่สิ้น
  //   → ตรงนี้คือสาเหตุของ "บันทึกข้อมูลออเดอร์ซ้ำ" ใน Positions sheet
  // แก้โดย sync S.openOrders (ที่ลบ order ที่ fill แล้วออกแล้ว) กลับไป GAS ทันที
  if (typeof syncOpenOrdersToGAS === 'function') syncOpenOrdersToGAS();

  // อัปเดต UI
  renderPositions();
  renderOpenOrders();
  // [FIX Bug2] cntPos ใช้ filter เดียวกับ renderPositions
  const posCount = selectedEarnContractId
    ? S.positions.filter(p => p.earnContractId === selectedEarnContractId).length
    : S.positions.length;
  document.getElementById('cntPos').textContent = posCount;
  if(typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  // [v4 FIX DOUBLE-WRITE] ตัด syncEarnContractsToGAS ออก — HIST.logClose จัดการ updateEarnContract ต่อ position แล้ว
  // ถ้ายัง tab อยู่ที่ ord และ orders หมดแล้ว ให้กลับไป pos
  if (S.tab === 'ord' && !(S.openOrders || []).length) switchTab('pos');
}

// Fetch 24h ticker data
async function fetch24h() {
  try {
    const coin = S.coinMap[S.symbol] || S.coin;
    // Use candle data to compute 24h stats
    const now = Date.now();
    const d = await hlPost({
      type: 'candleSnapshot',
      req: { coin: _wsCoinName(coin), interval: '1h', startTime: now - 86400000, endTime: now },
      ..._dexParam(coin)
    });
    if (d && d.length) {
      const high = Math.max(...d.map(c => parseFloat(c.h)));
      const low  = Math.min(...d.map(c => parseFloat(c.l)));
      const vol  = d.reduce((s, c) => s + parseFloat(c.v), 0);
      const hEl = document.getElementById('tk-high');
      const lEl = document.getElementById('tk-low');
      const vEl = document.getElementById('tk-vol');
      const mEl = document.getElementById('tk-mark');
      if (hEl) hEl.textContent = fmtP(high);
      if (lEl) lEl.textContent = fmtP(low);
      if (vEl) vEl.textContent = vol > 1000 ? (vol/1000).toFixed(1)+'K' : vol.toFixed(0);
      if (mEl) mEl.textContent = fmtP(S.markPrice);
    }
  } catch(e) {}
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  const dd = document.getElementById('coinDD');
  if (dd && !dd.contains(e.target) && !document.getElementById('topSym').contains(e.target)) {
    dd.classList.remove('open');
  }
});

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════
function fmtP(v) {
  if (!v || isNaN(v)) return '—';
  const n = parseFloat(v);
  if (n > 1000) return n.toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1});
  if (n > 10) return n.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
  return n.toLocaleString('en',{minimumFractionDigits:4,maximumFractionDigits:4});
}
// [v9] Helper กลาง — format number พร้อม comma separator (1,234.56)
function fmtNum(num, decimals = 2) {
  return parseFloat(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
// fmtM — format money with comma (thousands separator), 2dp default
function fmtM(num, decimals = 2) { return fmtNum(num, decimals); }
function sgn(v) { return (v<0?'-':'+') + fmtNum(Math.abs(v), 2); }
function sgnP(v) { return (v<0?'-':'+') + fmtNum(Math.abs(v), 2); }

// Toast type configs
const TOAST_CFG = {
  success: { icon: '✓', cls: 't-success', dur: 3000 },
  error:   { icon: '✕', cls: 't-error',   dur: 4500 },
  warn:    { icon: '⚠', cls: 't-warn',    dur: 4000 },
  info:    { icon: 'ℹ', cls: 't-info',    dur: 3200 },
};

let toastTm = null, toastBarAnim = null;

function showToast(msg, type, sub) {
  // Auto-detect type from message prefix if not given
  if (!type) {
    if (msg.startsWith('✅') || msg.startsWith('🎉') || msg.includes('สำเร็จ') || msg.includes('เปิด') || msg.includes('ซื้อ') || msg.includes('ขาย')) type = 'success';
    else if (msg.startsWith('❌') || msg.includes('เกิน') || msg.includes('ผิดพลาด') || msg.includes('error')) type = 'error';
    else if (msg.startsWith('⚠') || msg.includes('เกิน') || msg.includes('ระวัง')) type = 'warn';
    else type = 'info';
  }
  const cfg = TOAST_CFG[type] || TOAST_CFG.info;
  const t = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const title = document.getElementById('toast-title');
  const subEl = document.getElementById('toast-sub');
  const fill = document.getElementById('toast-bar-fill');

  // Strip emoji prefix for cleaner title if auto-detected
  const cleanMsg = msg.replace(/^[✅❌⚠🎉📉📈💰🔔ℹ]\s*/u, '');

  icon.className = 'toast-icon ' + cfg.cls;
  icon.textContent = cfg.icon;
  title.textContent = cleanMsg;
  fill.className = 'toast-bar-fill ' + cfg.cls;

  if (sub) { subEl.textContent = sub; subEl.style.display = 'block'; }
  else { subEl.style.display = 'none'; }

  clearTimeout(toastTm);
  if (toastBarAnim) { toastBarAnim.cancel && toastBarAnim.cancel(); }

  t.classList.add('on');
  // Animate progress bar
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() => {
    fill.style.transition = `width ${cfg.dur}ms linear`;
    fill.style.width = '0%';
  });

  toastTm = setTimeout(() => t.classList.remove('on'), cfg.dur);
}

// ═══════════════════════════════════════════════
//  TP/SL BOTTOM SHEET
// ═══════════════════════════════════════════════
let _tpslTargetId = null;

function openTpslSheet(posId) {
  _tpslTargetId = posId;
  const p = S.positions.find(x => x.id == posId);
  if (!p) return;

  // Populate info
  const sideLabel = p.side === 'long' ? 'Long' : 'Short';
  const sideColor = p.side === 'long' ? 'var(--g)' : 'var(--r)';
  const symEl = document.getElementById('tssh-sym');
  if (symEl) symEl.innerHTML = `${p.symbol} <span style="background:${p.side==='long'?'rgba(14,203,129,.15)':'rgba(246,70,93,.15)'};color:${sideColor};font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700">${sideLabel} ${p.lev}x</span>`;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('tssh-entry', fmtP(p.entry));
  // [RED-13 FIX] Use live mark price from S.markPrice (updated every 3s) — not stale p.mark
  const liveMark = S.markPrice || p.mark;
  setVal('tssh-mark', fmtP(liveMark));
  setVal('tssh-liq', fmtP(p.liq));

  // Pre-fill existing TP/SL
  const tpInp = document.getElementById('tssh-tp-inp');
  const slInp = document.getElementById('tssh-sl-inp');
  if (tpInp) tpInp.value = p.tp || '';
  if (slInp) slInp.value = p.sl || '';

  // Pos TP/SL tab inputs
  const posTpInp = document.getElementById('tssh-pos-tp-inp');
  const posSlInp = document.getElementById('tssh-pos-sl-inp');
  if (posTpInp) posTpInp.value = p.tp || '';
  if (posSlInp) posSlInp.value = p.sl || '';

  // Amount display
  const coinLabel = p.coin || S.coin;
  setVal('tssh-amt-coin', coinLabel);
  setVal('tssh-pos-amt', p.size.toFixed(3) + ' ' + coinLabel);
  setVal('tssh-amt-pct', `100% (≈${p.size.toFixed(3)})`);
  setVal('tssh-trail-amt-coin', coinLabel);
  setVal('tssh-trail-pos-amt', p.size.toFixed(3) + ' ' + coinLabel);
  setVal('tssh-trail-amt-pct', `100% (≈${p.size.toFixed(3)})`);

  // Reset to first tab
  const sheet = document.getElementById('tpslSheet');
  const firstTab = sheet ? sheet.querySelector('.tssh-tab') : null;
  tsshSwitchTab(firstTab, 'tpsl');

  // Attach live-PnL listeners with current position reference
  _attachTpslInputListeners(p);

  // Update hints (แสดงค่าที่ pre-fill อยู่แล้ว)
  _updateTpslHints(p);

  // Open sheet
  document.getElementById('tpslSheet').classList.add('open');
  document.body.style.overflow = 'hidden';

  // [RED-13 FIX] Background-sync TP/SL from GAS to catch offline-engine updates
  // Only runs if user hasn't modified inputs yet
  if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE && USER_PROFILE.uid) {
    const uid = USER_PROFILE.uid;
    dbCallRaw('getDashboard', { uid }).then(dash => {
      if (!dash || !dash.positions) return;
      const freshPos = dash.positions.find(x => x.id == posId || String(x.id) === String(posId));
      if (!freshPos) return;
      // Update S.positions entry
      const idx = S.positions.findIndex(x => x.id == posId);
      if (idx >= 0) {
        if (freshPos.tp !== undefined) S.positions[idx].tp = freshPos.tp;
        if (freshPos.sl !== undefined) S.positions[idx].sl = freshPos.sl;
      }
      // Only update inputs if user hasn't typed (value unchanged from what we set)
      const curTpInp = document.getElementById('tssh-tp-inp');
      const curSlInp = document.getElementById('tssh-sl-inp');
      const curPosTpInp = document.getElementById('tssh-pos-tp-inp');
      const curPosSlInp = document.getElementById('tssh-pos-sl-inp');
      const expectedTp = String(p.tp || '');
      const expectedSl = String(p.sl || '');
      if (curTpInp && curTpInp.value === expectedTp) curTpInp.value = freshPos.tp || '';
      if (curSlInp && curSlInp.value === expectedSl) curSlInp.value = freshPos.sl || '';
      if (curPosTpInp && curPosTpInp.value === expectedTp) curPosTpInp.value = freshPos.tp || '';
      if (curPosSlInp && curPosSlInp.value === expectedSl) curPosSlInp.value = freshPos.sl || '';
      // Re-run hints with refreshed values
      const pRef = S.positions[idx] || p;
      if (typeof _updateTpslHints === 'function') _updateTpslHints(pRef);
    }).catch(() => {});
  }
}

function closeTpslSheet() {
  document.getElementById('tpslSheet').classList.remove('open');
  document.body.style.overflow = '';
  _tpslTargetId = null;
}

function tsshSwitchTab(el, tab) {
  const sheet = document.getElementById('tpslSheet');
  if (!sheet) return;
  sheet.querySelectorAll('.tssh-tab').forEach(t => t.classList.remove('active'));
  sheet.querySelectorAll('.tssh-panel').forEach(p => p.classList.remove('active'));
  // el may be null when called programmatically — find by tab name
  const target = el || sheet.querySelector(`.tssh-tab[onclick*="'${tab}'"]`);
  if (target) target.classList.add('active');
  const panel = document.getElementById('tssh-panel-' + tab);
  if (panel) panel.classList.add('active');
}

function toggleTsshChk(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('on');
}

function toggleTrailingActivation() {
  const chk = document.getElementById('tssh-activation-chk');
  const row = document.getElementById('tssh-activation-inp-row');
  if (chk) chk.classList.toggle('on');
  const isOn = chk && chk.classList.contains('on');
  if (row) row.style.display = isOn ? '' : 'none';
}

function setTrailingCb(el, val) {
  document.querySelectorAll('.tssh-pct-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const inp = document.getElementById('tssh-cb-inp');
  if (inp) inp.value = val;
}

function onTsshAmtSlider(el) {
  const v = parseInt(el.value);
  el.style.setProperty('--pct', v + '%');
  const p = S.positions.find(x => x.id == _tpslTargetId);
  if (!p) return;
  const amt = (p.size * v / 100).toFixed(3);
  const el2 = document.getElementById('tssh-amt-pct');
  if (el2) el2.textContent = `${v}% (≈${amt})`;
}

function setTsshAmtSlider(v) {
  const sl = document.getElementById('tssh-amt-slider');
  if (sl) { sl.value = v; sl.style.setProperty('--pct', v + '%'); onTsshAmtSlider(sl); }
}

function onTrailAmtSlider(el) {
  const v = parseInt(el.value);
  el.style.setProperty('--pct', v + '%');
  const p = S.positions.find(x => x.id == _tpslTargetId);
  if (!p) return;
  const amt = (p.size * v / 100).toFixed(3);
  const el2 = document.getElementById('tssh-trail-amt-pct');
  if (el2) el2.textContent = `${v}% (≈${amt})`;
}

function setTrailSlider(v) {
  const sl = document.getElementById('tssh-trail-slider');
  if (sl) { sl.value = v; sl.style.setProperty('--pct', v + '%'); onTrailAmtSlider(sl); }
}

function _calcPnlStr(p, price, side) {
  if (!price || !p) return null;
  const pnl = (p.side === 'long' ? price - p.entry : p.entry - price) * p.size;
  return { val: pnl, str: sgn(pnl) + ' USDT', color: pnl >= 0 ? 'var(--g)' : 'var(--r)' };
}

function _updateTpslHintsFor(p, tpInpId, slInpId, tpHintPriceId, tpHintPnlId, slHintPriceId, slHintPnlId, tpLivePnlId, slLivePnlId) {
  const tpVal = parseFloat(document.getElementById(tpInpId)?.value) || 0;
  const slVal = parseFloat(document.getElementById(slInpId)?.value) || 0;
  const hintTpPrice = document.getElementById(tpHintPriceId);
  const hintTpPnl = document.getElementById(tpHintPnlId);
  const hintSlPrice = document.getElementById(slHintPriceId);
  const hintSlPnl = document.getElementById(slHintPnlId);
  const tpLive = document.getElementById(tpLivePnlId);
  const slLive = document.getElementById(slLivePnlId);

  if (hintTpPrice) hintTpPrice.textContent = tpVal ? fmtP(tpVal) : '—';
  if (tpVal) {
    const r = _calcPnlStr(p, tpVal);
    if (hintTpPnl) { hintTpPnl.textContent = r.str; hintTpPnl.style.color = r.color; }
    if (tpLive) {
      tpLive.textContent = r.str;
      tpLive.style.color = r.val >= 0 ? '#000' : '#fff';
      tpLive.style.background = r.val >= 0 ? 'rgba(14,203,129,0.85)' : 'rgba(246,70,93,0.85)';
      tpLive.style.display = '';
    }
  } else {
    if (hintTpPnl) hintTpPnl.textContent = '—';
    if (tpLive) tpLive.style.display = 'none';
  }

  if (hintSlPrice) hintSlPrice.textContent = slVal ? fmtP(slVal) : '—';
  if (slVal) {
    const r = _calcPnlStr(p, slVal);
    if (hintSlPnl) { hintSlPnl.textContent = r.str; hintSlPnl.style.color = r.color; }
    if (slLive) {
      slLive.textContent = r.str;
      slLive.style.color = r.val >= 0 ? '#000' : '#fff';
      slLive.style.background = r.val >= 0 ? 'rgba(14,203,129,0.85)' : 'rgba(246,70,93,0.85)';
      slLive.style.display = '';
    }
  } else {
    if (hintSlPnl) hintSlPnl.textContent = '—';
    if (slLive) slLive.style.display = 'none';
  }
}

function _updateTpslHints(p) {
  _updateTpslHintsFor(p,
    'tssh-tp-inp','tssh-sl-inp',
    'tssh-tp-hint-price','tssh-tp-hint-pnl',
    'tssh-sl-hint-price','tssh-sl-hint-pnl',
    'tssh-tp-live-pnl','tssh-sl-live-pnl');
  _updateTpslHintsFor(p,
    'tssh-pos-tp-inp','tssh-pos-sl-inp',
    'tssh-pos-tp-hint-price','tssh-pos-tp-hint-pnl',
    'tssh-pos-sl-hint-price','tssh-pos-sl-hint-pnl',
    'tssh-pos-tp-live-pnl','tssh-pos-sl-live-pnl');
}

// Live hint update on input change — registered dynamically in openTpslSheet()
function _attachTpslInputListeners(p) {
  ['tssh-tp-inp','tssh-sl-inp','tssh-pos-tp-inp','tssh-pos-sl-inp'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Remove old listener by cloning
    const fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    fresh.addEventListener('input', () => { _updateTpslHints(p); });
  });
}

function confirmTpsl(tab) {
  const p = S.positions.find(x => x.id == _tpslTargetId);
  if (!p) { closeTpslSheet(); return; }

  if (tab === 'tpsl' || tab === 'position') {
    const tpInpId = tab === 'tpsl' ? 'tssh-tp-inp' : 'tssh-pos-tp-inp';
    const slInpId = tab === 'tpsl' ? 'tssh-sl-inp' : 'tssh-pos-sl-inp';
    const tpVal = parseFloat(document.getElementById(tpInpId)?.value) || null;
    const slVal = parseFloat(document.getElementById(slInpId)?.value) || null;

    // [v4 FIX Bug1] ตรวจสอบ TP/SL ไม่ให้ตั้งค่าที่ trigger ทันทีตอน confirm
    // Long: TP ต้องอยู่ เหนือ markPrice, SL ต้องอยู่ ใต้ markPrice
    // Short: TP ต้องอยู่ ใต้ markPrice, SL ต้องอยู่ เหนือ markPrice
    const curMp = parseFloat(S.coinPrices[p.coin]) || p.mark || S.markPrice || 0;
    if (curMp > 0) {
      if (tpVal) {
        const tpInvalid = p.side === 'long'  ? tpVal <= curMp
                        : p.side === 'short' ? tpVal >= curMp : false;
        if (tpInvalid) {
          showToast(tccTF('toast_tp_side_error',{dir:tccT(p.side==='long'?'dir_higher':'dir_lower'),price:fmtP(curMp)}));
          return;
        }
      }
      if (slVal) {
        const slInvalid = p.side === 'long'  ? slVal >= curMp
                        : p.side === 'short' ? slVal <= curMp : false;
        if (slInvalid) {
          showToast(tccTF('toast_sl_side_error',{dir:tccT(p.side==='long'?'dir_lower':'dir_higher'),price:fmtP(curMp)}));
          return;
        }
      }
    }

    p.tp = tpVal;
    p.sl = slVal;
    // [v4 FIX Bug1] grace period 10 วินาทีหลังตั้ง TP/SL (เพิ่มจาก 3 วิ)
    p._tpslSetAt = Date.now();
    // [FIX-TPSL-ACTION] ใช้ action 'updateTpsl' แทน 'logOpen' — หลีกเลี่ยง _guardDuplicateWrite
    // ที่ logPositionWithGuard เดิมบล็อก TP/SL update ที่ตั้งภายใน 15 วิหลังเปิด position
    // updateTpsl เป็น action แยกเฉพาะ: update-only ไม่ผ่าน guard และไม่สร้างแถวใหม่เด็ดขาด
    if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE.uid) {
      (typeof dbWrite === 'function') && dbWrite('updateTpsl', {
        id: p.id, uid: USER_PROFILE.uid,
        tp: tpVal !== null ? tpVal : null,
        sl: slVal !== null ? slVal : null,
        tpsl_set_at: p._tpslSetAt,
      }).then(() => {
        showToast(tccT('tpsl_updated') + (p.tp ? ' | TP: '+fmtP(p.tp) : '') + (p.sl ? ' | SL: '+fmtP(p.sl) : ''));
      }).catch(err => {
        // [FIX-TPSL-ACTION] แสดง error จริงถ้า GAS ตอบกลับมาว่าล้มเหลว (ไม่ใช่แค่เงียบๆ)
        showToast(tccTF('toast_tpsl_save_fail',{msg:err.message||tccT('err_server_no_response')}), 'warn');
      });
    } else {
      showToast(tccT('tpsl_updated') + tccT('toast_tpsl_updated_offline') + (p.tp ? ' | TP: '+fmtP(p.tp) : '') + (p.sl ? ' | SL: '+fmtP(p.sl) : ''));
    }
  } else if (tab === 'trailing') {
    const cb = parseFloat(document.getElementById('tssh-cb-inp')?.value);
    if (!cb || cb <= 0) { showToast(tccT('toast_enter_callback')); return; }
    p.trailingCb = cb;
    p.trailingActive = true;
    showToast(tccTF('toast_trailing_set',{cb}));
  }
  renderPositions();
  closeTpslSheet();
}


// ═══════════════════════════════════════════════
//  NAVIGATION SYSTEM
// ═══════════════════════════════════════════════
let currentPage = 'trade';
const PAGE_IDS = { home:'home', whale:'whale', markets:'markets', trade:'trade', futures:'futures', assets:'assets', profile:'profile', 'account-info':'account-info', verification:'verification', termcondition:'termcondition', loan:'loan', 'loan-flexible':'loan-flexible' };

// ── Sub-pages that don't appear in bottom nav (no ni-xxx) ──
const PAGE_NAV_KEY = { 'account-info':'home', 'verification':'home', 'profile':'home', 'termcondition':'home', 'loan':'home', 'loan-flexible':'home' };

function navTo(page) {
  const target = PAGE_IDS[page] || page;

  // [v9] Track page history สำหรับ hardware back button (ข้าม whale redirect)
  if (target !== 'whale' && typeof _navToTrackHistory === 'function') {
    _navToTrackHistory(target);
  }

  // ── Whale ย้ายเป็นไฟล์แยก → redirect ออกก่อน ──
  if (target === 'whale') {
    try { sessionStorage.setItem('_returnFromWhale', 'futures'); } catch(e) {}
    var base = window.location.href.split('?')[0].split('#')[0];
    base = base.endsWith('/') ? base : base.replace(/\/[^\/]*$/, '/');
    window.location.href = base + 'index_Whale_EXT.html';
    return;
  }

  document.querySelectorAll('[id^="page-"]').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + target);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.ni').forEach(n => {
    n.classList.remove('active');
    const dot = n.querySelector('.ni-dot');
    if (dot) dot.remove();
  });

  // ── Login page: ซ่อน bottom nav, render login form ──
  const bnav = document.querySelector('.bnav');
  if (target === 'login') {
    if (bnav) bnav.style.display = 'none';
    if (typeof LG !== 'undefined') { LG.step = 1; LG.member = null; LG.isNewPassword = false; }
    setTimeout(() => { if (typeof lgRender === 'function') lgRender(); }, 50);
    currentPage = target;
    return;
  } else {
    if (bnav) bnav.style.display = '';
  }

  // For sub-pages (profile/account-info/verification), highlight parent nav item
  const navKey = PAGE_NAV_KEY[target] || target;
  const navEl = document.getElementById('ni-' + navKey);
  if (navEl) {
    navEl.classList.add('active');
    if (!navEl.querySelector('.ni-dot')) {
      const d = document.createElement('div');
      d.className = 'ni-dot';
      navEl.appendChild(d);
    }
  }
  currentPage = target;

  const futPanel = document.getElementById('futuresChartPanel');
  const spPanel  = document.getElementById('spChartArea');
  if (futPanel) futPanel.style.display = (target === 'futures') ? '' : 'none';
  if (spPanel)  spPanel.style.display  = (target === 'trade')   ? '' : 'none';

  if (target === 'home')    { if (typeof _homeInit === 'function') _homeInit(); else console.warn('[navTo] _homeInit not ready yet'); }
  if (target === 'markets' && !mktLoaded) loadMarketData();
  if (target === 'trade')   { loadSpotData(); }
  if (target === 'futures') requestAnimationFrame(() => requestAnimationFrame(() => {
    drawChart();
    // ── sync levBtn + goldLevNote ตาม S.coin ปัจจุบันทุกครั้งที่เข้าหน้า futures ──
    // restore coin จาก localStorage ถ้า S.coin ยังเป็น BTC แต่ lastCoin เป็น GOLD
    const _savedCoin = (() => { try { return localStorage.getItem('tcc_lastCoin'); } catch(e) { return null; } })();
    if (_savedCoin && _savedCoin !== (S.symbol || 'BTCUSDT')) {
      // selectCoin async — ทำให้ lev sync หลัง coin เปลี่ยน
      selectCoin(_savedCoin).catch(() => {});
    } else {
      // sync lev ตาม S.coin ปัจจุบัน
      const _cycle = _getActiveLevCycle();
      const _idx = _cycle.indexOf(S.lev);
      if (_idx === -1) { levIdx = _cycle.length - 1; S.lev = _cycle[levIdx]; }
      else { levIdx = _idx; }
      const _lb = document.getElementById('levBtn');
      if (_lb) _lb.textContent = S.lev + 'x';
      _syncGoldLevNote();
    }
  }));
  if (target === 'assets')  {
    astUpdateTime();
    updateOverviewBalances();
    // [v13.2 FIX] ตรวจว่า dash cache หมดอายุหรือ invalidated → reload balance จาก GAS
    _astRefreshBalanceIfStale();
    // [v13.3 FIX] เริ่ม polling ทุก 30 วิ เพื่อรับ off-chain deposit จากผู้อื่น
    _astStartBalancePolling();
  } else {
    // ออกจากหน้า assets → หยุด polling
    if (typeof _astStopBalancePolling === 'function') _astStopBalancePolling();
  }
  if (target === 'profile') { _profileRender(); }
  if (target === 'termcondition') {
    setTimeout(() => { if (typeof tcRenderMain === 'function') tcRenderMain(); }, 50);
  }
  // เมื่อเข้าแอปหลักครั้งแรกหลัง login → โหลด member จาก session
  if (typeof USER_PROFILE !== 'undefined' && !USER_PROFILE._memberLoaded) autoLoginFromMembers();
}

// ═══════════════════════════════════════════════
//  MARKETS PAGE
// ═══════════════════════════════════════════════
let mktLoaded = false;
let mktSub = 'futures';
let mktSort = { field:'chg', dir:-1 };
let mktData = [];        // futures perps
let mktSpotData = [];    // spot tokens
let mktStars = new Set(JSON.parse(localStorage.getItem('hl_stars') || '[]'));

const COIN_COLORS = {
  BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',BNB:'#f0b90b',ARB:'#12aaff',
  AVAX:'#e84142',ADA:'#0033ad',LINK:'#2a5ada',DOT:'#e6007a',DOGE:'#c3a634',
  MATIC:'#8247e5',ATOM:'#2e3148',UNI:'#ff007a',LTC:'#bfbbbb',XRP:'#346aa9',
  TRUMP:'#c0392b',WIF:'#8b4513',NEIRO:'#f39c12',TON:'#0088cc',OP:'#ff0420',
  PEPE:'#3cb371',BONK:'#f39c12',APT:'#2ad4a0',SUI:'#4da2ff',INJ:'#00b4d8',
  HYPE:'#00b4d8',PURR:'#9b59b6',UBTC:'#f7931a',UETH:'#627eea',USOL:'#9945ff'
};
function cColor(c) {
  // strip @-prefix for spot tokens like @1 @0
  const base = c.replace(/^@.*$/, c).replace('@','');
  return COIN_COLORS[base] || ('#' + ((c.split('').reduce((a,ch)=>a+ch.charCodeAt(0)*997,0x3a3f)>>>0).toString(16).padStart(6,'0').slice(0,6)));
}
function cLabel(c) {
  if (c.startsWith('@')) return c.replace('@','#');
  return c.slice(0,3);
}

function toggleStar(coin, e) {
  e.stopPropagation();
  if (mktStars.has(coin)) mktStars.delete(coin);
  else mktStars.add(coin);
  try { localStorage.setItem('hl_stars', JSON.stringify([...mktStars])); } catch(er){}
  renderMarket();
}

async function loadMarketData() {
  const list = document.getElementById('mktList');
  if (list) list.innerHTML = '<div class="mkt-loading"><div class="spin-sm"></div><span style="font-size:11px">Loading Hyperliquid data...</span></div>';

  try {
    // Fetch futures + spot metadata + metal dex with asset contexts (24h stats)
    const [futCtx, spotCtx, mids, metalMeta, metalMids] = await Promise.all([
      hlPost({ type: 'metaAndAssetCtxs' }),
      hlPost({ type: 'spotMetaAndAssetCtxs' }),
      hlPost({ type: 'allMids' }),
      hlPost({ type: 'metaAndAssetCtxs', dex: METAL_DEX }).catch(() => null),
      hlPost({ type: 'allMids', dex: METAL_DEX }).catch(() => null)
    ]);

    S.coinPrices = mids;

    // ── FUTURES ──
    if (futCtx && futCtx[0] && futCtx[1]) {
      const meta = futCtx[0]; // { universe: [{name,szDecimals,...},...] }
      const ctxs = futCtx[1]; // array of asset contexts parallel to universe
      mktData = meta.universe.slice(0, 120).map((m, i) => {
        const ctx = ctxs[i] || {};
        const coin = m.name;
        const price = parseFloat(mids[coin]) || parseFloat(ctx.markPx) || 0;
        const prevDay = parseFloat(ctx.prevDayPx) || 0;
        const chg = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
        const dayNtlVol = parseFloat(ctx.dayNtlVlm) || 0; // notional vol in USD
        const vol = dayNtlVol; // store raw USD, _hmFmtVol will format
        const funding = parseFloat(ctx.funding) || 0;
        const oi = parseFloat(ctx.openInterest) || 0;
        return { coin, price, chg, vol, funding, oi, sym: coin+'USDT', type:'perp' };
      }).filter(r => r.price > 0);
    }

    // ── METAL DEX (HIP-3) — รวม metal coins เข้า mktData ──
    if (metalMeta && metalMeta[0]) {
      const mUniverse = metalMeta[0].universe || [];
      const mCtxs     = metalMeta[1] || [];
      const mMids      = metalMids || {};
      const metalRows = mUniverse.map((m, i) => {
        const rawName = m.name;
        const coin  = rawName.includes(':') ? rawName.split(':').pop() : rawName;
        const ctx   = mCtxs[i] || {};
        const price = parseFloat(mMids[rawName] ?? mMids[coin]) || parseFloat(ctx.markPx) || 0;
        const prevDay = parseFloat(ctx.prevDayPx) || 0;
        const chg   = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
        const vol   = parseFloat(ctx.dayNtlVlm) || 0;
        const funding = parseFloat(ctx.funding) || 0;
        const oi    = parseFloat(ctx.openInterest) || 0;
        if (price > 0) S.coinPrices[coin] = String(price);
        return { coin, price, chg, vol, funding, oi, sym: coin+'USDT', type:'perp', isMetal: true };
      }).filter(r => r.price > 0 || _isMetalCoin(r.coin));
      const existingCoins = new Set(mktData.map(r => r.coin));
      const newMetals = metalRows.filter(r => !existingCoins.has(r.coin));
      mktData = [...newMetals, ...mktData];
      newMetals.forEach(r => { S.coinMap[r.sym] = r.coin; });
    }

    // ── SPOT ──
    if (spotCtx && spotCtx[0] && spotCtx[1]) {
      const tokens = spotCtx[0].tokens || [];
      const markets = spotCtx[0].universe || [];
      const ctxs = spotCtx[1] || [];
      mktSpotData = markets.slice(0, 80).map((m, i) => {
        const ctx = ctxs[i] || {};
        // market name like "BTC/USDC" or use token names
        const parts = m.name ? m.name.split('/') : [];
        const baseIdx = m.tokens ? m.tokens[0] : i;
        const token = tokens[baseIdx] || {};
        const coin = token.name || parts[0] || ('SPOT'+i);
        if (coin === 'USDC' || coin === 'USDT') return null;
        const price = parseFloat(ctx.midPx) || parseFloat(mids[coin]) || 0;
        const prevDay = parseFloat(ctx.prevDayPx) || 0;
        const chg = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
        const vol = (parseFloat(ctx.dayNtlVlm) || 0); // raw USD, _hmFmtVol will format
        return { coin, price, chg, vol, sym: coin+'/USDC', type:'spot' };
      }).filter(r => r && r.price > 0 && r.coin);

      // Deduplicate spot
      const seen = new Set();
      mktSpotData = mktSpotData.filter(r => { if(seen.has(r.coin)) return false; seen.add(r.coin); return true; });
    }

    mktData.sort((a,b) => Math.abs(b.chg) - Math.abs(a.chg));
    mktSpotData.sort((a,b) => Math.abs(b.chg) - Math.abs(a.chg));

    renderMarket();
    mktLoaded = true;

    // Update spot dropdown prices
    ['ETH','BTC','SOL','BNB'].forEach(c => {
      const el = document.getElementById('sdd-'+c);
      if (el && mids[c]) el.textContent = fmtP(parseFloat(mids[c]));
    });
  } catch(e) {
    console.warn('loadMarketData', e);
    if (list) list.innerHTML = `<div class="mkt-loading" style="cursor:pointer" onclick="loadMarketData()"><span style="font-size:11px;color:var(--r)"><span data-i18n="load_fail_tap">${tccT('load_fail_tap')}</span></span></div>`;
  }
}

function getCurrentMktData() {
  const cat = document.querySelector('.mct.active')?.textContent || '';
  if (cat === 'Favorites') {
    const allData = mktSub === 'spot' ? mktSpotData : [...mktData, ...mktSpotData];
    return allData.filter(r => mktStars.has(r.coin));
  }
  if (mktSub === 'spot') return mktSpotData;
  if (mktSub === 'all') return [...mktData, ...mktSpotData];
  return mktData; // futures (default)
}

function renderMarket() {
  const list = document.getElementById('mktList');
  if (!list) return;
  const q = (document.getElementById('mktSearch')?.value || '').toLowerCase().trim();
  let data = getCurrentMktData().filter(r => !q || r.coin.toLowerCase().includes(q) || r.sym.toLowerCase().includes(q));

  if (!data.length) {
    const emptyMsg = q ? 'No results for "'+q+'"' : (document.querySelector('.mct.active')?.textContent === 'Favorites' ? '⭐ No favorites yet — tap ☆ to add' : 'No data');
    list.innerHTML = '<div class="mkt-loading"><span style="font-size:11px">' + emptyMsg + '</span></div>';
    return;
  }

  // Sort
  const sorted = [...data].sort((a,b) => {
    const va = mktSort.field==='name'?a.coin : mktSort.field==='price'?a.price : a.chg;
    const vb = mktSort.field==='name'?b.coin : mktSort.field==='price'?b.price : b.chg;
    return (va>vb?1:va<vb?-1:0) * mktSort.dir;
  });

  // Limit to 50 items when not searching
  const MAX_DISPLAY = 50;
  const isSearching = q.length > 0;
  const displayData = isSearching ? sorted : sorted.slice(0, MAX_DISPLAY);
  const hasMore = !isSearching && sorted.length > MAX_DISPLAY;

  list.innerHTML = displayData.map(r => {
    const isUp = r.chg >= 0;
    const chgCls = isUp ? 'up' : r.chg < 0 ? 'dn' : 'flat';
    const chgStr = (isUp ? '+' : '') + r.chg.toFixed(2) + '%';
    const isStarred = mktStars.has(r.coin);
    const isSpot = r.type === 'spot';
    const isMetal = r.isMetal || _isMetalCoin(r.coin);
    const metalIcon = isMetal ? (METAL_ICONS[r.coin] || r.coin.slice(0,2)) : null;
    const typeTag = isSpot
      ? `<span style="background:rgba(14,203,129,.12);color:var(--g);font-size:9px;padding:1px 5px;border-radius:3px;border:1px solid rgba(14,203,129,.25);font-weight:600;margin-left:3px">Spot</span>`
      : isMetal
        ? `<span style="background:rgba(240,185,11,.12);color:var(--y);font-size:9px;padding:1px 5px;border-radius:3px;border:1px solid rgba(240,185,11,.3);font-weight:600;margin-left:3px">&#127885; Metal</span>`
        : `<span style="background:var(--bg4);color:var(--t2);font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid var(--bl);font-weight:500;margin-left:3px">Perp</span>`;
    const nameHtml = isSpot
      ? `<span class="mkt-name">${r.coin}</span><span style="font-size:11px;color:var(--t2)">/USDC</span>${typeTag}`
      : isMetal
        ? `<span class="mkt-name">${metalIcon} ${r.coin}USDT</span>${typeTag}`
        : `<span class="mkt-name">${r.coin}USDT</span>${typeTag}`;
    const volStr = r.vol >= 1e9 ? (r.vol/1e9).toFixed(2)+'B' : r.vol >= 1e6 ? (r.vol/1e6).toFixed(1)+'M' : r.vol >= 1e3 ? (r.vol/1e3).toFixed(0)+'K' : r.vol.toFixed(0);
    const color = isMetal ? '#f0b90b' : cColor(r.coin);
    const metalRowStyle = isMetal ? 'background:rgba(240,185,11,.04);border-left:2px solid rgba(240,185,11,.35);' : '';
    return `<div class="mkt-row" onclick="openFromMkt('${r.coin}','${isSpot?'spot':'futures'}')" style="${metalRowStyle}">
      <div class="mkt-row-inner">
        <span class="mkt-star ${isStarred?'starred':''}" onclick="toggleStar('${r.coin}',event)" title="${isStarred?'Unstar':'Star'}">${isStarred?'★':'☆'}</span>
        <div class="coin-av" style="background:${color}18;border-color:${color}30">
          <span style="color:${color};font-size:11px;font-weight:700">${isMetal ? (metalIcon||r.coin.slice(0,2)) : r.coin.slice(0,3)}</span>
        </div>
        <div>
          <div style="display:flex;align-items:center">${nameHtml}</div>
          <div class="mkt-vol">Vol ${volStr} USDT</div>
        </div>
      </div>
      <div class="mkt-price-col">
        <div class="mkt-price" style="color:${isUp?'var(--g)':'var(--r)'}">${fmtP(r.price)}</div>
        <div class="mkt-price-usd">$${fmtP(r.price)}</div>
      </div>
      <div class="chg-pill ${chgCls}">${chgStr}</div>
    </div>`;
  }).join('');

  // Show "showing X of total" hint when list is capped
  if (hasMore) {
    list.innerHTML += `<div style="text-align:center;padding:14px 12px;font-size:11px;color:var(--t2);border-top:1px solid var(--border)">
      แสดง ${MAX_DISPLAY} จาก ${sorted.length} รายการ — ค้นหาชื่อเหรียญเพื่อดูเพิ่มเติม
    </div>`;
  }
}

function switchSpTab(tab, el) {
  document.querySelectorAll('#page-trade .sp-tab-bn').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  ['orders','holdings','bots'].forEach(t => {
    const p = document.getElementById('spPanel-' + t);
    if (p) p.style.display = (t === tab) ? '' : 'none';
  });
  // [SPOT-FIX] render coin holdings เมื่อ switch มาที่ holdings tab
  if (tab === 'holdings') renderSpHoldings();
}

// [SPOT-FIX] _updateSpHoldingsCount — อัปเดตเลขใน badge ตาม spotWallet + USDT
function _updateSpHoldingsCount() {
  const countEl = document.getElementById('spHoldingsCount');
  if (!countEl) return;
  let n = (mainWalletBalance || 0) > 0 ? 1 : 0;
  for (const [coin, data] of Object.entries(spotWallet)) {
    if (coin === 'USDT') continue;
    if ((data.bal || 0) > 0) n++;
  }
  countEl.textContent = n;
}

// [SPOT-FIX] renderSpHoldings — แสดงเหรียญที่ถืออยู่ใน Holdings tab
// อ่านจาก spotWallet + mainWalletBalance + S.coinPrices
const _COIN_COLORS = {
  BTC:'#F7931A', ETH:'#627EEA', BNB:'#F3BA2F', SOL:'#9945FF',
  XRP:'#00AAE4', ADA:'#0033AD', DOT:'#E6007A', AVAX:'#E84142',
  MATIC:'#8247E5', LINK:'#375BD2', USDT:'#26A17B', USDC:'#2775CA',
  DOGE:'#C2A633', LTC:'#BFBBBB', UNI:'#FF007A', ATOM:'#2E3148',
};
const _COIN_NAMES = {
  BTC:'Bitcoin', ETH:'Ethereum', BNB:'BNB', SOL:'Solana',
  XRP:'XRP', ADA:'Cardano', DOT:'Polkadot', AVAX:'Avalanche',
  MATIC:'Polygon', LINK:'Chainlink', USDT:'TetherUS', USDC:'USD Coin',
  DOGE:'Dogecoin', LTC:'Litecoin', UNI:'Uniswap', ATOM:'Cosmos',
};
function renderSpHoldings() {
  const listEl = document.getElementById('spHoldingsList');
  if (!listEl) return;

  // รวม USDT + coin ทั้งหมดใน spotWallet ที่ bal > 0
  const rows = [];

  // USDT
  const usdtBal = mainWalletBalance || 0;
  if (usdtBal > 0) {
    rows.push({ coin:'USDT', bal: usdtBal, usd: usdtBal });
  }

  // Coin อื่นๆ จาก spotWallet
  for (const [coin, data] of Object.entries(spotWallet)) {
    if (coin === 'USDT') continue;
    const bal = data.bal || 0;
    if (bal <= 0) continue;
    const price = parseFloat(S?.coinPrices?.[coin]) || 0;
    rows.push({ coin, bal, usd: bal * price });
  }

  if (!rows.length) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px"><span data-i18n="no_coin">${tccT('no_coin')}</span></div>`;
    return;
  }

  // เรียง USDT ก่อน ตามด้วย usd มากสุด
  rows.sort((a, b) => {
    if (a.coin === 'USDT') return -1;
    if (b.coin === 'USDT') return 1;
    return b.usd - a.usd;
  });

  listEl.innerHTML = rows.map(r => {
    const color  = _COIN_COLORS[r.coin] || '#888';
    const name   = _COIN_NAMES[r.coin]  || r.coin;
    const balStr = r.coin === 'USDT'
      ? r.bal.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
      : r.bal.toFixed(8).replace(/\.?0+$/, '');
    const usdStr = '≈ $' + r.usd.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const initial = r.coin.charAt(0);
    return `<div class="sp-hold-row" onclick="selectSpotCoin('${r.coin}','USDT');closeSpotCoinSearch && closeSpotCoinSearch()">
      <div class="sp-hold-icon" style="background:${color}">${initial}</div>
      <div class="sp-hold-info">
        <div class="sp-hold-coin">${r.coin}</div>
        <div class="sp-hold-name">${name}</div>
      </div>
      <div class="sp-hold-right">
        <div class="sp-hold-bal">${balStr}</div>
        <div class="sp-hold-usd">${usdStr}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  UNIFIED CHART PANEL SYSTEM
//  Shared logic for Futures + Spot panels
// ═══════════════════════════════════════════════

// ── Panel State ──
const CHART_PANELS = {
  fut: {
    panelId:   'futuresChartPanel',
    innerId:   'chartSec',
    arrowId:   'chartArr',
    wrapId:    'futChartWrap',
    handleId:  'futDragHandle',
    scrollId:  'futuresScrollable',
    open:      true,
    wrapH:     200,
    // Pan/Zoom state
    // viewStart = index of first visible candle (0 = oldest loaded)
    // visCount  = number of candles visible (zoom level)
    viewStart:  null,   // null = auto (show latest)
    visCount:   80,     // default visible candles
    minVis:     10,     // zoom in limit
    maxVis:     500,    // zoom out limit (matches max fetch batch)
    yPadFactor: 0.15,   // Y-axis padding multiplier (drag right price axis to zoom)
    yOffset: 0,         // Vertical pan offset (positive = shift view up, negative = down)
    drawFn:    () => drawChart(),
    candlesFn: () => S.candles,
    minH: 80, maxH: 400,
  },
  sp: {
    panelId:   'spChartArea',
    innerId:   'spChartInner',
    arrowId:   'spChartArrow',
    wrapId:    'spChartWrap',
    handleId:  'spDragHandle',
    scrollId:  null,
    open:      true,
    wrapH:     200,
    viewStart:  null,
    visCount:   80,
    minVis:     10,
    maxVis:     500,
    yPadFactor: 0.15,
    yOffset: 0,         // Vertical pan offset
    drawFn:    () => drawSpChart(),
    candlesFn: () => SP.candles,
    minH: 80, maxH: 400,
  },
};

// ── Helpers: compute slice for pan/zoom (virtual viewport) ──
// viewStart can be negative (empty space left) or > total-vis (empty space right)
// Returns {viewStart, visCount, all} — drawChart/drawSpChart render with slot mapping
function chartViewSlice(key) {
  const cfg = CHART_PANELS[key];
  const all = cfg.candlesFn();
  const total = all.length;
  if (!total) return { viewStart: 0, visCount: cfg.visCount, all: [], candles: [] };

  const vis = cfg.visCount;

  // Auto mode: show latest candles flush to right edge (no empty space)
  if (cfg.viewStart === null) {
    const start = total - vis; // may be negative if total < vis, that's fine
    return { viewStart: start, visCount: vis, all, candles: all.slice(Math.max(0, start)) };
  }

  // Manual mode: allow viewStart to go negative or beyond total
  // Limit: first candle can reach center of screen (viewStart >= -(vis/2))
  //        last candle can reach center of screen (viewStart <= total - vis/2)
  const minVS = -Math.floor(vis / 2);
  const maxVS = total - Math.ceil(vis / 2);
  cfg.viewStart = Math.max(minVS, Math.min(maxVS, cfg.viewStart));

  // ── Trigger load-more when near left edge (within 20% of left boundary) ──
  const leftEdge = cfg.viewStart;
  if (leftEdge < vis * 0.2) {
    // Load older candles in background
    if (key === 'fut' && typeof fetchMoreCandlesBefore === 'function') {
      fetchMoreCandlesBefore();
    } else if (key === 'sp' && typeof fetchMoreSpCandlesBefore === 'function') {
      fetchMoreSpCandlesBefore();
    }
  }

  const s = cfg.viewStart;
  // The real candles that are in view: array indices from max(0,s) to min(total, s+vis)
  const realStart = Math.max(0, s);
  const realEnd   = Math.min(total, s + vis);
  return {
    viewStart: s,
    visCount:  vis,
    all,
    candles: all.slice(realStart, realEnd),
  };
}

// pan by delta candles (+right/−left means shift window toward newer/older)
function chartPanBy(key, delta) {
  const cfg = CHART_PANELS[key];
  const all = cfg.candlesFn();
  const total = all.length;
  if (!total) return;

  const vis = cfg.visCount;

  // Enter manual mode on first pan
  if (cfg.viewStart === null) {
    cfg.viewStart = total - vis;
  }

  // delta>0 = drag right = show older = move window LEFT in array
  // Limits: first/last candle can reach center of screen
  const minVS = -Math.floor(vis / 2);
  const maxVS = total - Math.ceil(vis / 2);
  cfg.viewStart = Math.max(minVS, Math.min(maxVS, cfg.viewStart - delta));
  cfg.drawFn();
}

// zoom around center of current view
function chartZoomBy(key, factor) {
  const cfg = CHART_PANELS[key];
  const all = cfg.candlesFn();
  const total = all.length;
  if (!total) return;

  const oldVis = cfg.visCount;
  // factor > 1 = zoom out (more candles), < 1 = zoom in (fewer candles)
  const newVis = Math.round(Math.max(cfg.minVis, Math.min(cfg.maxVis, oldVis * factor)));
  if (newVis === oldVis) return;

  // Keep view center stable
  const curStart = cfg.viewStart !== null ? cfg.viewStart : total - oldVis;
  const center = curStart + oldVis / 2;
  cfg.visCount = newVis;
  const newStart = Math.round(center - newVis / 2);
  const minVS = -Math.floor(newVis / 2);
  const maxVS = total - Math.ceil(newVis / 2);
  cfg.viewStart = Math.max(minVS, Math.min(maxVS, newStart));
  cfg.drawFn();
}

// ── Recalculate padding below scrollable area ──
function chartPanelRecalcPad(key) {
  const cfg = CHART_PANELS[key];
  const panel = document.getElementById(cfg.panelId);
  if (!panel) return;
  const ph = cfg.open ? panel.offsetHeight : 32;
  if (key === 'fut') {
    const sc = document.getElementById(cfg.scrollId);
    if (sc) sc.style.paddingBottom = (ph + 68) + 'px';
  } else {
    const pg = document.getElementById('page-trade');
    if (pg) pg.style.paddingBottom = (ph + 52) + 'px';
  }
}

// ── Toggle open/collapse ──
function _chartPanelToggle(key) {
  const cfg = CHART_PANELS[key];
  cfg.open = !cfg.open;
  const inner = document.getElementById(cfg.innerId);
  if (inner) inner.style.display = cfg.open ? '' : 'none';

  // Both panels: swap between collapsed header and toggle-in-tfbar (same UX)
  if (key === 'fut') {
    const hdrBtn     = document.getElementById('chartHdrBtn');
    const tfTitle    = document.getElementById('futTFTitle');
    const arrowOpen  = document.getElementById('chartArrOpen');
    const arrowColl  = document.getElementById('chartArr');
    if (hdrBtn)    hdrBtn.style.display  = cfg.open ? 'none' : 'flex';
    if (tfTitle)   tfTitle.style.display = cfg.open ? ''     : 'none';
    if (arrowOpen) arrowOpen.textContent = '▲';
    if (arrowColl) arrowColl.textContent = '▲';
  } else {
    // sp: same structure as fut
    const hdrBtn   = document.getElementById('spChartHdrBtn');
    const tfToggle = document.getElementById('spTFToggle');
    const arrowColl= document.getElementById('spChartArrow');
    if (hdrBtn)   hdrBtn.style.display  = cfg.open ? 'none' : 'flex';
    if (tfToggle) tfToggle.style.display = cfg.open ? ''    : 'none';
    if (arrowColl) arrowColl.textContent = '▲';
  }

  setTimeout(() => {
    chartPanelRecalcPad(key);
    if (cfg.open) cfg.drawFn();
  }, 50);
}

function toggleChart()   { _chartPanelToggle('fut'); }
function toggleSpChart() { _chartPanelToggle('sp');  }

// ── Set wrap height and redraw ──
function chartPanelSetH(key, h) {
  const cfg = CHART_PANELS[key];
  h = Math.max(cfg.minH, Math.min(cfg.maxH, h));
  cfg.wrapH = h;
  const wrap = document.getElementById(cfg.wrapId);
  if (wrap) wrap.style.height = h + 'px';
  chartPanelRecalcPad(key);
  cfg.drawFn();
}

// ── Drag-to-resize ──
function _initDragHandle(key) {
  const cfg = CHART_PANELS[key];
  const handle = document.getElementById(cfg.handleId);
  if (!handle) return;

  let startY = 0, startH = 0;

  function onMove(y) {
    const dy = startY - y;  // drag UP = increase height
    chartPanelSetH(key, startH + dy);
  }

  // Mouse
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    startY = e.clientY;
    startH = cfg.wrapH;
    handle.classList.add('dragging');
    const onMM = ev => onMove(ev.clientY);
    const onMU = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseup', onMU);
    };
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);
  });

  // Touch
  handle.addEventListener('touchstart', e => {
    e.preventDefault();
    startY = e.touches[0].clientY;
    startH = cfg.wrapH;
    handle.classList.add('dragging');
    const onTM = ev => onMove(ev.touches[0].clientY);
    const onTE = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('touchmove', onTM);
      handle.removeEventListener('touchend', onTE);
    };
    handle.addEventListener('touchmove', onTM, { passive: false });
    handle.addEventListener('touchend', onTE);
  }, { passive: false });
}

// ── Pan + Zoom on canvas ──
function _initCanvasPan(key) {
  const cfg = CHART_PANELS[key];
  const wrap = document.getElementById(cfg.wrapId);
  if (!wrap) return;

  // ── Y-axis drag on price label area (right 64px) → vertical zoom ──
  let yDragStart = 0, yDragStartPad = 0, isYDragging = false;
  let vPanStartY = 0, vPanStartOffset = 0, isVPanning = false;
  const PAD_R_W = 64;

  function _isInPriceAxis(e) {
    const rect = wrap.getBoundingClientRect();
    return (e.clientX - rect.left) > (rect.width - PAD_R_W);
  }

  wrap.addEventListener('mousedown', ev => {
    if (_isInPriceAxis(ev)) {
      ev.preventDefault();
      isYDragging = true;
      yDragStart = ev.clientY;
      yDragStartPad = cfg.yPadFactor || 0.15;
      wrap.style.cursor = 'ns-resize';
    }
  });
  document.addEventListener('mousemove', ev => {
    if (!isYDragging) return;
    const dy = yDragStart - ev.clientY; // drag up = tighter range = smaller pad
    const newPad = Math.max(0.02, Math.min(1.5, yDragStartPad + dy * 0.005));
    cfg.yPadFactor = newPad;
    cfg.drawFn();
  });
  document.addEventListener('mouseup', () => {
    if (isYDragging) { isYDragging = false; wrap.style.cursor = ''; }
  });

  // Touch Y-drag on price axis
  let yTouchStart = 0, yTouchStartPad = 0, isYTouching = false;
  wrap.addEventListener('touchstart', ev => {
    if (ev.touches.length === 1 && _isInPriceAxis(ev.touches[0])) {
      ev.preventDefault();
      isYTouching = true;
      yTouchStart = ev.touches[0].clientY;
      yTouchStartPad = cfg.yPadFactor || 0.15;
    }
  }, { passive: false });
  wrap.addEventListener('touchmove', ev => {
    if (!isYTouching || ev.touches.length !== 1) return;
    ev.preventDefault();
    const dy = yTouchStart - ev.touches[0].clientY;
    const newPad = Math.max(0.02, Math.min(1.5, yTouchStartPad + dy * 0.005));
    cfg.yPadFactor = newPad;
    cfg.drawFn();
  }, { passive: false });
  wrap.addEventListener('touchend', () => { isYTouching = false; });

  // Cursor hint on price axis hover
  wrap.addEventListener('mousemove', ev => {
    if (_isInPriceAxis(ev) && !isYDragging) {
      wrap.style.cursor = 'ns-resize';
    } else if (!isYDragging && !isPanning) {
      wrap.style.cursor = '';
    }
  });

  // ── Mouse pan ──
  let panStartX = 0, panStartViewStart = null, panStartVis = 0, isPanning = false;

  function startPan(x, y) {
    panStartX = x;
    panStartViewStart = cfg.viewStart; // may be null (auto)
    panStartVis = cfg.visCount;
    // Materialise viewStart so we can pan from current position
    if (cfg.viewStart === null) {
      const all = cfg.candlesFn();
      cfg.viewStart = all.length - cfg.visCount; // may be negative, that's fine
    }
    panStartViewStart = cfg.viewStart;
    isPanning = true;
    // Vertical pan init
    vPanStartY = y || 0;
    vPanStartOffset = cfg.yOffset || 0;
    wrap.classList.add('panning');
  }

  function movePan(x, y) {
    if (!isPanning) return;
    const wrapW = wrap.clientWidth || 300;
    const pxPerCandle = wrapW / panStartVis;
    // drag RIGHT (x > panStartX) → dx > 0 → move window toward older (lower index)
    const dx = x - panStartX;
    const dCandles = Math.round(dx / pxPerCandle);
    const all = cfg.candlesFn();
    const total = all.length;
    const vis = cfg.visCount;
    const raw = panStartViewStart - dCandles;
    const minVS = -Math.floor(vis / 2);
    const maxVS = total - Math.ceil(vis / 2);
    cfg.viewStart = Math.max(minVS, Math.min(maxVS, raw));
    // Vertical pan: drag up = positive offset (view shifts up = see lower prices)
    if (y !== undefined) {
      const wrapH = wrap.clientHeight || 200;
      const dy = (y - vPanStartY) / wrapH; // normalize to chart height
      cfg.yOffset = Math.max(-0.6, Math.min(0.6, vPanStartOffset + dy));
    }
    cfg.drawFn();
  }

  function endPan() {
    if (isPanning) { isPanning = false; wrap.classList.remove('panning'); }
  }

  wrap.addEventListener('mousedown', e => {
    const tag = e.target.tagName;
    if ((tag === 'CANVAS' || tag === 'DIV') && !_isInPriceAxis(e)) { e.preventDefault(); startPan(e.clientX, e.clientY); }
  });
  document.addEventListener('mousemove', e => { if (isPanning) movePan(e.clientX, e.clientY); });
  document.addEventListener('mouseup', endPan);

  // ── Mouse wheel zoom ──
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    // deltaY > 0 = scroll down = zoom out (more candles)
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    // Zoom around cursor X position
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const wrapW = wrap.clientWidth || 300;
    const PAD_R = 64, PAD_L = 2;
    const CW = wrapW - PAD_R - PAD_L;
    const frac = Math.max(0, Math.min(1, (mx - PAD_L) / CW));
    const all = cfg.candlesFn();
    const total = all.length;
    if (!total) return;
    const oldVis = cfg.visCount;
    const newVis = Math.round(Math.max(cfg.minVis, Math.min(cfg.maxVis, oldVis * factor)));
    if (newVis === oldVis) return;
    const curStart = cfg.viewStart !== null ? cfg.viewStart : Math.max(0, total - oldVis);
    // Keep candle under cursor at same screen position
    const centerCandle = curStart + frac * oldVis;
    cfg.visCount = newVis;
    const newStart = Math.round(centerCandle - frac * newVis);
    const minVS = -Math.floor(newVis / 2);
    const maxVS = total - Math.ceil(newVis / 2);
    cfg.viewStart = Math.max(minVS, Math.min(maxVS, newStart));
    cfg.drawFn();
  }, { passive: false });

  // ══════════════════════════════════════════════════════════
  //  TOUCH SYSTEM — Pan / Pinch-Zoom / Long-press Crosshair
  //  ┌─ 1 finger tap-and-hold (≥320ms) → crosshair mode
  //  ├─ 1 finger swipe            → pan mode
  //  └─ 2 fingers                 → pinch zoom
  // ══════════════════════════════════════════════════════════
  let lastTouchX = 0;
  let pinchStartDist = 0, pinchStartVis = 0, pinchStartViewStart = null, pinchMidX = 0;

  // Long-press state
  const LONG_PRESS_MS = 320;    // ms to hold before crosshair activates
  const PAN_THRESHOLD = 6;      // px moved before we commit to pan (cancels long-press)
  let _lpTimer = null;          // long-press setTimeout handle
  let _lpActive = false;        // true = currently in crosshair mode
  let _touchStartX = 0;
  let _touchStartY = 0;
  let _touchCommitted = false;  // true = we've decided: 'pan' or 'crosshair'
  let _touchMode = '';          // 'pan' | 'crosshair' | ''

  function _cancelLongPress() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  }

  function _enterCrosshairMode(clientX, clientY) {
    _lpActive = true;
    _touchMode = 'crosshair';
    _touchCommitted = true;
    _stopLpAnim();
    wrap.classList.add('crosshair-mode');
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(30);
    _showCrosshair(clientX, clientY);
  }

  wrap.addEventListener('touchstart', e => {
    e.preventDefault();

    if (e.touches.length === 1 && !_isInPriceAxis(e.touches[0])) {
      // ── Single finger — decide pan vs crosshair on move/hold ──
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
      _touchCommitted = false;
      _touchMode = '';
      _lpActive = false;

      // Show long-press progress ring
      const rect = wrap.getBoundingClientRect();
      const lx = e.touches[0].clientX - rect.left;
      const ly = e.touches[0].clientY - rect.top;
      _startLpAnim(lx, ly);

      // Start long-press timer → crosshair
      _lpTimer = setTimeout(() => {
        if (!_touchCommitted) {
          _enterCrosshairMode(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, LONG_PRESS_MS);

    } else if (e.touches.length === 2) {
      // ── Two fingers — pinch zoom ──
      _cancelLongPress();
      endPan();
      _hideCrosshair();
      _lpActive = false;
      _touchMode = 'pinch';
      _touchCommitted = true;

      const t0 = e.touches[0], t1 = e.touches[1];
      pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      pinchStartVis = cfg.visCount;
      const all = cfg.candlesFn();
      if (cfg.viewStart === null) cfg.viewStart = all.length - cfg.visCount;
      pinchStartViewStart = cfg.viewStart;
      const rect = wrap.getBoundingClientRect();
      pinchMidX = ((t0.clientX + t1.clientX) / 2) - rect.left;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      const dx = Math.abs(tx - _touchStartX);
      const dy = Math.abs(ty - _touchStartY);

      if (!_touchCommitted) {
        // Not committed yet — check if moved enough to commit to pan
        if (dx > PAN_THRESHOLD || dy > PAN_THRESHOLD) {
          _cancelLongPress();
          _stopLpAnim();
          _touchMode = 'pan';
          _touchCommitted = true;
          startPan(_touchStartX, _touchStartY);
        }
        // else: still waiting for long-press, don't move anything
        return;
      }

      if (_touchMode === 'pan') {
        movePan(tx, ty);
      } else if (_touchMode === 'crosshair') {
        _showCrosshair(tx, ty);
      }

    } else if (e.touches.length === 2 && _touchMode === 'pinch') {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (pinchStartDist > 0) {
        const scale = dist / pinchStartDist;
        const newVis = Math.round(Math.max(cfg.minVis, Math.min(cfg.maxVis, pinchStartVis / scale)));
        if (newVis !== cfg.visCount) {
          const all = cfg.candlesFn();
          const total = all.length;
          const wrapW = wrap.clientWidth || 300;
          const frac = Math.max(0, Math.min(1, pinchMidX / wrapW));
          const centerCandle = pinchStartViewStart + frac * pinchStartVis;
          cfg.visCount = newVis;
          const newStart = Math.round(centerCandle - frac * newVis);
          const minVS2 = -Math.floor(newVis / 2);
          const maxVS2 = total - Math.ceil(newVis / 2);
          cfg.viewStart = Math.max(minVS2, Math.min(maxVS2, newStart));
          cfg.drawFn();
        }
      }
    }
  }, { passive: false });

  let _pinchEndedAtCP = 0; // ป้องกัน double-tap reset หลัง pinch
  wrap.addEventListener('touchend', e => {
    _cancelLongPress();
    _stopLpAnim();
    if (e.touches.length < 2) {
      if (_touchMode === 'pinch') {
        _touchMode = ''; _touchCommitted = false;
        _pinchEndedAtCP = Date.now(); // บันทึกเวลาที่ pinch จบ
      }
      pinchStartDist = 0;
      pinchStartViewStart = null;
    }
    if (e.touches.length === 0) {
      endPan();
      wrap.classList.remove('crosshair-mode');
      if (_touchMode === 'crosshair') {
        // Keep crosshair visible briefly then hide
        setTimeout(_hideCrosshair, 800);
      }
      _touchMode = '';
      _touchCommitted = false;
      _lpActive = false;
    }
  });

  wrap.addEventListener('touchcancel', () => {
    _cancelLongPress();
    _stopLpAnim();
    endPan();
    _hideCrosshair();
    wrap.classList.remove('crosshair-mode');
    _touchMode = '';
    _touchCommitted = false;
    _lpActive = false;
    pinchStartDist = 0;
  });

  // ── Double-tap to reset view ──
  let lastTap = 0;
  wrap.addEventListener('touchend', e => {
    const now = Date.now();
    // บล็อกถ้า pinch เพิ่งจบ (ภายใน 500ms) เพื่อป้องกัน reset ผิดพลาด
    if (now - lastTap < 300 && _touchMode !== 'pan' && (now - _pinchEndedAtCP) > 500) {
      cfg.viewStart = null;
      cfg.visCount = 80;
      cfg.yOffset = 0;
      cfg.drawFn();
    }
    lastTap = now;
  });

  // ── Double-click to reset view (desktop) ──
  wrap.addEventListener('dblclick', () => {
    cfg.viewStart = null;
    cfg.visCount = 80;
    cfg.drawFn();
  });

  // ── Crosshair ──
  const prefix = key === 'fut' ? 'futCh' : 'spCh';
  const chVLine    = document.getElementById(prefix + 'VLine');
  const chHLine    = document.getElementById(prefix + 'HLine');
  const chPriceTag = document.getElementById(prefix + 'PriceTag');
  const chTimeTag  = document.getElementById(prefix + 'TimeTag');
  const chOhlc     = document.getElementById(prefix + 'Ohlc');
  const chO = document.getElementById(prefix + 'O');
  const chH = document.getElementById(prefix + 'H');
  const chL = document.getElementById(prefix + 'L');
  const chC = document.getElementById(prefix + 'C');
  const chV = document.getElementById(prefix + 'V');
  // Intersection dot + long-press ring + hint
  const chDot    = document.getElementById(prefix + 'Dot');
  const chLpRing = document.getElementById(prefix + 'LpRing');
  const chLpArc  = document.getElementById(prefix + 'LpArc');
  const chHint   = document.getElementById(prefix + 'Hint');

  // Long-press ring animation (circumference of r=15 circle ≈ 94.2)
  const ARC_C = 94.2;
  let _lpAnimStart = 0, _lpAnimFrame = null;

  function _startLpAnim(x, y) {
    if (chLpRing) { chLpRing.style.display = 'block'; chLpRing.style.left = x + 'px'; chLpRing.style.top = y + 'px'; }
    if (chLpArc)  chLpArc.style.strokeDasharray = '0 ' + ARC_C;
    if (chHint)   { chHint.style.display = 'block'; chHint.style.opacity = '1'; }
    _lpAnimStart = performance.now();
    function _step(now) {
      const pct = Math.min(1, (now - _lpAnimStart) / LONG_PRESS_MS);
      if (chLpArc) chLpArc.style.strokeDasharray = (pct * ARC_C) + ' ' + ARC_C;
      if (pct < 1) _lpAnimFrame = requestAnimationFrame(_step);
    }
    _lpAnimFrame = requestAnimationFrame(_step);
  }

  function _stopLpAnim() {
    if (_lpAnimFrame) { cancelAnimationFrame(_lpAnimFrame); _lpAnimFrame = null; }
    if (chLpRing) chLpRing.style.display = 'none';
    if (chHint)   { chHint.style.display = 'none'; }
  }

  // ── Candle Tooltip elements ──
  const chTooltip   = document.getElementById(prefix + 'Tooltip');
  const chTTTime    = document.getElementById(prefix + 'TTTime');
  const chTTOpen    = document.getElementById(prefix + 'TTOpen');
  const chTTHigh    = document.getElementById(prefix + 'TTHigh');
  const chTTLow     = document.getElementById(prefix + 'TTLow');
  const chTTClose   = document.getElementById(prefix + 'TTClose');
  const chTTChg     = document.getElementById(prefix + 'TTChg');
  const chTTPchg    = document.getElementById(prefix + 'TTPchg');
  const chTTRange   = document.getElementById(prefix + 'TTRange');
  const chTTVol     = document.getElementById(prefix + 'TTVol');
  const chTTTxn     = document.getElementById(prefix + 'TTTxn');

  function _fmtTxn(v) {
    // Txn approximated from volume (some feeds give count, else estimate)
    if (!v) return '—';
    if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(2) + 'K';
    return v.toFixed(2);
  }

  function _showCrosshair(clientX, clientY) {
    if (!chVLine) return;
    const rect = wrap.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const wrapW = wrap.clientWidth || 300;
    const wrapH = wrap.clientHeight || 200;
    // Get current virtual viewport
    const all = cfg.candlesFn();
    if (!all.length) return;
    const vp = chartViewSlice(key);
    const { viewStart: vs, visCount: vis } = vp;
    const realStart = Math.max(0, vs);
    const realEnd   = Math.min(all.length, vs + vis);
    const visCandles = all.slice(realStart, realEnd);
    if (!visCandles.length) return;
    // Chart geometry (must match drawChart)
    const PAD_R = 64, PAD_T = 12, PAD_B = 22, PAD_L = 2;
    const CW = wrapW - PAD_R - PAD_L;
    const CH = wrapH - PAD_T - PAD_B;
    // Snap to candle using virtual slot width
    const slotW = CW / vis;
    // slot index under cursor
    const slotUnder = Math.floor((mx - PAD_L) / slotW);
    // map to array index
    const ai = Math.round(vs + slotUnder);
    const aiClamped = Math.max(realStart, Math.min(realEnd - 1, ai));
    const c = all[aiClamped];
    if (!c) return;
    const slotIdx = aiClamped - vs;
    const cx = PAD_L + (slotIdx + 0.5) * slotW;
    // Price range from visible candles
    const cl2 = [...visCandles.map(cd => cd.c)].sort((a,b) => a-b);
    const p05 = cl2[Math.max(0, Math.floor(cl2.length * 0.05))];
    const p95 = cl2[Math.min(cl2.length-1, Math.floor(cl2.length * 0.95))];
    const spread = (p95 - p05) || p05 * 0.02 || 1;
    const pad2 = spread * 0.15;
    let minP = p05 - pad2, maxP = p95 + pad2;
    visCandles.forEach(cd => {
      const capH = Math.min(cd.h, maxP + spread * 0.5);
      const capL = Math.max(cd.l, minP - spread * 0.5);
      if (capH > maxP) maxP = capH;
      if (capL < minP) minP = capL;
    });
    const range = maxP - minP || 1;
    // Apply same yOffset shift as drawChart
    const _yOff2 = (typeof CHART_PANELS !== 'undefined' ? (CHART_PANELS.fut.yOffset || 0) : 0);
    const _minPv2 = minP + _yOff2 * range;
    const _maxPv2 = maxP + _yOff2 * range;
    const price = _maxPv2 - ((my - PAD_T) / CH) * range;
    // Position crosshair lines
    chVLine.style.display = '';
    chVLine.style.left = cx + 'px';
    chHLine.style.display = '';
    chHLine.style.top = my + 'px';
    if (chPriceTag) {
      chPriceTag.style.display = '';
      chPriceTag.style.top = my + 'px';
      chPriceTag.textContent = fmtP(price);
    }
    if (chTimeTag) {
      chTimeTag.style.display = '';
      chTimeTag.style.left = cx + 'px';
      const d = new Date(c.t);
      const ts = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      chTimeTag.textContent = ts;
    }
    // Legacy OHLC mini box (hidden — replaced by tooltip)
    if (chOhlc) chOhlc.style.display = 'none';

    // ── Candle Detail Tooltip ──
    if (chTooltip && c) {
      // Compute derived values
      const chg = c.c - c.o;
      const pchg = c.o !== 0 ? (chg / c.o) * 100 : 0;
      const rangePct = c.h !== 0 ? ((c.h - c.l) / c.h) * 100 : 0;
      const isUp = c.c >= c.o;
      const chgColor = isUp ? '#0ecb81' : '#f6465d';
      const chgSign = isUp ? '+' : '';

      // Format timestamp: MM-DD HH:mm
      const d = new Date(c.t);
      const timeStr =
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0') + ' ' +
        String(d.getHours()).padStart(2,'0') + ':' +
        String(d.getMinutes()).padStart(2,'0');

      if (chTTTime)  chTTTime.textContent = timeStr;
      if (chTTOpen)  { chTTOpen.textContent = fmtP(c.o); chTTOpen.style.color = 'var(--t1)'; }
      if (chTTHigh)  chTTHigh.textContent = fmtP(c.h);
      if (chTTLow)   chTTLow.textContent  = fmtP(c.l);
      if (chTTClose) { chTTClose.textContent = fmtP(c.c); chTTClose.style.color = chgColor; }
      if (chTTChg)   { chTTChg.textContent = chgSign + fmtP(chg); chTTChg.style.color = chgColor; }
      if (chTTPchg)  { chTTPchg.textContent = chgSign + pchg.toFixed(2) + '%'; chTTPchg.style.color = chgColor; }
      if (chTTRange) chTTRange.textContent = rangePct.toFixed(2) + '%';
      if (chTTVol)   chTTVol.textContent = _fmtVol(c.v);
      if (chTTTxn)   chTTTxn.textContent = c.txn ? _fmtTxn(c.txn) : (c.v ? _fmtTxn(c.v * 0.00157) : '—');

      // Smart positioning: show tooltip on opposite side of crosshair
      // to avoid obscuring the candle under cursor
      chTooltip.style.display = 'block';
      const ttW = chTooltip.offsetWidth  || 152;
      const ttH = chTooltip.offsetHeight || 190;
      const MARGIN = 8;
      // Horizontal: if crosshair is on left half → show tooltip on right, else on left
      let tx, ty;
      if (cx < wrapW / 2) {
        tx = cx + 14; // right of crosshair
        if (tx + ttW > wrapW - PAD_R - MARGIN) tx = cx - ttW - 6;
      } else {
        tx = cx - ttW - 14; // left of crosshair
        if (tx < PAD_L + MARGIN) tx = cx + 6;
      }
      // Vertical: stay within chart bounds
      ty = Math.max(PAD_T, Math.min(wrapH - PAD_B - ttH - MARGIN, my - ttH / 2));
      chTooltip.style.left = tx + 'px';
      chTooltip.style.top  = ty + 'px';
    }

    // ── Intersection dot at crosshair center ──
    // Snap dot to close price Y of the hovered candle for clarity
    if (chDot) {
      const dotY = PAD_T + (1 - (c.c - _minPv2) / range) * CH;
      chDot.style.display = 'block';
      chDot.style.left = cx + 'px';
      chDot.style.top  = dotY + 'px';
      // Pulse once when first shown
      chDot.classList.remove('pulse');
      void chDot.offsetWidth; // reflow to restart animation
      chDot.classList.add('pulse');
    }
  }

  function _hideCrosshair() {
    if (!chVLine) return;
    [chVLine, chHLine, chPriceTag, chTimeTag, chOhlc].forEach(el => { if (el) el.style.display = 'none'; });
    if (chTooltip) chTooltip.style.display = 'none';
    if (chDot) chDot.style.display = 'none';
  }

  wrap.addEventListener('mousemove', e => {
    if (isPanning) { _hideCrosshair(); return; }
    _showCrosshair(e.clientX, e.clientY);
  });
  wrap.addEventListener('mouseleave', _hideCrosshair);

  // Touch crosshair is handled in the unified touchmove listener above (_touchMode === 'crosshair')
  wrap.addEventListener('touchend', _hideCrosshair);
}

// ── Reset view to live (latest) ──
function chartResetView(key) {
  const cfg = CHART_PANELS[key];
  cfg.viewStart = null;
  cfg.visCount  = 80;
  cfg.drawFn();
  _chartUpdateLiveTag(key);
}

// ── Show/hide LIVE badge ──
function _chartUpdateLiveTag(key) {
  const cfg = CHART_PANELS[key];
  const tagId = key === 'fut' ? 'futLiveTag' : 'spLiveTag';
  const isManual = cfg.viewStart !== null;
  // update all elements with this id (fut has two: in header and in tf-bar title)
  document.querySelectorAll('#' + tagId).forEach(tag => {
    tag.style.display = isManual ? '' : 'none';
  });
}

// Patch drawFn to also update live tag after each draw
(function() {
  const origFut = CHART_PANELS.fut.drawFn;
  CHART_PANELS.fut.drawFn = () => { origFut(); _chartUpdateLiveTag('fut'); };
  const origSp = CHART_PANELS.sp.drawFn;
  CHART_PANELS.sp.drawFn = () => { origSp(); _chartUpdateLiveTag('sp'); };
})();

// ── Init both panels after DOM ready ──
function initChartPanels() {
  // Set initial wrap heights from CSS default
  ['fut','sp'].forEach(key => {
    const cfg = CHART_PANELS[key];
    const wrap = document.getElementById(cfg.wrapId);
    if (wrap) wrap.style.height = cfg.wrapH + 'px';
    _initDragHandle(key);
    _initCanvasPan(key);
    chartPanelRecalcPad(key);
  });
}

function filterMarket() { renderMarket(); }
function setMktCat(el) {
  document.querySelectorAll('.mct').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  const cat = el.textContent;
  // Show/hide sub-tabs based on category
  const subTabsEl = document.querySelector('.mkt-sub-tabs');
  if (subTabsEl) subTabsEl.style.display = (cat === 'Favorites') ? 'none' : '';
  // If switching to Favorites, load data first if not loaded
  if (cat === 'Favorites' && !mktLoaded) {
    loadMarketData();
    return;
  }
  renderMarket();
}
function setMktSub(el, sub) {
  document.querySelectorAll('.mst').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  mktSub = sub;
  renderMarket();
}
function sortMkt(field) {
  if (mktSort.field === field) mktSort.dir *= -1; else { mktSort.field = field; mktSort.dir = -1; }
  renderMarket();
}
function openFromMkt(coin, sub) {
  if (sub === 'spot') {
    selectSpotCoin(coin, 'USDT');
    navTo('trade');
  } else {
    selectCoin(coin + 'USDT');
    navTo('futures');
  }
}

// ═══════════════════════════════════════════════
//  SPOT TRADE PAGE
// ═══════════════════════════════════════════════
const SP = {
  coin: 'ETH', side: 'buy', ot: 'Market', tf: '15m',
  asks: [], bids: [], candles: [], mark: 0, prevMark: 0
};
let spCtx = null;

// [Y-07 FIX] Lazy Loading for spot chart: only fetch candles when chart area is visible
let _spChartObserver = null;
let _spCandleLoaded = false;

function _initSpChartLazyLoad() {
  const chartArea = document.getElementById('spChartArea');
  if (!chartArea || _spChartObserver) return;
  if (!('IntersectionObserver' in window)) {
    // Fallback: load immediately if IntersectionObserver not supported
    fetchSpCandles(SP.tf);
    return;
  }
  _spChartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !_spCandleLoaded) {
        _spCandleLoaded = true;
        fetchSpCandles(SP.tf);
      }
    });
  }, { threshold: 0.1 });
  _spChartObserver.observe(chartArea);
}

async function loadSpotData() {
  if (!spCtx) {
    const spCanvas = document.getElementById('spCanvas');
    if (spCanvas) spCtx = spCanvas.getContext('2d');
  }
  await fetchSpOB();
  // [Y-07 FIX] Only load candles if chart is visible; otherwise defer via lazy loader
  const chartArea = document.getElementById('spChartArea');
  const isVisible = chartArea && chartArea.offsetParent !== null &&
    chartArea.style.display !== 'none' &&
    getComputedStyle(chartArea).visibility !== 'hidden';
  if (isVisible) {
    _spCandleLoaded = true;
    await fetchSpCandles(SP.tf);
  } else {
    _spCandleLoaded = false;
    _initSpChartLazyLoad();
  }
}

async function fetchSpOB() {
  try {
    const d = await hlPost({ type: 'l2Book', coin: SP.coin });
    if (d?.levels) {
      SP.asks = d.levels[0].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)})).reverse();
      SP.bids = d.levels[1].slice(0,11).map(x=>({p:parseFloat(x.px),s:parseFloat(x.sz)}));
      if (SP.asks.length && SP.bids.length) {
        SP.prevMark = SP.mark;
        SP.mark = (SP.asks[SP.asks.length-1].p + SP.bids[0].p) / 2;
      }
      renderSpOB();
    }
  } catch(e) {}
}

function renderSpOB() {
  // Fix 1: separate maxAsk / maxBid — each side normalizes independently
  const maxAsk = Math.max(...SP.asks.map(a=>a.s), 0.001);
  const maxBid = Math.max(...SP.bids.map(b=>b.s), 0.001);
  const aEl = document.getElementById('spAskList');
  const bEl = document.getElementById('spBidList');
  if (aEl) aEl.innerHTML = SP.asks.map(a => {
    const pct = Math.min(100, a.s/maxAsk*100);
    return `<div class="sp-ob-row-bn" onclick="spClickPrice(${a.p})"><div class="sp-ob-bar-bn ask" style="width:${pct}%"></div><span class="sp-ob-p-bn ask">${fmtP(a.p)}</span><span class="sp-ob-a-bn">${a.s.toFixed(3)}</span></div>`;
  }).join('');
  if (bEl) bEl.innerHTML = SP.bids.map(b => {
    const pct = Math.min(100, b.s/maxBid*100);
    return `<div class="sp-ob-row-bn" onclick="spClickPrice(${b.p})"><div class="sp-ob-bar-bn bid" style="width:${pct}%"></div><span class="sp-ob-p-bn bid">${fmtP(b.p)}</span><span class="sp-ob-a-bn">${b.s.toFixed(3)}</span></div>`;
  }).join('');
  const mid = document.getElementById('spMidP');
  if (mid && SP.mark) { mid.textContent = fmtP(SP.mark); mid.className = 'sp-ob-mid-p ' + (SP.mark >= SP.prevMark ? 'up' : 'dn'); }
  const usd = document.getElementById('spMidUsd'); if (usd && SP.mark) usd.textContent = '≈ $' + fmtP(SP.mark);
  // ratio
  const tb = SP.bids.reduce((s,b)=>s+b.s*b.p,0), ta = SP.asks.reduce((s,a)=>s+a.s*a.p,0), tt = tb+ta;
  const bp = tt > 0 ? tb/tt*100 : 50;
  const rf=document.getElementById('spRF'); if(rf) rf.style.width=bp.toFixed(2)+'%';
  const lr=document.getElementById('spLR'); if(lr) lr.textContent=bp.toFixed(2)+'%';
  const sr=document.getElementById('spSR'); if(sr) sr.textContent=(100-bp).toFixed(2)+'%';
  // update top bar
  if (SP.mark && SP.candles.length) {
    const base = SP.candles[0].c;
    const chg = base ? (SP.mark - base) / base * 100 : 0;
    const chgStr = (chg>=0?'+':'') + chg.toFixed(2) + '%';
    const cls = 'tb-chg ' + (chg>=0?'up':'dn');
    const e1=document.getElementById('spotChg'); if(e1){e1.textContent=chgStr;e1.className=cls;}
    const e2=document.getElementById('spChartChg'); if(e2){e2.textContent=chgStr;e2.className=cls;}
    const mktd=document.getElementById('spMktDisp'); if(mktd) mktd.textContent=fmtP(SP.mark);
    const tag=document.getElementById('spCurTag'); if(tag) tag.textContent=fmtP(SP.mark);
    // Update holdings futures price
    const fPrice=document.getElementById('spFuturesPrice'); if(fPrice) fPrice.textContent=fmtP(SP.mark);
  }
}

async function fetchSpCandles(tf) {
  showSpLoading(true);
  try {
    const interval = _candleInterval(tf);
    const ms = _candleMs(interval);
    const now = Date.now();
    const d = await hlPost({ type:'candleSnapshot', req:{ coin:SP.coin, interval, startTime:now - ms * CANDLE_BATCH, endTime:now } });
    if (d?.length) {
      const raw = _parseCandles(d);
      if (raw.length) {
        // outlier filter (keep original median filter for spot)
        const closes=[...raw.map(c=>c.c)].sort((a,b)=>a-b);
        const med=closes[Math.floor(closes.length/2)];
        const clean=raw.filter(c=>Math.abs(c.h-med)/med<.30&&Math.abs(c.l-med)/med<.30);
        SP.candles = (clean.length?clean:raw).slice(-CANDLE_BATCH);
        SP._candleTf       = tf;
        SP._candleInterval = interval;
        SP._candleMs       = ms;
        SP._loadingMore    = false;
        CHART_PANELS.sp.viewStart = null;
        drawSpChart();
        if (typeof startSpCountdown === 'function') startSpCountdown();
      }
    }
  } catch(e) {}
  showSpLoading(false);
}

async function fetchMoreSpCandlesBefore() {
  if (SP._loadingMore) return;
  if (!SP.candles.length) return;
  SP._loadingMore = true;
  try {
    const interval = SP._candleInterval || _candleInterval(SP.tf);
    const ms       = SP._candleMs      || _candleMs(interval);
    const endTime  = SP.candles[0].t - 1;
    const startTime = endTime - ms * CANDLE_BATCH;
    const d = await hlPost({ type:'candleSnapshot', req:{ coin:SP.coin, interval, startTime, endTime } });
    const older = _parseCandles(d);
    if (older.length) {
      const merged = [...older, ...SP.candles];
      const seen = new Set();
      const deduped = merged.filter(c => { if (seen.has(c.t)) return false; seen.add(c.t); return true; });
      deduped.sort((a, b) => a.t - b.t);
      SP.candles = deduped.slice(-CANDLE_MAX);
      if (CHART_PANELS.sp.viewStart !== null) CHART_PANELS.sp.viewStart += older.length;
      drawSpChart();
    }
  } catch(e) { console.warn('fetchMoreSpCandlesBefore error:', e); }
  SP._loadingMore = false;
}

function drawSpChart() {
  if (!spCtx || !SP.candles.length) return;
  const canvas = document.getElementById('spCanvas');
  if (!canvas) return;
  // Pan/Zoom via unified CHART_PANELS viewStart/visCount (virtual viewport)
  const vp = (typeof chartViewSlice !== 'undefined')
    ? chartViewSlice('sp')
    : { viewStart: SP.candles.length - 80, visCount: 80, all: SP.candles, candles: SP.candles.slice(-80) };
  const { viewStart: vs, visCount: vis, all } = vp;
  if (!all.length) return;

  const dpr=window.devicePixelRatio||1, wrap=canvas.parentElement;
  const W=wrap.clientWidth||300, H=wrap.clientHeight||240;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  spCtx.setTransform(1,0,0,1,0,0); spCtx.scale(dpr,dpr);
  const PAD_R=64,PAD_T=12,PAD_B=22,PAD_L=2,CW=W-PAD_R-PAD_L,CH=H-PAD_T-PAD_B;
  spCtx.fillStyle='#0b0e11'; spCtx.fillRect(0,0,W,H);

  // ── Watermark Logo (spot chart) ──
  if (typeof _chartLogoReady !== 'undefined' && _chartLogoReady && _chartLogoImg.complete) {
    const logoSize = Math.min(W, H) * 0.48;
    const logoX = W / 2 - logoSize / 2;
    const logoY = H / 2 - logoSize / 2;
    spCtx.save();
    const glow = spCtx.createRadialGradient(W/2,H/2,logoSize*0.1,W/2,H/2,logoSize*0.62);
    glow.addColorStop(0,'rgba(212,168,84,0.07)'); glow.addColorStop(0.5,'rgba(180,140,60,0.03)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    spCtx.fillStyle=glow; spCtx.beginPath(); spCtx.arc(W/2,H/2,logoSize*0.62,0,Math.PI*2); spCtx.fill();
    spCtx.globalAlpha=0.055; spCtx.filter='blur(0.5px)';
    spCtx.drawImage(_chartLogoImg,logoX,logoY,logoSize,logoSize);
    spCtx.filter='none'; spCtx.globalAlpha=0.07;
    spCtx.drawImage(_chartLogoImg,logoX,logoY,logoSize,logoSize);
    // Trader Cafe Club text below logo
    spCtx.globalAlpha = 0.10;
    spCtx.font = `bold ${Math.round(logoSize * 0.135)}px Georgia, 'Times New Roman', serif`;
    spCtx.textAlign = 'center';
    spCtx.fillStyle = '#d4a854';
    spCtx.letterSpacing = `${Math.round(logoSize * 0.025)}px`;
    spCtx.fillText('Trader Cafe Club', W / 2, logoY + logoSize + logoSize * 0.22);
    spCtx.letterSpacing = '0px';
    spCtx.restore();
  }
  const realStart=Math.max(0,vs), realEnd=Math.min(all.length,vs+vis);
  const visCandles=all.slice(realStart,realEnd);
  if(!visCandles.length) return;

  const cl=[...visCandles.map(c=>c.c)].sort((a,b)=>a-b);
  const p05=cl[Math.max(0,Math.floor(cl.length*.05))],p95=cl[Math.min(cl.length-1,Math.floor(cl.length*.95))];
  const sp2=(p95-p05)||p05*.02||1;
  const yPadSp=(typeof CHART_PANELS!=='undefined'?(CHART_PANELS.sp.yPadFactor||0.15):0.15);
  const pad=sp2*yPadSp;
  let minP=p05-pad,maxP=p95+pad;
  visCandles.forEach(c=>{const cH=Math.min(c.h,maxP+sp2*.5),cL=Math.max(c.l,minP-sp2*.5);if(cH>maxP)maxP=cH;if(cL<minP)minP=cL;});
  const range=maxP-minP||1,scY=p=>PAD_T+(1-(Math.max(minP,Math.min(maxP,p))-minP)/range)*CH;

  // slot width based on visCount (virtual)
  const slotW=CW/vis;

  spCtx.font='9px Roboto Mono,monospace'; spCtx.textAlign='right';
  const _spGridLevels = _niceGridLevels(minP, maxP, 5);
  _spGridLevels.forEach(price => {
    if (price < minP || price > maxP) return;
    const y = scY(price);
    spCtx.strokeStyle='rgba(43,49,57,.6)'; spCtx.lineWidth=.5;
    spCtx.beginPath(); spCtx.moveTo(PAD_L,y); spCtx.lineTo(W-PAD_R,y); spCtx.stroke();
    spCtx.fillStyle='#848e9c'; spCtx.fillText(fmtP(price),W-2,y+3);
  });

  // MA lines — map array index to slot position
  ['#f0a500','#e040fb','#26c6da'].forEach((col,idx)=>{
    const period=[7,25,99][idx];
    spCtx.beginPath();spCtx.strokeStyle=col;spCtx.lineWidth=[1.5,1.2,1][idx];spCtx.lineJoin='round';
    let started=false;
    for(let ai=realStart;ai<realEnd;ai++){
      const sl=all.slice(Math.max(0,ai-period+1),ai+1);
      const ma=sl.reduce((s,c)=>s+c.c,0)/sl.length;
      const x=PAD_L+(ai-vs+0.5)*slotW;
      if(!started){spCtx.moveTo(x,scY(ma));started=true;}else{spCtx.lineTo(x,scY(ma));}
    }
    spCtx.stroke();
    const lbl=document.getElementById(['spma7','spma25','spma99'][idx]);
    if(lbl){
      const lastI=realEnd-1;
      const sl=all.slice(Math.max(0,lastI-period+1),lastI+1);
      lbl.textContent=' '+fmtP(sl.reduce((s,c)=>s+c.c,0)/sl.length);
    }
  });

  // Candles — virtual slot positions
  const bw=Math.max(1.5,Math.min(slotW*.65,10)),ww=Math.max(.5,bw*.12);
  for(let ai=realStart;ai<realEnd;ai++){
    const c=all[ai];
    const cx=PAD_L+(ai-vs+0.5)*slotW,isUp=c.c>=c.o,col=isUp?'#0ecb81':'#f6465d';
    spCtx.strokeStyle=col;spCtx.lineWidth=ww;
    spCtx.beginPath();spCtx.moveTo(cx,scY(c.h));spCtx.lineTo(cx,scY(c.l));spCtx.stroke();
    const yT=Math.min(scY(c.o),scY(c.c)),yH=Math.max(1.5,Math.abs(scY(c.c)-scY(c.o)));
    spCtx.fillStyle=col;spCtx.fillRect(cx-bw/2,yT,bw,yH);
  }

  const lc=all[all.length-1];
  const curP=SP.mark>0&&Math.abs(SP.mark-lc.c)/lc.c<.15?SP.mark:lc.c;
  const cy=scY(curP);
  spCtx.save();spCtx.strokeStyle='rgba(240,185,11,.5)';spCtx.lineWidth=.8;spCtx.setLineDash([4,3]);
  spCtx.beginPath();spCtx.moveTo(PAD_L,cy);spCtx.lineTo(W-PAD_R,cy);spCtx.stroke();spCtx.restore();
  const line=document.getElementById('spCurLine');if(line)line.style.top=cy+'px';
  const tag=document.getElementById('spCurTag');if(tag){tag.style.top=cy+'px';tag.textContent=fmtP(curP);}

  const tRow=document.getElementById('spTimeRow');
  if(tRow&&visCandles.length>=2){
    const ft=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
    tRow.innerHTML=`<span class="ct-lbl">${ft(visCandles[0].t)}</span><span class="ct-lbl">${ft(visCandles[visCandles.length-1].t)}</span>`;
  }
  // Draw spot volume histogram in sync
  drawSpVolume(all, vs, vis);
}

// ══════════════════════════════════════════════════════════════
//  VOLUME HISTOGRAM — Spot Chart
// ══════════════════════════════════════════════════════════════
function drawSpVolume(all, vs, vis) {
  const volCanvas = document.getElementById('spVolCanvas');
  if (!volCanvas) return;
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

  const PAD_R = 64, PAD_L = 2;
  const CW = W - PAD_R - PAD_L;
  const PAD_T = 3, PAD_B = 3;
  const CH = H - PAD_T - PAD_B;

  const realStart = Math.max(0, vs);
  const realEnd   = Math.min(all.length, vs + vis);
  const visCandles = all.slice(realStart, realEnd);
  if (!visCandles.length) return;

  const vols = visCandles.map(c => c.v || 0);
  const maxVol = Math.max(...vols, 1);
  const slotW = CW / vis;
  const barW  = Math.max(1, slotW * 0.65);

  // MA-vol line (5-bar avg)
  const maVol5 = [];
  for (let ai = realStart; ai < realEnd; ai++) {
    const sl = all.slice(Math.max(0, ai - 4), ai + 1);
    maVol5.push(sl.reduce((s, c) => s + (c.v || 0), 0) / sl.length);
  }
  vc.beginPath();
  vc.strokeStyle = 'rgba(240,185,11,0.35)';
  vc.lineWidth = 1;
  maVol5.forEach((mv, i) => {
    const x = PAD_L + ((realStart - vs + i) + 0.5) * slotW;
    const y = PAD_T + (1 - mv / maxVol) * CH;
    i === 0 ? vc.moveTo(x, y) : vc.lineTo(x, y);
  });
  vc.stroke();

  // Bars
  for (let ai = realStart; ai < realEnd; ai++) {
    const c = all[ai];
    const vol = c.v || 0;
    const slotIdx = ai - vs;
    const cx = PAD_L + (slotIdx + 0.5) * slotW;
    const barH = Math.max(1, (vol / maxVol) * CH);
    const isUp = c.c >= c.o;
    vc.fillStyle = isUp ? 'rgba(14,203,129,0.55)' : 'rgba(246,70,93,0.55)';
    vc.fillRect(cx - barW / 2, PAD_T + CH - barH, barW, barH);
  }

  vc.font = '8px Roboto Mono, monospace';
  vc.fillStyle = 'rgba(132,142,156,0.6)';
  vc.textAlign = 'left';
  vc.fillText('VOL', PAD_L + 2, PAD_T + 9);
  vc.textAlign = 'right';
  vc.fillStyle = 'rgba(132,142,156,0.5)';
  vc.fillText(_fmtVol(maxVol), W - 2, PAD_T + 9);
}

function showSpLoading(show) {
  let el=document.getElementById('spLoading');
  if(!el){el=document.createElement('div');el.id='spLoading';el.style.cssText='position:absolute;inset:0;background:rgba(11,14,17,.8);display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none;transition:opacity .2s';el.innerHTML='<div style="width:18px;height:18px;border:2px solid #363c46;border-top-color:#f0b90b;border-radius:50%;animation:spin2 .7s linear infinite"></div>';const w=document.getElementById('spCanvas')?.parentElement;if(w)w.appendChild(el);}
  el.style.opacity=show?'1':'0';el.style.pointerEvents=show?'all':'none';
}

// Spot controls
function setSpSide(s) {
  SP.side=s;
  document.getElementById('spBuyBtn').className='sp-bs-btn buy'+(s==='buy'?' active':'');
  document.getElementById('spSellBtn').className='sp-bs-btn sell'+(s==='sell'?' active':'');
  const btn=document.getElementById('spTradeBtn');
  btn.className='sp-action-btn '+(s==='buy'?'buy':'sell');
  btn.textContent=(s==='buy'?'Buy ':'Sell ')+SP.coin;
  // [SPOT-FIX] refresh Avbl/MaxBuy/Fee เมื่อสลับ Buy↔Sell
  if (typeof _spUpdateAvbl === 'function') _spUpdateAvbl();
}

const SP_OTS = ['Market','Limit','Stop Limit','Stop Market'];
let spOtIdx = 0;
function cycleSpOT() {
  spOtIdx=(spOtIdx+1)%SP_OTS.length; SP.ot=SP_OTS[spOtIdx];
  document.getElementById('spOT').textContent=SP.ot;
  const isM=SP.ot==='Market';
  document.getElementById('spPriceRow').style.display=isM?'none':'';
  document.getElementById('spMktRow').style.display=isM?'':'none';
}

function onSpSlider(el){
  const v=parseInt(el.value);
  el.style.setProperty('--pct',v+'%');
  if(SP.mark>0){
    // [SPOT-FIX] คำนวณจาก Avbl จริง ไม่ hardcode 1000
    let avblUsdt;
    if(SP.side==='sell'){
      const coinBal=(spotWallet[SP.coin]&&spotWallet[SP.coin].bal)||0;
      avblUsdt=coinBal*SP.mark;
    } else {
      avblUsdt=mainWalletBalance||0;
    }
    const tot=(v/100)*avblUsdt;
    document.getElementById('spTotalInp').value=tot.toFixed(2);
    spCalc();
  }
}
function setSpSlider(v){const sl=document.getElementById('spSlider');sl.value=v;sl.style.setProperty('--pct',v+'%');onSpSlider(sl);}
function spCalc(){const price=parseFloat(document.getElementById('spPriceInp')?.value)||SP.mark;const tot=parseFloat(document.getElementById('spTotalInp')?.value)||0;if(price>0&&tot>0){const amt=tot/price;const mb=document.getElementById('spMaxBuy');if(mb)mb.textContent=amt.toFixed(4)+' '+SP.coin;const fee=document.getElementById('spFee');if(fee)fee.textContent=(amt*.001).toFixed(5)+' '+SP.coin;}_spUpdateAvbl();}
// [SPOT-FIX] _spUpdateAvbl — อัปเดต Avbl/MaxBuy/Fee ตาม side+coin ปัจจุบัน
function _spUpdateAvbl() {
  const avblEl = document.getElementById('spAvbl');
  const mbEl   = document.getElementById('spMaxBuy');
  const feeEl  = document.getElementById('spFee');
  if (!avblEl) return;
  const price  = SP.mark || 0;
  if (SP.side === 'buy') {
    // Avbl = USDT ใน mainWallet
    const usdt = mainWalletBalance || 0;
    avblEl.innerHTML = usdt.toFixed(2) + ' USDT <span style="color:var(--y);cursor:pointer">＋</span>';
    // Max Buy = USDT / price
    if (mbEl) mbEl.textContent = (price > 0 ? (usdt / price).toFixed(4) : '0') + ' ' + SP.coin;
    if (feeEl) feeEl.textContent = (price > 0 ? (usdt / price * 0.001).toFixed(5) : '0.00000') + ' ' + SP.coin;
  } else {
    // Avbl = ยอด coin ใน spotWallet
    const coinBal = (spotWallet[SP.coin] && spotWallet[SP.coin].bal) || 0;
    avblEl.innerHTML = coinBal.toFixed(6) + ' ' + SP.coin + ' <span style="color:var(--y);cursor:pointer">＋</span>';
    // Max Sell = coin balance
    if (mbEl) mbEl.textContent = coinBal.toFixed(6) + ' ' + SP.coin;
    if (feeEl) feeEl.textContent = (coinBal * 0.001).toFixed(8) + ' ' + SP.coin;
  }
}
function toggleSpSlippage(){document.getElementById('spSlipChk').classList.toggle('on');}
function spClickPrice(p){const inp=document.getElementById('spPriceInp');if(inp){inp.value=p.toFixed(2);spCalc();}}
function setSpTF(el,tf){document.querySelectorAll('#spTFBar .tf-label').forEach(b=>b.classList.remove('active'));el.classList.add('active');SP.tf=tf;if(typeof CHART_PANELS!=='undefined'){CHART_PANELS.sp.viewStart=null;CHART_PANELS.sp.visCount=80;}_spCandleLoaded=true;fetchSpCandles(tf);}
// ── Spot Coin Search Overlay ──
let spotCoinData = []; // [{coin, price, chg24h, bg, color}]
let spotCoinTab = 'all';

// Coin bg/text color map for icons (extends existing COIN_COLORS)
const COIN_ICON_STYLE = {
  BTC:{bg:'#f7931a',color:'#fff'}, ETH:{bg:'#627eea',color:'#fff'},
  SOL:{bg:'#9945ff',color:'#fff'}, BNB:{bg:'#f0b90b',color:'#000'},
  XRP:{bg:'#00aae4',color:'#fff'}, DOGE:{bg:'#c2a633',color:'#fff'},
  AVAX:{bg:'#e84142',color:'#fff'}, MATIC:{bg:'#8247e5',color:'#fff'},
  DOT:{bg:'#e6007a',color:'#fff'}, LINK:{bg:'#2a5ada',color:'#fff'},
  UNI:{bg:'#ff007a',color:'#fff'}, ARB:{bg:'#12aaff',color:'#fff'},
  OP:{bg:'#ff0420',color:'#fff'}, SUI:{bg:'#6fbcf0',color:'#000'},
  APT:{bg:'#00d4a3',color:'#fff'}, INJ:{bg:'#00b0f0',color:'#fff'},
  TIA:{bg:'#8b5cf6',color:'#fff'}, WIF:{bg:'#ff9900',color:'#000'},
  BONK:{bg:'#ff6b35',color:'#fff'}, PEPE:{bg:'#2a9d2a',color:'#fff'},
  LTC:{bg:'#bebebe',color:'#000'}, ATOM:{bg:'#2e3148',color:'#fff'},
  JUP:{bg:'#19c37d',color:'#fff'}, HYPE:{bg:'#00b4d8',color:'#fff'},
};

function coinStyle(coin) {
  return COIN_ICON_STYLE[coin] || { bg: COIN_COLORS[coin] || '#363c46', color: '#eaecef' };
}

async function openSpotCoinSearch() {
  const overlay = document.getElementById('spot-coin-search-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.getElementById('spot-coin-search-inp').value = '';
  // Load data if needed
  if (!spotCoinData.length) await loadSpotCoinData();
  else renderSpotCoinList('');
  setTimeout(() => document.getElementById('spot-coin-search-inp').focus(), 100);
}

function closeSpotCoinSearch() {
  const overlay = document.getElementById('spot-coin-search-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function loadSpotCoinData() {
  try {
    const listEl = document.getElementById('spot-coin-list');
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--t2);font-size:13px"><span data-i18n="loading_data">${tccT('loading_data')}</span></div>`;
    // Fetch allMids + meta concurrently
    const [mids, meta] = await Promise.all([
      hlPost({ type: 'allMids' }),
      hlPost({ type: 'metaAndAssetCtxs' })
    ]);
    S.coinPrices = mids;
    // Build coin list from meta
    const coins = meta[0]?.universe || [];
    const ctxs = meta[1] || [];
    spotCoinData = coins.map((c, i) => {
      const ctx = ctxs[i] || {};
      const price = parseFloat(mids[c.name]) || 0;
      const prevDay = parseFloat(ctx.prevDayPx) || price;
      const chg = prevDay > 0 ? (price - prevDay) / prevDay * 100 : 0;
      return { coin: c.name, price, chg24h: chg, vol: parseFloat(ctx.dayNtlVlm) || 0 };
    }).filter(c => c.price > 0);
    renderSpotCoinList('');
  } catch(e) {
    const listEl = document.getElementById('spot-coin-list');
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--r);font-size:13px"><span data-i18n="load_fail">${tccT('load_fail')}</span></div>`;
  }
}

function setSpotCoinTab(el, tab) {
  document.querySelectorAll('.scs-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  spotCoinTab = tab;
  filterSpotCoins(document.getElementById('spot-coin-search-inp')?.value || '');
}

function filterSpotCoins(q) {
  renderSpotCoinList(q.toLowerCase().trim());
}

function renderSpotCoinList(q) {
  const listEl = document.getElementById('spot-coin-list');
  if (!listEl || !spotCoinData.length) return;
  let data = [...spotCoinData];
  // Tab filter
  if (spotCoinTab === 'top') data = data.sort((a,b) => b.vol - a.vol).slice(0, 30);
  else if (spotCoinTab === 'gainers') data = data.filter(c => c.chg24h > 0).sort((a,b) => b.chg24h - a.chg24h).slice(0, 30);
  else if (spotCoinTab === 'losers') data = data.filter(c => c.chg24h < 0).sort((a,b) => a.chg24h - b.chg24h).slice(0, 30);
  else data = data.sort((a,b) => b.vol - a.vol); // all: sort by volume
  // Search filter
  if (q) data = data.filter(c => c.coin.toLowerCase().includes(q));
  if (!data.length) { listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--t2);font-size:13px"><span data-i18n="no_coin_search">${tccT('no_coin_search')}</span></div>`; return; }
  const limit = q ? data : data.slice(0, 80);
  listEl.innerHTML = limit.map(c => {
    const st = coinStyle(c.coin);
    const chgCls = c.chg24h >= 0 ? 'up' : 'dn';
    const chgStr = (c.chg24h >= 0 ? '+' : '') + c.chg24h.toFixed(2) + '%';
    const priceStr = c.price >= 1000 ? c.price.toLocaleString('en', {maximumFractionDigits:2}) : c.price >= 1 ? c.price.toFixed(3) : c.price.toFixed(6);
    return `<div class="scs-coin-row" onclick="selectSpotCoin('${c.coin}','USDT');closeSpotCoinSearch()">
      <div class="scs-coin-icon" style="background:${st.bg};color:${st.color}">${c.coin.charAt(0)}</div>
      <div style="flex:1;min-width:0">
        <div class="scs-coin-name">${c.coin}</div>
        <div class="scs-coin-sub">${c.coin}/USDT</div>
      </div>
      <div>
        <div class="scs-coin-price">${priceStr}</div>
        <div class="scs-coin-chg ${chgCls}">${chgStr}</div>
      </div>
    </div>`;
  }).join('');
}

function selectSpotCoin(coin, quote) {
  SP.coin = coin;
  const sym = coin + '/' + quote;
  const e1 = document.getElementById('spotSym'); if (e1) e1.textContent = sym;
  const e2b = document.getElementById('spChartSymDetail'); if (e2b) e2b.textContent = sym;
  const e3 = document.getElementById('spObUnit'); if (e3) e3.textContent = '(' + coin + ')';
  const btn = document.getElementById('spTradeBtn'); if (btn) btn.textContent = (SP.side === 'buy' ? 'Buy ' : 'Sell ') + coin;
  // Update holdings tab futures reference
  const fpair = document.getElementById('spFuturesSym'); if (fpair) fpair.textContent = coin + 'USDT';
  const hpair = document.getElementById('spHoldPair'); if (hpair) hpair.textContent = coin + '/' + quote + ' Spot';
  // [SPOT-FIX] reset MaxBuy/Fee ทันทีเมื่อสลับ coin ป้องกันแสดงข้อมูลเหรียญเก่า
  const mbEl  = document.getElementById('spMaxBuy'); if (mbEl)  mbEl.textContent  = '-- ' + coin;
  const feeEl = document.getElementById('spFee');    if (feeEl) feeEl.textContent = '-- ' + coin;
  SP.mark = 0; SP.asks = []; SP.bids = []; SP.candles = [];
  if (typeof CHART_PANELS !== 'undefined') { CHART_PANELS.sp.viewStart = null; CHART_PANELS.sp.visCount = 80; }
  // Use cached price if available
  const cached = S.coinPrices?.[coin];
  if (cached) {
    SP.mark = parseFloat(cached);
    const mktd = document.getElementById('spMktDisp'); if (mktd) mktd.textContent = fmtP(SP.mark);
    const fPrice = document.getElementById('spFuturesPrice'); if (fPrice) fPrice.textContent = fmtP(SP.mark);
  }
  // [SPOT-FIX] refresh Avbl/MaxBuy/Fee ด้วยข้อมูล coin ใหม่ทันที
  if (typeof _spUpdateAvbl === 'function') _spUpdateAvbl();
  if (currentPage === 'trade') { fetchSpOB(); fetchSpCandles(SP.tf); }
}

function placeSpot(){
  const tot = parseFloat(document.getElementById('spTotalInp')?.value) || 0;
  const priceInp = parseFloat(document.getElementById('spPriceInp')?.value) || 0;
  const execPrice = (SP.ot === 'Market') ? SP.mark : (priceInp > 0 ? priceInp : SP.mark);

  if (!tot || tot <= 0) { showToast(tccT('toast_enter_total')); return; }
  if (!execPrice || execPrice <= 0) { showToast(tccT('toast_no_price_fetch')); return; }

  const qty = tot / execPrice;
  const fee = +(qty * execPrice * 0.001).toFixed(6); // 0.1% taker fee
  const col = SP.side === 'buy' ? '🟢' : '🔴';

  // [SPOT-FIX-BAL] ตรวจยอดก่อนเทรด (client-side guard)
  if (SP.side === 'buy') {
    if (mainWalletBalance < tot + fee) { showToast(tccT('toast_usdt_insufficient')); return; }
  } else {
    const coinBal = (spotWallet[SP.coin] && spotWallet[SP.coin].bal) || 0;
    if (coinBal < qty) { showToast(tccTF('toast_spot_insufficient',{coin:SP.coin})); return; }
  }

  // [SPOT-FIX-BAL] Optimistic UI update — หัก/เพิ่ม client ทันทีเพื่อ UX ที่ดี
  // GAS logSpotTrade (ผ่าน HIST.logSpotTrade → saveSpotTrade) จะหัก main_balance จริงใน GAS ด้วย
  // หลังจากนั้น _invalidateDashCache + loadDashboard จะ sync ยอดจาก GAS กลับมาอีกครั้ง
  if (SP.side === 'buy') {
    mainWalletBalance = Math.max(0, mainWalletBalance - tot - fee);
    if (!spotWallet[SP.coin]) spotWallet[SP.coin] = { bal: 0, locked: 0 };
    spotWallet[SP.coin].bal = (spotWallet[SP.coin].bal || 0) + qty;
    _saveSpotCoinDelta(SP.coin, qty);  // save coin balance ไป GAS
  } else {
    if (!spotWallet[SP.coin]) spotWallet[SP.coin] = { bal: 0, locked: 0 };
    spotWallet[SP.coin].bal = Math.max(0, (spotWallet[SP.coin].bal || 0) - qty);
    mainWalletBalance += tot - fee;
    _saveSpotCoinDelta(SP.coin, -qty);  // save coin balance ไป GAS
  }
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
  if (typeof renderSpotBalanceList === 'function') renderSpotBalanceList();

  // ── HIST: log spot trade → saveSpotTrade → GAS logSpotTrade (หัก main_balance จริง) ──
  if (typeof HIST !== 'undefined') {
    HIST.logSpotTrade(SP.coin, SP.side, SP.ot, execPrice, qty, fee);
  }

  // [SPOT-FIX-BAL] invalidate cache + reload balance จาก GAS หลัง 800ms
  // เพื่อให้ mainWalletBalance sync กับ GAS source of truth ป้องกัน polling เขียนทับด้วยยอดเก่า
  if (typeof _invalidateDashCache === 'function') _invalidateDashCache();
  setTimeout(function() {
    if (typeof loadDashboard === 'function') loadDashboard();
  }, 800);

  showToast(`${col} ${SP.ot} ${SP.side.toUpperCase()} ${qty.toFixed(4)} ${SP.coin} @ ${fmtP(execPrice)}`);

  // Reset inputs
  const totInp = document.getElementById('spTotalInp');
  if (totInp) totInp.value = '';
  const amtInp = document.getElementById('spAmtInp');
  if (amtInp) amtInp.value = '';
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  const dd = document.getElementById('coinDD');
  if (dd && !e.target.closest('#coinDD') && !e.target.closest('#topSym') && !e.target.closest('.chevron')) dd.classList.remove('open');
});

// Periodically refresh spot OB when on trade page
setInterval(async () => { if (currentPage === 'trade') { await fetchSpOB(); } }, 3000);
// Periodically refresh market prices
setInterval(async () => {
  if (!mktLoaded) return;
  try {
    const d = await hlPost({ type:'allMids' });
    S.coinPrices = d;
    mktData.forEach(r => { if(d[r.coin]) r.price = parseFloat(d[r.coin]); });
    mktSpotData.forEach(r => { if(d[r.coin]) r.price = parseFloat(d[r.coin]); });
    if (currentPage === 'markets') renderMarket();
    ['ETH','BTC','SOL','BNB'].forEach(c => {
      const el = document.getElementById('sdd-'+c); if(el&&d[c]) el.textContent=fmtP(parseFloat(d[c]));
    });
  } catch(e){}
}, 10000);

window.addEventListener('resize', () => { drawChart(); drawSpChart(); });

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
async function init() {
  // Set Trade tab as active on nav
  const niTrade = document.getElementById('ni-trade');
  if (niTrade) niTrade.classList.add('active');
  renderPositions();
  startFundingTimer();
  // Load spot data since Spot page is active by default
  loadSpotData();
  setInterval(fetchSpOB, 5000); // refresh OB every 5s on spot page

  // [FIX black-screen-on-refresh] เดิม await ตรงๆ ไม่มี try/catch —
  // ถ้า step ใดใน chain นี้ throw (เช่น network hiccup ตอน refresh ครั้งแรก /
  // cold cache) init() ทั้งฟังก์ชันจะหยุดกลางคันแบบเงียบๆ (silent halt)
  // ทำให้ไม่มีการเรียก connectWS(), setInterval ต่างๆ, initChartPanels ฯลฯ เลย
  // → หน้า futures ถูก navTo() ให้ active (splash หายตามเวลาคงที่ 4200ms อยู่ดี
  //   เพราะ initSplash() ไม่รู้ว่า init() ทำงานสำเร็จหรือไม่) แต่ drawChart()
  //   เจอ S.candles ว่าง (เพราะ fetchCandles ยังไม่ทันถูกเรียก) เลย return เปล่าๆ
  //   → จอกลายเป็นพื้นหลังมืด/ดำ โดยไม่มี error โผล่ให้เห็นชัดเจนใน UI
  // แก้โดยห่อแต่ละ step ด้วย try/catch แยกกัน เพื่อให้ step ที่เหลือ
  // (โดยเฉพาะ connectWS/initChartPanels/setInterval ทั้งหมด) ทำงานต่อได้เสมอ
  // ไม่ว่า step ก่อนหน้าจะสำเร็จหรือไม่
  try { await fetchAllMids(); } catch(e) { console.error('[init] fetchAllMids failed:', e); }
  // Load full perp coin list first so coinMap is ready before fetchCandles
  try { await loadPerpList(); } catch(e) { console.error('[init] loadPerpList failed:', e); }
  // ── Restore coin ล่าสุด (เช่น GOLDUSDT) หลัง perp list โหลดเสร็จ ──
  try {
    const _lastCoin = (() => { try { return localStorage.getItem('tcc_lastCoin'); } catch(e) { return null; } })();
    if (_lastCoin) {
      await selectCoin(_lastCoin);
    } else {
      // ไม่มี lastCoin → sync levBtn ตาม BTC cycle default
      const _initCycle = _getActiveLevCycle();
      const _initIdx = _initCycle.indexOf(S.lev);
      levIdx = _initIdx !== -1 ? _initIdx : _initCycle.length - 1;
      S.lev = _initCycle[levIdx];
      const _lb = document.getElementById('levBtn');
      if (_lb) _lb.textContent = S.lev + 'x';
    }
  } catch(e) {
    console.error('[init] restore last coin / selectCoin failed:', e);
  }
  try { await fetchCandles(S.tf); } catch(e) { console.error('[init] fetchCandles failed:', e); }
  try { await fetchFunding(); } catch(e) { console.error('[init] fetchFunding failed:', e); }
  try { await fetch24h(); } catch(e) { console.error('[init] fetch24h failed:', e); }

  // ── ตั้งแต่บรรทัดนี้ลงไป ต้องทำงานเสมอ ไม่ว่า fetch ด้านบนจะสำเร็จหรือไม่ ──
  try { connectWS(); } catch(e) { console.error('[init] connectWS failed:', e); }
  setTimeout(async () => {
    if (!S.wsConnected) {
      setApiStatus(false, 'WebSocket ช้า — ใช้ REST polling');
      startPolling();
    }
  }, 5000);
  // Refresh all mids every 10s
  setInterval(fetchAllMids, 10000);
  // Refresh candles every 30s
  setInterval(() => fetchCandles(S.tf), 30000);
  setInterval(fetchFunding, 60000);
  setInterval(fetch24h, 60000);
  // Refresh perp list every 5 minutes
  setInterval(loadPerpList, 300000);
  // Ensure countdown timer is always running after init
  startFutCountdown();
  // Input listeners for max/cost calc
  const _amtInpEl = document.getElementById('amtInp');
  if (_amtInpEl) _amtInpEl.addEventListener('input', updateMaxCost);
  const _limitPriceInpEl = document.getElementById('limitPriceInp');
  if (_limitPriceInpEl) _limitPriceInpEl.addEventListener('input', updateMaxCost);
  // Init system wallet display
  try { updateSysWalletDisplay(); } catch(e) { console.error('[init] updateSysWalletDisplay failed:', e); }
  try { checkMatureContracts(); } catch(e) { console.error('[init] checkMatureContracts failed:', e); }
  // Init unified chart panels (drag resize + pan)
  setTimeout(initChartPanels, 100);
  // [FIX black-screen-on-refresh v3] ปัญหาหน้าดำเกิดจาก race condition:
  //   splash ปิดที่ 4200ms (fixed timer) → navTo('futures') → drawChart()
  //   แต่ fetchCandles ยัง pending อยู่ → S.candles ว่าง → drawChart() return ทันที
  //   → canvas ยังเปล่า/ดำ และไม่มีอะไร trigger redraw อีกครั้ง
  //
  // แก้: หลัง init() เสร็จ ตรวจ 2 กรณี:
  //   (A) candles มีแล้ว → drawChart() ทันที (กรณีเน็ตเร็ว init เสร็จก่อน 4200ms)
  //   (B) candles ยังว่าง (init ช้า / เน็ตช้า) → ตั้ง polling ทุก 300ms สูงสุด 20 ครั้ง (6 วินาที)
  //       จนกว่า S.candles จะมีข้อมูล แล้วค่อย drawChart() + หยุด polling
  //   ทั้ง 2 กรณีตรวจเพิ่มว่าอยู่หน้า futures ก่อน (ไม่รบกวนถ้า user เปลี่ยนหน้าไปแล้ว)
  try {
    if (S.candles && S.candles.length) {
      // (A) candles พร้อมแล้ว — redraw ทันที
      drawChart();
    } else {
      // (B) candles ยังไม่มา — poll จนกว่าจะมีหรือ timeout
      let _chartRetryCount = 0;
      const _chartRetryMax = 20; // 20 × 300ms = 6s timeout
      const _chartRetryTimer = setInterval(() => {
        _chartRetryCount++;
        if (S.candles && S.candles.length) {
          clearInterval(_chartRetryTimer);
          // วาดเฉพาะถ้ายังอยู่หน้า futures
          if (currentPage === 'futures' || currentPage === 'trade') {
            try { drawChart(); } catch(e) { console.error('[init] retry drawChart failed:', e); }
          }
        } else if (_chartRetryCount >= _chartRetryMax) {
          clearInterval(_chartRetryTimer);
          console.warn('[init] drawChart retry timeout — candles still empty after 6s');
        }
      }, 300);
    }
  } catch(e) { console.error('[init] final drawChart failed:', e); }
}


// ═══════════════════════════════════════════════
//  ASSETS PAGE
// ═══════════════════════════════════════════════
let astHidden = false;
let astCurrentTab = 'overview';

function astUpdateTime() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  const el = document.getElementById('astTime');
  if (el) el.textContent = h + ':' + m;
}
setInterval(astUpdateTime, 30000);

// [v13.2] Force-reload balance+transactions จาก GAS ถ้า cache หมดอายุ
// เรียกทุกครั้งที่เปิดหน้า Assets
async function _astRefreshBalanceIfStale() {
  if (typeof USER_PROFILE === 'undefined') return;
  const uid = USER_PROFILE.uid;
  if (!uid) return;
  const cacheKey = 'dash_' + uid;

  // [v13.3 FIX] ทำ background fetch เสมอ เพื่อรับ Off-chain deposit จากคนอื่น
  // (cache stale check ยังอยู่: ถ้า fresh จะ return cached + fetch ใหม่ใน background)
  // แต่เราต้องการ apply balance ใหม่ด้วย ไม่ใช่แค่ update cache เฉยๆ

  const _applyDash = (dash) => {
    if (!dash) return;
    if (dash.user && dash.user.main_balance !== undefined) {
      const newBal = parseFloat(dash.user.main_balance);
      if (!isNaN(newBal)) {
        // [RED-12 FIX] Apply always — threshold check caused stale display for small changes
        mainWalletBalance = newBal;
        if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
        if (typeof updateOverviewBalances  === 'function') updateOverviewBalances();
      }
    }
    _applyTransactions(uid, dash.transactions); // [FIX-TX-CLEAR]
    if (dash.trades)       _mergeIntoHIST('tradeHistory',       dash.trades);
    if (dash.funding)      _mergeIntoHIST('fundingFee',         dash.funding);
    if (dash.positions)    _mergeIntoHIST('positionHistory',    dash.positions.filter(p => p.status !== 'Active'));
    if (dash.orderHistory) _mergeIntoHIST('orderHistory',       dash.orderHistory); // [v8.9 NEW]
    if (dash.spotTrades)   _mergeIntoHIST('spotTradeHistory',   dash.spotTrades);
    if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  };

  const cached = LS.getIfFresh(cacheKey);
  // [GAS-FIRST] fetch GAS ก่อนเสมอ ไม่ว่า cache จะสดแค่ไหน
  // cache ใช้เฉพาะ fallback เมื่อ GAS fail
  try {
    const fresh = await dbCallRaw('getDashboard', { uid });
    if (fresh) {
      LS.setWithTTL(cacheKey, { data: fresh }, CACHE_CONFIG.TTL_DASHBOARD);
      _applyDash(fresh);
    }
  } catch(e) {
    console.warn('[_astRefreshBalanceIfStale] GAS fail, using cache:', e.message);
    if (cached) _applyDash(cached.data);
  }
  return;
}

// [v13.3+RED-12 FIX] Polling: refresh balance ทุก 15 วิ ขณะอยู่ที่หน้า Assets
let _astBalancePoller = null;
function _astStartBalancePolling() {
  _astStopBalancePolling();
  _astBalancePoller = setInterval(() => {
    if (typeof currentPage !== 'undefined' && currentPage === 'assets') {
      _astRefreshBalanceIfStale();
    } else {
      _astStopBalancePolling();
    }
  }, 15000);
}
function _astStopBalancePolling() {
  if (_astBalancePoller) { clearInterval(_astBalancePoller); _astBalancePoller = null; }
}

// [v13.3] Fetch transactions จาก GAS ถ้า HIST ว่าง (เช่น ผู้รับยังไม่เคย loadDashboard)
async function _astFetchTransactionsIfEmpty() {
  const uid = USER_PROFILE.uid;
  if (!uid) return;
  try {
    const dash = await dbCallRaw('getDashboard', { uid });
    if (!dash) return;
    LS.setWithTTL('dash_' + uid, { data: dash }, CACHE_CONFIG.TTL_DASHBOARD);
    if (dash.user && dash.user.main_balance !== undefined) {
      const _b = parseFloat(dash.user.main_balance);
      if (!isNaN(_b)) { mainWalletBalance = _b; updateSysWalletDisplay(); updateOverviewBalances(); }
    }
    _applyTransactions(uid, dash.transactions); // [FIX-TX-CLEAR]
    if (dash.trades)       _mergeIntoHIST('tradeHistory',       dash.trades);
    if (dash.funding)      _mergeIntoHIST('fundingFee',         dash.funding);
    // re-render My Trades ถ้าเปิดอยู่
    if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  } catch(e) {
    console.warn('[_astFetchTransactionsIfEmpty]', e);
  }
}

// [v5 FIX ปัญหา1] _astFetchAllHistoryIfEmpty — ดึง history ทุกประเภทพร้อมกัน
// เรียกจาก mytSwitchTab เมื่อ tab ใดๆ ว่าง (positionHistory, tradeHistory, fundingFee, spotTradeHistory)
// ใช้ getDashboard เพียง 1 call เพื่อดึงทุกอย่างในครั้งเดียว
let _astFetchAllHistoryInProgress = false; // ป้องกัน parallel fetch
async function _astFetchAllHistoryIfEmpty() {
  if (_astFetchAllHistoryInProgress) return;
  const uid = USER_PROFILE.uid;
  if (!uid) return;
  _astFetchAllHistoryInProgress = true;
  try {
    const dash = await dbCallRaw('getDashboard', { uid });
    if (!dash) return;
    LS.setWithTTL('dash_' + uid, { data: dash }, CACHE_CONFIG.TTL_DASHBOARD);

    // อัปเดต balance
    if (dash.user && dash.user.main_balance !== undefined) {
      const _b = parseFloat(dash.user.main_balance);
      if (!isNaN(_b) && Math.abs(_b - mainWalletBalance) > 0.001) {
        mainWalletBalance = _b;
        if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
        if (typeof updateOverviewBalances  === 'function') updateOverviewBalances();
      }
    }

    // merge ทุก history type
    _applyTransactions(uid, dash.transactions); // [FIX-TX-CLEAR]
    if (dash.trades)       _mergeIntoHIST('tradeHistory',       dash.trades);
    if (dash.funding)      _mergeIntoHIST('fundingFee',         dash.funding);
    if (dash.positions)    _mergeIntoHIST('positionHistory',    dash.positions.filter(p => p.status !== 'Active'));
    if (dash.orderHistory) _mergeIntoHIST('orderHistory',       dash.orderHistory); // [v8.9 NEW]
    if (dash.spotTrades)   _mergeIntoHIST('spotTradeHistory',   dash.spotTrades);

    // re-render My Trades ถ้าเปิดอยู่
    if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
    console.log('[_astFetchAllHistoryIfEmpty] done — tx:', (dash.transactions||[]).length,
                'trades:', (dash.trades||[]).length, 'pos:', (dash.positions||[]).length);
  } catch(e) {
    console.warn('[_astFetchAllHistoryIfEmpty]', e);
  } finally {
    _astFetchAllHistoryInProgress = false;
  }
}



// [v13.3] Force refresh: ล้าง cache แล้ว fetch ใหม่ทันที (สำหรับปุ่ม manual refresh)
async function _astForceRefreshBalance() {
  const uid = USER_PROFILE.uid;
  if (!uid) return;
  const btn  = document.getElementById('ast-refresh-btn');
  const icon = document.getElementById('ast-refresh-icon');
  if (icon) icon.style.animation = 'spin 0.8s linear infinite';
  if (btn)  btn.style.pointerEvents = 'none';
  // ล้าง cache → บังคับ fetch ใหม่
  LS.del('dash_' + uid);
  try {
    const dash = await dbCallRaw('getDashboard', { uid });
    LS.setWithTTL('dash_' + uid, { data: dash }, CACHE_CONFIG.TTL_DASHBOARD);
    if (dash && dash.user && dash.user.main_balance !== undefined) {
      const _nb = parseFloat(dash.user.main_balance);
      mainWalletBalance = !isNaN(_nb) ? _nb : mainWalletBalance;
      if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
      if (typeof updateOverviewBalances  === 'function') updateOverviewBalances();
    }
    _applyTransactions(uid, dash && dash.transactions); // [FIX-TX-CLEAR]
    if (dash && dash.trades)       _mergeIntoHIST('tradeHistory',       dash.trades);
    if (dash && dash.funding)      _mergeIntoHIST('fundingFee',         dash.funding);
    if (dash && dash.positions)    _mergeIntoHIST('positionHistory',    dash.positions.filter(p => p.status !== 'Active')); // [v7 FIX]
    if (dash && dash.orderHistory) _mergeIntoHIST('orderHistory',       dash.orderHistory); // [v8.9 NEW]
    if (dash && dash.spotTrades)   _mergeIntoHIST('spotTradeHistory',   dash.spotTrades); // [v7 FIX]
    if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
    showToast(tccT('toast_balance_updated'));
  } catch(e) {
    console.warn('[_astForceRefreshBalance]', e);
    showToast(tccT('toast_balance_update_fail'));
  } finally {
    if (icon) icon.style.animation = '';
    if (btn)  btn.style.pointerEvents = '';
  }
}

function astSwitchTabByName(name) {
  // Map name to tab index in .ast-tab-item list
  const nameMap = { 'overview':0, 'futures-a':1, 'earn':2, 'funding':3, 'spot-a':4, 'commission':5 };
  const tabs = document.querySelectorAll('#page-assets .ast-tab-item');
  const el = tabs[nameMap[name]] || null;
  astSwitchTab(name, el);
}

// [เดิม] เคยถูกเรียกตรงจากปุ่มแท็บ Commission (redirect ทั้งหน้าไป member2.html)
// [v2 CHANGE] ปุ่มแท็บ Commission เปลี่ยนไปใช้ astSwitchTab('commission',this) แล้ว (ดู ast-page-commission)
// ฟังก์ชันนี้ยังคงไว้เป็น "ดูรายละเอียดทีม/Referral แบบเต็ม" (ไอคอนภายใน ast-page-commission)
// เพราะ member2.html มี Team tree, Referral tier breakdown ที่ยังไม่ได้ port เข้ามาในหน้านี้
// [v3] เพิ่ม parameter `tab` (ไม่บังคับ) — ถ้าระบุจะแนบ &tab=xxx ไปให้ member2.html
// เปิดแท็บย่อยที่ตรงกับปุ่มที่กดทันที (ดู init() ใน member2.html ที่อ่านค่านี้)
// ไม่ระบุ (เดิม) = ไม่แนบ &tab= → member2.html default ไปที่ "ส่วนตัว" เหมือนเดิมทุกที่ที่เรียกฟังก์ชันนี้แบบไม่มี argument
// [v4 FIX-ROOT] เดิมใช้ window.location.href = url → full page reload ทั้งหน้าทุกครั้งที่เปิด
// และอีกครั้งตอนกด "←" กลับ (ดู goBack() ใน member2.html) รวม 2 รอบ reload ต่อ 1 ทริป
// ทำให้ state ของ index.html (_commissionLoaded, cache ในหน่วยความจำ ฯลฯ) หายทุกครั้ง
// ต้องโหลด Commission tab ใหม่จาก GAS ทุกครั้งที่กลับมา แม้เพิ่งโหลดไปเมื่อกี้นี้เอง
// ── ตอนนี้: เปิด member2.html ใน iframe ภายใน overlay ของ index.html เอง (ไม่ navigate)
// member2.html ฝั่งนั้นตรวจ ?embed=1 แล้วใช้ postMessage แทนการ redirect กลับ (ดู goBack() ที่นั่น)
let _astCommDashUid = ''; // uid ที่ iframe โหลดอยู่ปัจจุบัน — กันโหลดซ้ำถ้า user เดิม
function astOpenCommissionDashboard(tab) {
  const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
  const uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
            : (typeof USER_PROFILE !== 'undefined' && USER_PROFILE ? USER_PROFILE.uid : '0');

  const overlay = document.getElementById('astCommDashOverlay');
  const frame   = document.getElementById('astCommDashFrame');
  if (!overlay || !frame) {
    // Fallback กันพัง ถ้า DOM เวอร์ชันเก่าไม่มี overlay นี้ — ใช้พฤติกรรมเดิมทั้งหมด
    let url = 'member2.html?view=dashboard&uid=' + encodeURIComponent(uid);
    if (tab) url += '&tab=' + encodeURIComponent(tab);
    window.location.href = url;
    return;
  }

  const alreadyLoaded = frame.getAttribute('src') !== 'about:blank' && _astCommDashUid === uid;
  if (alreadyLoaded) {
    // iframe โหลด uid เดิมอยู่แล้ว (แค่ถูกซ่อนไว้) — สั่งสลับแท็บย่อยผ่าน postMessage แทนการโหลดใหม่
    // ไม่ยิง network call ซ้ำ ไม่ reset scroll/สถานะภายในของ member2.html
    if (tab) {
      try { frame.contentWindow.postMessage({ source: 'tcc_index_ast', type: 'switch_tab', tab }, '*'); } catch(e) {}
    }
  } else {
    _astCommDashUid = uid;
    let url = 'member2.html?embed=1&view=dashboard&uid=' + encodeURIComponent(uid);
    if (tab) url += '&tab=' + encodeURIComponent(tab);
    frame.src = url;
  }
  overlay.style.display = 'flex';
}

// [NEW v4] ปิด overlay Referral/Team — ไม่ล้าง iframe.src ทิ้ง เพื่อคง state ของ member2.html
// ไว้ในเซสชันนี้ (เปิดซ้ำแล้วไม่ต้องโหลดใหม่ ดู alreadyLoaded ด้านบน)
function astCloseCommissionDashboard() {
  const overlay = document.getElementById('astCommDashOverlay');
  if (overlay) overlay.style.display = 'none';
}

// [NEW v4] รับสัญญาณจาก member2.html (postMessage) เวลากด "←" หรือปุ่ม "ไปหน้าโอนเงิน" ภายใน iframe
window.addEventListener('message', function(ev) {
  if (!ev.data || ev.data.source !== 'tcc_member2') return;
  if (ev.data.type === 'close_dashboard') {
    astCloseCommissionDashboard();
  } else if (ev.data.type === 'open_commission_transfer') {
    astCloseCommissionDashboard();
    if (typeof astOpenCommissionTransfer === 'function') astOpenCommissionTransfer();
  }
});

// ══════════════════════════════════════════════════════════════
// [NEW v2] ast-page-commission — Commission tab แบบ embed ใน index.html
// ใช้ GAS action เดิม (getMemberDashboard, getReferralDashboard, logCommissionTransfer)
// ที่ member2.html ใช้อยู่แล้ว — ไม่มี action ใหม่ ไม่แตะ business rule เดิม
// (ขั้นต่ำโอน + ต้องมีสมาชิก Approved ครบเงื่อนไข) และไม่ผูกกับ TF/openTransfer()
// เพราะ Commission → Spot เป็น one-direction เท่านั้น ต่างจาก TF ที่โอนได้สองทาง/หลาย wallet
// ══════════════════════════════════════════════════════════════
// [v3] Commission tab load tracker — กัน double-fire (เช่น user สลับแท็บเร็ว)
let _commTabLoading = false;
let _commTabLastUid = '';
let _commTabLastMs  = 0;

// [FIX v6 LOAD-FLAKY] ห่อ dbRead() ด้วย retry อัตโนมัติ 1 ครั้ง (เว้น 1.5s) เฉพาะ Commission tab
// เหตุผล: GAS (Google Apps Script) บางครั้ง cold-start/ScriptLock ช้าเกิน 20s (timeout ใน dbCallRaw)
// ทำให้ getMemberDashboard พังแค่ครั้งเดียวก็ล้มทั้งแท็บ ทั้งที่ปกติแค่ลองซ้ำอีกทีก็ผ่าน
// ถ้า retry แล้วยังพังอีก → fallback ไปใช้ cache เก่า (แม้หมดอายุ) แทนโชว์ error ทันที
// ไม่แตะ dbRead()/dbCallRaw() เดิมเลย เพื่อไม่ให้กระทบฟีเจอร์อื่นที่ใช้สองฟังก์ชันนี้อยู่
async function _commFetchWithRetry(action, data, cacheKey, ttl) {
  try {
    return await dbRead(action, data, cacheKey, ttl);
  } catch (e1) {
    console.warn('[astRenderCommissionTab] ' + action + ' ล้มเหลวรอบแรก กำลัง retry...', e1 && e1.message);
    await new Promise(r => setTimeout(r, 1500));
    try {
      return await dbRead(action, data, cacheKey, ttl);
    } catch (e2) {
      const stale = cacheKey ? LS.get(cacheKey) : null; // LS.get = ไม่เช็ค TTL เอาแม้ข้อมูลหมดอายุ (ดีกว่าไม่มีเลย)
      if (stale && stale.data) {
        console.warn('[astRenderCommissionTab] ' + action + ' ล้มเหลว 2 รอบ ใช้ cache เก่าแทน (stale)');
        return stale.data;
      }
      throw e2;
    }
  }
}

async function astRenderCommissionTab() {
  // [v3 PERF] ถ้ามีข้อมูล cache อยู่แล้ว → render ทันทีก่อน (instant display, no flicker)
  if (_commissionLoaded) {
    astUpdateCommissionDisplay();
    astCommRenderWidget();
  } else {
    // ครั้งแรก: แสดง skeleton บน balance display กันหน้าโล่ง
    const valEl = document.getElementById('commTotalVal');
    const balEl = document.getElementById('commWalletBal');
    if (valEl && valEl.textContent === '0.00') valEl.textContent = '⏳';
    if (balEl && balEl.textContent === '0.00') balEl.textContent = '⏳';
  }

  const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
  const uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
            : (typeof USER_PROFILE !== 'undefined' && USER_PROFILE ? USER_PROFILE.uid : '');
  if (!uid) { astUpdateCommissionDisplay(); return; }

  // [v3 PERF] Throttle: ถ้าโหลด uid เดิมภายใน 30 วินาที ให้ใช้ cache — ไม่ยิง GAS ซ้ำ
  const now = Date.now();
  if (_commTabLoading) return; // กัน concurrent calls
  if (_commissionLoaded && uid === _commTabLastUid && (now - _commTabLastMs) < 30000) {
    astUpdateCommissionDisplay();
    astCommRenderWidget();
    return;
  }

  _commTabLoading = true;
  _commTabFailed = false; // [FIX] เริ่มโหลดใหม่ → เคลียร์สถานะ error เดิมก่อน กันโชว์ "ลองใหม่" ค้างระหว่าง retry
  try {
    // [v4 PERF FIX] เดิมยิง dbCallRaw() ตรงๆ ทุกครั้ง ไม่ผ่าน cache เลย — โหลดช้าทุกครั้งที่เป็น
    // cold state (เพิ่งเปิดแอพ/เพิ่ง login) เพราะ GAS round-trip ช้า
    // เปลี่ยนมาใช้ dbRead() (stale-while-revalidate เหมือน dashboard อื่นๆ ในแอพ) แทน dbCallRaw() ตรงๆ
    // ⚠️ ใช้ cache key แยกต่างหาก ('commdash_'/'commref_') ไม่ใช้ 'dash_'+uid ซ้ำกับของเดิม
    // เพราะ 'dash_'+uid ถูกใช้เก็บผลลัพธ์ของ getDashboard (คนละ action, คนละโครงสร้างข้อมูล)
    // อยู่แล้วในหลายจุด (_astRefreshBalanceIfStale ฯลฯ) — ใช้คีย์เดียวกันจะทำให้ข้อมูลสองชุดทับกัน
    // [FIX v6 LOAD-FLAKY] เดิม getMemberDashboard ไม่มี catch คลุมเลย — ถ้า GAS cold-start/ช้าเกิน
    // timeout (20s ใน dbCallRaw) แค่ครั้งเดียว จะทำให้ Promise.all reject ทั้งก้อน ทั้งที่
    // getReferralDashboard (บรรทัดถัดไป) มี .catch(()=>null) เป็น best-effort อยู่แล้ว
    // → ใช้ _commFetchWithRetry() ครอบทั้งคู่: retry อัตโนมัติ 1 ครั้งก่อนยอมแพ้ + ถ้ายังพังอีก
    // ให้ fallback ไปใช้ cache เก่าที่เคยโหลดสำเร็จ (ถ้ามี) แทนการโชว์ "เชื่อมต่อไม่สำเร็จ" ทันที
    const [dash, ref] = await Promise.all([
      _commFetchWithRetry('getMemberDashboard', { uid }, 'commdash_' + uid, CACHE_CONFIG.TTL_DASHBOARD),
      _commFetchWithRetry('getReferralDashboard', { uid }, 'commref_' + uid, CACHE_CONFIG.TTL_DASHBOARD).catch(() => null) // best-effort — ถ้า fail ไม่บล็อกยอด balance
    ]);
    _commTabLastUid = uid;
    _commTabLastMs  = Date.now();
    if (dash && dash.member) {
      commissionBalance = parseFloat(dash.member.commissionBalance) || 0;
      astCommIsLeader = !!dash.member.isLeader;
    }
    // [NEW v3] เก็บ realizedPnl + ledger (จาก response getMemberDashboard เดิม) ไว้ให้ astCommRenderWidget()
    // คำนวณการ์ดสรุป/donut/ตารางเอง ฝั่ง client — ไม่ยิง action ใหม่
    if (dash) {
      astCommRows = [
        ...(Array.isArray(dash.realizedPnl) ? dash.realizedPnl : []).map(r => ({ date: r.date, type: 'Realized PNL', amount: parseFloat(r.amount) || 0, note: r.note || '' })),
        // [FIX v3.1] กรอง CommissionWithdraw ออก — เป็น internal transfer entry ไม่ใช่ income
        // GAS v2.32 กรองให้แล้ว แต่ filter ซ้ำฝั่ง client เป็น defense-in-depth
        // [DETAIL v5] เก็บ contractId/sourceUid/note ต่อ (GAS ส่งมาอยู่แล้วจาก getMemberDashboard) — เดิม map ทิ้งไป
        ...(Array.isArray(dash.ledger) ? dash.ledger : []).filter(r => r.type !== 'CommissionWithdraw').map(r => ({ date: r.date, type: r.type, amount: parseFloat(r.amount) || 0, contractId: r.contractId || '', sourceUid: r.sourceUid || '', note: r.note || '' })),
      ];
    }
    if (ref && ref.referrer) {
      commissionApprovedCount = ref.referrer.approvedCount || 0;
      commissionMinApproved   = ref.referrer.minApprovedToWithdraw || 0;
      commissionMinAmount     = ref.referrer.minAmountToWithdraw || 0;
      commissionCanTransfer   = commissionApprovedCount >= commissionMinApproved;
    }
    // [NEW] เก็บ referredMembers ให้ Commission History overlay ใช้ได้โดยตรง
    if (ref && Array.isArray(ref.referredMembers)) {
      astCommHistRefMembers = ref.referredMembers;
    }
    // [v3.2 / GAS v2.33] commissionBalance มาจาก Ledger net โดยตรงแล้ว (single source of truth)
    // safety net: ถ้า dash.member.commissionBalance ยังเป็น 0 แต่ summary.totalCommissionEarned มีค่า
    // (GAS เก่า / cache ค้าง) → ใช้ summary แทน
    if (commissionBalance <= 0 && dash && dash.summary) {
      const netFromLedger = parseFloat(dash.summary.totalCommissionEarned) || 0;
      if (netFromLedger > 0) commissionBalance = netFromLedger;
    }
    _commissionLoaded = true;
    _commTabFailed = false; // [FIX] โหลดสำเร็จ → เคลียร์สถานะ error เดิม (ถ้ามี)
  } catch (e) {
    console.warn('[astRenderCommissionTab]', e);
    if (!_commissionLoaded) { _commTabFailed = true; showToast(tccT('toast_commission_load_fail')); }
  } finally {
    _commTabLoading = false; // ปลดล็อคเสมอ ไม่ว่า success หรือ error
  }
  astUpdateCommissionDisplay();
  astCommRenderWidget();
}

function astUpdateCommissionDisplay() {
  const valEl  = document.getElementById('commTotalVal');
  const usdEl  = document.getElementById('commTotalUsd');
  const balEl  = document.getElementById('commWalletBal');
  const usd2El = document.getElementById('commWalletUsd');
  const btn    = document.getElementById('commTransferBtn');
  const note   = document.getElementById('commConditionNote');

  // [v3 PERF] ถ้ายังไม่โหลด และยอดยังเป็น 0 → แสดง '—' แทน '0.00' กันผู้ใช้งงว่ายอดหาย
  const shown = _commissionLoaded ? commissionBalance.toFixed(2) : (commissionBalance > 0 ? commissionBalance.toFixed(2) : '—');
  // [FIX] เชื่อมต่อ GAS ล้มเหลว (getMemberDashboard/getDashboard) → โชว์ข้อความ "ลองใหม่" แทนค้างที่ "กำลังโหลด..." เฉยๆ ตลอดไป
  const failedMsg = '⚠️ เชื่อมต่อไม่สำเร็จ · แตะเพื่อลองใหม่';
  const loadingMsg = 'กำลังโหลด...';
  const usdMsg = (_commissionLoaded || commissionBalance > 0) ? '≈ $' + commissionBalance.toFixed(2)
               : (_commTabFailed && !_commTabLoading) ? failedMsg : loadingMsg;
  if (valEl)  valEl.textContent  = shown;
  if (usdEl)  { usdEl.textContent = usdMsg; usdEl.style.cursor = (_commTabFailed && !_commTabLoading) ? 'pointer' : ''; usdEl.style.color = (_commTabFailed && !_commTabLoading) ? 'var(--y)' : ''; usdEl.onclick = (_commTabFailed && !_commTabLoading) ? () => astRenderCommissionTab() : null; }
  if (balEl)  balEl.textContent  = shown;
  if (usd2El) { usd2El.textContent = usdMsg; usd2El.style.cursor = (_commTabFailed && !_commTabLoading) ? 'pointer' : ''; usd2El.style.color = (_commTabFailed && !_commTabLoading) ? 'var(--y)' : ''; usd2El.onclick = (_commTabFailed && !_commTabLoading) ? () => astRenderCommissionTab() : null; }

  // ปุ่ม Transfer to Spot — disable ขณะกำลังโหลด, enable หลังโหลดเสร็จ
  if (btn) btn.disabled = _commTabLoading && !_commissionLoaded;

  if (note) {
    if (_commissionLoaded && !commissionCanTransfer) {
      note.style.display = 'block';
      note.textContent = `⚠️ ${tccTF('gate_min_approved_transfer', {min: commissionMinApproved, cur: commissionApprovedCount})}`;
    } else {
      note.style.display = 'none';
    }
  }
}

// ══════════════════════════════════════════════════════════════
// [NEW v3] Commission tab — personal summary widget
// (nav grid ทำไปแล้วด้านบนใน HTML แบบ static, ส่วนนี้คือ: 5 การ์ดสรุป, dropdown เดือน,
//  donut chart + legend คลิกกรอง, ตารางรายการแบ่งหน้า 10/หน้า)
// ที่มาข้อมูล: astCommRows ถูกเติมจาก response getMemberDashboard เดิมใน astRenderCommissionTab()
// ไม่มีการยิง network call เพิ่ม — คำนวณ sumByType ฝั่ง client ทั้งหมด
// ทุกชื่อฟังก์ชัน/ตัวแปรใหม่ใช้ prefix astComm... กันชนกับของเดิม, ไม่แตะ TF/tfConfirm/Funding/HIST/MYT
// สีทั้งหมดแปลงมาจากโทนตายตัวของ member2.html (--gold/rgba(240,185,11,..)) ให้ใช้ CSS var ชุดเดียวกับ index.html แทน
// (--y, --g, --r, --bl-a15, --t1, --t2, --border, --bg3, --mono, --sans, --rmd) — purple เดิมไม่มีใน palette นี้ จึงแทนด้วย --r
// ══════════════════════════════════════════════════════════════
let astCommRows       = [];   // รวม realizedPnl + ledger เป็น array เดียว {date,type,amount}
let astCommIsLeader   = false;
let astCommMonth      = '';   // '' = ทั้งหมด
let astCommTypeFilter = '';   // '' = ทั้งหมด, หรือ ledger type ที่เลือกจาก legend
let astCommPage       = 0;    // pagination ตาราง (0-based, 10 แถว/หน้า)
let _astCommDetailRows = [];  // [DETAIL v5] แถวของหน้าปัจจุบัน (ตารางหรือ Commission History) — ใช้เปิด detail sheet ตอนคลิก

// [PREMIUM v4] ตัดอิโมจิสีสันออกทั้งหมด — ใช้โทนทอง-บรอนซ์ไล่ระดับเดียว (เฉพาะจุด/dot ในโดนัทและ legend)
// ส่วน label/amount ในรายการ ใช้สีเทา/ขาวนวลสม่ำเสมอ (ดู tableRowsHtml, _commHistRenderLedger)
const _ASTCOMM_TYPE_COLOR = {
  'Realized PNL':      'var(--gold)',
  'ProfitShareTeam':   '#b3966b',
  'ProfitShareLevelA': '#9c8560',
  'ProfitShareLevelB': '#857256',
  'ReferralFlat':      '#6e604a',
  'ReferralTier':      '#584c3a',
};
const _ASTCOMM_TYPE_KEY = {
  'Realized PNL':      'type_meta_realized_pnl',
  'ProfitShareTeam':   'your_team_10',
  'ProfitShareLevelA': 'type_meta_level_a',
  'ProfitShareLevelB': 'type_meta_level_b',
  'ReferralFlat':      'type_meta_referral',
  'ReferralTier':      'type_meta_referral',
};
const ASTCOMM_TYPE_META = new Proxy({}, {
  get(_, type) {
    if (!_ASTCOMM_TYPE_COLOR[type]) return undefined;
    return { label: (typeof tccT === 'function' ? tccT(_ASTCOMM_TYPE_KEY[type] || type) : type), color: _ASTCOMM_TYPE_COLOR[type] };
  },
  has(_, type) { return type in _ASTCOMM_TYPE_COLOR; },
  ownKeys(_) { return Object.keys(_ASTCOMM_TYPE_COLOR); },
  getOwnPropertyDescriptor(_, type) { return type in _ASTCOMM_TYPE_COLOR ? { configurable: true, enumerable: true } : undefined; },
});

function astCommFmt(v) { return '$' + (parseFloat(v) || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function astCommThaiMonth(m) { return ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][m] || ''; }

function astCommSetMonth(v) { astCommMonth = v; astCommTypeFilter = ''; astCommPage = 0; astCommRenderWidget(); }
function astCommSetTypeFilter(t) { astCommTypeFilter = t; astCommPage = 0; astCommRenderWidget(); }
function astCommClearTypeFilter() { astCommTypeFilter = ''; astCommRenderWidget(); }
function astCommSetPage(p) { astCommPage = p; astCommRenderWidget(); }

function astCommRenderWidget() {
  const box = document.getElementById('astCommWidget');
  if (!box) return;

  if (!astCommRows.length) {
    // [FIX] แยกกรณี "เชื่อมต่อ GAS ไม่สำเร็จ" ออกจาก "ยังไม่มีรายการจริงๆ" กันผู้ใช้เข้าใจผิดว่าไม่มีรายได้
    if (_commTabFailed && !_commissionLoaded && !_commTabLoading) {
      box.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--t2);font-size:13px">
        ⚠️ โหลดข้อมูลไม่สำเร็จ<br>
        <span onclick="astRenderCommissionTab()" style="color:var(--gold);cursor:pointer;font-weight:700;display:inline-block;margin-top:8px"><span data-i18n="retry">${tccT('retry')}</span></span>
      </div>`;
    } else {
      box.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--t2);font-size:13px">${tccT('no_records')}</div>`;
    }
    return;
  }

  // ── เดือน dropdown ──
  const months = {};
  astCommRows.forEach(p => { const d = new Date(p.date); if (!isNaN(d.getTime())) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; months[k] = true; } });
  const sortedM = Object.keys(months).sort().reverse();
  const monthOpts = sortedM.map(k => { const [y, mo] = k.split('-'); return `<option value="${k}" ${astCommMonth === k ? 'selected' : ''}>${astCommThaiMonth(parseInt(mo))} ${parseInt(y) + 543}</option>`; }).join('');
  const monthSel = `<div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:9px 12px">
    <span style="font-size:12px;color:var(--gold-dim);white-space:nowrap;font-weight:600"><span data-i18n="month">${tccT('month')}</span></span>
    <select onchange="astCommSetMonth(this.value)" style="background:transparent;border:none;color:var(--t1);font-family:var(--sans);font-size:13px;padding:2px 4px;outline:none;cursor:pointer;flex:1">
      <option value="" ${!astCommMonth ? 'selected' : ''}><span data-i18n="all">${tccT('all')}</span></option>
      ${monthOpts}
    </select>
  </div>`;

  const filtered = astCommMonth ? astCommRows.filter(p => {
    const d = new Date(p.date);
    if (isNaN(d.getTime())) return false;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === astCommMonth;
  }) : astCommRows;

  // ── สรุปยอดแยกตาม type ──
  const sumByType = {};
  filtered.forEach(p => { sumByType[p.type] = (sumByType[p.type] || 0) + p.amount; });
  const totalAll = filtered.reduce((s, p) => s + p.amount, 0);

  const myProfit     = sumByType['Realized PNL'] || 0;
  const teamComm      = sumByType['ProfitShareTeam'] || 0;
  const levelComm      = (sumByType['ProfitShareLevelA'] || 0) + (sumByType['ProfitShareLevelB'] || 0);
  const referralComm  = (sumByType['ReferralFlat'] || 0) + (sumByType['ReferralTier'] || 0);

  // ── 5 Summary cards ──
  const summCards = `<div class="comm-summary-grid">
    <div class="comm-summary-card">
      <div class="ico" style="background:var(--gold-15)">💰</div>
      <div class="lbl"><span data-i18n="you_receive_40">${tccT('you_receive_40')}</span></div>
      <div class="val">${astCommFmt(myProfit)}</div>
    </div>
    <div class="comm-summary-card">
      <div class="ico" style="background:var(--bl-a15)">🏠</div>
      <div class="lbl">${tccT('your_team_10')}</div>
      <div class="val">${astCommFmt(teamComm)}</div>
    </div>
    <div class="comm-summary-card">
      <div class="ico" style="background:var(--r-15)">📊</div>
      <div class="lbl">${tccT('level_ab')}</div>
      <div class="val">${astCommFmt(levelComm)}</div>
    </div>
    <div class="comm-summary-card">
      <div class="ico" style="background:var(--g-15)">🔗</div>
      <div class="lbl">${tccT('referral_flat')}</div>
      <div class="val">${astCommFmt(referralComm)}</div>
    </div>
    <div class="comm-total-card">
      <div class="lbl"><span data-i18n="income_total">${tccT('income_total')}</span></div>
      <div class="val">${astCommFmt(totalAll)}</div>
      <div class="meta">${filtered.length} ${tccT('records_list')}${astCommIsLeader ? ' · ' + tccT('team_leader') : ''}</div>
    </div>
  </div>`;

  // ── Donut chart: สัดส่วนรายได้แต่ละประเภท ──
  const typeEntries = Object.entries(sumByType).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  let chartHtml = '';
  if (typeEntries.length) {
    const donutR = 48, cx = 70, cy = 70;
    const totalPos = typeEntries.reduce((s, [, v]) => s + v, 0) || 1;
    let acc = 0;
    const arc = (pct, offset, col) => {
      if (pct <= 0) return '';
      if (pct >= 1) return `<circle cx="${cx}" cy="${cy}" r="${donutR}" fill="none" style="stroke:${col}" stroke-width="16"/>`;
      const a = pct * 2 * Math.PI;
      const x1 = cx + donutR * Math.sin(offset * 2 * Math.PI);
      const y1 = cy - donutR * Math.cos(offset * 2 * Math.PI);
      const x2 = cx + donutR * Math.sin((offset + pct) * 2 * Math.PI);
      const y2 = cy - donutR * Math.cos((offset + pct) * 2 * Math.PI);
      return `<path d="M ${x1} ${y1} A ${donutR} ${donutR} 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2}" fill="none" style="stroke:${col}" stroke-width="16" stroke-linecap="round"/>`;
    };
    const arcs = typeEntries.map(([type, val]) => {
      const pct = val / totalPos;
      const meta = ASTCOMM_TYPE_META[type] || { color: 'var(--t2)' };
      const svg = arc(pct, acc, meta.color);
      acc += pct;
      return svg;
    }).join('');

    const legend = typeEntries.map(([type, val]) => {
      const meta = ASTCOMM_TYPE_META[type] || { label: type, color: 'var(--t2)' };
      const pct = totalPos ? Math.round((val / totalPos) * 100) : 0;
      return `<div class="comm-legend-row" onclick="astCommSetTypeFilter('${type}')">
        <span style="width:9px;height:9px;border-radius:50%;background:${meta.color};flex-shrink:0;box-shadow:0 0 6px ${meta.color}"></span>
        <span style="font-size:11.5px;color:var(--t2);flex:1">${meta.label}</span>
        <span style="font-size:9.5px;color:var(--t3);margin-right:4px">${pct}%</span>
        <span style="font-size:11.5px;font-weight:700;color:var(--t1)">${astCommFmt(val)}</span>
      </div>`;
    }).join('');

    chartHtml = `<details open class="comm-donut-wrap">
      <summary class="comm-donut-summary">
        <span style="font-size:13px;font-weight:700;color:var(--gold)"><span data-i18n="income_ratio">${tccT('income_ratio')}</span></span>
        <span class="chev">▾</span>
      </summary>
      <div class="comm-donut-body">
        <div style="position:relative;width:140px;flex-shrink:0">
          <svg viewBox="0 0 140 140" style="width:140px">
            <circle cx="${cx}" cy="${cy}" r="${donutR}" fill="none" style="stroke:var(--border)" stroke-width="16"/>
            ${arcs}
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-size:9.5px;color:var(--t2);font-weight:600"><span data-i18n="total">${tccT('total')}</span></div>
            <div style="font-family:var(--mono);font-size:13px;font-weight:800;color:var(--gold);text-align:center;padding:0 6px">${astCommFmt(totalPos)}</div>
          </div>
        </div>
        <div style="flex:1;min-width:140px">${legend}</div>
      </div>
    </details>`;
  }

  // ── filter chip (จาก legend ที่เลือก) ──
  let filterBar = '';
  if (astCommTypeFilter) {
    const meta = ASTCOMM_TYPE_META[astCommTypeFilter] || { label: astCommTypeFilter, color: 'var(--t2)' };
    filterBar = `<div class="comm-filter-chip">
      <span style="width:8px;height:8px;border-radius:50%;background:${meta.color};box-shadow:0 0 6px ${meta.color}"></span>
      <span style="font-size:12px;color:var(--t1);font-weight:700;flex:1">${meta.label}</span>
      <button onclick="astCommClearTypeFilter()" style="background:none;border:none;color:var(--gold-dim);cursor:pointer;font-size:11.5px;font-weight:600">${tccT('clear_filter')}</button>
    </div>`;
  }

  const tableRows0 = astCommTypeFilter ? filtered.filter(p => p.type === astCommTypeFilter) : filtered;

  // ── ตาราง — 10 รายการ/หน้า ──
  const TPER = 10;
  const tableData = tableRows0.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalTPages = Math.max(1, Math.ceil(tableData.length / TPER));
  const tPage = Math.min(astCommPage, Math.max(0, totalTPages - 1));
  const pageData = tableData.slice(tPage * TPER, (tPage + 1) * TPER);

  const pagBtn = (p, lbl, dis) => `<button class="comm-pag-btn" onclick="${dis ? '' : 'astCommSetPage(' + p + ')'}"
    style="cursor:${dis ? 'not-allowed' : 'pointer'};
    border:1px solid ${dis ? 'var(--border)' : 'var(--gold-25)'};background:${dis ? 'var(--bg3)' : 'var(--gold-08)'};color:${dis ? 'var(--t2)' : 'var(--gold)'}">${lbl}</button>`;
  const tablePag = totalTPages > 1 ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;flex-wrap:wrap">
    ${pagBtn(0, '«', tPage === 0)}
    ${pagBtn(Math.max(0, tPage - 1), '‹', tPage === 0)}
    <span style="font-size:12px;color:var(--t2);padding:0 6px">${tccT('page_x_of_y')} ${tPage + 1}/${totalTPages}</span>
    ${pagBtn(Math.min(totalTPages - 1, tPage + 1), '›', tPage === totalTPages - 1)}
    ${pagBtn(totalTPages - 1, '»', tPage === totalTPages - 1)}
  </div>` : '';

  // [PREMIUM v5] การ์ดโทนทองเข้ม + จุดสีบ่งบอกประเภท + ตารางพรีเมียมพื้นเข้มยกกรอบ
  // [DETAIL v5] เก็บ pageData ไว้ให้ astCommShowDetail() อ้างอิงตอนคลิกแถว
  _astCommDetailRows = pageData;
  const tableRowsHtml = pageData.map((p, _i) => {
    const meta = ASTCOMM_TYPE_META[p.type] || { label: p.type, color: 'var(--t2)' };
    return `<tr onclick="astCommShowDetail(${_i})">
      <td style="color:var(--t2)">${String(p.date).slice(0, 10)}</td>
      <td style="color:var(--t2)">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${meta.color};margin-right:6px;vertical-align:middle;box-shadow:0 0 5px ${meta.color}"></span>${meta.label}
      </td>
      <td style="font-family:var(--mono);color:var(--jade);font-weight:600">+${astCommFmt(p.amount)}</td>
    </tr>`;
  }).join('');

  const tableHtml = `<div class="comm-section-title" style="margin:0 0 8px">
      ${astCommMonth ? tccT('records_monthly') : tccT('records_list')} <span style="font-weight:400;color:var(--t2);font-size:11px">(${tccT('showing_x_of_y')} ${pageData.length}/${tableData.length})</span>
    </div>
    <div class="comm-table-wrap">
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th><span data-i18n="date">${tccT('date')}</span></th>
            <th><span data-i18n="type">${tccT('type')}</span></th>
            <th>${tccT('amount_col')}</th>
          </tr></thead>
          <tbody>${tableRowsHtml || `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--t2)"><span data-i18n="no_data">${tccT('no_data')}</span></td></tr>`}</tbody>
        </table>
      </div>
      ${tablePag}
    </div>`;

  box.innerHTML = monthSel + summCards + chartHtml + filterBar + tableHtml;
}

// ══════════════════════════════════════════════════════════════
// [DETAIL v5] Commission row detail sheet — เปิดตอนคลิกแถวใน "สัดส่วนรายได้" (astCommRenderWidget)
// หรือ Commission History overlay (_commHistRenderLedger) — ทั้งสองที่เก็บหน้าปัจจุบันไว้ใน
// _astCommDetailRows ก่อน render แล้ว onclick ส่ง index ของแถวนั้นมาเปิด sheet นี้
// ข้อมูลที่โชว์มาจาก getMemberDashboard (GAS) ที่ส่ง contractId/sourceUid/note มาอยู่แล้ว
// ══════════════════════════════════════════════════════════════
function astCommShowDetail(idx) {
  const row = _astCommDetailRows[idx];
  if (!row) return;
  const meta = ASTCOMM_TYPE_META[row.type] || { label: row.type, color: 'var(--t2)' };

  const dt = new Date(row.date);
  const dateStr = !isNaN(dt.getTime())
    ? dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')
      + ' ' + String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0') + ':' + String(dt.getSeconds()).padStart(2,'0')
    : String(row.date);

  // แถวข้อมูลเสริม — โชว์เฉพาะที่มีค่าจริง (ไม่ใช่ทุก type จะมี contractId/sourceUid/note)
  const infoRows = [];
  if (row.sourceUid) infoRows.push(['จากสมาชิก', row.sourceUid]);
  if (row.contractId) infoRows.push(['Contract ID', row.contractId]);
  if (row.note) infoRows.push(['หมายเหตุ', row.note]);

  const infoHtml = infoRows.map(([k, v]) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--t2)">${k}</span>
      <span style="font-size:12px;color:var(--t1);font-family:var(--mono);text-align:right;word-break:break-all">${v}</span>
    </div>`).join('');

  document.getElementById('astCommDetailBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${meta.color};flex-shrink:0"></span>
      <span style="font-size:14px;font-weight:700;color:var(--t1)">${meta.label}</span>
    </div>
    <div style="font-family:var(--mono);font-size:26px;font-weight:700;color:var(--jade);margin:10px 0 2px">+${astCommFmt(row.amount)}</div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:14px">${dateStr}</div>
    ${infoHtml ? `<div style="border-top:1px solid var(--border);margin-top:4px">${infoHtml}</div>` : ''}
  `;

  document.getElementById('ast-overlay-comm-detail').classList.add('visible');
  document.getElementById('ast-sheet-comm-detail').classList.add('open');
}
function astCommCloseDetail() {
  document.getElementById('ast-overlay-comm-detail').classList.remove('visible');
  document.getElementById('ast-sheet-comm-detail').classList.remove('open');
}

// ── Commission → Spot transfer (NEW v3) — ใช้ transferOverlay-style layout ──
// แยกจาก TF/openTransfer() เจตนา: one-direction (Commission→Spot), มีเงื่อนไข min + approvedCount

function astOpenCommissionTransfer() {
  // reset input
  const inp   = document.getElementById('astCommTfAmount');
  const avail = document.getElementById('astCommTfAvail');
  const err   = document.getElementById('commTfErrorMsg');
  const btn   = document.getElementById('astCommTfConfirmBtn');

  if (inp) inp.value = '';

  // กำหนดข้อความ error ตามสถานการณ์ — แสดงใน overlay แทน toast
  let errorMsg = '';
  if (!_commissionLoaded) {
    errorMsg = 'กำลังโหลดยอด กรุณารอสักครู่';
  } else if (!commissionCanTransfer) {
    errorMsg = tccTF('gate_min_approved_transfer', {min: commissionMinApproved, cur: commissionApprovedCount});
  } else if (commissionBalance <= 0) {
    errorMsg = 'No amount available to transfer, please select another coin.';
  }

  if (avail) avail.textContent = `Available ${commissionBalance.toFixed(8)} USDT`;
  if (err)   { err.textContent = errorMsg; err.style.display = errorMsg ? '' : 'none'; }
  // disable Confirm ถ้ามี error เงื่อนไข — ผู้ใช้ยังเห็น overlay และอ่านสาเหตุได้
  if (btn)   btn.disabled = !!(errorMsg);
  // แสดง hint ขั้นต่ำใต้ช่อง Amount เสมอ (ถ้ามีเงื่อนไขขั้นต่ำ)
  const hint = document.getElementById('commTfAmountHint');
  if (hint) {
    const _min = commissionMinAmount > 0 ? commissionMinAmount : 0.01;
    if (_min > 0.01) {
      hint.textContent = tccTF('hint_min_transfer',{min:_min.toFixed(2)});
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
    }
  }

  // เปิด overlay เสมอ ไม่ว่าจะมี error หรือไม่
  const ov = document.getElementById('commTfOverlay');
  const sh = document.getElementById('commTfSheet');
  if (ov && sh) {
    ov.style.display = 'flex';
    requestAnimationFrame(() => sh.style.transform = 'translateY(0)');
  }
}

// ══════════════════════════════════════════════════════════════
// [NEW] Commission History Overlay
// 2 sub-tabs: "ค่าคอมมิชชั่น" (astCommRows) + "การแนะนำสมาชิก" (astCommHistRefMembers)
// ไม่มี network call เพิ่ม — ดึงข้อมูลจาก response ที่โหลดมาแล้วใน astRenderCommissionTab()
// ── state ──
let _commHistTab        = 'comm-ledger'; // tab ที่แสดงอยู่
let _commHistSearch     = '';            // ช่องค้นหา (ใช้ทั้ง 2 tab)
let _commHistMonth      = '';            // '' = ทั้งหมด (tab ค่าคอม)
let _commHistTypeFilter = '';            // กรอง type (tab ค่าคอม)
let _commHistStatusFilter = '';          // กรอง status approved/pending (tab แนะนำ)
let _commHistPage       = 0;
let astCommHistRefMembers = [];          // เก็บ referredMembers จาก ref response

// ── เปิด/ปิด overlay ──
function astOpenCommHistOverlay() {
  // ดึง referredMembers จาก cache commref_ ถ้ายังไม่มีในหน่วยความจำ
  _commHistSyncRefMembers();
  _commHistTab        = 'comm-ledger';
  _commHistSearch     = '';
  _commHistMonth      = '';
  _commHistTypeFilter = '';
  _commHistStatusFilter = '';
  _commHistPage       = 0;
  // set active tab UI
  document.querySelectorAll('#commHistTabsRow .myt-tab').forEach(t => t.classList.remove('active'));
  const firstTab = document.querySelector('#commHistTabsRow .myt-tab[data-chtab="comm-ledger"]');
  if (firstTab) firstTab.classList.add('active');
  // อัปเดต badge count
  _commHistUpdateCounts();
  const ov = document.getElementById('commHistOverlay');
  if (ov) { ov.style.visibility = 'visible'; ov.classList.add('open'); }
  astCommHistRender();
}

function astCloseCommHistOverlay() {
  const ov = document.getElementById('commHistOverlay');
  if (ov) {
    ov.classList.remove('open');
    setTimeout(() => { ov.style.visibility = 'hidden'; }, 300);
  }
}

// ── sync referredMembers จาก cache (best-effort) ──
function _commHistSyncRefMembers() {
  try {
    const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
    const uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
              : (typeof USER_PROFILE !== 'undefined' && USER_PROFILE ? USER_PROFILE.uid : '');
    if (!uid) return;
    const cacheKey = 'commref_' + uid;
    // ลองอ่านจาก sessionStorage ที่ dbRead() เก็บไว้
    const raw = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      // dbRead cache wrapper: { data, ts } หรือ raw object
      const ref = (parsed && parsed.data) ? parsed.data : parsed;
      if (ref && Array.isArray(ref.referredMembers)) {
        astCommHistRefMembers = ref.referredMembers;
        return;
      }
    }
  } catch(e) { /* silent */ }
  // ถ้าอ่าน cache ไม่ได้ ใช้ array เปล่า (ข้อมูลจะแสดงเมื่อโหลด Commission tab แล้ว)
}

// ── switch tab ──
function astCommHistSwitchTab(tabId, el) {
  _commHistTab = tabId;
  _commHistSearch = '';
  _commHistPage = 0;
  document.querySelectorAll('#commHistTabsRow .myt-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  astCommHistRender();
}

// ── อัปเดต badge count บน tab ──
function _commHistUpdateCounts() {
  const lc = document.getElementById('commHistLedgerCount');
  const rc = document.getElementById('commHistRefCount');
  if (lc) lc.textContent = astCommRows.length;
  if (rc) rc.textContent = astCommHistRefMembers.length;
}

// ── Render หลัก: filter bar + content ──
function astCommHistRender() {
  _commHistUpdateCounts();
  if (_commHistTab === 'comm-ledger') {
    _commHistRenderFilterBarLedger();
    _commHistRenderLedger();
  } else {
    _commHistRenderFilterBarRef();
    _commHistRenderRef();
  }
}

// ── Filter bar: ค่าคอมมิชชั่น ──
function _commHistRenderFilterBarLedger() {
  const fb = document.getElementById('commHistFilterArea');
  if (!fb) return;
  // เดือน dropdown
  const months = {};
  astCommRows.forEach(p => {
    const d = new Date(p.date);
    if (!isNaN(d.getTime())) {
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      months[k] = true;
    }
  });
  const sortedM = Object.keys(months).sort().reverse();
  const monthOpts = sortedM.map(k => {
    const [y, mo] = k.split('-');
    const label = astCommThaiMonth(parseInt(mo)) + ' ' + (parseInt(y)+543);
    return `<option value="${k}" ${_commHistMonth===k?'selected':''}>${label}</option>`;
  }).join('');

  // type dropdown (ค่าคอมประเภท)
  const typeKeys = Object.keys(ASTCOMM_TYPE_META);
  const typeOpts = typeKeys.map(t => {
    const meta = ASTCOMM_TYPE_META[t];
    return `<option value="${t}" ${_commHistTypeFilter===t?'selected':''}>${meta.label.replace(/[💰🏠🅰️🅱️🔗]/u,'').trim()}</option>`;
  }).join('');

  fb.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%">
      <input id="commHistSearchInp" type="text" value="${_commHistSearch.replace(/"/g,'&quot;')}"
        data-i18n-placeholder="search_symbol" placeholder="🔍 ค้นหาประเภท / วันที่"
        oninput="_commHistSearch=this.value;_commHistPage=0;_commHistRenderLedger()"
        style="flex:1;min-width:120px;max-width:200px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rmd);color:var(--t1);font-size:12px;padding:6px 10px;outline:none;font-family:var(--sans)"/>
      <select onchange="_commHistMonth=this.value;_commHistPage=0;_commHistRenderLedger()"
        style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rmd);color:var(--t1);font-size:12px;padding:6px 8px;outline:none;cursor:pointer;font-family:var(--sans)">
        <option value="" ${!_commHistMonth?'selected':''}><span data-i18n="every_month">${tccT('every_month')}</span></option>
        ${monthOpts}
      </select>
      <select onchange="_commHistTypeFilter=this.value;_commHistPage=0;_commHistRenderLedger()"
        style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rmd);color:var(--t2);font-size:12px;padding:6px 8px;outline:none;cursor:pointer;font-family:var(--sans)">
        <option value="" ${!_commHistTypeFilter?'selected':''}><span data-i18n="all_type">${tccT('all_type')}</span></option>
        ${typeOpts}
      </select>
    </div>`;
}

// ── Filter bar: แนะนำสมาชิก ──
function _commHistRenderFilterBarRef() {
  const fb = document.getElementById('commHistFilterArea');
  if (!fb) return;
  fb.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%">
      <input id="commHistSearchInp" type="text" value="${_commHistSearch.replace(/"/g,'&quot;')}"
        data-i18n-placeholder="search_symbol" placeholder="🔍 ค้นหาชื่อ / UID"
        oninput="_commHistSearch=this.value;_commHistPage=0;_commHistRenderRef()"
        style="flex:1;min-width:140px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rmd);color:var(--t1);font-size:12px;padding:6px 10px;outline:none;font-family:var(--sans)"/>
      <select onchange="_commHistStatusFilter=this.value;_commHistPage=0;_commHistRenderRef()"
        style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rmd);color:var(--t2);font-size:12px;padding:6px 8px;outline:none;cursor:pointer;font-family:var(--sans)">
        <option value="" ${!_commHistStatusFilter?'selected':''}><span data-i18n="all_status">${tccT('all_status')}</span></option>
        <option value="approved" ${_commHistStatusFilter==='approved'?'selected':''}>✅ Approved</option>
        <option value="pending"  ${_commHistStatusFilter==='pending' ?'selected':''}>⏳ Pending</option>
      </select>
    </div>`;
}

// ── Render: ค่าคอมมิชชั่น ──
function _commHistRenderLedger() {
  const box = document.getElementById('commHistContent');
  if (!box) return;
  const TPER = 15;
  const sq = (_commHistSearch || '').toLowerCase();
  let rows = astCommRows;
  // กรองเดือน
  if (_commHistMonth) {
    rows = rows.filter(p => {
      const d = new Date(p.date);
      if (isNaN(d.getTime())) return false;
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === _commHistMonth;
    });
  }
  // กรองประเภท
  if (_commHistTypeFilter) rows = rows.filter(p => p.type === _commHistTypeFilter);
  // ค้นหา
  if (sq) {
    rows = rows.filter(p => {
      const meta = ASTCOMM_TYPE_META[p.type] || { label: p.type };
      return String(p.date).toLowerCase().includes(sq)
          || meta.label.toLowerCase().includes(sq)
          || p.type.toLowerCase().includes(sq);
    });
  }
  // sort วันที่ล่าสุดก่อน
  rows = rows.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
  const totalPages = Math.max(1, Math.ceil(rows.length / TPER));
  const page = Math.min(_commHistPage, totalPages - 1);
  const pageData = rows.slice(page * TPER, (page+1) * TPER);
  // summary ยอดรวมที่กรองแล้ว
  const total = rows.reduce((s,p) => s + p.amount, 0);
  const summaryHtml = rows.length ? `<div style="background:var(--bg3);border:1px solid var(--gold-25);border-radius:var(--rmd);padding:10px 13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:12px;color:var(--t2)">${rows.length} ${tccT('records_list')}</span>
    <span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--gold)">+${astCommFmt(total)}</span>
  </div>` : '';
  // rows — [PREMIUM v4] label เทาสม่ำเสมอ + amount เขียวหม่น (jade) + จุดสีเล็กบอกหมวดหมู่
  // [DETAIL v5] เก็บ pageData ไว้ให้ astCommShowDetail() อ้างอิงตอนคลิกแถว
  _astCommDetailRows = pageData;
  const rowsHtml = pageData.map((p, _i) => {
    const meta = ASTCOMM_TYPE_META[p.type] || { label: p.type, color: 'var(--t2)' };
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="astCommShowDetail(${_i})">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--t2)">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${meta.color};margin-right:6px;vertical-align:middle"></span>${meta.label}
        </div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px;margin-left:12px">${String(p.date).slice(0,10)}</div>
      </div>
      <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--jade)">+${astCommFmt(p.amount)}</div>
    </div>`;
  }).join('');
  // pagination
  const pagHtml = _commHistPagHtml(page, totalPages, `_commHistPage=%p;_commHistRenderLedger()`);
  box.innerHTML = rows.length
    ? summaryHtml + rowsHtml + pagHtml
    : `<div style="text-align:center;padding:40px 0;color:var(--t2);font-size:13px">${tccT('no_records_filter')}</div>`;
}

// ── Render: แนะนำสมาชิก ──
function _commHistRenderRef() {
  const box = document.getElementById('commHistContent');
  if (!box) return;
  const TPER = 15;
  const sq = (_commHistSearch || '').toLowerCase();
  let rows = astCommHistRefMembers;
  // กรองสถานะ
  if (_commHistStatusFilter) rows = rows.filter(m => m.status === _commHistStatusFilter);
  // ค้นหา
  if (sq) {
    rows = rows.filter(m =>
      (m.name || '').toLowerCase().includes(sq)
      || String(m.uid || '').toLowerCase().includes(sq)
    );
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / TPER));
  const page = Math.min(_commHistPage, totalPages - 1);
  const pageData = rows.slice(page * TPER, (page+1) * TPER);

  if (!rows.length) {
    box.innerHTML = astCommHistRefMembers.length
      ? `<div style="text-align:center;padding:40px 0;color:var(--t2);font-size:13px">🔍 ${tccT('no_member_search')}</div>`
      : `<div style="text-align:center;padding:40px 0;color:var(--t2);font-size:13px">📭 ยังไม่มีสมาชิกที่คุณแนะนำ<br><span style="font-size:11px"><span data-i18n="open_comm_tab">${tccT('open_comm_tab')}</span></span></div>`;
    return;
  }

  const summaryHtml = `<div style="background:var(--g-10);border:1px solid var(--g-20);border-radius:var(--rmd);padding:10px 13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:12px;color:var(--t2)">${rows.length} ${tccT('persons_unit')}</span>
    <span style="font-size:12px;font-weight:700;color:var(--g)">${rows.filter(m=>m.status==='approved').length} Approved · ${rows.filter(m=>m.status==='pending').length} Pending</span>
  </div>`;

  const rowsHtml = pageData.map((m, i) => {
    const globalIdx = page * TPER + i;
    const isOk   = m.status === 'approved';
    const isPend = m.status === 'pending';
    const leftColor = isOk ? 'var(--g)' : isPend ? 'var(--y)' : 'var(--r)';
    const stLabel = isOk
      ? `<span style="background:var(--g-10);border:1px solid var(--g-20);color:var(--g);font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700">✅ Approved</span>`
      : isPend
      ? `<span style="background:var(--y-10);border:1px solid var(--y-25);color:var(--y);font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700">⏳ Pending</span>`
      : `<span style="background:var(--r-10);border:1px solid var(--r-25);color:var(--r);font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700">❌ ${m.status||'?'}</span>`;
    const bonusTxt = isOk && m.flatBonusPaid > 0
      ? `<div style="font-family:var(--mono);font-size:11px;color:var(--g);margin-top:2px">+${astCommFmt(m.flatBonusPaid)}</div>`
      : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);border-left:3px solid ${leftColor};padding-left:10px">
      <div style="width:26px;height:26px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--t2);flex-shrink:0">${globalIdx+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name||'—'}</div>
        <div style="font-size:11px;color:var(--t2);font-family:var(--mono);margin-top:1px">${m.uid||''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
        ${stLabel}
        ${bonusTxt}
      </div>
    </div>`;
  }).join('');

  const pagHtml = _commHistPagHtml(page, totalPages, `_commHistPage=%p;_commHistRenderRef()`);
  box.innerHTML = summaryHtml + rowsHtml + pagHtml;
}

// ── helper: pagination HTML ──
function _commHistPagHtml(page, totalPages, actionTpl) {
  if (totalPages <= 1) return '';
  const btn = (p, lbl, dis) => {
    const action = dis ? '' : actionTpl.replace(/%p/g, p);
    return `<button onclick="${action}" style="padding:5px 10px;border-radius:var(--rmd);font-size:12px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};border:1px solid ${dis?'var(--border)':'var(--gold-25)'};background:${dis?'var(--bg3)':'var(--gold-08)'};color:${dis?'var(--t2)':'var(--gold)'}">${lbl}</button>`;
  };
  return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;flex-wrap:wrap">
    ${btn(0,'«',page===0)}
    ${btn(Math.max(0,page-1),'‹',page===0)}
    <span style="font-size:12px;color:var(--t2);padding:0 6px">${tccT('page_x_of_y')} ${page+1}/${totalPages}</span>
    ${btn(Math.min(totalPages-1,page+1),'›',page===totalPages-1)}
    ${btn(totalPages-1,'»',page===totalPages-1)}
  </div>`;
}

// ── Hook: เมื่อ astRenderCommissionTab โหลดเสร็จ ให้ sync ref members ด้วย ──
// (เรียกหลัง _commissionLoaded = true — patch astRenderCommissionTab ด้วยการ override หลังจาก define)
(function _patchCommHistRefSync() {
  const _orig = typeof astRenderCommissionTab !== 'undefined' ? astRenderCommissionTab : null;
  if (!_orig) return; // ยังไม่ define ตอน parse — ไม่เป็นไร เพราะ _commHistSyncRefMembers() อ่าน cache เอาเอง
})();

function astCloseCommTfSheet() {
  const ov = document.getElementById('commTfOverlay');
  const sh = document.getElementById('commTfSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(() => { if (ov) ov.style.display = 'none'; }, 380);
}

function astCommTfOverlayClick(e) {
  if (e.target === document.getElementById('commTfOverlay')) astCloseCommTfSheet();
}

// input handler — enable/disable Confirm btn ตามค่าที่พิมพ์
function commTfOnAmountChange() {
  const inp  = document.getElementById('astCommTfAmount');
  const btn  = document.getElementById('astCommTfConfirmBtn');
  const hint = document.getElementById('commTfAmountHint');
  if (!inp || !btn) return;
  const amt = parseFloat(inp.value) || 0;
  // ต้องโหลดเสร็จ + ผ่านเงื่อนไข + ยอดพอ + ยอดมากกว่า 0
  const effectiveMin = commissionMinAmount > 0 ? commissionMinAmount : 0.01;
  const ok = (
    _commissionLoaded &&
    commissionCanTransfer &&
    amt > 0 &&
    amt >= effectiveMin &&
    amt <= commissionBalance
  );
  btn.disabled = !ok;
  // อัปเดต hint ใต้ช่อง Amount
  if (hint) {
    if (amt > 0 && amt < effectiveMin) {
      hint.textContent = tccTF('hint_min_transfer_entered',{min:effectiveMin.toFixed(2),amt:amt.toFixed(2)});
      hint.style.display = '';
    } else if (amt > commissionBalance && amt > 0) {
      hint.textContent = tccTF('hint_insufficient_balance',{bal:commissionBalance.toFixed(2)});
      hint.style.display = '';
    } else if (effectiveMin > 0.01) {
      // คงแสดง hint ขั้นต่ำเสมอเมื่อยังไม่ได้พิมพ์
      hint.textContent = amt === 0 ? tccTF('hint_min_transfer',{min:effectiveMin.toFixed(2)}) : '';
      hint.style.display = amt === 0 ? '' : 'none';
    } else {
      hint.style.display = 'none';
    }
  }
}

// Max button
function commTfSetMax() {
  const inp = document.getElementById('astCommTfAmount');
  if (!inp) return;
  if (commissionBalance > 0) {
    // ตัดเศษเล็กน้อยเพื่อป้องกัน "ยอดไม่พอ" จาก floating point
    inp.value = Math.floor(commissionBalance * 100) / 100;
  } else {
    inp.value = '';
  }
  commTfOnAmountChange();
}

async function astSubmitCommissionTransfer() {
  const amt = parseFloat(document.getElementById('astCommTfAmount').value) || 0;
  const _effectiveMin = commissionMinAmount > 0 ? commissionMinAmount : 0.01;
  if (amt < _effectiveMin) { showToast(tccTF('toast_min_transfer_amt',{min:_effectiveMin})); return; }
  if (amt > commissionBalance)   { showToast(tccT('toast_commission_insufficient')); return; }

  const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
  const uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
            : (typeof USER_PROFILE !== 'undefined' && USER_PROFILE ? USER_PROFILE.uid : '');
  if (!uid) { showToast(tccT('toast_no_session')); return; }

  const btn = document.getElementById('astCommTfConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = tccT('btn_transferring'); }
  try {
    // action เดิม (logCommissionTransfer) — เดียวกับที่ member2.html ใช้
    await dbCallRaw('logCommissionTransfer', { uid, direction: 'toMain', amount: amt });
    showToast(tccT('toast_transfer_success'));
    astCloseCommTfSheet();
    // optimistic update ทันที — ให้ผู้ใช้เห็นยอดเปลี่ยนทันที
    commissionBalance = Math.max(0, commissionBalance - amt);
    if (typeof mainWalletBalance !== 'undefined') mainWalletBalance += amt;
    astUpdateCommissionDisplay();
    if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
    if (typeof renderSpotBalanceList === 'function') renderSpotBalanceList();
    // reload ยอดจริงจาก GAS หลัง 1.5 วินาที เพื่อ confirm ยอดที่ถูกต้อง
    // [FIX] reset throttle timer กันโหลด cache เก่า — ดึงยอดสดจาก GAS ทันทีหลังโอนสำเร็จ
    _commTabLastMs = 0;
    setTimeout(() => {
      if (typeof astRenderCommissionTab === 'function') astRenderCommissionTab();
    }, 1500);
  } catch (e) {
    showToast(tccTF('toast_transfer_fail',{msg:e.message||''}));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Transfer'; }
  }
}

function astSwitchTab(name, el) {
  document.querySelectorAll('.ast-page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('ast-page-' + name);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.ast-tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  // [FIX back] บันทึก sub-tab ปัจจุบันลง pageHistory ก่อนเปลี่ยน เพื่อให้ Back กลับมาถูก tab
  // format: 'assets__<tabName>' — handleBackButton จะถอด prefix ออกและ restore sub-tab
  if (astCurrentTab && astCurrentTab !== name && typeof pageHistory !== 'undefined') {
    pageHistory.push('assets__' + astCurrentTab);
    if (pageHistory.length > 30) pageHistory.shift();
  }
  astCurrentTab = name;
  try { history.pushState({ tccPage: 'assets', astTab: name }, '', '#assets__' + name); } catch(e) {}
  document.getElementById('astMain')?.scrollTo(0, 0);
  // Hook: render Futures tab ทุกครั้งที่เปิด
  if (name === 'futures-a') renderAstFuturesTab();
  // [NEW] Hook: render Commission tab ทุกครั้งที่เปิด — โหลดยอดสดจาก GAS (getMemberDashboard + getReferralDashboard)
  if (name === 'commission') { if (typeof astRenderCommissionTab === 'function') astRenderCommissionTab(); }
  // [v7 FIX] Hook: render Earn Contracts ทุกครั้งที่เปิด Earn tab
  // เพื่อแสดงสัญญาล่าสุดหลัง loadOfflineState โหลดเสร็จ
  if (name === 'earn') {
    if (typeof renderEarnContracts === 'function') renderEarnContracts();
    // ถ้า earnContracts ว่างและมี uid → ลอง reload จาก GAS อีกครั้ง
    if (typeof earnContracts !== 'undefined' && earnContracts.length === 0) {
      const _sess2 = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
      const _uid2  = (_sess2 && _sess2.uid) ? String(_sess2.uid).trim() : (typeof USER_PROFILE !== 'undefined' ? USER_PROFILE.uid : '');
      if (_uid2) {
        dbCallRaw('getEarnContracts', { uid: _uid2 }).then(res => {
          const list = Array.isArray(res) ? res : (res && Array.isArray(res.contracts) ? res.contracts : []);
          if (list.length && typeof earnContracts !== 'undefined') {
            const gasMap = {};
            list.forEach(r => {
              const c = {
                contractId:      r.contract_id,
                uid:             r.uid || _uid2,
                userId:          r.uid || _uid2,
                stakedAmount:    parseFloat(r.staked_amount)    || 0,
                principal:       parseFloat(r.staked_amount)    || 0,
                currentBalance:  parseFloat(r.current_balance)  || 0,
                frozenBalance:   parseFloat(r.frozen_balance)   || 0,
                planDays:        parseInt(r.plan_days)           || 0,
                dailyYield:      parseFloat(r.daily_yield_pct)  || 0,
                startTime:       parseInt(r.start_time_ms)       || 0,
                endTime:         parseInt(r.end_time_ms)         || 0,
                status:          r.status                        || 'active',
                realizedPnl:     parseFloat(r.realized_pnl)     || 0,
                totalClaimed:    parseFloat(r.total_claimed)     || 0,
                lastYieldTimeMs: parseInt(r.last_yield_time_ms)  || 0,
                lastYieldDay:    parseInt(r.last_yield_day)      || 0,
                lastAptClaimMs:  parseInt(r.last_apt_claim_ms)   || 0,
                // [NEW: TIER] 'standard' | 'vip'
                contractTier:    (String(r.contract_tier || '').toLowerCase() === 'vip') ? 'vip' : 'standard',
              };
              gasMap[c.contractId] = c;
            });
            // merge หรือ push ใหม่
            if (earnContracts.length === 0) {
              earnContracts.push(...Object.values(gasMap));
            } else {
              earnContracts.forEach((c, i) => {
                if (gasMap[c.contractId]) { Object.assign(earnContracts[i], gasMap[c.contractId]); delete gasMap[c.contractId]; }
              });
              Object.values(gasMap).forEach(c => earnContracts.push(c));
            }
            renderEarnContracts();
          }
        }).catch(() => {});
      }
    }
  }
}

function astToggleHide() {
  astHidden = !astHidden;
  document.querySelectorAll('#page-assets .ast-hideable').forEach(el => {
    el.style.filter = astHidden ? 'blur(6px)' : 'none';
  });
}

let astSpotCurrentSeg = 'spot';
function astSpotSegTab(el, seg) {
  document.querySelectorAll('.ast-spot-seg-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  astSpotCurrentSeg = seg || 'spot';
  renderSpotBalanceList();
}

// ══════════════════════════════════════════
//  SPOT WALLET STATE
// ══════════════════════════════════════════
// spotWallet: coin → { bal: number, locked: number }
// USDT in spot = mainWalletBalance
// Other coins can be added via deposit simulation
let spotWallet = {};  // populated dynamically — โหลดจาก GAS SpotCoinBalances ตอน loadDashboard

// [SPOT-FIX] save delta ไปยัง GAS SpotCoinBalances (fire-and-forget)
async function _saveSpotCoinDelta(coin, delta) {
  try {
    const uid = USER_PROFILE && USER_PROFILE.uid;
    if (!uid) return;
    await dbCallRaw('updateSpotCoinBalance', { uid, coin, delta });
  } catch (e) {
    console.warn('[saveSpotCoinDelta] GAS error:', e.message);
  }
}

function getSpotUSDT() {
  return mainWalletBalance;
}

function getSpotCoinUSDValue(coin, bal) {
  const price = parseFloat(S?.coinPrices?.[coin]) || 0;
  return bal * price;
}

function getSpotTotalUSDT() {
  let total = getSpotUSDT();
  for (const [coin, data] of Object.entries(spotWallet)) {
    if (coin === 'USDT') continue;
    total += getSpotCoinUSDValue(coin, data.bal);
  }
  return total;
}

// ── Render spot balance list ──
function renderSpotBalanceList() {
  const listEl = document.getElementById('spotBalanceList');
  if (!listEl) return;

  const usdtBal = getSpotUSDT();
  const totalUsdt = getSpotTotalUSDT();

  // Update header values
  const tv = document.getElementById('spotTotalVal');
  const tu = document.getElementById('spotTotalUsd');
  if (tv) tv.textContent = fmtM(totalUsdt);

  if (tu) tu.textContent = '≈ $' + fmtM(totalUsdt);

  // Build rows
  const rows = [];

  // Always show USDT if > 0
  if (usdtBal > 0) {
    rows.push({
      coin: 'USDT', name: 'TetherUS',
      icon: '₮', bg: '#26a17b', color: '#fff',
      bal: usdtBal, usd: usdtBal,
      locked: 0
    });
  }

  // Other spot coins
  for (const [coin, data] of Object.entries(spotWallet)) {
    if (coin === 'USDT') continue;
    const bal = data.bal || 0;
    if (bal <= 0) continue;
    const usd = getSpotCoinUSDValue(coin, bal);
    const meta = SND_COINS.find(c => c.coin === coin) || { icon: coin[0], bg: '#555', color: '#fff' };
    rows.push({ coin, name: meta.name || coin, icon: meta.icon, bg: meta.bg, color: meta.color, bal, usd, locked: data.locked || 0 });
  }

  if (rows.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;color:var(--t2);padding:40px 20px;font-size:14px">No assets in Spot wallet</div>';
    return;
  }

  listEl.innerHTML = rows.map(r => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="ast-coin-icon" style="background:${r.bg};color:${r.color};width:36px;height:36px;font-size:14px">${r.icon}</div>
        <div>
          <div style="font-size:15px;font-weight:600">${r.coin}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">${r.name}</div>
        </div>
      </div>
      <div style="text-align:right" class="ast-hideable">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono)">${r.coin==='USDT' ? fmtM(r.bal) : r.bal.toFixed(8)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:2px">≈ $${fmtM(r.usd)}</div>
        ${r.locked > 0 ? `<div style="font-size:10px;color:var(--y)">Locked: ${r.locked.toFixed(4)}</div>` : ''}
      </div>
    </div>
  `).join('');
  // [SPOT-FIX] sync Avbl/MaxBuy/Fee ทุกครั้งที่ balance list render
  if (typeof _spUpdateAvbl === 'function') _spUpdateAvbl();
  // [SPOT-FIX] อัปเดต Holdings badge count ทุกครั้ง + re-render ถ้า tab เปิดอยู่
  _updateSpHoldingsCount();
  const _holdTab = document.getElementById('spTab-holdings');
  if (_holdTab && _holdTab.classList.contains('active')) renderSpHoldings();
}

// ══════════════════════════════════════════
//  OVERVIEW ACCOUNT BALANCE SYNC
// ══════════════════════════════════════════
function updateOverviewBalances() {
  // [FIX-3] ถ้า loadDashboard ยังไม่เสร็จ → แสดง loading indicator แทน 0.00
  // ป้องกันผู้ใช้เห็น "0.00 USDT" ก่อนข้อมูลจริงมา
  if (!window._dashboardReady) {
    const _loadingText = '…';
    const _ids = ['astTotalVal','astTotalUsd','astPnlVal',
                   'ovw-futures-usdt','ovw-futures-usd',
                   'ovw-earn-usdt','ovw-earn-usd',
                   'ovw-funding-usdt','ovw-funding-usd',
                   'ovw-spot-usdt','ovw-spot-usd',
                   'funding-total-val','funding-total-usd',
                   'funding-wallet-bal','funding-wallet-usd',
                   'earnTotalBal'];
    // [vx3 FIX-LOAD-GUARD] แก้ condition เดิมที่ตรวจ textContent === '0.00' เท่านั้น
    // ปัญหา: element ที่มี hardcode initial value (เช่น '42.6') ไม่ตรงกับ '0.00' → ไม่ถูก replace
    // แก้: set '…' ทุก element โดยไม่มีเงื่อนไข textContent — ปลอดภัยเพราะอยู่ใน !_dashboardReady guard แล้ว
    _ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = _loadingText; });
    return;
  }
  // [vx3 FIX-FROZEN-BAL] Sync ทุก contract รวม frozen — syncContractBalance จัดการ branch เองแล้ว
  // เดิม: skip frozen → currentBalance ค้างค่าเก่า → earnWalletBal / futuresUsdt ผิด
  earnContracts.forEach(c => { syncContractBalance(c); });

  // Futures Margin Balance = sum(earnContracts currentBalance) - totalUnrealized
  const totalUnrealized = S.positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const earnWalletBal   = earnContracts.reduce((s, c) => s + (c.currentBalance || 0), 0);
  const futuresUsdt     = earnWalletBal - totalUnrealized; // Futures Margin Balance
  const futuresUsd      = futuresUsdt;

  // Earn row: same as wallet balance (for display in the Earn row)
  const earnUsdt = earnContracts.reduce((s, c) => s + (c.currentBalance || 0), 0);

  // Funding (synced from GAS via loadDashboard / updateLocalBalance)
  const fundingUsdt = fundingWalletBalance;

  // [vx3 FIX-SPOT-B] Spot = USDT cash + coin holdings (Exchange wallet จริง)
  // เดิม: mainWalletBalance อย่างเดียว → Spot row ≠ Spot tab header (300k vs 53k)
  // ใหม่: getSpotTotalUSDT() = mainWalletBalance + Σ(coinBal × price) — ตรงกับ Spot tab
  const spotUsdt = getSpotTotalUSDT();

  // [vx3 FIX-TOTAL] Overview Total = Earn + Spot + Funding
  // ไม่ใช้ futuresUsdt เพราะ Futures Margin Balance = Earn Wallet Balance (ซ้ำกัน)
  // earnUsdt = earnWalletBal = sum(currentBalance) — ตรงกับ Earn row และ Futures tab header
  const total = earnUsdt + spotUsdt + fundingUsdt;

  // Update overview rows
  const setRow = (id, usdt, usd) => {
    const el = document.getElementById(id + '-usdt');
    const el2 = document.getElementById(id + '-usd');
    if (el) el.textContent = (usdt < 0.01 ? usdt.toFixed(8) : fmtNum(usdt,2)) + ' USDT';
    if (el2) el2.textContent = '≈ $' + (usd < 0.01 ? usd.toFixed(8) : fmtNum(usd,2));
  };
  setRow('ovw-futures', futuresUsdt, futuresUsd);
  setRow('ovw-earn', earnUsdt, earnUsdt);
  setRow('ovw-funding', fundingUsdt, fundingUsdt);
  setRow('ovw-spot', spotUsdt, spotUsdt);

  // [NEW] อัปเดตหน้า Funding tab (ast-page-funding) ให้แสดง balance จริง
  const ftv = document.getElementById('funding-total-val');
  const ftu = document.getElementById('funding-total-usd');
  const fEmpty = document.getElementById('funding-empty-msg');
  const fRow = document.getElementById('funding-wallet-row');
  const fBal = document.getElementById('funding-wallet-bal');
  const fUsd = document.getElementById('funding-wallet-usd');
  if (ftv) ftv.textContent = fundingUsdt < 0.01 ? fundingUsdt.toFixed(8) : fmtNum(fundingUsdt, 2);
  if (ftu) ftu.textContent = '≈ $' + (fundingUsdt < 0.01 ? fundingUsdt.toFixed(8) : fmtNum(fundingUsdt, 2));
  if (fBal) fBal.textContent = fundingUsdt < 0.01 ? fundingUsdt.toFixed(8) : fmtM(fundingUsdt);
  if (fUsd) fUsd.textContent = '≈ $' + (fundingUsdt < 0.01 ? fundingUsdt.toFixed(8) : fmtM(fundingUsdt));
  if (fEmpty && fRow) {
    if (fundingUsdt > 0) { fEmpty.style.display = 'none'; fRow.style.display = 'block'; }
    else { fEmpty.style.display = 'block'; fRow.style.display = 'none'; }
  }

  // Update total
  const tv = document.getElementById('astTotalVal');
  const tu = document.getElementById('astTotalUsd');
  if (tv) tv.textContent = fmtNum(total,2);
  if (tu) tu.textContent = fmtNum(total,2);

  // [FIX] Today's PNL — ใช้ totalUnrealized จริงแทนตัวเลขเดโมฮาร์ดคอร์
  const pnlEl = document.getElementById('astPnlVal');
  if (pnlEl) {
    const pnlSign = totalUnrealized >= 0 ? '+' : '-';
    const pnlAbs  = Math.abs(totalUnrealized);
    const basis   = total - totalUnrealized; // มูลค่าก่อนรวม PNL วันนี้ ใช้เป็นฐานคิด %
    const pnlPct  = basis > 0 ? (totalUnrealized / basis) * 100 : 0;
    const pctSign = pnlPct >= 0 ? '+' : '-';
    pnlEl.textContent = `${pnlSign}${fmtNum(pnlAbs,2)} USDT (${pctSign}${fmtNum(Math.abs(pnlPct),2)}%)`;
    pnlEl.style.color = totalUnrealized > 0 ? 'var(--g)' : (totalUnrealized < 0 ? 'var(--r)' : 'var(--t2)');
  }

  // Also update spot page header
  renderSpotBalanceList();

  // Also sync earn total
  const earnTb = document.getElementById('earnTotalBal');
  if (earnTb) earnTb.textContent = fmtM(earnUsdt);

  // [SPOT-FIX] Sync SND_COINS ทุก coin จาก spotWallet (ไม่ใช่แค่ USDT)
  const usdtCoin = SND_COINS.find(c => c.coin === 'USDT');
  if (usdtCoin) usdtCoin.bal = mainWalletBalance.toFixed(8);
  for (const [_sc, _sd] of Object.entries(spotWallet)) {
    if (_sc === 'USDT') continue;
    const _entry = SND_COINS.find(c => c.coin === _sc);
    if (_entry) _entry.bal = (_sd.bal || 0).toFixed(8);
  }
}

// ─ Deposit Sheet ─
function astOpenDepositSheet() {
  document.getElementById('ast-overlay-deposit').classList.add('visible');
  document.getElementById('ast-sheet-deposit').classList.add('open');
}
function astCloseAllSheets() {
  document.getElementById('ast-overlay-deposit').classList.remove('visible');
  document.getElementById('ast-sheet-deposit').classList.remove('open');
}

// ─ Select Coin ─
function astOpenSelectCoin() {
  astCloseAllSheets();
  setTimeout(() => {
    document.getElementById('ast-overlay-select-coin').classList.add('active');
  }, 200);
}
function astCloseSelectCoin() {
  document.getElementById('ast-overlay-select-coin').classList.remove('active');
}
function astFilterCoins(q) {
  q = (q || '').toLowerCase();
  document.querySelectorAll('#ast-overlay-select-coin .ast-coin-list-item').forEach(item => {
    const name = item.querySelector('.ast-coin-name')?.textContent.toLowerCase() || '';
    const full = item.querySelector('.ast-coin-fullname')?.textContent.toLowerCase() || '';
    item.style.display = (!q || name.includes(q) || full.includes(q)) ? '' : 'none';
  });
  document.querySelectorAll('#ast-overlay-select-coin .ast-coin-section-separator, #ast-overlay-select-coin .ast-coin-section-title, #ast-overlay-select-coin .ast-history-header, #ast-overlay-select-coin .ast-history-chips').forEach(el => {
    el.style.display = q ? 'none' : '';
  });
}

let astSelectedCoin = 'USDT';
function astSelectCoin(coin) {
  astSelectedCoin = coin;
  document.getElementById('ast-net-coin-label').textContent = coin;
  document.getElementById('ast-addr-coin-title').textContent = coin;
  astCloseSelectCoin();
  astOpenChooseNetwork();
}

// ─ Choose Network ─
// Network metadata — ข้อมูลสำหรับ render network card
const AST_NETWORK_META = {
  BSC: { label:'BNB Smart Chain (BEP20)', confirm:'1 block', minDep:'0.01', arrival:'1 min' },
  TRX: { label:'Tron (TRC20)',            confirm:'1 block', minDep:'0.01', arrival:'1 min' },
  ETH: { label:'Ethereum (ERC20)',        confirm:'6 blocks',minDep:'0.001',arrival:'2 mins' },
  SOL: { label:'Solana',                  confirm:'1 block', minDep:'0.01', arrival:'1 min' },
};

// Cache available networks (reset เมื่อ logout)
let _availableNetworksCache = null;

async function astOpenChooseNetwork() {
  document.getElementById('ast-overlay-choose-network').classList.add('active');
  await _renderNetworkList();
}
function astCloseChooseNetwork() {
  document.getElementById('ast-overlay-choose-network').classList.remove('active');
}

// Render network list จาก GAS pool จริง
async function _renderNetworkList() {
  const container = document.getElementById('ast-network-list-container');
  if (!container) return;

  // แสดง loading
  container.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--t2);font-size:14px"><span data-i18n="loading_network">${tccT('loading_network')}</span></div>`;

  // รอ USER_PROFILE พร้อม (retry สูงสุด 10 ครั้ง × 500ms = 5 วิ)
  for (let i = 0; i < 10; i++) {
    if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE?.uid) break;
    await new Promise(r => setTimeout(r, 500));
  }

  try {
    const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;

    // ดึงจาก cache ก่อน (ลด GAS call)
    let available = _availableNetworksCache;
    if (!available) {
      if (uid) {
        available = await dbCallRaw('getAvailableNetworks', { uid });
        _availableNetworksCache = available;
      } else {
        // ยังไม่ login → แสดงทุก network แต่ disable
        available = [];
      }
    }

    // Render network cards
    const allNets = Object.keys(AST_NETWORK_META);
    let html = '';

    allNets.forEach(net => {
      const meta      = AST_NETWORK_META[net];
      const isAvail   = available.includes(net);
      const disStyle  = isAvail ? '' : 'opacity:0.35;cursor:not-allowed;pointer-events:none;';
      const badge     = isAvail
        ? ''
        : `<span style="font-size:10px;color:#f6465d;background:rgba(246,70,93,0.12);padding:2px 6px;border-radius:4px;margin-left:8px"><span data-i18n="not_available">${tccT('not_available')}</span></span>`;

      html += `<div class="ast-network-item" style="${disStyle}" ${isAvail ? `onclick="astSelectNetwork('${net}','${meta.label}')"` : ''}>
        <div style="font-size:15px;font-weight:700;margin-bottom:10px">${net} ${badge}
          <span style="font-size:13px;font-weight:400;color:var(--t2);margin-left:6px">${meta.label}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin-bottom:10px"/>
        <div style="font-size:13px;color:var(--t2);margin-bottom:4px">${meta.confirm} confirmation/s</div>
        <div style="font-size:13px;color:var(--t2);margin-bottom:4px">Min. deposit >${meta.minDep} USDT</div>
        <div style="font-size:13px;color:var(--t2)">Est. arrival ${meta.arrival}</div>
      </div>`;
    });

    if (available.length === 0) {
      html += `<div style="text-align:center;padding:16px;font-size:13px;color:#f6465d">ยังไม่มี network พร้อมใช้<br><span data-i18n="contact_admin">${tccT('contact_admin')}</span></div>`;
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('[_renderNetworkList]', err);
    // Fallback: แสดงทุก network ถ้า GAS ไม่ตอบ
    const allNets = Object.keys(AST_NETWORK_META);
    let html = '';
    allNets.forEach(net => {
      const meta = AST_NETWORK_META[net];
      html += `<div class="ast-network-item" onclick="astSelectNetwork('${net}','${meta.label}')">
        <div style="font-size:15px;font-weight:700;margin-bottom:10px">${net}
          <span style="font-size:13px;font-weight:400;color:var(--t2);margin-left:6px">${meta.label}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin-bottom:10px"/>
        <div style="font-size:13px;color:var(--t2);margin-bottom:4px">${meta.confirm} confirmation/s</div>
        <div style="font-size:13px;color:var(--t2);margin-bottom:4px">Min. deposit >${meta.minDep} USDT</div>
        <div style="font-size:13px;color:var(--t2)">Est. arrival ${meta.arrival}</div>
      </div>`;
    });
    container.innerHTML = html;
  }
}

// ─ Deposit Address [WALLET v1] ─
// address ดึงจาก GAS assignDepositWallet แทน hardcode demo
const AST_NET_SUBS = {
  BSC:'BNB Smart Chain (BEP20)', TRX:'Tron (TRC20)', ETH:'Ethereum (ERC20)', SOL:'Solana'
};
let astSelectedNetwork = 'BSC';

// Cache ที่อยู่กระเป๋าของสมาชิกแต่ละ network (ไม่ต้อง assign ซ้ำ)
const _depositWalletCache = {};

async function astSelectNetwork(net, desc) {
  astSelectedNetwork = net;
  astCloseChooseNetwork();

  // แสดง loading ก่อน
  document.getElementById('ast-addr-net-name').textContent = net;
  document.getElementById('ast-addr-net-sub').textContent = AST_NET_SUBS[net] || desc;
  const addrEl = document.getElementById('ast-addr-text');
  addrEl.innerHTML = `<span style="color:var(--t2)"><span data-i18n="loading_address">${tccT('loading_address')}</span></span>`;
  const logos = {BTC:'₿',ETH:'Ξ',BNB:'B',SOL:'S',TRX:'T',USDT:'₮',USDC:'$'};
  document.getElementById('ast-qr-logo').textContent = logos[astSelectedCoin] || astSelectedCoin.charAt(0);
  astOpenDepositAddress('');

  try {
    // รอ USER_PROFILE พร้อม (retry สูงสุด 10 ครั้ง × 500ms = 5 วิ)
    for (let i = 0; i < 10; i++) {
      if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE?.uid) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;
    if (!uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');

    // ดึงจาก cache ก่อน
    const cacheKey = uid + '_' + net;
    let addr = _depositWalletCache[cacheKey];

    if (!addr) {
      // เรียก GAS assignDepositWallet
      const result = await dbCallRaw('assignDepositWallet', { uid, network: net });
      addr = result.address;
      _depositWalletCache[cacheKey] = addr;
    }

    // แสดง address จริง
    _astShowDepositAddress(addr, net);

  } catch (err) {
    addrEl.innerHTML = `<span style="color:#f6465d">${tccTF('err_generic_prefix',{msg:err.message||tccT('err_load_address_fail')})}</span>`;
    const qrDiv = document.getElementById('ast-qr-code');
    if (qrDiv) qrDiv.innerHTML = '';
    console.error('[astSelectNetwork] Error:', err);
  }
}

function _astShowDepositAddress(addr, net) {
  document.getElementById('ast-addr-net-name').textContent = net;
  document.getElementById('ast-addr-net-sub').textContent = AST_NET_SUBS[net] || net;
  const addrEl = document.getElementById('ast-addr-text');
  if (addr && addr.length > 12) {
    const h1 = addr.substring(0, 6);
    const mid = addr.substring(6, addr.length - 6);
    const h2  = addr.substring(addr.length - 6);
    addrEl.innerHTML = '<span style="color:var(--y)">' + h1 + '</span>' + mid + '<span style="color:var(--y)">' + h2 + '</span>';
  } else {
    addrEl.textContent = addr || '-';
  }
  // สร้าง QR code ใหม่
  if (addr) {
    const qrDiv = document.getElementById('ast-qr-code');
    if (qrDiv) {
      qrDiv.innerHTML = '';
      try {
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrDiv, { text: addr, width: 160, height: 160, colorDark: '#000', colorLight: '#fff' });
        }
      } catch(e) {}
    }
  }
}

function astOpenDepositAddress(addr) {
  // เปิดหน้า — QR และ address จะถูก render โดย _astShowDepositAddress() หลัง GAS ตอบกลับ
  document.getElementById('ast-page-deposit-address').classList.add('active');
  // ถ้า addr มาแล้ว (กรณี cache) ให้ render ทันที
  if (addr) _astShowDepositAddress(addr, astSelectedNetwork);
}

function astCloseDepositAddress() {
  document.getElementById('ast-page-deposit-address').classList.remove('active');
}

function astCopyAddress() {
  // ดึง address จาก DOM (ไม่ใช้ hardcode อีกต่อไป)
  const addrEl = document.getElementById('ast-addr-text');
  const addr   = addrEl ? (addrEl.textContent || addrEl.innerText || '').trim() : '';
  if (addr && navigator.clipboard) navigator.clipboard.writeText(addr).catch(()=>{});
  if (addr) showToast('Address copied!');
}


// ═══════════════════════════════════════════════
//  WITHDRAW / SEND FLOW
// ═══════════════════════════════════════════════

// ─── Network configs per coin (with real fees) ───
const SND_NETWORKS = {
  USDT: [
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.01,  minW:5,    confirm:1,  arrival:'1 mins',  gas:'~$0.01' },
    { id:'OPBNB',  name:'OPBNB',sub:'opBNB',                  fee:0.015, minW:5,    confirm:1,  arrival:'2 mins',  gas:'~$0.015' },
    { id:'TRX',    name:'TRX',  sub:'Tron (TRC20)',            fee:1.3,   minW:5,    confirm:1,  arrival:'1 mins',  gas:'~$1.30' },
    { id:'APT',    name:'APT',  sub:'Aptos',                   fee:0.1,   minW:5,    confirm:1,  arrival:'1 mins',  gas:'~$0.10' },
    { id:'ETH',    name:'ETH',  sub:'Ethereum (ERC20)',        fee:0.4,   minW:5,    confirm:6,  arrival:'2 mins',  gas:'~$0.40' },
    { id:'SOL',    name:'SOL',  sub:'Solana',                  fee:0.01,  minW:1,    confirm:1,  arrival:'1 mins',  gas:'~$0.01' },
    { id:'ARB',    name:'ARB',  sub:'Arbitrum One',            fee:0.1,   minW:1,    confirm:1,  arrival:'1 mins',  gas:'~$0.10' },
    { id:'MATIC',  name:'POL',  sub:'Polygon (POL)',           fee:0.1,   minW:1,    confirm:3,  arrival:'2 mins',  gas:'~$0.10' },
  ],
  BTC: [
    { id:'BTC',    name:'BTC',  sub:'Bitcoin',                 fee:0.0001,minW:0.001,confirm:2,  arrival:'30 mins', gas:'~$5.00' },
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.000004,minW:0.0001,confirm:1,arrival:'1 mins',gas:'~$0.12' },
    { id:'ETH',    name:'WBTC', sub:'Ethereum (ERC20)',        fee:0.0001,minW:0.001,confirm:6,  arrival:'5 mins',  gas:'~$2.50' },
  ],
  ETH: [
    { id:'ETH',    name:'ETH',  sub:'Ethereum (ERC20)',        fee:0.0003,minW:0.01, confirm:6,  arrival:'2 mins',  gas:'~$1.20' },
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.000047,minW:0.01,confirm:1, arrival:'1 mins',  gas:'~$0.15' },
    { id:'ARB',    name:'ARB',  sub:'Arbitrum One',            fee:0.0001,minW:0.01, confirm:1,  arrival:'1 mins',  gas:'~$0.30' },
    { id:'SOL',    name:'SOL',  sub:'Solana (via bridge)',     fee:0.0002,minW:0.01, confirm:1,  arrival:'3 mins',  gas:'~$0.50' },
  ],
  BNB: [
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.00015,minW:0.01,confirm:1,  arrival:'1 mins',  gas:'~$0.10' },
    { id:'OPBNB',  name:'OPBNB',sub:'opBNB',                   fee:0.0001,minW:0.01, confirm:1,  arrival:'5 mins',  gas:'~$0.07' },
  ],
  SOL: [
    { id:'SOL',    name:'SOL',  sub:'Solana',                  fee:0.01,  minW:0.1,  confirm:1,  arrival:'1 mins',  gas:'~$0.01' },
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.001, minW:0.01, confirm:1,  arrival:'1 mins',  gas:'~$0.03' },
  ],
  USDC: [
    { id:'ETH',    name:'ETH',  sub:'Ethereum (ERC20)',        fee:2.0,   minW:10,   confirm:6,  arrival:'2 mins',  gas:'~$2.00' },
    { id:'BSC',    name:'BSC',  sub:'BNB Smart Chain (BEP20)', fee:0.01,  minW:1,    confirm:1,  arrival:'1 mins',  gas:'~$0.01' },
    { id:'SOL',    name:'SOL',  sub:'Solana',                  fee:0.01,  minW:1,    confirm:1,  arrival:'1 mins',  gas:'~$0.01' },
    { id:'ARB',    name:'ARB',  sub:'Arbitrum One',            fee:0.1,   minW:1,    confirm:1,  arrival:'1 mins',  gas:'~$0.10' },
  ],
};
// Default fallback for other coins
function getSndNetworks(coin) {
  return SND_NETWORKS[coin] || [
    { id:'BSC',  name:'BSC', sub:'BNB Smart Chain (BEP20)', fee:0.01, minW:1, confirm:1, arrival:'1 mins', gas:'~$0.01' },
    { id:'ETH',  name:'ETH', sub:'Ethereum (ERC20)',        fee:1.0,  minW:1, confirm:6, arrival:'2 mins', gas:'~$1.00' },
    { id:'TRX',  name:'TRX', sub:'Tron (TRC20)',            fee:1.3,  minW:1, confirm:1, arrival:'1 mins', gas:'~$1.30' },
  ];
}

// ─── Coin list for send ───
const SND_COINS = [
  { coin:'USDT', name:'TetherUS',  bal:'0.00000000', icon:'₮', bg:'#26a17b', color:'#fff' },
  { coin:'BTC',  name:'Bitcoin',   bal:'0.00000000',icon:'₿', bg:'#f7931a', color:'#fff' },
  { coin:'ETH',  name:'Ethereum',  bal:'0.00000000',icon:'Ξ', bg:'#627eea', color:'#fff' },
  { coin:'BNB',  name:'BNB',       bal:'0.00000000',icon:'B', bg:'#f0b90b', color:'#000' },
  { coin:'SOL',  name:'Solana',    bal:'0.00000000',icon:'S', bg:'linear-gradient(135deg,#9945ff,#14f195)', color:'#fff' },
  { coin:'USDC', name:'USD Coin',  bal:'0.00000000',icon:'$', bg:'#2775ca', color:'#fff' },
  { coin:'DOGE', name:'Dogecoin',  bal:'0.00000000',icon:'D', bg:'#c2a634', color:'#fff' },
  { coin:'XRP',  name:'XRP',       bal:'0.00000000',icon:'X', bg:'#00aae4', color:'#fff' },
  { coin:'ADA',  name:'Cardano',   bal:'0.00000000',icon:'A', bg:'#0033ad', color:'#fff' },
  { coin:'AVAX', name:'Avalanche', bal:'0.00000000',icon:'A', bg:'#e84142', color:'#fff' },
];

let sndSelectedCoin = null;
let sndSelectedNetwork = null;
let sndSortAsc = true;
let sndHideZero = false; // false = show all, true = hide zero balance

function astToggleHideZero() {
  sndHideZero = !sndHideZero;
  const dot = document.getElementById('snd-hide-zero-dot');
  const lbl = document.getElementById('snd-hide-zero-label');
  const btn = document.getElementById('snd-hide-zero-btn');
  if (sndHideZero) {
    if (dot) dot.style.background = 'var(--g)';
    if (lbl) { lbl.textContent = tccT('label_has_coin'); lbl.style.color = 'var(--g)'; }
    if (btn) { btn.style.borderColor = 'rgba(14,203,129,.4)'; btn.style.background = 'rgba(14,203,129,.08)'; }
  } else {
    if (dot) dot.style.background = 'var(--t3)';
    if (lbl) { lbl.textContent = tccT('all'); lbl.style.color = 'var(--t2)'; }
    if (btn) { btn.style.borderColor = 'var(--bl)'; btn.style.background = 'var(--bg3)'; }
  }
  renderSndCoinList(document.getElementById('snd-coin-search')?.value || '');
}

// ── Open Withdraw Sheet ──
function astOpenWithdrawSheet() {
  document.getElementById('ast-overlay-deposit').classList.add('visible');
  document.getElementById('ast-sheet-withdraw').classList.add('open');
}
function astCloseWithdrawSheet() {
  document.getElementById('ast-overlay-deposit').classList.remove('visible');
  document.getElementById('ast-sheet-withdraw').classList.remove('open');
}

// ── Open Send Coin List ──
function astOpenSendCoinList() {
  astCloseWithdrawSheet();
  setTimeout(() => {
    renderSndCoinList('');
    document.getElementById('snd-coin-search').value = '';
    document.getElementById('ast-page-send-coin').classList.add('active');
  }, 220);
}
function astCloseSendCoinList() {
  document.getElementById('ast-page-send-coin').classList.remove('active');
}

function renderSndCoinList(q) {
  q = (q || '').toLowerCase();
  const coins = sndSortAsc
    ? [...SND_COINS].sort((a,b)=>a.coin.localeCompare(b.coin))
    : [...SND_COINS].sort((a,b)=>b.coin.localeCompare(a.coin));
  let filtered = coins.filter(c => !q || c.coin.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  // Apply hide-zero filter: show only coins with balance > 0
  if (sndHideZero) {
    filtered = filtered.filter(c => parseFloat(c.bal) > 0);
  }
  const listEl = document.getElementById('snd-coin-list');
  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;gap:10px">
      <div style="font-size:36px">🪙</div>
      <div style="font-size:14px;font-weight:600;color:var(--t2)">${sndHideZero ? tccT('no_coin') : 'No coins found'}</div>
      ${sndHideZero ? '<div style="font-size:12px;color:var(--t3);text-align:center;line-height:1.6">กดปุ่ม "มีเหรียญอยู่"<br>เพื่อดูรายการเหรียญทั้งหมด</div>' : ''}
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const bal = parseFloat(c.bal) || 0;
    const price = parseFloat(S?.coinPrices?.[c.coin]) || (c.coin === 'USDT' ? 1 : 0);
    const usdVal = bal * price;
    const balDisplay = c.coin === 'USDT' ? fmtM(bal) : bal.toFixed(8);
    const usdDisplay = fmtM(usdVal);
    const hasBalance = bal > 0;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(43,49,57,.4);cursor:pointer;transition:background .1s" onclick="astSelectSendCoin('${c.coin}')" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="ast-coin-icon" style="background:${c.bg};color:${c.color};width:38px;height:38px;font-size:15px;flex-shrink:0">${c.icon}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--t1)">${c.coin}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">${c.name}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:${hasBalance ? 'var(--t1)' : 'var(--t3)'}">${balDisplay}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:2px;font-family:var(--mono)">≈ $${usdDisplay}</div>
      </div>
    </div>`;
  }).join('');
}
function astFilterSendCoins(q) { renderSndCoinList(q); }
function astSortSendCoins() {
  sndSortAsc = !sndSortAsc;
  const icon = document.getElementById('snd-sort-icon');
  if (icon) icon.textContent = sndSortAsc ? '↓A-Z' : '↑Z-A';
  renderSndCoinList(document.getElementById('snd-coin-search')?.value || '');
}

// ── Select Coin → Open Send Form ──
function astSelectSendCoin(coin) {
  sndSelectedCoin = coin;
  sndSelectedNetwork = null;
  const c = SND_COINS.find(x => x.coin === coin) || { coin, bal:'0.00', icon:coin[0], bg:'#333', color:'#fff' };
  // Update form
  document.getElementById('snd-form-title').textContent = 'Send ' + coin;
  document.getElementById('snd-amount-coin').textContent = coin;
  document.getElementById('snd-avail-amt').textContent = c.bal + ' ' + coin;
  document.getElementById('snd-network-display').textContent = 'Automatically match the network';
  document.getElementById('snd-network-display').className = 'snd-net-box-text placeholder';
  document.getElementById('snd-address-input').value = '';
  document.getElementById('snd-amount-input').value = '';
  document.getElementById('snd-amount-input').placeholder = 'Minimum 0';
  // Hide contract info and network warning on coin change
  const ci = document.getElementById('snd-contract-info');
  if (ci) ci.style.display = 'none';
  const nw = document.getElementById('snd-network-warning');
  if (nw) nw.style.display = 'none';
  sndValidate();
  // Close coin list, open form
  astCloseSendCoinList();
  setTimeout(() => {
    document.getElementById('ast-page-send-form').classList.add('active');
  }, 50);
}
function astCloseSendForm() {
  document.getElementById('ast-page-send-form').classList.remove('active');
}

// ── [NEW] QR Code Scanner for Withdraw Address ──
let _qrScannerInstance = null;
let _qrScannerStarting = false;

// [FIX] qrbox แบบ responsive: คำนวณจากขนาด viewfinder จริง กัน error
// "qrbox size too large" ที่ทำให้ start() reject บนมือถือจอเล็ก/กล้องความละเอียดต่ำ
function _qrBoxFn(viewfinderWidth, viewfinderHeight) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.floor(minEdge * 0.7);
  const boxSize = Math.max(180, Math.min(size, 280));
  return { width: boxSize, height: boxSize };
}

function startQRScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast(tccT('toast_qr_unavailable'));
    return;
  }
  // [FIX] กันกดซ้ำ/สแกนซ้อนกันจนกล้องตัวเก่าค้าง
  if (_qrScannerStarting || _qrScannerInstance) return;
  _qrScannerStarting = true;

  const overlay = document.getElementById('qrScannerOverlay');
  overlay.style.display = 'flex';

  const inst = new Html5Qrcode('qrScannerReader');
  _qrScannerInstance = inst;

  const onDecoded = (decodedText) => {
    const inp = document.getElementById('snd-address-input');
    if (inp) {
      inp.value = decodedText;
      if (typeof sndValidate === 'function') sndValidate();
      _qrValidateScannedAddress(decodedText);
    }
    stopQRScanner();
  };

  inst.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: _qrBoxFn, aspectRatio: 1.0 },
    onDecoded,
    () => {}
  ).then(() => {
    _qrScannerStarting = false;
  }).catch(() => {
    // [FIX] fallback: ถ้า facingMode 'environment' ใช้ไม่ได้ (เช่นเดสก์ท็อป/บางรุ่นไม่รองรับ)
    // ลองใหม่ด้วยกล้องตัวแรกที่หาเจอแทนที่จะปล่อยให้ scan ใช้งานไม่ได้เฉยๆ
    Html5Qrcode.getCameras().then((cams) => {
      if (!cams || !cams.length) throw new Error('no camera');
      return inst.start(
        cams[0].id,
        { fps: 10, qrbox: _qrBoxFn, aspectRatio: 1.0 },
        onDecoded,
        () => {}
      );
    }).then(() => {
      _qrScannerStarting = false;
    }).catch(() => {
      _qrScannerStarting = false;
      _qrScannerInstance = null;
      showToast(tccT('toast_camera_denied'));
      overlay.style.display = 'none';
    });
  });
}
function stopQRScanner() {
  const overlay = document.getElementById('qrScannerOverlay');
  const inst = _qrScannerInstance;
  _qrScannerInstance = null;
  _qrScannerStarting = false;
  overlay.style.display = 'none';
  if (inst) {
    inst.stop().then(() => {
      inst.clear();
    }).catch(() => {
      // [FIX] แม้ stop() ล้มเหลว (เช่นยังไม่ทัน start เสร็จ) ก็ต้อง clear ทิ้ง
      // ไม่งั้น element ค้างและ start ครั้งถัดไปจะ error ซ้ำ
      try { inst.clear(); } catch (e) {}
    });
  }
}

// [NEW] ตรวจสอบรูปแบบ address ที่ได้จากการ scan QR ว่าตรงกับ network ที่เลือกหรือไม่
function _qrValidateScannedAddress(addr) {
  if (!addr) return;
  // รองรับรูปแบบ EVM (BSC/ETH/ARB/OPBNB/MATIC): 0x + 40 hex chars
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(addr);
  // TRX (Tron): ขึ้นต้นด้วย T ตามด้วย 33 ตัวอักษร base58
  const isTrx = /^T[a-zA-Z0-9]{33}$/.test(addr);
  // SOL: base58, 32-44 ตัวอักษร
  const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  // BTC: legacy/SegWit/Bech32
  const isBtc = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr);

  if (!isEvm && !isTrx && !isSol && !isBtc) {
    showToast(tccT('toast_qr_invalid'), 'warn');
    return;
  }

  // ถ้าเลือก network ไว้แล้ว ตรวจว่า address format ตรงกับ network นั้นหรือไม่
  const net = (typeof sndSelectedNetwork !== 'undefined') ? sndSelectedNetwork : null;
  if (net) {
    const netId = net.id;
    const evmNets = ['BSC','ETH','ARB','OPBNB','MATIC'];
    let mismatch = false;
    if (evmNets.includes(netId) && !isEvm) mismatch = true;
    if (netId === 'TRX' && !isTrx) mismatch = true;
    if (netId === 'SOL' && !isSol) mismatch = true;
    if (netId === 'BTC' && !isBtc) mismatch = true;
    if (mismatch) {
      showToast(tccTF('toast_qr_network_mismatch',{net:net.name}), 'warn');
    }
  }
}


function sndSetMax() {
  if (!sndSelectedCoin) return;
  const c = SND_COINS.find(x => x.coin === sndSelectedCoin);
  if (!c) return;
  const net = sndSelectedNetwork;
  const fee = net ? net.fee : 0;
  const max = Math.max(0, parseFloat(c.bal) - fee);
  document.getElementById('snd-amount-input').value = max > 0 ? max.toFixed(8) : '0';
  sndValidate();
}

function sndValidate() {
  const addr = document.getElementById('snd-address-input')?.value.trim() || '';
  const amt = parseFloat(document.getElementById('snd-amount-input')?.value) || 0;
  const net = sndSelectedNetwork;
  const coin = sndSelectedCoin;
  const fee = net ? net.fee : 0;
  const minW = net ? net.minW : 0;
  const receive = Math.max(0, amt - fee);
  // Update summary
  const feeStr = (net && amt > 0) ? fee + ' ' + (coin || 'USDT') : '0.00 USDT';
  const receiveStr = (amt > 0) ? receive.toFixed(8) + ' ' + (coin || 'USDT') : '0 USDT';
  document.getElementById('snd-receive-amt').textContent = receiveStr;
  document.getElementById('snd-fee-amt').textContent = feeStr;
  // [v9.5 FIX] เช็คยอดคงเหลือจริง (amount + fee ต้องไม่เกิน mainWalletBalance)
  // เดิมไม่มีจุดนี้ ทำให้กดถอนเกินยอดได้ ยอด balance เลยติดลบ
  const totalNeeded = amt + fee;
  const insufficientBalance = amt > 0 && totalNeeded > mainWalletBalance;
  // Button state
  const btn = document.getElementById('snd-submit-btn');
  const ready = addr.length > 10 && amt >= minW && minW > 0 && net !== null && !insufficientBalance;
  if (btn) {
    btn.classList.toggle('ready', ready);
    btn.disabled = !ready;
    if (!net) btn.textContent = 'Withdraw';
    else if (amt < minW && minW > 0) btn.textContent = `Min. ${minW} ${coin}`;
    else if (insufficientBalance) btn.textContent = tccT('not_available');
    else btn.textContent = 'Withdraw';
  }
}

// ── Network Sheet ──
function astOpenSendNetworkSheet() {
  if (!sndSelectedCoin) { showToast('Select a coin first'); return; }
  const nets = getSndNetworks(sndSelectedCoin);
  const listEl = document.getElementById('snd-network-list');
  if (listEl) {
    listEl.innerHTML = nets.map(n => `
      <div class="snd-net-card ${sndSelectedNetwork?.id === n.id ? 'selected' : ''}" onclick="astSelectSendNetwork('${n.id}')">
        <div class="snd-net-card-title"><b>${n.name}</b><span>${n.sub}</span></div>
        <div class="snd-net-card-row">Fee <b style="color:var(--t1);margin:0 3px">${n.fee} ${sndSelectedCoin}</b> ( ≈ ${n.gas})</div>
        <div class="snd-net-card-row">Minimum withdrawal ${n.minW} ${sndSelectedCoin}</div>
        <div class="snd-net-card-row">Arrival time ≈ ${n.arrival}</div>
      </div>
    `).join('');
  }
  document.getElementById('ast-overlay-send-network').classList.add('visible');
  document.getElementById('ast-sheet-send-network').classList.add('open');
}
function astCloseSendNetworkSheet() {
  document.getElementById('ast-overlay-send-network').classList.remove('visible');
  document.getElementById('ast-sheet-send-network').classList.remove('open');
}
function astSelectSendNetwork(netId) {
  const nets = getSndNetworks(sndSelectedCoin);
  sndSelectedNetwork = nets.find(n => n.id === netId) || null;
  if (sndSelectedNetwork) {
    const disp = document.getElementById('snd-network-display');
    disp.innerHTML = `<b>${sndSelectedNetwork.name}</b>&nbsp;${sndSelectedNetwork.sub}`;
    disp.className = 'snd-net-box-text';
    // Update amount placeholder to show minimum
    const amtInput = document.getElementById('snd-amount-input');
    if (amtInput) amtInput.placeholder = 'Minimum ' + sndSelectedNetwork.minW;
    // Show contract info
    const ci = document.getElementById('snd-contract-info');
    if (ci) ci.style.display = 'block';
    // Show network warning
    const netWarn = document.getElementById('snd-network-warning');
    if (netWarn) {
      netWarn.style.display = 'block';
      netWarn.querySelector('.snd-net-warn').innerHTML =
        `The network you have selected is <strong style="color:var(--t1)">${sndSelectedNetwork.name}</strong>. Please ensure that the withdrawal address supports the ${sndSelectedNetwork.sub} network. You will potentially lose your assets if the chosen platform does not support refunds of wrongfully deposited assets. <span class="snd-net-warn-link" onclick="showToast('${sndSelectedNetwork.name} Network Verification')">${sndSelectedNetwork.name} Network Verification</span>`;
    }
  }
  astCloseSendNetworkSheet();
  sndValidate();
}

// ── Confirm & Execute ──
function astConfirmWithdraw() {
  const addr = document.getElementById('snd-address-input')?.value.trim() || '';
  const amt = parseFloat(document.getElementById('snd-amount-input')?.value) || 0;
  const net = sndSelectedNetwork;
  const coin = sndSelectedCoin || 'USDT';
  if (!net || !addr || amt <= 0) return;
  const fee = net.fee;
  const receive = Math.max(0, amt - fee);

  // Big receive amount (top)
  document.getElementById('cnf-receive').textContent = receive.toFixed(8) + ' ' + coin;
  // USD estimate (rough: 1 USDT ≈ $1, others show approx)
  const usdRate = coin === 'USDT' ? 1 : (coin === 'BNB' ? 20840 : 1);
  document.getElementById('cnf-receive-usd').textContent = '≈ $' + fmtM(receive * usdRate);

  // Detail rows
  document.getElementById('cnf-network').textContent = net.sub || (net.name + ' (' + net.sub + ')');
  // Show address with color-highlighted first/last chars like Binance
  const addrEl = document.getElementById('cnf-address');
  if (addr.length > 12) {
    addrEl.innerHTML =
      '<span style="color:var(--y)">' + addr.slice(0,6) + '</span>' +
      addr.slice(6, addr.length - 6) +
      '<span style="color:var(--y)">' + addr.slice(-6) + '</span>';
  } else {
    addrEl.textContent = addr;
  }
  document.getElementById('cnf-amount').textContent = amt.toFixed(8) + ' ' + coin;
  document.getElementById('cnf-fee').textContent = fee + ' ' + coin;
  document.getElementById('cnf-wallet').textContent = 'Spot Wallet';

  document.getElementById('ast-overlay-send-confirm').classList.add('active');
}
function astCloseConfirm() {
  document.getElementById('ast-overlay-send-confirm').classList.remove('active');
}
// [WALLET v1] astExecuteWithdraw — ตรวจ address → Off-chain หรือ On-chain อัตโนมัติ
async function astExecuteWithdraw() {
  const amt  = parseFloat(document.getElementById('snd-amount-input')?.value) || 0;
  const addr = document.getElementById('snd-address-input')?.value.trim() || '';
  const net  = sndSelectedNetwork;
  const coin = sndSelectedCoin || 'USDT';
  const fee  = net ? net.fee : 0;
  if (!addr || amt <= 0) return;
  // [v9.5 FIX] เช็คซ้ำอีกชั้นกันกรณี state ของปุ่มไม่ sync (defense-in-depth)
  if (amt + fee > mainWalletBalance) {
    showToast(tccT('toast_withdraw_insufficient'));
    return;
  }

  const now     = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
  const netName = net ? (net.name || net.sub || 'BSC') : 'BSC';

  // Close confirm overlay ก่อน แล้วแสดง Processing
  astCloseConfirm();
  astCloseSendForm();

  document.getElementById('wd-proc-amount').textContent = amt + ' ' + coin;
  document.getElementById('wd-proc-est').innerHTML =
    'กำลังตรวจสอบและดำเนินการ...<br>กรุณารอสักครู่';
  document.getElementById('wd-proc-title').textContent = 'Withdrawal Processing';
  document.getElementById('wd-icon-hourglass').style.display = 'block';
  document.getElementById('wd-icon-tick').style.display = 'none';
  document.getElementById('wd-proc-btn').textContent = 'View History';
  document.getElementById('wd-processing-overlay').classList.add('active');

  // เรียก GAS submitWithdraw (ตรวจ address + หักเงิน อัตโนมัติ)
  const result = await saveWithdraw({
    coin,
    network: netName,
    amount:  amt,
    fee:     fee || 0,
    address: addr,
  });

  if (!result) {
    // saveWithdraw แสดง error toast แล้ว
    document.getElementById('wd-processing-overlay').classList.remove('active');
    return;
  }

  const isOffchain  = result.type === 'offchain';
  const isCompleted = result.status === 'completed' || isOffchain;

  // [v8] Toast feedback ตาม type (submitWithdraw response)
  if (isOffchain) {
    showToast(tccT('toast_offchain_success'));
  } else {
    showToast(tccT('toast_withdraw_submitted'), 'info');
  }

  // Log ใน HIST (local history)
  if (typeof HIST !== 'undefined' && HIST.logWithdraw) {
    HIST.logWithdraw(amt, coin, isOffchain ? 'Internal Transfer' : netName, addr, fee);
  }

  // [v8] refresh transaction list ถ้า My Trades เปิดอยู่
  if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();

  // [v8] refresh wallet/overview UI หลัง withdraw สำเร็จ
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
  if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
  if (typeof renderEarnContracts === 'function') renderEarnContracts();

  // อัปเดต UI ตาม type
  setTimeout(() => {
    document.getElementById('wd-icon-hourglass').style.display = 'none';
    document.getElementById('wd-icon-tick').style.display = 'flex';

    if (isOffchain) {
      document.getElementById('wd-proc-title').textContent = 'Transfer Completed';
      document.getElementById('wd-proc-est').textContent = tccT('proc_est_internal');
    } else {
      document.getElementById('wd-proc-title').textContent = 'Withdrawal Submitted';
      document.getElementById('wd-proc-est').textContent = tccT('proc_est_onchain');
    }
    document.getElementById('wd-proc-btn').textContent = 'View Details';

    setTimeout(() => {
      // [fix] โชว์สถานะตามความจริง ไม่ใช่ "✓ Completed" เขียวค้างทุกครั้ง
      wdRenderStatus(isCompleted);

      // [fix] withdraw_id ไม่ใช่ Tx Hash จริงบนเชน — ห้ามแปะเป็น Txid เด็ดขาด
      // on-chain ที่ยัง pending: บอกตรง ๆ ว่ากำลังรอ Tx Hash จาก Admin (ดูได้ภายหลังผ่าน Transaction History)
      // off-chain: ใช้ reference id ภายในได้ แต่ระบุชัดว่าเป็น "Ref ID" ไม่ใช่ Tx Hash
      const txidDisplay = isOffchain
        ? 'Internal Transfer<br>Ref: ' + (result.withdraw_id || '').slice(0, 16).toUpperCase()
        : 'Pending — waiting for Tx Hash<br>Admin จะอัปเดตภายใน 24 ชม.';

      document.getElementById('det-amount-big').textContent = '-' + amt + ' ' + coin;
      document.getElementById('det-network').textContent = isOffchain ? 'Internal Transfer' : netName;
      document.getElementById('det-address').textContent = addr;
      document.getElementById('det-txid').innerHTML = txidDisplay;
      document.getElementById('det-amount-row').textContent = amt + ' ' + coin;
      document.getElementById('det-fee').textContent = fee + ' ' + coin;
      document.getElementById('det-wallet').textContent = 'Spot Wallet';
      document.getElementById('det-date').textContent = dateStr;
      document.getElementById('wd-processing-overlay').classList.remove('active');
      document.getElementById('wd-details-overlay').classList.add('active');

      // [fix] ถ้ายัง pending on-chain → เริ่ม poll สถานะ live แทนรอผู้ใช้กดรีเฟรชหน้าเอง
      if (!isCompleted) {
        wdStartPolling(result.withdraw_id, netName);
      }
    }, 800);
  }, isOffchain ? 800 : 1500);
}

// [v9.6 NEW] base URL ของ block explorer แต่ละ network สำหรับลิงก์ดู Transaction Hash จริงบนเชน
// key ต้องตรงกับ net.name ใน SND_NETWORKS (เช่น 'BSC','SOL','TRX',...)
const EXPLORER_TX_URL = {
  BSC:   'https://bscscan.com/tx/',
  OPBNB: 'https://opbnbscan.com/tx/',
  ETH:   'https://etherscan.io/tx/',
  ARB:   'https://arbiscan.io/tx/',
  POL:   'https://polygonscan.com/tx/',
  TRX:   'https://tronscan.org/#/transaction/',
  SOL:   'https://solscan.io/tx/',
  APT:   'https://explorer.aptoslabs.com/txn/',
  BTC:   'https://mempool.space/tx/',
  WBTC:  'https://etherscan.io/tx/',
};
function _explorerLinkFor(network, txid) {
  const base = EXPLORER_TX_URL[(network || '').toUpperCase()];
  return (base && txid) ? (base + txid) : '';
}

// ── Withdrawal overlay helpers ──
function wdCloseProcessing() {
  document.getElementById('wd-processing-overlay').classList.remove('active');
}
// [fix] state ของ polling — ดึงสถานะ withdraw แบบ live ไม่ต้องรอ user กดรีเฟรชหน้าเอง
let _wdPollTimer  = null;
let _wdPollTries  = 0;
const WD_POLL_INTERVAL_MS = 6000;
const WD_POLL_MAX_TRIES   = 30; // ~3 นาที พอสำหรับเคสที่ admin/bot โอนเร็ว ถ้านานกว่านี้ผู้ใช้เปิด Transaction History เองได้
function wdCloseDetails() {
  document.getElementById('wd-details-overlay').classList.remove('active');
  wdStopPolling();
}
function wdStopPolling() {
  if (_wdPollTimer) { clearInterval(_wdPollTimer); _wdPollTimer = null; }
  _wdPollTries = 0;
}
// [fix] เริ่ม poll สถานะ withdraw แบบ live ทุก WD_POLL_INTERVAL_MS จนกว่าจะ completed (มี txid จริง)
// อัปเดต popup ที่เปิดอยู่ทันทีโดยไม่ต้องให้ผู้ใช้รีเฟรชหน้าเอง — ใช้กับ on-chain withdraw ที่ยัง pending เท่านั้น
function wdStartPolling(withdrawId, netName) {
  wdStopPolling();
  if (!withdrawId) return;
  const uid = USER_PROFILE && USER_PROFILE.uid;
  if (!uid) return;

  _wdPollTimer = setInterval(async () => {
    _wdPollTries++;
    if (_wdPollTries > WD_POLL_MAX_TRIES) { wdStopPolling(); return; }
    // ถ้า popup ถูกปิดไปแล้วระหว่างรอ ให้หยุด poll ทันที ไม่ต้องเปลืองการเรียก backend ต่อ
    const overlayEl = document.getElementById('wd-details-overlay');
    if (!overlayEl || !overlayEl.classList.contains('active')) { wdStopPolling(); return; }

    try {
      const dash = await dbCallRaw('getDashboard', { uid });
      if (!dash || !Array.isArray(dash.transactions)) return;
      const tag = '[wid:' + withdrawId + ']';
      const t = dash.transactions.find(x => x.type === 'Withdraw' && String(x.note || '').indexOf(tag) > -1);
      if (!t || !t.status || !/completed/i.test(t.status) || !t.txid) return; // ยังไม่ confirm — รอรอบถัดไป

      // [fix] เจอ txid จริงแล้ว → อัปเดต popup สดทันทีโดยไม่ต้องรีเฟรชหน้า
      wdRenderStatus(true);
      const explorerUrl = _explorerLinkFor(netName, t.txid);
      const txidEl = document.getElementById('det-txid');
      if (txidEl) {
        txidEl.innerHTML = explorerUrl
          ? '<a href="' + explorerUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--y);text-decoration:underline">' + t.txid + '</a>'
          : t.txid;
      }
      showToast(tccT('toast_txhash_confirmed'));
      if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
      if (typeof HIST !== 'undefined' && Array.isArray(dash.transactions) && typeof _applyTransactions === 'function') {
        _applyTransactions(uid, dash.transactions);
      }
      wdStopPolling();
    } catch (e) {
      // network/transient error — ปล่อยให้รอบถัดไป retry เอง ไม่ต้อง throw
    }
  }, WD_POLL_INTERVAL_MS);
}
// [fix] ใช้ร่วมกันทั้ง popup หลังกด Withdraw และ popup ที่เปิดจาก Transaction History
// ป้องกันการโชว์ "✓ Completed" เขียวค้าง ทั้งที่จริงยัง pending on-chain อยู่
function wdRenderStatus(isCompleted) {
  const statusEl = document.getElementById('wd-det-status');
  const noteEl   = document.getElementById('wd-det-note');
  if (statusEl) {
    statusEl.innerHTML = isCompleted
      ? '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill="var(--g)" opacity="0.2" stroke="var(--g)"/><polyline points="5,9 8,12 13,6" stroke="var(--g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Completed'
      : '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill="var(--y, #f0b90b)" opacity="0.2" stroke="var(--y, #f0b90b)"/><path d="M9 5v4l3 2" stroke="var(--y, #f0b90b)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Processing';
  }
  if (noteEl) {
    noteEl.textContent = isCompleted
      ? 'Crypto transferred out of Binance. Please contact the recipient platform for your transaction receipt.'
      : 'Withdrawal request submitted. Admin is processing the on-chain transfer; Tx Hash will appear here once confirmed.';
  }
}
// [v9.5 NEW] เปิด Withdrawal Details popup จากแถวประวัติ (Transaction History) ที่กดดู
// ใช้ overlay เดิม (#wd-details-overlay) แค่เติมข้อมูลจาก HIST.transactionHistory + note ที่ backend ฝัง tag ไว้
function mytOpenWithdrawDetail(txId) {
  const d = (HIST.transactionHistory || []).find(t => t.id === txId);
  if (!d) { showToast(tccT('toast_record_not_found')); return; }

  const note = d.note || '';
  const isOffchain = /Off-chain/.test(note);
  // [fix] ใช้ status จริงจาก backend (d.status) ก่อน ถ้าไม่มีค่อย fallback ไป parse tag [pending] จาก note (record เก่า)
  const isPending  = d.status
    ? !/completed/i.test(d.status)
    : /\[pending\]/.test(note);
  // address อยู่หลัง '→ ' จนถึงช่องว่างก่อน '(' หรือ '['
  const addrMatch = note.match(/→\s*([^\s([]+)/);
  const address   = addrMatch ? addrMatch[1] : '—';
  const feeMatch  = note.match(/\(fee:\s*([\d.]+)\)/);
  const feeAmt    = feeMatch ? feeMatch[1] : '0';
  const txid      = d.txid || '';
  // [v9.6 NEW] on-chain → ลิงก์ไป block explorer จริงตาม network; off-chain ไม่ใช่ tx บนเชน ไม่มีลิงก์
  const explorerUrl = !isOffchain ? _explorerLinkFor(d.symbol, txid) : '';

  document.getElementById('det-amount-big').textContent = d.amount.replace('+', '') + ' ' + d.asset;
  document.getElementById('det-network').textContent = isOffchain ? 'Internal Transfer' : (d.symbol || '—');
  document.getElementById('det-address').textContent = address;

  const txidEl = document.getElementById('det-txid');
  if (txid && explorerUrl) {
    txidEl.innerHTML = '<a href="' + explorerUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--y);text-decoration:underline">' + txid + '</a>';
  } else if (txid) {
    txidEl.innerHTML = (isOffchain ? 'Internal Transfer<br>' : '') + txid;
  } else {
    txidEl.innerHTML = isPending ? tccT('txid_pending') : '—';
  }

  document.getElementById('det-amount-row').textContent = d.amount.replace('+', '').replace('-', '') + ' ' + d.asset;
  document.getElementById('det-fee').textContent = feeAmt + ' ' + d.asset;
  document.getElementById('det-wallet').textContent = 'Spot Wallet';
  document.getElementById('det-date').textContent = d.time || '—';

  // อัปเดต status/note บนหัว popup ตามสถานะจริง (completed vs pending)
  const isCompleted = d.status ? /completed/i.test(d.status) : !!(txid || (isOffchain && !isPending));
  wdRenderStatus(isCompleted);

  document.getElementById('wd-details-overlay').classList.add('active');

  // [fix] ถ้าเปิดมาแล้วยัง pending on-chain → poll สถานะ live ต่อ ไม่ต้องให้ผู้ใช้รีเฟรชหน้าเอง
  // ต้องดึง withdraw_id จาก note ([wid:...]) เพราะ d.id คือ id ของ Transactions row ไม่ใช่ withdraw_id
  if (!isCompleted && !isOffchain) {
    const widMatch = note.match(/\[wid:([^\]]+)\]/);
    if (widMatch) wdStartPolling(widMatch[1], d.symbol);
  }
}
function wdViewHistory() {
  const btn = document.getElementById('wd-proc-btn');
  if (btn && btn.textContent === 'View Details') {
    document.getElementById('wd-processing-overlay').classList.remove('active');
    document.getElementById('wd-details-overlay').classList.add('active');
  } else {
    wdCloseProcessing();
    // Open My Trades → Transaction History tab, filter type=Withdraw
    MYT.filters['transaction-history'].type = 'Withdraw';
    mytSetContextAssets('Withdraw');
    openMyTrades();
  }
}
function wdWithdrawAgain() {
  wdCloseDetails();
  setTimeout(() => astOpenWithdrawSheet(), 200);
}
function wdCopy(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard?.writeText(el.textContent || el.innerText).catch(() => {});
  showToast('Copied');
}

// ── One-time / Recurring toggle ──
const SND_FREQS = ['One Time', 'Daily', 'Weekly', 'Monthly'];
let sndFreqIdx = 0;
function astToggleSendFreq() {
  sndFreqIdx = (sndFreqIdx + 1) % SND_FREQS.length;
  const el = document.getElementById('snd-freq-label');
  if (el) el.textContent = SND_FREQS[sndFreqIdx];
}

// ── Close confirm on overlay click ──
document.getElementById('ast-overlay-send-confirm')?.addEventListener('click', function(e) {
  if (e.target === this) astCloseConfirm();
});



// ═══════════════════════════════════════════════════════════
//  EARN CONTRACT SYSTEM — Full Business Logic
// ═══════════════════════════════════════════════════════════

// ── State ──
let earnContracts = []; // array of contract objects
let selectedEarnContractId = null;
let earnCreatePlan = { days: 15, yield: 0.3333 };
let claimTargetId = null;
let claimMode = 'all'; // 'all' | 'trade' | 'apt'
// [NEW] กัน fetch getReferralDashboard ซ้ำระหว่างรอผล (ใช้โดย openClaimModal ตอน claimMode==='fixed')
let _fixedGateFetching = false;
let mainWalletBalance = 0.00; // [v13.3] เริ่มที่ 0 — GAS จะ set ค่าจริงหลัง loadDashboard
let fundingWalletBalance = 0.00; // [NEW] Funding Wallet balance — set จริงหลัง loadDashboard
// [FIX-3] flag: true หลัง loadDashboard ได้รับข้อมูลจาก GAS ครั้งแรก
// ใช้กัน updateOverviewBalances/renderEarnContracts แสดง 0.00 / "ยังไม่มีสัญญา" ก่อนข้อมูลพร้อม
window._dashboardReady = false;

// [NEW v2] Commission tab state — คนละชุดกับ mainWalletBalance/fundingWalletBalance เจตนา
// เพื่อไม่ให้ปนกับ wallet balances ที่ sync ผ่าน updateLocalBalance()/TF ด้านบน
// ยอดนี้โหลดจาก GAS action เดิมที่ member2.html ใช้อยู่ (getMemberDashboard, getReferralDashboard)
let commissionBalance       = 0.00; // ยอด commission_balance ล่าสุดจาก Users sheet
let commissionApprovedCount = 0;    // จำนวนสมาชิก Approved ในทีม (จาก getReferralDashboard)
let commissionMinApproved   = 0;    // เงื่อนไขขั้นต่ำจำนวนสมาชิก Approved ที่ต้องมีก่อนโอนได้
let commissionMinAmount     = 0;    // ยอดขั้นต่ำต่อการโอนหนึ่งครั้ง (USDT)
let commissionCanTransfer   = false;// approvedCount >= minApproved ?
let _commissionLoaded       = false;// กันแสดง 0.00 ผิดๆ ก่อนโหลดครั้งแรกเสร็จ
let _commTabFailed          = false;// [FIX] true เมื่อ getMemberDashboard/getDashboard ล้มเหลว — ให้ UI โชว์ "ลองใหม่" แทนค้างที่ "กำลังโหลด..." เฉยๆ

// ── updateLocalBalance — sync local state + UI สำหรับ field balance ต่างๆ ──
function updateLocalBalance(field, amount) {
  const amt = parseFloat(amount) || 0;
  switch (field) {
    case 'funding_balance':
      fundingWalletBalance = Math.max(0, fundingWalletBalance + amt);
      break;
    case 'main_balance':
    case 'spot_balance':
      mainWalletBalance = Math.max(0, mainWalletBalance + amt);
      break;
    case 'futures_balance':
      // futures balance สะท้อนผ่าน earnContracts/currentBalance อยู่แล้ว ไม่ปรับตรงนี้
      break;
    default:
      break;
  }
  // [RED-12 FIX] Invalidate dash cache so next Assets visit fetches fresh balance from GAS
  if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE && USER_PROFILE.uid) {
    if (typeof LS !== 'undefined') LS.del('dash_' + USER_PROFILE.uid);
  }
  if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
  if (typeof renderSpotBalanceList === 'function') renderSpotBalanceList();
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
}

// ── Generate unique contract ID ──
function genContractId() {
  return 'EC-' + Date.now().toString(36).toUpperCase().slice(-6);
}

// ── Drawdown % relative to stakedAmount ──
// ══════════════════════════════════════════════════════════
//  EARN CONTRACT — CORE CALC FUNCTIONS
//  กฎหลัก:
//  1. margin รวม > 10% stakedAmount → บล็อก
//  2. Realized Loss > 10% stakedAmount → บล็อก
//  3. Drawdown ≥ 40% (currentBalance ≤ 60% stakedAmount) → Auto Liquidate + Freeze
// ══════════════════════════════════════════════════════════

// syncContractBalance: เรียกทุกครั้งก่อนคำนวณ/แสดงผล
// balance = stakedAmount + realizedPnl + totalUnrealizedPnl  [FIX-SYNC-1: ลบ marginUsed ออก]
// (margin = locked ไม่ใช่ lost — ตรงกับ GAS: current_balance = staked + realized_pnl)
// (realizedPnl รวม yield ที่สะสมแล้ว และ loss จากการปิด position)
// [vx3 FIX-FROZEN-BAL] frozen: set currentBalance = frozenBalance || stakedAmount แทน return
// เดิม: return ทันที → currentBalance ค้างค่าเก่าก่อน freeze → Overview แสดงยอดผิด
// ใหม่: อัปเดต currentBalance จาก frozenBalance ที่ sync มาจาก GAS (real-time ทุกครั้งที่ call)
function syncContractBalance(c) {
  if (!c) return;
  if (c.status === 'frozen') {
    // [vx3 FIX-FROZEN-BAL] ใช้ frozenBalance (จาก GAS frozen_balance) เป็น currentBalance
    // frozenBalance ถูก parse จาก r.frozen_balance ตอน _mergeDashEarnContracts → ค่าสด
    // fallback: stakedAmount เผื่อ GAS ยังไม่เขียน frozen_balance (edge case)
    c.currentBalance = c.frozenBalance > 0 ? c.frozenBalance : (c.stakedAmount || 0);
    return;
  }
  const cPos = S.positions.filter(p => p.earnContractId === c.contractId);
  const pendingMargin = (S.openOrders || [])                                  // [FIX Bug#3] นับ pending margin ของ Limit Orders รอ fill
    .filter(o => o.earnContractId === c.contractId)
    .reduce((s, o) => s + (o.margin || 0), 0);
  const totalMarginUsed = cPos.reduce((s, p) => s + p.margin, 0) + pendingMargin;
  const totalUnrealized = cPos.reduce((s, p) => s + (p.pnl || 0), 0);
  const realized = c.realizedPnl || 0;
  // [v4 FIX Bug3] cap currentBalance ต้องไม่ต่ำกว่า 0 และไม่เกิน stakedAmount*2
  // และ totalUnrealized loss ต้องไม่เกิน stakedAmount (ป้องกันตัวเลขเกินจริงจาก leverage สูง)
  const cappedUnrealized = Math.max(-(c.stakedAmount), Math.min(c.stakedAmount, totalUnrealized));
  // [FIX-SYNC-1] ลบ totalMarginUsed ออกจากสูตร: margin คือ locked ไม่ใช่ค่าใช้จ่าย
  // เดิม: stakedAmount + realized − marginUsed + unrealized → ยอดดูน้อยกว่าจริงขณะมี position
  // ใหม่: stakedAmount + realized + unrealized (เหมือน GAS current_balance = staked + realized_pnl)
  // totalMarginUsed ยังคงคำนวณไว้ใช้ใน _refreshAvbl / calcAvailMargin เพื่อตรวจ margin quota
  c.currentBalance = Math.max(0, c.stakedAmount + realized + cappedUnrealized);
}

// [v9 FIX] ── Refresh/Sync Lock รวมศูนย์ ──────────────────────────────────
// _isSyncLocked() = true เมื่อ "ยังไม่ปลอดภัยที่จะคำนวณ DD/Liquidation จาก local state"
//   1) window._refreshLock   → true ระหว่าง loadOfflineState() กำลังทำงานจริง (ผูกกับ sync จริง ไม่ใช่ timer)
//   2) window._restoreGracePeriodUntil → fallback แบบ timer (กันเคส sync เสร็จเร็วแต่ coinPrices ยังไม่ stable)
// ใช้แทนการเช็ค _restoreGracePeriodUntil ตรงๆ ทุกจุด เพื่อให้ทุกจุดอ่านสถานะ "Lock" ชุดเดียวกัน
function _isSyncLocked() {
  if (window._refreshLock) return true;
  return !!(window._restoreGracePeriodUntil && Date.now() < window._restoreGracePeriodUntil);
}
// [v9 FIX] ── Pending-Freeze Guard ───────────────────────────────────────
// กัน loadOfflineState() ดึง contract status เก่าจาก GAS (ยังไม่ทัน sync การ freeze ล่าสุด)
// มาทับ status='frozen' ที่ _autoLiquidate() เพิ่ง set ไว้ใน local ให้กลายเป็น active ผิดๆ
window._pendingFreeze = window._pendingFreeze || {};
// [FIX Bug#6] Pending-Earn-Sync Guard — เหมือน _pendingFreeze แต่คุ้มครอง realizedPnl/currentBalance
// ปัญหา: หลังกดปิด position, local อัปเดต c.realizedPnl ทันที (ถูกต้อง) แต่ GAS sync รอบถัดไป
// (loadOfflineState/syncOfflineEngine) อาจดึงข้อมูลจาก sheet มาได้ "ก่อน" write ของการปิด position
// จะ commit เสร็จจริงบน GAS (มี latency 3-5s) → ทับ local ด้วยค่าเก่า ทำให้ UI กระพริบกลับไปเป็น
// ค่าก่อนปิด แล้วค้างอยู่อย่างนั้นจนกว่าจะ refresh หน้าใหม่ (ซึ่ง sync รอบใหม่จะได้ค่าที่ถูกต้องแล้ว)
window._pendingEarnSync = window._pendingEarnSync || {};

// [v17 FIX] calcDrawdown() (local DD formula) ถูกลบออกทั้งหมดแล้ว — ไม่เหลือ trace ของ
// local formula ใดๆ ในไฟล์นี้อีกต่อไป ทุกจุด trigger/display ต้องใช้ _gasDDStrict()/_gasDD()
// ด้านล่างเท่านั้น (อ่านจาก window._contractDDMap ซึ่งเป็นค่าที่ได้จาก GAS getContractStatus)

// [v13 FIX] ── GAS Drawdown Helpers (Single Source of Truth) ──────────────────
// _gasDDStrict: สำหรับจุด TRIGGER/ACTION เท่านั้น (auto-liquidate, close position, place order)
//   อ่านจาก window._contractDDMap (มาจาก getContractStatus ของ GAS) เท่านั้น
//   ไม่ fallback ไป c._gasDrawdown หรือ local formula เด็ดขาด — กัน false-liquidate
//   คืนค่า null ถ้ายังไม่มีข้อมูลจาก GAS → caller ต้อง "ไม่ trigger" เมื่อเจอ null
function _gasDDStrict(c) {
  if (!c) return null;
  const _m = window._contractDDMap && window._contractDDMap[c.contractId];
  if (_m && _m.drawdown_pct !== undefined && _m.drawdown_pct !== null) {
    const v = parseFloat(_m.drawdown_pct);
    if (!isNaN(v)) return v;
  }
  return null;
}
// _gasDD: สำหรับจุด DISPLAY เท่านั้น — _contractDDMap → c._gasDrawdown → null (ไม่มี local formula)
function _gasDD(c) {
  const v = _gasDDStrict(c);
  if (v !== null) return v;
  if (c && c._gasDrawdown !== undefined && c._gasDrawdown !== null) {
    const v2 = parseFloat(c._gasDrawdown);
    if (!isNaN(v2)) return v2;
  }
  return null;
}
// _gasDDPctStr: format ไว้ใช้แสดงผลเป็น string — คืน '—' ถ้าไม่มีข้อมูลจาก GAS เลย
function _gasDDPctStr(c) {
  const v = _gasDD(c);
  return (v === null) ? '—' : v.toFixed(1);
}

// [FIX MARGIN-POOL] Avail margin cap = static pool 10% stakedAmount
//   ลบด้วย (margin ที่เปิดอยู่ + pending order margin + realized loss สะสม)
//   เดิม: หักเฉพาะ margin ของ position ที่เปิดอยู่ ณ ขณะนั้น → พอปิด position (ไม่ว่ากำไร/ขาดทุน)
//         ตัวเลขเด้งกลับเต็ม 100% ทันที ไม่สะท้อนขาดทุนสะสมที่เกิดไปแล้ว (บั๊กที่ทำให้สมาชิก
//         เห็น "วงเงินคงเหลือ 100.00" คงที่ตลอด ทั้งที่ realizedPnl ติดลบสะสมไปแล้ว)
//   ใหม่: realized loss สะสมกิน quota ถาวร (ไม่คืนกลับ) — ต้อง Claim/Redeem สัญญาเพื่อ reset
//         realizedPnl=0 เท่านั้นถึงจะได้ quota เต็มใหม่ ตรงกับ _refreshAvbl() และ backend guard
function calcAvailMargin(c) {
  if (!c || c.status === 'frozen') return 0;
  const maxAllowed = c.stakedAmount * 0.10;
  const totalUsed = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + p.margin, 0);
  const pendingMargin = (S.openOrders || [])
    .filter(o => o.earnContractId === c.contractId)
    .reduce((s, o) => s + (o.margin || 0), 0);
  const realizedLoss = Math.max(0, -(c.realizedPnl || 0));
  return Math.max(0, maxAllowed - totalUsed - pendingMargin - realizedLoss);
}

function calcContractBalance(c) {
  syncContractBalance(c);
  return c.currentBalance;
}

// ── Risk level: 0=ok, 1=warn30, 2=warn35, 3=frozen ──
function getRiskLevel(c) {
  // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → 0 (ไม่มี local formula fallback)
  const dd = _gasDD(c) ?? 0;
  if (c.status === 'frozen') return 3;
  if (dd >= 40) return 3;
  if (dd >= 35) return 2;
  if (dd >= 30) return 1;
  return 0;
}

// ── Days elapsed / total ──
function calcDaysPassed(c) {
  const ms = Date.now() - c.startTime;
  return Math.min(c.planDays, Math.floor(ms / 86400000));
}

// ── Earn Contract Countdown helpers ──
function _earnCountdownMs(c) {
  // เวลาที่เหลือจนครบกำหนด (ค่าลบ = หมดแล้ว)
  const endTime = c.startTime + (c.planDays * 86400000);
  return endTime - Date.now();
}
function _earnCountdownExpired(c) {
  return c.status === 'matured' || _earnCountdownMs(c) <= 0;
}
function _earnCountdownText(c) {
  if (c.status === 'matured') return tccT('earn_completed');
  const ms = _earnCountdownMs(c);
  if (ms <= 0) return tccT('earn_completed');
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d >= 1) {
    return `⏱ ${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return `⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Live tick: อัพเดท countdown badges ทุก 1 วินาที ──
(function _startEarnCountdownTick() {
  setInterval(function() {
    // อัพเดทเฉพาะ elements ที่มีอยู่ในหน้า ไม่ต้อง re-render card ทั้งหมด
    document.querySelectorAll('.earn-plan-countdown[data-cid]').forEach(function(el) {
      const cid = el.getAttribute('data-cid');
      const c = (typeof earnContracts !== 'undefined')
        ? earnContracts.find(x => x.contractId === cid)
        : null;
      if (!c) return;
      el.textContent = _earnCountdownText(c);
      el.classList.toggle('expired', _earnCountdownExpired(c));
    });
  }, 1000);
})();

// ── Render all Earn cards ──
function renderEarnContracts() {
  const listEl = document.getElementById('earnContractList');
  if (!listEl) return;

  // [v2.35 NEW] สัญญา status='closed' (redeem แล้ว) ไม่ต้องแสดงในรายการอีกต่อไป
  const _visibleContracts = earnContracts.filter(c => c.status !== 'closed');

  let total = 0, cntActive = 0, cntFrozen = 0, cntMatured = 0, totalClaimed = 0;
  _visibleContracts.forEach(c => {
    total += c.currentBalance;
    totalClaimed += (c.totalClaimed || 0);
    if (c.status === 'active') cntActive++;
    else if (c.status === 'frozen') cntFrozen++;
    else if (c.status === 'matured') cntMatured++;
  });

  const tb = document.getElementById('earnTotalBal');
  if (tb) tb.textContent = fmtM(total);
  const ta = document.getElementById('earnCountActive'); if(ta) ta.textContent = cntActive;
  const tf = document.getElementById('earnCountFrozen'); if(tf) tf.textContent = cntFrozen;
  const tm = document.getElementById('earnCountMatured'); if(tm) tm.textContent = cntMatured;
  const tc = document.getElementById('earnTotalClaimed'); if(tc) tc.textContent = fmtM(totalClaimed);
  const cc = document.getElementById('earnContractCount'); if(cc) cc.textContent = _visibleContracts.length + ' ' + tccT('contracts_unit');

  if (!_visibleContracts.length) {
    // [FIX-4] ถ้า dashboard ยังโหลดอยู่ → แสดง skeleton แทน "ยังไม่มีสัญญา"
    // ป้องกัน flash ข้อความ "ยังไม่มีสัญญา" ก่อน loadOfflineState/loadDashboard เสร็จ
    if (!window._dashboardReady) {
      listEl.innerHTML = `
        <div style="padding:12px 0">
          ${[1,2].map(() => `
            <div style="background:var(--c2);border-radius:14px;padding:16px;margin-bottom:12px;animation:_skPulse 1.4s ease-in-out infinite">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="width:110px;height:14px;background:var(--c3);border-radius:6px"></div>
                <div style="width:60px;height:20px;background:var(--c3);border-radius:10px"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="height:36px;background:var(--c3);border-radius:8px"></div>
                <div style="height:36px;background:var(--c3);border-radius:8px"></div>
                <div style="height:36px;background:var(--c3);border-radius:8px"></div>
                <div style="height:36px;background:var(--c3);border-radius:8px"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <style>
          @keyframes _skPulse {
            0%,100%{opacity:1} 50%{opacity:.45}
          }
        </style>`;
      return;
    }
    listEl.innerHTML = `<div class="earn-empty">
      <div class="earn-empty-icon">🏦</div>
      <div style="font-size:14px;color:var(--t2);font-weight:600"><span data-i18n="no_earn">${tccT('no_earn')}</span></div>
      <div style="font-size:12px;text-align:center;line-height:1.6;color:var(--t3)"><span data-i18n="create_earn_hint">${tccT('create_earn_hint')}</span></div>
    </div>`;
    return;
  }

  // [FIX Bug1.2] sort newest first (startTime desc) ก่อน render
  const _sortedContracts = [..._visibleContracts].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  listEl.innerHTML = _sortedContracts.map(c => buildEarnCard(c)).join('');
  updateEarnDropdown();
}


function buildEarnCard(c) {
  // [v4 FIX-ACTIVE-FROZEN] Reconcile c.status กับ _contractDDMap.isFrozen
  // ปัญหา: ตอน refresh ใหม่ loadOfflineState() ดึง earnContracts จาก GAS แบบ parallel
  //   กับ getContractStatus — บางครั้ง getContractStatus (step 1b) เสร็จก่อน
  //   แล้ว _contractDDMap[cid].isFrozen = true แต่ earn contract row จาก GAS
  //   (step 2) ยังส่ง status='active' มา (Sheet latency / cache เก่า)
  //   → buildEarnCard เห็น c.status='active' → badge แสดง ● ACTIVE ผิด
  //   → ประมาณ 1 นาทีถัดมา GAS Trigger sync ใหม่ → ถึงจะแสดง 🔒 FROZEN
  //
  // แก้: ถ้า _contractDDMap บอก isFrozen=true แต่ c.status ยังเป็น 'active'
  //   → บังคับ c.status='frozen' ใน local ทันที (เฉพาะ render ไม่แตะ object จริง)
  //   _pendingFreeze guard ที่มีอยู่แล้วจะป้องกันไม่ให้ loadOfflineState() ทับ
  //   c.status='frozen' นี้กลับไปเป็น 'active' ในรอบถัดไป
  const _ddInfo = (window._contractDDMap || {})[c.contractId];
  if (_ddInfo && _ddInfo.isFrozen && c.status !== 'frozen' && c.status !== 'matured') {
    // GAS ยืนยัน isFrozen=true แล้ว — sync status local ทันที
    c.status = 'frozen';
    // ตั้ง _pendingFreeze เผื่อ loadOfflineState รอบถัดไปจะมาทับ
    window._pendingFreeze = window._pendingFreeze || {};
    if (!window._pendingFreeze[c.contractId]) {
      window._pendingFreeze[c.contractId] = Date.now() + 30000;
    }
  }
  // Sync balance จาก positions จริงก่อน render
  syncContractBalance(c);
  // ใช้ frozenBalance (snapshot ตอน freeze) เพื่อแสดงค่าที่ถูกต้อง
  const displayBalance = c.status === 'frozen' ? (c.frozenBalance ?? c.currentBalance) : c.currentBalance;
  const liveUnrealizedPnl = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + (p.pnl || 0), 0);

  // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → 0 (ไม่มี local formula fallback)
  const dd = _gasDD(c) ?? 0;
  const margin = calcAvailMargin(c);
  const risk = getRiskLevel(c);
  const daysPassed = calcDaysPassed(c);
  const daysPct = (daysPassed / c.planDays * 100).toFixed(0);

  // Drawdown bar color
  const ddColor = dd >= 35 ? 'var(--r)' : dd >= 30 ? 'var(--y)' : 'var(--g)';

  // Net profit calculation
  const netProfit = (c.realizedPnl || 0) + liveUnrealizedPnl;
  const canClaim = netProfit > 0 && c.status !== 'frozen';
  // [v2.35] Redeem: matured + ไม่มี APT ค้าง
  const isRedeemReady = c.status === 'matured' && netProfit <= 0;
  // [v2.39] Frozen Redeem: frozen + end_time ผ่านแล้ว (ใช้โครงสร้างเดียวกับ matured)
  // [v6 FIX] เลื่อนขึ้นมาก่อน warnHtml block — เดิมอยู่หลัง if(isFrozenRedeemReady) ทำให้เกิด TDZ ReferenceError
  const isFrozenRedeemReady = c.status === 'frozen' && (c.endTime || 0) > 0 && Date.now() >= (c.endTime || 0);

  // Warning bar HTML
  let warnHtml = '';
  if (c.status === 'frozen') {
    if (isFrozenRedeemReady) {
      warnHtml = `<div class="earn-warn-bar frozen" style="display:flex">${tccT('warn_frozen_redeem_ready')}</div>`;
    } else {
      warnHtml = `<div class="earn-warn-bar frozen" style="display:flex">${tccT('warn_frozen_wait')}</div>`;
    }
  } else if (risk === 2) {
    warnHtml = `<div class="earn-warn-bar red" style="display:flex">${tccT('warn_critical_dd').replace('—%',dd.toFixed(1)+'%')}</div>`;
  } else if (risk === 1) {
    warnHtml = `<div class="earn-warn-bar yellow" style="display:flex">${tccT('warn_risk_dd').replace('—%',dd.toFixed(1)+'%')}</div>`;
  }

  // Status badge
  const statusMap = { active: 'active', frozen: 'frozen', matured: 'matured' };

  return `<div class="earn-card ${c.status === 'frozen' ? 'frozen' : c.status === 'matured' ? 'matured' : ''}">
    ${warnHtml}
    <div class="earn-card-top">
      <div class="earn-card-head">
        <div class="earn-plan-badge">
          <div class="earn-plan-icon">${c.planDays <= 15 ? '🥉' : c.planDays <= 30 ? '🥈' : c.planDays <= 90 ? '🥇' : '💎'}</div>
          <div>
            <div class="earn-plan-name">${c.planDays}-Day Plan${c.contractTier === 'vip' ? ' <span style="color:var(--g);font-weight:700">👑 VIP</span>' : ''}<span class="earn-plan-countdown ${_earnCountdownExpired(c)?'expired':''}" data-cid="${c.contractId}">${_earnCountdownText(c)}</span></div>
            <div class="earn-plan-id">${c.contractId}</div>
          </div>
        </div>
        <span class="earn-status-badge ${statusMap[c.status] || 'active'}">${c.status === 'frozen' ? tccT('badge_frozen') : c.status === 'matured' ? tccT('badge_matured') : tccT('badge_active')}</span>
      </div>
      <div class="earn-card-grid">
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('staked_amount')}</div>
          <div class="earn-cg-val">${fmtM(c.stakedAmount)}</div>
        </div>
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('current_balance')}</div>
          <div class="earn-cg-val" style="color:var(--g)">${fmtM(displayBalance)}</div>
        </div>
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('apt_daily')}</div>
          <div class="earn-cg-val" style="color:var(--y)">${(c.dailyYield*c.planDays).toFixed(1)}% / ${c.dailyYield}%</div>
        </div>
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('realized_pnl')}</div>
          <div class="earn-cg-val" id="ec-rpnl-${c.contractId}" style="color:${(c.realizedPnl||0)>=0?'var(--g)':'var(--r)'}">${(c.realizedPnl||0)>=0?'+':''}${fmtM(c.realizedPnl||0)}</div>
        </div>
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('unrealized_pnl')}</div>
          <div class="earn-cg-val" id="ec-upnl-${c.contractId}" style="color:${liveUnrealizedPnl>=0?'var(--g)':'var(--r)'}">${liveUnrealizedPnl>=0?'+':''}${fmtM(liveUnrealizedPnl)}</div>
        </div>
        <div class="earn-cg-item">
          <div class="earn-cg-label">${tccT('avail_margin')}</div>
          <div class="earn-cg-val" style="color:var(--t1)">${fmtNum(margin,2)}</div>
        </div>
      </div>
    </div>
    <!-- Drawdown bar -->
    <div class="earn-dd-section">
      <div class="earn-dd-hdr">
        <span class="earn-dd-label">${tccT('drawdown_from_principal')}</span>
        <span class="earn-dd-pct" style="color:${ddColor}">${dd.toFixed(2)}%</span>
      </div>
      <div class="earn-dd-track">
        <div class="earn-dd-fill" style="width:${Math.min(100,dd)}%;background:${ddColor}"></div>
        <div class="earn-dd-mark30"></div>
        <div class="earn-dd-mark35"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:9px;color:var(--t3)">
        <span>0%</span><span style="margin-left:calc(30% - 10px)">⚠30%</span><span style="margin-left:calc(5% - 10px)">🚨35%</span><span style="margin-left:auto">40% Liq</span>
      </div>
    </div>
    <!-- Progress -->
    <div class="earn-progress-row">
      <div class="earn-progress-track">
        <div class="earn-progress-fill" style="width:${daysPct}%"></div>
      </div>
      <span class="earn-progress-label">${daysPassed}/${c.planDays}d</span>
    </div>
    <!-- Actions -->
    <div class="earn-card-actions">
      ${(isRedeemReady || isFrozenRedeemReady)
        ? `<button class="earn-act-btn redeem" onclick="openRedeemModal('${c.contractId}')">
             ${tccT('btn_redeem_principal')} (+$${fmtM(c.stakedAmount)})
           </button>`
        : `<button class="earn-act-btn claim" ${!canClaim?'disabled':''} onclick="openClaimModal('${c.contractId}','${c.isFixed ? 'fixed' : 'all'}')">
             ${c.isFixed ? '🔒 ' : ''}${tccT('btn_share_profit')}${canClaim?' (+$'+fmtM(netProfit)+')':''}
           </button>`
      }
      <button class="earn-act-btn ${c.isFixed ? 'fixed-mode' : 'trade'}" ${c.isFixed ? 'disabled title="Fixed Mode — APT only"' : `onclick="goTradeWithContract('${c.contractId}')"`}>
        ${c.isFixed ? '🔒 Fixed' : 'Trade'}
      </button>
      <button class="earn-act-btn detail" onclick="showEarnDetail('${c.contractId}')">
        ···
      </button>
    </div>
  </div>`;
}

// ── Earn Dropdown in Futures page ──
function updateEarnDropdown() {
  const dd = document.getElementById('earnSelDD');
  const txtEl = document.getElementById('earnSelText');
  const badgeEl = document.getElementById('earnMarginBadge');
  if (!dd) return;

  const active = earnContracts.filter(c => c.status === 'active' || c.status === 'frozen');
  if (!active.length) {
    dd.innerHTML = `<div class="earn-sel-item" style="color:var(--t3);font-size:10px;padding:10px;text-align:center"><span data-i18n="no_earn_dd">${tccT('no_earn_dd')}</span></div>`;
    if (txtEl) txtEl.textContent = tccT('earn_select');
    if (badgeEl) badgeEl.textContent = 'Avbl: —';
    return;
  }

  dd.innerHTML = active.map(c => {
    // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → '—' (ไม่มี local formula fallback)
    const dd_pct = _gasDDPctStr(c);
    const margin = fmtM(calcAvailMargin(c));
    const isFrozen = c.status === 'frozen';
    const isFixed  = !!c.isFixed;  // [v2.34 FIX-Q] Fixed mode flag
    // [v2.34 FIX-Q] class: frozen-item ก่อน, fixed-item ถ้าเป็น Fixed mode
    const itemClass = isFrozen ? 'frozen-item' : (isFixed ? 'fixed-item' : '');
    const iconPrefix = isFrozen ? '🔒' : (isFixed ? '🔒' : '●');
    const trailBadge = isFrozen ? ' | FROZEN' : (isFixed ? ' | FIXED (APT Only)' : '');
    return `<div class="earn-sel-item ${itemClass}" onclick="selectEarnContract('${c.contractId}')">
      <div class="earn-sel-item-name">${iconPrefix} ${c.planDays}-Day Plan · ${c.contractId}</div>
      <div class="earn-sel-item-detail">Balance: ${fmtM(c.status === 'frozen' ? (c.frozenBalance ?? c.currentBalance) : c.currentBalance)} USDT | APT ${(c.dailyYield*c.planDays).toFixed(1)}% | DD: ${dd_pct}${dd_pct === '—' ? '' : '%'} | Margin: ${margin} USDT${trailBadge}</div>
    </div>`;
  }).join('');

  // Auto-select if only one active (หรือ selectedEarnContractId ยังไม่ได้ set หรือ contract ที่เลือกอยู่กลาย frozen)
  if (!selectedEarnContractId) {
    const firstActive = active.find(c => c.status === 'active');
    if (firstActive) selectEarnContract(firstActive.contractId);
  } else {
    // ถ้า contract ที่เลือกอยู่กลายเป็น frozen → ย้ายไป active ตัวแรก
    const selected = earnContracts.find(x => x.contractId === selectedEarnContractId);
    if (selected && selected.status === 'frozen') {
      const firstActive = active.find(c => c.status === 'active');
      if (firstActive) {
        selectEarnContract(firstActive.contractId);
      } else {
        // ไม่มี active เลย → คง selectedEarnContractId ไว้ แต่แสดง frozen state
      }
    }
  }
}

function toggleEarnSelDD(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('earnSelDD');
  if (dd) dd.classList.toggle('open');
}

// ปิด dropdown เมื่อคลิกนอกพื้นที่
(function _initEarnSelOutsideClick() {
  document.addEventListener('click', function(e) {
    const wrap = document.querySelector('.earn-sel-wrap');
    const dd = document.getElementById('earnSelDD');
    if (!dd || !dd.classList.contains('open')) return;
    if (wrap && wrap.contains(e.target)) return;
    dd.classList.remove('open');
  });
})();

function selectEarnContract(id) {
  selectedEarnContractId = id;
  const c = earnContracts.find(x => x.contractId === id);
  const dd = document.getElementById('earnSelDD');
  if (dd) dd.classList.remove('open');
  if (!c) return;
  syncContractBalance(c);   // sync ก่อนแสดง
  _refreshAvbl(c);
  updateRiskWarnings(c);
  // ── re-render positions เพื่อแสดงเฉพาะ positions ของสัญญาที่เลือก ──
  renderPositions();
  // [v2.34 FIX-Q] sync ปุ่ม Long/Short ให้แสดง Fixed mode ถ้าสัญญาที่เลือกเป็น Fixed
  _updateTradeBtnLabels();
}

function updateRiskWarnings(c) {
  const risk = getRiskLevel(c);
  // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → '—' (ไม่มี local formula fallback)
  const dd_pct = _gasDDPctStr(c);
  const _ddSuffix = dd_pct === '—' ? '' : '%';
  document.getElementById('riskWarn30').classList.toggle('show', risk >= 1 && risk < 3);
  document.getElementById('riskWarn35').classList.toggle('show', risk === 2);
  document.getElementById('riskWarnFrozen').classList.toggle('show', risk === 3);
  const p30 = document.getElementById('riskWarn30Pct'); if(p30) p30.textContent = dd_pct + _ddSuffix;
  const p35 = document.getElementById('riskWarn35Pct'); if(p35) p35.textContent = dd_pct + _ddSuffix;
}

function goTradeWithContract(id) {
  selectEarnContract(id);
  navTo('futures');
}

// ── Create Earn Modal ──
function openCreateEarn() {
  document.getElementById('earnCreateModal').classList.add('open');
  earnCalcPreview();
}
function closeCreateEarn() {
  document.getElementById('earnCreateModal').classList.remove('open');
}
function selectEarnPlan(el, days, yld) {
  document.querySelectorAll('.earn-plan-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  earnCreatePlan = { days, yield: yld };
  earnCalcPreview();
}
function earnCalcPreview() {
  const amt = parseFloat(document.getElementById('earnDepositAmt')?.value) || 0;
  const { days, yield: yld } = earnCreatePlan;
  const daily = amt * yld / 100;
  const total = daily * days;
  const margin = amt * 0.10;
  document.getElementById('earnPreviewDaily').textContent = amt > 0 ? '+' + fmtM(daily) + ' USDT/' + tccT('day_unit') : '—';
  document.getElementById('earnPreviewTotal').textContent = amt > 0 ? '+' + fmtM(total) + ' USDT' : '—';
  document.getElementById('earnPreviewMargin').textContent = amt > 0 ? fmtNum(margin,2) + ' USDT' : '—';
  // [NEW: TIER] preview VIP — เงื่อนไขเดียวกับ backend logEarnCreate()
  const tierRow = document.getElementById('earnTierPreviewRow');
  if (tierRow) tierRow.style.display = (amt >= 1000 && days >= 30) ? '' : 'none';
  const btn = document.getElementById('earnSubmitBtn');
  if (btn) btn.disabled = amt < 100;
}
function submitCreateEarn() {
  const amt = parseFloat(document.getElementById('earnDepositAmt')?.value);
  if (!amt || amt < 100) { showToast(tccT('toast_min_100')); return; }
  if (amt > mainWalletBalance) { showToast(tccT('toast_insufficient_funds')); return; }
  const { days, yield: yld } = earnCreatePlan;
  const now = Date.now();
  // [NEW: TIER] คำนวณ tier เดียวกับกฎ backend logEarnCreate() — 'vip' ถ้า amt>=1000 && days>=30
  const _tier = (amt >= 1000 && days >= 30) ? 'vip' : 'standard';
  const contract = {
    contractId: genContractId(),
    uid: USER_PROFILE.uid || 'USER001',       // [v6 FIX] GAS syncEarnContracts check c.uid
    userId: USER_PROFILE.uid || 'USER001',     // backward-compat alias
    stakedAmount: amt, currentBalance: amt, planDays: days,
    dailyYield: yld, startTime: now, endTime: now + days * 86400000,
    status: 'active', realizedPnl: 0, unrealizedPnl: 0, totalClaimed: 0,
    contractTier: _tier, // [NEW: TIER]
  };
  earnContracts.unshift(contract);  // [FIX Bug1.2] ใส่หัว array → สัญญาใหม่ขึ้นก่อนเสมอ
  mainWalletBalance -= amt;
  if (typeof recordTx === 'function') recordTx(contract.contractId, 'create', -amt, 'สร้างสัญญา ' + days + '-Day @ ' + yld + '%/day');
  closeCreateEarn();
  renderEarnContracts();
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
  showToast(tccTF('toast_contract_created',{cid:contract.contractId}));
  // [FIX-2] ลบ _onEarnCreate hook call ออก — เดิมเรียก saveEarnCreate ซ้ำ 2 ครั้ง
  // (ครั้งแรกผ่าน _onEarnCreate hook บรรทัดนี้, ครั้งที่สองด้านล่าง) → GAS ได้ logEarnCreate 2 รอบ
  // → Transactions sheet มี Earn Deposit 2 แถวต่อ 1 สัญญา ห่างกัน ~9 วินาที
  // แก้ไข: ใช้ saveEarnCreate โดยตรงเส้นทางเดียว (เส้นทางด้านล่าง) เท่านั้น
  document.getElementById('earnDepositAmt').value = '';
  // [v4] สร้างสัญญาใหม่ — ใช้ saveEarnCreate เป็นเส้นทางเดียวไปยัง GAS (logEarnCreate)
  // syncEarnContractsToGAS ตัดออก — saveEarnCreate + syncEarnContracts(startup) ครอบคลุมแล้ว
  if (typeof saveEarnCreate === 'function') {
    saveEarnCreate({
      contractId: contract.contractId,
      amount:     contract.stakedAmount,
      planDays:   contract.planDays,
      dailyYield: contract.dailyYield,
    });
  }
}

// simulateEarnPnl ถูกลบออก — balance คำนวณจาก positions จริงผ่าน syncContractBalance เท่านั้น

// ── Claim Profit Modal ──
// [v3 FIX-1] openClaimModal
//   • ถ้าหา earnContracts ไม่เจอ → แสดง toast แทน return เงียบๆ
//   • netProfit สำหรับแสดงผล = realized + liveUnrealized (ตรงกับ buildEarnCard)
// ── _updateClaimSubButtons — อัปเดตสถานะ 2 ปุ่มย่อยใน modal ──────────────
// เรียกหลังเปิด modal ทุกครั้ง
function _updateClaimSubButtons(c) {
  const now        = Date.now();
  // [FIX] นับจาก last APT claim ไม่ใช่จาก startTime
  // เพราะ realizedPnl ถูก reset ทุกครั้งที่ claim APT → estimate ต้องตรงกัน
  const refMs      = c.lastAptClaimMs || c.lastYieldTimeMs || c.startTime || 0;
  const daysPassed = refMs > 0 ? Math.max(0, (now - refMs) / 86400000) : 0;
  const aptYield   = c.stakedAmount > 0
    ? Math.max(0, c.stakedAmount * (c.dailyYield / 100) * daysPassed) : 0;
  const tradePnl   = Math.max(0, (c.realizedPnl || 0) - aptYield);
  const liveUr     = S.positions.filter(p => p.earnContractId === c.contractId)
                      .reduce((s, p) => s + (p.pnl || 0), 0);
  const netTrade   = Math.max(0, tradePnl + Math.min(0, liveUr));

  // APT countdown
  const APT_MS     = 15 * 86400000;
  const lastAptMs  = c.lastAptClaimMs || c.startTime || 0;
  const nextAptMs  = lastAptMs + APT_MS;
  const msLeft     = Math.max(0, nextAptMs - now);
  const canApt     = aptYield > 0 && now >= nextAptMs && c.status !== 'frozen';
  const dLeft      = Math.floor(msLeft / 86400000);
  const hLeft      = Math.floor((msLeft % 86400000) / 3600000);

  // ── ปุ่ม 1: Claim Profits ──
  const tradeBtn = document.getElementById('claimTradeBtn');
  if (tradeBtn) {
    const tradeDisabled = netTrade <= 0 || c.status === 'frozen';
    tradeBtn.disabled = tradeDisabled;
    const tradeAmtEl = document.getElementById('claimTradeAmt');
    if (tradeAmtEl) {
      if (!tradeDisabled && netTrade > 0) {
        tradeAmtEl.textContent = '+' + fmtM(netTrade * 0.40, 4) + ' USDT';
        tradeAmtEl.style.display = 'block';
      } else {
        tradeAmtEl.style.display = 'none';
      }
    }
  }

  // ── ปุ่ม 2: Claim APT ──
  const aptBtn    = document.getElementById('claimAptBtn');
  const aptAmtEl  = document.getElementById('claimAptAmt');
  const aptCdRow  = document.getElementById('claimAptCdRow');
  const cdD = document.getElementById('claimCdD');
  const cdH = document.getElementById('claimCdH');
  const cdM = document.getElementById('claimCdM');
  const cdS = document.getElementById('claimCdS');
  if (aptBtn) {
    aptBtn.disabled = !canApt;
    if (canApt) {
      // เคลมได้แล้ว — แสดงยอด APT ซ่อน countdown
      if (aptAmtEl) { aptAmtEl.textContent = '+' + fmtM(aptYield, 4) + ' USDT'; aptAmtEl.style.display = 'block'; }
      if (aptCdRow) aptCdRow.style.display = 'none';
    } else {
      // ยังไม่ถึงรอบ — แสดงยอดสะสม + countdown
      if (aptAmtEl) {
        aptAmtEl.textContent = '+' + fmtM(aptYield, 4) + ' USDT';
        aptAmtEl.style.display = aptYield > 0 ? 'block' : 'none';
      }
      if (aptCdRow) aptCdRow.style.display = 'flex';
      if (cdD) cdD.textContent = String(dLeft).padStart(2, '0');
      if (cdH) cdH.textContent = String(hLeft).padStart(2, '0');
      if (cdM) cdM.textContent = String(Math.floor((msLeft % 3600000) / 60000)).padStart(2, '0');
      if (cdS) cdS.textContent = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');
      // [FIX] live tick ทุก 1s (เดิม 60s ทำให้นาฬิกาดูหยุดนิ่ง)
      // [FIX] คำนวณ rem จาก nextAptMs โดยตรง ไม่ใช่จาก msLeft snapshot เก่า
      if (!aptBtn._cdTick) {
        aptBtn._cdTick = setInterval(function() {
          const rem = Math.max(0, nextAptMs - Date.now());
          const dd = Math.floor(rem / 86400000);
          const hh = Math.floor((rem % 86400000) / 3600000);
          const mm = Math.floor((rem % 3600000) / 60000);
          const ss = Math.floor((rem % 60000) / 1000);
          if (cdD) cdD.textContent = String(dd).padStart(2,'0');
          if (cdH) cdH.textContent = String(hh).padStart(2,'0');
          if (cdM) cdM.textContent = String(mm).padStart(2,'0');
          if (cdS) cdS.textContent = String(ss).padStart(2,'0');
          if (rem <= 0) { clearInterval(aptBtn._cdTick); aptBtn._cdTick = null; }
        }, 1000);
      }
    }
  }
}

//   • netProfit สำหรับ claim/ปุ่ม disabled = realized + Math.min(0,unrealized)
//     (กัน claim ขณะ position ขาดทุนค้างอยู่ — behavior เดิม)
// mode: 'all' (default) | 'trade' | 'apt'
function openClaimModal(id, mode) {
  claimTargetId = id;
  claimMode = mode || 'all';
  const c = earnContracts.find(x => x.contractId === id);
  if (!c) {
    // [v3 FIX-1a] เดิม return เงียบ → modal ไม่เปิด user ไม่รู้สาเหตุ
    showToast(tccT('toast_contract_not_found_refresh'), 'error');
    return;
  }

  // ใช้ unrealized จาก positions จริง ไม่ใช้ c.unrealizedPnl เก่า
  const liveUnrealized = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + (p.pnl || 0), 0);
  const realized = c.realizedPnl || 0;

  // APT Yield estimate (เหมือน _buildClaimSections)
  const now        = Date.now();
  // [FIX] นับจาก last APT claim ไม่ใช่จาก startTime
  const refMs      = c.lastAptClaimMs || c.lastYieldTimeMs || c.startTime || 0;
  const daysPassed = refMs > 0 ? Math.max(0, (now - refMs) / 86400000) : 0;
  const aptYield   = c.stakedAmount > 0
    ? Math.max(0, c.stakedAmount * (c.dailyYield / 100) * daysPassed) : 0;
  const tradePnl   = Math.max(0, realized - aptYield);

  // คำนวณ netProfit ตาม claimMode
  let netProfitClaim, netProfitDisplay, modeLabel;
  if (claimMode === 'apt') {
    netProfitClaim   = aptYield;
    netProfitDisplay = aptYield;
    modeLabel        = 'APT Yield (100%)';
  } else if (claimMode === 'fixed') {
    // [FIX-FRONTEND-2] Fixed contract: Claim ส่วนต่าง current_balance - staked_amount → 100% เข้า user
    const fixedClaimable = Math.max(0, (c.currentBalance || 0) - (c.stakedAmount || 0));
    netProfitClaim   = fixedClaimable;
    netProfitDisplay = fixedClaimable;
    modeLabel        = '🔒 Fixed APT Yield (100%)';
  } else if (claimMode === 'trade') {
    netProfitClaim   = Math.max(0, tradePnl + Math.min(0, liveUnrealized));
    netProfitDisplay = tradePnl + liveUnrealized;
    modeLabel        = 'กำไรเทรด (40/40/10/10)';
  } else {
    // 'all' — realized = tradePnl + aptYield → แบ่ง 40/40/10/10 จากยอดรวม
    netProfitClaim   = Math.max(0, realized + Math.min(0, liveUnrealized));
    netProfitDisplay = realized + liveUnrealized;
    modeLabel        = 'เทรด + APT (40/40/10/10)';
  }

  // ── row แสดงผล ──
  document.getElementById('claimContractId').textContent    = c.contractId;
  document.getElementById('claimRealizedPnl').textContent   = (realized >= 0 ? '+' : '') + fmtM(realized, 4) + ' USDT';
  document.getElementById('claimRealizedPnl').style.color   = realized >= 0 ? 'var(--g)' : 'var(--r)';
  document.getElementById('claimUnrealizedPnl').textContent = (liveUnrealized >= 0 ? '+' : '') + fmtM(liveUnrealized, 4) + ' USDT';
  document.getElementById('claimUnrealizedPnl').style.color = liveUnrealized >= 0 ? 'var(--g)' : 'var(--r)';
  document.getElementById('claimNetProfit').textContent     = (netProfitDisplay >= 0 ? '+' : '') + fmtM(netProfitDisplay, 4) + ' USDT';
  document.getElementById('claimNetProfit').style.color     = netProfitDisplay >= 0 ? 'var(--y)' : 'var(--r)';

  // ── modal title badge แสดง mode ──
  const modeEl = document.getElementById('claimModeLabel');
  if (modeEl) modeEl.textContent = modeLabel;

  // ── breakdown ──
  let user, system, comm, reserve;
  if (claimMode === 'apt' || claimMode === 'fixed') {
    // APT / Fixed = 100% user, ส่วนอื่น 0 (ไม่ผ่าน split)
    user = netProfitClaim; system = 0; comm = 0; reserve = 0;
    // ซ่อน row commission/reserve สำหรับ APT/Fixed mode
    ['splitSystemRow','splitCommRow','splitReserveRow','claimRefBlock'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  } else {
    user    = netProfitClaim * 0.40;
    system  = netProfitClaim * 0.40;
    comm    = netProfitClaim * 0.10;
    reserve = netProfitClaim * 0.10;
    // แสดง row commission/reserve สำหรับ all/trade mode
    ['splitSystemRow','splitCommRow','splitReserveRow','claimRefBlock'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = '';
    });
  }
  document.getElementById('splitUser').textContent    = (user >= 0 ? '+' : '') + fmtM(user, 4) + ' USDT';
  document.getElementById('splitSystem').textContent  = fmtM(system, 4) + ' USDT';
  document.getElementById('splitComm').textContent    = fmtM(comm, 4) + ' USDT';
  document.getElementById('splitReserve').textContent = fmtM(reserve, 4) + ' USDT';

  // ── ปุ่ม Claim All ──
  const btn = document.getElementById('claimSubmitBtn');
  const gateNoteEl = document.getElementById('claimFixedGateNote');
  if (btn) {
    if (claimMode === 'fixed') {
      // [NEW] เงื่อนไขการเบิก APT (Fixed) — เหมือนเงื่อนไขการเบิกค่าคอมมิชชั่น (Commission tab):
      //   1) ยอด claim ต้อง >= commissionMinAmount (ปกติ 50 USDT)
      //   2) ต้องมีลูกทีม Approved >= commissionMinApproved คน (ปกติ 5 คน)
      // ใช้ global var เดียวกับ Commission tab (commissionApprovedCount/commissionMinApproved/
      // commissionMinAmount) — ถ้ายังไม่เคยโหลด (_commissionLoaded=false) จะ fetch สดด้านล่าง
      const _fxMinAmt   = (typeof commissionMinAmount === 'number' && commissionMinAmount > 0) ? commissionMinAmount : 50;
      const _fxMinTeam  = (typeof commissionMinApproved === 'number' && commissionMinApproved > 0) ? commissionMinApproved : 5;
      const _fxApproved = (typeof commissionApprovedCount === 'number') ? commissionApprovedCount : 0;
      const _fxAmtOk    = netProfitClaim >= _fxMinAmt;
      const _fxTeamOk   = _fxApproved >= _fxMinTeam;

      if (netProfitClaim <= 0) {
        btn.disabled = true;
        btn.textContent = tccT('no_earn');
        if (gateNoteEl) gateNoteEl.style.display = 'none';
      } else {
        // [FIX-FRONTEND-2] Fixed mode: label แสดง 100% (ไม่ใช่ 40% ของ split)
        btn.textContent = '🔒 Claim Fixed APT → Main Wallet (+' + fmtM(user, 4) + ' USDT)';
        btn.disabled = !(_fxAmtOk && _fxTeamOk);
        if (gateNoteEl) {
          if (!_fxAmtOk) {
            gateNoteEl.textContent = `⚠️ ${tccTF('gate_apt_min_full', {min: _fxMinAmt.toFixed(2), cur: netProfitClaim.toFixed(4)})}`;
            gateNoteEl.style.display = 'block';
          } else if (!_fxTeamOk) {
            gateNoteEl.textContent = `⚠️ ${tccTF('gate_min_approved_claim', {min: _fxMinTeam, cur: _fxApproved})}`;
            gateNoteEl.style.display = 'block';
          } else {
            gateNoteEl.style.display = 'none';
          }
        }
      }

      // [NEW] ถ้ายังไม่เคยโหลดข้อมูล Commission/Referral (approvedCount) มาก่อน → โหลดสดครั้งเดียว
      // เพื่อความแม่นยำของเงื่อนไข แล้ว re-render modal ใหม่ (กัน loop ด้วย _fixedGateFetching)
      if (!_commissionLoaded && !_fixedGateFetching &&
          typeof USER_PROFILE !== 'undefined' && USER_PROFILE && USER_PROFILE.uid && typeof dbRead === 'function') {
        _fixedGateFetching = true;
        dbRead('getReferralDashboard', { uid: USER_PROFILE.uid }, null).then(ref => {
          if (ref && ref.referrer) {
            commissionApprovedCount = ref.referrer.approvedCount || 0;
            commissionMinApproved   = ref.referrer.minApprovedToWithdraw || 0;
            commissionMinAmount     = ref.referrer.minAmountToWithdraw || 0;
          }
        }).catch(() => {}).finally(() => {
          _fixedGateFetching = false;
          if (claimTargetId === id && document.getElementById('earnClaimModal').classList.contains('open')) {
            openClaimModal(id, 'fixed'); // re-render ปุ่มด้วยข้อมูลสด
          }
        });
      }
    } else {
      btn.disabled = netProfitClaim <= 0;
      btn.textContent = netProfitClaim <= 0
        ? 'ไม่มีกำไรสุทธิที่เคลมได้'
        : 'Claim All → Main Wallet (+' + fmtM(user, 4) + ' USDT)';
      if (gateNoteEl) gateNoteEl.style.display = 'none';
    }
  }

  // ── เปิด modal ──
  document.getElementById('earnClaimModal').classList.add('open');

  // ── render 2 ปุ่มย่อย (trade + apt) ────────────────────────────────────
  _updateClaimSubButtons(c);

  // [COMMISSION ENGINE] โหลดชื่อทีม Level A/B + ผู้แนะนำ หลัง modal เปิด
  // ไม่บล็อก UI หลัก — skeleton แสดงระหว่างรอ
  _loadClaimReferralInfo(comm);
}

// [COMMISSION ENGINE] โหลดชื่อทีม Level A/Level B + ค่าคอมมิชชั่นผู้แนะนำ จาก
// getReferralLevelInfo (Member GAS) แล้วแตกย่อยยอด Commission (10%) เป็น
// Level A (15%) / Level B (10%)
//
// [v3 FIX-2] Pattern ใหม่ "Always Show, Data Fills In":
//   - skeleton (spin) แสดงทันทีที่ modal เปิด (อยู่ใน HTML แล้ว, ไม่ต้องรอ JS)
//   - เมื่อ data กลับมา → ซ่อน skeleton, แสดง content เสมอ
//   - card Level A/B: แสดงทุกกรณี — dim (สีเทา/italic) ถ้าไม่มีทีม
//   - row ผู้แนะนำ: แสดงทุกกรณี — "—" ถ้าไม่มี referrer
//   - ถ้า API error → ซ่อน skeleton, แสดง content พร้อม "—" (ไม่ซ่อน block ทิ้ง)
async function _loadClaimReferralInfo(teamShare) {
  const loadingEl = document.getElementById('claimRefLoading');
  const contentEl = document.getElementById('claimRefContent');
  if (!loadingEl || !contentEl) return;

  // reset ทุกครั้งก่อนโหลด — ป้องกันข้อมูลรอบก่อนค้าง
  loadingEl.style.display = '';
  contentEl.style.display = 'none';
  const _reset = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  _reset('claimOwnTeam', '—'); _reset('claimOwnVal', '—');
  _reset('claimLevelATeam', '—'); _reset('claimLevelAVal', '—');
  _reset('claimLevelBTeam', '—'); _reset('claimLevelBVal', '—');
  _reset('claimReferrerName', '—'); _reset('claimReferrerAmount', '— USDT');
  _reset('claimReferrerNote', '');
  ['claimCardOwn','claimCardA','claimCardB'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.add('dim');
  });

  // helper: ซ่อน skeleton แล้วแสดง content (เรียกทั้ง success & error path)
  const _showContent = () => {
    loadingEl.style.display = 'none';
    contentEl.style.display = '';
  };

  const uid = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE.uid : null;
  if (!uid || typeof dbRead !== 'function') {
    // ไม่มี uid หรือ dbRead → แสดงโครงสร้างพร้อม "—" (ไม่ซ่อน)
    _showContent();
    return;
  }

  try {
    const info = await dbRead('getReferralLevelInfo', { uid, teamShare }, null); // ไม่ cache — ข้อมูลทีมเปลี่ยนได้

    const levelAPct = (info && info.levelA && typeof info.levelA.pct === 'number') ? info.levelA.pct : 0.15;
    const levelBPct = (info && info.levelB && typeof info.levelB.pct === 'number') ? info.levelB.pct : 0.10;
    const levelAAmt = teamShare * levelAPct;
    const levelBAmt = teamShare * levelBPct;
    const ref       = (info && info.referrer) || {};
    const hasOwnTeam = !!(info && info.ownTeam && info.ownTeam.teamName);
    const hasTeamA  = !!(info && info.levelA && info.levelA.teamName);
    const hasTeamB  = !!(info && info.levelB && info.levelB.teamName);

    // ── Your Team row ──
    const ownTeamEl  = document.getElementById('claimOwnTeam');
    const ownValEl   = document.getElementById('claimOwnVal');
    const ownCardEl  = document.getElementById('claimCardOwn');
    if (ownTeamEl) {
      ownTeamEl.textContent = hasOwnTeam ? info.ownTeam.teamName : tccT('not_available');
      ownTeamEl.className   = 'earn-claim-team-name' + (hasOwnTeam ? '' : ' empty');
    }
    if (ownValEl)  ownValEl.textContent  = hasOwnTeam ? fmtM(teamShare, 4) + ' USDT' : '—';
    if (ownCardEl) ownCardEl.classList.toggle('dim', !hasOwnTeam);

    // ── Level A row ──
    const teamAEl = document.getElementById('claimLevelATeam');
    const valAEl  = document.getElementById('claimLevelAVal');
    const cardAEl = document.getElementById('claimCardA');
    if (teamAEl) {
      teamAEl.textContent = hasTeamA ? info.levelA.teamName : tccT('not_available');
      teamAEl.className   = 'earn-claim-team-name' + (hasTeamA ? '' : ' empty');
    }
    if (valAEl)  valAEl.textContent  = hasTeamA ? fmtM(levelAAmt, 4) + ' USDT' : '—';
    if (cardAEl) cardAEl.classList.toggle('dim', !hasTeamA);

    // ── Level B row ──
    const teamBEl = document.getElementById('claimLevelBTeam');
    const valBEl  = document.getElementById('claimLevelBVal');
    const cardBEl = document.getElementById('claimCardB');
    if (teamBEl) {
      teamBEl.textContent = hasTeamB ? info.levelB.teamName : tccT('not_available');
      teamBEl.className   = 'earn-claim-team-name' + (hasTeamB ? '' : ' empty');
    }
    if (valBEl)  valBEl.textContent  = hasTeamB ? fmtM(levelBAmt, 4) + ' USDT' : '—';
    if (cardBEl) cardBEl.classList.toggle('dim', !hasTeamB);

    // ── ผู้แนะนำ row ──
    const refNameEl = document.getElementById('claimReferrerName');
    const refAmtEl  = document.getElementById('claimReferrerAmount');
    const refNoteEl = document.getElementById('claimReferrerNote');
    if (refNameEl) refNameEl.textContent = ref.name || '—';
    if (refAmtEl)  refAmtEl.textContent  = ref.name ? fmtM(ref.tierBonusPreview || 0, 4) + ' USDT' : '—';
    if (refNoteEl) {
      if (!ref.uid || ref.eligible) {
        refNoteEl.textContent = '';
      } else {
        refNoteEl.textContent = tccT('reserve_10');
      }
    }

    _showContent();
  } catch (e) {
    console.error('[_loadClaimReferralInfo] failed:', e.message);
    // [v3 FIX-2] error → แสดง content พร้อมค่า "—" แทนที่จะซ่อน block ทิ้ง
    _showContent();
  }
}
function closeClaimModal() {
  document.getElementById('earnClaimModal').classList.remove('open');
  // [FIX] clear APT countdown timer เมื่อปิด modal — ไม่งั้น _cdTick ค้างอยู่
  // และ if(!aptBtn._cdTick) จะ block สร้าง timer ใหม่ตอนเปิดครั้งถัดไป
  const aptBtn = document.getElementById('claimAptBtn');
  if (aptBtn && aptBtn._cdTick) {
    clearInterval(aptBtn._cdTick);
    aptBtn._cdTick = null;
  }
}
// ══════════════════════════════════════════════════════════════
//  CLAIM CONFIRM SHEET [v8 NEW]
//  openClaimConfirm(mode) — เปิด sheet ยืนยันก่อน submit จริง
//  closeClaimConfirm()    — ปิด sheet (ไม่ยกเลิก earnClaimModal)
//  execClaimConfirmed()   — เรียก submitClaimProfit จริง
// ══════════════════════════════════════════════════════════════
let _pendingClaimMode = null; // mode ที่รอยืนยัน

function openClaimConfirm(mode) {
  const c = earnContracts.find(x => x.contractId === claimTargetId);
  if (!c) return;

  // คำนวณ amounts เหมือนใน submitClaimProfit (ไม่ execute จริง)
  const liveUnrealized = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + (p.pnl || 0), 0);
  const realized = c.realizedPnl || 0;
  const now = Date.now();
  const refMs = c.lastAptClaimMs || c.lastYieldTimeMs || c.startTime || 0;
  const daysPassed = refMs > 0 ? Math.max(0, (now - refMs) / 86400000) : 0;
  const aptYield = c.stakedAmount > 0
    ? Math.max(0, c.stakedAmount * (c.dailyYield / 100) * daysPassed) : 0;
  const tradePnl = Math.max(0, realized - aptYield);

  let userAmt = 0, systemAmt = 0, commAmt = 0, reserveAmt = 0;
  let titleText = '', subText = '', iconClass = 'all', iconEmoji = '💰';
  let amtClass = 'gold', showSplit = true, warnText = '';

  if (mode === 'apt') {
    userAmt    = aptYield;
    systemAmt  = 0; commAmt = 0; reserveAmt = 0;
    titleText  = 'ยืนยัน Claim APT Yield';
    subText    = 'APT Yield · 100% เข้า Main Wallet';
    iconClass  = 'apt'; iconEmoji = '🌿'; amtClass = 'teal'; showSplit = false;
    warnText   = 'APT Yield จะถูกโอนเข้า Main Wallet ทันที และ reset รอบ 15 วันใหม่';
  } else if (mode === 'trade') {
    const net  = Math.max(0, tradePnl + Math.min(0, liveUnrealized));
    userAmt    = net * 0.40;
    systemAmt  = net * 0.40; commAmt = net * 0.10; reserveAmt = net * 0.10;
    titleText  = 'ยืนยัน Claim Profits';
    subText    = 'กำไรเทรด · สัดส่วน 40/40/10/10';
    iconClass  = 'trade'; iconEmoji = '💰'; showSplit = true;
    warnText   = 'กำไรจะถูกแบ่งสัดส่วนและโอนทันที ไม่สามารถยกเลิกได้';
  } else {
    // all
    const net  = Math.max(0, realized + Math.min(0, liveUnrealized));
    userAmt    = net * 0.40;
    systemAmt  = net * 0.40; commAmt = net * 0.10; reserveAmt = net * 0.10;
    titleText  = 'ยืนยัน Claim All';
    subText    = 'เทรด + APT · สัดส่วน 40/40/10/10';
    iconClass  = 'all'; iconEmoji = '🏆'; showSplit = true;
    warnText   = 'กำไรทั้งหมดจะถูกแบ่งและโอนเข้า Main Wallet ทันที';
  }

  // ป้องกัน claim ที่ยอด 0
  if (userAmt <= 0) {
    const msgs = { apt:'ไม่มี APT Yield ที่เคลมได้', trade:'ไม่มีกำไรการเทรดที่เคลมได้', all:'ไม่มีกำไรสุทธิที่เคลมได้' };
    showToast(msgs[mode] || tccT('toast_no_claimable_default'));
    return;
  }

  _pendingClaimMode = mode;

  // Populate sheet
  const fmt4 = v => (v >= 0 ? '+' : '') + parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
  const fmt4s = v => parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});

  const ccIcon = document.getElementById('ccIcon');
  if (ccIcon) { ccIcon.textContent = iconEmoji; ccIcon.className = 'claim-confirm-icon ' + iconClass; }
  const el = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  el('ccTitle', titleText);
  el('ccSub',   subText);
  el('ccAmt',   fmt4(userAmt) + ' USDT');
  el('ccSystem', fmt4s(systemAmt) + ' USDT');
  el('ccComm',   fmt4s(commAmt)   + ' USDT');
  el('ccReserve',fmt4s(reserveAmt)+ ' USDT');
  el('ccWarnText', warnText);

  const amtEl = document.getElementById('ccAmt');
  if (amtEl) amtEl.className = 'claim-confirm-amt ' + amtClass;
  const splitBlock = document.getElementById('ccSplitBlock');
  if (splitBlock) splitBlock.style.display = showSplit ? '' : 'none';
  const okBtn = document.getElementById('ccOkBtn');
  if (okBtn) okBtn.className = 'claim-confirm-ok ' + (mode === 'apt' ? 'teal' : 'gold');

  document.getElementById('claimConfirmOverlay').classList.add('open');
}

function closeClaimConfirm(e) {
  // ถ้าเรียกจาก overlay click ให้ check ว่า click ที่ overlay จริง ไม่ใช่ sheet
  if (e && e.target !== document.getElementById('claimConfirmOverlay')) return;
  document.getElementById('claimConfirmOverlay').classList.remove('open');
  _pendingClaimMode = null;
}

function execClaimConfirmed() {
  if (!_pendingClaimMode) return;
  const mode = _pendingClaimMode;
  _pendingClaimMode = null;
  document.getElementById('claimConfirmOverlay').classList.remove('open');
  // เรียก submitClaimProfit จริง
  submitClaimProfit(mode);
}

// ── Show detail (full modal) ──
let detailTargetId = null;
function showEarnDetail(id) {
  detailTargetId = id;
  const c = earnContracts.find(x => x.contractId === id);
  if (!c) return;

  // [v13 FIX] ใช้ _contractDDMap (GAS) → _gasDrawdown → 0 (ไม่มี local formula fallback)
  const dd = _gasDD(c) ?? 0;
  const margin = calcAvailMargin(c);
  // ใช้ unrealized จาก positions จริง
  const liveUnrealized = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + (p.pnl || 0), 0);
  const netProfit = (c.realizedPnl || 0) + Math.min(0, liveUnrealized);
  const now = Date.now();
  const msLeft = Math.max(0, c.endTime - now);
  const daysLeft = Math.ceil(msLeft / 86400000);

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  document.getElementById('det-contractId').textContent = c.contractId;
  const aptPct = (c.dailyYield * c.planDays).toFixed(4) * 1; // APT = daily × days
  const aptDisplay = aptPct % 1 === 0 ? aptPct.toFixed(0) : aptPct.toFixed(2);
  document.getElementById('det-plan').textContent = c.planDays + '-Day Plan · APT ' + aptDisplay + '% · Daily ' + c.dailyYield + '%';
  const statusLabel = { active:'● ACTIVE', frozen:'🔒 FROZEN', matured:'✅ MATURED' };
  document.getElementById('det-status').textContent = statusLabel[c.status] || c.status;
  document.getElementById('det-startDate').textContent = fmtDate(c.startTime);
  document.getElementById('det-endDate').textContent = fmtDate(c.endTime);
  document.getElementById('det-daysLeft').textContent = c.status === 'matured' ? tccT('days_left_expired') : daysLeft + ' ' + tccT('days_plan');
  document.getElementById('det-staked').textContent = fmtM(c.stakedAmount) + ' USDT';
  document.getElementById('det-balance').textContent = fmtM((c.status === 'frozen' ? (c.frozenBalance ?? c.currentBalance) : c.currentBalance)) + ' USDT';
  const rPnl = (c.realizedPnl || 0);
  document.getElementById('det-realized').style.color = rPnl >= 0 ? 'var(--g)' : 'var(--r)';
  document.getElementById('det-realized').textContent = (rPnl >= 0 ? '+' : '') + fmtM(rPnl, 4) + ' USDT';
  const uPnl = liveUnrealized;
  document.getElementById('det-unrealized').style.color = uPnl >= 0 ? 'var(--g)' : 'var(--r)';
  document.getElementById('det-unrealized').textContent = (uPnl >= 0 ? '+' : '') + fmtM(uPnl, 4) + ' USDT';
  document.getElementById('det-netProfit').textContent = (netProfit >= 0 ? '+' : '') + fmtM(netProfit, 4) + ' USDT';
  document.getElementById('det-claimed').textContent = '+' + fmtM((c.totalClaimed || 0), 4) + ' USDT';
  document.getElementById('det-dd').style.color = dd >= 35 ? 'var(--r)' : dd >= 30 ? 'var(--y)' : 'var(--g)';
  document.getElementById('det-dd').textContent = dd.toFixed(2) + '%';
  document.getElementById('det-yield').textContent = 'APT ' + aptDisplay + '% · Daily ' + c.dailyYield + '%';
  document.getElementById('det-margin').textContent = fmtM(margin) + ' USDT';

  // [FIX-DD3] Trading Loss + APT Yield แยกกัน — อ่านจาก _contractDDMap ที่ GAS ส่งมาผ่าน getContractStatus
  // GAS ส่ง trading_realized_loss + apt_yield_accrued ใน getContractStatus response แล้ว
  // ค่าเหล่านี้จะอยู่ใน _contractDDMap[cid] หลัง loadOfflineState / checkCanOpenPosition sync
  const _ddEntry = (window._contractDDMap || {})[c.contractId];
  const _tradingLossEl = document.getElementById('det-tradingLoss');
  const _aptYieldEl    = document.getElementById('det-aptYield');
  if (_tradingLossEl) {
    if (_ddEntry && _ddEntry.trading_realized_loss !== undefined) {
      const _tl = parseFloat(_ddEntry.trading_realized_loss) || 0;
      _tradingLossEl.textContent = _tl > 0 ? '-' + fmtM(_tl, 4) + ' USDT' : '0.0000 USDT';
      _tradingLossEl.style.color = _tl > 0 ? 'var(--r)' : 'var(--t2)';
    } else {
      // ยังไม่มีข้อมูลจาก GAS → ดึงใหม่ผ่าน getContractStatus
      _tradingLossEl.textContent = tccT('loading');
      if (typeof dbCallRaw === 'function') {
        dbCallRaw('getContractStatus', { contract_id: id, uid: USER_PROFILE.uid })
          .then(st => {
            if (!st || detailTargetId !== id) return;
            // cache เข้า _contractDDMap ด้วย (รวม avail_margin ตาม FIX-SYNC-3)
            window._contractDDMap = window._contractDDMap || {};
            window._contractDDMap[id] = Object.assign({}, window._contractDDMap[id] || {}, {
              trading_realized_loss: st.trading_realized_loss,
              apt_yield_accrued:     st.apt_yield_accrued,
              avail_margin:          st.avail_margin,
              margin_cap:            st.margin_cap,
              isMarginBlocked:       !!st.isMarginBlocked,
            });
            const _tl = parseFloat(st.trading_realized_loss) || 0;
            const _ay = parseFloat(st.apt_yield_accrued) || 0;
            if (_tradingLossEl && detailTargetId === id) {
              _tradingLossEl.textContent = _tl > 0 ? '-' + fmtM(_tl, 4) + ' USDT' : '0.0000 USDT';
              _tradingLossEl.style.color = _tl > 0 ? 'var(--r)' : 'var(--t2)';
            }
            if (_aptYieldEl && detailTargetId === id) {
              _aptYieldEl.textContent = '+' + fmtM(_ay, 4) + ' USDT';
            }
          })
          .catch(() => { if (_tradingLossEl && detailTargetId === id) _tradingLossEl.textContent = '—'; });
      }
    }
  }
  if (_aptYieldEl) {
    if (_ddEntry && _ddEntry.apt_yield_accrued !== undefined) {
      const _ay = parseFloat(_ddEntry.apt_yield_accrued) || 0;
      _aptYieldEl.textContent = '+' + fmtM(_ay, 4) + ' USDT';
    } else if (!(_ddEntry && _ddEntry.trading_realized_loss !== undefined)) {
      // fallback เฉพาะกรณียังไม่โหลด (กรณีมีข้อมูลแล้วจะถูก populate โดย trading_loss fetch)
      _aptYieldEl.textContent = '—';
    }
  }
  document.getElementById('earnDetailModal').classList.add('open');

  // [v2.35 NEW] ยอดรวมที่เทรดมาทั้งหมดในสัญญานี้ (อ้างอิง earn_contract_id จาก Positions จริง)
  // แสดงผลอย่างเดียว — ไม่เกี่ยวกับยอด Claim/Redeem ใดๆ
  const tsEl = document.getElementById('det-tradeSummary');
  if (tsEl) {
    tsEl.textContent = tccT('loading');
    tsEl.style.color = '';
    if (typeof dbCallRaw === 'function') {
      dbCallRaw('getEarnContractTradeSummary', { contract_id: id, uid: USER_PROFILE.uid })
        .then(res => {
          if (!res || detailTargetId !== id) return; // modal อาจถูกเปลี่ยนไปสัญญาอื่นแล้ว
          const t = res.totalRealizedPnl || 0;
          tsEl.style.color = t >= 0 ? 'var(--g)' : 'var(--r)';
          tsEl.textContent = (t >= 0 ? '+' : '') + fmtM(t, 4) + ' USDT (' + (res.tradeCount || 0) + ' ' + tccT('orders_unit') + ')';
        })
        .catch(() => { if (detailTargetId === id) tsEl.textContent = '—'; });
    }
  }
}
function closeDetailModal() {
  document.getElementById('earnDetailModal').classList.remove('open');
}

// ── Transaction History ──
let earnTxHistory = []; // global tx log: { contractId, type, amount, timestamp, note }

function recordTx(contractId, type, amount, note) {
  earnTxHistory.unshift({ contractId, type, amount, timestamp: Date.now(), note: note || '' });
}

function openTxHistory(id) {
  closeDetailModal();
  setTimeout(() => {
    const txs = id ? earnTxHistory.filter(t => t.contractId === id) : earnTxHistory;
    const subtitle = document.getElementById('txModalSubtitle');
    if (subtitle) subtitle.textContent = id ? tccT('contract_label') + ' ' + id : tccT('all_transactions');
    const listEl = document.getElementById('earnTxList');
    if (!listEl) return;
    if (!txs.length) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--t3);font-size:13px"><span data-i18n="no_transaction">${tccT('no_transaction')}</span></div>`;
    } else {
      const typeMap = {
        'claim':    { icon:'💰', color:'var(--g)',  label:'เคลมกำไร → Main Wallet' },
        'yield':    { icon:'📈', color:'var(--y)',  label:'Daily Yield' },
        'create':   { icon:'🏦', color:'var(--t1)', label:'สร้างสัญญา' },
        'liquidate':{ icon:'🔒', color:'var(--r)',  label:'Auto-Liquidate' },
        'mature':   { icon:'✅', color:'var(--g)',  label:'สัญญาครบกำหนด' },
        'redeem':   { icon:'🏁', color:'var(--g)',  label:'รับเงินต้นคืน → Main Wallet' },
      };
      listEl.innerHTML = txs.map(t => {
        const tm = typeMap[t.type] || { icon:'📋', color:'var(--t2)', label: t.type };
        const d = new Date(t.timestamp);
        const ts = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
          +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        return `<div class="earn-tx-item">
          <div class="earn-tx-icon" style="background:rgba(43,49,57,.7)">${tm.icon}</div>
          <div class="earn-tx-info">
            <div class="earn-tx-type">${tm.label}</div>
            <div class="earn-tx-time">${ts} · ${t.contractId}</div>
            ${t.note ? '<div style="font-size:10px;color:var(--t3);margin-top:1px">'+t.note+'</div>' : ''}
          </div>
          <div class="earn-tx-amt" style="color:${tm.color}">${t.amount >= 0 ? '+' : ''}${fmtM(t.amount, 4)} USDT</div>
        </div>`;
      }).join('');
    }
    document.getElementById('earnTxModal').classList.add('open');
  }, 200);
}
function closeTxModal() {
  document.getElementById('earnTxModal').classList.remove('open');
}

// ── Sync System Wallets display ──
let sysWalletState = { center: 0, comm: 0, reserve: 0, mainPaid: 0 };

function updateSysWalletDisplay() {
  const sc = document.getElementById('sysWalCenter');  if(sc) sc.textContent = sysWalletState.center.toFixed(2);
  const sw = document.getElementById('sysWalComm');    if(sw) sw.textContent = sysWalletState.comm.toFixed(2);
  const sr = document.getElementById('sysWalReserve'); if(sr) sr.textContent = sysWalletState.reserve.toFixed(2);
  const md = document.getElementById('mainWalDisplay');
  if(md) md.textContent = mainWalletBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  // Sync earn available balance in create modal
  const ab = document.getElementById('earnAvailBal');
  if(ab) ab.textContent = mainWalletBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  // Sync overview + spot
  if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
}

// ── Daily Yield Auto-Credit (runs every 10s in demo = simulates 1 day) ──
function tickDailyYield() {
  let needsRender = false;
  earnContracts.forEach(c => {
    // ── guard: frozen/matured contracts หยุดสะสม yield และไม่ถูก sync ──
    if (c.status !== 'active') return;
    const now = Date.now();
    if (now > c.endTime) {
      if (c.status !== 'matured') {
        c.status = 'matured';
        recordTx(c.contractId, 'mature', 0, 'สัญญาครบกำหนด ' + c.planDays + ' วัน');
        showToast(tccTF('toast_contract_matured',{cid:c.contractId}));
        needsRender = true;
      }
      return;
    }
    // [v2.34 FIX-R1] ตัดการจำลอง Daily Yield ฝั่ง Client ออก — เดิมเป็นโค้ด Legacy จาก demo
    // economy ก่อนที่ GAS จะเป็น Source of Truth (ดู v2.20 Module 5 ฝั่ง GAS)
    //
    // ⚠️ ROOT CAUSE ของบั๊ก "Realized PnL การ์ดโชว์ยอดเท่ากับ Daily Yield ทั้งที่ยังไม่ได้เทรดเลย":
    //   โค้ดเดิม (ลบออกแล้ว) บวก fraction ของ Daily Yield เข้า c.realizedPnl ตรงๆ ทุก 10 วิ
    //   (จำลอง 1 วันต่อ 10 วิ) แล้ว syncContractBalance() คำนวณ currentBalance จาก realizedPnl
    //   ต่ออีกที — แต่ realized_pnl ฝั่ง GAS (Source of Truth จริง) สงวนไว้สำหรับ "กำไร/ขาดทุน
    //   จากการเทรด" เท่านั้น (เขียนผ่าน _accumulateEarnPnl ตอนปิด position เท่านั้น) ไม่เกี่ยวกับ
    //   Yield เลย — ส่วน Yield จริงคำนวณฝั่ง GAS (processEarnYield ทุก 1 ชม.) แล้วบวกตรงเข้า
    //   current_balance บนชีต ผลคือ local state ยัด yield ปลอมเข้าไปทับความหมายของ realizedPnl
    //   ทำให้การ์ดแสดง "Realized PnL" เท่ากับยอด Yield สะสม (เห็นได้แม้สัญญาไม่เคยเทรดเลย)
    //
    // แก้: ตัดการบวก fraction เข้า realizedPnl ออกทั้งหมด — Yield ที่แท้จริงจะมาจาก GAS
    // (processEarnYield ทุก 1 ชม.) ผ่าน loadOfflineState()/getEarnContracts() ตามรอบ sync ปกติ
    // (ตอนเปิดแอป/refresh/เปิดแท็บ Earn) — currentBalance ในแอปจะอัปเดตยอด Yield ตามรอบ sync
    // แทนที่จะจำลองแบบ real-time ทุก 10 วิเหมือนเดิม ส่วน c.realizedPnl จะไม่ถูกแตะจาก tick นี้
    // อีกต่อไป (จะถูกอัปเดตเฉพาะตอนปิด position จริง หรือตอน sync ค่าจาก GAS เท่านั้น)
    //
    // เหลือ syncContractBalance(c) ไว้ตามเดิม — คำนวณ currentBalance จาก margin/unrealized ของ
    // position จริงที่เปลี่ยนแปลงได้ (ไม่กระทบ current_balance ส่วนที่ GAS sync มาจาก Yield)
    syncContractBalance(c);
    // ตรวจ Drawdown — เรียก checkAutoLiquidate เฉพาะ active เท่านั้น (ป้องกัน re-trigger บน frozen)
    checkAutoLiquidate(c.contractId);
    needsRender = true;
  });
  if (needsRender) {
    renderEarnContracts();
    updateSysWalletDisplay();
  }
}
setInterval(tickDailyYield, 10000);

// ── Matured contract unlock / mature check ──
function checkMatureContracts() {
  const now = Date.now();
  earnContracts.forEach(c => {
    if (c.status === 'active' && now > c.endTime) {
      c.status = 'matured';
      recordTx(c.contractId, 'mature', 0, 'สัญญาครบกำหนด');
    }
  });
}

// ── submitClaimProfit — route by mode: 'all' | 'trade' | 'apt' ──
function submitClaimProfit(mode) {
  const c = earnContracts.find(x => x.contractId === claimTargetId);
  if (!c) return;
  const activeMode = mode || claimMode || 'all';

  // [v4 CLAIM GUARD] ป้องกัน claim ซ้ำใน session เดียว
  const _claimKey = '_claimInProgress_' + (c.contractId || '');
  if (window[_claimKey]) { showToast(tccT('toast_claim_in_progress')); return; }
  window[_claimKey] = true;
  setTimeout(() => { window[_claimKey] = false; }, 10000);

  const liveUnrealized = S.positions
    .filter(p => p.earnContractId === c.contractId)
    .reduce((s, p) => s + (p.pnl || 0), 0);
  const realized = c.realizedPnl || 0;

  // APT estimate (เหมือน _buildClaimSections / openClaimModal)
  const now        = Date.now();
  // [FIX] นับจาก last APT claim ไม่ใช่จาก startTime
  const refMs      = c.lastAptClaimMs || c.lastYieldTimeMs || c.startTime || 0;
  const daysPassed = refMs > 0 ? Math.max(0, (now - refMs) / 86400000) : 0;
  const aptYield   = c.stakedAmount > 0
    ? Math.max(0, c.stakedAmount * (c.dailyYield / 100) * daysPassed) : 0;
  const tradePnl   = Math.max(0, realized - aptYield);

  let netProfit, userAmt, systemAmt, commAmt, reserveAmt, gasAction, toastExtra = '';

  if (activeMode === 'fixed') {
    // [FIX-FRONTEND-2] Fixed contract: Claim current_balance - staked_amount → 100% → logEarnClaimFixed
    const fixedClaimable = Math.max(0, (c.currentBalance || 0) - (c.stakedAmount || 0));
    netProfit  = fixedClaimable;
    userAmt    = fixedClaimable;
    systemAmt  = 0; commAmt = 0; reserveAmt = 0;
    gasAction  = 'logEarnClaimFixed';
    if (netProfit <= 0) { window[_claimKey] = false; showToast(tccT('toast_no_apt_yield')); return; }
    // [NEW] เงื่อนไขการเบิก APT (Fixed) — เช็คซ้ำฝั่ง client (defense-in-depth, GAS backend เป็นตัวบังคับจริง)
    {
      const _fxMinAmt3   = (typeof commissionMinAmount === 'number' && commissionMinAmount > 0) ? commissionMinAmount : 50;
      const _fxMinTeam3  = (typeof commissionMinApproved === 'number' && commissionMinApproved > 0) ? commissionMinApproved : 5;
      const _fxApproved3 = (typeof commissionApprovedCount === 'number') ? commissionApprovedCount : 0;
      if (fixedClaimable < _fxMinAmt3) {
        window[_claimKey] = false;
        showToast(`⚠️ ${tccTF('gate_apt_min_short', {min: _fxMinAmt3.toFixed(2)})}`);
        return;
      }
      if (_fxApproved3 < _fxMinTeam3) {
        window[_claimKey] = false;
        showToast(`⚠️ ${tccTF('gate_min_approved_claim', {min: _fxMinTeam3, cur: _fxApproved3})}`);
        return;
      }
    }
    // อัปเดต local: reset current_balance → staked_amount (เหมือนที่ GAS ทำ)
    c.currentBalance = c.stakedAmount;
    toastExtra = ' (Fixed APT · 100%)';
  } else if (activeMode === 'apt') {
    // ── APT: 100% เข้า user ──────────────────────────────────────────────
    netProfit  = aptYield;
    userAmt    = aptYield;
    systemAmt  = 0; commAmt = 0; reserveAmt = 0;
    gasAction  = 'logEarnClaimApt';
    if (netProfit <= 0) { window[_claimKey] = false; showToast(tccT('toast_no_apt_yield_claim')); return; }
    // อัปเดต local: ลด realized_pnl เฉพาะส่วน apt
    c.realizedPnl  = Math.max(0, realized - aptYield);
    c.lastAptClaimMs = now;
    toastExtra = ' (Claim APT · 100%)';
  } else if (activeMode === 'trade') {
    // ── Trade: 40/40/10/10 ───────────────────────────────────────────────
    netProfit  = Math.max(0, tradePnl + Math.min(0, liveUnrealized));
    userAmt    = netProfit * 0.40;
    systemAmt  = netProfit * 0.40;
    commAmt    = netProfit * 0.10;
    reserveAmt = netProfit * 0.10;
    gasAction  = 'logEarnClaimTrade';
    if (netProfit <= 0) { window[_claimKey] = false; showToast(tccT('toast_no_trade_profit')); return; }
    // อัปเดต local: ลด realized_pnl เฉพาะส่วน trade
    c.realizedPnl  = Math.max(0, realized - netProfit);
    // [FIX-LAC-2-FE / 2026-07-10] ⚠️ ห้ามแตะ c.lastAptClaimMs ที่นี่ (ย้อนกลับ FIX-LAC-1-FE)
    // Claim Profits ไม่ได้จ่าย APT yield จริง (จ่ายเฉพาะ tradePnl 40/40/10/10) — ส่วน APT ที่
    // ยังไม่จ่ายยังคงค้างอยู่ใน c.realizedPnl ด้านบน รอ Claim APT (100%) ตามปกติ
    // การเซ็ต lastAptClaimMs = now ที่นี่ (ทั้งที่ไม่ได้จ่าย APT) ทำให้ aptYieldEst รอบถัดไป
    // นับวันจาก "เดี๋ยวนี้" ใหม่ทันที → ยอด Claim APT ที่ค้างจริงแสดงหายไปเกือบหมด และยอดนั้น
    // จะถูกกลืนเข้าไปเป็น "trade profit" ในการ Claim Profits ครั้งถัดไปแทน (user ได้แค่ 40%
    // ของเงินที่ควรได้ 100%) — ตรงกับบั๊กที่ผู้ใช้รายงานเมื่อ 2026-07-10 (สัญญา EC-BVH7AO)
    // แก้ไขคู่กับฝั่ง GAS (logEarnClaimTrade) ที่เอาการเขียน last_apt_claim_ms ออกเช่นกัน
    toastExtra = ' (Claim Profits · 40%)';
  } else {
    // ── All (เดิม): 40/40/10/10 ─────────────────────────────────────────
    netProfit  = realized + Math.min(0, liveUnrealized);
    userAmt    = netProfit * 0.40;
    systemAmt  = netProfit * 0.40;
    commAmt    = netProfit * 0.10;
    reserveAmt = netProfit * 0.10;
    gasAction  = 'logEarnClaim';
    if (netProfit <= 0) { window[_claimKey] = false; showToast(tccT('toast_no_net_profit')); return; }
    c.realizedPnl = 0;
  }

  c.totalClaimed = (c.totalClaimed || 0) + userAmt;
  mainWalletBalance += userAmt;
  syncContractBalance(c);

  if (typeof sysWalletState !== 'undefined') {
    sysWalletState.center   += systemAmt;
    sysWalletState.comm     += commAmt;
    sysWalletState.reserve  += reserveAmt;
    sysWalletState.mainPaid += userAmt;
  }

  recordTx(c.contractId, 'claim', userAmt,
    `Mode:${activeMode} | System:${systemAmt.toFixed(2)} | Comm:${commAmt.toFixed(2)} | Reserve:${reserveAmt.toFixed(2)}`);

  closeClaimModal();
  renderEarnContracts();
  updateSysWalletDisplay();
  if (selectedEarnContractId === claimTargetId) selectEarnContract(claimTargetId);
  showToast(tccTF('toast_claim_success',{extra:toastExtra,amt:fmtNum(userAmt,4)}));

  // ── ส่ง GAS ตาม action ──
  if (gasAction === 'logEarnClaimFixed') {
    // [FIX-FRONTEND-2] Fixed contract: ส่ง uid+contractId เท่านั้น (GAS คำนวณ claimable เอง)
    if (typeof saveEarnClaim === 'function') {
      saveEarnClaim({ contractId: claimTargetId, claimMode: 'fixed' }, 'logEarnClaimFixed');
    }
  } else if (gasAction === 'logEarnClaimApt') {
    if (typeof saveEarnClaim === 'function') {
      saveEarnClaim({ contractId: claimTargetId, userShare: userAmt, netProfit, aptYield, claimMode: 'apt' }, 'logEarnClaimApt');
    }
  } else if (gasAction === 'logEarnClaimTrade') {
    if (typeof saveEarnClaim === 'function') {
      saveEarnClaim({ contractId: claimTargetId, userShare: userAmt, netProfit, tradePnl, claimMode: 'trade' }, 'logEarnClaimTrade');
    }
  } else {
    if (typeof saveEarnClaim === 'function') {
      saveEarnClaim({ contractId: claimTargetId, userShare: userAmt, netProfit });
    }
  }
}

// ── [v2.36 NEW] redeemTargetId — สัญญาที่กำลังจะ redeem (ระหว่างเปิด earnRedeemModal) ──
let redeemTargetId = null;

// ── [v2.36 NEW] openRedeemModal — ตรวจ guard เดิมทั้งหมด แล้วเปิดโมดัลของระบบเอง
// แทนที่ browser confirm() เดิม (ดูปัญหาเดิม: กล่อง confirm() ของ browser ไม่ใช่ดีไซน์
// ของระบบ และไม่มีรายละเอียดให้สมาชิกเช็คก่อนยืนยัน)
// โมดัลนี้โชว์เพิ่ม: กำไร/APT สะสมที่เคลมไปแล้ว (totalClaimed) + สรุปการเทรดของสัญญานี้
// (ดึงจาก Positions sheet จริงผ่าน getEarnContractTradeSummary — ใช้ฟังก์ชันเดิมที่มีอยู่แล้ว
// ใน Contract Detail modal ไม่ได้สร้างใหม่)
// ── [NEW: NET-SETTLEMENT] คำนวณ breakdown เงินต้นคืน — ใช้ตรรกะเดียวกับ GAS logEarnRedeem/_autoLiquidateContract ──
// กฎ: มีขาดทุนเกิดขึ้น (loss > 0) + เคยรับกำไรออกจากสัญญานี้ไปแล้ว (totalClaimed > 0)
//     → หักบัฟเฟอร์ = MIN(totalClaimed, principal) ออกจากเงินต้น
//     ไม่มีขาดทุนเลย → เงินต้นการันตี 100% เสมอ ไม่หักอะไร
// หมายเหตุ: นี่คือค่า "ประมาณการ" ฝั่ง frontend เพื่อแสดงผลก่อนยืนยัน ค่าจริงคำนวณที่ GAS อีกครั้ง
function _calcRedeemBreakdown(c, isFrozenReady) {
  const principal    = c.stakedAmount || 0;
  const totalClaimed = c.totalClaimed || 0;
  const tier          = (c.contractTier === 'vip') ? 'vip' : 'standard';
  let lossAmount = 0, claimBuffer = 0, netPrincipal = principal;

  // [NEW: TIER] VIP (staked ≥1000 + plan ≥30 วัน) การันตีเงินต้น 100% เสมอ ไม่มีการหักบัฟเฟอร์
  if (tier === 'vip') {
    return { principal, totalClaimed, lossAmount: 0, claimBuffer: 0, netPrincipal: principal, tier };
  }

  if (isFrozenReady) {
    // Frozen: GAS เขียน frozen_balance = principal − buffer ไว้แล้วตอน auto-liquidate
    const frozenBal = (c.frozenBalance != null) ? c.frozenBalance : principal;
    claimBuffer  = Math.max(0, parseFloat((principal - frozenBal).toFixed(8)));
    netPrincipal = frozenBal;
    lossAmount   = null; // ยอดขาดทุนจริงถูกบันทึกไว้แล้วตอน freeze ไม่แสดงซ้ำที่นี่
  } else {
    const rp = c.realizedPnl || 0;
    lossAmount   = rp < 0 ? Math.abs(rp) : 0;
    claimBuffer  = lossAmount > 0 ? Math.max(0, Math.min(totalClaimed, principal)) : 0;
    netPrincipal = parseFloat((principal - claimBuffer).toFixed(8));
  }
  return { principal, totalClaimed, lossAmount, claimBuffer, netPrincipal, tier };
}

function openRedeemModal(contractId) {
  const c = earnContracts.find(x => x.contractId === contractId);
  if (!c) return;

  // [v2.39] รองรับทั้ง matured และ frozen ที่ครบกำหนดแล้ว
  const isFrozenReady = c.status === 'frozen' && (c.endTime || 0) > 0 && Date.now() >= (c.endTime || 0);
  if (c.status !== 'matured' && !isFrozenReady) {
    showToast(tccT('toast_not_matured_redeem'));
    return;
  }

  // APT guard: เฉพาะ matured เท่านั้น (frozen ไม่มี APT ค้าง)
  if (!isFrozenReady) {
    const liveUnrealized = S.positions
      .filter(p => p.earnContractId === c.contractId)
      .reduce((s, p) => s + (p.pnl || 0), 0);
    const netProfit = (c.realizedPnl || 0) + liveUnrealized;
    if (netProfit > 0) {
      showToast(tccT('toast_claim_profit_first'));
      return;
    }
  }

  // [NEW: NET-SETTLEMENT] คำนวณ breakdown เต็ม (เงินต้น/รับไปแล้ว/ติดลบ/บัฟเฟอร์/สุทธิ)
  const _bd = _calcRedeemBreakdown(c, isFrozenReady);
  const principal = _bd.netPrincipal;
  if (principal <= 0 && _bd.principal <= 0) {
    showToast(tccT('toast_no_principal'));
    return;
  }

  redeemTargetId = contractId;

  document.getElementById('redeemContractId').textContent   = c.contractId +
    (_bd.tier === 'vip' ? '  👑 VIP' : '  Standard');
  document.getElementById('redeemStaked').textContent       = fmtM(_bd.principal, 4) + ' USDT';
  document.getElementById('redeemTotalClaimed').textContent = '+' + fmtM(_bd.totalClaimed, 4) + ' USDT';
  document.getElementById('redeemPrincipal').textContent    = fmtM(_bd.netPrincipal, 4) + ' USDT';

  // แถวติดลบ — แสดงเฉพาะกรณี matured ที่มีขาดทุนค้าง (frozen ไม่แสดงยอดติดลบซ้ำ เพราะบันทึกไว้แล้วตอน freeze)
  const lossRowEl = document.getElementById('redeemLossRow');
  if (lossRowEl) {
    if (!isFrozenReady && _bd.lossAmount > 0) {
      document.getElementById('redeemLossAmount').textContent = '-' + fmtM(_bd.lossAmount, 4) + ' USDT';
      lossRowEl.style.display = '';
    } else {
      lossRowEl.style.display = 'none';
    }
  }

  // แถวบัฟเฟอร์ — แสดงเมื่อมีการหักบัฟเฟอร์จริง (ทั้ง matured-with-loss และ frozen)
  const bufferRowEl = document.getElementById('redeemBufferRow');
  if (bufferRowEl) {
    if (_bd.claimBuffer > 0) {
      document.getElementById('redeemBuffer').textContent = '-' + fmtM(_bd.claimBuffer, 4) + ' USDT';
      bufferRowEl.style.display = '';
    } else {
      bufferRowEl.style.display = 'none';
    }
  }

  // [NEW: TIER] แสดง note การันตี 100% เฉพาะสัญญา VIP
  const vipNoteEl = document.getElementById('redeemVipNoteRow');
  if (vipNoteEl) vipNoteEl.style.display = (_bd.tier === 'vip') ? '' : 'none';

  // [FIX #5 — REDEEM-UX] Warning banner เด่นชัด — แสดงก่อนกดยืนยันถ้ามีการหักบัฟเฟอร์จริง
  // เดิม: สมาชิกเห็นแค่แถวตารางเล็กๆ → ร้องเรียนว่า "เงินไม่ครบ" หลังกดไปแล้ว
  // ใหม่: banner สีแดงชัดเจน + อธิบาย business rule ให้เข้าใจ "ก่อน" กดยืนยัน
  const _warnBannerEl  = document.getElementById('redeemNetWarnBanner');
  const _warnBannerTxt = document.getElementById('redeemNetWarnText');
  if (_warnBannerEl && _warnBannerTxt) {
    if (_bd.claimBuffer > 0 && _bd.tier !== 'vip') {
      _warnBannerTxt.innerHTML =
        'สัญญาของท่านมีผลขาดทุนเกิดขึ้นระหว่างสัญญา (<span style="color:var(--r)">-' + fmtM(_bd.lossAmount || _bd.claimBuffer, 4) + ' USDT</span>) ' +
        'และท่านเคยรับกำไร <span style="color:var(--y)">' + fmtM(_bd.totalClaimed, 4) + ' USDT</span> ออกจากสัญญานี้ไปก่อนหน้าแล้ว<br>' +
        'ระบบจึงนำกำไรที่รับไปแล้ว <span style="color:var(--r)">-' + fmtM(_bd.claimBuffer, 4) + ' USDT</span> ' +
        'หักออกจากเงินต้น เพื่อรับผิดชอบผลขาดทุนร่วมกัน<br>' +
        '<strong>ยอดที่จะได้รับจริง: <span style="color:var(--g)">' + fmtM(_bd.netPrincipal, 4) + ' USDT</span></strong>';
      _warnBannerEl.style.display = '';
    } else {
      _warnBannerEl.style.display = 'none';
    }
  }

  // [NEW] Commission Gate สำหรับสัญญา Fixed เท่านั้น — เงื่อนไขเดียวกับ Claim APT
  // ต้องมีสมาชิก Approved >= 5 คน จึงจะรับเงินต้นคืนได้
  const redeemGateEl  = document.getElementById('redeemGateNote');
  const redeemSubmitBtn = document.getElementById('redeemSubmitBtn');
  const isFixedRedeem = (c.contractMode === 'fixed' || c.isFixed);
  if (isFixedRedeem) {
    const _rdMinTeam = (typeof commissionMinApproved === 'number' && commissionMinApproved > 0) ? commissionMinApproved : 5;
    const _rdApprv   = (typeof commissionApprovedCount === 'number') ? commissionApprovedCount : 0;
    const _rdTeamOk  = _rdApprv >= _rdMinTeam;
    if (redeemSubmitBtn) redeemSubmitBtn.disabled = !_rdTeamOk;
    if (redeemGateEl) {
      if (!_rdTeamOk) {
        redeemGateEl.textContent = `${tccT('gate_redeem_fixed_title')}\n${tccTF('gate_min_approved_short', {min: _rdMinTeam})}\n${tccTF('gate_current_count', {cur: _rdApprv})}`;
        redeemGateEl.style.display = 'block';
      } else {
        redeemGateEl.style.display = 'none';
      }
    }
    // ถ้ายังไม่เคยโหลด commission data → fetch สดแล้ว re-render modal
    if (!_commissionLoaded && !_fixedGateFetching &&
        typeof USER_PROFILE !== 'undefined' && USER_PROFILE && USER_PROFILE.uid && typeof dbRead === 'function') {
      _fixedGateFetching = true;
      dbRead('getReferralDashboard', { uid: USER_PROFILE.uid }, null).then(ref => {
        if (ref && ref.referrer) {
          commissionApprovedCount = ref.referrer.approvedCount || 0;
          commissionMinApproved   = ref.referrer.minApprovedToWithdraw || 0;
          commissionMinAmount     = ref.referrer.minAmountToWithdraw || 0;
        }
      }).catch(() => {}).finally(() => {
        _fixedGateFetching = false;
        // re-render modal ถ้ายังเปิดอยู่
        if (redeemTargetId === contractId &&
            document.getElementById('earnRedeemModal').classList.contains('open')) {
          openRedeemModal(contractId);
        }
      });
    }
  } else {
    // ไม่ใช่ Fixed — ซ่อน gate note + enable ปุ่มปกติ
    if (redeemGateEl) redeemGateEl.style.display = 'none';
    if (redeemSubmitBtn) redeemSubmitBtn.disabled = false;
  }

  // [v2.39] แสดง note พิเศษสำหรับ frozen
  const tsEl = document.getElementById('redeemTradeSummary');
  if (tsEl) {
    if (isFrozenReady) {
      tsEl.textContent = tccT('warn_frozen_redeem_ready');
      tsEl.style.color = 'var(--y)';
    } else {
      tsEl.textContent = tccT('loading');
      tsEl.style.color = '';
      if (typeof dbCallRaw === 'function') {
        dbCallRaw('getEarnContractTradeSummary', { contract_id: c.contractId, uid: USER_PROFILE.uid })
          .then(res => {
            if (!res || redeemTargetId !== contractId) return;
            const t = res.totalRealizedPnl || 0;
            tsEl.style.color = t >= 0 ? 'var(--g)' : 'var(--r)';
            tsEl.textContent = (t >= 0 ? '+' : '') + fmtM(t, 4) + ' USDT (' + (res.tradeCount || 0) + ' ' + tccT('orders_unit') + ')';
          })
          .catch(() => { if (redeemTargetId === contractId) tsEl.textContent = '—'; });
      }
    }
  }

  document.getElementById('earnRedeemModal').classList.add('open');
}

function closeRedeemModal() {
  document.getElementById('earnRedeemModal').classList.remove('open');
  redeemTargetId = null;
}

// ── [v2.36] confirmRedeemPrincipal — ปุ่ม "ยืนยัน" ในโมดัล เรียก submitRedeemPrincipal จริง ──
function confirmRedeemPrincipal() {
  const contractId = redeemTargetId;
  closeRedeemModal();
  if (contractId) submitRedeemPrincipal(contractId);
}

// ── [v2.35 NEW, v2.36 แยกส่วน confirm, v2.39 รองรับ frozen] submitRedeemPrincipal
// รับเงินต้นคืนหลังสัญญาครบกำหนด (matured หรือ frozen ที่ผ่าน end_time)
// GAS จะ auto-cancel Pending Orders + auto-close Active Positions ให้อัตโนมัติ
function submitRedeemPrincipal(contractId) {
  const c = earnContracts.find(x => x.contractId === contractId);
  if (!c) return;

  // [v2.39] รองรับทั้ง matured และ frozen ที่ครบกำหนดแล้ว
  const isFrozenReady = c.status === 'frozen' && (c.endTime || 0) > 0 && Date.now() >= (c.endTime || 0);
  if (c.status !== 'matured' && !isFrozenReady) {
    showToast(tccT('toast_not_matured_redeem'));
    return;
  }

  // APT guard: เฉพาะ matured
  if (!isFrozenReady) {
    const liveUnrealized = S.positions
      .filter(p => p.earnContractId === c.contractId)
      .reduce((s, p) => s + (p.pnl || 0), 0);
    const netProfit = (c.realizedPnl || 0) + liveUnrealized;
    if (netProfit > 0) {
      showToast(tccT('toast_claim_profit_first'));
      return;
    }
  }

  // [NEW] Commission Gate — เฉพาะสัญญา Fixed ทุกสถานะ (matured/frozen)
  // เงื่อนไขเดียวกับ Claim APT Fixed: ต้องมีสมาชิก Approved >= 5 คน
  if (c.contractMode === 'fixed' || c.isFixed) {
    const _rdMinTeam2 = (typeof commissionMinApproved === 'number' && commissionMinApproved > 0) ? commissionMinApproved : 5;
    const _rdApprv2   = (typeof commissionApprovedCount === 'number') ? commissionApprovedCount : 0;
    if (_rdApprv2 < _rdMinTeam2) {
      showToast(`⚠️ ${tccTF('gate_min_approved_redeem', {min: _rdMinTeam2, cur: _rdApprv2})}`);
      return;
    }
  }

  // [REDEEM GUARD] ป้องกัน redeem ซ้ำใน session เดียว
  const _redeemKey = '_redeemInProgress_' + (c.contractId || '');
  if (window[_redeemKey]) { showToast(tccT('toast_redeem_in_progress')); return; }
  window[_redeemKey] = true;
  setTimeout(() => { window[_redeemKey] = false; }, 15000);

  // [NEW: NET-SETTLEMENT] ใช้ breakdown เดียวกับ modal เพื่อให้ optimistic update ตรงกับที่ GAS จะคำนวณจริง
  const _bd2 = _calcRedeemBreakdown(c, isFrozenReady);
  const principal = _bd2.netPrincipal;
  if (principal <= 0 && _bd2.principal <= 0) {
    window[_redeemKey] = false;
    showToast(tccT('toast_no_principal'));
    return;
  }

  // [v2.39] Local cleanup ก่อน Optimistic update
  // ปิด positions + ล้าง orders ใน local state (GAS จะ confirm อีกครั้งฝั่ง server)
  S.positions = S.positions.filter(p => p.earnContractId !== c.contractId);
  S.orders    = (S.orders || []).filter(o => o.contractId !== c.contractId && o.earnContractId !== c.contractId);

  // Optimistic local update — ปิดสัญญาทันที
  c.status = 'closed';
  mainWalletBalance += principal;
  recordTx(c.contractId, 'redeem', principal,
    isFrozenReady
      ? 'รับเงินต้นคืน (Frozen ครบกำหนด) | GAS จะ auto-close orders/positions ที่ค้าง'
      : 'รับเงินต้นคืนเต็มจำนวนหลังสัญญาครบกำหนด (matured)');

  renderEarnContracts();
  renderPositions();
  updateSysWalletDisplay();
  // [NEW: NET-SETTLEMENT] ถ้ามีการหักบัฟเฟอร์ ให้แจ้งรายละเอียดในข้อความยืนยันด้วย
  showToast(_bd2.claimBuffer > 0
    ? `✅ รับเงินต้นคืนสำเร็จ! +${fmtM(principal)} USDT → Main Wallet (หักบัฟเฟอร์สำรอง ${fmtM(_bd2.claimBuffer)} USDT จากยอดที่เคยรับไปแล้ว)`
    : `✅ รับเงินต้นคืนสำเร็จ! +${fmtM(principal)} USDT → Main Wallet`);

  // [v2.35/v2.39] hook → saveEarnRedeem (GAS logEarnRedeem)
  if (typeof saveEarnRedeem === 'function') {
    saveEarnRedeem({ contractId, stakedAmount: principal });
  }
}

// ── checkAutoLiquidate — เรียกจาก tickDailyYield (background tick) ──
function checkAutoLiquidate(id) {
  const c = earnContracts.find(x => x.contractId === id);
  if (!c || c.status !== 'active') return;
  // [FIX FREEZE-ON-REFRESH][v9 FIX] ห้าม _autoLiquidate ระหว่าง Sync Lock (grace period หรือ refresh จริง)
  if (_isSyncLocked()) return;
  // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ไม่มีข้อมูล → ไม่ liquidate จาก dd
  const dd = _gasDDStrict(c);
  const realizedNegTrigger = (c.realizedPnl || 0) < -(c.stakedAmount * 0.10);
  if ((dd !== null && dd >= 40) || realizedNegTrigger) {
    // ใช้ _autoLiquidate เพื่อปิด positions ทั้งหมดก่อน Freeze
    _autoLiquidate(c);
  }
}

// ── fetchCandlesFor / fetchSpCandlesFor stubs (for fullscreen chart TF switch) ──
function fetchCandlesFor(tf, cb) {
  const coin = S.coinMap ? (S.coinMap[S.symbol] || S.coin) : (S.coin || 'BTC');
  const interval = _candleInterval(tf);
  const ms = _candleMs(interval);
  hlPost({ type:'candleSnapshot', req:{ coin, interval, startTime: Date.now() - ms * CANDLE_BATCH, endTime: Date.now() } })
    .then(data => {
      const candles = _parseCandles(data);
      if (cb) cb(candles.length ? candles : (S.candles || []));
    }).catch(() => { if (cb) cb(S.candles || []); });
}
function fetchSpCandlesFor(tf, cb) {
  const coin = SP ? (SP.coin || 'ETH') : 'ETH';
  const interval = _candleInterval(tf);
  const ms = _candleMs(interval);
  hlPost({ type:'candleSnapshot', req:{ coin, interval, startTime: Date.now() - ms * CANDLE_BATCH, endTime: Date.now() } })
    .then(data => {
      const candles = _parseCandles(data);
      if (cb) cb(candles.length ? candles : (SP ? (SP.candles || []) : []));
    }).catch(() => { if (cb) cb(SP ? (SP.candles || []) : []); });
}

// ── Close modals on overlay click ──
document.addEventListener('click', function(e) {
  const dm = document.getElementById('earnDetailModal');
  if (dm && dm.classList.contains('open') && e.target === dm) closeDetailModal();
  const tm = document.getElementById('earnTxModal');
  if (tm && tm.classList.contains('open') && e.target === tm) closeTxModal();
});

// ── [v12 FIX 3] checkCanOpenPosition — Guard ก่อนเปิด Position ──────────────────
// เรียก getContractStatus จาก GAS เสมอ ไม่ข้ามผ่าน local earnContracts cache
// เพื่อให้ drawdown_pct / isFrozen / isWarning / avail_margin มาจาก server-side ที่แม่นยำ
// [v2.44 FIX-OSC2-D] เพิ่มตรวจ isMarginBlocked / avail_margin / per-order-cap จาก GAS
//   เดิม: ตรวจแค่ isFrozen / isWarning → ออเดอร์ที่ margin เกิน cap ผ่านได้เพราะไม่มีการตรวจ margin ที่นี่
//   ใหม่: ถ้า getContractStatus ส่ง margin_cap กลับมา → ตรวจ 3 เงื่อนไขก่อนปล่อยไป _placeOrderCore
//         เงื่อนไข 1: isMarginBlocked → วงเงินเต็มจากขาดทุนสะสม+margin ที่เปิดอยู่ (รวม pending แล้ว ใน GAS)
//         เงื่อนไข 2: avail_margin < ขนาดออเดอร์ → วงเงินคงเหลือไม่พอ (คำนวณในฝั่ง _placeOrderCore ซ้ำ แต่เช็คที่นี่ก่อน)
//         เงื่อนไข 3: per-order > margin_cap×50% → ออเดอร์ใหญ่เกิน 50% ต่อครั้ง
//   ⚠️ ไม่สามารถตรวจ margin ออเดอร์ได้ที่นี่ เพราะ user ยังไม่ได้กรอก size/price ครบ
//      เช็คได้แค่ isMarginBlocked (วงเงินเต็มอยู่แล้ว ไม่ว่าออเดอร์จะเล็กแค่ไหน)
//      การตรวจ per-order-cap และ avail_margin ยังอยู่ใน _placeOrderCore ตามปกติ
async function checkCanOpenPosition(earnContractId) {
  // [v2.41 FIX-U2] fail-closed: ถ้าไม่มี earnContractId → block ทันที
  // เดิม: if (!earnContractId) return true — ผ่านเลย → orphan position
  // ใหม่: return false + toast ให้ user รู้สาเหตุชัดเจน
  if (!earnContractId) {
    showToast(tccT('toast_select_earn_first'));
    return false;
  }
  try {
    const uid = USER_PROFILE && USER_PROFILE.uid;
    if (!uid) return true;
    showToast(tccT('toast_checking_contract'));
    _setBtnLoading('long', true); _setBtnLoading('short', true);
    const res = await dbCallRaw('getContractStatus', { contract_id: earnContractId, uid });
    // [BUGFIX] dbCallRaw() return json.data ตรงๆ อยู่แล้ว — res คือ status object เลย
    // ไม่มี .data ซ้อนอีกชั้น (เดิมเช็ค res.data ผิด → เงื่อนไขนี้ false เสมอ → ข้าม guard
    // ทั้งหมดไปเฉยๆ ทุกครั้ง รวมถึง liq_price_map ก็ไม่ถูก merge เข้า window._liqPriceMap)
    if (res) {
      const st = res;
      // [v12] อัปเดต _contractDDMap ด้วยข้อมูลล่าสุดจาก GAS ทันที
      // [FIX-SYNC-3a] เพิ่ม avail_margin / margin_cap / isMarginBlocked เพื่อให้ _refreshAvbl อ่านได้
      // [FIX-DD3a] เพิ่ม trading_realized_loss + apt_yield_accrued เพื่อให้ showEarnDetail อ่านได้
      window._contractDDMap = window._contractDDMap || {};
      window._contractDDMap[earnContractId] = {
        isFrozen:              !!st.isFrozen,
        isWarning:             !!st.isWarning,
        drawdown_pct:          st.drawdown_pct,
        avail_margin:          st.avail_margin,
        margin_cap:            st.margin_cap,
        isMarginBlocked:       !!st.isMarginBlocked,
        trading_realized_loss: st.trading_realized_loss,
        apt_yield_accrued:     st.apt_yield_accrued,
      };
      // [BUGFIX] merge liq_price_map ถ้า backend ส่งมาด้วย — กัน Liq. Price ค้าง "—"
      if (st.liq_price_map) {
        window._liqPriceMap = Object.assign({}, window._liqPriceMap || {}, st.liq_price_map);
      }
      if (st.isFrozen) {
        showToast(tccTF('toast_contract_frozen_dd',{dd:st.drawdown_pct||'—'}));
        return false;
      }
      // [v2.44 FIX-OSC2-D] ตรวจ isMarginBlocked จาก GAS (นับรวม pending orders แล้วใน v2.44)
      //   ตรวจก่อนที่ user จะเริ่มกรอก size/price — ถ้าวงเงินเต็มอยู่แล้วไม่ต้องให้ user กรอกเลย
      if (st.margin_cap !== undefined && st.isMarginBlocked) {
        const _rl = typeof fmtNum === 'function' ? fmtNum(st.realized_loss || 0, 2) : (st.realized_loss || 0).toFixed(2);
        const _mc = typeof fmtNum === 'function' ? fmtNum(st.margin_cap || 0, 2)    : (st.margin_cap    || 0).toFixed(2);
        showToast(tccTF('toast_budget_full_short',{rl:_rl,mc:_mc}));
        return false;
      }
      if (st.isWarning) {
        if (!confirm('⚠️ คำเตือน: Drawdown ปัจจุบัน ' + (st.drawdown_pct||'—') + '%\nยังเปิด Position ได้ แต่เสี่ยงสูง\nต้องการดำเนินการต่อหรือไม่?')) return false;
      }
    }
    return true;
  } catch(e) { console.warn('[checkCanOpenPosition]', e); return true; }
  finally { _setBtnLoading('long', false); _setBtnLoading('short', false); }
}
function _setBtnLoading(side, isLoading) {
  const btn = document.getElementById(side === 'long' ? 'tradeBtnLong' : 'tradeBtnShort');
  if (!btn) return;
  if (isLoading) {
    btn.dataset._origText = btn.textContent;
    btn.textContent = '⏳ ' + tccT('loading');
    btn.disabled = true; btn.style.opacity = '0.7';
  } else {
    if (btn.dataset._origText) btn.textContent = btn.dataset._origText;
    btn.disabled = false; btn.style.opacity = '';
  }
}

// ── [BUGFIX] _refreshContractLiqMap — ดึง liq_price_map ล่าสุดจาก GAS ─────────
// เดิม window._liqPriceMap ถูก set ใน loadOfflineState() เท่านั้น (ตอนเปิดแอป/refresh)
// → Position ที่เพิ่งเปิดใหม่ใน session ปัจจุบัน (market fill หรือ limit fill) ไม่มี id
//   อยู่ใน map นี้เลย จนกว่าจะ reload แอปใหม่ทั้งหมด → "Liq. Price (DD≥40%→Freeze)" โชว์ "—" ค้าง
// แก้โดยเรียก getContractStatus ของสัญญานั้นทันทีหลัง position ถูกสร้าง/แก้ไข
// แล้ว merge liq_price_map + _contractDDMap เข้า window ก่อน re-render
async function _refreshContractLiqMap(earnContractId) {
  if (!earnContractId) return;
  try {
    const uid = typeof USER_PROFILE !== 'undefined' && USER_PROFILE ? USER_PROFILE.uid : null;
    if (!uid || typeof dbCallRaw !== 'function') return;
    const res = await dbCallRaw('getContractStatus', { contract_id: earnContractId, uid });
    // [BUGFIX] dbCallRaw() return json.data ตรงๆ อยู่แล้ว — res คือ status object เลย ไม่มี
    // .data ซ้อนอีกชั้น (เดิมเช็ค res.data ผิด → return early เสมอ → liq_price_map ไม่เคยถูก
    // merge เข้า window._liqPriceMap เลยจากจุดนี้ → เป็นสาเหตุหลักที่ "Liq. Price" ค้าง "—")
    if (!res) return;
    const st = res;
    window._contractDDMap = window._contractDDMap || {};
    // [FIX-SYNC-3b] เพิ่ม avail_margin / margin_cap / isMarginBlocked ใน _contractDDMap
    // [FIX-DD3b] เพิ่ม trading_realized_loss + apt_yield_accrued
    window._contractDDMap[earnContractId] = {
      isFrozen:              !!st.isFrozen,
      isWarning:             !!st.isWarning,
      drawdown_pct:          st.drawdown_pct,
      avail_margin:          st.avail_margin,
      margin_cap:            st.margin_cap,
      isMarginBlocked:       !!st.isMarginBlocked,
      trading_realized_loss: st.trading_realized_loss,
      apt_yield_accrued:     st.apt_yield_accrued,
    };
    if (st.liq_price_map) {
      window._liqPriceMap = Object.assign({}, window._liqPriceMap || {}, st.liq_price_map);
    }
    if (typeof updatePositionsPNL === 'function') updatePositionsPNL();
    if (typeof renderPositions === 'function') renderPositions();
  } catch (e) { console.warn('[_refreshContractLiqMap]', e.message); }
}

// ── [v8] placeOrder — async guard wrapper ──────────────────────────────────
async function placeOrder(side) {
  _setBtnLoading(side, true);
  try {
    const c = (typeof _getSelectedContract === 'function') ? _getSelectedContract() : null;
    const contractId = c ? c.contractId : (typeof selectedEarnContractId !== 'undefined' ? selectedEarnContractId : null);
    const canOpen = await checkCanOpenPosition(contractId);
    if (!canOpen) return;
    _placeOrderCore(side);
    // sync balance + drawdown หลัง place order
    if (c) {
      syncContractBalance(c);
      // [v13 FIX] ใช้ _contractDDMap (GAS) เท่านั้น — ไม่มีข้อมูล → ไม่ trigger liquidate
      const _ddPO = _gasDDStrict(c);
      if (_ddPO !== null && _ddPO >= 40) { _autoLiquidate(c); }
      else { _refreshAvbl(c); renderEarnContracts(); selectEarnContract(c.contractId); }
      // [v4 FIX DOUBLE-WRITE] ตัด syncEarnContractsToGAS ออก — placeOrder ไม่แตะ realized_pnl
      // earnContracts state ที่ส่งไปจะมี realized_pnl สะสมอยู่ → ทับ GAS ซ้ำ
    }
  } finally { _setBtnLoading(side, false); }
}

// ── [v8 REMOVED OLD placeOrder] — ย้ายขึ้นไปด้านบนแล้ว ──────────────────
// function placeOrder(side) {
// [v8] placeOrder body ย้ายไปเป็น async function ด้านบนแล้ว
// (stub นี้ไม่ถูกเรียก)

// Close earn selector dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dd = document.getElementById('earnSelDD');
  const box = document.querySelector('.earn-sel-wrap');
  if (dd && dd.classList.contains('open') && box && !box.contains(e.target)) {
    dd.classList.remove('open');
  }
  const cm = document.getElementById('earnCreateModal');
  if (cm && cm.classList.contains('open') && e.target === cm) closeCreateEarn();
  const clm = document.getElementById('earnClaimModal');
  if (clm && clm.classList.contains('open') && e.target === clm) closeClaimModal();
});

init().catch(e => console.error('[init] uncaught top-level error:', e));
// Initial overview sync
setTimeout(() => updateOverviewBalances(), 500);
