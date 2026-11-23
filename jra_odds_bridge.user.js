// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.5
// @description  JRA単勝・複勝・馬連・ワイド取得
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
function extractPairs(text,type){
 const title=type==='wide'?'ワイドオッズ(馬番順)':'馬連オッズ(馬番順)';
 const norm=text.normalize('NFKC').replace(/（/g,'(').replace(/）/g,')');
 const pos=norm.lastIndexOf(title);
 if(pos<0)throw Error('JRAの'+title+'画面を開いてください');
 const rest=norm.slice(pos+title.length);
 const section=rest.split(/(?:・\s*(?:オッズの強調表示|発売締切直後)|開催選択へ戻る|ページトップへ戻る)/)[0];
 const tokens=section.match(/\d+(?:\.\d+)?|[-−–〜~]/g)||[];
 const map=new Map();
 let p=0,n=0;
 const num=()=>Number(tokens[p]);
 const range=()=>{
  const lo=num();p++;
  if(tokens[p]!=='-'&&tokens[p]!=='−'&&tokens[p]!=='–'&&tokens[p]!=='〜'&&tokens[p]!=='~')throw Error('オッズの区切りを認識できません');
  p++;
  const hi=num();p++;
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<1||hi<lo)throw Error('ワイド上下限が不正です');
  return lo+'-'+hi;
 };
 for(let base=1;base<=18&&p<tokens.length;base++){
  if(num()!==base||!Number.isInteger(num()))throw Error('基準馬番が不正です: '+base);
  p++;
  let cnt=0;
  for(let j=base+1;j<=18&&p<tokens.length;j++){
   if(num()!==j)break;
   p++;
   let value;
   if(type==='wide')value=range();
   else{
    value=num();p++;
    if(!Number.isFinite(value)||value<1)throw Error('馬連オッズが不正です');
   }
   const k=base+'-'+j;
   if(map.has(k))throw Error('組み合わせ重複: '+k);
   map.set(k,value);
   cnt++;
   n=Math.max(n,j);
  }
  if(!cnt)throw Error(base+'番の組み合わせがありません');
 }
 if(p!==tokens.length)throw Error('未解析データが残っています');
 const expected=n*(n-1)/2;
 if(n<3||map.size!==expected)throw Error('組み合わせ件数不一致: '+map.size+'/'+expected);
 return {[type]:[...map].map(([k,v])=>k+' '+v).join('\n'),count:map.size,horseCount:n};
}
if(isJra){
 const b=document.createElement('button');
 b.type='button';b.textContent='このJRAオッズを保存';
 b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:#fff;padding:13px 16px;border:2px solid white;border-radius:12px;font-size:15px;font-weight:bold';
 b.onclick=()=>{
  try{
   const text=document.body.innerText||'';
   const isWide=/ワイドオッズ\s*[（(]馬番順[）)]/.test(text);
   const isPair=/馬連オッズ\s*[（(]馬番順[）)]/.test(text);
   const info=raceInfo(text);
   if(!info)throw Error('開催日・競馬場・レース番号を確認できません');
   const type=isWide?'wide':isPair?'umaren':'winplace';
   const data=isWide?extractPairs(text,'wide'):isPair?extractPairs(text,'umaren'):extractWinPlace();
   GM_setValue(key,{...data,type,info,url:location.href,savedAt:new Date().toISOString()});
   alert((type==='wide'?'ワイド ':type==='umaren'?'馬連 ':'単勝・複勝 ')+data.count+(type==='winplace'?'頭':'点')+'を保存しました。\n'+info.date+' '+info.track+info.race+'R');
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
  const text=data[mode];
  if(!text){alert('保存データにこの券種はありません。JRAで保存し直してください');return;}
  const label=document.querySelector('#raceSelect')?.selectedOptions[0]?.textContent||'';
  if(!data.info){alert('レース識別情報がありません。保存し直してください');return;}
  const date=label.match(/20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}/)?.[0]?.replace(/\//g,'-');
  const rm=label.match(/(\d{1,2})\s*R/i);
  if(!date||!rm){alert('分析レースを識別できないため取り込みを停止しました');return;}
  const d=date.split('-').map((v,i)=>i?String(Number(v)).padStart(2,'0'):v).join('-');
  if(d!==data.info.date||!label.includes(data.info.track)||Number(rm[1])!==data.info.race){
   alert('レース不一致のため停止しました。\nJRA: '+data.info.date+' '+data.info.track+data.info.race+'R\nアプリ: '+label);
   return;
  }
  if(!confirm('保存オッズを取り込みます。\n'+data.info.date+' '+data.info.track+data.info.race+'R\n取得 '+data.count+'件'))return;
  area.value=text;
  area.dispatchEvent(new Event('input',{bubbles:true}));
  read.click();
 });
}
})();
