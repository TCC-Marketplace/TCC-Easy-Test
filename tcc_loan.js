// ══════════════════════════════════════════════════════════════════
//  TCC LOAN — Config
// ══════════════════════════════════════════════════════════════════
const LOAN_COINS = {
  BTC:  { name:'Bitcoin',  symbol:'BTC', bg:'#F7931A', ico:'₿',  initLTV:75, marginLTV:83, liqLTV:90,  annualRate:0.54  },
  ETH:  { name:'Ethereum', symbol:'ETH', bg:'#627EEA', ico:'Ξ',  initLTV:75, marginLTV:83, liqLTV:90,  annualRate:2.48  },
  BNB:  { name:'BNB',      symbol:'BNB', bg:'#F0B90B', ico:'B',  initLTV:65, marginLTV:75, liqLTV:85,  annualRate:1.20  },
  XRP:  { name:'XRP',      symbol:'XRP', bg:'#346AA9', ico:'X',  initLTV:60, marginLTV:70, liqLTV:80,  annualRate:2.10  },
  SOL:  { name:'Solana',   symbol:'SOL', bg:'#9945FF', ico:'◎',  initLTV:60, marginLTV:70, liqLTV:80,  annualRate:1.80  },
};
const LOAN_BORROW_RATE_USDT = 3.64; // % annualized
const LOAN_HOURLY_RATE = LOAN_BORROW_RATE_USDT / 100 / 8760; // per hour

// current selected collateral coin
let _loanSelectedCoin = 'BTC';
// [FIX] true เมื่อผู้ใช้พิมพ์ในช่อง "ต้องการกู้ USDT" เองแล้ว — กันไม่ให้ auto-suggest ไปทับค่าที่ผู้ใช้ตั้งใจกรอกเอง
let _loanBorrowEdited = false;
// cache of HL prices
let _loanPrices = {};

// ══════════════════════════════════════════════════════════════════
//  PRICE — pull from Hyperliquid REST (same pattern as rest of app)
// ══════════════════════════════════════════════════════════════════
async function loanFetchPrices() {
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    });
    const mids = await r.json();
    // allMids returns { BTC: "103xxx", ETH: "2xxx", ... }
    ['BTC','ETH','BNB','XRP','SOL'].forEach(sym => {
      if (mids[sym]) _loanPrices[sym] = parseFloat(mids[sym]);
    });
    return _loanPrices;
  } catch(e) {
    console.warn('[loanFetchPrices]', e);
    return _loanPrices;
  }
}

// ══════════════════════════════════════════════════════════════════
//  NAV helpers
// ══════════════════════════════════════════════════════════════════
function loanSetBorrow(coin) {
  // called when user taps a coin row from main page
  // [FIX] "USDT" (และเหรียญอื่นที่ไม่ได้อยู่ใน LOAN_COINS) ใช้เป็นหลักทรัพย์ค้ำประกันไม่ได้
  // เดิมถ้า coin ไม่ตรงกับ LOAN_COINS จะทำให้ loanRenderCoinSelector()/loanCalcLTV() return ทันที (guard `if(!coin) return`)
  // ผลคือหน้า Flexible Loan ไม่มีราคาประเมิน/LTV/Liq Price ใดๆ ขึ้นเลย ถ้ากดแถว USDT ใน Popular Assets
  _loanSelectedCoin = (coin && LOAN_COINS[coin]) ? coin : 'BTC';
  _loanBorrowEdited = false;
  loanRenderCoinSelector();
  loanCalcLTV();
}

// ══════════════════════════════════════════════════════════════════
//  COIN PICKER
// ══════════════════════════════════════════════════════════════════
function loanOpenCoinPicker() {
  const list = document.getElementById('loan-coin-list');
  if (!list) return;

  // อัพเดทราคาล่าสุดก่อนแสดง balance value
  loanFetchPrices().then(() => {
    list.innerHTML = Object.values(LOAN_COINS).map(c => {
      const bal      = _loanGetSpotBalance(c.symbol);
      const price    = _loanPrices[c.symbol] || 0;
      const balUSDT  = bal * price;
      const isActive = c.symbol === _loanSelectedCoin;
      return `<div onclick="loanSelectCoin('${c.symbol}')"
        style="display:flex;align-items:center;justify-content:space-between;
               padding:14px 16px;border-bottom:1px solid var(--bl);cursor:pointer;
               background:${isActive ? 'rgba(240,185,11,.07)' : 'transparent'};">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="loan-coin-ico" style="background:${c.bg};width:36px;height:36px;font-size:16px;">${c.ico}</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--t1);">${c.symbol}</div>
            <div style="font-size:11px;color:var(--t3);">${c.name}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:600;color:var(--t1);">${bal > 0 ? bal.toFixed(6) : '0.000000'}</div>
          <div style="font-size:11px;color:var(--t3);">${price > 0 && bal > 0 ? '≈ $' + balUSDT.toFixed(2) : 'Spot Balance'}</div>
        </div>
        ${isActive ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>`;
    }).join('');
  });

  // เปิด sheet ด้วย class pattern เดียวกับ sheet อื่นๆ ในแอป
  const ov = document.getElementById('loan-coin-overlay');
  const sh = document.getElementById('loan-coin-sheet');
  if (ov) ov.classList.add('visible');
  if (sh) sh.classList.add('open');
}

function loanCloseCoinPicker() {
  const ov = document.getElementById('loan-coin-overlay');
  const sh = document.getElementById('loan-coin-sheet');
  if (ov) ov.classList.remove('visible');
  if (sh) sh.classList.remove('open');
}
function loanSelectCoin(sym) {
  _loanSelectedCoin = sym;
  _loanBorrowEdited = false; // เปลี่ยนเหรียญค้ำประกัน → คำนวณยอดกู้แนะนำใหม่จากค่าที่มีอยู่
  loanRenderCoinSelector();
  loanCalcLTV();
  loanAutoSuggestBorrow();
  loanCloseCoinPicker();
}

// ══════════════════════════════════════════════════════════════════
//  RENDER coin selector badge
// ══════════════════════════════════════════════════════════════════
function loanRenderCoinSelector() {
  const c = LOAN_COINS[_loanSelectedCoin];
  if (!c) return;
  const ico = document.getElementById('lf-col-ico');
  const nm  = document.getElementById('lf-col-name');
  if (ico) { ico.style.background = c.bg; ico.textContent = c.ico; }
  if (nm)  nm.textContent = c.symbol;
  // update LTV labels
  document.getElementById('lf-ltv-init').textContent   = c.initLTV   + '%';
  document.getElementById('lf-ltv-margin').textContent = c.marginLTV + '%';
  document.getElementById('lf-ltv-liq').textContent    = c.liqLTV    + '%';
  // update avbl
  document.getElementById('lf-avbl').textContent = _loanGetSpotBalance(c.symbol).toFixed(8);
}

// ══════════════════════════════════════════════════════════════════
//  GET SPOT BALANCE from USER_PROFILE / local balances
// ══════════════════════════════════════════════════════════════════
function _loanGetSpotBalance(sym) {
  // [LOAN v1 FIX] อ่าน balance จาก SND_COINS ซึ่ง sync จาก GAS spot_balance จริงๆ
  // USER_PROFILE.balances ไม่มีใน schema — ใช้ SND_COINS แทน (มีครบ BTC/ETH/BNB/XRP/SOL/USDT)
  try {
    if (typeof SND_COINS !== 'undefined') {
      const entry = SND_COINS.find(c => c.coin === sym);
      if (entry) return parseFloat(entry.bal || 0);
    }
  } catch(e) {}
  // fallback: อ่านจาก USER_PROFILE.spot_balance สำหรับ USDT เท่านั้น
  try {
    if (sym === 'USDT' && typeof USER_PROFILE !== 'undefined') {
      return parseFloat(USER_PROFILE.spot_balance || 0);
    }
  } catch(e) {}
  return 0;
}

// ══════════════════════════════════════════════════════════════════
//  SET MAX COLLATERAL
// ══════════════════════════════════════════════════════════════════
function loanSetMaxCollateral() {
  const bal = _loanGetSpotBalance(_loanSelectedCoin);
  const inp = document.getElementById('lf-collateral-amt');
  if (inp) { inp.value = bal.toFixed(8); loanAutoSuggestBorrow(); loanCalcLTV(); }
}

// ══════════════════════════════════════════════════════════════════
//  [FIX] AUTO-SUGGEST ยอด "ต้องการกู้ USDT" จากหลักทรัพย์ค้ำประกันที่กรอก
//  เดิมช่อง lf-collateral-amt มี oninput เรียกแค่ loanCalcLTV() → ไม่มีจุดไหนเติมค่า
//  lf-borrow-amt ให้เลย ผู้ใช้ต้องกรอกยอดกู้เองล้วนๆ ทั้งที่ควรมีค่าประเมิน/แนะนำขึ้นให้อัตโนมัติ
//  (เว้นแต่ผู้ใช้แก้ช่องกู้เองแล้ว — เก็บสถานะไว้ที่ _loanBorrowEdited กันไปทับค่าที่ผู้ใช้ตั้งใจกรอก)
// ══════════════════════════════════════════════════════════════════
function loanAutoSuggestBorrow() {
  if (_loanBorrowEdited) return; // ผู้ใช้แก้ยอดกู้เองแล้ว ไม่ auto-fill ทับ
  const coin  = LOAN_COINS[_loanSelectedCoin];
  const inp   = document.getElementById('lf-borrow-amt');
  const colAmt = parseFloat(document.getElementById('lf-collateral-amt')?.value) || 0;
  if (!coin || !inp) return;
  if (colAmt <= 0) { inp.value = ''; return; }

  const price = _loanPrices[_loanSelectedCoin] || 0;
  if (price <= 0) return; // ยังไม่มีราคา (เช่น hyperliquid ยังโหลดไม่เสร็จ) — รอ loanFetchPrices ก่อนแล้วค่อยลองใหม่

  const colValueUSDT = colAmt * price;
  // แนะนำที่ 95% ของ Initial LTV เผื่อ buffer ไม่ให้ raw calc ดันไปชนขอบพอดีตอนกดยืนยัน
  const suggested = Math.floor(colValueUSDT * (coin.initLTV / 100) * 0.95 * 100) / 100;
  inp.value = suggested > 0 ? suggested.toFixed(2) : '';
}

// ══════════════════════════════════════════════════════════════════
//  CALCULATE LTV + Liq Price
// ══════════════════════════════════════════════════════════════════
function loanCalcLTV() {
  const borrowAmt    = parseFloat(document.getElementById('lf-borrow-amt')?.value) || 0;
  const colAmt       = parseFloat(document.getElementById('lf-collateral-amt')?.value) || 0;
  const coin         = LOAN_COINS[_loanSelectedCoin];
  if (!coin) return;

  const price        = _loanPrices[_loanSelectedCoin] || 0;
  const colValueUSDT = colAmt * price;

  // LTV = borrow / collateral_value_USDT * 100
  let ltv = colValueUSDT > 0 ? (borrowAmt / colValueUSDT) * 100 : 0;
  const ltvEl = document.getElementById('lf-ltv-current');
  if (ltvEl) {
    if (ltv > 0) {
      let col = ltv >= coin.liqLTV ? '#ef4444' : ltv >= coin.marginLTV ? '#f59e0b' : '#22c55e';
      ltvEl.textContent = ltv.toFixed(2) + '%';
      ltvEl.style.color = col;
    } else {
      ltvEl.textContent = '—';
      ltvEl.style.color = 'var(--t1)';
    }
  }

  // Liquidation price: price at which LTV reaches liqLTV
  // liqPrice = borrowAmt / (colAmt * liqLTV/100)
  let liqPrice = 0;
  if (colAmt > 0 && borrowAmt > 0) {
    liqPrice = borrowAmt / (colAmt * (coin.liqLTV / 100));
  }
  const liqEl = document.getElementById('lf-liq-price');
  if (liqEl) liqEl.textContent = liqPrice > 0 ? liqPrice.toFixed(4) + ' USDT ⇌' : '0.00 ⇌';

  // Hourly interest
  const hourlyInt = borrowAmt * LOAN_HOURLY_RATE;
  const hEl = document.getElementById('lf-hourly-int');
  if (hEl) hEl.textContent = hourlyInt > 0 ? hourlyInt.toFixed(6) + ' USDT' : '0.00 USDT';

  // Validate button
  const btn = document.getElementById('lf-confirm-btn');
  if (btn) {
    const valid = borrowAmt > 0 && colAmt > 0 && ltv <= coin.initLTV;
    btn.disabled = !valid;
    btn.textContent = ltv > coin.initLTV && ltv > 0
      ? tccTF('toast_ltv_exceed',{ltv:coin.initLTV})+' — '+tccT('reduce_borrow')
      : tccT('confirm_loan');
  }
}

// ══════════════════════════════════════════════════════════════════
//  SUBMIT BORROW → GAS
// ══════════════════════════════════════════════════════════════════
async function loanSubmitBorrow() {
  const borrowAmt  = parseFloat(document.getElementById('lf-borrow-amt')?.value) || 0;
  const colAmt     = parseFloat(document.getElementById('lf-collateral-amt')?.value) || 0;
  const coin       = LOAN_COINS[_loanSelectedCoin];
  if (!borrowAmt || !colAmt || !coin) return;

  const price    = _loanPrices[_loanSelectedCoin] || 0;
  const ltv      = price > 0 ? (borrowAmt / (colAmt * price)) * 100 : 0;
  const liqPrice = colAmt > 0 ? borrowAmt / (colAmt * (coin.liqLTV / 100)) : 0;

  if (ltv > coin.initLTV) {
    showToast(tccTF('toast_ltv_exceed',{ltv:coin.initLTV})); return;
  }
  if (colAmt > _loanGetSpotBalance(_loanSelectedCoin)) {
    showToast(tccT('toast_spot_insufficient2')); return;
  }

  const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;
  if (!uid) { showToast(tccT('toast_login_required_x')); return; }

  const btn = document.getElementById('lf-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = tccT('btn_processing'); }

  try {
    const payload = {
      uid,
      collateral_coin:   _loanSelectedCoin,
      collateral_amount: colAmt,
      collateral_price:  price,
      borrow_usdt:       borrowAmt,
      ltv_current:       parseFloat(ltv.toFixed(4)),
      liq_price:         parseFloat(liqPrice.toFixed(6)),
      interest_rate:     LOAN_BORROW_RATE_USDT,
      hourly_rate:       parseFloat((LOAN_HOURLY_RATE * 100).toFixed(8)),
    };
    await dbCallRaw('createLoan', payload);
    showToast(tccT('toast_loan_created'));
    // reset form
    document.getElementById('lf-borrow-amt').value = '';
    document.getElementById('lf-collateral-amt').value = '';
    _loanBorrowEdited = false;
    loanCalcLTV();
    // go back and reload list
    navTo('loan');
    setTimeout(loanLoadMyLoans, 500);
  } catch(e) {
    showToast('❌ ' + (e.message || tccT('err_generic')));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = tccT('confirm_loan'); }
  }
}

// ══════════════════════════════════════════════════════════════════
//  LOAD MY LOANS from GAS
// ══════════════════════════════════════════════════════════════════
let _loanAllLoans = []; // [FIX] cache รายการ loan ทุกสถานะจาก getMyLoans ไว้ใช้ทั้ง My Loans (active) และ Loan History (repaid/liquidated)

async function loanLoadMyLoans() {
  const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;
  if (!uid) return;
  const container = document.getElementById('loan-my-list');
  if (!container) return;
  try {
    const loans = await dbCallRaw('getMyLoans', { uid });
    _loanAllLoans = loans || [];

    // [FIX] getMyLoans คืนทุกสถานะ (active/repaid/liquidated) — เดิม frontend render ทุกรายการรวมกัน
    // ทำให้ loan ที่ชำระคืนแล้ว (status='repaid') ยังโชว์เป็น "● Active" พร้อมปุ่มชำระคืนซ้ำ
    // ตอนนี้ "My Loans" แสดงเฉพาะ loan ที่ยัง active อยู่เท่านั้น ส่วน repaid/liquidated ย้ายไปดูผ่าน Loan History (ไอคอนนาฬิกา)
    const activeLoans = _loanAllLoans.filter(l => l.status === 'active');

    if (!activeLoans.length) {
      container.innerHTML = `<div class="loan-empty-box">
        <div style="font-size:32px;margin-bottom:8px;">🏦</div>
        <div style="font-size:14px;color:var(--t2);"><span data-i18n="no_loan">${tccT('no_loan')}</span></div>
        <div style="font-size:12px;color:var(--t3);margin-top:4px;">กด "เริ่มกู้ยืม" เพื่อสร้างสินเชื่อแรก</div>
      </div>`;
      return;
    }
    // update prices then render
    await loanFetchPrices();
    container.innerHTML = activeLoans.map(ln => loanRenderCard(ln)).join('');
  } catch(e) {
    console.warn('[loanLoadMyLoans]', e);
  }
}

// ══════════════════════════════════════════════════════════════════
//  LOAN HISTORY — เปิดจากไอคอนนาฬิกาใน header (แสดง repaid/liquidated)
// ══════════════════════════════════════════════════════════════════
function loanOpenHistory() {
  const list = document.getElementById('loan-history-list');
  if (list) {
    const closedLoans = (_loanAllLoans || [])
      .filter(l => l.status !== 'active')
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    list.innerHTML = closedLoans.length
      ? closedLoans.map(ln => loanRenderCard(ln)).join('')
      : `<div class="loan-empty-box">
          <div style="font-size:32px;margin-bottom:8px;">📜</div>
          <div style="font-size:14px;color:var(--t2);"><span data-i18n="no_loan_history">${tccT('no_loan_history')}</span></div>
        </div>`;
  }
  const ov = document.getElementById('loan-history-overlay');
  const sh = document.getElementById('loan-history-sheet');
  if (ov) ov.classList.add('visible');
  if (sh) sh.classList.add('open');
}

function loanCloseHistory() {
  const ov = document.getElementById('loan-history-overlay');
  const sh = document.getElementById('loan-history-sheet');
  if (ov) ov.classList.remove('visible');
  if (sh) sh.classList.remove('open');
}

function loanRenderCard(ln) {
  const price     = _loanPrices[ln.collateral_coin] || ln.collateral_price || 0;
  const colVal    = ln.collateral_amount * price;
  const ltv       = colVal > 0 ? (ln.borrow_usdt / colVal * 100).toFixed(2) : '—';
  const coin      = LOAN_COINS[ln.collateral_coin] || {};
  const ltvNum    = parseFloat(ltv) || 0;
  let badgeCls    = '';
  let badgeTxt    = '● Active';
  // [FIX] เดิมเช็คแค่ 'liquidated' เป็นกรณีพิเศษ ที่เหลือ fallback เป็น "Active" หมด
  // ทำให้ loan ที่ status='repaid' ยังโชว์ badge "Active" อยู่ (ตรงกับบั๊กในภาพที่ส่งมา)
  if (ln.status === 'repaid')          { badgeCls = 'repaid'; badgeTxt = '● Repaid'; }
  else if (ln.status === 'liquidated') { badgeCls = 'liq';    badgeTxt = '● Liquidated'; }
  else if (ltvNum >= (coin.marginLTV||83)) { badgeCls = 'warn'; badgeTxt = '⚠ Margin Call'; }

  // interest accrued (rough estimate from created_at)
  const hours  = ln.hours_elapsed || 0;
  const intAcc = (ln.borrow_usdt * LOAN_HOURLY_RATE * hours).toFixed(4);

  return `<div class="loan-active-card">
    <div class="loan-card-top">
      <span style="font-size:13px;font-weight:700;color:var(--t1);">${ln.collateral_coin} → USDT</span>
      <span class="loan-card-badge ${badgeCls}">${badgeTxt}</span>
    </div>
    <div class="loan-card-row"><span class="loan-card-key">กู้ยืม</span><span class="loan-card-val">${parseFloat(ln.borrow_usdt).toFixed(2)} USDT</span></div>
    <div class="loan-card-row"><span class="loan-card-key">หลักทรัพย์</span><span class="loan-card-val">${parseFloat(ln.collateral_amount).toFixed(6)} ${ln.collateral_coin}</span></div>
    <div class="loan-card-row"><span class="loan-card-key">Liq Price</span><span class="loan-card-val">${parseFloat(ln.liq_price||0).toFixed(4)} USDT</span></div>
    <div class="loan-card-row"><span class="loan-card-key">LTV ปัจจุบัน</span><span class="loan-card-val" style="color:${ltvNum>=(coin.liqLTV||90)?'#ef4444':ltvNum>=(coin.marginLTV||83)?'#f59e0b':'#22c55e'}">${ltv}%</span></div>
    <div class="loan-card-row"><span class="loan-card-key">ดอกเบี้ยสะสม</span><span class="loan-card-val">${intAcc} USDT</span></div>
    ${ln.status === 'active' ? `<button class="loan-card-repay-btn" onclick="loanRepay('${ln.loan_id}')">ชำระคืน</button>` : ''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  REPAY → GAS
// ══════════════════════════════════════════════════════════════════
let _loanRepayTargetId = null; // [FIX] สินเชื่อที่กำลังจะชำระคืน ระหว่างเปิด loanRepayModal

async function loanRepay(loanId) {
  const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;
  if (!uid) { showToast(tccT('toast_login_required_x')); return; }

  // หา loan record จาก list ที่โหลดไว้ เพื่อแสดงยอดชำระใน modal ก่อนยืนยัน
  // [FIX] เดิมใช้ browser confirm() ล้วน (ไม่ตรงดีไซน์ระบบ) → เปลี่ยนมาใช้ loanRepayModal
  // ตาม pattern เดียวกับ earnRedeemModal ที่ใช้แทน confirm() อยู่แล้วในหน้า Earn
  try {
    const loans = await dbCallRaw('getMyLoans', { uid });
    const ln = (loans || []).find(l => l.loan_id === loanId);
    if (!ln) { showToast(tccT('toast_loan_not_found')); return; }

    const interest = ln.borrow_usdt * (ln.hourly_rate / 100) * ln.hours_elapsed;
    const total    = ln.borrow_usdt + interest;

    _loanRepayTargetId = loanId;
    document.getElementById('loanRepayId').textContent          = ln.collateral_coin + ' → USDT';
    document.getElementById('loanRepayPrincipal').textContent   = parseFloat(ln.borrow_usdt).toFixed(2) + ' USDT';
    document.getElementById('loanRepayInterest').textContent    = interest.toFixed(4) + ' USDT';
    document.getElementById('loanRepayTotal').textContent       = total.toFixed(4) + ' USDT';
    document.getElementById('loanRepayCollateral').textContent  = parseFloat(ln.collateral_amount).toFixed(6) + ' ' + ln.collateral_coin;

    document.getElementById('loanRepayModal').classList.add('open');
  } catch(e) {
    showToast('❌ ' + (e.message || tccT('toast_loan_load_fail').replace('❌ ','')));
  }
}

function closeLoanRepayModal() {
  document.getElementById('loanRepayModal').classList.remove('open');
  _loanRepayTargetId = null;
}

async function confirmLoanRepay() {
  const loanId = _loanRepayTargetId;
  if (!loanId) return;
  const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : null;
  if (!uid) { showToast(tccT('toast_login_required_x')); closeLoanRepayModal(); return; }

  const btn = document.getElementById('loanRepaySubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = tccT('btn_processing'); }

  try {
    const result = await dbCallRaw('repayLoan', { uid, loan_id: loanId });
    closeLoanRepayModal();
    showToast(tccTF('toast_repay_success',{interest:(result?.interest_paid||0).toFixed(4)}));
    loanLoadMyLoans();
  } catch(e) {
    showToast('❌ ' + (e.message || tccT('err_generic')));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = tccT('confirm_repay'); }
  }
}

// ══════════════════════════════════════════════════════════════════
//  INIT — when user enters loan pages
// ══════════════════════════════════════════════════════════════════
function loanOnEnter() {
  loanFetchPrices().then(() => {
    loanRenderCoinSelector();
    loanCalcLTV();
  });
  loanLoadMyLoans();
}

// Hook into navTo — reload data when entering loan pages
(function() {
  const _origNavTo = typeof navTo === 'function' ? navTo : null;
  // We patch via event — navTo already exists, so we use MutationObserver on page-loan
  const _obs = new MutationObserver(muts => {
    muts.forEach(m => {
      if (m.target.id === 'page-loan' && m.target.classList.contains('active')) {
        loanOnEnter();
      }
      if (m.target.id === 'page-loan-flexible' && m.target.classList.contains('active')) {
        loanFetchPrices().then(() => {
          loanRenderCoinSelector();
          loanAutoSuggestBorrow(); // [FIX] เผื่อผู้ใช้กรอก/กด MAX ก่อนราคาจะโหลดเสร็จ ให้ลองคำนวณยอดแนะนำอีกครั้งหลังราคามาแล้ว
          loanCalcLTV();
        });
      }
    });
  });
  ['page-loan','page-loan-flexible'].forEach(id => {
    const el = document.getElementById(id);
    if (el) _obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
})();
