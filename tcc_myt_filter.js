// ══════════════════════════════════════════════════════════════
//  MYT Advanced Filter Sheet (Binance-style)
// ══════════════════════════════════════════════════════════════

const MYT_ADV = {
  currentTab: 'order-history',
  pickerTarget: null,  // 'from' | 'to'
  pickerVal: { year: 2026, month: 1, day: 1 },

  ORDER_TYPES_FUTURES: ['Limit','Market','Stop Limit','Stop Market','Trailing Stop','Limit Maker','Scaled Order'],
  ORDER_TYPES_SPOT:    ['Limit','Market','Stop Limit','Stop Market','Trailing Stop','Limit Maker','Scaled Order'],
  STATUSES: ['Filled','Partially Filled','Canceled','Expired','STP Expired','Rejected'],

  getState() { return MYT.advFilter[this.currentTab]; },
};

function openMytAdvFilter(tab) {
  MYT_ADV.currentTab = tab;
  const st = MYT_ADV.getState();
  if (!st) { console.warn('No advFilter state for tab:', tab); return; }

  // Compute default dateFrom/dateTo if empty
  if (!st.dateFrom || !st.dateTo) mytAdvSetPreset(st.datePreset || '1W', true);

  // Set preset UI
  document.querySelectorAll('.myt-adv-preset').forEach(el => {
    el.classList.toggle('active', el.dataset.preset === st.datePreset);
  });

  // Set date box labels
  document.getElementById('mytAdvDateFrom').textContent = st.dateFrom;
  document.getElementById('mytAdvDateTo').textContent   = st.dateTo;

  // Show/hide Order Type & Status & Sort sections — only for order-history tabs
  const hasOT   = tab === 'order-history' || tab === 'spot-order-history';
  const hasSt   = tab === 'order-history' || tab === 'spot-order-history';
  const hasSort = tab === 'order-history';
  document.getElementById('mytAdvOTSection').style.display   = hasOT   ? '' : 'none';
  document.getElementById('mytAdvStSection').style.display   = hasSt   ? '' : 'none';
  document.getElementById('mytAdvSortSection').style.display = hasSort ? '' : 'none';

  // Render chips only when visible
  if (hasOT) {
    const otTypes = MYT_ADV.ORDER_TYPES_FUTURES;
    mytAdvRenderChips('mytAdvOTChips', otTypes, st.orderTypes, 'ot');
  }
  if (hasSt) {
    mytAdvRenderChips('mytAdvStChips', MYT_ADV.STATUSES, st.statuses, 'st');
  }

  // Sorting buttons
  const sortCreation = document.getElementById('mytSortCreation');
  const sortUpdate   = document.getElementById('mytSortUpdate');
  if (sortCreation && sortUpdate) {
    sortCreation.classList.toggle('active', st.orderSorting !== 'update');
    sortUpdate.classList.toggle('active',   st.orderSorting === 'update');
  }

  // Hide picker initially
  document.getElementById('mytAdvPickerWrap').classList.remove('show');
  document.getElementById('mytAdvDateFrom').classList.remove('editing');
  document.getElementById('mytAdvDateTo').classList.remove('editing');
  MYT_ADV.pickerTarget = null;

  document.getElementById('mytAdvFilterOverlay').classList.add('open');
  document.getElementById('mytAdvFilterSheet').classList.add('open');
}

function closeMytAdvFilter() {
  document.getElementById('mytAdvFilterOverlay').classList.remove('open');
  document.getElementById('mytAdvFilterSheet').classList.remove('open');
}

function mytAdvRenderChips(containerId, labels, selected, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = labels.map(label => {
    const isSelected = selected.length === 0 || selected.includes(label);
    return `<div class="myt-chip ${isSelected?'selected':''}" onclick="mytAdvToggleChip(this,'${label}','${type}')">
      <span>${label}</span>
      <div class="myt-chip-check">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1d22" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    </div>`;
  }).join('');
}

function mytAdvToggleChip(el, label, type) {
  const st = MYT_ADV.getState();
  const arr = type === 'ot' ? st.orderTypes : st.statuses;
  const idx = arr.indexOf(label);
  if (idx >= 0) {
    arr.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    arr.push(label);
    el.classList.add('selected');
  }
}

function mytAdvSetPreset(preset, silent) {
  const now = new Date();
  let from = new Date();
  if (preset === '1D') from.setDate(now.getDate() - 1);
  else if (preset === '1W') from.setDate(now.getDate() - 7);
  else if (preset === '1M') from.setMonth(now.getMonth() - 1);
  else if (preset === '6M') from.setMonth(now.getMonth() - 6);

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const st = MYT_ADV.getState();
  st.datePreset = preset;
  st.dateFrom = fmt(from);
  st.dateTo   = fmt(now);

  if (!silent) {
    document.querySelectorAll('.myt-adv-preset').forEach(el => el.classList.toggle('active', el.dataset.preset === preset));
    document.getElementById('mytAdvDateFrom').textContent = st.dateFrom;
    document.getElementById('mytAdvDateTo').textContent   = st.dateTo;
    // close picker if open
    document.getElementById('mytAdvPickerWrap').classList.remove('show');
    document.getElementById('mytAdvDateFrom').classList.remove('editing');
    document.getElementById('mytAdvDateTo').classList.remove('editing');
    MYT_ADV.pickerTarget = null;
  }
}

function mytAdvSetSort(val) {
  MYT_ADV.getState().orderSorting = val;
  document.getElementById('mytSortCreation').classList.toggle('active', val === 'creation');
  document.getElementById('mytSortUpdate').classList.toggle('active',   val === 'update');
}

// ── Scroll wheel date picker ──
function mytAdvTogglePicker(target) {
  const wrap = document.getElementById('mytAdvPickerWrap');
  const fromBox = document.getElementById('mytAdvDateFrom');
  const toBox   = document.getElementById('mytAdvDateTo');

  if (MYT_ADV.pickerTarget === target) {
    // close
    wrap.classList.remove('show');
    fromBox.classList.remove('editing');
    toBox.classList.remove('editing');
    MYT_ADV.pickerTarget = null;
    return;
  }

  MYT_ADV.pickerTarget = target;
  fromBox.classList.toggle('editing', target === 'from');
  toBox.classList.toggle('editing',   target === 'to');

  const st = MYT_ADV.getState();
  const dateStr = target === 'from' ? st.dateFrom : st.dateTo;
  const parts = dateStr ? dateStr.split('-') : [String(new Date().getFullYear()), '01', '01'];
  MYT_ADV.pickerVal = { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };

  mytAdvBuildPickers();
  wrap.classList.add('show');

  // Scroll to selected after render
  setTimeout(() => {
    ['Year','Month','Day'].forEach(k => mytScrollPickerToSelected(document.getElementById('mytPicker' + k)));
  }, 60);
}

function mytAdvBuildPickers() {
  const now = new Date();
  const minYear = now.getFullYear() - 1;
  const maxYear = now.getFullYear();
  // padding items so first/last can center
  const pad = `<div class="myt-scroll-picker-item" style="pointer-events:none;opacity:0">—</div><div class="myt-scroll-picker-item" style="pointer-events:none;opacity:0">—</div>`;

  // Year
  let html = pad;
  for (let y = minYear; y <= maxYear; y++) {
    html += `<div class="myt-scroll-picker-item ${y===MYT_ADV.pickerVal.year?'selected':''}" onclick="mytPickerSelect('year',${y})">${y}</div>`;
  }
  html += pad;
  document.getElementById('mytPickerYear').innerHTML = html;

  // Month
  html = pad;
  for (let m = 1; m <= 12; m++) {
    html += `<div class="myt-scroll-picker-item ${m===MYT_ADV.pickerVal.month?'selected':''}" onclick="mytPickerSelect('month',${m})">${String(m).padStart(2,'0')}</div>`;
  }
  html += pad;
  document.getElementById('mytPickerMonth').innerHTML = html;

  // Day
  const maxDay = new Date(MYT_ADV.pickerVal.year, MYT_ADV.pickerVal.month, 0).getDate();
  html = pad;
  for (let d = 1; d <= maxDay; d++) {
    html += `<div class="myt-scroll-picker-item ${d===MYT_ADV.pickerVal.day?'selected':''}" onclick="mytPickerSelect('day',${d})">${String(d).padStart(2,'0')}</div>`;
  }
  html += pad;
  document.getElementById('mytPickerDay').innerHTML = html;
}

function mytPickerSelect(field, val) {
  MYT_ADV.pickerVal[field] = val;
  // Clamp day to max
  const maxDay = new Date(MYT_ADV.pickerVal.year, MYT_ADV.pickerVal.month, 0).getDate();
  if (MYT_ADV.pickerVal.day > maxDay) MYT_ADV.pickerVal.day = maxDay;

  // Update selected styling
  if (field === 'year' || field === 'month') mytAdvBuildPickers();
  else {
    document.querySelectorAll('#mytPickerDay .myt-scroll-picker-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.textContent) === val);
    });
  }

  // Commit to state
  const fmt = () => `${MYT_ADV.pickerVal.year}-${String(MYT_ADV.pickerVal.month).padStart(2,'0')}-${String(MYT_ADV.pickerVal.day).padStart(2,'0')}`;
  const st = MYT_ADV.getState();
  if (MYT_ADV.pickerTarget === 'from') {
    st.dateFrom = fmt();
    document.getElementById('mytAdvDateFrom').textContent = st.dateFrom;
  } else {
    st.dateTo = fmt();
    document.getElementById('mytAdvDateTo').textContent = st.dateTo;
  }
  // clear preset highlight since user edited manually
  st.datePreset = '';
  document.querySelectorAll('.myt-adv-preset').forEach(el => el.classList.remove('active'));

  setTimeout(() => mytScrollPickerToSelected(document.getElementById('mytPicker' + field.charAt(0).toUpperCase() + field.slice(1))), 30);
}

function mytScrollPickerToSelected(col) {
  if (!col) return;
  const sel = col.querySelector('.selected');
  if (!sel) return;
  col.scrollTo({ top: sel.offsetTop - col.clientHeight / 2 + sel.clientHeight / 2, behavior: 'smooth' });
}

function mytAdvFilterReset() {
  const st = MYT_ADV.getState();
  st.orderTypes = [];
  st.statuses   = [];
  st.orderSorting = 'creation';
  mytAdvSetPreset('1W');
  // Re-open to refresh UI
  closeMytAdvFilter();
  setTimeout(() => openMytAdvFilter(MYT_ADV.currentTab), 50);
}

function mytAdvFilterConfirm() {
  const tab = MYT_ADV.currentTab;
  closeMytAdvFilter();
  mytRenderFilter(tab);
  mytRenderContent(tab);
  if (typeof showToast === 'function') showToast('✅ Filter applied');
}

// ── Extend getData to apply advFilter date/orderType/status ──
(function() {
  const _base = MYT.getData.bind(MYT);
  MYT.getData = function(tab) {
    let items = _base(tab);
    const adv = MYT.advFilter && MYT.advFilter[tab];
    if (!adv) return items;

    // Date filter — only apply if dateFrom is set
    if (adv.dateFrom) {
      const from = new Date(adv.dateFrom).getTime();
      const to   = adv.dateTo ? new Date(adv.dateTo).getTime() + 86400000 : Infinity;
      items = items.filter(d => !d.ts || (d.ts >= from && d.ts <= to));
    }
    // Order type multi-select (empty = All)
    if (adv.orderTypes && adv.orderTypes.length) {
      items = items.filter(d => adv.orderTypes.some(t => (d.orderType||'').toLowerCase().includes(t.toLowerCase())));
    }
    // Status multi-select (empty = All)
    if (adv.statuses && adv.statuses.length) {
      items = items.filter(d => adv.statuses.some(s => (d.status||'').toLowerCase().includes(s.toLowerCase())));
    }
    return items;
  };
})();

// ══════════════════════════════════════════════════════════════
//  MYT Pair / Symbol Search Sheet
// ══════════════════════════════════════════════════════════════

const MYT_PAIR = {
  currentTab: 'order-history',
  allPairs: [],
};

function openMytPairSheet(tab) {
  MYT_PAIR.currentTab = tab;

  // Build pairs list from HIST data
  const allSrc = [];
  if (typeof HIST !== 'undefined') {
    if (tab === 'order-history')      HIST.orderHistory.forEach(d => allSrc.push(d.coin));
    else if (tab === 'open-orders')   (typeof S !== 'undefined' ? S.positions : []).forEach(p => allSrc.push(p.symbol || p.coin + 'USDT'));
    else if (tab === 'position-history') HIST.positionHistory.forEach(d => allSrc.push(d.coin));
    else if (tab === 'trade-history') HIST.tradeHistory.forEach(d => allSrc.push(d.coin));
    else if (tab === 'spot-order-history') HIST.spotOrderHistory.forEach(d => allSrc.push(d.coin));
    else if (tab === 'spot-trade-history') HIST.spotTradeHistory && HIST.spotTradeHistory.forEach(d => allSrc.push(d.coin));
  }
  // Dedupe + add common defaults
  const defaults = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'];
  const combined = [...new Set([...allSrc.filter(Boolean), ...defaults])];
  MYT_PAIR.allPairs = combined;

  document.getElementById('mytPairSearch').value = '';
  mytPairFilter('');

  document.getElementById('mytPairOverlay').classList.add('open');
  document.getElementById('mytPairSheet').classList.add('open');
  setTimeout(() => document.getElementById('mytPairSearch').focus(), 150);
}

function closeMytPairSheet() {
  document.getElementById('mytPairOverlay').classList.remove('open');
  document.getElementById('mytPairSheet').classList.remove('open');
}

function mytPairFilter(q) {
  const tab = MYT_PAIR.currentTab;
  const cur = MYT.filters[tab] && MYT.filters[tab].symbol;
  const list = ['All', ...MYT_PAIR.allPairs.filter(p => !q || p.toLowerCase().includes(q.toLowerCase()))];
  const el = document.getElementById('mytPairList');
  el.innerHTML = list.map(pair => {
    const sel = (pair === cur) || (!cur && pair === 'All');
    return `<div class="myt-pair-item ${sel?'selected':''}" onclick="mytPairSelect('${pair}')">
      ${pair}
      ${sel ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  }).join('');
}

function mytPairSelect(pair) {
  const tab = MYT_PAIR.currentTab;
  if (MYT.filters[tab]) MYT.filters[tab].symbol = pair;
  closeMytPairSheet();
  mytRenderFilter(tab);
  mytRenderContent(tab);
}

// ══════════════════════════════════════════════════════════════
//  MYT Direction Sheet
// ══════════════════════════════════════════════════════════════

const MYT_DIR = { currentTab: 'order-history' };

function openMytDirSheet(tab) {
  MYT_DIR.currentTab = tab;
  const cur = MYT.filters[tab] && MYT.filters[tab].direction || 'All';
  const opts = ['All','Buy','Sell'];
  const el = document.getElementById('mytDirOptions');
  el.innerHTML = opts.map(opt => {
    const sel = opt === cur;
    return `<div class="myt-pair-item ${sel?'selected':''}" onclick="mytDirSelect('${opt}')">
      ${opt}
      ${sel ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  }).join('');

  document.getElementById('mytDirOverlay').classList.add('open');
  document.getElementById('mytDirSheet').classList.add('open');
}

function closeMytDirSheet() {
  document.getElementById('mytDirOverlay').classList.remove('open');
  document.getElementById('mytDirSheet').classList.remove('open');
}

function mytDirSelect(val) {
  const tab = MYT_DIR.currentTab;
  if (MYT.filters[tab]) MYT.filters[tab].direction = val;
  closeMytDirSheet();
  mytRenderFilter(tab);
  mytRenderContent(tab);
}

// ══════════════════════════════════════════════════════════════
//  SHARE CARD SYSTEM
// ══════════════════════════════════════════════════════════════

/* ── Placeholder state (ลอยไว้ — เชื่อมต่อระบบภายหลัง) ── */
const SHARE_PROFILE = {
  username: 'TCC Trader',        // ← เชื่อมต่อ profile ภายหลัง
  avatar: null,                   // ← URL รูป avatar ภายหลัง
  refCode: 'TCC-00000',          // ← referral code ภายหลัง
  refUrl: 'https://tcc.example.com/ref/TCC-00000',
  brandName: 'TRADER CAFE CLUB',
  brandSub: 'FUTURES | USD⑤-M',
};

/* ── Logo image watermark ── */
const TCC_LOGO_IMG = 'data:image/jpeg;base64,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';
const TCC_LOGO_SVG = `<img src="data:image/jpeg;base64,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" style="width:100%;height:100%;object-fit:contain;border-radius:50%;">` ;
function tccFallbackSVG(){
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <!-- outer ring -->
  <circle cx="100" cy="100" r="96" fill="#1a1200" stroke="#c8860a" stroke-width="6"/>
  <circle cx="100" cy="100" r="84" fill="#0d0d0d" stroke="#888" stroke-width="3"/>
  <!-- bear body -->
  <ellipse cx="100" cy="72" rx="38" ry="32" fill="#a06a10" opacity=".9"/>
  <circle cx="100" cy="58" r="20" fill="#b87a18"/>
  <!-- bear ears -->
  <circle cx="80" cy="46" r="9" fill="#b87a18"/>
  <circle cx="120" cy="46" r="9" fill="#b87a18"/>
  <circle cx="80" cy="46" r="5" fill="#8a5a12"/>
  <circle cx="120" cy="46" r="5" fill="#8a5a12"/>
  <!-- bear face -->
  <circle cx="93" cy="55" r="4" fill="#1a0e00"/>
  <circle cx="107" cy="55" r="4" fill="#1a0e00"/>
  <ellipse cx="100" cy="64" rx="8" ry="5" fill="#8a5a12"/>
  <!-- bear claws left -->
  <path d="M68 90 Q55 80 50 95 Q60 105 72 98 Z" fill="#c88a1a" opacity=".85"/>
  <path d="M62 95 Q48 92 46 105 Q58 112 67 103 Z" fill="#b87a14" opacity=".8"/>
  <!-- bull head lower -->
  <ellipse cx="100" cy="136" rx="36" ry="28" fill="#c8900c" opacity=".9"/>
  <circle cx="100" cy="148" r="18" fill="#d4a020"/>
  <!-- bull horns -->
  <path d="M72 132 Q55 112 62 100 Q74 108 78 126 Z" fill="#c8900c"/>
  <path d="M128 132 Q145 112 138 100 Q126 108 122 126 Z" fill="#c8900c"/>
  <!-- bull face -->
  <circle cx="94" cy="143" r="4" fill="#1a0e00"/>
  <circle cx="106" cy="143" r="4" fill="#1a0e00"/>
  <ellipse cx="100" cy="153" rx="9" ry="6" fill="#b87a10"/>
  <!-- highlights -->
  <circle cx="91" cy="52" r="2" fill="rgba(255,255,255,.4)"/>
  <circle cx="94" cy="140" r="2" fill="rgba(255,255,255,.4)"/>
</svg>`;
}

/* ── Inject overlay HTML ── */
(function injectShareOverlay() {
  const div = document.createElement('div');
  div.id = 'shareCardOverlay';
  div.innerHTML = `
    <button class="sc-close-btn" onclick="closeShareCard()">✕</button>
    <div class="sc-tab-bar">
      <button class="sc-tab active" id="scTab-trade" onclick="scSwitchTab('trade')">📊 Trade</button>
      <button class="sc-tab" id="scTab-pnl" onclick="scSwitchTab('pnl')">📈 PNL</button>
      <button class="sc-tab" id="scTab-contract" onclick="scSwitchTab('contract')">📋 Contract</button>
    </div>

    <!-- TRADE CARD -->
    <div id="scTradeCard" class="sc-card-wrap">
      <div class="sct-body">
        <div class="sct-bg-logo">${TCC_LOGO_SVG}</div>
        <div class="sct-header">
          <div class="sct-avatar" id="sctAvatar">T</div>
          <div>
            <div class="sct-uname" id="sctUname">—</div>
            <div class="sct-dt" id="sctDt">—</div>
          </div>
        </div>
        <div class="sct-symbol" id="sctSymbol">—</div>
        <div class="sct-meta">
          <span id="sctSide" class="sct-badge-long">Long</span>
          <span class="sct-meta-div">|</span>
          <span class="sct-meta-lev" id="sctLev">—</span>
        </div>
        <div class="sct-pnl pos" id="sctPnl">+0.00 <span class="unit">USDT</span></div>
        <div class="sct-prices">
          <div>
            <div class="sct-plbl">Entry Price</div>
            <div class="sct-pval" id="sctEntry">—</div>
          </div>
          <div>
            <div class="sct-plbl" id="sctPriceLbl">Last Price</div>
            <div class="sct-pval" id="sctPrice">—</div>
          </div>
        </div>
      </div>
      <div class="sct-footer">
        <div class="sct-brand">
          <div>
            <div class="sct-brand-name" id="sctBrandName">TRADER CAFE CLUB</div>
            <div class="sct-brand-sub" id="sctBrandSub">FUTURES | USD⑤-M</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="sct-ref">
            <div class="sct-ref-lbl">Referral Code</div>
            <div class="sct-ref-code" id="sctRefCode">—</div>
          </div>
          <div class="sct-qr-wrap" id="sctQr"></div>
        </div>
      </div>
    </div>

    <!-- PNL CARD -->
    <div id="scPnlCard" class="sc-card-wrap" style="display:none">
      <div class="scp-body">
        <div class="scp-bg-logo">${TCC_LOGO_SVG}</div>
        <div class="scp-title">My Futures PnL</div>
        <div class="scp-sect-lbl">Cumulative PNL %</div>
        <div class="scp-period" id="scpPeriod">Period: —</div>
        <div class="scp-pct neg" id="scpPct">0.00%</div>
        <div class="scp-chart-wrap"><canvas id="scpChartCanvas"></canvas></div>
        <div class="scp-stats">
          <div>
            <div class="scp-stat-lbl">Cumulative<br>PNL (USDT)</div>
            <div class="scp-stat-val neg" id="scpPnlUsd">0.00</div>
          </div>
          <div>
            <div class="scp-stat-lbl">Win Rate</div>
            <div class="scp-stat-val neutral" id="scpWinRate">—%</div>
          </div>
        </div>
      </div>
      <div class="scp-footer">
        <div class="sct-brand">
          <div>
            <div class="sct-brand-name" id="scpBrandName">TRADER CAFE CLUB</div>
            <div class="sct-brand-sub" id="scpBrandSub">FUTURES | USD⑤-M</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="sct-ref">
            <div class="sct-ref-lbl">Referral Code</div>
            <div class="sct-ref-code" id="scpRefCode">—</div>
          </div>
          <div class="sct-qr-wrap" id="scpQr"></div>
        </div>
      </div>
    </div>

    <!-- CONTRACT PNL CARD -->
    <div id="scContractCard" class="sc-card-wrap" style="display:none">
      <div class="scc-body">
        <div class="scc-bg-logo">${TCC_LOGO_SVG}</div>
        <!-- Header row -->
        <div class="scc-header">
          <div class="scc-avatar" id="sccAvatar">T</div>
          <div class="scc-header-info">
            <div class="scc-uname" id="sccUname">TCC Trader</div>
            <div class="scc-dt" id="sccDt">—</div>
          </div>
        </div>
        <!-- Card title -->
        <div class="scc-title">My Contract PnL</div>
        <!-- Contract tag + meta -->
        <div class="scc-contract-meta">
          <div class="scc-contract-tag" id="sccContractId">EC-—</div>
          <div class="scc-contract-details">
            <span id="sccDays">— วัน</span>
            <span class="scc-meta-sep">·</span>
            <span id="sccAmount">—</span>
            <span style="font-size:10px;color:var(--t2);margin-left:2px">USDT</span>
          </div>
        </div>
        <!-- PNL % big -->
        <div class="scc-pct-lbl">Cumulative PNL %</div>
        <div class="scc-period" id="sccPeriod">Period: —</div>
        <div class="scc-pct neg" id="sccPct">0.00%</div>
        <!-- Chart -->
        <div class="scc-chart-wrap"><canvas id="sccChartCanvas"></canvas></div>
        <!-- Stats grid -->
        <div class="scc-stats">
          <div class="scc-stat-item">
            <div class="scc-stat-lbl">Realized<br>PNL (USDT)</div>
            <div class="scc-stat-val neutral" id="sccRealized">0.00</div>
          </div>
          <div class="scc-stat-item">
            <div class="scc-stat-lbl">Unrealized<br>PNL (USDT)</div>
            <div class="scc-stat-val neutral" id="sccUnrealized">0.00</div>
          </div>
          <div class="scc-stat-item">
            <div class="scc-stat-lbl">Cumulative<br>PNL (USDT)</div>
            <div class="scc-stat-val neg" id="sccPnlUsd">0.00</div>
          </div>
          <div class="scc-stat-item">
            <div class="scc-stat-lbl">Win Rate</div>
            <div class="scc-stat-val neutral" id="sccWinRate">—%</div>
          </div>
        </div>
        <!-- Open positions badge -->
        <div class="scc-open-pos" id="sccOpenPosBadge" style="display:none">
          <span class="scc-open-dot"></span>
          <span id="sccOpenPosText">1 position ยังเปิดอยู่</span>
        </div>
      </div>
      <div class="scc-footer">
        <div class="sct-brand">
          <div>
            <div class="sct-brand-name" id="sccBrandName">TRADER CAFE CLUB</div>
            <div class="sct-brand-sub" id="sccBrandSub">CONTRACT PnL</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="sct-ref">
            <div class="sct-ref-lbl">Referral Code</div>
            <div class="sct-ref-code" id="sccRefCode">—</div>
          </div>
          <div class="sct-qr-wrap" id="sccQr"></div>
        </div>
      </div>
    </div>

    <div class="sc-actions">
      <button class="sc-btn sc-btn-dl" onclick="scDownload()">⬇ Download</button>
      <button class="sc-btn sc-btn-share" onclick="scShareNative()">⬆ Share / LINE</button>
    </div>
    <div class="sc-note" id="scShareNote">กด Share เพื่อแชร์ผ่าน LINE หรือ Download เพื่อบันทึกภาพ</div>
  `;
  document.body.appendChild(div);
  // อัพเดต note ตาม environment หลัง _scEnv พร้อม
  setTimeout(function() {
    const note = document.getElementById('scShareNote');
    if (!note) return;
    const ua = navigator.userAgent || '';
    if (/Line\//i.test(ua)) {
      note.textContent = tccT('share_note_line_or_hold');
    } else if (/FBAN|FBAV|Instagram/i.test(ua)) {
      note.textContent = tccT('share_note_download_or_hold');
    } else if (navigator.share && navigator.canShare) {
      note.textContent = tccT('share_note_line_only');
    } else {
      note.textContent = tccT('share_note_line_or_download');
    }
  }, 0);
})();

/* ── QR generator helper ── */
function scGenQR(containerId, url) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(el, { text: url, width: 56, height: 56, correctLevel: QRCode.CorrectLevel.H });
  }
}

/* ── Tab switcher ── */
let _scCurrentTab = 'trade';
function scSwitchTab(tab) {
  _scCurrentTab = tab;
  ['trade','pnl','contract'].forEach(t => {
    const el = document.getElementById('scTab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  document.getElementById('scTradeCard').style.display    = tab === 'trade'    ? '' : 'none';
  document.getElementById('scPnlCard').style.display      = tab === 'pnl'      ? '' : 'none';
  const cc = document.getElementById('scContractCard');
  if (cc) cc.style.display = tab === 'contract' ? '' : 'none';
  if (tab === 'pnl') setTimeout(scDrawPnlChart, 80);
  if (tab === 'contract') setTimeout(scDrawContractChart, 80);
}

/* ── PNL chart (รับ data array หรือ dummy) ── */
let _scPnlData = [];
function scDrawPnlChart() {
  const canvas = document.getElementById('scpChartCanvas');
  if (!canvas) return;
  // ใช้ SC_CARD_W - padding เพื่อให้ได้ขนาดถูกต้องแม้ card จะ hidden
  const W = (canvas.parentElement.offsetWidth || (SC_CARD_W - 52));
  const H = 72;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const data = _scPnlData.length >= 2 ? _scPnlData : [0, 0.1, -0.05, 0.15, -0.02, -0.2];
  const mn = Math.min(...data), mx = Math.max(...data);
  const rng = (mx - mn) || 1;
  const pad = 6;
  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (W - pad * 2),
    y: (H - pad) - ((d - mn) / rng) * (H - pad * 2)
  }));
  const isNeg = data[data.length - 1] <= data[0];
  const lineColor = isNeg ? '#f6465d' : '#f0b90b';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isNeg ? 'rgba(246,70,93,.22)' : 'rgba(240,185,11,.22)');
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

/* ── Open Trade Share Card (จาก Position Card) ── */
function openShareCard(posId) {
  const p = S.positions.find(x => x.id == posId);
  if (!p) return;

  const now = new Date();
  const dt = now.toISOString().replace('T', ' ').substring(0, 19);
  const pnlVal = (p.pnl || 0);
  const isPos = p.pnl >= 0;

  /* Populate Trade Card */
  document.getElementById('sctUname').textContent  = SHARE_PROFILE.username;
  document.getElementById('sctDt').textContent     = dt;
  document.getElementById('sctSymbol').textContent = (p.symbol || '—') + ' Perpetual';
  const sideEl = document.getElementById('sctSide');
  sideEl.textContent = p.side === 'long' ? 'Long' : 'Short';
  sideEl.className   = p.side === 'long' ? 'sct-badge-long' : 'sct-badge-short';
  document.getElementById('sctLev').textContent    = (p.lev || p.leverage || '—') + 'x';
  const pnlEl = document.getElementById('sctPnl');
  pnlEl.className   = 'sct-pnl ' + (isPos ? 'pos' : 'neg');
  pnlEl.innerHTML   = (isPos ? '+' : '') + fmtM(pnlVal) + ' <span class="unit">USDT</span>';
  document.getElementById('sctEntry').textContent  = (p.entry || 0).toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits: 4});
  document.getElementById('sctPriceLbl').textContent = 'Last Price';
  document.getElementById('sctPrice').textContent  = (p.mark || p.entry || 0).toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits: 4});

  /* Avatar */
  _scSetAvatar();

  /* Footer */
  document.getElementById('sctBrandName').textContent = SHARE_PROFILE.brandName;
  document.getElementById('sctBrandSub').textContent  = SHARE_PROFILE.brandSub;
  document.getElementById('sctRefCode').textContent   = SHARE_PROFILE.refCode;
  scGenQR('sctQr', SHARE_PROFILE.refUrl);

  /* Also populate PNL card defaults */
  _scFillPnlCardDefaults();

  _scCurrentTab = 'trade';
  scSwitchTab('trade');
  document.getElementById('shareCardOverlay').classList.add('active');
}

/* ── Open Share Card จาก Position History (Closed Position) ── */
function openPosHistShareCard(posId) {
  // ค้นหาจาก HIST.positionHistory — match ด้วย id (string หรือ number)
  const p = HIST.positionHistory.find(x => String(x.id) === String(posId));
  if (!p) {
    // fallback: ค้นด้วย _posId กรณี partial close
    const p2 = HIST.positionHistory.find(x => String(x._posId) === String(posId));
    if (!p2) { showToast(tccT('toast_no_position_data'), 'error'); return; }
    return _fillAndOpenShareCard(p2);
  }
  _fillAndOpenShareCard(p);
}

function _fillAndOpenShareCard(p) {
  const pnlVal = parseFloat(p.realizedPnl || 0);
  const isPos  = pnlVal >= 0;
  const dt     = (p.closed && p.closed !== '—') ? p.closed : (p.opened || new Date().toISOString().replace('T',' ').substring(0,19));

  /* Symbol */
  document.getElementById('sctUname').textContent  = SHARE_PROFILE.username;
  document.getElementById('sctDt').textContent     = dt;
  // ตัด "USDT" ออกแล้วต่อ Perpetual: BTCUSDT → BTC USDT Perpetual
  const coinRaw = (p.coin || p.symbol || '—');
  document.getElementById('sctSymbol').textContent = coinRaw.replace(/USDT$/i,'') + 'USDT Perpetual';

  /* Side */
  const sideEl  = document.getElementById('sctSide');
  const sideStr = (p.side || 'long').toLowerCase();
  sideEl.textContent = sideStr === 'long' ? 'Long' : 'Short';
  sideEl.className   = sideStr === 'long' ? 'sct-badge-long' : 'sct-badge-short';

  /* Leverage — ดึงจาก mode string เช่น "Cross 150x" หรือ "Isolated 20x" */
  let levTxt = p.lev || p.leverage || '';
  if (!levTxt) {
    const m = (p.mode || p.badge || '').match(/(\d+x)/i);
    levTxt = m ? m[1] : '—';
  }
  document.getElementById('sctLev').textContent = levTxt;

  /* PNL */
  const pnlEl = document.getElementById('sctPnl');
  pnlEl.className = 'sct-pnl ' + (isPos ? 'pos' : 'neg');
  pnlEl.innerHTML = (isPos ? '+' : '') + fmtM(pnlVal) + ' <span class="unit">USDT</span>';

  /* Prices */
  document.getElementById('sctEntry').textContent    = p.avgEntry || p.entry || '—';
  document.getElementById('sctPriceLbl').textContent = 'Avg Close Price';
  document.getElementById('sctPrice').textContent    = p.avgClose || '—';

  /* Avatar — ใช้โลโก้แทนตัวอักษรถ้าไม่มี avatar */
  _scSetAvatar();

  /* Footer */
  document.getElementById('sctBrandName').textContent = SHARE_PROFILE.brandName;
  document.getElementById('sctBrandSub').textContent  = SHARE_PROFILE.brandSub;
  document.getElementById('sctRefCode').textContent   = SHARE_PROFILE.refCode;
  scGenQR('sctQr', SHARE_PROFILE.refUrl);

  _scFillPnlCardDefaults();
  _scCurrentTab = 'trade';
  scSwitchTab('trade');
  document.getElementById('shareCardOverlay').classList.add('active');
}

/* ── Open PNL Share Card (standalone) ── */
function openPnlShareCard(opts) {
  opts = opts || {};
  _scPnlData = opts.chartData || [];

  const pct = (opts.pct != null) ? opts.pct : 0;
  const usd = (opts.usd != null) ? opts.usd : 0;
  const wr  = (opts.winRate != null) ? opts.winRate : null;
  const period = opts.period || '—';

  const pctEl = document.getElementById('scpPct');
  pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
  pctEl.className   = 'scp-pct ' + (pct >= 0 ? 'pos' : 'neg');

  const usdEl = document.getElementById('scpPnlUsd');
  usdEl.textContent = (usd >= 0 ? '+' : '') + fmtM(usd);
  usdEl.className   = 'scp-stat-val ' + (usd >= 0 ? 'pos' : 'neg');

  document.getElementById('scpPeriod').textContent  = 'Period: ' + period;
  document.getElementById('scpWinRate').textContent = wr != null ? wr.toFixed(2) + '%' : '—%';
  document.getElementById('scpBrandName').textContent = SHARE_PROFILE.brandName;
  document.getElementById('scpBrandSub').textContent  = SHARE_PROFILE.brandSub;
  document.getElementById('scpRefCode').textContent   = SHARE_PROFILE.refCode;
  scGenQR('scpQr', SHARE_PROFILE.refUrl);

  _scCurrentTab = 'pnl';
  scSwitchTab('pnl');
  document.getElementById('shareCardOverlay').classList.add('active');
}

function _scFillPnlCardDefaults() {
  document.getElementById('scpPeriod').textContent   = 'Period: —';
  document.getElementById('scpBrandName').textContent = SHARE_PROFILE.brandName;
  document.getElementById('scpBrandSub').textContent  = SHARE_PROFILE.brandSub;
  document.getElementById('scpRefCode').textContent   = SHARE_PROFILE.refCode;
  scGenQR('scpQr', SHARE_PROFILE.refUrl);
}

/* ── Close ── */
function closeShareCard() {
  document.getElementById('shareCardOverlay').classList.remove('active');
  // ซ่อน action bar ด้วยเมื่อปิด overlay
  const bar = document.getElementById('scActionBar');
  if (bar) bar.style.transform = 'translateY(100%)';
}

/* ── Avatar helper — โลโก้แทนตัวอักษรถ้าไม่มี avatar ── */
function _scSetAvatar() {
  const avEl = document.getElementById('sctAvatar');
  if (!avEl) return;
  if (SHARE_PROFILE.avatar) {
    avEl.innerHTML = `<img src="${SHARE_PROFILE.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    // ใช้โลโก้ bull+bear วงกลม (base64 ที่ฝังไว้)
    avEl.innerHTML = `<img src="${TCC_LOGO_IMG}" alt="TCC"
      style="width:100%;height:100%;object-fit:cover;border-radius:50%;
             filter:brightness(1.1) contrast(1.05);">`;
  }
}

/* ── Progress Action Bar (Download / Share feedback) ── */
function _scShowActionBar(msg, type) {
  // type: 'loading' | 'success' | 'error'
  let bar = document.getElementById('scActionBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'scActionBar';
    bar.style.cssText = `
      position:fixed;bottom:0;left:50%;transform:translateX(-50%);
      width:100%;max-width:480px;z-index:10100;
      background:#1a1d22;border-top:1px solid #2b3139;
      padding:0;font-family:'Roboto',sans-serif;
      transition:transform .3s cubic-bezier(.32,1,.23,1);
    `;
    document.body.appendChild(bar);
  }
  const icons = { loading:'⏳', success:'✅', error:'❌' };
  const colors = { loading:'#f0b90b', success:'#0ecb81', error:'#f6465d' };
  const col = colors[type] || colors.loading;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 20px 10px;">
      <span style="font-size:18px">${icons[type]||'⏳'}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:#eaecef">${msg}</div>
        ${type==='loading' ? `<div style="font-size:11px;color:#848e9c;margin-top:2px"><span data-i18n="please_wait">${tccT('please_wait')}</span></div>` : ''}
      </div>
      ${type!=='loading' ? `<span onclick="document.getElementById('scActionBar').style.transform='translateY(100%)'"
        style="color:#848e9c;font-size:18px;cursor:pointer;padding:4px">✕</span>` : ''}
    </div>
    <div style="height:3px;background:#2b3139;border-radius:0">
      <div id="scActionBarFill" style="height:100%;background:${col};border-radius:0;
        width:${type==='loading'?'40%':'100%'};
        transition:width ${type==='loading'?'1.5s':'0.4s'} ease;"></div>
    </div>
    <div style="height:env(safe-area-inset-bottom,0px)"></div>
  `;
  bar.style.transform = 'translateY(0)';
  // animate progress bar ถ้า loading
  if (type === 'loading') {
    setTimeout(() => {
      const fill = document.getElementById('scActionBarFill');
      if (fill) fill.style.width = '85%';
    }, 50);
  }
  // auto-hide ถ้า success/error
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      if (bar) bar.style.transform = 'translateY(100%)';
    }, 2800);
  }
}

/* ── Browser Environment Detection ── */
const _scEnv = (function() {
  const ua = navigator.userAgent || '';
  return {
    isLine:    /Line\//i.test(ua),
    isFB:      /FBAN|FBAV|Instagram/i.test(ua),
    isInApp:   /Line\//i.test(ua) || /FBAN|FBAV|Instagram/i.test(ua) || /wv\)/i.test(ua),
    canShare:  !/Line\//i.test(ua) && !/FBAN|FBAV|Instagram/i.test(ua) && !/wv\)/i.test(ua) && !!navigator.share && !!navigator.canShare,
    canBlob:   (function(){ try { return !!URL.createObjectURL; } catch(e){ return false; } })(),
  };
})();

/* ── html2canvas helper — force ขนาดมาตรฐาน 390×620px ก่อน capture ──
   ทุก card จะได้ภาพขนาดเดียวกัน (390*3=1170 × 620*3=1860 px) ── */
const SC_CARD_W = 390;  // px — ความกว้างมาตรฐาน
const SC_CARD_H = 620;  // px — ความสูงมาตรฐาน

async function _scCapture(card) {
  const bgMap = {
    'scTradeCard':    '#0a0a12',
    'scPnlCard':      '#0d0e1a',
    'scContractCard': '#0a0a14',
  };
  const cardBg = bgMap[card.id] || '#0d0e1a';

  // บันทึก style เดิม
  const prevW      = card.style.width;
  const prevMinH   = card.style.minHeight;
  const prevMaxW   = card.style.maxWidth;
  const prevFlex   = card.style.flex;
  const prevBR     = card.style.borderRadius;

  // Force ขนาดมาตรฐาน
  card.style.width      = SC_CARD_W + 'px';
  card.style.minHeight  = SC_CARD_H + 'px';
  card.style.maxWidth   = SC_CARD_W + 'px';
  card.style.flex       = 'none';
  card.style.borderRadius = '20px';

  // รอ 1 frame เพื่อให้ layout คำนวณใหม่
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let cvs;
  try {
    cvs = await html2canvas(card, {
      scale: 3,
      width: SC_CARD_W,
      height: SC_CARD_H,
      useCORS: true,
      allowTaint: true,
      backgroundColor: cardBg,
      logging: false,
      imageTimeout: 0,
      removeContainer: true,
    });
  } finally {
    // Restore style เดิมเสมอ
    card.style.width       = prevW;
    card.style.minHeight   = prevMinH;
    card.style.maxWidth    = prevMaxW;
    card.style.flex        = prevFlex;
    card.style.borderRadius = prevBR;
  }
  return cvs;
}

/* ── LINE / In-App Browser overlay ── */
function _scShowLineOverlay(dataUrl) {
  const ua = navigator.userAgent || '';
  const isLine = /Line\//i.test(ua);

  // LINE: ข้ามตรงไปรูปเต็มจอ + แถบแคปหน้าจอเลย
  if (isLine) {
    _scShowFullImg(dataUrl);
    return;
  }

  // Non-LINE in-app (FB/IG/WebView): แสดง overlay ปกติ
  let ov = document.getElementById('scLineImgOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'scLineImgOverlay';
    ov.style.cssText = [
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'padding:20px 16px;gap:14px;overflow-y:auto;-webkit-overflow-scrolling:touch;',
      'touch-action:manipulation;'
    ].join('');
    document.body.appendChild(ov);
  }

  ov.innerHTML = `
    <div style="background:rgba(240,185,11,.12);border:1px solid rgba(240,185,11,.3);border-radius:10px;padding:10px 14px;max-width:360px;width:100%">
      <div style="font-size:12px;color:#f0b90b;line-height:1.5;"><b><span data-i18n="hold_to_view">${tccT('hold_to_view')}</span></b> แล้วเลือก "บันทึกภาพ" หรือกด Download</div>
    </div>
    <div style="display:flex;gap:8px;max-width:360px;width:100%">
      <button id="scLineBtnShare" onclick="_scLineShare(this)" style="flex:1;background:#06C755;border:none;color:#fff;border-radius:12px;padding:13px 0;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;"><span data-i18n="line_share">${tccT('line_share')}</span></button>
      <button onclick="_scLineOverlayDownload()" style="flex:1;background:rgba(14,203,129,.15);border:1px solid rgba(14,203,129,.35);color:#0ecb81;border-radius:10px;padding:13px 0;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">⬇ Download</button>
      <button onclick="_scLineOverlayClose()" style="flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:13px 0;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">✕ ปิด</button>
    </div>
    <a id="scLineImgLink" href="${dataUrl}" download="tcc-share-${Date.now()}.png"
      style="display:block;max-width:360px;width:100%;border-radius:16px;overflow:hidden;touch-action:manipulation;-webkit-touch-callout:default;cursor:pointer;"
      onclick="return false;">
      <img id="scLineImg" src="${dataUrl}"
        style="width:100%;display:block;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.7);-webkit-user-select:auto;user-select:auto;-webkit-touch-callout:default;pointer-events:auto;touch-action:manipulation;"
        oncontextmenu="return true;"
      />
    </a>
  `;
  ov.style.display = 'flex';
}

/* ── ดักจับ contextmenu event บนรูป (รองรับ desktop + Android Chrome) ── */
function _scImgContextMenu(e) {
  // ปล่อยให้ browser จัดการ native context menu (Save image / Share)
  // ไม่ preventDefault เพื่อให้ menu เด้งขึ้นมา
}

/* ── Long-press fallback 700ms สำหรับ LINE in-app ── */
function _scAttachLongPress(imgEl, dataUrl) {
  let timer = null;
  let moved = false;

  imgEl.addEventListener('touchstart', function(e) {
    moved = false;
    timer = setTimeout(function() {
      if (!moved) _scLineSaveImage();
    }, 700);
  }, { passive: true });

  imgEl.addEventListener('touchmove', function() {
    moved = true;
    clearTimeout(timer);
  }, { passive: true });

  imgEl.addEventListener('touchend', function() {
    clearTimeout(timer);
  }, { passive: true });

  imgEl.addEventListener('touchcancel', function() {
    clearTimeout(timer);
  }, { passive: true });
}

/* ── บันทึกรูปลงเครื่อง (ใช้ Blob URL แทน data URL เพื่อรองรับ LINE browser) ── */
function _scLineSaveImage() {
  const img = document.getElementById('scLineImg');
  if (!img) return;
  const dataUrl = img.src;

  _scShowActionBar('กำลังเตรียมภาพ...', 'loading');

  // LINE browser บล็อก a.click() download และ blob URL
  // → ตรงไปที่ fullscreen screenshot guide ทันที
  const ua = navigator.userAgent || '';
  const isLine = /Line\//i.test(ua);
  if (isLine) {
    setTimeout(() => _scShowFullImg(dataUrl), 200);
    return;
  }

  // Non-LINE: ลอง Blob download
  try {
    const byteStr = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'tcc-share-' + Date.now() + '.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      _scShowActionBar('📥 บันทึกภาพแล้ว!', 'success');
    }, 800);
  } catch(e) {
    _scShowFullImg(dataUrl);
  }
}

/* ── เปิดรูปใน new tab / full browser (LINE จะถามว่าจะเปิดใน external browser ไหม) ── */
function _scLineOpenInNewTab() {
  const img = document.getElementById('scLineImg');
  if (!img) return;
  const dataUrl = img.src;
  try {
    const byteStr = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    const w = window.open(blobUrl, '_blank');
    if (!w) {
      // popup blocked — แสดง full-screen img ใน overlay เดิม
      _scShowFullImg(dataUrl);
      return;
    }
    _scShowActionBar('🔗 เปิดรูปในเบราว์เซอร์ — กดค้างรูปเพื่อบันทึกหรือแชร์', 'success');
  } catch(e) {
    _scShowFullImg(dataUrl);
  }
}

/* ── แสดงรูปเต็มจอ (fallback สุดท้าย) ── */
function _scShowFullImg(dataUrl) {
  // ปิด overlay เดิม
  const ov = document.getElementById('scLineImgOverlay');
  if (ov) ov.style.display = 'none';

  let fw = document.getElementById('scFullImgWrap');
  if (!fw) {
    fw = document.createElement('div');
    fw.id = 'scFullImgWrap';
    document.body.appendChild(fw);
  }
  fw.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000;display:flex;align-items:center;justify-content:center;touch-action:manipulation;overflow:hidden;';

  fw.innerHTML = `
    <img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;display:block;-webkit-touch-callout:default;-webkit-user-select:auto;touch-action:manipulation;" oncontextmenu="return true;"/>
    <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:5px 10px 5px 8px;display:flex;align-items:center;gap:6px;white-space:nowrap;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2;">
      <span style="font-size:11px;">📸</span>
      <span style="font-size:10px;color:rgba(255,255,255,.8);font-weight:600;">แคปหน้าจอเพื่อแชร์ใน LINE</span>
      <button onclick="document.getElementById('scFullImgWrap').style.display='none';" style="background:rgba(255,255,255,.15);border:none;color:rgba(255,255,255,.7);border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">✕</button>
    </div>
  `;
  fw.style.display = 'flex';
}

/* ── LINE Share Handler (สำหรับ non-LINE browser) ── */
function _scLineShare(btn) {
  const img = document.getElementById('scLineImg');
  if (!img) return;
  const dataUrl = img.src;

  if (navigator.share && navigator.canShare) {
    fetch(dataUrl)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], 'tcc-share.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Trader Cafe Club — TCC' })
            .then(() => { _scShowActionBar('แชร์สำเร็จ! 🚀', 'success'); _scLineOverlayClose(); })
            .catch(err => { if (err.name !== 'AbortError') _scLineSaveImage(); });
          return;
        }
        _scLineSaveImage();
      })
      .catch(() => _scLineSaveImage());
    return;
  }
  _scLineSaveImage();
}

/* ── Close overlay ── */
function _scLineOpenApp(dataUrl) {
  // Legacy fallback — redirect ไป _scLineSaveImage
  const img = document.getElementById('scLineImg');
  if (img && !img.src.startsWith('data:')) return;
  _scLineSaveImage();
}

function _scLineOverlayClose() {
  const ov = document.getElementById('scLineImgOverlay');
  if (ov) ov.style.display = 'none';
}
function _scLineOverlayDownload() {
  const img = document.getElementById('scLineImg');
  if (!img) return;
  const a = document.createElement('a');
  a.download = 'tcc-share-' + Date.now() + '.png';
  a.href = img.src;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  _scShowActionBar('บันทึกภาพสำเร็จ! 📥', 'success');
}

/* ── Download ── */
async function scDownload() {
  const cardId = _scCurrentTab === 'trade' ? 'scTradeCard' : _scCurrentTab === 'contract' ? 'scContractCard' : 'scPnlCard';
  const card   = document.getElementById(cardId);
  if (!card || typeof html2canvas === 'undefined') {
    _scShowActionBar('html2canvas ไม่พร้อม', 'error'); return;
  }
  _scShowActionBar('กำลังสร้างภาพ...', 'loading');
  if (_scCurrentTab === 'pnl') scDrawPnlChart();
  if (_scCurrentTab === 'contract') scDrawContractChart();
  await new Promise(r => setTimeout(r, 220));
  try {
    const cvs = await _scCapture(card);
    const dataUrl = cvs.toDataURL('image/png');

    // LINE / Instagram / In-App: ไม่รองรับ a.click() download → แสดง overlay
    if (_scEnv.isInApp) {
      _scShowLineOverlay(dataUrl);
      _scShowActionBar('กดค้างที่รูปเพื่อบันทึก 📱', 'success');
      return;
    }

    // Standard browser
    const fname = 'tcc-share-' + _scCurrentTab + '-' + Date.now() + '.png';
    const a = document.createElement('a');
    a.download = fname;
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    _scShowActionBar('บันทึกภาพสำเร็จ! 📥 ' + fname, 'success');
  } catch (e) {
    _scShowActionBar('เกิดข้อผิดพลาด: ' + e.message, 'error');
  }
}

/* ── Native Share / Clipboard ── */
async function scShareNative() {
  const cardId = _scCurrentTab === 'trade' ? 'scTradeCard' : _scCurrentTab === 'contract' ? 'scContractCard' : 'scPnlCard';
  const card   = document.getElementById(cardId);
  if (!card || typeof html2canvas === 'undefined') {
    _scShowActionBar('ไม่พร้อมใช้งาน', 'error'); return;
  }
  _scShowActionBar('กำลังเตรียมภาพเพื่อแชร์...', 'loading');
  if (_scCurrentTab === 'pnl') scDrawPnlChart();
  if (_scCurrentTab === 'contract') scDrawContractChart();
  await new Promise(r => setTimeout(r, 220));
  try {
    const cvs = await _scCapture(card);
    const dataUrl = cvs.toDataURL('image/png');

    // LINE / In-App: Web Share API ไม่รองรับ → แสดง overlay ให้กดค้าง long-press บันทึก/แชร์
    if (_scEnv.isInApp) {
      _scShowLineOverlay(dataUrl);
      _scShowActionBar('กดค้างที่รูปเพื่อแชร์ใน LINE 📱', 'success');
      return;
    }

    // Try Web Share API with file (Chrome Android, Safari iOS)
    if (navigator.share && navigator.canShare) {
      cvs.toBlob(async blob => {
        try {
          const file = new File([blob], 'tcc-share.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Trader Cafe Club — TCC' });
            _scShowActionBar('แชร์สำเร็จ! 🚀', 'success');
            return;
          }
        } catch (shareErr) {
          if (shareErr && shareErr.name !== 'AbortError') {
            // Not cancelled — fallback to overlay
            _scShowLineOverlay(dataUrl);
            _scShowActionBar('กดค้างที่รูปเพื่อบันทึกหรือแชร์ 📱', 'success');
          }
          return;
        }
        // canShare returned false — show overlay
        _scShowLineOverlay(dataUrl);
        _scShowActionBar('กดค้างที่รูปเพื่อบันทึกหรือแชร์ 📱', 'success');
      }, 'image/png');
    } else {
      // No Web Share API (desktop/unsupported) → show overlay with image to long-press or download
      _scShowLineOverlay(dataUrl);
      _scShowActionBar('กดค้างที่รูปเพื่อบันทึกหรือแชร์ 📱', 'success');
    }
  } catch (e) {
    _scShowActionBar('ข้อผิดพลาด: ' + e.message, 'error');
  }
}

function _scFallbackDownload(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'tcc-share-' + Date.now() + '.png';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    _scShowActionBar('บันทึกภาพสำเร็จ! 📥', 'success');
  } catch(e) {
    _scShowActionBar('ไม่สามารถบันทึกได้: ' + e.message, 'error');
  }
}

/* Close overlay on background tap */
document.addEventListener('click', function(e) {
  const ov = document.getElementById('shareCardOverlay');
  if (ov && e.target === ov) closeShareCard();
});

// ══════════════════════════════════════════════════════════════
//  HOME PAGE — state & helpers
// ══════════════════════════════════════════════════════════════
let _hmHidden  = false;
let _hmMktKey  = 'vol';   // current market tab key
let _hmSubKey  = 'crypto';

/* Called by navTo when target==='home' */
function _homeInit() {
  updateOverviewBalances();   // refresh balances (writes to astTotalVal)
  _hmRefreshBalance();
  _hmRenderMkt();
  _homeUpdateAvatar();
  // Load market data if not yet loaded
  if (!mktLoaded) {
    loadMarketData().then(() => _hmRenderMkt()).catch(() => {});
  }
}

/* Pull balance numbers from live DOM / S state */
function _hmRefreshBalance() {
  // [v9.1 FIX] คำนวณ total โดยตรงจาก live state ไม่ผ่าน DOM (กัน race condition)
  const _earnBal    = (typeof earnContracts !== 'undefined')
    ? earnContracts.reduce((s, c) => s + (c.currentBalance || 0), 0) : 0;
  const _fundingBal = (typeof fundingWalletBalance !== 'undefined') ? (fundingWalletBalance || 0) : 0;
  // [vx3 FIX-SPOT-B] _spotBal = getSpotTotalUSDT() รวม mainWalletBalance อยู่แล้ว
  // เดิม: _mainBal + _spotBal → นับ mainWalletBalance 2 รอบ (double-count)
  // ใหม่: ลบ _mainBal ออก — _spotBal = USDT cash + coin holdings ครบในตัวเดียว
  const _spotBal    = (typeof getSpotTotalUSDT === 'function') ? getSpotTotalUSDT() : 0;
  const total = _earnBal + _fundingBal + _spotBal;

  // [v9.1 FIX] Today's PNL = unrealized + realized PnL วันนี้
  const unrealized = (typeof S !== 'undefined' && S.positions)
    ? S.positions.reduce((s, p) => s + (p.pnl || 0), 0) : 0;
  const _todayStartMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  // [FIX Bug2] exclude Earn Realized PNL (symbol='Earn' จาก distributeProfit)
  // todayRealized แสดงเฉพาะ Futures PNL ในวันนี้ — Earn PNL มาจาก earnContracts.currentBalance แล้ว
  const todayRealized = (typeof HIST !== 'undefined' && HIST.transactionHistory)
    ? HIST.transactionHistory.reduce((s, tx) => {
        if (tx.type !== 'Realized PNL') return s;
        if ((tx.ts || 0) < _todayStartMs) return s;
        if ((tx.symbol || '') === 'Earn') return s;  // ← Earn PNL ไม่นับ
        return s + (parseFloat(String(tx.amount || '0').replace('+','')) || 0);
      }, 0)
    : 0;
  const pnl = unrealized + todayRealized;

  const hmTotal = document.getElementById('hm-total');
  const hmUsd   = document.getElementById('hm-usd');
  const hmPnl   = document.getElementById('hm-pnl');

  if (_hmHidden) {
    if (hmTotal) hmTotal.textContent = '***.**';
    if (hmUsd)   hmUsd.textContent   = '≈$***.**';
    if (hmPnl)   { hmPnl.textContent = '*** USDT'; hmPnl.style.color = 'var(--t2)'; }
    return;
  }

  // Format: show 8 decimals when < 1, else comma-formatted 2dp
  const fmt = v => Math.abs(v) < 1 ? v.toFixed(8) : fmtM(v);
  if (hmTotal) hmTotal.textContent = fmt(total);
  if (hmUsd)   hmUsd.textContent   = '≈$' + fmt(total);

  if (hmPnl) {
    const sign = pnl >= 0 ? '+' : '';
    const pct  = total > 0 ? ((pnl / total) * 100).toFixed(2) : '0.00';
    const pSign = pnl >= 0 ? '+' : '';
    hmPnl.textContent = `${sign}${fmt(pnl)} USDT (${pSign}${pct}%)`;
    hmPnl.style.color = pnl >= 0 ? 'var(--g)' : 'var(--r)';
    // update arrow color
    const arrow = hmPnl.nextElementSibling;
    if (arrow && arrow.tagName === 'svg') arrow.setAttribute('stroke', pnl >= 0 ? 'var(--g)' : 'var(--r)');
  }
}

function _hmToggleHide() {
  _hmHidden = !_hmHidden;
  _hmRefreshBalance();
}
