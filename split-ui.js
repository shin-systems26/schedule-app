import { eventGroups } from './groups.js';
import { validateSettings } from './split-planner.js';
const $ = id => document.getElementById(id);
const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
let worker = null, timeout = null, context = null;
function personLabel(person) {
  const name = person.name || '名前なし';
  return context?.responses.filter(r => (r.name || '名前なし') === name).length > 1 ? `${name}［回答ID: ${person.id}］` : name;
}
function stop() {
  worker?.terminate(); worker = null; clearTimeout(timeout);
  $('splitCalculate').disabled = false; $('splitCancel').hidden = true;
}
export function clearSplit() {
  stop(); context = null;
  $('splitSection').hidden = true;
  $('splitResults').replaceChildren(); $('splitGroup').replaceChildren(); $('splitOrganizer').replaceChildren();
  $('splitStatus').textContent = ''; $('splitSelection').textContent = '';
}
export function setupSplit(data, responses) {
  clearSplit(); context = { data, responses };
  $('splitForm').reset();
  for (const group of eventGroups(data)) $('splitGroup').add(new Option(group.title, group.id));
  $('splitOrganizer').add(new Option('指定なし（回答者全員を対象）', ''));
  for (const r of responses) $('splitOrganizer').add(new Option(personLabel(r), r.id));
  for (const id of ['splitStartDate', 'splitEndDate']) { $(id).min = data.startDate; $(id).max = data.endDate; }
  $('splitStartDate').value = data.startDate; $('splitEndDate').value = data.endDate;
  $('splitSection').hidden = false;
  if (responses.length) $('splitForm').requestSubmit();
  else $('splitStatus').textContent = '回答が集まると、ここに分割して開催する場合の提案を表示します。';
}
function render(result) {
  const area = $('splitResults'); area.replaceChildren();
  const caveat = result.truncated ? '探索上限に達したため暫定案です。最適性や最大参加人数は未保証です。期間や最大回数を絞って再計算してください。' : '指定条件内で候補を比較しました。';
  if (!result.people.length) { $('splitStatus').textContent = '対象となる回答者がいません。主催者以外の回答を集めてください。'; return; }
  $('splitStatus').textContent = `${result.candidateCount}件の開催候補から提案。${caveat}`;
  if (!result.plans.length) {
    area.append(text('p', '最低人数・主催者・時間帯の条件を満たす候補がありません。条件を緩めて再計算してください。'), text('p', `参加機会を確保できない人：${result.people.map(personLabel).join('、')}`)); return;
  }
  result.plans.forEach((plan, index) => {
    const card = text('article', ''); card.className = 'split-plan';
    card.append(text('h4', `${plan.complete ? 'おすすめ' : '代替'}プラン${index + 1}：${plan.sessions.length}回開催`));
    card.append(text('p', `${plan.total}人中${plan.covered}人が参加可能（参加機会確保率${Math.round(plan.coverage * 10) / 10}％）${plan.complete ? '・全員の参加機会を確保' : '・全員をカバーできていません'}`));
    plan.sessions.forEach((session, i) => {
      const block = text('div', '');
      block.append(text('h5', `練習${i + 1}：${session.date} ${String(session.start).padStart(2, '0')}:00〜${String(session.end).padStart(2, '0')}:00`));
      block.append(text('p', `参加可能（${session.participants.length}人）：${session.participants.map(personLabel).join('、')}`));
      block.append(text('p', session.organizerAvailable === null ? '主催者：未指定・参加可否は未確認' : `主催者：${session.organizerAvailable ? '参加可能' : '参加可能と確認できません'}`));
      if (session.avoidedHours) block.append(text('p', `避けたい時間帯を${session.avoidedHours}時間含みます。`));
      card.append(block);
    });
    if (plan.uncovered.length) card.append(text('p', `参加機会を確保できない人：${plan.uncovered.map(personLabel).join('、')}`));
    const button = text('button', 'このプランを選択'); button.type = 'button'; button.className = 'secondary'; button.setAttribute('aria-pressed', 'false');
    button.onclick = () => {
      area.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
      area.querySelectorAll('.split-plan').forEach(c => c.classList.remove('selected'));
      button.setAttribute('aria-pressed', 'true'); card.classList.add('selected');
      $('splitSelection').textContent = `プラン${index + 1}を選択しました（この画面内のみ）。参加者への日程連絡は主催者が行ってください。`;
    };
    card.append(button); area.append(card);
  });
}
$('splitCancel').onclick = () => { stop(); $('splitStatus').textContent = '計算を中止しました。'; };
$('splitForm').oninput = () => { stop(); $('splitResults').replaceChildren(); $('splitSelection').textContent = ''; $('splitStatus').textContent = '条件を変更しました。「組み合わせを提案」で再計算してください。'; };
$('splitForm').onsubmit = event => {
  event.preventDefault(); if (!context) return; stop();
  $('splitResults').replaceChildren(); $('splitSelection').textContent = '';
  try {
    const settings = validateSettings({
      startDate: $('splitStartDate').value, endDate: $('splitEndDate').value,
      maxSessions: Number($('splitMax').value), minParticipants: Number($('splitMin').value), duration: Number($('splitDuration').value),
      startHour: Number($('splitStartHour').value), endHour: Number($('splitEndHour').value),
      avoidStart: Number($('splitAvoidStart').value), avoidEnd: Number($('splitAvoidEnd').value), avoidEnabled: $('splitAvoid').checked,
      organizerId: $('splitOrganizer').value, requireOrganizer: $('splitRequire').checked, priority: $('splitPriority').value
    });
    if (settings.startDate < context.data.startDate || settings.endDate > context.data.endDate) throw Error('イベントの期間内を指定してください。');
    worker = new Worker(new URL('./split-worker.js', import.meta.url), { type: 'module' });
    $('splitCalculate').disabled = true; $('splitCancel').hidden = false;
    $('splitStatus').textContent = '候補の組み合わせを計算中…';
    const activeWorker = worker;
    worker.onmessage = ({ data }) => { if (worker !== activeWorker) return; stop(); if (data.error) $('splitStatus').textContent = data.error; else render(data.result); };
    worker.onerror = () => { if (worker !== activeWorker) return; stop(); $('splitStatus').textContent = '計算を実行できませんでした。ブラウザーを更新して再試行してください。'; };
    timeout = setTimeout(() => { stop(); $('splitStatus').textContent = '計算時間の上限（20秒）に達しました。対象期間や最大開催回数を減らしてください。'; }, 20000);
    worker.postMessage({ responses: context.responses, group: $('splitGroup').value, settings });
  } catch (error) { stop(); $('splitStatus').textContent = error.message; }
};
