import test from 'node:test';
import assert from 'node:assert/strict';
import {planPractice} from '../practice-planner.js';
const settings={startDate:'2026-11-02',endDate:'2026-11-08',environmentGroup:'env',engineeringGroup:'eng',onlineGroup:'online',requiredIds:['A']};
const key=(date,time='18:00〜19:00')=>`${date} ${time}`;
const people=()=>['A','B','C','D','E'].map(id=>({id,name:id,answers:{env:{},eng:{},online:{}}}));
const put=(rs,ids,group,slot,value='yes')=>rs.filter(r=>ids.includes(r.id)).forEach(r=>r.answers[group][slot]=value);
test('different campuses cover all five; required member remains in denominator; online weekend late alternative',()=>{
 const rs=people();put(rs,['A','B'],'env',key('2026-11-02'));put(rs,['A','C','D','E'],'eng',key('2026-11-03','19:00〜20:00'));put(rs,['A','B','C','D','E'],'online',key('2026-11-08','21:00〜22:00'));
 const before=JSON.stringify(rs),r=planPractice(rs,settings);assert.equal(r.face[0].covered,5);assert.equal(r.face[0].sessions.length,2);assert.equal(r.online[0].covered,5);assert.equal(r.online[0].sessions[0].start,1260);assert.equal(JSON.stringify(rs),before);
});
test('all required engineering people need yes even in tentative mode',()=>{
 const rs=people();put(rs,['A','B','C'],'eng',key('2026-11-02'));put(rs,['B'],'eng',key('2026-11-02'),'maybe');
 assert.equal(planPractice(rs,{...settings,requiredIds:['A','B'],includeMaybe:true}).face.length,0);
});
test('reject weekend/late campus, short attendance and online ending after 22',()=>{
 const rs=people();for(const slot of [key('2026-11-08'),key('2026-11-02','19:30〜20:30'),key('2026-11-03','18:00〜18:30')])put(rs,['A','B'],'env',slot);
 put(rs,['A','B','C','D','E'],'online',key('2026-11-08','21:30〜22:30'));
 const r=planPractice(rs,settings);assert.equal(r.face.length,0);assert.equal(r.online.length,0);
});
test('incomplete face retained alongside complete online; missing and maybe not confirmed',()=>{
 const rs=people();put(rs,['A','B','C','D'],'env',key('2026-11-02'));put(rs,['E'],'env',key('2026-11-02'),'maybe');put(rs,['A','B','C','D','E'],'online',key('2026-11-08'));
 const r=planPractice(rs,settings);assert.equal(r.face[0].covered,4);assert.equal(r.face[0].uncovered[0].id,'E');assert.equal(r.online[0].covered,5);
 const t=planPractice(rs,{...settings,includeMaybe:true});assert.equal(t.face[0].covered,5);assert.equal(t.face[0].confirmedCovered,4);
});
test('one session preferred when full coverage; duplicate attendance counted once and adjacent same-day sessions not combined',()=>{
 const rs=people();put(rs,['A','B','C'],'env',key('2026-11-02'));put(rs,['A','D','E'],'eng',key('2026-11-02','17:00〜18:00'));
 assert.equal(planPractice(rs,settings).face[0].covered,3);
 put(rs,['A','B','C','D','E'],'env',key('2026-11-03'));assert.equal(planPractice(rs,settings).face[0].sessions.length,1);
});
test('invalid mapping/required person rejected and truncated disclosed',()=>{
 const rs=people();assert.throws(()=>planPractice(rs,{...settings,requiredIds:[]}));assert.throws(()=>planPractice(rs,{...settings,onlineGroup:'env'}));put(rs,['A','B'],'env',key('2026-11-02'));put(rs,['C','D'],'env',key('2026-11-03'));
 assert.equal(planPractice(rs,settings,{maxPairs:0}).truncated,true);
});

test('same-day two-hour gap accepted, shorter gap and overlap rejected in either candidate order',()=>{
 for(const second of ['11:00〜12:00','11:30〜12:30','12:00〜13:00','12:30〜13:30','09:30〜10:30']){
  for(const reverse of [false,true]){
   const rs=people();
   put(rs,reverse?['A','B']:['A','B','C'],'env',key('2026-11-02','09:00〜10:00'));
   put(rs,reverse?['A','C','D','E']:['A','D','E'],'eng',key('2026-11-02',second));
   const r=planPractice(rs,settings);
   const allowed=second.startsWith('12:');
   assert.equal(r.face[0].covered===5,allowed,second+' reverse='+reverse);
   if(allowed)assert.equal(r.face[0].sessions.length,2);
  }
 }
});

test('host excluded dates remove campus sessions only and rerun finds alternative',()=>{
 const rs=people();for(const day of ['2026-11-02','2026-11-03']){
  put(rs,['A','B','C','D','E'],'env',key(day));put(rs,['A','B','C','D','E'],'eng',key(day));put(rs,['A','B','C','D','E'],'online',key(day));
 }
 const result=planPractice(rs,{...settings,excludedDates:['2026-11-02']});
 assert(result.face.length>0);assert(result.face.every(p=>p.sessions.every(s=>s.date==='2026-11-03')));
 assert(result.online.some(p=>p.sessions[0].date==='2026-11-02'));
 assert.equal(planPractice(rs,{...settings,excludedDates:['2026-11-02','2026-11-03']}).face.length,0);
 assert.throws(()=>planPractice(rs,{...settings,excludedDates:['2026-12-01']}));
 assert(planPractice(rs,settings).face.some(p=>p.sessions[0].date==='2026-11-02'));
});

test('practice planner matches independent exhaustive coverage for 120 mixed-campus cases',()=>{
 let seed=1701;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let trial=0;trial<120;trial++){
  const rs=people(),slots=[['2026-11-04','09:00〜10:00',9],['2026-11-04','12:00〜13:00',12],['2026-11-05','09:00〜10:00',9],['2026-11-05','12:00〜13:00',12]];
  const includeMaybe=trial%2===0,excludedDates=trial%3===0?['2026-11-04']:[],candidates=[];
  for(const group of ['env','eng'])for(const [date,time,hour] of slots){
   const answers=rs.map(()=>['yes','no','maybe',undefined][Math.floor(random()*4)]);
   answers.forEach((a,i)=>{if(a)rs[i].answers[group][key(date,time)]=a;});
   const ids=answers.flatMap((a,i)=>a==='yes'||includeMaybe&&a==='maybe'?[i]:[]);
   if(!excludedDates.includes(date)&&ids.length>=2&&(group!=='eng'||answers[0]==='yes'))candidates.push({date,hour,ids});
  }
  let expected=0;
  for(let i=0;i<candidates.length;i++){
   expected=Math.max(expected,candidates[i].ids.length);
   for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j];if(a.date===b.date&&Math.abs(a.hour-b.hour)<3)continue;
    expected=Math.max(expected,new Set([...a.ids,...b.ids]).size);
   }
  }
  const result=planPractice(rs,{...settings,includeMaybe,excludedDates});
  assert.equal(result.truncated,false);assert.equal(result.face[0]?.covered||0,expected,'trial '+trial);
  for(const p of result.face)assert.equal(p.covered,new Set(p.sessions.flatMap(s=>s.participants.map(r=>r.id))).size);
 }
});
test('practice handles no responses, more than 32 people and identical display names',()=>{
 assert.throws(()=>planPractice([],{...settings,requiredIds:['A']}));
 const rs=Array.from({length:40},(_,i)=>({id:String(i),name:'同名',answers:{env:{[key('2026-11-04')]:'yes'},eng:{},online:{}}}));
 const r=planPractice(rs,{...settings,requiredIds:['0','39']});assert.equal(r.face[0].covered,40);assert.equal(r.face[0].sessions.length,1);
});

test('online exclusions are independent, validated, reversible and leave source data intact',()=>{
 const rs=people(),days=['2026-11-04','2026-11-05'];
 for(const day of days)for(const group of ['env','eng','online'])put(rs,rs.map(r=>r.id),group,key(day));
 const before=JSON.stringify(rs);
 const r=planPractice(rs,{...settings,excludedDates:[days[0]],onlineExcludedDates:[days[1],days[1]]});
 assert(r.face.length&&r.online.length);
 assert(r.face.every(p=>p.sessions.every(s=>s.date===days[1])));
 assert(r.online.every(p=>p.sessions.every(s=>s.date===days[0])));
 const all=planPractice(rs,{...settings,onlineExcludedDates:days});assert.equal(all.online.length,0);assert(all.face.length);
 assert(planPractice(rs,settings).online.length);
 for(const date of ['2026-11-09','2026-02-30','invalid'])assert.throws(()=>planPractice(rs,{...settings,onlineExcludedDates:[date]}),/オンライン/);
 assert.equal(JSON.stringify(rs),before);
});
