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
  const result = answerQuestion('how do I use infra.automation_development_office.install_aap', documents);
  assert.equal(result.documents[0].path, 'infra.automation_development_office/roles/install_aap/README.md');
  assert.match(result.documents[0].text, /Role Usage/);
  assert.ok(!result.guide);
});
test('Keycloak misspelling explains actual RHBK role instead of inventing one', () => {
  const result = answerQuestion('how do I use infra.automation_development_office.install_keyclaok', documents);
  assert.match(result.answer, /no infra.automation_development_office.install_keyclaok/);
  assert.equal(result.documents[0].path, 'infra.automation_development_office/roles/install_rhbk/README.md');
});
test('unknown role and unrelated questions have no invented answer', () => {
  assert.equal(answerQuestion('infra.automation_development_office.not_a_real_role', documents).documents.length, 0);
  assert.equal(answerQuestion('who won the baseball championship', documents).documents.length, 0);
});
test('RHEL deployment does not launch the OpenShift walkthrough', () => {
  assert.ok(!answerQuestion('install AAP on RHEL', documents).guide);
});
test('vague questions ask for a component instead of inventing a cause', () => {
  const result = answerQuestion('why is this not working', documents, []);
  assert.equal(result.kind, 'follow-up');
  assert.match(result.followUp, /component|error/i);
  assert.equal(result.documents.length, 0);
});
test('inventory timeout and follow-ups stay on the documented entry', () => {
  const entry = {
    path: 'ado-preflight-ui/docs/troubleshooting/aap-inventory-timeout.md',
    text: readFileSync(new URL('../docs/troubleshooting/aap-inventory-timeout.md', import.meta.url), 'utf8')
  };
  const gitlab = {
    path: 'ado-preflight-ui/docs/troubleshooting/gitlab-saml-username.md',
    text: readFileSync(new URL('../docs/troubleshooting/gitlab-saml-username.md', import.meta.url), 'utf8')
  };
  const wait = {
    path: 'ado-preflight-ui/docs/troubleshooting/ocp-wait-operator-namespace.md',
    text: readFileSync(new URL('../docs/troubleshooting/ocp-wait-operator-namespace.md', import.meta.url), 'utf8')
  };
  const docs = [entry, gitlab, wait];
  const first = answerQuestion('inventory create timed out', docs, []);
  assert.equal(first.topic, 'aap-inventory-timeout');
  assert.match(first.answer, /120/);
  assert.equal(first.documents[0].path, entry.path);
  const history = [{ question: 'inventory create timed out', topic: first.topic, answer: first.answer }];
  const verify = answerQuestion('How do I verify it?', docs, history);
  assert.equal(verify.topic, 'aap-inventory-timeout');
  assert.match(verify.answer, /Verification/);
  const commands = answerQuestion('Give me the commands.', docs, history);
  assert.ok(commands.commands.length);
  assert.match(commands.commands[0].text, /organizations/);
  const switched = answerQuestion('What about GitLab?', docs, history);
  assert.equal(switched.topic, 'gitlab-saml-username');
  assert.match(switched.answer, /oauth2/);
});
test('project inventory vault error stays off the inventory timeout entry', () => {
  const files = ['scm-inventory-sync-vault.md', 'aap-inventory-timeout.md'];
  const docs = files.map(name => ({
    path: `ado-preflight-ui/docs/troubleshooting/${name}`,
    text: readFileSync(new URL(`../docs/troubleshooting/${name}`, import.meta.url), 'utf8')
  }));
  const result = answerQuestion('ERROR! Attempting to decrypt but no vault secrets found', docs, []);
  assert.equal(result.topic, 'scm-inventory-sync-vault');
  assert.match(result.answer, /ADO-inventory/);
  assert.match(result.answer, /ANSIBLE_VARS_ENABLED/);
  const where = answerQuestion('where do I set ANSIBLE_VARS_ENABLED on ADO-inventory', docs, []);
  assert.equal(where.topic, 'scm-inventory-sync-vault');
  assert.match(where.answer, /Source variables/);
});
test('exact operator error outranks a general README', () => {
  const wait = {
    path: 'ado-preflight-ui/docs/troubleshooting/ocp-wait-operator-namespace.md',
    text: readFileSync(new URL('../docs/troubleshooting/ocp-wait-operator-namespace.md', import.meta.url), 'utf8')
  };
  const readme = { path: 'infra.automation_development_office/roles/ocp_virtualization/README.md', text: 'OpenShift virtualization install notes.' };
  const result = answerQuestion("'AnsibleUnicode' object is not callable", [readme, wait], []);
  assert.equal(result.documents[0].path, wait.path);
  assert.match(result.answer, /namespace/);
});
test('virtualization and GitLab username questions hit troubleshooting entries', () => {
  const files = ['ocp-wait-operator-namespace.md', 'gitlab-saml-username.md'];
  const docs = files.map(name => ({
    path: `ado-preflight-ui/docs/troubleshooting/${name}`,
    text: readFileSync(new URL(`../docs/troubleshooting/${name}`, import.meta.url), 'utf8')
  }));
  const virt = answerQuestion('Why is virtualization failing?', docs, []);
  assert.equal(virt.topic, 'ocp-wait-operator-namespace');
  const git = answerQuestion('Why does GitLab keep asking for a username?', docs, []);
  assert.equal(git.topic, 'gitlab-saml-username');
  const simpler = answerQuestion('Explain that in simpler terms.', docs, [{ topic: git.topic }]);
  assert.match(simpler.answer, /SAML|oauth2/i);
});
test('a missing bundle is not reported as a search miss', () => {
  const result = answerQuestion('inventory timeout', null, []);
  assert.equal(result.kind, 'unavailable');
  assert.match(result.answer, /not a search miss/);
});
test('NFS CSI questions return ocp_nfs_storage README', () => {
  for (const q of [
    'how do I install NFS CSI',
    'nfs storage class',
    'synology-nfs StorageClass',
    'infra.automation_development_office.ocp_nfs_storage'
  ]) {
    const result = answerQuestion(q, documents);
    assert.ok(result.documents.length, `expected docs for: ${q}`);
    assert.equal(result.documents[0].path, 'infra.automation_development_office/roles/ocp_nfs_storage/README.md');
  }
});
