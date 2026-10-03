/**
 * networkingSupport.mjs — OpenShift Networking support matrix, validation,
 * resource generation, and dependency calculation for ado-preflight-ui.
 *
 * Pure logic module — no React imports.  Consumed by NetworkingConfig.jsx,
 * App.jsx (payload/normalization), server.js (bootstrap generation), and tests.
 */

// ---------------------------------------------------------------------------
// 1. Constants & Defaults
// ---------------------------------------------------------------------------

/** Unique id helper (works in Node >=19 and modern browsers). */
const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Feature-support status labels. */
export const FEATURE_STATUS = Object.freeze({
  GA:          'GA',
  TP:          'TechPreview',
  DP:          'DevPreview',
  UNSUPPORTED: 'Unsupported',
  DEPRECATED:  'Deprecated',
});

/** Supported OCP version targets (4.18+). */
export const OCP_VERSION_OPTIONS = [
  { value: '4.18', label: '4.18' },
  { value: '4.19', label: '4.19' },
  { value: '4.20', label: '4.20' },
  { value: '4.21', label: '4.21' },
  { value: '4.22', label: '4.22' },
];

/** Default component_config.openshift_networking state. */
export const NETWORKING_DEFAULTS = {
  enabled: true,
  ocp_version: '4.18',
  network_provider: 'OVNKubernetes',

  tenants: [],

  cluster_security: {
    admin_network_policies: [],
    baseline_admin_network_policy: null,
  },

  physical_networks: [],

  ingress: {
    additional_ingress_controllers: [],
  },

  load_balancing: {
    metallb: {
      enabled: false,
      address_pools: [],
      l2_advertisements: [],
      bgp_peers: [],
      bgp_advertisements: [],
    },
  },
};

// ---------------------------------------------------------------------------
// 2. Factory functions
// ---------------------------------------------------------------------------

/** Create a new Tenant object. */
export function createTenant(name = '') {
  return {
    id: uid(),
    tenant_name: name,
    namespaces: [],
    networks: [],
    security: {
      network_policy: {
        enabled: false,
        template: 'none',
        pod_selector: {},
        custom_rules: [],
      },
      multi_network_policy: { enabled: false, template: 'none', pod_selector: {}, custom_rules: [] },
      egress_firewall: { enabled: false, rules: [] },
    },
    connectivity: {
      egress_ip: {
        enabled: false,
        addresses: [],
        namespace_selector: {},
        pod_selector: {},
      },
    },
  };
}

/** Create a TenantNamespace entry. */
export function createTenantNamespace(name = '') {
  return { name, create: true, labels: {} };
}

/** Create a TenantNetwork entry. */
export function createTenantNetwork(name = '') {
  return {
    id: uid(),
    name,
    scope: 'cluster',
    resource_type: 'ClusterUserDefinedNetwork',
    role: 'Primary',
    topology: 'Layer2',
    subnets: [],
    ipam: { lifecycle: '' },
    physical_network: null,
    namespace_selector: { matchLabels: {} },
    join_subnets: [],
  };
}

/** Create a Subnet entry. */
export function createSubnet(cidr = '') {
  return { cidr, host_subnet: 0 };
}

/** Create a PhysicalNetwork inventory item. */
export function createPhysicalNetwork(name = '') {
  return {
    id: uid(),
    name,
    physical_network_name: '',
    bridge: '',
    default_vlan: null,
    node_selector: {},
    managed_by_nmstate: true,
    interface_config: {
      type: 'bridge',
      interfaces: [],
      bond_mode: null,
    },
  };
}

/** Create a NetworkPolicy rule (ingress or egress). */
export function createNetworkPolicyRule() {
  return {
    direction: 'ingress',
    peers: [],
    ports: [],
  };
}

export function createPolicyPeer(type = 'ipBlock') {
  if (type === 'ipBlock') return { type: 'ipBlock', cidr: '', except: [] };
  if (type === 'clusterPods') return { type: 'clusterPods', namespace_selector: {}, pod_selector: {} };
  if (type === 'sameNamespace') return { type: 'sameNamespace', pod_selector: {} };
  return { type: 'ipBlock', cidr: '', except: [] };
}

export function createPolicyPort() {
  return { protocol: 'TCP', port: '', endPort: '' };
}

/** Create an AdminNetworkPolicy skeleton. */
export function createAdminNetworkPolicy() {
  return {
    id: uid(),
    name: '',
    priority: 0,
    subject: { namespace_selector: {} },
    ingress_rules: [],
    egress_rules: [],
  };
}

/** Create a single ANP rule entry. */
export function createAdminNetworkPolicyRule() {
  return {
    name: '',
    action: 'Allow',
    peer_type: 'namespace',
    namespace_selector: {},
    pod_selector: {},
    cidr: '',
    ports: [],
  };
}

/** Create an EgressFirewall rule. */
export function createEgressFirewallRule() {
  return {
    type: 'Allow',
    to_type: 'cidr',
    cidr_selector: '',
    dns_name: '',
    ports: [],
  };
}

export function createEgressFirewallPort() {
  return { protocol: 'TCP', port: '' };
}

/** Create a MetalLB IPAddressPool config. */
export function createMetalLBAddressPool() {
  return {
    id: uid(),
    name: '',
    protocol: 'layer2',
    addresses: [],
    auto_assign: true,
  };
}

/** Create a MetalLB BGPPeer config. */
export function createMetalLBBGPPeer() {
  return {
    id: uid(),
    name: '',
    peer_address: '',
    peer_asn: 0,
    local_asn: 0,
    peer_port: 179,
  };
}

// ---------------------------------------------------------------------------
// 3. NSX Concept Mapping (help-text reference)
// ---------------------------------------------------------------------------

export const INFO_POPOVER_MAP = {
  tenant: {
    title: 'Tenant Network',
    description:
      'A logical grouping of namespaces that share network segments, security policies, ' +
      'and connectivity. Each tenant can own one or more namespaces and define networks ' +
      'scoped to those namespaces or across the cluster.',
    vmware: 'Similar to a vSphere resource pool or NSX project — a boundary for organizing network resources.',
  },
  segment: {
    title: 'Network Segment',
    description:
      'A network segment is an isolated network domain created as a UserDefinedNetwork ' +
      '(namespace-scoped) or ClusterUserDefinedNetwork (cluster-scoped). Pods attached ' +
      'to the same segment can communicate at Layer 2 or Layer 3, depending on topology.',
    vmware: 'Similar to an NSX segment or vSphere port group — an isolated network that workloads connect to.',
  },
  overlay: {
    title: 'Overlay Network (Layer 2 / Layer 3)',
    description:
      'Overlay networks use GENEVE tunnels to extend a virtual network across cluster nodes. ' +
      'Layer 2 provides a flat broadcast domain; Layer 3 provides routed subnets with ' +
      'per-node host subnets for scalable IP management.',
    vmware: 'Like NSX overlay segments — virtual networks decoupled from the physical fabric using tunnel encapsulation.',
  },
  localnet: {
    title: 'Localnet (VLAN-Backed)',
    description:
      'Localnet maps an OVN logical network directly to a physical bridge and VLAN on each ' +
      'node. Use it when pods or VMs need direct connectivity to an external physical network. ' +
      'Requires NMState and a NodeNetworkConfigurationPolicy for bridge setup.',
    vmware: 'Like a vSphere VLAN-backed port group — maps directly to a physical VLAN for external connectivity.',
  },
  firewall: {
    title: 'Network Security Policy',
    description:
      'OpenShift provides three layers of network policy enforcement: AdminNetworkPolicy ' +
      '(cluster-admin, highest priority), namespace-level NetworkPolicy, and ' +
      'BaselineAdminNetworkPolicy (cluster-level fallback). Together they control ' +
      'east-west traffic between pods.',
    vmware: 'Like NSX Distributed Firewall rules — microsegmentation policies that control traffic between workloads.',
  },
  egress_firewall: {
    title: 'EgressFirewall',
    description:
      'EgressFirewall controls outbound traffic from pods in a namespace. Rules can allow ' +
      'or deny traffic to specific external CIDRs or DNS names, giving administrators ' +
      'control over what external endpoints workloads can reach.',
    vmware: 'Like NSX Gateway Firewall egress rules — controls what external destinations workloads can reach.',
  },
  physical_network: {
    title: 'Physical Network',
    description:
      'A physical network represents the underlying VLAN and bridge infrastructure on cluster ' +
      'nodes. Managed through Kubernetes NMState and NodeNetworkConfigurationPolicy, physical ' +
      'networks can be shared by multiple tenant Localnet segments.',
    vmware: 'Like vSphere vSwitch/dvSwitch uplink configuration — the physical network plumbing underneath.',
  },
  north_south: {
    title: 'North/South Connectivity',
    description:
      'North/south traffic flows between the cluster and external networks. OpenShift handles ' +
      'this through IngressControllers and Routes (inbound), EgressIP (deterministic source ' +
      'NAT for outbound), and MetalLB (bare-metal LoadBalancer services).',
    vmware: 'Like NSX Tier-0/Tier-1 gateway routing — handles traffic entering and leaving the cluster.',
  },
};

// ---------------------------------------------------------------------------
// 4. Support Matrix
// ---------------------------------------------------------------------------

/**
 * Compare OCP semver strings.
 * @param {string} a – e.g. '4.17'
 * @param {string} b – e.g. '4.18'
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
 */
function cmpVersion(a, b) {
  const pa = String(a || '0.0').split('.').map(Number);
  const pb = String(b || '0.0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `version >= minVersion`. */
function versionGte(version, minVersion) {
  return cmpVersion(version, minVersion) >= 0;
}

/**
 * Centralized support entries.  Each entry describes one feature combination
 * and the OCP version at which it became GA or TP.
 *
 * Fields that are `null` act as wildcards (match any value).
 */
const MATRIX_ENTRIES = [
  // --- UDN (namespace-scoped) — GA from 4.18 --------------------------------
  { resourceType: 'UserDefinedNetwork', role: 'Secondary', topology: 'Layer2',  minGA: '4.18' },
  { resourceType: 'UserDefinedNetwork', role: 'Secondary', topology: 'Layer3',  minGA: '4.18' },
  { resourceType: 'UserDefinedNetwork', role: 'Primary',   topology: 'Layer2',  minGA: '4.18' },
  { resourceType: 'UserDefinedNetwork', role: 'Primary',   topology: 'Layer3',  minGA: '4.18' },
  // UDN does NOT support Localnet
  { resourceType: 'UserDefinedNetwork', role: null,         topology: 'Localnet', minGA: null },

  // --- CUDN (cluster-scoped) ------------------------------------------------
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Secondary', topology: 'Layer2',   minGA: '4.18' },
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Secondary', topology: 'Layer3',   minGA: '4.18' },
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Secondary', topology: 'Localnet', minGA: '4.19' },
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Primary',   topology: 'Layer2',   minGA: '4.18' },
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Primary',   topology: 'Layer3',   minGA: '4.18' },
  // Primary Localnet not supported
  { resourceType: 'ClusterUserDefinedNetwork', role: 'Primary',   topology: 'Localnet', minGA: null },

  // --- NAD (always available, secondary only) --------------------------------
  { resourceType: 'NetworkAttachmentDefinition', role: 'Secondary', topology: 'Layer2',   minGA: '4.1' },
  { resourceType: 'NetworkAttachmentDefinition', role: 'Secondary', topology: 'Layer3',   minGA: '4.1' },
  { resourceType: 'NetworkAttachmentDefinition', role: 'Secondary', topology: 'Localnet', minGA: '4.1' },
  { resourceType: 'NetworkAttachmentDefinition', role: 'Primary',   topology: null,       minGA: null },

  // --- Policy types ---------------------------------------------------------
  { policyType: 'NetworkPolicy',              minGA: '4.1'  },
  { policyType: 'AdminNetworkPolicy',         minGA: '4.18' },
  { policyType: 'BaselineAdminNetworkPolicy',  minGA: '4.18' },
  { policyType: 'MultiNetworkPolicy',          minGA: '4.18' },
  { policyType: 'EgressFirewall',              minGA: '4.1'  },

  // --- Operators / infrastructure -------------------------------------------
  { feature: 'EgressIP',   minGA: '4.1'  },
  { feature: 'NMState',    minGA: '4.18' },
  { feature: 'MetalLB',    minGA: '4.18' },
];

/**
 * Query the support matrix for a single feature combination.
 *
 * @param {object} params
 * @param {string} params.ocpVersion     – e.g. '4.17'
 * @param {string} [params.resourceType] – UDN | CUDN | NAD
 * @param {string} [params.scope]        – namespace | cluster (informational, derived from resourceType)
 * @param {string} [params.role]         – Primary | Secondary
 * @param {string} [params.topology]     – Layer2 | Layer3 | Localnet
 * @param {string} [params.policyType]
 * @param {string} [params.feature]
 * @param {string} [params.networkProvider] – OVNKubernetes | OpenShiftSDN
 * @returns {{ supported: boolean, status: string, reason: string }}
 */
export function supportsFeature({
  ocpVersion = '4.18',
  resourceType,
  role,
  topology,
  policyType,
  feature,
  networkProvider = 'OVNKubernetes',
} = {}) {
  // UDN/CUDN hard-require OVN-Kubernetes
  if (
    resourceType &&
    resourceType !== 'NetworkAttachmentDefinition' &&
    networkProvider !== 'OVNKubernetes'
  ) {
    return {
      supported: false,
      status: FEATURE_STATUS.UNSUPPORTED,
      reason: `${resourceType} requires OVN-Kubernetes network provider.`,
    };
  }

  // Find the most specific matching entry
  const match = MATRIX_ENTRIES.find(entry => {
    if (entry.resourceType !== undefined && entry.resourceType !== resourceType) return false;
    if (entry.role         !== undefined && entry.role !== null && entry.role !== role) return false;
    if (entry.topology     !== undefined && entry.topology !== null && entry.topology !== topology) return false;
    if (entry.policyType   !== undefined && entry.policyType !== policyType) return false;
    if (entry.feature      !== undefined && entry.feature !== feature) return false;
    return true;
  });

  if (!match) {
    return {
      supported: false,
      status: FEATURE_STATUS.UNSUPPORTED,
      reason: 'No matching support entry found for this combination.',
    };
  }

  if (match.minGA && versionGte(ocpVersion, match.minGA)) {
    return { supported: true, status: FEATURE_STATUS.GA, reason: `GA since OCP ${match.minGA}.` };
  }

  return {
    supported: false,
    status: FEATURE_STATUS.UNSUPPORTED,
    reason: match.minGA
      ? `Requires OCP ${match.minGA}+. Currently targeting ${ocpVersion}.`
      : 'Not supported for this combination.',
  };
}

// ---------------------------------------------------------------------------
// 5. Helper queries derived from the matrix
// ---------------------------------------------------------------------------

/** Return valid topology options for the given combination. */
export function getValidTopologies({ ocpVersion = '4.18', resourceType, role, scope } = {}) {
  const rt = resourceType || resourceTypeFromScope(scope);
  const TOPO_META = {
    Layer2:   { label: 'Layer 2', description: 'Flat overlay network — all pods share a single broadcast domain across nodes' },
    Layer3:   { label: 'Layer 3', description: 'Routed overlay — each node gets a host subnet, traffic is routed between nodes' },
    Localnet: { label: 'Localnet', description: 'Maps to a physical bridge and VLAN on each node for external network access' },
  };
  const out = [];
  for (const topo of ['Layer2', 'Layer3', 'Localnet']) {
    const res = supportsFeature({ ocpVersion, resourceType: rt, role, topology: topo });
    if (res.supported) {
      out.push({ value: topo, ...TOPO_META[topo], status: res.status });
    }
  }
  return out;
}

/** Return valid role options for the given combination. */
export function getValidRoles({ ocpVersion = '4.18', resourceType, scope, topology } = {}) {
  const rt = resourceType || resourceTypeFromScope(scope);
  const ROLE_META = {
    Primary:   { label: 'Primary', description: 'Replaces the default cluster network for pods in the namespace' },
    Secondary: { label: 'Secondary', description: 'An additional network interface alongside the default pod network' },
  };
  const out = [];
  for (const r of ['Primary', 'Secondary']) {
    const res = supportsFeature({ ocpVersion, resourceType: rt, role: r, topology });
    if (res.supported) {
      out.push({ value: r, ...ROLE_META[r], status: res.status });
    }
  }
  return out;
}

/**
 * Return valid scope options.  Each entry carries the matching `resourceType`.
 */
export function getValidScopes({ ocpVersion = '4.18', role, topology } = {}) {
  const out = [];
  for (const [rt, label, scope] of [
    ['UserDefinedNetwork',        'Namespace (UDN)',   'namespace'],
    ['ClusterUserDefinedNetwork', 'Cluster (CUDN)',    'cluster'],
    ['NetworkAttachmentDefinition', 'NAD',             'namespace'],
  ]) {
    const res = supportsFeature({ ocpVersion, resourceType: rt, role, topology });
    if (res.supported) {
      out.push({ value: scope, label, resourceType: rt, status: res.status });
    }
  }
  return out;
}

/** Derive resourceType from scope string. */
function resourceTypeFromScope(scope) {
  if (scope === 'namespace') return 'UserDefinedNetwork';
  if (scope === 'cluster')   return 'ClusterUserDefinedNetwork';
  return 'UserDefinedNetwork';
}

/**
 * Can this network configuration support VM workloads?
 * For primary UDN: only Layer2 with Persistent IPAM (live-migration requirement).
 * For secondary: VMs can use NAD-based bridge / SR-IOV / secondary Layer2.
 */
export function isVmCompatible({ role, topology, ipam } = {}) {
  if (role === 'Secondary') return true;
  if (role === 'Primary') {
    const lifecycle = ipam?.lifecycle || '';
    return topology === 'Layer2' && (lifecycle === 'Persistent' || lifecycle === '');
  }
  return false;
}

/**
 * Does this role require the namespace label
 * `k8s.ovn.org/primary-user-defined-network: ""`?
 */
export function requiresNamespaceLabel({ role } = {}) {
  return role === 'Primary';
}

// ---------------------------------------------------------------------------
// 6. Dependency calculation
// ---------------------------------------------------------------------------

/**
 * Inspect a full networking config and return required infrastructure
 * dependencies.
 *
 * @param {object} config – the openshift_networking config object
 * @returns {Array<object>}
 */
export function calculateDependencies(config) {
  if (!config || !config.enabled) return [];

  const deps = [];
  const hasUdn = (config.tenants || []).some(t =>
    (t.networks || []).some(n =>
      n.resource_type === 'UserDefinedNetwork' ||
      n.resource_type === 'ClusterUserDefinedNetwork'
    )
  );

  if (hasUdn) {
    deps.push({
      name: 'OVN-Kubernetes',
      type: 'built-in',
      status: 'Required',
      reason: 'UDN/CUDN resources require OVN-Kubernetes network provider.',
    });
  }

  // NMState — needed when any physical network is managed
  const managedPhysical = (config.physical_networks || []).filter(pn => pn.managed_by_nmstate);
  if (managedPhysical.length > 0) {
    deps.push({
      name: 'Kubernetes NMState',
      type: 'operator',
      auto_selected: true,
      required_by: managedPhysical.map(pn => pn.name).filter(Boolean),
      namespace: 'openshift-nmstate',
      operator_name: 'kubernetes-nmstate-operator',
      operator_channel: 'stable',
      operator_source: 'redhat-operators',
      reason: `Required by physical network(s): ${managedPhysical.map(pn => pn.name || '(unnamed)').join(', ')}.`,
    });
  }

  // MetalLB
  if (config.load_balancing?.metallb?.enabled) {
    const pools = config.load_balancing.metallb.address_pools || [];
    deps.push({
      name: 'MetalLB',
      type: 'operator',
      auto_selected: true,
      required_by: pools.map(p => p.name).filter(Boolean),
      namespace: 'metallb-system',
      operator_name: 'metallb-operator',
      operator_channel: 'stable',
      operator_source: 'redhat-operators',
      reason: 'MetalLB provides bare-metal LoadBalancer services.',
    });
  }

  // OpenShift Virtualization consumer check (VM-compatible networks)
  const vmNetworks = [];
  for (const tenant of config.tenants || []) {
    for (const net of tenant.networks || []) {
      if (isVmCompatible(net)) {
        vmNetworks.push(net.name || '(unnamed)');
      }
    }
  }
  if (vmNetworks.length > 0) {
    deps.push({
      name: 'OpenShift Virtualization',
      type: 'operator',
      auto_selected: false,
      uses_networks: vmNetworks,
      namespace: 'openshift-cnv',
      operator_name: 'kubevirt-hyperconverged',
      reason: `VM-compatible network(s): ${vmNetworks.join(', ')}.`,
    });
  }

  return deps;
}

/**
 * Return a flat list of dependency operator names that must be installed.
 */
export function getRequiredDependencies(config) {
  return calculateDependencies(config).filter(d => d.type === 'operator' && d.auto_selected);
}

// ---------------------------------------------------------------------------
// 7. Validation helpers
// ---------------------------------------------------------------------------

const K8S_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

/** Validate a Kubernetes namespace name. */
export function validateNamespaceName(name) {
  const n = String(name || '').trim();
  if (!n) return { valid: false, error: 'Namespace name is required.' };
  if (n.length > 63) return { valid: false, error: 'Namespace name must not exceed 63 characters.' };
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n)) {
    return { valid: false, error: 'Must be lowercase alphanumeric or hyphens, start and end with alphanumeric.' };
  }
  return { valid: true, error: '' };
}

/** Validate a Kubernetes resource name. */
export function validateResourceName(name) {
  const n = String(name || '').trim();
  if (!n) return { valid: false, error: 'Resource name is required.' };
  if (n.length > 253) return { valid: false, error: 'Resource name must not exceed 253 characters.' };
  if (!K8S_NAME_RE.test(n)) {
    return { valid: false, error: 'Must be lowercase alphanumeric or hyphens, start and end with alphanumeric.' };
  }
  return { valid: true, error: '' };
}

// ---- IP / CIDR helpers ----------------------------------------------------

/**
 * Parse and validate a CIDR string.
 * @returns {{ valid: boolean, family?: string, network?: bigint, prefix?: number, error?: string }}
 */
export function validateCIDR(cidr) {
  const s = String(cidr || '').trim();
  if (!s) return { valid: false, error: 'CIDR is required.' };

  const slashIdx = s.lastIndexOf('/');
  if (slashIdx < 0) return { valid: false, error: 'Missing /prefix length.' };

  const addr = s.slice(0, slashIdx);
  const prefixStr = s.slice(slashIdx + 1);
  if (!/^\d{1,3}$/.test(prefixStr)) return { valid: false, error: 'Invalid prefix length.' };
  const prefix = parseInt(prefixStr, 10);

  // IPv4
  const ipv4Parts = addr.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every(p => /^\d{1,3}$/.test(p))) {
    const octets = ipv4Parts.map(Number);
    if (octets.some(o => o > 255)) return { valid: false, error: 'IPv4 octet out of range.' };
    if (prefix > 32) return { valid: false, error: 'IPv4 prefix must be 0-32.' };
    const network = octets.reduce((acc, o) => (acc << 8n) | BigInt(o), 0n);
    const mask = prefix === 0 ? 0n : (0xFFFFFFFFn >> BigInt(32 - prefix)) << BigInt(32 - prefix);
    return { valid: true, family: 'IPv4', network: network & mask, prefix, hostBits: 32 - prefix };
  }

  // IPv6 — expand :: and validate
  const expanded = expandIPv6(addr);
  if (!expanded) return { valid: false, error: 'Invalid IPv6 address.' };
  if (prefix > 128) return { valid: false, error: 'IPv6 prefix must be 0-128.' };

  const groups = expanded.split(':');
  let network = 0n;
  for (const g of groups) {
    network = (network << 16n) | BigInt(parseInt(g, 16));
  }
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) >> BigInt(128 - prefix) << BigInt(128 - prefix);
  return { valid: true, family: 'IPv6', network: network & mask, prefix, hostBits: 128 - prefix };
}

/** Expand an IPv6 address (handle ::). Returns null on invalid. */
function expandIPv6(addr) {
  if (!addr || typeof addr !== 'string') return null;
  let parts = addr.split('::');
  if (parts.length > 2) return null;
  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts.length === 2 ? (parts[1] ? parts[1].split(':') : []) : [];
  if (parts.length === 1 && left.length !== 8) return null;
  const fill = 8 - left.length - right.length;
  if (parts.length === 2 && fill < 0) return null;
  const groups = [...left, ...Array(parts.length === 2 ? fill : 0).fill('0'), ...right];
  if (groups.length !== 8) return null;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
  }
  return groups.map(g => g.padStart(4, '0')).join(':');
}

/**
 * Detect actual CIDR overlaps.
 * @param {string[]} cidrs
 * @returns {Array<{ a: string, b: string, warning: string }>}
 */
export function validateCIDROverlap(cidrs) {
  const warnings = [];
  const parsed = (cidrs || [])
    .map(c => ({ raw: c, ...validateCIDR(c) }))
    .filter(p => p.valid);

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (a.family !== b.family) continue;

      const bits = a.family === 'IPv4' ? 32 : 128;
      const shorter = Math.min(a.prefix, b.prefix);
      const mask = shorter === 0 ? 0n : ((1n << BigInt(bits)) - 1n) >> BigInt(bits - shorter) << BigInt(bits - shorter);

      if ((a.network & mask) === (b.network & mask)) {
        warnings.push({
          a: a.raw,
          b: b.raw,
          warning: `${a.raw} and ${b.raw} overlap.`,
        });
      }
    }
  }
  return warnings;
}

// ---- Composite validators -------------------------------------------------

/**
 * Validate the entire networking config.
 * @param {object} config
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validateNetworkingConfig(config) {
  const errors = [];
  if (!config) return { valid: true, errors };
  if (!config.enabled) return { valid: true, errors };

  if (config.network_provider !== 'OVNKubernetes') {
    const hasUdn = (config.tenants || []).some(t =>
      (t.networks || []).some(n =>
        n.resource_type !== 'NetworkAttachmentDefinition'
      )
    );
    if (hasUdn) {
      errors.push({ path: 'network_provider', message: 'UDN/CUDN resources require OVN-Kubernetes network provider.' });
    }
  }

  // Tenant validation
  const allTenants = config.tenants || [];
  const tenantNames = new Set();
  allTenants.forEach((tenant, ti) => {
    const tRes = validateTenant(tenant, allTenants, config);
    tRes.errors.forEach(e => errors.push({ ...e, path: `tenants[${ti}].${e.path}` }));

    const tName = (tenant.tenant_name || '').trim().toLowerCase();
    if (tName && tenantNames.has(tName)) {
      errors.push({ path: `tenants[${ti}].tenant_name`, message: `Duplicate tenant name: ${tName}.` });
    }
    tenantNames.add(tName);
  });

  // Cluster security
  for (const [ai, anp] of (config.cluster_security?.admin_network_policies || []).entries()) {
    const res = validateAdminNetworkPolicy(anp);
    res.errors.forEach(e => errors.push({ ...e, path: `cluster_security.admin_network_policies[${ai}].${e.path}` }));
  }

  // Physical networks
  for (const [pi, pn] of (config.physical_networks || []).entries()) {
    const res = validatePhysicalNetwork(pn);
    res.errors.forEach(e => errors.push({ ...e, path: `physical_networks[${pi}].${e.path}` }));
  }

  // MetalLB pools
  if (config.load_balancing?.metallb?.enabled) {
    for (const [mi, pool] of (config.load_balancing.metallb.address_pools || []).entries()) {
      const res = validateMetalLBPool(pool);
      res.errors.forEach(e => errors.push({ ...e, path: `load_balancing.metallb.address_pools[${mi}].${e.path}` }));
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a single Tenant. */
export function validateTenant(tenant, allTenants = [], config = {}) {
  const errors = [];
  if (!tenant) return { valid: false, errors: [{ path: '', message: 'Tenant is undefined.' }] };

  const name = (tenant.tenant_name || '').trim();
  if (!name) {
    errors.push({ path: 'tenant_name', message: 'Tenant name is required.' });
  } else {
    const res = validateResourceName(name);
    if (!res.valid) errors.push({ path: 'tenant_name', message: res.error });
  }

  // Namespaces
  const nsNames = new Set();
  for (const [ni, ns] of (tenant.namespaces || []).entries()) {
    const nsRes = validateNamespaceName(ns.name);
    if (!nsRes.valid) errors.push({ path: `namespaces[${ni}].name`, message: nsRes.error });
    const nsLower = (ns.name || '').trim().toLowerCase();
    if (nsLower && nsNames.has(nsLower)) {
      errors.push({ path: `namespaces[${ni}].name`, message: `Duplicate namespace: ${nsLower}.` });
    }
    nsNames.add(nsLower);
  }

  // Networks
  for (const [netIdx, net] of (tenant.networks || []).entries()) {
    const nRes = validateTenantNetwork(net, tenant, config);
    nRes.errors.forEach(e => errors.push({ ...e, path: `networks[${netIdx}].${e.path}` }));
  }

  // EgressFirewall: max 1 per namespace
  if (tenant.security?.egress_firewall?.enabled) {
    const fwNamespaces = (tenant.namespaces || []).map(ns => ns.name);
    if (fwNamespaces.length > 1) {
      // Warn — EgressFirewall is one-per-namespace; one config is applied across the tenant.
      // This is valid but worth noting.
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a single TenantNetwork. */
export function validateTenantNetwork(network, tenant = {}, config = {}) {
  const errors = [];
  if (!network) return { valid: false, errors: [{ path: '', message: 'Network is undefined.' }] };

  const nameRes = validateResourceName(network.name);
  if (!nameRes.valid) errors.push({ path: 'name', message: nameRes.error });

  // Support matrix check
  const ocpVersion = config.ocp_version || '4.18';
  const sup = supportsFeature({
    ocpVersion,
    resourceType: network.resource_type,
    role: network.role,
    topology: network.topology,
    networkProvider: config.network_provider || 'OVNKubernetes',
  });
  if (!sup.supported) {
    errors.push({ path: 'topology', message: sup.reason });
  }

  // Subnets
  if (!network.subnets || network.subnets.length === 0) {
    // Layer2 secondary can have zero subnets
    if (network.role === 'Primary' || network.topology === 'Layer3') {
      errors.push({ path: 'subnets', message: 'At least one subnet is required for this configuration.' });
    }
  } else {
    const cidrStrings = [];
    for (const [si, sub] of network.subnets.entries()) {
      const cRes = validateCIDR(sub.cidr);
      if (!cRes.valid) {
        errors.push({ path: `subnets[${si}].cidr`, message: cRes.error });
      } else {
        cidrStrings.push(sub.cidr);
      }
      // Layer3 host_subnet validation
      if (network.topology === 'Layer3' && sub.host_subnet > 0) {
        if (cRes.valid && sub.host_subnet >= (cRes.hostBits || 0)) {
          errors.push({ path: `subnets[${si}].host_subnet`, message: 'Host subnet prefix must be smaller than the CIDR prefix size.' });
        }
      }
    }
    // Overlap check within this network
    const overlaps = validateCIDROverlap(cidrStrings);
    overlaps.forEach(o => errors.push({ path: 'subnets', message: o.warning }));
  }


  // Localnet must reference a physical network
  if (network.topology === 'Localnet' && !network.physical_network) {
    errors.push({ path: 'physical_network', message: 'Localnet topology requires a physical network reference.' });
  }

  // Primary namespace label reminder (not an error, just structural)
  // Handled at namespace level in resource generation

  return { valid: errors.length === 0, errors };
}

/** Validate a PhysicalNetwork. */
export function validatePhysicalNetwork(pn) {
  const errors = [];
  if (!pn) return { valid: false, errors: [{ path: '', message: 'Physical network is undefined.' }] };

  const nameRes = validateResourceName(pn.name || '');
  if (!nameRes.valid) errors.push({ path: 'name', message: nameRes.error });

  if (!String(pn.physical_network_name || '').trim()) {
    errors.push({ path: 'physical_network_name', message: 'OVN physical network name is required.' });
  }
  if (!String(pn.bridge || '').trim()) {
    errors.push({ path: 'bridge', message: 'Bridge name is required for physical connectivity.' });
  }
  if (pn.default_vlan !== null && pn.default_vlan !== undefined && pn.default_vlan !== '') {
    const vlan = Number(pn.default_vlan);
    if (!Number.isInteger(vlan) || vlan < 0 || vlan > 4094) {
      errors.push({ path: 'default_vlan', message: 'VLAN ID must be 0-4094.' });
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Validate an AdminNetworkPolicy. */
export function validateAdminNetworkPolicy(anp) {
  const errors = [];
  if (!anp) return { valid: false, errors: [{ path: '', message: 'Policy is undefined.' }] };

  const nameRes = validateResourceName(anp.name || '');
  if (!nameRes.valid) errors.push({ path: 'name', message: nameRes.error });

  const pri = Number(anp.priority);
  if (!Number.isInteger(pri) || pri < 0 || pri > 99) {
    errors.push({ path: 'priority', message: 'AdminNetworkPolicy priority must be an integer 0-99.' });
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a MetalLB address pool. */
export function validateMetalLBPool(pool) {
  const errors = [];
  if (!pool) return { valid: false, errors: [{ path: '', message: 'Pool is undefined.' }] };

  const nameRes = validateResourceName(pool.name || '');
  if (!nameRes.valid) errors.push({ path: 'name', message: nameRes.error });

  if (!pool.addresses || pool.addresses.length === 0) {
    errors.push({ path: 'addresses', message: 'At least one address range is required.' });
  } else {
    for (const [ai, addr] of pool.addresses.entries()) {
      const a = String(addr || '').trim();
      if (!a) {
        errors.push({ path: `addresses[${ai}]`, message: 'Address entry is empty.' });
        continue;
      }
      // Accept CIDR or range (start-end)
      if (a.includes('/')) {
        const res = validateCIDR(a);
        if (!res.valid) errors.push({ path: `addresses[${ai}]`, message: res.error });
      } else if (a.includes('-')) {
        const [startStr, endStr] = a.split('-').map(s => s.trim());
        if (!startStr || !endStr) {
          errors.push({ path: `addresses[${ai}]`, message: 'Range must be start-end (e.g. 192.168.1.10-192.168.1.20).' });
        }
      } else {
        // Single IP — treat as /32 CIDR for validation
        const res = validateCIDR(`${a}/32`);
        if (!res.valid) errors.push({ path: `addresses[${ai}]`, message: `Invalid IP address: ${a}` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 8. Resource generation
// ---------------------------------------------------------------------------

/**
 * Generate Kubernetes/OpenShift resource manifests from the networking config.
 *
 * @param {object} config – the openshift_networking config object
 * @returns {Array<object>} – array of resource objects with _category and _source
 */
export function generateNetworkResources(config) {
  if (!config || !config.enabled) return [];

  const resources = [];

  // --- Per-tenant resources ---
  for (const tenant of config.tenants || []) {
    const tenantLabel = tenant.tenant_name || 'unknown';
    const tenantStartIdx = resources.length;

    // Namespaces
    for (const ns of tenant.namespaces || []) {
      if (!ns.create) continue;
      const labels = { ...(ns.labels || {}), tenant: tenantLabel };
      // Check if any network in this tenant is Primary and needs the namespace label
      const needsPrimaryLabel = (tenant.networks || []).some(n => n.role === 'Primary');
      if (needsPrimaryLabel) {
        labels['k8s.ovn.org/primary-user-defined-network'] = '';
      }
      resources.push({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: ns.name,
          labels,
        },
        _category: 'Namespaces',
        _source: `Tenant: ${tenantLabel}`,
      });
    }

    // Networks
    for (const net of tenant.networks || []) {
      const netSource = `Tenant: ${tenantLabel} / Network: ${net.name || '(unnamed)'}`;

      if (net.resource_type === 'UserDefinedNetwork') {
        // One UDN per namespace
        for (const ns of tenant.namespaces || []) {
          resources.push(buildUDN(net, ns.name, netSource));
        }
      } else if (net.resource_type === 'ClusterUserDefinedNetwork') {
        resources.push(buildCUDN(net, tenantLabel, netSource));
      } else if (net.resource_type === 'NetworkAttachmentDefinition') {
        for (const ns of tenant.namespaces || []) {
          resources.push(buildNAD(net, ns.name, config, netSource));
        }
      }
    }

    // Security — NetworkPolicy
    if (tenant.security?.network_policy?.enabled) {
      const template = tenant.security.network_policy.template || 'none';
      for (const ns of tenant.namespaces || []) {
        const policies = buildNetworkPolicies(template, tenant, ns.name, config);
        policies.forEach(p => {
          p._source = `Tenant: ${tenantLabel} / Namespace: ${ns.name}`;
          resources.push(p);
        });
      }
    }

    // Security — MultiNetworkPolicy
    if (tenant.security?.multi_network_policy?.enabled) {
      const mnpTemplate = tenant.security.multi_network_policy.template || 'none';
      const networkName = (tenant.networks || [])[0]?.name || '';
      for (const ns of tenant.namespaces || []) {
        const mnpPolicies = buildMultiNetworkPolicies(mnpTemplate, tenant, ns.name, networkName);
        mnpPolicies.forEach(p => {
          p._source = `Tenant: ${tenantLabel} / Namespace: ${ns.name}`;
          resources.push(p);
        });
      }
    }

    // Security — EgressFirewall
    if (tenant.security?.egress_firewall?.enabled) {
      for (const ns of tenant.namespaces || []) {
        const fwRules = (tenant.security.egress_firewall.rules || []).map(rule => {
          const spec = { type: rule.type };
          if (rule.to_type === 'cidr') spec.to = { cidrSelector: rule.cidr_selector };
          if (rule.to_type === 'dns')  spec.to = { dnsName: rule.dns_name };
          const ports = (rule.ports || []).filter(p => p.port).map(p => {
            const entry = { protocol: p.protocol || 'TCP', port: isNaN(p.port) ? p.port : Number(p.port) };
            return entry;
          });
          if (ports.length > 0) spec.ports = ports;
          return spec;
        });
        if (fwRules.length > 0) {
          resources.push({
            apiVersion: 'k8s.ovn.org/v1',
            kind: 'EgressFirewall',
            metadata: { name: 'default', namespace: ns.name },
            spec: { egress: fwRules },
            _category: 'Security',
            _source: `Tenant: ${tenantLabel}`,
          });
        }
      }
    }

    // Connectivity — EgressIP
    if (tenant.connectivity?.egress_ip?.enabled) {
      const eip = tenant.connectivity.egress_ip;
      resources.push({
        apiVersion: 'k8s.ovn.org/v1',
        kind: 'EgressIP',
        metadata: { name: `${tenantLabel}-egressip` },
        spec: {
          egressIPs: eip.addresses || [],
          namespaceSelector: {
            matchLabels: { tenant: tenantLabel, ...(eip.namespace_selector || {}) },
          },
          ...(eip.pod_selector && Object.keys(eip.pod_selector).length > 0
            ? { podSelector: { matchLabels: eip.pod_selector } }
            : {}),
        },
        _category: 'Connectivity',
        _source: `Tenant: ${tenantLabel}`,
      });
    }

    for (let i = tenantStartIdx; i < resources.length; i++) {
      resources[i]._tenant = tenantLabel;
    }
  }

  // --- Cluster security ---
  for (const anp of config.cluster_security?.admin_network_policies || []) {
    resources.push(buildAdminNetworkPolicy(anp));
  }
  if (config.cluster_security?.baseline_admin_network_policy) {
    resources.push(buildBaselineAdminNetworkPolicy(config.cluster_security.baseline_admin_network_policy));
  }

  // --- Physical networks (NMState + NNCP) ---
  const needsNmstate = (config.physical_networks || []).some(pn => pn.managed_by_nmstate);
  if (needsNmstate) {
    resources.push({
      apiVersion: 'operators.coreos.com/v1',
      kind: 'OperatorGroup',
      metadata: { name: 'openshift-nmstate', namespace: 'openshift-nmstate' },
      spec: { targetNamespaces: ['openshift-nmstate'] },
      _category: 'Operator Dependencies',
      _source: 'NMState Operator',
    });
    resources.push({
      apiVersion: 'operators.coreos.com/v1alpha1',
      kind: 'Subscription',
      metadata: { name: 'kubernetes-nmstate-operator', namespace: 'openshift-nmstate' },
      spec: {
        channel: 'stable',
        name: 'kubernetes-nmstate-operator',
        source: 'redhat-operators',
        sourceNamespace: 'openshift-marketplace',
      },
      _category: 'Operator Dependencies',
      _source: 'NMState Operator',
    });
    resources.push({
      apiVersion: 'nmstate.io/v1',
      kind: 'NMState',
      metadata: { name: 'nmstate' },
      spec: {},
      _category: 'Physical Networking',
      _source: 'NMState instance',
    });
  }

  for (const pn of config.physical_networks || []) {
    if (!pn.managed_by_nmstate) continue;
    resources.push(buildNNCP(pn));
  }

  // --- MetalLB ---
  if (config.load_balancing?.metallb?.enabled) {
    const mlb = config.load_balancing.metallb;
    // Operator
    resources.push({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'metallb-system' },
      _category: 'Operator Dependencies',
      _source: 'MetalLB Operator',
    });
    resources.push({
      apiVersion: 'operators.coreos.com/v1',
      kind: 'OperatorGroup',
      metadata: { name: 'metallb-operator', namespace: 'metallb-system' },
      spec: { targetNamespaces: ['metallb-system'] },
      _category: 'Operator Dependencies',
      _source: 'MetalLB Operator',
    });
    resources.push({
      apiVersion: 'operators.coreos.com/v1alpha1',
      kind: 'Subscription',
      metadata: { name: 'metallb-operator', namespace: 'metallb-system' },
      spec: {
        channel: 'stable',
        name: 'metallb-operator',
        source: 'redhat-operators',
        sourceNamespace: 'openshift-marketplace',
      },
      _category: 'Operator Dependencies',
      _source: 'MetalLB Operator',
    });
    resources.push({
      apiVersion: 'metallb.io/v1beta1',
      kind: 'MetalLB',
      metadata: { name: 'metallb', namespace: 'metallb-system' },
      spec: {},
      _category: 'Connectivity',
      _source: 'MetalLB instance',
    });

    // Address pools
    for (const pool of mlb.address_pools || []) {
      resources.push({
        apiVersion: 'metallb.io/v1beta1',
        kind: 'IPAddressPool',
        metadata: { name: pool.name, namespace: 'metallb-system' },
        spec: {
          addresses: pool.addresses || [],
          autoAssign: pool.auto_assign !== false,
        },
        _category: 'Connectivity',
        _source: `MetalLB pool: ${pool.name}`,
      });
    }

    // L2 advertisements
    for (const adv of mlb.l2_advertisements || []) {
      resources.push({
        apiVersion: 'metallb.io/v1beta1',
        kind: 'L2Advertisement',
        metadata: { name: adv.name || 'l2-adv', namespace: 'metallb-system' },
        spec: {
          ipAddressPools: adv.pools || [],
        },
        _category: 'Connectivity',
        _source: 'MetalLB L2 Advertisement',
      });
    }

    // BGP peers
    for (const peer of mlb.bgp_peers || []) {
      resources.push({
        apiVersion: 'metallb.io/v1beta2',
        kind: 'BGPPeer',
        metadata: { name: peer.name, namespace: 'metallb-system' },
        spec: {
          myASN: peer.local_asn,
          peerASN: peer.peer_asn,
          peerAddress: peer.peer_address,
          ...(peer.peer_port !== 179 ? { peerPort: peer.peer_port } : {}),
        },
        _category: 'Connectivity',
        _source: `MetalLB BGP peer: ${peer.name}`,
      });
    }

    // BGP advertisements
    for (const adv of mlb.bgp_advertisements || []) {
      resources.push({
        apiVersion: 'metallb.io/v1beta1',
        kind: 'BGPAdvertisement',
        metadata: { name: adv.name || 'bgp-adv', namespace: 'metallb-system' },
        spec: {
          ipAddressPools: adv.pools || [],
        },
        _category: 'Connectivity',
        _source: 'MetalLB BGP Advertisement',
      });
    }
  }

  return resources;
}

// ---- Resource builder helpers ---------------------------------------------

function buildTopologySpec(net) {
  const topoKey = net.topology === 'Layer3' ? 'layer3'
    : net.topology === 'Localnet' ? 'localnet' : 'layer2';
  const spec = { role: net.role };

  if (net.topology === 'Layer3') {
    const subnets = (net.subnets || []).filter(s => s.cidr).map(s => {
      const sub = { cidr: s.cidr };
      if (s.host_subnet) sub.hostSubnet = s.host_subnet;
      return sub;
    });
    if (subnets.length > 0) spec.subnets = subnets;
  } else {
    const subnets = (net.subnets || []).filter(s => s.cidr).map(s => s.cidr);
    if (subnets.length > 0) spec.subnets = subnets;
  }

  if (net.ipam?.lifecycle === 'Persistent') {
    spec.ipamLifecycle = 'Persistent';
  }

  if (net.topology === 'Layer3' && net.join_subnets?.length > 0) {
    spec.joinSubnets = net.join_subnets.filter(Boolean);
  }

  if (net.topology === 'Localnet' && net.physical_network) {
    spec.physicalNetworkName = net.physical_network;
  }

  return { topology: net.topology, [topoKey]: spec };
}

function buildUDN(net, namespace, source) {
  const spec = buildTopologySpec(net);
  return {
    apiVersion: 'k8s.ovn.org/v1',
    kind: 'UserDefinedNetwork',
    metadata: { name: net.name, namespace },
    spec,
    _category: 'Logical Networks',
    _source: source,
  };
}

function buildCUDN(net, tenantName, source) {
  const topoSpec = buildTopologySpec(net);
  const nsSelector = net.namespace_selector && Object.keys(net.namespace_selector.matchLabels || {}).length > 0
    ? net.namespace_selector
    : { matchLabels: { tenant: tenantName } };

  return {
    apiVersion: 'k8s.ovn.org/v1',
    kind: 'ClusterUserDefinedNetwork',
    metadata: { name: net.name },
    spec: {
      namespaceSelector: nsSelector,
      network: topoSpec,
    },
    _category: 'Logical Networks',
    _source: source,
  };
}

function buildNAD(net, namespace, config, source) {
  // For Localnet NADs referencing a physical network
  const physNet = net.physical_network
    ? (config.physical_networks || []).find(pn => pn.id === net.physical_network || pn.name === net.physical_network)
    : null;

  const nadConfig = {
    cniVersion: '0.3.1',
    name: net.name,
    type: 'ovn-k8s-cni-overlay',
    topology: net.topology === 'Localnet' ? 'localnet' : (net.topology || 'layer2').toLowerCase(),
    ...(physNet ? { netAttachDefName: `${namespace}/${net.name}` } : {}),
  };

  if (net.subnets?.length > 0) {
    nadConfig.subnets = net.subnets.filter(s => s.cidr).map(s => s.cidr).join(',');
  }

  return {
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: { name: net.name, namespace },
    spec: { config: JSON.stringify(nadConfig) },
    _category: 'Logical Networks',
    _source: source,
  };
}

function buildPeerList(peers) {
  const result = [];
  for (const peer of (peers || [])) {
    if (peer.type === 'ipBlock' && peer.cidr) {
      const entry = { ipBlock: { cidr: peer.cidr } };
      if (peer.except?.length > 0) entry.ipBlock.except = peer.except;
      result.push(entry);
    } else if (peer.type === 'clusterPods') {
      const entry = {};
      if (peer.namespace_selector && Object.keys(peer.namespace_selector).length > 0) {
        entry.namespaceSelector = { matchLabels: peer.namespace_selector };
      } else {
        entry.namespaceSelector = {};
      }
      if (peer.pod_selector && Object.keys(peer.pod_selector).length > 0) {
        entry.podSelector = { matchLabels: peer.pod_selector };
      }
      result.push(entry);
    } else if (peer.type === 'sameNamespace') {
      const entry = {};
      if (peer.pod_selector && Object.keys(peer.pod_selector).length > 0) {
        entry.podSelector = { matchLabels: peer.pod_selector };
      } else {
        entry.podSelector = {};
      }
      result.push(entry);
    }
  }
  return result;
}

function buildPortList(ports) {
  const result = [];
  for (const p of (ports || [])) {
    if (p.port) {
      const portEntry = { protocol: p.protocol || 'TCP', port: isNaN(p.port) ? p.port : Number(p.port) };
      if (p.endPort) portEntry.endPort = Number(p.endPort);
      result.push(portEntry);
    }
  }
  return result;
}

function buildNetworkPolicies(template, tenant, namespace, _config) {
  const tenantLabel = tenant.tenant_name || 'unknown';
  const policies = [];

  if (template === 'none') return policies;

  if (template === 'default-deny-ingress') {
    policies.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${tenantLabel}-default-deny`, namespace },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
      },
      _category: 'Security',
    });
  }

  if (template === 'default-deny-all') {
    policies.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${tenantLabel}-default-deny-all`, namespace },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
      },
      _category: 'Security',
    });
  }

  if (template === 'allow-same-tenant') {
    // Deny all first
    policies.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${tenantLabel}-default-deny`, namespace },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
      },
      _category: 'Security',
    });
    // Allow from same tenant
    policies.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${tenantLabel}-allow-same-tenant`, namespace },
      spec: {
        podSelector: {},
        ingress: [{
          from: [{ namespaceSelector: { matchLabels: { tenant: tenantLabel } } }],
        }],
        policyTypes: ['Ingress'],
      },
      _category: 'Security',
    });
  }

  if (template === 'allow-from-namespaces') {
    policies.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${tenantLabel}-default-deny`, namespace },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
      },
      _category: 'Security',
    });
    // Custom from-namespace rules would go here from the security config
  }

  if (template === 'custom') {
    const customRules = tenant.security?.network_policy?.custom_rules || [];
    const podSelector = tenant.security?.network_policy?.pod_selector || {};
    if (customRules.length > 0) {
      const ingress = [];
      const egress = [];
      for (const rule of customRules) {
        const from_to = buildPeerList(rule.peers);
        const ports = buildPortList(rule.ports);

        if (rule.direction === 'ingress') {
          const r = {};
          if (from_to.length > 0) r.from = from_to;
          if (ports.length > 0) r.ports = ports;
          ingress.push(r);
        } else {
          const r = {};
          if (from_to.length > 0) r.to = from_to;
          if (ports.length > 0) r.ports = ports;
          egress.push(r);
        }
      }

      const policyTypes = [];
      if (ingress.length > 0) policyTypes.push('Ingress');
      if (egress.length > 0) policyTypes.push('Egress');

      policies.push({
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: { name: `${tenantLabel}-custom`, namespace },
        spec: {
          podSelector: Object.keys(podSelector).length > 0 ? { matchLabels: podSelector } : {},
          policyTypes,
          ...(ingress.length > 0 ? { ingress } : {}),
          ...(egress.length > 0 ? { egress } : {}),
        },
        _category: 'Security',
      });
    }
  }

  return policies;
}

function buildMultiNetworkPolicies(template, tenant, namespace, networkName) {
  const tenantLabel = tenant.tenant_name || 'unknown';
  const policies = [];
  const annotations = { 'k8s.v1.cni.cncf.io/policy-for': `${namespace}/${networkName}` };

  if (template === 'none') return policies;

  if (template === 'default-deny-ingress') {
    policies.push({
      apiVersion: 'k8s.cni.cncf.io/v1beta1',
      kind: 'MultiNetworkPolicy',
      metadata: { name: `${tenantLabel}-mnp-default-deny`, namespace, annotations },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress'],
      },
      _category: 'Security',
    });
  }

  if (template === 'default-deny-all') {
    policies.push({
      apiVersion: 'k8s.cni.cncf.io/v1beta1',
      kind: 'MultiNetworkPolicy',
      metadata: { name: `${tenantLabel}-mnp-default-deny-all`, namespace, annotations },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
      },
      _category: 'Security',
    });
  }

  if (template === 'custom') {
    const customRules = tenant.security?.multi_network_policy?.custom_rules || [];
    const podSelector = tenant.security?.multi_network_policy?.pod_selector || {};
    if (customRules.length > 0) {
      const ingress = [];
      const egress = [];
      for (const rule of customRules) {
        const from_to = buildPeerList(rule.peers);
        const ports = buildPortList(rule.ports);

        if (rule.direction === 'ingress') {
          const r = {};
          if (from_to.length > 0) r.from = from_to;
          if (ports.length > 0) r.ports = ports;
          ingress.push(r);
        } else {
          const r = {};
          if (from_to.length > 0) r.to = from_to;
          if (ports.length > 0) r.ports = ports;
          egress.push(r);
        }
      }

      const policyTypes = [];
      if (ingress.length > 0) policyTypes.push('Ingress');
      if (egress.length > 0) policyTypes.push('Egress');

      policies.push({
        apiVersion: 'k8s.cni.cncf.io/v1beta1',
        kind: 'MultiNetworkPolicy',
        metadata: { name: `${tenantLabel}-mnp-custom`, namespace, annotations },
        spec: {
          podSelector: Object.keys(podSelector).length > 0 ? { matchLabels: podSelector } : {},
          policyTypes,
          ...(ingress.length > 0 ? { ingress } : {}),
          ...(egress.length > 0 ? { egress } : {}),
        },
        _category: 'Security',
      });
    }
  }

  return policies;
}

function buildAdminNetworkPolicy(anp) {
  const spec = {
    priority: Number(anp.priority) || 0,
    subject: {
      namespaces: {
        matchLabels: anp.subject?.namespace_selector || {},
      },
    },
  };

  const mapRule = rule => {
    const r = {
      name: rule.name || '',
      action: rule.action || 'Allow',
      ...(rule.peer_type === 'namespace'
        ? { from: [{ namespaces: { matchLabels: rule.namespace_selector || {} } }] }
        : rule.peer_type === 'cidr'
        ? { from: [{ networks: [rule.cidr] }] }
        : {}),
    };
    if (rule.ports?.length > 0) {
      r.ports = rule.ports.map(p => ({
        portNumber: { protocol: p.protocol || 'TCP', port: Number(p.port) },
      }));
    }
    return r;
  };

  if (anp.ingress_rules?.length > 0) {
    spec.ingress = anp.ingress_rules.map(mapRule);
  }
  if (anp.egress_rules?.length > 0) {
    spec.egress = anp.egress_rules.map(r => {
      const mapped = mapRule(r);
      // swap from→to for egress
      if (mapped.from) { mapped.to = mapped.from; delete mapped.from; }
      return mapped;
    });
  }

  return {
    apiVersion: 'policy.networking.k8s.io/v1alpha1',
    kind: 'AdminNetworkPolicy',
    metadata: { name: anp.name },
    spec,
    _category: 'Security',
    _source: `Cluster policy: ${anp.name}`,
  };
}

function buildBaselineAdminNetworkPolicy(banp) {
  const spec = {
    subject: {
      namespaces: {
        matchLabels: banp.subject?.namespace_selector || {},
      },
    },
  };

  if (banp.ingress_rules?.length > 0) {
    spec.ingress = banp.ingress_rules.map(r => ({
      name: r.name || '',
      action: r.action || 'Deny',
      from: [r.peer_type === 'cidr'
        ? { networks: [r.cidr] }
        : { namespaces: { matchLabels: r.namespace_selector || {} } }
      ],
    }));
  }
  if (banp.egress_rules?.length > 0) {
    spec.egress = banp.egress_rules.map(r => ({
      name: r.name || '',
      action: r.action || 'Deny',
      to: [r.peer_type === 'cidr'
        ? { networks: [r.cidr] }
        : { namespaces: { matchLabels: r.namespace_selector || {} } }
      ],
    }));
  }

  return {
    apiVersion: 'policy.networking.k8s.io/v1alpha1',
    kind: 'BaselineAdminNetworkPolicy',
    metadata: { name: 'default' },
    spec,
    _category: 'Security',
    _source: 'Cluster baseline policy',
  };
}

function buildNNCP(pn) {
  const interfaces = [];
  const bridgeName = pn.bridge || 'br1';

  if (pn.interface_config?.type === 'bridge') {
    const bridge = {
      name: bridgeName,
      type: 'linux-bridge',
      state: 'up',
      bridge: {
        options: { 'stp': { enabled: false } },
        port: (pn.interface_config.interfaces || []).map(iface => ({ name: iface })),
      },
    };
    if (pn.default_vlan !== null && pn.default_vlan !== undefined && pn.default_vlan !== '') {
      // VLAN filtering on bridge ports
    }
    interfaces.push(bridge);
  } else if (pn.interface_config?.type === 'bond') {
    interfaces.push({
      name: `${bridgeName}-bond`,
      type: 'bond',
      state: 'up',
      'link-aggregation': {
        mode: pn.interface_config.bond_mode || 'balance-rr',
        port: (pn.interface_config.interfaces || []).map(iface => ({ name: iface })),
      },
    });
    interfaces.push({
      name: bridgeName,
      type: 'linux-bridge',
      state: 'up',
      bridge: {
        options: { 'stp': { enabled: false } },
        port: [{ name: `${bridgeName}-bond` }],
      },
    });
  }

  // OVN bridge mapping
  const ovnMapping = `${pn.physical_network_name || pn.name}:${bridgeName}`;

  const desiredState = { interfaces };

  // Only include ovn-bridge-mappings when there's a physical network name
  if (pn.physical_network_name) {
    desiredState['ovn'] = {
      'bridge-mappings': [{
        localnet: pn.physical_network_name,
        bridge: bridgeName,
        state: 'present',
      }],
    };
  }

  const resource = {
    apiVersion: 'nmstate.io/v1',
    kind: 'NodeNetworkConfigurationPolicy',
    metadata: { name: `${pn.name}-nncp` },
    spec: {
      desiredState,
    },
    _category: 'Physical Networking',
    _source: `Physical network: ${pn.name}`,
    _warning: 'Incorrect NNCP configuration can disrupt node connectivity. Review carefully before applying.',
  };

  if (pn.node_selector && Object.keys(pn.node_selector).length > 0) {
    resource.spec.nodeSelector = pn.node_selector;
  }

  return resource;
}

// ---------------------------------------------------------------------------
// 9. Ansible generation helper
// ---------------------------------------------------------------------------

/**
 * Generate Ansible vars and vault variables for the openshift_networking
 * component.  Consumed by bootstrap_generate_env_vars templates.
 *
 * @param {object} config – openshift_networking config
 * @returns {{ vars: object, vault: object }}
 */
export function generateAnsibleVars(config) {
  if (!config || !config.enabled) return { vars: {}, vault: {} };

  const vars = {
    ocp_networking_enabled: true,
    ocp_networking_ocp_version: config.ocp_version || '4.18',
    ocp_networking_provider: config.network_provider || 'OVNKubernetes',
  };

  // Tenants
  vars.ocp_networking_tenants = (config.tenants || []).map(tenant => ({
    tenant_name: tenant.tenant_name,
    namespaces: (tenant.namespaces || []).map(ns => ({
      name: ns.name,
      create: ns.create !== false,
      labels: ns.labels || {},
    })),
    networks: (tenant.networks || []).map(net => ({
      name: net.name,
      scope: net.scope,
      resource_type: net.resource_type,
      role: net.role,
      topology: net.topology,
      subnets: (net.subnets || []).map(s => ({
        cidr: s.cidr,
        ...(s.host_subnet ? { host_subnet: s.host_subnet } : {}),
      })),
      ipam_lifecycle: net.ipam?.lifecycle || '',
      physical_network: net.physical_network || '',
      namespace_selector: net.namespace_selector || {},
      join_subnets: net.join_subnets || [],
    })),
    security: {
      network_policy_enabled: tenant.security?.network_policy?.enabled || false,
      network_policy_template: tenant.security?.network_policy?.template || 'none',
      network_policy_custom_rules: tenant.security?.network_policy?.custom_rules || [],
      multi_network_policy_enabled: tenant.security?.multi_network_policy?.enabled || false,
      multi_network_policy_template: tenant.security?.multi_network_policy?.template || 'none',
      multi_network_policy_custom_rules: tenant.security?.multi_network_policy?.custom_rules || [],
      egress_firewall_enabled: tenant.security?.egress_firewall?.enabled || false,
      egress_firewall_rules: tenant.security?.egress_firewall?.rules || [],
    },
    connectivity: {
      egress_ip_enabled: tenant.connectivity?.egress_ip?.enabled || false,
      egress_ip_addresses: tenant.connectivity?.egress_ip?.addresses || [],
      egress_ip_namespace_selector: tenant.connectivity?.egress_ip?.namespace_selector || {},
    },
  }));

  // Cluster security
  vars.ocp_networking_admin_network_policies = (config.cluster_security?.admin_network_policies || []).map(anp => ({
    name: anp.name,
    priority: anp.priority,
    subject_namespace_selector: anp.subject?.namespace_selector || {},
    ingress_rules: anp.ingress_rules || [],
    egress_rules: anp.egress_rules || [],
  }));

  if (config.cluster_security?.baseline_admin_network_policy) {
    vars.ocp_networking_baseline_admin_network_policy = {
      subject_namespace_selector: config.cluster_security.baseline_admin_network_policy.subject?.namespace_selector || {},
      ingress_rules: config.cluster_security.baseline_admin_network_policy.ingress_rules || [],
      egress_rules: config.cluster_security.baseline_admin_network_policy.egress_rules || [],
    };
  }

  // Physical networks
  vars.ocp_networking_physical_networks = (config.physical_networks || []).map(pn => ({
    name: pn.name,
    physical_network_name: pn.physical_network_name,
    bridge: pn.bridge,
    default_vlan: pn.default_vlan,
    node_selector: pn.node_selector || {},
    managed_by_nmstate: pn.managed_by_nmstate !== false,
    interface_type: pn.interface_config?.type || 'bridge',
    interfaces: pn.interface_config?.interfaces || [],
    bond_mode: pn.interface_config?.bond_mode || null,
  }));

  // MetalLB
  vars.ocp_networking_metallb_enabled = config.load_balancing?.metallb?.enabled || false;
  if (vars.ocp_networking_metallb_enabled) {
    const mlb = config.load_balancing.metallb;
    vars.ocp_networking_metallb_address_pools = (mlb.address_pools || []).map(p => ({
      name: p.name,
      protocol: p.protocol,
      addresses: p.addresses || [],
      auto_assign: p.auto_assign !== false,
    }));
    vars.ocp_networking_metallb_bgp_peers = (mlb.bgp_peers || []).map(p => ({
      name: p.name,
      peer_address: p.peer_address,
      peer_asn: p.peer_asn,
      local_asn: p.local_asn,
      peer_port: p.peer_port || 179,
    }));
    vars.ocp_networking_metallb_l2_advertisements = mlb.l2_advertisements || [];
    vars.ocp_networking_metallb_bgp_advertisements = mlb.bgp_advertisements || [];
  }

  // Dependencies (calculated)
  vars.ocp_networking_dependencies = calculateDependencies(config)
    .filter(d => d.type === 'operator' && d.auto_selected)
    .map(d => d.operator_name);

  return { vars, vault: {} };
}

// ---------------------------------------------------------------------------
// 10. Normalization (import / round-trip safety)
// ---------------------------------------------------------------------------

/**
 * Normalize a raw imported or round-tripped openshift_networking config to
 * the expected shape.  Fills missing defaults, ensures arrays, coerces types.
 *
 * @param {object} raw
 * @returns {object}
 */
export function normalizeNetworkingConfig(raw) {
  if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(NETWORKING_DEFAULTS));

  const config = JSON.parse(JSON.stringify(raw));

  config.enabled = config.enabled === true;
  config.ocp_version = String(config.ocp_version || NETWORKING_DEFAULTS.ocp_version);
  config.network_provider = String(config.network_provider || NETWORKING_DEFAULTS.network_provider);

  // Tenants
  if (!Array.isArray(config.tenants)) config.tenants = [];
  config.tenants = config.tenants.map(t => {
    if (!t || typeof t !== 'object') return createTenant();
    t.id = t.id || uid();
    t.tenant_name = String(t.tenant_name || '');
    if (!Array.isArray(t.namespaces)) t.namespaces = [];
    t.namespaces = t.namespaces.map(ns => {
      if (!ns || typeof ns !== 'object') return createTenantNamespace();
      return {
        name: String(ns.name || ''),
        create: ns.create !== false,
        labels: (ns.labels && typeof ns.labels === 'object') ? ns.labels : {},
      };
    });
    if (!Array.isArray(t.networks)) t.networks = [];
    t.networks = t.networks.map(net => {
      if (!net || typeof net !== 'object') return createTenantNetwork();
      net.id = net.id || uid();
      net.name = String(net.name || '');
      net.scope = net.scope || 'cluster';
      net.resource_type = net.resource_type || 'ClusterUserDefinedNetwork';
      net.role = net.role || 'Primary';
      net.topology = net.topology || 'Layer2';
      if (!Array.isArray(net.subnets)) net.subnets = [];
      net.subnets = net.subnets.map(s => ({
        cidr: String(s?.cidr || ''),
        host_subnet: Number(s?.host_subnet) || 0,
      }));
      if (!net.ipam || typeof net.ipam !== 'object') net.ipam = { lifecycle: '' };
      net.physical_network = net.physical_network || null;
      if (!net.namespace_selector || typeof net.namespace_selector !== 'object') {
        net.namespace_selector = { matchLabels: {} };
      }
      if (!Array.isArray(net.join_subnets)) net.join_subnets = [];
      return net;
    });

    // Security
    if (!t.security || typeof t.security !== 'object') {
      t.security = createTenant().security;
    }
    const sec = t.security;
    if (!sec.network_policy || typeof sec.network_policy !== 'object') {
      sec.network_policy = { enabled: false, template: 'none', pod_selector: {}, custom_rules: [] };
    }
    sec.network_policy.enabled = sec.network_policy.enabled === true;
    if (!sec.network_policy.pod_selector || typeof sec.network_policy.pod_selector !== 'object') {
      sec.network_policy.pod_selector = {};
    }
    if (!Array.isArray(sec.network_policy.custom_rules)) sec.network_policy.custom_rules = [];
    sec.network_policy.custom_rules = sec.network_policy.custom_rules.map(r => ({
      direction: r.direction || 'ingress',
      peers: Array.isArray(r.peers) ? r.peers : [],
      ports: Array.isArray(r.ports) ? r.ports : [],
    }));
    if (!sec.multi_network_policy || typeof sec.multi_network_policy !== 'object') {
      sec.multi_network_policy = { enabled: false, template: 'none', pod_selector: {}, custom_rules: [] };
    }
    if (!sec.multi_network_policy.template) sec.multi_network_policy.template = 'none';
    if (!sec.multi_network_policy.pod_selector || typeof sec.multi_network_policy.pod_selector !== 'object') {
      sec.multi_network_policy.pod_selector = {};
    }
    if (!Array.isArray(sec.multi_network_policy.custom_rules)) sec.multi_network_policy.custom_rules = [];
    sec.multi_network_policy.custom_rules = sec.multi_network_policy.custom_rules.map(r => ({
      direction: r.direction || 'ingress',
      peers: Array.isArray(r.peers) ? r.peers : [],
      ports: Array.isArray(r.ports) ? r.ports : [],
    }));
    if (!sec.egress_firewall || typeof sec.egress_firewall !== 'object') {
      sec.egress_firewall = { enabled: false, rules: [] };
    }
    if (!Array.isArray(sec.egress_firewall.rules)) sec.egress_firewall.rules = [];
    sec.egress_firewall.rules = sec.egress_firewall.rules.map(r => ({
      ...r,
      ports: Array.isArray(r.ports) ? r.ports : [],
    }));

    // Connectivity
    if (!t.connectivity || typeof t.connectivity !== 'object') {
      t.connectivity = createTenant().connectivity;
    }
    const conn = t.connectivity;
    if (!conn.egress_ip || typeof conn.egress_ip !== 'object') {
      conn.egress_ip = { enabled: false, addresses: [], namespace_selector: {}, pod_selector: {} };
    }
    conn.egress_ip.enabled = conn.egress_ip.enabled === true;
    if (!Array.isArray(conn.egress_ip.addresses)) conn.egress_ip.addresses = [];

    return t;
  });

  // Cluster security
  if (!config.cluster_security || typeof config.cluster_security !== 'object') {
    config.cluster_security = { admin_network_policies: [], baseline_admin_network_policy: null };
  }
  if (!Array.isArray(config.cluster_security.admin_network_policies)) {
    config.cluster_security.admin_network_policies = [];
  }
  config.cluster_security.admin_network_policies = config.cluster_security.admin_network_policies.map(anp => {
    if (!anp || typeof anp !== 'object') return createAdminNetworkPolicy();
    anp.id = anp.id || uid();
    anp.name = String(anp.name || '');
    anp.priority = Number(anp.priority) || 0;
    if (!anp.subject || typeof anp.subject !== 'object') anp.subject = { namespace_selector: {} };
    if (!Array.isArray(anp.ingress_rules)) anp.ingress_rules = [];
    if (!Array.isArray(anp.egress_rules)) anp.egress_rules = [];
    return anp;
  });

  // Physical networks
  if (!Array.isArray(config.physical_networks)) config.physical_networks = [];
  config.physical_networks = config.physical_networks.map(pn => {
    if (!pn || typeof pn !== 'object') return createPhysicalNetwork();
    pn.id = pn.id || uid();
    pn.name = String(pn.name || '');
    pn.physical_network_name = String(pn.physical_network_name || '');
    pn.bridge = String(pn.bridge || '');
    pn.managed_by_nmstate = pn.managed_by_nmstate !== false;
    if (!pn.node_selector || typeof pn.node_selector !== 'object') pn.node_selector = {};
    if (!pn.interface_config || typeof pn.interface_config !== 'object') {
      pn.interface_config = { type: 'bridge', interfaces: [], bond_mode: null };
    }
    if (!Array.isArray(pn.interface_config.interfaces)) pn.interface_config.interfaces = [];
    return pn;
  });

  // Ingress
  if (!config.ingress || typeof config.ingress !== 'object') {
    config.ingress = { additional_ingress_controllers: [] };
  }
  if (!Array.isArray(config.ingress.additional_ingress_controllers)) {
    config.ingress.additional_ingress_controllers = [];
  }

  // Load balancing
  if (!config.load_balancing || typeof config.load_balancing !== 'object') {
    config.load_balancing = JSON.parse(JSON.stringify(NETWORKING_DEFAULTS.load_balancing));
  }
  const mlb = config.load_balancing.metallb;
  if (!mlb || typeof mlb !== 'object') {
    config.load_balancing.metallb = JSON.parse(JSON.stringify(NETWORKING_DEFAULTS.load_balancing.metallb));
  } else {
    mlb.enabled = mlb.enabled === true;
    if (!Array.isArray(mlb.address_pools)) mlb.address_pools = [];
    if (!Array.isArray(mlb.l2_advertisements)) mlb.l2_advertisements = [];
    if (!Array.isArray(mlb.bgp_peers)) mlb.bgp_peers = [];
    if (!Array.isArray(mlb.bgp_advertisements)) mlb.bgp_advertisements = [];
    mlb.address_pools = mlb.address_pools.map(p => {
      if (!p || typeof p !== 'object') return createMetalLBAddressPool();
      p.id = p.id || uid();
      p.name = String(p.name || '');
      if (!Array.isArray(p.addresses)) p.addresses = [];
      p.auto_assign = p.auto_assign !== false;
      return p;
    });
    mlb.bgp_peers = mlb.bgp_peers.map(p => {
      if (!p || typeof p !== 'object') return createMetalLBBGPPeer();
      p.id = p.id || uid();
      return p;
    });
  }

  return config;
}
