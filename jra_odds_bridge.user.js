// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.3
// @description  JRA単勝・複勝表を抽出し競馬AIへ連携
// @match        https://www.jra.go.jp/*
// @match        https://jra.go.jp/*
// @match        https://app.jra.jp/*
// @match        https://yasumiyu0501-eng.github.io/Jra-keiba-ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==
(function(){
'use strict';
const key='jraOddsBridgeLatestV1';
const host=location.hostname.toLowerCase();
const isJra=['www.jra.go.jp','jra.go.jp','app.jra.jp'].includes(host);
const isApp=host==='yasumiyu0501-eng.github.io'
 && /^\/Jra-keiba-ai\/(?:index\.html)?$/i.test(location.pathname);

function clean(s){return String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();}
function odd(s){
 const t=clean(s);
 const m=t.match(/^(\d+(?:\.\d+)?)(?:\s*[-〜~]\s*(\d+(?:\.\d+)?))?$/);
 if(!m)return null;
 const a=Number(m[1]),b=Number(m[2]||m[1]);
 return a>=1&&b>=a?{lo:a,hi:b}:null;
}
function extract(){
 const candidates=[];
 for(const table of document.querySelectorAll('table')){
  const headers=clean(table.querySelector('thead')?.innerText || table.querySelector('tr')?.innerText);
  if(!headers.includes('単勝')||!headers.includes('複勝'))continue;
  const rows=[];
  for(const tr of table.querySelectorAll('tr')){
   const cells=Array.from(tr.children).filter(x=>/^(TD|TH)$/.test(x.tagName));
   let found=null;
   for(let i=1;i<cells.length-2;i++){
    const num=clean(cells[i-1].innerText);
    const name=clean(cells[i].innerText);
    if(!/^\d{1,2}$/.test(num)||Number(num)>18||Number(num)<1)continue;
    if(!name||/^\d+$/.test(name))continue;
    const w=odd(cells[i+1]?.innerText);
    const p=odd(cells[i+2]?.innerText);
    if(w&&p){found={num:Number(num),win:w.lo,place:p};break;}
   }
   if(found)rows.push(found);
  }
  const unique=new Map(rows.map(x=>[x.num,x]));
  if(unique.size>candidates.length)candidates.splice(0,candidates.length,...unique.values());
 }
 if(candidates.length<2)throw Error('単勝・複勝の表を検出できません。表のHTML構造を確認する必要があります。');
 candidates.sort((a,b)=>a.num-b.num);
 return candidates;
}
function addButton(){
 const b=document.createElement('button');
 b.textContent='このJRAオッズを保存';
 b.type='button';
 b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:white;padding:13px 16px;border:2px solid white;border-radius:12px;font-weight:bold;';
 b.onclick=()=>{
  try{
   const rows=extract();
   const textWin=rows.map(r=>r.num+' '+r.win).join('\n');
   const textPlace=rows.map(r=>r.num+' '+r.place.lo+(r.place.hi>r.place.lo?'-'+r.place.hi:'')).join('\n');
   const data={text:textWin,win:textWin,place:textPlace,url:location.href,savedAt:new Date().toISOString(),count:rows.length};
   GM_setValue(key,data);
   alert(rows.length+'頭の単勝・複勝オッズを保存しました。競馬AIアプリへ戻ってください。');
  }catch(e){alert('保存できませんでした: '+e.message);}
 };
 document.body.appendChild(b);
}
if(isJra)addButton();
if(isApp){
 window.addEventListener('keiba-ai:import-saved-jra',()=>{
  const data=GM_getValue(key,null);
  const area=document.getElementById('oddsInput');
  const read=document.getElementById('parseOddsBtn');
  if(!data||!data.win){alert('修正版でJRAオッズを保存し直してください。');return;}
  if(!area||!read||read.disabled){alert('先にAI勝率CSVと券種を設定してください。');return;}
  const selected=document.querySelector('#tabs button.active')?.dataset.mode;
  if(!['win','place'].includes(selected)){alert('単勝または複勝タブを選択してください。');return;}
  const text=selected==='win'?data.win:data.place;
  if(!confirm(data.count+'頭分の'+(selected==='win'?'単勝':'複勝')+'オッズを取り込みます。開催日・競馬場・レース番号が一致しているか確認してください。\n'+data.url))return;
  area.value=text;
  area.dispatchEvent(new Event('input',{bubbles:true}));
  read.click();
 });
}
})();
