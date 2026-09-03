import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import PodTerminal from './PodTerminal.jsx';
import {
  Page,
  PageSection,
  Masthead,
  MastheadMain,
  MastheadBrand,
  Title,
  Card,
  CardBody,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  Radio,
  Checkbox,
  Button,
  Grid,
  GridItem,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Tabs,
  Tab,
  Popover,
  Tooltip,
  Modal,
  ModalVariant
} from '@patternfly/react-core';

import adoLogo from '../ado-logo-redhat.png';

const openshiftApps = [
  'aap','acs','acm','bookstack','cert_manager','console','devspaces','dev_hub',
  'dirsrv','eck','gitops','gitlab','grafana','kafka','minio','netbox',
  'oadp','openshift','pega','quay','rhbk'
];

const rhelApps = [
  'rhel','satellite','idm','aap','dirsrv',
  'eck','gitlab','grafana','kafka','rhbk',
  'compliance','stig'
];

const patchingApps = ['patching','satellite','idm'];
const awsApps = ['ec2_ami_copy'];
const provisionApps = ['aws_instance','openshift_virt'];

const AAP_VERSION_OPTIONS = [
  { value: '24', label: '2.4' },
  { value: '25', label: '2.5' },
  { value: '26', label: '2.6' },
  { value: '27', label: '2.7' },
];
const AAP_VERSION_DOTTED = Object.fromEntries(
  AAP_VERSION_OPTIONS.map(option => [option.value, option.label])
);

function aapDottedVersion(raw, fallback = '2.7') {
  const value = String(raw || '').trim();
  if (AAP_VERSION_DOTTED[value]) return AAP_VERSION_DOTTED[value];
  if (Object.values(AAP_VERSION_DOTTED).includes(value)) return value;
  return fallback;
}

function aapCompactVersion(raw, fallback = '27') {
  const value = String(raw || '').trim();
  if (AAP_VERSION_OPTIONS.some(option => option.value === value)) return value;
  const dotted = aapDottedVersion(value, AAP_VERSION_DOTTED[fallback] || '2.7');
  const match = AAP_VERSION_OPTIONS.find(option => option.label === dotted);
  return match ? match.value : fallback;
}

function hostnameFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).host || '';
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].trim();
  }
}

function syncDevHubGitlabTokenFromGit(source, { force = false } = {}) {
  const copy = source;
  const gitToken = String(copy?.git?.token || '').trim();
  if (!gitToken) return copy;
  if (!copy.component_config) copy.component_config = {};
  if (!copy.component_config.dev_hub) copy.component_config.dev_hub = {};
  const current = String(copy.component_config.dev_hub.gitlab_token || '').trim();
  if (force || !current) {
    copy.component_config.dev_hub.gitlab_token = gitToken;
  }
  return copy;
}

function isRhbkSelected(source) {
  const components = Array.isArray(source?.components) ? source.components : [];
  if (components.includes('all') || components.includes('rhbk')) return true;
  const openshiftApps = source?.component_apps?.openshift || [];
  return openshiftApps.includes('rhbk');
}

function isGrafanaSelected(source) {
  const components = Array.isArray(source?.components) ? source.components : [];
  if (components.includes('all') || components.includes('grafana')) return true;
  const openshiftApps = source?.component_apps?.openshift || [];
  const rhelApps = source?.component_apps?.rhel || [];
  return openshiftApps.includes('grafana') || rhelApps.includes('grafana');
}

function defaultRhbkRealm(source) {
  const realm = String(source?.component_config?.rhbk?.realm || '').trim();
  if (realm) return realm;
  const env = String(source?.environment || 'prod').trim().toLowerCase();
  if (env === 'dev') return 'Dev';
  if (env === 'prod') return 'rhlab';
  return env ? env.charAt(0).toUpperCase() + env.slice(1) : 'rhlab';
}

function buildRhbkIssuerUrl(source) {
  const rhbk = source?.component_config?.rhbk || {};
  const host = hostnameFromUrl(rhbk.hostname || rhbk.rhbk_hostname || '');
  const appsDomain = String(source?.openshift?.apps_domain || '').trim();
  const hostClean = host || (appsDomain ? `keycloak.${appsDomain}` : '');
  const realm = defaultRhbkRealm(source);
  if (!hostClean || !realm) return '';
  return `https://${hostClean}/realms/${realm}`;
}

function resolveGrafanaRhbkClientId(source) {
  const clients = source?.component_config?.rhbk?.clients;
  if (Array.isArray(clients)) {
    for (const client of clients) {
      if (!client || typeof client !== 'object') continue;
      const id = String(client.id || client.client_id || '').trim();
      if (id && /grafana/i.test(id)) return id;
    }
    for (const client of clients) {
      if (!client || typeof client !== 'object') continue;
      const name = String(client.name || '').trim();
      const id = String(client.id || client.client_id || '').trim();
      if (/grafana/i.test(name) && id) return id;
    }
  }
  return 'grafana-client';
}

/** When RHBK + Grafana are selected, fill OIDC client/issuer from RHBK; secret fetched at deploy. */
function syncGrafanaOidcFromRhbk(source, { force = false } = {}) {
  const copy = source;
  if (!isRhbkSelected(copy) || !isGrafanaSelected(copy)) return copy;
  const grafanaOpts = copy?.component_options?.grafana || [];
  if (grafanaOpts.includes('standalone')) return copy;

  if (!copy.component_options) copy.component_options = {};
  if (!copy.component_options.grafana) copy.component_options.grafana = [];
  if (!copy.component_options.grafana.includes('oidc')) {
    copy.component_options.grafana.push('oidc');
  }

  if (!copy.component_config) copy.component_config = {};
  if (!copy.component_config.grafana) copy.component_config.grafana = {};
  if (!copy.component_config.grafana.oidc) copy.component_config.grafana.oidc = {};

  const oidc = copy.component_config.grafana.oidc;
  const issuer = buildRhbkIssuerUrl(copy);
  const clientId = resolveGrafanaRhbkClientId(copy);

  oidc.enabled = oidc.enabled !== false;
  if (force || !String(oidc.client_id || '').trim()) {
    oidc.client_id = clientId;
  }
  if (force || !String(oidc.issuer || '').trim()) {
    if (issuer) oidc.issuer = issuer;
  }
  if (!oidc.client_secret_manual) {
    oidc.client_secret = '';
    oidc.fetch_secret_from_rhbk = true;
  }
  if (!Array.isArray(oidc.scopes) || oidc.scopes.length === 0) {
    oidc.scopes = ['openid', 'profile', 'email', 'groups'];
  } else if (!oidc.scopes.includes('groups')) {
    oidc.scopes = [...oidc.scopes, 'groups'];
  }
  if (!Array.isArray(oidc.role_map) || oidc.role_map.length === 0) {
    oidc.role_map = [
      { group: 'ocp-cluster-admin', role: 'GrafanaAdmin' },
      { group: 'ocp-cluster-devel', role: 'Viewer' },
      { group: 'ocp-cluster-ops', role: 'Editor' },
      { group: 'ocp-cluster-readonly', role: 'Viewer' }
    ];
  }
  if (!String(oidc.default_role || '').trim()) {
    oidc.default_role = 'Viewer';
  }
  if (!copy.component_options.rhbk) copy.component_options.rhbk = [];
  if (!copy.component_options.rhbk.includes('client_scopes')) {
    copy.component_options.rhbk.push('client_scopes');
  }
  if (!copy.component_options.rhbk.includes('client')) {
    copy.component_options.rhbk.push('client');
  }
  return copy;
}

function attachAapLicenseRequested(source) {
  const fullInstall = source?.pre_installs?.install_aap === true;
  if (fullInstall) return false;
  return source?.pre_installs?.attach_aap_license === true
    || source?.pre_installs?.aap?.license_only === true
    || source?.component_config?.aap?.license_only === true;
}

function installAapFullRequested(source) {
  return source?.pre_installs?.install_aap === true;
}

function installAapRequested(source) {
  // Full OpenShift install OR license-only attach — both need the AAP bootstrap path.
  return installAapFullRequested(source)
    || attachAapLicenseRequested(source)
    || (
      source?.component_config?.aap?.install_during_bootstrap === true
      && !attachAapLicenseRequested(source)
    );
}

function aapAppExplicitlySelected(source) {
  const apps = source?.component_apps || {};
  return ['openshift', 'rhel'].some(
    group => Array.isArray(apps[group]) && apps[group].includes('aap')
  );
}

const AAP_AUTH_DOWNLOAD_TAGS = [
  { key: 'keycloak_oidc', tag: 'add-auth-keycloak' },
  { key: 'ldap', tag: 'add-auth-ldap' },
  { key: 'keycloak_saml', tag: 'add-auth-keycloak-saml' }
];

const AAP_ORG_ROLES = ['Organization Admin', 'Organization Member', 'Organization Auditor'];
const AAP_TEAM_ROLES = ['Execute', 'Team Admin', 'Team Member', 'Team Auditor'];

function slugifyOnboardOrg(organization) {
  return String(organization || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tenant';
}

function defaultOnboardTenant(organization = 'ADO') {
  const org = String(organization || 'ADO').trim() || 'ADO';
  const slug = slugifyOnboardOrg(org);
  return {
    enabled: true,
    organization: org,
    description: `${org} tenant`,
    create_organization: true,
    admin_groups: `aap-${slug}-admins`,
    admin_role: 'Organization Admin',
    developer_groups: `aap-${slug}-developers`,
    developer_role: 'Organization Member',
    create_team: true,
    team_name: `${org}-Developers`,
    team_role: 'Execute',
    create_keycloak_groups: true
  };
}

function activeOnboardTenants(aap) {
  const tenants = aap?.onboard?.tenants;
  if (!Array.isArray(tenants)) return [];
  return tenants.filter(
    tenant => tenant && tenant.enabled !== false && String(tenant.organization || '').trim()
  );
}

function aapOnboardRequested(payload) {
  const onboard = payload?.aap?.onboard || {};
  if (onboard.enabled !== true) return false;
  return activeOnboardTenants(payload?.aap).length > 0;
}

function aapAuthDownloadTags(payload) {
  const auth = payload?.aap?.auth || {};
  return AAP_AUTH_DOWNLOAD_TAGS
    .filter(({ key }) => auth[key]?.enabled === true)
    .map(({ tag }) => tag);
}

function preflightDownloadBasename(payload, { scrubbed = false } = {}) {
  const env = payload?.environment || 'env';
  const parts = [`ado-preflight-${env}`];
  if (installAapFullRequested(payload)) {
    parts.push('install-aap-ocp');
  } else if (attachAapLicenseRequested(payload)) {
    parts.push('attach-aap-license');
  }
  if (
    payload?.pre_installs?.openshift_agent_enabled === true
    || payload?.pre_installs?.openshift_agent === true
  ) {
    parts.push('openshift-agent');
  }
  const hubOnly = aapStandaloneRun(payload);
  const hubWork = (
    hubOnly
    || payload?.aap?.hub_publish_ado_collection === true
    || payload?.aap?.hub_push_ee === true
    || payload?.hub?.publish_ado_collection === true
    || payload?.hub?.push_ee === true
  );
  const galaxyWork = payload?.aap?.galaxy_setup_enabled === true;
  // Hub-only clears components[], so name the download from Hub / Galaxy work.
  if (hubWork && galaxyWork) {
    parts.push('hub-galaxycreds');
  } else if (hubWork) {
    parts.push('hub');
  } else if (galaxyWork) {
    parts.push('galaxycreds');
  }
  aapAuthDownloadTags(payload).forEach(tag => parts.push(tag));
  if (aapOnboardRequested(payload)) parts.push('onboard');
  const components = Array.isArray(payload?.components)
    ? payload.components.filter(Boolean)
    : [];
  if (components.includes('all')) {
    parts.push('all');
  } else if (components.length > 0 && !hubOnly) {
    parts.push(components.join('-'));
  }
  if (scrubbed) parts.push('scrubbed');
  return `${parts.join('-')}.json`;
}

/** Any Add authentication tab method enabled (Keycloak OIDC, LDAP, SAML, …). */
function aapAuthConfigRequested(payload) {
  return aapAuthDownloadTags(payload).length > 0;
}

/** @deprecated alias — use aapAuthConfigRequested */
function aapStandaloneConfigRequested(payload) {
  return aapAuthConfigRequested(payload);
}

/** General → Standalone AAP run (skip component playbooks; run enabled AAP tabs only). */
function aapStandaloneRun(payload) {
  return payload?.aap?.standalone_run === true
    || payload?.aap?.hub_update_collection_only === true;
}

function syncAapStandaloneFields(aap) {
  if (!aap || typeof aap !== 'object') return;
  if (aap.standalone_run === undefined) {
    aap.standalone_run = aap.hub_update_collection_only === true;
  }
  aap.hub_update_collection_only = aap.standalone_run === true;
}

function formatBootstrapRuntime(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'unknown';
  }
  const totalSec = Math.round(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${min}m ${sec}s (${totalSec}s total)`;
  }
  if (min > 0) {
    return `${min}m ${sec}s (${totalSec}s total)`;
  }
  return `${sec}s`;
}

function extractBootstrapRuntime(result, logText) {
  if (result?.bootstrapRuntime) {
    return String(result.bootstrapRuntime);
  }
  if (Number.isFinite(result?.bootstrapRuntimeMs) && result.bootstrapRuntimeMs >= 0) {
    return formatBootstrapRuntime(result.bootstrapRuntimeMs);
  }
  const recapBlock = String(logText || '').match(
    /=== ADO Bootstrap Recap ===[\s\S]*?^Runtime:\s*(.+)$/m
  );
  if (recapBlock) {
    return recapBlock[1].trim();
  }
  const runtimeLine = String(logText || '').match(/^Runtime:\s*(.+)$/m);
  if (runtimeLine) {
    return runtimeLine[1].trim();
  }
  return '';
}

function resolveBootstrapExitCode(result, eventsText) {
  if (result?.exitCode !== undefined && result?.exitCode !== null) {
    return result.exitCode;
  }
  const match = String(eventsText || '').match(/Bootstrap finished exitCode=(\d+)/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function clearStandaloneWhenComponentsSelected(copy) {
  const components = Array.isArray(copy.components)
    ? copy.components.filter(c => c && c !== 'all')
    : [];
  if (components.length === 0) return;
  if (!copy.aap) copy.aap = {};
  copy.aap.standalone_run = false;
  copy.aap.hub_update_collection_only = false;
  if (!copy.aap.onboard) {
    copy.aap.onboard = JSON.parse(JSON.stringify(defaults.aap.onboard));
  }
  copy.aap.onboard.enabled = false;
  if (copy.aap.auth && typeof copy.aap.auth === 'object') {
    Object.values(copy.aap.auth).forEach(method => {
      if (method && typeof method === 'object' && Object.prototype.hasOwnProperty.call(method, 'enabled')) {
        method.enabled = false;
      }
    });
  }
}

/** Derive https://host/realms/rhlab from OIDC auth/token URLs. */
function keycloakRealmUrlFromOidcUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    const match = parsed.pathname.match(/(\/realms\/[^/]+)/i);
    if (!match) return '';
    return `${parsed.origin}${match[1]}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function keycloakRealmPublicKeyCurlHint(authorizationUrl, accessTokenUrl) {
  const realmUrl = keycloakRealmUrlFromOidcUrl(authorizationUrl)
    || keycloakRealmUrlFromOidcUrl(accessTokenUrl)
    || 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab';
  return `curl -sk ${realmUrl} | jq -r '.public_key'`;
}

function keycloakRealmNameFromOidcUrl(url) {
  const realmUrl = keycloakRealmUrlFromOidcUrl(url);
  if (!realmUrl) return '';
  const match = realmUrl.match(/\/realms\/([^/]+)$/i);
  return match ? match[1] : '';
}

function keycloakBaseUrlFromOidcUrl(url) {
  const realmUrl = keycloakRealmUrlFromOidcUrl(url);
  if (!realmUrl) return '';
  return realmUrl.replace(/\/realms\/[^/]+$/i, '');
}

function defaultOnboardKeycloak(aap) {
  const oidc = aap?.auth?.keycloak_oidc || {};
  const authUrl = oidc.authorization_url || oidc.access_token_url || '';
  return {
    create_groups: false,
    base_url: keycloakBaseUrlFromOidcUrl(authUrl) || 'https://keycloak.apps.ocp.prod.rhlab',
    realm: keycloakRealmNameFromOidcUrl(authUrl) || 'rhlab',
    admin_username: 'admin',
    admin_password: '',
    verify_ssl: false
  };
}

function onboardKeycloakGroupsRequested(aap) {
  const onboard = aap?.onboard || {};
  if (onboard.enabled !== true) return false;
  const kc = onboard.keycloak || {};
  if (kc.create_groups === false) return false;
  return activeOnboardTenants(aap).some(
    tenant => tenant.create_keycloak_groups !== false
      && (
        String(tenant.admin_groups || '').trim()
        || String(tenant.developer_groups || '').trim()
      )
  );
}

function aapStandaloneWorkSelected(payload) {
  return (
    payload?.aap?.hub_publish_ado_collection === true
    || payload?.aap?.hub_push_ee === true
    || payload?.aap?.galaxy_setup_enabled === true
    || aapAuthConfigRequested(payload)
    || attachAapLicenseRequested(payload)
    || installAapFullRequested(payload)
  );
}

/** Drop disabled AAP auth/onboard blocks so Download JSON stays minimal. */
function stripInactiveAapSections(payload) {
  if (!payload?.aap || typeof payload.aap !== 'object') return payload;

  if (payload.aap.auth && typeof payload.aap.auth === 'object') {
    Object.entries(payload.aap.auth).forEach(([key, value]) => {
      if (!value || value.enabled !== true) {
        delete payload.aap.auth[key];
      }
    });
    if (Object.keys(payload.aap.auth).length === 0) {
      delete payload.aap.auth;
    }
  }

  if (!aapOnboardRequested(payload)) {
    delete payload.aap.onboard;
  }

  return payload;
}

/** Redact secrets/tokens for shareable preflight JSON downloads. */
function scrubPreflightPayload(payload) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        const lower = key.toLowerCase();
        const sensitive = (
          lower.includes('password')
          || lower.includes('token')
          || lower.includes('secret')
          || lower.includes('ssh_key')
          || lower.includes('private_key')
          || lower.includes('vault')
          || lower.includes('kubeconfig')
          || lower.includes('pull_secret')
          || lower.includes('manifest_content')
          || lower.includes('oauth')
          || lower.includes('activation_key')
          || lower.endsWith('_base64')
          || lower === 'content'
        );
        out[key] = sensitive ? (child ? '[redacted]' : child) : walk(child);
      }
      return out;
    }
    return value;
  };
  const scrubbed = walk(JSON.parse(JSON.stringify(payload || {})));
  scrubbed._scrubbed = true;
  scrubbed._scrubbed_note = 'Secrets/tokens/base64 blobs replaced with [redacted]. Safe to attach in chat or tickets.';
  return scrubbed;
}

const simpleComponents = [
  'grafana','rhbk','satellite','idm','kafka',
  'gitlab','pega','elastic','jira','bookstack','netbox',
  'compliance','stig'
];

const componentOptionDefaults = {
  openshift: [
    'admin_htpasswd',
    'console_banner',
    'ldap_auth',
    'oauth_rhbk',
    'discover_routes_print',
    'alternate_routes',
    'update_pull_secret'
  ],
  grafana: ['standalone', 'datasources', 'folders', 'dashboards', 'alternate_route', 'email', 'oidc'],
  quay: ['oidc'],
  minio: ['oidc'],
  dev_hub: ['oidc'],
  bookstack: ['oidc'],
  netbox: ['oidc'],
  zabbix: ['saml'],
  gitlab: ['standalone'],
  rhbk: ['standalone', 'realm', 'client', 'idp', 'federation', 'group_mapper', 'client_scopes', 'client_mappers'],
  acs: ['acs_report'],
  satellite: [
    'satellite_server_install',
    'satellite_client_tools',
    'satellite_content_view',
    'satellite_capsule_install',
    'satellite_dynamic_inventory',
    'satellite_oidc'
  ],
  idm: [
    'idm_server_install',
    'idm_replica_install',
    'idm_client_tools',
    'idm_dns_install',
    'idm_ad_trust_install',
    'idm_cert_install',
    'idm_custom_cert',
    'mfa'
  ],
  rhel: ['compliance', 'stig'],
  compliance: ['pci_dss', 'nist_800_53', 'cis', 'stig'],
  stig: ['rhel_8_stig', 'rhel_9_stig']
};

const componentOptionLabels = {
  admin_htpasswd: 'Admin HTPasswd',
  console_banner: 'Console Banner',
  ldap_auth: 'Configure LDAP in OpenShift',
  oauth_rhbk: 'Configure OAuth/RHBK (Keycloak) in OpenShift',
  rhbk: 'RHBK (Keycloak)',
  discover_routes_print: 'Discover Routes and Print',
  alternate_routes: 'Alternate Routes',
  update_pull_secret: 'Update Pull Secret',
  oidc: 'OIDC Auth',
  saml: 'SAML SSO',
  datasources: 'Datasources',
  folders: 'Folders',
  dashboards: 'Dashboards',
  alternate_route: 'Deploy Grafana Alternate Route',
  email: 'Email / SMTP',
  standalone: 'Standalone (RHEL VM install)',
  realm: 'Realm',
  client: 'Client',
  idp: 'IDP',
  federation: 'Federation',
  group_mapper: 'Group Mapper',
  client_scopes: 'Client Scopes',
  client_mappers: 'Client Mappers',
  acs_report: 'RHACS vulnerability reports (job templates + workflow)',
  satellite_server_install: 'Satellite Server Install',
  satellite_client_tools: 'Satellite Client Tools',
  satellite_content_view: 'Satellite Content View',
  satellite_capsule_install: 'Satellite Capsule Install',
  satellite_dynamic_inventory: 'Satellite Dynamic Inventory',
  satellite_oidc: 'Keycloak / OIDC',
  idm_server_install: 'IDM Server Install',
  idm_replica_install: 'IDM Replica Install',
  idm_client_tools: 'IDM Client Tools',
  idm_dns_install: 'Install DNS',
  idm_ad_trust_install: 'Install AD Trust',
  idm_cert_install: 'Install Certificate Services',
  idm_custom_cert: 'Use Custom Certificate',
  mfa: 'MFA',
  compliance: 'Compliance',
  stig: 'STIG Hardening',
  pci_dss: 'PCI-DSS',
  nist_800_53: 'NIST 800-53',
  cis: 'CIS',
  rhel_8_stig: 'RHEL 8 STIG',
  rhel_9_stig: 'RHEL 9 STIG',
  dev_hub: 'Dev Hub',
  minio: 'MinIO',
  ec2_ami_copy: 'EC2 AMI Copy'
};

const verbosityOptions = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Verbose (-v)' },
  { value: 2, label: 'More Verbose (-vv)' },
  { value: 3, label: 'Debug (-vvv)' },
  { value: 4, label: 'Connection Debug (-vvvv)' },
  { value: 5, label: 'WinRM Debug (-vvvvv)' }
];

const formatMacAddress = value => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  if (/[:|-]/.test(raw)) {
    const parts = raw.split(/[:|-]/).filter(Boolean);
    if (parts.length === 6 && parts.every(part => /^[0-9a-f]{1,2}$/i.test(part))) {
      return parts.map(part => part.padStart(2, '0')).join(':');
    }
    return raw;
  }

  const hex = raw.replace(/[^0-9a-f]/gi, '');
  if (hex.length === 12) {
    return hex.match(/.{1,2}/g).join(':');
  }
  return raw;
};

const defaultAgentInstallerNode = index => ({
  // Stable id so editing hostname does not remount the row and steal focus.
  id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${index}`,
  hostname: index < 3 ? `ocp-m${index + 1}` : `ocp-w${index - 2}`,
  role: index < 3 ? 'master' : 'worker',
  macAddress: '',
  interfaceName: 'eno1',
  bondEnabled: false,
  bondName: 'bond0',
  bondMode: 'active-backup',
  secondaryInterfaceName: 'eno2',
  secondaryMacAddress: '',
  networkMode: 'dhcp',
  ipAddress: '',
  prefixLength: 24,
  gateway: '',
  dnsServers: '',
  diskDevice: '',
  labels: '',
  taints: ''
});

const agentInstallerDefaults = {
  enabled: false,
  profile_name: 'default',
  topology: 'ha',
  cluster_name: 'ocp-dev',
  base_domain: 'dev.rhlab',
  openshift_version: '4.16',
  platform: 'baremetal',
  publish: 'External',
  network_type: 'OVNKubernetes',
  machine_network_cidr: '192.168.2.0/24',
  cluster_network_cidr: '10.128.0.0/14',
  cluster_network_host_prefix: 24,
  service_network_cidr: '172.30.0.0/16',
  api_vip: '192.168.2.20',
  ingress_vip: '192.168.2.21',
  rendezvous_ip: '192.168.2.10',
  boot_artifacts_base_url: '',
  ntp_sources: '',
  pull_secret: '',
  ssh_public_key: '',
  proxy_http: '',
  proxy_https: '',
  proxy_no_proxy: '',
  additional_trust_bundle: '',
  disconnected_registry: '',
  require_root_device: false,
  kernel_arguments: '',
  nodes: [0, 1, 2].map(defaultAgentInstallerNode)
};

const buildDefaultGalaxyCredentials = (org = 'ADO', hostname = '') => {
  const prefix = (org || 'ADO').trim() || 'ADO';
  const base = String(hostname || '').replace(/\/+$/, '');
  const hubContent = base ? `${base}/api/galaxy/content` : '';

  return [
    {
      id: 'validated',
      name: `${prefix}-validated`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/validated/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true,
      order: 1
    },
    {
      id: 'published',
      name: `${prefix}-published`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/published/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true,
      order: 2
    },
    {
      id: 'community',
      name: `${prefix}-community`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/community/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true,
      order: 3
    },
    {
      id: 'certified',
      name: `${prefix}-certified`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/rh-certified/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true,
      order: 4
    },
    {
      id: 'galaxy',
      name: 'Ansible Galaxy',
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: 'https://galaxy.ansible.com/',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true,
      order: 5
    }
  ];
};

/** Ensure each Galaxy cred has a unique 1-based order; sort list by order. */
const normalizeGalaxyCredentialOrder = (credentials = []) => {
  const list = (Array.isArray(credentials) ? credentials : []).map((credential, index) => ({
    ...credential,
    order: Number.isFinite(Number(credential?.order)) && Number(credential.order) > 0
      ? Number(credential.order)
      : index + 1
  }));
  list.sort((a, b) => (a.order - b.order) || String(a.name || '').localeCompare(String(b.name || '')));
  return list.map((credential, index) => ({ ...credential, order: index + 1 }));
};

const buildDefaultContainerRegistryCredential = (org = 'ADO', hostname = '') => {
  const prefix = (org || 'ADO').trim() || 'ADO';
  const base = String(hostname || '').replace(/\/+$/, '');
  return {
    enabled: true,
    name: `${prefix}-EE`,
    credential_type: 'Container Registry',
    host: base || '',
    username: '',
    password: '',
    verify_ssl: true
  };
};

const normalizeAapHostname = hostname => String(hostname || '').trim().replace(/\/+$/, '');

const HUB_GALAXY_CONTENT_IDS = {
  validated: 'validated',
  published: 'published',
  community: 'community',
  certified: 'rh-certified'
};

const applyHostnameToGalaxyCredentials = (credentials, hostname, previousHostname = '') => {
  const base = normalizeAapHostname(hostname);
  const previousBase = normalizeAapHostname(previousHostname);

  return (credentials || []).map(credential => {
    if (!credential || credential.id === 'galaxy' || credential.name === 'Ansible Galaxy') {
      return credential;
    }

    const contentPath = HUB_GALAXY_CONTENT_IDS[credential.id];
    const url = String(credential.url || '');
    const isStandardHubCred = Boolean(contentPath);
    const looksLikeHubContentUrl = /\/api\/galaxy\/content\//.test(url) && !/galaxy\.ansible\.com/i.test(url);
    if (!isStandardHubCred && !looksLikeHubContentUrl) {
      return credential;
    }

    const pathSuffix = contentPath
      || (url.match(/\/api\/galaxy\/content\/([^/]+)\/?/) || [])[1];
    if (!pathSuffix) {
      return credential;
    }

    const previousUrl = previousBase ? `${previousBase}/api/galaxy/content/${pathSuffix}/` : '';
    const shouldRewrite =
      isStandardHubCred
      || !url
      || (previousBase && (url === previousUrl || url.startsWith(`${previousBase}/api/galaxy/content/`)));

    if (!shouldRewrite) {
      return credential;
    }

    return {
      ...credential,
      url: base ? `${base}/api/galaxy/content/${pathSuffix}/` : ''
    };
  });
};

const applyHostnameToContainerRegistryCredential = (registry, hostname, previousHostname = '') => {
  if (!registry || typeof registry !== 'object') {
    return registry;
  }

  const next = { ...registry };
  const previousHost = normalizeAapHostname(previousHostname);
  const currentHost = String(next.host || '').replace(/\/+$/, '');
  if (!currentHost || currentHost === previousHost) {
    next.host = normalizeAapHostname(hostname);
  }
  return next;
};

const ADDITIONAL_ENV_PRESETS = ['prod', 'dev', 'preprod', 'pilot', 'infra'];

const parseAdditionalEnvironmentsList = value => {
  const noneTokens = new Set(['none', 'non', 'n/a', '-', 'null', 'undefined']);
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const seen = new Set();
  const result = [];
  raw.forEach(item => {
    const name = String(item || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (noneTokens.has(key) || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });
  return result;
};

/** Disconnected default: baked EE tar inside the preflight UI image. */
const HUB_EE_BAKED_SOURCE = 'docker-archive:/opt/ado-ee/ado-ee.docker.tar';
/** Registry-safe Hub image name (lowercase). Contoller EE object may stay ORG-ee. */
const DEFAULT_HUB_EE_IMAGE_NAME = 'ado-ee';
/** Online/mirror path when "Pull source from a registry" is checked. */
const HUB_EE_REGISTRY_SOURCE = 'ghcr.io/automation-development-office/ado-ee:latest';

/** Keep hub_ee_source_image aligned with hub_ee_pull (and persist in Download JSON). */
const syncHubEeSourceImage = aap => {
  if (!aap || typeof aap !== 'object') return aap;
  aap.hub_ee_pull = aap.hub_ee_pull === true;
  const src = String(aap.hub_ee_source_image || '').trim();
  if (aap.hub_ee_pull) {
    if (!src || src.startsWith('docker-archive:')) {
      aap.hub_ee_source_image = HUB_EE_REGISTRY_SOURCE;
    }
  } else if (!src || /^ghcr\.io\//i.test(src)) {
    aap.hub_ee_source_image = HUB_EE_BAKED_SOURCE;
  }
  return aap;
};

const defaults = {
  scm_tool: 'gitlab',
  environment: 'prod',
  // Extra survey-only environment names. Primary Environment Type is always
  // included; prod is selected by default for Contoller JT surveys.
  additional_environments: ['prod'],
  domain: 'prod.rhlab',

  ansible: {
    verbosity: 0,
    // Freeform ansible-playbook CLI options appended when the pod runs bootstrap
    // (for example: -e some_var=value --tags bootstrap).
    extra_args: ''
  },

  git: {
    auto_push: true,
    skip_tls_verify: true,
    // Legacy boolean; kept in sync with git.overrides.all for imported JSON.
    overwrite_generated: false,
    overrides: {
      // Default: incremental updates only — no wipe/force overwrite in pod git repo.
      group_vars_current_env: false,
      job_and_workflow_templates: false,
      all: false
    },
    // When true: only refresh group_vars (vars/vault) + optional git push.
    // Skips playbook regeneration and Controller org/project/JT/workflow apply.
    vars_only: false,
    token: '',
    // Bitbucket Server HTTP access tokens need the account username for Controller SCM creds.
    username: ''
  },

  components: [],

  component_apps: {
    openshift: [],
    rhel: [],
    patching: [],
    aws: [],
    provision: []
  },

  component_config: {
    grafana: {
      hostname: 'grafana-ado.server.lab',
      storage: '',
      replicas: 1,
      folder_name: '',
      dashboards_source: '',
      // Shared Openshift folder with K8S Prod/Dev dropdown (in addition to OpenshiftProd/OpenshiftDev).
      group_cluster_dashboards: true,
      folders: [
        {
          name: 'OpenshiftProd',
          source_type: 'path',
          source: 'templates/Openshift',
          dashboards_path: 'dashboards',
          alerts_path: 'alerts',
          datasource_mode: 'pin',
          datasource: 'Openshift-Prod',
          uid_suffix: 'prod',
          title_cluster: 'Prod'
        },
        {
          name: 'OpenshiftDev',
          source_type: 'path',
          source: 'templates/Openshift',
          dashboards_path: 'dashboards',
          alerts_path: 'alerts',
          datasource_mode: 'pin',
          datasource: 'Openshift-Dev',
          uid_suffix: 'dev',
          title_cluster: 'Dev'
        },
        {
          name: 'Openshift',
          source_type: 'path',
          source: 'templates/Openshift',
          dashboards_path: 'dashboards',
          alerts_path: 'alerts',
          datasource_mode: 'multi'
        },
        { name: 'RHACS', source_type: 'path', source: 'templates/RHACS', dashboards_path: 'dashboards', datasource_mode: 'none' }
      ],
      email: {
        enabled: false,
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_password: '',
        from_address: '',
        from_name: 'Grafana'
      },
      oidc: {
        enabled: true,
        client_id: 'grafana-client',
        client_secret: '',
        issuer: '',
        fetch_secret_from_rhbk: true,
        client_secret_manual: false
      },
      alerts_enabled: false,
      standalone_hostname: 'grafana-ado.server.lab',
      standalone_admin_user: 'admin',
      standalone_admin_password: 'redhat123',
      standalone_http_port: 3000,
      standalone_ip_note: '192.168.0.66',
      standalone_rpm_path: '',
      standalone_rpm_url: '',
      standalone_tls_crt: '',
      standalone_tls_key: '',
      standalone_rhn_org_id: '',
      standalone_rhn_activation_key: ''
    },
    acm: {
      channel: 'release-2.17'
    },
    acs: {
      hostname: '',
      storage: '',
      namespace: 'stackrox',
      policies_source_type: 'git',
      policies_source: '',
      reports_source_type: 'git',
      reports_source: ''
    },
    rhbk: {
      hostname: '',
      storage: '',
      replicas: 1,
      realm: '',
      client: '',
      clients: [
        { id: '', name: '', redirect_uris: '', web_origins: '' }
      ],
      standalone_hostname: 'keycloak-ado.server.lab',
      standalone_zip: '',
      standalone_zip_file: '',
      standalone_zip_upload_path: '',
      standalone_zip_url: '',
      standalone_admin_user: 'admin',
      standalone_admin_password: '',
      standalone_tls_crt: '',
      standalone_tls_key: '',
      standalone_rhn_org_id: '',
      standalone_rhn_activation_key: '',
      idp_name: '',
      idp_alias: '',
      idp_provider: 'oidc',
      federation_name: 'LDAP',
      federation_provider: 'ldap',
      federation_ldap_url: '',
      federation_bind_dn: '',
      federation_bind_password: '',
      group_mapper_name: '',
      group_mapper_claim: 'groups',
      client_scope_name: 'groups',
      client_scope_protocol: 'openid-connect',
      client_mapper_name: '',
      client_mapper_claim: ''
    },
    satellite: {
      hostname: '',
      organization: '',
      activation_key: '',
      deployment_version: '6.19',
      location: '',
      rhn_org_id: '',
      admin_rhn_activation_key: '',
      size_profile: 'default',
      size: [
        { name: 'default', min_hosts: 0, max_hosts: 5000, min_ram: 20, min_cpu: 4 },
        { name: 'medium', min_hosts: 5000, max_hosts: 10000, min_ram: 32, min_cpu: 8 },
        { name: 'large', min_hosts: 10000, max_hosts: 20000, min_ram: 64, min_cpu: 12 },
        { name: 'extra-large', min_hosts: 20000, max_hosts: 60000, min_ram: 128, min_cpu: 16 },
        { name: 'extra-extra-large', min_hosts: 60000, max_hosts: 100000, min_ram: 256, min_cpu: 32 }
      ],
      req_dirs: [
        { mount_point: '/var/lib/pulp', lv_name: 'lv_rhspulp', lv_size: '300g' },
        { mount_point: '/var/lib/pgsql', lv_name: 'lv_pgsql', lv_size: '20g' }
      ],
      manifest_file: '',
      manifest_content_base64: '',
      manifest_encoding: 'base64',
      manifest_organization: '',
      service_account_username: '',
      service_account_password: '',
      admin_password: '',
      validate_certs: false,
      dynamic_inventory_enabled: false,
      credential_name: 'ADO Satellite Service Account',
      inventory_source_name: 'ADO Satellite Dynamic Inventory',
      inventory_overwrite: true,
      inventory_overwrite_vars: true,
      inventory_update_on_launch: true,
      inventory_update_cache_timeout: 0,
      inventory_verbosity: 0,
      inventory_host_filter: '',
      oidc: {
        client_id: 'ado-satellite',
        realm: 'rhlab',
        keycloak_url: 'https://keycloak.apps.ocp.prod.rhlab',
        issuer: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab',
        client_secret: '',
        admin_user: 'admin',
        admin_password: '',
        create_client: true,
        validate_certs: false
      }
    },
    idm: {
      hostname: '',
      domain: '',
      realm: '',
      replica_hostname: '',
      replica_install_dns: true,
      replica_install_ca: true,
      auto_forwarders: true,
      custom_cert_file: '',
      custom_cert_key_file: '',
      custom_cert_chain_file: '',
      admin_password: '',
      directory_manager_password: '',
      ad_domain: 'ad.lab',
      ad_dc_hostname: 'adwindows.ad.lab',
      ad_dc_ip: '192.168.0.61',
      ad_admin: 'Administrator',
      ad_admin_password: '',
      ad_two_way: true,
      ad_configure_groups: true,
      ad_map_group: '',
      ad_map_admins_group: ''
    },
    aap: {
      hostname: '',
      storage: '',
      replicas: 1,
      namespace: 'aap',
      admin_password: '',
      license_mode: 'none',
      license_only: false,
      subscription_manifest_file: '',
      subscription_manifest_content_base64: '',
      rhn_username: '',
      rhn_password: '',
      rhn_subscription_id: '',
      rhn_client_id: '',
      rhn_client_secret: '',
      minimal_footprint: false,
      install_during_bootstrap: false,
      deployment_version: '2.7',
      operator_scope: 'all_namespaces'
    },
    cert_manager: {
      hostname: '',
      storage: '',
      replicas: 1,
      mode: 'cert',
      tls_crt: '',
      tls_key: '',
      idm_acme_directory_url: '',
      idm_ca_bundle_file: '',
      awspca_namespace: 'cert-manager',
      awspca_secret_name: 'awspca-creds',
      awspca_issuer_name: 'awspca-clusterissuer',
      awspca_region: 'us-gov-west-1',
      awspca_pca_arn: '',
      awspca_access_key_id: '',
      awspca_secret_access_key: ''
    },
    console: { hostname: '', storage: '', replicas: 1 },
    devspaces: {
      hostname: '',
      storage: '',
      replicas: 1,
      namespace: 'openshift-devspaces',
      disable_default_samples: true,
      default_devfile_url: '',
      default_workspace_image: '',
      che_image_tag: '',
      dashboard_image: '',
      customize_workspace: false
    },
    dev_hub: {
      hostname: '',
      storage: '',
      replicas: 1,
      instance_name: 'chad-lab',
      gitlab_host: '',
      catalog_url: '',
      keycloak_realm: 'rhlab',
      keycloak_client_id: 'rhdh',
      gitlab_token: '',
      oidc_client_secret: ''
    },
    dirsrv: { hostname: '', storage: '', replicas: 1 },
    eck: { hostname: '', storage: '', replicas: 1 },
    gitops: { hostname: '', storage: '', replicas: 1 },
    gitlab: {
      hostname: 'gitlab-ado.server.lab',
      storage: '',
      replicas: 1,
      standalone_hostname: 'gitlab-ado.server.lab',
      standalone_external_url: 'http://gitlab-ado.server.lab',
      standalone_root_password: 'redhat123',
      standalone_edition: 'ce',
      standalone_http_port: 80,
      standalone_https_port: 443,
      standalone_ip_note: '192.168.0.65',
      standalone_rpm_path: '',
      standalone_rpm_url: '',
      standalone_tls_crt: '',
      standalone_tls_key: '',
      standalone_rhn_org_id: '',
      standalone_rhn_activation_key: ''
    },
    kafka: { hostname: '', storage: '', replicas: 1 },
    oadp: { hostname: '', storage: '', replicas: 1 },
    openshift: { hostname: '', storage: '', replicas: 1 },
    pega: { hostname: '', storage: '', replicas: 1 },
    quay: { hostname: '', storage: '', replicas: 1 },
    bookstack: {
      hostname: 'bookstack',
      namespace: 'bookstack',
      storage_class: 'synology-nfs-csi',
      route_host: '',
      admin_password: '',
      oidc_enabled: true,
      oidc_issuer: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab',
      oidc_client_id: 'bookstack',
      oidc_client_secret: ''
    },
    netbox: {
      oidc_enabled: true,
      oidc_issuer: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab',
      oidc_client_id: 'netbox',
      oidc_client_secret: ''
    },
    rhel: {
      hostname: '',
      hosts: [],
      compliance_profile: 'PCI-DSS',
      stig_profile: 'RHEL 9 STIG'
    },
    patching: {
      inventory_mode: 'create',
      inventory_name: '',
      hostname: '',
      hosts: []
    },
    compliance: {
      hostname: '',
      profile: 'PCI-DSS'
    },
    stig: {
      hostname: '',
      profile: 'RHEL 9 STIG'
    },
    elastic: { hostname: '', storage: '', replicas: 1 },
    jira: { hostname: '', storage: '', replicas: 1 },
    aws: {
      profile: '',
      default_region: 'us-east-1',
      access_key_id: '',
      secret_access_key: '',
      session_token: ''
    },
    aws_instance: { hostname: '', storage: '', replicas: 1 },
    openshift_virt: {
      api_host: '',
      api_token: '',
      skip_tls_verify: true,
      ssh_public_key: ''
    }
  },

  component_options: {
    openshift: [],
    grafana: [],
    gitlab: [],
    rhbk: [],
    acs: [],
    satellite: [],
    idm: [],
    rhel: [],
    compliance: [],
    stig: [],
    aws: []
  },

  collections: {
    infra_ado: true,
    ansible_controller: true,
    infra_aap_configuration: true,
    infra_controller_configuration: true,
    redhat_openshift: true,
    kubernetes_core: true,
    community_general: true,
    containers_podman: true
  },

  tools: {
    ansible_core: true,
    ansible_navigator: true,
    git: true,
    podman: true,
    python: true,
    oc: true
  },

  aap: {
    enabled: true,
    hostname: 'https://aap-aap.apps.ocp.prod.rhlab',
    version: '27',
    organization: 'ADO',
    inventory: 'ADO-inventory',
    project: 'ADO-project',
    git_url: 'https://gitlab-git.apps.ocp.prod.rhlab/redhat-lab/bootstrap-sample.git',
    git_branch: 'main',
    execution_environment: 'ee-supported-rhel9',
    vault_credential_name: 'ADO-vault',
    skip_tls_verify: false,
    hub_publish_ado_collection: false,
    hub_mark_ado_validated: false,
    hub_force_ado_collection_update: false,
    // When true: run Hub collection and/or EE push without scaffolding playbooks / Contoller apply / other components
    hub_update_collection_only: false,
    standalone_run: false,
    // Hub API / registry hostname (defaults from AAP Hostname URL host)
    hub_hostname: '',
    // Optional Hub EE — default is baked docker-archive inside the UI image (disconnected).
    // hub_ee_pull enables an online/mirror docker:// pull instead (needs outbound registry access).
    hub_push_ee: false,
    hub_ee_source_image: HUB_EE_BAKED_SOURCE,
    hub_ee_name: DEFAULT_HUB_EE_IMAGE_NAME,
    hub_ee_tag: 'latest',
    hub_ee_registry: '',
    hub_ee_pull: false,
    hub_ee_create_execution_environment: true,
    hub_ee_execution_environment_name: 'ADO-ee',
    hub_ee_description:
      'ADO Contoller execution environment based on the supported RHEL 9 AAP EE. '
      + 'Preloads Ansible collections used by infra.ado bootstrap and lab jobs '
      + '(ansible.controller, ansible.posix, kubernetes.k8s, redhat.openshift, community.general, '
      + 'amazon.aws, and related dependencies) so Contoller can run disconnected without Galaxy pulls.',
    // Optional Galaxy/Hub credentials + org association (default off for disconnected)
    galaxy_setup_enabled: false,
    ignore_galaxy_cert: false,
    galaxy_hub_token: '',
    auth: {
      keycloak_oidc: {
        enabled: false,
        name: 'Keycloak OIDC',
        slug: 'keycloak-oidc',
        key: '',
        secret: '',
        authorization_url: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab/protocol/openid-connect/auth',
        access_token_url: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab/protocol/openid-connect/token',
        public_key: '',
        verify_ssl: false,
        groups_claim: 'Group',
        superuser_groups: '',
        organization_maps: [
          { organization: 'ADO', groups: '', role: 'Organization Member' }
        ]
      }
    },
    onboard: {
      enabled: false,
      keycloak: defaultOnboardKeycloak({ auth: { keycloak_oidc: { authorization_url: 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab/protocol/openid-connect/auth' } } }),
      tenants: []
    },
    galaxy_user_account: {
      enabled: false,
      username: '',
      password: '',
      email: '',
      is_superuser: false
    },
    galaxy_credentials: buildDefaultGalaxyCredentials('ADO', 'https://aap-aap.apps.ocp.prod.rhlab'),
    container_registry_credential: buildDefaultContainerRegistryCredential(
      'ADO',
      'https://aap-aap.apps.ocp.prod.rhlab'
    ),
    additional_credentials: [],
    machine_credential: {
      name: 'ADO-machine',
      username: 'cloud-user',
      ssh_key_data: '',
      ssh_key_unlock: '',
      become_method: 'sudo',
      become_username: 'root'
    },
    oauth_token: '',
    admin_username: 'admin',
    admin_password: '',
    vault_password: 'redhat123'
  },

  openshift: {
    api_host: 'https://api.ocp.prod.rhlab:6443',
    apps_domain: 'apps.ocp.prod.rhlab',
    skip_tls_verify: true,
    admin_username: 'admin',
    admin_password: '',
    admin_role: 'cluster-admin',
    htpasswd_action: 'add',
    htpasswd_users: [
      { name: 'admin', password: '', role: 'cluster-admin' }
    ],
    banner_text: 'Hello! ADO OpenShift',
    banner_location: 'BannerTop',
    banner_background_color: '#1f7a1f',
    banner_text_color: '#ffffff',
    token: '',
    oauth_rhbk: {
      idp_name: 'Keycloak'
    },
    ldap_auth: {
      idp_name: 'LDAP_IDM'
    },
    discover_routes: {
      scope: 'all',
      namespaces: ''
    },
    alternate_routes: {
      print_alt_routes: true,
      add_alt_routes: false,
      add_ingress_with_route: false,
      route_name_suffix: '-alt',
      route_labels: [],
      ingress_controller_name: 'default',
      force_replace: false
    },
    agent_installer: agentInstallerDefaults
  },

  pre_installs: {
    install_aap: false,
    attach_aap_license: false,
    openshift_agent_enabled: false,
    aap: {
      license_mode: 'none',
      license_only: false,
      subscription_manifest_file: '',
      subscription_manifest_content_base64: '',
      subscription_manifest_encoding: 'base64',
      rhn_username: '',
      rhn_password: '',
      rhn_subscription_id: '',
      rhn_client_id: '',
      rhn_client_secret: ''
    },
    openshift_agent: {
      api_host: '',
      pull_secret: '',
      ssh_public_key: ''
    }
  },

  jira: {
    enabled: false,
    url: 'https://example.atlassian.net/',
    project_key: 'TEST',
    custom_ac_field: 'customfield_10091',
    templates_dir: 'templates',
    create_subtasks: true,
    username: '',
    token: ''
  }
};


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error('ADO UI React crash:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: 'monospace',
          padding: '24px',
          background: '#1f1f1f',
          color: '#f0f0f0',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#ff6b6b' }}>ADO Preflight UI crashed</h1>
          <p>This is a React render error, not a Node/server error.</p>
          <pre style={{
            whiteSpace: 'pre-wrap',
            background: '#151515',
            border: '1px solid #555',
            padding: '16px',
            borderRadius: '6px'
          }}>
{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}
          </pre>
          <pre style={{
            whiteSpace: 'pre-wrap',
            background: '#151515',
            border: '1px solid #555',
            padding: '16px',
            borderRadius: '6px'
          }}>
{this.state.info && this.state.info.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [data, setData] = useState(defaults);
  const [preview, setPreview] = useState('Click "Run Bootstrap" to generate output.');
  const [events, setEvents] = useState('');
  const [activeTab, setActiveTab] = useState('logs');
  const [debugTab, setDebugTab] = useState('events');
  const [debugContent, setDebugContent] = useState('Select a debug tab to load details.');
  const [debugLoading, setDebugLoading] = useState(false);
  const [configTab, setConfigTab] = useState('form');
  const [yamlDraft, setYamlDraft] = useState('');
  const [yamlError, setYamlError] = useState('');
  const [showVaultYaml, setShowVaultYaml] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [collectionVersions, setCollectionVersions] = useState([]);
  const [uiVersion, setUiVersion] = useState(null);
  const [readmeMarkdown, setReadmeMarkdown] = useState('');
  const [adoReadmeMarkdown, setAdoReadmeMarkdown] = useState('');
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [documentationType, setDocumentationType] = useState('ui');
  const [collectionsToolsOpen, setCollectionsToolsOpen] = useState(false);
  const [aapOpen, setAapOpen] = useState(true);
  const [openshiftOpen, setOpenshiftOpen] = useState(false);
  const [rhelOpen, setRhelOpen] = useState(false);
  const [patchingOpen, setPatchingOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [awsOpen, setAwsOpen] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('core');
  const [consoleSearch, setConsoleSearch] = useState('');
  const [activeConfigPanel, setActiveConfigPanel] = useState('all');
  const [activeConfigTab, setActiveConfigTab] = useState('all');
  const [showOpenShiftToken, setShowOpenShiftToken] = useState(false);
  const [showAapOauthToken, setShowAapOauthToken] = useState(false);
  const [showAapGalaxyHubToken, setShowAapGalaxyHubToken] = useState(false);
  const [showAapAdminPassword, setShowAapAdminPassword] = useState(false);
  const [showMachineCredentialSecrets, setShowMachineCredentialSecrets] = useState(false);
  const [showSatelliteSecrets, setShowSatelliteSecrets] = useState(false);
  const [rhbkZipUploading, setRhbkZipUploading] = useState(false);
  const [rhbkZipError, setRhbkZipError] = useState('');
  const [aapPingBusy, setAapPingBusy] = useState(false);
  const [aapPingMessage, setAapPingMessage] = useState('');
  const [aapPingStatus, setAapPingStatus] = useState('');
  const [keycloakPublicKeyBusy, setKeycloakPublicKeyBusy] = useState(false);
  const [keycloakPublicKeyMessage, setKeycloakPublicKeyMessage] = useState('');
  const [showIdmSecrets, setShowIdmSecrets] = useState(false);
  const [showAwsSecrets, setShowAwsSecrets] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [showGitToken, setShowGitToken] = useState(false);
  const [ansibleExtraArgsOpen, setAnsibleExtraArgsOpen] = useState(false);
  const [additionalEnvOtherEnabled, setAdditionalEnvOtherEnabled] = useState(false);
  const [additionalEnvOtherDraft, setAdditionalEnvOtherDraft] = useState('');
  const [activeCredentialConfigTab, setActiveCredentialConfigTab] = useState('vault');
  const [activeAapConfigTab, setActiveAapConfigTab] = useState('general');
  const [activeHubSubTab, setActiveHubSubTab] = useState('collections');
  const [activeAapAuthTab, setActiveAapAuthTab] = useState('keycloak');
  const [storageClassLookup, setStorageClassLookup] = useState({
    loading: false,
    error: '',
    classes: null
  });
  const [activeAapCredentialTab, setActiveAapCredentialTab] = useState('');
  const [activeRhbkDetailTab, setActiveRhbkDetailTab] = useState('client');
  const [activePreInstallTab, setActivePreInstallTab] = useState('aap_license');
  const [importStatus, setImportStatus] = useState('');
  const [focusSection, setFocusSection] = useState('');
  const [runFinished, setRunFinished] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState('idle');
  const [bootstrapRuntime, setBootstrapRuntime] = useState('');
  const [deployStatus, setDeployStatus] = useState('idle');
  const [deployRuntime, setDeployRuntime] = useState('');
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [consoleFontSize, setConsoleFontSize] = useState(13);
  const [agentInstallerResult, setAgentInstallerResult] = useState(null);
  const [agentInstallerBusy, setAgentInstallerBusy] = useState(false);
  const [agentInstallerPreviewTab, setAgentInstallerPreviewTab] = useState('install');
  const [agentInstallerProfiles, setAgentInstallerProfiles] = useState([]);
  const [agentNodeEditorIndex, setAgentNodeEditorIndex] = useState(null);
  const outputRef = useRef(null);
  const importFileRef = useRef(null);
  const agentProfileFileRef = useRef(null);

  const isDark = theme === 'dark';

  const pageBg = isDark ? '#121212' : '#f0f0f0';
  const contentBg = isDark ? '#262626' : '#ffffff';
  const cardBg = isDark ? '#262626' : '#ffffff';
  const textColor = isDark ? '#f0f0f0' : '#151515';
  const mutedTextColor = isDark ? '#b8bbbe' : '#6a6e73';
  const borderColor = isDark ? '#3d3d3d' : '#d2d2d2';
  const fieldBg = isDark ? '#3a3a3a' : '#ffffff';
  const fieldColor = isDark ? '#f0f0f0' : '#151515';

  const cardStyle = {
    backgroundColor: cardBg,
    color: textColor,
    border: isDark ? 'none' : `1px solid ${borderColor}`,
    borderRadius: isDark ? '10px' : '12px',
    boxShadow: isDark ? 'none' : undefined
  };

  const sectionStyle = {
    backgroundColor: pageBg,
    color: textColor
  };

  const contentShellStyle = {
    backgroundColor: isDark ? contentBg : 'transparent',
    color: textColor,
    borderRadius: isDark ? '10px' : '0',
    padding: isDark ? '24px' : '0'
  };

  const selectStyle = {
    height: '36px',
    minWidth: '170px',
    borderRadius: '4px',
    border: `1px solid ${isDark ? '#8a8d90' : '#8a8d90'}`,
    padding: '0 32px 0 8px',
    background: fieldBg,
    color: fieldColor,
    fontSize: '14px'
  };

  const goToGitConfiguration = () => {
    setFocusSection('git');
    setActiveMainTab('core');
  };

  const goToAapConfiguration = () => {
    setFocusSection('aap');
    setActiveMainTab('core');
    setAapOpen(true);
  };

  useEffect(() => {
    if (activeMainTab !== 'core' || !focusSection) return undefined;
    const targetId = focusSection === 'git'
      ? 'git-configuration'
      : focusSection === 'aap'
        ? 'aap-configuration'
        : '';
    if (!targetId) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      setFocusSection('');
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeMainTab, focusSection]);

  useEffect(() => {
    fetch('/api/collection-versions')
      .then(r => r.json())
      .then(d => setCollectionVersions(d.collections || []))
      .catch(() => setCollectionVersions([]));

    fetch('/api/ui-version')
      .then(r => r.json())
      .then(d => setUiVersion(d))
      .catch(() => setUiVersion(null));

    fetch('/api/readme/ui')
      .then(r => {
        if (!r.ok) throw new Error('UI README request failed');
        return r.text();
      })
      .then(text => setReadmeMarkdown(text))
      .catch(() => setReadmeMarkdown('# ADO Preflight UI documentation unavailable'));

    fetch('/api/readme/ado')
      .then(r => {
        if (!r.ok) throw new Error('ADO README request failed');
        return r.text();
      })
      .then(text => setAdoReadmeMarkdown(text))
      .catch(() => setAdoReadmeMarkdown('# ADO Collection documentation unavailable'));

    try {
      setAgentInstallerProfiles(JSON.parse(localStorage.getItem('adoAgentInstallerProfiles') || '[]'));
    } catch {
      setAgentInstallerProfiles([]);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.backgroundColor = pageBg;
    document.body.style.backgroundColor = pageBg;
    document.body.style.color = textColor;
    document.body.style.margin = '0';

    const pfPage = document.querySelector('.pf-v5-c-page');
    const pfMain = document.querySelector('.pf-v5-c-page__main');
    const pfMainSection = document.querySelectorAll('.pf-v5-c-page__main-section');
    const pfInputs = document.querySelectorAll('input, select, textarea');

    if (pfPage) pfPage.style.backgroundColor = pageBg;
    if (pfMain) pfMain.style.backgroundColor = pageBg;

    pfMainSection.forEach(section => {
      section.style.backgroundColor = pageBg;
    });

    pfInputs.forEach(input => {
      if (input.tagName.toLowerCase() === 'textarea') return;

      if (isDark) {
        input.style.backgroundColor = fieldBg;
        input.style.color = fieldColor;
        input.style.borderColor = '#555';
      } else {
        input.style.backgroundColor = '';
        input.style.color = '';
        input.style.borderColor = '';
      }
    });
  }, [pageBg, textColor]);

  useEffect(() => {
    const styleId = 'ado-dark-theme';

    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.innerHTML = isDark
      ? `
        .pf-v5-c-radio__label,
        .pf-v5-c-check__label,
        .pf-v5-c-form__label-text,
        .pf-v5-c-title,
        .pf-v5-c-form__helper-text,
        .pf-v5-c-form-control,
        .pf-v5-c-form label,
        .pf-v5-c-card label,
        .pf-v5-c-card span,
        .pf-v5-c-card div,
        .pf-v5-c-card p {
          color: #f0f0f0 !important;
        }

        .pf-v5-c-check__description,
        .pf-v5-c-radio__description,
        .pf-v5-c-check,
        .pf-v5-c-radio,
        .pf-v5-c-check *,
        .pf-v5-c-radio *,
        .pf-v5-c-form__group,
        .pf-v5-c-form__group *,
        label,
        label *,
        span {
          color: #f0f0f0 !important;
        }

        .pf-v5-c-check.pf-m-disabled,
        .pf-v5-c-radio.pf-m-disabled,
        .pf-v5-c-check.pf-m-disabled *,
        .pf-v5-c-radio.pf-m-disabled *,
        input:disabled + label,
        input:disabled ~ label {
          color: #b8bbbe !important;
          opacity: 1 !important;
        }
      `
      : '';

  }, [isDark]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [preview, events, activeTab, debugContent]);

  const debugTabLabel = tab => ({
    events: 'Events',
    summary: 'Summary',
    preflight: 'Preflight JSON',
    extraVars: 'Extra Vars',
    tree: 'Repo Tree',
    configs: 'Generated Configs',
    runtime: 'Runtime',
    terminal: 'Pod Terminal'
  }[tab] || tab);

  /** What each Events / Debug sub-tab shows (for troubleshooting). */
  const debugTabHelp = {
    events: {
      title: 'Events',
      body: 'Timeline from the preflight server during this bootstrap run (git clone, collection install, '
        + 'writing JSON, ansible-playbook milestones). This is not OpenShift/Kubernetes pod events — use '
        + 'Pod Terminal or oc logs if you need the container log from outside the UI.'
    },
    summary: {
      title: 'Summary',
      body: 'Quick index for the current run: local clone path on the pod, paths to preflight/extra-vars files, '
        + 'selected components, final result object (exit code, runtime), and how large the Logs/Events buffers are.'
    },
    preflight: {
      title: 'Preflight JSON',
      body: 'The normalized JSON file written into the bootstrap clone on the pod (ado-preflight-<env>.json) '
        + 'and passed to Ansible as -e preflight_json=…. Same contract CLI uses when you run bootstrap by hand. '
        + 'Secrets are redacted here; the on-disk file in the repo still has vault passwords for encrypt.'
    },
    extraVars: {
      title: 'Extra Vars',
      body: 'Debug snapshot only (ado-extra-vars.json): derived flags the server computed (hub-only, git push, '
        + 'component lists, verbosity). Helpful to compare UI intent vs what you would pass on CLI. '
        + 'Not the full ansible-playbook -e list — see Logs for the actual command extras.'
    },
    tree: {
      title: 'Repo Tree',
      body: 'Directory listing of the bootstrap git clone on the pod (/workspace/bootstrap-sample), not GitLab. '
        + 'Shows generated group_vars, playbooks, and configs after env generation. GitLab remote is unchanged '
        + 'until auto-push succeeds (hub-only runs skip push by default).'
    },
    configs: {
      title: 'Generated Configs',
      body: 'File contents from the local clone: configs/controller, configs/job_templates, configs/workflows, '
        + 'playbooks/, and group_vars/ — what infra.ado scaffolding produced this run. Use to verify JT/workflow '
        + 'seeds and vars before pushing to Git or syncing Controller.'
    },
    runtime: {
      title: 'Runtime',
      body: 'Preflight container environment: UI/collection image version, pod hostname, work directories, '
        + 'collection tarball paths. Bootstrap duration and pass/fail are in the status banner above and Logs recap '
        + '(Runtime: …), not this tab.'
    },
    terminal: {
      title: 'Pod Terminal',
      body: 'Interactive shell inside the preflight pod/container (/workspace). Same environment as bootstrap '
        + '(vault files, bootstrap clone, collections). Full access to secrets on disk — disable with '
        + 'ADO_PREFLIGHT_TERMINAL_ENABLED=false on shared deployments. Reconnect by switching tabs if the session closes.'
    }
  };

  const debugEndpoint = tab => ({
    summary: 'summary',
    preflight: 'preflight',
    extraVars: 'extra-vars',
    tree: 'tree',
    configs: 'configs',
    runtime: 'runtime',
    terminal: 'terminal'
  }[tab]);

  const fetchDebugTab = async tab => {
    const endpoint = debugEndpoint(tab);
    if (!endpoint) return;

    setDebugLoading(true);
    try {
      const response = await fetch(`/api/debug/${endpoint}`);
      const text = await response.text();
      setDebugContent(text || `No ${debugTabLabel(tab)} data yet.`);
    } catch (err) {
      setDebugContent(`ERROR reading ${debugTabLabel(tab)}:\n${err.message}`);
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'events' && debugTab !== 'events' && debugTab !== 'terminal') {
      fetchDebugTab(debugTab);
    }
  }, [activeTab, debugTab, runFinished]);

  useEffect(() => {
    if (!isRhbkSelected(data) || !isGrafanaSelected(data)) return;
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const before = JSON.stringify(next.component_config?.grafana?.oidc || {});
      syncGrafanaOidcFromRhbk(next, { force: false });
      const after = JSON.stringify(next.component_config?.grafana?.oidc || {});
      return before === after ? prev : next;
    });
  }, [
    data.components,
    data.component_apps?.openshift,
    data.component_apps?.rhel,
    data.component_options?.grafana,
    data.component_config?.rhbk?.hostname,
    data.component_config?.rhbk?.realm,
    data.component_config?.rhbk?.clients,
    data.openshift?.apps_domain,
    data.environment
  ]);

  const set = (path, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = copy;

      keys.slice(0, -1).forEach(k => {
        if (!obj[k]) obj[k] = {};
        obj = obj[k];
      });

      obj[keys[keys.length - 1]] = value;
      return copy;
    });
  };

  const additionalEnvironmentsList = parseAdditionalEnvironmentsList(data.additional_environments);
  const additionalEnvCustom = additionalEnvironmentsList.filter(
    name => !ADDITIONAL_ENV_PRESETS.includes(name.toLowerCase())
  );

  const setAdditionalEnvironments = next => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      // Keep checked presets (including prod) even when they match primary so
      // checkbox state survives Environment Type changes; surveys unique later.
      copy.additional_environments = parseAdditionalEnvironmentsList(next);
      return copy;
    });
  };

  const toggleAdditionalEnvPreset = name => {
    const current = additionalEnvironmentsList;
    const exists = current.some(item => item.toLowerCase() === name.toLowerCase());
    setAdditionalEnvironments(
      exists
        ? current.filter(item => item.toLowerCase() !== name.toLowerCase())
        : [...current, name]
    );
  };

  const addAdditionalEnvOther = () => {
    const draft = String(additionalEnvOtherDraft || '').trim();
    if (!draft) return;
    const primary = String(data.environment || '').trim().toLowerCase();
    if (draft.toLowerCase() === primary) {
      setAdditionalEnvOtherDraft('');
      return;
    }
    setAdditionalEnvironments([...additionalEnvironmentsList, draft]);
    setAdditionalEnvOtherDraft('');
    setAdditionalEnvOtherEnabled(true);
  };

  const removeAdditionalEnvCustom = name => {
    setAdditionalEnvironments(
      additionalEnvironmentsList.filter(item => item.toLowerCase() !== name.toLowerCase())
    );
  };

  const newCredentialId = () => `cred-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const credentialTabKey = (credential, index) => credential.id || `credential-${index}`;

  const DEFAULT_AAP_EXECUTION_ENVIRONMENT = 'ee-supported-rhel9';

  const defaultOrgEeName = org => {
    const prefix = String(org || 'ADO').trim() || 'ADO';
    return `${prefix}-ee`;
  };

  const defaultHubImageName = () => DEFAULT_HUB_EE_IMAGE_NAME;

  const normalizeHubImageName = value => {
    const raw = String(value || '').trim();
    if (!raw || raw === 'ADO-ee' || raw === 'ee') return DEFAULT_HUB_EE_IMAGE_NAME;
    return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
      || DEFAULT_HUB_EE_IMAGE_NAME;
  };

  const resolveOrgEeName = (value, org) => {
    const prefix = String(org || 'ADO').trim() || 'ADO';
    const fallback = `${prefix}-ee`;
    const raw = String(value || '').trim();
    if (!raw || raw === 'ado-ee' || raw === 'ee') return fallback;
    if (raw.startsWith(`${prefix}-`)) return raw;
    return `${prefix}-${raw.replace(/^-+/, '')}`;
  };

  const resolveHubExecutionEnvironmentName = aap => {
    const org = aap?.organization || 'ADO';
    const custom = String(aap?.hub_ee_execution_environment_name || '').trim();
    if (custom && custom !== DEFAULT_HUB_EE_IMAGE_NAME) return resolveOrgEeName(custom, org);
    return defaultOrgEeName(org);
  };

  const setAapVersion = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      copy.aap.version = value;
      if (copy.pre_installs?.install_aap) {
        if (!copy.component_config) copy.component_config = {};
        if (!copy.component_config.aap) copy.component_config.aap = {};
        copy.component_config.aap.deployment_version = aapDottedVersion(value);
      }
      return copy;
    });
  };

  const setAapHostname = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      const previousHostname = copy.aap.hostname || '';
      copy.aap.hostname = value;
      if (Array.isArray(copy.aap.galaxy_credentials) && copy.aap.galaxy_credentials.length > 0) {
        copy.aap.galaxy_credentials = applyHostnameToGalaxyCredentials(
          copy.aap.galaxy_credentials,
          value,
          previousHostname
        );
      }
      if (copy.aap.container_registry_credential) {
        copy.aap.container_registry_credential = applyHostnameToContainerRegistryCredential(
          copy.aap.container_registry_credential,
          value,
          previousHostname
        );
      }
      return copy;
    });
  };

  const pingAapController = async () => {
    setAapPingBusy(true);
    setAapPingMessage('');
    setAapPingStatus('');
    try {
      const response = await fetch('/api/aap-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aap: {
            hostname: data.aap?.hostname || '',
            oauth_token: data.aap?.oauth_token || '',
            admin_username: data.aap?.admin_username || '',
            admin_password: data.aap?.admin_password || '',
            skip_tls_verify: data.aap?.skip_tls_verify === true
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setAapPingStatus('success');
      setAapPingMessage(
        `Successful — connected to ${payload.url || data.aap?.hostname}`
      );
    } catch (err) {
      setAapPingStatus('error');
      setAapPingMessage(`Failed: ${err.message}`);
    } finally {
      setAapPingBusy(false);
    }
  };

  const fetchKeycloakRealmPublicKey = async () => {
    setKeycloakPublicKeyBusy(true);
    setKeycloakPublicKeyMessage('');
    const oidc = data.aap?.auth?.keycloak_oidc || {};
    try {
      const response = await fetch('/api/keycloak/realm-public-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skip_tls_verify: data.aap?.skip_tls_verify === true,
          authorization_url: oidc.authorization_url || '',
          access_token_url: oidc.access_token_url || ''
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      set('aap.auth.keycloak_oidc.public_key', payload.publicKey || '');
      setKeycloakPublicKeyMessage(
        `Fetched RS256 public key from ${payload.realmUrl || 'Keycloak realm'}.`
      );
    } catch (err) {
      setKeycloakPublicKeyMessage(`Fetch failed: ${err.message}`);
    } finally {
      setKeycloakPublicKeyBusy(false);
    }
  };

  const setAapHubValidated = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      copy.aap.hub_publish_ado_collection = value;
      copy.aap.hub_mark_ado_validated = value;
      if (!value) {
        copy.aap.hub_force_ado_collection_update = false;
      } else {
        // Hub collection publish needs Galaxy/Hub API token creds + org.
        copy.aap.galaxy_setup_enabled = true;
        if (!Array.isArray(copy.aap.galaxy_credentials) || copy.aap.galaxy_credentials.length === 0) {
          copy.aap.galaxy_credentials = buildDefaultGalaxyCredentials(
            copy.aap.organization || 'ADO',
            copy.aap.hostname || ''
          );
        }
        if (!copy.aap.container_registry_credential) {
          copy.aap.container_registry_credential = buildDefaultContainerRegistryCredential(
            copy.aap.organization || 'ADO',
            copy.aap.hostname || ''
          );
        }
      }
      return copy;
    });
  };

  const setAapStandaloneRun = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      copy.aap.standalone_run = value === true;
      copy.aap.hub_update_collection_only = value === true;
      if (value === true) {
        copy.components = [];
        delete copy.component;
        copy.platform = [];
        copy.selected_component_apps = [];
        copy.component_config = {};
        copy.component_options = {};
        if (!copy.git) copy.git = {};
        copy.git.vars_only = false;
        // Hub/AAP-tabs-only: publish to Hub — do not git-push bootstrap repo unless re-enabled on Git card.
        copy.git.auto_push = false;
      }
      return copy;
    });
  };

  const setAapHubPushEe = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      const previousHubEe = resolveHubExecutionEnvironmentName(copy.aap);
      copy.aap.hub_push_ee = value === true;
      if (copy.aap.hub_push_ee) {
        const org = copy.aap.organization || 'ADO';
        // EE push needs Contoller org + Container Registry cred (avoids ImagePullBackOff).
        copy.aap.galaxy_setup_enabled = true;
        if (!Array.isArray(copy.aap.galaxy_credentials) || copy.aap.galaxy_credentials.length === 0) {
          copy.aap.galaxy_credentials = buildDefaultGalaxyCredentials(org, copy.aap.hostname || '');
        } else {
          copy.aap.galaxy_credentials = normalizeGalaxyCredentialOrder(copy.aap.galaxy_credentials);
        }
        if (!copy.aap.container_registry_credential) {
          copy.aap.container_registry_credential = buildDefaultContainerRegistryCredential(
            org,
            copy.aap.hostname || ''
          );
        } else if (!copy.aap.container_registry_credential.host) {
          copy.aap.container_registry_credential.host = String(copy.aap.hostname || '').replace(/\/+$/, '');
        }
        if (
          !String(copy.aap.hub_ee_name || '').trim()
          || copy.aap.hub_ee_name === 'ADO-ee'
        ) {
          copy.aap.hub_ee_name = defaultHubImageName();
        } else {
          copy.aap.hub_ee_name = normalizeHubImageName(copy.aap.hub_ee_name);
        }
        if (
          !String(copy.aap.hub_ee_execution_environment_name || '').trim()
          || copy.aap.hub_ee_execution_environment_name === 'ado-ee'
        ) {
          copy.aap.hub_ee_execution_environment_name = defaultOrgEeName(org);
        } else {
          copy.aap.hub_ee_execution_environment_name = resolveOrgEeName(
            copy.aap.hub_ee_execution_environment_name,
            org
          );
        }
        if (!String(copy.aap.hub_ee_description || '').trim()) {
          copy.aap.hub_ee_description = defaults.aap.hub_ee_description;
        }
        if (copy.aap.hub_ee_pull === undefined) copy.aap.hub_ee_pull = false;
        syncHubEeSourceImage(copy.aap);
        copy.aap.execution_environment = resolveHubExecutionEnvironmentName(copy.aap);
      } else {
        if (
          !copy.aap.execution_environment
          || copy.aap.execution_environment === previousHubEe
        ) {
          copy.aap.execution_environment = DEFAULT_AAP_EXECUTION_ENVIRONMENT;
        }
      }
      return copy;
    });
  };

  const moveGalaxyCredential = (index, direction) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      const list = [...(copy.aap.galaxy_credentials || [])];
      const target = index + direction;
      if (target < 0 || target >= list.length) return prev;
      const tmp = list[index];
      list[index] = list[target];
      list[target] = tmp;
      copy.aap.galaxy_credentials = normalizeGalaxyCredentialOrder(list);
      return copy;
    });
  };

  const setGalaxyCredentialOrder = (index, rawOrder) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      const list = [...(copy.aap.galaxy_credentials || [])];
      if (!list[index]) return prev;
      const parsed = parseInt(rawOrder, 10);
      list[index] = {
        ...list[index],
        order: Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1
      };
      copy.aap.galaxy_credentials = normalizeGalaxyCredentialOrder(list);
      return copy;
    });
  };

  const setAapHubEeNameField = (field, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      const previousHubEe = resolveHubExecutionEnvironmentName(copy.aap);
      copy.aap[field] = value;
      if (copy.aap.hub_push_ee) {
        const nextHubEe = resolveHubExecutionEnvironmentName(copy.aap);
        if (
          !copy.aap.execution_environment
          || copy.aap.execution_environment === previousHubEe
          || copy.aap.execution_environment === DEFAULT_AAP_EXECUTION_ENVIRONMENT
        ) {
          copy.aap.execution_environment = nextHubEe;
        }
      }
      return copy;
    });
  };

  const derivedAapNames = org => {
    const prefix = (org || 'ADO').trim() || 'ADO';
    return {
      inventory: `${prefix}-inventory`,
      project: `${prefix}-project`,
      vault_credential_name: `${prefix}-vault`,
      machine_credential_name: `${prefix}-machine`
    };
  };

  const normalizeOrgScopedName = (value, org, fallbackSuffix) => {
    const prefix = (org || 'ADO').trim() || 'ADO';
    const fallback = `${prefix}-${fallbackSuffix}`;
    const raw = String(value || fallback).trim() || fallback;
    const cleaned = raw.replace(/\s+/g, '-');

    return cleaned.startsWith(`${prefix}-`) ? cleaned : `${prefix}-${cleaned}`;
  };

  const setAapOrganization = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const previous = copy.aap?.organization || 'ADO';
      const oldNames = derivedAapNames(previous);
      const newNames = derivedAapNames(value);

      if (!copy.aap) copy.aap = {};
      copy.aap.organization = value;
      if (!copy.aap.inventory || copy.aap.inventory === oldNames.inventory) copy.aap.inventory = newNames.inventory;
      if (!copy.aap.project || copy.aap.project === oldNames.project) copy.aap.project = newNames.project;
      if (!copy.aap.vault_credential_name || copy.aap.vault_credential_name === oldNames.vault_credential_name) {
        copy.aap.vault_credential_name = newNames.vault_credential_name;
      }
      if (!copy.aap.machine_credential) copy.aap.machine_credential = {};
      if (!copy.aap.machine_credential.name || copy.aap.machine_credential.name === oldNames.machine_credential_name) {
        copy.aap.machine_credential.name = newNames.machine_credential_name;
      }

      const oldEe = defaultOrgEeName(previous);
      const newEe = defaultOrgEeName(value);
      if (
        !copy.aap.hub_ee_name
        || copy.aap.hub_ee_name === 'ADO-ee'
        || copy.aap.hub_ee_name === DEFAULT_HUB_EE_IMAGE_NAME
      ) {
        copy.aap.hub_ee_name = defaultHubImageName();
      } else {
        copy.aap.hub_ee_name = normalizeHubImageName(copy.aap.hub_ee_name);
      }
      if (
        !copy.aap.hub_ee_execution_environment_name
        || copy.aap.hub_ee_execution_environment_name === oldEe
        || copy.aap.hub_ee_execution_environment_name === 'ado-ee'
      ) {
        copy.aap.hub_ee_execution_environment_name = newEe;
      } else {
        copy.aap.hub_ee_execution_environment_name = resolveOrgEeName(
          copy.aap.hub_ee_execution_environment_name,
          value
        );
      }
      if (copy.aap.hub_push_ee) {
        const previousHubEe = oldEe;
        if (
          !copy.aap.execution_environment
          || copy.aap.execution_environment === previousHubEe
          || copy.aap.execution_environment === DEFAULT_AAP_EXECUTION_ENVIRONMENT
        ) {
          copy.aap.execution_environment = resolveHubExecutionEnvironmentName(copy.aap);
        }
      }

      const oldPrefix = (previous || 'ADO').trim() || 'ADO';
      const newPrefix = (value || 'ADO').trim() || 'ADO';
      if (!Array.isArray(copy.aap.galaxy_credentials) || copy.aap.galaxy_credentials.length === 0) {
        copy.aap.galaxy_credentials = buildDefaultGalaxyCredentials(newPrefix, copy.aap.hostname);
      } else {
        copy.aap.galaxy_credentials = copy.aap.galaxy_credentials.map(credential => {
          if (!credential || credential.id === 'galaxy' || credential.name === 'Ansible Galaxy') {
            return credential;
          }
          const next = { ...credential };
          if (!next.name || next.name === `${oldPrefix}-${next.id}` || next.name.startsWith(`${oldPrefix}-`)) {
            next.name = `${newPrefix}-${next.id || 'galaxy'}`;
            if (next.id === 'validated') next.name = `${newPrefix}-validated`;
            if (next.id === 'published') next.name = `${newPrefix}-published`;
            if (next.id === 'community') next.name = `${newPrefix}-community`;
            if (next.id === 'certified') next.name = `${newPrefix}-certified`;
          }
          return next;
        });
      }
      if (!copy.aap.container_registry_credential) {
        copy.aap.container_registry_credential = buildDefaultContainerRegistryCredential(newPrefix, copy.aap.hostname);
      } else {
        const registry = { ...copy.aap.container_registry_credential };
        if (!registry.name || registry.name === `${oldPrefix}-EE`) {
          registry.name = `${newPrefix}-EE`;
        }
        copy.aap.container_registry_credential = registry;
      }

      return copy;
    });
  };

  const groupComponents = ['openshift', 'rhel', 'patching', 'aws', 'provision'];

  const selectedComponentAppsFrom = source => {
    if (Array.isArray(source.components) && source.components.includes('all')) {
      return [
        ...new Set([
          ...openshiftApps,
          ...rhelApps,
          ...patchingApps,
          ...awsApps,
          ...provisionApps,
          'jira'
        ])
      ];
    }

    const out = [];
    const expandableGroups = ['openshift', 'rhel', 'patching', 'aws', 'provision'];
    const components = Array.isArray(source.components) ? source.components : [];

    components.forEach(component => {
      if (expandableGroups.includes(component)) {
        const selected = source.component_apps?.[component] || [];
        out.push(...(selected.length > 0 ? selected : [component]));
      } else {
        out.push(component);
      }
    });

    const derived = [...new Set(out.filter(Boolean))];

    if (derived.length > 0) {
      return derived;
    }

    if (Array.isArray(source.selected_component_apps) && source.selected_component_apps.length > 0) {
      return [...new Set(source.selected_component_apps)];
    }

    return [];
  };

  const pruneInactiveComponentApps = source => {
    const pruned = JSON.parse(JSON.stringify(source || {}));
    const components = Array.isArray(pruned.components) ? pruned.components : [];
    const allSelected = components.includes('all');

    if (!pruned.component_apps) pruned.component_apps = {};

    groupComponents.forEach(group => {
      if (!Array.isArray(pruned.component_apps[group])) {
        pruned.component_apps[group] = [];
      }

      if (!allSelected && !components.includes(group)) {
        pruned.component_apps[group] = [];
      }
    });

    return pruned;
  };

  const deepMerge = (baseValue, incomingValue) => {
    if (incomingValue === undefined) {
      return Array.isArray(baseValue) ? [...baseValue] : baseValue;
    }

    if (Array.isArray(incomingValue)) {
      return [...incomingValue];
    }

    if (
      incomingValue &&
      typeof incomingValue === 'object' &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      const merged = { ...baseValue };

      Object.entries(incomingValue).forEach(([key, value]) => {
        merged[key] = deepMerge(baseValue[key], value);
      });

      return merged;
    }

    return incomingValue;
  };

  const defaultComponentConfig = component => {
    if (component === 'aws') {
      return JSON.parse(JSON.stringify(defaults.component_config.aws));
    }

    const noReplicaComponents = ['rhel', 'satellite', 'idm', 'compliance', 'stig', 'patching'];
    const fallback = noReplicaComponents.includes(component)
      ? (component === 'patching' || component === 'rhel' ? { hostname: '', hosts: [] } : { hostname: '' })
      : { hostname: '', storage: '', replicas: 1 };
    const base = defaults.component_config?.[component] || fallback;
    const config = JSON.parse(JSON.stringify(base));
    if (!noReplicaComponents.includes(component) && (config.replicas === undefined || config.replicas === null || config.replicas === '')) {
      config.replicas = 1;
    }

    if (component === 'rhel' || component === 'patching') {
      if (!Array.isArray(config.hosts)) config.hosts = [];
      if (config.hostname === undefined) config.hostname = '';
    }

    if (component === 'patching') {
      if (!config.inventory_mode) config.inventory_mode = 'create';
      if (config.inventory_name === undefined) config.inventory_name = '';
    }

    if (component === 'satellite') {
      config.dynamic_inventory_enabled = !!config.dynamic_inventory_enabled;
      if (config.validate_certs === undefined) config.validate_certs = false;
      if (!config.credential_name) config.credential_name = 'ADO Satellite Service Account';
      if (!config.inventory_source_name) config.inventory_source_name = 'ADO Satellite Dynamic Inventory';
      if (config.inventory_overwrite === undefined) config.inventory_overwrite = true;
      if (config.inventory_overwrite_vars === undefined) config.inventory_overwrite_vars = true;
      if (config.inventory_update_on_launch === undefined) config.inventory_update_on_launch = true;
      if (config.inventory_update_cache_timeout === undefined) config.inventory_update_cache_timeout = 0;
      if (config.inventory_verbosity === undefined) config.inventory_verbosity = 0;
      if (config.inventory_host_filter === undefined) config.inventory_host_filter = '';
      if (!config.deployment_version) config.deployment_version = '6.19';
      if (!config.location) config.location = '';
      if (!config.rhn_org_id) config.rhn_org_id = '';
      if (!config.admin_rhn_activation_key) config.admin_rhn_activation_key = '';
      if (config.manifest_file === undefined) config.manifest_file = '';
      if (config.manifest_content_base64 === undefined) config.manifest_content_base64 = '';
      if (config.manifest_encoding === undefined) config.manifest_encoding = 'base64';
      if (config.manifest_organization === undefined) config.manifest_organization = '';
      if (!config.size_profile) config.size_profile = 'default';
      if (!Array.isArray(config.size) || config.size.length === 0) {
        config.size = JSON.parse(JSON.stringify(defaults.component_config.satellite.size));
      }
      if (!Array.isArray(config.req_dirs) || config.req_dirs.length === 0) {
        config.req_dirs = JSON.parse(JSON.stringify(defaults.component_config.satellite.req_dirs));
      }
    }

    if (component === 'idm') {
      delete config.storage;
      if (config.replica_hostname === undefined) config.replica_hostname = '';
      if (config.replica_install_dns === undefined) config.replica_install_dns = true;
      if (config.replica_install_ca === undefined) config.replica_install_ca = true;
      if (config.auto_forwarders === undefined) config.auto_forwarders = true;
      if (config.custom_cert_file === undefined) config.custom_cert_file = '';
      if (config.custom_cert_key_file === undefined) config.custom_cert_key_file = '';
      if (config.custom_cert_chain_file === undefined) config.custom_cert_chain_file = '';
      if (config.admin_password === undefined) config.admin_password = '';
      if (config.directory_manager_password === undefined) config.directory_manager_password = '';
    }

    return config;
  };

  const hydrateSelectedComponentConfigs = source => {
    const hydrated = JSON.parse(JSON.stringify(source || {}));
    const selectedApps = selectedComponentAppsFrom(hydrated);
    const allowedConfig = new Set(selectedApps);
    const components = Array.isArray(hydrated.components) ? hydrated.components : [];

    // Patching inventory hosts live under component_config.patching even when only
    // satellite/idm apps are checked under the Patching group.
    if (components.includes('all') || components.includes('patching')) {
      allowedConfig.add('patching');
    }

    // Install AAP keeps install settings without selecting AAP as a platform component.
    if (installAapRequested(hydrated)) {
      allowedConfig.add('aap');
    }

    if (components.includes('all') || components.includes('aws')) {
      allowedConfig.add('aws');
    }

    if (!hydrated.component_config) hydrated.component_config = {};

    [...allowedConfig].forEach(component => {
      const defaultsForComponent = defaultComponentConfig(component);
      hydrated.component_config[component] = deepMerge(
        defaultsForComponent,
        hydrated.component_config[component] || {}
      );

      if (component === 'satellite' && hydrated.component_config[component].dynamic_inventory_enabled === undefined) {
        hydrated.component_config[component].dynamic_inventory_enabled = false;
      }

      if (component === 'idm') {
        delete hydrated.component_config[component].storage;
      }
    });

    hydrated.component_config = Object.fromEntries(
      Object.entries(hydrated.component_config).filter(([component]) => allowedConfig.has(component))
    );

    if (selectedApps.includes('grafana') && selectedApps.includes('rhbk')) {
      syncGrafanaOidcFromRhbk(hydrated, { force: false });
    }

    const rhbkAuthApps = ['quay', 'minio', 'dev_hub', 'bookstack', 'netbox'];
    if (selectedApps.includes('rhbk')) {
      rhbkAuthApps.forEach(app => {
        if (!selectedApps.includes(app)) return;
        if (!hydrated.component_options[app]) hydrated.component_options[app] = [];
        if (!hydrated.component_options[app].includes('oidc')) {
          hydrated.component_options[app].push('oidc');
        }
      });
      if (selectedApps.includes('zabbix')) {
        if (!hydrated.component_options.zabbix) hydrated.component_options.zabbix = [];
        if (!hydrated.component_options.zabbix.includes('saml')) {
          hydrated.component_options.zabbix.push('saml');
        }
      }
    }

    if (selectedApps.includes('dev_hub')) {
      syncDevHubGitlabTokenFromGit(hydrated);
    }

    return hydrated;
  };

  const normalizeImportedPreflight = imported => {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
      throw new Error('Uploaded file must contain a JSON object.');
    }

    const normalizedInput = { ...imported };

    if (!Array.isArray(normalizedInput.components) || normalizedInput.components.length === 0) {
      if (Array.isArray(normalizedInput.platform) && normalizedInput.platform.length > 0) {
        normalizedInput.components = [...normalizedInput.platform];
      } else if (normalizedInput.component) {
        normalizedInput.components = [normalizedInput.component];
      } else if (Array.isArray(normalizedInput.selected_component_apps) && normalizedInput.selected_component_apps.length > 0) {
        normalizedInput.components = [...normalizedInput.selected_component_apps];
      }
    }

    let merged = deepMerge(defaults, normalizedInput);

    if (!Array.isArray(merged.components)) {
      merged.components = [];
    }

    merged.components = [...new Set(merged.components.filter(Boolean))];
    if (merged.components.length === 0) {
      delete merged.component;
    } else {
      merged.component = merged.components.includes('all') ? 'all' : merged.components[0];
    }

    if (
      Array.isArray(merged.components)
      && merged.components.includes('ec2_ami_copy')
      && !merged.components.includes('aws')
    ) {
      merged.components = [
        ...merged.components.filter(component => component !== 'ec2_ami_copy'),
        'aws'
      ];
      if (!merged.component_apps) merged.component_apps = {};
      if (!Array.isArray(merged.component_apps.aws)) merged.component_apps.aws = [];
      if (!merged.component_apps.aws.includes('ec2_ami_copy')) {
        merged.component_apps.aws.push('ec2_ami_copy');
      }
      if (!merged.component_options) merged.component_options = {};
      merged.component_options.aws = [...merged.component_apps.aws];
      merged.component = merged.components[0];
    }

    if (!merged.component_apps) merged.component_apps = {};
    groupComponents.forEach(group => {
      if (!Array.isArray(merged.component_apps[group])) {
        merged.component_apps[group] = [];
      }
    });
    merged = pruneInactiveComponentApps(merged);

    if (!merged.component_config) merged.component_config = {};
    if (merged.component_config.idm) {
      delete merged.component_config.idm.storage;
    }
    merged = hydrateSelectedComponentConfigs(merged);
    if (!merged.component_options) merged.component_options = {};
    if (Array.isArray(merged.component_options.openshift)) {
      if (merged.component_options.openshift.includes('discover_routes_alt')) {
        merged.component_options.openshift = [
          ...merged.component_options.openshift.filter(option => option !== 'discover_routes_alt'),
          ...(merged.component_options.openshift.includes('alternate_routes') ? [] : ['alternate_routes'])
        ];
        if (!merged.openshift) merged.openshift = {};
        merged.openshift.alternate_routes = {
          ...(defaults.openshift?.alternate_routes || {}),
          ...(merged.openshift.alternate_routes || {}),
          print_alt_routes: merged.openshift?.alternate_routes?.print_alt_routes ?? true,
          add_alt_routes: merged.openshift?.alternate_routes?.add_alt_routes ?? true
        };
      }
    }
    if (!merged.openshift) merged.openshift = {};
    if (!merged.openshift.discover_routes) {
      merged.openshift.discover_routes = { ...(defaults.openshift?.discover_routes || {}) };
    }
    if (!merged.openshift.alternate_routes) {
      merged.openshift.alternate_routes = { ...(defaults.openshift?.alternate_routes || {}) };
    }
    if (!merged.aap) merged.aap = {};
    if (!Array.isArray(merged.aap.additional_credentials)) merged.aap.additional_credentials = [];
    merged.aap.additional_credentials = merged.aap.additional_credentials.map((credential, index) => ({
      ...credential,
      id: credential.id || `imported-credential-${index + 1}`
    }));
    if (merged.aap.hub_force_ado_collection_update === undefined) merged.aap.hub_force_ado_collection_update = false;
    if (merged.aap.hub_publish_ado_collection === undefined) merged.aap.hub_publish_ado_collection = false;
    merged.aap.hub_mark_ado_validated = merged.aap.hub_publish_ado_collection === true;
    if (merged.aap.hub_update_collection_only === undefined) merged.aap.hub_update_collection_only = false;
    if (merged.aap.standalone_run === undefined) {
      merged.aap.standalone_run = merged.aap.hub_update_collection_only === true;
    }
    syncAapStandaloneFields(merged.aap);
    if (merged.hub && typeof merged.hub === 'object') {
      if (merged.hub.update_only !== undefined) {
        merged.aap.hub_update_collection_only = merged.hub.update_only === true;
      }
      if (merged.hub.publish_ado_collection !== undefined) {
        merged.aap.hub_publish_ado_collection = merged.hub.publish_ado_collection === true;
        merged.aap.hub_mark_ado_validated = merged.aap.hub_publish_ado_collection;
      }
      if (merged.hub.force_ado_collection_update !== undefined) {
        merged.aap.hub_force_ado_collection_update = merged.hub.force_ado_collection_update === true;
      }
      if (merged.hub.push_ee !== undefined) merged.aap.hub_push_ee = merged.hub.push_ee === true;
      if (merged.hub.hostname) merged.aap.hub_hostname = merged.hub.hostname;
      if (merged.hub.registry) merged.aap.hub_ee_registry = merged.hub.registry;
      if (merged.hub.ee && typeof merged.hub.ee === 'object') {
        const ee = merged.hub.ee;
        if (ee.source_image) merged.aap.hub_ee_source_image = ee.source_image;
        if (ee.name) merged.aap.hub_ee_name = ee.name;
        if (ee.tag) merged.aap.hub_ee_tag = ee.tag;
        if (ee.pull !== undefined) merged.aap.hub_ee_pull = ee.pull === true;
        if (ee.create_execution_environment !== undefined) {
          merged.aap.hub_ee_create_execution_environment = ee.create_execution_environment !== false;
        }
        if (ee.execution_environment_name) {
          merged.aap.hub_ee_execution_environment_name = ee.execution_environment_name;
        }
        if (ee.description) merged.aap.hub_ee_description = ee.description;
      }
    }
    syncAapStandaloneFields(merged.aap);
    if (merged.aap.hub_push_ee === undefined) merged.aap.hub_push_ee = false;
    if (merged.aap.hub_hostname === undefined) merged.aap.hub_hostname = '';
    if (!String(merged.aap.hub_hostname || '').trim()) {
      merged.aap.hub_hostname = hostnameFromUrl(merged.aap.hostname);
    }
    if (merged.aap.hub_ee_source_image === undefined) {
      merged.aap.hub_ee_source_image = defaults.aap.hub_ee_source_image;
    }
    if (merged.aap.hub_ee_pull === undefined) merged.aap.hub_ee_pull = false;
    syncHubEeSourceImage(merged.aap);
    const mergeOrg = merged.aap.organization || 'ADO';
    if (
      merged.aap.hub_ee_name === undefined
      || !String(merged.aap.hub_ee_name || '').trim()
      || merged.aap.hub_ee_name === 'ADO-ee'
    ) {
      merged.aap.hub_ee_name = defaultHubImageName();
    } else {
      merged.aap.hub_ee_name = normalizeHubImageName(merged.aap.hub_ee_name);
    }
    if (merged.aap.hub_ee_tag === undefined) merged.aap.hub_ee_tag = defaults.aap.hub_ee_tag;
    if (merged.aap.hub_ee_registry === undefined) merged.aap.hub_ee_registry = '';
    if (merged.aap.hub_ee_create_execution_environment === undefined) {
      merged.aap.hub_ee_create_execution_environment = true;
    }
    if (
      merged.aap.hub_ee_execution_environment_name === undefined
      || !String(merged.aap.hub_ee_execution_environment_name || '').trim()
      || merged.aap.hub_ee_execution_environment_name === 'ado-ee'
    ) {
      merged.aap.hub_ee_execution_environment_name = defaultOrgEeName(mergeOrg);
    } else {
      merged.aap.hub_ee_execution_environment_name = resolveOrgEeName(
        merged.aap.hub_ee_execution_environment_name,
        mergeOrg
      );
    }
    if (merged.aap.hub_ee_description === undefined || !String(merged.aap.hub_ee_description || '').trim()) {
      merged.aap.hub_ee_description = defaults.aap.hub_ee_description;
    }
    if (merged.aap.galaxy_setup_enabled === undefined) merged.aap.galaxy_setup_enabled = false;
    if (merged.aap.ignore_galaxy_cert === undefined) merged.aap.ignore_galaxy_cert = false;
    if (!merged.aap.auth) merged.aap.auth = JSON.parse(JSON.stringify(defaults.aap.auth || {}));
    if (!merged.aap.auth.keycloak_oidc) {
      merged.aap.auth.keycloak_oidc = JSON.parse(JSON.stringify(defaults.aap.auth.keycloak_oidc));
    } else     if (merged.aap.auth.keycloak_oidc.enabled === undefined) {
      merged.aap.auth.keycloak_oidc.enabled = false;
    }
    if (merged.aap.auth.keycloak_oidc.verify_ssl === undefined) {
      merged.aap.auth.keycloak_oidc.verify_ssl = false;
    }
    if (!Array.isArray(merged.aap.auth.keycloak_oidc.organization_maps)) {
      merged.aap.auth.keycloak_oidc.organization_maps = [
        { organization: mergeOrg || 'ADO', groups: '', role: 'Organization Member' }
      ];
    }
    if (!merged.aap.onboard) {
      merged.aap.onboard = JSON.parse(JSON.stringify(defaults.aap.onboard || { enabled: false, tenants: [] }));
    }
    if (merged.aap.onboard.enabled === undefined) merged.aap.onboard.enabled = false;
    if (
      merged.aap.onboard.enabled === true
      && activeOnboardTenants(merged.aap).length === 0
    ) {
      merged.aap.onboard.enabled = false;
    }
    if (!merged.aap.onboard.keycloak) {
      merged.aap.onboard.keycloak = defaultOnboardKeycloak(merged.aap);
    } else {
      const kcDefaults = defaultOnboardKeycloak(merged.aap);
      if (!String(merged.aap.onboard.keycloak.base_url || '').trim()) {
        merged.aap.onboard.keycloak.base_url = kcDefaults.base_url;
      }
      if (!String(merged.aap.onboard.keycloak.realm || '').trim()) {
        merged.aap.onboard.keycloak.realm = kcDefaults.realm;
      }
      if (merged.aap.onboard.keycloak.create_groups === undefined) {
        merged.aap.onboard.keycloak.create_groups = false;
      }
      if (merged.aap.onboard.keycloak.verify_ssl === undefined) {
        merged.aap.onboard.keycloak.verify_ssl = false;
      }
      if (!String(merged.aap.onboard.keycloak.admin_username || '').trim()) {
        merged.aap.onboard.keycloak.admin_username = 'admin';
      }
    }
    if (!Array.isArray(merged.aap.onboard.tenants)) merged.aap.onboard.tenants = [];
    if (merged.aap.galaxy_hub_token === undefined) merged.aap.galaxy_hub_token = '';
    if (!merged.aap.galaxy_user_account) {
      merged.aap.galaxy_user_account = { ...defaults.aap.galaxy_user_account };
    }
    if (!Array.isArray(merged.aap.galaxy_credentials) || merged.aap.galaxy_credentials.length === 0) {
      merged.aap.galaxy_credentials = buildDefaultGalaxyCredentials(
        merged.aap.organization || 'ADO',
        merged.aap.hostname || ''
      );
    } else {
      merged.aap.galaxy_credentials = normalizeGalaxyCredentialOrder(merged.aap.galaxy_credentials);
    }
    if (!merged.aap.container_registry_credential) {
      merged.aap.container_registry_credential = buildDefaultContainerRegistryCredential(
        merged.aap.organization || 'ADO',
        merged.aap.hostname || ''
      );
    }

    if (!merged.aap.machine_credential) merged.aap.machine_credential = { ...defaults.aap.machine_credential };
    if (!merged.git) merged.git = { ...defaults.git };
    if (merged.git.auto_push === undefined) merged.git.auto_push = true;
    if (merged.git.skip_tls_verify === undefined) merged.git.skip_tls_verify = true;
    if (merged.git.overwrite_generated === undefined) merged.git.overwrite_generated = false;
    if (!merged.git.overrides) {
      merged.git.overrides = {
        group_vars_current_env: false,
        job_and_workflow_templates: false,
        all: merged.git.overwrite_generated === true
      };
    }
    merged.git.overrides = {
      group_vars_current_env: merged.git.overrides.group_vars_current_env === true,
      job_and_workflow_templates: merged.git.overrides.job_and_workflow_templates === true,
      all: merged.git.overrides.all === true
        || merged.git.overwrite_generated === true
    };
    merged.git.overwrite_generated = merged.git.overrides.all === true;
    if (merged.git.vars_only === undefined) merged.git.vars_only = false;
    if (merged.git.username === undefined) merged.git.username = '';
    if (merged.additional_environments === undefined) merged.additional_environments = ['prod'];
    merged.additional_environments = parseAdditionalEnvironmentsList(merged.additional_environments);
    if (!merged.ansible) merged.ansible = { ...defaults.ansible };
    if (merged.ansible.extra_args === undefined) merged.ansible.extra_args = '';
    if (!merged.collections) merged.collections = { ...defaults.collections };
    if (!merged.tools) merged.tools = { ...defaults.tools };
    if (!merged.jira) merged.jira = { ...defaults.jira };
    merged.jira.enabled = merged.components.includes('all') || merged.components.includes('jira') || merged.jira.enabled === true;

    if (merged.aap?.standalone_run === true) {
      merged.git.vars_only = false;
      merged.git.auto_push = false;
    }

    return merged;
  };

  const selectImportedConfigPanel = importedData => {
    const selectedApps = selectedComponentAppsFrom(importedData);
    const nextPanel = selectedApps[0] || importedData.components?.[0] || 'all';

    setActiveConfigPanel(nextPanel);
    setActiveConfigTab(nextPanel);
    setAapOpen(importedData.aap?.enabled !== false);
    setOpenshiftOpen(importedData.components.includes('all') || importedData.components.includes('openshift'));
    setRhelOpen(importedData.components.includes('all') || importedData.components.includes('rhel'));
    setPatchingOpen(importedData.components.includes('all') || importedData.components.includes('patching'));
    setAwsOpen(importedData.components.includes('all') || importedData.components.includes('aws'));
    setProvisionOpen(importedData.components.includes('all') || importedData.components.includes('provision'));
    setActiveAapCredentialTab(importedData.aap?.additional_credentials?.[0]?.id || '');
  };

  const importJsonFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const importedData = normalizeImportedPreflight(imported);

      setData(importedData);
      selectImportedConfigPanel(importedData);
      setImportStatus(`Loaded ${file.name}`);
      setPreview(JSON.stringify(importedData, null, 2));
      setActiveTab('logs');
      setRunFinished(false);
      setShowRawOutput(false);
      setYamlDraft('');
      setYamlError('');
      setShowVaultYaml(false);
      setAgentInstallerResult(null);
    } catch (err) {
      setImportStatus(`Import failed: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const standaloneRun = aapStandaloneRun(data);

  const buildPreflightPayload = () => {
    const payload = hydrateSelectedComponentConfigs(pruneInactiveComponentApps(data));
    const selectedApps = selectedComponentAppsFrom(payload);
    const selectedGroups = Array.isArray(payload.components) ? payload.components : [];
    const allowedConfig = new Set([...selectedApps, ...selectedGroups]);
    if (installAapRequested(payload)) allowedConfig.add('aap');
    if (selectedGroups.includes('all') || selectedGroups.includes('aws')) {
      allowedConfig.add('aws');
    }
    const selectedConfig = {};
    const selectedOptions = {};

    Object.entries(payload.component_config || {}).forEach(([component, config]) => {
      if (allowedConfig.has(component)) {
        selectedConfig[component] = { ...config };
        if (component === 'idm') {
          delete selectedConfig[component].storage;
        }
      }
    });

    Object.entries(payload.component_options || {}).forEach(([component, options]) => {
      if (allowedConfig.has(component)) {
        selectedOptions[component] = options;
      }
    });

    payload.selected_component_apps = [...new Set([...selectedGroups, ...selectedApps])];
    payload.component_config = selectedConfig;
    payload.component_options = selectedOptions;
    if (payload.aap) {
      const org = payload.aap.organization || 'ADO';
      payload.aap.inventory = normalizeOrgScopedName(payload.aap.inventory, org, 'inventory');
      payload.aap.project = normalizeOrgScopedName(payload.aap.project, org, 'project');
      payload.aap.vault_credential_name = normalizeOrgScopedName(payload.aap.vault_credential_name, org, 'vault');
      if (!payload.aap.machine_credential) payload.aap.machine_credential = {};
      payload.aap.machine_credential.name = normalizeOrgScopedName(payload.aap.machine_credential.name, org, 'machine');
      payload.aap.hub_mark_ado_validated = payload.aap.hub_publish_ado_collection === true;
      if (payload.aap.hub_force_ado_collection_update === undefined) payload.aap.hub_force_ado_collection_update = false;
      syncAapStandaloneFields(payload.aap);
      if (payload.aap.standalone_run === true) {
        payload.components = [];
        delete payload.component;
        payload.platform = [];
        payload.selected_component_apps = [];
        payload.component_config = {};
        payload.component_options = {};
      }
      if (payload.aap.hub_update_collection_only === undefined) payload.aap.hub_update_collection_only = false;
      if (payload.aap.hub_push_ee === undefined) payload.aap.hub_push_ee = false;
      if (payload.aap.hub_ee_pull === undefined) payload.aap.hub_ee_pull = false;
      payload.aap.hub_ee_pull = payload.aap.hub_ee_pull === true;
      syncHubEeSourceImage(payload.aap);
      payload.aap.hub_ee_name = normalizeHubImageName(payload.aap.hub_ee_name);
      payload.aap.hub_ee_execution_environment_name = resolveOrgEeName(
        payload.aap.hub_ee_execution_environment_name
          || defaultOrgEeName(org),
        org
      );
      if (!String(payload.aap.hub_ee_description || '').trim()) {
        payload.aap.hub_ee_description = defaults.aap.hub_ee_description;
      }
      if (!String(payload.aap.hub_hostname || '').trim()) {
        payload.aap.hub_hostname = hostnameFromUrl(payload.aap.hostname);
      } else {
        payload.aap.hub_hostname = hostnameFromUrl(payload.aap.hub_hostname)
          || String(payload.aap.hub_hostname).trim();
      }
      if (!String(payload.aap.hub_ee_registry || '').trim()) {
        payload.aap.hub_ee_registry = payload.aap.hub_hostname;
      } else {
        payload.aap.hub_ee_registry = hostnameFromUrl(payload.aap.hub_ee_registry)
          || String(payload.aap.hub_ee_registry).trim();
      }
      payload.hub = {
        name: `${org}-hub`,
        hostname: payload.aap.hub_hostname,
        registry: payload.aap.hub_ee_registry,
        publish_ado_collection: payload.aap.hub_publish_ado_collection === true,
        force_ado_collection_update: payload.aap.hub_force_ado_collection_update === true,
        mark_ado_validated: payload.aap.hub_mark_ado_validated === true,
        update_only: payload.aap.hub_update_collection_only === true,
        push_ee: payload.aap.hub_push_ee === true,
        ee: {
          source_image: payload.aap.hub_ee_source_image,
          name: payload.aap.hub_ee_name,
          tag: payload.aap.hub_ee_tag,
          pull: payload.aap.hub_ee_pull === true,
          create_execution_environment: payload.aap.hub_ee_create_execution_environment !== false,
          execution_environment_name: payload.aap.hub_ee_execution_environment_name,
          description: payload.aap.hub_ee_description
        }
      };
      // Hub/Galaxy API token is separate from Controller OAuth — only propagate the
      // shared Hub token into empty per-credential token fields when Galaxy setup runs.
      if (payload.aap.galaxy_setup_enabled === true) {
        const sharedHubToken = String(payload.aap.galaxy_hub_token || '').trim();
        if (Array.isArray(payload.aap.galaxy_credentials)) {
          payload.aap.galaxy_credentials = payload.aap.galaxy_credentials.map((cred) => {
            if (!cred || typeof cred !== 'object') return cred;
            const next = { ...cred };
            if (!String(next.token || '').trim() && sharedHubToken) {
              next.token = sharedHubToken;
            }
            return next;
          });
        }
        const registry = payload.aap.container_registry_credential;
        if (registry && typeof registry === 'object' && registry.enabled !== false) {
          const generalUser = String(payload.aap.admin_username || 'admin').trim() || 'admin';
          if (!String(registry.username || '').trim()) registry.username = generalUser;
          if (!String(registry.password || '').trim() && sharedHubToken) {
            registry.password = sharedHubToken;
          }
          if (!String(registry.host || '').trim()) {
            registry.host = payload.aap.hub_hostname
              || String(payload.aap.hostname || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
          }
          if (payload.aap.skip_tls_verify === true && registry.verify_ssl === true) {
            registry.verify_ssl = false;
          }
        }
      }

      payload.aap.additional_credentials = (payload.aap.additional_credentials || []).map(credential => {
        const { id, ...credentialPayload } = credential;
        return credentialPayload;
      });
    }

    const installAap = installAapRequested(payload);
    if (installAap) {
      if (!payload.component_config) payload.component_config = {};
      if (!payload.component_config.aap) payload.component_config.aap = {};
      payload.component_config.aap.deployment_version = aapDottedVersion(
        payload.component_config.aap.deployment_version || payload.aap?.version
      );
      // Checking Install AAP must not select the AAP platform component.
      if (!aapAppExplicitlySelected(payload)) {
        payload.components = (payload.components || []).filter(c => c !== 'aap');
        payload.selected_component_apps = (payload.selected_component_apps || []).filter(c => c !== 'aap');
      }
    }
    if (!installAap) {
      // Using AAP / Contoller config must not keep a leftover `aap` component that
      // only exists to emit the Install AAP on OpenShift job template.
      if (!aapAppExplicitlySelected(payload)) {
        payload.components = (payload.components || []).filter(c => c !== 'aap');
        payload.selected_component_apps = (payload.selected_component_apps || []).filter(c => c !== 'aap');
        if (payload.component_config) delete payload.component_config.aap;
      }
    }
    const agentEnabled = !!(
      payload.pre_installs?.openshift_agent_enabled
      || payload.pre_installs?.openshift_agent === true
      || (payload.pre_installs?.openshift_agent && typeof payload.pre_installs.openshift_agent === 'object'
        && (payload.pre_installs.openshift_agent.pull_secret || payload.pre_installs.openshift_agent.ssh_public_key))
    );
    const needsOpenshiftAuth = installAap || agentEnabled || allowedConfig.has('openshift');

    if (!needsOpenshiftAuth) {
      delete payload.openshift;
    } else if (payload.openshift) {
      const openshiftOptions = payload.component_options?.openshift || [];
      if (!allowedConfig.has('openshift') || !openshiftOptions.includes('admin_htpasswd')) {
        delete payload.openshift.admin_username;
        delete payload.openshift.admin_password;
        delete payload.openshift.admin_role;
        delete payload.openshift.htpasswd_action;
        delete payload.openshift.htpasswd_users;
      } else {
        const users = Array.isArray(payload.openshift.htpasswd_users)
          ? payload.openshift.htpasswd_users
          : [];
        if (!payload.openshift.htpasswd_action) {
          payload.openshift.htpasswd_action = 'add';
        }
        if (users.length > 0) {
          payload.openshift.admin_username = users[0].name || payload.openshift.admin_username || 'admin';
          payload.openshift.admin_password = users[0].password || '';
          payload.openshift.admin_role = users[0].role || 'cluster-admin';
        }
      }
      if (!allowedConfig.has('openshift') || !openshiftOptions.includes('console_banner')) {
        delete payload.openshift.banner_text;
        delete payload.openshift.banner_location;
        delete payload.openshift.banner_background_color;
        delete payload.openshift.banner_text_color;
      }
      if (!agentEnabled && !(payload.component_options?.openshift || []).includes('agent_installer')) {
        delete payload.openshift.agent_installer;
      }
      // Auth-only path (Install AAP / agent without OpenShift component): keep API fields only.
      if (!allowedConfig.has('openshift')) {
        payload.openshift = {
          api_host: payload.openshift.api_host || '',
          token: payload.openshift.token || '',
          skip_tls_verify: payload.openshift.skip_tls_verify !== false,
          kubeconfig_content: payload.openshift.kubeconfig_content || '',
          ...(payload.openshift.agent_installer
            ? { agent_installer: payload.openshift.agent_installer }
            : {})
        };
      }
    }

    if (payload.pre_installs) {
      const agentCfg = payload.openshift?.agent_installer || {};
      if (!payload.pre_installs.openshift_agent || typeof payload.pre_installs.openshift_agent !== 'object') {
        payload.pre_installs.openshift_agent = {};
      }
      payload.pre_installs.openshift_agent = {
        api_host: payload.pre_installs.openshift_agent.api_host || payload.openshift?.api_host || '',
        pull_secret: payload.pre_installs.openshift_agent.pull_secret || agentCfg.pull_secret || '',
        ssh_public_key: payload.pre_installs.openshift_agent.ssh_public_key || agentCfg.ssh_public_key || ''
      };
      if (installAap || allowedConfig.has('aap') || payload.pre_installs?.attach_aap_license) {
        if (!payload.component_config) payload.component_config = {};
        if (!payload.component_config.aap) payload.component_config.aap = {};
        const attachLicense = !!payload.pre_installs?.attach_aap_license;
        const fullInstall = !!payload.pre_installs?.install_aap;
        // Never leave a sticky install flag when Install AAP / Attach license are unchecked.
        payload.component_config.aap.install_during_bootstrap = fullInstall || attachLicense;
        const licenseOnly = attachLicense && !fullInstall;
        payload.component_config.aap.license_only = licenseOnly;
        if (!payload.pre_installs.aap) payload.pre_installs.aap = {};
        payload.pre_installs.aap.license_only = licenseOnly;
        if (licenseOnly && payload.aap?.hostname) {
          payload.component_config.aap.hostname = String(payload.aap.hostname)
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');
        }
        if (licenseOnly && payload.aap?.admin_password) {
          payload.component_config.aap.admin_password = payload.aap.admin_password;
        }
        if (payload.pre_installs.aap) {
          const preAap = payload.pre_installs.aap;
          if (preAap.license_mode) payload.component_config.aap.license_mode = preAap.license_mode;
          if (preAap.subscription_manifest_file) {
            payload.component_config.aap.subscription_manifest_file = preAap.subscription_manifest_file;
          }
          if (preAap.subscription_manifest_content_base64) {
            payload.component_config.aap.subscription_manifest_content_base64 = preAap.subscription_manifest_content_base64;
          }
          if (preAap.subscription_manifest_encoding) {
            payload.component_config.aap.subscription_manifest_encoding = preAap.subscription_manifest_encoding;
          }
          if (preAap.rhn_username) payload.component_config.aap.rhn_username = preAap.rhn_username;
          if (preAap.rhn_password) payload.component_config.aap.rhn_password = preAap.rhn_password;
          if (preAap.rhn_subscription_id) {
            payload.component_config.aap.rhn_subscription_id = preAap.rhn_subscription_id;
          }
          if (preAap.rhn_client_id) payload.component_config.aap.rhn_client_id = preAap.rhn_client_id;
          if (preAap.rhn_client_secret) {
            payload.component_config.aap.rhn_client_secret = preAap.rhn_client_secret;
          }
        }
      }
    }

    if (!selectedApps.includes('jira')) {
      payload.jira = { ...(payload.jira || {}), enabled: false };
    }

    stripInactiveAapSections(payload);

    // Form controls win over imported JSON — only ansible.verbosity is used at runtime.
    payload.ansible = payload.ansible || {};
    payload.ansible.verbosity = Number.parseInt(payload.ansible.verbosity, 10);
    if (Number.isNaN(payload.ansible.verbosity) || payload.ansible.verbosity < 0) {
      payload.ansible.verbosity = 0;
    }
    if (payload.ansible.verbosity > 6) {
      payload.ansible.verbosity = 6;
    }
    delete payload.verbosity;

    if (payload.aap?.standalone_run === true) {
      if (!payload.git) payload.git = {};
      payload.git.vars_only = false;
      payload.git.auto_push = false;
    }

    return payload;
  };

  const ensureComponentConfig = component => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));

      if (!copy.component_config) copy.component_config = {};
      copy.component_config[component] = deepMerge(
        defaultComponentConfig(component),
        copy.component_config[component] || {}
      );
      if (copy.component_config[component].hostname === undefined) copy.component_config[component].hostname = '';
      if (!['rhel', 'satellite', 'idm', 'compliance', 'stig', 'aws', 'openshift_virt'].includes(component) && copy.component_config[component].storage === undefined) {
        copy.component_config[component].storage = '';
      }
      if (component === 'idm') {
        delete copy.component_config[component].storage;
      }

      return copy;
    });
  };

  const openConfigPanel = component => {
    ensureComponentConfig(component);
    setActiveConfigPanel(component);
    setActiveConfigTab(component);
    setConfigTab('form');
    setYamlError('');

    const componentData =
      component === 'openshift'
        ? data.openshift
        : component === 'jira'
          ? data.jira
          : data.component_config?.[component] || { hostname: '', storage: '' };

    setYamlDraft(JSON.stringify(componentData, null, 2));
  };

  const setAapEnabled = value => {
    set('aap.enabled', value);
    setAapOpen(value);
  };

  const buildLocalBootstrapAnsiblePreview = () => {
    const envName = data.environment || 'prod';
    const preflightFile = `ado-preflight-${envName}.json`;
    const verbosity = Number(data?.ansible?.verbosity ?? 0);
    const vFlag = verbosity > 0 ? `-${'v'.repeat(Math.min(verbosity, 6))} ` : '';
    const skipTls = data?.aap?.skip_tls_verify === true ? 'true' : 'false';
    const encryptVault = data?.vault?.encrypt !== false ? 'true' : 'false';
    const hubOnly = aapStandaloneRun(data);
    const generatePlaybooks = hubOnly ? 'false' : 'true';
    const gitSkipTls = data?.git?.skip_tls_verify !== false ? 'false' : 'true';
    const extraArgs = String(data?.ansible?.extra_args || '').trim();

    const lines = [
      '# Pod runs this via Run Bootstrap — does not configure Ansible Automation Platform',
      'cd bootstrap-sample',
      `ansible-playbook -c local -i inventory ${vFlag}\\`,
      `  run-ado-scaffolding.yml \\`,
      `  -e preflight_json=${preflightFile} \\`,
      `  -e env=${envName} \\`,
      '  -e generate_env_vars_use_aap=false \\',
      '  -e generate_aap_configs=false \\',
      '  -e apply_aap_configs=false \\',
      '  -e bootstrap_apply_aap_configs=false \\',
      '  -e bootstrap_controller_apply_aap_configs=false \\',
      `  -e generate_playbooks=${generatePlaybooks} \\`,
      `  -e skip_tls_verify=${skipTls} \\`,
      `  -e generate_playbook_repo_git_ssl_verify=${gitSkipTls} \\`,
      `  -e bootstrap_generate_playbook_repo_git_ssl_verify=${gitSkipTls} \\`,
      `  -e generate_env_vars_encrypt_vault_files=${encryptVault} \\`,
      `  -e bootstrap_generate_env_vars_encrypt_vault_files=${encryptVault} \\`,
      '  -e bootstrap_generate_env_vars_vault_password_file=.vault_pass \\'
    ];

    if (extraArgs) {
      lines.push(`  ${extraArgs} \\`);
    }

    lines.push('  --vault-password-file .vault_pass');
    return lines.join('\n');
  };

  const renderAnsibleExtraArgsCollapsible = () => {
    const summary = String(data?.ansible?.extra_args || '').trim();
    return (
      <div style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setAnsibleExtraArgsOpen(open => !open)}
            aria-expanded={ansibleExtraArgsOpen}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
              color: textColor,
              textAlign: 'left'
            }}
          >
            {ansibleExtraArgsOpen ? '−' : '+'} Additional ansible-playbook options
          </button>
          {labelWithHelp('', (
            <>
              <p>Appended after the built-in <code>-e</code> flags when the pod runs bootstrap.</p>
              <p>Examples: <code>-e generate_playbooks=false</code>, <code>--tags bootstrap</code>, <code>-e some_custom_var=value</code></p>
            </>
          ))}
          {!ansibleExtraArgsOpen && summary && (
            <span style={{ color: mutedTextColor, fontWeight: 400, fontFamily: 'monospace', fontSize: '12px' }}>
              {summary.length > 56 ? `${summary.slice(0, 56)}…` : summary}
            </span>
          )}
        </div>
        {ansibleExtraArgsOpen && (
          <textarea
            value={data.ansible?.extra_args || ''}
            onChange={e => set('ansible.extra_args', e.target.value)}
            placeholder="-e my_var=value --tags bootstrap"
            spellCheck="false"
            rows={2}
            style={{
              width: '100%',
              marginTop: '6px',
              background: fieldBg,
              color: fieldColor,
              fontFamily: 'monospace',
              fontSize: `${Math.max(consoleFontSize - 1, 12)}px`,
              lineHeight: '1.4',
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              padding: '8px'
            }}
          />
        )}
      </div>
    );
  };

  const isStandaloneDisabled = () => false;

  const toggleComponent = component => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const current = copy.components || [];
      const wasSelected = current.includes(component);

      let next = [];

      if (component === 'all') {
        next = wasSelected ? [] : ['all'];
      } else if (groupComponents.includes(component)) {
        next = wasSelected ? [] : [component];
      } else {
        next = wasSelected
          ? current.filter(c => c !== component)
          : [...current.filter(c => c !== 'all' && !groupComponents.includes(c)), component];
      }

      copy.components = next;
      copy.component = next.length === 0 ? '' : next[0];

      if (!copy.component_options) copy.component_options = {};

      if (!wasSelected) {
        if (component === 'all') {
          copy.component_options = Object.fromEntries(
            Object.keys(componentOptionDefaults).map(key => [key, []])
          );
        } else if (componentOptionDefaults[component]) {
          copy.component_options[component] = [];
        }
      }

      if (!copy.component_apps) copy.component_apps = {};
      if (component === 'provision') {
        if (!wasSelected) {
          // Default to OpenShift Virt so bootstrap creates the provision JT.
          const currentApps = copy.component_apps.provision || [];
          copy.component_apps.provision = currentApps.includes('openshift_virt')
            ? currentApps
            : [...currentApps, 'openshift_virt'];
        } else {
          copy.component_apps.provision = [];
        }
      }

      if (component === 'aws') {
        if (!wasSelected) {
          const currentApps = copy.component_apps.aws || [];
          copy.component_apps.aws = currentApps.includes('ec2_ami_copy')
            ? currentApps
            : [...currentApps, 'ec2_ami_copy'];
          if (!copy.component_options) copy.component_options = {};
          copy.component_options.aws = [...copy.component_apps.aws];
        } else {
          copy.component_apps.aws = [];
          if (copy.component_options) copy.component_options.aws = [];
        }
      }

      if (!copy.jira) copy.jira = {};
      copy.jira.enabled = next.includes('all') || next.includes('jira');

      clearStandaloneWhenComponentsSelected(copy);

      return copy;
    });
  };

  const toggleComponentAndOpen = component => {
    toggleComponent(component);
    openConfigPanel(component);
  };

  const appSelectedInAnyGroup = (componentApps, app, exceptGroup = null) => {
    return Object.entries(componentApps || {}).some(([group, apps]) => {
      if (group === exceptGroup) return false;
      return Array.isArray(apps) && apps.includes(app);
    });
  };

  const toggleComponentApp = (group, app) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const current = copy.component_apps?.[group] || [];
      const isSelected = current.includes(app);

      if (!copy.component_apps) copy.component_apps = {};
      copy.component_apps[group] = isSelected
        ? current.filter(item => item !== app)
        : [...current, app];

      let nextComponents = [...(copy.components || [])].filter(c => c !== 'all');

      // Keep standalone component checkboxes in sync for configurable apps.
      // Do not add high-level groups like openshift/rhel/patching/provision here.
      if (simpleComponents.includes(app)) {
        const selectedAnywhere = appSelectedInAnyGroup(copy.component_apps, app, null);

        if (selectedAnywhere || !isSelected) {
          if (!nextComponents.includes(app)) {
            nextComponents.push(app);
          }
        } else {
          nextComponents = nextComponents.filter(c => c !== app);
        }
      }

      if (nextComponents.length === 0) nextComponents = ['all'];

      copy.components = nextComponents;
      copy.component = nextComponents.includes('all') ? 'all' : nextComponents[0];

      if (group === 'aws') {
        if (!copy.component_options) copy.component_options = {};
        copy.component_options.aws = [...copy.component_apps[group]];
      }

      if (!isSelected && componentOptionDefaults[app]) {
        if (!copy.component_options) copy.component_options = {};
        copy.component_options[app] = [];
      }

      clearStandaloneWhenComponentsSelected(copy);

      if (!isSelected && app === 'dev_hub') {
        syncDevHubGitlabTokenFromGit(copy);
      }

      return copy;
    });
  };

  const toggleComponentAppAndOpen = (group, app) => {
    toggleComponentApp(group, app);
    openConfigPanel(app);
  };

  const downloadFile = (name, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
  };

  const agentInstallerConfig = () => data.openshift?.agent_installer || agentInstallerDefaults;

  const setAgentInstaller = (path, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.agent_installer) {
        copy.openshift.agent_installer = JSON.parse(JSON.stringify(agentInstallerDefaults));
      }

      const keys = path.split('.');
      let obj = copy.openshift.agent_installer;

      keys.slice(0, -1).forEach(k => {
        if (!obj[k]) obj[k] = {};
        obj = obj[k];
      });

      obj[keys[keys.length - 1]] = value;
      return copy;
    });
  };

  const setAgentNode = (index, field, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.agent_installer) {
        copy.openshift.agent_installer = JSON.parse(JSON.stringify(agentInstallerDefaults));
      }
      if (!Array.isArray(copy.openshift.agent_installer.nodes)) {
        copy.openshift.agent_installer.nodes = [];
      }
      if (!copy.openshift.agent_installer.nodes[index]) {
        copy.openshift.agent_installer.nodes[index] = defaultAgentInstallerNode(index);
      }
      copy.openshift.agent_installer.nodes[index][field] = value;
      return copy;
    });
  };

  const addAgentNode = () => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.agent_installer) {
        copy.openshift.agent_installer = JSON.parse(JSON.stringify(agentInstallerDefaults));
      }
      if (!Array.isArray(copy.openshift.agent_installer.nodes)) {
        copy.openshift.agent_installer.nodes = [];
      }
      copy.openshift.agent_installer.nodes.push(defaultAgentInstallerNode(copy.openshift.agent_installer.nodes.length));
      return copy;
    });
  };

  const removeAgentNode = index => {
    setAgentNodeEditorIndex(current => (current === index ? null : current !== null && current > index ? current - 1 : current));
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (Array.isArray(copy.openshift?.agent_installer?.nodes)) {
        copy.openshift.agent_installer.nodes.splice(index, 1);
      }
      return copy;
    });
  };

  const persistAgentProfiles = profiles => {
    setAgentInstallerProfiles(profiles);
    localStorage.setItem('adoAgentInstallerProfiles', JSON.stringify(profiles));
  };

  const applyAgentProfileConfig = (config, { saveLocal = false } = {}) => {
    const nextConfig = {
      ...JSON.parse(JSON.stringify(agentInstallerDefaults)),
      ...JSON.parse(JSON.stringify(config || {})),
      nodes: Array.isArray(config?.nodes)
        ? config.nodes.map((node, index) => ({
            ...defaultAgentInstallerNode(index),
            ...node
          }))
        : agentInstallerDefaults.nodes
    };
    const name = String(nextConfig.profile_name || nextConfig.cluster_name || 'imported').trim() || 'imported';
    nextConfig.profile_name = name;

    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      copy.openshift.agent_installer = nextConfig;
      return copy;
    });
    setAgentInstallerResult(null);

    if (saveLocal) {
      const profile = { name, config: nextConfig };
      const profiles = [
        ...agentInstallerProfiles.filter(existing => existing.name !== name),
        profile
      ].sort((a, b) => a.name.localeCompare(b.name));
      persistAgentProfiles(profiles);
    }
  };

  const buildAgentProfileExport = (config, { sanitized = false } = {}) => {
    const name = String(config.profile_name || config.cluster_name || 'default').trim() || 'default';
    return {
      kind: 'ado-agent-installer-profile',
      version: 1,
      sanitized: sanitized === true,
      name,
      exported_at: new Date().toISOString(),
      config: { ...config, profile_name: name }
    };
  };

  const downloadAgentProfile = () => {
    const config = agentInstallerConfig();
    const profile = buildAgentProfileExport(config);
    downloadFile(
      `${profile.name}-agent-installer-profile.json`,
      JSON.stringify(profile, null, 2)
    );
  };

  const downloadSanitizedAgentProfile = async () => {
    setAgentInstallerBusy(true);
    try {
      const response = await fetch('/api/openshift-agent/sanitize-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentInstallerConfig())
      });
      const body = await response.json();
      if (!response.ok || !body.valid) {
        throw new Error((body.errors || []).join(' ') || `Request failed with status ${response.status}`);
      }
      const profile = body.profile;
      downloadFile(
        `${profile.name}-agent-installer-profile.json`,
        JSON.stringify(profile, null, 2)
      );
      setAgentInstallerResult({
        valid: true,
        errors: [],
        warnings: body.warnings || []
      });
    } catch (err) {
      setAgentInstallerResult({ valid: false, errors: [err.message], warnings: [] });
    } finally {
      setAgentInstallerBusy(false);
    }
  };

  const uploadAgentProfile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const config = parsed?.config && typeof parsed.config === 'object'
        ? parsed.config
        : parsed;
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('Profile JSON must contain an agent installer config object.');
      }
      if (!Array.isArray(config.nodes)) {
        throw new Error('Profile JSON must include a nodes array.');
      }

      const profileName = String(
        parsed?.name || config.profile_name || config.cluster_name || file.name.replace(/\.json$/i, '')
      ).trim() || 'imported';
      applyAgentProfileConfig(
        { ...config, profile_name: profileName },
        { saveLocal: true }
      );
      setAgentInstallerResult({
        valid: true,
        errors: [],
        warnings: [
          parsed?.sanitized
            ? `Loaded sanitized profile "${profileName}" into the form and browser profile list.`
            : `Loaded profile "${profileName}" into the form and browser profile list.`
        ]
      });
    } catch (err) {
      setAgentInstallerResult({
        valid: false,
        errors: [`Failed to upload profile: ${err.message}`],
        warnings: []
      });
    }
  };

  const saveAgentProfile = () => {
    const config = agentInstallerConfig();
    const name = String(config.profile_name || config.cluster_name || 'default').trim() || 'default';
    const profile = { name, config: { ...config, profile_name: name } };
    const profiles = [
      ...agentInstallerProfiles.filter(existing => existing.name !== name),
      profile
    ].sort((a, b) => a.name.localeCompare(b.name));
    persistAgentProfiles(profiles);
  };

  const loadAgentProfile = name => {
    const profile = agentInstallerProfiles.find(item => item.name === name);
    if (!profile) return;
    applyAgentProfileConfig(profile.config);
  };

  const cloneAgentProfile = () => {
    const config = agentInstallerConfig();
    const name = `${config.profile_name || config.cluster_name || 'profile'}-copy`;
    setAgentInstaller('profile_name', name);
  };

  const deleteAgentProfile = () => {
    const name = agentInstallerConfig().profile_name;
    if (!name) return;
    persistAgentProfiles(agentInstallerProfiles.filter(profile => profile.name !== name));
  };

  const callAgentInstallerApi = async (endpoint, expectBlob = false, downloadName = null) => {
    setAgentInstallerBusy(true);
    try {
      const response = await fetch(`/api/openshift-agent/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentInstallerConfig())
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed with status ${response.status}`);
      }

      if (expectBlob) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName
          || `${agentInstallerConfig().cluster_name || 'openshift-agent'}-agent-configs.zip`;
        a.click();
        URL.revokeObjectURL(url);
        return null;
      }

      const result = await response.json();
      setAgentInstallerResult(result);
      return result;
    } catch (err) {
      setAgentInstallerResult({ valid: false, errors: [err.message], warnings: [] });
      return null;
    } finally {
      setAgentInstallerBusy(false);
    }
  };

  const validateAgentInstaller = () => callAgentInstallerApi('validate');

  const generateAgentInstaller = () => callAgentInstallerApi('generate');

  const downloadAgentInstallerZip = () => callAgentInstallerApi('download', true);

  const downloadSanitizedAgentInstallerZip = () => callAgentInstallerApi(
    'download-sanitized',
    true,
    `${agentInstallerConfig().cluster_name || 'openshift-agent'}-agent-configs-sanitized.zip`
  );

  const mapToAirgapArchitect = async ({ download = false } = {}) => {
    setAgentInstallerBusy(true);
    try {
      const response = await fetch('/api/airgap-architect/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentInstallerConfig())
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (result && (result.errors || []).join('; '))
          || `Airgap Architect map failed (${response.status})`
        );
      }
      setAgentInstallerResult({
        valid: result.valid !== false,
        errors: result.errors || [],
        warnings: [
          ...(result.warnings || []),
          result.mode === 'remote'
            ? `Airgap companion filled installer pieces via ${result.architectUrl}`
            : 'Local installer pieces (set AIRGAP_ARCHITECT_URL for companion enrich).'
        ],
        installConfig: result.installConfig,
        agentConfig: result.agentConfig,
        imagesetConfigYaml: result.imagesetConfigYaml || '',
        fieldManual: result.fieldManual || '',
        installerPieces: result.installerPieces || null,
        airgapArchitect: result
      });
      if (download) {
        const handoff = {
          kind: 'ado-airgap-installer-pieces',
          version: 1,
          exported_at: new Date().toISOString(),
          mode: result.mode,
          role: result.role,
          architectState: result.architectState,
          installConfig: result.installConfig,
          agentConfig: result.agentConfig,
          imagesetConfigYaml: result.imagesetConfigYaml,
          fieldManual: result.fieldManual,
          installerPieces: result.installerPieces,
          imagesetHint: result.imagesetHint,
          remoteDiffSummary: result.remoteDiffSummary,
          remote: result.remote
        };
        downloadFile(
          `${agentInstallerConfig().cluster_name || 'openshift'}-airgap-installer-pieces.json`,
          JSON.stringify(handoff, null, 2)
        );
      }
      return result;
    } catch (err) {
      setAgentInstallerResult({ valid: false, errors: [err.message], warnings: [] });
      return null;
    } finally {
      setAgentInstallerBusy(false);
    }
  };

  const downloadJson = () => {
    const payload = buildPreflightPayload();
    downloadFile(preflightDownloadBasename(payload), JSON.stringify(payload, null, 2));
    setActionsOpen(false);
  };

  const downloadScrubbedJson = () => {
    const payload = scrubPreflightPayload(buildPreflightPayload());
    downloadFile(
      preflightDownloadBasename(payload, { scrubbed: true }),
      JSON.stringify(payload, null, 2)
    );
    setActionsOpen(false);
  };

  const downloadLog = () => {
    const isDebug = activeTab === 'events' && debugTab !== 'events';
    const content = activeTab === 'events'
      ? (isDebug ? debugContent : events)
      : preview;
    const suffix = activeTab === 'events'
      ? (isDebug ? debugEndpoint(debugTab) : 'events')
      : 'run';

    downloadFile(`ado-preflight-${data.environment || 'env'}-${suffix}.log`, content);
  };

  const resetOutput = () => {
    setData(defaults);
    setPreview('Click "Run Bootstrap" to generate output.');
    setEvents('');
    setDebugTab('events');
    setDebugContent('Select a debug tab to load details.');
    setDebugLoading(false);
    setRunFinished(false);
    setShowRawOutput(false);
    setActiveTab('logs');
    setActionsOpen(false);
    setActiveConfigPanel('all');
    setActiveConfigTab('all');
    setConfigTab('form');
    setYamlDraft('');
    setYamlError('');
    setShowVaultYaml(false);
    setImportStatus('');
    setAgentInstallerResult(null);
  };

  const previewJson = () => {
    setPreview(JSON.stringify(buildPreflightPayload(), null, 2));
    setActiveTab('logs');
    setActionsOpen(false);
  };

  const openDebugTab = key => {
    setDebugTab(key);
    if (key !== 'events' && key !== 'terminal') {
      fetchDebugTab(key);
    }
  };

  const toggleRawOutput = () => {
    setShowRawOutput(!showRawOutput);
    setActiveTab('logs');
  };

  const zoomConsoleText = delta => {
    setConsoleFontSize(size => Math.min(22, Math.max(10, size + delta)));
  };

  const resetConsoleTextZoom = () => {
    setConsoleFontSize(13);
  };

  const applyYamlDraft = () => {
    try {
      const parsed = JSON.parse(yamlDraft);

      if (!activeConfigPanel) return;

      if (activeConfigPanel === 'openshift') {
        setData(prev => ({ ...prev, openshift: parsed }));
      } else if (activeConfigPanel === 'jira') {
        setData(prev => ({ ...prev, jira: parsed }));
      } else {
        setData(prev => ({
          ...prev,
          component_config: {
            ...prev.component_config,
            [activeConfigPanel]: parsed
          }
        }));
      }

      setYamlError('');
    } catch (err) {
      setYamlError(`Invalid YAML/JSON: ${err.message}`);
    }
  };

  const refreshYamlDraft = () => {
    if (!activeConfigPanel) return;

    const componentData =
      activeConfigPanel === 'openshift'
        ? data.openshift
        : activeConfigPanel === 'jira'
          ? data.jira
          : data.component_config?.[activeConfigPanel] || { hostname: '', storage: '' };

    setYamlDraft(JSON.stringify(componentData, null, 2));
    setYamlError('');
  };

  const runBootstrapInsideContainer = async () => {
    setRunFinished(false);
    setBootstrapStatus('running');
    setBootstrapRuntime('');
    setShowRawOutput(false);
    setActiveTab('logs');
    setPreview('Starting bootstrap inside container...\n');
    setEvents('Starting bootstrap request...\n');

    let keepPolling = true;
    let poller = null;

    const finishRun = (previewText, eventsText, status = 'idle', runtime = '') => {
      if (previewText !== undefined) setPreview(previewText);
      if (eventsText !== undefined) setEvents(eventsText);
      keepPolling = false;
      if (poller) clearInterval(poller);
      setBootstrapStatus(status);
      setBootstrapRuntime(runtime || '');
      setRunFinished(true);
    };

    const fetchBootstrapResult = async () => {
      const response = await fetch('/api/bootstrap/result');
      if (response.status === 202) return null;
      if (!response.ok) return null;
      return response.json().catch(() => null);
    };

    const showCompletedOutput = async (logText, result) => {
      const text = logText ?? await fetch('/api/logs').then(r => r.text()).catch(() => '');
      const eventsText = await fetch('/api/events').then(r => r.text()).catch(() => '');
      const exitCode = resolveBootstrapExitCode(result, eventsText);
      const runtime = extractBootstrapRuntime(result, text);
      const status = exitCode === 0 || exitCode === '0'
        ? 'complete'
        : (result?.status === 'failed' || (exitCode !== undefined && exitCode !== 0) ? 'failed' : 'complete');

      if (String(text).includes('=== ADO Bootstrap Recap ===')) {
        finishRun(text, eventsText || 'No events were returned.', status, runtime);
        return;
      }
      if (result?.bootstrapRecap) {
        const recap = `\n${result.bootstrapRecap}`;
        finishRun(
          `${text}\n\nRESULT:\n${JSON.stringify(result, null, 2)}${recap}`,
          eventsText || 'No events were returned.',
          status,
          runtime
        );
        return;
      }
      finishRun(text, eventsText || 'No events were returned.', status, runtime);
    };

    poller = setInterval(async () => {
      if (!keepPolling) return;

      try {
        const logs = await fetch('/api/logs');
        const text = await logs.text();
        setPreview(text || 'Running...');

        const eventsResp = await fetch('/api/events');
        const eventsText = await eventsResp.text();
        setEvents(eventsText || 'No events yet.');

        if (
          String(text).includes('=== ADO Bootstrap Recap ===')
          || String(eventsText).includes('Bootstrap finished exitCode=')
        ) {
          const result = await fetchBootstrapResult();
          await showCompletedOutput(text, result);
        }
      } catch (err) {
        setPreview(`ERROR reading logs:\n${err.message}`);
      }
    }, 1000);

    try {
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPreflightPayload())
      });

      if (response.status === 409) {
        setPreview('Bootstrap already running on server — showing live logs...\n');
        return;
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        finishRun(
          `ERROR:\n${errBody.error || response.statusText}`,
          await fetch('/api/events').then(r => r.text()).catch(() => ''),
          'failed'
        );
        return;
      }

      if (response.status === 202) {
        setPreview('Bootstrap started — streaming logs from server...\n');
        return;
      }

      const result = await response.json().catch(() => null);
      const text = await fetch('/api/logs').then(r => r.text()).catch(() => '');
      await showCompletedOutput(text, result);
    } catch (err) {
      setPreview(
        `NOTE: could not confirm bootstrap start (${err.message}). Polling server logs...\n`
      );
    }
  };

  const runDeployToOpenShift = async () => {
    setActionsOpen(false);
    setRunFinished(false);
    setDeployStatus('running');
    setDeployRuntime('');
    setShowRawOutput(false);
    setActiveTab('logs');
    setPreview('Starting OpenShift deploy...\n');
    setEvents('OpenShift deploy request started...\n');

    let keepPolling = true;
    let poller = null;

    const finishDeploy = (previewText, eventsText, status = 'idle', runtime = '') => {
      if (previewText !== undefined) setPreview(previewText);
      if (eventsText !== undefined) setEvents(eventsText);
      keepPolling = false;
      if (poller) clearInterval(poller);
      setDeployStatus(status);
      setDeployRuntime(runtime || '');
      setRunFinished(true);
    };

    const formatDeployRuntime = ms => {
      if (!ms && ms !== 0) return '';
      const sec = Math.round(Number(ms) / 1000);
      if (sec < 60) return `${sec}s`;
      return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    };

    poller = setInterval(async () => {
      if (!keepPolling) return;
      try {
        const logs = await fetch('/api/deploy/openshift/logs');
        const text = await logs.text();
        setPreview(text || 'Deploy running...');
        const eventsResp = await fetch('/api/deploy/openshift/events');
        const eventsText = await eventsResp.text();
        setEvents(eventsText || 'No deploy events yet.');

        const resultResp = await fetch('/api/deploy/openshift/result');
        if (resultResp.status === 202) return;
        if (!resultResp.ok) return;
        const result = await resultResp.json().catch(() => null);
        if (!result || result.status === 'running') return;
        const runtime = formatDeployRuntime(result.runtimeMs);
        finishDeploy(
          text,
          eventsText,
          result.status === 'complete' ? 'complete' : 'failed',
          runtime
        );
      } catch (err) {
        setPreview(`ERROR reading deploy logs:\n${err.message}`);
      }
    }, 1500);

    try {
      const response = await fetch('/api/deploy/openshift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPreflightPayload())
      });

      if (response.status === 409) {
        setPreview('OpenShift deploy already running — showing live logs...\n');
        return;
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        finishDeploy(
          `ERROR:\n${errBody.error || response.statusText}`,
          await fetch('/api/deploy/openshift/events').then(r => r.text()).catch(() => ''),
          'failed'
        );
        return;
      }

      if (response.status === 202) {
        setPreview('OpenShift deploy started — streaming logs...\n');
      }
    } catch (err) {
      setPreview(`NOTE: could not confirm deploy start (${err.message}). Polling logs...\n`);
    }
  };

  const matchesConsoleSearch = line => {
    const q = String(consoleSearch || '').trim().toLowerCase();
    if (!q) return true;
    return String(line || '').toLowerCase().includes(q);
  };

  const lineHasHardFailure = line => {
    const text = String(line || '');
    const failedMatch = text.match(/failed=(\d+)/);
    const unreachableMatch = text.match(/unreachable=(\d+)/);
    const failedCount = failedMatch ? Number(failedMatch[1]) : 0;
    const unreachableCount = unreachableMatch ? Number(unreachableMatch[1]) : 0;
    return (
      failedCount > 0 ||
      unreachableCount > 0 ||
      /FAILED!|fatal:|ERROR!|Traceback \(most recent call last\)/i.test(text) ||
      /exit[_\s-]?code[=:\s]+[1-9]\d*/i.test(text) ||
      /"ok"\s*:\s*false/i.test(text) ||
      /\bstatus["']?\s*[:=]\s*["']?(failed|error|failure)/i.test(text)
    );
  };

  const renderOutput = () => {
    if (showRawOutput) {
      const raw = String(preview || '');
      if (!String(consoleSearch || '').trim()) return raw;
      return raw.split('\n').filter(matchesConsoleSearch).join('\n');
    }

    const allLines = String(preview || '').split('\n');
    const runHasFailures = allLines.some(lineHasHardFailure);
    const lines = allLines.filter(matchesConsoleSearch);

    const rendered = lines.map((line, idx) => {
      let color = '#f0f0f0';
      let fontWeight = 400;

      const failedMatch = line.match(/failed=(\d+)/);
      const unreachableMatch = line.match(/unreachable=(\d+)/);
      const rescuedMatch = line.match(/rescued=(\d+)/);

      const failedCount = failedMatch ? Number(failedMatch[1]) : 0;
      const unreachableCount = unreachableMatch ? Number(unreachableMatch[1]) : 0;
      const rescuedCount = rescuedMatch ? Number(rescuedMatch[1]) : 0;

      const isRecapHeader = /^\s*PLAY RECAP/i.test(line);
      const isRecapLine = /^\S+\s*:\s*ok=\d+/.test(line.trim());
      const hasHardFailure = lineHasHardFailure(line);

      if (isRecapHeader) {
        if (runHasFailures) {
          color = '#ff6b6b';
          fontWeight = 800;
        } else {
          color = '#2b9af3';
          fontWeight = 700;
        }
      } else if (isRecapLine) {
        if (failedCount > 0 || unreachableCount > 0) {
          color = '#ff6b6b';
          fontWeight = 800;
        } else if (rescuedCount > 0) {
          color = '#ec7a08';
          fontWeight = 700;
        } else if (runHasFailures) {
          // Keep successful hosts visible, but bias attention toward failure context.
          color = '#f0f0f0';
          fontWeight = 600;
        } else {
          color = '#f0f0f0';
          fontWeight = 600;
        }
      } else if (hasHardFailure) {
        color = '#ff6b6b';
        fontWeight = 700;
      } else if (/WARNING:|\[WARNING\]/i.test(line)) {
        color = '#f0ab00';
        fontWeight = 700;
      } else if (/^ok:|\bok: \[/.test(line)) {
        color = '#8bc34a';
        fontWeight = 600;
      } else if (/^changed:|\bchanged: \[/.test(line)) {
        color = '#73bcf7';
        fontWeight = 600;
      } else if (/^skipping:|\bskipping: \[/.test(line)) {
        color = '#b8bbbe';
      } else if (/PLAY \[/.test(line)) {
        color = '#2b9af3';
        fontWeight = 700;
      } else if (/^TASK \[/.test(line)) {
        color = '#b2b0ea';
        fontWeight = 700;
      }

      return (
        <div key={idx} style={{ color, fontWeight }}>
          {line || ' '}
        </div>
      );
    });

    if (runHasFailures && !String(consoleSearch || '').trim()) {
      rendered.push(
        <div key="failure-banner" style={{ color: '#ff6b6b', fontWeight: 800, marginTop: '12px' }}>
          {'>>> FAILURES DETECTED — scroll up to review errors / PLAY RECAP <<<'}
        </div>
      );
    }

    return rendered;
  };

  const renderEvents = () => {
    return (events || 'No events yet.').split('\n').filter(matchesConsoleSearch).map((line, idx) => {
      const isError = /failed|error|exitCode=[1-9]|exit code [1-9]/i.test(line);
      const isSuccess = /complete|finished exitCode=0|exit code 0/i.test(line);

      let color = '#f0f0f0';
      let fontWeight = 400;

      if (isError) {
        color = '#ff6b6b';
        fontWeight = 700;
      } else if (isSuccess) {
        color = '#8bc34a';
        fontWeight = 700;
      }

      return (
        <div key={idx} style={{ color, fontWeight }}>
          {line || ' '}
        </div>
      );
    });
  };

  const renderDebugOutput = () => {
    const content = debugLoading ? `Loading ${debugTabLabel(debugTab)}...` : debugContent;

    return (content || `No ${debugTabLabel(debugTab)} data yet.`).split('\n').filter(matchesConsoleSearch).map((line, idx) => {
      let color = '#f0f0f0';
      let fontWeight = 400;

      if (/failed|error|fatal|unreachable/i.test(line)) {
        color = '#ff6b6b';
        fontWeight = 700;
      } else if (/complete|success|exitCode=0|exit code 0/i.test(line)) {
        color = '#8bc34a';
        fontWeight = 600;
      } else if (/^=====|^Repository:|^Useful|^OpenShift|^Podman|^Embedded shell/i.test(line)) {
        color = '#73bcf7';
        fontWeight = 700;
      }

      return (
        <div key={idx} style={{ color, fontWeight }}>
          {line || ' '}
        </div>
      );
    });
  };

  const renderConsoleContent = () => {
    if (activeTab === 'logs') return renderOutput();
    if (debugTab === 'events') return renderEvents();
    return renderDebugOutput();
  };

  const renderComponentLabel = (component, label = component) => (
    <button
      type="button"
      onClick={() => openConfigPanel(component)}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        color: isDark ? '#73bcf7' : '#0066cc',
        cursor: 'pointer',
        textDecoration: activeConfigPanel === component ? 'underline' : 'none',
        fontWeight: activeConfigPanel === component ? 700 : 400
      }}
    >
      {label}
    </button>
  );

  const renderExpandableComponent = (label, isOpen, setOpen, apps) => {
    return (
      <div style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Checkbox
            label=""
            isChecked={data.components.includes(label)}
            onChange={() => toggleComponentAndOpen(label)}
          />

          {renderComponentLabel(label)}
        </div>
      </div>
    );
  };

  const labelWithHelp = (label, help) => {
    if (!help) return label;

    const labelText = typeof label === 'string'
      ? label
      : (typeof label?.props?.children === 'string' ? label.props.children : 'Field');

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span>{label}</span>
        <Popover
          headerContent={labelText}
          bodyContent={<div style={{ maxWidth: '320px' }}>{help}</div>}
          triggerAction="click"
          appendTo={() => document.body}
        >
          <button
            type="button"
            aria-label={`${labelText} help`}
            style={{
              border: 'none',
              background: 'transparent',
              color: isDark ? '#73bcf7' : '#0066cc',
              cursor: 'pointer',
              fontWeight: 700,
              padding: '0 2px',
              lineHeight: 1
            }}
          >
            ?
          </button>
        </Popover>
      </span>
    );
  };

  const renderTextField = (label, path, type = 'text', help = '') => (
    <GridItem span={6}>
      <FormGroup label={labelWithHelp(label, help)}>
        <TextInput
          type={type}
          value={path.split('.').reduce((o, k) => (o || {})[k], data) || ''}
          onChange={(_, v) => set(path, v)}
        />
      </FormGroup>
    </GridItem>
  );

  const openshiftLookupReady = Boolean(
    String(data.openshift?.api_host || '').trim()
    && String(data.openshift?.token || '').trim()
  );

  const lookupStorageClasses = async (path = '') => {
    const apiHost = String(data.openshift?.api_host || '').trim();
    const token = String(data.openshift?.token || '').trim();
    if (!apiHost || !token) {
      setStorageClassLookup(prev => ({
        ...prev,
        error: 'Enter OpenShift API host and token first (Core Environment → OpenShift, or Install AAP).'
      }));
      return;
    }
    setStorageClassLookup(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await fetch('/api/openshift/storageclasses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_host: apiHost,
          token,
          skip_tls_verify: data.openshift?.skip_tls_verify !== false
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      const classes = Array.isArray(body.storageClasses) ? body.storageClasses : [];
      setStorageClassLookup({ loading: false, error: '', classes });
      if (path) {
        const current = path.split('.').reduce((o, k) => (o || {})[k], data) || '';
        if (!current) {
          const defaultClass = classes.find(item => item.default) || classes[0];
          if (defaultClass?.name) set(path, defaultClass.name);
        }
      }
    } catch (err) {
      setStorageClassLookup({
        loading: false,
        error: err.message || 'Failed to list storage classes',
        classes: null
      });
    }
  };

  const renderStorageClassField = (label, path, help = '') => {
    const current = path.split('.').reduce((o, k) => (o || {})[k], data) || '';
    const classes = storageClassLookup.classes || [];
    const selectValue = classes.some(item => item.name === current) ? current : '';
    return (
      <GridItem span={6}>
        <FormGroup label={labelWithHelp(label, help)}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <TextInput
              value={current}
              onChange={(_, v) => set(path, v)}
              placeholder="ocs-storagecluster-ceph-rbd"
            />
            <Button
              variant="secondary"
              isDisabled={storageClassLookup.loading}
              onClick={() => lookupStorageClasses(path)}
            >
              {storageClassLookup.loading ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
          {classes.length > 0 && (
            <select
              value={selectValue}
              onChange={e => set(path, e.target.value)}
              style={{ width: '100%', height: '36px', marginTop: '8px', padding: '8px' }}
            >
              <option value="">Select a storage class</option>
              {classes.map(item => (
                <option key={item.name} value={item.name}>
                  {item.name}{item.default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
          {!openshiftLookupReady && (
            <div style={{ color: mutedTextColor, fontSize: '12px', marginTop: '6px' }}>
              Enter OpenShift API host and token to list storage classes from the cluster.
            </div>
          )}
          {storageClassLookup.error && (
            <div style={{ color: '#c9190b', fontSize: '12px', marginTop: '6px' }}>
              {storageClassLookup.error}
            </div>
          )}
        </FormGroup>
      </GridItem>
    );
  };

  const renderTextAreaField = (label, path, help = '', rows = 5) => (
    <GridItem span={12}>
      <FormGroup label={labelWithHelp(label, help)}>
        <textarea
          value={path.split('.').reduce((o, k) => (o || {})[k], data) || ''}
          onChange={e => set(path, e.target.value)}
          rows={rows}
          style={{ width: '100%', padding: '8px' }}
        />
      </FormGroup>
    </GridItem>
  );

  const renderStandaloneTlsAndRhn = (
    component,
    { urlPath = 'standalone_rpm_url', showTls = true } = {}
  ) => {
    const cfg = data.component_config?.[component] || {};
    const urlSet = String(cfg[urlPath] || '').trim().length > 0;
    return (
      <>
        {showTls && renderTextAreaField(
          'tls.crt (PEM, optional)',
          `component_config.${component}.standalone_tls_crt`,
          'PEM certificate for standalone HTTPS. GitLab writes /etc/gitlab/ssl/<host>.crt; RHBK writes /etc/rhbk/tls/tls.crt.'
        )}
        {showTls && renderTextAreaField(
          'tls.key (PEM, optional)',
          `component_config.${component}.standalone_tls_key`,
          'PEM private key paired with tls.crt.'
        )}
        <GridItem span={12}>
          <p style={{ color: mutedTextColor, margin: '8px 0 0' }}>
            Optional RHN org + activation key. Used when the VM is unregistered and an RPM/zip
            URL (or dnf deps) needs a subscription. Skip if already registered or using Satellite.
            {urlSet ? ' RPM/zip URL is set, so RHN may be needed for deps.' : ''}
          </p>
        </GridItem>
        {renderTextField('RHN Org ID (optional)', `component_config.${component}.standalone_rhn_org_id`, 'text')}
        {renderTextField(
          'RHN Activation key (optional)',
          `component_config.${component}.standalone_rhn_activation_key`,
          'password'
        )}
      </>
    );
  };

  const defaultComponentHelp = {
    hostname: 'Hostname or URL for this component. Example: https://grafana.apps.ocp.prod.rhlab or grafana.server.lab.',
    storage: 'OpenShift storage class. Use Look up when API host and token are set, or type the name. Example: ocs-storagecluster-ceph-rbd.'
  };

  const grafanaHelp = {
    hostname: 'Grafana route or hostname. Example: https://grafana.apps.ocp.prod.rhlab.',
    storage: 'OpenShift storage class used by Grafana. Use Look up when API host and token are set. Example: ocs-storagecluster-ceph-rbd.',
    folderName: 'Grafana folder to create. Example: OpenShift.',
    dashboardsSource: 'Folder path or Git repository containing dashboard JSON files.'
  };

  const rhbkHelp = {
    hostname: 'RHBK (Keycloak) hostname or route. Example: https://keycloak.apps.ocp.prod.rhlab.',
    storage: 'OpenShift storage class used by RHBK (Keycloak). Example: ocs-storagecluster-ceph-rbd.',
    realm: 'Realm name. Example: openshift or ADO.',
    client: 'Client ID. Example: openshift-console.',
    clientName: 'Human-readable client name. Example: OpenShift Console.',
    redirectUris: 'Allowed redirect URIs. Example: https://oauth-openshift.apps.ocp.prod.rhlab/oauth2callback/*.',
    webOrigins: 'Allowed browser origins. Example: https://console-openshift-console.apps.ocp.prod.rhlab.',
    idpName: 'Display name for the identity provider. Example: GitLab.',
    idpAlias: 'Identity provider alias used in URLs. Example: gitlab.',
    idpProvider: 'Provider type. Example: oidc or saml.',
    idpClientId: 'Client ID issued by the external IdP.',
    idpClientSecret: 'Client secret issued by the external IdP. Stored in vault output.',
    idpDiscoveryUrl: 'OIDC discovery URL. Example: https://gitlab.example.com/.well-known/openid-configuration.',
    mapperName: 'Mapper display name. Example: groups.',
    claimName: 'Token claim to read. Example: groups.',
    groupPath: 'Realm group path to map into. Example: /openshift-admins.',
    syncMode: 'Mapper sync behavior. Example: INHERIT, FORCE, or LEGACY.',
    clientScopeName: 'Client scope name. Example: groups.',
    protocol: 'Protocol for the client scope. Example: openid-connect.',
    description: 'Optional description for the generated client scope.',
    federationName: 'Federation provider name. Example: IDM LDAP.',
    federationProvider: 'Federation provider type. Example: ldap.',
    ldapUrl: 'LDAP URL. Example: ldap://idm.server.lab.',
    bindDn: 'Bind DN for LDAP lookups. Example: uid=svc-keycloak,cn=users,cn=accounts,dc=server,dc=lab.',
    bindPassword: 'LDAP bind password. Stored in vault output.',
    usersDn: 'LDAP users DN. Example: cn=users,cn=accounts,dc=server,dc=lab.',
    userAttribute: 'User attribute used for the token claim. Example: memberOf.',
    tokenClaimType: 'Token claim type. Example: String or JSON.',
    standaloneZip: 'Select the official rhbk-*.zip. Generate copies it to files/ in the playbook repo so AAP can copy it from the controller/EE. Prefer Zip URL if the file is hosted.'
  };

  const idmHelp = {
    hostname: 'Primary IdM server hostname. Example: idm-trust.dev.rhlab.',
    domain: 'DNS domain for IdM. Example: dev.rhlab.',
    realm: 'Kerberos realm, usually the domain in uppercase. Example: DEV.RHLAB.',
    replicaHostname: 'Replica host to install when IdM Replica Install is selected. Example: idm-replica.server.lab.',
    replicaDns: 'Install integrated DNS services on the replica.',
    replicaCa: 'Install certificate services on the replica.',
    dnsForwarders: 'Configure automatic DNS forwarders for IdM DNS.',
    customCertFile: 'Path to the custom IdM certificate file in the generated repo or mounted workspace.',
    customCertKeyFile: 'Path to the private key for the custom IdM certificate.',
    customCertChainFile: 'Path to the certificate chain file for the custom IdM certificate.',
    adminPassword: 'IdM admin password. Stored in generated vault files.',
    directoryManagerPassword: 'Directory Manager password. Stored in generated vault files.',
    adDomain: 'Active Directory DNS domain / forest. Example: ad.lab.',
    adDcHostname: 'AD domain controller FQDN. Example: adwindows.ad.lab.',
    adDcIp: 'AD domain controller IP used for IdM DNS forward zone. Example: 192.168.0.61.',
    adAdmin: 'AD Domain Admin used by ipa trust-add. Example: Administrator.',
    adAdminPassword: 'AD Domain Admin password. Stored in vault_ad_trust_admin_password.',
    adTwoWay: 'Two-way trust requires AD DNS to resolve the IdM domain (conditional forwarder to the IdM IP). One-way still lets AD users access IdM/Linux.',
    adConfigureGroups: 'Create IdM POSIX/external groups and sudo rule so AD users can SSH/sudo.',
    adMapGroup: 'Optional AD group to map into IdM (for example Domain Users@AD.LAB). Leave blank for role default.',
    adMapAdminsGroup: 'Optional AD admins group for sudo mapping (for example Domain Admins@AD.LAB).'
  };

  const rhelHelp = {
    complianceProfile: 'Compliance profile used by generated RHEL compliance jobs. Example: PCI-DSS.',
    stigProfile: 'STIG profile used by generated RHEL hardening jobs. Example: RHEL 9 STIG.',
    hostname: 'Primary RHEL host to include in the RHEL inventory. Example: rhel01.server.lab.',
    hosts: 'Additional RHEL hosts, one per line. Example: rhel02.server.lab.'
  };

  const patchingHelp = {
    inventoryMode: `Choose whether bootstrap should create ${(data.aap?.organization || 'ADO')}-RHEL-Inventory or point patching job templates at an inventory that already exists in AAP.`,
    inventoryName: 'Exact AAP inventory name to reuse. Example: Lab-Managed-Hosts. Bootstrap will not create this inventory or add hosts to it.',
    hostname: `Primary managed host for patching jobs. Added to ${(data.aap?.organization || 'ADO')}-RHEL-Inventory. Example: rhel01.server.lab.`,
    hosts: `Additional managed hosts for patching, one per line. These are created in ${(data.aap?.organization || 'ADO')}-RHEL-Inventory so Register Host / Patch Host job templates have targets.`
  };

  const complianceHelp = {
    profile: 'Compliance profile for standalone compliance jobs. Example: PCI-DSS, NIST 800-53, CIS, or STIG.'
  };

  const stigHelp = {
    profile: 'STIG profile for standalone STIG hardening jobs. Example: RHEL 9 STIG.'
  };

  const openshiftVirtHelp = {
    apiHost: 'OpenShift API server URL for the virtualization cluster. Example: https://api.ocp.prod.rhlab:6443.',
    apiToken: 'OpenShift token used to create the VM. Stored in generated vault files.',
    skipTls: 'Skip OpenShift API certificate validation for self-signed or lab certificates.',
    sshPublicKey: 'SSH public key (ssh-rsa / ssh-ed25519), not a private key. Attached to the VM job template and added to launch-time cloud-init.'
  };

  const awsHelp = {
    profile: 'Optional AWS shared credentials profile name. Leave blank to use the default credential chain.',
    defaultRegion: 'Default AWS region for shared vars (vars_aws.yml). Example: us-east-1.',
    accessKeyId: 'AWS access key ID stored in vault_aws.yml (shared across AWS bootstrap jobs).',
    secretAccessKey: 'AWS secret access key stored in vault_aws.yml.',
    sessionToken: 'Optional session token for temporary credentials (stored in vault_aws.yml).'
  };

  const openshiftHelp = {
    apiHost: 'OpenShift API server URL. Example: https://api.ocp.prod.rhlab:6443.',
    appsDomain: 'OpenShift apps domain used for routes. Example: apps.ocp.prod.rhlab.',
    skipTls: 'Skip OpenShift API certificate validation for self-signed or lab certificates.',
    token: (
      <div>
        <p>Use a cluster-admin service account token for OpenShift automation.</p>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
{`oc create serviceaccount ansible-sa -n kube-system
oc adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:kube-system:ansible-sa
export TOKEN=$(oc create token ansible-sa -n kube-system --duration=876000h)
echo $TOKEN

# Paste the printed token into this field.`}
        </pre>
        <p style={{ marginBottom: 0 }}>The token is stored in generated vault files.</p>
      </div>
    ),
    certSource: 'Certificate source used by cert-manager automation: custom certificate, IdM ACME, or AWS PCA.',
    tlsCrt: 'PEM-formatted TLS certificate for the custom certificate source.',
    tlsKey: 'PEM-formatted TLS private key for the custom certificate source.',
    idmAcmeDirectoryUrl: 'ACME directory URL from IdM. Example: https://idm.server.lab/acme/directory.',
    idmCaBundleFile: 'Path to the IdM CA bundle file used to trust the ACME endpoint.',
    awspcaNamespace: 'Kubernetes namespace for AWS PCA issuer resources. Example: cert-manager.',
    awspcaSecretName: 'Kubernetes secret containing AWS PCA credentials.',
    awspcaIssuerName: 'ClusterIssuer or Issuer name for AWS PCA. Example: aws-pca-cluster-issuer.',
    awspcaRegion: 'AWS region for PCA. Example: us-east-1.',
    awspcaPcaArn: 'AWS Private CA ARN used by cert-manager.',
    awspcaAccessKeyId: 'AWS access key ID for PCA access. Stored in generated vault files.',
    awspcaSecretAccessKey: 'AWS secret access key for PCA access. Stored in generated vault files.',
    adminUsername: 'OpenShift htpasswd admin username. Example: admin.',
    adminPassword: 'OpenShift htpasswd admin password. Stored in generated vault files.',
    adminRole: 'Cluster role to bind to the htpasswd user. Example: cluster-admin.',
    bannerLocation: 'OpenShift console banner location. Example: BannerTop or BannerBottom.',
    bannerText: 'Text shown in the console banner. Example: Production cluster - approved changes only.',
    bannerBackgroundColor: 'Console banner background color. Example: #1f7a1f.',
    bannerTextColor: 'Console banner text color. Example: #ffffff.',
    agentClusterName: 'OpenShift cluster name used in install-config metadata. Example: ocp-dev.',
    agentBaseDomain: 'Base DNS domain for the cluster. Example: dev.rhlab.',
    agentPullSecret: 'Red Hat pull secret JSON copied from cloud.redhat.com.',
    agentSshKey: 'Public SSH key installed for core user access. Example: ssh-ed25519 AAAA...',
    agentVip: 'Virtual IP address inside the machine network CIDR.',
    agentNetworkCidr: 'CIDR block used by bare metal nodes. Example: 192.168.2.0/24.',
    agentRendezvousIp: 'IP address of the first control-plane host used by the agent installer.',
    agentNodeStatic: 'Static networking writes NMState config into agent-config.yaml. DHCP uses the MAC/interface only.',
    agentMac: 'Type 12 hex digits (112233445566) or colon-separated (11:22:33:44:55:66). Colons are added automatically when missing.',
    agentBond: 'Enable to create a bond0 NMState interface from two NICs (primary + secondary MAC/interface).',
    agentKernelArgs: 'One kernel argument per line. Example: ixgbe.allow_unsupported_sfp=1. Generates MachineConfig manifests under openshift/ plus an assisted-style kernelArguments snippet.'
  };

  const gitHelp = {
    gitOverrides: (
      <>
        <p><strong>Default (all unchecked):</strong> keep the pod&apos;s local git clone and only write/commit bootstrap changes — no wipe or force overwrite.</p>
        <p><strong>group_vars/all/&lt;env&gt;:</strong> remove and regenerate vars/vault for the current Environment Type only.</p>
        <p><strong>Job and workflow templates:</strong> remove and regenerate <code>configs/job_templates</code> and <code>configs/workflows</code>.</p>
        <p><strong>All:</strong> re-clone from Git and wipe <code>group_vars</code>, <code>playbooks</code>, and <code>configs</code> before scaffolding.</p>
      </>
    ),
    overrideGroupVarsEnv: (
      <>
        <p>Delete <code>group_vars/all/&lt;current env&gt;</code> in the pod git repo and regenerate vars/vault with force overwrite.</p>
        <p>Other environments, playbooks, and configs are preserved.</p>
      </>
    ),
    overrideJobWorkflowTemplates: (
      <>
        <p>Delete <code>configs/job_templates</code> and <code>configs/workflows</code> and regenerate from the collection.</p>
        <p>Existing job/workflow YAML files are not modified when unchecked.</p>
      </>
    ),
    overrideAll: (
      <>
        <p>Re-clone the bootstrap repo from Git and remove all <code>group_vars</code>, <code>playbooks</code>, and <code>configs</code> before bootstrap runs.</p>
        <p>Equivalent to enabling all override scopes.</p>
      </>
    ),
    skipTlsVerify: (
      <>
        <p>Default is SSL verification disabled.</p>
        <p>When checked, local git uses <code>http.sslVerify=false</code>.</p>
      </>
    ),
    varsOnly: (
      <>
        <p><strong>Vars / Vault only:</strong> refresh generated vars and vault for selected components — no playbooks or Controller objects.</p>
        <p>Regenerates <code>group_vars/all/&lt;env&gt;/vars_*.yml</code> and vault files from your component config.</p>
        <p>Skips playbooks, job templates, workflows, and Controller apply. Git push still runs if enabled on the Git card.</p>
        <p>Mutually exclusive with <strong>Run AAP tabs only</strong>.</p>
      </>
    )
  };

  const aapHelp = {
    standaloneRun: (
      <>
        <p><strong>Run AAP tabs only:</strong> Hub, Galaxy, authentication, or Onboard work with no OpenShift/RHEL components. Git push is off by default (Hub publish only).</p>
        <p>Hub / Galaxy / Add authentication / Onboard-only — no OpenShift/RHEL component playbooks or full Controller scaffolding.</p>
        <p>Does not git-push the bootstrap repo (clone still runs). Re-enable push on Git Configuration if needed.</p>
        <p>Mutually exclusive with <strong>Vars / Vault files only</strong>.</p>
      </>
    ),
    deployToOpenShift: (
      <>
        <p>Build the preflight UI image and apply <code>deploy/preflight.yaml</code> on the OpenShift cluster using API host/token from OpenShift Configuration.</p>
        <p>Use this to run preflight on the cluster portal (not the local pod). Poll logs in the console after starting.</p>
        <p>Local testing: <code>./restart_pod.sh</code> runs bootstrap in a pod on this machine instead.</p>
      </>
    ),
    hubPublishCollection: (
      <>
        <p>
          Publishes <code>infra.ado</code> into Private Automation Hub validated content when it is
          missing, or refreshes it when you also enable force below.
        </p>
        <p>Leave off if Hub already has the collection Controller should use.</p>
      </>
    ),
    hubForceCollectionUpdate: (
      <>
        <p>
          Overwrites an existing <code>infra.ado</code> in Hub validated content.
        </p>
        <p>Without this, an already-installed collection is left as-is.</p>
      </>
    ),
    hubExecutionEnvironment: (
      <>
        <p>
          Pushes ADO EE into Private Automation Hub with <code>skopeo</code> inside this pod, then
          optionally creates a Controller execution environment (default{' '}
          <code>{defaultOrgEeName(data.aap?.organization || 'ADO')}</code>).
        </p>
        <p>
          The UI image ships a baked archive at{' '}
          <code>docker-archive:/opt/ado-ee/ado-ee.docker.tar</code> — no host podman socket and no
          runtime internet. Registry login uses General → Hub / Galaxy API token.
        </p>
        <p>
          Without ADO EE, Controller jobs need Galaxy credentials already on the organization so
          project sync can install vendored <code>infra.ado</code> (Galaxy tab creates them if
          missing; leave it off if they already exist in Controller).
        </p>
      </>
    )
  };

  const bootstrapRunModeHelp = (
    <>
      <p>Choose a limited bootstrap path, or select platform components above for a full bootstrap.</p>
      <p>Selecting any component disables both limited modes and runs full scaffolding instead.</p>
    </>
  );

  const renderDefaultComponentConfig = component => (
    <>
      {renderComponentOptions(
        component,
        `${componentOptionLabels[component] || component} Options`,
        `Optional workflow steps for ${component}. Auth steps run only when selected and RHBK/Keycloak is available.`
      )}
      <Grid hasGutter>
        {renderTextField('Hostname', `component_config.${component}.hostname`, 'text', defaultComponentHelp.hostname)}
        {renderStorageClassField('Storage', `component_config.${component}.storage`, defaultComponentHelp.storage)}
        {renderTextField('Replicas', `component_config.${component}.replicas`, 'number', 'Workload replicas. Default is the component default (usually 1).')}
      </Grid>
    </>
  );

  const renderGrafanaConfig = () => {
    const folders = data.component_config?.grafana?.folders || [];
    const email = data.component_config?.grafana?.email || {};
    const oidc = data.component_config?.grafana?.oidc || {};
    const updateFolder = (index, key, value) => {
      setData(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        if (!copy.component_config.grafana.folders) copy.component_config.grafana.folders = [];
        copy.component_config.grafana.folders[index] = {
          ...(copy.component_config.grafana.folders[index] || {}),
          [key]: value
        };
        return copy;
      });
    };
    const removeGrafanaFolder = index => {
      setData(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        if (!copy.component_config?.grafana?.folders) return copy;
        copy.component_config.grafana.folders = copy.component_config.grafana.folders.filter((_, i) => i !== index);
        return copy;
      });
    };
    return (
      <>
        {renderComponentOptions('grafana', 'Grafana Options', 'Select which Grafana resources to configure. Choose Standalone for the RHEL VM RPM install (ADO | Install Grafana Standalone) — inventory host grafana-ado / 192.168.0.66.')}
        <Grid hasGutter>
          {renderTextField('Hostname / URL', 'component_config.grafana.hostname', 'text', grafanaHelp.hostname)}
          {renderStorageClassField('Storage Class', 'component_config.grafana.storage', grafanaHelp.storage)}
          {renderTextField('Replicas', 'component_config.grafana.replicas', 'number')}
        </Grid>
      {(data.component_options?.grafana || []).includes('standalone') && (
        <Grid hasGutter style={{ marginTop: '12px' }}>
          <GridItem span={12}>
            <Title headingLevel="h3">Standalone RHEL Grafana</Title>
            <p style={{ color: mutedTextColor }}>
              Lab defaults: hostname <code>grafana-ado.server.lab</code>, IP note <code>192.168.0.66</code>,
              admin password <code>redhat123</code>. Airgap: set RPM path on Contoller or RPM URL.
            </p>
          </GridItem>
          {renderTextField('VM hostname', 'component_config.grafana.standalone_hostname', 'text')}
          {renderTextField('IP note (inventory)', 'component_config.grafana.standalone_ip_note', 'text')}
          {renderTextField('Admin user', 'component_config.grafana.standalone_admin_user', 'text')}
          {renderTextField('Admin password', 'component_config.grafana.standalone_admin_password', 'password')}
          {renderTextField('HTTP port', 'component_config.grafana.standalone_http_port', 'number')}
          {renderTextField('Airgap RPM path (Contoller)', 'component_config.grafana.standalone_rpm_path', 'text')}
          {renderTextField('Airgap RPM URL', 'component_config.grafana.standalone_rpm_url', 'text')}
          {renderStandaloneTlsAndRhn('grafana', { showTls: false })}
        </Grid>
      )}
        <Grid hasGutter>
          <GridItem span={12}>
            <Title headingLevel="h3">Dashboard / Alert Folders</Title>
            <p style={{ color: mutedTextColor }}>
              Each folder can point at a git repo or path. Use .json as-is or .json.j2 templates.
              Default layout: <code>OpenshiftProd</code> / <code>OpenshiftDev</code> (pinned per cluster),
              optional shared <code>Openshift</code> (K8S dropdown), and <code>RHACS</code>.
            </p>
          </GridItem>
          <GridItem span={12}>
            <Checkbox
              id="grafana-group-cluster-dashboards"
              label="Also deploy shared Openshift folder with K8S Prod/Dev dropdown"
              isChecked={data.component_config.grafana.group_cluster_dashboards !== false}
              onChange={(_, v) => set('component_config.grafana.group_cluster_dashboards', v)}
            />
            <div style={{ color: mutedTextColor, fontSize: '13px', margin: '4px 0 8px' }}>
              When enabled, ADO also uploads a shared <code>Openshift</code> folder where each dashboard
              has a <strong>K8S</strong> dropdown to switch <code>Openshift-Prod</code> /
              <code>Openshift-Dev</code>. <code>OpenshiftProd</code> and <code>OpenshiftDev</code>
              folders (one dashboard set per cluster) are always deployed.
            </div>
          </GridItem>
          {folders.map((folder, index) => (
            <GridItem span={12} key={`grafana-folder-${index}`}>
              <div style={{ border: `1px solid ${borderColor}`, padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Tooltip content="Remove folder">
                    <Button
                      variant="plain"
                      onClick={() => removeGrafanaFolder(index)}
                      aria-label={`Remove folder ${folder.name || index + 1}`}
                    >
                      X
                    </Button>
                  </Tooltip>
                </div>
                <Grid hasGutter>
                <GridItem span={3}>
                  <FormGroup label="Folder name">
                    <TextInput value={folder.name || ''} onChange={(_, v) => updateFolder(index, 'name', v)} />
                  </FormGroup>
                </GridItem>
                <GridItem span={2}>
                  <FormGroup label="Source type">
                    <select value={folder.source_type || 'path'} onChange={e => updateFolder(index, 'source_type', e.target.value)} style={{ width: '100%', height: '36px' }}>
                      <option value="path">path</option>
                      <option value="git">git</option>
                    </select>
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup label="Source (git URL or path)">
                    <TextInput value={folder.source || ''} onChange={(_, v) => updateFolder(index, 'source', v)} />
                  </FormGroup>
                </GridItem>
                <GridItem span={2}>
                  <FormGroup label="Dashboards path">
                    <TextInput value={folder.dashboards_path || 'dashboards'} onChange={(_, v) => updateFolder(index, 'dashboards_path', v)} />
                  </FormGroup>
                </GridItem>
                <GridItem span={1}>
                  <FormGroup label="Alerts path">
                    <TextInput value={folder.alerts_path || 'alerts'} onChange={(_, v) => updateFolder(index, 'alerts_path', v)} />
                  </FormGroup>
                </GridItem>
                </Grid>
              </div>
            </GridItem>
          ))}
          <GridItem span={12}>
            <Button variant="secondary" onClick={() => setData(prev => {
              const copy = JSON.parse(JSON.stringify(prev));
              if (!copy.component_config.grafana.folders) copy.component_config.grafana.folders = [];
              copy.component_config.grafana.folders.push({ name: '', source_type: 'git', source: '', dashboards_path: 'dashboards', alerts_path: 'alerts' });
              return copy;
            })}>Add Folder</Button>
          </GridItem>
          <GridItem span={12}>
            <Checkbox id="grafana-alerts-enabled" label="Enable alerts upload from folder alerts_path" isChecked={!!data.component_config.grafana.alerts_enabled} onChange={(_, v) => set('component_config.grafana.alerts_enabled', v)} />
          </GridItem>
          <GridItem span={12}><Title headingLevel="h3">Email / SMTP</Title></GridItem>
          <GridItem span={12}>
            <Checkbox id="grafana-email-enabled" label="Configure Grafana email" isChecked={!!email.enabled} onChange={(_, v) => set('component_config.grafana.email.enabled', v)} />
          </GridItem>
          {email.enabled && (
            <>
              {renderTextField('SMTP Host', 'component_config.grafana.email.smtp_host')}
              {renderTextField('SMTP Port', 'component_config.grafana.email.smtp_port')}
              {renderTextField('SMTP User', 'component_config.grafana.email.smtp_user')}
              {renderTextField('SMTP Password', 'component_config.grafana.email.smtp_password', 'password')}
              {renderTextField('From Address', 'component_config.grafana.email.from_address')}
              {renderTextField('From Name', 'component_config.grafana.email.from_name')}
            </>
          )}
          <GridItem span={12}><Title headingLevel="h3">OIDC</Title></GridItem>
          <GridItem span={12}>
            <Checkbox id="grafana-oidc-enabled" label="Enable Grafana OIDC" isChecked={!!oidc.enabled} onChange={(_, v) => set('component_config.grafana.oidc.enabled', v)} />
          </GridItem>
          {oidc.enabled && isRhbkSelected(data) && !(data.component_options?.grafana || []).includes('standalone') && (
            <GridItem span={12}>
              <p style={{ color: mutedTextColor, margin: '0 0 8px 0', fontSize: '13px' }}>
                Client ID and issuer are filled from your RHBK settings. The client secret is
                not stored here — the Grafana OIDC job fetches it from Keycloak at deploy time
                (same pattern as OpenShift OAuth).
              </p>
            </GridItem>
          )}
          {oidc.enabled && (
            <>
              {renderTextField(
                'OIDC Client ID',
                'component_config.grafana.oidc.client_id',
                'text',
                isRhbkSelected(data) ? 'From RHBK client list (grafana*) or default grafana-client.' : undefined
              )}
              {(!isRhbkSelected(data) || oidc.client_secret_manual) && (
                renderTextField(
                  'OIDC Client Secret',
                  'component_config.grafana.oidc.client_secret',
                  'password',
                  isRhbkSelected(data) ? 'Optional override — leave empty to fetch from Keycloak at deploy.' : undefined
                )
              )}
              {isRhbkSelected(data) && !(data.component_options?.grafana || []).includes('standalone') && (
                <GridItem span={12}>
                  <Checkbox
                    id="grafana-oidc-secret-manual"
                    label="Enter client secret manually (optional override)"
                    isChecked={!!oidc.client_secret_manual}
                    onChange={(_, v) => {
                      setData(prev => {
                        const copy = JSON.parse(JSON.stringify(prev));
                        if (!copy.component_config?.grafana?.oidc) return copy;
                        copy.component_config.grafana.oidc.client_secret_manual = v;
                        if (!v) {
                          copy.component_config.grafana.oidc.client_secret = '';
                          copy.component_config.grafana.oidc.fetch_secret_from_rhbk = true;
                        }
                        return copy;
                      });
                    }}
                  />
                </GridItem>
              )}
              {renderTextField(
                'OIDC Issuer URL',
                'component_config.grafana.oidc.issuer',
                'text',
                isRhbkSelected(data) ? 'https://<keycloak-host>/realms/<realm> from RHBK hostname + realm.' : undefined
              )}
            </>
          )}
        </Grid>
      </>
    );
  };

  const rhbkDetailTabLabels = {
    client: 'Client',
    idp: 'IDP',
    group_mapper: 'Group Mapper',
    client_scopes: 'Client Scopes',
    federation: 'Federation',
    client_mappers: 'Client Mappers'
  };

  const getRhbkDetailTabs = () => {
    const selected = data.component_options?.rhbk || [];
    return ['client', 'idp', 'group_mapper', 'client_scopes', 'federation', 'client_mappers']
      .filter(option => selected.includes(option));
  };

  const renderRhbkDetailFields = tab => {
    switch (tab) {
      case 'client': {
        const clients = data.component_config?.rhbk?.clients || [];
        const updateClient = (index, key, value) => {
          setData(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (!copy.component_config.rhbk.clients) copy.component_config.rhbk.clients = [];
            copy.component_config.rhbk.clients[index] = {
              ...(copy.component_config.rhbk.clients[index] || {}),
              [key]: value
            };
            if (index === 0 && key === 'id') copy.component_config.rhbk.client = value;
            return copy;
          });
        };
        const removeRhbkClient = index => {
          setData(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (!copy.component_config?.rhbk?.clients) return copy;
            copy.component_config.rhbk.clients = copy.component_config.rhbk.clients.filter((_, i) => i !== index);
            const firstClient = copy.component_config.rhbk.clients[0];
            copy.component_config.rhbk.client = firstClient?.id || '';
            return copy;
          });
        };
        return (
          <Grid hasGutter>
            {clients.map((client, index) => (
              <GridItem span={12} key={`rhbk-client-${index}`}>
                <div style={{ border: `1px solid ${borderColor}`, padding: '12px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tooltip content="Remove client">
                      <Button variant="plain" onClick={() => removeRhbkClient(index)} aria-label={`Remove client ${index + 1}`}>
                        X
                      </Button>
                    </Tooltip>
                  </div>
                  <Grid hasGutter>
                    <GridItem span={3}><FormGroup label="Client ID"><TextInput value={client.id || ''} onChange={(_, v) => updateClient(index, 'id', v)} /></FormGroup></GridItem>
                    <GridItem span={3}><FormGroup label="Client Name"><TextInput value={client.name || ''} onChange={(_, v) => updateClient(index, 'name', v)} /></FormGroup></GridItem>
                    <GridItem span={3}><FormGroup label="Redirect URIs"><TextInput value={client.redirect_uris || ''} onChange={(_, v) => updateClient(index, 'redirect_uris', v)} /></FormGroup></GridItem>
                    <GridItem span={3}><FormGroup label="Web Origins"><TextInput value={client.web_origins || ''} onChange={(_, v) => updateClient(index, 'web_origins', v)} /></FormGroup></GridItem>
                  </Grid>
                </div>
              </GridItem>
            ))}
            <GridItem span={12}>
              <Button variant="secondary" onClick={() => setData(prev => {
                const copy = JSON.parse(JSON.stringify(prev));
                if (!copy.component_config.rhbk.clients) copy.component_config.rhbk.clients = [];
                copy.component_config.rhbk.clients.push({ id: '', name: '', redirect_uris: '', web_origins: '' });
                return copy;
              })}>Add Client</Button>
            </GridItem>
          </Grid>
        );
      }
      case 'idp':
        return (
          <Grid hasGutter>
            {renderTextField('IDP Name', 'component_config.rhbk.idp_name', 'text', rhbkHelp.idpName)}
            {renderTextField('IDP Alias', 'component_config.rhbk.idp_alias', 'text', rhbkHelp.idpAlias)}
            {renderTextField('IDP Provider', 'component_config.rhbk.idp_provider', 'text', rhbkHelp.idpProvider)}
            {renderTextField('Client ID', 'component_config.rhbk.idp_client_id', 'text', rhbkHelp.idpClientId)}
            {renderTextField('Client Secret', 'component_config.rhbk.idp_client_secret', 'password', rhbkHelp.idpClientSecret)}
            {renderTextField('Discovery URL', 'component_config.rhbk.idp_discovery_url', 'text', rhbkHelp.idpDiscoveryUrl)}
          </Grid>
        );
      case 'group_mapper':
        return (
          <Grid hasGutter>
            {renderTextField('Mapper Name', 'component_config.rhbk.group_mapper_name', 'text', rhbkHelp.mapperName)}
            {renderTextField('Claim Name', 'component_config.rhbk.group_mapper_claim', 'text', rhbkHelp.claimName)}
            {renderTextField('Group Path', 'component_config.rhbk.group_mapper_group_path', 'text', rhbkHelp.groupPath)}
            {renderTextField('Sync Mode', 'component_config.rhbk.group_mapper_sync_mode', 'text', rhbkHelp.syncMode)}
          </Grid>
        );
      case 'client_scopes':
        return (
          <Grid hasGutter>
            {renderTextField('Client Scope Name', 'component_config.rhbk.client_scope_name', 'text', rhbkHelp.clientScopeName)}
            {renderTextField('Protocol', 'component_config.rhbk.client_scope_protocol', 'text', rhbkHelp.protocol)}
            {renderTextField('Description', 'component_config.rhbk.client_scope_description', 'text', rhbkHelp.description)}
          </Grid>
        );
      case 'federation':
        return (
          <Grid hasGutter>
            {renderTextField('Federation Name', 'component_config.rhbk.federation_name', 'text', rhbkHelp.federationName)}
            {renderTextField('Provider', 'component_config.rhbk.federation_provider', 'text', rhbkHelp.federationProvider)}
            {renderTextField('LDAP URL', 'component_config.rhbk.federation_ldap_url', 'text', rhbkHelp.ldapUrl)}
            {renderTextField('Bind DN', 'component_config.rhbk.federation_bind_dn', 'text', rhbkHelp.bindDn)}
            {renderTextField('Bind Password', 'component_config.rhbk.federation_bind_password', 'password', rhbkHelp.bindPassword)}
            {renderTextField('Users DN', 'component_config.rhbk.federation_users_dn', 'text', rhbkHelp.usersDn)}
          </Grid>
        );
      case 'client_mappers':
        return (
          <Grid hasGutter>
            {renderTextField('Mapper Name', 'component_config.rhbk.client_mapper_name', 'text', rhbkHelp.mapperName)}
            {renderTextField('Claim Name', 'component_config.rhbk.client_mapper_claim', 'text', rhbkHelp.claimName)}
            {renderTextField('User Attribute', 'component_config.rhbk.client_mapper_user_attribute', 'text', rhbkHelp.userAttribute)}
            {renderTextField('Token Claim Type', 'component_config.rhbk.client_mapper_claim_type', 'text', rhbkHelp.tokenClaimType)}
          </Grid>
        );
      default:
        return null;
    }
  };

  const renderRhbkDetailTabs = () => {
    const tabs = getRhbkDetailTabs();
    if (tabs.length === 0) return null;

    const selectedTab = tabs.includes(activeRhbkDetailTab) ? activeRhbkDetailTab : tabs[0];

    return (
      <div style={{ marginTop: '18px' }}>
        <Tabs activeKey={selectedTab} onSelect={(_, key) => setActiveRhbkDetailTab(key)}>
          {tabs.map(tab => (
            <Tab key={tab} eventKey={tab} title={rhbkDetailTabLabels[tab]} />
          ))}
        </Tabs>
        <div style={{ marginTop: '16px' }}>
          {renderRhbkDetailFields(selectedTab)}
        </div>
      </div>
    );
  };

  const renderRhbkConfig = () => {
    const selected = data.component_options?.rhbk || [];
    const showStandalone = selected.includes('standalone');
    const showOpenshiftInstall = !showStandalone;

    return (
    <>
      {renderComponentOptions('rhbk', 'RHBK (Keycloak) Options', 'Select which RHBK (Keycloak) resources to configure. Choose Standalone for the RHEL VM zip install (ADO | Install RHBK Standalone) — that hides the OpenShift operator fields. Wire inventory host keycloak-ado / 192.168.0.64 and a machine credential.')}
      {showOpenshiftInstall && (
        <Grid hasGutter>
          {renderTextField('Hostname / URL', 'component_config.rhbk.hostname', 'text', rhbkHelp.hostname)}
          {renderStorageClassField('Storage Class', 'component_config.rhbk.storage', rhbkHelp.storage)}
          {renderTextField('Replicas', 'component_config.rhbk.replicas', 'number')}
          {renderTextField('Realm', 'component_config.rhbk.realm', 'text', rhbkHelp.realm)}
        </Grid>
      )}
      {showStandalone && (
        <div style={{ marginTop: '16px', padding: '14px', border: `1px solid ${borderColor}`, borderRadius: '6px' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>Standalone RHBK (RHEL VM)</div>
          <Grid hasGutter>
            {renderTextField('VM hostname (KC_HOSTNAME)', 'component_config.rhbk.standalone_hostname', 'text')}
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('RHBK zip', rhbkHelp.standaloneZip)}>
                <input
                  id="rhbk-standalone-zip-file"
                  type="file"
                  accept=".zip,application/zip"
                  disabled={rhbkZipUploading}
                  onChange={event => {
                    uploadRhbkStandaloneZip(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  style={{ display: 'block', marginBottom: '8px' }}
                />
                <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                  {rhbkZipUploading
                    ? 'Uploading zip to the preflight workspace…'
                    : (data.component_config?.rhbk?.standalone_zip_file
                      ? `Selected: ${data.component_config.rhbk.standalone_zip_file}. Generated repo path: files/${data.component_config.rhbk.standalone_zip_file}.`
                      : 'Choose rhbk-*.zip from this workstation. It is staged and written to files/ on generate (same pattern as the Satellite manifest).')}
                </div>
                {rhbkZipError && (
                  <div style={{ color: '#c9190b', fontSize: '13px', marginTop: '6px' }}>{rhbkZipError}</div>
                )}
                {data.component_config?.rhbk?.standalone_zip_file && (
                  <Button variant="link" onClick={clearRhbkStandaloneZip}>Clear zip</Button>
                )}
              </FormGroup>
            </GridItem>
            {renderTextField('Zip URL (optional)', 'component_config.rhbk.standalone_zip_url', 'text')}
            {renderStandaloneTlsAndRhn('rhbk', { urlPath: 'standalone_zip_url' })}
            {renderTextField('Admin user', 'component_config.rhbk.standalone_admin_user', 'text')}
            {renderTextField('Admin password', 'component_config.rhbk.standalone_admin_password', 'password')}
          </Grid>
        </div>
      )}
      {renderRhbkDetailTabs()}
    </>
    );
  };


  const renderMachineCredentialConfig = () => {
    const credential = data.aap.machine_credential || defaults.aap.machine_credential;

    return (
      <div
        style={{
          padding: '14px',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          background: isDark ? '#1f1f1f' : '#fafafa',
          marginTop: '16px',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              AAP Machine Credential
            </div>
            <div style={{ color: mutedTextColor, fontSize: '13px' }}>
              Used by RHEL, Satellite, and patching jobs for SSH access.
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => setShowMachineCredentialSecrets(!showMachineCredentialSecrets)}
          >
            {showMachineCredentialSecrets ? 'Hide Passphrase' : 'Show Passphrase'}
          </Button>
        </div>

        <br />

        <Grid hasGutter>
          <GridItem span={6}>
            <FormGroup label="Credential Name">
              <TextInput
                value={credential.name}
                onChange={(_, v) => set('aap.machine_credential.name', v)}
              />
            </FormGroup>
          </GridItem>

          <GridItem span={6}>
            <FormGroup label="SSH Username">
              <TextInput
                value={credential.username}
                onChange={(_, v) => set('aap.machine_credential.username', v)}
              />
            </FormGroup>
          </GridItem>

          <GridItem span={6}>
            <FormGroup label="Become Method">
              <select
                value={credential.become_method}
                onChange={e => set('aap.machine_credential.become_method', e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="">None</option>
                <option value="sudo">sudo</option>
                <option value="su">su</option>
                <option value="pbrun">pbrun</option>
                <option value="dzdo">dzdo</option>
              </select>
            </FormGroup>
          </GridItem>

          <GridItem span={6}>
            <FormGroup label="Become Username">
              <TextInput
                value={credential.become_username}
                onChange={(_, v) => set('aap.machine_credential.become_username', v)}
              />
            </FormGroup>
          </GridItem>

          <GridItem span={12}>
            <FormGroup label="SSH Private Key">
              <textarea
                value={credential.ssh_key_data || ''}
                onChange={e => set('aap.machine_credential.ssh_key_data', e.target.value)}
                spellCheck="false"
                rows={8}
                style={{
                  width: '100%',
                  background: fieldBg,
                  color: fieldColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  padding: '8px',
                  fontFamily: 'monospace'
                }}
              />
            </FormGroup>
          </GridItem>

          <GridItem span={12}>
            <FormGroup label="Private Key Passphrase">
              <TextInput
                type={showMachineCredentialSecrets ? 'text' : 'password'}
                value={credential.ssh_key_unlock}
                onChange={(_, v) => set('aap.machine_credential.ssh_key_unlock', v)}
              />
            </FormGroup>
          </GridItem>
        </Grid>
      </div>
    );
  };

  const renderVaultCredentialConfig = () => (
    <Grid hasGutter>
      <GridItem span={6}>
        <FormGroup label="Vault Credential Name" isRequired>
          <TextInput
            value={data.aap.vault_credential_name}
            onChange={(_, v) => set('aap.vault_credential_name', v)}
          />
        </FormGroup>
      </GridItem>
      <GridItem span={6}>
        <FormGroup label="Vault Password" isRequired>
          <TextInput
            type="password"
            value={data.aap.vault_password}
            onChange={(_, v) => set('aap.vault_password', v)}
          />
        </FormGroup>
      </GridItem>
    </Grid>
  );

  const renderCredentialConfigCard = () => (
    <Card style={cardStyle}>
      <CardBody>
        <Title headingLevel="h2">Credentials</Title>
        <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '4px' }}>
          Configure AAP credentials created during bootstrap.
        </div>

        <br />

        <Tabs activeKey={activeCredentialConfigTab} onSelect={(_, key) => setActiveCredentialConfigTab(key)}>
          <Tab eventKey="vault" title="Vault" />
          <Tab eventKey="machine" title="Machine" />
          <Tab eventKey="additional" title="Additional" />
        </Tabs>

        <div style={{ marginTop: '16px' }}>
          {activeCredentialConfigTab === 'vault' && renderVaultCredentialConfig()}
          {activeCredentialConfigTab === 'machine' && renderMachineCredentialConfig()}
          {activeCredentialConfigTab === 'additional' && renderAdditionalAapCredentials()}
        </div>
      </CardBody>
    </Card>
  );

  const addAapCredential = () => {
    const id = newCredentialId();
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      if (!Array.isArray(copy.aap.additional_credentials)) copy.aap.additional_credentials = [];
      copy.aap.additional_credentials.push({
        id,
        name: '',
        credential_type: 'Machine',
        username: '',
        password: '',
        host: '',
        token: '',
        ssh_key_data: '',
        ssh_key_unlock: '',
        become_method: 'sudo',
        become_username: 'root'
      });
      return copy;
    });
    setActiveAapCredentialTab(id);
  };

  const removeAapCredential = index => {
    const currentCredentials = data.aap.additional_credentials || [];
    const nextCredentials = currentCredentials.filter((_, i) => i !== index);
    const nextCredential = nextCredentials[index] || nextCredentials[index - 1];
    const nextCredentialIndex = nextCredentials.indexOf(nextCredential);
    const nextTab = nextCredential
      ? credentialTabKey(nextCredential, nextCredentialIndex)
      : '';

    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.aap.additional_credentials = (copy.aap.additional_credentials || []).filter((_, i) => i !== index);
      return copy;
    });
    setActiveAapCredentialTab(nextTab);
  };

  const renderAapCredentialFields = (credential, index) => (
    <Grid hasGutter>
      <GridItem span={12}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip content="Remove credential">
            <Button variant="plain" onClick={() => removeAapCredential(index)}>X</Button>
          </Tooltip>
        </div>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Credential Name">
          <TextInput value={credential.name} onChange={(_, v) => set(`aap.additional_credentials.${index}.name`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Credential Type">
          <select
            value={credential.credential_type}
            onChange={e => set(`aap.additional_credentials.${index}.credential_type`, e.target.value)}
            style={{ width: '100%', padding: '8px' }}
          >
            <option value="Machine">Machine</option>
            <option value="Source Control">Source Control</option>
            <option value="Vault">Vault</option>
            <option value="Red Hat Satellite 6">Red Hat Satellite 6</option>
            <option value="OpenShift or Kubernetes API Bearer Token">OpenShift or Kubernetes API Bearer Token</option>
          </select>
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Host / URL">
          <TextInput value={credential.host} onChange={(_, v) => set(`aap.additional_credentials.${index}.host`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Username">
          <TextInput value={credential.username} onChange={(_, v) => set(`aap.additional_credentials.${index}.username`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Password">
          <TextInput type="password" value={credential.password} onChange={(_, v) => set(`aap.additional_credentials.${index}.password`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Token">
          <TextInput type="password" value={credential.token} onChange={(_, v) => set(`aap.additional_credentials.${index}.token`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Become Method">
          <TextInput value={credential.become_method} onChange={(_, v) => set(`aap.additional_credentials.${index}.become_method`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={4}>
        <FormGroup label="Become Username">
          <TextInput value={credential.become_username} onChange={(_, v) => set(`aap.additional_credentials.${index}.become_username`, v)} />
        </FormGroup>
      </GridItem>
      <GridItem span={12}>
        <FormGroup label="SSH Private Key">
          <textarea
            value={credential.ssh_key_data || ''}
            onChange={e => set(`aap.additional_credentials.${index}.ssh_key_data`, e.target.value)}
            rows={4}
            style={{
              width: '100%',
              background: fieldBg,
              color: fieldColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              padding: '8px',
              fontFamily: 'monospace'
            }}
          />
        </FormGroup>
      </GridItem>
    </Grid>
  );

  const renderAdditionalAapCredentials = () => {
    const credentials = data.aap.additional_credentials || [];
    const activeCredentialIndex = credentials.findIndex(
      (credential, index) => credentialTabKey(credential, index) === activeAapCredentialTab
    );
    const selectedCredentialIndex = activeCredentialIndex >= 0
      ? activeCredentialIndex
      : (credentials.length > 0 ? 0 : -1);
    const activeCredentialTab = selectedCredentialIndex >= 0
      ? credentialTabKey(credentials[selectedCredentialIndex], selectedCredentialIndex)
      : '';

    return (
      <div
        style={{
          padding: '14px',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          background: isDark ? '#1f1f1f' : '#fafafa',
          marginTop: '16px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Add Additional Credentials</div>
            <div style={{ color: mutedTextColor, fontSize: '13px' }}>
              Add extra AAP credentials during bootstrap.
            </div>
          </div>
          <Button variant="secondary" onClick={addAapCredential}>Add Credential</Button>
        </div>

        {credentials.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <Tabs activeKey={activeCredentialTab} onSelect={(_, key) => setActiveAapCredentialTab(key)}>
              {credentials.map((credential, index) => (
                <Tab
                  key={credentialTabKey(credential, index)}
                  eventKey={credentialTabKey(credential, index)}
                  title={credential.name || `Credential ${index + 1}`}
                />
              ))}
            </Tabs>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          {selectedCredentialIndex >= 0 ? (
            renderAapCredentialFields(credentials[selectedCredentialIndex], selectedCredentialIndex)
          ) : (
            <div style={{ color: mutedTextColor, fontSize: '13px' }}>
              No additional credentials added.
            </div>
          )}
        </div>
      </div>
    );
  };

  const satelliteHelp = {
    hostname: 'Satellite server hostname or URL. Example: sat.server.lab or https://sat.server.lab. Hostnames are normalized to https:// for generated Satellite config.',
    organization: 'Satellite organization used for activation keys, content, and inventory. Example: Lab.',
    activationKey: 'Activation key used when registering RHEL hosts to Satellite. Example: rhel-9.',
    deploymentVersion: 'Satellite deployment version used for install and repository labels. Example: 6.19.',
    location: 'Logical location where the Satellite server is installed. Example: AWS, datacenter1, or lab.',
    rhnOrgId: 'Red Hat account organization ID from Hybrid Cloud Console. Example: 12345678.',
    rhnActivationKey: 'RHN activation key from Hybrid Cloud Console for registering the Satellite host. Stored in generated vault files.',
    manifestFile: 'Upload the Red Hat Satellite manifest ZIP from Hybrid Cloud Console. Bootstrap writes it to the generated repo files/ directory and passes that path to the Satellite install role.',
    sizeProfile: 'Sizing profile used for Satellite tuning and pre-check CPU/RAM values.',
    reqDirs: 'Logical volumes to create for Satellite data. Each row needs mount_point, lv_name, and lv_size.',
    serviceAccountUsername: 'Satellite service account username for API and inventory operations. Example: svc_aap_satellite.',
    serviceAccountPassword: 'Password for the Satellite service account. Stored in generated vault files.',
    adminPassword: 'Optional Satellite admin password for bootstrap tasks that still require admin access. Stored in generated vault files.',
    dynamicInventory: 'Creates an AAP inventory source that reads hosts from Satellite 6 and attaches it to the organization RHEL inventory, such as ADO-RHEL-Inventory.',
    credentialName: 'AAP credential name for the Satellite service account. Example: ADO Satellite Service Account.',
    inventorySourceName: 'AAP inventory source name shown under the organization RHEL inventory sources. Example: ADO Satellite Dynamic Inventory under ADO-RHEL-Inventory.',
    inventoryHostFilter: 'Optional Satellite search filter. Example: hostgroup = RHEL9 or organization = Lab.',
    updateCacheTimeout: 'Seconds to reuse cached inventory data before refreshing. Example: 0 disables cache reuse.',
    inventoryVerbosity: 'Inventory source sync verbosity from 0 to 5.',
    overwriteHosts: 'Allow the inventory sync to update existing hosts in the AAP inventory.',
    overwriteVars: 'Allow the inventory sync to update variables on existing AAP hosts.',
    updateOnLaunch: 'Run a Satellite inventory sync automatically when a job using this inventory launches.',
    skipTls: 'Disable Satellite certificate validation for self-signed or lab certificates.',
    oidc: 'Create Keycloak client ado-satellite in realm rhlab and enable Satellite external login (OIDC). Uses the existing RHBK client role.',
    oidcKeycloakUrl: 'Keycloak base URL. Example: https://keycloak.apps.ocp.prod.rhlab',
    oidcRealm: 'Existing Keycloak realm. Lab default: rhlab.',
    oidcClientId: 'Confidential OIDC client id created in Keycloak. Lab default: ado-satellite.',
    oidcIssuer: 'OIDC issuer URL. Example: https://keycloak.apps.ocp.prod.rhlab/realms/rhlab',
    oidcClientSecret: 'Optional. Leave empty to fetch the client secret from Keycloak after create.',
    oidcAdminUser: 'Keycloak admin user used by infra.ado.rhbk_client. Example: admin.',
    oidcAdminPassword: 'Keycloak admin password. Stored in generated vault files.',
    oidcCreateClient: 'Create or update the Keycloak client before configuring Satellite.'
  };

  const setSatelliteReqDir = (index, key, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const rows = copy.component_config.satellite.req_dirs || [];
      rows[index] = { ...(rows[index] || {}), [key]: value };
      copy.component_config.satellite.req_dirs = rows;
      return copy;
    });
  };

  const addSatelliteReqDir = () => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.component_config.satellite.req_dirs = [
        ...(copy.component_config.satellite.req_dirs || []),
        { mount_point: '', lv_name: '', lv_size: '' }
      ];
      return copy;
    });
  };

  const removeSatelliteReqDir = index => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.component_config.satellite.req_dirs = (copy.component_config.satellite.req_dirs || [])
        .filter((_, rowIndex) => rowIndex !== index);
      return copy;
    });
  };

  const applyRhbkStandaloneZip = (filename, uploadPath) => {
    setRhbkZipError('');
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_config) copy.component_config = {};
      if (!copy.component_config.rhbk) copy.component_config.rhbk = {};
      copy.component_config.rhbk.standalone_zip_file = filename || '';
      copy.component_config.rhbk.standalone_zip_upload_path = uploadPath || '';
      copy.component_config.rhbk.standalone_zip = filename ? `files/${filename}` : '';
      return copy;
    });
  };

  const uploadRhbkStandaloneZip = async file => {
    if (!file) return;
    setRhbkZipUploading(true);
    try {
      const response = await fetch('/api/rhbk-standalone-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Filename': file.name
        },
        body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Upload failed (${response.status})`);
      }
      applyRhbkStandaloneZip(result.filename, result.upload_path);
    } catch (err) {
      applyRhbkStandaloneZip('', '');
      setRhbkZipError(err.message || 'Could not stage the RHBK zip');
    } finally {
      setRhbkZipUploading(false);
    }
  };

  const clearRhbkStandaloneZip = async () => {
    const uploadPath = data.component_config?.rhbk?.standalone_zip_upload_path;
    if (uploadPath) {
      try {
        await fetch('/api/rhbk-standalone-zip', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_path: uploadPath })
        });
      } catch {
        // Clearing the form still proceeds if the staged file is already gone.
      }
    }
    applyRhbkStandaloneZip('', '');
  };

  const setSatelliteManifest = file => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const content = result.includes(',') ? result.split(',').pop() : result;

      setData(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        if (!copy.component_config) copy.component_config = {};
        if (!copy.component_config.satellite) {
          copy.component_config.satellite = defaultComponentConfig('satellite');
        }
        copy.component_config.satellite.manifest_file = file.name;
        copy.component_config.satellite.manifest_content_base64 = content;
        copy.component_config.satellite.manifest_encoding = 'base64';
        copy.component_config.satellite.manifest_organization =
          copy.component_config.satellite.manifest_organization ||
          copy.component_config.satellite.organization ||
          '';
        return copy;
      });
    };
    reader.readAsDataURL(file);
  };

  const clearSatelliteManifest = () => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_config) copy.component_config = {};
      if (!copy.component_config.satellite) {
        copy.component_config.satellite = defaultComponentConfig('satellite');
      }
      copy.component_config.satellite.manifest_file = '';
      copy.component_config.satellite.manifest_content_base64 = '';
      copy.component_config.satellite.manifest_encoding = 'base64';
      copy.component_config.satellite.manifest_organization = '';
      return copy;
    });
  };

  const renderSatelliteConfig = () => {
    const sat = data.component_config?.satellite || defaultComponentConfig('satellite');
    const selected = data.component_options?.satellite || [];
    const showClient = selected.includes('satellite_client_tools');
    const showServer = selected.includes('satellite_server_install')
      || selected.includes('satellite_capsule_install')
      || selected.includes('satellite_content_view');
    const showDynamicInventory = showClient || selected.includes('satellite_dynamic_inventory');
    const showOidc = selected.includes('satellite_oidc');
    const showAny = showClient || showServer || showDynamicInventory || showOidc;
    const sectionTitle = label => (
      <GridItem span={12}>
        <div style={{ fontWeight: 700, marginTop: '8px', marginBottom: '4px' }}>{label}</div>
      </GridItem>
    );
    return (
    <>
      {renderComponentOptions('satellite', 'Satellite Options', 'Select which Satellite resources to configure.')}
      {!showAny && <p style={{ color: mutedTextColor }}>Select Satellite client and/or server options to show the matching fields.</p>}
      {(showClient || showServer || showDynamicInventory || showOidc) && (
        <Button variant="link" onClick={() => setShowSatelliteSecrets(!showSatelliteSecrets)}>
          {showSatelliteSecrets ? 'Hide Service Account' : 'Show Service Account'}
        </Button>
      )}
      <br /><br />
      <Grid hasGutter>
        {showClient && showServer && sectionTitle('Client configuration')}
        {showClient && (
          <>
            {renderTextField('Hostname / URL', 'component_config.satellite.hostname', 'text', satelliteHelp.hostname)}
            {renderTextField('Organization', 'component_config.satellite.organization', 'text', satelliteHelp.organization)}
            {renderTextField('Activation Key', 'component_config.satellite.activation_key', 'text', satelliteHelp.activationKey)}
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('TLS Certificate Verification', satelliteHelp.skipTls)}>
                <Checkbox
                  id="satellite-skip-tls-verify-client"
                  label="Skip TLS certificate verification for self-signed certificates"
                  isChecked={!sat.validate_certs}
                  onChange={(_, v) => set('component_config.satellite.validate_certs', !v)}
                />
              </FormGroup>
            </GridItem>
          </>
        )}

        {showServer && showClient && sectionTitle('Server configuration')}
        {showServer && !showClient && (
          <>
            {renderTextField('Hostname / URL', 'component_config.satellite.hostname', 'text', satelliteHelp.hostname)}
            {renderTextField('Organization', 'component_config.satellite.organization', 'text', satelliteHelp.organization)}
          </>
        )}
        {showOidc && !showClient && !showServer && (
          <>
            {renderTextField('Hostname / URL', 'component_config.satellite.hostname', 'text', satelliteHelp.hostname)}
            {renderTextField('Organization', 'component_config.satellite.organization', 'text', satelliteHelp.organization)}
          </>
        )}
        {showServer && (
          <>
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('Satellite Deployment Version', satelliteHelp.deploymentVersion)}>
                <select
                  value={sat.deployment_version || '6.19'}
                  onChange={e => set('component_config.satellite.deployment_version', e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                >
                  <option value="6.17">6.17</option>
                  <option value="6.18">6.18</option>
                  <option value="6.19">6.19</option>
                </select>
              </FormGroup>
            </GridItem>
            {renderTextField('Satellite Install Location', 'component_config.satellite.location', 'text', satelliteHelp.location)}
            {renderTextField('RHN Organization ID', 'component_config.satellite.rhn_org_id', 'text', satelliteHelp.rhnOrgId)}
            {renderTextField('RHN Activation Key', 'component_config.satellite.admin_rhn_activation_key', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.rhnActivationKey)}
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('Satellite Manifest File', satelliteHelp.manifestFile)}>
                <input
                  id="satellite-manifest-file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={event => {
                    setSatelliteManifest(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  style={{ display: 'block', marginBottom: '8px' }}
                />
                <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                  {sat.manifest_file
                    ? `Selected: ${sat.manifest_file}. Generated repo path: files/${sat.manifest_file}.`
                    : 'Upload a Red Hat Satellite manifest ZIP. It will be written to the generated repo files/ directory.'}
                </div>
                {sat.manifest_file && (
                  <Button variant="link" onClick={clearSatelliteManifest}>Clear Manifest</Button>
                )}
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('Satellite Size Profile', satelliteHelp.sizeProfile)}>
                <select
                  value={sat.size_profile || 'default'}
                  onChange={e => set('component_config.satellite.size_profile', e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                >
                  {(sat.size || []).map(profile => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name} ({profile.min_hosts}-{profile.max_hosts} hosts, {profile.min_ram}GB RAM, {profile.min_cpu} CPU)
                    </option>
                  ))}
                </select>
              </FormGroup>
            </GridItem>
            {renderTextField('Admin Password', 'component_config.satellite.admin_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.adminPassword)}
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('Satellite Storage Mounts', satelliteHelp.reqDirs)}>
                {(sat.req_dirs || []).map((row, index) => (
                  <Grid hasGutter key={`satellite-req-dir-${index}`} style={{ marginBottom: '8px' }}>
                    <GridItem span={4}>
                      <TextInput
                        value={row.mount_point || ''}
                        onChange={(_, v) => setSatelliteReqDir(index, 'mount_point', v)}
                        aria-label={`Satellite mount point ${index + 1}`}
                        placeholder="/var/lib/pulp"
                      />
                    </GridItem>
                    <GridItem span={3}>
                      <TextInput
                        value={row.lv_name || ''}
                        onChange={(_, v) => setSatelliteReqDir(index, 'lv_name', v)}
                        aria-label={`Satellite logical volume ${index + 1}`}
                        placeholder="lv_rhspulp"
                      />
                    </GridItem>
                    <GridItem span={3}>
                      <TextInput
                        value={row.lv_size || ''}
                        onChange={(_, v) => setSatelliteReqDir(index, 'lv_size', v)}
                        aria-label={`Satellite logical volume size ${index + 1}`}
                        placeholder="300g"
                      />
                    </GridItem>
                    <GridItem span={2}>
                      <Button variant="link" onClick={() => removeSatelliteReqDir(index)}>Remove</Button>
                    </GridItem>
                  </Grid>
                ))}
                <Button variant="secondary" onClick={addSatelliteReqDir}>Add Mount</Button>
              </FormGroup>
            </GridItem>
            {!showClient && (
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('TLS Certificate Verification', satelliteHelp.skipTls)}>
                  <Checkbox
                    id="satellite-skip-tls-verify-server"
                    label="Skip TLS certificate verification for self-signed certificates"
                    isChecked={!sat.validate_certs}
                    onChange={(_, v) => set('component_config.satellite.validate_certs', !v)}
                  />
                </FormGroup>
              </GridItem>
            )}
          </>
        )}

        {showDynamicInventory && (
          <>
            {(showClient || showServer) && sectionTitle('Dynamic inventory')}
            {renderTextField('Service Account Username', 'component_config.satellite.service_account_username', 'text', satelliteHelp.serviceAccountUsername)}
            {renderTextField('Service Account Password', 'component_config.satellite.service_account_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.serviceAccountPassword)}
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('Satellite Dynamic Inventory', satelliteHelp.dynamicInventory)}>
                <Checkbox
                  id="satellite-dynamic-inventory"
                  label="Create AAP Satellite inventory source"
                  isChecked={!!sat.dynamic_inventory_enabled}
                  onChange={(_, v) => set('component_config.satellite.dynamic_inventory_enabled', v)}
                />
                <div style={{ color: '#6a6e73', fontSize: '13px', marginTop: '6px' }}>
                  Created as an inventory source under {data.aap.organization || 'ADO'}-RHEL-Inventory, not as a separate top-level inventory.
                </div>
              </FormGroup>
            </GridItem>
            {!!sat.dynamic_inventory_enabled && (
              <>
                {renderTextField('Satellite Credential Name', 'component_config.satellite.credential_name', 'text', satelliteHelp.credentialName)}
                {renderTextField('Inventory Source Name', 'component_config.satellite.inventory_source_name', 'text', satelliteHelp.inventorySourceName)}
                {renderTextField('Inventory Host Filter', 'component_config.satellite.inventory_host_filter', 'text', satelliteHelp.inventoryHostFilter)}
                {renderTextField('Update Cache Timeout', 'component_config.satellite.inventory_update_cache_timeout', 'number', satelliteHelp.updateCacheTimeout)}
                {renderTextField('Inventory Verbosity', 'component_config.satellite.inventory_verbosity', 'number', satelliteHelp.inventoryVerbosity)}
                <GridItem span={4}>
                  <FormGroup label={labelWithHelp('Overwrite Hosts', satelliteHelp.overwriteHosts)}>
                    <Checkbox
                      id="satellite-inventory-overwrite"
                      label="Overwrite"
                      isChecked={sat.inventory_overwrite}
                      onChange={(_, v) => set('component_config.satellite.inventory_overwrite', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup label={labelWithHelp('Overwrite Vars', satelliteHelp.overwriteVars)}>
                    <Checkbox
                      id="satellite-inventory-overwrite-vars"
                      label="Overwrite variables"
                      isChecked={sat.inventory_overwrite_vars}
                      onChange={(_, v) => set('component_config.satellite.inventory_overwrite_vars', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup label={labelWithHelp('Update On Launch', satelliteHelp.updateOnLaunch)}>
                    <Checkbox
                      id="satellite-inventory-update-on-launch"
                      label="Update on launch"
                      isChecked={sat.inventory_update_on_launch}
                      onChange={(_, v) => set('component_config.satellite.inventory_update_on_launch', v)}
                    />
                  </FormGroup>
                </GridItem>
              </>
            )}
          </>
        )}

        {showOidc && (
          <>
            {sectionTitle('Keycloak / OIDC')}
            <GridItem span={12}>
              <p style={{ color: mutedTextColor, marginTop: 0 }}>
                Creates confidential client <code>ado-satellite</code> in existing realm <code>rhlab</code>
                using <code>infra.ado.rhbk_client</code>, then enables Satellite external login.
              </p>
            </GridItem>
            {renderTextField('Keycloak URL', 'component_config.satellite.oidc.keycloak_url', 'text', satelliteHelp.oidcKeycloakUrl)}
            {renderTextField('Realm', 'component_config.satellite.oidc.realm', 'text', satelliteHelp.oidcRealm)}
            {renderTextField('Client ID', 'component_config.satellite.oidc.client_id', 'text', satelliteHelp.oidcClientId)}
            {renderTextField('Issuer URL', 'component_config.satellite.oidc.issuer', 'text', satelliteHelp.oidcIssuer)}
            {renderTextField('Client secret (optional)', 'component_config.satellite.oidc.client_secret', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.oidcClientSecret)}
            {renderTextField('Keycloak admin user', 'component_config.satellite.oidc.admin_user', 'text', satelliteHelp.oidcAdminUser)}
            {renderTextField('Keycloak admin password', 'component_config.satellite.oidc.admin_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.oidcAdminPassword)}
            {!showServer && renderTextField('Satellite admin password', 'component_config.satellite.admin_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.adminPassword)}
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('Create Keycloak client', satelliteHelp.oidcCreateClient)}>
                <Checkbox
                  id="satellite-oidc-create-client"
                  label="Create or update Keycloak client ado-satellite"
                  isChecked={sat.oidc?.create_client !== false}
                  onChange={(_, v) => set('component_config.satellite.oidc.create_client', v)}
                />
              </FormGroup>
            </GridItem>
          </>
        )}
      </Grid>
    </>
  );
  };

  const renderIdmConfig = () => {
    const idm = data.component_config?.idm || defaultComponentConfig('idm');
    const selected = data.component_options?.idm || [];
    const showClient = selected.includes('idm_client_tools');
    const showServer = selected.includes('idm_server_install') || selected.includes('idm_replica_install');
    const showReplica = selected.includes('idm_replica_install');
    const showDns = selected.includes('idm_dns_install');
    const showCustomCert = selected.includes('idm_custom_cert');
    const showAdTrust = selected.includes('idm_ad_trust_install');
    const showHostname = showClient || showServer || showAdTrust;
    const showIdmAdminSecret = showServer || showAdTrust;

    return (
      <>
        {renderComponentOptions('idm', 'IDM Options', 'Select which IDM resources to configure.')}

        <Button variant="link" onClick={() => setShowIdmSecrets(!showIdmSecrets)}>
          {showIdmSecrets ? 'Hide Secrets' : 'Show Secrets'}
        </Button>
        <br /><br />
        {!(showHostname || showDns || showCustomCert || showAdTrust) && (
          <p style={{ color: mutedTextColor }}>Select IDM client, server, DNS, cert, and/or AD Trust options to show the matching fields.</p>
        )}
        <Grid hasGutter>
          {showClient && showServer && (
            <GridItem span={12}><div style={{ fontWeight: 700 }}>Client configuration</div></GridItem>
          )}
          {showHostname && renderTextField('Hostname', 'component_config.idm.hostname', 'text', idmHelp.hostname)}
          {showClient && !showServer && <GridItem span={12}><p style={{ color: mutedTextColor }}>Client install uses the IPA hostname above plus enrollment secrets from vault/bootstrap.</p></GridItem>}
          {showServer && showClient && (
            <GridItem span={12}><div style={{ fontWeight: 700, marginTop: '8px' }}>Server / replica configuration</div></GridItem>
          )}
          {showServer && renderTextField('Domain', 'component_config.idm.domain', 'text', idmHelp.domain)}
          {showServer && renderTextField('Realm', 'component_config.idm.realm', 'text', idmHelp.realm)}
          {showReplica && renderTextField('IPA Replica Hostname', 'component_config.idm.replica_hostname', 'text', idmHelp.replicaHostname)}
          {showReplica && (
            <>
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Replica DNS', idmHelp.replicaDns)}>
                  <Checkbox
                    id="idm-replica-install-dns"
                    label="Install DNS on replica"
                    isChecked={idm.replica_install_dns}
                    onChange={(_, v) => set('component_config.idm.replica_install_dns', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Replica Certificate Services', idmHelp.replicaCa)}>
                  <Checkbox
                    id="idm-replica-install-ca"
                    label="Install certificate services on replica"
                    isChecked={idm.replica_install_ca}
                    onChange={(_, v) => set('component_config.idm.replica_install_ca', v)}
                  />
                </FormGroup>
              </GridItem>
            </>
          )}
          {showDns && (
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('DNS Forwarders', idmHelp.dnsForwarders)}>
                <Checkbox
                  id="idm-auto-forwarders"
                  label="Configure auto forwarders"
                  isChecked={idm.auto_forwarders}
                  onChange={(_, v) => set('component_config.idm.auto_forwarders', v)}
                />
              </FormGroup>
            </GridItem>
          )}
          {showCustomCert && (
            <>
              {renderTextField('Custom Certificate File', 'component_config.idm.custom_cert_file', 'text', idmHelp.customCertFile)}
              {renderTextField('Custom Certificate Key File', 'component_config.idm.custom_cert_key_file', 'text', idmHelp.customCertKeyFile)}
              {renderTextField('Custom Certificate Chain File', 'component_config.idm.custom_cert_chain_file', 'text', idmHelp.customCertChainFile)}
            </>
          )}
          {showAdTrust && (
            <>
              <GridItem span={12}>
                <div style={{ fontWeight: 700, marginTop: '8px' }}>Active Directory trust</div>
                <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: 0 }}>
                  Creates a two-way IdM↔AD trust. On AD DNS, add a conditional forwarder for the IdM domain
                  (for example <code>dev.rhlab</code> → IdM IP) before or after running the job.
                </p>
              </GridItem>
              {renderTextField('AD Domain', 'component_config.idm.ad_domain', 'text', idmHelp.adDomain)}
              {renderTextField('AD DC Hostname', 'component_config.idm.ad_dc_hostname', 'text', idmHelp.adDcHostname)}
              {renderTextField('AD DC IP', 'component_config.idm.ad_dc_ip', 'text', idmHelp.adDcIp)}
              {renderTextField('AD Admin User', 'component_config.idm.ad_admin', 'text', idmHelp.adAdmin)}
              {renderTextField('AD Admin Password', 'component_config.idm.ad_admin_password', showIdmSecrets ? 'text' : 'password', idmHelp.adAdminPassword)}
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Two-way trust', idmHelp.adTwoWay)}>
                  <Checkbox
                    id="idm-ad-two-way"
                    label="Establish two-way trust"
                    isChecked={idm.ad_two_way !== false}
                    onChange={(_, v) => set('component_config.idm.ad_two_way', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Map AD groups for SSH/sudo', idmHelp.adConfigureGroups)}>
                  <Checkbox
                    id="idm-ad-configure-groups"
                    label="Configure POSIX/external groups and sudo"
                    isChecked={idm.ad_configure_groups !== false}
                    onChange={(_, v) => set('component_config.idm.ad_configure_groups', v)}
                  />
                </FormGroup>
              </GridItem>
              {renderTextField('AD Users Group Map (optional)', 'component_config.idm.ad_map_group', 'text', idmHelp.adMapGroup)}
              {renderTextField('AD Admins Group Map (optional)', 'component_config.idm.ad_map_admins_group', 'text', idmHelp.adMapAdminsGroup)}
            </>
          )}
          {showIdmAdminSecret && renderTextField('Admin Password', 'component_config.idm.admin_password', showIdmSecrets ? 'text' : 'password', idmHelp.adminPassword)}
          {showServer && renderTextField('Directory Manager Password', 'component_config.idm.directory_manager_password', showIdmSecrets ? 'text' : 'password', idmHelp.directoryManagerPassword)}
        </Grid>
      </>
    );
  };

    const toggleComponentOption = (component, option) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const current = copy.component_options?.[component] || [];
      const next = current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option];
      copy.component_options = {
        ...(copy.component_options || {}),
        [component]: next
      };
      if (!copy.component_config) copy.component_config = {};
      if (['satellite', 'idm', 'grafana', 'gitlab', 'rhbk'].includes(component)) {
        copy.component_config[component] = deepMerge(
          defaultComponentConfig(component),
          copy.component_config[component] || {}
        );
      }
      if (component === 'satellite' && option === 'satellite_dynamic_inventory') {
        copy.component_config.satellite.dynamic_inventory_enabled = next.includes('satellite_dynamic_inventory');
      }
      return copy;
    });
  };


  const setAllComponentOptions = (component, enabled) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_options) copy.component_options = {};
      copy.component_options[component] = enabled ? [...(componentOptionDefaults[component] || [])] : [];
      if (enabled && ['satellite', 'idm', 'grafana', 'gitlab', 'rhbk'].includes(component)) {
        if (!copy.component_config) copy.component_config = {};
        copy.component_config[component] = deepMerge(
          defaultComponentConfig(component),
          copy.component_config[component] || {}
        );
      }
      if (component === 'satellite') {
        copy.component_config = copy.component_config || {};
        copy.component_config.satellite = deepMerge(
          defaultComponentConfig('satellite'),
          copy.component_config.satellite || {}
        );
        copy.component_config.satellite.dynamic_inventory_enabled =
          copy.component_options.satellite.includes('satellite_dynamic_inventory');
      }
      return copy;
    });
  };

  const renderComponentOptions = (component, title, description) => {
    const options = componentOptionDefaults[component] || [];
    if (options.length === 0) return null;

    const selected = data.component_options?.[component] || [];
    const allSelected = options.length > 0 && options.every(option => selected.includes(option));

    return (
      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          background: isDark ? '#1f1f1f' : '#fafafa'
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{title}</div>
        <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '10px' }}>
          {description}
        </div>

        <Checkbox
          label={`All ${title}`}
          isChecked={allSelected}
          onChange={(_, v) => setAllComponentOptions(component, v)}
        />

        <br />

        <Grid hasGutter>
          {options.map(option => (
            <GridItem key={option} span={4}>
              <Checkbox
                label={componentOptionLabels[option] || option}
                isChecked={selected.includes(option)}
                onChange={() => toggleComponentOption(component, option)}
              />
            </GridItem>
          ))}
        </Grid>
      </div>
    );
  };

  const getGroupApps = group => {
    if (group === 'openshift') return openshiftApps;
    if (group === 'rhel') return rhelApps;
    if (group === 'patching') return patchingApps;
    if (group === 'aws') return awsApps;
    if (group === 'provision') return provisionApps;
    return [];
  };

  const getGroupTitle = group => {
    if (group === 'openshift') return 'OpenShift Applications';
    if (group === 'rhel') return 'RHEL Components';
    if (group === 'patching') return 'Patching Options';
    if (group === 'aws') return 'AWS Applications';
    if (group === 'provision') return 'Provisioning Options';
    return group;
  };

  const renderGroupComponentOptions = (group, title = null, description = null) => {
    const apps = getGroupApps(group);
    const selected = data.component_apps?.[group] || [];
    const allSelected = apps.length > 0 && apps.every(app => selected.includes(app));

    return (
      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          background: isDark ? '#1f1f1f' : '#fafafa'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              {title || getGroupTitle(group)}
            </div>
            <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '10px' }}>
              {description || `Select which ${getGroupTitle(group)} to include.`}
            </div>
          </div>

          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              color: isDark ? '#73bcf7' : '#0066cc',
              background: isDark ? '#262626' : '#eef5ff',
              whiteSpace: 'nowrap'
            }}
          >
            {selected.length} selected
          </span>
        </div>

        <Checkbox
          label={`All ${title || getGroupTitle(group)}`}
          isChecked={allSelected}
          onChange={(_, v) => {
            setData(prev => {
              const copy = JSON.parse(JSON.stringify(prev));
              if (!copy.component_apps) copy.component_apps = {};
              copy.component_apps[group] = v ? [...apps] : [];

              if (group === 'aws') {
                if (!copy.component_options) copy.component_options = {};
                copy.component_options.aws = v ? [...apps] : [];
              }

              let nextComponents = [...(copy.components || [])].filter(c => c !== 'all');

              if (v) {
                apps.forEach(app => {
                  if (simpleComponents.includes(app) && !nextComponents.includes(app)) {
                    nextComponents.push(app);
                  }
                });
              } else {
                apps.forEach(app => {
                  const selectedSomewhereElse = appSelectedInAnyGroup(copy.component_apps, app, group);
                  if (simpleComponents.includes(app) && !selectedSomewhereElse) {
                    nextComponents = nextComponents.filter(c => c !== app);
                  }
                });
              }

              if (nextComponents.length === 0) nextComponents = ['all'];

              copy.components = nextComponents;
              copy.component = nextComponents.includes('all') ? 'all' : nextComponents[0];

              return copy;
            });
          }}
        />

        <br />

        <Grid hasGutter>
          {apps.map(app => (
            <GridItem key={app} span={4}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Checkbox
                  label=""
                  isChecked={selected.includes(app)}
                  onChange={() => toggleComponentApp(group, app)}
                />
                {renderComponentLabel(app, componentOptionLabels[app] || app)}
              </div>
            </GridItem>
          ))}
        </Grid>
      </div>
    );
  };

  const renderOpenShiftGroupConfig = () => (
    <>
      {renderGroupComponentOptions(
        'openshift',
        'OpenShift Applications',
        'Select which OpenShift applications and platform services to include.'
      )}

      {renderComponentOptions(
        'openshift',
        'OpenShift Options',
        'Select optional OpenShift configuration to include.'
      )}

      <br />

      {renderOpenShiftIntegration()}
    </>
  );

  const renderPatchingConfig = () => {
    const patchingConfig = {
      ...defaults.component_config.patching,
      ...(data.component_config?.patching || {})
    };
    const useExistingInventory = patchingConfig.inventory_mode === 'existing';
    const defaultInventoryName = `${data.aap?.organization || 'ADO'}-RHEL-Inventory`;

    return (
      <>
        {renderGroupComponentOptions(
          'patching',
          'Patching Options',
          'Select which patching-related components to include.'
        )}

        <div
          style={{
            marginTop: '18px',
            padding: '14px',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            background: isDark ? '#1f1f1f' : '#fafafa'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            Managed Host Inventory
          </div>
          <div style={{ color: mutedTextColor, marginBottom: '14px' }}>
            Patching job templates (Register Host, Patch Host, compliance, STIG, IdM client)
            need a managed-host inventory. Create one during bootstrap, or reuse an inventory
            that already exists in AAP.
          </div>

          <FormGroup
            label={labelWithHelp('Inventory source', patchingHelp.inventoryMode)}
            isInline
            style={{ marginBottom: '14px' }}
          >
            <Radio
              id="patching-inventory-create"
              name="patching-inventory-mode"
              label={`Create ${defaultInventoryName}`}
              description="Bootstrap creates the inventory and optional static hosts below."
              isChecked={!useExistingInventory}
              onChange={() => set('component_config.patching.inventory_mode', 'create')}
            />
            <Radio
              id="patching-inventory-existing"
              name="patching-inventory-mode"
              label="Use existing AAP inventory"
              description="Point job templates at an inventory that already exists. Hosts are not created."
              isChecked={useExistingInventory}
              onChange={() => set('component_config.patching.inventory_mode', 'existing')}
            />
          </FormGroup>

          <Grid hasGutter>
            {useExistingInventory ? (
              renderTextField(
                'Existing Inventory Name',
                'component_config.patching.inventory_name',
                'text',
                patchingHelp.inventoryName
              )
            ) : (
              <>
                {renderTextField('Hostname', 'component_config.patching.hostname', 'text', patchingHelp.hostname)}
                <GridItem span={12}>
                  <FormGroup label={labelWithHelp('Additional Hosts', patchingHelp.hosts)}>
                    <textarea
                      value={(patchingConfig.hosts || []).join('\n')}
                      onChange={e => set(
                        'component_config.patching.hosts',
                        e.target.value.split('\n').map(v => v.trim()).filter(Boolean)
                      )}
                      rows={4}
                      spellCheck="false"
                      style={{
                        width: '100%',
                        background: fieldBg,
                        color: fieldColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        padding: '8px'
                      }}
                    />
                  </FormGroup>
                </GridItem>
              </>
            )}
          </Grid>
        </div>
      </>
    );
  };

  const renderAwsConfig = () => {
    const ec2AmiCopySelected = (data.component_apps?.aws || []).includes('ec2_ami_copy');

    return (
      <>
        {renderGroupComponentOptions(
          'aws',
          'AWS Applications',
          'Select which AWS bootstrap jobs to include.'
        )}

        <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '8px', marginBottom: '8px' }}>
          Select <code>ec2_ami_copy</code> to scaffold the playbook and AAP job template{' '}
          <code>{(data.aap?.organization || 'ADO')} | Copy AMI between AWS regions</code>.
          Source region, destination region, AMI ID, and other run-time options are collected
          from the job template <strong>survey</strong> when an operator launches the job in AAP
          (same pattern as patching job surveys).
        </div>

        {ec2AmiCopySelected && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            background: isDark ? '#1f1f1f' : '#fafafa'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            Copy AMI job template survey
          </div>
          <div style={{ color: mutedTextColor, fontSize: '13px' }}>
            Bootstrap seeds <code>vars_ec2_ami_copy.yml</code> with role defaults. Operators set
            <code>ec2_ami_copy_source_region</code>, <code>ec2_ami_copy_dest_region</code>,
            <code>ec2_ami_copy_source_image_id</code>, and optional name/wait fields in the
            survey when launching the job.
          </div>
        </div>
        )}

        <div
          style={{
            marginTop: '18px',
            padding: '14px',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            background: isDark ? '#1f1f1f' : '#fafafa'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            Shared AWS Credentials
          </div>
          <div style={{ color: mutedTextColor, marginBottom: '14px' }}>
            Optional bootstrap values for <code>vault_aws.yml</code> and <code>vars_aws.yml</code>.
            Required for the Copy AMI job (and other AWS jobs) to authenticate at run time.
          </div>
          <Grid hasGutter>
            {renderTextField('AWS Profile (optional)', 'component_config.aws.profile', 'text', awsHelp.profile)}
            {renderTextField('Default Region', 'component_config.aws.default_region', 'text', awsHelp.defaultRegion)}
            <GridItem span={12}>
              <Checkbox
                id="show-aws-secrets"
                label="Show AWS credential fields"
                isChecked={showAwsSecrets}
                onChange={(_, v) => setShowAwsSecrets(v)}
              />
            </GridItem>
            {renderTextField(
              'Access Key ID',
              'component_config.aws.access_key_id',
              showAwsSecrets ? 'text' : 'password',
              awsHelp.accessKeyId
            )}
            {renderTextField(
              'Secret Access Key',
              'component_config.aws.secret_access_key',
              showAwsSecrets ? 'text' : 'password',
              awsHelp.secretAccessKey
            )}
            {renderTextField(
              'Session Token (optional)',
              'component_config.aws.session_token',
              showAwsSecrets ? 'text' : 'password',
              awsHelp.sessionToken
            )}
          </Grid>
        </div>
      </>
    );
  };

  const renderProvisionConfig = () => {
    const openshiftVirtConfig = {
      ...defaults.component_config.openshift_virt,
      ...(data.component_config?.openshift_virt || {})
    };

    return (
      <>
        {renderGroupComponentOptions(
          'provision',
          'Provisioning Options',
          'Select which provisioning targets to include.'
        )}

        <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '8px', marginBottom: '8px' }}>
          Select <code>openshift_virt</code> to create the AAP job template{' '}
          <code>{(data.aap?.organization || 'ADO')} | Provision OpenShift Virt VM</code>.
          Search AAP for <code>Provision OpenShift Virt</code> (avoid a trailing <code>|</code> in the filter).
        </div>

        {(data.component_apps?.provision || []).includes('openshift_virt') && (
        <div
          style={{
            marginTop: '18px',
            padding: '14px',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            background: isDark ? '#1f1f1f' : '#fafafa'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            OpenShift Virtualization VM
          </div>
          <div style={{ color: mutedTextColor, marginBottom: '14px' }}>
            Creates a standalone VM from an OpenShift Virtualization boot image. This does not install Satellite automatically.
          </div>
          <Grid hasGutter>
            {renderTextField('OpenShift API Host', 'component_config.openshift_virt.api_host', 'text', openshiftVirtHelp.apiHost)}
            <GridItem span={6}>
              <FormGroup label={labelWithHelp('TLS Certificate Verification', openshiftVirtHelp.skipTls)}>
                <Checkbox
                  id="openshift-virt-skip-tls-verify"
                  label="Skip TLS certificate verification for self-signed certificates"
                  isChecked={openshiftVirtConfig.skip_tls_verify}
                  onChange={(_, v) => set('component_config.openshift_virt.skip_tls_verify', v)}
                />
              </FormGroup>
            </GridItem>
            {renderTextAreaField('OpenShift API Token', 'component_config.openshift_virt.api_token', openshiftVirtHelp.apiToken, 3)}
            {renderTextAreaField('SSH Public Key', 'component_config.openshift_virt.ssh_public_key', openshiftVirtHelp.sshPublicKey, 3)}
          </Grid>
        </div>
        )}
      </>
    );
  };

  const renderAllConfig = () => (
    <div
      style={{
        padding: '14px',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        background: isDark ? '#1f1f1f' : '#fafafa'
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '8px' }}>
        All Bootstrap Options Selected
      </div>

      <div style={{ color: mutedTextColor, marginBottom: '12px' }}>
        Use the tabs above to review or customize each generated component group.
      </div>

      <Grid hasGutter>
        {[
          'OpenShift',
          'RHEL',
          'Patching',
          'AWS',
          'Provision',
          'Grafana',
          'RHBK (Keycloak)',
          'Satellite',
          'IDM',
          'Kafka',
          'GitLab',
          'PEGA',
          'AAP',
          'Compliance',
          'STIG'
        ].map(item => (
          <GridItem key={item} span={3}>
            ✓ {item}
          </GridItem>
        ))}
      </Grid>
    </div>
  );

  const renderRhelConfig = () => (
    <>
      {renderGroupComponentOptions(
        'rhel',
        'RHEL Components',
        'Select which RHEL components to include.'
      )}

      {renderComponentOptions('rhel', 'RHEL Options', 'Select which RHEL configuration to include.')}

      <Grid hasGutter>
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('Compliance Profile', rhelHelp.complianceProfile)}>
            <select
              value={data.component_config?.rhel?.compliance_profile || 'PCI-DSS'}
              onChange={e => set('component_config.rhel.compliance_profile', e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="PCI-DSS">PCI-DSS</option>
              <option value="NIST 800-53">NIST 800-53</option>
              <option value="CIS">CIS</option>
              <option value="STIG">STIG</option>
            </select>
          </FormGroup>
        </GridItem>

        <GridItem span={6}>
          <FormGroup label={labelWithHelp('STIG Profile', rhelHelp.stigProfile)}>
            <select
              value={data.component_config?.rhel?.stig_profile || 'RHEL 9 STIG'}
              onChange={e => set('component_config.rhel.stig_profile', e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="RHEL 8 STIG">RHEL 8 STIG</option>
              <option value="RHEL 9 STIG">RHEL 9 STIG</option>
            </select>
          </FormGroup>
        </GridItem>

        {renderTextField('Hostname', 'component_config.rhel.hostname', 'text', rhelHelp.hostname)}

        <GridItem span={12}>
          <FormGroup label={labelWithHelp('Additional RHEL Hosts', rhelHelp.hosts)}>
            <textarea
              value={(data.component_config?.rhel?.hosts || []).join('\n')}
              onChange={e => set('component_config.rhel.hosts', e.target.value.split('\n').map(v => v.trim()).filter(Boolean))}
              rows={4}
              spellCheck="false"
              style={{
                width: '100%',
                background: fieldBg,
                color: fieldColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                padding: '8px'
              }}
            />
          </FormGroup>
        </GridItem>
      </Grid>

    </>
  );

  const renderComplianceConfig = () => (
    <>
      {renderComponentOptions('compliance', 'Compliance Options', 'Select compliance baselines to include.')}
      <Grid hasGutter>
        {renderTextField('Profile', 'component_config.compliance.profile', 'text', complianceHelp.profile)}
      </Grid>
    </>
  );

  const renderStigConfig = () => (
    <>
      {renderComponentOptions('stig', 'STIG Options', 'Select STIG baselines to include.')}
      <Grid hasGutter>
        {renderTextField('Profile', 'component_config.stig.profile', 'text', stigHelp.profile)}
      </Grid>
    </>
  );

  const renderOpenShiftIntegration = () => {
    const certManagerSelected = (data.component_apps?.openshift || []).includes('cert_manager');
    const certMode = data.component_config?.cert_manager?.mode || 'cert';

    return (
    <>
      <p style={{ color: mutedTextColor }}>This section is opened by clicking <strong>openshift</strong>.</p>
      <Grid hasGutter>
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('OpenShift API Host', openshiftHelp.apiHost)}>
            <TextInput
              value={data.openshift.api_host}
              onChange={(_, v) => set('openshift.api_host', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={6}>
          <FormGroup label={labelWithHelp('OpenShift Apps Domain', openshiftHelp.appsDomain)}>
            <TextInput
              value={data.openshift.apps_domain}
              onChange={(_, v) => set('openshift.apps_domain', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={12}>
          <FormGroup label={labelWithHelp('OpenShift TLS Certificate Verification', openshiftHelp.skipTls)}>
            <Checkbox
              id="openshift-skip-tls-verify"
              label="Skip TLS certificate verification for self-signed certificates"
              isChecked={data.openshift.skip_tls_verify}
              onChange={(_, v) => set('openshift.skip_tls_verify', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={12}>
          <FormGroup label={labelWithHelp('OpenShift API Token', openshiftHelp.token)}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <TextInput
                type={showOpenShiftToken ? 'text' : 'password'}
                value={data.openshift.token}
                onChange={(_, v) => set('openshift.token', v)}
              />
              <Button variant="secondary" onClick={() => setShowOpenShiftToken(!showOpenShiftToken)}>
                {showOpenShiftToken ? 'Hide' : 'Show'}
              </Button>
            </div>
          </FormGroup>
        </GridItem>


        {certManagerSelected && (
          <>
            <GridItem span={12}>
              <FormGroup label={labelWithHelp('Cert-Manager Certificate Source', openshiftHelp.certSource)}>
                <Radio
                  label="Custom certificate"
                  name="cert-manager-mode"
                  isChecked={certMode === 'cert'}
                  onChange={() => set('component_config.cert_manager.mode', 'cert')}
                />
                <Radio
                  label="IdM ACME"
                  name="cert-manager-mode"
                  isChecked={certMode === 'idm_acme'}
                  onChange={() => set('component_config.cert_manager.mode', 'idm_acme')}
                />
                <Radio
                  label="AWS PCA"
                  name="cert-manager-mode"
                  isChecked={certMode === 'aws_pca'}
                  onChange={() => set('component_config.cert_manager.mode', 'aws_pca')}
                />
              </FormGroup>
            </GridItem>

            {certMode === 'cert' && (
              <>
                {renderTextAreaField('TLS Certificate', 'component_config.cert_manager.tls_crt', openshiftHelp.tlsCrt)}
                {renderTextAreaField('TLS Private Key', 'component_config.cert_manager.tls_key', openshiftHelp.tlsKey)}
              </>
            )}

            {certMode === 'idm_acme' && (
              <>
                {renderTextField('IdM ACME Directory URL', 'component_config.cert_manager.idm_acme_directory_url', 'text', openshiftHelp.idmAcmeDirectoryUrl)}
                {renderTextField('IdM CA Bundle File', 'component_config.cert_manager.idm_ca_bundle_file', 'text', openshiftHelp.idmCaBundleFile)}
              </>
            )}

            {certMode === 'aws_pca' && (
              <>
                {renderTextField('AWS PCA Namespace', 'component_config.cert_manager.awspca_namespace', 'text', openshiftHelp.awspcaNamespace)}
                {renderTextField('AWS PCA Secret Name', 'component_config.cert_manager.awspca_secret_name', 'text', openshiftHelp.awspcaSecretName)}
                {renderTextField('AWS PCA Issuer Name', 'component_config.cert_manager.awspca_issuer_name', 'text', openshiftHelp.awspcaIssuerName)}
                {renderTextField('AWS Region', 'component_config.cert_manager.awspca_region', 'text', openshiftHelp.awspcaRegion)}
                {renderTextField('AWS PCA ARN', 'component_config.cert_manager.awspca_pca_arn', 'text', openshiftHelp.awspcaPcaArn)}
                {renderTextField('AWS Access Key ID', 'component_config.cert_manager.awspca_access_key_id', 'password', openshiftHelp.awspcaAccessKeyId)}
                {renderTextField('AWS Secret Access Key', 'component_config.cert_manager.awspca_secret_access_key', 'password', openshiftHelp.awspcaSecretAccessKey)}
              </>
            )}
          </>
        )}
      </Grid>
    </>
    );
  };

  const renderOpenShiftAdminHtpasswdConfig = () => {
    const users = data.openshift.htpasswd_users || [];
    const updateUser = (index, key, value) => {
      setData(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        if (!copy.openshift.htpasswd_users) copy.openshift.htpasswd_users = [];
        copy.openshift.htpasswd_users[index] = {
          ...(copy.openshift.htpasswd_users[index] || {}),
          [key]: value
        };
        if (index === 0) {
          if (key === 'name') copy.openshift.admin_username = value;
          if (key === 'password') copy.openshift.admin_password = value;
          if (key === 'role') copy.openshift.admin_role = value;
        }
        return copy;
      });
    };
    return (
      <Grid hasGutter>
        <GridItem span={6}>
          <FormGroup label="HTPasswd action">
            <select
              value={data.openshift.htpasswd_action || 'add'}
              onChange={e => set('openshift.htpasswd_action', e.target.value)}
              style={{ width: '100%', height: '36px' }}
            >
              <option value="add">add</option>
              <option value="replace">replace</option>
              <option value="remove">remove</option>
            </select>
          </FormGroup>
        </GridItem>
        {users.map((user, index) => (
          <GridItem span={12} key={`htpass-user-${index}`}>
            <Grid hasGutter>
              <GridItem span={4}>
                <FormGroup label="Username">
                  <TextInput value={user.name || ''} onChange={(_, v) => updateUser(index, 'name', v)} />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Password">
                  <TextInput type="password" value={user.password || ''} onChange={(_, v) => updateUser(index, 'password', v)} />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Role">
                  <TextInput value={user.role || 'cluster-admin'} onChange={(_, v) => updateUser(index, 'role', v)} />
                </FormGroup>
              </GridItem>
              {users.length > 1 && (
                <GridItem span={12}>
                  <Button variant="link" onClick={() => setData(prev => {
                    const copy = JSON.parse(JSON.stringify(prev));
                    copy.openshift.htpasswd_users = (copy.openshift.htpasswd_users || []).filter((_, i) => i !== index);
                    const first = copy.openshift.htpasswd_users[0] || {};
                    copy.openshift.admin_username = first.name || 'admin';
                    copy.openshift.admin_password = first.password || '';
                    copy.openshift.admin_role = first.role || 'cluster-admin';
                    return copy;
                  })}>Remove User</Button>
                </GridItem>
              )}
            </Grid>
          </GridItem>
        ))}
        <GridItem span={12}>
          <Button variant="secondary" onClick={() => setData(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (!copy.openshift.htpasswd_users) copy.openshift.htpasswd_users = [];
            copy.openshift.htpasswd_users.push({ name: '', password: '', role: 'cluster-admin' });
            return copy;
          })}>Add User</Button>
        </GridItem>
      </Grid>
    );
  };

  const bannerColorPresets = [
    { label: 'Red', value: '#c9190b' },
    { label: 'Green', value: '#1f7a1f' },
    { label: 'Blue', value: '#0066cc' },
    { label: 'Yellow', value: '#f0ab00' },
    { label: 'Gray', value: '#6a6e73' },
    { label: 'Black', value: '#151515' },
    { label: 'White', value: '#ffffff' }
  ];

  const renderOpenShiftConsoleBannerConfig = () => (
    <Grid hasGutter>
      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Console Banner Location', openshiftHelp.bannerLocation)}>
          <select
            value={data.openshift.banner_location || 'BannerTop'}
            onChange={e => set('openshift.banner_location', e.target.value)}
            style={{ width: '100%', height: '36px' }}
          >
            <option value="BannerTop">BannerTop</option>
            <option value="BannerBottom">BannerBottom</option>
          </select>
        </FormGroup>
      </GridItem>

      <GridItem span={12}>
        <FormGroup label={labelWithHelp('Console Banner Text', openshiftHelp.bannerText)}>
          <TextInput
            value={data.openshift.banner_text || ''}
            onChange={(_, v) => set('openshift.banner_text', v)}
          />
        </FormGroup>
      </GridItem>

      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Console Banner Background Color', openshiftHelp.bannerBackgroundColor)}>
          <select
            value={data.openshift.banner_background_color || '#1f7a1f'}
            onChange={e => set('openshift.banner_background_color', e.target.value)}
            style={{ width: '100%', height: '36px' }}
          >
            {bannerColorPresets.map(color => (
              <option key={`bg-${color.value}`} value={color.value}>{color.label} ({color.value})</option>
            ))}
          </select>
        </FormGroup>
      </GridItem>

      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Console Banner Text Color', openshiftHelp.bannerTextColor)}>
          <select
            value={data.openshift.banner_text_color || '#ffffff'}
            onChange={e => set('openshift.banner_text_color', e.target.value)}
            style={{ width: '100%', height: '36px' }}
          >
            {bannerColorPresets.map(color => (
              <option key={`fg-${color.value}`} value={color.value}>{color.label} ({color.value})</option>
            ))}
          </select>
        </FormGroup>
      </GridItem>
    </Grid>
  );

  const renderAgentInstallerConfig = () => {
    const config = agentInstallerConfig();
    const nodes = Array.isArray(config.nodes) ? config.nodes : [];
    const result = agentInstallerResult;
    const previewText = agentInstallerPreviewTab === 'agent'
      ? result?.agentConfig
      : agentInstallerPreviewTab === 'kargs'
        ? (result?.kernelArgumentsPreview
          || Object.values(result?.additionalManifests || {}).join('\n'))
        : agentInstallerPreviewTab === 'imageset'
          ? (result?.imagesetConfigYaml
            || result?.installerPieces?.['imageset-config.yaml']
            || '')
          : agentInstallerPreviewTab === 'manual'
            ? (result?.fieldManual
              || result?.installerPieces?.['FIELD_MANUAL.md']
              || '')
            : result?.installConfig;

    const inputStyle = {
      width: '100%',
      minWidth: 0,
      padding: '8px',
      background: fieldBg,
      color: fieldColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px'
    };

    const agentField = (label, key, help, type = 'text', span = 6) => (
      <GridItem span={span}>
        <FormGroup label={labelWithHelp(label, help)}>
          <TextInput
            type={type}
            value={config[key] || ''}
            onChange={(_, v) => setAgentInstaller(key, v)}
          />
        </FormGroup>
      </GridItem>
    );

    const agentTextArea = (label, key, help, rows = 5) => (
      <GridItem span={12}>
        <FormGroup label={labelWithHelp(label, help)}>
          <textarea
            value={config[key] || ''}
            onChange={e => setAgentInstaller(key, e.target.value)}
            rows={rows}
            spellCheck="false"
            style={inputStyle}
          />
        </FormGroup>
      </GridItem>
    );

    const renderAgentNodeField = (index, label, field, help = '', type = 'text', disabled = false) => (
      <FormGroup label={labelWithHelp(label, help)}>
        <TextInput
          type={type}
          value={nodes[index]?.[field] ?? (field === 'prefixLength' ? 24 : '')}
          onChange={(_, v) => setAgentNode(index, field, v)}
          onBlur={field.includes('Mac')
            ? e => setAgentNode(index, field, formatMacAddress(e.target.value))
            : undefined}
          isDisabled={disabled}
          placeholder={field === 'diskDevice' ? 'optional' : undefined}
        />
      </FormGroup>
    );

    const editingNodeIndex = agentNodeEditorIndex;
    const editingNode = editingNodeIndex !== null ? nodes[editingNodeIndex] : null;

    return (
      <>
        <Grid hasGutter>
          <GridItem span={12}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Saved Profiles</div>
          </GridItem>
          {agentField('Profile Name', 'profile_name', 'Reusable browser-local profile name. Example: prod-sno-lab.')}
          <GridItem span={6}>
            <FormGroup label="Load Profile">
              <select
                value=""
                onChange={e => loadAgentProfile(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select saved profile</option>
                {agentInstallerProfiles.map(profile => (
                  <option key={profile.name} value={profile.name}>{profile.name}</option>
                ))}
              </select>
            </FormGroup>
          </GridItem>
          <GridItem span={12}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <Button variant="secondary" onClick={saveAgentProfile}>Save Profile</Button>
              <Button variant="secondary" onClick={cloneAgentProfile}>Clone Current Profile</Button>
              <Button variant="secondary" onClick={downloadAgentProfile}>Download Profile</Button>
              <Button
                variant="secondary"
                isDisabled={agentInstallerBusy}
                onClick={downloadSanitizedAgentProfile}
                title="Downloads a redacted profile JSON safe to share off-site."
              >
                Download sanitized profile
              </Button>
              <Button variant="secondary" onClick={() => agentProfileFileRef.current?.click()}>
                Upload Profile
              </Button>
              <Button variant="link" onClick={deleteAgentProfile}>Delete Saved Profile</Button>
              <input
                ref={agentProfileFileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={uploadAgentProfile}
              />
            </div>
            <div style={{ color: mutedTextColor, marginBottom: '12px', fontSize: '0.9em' }}>
              Browser Save/Load stays local. Use Download/Upload to move profiles between machines.
              Prefer <strong>Download sanitized profile</strong> when the file will leave a customer site.
            </div>
          </GridItem>

          <GridItem span={12}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Cluster Information</div>
          </GridItem>
          {agentField('Cluster Name', 'cluster_name', openshiftHelp.agentClusterName)}
          {agentField('Base Domain', 'base_domain', openshiftHelp.agentBaseDomain)}
          {agentField('OpenShift Version', 'openshift_version', 'OpenShift release version for the saved profile. Example: 4.16.')}
          <GridItem span={6}>
            <FormGroup label="Topology">
              <select
                value={config.topology || 'ha'}
                onChange={e => setAgentInstaller('topology', e.target.value)}
                style={inputStyle}
              >
                <option value="ha">Highly Available</option>
                <option value="sno">Single Node OpenShift</option>
              </select>
            </FormGroup>
          </GridItem>
          {agentTextArea('Pull Secret', 'pull_secret', openshiftHelp.agentPullSecret, 4)}
          {agentTextArea('SSH Public Key', 'ssh_public_key', openshiftHelp.agentSshKey, 3)}

          <GridItem span={12}>
            <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Networking</div>
          </GridItem>
          {agentField('Machine Network CIDR', 'machine_network_cidr', openshiftHelp.agentNetworkCidr)}
          {agentField('Cluster Network CIDR', 'cluster_network_cidr', 'Pod network CIDR. Example: 10.128.0.0/14.')}
          {agentField('Cluster Network Host Prefix', 'cluster_network_host_prefix', 'Host prefix for each node pod subnet. Example: 24.', 'number')}
          {agentField('Service Network CIDR', 'service_network_cidr', 'Service network CIDR. Example: 172.30.0.0/16.')}
          {agentField('API VIP', 'api_vip', openshiftHelp.agentVip)}
          {agentField('Ingress VIP', 'ingress_vip', openshiftHelp.agentVip)}
          {agentField('Rendezvous IP', 'rendezvous_ip', openshiftHelp.agentRendezvousIp)}
          {agentField('Boot Artifacts Base URL', 'boot_artifacts_base_url', 'Optional HTTP URL where boot artifacts are served. Example: http://192.168.2.2/.')}
          {agentField('NTP Sources', 'ntp_sources', 'Optional NTP sources, comma or newline separated. Example: idm.server.lab, 192.168.0.60.')}
          {agentField('HTTP Proxy', 'proxy_http', 'Optional install-config proxy HTTP URL.')}
          {agentField('HTTPS Proxy', 'proxy_https', 'Optional install-config proxy HTTPS URL.')}
          {agentField('No Proxy', 'proxy_no_proxy', 'Optional comma-separated proxy bypass list.')}
          {agentTextArea('Additional Trust Bundle', 'additional_trust_bundle', 'Optional PEM CA bundle added to install-config.yaml.', 4)}
          {agentTextArea('Disconnected Registry Image Content Sources', 'disconnected_registry', 'Optional YAML list for imageContentSources when installing disconnected.', 4)}
          {agentTextArea(
            'Kernel Arguments',
            'kernel_arguments',
            openshiftHelp.agentKernelArgs,
            3
          )}
          <GridItem span={12}>
            <Checkbox
              label="Remind me when a node has no root device hint"
              isChecked={config.require_root_device === true}
              onChange={(_, v) => setAgentInstaller('require_root_device', v)}
            />
            <div style={{ color: mutedTextColor, marginTop: '4px', fontSize: '0.9em' }}>
              Disk is optional. Leave it blank on single-disk hosts; the installer will choose the disk.
              This checkbox only adds a warning, never a validation failure.
            </div>
          </GridItem>
        </Grid>

        <div style={{ fontWeight: 700, margin: '20px 0 8px' }}>Nodes</div>
        <div style={{ color: mutedTextColor, marginBottom: '8px', fontSize: '0.9em' }}>
          MAC tip: paste <code>112233445566</code> and blur the field — colons are inserted automatically if missing.
          Enable Bond when the host needs a second NIC/MAC for link aggregation.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1480px' }}>
            <thead>
              <tr>
                {[
                  'Hostname',
                  'Role',
                  'MAC Address',
                  'Interface',
                  'Bond',
                  '2nd MAC',
                  '2nd Interface',
                  'Network',
                  'Static IP',
                  'Prefix',
                  'Gateway',
                  'DNS Servers',
                  'Disk (optional)',
                  'Labels',
                  'Taints',
                  ''
                ].map(header => (
                  <th key={header} style={{ textAlign: 'left', padding: '6px', borderBottom: `1px solid ${borderColor}` }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, index) => (
                <tr key={node.id || `node-${index}`}>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.hostname || ''} onChange={(_, v) => setAgentNode(index, 'hostname', v)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <select value={node.role || 'worker'} onChange={e => setAgentNode(index, 'role', e.target.value)} style={inputStyle}>
                      <option value="master">Control Plane</option>
                      <option value="worker">Worker</option>
                    </select>
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput
                      value={node.macAddress || ''}
                      onChange={(_, v) => setAgentNode(index, 'macAddress', v)}
                      onBlur={e => setAgentNode(index, 'macAddress', formatMacAddress(e.target.value))}
                      placeholder="112233445566"
                      title={openshiftHelp.agentMac}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.interfaceName || ''} onChange={(_, v) => setAgentNode(index, 'interfaceName', v)} />
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={node.bondEnabled === true}
                      onChange={e => setAgentNode(index, 'bondEnabled', e.target.checked)}
                      title={openshiftHelp.agentBond}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput
                      value={node.secondaryMacAddress || ''}
                      onChange={(_, v) => setAgentNode(index, 'secondaryMacAddress', v)}
                      onBlur={e => setAgentNode(index, 'secondaryMacAddress', formatMacAddress(e.target.value))}
                      isDisabled={!node.bondEnabled}
                      placeholder="aabbccddeeff"
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput
                      value={node.secondaryInterfaceName || 'eno2'}
                      onChange={(_, v) => setAgentNode(index, 'secondaryInterfaceName', v)}
                      isDisabled={!node.bondEnabled}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <select value={node.networkMode || 'dhcp'} onChange={e => setAgentNode(index, 'networkMode', e.target.value)} style={inputStyle}>
                      <option value="dhcp">DHCP</option>
                      <option value="static">Static</option>
                    </select>
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.ipAddress || ''} onChange={(_, v) => setAgentNode(index, 'ipAddress', v)} isDisabled={node.networkMode !== 'static'} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput type="number" value={node.prefixLength ?? 24} onChange={(_, v) => setAgentNode(index, 'prefixLength', v)} isDisabled={node.networkMode !== 'static'} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.gateway || ''} onChange={(_, v) => setAgentNode(index, 'gateway', v)} isDisabled={node.networkMode !== 'static'} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.dnsServers || ''} onChange={(_, v) => setAgentNode(index, 'dnsServers', v)} isDisabled={node.networkMode !== 'static'} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput
                      value={node.diskDevice || ''}
                      onChange={(_, v) => setAgentNode(index, 'diskDevice', v)}
                      placeholder="optional"
                      title="Optional. Leave blank for single-disk hosts."
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.labels || ''} onChange={(_, v) => setAgentNode(index, 'labels', v)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.taints || ''} onChange={(_, v) => setAgentNode(index, 'taints', v)} />
                  </td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                    <Button variant="link" onClick={() => setAgentNodeEditorIndex(index)}>Form</Button>
                    {' '}
                    <Button variant="link" onClick={() => removeAgentNode(index)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingNode && (
          <Modal
            variant={ModalVariant.medium}
            title={`Edit Node ${editingNodeIndex + 1}${editingNode.hostname ? `: ${editingNode.hostname}` : ''}`}
            isOpen
            onClose={() => setAgentNodeEditorIndex(null)}
            actions={[
              <Button key="done" variant="primary" onClick={() => setAgentNodeEditorIndex(null)}>
                Done
              </Button>
            ]}
          >
            <Form>
              {renderAgentNodeField(editingNodeIndex, 'Hostname', 'hostname')}
              <FormGroup label={labelWithHelp('Role', 'Control plane (master) or worker node role in the cluster.')}>
                <select
                  value={editingNode.role || 'worker'}
                  onChange={e => setAgentNode(editingNodeIndex, 'role', e.target.value)}
                  style={inputStyle}
                >
                  <option value="master">Control Plane</option>
                  <option value="worker">Worker</option>
                </select>
              </FormGroup>
              {renderAgentNodeField(editingNodeIndex, 'MAC Address', 'macAddress', openshiftHelp.agentMac)}
              {renderAgentNodeField(editingNodeIndex, 'Interface', 'interfaceName')}
              <FormGroup label={labelWithHelp('Bond', openshiftHelp.agentBond)}>
                <Checkbox
                  label="Enable bond0 from two NICs"
                  isChecked={editingNode.bondEnabled === true}
                  onChange={(_, v) => setAgentNode(editingNodeIndex, 'bondEnabled', v)}
                />
              </FormGroup>
              {renderAgentNodeField(editingNodeIndex, '2nd MAC Address', 'secondaryMacAddress', openshiftHelp.agentMac, 'text', !editingNode.bondEnabled)}
              {renderAgentNodeField(editingNodeIndex, '2nd Interface', 'secondaryInterfaceName', '', 'text', !editingNode.bondEnabled)}
              <FormGroup label={labelWithHelp('Network', openshiftHelp.agentNodeStatic)}>
                <select
                  value={editingNode.networkMode || 'dhcp'}
                  onChange={e => setAgentNode(editingNodeIndex, 'networkMode', e.target.value)}
                  style={inputStyle}
                >
                  <option value="dhcp">DHCP</option>
                  <option value="static">Static</option>
                </select>
              </FormGroup>
              {renderAgentNodeField(editingNodeIndex, 'Static IP', 'ipAddress', '', 'text', editingNode.networkMode !== 'static')}
              {renderAgentNodeField(editingNodeIndex, 'Prefix Length', 'prefixLength', '', 'number', editingNode.networkMode !== 'static')}
              {renderAgentNodeField(editingNodeIndex, 'Gateway', 'gateway', '', 'text', editingNode.networkMode !== 'static')}
              {renderAgentNodeField(editingNodeIndex, 'DNS Servers', 'dnsServers', '', 'text', editingNode.networkMode !== 'static')}
              {renderAgentNodeField(editingNodeIndex, 'Disk (optional)', 'diskDevice', 'Optional. Leave blank for single-disk hosts.')}
              {renderAgentNodeField(editingNodeIndex, 'Labels', 'labels')}
              {renderAgentNodeField(editingNodeIndex, 'Taints', 'taints')}
            </Form>
          </Modal>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <Button variant="secondary" onClick={addAgentNode}>Add Node</Button>
          <Button variant="primary" isDisabled={agentInstallerBusy} onClick={validateAgentInstaller}>Validate Configuration</Button>
          <Button variant="secondary" isDisabled={agentInstallerBusy} onClick={generateAgentInstaller}>Generate YAML Preview</Button>
          <Button variant="secondary" isDisabled={agentInstallerBusy} onClick={downloadAgentInstallerZip}>Download ZIP</Button>
          <Button
            variant="secondary"
            isDisabled={agentInstallerBusy}
            onClick={downloadSanitizedAgentInstallerZip}
            title="Redacts hostnames, IPs, MACs, pull secret, SSH keys, certs, tokens, and proxy URLs for safe sharing."
          >
            Download sanitized ZIP
          </Button>
          <Button
            variant="secondary"
            isDisabled={agentInstallerBusy}
            onClick={() => mapToAirgapArchitect({ download: false })}
            title="Preflight form → airgap installer pieces (imageset + field manual). Does not start an install."
          >
            Generate airgap installer pieces
          </Button>
          <Button
            variant="secondary"
            isDisabled={agentInstallerBusy}
            onClick={() => mapToAirgapArchitect({ download: true })}
            title="Download JSON bundle of form YAML + airgap installer pieces."
          >
            Download airgap pieces JSON
          </Button>
          {result?.installConfig && (
            <>
              <Button variant="link" onClick={() => downloadFile('install-config.yaml', result.installConfig)}>Download install-config.yaml</Button>
              <Button variant="link" onClick={() => downloadFile('agent-config.yaml', result.agentConfig)}>Download agent-config.yaml</Button>
            </>
          )}
          {(result?.imagesetConfigYaml || result?.installerPieces?.['imageset-config.yaml']) && (
            <Button
              variant="link"
              onClick={() => downloadFile(
                'imageset-config.yaml',
                result.imagesetConfigYaml || result.installerPieces['imageset-config.yaml']
              )}
            >
              Download imageset-config.yaml
            </Button>
          )}
          {(result?.fieldManual || result?.installerPieces?.['FIELD_MANUAL.md']) && (
            <Button
              variant="link"
              onClick={() => downloadFile(
                'FIELD_MANUAL.md',
                result.fieldManual || result.installerPieces['FIELD_MANUAL.md']
              )}
            >
              Download FIELD_MANUAL.md
            </Button>
          )}
        </div>
        <div style={{ color: mutedTextColor, marginTop: '8px', fontSize: '0.9em' }}>
          Use <strong>Download sanitized ZIP</strong> when sharing configs off-site. It replaces customer hostnames, IPs, MACs, secrets, certs, and tokens with example values and includes <code>README-SANITIZED.txt</code>.
          {' '}
          <strong>Generate airgap installer pieces</strong>: preflight keeps the form (install/agent YAML);
          the airgap companion fills disconnected pieces (oc-mirror <code>imageset-config.yaml</code> + field manual).
          Set <code>AIRGAP_ARCHITECT_URL</code> (e.g. <code>http://127.0.0.1:8081</code>) to enrich from ado-airgap-architect.
          This does <em>not</em> boot nodes or run the installer.
        </div>
        <div style={{ color: mutedTextColor, marginTop: '8px', fontSize: '0.9em' }}>
          Use <strong>Download sanitized ZIP</strong> when sharing configs off-site. It replaces customer hostnames, IPs, MACs, secrets, certs, and tokens with example values and includes <code>README-SANITIZED.txt</code>.
        </div>

        {result && (
          <div style={{ marginTop: '14px' }}>
            {result.valid ? (
              <div style={{ color: '#3e8635', fontWeight: 700 }}>Validation passed.</div>
            ) : (
              <div style={{ color: '#c9190b', fontWeight: 700 }}>Validation failed.</div>
            )}
            {(result.errors || []).map(error => (
              <div key={error} style={{ color: '#c9190b' }}>- {error}</div>
            ))}
            {(result.warnings || []).map(warning => (
              <div key={warning} style={{ color: '#f0ab00' }}>- {warning}</div>
            ))}
          </div>
        )}

        {previewText && (
          <div style={{ marginTop: '14px' }}>
            <Tabs activeKey={agentInstallerPreviewTab} onSelect={(_, key) => setAgentInstallerPreviewTab(key)}>
              <Tab eventKey="install" title="install-config.yaml" />
              <Tab eventKey="agent" title="agent-config.yaml" />
              <Tab eventKey="imageset" title="imageset-config.yaml" />
              <Tab eventKey="manual" title="FIELD_MANUAL.md" />
              <Tab eventKey="kargs" title="kernel arguments" />
            </Tabs>
            <textarea
              value={previewText}
              readOnly
              spellCheck="false"
              style={{
                width: '100%',
                minHeight: '420px',
                marginTop: '10px',
                background: '#151515',
                color: '#f0f0f0',
                fontFamily: 'monospace',
                fontSize: `${consoleFontSize}px`,
                lineHeight: '1.45',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                padding: '14px'
              }}
            />
          </div>
        )}
      </>
    );
  };

  const renderJiraConfig = () => (
    <>
      <Radio
        label="Using Jira"
        name="jira"
        isChecked={data.jira.enabled}
        onChange={() => set('jira.enabled', true)}
      />
      <Radio
        label="Not using Jira"
        name="jira"
        isChecked={!data.jira.enabled}
        onChange={() => set('jira.enabled', false)}
      />

      {data.jira.enabled && (
        <>
          <br />
          <Grid hasGutter>
            <GridItem span={6}>
              <FormGroup label="Jira Instance URL">
                <TextInput value={data.jira.url} onChange={(_, v) => set('jira.url', v)} />
              </FormGroup>
            </GridItem>

            <GridItem span={6}>
              <FormGroup label="Jira Project Key">
                <TextInput value={data.jira.project_key} onChange={(_, v) => set('jira.project_key', v)} />
              </FormGroup>
            </GridItem>

            <GridItem span={6}>
              <FormGroup label="Jira Custom AC Field">
                <TextInput value={data.jira.custom_ac_field} onChange={(_, v) => set('jira.custom_ac_field', v)} />
              </FormGroup>
            </GridItem>

            <GridItem span={6}>
              <FormGroup label="Templates Directory">
                <TextInput value={data.jira.templates_dir} onChange={(_, v) => set('jira.templates_dir', v)} />
              </FormGroup>
            </GridItem>

            <GridItem span={6}>
              <Checkbox
                label="Use Jira Subtasks"
                isChecked={data.jira.create_subtasks}
                onChange={(_, v) => set('jira.create_subtasks', v)}
              />
            </GridItem>

            <GridItem span={6}>
              <FormGroup label="Jira Service Account Email">
                <TextInput value={data.jira.username} onChange={(_, v) => set('jira.username', v)} />
              </FormGroup>
            </GridItem>

            <GridItem span={12}>
              <FormGroup label="Jira API Token">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <TextInput
                    type={showJiraToken ? 'text' : 'password'}
                    value={data.jira.token}
                    onChange={(_, v) => set('jira.token', v)}
                  />
                  <Button variant="secondary" onClick={() => setShowJiraToken(!showJiraToken)}>
                    {showJiraToken ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </FormGroup>
            </GridItem>
          </Grid>
        </>
      )}
    </>
  );

  const defaultAcsCentralHostname = () => {
    const appsDomain = String(data.openshift?.apps_domain || '').trim();
    return appsDomain ? `central.${appsDomain}` : '';
  };

  const renderAcmConfig = () => (
    <>
      <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
        Installs the ACM operator and MultiClusterHub into namespace{' '}
        <code>open-cluster-management</code>. Operator channel is the only
        preflight setting; other values use collection defaults.
      </p>
      <Grid hasGutter>
        {renderTextField(
          'Operator Channel',
          'component_config.acm.channel',
          'text',
          'Catalog channel for advanced-cluster-management. Lab default: release-2.17.'
        )}
      </Grid>
    </>
  );

  const renderAcsConfig = () => {
    const acsHostnameHelp = defaultAcsCentralHostname()
      ? `Central route hostname. Default when empty: ${defaultAcsCentralHostname()}`
      : 'Central route hostname (set OpenShift apps domain for a default).';

    return (
      <>
        {renderComponentOptions(
          'acs',
          'ACS Options',
          'Optional RHACS vulnerability report job templates and workflow (Red Hat source, raw, age, CVE enriched).'
        )}
        <Grid hasGutter>
          {renderTextField(
            'Central Route Hostname',
            'component_config.acs.hostname',
            'text',
            acsHostnameHelp
          )}
          {renderStorageClassField(
            'Storage Class',
            'component_config.acs.storage',
            'Storage class for Central PVCs (central-db, central-pvc).'
          )}
          <GridItem span={6}>
            <FormGroup label={labelWithHelp('Namespace', 'Operand namespace for RHACS Central. Default: stackrox.')}>
              <TextInput
                value={data.component_config?.acs?.namespace || 'stackrox'}
                isReadOnly
              />
            </FormGroup>
          </GridItem>
        </Grid>
        <div style={{ marginTop: '16px' }}>
          <Title headingLevel="h4">Optional policy/report upload</Title>
          <p style={{ color: mutedTextColor, marginBottom: '8px' }}>
            Leave sources blank to skip upload during Deploy ACS. Set git URL or local path to import policies/reports after Central is up.
          </p>
          <Grid hasGutter>
            <GridItem span={6}>
              <FormGroup label="Policies source type">
                <select value={data.component_config.acs.policies_source_type || 'git'} onChange={e => set('component_config.acs.policies_source_type', e.target.value)} style={{ width: '100%', height: '36px' }}>
                  <option value="git">git</option>
                  <option value="path">path</option>
                </select>
              </FormGroup>
            </GridItem>
            {renderTextField('Policies source (git URL or path)', 'component_config.acs.policies_source')}
            <GridItem span={6}>
              <FormGroup label="Reports source type">
                <select value={data.component_config.acs.reports_source_type || 'git'} onChange={e => set('component_config.acs.reports_source_type', e.target.value)} style={{ width: '100%', height: '36px' }}>
                  <option value="git">git</option>
                  <option value="path">path</option>
                </select>
              </FormGroup>
            </GridItem>
            {renderTextField('Reports source (git URL or path)', 'component_config.acs.reports_source')}
          </Grid>
        </div>
      </>
    );
  };

  const renderOpenShiftOAuthRhbkConfig = () => (
    <>
      <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
        Name shown in the OpenShift login screen for the Keycloak/RHBK OIDC identity provider.
        Requires RHBK deployed and an OpenShift client configured in the realm.
      </p>
      <Grid hasGutter>
        {renderTextField(
          'OAuth IdP display name',
          'openshift.oauth_rhbk.idp_name',
          'text',
          'Identity provider name in OAuth cluster config. Example: Keycloak, RH-SSO.'
        )}
      </Grid>
    </>
  );

  const renderOpenShiftLdapAuthConfig = () => (
    <>
      <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
        Name shown in the OpenShift login screen for the LDAP identity provider.
        Bind DN and LDAP URL come from vault <code>ldap_config</code> unless overridden in generated vars.
      </p>
      <Grid hasGutter>
        {renderTextField(
          'LDAP IdP display name',
          'openshift.ldap_auth.idp_name',
          'text',
          'Identity provider name in OAuth cluster config. Example: LDAP_IDM, IdM.'
        )}
      </Grid>
    </>
  );

  const renderOpenShiftDiscoverRoutesConfig = () => {
    const scope = data.openshift?.discover_routes?.scope || 'all';
    return (
      <>
        <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
          Control which Routes appear in the final OpenShift workflow print step.
          Leave scope as <strong>All</strong> to list every application route, or narrow to namespaces
          or to namespaces for selected OpenShift apps.
        </p>
        <Grid hasGutter>
          <GridItem span={6}>
            <FormGroup label="Route scope">
              <select
                value={scope}
                onChange={e => set('openshift.discover_routes.scope', e.target.value)}
                style={selectStyle}
              >
                <option value="all">All application routes</option>
                <option value="namespaces">Selected namespaces</option>
                <option value="selected_apps">Namespaces from selected OpenShift apps</option>
              </select>
            </FormGroup>
          </GridItem>
          {scope === 'namespaces' && (
            <GridItem span={12}>
              <FormGroup
                label={labelWithHelp(
                  'Namespaces',
                  'Comma- or newline-separated namespace list (e.g. grafana, gitlab-system, stackrox).'
                )}
              >
                <textarea
                  value={data.openshift?.discover_routes?.namespaces || ''}
                  onChange={e => set('openshift.discover_routes.namespaces', e.target.value)}
                  rows={4}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </FormGroup>
            </GridItem>
          )}
          {scope === 'selected_apps' && (
            <GridItem span={12}>
              <p style={{ color: mutedTextColor, margin: 0 }}>
                Uses namespaces mapped from your selected OpenShift applications on the main form
                (for example grafana → <code>grafana</code>, gitlab → <code>gitlab-system</code>).
              </p>
            </GridItem>
          )}
        </Grid>
      </>
    );
  };

  const setAlternateRouteLabel = (index, field, value) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.alternate_routes) copy.openshift.alternate_routes = {};
      const labels = Array.isArray(copy.openshift.alternate_routes.route_labels)
        ? [...copy.openshift.alternate_routes.route_labels]
        : [];
      while (labels.length <= index) {
        labels.push({ key: '', value: '' });
      }
      labels[index] = { ...labels[index], [field]: value };
      copy.openshift.alternate_routes.route_labels = labels;
      return copy;
    });
  };

  const addAlternateRouteLabel = () => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.alternate_routes) copy.openshift.alternate_routes = {};
      const labels = Array.isArray(copy.openshift.alternate_routes.route_labels)
        ? [...copy.openshift.alternate_routes.route_labels]
        : [];
      labels.push({ key: '', value: '' });
      copy.openshift.alternate_routes.route_labels = labels;
      return copy;
    });
  };

  const removeAlternateRouteLabel = index => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const labels = [...(copy.openshift?.alternate_routes?.route_labels || [])];
      labels.splice(index, 1);
      if (!copy.openshift) copy.openshift = {};
      if (!copy.openshift.alternate_routes) copy.openshift.alternate_routes = {};
      copy.openshift.alternate_routes.route_labels = labels;
      return copy;
    });
  };

  const renderOpenShiftAlternateRoutesConfig = () => {
    const alt = data.openshift?.alternate_routes || {};
    const labels = Array.isArray(alt.route_labels) ? alt.route_labels : [];
    const toggleAltOption = (field, checked) => {
      set(`openshift.alternate_routes.${field}`, checked);
    };

    return (
      <>
        <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
          Optional <strong>Alt Routes Workflow</strong> steps. Print shows alternate-domain candidates;
          Add creates <code>-alt</code> Routes; Ingress binds routes to a named ingress controller via
          the <code>haproxy.router.openshift.io/router</code> label.
        </p>
        <Grid hasGutter>
          <GridItem span={4}>
            <Checkbox
              label="Print Alternate Routes"
              isChecked={alt.print_alt_routes !== false}
              onChange={(_, checked) => toggleAltOption('print_alt_routes', checked)}
            />
          </GridItem>
          <GridItem span={4}>
            <Checkbox
              label="Add Alternate Route"
              isChecked={!!alt.add_alt_routes}
              onChange={(_, checked) => toggleAltOption('add_alt_routes', checked)}
            />
          </GridItem>
          <GridItem span={4}>
            <Checkbox
              label="Add Ingress with Route"
              isChecked={!!alt.add_ingress_with_route}
              onChange={(_, checked) => toggleAltOption('add_ingress_with_route', checked)}
            />
          </GridItem>
        </Grid>

        {(alt.add_alt_routes || alt.add_ingress_with_route) && (
          <Grid hasGutter style={{ marginTop: '12px' }}>
            {renderTextField(
              'Alternate route name suffix',
              'openshift.alternate_routes.route_name_suffix',
              'text',
              'Appended to the primary route name (default: -alt). Example route grafana-alt.'
            )}
            <GridItem span={6}>
              <Checkbox
                label="Force replace existing alternate routes"
                isChecked={!!alt.force_replace}
                onChange={(_, checked) => set('openshift.alternate_routes.force_replace', checked)}
              />
            </GridItem>
          </Grid>
        )}

        {(alt.add_alt_routes || alt.add_ingress_with_route) && (
          <div style={{ marginTop: '16px' }}>
            <Title headingLevel="h4">Route labels</Title>
            <p style={{ color: mutedTextColor, marginBottom: '8px' }}>
              Optional metadata labels applied to created alternate routes.
            </p>
            {labels.length === 0 && (
              <p style={{ color: mutedTextColor }}>No custom labels — click Add label to define one.</p>
            )}
            {labels.map((row, index) => (
              <Grid hasGutter key={`alt-route-label-${index}`} style={{ marginBottom: '8px' }}>
                <GridItem span={5}>
                  <TextInput
                    value={row.key || ''}
                    placeholder="label key"
                    onChange={(_event, value) => setAlternateRouteLabel(index, 'key', value)}
                  />
                </GridItem>
                <GridItem span={5}>
                  <TextInput
                    value={row.value || ''}
                    placeholder="label value"
                    onChange={(_event, value) => setAlternateRouteLabel(index, 'value', value)}
                  />
                </GridItem>
                <GridItem span={2}>
                  <Button variant="link" onClick={() => removeAlternateRouteLabel(index)}>
                    Remove
                  </Button>
                </GridItem>
              </Grid>
            ))}
            <Button variant="secondary" onClick={addAlternateRouteLabel}>
              Add label
            </Button>
          </div>
        )}

        {alt.add_ingress_with_route && (
          <Grid hasGutter style={{ marginTop: '16px' }}>
            {renderTextField(
              'Ingress controller name',
              'openshift.alternate_routes.ingress_controller_name',
              'text',
              'IngressController name for haproxy.router.openshift.io/router (default: default).'
            )}
          </Grid>
        )}
      </>
    );
  };

  const setInstallAap = checked => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.pre_installs) copy.pre_installs = {};
      copy.pre_installs.install_aap = !!checked;
      if (!copy.component_config) copy.component_config = {};
      copy.component_config.aap = deepMerge(
        defaultComponentConfig('aap'),
        copy.component_config.aap || {}
      );
      copy.component_config.aap.install_during_bootstrap = !!checked
        || !!copy.pre_installs.attach_aap_license;
      if (!copy.component_apps) copy.component_apps = {};
      if (!copy.aap) copy.aap = {};
      if (checked) {
        // Install AAP is not a platform component selection and does not
        // imply Using AAP / Contoller configuration.
        copy.aap.enabled = false;
        copy.pre_installs.aap = copy.pre_installs.aap || {};
        copy.pre_installs.aap.license_only = false;
        copy.component_config.aap.license_only = false;
        if (copy.pre_installs.aap?.license_mode) {
          copy.component_config.aap.license_mode = copy.pre_installs.aap.license_mode;
        }
        copy.component_config.aap.deployment_version = aapDottedVersion(
          copy.component_config.aap.deployment_version || copy.aap?.version
        );
        if (!copy.component_config.aap.operator_scope) {
          copy.component_config.aap.operator_scope = 'all_namespaces';
        }
      } else if (copy.pre_installs.attach_aap_license) {
        copy.pre_installs.aap = copy.pre_installs.aap || {};
        copy.pre_installs.aap.license_only = true;
        copy.component_config.aap.license_only = true;
        copy.component_config.aap.install_during_bootstrap = true;
      } else {
        // Unchecking Install AAP must not leave a leftover `aap` component that
        // still generates the Install AAP on OpenShift job template.
        copy.components = (copy.components || []).filter(c => c !== 'aap');
        ['openshift', 'rhel'].forEach(group => {
          if (Array.isArray(copy.component_apps[group])) {
            copy.component_apps[group] = copy.component_apps[group].filter(app => app !== 'aap');
          }
        });
      }
      return copy;
    });
  };

  const setOpenshiftAgent = checked => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.pre_installs) copy.pre_installs = {};
      copy.pre_installs.openshift_agent_enabled = !!checked;
      // Legacy boolean key used by older payloads
      copy.pre_installs.openshift_agent_flag = !!checked;
      if (!copy.pre_installs.openshift_agent || typeof copy.pre_installs.openshift_agent !== 'object') {
        copy.pre_installs.openshift_agent = { api_host: '', pull_secret: '', ssh_public_key: '' };
      }
      if (checked) {
        const agent = copy.openshift?.agent_installer || {};
        copy.pre_installs.openshift_agent.api_host = copy.pre_installs.openshift_agent.api_host
          || copy.openshift?.api_host
          || '';
        copy.pre_installs.openshift_agent.pull_secret = copy.pre_installs.openshift_agent.pull_secret
          || agent.pull_secret
          || '';
        copy.pre_installs.openshift_agent.ssh_public_key = copy.pre_installs.openshift_agent.ssh_public_key
          || agent.ssh_public_key
          || '';
      }
      return copy;
    });
  };

  const setAttachAapLicense = checked => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.pre_installs) copy.pre_installs = {};
      if (!copy.pre_installs.aap) copy.pre_installs.aap = {};
      if (!copy.component_config) copy.component_config = {};
      copy.component_config.aap = deepMerge(
        defaultComponentConfig('aap'),
        copy.component_config.aap || {}
      );
      if (!copy.aap) copy.aap = {};
      copy.pre_installs.attach_aap_license = !!checked;
      const installAap = !!copy.pre_installs.install_aap;
      const licenseOnly = !!checked && !installAap;
      copy.pre_installs.aap.license_only = licenseOnly;
      copy.component_config.aap.license_only = licenseOnly;
      // License attach always uses General → AAP Hostname / Admin password (overwrite
      // stale Install AAP host fields like aap-aap.apps...).
      if (licenseOnly && copy.aap.hostname) {
        copy.component_config.aap.hostname = String(copy.aap.hostname)
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '');
      }
      if (licenseOnly && copy.aap.admin_password) {
        copy.component_config.aap.admin_password = copy.aap.admin_password;
      }
      if (checked) {
        copy.component_config.aap.install_during_bootstrap = true;
        if (!copy.pre_installs.aap.license_mode || copy.pre_installs.aap.license_mode === 'none') {
          copy.pre_installs.aap.license_mode = 'rhn';
          copy.component_config.aap.license_mode = 'rhn';
        }
      } else if (!installAap) {
        copy.component_config.aap.install_during_bootstrap = false;
        copy.pre_installs.aap.license_only = false;
        copy.component_config.aap.license_only = false;
      }
      return copy;
    });
  };

  const renderAapLicenseFields = (opts = {}) => {
    const forceAttachFields = !!opts.forceAttachFields;
    const aapLicense = data.pre_installs?.aap || {};
    const aapCfg = data.component_config?.aap || {};
    const mode = aapLicense.license_mode || aapCfg.license_mode || 'none';
    const installAap = !!data.pre_installs?.install_aap;
    const attachOnly = forceAttachFields || (!!data.pre_installs?.attach_aap_license && !installAap);
    return (
      <Grid hasGutter>
        <GridItem span={12}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            {installAap && !forceAttachFields ? 'License during install' : 'Attach license'}
          </div>
          <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '8px' }}>
            {attachOnly
              ? 'Attaches a subscription to an existing AAP (no operator reinstall). Make sure General → AAP Hostname URL and Admin password are populated before running.'
              : 'After AAP is up, uploads a manifest or RHN-login + /config/attach/ so the subscription wizard is cleared.'}
          </div>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label="License mode">
            <select
              value={mode}
              onChange={e => {
                set('pre_installs.aap.license_mode', e.target.value);
                set('component_config.aap.license_mode', e.target.value);
              }}
              style={{ width: '100%', height: '36px' }}
            >
              <option value="none">none (skip attach)</option>
              <option value="manifest">Manifest upload (attach)</option>
              <option value="rhn">RHN / service account (list + attach)</option>
            </select>
          </FormGroup>
        </GridItem>
        {mode === 'manifest' && (
          <GridItem span={12}>
            <FormGroup label="AAP subscription manifest ZIP">
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = String(reader.result || '');
                    const base64 = result.includes(',') ? result.split(',')[1] : result;
                    setData(prev => {
                      const copy = JSON.parse(JSON.stringify(prev));
                      if (!copy.pre_installs) copy.pre_installs = {};
                      if (!copy.pre_installs.aap) copy.pre_installs.aap = {};
                      if (!copy.component_config) copy.component_config = {};
                      if (!copy.component_config.aap) copy.component_config.aap = {};
                      copy.pre_installs.aap.subscription_manifest_file = file.name;
                      copy.pre_installs.aap.subscription_manifest_content_base64 = base64;
                      copy.pre_installs.aap.subscription_manifest_encoding = 'base64';
                      copy.pre_installs.aap.license_mode = 'manifest';
                      copy.component_config.aap.subscription_manifest_file = file.name;
                      copy.component_config.aap.subscription_manifest_content_base64 = base64;
                      copy.component_config.aap.subscription_manifest_encoding = 'base64';
                      copy.component_config.aap.license_mode = 'manifest';
                      return copy;
                    });
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                {aapLicense.subscription_manifest_file
                  ? `Selected: ${aapLicense.subscription_manifest_file}`
                  : 'Upload an AAP subscription manifest ZIP.'}
              </div>
            </FormGroup>
          </GridItem>
        )}
        {mode === 'rhn' && (
          <>
            <GridItem span={12}>
              <div style={{ color: mutedTextColor, fontSize: '13px' }}>
                AAP 2.5+ needs a Red Hat <strong>service account</strong> client ID + secret from{' '}
                <a href="https://console.redhat.com/iam/service-accounts" target="_blank" rel="noreferrer">
                  console.redhat.com/iam/service-accounts
                </a>
                {' '}(add the account to Subscriptions viewers). Do <strong>not</strong> put a portal
                login like <code>rh-ee-*</code> in the client ID field — that is a username, not a
                client ID. Prefer empty client fields + username/password only for Satellite, or upload
                a manifest ZIP. Leave Subscription ID blank to auto-pick the first AAP entitlement.
              </div>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label="Service account client ID (preferred)">
                <TextInput
                  value={aapLicense.rhn_client_id || aapCfg.rhn_client_id || ''}
                  onChange={(_, v) => {
                    set('pre_installs.aap.rhn_client_id', v);
                    set('component_config.aap.rhn_client_id', v);
                  }}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label="Service account client secret">
                <TextInput
                  type="password"
                  value={aapLicense.rhn_client_secret || aapCfg.rhn_client_secret || ''}
                  onChange={(_, v) => {
                    set('pre_installs.aap.rhn_client_secret', v);
                    set('component_config.aap.rhn_client_secret', v);
                  }}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label="RHN / Satellite username (legacy)">
                <TextInput
                  value={aapLicense.rhn_username || aapCfg.rhn_username || ''}
                  onChange={(_, v) => {
                    set('pre_installs.aap.rhn_username', v);
                    set('component_config.aap.rhn_username', v);
                  }}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup label="RHN / Satellite password (legacy)">
                <TextInput
                  type="password"
                  value={aapLicense.rhn_password || aapCfg.rhn_password || ''}
                  onChange={(_, v) => {
                    set('pre_installs.aap.rhn_password', v);
                    set('component_config.aap.rhn_password', v);
                  }}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={6}>
              <FormGroup
                label={labelWithHelp(
                  'Subscription ID (optional)',
                  'Pool/subscription id from the AAP subscription list. Leave blank to auto-select an Ansible Automation Platform entitlement.'
                )}
              >
                <TextInput
                  value={aapLicense.rhn_subscription_id || aapCfg.rhn_subscription_id || ''}
                  onChange={(_, v) => {
                    set('pre_installs.aap.rhn_subscription_id', v);
                    set('component_config.aap.rhn_subscription_id', v);
                  }}
                  placeholder="auto-select"
                />
              </FormGroup>
            </GridItem>
          </>
        )}
      </Grid>
    );
  };

  const renderAapInstallCard = () => {
    const aapCfg = data.component_config?.aap || {};
    return (
      <Grid hasGutter>
        <GridItem span={12}>
          <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '8px' }}>
            Installs AAP onto an OpenShift cluster during bootstrap. Using AAP /
            Contoller configuration on Core Environment is optional and is not
            required for this install. A cluster can have only one AAP operator
            version. All namespaces installs one cluster-scoped operator that
            can manage AAP CRs in every namespace (same version only). Namespaced
            limits the operator to this install namespace. Neither mode lets you
            run 2.6 and 2.7 side by side. If AAP is already installed
            cluster-scoped at the same version, this run reuses that operator
            instead of creating another OperatorGroup (avoids
            InterOperatorGroupOwnerConflict).
          </div>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('OpenShift API Host', openshiftHelp.apiHost)}>
            <TextInput
              value={data.openshift?.api_host || ''}
              onChange={(_, v) => set('openshift.api_host', v)}
            />
          </FormGroup>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('OpenShift TLS Certificate Verification', openshiftHelp.skipTls)}>
            <Checkbox
              id="install-aap-openshift-skip-tls"
              label="Skip TLS certificate verification"
              isChecked={data.openshift?.skip_tls_verify !== false}
              onChange={(_, v) => set('openshift.skip_tls_verify', v)}
            />
          </FormGroup>
        </GridItem>
        <GridItem span={12}>
          <FormGroup label={labelWithHelp('OpenShift API Token', openshiftHelp.token)}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <TextInput
                type={showOpenShiftToken ? 'text' : 'password'}
                value={data.openshift?.token || ''}
                onChange={(_, v) => set('openshift.token', v)}
              />
              <Button variant="secondary" onClick={() => setShowOpenShiftToken(!showOpenShiftToken)}>
                {showOpenShiftToken ? 'Hide' : 'Show'}
              </Button>
            </div>
          </FormGroup>
        </GridItem>
        {renderTextField('Hostname / Route host', 'component_config.aap.hostname')}
        {renderStorageClassField('Storage Class', 'component_config.aap.storage')}
        {renderTextField('Replicas', 'component_config.aap.replicas', 'number', 'Controller replicas (default 1).')}
        {renderTextField('Namespace', 'component_config.aap.namespace')}
        <GridItem span={6}>
          <FormGroup label="AAP Version">
            <select
              value={aapCompactVersion(aapCfg.deployment_version || data.aap?.version)}
              onChange={e => set('component_config.aap.deployment_version', aapDottedVersion(e.target.value))}
              style={{ width: '100%', height: '36px', padding: '8px' }}
            >
              {AAP_VERSION_OPTIONS.filter(option => option.value !== '24').map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FormGroup>
        </GridItem>
        <GridItem span={6}>
          <FormGroup
            label={labelWithHelp(
              'Operator scope',
              'All namespaces (cluster-scoped): one operator for the whole cluster; best when you may add same-version AAP instances later. Namespaced: operator only manages this namespace. Does not allow two AAP versions on one cluster.'
            )}
          >
            <select
              value={
                aapCfg.operator_scope === 'namespaced'
                  ? 'namespaced'
                  : 'all_namespaces'
              }
              onChange={e => set('component_config.aap.operator_scope', e.target.value)}
              style={{ width: '100%', height: '36px', padding: '8px' }}
            >
              <option value="all_namespaces">All namespaces (cluster-scoped)</option>
              <option value="namespaced">Namespaced (this namespace only)</option>
            </select>
          </FormGroup>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label="Minimal footprint">
            <Checkbox
              id="aap-minimal-footprint"
              label="Use minimal footprint installation"
              isChecked={!!aapCfg.minimal_footprint}
              onChange={(_, v) => set('component_config.aap.minimal_footprint', v)}
            />
          </FormGroup>
        </GridItem>
      </Grid>
    );
  };

  const renderInstallRunPanel = () => {
    const openshiftAgent = !!(
      data.pre_installs?.openshift_agent_enabled
      || data.pre_installs?.openshift_agent === true
    );

    return (
      <>
        <Title headingLevel="h2">OpenShift Install</Title>
        <p style={{ color: mutedTextColor, marginBottom: '12px' }}>
          OpenShift agent / install-config options. AAP operator install lives under
          Core Environment → Ansible Automation Platform → Install AAP.
          Component configuration stays on Core Environment.
        </p>
        <Card style={{ ...cardStyle, marginBottom: '16px' }}>
          <CardBody>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Git repository</div>
            <div style={{ color: mutedTextColor, fontSize: '13px' }}>
              OpenShift Install still generates and can push a playbook repo.
              Set SCM tool, repo URL, branch, and token on
              {' '}
              <button
                type="button"
                onClick={goToGitConfiguration}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: '#0066cc',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Core Environment → Git Configuration
              </button>
              {' '}
              (project Git URL is under Ansible Automation Platform Configuration on that tab).
            </div>
            {!standaloneRun
              && !String(data.git?.token || '').trim()
              && data.git?.auto_push !== false && (
              <div style={{ color: '#8a6d3b', fontSize: '13px', marginTop: '8px' }}>
                Auto-push is on, but no Git token is set. Add it on Git Configuration or turn auto-push off.
              </div>
            )}
            {data.scm_tool === 'bitbucket'
              && data.aap?.enabled !== false
              && !installAapFullRequested(data)
              && !String(data.git?.username || '').trim() && (
              <div style={{ color: '#8a6d3b', fontSize: '13px', marginTop: '8px' }}>
                Bitbucket is selected — set Bitbucket username on Git Configuration so Controller project sync can authenticate (username + HTTP access token, not OAuth2).
              </div>
            )}
          </CardBody>
        </Card>
        <Grid hasGutter>
          <GridItem span={6}>
            <Card style={cardStyle}>
              <CardBody>
                <Checkbox
                  id="openshift-agent-toggle"
                  label="OpenShift agent / install configure"
                  isChecked={openshiftAgent}
                  onChange={(_, v) => setOpenshiftAgent(v)}
                />
                <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '8px' }}>
                  When checked, show agent-based install-config builder options.
                </div>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem span={6}>
            <Card style={cardStyle}>
              <CardBody>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Install AAP</div>
                <div style={{ color: mutedTextColor, fontSize: '13px' }}>
                  Greenfield AAP operator install moved to{' '}
                  <button
                    type="button"
                    onClick={() => {
                      goToAapConfiguration();
                      setActiveAapConfigTab('install');
                      setAapOpen(true);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      color: '#0066cc',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    Ansible Automation Platform → Install AAP
                  </button>
                  .
                </div>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
        {openshiftAgent && (
          <Card style={{ ...cardStyle, marginTop: '16px' }}>
            <CardBody>
              <Title headingLevel="h2">OpenShift Agent / install-config</Title>
              {renderAgentInstallerConfig()}
            </CardBody>
          </Card>
        )}
      </>
    );
  };

  const renderDevspacesConfig = () => {
    const ds = data.component_config?.devspaces || {};
    return (
    <Grid hasGutter>
      {renderTextField('Hostname / Route host', 'component_config.devspaces.hostname')}
      {renderStorageClassField('Storage class', 'component_config.devspaces.storage')}
      {renderTextField('Replicas', 'component_config.devspaces.replicas', 'number')}
      {renderTextField('Namespace', 'component_config.devspaces.namespace')}
      <GridItem span={12}>
        <FormGroup label="Dashboard samples">
          <Checkbox
            id="devspaces-disable-samples"
            label="Remove default getting-started samples (show only custom samples/images)"
            isChecked={ds.disable_default_samples !== false}
            onChange={(_, v) => set('component_config.devspaces.disable_default_samples', v)}
          />
        </FormGroup>
      </GridItem>
      <GridItem span={12}>
        <FormGroup label="Customize default workspace">
          <Checkbox
            id="devspaces-customize-workspace"
            label="Customize main workspace defaults (devfile URL / container image)"
            isChecked={!!ds.customize_workspace}
            onChange={(_, v) => set('component_config.devspaces.customize_workspace', v)}
          />
        </FormGroup>
      </GridItem>
      {ds.customize_workspace && (
        <>
          {renderTextField('Default devfile URL (optional)', 'component_config.devspaces.default_devfile_url')}
          {renderTextField('Default workspace container image', 'component_config.devspaces.default_workspace_image')}
        </>
      )}
      {renderTextField('Che / Dev Spaces image tag (optional)', 'component_config.devspaces.che_image_tag')}
      {renderTextField('Dashboard image (optional)', 'component_config.devspaces.dashboard_image')}
    </Grid>
    );
  };

  const renderDevHubConfig = () => {
    const devHub = data.component_config?.dev_hub || {};
    const appsDomain = String(data.openshift?.apps_domain || '').trim();
    const instanceName = String(devHub.instance_name || 'chad-lab').trim() || 'chad-lab';
    const defaultHostname = appsDomain
      ? `backstage-${instanceName}-rhdh.${appsDomain}`
      : '';
    const defaultGitlabHost = appsDomain ? `gitlab-git.${appsDomain}` : '';
    const gitToken = String(data.git?.token || '').trim();

    return (
      <Grid hasGutter>
        {renderTextField(
          'Route hostname',
          'component_config.dev_hub.hostname',
          'text',
          defaultHostname
            ? `Developer Hub route. Default: ${defaultHostname}`
            : 'Developer Hub route hostname (set OpenShift apps domain for a default).'
        )}
        {renderStorageClassField('Storage class', 'component_config.dev_hub.storage', defaultComponentHelp.storage)}
        {renderTextField('Replicas', 'component_config.dev_hub.replicas', 'number')}
        {renderTextField(
          'Instance name',
          'component_config.dev_hub.instance_name',
          'text',
          'Backstage CR name. Example: chad-lab'
        )}
        {renderTextField(
          'GitLab host',
          'component_config.dev_hub.gitlab_host',
          'text',
          defaultGitlabHost
            ? `GitLab hostname for catalog integration. Default: ${defaultGitlabHost}`
            : 'GitLab hostname for catalog/scaffolder integration.'
        )}
        {renderTextField(
          'Catalog location URL',
          'component_config.dev_hub.catalog_url',
          'text',
          'Optional catalog-info.yaml URL in GitLab.'
        )}
        {renderTextField('Keycloak realm', 'component_config.dev_hub.keycloak_realm', 'text', 'Example: rhlab')}
        {renderTextField('Keycloak client ID', 'component_config.dev_hub.keycloak_client_id', 'text', 'Default: rhdh')}
        <GridItem span={6}>
          <FormGroup label={labelWithHelp(
            'GitLab token (catalog)',
            'GitLab personal/group access token for Developer Hub catalog and scaffolder. '
            + 'Defaults to the Git bootstrap token below when empty.'
          )}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <TextInput
                type="password"
                value={devHub.gitlab_token || ''}
                onChange={(_, v) => set('component_config.dev_hub.gitlab_token', v)}
                placeholder={gitToken ? 'Using Git bootstrap token' : 'glpat-…'}
              />
              <Button
                variant="secondary"
                isDisabled={!gitToken}
                onClick={() => {
                  setData(prev => {
                    const copy = JSON.parse(JSON.stringify(prev));
                    return syncDevHubGitlabTokenFromGit(copy, { force: true });
                  });
                }}
              >
                Use Git token
              </Button>
            </div>
            {gitToken && !(devHub.gitlab_token || '').trim() && (
              <div style={{ color: mutedTextColor, fontSize: '12px', marginTop: '6px' }}>
                Will use Git bootstrap token on export/bootstrap unless you enter a different token here.
              </div>
            )}
          </FormGroup>
        </GridItem>
        {renderTextField(
          'OIDC client secret (optional)',
          'component_config.dev_hub.oidc_client_secret',
          'password',
          'Leave empty to fetch from Keycloak after Deploy RHBK Client.'
        )}
      </Grid>
    );
  };

  const renderGitlabConfig = () => {
    const selectStyle = {
      width: '100%',
      minWidth: 0,
      padding: '8px',
      background: fieldBg,
      color: fieldColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px'
    };
    const showStandalone = (data.component_options?.gitlab || []).includes('standalone');
    return (
    <>
      {renderComponentOptions(
        'gitlab',
        'GitLab Options',
        'Choose Standalone for the RHEL Omnibus install (ADO | Install GitLab Standalone) — inventory host gitlab-ado / 192.168.0.65. Standalone hides OpenShift operator fields.'
      )}
      {!showStandalone && (
      <Grid hasGutter>
        {renderTextField(
          'Hostname / URL',
          'component_config.gitlab.hostname',
          'text',
          'OpenShift GitLab route. Lab default: gitlab-ado.server.lab.'
        )}
        {renderStorageClassField('Storage Class', 'component_config.gitlab.storage', defaultComponentHelp.storage)}
        {renderTextField('Replicas', 'component_config.gitlab.replicas', 'number')}
      </Grid>
      )}
      {showStandalone && (
        <Grid hasGutter style={{ marginTop: '12px' }}>
          <GridItem span={12}>
            <Title headingLevel="h3">Standalone RHEL GitLab</Title>
            <p style={{ color: mutedTextColor }}>
              Lab defaults: hostname <code>gitlab-ado.server.lab</code>, IP note <code>192.168.0.65</code>,
              root password <code>redhat123</code>, edition CE. Prefer gitlab-ce unless licensed for EE.
            </p>
          </GridItem>
          {renderTextField('VM hostname', 'component_config.gitlab.standalone_hostname', 'text')}
          {renderTextField('External URL', 'component_config.gitlab.standalone_external_url', 'text')}
          {renderTextField('IP note (inventory)', 'component_config.gitlab.standalone_ip_note', 'text')}
          {renderTextField('Root password', 'component_config.gitlab.standalone_root_password', 'password')}
          <GridItem span={6}>
            <FormGroup label="Edition">
              <select
                value={data.component_config?.gitlab?.standalone_edition || 'ce'}
                onChange={e => set('component_config.gitlab.standalone_edition', e.target.value)}
                style={selectStyle}
              >
                <option value="ce">CE (gitlab-ce)</option>
                <option value="ee">EE (gitlab-ee, licensed)</option>
              </select>
            </FormGroup>
          </GridItem>
          {renderTextField('HTTP port', 'component_config.gitlab.standalone_http_port', 'number')}
          {renderTextField('HTTPS port', 'component_config.gitlab.standalone_https_port', 'number')}
          {renderTextField('Airgap RPM path (Contoller)', 'component_config.gitlab.standalone_rpm_path', 'text')}
          {renderTextField('Airgap RPM URL', 'component_config.gitlab.standalone_rpm_url', 'text')}
          {renderStandaloneTlsAndRhn('gitlab')}
        </Grid>
      )}
    </>
    );
  };

  const renderConfigForm = (panelOverride = null) => {
    const panel = panelOverride || activeConfigPanel || 'all';

    switch (panel) {
      case 'all':
        return renderAllConfig();
      case 'openshift':
        return renderOpenShiftGroupConfig();
      case 'admin_htpasswd':
        return renderOpenShiftAdminHtpasswdConfig();
      case 'console_banner':
        return renderOpenShiftConsoleBannerConfig();
      case 'oauth_rhbk':
        return renderOpenShiftOAuthRhbkConfig();
      case 'ldap_auth':
        return renderOpenShiftLdapAuthConfig();
      case 'discover_routes_print':
        return renderOpenShiftDiscoverRoutesConfig();
      case 'alternate_routes':
        return renderOpenShiftAlternateRoutesConfig();
      case 'devspaces':
        return renderDevspacesConfig();
      case 'dev_hub':
        return renderDevHubConfig();
      case 'acm':
        return renderAcmConfig();
      case 'acs':
        return renderAcsConfig();
      case 'rhel':
        return renderRhelConfig();
      case 'patching':
        return renderPatchingConfig();
      case 'aws':
        return renderAwsConfig();
      case 'provision':
        return renderProvisionConfig();
      case 'jira':
        return renderJiraConfig();
      case 'grafana':
        return renderGrafanaConfig();
      case 'gitlab':
        return renderGitlabConfig();
      case 'rhbk':
        return renderRhbkConfig();
      case 'satellite':
        return renderSatelliteConfig();
      case 'idm':
        return renderIdmConfig();
      case 'compliance':
        return renderComplianceConfig();
      case 'stig':
        return renderStigConfig();
      default:
        return renderDefaultComponentConfig(panel);
    }
  };

  const isVaultKey = key => {
    const k = String(key || '').toLowerCase();
    return (
      k.includes('password') ||
      k.includes('token') ||
      k.includes('secret') ||
      k.includes('vault') ||
      k.includes('credential')
    );
  };

  const yamlValue = value => {
    if (value === null || value === undefined || value === '') return '""';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);

    const text = String(value);

    if (text.includes('{{') || text.includes('}}')) {
      return text;
    }

    if (
      text.includes(':') ||
      text.includes('#') ||
      text.includes('@') ||
      text.includes(' ') ||
      text.startsWith('http')
    ) {
      return JSON.stringify(text);
    }

    return text;
  };

  const objectToYaml = obj => {
    return Object.entries(obj || {})
      .map(([key, value]) => `${key}: ${yamlValue(value)}`)
      .join('\n');
  };

  const buildYamlPreview = component => {
    let vars = {};
    let vault = {};

    if (component === 'openshift') {
      vars = {
        host: data.openshift.api_host,
        app_domain: 'apps.{{ domain }}'
      };

      vault = {
        token: data.openshift.token
      };
    } else if (component === 'jira') {
      vars = {
        url: data.jira.url,
        project_key: data.jira.project_key,
        custom_ac_field: data.jira.custom_ac_field,
        templates_dir: data.jira.templates_dir,
        create_subtasks: data.jira.create_subtasks,
        username: data.jira.username
      };

      vault = {
        token: data.jira.token
      };
    } else {
      const source = data.component_config?.[component] || {};
      Object.entries(source).forEach(([key, value]) => {
        if (isVaultKey(key)) {
          vault[key] = value;
        } else {
          vars[key] = value;
        }
      });
    }

    const vaultMasked = {};
    Object.keys(vault).forEach(key => {
      vaultMasked[key] = showVaultYaml ? vault[key] : '********';
    });

    const varsYaml = objectToYaml(vars);
    const vaultYaml = Object.keys(vaultMasked).length > 0
      ? objectToYaml(vaultMasked)
      : '# no vault values detected for this component';

    return `vars_${component}.yml:
---
${varsYaml}


vault_${component}.yml:
---
${vaultYaml}
`;
  };

  const renderConfigYaml = () => (
    <>
      <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', color: mutedTextColor }}>
          Generated YAML preview. Passwords, tokens, credentials, secrets, and vault values are masked by default.
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => setShowVaultYaml(!showVaultYaml)}>
            {showVaultYaml ? 'Hide vault values' : 'Show vault values'}
          </Button>
        </div>
      </div>

      <Grid hasGutter>
        <GridItem span={6}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>
            vars_{activeConfigPanel}.yml
          </div>
          <textarea
            value={buildYamlPreview(activeConfigPanel).split(`\n\nvault_${activeConfigPanel}.yml:`)[0].replace(`vars_${activeConfigPanel}.yml:\n`, '')}
            readOnly
            spellCheck="false"
            style={{
              width: '100%',
              minHeight: '360px',
              background: '#151515',
              color: '#f0f0f0',
              fontFamily: 'monospace',
              fontSize: '13px',
              lineHeight: '1.45',
              border: '1px solid #3c3c3c',
              borderRadius: '4px',
              padding: '14px'
            }}
          />
        </GridItem>

        <GridItem span={6}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>
            vault_{activeConfigPanel}.yml
          </div>
          <textarea
            value={
              '---\n' +
              buildYamlPreview(activeConfigPanel)
                .split(`\n\nvault_${activeConfigPanel}.yml:\n---\n`)[1]
            }
            readOnly
            spellCheck="false"
            style={{
              width: '100%',
              minHeight: '360px',
              background: '#151515',
              color: '#f0f0f0',
              fontFamily: 'monospace',
              fontSize: '13px',
              lineHeight: '1.45',
              border: '1px solid #3c3c3c',
              borderRadius: '4px',
              padding: '14px'
            }}
          />
        </GridItem>
      </Grid>
    </>
  );

  const getVisibleConfigTabs = () => {
    const selected = data.components || [];

    if (selected.length === 0) {
      return [];
    }

    if (selected.includes('all')) {
      return [
        'all',
        'openshift',
        'rhel',
        'patching',
        'provision',
        'aws',
        'grafana',
        'rhbk',
        'satellite',
        'idm',
        'kafka',
        'gitlab',
        'pega',
        'aap',
        'acm',
        'acs',
        'compliance',
        'stig'
      ];
    }

    if (selected.includes('openshift')) {
      const tabs = ['openshift'];
      (data.component_options?.openshift || []).forEach(option => {
        const optionTabs = [
          'admin_htpasswd',
          'console_banner',
          'oauth_rhbk',
          'ldap_auth',
          'discover_routes_print',
          'alternate_routes'
        ];
        if (!optionTabs.includes(option)) {
          return;
        }
        if (!tabs.includes(option)) {
          tabs.push(option);
        }
      });
      (data.component_apps?.openshift || []).forEach(app => {
        if (['acm', 'acs', 'devspaces', 'dev_hub'].includes(app) && !tabs.includes(app)) {
          tabs.push(app);
        }
        if (simpleComponents.includes(app) && !tabs.includes(app)) {
          tabs.push(app);
        }
      });
      return tabs;
    }

    if (selected.includes('rhel')) {
      const tabs = ['rhel'];
      (data.component_apps?.rhel || []).forEach(app => {
        if (simpleComponents.includes(app) && !tabs.includes(app)) {
          tabs.push(app);
        }
      });
      return tabs;
    }

    if (selected.includes('patching')) {
      const tabs = ['patching'];
      (data.component_apps?.patching || []).forEach(app => {
        if (simpleComponents.includes(app) && !tabs.includes(app)) {
          tabs.push(app);
        }
      });
      return tabs;
    }

    if (selected.includes('provision')) {
      return ['provision'];
    }

    if (selected.includes('aws')) {
      return ['aws'];
    }

    return selected.filter(component => !groupComponents.includes(component));
  };

  const configTabLabel = tab => {
    if (tab === 'all') return 'All';
    if (tab === 'openshift') return 'OpenShift';
    if (tab === 'admin_htpasswd') return 'Admin HTPasswd';
    if (tab === 'oauth_rhbk') return 'OAuth / RHBK';
    if (tab === 'ldap_auth') return 'LDAP Auth';
    if (tab === 'discover_routes_print') return 'Discover Routes';
    if (tab === 'alternate_routes') return 'Alternate Routes';
    if (tab === 'acm') return 'ACM';
    if (tab === 'acs') return 'ACS';
    if (tab === 'devspaces') return 'Dev Spaces';
    if (tab === 'dev_hub') return 'Dev Hub';
    if (tab === 'console_banner') return 'Console Banner';
    if (tab === 'rhel') return 'RHEL';
    if (tab === 'patching') return 'Patching';
    if (tab === 'aws') return 'AWS';
    if (tab === 'provision') return 'Provision';
    if (tab === 'rhbk') return 'RHBK (Keycloak)';
    if (tab === 'idm') return 'IDM';
    if (tab === 'aap') return 'AAP';
    if (tab === 'stig') return 'STIG';
    return tab.charAt(0).toUpperCase() + tab.slice(1);
  };

  const renderActiveConfigPanel = () => {
    const visibleTabs = getVisibleConfigTabs();
    const selectedTab = visibleTabs.includes(activeConfigTab) ? activeConfigTab : (visibleTabs[0] || 'all');

    return (
      <>
        <Card style={cardStyle}>
          <CardBody>
            <Title headingLevel="h2">Component Configuration</Title>
            <p style={{ color: mutedTextColor, marginTop: '8px' }}>
              Select a tab to configure available options for that component or group.
            </p>

            <div style={{ marginTop: '12px' }}>
              <Tabs
                activeKey={selectedTab}
                onSelect={(_, key) => {
                  if (key && key !== 'all') {
                    ensureComponentConfig(key);
                  }
                  setActiveConfigTab(key);
                  setActiveConfigPanel(key);
                  setConfigTab('form');
                  setYamlError('');
                }}
              >
                {visibleTabs.map(tab => (
                  <Tab
                    key={tab}
                    eventKey={tab}
                    title={configTabLabel(tab)}
                  />
                ))}
              </Tabs>
            </div>

            <div style={{ marginTop: '16px' }}>
              {renderConfigForm(selectedTab)}
            </div>
          </CardBody>
        </Card>
        <br />
      </>
    );
  };

  const openAdoMarkdownLink = href => {
    const roleMatch = String(href || '').match(/^roles\/([^/]+)\/README\.md$/);

    if (!roleMatch) return false;

    fetch(`/api/readme/ado/role/${encodeURIComponent(roleMatch[1])}`)
      .then(r => {
        if (!r.ok) throw new Error('ADO role README request failed');
        return r.text();
      })
      .then(text => {
        setAdoReadmeMarkdown(text);
        setDocumentationType('ado');
        setDocumentationOpen(true);
      })
      .catch(() => {
        setAdoReadmeMarkdown(`# ADO Role Documentation Unavailable\n\nCould not load \`${href}\`.`);
        setDocumentationType('ado');
        setDocumentationOpen(true);
      });

    return true;
  };

  const renderInlineMarkdown = text => {
    const parts = String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const label = link[1];
        const href = link[2];
        return (
          <a
            key={index}
            href={href}
            onClick={event => {
              if (openAdoMarkdownLink(href)) {
                event.preventDefault();
              }
            }}
          >
            {label}
          </a>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  const renderMarkdownDocument = markdown => {
    const lines = String(markdown || '').split('\n');
    const elements = [];
    let codeLines = [];
    let listItems = [];
    let orderedListItems = [];
    let tableLines = [];
    let paragraphLines = [];
    let inCode = false;

    const flushParagraph = () => {
      if (paragraphLines.length === 0) return;
      elements.push(
        <p key={`p-${elements.length}`} style={{ lineHeight: 1.55 }}>
          {renderInlineMarkdown(paragraphLines.join(' '))}
        </p>
      );
      paragraphLines = [];
    };

    const flushList = () => {
      if (listItems.length === 0) return;
      elements.push(
        <ul key={`ul-${elements.length}`} style={{ paddingLeft: '24px', lineHeight: 1.55 }}>
          {listItems.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    };

    const flushOrderedList = () => {
      if (orderedListItems.length === 0) return;
      elements.push(
        <ol key={`ol-${elements.length}`} style={{ paddingLeft: '24px', lineHeight: 1.55 }}>
          {orderedListItems.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      orderedListItems = [];
    };

    const flushTable = () => {
      if (tableLines.length === 0) return;
      const rows = tableLines
        .filter(line => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line))
        .map(line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));

      if (rows.length > 0) {
        const [header, ...body] = rows;
        elements.push(
          <div key={`table-${elements.length}`} style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: `1px solid ${borderColor}`,
                fontSize: '14px'
              }}
            >
              <thead>
                <tr>
                  {header.map((cell, index) => (
                    <th
                      key={index}
                      style={{
                        textAlign: 'left',
                        padding: '8px',
                        border: `1px solid ${borderColor}`,
                        background: isDark ? '#1f1f1f' : '#f5f5f5'
                      }}
                    >
                      {renderInlineMarkdown(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        style={{
                          padding: '8px',
                          border: `1px solid ${borderColor}`,
                          verticalAlign: 'top'
                        }}
                      >
                        {renderInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      tableLines = [];
    };

    const flushCode = () => {
      elements.push(
        <pre
          key={`code-${elements.length}`}
          style={{
            background: isDark ? '#151515' : '#f5f5f5',
            color: isDark ? '#f0f0f0' : '#151515',
            border: `1px solid ${borderColor}`,
            borderRadius: '4px',
            padding: '12px',
            overflowX: 'auto'
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      codeLines = [];
    };

    lines.forEach(line => {
      if (line.startsWith('```')) {
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          flushParagraph();
          flushList();
          flushOrderedList();
          flushTable();
          inCode = true;
          codeLines = [];
        }
        return;
      }

      if (inCode) {
        codeLines.push(line);
        return;
      }

      if (line.trim() === '---') {
        flushParagraph();
        flushList();
        flushOrderedList();
        flushTable();
        elements.push(<hr key={`hr-${elements.length}`} style={{ borderColor }} />);
        return;
      }

      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        flushList();
        flushOrderedList();
        flushTable();
        const level = heading[1].length;
        const fontSize = level === 1 ? '24px' : level === 2 ? '20px' : '17px';
        elements.push(
          <div
            key={`h-${elements.length}`}
            style={{
              fontSize,
              fontWeight: 700,
              marginTop: level === 1 ? '18px' : '16px',
              marginBottom: '8px'
            }}
          >
            {renderInlineMarkdown(heading[2])}
          </div>
        );
        return;
      }

      if (line.startsWith('- ')) {
        flushParagraph();
        flushOrderedList();
        flushTable();
        listItems.push(line.slice(2));
        return;
      }

      const orderedItem = line.match(/^\d+\.\s+(.*)$/);
      if (orderedItem) {
        flushParagraph();
        flushList();
        flushTable();
        orderedListItems.push(orderedItem[1]);
        return;
      }

      if (line.includes('|') && line.trim().length > 0) {
        flushParagraph();
        flushList();
        flushOrderedList();
        tableLines.push(line);
        return;
      }

      if (line.trim() === '') {
        flushParagraph();
        flushList();
        flushOrderedList();
        flushTable();
        return;
      }

      paragraphLines.push(line.trim());
    });

    if (inCode) flushCode();
    flushParagraph();
    flushList();
    flushOrderedList();
    flushTable();

    return elements;
  };

  const renderDocumentation = () => (
    <Card style={cardStyle}>
      <CardBody>
        <Title headingLevel="h2">
          {documentationType === 'ado' ? 'ADO Collection Documentation' : 'ADO Preflight UI Documentation'}
        </Title>
        <div style={{ marginTop: '16px', maxWidth: '980px' }}>
          {renderMarkdownDocument(documentationType === 'ado' ? adoReadmeMarkdown : readmeMarkdown)}
        </div>
      </CardBody>
    </Card>
  );

  const renderCollectionsTools = () => (
    <>
      <Card style={cardStyle}>
        <CardBody>
          <Title headingLevel="h2">Bootstrap Environment</Title>
          <br />

          <div style={{ fontWeight: 700, marginBottom: '8px' }}>
            ADO Pre-Flight UI Version
          </div>

          <Grid hasGutter>
            {[
              ['UI Version', uiVersion?.version || 'unknown'],
              ['Image', uiVersion?.image || 'unknown'],
              ['Image Tag', uiVersion?.imageTag || 'unknown'],
              ['Pod / Container', uiVersion?.podName || 'unknown'],
              ['Node.js', uiVersion?.nodeVersion || 'unknown']
            ].map(([label, value]) => (
              <GridItem key={label} span={4}>
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: isDark ? '#1f1f1f' : '#f5f5f5',
                    borderRadius: '4px',
                    border: `1px solid ${borderColor}`,
                    minHeight: '58px'
                  }}
                >
                  <div style={{ color: mutedTextColor, fontSize: '12px', marginBottom: '4px' }}>
                    {label}
                  </div>
                  <strong style={{ overflowWrap: 'anywhere' }}>{value}</strong>
                </div>
              </GridItem>
            ))}
          </Grid>

          <br />

          <Grid hasGutter>
            <GridItem span={6}>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>
                Collections included in this container
              </div>

              <div
                style={{
                  marginBottom: '12px',
                  padding: '12px',
                  backgroundColor: isDark ? '#1f1f1f' : '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '13px',
                  border: `1px solid ${borderColor}`
                }}
              >
                {collectionVersions.length > 0 ? (
                  collectionVersions.map(c => (
                    <div
                      key={c.file}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '16px',
                        padding: '3px 0',
                        borderBottom: isDark ? '1px solid #333' : '1px solid #e0e0e0'
                      }}
                    >
                      <span>
                        ✓ {c.name === 'infra-ado' ? 'infra.ado' : c.name.replaceAll('-', '.')}
                      </span>
                      <strong>{c.version}</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ color: mutedTextColor }}>
                    No collection metadata returned yet.
                  </div>
                )}
              </div>

              <div style={{ color: mutedTextColor, fontSize: '13px' }}>
                Collections are installed automatically by the container. The old split ADO collections can remain in source control for now, but this UI now prefers the single <strong>infra.ado</strong> collection when present.
              </div>
            </GridItem>

            <GridItem span={6}>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>
                Local tools expected in the container
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: isDark ? '#1f1f1f' : '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '13px',
                  border: `1px solid ${borderColor}`
                }}
              >
                {[
                  'ansible-core',
                  'ansible-galaxy',
                  'git',
                  'python',
                  'node',
                  'podman compatible runtime',
                  'oc / kubectl if baked into image'
                ].map(tool => (
                  <div key={tool} style={{ padding: '3px 0' }}>
                    ✓ {tool}
                  </div>
                ))}
              </div>

              <br />

              <div style={{ fontWeight: 700, marginBottom: '8px' }}>
                Runtime behavior
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: isDark ? '#1f1f1f' : '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '13px',
                  border: `1px solid ${borderColor}`
                }}
              >
                <div>✓ Installs collections into <code>/workspace/collections</code></div>
                <div>✓ Generates env vars, playbooks, AAP configs, job templates, and workflows</div>
                <div>✓ Uses <code>infra.ado.bootstrap_controller</code></div>
                <div>✓ Supports optional Git commit and push</div>
              </div>
            </GridItem>
          </Grid>
        </CardBody>
      </Card>
      <br />
    </>
  );

  return (
    <Page
      masthead={
        <Masthead
          style={{
            background: '#151515',
            borderBottom: '3px solid #ee0000',
            padding: '6px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            overflow: 'visible',
            zIndex: 3000
          }}
        >
          <MastheadMain>
            <MastheadBrand>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <img src={adoLogo} alt="ADO" style={{ height: '54px', background: 'white', borderRadius: '6px', padding: '4px' }} />
                <div>
                  <div style={{ color: 'white', fontSize: '20px', fontWeight: 700 }}>
                    Automation Development Office
                  </div>
                  <div style={{ color: '#d2d2d2', fontSize: '13px' }}>
                    Ansible Automation Pre-Flight
                  </div>
                </div>
              </div>
            </MastheadBrand>
          </MastheadMain>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingRight: '28px', position: 'relative', zIndex: 6000 }}>
            <Tooltip content={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
              <Button
                variant="plain"
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                style={{
                  color: '#ffffff',
                  fontSize: '18px',
                  padding: '6px',
                  minWidth: '32px'
                }}
              >
                {isDark ? '☾' : '⚙'}
              </Button>
            </Tooltip>

            <Dropdown
              isOpen={helpOpen}
              onOpenChange={(open) => setHelpOpen(open)}
              popperProps={{
                position: 'right',
                appendTo: () => document.body
              }}
              toggle={(toggleRef) => (
                <Button
                  ref={toggleRef}
                  variant="plain"
                  onClick={() => setHelpOpen(!helpOpen)}
                  style={{
                    color: '#ffffff',
                    fontSize: '16px',
                    padding: '6px',
                    minWidth: '32px',
                    fontWeight: 700
                  }}
                >
                  ?
                </Button>
              )}
            >
              <DropdownList style={{ minWidth: '260px' }}>
                <DropdownItem
                  onClick={() => {
                    setDocumentationType('ado');
                    setDocumentationOpen(true);
                    setHelpOpen(false);
                  }}
                >
                  ADO Collection Documentation
                </DropdownItem>

                <DropdownItem
                  onClick={() => {
                    setDocumentationType('ui');
                    setDocumentationOpen(true);
                    setHelpOpen(false);
                  }}
                >
                  ADO Preflight UI Documentation
                </DropdownItem>

                <DropdownItem
                  onClick={() => {
                    setCollectionsToolsOpen(true);
                    setHelpOpen(false);
                  }}
                >
                  Show Collections
                </DropdownItem>
              </DropdownList>
            </Dropdown>
          </div>
        </Masthead>
      }
    >
      {collectionsToolsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px'
          }}
        >
          <div
            style={{
              width: '82%',
              maxWidth: '1200px',
              maxHeight: '82vh',
              overflowY: 'auto',
              background: cardBg,
              color: textColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title headingLevel="h2">Collections and Local Ansible Tools</Title>
              <Button variant="plain" onClick={() => setCollectionsToolsOpen(false)}>
                ×
              </Button>
            </div>

            <br />

            {renderCollectionsTools()}
          </div>
        </div>
      )}

      {documentationOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px'
          }}
        >
          <div
            style={{
              width: '82%',
              maxWidth: '1200px',
              maxHeight: '82vh',
              overflowY: 'auto',
              background: cardBg,
              color: textColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title headingLevel="h2">
                {documentationType === 'ado' ? 'ADO Collection Documentation' : 'ADO Preflight UI Documentation'}
              </Title>
              <Button variant="plain" onClick={() => setDocumentationOpen(false)}>
                ×
              </Button>
            </div>

            <br />

            {renderDocumentation()}
          </div>
        </div>
      )}

      <PageSection style={{ ...sectionStyle, paddingTop: '20px', paddingBottom: '20px' }}>
        <div style={contentShellStyle}>
          <Title headingLevel="h1">Ansible Automation Pre-Flight Questionnaire</Title>
          <p style={{ marginTop: '8px', color: mutedTextColor }}>
            Generate and run component-based bootstrap automation inside a local Podman container.
          </p>
        </div>
      </PageSection>

      <PageSection isWidthLimited style={{ ...sectionStyle, minHeight: 'calc(100vh - 110px)', paddingTop: isDark ? '0' : undefined }}>
        <div style={contentShellStyle}>
        <Form>
          <Card style={cardStyle}>
            <CardBody>
              <Tabs
                activeKey={activeMainTab === 'pre_installs' ? 'install' : activeMainTab}
                onSelect={(_, key) => setActiveMainTab(key === 'pre_installs' ? 'install' : key)}
                style={{ marginBottom: '16px' }}
              >
                <Tab eventKey="core" title="Core Environment" />
                <Tab eventKey="install" title="OpenShift Install" />
              </Tabs>

              {activeMainTab === 'core' && (
                <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <Title headingLevel="h2">Core Environment Information</Title>
                  {importStatus && (
                    <div style={{ color: importStatus.startsWith('Import failed') ? '#c9190b' : mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                      {importStatus}
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={importJsonFile}
                  />
                  <Button variant="secondary" onClick={() => importFileRef.current?.click()}>
                    Upload JSON
                  </Button>
                </div>
              </div>

              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="Environment Type" isRequired>
                    <TextInput value={data.environment} onChange={(_, v) => set('environment', v)} />
                  </FormGroup>
                </GridItem>

                <GridItem span={6}>
                  <FormGroup label="Base Infrastructure Domain" isRequired>
                    <TextInput value={data.domain} onChange={(_, v) => set('domain', v)} />
                  </FormGroup>
                </GridItem>

                <GridItem span={12}>
                  <FormGroup
                    label={labelWithHelp(
                      <>
                        Additional Environments
                        <span style={{ color: mutedTextColor, fontWeight: 400 }}> (optional)</span>
                      </>,
                      <>
                        <p style={{ marginTop: 0 }}>
                          Survey choices for Contoller job templates (for example <code>prod</code>, <code>dev</code>, <code>pilot</code>).
                          <code>prod</code> is selected by default.
                        </p>
                        <p style={{ marginBottom: 0 }}>
                          Does not create <code>group_vars</code> directories. The primary Environment Type above is always included.
                        </p>
                      </>
                    )}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', marginBottom: '8px' }}>
                      {ADDITIONAL_ENV_PRESETS.map(name => {
                        const primary = String(data.environment || '').trim().toLowerCase();
                        const isPrimary = primary === name;
                        const isChecked = isPrimary
                          || additionalEnvironmentsList.some(item => item.toLowerCase() === name);
                        return (
                        <Checkbox
                          key={`additional-env-${name}`}
                          id={`additional-env-${name}`}
                          label={name}
                          isChecked={isChecked}
                          isDisabled={isPrimary}
                          onChange={() => toggleAdditionalEnvPreset(name)}
                        />
                        );
                      })}
                      <Checkbox
                        id="additional-env-other"
                        label="Other"
                        isChecked={additionalEnvOtherEnabled || additionalEnvCustom.length > 0}
                        onChange={(_, checked) => {
                          setAdditionalEnvOtherEnabled(checked);
                          if (!checked) {
                            setAdditionalEnvOtherDraft('');
                            setAdditionalEnvironments(
                              additionalEnvironmentsList.filter(name =>
                                ADDITIONAL_ENV_PRESETS.includes(name.toLowerCase())
                              )
                            );
                          }
                        }}
                      />
                    </div>
                    {(additionalEnvOtherEnabled || additionalEnvCustom.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '520px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <TextInput
                            value={additionalEnvOtherDraft}
                            onChange={(_, v) => setAdditionalEnvOtherDraft(v)}
                            placeholder="custom-env"
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                addAdditionalEnvOther();
                              }
                            }}
                          />
                          <Button variant="secondary" onClick={addAdditionalEnvOther}>
                            Add
                          </Button>
                        </div>
                        {additionalEnvCustom.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {additionalEnvCustom.map(name => (
                              <span
                                key={`custom-env-${name}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  border: `1px solid ${borderColor}`,
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '13px'
                                }}
                              >
                                {name}
                                <Button variant="plain" onClick={() => removeAdditionalEnvCustom(name)} aria-label={`Remove ${name}`}>
                                  ×
                                </Button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </FormGroup>
                </GridItem>

                <GridItem span={12}>
                  <FormGroup label="Bootstrap Components" isRequired>
                    <div style={{ marginBottom: '10px', color: mutedTextColor, fontSize: '13px' }}>
                      Click component text to populate vars/vault files.
                    </div>
                    
                    <Grid hasGutter>
                      <GridItem span={6}>
                        <Checkbox
                          label="all"
                          isChecked={data.components.includes('all')}
                          onChange={() => toggleComponentAndOpen('all')}
                        />

                        {renderExpandableComponent('openshift', openshiftOpen, setOpenshiftOpen, openshiftApps)}
                        {renderExpandableComponent('rhel', rhelOpen, setRhelOpen, rhelApps)}
                        {renderExpandableComponent('patching', patchingOpen, setPatchingOpen, patchingApps)}
                        {renderExpandableComponent('aws', awsOpen, setAwsOpen, awsApps)}
                        {renderExpandableComponent('provision', provisionOpen, setProvisionOpen, provisionApps)}
                      </GridItem>

                      <GridItem span={6}>
                        <Grid hasGutter>
                          {simpleComponents.map(component => (
                            <GridItem key={component} span={6}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Checkbox
                                  label=""
                                  isChecked={data.components.includes(component)}
                                  isDisabled={isStandaloneDisabled()}
                                  onChange={() => toggleComponentAndOpen(component)}
                                />
                                {renderComponentLabel(component)}
                              </div>
                            </GridItem>
                          ))}
                        </Grid>
                      </GridItem>
                    </Grid>
                  </FormGroup>
                </GridItem>
              </Grid>
                </>
              )}

              {activeMainTab === 'install' && renderInstallRunPanel()}
            </CardBody>
          </Card>

          {activeMainTab === 'core' && (
            <>
          <br />

          {renderActiveConfigPanel()}

          {renderCredentialConfigCard()}

          <br />

          <Card style={cardStyle} id="git-configuration">
            <CardBody>
              <Title headingLevel="h2">Git Configuration</Title>

              <Grid hasGutter>
                <GridItem span={4}>
                  <FormGroup label="SCM Tool" isRequired>
                    {['gitlab','bitbucket','github','other'].map(v =>
                      <Radio
                        key={v}
                        label={v}
                        name="scm"
                        isChecked={data.scm_tool === v}
                        onChange={() => set('scm_tool', v)}
                      />
                    )}
                  </FormGroup>
                  {data.scm_tool === 'bitbucket' && (
                    <p style={{ color: mutedTextColor, marginTop: '6px', marginBottom: 0 }}>
                      Local bootstrap git uses <code>Authorization: Bearer</code>. Controller project sync uses your Bitbucket username plus HTTP access token (not OAuth2).
                    </p>
                  )}

                  <br />

                  <Checkbox
                    label="Automatically commit and push generated content to Git"
                    isChecked={data.git.auto_push}
                    isDisabled={standaloneRun}
                    onChange={(_, v) => set('git.auto_push', v)}
                  />
                  {standaloneRun && (
                    <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: 0, fontSize: '13px' }}>
                      Auto-push is off for Run AAP tabs only (Hub/Galaxy/auth). Re-enable here if you need a git push.
                    </p>
                  )}

                  <br />

                  <Title headingLevel="h4">
                    {labelWithHelp('Git overrides (local pod git repo)', gitHelp.gitOverrides)}
                  </Title>
                  <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: '8px', fontSize: '13px' }}>
                    Default is all unchecked: bootstrap only applies changes to the pod clone (no remove or force overwrite).
                  </p>

                  <Checkbox
                    id="git-override-group-vars-env"
                    label={labelWithHelp(
                      `Override group_vars/all/${data.environment || 'env'} (current Environment Type)`,
                      gitHelp.overrideGroupVarsEnv
                    )}
                    isChecked={data.git?.overrides?.group_vars_current_env === true}
                    isDisabled={data.git.vars_only === true || data.git?.overrides?.all === true}
                    onChange={(_, v) => {
                      setData(prev => {
                        const copy = JSON.parse(JSON.stringify(prev));
                        if (!copy.git) copy.git = {};
                        if (!copy.git.overrides) copy.git.overrides = { ...defaults.git.overrides };
                        copy.git.overrides.group_vars_current_env = v === true;
                        if (!v) copy.git.overrides.all = false;
                        copy.git.overwrite_generated = copy.git.overrides.all === true;
                        return copy;
                      });
                    }}
                  />

                  <br />

                  <Checkbox
                    id="git-override-job-workflow-templates"
                    label={labelWithHelp(
                      'Override job and workflow templates (configs/job_templates and configs/workflows)',
                      gitHelp.overrideJobWorkflowTemplates
                    )}
                    isChecked={data.git?.overrides?.job_and_workflow_templates === true}
                    isDisabled={data.git.vars_only === true || data.git?.overrides?.all === true}
                    onChange={(_, v) => {
                      setData(prev => {
                        const copy = JSON.parse(JSON.stringify(prev));
                        if (!copy.git) copy.git = {};
                        if (!copy.git.overrides) copy.git.overrides = { ...defaults.git.overrides };
                        copy.git.overrides.job_and_workflow_templates = v === true;
                        if (!v) copy.git.overrides.all = false;
                        copy.git.overwrite_generated = copy.git.overrides.all === true;
                        return copy;
                      });
                    }}
                  />

                  <br />

                  <Checkbox
                    id="git-override-all"
                    label={labelWithHelp(
                      'Override all (re-clone and wipe group_vars, playbooks, and configs)',
                      gitHelp.overrideAll
                    )}
                    isChecked={data.git?.overrides?.all === true}
                    isDisabled={data.git.vars_only === true}
                    onChange={(_, v) => {
                      setData(prev => {
                        const copy = JSON.parse(JSON.stringify(prev));
                        if (!copy.git) copy.git = {};
                        if (!copy.git.overrides) copy.git.overrides = { ...defaults.git.overrides };
                        copy.git.overrides.all = v === true;
                        if (v === true) {
                          copy.git.overrides.group_vars_current_env = true;
                          copy.git.overrides.job_and_workflow_templates = true;
                        } else {
                          copy.git.overrides.group_vars_current_env = false;
                          copy.git.overrides.job_and_workflow_templates = false;
                        }
                        copy.git.overwrite_generated = copy.git.overrides.all === true;
                        return copy;
                      });
                    }}
                  />
                  {data.git.vars_only === true && (
                    <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: 0, fontSize: '13px' }}>
                      Git overrides are disabled while Vars / Vault files only is checked (vars for the current env are always regenerated).
                    </p>
                  )}

                  <br />

                  <Checkbox
                    id="git-skip-tls-verify"
                    label={labelWithHelp('Skip TLS/SSL verification for Git (self-signed certificates)', gitHelp.skipTlsVerify)}
                    isChecked={data.git.skip_tls_verify !== false}
                    onChange={(_, v) => set('git.skip_tls_verify', v)}
                  />
                </GridItem>

                <GridItem span={8}>
                  <FormGroup label="Project Git Source URL">
                    <TextInput value={data.aap.git_url} onChange={(_, v) => set('aap.git_url', v)} />
                  </FormGroup>

                  <br />

                  <FormGroup label="Git Branch">
                    <TextInput value={data.aap.git_branch} onChange={(_, v) => set('aap.git_branch', v)} />
                  </FormGroup>

                  <br />

                  {data.scm_tool === 'bitbucket' && (
                    <>
                      <FormGroup label="Bitbucket username" isRequired>
                        <TextInput
                          value={data.git.username}
                          onChange={(_, v) => set('git.username', v)}
                          placeholder="Account username for HTTP access token"
                        />
                      </FormGroup>

                      <br />
                    </>
                  )}

                  <FormGroup label="Git Token">
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <TextInput
                        type={showGitToken ? 'text' : 'password'}
                        value={data.git.token}
                        onChange={(_, v) => {
                          setData(prev => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            copy.git.token = v;
                            const devHubSelected = (copy.component_apps?.openshift || []).includes('dev_hub')
                              || selectedComponentAppsFrom(copy).includes('dev_hub');
                            if (devHubSelected) {
                              if (!copy.component_config) copy.component_config = {};
                              if (!copy.component_config.dev_hub) copy.component_config.dev_hub = {};
                              const cur = String(copy.component_config.dev_hub.gitlab_token || '').trim();
                              const prevGit = String(prev.git?.token || '').trim();
                              if (!cur || cur === prevGit) {
                                copy.component_config.dev_hub.gitlab_token = v;
                              }
                            }
                            return copy;
                          });
                        }}
                      />
                      <Button variant="secondary" onClick={() => setShowGitToken(!showGitToken)}>
                        {showGitToken ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </FormGroup>
                </GridItem>
              </Grid>
            </CardBody>
          </Card>

          <br />

          <Card style={cardStyle} id="aap-configuration">
            <CardBody>
              <button type="button" onClick={() => setAapOpen(!aapOpen)}
                style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: '20px', color: textColor }}>
                {aapOpen ? '−' : '+'} Ansible Automation Platform Configuration
              </button>

              <br /><br />

              <Radio label="Using AAP" name="aap" isChecked={data.aap.enabled} onChange={() => setAapEnabled(true)} />
              <Radio label="Not using AAP" name="aap" isChecked={!data.aap.enabled} onChange={() => setAapEnabled(false)} />

              {!data.aap.enabled && !data.pre_installs?.install_aap && (
                <>
                  <br />
                  <div style={{ color: mutedTextColor, marginBottom: '8px' }}>
                    Click <strong>Run Bootstrap</strong> below — the pod runs this ansible-playbook locally
                    (no AAP API calls). Expand additional options on the General tab or below.
                    For a greenfield operator install, open the <strong>Install AAP</strong> tab (expand this card).
                  </div>
                  {renderAnsibleExtraArgsCollapsible()}
                  <br />
                  <textarea
                    readOnly
                    spellCheck="false"
                    value={buildLocalBootstrapAnsiblePreview()}
                    style={{
                      width: '100%',
                      minHeight: '220px',
                      background: '#151515',
                      color: '#f0f0f0',
                      fontFamily: 'monospace',
                      fontSize: `${consoleFontSize}px`,
                      lineHeight: '1.45',
                      border: '1px solid #3c3c3c',
                      borderRadius: '4px',
                      padding: '14px'
                    }}
                  />
                </>
              )}

              {aapOpen && (
                <>
                  <br />
                  <Tabs activeKey={activeAapConfigTab} onSelect={(_, key) => setActiveAapConfigTab(key)}>
                    <Tab eventKey="general" title="General" />
                    <Tab eventKey="install" title="Install AAP" />
                    <Tab eventKey="license" title="License" />
                    <Tab eventKey="hub" title="Hub" />
                    <Tab eventKey="galaxy" title="Galaxy" />
                    <Tab eventKey="authentication" title="Add authentication" />
                    <Tab eventKey="onboard" title="Onboard" />
                  </Tabs>
                  <br />
                  {activeAapConfigTab === 'install' && (
                    <div>
                      <Checkbox
                        id="install-aap-toggle"
                        label="Install AAP on OpenShift"
                        isChecked={!!data.pre_installs?.install_aap}
                        onChange={(_, v) => setInstallAap(v)}
                      />
                      <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '8px' }}>
                        Only for greenfield AAP operator install on a cluster (needs OpenShift token).
                        Leave off for Controller config / patching / Satellite / IdM on an existing AAP.
                      </div>
                      {!!data.pre_installs?.install_aap && (
                        <div style={{ marginTop: '12px' }}>
                          <Checkbox
                            id="configure-aap-after-install"
                            label="Configure Controller after this AAP is up (Using AAP)"
                            isChecked={!!data.aap?.enabled}
                            onChange={(_, v) => setAapEnabled(v)}
                          />
                          <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                            Leave this off to install only. This run will not call an existing Controller.
                            After AAP is up, turn on Using AAP with the new hostname to configure it.
                          </div>
                          {data.aap?.enabled && (
                            <div style={{ color: '#8a6d3b', fontSize: '13px', marginTop: '8px' }}>
                              Using AAP is on. This install still skips Controller configuration.
                              Uncheck the box above if you only want the operator install.
                            </div>
                          )}
                          <div style={{ marginTop: '16px' }}>
                            {renderAapInstallCard()}
                            <div style={{ marginTop: '16px' }}>
                              {renderAapLicenseFields()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {activeAapConfigTab === 'license' && (
                    <div>
                      <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '12px' }}>
                        Attach or activate a subscription on an existing AAP (RHN login or manifest).
                        This does not install the operator — use Install AAP for greenfield.
                      </div>
                      <div
                        style={{
                          color: '#f0ad4e',
                          fontSize: '13px',
                          fontWeight: 600,
                          marginBottom: '12px',
                          padding: '8px 10px',
                          border: '1px solid #f0ad4e',
                          borderRadius: '4px',
                          background: 'rgba(240, 173, 78, 0.08)'
                        }}
                      >
                        Before running: make sure General → AAP Hostname URL and Admin password are
                        populated for the existing AAP you are attaching to. License attach uses those
                        General fields (not Install AAP host fields).
                      </div>
                      <Checkbox
                        id="aap-config-attach-license"
                        label="Attach / activate license on next bootstrap"
                        isChecked={!!data.pre_installs?.attach_aap_license}
                        onChange={(_, v) => setAttachAapLicense(v)}
                      />
                      <div style={{ marginTop: '12px' }}>
                        {renderAapLicenseFields({ forceAttachFields: true })}
                      </div>
                    </div>
                  )}
                  {activeAapConfigTab === 'general' && (
                    <Grid hasGutter>
                      <GridItem span={6}>
                        <FormGroup label="AAP Hostname URL">
                          <TextInput value={data.aap.hostname} onChange={(_, v) => setAapHostname(v)} />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}><FormGroup label="AAP Version"><select value={data.aap.version} onChange={e => setAapVersion(e.target.value)} style={{ width: '100%', padding: '8px' }}>{AAP_VERSION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Organization Name"><TextInput value={data.aap.organization} onChange={(_, v) => setAapOrganization(v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Inventory Name"><TextInput value={data.aap.inventory} onChange={(_, v) => set('aap.inventory', v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Project Name"><TextInput value={data.aap.project} onChange={(_, v) => set('aap.project', v)} /></FormGroup></GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Execution Environment">
                          {data.aap.hub_push_ee ? (() => {
                            const hubEe = resolveHubExecutionEnvironmentName(data.aap);
                            const options = [...new Set([hubEe, DEFAULT_AAP_EXECUTION_ENVIRONMENT, data.aap.execution_environment].filter(Boolean))];
                            const selected = options.includes(data.aap.execution_environment)
                              ? data.aap.execution_environment
                              : hubEe;
                            return (
                              <select
                                value={selected}
                                onChange={e => set('aap.execution_environment', e.target.value)}
                                style={{ width: '100%', padding: '8px' }}
                              >
                                {options.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            );
                          })() : (
                            <TextInput
                              value={data.aap.execution_environment}
                              onChange={(_, v) => set('aap.execution_environment', v)}
                            />
                          )}
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="OAuth Token">
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <TextInput type={showAapOauthToken ? 'text' : 'password'} value={data.aap.oauth_token} onChange={(_, v) => set('aap.oauth_token', v)} />
                            <Button variant="secondary" onClick={() => setShowAapOauthToken(!showAapOauthToken)}>{showAapOauthToken ? 'Hide' : 'Show'}</Button>
                          </div>
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup
                          label="Hub / Galaxy API token"
                          helperText="Used for Contoller organization Galaxy credentials (ansible-galaxy pulls) and registry auth. Hub publish/namespaces on gateway AAP use the Contoller OAuth token above (or admin password), not this field."
                        >
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <TextInput
                              type={showAapGalaxyHubToken ? 'text' : 'password'}
                              value={data.aap.galaxy_hub_token}
                              onChange={(_, v) => set('aap.galaxy_hub_token', v)}
                              placeholder="Hub API token (separate from Controller OAuth)"
                            />
                            <Button variant="secondary" onClick={() => setShowAapGalaxyHubToken(!showAapGalaxyHubToken)}>
                              {showAapGalaxyHubToken ? 'Hide' : 'Show'}
                            </Button>
                          </div>
                        </FormGroup>
                      </GridItem>

                      <GridItem span={6}><FormGroup label="Admin Username"><TextInput value={data.aap.admin_username} onChange={(_, v) => set('aap.admin_username', v)} /></FormGroup></GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Admin Password">
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <TextInput
                              type={showAapAdminPassword ? 'text' : 'password'}
                              value={data.aap.admin_password}
                              onChange={(_, v) => set('aap.admin_password', v)}
                            />
                            <Button variant="secondary" onClick={() => setShowAapAdminPassword(!showAapAdminPassword)}>
                              {showAapAdminPassword ? 'Hide' : 'Show'}
                            </Button>
                          </div>
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="TLS Certificate Verification">
                          <Checkbox
                            label="Skip TLS certificate verification for self-signed certificates"
                            isChecked={data.aap.skip_tls_verify}
                            onChange={(_, v) => set('aap.skip_tls_verify', v)}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <FormGroup label={labelWithHelp('Bootstrap run mode', bootstrapRunModeHelp)}>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '16px 24px',
                              alignItems: 'flex-start'
                            }}
                          >
                            <Checkbox
                              id="git-vars-only"
                              label={labelWithHelp(
                                'Vars / Vault files only (build group_vars/env/{var|vault}.yml)',
                                gitHelp.varsOnly
                              )}
                              isChecked={data.git?.vars_only === true}
                              isDisabled={standaloneRun}
                              onChange={(_, v) => {
                                setData(prev => {
                                  const copy = JSON.parse(JSON.stringify(prev));
                                  if (!copy.git) copy.git = {};
                                  copy.git.vars_only = v === true;
                                  if (v === true) {
                                    copy.git.overwrite_generated = false;
                                    copy.git.overrides = { ...defaults.git.overrides };
                                    if (!copy.aap) copy.aap = {};
                                    copy.aap.standalone_run = false;
                                    copy.aap.hub_update_collection_only = false;
                                  }
                                  return copy;
                                });
                              }}
                            />
                            <Checkbox
                              id="aap-standalone-run"
                              label={labelWithHelp(
                                'Run AAP tabs only (skip OpenShift/RHEL component playbooks and full Controller scaffolding)',
                                aapHelp.standaloneRun
                              )}
                              isChecked={standaloneRun}
                              isDisabled={data.git?.vars_only === true}
                              onChange={(_, v) => setAapStandaloneRun(v)}
                            />
                          </div>
                          {standaloneRun && !aapStandaloneWorkSelected(data) && (
                            <div style={{ color: '#f0ab00', fontSize: '13px', margin: '6px 0 0' }}>
                              Standalone is on but no AAP tab work is selected yet. Enable something on
                              Install AAP, License, Hub, Galaxy, or Add authentication before Run Bootstrap.
                            </div>
                          )}
                          {!standaloneRun
                            && data.git?.vars_only !== true
                            && data.aap?.enabled !== false
                            && (!Array.isArray(data.components) || data.components.length === 0) && (
                            <div style={{ color: '#f0ab00', fontSize: '13px', margin: '6px 0 0' }}>
                              No components selected — check a Bootstrap run mode option above, or select
                              components for a full bootstrap.
                            </div>
                          )}
                          {data.aap?.enabled !== false && (
                            <div style={{ color: mutedTextColor, fontSize: '13px', margin: '8px 0 0' }}>
                              <strong>Using AAP:</strong> bootstrap still runs{' '}
                              <code>ansible-playbook run-ado-scaffolding.yml</code> in the pod, then applies
                              Controller/Hub config via the AAP API. Expand additional options below for extra{' '}
                              <code>-e</code> flags.
                            </div>
                          )}
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        {renderAnsibleExtraArgsCollapsible()}
                      </GridItem>
                      <GridItem span={12}>
                        <Button
                          variant="secondary"
                          isDisabled={aapPingBusy || !String(data.aap?.hostname || '').trim()}
                          onClick={pingAapController}
                        >
                          {aapPingBusy ? 'Testing AAP…' : 'Test AAP connection'}
                        </Button>
                        {aapPingMessage && (
                          <p
                            style={{
                              margin: '8px 0 0',
                              color: aapPingStatus === 'success'
                                ? '#3e8635'
                                : aapPingStatus === 'error'
                                  ? '#c9190b'
                                  : mutedTextColor,
                              fontWeight: aapPingStatus ? 600 : 400
                            }}
                          >
                            {aapPingMessage}
                          </p>
                        )}
                      </GridItem>
                    </Grid>
                  )}
                  {activeAapConfigTab === 'hub' && (
                    <Grid hasGutter>
                      <GridItem span={12}>
                        <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '8px' }}>
                          Publish the <code>infra.ado</code> collection and/or push the ADO execution
                          environment image into Private Automation Hub. Check General → Standalone AAP run
                          to apply Hub/Galaxy/Add authentication/Onboard without OpenShift/RHEL component playbooks.
                        </div>
                        <div
                          style={{
                            color: '#f0ad4e',
                            fontSize: '13px',
                            fontWeight: 600,
                            marginBottom: '12px',
                            padding: '8px 10px',
                            border: '1px solid #f0ad4e',
                            borderRadius: '4px',
                            background: 'rgba(240, 173, 78, 0.08)'
                          }}
                        >
                          Before running: set General → AAP Hostname URL and Organization Name.
                          Contoller API and Hub publish/namespaces on gateway AAP use General →
                          OAuth token (or Admin password). Hub / Galaxy API token is only for
                          Contoller org Galaxy credentials and registry pulls — it will not
                          authorize Hub collection publish.
                        </div>
                      </GridItem>
                      <GridItem span={12}>
                        <FormGroup
                          label={(
                            <span>
                              Hub hostname
                              <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                {' — required for Hub-only runs; defaults from General AAP Hostname URL'}
                              </span>
                            </span>
                          )}
                        >
                          <TextInput
                            value={data.aap.hub_hostname || ''}
                            onChange={(_, v) => set('aap.hub_hostname', v)}
                            placeholder={
                              hostnameFromUrl(data.aap.hostname)
                              || 'aap.example.com'
                            }
                            isRequired={standaloneRun && (data.aap.hub_publish_ado_collection || data.aap.hub_push_ee)}
                          />
                          <div style={{ color: mutedTextColor, fontSize: '13px', margin: '4px 0 0' }}>
                            API/registry host for Private Automation Hub (host only, no path). Used for
                            collection publish and EE push.
                          </div>
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <Tabs
                          activeKey={activeHubSubTab}
                          onSelect={(_, key) => setActiveHubSubTab(key)}
                        >
                          <Tab eventKey="collections" title="Collections" />
                          <Tab eventKey="execution_environment" title="Execution Environment" />
                        </Tabs>
                      </GridItem>
                      {activeHubSubTab === 'collections' && (
                        <GridItem span={12}>
                          <FormGroup label={labelWithHelp('Collections', (
                            <>
                              <p>Publish or refresh the vendored <code>infra.ado</code> collection in Private Automation Hub validated content.</p>
                              <p>Set General → Contoller OAuth token (or Admin password) before running collection publish on gateway AAP.</p>
                            </>
                          ))}>
                            <Checkbox
                              label={labelWithHelp(
                                'Install or update infra.ado collection in Hub validated content (optional)',
                                aapHelp.hubPublishCollection
                              )}
                              isChecked={data.aap.hub_publish_ado_collection === true}
                              onChange={(_, v) => setAapHubValidated(v)}
                            />
                            <div style={{ marginTop: '12px' }}>
                              <Checkbox
                                label={labelWithHelp(
                                  'Force infra.ado collection update if already installed',
                                  aapHelp.hubForceCollectionUpdate
                                )}
                                isChecked={data.aap.hub_force_ado_collection_update}
                                isDisabled={!data.aap.hub_publish_ado_collection}
                                onChange={(_, v) => set('aap.hub_force_ado_collection_update', v)}
                              />
                            </div>
                          </FormGroup>
                        </GridItem>
                      )}
                      {activeHubSubTab === 'execution_environment' && (
                        <>
                          <GridItem span={12}>
                            <FormGroup label={labelWithHelp('Execution environment (optional)', aapHelp.hubExecutionEnvironment)}>
                              <Checkbox
                                id="aap-hub-push-ee"
                                label="Push ADO EE image to AAP Hub (optional)"
                                isChecked={data.aap.hub_push_ee === true}
                                onChange={(_, v) => setAapHubPushEe(v)}
                              />
                            </FormGroup>
                          </GridItem>
                          {data.aap.hub_push_ee && (
                            <>
                              <GridItem span={12}>
                                <Checkbox
                                  id="aap-hub-ee-pull"
                                  label="Pull source from a registry instead of the baked archive (needs network)"
                                  isChecked={data.aap.hub_ee_pull === true}
                                  onChange={(_, v) => {
                                    setData(prev => {
                                      const copy = JSON.parse(JSON.stringify(prev));
                                      if (!copy.aap) copy.aap = {};
                                      copy.aap.hub_ee_pull = v === true;
                                      copy.aap.hub_ee_source_image = v
                                        ? HUB_EE_REGISTRY_SOURCE
                                        : HUB_EE_BAKED_SOURCE;
                                      return copy;
                                    });
                                  }}
                                />
                                <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: 0 }}>
                                  Leave unchecked for disconnected labs (default
                                  {' '}<code>{HUB_EE_BAKED_SOURCE}</code>). Only enable when this
                                  pod can reach ghcr.io or an internal mirror
                                  ({' '}<code>{HUB_EE_REGISTRY_SOURCE}</code>).
                                </p>
                              </GridItem>
                              <GridItem span={8}>
                                <FormGroup
                                  label={
                                    data.aap.hub_ee_pull
                                      ? 'Source image (registry pull)'
                                      : 'Source image (baked archive in this pod)'
                                  }
                                >
                                  <TextInput
                                    value={data.aap.hub_ee_source_image || (data.aap.hub_ee_pull ? HUB_EE_REGISTRY_SOURCE : HUB_EE_BAKED_SOURCE)}
                                    onChange={(_, v) => set('aap.hub_ee_source_image', v)}
                                    placeholder={data.aap.hub_ee_pull ? HUB_EE_REGISTRY_SOURCE : HUB_EE_BAKED_SOURCE}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup
                                  label={(
                                    <span>
                                      Hub image name
                                      <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                        {' — container name in Private Automation Hub'}
                                      </span>
                                    </span>
                                  )}
                                >
                                  <TextInput
                                    value={data.aap.hub_ee_name}
                                    onChange={(_, v) => setAapHubEeNameField('hub_ee_name', normalizeHubImageName(v))}
                                    placeholder={defaultHubImageName()}
                                  />
                                  <p style={{ color: mutedTextColor, marginTop: '4px', marginBottom: 0 }}>
                                    Registry image name must be lowercase (default <code>ado-ee</code>).
                                    Display label remains &quot;ADO EE&quot;; Contoller EE object name is separate below.
                                  </p>
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="Tag">
                                  <TextInput
                                    value={data.aap.hub_ee_tag}
                                    onChange={(_, v) => set('aap.hub_ee_tag', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={8}>
                                <FormGroup
                                  label={(
                                    <span>
                                      Hub registry host
                                      <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                        {' — Defaults to Hub hostname when empty'}
                                      </span>
                                    </span>
                                  )}
                                >
                                  <TextInput
                                    value={data.aap.hub_ee_registry}
                                    onChange={(_, v) => set('aap.hub_ee_registry', v)}
                                    placeholder={
                                      data.aap.hub_hostname
                                      || hostnameFromUrl(data.aap.hostname)
                                      || 'aap.example.com'
                                    }
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={12}>
                                <Checkbox
                                  id="aap-hub-ee-create-ee"
                                  label="Create Contoller execution environment after push"
                                  isChecked={data.aap.hub_ee_create_execution_environment !== false}
                                  onChange={(_, v) => set('aap.hub_ee_create_execution_environment', v)}
                                />
                              </GridItem>
                              {data.aap.hub_ee_create_execution_environment !== false && (
                                <GridItem span={6}>
                                  <FormGroup
                                    label={(
                                      <span>
                                        Contoller EE name
                                        <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                          {` — defaults to ${defaultOrgEeName(data.aap.organization || 'ADO')} (ORG-ee)`}
                                        </span>
                                      </span>
                                    )}
                                  >
                                    <TextInput
                                      value={data.aap.hub_ee_execution_environment_name}
                                      onChange={(_, v) => setAapHubEeNameField('hub_ee_execution_environment_name', v)}
                                      placeholder={defaultOrgEeName(data.aap.organization || 'ADO')}
                                    />
                                  </FormGroup>
                                </GridItem>
                              )}
                              <GridItem span={12}>
                                <FormGroup label="Hub / Contoller EE description">
                                  <textarea
                                    value={data.aap.hub_ee_description}
                                    onChange={e => set('aap.hub_ee_description', e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', padding: '8px' }}
                                  />
                                </FormGroup>
                              </GridItem>
                            </>
                          )}
                        </>
                      )}
                    </Grid>
                  )}
                  {activeAapConfigTab === 'galaxy' && (
                    <Grid hasGutter>
                      <GridItem span={12}>
                        <div
                          style={{
                            color: '#f0ad4e',
                            fontSize: '13px',
                            fontWeight: 600,
                            marginBottom: '12px',
                            padding: '8px 10px',
                            border: '1px solid #f0ad4e',
                            borderRadius: '4px',
                            background: 'rgba(240, 173, 78, 0.08)'
                          }}
                        >
                          Before running: fill General → AAP Hostname URL, Organization Name, and
                          Contoller Admin password or OAuth token (Contoller API). Galaxy credential
                          tokens use General → Hub / Galaxy API token (ansible-galaxy pulls). Hub
                          collection publish on gateway AAP uses Contoller OAuth, not the Hub API
                          token. Hub tab work and this Galaxy tab can run together or separately;
                          with Run AAP tabs only, both Hub and Galaxy still apply when both are
                          checked.
                        </div>
                        <FormGroup label="Galaxy / Hub credentials">
                          <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: '8px' }}>
                            Creates Contoller Galaxy/Hub API Token credentials, optional Container
                            Registry credential for EE pulls, attaches selected creds to the
                            organization in the order below (1 = searched first), and can create an
                            extra Contoller user. Independent of Hub collection/EE push — enable
                            either tab, or both. The built-in <code>Ansible Galaxy</code> credential
                            is platform-global (not org-owned); bootstrap attaches it and will not
                            try to create a duplicate.
                          </p>
                          <div
                            style={{
                              marginBottom: '12px',
                              padding: '8px 10px',
                              border: '1px solid #f0ad4e',
                              borderRadius: '4px',
                              background: 'rgba(240, 173, 78, 0.08)',
                              color: textColor,
                              fontSize: '13px'
                            }}
                          >
                            Contoller only installs project <code>collections/requirements.yml</code>{' '}
                            (vendored <code>infra.ado</code>) when the organization already has Galaxy
                            credentials attached. If they are already on the org in Contoller, leave
                            this off. Use this tab only to create/attach them. Stock EEs like{' '}
                            <code>ee-supported-rhel9</code> do not ship <code>infra.ado</code>; ADO EE
                            push is the other option.
                          </div>
                          <Checkbox
                            id="aap-galaxy-setup-enabled"
                            label="Configure Galaxy credentials and attach them to the organization"
                            isChecked={data.aap.galaxy_setup_enabled === true}
                            onChange={(_, v) => {
                              setData(prev => {
                                const copy = JSON.parse(JSON.stringify(prev));
                                if (!copy.aap) copy.aap = {};
                                copy.aap.galaxy_setup_enabled = v === true;
                                if (v) {
                                  if (!Array.isArray(copy.aap.galaxy_credentials) || copy.aap.galaxy_credentials.length === 0) {
                                    copy.aap.galaxy_credentials = buildDefaultGalaxyCredentials(
                                      copy.aap.organization || 'ADO',
                                      copy.aap.hostname || ''
                                    );
                                  } else {
                                    copy.aap.galaxy_credentials = normalizeGalaxyCredentialOrder(
                                      copy.aap.galaxy_credentials
                                    );
                                  }
                                  if (!copy.aap.container_registry_credential) {
                                    copy.aap.container_registry_credential = buildDefaultContainerRegistryCredential(
                                      copy.aap.organization || 'ADO',
                                      copy.aap.hostname || ''
                                    );
                                  } else if (!copy.aap.container_registry_credential.host) {
                                    copy.aap.container_registry_credential.host = String(copy.aap.hostname || '').replace(/\/+$/, '');
                                  }
                                }
                                return copy;
                              });
                            }}
                          />
                          <br />
                          <Checkbox
                            id="aap-ignore-galaxy-cert"
                            label={labelWithHelp(
                              'Ignore Galaxy/Hub TLS certificate verification (Controller jobs + project ansible.cfg)',
                              <>
                                <p>
                                  Off (default): Controller project collection installs and generated{' '}
                                  <code>ansible.cfg</code> verify Hub/Galaxy TLS certificates (
                                  <code>GALAXY_IGNORE_CERTS=false</code>).
                                </p>
                                <p>
                                  On: sets <code>ansible_dispatch_ignore_galaxy_cert</code> so bootstrap
                                  patches Controller jobs settings and writes{' '}
                                  <code>[galaxy] ignore_certs = True</code> in the playbook repo.
                                  Use for lab Hubs with self-signed certificates.
                                </p>
                              </>
                            )}
                            isChecked={data.aap.ignore_galaxy_cert === true}
                            onChange={(_, v) => set('aap.ignore_galaxy_cert', v)}
                          />
                        </FormGroup>
                      </GridItem>
                      {data.aap.galaxy_setup_enabled && (
                        <>
                          <GridItem span={12}>
                            <FormGroup
                              label="Extra Contoller user (optional — not the General admin)"
                              helperText="Creates a separate Contoller user in this organization. Does not change or replace the General tab Admin username/password."
                            >
                              <Checkbox
                                id="aap-galaxy-user-enabled"
                                label="Create a separate Contoller user (not admin) in this organization"
                                isChecked={data.aap.galaxy_user_account?.enabled === true}
                                onChange={(_, v) => set('aap.galaxy_user_account.enabled', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          {data.aap.galaxy_user_account?.enabled && (
                            <>
                              <GridItem span={4}>
                                <FormGroup label="Username">
                                  <TextInput
                                    value={data.aap.galaxy_user_account.username}
                                    onChange={(_, v) => set('aap.galaxy_user_account.username', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="Password">
                                  <TextInput
                                    type="password"
                                    value={data.aap.galaxy_user_account.password}
                                    onChange={(_, v) => set('aap.galaxy_user_account.password', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="Email (optional)">
                                  <TextInput
                                    value={data.aap.galaxy_user_account.email}
                                    onChange={(_, v) => set('aap.galaxy_user_account.email', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                            </>
                          )}
                          <GridItem span={12}>
                            <p style={{ color: mutedTextColor, margin: '0 0 8px', fontSize: '13px' }}>
                              Shared Hub token is on the <strong>General</strong> tab. Per-credential
                              token fields below override it when filled.
                            </p>
                          </GridItem>
                          <GridItem span={12}>
                            <p style={{ color: mutedTextColor, margin: '0 0 8px', fontSize: '13px' }}>
                              Organization Galaxy credential order: <strong>1</strong> is tried first
                              by Contoller, then 2, 3, … Use Move up/down or set the Order number.
                              Order + &quot;Attach to organization&quot; set the full org search list.
                              Unchecking <strong>Create</strong> skips creating/updating that
                              credential this run; it still keeps its attach/order in the org list.
                            </p>
                          </GridItem>
                          {(data.aap.galaxy_credentials || []).map((credential, index) => (
                            <GridItem span={12} key={credential.id || `galaxy-cred-${index}`}>
                              <Card style={{ boxShadow: 'none', border: '1px solid #d2d2d2' }}>
                                <CardBody>
                                  <Grid hasGutter>
                                    <GridItem span={12}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        <Checkbox
                                          id={`aap-galaxy-cred-enabled-${index}`}
                                          label={`Create/update ${credential.name || 'credential'}`}
                                          isChecked={credential.enabled !== false}
                                          onChange={(_, v) => set(`aap.galaxy_credentials.${index}.enabled`, v)}
                                        />
                                        <FormGroup label="Order" style={{ marginBottom: 0, minWidth: '72px' }}>
                                          <TextInput
                                            type="number"
                                            min={1}
                                            value={credential.order ?? index + 1}
                                            onChange={(_, v) => setGalaxyCredentialOrder(index, v)}
                                            aria-label={`Order for ${credential.name || 'credential'}`}
                                          />
                                        </FormGroup>
                                        <Button
                                          variant="secondary"
                                          isDisabled={index === 0}
                                          onClick={() => moveGalaxyCredential(index, -1)}
                                        >
                                          Move up
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          isDisabled={index >= (data.aap.galaxy_credentials || []).length - 1}
                                          onClick={() => moveGalaxyCredential(index, 1)}
                                        >
                                          Move down
                                        </Button>
                                      </div>
                                    </GridItem>
                                    {credential.enabled !== false && (
                                      <>
                                        <GridItem span={4}>
                                          <FormGroup label="Name">
                                            <TextInput
                                              value={credential.name}
                                              onChange={(_, v) => set(`aap.galaxy_credentials.${index}.name`, v)}
                                            />
                                          </FormGroup>
                                        </GridItem>
                                        <GridItem span={8}>
                                          <FormGroup label="Galaxy Server URL">
                                            <TextInput
                                              value={credential.url}
                                              onChange={(_, v) => set(`aap.galaxy_credentials.${index}.url`, v)}
                                            />
                                          </FormGroup>
                                        </GridItem>
                                        <GridItem span={6}>
                                          <FormGroup label="Auth Server URL (optional)">
                                            <TextInput
                                              value={credential.auth_url || ''}
                                              onChange={(_, v) => set(`aap.galaxy_credentials.${index}.auth_url`, v)}
                                            />
                                          </FormGroup>
                                        </GridItem>
                                        <GridItem span={6}>
                                          <FormGroup
                                            label="API Token (optional per-cred override)"
                                            helperText="Empty = General → Hub / Galaxy API token."
                                          >
                                            <TextInput
                                              type="password"
                                              value={credential.token || ''}
                                              onChange={(_, v) => set(`aap.galaxy_credentials.${index}.token`, v)}
                                            />
                                          </FormGroup>
                                        </GridItem>
                                        <GridItem span={12}>
                                          <Checkbox
                                            id={`aap-galaxy-cred-attach-${index}`}
                                            label="Attach to organization Galaxy credentials (uses Order above)"
                                            description="Uncheck to create the credential but not add it to the org Galaxy search list."
                                            isChecked={credential.attach_to_org !== false}
                                            onChange={(_, v) => set(`aap.galaxy_credentials.${index}.attach_to_org`, v)}
                                          />
                                        </GridItem>
                                      </>
                                    )}
                                  </Grid>
                                </CardBody>
                              </Card>
                            </GridItem>
                          ))}
                          <GridItem span={12}>
                            <FormGroup label="Container Registry credential (EE pull)">
                              <Checkbox
                                id="aap-galaxy-ee-registry-enabled"
                                label={`Create ${data.aap.container_registry_credential?.name || 'ADO-EE'} (Container Registry)`}
                                isChecked={data.aap.container_registry_credential?.enabled !== false}
                                onChange={(_, v) => set('aap.container_registry_credential.enabled', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          {data.aap.container_registry_credential?.enabled !== false && (
                            <>
                              <GridItem span={4}>
                                <FormGroup label="Name">
                                  <TextInput
                                    value={data.aap.container_registry_credential.name}
                                    onChange={(_, v) => set('aap.container_registry_credential.name', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={8}>
                                <FormGroup label="Registry host">
                                  <TextInput
                                    value={data.aap.container_registry_credential.host}
                                    onChange={(_, v) => set('aap.container_registry_credential.host', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="Username">
                                  <TextInput
                                    value={data.aap.container_registry_credential.username}
                                    onChange={(_, v) => set('aap.container_registry_credential.username', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="Password / token">
                                  <TextInput
                                    type="password"
                                    value={data.aap.container_registry_credential.password}
                                    onChange={(_, v) => set('aap.container_registry_credential.password', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={4}>
                                <FormGroup label="TLS">
                                  <Checkbox
                                    id="aap-galaxy-ee-verify-ssl"
                                    label="Verify SSL"
                                    isChecked={data.aap.container_registry_credential.verify_ssl !== false}
                                    onChange={(_, v) => set('aap.container_registry_credential.verify_ssl', v)}
                                  />
                                </FormGroup>
                              </GridItem>
                            </>
                          )}
                        </>
                      )}
                    </Grid>
                  )}
                  {activeAapConfigTab === 'authentication' && (
                    <div>
                      <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '12px' }}>
                        Configure Automation Gateway authentication methods (same as AAP Access Management →
                        Authentication Methods). For auth-only runs, check General → Standalone AAP run and
                        enable the method you need on a sub-tab below.
                      </div>
                      {!data.aap?.enabled && (
                        <div style={{ color: '#8a6d3b', fontSize: '13px', marginBottom: '12px' }}>
                          Turn on Using AAP (and set General hostname / admin) so bootstrap can apply Gateway auth.
                        </div>
                      )}
                      <Tabs activeKey={activeAapAuthTab} onSelect={(_, key) => setActiveAapAuthTab(key)}>
                        <Tab eventKey="keycloak" title="Keycloak" />
                      </Tabs>
                      <br />
                      {activeAapAuthTab === 'keycloak' && (
                        <div>
                          <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '12px' }}>
                            Wire AAP Automation Gateway to Keycloak (OIDC) and map Keycloak groups to AAP
                            organizations / superuser. Leave Hub collection publish off on the Hub tab unless
                            you need a refresh.
                            <br />
                            <br />
                            Assumes Keycloak or Red Hat build of Keycloak (RHBK) is already running and
                            configured: realm, OIDC client (e.g. <code>aap-gateway</code> with client
                            authentication), client secret, valid redirect URIs and web origins for your AAP
                            hostname (typically <code>https://your-aap-host/*</code> for redirect URIs and the
                            origin without <code>/*</code> for web origins), group mappers / groups claim (<code>Group</code>), Keycloak 26+ lightweight-token mappers (<code>aud</code> and <code>username</code> on the client dedicated scope), and any groups you reference below (superuser and
                            organization maps). On lab clusters with self-signed ingress certs, keep
                            &quot;Skip TLS verify for Gateway → Keycloak&quot; checked so bootstrap sets{' '}
                            <code>VERIFY_SSL: false</code> for the token exchange. Preflight only registers
                            the Gateway authenticator — it does not install or configure Keycloak.
                          </div>
                          <Checkbox
                            id="aap-keycloak-oidc-enabled"
                            label="Configure Keycloak OIDC authenticator on next bootstrap"
                            isChecked={data.aap?.auth?.keycloak_oidc?.enabled === true}
                            onChange={(_, v) => {
                              setData(prev => {
                                const copy = JSON.parse(JSON.stringify(prev));
                                if (!copy.aap) copy.aap = {};
                                if (!copy.aap.auth) copy.aap.auth = {};
                                if (!copy.aap.auth.keycloak_oidc) copy.aap.auth.keycloak_oidc = {};
                            copy.aap.auth.keycloak_oidc.enabled = v === true;
                            return copy;
                              });
                            }}
                          />
                          {data.aap?.auth?.keycloak_oidc?.enabled === true && (
                        <Grid hasGutter style={{ marginTop: '12px' }}>
                          <GridItem span={6}>
                            <FormGroup label="Authenticator name">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.name || 'Keycloak OIDC'}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.name', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={6}>
                            <FormGroup label="Slug">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.slug || 'keycloak-oidc'}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.slug', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={6}>
                            <FormGroup label="Client ID (KEY)">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.key || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.key', v)}
                                placeholder="aap-gateway"
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={6}>
                            <FormGroup label="Client secret">
                              <TextInput
                                type="password"
                                value={data.aap.auth.keycloak_oidc.secret || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.secret', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={12}>
                            <FormGroup label="Authorization URL">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.authorization_url || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.authorization_url', v)}
                                placeholder="https://keycloak.apps.ocp.prod.rhlab/realms/rhlab/protocol/openid-connect/auth"
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={12}>
                            <FormGroup label="Access token URL">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.access_token_url || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.access_token_url', v)}
                                placeholder="https://keycloak.apps.ocp.prod.rhlab/realms/rhlab/protocol/openid-connect/token"
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={12}>
                            <Checkbox
                              id="aap-keycloak-oidc-skip-tls-verify"
                              label="Skip TLS verify for Gateway → Keycloak (sets VERIFY_SSL: false)"
                              isChecked={data.aap.auth.keycloak_oidc.verify_ssl !== true}
                              onChange={(_, v) => set('aap.auth.keycloak_oidc.verify_ssl', v ? false : true)}
                            />
                            <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '4px' }}>
                              Required on most lab/OpenShift clusters where Keycloak uses a self-signed ingress
                              certificate. Uncheck only when the gateway pod trusts Keycloak&apos;s TLS chain.
                            </div>
                          </GridItem>
                          <GridItem span={12}>
                            <FormGroup
                              label={labelWithHelp(
                                'Realm public key (required)',
                                (
                                  <div>
                                    <p style={{ margin: '0 0 8px' }}>
                                      Not the TLS/HTTPS certificate and not the OIDC client secret. This is the
                                      realm RS256 signing public key — a long base64 string AAP Gateway uses to
                                      verify JWT access tokens from Keycloak.
                                    </p>
                                    <p style={{ margin: '0 0 8px' }}>
                                      <strong>Auto:</strong> fill Authorization URL above, then click
                                      {' '}&quot;Fetch from Keycloak&quot; (uses General → skip TLS if checked).
                                    </p>
                                    <p style={{ margin: '0 0 8px' }}>
                                      <strong>Manual:</strong> Keycloak admin → Realm Settings → Keys → RS256
                                      → Public key. Or from a shell:
                                    </p>
                                    <pre
                                      style={{
                                        margin: 0,
                                        padding: '8px',
                                        fontSize: '12px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        background: isDark ? '#1b1d21' : '#f0f0f0',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {keycloakRealmPublicKeyCurlHint(
                                        data.aap.auth.keycloak_oidc.authorization_url,
                                        data.aap.auth.keycloak_oidc.access_token_url
                                      )}
                                    </pre>
                                  </div>
                                )
                              )}
                              isRequired
                            >
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <Button
                                  variant="secondary"
                                  isDisabled={
                                    keycloakPublicKeyBusy
                                    || (
                                      !keycloakRealmUrlFromOidcUrl(data.aap.auth.keycloak_oidc.authorization_url)
                                      && !keycloakRealmUrlFromOidcUrl(data.aap.auth.keycloak_oidc.access_token_url)
                                    )
                                  }
                                  onClick={fetchKeycloakRealmPublicKey}
                                >
                                  {keycloakPublicKeyBusy ? 'Fetching from Keycloak…' : 'Fetch from Keycloak'}
                                </Button>
                              </div>
                              <TextArea
                                value={data.aap.auth.keycloak_oidc.public_key || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.public_key', v)}
                                rows={3}
                                placeholder="Long base64 RS256 public key (or use Fetch from Keycloak)"
                              />
                              {keycloakPublicKeyMessage && (
                                <p style={{ margin: '8px 0 0', color: mutedTextColor }}>
                                  {keycloakPublicKeyMessage}
                                </p>
                              )}
                            </FormGroup>
                          </GridItem>
                          <GridItem span={4}>
                            <FormGroup label="Groups claim">
                              <TextInput
                                value={data.aap.auth.keycloak_oidc.groups_claim || 'Group'}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.groups_claim', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={8}>
                            <FormGroup label="Superuser Keycloak groups (comma or newline)">
                              <TextArea
                                value={data.aap.auth.keycloak_oidc.superuser_groups || ''}
                                onChange={(_, v) => set('aap.auth.keycloak_oidc.superuser_groups', v)}
                                placeholder="aap-admins"
                                rows={2}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={12}>
                            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Organization ↔ group maps</div>
                            <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '8px' }}>
                              Map Keycloak groups into an AAP organization role. Add one row per org.
                            </div>
                            {(data.aap.auth.keycloak_oidc.organization_maps || [{ organization: data.aap.organization || 'ADO', groups: '', role: 'Organization Member' }]).map((row, index) => (
                              <Grid hasGutter key={`kc-org-map-${index}`} style={{ marginBottom: '8px' }}>
                                <GridItem span={4}>
                                  <FormGroup label="AAP organization">
                                    <TextInput
                                      value={row.organization || ''}
                                      onChange={(_, v) => {
                                        setData(prev => {
                                          const copy = JSON.parse(JSON.stringify(prev));
                                          if (!copy.aap.auth.keycloak_oidc.organization_maps) {
                                            copy.aap.auth.keycloak_oidc.organization_maps = [];
                                          }
                                          copy.aap.auth.keycloak_oidc.organization_maps[index] = {
                                            ...(copy.aap.auth.keycloak_oidc.organization_maps[index] || {}),
                                            organization: v
                                          };
                                          return copy;
                                        });
                                      }}
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={4}>
                                  <FormGroup label="Keycloak groups">
                                    <TextInput
                                      value={row.groups || ''}
                                      onChange={(_, v) => {
                                        setData(prev => {
                                          const copy = JSON.parse(JSON.stringify(prev));
                                          if (!copy.aap.auth.keycloak_oidc.organization_maps) {
                                            copy.aap.auth.keycloak_oidc.organization_maps = [];
                                          }
                                          copy.aap.auth.keycloak_oidc.organization_maps[index] = {
                                            ...(copy.aap.auth.keycloak_oidc.organization_maps[index] || {}),
                                            groups: v
                                          };
                                          return copy;
                                        });
                                      }}
                                      placeholder="aap-ado-members"
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={3}>
                                  <FormGroup label="Role">
                                    <TextInput
                                      value={row.role || 'Organization Member'}
                                      onChange={(_, v) => {
                                        setData(prev => {
                                          const copy = JSON.parse(JSON.stringify(prev));
                                          if (!copy.aap.auth.keycloak_oidc.organization_maps) {
                                            copy.aap.auth.keycloak_oidc.organization_maps = [];
                                          }
                                          copy.aap.auth.keycloak_oidc.organization_maps[index] = {
                                            ...(copy.aap.auth.keycloak_oidc.organization_maps[index] || {}),
                                            role: v
                                          };
                                          return copy;
                                        });
                                      }}
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={1} style={{ display: 'flex', alignItems: 'flex-end' }}>
                                  <Button
                                    variant="plain"
                                    aria-label="Remove org map"
                                    onClick={() => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        const maps = [...(copy.aap.auth.keycloak_oidc.organization_maps || [])];
                                        maps.splice(index, 1);
                                        copy.aap.auth.keycloak_oidc.organization_maps = maps;
                                        return copy;
                                      });
                                    }}
                                  >
                                    ✕
                                  </Button>
                                </GridItem>
                              </Grid>
                            ))}
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setData(prev => {
                                  const copy = JSON.parse(JSON.stringify(prev));
                                  if (!copy.aap.auth) copy.aap.auth = {};
                                  if (!copy.aap.auth.keycloak_oidc) copy.aap.auth.keycloak_oidc = {};
                                  const maps = [...(copy.aap.auth.keycloak_oidc.organization_maps || [])];
                                  maps.push({
                                    organization: copy.aap.organization || 'ADO',
                                    groups: '',
                                    role: 'Organization Member'
                                  });
                                  copy.aap.auth.keycloak_oidc.organization_maps = maps;
                                  return copy;
                                });
                              }}
                            >
                              Add organization map
                            </Button>
                          </GridItem>
                        </Grid>
                      )}
                        </div>
                      )}
                    </div>
                  )}
                  {activeAapConfigTab === 'onboard' && (
                    <div>
                      <Checkbox
                        id="onboard-enabled"
                        label="Enable tenant onboarding"
                        isChecked={data.aap?.onboard?.enabled === true}
                        onChange={(_, v) => set('aap.onboard.enabled', v === true)}
                      />
                      <div style={{ color: mutedTextColor, fontSize: '13px', margin: '8px 0 12px' }}>
                        Off by default. Turn on only when you need org/team maps and optional Keycloak
                        group creation — otherwise onboarding is omitted from Download JSON.
                      </div>
                      {data.aap?.onboard?.enabled === true && (
                      <>
                      <div style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '12px' }}>
                        Onboard tenant organizations with Keycloak group → AAP role maps. Bootstrap
                        creates each organization (optional), applies Gateway authenticator maps for
                        org admins and developers, and optionally maps developers to a team with
                        Execute access so they can run jobs only inside that org.
                        <br />
                        <br />
                        Requires <strong>Add authentication → Keycloak</strong> OIDC enabled.
                        Create matching groups in Keycloak (or your IdP sync) before users log in —
                        e.g. <code>aap-acme-admins</code> and <code>aap-acme-developers</code>.
                        Or check <strong>Create Keycloak groups on bootstrap</strong> below to have
                        bootstrap create them via the Keycloak admin API.
                        Do not add tenant users to platform superuser groups unless they should
                        administer all of AAP.
                      </div>
                      <Card style={{ ...cardStyle, marginBottom: '12px' }}>
                        <CardBody>
                          <Title headingLevel="h3" style={{ margin: '0 0 8px', fontSize: '16px' }}>
                            Keycloak
                          </Title>
                          <Grid hasGutter>
                            <GridItem span={12}>
                              <Checkbox
                                id="onboard-keycloak-create-groups"
                                label="Create Keycloak groups on bootstrap"
                                isChecked={data.aap?.onboard?.keycloak?.create_groups !== false}
                                onChange={(_, v) => set('aap.onboard.keycloak.create_groups', v === true)}
                              />
                            </GridItem>
                            {data.aap?.onboard?.keycloak?.create_groups !== false && (
                              <>
                                <GridItem span={6}>
                                  <FormGroup label="Keycloak base URL">
                                    <TextInput
                                      value={data.aap.onboard.keycloak.base_url || ''}
                                      onChange={(_, v) => set('aap.onboard.keycloak.base_url', v)}
                                      placeholder="https://keycloak.apps.ocp.prod.rhlab"
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={6}>
                                  <FormGroup label="Realm">
                                    <TextInput
                                      value={data.aap.onboard.keycloak.realm || ''}
                                      onChange={(_, v) => set('aap.onboard.keycloak.realm', v)}
                                      placeholder="rhlab"
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={6}>
                                  <FormGroup label="Admin username">
                                    <TextInput
                                      value={data.aap.onboard.keycloak.admin_username || 'admin'}
                                      onChange={(_, v) => set('aap.onboard.keycloak.admin_username', v)}
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={6}>
                                  <FormGroup label="Admin password">
                                    <TextInput
                                      type="password"
                                      value={data.aap.onboard.keycloak.admin_password || ''}
                                      onChange={(_, v) => set('aap.onboard.keycloak.admin_password', v)}
                                    />
                                  </FormGroup>
                                </GridItem>
                                <GridItem span={12}>
                                  <Checkbox
                                    id="onboard-keycloak-verify-ssl"
                                    label="Verify TLS to Keycloak admin API"
                                    isChecked={data.aap.onboard.keycloak.verify_ssl === true}
                                    onChange={(_, v) => set('aap.onboard.keycloak.verify_ssl', v === true)}
                                  />
                                  <div style={{ color: mutedTextColor, fontSize: '13px', marginTop: '4px' }}>
                                    Leave unchecked on lab clusters with self-signed ingress certs.
                                  </div>
                                </GridItem>
                                <GridItem span={12}>
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard) copy.aap.onboard = { tenants: [] };
                                        copy.aap.onboard.keycloak = {
                                          ...(copy.aap.onboard.keycloak || {}),
                                          ...defaultOnboardKeycloak(copy.aap)
                                        };
                                        return copy;
                                      });
                                    }}
                                  >
                                    Fill from Add authentication → Keycloak URLs
                                  </Button>
                                </GridItem>
                              </>
                            )}
                          </Grid>
                        </CardBody>
                      </Card>
                      {data.aap?.auth?.keycloak_oidc?.enabled !== true && (
                        <div style={{ color: '#8a6d3b', fontSize: '13px', marginBottom: '12px' }}>
                          Enable Keycloak OIDC on Add authentication before bootstrap can apply onboard maps.
                        </div>
                      )}
                      {(data.aap?.onboard?.tenants || []).map((tenant, index) => (
                        <Card key={`onboard-tenant-${index}`} style={{ ...cardStyle, marginBottom: '12px' }}>
                          <CardBody>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <Title headingLevel="h3" style={{ margin: 0, fontSize: '16px' }}>
                                {tenant.organization || `Tenant ${index + 1}`}
                              </Title>
                              <Button
                                variant="plain"
                                aria-label="Remove onboard tenant"
                                onClick={() => {
                                  setData(prev => {
                                    const copy = JSON.parse(JSON.stringify(prev));
                                    if (!copy.aap.onboard) copy.aap.onboard = { tenants: [] };
                                    copy.aap.onboard.tenants = (copy.aap.onboard.tenants || []).filter((_, i) => i !== index);
                                    return copy;
                                  });
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                            <Grid hasGutter>
                              <GridItem span={12}>
                                <Checkbox
                                  id={`onboard-tenant-enabled-${index}`}
                                  label="Include this tenant on next bootstrap"
                                  isChecked={tenant.enabled !== false}
                                  onChange={(_, v) => {
                                    setData(prev => {
                                      const copy = JSON.parse(JSON.stringify(prev));
                                      if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                      copy.aap.onboard.tenants[index].enabled = v === true;
                                      return copy;
                                    });
                                  }}
                                />
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="AAP organization name" isRequired>
                                  <TextInput
                                    value={tenant.organization || ''}
                                    onChange={(_, v) => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        const row = copy.aap.onboard.tenants[index];
                                        row.organization = v;
                                        if (!String(row.description || '').trim() || row.description === `${row.organization || ''} tenant`) {
                                          row.description = `${v} tenant`;
                                        }
                                        const slug = slugifyOnboardOrg(v);
                                        if (!row.admin_groups || /^aap-.*-admins$/.test(String(row.admin_groups))) {
                                          row.admin_groups = `aap-${slug}-admins`;
                                        }
                                        if (!row.developer_groups || /^aap-.*-developers$/.test(String(row.developer_groups))) {
                                          row.developer_groups = `aap-${slug}-developers`;
                                        }
                                        if (!row.team_name || /-Developers$/.test(String(row.team_name))) {
                                          row.team_name = `${v}-Developers`;
                                        }
                                        return copy;
                                      });
                                    }}
                                    placeholder="Acme"
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="Description">
                                  <TextInput
                                    value={tenant.description || ''}
                                    onChange={(_, v) => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        copy.aap.onboard.tenants[index].description = v;
                                        return copy;
                                      });
                                    }}
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={12}>
                                <Checkbox
                                  id={`onboard-create-keycloak-groups-${index}`}
                                  label="Create admin/developer Keycloak groups for this tenant"
                                  isChecked={
                                    data.aap?.onboard?.keycloak?.create_groups !== false
                                    && tenant.create_keycloak_groups !== false
                                  }
                                  isDisabled={data.aap?.onboard?.keycloak?.create_groups === false}
                                  onChange={(_, v) => {
                                    setData(prev => {
                                      const copy = JSON.parse(JSON.stringify(prev));
                                      if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                      copy.aap.onboard.tenants[index].create_keycloak_groups = v === true;
                                      return copy;
                                    });
                                  }}
                                />
                              </GridItem>
                              <GridItem span={12}>
                                <Checkbox
                                  id={`onboard-create-org-${index}`}
                                  label="Create AAP organization on bootstrap"
                                  isChecked={tenant.create_organization !== false}
                                  onChange={(_, v) => {
                                    setData(prev => {
                                      const copy = JSON.parse(JSON.stringify(prev));
                                      if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                      copy.aap.onboard.tenants[index].create_organization = v === true;
                                      return copy;
                                    });
                                  }}
                                />
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="Admin Keycloak group(s)" isRequired>
                                  <TextInput
                                    value={tenant.admin_groups || ''}
                                    onChange={(_, v) => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        copy.aap.onboard.tenants[index].admin_groups = v;
                                        return copy;
                                      });
                                    }}
                                    placeholder="aap-acme-admins"
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="Admin org role">
                                  <select
                                    value={tenant.admin_role || 'Organization Admin'}
                                    onChange={e => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        copy.aap.onboard.tenants[index].admin_role = e.target.value;
                                        return copy;
                                      });
                                    }}
                                    style={{ width: '100%', padding: '8px' }}
                                  >
                                    {AAP_ORG_ROLES.map(role => (
                                      <option key={`admin-role-${role}`} value={role}>{role}</option>
                                    ))}
                                  </select>
                                </FormGroup>
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="Developer Keycloak group(s)" isRequired>
                                  <TextInput
                                    value={tenant.developer_groups || ''}
                                    onChange={(_, v) => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        copy.aap.onboard.tenants[index].developer_groups = v;
                                        return copy;
                                      });
                                    }}
                                    placeholder="aap-acme-developers"
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={6}>
                                <FormGroup label="Developer org role">
                                  <select
                                    value={tenant.developer_role || 'Organization Member'}
                                    onChange={e => {
                                      setData(prev => {
                                        const copy = JSON.parse(JSON.stringify(prev));
                                        if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                        copy.aap.onboard.tenants[index].developer_role = e.target.value;
                                        return copy;
                                      });
                                    }}
                                    style={{ width: '100%', padding: '8px' }}
                                  >
                                    {AAP_ORG_ROLES.map(role => (
                                      <option key={`dev-role-${role}`} value={role}>{role}</option>
                                    ))}
                                  </select>
                                </FormGroup>
                              </GridItem>
                              <GridItem span={12}>
                                <Checkbox
                                  id={`onboard-create-team-${index}`}
                                  label="Map developers to a team (for job execute access)"
                                  isChecked={tenant.create_team !== false}
                                  onChange={(_, v) => {
                                    setData(prev => {
                                      const copy = JSON.parse(JSON.stringify(prev));
                                      if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                      copy.aap.onboard.tenants[index].create_team = v === true;
                                      return copy;
                                    });
                                  }}
                                />
                              </GridItem>
                              {tenant.create_team !== false && (
                                <>
                                  <GridItem span={6}>
                                    <FormGroup label="Team name">
                                      <TextInput
                                        value={tenant.team_name || ''}
                                        onChange={(_, v) => {
                                          setData(prev => {
                                            const copy = JSON.parse(JSON.stringify(prev));
                                            if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                            copy.aap.onboard.tenants[index].team_name = v;
                                            return copy;
                                          });
                                        }}
                                        placeholder="Acme-Developers"
                                      />
                                    </FormGroup>
                                  </GridItem>
                                  <GridItem span={6}>
                                    <FormGroup label="Team role">
                                      <select
                                        value={tenant.team_role || 'Execute'}
                                        onChange={e => {
                                          setData(prev => {
                                            const copy = JSON.parse(JSON.stringify(prev));
                                            if (!copy.aap.onboard?.tenants?.[index]) return copy;
                                            copy.aap.onboard.tenants[index].team_role = e.target.value;
                                            return copy;
                                          });
                                        }}
                                        style={{ width: '100%', padding: '8px' }}
                                      >
                                        {AAP_TEAM_ROLES.map(role => (
                                          <option key={`team-role-${role}`} value={role}>{role}</option>
                                        ))}
                                      </select>
                                    </FormGroup>
                                  </GridItem>
                                </>
                              )}
                            </Grid>
                          </CardBody>
                        </Card>
                      ))}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setData(prev => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            if (!copy.aap.onboard) copy.aap.onboard = { enabled: false, tenants: [] };
                            if (!Array.isArray(copy.aap.onboard.tenants)) copy.aap.onboard.tenants = [];
                            copy.aap.onboard.enabled = true;
                            copy.aap.onboard.tenants.push(defaultOnboardTenant(`Tenant-${copy.aap.onboard.tenants.length + 1}`));
                            return copy;
                          });
                        }}
                      >
                        Add tenant organization
                      </Button>
                      </>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <br />

            </>
          )}

          <br />
          <Card style={cardStyle}>
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <Title headingLevel="h2">ADO Bootstrap Console</Title>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    variant="primary"
                    onClick={runBootstrapInsideContainer}
                    style={{ borderRadius: '18px', fontWeight: 600 }}
                  >
                    ⊕ Run Bootstrap
                  </Button>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Button
                      variant="secondary"
                      onClick={runDeployToOpenShift}
                      isDisabled={deployStatus === 'running' || bootstrapStatus === 'running'}
                      style={{ borderRadius: '18px', fontWeight: 600 }}
                    >
                      Deploy to OpenShift
                    </Button>
                    <Popover
                      headerContent="Deploy to OpenShift"
                      bodyContent={<div style={{ maxWidth: '320px' }}>{aapHelp.deployToOpenShift}</div>}
                      triggerAction="click"
                      appendTo={() => document.body}
                    >
                      <button
                        type="button"
                        aria-label="Deploy to OpenShift help"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: isDark ? '#73bcf7' : '#0066cc',
                          cursor: 'pointer',
                          fontWeight: 700,
                          padding: '0 2px',
                          lineHeight: 1
                        }}
                      >
                        ?
                      </button>
                    </Popover>
                  </span>

                  <select
                    value={data.ansible.verbosity}
                    onChange={e => set('ansible.verbosity', Number(e.target.value))}
                    style={selectStyle}
                  >
                    {verbosityOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <Dropdown
                    isOpen={actionsOpen}
                    onOpenChange={(open) => setActionsOpen(open)}
                    toggle={(toggleRef) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setActionsOpen(!actionsOpen)}
                      >
                        Actions
                      </MenuToggle>
                    )}
                  >
                    <DropdownList>
                      <DropdownItem onClick={previewJson}>Preview JSON</DropdownItem>
                      <DropdownItem onClick={downloadJson}>Download JSON</DropdownItem>
                      <DropdownItem
                        onClick={downloadScrubbedJson}
                        description="Passwords, tokens, kubeconfig, manifests → [redacted]"
                      >
                        Download scrubbed JSON
                      </DropdownItem>
                      <DropdownItem onClick={resetOutput}>Reset</DropdownItem>
                      <DropdownItem
                        onClick={runDeployToOpenShift}
                        description="Build/push image and apply deploy/preflight.yaml using OpenShift creds from the form"
                      >
                        Deploy to OpenShift
                      </DropdownItem>
                    </DropdownList>
                  </Dropdown>

                  <Tooltip content="Decrease console text size">
                    <Button variant="plain" aria-label="Decrease console text size" onClick={() => zoomConsoleText(-1)} style={{ fontSize: '16px', fontWeight: 700 }}>
                      A-
                    </Button>
                  </Tooltip>

                  <Tooltip content="Reset console text size">
                    <Button variant="plain" aria-label="Reset console text size" onClick={resetConsoleTextZoom} style={{ fontSize: '16px', fontWeight: 700 }}>
                      {consoleFontSize}px
                    </Button>
                  </Tooltip>

                  <Tooltip content="Increase console text size">
                    <Button variant="plain" aria-label="Increase console text size" onClick={() => zoomConsoleText(1)} style={{ fontSize: '16px', fontWeight: 700 }}>
                      A+
                    </Button>
                  </Tooltip>

                  <Tooltip content={showRawOutput ? 'Show highlighted output' : 'Show raw output'}>
                    <Button variant="plain" aria-label="Raw or highlighted output" onClick={toggleRawOutput} style={{ fontSize: '18px' }}>
                      ↗
                    </Button>
                  </Tooltip>

                  <Tooltip content={activeTab === 'events' ? `Download ${debugTabLabel(debugTab).toLowerCase()} log` : 'Download Ansible run log'}>
                    <Button variant="plain" aria-label="Download log" onClick={downloadLog} style={{ fontSize: '18px' }}>
                      ⇩
                    </Button>
                  </Tooltip>
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                {bootstrapStatus === 'running' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#1f3a5f',
                    color: '#73bcf7',
                    border: '1px solid #2b9af3'
                  }}>
                    Bootstrap running — logs update automatically until recap appears.
                  </div>
                )}
                {bootstrapStatus === 'complete' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#1e3a1e',
                    color: '#8bc34a',
                    border: '1px solid #8bc34a'
                  }}>
                    <div>Bootstrap complete — see PLAY RECAP and recap below.</div>
                    {bootstrapRuntime && (
                      <div style={{ marginTop: '6px', fontWeight: 600 }}>
                        Runtime: {bootstrapRuntime}
                      </div>
                    )}
                  </div>
                )}
                {bootstrapStatus === 'failed' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#3a1e1e',
                    color: '#ff6b6b',
                    border: '1px solid #ff6b6b'
                  }}>
                    <div>Bootstrap failed — check logs for fatal errors and PLAY RECAP.</div>
                    {bootstrapRuntime && (
                      <div style={{ marginTop: '6px', fontWeight: 600 }}>
                        Runtime: {bootstrapRuntime}
                      </div>
                    )}
                  </div>
                )}
                {deployStatus === 'running' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#1f3a5f',
                    color: '#73bcf7',
                    border: '1px solid #2b9af3'
                  }}>
                    OpenShift deploy running — build, push, and rollout logs stream below.
                  </div>
                )}
                {deployStatus === 'complete' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#1e3a1e',
                    color: '#8bc34a',
                    border: '1px solid #8bc34a'
                  }}>
                    <div>OpenShift deploy complete.</div>
                    {deployRuntime && (
                      <div style={{ marginTop: '6px', fontWeight: 600 }}>
                        Runtime: {deployRuntime}
                      </div>
                    )}
                  </div>
                )}
                {deployStatus === 'failed' && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#3a1e1e',
                    color: '#ff6b6b',
                    border: '1px solid #ff6b6b'
                  }}>
                    <div>OpenShift deploy failed — see logs for deploy.sh output.</div>
                    {deployRuntime && (
                      <div style={{ marginTop: '6px', fontWeight: 600 }}>
                        Runtime: {deployRuntime}
                      </div>
                    )}
                  </div>
                )}
                <Tabs activeKey={activeTab} onSelect={(_, key) => setActiveTab(key)}>
                  <Tab eventKey="logs" title="Logs" />
                  <Tab eventKey="events" title="Events / Debug" />
                </Tabs>
                {activeTab === 'events' && (
                  <div style={{ marginTop: '8px' }}>
                    <Tabs activeKey={debugTab} onSelect={(_, key) => openDebugTab(key)}>
                      <Tab eventKey="events" title="Events" />
                      <Tab eventKey="summary" title="Summary" />
                      <Tab eventKey="preflight" title="Preflight JSON" />
                      <Tab eventKey="extraVars" title="Extra Vars" />
                      <Tab eventKey="tree" title="Repo Tree" />
                      <Tab eventKey="configs" title="Generated Configs" />
                      <Tab eventKey="runtime" title="Runtime" />
                      <Tab eventKey="terminal" title="Pod Terminal" />
                    </Tabs>
                    {debugTabHelp[debugTab] && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '10px 12px',
                          borderRadius: '4px',
                          backgroundColor: isDark ? '#1f1f1f' : '#f0f0f0',
                          border: `1px solid ${isDark ? '#3c3c3c' : '#d2d2d2'}`,
                          color: mutedTextColor,
                          fontSize: '13px',
                          lineHeight: 1.45
                        }}
                      >
                        <strong style={{ color: isDark ? '#e0e0e0' : '#151515' }}>
                          {debugTabHelp[debugTab].title}:
                        </strong>{' '}
                        {debugTabHelp[debugTab].body}
                      </div>
                    )}
                  </div>
                )}
              </div>


              {!(activeTab === 'events' && debugTab === 'terminal') && (
              <div style={{ marginTop: '12px', marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <FormGroup label="Search logs / events" style={{ flex: 1, marginBottom: 0 }}>
                  <TextInput
                    id="console-search"
                    type="search"
                    aria-label="Search logs and events"
                    placeholder="Filter Logs / Events output..."
                    value={consoleSearch}
                    onChange={(_, v) => setConsoleSearch(v)}
                  />
                </FormGroup>
                <Button variant="secondary" onClick={() => setConsoleSearch('')} isDisabled={!consoleSearch}>
                  Clear
                </Button>
              </div>
              )}
              <div
                ref={outputRef}
                style={{
                  height: '650px',
                  overflowY: activeTab === 'events' && debugTab === 'terminal' ? 'hidden' : 'auto',
                  backgroundColor: '#151515',
                  color: '#f0f0f0',
                  padding: '14px',
                  fontFamily: 'monospace',
                  whiteSpace: activeTab === 'events' && debugTab === 'terminal' ? 'normal' : 'pre-wrap',
                  borderRadius: '0 0 6px 6px',
                  border: '1px solid #3c3c3c',
                  borderTop: 'none',
                  fontSize: `${consoleFontSize}px`,
                  lineHeight: '1.45',
                  display: activeTab === 'events' && debugTab === 'terminal' ? 'flex' : 'block',
                  flexDirection: 'column'
                }}
              >
                {activeTab === 'events' && debugTab === 'terminal' ? (
                  <PodTerminal fontSize={consoleFontSize} />
                ) : (
                  renderConsoleContent()
                )}
              </div>
            </CardBody>
          </Card>
        </Form>
        </div>
      </PageSection>
    </Page>
  );
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
