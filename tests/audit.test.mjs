import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateRanking} from '../ranking.js';
import {dateList,parseRange,answerStep,candidateSlots,rangeKey} from '../time-data.js';
import {planSplit} from '../split-planner.js';
const day='2026-11-04',slot=rangeKey(day,540,600),later=rangeKey(day,600,660);
test('missing answers neither earn points nor become maybe',()=>{
 const r=calculateRanking([{answers:{g:{[slot]:'yes'}}},{answers:{g:{}}},{name:'legacy missing'}],'g',[slot,later]);
 assert.deepEqual([r[0].yes,r[0].maybe,r[0].missing,r[0].score],[1,0,2,3]);
 assert.deepEqual([r[1].maybe,r[1].missing,r[1].score],[0,3,0]);
});
test('confirmed attendance outranks unconfirmed even when old weighted score is smaller',()=>{
 const responses=Array.from({length:5},(_,i)=>({answers:{g:{[slot]:i<2?'yes':'no',[later]:'maybe'}}}));
 const r=calculateRanking(responses,'g',[later,slot]);assert.equal(r[0].slot,slot);assert.ok(r[0].score<r[1].score);
});
test('all yes first; ties use fewer no, then fewer missing, then chronological order',()=>{
 const keys=[540,600,660,720].map(m=>rangeKey(day,m,m+60));
 const rows=[['yes','yes','yes'],['yes','no','maybe'],['yes','maybe',undefined],['yes','maybe','maybe']];
 const people=Array.from({length:3},(_,i)=>({answers:{g:Object.fromEntries(keys.flatMap((k,j)=>rows[j][i]?[[k,rows[j][i]]]:[]))}}));
 assert.deepEqual(calculateRanking(people,'g',keys).map(r=>r.slot),[keys[0],keys[3],keys[2],keys[1]]);
});
test('half-hour data does not generate ten-minute shifted duplicates; legacy precision remains',()=>{
 const r=[{g:{[rangeKey(day,540,1320)]:'yes'}}];
 assert.equal(answerStep(r,'g'),30);
 for(const duration of [30,60]) for(const key of candidateSlots(day,day,answerStep(r,'g'),duration)){
  const range=parseRange(key);assert.equal(range.start%30,0);assert.equal(range.end-range.start,duration);
 }
 assert.equal(answerStep([{g:{[rangeKey(day,1070,1130)]:'yes'}}],'g'),10);
});
test('invalid dates and excessively long periods rejected',()=>{
 for(const date of ['2026-02-30','2026-13-01','2026-1-01']){assert.throws(()=>dateList(date,date));assert.equal(parseRange(`${date} 09:00〜10:00`),null);}
 assert.throws(()=>dateList('2026-01-01','2027-01-02'));assert.equal(dateList('2028-02-29','2028-02-29').length,1);
});
test('split result matches independent exhaustive half-hour pairs for randomized cases',()=>{
 let seed=123;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let run=0;run<80;run++){
  const values=Array.from({length:6},()=>Array.from({length:8},()=>random()>.5));
  const responses=values.map((v,i)=>({id:String(i),g:Object.fromEntries(v.map((yes,j)=>[rangeKey(day,540+j*30,570+j*30),yes?'yes':'no']))}));
  for(const duration of [.5,1]){
   const candidates=[];for(let i=0;i+duration*2<=8;i++){
    const ids=values.flatMap((v,k)=>v.slice(i,i+duration*2).every(Boolean)?[k]:[]);if(ids.length>=2)candidates.push({start:i,end:i+duration*2,ids});
   }
   let coverage=0;
   for(const a of candidates){coverage=Math.max(coverage,a.ids.length);for(const b of candidates)if(a.end<=b.start||b.end<=a.start)coverage=Math.max(coverage,new Set([...a.ids,...b.ids]).size);}
   const result=planSplit(responses,'g',{startDate:day,endDate:day,maxSessions:2,minParticipants:2,duration,startHour:9,endHour:13,avoidStart:21,avoidEnd:24,avoidEnabled:true,priority:'sessions',organizerId:'',requireOrganizer:false});
   assert.equal(result.truncated,false);assert.equal(result.plans[0]?.covered||0,coverage);
  }
 }
});
