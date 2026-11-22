// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.2
// @description  JRAの表示ページを手動保存し、競馬AI HTMLのボタンから取り込む。
// @match        https://www.jra.go.jp/*
// @match        https://jra.go.jp/*
// @match        https://app.jra.jp/*
// @match        https://yasumiyu0501-eng.github.io/Jra-keiba-ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==
(function () {
 'use strict';
 const key='jraOddsBridgeLatestV1';
 const host=location.hostname.toLowerCase();
 const isJra=host==='jra.go.jp'||host==='www.jra.go.jp'||host==='app.jra.jp';
 const isApp=host==='yasumiyu0501-eng.github.io' && /^\/Jra-keiba-ai\/(?:index\.html)?$/i.test(decodeURIComponent(location.pathname));
 const makeBtn=(name, action)=>{
   const b=document.createElement('button'); b.textContent=name; b.type='button';
   b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:white;padding:13px 16px;border-radius:12px;border:2px solid white;font-size:15px;font-weight:bold;box-shadow:0 2px 9px #3338;';
   b.addEventListener('click',action); document.body.appendChild(b);
 };
 if(isJra){
   makeBtn('このJRAオッズを保存',()=>{
     const txt=document.body.innerText||'';
     if (!/オッズ/.test(txt) || txt.length<80) {alert('オッズ画面を開いてから実行してください。');return;}
     GM_setValue(key,{text:txt,url:location.href,savedAt:new Date().toISOString()});
     alert('表示中のJRAページを保存しました。競馬AIアプリへ戻って「JRA保存オッズを取得」を押してください。');
   });
 }
 if(isApp){
   window.addEventListener('keiba-ai:import-saved-jra',()=>{
     const data=GM_getValue(key,null);
     const area=document.getElementById('oddsInput'),read=document.getElementById('parseOddsBtn');
     if(!data||!data.text){alert('保存されたJRA画面がありません。FirefoxでJRAオッズページを開き「このJRAオッズを保存」を押してください。');return;}
     if(!area||!read||read.disabled){alert('先にAI勝率CSVを読み込み、レースと券種を選択してください。');return;}
     if(!confirm('保存時刻：'+new Date(data.savedAt).toLocaleString('ja-JP')+'\n取得元：'+data.url+'\n選択中のレース・券種と一致するか確認して読み込みますか？')) return;
     area.value=data.text;area.dispatchEvent(new Event('input',{bubbles:true}));read.click();
   });
 }
})();
