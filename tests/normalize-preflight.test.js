const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { normalizePreflightPayload } = require('../server');

function loadFixture(name) {
  const filePath = path.join(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('normalizePreflightPayload applies org-scoped AAP names', () => {
  const input = loadFixture('org-scoped-names.json');
  const output = normalizePreflightPayload(input);

  assert.equal(output.aap.organization, 'RH');
  assert.equal(output.aap.inventory, 'RH-test-inventory');
  assert.equal(output.aap.project, 'RH-test-project');
  assert.equal(output.aap.vault_credential_name, 'RH-custom-vault');
});

test('normalizePreflightPayload sets git defaults for component runs', () => {
  const input = loadFixture('minimal-openshift.json');
  const output = normalizePreflightPayload(input);

  assert.equal(output.environment, 'dev');
  assert.deepEqual(output.components, ['openshift']);
  assert.equal(output.component, 'openshift');
  assert.equal(output.git.auto_push, true);
  assert.equal(output.git.skip_tls_verify, true);
  assert.equal(output.vault.encrypt, true);
});

test('normalizePreflightPayload mirrors hub EE settings for disconnected runs', () => {
  const input = loadFixture('minimal-openshift.json');
  const output = normalizePreflightPayload(input);

  assert.equal(output.aap.hub_ee_pull, false);
  assert.match(output.aap.hub_ee_source_image, /^docker-archive:/);
  assert.equal(output.hub.ee.pull, false);
  assert.equal(output.hub.hostname, 'controller.example.com');
});

test('normalizePreflightPayload clears components for hub-only standalone runs', () => {
  const output = normalizePreflightPayload({
    environment: 'prod',
    components: ['openshift', 'rhel'],
    aap: {
      hub_update_collection_only: true,
      hostname: 'https://controller.example.com'
    }
  });

  assert.deepEqual(output.components, []);
  assert.deepEqual(output.component_apps, {
    openshift: [],
    rhel: [],
    patching: [],
    aws: [],
    provision: []
  });
  assert.equal(output.git.auto_push, false);
});
