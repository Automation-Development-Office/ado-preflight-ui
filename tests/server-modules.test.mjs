import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every local module required by server.js loads', () => {
  const result = spawnSync(process.execPath, ['scripts/check-server-modules.js'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok \.\/git-username/);
  assert.match(result.stdout, /ok \.\/git-tls/);
  assert.match(result.stdout, /ok \.\/collection-archive/);
  assert.match(result.stdout, /ok \.\/doc-paths/);
});

test('Containerfile copies every local module server.js requires', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const containerfile = fs.readFileSync(path.join(root, 'Containerfile'), 'utf8');
  const specs = [...server.matchAll(/require\(\s*(['"])(\.\/[^'"]+)\1\s*\)/g)].map((match) => match[2]);
  for (const spec of new Set(specs)) {
    if (spec === './package.json') continue;
    const base = spec.slice(2);
    assert.match(containerfile, new RegExp(`\\b${base}\\b`), `${base} is not copied into the image`);
  }
  assert.match(containerfile, /node scripts\/check-server-modules\.js/);
  const buildStage = containerfile.split(/^FROM /m)[1];
  assert.match(buildStage, /COPY git-tls\.js \.\/git-tls\.js/);
});
