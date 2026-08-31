// ══════════════════════════════════════
//  HIST — Live Trade History Logger
//  เก็บ log ทุก event จริงจากการเทรด
// ══════════════════════════════════════
const HIST = {
  orderHistory:      [],  // { id, coin, symbol, orderType, dir, dirClass, time, ts, amount, filledAmt, price, fillPrice, reduceOnly, status }
  positionHistory:   [],  // { id, coin, symbol, badge, mode, lev, side, realizedPnl, roi, closedVol, avgEntry, avgClose, maxOI, unrealizedPnl, opened, openedTs, closed, closedTs, lasting, status }
  tradeHistory:      [],  // { id, coin, symbol, dir, dirClass, time, ts, orderNo, price, filled, fee, role, realizedPnl }
  transactionHistory:[],  // { id, asset, time, ts, type, symbol, amount }
  fundingFee:        [],  // { id, asset, time, ts, symbol, amount }
  // Spot-specific histories
  spotOrderHistory:  [],  // { id, coin, symbol, badge, orderType, dir, dirClass, time, ts, amount, price, status }
  spotTradeHistory:  [],  // { id, coin, symbol, dir, dirClass, time, ts, orderNo, price, filled, fee, role }
  // open position registry สำหรับ position-history (เปิดอยู่ → status Partially Closed / Closed)
  _openPosRegistry:  {},  // posId → { coin, symbol, side, lev, mode, entry, size, openedTs, maxSize }

  fmtTime(ts) {
    // [v9.1] แสดงเวลา Bangkok (UTC+7) เสมอ
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d);
    const p = {};
    parts.forEach(x => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  },
  fmtNum(n, dec=3) { return parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}); },
  fmtPrice(n)      { return parseFloat(n).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:6}); },
  genId()          { return Date.now() + Math.random().toString(36).slice(2,6); },

  /* ── Hook: เปิด Position ใหม่ ── */
  logOpen(pos) {
    const ts = Date.now();
    const sym = pos.symbol || (pos.coin + 'USDT');
    const isLong = pos.side === 'long';
    const dirLabel = isLong ? 'Open Long'  : 'Open Short';
    const dirClass = isLong ? 'open-long'  : 'open-short';
    const orderTypeTxt = (pos.type || 'Limit');
    const dirFull  = orderTypeTxt + ' / ' + dirLabel;
    const fee      = +(pos.entry * pos.size * 0.0005).toFixed(6); // taker 0.05%

    // 1. Order History
    this.orderHistory.unshift({
      id: this.genId(), coin: sym, symbol: sym, badge:'Perp',
      orderType: orderTypeTxt, dir: dirFull, dirClass,
      time: this.fmtTime(ts), ts,
      amount: this.fmtNum(pos.size) + '/' + this.fmtNum(pos.size),
      price: this.fmtPrice(pos.entry) + '/' + (orderTypeTxt==='Market'?'Market':this.fmtPrice(pos.entry)),
      status: 'Filled',
    });

    // 2. Trade History
    const tradeDir = isLong ? 'Buy' : 'Sell';
    this.tradeHistory.unshift({
      id: this.genId(), coin: sym, badge:'Perp',
      dir: tradeDir, dirClass: tradeDir.toLowerCase(), time: this.fmtTime(ts), ts,
      orderNo: String(ts) + Math.floor(Math.random()*1000),
      price: this.fmtPrice(pos.entry), filled: this.fmtNum(pos.size),
      fee: fee.toFixed(6), role:'Taker', realizedPnl: 0,
    });

    // 3. Transaction History — Commission
    this.transactionHistory.unshift({
      id: this.genId(), asset:'USDT', time: this.fmtTime(ts), ts,
      type:'Commission', symbol: sym + ' Perpetual', amount: '-' + fee.toFixed(6),
    });

    // 4. Register open position for position-history tracking
    this._openPosRegistry[pos.id] = {
      coin: sym, symbol: sym, badge:'Perp',
      mode: (pos.mode||'Cross') + ' ' + (pos.lev||150) + 'x',
      side: pos.side, entry: pos.entry, size: pos.size,
      openedTs: ts, maxSize: pos.size,
      realizedPnl: 0, closedVol: 0, avgClose: 0, closeCount: 0,
    };
  },

  /* ── Hook: ปิด Position (full หรือ partial) ── */
  logClose(pos, closeAmt, exitPrice, realizedPnl, isFull) {
    const ts = Date.now();
    const sym = pos.symbol || (pos.coin + 'USDT');
    const isLong = pos.side === 'long';
    const dirLabel = isLong ? 'Close Long'  : 'Close Short';
    const dirClass = isLong ? 'close-long'  : 'close-short';
    const orderTypeTxt = (pos.type || 'Market');
    const dirFull  = orderTypeTxt + ' / ' + dirLabel;
    const fee      = +(exitPrice * closeAmt * 0.0005).toFixed(6);

    // 1. Order History
    this.orderHistory.unshift({
      id: this.genId(), coin: sym, symbol: sym, badge:'Perp',
      orderType: orderTypeTxt, dir: dirFull, dirClass,
      time: this.fmtTime(ts), ts,
      amount: this.fmtNum(closeAmt) + '/' + this.fmtNum(closeAmt),
      price: this.fmtPrice(exitPrice) + '/' + (orderTypeTxt==='Market'?'Market':this.fmtPrice(exitPrice)),
      reduceOnly: 'True', status:'Filled',
    });

    // 2. Trade History
    const tradeDir = isLong ? 'Sell' : 'Buy';
    this.tradeHistory.unshift({
      id: this.genId(), coin: sym, badge:'Perp',
      dir: tradeDir, dirClass: tradeDir.toLowerCase(), time: this.fmtTime(ts), ts,
      orderNo: String(ts) + Math.floor(Math.random()*1000),
      price: this.fmtPrice(exitPrice), filled: this.fmtNum(closeAmt),
      fee: fee.toFixed(6), role:'Taker',
      realizedPnl: +realizedPnl.toFixed(4),
    });

    // 3. Transaction History — Commission + Realized PNL
    this.transactionHistory.unshift({
      id: this.genId(), asset:'USDT', time: this.fmtTime(ts), ts,
      type:'Commission', symbol: sym + ' Perpetual', amount: '-' + fee.toFixed(6),
    });
    if (Math.abs(realizedPnl) > 0.0001) {
      this.transactionHistory.unshift({
        id: this.genId(), asset:'USDT', time: this.fmtTime(ts), ts,
        type:'Realized PNL', symbol: sym + ' Perpetual',
        amount: (realizedPnl >= 0 ? '+' : '') + parseFloat(realizedPnl).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4}),
      });
    }

    // 4. Position History — update registry
    const reg = this._openPosRegistry[pos.id];
    if (reg) {
      reg.realizedPnl += realizedPnl;
      reg.closedVol   += closeAmt;
      // weighted avg close price
      reg.avgClose = reg.closeCount === 0 ? exitPrice
        : (reg.avgClose * reg.closeCount + exitPrice) / (reg.closeCount + 1);
      reg.closeCount++;

      const margin = (reg.entry * reg.maxSize) / (pos.lev || 150);
      const roi = margin > 0 ? (reg.realizedPnl / margin) * 100 : 0;

      if (isFull) {
        const openedStr = this.fmtTime(reg.openedTs);
        const closedStr = this.fmtTime(ts);
        const lastingMs = ts - reg.openedTs;
        const lastingStr = this._fmtDuration(lastingMs);
        this.positionHistory.unshift({
          id: this.genId(), coin: sym, badge:'Perp',
          mode: reg.mode, side: reg.side, status:'Closed',
          realizedPnl: parseFloat(reg.realizedPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
          roi: roi.toFixed(2),
          closedVol: this.fmtNum(reg.closedVol),
          avgEntry: this.fmtPrice(reg.entry),
          avgClose: this.fmtPrice(reg.avgClose),
          maxOI: this.fmtNum(reg.maxSize),
          unrealizedPnl: null,
          opened: openedStr, openedTs: reg.openedTs,
          closed: closedStr, closedTs: ts, ts: ts, lasting: lastingStr,
        });
        delete this._openPosRegistry[pos.id];
      } else {
        // partial close: update existing or create Partially Closed record
        const existing = this.positionHistory.find(p => p._posId === pos.id);
        if (existing) {
          existing.realizedPnl = parseFloat(reg.realizedPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
          existing.roi = roi.toFixed(2);
          existing.closedVol = this.fmtNum(reg.closedVol);
          existing.avgClose = this.fmtPrice(reg.avgClose);
          existing.status = 'Partially Closed';
        } else {
          this.positionHistory.unshift({
            id: this.genId(), _posId: pos.id, coin: sym, badge:'Perp',
            mode: reg.mode, side: reg.side, status:'Partially Closed',
            realizedPnl: parseFloat(reg.realizedPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
            roi: roi.toFixed(2),
            closedVol: this.fmtNum(reg.closedVol),
            avgEntry: this.fmtPrice(reg.entry),
            avgClose: this.fmtPrice(reg.avgClose),
            maxOI: this.fmtNum(reg.maxSize),
            unrealizedPnl: null,
            opened: this.fmtTime(reg.openedTs), openedTs: reg.openedTs,
            closed: '—', closedTs: null, lasting: this._fmtDuration(ts - reg.openedTs),
          });
        }
      }
    }
  },

  /* ── Hook: Funding Fee (เรียกทุก 8 ชั่วโมง) ── */
  logFunding(symbol, amount) {
    const ts = Date.now();
    this.fundingFee.unshift({
      id: this.genId(), asset:'USDT', time: this.fmtTime(ts), ts,
      symbol: symbol + ' Perpetual', amount: (amount >= 0 ? '+' : '') + amount.toFixed(8),
    });
    // also in transaction history
    this.transactionHistory.unshift({
      id: this.genId(), asset:'USDT', time: this.fmtTime(ts), ts,
      type:'Funding Fee', symbol: symbol + ' Perpetual',
      amount: (amount >= 0 ? '+' : '') + amount.toFixed(8),
    });
  },

  /* ── Hook: Spot Trade ── */
  logSpotTrade(coin, side, orderType, price, qty, fee) {
    const ts = Date.now();
    const sym = coin + '/USDT';
    const isBuy = side === 'buy';
    const dirLabel = isBuy ? 'Buy' : 'Sell';
    const dirClass = isBuy ? 'buy' : 'sell';

    // 1. Spot Order History
    this.spotOrderHistory.unshift({
      id: this.genId(), coin: sym, symbol: sym, badge: 'Spot',
      orderType, dir: orderType + ' / ' + dirLabel, dirClass,
      time: this.fmtTime(ts), ts,
      amount: this.fmtNum(qty, 4) + '/' + this.fmtNum(qty, 4),
      price: this.fmtPrice(price) + '/' + (orderType === 'Market' ? 'Market' : this.fmtPrice(price)),
      status: 'Filled',
    });

    // 2. Spot Trade History
    this.spotTradeHistory.unshift({
      id: this.genId(), coin: sym, symbol: sym, badge: 'Spot',
      dir: dirLabel, dirClass, time: this.fmtTime(ts), ts,
      orderNo: String(ts) + Math.floor(Math.random() * 1000),
      price: this.fmtPrice(price),
      filled: this.fmtNum(qty, 4),
      fee: fee.toFixed(6) + ' ' + coin,
      role: 'Taker',
      realizedPnl: null,
    });

    // 3. Transaction History — Spot trade commission
    this.transactionHistory.unshift({
      id: this.genId(), asset: coin, time: this.fmtTime(ts), ts,
      type: 'Spot Trade', symbol: sym,
      amount: (isBuy ? '+' : '-') + this.fmtNum(qty, 4),
    });
    this.transactionHistory.unshift({
      id: this.genId(), asset: 'USDT', time: this.fmtTime(ts), ts,
      type: 'Commission', symbol: sym,
      amount: '-' + fee.toFixed(6),
    });
  },

  /* ── Hook: Withdrawal ── */
  logWithdraw(amt, coin, network, address, fee) {
    const ts = Date.now();
    const totalDeducted = +(amt + fee).toFixed(6);
    this.transactionHistory.unshift({
      id: this.genId(), asset: coin, time: this.fmtTime(ts), ts,
      type: 'Withdraw', symbol: network,
      amount: '-' + amt.toFixed(6),
      address, fee,
    });
    if (fee > 0) {
      this.transactionHistory.unshift({
        id: this.genId(), asset: coin, time: this.fmtTime(ts), ts,
        type: 'Withdraw Fee', symbol: network,
        amount: '-' + fee.toFixed(6),
      });
    }
  },

  /* ── Hook: Transfer ── */
  logTransfer(amt, fromWallet, toWallet) {
    const ts = Date.now();
    const walletNames = { spot: 'Spot', usdm: 'USD⑤-M Futures', earn: 'Simple Earn', main: 'Spot' };
    const fromName = walletNames[fromWallet] || fromWallet;
    const toName = walletNames[toWallet] || toWallet;
    this.transactionHistory.unshift({
      id: this.genId(), asset: 'USDT', time: this.fmtTime(ts), ts,
      type: 'Transfer', symbol: fromName + ' → ' + toName,
      amount: (amt >= 0 ? '+' : '') + amt.toFixed(6),
    });
  },

  _fmtDuration(ms) {
    const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d > 0) return d + 'd ' + (h%24) + 'h';
    if (h > 0) return h + 'h ' + (m%60) + 'm';
    if (m > 0) return m + 'm';
    return s + 's';
  },
};

// ══════════════════════════════════════
//  MY TRADES  —  UI
// ══════════════════════════════════════
const MYT = {
  currentTab: 'open-orders',
  context: 'futures', // 'futures' | 'spot' | 'assets'
  filters: {
    'open-orders':        { basicCond:'basic', symbol:'All',  orderType:'All' },
    'order-history':      { basicCond:'basic', symbol:'All',  orderType:'All', direction:'All', status:'Filled, Partially Filled' },
    'position-history':   { symbol:'All', mode:'All', status:'All' },
    'trade-history':      { symbol:'All', direction:'All' },
    'transaction-history':{ asset:'All', type:'All' },
    'funding-fee':        { asset:'All' },
    'spot-order-history': { symbol:'All', direction:'All', status:'All' },
    'spot-trade-history': { symbol:'All', direction:'All' },
  },
  advFilter: {
    'order-history':      { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'spot-order-history': { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'position-history':   { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'trade-history':      { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'spot-trade-history': { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'transaction-history':{ datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
    'funding-fee':        { datePreset:'1W', dateFrom:'', dateTo:'', orderTypes:[], statuses:[], orderSorting:'creation' },
  },
  ddCurrent: null,

  /* ── Live data getters ── filtered from HIST ── */
  getData(tab) {
    const f = this.filters[tab];
    const matchSym  = (coin) => !f.symbol   || f.symbol   === 'All' || coin === f.symbol;
    const matchDir  = (dir)  => !f.direction|| f.direction=== 'All' || dir.toLowerCase().includes(f.direction.toLowerCase());
    const matchOT   = (ot)   => !f.orderType|| f.orderType=== 'All' || ot.toLowerCase().includes(f.orderType.toLowerCase());
    const matchSt   = (st)   => !f.status   || f.status   === 'All' || f.status.includes(st);
    const matchAsset= (a)    => !f.asset    || f.asset    === 'All' || a === f.asset;
    const matchType = (t)    => !f.type     || f.type     === 'All'
      || t === f.type
      || (f.type === 'Loan History' && typeof t === 'string' && t.startsWith('Loan'));
    const matchMode = (m)    => !f.mode     || f.mode     === 'All' || m.toLowerCase().includes(f.mode.toLowerCase());

    if(tab === 'open-orders') {
      // live positions as pending orders
      // [FIX Bug1] กรอง earnContractId เหมือนกับ renderPositions (ชั้น 1)
      // [FIX Bug1] กรอง symbol ถ้า hideOthers เปิดอยู่ (ชั้น 2) — สอดคล้องกับหน้า Positions
      const rawPositions = (typeof S !== 'undefined' ? S.positions : []);
      const earnFiltered = (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId)
        ? rawPositions.filter(p => p.earnContractId === selectedEarnContractId)
        : rawPositions;
      const hideFiltered = (typeof S !== 'undefined' && S.hideOthers)
        ? earnFiltered.filter(p => p.symbol === S.symbol)
        : earnFiltered;

      // นับ pending limit orders ด้วย (S.openOrders)
      const rawOrders = (typeof S !== 'undefined' && S.openOrders) ? S.openOrders : [];
      const earnOrdersFiltered = (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId)
        ? rawOrders.filter(o => o.earnContractId === selectedEarnContractId)
        : rawOrders;
      const hideOrdersFiltered = (typeof S !== 'undefined' && S.hideOthers)
        ? earnOrdersFiltered.filter(o => o.symbol === S.symbol)
        : earnOrdersFiltered;

      const posItems = hideFiltered.map(p => {
        const sym = p.symbol || (p.coin + 'USDT');
        const isLong = p.side === 'long';
        return {
          coin: sym, badge:'Perp',
          dir: (p.type||'Market') + ' / ' + (isLong ? 'Open Long' : 'Open Short'),
          dirClass: isLong ? 'open-long' : 'open-short',
          time: HIST.fmtTime(p.id),
          filled: HIST.fmtNum(p.size * (p.filledRatio||1)),
          amount: HIST.fmtNum(p.size),
          unit: p.coin,
          price: HIST.fmtPrice(p.entry),
          reduceOnly: 'False', pct: Math.round((p.filledRatio||1)*100),
          _posId: p.id,
          _isLimitPending: false,
        };
      }).filter(d => matchSym(d.coin));

      // รวม pending limit orders (รอ fill)
      const pendingItems = hideOrdersFiltered.map(o => {
        const sym = o.symbol || (o.coin + 'USDT');
        const isLong = o.side === 'long';
        return {
          coin: sym, badge:'Perp',
          dir: (o.type||'Limit') + ' / ' + (isLong ? 'Open Long' : 'Open Short'),
          dirClass: isLong ? 'open-long' : 'open-short',
          time: HIST.fmtTime(o.id),
          filled: '0.000',
          amount: HIST.fmtNum(o.size),
          unit: o.coin,
          price: HIST.fmtPrice(o.limitPrice),
          reduceOnly: 'False', pct: 0,
          _posId: o.id,
          _isLimitPending: true,
        };
      }).filter(d => matchSym(d.coin));

      return [...pendingItems, ...posItems];
    }
    // [v9.1] sort ล่าสุดอยู่บนเสมอ ทุก tab — ใช้ ts (timestamp ms) descending
    const _sortDesc = arr => [...arr].sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if(tab === 'order-history')      return _sortDesc(HIST.orderHistory.filter(d => matchSym(d.coin) && matchOT(d.orderType) && matchDir(d.dir) && matchSt(d.status)));
    if(tab === 'position-history')   return _sortDesc(HIST.positionHistory.filter(d => matchSym(d.coin) && matchMode(d.mode) && matchSt(d.status)));
    if(tab === 'trade-history')      return _sortDesc(HIST.tradeHistory.filter(d => matchSym(d.coin) && matchDir(d.dir)));
    if(tab === 'transaction-history')return _sortDesc(HIST.transactionHistory.filter(d => matchAsset(d.asset) && matchType(d.type)));
    if(tab === 'funding-fee')        return _sortDesc(HIST.fundingFee.filter(d => matchAsset(d.asset)));
    if(tab === 'spot-order-history') return _sortDesc(HIST.spotOrderHistory.filter(d => matchSym(d.coin) && matchDir(d.dir) && matchSt(d.status)));
    if(tab === 'spot-trade-history') return _sortDesc(HIST.spotTradeHistory.filter(d => matchSym(d.coin) && matchDir(d.dir)));
    return [];
  },
};

// ── [v8] loadOpenPositionsWithDD — ดึง positions พร้อม DD Map จาก GAS ──
async function loadOpenPositionsWithDD() {
  const uid = USER_PROFILE && USER_PROFILE.uid;
  if (!uid) return;
  try {
    const res = await dbCallRaw('getOpenPositionsWithDD', { uid });
    if (!res) return;
    if (res.ok === false) {
      console.warn('[loadOpenPositionsWithDD] GAS error:', res.error);
      return;
    }
    // merge earnContracts status จาก contractDDMap
    // [v16 FIX] เดิม path นี้เขียนแค่ local._gasDDPct ซึ่งไม่มีฟังก์ชันไหนอ่านเลย (dead write)
    // และไม่ได้อัปเดต window._contractDDMap (SSOT ที่ _gasDD()/_gasDDStrict() อ่านจริง)
    // ผลคือ "My Trades" เปิดมาตรวจ freeze ได้ แต่ badge/trigger ที่อื่นยังอ่านค่าเก่าจาก _contractDDMap อยู่ดี
    // แก้ให้ sync เข้า window._contractDDMap เสมอ (merge ไม่ทับทั้ง map) เหมือน loadOfflineState
    if (res.contractDDMap && typeof earnContracts !== 'undefined') {
      let changed = false;
      window._contractDDMap = window._contractDDMap || {};
      Object.keys(res.contractDDMap).forEach(cid => {
        const ddInfo = res.contractDDMap[cid];
        const local  = earnContracts.find(x => x.contractId === cid);
        if (!local || !ddInfo) return;
        // [FIX-SYNC-3d] เพิ่ม avail_margin / margin_cap / isMarginBlocked ให้ครบ
        // [FIX-DD3d] เพิ่ม trading_realized_loss + apt_yield_accrued
        window._contractDDMap[cid] = {
          isFrozen:              !!ddInfo.isFrozen,
          isWarning:             !!ddInfo.isWarning,
          drawdown_pct:          ddInfo.drawdown_pct,
          avail_margin:          ddInfo.avail_margin,
          margin_cap:            ddInfo.margin_cap,
          isMarginBlocked:       !!ddInfo.isMarginBlocked,
          trading_realized_loss: ddInfo.trading_realized_loss,
          apt_yield_accrued:     ddInfo.apt_yield_accrued,
        };
        if (ddInfo.drawdown_pct !== undefined) {
          local._gasDrawdown = parseFloat(ddInfo.drawdown_pct) || 0;
        }
        if (ddInfo.isFrozen && local.status !== 'frozen') {
          local.status = 'frozen';
          changed = true;
          showToast(tccTF('toast_contract_frozen_short',{cid,dd:ddInfo.drawdown_pct||'—'}));
        }
      });
      if (changed) {
        if (typeof renderEarnContracts === 'function') renderEarnContracts();
      }
    }
    // merge active positions จาก GAS ถ้ามี (overwrite local ถ้า GAS ใหม่กว่า)
    if (res.positions && Array.isArray(res.positions) && res.positions.length) {
      if (typeof renderPositionsWithDD === 'function') {
        renderPositionsWithDD(res.positions, res.contractDDMap || {});
      }
    }
    // re-render เสมอ
    if (typeof renderPositions === 'function') renderPositions();
    if (typeof mytRefreshIfOpen === 'function') mytRefreshIfOpen();
  } catch(e) {
    console.warn('[loadOpenPositionsWithDD]', e);
  }
}

function openMyTrades(){
  const ov = document.getElementById('myTradesOverlay');
  const body = document.body;
  const rect = body.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const width = Math.min(480, rect.width || window.innerWidth);
  ov.style.left = left + 'px';
  ov.style.width = width + 'px';
  ov.classList.add('open');
  // [v8] ดึง positions + DD Map จาก GAS ทุกครั้งที่เปิด My Trades
  setTimeout(() => { if (typeof loadOpenPositionsWithDD === 'function') loadOpenPositionsWithDD(); }, 300);

  // [v13.3 FIX] ถ้าเปิดจาก Assets context → reset filter เป็น All เพื่อให้เห็น Deposit ด้วย
  if (MYT.context === 'assets' &&
      MYT.filters['transaction-history'].type !== 'All' &&
      MYT.filters['transaction-history'].type !== 'Deposit') {
    MYT.filters['transaction-history'].type = 'All';
  }

  mytSwitchTab(MYT.currentTab, document.querySelector(`.myt-tab[data-tab="${MYT.currentTab}"]`));

  // [v7 FIX] ตรวจทุก history type — ถ้า ว่างแม้แค่อย่างเดียว → fetch ทั้งหมดจาก GAS (1 call)
  // เปลี่ยนจาก AND เป็น OR ให้ fetch เสมอเมื่อมีอย่างน้อย 1 type ว่าง
  const _anyHistEmpty = !HIST.transactionHistory.length ||
                        !HIST.tradeHistory.length       ||
                        !HIST.positionHistory.length    ||
                        !HIST.fundingFee.length         ||
                        !HIST.spotTradeHistory.length;
  if (_anyHistEmpty) {
    if (typeof _astFetchAllHistoryIfEmpty === 'function') _astFetchAllHistoryIfEmpty();
  }
}
function closeMyTrades(){
  document.getElementById('myTradesOverlay').classList.remove('open');
}

function mytRefreshIfOpen(){
  const ov = document.getElementById('myTradesOverlay');
  if(ov && ov.classList.contains('open')){
    mytRenderFilter(MYT.currentTab);
    mytRenderContent(MYT.currentTab);
  }
  // [FIX Bug2] badge count ของ Open Orders tab ใช้ filter เดียวกับ renderPositions
  // (earnContractId + hideOthers) ให้ตรงกับ Positions badge
  const countEl = document.getElementById('mytOOCount');
  if(countEl && typeof S !== 'undefined') {
    let cnt = S.positions;
    if (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId) {
      cnt = cnt.filter(p => p.earnContractId === selectedEarnContractId);
    }
    if (S.hideOthers) cnt = cnt.filter(p => p.symbol === S.symbol);
    // รวม pending limit orders ด้วย
    let pendCnt = S.openOrders || [];
    if (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId) {
      pendCnt = pendCnt.filter(o => o.earnContractId === selectedEarnContractId);
    }
    if (S.hideOthers) pendCnt = pendCnt.filter(o => o.symbol === S.symbol);
    countEl.textContent = cnt.length + pendCnt.length;
  }
}

function mytSwitchTab(tab, el){
  MYT.currentTab = tab;
  document.querySelectorAll('.myt-tab').forEach(t => t.classList.remove('active'));
  if(el) el.classList.add('active');
  // scroll tab into view
  if(el) el.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
  mytUpdateHeaderIcons(tab);
  mytRenderFilter(tab);
  mytRenderContent(tab);
  // [v5 FIX ปัญหา1] auto-fetch จาก GAS เมื่อ history tab ว่าง
  // ครอบทุก tab ไม่ใช่แค่ transaction-history
  const _histEmpty = {
    'transaction-history': () => !HIST.transactionHistory.length,
    'trade-history':       () => !HIST.tradeHistory.length,
    'position-history':    () => !HIST.positionHistory.length,
    'funding-fee':         () => !HIST.fundingFee.length,
    'spot-trade-history':  () => !HIST.spotTradeHistory.length,
  };
  if (_histEmpty[tab] && _histEmpty[tab]()) {
    if (typeof _astFetchAllHistoryIfEmpty === 'function') {
      _astFetchAllHistoryIfEmpty();
    } else if (typeof _astFetchTransactionsIfEmpty === 'function') {
      _astFetchTransactionsIfEmpty();
    }
  }
}

function mytUpdateHeaderIcons(tab){
  const showDl   = ['order-history','position-history','trade-history','transaction-history','funding-fee','spot-order-history','spot-trade-history'].includes(tab);
  const showMenu = ['order-history','trade-history','spot-order-history','spot-trade-history'].includes(tab);
  const showChart= ['trade-history'].includes(tab);
  document.getElementById('mytDlBtn').style.display    = showDl    ? 'flex' : 'none';
  document.getElementById('mytMenuBtn').style.display  = showMenu  ? 'flex' : 'none';
  document.getElementById('mytChartBtn').style.display = showChart ? 'flex' : 'none';
}

function _origMytRenderFilter(tab){
  const area = document.getElementById('mytFilterArea');
  const f = MYT.filters[tab];
  let html = '';

  if(tab === 'open-orders'){
    // [FIX Bug2] count ใช้ filter เดียวกับ getData('open-orders') คือกรอง earnContractId + hideOthers
    let _cntPos = (typeof S !== 'undefined' ? S.positions : []);
    if (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId) {
      _cntPos = _cntPos.filter(p => p.earnContractId === selectedEarnContractId);
    }
    if (typeof S !== 'undefined' && S.hideOthers) _cntPos = _cntPos.filter(p => p.symbol === S.symbol);
    let _cntOrd = (typeof S !== 'undefined' && S.openOrders) ? S.openOrders : [];
    if (typeof selectedEarnContractId !== 'undefined' && selectedEarnContractId) {
      _cntOrd = _cntOrd.filter(o => o.earnContractId === selectedEarnContractId);
    }
    if (typeof S !== 'undefined' && S.hideOthers) _cntOrd = _cntOrd.filter(o => o.symbol === S.symbol);
    const _totalOO = _cntPos.length + _cntOrd.length;
    html = `
    <div class="myt-basic-bar">
      <div class="myt-bc-btn ${f.basicCond==='basic'?'active':''}" onclick="mytSetBasicCond('basic')">Basic (${_totalOO})</div>
      <div class="myt-bc-btn ${f.basicCond==='conditional'?'active':''}" onclick="mytSetBasicCond('conditional')">Conditional (0)</div>
      <div class="myt-info-ico">ⓘ</div>
    </div>
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytPairSheet('open-orders')">
        ${f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair'} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('open-orders','orderType',['All','Limit','Market','Stop Limit','Stop Market'])">
        Order Type <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <div class="myt-cancel-all-btn" onclick="mytCancelAll()">Cancel All</div>
      </div>
    </div>`;
  } else if(tab === 'order-history'){
    const pairLbl = f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair';
    const dirLbl  = f.direction && f.direction !== 'All' ? f.direction : 'Direction';
    const stLbl   = f.status && f.status !== 'All' ? f.status : 'Status';
    const otLbl   = f.orderType && f.orderType !== 'All' ? f.orderType : 'Order Type';
    html = `
    <div class="myt-basic-bar">
      <div class="myt-bc-btn active">Basic</div>
      <div class="myt-bc-btn">Conditional</div>
      <div class="myt-info-ico">ⓘ</div>
    </div>
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytPairSheet('order-history')">
        ${pairLbl} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('order-history','orderType',['All','Limit','Market','Stop Limit','Stop Market','Trailing Stop','Limit Maker'])">
        ${otLbl} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDirSheet('order-history')">
        ${dirLbl} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('order-history','status',['All','Filled','Partially Filled','Cancelled','Expired','STP Expired','Rejected'])">
        ${stLbl} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('order-history')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
  } else if(tab === 'position-history'){
    html = `
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytPairSheet('position-history')">
        ${f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair'} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('position-history','mode',['All','Cross','Isolated'])">
        Mode <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('position-history','status',['All','Closed','Partially Closed'])">
        Status <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('position-history')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
  } else if(tab === 'trade-history'){
    html = `
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytPairSheet('trade-history')">
        ${f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair'} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDirSheet('trade-history')">
        ${f.direction && f.direction !== 'All' ? f.direction : 'Direction'} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('trade-history')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
  } else if(tab === 'transaction-history'){
    html = `
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytDD('transaction-history','asset',['All','USDT','BNB','BTC','ETH'])">
        Asset <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-btn" onclick="openMytDD('transaction-history','type',_mytGetTypeOptions())">
        Type <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('transaction-history')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
  } else if(tab === 'funding-fee'){
    html = `
    <div class="myt-filter-bar">
      <div class="myt-filter-btn" onclick="openMytDD('funding-fee','asset',['All','USDT','BNB'])">
        Asset <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('funding-fee')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
  }
  area.innerHTML = html;
}

function _origMytRenderContent(tab){
  const el = document.getElementById('mytContent');
  const items = MYT.getData(tab);
  // update open orders count badge
  if(tab === 'open-orders'){
    const countEl = document.getElementById('mytOOCount');
    if(countEl) countEl.textContent = items.length;
  }
  if(!items.length){ el.innerHTML = `<div class="myt-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" style="color:var(--t3)"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><span>No records</span></div>`; return; }

  let html = '';
  if(tab === 'open-orders'){
    items.forEach(d => {
      // [FIX Bug4] แยก pending limit orders (รอ fill) กับ active positions (filled แล้ว)
      // pending: มี progress bar 0% + cancel ผ่าน cancelOrder()
      // active: มี progress bar 100% + cancel ผ่าน openCloseConfirm()
      const isPending = d._isLimitPending;
      const statusBadgeHtml = isPending
        ? `<span style="font-size:9px;font-weight:700;color:var(--y);background:rgba(240,185,11,0.12);border:1px solid rgba(240,185,11,0.3);padding:1px 5px;border-radius:3px;margin-left:4px">Pending</span>`
        : `<span style="font-size:9px;font-weight:700;color:var(--g);background:rgba(14,203,129,0.1);border:1px solid rgba(14,203,129,0.25);padding:1px 5px;border-radius:3px;margin-left:4px">Active</span>`;
      const cancelAction = isPending
        ? `cancelOrder(${d._posId})`
        : `openCloseConfirm('${d._posId}')`;
      const cancelLabel = isPending ? 'Cancel' : 'Close';
      html += `<div class="myt-item">
        <div class="myt-item-header">
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge}</span>
          ${statusBadgeHtml}
          <span class="myt-share-ico" ${isPending ? '' : `onclick="openShareCard('${d._posId}')"`} style="${isPending ? 'opacity:0.3;pointer-events:none' : 'cursor:pointer'}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
            <div class="myt-progress-wrap">
              <span class="myt-progress-pct">${d.pct}%</span>
              <div class="myt-progress-bar-track"><div class="myt-progress-bar-fill" style="width:${d.pct}%"></div></div>
            </div>
            <div class="myt-cancel-btn" onclick="${cancelAction}">${cancelLabel}</div>
          </div>
        </div>
        <div class="myt-direction ${d.dirClass}">${d.dir} &nbsp;<span style="color:var(--t3);font-weight:400;font-size:11px">${d.time}</span></div>
        <div class="myt-row"><span class="myt-lbl">Filled / Amount (${d.unit})</span><span class="myt-val">${d.filled} / ${d.amount}</span></div>
        <div class="myt-row"><span class="myt-lbl">Price</span><span class="myt-val">${d.price}</span></div>
        <div class="myt-row"><span class="myt-lbl">Reduce Only</span><span class="myt-val">${d.reduceOnly}</span></div>
      </div>`;
    });
  } else if(tab === 'order-history'){
    items.forEach(d => {
      html += `<div class="myt-item">
        <div class="myt-item-header">
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge}</span>
          <span class="myt-arrows-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transform:rotate(180deg)"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span>
          <span class="myt-timestamp">${d.time}</span>
          <span class="myt-arr-ico">›</span>
        </div>
        <div class="myt-direction ${d.dirClass}">${d.dir}</div>
        <div class="myt-row"><span class="myt-lbl">Amount (${d.coin.replace('USDT','').replace('PERP','')})</span><span class="myt-val">${d.amount}</span></div>
        <div class="myt-row"><span class="myt-lbl">Price</span><span class="myt-val">${d.price}</span></div>
        ${d.reduceOnly ? `<div class="myt-row"><span class="myt-lbl">Reduce Only</span><span class="myt-val">${d.reduceOnly}</span></div>` : ''}
        <div class="myt-row"><span class="myt-lbl">Status</span><span class="myt-val myt-status filled">${d.status}</span></div>
      </div>`;
    });
  } else if(tab === 'position-history'){
    html += `<div style="padding:8px 12px;font-size:11px;color:var(--t2);border-bottom:1px solid var(--border)">Last updated: ${new Date().toISOString().replace('T',' ').slice(0,19)}</div>
    <div style="padding:8px 12px 4px;font-size:11px;color:var(--t3);border-bottom:1px solid var(--border)">* Due to data complexity, there may be some delay. Please scroll down to refresh and update the data.</div>`;
    items.forEach(d => {
      const pnlClass = parseFloat(d.realizedPnl) >= 0 ? 'green' : 'red';
      const roiClass = parseFloat(d.roi) >= 0 ? 'green' : 'red';
      html += `<div class="myt-item">
        <div class="myt-pos-header">
          <div class="myt-side-badge ${d.side}">${d.side==='short'?'S':'L'}</div>
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge}</span>
          <span class="myt-lev-badge">${d.mode}</span>
          <span class="myt-arrows-ico" style="margin-left:6px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transform:rotate(180deg)"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span>
          <span style="margin-left:auto;font-size:12px;color:var(--t2)">${d.status}</span>
          <span class="myt-share-ico" style="margin-left:8px;cursor:pointer" onclick="openPosHistShareCard('${d.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></span>
        </div>
        <div class="myt-grid">
          <div class="myt-grid-item"><span class="myt-lbl">Realized PNL (USDT)</span><span class="myt-lbl" style="font-size:11px">ROI</span></div>
          <div class="myt-grid-item center"><span class="myt-val ${pnlClass}" style="font-size:14px;font-weight:700">${parseFloat(d.realizedPnl)>=0?'+':''}${d.realizedPnl}</span><span class="myt-val ${roiClass}">${parseFloat(d.roi)>=0?'+':''}${d.roi}%</span></div>
          <div class="myt-grid-item right"><span class="myt-lbl">Closed Vol. (${d.coin.replace('USDT','')})</span><span class="myt-val">${d.closedVol}</span></div>
        </div>
        <div style="height:8px"></div>
        <div class="myt-row"><span class="myt-lbl">Avg. Entry Price</span><span class="myt-lbl" style="text-align:center;flex:1">Avg. Close Price</span><span class="myt-lbl">Max OI (${d.coin.replace('USDT','')})</span></div>
        <div class="myt-row"><span class="myt-val">${d.avgEntry}</span><span class="myt-val" style="flex:1;text-align:center">${d.avgClose}</span><span class="myt-val">${d.maxOI}</span></div>
        ${d.unrealizedPnl ? `<div class="myt-row" style="margin-top:4px"><span class="myt-lbl">Unrealized PNL (USDT)</span><span class="myt-val red">${d.unrealizedPnl}</span></div>` : ''}
        <div class="myt-row" style="margin-top:4px"><span class="myt-lbl">Opened</span><span class="myt-val">${d.opened}</span></div>
        <div class="myt-row"><span class="myt-lbl">Closed (Lasting ${d.lasting})</span><span class="myt-val">${d.closed}</span></div>
      </div>`;
    });
  } else if(tab === 'trade-history'){
    items.forEach(d => {
      const dirLabel = d.dir === 'Buy' ? 'Buy' : 'Sell';
      html += `<div class="myt-item">
        <div class="myt-item-header">
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge}</span>
          <span class="myt-arrows-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transform:rotate(180deg)"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span>
          <span class="myt-timestamp">${d.time}</span>
          <span class="myt-arr-ico">›</span>
        </div>
        <div class="myt-direction ${d.dirClass}">${dirLabel}</div>
        <div class="myt-row"><span class="myt-lbl">Order No.</span><span class="myt-val" style="font-size:11px">${d.orderNo}<span class="myt-copy-ico" onclick="mytCopy('${d.orderNo}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span></span></div>
        <div class="myt-row"><span class="myt-lbl">Price</span><span class="myt-val">${d.price}</span></div>
        <div class="myt-row"><span class="myt-lbl">Filled (${d.coin.replace('USDT','')})</span><span class="myt-val">${d.filled}</span></div>
        <div class="myt-row"><span class="myt-lbl">Fee (USDT)</span><span class="myt-val">${d.fee}</span></div>
        <div class="myt-row"><span class="myt-lbl">Role</span><span class="myt-val">${d.role}</span></div>
        <div class="myt-row"><span class="myt-lbl">Realized PNL (USDT)</span><span class="myt-val ${parseFloat(d.realizedPnl)>0?'green':''}">${parseFloat(d.realizedPnl)>0?'+':''}${d.realizedPnl}</span></div>
      </div>`;
    });
  } else if(tab === 'transaction-history'){
    items.forEach(d => {
      const amtClass = d.amount.startsWith('+') ? 'green' : 'red';
      // [v9.5 FIX] รายการ Withdraw กดดูรายละเอียด (Withdrawal Details popup) ได้
      const isWithdraw = d.type === 'Withdraw';
      const clickAttr = isWithdraw ? ` onclick="mytOpenWithdrawDetail('${d.id}')" style="cursor:pointer"` : '';
      html += `<div class="myt-item"${clickAttr}>
        <div class="myt-row" style="margin-bottom:6px">
          <span class="myt-fund-asset">${d.asset}</span>
          <span class="myt-timestamp">${d.time}</span>
        </div>
        <div class="myt-row"><span class="myt-lbl">Type</span><span class="myt-val">${d.type}</span></div>
        <div class="myt-row"><span class="myt-lbl">Symbol</span><span class="myt-val">${d.symbol}</span></div>
        <div class="myt-row"><span class="myt-lbl">Amount</span><span class="myt-val ${amtClass}">${d.amount}</span></div>
      </div>`;
    });
  } else if(tab === 'funding-fee'){
    items.forEach(d => {
      const amtClass = d.amount.startsWith('+') ? 'green' : 'red';
      html += `<div class="myt-item">
        <div class="myt-row" style="margin-bottom:6px">
          <span class="myt-fund-asset">${d.asset}</span>
          <span class="myt-timestamp">${d.time}</span>
        </div>
        <div class="myt-row"><span class="myt-lbl">Symbol</span><span class="myt-val">${d.symbol}</span></div>
        <div class="myt-row"><span class="myt-lbl">Amount</span><span class="myt-val ${amtClass}">${d.amount}</span></div>
      </div>`;
    });
  }
  el.innerHTML = html;
}

/* ── Dropdown Filter ── */
// ══════════════════════════════════════════════════════════════
//  DYNAMIC OPTIONS — ดึง unique values จาก HIST จริง
//  fallback ไปยัง staticFallback ถ้าข้อมูลยังว่าง
// ══════════════════════════════════════════════════════════════
function _dynOpts(tab, key, staticFallback) {
  // แหล่งข้อมูลสำหรับแต่ละ tab+key
  const sources = {
    // open-orders: ดึงจาก live S.positions + S.openOrders (ไม่ใช่ HIST ซึ่งเป็น closed orders)
    'open-orders|orderType': () => {
      const livePosTypes = (typeof S !== 'undefined' ? S.positions  || [] : []).map(p => p.type).filter(Boolean);
      const liveOrdTypes = (typeof S !== 'undefined' ? S.openOrders || [] : []).map(o => o.type).filter(Boolean);
      return [...livePosTypes, ...liveOrdTypes];
    },
    // order-history
    'order-history|orderType':       () => HIST.orderHistory.map(d => d.orderType).filter(Boolean),
    'order-history|status':          () => HIST.orderHistory.map(d => d.status).filter(Boolean),
    // position-history
    'position-history|mode':         () => HIST.positionHistory.map(d => d.mode).filter(Boolean),
    'position-history|status':       () => HIST.positionHistory.map(d => d.status).filter(Boolean),
    // trade-history (direction)
    'trade-history|direction':       () => HIST.tradeHistory.map(d => d.dir).filter(Boolean),
    // transaction-history
    'transaction-history|asset':     () => HIST.transactionHistory.map(d => d.asset).filter(Boolean),
    'transaction-history|type':      () => HIST.transactionHistory.map(d => d.type).filter(Boolean),
    // funding-fee
    'funding-fee|asset':             () => HIST.fundingFee.map(d => d.asset).filter(Boolean),
    // spot
    'spot-order-history|status':     () => HIST.spotOrderHistory.map(d => d.status).filter(Boolean),
    'spot-order-history|direction':  () => HIST.spotOrderHistory.map(d => d.dir).filter(Boolean),
    'spot-trade-history|direction':  () => HIST.spotTradeHistory.map(d => d.dir).filter(Boolean),
  };
  const srcKey = tab + '|' + key;
  const fromData = sources[srcKey] ? sources[srcKey]() : [];
  const unique   = [...new Set(fromData)].sort();
  // merge: fallback ก่อน (ลำดับชัด) + unique values ที่มาจากข้อมูลจริงที่ไม่อยู่ใน fallback
  const merged = [...new Set([...staticFallback, ...unique])];
  return merged;
}

// ── Dynamic Type Options สำหรับ Transaction History ──
// คำนวณ unique type จากข้อมูลจริงใน HIST.transactionHistory เสมอ
// ไม่มี hardcoded list — type ใหม่ที่ GAS เพิ่มภายหลังจะโผล่เองอัตโนมัติ
function _mytGetTypeOptions() {
  const types = [...new Set(
    (HIST.transactionHistory || []).map(t => t.type).filter(Boolean)
  )].sort();
  return ['All', ...types];
}

function openMytDD(tab, key, options){
  // ใช้ dynamic options ที่ merge จาก HIST จริง + static fallback
  const dynOptions = _dynOpts(tab, key, options);
  MYT.ddCurrent = { tab, key, options: dynOptions };
  document.getElementById('mytDDTitle').textContent = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g,' $1');
  const cur = MYT.filters[tab][key];
  let html = '';
  dynOptions.forEach(opt => {
    const sel = opt === cur;
    html += `<div class="myt-dd-option ${sel?'selected':''}" onclick="mytDDSelect('${opt}')">
      ${opt}
      ${sel ? '<span class="myt-dd-check">✓</span>' : ''}
    </div>`;
  });
  document.getElementById('mytDDOptions').innerHTML = html;
  document.getElementById('mytDDPanel').style.display = 'block';
  document.getElementById('mytDDOverlay').classList.add('open');
}
function closeMytDD(){
  document.getElementById('mytDDOverlay').classList.remove('open');
  document.getElementById('mytDDPanel').style.display = 'none';
  MYT.ddCurrent = null;
}
function mytDDSelect(val){
  if(!MYT.ddCurrent) return;
  if (MYT.ddCurrent._isTxf) {
    // [FIX Bug1] TXF dropdown: เขียน TXF.from / TXF.to / TXF.coin
    // แล้วอัปเดต label ใน filter sheet — ไม่แตะ MYT.filters
    const field = MYT.ddCurrent.key;
    TXF[field] = val;
    const labelId = field === 'from' ? 'txf-from-label'
                  : field === 'to'   ? 'txf-to-label'
                  :                    'txf-coin-label';
    const el = document.getElementById(labelId);
    if (el) el.textContent = val;
    closeMytDD();
    return; // ไม่ re-render MYT content — user ยังไม่กด Confirm
  }
  MYT.filters[MYT.ddCurrent.tab][MYT.ddCurrent.key] = val;
  closeMytDD();
  mytRenderFilter(MYT.currentTab);
  mytRenderContent(MYT.currentTab);
}
function mytDDReset(){
  if(!MYT.ddCurrent) return;
  const opts = MYT.ddCurrent.options;
  if(opts.includes('All')) mytDDSelect('All');
  else mytDDSelect(opts[0]);
}

/* ── Basic / Conditional toggle ── */
function mytSetBasicCond(val){
  MYT.filters['open-orders'].basicCond = val;
  mytRenderFilter('open-orders');
  mytRenderContent('open-orders');
}

/* ── Cancel ── */
function mytCancelOrder(posId){
  if(typeof S === 'undefined') return;
  const p = S.positions.find(x => x.id == posId);
  if(!p){ showToast('Order not found'); return; }
  S.positions = S.positions.filter(x => x.id != posId);
  delete HIST._openPosRegistry[posId];
  // log cancelled order
  HIST.orderHistory.unshift({
    id: HIST.genId(), coin: p.symbol||(p.coin+'USDT'), symbol: p.symbol||(p.coin+'USDT'), badge:'Perp',
    orderType: p.type||'Limit', dir: (p.type||'Limit')+' / '+(p.side==='long'?'Open Long':'Open Short'),
    dirClass: p.side==='long'?'open-long':'open-short',
    time: HIST.fmtTime(Date.now()), ts: Date.now(),
    amount: HIST.fmtNum(p.size)+'/0.000',
    price: HIST.fmtPrice(p.entry)+'/—',
    status: 'Cancelled',
  });
  renderPositions && renderPositions();
  _updatePosBadge();
  mytRenderFilter('open-orders');
  mytRenderContent('open-orders');
  showToast('✅ Order cancelled');
}
function mytCancelAll(){
  if(typeof S === 'undefined') return;
  const count = S.positions.length;
  if(!count){ showToast('No open orders'); return; }
  S.positions.forEach(p => {
    HIST._openPosRegistry[p.id] && delete HIST._openPosRegistry[p.id];
    HIST.orderHistory.unshift({
      id: HIST.genId(), coin: p.symbol||(p.coin+'USDT'), symbol: p.symbol||(p.coin+'USDT'), badge:'Perp',
      orderType: p.type||'Limit', dir: (p.type||'Limit')+' / '+(p.side==='long'?'Open Long':'Open Short'),
      dirClass: p.side==='long'?'open-long':'open-short',
      time: HIST.fmtTime(Date.now()), ts: Date.now(),
      amount: HIST.fmtNum(p.size)+'/0.000', price: HIST.fmtPrice(p.entry)+'/—',
      status: 'Cancelled',
    });
  });
  S.positions = [];
  renderPositions && renderPositions();
  _updatePosBadge();
  mytRenderFilter('open-orders');
  mytRenderContent('open-orders');
  showToast('✅ Cancelled all ' + count + ' orders');
}

/* ── Copy ── */
function mytCopy(text){
  navigator.clipboard && navigator.clipboard.writeText(text);
  showToast('Copied');
}

// ══════════════════════════════════════
//  MY TRADES — Context Switcher (Futures / Spot / Assets)
// ══════════════════════════════════════

const MYT_CONTEXTS = {
  futures: {
    label: 'USD⑤-M Futures',
    tabs: [
      { id:'open-orders',        label:'Open Orders', count:'mytOOCount' },
      { id:'order-history',      label:'Order History' },
      { id:'position-history',   label:'Position History' },
      { id:'trade-history',      label:'Trade History' },
      { id:'transaction-history',label:'Transaction History' },
      { id:'funding-fee',        label:'Funding Fee' },
    ],
    defaultTab: 'open-orders',
  },
  spot: {
    label: 'Spot',
    tabs: [
      { id:'spot-order-history', label:'Order History' },
      { id:'spot-trade-history', label:'Trade History' },
    ],
    defaultTab: 'spot-order-history',
  },
  assets: {
    label: 'Assets',
    tabs: [
      { id:'transaction-history',label:'Transaction History' },
    ],
    defaultTab: 'transaction-history',
  },
};

function mytToggleContextMenu() {
  const overlay = document.getElementById('mytContextMenuOverlay');
  const menu = document.getElementById('mytContextMenu');
  const chevron = document.getElementById('mytTitleChevron');
  const isOpen = menu.style.display === 'block';
  if (isOpen) {
    mytCloseContextMenu();
  } else {
    // Build left column active states
    document.getElementById('mytCtxLeft1').style.color = MYT.context === 'futures' ? 'var(--t1)' : 'var(--t2)';
    document.getElementById('mytCtxLeft1').style.fontWeight = MYT.context === 'futures' ? '600' : '400';
    document.getElementById('mytCtxLeft2').style.color = (MYT.context === 'spot' || MYT.context === 'assets') ? 'var(--t1)' : 'var(--t2)';
    document.getElementById('mytCtxLeft2').style.fontWeight = (MYT.context === 'spot' || MYT.context === 'assets') ? '600' : '400';
    // Build right column — show My Trades sub-options for left1, Assets sub for left2
    const rightCtx = MYT.context === 'futures' ? 'futures' : (MYT.context === 'spot' ? 'spot' : 'assets');
    mytCtxShowRight(rightCtx);
    overlay.style.display = 'block';
    menu.style.display = 'block';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
}

function mytCtxShowRight(ctx) {
  const right = document.getElementById('mytCtxRight');
  // For My Trades (left1): show Futures / Spot options
  if (ctx === 'futures' || ctx === 'spot') {
    right.innerHTML = `
      <div onclick="mytSetContext('futures')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:${MYT.context==='futures'?'var(--y)':'var(--t2)'};font-weight:${MYT.context==='futures'?'600':'400'}">USD⑤-M Futures</div>
      <div onclick="mytSetContext('spot')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:${MYT.context==='spot'?'var(--y)':'var(--t2)'};font-weight:${MYT.context==='spot'?'600':'400'}">Spot</div>
    `;
  } else {
    // For Assets (left2): show Deposit/Withdraw/Transfer as Transaction History types
    right.innerHTML = `
      <div onclick="mytSetContextAssets('All')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:var(--t2)">Overall</div>
      <div onclick="mytSetContextAssets('Deposit')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:var(--t2)">Deposit</div>
      <div onclick="mytSetContextAssets('Withdraw')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:var(--t2)">Withdraw</div>
      <div onclick="mytSetContextAssets('Transfer')" style="padding:14px 20px;font-size:14px;cursor:pointer;color:var(--t2)">Transfer</div>
    `;
  }
}

function mytCloseContextMenu() {
  document.getElementById('mytContextMenuOverlay').style.display = 'none';
  document.getElementById('mytContextMenu').style.display = 'none';
  const chevron = document.getElementById('mytTitleChevron');
  if (chevron) chevron.style.transform = 'rotate(0deg)';
}

function mytSetContext(ctx) {
  mytCloseContextMenu();
  MYT.context = ctx;
  const cfg = MYT_CONTEXTS[ctx];
  // Update subtitle label
  document.getElementById('mytContextLabel').textContent = cfg.label;
  // Rebuild tabs row
  const tabsRow = document.getElementById('mytTabsRow');
  tabsRow.innerHTML = cfg.tabs.map((t, i) =>
    `<div class="myt-tab${i===0?' active':''}" data-tab="${t.id}" onclick="mytSwitchTab('${t.id}',this)">${t.label}${t.count?`<span class="myt-tab-count" id="${t.count}">${typeof S!=='undefined'?S.positions.length:0}</span>`:''}</div>`
  ).join('');
  mytSwitchTab(cfg.defaultTab, tabsRow.querySelector('.myt-tab'));
}

function mytSetContextAssets(typeFilter) {
  mytCloseContextMenu();
  MYT.context = 'assets';
  const cfg = MYT_CONTEXTS.assets;
  document.getElementById('mytContextLabel').textContent = cfg.label;
  const tabsRow = document.getElementById('mytTabsRow');
  tabsRow.innerHTML = cfg.tabs.map((t, i) =>
    `<div class="myt-tab${i===0?' active':''}" data-tab="${t.id}" onclick="mytSwitchTab('${t.id}',this)">${t.label}</div>`
  ).join('');
  // Pre-set filter
  MYT.filters['transaction-history'].type = typeFilter;
  mytSwitchTab(cfg.defaultTab, tabsRow.querySelector('.myt-tab'));
}

// ── Also update mytRenderFilter to handle spot tabs ──
function mytRenderFilter(tab) {
  if (tab === 'spot-order-history') {
    const area = document.getElementById('mytFilterArea');
    const f = MYT.filters[tab];
    const pairLbl = f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair';
    const dirLbl  = f.direction && f.direction !== 'All' ? f.direction : 'Direction';
    const stLbl   = f.status && f.status !== 'All' ? f.status : 'Status';
    area.innerHTML = `<div class="myt-filter-bar">
      <button class="myt-filter-btn" onclick="openMytPairSheet('spot-order-history')">
        ${pairLbl} <span class="myt-dd-arrow">▾</span>
      </button>
      <button class="myt-filter-btn" onclick="openMytDirSheet('spot-order-history')">
        ${dirLbl} <span class="myt-dd-arrow">▾</span>
      </button>
      <button class="myt-filter-btn" onclick="openMytDD('spot-order-history','status',['All','Filled','Partially Filled','Canceled','Expired','STP Expired','Rejected'])">
        ${stLbl} <span class="myt-dd-arrow">▾</span>
      </button>
      <div class="myt-filter-right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--t2);cursor:pointer" onclick="openMytAdvFilter('spot-order-history')"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </div>
    </div>`;
    return;
  }
  if (tab === 'spot-trade-history') {
    const area = document.getElementById('mytFilterArea');
    const f = MYT.filters[tab];
    const pairLbl = f.symbol && f.symbol !== 'All' ? f.symbol : 'Pair';
    const dirLbl  = f.direction && f.direction !== 'All' ? f.direction : 'Direction';
    area.innerHTML = `<div class="myt-filter-bar">
      <button class="myt-filter-btn" onclick="openMytPairSheet('spot-trade-history')">
        ${pairLbl} <span class="myt-dd-arrow">▾</span>
      </button>
      <button class="myt-filter-btn" onclick="openMytDirSheet('spot-trade-history')">
        ${dirLbl} <span class="myt-dd-arrow">▾</span>
      </button>
    </div>`;
    return;
  }
  // fallthrough to original for all other tabs
  _origMytRenderFilter(tab);
}

// ── Extend mytRenderContent for spot tabs ──
function mytRenderContent(tab) {
  const el = document.getElementById('mytContent');
  const items = MYT.getData(tab);

  if (tab === 'spot-order-history') {
    if (!items.length) { el.innerHTML = mytEmptyHTML(); return; }
    let html = '';
    items.forEach(d => {
      const dcls = d.dirClass === 'buy' ? 'green' : 'red';
      html += `<div class="myt-item">
        <div class="myt-row" style="margin-bottom:6px">
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge||'Spot'}</span>
          <span class="myt-timestamp">${d.time}</span>
        </div>
        <div class="myt-row"><span class="myt-lbl">Direction</span><span class="myt-val ${dcls}">${d.dir}</span></div>
        <div class="myt-row"><span class="myt-lbl">Filled/Amount</span><span class="myt-val">${d.amount}</span></div>
        <div class="myt-row"><span class="myt-lbl">Price/Avg Price</span><span class="myt-val">${d.price}</span></div>
        <div class="myt-row"><span class="myt-lbl">Status</span><span class="myt-val green">${d.status}</span></div>
      </div>`;
    });
    el.innerHTML = html;
    return;
  }

  if (tab === 'spot-trade-history') {
    if (!items.length) { el.innerHTML = mytEmptyHTML(); return; }
    let html = '';
    items.forEach(d => {
      const dcls = d.dirClass === 'buy' ? 'green' : 'red';
      html += `<div class="myt-item">
        <div class="myt-row" style="margin-bottom:6px">
          <span class="myt-coin">${d.coin}</span>
          <span class="myt-badge">${d.badge||'Spot'}</span>
          <span class="myt-timestamp">${d.time}</span>
        </div>
        <div class="myt-row"><span class="myt-lbl">Direction</span><span class="myt-val ${dcls}">${d.dir}</span></div>
        <div class="myt-row"><span class="myt-lbl">Price</span><span class="myt-val">${d.price}</span></div>
        <div class="myt-row"><span class="myt-lbl">Filled</span><span class="myt-val">${d.filled}</span></div>
        <div class="myt-row"><span class="myt-lbl">Fee</span><span class="myt-val">${d.fee}</span></div>
        <div class="myt-row"><span class="myt-lbl">Role</span><span class="myt-val">${d.role}</span></div>
        <div class="myt-row"><span class="myt-lbl">Order No.</span><span class="myt-val" style="font-size:10px;color:var(--t2)">${d.orderNo}</span></div>
      </div>`;
    });
    el.innerHTML = html;
    return;
  }

  _origMytRenderContent(tab);
}

function mytEmptyHTML() {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;color:var(--t2)">
    <svg width="64" height="64" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
      <rect x="15" y="10" width="35" height="48" rx="3"/>
      <rect x="22" y="6" width="35" height="48" rx="3"/>
      <circle cx="37" cy="35" r="10"/>
      <line x1="30" y1="35" x2="44" y2="35" stroke-width="2"/>
      <line x1="37" y1="28" x2="37" y2="42" stroke-width="2"/>
      <path d="M27 45 L22 50" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <div style="margin-top:12px;font-size:14px">No records found</div>
  </div>`;
}

// ══════════════════════════════════════
//  DATA DOWNLOAD CENTER
// ══════════════════════════════════════

const DDL = {
  dataType: 'Asset History – Transaction History',
  dataCat: 'asset',
  coins: new Set(['All']),
  accounts: new Set(['All']),
  timeRange: 'Last 24 Hours',
  format: 'PDF',
  info: new Set(['Email', 'Address', 'Name']),
  trFrom: '', trTo: '',
  generatedCount: 0,
  exports: [],
};

const DDL_ASSET_TYPES = {
  asset: [
    { label:'Transaction History', key:'Transaction History', sub: false },
    { label:'Deposit History',     key:'Deposit History', sub: false },
    { label:'Withdraw History',    key:'Withdraw History', sub: false },
    { label:'C2C History',         key:'C2C History', sub: false },
    { label:'Earn',                key:'', sub: false, header: true },
    { label:'Simple Earn',         key:'Simple Earn', sub: true },
    { label:'Advanced Earn',       key:'Advanced Earn', sub: true },
    { label:'Auto-Invest',         key:'Auto-Invest', sub: true },
    { label:'Unavailable Products',key:'Unavailable Products', sub: true },
    { label:'Convert',             key:'', sub: false, header: true },
    { label:'Order History',       key:'Convert Order History', sub: true },
    { label:'Recurring History',   key:'Convert Recurring History', sub: true },
    { label:'Referral History',    key:'Referral History', sub: false },
    { label:'Account Statement',   key:'Account Statement', sub: false },
    { label:'Loan History',        key:'Loan History', sub: false },
  ],
  trade: [
    { label:'Futures Trade History', key:'Futures Trade History', sub: false },
    { label:'Spot Trade History',    key:'Spot Trade History', sub: false },
    { label:'Order History',         key:'Trade Order History', sub: false },
  ],
};

// DDL_COINS: เริ่มต้นจาก fallback, sync จาก HIST เมื่อเปิด coin sheet
let DDL_COINS = ['All','BTC','ETH','BNB','USDT','SOL','USDC','XRP','DOGE','ADA','TRX','AVAX','LINK','DOT','MATIC'];

function _syncDDLCoins() {
  // รวม assets จาก transactionHistory + coins จาก tradeHistory + spotTradeHistory
  const fromTx    = HIST.transactionHistory.map(d => d.asset).filter(Boolean);
  const fromTrade = HIST.tradeHistory.map(d => d.coin ? d.coin.replace(/USDT$/,'') : '').filter(Boolean);
  const fromSpot  = HIST.spotTradeHistory.map(d => d.coin ? d.coin.replace(/USDT$/,'') : '').filter(Boolean);
  const fallback  = ['BTC','ETH','BNB','USDT','SOL','USDC','XRP','DOGE','ADA','TRX','AVAX','LINK','DOT','MATIC'];
  const merged    = [...new Set(['All', ...fallback, ...fromTx, ...fromTrade, ...fromSpot])].filter(Boolean);
  DDL_COINS = merged.sort((a,b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));
}

const DDL_ACCOUNTS = ['All','Spot','Cross Margin','Funding','USD⑤-M Futures','Coin-M Futures','Isolated Margin','Earn','P2P','Pool'];

function openDataDownloadCenter() {
  const pg = document.getElementById('page-data-download');
  pg.style.display = 'flex';
  ddlUpdateQuota();
  ddlRenderExports();
}
function closeDataDownloadCenter() {
  document.getElementById('page-data-download').style.display = 'none';
}

// ── DataType ──
function ddlOpenDataType() {
  ddlShowCat(DDL.dataCat, document.getElementById('ddl-cat-' + DDL.dataCat));
  document.getElementById('ddl-overlay-datatype').classList.add('open');
  document.getElementById('ddl-sheet-datatype').classList.add('open');
}
function ddlCloseDataType() {
  document.getElementById('ddl-overlay-datatype').classList.remove('open');
  document.getElementById('ddl-sheet-datatype').classList.remove('open');
}
function ddlShowCat(cat, el) {
  DDL.dataCat = cat;
  document.querySelectorAll('.ddl-dtype-cat').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  const items = DDL_ASSET_TYPES[cat] || [];
  const container = document.getElementById('ddl-dtype-items');
  container.innerHTML = items.map(it => {
    if (it.header) return `<div style="padding:10px 18px 4px;font-size:12px;color:var(--t2);font-weight:600">${it.label}</div>`;
    const sel = DDL.dataType === (cat === 'asset' ? 'Asset History – ' + it.key : 'Trade History – ' + it.key);
    const cls = 'ddl-dtype-item' + (it.sub ? ' sub' : '') + (sel ? ' selected' : '');
    return `<div class="${cls}" onclick="ddlSelectDataType('${cat}','${it.key}')">${it.label}</div>`;
  }).join('');
}
function ddlSelectDataType(cat, key) {
  DDL.dataType = (cat === 'asset' ? 'Asset History – ' : 'Trade History – ') + key;
  document.getElementById('ddl-datatype-label').textContent = DDL.dataType;
  ddlCloseDataType();
}

// ── Coin ──
function ddlOpenCoin() {
  _syncDDLCoins(); // sync จาก HIST ก่อนแสดงผล
  ddlRenderCoinList('');
  document.getElementById('ddl-overlay-coin').classList.add('open');
  document.getElementById('ddl-sheet-coin').classList.add('open');
}
function ddlCloseCoin() {
  document.getElementById('ddl-overlay-coin').classList.remove('open');
  document.getElementById('ddl-sheet-coin').classList.remove('open');
}
function ddlRenderCoinList(q) {
  const coins = DDL_COINS.filter(c => !q || c.toLowerCase().includes(q.toLowerCase()));
  const container = document.getElementById('ddl-coin-list');
  container.innerHTML = coins.map(c => {
    const checked = DDL.coins.has(c) || DDL.coins.has('All');
    return `<div class="ddl-chk-item" onclick="ddlToggleCoin('${c}')">
      <div class="ddl-chk-box ${checked ? '' : 'off'}">
        ${checked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1d22" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
      <span>${c}</span>
    </div>`;
  }).join('');
}
function ddlFilterCoins(q) { ddlRenderCoinList(q); }
function ddlToggleCoin(c) {
  if (c === 'All') { DDL.coins = new Set(['All']); }
  else {
    DDL.coins.delete('All');
    if (DDL.coins.has(c)) DDL.coins.delete(c); else DDL.coins.add(c);
    if (!DDL.coins.size) DDL.coins.add('All');
  }
  ddlRenderCoinList(document.getElementById('ddl-coin-search')?.value || '');
}
function ddlCoinReset() { DDL.coins = new Set(['All']); ddlRenderCoinList(''); }
function ddlCoinConfirm() {
  const arr = [...DDL.coins];
  document.getElementById('ddl-coin-label').textContent = arr.includes('All') ? 'All' : arr.join(', ');
  ddlCloseCoin();
}

// ── Account ──
function ddlOpenAccount() {
  ddlRenderAccountList();
  document.getElementById('ddl-overlay-account').classList.add('open');
  document.getElementById('ddl-sheet-account').classList.add('open');
}
function ddlCloseAccount() {
  document.getElementById('ddl-overlay-account').classList.remove('open');
  document.getElementById('ddl-sheet-account').classList.remove('open');
}
function ddlRenderAccountList() {
  const container = document.getElementById('ddl-account-list');
  container.innerHTML = DDL_ACCOUNTS.map(a => {
    const checked = DDL.accounts.has(a) || DDL.accounts.has('All');
    return `<div class="ddl-chk-item" onclick="ddlToggleAccount('${a}')">
      <div class="ddl-chk-box ${checked ? '' : 'off'}">
        ${checked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1d22" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
      <span>${a}</span>
    </div>`;
  }).join('');
}
function ddlToggleAccount(a) {
  if (a === 'All') { DDL.accounts = new Set(['All']); }
  else {
    DDL.accounts.delete('All');
    if (DDL.accounts.has(a)) DDL.accounts.delete(a); else DDL.accounts.add(a);
    if (!DDL.accounts.size) DDL.accounts.add('All');
  }
  ddlRenderAccountList();
}
function ddlAccountReset() { DDL.accounts = new Set(['All']); ddlRenderAccountList(); }
function ddlAccountConfirm() {
  const arr = [...DDL.accounts];
  document.getElementById('ddl-account-label').textContent = arr.includes('All') ? 'All' : arr.join(', ');
  ddlCloseAccount();
}

// ── Time Range ──
function ddlOpenTimeRange() {
  document.getElementById('ddl-overlay-timerange').classList.add('open');
  document.getElementById('ddl-sheet-timerange').classList.add('open');
  // Set today's dates
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  document.getElementById('ddl-tr-from').value = yesterday;
  document.getElementById('ddl-tr-to').value = today;
}
function ddlCloseTimeRange() {
  document.getElementById('ddl-overlay-timerange').classList.remove('open');
  document.getElementById('ddl-sheet-timerange').classList.remove('open');
}
function ddlSelectTR(el, val) {
  document.querySelectorAll('.ddl-tr-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  DDL.timeRange = val;
}
function ddlTimeRangeConfirm() {
  const f = document.getElementById('ddl-tr-from').value;
  const t = document.getElementById('ddl-tr-to').value;
  DDL.trFrom = f; DDL.trTo = t;
  const label = (DDL.timeRange === 'Customize' && f && t) ? f + ' ~ ' + t : DDL.timeRange;
  document.getElementById('ddl-timerange-label').textContent = label;
  ddlCloseTimeRange();
}

// ── Format ──
function ddlSelectFormat(fmt, el) {
  DDL.format = fmt;
  document.querySelectorAll('.ddl-fmt-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// ── Info Display ──
function ddlToggleInfo(el, key) {
  if (DDL.info.has(key)) {
    DDL.info.delete(key);
    el.classList.remove('active');
    el.textContent = el.textContent.replace(' ✓', '');
  } else {
    DDL.info.add(key);
    el.classList.add('active');
    if (!el.textContent.includes('✓')) el.textContent += ' ✓';
  }
}

// ── Generate ──
function ddlGenerate() {
  if (DDL.generatedCount >= 100) { showToast('Monthly quota exceeded'); return; }
  DDL.generatedCount++;
  ddlUpdateQuota();
  const now = new Date();
  const nowStr = now.toISOString().replace('T',' ').slice(0,19);
  // Gather real data from HIST based on selected type
  let data = [];
  const type = DDL.dataType;
  if (type.includes('Transaction History')) data = HIST.transactionHistory;
  else if (type.includes('Deposit')) data = HIST.transactionHistory.filter(d => d.type === 'Deposit');
  else if (type.includes('Withdraw')) data = HIST.transactionHistory.filter(d => d.type === 'Withdraw' || d.type === 'Withdraw Fee');
  else if (type.includes('Futures Trade')) data = HIST.tradeHistory;
  else if (type.includes('Spot Trade')) data = HIST.spotTradeHistory;
  else if (type.includes('Transfer')) data = HIST.transactionHistory.filter(d => d.type === 'Transfer');
  else if (type.includes('Loan History')) data = HIST.transactionHistory.filter(d => d.type && d.type.startsWith('Loan'));

  const exp = {
    id: Date.now(),
    type: DDL.dataType,
    format: DDL.format,
    time: nowStr,
    timeRange: DDL.timeRange,
    rows: data.length,
    status: data.length > 0 ? 'Ready' : 'No Data',
    data,
  };
  DDL.exports.unshift(exp);
  ddlRenderExports();
  showToast('✅ Export generated — ' + data.length + ' records');
}

function ddlUpdateQuota() {
  const el = document.getElementById('ddl-quota');
  if (el) el.textContent = DDL.generatedCount + '/100';
}

function ddlRenderExports() {
  const container = document.getElementById('ddl-export-list');
  if (!DDL.exports.length) {
    container.innerHTML = '<div style="padding:16px;background:var(--bg2);text-align:center;color:var(--t2);font-size:13px">No generated records yet</div>';
    return;
  }
  container.innerHTML = DDL.exports.map(exp => `
    <div class="ddl-export-item">
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${exp.type}</div>
        <div style="font-size:12px;color:var(--t2)">${exp.timeRange} · ${exp.format} · ${exp.time}</div>
        <div style="font-size:12px;color:var(--t2)">${exp.rows} record(s)</div>
      </div>
      <div style="font-size:12px;color:${exp.status==='Ready'?'var(--green)':'var(--t2)'};font-weight:600">${exp.status}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════
//  TRANSACTION HISTORY FILTER SHEET
// ══════════════════════════════════════

const TXF = { from:'All', to:'All', coin:'All', dateFrom:'', dateTo:'' };

function openTxHistFilter() {
  const today = new Date().toISOString().slice(0,10);
  const threeDaysAgo = new Date(Date.now() - 3*86400000).toISOString().slice(0,10);
  document.getElementById('txf-date-from').value = TXF.dateFrom || threeDaysAgo;
  document.getElementById('txf-date-to').value = TXF.dateTo || today;
  document.getElementById('txf-from-label').textContent = TXF.from;
  document.getElementById('txf-to-label').textContent = TXF.to;
  document.getElementById('txf-coin-label').textContent = TXF.coin;
  document.getElementById('txhist-filter-overlay').classList.add('open');
  document.getElementById('txhist-filter-sheet').classList.add('open');
}
function closeTxHistFilter() {
  document.getElementById('txhist-filter-overlay').classList.remove('open');
  document.getElementById('txhist-filter-sheet').classList.remove('open');
}
function txHistFilterReset() {
  TXF.from = 'All'; TXF.to = 'All'; TXF.coin = 'All'; TXF.dateFrom = ''; TXF.dateTo = '';
  MYT.filters['transaction-history'].type = 'All';
  MYT.filters['transaction-history'].asset = 'All';
  closeTxHistFilter();
  mytRenderFilter('transaction-history');
  mytRenderContent('transaction-history');
}
function txHistFilterConfirm() {
  TXF.dateFrom = document.getElementById('txf-date-from').value;
  TXF.dateTo = document.getElementById('txf-date-to').value;
  closeTxHistFilter();
  mytRenderContent('transaction-history');
  showToast('Filter applied');
}
function ddlTxFilterSheet(field) {
  // [FIX Bug1] ddlTxFilterSheet ต้อง update TXF.from / TXF.to / TXF.coin
  // ไม่ใช่ MYT.filters['transaction-history'].type หรือ .asset
  // แยก custom DD path ออกจาก openMytDD เพื่อกัน state ปน
  let opts;
  if (field === 'coin') {
    const fromTx = [...new Set(HIST.transactionHistory.map(d => d.asset).filter(Boolean))].sort();
    opts = [...new Set(['All','USDT','BTC','ETH','BNB','SOL', ...fromTx])];
  } else {
    opts = ['All','Spot','USD⑤-M Futures','Earn','External','Funding'];
  }

  // สร้าง ddCurrent ชี้ไปที่ TXF handler แทน MYT.filters
  MYT.ddCurrent = {
    tab: '__txf__',   // sentinel — ไม่ใช่ tab จริง กัน mytDDSelect เขียน MYT.filters
    key: field,
    options: opts,
    _isTxf: true,    // flag สำหรับ mytDDSelect ตรวจ
  };
  document.getElementById('mytDDTitle').textContent =
    field === 'from' ? 'From' : field === 'to' ? 'To' : 'Coin';
  const cur = TXF[field] || 'All';
  let html = '';
  opts.forEach(opt => {
    const sel = opt === cur;
    html += `<div class="myt-dd-option ${sel?'selected':''}" onclick="mytDDSelect('${opt}')">
      ${opt}
      ${sel ? '<span class="myt-dd-check">✓</span>' : ''}
    </div>`;
  });
  document.getElementById('mytDDOptions').innerHTML = html;
  document.getElementById('mytDDPanel').style.display = 'block';
  document.getElementById('mytDDOverlay').classList.add('open');
}

// ── Extend getData for transaction-history to respect TXF date filter ──
// (TXF date filter is now handled by advFilter getData override below)

// Init render
document.addEventListener('DOMContentLoaded', () => {
  mytRenderFilter('open-orders');
  mytRenderContent('open-orders');

  // ── ลบ Demo data seeding ออกแล้ว — ข้อมูลจริงมาจาก GAS getDashboard ──
  // ข้อมูลทั้งหมดจะถูก merge เข้า HIST เมื่อ loadDashboard() สำเร็จ
  // _mergeIntoHIST('orderHistory', ...) / _mergeIntoHIST('tradeHistory', ...) ฯลฯ

  // Init: hide chart panels that don't belong to initial active page
  const futPanel = document.getElementById('futuresChartPanel');
  const spPanel  = document.getElementById('spChartArea');
  if (spPanel) spPanel.style.display = 'none';

  function _updateFuturesPadding() {
    const scrollable = document.getElementById('futuresScrollable');
    if (!scrollable) return;
    const panel = document.getElementById('futuresChartPanel');
    const ph = panel ? panel.offsetHeight : 0;
    scrollable.style.paddingBottom = (ph + 68) + 'px';
  }
  setTimeout(_updateFuturesPadding, 300);
  window.addEventListener('resize', _updateFuturesPadding);

  // ── Drag-resize chart panel ──
  (function() {
    const MIN_CHART_H = 80;
    const MAX_CHART_H = 400;
    const handle = document.getElementById('chartDragHandle');
    const panel  = document.getElementById('futuresChartPanel');
    const wrap   = panel ? panel.querySelector('.chart-wrap') : null;
    if (!handle || !panel || !wrap) return;

    let dragging = false, startY = 0, startH = 0;

    function onStart(e) {
      dragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onEnd);
      document.addEventListener('touchmove', onMove, {passive:false});
      document.addEventListener('touchend',  onEnd);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const y  = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = startY - y; // drag up = increase height
      const newH = Math.min(MAX_CHART_H, Math.max(MIN_CHART_H, startH + dy));
      wrap.style.height = newH + 'px';
      _updateFuturesPadding();
      if (typeof drawChart === 'function') drawChart();
      if (e.cancelable) e.preventDefault();
    }
    function onEnd() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onEnd);
    }
    handle.addEventListener('mousedown',  onStart);
    handle.addEventListener('touchstart', onStart, {passive:false});
  })();
});
