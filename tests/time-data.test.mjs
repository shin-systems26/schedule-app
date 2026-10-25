import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInterval,rangeKey,candidateSlots} from '../time-data.js';
import {newDraft,setWeekly,addException,serializeDraft,periodsFor,expandDay} from '../response-model.js';
import {planSplit} from '../split-planner.js';
import {calculateRanking} from '../ranking.js';
const day='2026-10-26';
const options={startDate:day,endDate:day,maxSessions:2,minParticipants:2,duration:1,startHour:8,endHour:22,avoidStart:21,avoidEnd:24,avoidEnabled:true,organizerId:'',requireOrganizer:false,priority:'sessions'};
test('weekday has seven periods and weekend three; timetable boundaries exact',()=>{
 assert.equal(periodsFor(1).length,7);assert.equal(periodsFor(6).length,3);
 const d=newDraft();setWeekly(d,[1],['class2'],'yes',false);const a=serializeDraft(d,day,day);
 assert.equal(readInterval(a,day,640,730),'yes');assert.equal(readInterval(a,day,630,640),'maybe');assert.equal(readInterval(a,day,730,740),'maybe');
});
test('batch weekdays and weekend independent; unknown gaps preserved',()=>{
 const d=newDraft();setWeekly(d,[1,3,5],['after'],'yes',false);setWeekly(d,[6,0],['afternoon'],'no',true);
 const a=serializeDraft(d,day,'2026-11-01');assert.equal(readInterval(a,day,1070,1130),'yes');assert.equal(readInterval(a,'2026-10-27',1070,1130),'maybe');assert.equal(readInterval(a,'2026-10-31',720,1020),'no');assert.equal(readInterval(a,day,730,780),'maybe');
});
test('exceptions override later weekly edits, later exceptions win, removal restores earlier values',()=>{
 const d=newDraft();setWeekly(d,[1],['after'],'yes',false);addException(d,[day],{date:day,start:1080,end:1170,answer:'no'});setWeekly(d,[1],['after'],'maybe',false);
 addException(d,[day],{date:day,start:1110,end:1140,answer:'yes'});let a=serializeDraft(d,day,day);
 assert.equal(readInterval(a,day,1080,1110),'no');assert.equal(readInterval(a,day,1110,1140),'yes');d.exceptions.pop();a=serializeDraft(d,day,day);assert.equal(readInterval(a,day,1110,1140),'no');d.exceptions.pop();assert.equal(readInterval(serializeDraft(d,day,day),day,1080,1170),'maybe');
});
test('exception invalid times and dates rejected',()=>{
 for(const e of [{date:'2026-10-27',start:480,end:540},{date:day,start:1071,end:1140},{date:day,start:1140,end:1080},{date:day,start:470,end:540}])assert.throws(()=>addException(newDraft(),[day],{...e,answer:'yes'}));
});
test('compact saved intervals round-trip every 10-minute value',()=>{
 const d=newDraft();setWeekly(d,[1],['class1','class4','after'],'yes',false);addException(d,[day],{date:day,start:1080,end:1110,answer:'no'});const a=serializeDraft(d,day,day),expected=expandDay(d,day);
 expected.forEach((v,i)=>assert.equal(readInterval(a,day,480+i*10,490+i*10),v));assert.ok(Object.keys(a).length<20);
});
test('old hourly values combine with new intervals without turning missing into yes or maybe',()=>{
 const old={[rangeKey(day,1080,1140)]:'yes'};
 assert.equal(readInterval(old,day,1070,1130),undefined);assert.equal(readInterval(old,day,1080,1140),'yes');
 const mixed={[rangeKey(day,1070,1100)]:'yes',[rangeKey(day,1100,1130)]:'maybe'};assert.equal(readInterval(mixed,day,1070,1130),'maybe');
});
test('planner proposes 17:50 start, new and legacy responses stay compatible',()=>{
 const a={id:'A',answers:{g:{[rangeKey(day,1070,1130)]:'yes'}}};const b={id:'B',g:{[rangeKey(day,1070,1130)]:'yes'}};
 const best=planSplit([a,b],'g',options).plans[0];assert.equal(best.coverage,100);assert.equal(Math.round(best.sessions[0].start*60),1070);assert.equal(Math.round(best.sessions[0].end*60),1130);
 const legacy={id:'C',g:{[rangeKey(day,1080,1140)]:'yes'}};assert.equal(planSplit([a,legacy],'g',options).plans.length,0);
});
test('8am availability supported; lunch gaps block continuous sessions',()=>{
 const a={id:'A',g:{[rangeKey(day,480,540)]:'yes',[rangeKey(day,640,730)]:'yes',[rangeKey(day,780,870)]:'yes'}};
 assert.equal(planSplit([a],'g',{...options,minParticipants:1}).plans[0].sessions[0].start,8);
 assert.equal(readInterval(a.g,day,720,780),undefined);
});
test('ranking checks complete one-hour windows on ten-minute starts',()=>{
 const r={answers:{g:{[rangeKey(day,1070,1130)]:'yes',[rangeKey(day,1130,1320)]:'no'}}};
 const ranked=calculateRanking([r],'g',candidateSlots(day,day,true));assert.equal(ranked[0].slot,rangeKey(day,1070,1130));assert.equal(ranked[0].yes,1);
});
test('copy remains independent of source',()=>{const a=newDraft();setWeekly(a,[1],['after'],'yes',false);const b=structuredClone(a);setWeekly(b,[1],['after'],'no',false);assert.equal(a.weekly['1_after'],'yes');});
