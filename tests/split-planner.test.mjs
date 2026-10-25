import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSplit, slotKey } from '../split-planner.js';
const day = '2026-10-20';
const defaults = { startDate: day, endDate: day, maxSessions: 3, minParticipants: 1, duration: 1, startHour: 9, endHour: 22, avoidStart: 21, avoidEnd: 24, avoidEnabled: true, requireOrganizer: false, organizerId: '', priority: 'sessions' };
const person = (id, hours, name = id) => ({ id, name, answers: { group1: Object.fromEntries(hours.map(h => [slotKey(day, h), 'yes'])) } });
const plan = (people, options = {}, budget) => planSplit(people, 'group1', { ...defaults, ...options }, budget);

test('five participants covered by two sessions, host excluded from denominator', () => {
  const people = [person('host', [15, 17]), person('A', [15]), person('B', [15]), person('C', [17]), person('D', [17]), person('E', [17])];
  const before = structuredClone(people);
  const result = plan(people, { organizerId: 'host', requireOrganizer: true, minParticipants: 2 });
  const best = result.plans[0];
  assert.equal(best.complete, true); assert.equal(best.coverage, 100); assert.equal(best.total, 5); assert.equal(best.sessions.length, 2);
  assert.deepEqual(best.sessions.map(s => s.participants.length), [2, 3]); assert.deepEqual(people, before);
});
test('repeated attendance counts once; missing participant is named', () => {
  const best = plan([person('A', [9, 10]), person('B', [9]), person('C', [10]), person('D', [])], { minParticipants: 2 }).plans[0];
  assert.equal(best.covered, 3); assert.equal(best.coverage, 75); assert.equal(best.complete, false);
  assert.deepEqual(best.uncovered.map(p => p.id), ['D']);
});
test('unknown and no never count as yes, including missing response maps', () => {
  const a = person('A', []); a.answers.group1[slotKey(day, 9)] = 'maybe'; a.answers.group1[slotKey(day, 10)] = 'no';
  assert.equal(plan([a, { id: 'B', name: 'B' }]).plans.length, 0);
});
test('same names remain different participants identified by document IDs', () => {
  const p = plan([person('1', [9], '同名'), person('2', [10], '同名')]).plans[0];
  assert.equal(p.covered, 2); assert.equal(p.sessions.length, 2);
});
test('legacy top-level response maps work', () => {
  const p = person('A', [9]); p.group1 = p.answers.group1; delete p.answers;
  assert.equal(plan([p]).plans[0].complete, true);
});
test('minimum attendees excludes host and may yield no candidates', () => {
  assert.equal(plan([person('host', [9]), person('A', [9])], { organizerId: 'host', minParticipants: 2 }).candidateCount, 0);
});
test('host required filters all sessions, optional host remains explicitly unavailable', () => {
  const people = [person('host', [9]), person('A', [9]), person('B', [10])];
  const required = plan(people, { organizerId: 'host', requireOrganizer: true }).plans[0];
  assert.equal(required.covered, 1); assert.equal(required.sessions[0].organizerAvailable, true);
  const optional = plan(people, { organizerId: 'host' }).plans[0];
  assert.equal(optional.complete, true); assert.equal(optional.hostMisses, 1);
  assert.throws(() => plan(people, { requireOrganizer: true }), /主催者/);
});
test('host availability preferred between equal-session plans', () => {
  const p = plan([person('host', [10]), person('A', [9, 10])], { organizerId: 'host' }).plans[0];
  assert.equal(p.sessions[0].start, 10);
});
test('two-hour sessions require both hours and cannot overlap', () => {
  const people = [person('A', [9, 10]), person('B', [10, 11])];
  const p = plan(people, { duration: 2 }).plans[0];
  assert.equal(p.complete, false); assert.equal(p.sessions.length, 1);
  assert.equal(plan([person('A', [9, 11])], { duration: 2 }).candidateCount, 0);
});
test('late preference can outweigh session count when explicitly chosen', () => {
  const people = [person('A', [9, 21]), person('B', [10, 21])];
  assert.equal(plan(people).plans[0].sessions.length, 1);
  const early = plan(people, { priority: 'early' }).plans[0];
  assert.equal(early.sessions.length, 2); assert.equal(early.lateHours, 0);
});
test('avoid windows penalize any overlapping hour, support overnight, and can be disabled', () => {
  const people = [person('A', [20, 21])];
  assert.equal(plan(people, { duration: 2 }).plans[0].lateHours, 1);
  assert.equal(plan(people, { duration: 2, avoidStart: 21, avoidEnd: 6 }).plans[0].lateHours, 1);
  assert.equal(plan(people, { duration: 2, avoidEnabled: false }).plans[0].lateHours, 0);
});
test('balanced priority and count limits respected', () => {
  const people = [person('A', [9, 11]), person('B', [9, 11]), person('C', [9, 12]), person('D', [10, 12])];
  const p = plan(people, { maxSessions: 2, priority: 'balanced' }).plans[0];
  assert.equal(p.complete, true); assert.equal(p.imbalance, 0);
  assert.equal(plan(people, { maxSessions: 1 }).plans[0].covered, 3);
});
test('date/hour boundaries and empty input', () => {
  assert.equal(plan([]).plans.length, 0);
  assert.equal(plan([person('A', [9])], { startHour: 10 }).candidateCount, 0);
  assert.throws(() => plan([], { startDate: '2026-02-30' }), /日付/);
  assert.throws(() => plan([], { duration: 2, startHour: 21 }), /短く/);
  assert.throws(() => plan([], { maxSessions: 0 }), /設定/);
  assert.throws(() => plan([person('x', [9]), person('x', [10])]), /一意/);
});
test('more than 32 participants supported', () => {
  const p = plan(Array.from({ length: 65 }, (_, i) => person(String(i), [9 + i % 2]))).plans[0];
  assert.equal(p.covered, 65); assert.equal(p.complete, true);
});
test('bounded search discloses truncation and gives unique plans', () => {
  const result = plan([person('A', [9, 10, 11, 12]), person('B', [13, 14, 15])], {}, { maxNodes: 8 });
  assert.equal(result.truncated, true); assert.equal(result.nodes, 8);
  const keys = result.plans.map(p => p.sessions.map(s => s.start).join(','));
  assert.equal(new Set(keys).size, keys.length);
});
test('exhaustive small independent oracle: optimal coverage, count, late hours, balance', () => {
  let seed = 43;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 60; run++) {
    const people = Array.from({ length: 6 }, (_, i) => person(String(i), [9, 10, 11, 12, 13, 14].filter(() => random() > .6)));
    const sets = [9, 10, 11, 12, 13, 14].map(h => people.filter(p => p.answers.group1[slotKey(day, h)] === 'yes').map(p => p.id));
    const expected = [];
    for (let bits = 1; bits < 64; bits++) {
      const indices = sets.map((_, i) => i).filter(i => bits & (1 << i));
      if (indices.length > 3 || indices.some(i => !sets[i].length)) continue;
      const covered = new Set(indices.flatMap(i => sets[i])).size;
      const sizes = indices.map(i => sets[i].length);
      expected.push([-covered, indices.length, indices.filter(i => i + 9 >= 13).length, Math.max(...sizes) - Math.min(...sizes)]);
    }
    expected.sort((a, b) => a.reduce((d, n, i) => d || n - b[i], 0));
    const result = plan(people, { endHour: 15, avoidStart: 13 });
    assert.equal(result.truncated, false);
    if (!expected.length) assert.equal(result.plans.length, 0);
    else { const best = result.plans[0]; assert.deepEqual([-best.covered, best.sessions.length, best.lateHours, best.imbalance], expected[0]); }
  }
});
test('date filtering and stable chronological tie break', () => {
  const a = person('A', [9, 10]);
  a.answers.group1[slotKey('2026-10-21', 9)] = 'yes';
  assert.equal(plan([a]).plans[0].sessions[0].start, 9);
  const result = plan([a], { startDate: '2026-10-21', endDate: '2026-10-21' });
  assert.equal(result.candidateCount, 1); assert.equal(result.plans[0].sessions[0].date, '2026-10-21');
});
test('whole duration required for host, missing selected host rejected', () => {
  assert.equal(plan([person('host', [9]), person('A', [9, 10])], { duration: 2, organizerId: 'host', requireOrganizer: true }).candidateCount, 0);
  assert.throws(() => plan([person('A', [9])], { organizerId: 'missing' }), /選び直して/);
});

test('no confirmed availability explains why 100 percent is impossible', () => {
  const a=person('A',[9]), b=person('B',[]); b.answers.group1[slotKey(day,9)]='maybe';
  const result=plan([a,b]);
  assert.deepEqual(result.noConfirmedAvailability.map(p=>p.id),['B']);
  assert.equal(result.plans[0].coverage,50);
  const tentative=plan([a,b],{includeMaybe:true}).plans[0];
  assert.equal(tentative.coverage,100); assert.equal(tentative.confirmedCovered,1);
  assert.deepEqual(tentative.sessions[0].needsConfirmation.map(p=>p.id),['B']);
});
test('tentative search excludes no and missing and checks every hour', () => {
  const a=person('A',[9,10]), b=person('B',[9]), c=person('C',[]), d={id:'D'};
  b.answers.group1[slotKey(day,10)]='maybe';c.answers.group1[slotKey(day,9)]='maybe';c.answers.group1[slotKey(day,10)]='no';
  const result=plan([a,b,c,d],{includeMaybe:true,duration:2}).plans[0];
  assert.equal(result.covered,2); assert.equal(result.confirmedCovered,1);
  assert.deepEqual(result.uncovered.map(p=>p.id),['C','D']);
});
test('tentative host requirement still requires yes and preserves source answers', () => {
  const people=[person('host',[]),person('A',[9])]; people[0].answers.group1[slotKey(day,9)]='maybe';
  const original=structuredClone(people);
  assert.equal(plan(people,{organizerId:'host',requireOrganizer:true,includeMaybe:true}).plans.length,0);
  assert.deepEqual(people,original);
});
test('five people can have a conditional 100 percent plan but only 80 percent confirmed', () => {
  const people=[person('A',[12]),person('B',[18]),person('C',[]),person('D',[12]),person('E',[18])];
  people[2].answers.group1[slotKey(day,12)]='maybe';people[2].answers.group1[slotKey(day,18)]='maybe';
  const result=plan(people,{includeMaybe:true,minParticipants:2,maxSessions:2}).plans[0];
  assert.equal(result.coverage,100);assert.equal(result.confirmedCovered,4);assert.equal(result.sessions.length,2);
  assert.equal(plan(people,{minParticipants:2,maxSessions:3}).plans[0].coverage,80);
});

test('half-hour sessions include legacy half-hour starts and require full availability', () => {
 const people=[person('A',[9]),person('B',[9])];
 const result=plan(people,{duration:0.5,minParticipants:2,maxSessions:2});
 assert.ok(result.plans.some(p=>p.sessions.some(s=>s.start===9.5 && s.end===10)));
 const fine=[{id:'A',answers:{group1:{[`${day} 09:00〜09:30`]:'yes'}}},{id:'B',answers:{group1:{[`${day} 09:00〜09:30`]:'yes'}}}];
 assert.equal(plan(fine,{duration:0.5,minParticipants:2,maxSessions:2}).plans[0].complete,true);
 assert.equal(plan(fine,{duration:1,minParticipants:2,maxSessions:2}).plans.length,0);
});
