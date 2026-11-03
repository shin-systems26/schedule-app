// Shared interval reader. Old hourly answers and new compact intervals use the same answers map.
export const formatTime = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const rangeKey = (date, start, end) => `${date} ${formatTime(start)}〜${formatTime(end)}`;
export function parseRange(key) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})〜(\d{2}):(\d{2})$/.exec(key);
  if (!m) return null;
  if (!validDate(m[1])) return null;
  const start = Number(m[2]) * 60 + Number(m[3]), end = Number(m[4]) * 60 + Number(m[5]);
  if (+m[3] >= 60 || +m[5] >= 60 || start < 0 || end > 1440 || start >= end || start % 10 || end % 10) return null;
  return { date: m[1], start, end };
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function dateList(start, end) {
  if (!validDate(start)||!validDate(end)) throw Error('日付が正しくありません。');
  const from = Date.parse(start + 'T00:00:00Z'), to = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 365 * 86400000) throw Error('対象期間は366日以内にしてください。');
  return Array.from({length: (to - from) / 86400000 + 1}, (_, i) => new Date(from + i * 86400000).toISOString().slice(0, 10));
}
const cache = new WeakMap();
export function readInterval(answers, date, start, end) {
  if (!answers || typeof answers !== 'object') return undefined;
  let days = cache.get(answers);
  if (!days) {
    days = new Map();
    for (const [key, value] of Object.entries(answers)) {
      const range = parseRange(key);
      if (!range || !['yes','no','maybe'].includes(value)) continue;
      if (!days.has(range.date)) days.set(range.date, new Map());
      const times = days.get(range.date);
      for (let minute = range.start; minute < range.end; minute += 10) {
        const previous = times.get(minute);
        times.set(minute, previous === 'no' || value === 'no' ? 'no' : previous === 'maybe' || value === 'maybe' ? 'maybe' : value);
      }
    }
    cache.set(answers, days);
  }
  const values = [];
  for (let minute = start; minute < end; minute += 10) values.push(days.get(date)?.get(minute));
  if (values.includes('no')) return 'no';
  if (!values.length || values.includes(undefined)) return undefined;
  return values.every(value => value === 'yes') ? 'yes' : 'maybe';
}
export const groupAnswers = (response, group) => response.answers?.[group] || response[group] || {};
export function fineResolution(responses, group) {
  return responses.some(response => Object.keys(groupAnswers(response, group)).some(key => {
    const r = parseRange(key); return r && (r.start % 60 || r.end % 60 || r.end-r.start !== 60 || r.start < 540);
  }));
}
// Preserve older 10-minute answers; modern half-hour and hourly data use a half-hour grid.
export function answerStep(responses, group) {
  return responses.some(r=>Object.entries(groupAnswers(r,group)).some(([key,value])=>{
    const range=parseRange(key);return range && ['yes','no','maybe'].includes(value) && (range.start%30 || range.end%30);
  }))?10:30;
}
export function candidateSlots(startDate, endDate, fine = false, durationMinutes = 60) {
  if (![30,60].includes(durationMinutes)) throw Error('開催時間は30分または1時間を指定してください。');
  const step=typeof fine==='number'?fine:fine?10:durationMinutes;
  if (![10,30,60].includes(step)) throw Error('時間刻みが正しくありません。');
  return dateList(startDate, endDate).flatMap(date => {
    const slots = []; for (let minute = fine ? 480 : 540; minute + durationMinutes <= 1320; minute += step) slots.push(rangeKey(date, minute, minute + durationMinutes)); return slots;
  });
}
