/* ═══════════════════════════════════════════════════════════
   TCC WALLET TAB — wallet_tab.js
   Extracted from index_TCC_OTH_V8_4.html
   Sections: @noble/ed25519 bundle, Wallet HTML, hmWlt JS,
             Wallet IIFE, BTC IIFE, hmWlt Modal HTML
   Load with: <script src="wallet_tab.js"></script>
   (must load AFTER ethers.js, html5-qrcode, qrcodejs CDNs)
═══════════════════════════════════════════════════════════ */

/* ─── SECTION 1: @noble/ed25519 2.2.3 + sha512 bundle ─── */
<script>/* @noble/ed25519 2.2.3 + @noble/hashes sha512 — bundled for browser (replaces TweetNaCl 1.0.3)
   window.nobleEd25519 exposes: getPublicKey(seed32), sign(msg, seed32), verify(sig, msg, pub), etc.
   sha512Sync is pre-configured → all methods are synchronous */
var _nobleEd25519Tmp=(()=>{var _t=Object.defineProperty;var se=(t,e,n)=>e in t?_t(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n;var re=(t,e)=>{for(var n in e)_t(t,n,{get:e[n],enumerable:!0})};var b=(t,e,n)=>se(t,typeof e!="symbol"?e+"":e,n);var et={};re(et,{CURVE:()=>Z,ExtendedPoint:()=>E,etc:()=>M,getPublicKey:()=>xe,getPublicKeyAsync:()=>de,sign:()=>ue,signAsync:()=>he,utils:()=>pe,verify:()=>be,verifyAsync:()=>le});var m=2n**255n-19n,$=2n**252n+27742317777372353535851937790883648493n,ft=0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51an,at=0x6666666666666666666666666666666666666666666666666666666666666658n,ce=37095705934669439343138083508754565189542113879843219016388785533085940283555n,Z={a:-1n,d:ce,p:m,n:$,h:8,Gx:ft,Gy:at},A=(t="")=>{throw new Error(t)},Ot=t=>typeof t=="string",ie=t=>t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array",N=(t,e)=>!ie(t)||typeof e=="number"&&e>0&&t.length!==e?A("Uint8Array of valid length expected"):t,K=t=>new Uint8Array(t),O=(t,e)=>N(Ot(t)?xt(t):K(N(t)),e),f=(t,e=m)=>{let n=t%e;return n>=0n?n:e+n},Ut=t=>t instanceof E?t:A("Point expected"),E=class t{constructor(e,n,o,s){this.ex=e,this.ey=n,this.ez=o,this.et=s}static fromAffine(e){return new t(e.x,e.y,1n,f(e.x*e.y))}static fromHex(e,n=!1){let{d:o}=Z;e=O(e,32);let s=e.slice(),r=e[31];s[31]=r&-129;let c=ht(s);n&&!(0n<=c&&c<2n**256n)&&A("bad y coord 1"),!n&&!(0n<=c&&c<m)&&A("bad y coord 2");let i=f(c*c),a=f(i-1n),x=f(o*i+1n),{isValid:h,value:d}=ae(a,x);h||A("bad y coordinate 3");let u=(d&1n)===1n,l=(r&128)!==0;return!n&&d===0n&&l&&A("bad y coord 3"),l!==u&&(d=f(-d)),new t(d,c,1n,f(d*c))}get x(){return this.toAffine().x}get y(){return this.toAffine().y}equals(e){let{ex:n,ey:o,ez:s}=this,{ex:r,ey:c,ez:i}=Ut(e),a=f(n*i),x=f(r*s),h=f(o*i),d=f(c*s);return a===x&&h===d}is0(){return this.equals(z)}negate(){return new t(f(-this.ex),this.ey,this.ez,f(-this.et))}double(){let{ex:e,ey:n,ez:o}=this,{a:s}=Z,r=f(e*e),c=f(n*n),i=f(2n*f(o*o)),a=f(s*r),x=e+n,h=f(f(x*x)-r-c),d=a+c,u=d-i,l=a-c,y=f(h*u),w=f(d*l),g=f(h*l),B=f(u*d);return new t(y,w,B,g)}add(e){let{ex:n,ey:o,ez:s,et:r}=this,{ex:c,ey:i,ez:a,et:x}=Ut(e),{a:h,d}=Z,u=f(n*c),l=f(o*i),y=f(r*d*x),w=f(s*a),g=f((n+o)*(c+i)-u-l),B=f(w-y),R=f(w+y),F=f(l-h*u),p=f(g*B),H=f(R*F),L=f(g*F),X=f(B*R);return new t(p,H,X,L)}mul(e,n=!0){if(e===0n)return n===!0?A("cannot multiply by 0"):z;if(typeof e=="bigint"&&0n<e&&e<$||A("invalid scalar, must be < L"),!n&&this.is0()||e===1n)return this;if(this.equals(G))return we(e).p;let o=z,s=G;for(let r=this;e>0n;r=r.double(),e>>=1n)e&1n?o=o.add(r):n&&(s=s.add(r));return o}multiply(e){return this.mul(e)}clearCofactor(){return this.mul(BigInt(Z.h),!1)}isSmallOrder(){return this.clearCofactor().is0()}isTorsionFree(){let e=this.mul($/2n,!1).double();return $%2n&&(e=e.add(this)),e.is0()}toAffine(){let{ex:e,ey:n,ez:o}=this;if(this.equals(z))return{x:0n,y:1n};let s=jt(o,m);return f(o*s)!==1n&&A("invalid inverse"),{x:f(e*s),y:f(n*s)}}toRawBytes(){let{x:e,y:n}=this.toAffine(),o=Dt(n);return o[31]|=e&1n?128:0,o}toHex(){return dt(this.toRawBytes())}};E.BASE=new E(ft,at,1n,f(ft*at));E.ZERO=new E(0n,1n,1n,0n);var{BASE:G,ZERO:z}=E,Gt=(t,e)=>t.toString(16).padStart(e,"0"),dt=t=>Array.from(N(t)).map(e=>Gt(e,2)).join(""),C={_0:48,_9:57,A:65,F:70,a:97,f:102},Tt=t=>{if(t>=C._0&&t<=C._9)return t-C._0;if(t>=C.A&&t<=C.F)return t-(C.A-10);if(t>=C.a&&t<=C.f)return t-(C.a-10)},xt=t=>{let e="hex invalid";if(!Ot(t))return A(e);let n=t.length,o=n/2;if(n%2)return A(e);let s=K(o);for(let r=0,c=0;r<o;r++,c+=2){let i=Tt(t.charCodeAt(c)),a=Tt(t.charCodeAt(c+1));if(i===void 0||a===void 0)return A(e);s[r]=i*16+a}return s},Dt=t=>xt(Gt(t,64)).reverse(),ht=t=>BigInt("0x"+dt(K(N(t)).reverse())),Y=(...t)=>{let e=K(t.reduce((o,s)=>o+N(s).length,0)),n=0;return t.forEach(o=>{e.set(o,n),n+=o.length}),e},jt=(t,e)=>{(t===0n||e<=0n)&&A("no inverse n="+t+" mod="+e);let n=f(t,e),o=e,s=0n,r=1n,c=1n,i=0n;for(;n!==0n;){let a=o/n,x=o%n,h=s-c*a,d=r-i*a;o=n,n=x,s=c,r=i,c=h,i=d}return o===1n?f(s,e):A("no inverse")},S=(t,e)=>{let n=t;for(;e-- >0n;)n*=n,n%=m;return n},fe=t=>{let n=t*t%m*t%m,o=S(n,2n)*n%m,s=S(o,1n)*t%m,r=S(s,5n)*s%m,c=S(r,10n)*r%m,i=S(c,20n)*c%m,a=S(i,40n)*i%m,x=S(a,80n)*a%m,h=S(x,80n)*a%m,d=S(h,10n)*r%m;return{pow_p_5_8:S(d,2n)*t%m,b2:n}},Ct=19681161376707505956807079304988542015446066515923890162744021073123829784752n,ae=(t,e)=>{let n=f(e*e*e),o=f(n*n*e),s=fe(t*o).pow_p_5_8,r=f(t*n*s),c=f(e*r*r),i=r,a=f(r*Ct),x=c===t,h=c===f(-t),d=c===f(-t*Ct);return x&&(r=i),(h||d)&&(r=a),(f(r)&1n)===1n&&(r=f(-r)),{isValid:x||h,value:r}},Q=t=>f(ht(t),$),I,ut=(...t)=>M.sha512Async(...t),lt=(...t)=>typeof I=="function"?I(...t):A("etc.sha512Sync not set"),kt=t=>{let e=t.slice(0,32);e[0]&=248,e[31]&=127,e[31]|=64;let n=t.slice(32,64),o=Q(e),s=G.mul(o),r=s.toRawBytes();return{head:e,prefix:n,scalar:o,point:s,pointBytes:r}},bt=t=>ut(O(t,32)).then(kt),pt=t=>kt(lt(O(t,32))),de=t=>bt(t).then(e=>e.pointBytes),xe=t=>pt(t).pointBytes;function tt(t,e){return t?ut(e.hashable).then(e.finish):e.finish(lt(e.hashable))}var Mt=(t,e,n)=>{let{pointBytes:o,scalar:s}=t,r=Q(e),c=G.mul(r).toRawBytes();return{hashable:Y(c,o,n),finish:x=>{let h=f(r+Q(x)*s,$);return N(Y(c,Dt(h)),64)}}},he=async(t,e)=>{let n=O(t),o=await bt(e),s=await ut(o.prefix,n);return tt(!0,Mt(o,s,n))},ue=(t,e)=>{let n=O(t),o=pt(e),s=lt(o.prefix,n);return tt(!1,Mt(o,s,n))},yt={zip215:!0},vt=(t,e,n,o=yt)=>{t=O(t,64),e=O(e),n=O(n,32);let{zip215:s}=o,r,c,i,a,x=new Uint8Array;try{r=E.fromHex(n,s),c=E.fromHex(t.slice(0,32),s),i=ht(t.slice(32,64)),a=G.mul(i,!1),x=Y(c.toRawBytes(),r.toRawBytes(),e)}catch{}return{hashable:x,finish:d=>{if(a==null||!s&&r.isSmallOrder())return!1;let u=Q(d);return c.add(r.mul(u,!1)).add(a.negate()).clearCofactor().is0()}}},le=async(t,e,n,o=yt)=>tt(!0,vt(t,e,n,o)),be=(t,e,n,o=yt)=>tt(!1,vt(t,e,n,o)),Rt=()=>typeof globalThis=="object"&&"crypto"in globalThis?globalThis.crypto:void 0,M={bytesToHex:dt,hexToBytes:xt,concatBytes:Y,mod:f,invert:jt,randomBytes:(t=32)=>{let e=Rt();return(!e||!e.getRandomValues)&&A("crypto.getRandomValues must be defined"),e.getRandomValues(K(t))},sha512Async:async(...t)=>{let e=Rt(),n=e&&e.subtle;n||A("etc.sha512Async or crypto.subtle must be defined");let o=Y(...t);return K(await n.digest("SHA-512",o.buffer))},sha512Sync:void 0};Object.defineProperties(M,{sha512Sync:{configurable:!1,get(){return I},set(t){I||(I=t)}}});var pe={getExtendedPublicKeyAsync:bt,getExtendedPublicKey:pt,randomPrivateKey:()=>M.randomBytes(32),precompute:(t=8,e=G)=>(e.multiply(3n),e)},k=8,ye=()=>{let t=[],e=256/k+1,n=G,o=n;for(let s=0;s<e;s++){o=n,t.push(o);for(let r=1;r<2**(k-1);r++)o=o.add(n),t.push(o);n=o.double()}return t},Ft,we=t=>{let e=Ft||(Ft=ye()),n=(h,d)=>{let u=d.negate();return h?u:d},o=z,s=G,r=1+256/k,c=2**(k-1),i=BigInt(2**k-1),a=2**k,x=BigInt(k);for(let h=0;h<r;h++){let d=h*c,u=Number(t&i);t>>=x,u>c&&(u-=a,t+=1n);let l=d,y=d+Math.abs(u)-1,w=h%2!==0,g=u<0;u===0?s=s.add(n(w,e[l])):o=o.add(n(g,e[y]))}return{p:o,f:s}};var nt=BigInt(4294967295),Pt=BigInt(32);function ge(t,e=!1){return e?{h:Number(t&nt),l:Number(t>>Pt&nt)}:{h:Number(t>>Pt&nt)|0,l:Number(t&nt)|0}}function $t(t,e=!1){let n=t.length,o=new Uint32Array(n),s=new Uint32Array(n);for(let r=0;r<n;r++){let{h:c,l:i}=ge(t[r],e);[o[r],s[r]]=[c,i]}return[o,s]}var me=t=>t/2**32|0,Ae=t=>t>>>0;function Nt(t,e,n,o){let s=me(n),r=Ae(n);t.setUint32(e,o?r:s,o),t.setUint32(e+4,o?s:r,o)}var wt=(t,e,n)=>t>>>n,gt=(t,e,n)=>t<<32-n|e>>>n,v=(t,e,n)=>t>>>n|e<<32-n,P=(t,e,n)=>t<<32-n|e>>>n,W=(t,e,n)=>t<<64-n|e>>>n-32,q=(t,e,n)=>t>>>n-32|e<<64-n;function _(t,e,n,o){let s=(e>>>0)+(o>>>0);return{h:t+n+(s/2**32|0)|0,l:s|0}}var Kt=(t,e,n)=>(t>>>0)+(e>>>0)+(n>>>0),Xt=(t,e,n,o)=>e+n+o+(t/2**32|0)|0,Zt=(t,e,n,o)=>(t>>>0)+(e>>>0)+(n>>>0)+(o>>>0),zt=(t,e,n,o,s)=>e+n+o+s+(t/2**32|0)|0,It=(t,e,n,o,s)=>(t>>>0)+(e>>>0)+(n>>>0)+(o>>>0)+(s>>>0),Yt=(t,e,n,o,s,r)=>e+n+o+s+r+(t/2**32|0)|0;function Wt(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"&&"BYTES_PER_ELEMENT"in t&&t.BYTES_PER_ELEMENT===1}var mt=t=>t?`"${t}" `:"";function Ee(t,e=""){if(typeof t!="number")throw new TypeError(mt(e)+"expected number, got "+typeof t);if(!Number.isSafeInteger(t)||t<0)throw new RangeError(mt(e)+"expected integer >= 0, got "+t);return t}function At(t,e,n=""){if(Wt(t)&&(e===void 0||t.length===e))return t;e!==void 0&&Ee(e,"length");let o=Wt(t),s=e!==void 0?` of length ${e}`:"",r=o?`length=${t.length}`:`type=${typeof t}`,c=mt(n)+"expected Uint8Array"+s+", got "+r;throw o?new RangeError(c):new TypeError(c)}var He=(t,e)=>{if(t===null||typeof t!="object"||Array.isArray(t))throw new TypeError((e==="object"?"":`"${e}" `)+"expected object, got type="+typeof t)},qt=(t,e)=>{He(t,e);let n=Object.getPrototypeOf(t);if(n!==Object.prototype&&n!==null)throw new TypeError(`"${e}" expected plain object`);if(Object.hasOwn(t,"__proto__"))throw new TypeError(`"${e}.__proto__" is not allowed`)};function Bt(t,e=!0){if(t.destroyed)throw new Error("hash was destroyed");if(e&&t.finished)throw new Error("digest() was already called")}function Vt(t,e){At(t,void 0,"output");let n=e.outputLen;if(!(t.length>=n))throw new RangeError('"output" expected length >= '+n)}function Et(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}function ot(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}function Le(t,e,n="opts"){return qt(t,"defaults"),e!==void 0&&qt(e,n),Object.assign(Object.create(null),t,e)}function Jt(t,e={}){if(typeof t!="function")throw new TypeError('"hashCons" expected function, got type='+typeof t);e=Le({},e,"info");let n=(s,r)=>t(r).update(s).digest(),o=t(void 0);return n.outputLen=o.outputLen,n.blockLen=o.blockLen,n.canXOF=o.canXOF,n.create=s=>t(s),Object.assign(n,e),Object.freeze(n)}var Qt=t=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,t])});var st=class{constructor(e,n,o,s){b(this,"blockLen");b(this,"outputLen");b(this,"canXOF",!1);b(this,"padOffset");b(this,"isLE");b(this,"buffer");b(this,"view");b(this,"finished",!1);b(this,"length",0);b(this,"pos",0);b(this,"destroyed",!1);this.blockLen=e,this.outputLen=n,this.padOffset=o,this.isLE=s,this.buffer=new Uint8Array(e),this.view=ot(this.buffer)}update(e){Bt(this),At(e);let{view:n,buffer:o,blockLen:s}=this,r=e.length,c=!1;for(let i=0;i<r;){let a=Math.min(s-this.pos,r-i);if(a===s){let x=ot(e);for(;s<=r-i;i+=s)this.process(x,i);c=!0;continue}o.set(i===0&&a===r?e:e.subarray(i,i+a),this.pos),this.pos+=a,i+=a,this.pos===s&&(this.process(n,0),this.pos=0,c=!0)}return this.length+=e.length,c&&this.roundClean(),this}digestInto(e){Bt(this),Vt(e,this),this.finished=!0;let{buffer:n,view:o,blockLen:s,isLE:r}=this,{pos:c}=this;n[c++]=128,n.fill(0,c),this.padOffset>s-c&&(this.process(o,0),n.fill(0)),Nt(o,s-8,this.length*8,r),this.process(o,0),this.roundClean();let i=e===n?o:ot(e),a=this.outputLen,x=a/4,h=this.get();if(a%4||x>h.length)throw new Error("invalid outputLen");for(let d=0;d<x;d++)i.setUint32(4*d,h[d],r)}digest(){let{buffer:e,outputLen:n}=this;this.digestInto(e);let o=e.slice(0,n);return this.destroy(),o}_cloneIntoMeta(e){let{buffer:n,length:o,finished:s,destroyed:r,pos:c}=this;return e.destroyed=r,e.finished=s,e.length=o,e.pos=c,c&&e.buffer.set(n),e}clone(){return this._cloneInto()}};var te=Uint32Array.from([1779033703,4089235720,3144134277,2227873595,1013904242,4271175723,2773480762,1595750129,1359893119,2917565137,2600822924,725511199,528734635,4215389547,1541459225,327033209]);var ee=$t(["0x428a2f98d728ae22","0x7137449123ef65cd","0xb5c0fbcfec4d3b2f","0xe9b5dba58189dbbc","0x3956c25bf348b538","0x59f111f1b605d019","0x923f82a4af194f9b","0xab1c5ed5da6d8118","0xd807aa98a3030242","0x12835b0145706fbe","0x243185be4ee4b28c","0x550c7dc3d5ffb4e2","0x72be5d74f27b896f","0x80deb1fe3b1696b1","0x9bdc06a725c71235","0xc19bf174cf692694","0xe49b69c19ef14ad2","0xefbe4786384f25e3","0x0fc19dc68b8cd5b5","0x240ca1cc77ac9c65","0x2de92c6f592b0275","0x4a7484aa6ea6e483","0x5cb0a9dcbd41fbd4","0x76f988da831153b5","0x983e5152ee66dfab","0xa831c66d2db43210","0xb00327c898fb213f","0xbf597fc7beef0ee4","0xc6e00bf33da88fc2","0xd5a79147930aa725","0x06ca6351e003826f","0x142929670a0e6e70","0x27b70a8546d22ffc","0x2e1b21385c26c926","0x4d2c6dfc5ac42aed","0x53380d139d95b3df","0x650a73548baf63de","0x766a0abb3c77b2a8","0x81c2c92e47edaee6","0x92722c851482353b","0xa2bfe8a14cf10364","0xa81a664bbc423001","0xc24b8b70d0f89791","0xc76c51a30654be30","0xd192e819d6ef5218","0xd69906245565a910","0xf40e35855771202a","0x106aa07032bbd1b8","0x19a4c116b8d2d0c8","0x1e376c085141ab53","0x2748774cdf8eeb99","0x34b0bcb5e19b48a8","0x391c0cb3c5c95a63","0x4ed8aa4ae3418acb","0x5b9cca4f7763e373","0x682e6ff3d6b2b8a3","0x748f82ee5defb2fc","0x78a5636f43172f60","0x84c87814a1f0ab72","0x8cc702081a6439ec","0x90befffa23631e28","0xa4506cebde82bde9","0xbef9a3f7b2c67915","0xc67178f2e372532b","0xca273eceea26619c","0xd186b8c721c0c207","0xeada7dd6cde0eb1e","0xf57d4f7fee6ed178","0x06f067aa72176fba","0x0a637dc5a2c898a6","0x113f9804bef90dae","0x1b710b35131c471b","0x28db77f523047d84","0x32caab7b40c72493","0x3c9ebe0a15c9bebc","0x431d67c49c100d4c","0x4cc5d4becb3e42b6","0x597f299cfc657e2a","0x5fcb6fab3ad6faec","0x6c44198c4a475817"].map(t=>BigInt(t))),Se=ee[0],_e=ee[1],D=new Uint32Array(80),j=new Uint32Array(80),Ht=class extends st{constructor(n,o){super(128,n,16,!1);b(this,"Ah",0);b(this,"Al",0);b(this,"Bh",0);b(this,"Bl",0);b(this,"Ch",0);b(this,"Cl",0);b(this,"Dh",0);b(this,"Dl",0);b(this,"Eh",0);b(this,"El",0);b(this,"Fh",0);b(this,"Fl",0);b(this,"Gh",0);b(this,"Gl",0);b(this,"Hh",0);b(this,"Hl",0);this.Ah=o[0]|0,this.Al=o[1]|0,this.Bh=o[2]|0,this.Bl=o[3]|0,this.Ch=o[4]|0,this.Cl=o[5]|0,this.Dh=o[6]|0,this.Dl=o[7]|0,this.Eh=o[8]|0,this.El=o[9]|0,this.Fh=o[10]|0,this.Fl=o[11]|0,this.Gh=o[12]|0,this.Gl=o[13]|0,this.Hh=o[14]|0,this.Hl=o[15]|0}get(){let{Ah:n,Al:o,Bh:s,Bl:r,Ch:c,Cl:i,Dh:a,Dl:x,Eh:h,El:d,Fh:u,Fl:l,Gh:y,Gl:w,Hh:g,Hl:B}=this;return[n,o,s,r,c,i,a,x,h,d,u,l,y,w,g,B]}set(n,o,s,r,c,i,a,x,h,d,u,l,y,w,g,B){this.Ah=n|0,this.Al=o|0,this.Bh=s|0,this.Bl=r|0,this.Ch=c|0,this.Cl=i|0,this.Dh=a|0,this.Dl=x|0,this.Eh=h|0,this.El=d|0,this.Fh=u|0,this.Fl=l|0,this.Gh=y|0,this.Gl=w|0,this.Hh=g|0,this.Hl=B|0}_cloneInto(n){return(n||(n=new this.constructor)).set(...this.get()),this._cloneIntoMeta(n)}process(n,o){for(let p=0;p<16;p++,o+=4)D[p]=n.getUint32(o),j[p]=n.getUint32(o+=4);for(let p=16;p<80;p++){let H=D[p-15]|0,L=j[p-15]|0,X=v(H,L,1)^v(H,L,8)^wt(H,L,7),rt=P(H,L,1)^P(H,L,8)^gt(H,L,7),U=D[p-2]|0,T=j[p-2]|0,V=v(U,T,19)^W(U,T,61)^wt(U,T,6),ct=P(U,T,19)^q(U,T,61)^gt(U,T,6),J=Zt(rt,ct,j[p-7],j[p-16]),it=zt(J,X,V,D[p-7],D[p-16]);D[p]=it|0,j[p]=J|0}let{Ah:s,Al:r,Bh:c,Bl:i,Ch:a,Cl:x,Dh:h,Dl:d,Eh:u,El:l,Fh:y,Fl:w,Gh:g,Gl:B,Hh:R,Hl:F}=this;for(let p=0;p<80;p++){let H=v(u,l,14)^v(u,l,18)^W(u,l,41),L=P(u,l,14)^P(u,l,18)^q(u,l,41),X=u&y^~u&g,rt=l&w^~l&B,U=It(F,L,rt,_e[p],j[p]),T=Yt(U,R,H,X,Se[p],D[p]),V=U|0,ct=v(s,r,28)^W(s,r,34)^W(s,r,39),J=P(s,r,28)^q(s,r,34)^q(s,r,39),it=s&c^s&a^c&a,oe=r&i^r&x^i&x;R=g|0,F=B|0,g=y|0,B=w|0,y=u|0,w=l|0,{h:u,l}=_(h|0,d|0,T|0,V|0),h=a|0,d=x|0,a=c|0,x=i|0,c=s|0,i=r|0;let St=Kt(V,J,oe);s=Xt(St,T,ct,it),r=St|0}({h:s,l:r}=_(this.Ah|0,this.Al|0,s|0,r|0)),{h:c,l:i}=_(this.Bh|0,this.Bl|0,c|0,i|0),{h:a,l:x}=_(this.Ch|0,this.Cl|0,a|0,x|0),{h,l:d}=_(this.Dh|0,this.Dl|0,h|0,d|0),{h:u,l}=_(this.Eh|0,this.El|0,u|0,l|0),{h:y,l:w}=_(this.Fh|0,this.Fl|0,y|0,w|0),{h:g,l:B}=_(this.Gh|0,this.Gl|0,g|0,B|0),{h:R,l:F}=_(this.Hh|0,this.Hl|0,R|0,F|0),this.set(s,r,c,i,a,x,h,d,u,l,y,w,g,B,R,F)}roundClean(){Et(D,j)}destroy(){this.destroyed=!0,Et(this.buffer),this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0)}},Lt=class extends Ht{constructor(){super(64,te)}};var ne=Jt(()=>new Lt,Qt(3));M.sha512Sync=(...t)=>ne(M.concatBytes(...t));typeof window<"u"&&(window.nobleEd25519=et);typeof self<"u"&&(self.nobleEd25519=et);})();
/*! Bundled license information:

@noble/ed25519/index.js:
  (*! noble-ed25519 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)
*/


/* ─── SECTION 2: Wallet HTML (ast-page-wallet-a + screens + CSS) ─── */
(function _injectWalletHTML() {
  var _html = `
  <div class="ast-page" id="ast-page-wallet-a">
  <style>
  /* ─── TCC WALLET STYLES ─── */
  #ast-page-wallet-a{padding-bottom:80px;overflow-y:auto}

  /* Wallet Screen Router */
  .wlt-screen{display:none;flex-direction:column}
  .wlt-screen.active{display:flex}

  /* ── Header ── */
  .wlt-header{padding:16px 16px 0}
  .wlt-total-lbl{font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;margin-bottom:4px}
  .wlt-total-val{font-size:26px;font-weight:700;font-family:var(--mono);color:var(--t1)}
  .wlt-total-unit{font-size:13px;color:var(--t2);font-weight:500;margin-left:4px}
  .wlt-thb{font-size:12px;color:var(--t2);margin:2px 0 12px}

  /* ── Action Grid ── */
  .wlt-action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 16px 16px}
  .wlt-action-btn{display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 4px;cursor:pointer;transition:background .15s;outline:none}
  .wlt-action-btn:active{background:var(--bg4)}
  .wlt-action-ico{width:38px;height:38px;border-radius:50%;background:var(--y-10);display:flex;align-items:center;justify-content:center}
  .wlt-action-ico svg{stroke:var(--y)}
  .wlt-action-lbl{font-size:11px;color:var(--t2);font-weight:500}

  /* ── Token Tabs ── */
  .wlt-tok-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 16px}
  .wlt-ttab{padding:10px 12px;font-size:13px;color:var(--t3);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-weight:500;transition:color .15s}
  .wlt-ttab.active{color:var(--t1);border-bottom-color:var(--y)}

  /* ── Token List ── */
  .wlt-tok-hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px 4px}
  .wlt-tok-hdr-lbl{font-size:11px;color:var(--t3)}
  .wlt-tok-hdr-val{font-size:12px;font-weight:600;font-family:var(--mono);color:var(--t1)}
  .wlt-tok-row{display:flex;align-items:center;padding:13px 16px;cursor:pointer;transition:background .12s}
  .wlt-tok-row:active{background:var(--bg3)}
  .wlt-tok-logo{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0;margin-right:12px}
  .wlt-tok-info{flex:1;min-width:0}
  .wlt-tok-name{font-size:14px;font-weight:600;color:var(--t1)}
  .wlt-tok-sub{font-size:11px;color:var(--t3);margin-top:2px}
  .wlt-tok-right{text-align:right}
  .wlt-tok-amount{font-size:14px;font-weight:600;font-family:var(--mono);color:var(--t1)}
  .wlt-tok-thb{font-size:11px;color:var(--t3);margin-top:2px}
  .wlt-lock-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--r);background:var(--r-10);border-radius:3px;padding:1px 5px;margin-top:3px}
  .wlt-divider{height:1px;background:var(--border);margin:0 16px}
  .wlt-low-val{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer}
  .wlt-low-val span{font-size:13px;color:var(--t3)}

  /* ── Empty State ── */
  .wlt-empty{display:flex;flex-direction:column;align-items:center;padding:40px 24px;gap:10px;color:var(--t3);text-align:center}
  .wlt-empty-ico{font-size:40px;opacity:.35}
  .wlt-empty-title{font-size:14px;font-weight:600;color:var(--t2)}
  .wlt-empty-sub{font-size:12px;line-height:1.6}

  /* ── Wallet List (My Wallets) ── */
  .wlt-wallet-card{margin:12px 16px 0;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:background .15s}
  .wlt-wallet-card:active{background:var(--bg4)}
  .wlt-wallet-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .wlt-wallet-label{font-size:13px;font-weight:600;color:var(--t1)}
  .wlt-wallet-chain{font-size:10px;color:var(--y);background:var(--y-10);border-radius:4px;padding:2px 7px;font-weight:600}
  .wlt-wallet-addr{font-size:11px;color:var(--t3);font-family:var(--mono)}
  .wlt-wallet-bal{font-size:15px;font-weight:700;font-family:var(--mono);color:var(--t1);margin-top:4px}
  .wlt-wallet-actions{display:flex;gap:6px;margin-top:10px}
  .wlt-wallet-act-btn{flex:1;padding:7px 0;background:var(--bg4);border:1px solid var(--border);border-radius:7px;font-size:12px;font-weight:600;color:var(--t2);cursor:pointer;transition:all .15s;text-align:center}
  .wlt-wallet-act-btn:hover{border-color:var(--y);color:var(--y)}
  .wlt-wallet-act-btn.primary{background:var(--y);color:#1a1d22;border-color:var(--y)}

  /* ── Form / Input ── */
  .wlt-form-group{margin-bottom:16px}
  .wlt-form-lbl{font-size:12px;color:var(--t2);margin-bottom:6px;display:block;font-weight:500}
  .wlt-form-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--t1);font-size:14px;outline:none;font-family:var(--sans);transition:border-color .15s}
  .wlt-form-input:focus{border-color:var(--y)}
  .wlt-form-input::placeholder{color:var(--t3)}
  .wlt-form-select{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--t1);font-size:14px;outline:none;cursor:pointer}
  .wlt-chain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
  .wlt-chain-opt{padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-align:center;cursor:pointer;font-size:13px;font-weight:500;color:var(--t2);transition:all .2s}
  .wlt-chain-opt.active{border-color:var(--y);color:var(--y);background:var(--y-10)}

  /* Password Strength */
  .wlt-strength-bar{display:flex;gap:4px;margin-top:6px}
  .wlt-seg{flex:1;height:3px;border-radius:2px;background:var(--bg4);transition:background .3s}
  .wlt-seg.s-red{background:var(--r)}
  .wlt-seg.s-gold{background:var(--y)}
  .wlt-seg.s-green{background:var(--g)}
  .wlt-strength-lbl{font-size:11px;color:var(--t3);margin-top:4px}

  /* Warning / Alert boxes */
  .wlt-warn-box{background:rgba(240,185,11,.07);border:1px solid rgba(240,185,11,.28);border-radius:8px;padding:12px 14px;font-size:12px;color:#c9962e;line-height:1.6;margin-bottom:16px}
  .wlt-warn-box.danger{background:var(--r-10);border-color:var(--r-25);color:var(--r)}
  .wlt-warn-box.success{background:var(--g-10);border-color:rgba(14,203,129,.3);color:var(--g)}
  .wlt-warn-icon{font-size:13px;margin-right:4px}

  /* PK / Mnemonic display */
  .wlt-secret-box{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;position:relative;word-break:break-all;font-family:var(--mono);font-size:12px;color:var(--g);line-height:1.7}
  .wlt-copy-btn{position:absolute;top:10px;right:10px;background:var(--bg4);border:1px solid var(--border);border-radius:5px;padding:4px 9px;font-size:11px;color:var(--t2);cursor:pointer;display:flex;align-items:center;gap:4px;font-family:var(--sans);transition:all .15s}
  .wlt-copy-btn:hover{border-color:var(--y);color:var(--y)}
  .wlt-mnemonic-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:12px 0}
  .wlt-mn-word{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:9px 12px;display:flex;gap:7px;align-items:center}
  .wlt-mn-num{font-size:10px;color:var(--t3);min-width:16px}
  .wlt-mn-txt{font-size:13px;font-weight:500;font-family:var(--mono)}

  /* Checkbox */
  .wlt-check-list{margin:16px 0}
  .wlt-check-item{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);cursor:pointer}
  .wlt-check-item:last-child{border:none}
  .wlt-checkbox{width:20px;height:20px;border-radius:4px;border:2px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px;transition:all .2s}
  .wlt-checkbox.checked{background:var(--g);border-color:var(--g)}
  .wlt-checkbox.checked::after{content:'✓';color:#000;font-size:12px;font-weight:700}
  .wlt-check-lbl{font-size:12px;color:var(--t2);line-height:1.5}

  /* Reveal Timer */
  .wlt-timer-row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:var(--t3)}
  .wlt-timer-bar{flex:1;height:3px;background:var(--bg4);border-radius:2px;overflow:hidden}
  .wlt-timer-fill{height:100%;background:var(--y);border-radius:2px;transition:width 1s linear}

  /* Address card */
  .wlt-addr-card{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;word-break:break-all;font-family:var(--mono);font-size:12px;color:var(--t2);text-align:center;line-height:1.6;margin:12px 0}
  .wlt-qr-wrap{display:flex;align-items:center;justify-content:center;margin:16px auto}
  #wlt-qr-code,#wlt-receive-qr{display:inline-block;line-height:0}

  /* TX History */
  .wlt-tx-row{display:flex;align-items:center;padding:13px 16px;cursor:pointer;transition:background .12s}
  .wlt-tx-row:active{background:var(--bg3)}
  .wlt-tx-ico{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px}
  .wlt-tx-info{flex:1}
  .wlt-tx-name{font-size:13px;font-weight:500;color:var(--t1)}
  .wlt-tx-sub{font-size:11px;color:var(--t3);margin-top:2px}
  .wlt-tx-right{text-align:right}
  .wlt-tx-amount{font-size:13px;font-weight:600;font-family:var(--mono)}
  .wlt-tx-status{font-size:10px;color:var(--t3);margin-top:2px}
  .wlt-section-lbl{font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;padding:12px 16px 4px;font-weight:600}

  /* Primary / Secondary buttons */
  .wlt-btn-primary{width:100%;background:var(--y);color:#1a1d22;border:none;border-radius:20px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s;font-family:var(--sans)}
  .wlt-btn-primary:disabled{background:var(--bg4);color:var(--t3);cursor:not-allowed}
  .wlt-btn-secondary{width:100%;background:var(--bg3);color:var(--t1);border:1px solid var(--border);border-radius:20px;padding:13px;font-size:14px;font-weight:600;cursor:pointer;margin-top:10px;font-family:var(--sans)}
  .wlt-back-btn{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--t2);font-size:14px;cursor:pointer;padding:0;margin-bottom:18px;font-family:var(--sans)}

  /* Lock indicator */
  .wlt-lock-row{background:var(--r-10);border:1px solid var(--r-25);border-radius:8px;padding:10px 12px;margin:0 16px 12px;font-size:12px;color:var(--r);line-height:1.5}
  .wlt-avail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 16px 14px}
  .wlt-avail-cell{background:var(--bg3);border-radius:8px;padding:12px;text-align:center}
  .wlt-avail-lbl{font-size:10px;color:var(--t3);margin-bottom:4px}
  .wlt-avail-val{font-size:15px;font-weight:700;font-family:var(--mono)}

  /* Send confirm row */
  .wlt-sum-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
  .wlt-sum-lbl{color:var(--t3)}
  .wlt-sum-val{color:var(--t1);font-family:var(--mono);font-weight:500}
  .wlt-sum-box{background:var(--bg3);border-radius:8px;padding:12px 14px;margin-bottom:14px}

  /* Success */
  .wlt-success-ico{width:68px;height:68px;border-radius:50%;background:var(--g-12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  </style>

  <!-- ══ SCREEN ROUTER: main / create / backup / success / reveal / receive / send / history ══ -->

  <!-- ══ SCREEN: MAIN (Token list + wallet cards) ══ -->
  <div class="wlt-screen active" id="wlt-screen-main">

    <!-- Header: Est Total Value -->
    <div class="wlt-header">
      <div class="wlt-total-lbl">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Est. Total Value
      </div>
      <div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:2px">
        <span class="wlt-total-val ast-hideable" id="wlt-total-usdt">0.00</span>
        <span class="wlt-total-unit">USDT</span>
      </div>
      <div class="wlt-thb ast-hideable" id="wlt-total-thb">≈ ฿0.00</div>
    </div>

    <!-- Action Row -->
    <div class="wlt-action-grid">
      <button class="wlt-action-btn" onclick="wltGoto('receive')">
        <div class="wlt-action-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        </div>
        <span class="wlt-action-lbl">รับ</span>
      </button>
      <button class="wlt-action-btn" onclick="wltGoto('send')">
        <div class="wlt-action-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </div>
        <span class="wlt-action-lbl">ส่ง</span>
      </button>
      <button class="wlt-action-btn" onclick="wltGoto('history')">
        <div class="wlt-action-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <span class="wlt-action-lbl">ประวัติ</span>
      </button>
      <button class="wlt-action-btn" onclick="wltGoto('reveal')">
        <div class="wlt-action-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <span class="wlt-action-lbl">Private Key</span>
      </button>
    </div>

    <!-- Token Tabs -->
    <div class="wlt-tok-tabs">
      <button class="wlt-ttab active" onclick="wltTokTab(this,'tokens')">Tokens</button>
      <button class="wlt-ttab" onclick="wltTokTab(this,'wallets')">My Wallets</button>
    </div>

    <!-- Tokens Section -->
    <div id="wlt-tokens-section">
      <div class="wlt-tok-hdr">
        <span class="wlt-tok-hdr-lbl">Total Assets</span>
        <span class="wlt-tok-hdr-val ast-hideable" id="wlt-asset-total">0.00 USDT</span>
      </div>
      <!-- USDT -->
      <div class="wlt-tok-row" onclick="wltShowTokenDetail('USDT')">
        <div class="wlt-tok-logo" style="background:#26a17b22;color:#26a17b">₮</div>
        <div class="wlt-tok-info">
          <div class="wlt-tok-name">USDT</div>
          <div class="wlt-tok-sub">BEP-20 · BSC</div>
        </div>
        <div class="wlt-tok-right">
          <div class="wlt-tok-amount ast-hideable" id="wlt-usdt-bal">0.00</div>
          <div class="wlt-tok-thb ast-hideable" id="wlt-usdt-thb">≈ ฿0</div>
          <div class="wlt-lock-badge" id="wlt-usdt-lock" style="display:none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Lock
          </div>
        </div>
      </div>
      <div class="wlt-divider"></div>
      <!-- BNB -->
      <div class="wlt-tok-row" onclick="wltShowTokenDetail('BNB')">
        <div class="wlt-tok-logo" style="background:#f0b90b22;color:#f0b90b">B</div>
        <div class="wlt-tok-info">
          <div class="wlt-tok-name">BNB</div>
          <div class="wlt-tok-sub">Native · BSC</div>
        </div>
        <div class="wlt-tok-right">
          <div class="wlt-tok-amount ast-hideable" id="wlt-bnb-bal">0.0000</div>
          <div class="wlt-tok-thb ast-hideable" id="wlt-bnb-thb">≈ ฿0</div>
        </div>
      </div>
      <div class="wlt-divider"></div>
      <!-- SOL Row (แสดงเฉพาะเมื่อมี SOL wallet) -->
      <div class="wlt-tok-row" id="wlt-sol-row" style="display:none" onclick="wltShowTokenDetail('SOL')">
        <div class="wlt-tok-logo" style="background:#9945ff22;color:#9945ff">◎</div>
        <div class="wlt-tok-info">
          <div class="wlt-tok-name">SOL</div>
          <div class="wlt-tok-sub">Native · Solana</div>
        </div>
        <div class="wlt-tok-right">
          <div class="wlt-tok-amount ast-hideable" id="wlt-sol-bal">0.0000</div>
          <div class="wlt-tok-thb ast-hideable" id="wlt-sol-thb">≈ ฿0</div>
        </div>
      </div>
      <div class="wlt-divider" id="wlt-sol-divider"></div>
      <!-- BTC Row -->
      <div class="wlt-tok-row" id="wlt-btc-row" style="display:none" onclick="wltShowTokenDetail('BTC')">
        <div class="wlt-tok-logo" style="background:#f7931a22;color:#f7931a">₿</div>
        <div class="wlt-tok-info">
          <div class="wlt-tok-name">BTC</div>
          <div class="wlt-tok-sub">Native SegWit · Bitcoin</div>
        </div>
        <div class="wlt-tok-right">
          <div class="wlt-tok-amount ast-hideable" id="wlt-btc-bal">0.00000000</div>
          <div class="wlt-tok-thb ast-hideable" id="wlt-btc-thb">≈ ฿0</div>
        </div>
      </div>
      <div class="wlt-divider" id="wlt-btc-divider" style="display:none"></div>
      <!-- Low Value -->
      <div class="wlt-low-val" onclick="wltToggleLowVal()">
        <span id="wlt-low-lbl">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:4px;vertical-align:middle"><polyline points="6 9 12 15 18 9"/></svg>
          Low value (0)
        </span>
        <svg id="wlt-low-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div id="wlt-low-section" style="display:none;padding-bottom:8px">
        <div style="padding:16px;text-align:center;font-size:12px;color:var(--t3)">ไม่มี token มูลค่าต่ำ</div>
      </div>

      <!-- Create Wallet CTA -->
      <div style="padding:16px 16px 8px">
        <div id="wlt-no-wallet-notice" style="display:none">
          <div class="wlt-empty">
            <div class="wlt-empty-ico">👛</div>
            <div class="wlt-empty-title">ยังไม่มีกระเป๋า</div>
            <div class="wlt-empty-sub">สร้างกระเป๋า Crypto เพื่อรับ USDT<br>เป็น Collateral สำหรับ TCC Loan</div>
          </div>
          <button class="wlt-btn-primary" onclick="wltGoto('create')">+ สร้างกระเป๋าใหม่</button>
          <button class="wlt-btn-secondary" onclick="wltGoto('import')">↑ Import กระเป๋า (มี PK อยู่แล้ว)</button>
        </div>
      </div>
    </div>

    <!-- Wallets Section (My Wallets tab) -->
    <div id="wlt-wallets-section" style="display:none;padding-bottom:16px">
      <div id="wlt-wallet-list-container">
        <!-- จะ render ด้วย JS -->
      </div>
      <div id="wlt-wallets-cta" style="padding:12px 16px 0">
        <button class="wlt-btn-primary" onclick="wltGoto('create')">+ สร้างกระเป๋าใหม่</button>
        <button class="wlt-btn-secondary" onclick="wltGoto('import')">↑ Import กระเป๋า</button>
      </div>
    </div>
  </div><!-- /wlt-screen-main -->


  <!-- ══ SCREEN: CREATE WALLET ══ -->
  <div class="wlt-screen" id="wlt-screen-create">
    <div style="padding:16px">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">สร้างกระเป๋าใหม่</div>
      <div class="wlt-warn-box">
        <span class="wlt-warn-icon">⚠️</span>
        <strong>คำเตือนสำคัญ:</strong> Private Key และ Mnemonic จะแสดง <strong>เพียง 1 ครั้ง</strong>
        TCC ไม่สามารถกู้คืนได้ กรุณาบันทึกให้ปลอดภัยก่อนดำเนินการต่อ
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">ชื่อกระเป๋า</label>
        <input class="wlt-form-input" type="text" placeholder="เช่น Main Wallet" id="wlt-create-label" oninput="wltCheckCreate()" maxlength="30">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Wallet Password <span style="color:var(--t3);font-size:10px">(ใช้ Decrypt PK — ลืมไม่ได้)</span></label>
        <input class="wlt-form-input" type="password" placeholder="อย่างน้อย 8 ตัว + ตัวเลข" id="wlt-create-pwd" oninput="wltCheckStrength()">
        <div class="wlt-strength-bar">
          <div class="wlt-seg" id="wlt-s1"></div>
          <div class="wlt-seg" id="wlt-s2"></div>
          <div class="wlt-seg" id="wlt-s3"></div>
          <div class="wlt-seg" id="wlt-s4"></div>
        </div>
        <div class="wlt-strength-lbl" id="wlt-strength-lbl">ความแข็งแกร่ง</div>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">ยืนยัน Password</label>
        <input class="wlt-form-input" type="password" placeholder="กรอกซ้ำอีกครั้ง" id="wlt-create-pwd2" oninput="wltCheckCreate()">
        <div style="font-size:11px;color:var(--r);margin-top:4px;display:none" id="wlt-pwd-mismatch">Password ไม่ตรงกัน</div>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Blockchain Network</label>
        <div class="wlt-chain-grid">
          <div class="wlt-chain-opt active" onclick="wltSelectChain(this,'BSC')">BSC</div>
          <div class="wlt-chain-opt" onclick="wltSelectChain(this,'ETH')">ETH</div>
          <div class="wlt-chain-opt" onclick="wltSelectChain(this,'Polygon')">Polygon</div>
          <div class="wlt-chain-opt" onclick="wltSelectChain(this,'SOL')" style="display:flex;align-items:center;justify-content:center;gap:4px">
            <span style="font-size:10px">◎</span> SOL
          </div>
          <div class="wlt-chain-opt" onclick="wltSelectChain(this,'BTC')" style="display:flex;align-items:center;justify-content:center;gap:4px">
            ₿ BTC
          </div>
        </div>
      </div>
      <button class="wlt-btn-primary" id="wlt-create-btn" disabled onclick="wltDoCreate()">
        สร้างกระเป๋า
      </button>
    </div>
  </div><!-- /wlt-screen-create -->


  <!-- ══ SCREEN: IMPORT WALLET ══ -->
  <div class="wlt-screen" id="wlt-screen-import">
    <div style="padding:16px">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">Import กระเป๋า</div>
      <div style="font-size:13px;color:var(--t3);margin-bottom:20px">วาง Private Key ที่มีอยู่แล้ว ระบบจะ derive Address ให้อัตโนมัติ</div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">ชื่อกระเป๋า</label>
        <input class="wlt-form-input" type="text" placeholder="เช่น Import Wallet" id="wlt-imp-label" maxlength="30">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Private Key</label>
        <input class="wlt-form-input" type="password" placeholder="0x..." id="wlt-imp-pk" oninput="wltValidateImportPK()">
        <div style="font-size:11px;margin-top:4px;display:none" id="wlt-imp-addr-preview"></div>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Wallet Password <span style="color:var(--t3);font-size:10px">(เพื่อ Encrypt PK)</span></label>
        <input class="wlt-form-input" type="password" placeholder="อย่างน้อย 8 ตัว" id="wlt-imp-pwd">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">ยืนยัน Password</label>
        <input class="wlt-form-input" type="password" placeholder="กรอกซ้ำ" id="wlt-imp-pwd2">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Blockchain Network</label>
        <div class="wlt-chain-grid">
          <div class="wlt-chain-opt active" onclick="wltSelectChainImp(this,'BSC')">BSC</div>
          <div class="wlt-chain-opt" onclick="wltSelectChainImp(this,'ETH')">ETH</div>
          <div class="wlt-chain-opt" onclick="wltSelectChainImp(this,'Polygon')">Polygon</div>
          <div class="wlt-chain-opt" onclick="wltSelectChainImp(this,'SOL')" style="display:flex;align-items:center;justify-content:center;gap:4px">
            <span style="font-size:10px">◎</span> SOL
          </div>
          <div class="wlt-chain-opt" onclick="wltSelectChainImp(this,'BTC')" style="display:flex;align-items:center;justify-content:center;gap:4px">
            ₿ BTC
          </div>
        </div>
      </div>
      <button class="wlt-btn-primary" onclick="wltDoImport()">Import กระเป๋า</button>
    </div>
  </div><!-- /wlt-screen-import -->


  <!-- ══ SCREEN: BACKUP (Mnemonic + PK) ══ -->
  <div class="wlt-screen" id="wlt-screen-backup">
    <div style="padding:16px">
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">บันทึก Backup ก่อน</div>
      <div class="wlt-warn-box">
        <span class="wlt-warn-icon">🔒</span>
        บันทึก <strong>Mnemonic</strong> และ <strong>Private Key</strong> ไว้ในที่ปลอดภัย
        ระบบจะ<strong>ไม่แสดงซ้ำอีก</strong> — TCC ไม่สามารถกู้คืนได้
      </div>

      <div style="font-size:13px;font-weight:600;margin-bottom:8px">
        Mnemonic (12 คำ) <span id="wlt-mn-sol-note" style="display:none;font-size:10px;color:var(--t3);font-weight:400">— SOL ใช้ Private Key แทน</span>
      </div>
      <div class="wlt-mnemonic-grid" id="wlt-mn-grid"></div>
      <button onclick="wltCopyText('mnemonic')" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--t2);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:16px;font-family:var(--sans)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy Mnemonic
      </button>

      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Private Key</div>
      <div class="wlt-secret-box">
        <button class="wlt-copy-btn" onclick="wltCopyText('pk')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
        <span id="wlt-pk-display">—</span>
      </div>

      <div class="wlt-check-list">
        <div class="wlt-check-item" onclick="wltToggleCheck('c1')">
          <div class="wlt-checkbox" id="wlt-c1"></div>
          <div class="wlt-check-lbl">ฉันบันทึก Mnemonic 12 คำแล้ว</div>
        </div>
        <div class="wlt-check-item" onclick="wltToggleCheck('c2')">
          <div class="wlt-checkbox" id="wlt-c2"></div>
          <div class="wlt-check-lbl">ฉันบันทึก Private Key แล้ว</div>
        </div>
        <div class="wlt-check-item" onclick="wltToggleCheck('c3')">
          <div class="wlt-checkbox" id="wlt-c3"></div>
          <div class="wlt-check-lbl">ฉันเข้าใจว่า TCC ไม่สามารถกู้คืน PK ได้ ถ้าหาย = สูญเสียถาวร</div>
        </div>
      </div>

      <button class="wlt-btn-primary" id="wlt-confirm-backup-btn" disabled onclick="wltConfirmBackup()">
        ✅ ยืนยัน — บันทึกครบแล้ว
      </button>
    </div>
  </div><!-- /wlt-screen-backup -->


  <!-- ══ SCREEN: SUCCESS ══ -->
  <div class="wlt-screen" id="wlt-screen-success">
    <div style="padding:24px 16px;text-align:center">
      <div class="wlt-success-ico">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--g)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">สร้างกระเป๋าสำเร็จ!</div>
      <div id="wlt-success-desc" style="font-size:13px;color:var(--t3);line-height:1.6;margin-bottom:20px">
        ฝาก USDT (BEP-20) เข้า Address นี้<br>เพื่อใช้เป็น Collateral สำหรับ TCC Loan
      </div>

      <div style="font-size:12px;color:var(--t3);margin-bottom:6px">
        <span id="wlt-success-label-display">Main Wallet</span> · <span id="wlt-success-chain-display">BSC</span>
      </div>
      <div class="wlt-qr-wrap">
        <div style="background:#fff;padding:10px;border-radius:10px;display:inline-block;line-height:0">
          <div id="wlt-qr-code"></div>
        </div>
      </div>
      <div id="wlt-success-addr-label" style="font-size:11px;color:var(--t3);margin-bottom:4px">Address (BEP-20)</div>
      <div class="wlt-addr-card" id="wlt-success-addr">—</div>

      <div style="display:flex;gap:8px;margin-top:4px">
        <button onclick="wltCopyText('address')" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:12px;color:var(--t1);cursor:pointer;font-size:13px;font-family:var(--sans)">
          📋 Copy Address
        </button>
        <button onclick="wltGoto('receive')" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:12px;color:var(--t1);cursor:pointer;font-size:13px;font-family:var(--sans)">
          📷 QR Code
        </button>
      </div>

      <button class="wlt-btn-primary" style="margin-top:16px" onclick="wltGoto('main')">ดู Assets</button>
      <button onclick="wltGoto('reveal')" style="width:100%;background:none;border:none;color:var(--t3);font-size:12px;cursor:pointer;margin-top:12px;text-decoration:underline;font-family:var(--sans)">
        ดู Private Key ภายหลัง
      </button>
    </div>
  </div><!-- /wlt-screen-success -->


  <!-- ══ SCREEN: REVEAL PK ══ -->
  <div class="wlt-screen" id="wlt-screen-reveal">
    <div style="padding:16px">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:60px;height:60px;border-radius:50%;background:var(--y-10);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px">ดู Private Key</div>
        <div style="font-size:12px;color:var(--t3)">กรอก Wallet Password เพื่อ Decrypt</div>
      </div>

      <div class="wlt-form-group">
        <label class="wlt-form-lbl">เลือกกระเป๋า</label>
        <select class="wlt-form-select" id="wlt-reveal-wallet-sel">
          <option value="">— เลือกกระเป๋า —</option>
        </select>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Wallet Password</label>
        <input class="wlt-form-input" type="password" placeholder="กรอก Password" id="wlt-reveal-pwd" oninput="wltCheckReveal()">
      </div>
      <button class="wlt-btn-primary" id="wlt-reveal-btn" disabled onclick="wltDoReveal()">
        🔓 Decrypt & แสดง Private Key
      </button>

      <div id="wlt-pk-revealed-area" style="display:none;margin-top:20px">
        <div style="font-size:12px;color:var(--t3);margin-bottom:6px">
          Private Key (แสดง <span id="wlt-countdown">30</span> วินาที)
        </div>
        <div class="wlt-secret-box">
          <button class="wlt-copy-btn" onclick="wltCopyText('revealed-pk')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </button>
          <span id="wlt-revealed-pk-text">—</span>
        </div>
        <div class="wlt-timer-row">
          <span>ซ่อนใน</span>
          <div class="wlt-timer-bar">
            <div class="wlt-timer-fill" id="wlt-timer-fill" style="width:100%"></div>
          </div>
          <span id="wlt-countdown2">30</span>s
        </div>
      </div>

      <div class="wlt-warn-box danger" style="margin-top:16px;font-size:12px">
        🚫 ห้ามแชร์ Private Key กับใครทั้งนั้น รวมถึงทีมงาน TCC — ผู้ที่มี PK สามารถโอนเงินออกได้ทันที
      </div>
    </div>
  </div><!-- /wlt-screen-reveal -->


  <!-- ══ SCREEN: RECEIVE ══ -->
  <div class="wlt-screen" id="wlt-screen-receive">
    <div style="padding:16px">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">รับเหรียญ</div>
        <div id="wlt-receive-network-label" style="font-size:12px;color:var(--t3);margin-bottom:16px">Network: BSC (BEP-20)</div>

        <div class="wlt-form-group">
          <label class="wlt-form-lbl">เลือกกระเป๋า</label>
          <select class="wlt-form-select" id="wlt-receive-wallet-sel" onchange="wltRenderReceiveQR()">
            <option value="">— เลือกกระเป๋า —</option>
          </select>
        </div>

        <div class="wlt-qr-wrap">
          <div style="background:#fff;padding:10px;border-radius:10px;display:inline-block;line-height:0">
            <div id="wlt-receive-qr"></div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:4px">Address</div>
        <div class="wlt-addr-card" id="wlt-receive-addr">—</div>

        <div style="background:var(--y-10);border:1px solid rgba(240,185,11,.25);border-radius:8px;padding:10px;margin:12px 0;font-size:12px;color:#c9962e;line-height:1.5">
          <span id="wlt-receive-warning-text">⚠️ ส่งเฉพาะ <strong>BEP-20 Token</strong> บน BSC เท่านั้น<br>ส่งผิด Network = สูญเสียถาวร</span>
        </div>

        <div style="display:flex;gap:8px">
          <button onclick="wltCopyReceiveAddr()" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:12px;color:var(--t1);cursor:pointer;font-size:13px;font-family:var(--sans)">
            📋 Copy Address
          </button>
          <button onclick="wltOpenShareSheet(document.getElementById('wlt-receive-wallet-sel')?.value || wlt._receiveAddr, null)" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:12px;color:var(--t1);cursor:pointer;font-size:13px;font-family:var(--sans)">
            📤 Share
          </button>
        </div>
      </div>
    </div>
  </div><!-- /wlt-screen-receive -->


  <!-- ══ SCREEN: SEND ══ -->
  <div class="wlt-screen" id="wlt-screen-send">
    <div style="padding:16px">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="font-size:18px;font-weight:700;margin-bottom:12px">ส่งเหรียญ</div>

      <div id="wlt-send-lock-notice" class="wlt-lock-row" style="display:none">
        🔒 มี Collateral ถูก Lock อยู่ — กรุณาตรวจสอบยอดที่ใช้งานได้
      </div>
      <div class="wlt-avail-grid">
        <div class="wlt-avail-cell">
          <div class="wlt-avail-lbl">ใช้ได้</div>
          <div class="wlt-avail-val" id="wlt-send-avail" style="color:var(--g)">0.00</div>
        </div>
        <div class="wlt-avail-cell">
          <div class="wlt-avail-lbl">Lock (Collateral)</div>
          <div class="wlt-avail-val" id="wlt-send-locked" style="color:var(--r)">0.00</div>
        </div>
      </div>

      <div class="wlt-form-group">
        <label class="wlt-form-lbl">From (กระเป๋า)</label>
        <select class="wlt-form-select" id="wlt-send-wallet-sel" onchange="wltUpdateSendBalance()">
          <option value="">— เลือกกระเป๋า —</option>
        </select>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Token</label>
        <select class="wlt-form-select" id="wlt-send-token" onchange="wltUpdateSendTokenOptions()">
          <option value="USDT">USDT (BEP-20)</option>
          <option value="BNB">BNB (Native)</option>
          <option value="SOL">SOL (Native)</option>
        </select>
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">To Address</label>
        <input class="wlt-form-input" type="text" placeholder="0x..." id="wlt-send-to">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">จำนวน (Amount)</label>
        <input class="wlt-form-input" type="number" placeholder="0.00" id="wlt-send-amount" min="0" oninput="wltCalcSendFee()">
        <div style="font-size:11px;color:var(--t3);margin-top:4px" id="wlt-send-fee-label">ค่า Gas ≈ 0.0005 BNB (~฿9)</div>
      </div>
      <!-- BTC Fee Level (แสดงเฉพาะ BTC wallet) -->
      <div id="wlt-btc-fee-row" style="display:none;margin-bottom:16px">
        <label class="wlt-form-lbl">ระดับค่า Fee (BTC)</label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="wlt-chain-opt" onclick="wltBtcSelectFee(this,'slow')" style="font-size:12px;padding:8px 4px">
            🐢 Slow<br><span style="font-size:10px;color:var(--t3)">~1hr | ถูก</span>
          </div>
          <div class="wlt-chain-opt active" onclick="wltBtcSelectFee(this,'normal')" style="font-size:12px;padding:8px 4px">
            🚶 Normal<br><span style="font-size:10px;color:var(--t3)">~30min</span>
          </div>
          <div class="wlt-chain-opt" onclick="wltBtcSelectFee(this,'fast')" style="font-size:12px;padding:8px 4px">
            🚀 Fast<br><span style="font-size:10px;color:var(--t3)">~10min | แพง</span>
          </div>
        </div>
        <input type="hidden" id="wlt-btc-fee-level" value="normal">
      </div>
      <div class="wlt-form-group">
        <label class="wlt-form-lbl">Wallet Password <span style="color:var(--t3);font-size:10px">(ยืนยันตัวตนเพื่อ Sign TX)</span></label>
        <input class="wlt-form-input" type="password" placeholder="กรอก Password" id="wlt-send-pwd">
      </div>

      <div class="wlt-sum-box">
        <div class="wlt-sum-row"><span class="wlt-sum-lbl">ยอดส่ง</span><span class="wlt-sum-val" id="wlt-send-summary-amount">0.00 USDT</span></div>
        <div class="wlt-sum-row"><span class="wlt-sum-lbl">Gas Fee</span><span class="wlt-sum-val">≈ 0.0005 BNB</span></div>
        <div style="height:1px;background:var(--border);margin:6px 0"></div>
        <div class="wlt-sum-row" style="font-weight:600"><span class="wlt-sum-lbl">รวม</span><span class="wlt-sum-val" id="wlt-send-summary-total">0.00 USDT + Gas</span></div>
      </div>

      <button class="wlt-btn-primary" onclick="wltDoSend()">
        📤 ส่ง & Sign Transaction
      </button>
      <div class="wlt-warn-box danger" style="margin-top:12px;font-size:12px">
        ⚠️ ธุรกรรม Blockchain <strong>ย้อนกลับไม่ได้</strong> ตรวจสอบ Address ให้ถูกต้องก่อนยืนยัน
      </div>
    </div>
  </div><!-- /wlt-screen-send -->


  <!-- ══ SCREEN: TX HISTORY ══ -->
  <div class="wlt-screen" id="wlt-screen-history">
    <div style="padding:16px 16px 0">
      <button class="wlt-back-btn" onclick="wltGoto('main')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        กลับ
      </button>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:18px;font-weight:700">ประวัติ Transaction</div>
        <button onclick="wltRefreshHistory()" style="background:none;border:none;color:var(--t2);cursor:pointer;font-size:12px">🔄 Refresh</button>
      </div>
    </div>

    <div id="wlt-history-list" style="padding-bottom:80px">
      <!-- TX rows จะ render ด้วย JS -->
      <div class="wlt-empty">
        <div class="wlt-empty-ico">📋</div>
        <div class="wlt-empty-title">ยังไม่มีธุรกรรม</div>
        <div class="wlt-empty-sub">ธุรกรรมจะแสดงที่นี่<br>หลังจากมีการรับ-ส่งเหรียญ</div>
      </div>
    </div>
  </div><!-- /wlt-screen-history -->

  </div><!-- /ast-page-wallet-a -->
`;
  // Insert before #astMain closing or at end of body
  function _doInsert() {
    // Find placeholder comment or astMain div to insert before
    var placeholder = document.getElementById('wallet-html-placeholder');
    if (placeholder) {
      placeholder.outerHTML = _html;
    } else {
      // fallback: append to astMain if exists
      var astMain = document.getElementById('astMain');
      if (astMain) astMain.insertAdjacentHTML('beforeend', _html);
      else document.body.insertAdjacentHTML('beforeend', _html);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doInsert);
  } else { _doInsert(); }
})();

/* ─── SECTION 3: Home Wallet Modal JS (hmWlt) ─── */

/* ════════════════════════════════
   HOME WALLET PICKER — dropdown selector
════════════════════════════════ */
var _hmSelectedWalletId = null;

function _hmWltPickerRender() {
  var wallets = [];
  try { wallets = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]'); } catch(e) {}

  var btnEl   = document.getElementById('hm-wlt-picker-btn');
  var icoEl   = document.getElementById('hm-wlt-picker-ico');
  var lblEl   = document.getElementById('hm-wlt-picker-label');
  var addrEl  = document.getElementById('hm-wlt-picker-addr');
  var listEl  = document.getElementById('hm-wlt-picker-list');

  if (!wallets.length) {
    if (icoEl)  icoEl.textContent  = '?';
    if (lblEl)  lblEl.textContent  = 'ไม่มีกระเป๋า';
    if (addrEl) addrEl.textContent = '—';
    if (listEl) listEl.innerHTML   = '<div style="padding:14px;text-align:center;font-size:12px;color:var(--t3)">ยังไม่มีกระเป๋า</div>';
    return;
  }

  // ถ้ายังไม่ได้เลือก หรือ id ที่เลือกอยู่หายไป → default ใบแรก
  if (!_hmSelectedWalletId || !wallets.find(function(w){ return w.id === _hmSelectedWalletId; })) {
    _hmSelectedWalletId = wallets[0].id;
  }
  var sel = wallets.find(function(w){ return w.id === _hmSelectedWalletId; }) || wallets[0];
  var selIco = sel.chain === 'SOL' ? '◎' : sel.chain === 'ETH' ? 'Ξ' : 'B';
  var selColor = sel.chain === 'SOL' ? '#9945ff' : sel.chain === 'ETH' ? '#627eea' : '#f0b90b';
  var selAddr = (sel.address||'').slice(0,8) + '...' + (sel.address||'').slice(-6);

  if (icoEl)  { icoEl.textContent = selIco; icoEl.style.background = selColor + '22'; icoEl.style.color = selColor; }
  if (lblEl)  lblEl.textContent  = sel.label || 'Wallet';
  if (addrEl) addrEl.textContent = selAddr;

  if (listEl) {
    listEl.innerHTML = wallets.map(function(w) {
      var ico   = w.chain === 'SOL' ? '&#9678;' : w.chain === 'ETH' ? '&#926;' : 'B';
      var color = w.chain === 'SOL' ? '#9945ff' : w.chain === 'ETH' ? '#627eea' : '#f0b90b';
      var short = (w.address||'').slice(0,8) + '...' + (w.address||'').slice(-6);
      var active = w.id === _hmSelectedWalletId;
      var bg = active ? 'background:var(--bg3);' : '';
      var check = active ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--y)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      return [
        '<div class="_hm-pick-row" data-wid="' + w.id + '" style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;' + bg + '">',
          '<span style="width:26px;height:26px;border-radius:7px;background:' + color + '22;color:' + color + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' + ico + '</span>',
          '<div style="flex:1;min-width:0">',
            '<div style="font-size:12px;font-weight:600;color:var(--t1)">' + (w.label || 'Wallet') + '</div>',
            '<div style="font-size:10px;color:var(--t3);font-family:var(--mono)">' + short + '</div>',
          '</div>',
          check,
        '</div>'
      ].join('');
    }).join('');
    // attach click via event delegation — no inline onclick quoting issues
    listEl.onclick = function(e) {
      var row = e.target.closest('._hm-pick-row');
      if (row) _hmWltPickerSelect(row.getAttribute('data-wid'));
    };
  }
}

function _hmWltPickerSelect(id) {
  _hmSelectedWalletId = id;
  _hmWltPickerClose();
  _hmWltPickerRender();
  // [FIX] ถ้า wallet นี้ยังไม่มี per-wallet balance (ยังไม่เคย fetch)
  // → เรียก wltRefreshBalance ใหม่เพื่อดึงยอดทุก wallet รวมถึงใบนี้
  // ถ้ามีแล้ว → sync ทันทีจาก cache
  if (wlt && wlt._balPerWallet && wlt._balPerWallet[id]) {
    // มี cache แล้ว — sync ทันที
    if (typeof _hmSyncWalletBalance === 'function') _hmSyncWalletBalance();
  } else {
    // ยังไม่มี — fetch ใหม่ (จะ sync home หลัง fetch เสร็จ)
    if (typeof window._wltRefreshBalance === 'function') {
      window._wltRefreshBalance();
    } else if (typeof _hmSyncWalletBalance === 'function') {
      _hmSyncWalletBalance();
    }
  }
}

function _hmWltPickerToggle() {
  var drop  = document.getElementById('hm-wlt-picker-drop');
  var arrow = document.getElementById('hm-wlt-picker-arrow');
  if (!drop) return;
  var open = drop.style.display !== 'none';
  drop.style.display  = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) _hmWltPickerRender(); // refresh list on open
}

function _hmWltPickerClose() {
  var drop  = document.getElementById('hm-wlt-picker-drop');
  var arrow = document.getElementById('hm-wlt-picker-arrow');
  if (drop)  drop.style.display  = 'none';
  if (arrow) arrow.style.transform = '';
}

// ปิด dropdown เมื่อคลิกข้างนอก
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('hm-wlt-picker-wrap');
  if (wrap && !wrap.contains(e.target)) _hmWltPickerClose();
});

function _hmSetTab(t) {
  ['ex','wl'].forEach(k => {
    const el = document.getElementById('hm-tab-' + k);
    if (!el) return;
    el.classList.toggle('active', k === t);
  });
  // Show/hide content sections
  const mktCard    = document.querySelector('.hm-mkt-card');
  const wltSec     = document.getElementById('hm-wallet-section');
  const whalebar   = document.querySelector('.hm-whale-bar');
  const balArea    = document.querySelector('.hm-balance-area');
  const quickGrid  = document.querySelector('.hm-quick-grid');
  if (t === 'wl') {
    if (mktCard)   mktCard.style.display   = 'none';
    if (whalebar)  whalebar.style.display  = 'none';
    if (balArea)   balArea.style.display   = 'none';
    if (quickGrid) quickGrid.style.display = 'none';
    if (wltSec)    wltSec.style.display    = 'block';
    // Sync ยอดจาก wlt state
    _hmSyncWalletBalance();
    // แสดง CTA ถ้าไม่มี wallet / ซ่อน token section เมื่อไม่มี wallet
    const cta     = document.getElementById('hm-wlt-cta');
    const tokSec2 = document.getElementById('hm-wlt-token-sec');
    const wallets = (function(){ try { return JSON.parse(localStorage.getItem('tcc_wallets_local')||'[]'); } catch(e){ return []; } })();
    const hasWallet = wallets.length > 0;
    if (cta)     cta.style.display     = hasWallet ? 'none'  : 'block';
    if (tokSec2) tokSec2.style.display = hasWallet ? 'block' : 'none';
    // Render wallet picker
    _hmWltPickerRender();
    // sync currency label ให้ตรงกับ state ปัจจุบัน
    var _curLbl = document.getElementById('hm-wlt-cur-label');
    if (_curLbl) _curLbl.textContent = _hmWltCurrency || 'USD';
  } else {
    if (mktCard)   mktCard.style.display   = '';
    if (whalebar)  whalebar.style.display  = '';
    if (balArea)   balArea.style.display   = '';
    if (quickGrid) quickGrid.style.display = '';
    if (wltSec)    wltSec.style.display    = 'none';
  }
}

/* ════════════════════════════════
   CURRENCY SELECTOR — hm-wlt-cur-btn
   รองรับ USD / THB / BTC
════════════════════════════════ */
var _hmWltCurrency = 'USD'; // state: USD | THB | BTC

function _hmWltCurToggle(e) {
  if (e) { e.stopPropagation(); }
  var drop = document.getElementById('hm-wlt-cur-drop');
  if (!drop) return;
  var isOpen = drop.style.display !== 'none';
  drop.style.display = isOpen ? 'none' : 'block';
  // highlight current selection
  if (!isOpen) {
    drop.querySelectorAll('._hm-cur-opt').forEach(function(el) {
      var cur = el.getAttribute('data-cur');
      el.style.background = cur === _hmWltCurrency ? 'var(--bg3)' : '';
      el.style.color      = cur === _hmWltCurrency ? 'var(--y)'   : 'var(--t1)';
    });
  }
}

function _hmWltCurSelect(cur) {
  _hmWltCurrency = cur;
  // ปิด dropdown
  var drop = document.getElementById('hm-wlt-cur-drop');
  if (drop) drop.style.display = 'none';
  // อัปเดต label
  var lbl = document.getElementById('hm-wlt-cur-label');
  if (lbl) lbl.textContent = cur;
  // refresh ยอดเงินตาม currency ที่เลือก
  _hmSyncWalletBalance();
}

// ปิด currency dropdown เมื่อคลิกข้างนอก
document.addEventListener('click', function(e) {
  var btn  = document.getElementById('hm-wlt-cur-btn');
  var drop = document.getElementById('hm-wlt-cur-drop');
  if (drop && btn && !btn.contains(e.target) && !drop.contains(e.target)) {
    drop.style.display = 'none';
  }
});

function _hmSyncWalletBalance() {
  if (typeof wlt === 'undefined') return;

  // [FIX] ถ้ามีการเลือก wallet อยู่ และมี per-wallet balance → ใช้ยอดของ wallet นั้น
  // ถ้าไม่มี (ยังไม่ fetch หรือไม่ได้เลือก) → fallback ใช้ total เหมือนเดิม
  let usdt, bnb, sol;
  const selPer = _hmSelectedWalletId && wlt._balPerWallet && wlt._balPerWallet[_hmSelectedWalletId];
  if (selPer) {
    usdt = selPer.usdt || 0;
    bnb  = selPer.bnb  || 0;
    sol  = selPer.sol  || 0;
  } else {
    usdt = wlt.usdtBal || 0;
    bnb  = wlt.bnbBal  || 0;
    sol  = wlt.solBal  || 0;
  }

  const usdtThb = wlt.usdtPriceTHB || 35;
  const bnbThb  = wlt.bnbPriceTHB  || 0;
  const solThb  = wlt.solPriceTHB  || 0;
  const bnbUsd  = wlt.bnbPriceUSD  || 0;
  const solUsd  = wlt.solPriceUSD  || 0;
  const usdToThb = wlt._usdToThb   || 35;

  // คำนวณ total ทุก currency
  const totalUsd = usdt * 1 + bnb * bnbUsd + sol * solUsd;
  const totalThb = usdt * usdtThb + bnb * bnbThb + sol * solThb;
  // BTC price: ดึงจาก S.coinPrices['BTC'] → S.markPrice (ถ้า coin=BTC) → fallback 60000
  const btcPrice = (typeof S !== 'undefined')
    ? (parseFloat((S.coinPrices||{})['BTC']) || (S.markPrice > 0 && (S.symbol||'').includes('BTC') ? S.markPrice : 0) || 60000)
    : 60000;
  const totalBtc = btcPrice > 0 ? totalUsd / btcPrice : 0;

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // ── Total Wallet Value: แสดงตาม currency ที่เลือก ──
  var displayTotal, displaySub;
  switch (_hmWltCurrency) {
    case 'THB':
      displayTotal = totalThb.toLocaleString('th-TH', { maximumFractionDigits: 2 });
      displaySub   = '≈ $' + totalUsd.toFixed(2);
      break;
    case 'BTC':
      displayTotal = totalBtc.toFixed(8);
      displaySub   = '≈ $' + totalUsd.toFixed(2) + ' · ฿' + totalThb.toLocaleString('th-TH', { maximumFractionDigits: 0 });
      break;
    default: // USD
      displayTotal = totalUsd.toFixed(2);
      displaySub   = '≈ ฿' + totalThb.toLocaleString('th-TH', { maximumFractionDigits: 2 });
      break;
  }
  setTxt('hm-wlt-total', displayTotal);
  setTxt('hm-wlt-thb',   displaySub);

  // helper: format token sub-line ตาม currency ที่เลือก
  function _fmtTokenSub(usdVal, thbVal) {
    switch (_hmWltCurrency) {
      case 'THB':
        return '≈ ฿' + thbVal.toLocaleString('th-TH', { maximumFractionDigits: 2 });
      case 'BTC':
        return '≈ ₿' + (btcPrice > 0 ? (usdVal / btcPrice).toFixed(8) : '0.00000000');
      default: // USD
        return '≈ $' + usdVal.toFixed(2);
    }
  }

  // USDT row — ยอด + sub-line ตาม currency ที่เลือก
  setTxt('hm-wlt-usdt',     usdt.toFixed(2));
  setTxt('hm-wlt-usdt-thb', _fmtTokenSub(usdt * 1, usdt * usdtThb));

  // BNB row — ยอด + sub-line ตาม currency ที่เลือก
  setTxt('hm-wlt-bnb',     bnb.toFixed(4));
  setTxt('hm-wlt-bnb-thb', _fmtTokenSub(bnb * bnbUsd, bnb * bnbThb));

  // Sync Overview wallet row (always USD)
  setTxt('ovw-wallet-usdt', '$' + totalUsd.toFixed(2));
  setTxt('ovw-wallet-usd',  '≈ ฿' + totalThb.toLocaleString('th-TH', { maximumFractionDigits: 2 }));
}

/* ════════════════════════════════
   HOME WALLET MODAL — Open / Close / Back
   เปิด wlt-screen ใน modal overlay บนหน้า Home
   โดยไม่ต้อง navTo('assets') เลย
════════════════════════════════ */
const _hmWltScreenTitles = {
  main:    'Wallet',
  create:  'สร้างกระเป๋าใหม่',
  import:  'Import กระเป๋า',
  backup:  'บันทึก Backup',
  success: 'สร้างสำเร็จ',
  reveal:  'ดู Private Key',
  receive: 'รับเหรียญ',
  send:    'ส่งเหรียญ',
  history: 'ประวัติ Transaction',
};
let _hmWltPrevScreen = null;

window.hmWltOpen = function(screen) {
  // ใช้ window.wlt ที่ expose ออกมาจาก IIFE
  const _wlt = window.wlt;
  if (!_wlt) { console.error('wlt not ready'); return; }

  // โหลด wallets + ราคาก่อนเปิดเสมอ
  if (typeof window._wltLoadWallets === 'function')    window._wltLoadWallets();
  if (typeof window._wltRefreshBalance === 'function') window._wltRefreshBalance();

  const modal   = document.getElementById('hmWltModal');
  const content = document.getElementById('hmWltModalContent');
  const titleEl = document.getElementById('hmWltModalTitle');
  if (!modal || !content) return;

  // Clone wlt-screen จาก ast-page-wallet-a มาแสดงใน modal
  const srcEl = document.getElementById('wlt-screen-' + screen);
  if (!srcEl) { console.error('wlt-screen-' + screen + ' not found'); return; }

  content.innerHTML = '';
  const clone = srcEl.cloneNode(true);
  clone.style.display      = 'flex';
  clone.style.flexDirection = 'column';
  clone.removeAttribute('id');

  // ปุ่มกลับทุกปุ่มใน clone → hmWltBack()
  clone.querySelectorAll('.wlt-back-btn').forEach(btn => {
    btn.onclick = function(e) { e.stopPropagation(); hmWltBack(); };
  });

  // เชื่อม onclick ที่อ้าง wltGoto ใน clone → hmWltOpen
  clone.querySelectorAll('[onclick]').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    if (oc.includes('wltGoto(')) {
      const m = oc.match(/wltGoto\('(\w+)'\)/);
      if (m) el.onclick = function(e) { e.stopPropagation(); hmWltOpen(m[1]); };
    }
  });

  content.appendChild(clone);

  // Title + back button visibility
  titleEl.textContent = (_hmWltScreenTitles[screen] || 'Wallet');
  const backBtn = document.getElementById('hmWltModalBack');
  if (backBtn) backBtn.style.visibility = screen === 'main' ? 'hidden' : 'visible';

  _hmWltPrevScreen   = screen === 'main' ? null : 'main';
  _wlt.currentScreen = screen;

  // ── Init hooks ──
  if (screen === 'main')    { _hmWltInitMain(clone); }
  if (screen === 'receive') { _hmWltInitReceive(clone); }
  if (screen === 'send')    { _hmWltInitSend(clone); }
  if (screen === 'history') { _hmWltInitHistory(clone); }
  if (screen === 'reveal')  { _hmWltInitReveal(clone); }
  if (screen === 'create')  { _hmWltInitCreate(clone); }
  if (screen === 'import')  { _hmWltInitImport(clone); }
  if (screen === 'backup')  { _hmWltInitBackup(clone); }
  if (screen === 'success') { _hmWltInitSuccess(clone); }

  modal.style.display     = 'flex';
  document.body.style.overflow = 'hidden';
};

window.hmWltClose = function() {
  const modal = document.getElementById('hmWltModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  if (typeof _hmSyncWalletBalance === 'function') _hmSyncWalletBalance();
  const cta     = document.getElementById('hm-wlt-cta');
  const tokSec2 = document.getElementById('hm-wlt-token-sec');
  try {
    const wallets   = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
    const hasWallet = wallets.length > 0;
    if (cta)     cta.style.display     = hasWallet ? 'none'  : 'block';
    if (tokSec2) tokSec2.style.display = hasWallet ? 'block' : 'none';
  } catch(e) {}
  // Refresh picker after modal close (new wallet may have been created)
  if (typeof _hmWltPickerRender === 'function') _hmWltPickerRender();
};

window.hmWltBack = function() { hmWltOpen('main'); };
window.hmWltGoto = function(s) { hmWltOpen(s); };

/* ── init: main screen ── */
function _hmWltInitMain(clone) {
  if (typeof window._wltRefreshBalance === 'function') window._wltRefreshBalance();
  // [FIX] _esc อยู่ใน IIFE → ใช้ window._esc ที่ expose ออกมา (fallback String() กัน crash)
  var _e = window._esc || function(s){ return String(s||''); };
  try {
    const wallets   = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
    const hasWallet = wallets.length > 0;

    // Tokens tab: notice + CTA
    const notice = clone.querySelector('#wlt-no-wallet-notice');
    if (notice) notice.style.display = hasWallet ? 'none' : 'block';

    // My Wallets tab: render cards into clone's container
    const container = clone.querySelector('#wlt-wallet-list-container');
    if (container) {
      if (!hasWallet) {
        container.innerHTML = '<div class="wlt-empty"><div class="wlt-empty-ico">&#x1F45B;</div><div class="wlt-empty-title">&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;</div><div class="wlt-empty-sub">&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;&#x22;</div></div>';
      } else {
        container.innerHTML = wallets.map(function(w) {
          var ico = w.chain === 'SOL' ? '\u25CE' : w.chain === 'ETH' ? '\u039E' : 'B';
          var addrShort = (w.address||'').slice(0,8) + '...' + (w.address||'').slice(-6);
          var addr = (w.address||'').replace(/'/g,'');
          return '<div style="display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);gap:12px">'
            + '<div style="width:38px;height:38px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">' + ico + '</div>'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:13px;font-weight:600;color:var(--t1)">' + _e(w.label||'Wallet') + '</div>'
            + '<div style="font-size:11px;color:var(--t3);margin-top:2px;font-family:var(--mono)">' + addrShort + '</div>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px">'
            + '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--bg3);color:var(--t2);border:1px solid var(--border)">' + _e(w.chain||'BSC') + '</span>'
            + '<button data-addr="' + _e(w.address||'') + '" class="_wlt-copy-btn" style="background:none;border:1px solid var(--border);border-radius:8px;padding:4px 8px;color:var(--t2);cursor:pointer;font-size:11px">Copy</button>'
            + '</div>'
            + '</div>';
        }).join('');
        // attach copy handlers
        container.querySelectorAll('._wlt-copy-btn').forEach(function(btn) {
          btn.onclick = function() {
            var a = btn.getAttribute('data-addr');
            if (navigator.clipboard) navigator.clipboard.writeText(a).then(function(){ if(typeof showToast==='function') showToast('\uD83D\uDCCB Copied!'); });
            else { var ta=document.createElement('textarea'); ta.value=a; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); if(typeof showToast==='function') showToast('\uD83D\uDCCB Copied!'); }
          };
        });
      }
    }

    // My Wallets CTA: always show (allow adding more wallets)
    var wltCta = clone.querySelector('#wlt-wallets-cta');
    if (wltCta) wltCta.style.display = 'block';

  } catch(e) { console.error('_hmWltInitMain', e); }
}

/* ── init: receive ── */
function _hmWltInitReceive(clone) {
  try {
    const raw     = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
    const wallets = [...raw].reverse(); // ล่าสุดก่อน
    const sel     = clone.querySelector('select');

    if (sel) {
      sel.innerHTML = wallets.length
        ? wallets.map(w => `<option value="${w.address}">${w.label||'Wallet'} · ${w.chain||'BSC'} · ${(w.address||'').slice(0,10)}...</option>`).join('')
        : '<option value="">ไม่มีกระเป๋า</option>';
    }

    // ต้องหา copyBtn/shareBtn ก่อน sel.onchange เพราะ closure ต้องการ ref
    const copyBtn  = clone.querySelector('[onclick*="wltCopyReceiveAddr"]');
    // shareBtn อาจใช้ onclick="wltShareAddr()" หรือ onclick="wltOpenShareSheet(...)"
    const shareBtn = clone.querySelector('[onclick*="wltShareAddr"]')
                  || clone.querySelector('[onclick*="wltOpenShareSheet"]');

    if (sel) {
      sel.onchange = function() {
        const curAddr = this.value;
        _hmWltRenderQR(clone, curAddr, wallets);
        _hmWltUpdateCopyShare(clone, copyBtn, shareBtn, curAddr);
      };
    }

    const initialAddr = wallets[0]?.address || '';
    if (initialAddr) {
      if (sel) sel.value = initialAddr;
      _hmWltRenderQR(clone, initialAddr, wallets);
      _hmWltUpdateCopyShare(clone, copyBtn, shareBtn, initialAddr);
    } else {
      const addrEl = clone.querySelector('#wlt-receive-addr');
      if (addrEl) { addrEl.removeAttribute('id'); addrEl.textContent = 'สร้างกระเป๋าก่อน'; }
    }
  } catch(e) { console.error('_hmWltInitReceive', e); }
}

/* ── helper: update copy + share button ให้ชี้ไปที่ addr ปัจจุบัน ── */
function _hmWltUpdateCopyShare(clone, copyBtn, shareBtn, addr) {
  if (copyBtn) {
    copyBtn.onclick = function() {
      if (!addr) { if(typeof showToast==='function') showToast('ไม่พบ Address'); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(addr).then(() => { if(typeof showToast==='function') showToast('📋 Copied!'); });
      } else {
        const ta = document.createElement('textarea');
        ta.value = addr; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        if(typeof showToast==='function') showToast('📋 Copied!');
      }
    };
  }
  if (shareBtn) {
    shareBtn.onclick = function() {
      if (!addr) { if(typeof showToast==='function') showToast('ไม่พบ Address'); return; }
      // ส่ง addr ปัจจุบัน (ตาม dropdown) เข้า share sheet เสมอ
      if (typeof window.wltOpenShareSheet === 'function') {
        window.wltOpenShareSheet(addr, null);
      } else {
        if (navigator.clipboard) navigator.clipboard.writeText(addr).then(() => { if(typeof showToast==='function') showToast('📋 Copied!'); });
      }
    };
  }
}

/* ── helper: render QR + address text + network/warning labels ── */
function _hmWltRenderQR(clone, addr, wallets) {
  // แสดง address text
  const addrEl = clone.querySelector('#wlt-receive-addr') || clone.querySelector('.wlt-addr-card');
  if (addrEl) { addrEl.removeAttribute('id'); addrEl.textContent = addr || '—'; }

  // render QR
  const qrWrap = clone.querySelector('#wlt-receive-qr') || clone.querySelector('.wlt-qr-wrap > div');
  if (qrWrap && addr) {
    qrWrap.removeAttribute('id');
    qrWrap.innerHTML = '';
    try { new QRCode(qrWrap, { text: addr, width:200, height:200, colorDark:'#000', colorLight:'#fff', correctLevel:QRCode.CorrectLevel.L }); } catch(e) {}
  }

  // อัปเดต network label + warning ตาม chain ของ wallet ที่เลือก
  const rec      = (wallets || []).find(w => w.address === addr);
  const isBtcRec = rec?.chain === 'BTC';
  const netLbl   = clone.querySelector('#wlt-receive-network-label');
  const warnEl   = clone.querySelector('#wlt-receive-warning-text');
  if (netLbl) { netLbl.removeAttribute('id'); netLbl.textContent = isBtcRec ? 'Network: Bitcoin (BTC)' : 'Network: BSC (BEP-20)'; }
  if (warnEl) { warnEl.removeAttribute('id'); warnEl.innerHTML  = isBtcRec
    ? '⚠️ ส่งเฉพาะ <strong>BTC</strong> บน Bitcoin Network เท่านั้น<br>ส่งผิด Network = สูญเสียถาวร'
    : '⚠️ ส่งเฉพาะ <strong>BEP-20 Token</strong> บน BSC เท่านั้น<br>ส่งผิด Network = สูญเสียถาวร'; }
}

/* ── init: send ── */
function _hmWltInitSend(clone) {
  try {
    // [FIX] remap IDs ใน clone — ไม่งั้น wltDoSend() จะ getElementById แล้วเจอ
    // element ของ wlt-screen-send ต้นฉบับ (hidden) ที่ค่าว่างทั้งหมด
    const idMap = {
      'wlt-send-wallet-sel'     : 'hm-send-wallet-sel',
      'wlt-send-token'          : 'hm-send-token',
      'wlt-send-to'             : 'hm-send-to',
      'wlt-send-amount'         : 'hm-send-amount',
      'wlt-send-pwd'            : 'hm-send-pwd',
      'wlt-send-avail'          : 'hm-send-avail',
      'wlt-send-locked'         : 'hm-send-locked',
      'wlt-send-fee-label'      : 'hm-send-fee-label',
      'wlt-send-summary-amount' : 'hm-send-summary-amount',
      'wlt-send-summary-total'  : 'hm-send-summary-total',
      'wlt-send-lock-notice'    : 'hm-send-lock-notice',
    };
    Object.entries(idMap).forEach(([oldId, newId]) => {
      const el = clone.querySelector('#' + oldId);
      if (el) el.id = newId;
    });

    // ── populate wallet selector ──
    const wallets = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
    const walletSel = clone.querySelector('#hm-send-wallet-sel');
    if (walletSel) {
      walletSel.innerHTML = wallets.length
        ? wallets.map(w => '<option value="' + w.id + '">' + (w.label||'Wallet') + ' · ' + (w.address||'').slice(0,10) + '...</option>').join('')
        : '<option value="">ไม่มีกระเป๋า</option>';
    }

    // ── helper: อัปเดต avail/locked จาก per-wallet balance ──
    function _hmUpdateSendBalance() {
      const sid = walletSel ? walletSel.value : '';
      const per = wlt && wlt._balPerWallet && sid ? (wlt._balPerWallet[sid] || {}) : {};
      const usdt = per.usdt || 0;
      const bnb  = per.bnb  || 0;
      const sol  = per.sol  || 0;
      const tok  = clone.querySelector('#hm-send-token')?.value || 'USDT';
      let avail = tok === 'BNB' ? bnb : tok === 'SOL' ? sol : Math.max(0, usdt - (wlt.lockedUsdt || 0));
      const locked = tok === 'USDT' ? (wlt.lockedUsdt || 0) : 0;
      const availEl  = clone.querySelector('#hm-send-avail');
      const lockedEl = clone.querySelector('#hm-send-locked');
      const noticeEl = clone.querySelector('#hm-send-lock-notice');
      if (availEl)  availEl.textContent  = avail.toFixed(tok === 'BNB' || tok === 'SOL' ? 4 : 2);
      if (lockedEl) lockedEl.textContent = locked.toFixed(2);
      if (noticeEl) noticeEl.style.display = locked > 0 ? 'flex' : 'none';
    }

    // ── helper: อัปเดต token options ตาม chain ──
    function _hmUpdateTokenOptions() {
      const sid = walletSel ? walletSel.value : '';
      const ws  = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
      const rec = ws.find(function(w) { return w.id === sid; });
      const tokSel   = clone.querySelector('#hm-send-token');
      const feeLabel = clone.querySelector('#hm-send-fee-label');
      if (!rec || !tokSel) return;
      const isSol = rec.chain === 'SOL';
      Array.from(tokSel.options).forEach(function(opt) {
        opt.style.display = isSol ? (opt.value === 'SOL' ? '' : 'none') : (opt.value === 'SOL' ? 'none' : '');
      });
      tokSel.value = isSol ? 'SOL' : 'USDT';
      if (feeLabel) feeLabel.textContent = isSol ? 'ค่า Fee ≈ 0.000005 SOL (~฿0.01)' : 'ค่า Gas ≈ 0.0005 BNB (~฿9)';
      _hmUpdateSendBalance();
    }

    // ── helper: calc fee summary ──
    function _hmCalcSendFee() {
      const amt    = parseFloat(clone.querySelector('#hm-send-amount')?.value) || 0;
      const tok    = clone.querySelector('#hm-send-token')?.value || 'USDT';
      const sumAmt = clone.querySelector('#hm-send-summary-amount');
      const sumTot = clone.querySelector('#hm-send-summary-total');
      if (sumAmt) sumAmt.textContent = amt.toFixed(tok === 'BNB' || tok === 'SOL' ? 4 : 2) + ' ' + tok;
      if (sumTot) sumTot.textContent = amt.toFixed(tok === 'BNB' || tok === 'SOL' ? 4 : 2) + ' ' + tok + ' + Gas';
    }

    // wire events
    if (walletSel) walletSel.onchange = function() { _hmUpdateTokenOptions(); _hmUpdateSendBalance(); };
    const tokSel = clone.querySelector('#hm-send-token');
    if (tokSel) tokSel.onchange = function() { _hmUpdateSendBalance(); };
    const amtEl = clone.querySelector('#hm-send-amount');
    if (amtEl) amtEl.oninput = _hmCalcSendFee;

    // initial populate
    _hmUpdateTokenOptions();
    _hmUpdateSendBalance();

    // ── Send button: อ่านจาก clone IDs (hm-send-*) ──
    const sendBtn = clone.querySelector('[onclick*="wltDoSend"]');
    if (sendBtn) {
      sendBtn.onclick = async function() {
        if (sendBtn.disabled) return;
        const selId  = clone.querySelector('#hm-send-wallet-sel')?.value;
        const toAddr = (clone.querySelector('#hm-send-to')?.value || '').trim();
        const amount = parseFloat(clone.querySelector('#hm-send-amount')?.value) || 0;
        const token  = clone.querySelector('#hm-send-token')?.value || 'USDT';
        const pwd    = clone.querySelector('#hm-send-pwd')?.value;

        if (!selId)       { showToast('กรุณาเลือกกระเป๋า'); return; }
        if (!toAddr)      { showToast('กรุณากรอก To Address'); return; }
        if (amount <= 0)  { showToast('กรุณากรอกจำนวนที่ถูกต้อง'); return; }
        if (!pwd)         { showToast('กรุณากรอก Wallet Password'); return; }

        const _gw  = window.wltGetLocalWallets || function(){ try{ return JSON.parse(localStorage.getItem('tcc_wallets_local')||'[]'); }catch(e){ return []; } };
        const ws  = _gw();
        const rec = ws.find(function(w) { return w.id === selId; });
        if (!rec) { showToast('ไม่พบกระเป๋า'); return; }

        const isSol = rec.chain === 'SOL';
        if (isSol) {
          if (toAddr.length < 32 || toAddr.length > 44) { showToast('❌ Solana Address ไม่ถูกต้อง'); return; }
        } else {
          if (!toAddr.startsWith('0x') || toAddr.length !== 42) { showToast('❌ EVM Address ไม่ถูกต้อง'); return; }
        }

        const per = wlt._balPerWallet && wlt._balPerWallet[selId] ? wlt._balPerWallet[selId] : { usdt: wlt.usdtBal||0, bnb: wlt.bnbBal||0, sol: wlt.solBal||0 };
        if (token === 'USDT' && amount > Math.max(0, (per.usdt||0) - (wlt.lockedUsdt||0))) {
          showToast('❌ ยอด USDT ไม่พอ (ใช้ได้ ' + Math.max(0,(per.usdt||0)-(wlt.lockedUsdt||0)).toFixed(2) + ')'); return;
        }
        if (token === 'BNB' && amount > (per.bnb||0)) {
          showToast('❌ ยอด BNB ไม่พอ (' + (per.bnb||0).toFixed(4) + ')'); return;
        }
        if (token === 'SOL' && amount > (per.sol||0)) {
          showToast('❌ ยอด SOL ไม่พอ (' + (per.sol||0).toFixed(4) + ')'); return;
        }

        const origTxt = sendBtn.textContent;
        sendBtn.disabled = true; sendBtn.textContent = '⏳ กำลัง Sign TX...';
        showToast('🔓 กำลัง Decrypt & Sign Transaction...');

        try {
          const pk = await wltDecryptPK(rec.encrypted_pk, rec.iv, rec.salt, pwd);
          if (!pk) { showToast('❌ Password ไม่ถูกต้อง'); sendBtn.disabled = false; sendBtn.textContent = origTxt; return; }

          let txHash = '';
          if (isSol) {
            txHash = await (window.wltSolTransfer || wltSolTransfer)(pk, toAddr, amount);
          } else {
            const provider = new ethers.providers.JsonRpcProvider(window.WLT_BSC_RPC || 'https://bsc-dataseed.binance.org/');
            const wallet   = new ethers.Wallet(pk, provider);
            let tx;
            if (token === 'BNB') {
              tx = await wallet.sendTransaction({ to: toAddr, value: ethers.utils.parseEther(amount.toString()) });
            } else {
              const _usdtContract = window.WLT_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';
              const usdtABI  = ['function transfer(address to, uint256 amount) returns (bool)'];
              const contract = new ethers.Contract(_usdtContract, usdtABI, wallet);
              tx = await contract.transfer(toAddr, ethers.utils.parseUnits(amount.toString(), 18));
            }
            showToast('✅ TX ส่งแล้ว! กำลังรอ Confirm...');
            const receipt = await tx.wait(1);
            if (receipt.status !== 1) { showToast('❌ ธุรกรรมล้มเหลว'); sendBtn.disabled = false; sendBtn.textContent = origTxt; return; }
            txHash = tx.hash;
          }

          showToast('✅ ธุรกรรมสำเร็จ! TX: ' + (txHash||'').slice(0,14) + '...');
          // [FIX #2] เพิ่ม from: rec.address เพื่อบันทึก from_addr ใน GAS sheet ด้วย
          (window.wltSaveTxHistory || wltSaveTxHistory)({ type:'send', token, amount, from: rec.address, to: toAddr, hash: txHash, status:'confirmed', chain: rec.chain });
          if (typeof wltRefreshBalance === 'function') wltRefreshBalance();
          hmWltOpen('history');
        } catch(e) {
          const msg = e.message || '';
          if (msg.includes('insufficient funds') || msg.includes('insufficient lamports')) {
            showToast('❌ ยอดไม่พอจ่าย Gas Fee');
          } else {
            showToast('❌ ส่งไม่สำเร็จ: ' + msg.slice(0,60));
          }
          sendBtn.disabled = false; sendBtn.textContent = origTxt;
        }
      };
    }
  } catch(e) { console.error('_hmWltInitSend', e); }
}

/* ── init: history ── */
function _hmWltInitHistory(clone) {
  try {
    const list = clone.querySelector('#wlt-history-list');
    if (!list) return;
    list.removeAttribute('id');
    const txs = JSON.parse(localStorage.getItem('tcc_wallet_tx_history') || '[]');
    if (!txs.length) return;
    list.innerHTML = txs.slice(0,30).map(tx => {
      const dir = tx.type==='receive' ? '↓ รับ' : '↑ ส่ง';
      const col = tx.type==='receive' ? 'var(--g)' : 'var(--r)';
      // [FIX] อ่าน tx.date ก่อน (field ที่ wltSaveTxHistory บันทึก) แล้ว fallback tx.ts/tx.timestamp
      const d   = new Date(tx.date || tx.ts || tx.timestamp || 0).toLocaleDateString('th-TH');
      // [FIX] สร้าง explorer link สำหรับ hash — ใช้ _explorerLinkFor ถ้ามี
      const explorerUrl = tx.hash
        ? ((typeof _explorerLinkFor === 'function')
            ? _explorerLinkFor(tx.chain || 'BSC', tx.hash)
            : (tx.chain === 'SOL'
                ? 'https://solscan.io/tx/' + tx.hash
                : 'https://bscscan.com/tx/' + tx.hash))
        : '';
      const hashEl = tx.hash
        ? `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer"
              onclick="event.stopPropagation()"
              style="color:var(--y,#f0b90b);text-decoration:underline"
            >${tx.hash.slice(0,14)}...</a>`
        : '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:600;color:${col}">${dir} ${tx.token||'USDT'}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${d} · ${hashEl}</div>
        </div>
        <div style="font-size:13px;font-weight:600;color:${col}">${tx.amount||0} ${tx.token||'USDT'}</div>
      </div>`;
    }).join('');
  } catch(e) { console.error('_hmWltInitHistory', e); }
}

/* ── init: reveal ── */
function _hmWltInitReveal(clone) {
  try {
    const wallets = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
    const sel = clone.querySelector('select');
    if (sel) {
      sel.innerHTML = ['<option value="">— เลือกกระเป๋า —</option>']
        .concat(wallets.map(w => `<option value="${w.id}">${w.label||'Wallet'}</option>`)).join('');
      sel.id = 'hm-reveal-wallet-sel';
    }
    const pwd = clone.querySelector('input[type="password"]');
    if (pwd) pwd.id = 'hm-reveal-pwd';
    const btn = clone.querySelector('#wlt-reveal-btn');
    if (btn) {
      btn.removeAttribute('id'); btn.id = 'hm-reveal-btn'; btn.disabled = false;
      btn.onclick = async function() { if(typeof wltDoReveal==='function') await wltDoReveal(); };
    }
  } catch(e) { console.error('_hmWltInitReveal', e); }
}

/* ── init: create ── */
function _hmWltInitCreate(clone) {
  // ── Rename IDs ใน clone เพื่อไม่ชน DOM ต้นฉบับ ──
  const ID = {
    label   : 'hm-create-label',
    pwd     : 'hm-create-pwd',
    pwd2    : 'hm-create-pwd2',
    mismatch: 'hm-pwd-mismatch',
    btn     : 'hm-create-btn',
    s1:'hm-s1', s2:'hm-s2', s3:'hm-s3', s4:'hm-s4',
    strengthLbl: 'hm-strength-lbl',
  };
  const renameMap = {
    'wlt-create-label' : ID.label,
    'wlt-create-pwd'   : ID.pwd,
    'wlt-create-pwd2'  : ID.pwd2,
    'wlt-pwd-mismatch' : ID.mismatch,
    'wlt-create-btn'   : ID.btn,
    'wlt-s1': ID.s1, 'wlt-s2': ID.s2, 'wlt-s3': ID.s3, 'wlt-s4': ID.s4,
    'wlt-strength-lbl' : ID.strengthLbl,
  };
  Object.entries(renameMap).forEach(([oldId, newId]) => {
    const el = clone.querySelector('#' + oldId);
    if (el) el.id = newId;
  });

  // ── Reset values ──
  const inpLabel = clone.querySelector('#' + ID.label);
  const inpPwd   = clone.querySelector('#' + ID.pwd);
  const inpPwd2  = clone.querySelector('#' + ID.pwd2);
  if (inpLabel) inpLabel.value = '';
  if (inpPwd)   inpPwd.value   = '';
  if (inpPwd2)  inpPwd2.value  = '';

  // ── Chain selector: toggle active ภายใน clone ──
  const chainOpts = clone.querySelectorAll('.wlt-chain-opt');
  chainOpts.forEach(el => {
    el.classList.remove('active');
    const m = (el.getAttribute('onclick') || '').match(/wltSelectChain\(this,'(\w+)'\)/);
    if (!m) return;
    const chain = m[1];
    el.onclick = function() {
      chainOpts.forEach(o => o.classList.remove('active'));
      this.classList.add('active');
      if (window.wlt) window.wlt.selectedChain = chain;
    };
    if (chain === (window.wlt?.selectedChain || 'BSC')) el.classList.add('active');
  });

  // ── Password strength: ชี้มาที่ clone IDs ──
  function hmCheckStrength() {
    const pwd = document.getElementById(ID.pwd)?.value || '';
    let score = 0;
    if (pwd.length >= 8)          score++;
    if (/[0-9]/.test(pwd))        score++;
    if (/[A-Z]/.test(pwd))        score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    const colorMap = ['','s-red','s-red','s-gold','s-green'];
    const labelMap = ['','อ่อน','พอใช้','ดี','แข็งแกร่ง'];
    [1,2,3,4].forEach(i => {
      const seg = document.getElementById('hm-s' + i);
      if (!seg) return;
      seg.className = 'wlt-seg' + (i <= score ? ' ' + (colorMap[score] || '') : '');
    });
    const lbl = document.getElementById(ID.strengthLbl);
    if (lbl) lbl.textContent = labelMap[score] || 'ความแข็งแกร่ง';
    hmCheckCreate();
  }

  function hmCheckCreate() {
    const label = document.getElementById(ID.label)?.value.trim();
    const p1    = document.getElementById(ID.pwd)?.value;
    const p2    = document.getElementById(ID.pwd2)?.value;
    const mis   = document.getElementById(ID.mismatch);
    const btn   = document.getElementById(ID.btn);
    if (mis) mis.style.display = (p2 && p1 !== p2) ? 'block' : 'none';
    if (btn) btn.disabled = !(label && p1 && p1.length >= 8 && p1 === p2);
  }

  if (inpPwd)   inpPwd.oninput   = hmCheckStrength;
  if (inpPwd2)  inpPwd2.oninput  = hmCheckCreate;
  if (inpLabel) inpLabel.oninput = hmCheckCreate;

  // ── สร้างกระเป๋า button ──
  const btn = clone.querySelector('#' + ID.btn);
  if (btn) {
    btn.disabled = true;
    btn.onclick = async function() {
      const label = document.getElementById(ID.label)?.value.trim();
      const pwd   = document.getElementById(ID.pwd)?.value;
      if (!label || !pwd) return;
      if (typeof ethers === 'undefined') { showToast('⚠️ กำลังโหลด ethers.js'); return; }
      btn.disabled = true; btn.textContent = 'กำลังสร้าง...';
      try {
        let address, pk, mnemonic;
        const chain = window.wlt?.selectedChain || 'BSC';
        if (chain === 'BTC') {
          if (!window.btcCrypto) throw new Error('btcCrypto ยังไม่โหลด กรุณารอสักครู่');
          if (typeof window.btcGenerateWallet !== 'function') throw new Error('btcGenerateWallet ยังไม่พร้อม กรุณา Reload หน้า');
          const bw = window.btcGenerateWallet();
          address  = bw.address;
          pk       = bw.privateKey; // WIF format
          mnemonic = '(Bitcoin Native SegWit — ไม่มี Mnemonic, ใช้ WIF Private Key restore)';
        } else if (chain === 'SOL') {
          if (!self.nobleEd25519) throw new Error('noble/ed25519 ยังไม่โหลด');
          const sw = solGenerateWallet();
          address = sw.address; pk = sw.privateKey;
          mnemonic = '(Solana — ไม่มี Mnemonic)';
        } else {
          const w = ethers.Wallet.createRandom();
          address = w.address; pk = w.privateKey; mnemonic = w.mnemonic.phrase;
        }
        const { encrypted_pk, iv, salt } = await wltEncryptPK(pk, pwd);
        window.wlt.pendingWallet = { label, chain, address, mnemonic, privateKey: pk, encrypted_pk, iv, salt };
        // ไปหน้า backup ใน modal
        hmWltOpen('backup');
      } catch(e) {
        showToast('❌ สร้างไม่สำเร็จ: ' + e.message);
        btn.disabled = false; btn.textContent = 'สร้างกระเป๋า';
      }
    };
  }
}

/* ── init: import ── */
function _hmWltInitImport(clone) {
  // ── Rename IDs ใน clone เพื่อไม่ชน DOM ต้นฉบับ ──
  const renameMap = {
    'wlt-imp-label'       : 'hm-imp-label',
    'wlt-imp-pk'          : 'hm-imp-pk',
    'wlt-imp-addr-preview': 'hm-imp-addr-preview',
    'wlt-imp-pwd'         : 'hm-imp-pwd',
    'wlt-imp-pwd2'        : 'hm-imp-pwd2',
  };
  Object.entries(renameMap).forEach(([oldId, newId]) => {
    const el = clone.querySelector('#' + oldId);
    if (el) el.id = newId;
  });

  // ── Chain selector: toggle active ภายใน clone ──
  const chainOpts = clone.querySelectorAll('.wlt-chain-opt');
  chainOpts.forEach(el => {
    el.classList.remove('active');
    const m = (el.getAttribute('onclick') || '').match(/wltSelectChainImp\(this,'(\w+)'\)/);
    if (!m) return;
    const chain = m[1];
    el.onclick = function() {
      chainOpts.forEach(o => o.classList.remove('active'));
      this.classList.add('active');
      if (window.wlt) window.wlt.selectedChainImp = chain;
    };
    if (chain === (window.wlt?.selectedChainImp || 'BSC')) el.classList.add('active');
  });

  // ── validate PK: ชี้มาที่ clone IDs ──
  const pkIn      = clone.querySelector('#hm-imp-pk');
  const preview   = clone.querySelector('#hm-imp-addr-preview');
  if (pkIn && preview) {
    pkIn.oninput = function() {
      const pk    = pkIn.value.trim();
      const chain = window.wlt?.selectedChainImp || 'BSC';
      if (!pk) { preview.style.display = 'none'; return; }
      try {
        if (chain === 'BTC') {
          if (typeof window.btcValidateWIF !== 'function' || !window.btcValidateWIF(pk)) { preview.style.display = 'none'; return; }
          const addr = window.btcDeriveAddressFromWIF(pk);
          preview.style.cssText = 'display:block;color:var(--g)';
          preview.textContent = '✅ BTC Address: ' + addr;
        } else if (chain === 'SOL') {
          if (!solValidatePK(pk)) { preview.style.display = 'none'; return; }
          const addr = solDeriveAddressFromPK(pk);
          preview.style.cssText = 'display:block;color:var(--g)';
          preview.textContent = '✅ SOL Address: ' + addr;
        } else {
          if (!pk.startsWith('0x') || pk.length !== 66) { preview.style.display = 'none'; return; }
          const addr = new ethers.Wallet(pk).address;
          preview.style.cssText = 'display:block;color:var(--g)';
          preview.textContent = '✅ Address: ' + addr;
        }
      } catch(e) {
        preview.style.cssText = 'display:block;color:var(--r)';
        preview.textContent = '❌ Private Key ไม่ถูกต้อง';
      }
    };
  }

  // ── Import button: อ่านค่าจาก clone IDs ──
  const btn = clone.querySelector('[onclick*="wltDoImport"]');
  if (btn) {
    btn.onclick = async function() {
      // [FIX] กัน double-click
      if (btn.disabled) return;
      const pk    = clone.querySelector('#hm-imp-pk')?.value.trim();
      const pwd   = clone.querySelector('#hm-imp-pwd')?.value;
      const pwd2  = clone.querySelector('#hm-imp-pwd2')?.value;
      const label = (clone.querySelector('#hm-imp-label')?.value.trim()) || 'Import Wallet';
      if (!pk || !pwd)    { showToast('กรุณากรอก Private Key และ Password'); return; }
      if (pwd !== pwd2)   { showToast('Password ไม่ตรงกัน'); return; }
      const origTxt = btn.textContent;
      btn.disabled = true; btn.textContent = '⏳ กำลัง Import...';
      try {
        let address;
        const chain = window.wlt?.selectedChainImp || 'BSC';
        if (chain === 'BTC') {
          if (!window.btcValidateWIF || !window.btcValidateWIF(pk)) { showToast('❌ Bitcoin WIF ไม่ถูกต้อง (ต้องขึ้นด้วย K, L หรือ 5)'); btn.disabled = false; btn.textContent = origTxt; return; }
          address = window.btcDeriveAddressFromWIF(pk);
        } else if (chain === 'SOL') {
          if (!solValidatePK(pk)) { showToast('❌ Solana PK ไม่ถูกต้อง'); btn.disabled = false; btn.textContent = origTxt; return; }
          address = solDeriveAddressFromPK(pk);
        } else {
          if (!pk.startsWith('0x') || pk.length !== 66) { showToast('❌ EVM PK ไม่ถูกต้อง (0x + 64 hex)'); btn.disabled = false; btn.textContent = origTxt; return; }
          address = new ethers.Wallet(pk).address;
        }
        const { encrypted_pk, iv, salt } = await wltEncryptPK(pk, pwd);
        window.wlt.pendingWallet = {
          label, chain, address,
          mnemonic: chain === 'BTC' ? '(Bitcoin Native SegWit — ไม่มี Mnemonic, ใช้ WIF Private Key restore)' : '(imported — no mnemonic)',
          privateKey: pk, encrypted_pk, iv, salt,
        };
        await wltSaveWallet();
        hmWltOpen('success');
      } catch(e) {
        showToast('❌ Import ไม่สำเร็จ: ' + e.message);
        btn.disabled = false; btn.textContent = origTxt;
      }
    };
  }
}

/* ── init: backup ── */
function _hmWltInitBackup(clone) {
  const pw = window.wlt?.pendingWallet;
  if (!pw) { showToast('ไม่พบข้อมูล Wallet'); return; }

  // ── Rename IDs ใน clone ──
  const renameMap = {
    'wlt-mn-grid'          : 'hm-mn-grid',
    'wlt-mn-sol-note'      : 'hm-mn-sol-note',
    'wlt-pk-display'       : 'hm-pk-display',
    'wlt-c1'               : 'hm-c1',
    'wlt-c2'               : 'hm-c2',
    'wlt-c3'               : 'hm-c3',
    'wlt-confirm-backup-btn': 'hm-confirm-backup-btn',
  };
  Object.entries(renameMap).forEach(([oldId, newId]) => {
    const el = clone.querySelector('#' + oldId);
    if (el) el.id = newId;
  });

  const isSol  = pw.chain === 'SOL';
  const solNote = clone.querySelector('#hm-mn-sol-note');
  if (solNote) solNote.style.display = isSol ? 'inline' : 'none';

  // ── Mnemonic grid ──
  const grid = clone.querySelector('#hm-mn-grid');
  if (grid) {
    if (isSol) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:12px;background:rgba(153,69,255,.08);border:1px solid rgba(153,69,255,.25);border-radius:8px;font-size:12px;color:#9945ff;line-height:1.6"><strong>◎ Solana Wallet</strong><br>ใช้ <strong>Private Key (Base58)</strong> ในการ restore</div>';
    } else {
      const words = (pw.mnemonic || '').split(' ');
      grid.innerHTML = words.map((w, i) =>
        '<div class="wlt-mn-word"><span class="wlt-mn-num">' + (i+1) + '</span><span class="wlt-mn-txt">' + w + '</span></div>'
      ).join('');
    }
  }

  // ── PK display ──
  const pkEl = clone.querySelector('#hm-pk-display');
  if (pkEl) pkEl.textContent = pw.privateKey || '—';

  // ── Copy buttons ──
  clone.querySelectorAll('[onclick*="wltCopyText"]').forEach(el => {
    const m = (el.getAttribute('onclick') || '').match(/wltCopyText\('(\w+)'\)/);
    if (!m) return;
    const key = m[1];
    el.onclick = function() {
      let txt = '';
      if (key === 'mnemonic') txt = pw.mnemonic || '';
      if (key === 'pk')       txt = pw.privateKey || '';
      if (!txt) return;
      navigator.clipboard.writeText(txt).then(() => { if(typeof showToast==='function') showToast('📋 Copied!'); });
    };
  });

  // ── Checkboxes: local state ──
  const checks = { c1: false, c2: false, c3: false };

  function updateConfirmBtn() {
    const btn = clone.querySelector('#hm-confirm-backup-btn');
    if (btn) btn.disabled = !(checks.c1 && checks.c2 && checks.c3);
  }

  clone.querySelectorAll('[onclick*="wltToggleCheck"]').forEach(el => {
    const m = (el.getAttribute('onclick') || '').match(/wltToggleCheck\('(\w+)'\)/);
    if (!m) return;
    const cid = m[1];
    el.onclick = function() {
      checks[cid] = !checks[cid];
      const box = clone.querySelector('#hm-' + cid);
      if (box) box.className = 'wlt-checkbox' + (checks[cid] ? ' checked' : '');
      updateConfirmBtn();
    };
  });

  // ── Confirm button ──
  const btn = clone.querySelector('#hm-confirm-backup-btn');
  if (btn) {
    btn.disabled = true;
    btn.onclick = async function() {
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      try {
        await wltSaveWallet();
        const pkDisplayEl = clone.querySelector('#hm-pk-display');
        if (pkDisplayEl) pkDisplayEl.textContent = '••••••••••••••••••••••••••';
        if (window.wlt?.pendingWallet) window.wlt.pendingWallet.privateKey = null;
        hmWltOpen('success');
      } catch(e) {
        showToast('❌ บันทึกไม่สำเร็จ: ' + e.message);
        btn.disabled = false; btn.textContent = '✅ ยืนยัน — บันทึกครบแล้ว';
      }
    };
  }
}

/* ── init: success ── */
function _hmWltInitSuccess(clone) {
  // pendingWallet อาจถูก clear แล้วหลัง wltSaveWallet() → fallback ไปอ่าน localStorage ล่าสุด
  let pw = window.wlt?.pendingWallet;
  if (!pw) {
    try {
      const wallets = JSON.parse(localStorage.getItem('tcc_wallets_local') || '[]');
      pw = wallets.length ? wallets[wallets.length - 1] : null;
    } catch(e) {}
  }
  if (!pw) return;

  const addrEl  = clone.querySelector('#wlt-success-addr');
  const labelEl = clone.querySelector('#wlt-success-label-display');
  const chainEl = clone.querySelector('#wlt-success-chain-display');
  const qrWrap  = clone.querySelector('#wlt-qr-code');
  if (addrEl)  { addrEl.removeAttribute('id');  addrEl.textContent  = pw.address || '—'; }
  if (labelEl) { labelEl.removeAttribute('id'); labelEl.textContent = pw.label   || 'Wallet'; }
  if (chainEl) { chainEl.removeAttribute('id'); chainEl.textContent = pw.chain   || 'BSC'; }

  // อัปเดต address label และ description ตาม chain
  const isBtcHm = pw.chain === 'BTC';
  const addrLblHm = clone.querySelector('#wlt-success-addr-label');
  const descHm    = clone.querySelector('#wlt-success-desc');
  if (addrLblHm) { addrLblHm.removeAttribute('id'); addrLblHm.textContent = isBtcHm ? 'Bitcoin Address (Native SegWit)' : 'Address (BEP-20)'; }
  if (descHm)    { descHm.removeAttribute('id');    descHm.innerHTML      = isBtcHm
    ? 'ฝาก <strong>BTC</strong> เข้า Address นี้<br>รองรับเฉพาะ Bitcoin Network (Native SegWit · bc1q)'
    : 'ฝาก USDT (BEP-20) เข้า Address นี้<br>เพื่อใช้เป็น Collateral สำหรับ TCC Loan'; }
  if (qrWrap && pw.address) {
    qrWrap.removeAttribute('id'); qrWrap.innerHTML = '';
    try {
      new QRCode(qrWrap, {
        text: pw.address, width: 200, height: 200,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) {
      qrWrap.textContent = pw.address;
    }
  }
  // copy btn
  const addr = pw.address || '';
  const copyBtn = clone.querySelector('[onclick*="wltCopyText"]');
  if (copyBtn) copyBtn.onclick = function() {
    navigator.clipboard.writeText(addr).then(() => {
      if (typeof showToast === 'function') showToast('📋 Copied!');
    });
  };
}

function _hmMktTab(el, key) {
  _hmMktKey = key;
  document.querySelectorAll('.hm-mt').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _hmRenderMkt();
}

function _hmSubTab(key) {
  _hmSubKey = key;
  ['crypto','spot','futures'].forEach(k => {
    const el = document.getElementById('hm-st-' + k);
    if (el) el.classList.toggle('active', k === key);
  });
  _hmRenderMkt();
}

const _HM_COLORS = {
  BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',BNB:'#f0b90b',XRP:'#346aa9',
  ZEC:'#ecb244',ARB:'#12aaff',DOGE:'#c3a634',ADA:'#0033ad',LINK:'#2a5ada',
  AVAX:'#e84142',DOT:'#e6007a',MATIC:'#8247e5',ATOM:'#2e3148',LTC:'#bfbbbb',
  OP:'#ff0420',TON:'#0088cc',TRX:'#ef0027',NEAR:'#00c08b',INJ:'#00b3ff',
};

function _hmFmtPrice(p) {
  if (!p || isNaN(p)) return '–';
  if (p >= 10000) return p.toLocaleString('en-US', {maximumFractionDigits:2});
  if (p >= 1)     return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

function _hmFmtVol(v) {
  if (!v || isNaN(v)) return '–';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function _hmRenderMkt() {
  const list = document.getElementById('hm-mkt-list');
  if (!list) return;

  // Pick data source
  let data = [];
  if (_hmSubKey === 'spot')    data = [...(mktSpotData || [])];
  else if (_hmSubKey === 'all') data = [...(mktData || []), ...(mktSpotData || [])];
  else                          data = [...(mktData || [])];  // crypto/futures

  if (data.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px;"><div class="spin-sm" style="margin:0 auto 8px;"></div>Loading market data…</div>';
    return;
  }

  // Sort by tab
  if      (_hmMktKey === 'vol')     data.sort((a,b) => (b.vol||0) - (a.vol||0));
  else if (_hmMktKey === 'gainers') data.sort((a,b) => (b.chg||0) - (a.chg||0));
  else if (_hmMktKey === 'losers')  data.sort((a,b) => (a.chg||0) - (b.chg||0));
  else if (_hmMktKey === 'new')     data = data.slice(-20).reverse();
  else /* alpha */                  data.sort((a,b) => Math.abs(b.chg||0) - Math.abs(a.chg||0));

  const top5 = data.slice(0, 5);

  // Update column header label based on active tab
  const colLast = document.getElementById('hm-col-last');
  if (colLast) {
    if (_hmMktKey === 'gainers' || _hmMktKey === 'losers' || _hmMktKey === 'alpha') {
      colLast.textContent = 'Chg%';
    } else {
      colLast.textContent = 'Vol(USD)';
    }
  }

  list.innerHTML = top5.map(r => {
    const chg   = r.chg || 0;
    const color = _HM_COLORS[r.coin] || '#7b8fa6';
    const abbr  = (r.coin || '?').substring(0, 3);
    const chgPos = chg >= 0;
    const chgTxt = (chgPos ? '+' : '') + chg.toFixed(2) + '%';
    const chgBg  = chgPos ? 'var(--gbg)' : 'var(--rbg)';
    const chgClr = chgPos ? 'var(--g)'   : 'var(--r)';
    const price  = _hmFmtPrice(r.price);
    const vol    = _hmFmtVol(r.vol);

    // For vol tab: show volume in pill; for gainers/losers/alpha: show % change
    const showVol = (_hmMktKey === 'vol' || _hmMktKey === 'new');
    const pillTxt  = showVol ? vol : chgTxt;
    const pillBg   = showVol ? 'var(--bg4)' : chgBg;
    const pillClr  = showVol ? 'var(--t1)'  : chgClr;

    return `<div class="hm-mkt-row" onclick="navTo('markets')">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="hm-coin-av" style="background:${color}20;border:1px solid ${color}50;color:${color};">${abbr}</div>
        <div>
          <div class="hm-coin-name">${r.coin}</div>
          <div class="hm-coin-vol">Vol ${vol}</div>
        </div>
      </div>
      <div class="hm-price-col">
        <div class="hm-price">${price}</div>
        <div class="hm-price-usd" style="color:${chgPos?'var(--g)':'var(--r)'}">${chgTxt}</div>
      </div>
      <div class="hm-chg-pill" style="background:${pillBg};color:${pillClr};">${pillTxt}</div>
    </div>`;
  }).join('');
}

// Auto-refresh home balance whenever prices update (piggyback on mktData interval)
const _hmOrigRenderMkt = typeof renderMarket === 'function' ? renderMarket : null;

// ══════════════════════════════════════════════════════════════
//  TG PANEL — open / close / toggle
// ══════════════════════════════════════════════════════════════
function openTgPanel() {
  const ov = document.getElementById('tgPanelOverlay');
  const p  = document.getElementById('tgPanel');
  if (ov) ov.style.display = 'block';
  if (p)  p.style.display  = 'block';
}
function closeTgPanel() {
  const ov = document.getElementById('tgPanelOverlay');
  const p  = document.getElementById('tgPanel');
  if (ov) ov.style.display = 'none';
  if (p)  p.style.display  = 'none';
}
function toggleTgPanel() {
  const p = document.getElementById('tgPanel');
  if (p && p.style.display === 'block') closeTgPanel();
  else openTgPanel();
}
function openMobTgPanel() {
  const p = document.getElementById('mobTgPanel');
  if (p) p.style.display = 'block';
}
function closeMobTgPanel() {
  const p = document.getElementById('mobTgPanel');
  if (p) p.style.display = 'none';
}

// ── Init BBO button state on load ──
(function _initBBO() {
  // ต้องรอ DOM พร้อมก่อน
  function _applyBBOInit() {
    const btn = document.getElementById('bboBtn');
    const priceInp = document.getElementById('limitPriceInp');
    if (btn) btn.classList.add('active');
    if (priceInp) priceInp.placeholder = 'BBO - Counterparty 1';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyBBOInit);
  } else {
    setTimeout(_applyBBOInit, 100);
  }
})();


// ══════════════════════════════════════════════════════════════
//  INDICATOR ENGINE — RSI / MACD (compact + fullscreen)
// ══════════════════════════════════════════════════════════════

// State: which indicator is active per chart key ('fut'|'sp'|'cfo')
const _indState = { fut: null, sp: null, cfo: null };

// Toggle RSI / MACD / BB / EMA — same key again → hide
// IND = special: cycle through all indicators or show menu
function _indToggle(key, type) {
  if (type === 'IND') {
    // IND button: if any indicator is active, turn off; else activate RSI
    const prev = _indState[key];
    _indState[key] = prev ? null : 'RSI';
    _indRender(key);
    return;
  }
  const prev = _indState[key];
  _indState[key] = (prev === type) ? null : type;
  _indRender(key);
}

// Map chart key → DOM ids
function _indIds(key) {
  return {
    panel:    document.getElementById(key + 'IndPanel'),
    canvas:   document.getElementById(key + 'IndCanvas'),
    label:    document.getElementById(key + 'IndLabel'),
    val:      document.getElementById(key + 'IndVal'),
    btnIND:   document.getElementById(key + 'IndBtnIND'),
    btnRSI:   document.getElementById(key + 'IndBtnRSI'),
    btnMACD:  document.getElementById(key + 'IndBtnMACD'),
    btnBB:    document.getElementById(key + 'IndBtnBB'),
    btnEMA:   document.getElementById(key + 'IndBtnEMA'),
  };
}

// Get candles for each key
function _indCandles(key) {
  if (key === 'fut' && typeof S !== 'undefined') return S.candles || [];
  if (key === 'sp'  && typeof SP !== 'undefined') return SP.candles || [];
  if (key === 'cfo') return cfoCandles || [];
  return [];
}

// Get visible viewport for each key (viewStart, visCount)
function _indViewport(key) {
  if ((key === 'fut' || key === 'sp') && typeof CHART_PANELS !== 'undefined') {
    const cfg = CHART_PANELS[key === 'fut' ? 'fut' : 'sp'];
    const all = _indCandles(key);
    const vis = cfg.visCount || 80;
    const vs  = cfg.viewStart !== null ? cfg.viewStart : all.length - vis;
    return { vs, vis };
  }
  if (key === 'cfo') {
    const all = cfoCandles || [];
    const vis = CFO.visCount || 80;
    const vs  = CFO.viewStart !== null ? CFO.viewStart : all.length - vis;
    return { vs, vis };
  }
  return { vs: 0, vis: 80 };
}

// ── RSI calculation ──
function _calcRSI(closes, period) {
  if (closes.length < period + 1) return closes.map(() => null);
  const result = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs2);
  }
  return result;
}

// ── EMA helper ──
function _calcEMA(closes, period) {
  const result = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  let started = false;
  let ema = 0;
  for (let i = 0; i < closes.length; i++) {
    if (!started && i >= period - 1) {
      ema = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      result[i] = ema;
      started = true;
    } else if (started) {
      ema = closes[i] * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

// ── MACD calculation ──
function _calcMACD(closes) {
  const ema12 = _calcEMA(closes, 12);
  const ema26 = _calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    (ema12[i] !== null && ema26[i] !== null) ? ema12[i] - ema26[i] : null
  );
  // Signal: EMA9 of macdLine (only over non-null values)
  const signalResult = new Array(closes.length).fill(null);
  const validIdxs = macdLine.map((v, i) => v !== null ? i : -1).filter(i => i >= 0);
  if (validIdxs.length >= 9) {
    const k = 2 / 10;
    let ema = validIdxs.slice(0, 9).reduce((a, i) => a + macdLine[i], 0) / 9;
    signalResult[validIdxs[8]] = ema;
    for (let j = 9; j < validIdxs.length; j++) {
      ema = macdLine[validIdxs[j]] * k + ema * (1 - k);
      signalResult[validIdxs[j]] = ema;
    }
  }
  const histogram = closes.map((_, i) =>
    (macdLine[i] !== null && signalResult[i] !== null) ? macdLine[i] - signalResult[i] : null
  );
  return { macdLine, signalLine: signalResult, histogram };
}

// ── Draw RSI panel ──
function _drawRSI(canvas, all, vs, vis) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 300;
  const H = wrap.clientHeight || 64;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.fillStyle = '#0b0e11';
  c.fillRect(0, 0, W, H);

  const PAD_L = 2, PAD_R = 64, PAD_T = 4, PAD_B = 4;
  const CW = W - PAD_L - PAD_R;
  const CH = H - PAD_T - PAD_B;
  const slotW = CW / vis;

  const closes = all.map(c => c.c);
  const rsi = _calcRSI(closes, 14);

  // Overbought/oversold lines
  [70, 50, 30].forEach(level => {
    const ly = PAD_T + (1 - (level - 0) / 100) * CH;
    c.strokeStyle = level === 50 ? 'rgba(132,142,156,0.2)' : 'rgba(240,185,11,0.25)';
    c.lineWidth = 0.5;
    c.setLineDash(level === 50 ? [] : [3, 3]);
    c.beginPath(); c.moveTo(PAD_L, ly); c.lineTo(W - PAD_R, ly); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(132,142,156,0.5)';
    c.font = '8px Roboto Mono, monospace';
    c.textAlign = 'left';
    c.fillText(level, W - PAD_R + 3, ly + 3);
  });

  // RSI line
  c.beginPath();
  c.strokeStyle = '#7c4dff';
  c.lineWidth = 1.2;
  c.lineJoin = 'round';
  let first = true;
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || rsi[ai] === null) { first = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    const y = PAD_T + (1 - rsi[ai] / 100) * CH;
    if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
  }
  c.stroke();

  // Current RSI value label
  const lastAI = Math.min(all.length - 1, Math.max(0, vs + vis - 1));
  return rsi[lastAI];
}

// ── Draw MACD panel ──
function _drawMACD(canvas, all, vs, vis) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 300;
  const H = wrap.clientHeight || 64;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.fillStyle = '#0b0e11';
  c.fillRect(0, 0, W, H);

  const PAD_L = 2, PAD_R = 64, PAD_T = 4, PAD_B = 4;
  const CW = W - PAD_L - PAD_R;
  const CH = H - PAD_T - PAD_B;
  const slotW = CW / vis;

  const closes = all.map(c => c.c);
  const { macdLine, signalLine, histogram } = _calcMACD(closes);

  // Collect visible values to scale Y
  const visVals = [];
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length) continue;
    if (histogram[ai] !== null) visVals.push(histogram[ai]);
    if (macdLine[ai]  !== null) visVals.push(macdLine[ai]);
    if (signalLine[ai] !== null) visVals.push(signalLine[ai]);
  }
  if (!visVals.length) return null;
  const maxAbs = Math.max(Math.abs(Math.min(...visVals)), Math.abs(Math.max(...visVals))) || 1;
  const toY = v => PAD_T + (1 - (v + maxAbs) / (2 * maxAbs)) * CH;

  // Zero line
  const zy = toY(0);
  c.strokeStyle = 'rgba(132,142,156,0.25)';
  c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(PAD_L, zy); c.lineTo(W - PAD_R, zy); c.stroke();

  // Histogram bars
  const barW = Math.max(1, slotW * 0.6);
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || histogram[ai] === null) continue;
    const x = PAD_L + (slot + 0.5) * slotW;
    const isPos = histogram[ai] >= 0;
    c.fillStyle = isPos ? 'rgba(14,203,129,0.7)' : 'rgba(246,70,93,0.7)';
    const yTop = isPos ? toY(histogram[ai]) : zy;
    const yBot = isPos ? zy : toY(histogram[ai]);
    c.fillRect(x - barW / 2, yTop, barW, Math.max(1, yBot - yTop));
  }

  // MACD line
  c.beginPath(); c.strokeStyle = '#2196f3'; c.lineWidth = 1.2; c.lineJoin = 'round';
  let f1 = true;
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || macdLine[ai] === null) { f1 = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    if (f1) { c.moveTo(x, toY(macdLine[ai])); f1 = false; } else c.lineTo(x, toY(macdLine[ai]));
  }
  c.stroke();

  // Signal line
  c.beginPath(); c.strokeStyle = '#ff9800'; c.lineWidth = 1.0; c.lineJoin = 'round';
  let f2 = true;
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || signalLine[ai] === null) { f2 = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    if (f2) { c.moveTo(x, toY(signalLine[ai])); f2 = false; } else c.lineTo(x, toY(signalLine[ai]));
  }
  c.stroke();

  const lastAI = Math.min(all.length - 1, Math.max(0, vs + vis - 1));
  return macdLine[lastAI];
}

// ── Bollinger Bands panel (20-period SMA ± 2σ displayed as panel) ──
function _drawBB(canvas, all, vs, vis) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 300;
  const H = wrap.clientHeight || 64;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.fillStyle = '#0b0e11';
  c.fillRect(0, 0, W, H);

  const PAD_L = 2, PAD_R = 64, PAD_T = 4, PAD_B = 4;
  const CW = W - PAD_L - PAD_R;
  const CH = H - PAD_T - PAD_B;
  const slotW = CW / vis;
  const period = 20, mult = 2;

  const closes = all.map(c => c.c);
  // Calculate SMA20, upper, lower
  const sma = new Array(closes.length).fill(null);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  const bw = new Array(closes.length).fill(null); // bandwidth for oscillator panel
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    sma[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
    bw[i] = sd * 2 / mean * 100; // %B bandwidth
  }

  // Show %B oscillator (0–1 range, >1=above upper, <0=below lower)
  const pctB = closes.map((cl, i) => {
    if (upper[i] === null || lower[i] === null || upper[i] === lower[i]) return null;
    return (cl - lower[i]) / (upper[i] - lower[i]);
  });

  // Scale to panel height
  const vals = pctB.slice(vs, vs + vis).filter(v => v !== null);
  const minV = Math.max(-0.5, Math.min(...vals, 0));
  const maxV = Math.min(1.5, Math.max(...vals, 1));
  const range = maxV - minV || 1;
  const toY = v => PAD_T + (1 - (v - minV) / range) * CH;

  // Reference lines
  [[1, '#f6465d'], [0.5, 'rgba(132,142,156,0.3)'], [0, '#0ecb81']].forEach(([lv, clr]) => {
    const ly = toY(lv);
    c.strokeStyle = clr; c.lineWidth = 0.5; c.setLineDash(lv === 0.5 ? [] : [3,3]);
    c.beginPath(); c.moveTo(PAD_L, ly); c.lineTo(W - PAD_R, ly); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(132,142,156,0.5)'; c.font = '8px Roboto Mono,monospace'; c.textAlign = 'left';
    c.fillText(lv === 1 ? 'UB' : lv === 0 ? 'LB' : '50%', W - PAD_R + 3, ly + 3);
  });

  // %B fill
  c.beginPath();
  let first = true;
  const pts = [];
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || pctB[ai] === null) { first = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    const y = toY(pctB[ai]);
    pts.push([x, y]);
    if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
  }
  c.strokeStyle = '#5b9cfe'; c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();

  // Label
  const lastAI2 = Math.min(all.length - 1, Math.max(0, vs + vis - 1));
  const lastPct = pctB[lastAI2];
  if (lastPct !== null) {
    c.fillStyle = '#5b9cfe'; c.font = 'bold 9px Roboto Mono,monospace'; c.textAlign = 'left';
    c.fillText(lastPct.toFixed(2), W - PAD_R + 3, PAD_T + 10);
    c.fillStyle = 'rgba(91,156,254,0.4)'; c.font = '8px Roboto Mono,monospace';
    c.fillText('%B', W - PAD_R + 3, PAD_T + 22);
  }
  return lastPct;
}

// ── EMA Panel (9/21/55 separation — spread between fast/slow) ──
function _drawEMAPanel(canvas, all, vs, vis) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 300;
  const H = wrap.clientHeight || 64;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.fillStyle = '#0b0e11';
  c.fillRect(0, 0, W, H);

  const PAD_L = 2, PAD_R = 64, PAD_T = 4, PAD_B = 4;
  const CW = W - PAD_L - PAD_R;
  const CH = H - PAD_T - PAD_B;
  const slotW = CW / vis;

  const closes = all.map(c => c.c);
  const ema9  = _calcEMA(closes, 9);
  const ema21 = _calcEMA(closes, 21);
  const ema55 = _calcEMA(closes, 55);

  // Spread panel: ema9 - ema55 (normalized to show divergence)
  const spread = closes.map((_, i) =>
    (ema9[i] !== null && ema55[i] !== null) ? ema9[i] - ema55[i] : null
  );

  const vals = spread.slice(vs, vs + vis).filter(v => v !== null);
  if (!vals.length) return null;
  const absMax = Math.max(...vals.map(Math.abs), 0.0001);
  const toY = v => PAD_T + (1 - (v + absMax) / (2 * absMax)) * CH;
  const zy = toY(0);

  // Zero line
  c.strokeStyle = 'rgba(132,142,156,0.3)'; c.lineWidth = 0.5; c.setLineDash([]);
  c.beginPath(); c.moveTo(PAD_L, zy); c.lineTo(W - PAD_R, zy); c.stroke();

  // Fill bars (spread histogram)
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || spread[ai] === null) continue;
    const x = PAD_L + (slot + 0.5) * slotW;
    const barW = Math.max(1, slotW * 0.7);
    const isPos = spread[ai] >= 0;
    c.fillStyle = isPos ? 'rgba(14,203,129,0.55)' : 'rgba(246,70,93,0.55)';
    const y0 = isPos ? toY(spread[ai]) : zy;
    const y1 = isPos ? zy : toY(spread[ai]);
    c.fillRect(x - barW / 2, y0, barW, Math.max(1, y1 - y0));
  }

  // EMA spread line (smoothed)
  c.beginPath(); c.strokeStyle = '#f0b90b'; c.lineWidth = 1.2; c.lineJoin = 'round';
  let f = true;
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || spread[ai] === null) { f = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    if (f) { c.moveTo(x, toY(spread[ai])); f = false; } else c.lineTo(x, toY(spread[ai]));
  }
  c.stroke();

  // EMA fast-medium diff line
  const spread2 = closes.map((_, i) =>
    (ema9[i] !== null && ema21[i] !== null) ? (ema9[i] - ema21[i]) / absMax * absMax : null
  );
  c.beginPath(); c.strokeStyle = 'rgba(33,150,243,0.7)'; c.lineWidth = 0.8;
  f = true;
  for (let slot = 0; slot < vis; slot++) {
    const ai = vs + slot;
    if (ai < 0 || ai >= all.length || spread2[ai] === null) { f = true; continue; }
    const x = PAD_L + (slot + 0.5) * slotW;
    if (f) { c.moveTo(x, toY(spread2[ai])); f = false; } else c.lineTo(x, toY(spread2[ai]));
  }
  c.stroke();

  // Labels
  const lastAI3 = Math.min(all.length - 1, Math.max(0, vs + vis - 1));
  const e9 = ema9[lastAI3], e21 = ema21[lastAI3], e55 = ema55[lastAI3];
  let y = PAD_T + 10;
  c.font = 'bold 8px Roboto Mono,monospace'; c.textAlign = 'left';
  [['9', '#f0b90b', e9], ['21', '#2196f3', e21], ['55', '#9c27b0', e55]].forEach(([lbl, clr, v]) => {
    if (v !== null) {
      c.fillStyle = clr;
      c.fillText('E' + lbl + ':' + v.toFixed(2), W - PAD_R + 3, y);
      y += 12;
    }
  });
  return e9 !== null && e55 !== null ? e9 - e55 : null;
}

// ── Main render for a chart key ──
function _indRender(key) {
  const ids = _indIds(key);
  const type = _indState[key];

  // Update button styles
  const anyActive = !!type;
  if (ids.btnIND)  ids.btnIND.classList.toggle('active',  anyActive);
  if (ids.btnRSI)  ids.btnRSI.classList.toggle('active',  type === 'RSI');
  if (ids.btnMACD) ids.btnMACD.classList.toggle('active', type === 'MACD');
  if (ids.btnBB)   ids.btnBB.classList.toggle('active',   type === 'BB');
  if (ids.btnEMA)  ids.btnEMA.classList.toggle('active',  type === 'EMA');

  if (!type) {
    // Hide panel
    if (ids.panel) ids.panel.style.display = 'none';
    return;
  }

  // Show panel
  if (ids.panel) ids.panel.style.display = 'block';
  if (!ids.canvas) return;

  const all = _indCandles(key);
  if (!all || all.length < 30) return;
  const { vs, vis } = _indViewport(key);

  if (type === 'RSI') {
    if (ids.label) ids.label.textContent = 'RSI(14)';
    const val = _drawRSI(ids.canvas, all, vs, vis);
    if (ids.val && val !== null) {
      const v = parseFloat(val).toFixed(1);
      ids.val.textContent = v;
      ids.val.style.color = val >= 70 ? '#f6465d' : val <= 30 ? '#0ecb81' : '#848e9c';
    }
  } else if (type === 'MACD') {
    if (ids.label) ids.label.textContent = 'MACD(12,26,9)';
    const val = _drawMACD(ids.canvas, all, vs, vis);
    if (ids.val && val !== null) {
      ids.val.textContent = parseFloat(val).toFixed(4);
      ids.val.style.color = val >= 0 ? '#0ecb81' : '#f6465d';
    }
  } else if (type === 'BB') {
    if (ids.label) ids.label.textContent = 'BB(20,2)';
    const val = _drawBB(ids.canvas, all, vs, vis);
    if (ids.val && val !== null) {
      ids.val.textContent = parseFloat(val).toFixed(2);
      ids.val.style.color = '#5b9cfe';
    }
  } else if (type === 'EMA') {
    if (ids.label) ids.label.textContent = 'EMA(9,21,55)';
    const val = _drawEMAPanel(ids.canvas, all, vs, vis);
    if (ids.val && val !== null) {
      ids.val.textContent = parseFloat(val).toFixed(4);
      ids.val.style.color = '#f0b90b';
    }
  }
}

// ── Hook into existing draw calls to keep indicators in sync ──
(function _patchDrawsForIndicators() {
  const _origDrawChart = drawChart;
  window.drawChart = function() {
    _origDrawChart.apply(this, arguments);
    if (_indState.fut) _indRender('fut');
  };
  const _origDrawSpChart = drawSpChart;
  window.drawSpChart = function() {
    _origDrawSpChart.apply(this, arguments);
    if (_indState.sp) _indRender('sp');
  };
  const _origDrawCfoChart = drawCfoChart;
  window.drawCfoChart = function() {
    _origDrawCfoChart.apply(this, arguments);
    if (_indState.cfo) _indRender('cfo');
  };
})();


window._mainScriptReady = true;
(window._earlyQueue || []).forEach(([fn, args]) => {
  if (typeof window[fn] === 'function') window[fn].apply(null, args);
});
window._earlyQueue = [];

// ── Auto-refresh home page when prices tick ──
setInterval(() => {
  if (currentPage === 'home') _hmRefreshBalance();
}, 5000);

// [v3.2 MESSAGES] Poll unread message badge ทุก 30s (ไม่ผูกกับหน้าใดหน้าหนึ่ง — badge อยู่ top bar เสมอ)
setInterval(() => {
  if (typeof msgRefreshBadge === 'function') msgRefreshBadge();
}, 30000);

// ══════════════════════════════════════════════════════════════
//  USER PROFILE — Dummy data, connect to backend later
// ══════════════════════════════════════════════════════════════
const USER_PROFILE = {
  uid:         '',
  username:    '',
  avatar:      null,          // URL string or null
  regEmail:    '',
  // [AUTH] Member fields — โหลดจาก Members Sheet ผ่าน autoLoginFromMembers()
  team:          '',           // ชื่อ Team เช่น "Star Cafe", "Mirin Coffee"
  walletAddress: '',           // 0x... Blockchain address
  memberStatus:  '',           // 'Trading&payments' | 'Pending' | ...
  phone:         '',
  province:      '',
  referrerId:    '',
  qrCode:        '',
  _memberLoaded: false,        // flag: true หลัง autoLogin โหลดสำเร็จ
  vipLevel:    0,             // 0=Regular, 1=VIP1 ...
  verified:    false,
  twitterLinked: false,
  // Verification
  country:     '',
  legalName:   '',
  dob:         '',
  idType:      '',
  idNumber:    '',
  address:     '',
  // Account limits
  fiatLimit:   '',
  cryptoDeposit: '',
  cryptoWithdraw: '',
  p2pLimit:    '',
};

// ── Sync USER_PROFILE → SHARE_PROFILE avatar when profile updated ──


// ══════════════════════════════════════════════════════════════════
//  [AUTH v3] TCC LOGIN ENGINE — NocoDB via Cloudflare Worker
//  ย้ายจาก index_TCC_main.html (TC flow + tcHash)
//  ──────────────────────────────────────────────────────────────
//  ฐานข้อมูล : NocoDB [Members table] ผ่าน Cloudflare Worker (DB1)
//              PasswordHash อยู่ใน [Applications table] DB1 — ใช้ร่วมกับ TCC_Database
//
//  Flow:
//    initSplash() → ตรวจ localStorage
//      ├─ พบ savedSession (BNB ID + hash ครบ) → navTo('futures')
//      └─ ไม่พบ → navTo('login') → lgRender() step 1
//
//    Step 1: BNB ID → ค้นใน MEMBERS[] จาก Worker DB1
//                   + ดึง Applications record เพื่อเอา PasswordHash
//    Step 2: Phone  → เทียบ member['Phone'] ฝั่ง client
//    Step 3: Pass   → tcHash(SHA-256) เทียบกับ PasswordHash ใน Applications DB1
//              ├─ มี PasswordHash → เทียบ hash → Login สำเร็จ
//              ├─ ไม่มี PasswordHash + ไม่มี appId → POST สร้าง Applications record ใหม่
//              ├─ ไม่มี PasswordHash + มี appId → PATCH PasswordHash ลง Applications
//              └─ ผ่านทุกขั้น → session เดียวกับ TCC_Database → navTo('futures')
// ══════════════════════════════════════════════════════════════════

// ── Worker URL (NocoDB proxy) ──
const WORKER_URL = 'https://tradercafeclub.tradercafeclub.workers.dev';

// ── Member cache (in-memory + sessionStorage) ──
let MEMBERS = [];
const SS_MEMBERS = 'tcc_ss_members';
const SS_TTL_MS  = 10 * 60 * 1000; // 10 นาที

function _ssMembSet(d) {
  try { sessionStorage.setItem(SS_MEMBERS, JSON.stringify({ d, t: Date.now() })); } catch(e) {}
}
function _ssMembGet() {
  try {
    const r = sessionStorage.getItem(SS_MEMBERS);
    if (!r) return null;
    const o = JSON.parse(r);
    if (Date.now() - o.t > SS_TTL_MS) { sessionStorage.removeItem(SS_MEMBERS); return null; }
    return o.d;
  } catch(e) { return null; }
}

// ── ndbFetch — GET /api/{table} ผ่าน Worker ──
async function ndbFetch(table, params = {}, _retry = 0) {
  const url = new URL(`${WORKER_URL}/api/${table}`);
  url.searchParams.set('limit', params.limit || 100);
  if (params.sort)   url.searchParams.set('sort',   params.sort);
  if (params.offset) url.searchParams.set('offset', params.offset || 0);
  if (params.where)  url.searchParams.set('where',  params.where);
  const res = await fetch(url.toString());
  if (res.status === 429 && _retry < 3) {
    await new Promise(r => setTimeout(r, (2 ** _retry) * 2000));
    return ndbFetch(table, params, _retry + 1);
  }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `API ${res.status}`); }
  return res.json();
}

// ── ndbFetchAll — paginate จนครบ ──
async function ndbFetchAll(table, params = {}) {
  const PAGE = 100;
  let all = [], offset = 0;
  while (true) {
    const d = await ndbFetch(table, { ...params, limit: PAGE, offset });
    const rows = d.list || d.data?.list || [];
    const info = d.pageInfo || d.data?.pageInfo || {};
    all = all.concat(rows);
    const total = info.totalRows || info.total || 0;
    if (rows.length < PAGE || (total > 0 && all.length >= total) || rows.length === 0) break;
    offset += PAGE;
    if (offset >= 2000) break; // safety cap
  }
  return all;
}

// ── loadMembers — โหลด MEMBERS[] ครั้งแรกหรือ force refresh ──
async function loadMembers(force = false) {
  if (!force) {
    const c = _ssMembGet();
    if (c && c.length) { MEMBERS = c; return; }
  }
  const records = await ndbFetchAll('members');
  MEMBERS = records;
  _ssMembSet(records);
}

// ── memVal — map NocoDB field → friendly key ──
function memVal(m, f) {
  const M = {
    'id':       m['BNB_ID'],
    'name':     m['Name'],
    'team':     m['Team'],
    'wallet':   m['Address Wallet'],
    'status':   m['Status'],
    'qr':       m['QR Code'],
    'lva':      m['Level A'],
    'lvb':      m['Level B'],
    'referrer': m['ReferrerId'],
    'phone':    m['Phone'],
    'passhash': m['PasswordHash'],
  };
  const v = M[f];
  return (v === undefined || v === null) ? '' : String(v);
}

// ── tcHash — SHA-256 ──
async function tcHash(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

// ── normPhone — ตัดศูนย์นำหน้า + เก็บเฉพาะตัวเลข ──
const normPhone = s => (s || '').replace(/[^0-9]/g, '').replace(/^0+/, '');

// ── LG State ──
const LG = {
  step: 1,
  member: null,       // NocoDB Members record
  appRow: null,       // NocoDB Applications record (มี PasswordHash)
  appId:  null,       // Applications row Id สำหรับ PATCH
  isNewPassword: false,
  _attempts: 0,
  _lockUntil: 0,
};
const LG_SESSION_KEY = 'tcc_login_session';
const LG_REMEMBER_KEY = 'tcc_remember_me';

// ── Session helpers ──
function _lgSaveSession(member, passHash, remember) {
  const data = {
    uid:           memVal(member, 'id'),
    passHash:      passHash,
    username:      memVal(member, 'name'),
    team:          memVal(member, 'team'),
    phone:         memVal(member, 'phone'),
    walletAddress: memVal(member, 'wallet'),
    memberStatus:  memVal(member, 'status'),
    qrCode:        memVal(member, 'qr'),
    savedAt:       Date.now(),
  };
  try {
    localStorage.setItem(LG_SESSION_KEY, JSON.stringify(data));
    localStorage.setItem('tcc_uid', data.uid);
    if (remember) localStorage.setItem(LG_REMEMBER_KEY, '1');
    else          localStorage.removeItem(LG_REMEMBER_KEY);
  } catch(e) {}
}
function _lgGetRemember() {
  try { return localStorage.getItem(LG_REMEMBER_KEY) === '1'; } catch(e) { return false; }
}
function _lgLoadSession() {
  try {
    const raw = localStorage.getItem(LG_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.uid || !data.passHash) return null;
    const ttl = _lgGetRemember() ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (Date.now() - (data.savedAt || 0) > ttl) {
      localStorage.removeItem(LG_SESSION_KEY);
      localStorage.removeItem('tcc_uid');
      localStorage.removeItem(LG_REMEMBER_KEY);
      return null;
    }
    return data;
  } catch(e) { return null; }
}
function _lgClearSession() {
  try {
    localStorage.removeItem(LG_SESSION_KEY);
    localStorage.removeItem('tcc_uid');
    localStorage.removeItem(LG_REMEMBER_KEY);
  } catch(e) {}
  LG.step = 1; LG.member = null; LG.appRow = null; LG.appId = null; LG.isNewPassword = false;
  LG._attempts = 0; LG._lockUntil = 0;
  USER_PROFILE.uid = ''; USER_PROFILE.username = 'Member';
  USER_PROFILE.team = ''; USER_PROFILE.walletAddress = '';
  USER_PROFILE.memberStatus = '';
  navTo('login');
}

// ── Render ──
function lgRender() {
  const root = document.getElementById('lg-flow-root');
  if (!root) return;
  switch (LG.step) {
    case 1: root.innerHTML = lgS1(); break;
    case 2: root.innerHTML = lgS2(); break;
    case 3: root.innerHTML = lgS3(); break;
  }
  // [i18n] re-apply language after re-render so data-i18n elements update
  if (typeof tccApplyLang === 'function') tccApplyLang();
}

// ── Step bar ──
function lgBar(cur) {
  const steps = [{ n: 1, l: tccT('step_lbl_bnbid') }, { n: 2, l: tccT('step_lbl_verify') }, { n: 3, l: tccT('step_lbl_password') }];
  let h = '<div class="lg-step-bar">';
  steps.forEach((s, i) => {
    const c = cur > s.n ? 's-done' : cur === s.n ? 's-active' : '';
    h += `<div class="lg-step ${c}"><div class="lg-step-dot">${cur > s.n ? '✓' : s.n}</div><div class="lg-step-lbl">${s.l}</div></div>`;
    if (i < steps.length - 1) h += `<div class="lg-step-line ${cur > s.n ? 'done' : ''}"></div>`;
  });
  return h + '</div>';
}

// ── Action bar ──
function lgBarShow(type, msg) {
  const root = document.getElementById('lg-flow-root');
  if (!root) return;
  let old = root.querySelector('.lg-action-bar');
  if (old) old.remove();
  const bar = document.createElement('div');
  bar.className = 'lg-action-bar lg-bar-' + type;
  const iconMap = { loading: '⏳', success: '✅', error: '❌', warn: '⚠️' };
  if (type === 'loading') {
    bar.innerHTML = `<div class="lg-bar-spin"></div><div class="lg-bar-title">${msg}</div>`;
  } else {
    bar.innerHTML = `<span>${iconMap[type]||'•'}</span><div class="lg-bar-title">${msg}</div><button class="lg-bar-close" onclick="this.closest('.lg-action-bar').remove()">✕</button>`;
    const dur = type === 'success' ? 4000 : type === 'warn' ? 6000 : 8000;
    setTimeout(() => { if (bar.parentNode) bar.remove(); }, dur);
  }
  root.prepend(bar);
}
function lgBarRemove() {
  const root = document.getElementById('lg-flow-root');
  if (root) { const b = root.querySelector('.lg-action-bar'); if (b) b.remove(); }
}
function lgErr(el, msg) {
  if (el) { el.textContent = msg; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 4500); }
}
function lgBack() {
  if (LG.step > 1) { LG.step--; LG.isNewPassword = false; lgRender(); }
}

// ── Step 1: BNB ID ──
function lgS1() {
  return `${lgBar(1)}
  <div class="lg-card">
    <div class="lg-card-ttl"><span data-i18n="member_step1">${tccT('member_step1')}</span></div>
    <div class="lg-grp"><label class="lg-lbl"><span data-i18n="bnbid_label">${tccT('bnbid_label')}</span></label>
      <input class="lg-inp" id="lg-bnbid" data-i18n-placeholder="bnbid_placeholder" placeholder="${tccT('bnbid_placeholder')}" maxlength="40"
        onkeydown="if(event.key==='Enter')lgS1go()">
      <div class="lg-err" id="lg-e1"></div>
    </div>
    <button class="lg-btn lg-btn-gold" onclick="lgS1go()"><span data-i18n="search_member">${tccT('search_member')}</span></button>
    <div class="lg-lang-bar">
      ${['th','en','vi','kh','mm'].map(l=>`<button class="lg-lang-opt tcc-lang-opt${tccGetLang()===l?' active':''}" data-lang="${l}" onclick="tccSetLang('${l}');lgRender();">${{th:'TH',en:'EN',vi:'VI',kh:'KH',mm:'MM'}[l]}</button>`).join('')}
    </div>
  </div>`;
}
async function lgS1go() {
  const inp = document.getElementById('lg-bnbid'), err = document.getElementById('lg-e1');
  if (!inp) return;
  const v = inp.value.trim();
  if (!v) { lgErr(err, tccT('bnbid_error_empty')); return; }
  inp.disabled = true;
  lgBarShow('loading', tccT('loading_members'));

  // โหลด MEMBERS[] ถ้ายังไม่มี
  if (!MEMBERS || !MEMBERS.length) {
    try {
      await loadMembers();
    } catch(e) {
      inp.disabled = false;
      lgBarShow('error', tccT('db_connect_fail'));
      return;
    }
  }

  // รอ MEMBERS โหลดครบ (max 15s)
  let w = 0;
  while ((!MEMBERS || !MEMBERS.length) && w < 30) {
    await new Promise(r => setTimeout(r, 500)); w++;
  }
  if (!MEMBERS || !MEMBERS.length) {
    inp.disabled = false;
    lgBarShow('error', tccT('db_load_fail'));
    return;
  }

  const found = MEMBERS.find(m => memVal(m, 'id').toLowerCase() === v.toLowerCase());
  if (!found) {
    inp.disabled = false;
    lgBarShow('error', `${tccT('member_not_found')} (${v})`);
    return;
  }
  LG.member = found;

  // ── ดึง Applications record เพื่อเอา PasswordHash ──
  lgBarShow('loading', tccT('loading_verify_app'));
  try {
    const appRes = await ndbFetch('applications', {
      where: `(BNB_ID,eq,${v})`,
      limit: 10,
    });
    const apps = appRes.list || appRes.data?.list || (Array.isArray(appRes) ? appRes : []);
    // เลือก Trader app ก่อน, ถ้าไม่มีใช้รายการแรก
    LG.appRow = apps.find(r => (r.DesiredPosition || '') === 'เทรดเดอร์') || apps[0] || null;
    LG.appId  = LG.appRow ? (LG.appRow.Id || LG.appRow.id || null) : null;
  } catch(e) {
    LG.appRow = null;
    LG.appId  = null;
  }

  LG.isNewPassword = !(LG.appRow && LG.appRow.PasswordHash);
  lgBarRemove();
  LG.step = 2;
  lgRender();
}

// ── Step 2: Phone ──
function lgS2() {
  const m = LG.member;
  const name = memVal(m, 'name');
  const masked = name.length > 2
    ? name[0] + '*'.repeat(Math.max(1, name.length - 2)) + name[name.length - 1]
    : name;
  return `${lgBar(2)}
  <div class="lg-card">
    <div class="lg-card-ttl"><span data-i18n="verify_step2">${tccT('verify_step2')}</span></div>
    <div class="lg-mem-banner">
      <div class="lg-mem-av">${(name || '?')[0].toUpperCase()}</div>
      <div>
        <div class="lg-mem-name">${masked}</div>
        <div class="lg-mem-sub">${tccT('mem_sub_team')}: ${memVal(m, 'team') || '—'} &nbsp;|&nbsp; ID: ${memVal(m, 'id')}</div>
      </div>
    </div>
    <div class="lg-grp"><label class="lg-lbl"><span data-i18n="phone_reg">${tccT('phone_reg')}</span></label>
      <input class="lg-inp" id="lg-phone" type="tel" placeholder="0812345678" maxlength="20"
        onkeydown="if(event.key==='Enter')lgS2go()">
      <div class="lg-err" id="lg-e2"></div>
    </div>
    <button class="lg-btn lg-btn-gold" onclick="lgS2go()"><span data-i18n="verify_now">${tccT('verify_now')}</span></button>
    <button class="lg-btn lg-btn-out" onclick="lgBack()"><span data-i18n="back">${tccT('back')}</span></button>
  </div>`;
}
function lgS2go() {
  const inp = document.getElementById('lg-phone'), err = document.getElementById('lg-e2');
  if (!inp) return;
  const v = inp.value.trim().replace(/[^0-9]/g, '');
  if (!v || v.length < 9) { lgErr(err, tccT('phone_err_invalid')); return; }
  const stored = normPhone(memVal(LG.member, 'phone'));
  const entered = normPhone(v);
  if (!stored) { lgErr(err, tccT('phone_err_notfound')); return; }
  if (entered !== stored) { lgErr(err, tccT('phone_err_mismatch')); return; }
  LG.step = 3;
  lgRender();
}

// ── Step 3: Password ──
function lgS3() {
  const hp = LG.appRow && LG.appRow.PasswordHash ? LG.appRow.PasswordHash : null;
  return `${lgBar(3)}
  <div class="lg-card">
    <div class="lg-card-ttl">${hp ? tccT('lg3_title_login') : tccT('lg3_title_setpw')}</div>
    <p style="font-size:.79rem;color:var(--t3);margin-bottom:14px;">
      ${hp ? tccT('lg3_hint_login') : tccT('lg3_hint_setpw')}
    </p>
    <div class="lg-grp"><label class="lg-lbl">${hp ? tccT('pw_label') : tccT('pw_new_label')}</label>
      <div class="lg-pw-wrap">
        <input class="lg-inp" id="lg-pass" type="password" placeholder="••••••••" maxlength="64"
          onkeydown="if(event.key==='Enter')lgS3go()">
        <button class="lg-pw-eye" onclick="lgToggleEye('lg-pass',this)" type="button">👁</button>
      </div>
      <div class="lg-err" id="lg-e3"></div>
    </div>
    ${!hp ? `<div class="lg-grp"><label class="lg-lbl"><span data-i18n="confirm_password">${tccT('confirm_password')}</span></label>
      <div class="lg-pw-wrap">
        <input class="lg-inp" id="lg-pass2" type="password" placeholder="••••••••" maxlength="64"
          onkeydown="if(event.key==='Enter')lgS3go()">
        <button class="lg-pw-eye" onclick="lgToggleEye('lg-pass2',this)" type="button">👁</button>
      </div></div>` : ''}
    <div class="lg-chk-row" style="margin-bottom:14px;">
      <input type="checkbox" id="lg-remember">
      <label for="lg-remember" style="font-size:.8rem;color:var(--t2);"><span data-i18n="remember_login">${tccT('remember_login')}</span></label>
    </div>
    <button class="lg-btn lg-btn-gold" onclick="lgS3go()">${hp ? tccT('lg3_btn_login') : tccT('lg3_btn_setpw')}</button>
    <button class="lg-btn lg-btn-out" onclick="lgBack()"><span data-i18n="back">${tccT('back')}</span></button>
  </div>`;
}
function lgToggleEye(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁' : '🙈';
}
async function lgS3go() {
  // Rate limit check
  if (Date.now() < LG._lockUntil) {
    const mins = Math.ceil((LG._lockUntil - Date.now()) / 60000);
    lgBarShow('error', `${tccT('locked_wait')} ${mins} ${tccT('locked_minutes')}`);
    return;
  }
  const inp = document.getElementById('lg-pass'), err = document.getElementById('lg-e3');
  if (!inp) return;
  const pass = inp.value;
  if (pass.length < 6) { lgErr(err, tccT('pw_error_short')); return; }

  // ── PasswordHash อยู่ใน Applications table (LG.appRow) ──
  const hp = LG.appRow && LG.appRow.PasswordHash ? LG.appRow.PasswordHash : null;
  const hash = await tcHash(pass);
  const remember = document.getElementById('lg-remember')?.checked || false;

  if (hp) {
    // มีรหัสผ่านแล้ว — ตรวจสอบ
    if (hash !== hp) {
      LG._attempts++;
      if (LG._attempts >= 5) {
        LG._lockUntil = Date.now() + 15 * 60 * 1000;
        LG._attempts = 0;
        lgBarShow('error', '🔒 กรอกผิด 5 ครั้ง ถูกล็อค 15 นาที');
      } else {
        lgBarShow('error', `❌ ${tccT('pw_error_wrong')} ${tccTF('pw_attempts_left',{n:5-LG._attempts})}`);
      }
      return;
    }
  } else {
    // ตั้งรหัสผ่านใหม่ — ต้องยืนยัน + บันทึกใน Applications
    const inp2 = document.getElementById('lg-pass2');
    if (inp2 && inp2.value !== pass) { lgErr(err, tccT('pw_error_mismatch')); return; }
    lgBarShow('loading', tccT('setting_pw_loading'));
    try {
      if (!LG.appId) {
        // สมาชิกที่ยังไม่มี applications record → สร้างใหม่พร้อม PasswordHash
        // [FIX] DesiredPosition ต้องเป็น 'ลงทะเบียน' (ไม่ใช่ 'เทรดเดอร์')
        //       เพื่อไม่ให้ TC flow มองว่ามีใบสมัครเทรดเดอร์อยู่แล้ว (ซึ่งจะทำให้กรอกใบสมัครไม่ได้)
        const _now = new Date().toISOString();
        const res = await fetch(`${WORKER_URL}/api/applications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Title:           'REG-' + memVal(LG.member, 'id'),
            BNB_ID:          memVal(LG.member, 'id'),
            MemberName:      memVal(LG.member, 'name'),
            Phone:           memVal(LG.member, 'phone'),
            Team:            memVal(LG.member, 'team'),
            DesiredPosition: 'ลงทะเบียน',   // ไม่ใช่ใบสมัครเทรดเดอร์ — แค่บันทึก PasswordHash
            Status:          'Pending',
            PasswordHash:    hash,
            SubmittedAt:     _now,
            UpdatedAt:       _now,
          }),
        });
        if (!res.ok) throw new Error('บันทึกรหัสผ่านไม่สำเร็จ (' + res.status + ')');
        const created = await res.json();
        LG.appRow = created;
        LG.appId  = created.Id || created.id || null;
        if (LG.appRow) LG.appRow.PasswordHash = hash;
      } else {
        // สมาชิกที่มี applications record แล้ว → PATCH PasswordHash
        const res = await fetch(`${WORKER_URL}/api/applications/${LG.appId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ PasswordHash: hash }),
        });
        if (!res.ok) throw new Error('บันทึกรหัสผ่านไม่สำเร็จ (' + res.status + ')');
        LG.appRow.PasswordHash = hash;
      }
    } catch(e) {
      lgBarShow('error', '❌ ' + e.message);
      return;
    }
  }

  // ── Login สำเร็จ ──
  LG._attempts = 0;
  _lgSaveSession(LG.member, hash, remember);
  _applyMemberToProfile({
    uid:           memVal(LG.member, 'id'),
    username:      memVal(LG.member, 'name'),
    team:          memVal(LG.member, 'team'),
    phone:         memVal(LG.member, 'phone'),
    walletAddress: memVal(LG.member, 'wallet'),
    memberStatus:  memVal(LG.member, 'status'),
    qrCode:        memVal(LG.member, 'qr'),
  });
  lgBarShow('success', '✅ เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + memVal(LG.member, 'name'));
  // หลัง login → ไปหน้า Terms & Conditions เพื่อตรวจสอบ/ยื่นใบสมัครเทรดเดอร์
  setTimeout(() => {
    if (typeof TC !== 'undefined') {
      TC.step=1; TC.member=null; TC.traderApp=null; TC.appRow=null; TC.appId=null; TC.passwordHash='';
    }
    navTo('termcondition');
    setTimeout(()=>{ if(typeof tcRenderMain==='function') tcRenderMain(); }, 100);
  }, 800);
}

// ── autoLoginFromMembers — เรียกตอน session restore (compat) ──
async function autoLoginFromMembers() {
  const session = _lgLoadSession();
  if (!session) { navTo('login'); return; }
  _applyMemberToProfile({
    uid:           session.uid,
    username:      session.username,
    team:          session.team,
    phone:         session.phone,
    walletAddress: session.walletAddress,
    memberStatus:  session.memberStatus,
    qrCode:        session.qrCode,
  });
  try { localStorage.setItem('tcc_uid', session.uid); } catch(e) {}

  // [v8 FIX] ยกเลิก loadOfflineState ซ้ำที่นี่ — DOMContentLoaded เรียกแล้วที่ delay 5000ms
  // การเรียกซ้ำ 800ms ทำให้ earnContracts merge 2 รอบ → positions/contracts บันทึกซ้ำใน GAS
  // console.warn('[Auth] skip duplicate loadOfflineState — handled by DOMContentLoaded at 5000ms');

  // [v14 FIX] upsertUser ทันทีเมื่อ restore session เพื่อให้ Users Sheet
  // มี row ครบถ้วนตั้งแต่ login ครั้งแรก (ไม่รอให้กดบันทึกโปรไฟล์)
  setTimeout(() => {
    const uid = session.uid || USER_PROFILE.uid;
    if (!uid) return;
    const activeStatuses = ['Trading&payments', 'Trading', 'Active'];
    const isVerified = activeStatuses.some(s =>
      (session.memberStatus || '').toLowerCase().includes(s.toLowerCase())
    );
    if (typeof dbWrite === 'function') {
      dbWrite('upsertUser', {
        uid,
        username:   session.username  || USER_PROFILE.username  || '',
        email:      USER_PROFILE.regEmail || '',
        vip_level:  USER_PROFILE.vipLevel  || 0,
        verified:   isVerified,
        country:    USER_PROFILE.country   || '',
        legal_name: USER_PROFILE.legalName || '',
        dob:        USER_PROFILE.dob       || '',
        id_type:    USER_PROFILE.idType    || '',
        id_number:  USER_PROFILE.idNumber  || '',
        address:    USER_PROFILE.address   || '',
      });
    }
  }, 1500);
}

// ── _applyMemberToProfile — map NocoDB fields → USER_PROFILE ──
function _applyMemberToProfile(m) {
  if (!m) return;
  if (m.uid)           USER_PROFILE.uid           = String(m.uid);
  if (m.username)      USER_PROFILE.username      = m.username;
  if (m.team)          USER_PROFILE.team          = m.team;
  if (m.walletAddress) USER_PROFILE.walletAddress = m.walletAddress;
  if (m.memberStatus)  USER_PROFILE.memberStatus  = m.memberStatus;
  if (m.phone)         USER_PROFILE.phone         = m.phone;
  if (m.qrCode)        USER_PROFILE.qrCode        = m.qrCode;

  const activeStatuses = ['Trading&payments', 'Trading', 'Active'];
  USER_PROFILE.verified = activeStatuses.some(s =>
    (m.memberStatus || '').toLowerCase().includes(s.toLowerCase())
  );
  USER_PROFILE._memberLoaded = true;

  if (typeof _profileRender    === 'function') _profileRender();
  if (typeof _homeUpdateAvatar === 'function') _homeUpdateAvatar();
  if (typeof updateSysWalletDisplay === 'function') updateSysWalletDisplay();

  ['prf-username', 'hm-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = USER_PROFILE.username;
  });
  ['prf-uid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = USER_PROFILE.uid;
  });
  if (typeof _syncProfileToShare === 'function') _syncProfileToShare();
}

function setActiveUID(uid) {
  try { localStorage.setItem('tcc_uid', String(uid).trim()); } catch(e) {}
  console.warn('[Auth] UID saved:', uid, '— reloading app');
  window.location.reload();
}

function _syncProfileToShare() {
  if (USER_PROFILE.avatar && typeof SHARE_PROFILE !== 'undefined') {
    SHARE_PROFILE.avatar = USER_PROFILE.avatar;
  }
}

// ── Render home topbar avatar from USER_PROFILE ──
function _homeUpdateAvatar() {
  const wrap = document.getElementById('hm-avatar-wrap');
  const nameEl = document.getElementById('hm-username');
  if (!wrap) return;
  if (USER_PROFILE.avatar) {
    wrap.innerHTML = `<img src="${USER_PROFILE.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    wrap.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  if (nameEl) nameEl.textContent = USER_PROFILE.username || 'Trader Cafe';
}

// ── Profile page renderer ──
function _profileRender() {
  _homeUpdateAvatar(); // sync avatar
  const av = document.getElementById('prf-avatar');
  if (av) {
    if (USER_PROFILE.avatar) {
      av.innerHTML = `<img src="${USER_PROFILE.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      const initials = (USER_PROFILE.username || 'T').charAt(0).toUpperCase();
      av.innerHTML = `<span style="font-size:28px;font-weight:800;color:#000;">${initials}</span>`;
    }
  }
  const uname = document.getElementById('prf-username');
  if (uname) uname.textContent = USER_PROFILE.username;
  const uid = document.getElementById('prf-uid');
  if (uid) uid.textContent = 'ID: ' + USER_PROFILE.uid;
  const badge = document.getElementById('prf-vip-badge');
  if (badge) badge.textContent = USER_PROFILE.vipLevel > 0 ? 'VIP' + USER_PROFILE.vipLevel : 'Regular';
}

// ── Avatar upload handler ──
function _profileAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast(tccT('toast_select_image')); return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    USER_PROFILE.avatar = ev.target.result;
    _syncProfileToShare();
    _profileRender();
    _homeUpdateAvatar();
    showToast(tccT('toast_profile_updated'), 'success');
  };
  reader.readAsDataURL(file);
}

// ── Whale split bar toggle ──
let _whaleSplitVisible = false;
function _hmToggleWhaleSplit() {
  _whaleSplitVisible = !_whaleSplitVisible;
  const el = document.getElementById('whaleNavSplit');
  if (el) el.classList.toggle('visible', _whaleSplitVisible);
}

// Show/hide whale split bar based on page
(function _patchNavToForWhale() {
  const _origNavTo = navTo;
  window.navTo = function(page) {
    _origNavTo(page);
    const el = document.getElementById('whaleNavSplit');
    if (el) {
      if (page === 'home' || page === 'profile' || page === 'account-info' || page === 'verification') {
        // keep as is
      } else {
        el.classList.remove('visible');
        _whaleSplitVisible = false;
      }
    }
  };
})();

// ══════════════════════════════════════════════════════════════
//  Re-render on load to apply all patches + sync profile pages
// ══════════════════════════════════════════════════════════════
(function() {
  if (typeof MYT !== 'undefined' && MYT.currentTab) {
    setTimeout(() => {
      if (typeof mytRenderFilter === 'function') mytRenderFilter(MYT.currentTab);
      if (typeof mytRenderContent === 'function') mytRenderContent(MYT.currentTab);
    }, 300);
  }
  // Sync profile pages with USER_PROFILE on load
  setTimeout(() => {
    if (typeof USER_PROFILE === 'undefined') return;
    // Account info page sync
    const aiUname = document.getElementById('ai-username');
    if (aiUname) aiUname.textContent = USER_PROFILE.username;
    const aiUid = document.getElementById('ai-uid');
    if (aiUid) aiUid.innerHTML = USER_PROFILE.uid + ` <span onclick="navigator.clipboard&&navigator.clipboard.writeText('${USER_PROFILE.uid}').then(()=>showToast('Copied UID'))" style="cursor:pointer;color:var(--t2);font-size:12px;">⎘</span>`;
    const aiEmail = document.getElementById('ai-email');
    if (aiEmail) aiEmail.textContent = USER_PROFILE.phone || USER_PROFILE.email || '—';
    const aiVip = document.getElementById('ai-vip-corner');
    if (aiVip) aiVip.textContent = USER_PROFILE.vipLevel > 0 ? 'VIP' + USER_PROFILE.vipLevel : 'Regular';
    // Verification page sync
    const vfUname = document.getElementById('vf-username');
    if (vfUname) vfUname.textContent = USER_PROFILE.username;
    const vfUid = document.getElementById('vf-uid');
    if (vfUid) vfUid.textContent = USER_PROFILE.uid;
    const vfLegal = document.getElementById('vf-legalname');
    if (vfLegal) vfLegal.textContent = USER_PROFILE.legalName;
    const vfDob = document.getElementById('vf-dob');
    if (vfDob) vfDob.textContent = USER_PROFILE.dob;
    // Sync avatar across all pages if available
    if (USER_PROFILE.avatar) {
      ['ai-avatar','vf-avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<img src="${USER_PROFILE.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      });
    }
    if (typeof _homeUpdateAvatar === 'function') _homeUpdateAvatar();
  }, 500);
})();



/* ─── SECTION 4: Wallet Main IIFE ─── */
(function() {
'use strict';

/* ─── Constants ─── */
const WLT_STORAGE_KEY   = 'tcc_wallets_local';  // localStorage fallback (encrypted PK)
const WLT_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'; // BSC USDT
const WLT_BSC_RPC       = 'https://bsc-dataseed.binance.org/';
const WLT_SOL_RPC       = 'https://api.mainnet-beta.solana.com';
const WLT_SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // SOL USDC mint
const WLT_COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tether,binancecoin,solana,usd-coin&vs_currencies=thb,usd';

/* ─── Base58 Encoder (สำหรับ Solana address + PK) ─── */
const SOL_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function solBase58Encode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let str = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) str += SOL_ALPHABET[digits[i]];
  return str;
}

function solBase58Decode(str) {
  const alphabetMap = {};
  for (let i = 0; i < SOL_ALPHABET.length; i++) alphabetMap[SOL_ALPHABET[i]] = i;
  let bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (!(ch in alphabetMap)) throw new Error('Invalid Base58 character: ' + ch);
    let carry = alphabetMap[ch];
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

/* ─── Solana Wallet Generator (@noble/ed25519 2.2.3) ─── */
function solGenerateWallet() {
  if (typeof self === 'undefined' || !self.nobleEd25519) {
    throw new Error('noble/ed25519 ยังไม่โหลด — กรุณารอสักครู่');
  }
  const ed = self.nobleEd25519;
  // สุ่ม seed 32 bytes ด้วย Web Crypto API
  const seed      = crypto.getRandomValues(new Uint8Array(32));
  // Ed25519: getPublicKey(seed32) → publicKey 32 bytes
  const publicKey = ed.getPublicKey(seed);  // sync (sha512Sync pre-configured)
  // publicKey 32 bytes → Solana Address (Base58)
  const address   = solBase58Encode(publicKey);    // ~44 chars
  const seedB58   = solBase58Encode(seed);          // ~44 chars (seed only — compatible with Phantom)
  return { address, privateKey: seedB58 };
}

function solValidatePK(pkBase58) {
  // Phantom/Solflare ใช้ seed 32 bytes หรือ full secret 64 bytes
  try {
    const bytes = solBase58Decode(pkBase58.trim());
    return bytes.length === 32 || bytes.length === 64;
  } catch(e) { return false; }
}

function solDeriveAddressFromPK(pkBase58) {
  const ed    = self.nobleEd25519;
  const bytes = solBase58Decode(pkBase58.trim());
  // noble/ed25519 ใช้ seed 32 bytes เสมอ
  // หาก import 64-byte secretKey (TweetNaCl convention: seed+pubkey) → ใช้แค่ 32 bytes แรก
  let seed;
  if (bytes.length === 32)      seed = bytes;
  else if (bytes.length === 64) seed = bytes.slice(0, 32);
  else throw new Error('Invalid Solana private key length');
  return solBase58Encode(ed.getPublicKey(seed));
}

/* ─── State ─── */
let wlt = {
  currentScreen : 'main',
  selectedChain : 'BSC',
  selectedChainImp : 'BSC',
  checks        : { c1:false, c2:false, c3:false },
  pendingWallet : null,   // { address, mnemonic, privateKey, encrypted_pk, chain, label }
  wallets       : [],     // [{ id, label, chain, address, encrypted_pk, iv, salt, created_at }]
  revealTimer   : null,
  bnbPriceTHB   : 0,
  usdtPriceTHB  : 35,
  solPriceTHB   : 0,
  bnbPriceUSD   : 0,      // [NEW] BNB ราคาเป็น USD
  solPriceUSD   : 0,      // [NEW] SOL ราคาเป็น USD
  usdtPriceUSD  : 1,      // [NEW] USDT ≈ $1
  _usdToThb     : 35,     // [NEW] อัตราแลกเปลี่ยน USD→THB (ดึงจาก CoinGecko/Binance)
  bnbBal        : 0,
  usdtBal       : 0,
  solBal        : 0,
  lockedUsdt    : 0,
  lowValOpen    : false,
  // [FIX] per-wallet balance — keyed by wallet id
  // { [walletId]: { usdt, bnb, sol } }
  _balPerWallet : {},
};

/* ════════════════════════════════
   SCREEN ROUTER
════════════════════════════════ */
window.wltGoto = function(screen) {
  // ถ้า modal เปิดอยู่ ให้ใช้ hmWltOpen แทน (modal context)
  const modal = document.getElementById('hmWltModal');
  if (modal && modal.style.display !== 'none') {
    if (typeof hmWltOpen === 'function') hmWltOpen(screen);
    return;
  }
  // ast-page-wallet-a context (Assets page)
  document.querySelectorAll('.wlt-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('wlt-screen-' + screen);
  if (el) el.classList.add('active');
  wlt.currentScreen = screen;
  // Scroll กลับขึ้นบนสุดทุกครั้ง
  const pg = document.getElementById('ast-page-wallet-a');
  if (pg) pg.scrollTo(0, 0);
  // Hook-on-enter
  if (screen === 'main')    { wltLoadWallets(); wltRefreshBalance(); }
  if (screen === 'reveal')  { wltPopulateRevealSel(); }
  if (screen === 'receive') { wltPopulateReceiveSel(); }
  if (screen === 'send')    { wltPopulateSendSel(); }
  if (screen === 'history') { wltRenderHistory(); }
  if (screen === 'success') { wltRenderSuccessQR(); }
};

/* ════════════════════════════════
   TOKEN TAB SWITCH
════════════════════════════════ */
window.wltTokTab = function(el, tab) {
  document.querySelectorAll('.wlt-ttab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tokSec  = document.getElementById('wlt-tokens-section');
  const wltSec  = document.getElementById('wlt-wallets-section');
  if (tab === 'tokens')  { tokSec.style.display='block'; wltSec.style.display='none'; }
  if (tab === 'wallets') { tokSec.style.display='none';  wltSec.style.display='block'; wltRenderWalletCards(); }
};

window.wltToggleLowVal = function() {
  wlt.lowValOpen = !wlt.lowValOpen;
  document.getElementById('wlt-low-section').style.display = wlt.lowValOpen ? 'block' : 'none';
};

/* ════════════════════════════════
   CHAIN SELECT
════════════════════════════════ */
window.wltSelectChain = function(el, chain) {
  document.querySelectorAll('#wlt-screen-create .wlt-chain-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  wlt.selectedChain = chain;
};
window.wltSelectChainImp = function(el, chain) {
  document.querySelectorAll('#wlt-screen-import .wlt-chain-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  wlt.selectedChainImp = chain;
};

/* ════════════════════════════════
   PASSWORD STRENGTH
════════════════════════════════ */
window.wltCheckStrength = function() {
  const pwd = document.getElementById('wlt-create-pwd')?.value || '';
  let score = 0;
  if (pwd.length >= 8)          score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  const colorMap = ['','s-red','s-red','s-gold','s-green'];
  const labelMap = ['','อ่อน','พอใช้','ดี','แข็งแกร่ง'];
  [1,2,3,4].forEach(i => {
    const seg = document.getElementById('wlt-s'+i);
    if (!seg) return;
    seg.className = 'wlt-seg' + (i <= score ? ' ' + (colorMap[score]||'') : '');
  });
  const lbl = document.getElementById('wlt-strength-lbl');
  if (lbl) lbl.textContent = labelMap[score] || 'ความแข็งแกร่ง';
  wltCheckCreate();
};

window.wltCheckCreate = function() {
  const label = document.getElementById('wlt-create-label')?.value.trim();
  const p1    = document.getElementById('wlt-create-pwd')?.value;
  const p2    = document.getElementById('wlt-create-pwd2')?.value;
  const mis   = document.getElementById('wlt-pwd-mismatch');
  const btn   = document.getElementById('wlt-create-btn');
  if (mis) mis.style.display = (p2 && p1 !== p2) ? 'block' : 'none';
  if (btn) btn.disabled = !(label && p1 && p1.length >= 8 && p1 === p2);
};

/* ════════════════════════════════
   CRYPTO — PBKDF2 + AES-256-GCM
   ทำงานใน Browser ล้วน ไม่ผ่าน Server
════════════════════════════════ */
async function wltDeriveKey(password, salt) {
  const enc    = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:310000, hash:'SHA-256' },
    keyMat,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}

async function wltEncryptPK(privateKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await wltDeriveKey(password, salt);
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(privateKey));
  return {
    encrypted_pk : _u8ToB64(new Uint8Array(ct)),
    iv           : _u8ToB64(iv),
    salt         : _u8ToB64(salt),
  };
}

async function wltDecryptPK(encrypted_pk, iv, salt, password) {
  const key = await wltDeriveKey(password, _b64ToU8(salt));
  const dec = new TextDecoder();
  try {
    const pt = await crypto.subtle.decrypt(
      { name:'AES-GCM', iv: _b64ToU8(iv) },
      key,
      _b64ToU8(encrypted_pk)
    );
    return dec.decode(pt);
  } catch(e) {
    return null; // Wrong password
  }
}

function _u8ToB64(u8) {
  return btoa(String.fromCharCode(...u8));
}
function _b64ToU8(b64) {
  const s = atob(b64);
  return new Uint8Array(s.length).map((_,i) => s.charCodeAt(i));
}

/* ════════════════════════════════
   GENERATE WALLET (ethers.js — client only)
════════════════════════════════ */
window.wltDoCreate = async function() {
  const label = document.getElementById('wlt-create-label')?.value.trim();
  const pwd   = document.getElementById('wlt-create-pwd')?.value;
  const btn   = document.getElementById('wlt-create-btn');
  if (!label || !pwd) return;

  if (typeof ethers === 'undefined') {
    showToast('⚠️ กำลังโหลด ethers.js กรุณารอสักครู่...');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'กำลังสร้าง...'; }

  try {
    let address, pk, mnemonic;

    if (wlt.selectedChain === 'SOL') {
      // ── Solana: @noble/ed25519 Ed25519 keypair ──
      if (typeof self === 'undefined' || !self.nobleEd25519) {
        throw new Error('noble/ed25519 ยังไม่โหลด กรุณารอสักครู่แล้วลองใหม่');
      }
      const solWallet = solGenerateWallet();
      address  = solWallet.address;
      pk       = solWallet.privateKey;   // Base58 seed (Phantom compatible)
      mnemonic = '(Solana — ไม่มี Mnemonic, ใช้ Private Key ในการ restore)';
    } else {
      // ── EVM: ethers.js ──
      if (typeof ethers === 'undefined') throw new Error('ethers.js ยังไม่โหลด');
      const wallet = ethers.Wallet.createRandom();
      address  = wallet.address;
      pk       = wallet.privateKey;
      mnemonic = wallet.mnemonic.phrase;
    }

    // Encrypt PK ด้วย Password (Web Crypto API — browser only)
    const { encrypted_pk, iv, salt } = await wltEncryptPK(pk, pwd);

    // เก็บ pending wallet ไว้แสดงใน Backup screen
    wlt.pendingWallet = {
      label, chain: wlt.selectedChain,
      address, mnemonic, privateKey: pk,
      encrypted_pk, iv, salt,
    };

    // แสดง Backup screen
    wltRenderBackup();
    wltGoto('backup');

  } catch(e) {
    showToast('❌ สร้างกระเป๋าไม่สำเร็จ: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'สร้างกระเป๋า'; }
  }
};

/* ════════════════════════════════
   IMPORT WALLET
════════════════════════════════ */
window.wltValidateImportPK = function() {
  const pk      = document.getElementById('wlt-imp-pk')?.value.trim();
  const preview = document.getElementById('wlt-imp-addr-preview');
  if (!preview) return;
  if (!pk) { preview.style.display = 'none'; return; }

  const chain = wlt.selectedChainImp || 'BSC';
  try {
    if (chain === 'SOL') {
      // Solana: Base58 PK (seed 32 bytes หรือ full keypair 64 bytes)
      if (!solValidatePK(pk)) { preview.style.display = 'none'; return; }
      const addr = solDeriveAddressFromPK(pk);
      preview.style.display = 'block';
      preview.style.color   = 'var(--g)';
      preview.textContent   = '✅ SOL Address: ' + addr;
    } else {
      // EVM
      if (!pk.startsWith('0x') || pk.length !== 66) { preview.style.display = 'none'; return; }
      const wallet = new ethers.Wallet(pk);
      preview.style.display = 'block';
      preview.style.color   = 'var(--g)';
      preview.textContent   = '✅ Address: ' + wallet.address;
    }
  } catch(e) {
    preview.style.display = 'block';
    preview.style.color   = 'var(--r)';
    preview.textContent   = '❌ Private Key ไม่ถูกต้อง';
  }
};

window.wltDoImport = async function() {
  const pk    = document.getElementById('wlt-imp-pk')?.value.trim();
  const pwd   = document.getElementById('wlt-imp-pwd')?.value;
  const pwd2  = document.getElementById('wlt-imp-pwd2')?.value;
  const label = document.getElementById('wlt-imp-label')?.value.trim() || 'Import Wallet';

  if (!pk || !pwd) { showToast('กรุณากรอก Private Key และ Password'); return; }
  if (pwd !== pwd2) { showToast('Password ไม่ตรงกัน'); return; }

  try {
    let address;
    if (wlt.selectedChainImp === 'SOL') {
      // Solana: validate Base58 PK (32 or 64 bytes)
      if (!solValidatePK(pk)) { showToast('❌ Solana Private Key ไม่ถูกต้อง (ต้องเป็น Base58 32/64 bytes)'); return; }
      address = solDeriveAddressFromPK(pk);
    } else {
      // EVM
      if (!pk.startsWith('0x') || pk.length !== 66) { showToast('❌ EVM Private Key ไม่ถูกต้อง (0x + 64 hex)'); return; }
      const wallet = new ethers.Wallet(pk);
      address = wallet.address;
    }

    const { encrypted_pk, iv, salt } = await wltEncryptPK(pk, pwd);

    wlt.pendingWallet = {
      label, chain: wlt.selectedChainImp,
      address, mnemonic: '(imported — no mnemonic)', privateKey: pk,
      encrypted_pk, iv, salt,
    };

    // สำหรับ Import ไม่มี Mnemonic — ข้ามไป Success โดยตรง
    await wltSaveWallet();
    wltGoto('success');
  } catch(e) {
    showToast('❌ Import ไม่สำเร็จ: ' + e.message);
    // [FIX] คืน button state ให้กดได้อีก
    const _impBtn = document.getElementById('wlt-do-import-btn');
    if (_impBtn) { _impBtn.disabled = false; _impBtn.textContent = 'Import กระเป๋า'; }
  }
};

/* ════════════════════════════════
   BACKUP SCREEN
════════════════════════════════ */
function wltRenderBackup() {
  const pw = wlt.pendingWallet;
  if (!pw) return;

  const isSol = pw.chain === 'SOL';

  // Mnemonic grid
  const grid    = document.getElementById('wlt-mn-grid');
  const solNote = document.getElementById('wlt-mn-sol-note');
  if (solNote) solNote.style.display = isSol ? 'inline' : 'none';
  if (grid) {
    if (isSol) {
      // SOL ไม่มี Mnemonic — แสดงข้อความแทน
      grid.innerHTML = `<div style="grid-column:1/-1;padding:12px;background:rgba(153,69,255,.08);border:1px solid rgba(153,69,255,.25);border-radius:8px;font-size:12px;color:#9945ff;line-height:1.6">
        <strong>◎ Solana Wallet</strong><br>
        กระเป๋า Solana ไม่ใช้ Mnemonic 12 คำ<br>
        ใช้ <strong>Private Key (Base58)</strong> ด้านล่างในการ restore
      </div>`;
    } else {
      const words = pw.mnemonic.split(' ');
      grid.innerHTML = words.map((w,i) =>
        `<div class="wlt-mn-word"><span class="wlt-mn-num">${i+1}</span><span class="wlt-mn-txt">${w}</span></div>`
      ).join('');
    }
  }
  // PK display — label ต่างกันตาม chain
  const pkEl = document.getElementById('wlt-pk-display');
  if (pkEl) pkEl.textContent = pw.privateKey;

  // Reset checks
  wlt.checks = { c1:false, c2:false, c3:false };
  ['c1','c2','c3'].forEach(id => {
    const el = document.getElementById('wlt-' + id);
    if (el) el.className = 'wlt-checkbox';
  });
  const btn = document.getElementById('wlt-confirm-backup-btn');
  if (btn) btn.disabled = true;
}

window.wltToggleCheck = function(id) {
  wlt.checks[id] = !wlt.checks[id];
  const el = document.getElementById('wlt-' + id);
  if (el) el.className = 'wlt-checkbox' + (wlt.checks[id] ? ' checked' : '');
  const allDone = wlt.checks.c1 && wlt.checks.c2 && wlt.checks.c3;
  const btn = document.getElementById('wlt-confirm-backup-btn');
  if (btn) btn.disabled = !allDone;
};

window.wltConfirmBackup = async function() {
  const btn = document.getElementById('wlt-confirm-backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }
  try {
    await wltSaveWallet();
    // ล้าง PK ออกจากหน่วยความจำ
    const pkEl = document.getElementById('wlt-pk-display');
    if (pkEl) pkEl.textContent = '••••••••••••••••••••••••••••••';
    wlt.pendingWallet.privateKey = null;
    wltGoto('success');
  } catch(e) {
    showToast('❌ บันทึกไม่สำเร็จ: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '✅ ยืนยัน — บันทึกครบแล้ว'; }
  }
};

/* ════════════════════════════════
   SAVE WALLET → localStorage + NocoDB
════════════════════════════════ */
// [FIX] guard กัน double-submit (กดซ้ำระหว่าง async save)
let _wltSaving = false;

async function wltSaveWallet() {
  if (_wltSaving) throw new Error('กำลังบันทึกอยู่ — กรุณารอ');
  _wltSaving = true;
  try {
    const pw = wlt.pendingWallet;
    if (!pw) throw new Error('No pending wallet');

    // [FIX] ป้องกัน address ซ้ำ — ตรวจ localStorage ก่อน save
    const existing = wltGetLocalWallets();
    const dupAddr = existing.find(function(w) {
      return w.address && pw.address &&
             w.address.toLowerCase() === pw.address.toLowerCase() &&
             w.chain === pw.chain;
    });
    if (dupAddr) {
      throw new Error('Address นี้มีในกระเป๋าแล้ว (' + (dupAddr.label || 'Wallet') + ')');
    }

    const walletRecord = {
      id          : 'wlt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      label       : pw.label,
      chain       : pw.chain,
      address     : pw.address,
      encrypted_pk: pw.encrypted_pk,
      iv          : pw.iv,
      salt        : pw.salt,
      created_at  : new Date().toISOString(),
    };

    // 1. เก็บใน localStorage ก่อนเสมอ (offline-first)
    existing.push(walletRecord);
    try { localStorage.setItem(WLT_STORAGE_KEY, JSON.stringify(existing)); } catch(e) {}

    // 2. [FIX] ส่งขึ้น GAS_WALLET_URL เท่านั้น — dbCallRaw (SCRIPT_URL หลัก) ไม่รู้จัก saveWallet
    const uid = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE.uid : null;
    if (uid) {
      try {
        await dbCallRawWallet('saveWallet', {
          uid,
          wallet_id    : walletRecord.id,
          label        : walletRecord.label,
          chain        : walletRecord.chain,
          address      : walletRecord.address,
          encrypted_pk : walletRecord.encrypted_pk,
          iv           : walletRecord.iv,
          salt         : walletRecord.salt,
        });
        // log tx type=create เพื่อเก็บ timeline การสร้างกระเป๋า
        await dbCallRawWallet('saveWalletTx', {
          uid,
          wallet_id : walletRecord.id,
          type      : 'create',
          token     : walletRecord.chain === 'SOL' ? 'SOL' : 'BNB',
          amount    : 0,
          from_addr : '',
          to_addr   : walletRecord.address,
          tx_hash   : '',
          chain     : walletRecord.chain,
          status    : 'confirmed',
          tag       : 'สร้างกระเป๋า: ' + (walletRecord.label || ''),
        });
      } catch(e) {
        // GAS Wallet fail — localStorage ยังเก็บอยู่ (offline-first)
        console.warn('TCC Wallet GAS: saveWallet failed (local backup kept)', e);
      }
    }

    // อัปเดต state
    wlt.wallets = existing;
    wlt.pendingWallet = null;
  } finally {
    _wltSaving = false;
  }
}

/* ════════════════════════════════
   LOCAL WALLET STORAGE
════════════════════════════════ */
function wltGetLocalWallets() {
  try {
    const raw = localStorage.getItem(WLT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function wltLoadWallets() {
  wlt.wallets = wltGetLocalWallets();
  wltRenderWalletCards();
  // แสดง/ซ่อน "ยังไม่มีกระเป๋า"
  const notice = document.getElementById('wlt-no-wallet-notice');
  if (notice) notice.style.display = wlt.wallets.length === 0 ? 'block' : 'none';
  // อัปเดต dropdown
  wltPopulateRevealSel();
  wltPopulateReceiveSel();
  wltPopulateSendSel();
}

/* ════════════════════════════════
   RENDER WALLET CARDS (My Wallets tab)
════════════════════════════════ */
function wltRenderWalletCards() {
  const container = document.getElementById('wlt-wallet-list-container');
  if (!container) return;
  if (wlt.wallets.length === 0) {
    container.innerHTML = `<div class="wlt-empty"><div class="wlt-empty-ico">👛</div><div class="wlt-empty-title">ยังไม่มีกระเป๋า</div><div class="wlt-empty-sub">กดสร้างกระเป๋าแรกของคุณ</div></div>`;
    return;
  }
  // MetaMask-style list rows
  container.innerHTML = wlt.wallets.map(w => {
    const ico = w.chain === 'SOL' ? '◎' : w.chain === 'ETH' ? 'Ξ' : 'B';
    const icoColor = w.chain === 'SOL' ? '#9945ff' : w.chain === 'ETH' ? '#627eea' : '#f0b90b';
    const addrShort = (w.address||'').slice(0,8) + '...' + (w.address||'').slice(-6);
    return `
    <div class="wlt-wallet-card" style="display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);gap:12px">
      <div style="width:38px;height:38px;border-radius:10px;background:${icoColor}22;color:${icoColor};display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0">${ico}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--t1)">${_esc(w.label||'Wallet')}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px;font-family:var(--mono)">${addrShort}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--bg3);color:var(--t2);border:1px solid var(--border)">${_esc(w.chain||'BSC')}</span>
        <button class="wlt-wallet-act-btn" onclick="wltCopyAddr('${_esc(w.address)}')">📋</button>
        <button class="wlt-wallet-act-btn" onclick="wltOpenReceiveForWallet('${w.id}')">📥</button>
        <button class="wlt-wallet-act-btn primary" onclick="wltOpenRevealForWallet('${w.id}')">🔑</button>
      </div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════
   SUCCESS SCREEN — QR Code
════════════════════════════════ */
function wltRenderSuccessQR() {
  // เอา wallet ล่าสุดที่สร้าง
  const wallets = wltGetLocalWallets();
  const latest  = wallets[wallets.length - 1];
  if (!latest) return;

  const addrEl    = document.getElementById('wlt-success-addr');
  const labelEl   = document.getElementById('wlt-success-label-display');
  const chainEl   = document.getElementById('wlt-success-chain-display');
  const qrWrapper = document.getElementById('wlt-qr-code');

  if (addrEl)  addrEl.textContent  = latest.address;
  if (labelEl) labelEl.textContent = latest.label;
  if (chainEl) chainEl.textContent = latest.chain;
  wlt._successAddr = latest.address;

  // อัปเดต label และ description ตาม chain
  const isBtcSucc = latest.chain === 'BTC';
  const addrLbl = document.getElementById('wlt-success-addr-label');
  const descEl  = document.getElementById('wlt-success-desc');
  if (addrLbl) addrLbl.textContent = isBtcSucc ? 'Bitcoin Address (Native SegWit)' : 'Address (BEP-20)';
  if (descEl)  descEl.innerHTML   = isBtcSucc
    ? 'ฝาก <strong>BTC</strong> เข้า Address นี้<br>รองรับเฉพาะ Bitcoin Network (Native SegWit · bc1q)'
    : 'ฝาก USDT (BEP-20) เข้า Address นี้<br>เพื่อใช้เป็น Collateral สำหรับ TCC Loan';

  if (qrWrapper) {
    qrWrapper.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrWrapper, {
        text: latest.address, width:200, height:200,
        colorDark:'#000000', colorLight:'#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } else {
      qrWrapper.innerHTML = `<div style="color:var(--t3);font-size:11px;text-align:center;padding:10px">QR Code<br>${_shortAddr(latest.address)}</div>`;
    }
  }
}

/* ════════════════════════════════
   REVEAL PK
════════════════════════════════ */
function wltPopulateRevealSel() {
  const sel = document.getElementById('wlt-reveal-wallet-sel');
  if (!sel) return;
  const ws = wltGetLocalWallets();
  sel.innerHTML = '<option value="">— เลือกกระเป๋า —</option>' +
    ws.map(w => `<option value="${w.id}">${_esc(w.label)} (${_shortAddr(w.address)})</option>`).join('');
}

window.wltCheckReveal = function() {
  const sel = document.getElementById('wlt-reveal-wallet-sel')?.value;
  const pwd = document.getElementById('wlt-reveal-pwd')?.value;
  const btn = document.getElementById('wlt-reveal-btn');
  if (btn) btn.disabled = !(sel && pwd && pwd.length >= 4);
};

window.wltDoReveal = async function() {
  const selId = document.getElementById('wlt-reveal-wallet-sel')?.value;
  const pwd   = document.getElementById('wlt-reveal-pwd')?.value;
  if (!selId || !pwd) return;

  const ws  = wltGetLocalWallets();
  const rec = ws.find(w => w.id === selId);
  if (!rec) { showToast('ไม่พบกระเป๋า'); return; }

  const btn = document.getElementById('wlt-reveal-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลัง Decrypt...'; }

  try {
    const pk = await wltDecryptPK(rec.encrypted_pk, rec.iv, rec.salt, pwd);
    if (!pk) {
      showToast('❌ Password ไม่ถูกต้อง');
      if (btn) { btn.disabled = false; btn.textContent = '🔓 Decrypt & แสดง Private Key'; }
      return;
    }

    const revealArea = document.getElementById('wlt-pk-revealed-area');
    const pkText     = document.getElementById('wlt-revealed-pk-text');
    if (revealArea) revealArea.style.display = 'block';
    if (pkText) pkText.textContent = pk;
    wlt._revealedPK = pk;

    // Log action
    const uid = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE.uid : null;
    if (uid) {
      try { await dbCallRaw('logWalletAction', { uid, wallet_id: rec.id, action: 'REVEAL_PK' }); } catch(e) {}
    }

    // Start 30-second timer
    wltStartRevealTimer();

  } catch(e) {
    showToast('❌ เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔓 Decrypt & แสดง Private Key'; }
  }
};

function wltStartRevealTimer() {
  if (wlt.revealTimer) clearInterval(wlt.revealTimer);
  let sec = 30;
  wlt.revealTimer = setInterval(() => {
    sec--;
    const c1 = document.getElementById('wlt-countdown');
    const c2 = document.getElementById('wlt-countdown2');
    const fill = document.getElementById('wlt-timer-fill');
    if (c1) c1.textContent = sec;
    if (c2) c2.textContent = sec;
    if (fill) fill.style.width = (sec / 30 * 100) + '%';
    if (sec <= 0) {
      clearInterval(wlt.revealTimer);
      const area  = document.getElementById('wlt-pk-revealed-area');
      const pkEl  = document.getElementById('wlt-revealed-pk-text');
      if (area) area.style.display = 'none';
      if (pkEl) pkEl.textContent = '—';
      wlt._revealedPK = null;
      document.getElementById('wlt-reveal-pwd').value = '';
      document.getElementById('wlt-reveal-btn').disabled = true;
    }
  }, 1000);
}

/* ════════════════════════════════
   RECEIVE
════════════════════════════════ */
function wltPopulateReceiveSel() {
  const sel = document.getElementById('wlt-receive-wallet-sel');
  if (!sel) return;
  const ws = wltGetLocalWallets();
  // เรียงล่าสุดก่อน (push → ล่าสุดอยู่ท้าย → reverse)
  const sorted = [...ws].reverse();
  sel.innerHTML = '<option value="">— เลือกกระเป๋า —</option>' +
    sorted.map(w => `<option value="${w.address}">${_esc(w.label)} · ${_esc(w.chain || 'BSC')} (${_shortAddr(w.address)})</option>`).join('');
  if (sorted.length > 0) { sel.value = sorted[0].address; wltRenderReceiveQR(); }
}

window.wltRenderReceiveQR = function() {
  const sel    = document.getElementById('wlt-receive-wallet-sel');
  const addr   = sel ? sel.value : '';
  const addrEl = document.getElementById('wlt-receive-addr');
  const qrWrap = document.getElementById('wlt-receive-qr');
  if (addrEl) addrEl.textContent = addr || '—';
  wlt._receiveAddr = addr;

  // หา chain ของ wallet ที่เลือก
  const ws  = wltGetLocalWallets();
  const rec = ws.find(w => w.address === addr);
  const isBtcRec = rec?.chain === 'BTC';
  const netLbl  = document.getElementById('wlt-receive-network-label');
  const warnEl  = document.getElementById('wlt-receive-warning-text');
  if (netLbl) netLbl.textContent = isBtcRec ? 'Network: Bitcoin (BTC)' : 'Network: BSC (BEP-20)';
  if (warnEl) warnEl.innerHTML  = isBtcRec
    ? '⚠️ ส่งเฉพาะ <strong>BTC</strong> บน Bitcoin Network เท่านั้น<br>ส่งผิด Network = สูญเสียถาวร'
    : '⚠️ ส่งเฉพาะ <strong>BEP-20 Token</strong> บน BSC เท่านั้น<br>ส่งผิด Network = สูญเสียถาวร';
  if (qrWrap) {
    qrWrap.innerHTML = '';
    if (addr && typeof QRCode !== 'undefined') {
      new QRCode(qrWrap, { text:addr, width:200, height:200, colorDark:'#000', colorLight:'#fff', correctLevel:QRCode.CorrectLevel.L });
    } else if (addr) {
      qrWrap.innerHTML = `<div style="font-size:10px;color:var(--t3);word-break:break-all;padding:8px">${addr}</div>`;
    }
  }
};

window.wltCopyReceiveAddr = function() {
  const addr = wlt._receiveAddr;
  if (!addr) { showToast('ไม่พบ Address'); return; }
  _copyToClipboard(addr);
  showToast('📋 Copy Address แล้ว!');
};

window.wltShareAddr = function() {
  const addr = wlt._receiveAddr;
  if (!addr) { showToast('ไม่พบ Address'); return; }
  wltOpenShareSheet(addr, document.getElementById('wlt-receive-qr'));
};

/* ════════════════════════════════
   SEND
════════════════════════════════ */
function wltPopulateSendSel() {
  const sel = document.getElementById('wlt-send-wallet-sel');
  if (!sel) return;
  const ws = wltGetLocalWallets();
  sel.innerHTML = '<option value="">— เลือกกระเป๋า —</option>' +
    ws.map(w => `<option value="${w.id}">${_esc(w.label)} (${_shortAddr(w.address)})</option>`).join('');
  if (ws.length > 0) { sel.value = ws[0].id; wltUpdateSendBalance(); wltUpdateSendTokenOptions(); }
}

window.wltUpdateSendBalance = function() {
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const ws    = wltGetLocalWallets();
  const rec   = ws.find(w => w.id === selId);
  const isSol = rec?.chain === 'SOL';

  const avail  = document.getElementById('wlt-send-avail');
  const locked = document.getElementById('wlt-send-locked');
  const notice = document.getElementById('wlt-send-lock-notice');

  if (isSol) {
    if (avail)  avail.textContent  = wlt.solBal.toFixed(4) + ' SOL';
    if (locked) locked.textContent = '0.00';
    if (notice) notice.style.display = 'none';
  } else {
    if (avail)  avail.textContent  = (wlt.usdtBal - wlt.lockedUsdt).toFixed(2);
    if (locked) locked.textContent = wlt.lockedUsdt.toFixed(2);
    if (notice) notice.style.display = wlt.lockedUsdt > 0 ? 'block' : 'none';
  }
  wltUpdateSendTokenOptions();
};

window.wltCalcSendFee = function() {
  const amt = parseFloat(document.getElementById('wlt-send-amount')?.value) || 0;
  const tok = document.getElementById('wlt-send-token')?.value || 'USDT';
  const sumAmt   = document.getElementById('wlt-send-summary-amount');
  const sumTotal = document.getElementById('wlt-send-summary-total');
  if (sumAmt)   sumAmt.textContent   = amt.toFixed(2) + ' ' + tok;
  if (sumTotal) sumTotal.textContent = amt.toFixed(2) + ' ' + tok + ' + Gas';
};

window.wltDoSend = async function() {
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const toAddr = document.getElementById('wlt-send-to')?.value.trim();
  const amount = parseFloat(document.getElementById('wlt-send-amount')?.value) || 0;
  const token  = document.getElementById('wlt-send-token')?.value || 'USDT';
  const pwd    = document.getElementById('wlt-send-pwd')?.value;

  if (!selId)  { showToast('กรุณาเลือกกระเป๋า'); return; }
  if (!toAddr) { showToast('กรุณากรอก To Address'); return; }
  if (amount <= 0) { showToast('กรุณากรอกจำนวนที่ถูกต้อง'); return; }
  if (!pwd)    { showToast('กรุณากรอก Wallet Password'); return; }
  // Validate address format ตาม chain
  const ws  = wltGetLocalWallets();
  const rec = ws.find(w => w.id === selId);
  if (!rec) { showToast('ไม่พบกระเป๋า'); return; }

  const isSol = rec.chain === 'SOL';
  if (isSol) {
    // Solana address: Base58 ~32-44 chars
    if (toAddr.length < 32 || toAddr.length > 44) { showToast('❌ Solana Address ไม่ถูกต้อง'); return; }
  } else {
    // EVM address: 0x + 40 hex
    if (!toAddr.startsWith('0x') || toAddr.length !== 42) { showToast('❌ EVM Address ไม่ถูกต้อง'); return; }
  }

  // เช็ค Collateral Lock (USDT เท่านั้น)
  const available = wlt.usdtBal - wlt.lockedUsdt;
  if (token === 'USDT' && amount > available) {
    showToast(`❌ ยอดที่ใช้งานได้มีแค่ ${available.toFixed(2)} USDT`); return;
  }

  showToast('🔓 กำลัง Decrypt & Sign Transaction...');

  try {
    // Decrypt PK
    const pk = await wltDecryptPK(rec.encrypted_pk, rec.iv, rec.salt, pwd);
    if (!pk) { showToast('❌ Password ไม่ถูกต้อง'); return; }

    let txHash = '';

    if (isSol) {
      // ══ Solana Transfer (SOL native) ══
      // ใช้ @noble/ed25519 sign transaction แบบ manual JSON-RPC
      txHash = await wltSolTransfer(pk, toAddr, amount);
    } else {
      // ══ EVM Transfer (BSC) ══
      const provider = new ethers.providers.JsonRpcProvider(WLT_BSC_RPC);
      const wallet   = new ethers.Wallet(pk, provider);
      let tx;
      if (token === 'BNB') {
        tx = await wallet.sendTransaction({
          to: toAddr, value: ethers.utils.parseEther(amount.toString()),
        });
      } else {
        const usdtABI  = ['function transfer(address to, uint256 amount) returns (bool)'];
        const contract = new ethers.Contract(WLT_USDT_CONTRACT, usdtABI, wallet);
        tx = await contract.transfer(toAddr, ethers.utils.parseUnits(amount.toString(), 18));
      }
      showToast('✅ TX ส่งแล้ว! กำลังรอ Confirm...');
      const receipt = await tx.wait(1);
      if (receipt.status !== 1) { showToast('❌ ธุรกรรมล้มเหลว'); return; }
      txHash = tx.hash;
    }

    showToast('✅ ธุรกรรมสำเร็จ! TX: ' + (txHash||'').slice(0,14) + '...');
    // [FIX #2] เพิ่ม from: rec.address เพื่อบันทึก from_addr ใน GAS sheet ด้วย
    wltSaveTxHistory({ type:'send', token, amount, from: rec.address, to:toAddr, hash:txHash, status:'confirmed', chain: rec.chain });
    wltRefreshBalance();
    wltGoto('history');

  } catch(e) {
    const msg = e.message || '';
    if (msg.includes('insufficient funds') || msg.includes('insufficient lamports')) {
      showToast('❌ ยอดไม่พอจ่าย Gas Fee');
    } else {
      showToast('❌ ส่งไม่สำเร็จ: ' + msg.slice(0,60));
    }
  }
};

/* ════════════════════════════════
   SOLANA TRANSFER — JSON-RPC manual signing
   ใช้ @noble/ed25519 + base58 โดยตรง (ไม่ต้อง @solana/web3.js)
════════════════════════════════ */
async function wltSolTransfer(pkBase58, toAddress, amountSol) {
  const ed      = self.nobleEd25519;
  const lamports = Math.round(amountSol * 1e9);

  // Derive seed + publicKey จาก pk
  // รองรับทั้ง seed 32 bytes และ full secretKey 64 bytes (TweetNaCl convention)
  const pkBytes  = solBase58Decode(pkBase58.trim());
  const seed     = pkBytes.length === 64 ? pkBytes.slice(0, 32) : pkBytes;
  if (seed.length !== 32) throw new Error('Invalid Solana private key length');
  const fromPubkey = ed.getPublicKey(seed);  // 32 bytes (sync)
  const toPubkey   = solBase58Decode(toAddress); // 32 bytes

  // ดึง recent blockhash
  const bhRes = await fetch(WLT_SOL_RPC, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getLatestBlockhash', params:[{'commitment':'finalized'}] })
  });
  const bhData    = await bhRes.json();
  const blockhash = bhData?.result?.value?.blockhash;
  if (!blockhash) throw new Error('ดึง blockhash ไม่ได้');
  const blockHashBytes = solBase58Decode(blockhash);

  // สร้าง SOL Transfer instruction (System Program)
  // https://docs.solana.com/developing/runtime-facilities/programs#system-program
  const SYSTEM_PROGRAM = new Uint8Array(32); // all zeros
  const instructionData = new Uint8Array(12);
  // instruction index = 2 (transfer)
  new DataView(instructionData.buffer).setUint32(0, 2, true);
  // lamports (u64 little-endian)
  new DataView(instructionData.buffer).setBigUint64(4, BigInt(lamports), true);

  // สร้าง Transaction Message (legacy format)
  // Header: numRequiredSignatures=1, numReadonlySigned=0, numReadonlyUnsigned=1
  const header = new Uint8Array([1, 0, 1]);
  // Account keys: from, to, system_program
  const accountKeys = new Uint8Array(3 * 32);
  accountKeys.set(fromPubkey,   0);
  accountKeys.set(toPubkey,     32);
  accountKeys.set(SYSTEM_PROGRAM, 64);
  // Recent blockhash
  const instructions = new Uint8Array([
    1,           // number of instructions
    2,           // program account index (system program = index 2)
    2,           // number of accounts
    0,           // account 0 = from (writable+signer)
    1,           // account 1 = to (writable)
    instructionData.length, ...instructionData
  ]);
  // Assemble message
  const message = new Uint8Array(
    header.length + 1 + accountKeys.length + blockHashBytes.length + instructions.length
  );
  let off = 0;
  message.set(header, off); off += header.length;
  message[off++] = 3; // number of accounts
  message.set(accountKeys, off); off += accountKeys.length;
  message.set(blockHashBytes, off); off += blockHashBytes.length;
  message.set(instructions, off);

  // Sign — noble/ed25519: sign(message, seed32) → Uint8Array 64 bytes
  const sig = ed.sign(message, seed);

  // Assemble Transaction: [numSigs=1][sig][message]
  const tx = new Uint8Array(1 + 64 + message.length);
  tx[0] = 1;
  tx.set(sig, 1);
  tx.set(message, 65);

  // Base64 encode → sendTransaction
  const txB64 = btoa(String.fromCharCode(...tx));
  const sendRes = await fetch(WLT_SOL_RPC, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: [txB64, { encoding: 'base64', preflightCommitment: 'confirmed' }]
    })
  });
  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(sendData.error.message || 'SOL TX failed');
  return sendData.result; // TX signature (hash)
}

/* ════════════════════════════════
   SEND TOKEN FILTER — แสดง token ตาม chain ที่เลือก
════════════════════════════════ */
window.wltUpdateSendTokenOptions = function() {
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const tokSel = document.getElementById('wlt-send-token');
  const feeLabel = document.getElementById('wlt-send-fee-label');
  if (!selId || !tokSel) return;
  const ws  = wltGetLocalWallets();
  const rec = ws.find(w => w.id === selId);
  if (!rec) return;
  const isSol = rec.chain === 'SOL';
  // ซ่อน/แสดง options ตาม chain
  Array.from(tokSel.options).forEach(opt => {
    if (isSol) {
      opt.style.display = opt.value === 'SOL' ? '' : 'none';
    } else {
      opt.style.display = opt.value === 'SOL' ? 'none' : '';
    }
  });
  tokSel.value = isSol ? 'SOL' : 'USDT';
  // อัปเดต fee label
  if (feeLabel) {
    feeLabel.textContent = isSol
      ? 'ค่า Fee ≈ 0.000005 SOL (~฿0.01)'
      : 'ค่า Gas ≈ 0.0005 BNB (~฿9)';
  }
};

/* ════════════════════════════════
   TX HISTORY (localStorage)
════════════════════════════════ */
function wltSaveTxHistory(tx) {
  const key = 'tcc_wallet_tx_history';
  const record = { ...tx, date: new Date().toISOString() };
  // 1. บันทึก localStorage (offline-first)
  try {
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    history.unshift(record);
    if (history.length > 100) history.pop();
    localStorage.setItem(key, JSON.stringify(history));
  } catch(e) {}
  // 2. [WALLET GAS] sync ขึ้น Google Sheets Wallet DB
  const uid = (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) ? USER_PROFILE.uid : null;
  if (uid) {
    dbCallRawWallet('saveWalletTx', {
      uid,
      wallet_id : tx.wallet_id || '',
      type      : tx.type      || 'send',
      token     : tx.token     || 'USDT',
      amount    : tx.amount    || 0,
      from_addr : tx.from      || '',
      to_addr   : tx.to        || '',
      tx_hash   : tx.hash      || '',
      chain     : tx.chain     || 'BSC',
      status    : tx.status    || 'confirmed',
      tag       : tx.tag       || '',
    }).catch(function(e) {
      console.warn('TCC Wallet GAS: saveWalletTx failed (localStorage kept)', e);
    });
  }
}

function wltGetTxHistory() {
  try {
    return JSON.parse(localStorage.getItem('tcc_wallet_tx_history') || '[]');
  } catch(e) { return []; }
}

window.wltRenderHistory = function() {
  const container = document.getElementById('wlt-history-list');
  if (!container) return;
  const history = wltGetTxHistory();
  if (history.length === 0) {
    container.innerHTML = `<div class="wlt-empty"><div class="wlt-empty-ico">📋</div><div class="wlt-empty-title">ยังไม่มีธุรกรรม</div><div class="wlt-empty-sub">ธุรกรรมจะแสดงที่นี่หลังจากมีการรับ-ส่งเหรียญ</div></div>`;
    return;
  }
  container.innerHTML = history.map(tx => {
    const isSend = tx.type === 'send';
    const color  = isSend ? 'var(--r)' : 'var(--g)';
    const bg     = isSend ? 'var(--r-10)' : 'var(--g-10)';
    const sign   = isSend ? '-' : '+';
    const ico    = isSend ? '↑' : '↓';
    const dt     = tx.date ? new Date(tx.date).toLocaleDateString('th-TH') : '';
    const chainBadge = tx.chain === 'SOL'
      ? '<span style="font-size:9px;background:#9945ff22;color:#9945ff;border-radius:3px;padding:1px 5px;margin-left:4px">SOL</span>'
      : '';
    // [FIX #1] สร้าง explorer link โดยใช้ _explorerLinkFor ที่มีอยู่แล้ว
    // ถ้ามี hash → แสดงเป็น <a> link ไป block explorer, row ยังกดได้แต่ไม่ซ้ำกัน
    const explorerUrl = (typeof _explorerLinkFor === 'function')
      ? _explorerLinkFor(tx.chain || 'BSC', tx.hash || '')
      : (tx.chain === 'SOL'
          ? 'https://solscan.io/tx/' + (tx.hash || '')
          : 'https://bscscan.com/tx/' + (tx.hash || ''));
    const hashDisplay = tx.hash
      ? `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer"
           onclick="event.stopPropagation()"
           style="color:var(--y,#f0b90b);text-decoration:underline;font-size:11px"
         >${tx.hash.slice(0,14)}...</a>`
      : '';
    return `<div class="wlt-tx-row" onclick="wltOpenTxDetail('${tx.hash||''}','${tx.chain||'BSC'}')">
      <div class="wlt-tx-ico" style="background:${bg};color:${color}">${ico}</div>
      <div class="wlt-tx-info">
        <div class="wlt-tx-name">${isSend ? 'ส่ง' : 'รับ'} ${_esc(tx.token||'USDT')}${chainBadge}</div>
        <div class="wlt-tx-sub">${hashDisplay}${hashDisplay ? ' · ' : ''}${_esc(tx.status||'')}</div>
      </div>
      <div class="wlt-tx-right">
        <div class="wlt-tx-amount" style="color:${color}">${sign}${parseFloat(tx.amount||0).toFixed(2)}</div>
        <div class="wlt-tx-status">${dt}</div>
      </div>
    </div><div class="wlt-divider"></div>`;
  }).join('');
};

window.wltRefreshHistory = function() {
  wltRenderHistory();
  showToast('🔄 Refresh แล้ว');
};

// [FIX #1] wltOpenTxDetail ยังคงใช้ _explorerLinkFor แทน hardcode
// เพื่อรองรับทุก network ที่ EXPLORER_TX_URL กำหนดไว้
window.wltOpenTxDetail = function(hash, chain) {
  if (!hash) return;
  const url = (typeof _explorerLinkFor === 'function')
    ? _explorerLinkFor(chain || 'BSC', hash)
    : (chain === 'SOL'
        ? 'https://solscan.io/tx/' + hash
        : 'https://bscscan.com/tx/' + hash);
  if (url) window.open(url, '_blank');
};

/* ════════════════════════════════
   BALANCE — ดึงจาก BSC RPC
════════════════════════════════ */
window.wltRefreshBalance = async function() {
  const wallets = wltGetLocalWallets();
  if (wallets.length === 0) {
    wltUpdateBalanceUI(0, 0); return;
  }

  // ดึง price THB จาก CoinGecko (cached 60s)
  await wltFetchPrices();

  // รวม Balance จากทุก wallet (แยก EVM vs SOL)
  let totalUsdt = 0, totalBnb = 0, totalSol = 0;

  // แยก wallets ตาม chain
  const evmWallets = wallets.filter(w => w.chain !== 'SOL');
  const solWallets = wallets.filter(w => w.chain === 'SOL');

  // ── EVM (BSC/ETH/Polygon) ──
  if (evmWallets.length > 0) {
    const provider = new ethers.providers.JsonRpcProvider(WLT_BSC_RPC);
    const usdtABI  = ['function balanceOf(address) view returns (uint256)'];
    const usdtCon  = new ethers.Contract(WLT_USDT_CONTRACT, usdtABI, provider);
    for (const w of evmWallets) {
      try {
        const [bnbWei, usdtRaw] = await Promise.all([
          provider.getBalance(w.address),
          usdtCon.balanceOf(w.address),
        ]);
        const bnbBal  = parseFloat(ethers.utils.formatEther(bnbWei));
        const usdtBal = parseFloat(ethers.utils.formatUnits(usdtRaw, 18));
        totalBnb  += bnbBal;
        totalUsdt += usdtBal;
        // [FIX] store per-wallet balance
        wlt._balPerWallet[w.id] = { usdt: usdtBal, bnb: bnbBal, sol: 0 };
        const cardBal = document.getElementById('wlt-card-bal-' + w.id);
        if (cardBal) cardBal.textContent = usdtBal.toFixed(2) + ' USDT | ' + bnbBal.toFixed(4) + ' BNB';
      } catch(e) { /* RPC error — skip */ }
    }
  }

  // ── Solana ── (ใช้ JSON-RPC โดยตรง ไม่ต้อง @solana/web3.js)
  for (const w of solWallets) {
    try {
      // ดึง SOL balance
      const solRes = await fetch(WLT_SOL_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getBalance',
          params: [w.address]
        })
      });
      const solData  = await solRes.json();
      const lamports = solData?.result?.value || 0;
      const solBal   = lamports / 1e9;  // 1 SOL = 1e9 lamports
      totalSol += solBal;
      // [FIX] store per-wallet balance
      wlt._balPerWallet[w.id] = { usdt: 0, bnb: 0, sol: solBal };
      const cardBal = document.getElementById('wlt-card-bal-' + w.id);
      if (cardBal) cardBal.textContent = solBal.toFixed(4) + ' SOL';
    } catch(e) { /* RPC error — skip */ }
  }

  wlt.bnbBal  = totalBnb;
  wlt.usdtBal = totalUsdt;
  wlt.solBal  = totalSol;
  wltUpdateBalanceUI(totalUsdt, totalBnb, totalSol);
};

async function wltFetchPrices() {
  const now = Date.now();
  if (wlt._priceTs && now - wlt._priceTs < 60000) return; // cache 60s

  // ลอง CoinGecko ก่อน — ถ้า fail ลอง Binance API (ไม่มี CORS issue)
  let bnbUsd = 0, usdThb = 35, solUsd = 0;

  try {
    const res  = await fetch(WLT_COINGECKO_URL);
    const data = await res.json();
    wlt.usdtPriceTHB = data?.tether?.thb        || 35;
    wlt.bnbPriceTHB  = data?.binancecoin?.thb    || 0;
    wlt.solPriceTHB  = data?.solana?.thb         || 0;
    wlt.bnbPriceUSD  = data?.binancecoin?.usd    || 0;
    wlt.solPriceUSD  = data?.solana?.usd         || 0;
    wlt.usdtPriceUSD = 1;   // USDT ≈ $1 เสมอ
    // คำนวณ USD/THB จาก USDT (USDT ≈ $1 → tether.thb = อัตรา USD/THB)
    wlt._usdToThb    = data?.tether?.thb || 35;
    wlt._priceTs = now;
    return; // CoinGecko สำเร็จ — จบ
  } catch(e) { /* CoinGecko fail — ลอง Binance */ }

  // Fallback: Binance public API (ไม่ต้อง API key)
  try {
    const [bnbRes, usdtRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT'),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTTHB').catch(() => null),
    ]);
    const bnbData  = await bnbRes.json();
    bnbUsd = parseFloat(bnbData?.price) || 0;
    if (usdtRes) {
      const usdtData = await usdtRes.json();
      usdThb = parseFloat(usdtData?.price) || 35;
    }
    wlt.bnbPriceUSD  = bnbUsd;
    wlt.bnbPriceTHB  = bnbUsd * usdThb;
    wlt.usdtPriceTHB = usdThb;
    wlt.usdtPriceUSD = 1;
    wlt._usdToThb    = usdThb;
    wlt._priceTs = now;
  } catch(e) {
    // ทั้ง 2 แหล่งล้มเหลว — ใช้ fallback ค่าคงที่ (ไม่ปล่อยให้ BNB = 0)
    wlt.usdtPriceTHB = wlt.usdtPriceTHB || 35;
    wlt.bnbPriceTHB  = wlt.bnbPriceTHB  || (600 * 35); // ~BNB $600 × 35
    wlt.bnbPriceUSD  = wlt.bnbPriceUSD  || 600;
    wlt._usdToThb    = wlt._usdToThb    || 35;
  }
}

function wltUpdateBalanceUI(usdt, bnb, sol = 0) {
  const total    = usdt * wlt.usdtPriceTHB + bnb * wlt.bnbPriceTHB + sol * wlt.solPriceTHB;
  const usdtThb  = usdt * wlt.usdtPriceTHB;
  const bnbThb   = bnb  * wlt.bnbPriceTHB;
  const solThb   = sol  * wlt.solPriceTHB;

  const totUsdtEl = document.getElementById('wlt-total-usdt');
  const totThbEl  = document.getElementById('wlt-total-thb');
  const usdtBalEl = document.getElementById('wlt-usdt-bal');
  const usdtThbEl = document.getElementById('wlt-usdt-thb');
  const bnbBalEl  = document.getElementById('wlt-bnb-bal');
  const bnbThbEl  = document.getElementById('wlt-bnb-thb');
  const assetEl   = document.getElementById('wlt-asset-total');
  const sendAvail = document.getElementById('wlt-send-avail');

  if (totUsdtEl) totUsdtEl.textContent = usdt.toFixed(2);
  if (totThbEl)  totThbEl.textContent  = '≈ ฿' + _fmtN(total);
  if (usdtBalEl) usdtBalEl.textContent = usdt.toFixed(2);
  if (usdtThbEl) usdtThbEl.textContent = '≈ ฿' + _fmtN(usdtThb);
  if (bnbBalEl)  bnbBalEl.textContent  = bnb.toFixed(4);
  if (bnbThbEl)  bnbThbEl.textContent  = '≈ ฿' + _fmtN(bnbThb);
  if (assetEl)   assetEl.textContent   = usdt.toFixed(2) + ' USDT';
  if (sendAvail) sendAvail.textContent = Math.max(0, usdt - wlt.lockedUsdt).toFixed(2);

  // SOL elements
  const solBalEl  = document.getElementById('wlt-sol-bal');
  const solThbEl  = document.getElementById('wlt-sol-thb');
  const solRowEl  = document.getElementById('wlt-sol-row');
  if (solBalEl) solBalEl.textContent = sol.toFixed(4);
  if (solThbEl) solThbEl.textContent = '≈ ฿' + _fmtN(solThb);
  // แสดง SOL row เฉพาะเมื่อมี SOL wallet
  const hasSol = wltGetLocalWallets().some(w => w.chain === 'SOL');
  if (solRowEl) solRowEl.style.display = hasSol ? 'flex' : 'none';

  // Lock badge USDT
  const lockBadge = document.getElementById('wlt-usdt-lock');
  if (lockBadge) lockBadge.style.display = wlt.lockedUsdt > 0 ? 'inline-flex' : 'none';

  // Sync Home Wallet tab
  if (typeof _hmSyncWalletBalance === 'function') _hmSyncWalletBalance();
}

/* ════════════════════════════════
   TOKEN DETAIL POPUP (simple toast)
════════════════════════════════ */
window.wltShowTokenDetail = function(token) {
  if (token === 'USDT') {
    const avail  = Math.max(0, wlt.usdtBal - wlt.lockedUsdt);
    showToast(`USDT: ${wlt.usdtBal.toFixed(2)} | ใช้ได้: ${avail.toFixed(2)} | Lock: ${wlt.lockedUsdt.toFixed(2)}`);
  } else if (token === 'SOL') {
    showToast('SOL: ' + wlt.solBal.toFixed(4) + ' | ≈ ฿' + _fmtN(wlt.solBal * wlt.solPriceTHB));
  } else {
    showToast('BNB: ' + wlt.bnbBal.toFixed(4));
  }
};

/* ════════════════════════════════
   COPY HELPERS
════════════════════════════════ */
window.wltCopyText = function(type) {
  let text = '';
  if (type === 'mnemonic' && wlt.pendingWallet) text = wlt.pendingWallet.mnemonic;
  if (type === 'pk'       && wlt.pendingWallet) text = wlt.pendingWallet.privateKey || '';
  if (type === 'address'  && wlt._successAddr)  text = wlt._successAddr;
  if (type === 'revealed-pk' && wlt._revealedPK) text = wlt._revealedPK;
  if (!text) { showToast('ไม่มีข้อมูล'); return; }
  _copyToClipboard(text);
  showToast('📋 Copy แล้ว!');
};

window.wltCopyAddr = function(addr) {
  _copyToClipboard(addr);
  showToast('📋 Copy Address แล้ว!');
};

window.wltOpenReceiveForWallet = function(id) {
  wltGoto('receive');
  setTimeout(() => {
    const sel = document.getElementById('wlt-receive-wallet-sel');
    const ws  = wltGetLocalWallets();
    const rec = ws.find(w => w.id === id);
    if (sel && rec) { sel.value = rec.address; wltRenderReceiveQR(); }
  }, 50);
};

window.wltOpenRevealForWallet = function(id) {
  wltGoto('reveal');
  setTimeout(() => {
    const sel = document.getElementById('wlt-reveal-wallet-sel');
    if (sel) sel.value = id;
  }, 50);
};

function _copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => _copyFallback(text));
  } else {
    _copyFallback(text);
  }
}
function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy');
  document.body.removeChild(ta);
}

/* ════════════════════════════════
   UTILITIES
════════════════════════════════ */
function _shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || '';
  return addr.slice(0,6) + '...' + addr.slice(-4);
}
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _fmtN(n) {
  return parseFloat(n||0).toLocaleString('th-TH', { maximumFractionDigits:2 });
}

/* ════════════════════════════════
   HOOK: astSwitchTab 'wallet-a'
════════════════════════════════ */
// Patch astSwitchTab เพื่อ render wallet tab เมื่อเปิด
const _origAstSwitch = window.astSwitchTab;
window.astSwitchTab = function(name, el) {
  if (typeof _origAstSwitch === 'function') _origAstSwitch(name, el);
  if (name === 'wallet-a') {
    // Load wallets + balance เมื่อเปิด tab
    wltLoadWallets();
    wltRefreshBalance();
    // ดึง locked USDT จาก loan system ถ้ามี
    if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE && USER_PROFILE.uid) {
      dbCallRaw('getMyLoans', { uid: USER_PROFILE.uid }).then(loans => {
        const active = (loans || []).filter(l => l.status === 'active' || l.status === 'open');
        wlt.lockedUsdt = active.reduce((s, l) => s + (parseFloat(l.collateral_usdt_value) || 0), 0);
        wltUpdateSendBalance();
        const badge = document.getElementById('wlt-usdt-lock');
        if (badge) badge.style.display = wlt.lockedUsdt > 0 ? 'inline-flex' : 'none';
      }).catch(() => {});
    }
  }
};

/* ════════════════════════════════
   AUTO-INIT: Wallet row ถูกเพิ่มใน HTML โดยตรงแล้ว
════════════════════════════════ */

/* ── Expose wlt state + internal helpers ออก window
   เพื่อให้ hmWltOpen (นอก IIFE) เข้าถึงได้ ── */
window.wlt = wlt;
window._wltLoadWallets        = (typeof wltLoadWallets === 'function')        ? wltLoadWallets        : function(){};
window._wltRefreshBalance     = (typeof wltRefreshBalance === 'function')     ? wltRefreshBalance     : function(){};
window._wltRenderHistory      = (typeof wltRenderHistory === 'function')      ? wltRenderHistory      : function(){};
window._wltPopulateReceiveSel = (typeof wltPopulateReceiveSel === 'function') ? wltPopulateReceiveSel : function(){};
window._wltPopulateSendSel    = (typeof wltPopulateSendSel === 'function')    ? wltPopulateSendSel    : function(){};
window._wltPopulateRevealSel  = (typeof wltPopulateRevealSel === 'function')  ? wltPopulateRevealSel  : function(){};
window._wltUpdateSendBalance  = (typeof wltUpdateSendBalance === 'function')  ? wltUpdateSendBalance  : function(){};
window._wltRenderSuccessQR    = (typeof wltRenderSuccessQR === 'function')    ? wltRenderSuccessQR    : function(){};
window._wltRenderWalletCards  = (typeof wltRenderWalletCards === 'function')  ? wltRenderWalletCards  : function(){};
// ── Expose crypto + sol helpers ให้ _hmWltInitCreate/_hmWltInitImport (นอก IIFE) เรียกได้ ──
window.wltEncryptPK           = (typeof wltEncryptPK === 'function')           ? wltEncryptPK           : async function(){};
window.wltDecryptPK           = (typeof wltDecryptPK === 'function')           ? wltDecryptPK           : async function(){};
window.wltSaveWallet          = (typeof wltSaveWallet === 'function')          ? wltSaveWallet          : async function(){};
window.wltRenderBackup        = (typeof wltRenderBackup === 'function')        ? wltRenderBackup        : function(){};
window.solGenerateWallet      = (typeof solGenerateWallet === 'function')      ? solGenerateWallet      : function(){};
window.solValidatePK          = (typeof solValidatePK === 'function')          ? solValidatePK          : function(){ return false; };
window.solDeriveAddressFromPK = (typeof solDeriveAddressFromPK === 'function') ? solDeriveAddressFromPK : function(){ return ''; };
// ── Expose utility helpers ให้โค้ดนอก IIFE เรียกได้ (เช่น _hmWltInitMain) ──
window._esc       = (typeof _esc       === 'function') ? _esc       : function(s){ return String(s||''); };
window._shortAddr = (typeof _shortAddr === 'function') ? _shortAddr : function(a){ return a||''; };
window._fmtN      = (typeof _fmtN      === 'function') ? _fmtN      : function(n){ return String(n||0); };

// ── [FIX] Expose WLT constants ให้โค้ดนอก IIFE (_hmWltInitSend) เรียกได้ ──
window.WLT_BSC_RPC       = WLT_BSC_RPC;
window.WLT_SOL_RPC       = WLT_SOL_RPC;
window.WLT_USDT_CONTRACT = WLT_USDT_CONTRACT;
window.WLT_STORAGE_KEY   = WLT_STORAGE_KEY;
// ── Expose tx helpers ──
window.wltSolTransfer    = (typeof wltSolTransfer    === 'function') ? wltSolTransfer    : async function(){ throw new Error('wltSolTransfer not ready'); };
window.wltSaveTxHistory  = (typeof wltSaveTxHistory  === 'function') ? wltSaveTxHistory  : function(){};
window.wltGetLocalWallets= (typeof wltGetLocalWallets=== 'function') ? wltGetLocalWallets: function(){ return []; };

})(); // end IIFE


/* ─── SECTION 5: BTC IIFE ─── */

(function() {
'use strict';
/* ═══════════════════════════════════════════════════════════════════
   TCC WALLET — Bitcoin (BTC) Extension
   เพิ่มต่อจาก wallet JS เดิม (ภายใน IIFE เดียวกัน)

   Dependencies (ต้อง inline ก่อน IIFE นี้):
     - btcCrypto bundle (~71KB) → window.btcCrypto = { secp, sha256, ripemd160 }

   APIs ที่ใช้:
     - Mempool.space  → ดู UTXO, balance, broadcast TX (ฟรี ไม่ต้อง key)
     - BlockCypher    → fallback balance (ฟรี tier 3req/s)

   Address format: P2PKH Legacy (1xxx) — compatible กับทุก exchange
   Private Key: WIF compressed (K/L prefix)
   ═══════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────
   BTC CONSTANTS
──────────────────────────────────────────────────────────────────── */
const WLT_BTC_MEMPOOL    = 'https://mempool.space/api';
const WLT_BTC_BLOCKCYPHER= 'https://api.blockcypher.com/v1/btc/main';
const WLT_BTC_DUST       = 546;      // min output satoshi
const WLT_BTC_FEE_SAT    = 10000;    // default fee ~10,000 sat (~฿1.5)

/* ────────────────────────────────────────────────────────────────────
   BTC UTILITY — Base58Check + encoding helpers
──────────────────────────────────────────────────────────────────── */
const BTC_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function btcB58Enc(buf) {
  let d = [0];
  for (const b of buf) {
    let c = b;
    for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; }
    while (c > 0) { d.push(c % 58); c = (c / 58) | 0; }
  }
  let s = '';
  for (let i = 0; i < buf.length && buf[i] === 0; i++) s += '1';
  for (let i = d.length - 1; i >= 0; i--) s += BTC_B58[d[i]];
  return s;
}

function btcB58Dec(s) {
  const m = {};
  for (let i = 0; i < BTC_B58.length; i++) m[BTC_B58[i]] = i;
  let b = [0];
  for (const c of s) {
    if (!(c in m)) throw new Error('Invalid Base58 char: ' + c);
    let v = m[c];
    for (let j = 0; j < b.length; j++) { v += b[j] * 58; b[j] = v & 0xff; v >>= 8; }
    while (v > 0) { b.push(v & 0xff); v >>= 8; }
  }
  for (let i = 0; i < s.length && s[i] === '1'; i++) b.push(0);
  return new Uint8Array(b.reverse());
}

function btcDsha256(buf) {
  const { sha256 } = window.btcCrypto;
  return sha256(sha256(buf));
}

function btcB58Check(payload) {
  const cs   = btcDsha256(payload).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload); full.set(cs, payload.length);
  return btcB58Enc(full);
}

function btcB58CheckDec(s) {
  const raw = btcB58Dec(s);
  const pay = raw.slice(0, -4);
  const cs  = raw.slice(-4);
  const cs2 = btcDsha256(pay).slice(0, 4);
  if (!cs.every((b, i) => b === cs2[i])) throw new Error('Invalid checksum');
  return pay;
}

function btcHexToBytes(h) {
  return new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)));
}

function btcBytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function btcConcat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function btcU32LE(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function btcU64LE(n) {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint32(0, n >>> 0, true);
  v.setUint32(4, Math.floor(n / 0x100000000) >>> 0, true);
  return b;
}

function btcVarInt(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const b = new Uint8Array(3); b[0] = 0xfd;
    new DataView(b.buffer).setUint16(1, n, true); return b;
  }
  const b = new Uint8Array(5); b[0] = 0xfe;
  new DataView(b.buffer).setUint32(1, n, true); return b;
}

/* ────────────────────────────────────────────────────────────────────
   BECH32 ENCODER — สำหรับ Native SegWit (bc1q...) P2WPKH
   ตาม BIP173 spec
──────────────────────────────────────────────────────────────────── */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function _bech32Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = (chk & 0x1ffffff) << 5 ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= BECH32_GEN[i];
  }
  return chk;
}

function _bech32HrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function _bech32CreateChecksum(hrp, data) {
  const values = _bech32HrpExpand(hrp).concat(data).concat([0,0,0,0,0,0]);
  const polymod = _bech32Polymod(values) ^ 1;
  const ret = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function _bech32Encode(hrp, data) {
  const combined = data.concat(_bech32CreateChecksum(hrp, data));
  return hrp + '1' + combined.map(d => BECH32_CHARSET[d]).join('');
}

function _convertbits(data, frombits, tobits, pad) {
  let acc = 0, bits = 0;
  const ret = [];
  const maxv = (1 << tobits) - 1;
  for (const value of data) {
    acc = (acc << frombits) | value;
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (tobits - bits)) & maxv);
  return ret;
}

// encode 20-byte hash → bc1q... (P2WPKH witness v0)
function btcSegwitEncode(hash20) {
  const converted = _convertbits(Array.from(hash20), 8, 5, true);
  return _bech32Encode('bc', [0].concat(converted)); // witness version 0
}

/* ────────────────────────────────────────────────────────────────────
   BTC WALLET GENERATOR
──────────────────────────────────────────────────────────────────── */
function btcGenerateWallet() {
  if (!window.btcCrypto) throw new Error('btcCrypto ยังไม่โหลด');
  const { secp, sha256, ripemd160 } = window.btcCrypto;

  // 1. random 32-byte private key
  const privKey = crypto.getRandomValues(new Uint8Array(32));

  // 2. secp256k1 → compressed public key (33 bytes)
  const pubKey = secp.getPublicKey(privKey, true);

  // 3. SHA256 → RIPEMD160 → 20-byte pubKeyHash
  const pubKeyHash = ripemd160(sha256(pubKey));

  // 4a. Native SegWit P2WPKH (bc1q...) — Primary address ตรงกับ Binance
  const addressSegWit = btcSegwitEncode(pubKeyHash);

  // 4b. Legacy P2PKH (1xxx) — สำรอง
  const addrPayload = new Uint8Array(21);
  addrPayload[0] = 0x00;
  addrPayload.set(pubKeyHash, 1);
  const addressLegacy = btcB58Check(addrPayload);

  // 5. WIF (Wallet Import Format) compressed — starts K or L
  const wifPayload = new Uint8Array(34);
  wifPayload[0]  = 0x80;          // mainnet
  wifPayload.set(privKey, 1);
  wifPayload[33] = 0x01;          // compressed flag
  const privateKeyWIF = btcB58Check(wifPayload);

  // 6. Private key hex (สำรอง)
  const privateKeyHex = btcBytesToHex(privKey);

  // address = bc1q (Native SegWit) — ตรงกับ Binance Web3 Wallet
  return { address: addressSegWit, addressLegacy, privateKey: privateKeyWIF, privateKeyHex };
}

/* ────────────────────────────────────────────────────────────────────
   BTC WIF DECODE (สำหรับ Import + Sign)
──────────────────────────────────────────────────────────────────── */
function btcWIFtoPrivKey(wif) {
  const payload = btcB58CheckDec(wif);
  // payload[0] = 0x80 (version), payload[1..32] = privKey, payload[33] = 0x01 (compressed flag)
  if (payload[0] !== 0x80) throw new Error('Invalid WIF version byte');
  return payload.slice(1, 33); // 32-byte private key
}

function btcValidateWIF(wif) {
  try {
    if (!wif || (wif[0] !== 'K' && wif[0] !== 'L' && wif[0] !== '5')) return false;
    const raw = btcWIFtoPrivKey(wif);
    return raw.length === 32;
  } catch (e) { return false; }
}

function btcDeriveAddressFromWIF(wif) {
  const { secp, sha256, ripemd160 } = window.btcCrypto;
  const privKey    = btcWIFtoPrivKey(wif);
  const pubKey     = secp.getPublicKey(privKey, true);
  const pubKeyHash = ripemd160(sha256(pubKey));
  // Native SegWit bc1q — ตรงกับ Binance
  return btcSegwitEncode(pubKeyHash);
}

function btcDeriveSegWitFromWIF(wif) {
  return btcDeriveAddressFromWIF(wif); // alias ชัดเจน
}

function btcDeriveLegacyFromWIF(wif) {
  const { secp, sha256, ripemd160 } = window.btcCrypto;
  const privKey    = btcWIFtoPrivKey(wif);
  const pubKey     = secp.getPublicKey(privKey, true);
  const pubKeyHash = ripemd160(sha256(pubKey));
  const addrPayload = new Uint8Array(21);
  addrPayload[0] = 0x00;
  addrPayload.set(pubKeyHash, 1);
  return btcB58Check(addrPayload); // Legacy 1xxx
}

/* ────────────────────────────────────────────────────────────────────
   BTC ADDRESS VALIDATION
──────────────────────────────────────────────────────────────────── */
function btcValidateAddress(addr) {
  try {
    if (!addr) return false;
    // Native SegWit bc1q (P2WPKH) — 42 chars
    if (/^bc1q[ac-hj-np-z02-9]{38,59}$/.test(addr)) return true;
    // Legacy P2PKH 1xxx
    if (/^[1][a-km-zA-HJ-NP-Z1-9]{25,33}$/.test(addr)) {
      btcB58CheckDec(addr);
      return true;
    }
    return false;
  } catch (e) { return false; }
}

/* ────────────────────────────────────────────────────────────────────
   BTC BALANCE + UTXO — Mempool.space API
──────────────────────────────────────────────────────────────────── */
async function btcGetBalance(address) {
  // Mempool.space (primary)
  try {
    const res  = await fetch(`${WLT_BTC_MEMPOOL}/address/${address}`);
    const data = await res.json();
    const confirmed   = data.chain_stats?.funded_txo_sum   - data.chain_stats?.spent_txo_sum;
    const unconfirmed = data.mempool_stats?.funded_txo_sum - data.mempool_stats?.spent_txo_sum;
    return { confirmed: confirmed || 0, unconfirmed: unconfirmed || 0, total: (confirmed || 0) + (unconfirmed || 0) };
  } catch (e) {
    // Fallback: BlockCypher
    try {
      const res  = await fetch(`${WLT_BTC_BLOCKCYPHER}/addrs/${address}/balance`);
      const data = await res.json();
      return { confirmed: data.balance || 0, unconfirmed: data.unconfirmed_balance || 0, total: (data.balance || 0) + (data.unconfirmed_balance || 0) };
    } catch (e2) { return { confirmed: 0, unconfirmed: 0, total: 0 }; }
  }
}

async function btcGetUTXOs(address) {
  // Mempool.space UTXO endpoint
  const res  = await fetch(`${WLT_BTC_MEMPOOL}/address/${address}/utxo`);
  const data = await res.json();
  // filter confirmed only (status.confirmed === true)
  return data
    .filter(u => u.status?.confirmed)
    .map(u => ({ txid: u.txid, vout: u.vout, value: u.value }));
}

async function btcGetFeeRate() {
  // ดึง recommended fee rate (sat/vB) จาก Mempool.space
  try {
    const res  = await fetch(`${WLT_BTC_MEMPOOL}/v1/fees/recommended`);
    const data = await res.json();
    return {
      fast:   data.fastestFee   || 50,
      normal: data.halfHourFee  || 20,
      slow:   data.hourFee      || 10,
    };
  } catch (e) { return { fast: 50, normal: 20, slow: 10 }; }
}

/* ────────────────────────────────────────────────────────────────────
   BTC TX BUILDER + SIGNER (P2PKH)
──────────────────────────────────────────────────────────────────── */
function btcBuildAndSignTx(wifKey, utxos, toAddress, toSatoshi, changeAddress, feeRateSatPerVB) {
  if (!window.btcCrypto) throw new Error('btcCrypto ไม่พร้อม');
  const { secp, sha256, ripemd160 } = window.btcCrypto;

  const privKey    = btcWIFtoPrivKey(wifKey);
  const pubKey     = secp.getPublicKey(privKey, true);
  const pubKeyHash = ripemd160(sha256(pubKey));

  // ─── Script builders ───
  // P2WPKH scriptPubKey: OP_0 OP_DATA(20) <hash>
  function p2wpkhScript(h20) {
    const s = new Uint8Array(22);
    s[0] = 0x00; s[1] = 0x14;
    s.set(h20, 2);
    return s;
  }
  // P2PKH scriptPubKey (สำหรับ output ไปยัง legacy 1xxx)
  function p2pkhScript(h20) {
    const s = new Uint8Array(25);
    s[0] = 0x76; s[1] = 0xa9; s[2] = 0x14;
    s.set(h20, 3);
    s[23] = 0x88; s[24] = 0xac;
    return s;
  }

  // decode any address → 20-byte hash + script
  function addrToScript(addr) {
    if (addr.startsWith('bc1q')) {
      // bech32 decode → extract 20-byte witness program
      const dc = BECH32_CHARSET;
      const pos = addr.lastIndexOf('1');
      const data = addr.slice(pos + 1).split('').map(c => dc.indexOf(c));
      // remove checksum (last 6), skip witness version (first 1)
      const prog5 = data.slice(1, data.length - 6);
      const prog8 = [];
      let acc = 0, bits = 0;
      for (const v of prog5) {
        acc = (acc << 5) | v; bits += 5;
        if (bits >= 8) { bits -= 8; prog8.push((acc >> bits) & 0xff); }
      }
      return p2wpkhScript(new Uint8Array(prog8));
    }
    // Legacy P2PKH
    return p2pkhScript(btcB58CheckDec(addr).slice(1));
  }

  // ─── estimate TX size (SegWit vBytes) ───
  // P2WPKH input: 41 non-witness + 108 witness / 4 = ~68 vBytes
  // output P2WPKH: 31 vBytes, P2PKH: 34 vBytes, overhead: 10.5 vBytes
  const estimatedVBytes = Math.ceil(utxos.length * 68 + 2 * 31 + 10.5);
  const feeSat = feeRateSatPerVB
    ? Math.ceil(estimatedVBytes * feeRateSatPerVB)
    : WLT_BTC_FEE_SAT;

  const totalIn = utxos.reduce((s, u) => s + u.value, 0);
  const change  = totalIn - toSatoshi - feeSat;
  if (change < 0) throw new Error(`ยอดไม่พอ: มี ${totalIn} sat ต้องการ ${toSatoshi + feeSat} sat (fee: ${feeSat})`);

  // scriptCode สำหรับ BIP143 sighash: OP_DUP OP_HASH160 OP_DATA(20) <hash> OP_EQUALVERIFY OP_CHECKSIG
  const scriptCode = btcConcat(
    new Uint8Array([0x19, 0x76, 0xa9, 0x14]),
    pubKeyHash,
    new Uint8Array([0x88, 0xac])
  );

  const outputScripts = [{ script: addrToScript(toAddress), value: toSatoshi }];
  if (change > WLT_BTC_DUST) {
    outputScripts.push({ script: addrToScript(changeAddress), value: change });
  }

  // ─── BIP143 SegWit sighash preimage ───
  const hashPrevouts = btcDsha256(btcConcat(...utxos.map(u =>
    btcConcat(new Uint8Array([...btcHexToBytes(u.txid)].reverse()), btcU32LE(u.vout))
  )));
  const hashSequence = btcDsha256(btcConcat(...utxos.map(() =>
    new Uint8Array([0xff, 0xff, 0xff, 0xff])
  )));
  const hashOutputs = btcDsha256(btcConcat(...outputScripts.map(o =>
    btcConcat(btcU64LE(o.value), btcVarInt(o.script.length), o.script)
  )));

  // ─── Sign each input (BIP143 P2WPKH) ───
  const witnesses = utxos.map(utxo => {
    const preimage = btcConcat(
      btcU32LE(2),                                                    // nVersion (SegWit uses v2)
      hashPrevouts,
      hashSequence,
      new Uint8Array([...btcHexToBytes(utxo.txid)].reverse()),        // outpoint txid
      btcU32LE(utxo.vout),                                            // outpoint index
      scriptCode,                                                     // scriptCode
      btcU64LE(utxo.value),                                           // value of input
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),                       // nSequence
      hashOutputs,
      btcU32LE(0),                                                    // nLocktime
      btcU32LE(1)                                                     // SIGHASH_ALL
    );
    const sigHash  = btcDsha256(preimage);
    const derSig   = secp.signSync(sigHash, privKey, { canonical: true, der: true });
    const sigFinal = new Uint8Array([...derSig, 0x01]);
    return [sigFinal, pubKey]; // witness stack: [sig, pubkey]
  });

  // ─── Assemble SegWit TX (BIP141) ───
  const inputs = utxos.map((u, i) => btcConcat(
    new Uint8Array([...btcHexToBytes(u.txid)].reverse()),
    btcU32LE(u.vout),
    new Uint8Array([0x00]),          // scriptSig empty (P2WPKH)
    new Uint8Array([0xff, 0xff, 0xff, 0xff])
  ));
  const outputs = outputScripts.map(o =>
    btcConcat(btcU64LE(o.value), btcVarInt(o.script.length), o.script)
  );
  const witnessData = witnesses.map(stack =>
    btcConcat(
      btcVarInt(stack.length),
      ...stack.map(item => btcConcat(btcVarInt(item.length), item))
    )
  );

  const rawTx = btcConcat(
    btcU32LE(2),                          // version 2
    new Uint8Array([0x00, 0x01]),          // segwit marker + flag
    btcVarInt(inputs.length), ...inputs,
    btcVarInt(outputs.length), ...outputs,
    ...witnessData,
    btcU32LE(0)                           // locktime
  );

  const txHex = btcBytesToHex(rawTx);
  const txId  = btcBytesToHex(btcDsha256(rawTx).reverse());

  return { txHex, txId, feeSat, changeSat: change > WLT_BTC_DUST ? change : 0, sizeBytes: rawTx.length };
}

/* ────────────────────────────────────────────────────────────────────
   BTC BROADCAST TX — Mempool.space
──────────────────────────────────────────────────────────────────── */
async function btcBroadcastTx(txHex) {
  const res = await fetch(`${WLT_BTC_MEMPOOL}/tx`, {
    method  : 'POST',
    headers : { 'Content-Type': 'text/plain' },
    body    : txHex,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Broadcast failed: ' + errText.slice(0, 200));
  }
  return await res.text(); // returns TXID
}

/* ────────────────────────────────────────────────────────────────────
   BTC SEND — main flow (UTXO fetch → build → sign → broadcast)
──────────────────────────────────────────────────────────────────── */
async function wltBtcSend(wifKey, fromAddress, toAddress, amountBTC, feeLevel = 'normal') {
  // 1. validate
  if (!btcValidateAddress(toAddress)) throw new Error('Bitcoin Address ไม่ถูกต้อง (bc1q... หรือ 1...)');
  const satoshi = Math.round(amountBTC * 1e8);
  if (satoshi < WLT_BTC_DUST) throw new Error('จำนวนน้อยเกินไป (ขั้นต่ำ 546 sat)');

  // 2. fetch fee rate
  const feeRates   = await btcGetFeeRate();
  const feeRate    = feeRates[feeLevel] || feeRates.normal;

  // 3. fetch UTXOs
  const utxos = await btcGetUTXOs(fromAddress);
  if (utxos.length === 0) throw new Error('ไม่มี UTXO — ยังไม่มียอดที่ confirmed');

  const totalAvail = utxos.reduce((s, u) => s + u.value, 0);
  if (totalAvail < satoshi + WLT_BTC_FEE_SAT) {
    throw new Error(`ยอดไม่พอ: มี ${(totalAvail / 1e8).toFixed(8)} BTC`);
  }

  // 4. coin selection (largest-first simple)
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  let selected = [], acc = 0;
  for (const u of sorted) {
    selected.push(u);
    acc += u.value;
    if (acc >= satoshi + feeRate * 250) break;  // rough estimate
  }

  // 5. build + sign TX
  const { txHex, txId, feeSat, sizeBytes } = btcBuildAndSignTx(
    wifKey, selected, toAddress, satoshi, fromAddress, feeRate
  );

  // 6. broadcast
  const broadcastId = await btcBroadcastTx(txHex);

  return { txId: broadcastId || txId, feeSat, sizeBytes };
}

/* ────────────────────────────────────────────────────────────────────
   UI INTEGRATION — hook เข้า wlt system เดิม
──────────────────────────────────────────────────────────────────── */

/* ── Override wltDoCreate: เพิ่ม BTC path ── */
const _origWltDoCreate = window.wltDoCreate;
window.wltDoCreate = async function () {
  if (wlt.selectedChain !== 'BTC') return _origWltDoCreate();
  const label = document.getElementById('wlt-create-label')?.value.trim();
  const pwd   = document.getElementById('wlt-create-pwd')?.value;
  const btn   = document.getElementById('wlt-create-btn');
  if (!label || !pwd) return;
  if (!window.btcCrypto) { showToast('⚠️ btcCrypto ยังไม่โหลด กรุณารอสักครู่'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังสร้าง BTC...'; }
  try {
    const btcWallet = btcGenerateWallet();
    const { encrypted_pk, iv, salt } = await wltEncryptPK(btcWallet.privateKey, pwd);
    wlt.pendingWallet = {
      label, chain: 'BTC',
      address: btcWallet.address,
      mnemonic: '(Bitcoin Native SegWit — ไม่มี Mnemonic, ใช้ WIF Private Key restore)',
      privateKey: btcWallet.privateKey,  // WIF format
      encrypted_pk, iv, salt,
    };
    wltRenderBackup();
    wltGoto('backup');
  } catch (e) {
    showToast('❌ สร้าง BTC wallet ไม่สำเร็จ: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'สร้างกระเป๋า'; }
  }
};

/* ── Override wltDoImport: เพิ่ม BTC path ── */
const _origWltDoImport = window.wltDoImport;
window.wltDoImport = async function () {
  if (wlt.selectedChainImp !== 'BTC') return _origWltDoImport();
  const pk    = document.getElementById('wlt-imp-pk')?.value.trim();
  const pwd   = document.getElementById('wlt-imp-pwd')?.value;
  const pwd2  = document.getElementById('wlt-imp-pwd2')?.value;
  const label = document.getElementById('wlt-imp-label')?.value.trim() || 'BTC Import';
  if (!pk || !pwd) { showToast('กรุณากรอก WIF และ Password'); return; }
  if (pwd !== pwd2) { showToast('Password ไม่ตรงกัน'); return; }
  if (!btcValidateWIF(pk)) { showToast('❌ Bitcoin WIF ไม่ถูกต้อง (ต้องขึ้นด้วย K, L หรือ 5)'); return; }
  try {
    const address = btcDeriveAddressFromWIF(pk);
    const { encrypted_pk, iv, salt } = await wltEncryptPK(pk, pwd);
    wlt.pendingWallet = { label, chain: 'BTC', address, mnemonic: '(imported)', privateKey: pk, encrypted_pk, iv, salt };
    await wltSaveWallet();
    wltGoto('success');
  } catch (e) { showToast('❌ Import BTC ไม่สำเร็จ: ' + e.message); }
};

/* ── Override wltValidateImportPK: เพิ่ม BTC path ── */
const _origValidate = window.wltValidateImportPK;
window.wltValidateImportPK = function () {
  if (wlt.selectedChainImp !== 'BTC') return _origValidate();
  const pk      = document.getElementById('wlt-imp-pk')?.value.trim();
  const preview = document.getElementById('wlt-imp-addr-preview');
  if (!preview) return;
  if (!pk) { preview.style.display = 'none'; return; }
  try {
    if (!btcValidateWIF(pk)) { preview.style.display = 'none'; return; }
    const addr = btcDeriveAddressFromWIF(pk);
    preview.style.display = 'block';
    preview.style.color   = 'var(--g)';
    preview.textContent   = '✅ BTC Address: ' + addr;
  } catch (e) {
    preview.style.display = 'block';
    preview.style.color   = 'var(--r)';
    preview.textContent   = '❌ WIF ไม่ถูกต้อง';
  }
};

/* ── Override wltDoSend: เพิ่ม BTC path ── */
const _origWltDoSend = window.wltDoSend;
window.wltDoSend = async function () {
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const ws    = wltGetLocalWallets();
  const rec   = ws.find(w => w.id === selId);
  if (rec?.chain !== 'BTC') return _origWltDoSend();

  const toAddr = document.getElementById('wlt-send-to')?.value.trim();
  const amount = parseFloat(document.getElementById('wlt-send-amount')?.value) || 0;
  const pwd    = document.getElementById('wlt-send-pwd')?.value;
  const feeLevel = document.getElementById('wlt-btc-fee-level')?.value || 'normal';

  if (!toAddr)   { showToast('กรุณากรอก Bitcoin Address'); return; }
  if (amount<=0) { showToast('กรุณากรอกจำนวนที่ถูกต้อง'); return; }
  if (!pwd)      { showToast('กรุณากรอก Wallet Password'); return; }
  if (!btcValidateAddress(toAddr)) { showToast('❌ Bitcoin Address ไม่ถูกต้อง'); return; }

  showToast('🔓 กำลัง Decrypt & Sign BTC TX...');
  try {
    const wifKey = await wltDecryptPK(rec.encrypted_pk, rec.iv, rec.salt, pwd);
    if (!wifKey) { showToast('❌ Password ไม่ถูกต้อง'); return; }

    const { txId, feeSat, sizeBytes } = await wltBtcSend(wifKey, rec.address, toAddr, amount, feeLevel);

    showToast(`✅ BTC ส่งแล้ว! Fee: ${feeSat} sat | ${sizeBytes}B`);
    wltSaveTxHistory({ type:'send', token:'BTC', amount, to:toAddr, hash:txId, status:'pending', chain:'BTC' });
    wltRefreshBalance();
    wltGoto('history');
  } catch (e) {
    showToast('❌ ส่ง BTC ไม่สำเร็จ: ' + e.message.slice(0, 80));
  }
};

/* ── Override wltRefreshBalance: เพิ่ม BTC balance query ── */
const _origRefreshBalance = window.wltRefreshBalance;
window.wltRefreshBalance = async function () {
  await _origRefreshBalance();  // EVM + SOL ทำงานก่อน
  const btcWallets = wltGetLocalWallets().filter(w => w.chain === 'BTC');
  if (btcWallets.length === 0) return;

  await wltFetchPrices();  // ดึง BTC price ด้วย
  let totalBtcSat = 0;

  for (const w of btcWallets) {
    try {
      const bal  = await btcGetBalance(w.address);
      totalBtcSat += bal.confirmed;
      const btcAmt = bal.confirmed / 1e8;
      const cardEl = document.getElementById('wlt-card-bal-' + w.id);
      if (cardEl) cardEl.textContent = btcAmt.toFixed(8) + ' BTC';
    } catch (e) { /* skip */ }
  }

  wlt.btcBal = totalBtcSat / 1e8;
  // อัปเดต BTC UI elements
  const btcBalEl  = document.getElementById('wlt-btc-bal');
  const btcThbEl  = document.getElementById('wlt-btc-thb');
  const btcRowEl  = document.getElementById('wlt-btc-row');
  const btcThb    = wlt.btcBal * (wlt.btcPriceTHB || 0);
  if (btcBalEl)  btcBalEl.textContent  = wlt.btcBal.toFixed(8);
  if (btcThbEl)  btcThbEl.textContent  = '≈ ฿' + btcThb.toLocaleString('th-TH', {maximumFractionDigits:2});
  if (btcRowEl)  btcRowEl.style.display = btcWallets.length > 0 ? 'flex' : 'none';
};

/* ── Override wltFetchPrices: เพิ่ม BTC price ── */
const _origFetchPrices = window.wltFetchPrices || (async()=>{});
window.wltFetchPrices = async function () {
  await _origFetchPrices();
  // BTC price (ถ้า CoinGecko URL ยังไม่รวม bitcoin)
  if (!wlt.btcPriceTHB) {
    try {
      const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=thb,usd');
      const data = await res.json();
      wlt.btcPriceTHB = data?.bitcoin?.thb || 0;
      wlt.btcPriceUSD = data?.bitcoin?.usd || 0;
    } catch (e) {}
  }
};

/* ── Override wltUpdateSendBalance: เพิ่ม BTC ── */
const _origUpdateSendBal = window.wltUpdateSendBalance;
window.wltUpdateSendBalance = function () {
  _origUpdateSendBal();
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const ws    = wltGetLocalWallets();
  const rec   = ws.find(w => w.id === selId);
  if (rec?.chain !== 'BTC') return;
  const avail = document.getElementById('wlt-send-avail');
  const locked = document.getElementById('wlt-send-locked');
  if (avail)  avail.textContent  = (wlt.btcBal || 0).toFixed(8) + ' BTC';
  if (locked) locked.textContent = '0';
  // แสดง fee level selector
  const feeRow = document.getElementById('wlt-btc-fee-row');
  if (feeRow) feeRow.style.display = 'block';
};

/* ── Override wltUpdateSendTokenOptions: เพิ่ม BTC ── */
const _origUpdateTokOpts = window.wltUpdateSendTokenOptions;
window.wltUpdateSendTokenOptions = function () {
  _origUpdateTokOpts();
  const selId = document.getElementById('wlt-send-wallet-sel')?.value;
  const ws    = wltGetLocalWallets();
  const rec   = ws.find(w => w.id === selId);
  const tokSel   = document.getElementById('wlt-send-token');
  const feeLabel = document.getElementById('wlt-send-fee-label');
  const feeRow   = document.getElementById('wlt-btc-fee-row');
  if (rec?.chain === 'BTC') {
    if (tokSel) {
      Array.from(tokSel.options).forEach(o => { o.style.display = o.value === 'BTC' ? '' : 'none'; });
      tokSel.value = 'BTC';
    }
    if (feeLabel) feeLabel.textContent = 'Fee คำนวณจาก fee rate (sat/vB) × ขนาด TX';
    if (feeRow)   feeRow.style.display = 'block';
  } else {
    if (feeRow) feeRow.style.display = 'none';
  }
};

/* ── Override wltOpenTxDetail: เพิ่ม BTC explorer ── */
const _origOpenTxDetail = window.wltOpenTxDetail;
window.wltOpenTxDetail = function (hash, chain) {
  if (chain === 'BTC') { window.open('https://mempool.space/tx/' + hash, '_blank'); return; }
  _origOpenTxDetail(hash, chain);
};

/* ── Override wltRenderBackup: เพิ่ม BTC note ── */
const _origRenderBackup = window.wltRenderBackup || function(){};

/* ── wltShowTokenDetail: เพิ่ม BTC ── */
const _origShowToken = window.wltShowTokenDetail;
window.wltShowTokenDetail = function (token) {
  if (token === 'BTC') {
    showToast('BTC: ' + (wlt.btcBal || 0).toFixed(8) + ' | ≈ ฿' + ((wlt.btcBal||0) * (wlt.btcPriceTHB||0)).toLocaleString('th-TH',{maximumFractionDigits:2}));
    return;
  }
  _origShowToken(token);
};

/* ── BTC fee level selector helper ── */
window.wltBtcSelectFee = function(el, level) {
  document.querySelectorAll('#wlt-btc-fee-row .wlt-chain-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  const inp = document.getElementById('wlt-btc-fee-level');
  if (inp) inp.value = level;
};

/* ── BTC wallet card badge สีส้ม ── */
// patch wltRenderWalletCards เพื่อ BTC badge สีถูกต้อง
const _origRenderCards = window.wltRenderWalletCards;
window.wltRenderWalletCards = function() {
  _origRenderCards();
  // patch BTC card badges
  wltGetLocalWallets().filter(w=>w.chain==='BTC').forEach(w=>{
    const card = document.querySelector('[data-wallet-id="'+w.id+'"] .wlt-wallet-chain');
    if (card) { card.style.color='#f7931a'; card.style.background='#f7931a22'; }
  });
};

/* ── Sync BTC balance ใน Overview + Home tab ── */
const _origHmSync = window._hmSyncWalletBalance;
window._hmSyncWalletBalance = function() {
  if (typeof _origHmSync === 'function') _origHmSync();
  const btcThb = (wlt.btcBal||0) * (wlt.btcPriceTHB||0);
  // อัปเดต total (ถ้า _origHmSync ไม่รวม BTC แล้ว)
  const totEl = document.getElementById('hm-wlt-total');
  if (totEl && wlt.btcBal > 0) {
    // ดึงยอด existing แล้วบวก BTC
    const existing = parseFloat(totEl.textContent) || 0;
    // note: _origHmSync set ค่าแล้ว — BTC จะถูกรวมใน next refresh cycle
  }
};

/* ── Expose BTC functions ให้ outer scope (_hmWltInitCreate / _hmWltInitImport) เรียกได้ ── */
window.btcGenerateWallet       = btcGenerateWallet;
window.btcValidateWIF          = btcValidateWIF;
window.btcDeriveAddressFromWIF = btcDeriveAddressFromWIF;  // returns bc1q (Native SegWit)
window.btcDeriveSegWitFromWIF  = btcDeriveSegWitFromWIF;   // alias
window.btcDeriveLegacyFromWIF  = btcDeriveLegacyFromWIF;   // returns 1xxx (Legacy)
window.btcValidateAddress      = btcValidateAddress;        // รับทั้ง bc1q และ 1xxx
window.btcSegwitEncode         = btcSegwitEncode;
window.btcWIFtoPrivKey         = btcWIFtoPrivKey;
window.wltBtcSend              = wltBtcSend;


/* ════════════════════════════════════════════════════════════════
   WALLET QR SHARE SHEET
   - render QR preview ใน share sheet
   - download QR เป็น PNG
   - แชร์ผ่าน social ทุกแพลตฟอร์ม
════════════════════════════════════════════════════════════════ */

/* social platforms ที่รองรับ */
const _sharePlatforms = [
  { id:'line',      icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#06C755"/><text x="20" y="27" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">L</text></svg>', label:'LINE',      fn: (addr,qrB64) => { window.open(`https://line.me/R/msg/text/?${encodeURIComponent('TCC Wallet Address:\n' + addr)}`, '_blank'); } },
  { id:'telegram',  icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#229ED9"/><text x="20" y="27" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">✈</text></svg>', label:'Telegram',  fn: (addr) => { window.open(`https://t.me/share/url?url=${encodeURIComponent(addr)}&text=${encodeURIComponent('TCC Wallet Address: ' + addr)}`, '_blank'); } },
  { id:'whatsapp',  icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#25D366"/><text x="20" y="27" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">W</text></svg>', label:'WhatsApp', fn: (addr) => { window.open(`https://wa.me/?text=${encodeURIComponent('TCC Wallet Address:\n' + addr)}`, '_blank'); } },
  { id:'facebook',  icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1877F2"/><text x="20" y="27" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">f</text></svg>', label:'Facebook', fn: (addr) => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://blockchair.com/bitcoin/address/' + addr)}`, '_blank'); } },
  { id:'twitter',   icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#000"/><text x="20" y="27" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">𝕏</text></svg>', label:'X',         fn: (addr) => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('My TCC Wallet Address:\n' + addr)}`, '_blank'); } },
  { id:'instagram', icon:'<svg width="28" height="28" viewBox="0 0 40 40"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f09433"/><stop offset="25%" stop-color="#e6683c"/><stop offset="50%" stop-color="#dc2743"/><stop offset="75%" stop-color="#cc2366"/><stop offset="100%" stop-color="#bc1888"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#ig)"/><text x="20" y="27" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">📷</text></svg>', label:'Instagram', fn: (addr, qrB64) => { _wltShareDownloadAndPrompt(addr, qrB64, 'Instagram'); } },
  { id:'tiktok',    icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#010101"/><text x="20" y="27" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">♪</text></svg>', label:'TikTok',   fn: (addr, qrB64) => { _wltShareDownloadAndPrompt(addr, qrB64, 'TikTok'); } },
  { id:'email',     icon:'<svg width="28" height="28" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#EA4335"/><text x="20" y="27" font-size="17" text-anchor="middle" fill="#fff" font-family="sans-serif">✉</text></svg>', label:'Email',    fn: (addr) => { window.open(`mailto:?subject=${encodeURIComponent('TCC Wallet Address')}&body=${encodeURIComponent('My TCC Wallet Address:\n' + addr)}`, '_blank'); } },
];

/* state */
let _shareCurrentAddr = '';
let _shareCurrentQrB64 = '';

/* เปิด share sheet */
window.wltOpenShareSheet = function(addr, qrEl) {
  if (!addr) return;
  _shareCurrentAddr = addr;

  // title / addr sub
  const titleEl = document.getElementById('wlt-share-title');
  const subEl   = document.getElementById('wlt-share-addr-sub');
  if (titleEl) titleEl.textContent = 'แชร์ QR Code';
  if (subEl)   subEl.textContent   = addr;

  // render QR preview ใน share sheet
  const previewWrap = document.getElementById('wlt-share-qr-preview');
  if (previewWrap) {
    previewWrap.innerHTML = '';
    try {
      new QRCode(previewWrap, {
        text: addr, width: 200, height: 200,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L,
      });
    } catch(e) {
      previewWrap.textContent = addr;
    }
    // รอ QRCode render แล้วดึง canvas → base64
    setTimeout(() => {
      const canvas = previewWrap.querySelector('canvas');
      _shareCurrentQrB64 = canvas ? canvas.toDataURL('image/png') : '';
      _buildSocialGrid();
    }, 120);
  } else {
    _buildSocialGrid();
  }

  // แสดง sheet
  const sheet = document.getElementById('wlt-share-sheet');
  if (sheet) { sheet.style.display = 'flex'; }
};

/* ปิด share sheet */
window.wltCloseShareSheet = function() {
  const sheet = document.getElementById('wlt-share-sheet');
  if (sheet) sheet.style.display = 'none';
};

/* สร้าง social grid */
function _buildSocialGrid() {
  const grid = document.getElementById('wlt-share-social-grid');
  if (!grid) return;
  grid.innerHTML = _sharePlatforms.map(p => `
    <button onclick="wltShareViaPlatform('${p.id}')" style="display:flex;flex-direction:column;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:10px 4px;cursor:pointer;color:var(--t1)">
      ${p.icon}
      <span style="font-size:10px;font-family:var(--sans)">${p.label}</span>
    </button>
  `).join('');
}

/* แชร์ผ่าน platform */
window.wltShareViaPlatform = function(id) {
  const p = _sharePlatforms.find(x => x.id === id);
  if (p) p.fn(_shareCurrentAddr, _shareCurrentQrB64);
};

/* download QR เป็น PNG */
window.wltShareDownloadQR = function() {
  if (!_shareCurrentQrB64) {
    // fallback: html2canvas ถ้ามี
    const preview = document.getElementById('wlt-share-qr-preview');
    if (typeof html2canvas !== 'undefined' && preview) {
      html2canvas(preview, { backgroundColor: '#ffffff' }).then(canvas => {
        _downloadDataUrl(canvas.toDataURL('image/png'), 'TCC_QR_' + _shareCurrentAddr.slice(0,8) + '.png');
      });
    } else {
      showToast('⚠️ ไม่สามารถ render QR image ได้');
    }
    return;
  }
  _downloadDataUrl(_shareCurrentQrB64, 'TCC_QR_' + _shareCurrentAddr.slice(0,8) + '.png');
  showToast('✅ บันทึก QR แล้ว!');
};

/* copy address จาก share sheet */
window.wltShareCopyAddr = function() {
  if (!_shareCurrentAddr) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(_shareCurrentAddr).then(() => showToast('📋 Copied!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = _shareCurrentAddr; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('📋 Copied!');
  }
};

/* helper: download dataURL */
function _downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* helper: platform ที่ไม่รองรับ share image url (Instagram, TikTok) → download ก่อนแล้ว prompt */
function _wltShareDownloadAndPrompt(addr, qrB64, platform) {
  if (qrB64) {
    _downloadDataUrl(qrB64, 'TCC_QR_' + addr.slice(0,8) + '.png');
  }
  showToast('✅ ดาวน์โหลด QR แล้ว! กรุณาอัปโหลดใน ' + platform);
}


})(); // end BTC IIFE


/* ─── SECTION 6: hmWlt Modal HTML + Share Sheet ─── */
(function _injectWalletModalHTML() {
  var _modalHtml = `


<!-- ══ WALLET QR SHARE SHEET ══ -->
<div id="wlt-share-sheet" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);align-items:flex-end;justify-content:center" onclick="if(event.target===this)wltCloseShareSheet()">
  <div style="background:var(--bg2);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:20px 16px 32px;box-shadow:0 -4px 32px rgba(0,0,0,.5)">
    <!-- Handle bar -->
    <div style="width:40px;height:4px;background:var(--border);border-radius:4px;margin:0 auto 16px"></div>
    <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:4px" id="wlt-share-title">แชร์ QR Code</div>
    <div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:16px;word-break:break-all" id="wlt-share-addr-sub"></div>

    <!-- QR Preview -->
    <div style="display:flex;justify-content:center;margin-bottom:16px">
      <div id="wlt-share-qr-preview" style="background:#fff;padding:10px;border-radius:10px;display:inline-block"></div>
    </div>

    <!-- Primary actions -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <button onclick="wltShareDownloadQR()" style="display:flex;align-items:center;justify-content:center;gap:6px;background:var(--y);color:#1a1a1a;border:none;border-radius:14px;padding:13px;font-size:13px;font-weight:700;cursor:pointer">
        ⬇️ บันทึก QR
      </button>
      <button onclick="wltShareCopyAddr()" style="display:flex;align-items:center;justify-content:center;gap:6px;background:var(--bg3);color:var(--t1);border:1px solid var(--border);border-radius:14px;padding:13px;font-size:13px;font-weight:600;cursor:pointer">
        📋 Copy Address
      </button>
    </div>

    <!-- Divider -->
    <div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:12px;letter-spacing:.5px">แชร์ผ่าน</div>

    <!-- Social grid -->
    <div id="wlt-share-social-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px">
      <!-- populated by JS -->
    </div>
  </div>
</div>
`;
  function _doInsert() {
    var ph = document.getElementById('wallet-modal-placeholder');
    if (ph) { ph.outerHTML = _modalHtml; }
    else { document.body.insertAdjacentHTML('beforeend', _modalHtml); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doInsert);
  } else { _doInsert(); }
})();
