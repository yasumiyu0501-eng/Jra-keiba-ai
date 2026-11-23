// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.6
// @description  JRA単勝・複勝・馬連・ワイド・馬単対応
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
const isApp=host==='yasumiyu0501-eng.github.io' &&
 /^\/Jra-keiba-ai\/(?:index\.html)?$/i.test(location.pathname);
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
   const c=[...tr.children].filter(x=>/^(TD|TH)$/.test(x.tagName));
   for(let i=1;i<c.length-2;i++){
    const n=clean(c[i-1].innerText),name=clean(c[i].innerText);
    if(!/^\d{1,2}$/.test(n)||+n<1||+n>18||!name||/^\d+$/.test(name))continue;
    const w=odd(c[i+1]?.innerText),p=odd(c[i+2]?.innerText);
    if(w&&p){found.set(+n,{num:+n,win:w.lo,place:p});break;}
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
function oddsSection(text,title){
 const norm=text.normalize('NFKC');
 const pos=norm.lastIndexOf(title);
 if(pos<0)throw Error(title+'を開いてください');
 return norm.slice(pos+title.length).split(
  /(?:・\s*(?:オッズの強調表示|発売締切直後|特定の馬番)|開催選択へ戻る|ページトップへ戻る|発売票数)/
 )[0];
}
function extractPairs(text,type){
 const title=type==='wide'?'ワイドオッズ(馬番順)':'馬連オッズ(馬番順)';
 const section=oddsSection(text,title);
 const tokens=section.match(/\d+(?:\.\d+)?|[-−–〜~]/g)||[];
 function parseFor(n){
  const out=new Map();let p=0;
  for(let i=1;i<n;i++){
   if(tokens[p++]!==String(i))return null;
   for(let j=i+1;j<=n;j++){
    if(tokens[p++]!==String(j))return null;
    const lo=tokens[p++];
    if(!/^\d+(?:\.\d+)?$/.test(lo||'')||Number(lo)<1)return null;
    let value=lo;
    if(type==='wide'){
     if(!['-','−','–','〜','~'].includes(tokens[p++]))return null;
     const hi=tokens[p++];
     if(!/^\d+(?:\.\d+)?$/.test(hi||'')||Number(hi)<Number(lo))return null;
     value=lo+'-'+hi;
    }
    out.set(i+'-'+j,value);
   }
  }
  return p===tokens.length&&out.size===n*(n-1)/2?out:null;
 }
 const matches=[];
 for(let n=3;n<=18;n++){
  const result=parseFor(n);
  if(result)matches.push({n,result});
 }
 if(matches.length!==1)throw Error('馬連・ワイドの組み合わせと頭数を特定できません');
 const {n,result}=matches[0];
 return {[type]:[...result].map(([k,v])=>k+' '+v).join('\n'),count:result.size,horseCount:n};
}
function extractUmatan(text){
 const section=oddsSection(text,'馬単オッズ(馬番順)');
 const lines=section.split(/\r?\n/).map(clean).filter(Boolean);
 // 各基準馬番の後に、2着候補1～Nを順に検査する。
 // 同一馬番の行は空欄なのでオッズを持たない。
 function parseFor(n){
  const out=new Map();
  let p=0;
  for(let first=1;first<=n;first++){
   if(lines[p++]!==String(first))return null;
   for(let second=1;second<=n;second++){
    const line=lines[p++];
    if(line===undefined)return null;
    if(first===second){
     if(line!==String(second))return null;
     continue;
    }
    const m=line.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
    if(!m||Number(m[1])!==second||Number(m[2])<1)return null;
    const k=first+'-'+second;
    if(out.has(k))return null;
    out.set(k,m[2]);
   }
  }
  return p===lines.length&&out.size===n*(n-1)?out:null;
 }
 const matches=[];
 for(let n=3;n<=18;n++){
  const result=parseFor(n);
  if(result)matches.push({n,result});
 }
 if(matches.length!==1)throw Error('馬単の組み合わせと頭数を特定できません。空欄や表構造を確認してください');
 const {n,result}=matches[0];
 return {umatan:[...result].map(([k,v])=>k+' '+v).join('\n'),count:result.size,horseCount:n};
}
if(isJra){
 const b=document.createElement('button');
 b.type='button';
 b.textContent='このJRAオッズを保存';
 b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:white;padding:13px 16px;border:2px solid white;border-radius:12px;font-size:15px;font-weight:bold';
 b.onclick=()=>{
  try{
   const text=document.body.innerText||'';
   const type=/馬単オッズ\s*[（(]馬番順[）)]/.test(text)?'umatan':
    /ワイドオッズ\s*[（(]馬番順[）)]/.test(text)?'wide':
    /馬連オッズ\s*[（(]馬番順[）)]/.test(text)?'umaren':'winplace';
   const info=raceInfo(text);
   if(!info)throw Error('開催日・競馬場・レース番号を確認できません');
   const data=type==='umatan'?extractUmatan(text):
    type==='winplace'?extractWinPlace():extractPairs(text,type);
   GM_setValue(key,{...data,type,info,url:location.href,savedAt:new Date().toISOString()});
   const label={umatan:'馬単 ',wide:'ワイド ',umaren:'馬連 ',winplace:'単勝・複勝 '}[type];
   alert(label+data.count+(type==='winplace'?'頭':'点')+'を保存しました。\n'+info.date+' '+info.track+info.race+'R');
  }catch(e){alert('保存できません: '+e.message);}
 };
 document.body.appendChild(b);
}
if(isApp){
 window.addEventListener('keiba-ai:import-saved-jra',()=>{
  const data=GM_getValue(key,null);
  const area=document.getElementById('oddsInput');
  const read=document.getElementById('parseOddsBtn');
  const mode=document.querySelector('#tabs button.active')?.dataset.mode;
  if(!data){alert('保存データがありません');return;}
  if(!area||!read||read.disabled){alert('先にAI勝率CSVと券種を選択してください');return;}
  const oddsText=data[mode];
  if(!oddsText){alert('この券種の保存データがありません。JRAで保存し直してください');return;}
  const label=document.querySelector('#raceSelect')?.selectedOptions[0]?.textContent||'';
  if(!data.info){alert('レース識別情報がありません');return;}
  const date=label.match(/20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}/)?.[0]?.replace(/\//g,'-');
  const rm=label.match(/(\d{1,2})\s*R/i);
  if(!date||!rm){alert('分析レースを識別できないため停止しました');return;}
  const d=date.split('-').map((v,i)=>i?String(+v).padStart(2,'0'):v).join('-');
  if(d!==data.info.date||!label.includes(data.info.track)||+rm[1]!==data.info.race){
   alert('レース不一致のため停止しました。\nJRA: '+data.info.date+' '+data.info.track+data.info.race+'R\nアプリ: '+label);
   return;
  }
  if(!confirm('保存オッズを取り込みます。\n'+data.info.date+' '+data.info.track+data.info.race+'R\n取得 '+data.count+'件'))return;
  area.value=oddsText;
  area.dispatchEvent(new Event('input',{bubbles:true}));
  read.click();
 });
}
})();
