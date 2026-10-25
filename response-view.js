import { parseRange, readInterval, rangeKey, fineResolution } from './time-data.js?v=timetable-1';
import { eventGroups } from './groups.js';
import { makeSlots } from './ranking.js';

const $ = id => document.getElementById(id);
let current = null;
const labels = { yes: '○', no: '×', maybe: '？' };
const descriptions = { yes: '参加できそう', no: '参加不可', maybe: 'まだ分からない' };
const answersFor = (response, group) => response.answers?.[group] || response[group] || {};
function option(value, text) { const item = document.createElement('option'); item.value = value; item.textContent = text; return item; }
function cell(tag, text) { const item = document.createElement(tag); item.textContent = text; return item; }

export function clearResponseView() {
  current = null;
  $('answerOverview').hidden = true;
  for (const id of ['answerGroup', 'answerDate', 'answerPerson', 'answerTable', 'answerCount']) $(id).replaceChildren();
}
export function setupResponseView(event, responses) {
  clearResponseView();
  current = { responses, slots: makeSlots(event.startDate, event.endDate) };
  $('answerGroup').replaceChildren(...eventGroups(event).map(group => option(group.id, group.title)));
  $('answerPerson').append(option('', '全員を表示'), ...responses.map((response, index) => option(String(index), `${index + 1}. ${response.name || '名前なし'}`)));
  $('answerOverview').hidden = false;
  updateDates();
}
function updateDates() {
  if (!current) return;
  const previous = $('answerDate').value;
  // Include stored dates even if they fall outside the current event period.
  const group = $('answerGroup').value;
  const ranges = [...current.slots, ...current.responses.flatMap(response => Object.keys(answersFor(response, group)))].map(parseRange).filter(Boolean);
  const boundaries = new Map(), fine = fineResolution(current.responses, group);
  for (const r of ranges) { if (!boundaries.has(r.date)) boundaries.set(r.date, new Set([fine ? 480 : 540, 1320])); boundaries.get(r.date).add(r.start).add(r.end); }
  current.groupSlots = [...boundaries].sort(([a],[b])=>a.localeCompare(b)).flatMap(([date, edges])=>{const sorted=[...edges].sort((a,b)=>a-b);return sorted.slice(1).map((end,i)=>rangeKey(date,sorted[i],end));});
  const dates = [...new Set(current.groupSlots.map(slot => slot.split(' ')[0]))];
  $('answerDate').replaceChildren(...dates.map(date => option(date, date)));
  if (dates.includes(previous)) $('answerDate').value = previous;
  render();
}
function render() {
  if (!current) return;
  const group = $('answerGroup').value, date = $('answerDate').value, person = $('answerPerson').value;
  const people = current.responses.map((response, index) => ({ response, index })).filter(item => person === '' || String(item.index) === person);
  const area = $('answerTable'); area.replaceChildren();
  $('answerCount').textContent = current.responses.length ? `${current.responses.length}人中${people.length}人を表示・${date}` : 'まだ回答がありません。';
  if (!people.length) return;
  const table = document.createElement('table');
  const caption = cell('caption', `${$('answerGroup').selectedOptions[0]?.textContent || ''}：${date}の回答`);
  const head = document.createElement('thead'), header = document.createElement('tr');
  const time = cell('th', '日時'); time.scope = 'col'; header.append(time);
  for (const {response, index} of people) { const name = cell('th', `${index + 1}. ${response.name || '名前なし'}`); name.scope = 'col'; header.append(name); }
  head.append(header);
  const body = document.createElement('tbody');
  for (const slot of current.groupSlots.filter(slot => slot.split(' ')[0] === date)) {
    const row = document.createElement('tr'), title = cell('th', slot); title.scope = 'row'; row.append(title);
    for (const {response} of people) {
      const data = answersFor(response, group), range = parseRange(slot), value = readInterval(data, range.date, range.start, range.end);
      const known = Object.hasOwn(labels, value);
      const text = known ? labels[value] : value == null ? '—' : '不明';
      const td = cell('td', text);
      td.className = known ? `answer-${value}` : 'answer-empty';
      td.setAttribute('aria-label', known ? descriptions[value] : value == null ? '未回答（保存なし）' : '未対応の回答');
      td.title = td.getAttribute('aria-label'); row.append(td);
    }
    body.append(row);
  }
  table.append(caption, head, body); area.append(table);
}
$('answerGroup').addEventListener('change', updateDates);
$('answerDate').addEventListener('change', render);
$('answerPerson').addEventListener('change', render);
for (const [id, offset] of [['answerPrevious', -1], ['answerNext', 1]]) {
  $(id).addEventListener('click', () => {
    const select = $('answerDate'), next = select.selectedIndex + offset;
    if (next >= 0 && next < select.options.length) { select.selectedIndex = next; render(); }
  });
}
