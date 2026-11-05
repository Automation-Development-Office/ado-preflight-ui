import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chooseArchive } from '../collection-archive.js';
import { safeAdoDocRelative, safePreflightDoc } from '../doc-paths.js';

test('collection archive pick matches numeric sort -V', () => {
  const picked = chooseArchive([
    '/opt/ado-collections/infra-automation_development_office-1.9.0.tar.gz',
    '/opt/ado-collections/infra-automation_development_office-1.10.0.tar.gz',
    '/opt/ado-collections/infra-automation_development_office-2.1.0.tar.gz'
  ]);
  assert.equal(picked, '/opt/ado-collections/infra-automation_development_office-2.1.0.tar.gz');
});

test('python archive picker agrees with the runtime picker', () => {
  const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("bundle", "scripts/build-assistant-knowledge.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
paths = [
    "infra-automation_development_office-1.9.0.tar.gz",
    "infra-automation_development_office-1.10.0.tar.gz",
    "infra-automation_development_office-2.1.0.tar.gz",
]
print(mod.choose_archive(paths).name)
`;
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'infra-automation_development_office-2.1.0.tar.gz');
});

test('documentation paths stay on the allowlist', () => {
  assert.equal(safeAdoDocRelative('roles/bootstrap_controller/README.md'), 'roles/bootstrap_controller/README.md');
  assert.equal(safeAdoDocRelative('docs/modules/ec2_ami_copy.md'), 'docs/modules/ec2_ami_copy.md');
  assert.equal(safeAdoDocRelative('../server.js'), '');
  assert.equal(safeAdoDocRelative('roles/../../etc/passwd'), '');
  assert.equal(safeAdoDocRelative('docs/troubleshooting/aap-inventory-timeout.md'), '');
  assert.equal(
    safePreflightDoc('docs/troubleshooting/aap-inventory-timeout.md'),
    'docs/troubleshooting/aap-inventory-timeout.md'
  );
  assert.equal(safePreflightDoc('../server.js'), '');
  assert.equal(safePreflightDoc('server.js'), '');
});

test('troubleshooting entries do not contain credential material', () => {
  const banned = /-----BEGIN |ghp_[A-Za-z0-9]{20,}|Bearer eyJ|oauth_token:\s*[A-Za-z0-9]{20,}/;
  for (const name of readdirSync(new URL('../docs/troubleshooting/', import.meta.url))) {
    const text = readFileSync(new URL(`../docs/troubleshooting/${name}`, import.meta.url), 'utf8');
    assert.equal(banned.test(text), false, name);
    assert.match(text, /^---\n[\s\S]*status: (proposed|source-fixed|runtime-verified|resolved)/);
  }
});
