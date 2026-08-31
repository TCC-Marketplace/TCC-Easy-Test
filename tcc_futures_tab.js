// ══════════════════════════════════════════════════════════════
//  ASSETS › FUTURES TAB — Dynamic Render (v49)
// ══════════════════════════════════════════════════════════════

let _aftFilterContractId = null; // null = ทั้งหมด, string = filter ตาม contractId

// ── ฟังก์ชันหลัก: เรียกทุกครั้งที่เปิด tab หรือ search/filter เปลี่ยน ──
function renderAstFuturesTab() {
  // ── 1. คำนวณยอดรวม ──
  const totalUnrealized = S.positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const totalMarginUsed = S.positions.reduce((s, p) => s + (p.margin || 0), 0);
  // [vx3 FIX-FROZEN-BAL] Sync ทุก contract รวม frozen — syncContractBalance จัดการ branch เองแล้ว
  earnContracts.forEach(c => { syncContractBalance(c); });
  // Wallet Balance = sum of all earnContracts currentBalance (staked + realized + unrealized - margin used)
  const walletBal   = earnContracts.reduce((s, c) => s + (c.currentBalance || 0), 0);
  // [v50 FIX] Margin Balance = Wallet Balance + Margin Used (เหมือน Binance: รวมเงินที่ใช้วาง margin ด้วย)
  // currentBalance = staked + realized - marginUsed + unrealized  →  marginBal = walletBal + marginUsed
  const marginBal   = walletBal + totalMarginUsed;

  // ── 2. อัปเดต header stats ──
  const fmt2 = v => v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSign = v => (v >= 0 ? '+' : '') + fmt2(v);

  _setTxt('aft-margin-bal', fmt2(marginBal));
  _setTxt('aft-margin-usd', '≈ $' + fmt2(marginBal));
  _setTxt('aft-wallet-bal', fmt2(walletBal));
  _setTxt('aft-wallet-usd', '≈ $' + fmt2(walletBal));

  const upnlEl = document.getElementById('aft-unrealized-pnl');
  const upnlUsdEl = document.getElementById('aft-unrealized-usd');
  if (upnlEl) {
    upnlEl.textContent = fmtSign(totalUnrealized);
    upnlEl.style.color = totalUnrealized >= 0 ? 'var(--g)' : 'var(--r)';
  }
  if (upnlUsdEl) {
    upnlUsdEl.textContent = '≈ $' + fmtSign(totalUnrealized);
    upnlUsdEl.style.color = totalUnrealized >= 0 ? 'var(--g)' : 'var(--r)';
  }

  // ── 3. กรอง positions ตาม search + filter ──
  const q = (document.getElementById('aft-search-inp')?.value || '').trim().toLowerCase();
  let positions = S.positions.slice();

  if (_aftFilterContractId) {
    positions = positions.filter(p => p.earnContractId === _aftFilterContractId);
  }
  if (q) {
    positions = positions.filter(p =>
      (p.symbol || '').toLowerCase().includes(q) ||
      (p.coin || '').toLowerCase().includes(q)
    );
  }

  // ── 4. Summary counts ──
  const uniqueContracts = new Set(positions.map(p => p.earnContractId).filter(Boolean));
  _setTxt('aft-pos-count', positions.length);
  _setTxt('aft-contract-count', uniqueContracts.size || (positions.length ? 1 : 0));

  // ── 5. Group by earnContractId ──
  // positions ไม่มี earnContractId → จัดเป็น group "No Contract"
  const groups = new Map();
  positions.forEach(p => {
    const key = p.earnContractId || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  // ── 6. Render list ──
  const container = document.getElementById('astFutPosList');
  if (!container) return;

  if (positions.length === 0) {
    container.innerHTML = `
      <div class="aft-empty">
        <div class="aft-empty-icon">📭</div>
        <div class="aft-empty-title">${q || _aftFilterContractId ? tccT('no_result_search') : tccT('no_position_open')}</div>
        <div class="aft-empty-sub">${q ? tccT('search_other_term') : _aftFilterContractId ? tccT('change_contract_filter') : tccT('go_futures_open')}</div>
        ${!q && !_aftFilterContractId ? `<button class="aft-empty-btn" onclick="navTo('futures')"><span data-i18n="start_trade">${tccT('start_trade')}</span></button>` : ''}
      </div>`;
    return;
  }

  let html = '';
  groups.forEach((grpPositions, key) => {
    const contract = key !== '__none__'
      ? earnContracts.find(c => c.contractId === key) : null;

    // Contract group header
    if (contract) {
      syncContractBalance(contract);
      const statusColor = contract.status === 'active' ? 'var(--g)' : contract.status === 'frozen' ? 'var(--r)' : 'var(--y)';
      const grpUnrealized = grpPositions.reduce((s, p) => s + (p.pnl || 0), 0);
      html += `
      <div class="aft-contract-hdr" onclick="aftGoContract('${contract.contractId}')">
        <div class="aft-contract-hdr-left">
          <div class="aft-contract-tag">${contract.contractId}</div>
          <div>
            <div class="aft-contract-name">${contract.planDays || '—'} ${tccT('days_plan')}</div>
            <div class="aft-contract-days" style="color:${statusColor}">${_aftStatusTh(contract.status)} · ${grpPositions.length} position</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div onclick="event.stopPropagation();_aftShareContract('${contract.contractId}')"
            style="width:28px;height:28px;border-radius:50%;background:rgba(240,185,11,.12);border:1px solid rgba(240,185,11,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s" title="Share Contract PNL"
            onmouseover="this.style.background='rgba(240,185,11,.22)'" onmouseout="this.style.background='rgba(240,185,11,.12)'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </div>
          <div class="aft-contract-bal">
            <div class="aft-contract-bal-val">${fmt2(contract.status === 'frozen' ? (contract.frozenBalance ?? contract.currentBalance) : (contract.currentBalance || 0))} <span style="font-size:10px;color:var(--t2)">USDT</span></div>
            <div class="aft-contract-bal-sub" style="color:${grpUnrealized>=0?'var(--g)':'var(--r)'}">Unreal. ${fmtSign(grpUnrealized)}</div>
          </div>
        </div>
      </div>`;
    } else if (key === '__none__' && grpPositions.length) {
      html += `
      <div class="aft-contract-hdr">
        <div class="aft-contract-hdr-left">
          <div class="aft-contract-tag" style="background:rgba(132,142,156,.15);color:var(--t2)">SPOT</div>
          <div>
            <div class="aft-contract-name">Free Positions</div>
            <div class="aft-contract-days">${grpPositions.length} position</div>
          </div>
        </div>
        <div class="aft-contract-bal">
          <div class="aft-contract-bal-sub" style="color:${grpPositions.reduce((s,p)=>s+(p.pnl||0),0)>=0?'var(--g)':'var(--r)'}">Unreal. ${fmtSign(grpPositions.reduce((s,p)=>s+(p.pnl||0),0))}</div>
        </div>
      </div>`;
    }

    // Position cards in group
    grpPositions.forEach(p => {
      const cs      = coinStyle(p.coin || 'BTC');
      const isLong  = p.side === 'long';
      const pnlPos  = (p.pnl || 0) >= 0;
      const pnlCls  = pnlPos ? 'pos' : 'neg';
      const mpVal   = parseFloat(S.coinPrices[p.coin]) || p.mark || p.entry || 0;
      const mrWarn  = (p.marginRatio || 0) > 50;

      html += `
      <div class="aft-pos-card" onclick="aftGoPosition('${p.earnContractId || ''}','${p.id}')">
        <div class="aft-pos-card-header">
          <div class="aft-pos-symbol-row">
            <div class="aft-pos-icon" style="background:${cs.bg};color:${cs.color}">${(p.coin||'?').slice(0,3)}</div>
            <div>
              <div style="display:flex;align-items:center;gap:5px">
                <span class="aft-pos-sym">${p.symbol || p.coin + 'USDT'}</span>
                <span class="aft-pos-badge">Perp</span>
              </div>
              <div style="margin-top:2px">
                <span class="aft-pos-side-lev ${isLong?'long':'short'}">${isLong?'Long':'Short'} ${p.lev || ''}x</span>
                <span style="font-size:10px;color:var(--t3);margin-left:4px">${p.mode || 'Cross'}</span>
              </div>
            </div>
          </div>
          <div class="aft-pos-pnl-blk">
            <div class="aft-pos-pnl-lbl">PNL (USDT)</div>
            <div class="aft-pos-pnl-val ${pnlCls}" id="aft-pv-${p.id}">${(p.pnl>=0?'+':'')}${fmtNum(p.pnl||0,2)}</div>
            <div class="aft-pos-pnl-roi ${pnlCls}" id="aft-rv-${p.id}">${(p.roi>=0?'+':'')}${fmtNum(p.roi||0,2)}%</div>
          </div>
        </div>
        <div class="aft-pos-grid">
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Size (${p.coin || '—'})</div>
            <div class="aft-pg-val">${fmtNum(p.size||0,3)}</div>
          </div>
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Margin (USDT)</div>
            <div class="aft-pg-val">${fmtNum(p.margin||0,2)}</div>
          </div>
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Margin Ratio</div>
            <div class="aft-pg-val ${mrWarn?'warn':''}" id="aft-mr-${p.id}">${fmtNum(p.marginRatio||0,2)}%</div>
          </div>
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Avg Entry</div>
            <div class="aft-pg-val">${fmtP(p.entry||0)}</div>
          </div>
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Mark Price</div>
            <div class="aft-pg-val" id="aft-mp-${p.id}">${fmtP(mpVal)}</div>
          </div>
          <div class="aft-pg-item">
            <div class="aft-pg-lbl">Liq. Price</div>
            <div class="aft-pg-val" style="color:var(--r)">${fmtP(p.liq||0)}</div>
          </div>
        </div>
        <div style="font-size:9px;color:var(--t3);padding:0 2px 6px;line-height:1.4">
          ${tccT('liq_price_hint')}
        </div>
        <div class="aft-pos-btns">
          <button class="aft-pos-btn trade" onclick="event.stopPropagation();aftGoPosition('${p.earnContractId||''}','${p.id}')">Trade</button>
          <button class="aft-pos-btn tpsl" onclick="event.stopPropagation();openTpslSheet('${p.id}')">TP/SL</button>
          <button class="aft-pos-btn close" onclick="event.stopPropagation();openCloseConfirm('${p.id}')">Close</button>
          <button class="aft-pos-btn" style="background:rgba(240,185,11,.12);color:var(--y);border:1px solid rgba(240,185,11,.25)" onclick="event.stopPropagation();openShareCard('${p.id}')">Share</button>
        </div>
      </div>`;
    });
  });

  container.innerHTML = html;

  // ── 7. Rebuild filter options sheet ──
  _aftBuildFilterOptions();
}

// ── Helper: set text content ──
function _setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Helper: contract status Thai ──
function _aftStatusTh(status) {
  return { active: 'ใช้งาน', frozen: 'ถูก Freeze', expired: 'หมดอายุ' }[status] || status || '—';
}

// ── Share My Futures PnL (from Assets Futures tab header) ──
function _aftOpenPnlShare() {
  // คำนวณ cumulative PNL จาก HIST
  let totalPnl = 0, wins = 0, total = 0;
  const chartData = [];
  if (typeof HIST !== 'undefined' && HIST.positionHistory) {
    let running = 0;
    HIST.positionHistory.forEach(h => {
      const pnl = parseFloat(h.realizedPnl || 0);
      totalPnl += pnl;
      running += pnl;
      chartData.push(running);
      total++;
      if (pnl > 0) wins++;
    });
  }
  // หา wallet balance รวมทุกสัญญา
  const walletBal = (typeof earnContracts !== 'undefined')
    ? earnContracts.reduce((s,c) => s + (c.stakedAmount || 0), 0) : 1000;
  const pct = walletBal > 0 ? (totalPnl / walletBal * 100) : 0;
  const winRate = total > 0 ? (wins / total * 100) : 0;

  // หาช่วงวันที่
  let period = '—';
  if (typeof HIST !== 'undefined' && HIST.positionHistory && HIST.positionHistory.length > 0) {
    const dates = HIST.positionHistory.map(h => h.opened || h.closed || '').filter(Boolean).sort();
    if (dates.length > 0) {
      const d1 = dates[0].substring(0,10);
      const d2 = dates[dates.length-1].substring(0,10);
      period = d1 + (d1 !== d2 ? ' - ' + d2 : '');
    }
  }

  openPnlShareCard({ pct, usd: totalPnl, winRate: total > 0 ? winRate : null, period, chartData });
}

// ── Share PNL ของสัญญาเฉพาะ (จากปุ่ม share บน contract header) ──
function _aftShareContract(contractId) {
  openContractPnlCard(contractId);
}

/* ── Open Contract PNL Share Card ── */
let _sccPnlData = [];
let _sccContractData = {};

function openContractPnlCard(contractId) {
  const c = earnContracts.find(x => x.contractId === contractId);
  if (!c) return;
  syncContractBalance(c);

  const cPos = S.positions.filter(p => p.earnContractId === contractId);
  let realizedPnl = 0, wins = 0, total = 0;
  const chartData = [];

  // realized PNL จาก HIST (เฉพาะสัญญานี้)
  if (typeof HIST !== 'undefined' && HIST.positionHistory) {
    let running = 0;
    HIST.positionHistory.filter(h => h.earnContractId === contractId).forEach(h => {
      const pnl = parseFloat(h.realizedPnl || 0);
      realizedPnl += pnl;
      running += pnl;
      chartData.push(running);
      total++;
      if (pnl > 0) wins++;
    });
  }

  // unrealized จาก positions ที่ยังเปิดอยู่
  const unrealized = cPos.reduce((s, p) => s + (p.pnl || 0), 0);
  const combinedPnl = realizedPnl + unrealized;

  const walletBal = c.stakedAmount || 1;
  const pct = (combinedPnl / walletBal) * 100;
  const winRate = total > 0 ? (wins / total * 100) : null;

  const now = new Date().toISOString().substring(0, 10);
  const start = c.startDate || now;
  const period = start + (start !== now ? ' - ' + now : '');

  // เก็บ data สำหรับ draw chart
  _sccPnlData = chartData;
  _sccContractData = { contractId, realizedPnl, unrealized, combinedPnl, pct, winRate, period, c, cPos };

  // Populate elements
  const now2 = new Date();
  const dt = now2.toISOString().replace('T', ' ').substring(0, 19);

  _setSccTxt('sccUname', SHARE_PROFILE.username);
  _setSccTxt('sccDt', dt);
  _setSccTxt('sccContractId', contractId);
  _setSccTxt('sccDays', (c.planDays || '—') + ' วัน');
  _setSccTxt('sccAmount', fmtM(c.stakedAmount || 0));
  _setSccTxt('sccPeriod', 'Period: ' + period);

  const pctEl = document.getElementById('sccPct');
  if (pctEl) {
    pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    pctEl.className = 'scc-pct ' + (pct >= 0 ? 'pos' : 'neg');
  }

  const realEl = document.getElementById('sccRealized');
  if (realEl) {
    realEl.textContent = (realizedPnl >= 0 ? '+' : '') + fmtM(realizedPnl);
    realEl.className = 'scc-stat-val ' + (realizedPnl >= 0 ? 'pos' : (realizedPnl < 0 ? 'neg' : 'neutral'));
  }

  const unrEl = document.getElementById('sccUnrealized');
  if (unrEl) {
    unrEl.textContent = (unrealized >= 0 ? '+' : '') + fmtM(unrealized);
    unrEl.className = 'scc-stat-val ' + (unrealized >= 0 ? 'pos' : (unrealized < 0 ? 'neg' : 'neutral'));
  }

  const pnlEl = document.getElementById('sccPnlUsd');
  if (pnlEl) {
    pnlEl.textContent = (combinedPnl >= 0 ? '+' : '') + fmtM(combinedPnl);
    pnlEl.className = 'scc-stat-val ' + (combinedPnl >= 0 ? 'pos' : 'neg');
  }

  _setSccTxt('sccWinRate', winRate != null ? winRate.toFixed(2) + '%' : '—%');

  // Open positions badge
  const badge = document.getElementById('sccOpenPosBadge');
  const badgeTxt = document.getElementById('sccOpenPosText');
  if (badge && badgeTxt) {
    if (cPos.length > 0) {
      badge.style.display = 'flex';
      badgeTxt.textContent = cPos.length + ' ' + tccT('position_still_open');
    } else {
      badge.style.display = 'none';
    }
  }

  // Avatar
  _sccSetAvatar();

  // Footer
  _setSccTxt('sccBrandName', SHARE_PROFILE.brandName);
  _setSccTxt('sccBrandSub', contractId + ' · ' + (c.planDays || '—') + ' วัน · ' + fmtM(c.stakedAmount || 0) + ' USDT');
  _setSccTxt('sccRefCode', SHARE_PROFILE.refCode);
  scGenQR('sccQr', SHARE_PROFILE.refUrl);

  _scCurrentTab = 'contract';
  scSwitchTab('contract');
  document.getElementById('shareCardOverlay').classList.add('active');
}

function _setSccTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _sccSetAvatar() {
  const avEl = document.getElementById('sccAvatar');
  if (!avEl) return;
  if (SHARE_PROFILE.avatar) {
    avEl.innerHTML = `<img src="${SHARE_PROFILE.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    avEl.innerHTML = `<img src="${TCC_LOGO_IMG}" alt="TCC" style="width:100%;height:100%;object-fit:cover;border-radius:50%;filter:brightness(1.1) contrast(1.05);">`;
  }
}

/* ── Contract PNL chart ── */
function scDrawContractChart() {
  const canvas = document.getElementById('sccChartCanvas');
  if (!canvas) return;
  const W = (canvas.parentElement.offsetWidth || (SC_CARD_W - 52));
  const H = 68;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const data = _sccPnlData.length >= 2 ? _sccPnlData : [0, 0.05, -0.03, 0.12, 0.08];
  const mn = Math.min(...data), mx = Math.max(...data);
  const rng = (mx - mn) || 1;
  const pad = 6;
  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (W - pad * 2),
    y: (H - pad) - ((d - mn) / rng) * (H - pad * 2)
  }));
  const isNeg = data[data.length - 1] <= data[0];
  const lineColor = isNeg ? '#f6465d' : '#0ecb81';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isNeg ? 'rgba(246,70,93,.25)' : 'rgba(14,203,129,.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  const lp = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor; ctx.fill();
}

// ── Navigate: คลิก position card ──
function aftGoPosition(contractId, posId) {
  // หา position เพื่อดู coin/symbol
  const p = S.positions.find(x => x.id == posId);
  if (p) {
    // Switch เหรียญใน futures
    S.coin   = p.coin || S.coin;
    S.symbol = p.symbol || (p.coin + 'USDT');
  }
  if (contractId) {
    goTradeWithContract(contractId);
  } else {
    navTo('futures');
  }
}

// ── Navigate: คลิก contract header ──
function aftGoContract(contractId) {
  if (contractId) goTradeWithContract(contractId);
}

// ── Build filter dropdown options ──
function _aftBuildFilterOptions() {
  const el = document.getElementById('aft-filter-options');
  if (!el) return;

  // รวม contracts ที่มี positions
  const usedContracts = earnContracts.filter(c =>
    S.positions.some(p => p.earnContractId === c.contractId)
  );

  let html = `
    <div class="aft-filter-option ${!_aftFilterContractId ? 'selected' : ''}" onclick="aftSetFilter(null)">
      <span>${tccT('all')} (${S.positions.length} positions)</span>
      ${!_aftFilterContractId ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;

  usedContracts.forEach(c => {
    const cnt   = S.positions.filter(p => p.earnContractId === c.contractId).length;
    const sel   = _aftFilterContractId === c.contractId;
    const statusColor = c.status === 'active' ? 'var(--g)' : c.status === 'frozen' ? 'var(--r)' : 'var(--y)';
    html += `
    <div class="aft-filter-option ${sel ? 'selected' : ''}" onclick="aftSetFilter('${c.contractId}')">
      <div>
        <div style="font-size:13px">${c.contractId} · ${c.planDays || '—'} ${tccT('days_plan')}</div>
        <div style="font-size:11px;color:${statusColor}">${_aftStatusTh(c.status)} · ${cnt} position</div>
      </div>
      ${sel ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  });

  // Free positions (ไม่มี contract)
  const freeCnt = S.positions.filter(p => !p.earnContractId).length;
  if (freeCnt > 0) {
    const sel = _aftFilterContractId === '__none__';
    html += `
    <div class="aft-filter-option ${sel ? 'selected' : ''}" onclick="aftSetFilter('__none__')">
      <div>
        <div style="font-size:13px">Free Positions</div>
        <div style="font-size:11px;color:var(--t2)">${freeCnt} position</div>
      </div>
      ${sel ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  }

  el.innerHTML = html;
}

// ── Open / Close filter sheet ──
function aftOpenFilter() {
  _aftBuildFilterOptions();
  document.getElementById('aft-filter-sheet')?.classList.add('open');
  document.getElementById('aft-filter-overlay')?.classList.add('open');
}
function aftCloseFilter() {
  document.getElementById('aft-filter-sheet')?.classList.remove('open');
  document.getElementById('aft-filter-overlay')?.classList.remove('open');
}

// ── Set filter + re-render ──
function aftSetFilter(contractId) {
  _aftFilterContractId = contractId;
  // อัปเดต button label
  const btnTxt = document.getElementById('aft-filter-btn-txt');
  const lbl    = document.getElementById('aft-filter-label');
  if (contractId === null) {
    if (btnTxt) btnTxt.textContent = tccT('all');
    if (lbl)    lbl.textContent    = 'All Contracts';
  } else if (contractId === '__none__') {
    if (btnTxt) btnTxt.textContent = 'Free';
    if (lbl)    lbl.textContent    = 'Free Positions';
  } else {
    const c = earnContracts.find(x => x.contractId === contractId);
    if (btnTxt) btnTxt.textContent = contractId;
    if (lbl)    lbl.textContent    = c ? `${contractId} · ${c.planDays || '—'} ${tccT('days_plan')}` : contractId;
  }
  aftCloseFilter();
  renderAstFuturesTab();
}

// [v49 FIX] updatePositionsPNL ถูก merge เข้าฟังก์ชันหลักใน script block แรกแล้ว
// ไม่ต้องมี wrapper patch ที่นี่อีกต่อไป
