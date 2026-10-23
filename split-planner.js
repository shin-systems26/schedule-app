// Pure planner: no Firebase access, no writes, and no reliance on display names as IDs.
export const slotKey = (date, hour) => `${date} ${String(hour).padStart(2, '0')}:00〜${String(hour + 1).padStart(2, '0')}:00`;
const count = mask => { let n = 0; while (mask) { mask &= mask - 1n; n++; } return n; };
const dateValue = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw Error('日付を指定してください。');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw Error('日付が正しくありません。');
  return time;
};
export function validateSettings(settings) {
  const s = { ...settings };
  const from = dateValue(s.startDate), to = dateValue(s.endDate);
  if (to < from || to - from > 365 * 86400000) throw Error('対象期間は開始日から366日以内にしてください。');
  for (const [key, min, max] of [['maxSessions', 1, 5], ['minParticipants', 1, 10000], ['duration', 1, 13], ['startHour', 9, 21], ['endHour', 10, 22], ['avoidStart', 0, 23], ['avoidEnd', 0, 24]]) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw Error('開催回数・人数・時間の設定を確認してください。');
  }
  if (s.endHour - s.startHour < s.duration) throw Error('対象時間帯が所要時間より短くなっています。');
  if (!['sessions', 'early', 'balanced'].includes(s.priority)) throw Error('優先条件を選択してください。');
  return s;
}
export function planSplit(responses, group, settings, { maxNodes = 250000, top = 5 } = {}) {
  const s = validateSettings(settings);
  const ids = responses.map(r => r.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw Error('回答IDを一意にしてください。');
  const organizer = s.organizerId ? responses.find(r => r.id === s.organizerId) : null;
  if (s.organizerId && !organizer) throw Error('主催者の回答を選び直してください。');
  if (s.requireOrganizer && !organizer) throw Error('主催者の回答を選択してください。主催者も参加者用リンクから予定を回答できます。');
  const people = responses.filter(r => r !== organizer).map(r => ({ id: r.id, name: r.name || '名前なし' }));
  const targets = responses.filter(r => r !== organizer);
  const all = (1n << BigInt(people.length)) - 1n;
  const available = (r, date, start) => {
    const answers = r.answers?.[group] || r[group] || {};
    return Array.from({ length: s.duration }, (_, i) => answers[slotKey(date, start + i)] === 'yes').every(Boolean);
  };
  const avoided = hour => !s.avoidEnabled ? false : s.avoidStart === s.avoidEnd ? true : s.avoidStart < s.avoidEnd ? hour >= s.avoidStart && hour < s.avoidEnd : hour >= s.avoidStart || hour < s.avoidEnd;
  const candidates = [];
  if (people.length) for (let time = dateValue(s.startDate); time <= dateValue(s.endDate); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    for (let start = s.startHour; start + s.duration <= s.endHour; start++) {
      let mask = 0n;
      targets.forEach((r, i) => { if (available(r, date, start)) mask |= 1n << BigInt(i); });
      const size = count(mask), host = organizer ? available(organizer, date, start) : null;
      if (size < s.minParticipants || (s.requireOrganizer && !host)) continue;
      const late = Array.from({ length: s.duration }, (_, i) => avoided(start + i)).filter(Boolean).length;
      candidates.push({ date, start, end: start + s.duration, mask, size, host, late });
    }
  }
  // High-coverage candidates first gives useful fallback results if the explicit search budget is reached.
  candidates.sort((a, b) => b.size - a.size || a.late - b.late || Number(b.host) - Number(a.host) || a.date.localeCompare(b.date) || a.start - b.start);
  const suffix = Array(candidates.length + 1).fill(0n);
  for (let i = candidates.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] | candidates[i].mask;
  const priorities = s.priority === 'early' ? ['late', 'sessions', 'hostMisses', 'imbalance'] : s.priority === 'balanced' ? ['imbalance', 'sessions', 'hostMisses', 'late'] : ['sessions', 'hostMisses', 'late', 'imbalance'];
  const compare = (a, b) => b.covered - a.covered || priorities.reduce((difference, key) => difference || a[key] - b[key], 0) || a.key.localeCompare(b.key);
  let nodes = 0, truncated = false;
  const best = [];
  function visit(next, chosen, mask, depth) {
    if (nodes >= maxNodes) { truncated = true; return; }
    nodes++;
    if (chosen.length === depth) {
      const sessions = [...chosen].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
      const plan = { sessions: sessions.length, covered: count(mask), mask, late: sessions.reduce((n, c) => n + c.late, 0), hostMisses: sessions.filter(c => c.host === false).length, imbalance: Math.max(...sessions.map(c => c.size)) - Math.min(...sessions.map(c => c.size)), key: sessions.map(c => `${c.date}-${String(c.start).padStart(2, '0')}`).join('|'), entries: sessions };
      best.push(plan); best.sort(compare); if (best.length > top) best.pop();
    }
    if (chosen.length >= depth) return;
    if (best.length === top && count(mask | suffix[next]) < best[best.length - 1].covered) return;
    for (let i = next; i < candidates.length; i++) {
      const c = candidates[i];
      // A person cannot attend overlapping sessions; no simultaneous or overlapping meetings.
      if (chosen.some(x => x.date === c.date && x.start < c.end && c.start < x.end)) continue;
      visit(i + 1, [...chosen, c], mask | c.mask, depth);
      if (truncated) break;
    }
  }
  if (people.length) for (let depth = 1; depth <= s.maxSessions; depth++) {
    visit(0, [], 0n, depth);
    if (truncated) break;
    // All higher session counts are worse once five complete plans exist in sessions-first mode.
    if (s.priority === 'sessions' && best.length === top && best.every(p => p.mask === all)) break;
  }
  return { people, candidateCount: candidates.length, nodes, truncated, plans: best.map(p => ({
    complete: p.mask === all, covered: p.covered, total: people.length, coverage: p.covered / people.length * 100,
    lateHours: p.late, imbalance: p.imbalance, hostMisses: p.hostMisses,
    uncovered: people.filter((_, i) => !(p.mask & (1n << BigInt(i)))),
    sessions: p.entries.map(c => ({ date: c.date, start: c.start, end: c.end, organizerAvailable: c.host, avoidedHours: c.late, participants: people.filter((_, i) => c.mask & (1n << BigInt(i))) }))
  })) };
}
