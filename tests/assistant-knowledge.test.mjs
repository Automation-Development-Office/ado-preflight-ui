import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerQuestion } from '../src/assistantKnowledge.mjs';
const { documents } = JSON.parse(readFileSync(new URL('../public/assistant-knowledge.json', import.meta.url)));
test('AAP deployment asks for guided form steps', () => {
  const result = answerQuestion('How do I install AAP on OCP?', documents);
  assert.equal(result.guide, 'aap');
});
test('Not using AAP asks for local walkthrough', () => {
  assert.equal(answerQuestion('Show me how to use without AAP', documents).guide, 'local');
  assert.equal(answerQuestion('walk me through using Not using AAP section', documents).guide, 'local');
});
test('exact role lookup returns real documentation including examples', () => {
  const result = answerQuestion('how do I use infra.ado.install_aap', documents);
  assert.equal(result.documents[0].path, 'infra.ado/roles/install_aap/README.md');
  assert.match(result.documents[0].text, /Role Usage/);
  assert.ok(!result.guide);
});
test('Keycloak misspelling explains actual RHBK role instead of inventing one', () => {
  const result = answerQuestion('how do I use infra.ado.install_keyclaok', documents);
  assert.match(result.answer, /no infra.ado.install_keyclaok/);
  assert.equal(result.documents[0].path, 'infra.ado/roles/install_rhbk/README.md');
});
test('unknown role and unrelated questions have no invented answer', () => {
  assert.equal(answerQuestion('infra.ado.not_a_real_role', documents).documents.length, 0);
  assert.equal(answerQuestion('who won the baseball championship', documents).documents.length, 0);
});
test('RHEL deployment does not launch the OpenShift walkthrough', () => {
  assert.ok(!answerQuestion('install AAP on RHEL', documents).guide);
});
test('NFS CSI questions return ocp_nfs_storage README', () => {
  for (const q of [
    'how do I install NFS CSI',
    'nfs storage class',
    'synology-nfs StorageClass',
    'infra.ado.ocp_nfs_storage'
  ]) {
    const result = answerQuestion(q, documents);
    assert.ok(result.documents.length, `expected docs for: ${q}`);
    assert.equal(result.documents[0].path, 'infra.ado/roles/ocp_nfs_storage/README.md');
  }
});
