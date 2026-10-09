import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectProfileApps,
  satelliteProfileOptions,
  syncPlatformInstallOptions,
  visiblePlatformOptions
} from '../src/profileSelection.mjs';
const groups = ['openshift', 'rhel', 'patching', 'aws', 'provision', 'satellite'];
const catalogs = { openshift: ['openshift', 'grafana'], rhel: ['rhel', 'grafana', 'aap'], patching: ['patching'], aws: ['ec2_ami_copy'], provision: ['openshift_virt'], satellite: ['satellite'] };
const apply = (source, group, apps, profileName) => selectProfileApps(source, group, apps, groups, catalogs, ['grafana', 'satellite'], profileName);
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
test('Satellite target applies existing option keys from the profile name', () => {
  const result = apply({ components: [] }, 'satellite', ['satellite'], 'Server');
  assert.deepEqual(result.components, ['satellite']);
  assert.deepEqual(result.component_apps.satellite, ['satellite']);
  assert.deepEqual(result.component_options.satellite, ['satellite_server_install']);
});
test('Satellite full profile uses the existing satellite option set', () => {
  const result = apply({ components: ['satellite'] }, 'satellite', ['satellite'], 'Full Satellite');
  assert.deepEqual(result.component_options.satellite, satelliteProfileOptions['Full Satellite']);
});
test('OpenShift-only Grafana uses the OpenShift install and hides the VM install', () => {
  const result = apply({ components: ['openshift'] }, 'openshift', ['openshift', 'grafana']);
  assert.ok(result.component_options.grafana.includes('install'));
  assert.ok(!result.component_options.grafana.includes('standalone'));
  assert.deepEqual(
    visiblePlatformOptions('grafana', 'openshift', ['install', 'standalone', 'datasources', 'alternate_route']),
    ['datasources', 'alternate_route']
  );
});
test('Standalone Grafana drops OpenShift install options', () => {
  const result = syncPlatformInstallOptions({
    components: ['rhel'],
    component_apps: { rhel: ['grafana'] },
    component_options: { grafana: ['install', 'alternate_route', 'datasources'] }
  });
  assert.deepEqual(result.component_options.grafana, ['datasources', 'standalone']);
  assert.deepEqual(
    visiblePlatformOptions('grafana', 'standalone', ['install', 'standalone', 'datasources', 'alternate_route']),
    ['datasources']
  );
});
test('unselected component options are left untouched', () => {
  const result = syncPlatformInstallOptions({
    components: ['rhel'],
    component_apps: { rhel: ['rhel'] },
    component_options: { grafana: ['install', 'datasources'] }
  });
  assert.deepEqual(result.component_options.grafana, ['install', 'datasources']);
});
test('Satellite custom profile does not invent option keys', () => {
  const result = apply({ components: ['satellite'], component_options: { satellite: ['satellite_content_view'] } }, 'satellite', ['satellite'], 'Custom');
  assert.deepEqual(result.component_options.satellite, ['satellite_content_view']);
});
