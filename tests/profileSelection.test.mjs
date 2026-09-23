import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProfileApps } from '../src/profileSelection.mjs';
const groups = ['openshift', 'rhel', 'patching', 'aws', 'provision'];
const catalogs = { openshift: ['openshift', 'grafana'], rhel: ['rhel', 'grafana', 'aap'], patching: ['patching'], aws: ['ec2_ami_copy'], provision: ['openshift_virt'] };
const apply = (source, group, apps) => selectProfileApps(source, group, apps, groups, catalogs, ['grafana']);
test('hybrid profile updates preserve other target selections and configuration', () => {
  const source = { components: ['openshift', 'rhel'], component_apps: { openshift: ['openshift'], rhel: ['rhel', 'aap'] }, component_config: { aap: { hostname: 'example.test' } } };
  const result = apply(source, 'openshift', ['openshift', 'grafana']);
  assert.deepEqual(result.component_apps.rhel, ['rhel', 'aap']);
  assert.deepEqual(result.component_config, source.component_config);
  assert.deepEqual(source.component_apps.openshift, ['openshift']);
  assert.deepEqual(result.components, ['openshift', 'rhel']);
});
test('legacy all is materialized without discarding other targets', () => {
  const result = apply({ components: ['all'] }, 'openshift', ['openshift']);
  assert.deepEqual(result.component_apps.rhel, catalogs.rhel);
  assert.ok(result.components.includes('jira'));
  assert.ok(!result.components.includes('all'));
});
test('RHEL-only monitoring uses existing standalone option; repeating is stable', () => {
  const result = apply({ components: ['rhel'] }, 'rhel', ['rhel', 'grafana']);
  assert.deepEqual(result.component_options.grafana, ['standalone']);
  assert.deepEqual(apply(result, 'rhel', ['rhel', 'grafana']), result);
});
test('removing a component removes its legacy top-level selector', () => {
  const result = apply({ components: ['rhel', 'grafana'], component_apps: { rhel: ['grafana'] } }, 'rhel', ['rhel']);
  assert.ok(!result.components.includes('grafana'));
  assert.deepEqual(result.selected_component_apps, []);
});
