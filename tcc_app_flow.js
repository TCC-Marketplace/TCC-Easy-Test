// ════════════════════════════════════════════════════════════════
//  TC APPLICATION FLOW — ported from index_Easy_BN2_v14
//  ฐานข้อมูล: Applications table ใน DB1 (Worker/NocoDB)
//  PasswordHash: ใช้ร่วมกับ TCC_Database (DB1)
// ════════════════════════════════════════════════════════════════

const TC = {
  step: 1,
  member: null,
  traderApp: null,   // Applications row ที่ DesiredPosition==='เทรดเดอร์'
  appRow: null,      // backward compat สำหรับ password check
  appId: null,
  passwordHash: '',
};

// ── Helpers ────────────────────────────────────────────────────
function tcFmtNum(n){
  if(n===null||n===undefined||n==='')return '—';
  const v=parseFloat(String(n).replace(/,/g,''));
  if(isNaN(v))return String(n);
  return v.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function tcParseNum(s){
  if(!s&&s!==0)return 0;
  const v=parseFloat(String(s).replace(/[^0-9.-]/g,''));
  return isNaN(v)?0:v;
}
function tcBadge(st){
  const m={Approved:'#22c55e',Rejected:'#ef4444',Editing:'#fbbf24',Pending:'#60a5fa'};
  const c=m[st]||m.Pending;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700;background:${c}22;color:${c};border:1px solid ${c}44;">${st==='Approved'?tccT('tc_badge_approved'):st==='Rejected'?tccT('tc_badge_rejected'):st==='Editing'?tccT('tc_badge_editing'):tccT('tc_badge_pending')}</span>`;
}
function tcNumInput(id){
  const el=document.getElementById(id);if(!el)return;
  let v=el.value.replace(/[^0-9.]/g,'');
  const parts=v.split('.');
  if(parts.length>2)v=parts[0]+'.'+parts.slice(1).join('');
  el.dataset.raw=v;
  if(v){
    const n=parseFloat(v);
    if(!isNaN(n))el.value=n.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:6});
  }
}
function tcNumBlurSimple(id){
  const el=document.getElementById(id);if(!el)return;
  const raw=el.dataset.raw||el.value.replace(/[^0-9.]/g,'');
  el.dataset.raw=raw;
  const n=parseFloat(raw);
  if(!isNaN(n)&&raw!=='')el.value=n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ── tcRenderMain — render into #tc-app-root-main ──────────────
function tcRenderMain(){
  const r=document.getElementById('tc-app-root-main');if(!r)return;

  // ── ถ้า user login ผ่าน LG แล้ว (มี session) และ TC.member ยังว่าง
  //    → ดึง member จาก session มาใส่ TC แล้วข้ามไป step 4 ──
  if(TC.step<=3 && !TC.member){
    const sess=_lgLoadSession?_lgLoadSession():null;
    if(sess && sess.uid){
      // สร้าง member object จาก session
      const m={};
      m['BNB_ID']=sess.uid; m['UID']=sess.uid; m['Field 1']=sess.uid;
      m['Name']=sess.username||sess.uid;
      m['Team']=sess.team||'';
      m['Phone']=sess.phone||'';
      m['Address Wallet']=sess.walletAddress||'';
      m['Status']=sess.memberStatus||'';
      TC.member=m;
      // ดึง applications (PasswordHash) จาก DB1
      (async()=>{
        try{
          const bnbId=sess.uid;
          const appRes=await ndbFetch('applications',{where:`(BNB_ID,eq,${bnbId})`,limit:10});
          const apps=appRes.list||appRes.data?.list||(Array.isArray(appRes)?appRes:[]);
          const _sessRealApps=apps.filter(a=>(a.DesiredPosition||'')!=='ลงทะเบียน');
          TC.traderApp=_sessRealApps.find(a=>(a.DesiredPosition||'')==='เทรดเดอร์')||null;
          TC.appRow=TC.traderApp||_sessRealApps[0]||apps.find(a=>(a.DesiredPosition||'')==='ลงทะเบียน')||null;
          TC.appId=TC.appRow?(TC.appRow.Id||TC.appRow.id||null):null;
          TC.passwordHash=TC.appRow?.PasswordHash||'';
        }catch(e){TC.traderApp=null;TC.appRow=null;TC.appId=null;}
        TC.step=4;
        tcRenderMain();
      })();
      // แสดง loading ระหว่างรอ
      r.innerHTML=`<div style="text-align:center;padding:60px 20px;">
        <div style="font-size:2rem;margin-bottom:12px;">⏳</div>
        <div style="color:var(--t2);font-size:.9rem;"><span data-i18n="loading_member">${tccT('loading_member')}</span></div>
      </div>`;
      return;
    }
  }

  switch(TC.step){
    case 1:r.innerHTML=tcS1Main();break;
    case 2:r.innerHTML=tcS2Main();break;
    case 3:r.innerHTML=tcS3Main();break;
    case 4:r.innerHTML=tcS4Main();break;
    case 5:r.innerHTML=tcS5Summary();break;
  }
}

// ── Bar helpers ────────────────────────────────────────────────
function tcBarShow(type,msg){
  const root=document.getElementById('tc-app-root-main');if(!root)return;
  let old=root.querySelector('.tc-action-bar');if(old)old.remove();
  const bar=document.createElement('div');
  bar.className='tc-action-bar tc-bar-'+type;
  const iconMap={loading:'⏳',success:'✅',error:'❌',warn:'⚠️'};
  if(type==='loading'){
    bar.innerHTML=`<div class="tc-bar-spin"></div><div class="tc-bar-title">${msg}</div>`;
  }else{
    bar.innerHTML=`<span>${iconMap[type]||'•'}</span><div class="tc-bar-title">${msg}</div><button class="tc-bar-close" onclick="this.closest('.tc-action-bar').remove()">✕</button>`;
  }
  root.prepend(bar);
}
function tcBarRemove(){
  const r=document.getElementById('tc-app-root-main');
  if(r){const b=r.querySelector('.tc-action-bar');if(b)b.remove();}
}
function tcErr(el,msg){if(el){el.textContent=msg;el.style.display='block';}}

// ── Step bar ───────────────────────────────────────────────────
function tcBarSteps(cur){
  const steps=[{n:1,l:tccT('step_lbl_bnbid')},{n:2,l:tccT('step_lbl_verify')},{n:3,l:tccT('step_lbl_password')},{n:4,l:tccT('step_lbl_apply')},{n:5,l:tccT('step_lbl_summary')}];
  let h='<div class="tc-step-bar">';
  steps.forEach((s,i)=>{
    const c=cur>s.n?'s-done':cur===s.n?'s-active':'';
    h+=`<div class="tc-step ${c}"><div class="tc-step-dot">${cur>s.n?'✓':s.n}</div><div class="tc-step-lbl">${s.l}</div></div>`;
    if(i<steps.length-1)h+=`<div class="tc-step-line ${cur>s.n?'done':''}"></div>`;
  });
  return h+'</div>';
}

// ── Step 1: BNB ID ─────────────────────────────────────────────
function tcS1Main(){
  return `${tcBarSteps(1)}
  <div class="tc-card">
    <div class="tc-card-ttl"><span data-i18n="trader_app">${tccT('trader_app')}</span></div>
    <p style="font-size:.8rem;color:var(--t2);margin-bottom:14px;">${tccT('tc_hint_bnbid')}</p>
    <div class="tc-grp">
      <label class="tc-lbl"><span data-i18n="member_id">${tccT('member_id')}</span></label>
      <input class="tc-inp" id="tc-bnbid" placeholder="${tccT('bnbid_placeholder')}" maxlength="40"
        onkeydown="if(event.key==='Enter')tcS1go()">
      <div class="tc-err" id="tc-e1" style="display:none;"></div>
    </div>
    <button class="tc-btn tc-btn-gold" onclick="tcS1go()"><span data-i18n="search_member">${tccT('search_member')}</span></button>
  </div>`;
}
async function tcS1go(){
  const inp=document.getElementById('tc-bnbid'),err=document.getElementById('tc-e1');
  if(!inp)return;
  const v=inp.value.trim();
  if(!v){tcErr(err,tccT('tc_err_bnbid_empty'));return;}
  inp.disabled=true;
  tcBarShow('loading',tccT('tc_loading_member'));
  // โหลด MEMBERS ถ้ายังไม่มี
  if(!MEMBERS||!MEMBERS.length){
    try{await loadMembers();}catch(e){inp.disabled=false;tcBarShow('error',tccT('tc_err_db_connect'));return;}
  }
  const found=MEMBERS.find(m=>memVal(m,'id').toLowerCase()===v.toLowerCase());
  if(!found){inp.disabled=false;tcBarShow('error',tccT('tc_err_not_found').replace('{v}',v));return;}
  TC.member=found;
  // ดึง Applications record (PasswordHash อยู่ที่นี่)
  tcBarShow('loading',tccT('tc_loading_app'));
  try{
    const appRes=await ndbFetch('applications',{where:`(BNB_ID,eq,${v})`,limit:10});
    const apps=appRes.list||appRes.data?.list||(Array.isArray(appRes)?appRes:[]);
    const _tcRealApps=apps.filter(r=>(r.DesiredPosition||'')!=='ลงทะเบียน');
    TC.traderApp=_tcRealApps.find(r=>(r.DesiredPosition||'')==='เทรดเดอร์')||null;
    // appRow = ใช้เก็บ PasswordHash — รับจาก record 'ลงทะเบียน' ด้วย (เพราะมี hash)
    TC.appRow=TC.traderApp||_tcRealApps[0]||apps.find(r=>(r.DesiredPosition||'')==='ลงทะเบียน')||null;
    TC.appId=TC.appRow?(TC.appRow.Id||TC.appRow.id||null):null;
  }catch(e){TC.traderApp=null;TC.appRow=null;TC.appId=null;}
  tcBarRemove();TC.step=2;tcRenderMain();
}

// ── Step 2: ยืนยันตัวตน ────────────────────────────────────────
function tcS2Main(){
  const m=TC.member,name=memVal(m,'name');
  const masked=name.length>2?name[0]+'*'.repeat(Math.max(1,name.length-2))+name[name.length-1]:name;
  const hasTrader=!!TC.traderApp;
  return `${tcBarSteps(2)}
  <div class="tc-card">
    <div class="tc-card-ttl"><span data-i18n="verify_id">${tccT('verify_id')}</span></div>
    <div class="tc-mem-banner">
      <div class="tc-mem-av">${(name||'?')[0].toUpperCase()}</div>
      <div>
        <div class="tc-mem-name">${masked}</div>
        <div class="tc-mem-sub">${tccT('tc_mem_sub_sep')}: ${memVal(m,'team')||'—'} | ID: ${memVal(m,'id')}</div>
        ${hasTrader?`<div style="margin-top:3px;">${tcBadge(TC.traderApp.Status||'Pending')} ${tccT('tc_badge_trader')}</div>`:''}
      </div>
    </div>
    <div class="tc-grp">
      <label class="tc-lbl"><span data-i18n="phone_reg">${tccT('phone_reg')}</span></label>
      <input class="tc-inp" id="tc-phone" type="tel" placeholder="0812345678" maxlength="20"
        onkeydown="if(event.key==='Enter')tcS2go()">
      <div class="tc-err" id="tc-e2" style="display:none;"></div>
    </div>
    <button class="tc-btn tc-btn-gold" onclick="tcS2go()"><span data-i18n="verify_now">${tccT('verify_now')}</span></button>
    <button class="tc-btn tc-btn-out" onclick="TC.step=1;tcRenderMain();"><span data-i18n="back">${tccT('back')}</span></button>
  </div>`;
}
function tcS2go(){
  const inp=document.getElementById('tc-phone'),err=document.getElementById('tc-e2');
  if(!inp)return;
  const normPhone=s=>String(s||'').replace(/[^0-9]/g,'').replace(/^0+/,'');
  const v=inp.value.trim();
  if(!v||v.replace(/[^0-9]/g,'').length<9){tcErr(err,tccT('phone_err_invalid'));return;}
  const stored=normPhone(memVal(TC.member,'phone'));
  const entered=normPhone(v);
  if(!stored){tcErr(err,tccT('phone_err_notfound'));return;}
  if(entered!==stored){tcErr(err,tccT('phone_err_mismatch'));return;}
  TC.step=3;tcRenderMain();
}

// ── Step 3: รหัสผ่าน ───────────────────────────────────────────
function tcS3Main(){
  const hp=TC.appRow&&TC.appRow.PasswordHash?TC.appRow.PasswordHash:null;
  return `${tcBarSteps(3)}
  <div class="tc-card">
    <div class="tc-card-ttl">${hp?tccT('tc_s3_title_login'):tccT('tc_s3_title_set')}</div>
    <p style="font-size:.79rem;color:var(--t2);margin-bottom:14px;">
      ${hp?tccT('tc_s3_hint_login'):tccT('tc_s3_hint_set')}
    </p>
    <div class="tc-grp">
      <label class="tc-lbl">${hp?tccT('pw_label'):tccT('pw_new_label')}</label>
      <input class="tc-inp" id="tc-pass" type="password" placeholder="••••••••" maxlength="64"
        onkeydown="if(event.key==='Enter')tcS3go()">
      <div class="tc-err" id="tc-e3" style="display:none;"></div>
    </div>
    ${!hp?`<div class="tc-grp"><label class="tc-lbl"><span data-i18n="confirm_password">${tccT('confirm_password')}</span></label>
      <input class="tc-inp" id="tc-pass2" type="password" placeholder="••••••••" maxlength="64"
        onkeydown="if(event.key==='Enter')tcS3go()">
    </div>`:''}
    <button class="tc-btn tc-btn-gold" onclick="tcS3go()">${hp?tccT('tc_s3_btn_login'):tccT('tc_s3_btn_set')}</button>
    <button class="tc-btn tc-btn-out" onclick="TC.step=2;tcRenderMain();"><span data-i18n="back">${tccT('back')}</span></button>
  </div>`;
}
async function tcS3go(){
  const inp=document.getElementById('tc-pass'),err=document.getElementById('tc-e3');
  if(!inp)return;
  const pass=inp.value;
  if(pass.length<6){tcErr(err,tccT('pw_error_short'));return;}
  const hp=TC.appRow&&TC.appRow.PasswordHash?TC.appRow.PasswordHash:null;
  const hash=await tcHash(pass);
  if(hp){
    if(hash!==hp){tcErr(err,tccT('pw_error_wrong'));return;}
  }else{
    const inp2=document.getElementById('tc-pass2');
    if(inp2&&inp2.value!==pass){tcErr(err,tccT('pw_error_mismatch'));return;}
    // บันทึก PasswordHash ลง Applications DB1
    tcBarShow('loading',tccT('tc_s3_loading'));
    try{
      if(!TC.appId){
        // ไม่มี applications record → สร้างใหม่
        const res=await fetch(`${WORKER_URL}/api/applications`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            Title:'REG-'+memVal(TC.member,'id'),
            BNB_ID:memVal(TC.member,'id'),MemberName:memVal(TC.member,'name'),
            Phone:TC.member['Phone']||'',Team:memVal(TC.member,'team'),
            DesiredPosition:'ลงทะเบียน',   // ไม่ใช่ใบสมัครเทรดเดอร์ — แค่บันทึก PasswordHash
            Status:'Registered',            // แยกออกจาก Pending ของใบสมัครจริง
            PasswordHash:hash,SubmittedAt:new Date().toISOString(),UpdatedAt:new Date().toISOString(),
          }),
        });
        if(!res.ok)throw new Error(tccT('tc_save_pw_fail')+' ('+res.status+')');
        const created=await res.json();
        TC.appRow=created;TC.appId=created.Id||created.id||null;
        TC.traderApp=created;
        if(TC.appRow)TC.appRow.PasswordHash=hash;
      }else{
        const res=await fetch(`${WORKER_URL}/api/applications/${TC.appId}`,{
          method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({PasswordHash:hash}),
        });
        if(!res.ok)throw new Error(tccT('tc_save_pw_fail')+' ('+res.status+')');
        TC.appRow.PasswordHash=hash;
      }
      tcBarRemove();
    }catch(e){tcBarShow('error','❌ '+e.message);return;}
  }
  TC.passwordHash=hash;
  TC.step=4;tcRenderMain();
}

// ── Step 4: ใบสมัคร ────────────────────────────────────────────
function tcS4Main(){
  const m=TC.member;
  if(!m){TC.step=1;tcRenderMain();return '';}
  const name=memVal(m,'name');
  return `${tcBarSteps(4)}
  <div class="tc-card">
    <div class="tc-card-ttl"><span data-i18n="member_step1">${tccT('member_step1')}</span></div>
    <div style="display:grid;grid-template-columns:110px 1fr;gap:5px 12px;font-size:.82rem;">
      <span style="color:var(--t2);">${tccT('tc_name')}</span><span style="font-weight:600;">${name}</span>
      <span style="color:var(--t2);">BNB ID</span><span style="font-family:monospace;">${memVal(m,'id')}</span>
      <span style="color:var(--t2);"><span data-i18n="team">${tccT('team')}</span></span><span>${memVal(m,'team')||'—'}</span>
      <span style="color:var(--t2);">${tccT('tc_phone_lbl')}</span><span>${memVal(m,'phone')||'—'}</span>
    </div>
  </div>
  <div class="tc-card">
    <div class="tc-card-ttl">${tccT('tc_trader_title')}</div>
    ${TC.traderApp?tcReadonlyCard(TC.traderApp,tccT('tc_trader_title')):tcTraderForm()}
  </div>
  <button class="tc-btn tc-btn-out" onclick="navTo('futures');" style="margin-top:4px;"><span data-i18n="back_trade">${tccT('back_trade')}</span></button>`;
}

// ── tcReadonlyCard ─────────────────────────────────────────────
function tcReadonlyCard(app,title){
  const st=app.Status||'Pending';
  const isT=(app.DesiredPosition||'')==='เทรดเดอร์';
  const stMap={
    Approved:{bg:'rgba(34,197,94,.1)',bd:'rgba(34,197,94,.3)',msg:tccT('tc_status_approved')},
    Rejected:{bg:'rgba(239,68,68,.1)',bd:'rgba(239,68,68,.3)',msg:tccT('tc_status_rejected')},
    Editing:{bg:'rgba(251,191,36,.1)',bd:'rgba(251,191,36,.3)',msg:tccT('tc_status_editing')},
    Pending:{bg:'rgba(96,165,250,.08)',bd:'rgba(96,165,250,.2)',msg:tccT('tc_status_pending')},
  };
  const sc=stMap[st]||stMap.Pending;
  const fv=v=>v?tcFmtNum(v):'—';
  const extraLines=(app.ExtraNote||'').split('\n');
  const protect=extraLines[0]||'—';
  const note=extraLines.slice(1).join('\n').trim();
  return `<div style="background:${sc.bg};border:1px solid ${sc.bd};border-radius:8px;padding:10px 13px;margin-bottom:12px;font-size:.8rem;">
    <div style="font-weight:600;">${sc.msg}</div>
    ${app.AdminNote?`<div style="color:var(--t2);font-size:.74rem;margin-top:4px;">📝 ${tccT('note')}: ${app.AdminNote}</div>`:''}
    <div style="color:var(--t2);font-size:.72rem;margin-top:4px;"><span data-i18n="edit_admin">${tccT('edit_admin')}</span></div>
  </div>
  <div style="display:grid;grid-template-columns:130px 1fr;gap:5px 12px;font-size:.8rem;margin-bottom:12px;">
    <span style="color:var(--t2);">${tccT('tc_position')}</span><span style="font-weight:600;color:var(--y);">${app.DesiredPosition||'—'}</span>
    <span style="color:var(--t2);">${tccT('tc_ref')}</span><span style="font-family:monospace;font-size:.74rem;">${app.Title||'—'}</span>
    <span style="color:var(--t2);">${tccT('tc_submitted_at')}</span><span>${(app.SubmittedAt||'—').slice(0,10)}</span>
    ${isT?`<span style="color:var(--t2);">${tccT('tc_protect_range')}</span><span style="color:var(--y);font-weight:600;">${protect}</span>`+
      (note?`<span style="color:var(--t2);"><span data-i18n="save">${tccT('save')}</span></span><span>${note}</span>`:''):''}
  </div>
  <button class="tc-btn tc-btn-gold" onclick="tcDownloadPDF(true,TC.traderApp)" style="margin-bottom:0;">
    ${tccT('tc_download_contract')}
  </button>`;
}

// ── tcTraderForm ───────────────────────────────────────────────
function tcTraderForm(){
  return `<div id="tc-trader-form">
    <div style="background:rgba(240,185,11,.07);border:1px solid rgba(240,185,11,.2);border-radius:8px;padding:10px 13px;margin-bottom:12px;font-size:.78rem;color:#ccc;">
      ${tccT('tc_trader_info')}
    </div>
    <div class="tc-grp">
      <label class="tc-lbl">${tccT('tc_protect_label')} <span style="color:var(--y)">*</span></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;" id="tc-protect-btns">
        ${['$100 - $1,000','$1,000 - $10,000','$10,000 - $50,000','$50,000 - $100,000',tccT('tc_protect_opt5')].map(v=>
          `<button type="button" class="tc-protect-opt" onclick="tcSelectProtect(this,'${v}')"
            style="padding:7px 13px;border-radius:8px;border:1px solid rgba(240,185,11,.3);background:rgba(240,185,11,.06);color:var(--t1);font-size:.77rem;cursor:pointer;transition:all .18s;">
            ${v}
          </button>`
        ).join('')}
      </div>
      <input type="hidden" id="tc-trader-protect" value="">
      <div id="tc-protect-err" style="font-size:.72rem;color:#ef4444;margin-top:4px;display:none;">${tccT('tc_protect_err')}</div>
    </div>
    <div class="tc-grp">
      <label class="tc-lbl"><span data-i18n="note">${tccT('note')}</span></label>
      <textarea class="tc-inp" id="tc-trader-note" placeholder="${tccT('tc_note_detail')}" style="min-height:70px;"></textarea>
    </div>
    <div style="margin-top:10px;">
      <div style="font-size:.8rem;color:var(--y);font-weight:600;margin-bottom:6px;">${tccT('tc_agreement_title')}</div>
      <div class="tc-agree-scroll">${tcGetAgreementText('เทรดเดอร์')}</div>
      <div class="tc-chk-row" style="margin-top:10px;">
        <input type="checkbox" id="tc-trader-agree" onchange="document.getElementById('tc-trader-subm').disabled=!this.checked">
        <label for="tc-trader-agree">${tccT('tc_agree_chk')}</label>
      </div>
      <button class="tc-btn tc-btn-gold" id="tc-trader-subm" onclick="tcSubmitTrader()" disabled style="margin-top:8px;">
        ${tccT('submit_trader_app')}
      </button>
    </div>
  </div>`;
}

// ── tcSelectProtect ────────────────────────────────────────────
function tcSelectProtect(el,val){
  document.querySelectorAll('.tc-protect-opt').forEach(b=>{
    b.style.background='rgba(240,185,11,.06)';
    b.style.borderColor='rgba(240,185,11,.3)';
    b.style.color='var(--t1)';
    b.style.fontWeight='400';
  });
  el.style.background='rgba(240,185,11,.22)';
  el.style.borderColor='var(--y)';
  el.style.color='var(--y)';
  el.style.fontWeight='700';
  const inp=document.getElementById('tc-trader-protect');
  if(inp)inp.value=val;
  const err=document.getElementById('tc-protect-err');
  if(err)err.style.display='none';
}

// ── tcSubmitTrader ─────────────────────────────────────────────
async function tcSubmitTrader(){
  const btn=document.getElementById('tc-trader-subm');
  const note=document.getElementById('tc-trader-note')?.value||'';
  const protect=document.getElementById('tc-trader-protect')?.value||'';
  if(!protect){
    const err=document.getElementById('tc-protect-err');
    if(err)err.style.display='block';
    tcBarShow('error',tccT('tc_protect_err_select'));
    return;
  }
  if(btn){btn.disabled=true;btn.textContent=tccT('btn_saving');}
  tcBarShow('loading',tccT('tc_submit_loading'));
  const now=new Date().toISOString(),m=TC.member;
  const extraNote=protect+(note?'\n'+note:'');
  const payload={
    Title:`APP-${memVal(m,'id')}-T-${Date.now().toString(36).toUpperCase()}`,
    BNB_ID:memVal(m,'id'),MemberName:memVal(m,'name'),Phone:m['Phone']||'',
    Team:memVal(m,'team'),TargetMonths:0,TargetMembers:0,
    TargetVolume:0,BonusAmount:0,MonthlyFee:0,
    DesiredPosition:'เทรดเดอร์',ExtraNote:extraNote,
    Status:'Pending',PasswordHash:TC.passwordHash,
    SubmittedAt:now,UpdatedAt:now,
  };
  try{
    const rr=await fetch(`${WORKER_URL}/api/applications`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!rr.ok)throw new Error(`HTTP ${rr.status}: ${(await rr.json().catch(()=>({}))).error||rr.statusText}`);
    const res=await rr.json();
    TC.traderApp={...payload,Id:res.Id||res.id};
    if(!TC.appRow)TC.appRow=TC.traderApp;
    tcBarRemove();
    // ยื่นใบสมัครสำเร็จ → ไปหน้าเทรดทันที
    setTimeout(()=>navTo('futures'), 600);
  }catch(e){
    tcBarRemove();tcBarShow('error',tccT('tc_submit_fail')+' '+e.message);
    if(btn){btn.disabled=false;btn.textContent=tccT('submit_trader_app');}
  }
}

// ── Step 5: สรุป ───────────────────────────────────────────────
function tcS5Summary(){
  const tApp=TC.traderApp;
  return `${tcBarSteps(5)}
  <div class="tc-card">
    <div class="tc-success-box">
      <div class="tc-si">🎉</div>
      <div class="tc-st-title"><span data-i18n="submitted_ok">${tccT('submitted_ok')}</span></div>
      <div class="tc-ss">${tccT('tc_review_note')}</div>
    </div>
    ${tApp?`<div style="background:rgba(240,185,11,.07);border:1px solid rgba(240,185,11,.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.82rem;">
      🔰 <b>${tccT('tc_trader_badge')}</b> — ${tApp.Title||''}<br>
      <span style="color:var(--t2);font-size:.74rem;">${tccT('tc_status_lbl')}: </span>${tcBadge(tApp.Status||'Pending')}
    </div>`:''}
    <button class="tc-btn tc-btn-gold" onclick="TC.step=4;tcRenderMain();"><span data-i18n="view_contract">${tccT('view_contract')}</span></button>
    <button class="tc-btn tc-btn-out" onclick="navTo('futures');" style="margin-top:8px;"><span data-i18n="start_trade">${tccT('start_trade')}</span></button>
  </div>`;
}

// ── tcGetAgreementText — เนื้อหาสัญญา 12 ส่วนเต็ม ──────────────
function tcGetAgreementText(pos){
  if(pos==='เทรดเดอร์'){
    return `
<h4 style="color:var(--y);margin:0 0 4px;">สัญญาบันทึกข้อตกลงการร่วมเทรด (Trading Partnership Agreement)</h4>
<p style="color:var(--t2);font-size:.75rem;margin-bottom:10px;">Trader Café Club — ประเทศไทย</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:.8rem;">
  <tr><td style="padding:4px 8px;color:var(--t2);width:140px;">ระยะเวลารับประกัน</td><td style="padding:4px 8px;">3 เดือนแรก สำหรับสมาชิกใหม่</td></tr>
  <tr><td style="padding:4px 8px;color:var(--t2);">อ้างอิงกฎหมาย</td><td style="padding:4px 8px;">ป.พ.พ. มาตรา 369–398 และ พ.ร.บ.สัญญาซื้อขาย พ.ศ.2562</td></tr>
  <tr><td style="padding:4px 8px;color:var(--t2);">แพลตฟอร์ม</td><td style="padding:4px 8px;">Binance Exchange — บัญชีของสมาชิกเอง ไม่มีการโอนเงินให้บุคคลอื่น</td></tr>
</table>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 1 — คู่สัญญา</h4>
<p><b>ผู้ให้บริการ:</b> คณะกรรมการบริหารโครงการ Trader Café Club ประเทศไทย</p>
<p><b>สมาชิก/ผู้เข้าร่วมเทรด:</b> ตามข้อมูลที่กรอกในใบสมัครฉบับนี้</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 2 — นิยามและคำจำกัดความ</h4>
<p><b>"ระบบ"</b> — ระบบสัญญาณเทรดและโปรแกรมบริหารพอร์ตที่ผู้ดำเนินการพัฒนาและให้บริการ</p>
<p><b>"พอร์ต"</b> — บัญชีซื้อขายสกุลเงินดิจิทัลบน Binance ที่อยู่ในชื่อของสมาชิกเอง</p>
<p><b>"กำไรสุทธิ"</b> — ผลต่างระหว่างมูลค่าพอร์ตสิ้นงวดกับต้นงวด หลังหักค่าธรรมเนียมแพลตฟอร์ม</p>
<p><b>"Liquidity Claim"</b> — การขอเบิกเงินชดเชยกรณีพอร์ตได้รับความเสียหาย</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 3 — วัตถุประสงค์และระยะเวลา</h4>
<p>สัญญาฉบับนี้กำหนดสิทธิ หน้าที่ และความรับผิดชอบในการร่วมใช้บริการระบบสัญญาณเทรดผ่าน Binance <b>สมาชิกยังคงเป็นเจ้าของบัญชีและสินทรัพย์ทั้งหมด</b> ผู้ดำเนินการให้บริการสัญญาณและกลยุทธ์เท่านั้น</p>
<p>ระยะเวลา: <b>12 เดือน</b> ต่ออายุอัตโนมัติหากไม่แจ้งยกเลิกล่วงหน้า 30 วัน สมาชิกใหม่ได้รับการรับประกัน <b>3 เดือนแรก</b></p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 4 — สิทธิและหน้าที่</h4>
<p><b>หน้าที่ผู้ดำเนินการ:</b></p>
<ul style="padding-left:16px;margin:4px 0 8px;">
  <li>จัดหาและส่งสัญญาณเทรดอย่างสม่ำเสมอและทันเวลา</li>
  <li>ให้ข้อมูล คำแนะนำ และการฝึกอบรมที่เกี่ยวข้อง</li>
  <li>ตรวจสอบและพิจารณาคำขอ Liquidity Claim ภายในระยะเวลาที่กำหนด</li>
  <li>รักษาความลับข้อมูลส่วนบุคคลตาม PDPA พ.ศ.2562</li>
  <li>สำรองจ่ายส่วนต่างรายได้ขั้นต่ำกรณีกำไรไม่ถึง 10%</li>
</ul>
<p><b>หน้าที่สมาชิก:</b></p>
<ul style="padding-left:16px;margin:4px 0 8px;">
  <li>เทรดผ่านบัญชี Binance ของตนเองเท่านั้น</li>
  <li><b>ห้าม</b>โอนเงินหรือมอบ Login Credentials ให้บุคคลใดโดยเด็ดขาด</li>
  <li>ปฏิบัติตามกฎระเบียบการเทรดของระบบโดยเคร่งครัด</li>
  <li>ชำระส่วนแบ่งรายได้ตรงเวลาตามอัตราที่กำหนด</li>
  <li>แจ้งผู้ดำเนินการทันทีหากบัญชีถูกระงับหรือมีเหตุผิดปกติ</li>
</ul>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 5 — สัดส่วนรายได้จากกำไรสุทธิ</h4>
<table style="width:100%;border-collapse:collapse;font-size:.78rem;margin-bottom:8px;">
  <thead><tr style="background:rgba(240,185,11,.15);">
    <th style="padding:5px 8px;text-align:left;">#</th><th style="padding:5px 8px;text-align:left;"><span data-i18n="income_type">${tccT('income_type')}</span></th>
    <th style="padding:5px 8px;text-align:center;">สัดส่วน</th><th style="padding:5px 8px;text-align:left;">คำอธิบาย</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">1</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);"><span data-i18n="team_comm_title">${tccT('team_comm_title')}</span></td><td style="padding:4px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);">10%</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">ค่าตอบแทนทีมงานและเครือข่าย</td></tr>
    <tr><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">2</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">ประกันรายได้</td><td style="padding:4px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);">10%</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">กองทุนสำรองประกันรายได้ขั้นต่ำ</td></tr>
    <tr><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);"><b style="color:var(--y);">3</b></td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:600;color:var(--y);"><span data-i18n="income_trader">${tccT('income_trader')}</span></td><td style="padding:4px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);font-weight:600;color:var(--y);">40%</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">กำไรสุทธิที่สมาชิกได้รับโดยตรง</td></tr>
    <tr><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">4</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">บริหารระบบ</td><td style="padding:4px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);">40%</td><td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.06);">ค่าบริหารและพัฒนาระบบ</td></tr>
    <tr style="background:rgba(240,185,11,.08);"><td colspan="2" style="padding:5px 8px;font-weight:700;"><span data-i18n="total_all">${tccT('total_all')}</span></td><td style="padding:5px 8px;text-align:center;font-weight:700;">100%</td><td style="padding:5px 8px;">จากกำไรสุทธิ (Net Profit)</td></tr>
  </tbody>
</table>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 6 — Liquidity Claim</h4>
<p>กรณีพอร์ตเสียหาย สมาชิกมีสิทธิยื่นคำขอเคลมได้เมื่อ: ไม่เคยกระทำผิดเงื่อนไข / ไม่มีหนี้ค้างชำระ / ยื่นเอกสารครบถ้วน</p>
<p>ระยะเวลา: ประเภท 1 ≤7 วัน | ประเภท 2 ≤15 วัน | ประเภท 3 ≤30 วัน | ประเภท 4 ≤45 วัน</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 7 — การรับประกันรายได้ขั้นต่ำ</h4>
<p>ใน 3 เดือนแรก: ประกันกำไรขั้นต่ำ <b>10% ต่อเดือน</b> กรณีกำไรต่ำกว่า 10% ผู้ดำเนินการสำรองจ่ายส่วนต่างภายใน 7 วันทำการ</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 8 — ความปลอดภัยของเงินทุน</h4>
<p>สินทรัพย์ในพอร์ตเป็นกรรมสิทธิ์ของสมาชิก <b>100%</b> ตลอดเวลา ผู้ดำเนินการไม่มีสิทธิ์เข้าถึงหรือโอนสินทรัพย์ใดๆ</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 9 — การรักษาความลับ (PDPA)</h4>
<p>คู่สัญญาตกลงรักษาข้อมูลลับไว้เป็นความลับ ไม่เปิดเผยต่อบุคคลภายนอก ภาระผูกพันนี้มีผลต่อไปอีก <b>2 ปี</b> หลังสัญญาสิ้นสุด</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 10 — การบอกเลิกสัญญา</h4>
<p>แจ้งล่วงหน้า 30 วัน หรือบอกเลิกทันทีหากฝ่ายใดฝ่ายหนึ่งผิดสัญญาในสาระสำคัญ สัญญาต่ออายุอัตโนมัติทุก 12 เดือน</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 11 — การระงับข้อพิพาท</h4>
<p>เจรจาระงับโดยสุจริตก่อน หากไม่สำเร็จภายใน 30 วัน ให้นำคดีขึ้นสู่ <b>ศาลแพ่งกรุงเทพใต้</b> ภายใต้กฎหมายแห่งราชอาณาจักรไทย</p>
<h4 style="color:var(--y);margin:10px 0 4px;">ส่วนที่ 12 — บทบัญญัติทั่วไป</h4>
<ul style="padding-left:16px;margin:4px 0;">
  <li>การแก้ไขสัญญาต้องกระทำเป็นลายลักษณ์อักษรและลงนามโดยคู่สัญญาทั้งสองฝ่าย</li>
  <li>หากข้อกำหนดใดตกเป็นโมฆะ ข้อกำหนดส่วนที่เหลือยังคงมีผลบังคับใช้ต่อไป</li>
  <li>สัญญาฉบับนี้จัดทำขึ้น 2 ฉบับ มีข้อความตรงกัน คู่สัญญาแต่ละฝ่ายเก็บไว้ฝ่ายละ 1 ฉบับ</li>
</ul>`;
  }
  return '<p style="color:var(--t2);font-size:.8rem;">—</p>';
}

// ── tcDownloadPDF ─────────────────────────────────────────────
function tcDownloadPDF(isTrader, appData){
  const r=(appData&&typeof appData==='object')?appData:(TC.appRow||{});
  const m=TC.member||{};
  const today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  const name=r.MemberName||memVal(m,'name')||'';
  const phone=r.Phone||m['Phone']||'';
  const bnbId=r.BNB_ID||memVal(m,'id')||'';
  const ref=r.Title||'';
  const extraLines=(r.ExtraNote||'').split('\n');
  const protectAmt=extraLines[0]||'—';
  const appStatus=r.Status||'Pending';
  const isApproved=appStatus==='Approved';
  const approvedDate=isApproved?(r.UpdatedAt||r.SubmittedAt||'').slice(0,10):'';
  const wmText=isApproved?'✓ อนุมัติแล้ว':'รอการอนุมัติ';
  const wmColor=isApproved?'#007700':'#cc0000';

  const wmBlock=Array.from({length:9},(_,i)=>{
    const row=Math.floor(i/3),col=i%3;
    return `<div style="position:absolute;top:${15+row*33}%;left:${col*36-5}%;transform:rotate(-35deg);font-size:52px;font-weight:900;font-family:'Sarabun',sans-serif;opacity:.07;white-space:nowrap;color:${wmColor};">${wmText}</div>`;
  }).join('');

  const css=`*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Sarabun',sans-serif;font-size:14px;color:#1a1a1a;background:#fff;padding:36px 40px;}
.dh{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1F3864;}
.dlogo{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#f0b90b,#c99a00);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.3rem;color:#000;margin:0 auto 8px;}
h1{font-size:1.25rem;font-weight:700;color:#1F3864;margin-bottom:4px;}
.dsub{font-size:.82rem;color:#555;margin-top:2px;}
.dmeta{display:flex;justify-content:space-between;background:#f5f7fb;border:1px solid #dde3ef;border-radius:6px;padding:7px 14px;margin-bottom:18px;font-size:.8rem;color:#333;}
h2{font-size:.95rem;font-weight:700;color:#1F3864;margin:18px 0 7px;padding-bottom:4px;border-bottom:1px solid #dde3ef;}
h3{font-size:.88rem;font-weight:600;color:#333;margin:10px 0 5px;}
p{font-size:.85rem;color:#333;line-height:1.8;margin-bottom:7px;}
ul{padding-left:18px;margin-bottom:7px;}li{font-size:.85rem;color:#333;line-height:1.8;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
td,th{border:1px solid #dde3ef;padding:6px 11px;font-size:.83rem;}
.dl{background:#f5f7fb;font-weight:600;color:#1F3864;width:190px;}
.hdr th{background:#1F3864;color:#fff;font-weight:600;}
.tot{background:#fffbeb;}.pct{text-align:center;font-weight:600;}.gold{color:#b8860b;}
.sig-row{display:flex;gap:50px;margin:26px 0 14px;}
.sig-box{flex:1;text-align:center;}.sig-line{height:1px;background:#aaa;margin-bottom:7px;}
.sig-box p{font-size:.82rem;color:#333;margin:2px 0;}.sub{font-size:.76rem;color:#666;}
.foot{text-align:center;font-size:.73rem;color:#888;margin-top:14px;padding-top:10px;border-top:1px solid #dde3ef;}
.wm-wrap{position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;}
.wm-info{position:fixed;bottom:0;left:0;right:0;background:#f5f7fb;border-top:2px solid #dde3ef;
  padding:6px 20px;display:flex;justify-content:space-between;font-size:.72rem;color:#555;}
@media print{body{padding:18px;}@page{margin:14mm;size:A4;}.wm-info{position:fixed;bottom:0;left:0;right:0;}}`;

  const sigBlock=`
<div class="sig-row">
  <div class="sig-box">
    <div class="sig-line"></div>
    <p><b>${name}</b></p>
    <p class="sub">ผู้สมัคร / สมาชิก</p>
    <p class="sub">วันที่: ${today}</p>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <p><b>คณะกรรมการบริหาร TCC</b></p>
    <p class="sub">Trader Café Club ประเทศไทย</p>
    <p class="sub">${isApproved?`✅ อนุมัติวันที่: ${approvedDate}`:'วันที่: ...........................'}</p>
  </div>
</div>
<div class="foot">
  เอกสารนี้สร้างโดยระบบ Trader Café Club — Easy Trade | อ้างอิง: ${ref} | พิมพ์วันที่: ${today}<br>
  ${isApproved?'<b style="color:#007700;">✅ เอกสารนี้ได้รับการอนุมัติแล้ว มีผลผูกพันทางกฎหมาย</b>':'<b style="color:#cc0000;">⚠️ รอการอนุมัติ — เอกสารนี้ยังไม่มีผลผูกพันทางกฎหมายจนกว่าจะได้รับการอนุมัติ</b>'}
</div>`;

  const body=`<div class="dh"><div class="dlogo">TCC</div>
    <h1>สัญญาบันทึกข้อตกลงการร่วมเทรด</h1>
    <p class="dsub">Trading Partnership Agreement</p>
    <p class="dsub">Trader Café Club — ประเทศไทย</p></div>
    <div class="dmeta"><span>เลขที่: <b>${ref}</b></span><span>วันที่: <b>${today}</b></span><span>สถานะ: <b>${isApproved?'✅ อนุมัติแล้ว':'⏳ รออนุมัติ'}</b></span></div>
    <table>
      <tr><td class="dl">ระยะเวลารับประกัน</td><td>3 เดือนแรก สำหรับสมาชิกใหม่ที่เข้าร่วมโครงการ</td></tr>
      <tr><td class="dl">อ้างอิงกฎหมาย</td><td>ป.พ.พ. มาตรา 369–398 และ พ.ร.บ.สัญญาซื้อขาย พ.ศ.2562</td></tr>
      <tr><td class="dl">แพลตฟอร์มการเทรด</td><td>Binance Exchange — บัญชีของสมาชิกเอง</td></tr>
    </table>
    <h2>ส่วนที่ 1 — คู่สัญญา</h2>
    <h3>1.1 ฝ่ายที่หนึ่ง — ผู้ให้บริการระบบเทรด</h3>
    <table><tr><td class="dl">ชื่อโครงการ</td><td>คณะกรรมการบริหารโครงการ Trader Café Club ประเทศไทย</td></tr></table>
    <h3>1.2 ฝ่ายที่สอง — สมาชิก / ผู้เข้าร่วมเทรด</h3>
    <table>
      <tr><td class="dl"><span data-i18n="fullname">${tccT('fullname')}</span></td><td>${name}</td></tr>
      <tr><td class="dl"><span data-i18n="phone">${tccT('phone')}</span></td><td>${phone}</td></tr>
      <tr><td class="dl">Binance Account ID</td><td>${bnbId}</td></tr>
      <tr><td class="dl">วงเงินคุ้มครองการเทรด</td><td>${protectAmt}</td></tr>
    </table>
    <h2>ส่วนที่ 5 — สัดส่วนรายได้จากกำไรสุทธิ</h2>
    <table><thead class="hdr"><tr><th>#</th><th><span data-i18n="income_type">${tccT('income_type')}</span></th><th>สัดส่วน</th><th>คำอธิบาย</th></tr></thead>
      <tr><td>1</td><td><span data-i18n="team_comm_title">${tccT('team_comm_title')}</span></td><td class="pct">10%</td><td>ค่าตอบแทนทีมงานและเครือข่าย</td></tr>
      <tr><td>2</td><td>ประกันรายได้</td><td class="pct">10%</td><td>กองทุนสำรองประกันรายได้ขั้นต่ำ</td></tr>
      <tr><td>3</td><td class="gold"><b><span data-i18n="income_trader">${tccT('income_trader')}</span></b></td><td class="pct gold"><b>40%</b></td><td>กำไรสุทธิที่สมาชิกได้รับโดยตรง</td></tr>
      <tr><td>4</td><td>บริหารระบบ</td><td class="pct">40%</td><td>ค่าบริหารและพัฒนาระบบ</td></tr>
      <tr class="tot"><td colspan="2"><b><span data-i18n="total_all">${tccT('total_all')}</span></b></td><td class="pct"><b>100%</b></td><td>จากกำไรสุทธิ (Net Profit)</td></tr>
    </table>
    <h2>ส่วนที่ 7 — การรับประกันรายได้ขั้นต่ำ</h2>
    <p>ใน 3 เดือนแรก: ประกันกำไรขั้นต่ำ <b>10% ต่อเดือน</b> กรณีกำไรต่ำกว่า 10% ผู้ดำเนินการสำรองจ่ายส่วนต่างภายใน 7 วันทำการ</p>
    <h2>ส่วนที่ 8 — ความปลอดภัยของเงินทุน</h2>
    <p>สินทรัพย์ในพอร์ตเป็นกรรมสิทธิ์ของสมาชิก <b>100%</b> ตลอดเวลา ผู้ดำเนินการไม่มีสิทธิ์เข้าถึงหรือโอนสินทรัพย์ใดๆ</p>
    <h2>ส่วนที่ 10 — การบอกเลิกสัญญา</h2>
    <p>แจ้งล่วงหน้า 30 วัน หรือบอกเลิกทันทีหากฝ่ายใดฝ่ายหนึ่งผิดสัญญาในสาระสำคัญ สัญญาต่ออายุอัตโนมัติทุก 12 เดือน</p>
    <h2>ส่วนที่ 11 — การระงับข้อพิพาท</h2>
    <p>ข้อพิพาทอยู่ภายใต้ <b>กฎหมายแห่งราชอาณาจักรไทย</b> นำคดีขึ้นสู่ <b>ศาลแพ่งกรุงเทพใต้</b></p>
    ${sigBlock}`;

  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>สัญญาการร่วมเทรด — ${name}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="wm-wrap">${wmBlock}</div>
${body}
<div class="wm-info">
  <span>เอกสารอ้างอิง: ${ref}</span>
  <span>${isApproved?`✅ อนุมัติวันที่: ${approvedDate}`:`⚠️ สถานะ: รอการอนุมัติ — เอกสารนี้ยังไม่มีผลผูกพันทางกฎหมาย`}</span>
  <span>พิมพ์วันที่: ${today}</span>
</div>
</body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  if(!w){alert(tccT('alert_allow_popup'));return;}
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),800);
}


// ── lgLogout — เรียกจากปุ่ม Log Out ในหน้า Profile ──────────────
function lgLogout() {
  // ล้าง cache ของ member
  try {
    const uid = USER_PROFILE && USER_PROFILE.uid;
    if (uid && typeof LS !== 'undefined') {
      LS.del('member_' + uid);
      LS.del('dash_' + uid);
    }
    // [FIX-LOGOUT-STALE] ล้าง session cache เต็มรูปแบบ (tcc_trans_/positions_/trades_/spot_/funding_/dash_
    // ของ uid นี้ + กวาด cache ค้างของ uid อื่น) — เหมือนที่ทำตอน loadOfflineState()
    if (uid && typeof _clearSessionCache === 'function') _clearSessionCache(uid);
  } catch(e) {}
  // ล้าง MEMBERS cache
  try { sessionStorage.removeItem(SS_MEMBERS); MEMBERS = []; } catch(e) {}
  // reset TC state
  try {
    TC.step=1; TC.member=null; TC.traderApp=null;
    TC.appRow=null; TC.appId=null; TC.passwordHash='';
  } catch(e) {}
  // [FIX-LOGOUT-STALE] ล้างข้อมูลสมาชิกคนเดิมที่ค้างอยู่ใน memory (ไม่ใช่ localStorage)
  // บั๊กเดิม: ถ้า login สมาชิกคนใหม่ต่อทันทีบนแท็บเดียวกันโดยไม่ reload หน้า
  // HIST.*, S.positions และ _histFirstLoaded flags จะยังเก็บของสมาชิกคนก่อนอยู่
  // ทำให้ _mergeIntoHIST() เข้าโหมด append ทับ ไม่ใช่ replace → ข้อมูลปนกัน
  try {
    if (typeof HIST !== 'undefined') {
      HIST.orderHistory       = [];
      HIST.positionHistory    = [];
      HIST.tradeHistory       = [];
      HIST.transactionHistory = [];
      HIST.fundingFee         = [];
      HIST.spotOrderHistory   = [];
      HIST.spotTradeHistory   = [];
      HIST._openPosRegistry   = {};
    }
  } catch(e) {}
  try {
    if (typeof S !== 'undefined') S.positions = [];
  } catch(e) {}
  try {
    if (typeof _histFirstLoaded !== 'undefined') {
      Object.keys(_histFirstLoaded).forEach(k => { delete _histFirstLoaded[k]; });
    }
  } catch(e) {}
  // [NEW v4] ล้าง state ของ Commission tab overlay/iframe ด้วย — กันข้อมูล commission ของ user เดิม
  // ค้างอยู่ (ทั้งใน memory ของ index.html และใน iframe ของ member2.html) ถ้า login user ใหม่ต่อทันที
  // บนแท็บเดียวกันโดยไม่ reload หน้า (เคสเดียวกับที่ HIST/S.positions ถูกล้างด้านบน)
  try {
    _commissionLoaded = false;
    _commTabLastUid = '';
    _commTabLastMs = 0;
    _astCommDashUid = '';
    const _frame = document.getElementById('astCommDashFrame');
    if (_frame) _frame.src = 'about:blank';
    const _overlay = document.getElementById('astCommDashOverlay');
    if (_overlay) _overlay.style.display = 'none';
  } catch(e) {}
  // ล้าง session และไปหน้า login
  _lgClearSession();
}

// ══════════════════════════════════════════════════════
//  [v9] Hardware Back Button + Soft Refresh
// ══════════════════════════════════════════════════════

// ── Page history stack (สำหรับ back button) ──
let pageHistory = [];
const _FIRST_PAGES = ['futures', 'assets', 'home', 'login'];

// ── Push state ใหม่ทุกครั้งที่ navTo เปลี่ยนหน้า (เรียกจาก _navToTrackHistory) ──
function _navToTrackHistory(target) {
  if (currentPage && currentPage !== target) {
    pageHistory.push(currentPage);
    if (pageHistory.length > 30) pageHistory.shift();
  }
  try { history.pushState({ tccPage: target }, '', '#' + target); } catch(e) {}
}

// ── Hardware/Browser Back ──
window.addEventListener('popstate', function(e) {
  handleBackButton();
});

// === [FIX v9.1] Hardware Back Button — debounce ป้องกัน double trigger ===
let _lastBackTime = 0;
function handleBackButton() {
  const now = Date.now();
  if (now - _lastBackTime < 500) return; // debounce 500ms
  _lastBackTime = now;

  // ปิด sheet/modal ที่เปิดอยู่ก่อน (ถ้ามี) แทนการเปลี่ยนหน้า
  const openSheet = document.querySelector('.ast-bottom-sheet.open, .ddl-bottom-sheet.open');
  if (openSheet) {
    openSheet.classList.remove('open');
    document.querySelectorAll('.ast-sheet-overlay.visible, .ddl-sheet-overlay.open').forEach(o => {
      o.classList.remove('visible'); o.classList.remove('open');
    });
    try { history.pushState({ tccPage: currentPage }, '', '#' + currentPage); } catch(e) {}
    return;
  }

  if (_FIRST_PAGES.includes(currentPage) || !pageHistory.length) {
    showExitConfirm();
    try { history.pushState({ tccPage: currentPage }, '', '#' + currentPage); } catch(e) {}
    return;
  }

  const prev = pageHistory.pop();
  // [FIX back] ถ้า prev เป็น format 'assets__<tab>' → navTo assets แล้ว restore sub-tab
  if (prev && prev.startsWith('assets__')) {
    const subTab = prev.replace('assets__', '');
    navTo('assets');
    // restore sub-tab หลัง navTo render เสร็จ (rAF ให้ DOM ready ก่อน)
    requestAnimationFrame(() => {
      if (typeof astSwitchTabByName === 'function') astSwitchTabByName(subTab);
    });
  } else {
    navTo(prev);
  }
}

// === [FIX v9.2] Exit Confirm — กลับหน้าเทรด + เก็บ session ไว้ ===
function showExitConfirm() {
  document.getElementById('exit-overlay')?.classList.add('visible');
  document.getElementById('exit-sheet')?.classList.add('open');
}
function cancelExitApp() {
  document.getElementById('exit-overlay')?.classList.remove('visible');
  document.getElementById('exit-sheet')?.classList.remove('open');
}
function confirmExitApp() {
  cancelExitApp(); // ปิด overlay ก่อน
  // กลับไปหน้าเทรด (session ยังคงอยู่ — ไม่ล้าง localStorage)
  navTo('futures');
}

// ── Soft Refresh: รีโหลดข้อมูลของหน้าปัจจุบันโดยไม่ reload ทั้งหน้า ──
let _softRefreshing = false;
let _lastSoftRefresh = 0;
const SOFT_REFRESH_DEBOUNCE_MS = 2000; // กันกดรัวๆ

// ── [v12 FIX 1] clearAllStaleCache — ล้าง cache ที่หมดอายุ/ค้างทั้งหมดใน localStorage ──
// เรียกก่อน softRefreshCurrentPage() เพื่อบังคับ fetch ข้อมูลใหม่จาก GAS ทุกครั้ง
// ไม่แตะ: tcc_login_session, tcc_remember_me, tcc_uid, tcc_lastCoin, hl_stars, tcc_prod_clean_v1, tcc_ref
function clearAllStaleCache() {
  const KEEP_KEYS = new Set([
    'tcc_login_session', 'tcc_remember_me', 'tcc_uid',
    'tcc_lastCoin', 'hl_stars', 'tcc_prod_clean_v1', 'tcc_ref',
  ]);
  try {
    const now = Date.now();
    Object.keys(localStorage).forEach(k => {
      if (KEEP_KEYS.has(k)) return;
      if (!k.startsWith('tcc_')) return;
      try {
        const v = JSON.parse(localStorage.getItem(k));
        // ลบ: หมดอายุ, หรือเป็น session data cache (SESSION_CACHE_KEYS)
        const isSessionData = (typeof SESSION_CACHE_KEYS !== 'undefined') &&
          SESSION_CACHE_KEYS.some(prefix => k.startsWith('tcc_' + prefix));
        const isExpired = v && v._exp && v._exp < now;
        if (isSessionData || isExpired) localStorage.removeItem(k);
      } catch { localStorage.removeItem(k); }
    });
    // [FIX-RECOVERY] ลอง flush คำสั่งค้างก่อนลบ queue (best-effort)
    try { QUEUE.flush(); } catch(e) {}
    // ล้าง write/dead queue ค้าง
    try { localStorage.removeItem('tcc__write_queue'); } catch(e) {}
    try { localStorage.removeItem('tcc__dead_queue'); } catch(e) {}
    // reset _contractDDMap เพื่อบังคับ fetch drawdown_pct ใหม่จาก getContractStatus
    window._contractDDMap = {};
    // reset first-load flags ใน HIST
    if (typeof _histFirstLoaded !== 'undefined') {
      Object.keys(_histFirstLoaded).forEach(k => { delete _histFirstLoaded[k]; });
    }
    console.log('[clearAllStaleCache] done');
  } catch(e) {
    console.warn('[clearAllStaleCache] error:', e);
  }
}

async function softRefreshCurrentPage() {
  const now = Date.now();
  if (_softRefreshing) return;
  if (now - _lastSoftRefresh < SOFT_REFRESH_DEBOUNCE_MS) {
    showToast(tccT('toast_refreshing'));
    return;
  }
  _lastSoftRefresh = now;
  _softRefreshing = true;
  const fab = document.getElementById('fabRefresh');
  if (fab) fab.classList.add('spinning');

  try {
    // [v12 FIX 1] ล้าง stale cache ก่อนทุกครั้งที่ Refresh เพื่อบังคับ fetch ใหม่จาก GAS
    clearAllStaleCache();

    // [v9] ทุกหน้า: โหลด offline state (positions + earnContracts + openOrders) จาก GAS
    // [v5 FIX] ลบ syncEarnContractsToGAS(false) ออก — ไม่มีประโยชน์และเสี่ยง
    // เหตุผล: loadOfflineState() เพิ่งดึงข้อมูลสดจาก GAS มาแล้ว
    // การ sync กลับทันทีหลังจากนั้น = ส่ง local state (ที่เพิ่ง copy มาจาก GAS) กลับ GAS ซ้ำโดยไม่จำเป็น
    // syncEarnContractsToGAS ถูกเรียกใน syncOfflineEngine() ตอน startup เท่านั้น (ก่อน loadOfflineState)
    if (typeof loadOfflineState === 'function') await loadOfflineState();

    // [v17 FIX] เดิม loadDashboard() ถูกเรียกแค่ตอน currentPage ตกไปที่ default: เท่านั้น
    // ทำให้ Position History / Order History / Funding Fee History ไม่ถูก merge เข้า HIST เลย
    // เมื่อกดรีเฟรชตอนอยู่หน้า 'futures' (หน้าเทรดหลักที่สมาชิกอยู่บ่อยที่สุด)
    // ย้ายมาเรียกร่วมกันทุกหน้าตรงนี้แทน — loadDashboard() ปลอดภัยเพราะแก้แค่ HIST/balance/profile ไม่แตะ S.positions
    if (typeof loadDashboard === 'function') await loadDashboard();

    switch (currentPage) {
      case 'futures':
        if (typeof fetchAllMids === 'function') await fetchAllMids();
        // [v17 FIX] ดึง TP/SL + DD/Liq สดจาก GAS ทุกครั้งที่กดรีเฟรชหน้าเทรด
        // เดิมฟังก์ชันนี้ถูกเรียกแค่ตอนเปิด My Trades overlay เท่านั้น → กดปุ่มรีเฟรชไม่ดึง TP/SL เลย
        if (typeof loadOpenPositionsWithDD === 'function') await loadOpenPositionsWithDD();
        if (typeof renderPositions === 'function') renderPositions();
        if (typeof renderEarnContracts === 'function') renderEarnContracts();
        if (typeof updatePositionsPNL === 'function') updatePositionsPNL();
        break;
      case 'trade':
        if (typeof loadSpotData === 'function') await loadSpotData();
        if (typeof fetchSpOB === 'function') await fetchSpOB();
        break;
      case 'markets':
        if (typeof loadMarketData === 'function') await loadMarketData();
        break;
      case 'assets':
        if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
        if (typeof _astRefreshBalanceIfStale === 'function') await _astRefreshBalanceIfStale(true);
        if (typeof astUpdateTime === 'function') astUpdateTime();
        if (typeof renderEarnContracts === 'function') renderEarnContracts();
        break;
      case 'home':
        if (typeof _homeInit === 'function') _homeInit();
        break;
      case 'profile':
      case 'account-info':
        if (typeof _profileRender === 'function') _profileRender();
        if (typeof updateOverviewBalances === 'function') updateOverviewBalances();
        break;
      default:
        // [v17 FIX] loadDashboard() ย้ายไปเรียกร่วมกันด้านบนแล้ว ไม่ต้องเรียกซ้ำที่นี่
        break;
    }
    showToast(tccT('toast_refreshed'));
  } catch (e) {
    console.warn('[softRefresh]', e);
    showToast(tccT('toast_refresh_fail'));
  } finally {
    _softRefreshing = false;
    if (fab) fab.classList.remove('spinning');
  }
}


