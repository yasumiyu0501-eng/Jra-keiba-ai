// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.4
// @description  JRA単勝・複勝・馬連オッズ連携
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
const isApp=host==='yasumiyu0501-eng.github.io' && /^\/Jra-keiba-ai\/(?:index\.html)?$/i.test(location.pathname);
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function odd(s){
 const m=clean(s).match(/^(\d+(?:\.\d+)?)(?:\s*[-〜~]\s*(\d+(?:\.\d+)?))?$/);
 if(!m)return null;
 const lo=Number(m[1]),hi=Number(m[2]||m[1]);
 return lo>=1&&hi>=lo?{lo,hi}:null;
}
function raceInfo(text){
 const m=text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日[^\n]{0,100}?(東京|京都|中山|阪神|中京|新潟|福島|小倉|札幌|函館)[^\n]{0,35}?(\d{1,2})\s*レース/);
 if(!m)return null;
 return {date:m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),track:m[4],race:Number(m[5])};
}
function extractWinPlace(){
 let best=[];
 for(const table of document.querySelectorAll('table')){
  const head=clean(table.querySelector('thead')?.innerText||table.querySelector('tr')?.innerText);
  if(!head.includes('単勝')||!head.includes('複勝'))continue;
  const found=new Map();
  for(const tr of table.querySelectorAll('tr')){
   const c=Array.from(tr.children).filter(x=>/^(TD|TH)$/.test(x.tagName));
   for(let i=1;i<c.length-2;i++){
    const n=clean(c[i-1].innerText),name=clean(c[i].innerText);
    if(!/^\d{1,2}$/.test(n)||Number(n)<1||Number(n)>18||!name||/^\d+$/.test(name))continue;
    const w=odd(c[i+1]?.innerText),p=odd(c[i+2]?.innerText);
    if(w&&p){found.set(Number(n),{num:Number(n),win:w.lo,place:p});break;}
   }
  }
  if(found.size>best.length)best=[...found.values()];
 }
 if(best.length<2)throw Error('単勝・複勝表を検出できません');
 best.sort((a,b)=>a.num-b.num);
 return {
  win:best.map(x=>x.num+' '+x.win).join('\n'),
  place:best.map(x=>x.num+' '+x.place.lo+(x.place.hi>x.place.lo?'-'+x.place.hi:'')).join('\n'),
  count:best.length
 };
}
function extractUmaren(text){
 const heading='馬連オッズ(馬番順)';
 const normalized=text.normalize('NFKC').replace(/（/g,'(').replace(/）/g,')');
 const pos=normalized.lastIndexOf(heading);
 if(pos<0)throw Error('馬連オッズ(馬番順)を開いてください');
 const after=normalized.slice(pos+heading.length);
 const section=after.split(/(?:・\s*オッズの強調表示|開催選択へ戻る|ページトップへ戻る)/)[0];
 const lines=section.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let base=null;
 const map=new Map();
 for(const line of lines){
  const header=line.match(/^(\d{1,2})$/);
  if(header){base=Number(header[1]);continue;}
  const pair=line.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
  if(!pair||base===null)continue;
  const b=Number(pair[1]),o=Number(pair[2]);
  if(base<1||base>18||b<=base||b>18||o<1)throw Error('馬連の馬番・オッズが不正です');
  const k=base+'-'+b;
  if(map.has(k))throw Error('馬連の重複: '+k);
  map.set(k,o);
 }
 const count=map.size;
 const horseCount=Math.max(0,...[...map.keys()].flatMap(x=>x.split('-').map(Number)));
 const expected=horseCount*(horseCount-1)/2;
 if(horseCount<3||count!==expected)throw Error('馬連の件数不一致: '+count+'点 / 想定'+expected+'点。途中欠落の可能性があります');
 return {umaren:[...map].map(([k,o])=>k+' '+o).join('\n'),count,horseCount};
}
if(isJra){
 const b=document.createElement('button');
 b.type='button';b.textContent='このJRAオッズを保存';
 b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:#fff;padding:13px 16px;border:2px solid white;border-radius:12px;font-size:15px;font-weight:bold';
 b.onclick=()=>{
  try{
   const text=document.body.innerText||'';
   const isPair=/馬連オッズ\s*[（(]馬番順[）)]/.test(text);
   const info=raceInfo(text);
   if(!info)throw Error('開催日・競馬場・レース番号を確認できません');
   const data=isPair?extractUmaren(text):extractWinPlace();
   const type=isPair?'umaren':'winplace';
   GM_setValue(key,{...data,type,info,url:location.href,savedAt:new Date().toISOString()});
   alert((type==='umaren'?'馬連 '+data.count+'点':'単勝・複勝 '+data.count+'頭')+'を保存しました。\n'+info.date+' '+info.track+info.race+'R');
  }catch(e){alert('保存できません: '+e.message);}
 };
 document.body.appendChild(b);
}
if(isApp){
 window.addEventListener('keiba-ai:import-saved-jra',()=>{
  const data=GM_getValue(key,null);
  const area=document.getElementById('oddsInput'),read=document.getElementById('parseOddsBtn');
  const mode=document.querySelector('#tabs button.active')?.dataset.mode;
  if(!data){alert('保存データがありません');return;}
  if(!area||!read||read.disabled){alert('先にAI勝率CSVと券種を選択してください');return;}
  let text=data[mode];
  if(!text){alert('保存データにこの券種はありません。JRAで保存し直してください');return;}
  const label=document.querySelector('#raceSelect')?.selectedOptions[0]?.textContent||'';
  if(data.info){
   const date=label.match(/20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}/)?.[0]?.replace(/\//g,'-');
   const track=data.info.track,number=data.info.race;
   const rm=label.match(/(\d{1,2})\s*R/i);
   if(!date||!rm){alert('分析レースを識別できないため取り込みを停止しました');return;}
   const d=date.split('-').map((v,i)=>i?String(Number(v)).padStart(2,'0'):v).join('-');
   if(d!==data.info.date||!label.includes(track)||Number(rm[1])!==number){
    alert('レース不一致のため停止しました。\nJRA: '+data.info.date+' '+track+number+'R\nアプリ: '+label);
    return;
   }
  }else{alert('レース識別情報がありません。保存し直してください');return;}
  if(!confirm('保存オッズを取り込みます。\n'+data.info.date+' '+data.info.track+data.info.race+'R\n取得 '+data.count+'件'))return;
  area.value=text;
  area.dispatchEvent(new Event('input',{bubbles:true}));
  read.click();
 });
}
})();
