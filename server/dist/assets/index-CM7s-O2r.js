(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))o(a);new MutationObserver(a=>{for(const r of a)if(r.type==="childList")for(const l of r.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&o(l)}).observe(document,{childList:!0,subtree:!0});function m(a){const r={};return a.integrity&&(r.integrity=a.integrity),a.referrerPolicy&&(r.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?r.credentials="include":a.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function o(a){if(a.ep)return;a.ep=!0;const r=m(a);fetch(a.href,r)}})();const k=document.querySelector("#app"),R=["CHARGE","GUARD_CHARGE","BEAM","GUARD","BEAM_GUARD","BIG_BEAM","TRAP","SEAL"];function w(e){switch(e){case"BEAM":return 1;case"BEAM_GUARD":return 2;case"BIG_BEAM":return 4;case"TRAP":return 1;case"SEAL":return 1;default:return 0}}function x(e){return e==="BEAM"||e==="BIG_BEAM"||e==="TRAP"||e==="SEAL"}function E(e){return e==="GUARD"||e==="BEAM_GUARD"||e==="GUARD_CHARGE"||e==="SEAL"}function B(e){switch(e){case"CHARGE":return"チャージ +1";case"GUARD_CHARGE":return"ガード付きチャージ +1（1回）";case"BEAM":return"ビーム -1（要ターゲット）";case"GUARD":return"ガード 0";case"BEAM_GUARD":return"ビームガード -2";case"BIG_BEAM":return"強ビーム -4（要ターゲット）";case"TRAP":return"罠 -1（要ターゲット）";case"SEAL":return"封印 -1（要ターゲット／そのターン防御）"}}function c(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}let t=null,i=null,p="接続中…",s=null,u=null,f=localStorage.getItem("marimo_name")??"player",g="";const G=location.protocol==="https:"?"wss":"ws",b=new WebSocket(`${G}://${location.host}/ws`);b.onopen=()=>{p="接続済み",d()};b.onclose=()=>{p="切断されました",d()};b.onmessage=e=>{const n=JSON.parse(e.data);n.type==="WELCOME"&&(i=n.youIndex,g=n.code??g,p=`入室：${n.code} / あなたは P${i+1}`),n.type==="ROOM_STATE"&&(t=n.state),n.type==="ERROR"&&(p=`エラー: ${n.message}`),d()};function v(e){b.send(JSON.stringify(e))}function A(){return!t||i===null?null:t.players[i]??null}function M(){return!t||i===null?[]:t.players.filter(e=>e.connected&&e.alive&&e.index!==i).map(e=>e.index)}function h(e){const n=A();return n?t?.status==="playing"&&!n.alive?{ok:!1,reason:"死亡中"}:e!=="BIG_BEAM"&&n.bannedActions.includes(e)?{ok:!1,reason:"封印中"}:n.trapForcedGuard&&!E(e)?{ok:!1,reason:"罠：防御必須"}:e==="GUARD_CHARGE"&&n.usedGuardCharge?{ok:!1,reason:"1回使用済み"}:n.energy<w(e)?{ok:!1,reason:"コスト不足"}:{ok:!0}:{ok:!1,reason:"状態未取得"}}function S(){localStorage.setItem("marimo_name",f),v({type:"CREATE_ROOM",name:f})}function T(){localStorage.setItem("marimo_name",f),v({type:"JOIN_ROOM",code:g,name:f})}function O(){console.log("[UI] START click",{ready:b.readyState,room:t,me:i}),v({type:"START"})}function _(e){s=e,x(e)||(u=null),d()}function I(e){u=e,d()}function C(){if(!t||i===null)return;if(!s)return p="行動を選んでね",d();const e=h(s);if(!e.ok)return p=`この行動は選べない：${e.reason??""}`,d();if(x(s)&&u===null)return p="ターゲットを選んでね",d();v({type:"ACTION",action:s,target:u}),p="送信した！",s=null,u=null,d()}function P(e){const n=i!==null&&e.index===i,o=[t?.hostIndex===e.index?'<span class="badge">HOST</span>':"",n?'<span class="badge blue">YOU</span>':"",e.connected?"":'<span class="badge gray">OFF</span>',e.connected&&!e.alive?'<span class="badge red">DEAD</span>':"",e.trapForcedGuard?'<span class="badge amber">TRAP!</span>':""].filter(Boolean).join(" "),a=(e.bannedActions??[]).filter(l=>l!=="BIG_BEAM"),r=a.length?a.join(", "):"なし";return`
    <div class="card ${n?"me":""}">
      <div class="row">
        <div class="title">P${e.index+1}</div>
        <div class="badges">${o}</div>
      </div>
      <div class="sub">${c(e.name??"player")}</div>
      <div class="stats">
        <div>エネルギー <b>${e.energy}</b></div>
        <div>封印 <b>${c(r)}</b></div>
        <div>ガードチャージ <b>${e.usedGuardCharge?"使用済み":"未使用"}</b></div>
      </div>
    </div>
  `}function d(){A();const e=M(),n=t?`ルーム <b>${t.code}</b> ／ 状態 <b>${t.status}</b> ／ Turn <b>${t.turn}</b> ／ あなた <b>${i!==null?"P"+(i+1):"-"}</b>`:"まだ入室してないよ",m=t&&t.status==="playing";k.innerHTML=`
  <style>
    *{box-sizing:border-box;}
    :root{
      --bd:#e7e7e7;
      --tx:#111;
      --mut:#666;
      --bg:#ffffff;
      --card:#fff;
      --shadow:0 8px 24px rgba(0,0,0,.08);
      --r:18px;
    }
    body{margin:0;background:#fafafa;color:var(--tx);}
    .wrap{max-width:980px;margin:0 auto;padding:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto;}
    .top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;}
    .h1{font-size:20px;font-weight:800;margin:0;}
    .meta{opacity:.8}
    .bar{margin-top:10px;border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);padding:12px;box-shadow:var(--shadow)}
    .row{display:flex;gap:10px;align-items:center;justify-content:space-between}
    .sub{opacity:.75;margin-top:6px;font-size:13px}
    input{padding:10px 12px;border-radius:14px;border:1px solid var(--bd);min-width:160px;font-size:14px}
    .btn{padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:#fff;font-weight:700;cursor:pointer}
    .btn:hover{transform:translateY(-1px)}
    .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
    .grid{display:grid;gap:12px;margin-top:12px}
    .players{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .card{border:1px solid var(--bd);border-radius:var(--r);background:var(--card);padding:12px;box-shadow:var(--shadow)}
    .card.me{outline:3px solid #c7f3ff}
    .title{font-size:16px;font-weight:900}
    .badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .badge{font-size:11px;padding:4px 8px;border-radius:999px;border:1px solid var(--bd);background:#f6f6f6}
    .badge.blue{background:#e7f6ff;border-color:#b7e6ff}
    .badge.red{background:#ffe8e8;border-color:#ffb8b8}
    .badge.gray{background:#f0f0f0;border-color:#ddd}
    .badge.amber{background:#fff3d6;border-color:#ffd38a}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;font-size:13px;opacity:.9}
    .panel{border:1px solid var(--bd);border-radius:var(--r);background:#fff;padding:12px;box-shadow:var(--shadow)}
    .actions{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
    .aBtn{
      padding:14px;border-radius:18px;border:1px solid var(--bd);
      background:#fff;font-size:15px;font-weight:800;text-align:left;
    }
    .aBtn small{display:block;font-weight:600;opacity:.75;margin-top:3px}
    .aBtn.pick{outline:3px solid #111}
    .aBtn.danger{background:#ffe7e7;border-color:#ffbdbd;color:#9a0000}
    .targets{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
    .tBtn{padding:12px 14px;border-radius:999px;border:1px solid var(--bd);background:#fff;font-weight:900}
    .tBtn.pick{outline:3px solid #111}
    .sticky{
      position:sticky;bottom:10px;margin-top:12px;
      border:1px solid var(--bd);border-radius:var(--r);background:rgba(255,255,255,.92);
      backdrop-filter:blur(6px);box-shadow:var(--shadow);padding:10px;
      display:flex;gap:10px;align-items:center;flex-wrap:wrap;
    }
    .big{font-size:18px}
    .logs{max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;margin-top:10px}
    .log{padding:8px 10px;border-radius:14px;background:#f7f7f7;margin-bottom:8px}
    .mut{opacity:.7}
    @media (max-width:520px){
      .players{grid-template-columns:1fr;}
      .actions{grid-template-columns:1fr;}
      .aBtn{font-size:16px;padding:16px}
      .btn{padding:14px 16px}
      input{min-width:140px}
      .stats{grid-template-columns:1fr}
    }
  </style>

  <div class="wrap">
    <div class="top">
      <div>
        <h2 class="h1">まりもゲーム（4人/ルーム制/指向性）</h2>
        <div class="meta">${c(p)}</div>
        <div class="sub">${n}</div>
      </div>
    </div>

    <div class="bar">
      <div class="row" style="flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${c(f)}" placeholder="名前" oninput="setName(this.value)" />
          <button class="btn" onclick="createRoom()">ルーム作成</button>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${c(g)}" placeholder="コード" oninput="setCode(this.value)" />
          <button class="btn" onclick="joinRoom()">参加</button>
          ${(()=>{const o=t?t.players.filter(l=>l&&l.connected).length:0,a=t&&i!==null&&t.hostIndex===i,r=!!t&&t.status==="lobby"&&a&&o>=2;return!t||!a?"":`
             <button class="btn" onclick="startMatch()" ${r?"":"disabled"}
              title="${r?"":"2人以上で開始できます"}">
              Start（HOST）
             </button>
           `})()}
        </div>
      </div>
      <div class="sub">
        友達に <b>ルームコード</b> を送って参加してもらってね（最大4人）
      </div>
    </div>

    ${t?`
      <div class="grid">
        <div>
          <div style="font-weight:900;margin-bottom:8px;">プレイヤー</div>
          <div class="players">
            ${t.players.map(P).join("")}
          </div>
        </div>

        ${m?`
          <div class="panel">
            <div style="font-weight:900;">行動</div>
            <div class="mut" style="margin-top:6px;">
              ※ BEAM / BIG_BEAM / TRAP / SEAL はターゲットが必要
            </div>

            <div class="actions">
              ${R.map(o=>{const a=h(o),r=!a.ok,l=s===o,$=r,y=r?a.reason??"":"";return`
                    <button
                      class="aBtn ${l?"pick":""} ${$?"danger":""}"
                      ${r?"disabled":""}
                      onclick="pickAction('${o}')"
                      title="${c(y)}"
                    >
                      ${c(B(o))}
                      <small>cost: ${w(o)} ${y?`／ ${c(y)}`:""}</small>
                    </button>
                  `}).join("")}
            </div>

            ${s&&x(s)?`
                  <div style="margin-top:12px;font-weight:900;">ターゲット</div>
                  <div class="targets">
                    ${e.length?e.map(o=>`
                            <button class="tBtn ${u===o?"pick":""}" onclick="pickTarget(${o})">
                              P${o+1}
                            </button>
                          `).join(""):'<div class="mut">ターゲットがいません（相手がいない/全滅）</div>'}
                  </div>
                `:""}

            <div class="sticky">
              <button class="btn big" onclick="submitAction()">送信</button>
              <div class="big">
                選択: <b>${s??"-"}</b>
                ${s&&x(s)?` → <b>${u!==null?"P"+(u+1):"-"}</b>`:""}
              </div>
            </div>
          </div>
        `:""}

        <div class="panel">
          <div style="font-weight:900;">ログ</div>
          <div class="logs">
            ${t.logs.length?t.logs.map(o=>`<div class="log">${c(o)}</div>`).join(""):'<div class="mut" style="margin-top:10px;">ログなし</div>'}
          </div>
        </div>
      </div>
    `:`
      <div class="panel" style="margin-top:12px;">
        <div style="font-weight:900;">まずはルーム作成か参加</div>
        <div class="mut" style="margin-top:8px;">
          ルーム作成 → 出たコードを友達に送る → みんなが参加 → HOSTがStart
        </div>
      </div>
    `}
  </div>
  `}window.setName=e=>{f=e,d()};window.setCode=e=>{g=e.toUpperCase().replace(/[^A-Z0-9]/g,""),d()};window.createRoom=()=>S();window.joinRoom=()=>T();window.startMatch=()=>O();window.pickAction=e=>_(e);window.pickTarget=e=>I(e);window.submitAction=()=>C();d();
