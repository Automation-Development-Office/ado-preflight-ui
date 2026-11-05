// Allowlisted documentation paths. Reject traversal and anything outside the list.

function normalizeRel(rel) {
  let decoded = String(rel || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return '';
  }
  const normalized = decoded.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..')) return '';
  return normalized;
}

function safeAdoDocRelative(rel) {
  const normalized = normalizeRel(rel);
  if (!normalized) return '';
  const allowed = normalized === 'README.md'
    || /^roles\/[A-Za-z0-9_.-]+\/README\.md$/.test(normalized)
    || /^docs\/modules\/[A-Za-z0-9_.-]+\.md$/.test(normalized)
    || /^playbooks\/(?:[A-Za-z0-9_.-]+\/)+README\.md$/.test(normalized);
  return allowed ? normalized : '';
}

function safePreflightDoc(rel) {
  const normalized = normalizeRel(rel);
  if (!normalized) return '';
  const allowed = new Set([
    'README.md',
    'known-bugs.md',
    'docs/TROUBLESHOOTING.md',
    'docs/ADO_ASSISTANT.md',
    'docs/ADO_DEVELOPMENT_MODEL.md',
    'docs/hub-recovery.md',
    'docs/RELEASING.md'
  ]);
  if (allowed.has(normalized)) return normalized;
  if (/^docs\/troubleshooting\/[a-z0-9-]+\.md$/.test(normalized)) return normalized;
  if (/^docs\/knowledge-sources\/[A-Za-z0-9_.-]+\.md$/.test(normalized)) return normalized;
  return '';
}

module.exports = { normalizeRel, safeAdoDocRelative, safePreflightDoc };
