import { dateList, rangeKey } from './time-data.js?v=timetable-1';
export const WEEKDAYS = [1,2,3,4,5,6,0];
export const DAY_NAMES = ['日','月','火','水','木','金','土'];
export const weekdayPeriods = [
  {id:'morning',name:'朝',start:480,end:540},
  {id:'class1',name:'1限',start:540,end:630},
  {id:'class2',name:'2限',start:640,end:730},
  {id:'class3',name:'3限',start:780,end:870},
  {id:'class4',name:'4限',start:880,end:970},
  {id:'class5',name:'5限',start:980,end:1070},
  {id:'after',name:'放課後',start:1070,end:1320}
];
export const weekendPeriods = [{id:'morning',name:'午前',start:540,end:720},{id:'afternoon',name:'午後',start:720,end:1020},{id:'night',name:'夜',start:1020,end:1320}];
export const periodsFor = day => day===0 || day===6 ? weekendPeriods : weekdayPeriods;
export const newDraft = () => ({ weekly:{}, exceptions:[] });
export function setWeekly(draft, days, periodIds, answer, weekend) {
  if (!['yes','no','maybe'].includes(answer)) throw Error('回答を選択してください。');
  let changed = 0;
  for (const day of days) {
    if (!WEEKDAYS.includes(day) || (day===0 || day===6) !== weekend) continue;
    for (const period of periodsFor(day)) if (periodIds.includes(period.id)) { draft.weekly[`${day}_${period.id}`]=answer; changed++; }
  }
  return changed;
}
export function addException(draft, dates, exception) {
  const {date,start,end,answer}=exception;
  if (!dates.includes(date) || !Number.isInteger(start) || !Number.isInteger(end) || start<480 || end>1320 || end<=start || start%10 || end%10 || !['yes','no','maybe'].includes(answer)) throw Error('イベント期間内の日付と、8:00〜22:00の開始・終了時刻（10分単位）を指定してください。');
  draft.exceptions.push({...exception});
}
export function expandDay(draft, date) {
  const values=Array(84).fill('maybe');
  const day=new Date(date+'T00:00:00Z').getUTCDay();
  for(const period of periodsFor(day)) for(let t=period.start;t<period.end;t+=10) values[(t-480)/10]=draft.weekly[`${day}_${period.id}`] || 'maybe';
  // Exceptions always override weekly edits; later exceptions win, removal restores earlier settings.
  for(const exception of draft.exceptions.filter(e=>e.date===date)) for(let t=exception.start;t<exception.end;t+=10) values[(t-480)/10]=exception.answer;
  return values;
}
export function compressDay(draft,date) {
  const values=expandDay(draft,date), result={};let start=0;
  for(let i=1;i<=values.length;i++) if(i===values.length || values[i]!==values[start]) {result[rangeKey(date,480+start*10,480+i*10)]=values[start];start=i;}
  return result;
}
export function serializeDraft(draft,start,end) {return Object.assign({},...dateList(start,end).map(date=>compressDay(draft,date)));}
