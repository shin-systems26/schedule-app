import { eventGroups } from './groups.js?v=practice-6';
import { formatTime, validDate } from './time-data.js?v=audit-1';
let section, worker, timer;
const el=(tag,value='')=>{const e=document.createElement(tag);e.textContent=value;return e;};
export function clearPractice(){worker?.terminate();worker=null;clearTimeout(timer);section?.remove();section=null;}
export function setupPractice(data,responses){
  clearPractice();
  section=el('section');section.id='practiceSection';
  section.append(el('h3','おすすめ練習日程をまとめて探す'),el('p','対面を優先：平日19:00までに開始・1時間・各回2人以上・最大2回（同じ日は終了から次の開始まで2時間以上）。オンラインは土日・夜も含め22:00までに終了する1時間。主催者の予定は計算せず、最後にご自身で確認してください。'));
  const form=el('form'),groups=eventGroups(data),selectors={};
  // Handle validation visibly instead of letting native date validation suppress submit.
  form.noValidate=true;
  for(const [key,label,pattern] of [['environmentGroup','環境人間キャンパスの回答項目',/環境|人間/],['engineeringGroup','工学キャンパスの回答項目',/工学/],['onlineGroup','オンラインの回答項目',/オンライン/]]){
    const l=el('label',label),select=el('select');select.id='practice-'+key;select.add(new Option('回答項目を選択',''));
    groups.forEach(g=>select.add(new Option(g.title,g.id)));select.value=groups.find(g=>pattern.test(g.title))?.id||'';l.append(select);form.append(l);selectors[key]=select;
    if(select.value){l.hidden=true;}
    else {l.append(el('small','既存イベントの回答項目を対応付けてください。'));}
  }
  const labelPerson=p=>responses.filter(r=>r.name===p.name).length>1?`${p.name}［${p.id}］`:p.name;
  const makeRequired=(id,title)=>{
    const field=el('fieldset');field.id=id;field.append(el('legend',title));
    responses.forEach(r=>{const label=el('label',labelPerson(r)||'名前なし'),input=el('input');input.type='checkbox';input.value=r.id;label.prepend(input);field.append(label);});form.append(field);return field;
  };
  const required=makeRequired('practiceEngineeringRequired','工学キャンパスで参加必須の人（複数選択）');
  const environmentRequired=makeRequired('practiceEnvironmentRequired','環境人間キャンパスで参加必須の人（複数選択・指定なしも可）');
  form.append(el('p','必須メンバーは、そのキャンパスで開催する各回の全時間帯で○が必要です。オンラインには適用しません。'));
  const maybe=el('input');maybe.type='checkbox';const ml=el('label','？も含めた確認用の案を探す（各キャンパスの必須メンバーは○が必要）');ml.prepend(maybe);form.append(ml);
  const makeDates=(label,inputId,listId,addLabel)=>{
  const excludedDates=new Set(), dateLabel=el('label',label), dateInput=el('input');
  dateInput.type='date';dateInput.min=data.startDate;dateInput.max=data.endDate;dateInput.id=inputId;dateLabel.append(dateInput);
  const addDate=el('button',addLabel);addDate.type='button';
  const dateList=el('div');dateList.id=listId;
  form.append(dateLabel,addDate,dateList,el('p','追加した日はこの形式のみ除外します。日付を入力して直接検索しても除外に反映します。追加・解除後は再検索してください。設定はこの画面内だけで有効です。'));
  const renderDates=()=>{dateList.replaceChildren();for(const date of [...excludedDates].sort()){
    const row=el('div',date+' '),remove=el('button','除外を解除');remove.type='button';remove.setAttribute('aria-label',label+'：'+date+'の除外を解除');
    remove.onclick=()=>{excludedDates.delete(date);renderDates();form.dispatchEvent(new Event('input'));};row.append(remove);dateList.append(row);
  }};
  const applyDate=(required=false)=>{
    const date=dateInput.value;
    if(!date&&!dateInput.validity.badInput&&!required)return true;
    if(!validDate(date)||!dateInput.validity.valid||date<data.startDate||date>data.endDate){
      status.textContent=`${label}の除外日は ${data.startDate} 〜 ${data.endDate} の範囲で、年・月・日をすべて入力してください。`;
      dateInput.setAttribute('aria-invalid','true');return false;
    }
    excludedDates.add(date);dateInput.value='';dateInput.removeAttribute('aria-invalid');renderDates();return true;
  };
  addDate.onclick=()=>{stop();results.replaceChildren();if(applyDate(true))status.textContent='除外日を追加しました。もう一度検索してください。';};
  dateInput.setAttribute('aria-describedby','practiceStatus');
  return {dates:excludedDates,applyDate};
  };
  const faceDates=makeDates('主催者が対面に参加できない日','practiceExcludedDate','practiceExcludedDates','除外日を追加');
  const onlineDates=makeDates('主催者がオンラインに参加できない日','practiceOnlineExcludedDate','practiceOnlineExcludedDates','オンラインの除外日を追加');
  const button=el('button','おすすめ練習日程を探す');button.type='submit';form.append(button);
  const status=el('p');status.id='practiceStatus';status.setAttribute('role','status');const results=el('div');
  section.append(form,status,results);document.getElementById('rankingArea').after(section);
  const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);button.disabled=false;};
  form.oninput=()=>{stop();results.replaceChildren();status.textContent='条件を変更しました。もう一度検索してください。';};
  form.onsubmit=event=>{
    event.preventDefault();stop();results.replaceChildren();
    if(!faceDates.applyDate()||!onlineDates.applyDate())return;
    if(!responses.length){status.textContent='回答が集まってから検索できます。';return;}
    const settings={startDate:data.startDate,endDate:data.endDate,requiredIds:[...required.querySelectorAll('input:checked')].map(i=>i.value),environmentRequiredIds:[...environmentRequired.querySelectorAll('input:checked')].map(i=>i.value),includeMaybe:maybe.checked,excludedDates:[...faceDates.dates],onlineExcludedDates:[...onlineDates.dates]};
    Object.entries(selectors).forEach(([key,s])=>settings[key]=s.value);
    try {
    worker=new Worker(new URL('./practice-worker.js?v=practice-6',import.meta.url),{type:'module'});const active=worker;
    button.disabled=true;status.textContent='対面とオンラインの候補を比較しています…';
    worker.onmessage=({data:message})=>{
      if(worker!==active)return;stop();if(message.error){status.textContent=message.error;return;}
      const r=message.result;status.textContent=r.truncated?'対面は探索上限に達したため暫定案です。100％の案がないとは断定できません。':'指定条件内の候補を比較しました。';
      if(r.includeMaybe)results.append(el('p','確認用の案です。？の人の参加が確認できるまで確定ではありません。'));
      for(const [title,plans,empty] of [['対面のおすすめ（優先）',r.face,'対面の条件を満たす候補がありません。'],['オンラインで全員参加する案',r.online,'オンライン1回で全員を含む候補はありません。']]){
        results.append(el('h4',title));if(!plans.length)results.append(el('p',empty));
        plans.forEach((p,i)=>{
          const card=el('article');card.className='split-plan';card.append(el('h5',`プラン${i+1}：${p.sessions.length}回・${p.covered}／${p.total}人${r.includeMaybe?'（確認後の見込み）':''}`));
          if(r.includeMaybe)card.append(el('p',`○のみで確保：${p.confirmedCovered}／${p.total}人`));
          p.sessions.forEach(s=>{card.append(el('p',`${s.date} ${formatTime(s.start)}〜${formatTime(s.end)}・${s.location}`),el('p',`参加${r.includeMaybe?'候補':'可能'}：${s.participants.map(labelPerson).join('、')}`));if(s.needsConfirmation.length)card.append(el('p',`？を確認する人：${s.needsConfirmation.map(labelPerson).join('、')}`));});
          if(p.uncovered.length)card.append(el('p',`参加機会を確保できない人：${p.uncovered.map(labelPerson).join('、')}`));
          results.append(card);
        });
      }
      results.append(el('p','提案は保存・自動通知されません。主催者の予定を確認してから参加者に連絡してください。'));
    };
    worker.onerror=()=>{if(worker!==active)return;stop();status.textContent='計算できませんでした。ページを更新して再試行してください。';};
    timer=setTimeout(()=>{stop();status.textContent='計算時間の上限に達しました。';},20000);worker.postMessage({responses,settings});
    } catch(error) {stop();status.textContent='計算を開始できませんでした。ページを更新して再試行してください。';}
  };
}
