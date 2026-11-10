'use strict';

/**
 * Shift on Shift (hosted control planes on OpenShift Virtualization).
 * Shared by server.js (require) and the React form (import via Vite), like
 * git-tls.js. The UI is only a form: these checks catch input mistakes early,
 * and infra.automation_development_office (hcp_kubevirt filter +
 * ocp_hcp_kubevirt_prereqs) stays authoritative.
 *
 * Preflight shape (component_config.shift_on_shift):
 *   { clusters: [ { name, namespace, release_image, ..., pull_secret } ],
 *     install_prerequisites, metallb_address_pools,
 *     manage_wildcard_route_admission, allow_unsupported_platform,
 *     load_balancer_check, validate_before_deploy, verify_hosted_api }
 * pull_secret is written only to vault_shift_on_shift.yml by the collection.
 */

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const QUANTITY = /^[0-9]+(\.[0-9]+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$/;
const IMAGE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?(\/[a-z0-9._/-]+)+(:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[a-f0-9]{64})$/;
const CHANNEL = /^(stable|fast|candidate|eus)-[1-9][0-9]*\.[0-9]+$/;
const NAD = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?\/[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const CIDR4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

const RESERVED_NAMESPACES = [
  'default', 'hypershift', 'local-cluster', 'multicluster-engine',
  'open-cluster-management', 'openshift', 'openshift-cnv'
];
const CAPABILITIES = ['ImageRegistry', 'openshift-samples', 'Insights', 'baremetal', 'Console', 'NodeTuning', 'Ingress'];

const OPTIONS = {
  pull_secret_source: [
    { value: 'management_cluster', label: 'Copy from the management cluster (openshift-config/pull-secret)' },
    { value: 'vault', label: 'Paste a pull secret (stored in the encrypted vault file)' },
    { value: 'existing_secret', label: 'Use an existing secret in the hosted cluster namespace' }
  ],
  controller_availability_policy: [
    { value: 'HighlyAvailable', label: 'HighlyAvailable (production)' },
    { value: 'SingleReplica', label: 'SingleReplica (lab / lower footprint)' }
  ],
  api_publishing: [
    { value: 'LoadBalancer', label: 'LoadBalancer (MetalLB on the management cluster)' },
    { value: 'NodePort', label: 'NodePort (management node address)' }
  ],
  root_volume_access_mode: [
    { value: '', label: 'Storage default' },
    { value: 'ReadWriteMany', label: 'ReadWriteMany (live migration)' },
    { value: 'ReadWriteOnce', label: 'ReadWriteOnce' }
  ],
  root_volume_volume_mode: [
    { value: '', label: 'Storage default' },
    { value: 'Block', label: 'Block (recommended)' },
    { value: 'Filesystem', label: 'Filesystem' }
  ],
  network_multiqueue: [
    { value: 'Enable', label: 'Enable (MTU 9000 or greater)' },
    { value: 'Disable', label: 'Disable' }
  ],
  qos_class: [
    { value: 'Burstable', label: 'Burstable' },
    { value: 'Guaranteed', label: 'Guaranteed (dedicated CPU and memory)' }
  ],
  olm_catalog_placement: [
    { value: 'management', label: 'management (default)' },
    { value: 'guest', label: 'guest' }
  ],
  load_balancer_check: [
    { value: 'metallb', label: 'Check MetalLB' },
    { value: 'skip', label: 'Skip (external load balancer)' }
  ]
};

const HOSTED_CLUSTER_DEFAULTS = Object.freeze({
  name: '',
  namespace: 'clusters',
  release_image: 'quay.io/openshift-release-dev/ocp-release:4.22.0-multi',
  hosted_version: '',
  pull_secret_source: 'management_cluster',
  pull_secret: '',
  pull_secret_name: '',
  ssh_public_key: '',
  base_domain: '',
  controller_availability_policy: 'HighlyAvailable',
  api_publishing: 'LoadBalancer',
  api_server_address: '',
  cluster_network_cidr: '10.132.0.0/14',
  service_network_cidr: '172.31.0.0/16',
  machine_network_cidr: '',
  etcd_storage_class: '',
  etcd_storage_size: '8Gi',
  nodepool_name: '',
  worker_count: 2,
  autoscaling_enabled: false,
  autoscaling_min: 2,
  autoscaling_max: 4,
  worker_cores: 4,
  worker_memory: '16Gi',
  root_volume_size: '64Gi',
  root_volume_storage_class: '',
  root_volume_access_mode: '',
  root_volume_volume_mode: '',
  require_live_migration: false,
  network_multiqueue: 'Enable',
  qos_class: 'Burstable',
  channel: '',
  fips: false,
  capabilities_disabled: [],
  disconnected: {
    enabled: false,
    image_content_sources: [],
    additional_trust_bundle: '',
    olm_catalog_placement: 'management',
    disable_default_sources: false,
    olm_catalog_images: {
      redhat_operators: '',
      certified_operators: '',
      community_operators: '',
      redhat_marketplace: ''
    },
    olm_registry_overrides: ''
  }
});

const CONFIG_DEFAULTS = Object.freeze({
  clusters: [],
  // Deploy installs missing prerequisites (MCE, OpenShift Virtualization,
  // MetalLB, wildcard routes) so selecting Shift on Shift is enough.
  install_prerequisites: true,
  // Used only when MetalLB is not set up yet. Form keeps the typed text.
  metallb_address_pools: '',
  manage_wildcard_route_admission: false,
  allow_unsupported_platform: false,
  load_balancer_check: 'metallb',
  validate_before_deploy: true,
  verify_hosted_api: true
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function toInt(value, fallback) {
  if (value === '' || value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toBool(value) {
  return value === true || value === 'true';
}

function releaseVersionFromImage(image) {
  const raw = text(image);
  if (!raw || raw.includes('@sha256:')) return '';
  const tag = raw.includes(':') && raw.includes('/') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
  const match = tag.match(/(^|[^0-9.])([1-9][0-9]*)\.([0-9]+)(?:\.([0-9]+))?/);
  if (!match) return '';
  return match[4] !== undefined ? `${match[2]}.${match[3]}.${match[4]}` : `${match[2]}.${match[3]}`;
}

function minor(version) {
  const parts = text(version).split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
}

function versionAtLeast(version, floor) {
  const a = text(version).split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

function defaultShiftOnShiftConfig() {
  return clone(CONFIG_DEFAULTS);
}

function newHostedCluster(existing = []) {
  const names = new Set((existing || []).map(item => text(item && item.name)));
  let index = names.size + 1;
  let name = `hosted-${index}`;
  while (names.has(name)) {
    index += 1;
    name = `hosted-${index}`;
  }
  return { ...clone(HOSTED_CLUSTER_DEFAULTS), name };
}

function normalizeHostedCluster(input) {
  const base = clone(HOSTED_CLUSTER_DEFAULTS);
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...base, ...clone(src) };
  out.disconnected = {
    ...base.disconnected,
    ...(src.disconnected && typeof src.disconnected === 'object' ? clone(src.disconnected) : {})
  };
  out.disconnected.olm_catalog_images = {
    ...base.disconnected.olm_catalog_images,
    ...((src.disconnected && src.disconnected.olm_catalog_images) || {})
  };
  for (const key of ['name', 'namespace', 'nodepool_name', 'base_domain']) {
    out[key] = text(out[key]).toLowerCase();
  }
  out.base_domain = out.base_domain.replace(/^\.+|\.+$/g, '');
  for (const key of ['release_image', 'hosted_version', 'pull_secret_name', 'ssh_public_key',
    'api_server_address', 'cluster_network_cidr', 'service_network_cidr', 'machine_network_cidr',
    'etcd_storage_class', 'etcd_storage_size', 'worker_memory', 'root_volume_size',
    'root_volume_storage_class', 'channel']) {
    out[key] = text(out[key]);
  }
  out.worker_count = toInt(out.worker_count, base.worker_count);
  out.worker_cores = toInt(out.worker_cores, base.worker_cores);
  out.autoscaling_enabled = toBool(out.autoscaling_enabled);
  out.autoscaling_min = toInt(out.autoscaling_min, base.autoscaling_min);
  out.autoscaling_max = toInt(out.autoscaling_max, base.autoscaling_max);
  out.require_live_migration = toBool(out.require_live_migration);
  out.fips = toBool(out.fips);
  out.disconnected.enabled = toBool(out.disconnected.enabled);
  out.disconnected.disable_default_sources = toBool(out.disconnected.disable_default_sources);
  out.capabilities_disabled = Array.isArray(out.capabilities_disabled) ? out.capabilities_disabled.filter(Boolean) : [];
  out.disconnected.image_content_sources = (Array.isArray(out.disconnected.image_content_sources)
    ? out.disconnected.image_content_sources : [])
    .map(item => ({
      source: text(item && item.source),
      mirrors: (Array.isArray(item && item.mirrors) ? item.mirrors : String((item && item.mirrors) || '').split(/[\n,]/))
        .map(text)
        .filter(Boolean)
    }))
    .filter(item => item.source || item.mirrors.length);
  // A pasted pull secret is only kept for the vault source.
  if (out.pull_secret_source !== 'vault') out.pull_secret = '';
  if (out.pull_secret_source !== 'existing_secret') out.pull_secret_name = '';
  return out;
}

/**
 * Defaults merged in without trimming or type coercion. The form edits this
 * shape so typing is not disturbed (spaces in SSH keys, commas in mirror
 * lists); normalization happens when the payload is built.
 */
function withShiftOnShiftDefaults(input) {
  const src = input && typeof input === 'object' ? input : {};
  const base = clone(HOSTED_CLUSTER_DEFAULTS);
  return {
    ...clone(CONFIG_DEFAULTS),
    ...clone(src),
    clusters: (Array.isArray(src.clusters) ? src.clusters : []).map(cluster => {
      const c = cluster && typeof cluster === 'object' ? clone(cluster) : {};
      const dc = c.disconnected && typeof c.disconnected === 'object' ? c.disconnected : {};
      return {
        ...base,
        ...c,
        disconnected: {
          ...base.disconnected,
          ...dc,
          olm_catalog_images: { ...base.disconnected.olm_catalog_images, ...(dc.olm_catalog_images || {}) }
        }
      };
    })
  };
}

/**
 * Collection-facing cluster entry: UI-only switches folded into the keys the
 * hcp_kubevirt filter reads (autoscaling_* are 0 when autoscaling is off).
 */
function toCollectionCluster(cluster) {
  const out = normalizeHostedCluster(cluster);
  if (!out.autoscaling_enabled) {
    out.autoscaling_min = 0;
    out.autoscaling_max = 0;
  }
  delete out.autoscaling_enabled;
  if (!out.disconnected.enabled) {
    out.disconnected = { enabled: false };
  }
  return out;
}

function normalizeShiftOnShiftConfig(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...clone(CONFIG_DEFAULTS) };
  out.clusters = (Array.isArray(src.clusters) ? src.clusters : []).map(normalizeHostedCluster);
  out.install_prerequisites = src.install_prerequisites !== false && src.install_prerequisites !== 'false';
  out.metallb_address_pools = splitList(src.metallb_address_pools);
  out.manage_wildcard_route_admission = toBool(src.manage_wildcard_route_admission);
  out.allow_unsupported_platform = toBool(src.allow_unsupported_platform);
  out.load_balancer_check = src.load_balancer_check === 'skip' ? 'skip' : 'metallb';
  out.validate_before_deploy = src.validate_before_deploy !== false && src.validate_before_deploy !== 'false';
  out.verify_hosted_api = src.verify_hosted_api !== false && src.verify_hosted_api !== 'false';
  return out;
}

/** Payload form written to preflight JSON. */
function shiftOnShiftPayload(input) {
  const cfg = normalizeShiftOnShiftConfig(input);
  return { ...cfg, clusters: cfg.clusters.map(toCollectionCluster) };
}

function splitList(value) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  return items.map(text).filter(Boolean);
}

function ipv4ToNumber(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}

/** MetalLB IPAddressPool entry: IPv4 CIDR, IPv4 range a-b, or an IPv6 CIDR/range. */
function addressPoolValid(value) {
  const entry = text(value);
  if (entry.includes(':')) return /^[0-9a-fA-F:]+(\/\d{1,3}|-[0-9a-fA-F:]+)$/.test(entry);
  if (entry.includes('-')) {
    const [start, end] = entry.split('-').map(ipv4ToNumber);
    return start !== null && end !== null && start <= end;
  }
  return cidrValid(entry);
}

function cidrValid(value) {
  const match = CIDR4.exec(text(value));
  if (!match) return /^[0-9a-f:]+\/\d{1,3}$/i.test(text(value));
  const octets = match.slice(1, 5).map(Number);
  return octets.every(o => o <= 255) && Number(match[5]) <= 32;
}

function cidrRange(value) {
  const match = CIDR4.exec(text(value));
  if (!match) return null;
  const ip = match.slice(1, 5).map(Number).reduce((acc, o) => (acc * 256) + o, 0);
  const bits = Number(match[5]);
  const size = 2 ** (32 - bits);
  const start = Math.floor(ip / size) * size;
  return [start, start + size - 1];
}

function validateHostedCluster(input) {
  const c = normalizeHostedCluster(input);
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  if (!c.name) add('name', 'Hosted cluster name is required');
  else if (!DNS_LABEL.test(c.name) || c.name.length > 63) add('name', 'Name must be lowercase letters, digits, and hyphens');
  else if (c.name === 'clusters') add('name', "Name must not be 'clusters'");
  if (!DNS_LABEL.test(c.namespace)) add('namespace', 'Namespace must be lowercase letters, digits, and hyphens');
  else if (RESERVED_NAMESPACES.includes(c.namespace) || /^(kube-|openshift-)/.test(c.namespace)) {
    add('namespace', `Namespace '${c.namespace}' is reserved; use a dedicated namespace such as 'clusters'`);
  }
  if (c.name && c.namespace === c.name) add('namespace', 'Namespace must differ from the hosted cluster name');
  if (c.name && c.namespace && `${c.namespace}-${c.name}`.length > 63) {
    add('name', 'Namespace plus name (the control plane namespace) must be 63 characters or fewer');
  }

  if (!c.release_image) add('release_image', 'Release image is required');
  else if (!IMAGE.test(c.release_image)) add('release_image', 'Release image needs a registry path with a tag or sha256 digest');
  const version = c.hosted_version || releaseVersionFromImage(c.release_image);
  if (c.release_image && !version) add('hosted_version', 'Set the OpenShift version for a digest-pinned release image (for example 4.22.0)');

  if (c.pull_secret_source === 'vault') {
    try {
      const parsed = JSON.parse(c.pull_secret || '');
      if (!parsed || typeof parsed.auths !== 'object' || !Object.keys(parsed.auths).length) {
        add('pull_secret', "Pull secret JSON needs an 'auths' entry");
      }
    } catch (_err) {
      add('pull_secret', 'Pull secret must be valid JSON');
    }
  } else if (c.pull_secret_source === 'existing_secret') {
    if (!c.pull_secret_name) add('pull_secret_name', 'Name the existing pull secret');
  } else if (c.pull_secret_source !== 'management_cluster') {
    add('pull_secret_source', 'Choose a pull secret source');
  }

  if (c.api_publishing === 'NodePort' && !c.api_server_address) {
    add('api_server_address', 'NodePort publishing needs the API server address (a management node IP or hostname)');
  }
  if (c.base_domain && !DNS_SUBDOMAIN.test(c.base_domain)) add('base_domain', 'Base domain is not a valid DNS name');
  if (c.ssh_public_key && !/^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-[a-z0-9-]+@openssh\.com) /.test(c.ssh_public_key)) {
    add('ssh_public_key', 'SSH key must be an OpenSSH public key');
  }

  const cidrs = [
    ['cluster_network_cidr', c.cluster_network_cidr, true],
    ['service_network_cidr', c.service_network_cidr, true],
    ['machine_network_cidr', c.machine_network_cidr, false]
  ];
  const ranges = [];
  for (const [field, value, required] of cidrs) {
    if (!value) {
      if (required) add(field, 'CIDR is required');
      continue;
    }
    if (!cidrValid(value)) add(field, `'${value}' is not a valid CIDR`);
    else {
      const range = cidrRange(value);
      if (range) ranges.push([field, range]);
    }
  }
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const [fa, [sa, ea]] = ranges[i];
      const [fb, [sb, eb]] = ranges[j];
      if (sa <= eb && sb <= ea) add(fb, `Overlaps ${fa.replace(/_/g, ' ')}`);
    }
  }

  if (!QUANTITY.test(c.etcd_storage_size)) add('etcd_storage_size', 'Use a size such as 8Gi');
  if (c.nodepool_name && !DNS_LABEL.test(c.nodepool_name)) add('nodepool_name', 'Node pool name must be lowercase letters, digits, and hyphens');
  if (c.autoscaling_enabled) {
    if (c.autoscaling_min < 1) add('autoscaling_min', 'Minimum must be 1 or more (scale from zero is AWS only)');
    if (c.autoscaling_max < c.autoscaling_min) add('autoscaling_max', 'Maximum must be greater than or equal to the minimum');
  } else if (!Number.isInteger(c.worker_count) || c.worker_count < 0) {
    add('worker_count', 'Worker count must be 0 or more');
  }
  if (!Number.isInteger(c.worker_cores) || c.worker_cores < 1) add('worker_cores', 'CPU cores must be 1 or more');
  if (!QUANTITY.test(c.worker_memory)) add('worker_memory', 'Use a size such as 16Gi');
  if (!QUANTITY.test(c.root_volume_size)) add('root_volume_size', 'Use a size such as 64Gi');
  if (c.require_live_migration && c.root_volume_access_mode && c.root_volume_access_mode !== 'ReadWriteMany') {
    add('root_volume_access_mode', 'Live migration needs ReadWriteMany root volumes');
  }
  if (c.channel && !CHANNEL.test(c.channel)) add('channel', 'Channel looks like stable-4.22');

  for (const cap of c.capabilities_disabled) {
    if (!CAPABILITIES.includes(cap)) add('capabilities_disabled', `Unknown capability ${cap}`);
  }
  if (c.capabilities_disabled.includes('Ingress') && !c.capabilities_disabled.includes('Console')) {
    add('capabilities_disabled', 'Disabling Ingress requires disabling Console');
  }
  const late = c.capabilities_disabled.filter(cap => ['openshift-samples', 'Insights', 'Console', 'NodeTuning', 'Ingress'].includes(cap));
  if (late.length && version && !versionAtLeast(version, '4.20')) {
    add('capabilities_disabled', `Disabling ${late.join(', ')} needs a 4.20 or later hosted cluster`);
  }

  if (c.disconnected.enabled) {
    for (const entry of c.disconnected.image_content_sources) {
      if (!entry.source || !entry.mirrors.length) add('image_content_sources', 'Each image content source needs a source and a mirror');
    }
    const bundle = text(c.disconnected.additional_trust_bundle);
    if (bundle && !bundle.includes('-----BEGIN CERTIFICATE-----')) add('additional_trust_bundle', 'Trust bundle must contain PEM certificates');
    for (const [key, ref] of Object.entries(c.disconnected.olm_catalog_images || {})) {
      if (text(ref) && !IMAGE.test(text(ref))) add('olm_catalog_images', `${key} is not a valid image reference`);
    }
  }
  return errors;
}

function validateShiftOnShiftConfig(input) {
  const cfg = normalizeShiftOnShiftConfig(input);
  const errors = [];
  if (!cfg.clusters.length) errors.push({ cluster: '', field: 'clusters', message: 'Add at least one hosted cluster' });
  const badPools = cfg.metallb_address_pools.filter(entry => !addressPoolValid(entry));
  if (badPools.length) {
    errors.push({
      cluster: '',
      field: 'metallb_address_pools',
      message: `MetalLB address pool entries must be a CIDR or a range like 192.168.10.240-192.168.10.250 (check: ${badPools.join(', ')})`
    });
  }
  const seen = new Map();
  cfg.clusters.forEach((cluster, index) => {
    const label = cluster.name || `cluster ${index + 1}`;
    for (const error of validateHostedCluster(cluster)) errors.push({ cluster: label, index, ...error });
    if (cluster.name) {
      if (seen.has(cluster.name)) errors.push({ cluster: label, index, field: 'name', message: 'Duplicate hosted cluster name' });
      seen.set(cluster.name, index);
    }
  });
  return errors;
}

/** Short labels for the wizard "Needs ..." banner. */
function shiftOnShiftMissing(input) {
  const errors = validateShiftOnShiftConfig(input);
  if (!errors.length) return [];
  const labels = [...new Set(errors.map(e => e.cluster).filter(Boolean))].map(name => `Shift on Shift: ${name}`);
  if (errors.some(e => e.field === 'clusters')) labels.unshift('Shift on Shift hosted cluster');
  if (errors.some(e => !e.cluster && e.field !== 'clusters')) labels.push('Shift on Shift settings');
  return labels;
}

/** Review rows (no secret values). */
function summarizeHostedCluster(input, managementAppsDomain = '') {
  const c = normalizeHostedCluster(input);
  const version = c.hosted_version || releaseVersionFromImage(c.release_image);
  const apps = c.base_domain
    ? `apps.${c.name}.${c.base_domain}`
    : (managementAppsDomain ? `apps.${c.name}.${managementAppsDomain}` : `apps.${c.name}.<management apps domain>`);
  const workers = c.autoscaling_enabled
    ? `autoscaling ${c.autoscaling_min}-${c.autoscaling_max}`
    : `${c.worker_count}`;
  return [
    ['Hosted cluster', `${c.namespace}/${c.name}`],
    ['Control plane namespace', `${c.namespace}-${c.name}`],
    ['OpenShift', `${version || 'unknown'} (${c.release_image})`],
    ['Control plane', c.controller_availability_policy],
    ['API endpoint', c.api_publishing === 'NodePort' ? `NodePort on ${c.api_server_address || '<address>'}` : 'LoadBalancer (MetalLB)'],
    ['Ingress', c.base_domain ? `*.${apps} (create DNS; ADO adds the ${c.name}-apps load balancer)` : `*.${apps} (default ingress, needs wildcard routes)`],
    ['Workers', `${workers} x ${c.worker_cores} vCPU / ${c.worker_memory}`],
    ['Root disk', `${c.root_volume_size} on ${c.root_volume_storage_class || 'default StorageClass'}${c.require_live_migration ? ' (RWX Block, live migration)' : ''}`],
    ['etcd', `${c.etcd_storage_size} on ${c.etcd_storage_class || 'default StorageClass'}`],
    ['Networks', `pods ${c.cluster_network_cidr}, services ${c.service_network_cidr}`],
    ['Pull secret', c.pull_secret_source === 'vault' ? 'pasted (vault file only)' : (c.pull_secret_source === 'existing_secret' ? `existing secret ${c.pull_secret_name}` : 'copied from the management cluster')],
    ['Disconnected', c.disconnected.enabled ? `${c.disconnected.image_content_sources.length} mirror source(s)${c.disconnected.additional_trust_bundle ? ', trust bundle' : ''}` : 'no']
  ];
}

const JOB_TEMPLATES = [
  'ADO | Shift on Shift | Validate prerequisites',
  'ADO | Shift on Shift | Deploy hosted clusters',
  'ADO | Shift on Shift | Hosted cluster status',
  'ADO | Shift on Shift | Scale node pool',
  'ADO | Shift on Shift | Update hosted cluster',
  'ADO | Shift on Shift | Access details',
  'ADO | Shift on Shift | Delete hosted cluster'
];

module.exports = {
  OPTIONS,
  CAPABILITIES,
  HOSTED_CLUSTER_DEFAULTS,
  CONFIG_DEFAULTS,
  JOB_TEMPLATES,
  defaultShiftOnShiftConfig,
  withShiftOnShiftDefaults,
  newHostedCluster,
  normalizeHostedCluster,
  normalizeShiftOnShiftConfig,
  shiftOnShiftPayload,
  toCollectionCluster,
  validateHostedCluster,
  validateShiftOnShiftConfig,
  shiftOnShiftMissing,
  summarizeHostedCluster,
  releaseVersionFromImage,
  minor
};
