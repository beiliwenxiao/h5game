function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^(?:\.\.\/)+/, '').replace(/^\//, '');
}

export function projectPathForCanonicalFile(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.endsWith('/game.project.json')) return normalized;
  const marker = '/assets/scenes/';
  const index = normalized.indexOf(marker);
  if (index < 0) throw new Error(`不是 canonical 项目/场景路径: ${normalized}`);
  return `${normalized.slice(0, index)}/game.project.json`;
}

export async function commitCanonicalChanges(projectPath, changes, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('canonical transaction requires fetch');
  const response = await fetchImpl('/api/canonical-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectPath: normalizePath(projectPath),
      changes: changes.map(change => ({
        ...change,
        path: normalizePath(change.path || change.to),
        ...(change.from ? { from: normalizePath(change.from) } : {})
      }))
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || result.committed !== true) {
    const error = new Error(result.error || `canonical transaction HTTP ${response.status}`);
    error.result = result;
    throw error;
  }
  return result;
}

export function replaceCanonicalFile(filePath, content, options) {
  const normalized = normalizePath(filePath);
  return commitCanonicalChanges(projectPathForCanonicalFile(normalized), [
    { operation: 'replace', path: normalized, content }
  ], options);
}
