
// ==UserScript==
// @name         JRA → 競馬AI オッズ連携（Android Firefox）
// @namespace    local.keiba.ai.bridge
// @version      0.9.1
// @description  単勝・複勝・枠連・馬連・ワイド・馬単・三連複・三連単
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
const isApp=host==='yasumiyu0501-eng.github.io'&&/^\/Jra-keiba-ai\/(?:index\.html)?$/i.test(location.pathname);
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();

function raceInfo(text){
 const m=text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日[^\n]{0,100}?(東京|京都|中山|阪神|中京|新潟|福島|小倉|札幌|函館)[^\n]{0,35}?(\d{1,2})\s*レース/);
 if(!m)return null;
 return {
  date:m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),
  track:m[4],race:+m[5]
 };
}

function odd(s){
 const m=clean(s).match(/^(\d+(?:\.\d+)?)(?:\s*[-〜~]\s*(\d+(?:\.\d+)?))?$/);
 if(!m)return null;
 const lo=+m[1],hi=+(m[2]||m[1]);
 return lo>=1&&hi>=lo?{lo,hi}:null;
}

function winPlace(){
 let best=[];
 for(const table of document.querySelectorAll('table')){
  const head=clean(table.querySelector('thead')?.innerText||table.querySelector('tr')?.innerText);
  if(!head.includes('単勝')||!head.includes('複勝'))continue;
  const found=new Map();
  for(const tr of table.querySelectorAll('tr')){
   const c=[...tr.children].filter(x=>/^(TD|TH)$/.test(x.tagName));
   for(let i=1;i<c.length-2;i++){
    const n=clean(c[i-1].innerText);
    const name=clean(c[i].innerText);
    if(!/^\d{1,2}$/.test(n)||+n<1||+n>18||!name||/^\d+$/.test(name))continue;
    const w=odd(c[i+1]?.innerText);
    const p=odd(c[i+2]?.innerText);
    if(w&&p){
     found.set(+n,{num:+n,win:w.lo,place:p});
     break;
    }
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

function section(text,title){
 const norm=text.normalize('NFKC');
 const pos=norm.lastIndexOf(title);
 if(pos<0)throw Error(title+'の画面を開いてください');
 return norm.slice(pos+title.length).split(/(?:・\s*(?:オッズの強調表示|発売締切直後|特定の馬番)|開催選択へ戻る|ページトップへ戻る|発売票数)/)[0];
}

function pairs(text,type){
 const title=type==='wide'?'ワイドオッズ(馬番順)':'馬連オッズ(馬番順)';
 const tokens=section(text,title).match(/\d+(?:\.\d+)?|[-−–〜~]/g)||[];

 function parse(n){
  let p=0;
  const out=new Map();
  for(let i=1;i<n;i++){
   if(tokens[p++]!==String(i))return null;
   for(let j=i+1;j<=n;j++){
    if(tokens[p++]!==String(j))return null;
    const lo=tokens[p++];
    if(!/^\d+(?:\.\d+)?$/.test(lo||'')||+lo<1)return null;
    let value=lo;
    if(type==='wide'){
     if(!['-','−','–','〜','~'].includes(tokens[p++]))return null;
     const hi=tokens[p++];
     if(!/^\d+(?:\.\d+)?$/.test(hi||'')||+hi<+lo)return null;
     value=lo+'-'+hi;
    }
    out.set(i+'-'+j,value);
   }
  }
  return p===tokens.length&&out.size===n*(n-1)/2?out:null;
 }

 const matches=[];
 for(let n=3;n<=18;n++){
  const out=parse(n);
  if(out)matches.push({n,out});
 }
 if(matches.length!==1)throw Error('馬連・ワイドの全組み合わせを検証できません');
 const {n,out}=matches[0];
 return {
  [type]:[...out].map(([k,v])=>k+' '+v).join('\n'),
  count:out.size,horseCount:n
 };
}

function umatan(text){
 const lines=section(text,'馬単オッズ(馬番順)').split(/\r?\n/).map(clean).filter(Boolean);
 function parse(n){
  let p=0;
  const out=new Map();
  for(let i=1;i<=n;i++){
   if(lines[p++]!==String(i))return null;
   for(let j=1;j<=n;j++){
    const s=lines[p++];
    if(s===undefined)return null;
    if(i===j){
     if(s!==String(j))return null;
     continue;
    }
    const m=s.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
    if(!m||+m[1]!==j||+m[2]<1)return null;
    out.set(i+'-'+j,m[2]);
   }
  }
  return p===lines.length&&out.size===n*(n-1)?out:null;
 }
 const matches=[];
 for(let n=3;n<=18;n++){
  const out=parse(n);
  if(out)matches.push({n,out});
 }
 if(matches.length!==1)throw Error('馬単の全組み合わせを検証できません');
 const {n,out}=matches[0];
 return {
  umatan:[...out].map(([k,v])=>k+' '+v).join('\n'),
  count:out.size,horseCount:n
 };
}

function sanrenpuku(text){
 const norm=text.normalize('NFKC');
 const start=norm.lastIndexOf('3連複オッズ(馬番順)');
 if(start<0)throw Error('3連複オッズ(馬番順)を開いてください');
 const s=norm.slice(start+'3連複オッズ(馬番順)'.length).split(/(?:・\s*(?:オッズの強調表示|発売締切直後|特定の馬番)|開催選択へ戻る)/)[0];
 const lines=s.split(/\r?\n/).map(clean).filter(Boolean);
 const found=new Map();
 let a=0,b=0;
 for(const line of lines){
  if(/^\d{1,2}\s+\S/.test(line)&&!/^\d{1,2}\s+\d+(?:\.\d+)?$/.test(line))continue;
  if(line==='ページトップへ戻る'||line==='軸馬を選択してください。'||line==='すべて'||line==='表示')continue;
  const h=line.match(/^(\d{1,2})-(\d{1,2})$/);
  if(h){
   a=+h[1];b=+h[2];
   if(a<1||a>=b||b>18)throw Error('三連複の見出しが不正です');
   continue;
  }
  const m=line.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
  if(m&&a&&b){
   const c=+m[1],o=+m[2];
   if(c<=b||c>18||o<1)throw Error('三連複の馬番・オッズが不正です');
   const k=a+'-'+b+'-'+c;
   if(found.has(k))throw Error('三連複の重複: '+k);
   found.set(k,m[2]);
   continue;
  }
  if(/^(\d{1,2}-\d{1,2}|\d{1,2}\s+\d)/.test(line))throw Error('未解析の三連複データ: '+line);
 }
 const matches=[];
 for(let n=3;n<=18;n++){
  if(found.size!==n*(n-1)*(n-2)/6)continue;
  let ok=true;
  for(let i=1;i<=n-2&&ok;i++)
   for(let j=i+1;j<=n-1&&ok;j++)
    for(let k=j+1;k<=n;k++){
     if(!found.has(i+'-'+j+'-'+k)){ok=false;break;}
    }
  if(ok)matches.push(n);
 }
 if(matches.length!==1)throw Error('三連複の件数・欠損を検証できません: '+found.size+'点');
 return {
  sanrenpuku:[...found].map(([k,v])=>k+' '+v).join('\n'),
  count:found.size,horseCount:matches[0]
 };
}

function sanrentan(text){
 const norm=text.normalize('NFKC');
 const title='3連単オッズ(馬番順)';
 const start=norm.lastIndexOf(title);
 if(start<0)throw Error('3連単オッズ(馬番順)を開いてください');
 const s=norm.slice(start+title.length).split(/(?:・\s*(?:オッズの強調表示|発売締切直後|特定の馬番)|開催選択へ戻る)/)[0];
 const lines=s.split(/\r?\n/).map(clean).filter(Boolean);
 const found=new Map();
 let a=null,b=null,active=false,blocks=0,blockCount=0;
 function closeBlock(){
  if(active&&blockCount<1)throw Error('三連単の空の組み合わせ表があります');
 }
 for(const line of lines){
  let m=line.match(/^1着\s*(\d{1,2})$/);
  if(m){closeBlock();a=+m[1];b=null;active=false;continue;}
  m=line.match(/^2着\s*(\d{1,2})$/);
  if(m){
   if(a===null)throw Error('三連単の1着欄がありません');
   b=+m[1];
   if(a===b||a<1||b<1||a>18||b>18)throw Error('三連単の1・2着馬番が不正です');
   continue;
  }
  if(line==='3着'){
   if(a===null||b===null)throw Error('三連単の着順見出しが不完全です');
   active=true;blocks++;blockCount=0;continue;
  }
  if(!active)continue;
  m=line.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
  if(m){
   const c=+m[1],o=+m[2];
   if(c===a||c===b||c<1||c>18||o<1)throw Error('三連単の3着馬番・オッズが不正です');
   const k=a+'-'+b+'-'+c;
   if(found.has(k))throw Error('三連単の重複: '+k);
   found.set(k,m[2]);blockCount++;
  }else if(/^\d{1,2}$/.test(line)){
   const c=+line;
   if(c!==a&&c!==b)throw Error('三連単オッズが欠落しています: '+a+'-'+b+'-'+c);
  }else if(line==='ページトップへ戻る'||/^\d{1,2}\s+\S/.test(line)){
   // 馬名見出し・ページ内ナビゲーション
  }else if(/^\d/.test(line)){
   throw Error('三連単の未解析行: '+line);
  }
 }
 closeBlock();
 const matches=[];
 for(let n=3;n<=18;n++){
  if(found.size!==n*(n-1)*(n-2)||blocks!==n*(n-1))continue;
  let ok=true;
  for(let i=1;i<=n&&ok;i++)
   for(let j=1;j<=n&&ok;j++){
    if(i===j)continue;
    for(let k=1;k<=n;k++){
     if(k===i||k===j)continue;
     if(!found.has(i+'-'+j+'-'+k)){ok=false;break;}
    }
   }
  if(ok)matches.push(n);
 }
 if(matches.length!==1)throw Error('三連単の件数・欠損検証に失敗: '+found.size+'点 / '+blocks+'表');
 return {
  sanrentan:[...found].map(([k,v])=>k+' '+v).join('\n'),
  count:found.size,horseCount:matches[0]
 };
}

function wakuren(text){
 const norm=text.normalize('NFKC');
 const title='枠連オッズ(枠番順)';
 const start=norm.lastIndexOf(title);
 if(start<0)throw Error('枠連オッズ(枠番順)を開いてください');
 const body=norm.slice(start+title.length).split(/・\s*(?:オッズの強調表示|発売締切直後)|開催選択へ戻る/)[0];

 // 枠番号と枠色が空白・改行で離れていても認識する
 const normalized=body.replace(/枠\s*([1-8])\s*([白黒赤青黄緑橙桃])/g,'\n枠$1$2\n');
 const lines=normalized.split(/\r?\n/).map(clean).filter(Boolean);
 const colors='白黒赤青黄緑橙桃';
 const seen=new Set(),found=new Map();
 let current=0;

 for(const line of lines){
  const h=line.match(/^枠\s*([1-8])\s*([白黒赤青黄緑橙桃])$/);
  if(h){
   const n=+h[1];
   if(colors[n-1]!==h[2]||seen.has(n))throw Error('枠見出し不正: '+line);
   current=n;seen.add(n);continue;
  }
  const m=line.match(/^([1-8])\s+(\d+(?:\.\d+)?)$/);
  if(m&&current){
   const j=+m[1],o=+m[2],k=current+'-'+j;
   if(j<current||o<1||found.has(k))throw Error('枠連の不正・重複: '+k);
   found.set(k,m[2]);continue;
  }
  if(current&&/^[1-8]\s+\S/.test(line))throw Error('枠連の未解析行: '+line);
 }
 if(seen.size!==8)throw Error('枠見出し不足: '+seen.size+'/8');
 for(let i=1;i<=8;i++)
  for(let j=i;j<=8;j++){
   if(!found.has(i+'-'+j))throw Error('枠連オッズ欠損: '+i+'-'+j);
  }
 if(found.size!==36)throw Error('枠連件数不一致: '+found.size+'/36');
 return {
  wakuren:[...found].map(([k,v])=>k+' '+v).join('\n'),
  count:36,frameCount:8
 };
}

if(isJra){
 const b=document.createElement('button');
 b.type='button';
 b.textContent='このJRAオッズを保存';
 b.style.cssText='position:fixed;bottom:80px;right:12px;z-index:2147483647;background:#147857;color:white;padding:13px 16px;border:2px solid white;border-radius:12px;font-size:15px;font-weight:bold';
 b.onclick=()=>{
  try{
   const text=document.body.innerText||'';
   const type=/3連単オッズ\s*[（(]馬番順[）)]/.test(text)?'sanrentan':
    /3連複オッズ\s*[（(]馬番順[）)]/.test(text)?'sanrenpuku':
    /枠連オッズ\s*[（(]枠番順[）)]/.test(text)?'wakuren':
    /馬単オッズ\s*[（(]馬番順[）)]/.test(text)?'umatan':
    /ワイドオッズ\s*[（(]馬番順[）)]/.test(text)?'wide':
    /馬連オッズ\s*[（(]馬番順[）)]/.test(text)?'umaren':'winplace';

   const info=raceInfo(text);
   if(!info)throw Error('レース情報を特定できません');

   const data=type==='sanrentan'?sanrentan(text):
    type==='sanrenpuku'?sanrenpuku(text):
    type==='wakuren'?wakuren(text):
    type==='umatan'?umatan(text):
    type==='winplace'?winPlace():pairs(text,type);

   GM_setValue(key,{
    ...data,type,info,url:location.href,
    savedAt:new Date().toISOString()
   });

   const name={
    sanrentan:'三連単 ',sanrenpuku:'三連複 ',
    wakuren:'枠連 ',umatan:'馬単 ',
    wide:'ワイド ',umaren:'馬連 ',
    winplace:'単勝・複勝 '
   }[type];

   alert(name+data.count+(type==='winplace'?'頭':'点')+
    'を保存しました。\n'+info.date+' '+
    info.track+info.race+'R');
  }catch(e){
   alert('保存できません: '+e.message);
  }
 };
 document.body.appendChild(b);
}

if(isApp){
 window.addEventListener('keiba-ai:import-saved-jra',()=>{
  const data=GM_getValue(key,null);
  const area=document.getElementById('oddsInput');
  const read=document.getElementById('parseOddsBtn');
  const tab=document.querySelector('#tabs button.active');
  let mode=tab?.dataset.mode;

  if(!data){alert('保存データがありません');return;}
  if(!area||!read||read.disabled){
   alert('先にAI勝率CSVと券種を選択してください');
   return;
  }

  if(mode==='trifecta'||/3連単|三連単/.test(tab?.textContent||''))mode='sanrentan';
  if(['trio','3renpuku','3renfuku','sanrenfuku','3連複'].includes(mode)||/3連複|三連複/.test(tab?.textContent||''))mode='sanrenpuku';
  if(['wakuren','frame','bracket','framequinella','frame_quinella'].includes(mode)||/枠連/.test(tab?.textContent||''))mode='wakuren';

  const oddsText=data[mode];
  if(!oddsText){
   alert('この券種の保存データがありません。JRAで保存し直してください');
   return;
  }

  const label=document.querySelector('#raceSelect')?.selectedOptions[0]?.textContent||'';
  if(!data.info){alert('レース識別情報がありません');return;}

  const date=label.match(/20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}/)?.[0]?.replace(/\//g,'-');
  const rm=label.match(/(\d{1,2})\s*R/i);
  if(!date||!rm){
   alert('分析レースを識別できないため停止しました');
   return;
  }

  const d=date.split('-').map((v,i)=>i?String(+v).padStart(2,'0'):v).join('-');
  if(d!==data.info.date||!label.includes(data.info.track)||+rm[1]!==data.info.race){
   alert('レース不一致のため停止しました。\nJRA: '+
    data.info.date+' '+data.info.track+data.info.race+
    'R\nアプリ: '+label);
   return;
  }

  if(!confirm('保存オッズを取り込みます。\n'+
   data.info.date+' '+data.info.track+data.info.race+
   'R\n取得 '+data.count+'件'))return;

  area.value=oddsText;
  area.dispatchEvent(new Event('input',{bubbles:true}));
  read.click();
 });
}
})();
