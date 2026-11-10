import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  ExpandableSection,
  FormGroup,
  Grid,
  GridItem,
  TextInput
} from '@patternfly/react-core';
import {
  OPTIONS,
  CAPABILITIES,
  JOB_TEMPLATES,
  newHostedCluster,
  withShiftOnShiftDefaults,
  validateHostedCluster,
  validateShiftOnShiftConfig,
  summarizeHostedCluster,
  releaseVersionFromImage
} from '../shift-on-shift.js';

/**
 * Shift on Shift tab: hosted clusters on the HyperShift KubeVirt platform.
 * The form only writes component_config.shift_on_shift; the collection
 * (ocp_hcp_kubevirt_prereqs / ocp_hcp_kubevirt_cluster) does the work.
 */
export default function ShiftOnShiftConfig({
  config,
  onChange,
  openshift = {},
  labelWithHelp = label => label,
  storageClasses = [],
  storageLookupLoading = false,
  storageLookupError = '',
  onLookupStorageClasses = () => {},
  lookupReady = false,
  mutedTextColor = '#6a6e73',
  isDark = false
}) {
  const cfg = withShiftOnShiftDefaults(config);
  const [open, setOpen] = useState({ 0: true });
  const [revealed, setRevealed] = useState({});
  const errorColor = '#c9190b';
  const panel = {
    border: `1px solid ${isDark ? '#3c3f42' : '#d2d2d2'}`,
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '12px'
  };
  const selectStyle = { width: '100%', height: '36px', padding: '0 8px' };

  const emit = next => onChange(next);
  const setTop = (key, value) => emit({ ...cfg, [key]: value });
  const setCluster = (index, path, value) => {
    const next = JSON.parse(JSON.stringify(cfg));
    const keys = path.split('.');
    let obj = next.clusters[index];
    keys.slice(0, -1).forEach(key => {
      if (!obj[key] || typeof obj[key] !== 'object') obj[key] = {};
      obj = obj[key];
    });
    obj[keys[keys.length - 1]] = value;
    emit(next);
  };
  const addCluster = () => {
    const next = { ...cfg, clusters: [...cfg.clusters, newHostedCluster(cfg.clusters)] };
    setOpen(prev => ({ ...prev, [cfg.clusters.length]: true }));
    emit(next);
  };
  const removeCluster = index => {
    const name = cfg.clusters[index]?.name || `cluster ${index + 1}`;
    const ok = window.confirm(
      `Remove ${name} from this form? This does not delete a deployed hosted cluster; `
      + 'use the "ADO | Shift on Shift | Delete hosted cluster" job for that.'
    );
    if (!ok) return;
    emit({ ...cfg, clusters: cfg.clusters.filter((_, i) => i !== index) });
  };

  const fieldErrors = cluster => {
    const out = {};
    for (const error of validateHostedCluster(cluster)) {
      (out[error.field] ||= []).push(error.message);
    }
    return out;
  };
  const helper = (errors, field) => (errors[field] ? (
    <div style={{ color: errorColor, fontSize: '12px', marginTop: '4px' }}>{errors[field].join('; ')}</div>
  ) : null);

  const textField = (index, cluster, errors, field, label, help, { span = 6, placeholder = '', type = 'text', path = field } = {}) => (
    <GridItem span={span} key={`${index}-${path}`}>
      <FormGroup label={labelWithHelp(label, help)} fieldId={`sos-${index}-${path}`}>
        <TextInput
          id={`sos-${index}-${path}`}
          type={type}
          value={path.split('.').reduce((o, k) => (o || {})[k], cluster) ?? ''}
          placeholder={placeholder}
          validated={errors[field] ? 'error' : 'default'}
          onChange={(_, v) => setCluster(index, path, type === 'number' ? (v === '' ? '' : Number(v)) : v)}
        />
        {helper(errors, field)}
      </FormGroup>
    </GridItem>
  );

  const selectField = (index, cluster, errors, field, label, help, options, { span = 6, path = field } = {}) => (
    <GridItem span={span} key={`${index}-${path}`}>
      <FormGroup label={labelWithHelp(label, help)} fieldId={`sos-${index}-${path}`}>
        <select
          id={`sos-${index}-${path}`}
          style={selectStyle}
          value={path.split('.').reduce((o, k) => (o || {})[k], cluster) ?? ''}
          onChange={e => setCluster(index, path, e.target.value)}
        >
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        {helper(errors, field)}
      </FormGroup>
    </GridItem>
  );

  const storageField = (index, cluster, errors, field, label, help) => {
    const current = cluster[field] || '';
    return (
      <GridItem span={6} key={`${index}-${field}`}>
        <FormGroup label={labelWithHelp(label, help)} fieldId={`sos-${index}-${field}`}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <TextInput
              id={`sos-${index}-${field}`}
              value={current}
              placeholder="empty uses the default StorageClass"
              onChange={(_, v) => setCluster(index, field, v)}
            />
            <Button variant="secondary" isDisabled={storageLookupLoading || !lookupReady} onClick={() => onLookupStorageClasses()}>
              {storageLookupLoading ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
          {storageClasses.length > 0 && (
            <select
              style={{ ...selectStyle, marginTop: '8px' }}
              value={storageClasses.some(item => item.name === current) ? current : ''}
              onChange={e => setCluster(index, field, e.target.value)}
            >
              <option value="">Default StorageClass</option>
              {storageClasses.map(item => (
                <option key={item.name} value={item.name}>{item.name}{item.default ? ' (default)' : ''}</option>
              ))}
            </select>
          )}
          {helper(errors, field)}
        </FormGroup>
      </GridItem>
    );
  };

  const textArea = (index, cluster, errors, field, label, help, { rows = 4, path = field, placeholder = '' } = {}) => (
    <GridItem span={12} key={`${index}-${path}`}>
      <FormGroup label={labelWithHelp(label, help)} fieldId={`sos-${index}-${path}`}>
        <textarea
          id={`sos-${index}-${path}`}
          rows={rows}
          placeholder={placeholder}
          style={{ width: '100%', padding: '8px', fontFamily: 'monospace' }}
          value={path.split('.').reduce((o, k) => (o || {})[k], cluster) ?? ''}
          onChange={e => setCluster(index, path, e.target.value)}
        />
        {helper(errors, field)}
      </FormGroup>
    </GridItem>
  );

  const renderCluster = (cluster, index) => {
    const errors = fieldErrors(cluster);
    const errorCount = Object.values(errors).flat().length;
    const version = cluster.hosted_version || releaseVersionFromImage(cluster.release_image);
    const workers = cluster.autoscaling_enabled
      ? `${cluster.autoscaling_min}-${cluster.autoscaling_max} workers`
      : `${cluster.worker_count} workers`;
    const title = `${cluster.name || `cluster ${index + 1}`} — OpenShift ${version || '?'}, ${workers}`
      + (errorCount ? ` — ${errorCount} issue${errorCount === 1 ? '' : 's'}` : '');
    const secretKey = `pull-${index}`;
    const dc = cluster.disconnected || {};
    const sources = Array.isArray(dc.image_content_sources) ? dc.image_content_sources : [];

    return (
      <div key={index} style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <ExpandableSection
            toggleText={title}
            isExpanded={!!open[index]}
            onToggle={(_, value) => setOpen(prev => ({ ...prev, [index]: value }))}
            style={{ flex: 1 }}
          >
            <Grid hasGutter>
              <GridItem span={12}><strong>Cluster</strong></GridItem>
              {textField(index, cluster, errors, 'name', 'Hosted cluster name', 'Unique across the hub; not "clusters". Becomes the API host api.<name>.<base domain>.')}
              {textField(index, cluster, errors, 'namespace', 'Namespace', 'Namespace for the HostedCluster and NodePool (control plane pods run in <namespace>-<name>). Must differ from the cluster name.')}
              {textField(index, cluster, errors, 'release_image', 'Release image', 'OpenShift release, for example quay.io/openshift-release-dev/ocp-release:4.22.0-multi. Use a digest in disconnected environments.', { span: 8 })}
              {textField(index, cluster, errors, 'hosted_version', 'Version (digest images)', 'Needed only when the release image is pinned by digest, for example 4.22.0.', { span: 4, placeholder: version ? `from tag: ${version}` : '4.22.0' })}

              <GridItem span={12}><strong>Control plane and endpoints</strong></GridItem>
              {selectField(index, cluster, errors, 'controller_availability_policy', 'Control plane availability', 'HighlyAvailable spreads three replicas across management workers (immutable).', OPTIONS.controller_availability_policy)}
              {selectField(index, cluster, errors, 'api_publishing', 'API endpoint', 'LoadBalancer is the documented default on bare metal and needs MetalLB on the management cluster.', OPTIONS.api_publishing)}
              {cluster.api_publishing === 'NodePort' && textField(index, cluster, errors, 'api_server_address', 'API server address', 'IP or hostname of a management cluster node that worker VMs can reach.')}
              {textField(index, cluster, errors, 'base_domain', 'Base domain (optional)', 'Empty uses the default ingress *.apps.<name>.<management apps domain> (needs wildcard routes). Set a domain to manage your own DNS; ADO creates the <name>-apps load balancer and prints the records.', { placeholder: 'empty = default ingress' })}
              {textField(index, cluster, errors, 'channel', 'Update channel (optional)', 'For example stable-4.22, so the HostedCluster reports available updates.')}

              <GridItem span={12}><strong>Worker virtual machines</strong></GridItem>
              <GridItem span={12}>
                <Checkbox
                  id={`sos-${index}-autoscaling`}
                  label="Autoscale workers"
                  description="Uses NodePool autoScaling (minimum 1; scale from zero is AWS only)."
                  isChecked={!!cluster.autoscaling_enabled}
                  onChange={(_, v) => setCluster(index, 'autoscaling_enabled', v)}
                />
              </GridItem>
              {cluster.autoscaling_enabled ? (
                <>
                  {textField(index, cluster, errors, 'autoscaling_min', 'Minimum workers', '', { span: 3, type: 'number' })}
                  {textField(index, cluster, errors, 'autoscaling_max', 'Maximum workers', '', { span: 3, type: 'number' })}
                </>
              ) : textField(index, cluster, errors, 'worker_count', 'Worker VMs', 'NodePool replicas. Scale later with the Scale node pool job.', { span: 3, type: 'number' })}
              {textField(index, cluster, errors, 'worker_cores', 'vCPU per worker', '', { span: 3, type: 'number' })}
              {textField(index, cluster, errors, 'worker_memory', 'Memory per worker', 'Kubernetes quantity, for example 16Gi.', { span: 3 })}
              {textField(index, cluster, errors, 'nodepool_name', 'Node pool name (optional)', 'Defaults to the cluster name.', { span: 6 })}
              {selectField(index, cluster, errors, 'qos_class', 'VM QoS class', 'Guaranteed reserves the CPU and memory for each VM.', OPTIONS.qos_class)}
              {selectField(index, cluster, errors, 'network_multiqueue', 'Network multiqueue', 'Enable only when the management cluster MTU is 9000 or greater.', OPTIONS.network_multiqueue)}

              <GridItem span={12}><strong>Storage</strong></GridItem>
              {textField(index, cluster, errors, 'root_volume_size', 'Root disk size', 'Worker VM root volume, for example 64Gi.', { span: 6 })}
              {storageField(index, cluster, errors, 'root_volume_storage_class', 'Root disk StorageClass', 'StorageClass for worker VM root volumes. ReadWriteMany Block enables live migration.')}
              <GridItem span={12}>
                <Checkbox
                  id={`sos-${index}-live-migration`}
                  label="Require live migration for worker VMs"
                  description="Requests ReadWriteMany Block root volumes and fails validation if the StorageClass cannot provide them."
                  isChecked={!!cluster.require_live_migration}
                  onChange={(_, v) => setCluster(index, 'require_live_migration', v)}
                />
              </GridItem>
              {selectField(index, cluster, errors, 'root_volume_access_mode', 'Root disk access mode', '', OPTIONS.root_volume_access_mode)}
              {selectField(index, cluster, errors, 'root_volume_volume_mode', 'Root disk volume mode', 'Block is recommended; Filesystem degrades hosted Block performance.', OPTIONS.root_volume_volume_mode)}
              {storageField(index, cluster, errors, 'etcd_storage_class', 'etcd StorageClass', 'Fast, low-latency storage for hosted etcd (for example an LVM Storage class).')}
              {textField(index, cluster, errors, 'etcd_storage_size', 'etcd volume size', '', { span: 6 })}

              <GridItem span={12}><strong>Networking</strong></GridItem>
              {textField(index, cluster, errors, 'cluster_network_cidr', 'Pod network CIDR', 'Default 10.132.0.0/14 avoids overlap with the management cluster.', { span: 4 })}
              {textField(index, cluster, errors, 'service_network_cidr', 'Service network CIDR', 'Default 172.31.0.0/16.', { span: 4 })}
              {textField(index, cluster, errors, 'machine_network_cidr', 'Machine network CIDR (optional)', '', { span: 4 })}

              <GridItem span={12}><strong>Access</strong></GridItem>
              {selectField(index, cluster, errors, 'pull_secret_source', 'Pull secret', 'Pasted pull secrets go only to the encrypted vault file.', OPTIONS.pull_secret_source, { span: 12 })}
              {cluster.pull_secret_source === 'vault' && (
                <GridItem span={12}>
                  <FormGroup label={labelWithHelp('Pull secret JSON', 'Stored in vault_shift_on_shift.yml (encrypted). Never written to the vars file.')} fieldId={`sos-${index}-pull-secret`}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <TextInput
                        id={`sos-${index}-pull-secret`}
                        type={revealed[secretKey] ? 'text' : 'password'}
                        value={cluster.pull_secret || ''}
                        validated={errors.pull_secret ? 'error' : 'default'}
                        onChange={(_, v) => setCluster(index, 'pull_secret', v)}
                      />
                      <Button variant="secondary" onClick={() => setRevealed(prev => ({ ...prev, [secretKey]: !prev[secretKey] }))}>
                        {revealed[secretKey] ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    {helper(errors, 'pull_secret')}
                  </FormGroup>
                </GridItem>
              )}
              {cluster.pull_secret_source === 'existing_secret' && textField(index, cluster, errors, 'pull_secret_name', 'Existing pull secret name', 'A kubernetes.io/dockerconfigjson secret in the hosted cluster namespace.')}
              {textField(index, cluster, errors, 'ssh_public_key', 'SSH public key (optional)', 'Public key for the core user on worker VMs.', { span: 12, placeholder: 'ssh-ed25519 AAAA...' })}
              <GridItem span={12}>
                <Checkbox
                  id={`sos-${index}-fips`}
                  label="FIPS mode"
                  description="Needs a FIPS-enabled management cluster (immutable)."
                  isChecked={!!cluster.fips}
                  onChange={(_, v) => setCluster(index, 'fips', v)}
                />
              </GridItem>
              <GridItem span={12}>
                <FormGroup label={labelWithHelp('Disable optional capabilities', 'Immutable after creation. Disabling anything except ImageRegistry needs a 4.20 or later hosted cluster; Ingress also needs Console disabled.')}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {CAPABILITIES.filter(cap => cap !== 'baremetal').map(cap => (
                      <Checkbox
                        key={cap}
                        id={`sos-${index}-cap-${cap}`}
                        label={cap}
                        isChecked={(cluster.capabilities_disabled || []).includes(cap)}
                        onChange={(_, v) => setCluster(
                          index,
                          'capabilities_disabled',
                          v ? [...(cluster.capabilities_disabled || []), cap] : (cluster.capabilities_disabled || []).filter(c => c !== cap)
                        )}
                      />
                    ))}
                  </div>
                  {helper(errors, 'capabilities_disabled')}
                </FormGroup>
              </GridItem>

              <GridItem span={12}><strong>Disconnected environment</strong></GridItem>
              <GridItem span={12}>
                <Checkbox
                  id={`sos-${index}-disconnected`}
                  label="Disconnected / mirrored registry settings"
                  description="Mirror registry, CA bundle, and OperatorHub catalogs for this hosted cluster."
                  isChecked={!!dc.enabled}
                  onChange={(_, v) => setCluster(index, 'disconnected.enabled', v)}
                />
              </GridItem>
              {dc.enabled && (
                <>
                  <GridItem span={12}>
                    <p style={{ color: mutedTextColor, margin: 0 }}>
                      The management cluster needs its own IDMS mirrors for the release repositories (validated). With a 4.21 or later
                      management cluster also mirror quay.io/openshift-release-dev/ocp-release:4.20.10-multi.
                    </p>
                  </GridItem>
                  {sources.map((entry, srcIndex) => (
                    <React.Fragment key={`${index}-src-${srcIndex}`}>
                      <GridItem span={5}>
                        <FormGroup label={srcIndex === 0 ? 'Mirror source' : ''}>
                          <TextInput
                            value={entry.source}
                            placeholder="quay.io/openshift-release-dev/ocp-release"
                            onChange={(_, v) => setCluster(index, 'disconnected.image_content_sources', sources.map((s, i) => (i === srcIndex ? { ...s, source: v } : s)))}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={5}>
                        <FormGroup label={srcIndex === 0 ? 'Mirrors (comma separated)' : ''}>
                          <TextInput
                            value={(entry.mirrors || []).join(', ')}
                            placeholder="registry.example.com:5000/openshift/release-images"
                            onChange={(_, v) => setCluster(index, 'disconnected.image_content_sources', sources.map((s, i) => (i === srcIndex ? { ...s, mirrors: v.split(',').map(m => m.trimStart()) } : s)))}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={2} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Button variant="link" isDanger onClick={() => setCluster(index, 'disconnected.image_content_sources', sources.filter((_, i) => i !== srcIndex))}>
                          Remove
                        </Button>
                      </GridItem>
                    </React.Fragment>
                  ))}
                  <GridItem span={12}>
                    <Button variant="secondary" onClick={() => setCluster(index, 'disconnected.image_content_sources', [...sources, { source: '', mirrors: [] }])}>
                      Add mirror source
                    </Button>
                    {helper(errors, 'image_content_sources')}
                  </GridItem>
                  {textArea(index, cluster, errors, 'additional_trust_bundle', 'Mirror registry CA bundle (PEM)', 'Added to worker nodes through HostedCluster additionalTrustBundle.', { path: 'disconnected.additional_trust_bundle', placeholder: '-----BEGIN CERTIFICATE-----' })}
                  {selectField(index, cluster, errors, 'olm_catalog_placement', 'OLM catalog placement', 'Immutable after creation.', OPTIONS.olm_catalog_placement, { path: 'disconnected.olm_catalog_placement' })}
                  <GridItem span={6}>
                    <Checkbox
                      id={`sos-${index}-disable-sources`}
                      label="Disable default OperatorHub sources"
                      isChecked={!!dc.disable_default_sources}
                      onChange={(_, v) => setCluster(index, 'disconnected.disable_default_sources', v)}
                    />
                  </GridItem>
                  {['redhat_operators', 'certified_operators', 'community_operators', 'redhat_marketplace'].map(key => textField(
                    index, cluster, errors, 'olm_catalog_images', `Catalog image: ${key.replace(/_/g, ' ')}`,
                    'Optional mirrored catalog image; sets the documented HostedCluster catalog annotation.',
                    { path: `disconnected.olm_catalog_images.${key}` }
                  ))}
                </>
              )}
            </Grid>
          </ExpandableSection>
          <Button variant="link" isDanger onClick={() => removeCluster(index)}>Remove</Button>
        </div>
      </div>
    );
  };

  const allErrors = validateShiftOnShiftConfig(cfg);
  const appsDomain = String(openshift.apps_domain || '').trim();

  return (
    <>
      <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
        Deploys independent OpenShift clusters on this OpenShift cluster with hosted control planes (HyperShift) on the
        KubeVirt platform: control planes run as pods, workers run as OpenShift Virtualization VMs. With
        {' '}<strong>Set up missing prerequisites</strong> on, the deploy job installs whatever the cluster is missing
        first, then creates the hosted clusters.
      </p>

      <div style={panel}>
        <strong>Management cluster</strong>
        <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
          API: {openshift.api_host || <span style={{ color: errorColor }}>not set (OpenShift tab)</span>}
          {' · '}Apps domain: {appsDomain || 'not set'}
          {' · '}The token from the OpenShift tab is stored in the encrypted vault_openshift.yml.
        </div>
        <Grid hasGutter style={{ marginTop: '8px' }}>
          <GridItem span={12}>
            <Checkbox
              id="sos-install-prereqs"
              label="Set up missing prerequisites (recommended)"
              description="Deploy installs only what is missing and reuses what is there: the multicluster engine Operator with hosted control planes (channel chosen for your OpenShift version), OpenShift Virtualization, MetalLB with the address pool below, and wildcard route admission on the default ingress. Storage is not installed: the cluster needs a default StorageClass. Nothing is installed if something that cannot be installed is missing."
              isChecked={cfg.install_prerequisites}
              onChange={(_, v) => setTop('install_prerequisites', v)}
            />
          </GridItem>
          {cfg.install_prerequisites && (
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('MetalLB address pool', 'Free IP addresses on the cluster network for LoadBalancer services (hosted API endpoints). Used only if MetalLB is not set up yet. Separate entries with commas.')}>
                <TextInput
                  id="sos-metallb-pools"
                  value={Array.isArray(cfg.metallb_address_pools) ? cfg.metallb_address_pools.join(', ') : (cfg.metallb_address_pools || '')}
                  placeholder="192.168.10.240-192.168.10.250 or 192.168.10.240/28 (leave empty if MetalLB is already set up)"
                  validated={allErrors.some(e => e.field === 'metallb_address_pools') ? 'error' : 'default'}
                  onChange={(_, v) => setTop('metallb_address_pools', v)}
                />
              </FormGroup>
            </GridItem>
          )}
          {!cfg.install_prerequisites && (
            <GridItem span={12}>
              <Checkbox
                id="sos-wildcard"
                label="Allow wildcard route admission on the management cluster"
                description="Lets the deploy job set routeAdmission.wildcardPolicy=WildcardsAllowed on the default IngressController, required for the default hosted ingress. Without Set up missing prerequisites, this is the only cluster-wide change Shift on Shift makes."
                isChecked={cfg.manage_wildcard_route_admission}
                onChange={(_, v) => setTop('manage_wildcard_route_admission', v)}
              />
            </GridItem>
          )}
          <GridItem span={6}>
            <Checkbox
              id="sos-validate"
              label="Validate prerequisites before deploy"
              isChecked={cfg.validate_before_deploy}
              onChange={(_, v) => setTop('validate_before_deploy', v)}
            />
          </GridItem>
          <GridItem span={6}>
            <Checkbox
              id="sos-verify"
              label="Verify through the hosted API after deploy"
              isChecked={cfg.verify_hosted_api}
              onChange={(_, v) => setTop('verify_hosted_api', v)}
            />
          </GridItem>
          <GridItem span={6}>
            <FormGroup label={labelWithHelp('Load balancer check', 'MetalLB is the documented load balancer for bare metal; choose Skip only with another LoadBalancer implementation.')}>
              <select style={selectStyle} value={cfg.load_balancer_check} onChange={e => setTop('load_balancer_check', e.target.value)}>
                {OPTIONS.load_balancer_check.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </FormGroup>
          </GridItem>
          <GridItem span={12}>
            <Checkbox
              id="sos-unsupported"
              label="Lab only: allow a non bare metal management cluster (UNSUPPORTED)"
              description="The 4.22 docs require an on-premise bare metal management cluster for the KubeVirt platform."
              isChecked={cfg.allow_unsupported_platform}
              onChange={(_, v) => setTop('allow_unsupported_platform', v)}
            />
          </GridItem>
        </Grid>
        {storageLookupError && <div style={{ color: errorColor, fontSize: '12px', marginTop: '6px' }}>{storageLookupError}</div>}
      </div>

      {cfg.clusters.map(renderCluster)}
      <Button variant="secondary" onClick={addCluster} style={{ marginBottom: '16px' }}>Add hosted cluster</Button>

      <div style={panel}>
        <strong>Review</strong>
        {allErrors.length > 0 ? (
          <ul style={{ color: errorColor, margin: '8px 0' }}>
            {allErrors.map((error, i) => (
              <li key={i}>{error.cluster ? `${error.cluster}: ` : ''}{error.message}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: mutedTextColor, margin: '8px 0' }}>
            No input problems found. {cfg.install_prerequisites
              ? 'Run Validate prerequisites to see what deploy will install, then Deploy hosted clusters.'
              : 'Prerequisites on the management cluster are checked by the Validate job.'}
          </p>
        )}
        {cfg.clusters.map((cluster, index) => (
          <table key={`review-${index}`} style={{ width: '100%', marginBottom: '12px', fontSize: '13px', borderCollapse: 'collapse' }}>
            <tbody>
              {summarizeHostedCluster(cluster, appsDomain).map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '2px 8px 2px 0', color: mutedTextColor, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
                  <td style={{ padding: '2px 0' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <div style={{ color: mutedTextColor, fontSize: '13px' }}>
          Bootstrap generates vars_shift_on_shift.yml, vault_shift_on_shift.yml, and these job templates:
          {' '}{JOB_TEMPLATES.join(' · ')}. Run Validate, then Deploy. Scale, Update, Access, and Delete act on one named
          cluster; Delete requires typing the cluster name.
        </div>
      </div>
    </>
  );
}
