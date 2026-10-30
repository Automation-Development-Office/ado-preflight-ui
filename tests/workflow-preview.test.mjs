import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterOpenShiftWorkflow,
  workflowPreviewKeys
} from '../src/controllerWorkflowCatalog.mjs';

function ids(preflight) {
  return filterOpenShiftWorkflow(workflowPreviewKeys(preflight)).nodes.map((node) => node.id);
}

test('OpenShift with no apps does not preview Web Terminal or Descheduler', () => {
  const nodes = ids({
    components: ['openshift'],
    component_apps: { openshift: [] },
    component_options: { openshift: [] }
  });
  assert.equal(nodes.includes('Deploy Web Terminal'), false);
  assert.equal(nodes.includes('Deploy OpenShift Descheduler'), false);
  assert.equal(nodes.includes('Enable Integrated Image Registry'), false);
  assert.equal(nodes.includes('Deploy GitLab'), false);
  assert.equal(nodes.includes('Print ADO Routes'), false);
});

test('a selected app previews that job and not orphaned jobs', () => {
  const nodes = ids({
    components: ['openshift', 'web_terminal', 'ocp_descheduler'],
    component_apps: { openshift: ['gitlab'] },
    component_options: { openshift: ['integrated_image_registry'] }
  });
  assert.equal(nodes.includes('Deploy GitLab'), true);
  assert.equal(nodes.includes('Enable Integrated Image Registry'), true);
  assert.equal(nodes.includes('Deploy Web Terminal'), false);
  assert.equal(nodes.includes('Deploy OpenShift Descheduler'), false);
  assert.equal(nodes.includes('RHBK Workflow'), false);
  assert.equal(nodes.includes('Configure OAuth/RHBK in OpenShift'), false);
});

test('combined profile previews only generated component workflows', () => {
  const nodes = ids({
    components: ['openshift'],
    component_apps: { openshift: ['gitlab', 'grafana', 'rhbk', 'devspaces'] },
    component_options: { openshift: ['oauth_rhbk', 'discover_routes_print'] }
  });
  for (const id of [
    'Deploy GitLab',
    'Grafana Workflow',
    'RHBK Workflow',
    'Deploy DevSpaces',
    'Configure OAuth/RHBK in OpenShift',
    'Print ADO Routes'
  ]) {
    assert.equal(nodes.includes(id), true, id);
  }
  assert.equal(nodes.includes('Deploy Web Terminal'), false);
  assert.equal(nodes.includes('Deploy Kafka'), false);
  assert.equal(nodes.includes('Cert Manager Workflow'), false);
});
