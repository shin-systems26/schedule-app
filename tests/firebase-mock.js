
const f = window.fixture;
export const db = {}, provider = {}, auth = { currentUser: f.user };
export function onAuthStateChanged(a, callback) { window.authCallback = callback; queueMicrotask(() => callback(a.currentUser)); }
export async function signInWithPopup() { if (window.fixture.loginError) throw { code: window.fixture.loginError };  auth.currentUser = { uid: 'owner', displayName: 'テスト管理者' }; window.authCallback(auth.currentUser); }
export async function signOut() { auth.currentUser = null; window.authCallback(null); }
export const collection = (db, ...parts) => parts.join('/');
export const doc = (db, ...parts) => parts.join('/');
export const where = (field, op, value) => ({ field, op, value });
export const limit = count => ({ count });
export const query = (ref, ...filters) => ({ ref, filters });
export const serverTimestamp = () => null;
function snapshot(id, data, ref) { return { id, ref, data: () => data, exists: () => !!data }; }
export async function getDoc(ref) { const id = ref.split('/')[1]; return snapshot(id, f.events[id], ref); }
export async function getDocs(input) {
  const ref = typeof input === 'string' ? input : input.ref;
  f.reads.push(input);
  let docs;
  if (ref === 'events') {
    const owner = input.filters.find(filter => filter.field === 'ownerId')?.value;
    if (!owner) throw Error('Owner filter missing');
    docs = Object.entries(f.events).filter(([,data]) => data.ownerId === owner).map(([id,data]) => snapshot(id,data,'events/'+id));
  } else {
    const id = ref.split('/')[1];
    if (f.events[id]?.ownerId !== auth.currentUser?.uid) throw Error('Forbidden');
    docs = (f.responses[id] || []).map((data,index) => snapshot(String(index),data,ref+'/'+index));
    const count = input.filters?.find(filter => filter.count)?.count;
    if (count) docs = docs.slice(0,count);
  }
  return { docs, empty: !docs.length };
}
export async function addDoc(ref, data) {
  if (ref === 'events') { f.events.created = data; f.writes.push({ ref, data }); return { id: 'created' }; }
  const id = ref.split('/')[1];
  if (f.events[id].isOpen === false) throw Error('Closed');
  (f.responses[id] ||= []).push(data); f.writes.push({ ref, data }); return { id: 'response' };
}
export async function updateDoc(ref, data) { if (f.failUpdate) throw Error('Update failed'); Object.assign(f.events[ref.split('/')[1]],data); f.writes.push({ ref, data }); }
export async function deleteDoc(ref) { delete f.events[ref.split('/')[1]]; f.writes.push({ deleted: ref }); }
export function writeBatch() { const refs = []; return { delete(ref) { refs.push(ref); }, async commit() {
  if (refs.length > 500) throw Error('Batch too large');
  f.batches.push(refs.length);
  for (const id of new Set(refs.map(ref => ref.split('/')[1]))) f.responses[id].splice(0,refs.filter(ref => ref.split('/')[1] === id).length);
} }; }
