// Same ordering as `sort -V` on infra-automation_development_office-*.tar.gz names.
function versionKey(filePath) {
  const name = String(filePath || '').split(/[/\\]/).pop();
  const nums = name.match(/\d+/g);
  return nums ? nums.map(n => Number(n)) : [0];
}

function compareVersion(a, b) {
  const ka = versionKey(a);
  const kb = versionKey(b);
  const n = Math.max(ka.length, kb.length);
  for (let i = 0; i < n; i += 1) {
    const da = ka[i] || 0;
    const db = kb[i] || 0;
    if (da !== db) return da - db;
  }
  return String(a).localeCompare(String(b));
}

function chooseArchive(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return '';
  return [...list].sort(compareVersion).pop();
}

module.exports = { versionKey, compareVersion, chooseArchive };
