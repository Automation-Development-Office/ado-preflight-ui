import test from 'node:test';
import assert from 'node:assert/strict';
import { localCollectionDoc } from '../src/localCollectionDoc.mjs';

test('GitHub role README stays on the pod role API', () => {
  const doc = localCollectionDoc(
    'https://github.com/redhat-cop/infra.automation-development-office/blob/main/roles/aap_build_ee/README.md'
  );
  assert.equal(doc.kind, 'role');
  assert.equal(doc.role, 'aap_build_ee');
  assert.equal(doc.url, '/api/readme/ado/role/aap_build_ee');
});

test('relative role README and module docs resolve locally', () => {
  assert.equal(localCollectionDoc('roles/bootstrap_controller/README.md').url,
    '/api/readme/ado/role/bootstrap_controller');
  const mod = localCollectionDoc(
    'https://github.com/Automation-Development-Office/ado/blob/main/docs/modules/ec2_ami_copy.md'
  );
  assert.equal(mod.kind, 'file');
  assert.match(mod.url, /path=docs%2Fmodules%2Fec2_ami_copy\.md/);
});

test('root README hash does not leave the pod', () => {
  const doc = localCollectionDoc(
    'https://github.com/redhat-cop/infra.automation-development-office/blob/main/README.md#role-documentation'
  );
  assert.equal(doc.kind, 'root');
  assert.equal(doc.hash, '#role-documentation');
});

test('unrelated links are left alone', () => {
  assert.equal(localCollectionDoc('https://docs.redhat.com/en/documentation'), null);
  assert.equal(localCollectionDoc('roles/../../etc/passwd'), null);
});
