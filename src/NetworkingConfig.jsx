/**
 * NetworkingConfig.jsx — OpenShift Networking configuration component for PreFlight.
 *
 * Provides a centralized networking management experience built entirely on
 * supported Red Hat OpenShift networking APIs (OVN-Kubernetes UDN/CUDN).
 *
 * This component is NOT an OpenShift Virtualization sub-feature — networking is a
 * first-class, independent capability. OpenShift Virtualization consumes the
 * networking framework when selected, but it works independently for containers,
 * VMs, mixed workloads, and cluster-wide policy.
 *
 * Architecture decision: networking is an `openshift` group app (`openshift_networking`)
 * in the existing component_apps/component_config pattern, consistent with how
 * cert_manager, ocp_virtualization, and other OpenShift platform apps are integrated.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Title,
  Card,
  CardBody,
  Form,
  FormGroup,
  Grid,
  GridItem,
  TextInput,
  TextArea,
  Checkbox,
  Button,
  Tabs,
  Tab,
  ExpandableSection,
  Tooltip,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Radio,
  Label,
  LabelGroup,
  Alert,
  AlertVariant,
  Popover,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody
} from '@patternfly/react-core';

import {
  PlusCircleIcon,
  TrashIcon,
  CopyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
  ExclamationCircleIcon
} from '@patternfly/react-icons';

import {
  NETWORKING_DEFAULTS,
  OCP_VERSION_OPTIONS,
  FEATURE_STATUS,
  createTenant,
  createTenantNamespace,
  createTenantNetwork,
  createSubnet,
  createPhysicalNetwork,
  createNetworkPolicyRule,
  createAdminNetworkPolicy,
  createAdminNetworkPolicyRule,
  createEgressFirewallRule,
  createMetalLBAddressPool,
  createMetalLBBGPPeer,
  supportsFeature,
  getValidTopologies,
  getValidRoles,
  getValidScopes,
  isVmCompatible,
  requiresNamespaceLabel,
  validateNetworkingConfig,
  validateTenant,
  validateTenantNetwork,
  validateNamespaceName,
  validateResourceName,
  validateCIDR,
  validateCIDROverlap,
  validatePhysicalNetwork,
  validateAdminNetworkPolicy,
  validateMetalLBPool,
  generateNetworkResources,
  calculateDependencies,
  INFO_POPOVER_MAP,
  normalizeNetworkingConfig
} from './networkingSupport.mjs';

/* ────────────────────────── Constants ────────────────────────── */

const SECRET_REVEAL_MS = 30000;

const NETWORK_POLICY_TEMPLATES = [
  { value: 'none', label: 'None', description: 'No default policy — all traffic allowed.' },
  { value: 'default-deny-ingress', label: 'Default Deny Ingress', description: 'Deny all ingress traffic by default. Egress is allowed.' },
  { value: 'default-deny-all', label: 'Default Deny Ingress + Egress', description: 'Deny all ingress and egress traffic by default.' },
  { value: 'allow-same-tenant', label: 'Allow Within Tenant', description: 'Allow traffic between namespaces in the same tenant. Deny external ingress.' },
  { value: 'allow-from-namespaces', label: 'Allow From Selected Namespaces', description: 'Allow ingress from specific namespace selectors.' },
  { value: 'custom', label: 'Custom', description: 'Define custom NetworkPolicy rules.' }
];



const MULTI_NETWORK_POLICY_TEMPLATES = [
  { value: 'none', label: 'None', description: 'No policy on secondary networks — all traffic allowed.' },
  { value: 'default-deny-ingress', label: 'Default Deny Ingress', description: 'Deny all ingress on the secondary network by default.' },
  { value: 'default-deny-all', label: 'Default Deny All', description: 'Deny all ingress and egress on the secondary network.' },
  { value: 'custom', label: 'Custom', description: 'Define custom MultiNetworkPolicy rules for secondary networks.' }
];

const IPAM_LIFECYCLE_OPTIONS = [
  { value: 'Persistent', label: 'Persistent', description: 'IP addresses persist across pod restarts. Required for VM live migration.' },
  { value: 'Static', label: 'Static', description: 'IP addresses are statically assigned from the subnet.' }
];

const ANP_ACTION_OPTIONS = [
  { value: 'Allow', label: 'Allow' },
  { value: 'Deny', label: 'Deny' },
  { value: 'Pass', label: 'Pass' }
];

/* ────────────────────────── Helpers ────────────────────────── */

const mutedColor = isDark => (isDark ? '#b8bbbe' : '#6a6e73');
const warnColor = '#f0ab00';
const errorColor = '#c9190b';
const successColor = '#3e8635';

const yamlValue = value => {
  if (value === null || value === undefined || value === '') return '""';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  if (text.includes('{{') || text.includes('}}')) return text;
  if (text.includes(':') || text.includes('#') || text.includes('@') || text.includes(' ') || text.startsWith('http')) {
    return JSON.stringify(text);
  }
  return text;
};

const indent = (text, spaces) => text.split('\n').map(l => ' '.repeat(spaces) + l).join('\n');

/** Render one or more YAML resources separated by --- */
const renderResourceYaml = resources =>
  resources.map(r => `---\n${resourceToYaml(r)}`).join('\n\n');

/** Simple recursive object-to-YAML serializer (no library dependency). */
const resourceToYaml = (obj, depth = 0) => {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') return yamlValue(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const lines = resourceToYaml(item, depth + 1);
        const firstLine = lines.split('\n')[0];
        const rest = lines.split('\n').slice(1).map(l => '  ' + l).join('\n');
        return `- ${firstLine}${rest ? '\n' + rest : ''}`;
      }
      return `- ${resourceToYaml(item, depth + 1)}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([key, val]) => {
        if (typeof val === 'object' && val !== null) {
          if (Array.isArray(val) && val.length === 0) return `${key}: []`;
          if (!Array.isArray(val) && Object.keys(val).length === 0) return `${key}: {}`;
          return `${key}:\n${indent(resourceToYaml(val, depth + 1), 2)}`;
        }
        return `${key}: ${resourceToYaml(val, depth + 1)}`;
      })
      .join('\n');
  }
  return String(obj);
};

/* ────────────────────────── Component ────────────────────────── */

export default function NetworkingConfig({ data, set, setData, isDark }) {
  const [activeTab, setActiveTab] = useState('tenants');
  const [editingTenantIdx, setEditingTenantIdx] = useState(null);
  const [editingTenantTab, setEditingTenantTab] = useState('info');
  const [editingPhysNetIdx, setEditingPhysNetIdx] = useState(null);
  const [editingANPIdx, setEditingANPIdx] = useState(null);
  const [previewTenantIdx, setPreviewTenantIdx] = useState(null);
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const secretTimersRef = useRef({});
  const [validationResults, setValidationResults] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);

  const muted = mutedColor(isDark);

  useEffect(() => () => {
    Object.values(secretTimersRef.current).forEach(clearTimeout);
    secretTimersRef.current = {};
  }, []);

  const toggleSecret = useCallback((key) => {
    setRevealedSecrets(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const timers = secretTimersRef.current;
      if (timers[key]) { clearTimeout(timers[key]); delete timers[key]; }
      if (next[key]) {
        timers[key] = setTimeout(() => {
          setRevealedSecrets(p => ({ ...p, [key]: false }));
          delete timers[key];
        }, SECRET_REVEAL_MS);
      }
      return next;
    });
  }, []);

  /* ── Networking state helpers ── */
  const netPath = 'component_config.openshift_networking';
  const net = useMemo(
    () => normalizeNetworkingConfig(data.component_config?.openshift_networking),
    [data.component_config?.openshift_networking]
  );

  const setNet = useCallback((subpath, value) => set(`${netPath}.${subpath}`, value), [set]);

  const virtSelected = (data.component_apps?.openshift || []).includes('ocp_virtualization');

  /* ── Tenant CRUD ── */
  const tenants = net.tenants || [];

  const updateTenants = useCallback((updater) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_config) copy.component_config = {};
      if (!copy.component_config.openshift_networking) {
        copy.component_config.openshift_networking = JSON.parse(JSON.stringify(NETWORKING_DEFAULTS));
      }
      const tenantsCopy = copy.component_config.openshift_networking.tenants || [];
      copy.component_config.openshift_networking.tenants = updater(tenantsCopy);
      return copy;
    });
  }, [setData]);

  const addTenant = useCallback(() => {
    updateTenants(ts => [...ts, createTenant()]);
    setEditingTenantIdx(tenants.length);
    setEditingTenantTab('info');
  }, [updateTenants, tenants.length]);

  const cloneTenant = useCallback((idx) => {
    updateTenants(ts => {
      const clone = JSON.parse(JSON.stringify(ts[idx]));
      clone.id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      clone.tenant_name = `${clone.tenant_name}-copy`;
      clone.networks.forEach(n => {
        n.id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        n.name = `${n.name}-copy`;
      });
      return [...ts, clone];
    });
  }, [updateTenants]);

  const deleteTenant = useCallback((idx) => {
    updateTenants(ts => ts.filter((_, i) => i !== idx));
    if (editingTenantIdx === idx) setEditingTenantIdx(null);
    setShowConfirmDelete(null);
  }, [updateTenants, editingTenantIdx]);

  const updateTenantField = useCallback((idx, path, value) => {
    updateTenants(ts => {
      const next = [...ts];
      const t = JSON.parse(JSON.stringify(next[idx]));
      const keys = path.split('.');
      let obj = t;
      keys.slice(0, -1).forEach(k => {
        if (!obj[k]) obj[k] = {};
        obj = obj[k];
      });
      obj[keys[keys.length - 1]] = value;
      next[idx] = t;
      return next;
    });
  }, [updateTenants]);

  /* ── Physical Networks CRUD ── */
  const physicalNetworks = net.physical_networks || [];

  const updatePhysicalNetworks = useCallback((updater) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_config?.openshift_networking) {
        copy.component_config = copy.component_config || {};
        copy.component_config.openshift_networking = JSON.parse(JSON.stringify(NETWORKING_DEFAULTS));
      }
      copy.component_config.openshift_networking.physical_networks = updater(
        copy.component_config.openshift_networking.physical_networks || []
      );
      return copy;
    });
  }, [setData]);

  /* ── Validation ── */
  const runValidation = useCallback(() => {
    const results = validateNetworkingConfig(net, { virtSelected });
    setValidationResults(results);
    return results;
  }, [net, virtSelected]);

  const tenantValidation = useCallback((idx) => {
    if (!tenants[idx]) return { valid: true, errors: [] };
    return validateTenant(tenants[idx], net, { virtSelected });
  }, [tenants, net, virtSelected]);

  /* ── Dependencies ── */
  const dependencies = useMemo(() => calculateDependencies(net, {
    virtSelected,
    existingApps: data.component_apps?.openshift || []
  }), [net, virtSelected, data.component_apps?.openshift]);

  /* ── Generated resources ── */
  const generatedResources = useMemo(() => generateNetworkResources(net, {
    virtSelected,
    domain: data.domain,
    ocpVersion: net.ocp_version
  }), [net, virtSelected, data.domain]);

  /* ── Info Popover helper ── */
  const infoPopover = (concept) => {
    const entry = INFO_POPOVER_MAP[concept];
    if (!entry) return null;
    return (
      <Popover
        headerContent={entry.title}
        bodyContent={<p>{entry.description}</p>}
      >
        <Button variant="plain" aria-label={`Info: ${entry.title}`} style={{ padding: '2px 4px' }}>
          <InfoCircleIcon style={{ color: '#2b9af3' }} />
        </Button>
      </Popover>
    );
  };

  /* ── Secret field helper ── */
  const renderSecretInput = (label, value, onChange, secretKey) => (
    <FormGroup label={label}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <TextInput
          type={revealedSecrets[secretKey] ? 'text' : 'password'}
          value={value || ''}
          onChange={(_, v) => onChange(v)}
        />
        <Button variant="secondary" onClick={() => toggleSecret(secretKey)}>
          {revealedSecrets[secretKey] ? 'Hide' : 'Show'}
        </Button>
      </div>
    </FormGroup>
  );

  /* ── Feature status badge ── */
  const featureStatusBadge = (status) => {
    if (!status || status === FEATURE_STATUS.GA) return null;
    const colorMap = {
      [FEATURE_STATUS.TP]: 'orange',
      [FEATURE_STATUS.DP]: 'purple',
      [FEATURE_STATUS.DEPRECATED]: 'red',
      [FEATURE_STATUS.UNSUPPORTED]: 'grey'
    };
    return (
      <Label color={colorMap[status] || 'grey'} isCompact style={{ marginLeft: '8px' }}>
        {status}
      </Label>
    );
  };

  /* ── Topology tree view ── */
  const buildTenantTree = (tenant) => {
    const lines = [`${tenant.tenant_name || 'Unnamed'} Tenant`];
    (tenant.namespaces || []).forEach((ns, i) => {
      const last = i === (tenant.namespaces.length - 1) && (tenant.networks || []).length === 0;
      lines.push(`${last ? '└' : '├'}── ${ns.name || '(unnamed)'} (namespace${ns.create ? ', create' : ''})`);
    });
    (tenant.networks || []).forEach((nw, i) => {
      const lastNet = i === (tenant.networks || []).length - 1;
      const prefix = lastNet ? '└' : '├';
      lines.push(`${prefix}── ${nw.name || '(unnamed)'}`);
      const subPrefix = lastNet ? '    ' : '│   ';
      const scopeLabel = nw.scope === 'cluster' ? 'CUDN' : nw.scope === 'namespace' ? 'UDN' : 'NAD';
      lines.push(`${subPrefix}├── ${nw.role} ${nw.topology} ${scopeLabel}`);
      (nw.subnets || []).forEach(s => {
        lines.push(`${subPrefix}├── ${s.cidr || '(no CIDR)'}`);
      });
      lines.push(`${subPrefix}└── IPAM: ${nw.ipam?.lifecycle || 'default'}`);
    });
    const sec = tenant.security || {};
    const npolSec = sec.network_policy;
    const mnpSec = sec.multi_network_policy;
    const efSec = sec.egress_firewall;
    const hasAnySec = npolSec?.enabled || mnpSec?.enabled || efSec?.enabled;
    if (hasAnySec) {
      lines.push('├── Security');
      if (npolSec?.enabled) {
        lines.push(`│   ├── NetworkPolicy: ${NETWORK_POLICY_TEMPLATES.find(t => t.value === npolSec.template)?.label || npolSec.template}`);
      }
      if (mnpSec?.enabled) {
        lines.push(`│   ├── MultiNetworkPolicy: ${MULTI_NETWORK_POLICY_TEMPLATES.find(t => t.value === mnpSec.template)?.label || mnpSec.template}`);
      }
      if (efSec?.enabled) {
        lines.push(`│   ├── EgressFirewall: ${(efSec.rules || []).length} rule(s)`);
      }
      lines.push('│   └── (end)');
    }
    const egress = tenant.connectivity?.egress_ip;
    lines.push('└── Egress');
    lines.push(`    └── EgressIP: ${egress?.enabled ? 'enabled' : 'disabled'}`);
    return lines.join('\n');
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Global Settings Bar
   * ════════════════════════════════════════════════════════════════ */

  const renderGlobalSettings = () => (
    <Grid hasGutter style={{ marginBottom: '16px' }}>
      <GridItem span={3}>
        <FormGroup label="Target OpenShift Version">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {OCP_VERSION_OPTIONS.map(v => (
              <Radio
                key={v.value}
                id={`ocp-ver-${v.value}`}
                name="ocp-version"
                label={
                  <span>
                    {v.label}
                    {v.status && v.status !== 'current' && (
                      <Label isCompact color={v.status === 'eus' ? 'blue' : 'grey'} style={{ marginLeft: '4px' }}>
                        {v.status.toUpperCase()}
                      </Label>
                    )}
                  </span>
                }
                isChecked={net.ocp_version === v.value}
                onChange={() => setNet('ocp_version', v.value)}
              />
            ))}
          </div>
        </FormGroup>
      </GridItem>
      <GridItem span={3}>
        <FormGroup label="Network Provider">
          <TextInput
            value={net.network_provider || 'OVNKubernetes'}
            isDisabled
            aria-label="Network provider"
          />
          <p style={{ color: muted, fontSize: '12px', marginTop: '4px' }}>
            UDN/CUDN requires OVN-Kubernetes. Changing the cluster CNI is not supported through PreFlight.
          </p>
        </FormGroup>
      </GridItem>
      <GridItem span={6}>
        <div style={{ textAlign: 'right' }}>
          <Button variant="secondary" onClick={runValidation} style={{ marginRight: '8px' }}>
            Validate All
          </Button>
        </div>
        {validationResults && (
          <div style={{ marginTop: '8px', textAlign: 'right' }}>
            {validationResults.valid ? (
              <Label color="green" icon={<CheckCircleIcon />}>All Valid</Label>
            ) : (
              <Label color="red" icon={<ExclamationCircleIcon />}>
                {validationResults.errors.length} issue{validationResults.errors.length !== 1 ? 's' : ''}
              </Label>
            )}
          </div>
        )}
      </GridItem>
    </Grid>
  );

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Tenant Networks Tab
   * ════════════════════════════════════════════════════════════════ */

  const renderTenantSummaryRow = (tenant, idx) => {
    const nw = (tenant.networks || [])[0];
    const nsNames = (tenant.namespaces || []).map(n => n.name).filter(Boolean).join(', ');
    const validation = tenantValidation(idx);
    const cidrs = nw ? (nw.subnets || []).map(s => s.cidr).filter(Boolean).join(', ') : '';
    const npolEnabled = tenant.security?.network_policy?.enabled || false;
    const npolTemplate = npolEnabled ? (tenant.security.network_policy.template || 'none') : null;
    const mnpEnabled = tenant.security?.multi_network_policy?.enabled || false;
    const mnpTemplate = mnpEnabled ? (tenant.security.multi_network_policy.template || 'none') : null;
    const efEnabled = tenant.security?.egress_firewall?.enabled || false;

    return (
      <tr key={tenant.id || idx} style={{ borderBottom: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}` }}>
        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{tenant.tenant_name || '(unnamed)'}</td>
        <td style={{ padding: '10px 12px', color: muted, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nsNames || '—'}
        </td>
        <td style={{ padding: '10px 12px' }}>{nw?.name || '—'}</td>
        <td style={{ padding: '10px 12px' }}>
          <Label isCompact color={nw?.scope === 'cluster' ? 'blue' : 'cyan'}>
            {nw?.scope === 'cluster' ? 'Cluster' : nw?.scope === 'namespace' ? 'Namespace' : '—'}
          </Label>
        </td>
        <td style={{ padding: '10px 12px' }}>{nw?.role || '—'}</td>
        <td style={{ padding: '10px 12px' }}>{nw?.topology || '—'}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px' }}>{cidrs || '—'}</td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {npolTemplate && npolTemplate !== 'none' && (
              <Label isCompact color="green">NP: {NETWORK_POLICY_TEMPLATES.find(t => t.value === npolTemplate)?.label || npolTemplate}</Label>
            )}
            {mnpTemplate && mnpTemplate !== 'none' && (
              <Label isCompact color="blue">MNP: {MULTI_NETWORK_POLICY_TEMPLATES.find(t => t.value === mnpTemplate)?.label || mnpTemplate}</Label>
            )}
            {efEnabled && <Label isCompact color="orange">EgressFirewall</Label>}
            {!npolEnabled && !mnpEnabled && !efEnabled && <span style={{ color: muted }}>—</span>}
          </div>
        </td>
        <td style={{ padding: '10px 12px' }}>
          {validation.valid ? (
            <Label isCompact color="green" icon={<CheckCircleIcon />}>Valid</Label>
          ) : (
            <Tooltip content={validation.errors.map(e => e.message).join('; ')}>
              <Label isCompact color="red" icon={<ExclamationCircleIcon />}>
                {validation.errors.length} issue{validation.errors.length !== 1 ? 's' : ''}
              </Label>
            </Tooltip>
          )}
        </td>
        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
          <Button variant="plain" aria-label="Edit tenant" onClick={() => { setEditingTenantIdx(idx); setEditingTenantTab('info'); }}>
            Edit
          </Button>
          <Button variant="plain" aria-label="Clone tenant" onClick={() => cloneTenant(idx)}>
            <CopyIcon />
          </Button>
          <Button
            variant="plain"
            aria-label="Preview resources"
            onClick={() => setPreviewTenantIdx(previewTenantIdx === idx ? null : idx)}
          >
            YAML
          </Button>
          <Button variant="plain" aria-label="Delete tenant" isDanger onClick={() => setShowConfirmDelete({ type: 'tenant', idx })}>
            <TrashIcon />
          </Button>
        </td>
      </tr>
    );
  };

  const renderTenantsTab = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <Title headingLevel="h3" size="lg">
            Tenant Networks
            {infoPopover('tenant')}
          </Title>
          <p style={{ color: muted, marginTop: '4px' }}>
            Define logical tenant networks. Each tenant groups namespaces, network segments, security policy, and connectivity.
            PreFlight translates these into OpenShift UDN, CUDN, or NAD resources.
          </p>
        </div>
        <Button variant="primary" icon={<PlusCircleIcon />} onClick={addTenant}>
          Add Tenant Network
        </Button>
      </div>

      {tenants.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState>
              <EmptyStateBody>
                <p style={{ marginBottom: '16px' }}>No tenant networks configured.</p>
                <p style={{ color: muted, marginBottom: '16px' }}>
                  Tenant Networks are the primary logical object in OpenShift Networking. They represent
                  an administrator&apos;s networking intent — which namespaces share a network, what topology
                  to use, what security to enforce, and how workloads connect.
                </p>
                <DescriptionList isHorizontal isCompact style={{ maxWidth: '600px', margin: '0 auto' }}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Network Segment</DescriptionListTerm>
                    <DescriptionListDescription>UserDefinedNetwork (namespace) or ClusterUserDefinedNetwork (cluster-wide)</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Tenant</DescriptionListTerm>
                    <DescriptionListDescription>Logical grouping of namespaces with shared networks and security policy</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Security Policy</DescriptionListTerm>
                    <DescriptionListDescription>NetworkPolicy + AdminNetworkPolicy + BaselineAdminNetworkPolicy</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
                <div style={{ marginTop: '20px' }}>
                  <Button variant="primary" icon={<PlusCircleIcon />} onClick={addTenant}>
                    Create First Tenant Network
                  </Button>
                </div>
              </EmptyStateBody>
            </EmptyState>
          </CardBody>
        </Card>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`, textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Tenant</th>
                  <th style={{ padding: '8px 12px' }}>Namespaces</th>
                  <th style={{ padding: '8px 12px' }}>Network</th>
                  <th style={{ padding: '8px 12px' }}>Scope</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px' }}>Topology</th>
                  <th style={{ padding: '8px 12px' }}>CIDR</th>
                  <th style={{ padding: '8px 12px' }}>Security</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => renderTenantSummaryRow(t, i))}
              </tbody>
            </table>
          </div>

          {/* Inline topology tree for any open preview */}
          {previewTenantIdx !== null && tenants[previewTenantIdx] && (
            <Card style={{ marginTop: '16px' }}>
              <CardBody>
                <Grid hasGutter>
                  <GridItem span={4}>
                    <Title headingLevel="h4" size="md" style={{ marginBottom: '8px' }}>Topology</Title>
                    <pre style={{
                      fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5',
                      background: isDark ? '#151515' : '#f5f5f5',
                      padding: '12px', borderRadius: '4px', overflow: 'auto',
                      border: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`
                    }}>
                      {buildTenantTree(tenants[previewTenantIdx])}
                    </pre>
                  </GridItem>
                  <GridItem span={8}>
                    <Title headingLevel="h4" size="md" style={{ marginBottom: '8px' }}>
                      Generated Resources
                      <Button
                        variant="plain"
                        aria-label="Copy YAML"
                        onClick={() => {
                          const yaml = renderResourceYaml(
                            generatedResources.filter(r => r._tenant === tenants[previewTenantIdx].tenant_name)
                          );
                          navigator.clipboard?.writeText(yaml);
                        }}
                        style={{ marginLeft: '8px' }}
                      >
                        <CopyIcon />
                      </Button>
                    </Title>
                    <pre style={{
                      fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4',
                      background: isDark ? '#151515' : '#f5f5f5',
                      padding: '12px', borderRadius: '4px', overflow: 'auto',
                      maxHeight: '500px',
                      border: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`,
                      color: isDark ? '#f0f0f0' : '#151515'
                    }}>
                      {renderResourceYaml(
                        generatedResources.filter(r => r._tenant === tenants[previewTenantIdx]?.tenant_name)
                      ) || '# No resources generated for this tenant.'}
                    </pre>
                  </GridItem>
                </Grid>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </>
  );

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Tenant Edit Modal
   * ════════════════════════════════════════════════════════════════ */

  const renderTenantEditModal = () => {
    if (editingTenantIdx === null || !tenants[editingTenantIdx]) return null;
    const idx = editingTenantIdx;
    const tenant = tenants[idx];
    const tSet = (path, value) => updateTenantField(idx, path, value);
    const nw = (tenant.networks || [])[0] || createTenantNetwork();
    const nwIdx = 0;

    const updateNetwork = (path, value) => {
      updateTenants(ts => {
        const next = [...ts];
        const t = JSON.parse(JSON.stringify(next[idx]));
        if (!t.networks || !t.networks[nwIdx]) {
          t.networks = [createTenantNetwork()];
        }
        const keys = path.split('.');
        let obj = t.networks[nwIdx];
        keys.slice(0, -1).forEach(k => { if (!obj[k]) obj[k] = {}; obj = obj[k]; });
        obj[keys[keys.length - 1]] = value;
        next[idx] = t;
        return next;
      });
    };

    const validation = tenantValidation(idx);

    const validTopos = getValidTopologies({
      scope: nw.scope,
      role: nw.role,
      resourceType: nw.resource_type,
      ocpVersion: net.ocp_version,
    });

    const validRoles = getValidRoles({
      scope: nw.scope,
      topology: nw.topology,
      resourceType: nw.resource_type,
      ocpVersion: net.ocp_version
    });

    const validScopes = getValidScopes({
      role: nw.role,
      topology: nw.topology,
      ocpVersion: net.ocp_version
    });

    const vmCompat = isVmCompatible(nw);
    const needsNsLabel = requiresNamespaceLabel(nw);

    /* ─ Tenant Info tab ─ */
    const renderTenantInfoTab = () => (
      <Grid hasGutter>
        <GridItem span={6}>
          <FormGroup label="Tenant Name" isRequired>
            <TextInput
              id="tenant-name"
              value={tenant.tenant_name || ''}
              onChange={(_, v) => tSet('tenant_name', v)}
              validated={tenant.tenant_name && validateResourceName(tenant.tenant_name).valid ? 'default' : 'error'}
            />
            <p style={{ color: muted, fontSize: '12px', marginTop: '4px' }}>
              Logical display name for this tenant grouping. Used in PreFlight and resource naming.
            </p>
          </FormGroup>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label="Description">
            <TextInput
              id="tenant-desc"
              value={tenant.description || ''}
              onChange={(_, v) => tSet('description', v)}
            />
          </FormGroup>
        </GridItem>
        <GridItem span={12}>
          <Title headingLevel="h4" size="md" style={{ marginTop: '8px' }}>Topology Overview</Title>
          <pre style={{
            fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5',
            background: isDark ? '#151515' : '#f5f5f5',
            padding: '12px', borderRadius: '4px',
            border: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`
          }}>
            {buildTenantTree(tenant)}
          </pre>
        </GridItem>
      </Grid>
    );

    /* ─ Namespaces tab ─ */
    const renderNamespacesTab = () => {
      const namespaces = tenant.namespaces || [];
      return (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <p style={{ color: muted }}>
                Namespaces that will share this tenant&apos;s network.
                {needsNsLabel && (
                  <span style={{ color: warnColor, marginLeft: '8px' }}>
                    Primary UDN namespaces require the label <code>k8s.ovn.org/primary-user-defined-network</code>.
                    PreFlight adds this automatically when needed.
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="secondary"
              icon={<PlusCircleIcon />}
              onClick={() => tSet('namespaces', [...namespaces, createTenantNamespace()])}
            >
              Add Namespace
            </Button>
          </div>
          {namespaces.map((ns, ni) => {
            const nsValidation = validateNamespaceName(ns.name);
            return (
              <Card key={ni} style={{ marginBottom: '12px' }}>
                <CardBody>
                  <Grid hasGutter>
                    <GridItem span={4}>
                      <FormGroup label="Namespace Name" isRequired>
                        <TextInput
                          value={ns.name || ''}
                          onChange={(_, v) => {
                            const next = [...namespaces];
                            next[ni] = { ...next[ni], name: v };
                            tSet('namespaces', next);
                          }}
                          validated={ns.name && nsValidation.valid ? 'default' : ns.name ? 'error' : 'default'}
                        />
                        {ns.name && !nsValidation.valid && (
                          <p style={{ color: errorColor, fontSize: '12px', marginTop: '2px' }}>{nsValidation.error}</p>
                        )}
                      </FormGroup>
                    </GridItem>
                    <GridItem span={2}>
                      <FormGroup label="Action">
                        <Checkbox
                          id={`ns-create-${ni}`}
                          label="Create namespace"
                          isChecked={ns.create !== false}
                          onChange={(_, v) => {
                            const next = [...namespaces];
                            next[ni] = { ...next[ni], create: v };
                            tSet('namespaces', next);
                          }}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={5}>
                      <FormGroup label="Additional Labels (key=value, one per line)">
                        <TextArea
                          value={
                            Object.entries(ns.labels || {})
                              .filter(([k]) => k !== 'k8s.ovn.org/primary-user-defined-network')
                              .map(([k, v]) => `${k}=${v}`)
                              .join('\n')
                          }
                          onChange={(_, v) => {
                            const labels = {};
                            v.split('\n').forEach(line => {
                              const [lk, ...lv] = line.split('=');
                              if (lk?.trim()) labels[lk.trim()] = (lv.join('=') || '').trim();
                            });
                            const next = [...namespaces];
                            next[ni] = { ...next[ni], labels };
                            tSet('namespaces', next);
                          }}
                          rows={2}
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={1}>
                      <div style={{ paddingTop: '28px' }}>
                        <Button
                          variant="plain"
                          isDanger
                          aria-label="Remove namespace"
                          onClick={() => tSet('namespaces', namespaces.filter((_, i) => i !== ni))}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </GridItem>
                    {needsNsLabel && (
                      <GridItem span={12}>
                        <Alert variant="info" isInline isPlain title="Primary UDN label will be added automatically">
                          <code>k8s.ovn.org/primary-user-defined-network: &quot;&quot;</code> will be applied to this namespace.
                        </Alert>
                      </GridItem>
                    )}
                  </Grid>
                </CardBody>
              </Card>
            );
          })}
          {namespaces.length === 0 && (
            <p style={{ color: muted, fontStyle: 'italic' }}>No namespaces added. Add at least one namespace for this tenant.</p>
          )}
        </>
      );
    };

    /* ─ Network Segment tab ─ */
    const renderNetworkSegmentTab = () => (
      <>
        <p style={{ color: muted, marginBottom: '12px' }}>
          Define the network segment for this tenant.
          {infoPopover('segment')}
        </p>
        {virtSelected && !vmCompat && (
          <Alert
            variant="warning"
            isInline
            title="Current configuration is not compatible with OpenShift Virtualization"
            style={{ marginBottom: '12px' }}
          >
            VM workloads require a Primary Layer2 UDN with Persistent IPAM for live migration support.
            Adjust scope, role, or topology to enable VM compatibility.
          </Alert>
        )}
        <Grid hasGutter>
          <GridItem span={6}>
            <FormGroup label="Network Name" isRequired>
              <TextInput
                id="net-name"
                value={nw.name || ''}
                onChange={(_, v) => updateNetwork('name', v)}
                validated={nw.name && validateResourceName(nw.name).valid ? 'default' : nw.name ? 'error' : 'default'}
              />
            </FormGroup>
          </GridItem>

          <GridItem span={4}>
            <FormGroup label={<span>Scope {infoPopover('segment')}</span>}>
              {validScopes.map(s => (
                <Radio
                  key={s.value}
                  id={`scope-${s.value}`}
                  name="net-scope"
                  label={
                    <span>
                      {s.label}
                      {featureStatusBadge(s.status)}
                    </span>
                  }
                  description={s.description}
                  isChecked={nw.scope === s.value}
                  onChange={() => {
                    updateNetwork('scope', s.value);
                    const rt = s.value === 'cluster' ? 'ClusterUserDefinedNetwork'
                      : s.value === 'namespace' ? 'UserDefinedNetwork' : nw.resource_type;
                    updateNetwork('resource_type', rt);
                  }}
                  isDisabled={s.disabled}
                />
              ))}
            </FormGroup>
          </GridItem>

          <GridItem span={4}>
            <FormGroup label="Role">
              {validRoles.map(r => (
                <Radio
                  key={r.value}
                  id={`role-${r.value}`}
                  name="net-role"
                  label={
                    <span>
                      {r.label}
                      {featureStatusBadge(r.status)}
                    </span>
                  }
                  description={r.description}
                  isChecked={nw.role === r.value}
                  onChange={() => updateNetwork('role', r.value)}
                  isDisabled={r.disabled}
                />
              ))}
            </FormGroup>
          </GridItem>

          <GridItem span={4}>
            <FormGroup label="Topology">
              {validTopos.map(t => (
                <Radio
                  key={t.value}
                  id={`topo-${t.value}`}
                  name="net-topology"
                  label={
                    <span>
                      {t.label}
                      {featureStatusBadge(t.status)}
                      {(t.value === 'Layer2' || t.value === 'Layer3') && infoPopover('overlay')}
                      {t.value === 'Localnet' && infoPopover('localnet')}
                    </span>
                  }
                  description={t.description}
                  isChecked={nw.topology === t.value}
                  onChange={() => updateNetwork('topology', t.value)}
                  isDisabled={t.disabled}
                />
              ))}
            </FormGroup>
          </GridItem>

          {/* Subnets */}
          <GridItem span={12}>
            <Title headingLevel="h4" size="md" style={{ marginBottom: '8px' }}>Subnets</Title>
            {(nw.subnets || []).map((sub, si) => {
              const cidrValid = sub.cidr ? validateCIDR(sub.cidr) : { valid: true };
              return (
                <Grid hasGutter key={si} style={{ marginBottom: '8px' }}>
                  <GridItem span={5}>
                    <FormGroup label={si === 0 ? 'IPv4/IPv6 CIDR' : ''}>
                      <TextInput
                        value={sub.cidr || ''}
                        onChange={(_, v) => {
                          const subs = [...(nw.subnets || [])];
                          subs[si] = { ...subs[si], cidr: v };
                          updateNetwork('subnets', subs);
                        }}
                        placeholder="10.100.10.0/24 or fd00:10:100::/48"
                        validated={sub.cidr && !cidrValid.valid ? 'error' : 'default'}
                      />
                      {sub.cidr && !cidrValid.valid && (
                        <p style={{ color: errorColor, fontSize: '12px', marginTop: '2px' }}>{cidrValid.error}</p>
                      )}
                    </FormGroup>
                  </GridItem>
                  {nw.topology === 'Layer3' && (
                    <GridItem span={3}>
                      <FormGroup label={si === 0 ? 'Host Subnet Length' : ''}>
                        <TextInput
                          type="number"
                          value={sub.host_subnet || ''}
                          onChange={(_, v) => {
                            const subs = [...(nw.subnets || [])];
                            subs[si] = { ...subs[si], host_subnet: parseInt(v, 10) || 0 };
                            updateNetwork('subnets', subs);
                          }}
                          placeholder="24"
                        />
                      </FormGroup>
                    </GridItem>
                  )}
                  <GridItem span={1}>
                    <div style={{ paddingTop: si === 0 ? '28px' : '0' }}>
                      <Button
                        variant="plain"
                        isDanger
                        aria-label="Remove subnet"
                        onClick={() => updateNetwork('subnets', (nw.subnets || []).filter((_, i) => i !== si))}
                        isDisabled={(nw.subnets || []).length <= 1}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </GridItem>
                </Grid>
              );
            })}
            <Button
              variant="link"
              icon={<PlusCircleIcon />}
              onClick={() => updateNetwork('subnets', [...(nw.subnets || []), createSubnet()])}
            >
              Add Subnet (dual-stack)
            </Button>
          </GridItem>

          {/* IPAM */}
          <GridItem span={6}>
            <FormGroup label="IPAM Lifecycle">
              {IPAM_LIFECYCLE_OPTIONS.map(opt => (
                <Radio
                  key={opt.value}
                  id={`ipam-${opt.value}`}
                  name="ipam-lifecycle"
                  label={opt.label}
                  description={opt.description}
                  isChecked={(nw.ipam?.lifecycle || 'Persistent') === opt.value}
                  onChange={() => updateNetwork('ipam.lifecycle', opt.value)}
                />
              ))}
              {virtSelected && nw.ipam?.lifecycle !== 'Persistent' && (
                  <Alert variant="warning" isInline isPlain title="Persistent IPAM recommended for VMs" style={{ marginTop: '8px' }}>
                    Live migration requires persistent IP addressing.
                  </Alert>
                )}
            </FormGroup>
          </GridItem>

          {/* Physical network reference for Localnet */}
          {nw.topology === 'Localnet' && (
            <GridItem span={6}>
              <FormGroup label="Physical Network">
                {physicalNetworks.length > 0 ? (
                  <>
                    {physicalNetworks.map(pn => (
                      <Radio
                        key={pn.id}
                        id={`phys-ref-${pn.id}`}
                        name="phys-net-ref"
                        label={`${pn.name} (${pn.physical_network_name}, bridge: ${pn.bridge})`}
                        isChecked={nw.physical_network === pn.id}
                        onChange={() => updateNetwork('physical_network', pn.id)}
                      />
                    ))}
                    <Radio
                      id="phys-ref-none"
                      name="phys-net-ref"
                      label="None (configure later)"
                      isChecked={!nw.physical_network}
                      onChange={() => updateNetwork('physical_network', null)}
                    />
                  </>
                ) : (
                  <Alert variant="info" isInline isPlain title="No physical networks defined">
                    Localnet topology requires a physical network. Go to the Physical Networks tab to configure one.
                  </Alert>
                )}
              </FormGroup>
            </GridItem>
          )}

          {/* Namespace selector for cluster-scoped resources */}
          {nw.scope === 'cluster' && (
            <GridItem span={12}>
              <FormGroup label="Namespace Selector (matchLabels, key=value per line)">
                <TextArea
                  value={
                    Object.entries(nw.namespace_selector?.matchLabels || {})
                      .map(([k, v]) => `${k}=${v}`)
                      .join('\n')
                  }
                  onChange={(_, v) => {
                    const matchLabels = {};
                    v.split('\n').forEach(line => {
                      const [lk, ...lv] = line.split('=');
                      if (lk?.trim()) matchLabels[lk.trim()] = (lv.join('=') || '').trim();
                    });
                    updateNetwork('namespace_selector', { matchLabels });
                  }}
                  rows={3}
                  placeholder="tenant=finance"
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
                <p style={{ color: muted, fontSize: '12px', marginTop: '4px' }}>
                  ClusterUserDefinedNetwork applies to namespaces matching this selector.
                </p>
              </FormGroup>
            </GridItem>
          )}
        </Grid>
      </>
    );

    /* ─ Security tab ─ */
    const renderSecurityTab = () => {
      const sec = tenant.security || {};
      const npol = sec.network_policy || { enabled: false, template: 'none', custom_rules: [] };
      const ef = sec.egress_firewall || { enabled: false, rules: [] };

      const multiNetPolicySupported = supportsFeature({
        policyType: 'MultiNetworkPolicy',
        ocpVersion: net.ocp_version
      }).supported;

      return (
        <>
          <p style={{ color: muted, marginBottom: '12px' }}>
            Network security policy for this tenant.
            {infoPopover('firewall')}
          </p>

          {/* NetworkPolicy */}
          <ExpandableSection toggleText="NetworkPolicy" isExpanded>
            <Checkbox
              id="npol-enabled"
              label="Enable NetworkPolicy"
              description="Apply namespace-level NetworkPolicy for this tenant's namespaces."
              isChecked={npol.enabled}
              onChange={(_, v) => tSet('security.network_policy.enabled', v)}
              style={{ marginBottom: '12px' }}
            />
            {npol.enabled && (
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="Policy Template">
                    {NETWORK_POLICY_TEMPLATES.map(tmpl => (
                      <Radio
                        key={tmpl.value}
                        id={`npol-tmpl-${tmpl.value}`}
                        name="npol-template"
                        label={tmpl.label}
                        description={tmpl.description}
                        isChecked={npol.template === tmpl.value}
                        onChange={() => tSet('security.network_policy.template', tmpl.value)}
                      />
                    ))}
                  </FormGroup>
                </GridItem>

                {npol.template === 'allow-from-namespaces' && (
                  <GridItem span={6}>
                    <FormGroup label="Allowed Namespace Selector (key=value per line)">
                      <TextArea
                        value={
                          Object.entries(npol.allowed_namespace_selector || {})
                            .map(([k, v]) => `${k}=${v}`)
                            .join('\n')
                        }
                        onChange={(_, v) => {
                          const sel = {};
                          v.split('\n').forEach(line => {
                            const [lk, ...lv] = line.split('=');
                            if (lk?.trim()) sel[lk.trim()] = (lv.join('=') || '').trim();
                          });
                          tSet('security.network_policy.allowed_namespace_selector', sel);
                        }}
                        rows={3}
                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                      />
                    </FormGroup>
                  </GridItem>
                )}

                {npol.template === 'custom' && (
                  <GridItem span={12}>
                    <Title headingLevel="h5" size="sm" style={{ marginBottom: '8px' }}>Custom NetworkPolicy Rules</Title>
                    {(npol.custom_rules || []).map((rule, ri) => (
                      <Card key={ri} style={{ marginBottom: '8px' }}>
                        <CardBody>
                          <Grid hasGutter>
                            <GridItem span={3}>
                              <FormGroup label="Direction">
                                <Radio id={`rule-${ri}-ingress`} name={`rule-dir-${ri}`} label="Ingress"
                                  isChecked={rule.direction === 'ingress'} onChange={() => {
                                    const rules = [...(npol.custom_rules || [])];
                                    rules[ri] = { ...rules[ri], direction: 'ingress' };
                                    tSet('security.network_policy.custom_rules', rules);
                                  }} />
                                <Radio id={`rule-${ri}-egress`} name={`rule-dir-${ri}`} label="Egress"
                                  isChecked={rule.direction === 'egress'} onChange={() => {
                                    const rules = [...(npol.custom_rules || [])];
                                    rules[ri] = { ...rules[ri], direction: 'egress' };
                                    tSet('security.network_policy.custom_rules', rules);
                                  }} />
                              </FormGroup>
                            </GridItem>
                            <GridItem span={3}>
                              <FormGroup label="Protocol">
                                <TextInput value={rule.protocol || ''} placeholder="TCP"
                                  onChange={(_, v) => {
                                    const rules = [...(npol.custom_rules || [])];
                                    rules[ri] = { ...rules[ri], protocol: v };
                                    tSet('security.network_policy.custom_rules', rules);
                                  }} />
                              </FormGroup>
                            </GridItem>
                            <GridItem span={2}>
                              <FormGroup label="Port">
                                <TextInput value={rule.port || ''} placeholder="8080"
                                  onChange={(_, v) => {
                                    const rules = [...(npol.custom_rules || [])];
                                    rules[ri] = { ...rules[ri], port: v };
                                    tSet('security.network_policy.custom_rules', rules);
                                  }} />
                              </FormGroup>
                            </GridItem>
                            <GridItem span={3}>
                              <FormGroup label="CIDR / Namespace Selector">
                                <TextInput value={rule.cidr || ''} placeholder="10.0.0.0/8 or ns-selector"
                                  onChange={(_, v) => {
                                    const rules = [...(npol.custom_rules || [])];
                                    rules[ri] = { ...rules[ri], cidr: v };
                                    tSet('security.network_policy.custom_rules', rules);
                                  }} />
                              </FormGroup>
                            </GridItem>
                            <GridItem span={1}>
                              <div style={{ paddingTop: '28px' }}>
                                <Button variant="plain" isDanger aria-label="Remove rule"
                                  onClick={() => tSet('security.network_policy.custom_rules',
                                    (npol.custom_rules || []).filter((_, i) => i !== ri))}>
                                  <TrashIcon />
                                </Button>
                              </div>
                            </GridItem>
                          </Grid>
                        </CardBody>
                      </Card>
                    ))}
                    <Button variant="link" icon={<PlusCircleIcon />}
                      onClick={() => tSet('security.network_policy.custom_rules',
                        [...(npol.custom_rules || []), createNetworkPolicyRule()])}>
                      Add Rule
                    </Button>
                  </GridItem>
                )}
              </Grid>
            )}
          </ExpandableSection>

          {/* MultiNetworkPolicy */}
          <ExpandableSection toggleText={
            <span>
              MultiNetworkPolicy
              {!multiNetPolicySupported && <Label isCompact color="grey" style={{ marginLeft: '8px' }}>N/A for this config</Label>}
            </span>
          }>
            {multiNetPolicySupported ? (
              <>
                <Checkbox
                  id="mnp-enabled"
                  label="Enable MultiNetworkPolicy"
                  description="Apply network policy to secondary/additional networks."
                  isChecked={sec.multi_network_policy?.enabled || false}
                  onChange={(_, v) => tSet('security.multi_network_policy', v
                    ? { enabled: true, template: sec.multi_network_policy?.template || 'none', custom_rules: sec.multi_network_policy?.custom_rules || [] }
                    : { enabled: false })}
                  style={{ marginBottom: '12px' }}
                />
                {sec.multi_network_policy?.enabled && (
                  <Grid hasGutter>
                    <GridItem span={6}>
                      <FormGroup label="Policy Template">
                        {MULTI_NETWORK_POLICY_TEMPLATES.map(tmpl => (
                          <Radio
                            key={tmpl.value}
                            id={`mnp-tmpl-${tmpl.value}`}
                            name="mnp-template"
                            label={tmpl.label}
                            description={tmpl.description}
                            isChecked={(sec.multi_network_policy?.template || 'none') === tmpl.value}
                            onChange={() => tSet('security.multi_network_policy.template', tmpl.value)}
                          />
                        ))}
                      </FormGroup>
                    </GridItem>

                    {sec.multi_network_policy?.template === 'custom' && (
                      <GridItem span={12}>
                        <Title headingLevel="h5" size="sm" style={{ marginBottom: '8px' }}>Custom MultiNetworkPolicy Rules</Title>
                        {(sec.multi_network_policy?.custom_rules || []).map((rule, ri) => (
                          <Card key={ri} style={{ marginBottom: '8px' }}>
                            <CardBody>
                              <Grid hasGutter>
                                <GridItem span={3}>
                                  <FormGroup label="Direction">
                                    <Radio id={`mnp-rule-${ri}-ingress`} name={`mnp-rule-dir-${ri}`} label="Ingress"
                                      isChecked={rule.direction === 'ingress'} onChange={() => {
                                        const rules = [...(sec.multi_network_policy?.custom_rules || [])];
                                        rules[ri] = { ...rules[ri], direction: 'ingress' };
                                        tSet('security.multi_network_policy.custom_rules', rules);
                                      }} />
                                    <Radio id={`mnp-rule-${ri}-egress`} name={`mnp-rule-dir-${ri}`} label="Egress"
                                      isChecked={rule.direction === 'egress'} onChange={() => {
                                        const rules = [...(sec.multi_network_policy?.custom_rules || [])];
                                        rules[ri] = { ...rules[ri], direction: 'egress' };
                                        tSet('security.multi_network_policy.custom_rules', rules);
                                      }} />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={3}>
                                  <FormGroup label="Protocol">
                                    <TextInput value={rule.protocol || ''} placeholder="TCP"
                                      onChange={(_, v) => {
                                        const rules = [...(sec.multi_network_policy?.custom_rules || [])];
                                        rules[ri] = { ...rules[ri], protocol: v };
                                        tSet('security.multi_network_policy.custom_rules', rules);
                                      }} />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={2}>
                                  <FormGroup label="Port">
                                    <TextInput value={rule.port || ''} placeholder="8080"
                                      onChange={(_, v) => {
                                        const rules = [...(sec.multi_network_policy?.custom_rules || [])];
                                        rules[ri] = { ...rules[ri], port: v };
                                        tSet('security.multi_network_policy.custom_rules', rules);
                                      }} />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={3}>
                                  <FormGroup label="CIDR / Namespace Selector">
                                    <TextInput value={rule.cidr || ''} placeholder="10.0.0.0/8 or ns-selector"
                                      onChange={(_, v) => {
                                        const rules = [...(sec.multi_network_policy?.custom_rules || [])];
                                        rules[ri] = { ...rules[ri], cidr: v };
                                        tSet('security.multi_network_policy.custom_rules', rules);
                                      }} />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={1}>
                                  <div style={{ paddingTop: '28px' }}>
                                    <Button variant="plain" isDanger aria-label="Remove rule"
                                      onClick={() => tSet('security.multi_network_policy.custom_rules',
                                        (sec.multi_network_policy?.custom_rules || []).filter((_, i) => i !== ri))}>
                                      <TrashIcon />
                                    </Button>
                                  </div>
                                </GridItem>
                              </Grid>
                            </CardBody>
                          </Card>
                        ))}
                        <Button variant="link" icon={<PlusCircleIcon />}
                          onClick={() => tSet('security.multi_network_policy.custom_rules',
                            [...(sec.multi_network_policy?.custom_rules || []), createNetworkPolicyRule()])}>
                          Add Rule
                        </Button>
                      </GridItem>
                    )}
                  </Grid>
                )}
              </>
            ) : (
              <p style={{ color: muted }}>
                MultiNetworkPolicy is not applicable for the current network configuration.
                It applies to secondary networks using NetworkAttachmentDefinitions.
              </p>
            )}
          </ExpandableSection>

          {/* EgressFirewall */}
          <ExpandableSection toggleText={
            <span>EgressFirewall {infoPopover('egress_firewall')}</span>
          }>
            <Checkbox
              id="ef-enabled"
              label="Enable EgressFirewall"
              description="Control outbound traffic from this tenant's namespaces."
              isChecked={ef.enabled}
              onChange={(_, v) => tSet('security.egress_firewall.enabled', v)}
              style={{ marginBottom: '12px' }}
            />
            {ef.enabled && (
              <>
                <Alert variant="info" isInline isPlain title="EgressFirewall" style={{ marginBottom: '12px' }}>
                  One EgressFirewall resource per namespace. Rules are evaluated in order. Add Allow or Deny rules for CIDR or DNS destinations.
                </Alert>
                {(ef.rules || []).map((rule, ri) => (
                  <Grid hasGutter key={ri} style={{ marginBottom: '8px' }}>
                    <GridItem span={2}>
                      <FormGroup label={ri === 0 ? 'Action' : ''}>
                        <Radio id={`ef-${ri}-allow`} name={`ef-action-${ri}`} label="Allow"
                          isChecked={rule.type === 'Allow'} onChange={() => {
                            const rules = [...(ef.rules || [])];
                            rules[ri] = { ...rules[ri], type: 'Allow' };
                            tSet('security.egress_firewall.rules', rules);
                          }} />
                        <Radio id={`ef-${ri}-deny`} name={`ef-action-${ri}`} label="Deny"
                          isChecked={rule.type === 'Deny'} onChange={() => {
                            const rules = [...(ef.rules || [])];
                            rules[ri] = { ...rules[ri], type: 'Deny' };
                            tSet('security.egress_firewall.rules', rules);
                          }} />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={3}>
                      <FormGroup label={ri === 0 ? 'Destination Type' : ''}>
                        <Radio id={`ef-${ri}-cidr`} name={`ef-dest-${ri}`} label="CIDR"
                          isChecked={rule.to?.cidrSelector !== undefined}
                          onChange={() => {
                            const rules = [...(ef.rules || [])];
                            rules[ri] = { ...rules[ri], to: { cidrSelector: rules[ri].to?.cidrSelector || '' } };
                            tSet('security.egress_firewall.rules', rules);
                          }} />
                        <Radio id={`ef-${ri}-dns`} name={`ef-dest-${ri}`} label="DNS Name"
                          isChecked={rule.to?.dnsName !== undefined}
                          onChange={() => {
                            const rules = [...(ef.rules || [])];
                            rules[ri] = { ...rules[ri], to: { dnsName: rules[ri].to?.dnsName || '' } };
                            tSet('security.egress_firewall.rules', rules);
                          }} />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={5}>
                      <FormGroup label={ri === 0 ? 'Destination' : ''}>
                        <TextInput
                          value={rule.to?.cidrSelector || rule.to?.dnsName || ''}
                          placeholder={rule.to?.dnsName !== undefined ? 'example.com' : '0.0.0.0/0'}
                          onChange={(_, v) => {
                            const rules = [...(ef.rules || [])];
                            const key = rules[ri].to?.dnsName !== undefined ? 'dnsName' : 'cidrSelector';
                            rules[ri] = { ...rules[ri], to: { [key]: v } };
                            tSet('security.egress_firewall.rules', rules);
                          }}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={2}>
                      <div style={{ paddingTop: ri === 0 ? '28px' : '0' }}>
                        <Button variant="plain" isDanger aria-label="Remove egress rule"
                          onClick={() => tSet('security.egress_firewall.rules',
                            (ef.rules || []).filter((_, i) => i !== ri))}>
                          <TrashIcon />
                        </Button>
                      </div>
                    </GridItem>
                  </Grid>
                ))}
                <Button variant="link" icon={<PlusCircleIcon />}
                  onClick={() => tSet('security.egress_firewall.rules',
                    [...(ef.rules || []), createEgressFirewallRule()])}>
                  Add Egress Rule
                </Button>
              </>
            )}
          </ExpandableSection>
        </>
      );
    };

    /* ─ Connectivity tab ─ */
    const renderConnectivityTab = () => {
      const conn = tenant.connectivity || {};
      const eip = conn.egress_ip || { enabled: false, addresses: [], namespace_selector: {} };

      return (
        <>
          <p style={{ color: muted, marginBottom: '12px' }}>
            Configure egress connectivity for this tenant.
          </p>
          <ExpandableSection toggleText="EgressIP" isExpanded>
            <Checkbox
              id="eip-enabled"
              label="Enable EgressIP"
              description="Assign stable source IPs for outbound traffic from this tenant's namespaces."
              isChecked={eip.enabled}
              onChange={(_, v) => tSet('connectivity.egress_ip.enabled', v)}
              style={{ marginBottom: '12px' }}
            />
            {eip.enabled && (
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="EgressIP Addresses (one per line)">
                    <TextArea
                      value={(eip.addresses || []).join('\n')}
                      onChange={(_, v) => tSet('connectivity.egress_ip.addresses', v.split('\n').map(l => l.trim()).filter(Boolean))}
                      rows={3}
                      placeholder="192.168.1.100"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup label="Namespace Selector (key=value per line)">
                    <TextArea
                      value={
                        Object.entries(eip.namespace_selector || {})
                          .map(([k, v]) => `${k}=${v}`)
                          .join('\n')
                      }
                      onChange={(_, v) => {
                        const sel = {};
                        v.split('\n').forEach(line => {
                          const [lk, ...lv] = line.split('=');
                          if (lk?.trim()) sel[lk.trim()] = (lv.join('=') || '').trim();
                        });
                        tSet('connectivity.egress_ip.namespace_selector', sel);
                      }}
                      rows={3}
                      placeholder="tenant=finance"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            )}
          </ExpandableSection>
        </>
      );
    };

    /* ─ Modal ─ */
    return (
      <Modal
        variant={ModalVariant.large}
        isOpen
        onClose={() => setEditingTenantIdx(null)}
        aria-label="Edit tenant network"
        style={{ maxWidth: '1100px' }}
      >
        <ModalHeader title={`Tenant: ${tenant.tenant_name || '(new tenant)'}`} />
        <ModalBody>
          {!validation.valid && (
            <Alert variant="warning" isInline title="Validation issues" style={{ marginBottom: '12px' }}>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {validation.errors.map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
            </Alert>
          )}
          <Tabs activeKey={editingTenantTab} onSelect={(_, key) => setEditingTenantTab(key)}>
            <Tab eventKey="info" title="Tenant Info" />
            <Tab eventKey="namespaces" title="Namespaces" />
            <Tab eventKey="segment" title="Network Segment" />
            <Tab eventKey="security" title="Security" />
            <Tab eventKey="connectivity" title="Connectivity" />
          </Tabs>
          <div style={{ marginTop: '16px' }}>
            {editingTenantTab === 'info' && renderTenantInfoTab()}
            {editingTenantTab === 'namespaces' && renderNamespacesTab()}
            {editingTenantTab === 'segment' && renderNetworkSegmentTab()}
            {editingTenantTab === 'security' && renderSecurityTab()}
            {editingTenantTab === 'connectivity' && renderConnectivityTab()}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setEditingTenantIdx(null)}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Security Policies Tab (Cluster-level)
   * ════════════════════════════════════════════════════════════════ */

  const renderSecurityPoliciesTab = () => {
    const cs = net.cluster_security || {};
    const anps = cs.admin_network_policies || [];
    const banp = cs.baseline_admin_network_policy;

    return (
      <>
        <Title headingLevel="h3" size="lg" style={{ marginBottom: '8px' }}>
          Cluster-Level Security Policies
          {infoPopover('firewall')}
        </Title>
        <p style={{ color: muted, marginBottom: '16px' }}>
          Cluster-scoped security policies managed by the platform administrator. These take precedence over
          namespace-level NetworkPolicy (for AdminNetworkPolicy) or provide a baseline (BaselineAdminNetworkPolicy).
        </p>

        {/* AdminNetworkPolicy */}
        <ExpandableSection toggleText={
          <span>
            <strong>AdminNetworkPolicy</strong> — Cluster admin policies with precedence over namespace policy
            {featureStatusBadge(supportsFeature({ policyType: 'AdminNetworkPolicy', ocpVersion: net.ocp_version }).status)}
          </span>
        } isExpanded>
          <p style={{ color: muted, marginBottom: '12px' }}>
            AdminNetworkPolicy resources are evaluated before namespace-scoped NetworkPolicy.
            Lower priority numbers are evaluated first. Use these for cluster-wide security mandates.
          </p>
          {anps.map((anp, i) => (
            <Card key={i} style={{ marginBottom: '12px' }}>
              <CardBody>
                <Grid hasGutter>
                  <GridItem span={4}>
                    <FormGroup label="Policy Name" isRequired>
                      <TextInput
                        value={anp.name || ''}
                        onChange={(_, v) => {
                          const next = [...anps];
                          next[i] = { ...next[i], name: v };
                          setNet('cluster_security.admin_network_policies', next);
                        }}
                      />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={2}>
                    <FormGroup label="Priority">
                      <TextInput
                        type="number"
                        value={anp.priority ?? 100}
                        onChange={(_, v) => {
                          const next = [...anps];
                          next[i] = { ...next[i], priority: parseInt(v, 10) || 0 };
                          setNet('cluster_security.admin_network_policies', next);
                        }}
                      />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={5}>
                    <FormGroup label="Subject Namespace Selector (key=value)">
                      <TextInput
                        value={
                          Object.entries(anp.subject?.namespaceSelector?.matchLabels || {})
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')
                        }
                        onChange={(_, v) => {
                          const labels = {};
                          v.split(',').forEach(pair => {
                            const [pk, ...pv] = pair.split('=');
                            if (pk?.trim()) labels[pk.trim()] = (pv.join('=') || '').trim();
                          });
                          const next = [...anps];
                          next[i] = {
                            ...next[i],
                            subject: { namespaceSelector: { matchLabels: labels } }
                          };
                          setNet('cluster_security.admin_network_policies', next);
                        }}
                        placeholder="tenant=finance"
                      />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={1}>
                    <div style={{ paddingTop: '28px' }}>
                      <Button variant="plain" isDanger aria-label="Delete ANP"
                        onClick={() => setNet('cluster_security.admin_network_policies', anps.filter((_, j) => j !== i))}>
                        <TrashIcon />
                      </Button>
                    </div>
                  </GridItem>

                  {/* ANP Rules */}
                  <GridItem span={12}>
                    <Title headingLevel="h5" size="sm">Rules</Title>
                    {(anp.rules || []).map((rule, ri) => (
                      <Grid hasGutter key={ri} style={{ marginBottom: '4px', paddingLeft: '16px' }}>
                        <GridItem span={2}>
                          <FormGroup label={ri === 0 ? 'Action' : ''}>
                            {ANP_ACTION_OPTIONS.map(opt => (
                              <Radio key={opt.value} id={`anp-${i}-rule-${ri}-${opt.value}`}
                                name={`anp-${i}-rule-${ri}-action`} label={opt.label}
                                isChecked={rule.action === opt.value}
                                onChange={() => {
                                  const next = [...anps];
                                  const rules = [...(next[i].rules || [])];
                                  rules[ri] = { ...rules[ri], action: opt.value };
                                  next[i] = { ...next[i], rules };
                                  setNet('cluster_security.admin_network_policies', next);
                                }}
                              />
                            ))}
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup label={ri === 0 ? 'Direction' : ''}>
                            <Radio id={`anp-${i}-rule-${ri}-in`} name={`anp-${i}-rule-${ri}-dir`} label="Ingress"
                              isChecked={rule.direction === 'ingress'}
                              onChange={() => {
                                const next = [...anps];
                                const rules = [...(next[i].rules || [])];
                                rules[ri] = { ...rules[ri], direction: 'ingress' };
                                next[i] = { ...next[i], rules };
                                setNet('cluster_security.admin_network_policies', next);
                              }} />
                            <Radio id={`anp-${i}-rule-${ri}-out`} name={`anp-${i}-rule-${ri}-dir`} label="Egress"
                              isChecked={rule.direction === 'egress'}
                              onChange={() => {
                                const next = [...anps];
                                const rules = [...(next[i].rules || [])];
                                rules[ri] = { ...rules[ri], direction: 'egress' };
                                next[i] = { ...next[i], rules };
                                setNet('cluster_security.admin_network_policies', next);
                              }} />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup label={ri === 0 ? 'Peer Namespace Selector' : ''}>
                            <TextInput value={rule.peer_namespace_selector || ''} placeholder="key=value"
                              onChange={(_, v) => {
                                const next = [...anps];
                                const rules = [...(next[i].rules || [])];
                                rules[ri] = { ...rules[ri], peer_namespace_selector: v };
                                next[i] = { ...next[i], rules };
                                setNet('cluster_security.admin_network_policies', next);
                              }} />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup label={ri === 0 ? 'Port' : ''}>
                            <TextInput value={rule.port || ''} placeholder="443"
                              onChange={(_, v) => {
                                const next = [...anps];
                                const rules = [...(next[i].rules || [])];
                                rules[ri] = { ...rules[ri], port: v };
                                next[i] = { ...next[i], rules };
                                setNet('cluster_security.admin_network_policies', next);
                              }} />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={1}>
                          <FormGroup label={ri === 0 ? 'Protocol' : ''}>
                            <TextInput value={rule.protocol || ''} placeholder="TCP"
                              onChange={(_, v) => {
                                const next = [...anps];
                                const rules = [...(next[i].rules || [])];
                                rules[ri] = { ...rules[ri], protocol: v };
                                next[i] = { ...next[i], rules };
                                setNet('cluster_security.admin_network_policies', next);
                              }} />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <div style={{ paddingTop: ri === 0 ? '28px' : '0' }}>
                            <Button variant="plain" isDanger aria-label="Remove rule"
                              onClick={() => {
                                const next = [...anps];
                                next[i] = { ...next[i], rules: (next[i].rules || []).filter((_, j) => j !== ri) };
                                setNet('cluster_security.admin_network_policies', next);
                              }}>
                              <TrashIcon />
                            </Button>
                          </div>
                        </GridItem>
                      </Grid>
                    ))}
                    <Button variant="link" icon={<PlusCircleIcon />}
                      onClick={() => {
                        const next = [...anps];
                        next[i] = { ...next[i], rules: [...(next[i].rules || []), createAdminNetworkPolicyRule()] };
                        setNet('cluster_security.admin_network_policies', next);
                      }}>
                      Add Rule
                    </Button>
                  </GridItem>
                </Grid>
              </CardBody>
            </Card>
          ))}
          <Button variant="secondary" icon={<PlusCircleIcon />}
            onClick={() => setNet('cluster_security.admin_network_policies', [...anps, createAdminNetworkPolicy()])}>
            Add AdminNetworkPolicy
          </Button>
        </ExpandableSection>

        {/* BaselineAdminNetworkPolicy */}
        <ExpandableSection
          toggleText={<span><strong>BaselineAdminNetworkPolicy</strong> — Cluster-level default rules (lower precedence than NetworkPolicy)</span>}
          style={{ marginTop: '16px' }}
        >
          <p style={{ color: muted, marginBottom: '12px' }}>
            The BaselineAdminNetworkPolicy is a singleton resource that provides default cluster-wide rules.
            These rules are evaluated only when no AdminNetworkPolicy or NetworkPolicy determines the result.
          </p>
          <Checkbox
            id="banp-enabled"
            label="Enable BaselineAdminNetworkPolicy"
            isChecked={banp?.enabled || false}
            onChange={(_, v) => setNet('cluster_security.baseline_admin_network_policy', v ? { enabled: true, rules: banp?.rules || [] } : null)}
            style={{ marginBottom: '12px' }}
          />
          {banp?.enabled && (
            <>
              {(banp.rules || []).map((rule, ri) => (
                <Grid hasGutter key={ri} style={{ marginBottom: '8px' }}>
                  <GridItem span={3}>
                    <FormGroup label={ri === 0 ? 'Action' : ''}>
                      <Radio id={`banp-rule-${ri}-allow`} name={`banp-action-${ri}`} label="Allow"
                        isChecked={rule.action === 'Allow'} onChange={() => {
                          const rules = [...(banp.rules || [])];
                          rules[ri] = { ...rules[ri], action: 'Allow' };
                          setNet('cluster_security.baseline_admin_network_policy.rules', rules);
                        }} />
                      <Radio id={`banp-rule-${ri}-deny`} name={`banp-action-${ri}`} label="Deny"
                        isChecked={rule.action === 'Deny'} onChange={() => {
                          const rules = [...(banp.rules || [])];
                          rules[ri] = { ...rules[ri], action: 'Deny' };
                          setNet('cluster_security.baseline_admin_network_policy.rules', rules);
                        }} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={3}>
                    <FormGroup label={ri === 0 ? 'Direction' : ''}>
                      <Radio id={`banp-rule-${ri}-ingress`} name={`banp-dir-${ri}`} label="Ingress"
                        isChecked={rule.direction === 'ingress'} onChange={() => {
                          const rules = [...(banp.rules || [])];
                          rules[ri] = { ...rules[ri], direction: 'ingress' };
                          setNet('cluster_security.baseline_admin_network_policy.rules', rules);
                        }} />
                      <Radio id={`banp-rule-${ri}-egress`} name={`banp-dir-${ri}`} label="Egress"
                        isChecked={rule.direction === 'egress'} onChange={() => {
                          const rules = [...(banp.rules || [])];
                          rules[ri] = { ...rules[ri], direction: 'egress' };
                          setNet('cluster_security.baseline_admin_network_policy.rules', rules);
                        }} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={4}>
                    <FormGroup label={ri === 0 ? 'Peer / CIDR' : ''}>
                      <TextInput value={rule.peer || ''} placeholder="0.0.0.0/0" onChange={(_, v) => {
                        const rules = [...(banp.rules || [])];
                        rules[ri] = { ...rules[ri], peer: v };
                        setNet('cluster_security.baseline_admin_network_policy.rules', rules);
                      }} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={2}>
                    <div style={{ paddingTop: ri === 0 ? '28px' : '0' }}>
                      <Button variant="plain" isDanger aria-label="Remove BANP rule"
                        onClick={() => setNet('cluster_security.baseline_admin_network_policy.rules',
                          (banp.rules || []).filter((_, i) => i !== ri))}>
                        <TrashIcon />
                      </Button>
                    </div>
                  </GridItem>
                </Grid>
              ))}
              <Button variant="link" icon={<PlusCircleIcon />}
                onClick={() => setNet('cluster_security.baseline_admin_network_policy.rules',
                  [...(banp.rules || []), { action: 'Deny', direction: 'ingress', peer: '' }])}>
                Add Baseline Rule
              </Button>
            </>
          )}
        </ExpandableSection>

        {/* Policy precedence info */}
        <Alert variant="info" isInline title="Policy Evaluation Order" style={{ marginTop: '16px' }}>
          <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
            <li><strong>AdminNetworkPolicy</strong> — evaluated first, lowest priority number wins</li>
            <li><strong>NetworkPolicy</strong> — namespace-scoped policy, evaluated next</li>
            <li><strong>BaselineAdminNetworkPolicy</strong> — evaluated last, only if no prior rule matched</li>
          </ol>
        </Alert>
      </>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Physical Networks Tab
   * ════════════════════════════════════════════════════════════════ */

  const renderPhysicalNetworksTab = () => {
    const pns = physicalNetworks;

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <Title headingLevel="h3" size="lg">
              Physical Networks
              {infoPopover('physical_network')}
            </Title>
            <p style={{ color: muted, marginTop: '4px' }}>
              Define physical network infrastructure (VLAN-backed, bridge-based) that tenant networks can reference.
              Physical networks are managed through Kubernetes NMState and are reusable by multiple tenants.
            </p>
          </div>
          <Button variant="primary" icon={<PlusCircleIcon />}
            onClick={() => {
              updatePhysicalNetworks(list => [...list, createPhysicalNetwork()]);
              setEditingPhysNetIdx(pns.length);
            }}>
            Add Physical Network
          </Button>
        </div>

        <Alert variant="warning" isInline title="Physical Networking Safety" style={{ marginBottom: '16px' }}>
          Incorrect node network configuration (NNCP) can disrupt cluster connectivity.
          PreFlight does not modify primary management interfaces or br-ex. Review generated NNCP resources
          carefully before applying to production clusters.
        </Alert>

        {pns.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState>
                <EmptyStateBody>
                  <p style={{ color: muted }}>
                    No physical networks defined. Physical networks are optional — only needed for
                    VLAN-backed or Localnet networking. Pure overlay networks use OVN-Kubernetes
                    without physical network configuration.
                  </p>
                </EmptyStateBody>
              </EmptyState>
            </CardBody>
          </Card>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`, textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  <th style={{ padding: '8px 12px' }}>Physical Network</th>
                  <th style={{ padding: '8px 12px' }}>Bridge</th>
                  <th style={{ padding: '8px 12px' }}>VLAN</th>
                  <th style={{ padding: '8px 12px' }}>NMState</th>
                  <th style={{ padding: '8px 12px' }}>Used By</th>
                  <th style={{ padding: '8px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pns.map((pn, i) => {
                  const usedBy = tenants.filter(t =>
                    (t.networks || []).some(n => n.physical_network === pn.id)
                  ).map(t => t.tenant_name).join(', ');
                  return (
                    <tr key={pn.id || i} style={{ borderBottom: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}` }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{pn.name || '(unnamed)'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px' }}>{pn.physical_network_name || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px' }}>{pn.bridge || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{pn.default_vlan || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {pn.managed_by_nmstate ? (
                          <Label isCompact color="blue">Managed</Label>
                        ) : (
                          <Label isCompact color="grey">Manual</Label>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: muted }}>{usedBy || '—'}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <Button variant="plain" onClick={() => setEditingPhysNetIdx(i)}>Edit</Button>
                        <Button variant="plain" isDanger aria-label="Delete"
                          onClick={() => setShowConfirmDelete({ type: 'physical', idx: i })}>
                          <TrashIcon />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Physical network edit modal */}
        {editingPhysNetIdx !== null && pns[editingPhysNetIdx] && (() => {
          const pi = editingPhysNetIdx;
          const pn = pns[pi];
          const pnValidation = validatePhysicalNetwork(pn);
          const updatePN = (field, value) => {
            updatePhysicalNetworks(list => {
              const next = [...list];
              next[pi] = { ...next[pi], [field]: value };
              return next;
            });
          };
          const updatePNNested = (path, value) => {
            updatePhysicalNetworks(list => {
              const next = [...list];
              const obj = JSON.parse(JSON.stringify(next[pi]));
              const keys = path.split('.');
              let target = obj;
              keys.slice(0, -1).forEach(k => { if (!target[k]) target[k] = {}; target = target[k]; });
              target[keys[keys.length - 1]] = value;
              next[pi] = obj;
              return next;
            });
          };

          return (
            <Modal
              variant={ModalVariant.medium}
              isOpen
              onClose={() => setEditingPhysNetIdx(null)}
              aria-label="Edit physical network"
            >
              <ModalHeader title={`Physical Network: ${pn.name || '(new)'}`} />
              <ModalBody>
                {!pnValidation.valid && (
                  <Alert variant="warning" isInline title="Validation issues" style={{ marginBottom: '12px' }}>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {pnValidation.errors.map((e, i) => <li key={i}>{e.message}</li>)}
                    </ul>
                  </Alert>
                )}
                <Grid hasGutter>
                  <GridItem span={6}>
                    <FormGroup label="Name (PreFlight identifier)" isRequired>
                      <TextInput value={pn.name || ''} onChange={(_, v) => updatePN('name', v)} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup label="OVN Physical Network Name" isRequired>
                      <TextInput value={pn.physical_network_name || ''} onChange={(_, v) => updatePN('physical_network_name', v)}
                        placeholder="vm-network" />
                      <p style={{ color: muted, fontSize: '12px', marginTop: '2px' }}>
                        The name used in OVN bridge-mapping and Localnet configuration.
                      </p>
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup label="Linux Bridge Name" isRequired>
                      <TextInput value={pn.bridge || ''} onChange={(_, v) => updatePN('bridge', v)} placeholder="br1" />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup label="Default VLAN ID">
                      <TextInput type="number" value={pn.default_vlan || ''} onChange={(_, v) => updatePN('default_vlan', parseInt(v, 10) || null)}
                        placeholder="Optional" />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={12}>
                    <Checkbox
                      id={`pn-nmstate-${pi}`}
                      label="Managed by Kubernetes NMState"
                      description="Generate NMState Operator installation and NNCP for this bridge. Disable if bridges are pre-configured."
                      isChecked={pn.managed_by_nmstate !== false}
                      onChange={(_, v) => updatePN('managed_by_nmstate', v)}
                    />
                  </GridItem>
                  {pn.managed_by_nmstate !== false && (
                    <>
                      <GridItem span={12}>
                        <Alert variant="warning" isInline title="NNCP Safety Warning">
                          NodeNetworkConfigurationPolicy changes take effect on matching nodes immediately.
                          Incorrect configuration can disrupt node connectivity and cause outages.
                          Never configure the primary management interface or modify br-ex unless
                          you have verified compatibility with the node network topology.
                        </Alert>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Interface Type">
                          <Radio id={`pn-bridge-${pi}`} name={`pn-iftype-${pi}`} label="Bridge"
                            isChecked={(pn.interface_config?.type || 'bridge') === 'bridge'}
                            onChange={() => updatePNNested('interface_config.type', 'bridge')} />
                          <Radio id={`pn-bond-${pi}`} name={`pn-iftype-${pi}`} label="Bond"
                            isChecked={pn.interface_config?.type === 'bond'}
                            onChange={() => updatePNNested('interface_config.type', 'bond')} />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Physical Interfaces (one per line)">
                          <TextArea
                            value={(pn.interface_config?.interfaces || []).join('\n')}
                            onChange={(_, v) => updatePNNested('interface_config.interfaces',
                              v.split('\n').map(l => l.trim()).filter(Boolean))}
                            rows={2}
                            placeholder="ens224"
                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                          />
                          <p style={{ color: muted, fontSize: '12px', marginTop: '2px' }}>
                            Interfaces to be attached to the bridge. Do NOT specify the primary management interface.
                          </p>
                        </FormGroup>
                      </GridItem>
                      {pn.interface_config?.type === 'bond' && (
                        <GridItem span={6}>
                          <FormGroup label="Bond Mode">
                            <TextInput value={pn.interface_config?.bond_mode || ''} onChange={(_, v) => updatePNNested('interface_config.bond_mode', v)}
                              placeholder="balance-rr" />
                          </FormGroup>
                        </GridItem>
                      )}
                      <GridItem span={6}>
                        <FormGroup label="Node Selector (key=value per line)">
                          <TextArea
                            value={
                              Object.entries(pn.node_selector || {})
                                .map(([k, v]) => `${k}=${v}`)
                                .join('\n')
                            }
                            onChange={(_, v) => {
                              const sel = {};
                              v.split('\n').forEach(line => {
                                const [lk, ...lv] = line.split('=');
                                if (lk?.trim()) sel[lk.trim()] = (lv.join('=') || '').trim();
                              });
                              updatePN('node_selector', sel);
                            }}
                            rows={2}
                            placeholder="node-role.kubernetes.io/worker="
                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                          />
                        </FormGroup>
                      </GridItem>
                    </>
                  )}
                </Grid>
              </ModalBody>
              <ModalFooter>
                <Button variant="primary" onClick={() => setEditingPhysNetIdx(null)}>Done</Button>
              </ModalFooter>
            </Modal>
          );
        })()}
      </>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: North/South Connectivity Tab
   * ════════════════════════════════════════════════════════════════ */

  const renderConnectivityTab = () => {
    const lb = net.load_balancing?.metallb || { enabled: false };
    const ingress = net.ingress || {};

    return (
      <>
        <Title headingLevel="h3" size="lg" style={{ marginBottom: '8px' }}>
          North/South Connectivity
          {infoPopover('north_south')}
        </Title>
        <p style={{ color: muted, marginBottom: '16px' }}>
          Configure ingress, load balancing, and egress connectivity for traffic entering and leaving the cluster.
        </p>

        {/* Ingress */}
        <ExpandableSection toggleText={<strong>Ingress</strong>} isExpanded>
          <p style={{ color: muted, marginBottom: '12px' }}>
            The default IngressController is built in. Configure additional IngressControllers or
            ingress-related settings here.
          </p>
          <Checkbox
            id="ingress-custom"
            label="Configure additional IngressController"
            isChecked={ingress.additional_ingress_controller?.enabled || false}
            onChange={(_, v) => setNet('ingress.additional_ingress_controller', v
              ? { enabled: true, name: '', domain: '', replicas: 2, endpoint_publishing: 'HostNetwork' }
              : { enabled: false }
            )}
          />
          {ingress.additional_ingress_controller?.enabled && (
            <Grid hasGutter style={{ marginTop: '12px' }}>
              <GridItem span={4}>
                <FormGroup label="Name">
                  <TextInput value={ingress.additional_ingress_controller.name || ''}
                    onChange={(_, v) => setNet('ingress.additional_ingress_controller.name', v)}
                    placeholder="internal" />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Domain">
                  <TextInput value={ingress.additional_ingress_controller.domain || ''}
                    onChange={(_, v) => setNet('ingress.additional_ingress_controller.domain', v)}
                    placeholder="internal.apps.example.com" />
                </FormGroup>
              </GridItem>
              <GridItem span={2}>
                <FormGroup label="Replicas">
                  <TextInput type="number" value={ingress.additional_ingress_controller.replicas || 2}
                    onChange={(_, v) => setNet('ingress.additional_ingress_controller.replicas', parseInt(v, 10) || 2)} />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Endpoint Publishing Strategy">
                  <Radio id="ep-hostnet" name="ep-strategy" label="HostNetwork"
                    isChecked={(ingress.additional_ingress_controller.endpoint_publishing || 'HostNetwork') === 'HostNetwork'}
                    onChange={() => setNet('ingress.additional_ingress_controller.endpoint_publishing', 'HostNetwork')} />
                  <Radio id="ep-lb" name="ep-strategy" label="LoadBalancerService"
                    isChecked={ingress.additional_ingress_controller.endpoint_publishing === 'LoadBalancerService'}
                    onChange={() => setNet('ingress.additional_ingress_controller.endpoint_publishing', 'LoadBalancerService')} />
                  <Radio id="ep-np" name="ep-strategy" label="NodePortService"
                    isChecked={ingress.additional_ingress_controller.endpoint_publishing === 'NodePortService'}
                    onChange={() => setNet('ingress.additional_ingress_controller.endpoint_publishing', 'NodePortService')} />
                </FormGroup>
              </GridItem>
            </Grid>
          )}
        </ExpandableSection>

        {/* MetalLB */}
        <ExpandableSection toggleText={<strong>MetalLB</strong>} isExpanded={lb.enabled} style={{ marginTop: '16px' }}>
          <p style={{ color: muted, marginBottom: '12px' }}>
            MetalLB provides LoadBalancer services for bare-metal or on-premise clusters without a cloud provider.
            Only configure MetalLB if your environment does not have an external load balancer.
          </p>
          <Checkbox
            id="metallb-enabled"
            label="Enable MetalLB"
            description="Install MetalLB Operator and configure address pools and advertisements."
            isChecked={lb.enabled}
            onChange={(_, v) => setNet('load_balancing.metallb.enabled', v)}
            style={{ marginBottom: '12px' }}
          />
          {lb.enabled && (
            <>
              {/* Address Pools */}
              <Title headingLevel="h4" size="md" style={{ marginBottom: '8px' }}>IP Address Pools</Title>
              {(lb.address_pools || []).map((pool, pi) => {
                const poolValid = validateMetalLBPool(pool);
                return (
                  <Card key={pi} style={{ marginBottom: '8px' }}>
                    <CardBody>
                      <Grid hasGutter>
                        <GridItem span={4}>
                          <FormGroup label="Pool Name" isRequired>
                            <TextInput value={pool.name || ''} onChange={(_, v) => {
                              const pools = [...(lb.address_pools || [])];
                              pools[pi] = { ...pools[pi], name: v };
                              setNet('load_balancing.metallb.address_pools', pools);
                            }} />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={6}>
                          <FormGroup label="Addresses (CIDR or range, one per line)">
                            <TextArea
                              value={(pool.addresses || []).join('\n')}
                              onChange={(_, v) => {
                                const pools = [...(lb.address_pools || [])];
                                pools[pi] = { ...pools[pi], addresses: v.split('\n').map(l => l.trim()).filter(Boolean) };
                                setNet('load_balancing.metallb.address_pools', pools);
                              }}
                              rows={2}
                              placeholder="192.168.1.200-192.168.1.210"
                              style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <div style={{ paddingTop: '28px' }}>
                            <Checkbox id={`pool-auto-${pi}`} label="Auto-assign"
                              isChecked={pool.auto_assign !== false}
                              onChange={(_, v) => {
                                const pools = [...(lb.address_pools || [])];
                                pools[pi] = { ...pools[pi], auto_assign: v };
                                setNet('load_balancing.metallb.address_pools', pools);
                              }} />
                            <Button variant="plain" isDanger aria-label="Delete pool"
                              onClick={() => setNet('load_balancing.metallb.address_pools',
                                (lb.address_pools || []).filter((_, i) => i !== pi))}>
                              <TrashIcon />
                            </Button>
                          </div>
                        </GridItem>
                        {!poolValid.valid && (
                          <GridItem span={12}>
                            <p style={{ color: errorColor, fontSize: '12px' }}>{poolValid.errors.map(e => e.message).join('; ')}</p>
                          </GridItem>
                        )}
                      </Grid>
                    </CardBody>
                  </Card>
                );
              })}
              <Button variant="link" icon={<PlusCircleIcon />}
                onClick={() => setNet('load_balancing.metallb.address_pools',
                  [...(lb.address_pools || []), createMetalLBAddressPool()])}>
                Add Address Pool
              </Button>

              {/* L2 Advertisement */}
              <Title headingLevel="h4" size="md" style={{ margin: '16px 0 8px' }}>L2 Advertisements</Title>
              {(lb.l2_advertisements || []).map((l2a, i) => (
                <Grid hasGutter key={i} style={{ marginBottom: '8px' }}>
                  <GridItem span={4}>
                    <FormGroup label="Name">
                      <TextInput value={l2a.name || ''} onChange={(_, v) => {
                        const ads = [...(lb.l2_advertisements || [])];
                        ads[i] = { ...ads[i], name: v };
                        setNet('load_balancing.metallb.l2_advertisements', ads);
                      }} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup label="IP Address Pools (comma-separated)">
                      <TextInput value={(l2a.ipAddressPools || []).join(', ')} onChange={(_, v) => {
                        const ads = [...(lb.l2_advertisements || [])];
                        ads[i] = { ...ads[i], ipAddressPools: v.split(',').map(s => s.trim()).filter(Boolean) };
                        setNet('load_balancing.metallb.l2_advertisements', ads);
                      }} />
                    </FormGroup>
                  </GridItem>
                  <GridItem span={2}>
                    <div style={{ paddingTop: '28px' }}>
                      <Button variant="plain" isDanger aria-label="Delete L2 ad"
                        onClick={() => setNet('load_balancing.metallb.l2_advertisements',
                          (lb.l2_advertisements || []).filter((_, j) => j !== i))}>
                        <TrashIcon />
                      </Button>
                    </div>
                  </GridItem>
                </Grid>
              ))}
              <Button variant="link" icon={<PlusCircleIcon />}
                onClick={() => setNet('load_balancing.metallb.l2_advertisements',
                  [...(lb.l2_advertisements || []), { name: '', ipAddressPools: [] }])}>
                Add L2 Advertisement
              </Button>

              {/* BGP */}
              <ExpandableSection toggleText="BGP Configuration (Advanced)" style={{ marginTop: '16px' }}>
                <Title headingLevel="h5" size="sm" style={{ marginBottom: '8px' }}>BGP Peers</Title>
                {(lb.bgp_peers || []).map((peer, i) => (
                  <Card key={i} style={{ marginBottom: '8px' }}>
                    <CardBody>
                      <Grid hasGutter>
                        <GridItem span={3}>
                          <FormGroup label="Name"><TextInput value={peer.name || ''} onChange={(_, v) => {
                            const peers = [...(lb.bgp_peers || [])]; peers[i] = { ...peers[i], name: v };
                            setNet('load_balancing.metallb.bgp_peers', peers);
                          }} /></FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup label="Peer Address"><TextInput value={peer.peerAddress || ''} onChange={(_, v) => {
                            const peers = [...(lb.bgp_peers || [])]; peers[i] = { ...peers[i], peerAddress: v };
                            setNet('load_balancing.metallb.bgp_peers', peers);
                          }} placeholder="10.0.0.1" /></FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup label="Peer ASN"><TextInput type="number" value={peer.peerASN || ''} onChange={(_, v) => {
                            const peers = [...(lb.bgp_peers || [])]; peers[i] = { ...peers[i], peerASN: parseInt(v, 10) || 0 };
                            setNet('load_balancing.metallb.bgp_peers', peers);
                          }} /></FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup label="Local ASN"><TextInput type="number" value={peer.myASN || ''} onChange={(_, v) => {
                            const peers = [...(lb.bgp_peers || [])]; peers[i] = { ...peers[i], myASN: parseInt(v, 10) || 0 };
                            setNet('load_balancing.metallb.bgp_peers', peers);
                          }} /></FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <div style={{ paddingTop: '28px' }}>
                            <Button variant="plain" isDanger aria-label="Delete BGP peer"
                              onClick={() => setNet('load_balancing.metallb.bgp_peers',
                                (lb.bgp_peers || []).filter((_, j) => j !== i))}>
                              <TrashIcon />
                            </Button>
                          </div>
                        </GridItem>
                      </Grid>
                    </CardBody>
                  </Card>
                ))}
                <Button variant="link" icon={<PlusCircleIcon />}
                  onClick={() => setNet('load_balancing.metallb.bgp_peers',
                    [...(lb.bgp_peers || []), createMetalLBBGPPeer()])}>
                  Add BGP Peer
                </Button>

                <Title headingLevel="h5" size="sm" style={{ marginTop: '16px', marginBottom: '8px' }}>BGP Advertisements</Title>
                {(lb.bgp_advertisements || []).map((bga, i) => (
                  <Grid hasGutter key={i} style={{ marginBottom: '8px' }}>
                    <GridItem span={4}>
                      <FormGroup label="Name"><TextInput value={bga.name || ''} onChange={(_, v) => {
                        const ads = [...(lb.bgp_advertisements || [])]; ads[i] = { ...ads[i], name: v };
                        setNet('load_balancing.metallb.bgp_advertisements', ads);
                      }} /></FormGroup>
                    </GridItem>
                    <GridItem span={6}>
                      <FormGroup label="IP Address Pools (comma-separated)"><TextInput
                        value={(bga.ipAddressPools || []).join(', ')} onChange={(_, v) => {
                          const ads = [...(lb.bgp_advertisements || [])]; ads[i] = { ...ads[i], ipAddressPools: v.split(',').map(s => s.trim()).filter(Boolean) };
                          setNet('load_balancing.metallb.bgp_advertisements', ads);
                        }} /></FormGroup>
                    </GridItem>
                    <GridItem span={2}>
                      <div style={{ paddingTop: '28px' }}>
                        <Button variant="plain" isDanger aria-label="Delete BGP ad"
                          onClick={() => setNet('load_balancing.metallb.bgp_advertisements',
                            (lb.bgp_advertisements || []).filter((_, j) => j !== i))}>
                          <TrashIcon />
                        </Button>
                      </div>
                    </GridItem>
                  </Grid>
                ))}
                <Button variant="link" icon={<PlusCircleIcon />}
                  onClick={() => setNet('load_balancing.metallb.bgp_advertisements',
                    [...(lb.bgp_advertisements || []), { name: '', ipAddressPools: [] }])}>
                  Add BGP Advertisement
                </Button>
              </ExpandableSection>
            </>
          )}
        </ExpandableSection>

        {/* Tenant Egress Summary */}
        <ExpandableSection toggleText={<strong>Egress Summary</strong>} style={{ marginTop: '16px' }}>
          <p style={{ color: muted, marginBottom: '12px' }}>
            EgressIP and EgressFirewall are configured per tenant in the Tenant Networks tab. This is a read-only summary.
          </p>
          {tenants.filter(t => t.connectivity?.egress_ip?.enabled).length === 0 ? (
            <p style={{ color: muted, fontStyle: 'italic' }}>No tenants have EgressIP enabled.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`, textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Tenant</th>
                  <th style={{ padding: '8px 12px' }}>EgressIP Addresses</th>
                  <th style={{ padding: '8px 12px' }}>Namespace Selector</th>
                </tr>
              </thead>
              <tbody>
                {tenants.filter(t => t.connectivity?.egress_ip?.enabled).map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}` }}>
                    <td style={{ padding: '8px 12px' }}>{t.tenant_name}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {(t.connectivity.egress_ip.addresses || []).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {Object.entries(t.connectivity.egress_ip.namespace_selector || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ExpandableSection>
      </>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Networking Components Tab
   * ════════════════════════════════════════════════════════════════ */

  const renderComponentsTab = () => (
    <>
      <Title headingLevel="h3" size="lg" style={{ marginBottom: '8px' }}>Networking Components</Title>
      <p style={{ color: muted, marginBottom: '16px' }}>
        Operators and components that will be installed or verified based on the current networking configuration.
        Dependencies are calculated automatically from selected features.
      </p>

      <Grid hasGutter>
        {dependencies.map((dep, i) => (
          <GridItem span={6} key={i}>
            <Card>
              <CardBody>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <Title headingLevel="h4" size="md">{dep.name}</Title>
                  <Label isCompact color={dep.status === 'built-in' ? 'green' : dep.status === 'required' ? 'blue' : 'grey'}>
                    {dep.status === 'built-in' ? 'Built-in' : dep.status === 'required' ? 'Will Install' : 'Not Required'}
                  </Label>
                </div>
                <DescriptionList isHorizontal isCompact>
                  {dep.required_by && dep.required_by.length > 0 && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Required by</DescriptionListTerm>
                      <DescriptionListDescription>
                        <LabelGroup>
                          {dep.required_by.map((r, ri) => <Label isCompact key={ri}>{r}</Label>)}
                        </LabelGroup>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  {dep.namespace && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Namespace</DescriptionListTerm>
                      <DescriptionListDescription><code>{dep.namespace}</code></DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  {dep.notes && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Notes</DescriptionListTerm>
                      <DescriptionListDescription>{dep.notes}</DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  {dep.uses_networks && dep.uses_networks.length > 0 && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Uses networks</DescriptionListTerm>
                      <DescriptionListDescription>
                        <LabelGroup>
                          {dep.uses_networks.map((n, ni) => <Label isCompact key={ni}>{n}</Label>)}
                        </LabelGroup>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>
        ))}
      </Grid>
    </>
  );

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Resource Preview Tab
   * ════════════════════════════════════════════════════════════════ */

  const renderResourcePreviewTab = () => {
    const grouped = {};
    generatedResources.forEach(r => {
      const category = r._category || 'Other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(r);
    });

    const categoryOrder = [
      'Namespaces', 'Logical Networks', 'Security', 'Egress / Connectivity',
      'Physical Networking', 'Operator Dependencies', 'Other'
    ];

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <Title headingLevel="h3" size="lg">Resource Preview</Title>
            <p style={{ color: muted, marginTop: '4px' }}>
              All OpenShift resources that will be generated by the current networking configuration.
              Only resources that will actually be created are shown.
            </p>
          </div>
          <Button variant="secondary" icon={<CopyIcon />}
            onClick={() => navigator.clipboard?.writeText(renderResourceYaml(generatedResources))}>
            Copy All YAML
          </Button>
        </div>

        {generatedResources.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState>
                <EmptyStateBody>
                  <p style={{ color: muted }}>
                    No resources to generate. Add tenant networks, security policies, or connectivity configuration
                    to see the generated OpenShift resources.
                  </p>
                </EmptyStateBody>
              </EmptyState>
            </CardBody>
          </Card>
        ) : (
          <>
            {/* Summary counts */}
            <div style={{ marginBottom: '16px' }}>
              <LabelGroup>
                {categoryOrder.filter(c => grouped[c]).map(category => (
                  <Label key={category} isCompact>
                    {category}: {grouped[category].length}
                  </Label>
                ))}
              </LabelGroup>
            </div>

            {categoryOrder.filter(c => grouped[c]).map(category => (
              <ExpandableSection key={category} toggleText={`${category} (${grouped[category].length})`} isExpanded>
                <pre style={{
                  fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4',
                  background: isDark ? '#151515' : '#f5f5f5',
                  padding: '14px', borderRadius: '4px', overflow: 'auto',
                  maxHeight: '600px',
                  border: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`,
                  color: isDark ? '#f0f0f0' : '#151515',
                  marginBottom: '12px'
                }}>
                  {renderResourceYaml(grouped[category])}
                </pre>
              </ExpandableSection>
            ))}
          </>
        )}
      </>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  RENDER: Confirm Delete Modal
   * ════════════════════════════════════════════════════════════════ */

  const renderConfirmDeleteModal = () => {
    if (!showConfirmDelete) return null;
    const { type, idx } = showConfirmDelete;
    const name = type === 'tenant'
      ? (tenants[idx]?.tenant_name || '(unnamed)')
      : (physicalNetworks[idx]?.name || '(unnamed)');

    return (
      <Modal
        variant={ModalVariant.small}
        isOpen
        onClose={() => setShowConfirmDelete(null)}
        aria-label="Confirm deletion"
      >
        <ModalHeader title={`Delete ${type === 'tenant' ? 'Tenant Network' : 'Physical Network'}?`} />
        <ModalBody>
          <p>
            Are you sure you want to delete <strong>{name}</strong>?
            {type === 'physical' && (() => {
              const refs = tenants.filter(t =>
                (t.networks || []).some(n => n.physical_network === physicalNetworks[idx]?.id)
              );
              if (refs.length > 0) {
                return (
                  <span style={{ color: warnColor }}>
                    {' '}This physical network is referenced by {refs.length} tenant(s): {refs.map(r => r.tenant_name).join(', ')}.
                  </span>
                );
              }
              return null;
            })()}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={() => {
            if (type === 'tenant') deleteTenant(idx);
            else {
              updatePhysicalNetworks(list => list.filter((_, i) => i !== idx));
              setShowConfirmDelete(null);
            }
          }}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setShowConfirmDelete(null)}>Cancel</Button>
        </ModalFooter>
      </Modal>
    );
  };

  /* ════════════════════════════════════════════════════════════════
   *  MAIN RENDER
   * ════════════════════════════════════════════════════════════════ */

  return (
    <>
      <p style={{ color: muted, marginBottom: '12px' }}>
        Centralized OpenShift Networking configuration. Define tenant networks, security policies,
        physical networks, and connectivity — PreFlight translates intent into supported OpenShift resources
        and idempotent Ansible automation.
      </p>

      {virtSelected && (
        <Alert variant="info" isInline isPlain title="OpenShift Virtualization detected" style={{ marginBottom: '12px' }}>
          VM-compatible networking options are available. Networks configured as Primary Layer2 with Persistent IPAM
          support VM live migration. Non-compatible configurations are flagged.
        </Alert>
      )}

      {renderGlobalSettings()}

      <Tabs
        activeKey={activeTab}
        onSelect={(_, key) => setActiveTab(key)}
        style={{ marginBottom: '16px' }}
      >
        <Tab eventKey="tenants" title="Tenant Networks" />
        <Tab eventKey="security" title="Security Policies" />
        <Tab eventKey="physical" title="Physical Networks" />
        <Tab eventKey="connectivity" title="North/South Connectivity" />
        <Tab eventKey="components" title="Networking Components" />
        <Tab eventKey="preview" title="Resource Preview" />
      </Tabs>

      {activeTab === 'tenants' && renderTenantsTab()}
      {activeTab === 'security' && renderSecurityPoliciesTab()}
      {activeTab === 'physical' && renderPhysicalNetworksTab()}
      {activeTab === 'connectivity' && renderConnectivityTab()}
      {activeTab === 'components' && renderComponentsTab()}
      {activeTab === 'preview' && renderResourcePreviewTab()}

      {renderTenantEditModal()}
      {renderConfirmDeleteModal()}
    </>
  );
}
