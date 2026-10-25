import { dateList, formatTime } from './time-data.js?v=timetable-1';
import { WEEKDAYS, DAY_NAMES, periodsFor, weekdayPeriods, weekendPeriods, newDraft, setWeekly, addException, compressDay, serializeDraft } from './response-model.js?v=timetable-1';
import './response.js';
const $=id=>document.getElementById(id);
const marks={yes:'○',no:'×',maybe:'？'};
let current=null, busy=false;
const drafts=new Map();
const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
function button(text,action,cls='secondary'){const b=element('button',text,cls);b.type='button';b.onclick=action;return b;}
function selectOptions(select,items){select.replaceChildren(...items.map(([value,label])=>{const o=element('option',label);o.value=value;return o;}));}
function cardFor(group,index){
  const card=element('section',null,'card');card.dataset.group=group.id;
  card.innerHTML=`<h2></h2><p class="hint">曜日と時間帯を選んで、まとめて回答できます。選んでいない時間は？のままです。</p>
  <div class="copy-tools"></div>
  <div class="quick-entry"><label>まとめて入力する曜日<select class="day-type"><option value="weekday">平日（月〜金）</option><option value="weekend">土日</option></select></label>
  <fieldset class="days"><legend>曜日（複数選択）</legend></fieldset>
  <fieldset class="periods"><legend>時間帯（複数選択）</legend></fieldset>
  <div class="toolbar"><button type="button" data-value="yes">選んだ枠を○にする</button><button type="button" data-value="no" class="secondary">選んだ枠を×にする</button><button type="button" data-value="maybe" class="secondary">選んだ枠を？に戻す</button></div></div>
  <p class="edit-status" role="status"></p>
  <details class="weekly-detail"><summary>曜日ごとに確認・修正する</summary><div class="day-tabs toolbar" aria-label="確認する曜日"></div><div class="week-rows"></div><p class="hint">？ → ○ → × の順で切り替わります。昼休み・授業間の休憩は？のままです。必要なら下の日時指定で回答してください。</p></details>
  <details class="exceptions"><summary>特定の日・時間だけ変更する</summary><div class="exception-fields"><label>変更する日<input class="exception-date" type="date"></label><label>開始時刻<input class="exception-start" type="time" step="600" value="14:00" min="08:00" max="22:00"></label><label>終了時刻<input class="exception-end" type="time" step="600" value="15:30" min="08:00" max="22:00"></label><label>この時間の回答<select class="exception-value"><option value="no">× 参加できない</option><option value="yes">○ 参加できそう</option><option value="maybe">？ まだ分からない</option></select></label></div><button type="button" class="exception-add">この時間だけ変更</button><p class="hint">曜日設定より優先します。重なる修正は後から追加したものが優先されます。</p><div class="exception-list"></div></details>
  <details class="review"><summary>実際の日付で回答を確認</summary><label>確認する日付<select class="review-date"></select></label><div class="review-rows"></div></details>`;
  card.querySelector('h2').textContent=`${index+1}. ${group.title}`;
  const q=selector=>card.querySelector(selector);
  let selectedDay=1, undo=null;
  const status=message=>q('.edit-status').textContent=message;
  function mutate(action,message){const before=structuredClone(drafts.get(group.id));try{action();undo=before;refresh();status(message);}catch(error){status(error.message);}}
  const undoButton=button('直前の変更を元に戻す',()=>{if(!undo)return;drafts.set(group.id,undo);undo=null;refresh();status('直前の変更を取り消しました。');});
  q('.copy-tools').append(undoButton);
  if(index>0) q('.copy-tools').prepend(button('①と同じ回答をコピー',()=>mutate(()=>drafts.set(group.id,structuredClone(drafts.get(current.groups[0].id))),'①の曜日設定と日時指定をコピーしました。'),'copy-button secondary'));
  function checkboxes(container,items){container.querySelectorAll('label').forEach(n=>n.remove());for(const [value,label] of items){const l=element('label',null,'choice');const input=element('input');input.type='checkbox';input.value=String(value);l.append(input,document.createTextNode(label));container.append(l);}}
  function quickType(){const weekend=q('.day-type').value==='weekend';checkboxes(q('.days'),(weekend?[6,0]:[1,2,3,4,5]).map(day=>[day,DAY_NAMES[day]]));checkboxes(q('.periods'),(weekend?weekendPeriods:weekdayPeriods).map(p=>[p.id,`${p.name} ${formatTime(p.start)}〜${formatTime(p.end)}`]));}
  q('.day-type').onchange=quickType;quickType();
  q('.quick-entry .toolbar').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const days=[...q('.days').querySelectorAll('input:checked')].map(input=>+input.value),periods=[...q('.periods').querySelectorAll('input:checked')].map(input=>input.value);
    if(!days.length || !periods.length){status('曜日と時間帯をそれぞれ1つ以上選んでください。');return;}
    mutate(()=>setWeekly(drafts.get(group.id),days,periods,b.dataset.value,q('.day-type').value==='weekend'),`${days.length*periods.length}枠を${marks[b.dataset.value]}にしました。日時指定の修正は維持しています。`);
  });
  for(const day of WEEKDAYS) q('.day-tabs').append(button(DAY_NAMES[day],()=>{selectedDay=day;renderWeek();}));
  function renderWeek(){q('.week-rows').replaceChildren();[...q('.day-tabs').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(WEEKDAYS[i]===selectedDay)));for(const p of periodsFor(selectedDay)){
    const value=drafts.get(group.id).weekly[`${selectedDay}_${p.id}`]||'maybe';
    const row=element('div',null,'week-row');const label=element('span',`${DAY_NAMES[selectedDay]}曜 ${p.name}　${formatTime(p.start)}〜${formatTime(p.end)}`);
    const b=button(marks[value],()=>mutate(()=>setWeekly(drafts.get(group.id),[selectedDay],[p.id],{maybe:'yes',yes:'no',no:'maybe'}[value],selectedDay===0||selectedDay===6),'曜日の回答を変更しました。日時指定の修正は維持しています。'),`simple-button ${value}`);
    b.dataset.weekday=selectedDay;b.dataset.period=p.id;b.setAttribute('aria-label',`${DAY_NAMES[selectedDay]}曜 ${p.name} ${marks[value]}`);row.append(label,b);q('.week-rows').append(row);
  }}
  const dates=dateList(current.startDate,current.endDate);
  q('.exception-date').min=current.startDate;q('.exception-date').max=current.endDate;q('.exception-date').value=current.startDate;
  q('.exception-add').onclick=()=>mutate(()=>{const minutes=value=>{if(!/^\d{2}:\d{2}$/.test(value))return NaN;const [h,m]=value.split(':').map(Number);return h*60+m;};addException(drafts.get(group.id),dates,{date:q('.exception-date').value,start:minutes(q('.exception-start').value),end:minutes(q('.exception-end').value),answer:q('.exception-value').value});},'指定した時間の回答を変更しました。');
  selectOptions(q('.review-date'),dates.map(date=>[date,`${date}（${DAY_NAMES[new Date(date+'T00:00:00Z').getUTCDay()]}）`]));
  function renderReview(){q('.review-rows').replaceChildren();for(const [range,value] of Object.entries(compressDay(drafts.get(group.id),q('.review-date').value))){const row=element('p',`${range}：${marks[value]}`);q('.review-rows').append(row);}}
  q('.review-date').onchange=renderReview;
  function refresh(){undoButton.disabled=!undo;renderWeek();renderReview();q('.exception-list').replaceChildren();drafts.get(group.id).exceptions.forEach((e,i)=>{const row=element('div',null,'exception-row');row.append(element('span',`${e.date} ${formatTime(e.start)}〜${formatTime(e.end)}：${marks[e.answer]}`),button('取消',()=>mutate(()=>drafts.get(group.id).exceptions.splice(i,1),'日時指定を取り消しました。')));q('.exception-list').append(row);});}
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
