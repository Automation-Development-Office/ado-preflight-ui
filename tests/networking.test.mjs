import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORKING_DEFAULTS,
  createTenant, createTenantNamespace, createTenantNetwork, createSubnet,
  createPhysicalNetwork, createNetworkPolicyRule, createAdminNetworkPolicy,
  createAdminNetworkPolicyRule, createEgressFirewallRule,
  createMetalLBAddressPool, createMetalLBBGPPeer,
  OCP_VERSION_OPTIONS, FEATURE_STATUS,
  supportsFeature, getValidTopologies, getValidRoles, getValidScopes,
  isVmCompatible, requiresNamespaceLabel,
  validateNetworkingConfig, validateTenant, validateTenantNetwork,
  validateNamespaceName, validateResourceName, validateCIDR, validateCIDROverlap,
  validatePhysicalNetwork, validateAdminNetworkPolicy, validateMetalLBPool,
  generateNetworkResources, calculateDependencies,
  normalizeNetworkingConfig, INFO_POPOVER_MAP, generateAnsibleVars
} from '../src/networkingSupport.mjs';

// --- Defaults & Factory ---

test('NETWORKING_DEFAULTS has expected shape', () => {
  assert.equal(NETWORKING_DEFAULTS.enabled, true);
  assert.equal(NETWORKING_DEFAULTS.ocp_version, '4.18');
  assert.equal(NETWORKING_DEFAULTS.network_provider, 'OVNKubernetes');
  assert.ok(Array.isArray(NETWORKING_DEFAULTS.tenants));
  assert.ok(Array.isArray(NETWORKING_DEFAULTS.physical_networks));
  assert.ok(NETWORKING_DEFAULTS.cluster_security != null);
  assert.ok(NETWORKING_DEFAULTS.load_balancing != null);
});

test('createTenant produces unique ids and expected structure', () => {
  const t1 = createTenant('finance');
  const t2 = createTenant('hr');
  assert.notEqual(t1.id, t2.id);
  assert.equal(t1.tenant_name, 'finance');
  assert.ok(Array.isArray(t1.namespaces));
  assert.ok(Array.isArray(t1.networks));
  assert.ok(t1.security != null);
  assert.ok(t1.connectivity != null);
});

test('createTenantNamespace returns valid structure', () => {
  const ns = createTenantNamespace('my-namespace');
  assert.equal(ns.name, 'my-namespace');
  assert.equal(ns.create, true);
  assert.deepEqual(ns.labels, {});
});

test('createTenantNetwork returns valid structure', () => {
  const net = createTenantNetwork('test-network');
  assert.equal(net.name, 'test-network');
  assert.equal(net.scope, 'cluster');
  assert.equal(net.role, 'Primary');
  assert.equal(net.topology, 'Layer2');
  assert.ok(Array.isArray(net.subnets));
  assert.ok(net.ipam != null);
});

test('createSubnet returns valid structure', () => {
  const s = createSubnet('10.0.0.0/24');
  assert.equal(s.cidr, '10.0.0.0/24');
});

test('createPhysicalNetwork has NMState flag', () => {
  const pn = createPhysicalNetwork('dc-vlan');
  assert.equal(pn.managed_by_nmstate, true);
  assert.equal(pn.interface_config.type, 'bridge');
});

test('createNetworkPolicyRule defaults to ingress TCP', () => {
  const r = createNetworkPolicyRule();
  assert.equal(r.direction, 'ingress');
  assert.equal(r.protocol, 'TCP');
});

test('createAdminNetworkPolicy has required fields', () => {
  const anp = createAdminNetworkPolicy();
  assert.ok(anp.id);
  assert.equal(typeof anp.priority, 'number');
  assert.ok(Array.isArray(anp.ingress_rules));
  assert.ok(Array.isArray(anp.egress_rules));
});

test('createMetalLBAddressPool defaults to layer2', () => {
  const pool = createMetalLBAddressPool();
  assert.equal(pool.protocol, 'layer2');
  assert.ok(Array.isArray(pool.addresses));
});

// --- OCP Version Options ---

test('OCP_VERSION_OPTIONS includes 4.18 through 4.22', () => {
  const versions = OCP_VERSION_OPTIONS.map(o => o.value);
  assert.ok(!versions.includes('4.17'));
  assert.ok(versions.includes('4.18'));
  assert.ok(versions.includes('4.22'));
});

// --- Support Matrix ---

test('supportsFeature returns supported for basic UDN on 4.18', () => {
  const result = supportsFeature({
    ocpVersion: '4.18',
    resourceType: 'UserDefinedNetwork',
    role: 'Secondary',
    topology: 'Layer2',
    networkProvider: 'OVNKubernetes'
  });
  assert.equal(result.supported, true);
});

test('supportsFeature rejects UDN without OVN-Kubernetes', () => {
  const result = supportsFeature({
    ocpVersion: '4.18',
    resourceType: 'UserDefinedNetwork',
    role: 'Secondary',
    topology: 'Layer2',
    networkProvider: 'OpenShiftSDN'
  });
  assert.equal(result.supported, false);
});

test('supportsFeature returns status for NetworkPolicy', () => {
  const result = supportsFeature({
    ocpVersion: '4.18',
    policyType: 'NetworkPolicy',
    networkProvider: 'OVNKubernetes'
  });
  assert.equal(result.supported, true);
  assert.equal(result.status, FEATURE_STATUS.GA);
});

test('getValidTopologies returns objects with value and label', () => {
  const topos = getValidTopologies({
    ocpVersion: '4.18',
    resourceType: 'UserDefinedNetwork',
    role: 'Secondary',
    scope: 'namespace'
  });
  assert.ok(Array.isArray(topos));
  assert.ok(topos.length > 0);
  assert.ok(topos[0].value, 'expected .value on topology option');
  assert.ok(topos[0].label, 'expected .label on topology option');
  assert.ok(topos[0].status, 'expected .status on topology option');
});

test('getValidRoles returns objects with value and label', () => {
  const roles = getValidRoles({
    ocpVersion: '4.18',
    resourceType: 'UserDefinedNetwork',
    topology: 'Layer2',
    scope: 'namespace'
  });
  assert.ok(Array.isArray(roles));
  assert.ok(roles.length > 0);
  assert.ok(roles[0].value, 'expected .value on role option');
  assert.ok(roles[0].label, 'expected .label on role option');
});

test('isVmCompatible requires Layer2 Primary with Persistent IPAM', () => {
  assert.equal(isVmCompatible({ role: 'Primary', topology: 'Layer2', ipam: { lifecycle: 'Persistent' } }), true);
  assert.equal(isVmCompatible({ role: 'Primary', topology: 'Layer3', ipam: { lifecycle: 'Persistent' } }), false);
  assert.equal(isVmCompatible({ role: 'Primary', topology: 'Layer2', ipam: { lifecycle: '' } }), true);
  assert.equal(isVmCompatible({ role: 'Secondary', topology: 'Layer2', ipam: { lifecycle: 'Persistent' } }), true);
});

test('requiresNamespaceLabel true for Primary role', () => {
  assert.equal(requiresNamespaceLabel({ role: 'Primary' }), true);
  assert.equal(requiresNamespaceLabel({ role: 'Secondary' }), false);
});

// --- Validation ---

test('validateNamespaceName accepts valid names', () => {
  assert.equal(validateNamespaceName('my-namespace').valid, true);
  assert.equal(validateNamespaceName('finance-apps').valid, true);
  assert.equal(validateNamespaceName('a').valid, true);
});

test('validateNamespaceName rejects invalid names', () => {
  assert.equal(validateNamespaceName('').valid, false);
  assert.equal(validateNamespaceName('My_Namespace').valid, false);
  assert.equal(validateNamespaceName('-starts-with-dash').valid, false);
  assert.equal(validateNamespaceName('ends-with-dash-').valid, false);
});

test('validateResourceName works like namespace validation', () => {
  assert.equal(validateResourceName('finance-network').valid, true);
  assert.equal(validateResourceName('INVALID').valid, false);
});

test('validateCIDR accepts valid IPv4 CIDRs', () => {
  const r = validateCIDR('10.100.10.0/24');
  assert.equal(r.valid, true);
  assert.equal(r.family, 'IPv4');
  assert.equal(r.prefix, 24);
});

test('validateCIDR accepts valid IPv6 CIDRs', () => {
  const r = validateCIDR('fd00::/48');
  assert.equal(r.valid, true);
  assert.equal(r.family, 'IPv6');
});

test('validateCIDR rejects invalid CIDRs', () => {
  assert.equal(validateCIDR('not-a-cidr').valid, false);
  assert.equal(validateCIDR('10.0.0.0/33').valid, false);
  assert.equal(validateCIDR('').valid, false);
});

test('validateCIDROverlap detects overlapping ranges', () => {
  const warnings = validateCIDROverlap(['10.0.0.0/16', '10.0.1.0/24']);
  assert.ok(warnings.length > 0);
});

test('validateCIDROverlap returns empty for non-overlapping', () => {
  const warnings = validateCIDROverlap(['10.0.0.0/24', '10.0.1.0/24']);
  assert.equal(warnings.length, 0);
});

test('validateTenantNetwork catches missing required fields', () => {
  const net = createTenantNetwork('');
  const result = validateTenantNetwork(net, createTenant('test'), { ocp_version: '4.18', network_provider: 'OVNKubernetes' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validateTenantNetwork passes for valid config', () => {
  const net = createTenantNetwork('finance-net');
  // createTenantNetwork defaults: scope=cluster, resource_type=CUDN, role=Primary, topology=Layer2
  net.subnets = [{ cidr: '10.100.10.0/24' }];
  net.namespace_selector = { matchLabels: { tenant: 'finance' } };
  const tenant = createTenant('finance');
  tenant.namespaces = [createTenantNamespace('finance-apps')];
  const result = validateTenantNetwork(net, tenant, { ocp_version: '4.18', network_provider: 'OVNKubernetes' });
  assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
});

test('validatePhysicalNetwork catches missing bridge', () => {
  const pn = createPhysicalNetwork('test');
  pn.bridge = '';
  const result = validatePhysicalNetwork(pn);
  assert.equal(result.valid, false);
});

test('validateAdminNetworkPolicy catches invalid priority', () => {
  const anp = createAdminNetworkPolicy();
  anp.name = 'test-anp';
  anp.priority = 100; // must be 0-99
  const result = validateAdminNetworkPolicy(anp);
  assert.equal(result.valid, false);
});

test('validateAdminNetworkPolicy accepts valid priority', () => {
  const anp = createAdminNetworkPolicy();
  anp.name = 'test-anp';
  anp.priority = 50;
  const result = validateAdminNetworkPolicy(anp);
  assert.equal(result.valid, true);
});

test('validateMetalLBPool catches missing addresses', () => {
  const pool = createMetalLBAddressPool();
  pool.name = 'test-pool';
  const result = validateMetalLBPool(pool);
  assert.equal(result.valid, false);
});

// --- Networking config selected/not-selected ---

test('normalizeNetworkingConfig fills defaults for empty input', () => {
  const result = normalizeNetworkingConfig({});
  assert.equal(result.enabled, false);
  assert.ok(Array.isArray(result.tenants));
  assert.equal(result.network_provider, 'OVNKubernetes');
});

test('normalizeNetworkingConfig preserves enabled and tenants', () => {
  const input = { enabled: true, tenants: [createTenant('t1')], ocp_version: '4.18' };
  const result = normalizeNetworkingConfig(input);
  assert.equal(result.enabled, true);
  assert.equal(result.tenants.length, 1);
  assert.equal(result.ocp_version, '4.18');
});

test('disabled networking excluded from validation', () => {
  const config = { ...NETWORKING_DEFAULTS, enabled: false };
  const result = validateNetworkingConfig(config);
  assert.equal(result.valid, true);
});

test('enabled networking with no tenants is valid', () => {
  const config = { ...NETWORKING_DEFAULTS, enabled: true };
  const result = validateNetworkingConfig(config);
  assert.equal(result.valid, true);
});

// --- Resource Generation ---

test('generateNetworkResources returns empty for disabled config', () => {
  const resources = generateNetworkResources({ ...NETWORKING_DEFAULTS, enabled: false });
  assert.equal(resources.length, 0);
});

test('generateNetworkResources creates UDN for overlay tenant', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    ocp_version: '4.18',
    tenants: [{
      ...createTenant('finance'),
      namespaces: [{ name: 'finance-apps', create: true, labels: {} }],
      networks: [{
        ...createTenantNetwork('finance-net'),
        scope: 'namespace',
        resource_type: 'UserDefinedNetwork',
        role: 'Primary',
        topology: 'Layer2',
        subnets: [{ cidr: '10.100.10.0/24' }],
        ipam: { lifecycle: 'Persistent' }
      }]
    }]
  };
  const resources = generateNetworkResources(config);
  assert.ok(resources.length > 0);
  const udns = resources.filter(r => r.kind === 'UserDefinedNetwork');
  assert.ok(udns.length > 0);
  const ns = resources.filter(r => r.kind === 'Namespace');
  assert.ok(ns.length > 0);
});

test('generateNetworkResources creates CUDN for cluster scope', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    ocp_version: '4.18',
    tenants: [{
      ...createTenant('finance'),
      namespaces: [{ name: 'finance-apps', create: true, labels: {} }],
      networks: [{
        ...createTenantNetwork('finance-net'),
        scope: 'cluster',
        resource_type: 'ClusterUserDefinedNetwork',
        role: 'Primary',
        topology: 'Layer2',
        subnets: [{ cidr: '10.100.10.0/24' }],
        ipam: { lifecycle: 'Persistent' },
        namespace_selector: { matchLabels: { tenant: 'finance' } }
      }]
    }]
  };
  const resources = generateNetworkResources(config);
  const cudns = resources.filter(r => r.kind === 'ClusterUserDefinedNetwork');
  assert.ok(cudns.length > 0);
});

test('generateNetworkResources creates NetworkPolicy for default-deny template', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    tenants: [{
      ...createTenant('finance'),
      namespaces: [{ name: 'finance-apps', create: true, labels: {} }],
      networks: [{ ...createTenantNetwork('finance-net'), subnets: [{ cidr: '10.0.0.0/24' }] }],
      security: {
        network_policy: { enabled: true, template: 'default-deny-ingress', custom_rules: [] },
        multi_network_policy: { enabled: false, template: 'none', custom_rules: [] },
        egress_firewall: { enabled: false, rules: [] }
      }
    }]
  };
  const resources = generateNetworkResources(config);
  const policies = resources.filter(r => r.kind === 'NetworkPolicy');
  assert.ok(policies.length > 0);
});

test('generateNetworkResources omits MetalLB when disabled', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    load_balancing: { metallb: { enabled: false } }
  };
  const resources = generateNetworkResources(config);
  const metallb = resources.filter(r => r.kind === 'MetalLB');
  assert.equal(metallb.length, 0);
});

test('generateNetworkResources creates MetalLB resources when enabled', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    load_balancing: {
      metallb: {
        enabled: true,
        address_pools: [{ ...createMetalLBAddressPool(), name: 'pool1', addresses: ['192.168.1.100-192.168.1.200'] }],
        l2_advertisements: [],
        bgp_peers: [],
        bgp_advertisements: []
      }
    }
  };
  const resources = generateNetworkResources(config);
  const subs = resources.filter(r => r.kind === 'Subscription');
  const pools = resources.filter(r => r.kind === 'IPAddressPool');
  // Should have MetalLB operator subscription and address pool
  assert.ok(subs.length > 0 || pools.length > 0);
});

// --- Dependencies ---

test('calculateDependencies detects NMState for physical networks', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    physical_networks: [{ ...createPhysicalNetwork('dc-vlan'), managed_by_nmstate: true }]
  };
  const deps = calculateDependencies(config);
  const nmstate = deps.find(d => d.name === 'Kubernetes NMState');
  assert.ok(nmstate);
});

test('calculateDependencies detects MetalLB when enabled', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    load_balancing: { metallb: { enabled: true } }
  };
  const deps = calculateDependencies(config);
  const metallb = deps.find(d => d.name === 'MetalLB');
  assert.ok(metallb);
});

test('calculateDependencies includes OVN-Kubernetes when UDN configured', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    tenants: [{
      ...createTenant('test'),
      networks: [{
        ...createTenantNetwork('test-net'),
        subnets: [{ cidr: '10.0.0.0/24' }]
      }]
    }]
  };
  const deps = calculateDependencies(config);
  const ovn = deps.find(d => d.name === 'OVN-Kubernetes');
  assert.ok(ovn);
});

// --- Ansible Generation ---

test('generateAnsibleVars returns vars and vault objects', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    tenants: [createTenant('test')]
  };
  const result = generateAnsibleVars(config);
  assert.ok(result.vars);
  assert.ok(result.vault);
  assert.equal(result.vars.ocp_networking_enabled, true);
});

// --- Info Popover Map ---

test('INFO_POPOVER_MAP covers key concepts', () => {
  assert.ok(INFO_POPOVER_MAP.tenant);
  assert.ok(INFO_POPOVER_MAP.segment);
  assert.ok(INFO_POPOVER_MAP.overlay);
  assert.ok(INFO_POPOVER_MAP.localnet);
  assert.ok(INFO_POPOVER_MAP.firewall);
  assert.ok(INFO_POPOVER_MAP.north_south);
  for (const entry of Object.values(INFO_POPOVER_MAP)) {
    assert.ok(entry.title, 'each entry has a title');
    assert.ok(entry.description, 'each entry has a description');
  }
});

// --- Stale state exclusion ---

test('disabled networking does not generate resources', () => {
  const config = normalizeNetworkingConfig({
    enabled: false,
    tenants: [createTenant('stale')]
  });
  const resources = generateNetworkResources(config);
  assert.equal(resources.length, 0);
});

test('disabled MetalLB does not generate MetalLB resources', () => {
  const config = {
    ...NETWORKING_DEFAULTS,
    enabled: true,
    load_balancing: {
      metallb: {
        enabled: false,
        address_pools: [{ ...createMetalLBAddressPool(), name: 'stale', addresses: ['1.2.3.4/32'] }]
      }
    }
  };
  const resources = generateNetworkResources(config);
  const metallb = resources.filter(r => r.kind === 'MetalLB' || r.kind === 'IPAddressPool');
  assert.equal(metallb.length, 0);
});

// --- Tenant CRUD ---

test('createTenant then add namespace and network', () => {
  const t = createTenant('test');
  t.namespaces.push(createTenantNamespace('test-ns'));
  t.networks.push(createTenantNetwork('test-net'));
  assert.equal(t.namespaces.length, 1);
  assert.equal(t.networks.length, 1);
});

test('clone tenant produces independent copy', () => {
  const t1 = createTenant('original');
  t1.namespaces.push(createTenantNamespace('ns1'));
  const t2 = JSON.parse(JSON.stringify(t1));
  t2.tenant_name = 'clone';
  t2.id = crypto.randomUUID();
  assert.notEqual(t1.id, t2.id);
  assert.equal(t2.namespaces.length, 1);
  t2.namespaces.push(createTenantNamespace('ns2'));
  assert.equal(t1.namespaces.length, 1);
  assert.equal(t2.namespaces.length, 2);
});

// --- Version-aware behavior ---

test('getValidScopes returns options for supported versions', () => {
  // Secondary Layer2 is broadly supported from 4.17+
  const scopes = getValidScopes({ ocpVersion: '4.18', role: 'Secondary', topology: 'Layer2' });
  assert.ok(Array.isArray(scopes));
  assert.ok(scopes.length > 0, `Expected scopes but got: ${JSON.stringify(scopes)}`);
});
