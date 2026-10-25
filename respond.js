import { dateList, formatTime } from './time-data.js?v=timetable-1';
import { WEEKDAYS, DAY_NAMES, periodsFor, weekdayPeriods, weekendPeriods, newDraft, setWeekly, addException, expandDay, serializeDraft } from './response-model.js?v=timetable-1';
import './response.js';
const $=id=>document.getElementById(id);
const marks={yes:'○',no:'×',maybe:'？'};
let current=null, busy=false;
const drafts=new Map();
const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
function button(text,action,cls='secondary'){const b=element('button',text,cls);b.type='button';b.onclick=action;return b;}
function cardFor(group,index){
  const card=element('section',null,'card');card.dataset.group=group.id;
  card.innerHTML=`<h2></h2><p class="hint">まず曜日ごとに回答してください。？を押すと○、もう一度押すと×、もう一度で？に戻ります。</p><div class="copy-tools toolbar"></div>
  <h3>平日</h3><div class="simple-wrap weekday-table"></div>
  <h3>土日</h3><div class="simple-wrap weekend-table"></div>
  <p class="hint">平日の昼休み・授業間の休憩は？のままです。下の表で必要な日時だけ変更できます。</p>
  <details class="daily-detail"><summary>特定の日だけ細かく修正する</summary>
  <p class="hint">1マス10分です。マスを押して変更できます。パソコンでは押したままなぞると同じ回答を続けて付けられます。表は左右にスクロールできます。ここでの修正は曜日の回答より優先します。</p>
  <div class="date-navigation toolbar"></div><p class="page-range"></p>
  <div class="grid-wrap" role="region" aria-label="日付別の10分刻みの回答表" tabindex="0"></div></details>
  <p class="edit-status" role="status"></p>`;
  card.querySelector('h2').textContent=`${index+1}. ${group.title}`;
  const q=selector=>card.querySelector(selector), dates=dateList(current.startDate,current.endDate);
  let undo=null,page=0,dragValue=null;
  const status=message=>q('.edit-status').textContent=message;
  const remember=()=>{undo=structuredClone(drafts.get(group.id));undoButton.disabled=false;};
  const undoButton=button('直前の変更を元に戻す',()=>{if(!undo)return;drafts.set(group.id,undo);undo=null;undoButton.disabled=true;refresh();status('直前の変更を取り消しました。');});undoButton.disabled=true;
  if(index>0)q('.copy-tools').append(button('①と同じ回答をコピー',()=>{remember();drafts.set(group.id,structuredClone(drafts.get(current.groups[0].id)));refresh();status('①の回答をコピーしました。');},'copy-button secondary'));
  q('.copy-tools').append(undoButton);
  const next=value=>({maybe:'yes',yes:'no',no:'maybe'}[value]);
  const paint=(b,value,label)=>{b.textContent=marks[value];b.className=`simple-button ${value}`;b.setAttribute('aria-label',`${label}：${marks[value]}`);};
  function weeklyTable(days,periods,mount){
    const table=element('table',null,'simple-table');const head=element('thead'),row=element('tr');row.append(element('th','曜日'));
    for(const p of periods){const th=element('th',p.name);th.scope='col';th.append(element('small',`${formatTime(p.start)}〜${formatTime(p.end)}`));row.append(th);}head.append(row);table.append(head);
    const body=element('tbody');for(const day of days){const tr=element('tr');const th=element('th',DAY_NAMES[day]);th.scope='row';tr.append(th);for(const p of periods){const td=element('td');const b=button('',()=>{remember();const d=drafts.get(group.id);setWeekly(d,[day],[p.id],next(d.weekly[`${day}_${p.id}`]||'maybe'),day===0||day===6);refresh();status(`${DAY_NAMES[day]}曜の${p.name}を変更しました。`);});b.dataset.weekday=day;b.dataset.period=p.id;b.dataset.label=`${DAY_NAMES[day]}曜 ${p.name} ${formatTime(p.start)}〜${formatTime(p.end)}`;td.append(b);tr.append(td);}body.append(tr);}table.append(body);q(mount).append(table);
  }
  weeklyTable([1,2,3,4,5],weekdayPeriods,'.weekday-table');weeklyTable([6,0],weekendPeriods,'.weekend-table');
  const previous=button('前の7日',()=>{page=Math.max(0,page-7);buildGrid();}),following=button('次の7日',()=>{if(page+7<dates.length)page+=7;buildGrid();});q('.date-navigation').append(previous,following);
  function changeCell(b,value){const d=drafts.get(group.id),date=b.dataset.date,start=+b.dataset.minute;d.exceptions=d.exceptions.filter(e=>!(e.date===date&&e.start===start&&e.end===start+10));addException(d,dates,{date,start,end:start+10,answer:value});paint(b,value,`${date} ${formatTime(start)}〜${formatTime(start+10)}`);status(`${date} ${formatTime(start)}〜${formatTime(start+10)}を${marks[value]}にしました。`);}
  function buildGrid(){
    dragValue=null;const mount=q('.grid-wrap');mount.replaceChildren();const shown=dates.slice(page,page+7);previous.disabled=page===0;following.disabled=page+7>=dates.length;q('.page-range').textContent=`${shown[0]}〜${shown.at(-1)}（${dates.length}日中）`;
    const table=element('table',null,'detail-table'),head=element('thead'),hours=element('tr'),minutes=element('tr');const corner=element('th','日付');corner.rowSpan=2;corner.scope='col';hours.append(corner);
    for(let hour=8;hour<22;hour++){const th=element('th',`${hour}時`);th.colSpan=6;th.scope='colgroup';hours.append(th);for(let minute=0;minute<60;minute+=10){const label=element('th',`${String(minute).padStart(2,'0')}〜${String(minute+10).padStart(2,'0')}`);label.scope='col';minutes.append(label);}}head.append(hours,minutes);table.append(head);
    const body=element('tbody');for(const date of shown){const row=element('tr'),day=DAY_NAMES[new Date(date+'T00:00:00Z').getUTCDay()];const th=element('th',`${date.slice(5)}（${day}）`);th.scope='row';row.append(th);const values=expandDay(drafts.get(group.id),date);
      for(let i=0;i<84;i++){const minute=480+i*10,td=element('td');let mouseHandled=false;const b=button('',event=>{if(event.detail!==0&&mouseHandled){mouseHandled=false;return;}remember();changeCell(b,next(expandDay(drafts.get(group.id),date)[i]));});b.dataset.date=date;b.dataset.minute=minute;paint(b,values[i],`${date} ${formatTime(minute)}〜${formatTime(minute+10)}`);
        b.onpointerdown=event=>{if(event.pointerType!=='mouse'||event.button!==0)return;event.preventDefault();remember();dragValue=next(expandDay(drafts.get(group.id),date)[i]);mouseHandled=true;changeCell(b,dragValue);};
        b.onpointerenter=event=>{if(event.pointerType==='mouse'&&event.buttons===1&&dragValue)changeCell(b,dragValue);};td.append(b);row.append(td);
      }body.append(row);
    }table.append(body);mount.append(table);
  }
  window.addEventListener('pointerup',()=>{dragValue=null;});window.addEventListener('blur',()=>{dragValue=null;});
  q('.daily-detail').ontoggle=()=>{if(q('.daily-detail').open)buildGrid();};
  function refresh(){card.querySelectorAll('[data-weekday]').forEach(b=>paint(b,drafts.get(group.id).weekly[`${b.dataset.weekday}_${b.dataset.period}`]||'maybe',b.dataset.label));if(q('.daily-detail').open)buildGrid();}
  refresh();return card;
}
window.addEventListener('eventLoaded',event=>{
  current=event.detail;drafts.clear();$('cards').replaceChildren();
  $('pageTitle').textContent=current.title || '日程調整';
  try {dateList(current.startDate,current.endDate);for(const [index,group] of current.groups.entries()) {drafts.set(group.id,newDraft());$('cards').append(cardFor(group,index));}
    $('submitButton').disabled=!current.isOpen;$('answerFields').disabled=!current.isOpen;
    if(!current.isOpen){$('submitButton').textContent='回答受付終了';$('status').textContent='このイベントの回答受付は終了しています。';}
  }catch(error){current=null;$('status').textContent=error.message;}
});
$('submitButton').onclick=async()=>{
  if(busy || !current?.isOpen)return;
  const name=$('name').value.trim();if(!name){$('status').textContent='名前を入力してください。';$('name').focus();return;}
  const answers=Object.fromEntries(current.groups.map(g=>[g.id,serializeDraft(drafts.get(g.id),current.startDate,current.endDate)]));
  // Keep margin for field/index overhead under Firestore's 1 MiB document limit.
  if(new TextEncoder().encode(JSON.stringify({name,answers})).length>700000){$('status').textContent='回答データが大きすぎます。主催者にイベントの期間や質問数を減らしてもらってください。';return;}
  busy=true;$('answerFields').disabled=true;$('submitButton').disabled=true;$('submitButton').textContent='送信中…';
  try{await window.saveResponseToFirestore(current.id,{name,answers});$('submitButton').textContent='送信済み';$('status').textContent='送信しました！ありがとうございます。';}
  catch(error){console.error(error);busy=false;$('answerFields').disabled=false;$('submitButton').disabled=false;$('submitButton').textContent='回答を送信';$('status').textContent='送信に失敗しました。入力内容は残っています。もう一度お試しください。';}
};
await import('./event.js');
