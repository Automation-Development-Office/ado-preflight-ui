import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function setInstallAapBody() {
  const start = app.indexOf('const setInstallAap = checked => {');
  assert.notEqual(start, -1, 'setInstallAap missing from App.jsx');
  const end = app.indexOf('const setOpenshiftAgent', start);
  assert.notEqual(end, -1, 'setInstallAap body boundary missing');
  return app.slice(start, end);
}

test('checking Install AAP does not enable Using AAP / Controller configuration', () => {
  const fn = setInstallAapBody();
  assert.match(fn, /copy\.pre_installs\.install_aap = !!checked/);
  assert.match(fn, /copy\.aap\.enabled = false/);
  assert.match(fn, /Install AAP is not a platform component selection/);
});

test('unchecking Install AAP removes generated AAP install selection', () => {
  const fn = setInstallAapBody();
  assert.match(fn, /filter\(c => c !== 'aap'\)/);
  assert.match(fn, /app !== 'aap'/);
  assert.match(fn, /copy\.component_config\.aap\.install_during_bootstrap = false/);
  assert.match(fn, /copy\.component_config\.aap\.license_only = false/);
});

test('installAapFullRequested is independent of aap.enabled', () => {
  const start = app.indexOf('function installAapFullRequested');
  const end = app.indexOf('\nfunction ', start + 1);
  const fn = app.slice(start, end);
  assert.match(fn, /pre_installs\?\.install_aap === true/);
  assert.equal(fn.includes('aap.enabled'), false);
  assert.equal(fn.includes('.enabled'), false);
});
