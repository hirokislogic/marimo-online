(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))o(a);new MutationObserver(a=>{for(const n of a)if(n.type==="childList")for(const u of n.addedNodes)u.tagName==="LINK"&&u.rel==="modulepreload"&&o(u)}).observe(document,{childList:!0,subtree:!0});function b(a){const n={};return a.integrity&&(n.integrity=a.integrity),a.referrerPolicy&&(n.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?n.credentials="include":a.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(a){if(a.ep)return;a.ep=!0;const n=b(a);fetch(a.href,n)}})();const k=document.querySelector("#app"),R=["CHARGE","GUARD_CHARGE","BEAM","GUARD","BEAM_GUARD","BIG_BEAM","TRAP","SEAL"];function w(e){switch(e){case"BEAM":return 1;case"BEAM_GUARD":return 2;case"BIG_BEAM":return 4;case"TRAP":return 1;case"SEAL":return 1;default:return 0}}function m(e){return e==="BEAM"||e==="BIG_BEAM"||e==="TRAP"||e==="SEAL"}function E(e){return e==="GUARD"||e==="BEAM_GUARD"||e==="GUARD_CHARGE"||e==="SEAL"}function B(e){switch(e){case"CHARGE":return"チャージ +1";case"GUARD_CHARGE":return"ガード付きチャージ +1（1回）";case"BEAM":return"ビーム -1（要ターゲット）";case"GUARD":return"ガード 0";case"BEAM_GUARD":return"ビームガード -2";case"BIG_BEAM":return"強ビーム -4（要ターゲット）";case"TRAP":return"罠 -1（要ターゲット）";case"SEAL":return"封印 -1（要ターゲット／そのターン防御）"}}function l(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}let r=null,i=null,c="接続中…",s=null,p=null,f=localStorage.getItem("marimo_name")??"player",g="";const G=location.protocol==="https:"?"wss":"ws",x=new WebSocket(`${G}://${location.host}/ws`);x.onopen=()=>{c="接続済み",d()};x.onclose=()=>{c="切断されました",d()};x.onmessage=e=>{const t=JSON.parse(e.data);t.type==="WELCOME"&&(i=t.youIndex,g=t.code??g,c=`入室：${t.code} / あなたは P${i+1}`),t.type==="ROOM_STATE"&&(r=t.state),t.type==="ERROR"&&(c=`エラー: ${t.message}`),d()};function v(e){x.send(JSON.stringify(e))}function A(){return!r||i===null?null:r.players[i]??null}function M(){return!r||i===null?[]:r.players.filter(e=>e.connected&&e.alive&&e.index!==i).map(e=>e.index)}function h(e){const t=A();return t?r?.status==="playing"&&!t.alive?{ok:!1,reason:"死亡中"}:e!=="BIG_BEAM"&&t.bannedActions.includes(e)?{ok:!1,reason:"封印中"}:t.trapForcedGuard&&!E(e)?{ok:!1,reason:"罠：防御必須"}:e==="GUARD_CHARGE"&&t.usedGuardCharge?{ok:!1,reason:"1回使用済み"}:t.energy<w(e)?{ok:!1,reason:"コスト不足"}:{ok:!0}:{ok:!1,reason:"状態未取得"}}function S(){localStorage.setItem("marimo_name",f),v({type:"CREATE_ROOM",name:f})}function T(){localStorage.setItem("marimo_name",f),v({type:"JOIN_ROOM",code:g,name:f})}function O(){v({type:"START"})}function _(e){s=e,m(e)||(p=null),d()}function I(e){p=e,d()}function P(){if(!r||i===null)return;if(!s)return c="行動を選んでね",d();const e=h(s);if(!e.ok)return c=`この行動は選べない：${e.reason??""}`,d();if(m(s)&&p===null)return c="ターゲットを選んでね",d();v({type:"ACTION",action:s,target:p}),c="送信した！",s=null,p=null,d()}function C(e){const t=i!==null&&e.index===i,o=[r?.hostIndex===e.index?'<span class="badge">HOST</span>':"",t?'<span class="badge blue">YOU</span>':"",e.connected?"":'<span class="badge gray">OFF</span>',e.connected&&!e.alive?'<span class="badge red">DEAD</span>':"",e.trapForcedGuard?'<span class="badge amber">TRAP!</span>':""].filter(Boolean).join(" "),a=(e.bannedActions??[]).filter(u=>u!=="BIG_BEAM"),n=a.length?a.join(", "):"なし";return`
    <div class="card ${t?"me":""}">
      <div class="row">
        <div class="title">P${e.index+1}</div>
        <div class="badges">${o}</div>
      </div>
      <div class="sub">${l(e.name??"player")}</div>
      <div class="stats">
        <div>エネルギー <b>${e.energy}</b></div>
        <div>封印 <b>${l(n)}</b></div>
        <div>ガードチャージ <b>${e.usedGuardCharge?"使用済み":"未使用"}</b></div>
      </div>
    </div>
  `}function d(){A();const e=M(),t=r?`ルーム <b>${r.code}</b> ／ 状態 <b>${r.status}</b> ／ Turn <b>${r.turn}</b> ／ あなた <b>${i!==null?"P"+(i+1):"-"}</b>`:"まだ入室してないよ",b=r&&r.status==="playing";k.innerHTML=`
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
        <div class="meta">${l(c)}</div>
        <div class="sub">${t}</div>
      </div>
    </div>

    <div class="bar">
      <div class="row" style="flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${l(f)}" placeholder="名前" oninput="setName(this.value)" />
          <button class="btn" onclick="createRoom()">ルーム作成</button>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input value="${l(g)}" placeholder="コード" oninput="setCode(this.value)" />
          <button class="btn" onclick="joinRoom()">参加</button>
          ${r&&i!==null&&r.hostIndex===i?'<button class="btn" onclick="startMatch()">Start（HOST）</button>':""}
        </div>
      </div>
      <div class="sub">
        友達に <b>ルームコード</b> を送って参加してもらってね（最大4人）
      </div>
    </div>

    ${r?`
      <div class="grid">
        <div>
          <div style="font-weight:900;margin-bottom:8px;">プレイヤー</div>
          <div class="players">
            ${r.players.map(C).join("")}
          </div>
        </div>

        ${b?`
          <div class="panel">
            <div style="font-weight:900;">行動</div>
            <div class="mut" style="margin-top:6px;">
              ※ BEAM / BIG_BEAM / TRAP / SEAL はターゲットが必要
            </div>

            <div class="actions">
              ${R.map(o=>{const a=h(o),n=!a.ok,u=s===o,$=n,y=n?a.reason??"":"";return`
                    <button
                      class="aBtn ${u?"pick":""} ${$?"danger":""}"
                      ${n?"disabled":""}
                      onclick="pickAction('${o}')"
                      title="${l(y)}"
                    >
                      ${l(B(o))}
                      <small>cost: ${w(o)} ${y?`／ ${l(y)}`:""}</small>
                    </button>
                  `}).join("")}
            </div>

            ${s&&m(s)?`
                  <div style="margin-top:12px;font-weight:900;">ターゲット</div>
                  <div class="targets">
                    ${e.length?e.map(o=>`
                            <button class="tBtn ${p===o?"pick":""}" onclick="pickTarget(${o})">
                              P${o+1}
                            </button>
                          `).join(""):'<div class="mut">ターゲットがいません（相手がいない/全滅）</div>'}
                  </div>
                `:""}

            <div class="sticky">
              <button class="btn big" onclick="submitAction()">送信</button>
              <div class="big">
                選択: <b>${s??"-"}</b>
                ${s&&m(s)?` → <b>${p!==null?"P"+(p+1):"-"}</b>`:""}
              </div>
            </div>
          </div>
        `:""}

        <div class="panel">
          <div style="font-weight:900;">ログ</div>
          <div class="logs">
            ${r.logs.length?r.logs.map(o=>`<div class="log">${l(o)}</div>`).join(""):'<div class="mut" style="margin-top:10px;">ログなし</div>'}
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
  `}window.setName=e=>{f=e,d()};window.setCode=e=>{g=e.toUpperCase().replace(/[^A-Z0-9]/g,""),d()};window.createRoom=()=>S();window.joinRoom=()=>T();window.startMatch=()=>O();window.pickAction=e=>_(e);window.pickTarget=e=>I(e);window.submitAction=()=>P();d();
