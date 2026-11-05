import { dateList, answerStep, readInterval, groupAnswers } from './time-data.js?v=audit-1';
// Compare campus combinations using response IDs; never write back to saved answers.
export function planPractice(responses, settings, {maxPairs=500000, top=3}={}) {
  const {startDate,endDate,environmentGroup,engineeringGroup,onlineGroup,requiredIds=[],includeMaybe=false}=settings;
  const dates=dateList(startDate,endDate);
  const ids=responses.map(r=>r.id);
  if(ids.some(id=>!id)||new Set(ids).size!==ids.length) throw Error('回答IDが重複しています。');
  if(!environmentGroup||!engineeringGroup||!onlineGroup||new Set([environmentGroup,engineeringGroup,onlineGroup]).size!==3) throw Error('3つの形式に異なる回答項目を選んでください。');
  if(!requiredIds.length||requiredIds.some(id=>!ids.includes(id))) throw Error('工学キャンパスで参加必須の人を選んでください。');
  const people=responses.map(r=>({id:r.id,name:r.name||'名前なし'}));
  const count=m=>{let n=0;while(m){m&=m-1n;n++;}return n;};
  const members=m=>people.filter((_,i)=>m&(1n<<BigInt(i)));
  const build=(group,location,online=false)=>{
    const out=[];
    for(const date of dates){
      const day=new Date(date+'T00:00:00Z').getUTCDay();
      if(!online&&(day===0||day===6))continue;
      for(let start=480;start<=(online?1260:1140);start+=answerStep(responses,group)){
        const answers=responses.map(r=>readInterval(groupAnswers(r,group),date,start,start+60));
        if(group===engineeringGroup&&!requiredIds.every(id=>answers[ids.indexOf(id)]==='yes'))continue;
        let mask=0n,confirmed=0n;
        answers.forEach((a,i)=>{if(a==='yes')confirmed|=1n<<BigInt(i);if(a==='yes'||includeMaybe&&a==='maybe')mask|=1n<<BigInt(i);});
        if(count(mask)<(online?1:2))continue;
        out.push({date,start,end:start+60,location,mask,confirmed});
      }
    }
    return out;
  };
  const campus=[...build(environmentGroup,'環境人間キャンパス'),...build(engineeringGroup,'工学キャンパス')];
  campus.sort((a,b)=>count(b.mask)-count(a.mask)||a.date.localeCompare(b.date)||a.start-b.start||a.location.localeCompare(b.location));
  const compare=(a,b)=>b.covered-a.covered||b.confirmedCovered-a.confirmedCovered||a.entries.length-b.entries.length||a.latest-b.latest||a.imbalance-b.imbalance||a.key.localeCompare(b.key);
  const best=[];
  const add=entries=>{
    const ordered=[...entries].sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    const mask=entries.reduce((n,e)=>n|e.mask,0n),confirmed=entries.reduce((n,e)=>n|e.confirmed,0n);
    best.push({entries:ordered,mask,covered:count(mask),confirmedCovered:count(confirmed),latest:Math.max(...entries.map(e=>e.start)),imbalance:Math.max(...entries.map(e=>count(e.mask)))-Math.min(...entries.map(e=>count(e.mask))),key:ordered.map(e=>`${e.date}-${e.start}-${e.location}`).join('|')});
    best.sort(compare);if(best.length>top)best.pop();
  };
  campus.forEach(c=>add([c]));
  let pairs=0,truncated=false;
  outer:for(let i=0;i<campus.length;i++)for(let j=i+1;j<campus.length;j++){
    if(pairs++>=maxPairs){truncated=true;break outer;}
    const a=campus[i],b=campus[j];
    // Same-day sessions need at least two hours from the earlier end to the later start.
    if(a.date===b.date && Math.max(a.start,b.start)-Math.min(a.end,b.end)<120)continue;
    add([a,b]);
  }
  const serialize=p=>({covered:p.covered,confirmedCovered:p.confirmedCovered,total:people.length,complete:p.covered===people.length,uncovered:members(((1n<<BigInt(people.length))-1n)^p.mask),sessions:p.entries.map(e=>({date:e.date,start:e.start,end:e.end,location:e.location,participants:members(e.mask),needsConfirmation:members(e.mask&~e.confirmed)}))});
  const face=best.map(serialize);best.length=0;
  build(onlineGroup,'オンライン',true).filter(e=>count(e.mask)===people.length).forEach(e=>add([e]));
  return {people,includeMaybe,truncated,pairs,face,online:best.map(serialize)};
}
