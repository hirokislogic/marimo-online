(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const u of i.addedNodes)u.tagName==="LINK"&&u.rel==="modulepreload"&&o(u)}).observe(document,{childList:!0,subtree:!0});function n(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(r){if(r.ep)return;r.ep=!0;const i=n(r);fetch(r.href,i)}})();const b=document.querySelector("#app"),m=["CHARGE","GUARD_CHARGE","BEAM","GUARD","BEAM_GUARD","BIG_BEAM","TRAP","SEAL"];let a=null,g=!1,l=null,c=[],s=null,d="接続中…";const A=location.protocol==="https:"?"wss":"ws",f=new WebSocket(`${A}://${location.host}/ws`);f.onopen=()=>{g=!0,d="接続済み。相手待ち…",p()};f.onclose=()=>{g=!1,d="切断されました。サーバを確認してね。",p()};f.onmessage=t=>{const e=JSON.parse(t.data);e.type==="WELCOME"&&(a=e.playerIndex,d=`あなたは P${a+1}。相手待ち…`),e.type==="MATCH_START"&&(s=null,d="試合開始！"),e.type==="TURN_START"&&(l=e.state,c=e.logs??c,s=null),e.type==="TURN_RESULT"&&(l=e.state,c=e.logs??c,s=null),e.type==="INFO"&&(d=e.message),e.type==="ERROR"&&(d=`エラー: ${e.message}`),p()};function v(t){switch(t){case"BEAM":return 1;case"BEAM_GUARD":return 2;case"BIG_BEAM":return 4;case"TRAP":return 1;case"SEAL":return 1;default:return 0}}function h(t){switch(t){case"CHARGE":return"チャージ +1";case"GUARD_CHARGE":return"ガード付きチャージ +1（1回）";case"BEAM":return"ビーム -1";case"GUARD":return"ガード 0";case"BEAM_GUARD":return"ビームガード -2";case"BIG_BEAM":return"強ビーム -4（封印無効）";case"TRAP":return"罠 -1";case"SEAL":return"封印 -1（ビーム防ぐ）"}}function x(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function E(t,e){if(e!=="BIG_BEAM"&&t.bannedActions.includes(e))return!1;const n=["GUARD","BEAM_GUARD","GUARD_CHARGE","SEAL"];return!(t.trapForcedGuard&&!n.includes(e)||e==="GUARD_CHARGE"&&t.usedGuardCharge||t.energy<v(e))}function $(){if(!(window.matchMedia("(max-width: 520px)").matches&&!confirm(`この行動で送信する？

${s}`))){if(s===null)return d="行動を選んでね",p();f.send(JSON.stringify({type:"ACTION",action:s})),d="送信した！相手待ち…",p()}}function y(t,e,n){return`
    <div style="border:2px solid ${n}; padding:12px; background:#f9f9f9; border-radius:12px;">
      <h3 style="margin:0 0 8px 0;">${e}</h3>
      <div>エネルギー: <b>${t.energy}</b></div>
      <div>罠強制中: <b>${t.trapForcedGuard?"YES":"NO"}</b></div>
      <div>使用禁止: <b>${t.bannedActions.filter(o=>o!=="BIG_BEAM").join(", ")||"なし"}</b></div>
      <div>ガードチャージ使用済み: <b>${t.usedGuardCharge?"YES":"NO"}</b></div>
    </div>
  `}function p(){const t=a!==null&&l?l.p[a]:null,e=a!==null&&l?l.p[a===0?1:0]:null;b.innerHTML=`
     <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      button { -webkit-tap-highlight-color: transparent; }
      .container { padding: 14px; max-width: 900px; margin: 0 auto; }
      .top { display: grid; gap: 10px; }
      .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .actionBtn { padding: 14px; border-radius: 14px; font-size: 16px; }
      .sendRow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .sendBtn { padding: 12px 16px; font-size: 18px; border-radius: 14px; }

      /* ✅ スマホ最適化 */
      @media (max-width: 520px) {
        .container { padding: 12px; }
        .cards { grid-template-columns: 1fr; }           /* YOU/ENEMY 縦並び */
        .actions { grid-template-columns: 1fr; }         /* ボタン1列（誤タップ減） */
        .actionBtn { width: 100%; font-size: 18px; padding: 16px; }
        .sendRow { position: sticky; bottom: 10px; background: rgba(255,255,255,0.92);
                   padding: 10px; border-radius: 16px; border: 1px solid #eee;
                   backdrop-filter: blur(6px); }
        .sendBtn { flex: 1; width: 100%; font-size: 20px; padding: 14px 16px; }
      }
     </style>

    <div class="container" style="font-family:system-ui;">
      <h2 style="margin:0 0 8px 0;">まりもゲーム（オンライン）</h2>
      <div style="opacity:0.75;">${x(d)}</div>
      <div style="margin-top:6px;">接続: <b>${g?"OK":"NO"}</b> / あなた: <b>${a!==null?`P${a+1}`:"-"}</b> / Turn: <b>${l?.turn??"-"}</b></div>

      <hr/>

      <div class="cards">
        ${t?y(t,"YOU","#3af"):'<div style="opacity:0.6;">状態待ち…</div>'}
        ${e?y(e,"ENEMY","#fa3"):'<div style="opacity:0.6;">相手待ち…</div>'}
      </div>

      <hr/>

      <div style="border:1px solid #ddd; padding:12px; border-radius:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b>あなたの行動</b>
          <span style="opacity:0.6; font-size:12px;">選んで「送信」</span>
        </div>

        <div class="actions" style="margin-top:10px;">

          ${t?m.map(n=>{const o=!E(t,n);return`
                      <button
                        class="actionBtn"
                        ${o?"disabled":""}
                        onclick="pick('${n}')"
                        style="
                          padding:10px;
                          border-radius:10px;
                          ${n==="BIG_BEAM"?"font-weight:bold; border:2px solid red;":"border:1px solid #ccc;"}
                          ${o?"background:#ffdddd; color:#a00000;":"background:#fff;"}
                          ${s===n?"outline:3px solid #000; transform: translateY(-1px);":""}
                          cursor:${o?"not-allowed":"pointer"};
                        "
                      >
                        ${h(n)}
                      </button>
                    `}).join(""):'<div style="opacity:0.6;">状態が届くまで待ってね</div>'}
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
          <button onclick="send()" style="padding:10px 14px; font-size:16px; border-radius:10px;">
            送信
          </button>
          <div>
            選択:
            <b style="color:${s?"#d00":"#000"}; font-size:18px;">
              ${s??"-"}
            </b>
          </div>
        </div>
      </div>

      <hr/>

      <div style="
        border:1px solid #ddd;
        border-radius:12px;
        padding:12px;
        background:#fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      ">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b>ログ</b>
          <span style="opacity:0.6; font-size:12px;">最新が上</span>
        </div>

        <div style="
          margin-top:10px;
          max-height:180px;
          overflow:auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.5;
        ">
          ${c.length===0?'<div style="opacity:0.6;">まだログはありません</div>':""}
          ${c.map((n,o)=>`
                <div style="
                  padding:6px 8px;
                  border-radius:8px;
                  background:${o%2===0?"#f7f7f7":"#ffffff"};
                  border:1px solid ${o===0?"#ffd4d4":"transparent"};
                ">
                  ${x(n)}
                </div>
              `).join("")}
        </div>
      </div>
    </div>
  `}window.pick=t=>{s=t,p()};window.send=()=>$();p();
