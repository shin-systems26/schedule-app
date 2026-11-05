export const practiceGroups = [
  { id: 'online', title: 'オンラインでやる場合' },
  { id: 'env', title: '環境人間キャンパスでやる場合' },
  { id: 'eng', title: '工学キャンパスでやる場合' }
];
// Preserve IDs because response maps are keyed by them, including legacy events.
export function eventGroups(data) {
  const fallback = [
    { id: 'env', title: '環境人間キャンパスでダンス練習' },
    { id: 'eng', title: '姫路工学キャンパスでダンス練習' },
    { id: 'online', title: 'オンラインでダンス練習' }
  ];
  const groups = data.groups?.length ? data.groups : data.questions?.length ? data.questions : fallback;
  return groups.map((group, index) => ({
    id: group.id || `question${index + 1}`,
    title: typeof group === 'string' ? group : group.title
  }));
}
