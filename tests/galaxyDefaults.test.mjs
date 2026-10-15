import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const file of ['server.js', 'src/App.jsx']) {
  test(`${file}: public Galaxy is opt-in; local Hub stays enabled`, () => {
    const source = fs.readFileSync(file, 'utf8');
    const marker = file === 'server.js' ? 'function buildDefaultGalaxyCredentials(' : 'const buildDefaultGalaxyCredentials = ';
    const start = source.indexOf(marker);
    const end = source.indexOf('\n}', start) + 2;
    const context = vm.createContext({normalizeAapHostname: h => `https://${h}`});
    vm.runInContext(`${source.slice(start, end)}; result = buildDefaultGalaxyCredentials('Example', 'hub.example.test');`, context);
    const entries = context.result;
    assert.equal(entries.find(x => x.id === 'galaxy').enabled, false);
    assert.equal(entries.find(x => x.id === 'galaxy').attach_to_org, false);
    assert.ok(entries.filter(x => x.id !== 'galaxy').every(x => x.enabled && x.attach_to_org));
  });
}
