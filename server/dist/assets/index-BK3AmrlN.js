(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))A(t);new MutationObserver(t=>{for(const o of t)if(o.type==="childList")for(const m of o.addedNodes)m.tagName==="LINK"&&m.rel==="modulepreload"&&A(m)}).observe(document,{childList:!0,subtree:!0});function h(t){const o={};return t.integrity&&(o.integrity=t.integrity),t.referrerPolicy&&(o.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?o.credentials="include":t.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function A(t){if(t.ep)return;t.ep=!0;const o=h(t);fetch(t.href,o)}})();const y=document.querySelector("#app"),$=["CHARGE","GUARD_CHARGE","BEAM","GUARD","BEAM_GUARD","BIG_BEAM","TRAP","SEAL"];function g(e){return e==="BEAM"||e==="BIG_BEAM"||e==="TRAP"||e==="SEAL"}function R(e){switch(e){case"CHARGE":return"チャージ +1";case"GUARD_CHARGE":return"ガード付きチャージ +1（1回）";case"BEAM":return"ビーム -1（要ターゲット）";case"GUARD":return"ガード 0";case"BEAM_GUARD":return"ビームガード -2";case"BIG_BEAM":return"強ビーム -4（要ターゲット）";case"TRAP":return"罠 -1（要ターゲット）";case"SEAL":return"封印 -1（要ターゲット／そのターン防御）"}}let i=null,r=null,c="接続中…",a=null,u=null,d=localStorage.getItem("marimo_name")??"player",l="";const v=location.protocol==="https:"?"wss":"ws",p=new WebSocket(`${v}://${location.host}/ws`);p.onopen=()=>{c="接続済み",s()};p.onclose=()=>{c="切断されました",s()};p.onmessage=e=>{const n=JSON.parse(e.data);n.type==="WELCOME"&&(r=n.youIndex,l=n.code??l,c=`入室：${n.code} / あなたは P${r+1}`),n.type==="ROOM_STATE"&&(i=n.state),n.type==="ERROR"&&(c=`エラー: ${n.message}`),s()};function f(e){p.send(JSON.stringify(e))}function w(){return!i||r===null?[]:i.players.filter(e=>e.connected&&e.alive&&e.index!==r).map(e=>e.index)}function s(){y.innerHTML=`
  <div style="max-width:900px;margin:0 auto;padding:12px;font-family:sans-serif;">
    <h2>まりもゲーム（4人ルーム制・指向性あり）</h2>
    <div>${c}</div>

    <div style="margin:8px 0;">
      <input value="${d}" placeholder="名前"
        oninput="setName(this.value)" />
      <button onclick="createRoom()">ルーム作成</button>
      <input value="${l}" placeholder="コード"
        oninput="setCode(this.value)" />
      <button onclick="joinRoom()">参加</button>
      ${i&&r!==null&&i.hostIndex===r?'<button onclick="startMatch()">Start</button>':""}
    </div>

    ${i?`
      <div>
        <h3>プレイヤー</h3>
        ${i.players.map(e=>`
          <div>
            P${e.index+1} ${e.connected?"":"(OFF)"} 
            ${e.alive?"":"💀"} 
            E:${e.energy}
          </div>
        `).join("")}
      </div>

      ${i.status==="playing"?`
        <h3>行動</h3>
        ${$.map(e=>`
          <button onclick="pickAction('${e}')">${R(e)}</button>
        `).join("")}

        ${a&&g(a)?`
          <h4>ターゲット</h4>
          ${w().map(e=>`<button onclick="pickTarget(${e})">P${e+1}</button>`).join("")}
        `:""}

        <div>
          選択: ${a??"-"} 
          ${u!==null?`→ P${u+1}`:""}
        </div>

        <button onclick="submitAction()">送信</button>
      `:""}

      <h3>ログ</h3>
      ${i.logs.map(e=>`<div>${e}</div>`).join("")}
    `:""}
  </div>
  `}window.setName=e=>d=e;window.setCode=e=>l=e.toUpperCase();window.createRoom=()=>f({type:"CREATE_ROOM",name:d});window.joinRoom=()=>f({type:"JOIN_ROOM",code:l,name:d});window.startMatch=()=>f({type:"START"});window.pickAction=e=>{a=e,u=null,s()};window.pickTarget=e=>{u=e,s()};s();
