//  ไฟล์นี้ต้องวางใน <script> ของ index_easy_BN2.html
//  ตำแหน่ง: ต่อจาก USER_PROFILE (บรรทัด ~21250 — ตรวจซ้ำด้วย
//           `grep -n "const USER_PROFILE"` ก่อนแก้เสมอ)
//           ก่อน i18n block (ด้านบน)
//           (วางก่อน </body></html>)
//
//  Dependencies (ต้องมีก่อน script นี้โหลด):
//    - HIST object (บรรทัด ~16495)
//    - mainWalletBalance (บรรทัด ~12736)
//    - earnContracts[]  (บรรทัด ~12732)
//    - USER_PROFILE     (บรรทัด ~21250)
//    - showToast()      (ต้องมีใน HTML)
//    - updateSysWalletDisplay()  (ต้องมีใน HTML)
//    - _profileRender()          (ต้องมีใน HTML)
//    - _homeUpdateAvatar()       (ต้องมีใน HTML)
//
//  แนวคิด (Write-Through Cache):
//  ┌────────────────────────────────────────────────┐
//  │  User Action → ① อัปเดต UI ทันที              │
//  │             → ② เขียน localStorage ทันที      │
//  │             → ③ ใส่ Write Queue               │
//  │             → ④ Flush → GAS (background)      │
//  └────────────────────────────────────────────────┘
//
//  ฟังก์ชั่นสาธารณะที่ใช้งานได้จาก HTML:
//    saveProfile()            — บันทึก USER_PROFILE → Sheets
//    saveOpenPosition(pos)    — log Futures Open
//    saveClosePosition(...)   — log Futures Close
//    saveTrade(data)          — log Futures Trade
//    saveSpotTrade(data)      — log Spot Trade
//    saveTransaction(...)     — log Transaction (generic)
//    saveFunding(symbol, amt) — log Funding Fee
//    saveDeposit(data)        — log Deposit ★ ใหม่
//    saveWithdraw(data)       — log Withdraw ★ ใหม่
//    saveTransfer(...)        — log Internal Transfer ★ ใหม่
//    saveEarnCreate(data)     — log Earn Contract Create ★ ใหม่
//    saveEarnClaim(data)      — log Earn Claim ★ ใหม่
//    saveEarnLiquidate(data)  — log Earn Liquidate ★ ใหม่
//    snapshotPortfolio()      — snapshot daily portfolio
//    loadDashboard()          — fetch+cache dashboard data
//
//  ⚠️ ข้อห้าม:
//    - อย่า patch HIST ซ้ำ — ไฟล์นี้ patch ครบแล้ว
//    - อย่าเรียก dbCallRaw โดยตรง — ใช้ dbRead / dbWrite เท่านั้น
//    - อย่าเพิ่ม SCRIPT_URL ซ้ำ — มีอยู่แล้วบรรทัดแรก
// ══════════════════════════════════════════════════════════════════

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwocCEr-mQu6esBJBRRElo68Y2GLPJryhAShi9FSm__G9mD0TV5oa9IAa8cFxBn_GlILw/exec'; // ← แทนที่ด้วย GAS Web App URL

// [NEW] Admin Panel GAS Web App (แยกจาก SCRIPT_URL หลัก — ใช้สำหรับ action ที่ admin เป็นเจ้าของ
// เช่น getTeamBalance / getSystemBalances / distributeProfit หากฝั่ง admin deploy คนละ Web App)
const ADMIN_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxsIzb3VrtwgJM22j1BV_S5jqOwJrWHZulMsrZkhDgivJ3wxhegtQ3NB8uKGggdaEkmyQ/exec';

// [WALLET] Wallet GAS Web App — แยกจาก GAS หลักและ Admin GAS
// จัดการ: saveWallet / saveWalletTx / getWallets / getWalletTxHistory
// ไฟล์ GAS: GAS_TCC_WALLET_v1.js | Spreadsheet: แยกต่างหาก
const GAS_WALLET_URL = 'https://script.google.com/macros/s/AKfycbzqz6rAMmqZyBPYiuurD_1wGBkSTfNMYiefQlqDvXgg3SkaS6g2R2uChpBAMh8Ahn4xRw/exec';   // GAS_TCC_WALLET_v1

// ══════════════════════════════════════════════════════════════════
//  CACHE CONFIG
// ══════════════════════════════════════════════════════════════════
const CACHE_CONFIG = {
  TTL_DASHBOARD:  5  * 60 * 1000,   // Dashboard cache อายุ 5 นาที
  TTL_USER:       10 * 60 * 1000,   // User profile cache อายุ 10 นาที
  FLUSH_DELAY:    3  * 1000,         // รอ 3 วิหลังเหตุการณ์ล่าสุด แล้วค่อย flush
  MAX_QUEUE:      50,                // Queue สูงสุด 50 รายการก่อน force flush
  RETRY_MAX:      3,                 // retry สูงสุด 3 ครั้งถ้า GAS fail
  PREFIX:         'tcc_',           // localStorage key prefix
};

// ══════════════════════════════════════════════════════════════════
//  SESSION CACHE — keys ที่ต้องล้างทุกครั้งที่เปิดแอพ
//  (ไม่ใช่ถาวร — ดึงใหม่จาก GAS เสมอเมื่อเปิดแอพ)
// ══════════════════════════════════════════════════════════════════
// [v4 NEW] เพิ่ม 'commdash_'/'commref_' — cache key ใหม่ของ Commission tab (getMemberDashboard/
// getReferralDashboard ผ่าน dbRead() ดู astRenderCommissionTab) ต้องอยู่ใน list นี้เหมือนกัน
// เพื่อให้ถูกล้างตอน login/สลับ user เหมือน cache key อื่นๆ ทั้งหมด — กันข้อมูล commission ของ
// user เก่าค้างข้ามบัญชีบนเครื่องเดียวกัน (ระหว่างเซสชันเดียวกันจะไม่ถูกล้าง จึงยังใช้ cache ได้ปกติ)
const SESSION_CACHE_KEYS = ['trans_', 'positions_', 'trades_', 'spot_', 'funding_', 'dash_', 'commdash_', 'commref_'];

/**
 * ล้าง history cache ทั้งหมดของ uid ที่ระบุ
 * เรียกตอน init หลัง login สำเร็จและได้ uid แล้ว
 * ไม่แตะ: tcc_login_session, tcc_remember_me, tcc_uid, tcc_lastCoin, hl_stars, tcc_prod_clean_v1
 */
/**
 * ล้าง history cache ทั้งหมดของ uid ที่ระบุ + กวาด cache เก่าค้างจาก uid อื่น/ session อื่นด้วย
 * เรียกตอน init หลัง login สำเร็จและได้ uid แล้ว, และตอน softRefreshCurrentPage()
 * คงไว้เฉพาะ: tcc_login_session, tcc_remember_me, tcc_uid, tcc_lastCoin, hl_stars, tcc_prod_clean_v1, tcc_ref, tcc_ss_members
 * (เป็น user preference/session ไม่ใช่ data cache — ไม่เกี่ยวกับ DD/Liquidation/Contract state)
 */
function _clearSessionCache(uid) {
  if (!uid) return;
  SESSION_CACHE_KEYS.forEach(prefix => {
    try { localStorage.removeItem('tcc_' + prefix + uid); } catch(e) {}
  });
  // [v9 FIX] กวาด cache ตกค้างจาก uid อื่น/รอบก่อนด้วย — กัน contract/position/dashboard cache ซ้ำซ้อน
  // ที่ไม่ใช่ของ uid ปัจจุบันแต่ยังหลงเหลืออยู่ใน localStorage (เช่น สลับ account บนเครื่องเดียวกัน)
  try {
    Object.keys(localStorage).forEach(k => {
      if (!k.startsWith('tcc_')) return;
      const isStaleDataCache = SESSION_CACHE_KEYS.some(prefix => k.startsWith('tcc_' + prefix));
      if (isStaleDataCache) localStorage.removeItem(k);
    });
  } catch(e) {}
  // reset first-load flags → _mergeIntoHIST จะ replace แทน append ในการโหลดครั้งต่อไป
  if (typeof _histFirstLoaded !== 'undefined') {
    Object.keys(_histFirstLoaded).forEach(k => { delete _histFirstLoaded[k]; });
  }
  // [FIX-RECOVERY] เดิมลบ write queue ทิ้งแบบไม่มีเงื่อนไข — ถ้ามีคำสั่งเขียนที่ fail ค้างอยู่จริง
  // (เช่น ปิด Position ตอนเน็ตหลุด) จะหายไปเลยตอน logout/สลับ user โดยไม่มีโอกาส retry
  // ตอนนี้: ลอง flush ให้จบก่อน (best-effort, ไม่ block การ clear) แล้วค่อยลบ queue ของ uid เดิมทิ้ง
  try { QUEUE.flush(); } catch(e) {}
  try { localStorage.removeItem('tcc__write_queue'); } catch(e) {}
  try { localStorage.removeItem('tcc__dead_queue'); } catch(e) {}
  console.log('[SessionCache] cleared for uid:', uid);
}

// ══════════════════════════════════════════════════════════════════
//  STORAGE HELPERS — อ่าน/เขียน localStorage อย่างปลอดภัย
// ══════════════════════════════════════════════════════════════════
const LS = {
  get(key) {
    try {
      const raw = localStorage.getItem(CACHE_CONFIG.PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, value) {
    try {
      localStorage.setItem(CACHE_CONFIG.PREFIX + key, JSON.stringify(value));
    } catch (e) {
      if (e.name === 'QuotaExceededError') LS.evictOld();
    }
  },
  del(key) {
    try { localStorage.removeItem(CACHE_CONFIG.PREFIX + key); } catch {}
  },
  evictOld() {
    const now = Date.now();
    Object.keys(localStorage).forEach(k => {
      if (!k.startsWith(CACHE_CONFIG.PREFIX)) return;
      try {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && v._exp && v._exp < now) localStorage.removeItem(k);
      } catch { localStorage.removeItem(k); }
    });
  },
  setWithTTL(key, value, ttl) {
    LS.set(key, { ...value, _exp: Date.now() + ttl, _ts: Date.now() });
  },
  getIfFresh(key) {
    const v = LS.get(key);
    if (!v) return null;
    if (v._exp && v._exp < Date.now()) { LS.del(key); return null; }
    return v;
  },
};

// [FIX Bug#5] ── ตรวจ "permanent error" (business-logic rejection) vs "transient error" (network/timeout) ──
// ปัญหาเดิม: dbWrite()/QUEUE.flush() เก็บทุก error เข้า retry queue เหมือนกันหมด ไม่แยกว่า
// error นี้คือ "เครือข่ายขัดข้องชั่วคราว ลองใหม่แล้วน่าจะผ่าน" หรือ "GAS ปฏิเสธตามกฎธุรกิจ
// ลองอีกกี่ครั้งก็ไม่ผ่านแน่ๆ" (เช่น [DUPLICATE] claim ซ้ำ, หรือ "already has an Active position")
// ผลคือ op ที่ fail แบบ permanent จะค้างอยู่หัว queue แล้ว QUEUE.flush() break ออกทุกรอบ
// (ดูฟังก์ชัน flush ด้านล่าง) → ปิดกั้น op อื่นๆที่เข้าคิวตามมาไม่ให้ถูกส่งไป GAS เลย
// จนกว่า op พังจะถูก retry ครบ RETRY_MAX แล้วถูกโยนเข้า dead queue — ระหว่างนั้น UI
// (เช่น My Contracts card หลังปิด position) จะไม่อัปเดตจนกว่าจะ refresh หน้าใหม่
// (ซึ่งไป loadOfflineState() ดึงสดจาก GAS ตรงๆ ข้าม queue ที่ติดอยู่)
function _isPermanentDbError(message) {
  if (!message) return false;
  const m = String(message);
  return m.includes('[DUPLICATE]') ||
         m.includes('already has an Active position') ||
         m.includes('ไม่มีกำไรให้ Claim ในขณะนี้') ||
         m.includes('Contract ID already exists') ||
         m.includes('สัญญานี้ไม่มีกำไรให้ Claim') ||
         // [FIX-OSC-SILENT] GAS logPositionWithGuard rejections — business-logic, retry ไม่มีประโยชน์
         m.includes('ขนาดออเดอร์เกินขีดจำกัด') ||
         m.includes('วงเงินเทรด 10%') ||
         m.includes('เกินวงเงินคงเหลือ') ||
         m.includes('Contract frozen') ||
         m.includes('Contract is frozen') ||
         m.includes('Contract matured') ||
         m.includes('Fixed (APT-only)') ||
         m.includes('กรุณาเลือก Earn Contract') ||
         // [NEW v2.46 AUTO-RENEW] logEarnRedeem reject เพราะสัญญาถูกต่ออายุอัตโนมัติไปแล้ว
         // (status กลับเป็น active ก่อน user กด Redeem บน local state ที่ยังค้างเป็น matured) —
         // business-logic reject จริง retry ไปก็ fail ซ้ำตลอด ต้อง sync สดแทน ไม่ใช่ queue retry
         m.includes('ยังไม่ครบกำหนด ไม่สามารถรับเงินต้นคืนได้') ||
         m.includes('รับเงินต้นคืนไปแล้ว');
}

// ══════════════════════════════════════════════════════════════════
//  WRITE QUEUE — รวม write ops แล้ว flush ไป GAS เป็น batch
// ══════════════════════════════════════════════════════════════════
const QUEUE = {
  _q:        [],
  _timer:    null,
  _flushing: false,

  push(op) {
    const existing = this._q.findIndex(
      x => x.action === op.action && x.data && op.data && x.data.id === op.data.id
    );
    if (existing > -1) this._q[existing] = op;
    else this._q.push({ ...op, _retry: 0, _ts: Date.now() });

    LS.set('_write_queue', this._q);

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), CACHE_CONFIG.FLUSH_DELAY);

    if (this._q.length >= CACHE_CONFIG.MAX_QUEUE) {
      clearTimeout(this._timer);
      this.flush();
    }
  },

  async flush() {
    if (this._flushing || this._q.length === 0) return;
    this._flushing = true;

    while (this._q.length > 0) {
      const op = this._q[0];
      try {
        await dbCallRaw(op.action, op.data);
        this._q.shift();
        LS.set('_write_queue', this._q);
      } catch (err) {
        // [FIX Bug#5] Permanent error (business-logic rejection) → ตัดทิ้งทันที ไม่ retry
        // ไม่งั้น op นี้จะค้างหัว queue แล้ว break ด้านล่างจะบล็อก op อื่นที่เข้าคิวตามมาทั้งหมด
        if (_isPermanentDbError(err.message)) {
          console.warn('[QUEUE] Permanent error — dropping (no retry):', op.action, err.message);
          this._q.shift();
          LS.set('_write_queue', this._q);
          continue; // ไปทำ op ถัดไปในคิวต่อทันที ไม่ break
        }
        op._retry = (op._retry || 0) + 1;
        console.warn('[QUEUE] Failed (' + op._retry + '/' + CACHE_CONFIG.RETRY_MAX + '):', op.action, err.message);
        if (op._retry >= CACHE_CONFIG.RETRY_MAX) {
          const dead = LS.get('_dead_queue') || [];
          dead.push({ ...op, _failedAt: new Date().toISOString() });
          LS.set('_dead_queue', dead.slice(-20));
          this._q.shift();
          LS.set('_write_queue', this._q);
          // [v9.0] แจ้งเตือนเมื่อ action สำคัญ sync ไป GAS ไม่สำเร็จ
          if (op.action === 'updateEarnContract' || op.action === 'updateBalance') {
            if (typeof showToast === 'function') {
              showToast(tccTF('toast_sync_fail_generic',{action:op.action}), 'warn');
            }
          }
        } else {
          break;
        }
      }
    }

    this._flushing = false;
    if (this._q.length > 0) {
      this._timer = setTimeout(() => this.flush(), 15000);
    }
  },

  restore() {
    const saved = LS.get('_write_queue');
    if (saved && Array.isArray(saved) && saved.length > 0) {
      this._q = saved;
      console.warn('[QUEUE] Restored', saved.length, 'pending ops');
      setTimeout(() => this.flush(), 3000);
    }
  },
};

// ══════════════════════════════════════════════════════════════════
//  CORE API
// ══════════════════════════════════════════════════════════════════
async function dbCallRaw(action, data = {}) {
  // [v5 FIX SLOW-LOAD/BLACK-SCREEN] เดิม fetch() ไม่มี timeout เลย — ถ้า GAS ช้า/ค้าง
  // (cold start, ScriptLock รอสูงสุด 10s ใน _autoLiquidateContract ฯลฯ) request จะรอ
  // เงียบๆไม่มีสัญญาณอะไรบอกผู้ใช้ ทำให้ต้อง reload เอง (ซึ่งพอ reload cache มักช่วยให้
  // ดูเหมือนผ่านครั้งที่ 2) แก้: ใส่ AbortController timeout 20s + error message ชัดเจน
  const _ctrl = new AbortController();
  const _timeoutMs = 20000;
  const _timer = setTimeout(() => _ctrl.abort(), _timeoutMs);
  try {
    const res = await fetch(SCRIPT_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify({ action, data }),
      redirect: 'follow',
      signal:   _ctrl.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'GAS error: ' + action);
    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('[Timeout] เชื่อมต่อเซิร์ฟเวอร์ช้าเกิน ' + (_timeoutMs / 1000) + 's: ' + action);
    }
    throw err;
  } finally {
    clearTimeout(_timer);
  }
}

// [NEW] เรียก Admin Web App (ADMIN_SCRIPT_URL) — สำหรับ action ที่อยู่บน admin GAS
// เช่น getFundingBalance, getTeamBalance, getSystemBalances
async function dbCallRawAdmin(action, data = {}) {
  // [v5 FIX SLOW-LOAD/BLACK-SCREEN] เหมือน dbCallRaw ด้านบน — เพิ่ม timeout กันค้างไม่จำกัดเวลา
  const _ctrl = new AbortController();
  const _timeoutMs = 20000;
  const _timer = setTimeout(() => _ctrl.abort(), _timeoutMs);
  try {
    const res = await fetch(ADMIN_SCRIPT_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify({ action, data }),
      redirect: 'follow',
      signal:   _ctrl.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Admin GAS error: ' + action);
    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('[Timeout] Admin เชื่อมต่อเซิร์ฟเวอร์ช้าเกิน ' + (_timeoutMs / 1000) + 's: ' + action);
    }
    throw err;
  } finally {
    clearTimeout(_timer);
  }
}

// [WALLET] เรียก Wallet GAS Web App (GAS_WALLET_URL) — สำหรับ wallet action ทั้งหมด
// saveWallet / saveWalletTx / getWallets / getWalletTxHistory
async function dbCallRawWallet(action, data = {}) {
  if (!GAS_WALLET_URL) {
    console.warn('[Wallet GAS] GAS_WALLET_URL ยังไม่ได้ตั้งค่า — ข้ามการส่งข้อมูล');
    return null;
  }
  const _ctrl     = new AbortController();
  const _timeoutMs = 20000;
  const _timer    = setTimeout(() => _ctrl.abort(), _timeoutMs);
  try {
    const res = await fetch(GAS_WALLET_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify({ action, data }),
      redirect: 'follow',
      signal:   _ctrl.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Wallet GAS error: ' + action);
    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('[Timeout] Wallet GAS เชื่อมต่อช้าเกิน ' + (_timeoutMs / 1000) + 's: ' + action);
    }
    throw err;
  } finally {
    clearTimeout(_timer);
  }
}

async function dbReadAdmin(action, data = {}, cacheKey, ttl) {
  const cached = cacheKey ? LS.getIfFresh(cacheKey) : null;
  if (cached) {
    dbCallRawAdmin(action, data).then(fresh => {
      if (cacheKey) LS.setWithTTL(cacheKey, { data: fresh }, ttl || CACHE_CONFIG.TTL_DASHBOARD);
    }).catch(() => {});
    return cached.data;
  }
  const result = await dbCallRawAdmin(action, data);
  if (cacheKey) LS.setWithTTL(cacheKey, { data: result }, ttl || CACHE_CONFIG.TTL_DASHBOARD);
  return result;
}

async function dbRead(action, data = {}, cacheKey, ttl) {
  const cached = cacheKey ? LS.getIfFresh(cacheKey) : null;
  if (cached) {
    dbCallRaw(action, data).then(fresh => {
      if (cacheKey) LS.setWithTTL(cacheKey, { data: fresh }, ttl || CACHE_CONFIG.TTL_DASHBOARD);
    }).catch(() => {});
    return cached.data;
  }
  const result = await dbCallRaw(action, data);
  if (cacheKey) LS.setWithTTL(cacheKey, { data: result }, ttl || CACHE_CONFIG.TTL_DASHBOARD);
  return result;
}

function dbWrite(action, data, cacheUpdateFn) {
  if (typeof cacheUpdateFn === 'function') cacheUpdateFn();
  // [NO-CACHE] ส่งตรงไป GAS ทันทีก่อนเสมอ ไม่ผ่าน queue ตั้งแต่ต้น
  // ป้องกันปัญหาบันทึกซ้ำตอนรีเฟรช/เปิดแอพใหม่ (เดิม QUEUE เก็บ pending ops ไว้ใน LS แล้ว replay ซ้ำทุก write)
  // [BUGFIX] return promise กลับออกไปด้วย (เดิมทิ้งไปเฉยๆ) เพื่อให้ caller ที่ต้องการ
  // รอผลเขียนจริงจบก่อน (เช่น saveOpenPosition → _refreshContractLiqMap) ทำได้
  // — caller เดิมที่ไม่ใช้ return value ทำงานเหมือนเดิมทุกประการ
  //
  // [FIX-RECOVERY] เดิมเมื่อ dbCallRaw fail จะแค่ log + toast แล้วข้อมูลหายไปเลย — ไม่มีทางกู้คืน
  // ตอนนี้: ถ้า fail ครั้งแรก → เก็บเข้า QUEUE (persist ลง localStorage) เพื่อ retry อัตโนมัติ
  // และให้ QUEUE.restore() ดึงกลับมา retry ได้ถ้า user ปิดแอพไปก่อนที่จะ retry สำเร็จ
  return dbCallRaw(action, data).catch(err => {
    console.error('[dbWrite] Failed:', action, err.message);
    // [FIX Bug#5] Permanent error (เช่น [DUPLICATE], already has an Active position)
    // → ไม่ส่งเข้า QUEUE เลย เพราะ retry ไปก็ fail เหมือนเดิมทุกครั้ง มีแต่จะไปค้างบล็อก
    // op อื่นๆที่เข้าคิวตามมา (ดู QUEUE.flush) จนกว่าจะ refresh หน้าใหม่
    if (_isPermanentDbError(err.message)) {
      console.warn('[dbWrite] Permanent error — skip queue:', action, err.message);
      // [FIX-OSC-SILENT] ถ้าเป็น GAS guard rejection (business-logic) — แจ้ง user ทันที
      // เดิม: return เงียบ → user ไม่รู้ว่า GAS reject → position ปรากฏบน UI แล้วหายตอน refresh
      // ใหม่: ดึง error message จาก GAS มาแสดง toast ให้ user เห็นชัดเจน
      if (typeof showToast === 'function') {
        const _gasMsg = err.message || '';
        // แยก user-facing message ออกจาก [logOpen] prefix
        const _userMsg = _gasMsg.replace(/\[logOpen\]\s*/g, '').replace(/\s*Contract:.*$/g, '');
        showToast('❌ ' + (_userMsg || tccT('toast_order_rejected_default')));
      }
      // [FIX-OSC-ROLLBACK] throw กลับออกไป เพื่อให้ HIST.logOpen wrapper rollback position ที่เพิ่มไปแล้ว
      throw err;
    }
    QUEUE.push({ action, data });
    console.warn('[dbWrite] Queued for retry/recovery:', action);
    if (typeof showToast === 'function') {
      showToast(tccTF('toast_save_fail_retry',{action}), 'warn');
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  MESSAGES INBOX [v3.2] — กล่องข้อความจาก admin (personal + broadcast)
//  ──────────────────────────────────────────────────────────────
//  ใช้ action getMyMessages / markMessageRead / markAllMessagesRead
//  (SCRIPT_URL — ไฟล์นี้ฝั่ง Member App GAS อ่าน sheet AdminMessages ที่
//   Admin Panel GAS เป็นเจ้าของ) — ผ่าน dbCallRaw เดิม ไม่ใช้ Admin URL
// ══════════════════════════════════════════════════════════════════
let _msgList = [];
let _msgUnreadCount = 0;

function _msgCurrentUid() {
  const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
  return (_sess && _sess.uid) ? String(_sess.uid).trim()
       : ((typeof USER_PROFILE !== 'undefined' && USER_PROFILE.uid) ? String(USER_PROFILE.uid).trim() : '');
}

/** ดึง unread_count จาก GAS แล้วอัปเดต badge ที่กระดิ่งข้อความ (เรียกตอน init + polling) */
async function msgRefreshBadge() {
  const uid = _msgCurrentUid();
  if (!uid) return;
  try {
    const res = await dbCallRaw('getMyMessages', { uid });
    _msgUnreadCount = (res && res.unread_count) || 0;
    const badge = document.getElementById('hm-msg-badge');
    if (!badge) return;
    if (_msgUnreadCount > 0) {
      badge.textContent = _msgUnreadCount > 99 ? '99+' : String(_msgUnreadCount);
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.warn('[msgRefreshBadge] fail (ignored):', err.message);
  }
}

/** เปิด inbox — โหลดรายการข้อความ แล้ว auto-mark ทั้งหมดว่าอ่านแล้ว */
async function msgOpenInbox() {
  document.getElementById('ast-overlay-messages').classList.add('visible');
  document.getElementById('ast-sheet-messages').classList.add('open');
  await msgLoadList();
  // [auto-mark read] เปิด inbox แล้วถือว่าอ่านแล้วทั้งหมด — mark เงียบๆ เบื้องหลัง
  // ไม่ block การแสดงผล ไม่ throw ถ้า fail (ผู้ใช้ยังเห็นข้อความได้ปกติ)
  if (_msgUnreadCount > 0) {
    const uid = _msgCurrentUid();
    if (uid) {
      dbCallRaw('markAllMessagesRead', { uid }).then(() => {
        _msgList.forEach(m => { m.read = true; });
        _msgUnreadCount = 0;
        const badge = document.getElementById('hm-msg-badge');
        if (badge) badge.style.display = 'none';
        msgRenderList();
      }).catch(err => console.warn('[msgOpenInbox] markAllMessagesRead fail (ignored):', err.message));
    }
  }
}

function msgCloseInbox() {
  document.getElementById('ast-overlay-messages').classList.remove('visible');
  document.getElementById('ast-sheet-messages').classList.remove('open');
}

async function msgLoadList() {
  const box = document.getElementById('msg-list');
  const uid = _msgCurrentUid();
  if (!uid) { box.innerHTML = `<div style="text-align:center;color:var(--t3);font-size:12px;padding:30px 0"><span data-i18n="login_required">${tccT('login_required')}</span></div>`; return; }
  try {
    const res = await dbCallRaw('getMyMessages', { uid });
    _msgList = (res && res.messages) || [];
    _msgUnreadCount = (res && res.unread_count) || 0;
    msgRenderList();
  } catch (err) {
    console.warn('[msgLoadList] fail:', err.message);
    box.innerHTML = `<div style="text-align:center;color:var(--r);font-size:12px;padding:30px 0"><span data-i18n="load_msg_fail">${tccT('load_msg_fail')}</span></div>`;
  }
}

function _msgFdt(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' +
           d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(dt); }
}

function msgRenderList() {
  const box = document.getElementById('msg-list');
  if (!box) return;
  if (!_msgList.length) {
    box.innerHTML = `<div style="text-align:center;color:var(--t3);font-size:12px;padding:30px 0"><span data-i18n="no_message">${tccT('no_message')}</span></div>`;
    return;
  }
  box.innerHTML = _msgList.map(m => `
    <div onclick="msgTapItem('${m.message_id}')" style="background:${m.read ? 'var(--bg3)' : 'var(--bg4)'};border:1px solid ${m.read ? 'var(--border)' : 'var(--y)'};border-radius:var(--rmd);padding:10px 12px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          ${!m.read ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--r);flex-shrink:0"></span>' : ''}
          <span style="font-size:13px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.type === 'broadcast' ? '📢 ' : '📨 '}${_msgEsc(m.title || '(ไม่มีหัวข้อ)')}</span>
        </div>
        <span style="font-size:10px;color:var(--t3);flex-shrink:0">${_msgFdt(m.created_at)}</span>
      </div>
      <div style="font-size:12px;color:var(--t2);margin-top:4px;line-height:1.5;white-space:pre-wrap">${_msgEsc(m.body || '')}</div>
    </div>
  `).join('');
}

function _msgEsc(s) {
  const d = document.createElement('div');
  d.textContent = String(s || '');
  return d.innerHTML;
}

/** กดข้อความ 1 อัน — mark read เฉพาะอันนี้ (เผื่อ auto-mark-all ด้านบน fail) */
async function msgTapItem(messageId) {
  const m = _msgList.find(x => x.message_id === messageId);
  if (!m || m.read) return;
  const uid = _msgCurrentUid();
  if (!uid) return;
  m.read = true; // optimistic update
  msgRenderList();
  try {
    await dbCallRaw('markMessageRead', { uid, message_id: messageId });
    _msgUnreadCount = Math.max(0, _msgUnreadCount - 1);
    const badge = document.getElementById('hm-msg-badge');
    if (badge) {
      if (_msgUnreadCount > 0) { badge.textContent = _msgUnreadCount > 99 ? '99+' : String(_msgUnreadCount); }
      else { badge.style.display = 'none'; }
    }
  } catch (err) {
    console.warn('[msgTapItem] markMessageRead fail (ignored):', err.message);
  }
}

async function msgMarkAllRead() {
  const uid = _msgCurrentUid();
  if (!uid) return;
  try {
    await dbCallRaw('markAllMessagesRead', { uid });
    _msgList.forEach(m => { m.read = true; });
    _msgUnreadCount = 0;
    const badge = document.getElementById('hm-msg-badge');
    if (badge) badge.style.display = 'none';
    msgRenderList();
    if (typeof showToast === 'function') showToast(tccT('toast_all_read'));
  } catch (err) {
    console.warn('[msgMarkAllRead] fail:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════
//  CACHE UTILITIES
// ══════════════════════════════════════════════════════════════════
function _cacheAppend(key, item) {
  const list = LS.get(key) || [];
  // [v13.2 FIX] เพิ่ม id/time/ts ถ้าไม่มี เพื่อให้ _mergeIntoHIST ทำงานได้
  const now = Date.now();
  const enriched = {
    id:   item.id   || (String(now) + Math.random().toString(36).slice(2,6)),
    time: item.time || new Date(now).toISOString().replace('T',' ').slice(0,19),
    ts:   item.ts   || now,
    ...item,
    _ts:  now,
  };
  list.unshift(enriched);
  // [SESSION TTL] ใช้ setWithTTL แทน set → cache หมดอายุใน 30 นาที (session เท่านั้น)
  // ไม่เก็บถาวร — เปิดแอพใหม่หลังจาก 30 นาที = ดึง GAS ใหม่เสมอ
  LS.setWithTTL(key, list.slice(0, 200), 30 * 60 * 1000);
}

function _cacheUpdateItem(key, id, patch) {
  const list = LS.get(key) || [];
  const idx = list.findIndex(x => x.id === id);
  if (idx > -1) Object.assign(list[idx], patch);
  // [SESSION TTL] ต่ออายุ TTL เมื่ออัปเดต item
  LS.setWithTTL(key, list, 30 * 60 * 1000);
}

function _invalidateDashCache() {
  LS.del('dash_' + USER_PROFILE.uid);
}

// ══════════════════════════════════════════════════════════════════
//  HIGH-LEVEL WRITE FUNCTIONS
// ══════════════════════════════════════════════════════════════════

// ── Dashboard (Read) ──────────────────────────────────────────────
async function loadDashboard() {
  // [FIX dashboard-uid] USER_PROFILE.uid อาจยังเป็นค่า hardcode default
  // ถ้า loadDashboard ถูกเรียกก่อน autoLoginFromMembers ทำงานเสร็จ
  // → อ่าน uid จาก session โดยตรงก่อน (เหมือน loadOfflineState)
  const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
  const uid = (_sess && _sess.uid) ? String(_sess.uid).trim() : USER_PROFILE.uid;
  if (USER_PROFILE.uid !== uid) USER_PROFILE.uid = uid; // sync ให้ component อื่นใช้ uid ถูกต้องด้วย
  const cacheKey = 'dash_' + uid;
  // [GAS-FIRST] ดึงจาก GAS ก่อนเสมอ — ไม่ใช้ cache-first อีกต่อไป
  // cache ใช้เฉพาะเป็น fallback เมื่อ GAS fail เท่านั้น
  let dash = null;
  try {
    dash = await dbCallRaw('getDashboard', { uid });
    if (dash) LS.setWithTTL(cacheKey, { data: dash }, CACHE_CONFIG.TTL_DASHBOARD);
  } catch(e) {
    console.warn('[loadDashboard] GAS fail, trying cache fallback:', e.message);
    const cached = LS.getIfFresh(cacheKey);
    if (cached) dash = cached.data;
  }

  if (dash && dash.user) {
    const u = dash.user;

    Object.assign(USER_PROFILE, {
      username:  u.username  || USER_PROFILE.username,
      regEmail:  u.email     || USER_PROFILE.regEmail,
      vipLevel:  u.vip_level !== undefined ? u.vip_level : USER_PROFILE.vipLevel,
      verified:  u.verified  !== undefined ? u.verified  : USER_PROFILE.verified,
      legalName: u.legal_name || USER_PROFILE.legalName,
      dob:       u.dob        || USER_PROFILE.dob,
      country:   u.country    || USER_PROFILE.country,
    });
    if (u.main_balance !== undefined) { const _b = parseFloat(u.main_balance); if (!isNaN(_b)) mainWalletBalance = _b; }
    if (u.funding_balance !== undefined) { const _fb = parseFloat(u.funding_balance); if (!isNaN(_fb)) fundingWalletBalance = _fb; }
    if (typeof _profileRender === 'function') _profileRender();
    if (typeof _homeUpdateAvatar === 'function') _homeUpdateAvatar();
    if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
    // [FIX-1] ได้ยอดจาก getDashboard แล้ว → อัปเดต Overview/Spot ทันที ไม่รอ Admin GAS
    window._dashboardReady = true;

    // [SPOT-FIX] โหลด per-coin spot balances จาก GAS เข้า spotWallet
    if (dash.spotCoins && Array.isArray(dash.spotCoins)) {
      dash.spotCoins.forEach(function(entry) {
        const coin = String(entry.coin || '').toUpperCase();
        if (!coin || coin === 'USDT') return; // USDT = mainWalletBalance เสมอ
        const bal = parseFloat(entry.balance) || 0;
        if (!spotWallet[coin]) spotWallet[coin] = { bal: 0, locked: 0 };
        spotWallet[coin].bal = bal;
      });
    }

    if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
    if (typeof renderSpotBalanceList  === 'function') renderSpotBalanceList();
  }

  // [AUTH] รวม member data (ถ้า user record ยังไม่มีใน Users Sheet)
  if (dash && dash.member && !USER_PROFILE._memberLoaded) {
    _applyMemberToProfile(dash.member);
  }

  if (dash && dash.trades)       _mergeIntoHIST('tradeHistory',       dash.trades);
  if (dash && dash.spotTrades)   _mergeIntoHIST('spotTradeHistory',   dash.spotTrades);
  if (dash && dash.positions)    _mergeIntoHIST('positionHistory',    dash.positions.filter(p => p.status !== 'Active'));
  if (dash && dash.orderHistory) _mergeIntoHIST('orderHistory',       dash.orderHistory); // [v8.9 NEW] — เดิมไม่มี endpoint/merge ใดส่ง Order History กลับมาเลย
  if (dash && dash.funding)      _mergeIntoHIST('fundingFee',         dash.funding);

  // [FIX-TX-CLEAR] ถ้า GAS คืน transactions field (แม้จะเป็น array ว่าง) = GAS บอกว่าไม่มีข้อมูล
  // → ล้าง HIST.transactionHistory และ cache trans_ ก่อน merge เพื่อป้องกัน cache เก่าค้างแสดง
  if (dash && Array.isArray(dash.transactions)) {
    if (dash.transactions.length === 0) {
      // GAS ยืนยันว่าไม่มีข้อมูล → clear ทั้ง memory และ local cache
      HIST.transactionHistory = [];
      try { LS.del('trans_' + uid); } catch(e) {}
    } else {
      _mergeIntoHIST('transactionHistory', dash.transactions);
    }
  }

  // [NO-CACHE] ไม่ merge cache transactions จาก trans_ อีกต่อไป — ใช้ข้อมูลจาก GAS เท่านั้น
  // (เดิม merge cache เข้า HIST ทำให้รายการเก่าที่เคยบันทึกไปแล้วโผล่ซ้ำเป็น "ออเดอร์ใหม่")

  // [v8] merge earnContracts status จาก GAS response (ถ้ามี)
  if (dash && dash.earnContracts && Array.isArray(dash.earnContracts) && typeof earnContracts !== 'undefined') {
    _mergeDashEarnContracts(dash.earnContracts);
  }

  // [NEW] ดึง funding_balance / team / system balances จาก Admin GAS (best-effort, ไม่ block dashboard)
  if (typeof dbReadAdmin === 'function' && uid) {
    _setAdminLoading(true);
    Promise.allSettled([
      dbReadAdmin('getFundingBalance', { uid }, 'fundbal_' + uid, CACHE_CONFIG.TTL_USER)
        .then(r => {
          const fb = r && (r.funding_balance !== undefined ? r.funding_balance : r);
          const _fb = parseFloat(fb);
          if (!isNaN(_fb)) {
            fundingWalletBalance = _fb;
            if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
          }
        }),
      dbReadAdmin('getTeamBalance', { uid, teamName: (USER_PROFILE && USER_PROFILE.team) || '' }, 'teambal_' + uid, CACHE_CONFIG.TTL_USER)
        .then(r => { window._teamBalance = r; }),
      dbReadAdmin('getSystemBalances', {}, 'sysbal', CACHE_CONFIG.TTL_USER)
        .then(r => {
          if (r && typeof sysWalletState !== 'undefined') {
            Object.assign(sysWalletState, r);
            if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();
          }
        }),
    ]).finally(() => _setAdminLoading(false));
  }

  return dash;
}

// [NEW] toggle loading indicator สำหรับ admin-balance sync (Funding/Team/System)
function _setAdminLoading(isLoading) {
  let el = document.getElementById('adminBalanceLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'adminBalanceLoading';
    el.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9998;background:rgba(0,0,0,0.6);color:#fff;font-size:11px;padding:4px 10px;border-radius:12px;display:none;pointer-events:none';
    el.textContent = 'Syncing balances…';
    document.body.appendChild(el);
  }
  el.style.display = isLoading ? 'block' : 'none';
}

// ── [v8] _mergeDashEarnContracts ─────────────────────────────────────────
function _mergeDashEarnContracts(gasContracts) {
  if (!Array.isArray(gasContracts) || !gasContracts.length) return;
  let changed = false;
  const _nowH = new Date().getHours();
  const _restoredFundedHour = Math.floor(_nowH / 8) * 8;
  gasContracts.forEach(gc => {
    const cid   = gc.contract_id || gc.contractId;
    const local = earnContracts.find(x => x.contractId === cid);
    if (!local) {
      // [v5 FIX] สัญญาใน GAS ที่ไม่มีใน local (เช่น สร้างแล้ว logEarnCreate ส่งสำเร็จ
      // แต่ syncEarnContractsToGAS ยังไม่ได้รัน / เปิดจากอุปกรณ์อื่น)
      // → add เข้า earnContracts array แทนที่จะ skip
      earnContracts.push({
        contractId:      cid,
        uid:             gc.uid || (typeof USER_PROFILE !== 'undefined' ? USER_PROFILE.uid : ''),
        userId:          gc.uid || '',
        stakedAmount:    parseFloat(gc.staked_amount)    || 0,
        principal:       parseFloat(gc.staked_amount)    || 0,
        currentBalance:  parseFloat(gc.current_balance)  || 0,
        frozenBalance:   parseFloat(gc.frozen_balance)   || 0,
        planDays:        parseInt(gc.plan_days)           || 0,
        dailyYield:      parseFloat(gc.daily_yield_pct)  || 0,
        startTime:       parseInt(gc.start_time_ms)       || 0,
        endTime:         parseInt(gc.end_time_ms)         || 0,
        status:          gc.status                        || 'active',
        realizedPnl:     parseFloat(gc.realized_pnl)     || 0,
        totalClaimed:    parseFloat(gc.total_claimed)     || 0,
        lastYieldTimeMs: parseInt(gc.last_yield_time_ms)  || 0,
        lastYieldDay:    parseInt(gc.last_yield_day)      || 0,
        lastAptClaimMs:  parseInt(gc.last_apt_claim_ms)   || 0,
        _lastFundedHour: _restoredFundedHour,
        _gasDrawdown:    parseFloat(gc.drawdown_pct)      || 0,
        // [NEW: TIER] 'standard' | 'vip'
        contractTier:    (String(gc.contract_tier || '').toLowerCase() === 'vip') ? 'vip' : 'standard',
      });
      changed = true;
      return;
    }
    if (gc.status && gc.status !== local.status) { local.status = gc.status; changed = true; }
    // [FIX Bug#6] Pending-Earn-Sync Guard — เหมือนใน loadOfflineState merge: ถ้าสัญญานี้เพิ่งปิด
    // position ไปเองภายในไม่กี่วินาทีก่อน ให้ "เชื่อ local" ก่อน ไม่รับค่าจาก GAS round นี้
    // (กัน setTimeout 1.5s ใน saveClosePosition ดึงค่าที่ GAS ยังไม่ commit เสร็จมาทับ)
    const _esUntil2 = window._pendingEarnSync ? (window._pendingEarnSync[cid] || 0) : 0;
    const _holdEarnSync2 = Date.now() < _esUntil2;
    if (!_holdEarnSync2 && window._pendingEarnSync) delete window._pendingEarnSync[cid];
    if (_holdEarnSync2) return; // ข้ามสัญญานี้ทั้งก้อนในรอบ merge นี้ — รอ guard หมดอายุก่อน
    if (gc.current_balance !== undefined) { local.currentBalance = parseFloat(gc.current_balance) || local.currentBalance; changed = true; }
    if (gc.frozen_balance  !== undefined) { local.frozenBalance  = parseFloat(gc.frozen_balance)  || local.frozenBalance;  changed = true; }
    // [FIX-1] overwrite realizedPnl จาก GAS เสมอ (Source of Truth)
    // เดิมใช้ || 0 → เมื่อ GAS ส่ง realized_pnl=0 มา local ยังคงค่าเก่าบวมไว้ ทำให้ UI แสดงยอดเกินจริง
    if (gc.realized_pnl !== undefined) {
      const _gasRpnl = parseFloat(gc.realized_pnl);
      local.realizedPnl    = isNaN(_gasRpnl) ? 0 : _gasRpnl;
      local.realized_pnl   = local.realizedPnl; // keep alias in sync
      changed = true;
    }
    if (gc.total_claimed   !== undefined) { local.totalClaimed   = parseFloat(gc.total_claimed)   || 0; changed = true; }
  });
  if (changed) {
    if (typeof renderEarnContracts    === 'function') renderEarnContracts();
    if (typeof renderPositions        === 'function') renderPositions();
    // [vx3 FIX-EARN-TIMING] อัปเดต Overview/Futures หลัง earnContracts merge เสร็จ
    // เดิม: updateOverviewBalances() ถูกเรียกที่ line 24557 ก่อน _mergeDashEarnContracts (line 24589)
    // ผล: earnContracts ยังเป็นค่าเก่า (local only) → Earn tab = 26,457 แต่ Futures = 31,907
    // ใหม่: เรียกซ้ำหลัง merge เสร็จ → Overview/Futures/Earn ใช้ค่าจาก GAS ทันที ไม่ต้องรอ refresh
    if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
    const selC = (typeof selectedEarnContractId !== 'undefined')
      ? earnContracts.find(x => x.contractId === selectedEarnContractId) : null;
    if (selC && typeof updateRiskWarnings === 'function') updateRiskWarnings(selC);
  }
}

// ── [v8] renderPositionsWithDD — สำหรับ getOpenPositionsWithDD response ─
function renderPositionsWithDD(positions, contractDDMap) {
  if (!Array.isArray(positions) || !contractDDMap) return;
  // [v16 FIX] เดิม "= contractDDMap" ทับ window._contractDDMap ทั้งอัน — ถ้า response นี้มีแค่บางสัญญา
  // (เช่นเฉพาะที่มี position เปิดอยู่) ค่า DD/Frozen ของสัญญาอื่นที่เคย sync ไว้ก่อนหน้าจะหายไปทันที
  // เปลี่ยนเป็น merge เข้า map เดิมแทน เพื่อไม่ให้ contract อื่นกลายเป็นไม่มีข้อมูล (null) ทั้งที่เพิ่งมีเมื่อกี้
  window._contractDDMap = Object.assign({}, window._contractDDMap || {}, contractDDMap);
  Object.keys(contractDDMap).forEach(cid => {
    const ddInfo = contractDDMap[cid];
    const local  = (typeof earnContracts !== 'undefined') ? earnContracts.find(x => x.contractId === cid) : null;
    if (!local || !ddInfo) return;
    if (ddInfo.isFrozen && local.status !== 'frozen') {
      local.status = 'frozen';
      showToast(tccTF('toast_contract_frozen_short',{cid,dd:ddInfo.drawdown_pct||'—'}));
    }
  });
  // [v17 FIX] เดิมพารามิเตอร์ "positions" (มี tp/sl สดจาก Sheet) ไม่ถูกใช้เลยนอกจาก loop ด้านบน
  // → ค่า tp/sl ที่ fetch มาใหม่ถูกทิ้งไปเปล่าๆ แล้ว renderPositions() ก็ render จาก S.positions ค่าเก่า
  // sync tp/sl เข้า S.positions ตาม id ก่อน render จริง
  if (typeof S !== 'undefined' && Array.isArray(S.positions)) {
    const byId = {};
    S.positions.forEach(p => { byId[p.id] = p; });
    positions.forEach(r => {
      const existing = byId[r.id];
      if (!existing) return;
      const newTp = parseFloat(r.tp) || null;
      const newSl = parseFloat(r.sl) || null;
      if (existing.tp !== newTp) existing.tp = newTp;
      if (existing.sl !== newSl) existing.sl = newSl;
    });
  }
  if (typeof renderPositions     === 'function') renderPositions();
  if (typeof renderEarnContracts === 'function') renderEarnContracts();
}

// [FIX history-render] helper: ISO string → "YYYY-MM-DD HH:MM:SS"
function _isoToHistTime(iso) {
  // [v9.1] แปลง ISO string → Bangkok time (UTC+7)
  if (!iso) return '';
  const s = String(iso);
  // ถ้าไม่ใช่ ISO format (ไม่มี T หรือ Z) → return ตรงๆ (อาจเป็น formatted string แล้ว)
  if (!s.includes('T') && !s.includes('Z') && !s.includes('+')) return s;
  const d = new Date(s);
  if (isNaN(d)) return s;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// [FIX history-render] map raw GAS Positions row (closed) → HIST.positionHistory shape
// UI template ต้องการ: coin, symbol, badge, mode, side, realizedPnl, roi, closedVol,
// avgEntry, avgClose, maxOI, opened, closed, lasting, status
function _mapGasPositionHistory(r) {
  const sym   = r.symbol || '';
  const lev   = parseFloat(r.lev) || 150;
  const size  = parseFloat(r.size) || 0;
  const lastingMs = parseFloat(r.lasting_ms) || 0;
  // [v7 FIX] คำนวณ lasting ให้ดีขึ้น: ถ้า lasting_ms > 0 ใช้ minute/hour/day
  let lastingStr = '';
  if (lastingMs > 0) {
    const mins = Math.floor(lastingMs / 60000);
    if (mins < 60) lastingStr = mins + 'm';
    else if (mins < 1440) lastingStr = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    else lastingStr = Math.floor(mins / 1440) + 'd ' + Math.floor((mins % 1440) / 60) + 'h';
  } else if (r.opened_at && r.closed_at) {
    const diff = Date.parse(r.closed_at) - Date.parse(r.opened_at);
    if (diff > 0) {
      const mins = Math.floor(diff / 60000);
      if (mins < 60) lastingStr = mins + 'm';
      else if (mins < 1440) lastingStr = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
      else lastingStr = Math.floor(mins / 1440) + 'd';
    }
  }
  // [v7 FIX] parse coin จาก symbol ให้ถูกต้อง (ตัด USDT/-PERP suffix)
  const coin = sym ? sym.replace(/USDT$/i, '').replace(/-PERP$/i, '') || sym : '—';
  // [v7 FIX] mode parsing: GAS เก็บ "Cross 150x" → ตัด lev ออก แล้วประกอบใหม่
  const modeRaw = (r.mode || 'Cross').replace(/\s*\d+x\s*$/i, '').trim() || 'Cross';
  return {
    id:           r.id,
    coin:         coin,
    symbol:       sym,
    badge:        r.badge || 'Perp',
    mode:         modeRaw + ' ' + lev + 'x',
    lev:          lev,
    side:         (r.side || 'long').toLowerCase(),
    realizedPnl:  parseFloat(parseFloat(r.realized_pnl) || 0).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4}),
    roi:          (parseFloat(r.roi) || 0).toFixed(2),
    closedVol:    HIST.fmtNum(size),
    avgEntry:     HIST.fmtPrice(r.entry_price),
    avgClose:     HIST.fmtPrice(r.avg_close || r.exit_price),
    maxOI:        HIST.fmtNum(r.max_oi || size),
    unrealizedPnl: 0,
    opened:       _isoToHistTime(r.opened_at),
    openedTs:     r.opened_at ? Date.parse(r.opened_at) : Date.now(),
    closed:       _isoToHistTime(r.closed_at),
    closedTs:     r.closed_at ? Date.parse(r.closed_at) : Date.now(),
    ts:           r.closed_at ? Date.parse(r.closed_at) : (r.opened_at ? Date.parse(r.opened_at) : Date.now()),
    lasting:      lastingStr || '—',
    status:       r.status || 'Closed',
  };
}

// [FIX history-render] map raw GAS Trades row → HIST.tradeHistory shape
// UI template ต้องการ: id, coin, badge, dir, dirClass, time, ts, orderNo, price, filled, fee, role, realizedPnl
function _mapGasTradeHistory(r) {
  const sym = r.symbol || '';
  // [v7 FIX] coin ตัด USDT/-PERP suffix ให้ถูกต้อง เหมือน positions
  const coin = sym ? sym.replace(/USDT$/i, '').replace(/-PERP$/i, '') || sym : '—';
  const lower = String(r.dir || '').toLowerCase();
  let dirLabel = 'Buy';
  if (lower.includes('long')) { dirLabel = lower.includes('close') ? 'Sell' : 'Buy'; }
  else if (lower.includes('short')) { dirLabel = lower.includes('close') ? 'Buy' : 'Sell'; }
  else if (lower === 'sell') { dirLabel = 'Sell'; }
  const dirClass = dirLabel.toLowerCase();

  return {
    id:           r.id,
    coin:         coin,
    symbol:       sym,
    badge:        r.badge || 'Perp',
    dir:          dirLabel,
    dirClass:     dirClass,
    time:         _isoToHistTime(r.created_at),
    ts:           r.created_at ? Date.parse(r.created_at) : Date.now(),
    orderNo:      String(r.id || ''),
    price:        HIST.fmtPrice(r.price),
    filled:       HIST.fmtNum(r.filled),
    fee:          (parseFloat(r.fee) || 0).toFixed(6),
    role:         r.role ? (r.role.charAt(0).toUpperCase() + r.role.slice(1)) : 'Taker',
    realizedPnl:  parseFloat(parseFloat(r.realized_pnl) || 0).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4}),
  };
}

// [FIX history-render] map raw GAS SpotTrades row → HIST.spotTradeHistory shape
function _mapGasSpotTradeHistory(r) {
  const sym = r.symbol || '';
  const dirLower = String(r.dir || '').toLowerCase();
  const dirLabel = dirLower.includes('sell') ? 'Sell' : 'Buy';
  return {
    id:           r.id,
    coin:         sym,
    symbol:       sym,
    dir:          dirLabel,
    dirClass:     dirLabel.toLowerCase(),
    time:         _isoToHistTime(r.created_at),
    ts:           r.created_at ? Date.parse(r.created_at) : Date.now(),
    orderNo:      String(r.id || ''),
    price:        HIST.fmtPrice(r.price),
    filled:       HIST.fmtNum(r.filled),
    fee:          (parseFloat(r.fee) || 0).toFixed(6),
    role:         r.role ? (r.role.charAt(0).toUpperCase() + r.role.slice(1)) : 'Taker',
  };
}

// [FIX history-render] map raw GAS FundingFees row → HIST.fundingFee shape
// UI template ต้องการ: asset, time, symbol, amount (string ที่มี +/-)
function _mapGasFundingFee(r) {
  let amt = String(r.amount != null ? r.amount : '0');
  if (amt && !amt.startsWith('+') && !amt.startsWith('-') && parseFloat(amt) >= 0) {
    amt = '+' + amt;
  }
  return {
    id:     r.id,
    asset:  r.asset || 'USDT',
    symbol: r.symbol || '',
    amount: amt,
    time:   _isoToHistTime(r.created_at),
    ts:     r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

// [v8.9 NEW] map raw GAS OpenOrders row (status Filled/Cancelled) → HIST.orderHistory shape
// ก่อนหน้านี้ไม่มี mapper นี้เลย เพราะไม่มี endpoint ไหนส่ง order ที่จบสถานะแล้วกลับมาให้ frontend
function _mapGasOrderHistory(r) {
  const sym  = r.symbol || '';
  const coin = sym ? sym.replace(/USDT$/i, '').replace(/-PERP$/i, '') : '—';
  const side = (r.side || 'long').toLowerCase();
  const isLong = side === 'long';
  // หมายเหตุ: OpenOrders sheet เก็บเฉพาะ limit order สำหรับ "เปิด" position เท่านั้น (TP/SL trigger ปิด position ตรงๆ ไม่ผ่าน sheet นี้)
  const dirLabel = isLong ? 'Open Long' : 'Open Short';
  const dirClass = isLong ? 'open-long' : 'open-short';
  const orderTypeTxt = r.order_type || 'Limit';
  const dirFull = orderTypeTxt + ' / ' + dirLabel;
  const size = parseFloat(r.size) || 0;
  const limitPrice = parseFloat(r.limit_price) || 0;
  const statusTxt = r.status === 'Cancelled' ? 'Cancelled' : (r.status || 'Filled');
  const tsSrc = r.updated_at || r.created_at;
  return {
    id:         'oo_' + (r.order_id || tsSrc || Math.random()),
    coin:       coin,
    symbol:     sym,
    badge:      'Perp',
    orderType:  orderTypeTxt,
    dir:        dirFull,
    dirClass:   dirClass,
    time:       _isoToHistTime(tsSrc),
    ts:         tsSrc ? Date.parse(tsSrc) : Date.now(),
    amount:     HIST.fmtNum(size) + '/' + HIST.fmtNum(size),
    price:      HIST.fmtPrice(limitPrice) + '/' + (orderTypeTxt === 'Market' ? 'Market' : HIST.fmtPrice(limitPrice)),
    reduceOnly: 'False',
    status:     statusTxt,
  };
}

// [v9.5 FIX] ดึง txid จริงที่ backend ฝังไว้ใน note ด้วย tag [txid:...]
// (เผื่อ record เก่าที่ backend เคยฝัง tag ไว้แบบนี้)
function _extractTxidFromNote(note) {
  if (!note) return '';
  const m = String(note).match(/\[txid:([^\]]+)\]/);
  return m ? m[1] : '';
}

// [v9.6 FIX] map raw GAS Transactions row → HIST.transactionHistory shape
// [fix] ก่อนหน้านี้ดึง txid จาก note tag เท่านั้น ทั้งที่ GAS ส่ง r.txid/r.status มาตรงๆ อยู่แล้ว
// (ข้อมูลมีอยู่แล้วในชีต WithdrawQueue คอลัมน์ txid/status) → ใช้ field จริงก่อน ถ้าไม่มีค่อย fallback ไป parse note
function _mapGasTransaction(r) {
  let amt = String(r.amount != null ? r.amount : '0');
  // normalize sign: ถ้าไม่มี + หรือ - และค่าเป็นบวก ให้ใส่ + นำหน้า
  if (amt && !amt.startsWith('+') && !amt.startsWith('-') && parseFloat(amt) >= 0) {
    amt = '+' + amt;
  }
  return {
    id:     r.id || ('tx_' + (r.created_at || Math.random())),
    asset:  r.asset  || 'USDT',
    type:   r.type   || 'Transfer',
    symbol: r.symbol || '',
    amount: amt,
    note:   r.note   || '',
    txid:   r.txid || _extractTxidFromNote(r.note),
    status: r.status || '',
    time:   _isoToHistTime(r.created_at),
    ts:     r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

// [FIX-TX-CLEAR] ใช้แทน _mergeIntoHIST('transactionHistory', ...) ทุกจุด
// ถ้า GAS คืน array (แม้ว่าง) = ยืนยันว่าไม่มีข้อมูล → clear ก่อน merge
// ถ้า GAS คืน undefined/null = GAS ไม่ตอบ → ไม่ clear (ไม่รู้ว่าว่างหรือ error)
function _applyTransactions(uid, transactions) {
  if (!Array.isArray(transactions)) return; // GAS ไม่ตอบ → ไม่ทำอะไร
  if (transactions.length === 0) {
    // GAS ยืนยันว่าไม่มีข้อมูล → clear memory + cache
    HIST.transactionHistory = [];
    try { LS.del('trans_' + uid); } catch(e) {}
  } else {
    _mergeIntoHIST('transactionHistory', transactions);
  }
}

// [SESSION FIRST-LOAD] flag ติดตามว่า key ใดถูก load จาก GAS ครั้งแรกของ session แล้ว
// ถ้ายังไม่เคย load → replace ทั้งหมด (ไม่ merge) เพื่อล้างข้อมูลเก่าทิ้ง
// ถ้า load แล้ว → append ปกติ (user action ใหม่ระหว่าง session)
const _histFirstLoaded = {};

function _mergeIntoHIST(key, rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  // [SESSION FIRST-LOAD] โหลดแรกของ session → replace แทน append
  // ป้องกันข้อมูลเก่าจาก cache สะสมทับข้อมูลใหม่จาก GAS
  if (!_histFirstLoaded[key]) {
    _histFirstLoaded[key] = true;
    HIST[key] = []; // clear ก่อน merge ครั้งแรก
  }
  // [v7 FIX] ให้ fallback id สำหรับ rows ที่ GAS คืนมาโดยไม่มี id field
  // [v8.9 FIX] เพิ่ม fallback ไปที่ order_id ก่อนสุ่ม — OpenOrders sheet ไม่มีคอลัมน์ id เลย มีแต่ order_id
  // ถ้าไม่เช็คนี้ก่อน orderHistory จะได้ id สุ่มใหม่ทุกครั้งที่ refresh → dedup ไม่ทำงาน → ซ้ำไม่จบไม่สิ้น
  const enriched = rows.map(r => {
    if (!r.id) {
      const fallbackId = r.order_id
        ? ('oo_' + r.order_id)
        : (String(r.created_at ? Date.parse(r.created_at) : Date.now()) + '_' + Math.random().toString(36).slice(2, 6));
      r = { ...r, id: fallbackId };
    }
    return r;
  });
  const existing = new Set((HIST[key] || []).map(r => r.id));
  let newRows = enriched.filter(r => !existing.has(r.id));

  // [v13.2 FIX] normalize transactionHistory rows จาก GAS:
  // - amount อาจมาเป็น string "+300.00000000" หรือ number → ให้ normalize เป็น string มี sign
  // - time อาจมาเป็น ISO string → convert เป็น "YYYY-MM-DD HH:MM:SS"
  // - ts อาจไม่มี → ใช้ Date.parse(created_at) หรือ Date.now()
  if (key === 'transactionHistory') {
    newRows = newRows.map(r => {
      let amt = String(r.amount || '0');
      if (amt && !amt.startsWith('+') && !amt.startsWith('-') && parseFloat(amt) >= 0) {
        amt = '+' + amt;
      }
      let timeStr = r.time || r.created_at || '';
      if (timeStr && timeStr.includes('T')) {
        // ISO → "YYYY-MM-DD HH:MM:SS"
        timeStr = timeStr.replace('T', ' ').slice(0, 19);
      }
      const ts = r.ts || (timeStr ? Date.parse(timeStr) : Date.now());
      return { ...r, amount: amt, time: timeStr, ts };
    });
  }

  // [FIX history-render] raw GAS rows ขาด field ที่ UI template ต้องใช้
  // (coin, time, dirClass, mode, opened/closed, avgEntry/avgClose ฯลฯ)
  // → ต้อง map เป็น UI shape ก่อน merge ไม่งั้น render จะ error และว่างเปล่า
  if (key === 'positionHistory') {
    newRows = newRows.map(_mapGasPositionHistory);
  } else if (key === 'tradeHistory') {
    newRows = newRows.map(_mapGasTradeHistory);
  } else if (key === 'spotTradeHistory') {
    newRows = newRows.map(_mapGasSpotTradeHistory);
  } else if (key === 'fundingFee') {
    newRows = newRows.map(_mapGasFundingFee);
  } else if (key === 'orderHistory') {
    newRows = newRows.map(_mapGasOrderHistory);
  } else if (key === 'transactionHistory') {
    // [v9.1] map GAS raw rows → UI shape (เพิ่ม time/ts/type field)
    newRows = newRows.map(_mapGasTransaction);
  }

  HIST[key] = [...(HIST[key] || []), ...newRows];
}

// ── User Profile ──────────────────────────────────────────────────
function saveProfile() {
  const uid = USER_PROFILE.uid;
  const data = {
    uid,
    username:   USER_PROFILE.username,
    email:      USER_PROFILE.regEmail,
    vip_level:  USER_PROFILE.vipLevel,
    verified:   USER_PROFILE.verified,
    country:    USER_PROFILE.country,
    legal_name: USER_PROFILE.legalName,
    dob:        USER_PROFILE.dob,
    id_type:    USER_PROFILE.idType,
    id_number:  USER_PROFILE.idNumber,
    address:    USER_PROFILE.address,
  };
  dbWrite('upsertUser', data, () => {
    const cacheKey = 'dash_' + uid;
    const cached = LS.get(cacheKey);
    if (cached && cached.data && cached.data.user) {
      Object.assign(cached.data.user, data);
      LS.set(cacheKey, cached);
    }
    LS.setWithTTL('user_' + uid, { data }, CACHE_CONFIG.TTL_USER);
  });
  showToast(tccT('toast_saved_syncing'), 'info');
}

// ── Futures Position Open ─────────────────────────────────────────
function saveOpenPosition(pos) {
  // [v9 FIX] Duplicate Write Protection — กัน logOpen ส่งซ้ำถ้า position id เดิมถูกส่งไปแล้วใน session นี้
  // (เช่น HIST.logOpen ถูกเรียกซ้ำจาก 2 จุด หรือ retry โดยไม่ตั้งใจ)
  window._sentOpenPositionIds = window._sentOpenPositionIds || new Set();
  if (window._sentOpenPositionIds.has(pos.id)) {
    console.warn('[saveOpenPosition] skipped duplicate logOpen for id:', pos.id);
    return Promise.resolve();
  }
  window._sentOpenPositionIds.add(pos.id);
  const uid = USER_PROFILE.uid;
  const data = {
    id:              pos.id,
    uid,
    symbol:          pos.symbol || pos.coin + 'USDT',
    badge:           'Perp',
    mode:            (pos.mode || 'Cross') + ' ' + (pos.lev || 150) + 'x',
    side:            pos.side,
    lev:             pos.lev || 150,
    entry_price:     pos.entry,
    size:            pos.size,
    max_oi:          pos.size,
    // [FIX] ส่ง tp/sl ไป GAS เพื่อให้ Offline Engine TP/SL check ทำงานได้
    tp:              pos.tp  || null,
    sl:              pos.sl  || null,
    // [v4 FIX Bug2] บันทึก earnContractId ไป GAS ด้วย
    // ถ้าไม่บันทึก → loadOfflineState คืน earnContractId='' → syncContractBalance
    // คำนวณ drawdown ผิด contract → _autoLiquidate() ปิดทุก position หลัง refresh
    earn_contract_id: pos.earnContractId || '',
    status:          'Active',
    opened_at:       new Date().toISOString(),
  };
  // [BUGFIX] เก็บ promise ของ logOpen ไว้ return กลับ — ให้ผู้เรียก (HIST.logOpen → _fillOrderToPosition)
  // รอจนแถว Position นี้ถูกเขียนลง Sheet จริงก่อน ค่อยไปดึง liq_price_map (กัน race condition
  // ที่ getContractStatus อ่าน Sheet ก่อนแถวใหม่ถูกเขียนเสร็จ → liq_price_map ไม่มี id นี้ → "—" ค้าง)
  const _logOpenPromise = dbWrite('logOpen', data);
  // [FIX] บันทึก Commission fee ไป GAS (taker 0.05%)
  const _openFee = +(pos.entry * pos.size * 0.0005).toFixed(6);
  if (_openFee > 0) {
    dbWrite('logTransaction', {
      uid,
      type:   'Commission',
      asset:  'USDT',
      symbol: (pos.symbol || pos.coin + 'USDT') + ' Perpetual',
      amount: '-' + _openFee.toFixed(8),
      note:   'Open ' + (pos.side === 'long' ? 'Long' : 'Short') + ' @ ' + pos.entry,
    });
  }
  return _logOpenPromise;
}

// ── Futures Position Close ────────────────────────────────────────
function saveClosePosition(pos, realizedPnl, roi, avgClose, isFull) {
  const uid = USER_PROFILE && USER_PROFILE.uid;
  // [FIX-ROOT] เพิ่ม uid และ earn_contract_id ใน data ที่ส่งไป GAS
  // GAS closePosition (บรรทัด 2259): ใช้ทั้งสองค่านี้เพื่อเรียก _accumulateEarnPnl
  // ถ้าไม่มี → GAS log ⚠️ "ไม่พบ earn_contract_id หรือ uid" → ข้าม _accumulateEarnPnl ทั้งหมด
  // → realized_pnl ใน EarnContracts sheet ไม่เปลี่ยน → EarnCard แสดง 0 เสมอ
  const data = {
    id:               pos.id,
    uid:              uid || '',
    earn_contract_id: pos.earnContractId || pos.earn_contract_id || '',
    exit_price:       pos.exitPrice || pos.entry,
    realized_pnl:     realizedPnl,
    roi:              roi,
    avg_close:        avgClose,
    status:           isFull ? 'Closed' : 'Partially Closed',
    closed_at:        new Date().toISOString(),
    lasting_ms:       Date.now() - (pos.openedTs || Date.now()),
  };
  dbWrite('logClose', data, () => {
    _invalidateDashCache();
  });
  // [v2.20 FIX-N2b] ตัด updateEarnContract (realized_pnl_delta + margin_delta) ออกทั้งหมด
  // GAS จัดการสะสม PNL เองผ่าน closePosition → _accumulateEarnPnl ทุก path แล้ว
  // (manual close + TP/SL ล้วนผ่าน closePosition ที่มี _accumulateEarnPnl อยู่แล้ว)
  // Frontend ส่ง delta ซ้ำ = PNL บวม 2 เท่าทุกครั้งที่ user ปิด position เอง
  if (uid && pos.earnContractId) {
    // [FIX-1b] อัปเดต local state ชั่วคราว (เพื่อ UI ไม่กระตุก) แล้วทันทีที่ GAS ตอบกลับ
    // ให้ re-fetch EarnContracts และ overwrite ด้วยค่า GAS Source of Truth
    // ห้ามบวกสะสม realizedPnl ซ้ำใน local เพราะ GAS สะสมเองผ่าน _accumulateEarnPnl แล้ว
    const _cLocal = (typeof earnContracts !== 'undefined')
      ? earnContracts.find(x => x.contractId === pos.earnContractId || x.contract_id === pos.earnContractId)
      : null;
    if (_cLocal) {
      // [FIX Bug#7] เดิมบวก realizedPnl เข้า _cLocal ซ้ำอีกรอบที่นี่ — ทั้งที่ posClose()/
      // trade-panel close handler ที่เรียก HIST.logClose() → saveClosePosition() นี้
      // ได้บวก c.realizedPnl ไปแล้ว 1 ครั้งก่อนหน้านี้แล้ว (cLocal คือ object ตัวเดียวกับ c)
      // ผลคือ realizedPnl ที่โชว์ชั่วคราวก่อนรีเฟรชกลายเป็น "บวกสองเท่า" ของ PNL ที่ปิดจริง
      // (เช่น เดิม 1.12 + ปิด 44.85 → ควรเป็น 45.97 แต่กลายเป็น 90.82)
      // ไม่ต้องบวกอะไรเพิ่มที่นี่ — แค่ sync currentBalance ให้ตรงกับ realizedPnl ที่ caller ตั้งไว้แล้ว
      syncContractBalance(_cLocal);
    }
    // [FIX Bug#6] กัน setTimeout merge ด้านล่างทับค่า realizedPnl/currentBalance นี้ด้วยค่าเก่า
    // ก่อน GAS commit เสร็จจริง (ดู window._pendingEarnSync ที่ posClose/trade-panel close ตั้งไว้แล้ว
    // — เผื่อกรณีไม่ได้ผ่าน path นั้นมา ตั้งซ้ำที่นี่ให้ชัวร์)
    window._pendingEarnSync = window._pendingEarnSync || {};
    window._pendingEarnSync[pos.earnContractId] = Date.now() + 12000;
    // [FIX-1b] Re-fetch จาก GAS หลัง logClose สำเร็จ → overwrite realizedPnl ด้วย Source of Truth
    // ป้องกัน local realizedPnl บวมข้ามรอบ (กรณี page ไม่ refresh แต่ปิด position หลายครั้ง)
    setTimeout(() => {
      if (typeof dbCallRaw === 'function' && typeof _mergeDashEarnContracts === 'function') {
        dbCallRaw('getEarnContracts', { uid })
          .then(ecResult => {
            if (!ecResult) return;
            const ecList = Array.isArray(ecResult) ? ecResult
                         : (ecResult && Array.isArray(ecResult.contracts) ? ecResult.contracts : []);
            if (ecList.length) {
              _mergeDashEarnContracts(ecList);
              if (typeof renderEarnContracts === 'function') renderEarnContracts();
            }
          })
          .catch(() => {}); // non-blocking — ถ้า network fail แสดงค่าชั่วคราวแทน
      }
    }, 1500); // รอ 1.5 วิให้ GAS closePosition + _accumulateEarnPnl เสร็จก่อน
    // หมายเหตุ: ไม่เรียก dbWrite('logTransaction') ที่นี่สำหรับ Realized PNL
    // เพราะ GAS (closePosition) บันทึก Realized PNL ลง Transactions sheet เองผ่าน _accumulateEarnPnl แล้ว
    // ถ้าเรียกซ้ำจะมี 2 แถวต่อ 1 position close
  } else if (uid && realizedPnl !== 0) {
    // fallback: ไม่มี earnContractId — log transaction เฉยๆ (GAS ยังไม่มี contract link)
    dbWrite('logTransaction', {
      uid,
      type:   'Realized PNL',
      asset:  'USDT',
      symbol: pos.symbol || ((pos.coin || '') + 'USDT'),
      amount: (realizedPnl >= 0 ? '+' : '') + parseFloat(realizedPnl).toFixed(8),
      note:   (isFull ? 'Full Close' : 'Partial Close') + ' @ ' + (pos.exitPrice || pos.entry),
    });
  }
  // [FIX] บันทึก Commission fee ฝั่ง Close ไป GAS (taker 0.05%)
  if (uid) {
    const _exitPrice = pos.exitPrice || pos.entry || 0;
    const _closeSize = pos.size || 0;
    const _closeFee = +(_exitPrice * _closeSize * 0.0005).toFixed(6);
    if (_closeFee > 0) {
      dbWrite('logTransaction', {
        uid,
        type:   'Commission',
        asset:  'USDT',
        symbol: (pos.symbol || ((pos.coin || '') + 'USDT')) + ' Perpetual',
        amount: '-' + _closeFee.toFixed(8),
        note:   (isFull ? 'Close' : 'Partial Close') + ' @ ' + _exitPrice,
      });
    }
  }
}

// ── Futures Trade ─────────────────────────────────────────────────
function saveTrade(tradeData) {
  const uid = USER_PROFILE.uid;
  const data = { uid, ...tradeData };
  dbWrite('logTrade', data, () => {
    _invalidateDashCache();
  });
}

// ── Spot Trade ────────────────────────────────────────────────────
function saveSpotTrade(data) {
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  dbWrite('logSpotTrade', fullData, () => {
    _invalidateDashCache();
  });
}

// ── Transaction (generic) ─────────────────────────────────────────
function saveTransaction(type, asset, symbol, amount, note) {
  const uid = USER_PROFILE.uid;
  const data = { uid, type, asset, symbol, amount: String(amount), note: note || '' };
  dbWrite('logTransaction', data);
}

// ── Funding Fee ───────────────────────────────────────────────────
function saveFunding(symbol, amount) {
  const uid = USER_PROFILE.uid;
  const data = { uid, symbol, amount: String(amount), asset: 'USDT' };
  dbWrite('logFunding', data);
}

// ── Deposit ★ (ใหม่) ─────────────────────────────────────────────
function saveDeposit(data) {
  // data: { coin, network, amount, txid, note }
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  dbWrite('logDeposit', fullData, () => {
    const _now = Date.now();
    const _timeStr = new Date(_now).toISOString().replace('T',' ').slice(0,19);
    // merge vào HIST ngay lập tức เพื่อให้แสดงผลทันที
    if (typeof HIST !== 'undefined' && typeof _mergeIntoHIST === 'function') {
      _mergeIntoHIST('transactionHistory', [{
        id:     'dep_' + _now + '_' + Math.random().toString(36).slice(2,7),
        type:   'Deposit', asset: data.coin,
        symbol: data.network || 'Unknown',
        amount: '+' + parseFloat(data.amount).toFixed(8),
        time:   _timeStr, ts: _now,
      }]);
    }
    _invalidateDashCache();
  });
}

// ── Withdraw ★ (ใหม่) ────────────────────────────────────────────
// ── saveWithdraw [WALLET v1] ────────────────────────────────────
// แทนที่ logWithdraw เดิม: ตรวจ address ก่อน → Off-chain หรือ On-chain
async function saveWithdraw(data) {
  // data: { coin, network, amount, fee, address, note }
  const uid = USER_PROFILE.uid;
  if (!uid) { showToast(tccT('toast_login_required_short')); return null; }

  try {
    // เรียก GAS submitWithdraw (ตรวจ address + หักเงิน + บันทึก)
    const result = await dbCallRaw('submitWithdraw', {
      uid,
      coin:    data.coin    || 'USDT',
      network: data.network || 'Unknown',
      amount:  data.amount,
      fee:     data.fee || 0,
      address: data.address,
      note:    data.note || '',
    });

    // อัปเดต local balance
    const total = parseFloat(data.amount) + parseFloat(data.fee || 0);
    if (data.coin === 'USDT') {
      mainWalletBalance = Math.max(0, mainWalletBalance - total);
      updateSysWalletDisplay();
    }

    // [NO-CACHE] ไม่บันทึก transaction ลง local cache อีกต่อไป — loadDashboard จะดึงจาก GAS โดยตรง
    const isOffchain = result.type === 'offchain';
    _invalidateDashCache();

    // [v13.2 FIX] Off-chain: invalidate dash cache ของผู้รับด้วย
    // เพื่อให้ครั้งต่อไปที่ผู้รับเปิด app จะ fetch balance ใหม่จาก GAS
    if (isOffchain && result.to_uid) {
      LS.del('dash_' + String(result.to_uid));
    }

    _invalidateDashCache();
    if (typeof loadDashboard === 'function') setTimeout(loadDashboard, 300);
    if (typeof renderTransactionHistory === 'function') renderTransactionHistory();

    return result; // { type, status, withdraw_id, message, to_uid }

  } catch (err) {
    console.error('[saveWithdraw] Error:', err);
    showToast(tccTF('err_generic_prefix',{msg:err.message||tccT('err_action_fail_default')}));
    return null;
  }
}

// ── Internal Transfer ★ (ใหม่) ───────────────────────────────────
function saveTransfer(amount, fromWallet, toWallet) {
  const uid = USER_PROFILE.uid;
  const data = { uid, amount: String(amount), fromWallet, toWallet };
  dbWrite('logTransfer', data);
}

// ── Earn: Create Contract ★ (ใหม่) ───────────────────────────────
function saveEarnCreate(data) {
  // data: { contractId, amount, planDays, dailyYield }
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  // [v5 FIX] ใช้ dbCallRaw โดยตรงเพื่อรู้ผล write จริง (dbWrite.catch swallow error → .then รันแม้ fail)
  // หลัง GAS ยืนยัน insert EARN row สำเร็จ → ดึง earnContracts ใหม่จาก GAS ทันที
  // เพื่อให้ UI แสดงสัญญาที่เพิ่งสร้าง + count ถูกต้อง
  dbCallRaw('logEarnCreate', fullData)
    .then(res => {
      if (res && res.ok === false) {
        console.warn('[saveEarnCreate] GAS error:', res.error);
        if (typeof showToast === 'function') showToast(tccTF('toast_contract_create_fail',{err:res.error||tccT('err_unknown')}));
        return;
      }
      _invalidateDashCache();
      // re-fetch earnContracts เพื่อ sync สัญญาใหม่เข้า local array + render count ใหม่
      return dbCallRaw('getEarnContracts', { uid });
    })
    .then(ecResult => {
      if (!ecResult) return;
      const ecList = Array.isArray(ecResult) ? ecResult
                   : (ecResult && Array.isArray(ecResult.contracts) ? ecResult.contracts : []);
      if (ecList.length && typeof _mergeDashEarnContracts === 'function') {
        _mergeDashEarnContracts(ecList);
      }
    })
    .catch(err => {
      // fallback: ถ้า network fail → ส่งผ่าน QUEUE เหมือน dbWrite ปกติ
      console.error('[saveEarnCreate] write failed, queuing:', err.message);
      QUEUE.push({ action: 'logEarnCreate', data: fullData });
      if (typeof showToast === 'function') {
        showToast(tccT('toast_contract_save_fail_retry'), 'warn');
      }
    });
}

// ── Earn: Claim Profit ★ (ใหม่) ──────────────────────────────────
function saveEarnClaim(data, action) {
  // data: { contractId, userShare, netProfit, [aptYield], [tradePnl], [claimMode] }
  // action: 'logEarnClaim' (default) | 'logEarnClaimTrade' | 'logEarnClaimApt' | 'logEarnClaimFixed'
  // [FIX-FRONTEND-2] logEarnClaimFixed: ส่งแค่ { contractId, claimMode:'fixed' } — GAS คำนวณ claimable เอง
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  const gasAction = action || 'logEarnClaim';
  dbWrite(gasAction, fullData, () => {
    _invalidateDashCache();
  });
}

// ── [v2.35 NEW] Earn: Redeem Principal (รับเงินต้นคืนหลัง matured) ──
function saveEarnRedeem(data) {
  // data: { contractId, stakedAmount (optimistic estimate ใช้แค่ระหว่าง pending) }
  // [FIX #4 — REDEEM-SSOT] GAS เป็น Single Source of Truth สำหรับยอดคืนจริง
  // เดิม: optimistic update ใช้ _calcRedeemBreakdown() คำนวณเองฝั่ง frontend → ยอดอาจต่างจาก GAS
  //       เพราะมี dual-logic (สูตรเดียวกันแต่คนละ codebase — drift ได้ถ้าแก้ฝั่งเดียว)
  // แก้: หลัง GAS ตอบกลับ → อ่าน netReturned จาก response แล้ว reconcile balance ให้ตรง
  //      ถ้า GAS คืนค่าต่างจาก optimistic estimate → patch mainWalletBalance ทันที
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  const _optimisticAmt = parseFloat(data.stakedAmount) || 0;

  dbWrite('logEarnRedeem', fullData, (res) => {
    // [FIX #4] reconcile balance จาก GAS response
    if (res && typeof res.netReturned === 'number' && res.netReturned > 0) {
      const _diff = res.netReturned - _optimisticAmt;
      if (Math.abs(_diff) > 0.00001) {
        // ยอดจริงจาก GAS ต่างจาก optimistic → แก้ balance ให้ถูกต้อง
        mainWalletBalance = Math.max(0, mainWalletBalance + _diff);
        Logger.log && Logger.log('[saveEarnRedeem] FIX #4: reconciled balance diff=' + _diff.toFixed(6) +
                                 ' optimistic=' + _optimisticAmt + ' actual=' + res.netReturned);
        updateSysWalletDisplay();
        // แจ้งสมาชิกถ้ายอดถูกหักบัฟเฟอร์ (แสดง breakdown ชัดเจน)
        if (res.claimBuffer > 0) {
          showToast('ℹ️ ยอดเงินต้นที่ได้รับถูกปรับเป็น ' + fmtM(res.netReturned, 4) +
                    ' USDT (หักบัฟเฟอร์สำรอง ' + fmtM(res.claimBuffer, 4) + ' USDT ตาม GAS)');
        }
      }
    }
    _invalidateDashCache();
  }).catch(() => {
    // [NEW v2.46 AUTO-RENEW] backend ปฏิเสธ (เช่น สัญญาถูกต่ออายุอัตโนมัติไปแล้วก่อนที่ user
    // จะกด Redeem บน local state ที่ยังค้างเป็น matured) — optimistic update ก่อนหน้านี้ใน
    // submitRedeemPrincipal() (mainWalletBalance += principal, c.status='closed') ผิดจากของจริง
    // บน server ไปแล้ว บังคับ sync สดจาก GAS ทันทีเพื่อดึง status/balance ที่ถูกต้องกลับมาแทน
    if (typeof loadOfflineState === 'function') loadOfflineState();
    if (typeof showToast === 'function') {
      showToast(tccT('toast_contract_status_changed'));
    }
  });
}

// ── Earn: Auto-Liquidate ★ (ใหม่) ────────────────────────────────
function saveEarnLiquidate(data) {
  // data: { contractId, loss, remaining }
  const uid = USER_PROFILE.uid;
  const fullData = { uid, ...data };
  dbWrite('logEarnLiquidate', fullData, () => {
    _invalidateDashCache();
  });
}

// ── Portfolio Snapshot ────────────────────────────────────────────
function snapshotPortfolio() {
  const uid = USER_PROFILE.uid;
  // [v6 FIX] Guard: uid ยังไม่พร้อม (autoLoginFromMembers ยังรอ GAS response)
  // → ไม่ส่ง dbWrite ป้องกัน toast "ไม่สามารถบันทึกข้อมูล (snapshotPortfolio)" ผิดพลาด
  // retry อีก 10s เผื่อ auth โหลดเสร็จพอดี (ครั้งเดียว ไม่ loop)
  if (!uid) {
    setTimeout(snapshotPortfolio, 10000);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const lastSnap = LS.get('last_snap_' + uid);
  if (lastSnap && lastSnap.date === today) return;

  const data = {
    uid,
    total_balance:   mainWalletBalance,
    main_balance:    mainWalletBalance,
    futures_balance: typeof earnContracts !== 'undefined'
      ? earnContracts.reduce((s, c) => s + (c.stakedAmount || 0), 0)
      : 0,
    spot_balance:    0,
    daily_pnl:       0,
    daily_roi:       0,
    snapshot_date:   today,
  };
  dbWrite('snapshotPortfolio', data);
  LS.set('last_snap_' + uid, { date: today });
}

// ══════════════════════════════════════════════════════════════════
//  OFFLINE ENGINE — sync earnContracts + openOrders กับ GAS
//  เรียก 2 ฟังก์ชั่นนี้ทุกครั้งที่ state เปลี่ยน หรือตอนเปิดแอป
// ══════════════════════════════════════════════════════════════════

/**
 * sync earnContracts metadata → GAS Sheet (fire-and-forget)
 *
 * [v5 FIX] ลบ isStartup param ออกถาวร — current_balance และ realized_pnl
 * ถูกตัดออกจาก mapped object ถาวรแล้ว (ไม่ส่งไป GAS ไม่ว่า path ไหน)
 * GAS เป็น Source of Truth สำหรับ current_balance และ realized_pnl เสมอ
 * (_accumulateEarnPnl และ processEarnYield เขียนเองฝั่ง GAS เท่านั้น)
 * ฟังก์ชันนี้ sync เฉพาะ: status, staked_amount, plan_days, frozen_balance,
 * start/end_time_ms, total_claimed, last_yield_time_ms, last_yield_day
 */
function syncEarnContractsToGAS() {
  // [v5 FIX] ลบ isStartup param ออก — เป็น dead parameter ตั้งแต่ v2.20 ที่ตัด
  // current_balance + realized_pnl ออกจาก mapped object แล้วถาวร
  // GAS Source of Truth: current_balance และ realized_pnl ถูกเขียนโดย GAS เท่านั้น
  // (_accumulateEarnPnl, processEarnYield) — Frontend ห้ามส่งค่าเหล่านี้กลับไปทับเด็ดขาด
  // ฟังก์ชันนี้ใช้ sync เฉพาะ metadata (status, staked_amount, plan_days ฯลฯ)
  // และรับ status/balance update กลับจาก GAS ผ่าน _mergeDashEarnContracts
  try {
    // [v7 FIX] อ่าน uid จาก session ก่อน (เหมือน loadOfflineState) ป้องกัน uid ว่างตอน startup
    const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
    const uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
                : ((typeof USER_PROFILE !== 'undefined' && USER_PROFILE.uid) ? USER_PROFILE.uid : '');
    if (!uid || typeof earnContracts === 'undefined' || !earnContracts.length) return;
    // [v2.20 FIX-N2b] ตัด current_balance และ realized_pnl ออกจาก mapped object ถาวร
    // GAS (syncEarnContracts) บล็อค 2 field นี้อยู่แล้วอีกชั้น แต่ตัดจากต้นทางด้วยเพื่อความปลอดภัยสูงสุด
    const mapped = earnContracts.map(c => ({
      contractId:      c.contractId,
      uid:             c.uid || c.userId || uid,
      plan_days:       c.planDays,
      daily_yield_pct: c.dailyYield,
      staked_amount:   c.stakedAmount || c.principal || 0,
      // current_balance: ห้ามส่ง — GAS Source of Truth (processEarnYield เขียนเอง)
      frozen_balance:  c.frozenBalance || 0,
      status:          c.status,
      start_time_ms:   c.startTime,
      end_time_ms:     c.endTime,
      // realized_pnl: ห้ามส่ง — GAS Source of Truth (_accumulateEarnPnl เขียนเอง)
      total_claimed:   c.totalClaimed  || 0,
      last_yield_time_ms: c.lastYieldTimeMs || c.startTime || 0,
      last_yield_day:  c.lastYieldDay  || 0,
    }));
    dbCallRaw('syncEarnContracts', { uid, contracts: mapped })
      .then(res => {
        if (res && res.ok === false) {
          console.warn('[syncEarnContractsToGAS] error:', res.error);
          if (typeof showToast === 'function') showToast(tccTF('toast_sync_earn_fail',{err:res.error||tccT('err_unknown')}));
        }
        // [v8] merge earnContracts status จาก GAS response ถ้ามี
        if (res && res.earnContracts && typeof _mergeDashEarnContracts === 'function') {
          _mergeDashEarnContracts(res.earnContracts);
        }
      })
      .catch(e => console.warn('[OfflineEngine] syncEarnContracts fail:', e.message));
  } catch (e) { console.warn('[OfflineEngine] syncEarnContracts err:', e.message); }
}

/**
 * sync pending openOrders → GAS Sheet (fire-and-forget)
 */
function syncOpenOrdersToGAS() {
  try {
    const uid = (typeof USER_PROFILE !== 'undefined') ? USER_PROFILE.uid : 'USER001';
    // [v2.40 FIX-T3] ตรวจ earnContractId ครบก่อน sync — ป้องกัน orphan position
    // GAS syncOpenOrders ใช้ o.earnContractId (บรรทัด 6710) เพื่อเขียน contract_id ลง Sheet
    // ถ้า field นี้หาย → order ใน Sheet ไม่มี contract_id → processLimitOrders fill → orphan position
    // เพิ่ม earnContractId เป็น explicit field ใน map (เดิม GAS ดึงจาก o.earnContractId ได้อยู่แล้ว
    // แต่เพิ่ม contract_id เป็น alias ชัดเจนเพื่อให้ lookup chain ใน GAS ทำงานได้ทุก path)
    const orders = (typeof S !== 'undefined' && S.openOrders)
      ? S.openOrders
          .filter(o => o.status === 'Pending' || !o.status)
          .map(o => ({
            ...o,
            earnContractId: o.earnContractId || o.contract_id || '',  // ยืนยัน field นี้มีค่าเสมอ
            contract_id:    o.earnContractId || o.contract_id || '',  // alias ตรงสำหรับ GAS record map
          }))
      : [];
    // [FIX-T3] log order ที่ไม่มี earnContractId เพื่อให้ตรวจสอบใน console
    orders.forEach(o => {
      if (!o.earnContractId) {
        console.warn('[syncOpenOrdersToGAS] FIX-T3 ⚠️ order id=' + (o.id || o.order_id) +
                     ' ไม่มี earnContractId — order นี้จะเป็น orphan ถ้าถูก fill โดย Server Engine');
      }
    });
    if (!uid) return;
    dbCallRaw('syncOpenOrders', { uid, orders })
      .then(res => {
        if (res && res.ok === false) {
          console.warn('[syncOpenOrdersToGAS] error:', res.error);
          if (typeof showToast === 'function') showToast(tccTF('toast_sync_orders_fail',{err:res.error||tccT('err_unknown')}));
        }
      })
      .catch(e => console.warn('[OfflineEngine] syncOpenOrders fail:', e.message));
  } catch (e) { console.warn('[OfflineEngine] syncOpenOrders err:', e.message); }
}

/**
 * syncOfflineEngine — เรียกตอนเปิดแอป: ส่ง earnContracts + openOrders ไป GAS ครั้งเดียว
 */
function syncOfflineEngine() {
  // [v16 FIX] เดิม updateRefreshTimestamp ถูกเรียกแค่จุดเดียวคือต้นๆ loadOfflineState()
  // ซึ่งรันหลัง syncOfflineEngine() เสมอ (ดู DOMContentLoaded ด้านล่าง: syncOfflineEngine() แล้วค่อย loadOfflineState())
  // → ช่วงที่ syncEarnContractsToGAS/syncOpenOrdersToGAS กำลัง "เขียน" สถานะ startup ไปที่ GAS
  //   ยังไม่มี grace period คุ้มครองเลย ถ้า GAS trigger (funding/liquidate sweep) ทำงานพอดีช่วงนี้
  //   อาจอ่านสถานะที่เขียนยังไม่ครบ/ชนกับ client ได้ → เรียก updateRefreshTimestamp ที่นี่ก่อน
  //   เพื่อให้ grace period ครอบคลุมตั้งแต่ต้น sequence (push ก่อน pull) ไม่ใช่แค่ครึ่งหลัง
  // fail-open: ถ้า call ล้มเหลวไม่บล็อก sync ที่เหลือ
  try {
    const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
    const _uid = (_sess && _sess.uid) ? String(_sess.uid).trim()
                  : ((typeof USER_PROFILE !== 'undefined' && USER_PROFILE.uid) ? USER_PROFILE.uid : '');
    if (_uid && typeof dbCallRaw === 'function') {
      dbCallRaw('updateRefreshTimestamp', { uid: _uid }).catch(e =>
        console.warn('[OfflineEngine] updateRefreshTimestamp (startup push) fail (ignored):', e.message));
    }
  } catch (e) { console.warn('[OfflineEngine] updateRefreshTimestamp (startup push) err:', e.message); }

  syncEarnContractsToGAS();  // [v5 FIX] ลบ isStartup param — current_balance/realized_pnl ถูกตัดออกถาวรแล้ว
  syncOpenOrdersToGAS();
  console.warn('[OfflineEngine] startup sync sent');
}

/**
 * loadOfflineState — ดึงสถานะล่าสุดจาก GAS กลับมา (earnContracts + openOrders)
 * เรียกตอนเปิดแอปหลัง syncOfflineEngine เพื่ออัปเดต state ถ้า GAS มีข้อมูลใหม่กว่า
 */
async function loadOfflineState() {
  // [v9 FIX] Refresh Lock จริง — true ตลอดที่ loadOfflineState() กำลังดึง/sync ข้อมูล
  // ปลดเฉพาะใน finally ด้านล่าง เมื่อ sync เสร็จสมบูรณ์ (หรือ error) เท่านั้น
  window._refreshLock = true;
  try {
    // [v7 FIX] อ่าน uid จาก session โดยตรง ไม่ใช้ USER_PROFILE.uid
    // เพราะตอน DOMContentLoaded USER_PROFILE.uid ยังเป็นค่า hardcode default
    // session uid คือ uid จริงที่ login มา
    const _sess = (typeof _lgLoadSession === 'function') ? _lgLoadSession() : null;
    const uid   = (_sess && _sess.uid)
                    ? String(_sess.uid).trim()
                    : ((typeof USER_PROFILE !== 'undefined' && USER_PROFILE.uid) ? USER_PROFILE.uid : '');
    if (!uid) {
      // [v7 FIX] ถ้า uid ยังไม่พร้อม retry หลัง 3 วิ แทนที่จะ skip ทิ้ง
      console.warn('[OfflineEngine] loadOfflineState: uid not ready, retry in 3s...');
      setTimeout(() => {
        if (typeof loadOfflineState === 'function') loadOfflineState();
      }, 3000);
      return;
    }

    // [v10 FIX] แจ้ง backend ว่า client กำลัง refresh — ป้องกัน race condition
    // backend ใช้ timestamp นี้เพื่อกัน stale GAS Engine ทับ state ใหม่
    // [v8.9 FIX Bug4(ก)] fire-and-forget: ไม่ await เพื่อลดเวลาโหลดหน้า
    dbCallRaw('updateRefreshTimestamp', { uid }).catch(_rtsErr =>
      console.warn('[OfflineEngine] updateRefreshTimestamp fail (ignored):', _rtsErr.message)
    );

    // [v3.2 MESSAGES] อัปเดต badge จำนวนข้อความที่ยังไม่อ่าน — fire-and-forget เหมือนกัน
    if (typeof msgRefreshBadge === 'function') msgRefreshBadge();

    // [SESSION CACHE] ล้าง history cache เก่าทุกครั้งที่เปิดแอพ/refresh
    // → บังคับดึงข้อมูลจาก GAS ใหม่เสมอ ไม่ใช้ cache เก่าค้างอยู่
    if (typeof _clearSessionCache === 'function') _clearSessionCache(uid);

    // ── helper: map GAS Position row → S.positions object ──
    // [v6 FIX] เพิ่ม: liq, type, realized, coin parse จาก symbol ทั้ง USDT/-PERP suffix
    //          แก้ margin ให้คำนวณถูกต้อง; liq คำนวณด้วย MMR formula
    function _mapGasPosition(r) {
      const ep  = parseFloat(r.entry_price) || 0;
      const sz  = parseFloat(r.size)        || 0;
      const lv  = parseFloat(r.lev)         || 150;
      const side = (r.side || 'long').toLowerCase();
      const margin = (ep > 0 && sz > 0 && lv > 0) ? (ep * sz) / lv : 0;

      // ⚠️ [AI WARNING - Fix5] ห้ามคำนวณ liq ที่นี่ด้วย MMR formula เอง
      // [v16 FIX] คอมเมนต์เดิมพูดถึง "recalcPositions() คำนวณ liq ด้วย cross-margin formula" ซึ่งไม่จริงแล้ว
      // ตาม [v13 FIX]: ไม่มี local formula เหลืออยู่เลย — updatePositionsPNL() (ฟังก์ชันที่ tick ราคาทุกจุด)
      // จะดึง liq จาก window._liqPriceMap (GAS SSOT ผ่าน getContractStatus) เท่านั้น
      // ถ้า map ยังไม่มาให้ position นี้ → liq=0 ค้างไว้รอข้อมูลจริง ไม่ fallback ไปคำนวณเองเด็ดขาด
      const liq = 0; // updatePositionsPNL() จะ set ค่าจริงจาก window._liqPriceMap หลังจากนี้

      return {
        id:             r.id,
        uid:            r.uid,
        coin:           (r.symbol || '').replace(/USDT$/,'').replace(/-PERP$/,''),
        symbol:         r.symbol || '',
        side:           side,
        lev:            lv,
        entry:          ep,
        size:           sz,
        margin:         margin,
        liq:            liq,
        tp:             parseFloat(r.tp) || null,
        sl:             parseFloat(r.sl) || null,
        earnContractId: r.earnContractId || r.earn_contract_id || '',
        status:         'Active',
        type:           r.order_type || 'Market',   // [v6 FIX] buildPosCard ใช้ p.type
        realized:       parseFloat(r.realized_pnl) || 0, // [v6 FIX] buildPosCard ใช้ p.realized
        pnl: 0, roi: 0, mark: ep, marginRatio: 0,  // mark = ep เป็น fallback ก่อน coinPrices มา
        openedTs:       r.opened_at ? new Date(r.opened_at).getTime() : Date.now(),
        mode:           (r.mode || 'Cross').replace(/\s*\d+x\s*$/i, ''),  // [v6 FIX] ตัด "150x" ออกจาก mode string
        // [v4 FIX Bug1+Bug2] ตั้ง _tpslSetAt = Date.now() เสมอตอน load จาก GAS
        // เพราะ position เพิ่งโหลดมาใหม่ ราคาตลาดยังไม่ stable → ป้องกัน TP/SL trigger ทันที
        // grace 10 วินาทีแทน 0 เพื่อให้ coinPrices มีเวลา sync ก่อน
        _tpslSetAt:     Date.now(),
      };
    }

    // ── helper: map GAS EarnContract row → earnContracts object ──
    function _mapGasContract(r) {
      // [FIX FREEZE-ON-REFRESH] คำนวณ currentFundingHour ณ เวลาที่ restore
      // เพื่อ mark _lastFundedHour ทันที — ป้องกัน funding tick หัก realizedPnl ซ้ำ
      // ทันทีหลัง refresh (เพราะ _lastFundingHour in-memory reset เป็น -1)
      const _nowH = new Date().getHours();
      const _restoredFundedHour = Math.floor(_nowH / 8) * 8;
      return {
        contractId:      r.contract_id,
        uid:             r.uid || uid,          // [v7 FIX] เพิ่ม uid ให้ syncEarnContractsToGAS ใช้ตรวจ uid mismatch
        userId:          r.uid || uid,
        stakedAmount:    parseFloat(r.staked_amount)    || 0,
        principal:       parseFloat(r.staked_amount)    || 0,  // [v7 FIX] alias ให้ buildEarnCard ใช้ได้
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
        // [FIX FREEZE-ON-REFRESH] mark funding hour ที่ restore มา
        // funding tick จะข้ามถ้า _lastFundedHour === currentFundingHour
        _lastFundedHour: _restoredFundedHour,
        // [FIX FREEZE-ON-REFRESH] เก็บ drawdown จาก GAS ไว้ใช้ตอน coinPrices ยังไม่มา
        _gasDrawdown:    parseFloat(r.drawdown_pct) || 0,
        // [v2.34 FIX-Q] contract_mode + isFixed — ใช้บล็อก Trade ปุ่มใน frontend
        contract_mode:   r.contract_mode || 'trade',
        isFixed:         String(r.contract_mode || '').trim().toLowerCase() === 'fixed',
        // [NEW: TIER] 'standard' | 'vip'
        contractTier:    (String(r.contract_tier || '').toLowerCase() === 'vip') ? 'vip' : 'standard',
      };
    }

    // ── helper: map GAS OpenOrder row → S.openOrders object ──
    function _mapGasOrder(r) {
      const sz = parseFloat(r.size)        || 0;
      const lp = parseFloat(r.limit_price) || 0;
      const lv = parseFloat(r.lev)         || 1;
      return {
        id:             r.order_id,
        symbol:         r.symbol || '',
        coin:           (r.symbol || '').replace('USDT',''),
        side:           r.side          || 'long',
        type:           r.order_type    || 'Limit',
        lev:            lv,
        size:           sz,
        limitPrice:     lp,
        margin:         sz * lp / lv,
        tp:             parseFloat(r.tp_price) || null,
        sl:             parseFloat(r.sl_price) || null,
        earnContractId: r.contract_id   || '',
        status:         'Pending',
        createdAt:      r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      };
    }

    // [v8.9 FIX Bug4(ข)] ยิง getOpenPositions + getEarnContracts + getOpenOrders พร้อมกัน
    // ไม่รอเรียงคิว ลดเวลาโหลดหน้าแรก ~50%
    // ════════════════════════════════════════════════
    //  1. POSITIONS + 2. EARN CONTRACTS + 3. OPEN ORDERS — parallel
    // ════════════════════════════════════════════════
    const [_posSettled, _ecSettled, _ooSettled] = await Promise.allSettled([
      dbCallRaw('getOpenPositions', { uid }),
      dbCallRaw('getEarnContracts', { uid }),
      dbCallRaw('getOpenOrders', { uid }),
    ]);

    // ── ประมวลผล POSITIONS ──
    try {
      if (_posSettled.status !== 'fulfilled') throw new Error(_posSettled.reason?.message || 'failed');
      const posResult = _posSettled.value;
      // [v11 FIX] getOpenPositions คืน plain array เสมอ (ไม่มี liq_price_map)
      // liq_price_map อยู่ใน getContractStatus เท่านั้น — รับค่าจาก step 1b ด้านล่าง
      let posListRaw;
      if (posResult && !Array.isArray(posResult) && Array.isArray(posResult.positions)) {
        // เผื่อ format ใหม่ในอนาคตที่ backend อาจส่งมาเป็น object
        posListRaw = posResult.positions;
      } else {
        posListRaw = Array.isArray(posResult) ? posResult : [];
      }
      // [v15 FIX] กรองเฉพาะ Active / Partially Closed เท่านั้น (ไม่รับ Closed)
      // ป้องกัน Closed positions ที่ GAS ยังไม่ได้ลบออกถูก load เข้า S.positions
      // → totalMarginUsed พุ่ง → drawdown เกิน 40% → false freeze
      // หมายเหตุ: 'Partially Closed' ต้องรับด้วย เพราะ position ยังไม่ full closed
      const posList = posListRaw.filter(r => {
        const st = (r.status || '').toLowerCase();
        return st === 'active' || st === 'partially closed' || st === '';
      });
      if (posListRaw.length !== posList.length) {
        console.warn('[OfflineEngine] filtered out non-Active positions:', posListRaw.length - posList.length,
          'rows (Closed/Partially Closed still in sheet)');
      }
      if (typeof S !== 'undefined') {
        // [v14 FIX] ลบ condition "length === 0" — reload เสมอทุก startup
        // merge by id: อัปเดต existing, เพิ่ม new, ลบที่หายไปจาก GAS
        const gasIds = new Set(posList.map(r => r.id));
        // ลบ position ที่ปิดแล้ว (ไม่มีใน GAS response)
        S.positions = S.positions.filter(p => gasIds.has(p.id));
        const localById = {};
        S.positions.forEach(p => { localById[p.id] = p; });
        posList.forEach(r => {
          const existing = localById[r.id];
          if (!existing) {
            S.positions.push(_mapGasPosition(r));
          } else {
            // [v17 FIX] เดิม comment บอกว่า "อัปเดต existing" แต่โค้ดจริงข้ามไปเฉยๆ
            // ทำให้ tp/sl ที่เปลี่ยนจาก server (เช่นตั้งใหม่จากอุปกรณ์อื่น/แอดมิน) ไม่เคย sync เข้า local เลย
            // sync เฉพาะ tp/sl/realized — ไม่แตะ liq/mark/pnl เพราะคำนวณจาก _liqPriceMap/coinPrices ฝั่ง client เท่านั้น
            const newTp = parseFloat(r.tp) || null;
            const newSl = parseFloat(r.sl) || null;
            if (existing.tp !== newTp) existing.tp = newTp;
            if (existing.sl !== newSl) existing.sl = newSl;
            existing.realized = parseFloat(r.realized_pnl) || existing.realized || 0;
          }
        });
        // [FIX FREEZE-ON-REFRESH] ตั้ง grace period 20 วินาทีหลัง restore positions
        // ป้องกัน calcDrawdown() trigger _autoLiquidate() ขณะ coinPrices ยังไม่ stable
        // (pnl=0 + margin เต็ม → currentBalance ต่ำผิดปกติ → drawdown เกิน 40% ทันที)
        if (posList.length > 0) {
          window._restoreGracePeriodUntil = Date.now() + 20000;
          console.warn('[OfflineEngine] grace period 20s started — calcDrawdown frozen until coinPrices stable');
        }
        if (typeof renderPositions === 'function') renderPositions();
        if (typeof updatePositionsPNL === 'function') updatePositionsPNL();
        console.warn('[OfflineEngine] positions synced from GAS:', posList.length, '(local:', S.positions.length, ')');
      }
    } catch(posErr) {
      console.warn('[OfflineEngine] loadPositions fail:', posErr.message);
    }

    // ════════════════════════════════════════════════
    //  1b. LIQ PRICE MAP — ดึงจาก getContractStatus per active contract
    //      [v11 FIX] liq_price_map อยู่ใน getContractStatus (ไม่ใช่ getOpenPositions)
    //      เรียกหลัง positions โหลดเสร็จ เพื่อให้ recalcPositions() ในรอบถัดไปมีค่าที่ถูกต้อง
    //      ทำงาน background (non-blocking) — ไม่หยุด loadOfflineState ถ้า fail
    // ════════════════════════════════════════════════
    try {
      // หา contract id ที่ unique จาก positions ที่เพิ่ง load มา
      // [v16 FIX] เดิมดึง getContractStatus เฉพาะ contract ที่มี position เปิดอยู่เท่านั้น
      // → contract ที่ active แต่ "ไม่มี position เหลือ" (เพิ่งปิดด้วยมือ/claim ไปแล้ว)
      //   จะไม่ถูก refresh เลย → window._contractDDMap[cid] ค้างค่าเก่า (drawdown_pct/isFrozen)
      //   จากรอบก่อนตลอดไป จนกว่าจะมี position ใหม่เกิดในสัญญานั้น → ตรงกับปัญหา "Cache Stale"
      //   และทำให้ "Contract Status (Frozen)" บางสัญญาไม่ถูกตรวจซ้ำตอน refresh
      // แก้โดยรวม contract id จาก earnContracts local (active/frozen ทุกตัว ไม่ใช่แค่ตัวที่มี position)
      // เข้ากับ id จาก positions ด้วย — ให้ getContractStatus ถูกเรียก sweep ครบทุกสัญญาที่ยังไม่ใช่ matured
      const _posCids = (typeof S !== 'undefined' && Array.isArray(S.positions) ? S.positions : [])
        .map(p => p.earnContractId)
        .filter(Boolean);
      const _localNonTerminalCids = (typeof earnContracts !== 'undefined' && Array.isArray(earnContracts))
        ? earnContracts.filter(c => c.status !== 'matured' && c.status !== 'closed').map(c => c.contractId).filter(Boolean)
        : [];
      const _activeCids = [...new Set([..._posCids, ..._localNonTerminalCids])];
      if (_activeCids.length > 0) {
        // ดึง getContractStatus แบบ parallel (Promise.allSettled — ไม่ fail ถ้าบางตัว error)
        const _csResults = await Promise.allSettled(
          _activeCids.map(cid => dbCallRaw('getContractStatus', { contract_id: cid, uid }))
        );
        // รวม liq_price_map + อัปเดต _contractDDMap จาก getContractStatus ทุก contract
        // [v12 FIX A] _contractDDMap ต้องถูก populate หลัง refresh ทันที
        // ป้องกัน DD badge ว่างใน buildPosCard หลัง softRefresh
        const _mergedLiqMap = {};
        window._contractDDMap = window._contractDDMap || {};
        _csResults.forEach((r, i) => {
          // [BUGFIX] dbCallRaw() unwrap แล้ว return json.data ตรงๆ — r.value คือ status object
          // นั้นเองอยู่แล้ว ไม่มี .data ซ้อนอีกชั้น (เดิมเช็ค r.value.data ผิด → return early ทุกครั้ง
          // → liq_price_map ไม่ถูก merge เข้า window._liqPriceMap เลย → "Liq. Price" ค้าง "—" ตลอด)
          if (r.status !== 'fulfilled' || !r.value) return;
          const _st  = r.value;
          const _cid = _activeCids[i];
          // อัปเดต liq_price_map
          if (_st.liq_price_map) Object.assign(_mergedLiqMap, _st.liq_price_map);
          // [v12 FIX A] อัปเดต _contractDDMap ด้วย drawdown_pct / isFrozen / isWarning จาก GAS
          // [FIX-SYNC-3c] เพิ่ม avail_margin / margin_cap / isMarginBlocked เพื่อให้ _refreshAvbl ใช้ได้
          // [FIX-DD3c] เพิ่ม trading_realized_loss + apt_yield_accrued เพื่อให้ showEarnDetail ใช้ได้
          window._contractDDMap[_cid] = {
            isFrozen:              !!_st.isFrozen,
            isWarning:             !!_st.isWarning,
            drawdown_pct:          _st.drawdown_pct,
            avail_margin:          _st.avail_margin,
            margin_cap:            _st.margin_cap,
            isMarginBlocked:       !!_st.isMarginBlocked,
            trading_realized_loss: _st.trading_realized_loss,
            apt_yield_accrued:     _st.apt_yield_accrued,
          };
          // sync _gasDrawdown กลับเข้า earnContracts local ด้วย
          if (typeof earnContracts !== 'undefined') {
            const _lc = earnContracts.find(x => x.contractId === _cid);
            if (_lc && _st.drawdown_pct !== undefined) {
              _lc._gasDrawdown = parseFloat(_st.drawdown_pct) || 0;
            }
          }
        });
        if (Object.keys(_mergedLiqMap).length > 0) {
          window._liqPriceMap = _mergedLiqMap;
          console.warn('[OfflineEngine] liq_price_map + contractDDMap synced from', _activeCids.length,
            'contract(s):', Object.keys(_mergedLiqMap).length, 'liq entries,',
            Object.keys(window._contractDDMap).length, 'DD entries');
          // trigger recalcPositions ให้ใช้ค่า liq_price_map ใหม่ทันที
          if (typeof updatePositionsPNL === 'function') updatePositionsPNL();
        }
      }
    } catch(liqMapErr) {
      console.warn('[OfflineEngine] liq_price_map fetch fail (non-blocking):', liqMapErr.message);
    }

    // ── ประมวลผล EARN CONTRACTS ──
    // ════════════════════════════════════════════════
    //  2. EARN CONTRACTS — โหลดจาก GAS เสมอ (override local)
    // ════════════════════════════════════════════════
    try {
      if (_ecSettled.status !== 'fulfilled') throw new Error(_ecSettled.reason?.message || 'failed');
      const ecResult = _ecSettled.value;
      const ecList   = Array.isArray(ecResult) ? ecResult
                        : (ecResult && Array.isArray(ecResult.contracts) ? ecResult.contracts : []);
      if (typeof earnContracts !== 'undefined') {
        // [v7 FIX] ตรวจสอบแม้ ecList.length === 0 → render เพื่อแสดงสถานะว่าง
        if (ecList.length) {
          const mapped = ecList.map(_mapGasContract);
          // [v7 FIX] merge by contractId — อัปเดต balance/status ที่เปลี่ยนจาก GAS Engine
          // ใช้ gasMap แทน splice ป้องกัน index shift ระหว่าง forEach
          const gasMap = {};
          mapped.forEach(c => { gasMap[c.contractId] = c; });

          if (earnContracts.length === 0) {
            // local ว่าง (หลัง refresh) → ใช้ GAS data ทั้งหมดทันที
            earnContracts.push(...mapped);
          } else {
            // อัปเดต local contracts ที่มีอยู่แล้ว + เพิ่มใหม่
            earnContracts.forEach((c, i) => {
              if (gasMap[c.contractId]) {
                const _gasRow = gasMap[c.contractId];
                // [v9 FIX] Pending-Freeze Guard: ถ้า local เพิ่ง freeze ไปเอง (_autoLiquidate)
                // แต่ GAS row ที่ดึงมายังไม่ทัน sync (ยังเป็น active) ภายใน 30s แรก
                // → อย่าให้ status ถูกทับกลับเป็น active ผิดๆ (รอ GAS sync ตามทันก่อน)
                const _pfUntil = window._pendingFreeze ? (window._pendingFreeze[c.contractId] || 0) : 0;
                const _holdFrozen = c.status === 'frozen' && _gasRow.status !== 'frozen' && Date.now() < _pfUntil;
                if (_gasRow.status === 'frozen' && window._pendingFreeze) delete window._pendingFreeze[c.contractId];
                // [FIX Bug#6] Pending-Earn-Sync Guard — ถ้า local เพิ่งปิด position ของสัญญานี้
                // ไปเองภายในไม่กี่วินาทีก่อน (posClose / trade-panel close) ให้ "เชื่อ local" ก่อน
                // ไม่รับค่า realizedPnl/currentBalance/totalClaimed จาก GAS round นี้ — เพราะ GAS
                // อาจยังไม่ commit write การปิด position เสร็จจริง (latency ~3-5s) ทำให้ค่าที่อ่าน
                // มาเป็นค่า "ก่อนปิด" ซึ่งจะมาทับ optimistic update ที่ถูกต้องอยู่แล้วใน local
                const _esUntil = window._pendingEarnSync ? (window._pendingEarnSync[c.contractId] || 0) : 0;
                const _holdEarnSync = Date.now() < _esUntil;
                if (!_holdEarnSync && window._pendingEarnSync) delete window._pendingEarnSync[c.contractId];
                Object.assign(earnContracts[i], {
                  currentBalance:  _holdFrozen ? earnContracts[i].currentBalance
                                    : (_holdEarnSync ? earnContracts[i].currentBalance : _gasRow.currentBalance),
                  frozenBalance:   _holdFrozen ? earnContracts[i].frozenBalance
                                    : (_holdEarnSync ? earnContracts[i].frozenBalance : _gasRow.frozenBalance),
                  status:          _holdFrozen ? 'frozen' : _gasRow.status,
                  realizedPnl:     _holdEarnSync ? earnContracts[i].realizedPnl : _gasRow.realizedPnl,
                  totalClaimed:    _holdEarnSync ? earnContracts[i].totalClaimed : _gasRow.totalClaimed,
                  lastYieldTimeMs: _gasRow.lastYieldTimeMs,
                  lastYieldDay:    _gasRow.lastYieldDay,
                  // [FIX FREEZE-ON-REFRESH] sync _lastFundedHour + _gasDrawdown จาก GAS data ใหม่
                  _lastFundedHour: _gasRow._lastFundedHour,
                  _gasDrawdown:    _gasRow._gasDrawdown,
                  // [v2.34 FIX-Q] sync contract_mode + isFixed — admin อาจสลับโหมดโดยไม่ reload
                  contract_mode:   _gasRow.contract_mode || 'trade',
                  isFixed:         !!_gasRow.isFixed,
                  // [NEW: TIER] sync contractTier จาก GAS (คำนวณครั้งเดียวตอนสร้าง ไม่เปลี่ยนภายหลัง แต่ sync ไว้เผื่อ)
                  contractTier:    _gasRow.contractTier || 'standard',
                });
                delete gasMap[c.contractId];
              }
            });
            // เพิ่ม contract ใหม่ที่ไม่มีใน local (สร้างจากอุปกรณ์อื่น / sync ช้า)
            Object.values(gasMap).forEach(c => earnContracts.push(c));
          }
          console.warn('[OfflineEngine] earnContracts synced from GAS:', ecList.length, '| local:', earnContracts.length);
        } else {
          // [v7 FIX] GAS คืน empty → อย่าลบ local ที่ยังสร้างอยู่ (อาจ sync ยังไม่ถึง)
          // ถ้า local ว่างด้วย → แสดง empty state ปกติ
          console.warn('[OfflineEngine] earnContracts: GAS returned empty, keeping local:', earnContracts.length);
        }
        // [v4 FIX-ACTIVE-FROZEN] หลัง merge earnContracts เสร็จ → reconcile status จาก _contractDDMap
        // กรณี: getContractStatus (step 1b) เสร็จก่อนและบอก isFrozen=true
        //   แต่ getEarnContracts (step 2) ยังส่ง status='active' มา (GAS Sheet latency)
        //   → earnContracts[i].status ถูก override กลับไปเป็น 'active' โดย Object.assign()
        // แก้: หลัง merge เสร็จ sweep ทุก contract ตรวจกับ _contractDDMap อีกรอบ
        //   ถ้า isFrozen=true และ status ยังเป็น active → บังคับ status='frozen' ทันที
        if (window._contractDDMap) {
          earnContracts.forEach(c => {
            const _ddEntry = window._contractDDMap[c.contractId];
            if (_ddEntry && _ddEntry.isFrozen && c.status !== 'frozen' && c.status !== 'matured') {
              console.warn('[OfflineEngine] FIX-ACTIVE-FROZEN: force status=frozen for', c.contractId,
                '(GAS sheet returned active but _contractDDMap says isFrozen)');
              c.status = 'frozen';
              // ป้องกัน loadOfflineState รอบถัดไปทับสถานะนี้กลับไปเป็น active
              window._pendingFreeze = window._pendingFreeze || {};
              if (!window._pendingFreeze[c.contractId]) {
                window._pendingFreeze[c.contractId] = Date.now() + 30000;
              }
            }
          });
        }
        // render เสมอ ไม่ว่า GAS จะคืนอะไรมา
        if (typeof renderEarnContracts === 'function') renderEarnContracts();
        // [vx4 FIX-EARN-BALANCE] sync Overview/Futures ทันทีหลัง earnContracts load จาก GAS
        // เดิม: updateOverviewBalances ถูกเรียกก่อน loadOfflineState earn block เสร็จ
        //   → Earn tab แสดงยอดจาก GAS ใหม่ แต่ Overview/Futures ยังใช้ earnContracts เก่า
        //   → ยอดต่างกัน 3-5 วิ จนกว่า loadDashboard poll รอบถัดไปจะ call updateOverviewBalances ซ้ำ
        // ใหม่: เรียกซ้ำหลัง earnContracts merge + render เสร็จ → ทุก tab แสดงตรงกันทันที
        if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
      }
    } catch(ecErr) {
      console.warn('[OfflineEngine] loadEarnContracts fail:', ecErr.message);
    }

    // ── ประมวลผล OPEN ORDERS ──
    // ════════════════════════════════════════════════
    //  3. OPEN ORDERS — โหลดจาก GAS เสมอ (override local)
    // ════════════════════════════════════════════════
    try {
      if (_ooSettled.status !== 'fulfilled') throw new Error(_ooSettled.reason?.message || 'failed');
      const ooResult = _ooSettled.value;
      const ooList   = Array.isArray(ooResult) ? ooResult
                        : (ooResult && Array.isArray(ooResult.orders) ? ooResult.orders : []);
      if (typeof S !== 'undefined') {
        S.openOrders = S.openOrders || [];
        if (ooList.length) {
          const gasOIds = new Set(ooList.map(r => r.order_id));
          // [v14 FIX] sync สองทาง: ลบ order ที่ถูก fill/cancel โดย GAS Engine
          S.openOrders = S.openOrders.filter(o => gasOIds.has(o.id));
          const localOIds = new Set(S.openOrders.map(o => o.id));
          ooList.forEach(r => {
            if (!localOIds.has(r.order_id)) {
              S.openOrders.push(_mapGasOrder(r));
            }
          });
        } else {
          // GAS คืน empty → clear local ด้วย (order ถูก fill/cancel หมดแล้ว)
          S.openOrders = [];
        }
        if (typeof renderOpenOrders === 'function') renderOpenOrders();
        console.warn('[OfflineEngine] openOrders synced from GAS:', ooList.length);
      }
    } catch(ooErr) {
      console.warn('[OfflineEngine] loadOpenOrders fail:', ooErr.message);
    }

  } catch (e) {
    console.warn('[OfflineEngine] loadOfflineState fail:', e.message);
  } finally {
    // [v9 FIX] ปลด Refresh Lock เมื่อ sync เสร็จสมบูรณ์เท่านั้น (สำเร็จหรือ error ก็ปลด ไม่ค้าง lock ตลอดไป)
    window._refreshLock = false;
  }
}

// ══════════════════════════════════════════════════════════════════
//  PATCH HIST — Auto-capture ทุก event → queue → GAS
//  ─────────────────────────────────────────────────────────────
//  ⚠️ Patch ทุกอันอยู่ที่นี่ครบแล้ว — ไม่ต้องเพิ่มที่อื่นอีก
// ══════════════════════════════════════════════════════════════════

// ── Futures: เปิด position ───────────────────────────────────────────────────
const _origLogOpen = HIST.logOpen.bind(HIST);
HIST.logOpen = function(pos) {
  _origLogOpen(pos);
  // [FIX-OSC-ROLLBACK] รอ promise จาก GAS — ถ้า GAS reject (business-logic guard)
  // ให้ rollback position ออกจาก S.positions ทันที ไม่รอให้ user refresh แล้วออเดอร์หาย
  // dbWrite จะ throw err ออกมาถ้าเป็น permanent error และแสดง toast ไปแล้ว
  const _savePromise = saveOpenPosition(pos);
  if (_savePromise && typeof _savePromise.catch === 'function') {
    _savePromise.catch(err => {
      // rollback: เอา position นี้ออกจาก S.positions
      if (typeof S !== 'undefined' && Array.isArray(S.positions)) {
        const _before = S.positions.length;
        S.positions = S.positions.filter(p => p.id !== pos.id);
        if (S.positions.length < _before) {
          // คืน margin ให้ EarnContract ด้วย ถ้า merged ให้ลด size กลับ
          const _cc = (typeof earnContracts !== 'undefined')
            ? earnContracts.find(c => c.contractId === pos.earnContractId)
            : null;
          if (_cc && typeof _refreshAvbl === 'function') _refreshAvbl(_cc);
          if (typeof renderPositions === 'function') renderPositions();
          if (typeof renderEarnContracts === 'function') renderEarnContracts();
          console.warn('[HIST.logOpen] ROLLBACK position id=' + pos.id + ' reason:', err.message);
        }
      }
      // [FIX-ROLLBACK-ORDER] ถ้า saveOpenPosition fail (GAS ปฏิเสธ position) ต้อง cancel order
      // ใน GAS ด้วย — ไม่งั้น order จะค้างเป็น status=Filled (หรือ Pending) โดยไม่มี Position คู่
      // → processLimitOrders รอบถัดไปอาจเห็น Pending แล้ว fill ซ้ำ หรือ admin เห็น orphan Filled order
      // หา orderId จาก pos.id ที่ใช้ pattern 'limit_{orderId}_{ts}' (ฝั่ง client) หรือ pos.orderId
      try {
        const _rollbackOrderId = pos.orderId ||
          (typeof pos.id === 'string' && pos.id.startsWith('limit_')
            ? pos.id.replace(/^limit_/, '').replace(/_\d+$/, '') // ดึง orderId กลางจาก 'limit_{orderId}_{ts}'
            : null);
        if (_rollbackOrderId && typeof dbCallRaw === 'function') {
          dbCallRaw('cancelOrder', { order_id: _rollbackOrderId }).catch(function(_cancelErr) {
            console.warn('[HIST.logOpen] ROLLBACK cancelOrder failed for order=' + _rollbackOrderId + ':', _cancelErr && _cancelErr.message);
          });
          console.warn('[HIST.logOpen] ROLLBACK cancelOrder sent for order=' + _rollbackOrderId);
        }
      } catch (_rollbackOrderErr) {
        console.warn('[HIST.logOpen] ROLLBACK cancelOrder error (non-blocking):', _rollbackOrderErr.message);
      }
    });
  }
  return _savePromise;
};

// ── Futures: ปิด position ────────────────────────────────────────
const _origLogClose = HIST.logClose.bind(HIST);
HIST.logClose = function(pos, closeAmt, exitPrice, realizedPnl, isFull) {
  _origLogClose(pos, closeAmt, exitPrice, realizedPnl, isFull);
  // [FIX] คำนวณ ROI จริง: margin = (entry * size) / lev
  const _margin = (pos.entry && pos.size && pos.lev)
    ? (pos.entry * pos.size) / pos.lev
    : pos.margin || 0;
  const _roi = _margin > 0 ? (realizedPnl / _margin) * 100 : 0;
  saveClosePosition({ ...pos, exitPrice }, realizedPnl, +_roi.toFixed(2), exitPrice, isFull);
  saveTrade({
    position_id:  pos.id,
    symbol:       pos.symbol || pos.coin + 'USDT',
    badge:        'Perp',
    dir:          pos.side === 'long' ? 'Sell' : 'Buy',
    order_type:   pos.type || 'Market',
    price:        exitPrice,
    filled:       closeAmt,
    fee:          +(exitPrice * closeAmt * 0.0005).toFixed(6),
    role:         'Taker',
    realized_pnl: realizedPnl,
    status:       'Filled',
    created_at:   new Date().toISOString(),
  });
};

// ── Spot trade ────────────────────────────────────────────────────
const _origLogSpot = HIST.logSpotTrade.bind(HIST);
HIST.logSpotTrade = function(coin, side, orderType, price, qty, fee) {
  _origLogSpot(coin, side, orderType, price, qty, fee);
  saveSpotTrade({
    symbol:     coin + '/USDT',
    dir:        side,
    order_type: orderType,
    price,
    filled:     qty,
    fee,
    role:       'Taker',
    status:     'Filled',
    created_at: new Date().toISOString(),
  });
  saveTransaction('Spot Trade', 'USDT', coin + '/USDT',
    (side === 'buy' ? '-' : '+') + fmtM(qty * price));
};

// ── Funding fee ───────────────────────────────────────────────────
const _origLogFunding = HIST.logFunding.bind(HIST);
HIST.logFunding = function(symbol, amount) {
  _origLogFunding(symbol, amount);
  saveFunding(symbol, amount);
};

// ── Internal Transfer ─────────────────────────────────────────────
const _origLogTransfer = HIST.logTransfer ? HIST.logTransfer.bind(HIST) : null;
if (_origLogTransfer) {
  HIST.logTransfer = function(amt, from, to) {
    _origLogTransfer(amt, from, to);
    saveTransfer(amt, from, to);
  };
}

// ── Withdraw (patch HIST.logWithdraw) ───────────────────────────
// [WALLET v1] astExecuteWithdraw ใหม่เรียก saveWithdraw โดยตรง (async)
// HIST.logWithdraw ถูกเรียกหลัง GAS ตอบกลับ → ทำหน้าที่แค่ local history เท่านั้น
// ไม่ต้อง patch saveWithdraw อีกต่อไป (ป้องกัน double-call)
if (typeof HIST !== 'undefined' && !HIST.logWithdraw) {
  HIST.logWithdraw = function(amt, coin, network, address, fee) {
    const ts = Date.now();
    if (!HIST.transactionHistory) HIST.transactionHistory = [];
    HIST.transactionHistory.unshift({
      id: HIST.genId ? HIST.genId() : String(ts), asset: coin,
      time: HIST.fmtTime ? HIST.fmtTime(ts) : new Date(ts).toLocaleString(), ts,
      type: 'Withdraw', symbol: network,
      amount: '-' + parseFloat(amt).toFixed(6), address, fee,
    });
    if (fee > 0) {
      HIST.transactionHistory.unshift({
        id: HIST.genId ? HIST.genId() : String(ts + 1), asset: coin,
        time: HIST.fmtTime ? HIST.fmtTime(ts) : new Date(ts).toLocaleString(), ts,
        type: 'Withdraw Fee', symbol: network,
        amount: '-' + parseFloat(fee).toFixed(6),
      });
    }
    // ไม่เรียก saveWithdraw ที่นี่ — astExecuteWithdraw จัดการแล้ว
  };
}

// ── Earn: Create ─────────────────────────────────────────────────
// patch submitCreateEarn hook point
const _origSubmitCreateEarn = typeof submitCreateEarn !== 'undefined'
  ? submitCreateEarn : null;

// ไม่ patch ฟังก์ชั่นโดยตรง เพราะ submitCreateEarn ใช้ function declaration
// → ใช้ MutationObserver แทน หรือเรียก saveEarnCreate ที่ท้ายสุดของ submitCreateEarn
// วิธีที่แนะนำ: เพิ่ม hook ใน submitCreateEarn ใน HTML โดยตรง:
//
//   function submitCreateEarn() {
//     ...โค้ดเดิม...
//     saveEarnCreate({ contractId: contract.contractId, amount: amt,
//                      planDays: days, dailyYield: yld });  // ← เพิ่มบรรทัดนี้
//   }
//
// หรือใช้ EventEmitter pattern ด้านล่าง:
// [v8] hooks ด้านล่างนี้เป็น fallback เผื่อ function declaration ยังไม่โหลด
// submitCreateEarn, submitClaimProfit, _autoLiquidate เรียก saveEarn* โดยตรงแล้ว
window._onEarnCreate = function(contract) {
  // [FIX-2b] no-op — disabled to prevent duplicate Earn Deposit transaction
  // submitCreateEarn() calls saveEarnCreate() directly; this hook must NOT call it again
  void contract;
};

window._onEarnClaim = function(contractId, userShare, netProfit) {
  if (typeof saveEarnClaim === 'function') saveEarnClaim({ contractId, userShare, netProfit });
};
window._onEarnLiquidate = function(contractId, loss, remaining) {
  if (typeof saveEarnLiquidate === 'function') saveEarnLiquidate({ contractId, loss, remaining });
};

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // [FIX-RECOVERY] เปิดใช้ QUEUE.restore() — กู้คำสั่งเขียนที่ค้าง/fail จาก session ก่อนหน้า
  // กลับมา retry อัตโนมัติ (เดิม dbWrite ส่งตรงไป GAS เท่านั้น ไม่เคย enqueue เมื่อ fail
  // ทำให้ QUEUE.restore() ไม่มีความหมายเพราะไม่มีอะไรให้กู้ — ตอนนี้ dbWrite enqueue เมื่อ fail แล้ว)
  QUEUE.restore();
  // ── init goldLevNote visibility ตาม S.coin เริ่มต้น ──
  setTimeout(_syncGoldLevNote, 500);

  // ── [AUTH] [v5 FIX SLOW-LOAD] เดิมรอ navTo() เรียก autoLoginFromMembers() ตอน splash
  //    หายที่ 4200ms เท่านั้น ("ไม่ต้องเรียกที่นี่เพื่อป้องกัน navTo ซ้ำซ้อน")
  //    แต่ autoLoginFromMembers() อ่าน session จาก localStorage ตรงๆ (synchronous, ไม่มี
  //    network call) — เรียกได้ทันทีโดยไม่กระทบ visual เพราะ .page ทั้งหมดยังถูก
  //    _hidePages() ซ่อนไว้อยู่จนกว่า splash timer จะ _showPages() (ดู initSplash ด้านบน)
  //    เรียกไว้ก่อนช่วยให้ USER_PROFILE.uid/avatar/โปรไฟล์/wallet display พร้อมเร็วขึ้น
  //    ไม่ต้องรอ 4.2s เปล่าๆ — navTo() ยังมี guard !USER_PROFILE._memberLoaded อยู่เดิม
  //    กันเรียกซ้ำตอน splash หาย (ถ้าเรียกที่นี่ไปแล้วจะ skip เอง ไม่ชนกัน)
  if (typeof USER_PROFILE !== 'undefined' && !USER_PROFILE._memberLoaded && typeof autoLoginFromMembers === 'function') {
    try { autoLoginFromMembers(); } catch(e) { console.error('[Auth] autoLoginFromMembers early-call failed:', e); }
  }

  // ── Offline Engine: sync earnContracts + openOrders ตอนเปิดแอป ──
  // [v5 FIX SLOW-LOAD] เดิม delay คงที่ 5000ms/1000ms ไม่ว่าเน็ตเร็วหรือช้า ทำให้ยอดเงิน/
  //   ออเดอร์/สัญญาโหลดช้าเสมอโดยไม่จำเป็น (ผู้ใช้เน็ตเร็วก็ต้องรอ 5 วิเปล่าๆ)
  //   ตรวจแล้ว: syncOfflineEngine()/loadOfflineState()/loadDashboard() (ดูภายในฟังก์ชัน)
  //   อ่าน uid จาก session ตรงๆอยู่แล้ว ไม่ต้องพึ่ง USER_PROFILE.uid ให้พร้อมก่อน และมี
  //   retry ในตัวถ้า session ยังไม่พร้อมจริงๆ (loadOfflineState retry เอง 3s)
  //   → เรียกได้ทันที ไม่ต้องเดารอ 5 วิ
  syncOfflineEngine();           // ส่ง local state → GAS
  loadOfflineState();            // ดึง GAS state กลับ (sync ทั้ง positions/contracts/orders)

  (async () => {
    try {
      const dash = await loadDashboard();
      console.warn('[DB] Dashboard ready | Queue:', QUEUE._q.length, 'pending');
      // [v7 FIX] render earnContracts หลัง dashboard โหลดเสร็จ (กรณี loadOfflineState ยังทำงาน)
      if (typeof renderEarnContracts === 'function') renderEarnContracts();
    } catch (e) {
      console.warn('[DB] Dashboard error (offline?)', e.message);
    }
  })();

  setTimeout(snapshotPortfolio, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') QUEUE.flush();
  });
  window.addEventListener('beforeunload', () => QUEUE.flush());
});

// ─────────────────────────────────────────────────────────────
