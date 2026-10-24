import { setupResponseView, clearResponseView } from './response-view.js';
import { setupSplit, clearSplit } from './split-ui.js?v=conditional-1';
import { db, auth, provider } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, where, limit, addDoc, serverTimestamp, updateDoc, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { makeSlots, calculateRanking, renderRanking } from './ranking.js';
import { eventGroups } from './groups.js';

const $ = id => document.getElementById(id);
let currentUser = null;
let selected = null;
let authVersion = 0;
let detailVersion = 0;
let listVersion = 0;
let mutationBusy = false;
let createBusy = false;
const participantLink = id => {
  const url = new URL('./respond.html', location.href);
  url.searchParams.set('event', id);
  return url.href;
};
function report(id, message, error) {
  if ($(id)) $(id).textContent = message;
  if (error) console.error(error);
}
function detailButtons(disabled) {
  for (const id of ['toggleOpenButton', 'deleteEventButton', 'refreshResponses']) $(id).disabled = disabled;
}
function clearDetail() {
  clearSplit();
  clearResponseView();
  detailVersion++;
  selected = null;
  $('management').hidden = true;
  $('rankingArea').replaceChildren();
  $('responseNames').replaceChildren();
  $('copyStatus').textContent = '';
  detailButtons(true);
}
function renderOpen() {
  const open = selected.data.isOpen !== false;
  $('openStatus').textContent = open ? '回答受付中' : '締切済み';
  $('toggleOpenButton').textContent = open ? '回答を締め切る' : '回答受付を再開する';
}
async function copyLink(id, statusId) {
  const url = participantLink(id);
  try {
    await navigator.clipboard.writeText(url);
    report(statusId, '参加者用リンクをコピーしました。');
  } catch {
    report(statusId, `コピーできませんでした。このリンクを選択してコピーしてください：${url}`);
    if (selected?.id === id) { $('participantUrl').focus(); $('participantUrl').select(); }
  }
}
async function loadEvents() {
  if (!currentUser) return;
  const version = ++listVersion;
  const session = authVersion;
  $('eventList').replaceChildren();
  report('listStatus', 'イベントを読み込み中…');
  try {
    // Owner filter is required by owner-only Firestore list rules. No composite index.
    const snapshot = await getDocs(query(collection(db, 'events'), where('ownerId', '==', currentUser.uid)));
    if (version !== listVersion || session !== authVersion) return;
    const events = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    events.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    report('listStatus', events.length ? `${events.length}件のイベント` : 'まだイベントはありません。最初のイベントを作成しましょう。');
    for (const event of events) {
      const item = document.createElement('article');
      item.className = 'event-item';
      const title = document.createElement('h3'); title.textContent = event.title;
      const info = document.createElement('p'); info.textContent = `${event.startDate} 〜 ${event.endDate} ・ ${event.isOpen === false ? '締切済み' : '受付中'}`;
      const actions = document.createElement('div'); actions.className = 'toolbar';
      const manage = document.createElement('a'); manage.className = 'button secondary'; manage.textContent = '管理する'; manage.href = '#manage=' + encodeURIComponent(event.id);
      const copy = document.createElement('button'); copy.className = 'secondary'; copy.textContent = '参加者リンクをコピー';
      const copyStatus = document.createElement('p'); copyStatus.id = `copy-${event.id}`; copyStatus.setAttribute('role', 'status');
      const link = document.createElement('a'); link.href = participantLink(event.id); link.textContent = '回答画面を開く'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      copy.onclick = () => copyLink(event.id, copyStatus.id);
      actions.append(manage, copy, link); item.append(title, info, actions, copyStatus); $('eventList').append(item);
    }
  } catch (error) {
    if (version === listVersion && session === authVersion) report('listStatus', 'イベントを読み込めませんでした。「更新」で再試行してください。', error);
  }
}
async function openEvent(id) {
  clearDetail();
  if (!currentUser) return;
  const version = detailVersion;
  const session = authVersion;
  const user = currentUser;
  const active = () => version === detailVersion && session === authVersion;
  $('management').hidden = false;
  $('eventTitle').textContent = 'イベントを読み込み中…';
  $('eventPeriod').textContent = '';
  $('openStatus').textContent = '';
  $('participantUrl').value = participantLink(id);
  $('openResponse').href = participantLink(id);
  report('manageStatus', '');
  try {
    const ref = doc(db, 'events', id);
    const snapshot = await getDoc(ref);
    if (!active()) return;
    if (!snapshot.exists()) throw new Error('イベントが見つかりません。削除済みの可能性があります。');
    const data = snapshot.data();
    if (data.ownerId !== user.uid) throw new Error('このイベントを管理する権限がありません。');
    selected = { id, data, ref };
    $('eventTitle').textContent = data.title;
    $('eventPeriod').textContent = `${data.startDate} 〜 ${data.endDate}`;
    renderOpen();
    detailButtons(mutationBusy);
    $('eventTitle').focus();
    report('manageStatus', '回答を読み込み中…');
    const responsesSnapshot = await getDocs(collection(db, 'events', id, 'responses'));
    if (!active()) return;
    const responses = responsesSnapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    report('manageStatus', `回答者数：${responses.length}人`);
    for (const response of responses) {
      const name = document.createElement('p'); name.textContent = response.name || '名前なし'; $('responseNames').append(name);
    }
    setupResponseView(data, responses);
    setupSplit(data, responses);
    const slots = makeSlots(data.startDate, data.endDate);
    for (const [index, group] of eventGroups(data).entries()) {
      renderRanking($('rankingArea'), `${index + 1}. ${group.title}`, calculateRanking(responses, group.id, slots), responses.length);
    }
  } catch (error) {
    if (active()) {
      if (!selected) $('eventTitle').textContent = '管理画面を開けませんでした';
      report('manageStatus', error.code ? 'データを読み込めませんでした。権限や接続を確認して再試行してください。' : error.message, error);
    }
  }
}
function route() {
  if (!currentUser) return;
  if (location.hash.startsWith('#manage=')) {
    try {
      const id = decodeURIComponent(location.hash.slice(8));
      if (id && !id.includes('/')) { openEvent(id); return; }
    } catch { /* Invalid bookmark: return to dashboard. */ }
  }
  clearDetail();
  if (location.hash === '#create') $('title').focus();
}

$('loginButton').onclick = async () => {
  $('loginButton').disabled = true;
  report('appStatus', 'ログイン中…');
  try { await signInWithPopup(auth, provider); }
  catch (error) {
    const messages = {
      'auth/unauthorized-domain': 'このアドレスからのログインが許可されていません。管理者はFirebase Authenticationの承認済みドメインに ' + location.hostname + ' を追加してください。',
      'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザーで許可して再試行してください。',
      'auth/popup-closed-by-user': 'ログインをキャンセルしました。もう一度ログインできます。',
      'auth/cancelled-popup-request': '別のログイン操作が進行中です。開いているログイン画面を確認してください。',
      'auth/network-request-failed': '通信できませんでした。インターネット接続を確認して再試行してください。',
      'auth/operation-not-allowed': 'Googleログインが有効になっていません。管理者はFirebase Authenticationのログイン方法を確認してください。',
    };
    report('appStatus', messages[error.code] || 'ログインできませんでした。時間をおいて再試行してください。解決しない場合は管理者に連絡してください。', error);
  }
  finally { $('loginButton').disabled = false; }
};
$('logoutButton').onclick = async () => {
  try { await signOut(auth); }
  catch (error) { report('appStatus', 'ログアウトできませんでした。再試行してください。', error); }
};
$('refreshEvents').onclick = loadEvents;
$('refreshResponses').onclick = () => { if (selected && !mutationBusy) openEvent(selected.id); };
$('copyUrlButton').onclick = () => { if (selected) copyLink(selected.id, 'copyStatus'); };
window.addEventListener('hashchange', route);

$('createForm').onsubmit = async event => {
  event.preventDefault();
  if (!currentUser || createBusy) return;
  const title = $('title').value.trim();
  const startDate = $('startDate').value;
  const endDate = $('endDate').value;
  const titles = $('questions').value.split('\n').map(text => text.trim()).filter(Boolean);
  if (!title || !startDate || !endDate || !titles.length) { report('createStatus', 'イベント名・期間・回答項目を入力してください。'); return; }
  if (endDate < startDate) { report('createStatus', '終了日は開始日以降にしてください。'); return; }
  const session = authVersion;
  createBusy = true;
  $('createButton').disabled = true;
  report('createStatus', 'イベントを作成中…');
  try {
    const ref = await addDoc(collection(db, 'events'), {
      title, startDate, endDate, ownerId: currentUser.uid, isOpen: true,
      groups: titles.map((title, index) => ({ id: `group${index + 1}`, title })),
      createdAt: serverTimestamp()
    });
    if (session !== authVersion) return;
    $('createForm').reset();
    report('createStatus', '作成しました。参加者用リンクをコピーして共有してください。');
    loadEvents();
    location.hash = 'manage=' + encodeURIComponent(ref.id);
  } catch (error) {
    if (session === authVersion) report('createStatus', '作成できませんでした。入力内容と接続を確認してください。', error);
  } finally { createBusy = false; $('createButton').disabled = !currentUser; }
};

$('toggleOpenButton').onclick = async () => {
  if (!selected || mutationBusy) return;
  const target = selected;
  mutationBusy = true; detailButtons(true);
  try {
    const isOpen = target.data.isOpen === false;
    await updateDoc(target.ref, { isOpen });
    if (selected === target) { target.data.isOpen = isOpen; renderOpen(); report('manageStatus', isOpen ? '回答受付を再開しました。' : '回答を締め切りました。'); }
    loadEvents();
  } catch (error) {
    if (selected === target) report('manageStatus', '受付状態を変更できませんでした。再試行してください。', error);
  } finally { mutationBusy = false; detailButtons(!selected); }
};
$('deleteEventButton').onclick = async () => {
  if (!selected || mutationBusy) return;
  const target = selected;
  if (!window.confirm(`「${target.data.title}」と全回答を完全に削除します。\nこの操作は元に戻せません。削除しますか？`)) return;
  mutationBusy = true; detailButtons(true);
  report('manageStatus', 'イベントと回答を削除中…');
  try {
    // Close first to prevent new responses; keep parent until all child deletes finish.
    await updateDoc(target.ref, { isOpen: false });
    if (selected === target) { target.data.isOpen = false; renderOpen(); }
    while (true) {
      const snapshot = await getDocs(query(collection(db, 'events', target.id, 'responses'), limit(400)));
      if (snapshot.empty) break;
      const batch = writeBatch(db);
      snapshot.docs.forEach(response => batch.delete(response.ref));
      await batch.commit();
    }
    await deleteDoc(target.ref);
    if (selected === target) { clearDetail(); location.hash = 'events'; }
    if (currentUser) { report('appStatus', 'イベントと回答を削除しました。'); loadEvents(); }
  } catch (error) {
    if (selected === target) report('manageStatus', '削除を完了できませんでした。一部の回答が削除されている場合があります。受付状態を確認し、再試行してください。', error);
    loadEvents();
  } finally { mutationBusy = false; detailButtons(!selected); }
};

onAuthStateChanged(auth, user => {
  authVersion++; listVersion++;
  currentUser = user;
  clearDetail();
  $('eventList').replaceChildren();
  $('createStatus').textContent = '';
  $('loginPanel').hidden = !!user;
  $('dashboard').hidden = !user;
  $('account').hidden = !user;
  $('userName').textContent = user?.displayName || user?.email || '';
  $('createButton').disabled = !user || createBusy;
  report('appStatus', user ? '' : 'イベントの作成・管理にはログインが必要です。');
  if (user) { loadEvents(); route(); }
}, error => report('appStatus', 'ログイン状態を確認できませんでした。ページを再読み込みしてください。', error));
