import { parseRange, readInterval, dateList, rangeKey } from './time-data.js?v=audit-1';
export function makeSlots(startDate, endDate) {
  return dateList(startDate,endDate).flatMap(date=>Array.from({length:13},(_,i)=>rangeKey(date,(i+9)*60,(i+10)*60)));
}
export function calculateRanking(responses, group, slots) {
  const tier=r=>r.yes===responses.length?0:r.no===0&&r.missing===0?1:2;
  return slots.map(slot=>{
    let yes=0,no=0,maybe=0,missing=0;
    const range=parseRange(slot);
    for(const response of responses){
      const answer=range?readInterval(response.answers?.[group]||response[group]||{},range.date,range.start,range.end):undefined;
      if(answer==='yes')yes++;else if(answer==='no')no++;else if(answer==='maybe')maybe++;else missing++;
    }
    return {slot,yes,no,maybe,missing,score:yes*3+maybe*0.5-no*4};
  }).sort((a,b)=>tier(a)-tier(b) || b.yes-a.yes || a.no-b.no || a.missing-b.missing || b.score-a.score || a.slot.localeCompare(b.slot));
}
export function renderRanking(area,title,ranking,total){
  const section=document.createElement('section'),heading=document.createElement('h2');heading.textContent=title;section.append(heading);
  const candidates=ranking.filter(r=>r.yes+r.no+r.maybe>0);
  if(!total || !candidates.length){const p=document.createElement('p');p.textContent='まだ集計できる回答がありません。';section.append(p);area.append(section);return;}
  const table=document.createElement('table');
  table.innerHTML='<thead><tr><th>順位</th><th>日時</th><th>○</th><th>×</th><th>？</th><th>参考スコア</th><th>未回答</th><th>評価</th></tr></thead><tbody></tbody>';
  let shown=0;
  const count=document.createElement('p'),more=document.createElement('button');more.type='button';more.textContent='次の20件を表示';
  const appendPage=()=>{
  for(let index=shown;index<Math.min(shown+20,candidates.length);index++){
    const item=candidates[index];
    const row=document.createElement('tr');if(index<3)row.classList.add('top');
    const complete=item.yes===total;
    if(complete)row.classList.add('good');
    let comment=complete?'全員○！':item.yes===0?'参加可能の回答なし':item.no?`×${item.no}人`:item.missing?'未回答あり・要確認':item.maybe?'？あり・要確認':'要確認';
    for(const value of [index+1,item.slot,item.yes,item.no,item.maybe,item.score,item.missing,comment]){const td=document.createElement('td');td.textContent=String(value);row.append(td);}
    table.querySelector('tbody').append(row);
  }
  shown=Math.min(shown+20,candidates.length);count.textContent=`全${candidates.length}候補中 ${shown}件を表示（全期間を集計済み）`;more.hidden=shown===candidates.length;
  };
  more.onclick=appendPage;appendPage();
  section.append(count,table,more);area.append(section);
}
