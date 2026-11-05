// Map collection documentation links to files shipped in the preflight pod.
// GitHub blob URLs in the bundled README must not navigate the browser off the pod.

const GITHUB_BLOB = /^https?:\/\/github\.com\/[^/]+\/(?:infra\.automation-development-office|ado)\/blob\/[^/]+\/(.+)$/i;

export function localCollectionDoc(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  const hashAt = raw.indexOf('#');
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  let docPath = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const github = docPath.match(GITHUB_BLOB);
  if (github) docPath = decodeURIComponent(github[1]);
  docPath = docPath.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!docPath || docPath.includes('..')) return null;

  if (docPath === 'README.md') {
    return { kind: 'root', hash };
  }
  const role = docPath.match(/^roles\/([A-Za-z0-9_.-]+)\/README\.md$/);
  if (role) {
    return {
      kind: 'role',
      role: role[1],
      hash,
      url: `/api/readme/ado/role/${encodeURIComponent(role[1])}`
    };
  }
  if (
    /^docs\/modules\/[A-Za-z0-9_.-]+\.md$/.test(docPath)
    || /^playbooks\/(?:[A-Za-z0-9_.-]+\/)+README\.md$/.test(docPath)
  ) {
    return {
      kind: 'file',
      path: docPath,
      hash,
      url: `/api/readme/ado/doc?path=${encodeURIComponent(docPath)}`
    };
  }
  return null;
}
