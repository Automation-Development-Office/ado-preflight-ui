import test from 'node:test';
import assert from 'node:assert/strict';
import sos from '../shift-on-shift.js';

const {
  newHostedCluster,
  normalizeShiftOnShiftConfig,
  shiftOnShiftPayload,
  validateHostedCluster,
  validateShiftOnShiftConfig,
  shiftOnShiftMissing,
  summarizeHostedCluster,
  releaseVersionFromImage,
  JOB_TEMPLATES
} = sos;

const fields = cluster => validateHostedCluster(cluster).map(e => e.field);
const digestImage = `mirror.example.test:5000/ocp/release@sha256:${'b'.repeat(64)}`;

test('a new hosted cluster is valid and gets a unique name', () => {
  const first = newHostedCluster([]);
  assert.equal(first.name, 'hosted-1');
  assert.deepEqual(validateHostedCluster(first), []);
  const second = newHostedCluster([first]);
  assert.equal(second.name, 'hosted-2');
  assert.equal(newHostedCluster([{ name: 'hosted-2' }]).name, 'hosted-3');
});

test('release version comes from the tag; digests need hosted_version', () => {
  assert.equal(releaseVersionFromImage('quay.io/openshift-release-dev/ocp-release:4.22.0-multi'), '4.22.0');
  assert.equal(releaseVersionFromImage(digestImage), '');
  const cluster = { ...newHostedCluster([]), release_image: digestImage };
  assert.ok(fields(cluster).includes('hosted_version'));
  assert.deepEqual(fields({ ...cluster, hosted_version: '4.22.0' }), []);
});

test('names and namespaces follow the hosted control planes rules', () => {
  const base = newHostedCluster([]);
  assert.ok(fields({ ...base, name: '' }).includes('name'));
  assert.ok(fields({ ...base, name: 'Bad_Name' }).includes('name'));
  assert.ok(fields({ ...base, name: 'clusters', namespace: 'hosted' }).includes('name'));
  assert.ok(fields({ ...base, namespace: base.name }).includes('namespace'));
  assert.ok(fields({ ...base, namespace: 'openshift-config' }).includes('namespace'));
  assert.ok(fields({ ...base, namespace: 'x'.repeat(40), name: 'y'.repeat(30) }).includes('name'));
});

test('pull secret sources are validated without echoing content', () => {
  const base = newHostedCluster([]);
  assert.ok(fields({ ...base, pull_secret_source: 'vault', pull_secret: 'nope' }).includes('pull_secret'));
  assert.ok(fields({ ...base, pull_secret_source: 'vault', pull_secret: '{"auths":{}}' }).includes('pull_secret'));
  assert.deepEqual(fields({ ...base, pull_secret_source: 'vault', pull_secret: '{"auths":{"quay.io":{"auth":"eA=="}}}' }), []);
  assert.ok(fields({ ...base, pull_secret_source: 'existing_secret' }).includes('pull_secret_name'));
  const messages = validateHostedCluster({ ...base, pull_secret_source: 'vault', pull_secret: 'SECRETVALUE' }).map(e => e.message).join(' ');
  assert.ok(!messages.includes('SECRETVALUE'));
});

test('sizes, counts, autoscaling, networks, and endpoints are checked', () => {
  const base = newHostedCluster([]);
  assert.ok(fields({ ...base, worker_cores: 0 }).includes('worker_cores'));
  assert.ok(fields({ ...base, worker_memory: 'lots' }).includes('worker_memory'));
  assert.ok(fields({ ...base, root_volume_size: '64 GB' }).includes('root_volume_size'));
  assert.ok(fields({ ...base, worker_count: -1 }).includes('worker_count'));
  assert.ok(fields({ ...base, autoscaling_enabled: true, autoscaling_min: 0, autoscaling_max: 2 }).includes('autoscaling_min'));
  assert.ok(fields({ ...base, autoscaling_enabled: true, autoscaling_min: 3, autoscaling_max: 2 }).includes('autoscaling_max'));
  assert.ok(fields({ ...base, cluster_network_cidr: '10.0.0.0/8', service_network_cidr: '10.1.0.0/16' }).includes('service_network_cidr'));
  assert.ok(fields({ ...base, cluster_network_cidr: '300.0.0.0/8' }).includes('cluster_network_cidr'));
  assert.ok(fields({ ...base, api_publishing: 'NodePort' }).includes('api_server_address'));
  assert.ok(fields({ ...base, base_domain: 'bad domain' }).includes('base_domain'));
  assert.ok(fields({ ...base, channel: 'latest' }).includes('channel'));
  assert.ok(fields({ ...base, require_live_migration: true, root_volume_access_mode: 'ReadWriteOnce' }).includes('root_volume_access_mode'));
});

test('capability rules match the 4.22 docs', () => {
  const base = newHostedCluster([]);
  assert.ok(fields({ ...base, capabilities_disabled: ['Ingress'] }).includes('capabilities_disabled'));
  assert.deepEqual(fields({ ...base, capabilities_disabled: ['Ingress', 'Console'] }), []);
  const old = { ...base, release_image: 'quay.io/openshift-release-dev/ocp-release:4.19.3-multi', capabilities_disabled: ['Insights'] };
  assert.ok(fields(old).includes('capabilities_disabled'));
});

test('disconnected settings are validated only when enabled', () => {
  const base = newHostedCluster([]);
  const bad = { ...base, disconnected: { enabled: true, image_content_sources: [{ source: 'quay.io/x', mirrors: '' }], additional_trust_bundle: 'hello' } };
  assert.ok(fields(bad).includes('image_content_sources'));
  assert.ok(fields(bad).includes('additional_trust_bundle'));
  assert.deepEqual(fields({ ...bad, disconnected: { ...bad.disconnected, enabled: false } }), []);
});

test('config validation flags duplicates and an empty list; missing labels name clusters', () => {
  assert.equal(validateShiftOnShiftConfig({ clusters: [] })[0].field, 'clusters');
  const a = newHostedCluster([]);
  const dup = validateShiftOnShiftConfig({ clusters: [a, { ...a }] });
  assert.ok(dup.some(e => e.message === 'Duplicate hosted cluster name'));
  assert.deepEqual(shiftOnShiftMissing({ clusters: [a] }), []);
  assert.deepEqual(shiftOnShiftMissing({ clusters: [{ ...a, worker_cores: 0 }] }), ['Shift on Shift: hosted-1']);
});

test('payload matches the collection contract', () => {
  const vault = { ...newHostedCluster([]), name: 'tenant-b', pull_secret_source: 'vault', pull_secret: '{"auths":{"quay.io":{"auth":"eA=="}}}' };
  const mgmt = { ...newHostedCluster([vault]), name: 'tenant-a', pull_secret: 'leftover', autoscaling_enabled: true, autoscaling_min: 2, autoscaling_max: 5 };
  const payload = shiftOnShiftPayload({ clusters: [mgmt, vault], manage_wildcard_route_admission: 'true', verify_hosted_api: false });
  assert.equal(payload.manage_wildcard_route_admission, true);
  assert.equal(payload.verify_hosted_api, false);
  assert.equal(payload.load_balancer_check, 'metallb');
  const [a, b] = payload.clusters;
  assert.equal(a.pull_secret, '');
  assert.equal(b.pull_secret, vault.pull_secret);
  assert.equal(a.autoscaling_min, 2);
  assert.equal(a.autoscaling_max, 5);
  assert.equal(b.autoscaling_max, 0);
  assert.ok(!('autoscaling_enabled' in a));
  assert.deepEqual(b.disconnected, { enabled: false });
  assert.equal(typeof a.worker_count, 'number');
});

test('normalization coerces form strings and trims values', () => {
  const cfg = normalizeShiftOnShiftConfig({ clusters: [{ name: ' Tenant-A ', worker_count: '3', worker_cores: '8', base_domain: '.Example.Test.' }] });
  const c = cfg.clusters[0];
  assert.equal(c.name, 'tenant-a');
  assert.equal(c.worker_count, 3);
  assert.equal(c.worker_cores, 8);
  assert.equal(c.base_domain, 'example.test');
});

test('review summary describes endpoints and never shows the pull secret', () => {
  const c = { ...newHostedCluster([]), name: 'tenant-a', pull_secret_source: 'vault', pull_secret: '{"auths":{"x":{"auth":"SECRET"}}}' };
  const rows = Object.fromEntries(summarizeHostedCluster(c, 'apps.mgmt.example.test'));
  assert.equal(rows['Control plane namespace'], 'clusters-tenant-a');
  assert.ok(rows.Ingress.startsWith('*.apps.tenant-a.apps.mgmt.example.test'));
  assert.ok(!JSON.stringify(rows).includes('SECRET'));
  const custom = Object.fromEntries(summarizeHostedCluster({ ...c, base_domain: 'tenants.example.test' }));
  assert.ok(custom.Ingress.includes('tenant-a-apps'));
  assert.equal(JOB_TEMPLATES.length, 7);
});

test('form defaults do not trim or coerce values being typed', () => {
  const edited = sos.withShiftOnShiftDefaults({ clusters: [{ name: 'Tenant', ssh_public_key: 'ssh-ed25519 ', worker_count: '3' }] });
  const c = edited.clusters[0];
  assert.equal(c.ssh_public_key, 'ssh-ed25519 ');
  assert.equal(c.worker_count, '3');
  assert.equal(c.namespace, 'clusters');
  assert.equal(c.disconnected.olm_catalog_placement, 'management');
  assert.equal(edited.load_balancer_check, 'metallb');
});

test('prerequisite setup is on by default and MetalLB pools are validated', () => {
  const cfg = sos.defaultShiftOnShiftConfig();
  assert.equal(cfg.install_prerequisites, true);
  const base = { clusters: [newHostedCluster([])] };
  const payload = shiftOnShiftPayload({ ...base, metallb_address_pools: '192.168.10.240-192.168.10.250, 10.0.0.0/28' });
  assert.equal(payload.install_prerequisites, true);
  assert.deepEqual(payload.metallb_address_pools, ['192.168.10.240-192.168.10.250', '10.0.0.0/28']);
  assert.equal(shiftOnShiftPayload({ ...base, install_prerequisites: false }).install_prerequisites, false);
  assert.deepEqual(validateShiftOnShiftConfig({ ...base, metallb_address_pools: '' }), []);
  for (const bad of ['192.168.10.250-192.168.10.240', '300.1.1.1/24', 'not-an-ip', '10.0.0.1-10.0.0']) {
    const errors = validateShiftOnShiftConfig({ ...base, metallb_address_pools: bad });
    assert.ok(errors.some(e => e.field === 'metallb_address_pools'), bad);
  }
  assert.deepEqual(validateShiftOnShiftConfig({ ...base, metallb_address_pools: 'fd00::10-fd00::20' }), []);
  assert.deepEqual(shiftOnShiftMissing({ ...base, metallb_address_pools: 'nope' }), ['Shift on Shift settings']);
  assert.deepEqual(shiftOnShiftMissing({ clusters: [] }), ['Shift on Shift hosted cluster']);
});
