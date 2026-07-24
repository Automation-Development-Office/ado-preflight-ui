import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
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
  Tooltip
} from '@patternfly/react-core';

import adoLogo from '../ado-logo-redhat.png';

const openshiftApps = [
  'aap','acs','acm','cert_manager','console','devspaces',
  'dirsrv','eck','gitops','gitlab','grafana','kafka',
  'oadp','openshift','pega','quay','rhbk'
];

const DEFAULT_SURVEY_ENVIRONMENTS = ['dev', 'test', 'preprod', 'prod'];

// Components with simple env/state surveys where operators can edit env choices.
// Excluded: satellite, openshift_virt/provision, rhel/patching/compliance/stig, jira
// (those already have large forms or complex surveys).
const SURVEY_ENV_EDITABLE_COMPONENTS = new Set([
  'aap', 'acs', 'acm', 'cert_manager', 'console', 'devspaces', 'dirsrv', 'eck',
  'gitops', 'gitlab', 'grafana', 'idm', 'kafka', 'oadp', 'pega', 'quay', 'rhbk',
  'rhbk_client', 'rhbk_idp', 'rhbk_realm', 'rhbk_federation',
  'admin_htpasswd', 'openshift_ldap_auth', 'openshift_oauth_rhbk',
  'openshift_discover_routes_print', 'openshift_discover_routes_alt',
  'openshift_update_pull_secret'
]);

const rhelApps = [
  'rhel','satellite','idm','aap','dirsrv',
  'eck','gitlab','grafana','kafka','rhbk',
  'compliance','stig'
];

const patchingApps = ['patching','satellite','idm'];
const provisionApps = ['aws_instance','openshift_virt'];

const simpleComponents = [
  'grafana','rhbk','satellite','idm','kafka',
  'gitlab','pega','elastic','aap','jira',
  'compliance','stig'
];

const componentOptionDefaults = {
  openshift: [
    'admin_htpasswd',
    'console_banner',
    'agent_installer',
    'ldap_auth',
    'oauth_rhbk',
    'discover_routes_print',
    'discover_routes_alt',
    'update_pull_secret'
  ],
  grafana: ['datasources', 'folders', 'dashboards'],
  rhbk: ['realm', 'client', 'idp', 'federation', 'group_mapper', 'client_scopes', 'client_mappers'],
  satellite: ['satellite_server_install', 'satellite_client_tools', 'satellite_content_view', 'satellite_capsule_install'],
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
  agent_installer: 'Agent Installer Config',
  ldap_auth: 'Configure LDAP in OpenShift',
  oauth_rhbk: 'Configure OAuth/RHBK in OpenShift',
  discover_routes_print: 'Discover Routes and Print',
  discover_routes_alt: 'Discover Routes and Add Alternative Route',
  update_pull_secret: 'Update Pull Secret',
  datasources: 'Datasources',
  folders: 'Folders',
  dashboards: 'Dashboards',
  realm: 'Realm',
  client: 'Client',
  idp: 'IDP',
  federation: 'Federation',
  group_mapper: 'Group Mapper',
  client_scopes: 'Client Scopes',
  client_mappers: 'Client Mappers',
  satellite_server_install: 'Satellite Server Install',
  satellite_client_tools: 'Satellite Client Tools',
  satellite_content_view: 'Satellite Content View',
  satellite_capsule_install: 'Satellite Capsule Install',
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
  rhel_9_stig: 'RHEL 9 STIG'
};

const verbosityOptions = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Verbose (-v)' },
  { value: 2, label: 'More Verbose (-vv)' },
  { value: 3, label: 'Debug (-vvv)' },
  { value: 4, label: 'Connection Debug (-vvvv)' },
  { value: 5, label: 'WinRM Debug (-vvvvv)' }
];

const defaultAgentInstallerNode = index => ({
  hostname: index < 3 ? `ocp-m${index + 1}` : `ocp-w${index - 2}`,
  role: index < 3 ? 'master' : 'worker',
  macAddress: '',
  interfaceName: 'eno1',
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
      attach_to_org: true
    },
    {
      id: 'published',
      name: `${prefix}-published`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/published/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true
    },
    {
      id: 'community',
      name: `${prefix}-community`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/community/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true
    },
    {
      id: 'certified',
      name: `${prefix}-certified`,
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: hubContent ? `${hubContent}/rh-certified/` : '',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true
    },
    {
      id: 'galaxy',
      name: 'Ansible Galaxy',
      credential_type: 'Ansible Galaxy/Automation Hub API Token',
      url: 'https://galaxy.ansible.com/',
      auth_url: '',
      token: '',
      enabled: true,
      attach_to_org: true
    }
  ];
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

const defaults = {
  scm_tool: 'gitlab',
  environment: 'prod',
  domain: 'prod.rhlab',

  ansible: {
    verbosity: 0
  },

  git: {
    auto_push: true,
    skip_tls_verify: true,
    token: '',
    username: 'oauth2'
  },

  vault: {
    encrypt: true
  },

  components: [],

  component_apps: {
    openshift: [],
    rhel: [],
    patching: [],
    provision: []
  },

  component_config: {
    grafana: {
      hostname: '',
      storage: '',
      folder_name: '',
      dashboards_source: ''
    },
    rhbk: {
      hostname: '',
      storage: '',
      realm: '',
      client: '',
      idp_name: '',
      idp_alias: '',
      idp_provider: 'oidc',
      federation_name: '',
      federation_provider: 'ldap',
      federation_ldap_url: '',
      federation_bind_dn: '',
      federation_bind_password: '',
      group_mapper_name: '',
      group_mapper_claim: 'groups',
      client_scope_name: '',
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
      dynamic_inventory_enabled: true,
      credential_name: 'ADO Satellite Service Account',
      inventory_source_name: 'ADO Satellite Dynamic Inventory',
      inventory_overwrite: true,
      inventory_overwrite_vars: true,
      inventory_update_on_launch: true,
      inventory_update_cache_timeout: 0,
      inventory_verbosity: 0,
      inventory_host_filter: ''
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
      directory_manager_password: ''
    },
    aap: { hostname: '', storage: '' },
    acs: { hostname: '', storage: '' },
    acm: { hostname: '', storage: '' },
    cert_manager: {
      hostname: '',
      storage: '',
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
    console: { hostname: '', storage: '' },
    devspaces: { hostname: '', storage: '' },
    dirsrv: { hostname: '', storage: '' },
    eck: { hostname: '', storage: '' },
    gitops: { hostname: '', storage: '' },
    gitlab: { hostname: '', storage: '' },
    kafka: { hostname: '', storage: '' },
    oadp: { hostname: '', storage: '' },
    openshift: { hostname: '', storage: '' },
    pega: { hostname: '', storage: '' },
    quay: { hostname: '', storage: '' },
    rhel: {
      hostname: '',
      compliance_profile: 'PCI-DSS',
      stig_profile: 'RHEL 9 STIG'
    },
    compliance: {
      hostname: '',
      profile: 'PCI-DSS'
    },
    stig: {
      hostname: '',
      profile: 'RHEL 9 STIG'
    },
    elastic: { hostname: '', storage: '' },
    jira: { hostname: '', storage: '' },
    aws_instance: { hostname: '', storage: '' },
    openshift_virt: {
      api_host: '',
      api_token: '',
      skip_tls_verify: true,
      ssh_public_key: ''
    }
  },

  component_options: {
    openshift: [],
    grafana: [...componentOptionDefaults.grafana],
    rhbk: [...componentOptionDefaults.rhbk],
    satellite: [...componentOptionDefaults.satellite],
    idm: [...componentOptionDefaults.idm],
    rhel: [...componentOptionDefaults.rhel],
    compliance: ['pci_dss'],
    stig: ['rhel_9_stig']
  },

  // Per-component AAP survey env choices (simple env/state surveys only)
  component_survey: {},

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
    version: '26',
    organization: 'ADO',
    inventory: 'ADO-inventory',
    project: 'ADO-project',
    git_url: 'https://gitlab-git.apps.ocp.prod.rhlab/redhat-lab/bootstrap-sample.git',
    git_branch: 'main',
    execution_environment: 'ee-supported-rhel9',
    vault_credential_name: 'ADO-vault',
    skip_tls_verify: false,
    project_sync_timeout: 45,
    project_sync_retries: 20,
    project_sync_delay: 5,
    project_playbook_wait_seconds: 45,
    // Hub actions are optional (off by default). Stock ee-supported-* is never pushed/managed.
    hub_publish_ado_collection: false,
    hub_mark_ado_validated: false,
    hub_force_ado_collection_update: false,
    hub_update_collection_only: false,
    hub_push_ee: false,
    hub_ee_source_image: 'ghcr.io/automation-development-office/ado-ee:latest',
    hub_ee_name: 'ado-ee',
    hub_ee_tag: 'latest',
    hub_ee_registry: '',
    hub_ee_pull: false,
    hub_ee_create_execution_environment: true,
    hub_ee_execution_environment_name: '',
    hub_ee_description: '',
    // Optional Galaxy/Hub credentials + org association (default off for disconnected)
    galaxy_setup_enabled: false,
    galaxy_hub_token: '',
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
    banner_text: 'Hello! ADO OpenShift',
    banner_location: 'BannerTop',
    banner_background_color: '#1f7a1f',
    banner_text_color: '#ffffff',
    token: '',
    agent_installer: agentInstallerDefaults
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
  const [activeConfigPanel, setActiveConfigPanel] = useState('all');
  const [activeConfigTab, setActiveConfigTab] = useState('all');
  const [showOpenShiftToken, setShowOpenShiftToken] = useState(false);
  const [showAapOauthToken, setShowAapOauthToken] = useState(false);
  const [showMachineCredentialSecrets, setShowMachineCredentialSecrets] = useState(false);
  const [showSatelliteSecrets, setShowSatelliteSecrets] = useState(false);
  const [showIdmSecrets, setShowIdmSecrets] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [showGitToken, setShowGitToken] = useState(false);
  const [activeCredentialConfigTab, setActiveCredentialConfigTab] = useState('vault');
  const [activeAapConfigTab, setActiveAapConfigTab] = useState('general');
  const [activeAapCredentialTab, setActiveAapCredentialTab] = useState('');
  const [activeRhbkDetailTab, setActiveRhbkDetailTab] = useState('client');
  const [importStatus, setImportStatus] = useState('');
  const [runFinished, setRunFinished] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [consoleFontSize, setConsoleFontSize] = useState(13);
  const [agentInstallerResult, setAgentInstallerResult] = useState(null);
  const [agentInstallerBusy, setAgentInstallerBusy] = useState(false);
  const [agentInstallerPreviewTab, setAgentInstallerPreviewTab] = useState('install');
  const [agentInstallerProfiles, setAgentInstallerProfiles] = useState([]);
  const outputRef = useRef(null);
  const importFileRef = useRef(null);
  const publishFileRef = useRef(null);

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
    terminal: 'Terminal Help'
  }[tab] || tab);

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
    if (activeTab === 'events' && debugTab !== 'events') {
      fetchDebugTab(debugTab);
    }
  }, [activeTab, debugTab, runFinished]);

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

  const newCredentialId = () => `cred-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const credentialTabKey = (credential, index) => credential.id || `credential-${index}`;

  const DEFAULT_AAP_EXECUTION_ENVIRONMENT = 'ee-supported-rhel9';

  const resolveHubExecutionEnvironmentName = aap => {
    const custom = String(aap?.hub_ee_execution_environment_name || '').trim();
    if (custom) return custom;
    return String(aap?.hub_ee_name || 'ado-ee').trim() || 'ado-ee';
  };

  const setAapHubValidated = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      copy.aap.hub_publish_ado_collection = value;
      copy.aap.hub_mark_ado_validated = value;
      if (!value) copy.aap.hub_update_collection_only = false;
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
        copy.aap.execution_environment = resolveHubExecutionEnvironmentName(copy.aap);
      } else if (
        !copy.aap.execution_environment
        || copy.aap.execution_environment === previousHubEe
      ) {
        copy.aap.execution_environment = DEFAULT_AAP_EXECUTION_ENVIRONMENT;
      }
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

  const groupComponents = ['openshift', 'rhel', 'patching', 'provision'];

  const selectedComponentAppsFrom = source => {
    if (Array.isArray(source.components) && source.components.includes('all')) {
      return [
        ...new Set([
          ...openshiftApps,
          ...rhelApps,
          ...patchingApps,
          ...provisionApps,
          'jira'
        ])
      ];
    }

    const out = [];
    const expandableGroups = ['openshift', 'rhel', 'patching', 'provision'];
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
    const fallback = ['rhel', 'satellite', 'idm', 'compliance', 'stig'].includes(component)
      ? { hostname: '' }
      : { hostname: '', storage: '' };
    const base = defaults.component_config?.[component] || fallback;
    const config = JSON.parse(JSON.stringify(base));

    if (component === 'satellite') {
      config.dynamic_inventory_enabled = config.dynamic_inventory_enabled !== false;
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

    if (!hydrated.component_config) hydrated.component_config = {};

    selectedApps.forEach(component => {
      const defaultsForComponent = defaultComponentConfig(component);
      hydrated.component_config[component] = deepMerge(
        defaultsForComponent,
        hydrated.component_config[component] || {}
      );

      if (component === 'satellite' && hydrated.component_config[component].dynamic_inventory_enabled === undefined) {
        hydrated.component_config[component].dynamic_inventory_enabled = true;
      }

      if (component === 'idm') {
        delete hydrated.component_config[component].storage;
      }
    });

    hydrated.component_config = Object.fromEntries(
      Object.entries(hydrated.component_config).filter(([component]) => allowedConfig.has(component))
    );

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
    if (!merged.aap) merged.aap = {};
    if (!Array.isArray(merged.aap.additional_credentials)) merged.aap.additional_credentials = [];
    merged.aap.additional_credentials = merged.aap.additional_credentials.map((credential, index) => ({
      ...credential,
      id: credential.id || `imported-credential-${index + 1}`
    }));
    if (merged.aap.skip_tls_verify === undefined) merged.aap.skip_tls_verify = false;
    if (merged.aap.project_sync_timeout === undefined) merged.aap.project_sync_timeout = 45;
    if (merged.aap.project_sync_retries === undefined) merged.aap.project_sync_retries = 20;
    if (merged.aap.project_sync_delay === undefined) merged.aap.project_sync_delay = 5;
    if (merged.aap.project_playbook_wait_seconds === undefined) merged.aap.project_playbook_wait_seconds = 45;
    if (merged.aap.hub_publish_ado_collection === undefined) merged.aap.hub_publish_ado_collection = false;
    if (merged.aap.hub_force_ado_collection_update === undefined) merged.aap.hub_force_ado_collection_update = false;
    if (merged.aap.hub_update_collection_only === undefined) merged.aap.hub_update_collection_only = false;
    if (merged.aap.hub_push_ee === undefined) merged.aap.hub_push_ee = false;
    merged.aap.hub_mark_ado_validated = merged.aap.hub_publish_ado_collection === true;
    if (merged.aap.hub_ee_source_image === undefined) {
      merged.aap.hub_ee_source_image = defaults.aap.hub_ee_source_image;
    }
    if (merged.aap.hub_ee_name === undefined) merged.aap.hub_ee_name = defaults.aap.hub_ee_name;
    if (merged.aap.hub_ee_tag === undefined) merged.aap.hub_ee_tag = defaults.aap.hub_ee_tag;
    if (merged.aap.hub_ee_registry === undefined) merged.aap.hub_ee_registry = '';
    if (merged.aap.hub_ee_pull === undefined) merged.aap.hub_ee_pull = false;
    merged.aap.hub_ee_pull = false;
    if (merged.aap.hub_ee_create_execution_environment === undefined) {
      merged.aap.hub_ee_create_execution_environment = true;
    }
    if (merged.aap.hub_ee_execution_environment_name === undefined) {
      merged.aap.hub_ee_execution_environment_name = '';
    }
    if (merged.aap.hub_ee_description === undefined) merged.aap.hub_ee_description = '';
    if (merged.aap.galaxy_setup_enabled === undefined) merged.aap.galaxy_setup_enabled = false;
    if (merged.aap.galaxy_hub_token === undefined) merged.aap.galaxy_hub_token = '';
    if (!merged.aap.galaxy_user_account) {
      merged.aap.galaxy_user_account = { ...defaults.aap.galaxy_user_account };
    }
    if (!Array.isArray(merged.aap.galaxy_credentials) || merged.aap.galaxy_credentials.length === 0) {
      merged.aap.galaxy_credentials = buildDefaultGalaxyCredentials(
        merged.aap.organization || 'ADO',
        merged.aap.hostname || ''
      );
    }
    if (!merged.aap.container_registry_credential) {
      merged.aap.container_registry_credential = buildDefaultContainerRegistryCredential(
        merged.aap.organization || 'ADO',
        merged.aap.hostname || ''
      );
    }

    if (!merged.aap.machine_credential) merged.aap.machine_credential = { ...defaults.aap.machine_credential };
    if (!merged.git) merged.git = { ...defaults.git };
    if (merged.git.skip_tls_verify === undefined) merged.git.skip_tls_verify = true;
    if (String(merged.scm_tool || '').toLowerCase() === 'bitbucket') {
      merged.git.username = 'x-token-auth';
    } else if (!merged.git.username) {
      merged.git.username = 'oauth2';
    }
    if (!merged.vault) merged.vault = { ...defaults.vault };
    if (merged.vault.encrypt === undefined) merged.vault.encrypt = true;
    if (!merged.component_survey || typeof merged.component_survey !== 'object') {
      merged.component_survey = {};
    }
    Object.entries(merged.component_survey).forEach(([component, survey]) => {
      if (!survey || typeof survey !== 'object') {
        merged.component_survey[component] = { environments: [...DEFAULT_SURVEY_ENVIRONMENTS] };
        return;
      }
      if (!Array.isArray(survey.environments) || survey.environments.length === 0) {
        survey.environments = [...DEFAULT_SURVEY_ENVIRONMENTS];
      } else {
        survey.environments = survey.environments
          .map(value => String(value || '').trim())
          .filter(Boolean);
      }
    });
    if (!merged.ansible) merged.ansible = { ...defaults.ansible };
    if (!merged.collections) merged.collections = { ...defaults.collections };
    if (!merged.tools) merged.tools = { ...defaults.tools };
    if (!merged.jira) merged.jira = { ...defaults.jira };
    merged.jira.enabled = merged.components.includes('all') || merged.components.includes('jira') || merged.jira.enabled === true;

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

  const buildPreflightPayload = (source = data) => {
    const payload = hydrateSelectedComponentConfigs(pruneInactiveComponentApps(source));
    const selectedApps = selectedComponentAppsFrom(payload);
    const selectedGroups = Array.isArray(payload.components) ? payload.components : [];
    const allowedConfig = new Set([...selectedApps, ...selectedGroups]);
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
      if (payload.aap.hub_update_collection_only === undefined) payload.aap.hub_update_collection_only = false;
      if (payload.aap.hub_push_ee === undefined) payload.aap.hub_push_ee = false;
      payload.aap.hub_ee_pull = false;
      if (payload.aap.hub_update_collection_only === true) {
        payload.aap.hub_publish_ado_collection = true;
        payload.aap.hub_mark_ado_validated = true;
        payload.aap.hub_force_ado_collection_update = true;
        payload.components = [];
        delete payload.component;
        payload.platform = [];
        payload.selected_component_apps = [];
        payload.component_config = {};
        payload.component_options = {};
      }
      payload.aap.additional_credentials = (payload.aap.additional_credentials || []).map(credential => {
        const { id, ...credentialPayload } = credential;
        return credentialPayload;
      });
    }

    if (!allowedConfig.has('openshift')) {
      delete payload.openshift;
    } else if (payload.openshift) {
      const openshiftOptions = payload.component_options?.openshift || [];
      if (!openshiftOptions.includes('admin_htpasswd')) {
        delete payload.openshift.admin_username;
        delete payload.openshift.admin_password;
        delete payload.openshift.admin_role;
      }
      if (!openshiftOptions.includes('console_banner')) {
        delete payload.openshift.banner_text;
        delete payload.openshift.banner_location;
        delete payload.openshift.banner_background_color;
        delete payload.openshift.banner_text_color;
      }
      if (!openshiftOptions.includes('agent_installer')) {
        delete payload.openshift.agent_installer;
      }
    }

    if (!selectedApps.includes('jira')) {
      payload.jira = { ...(payload.jira || {}), enabled: false };
    }

    return payload;
  };

  const ensureComponentConfig = component => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));

      if (!copy.component_config) copy.component_config = {};
      if (!copy.component_config[component]) copy.component_config[component] = defaultComponentConfig(component);
      if (copy.component_config[component].hostname === undefined) copy.component_config[component].hostname = '';
      if (!['rhel', 'satellite', 'idm', 'compliance', 'stig'].includes(component) && copy.component_config[component].storage === undefined) {
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

      if (!copy.jira) copy.jira = {};
      copy.jira.enabled = next.includes('all') || next.includes('jira');

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
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.openshift) copy.openshift = {};
      copy.openshift.agent_installer = JSON.parse(JSON.stringify(profile.config));
      return copy;
    });
    setAgentInstallerResult(null);
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

  const callAgentInstallerApi = async (endpoint, expectBlob = false) => {
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
        a.download = `${agentInstallerConfig().cluster_name || 'openshift-agent'}-agent-configs.zip`;
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

  const downloadJson = () => {
    const payload = buildPreflightPayload();
    const name = payload.components.includes('all') ? 'all' : payload.components.join('-');

    downloadFile(
      `ado-preflight-${payload.environment || 'env'}-${name}.json`,
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
    if (key !== 'events') {
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

  const runScaffoldingJob = async ({ endpoint = '/api/bootstrap', startMessage = 'Starting bootstrap inside container...' } = {}) => {
    setRunFinished(false);
    setShowRawOutput(false);
    setActiveTab('logs');
    setPreview(`${startMessage}\n`);
    setEvents(`${startMessage}\n`);

    let keepPolling = true;

    const poller = setInterval(async () => {
      if (!keepPolling) return;

      try {
        const logs = await fetch('/api/logs');
        const text = await logs.text();
        setPreview(text || 'Running...');

        const eventsResp = await fetch('/api/events');
        const eventsText = await eventsResp.text();
        setEvents(eventsText || 'No events yet.');
      } catch (err) {
        setPreview(`ERROR reading logs:\n${err.message}`);
      }
    }, 1000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPreflightPayload())
      });

      const result = await response.json();

      const logs = await fetch('/api/logs');
      const text = await logs.text();

      const eventsResp = await fetch('/api/events');
      const eventsText = await eventsResp.text();

      const recap = result.bootstrapRecap ? `\n${result.bootstrapRecap}` : '';
      const errorLine = result.error ? `\nERROR: ${result.error}` : '';
      setPreview(`${text}\n\nRESULT:\n${JSON.stringify(result, null, 2)}${errorLine}${recap}`);
      setEvents(eventsText || 'No events were returned.');
      if (!response.ok || result.status === 'failed') {
        setImportStatus(result.error || `${endpoint} failed`);
      }
    } catch (err) {
      setPreview(`ERROR:\n${err.message}`);
    } finally {
      keepPolling = false;
      clearInterval(poller);
      setRunFinished(true);
    }
  };

  const runBootstrapInsideContainer = async () => {
    await runScaffoldingJob({
      endpoint: '/api/bootstrap',
      startMessage: 'Starting bootstrap inside container...'
    });
  };

  const runEncryptAndPush = async (payloadOverride = null) => {
    let sourceData = data;
    if (payloadOverride) {
      sourceData = normalizeImportedPreflight(payloadOverride);
      setData(sourceData);
      selectImportedConfigPanel(sourceData);
      setImportStatus('Loaded JSON for encrypt & push');
    }

    const payload = buildPreflightPayload(sourceData);

    if (!payload?.aap?.git_url) {
      setImportStatus('Push needs Project Git Source URL');
      setPreview('ERROR: Missing Project Git Source URL (Git Configuration).\n');
      setActiveTab('logs');
      return;
    }
    if (!payload?.git?.token) {
      setImportStatus('Push needs a Git token');
      setPreview('ERROR: Missing Git token (Git Configuration).\n');
      setActiveTab('logs');
      return;
    }
    if (payload?.vault?.encrypt !== false && !String(payload?.aap?.vault_password || '').trim()) {
      setImportStatus('Push needs a Vault password when encrypt is enabled');
      setPreview('ERROR: Missing Vault password (Credentials → Vault), or uncheck Encrypt preflight JSON.\n');
      setActiveTab('logs');
      return;
    }

    if (!payload.vault) payload.vault = { encrypt: true };
    if (payload.vault.encrypt === undefined) payload.vault.encrypt = true;
    payload.git = { ...(payload.git || {}), auto_push: true };

    setRunFinished(false);
    setShowRawOutput(false);
    setActiveTab('logs');
    setPreview('Pushing preflight JSON to Git (no bootstrap)...\n');
    setEvents('Starting publish request...\n');
    setActionsOpen(false);

    let keepPolling = true;
    const poller = setInterval(async () => {
      if (!keepPolling) return;
      try {
        const logs = await fetch('/api/logs');
        setPreview((await logs.text()) || 'Running...');
        const eventsResp = await fetch('/api/events');
        setEvents((await eventsResp.text()) || 'No events yet.');
      } catch (err) {
        setPreview(`ERROR reading logs:\n${err.message}`);
      }
    }, 1000);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      const text = await (await fetch('/api/logs')).text();
      const eventsText = await (await fetch('/api/events')).text();
      const recap = result.bootstrapRecap ? `\n${result.bootstrapRecap}` : '';
      const errorLine = result.error ? `\nERROR: ${result.error}` : '';
      setPreview(`${text}\n\nRESULT:\n${JSON.stringify(result, null, 2)}${errorLine}${recap}`);
      setEvents(eventsText || 'No events were returned.');
      setImportStatus(
        response.ok && result.status === 'complete'
          ? (result.encryptJson
            ? `Pushed encrypted ${result.preflightFile || 'preflight JSON'} to Git`
            : `Pushed ${result.preflightFile || 'preflight JSON'} to Git`)
          : (result.error || 'Push JSON to Git failed')
      );
    } catch (err) {
      setPreview(`ERROR:\n${err.message}`);
      setImportStatus(`Push JSON failed: ${err.message}`);
    } finally {
      keepPolling = false;
      clearInterval(poller);
      setRunFinished(true);
    }
  };

  const publishJsonFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      setImportStatus(`Uploading ${file.name} for encrypt & push...`);
      await runEncryptAndPush(imported);
    } catch (err) {
      setImportStatus(`Publish failed: ${err.message}`);
      setPreview(`ERROR:\n${err.message}`);
      setActiveTab('logs');
    } finally {
      event.target.value = '';
    }
  };

  const renderOutput = () => {
    if (showRawOutput) return preview;

    return preview.split('\n').map((line, idx) => {
      let color = '#f0f0f0';
      let fontWeight = 400;

      const failedMatch = line.match(/failed=(\d+)/);
      const unreachableMatch = line.match(/unreachable=(\d+)/);
      const rescuedMatch = line.match(/rescued=(\d+)/);

      const failedCount = failedMatch ? Number(failedMatch[1]) : 0;
      const unreachableCount = unreachableMatch ? Number(unreachableMatch[1]) : 0;
      const rescuedCount = rescuedMatch ? Number(rescuedMatch[1]) : 0;

      const isRecapLine = /^\S+\s*:\s*ok=\d+/.test(line);
      const hasHardFailure =
        /FAILED!|fatal:|exit code [1-9]\d*|ERROR!/i.test(line) ||
        failedCount > 0 ||
        unreachableCount > 0;

      if (isRecapLine) {
        if (failedCount > 0 || unreachableCount > 0) {
          color = '#ff6b6b';
          fontWeight = 700;
        } else if (rescuedCount > 0) {
          color = '#ec7a08';
          fontWeight = 700;
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
      } else if (/PLAY RECAP|PLAY \[/.test(line)) {
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
  };

  const renderEvents = () => {
    return (events || 'No events yet.').split('\n').map((line, idx) => {
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

    return (content || `No ${debugTabLabel(debugTab)} data yet.`).split('\n').map((line, idx) => {
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

  const parseSurveyEnvironments = value => (
    String(value || '')
      .split(/[\n,]+/)
      .map(part => part.trim())
      .filter(Boolean)
  );

  const getComponentSurveyEnvironments = component => {
    const configured = data.component_survey?.[component]?.environments;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured;
    }
    return [...DEFAULT_SURVEY_ENVIRONMENTS];
  };

  const setComponentSurveyEnvironments = (component, rawValue) => {
    const environments = parseSurveyEnvironments(rawValue);
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_survey) copy.component_survey = {};
      copy.component_survey[component] = {
        ...(copy.component_survey[component] || {}),
        environments: environments.length > 0 ? environments : [...DEFAULT_SURVEY_ENVIRONMENTS]
      };
      return copy;
    });
  };

  const renderComponentSurveyEnvironments = component => {
    if (!SURVEY_ENV_EDITABLE_COMPONENTS.has(component)) return null;

    return (
      <Grid hasGutter style={{ marginBottom: '16px' }}>
        <GridItem span={12}>
          <FormGroup
            label={labelWithHelp(
              'Survey environments',
              'Choices shown in the AAP job-template env survey for this component. Comma or newline separated. Defaults: dev, test, preprod, prod.'
            )}
          >
            <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: '8px' }}>
              Applies to this component&apos;s simple <code>env</code> survey only (not Satellite / VM / complex surveys).
            </p>
            <textarea
              value={getComponentSurveyEnvironments(component).join(', ')}
              onChange={e => setComponentSurveyEnvironments(component, e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '8px' }}
              placeholder="dev, test, preprod, prod"
            />
          </FormGroup>
        </GridItem>
      </Grid>
    );
  };

  const defaultComponentHelp = {
    hostname: 'Hostname or URL for this component. Example: https://grafana.apps.ocp.prod.rhlab or grafana.server.lab.',
    storage: 'Storage class or storage value for OpenShift-backed deployments. Example: ocs-storagecluster-ceph-rbd.'
  };

  const grafanaHelp = {
    hostname: 'Grafana route or hostname. Example: https://grafana.apps.ocp.prod.rhlab.',
    storage: 'OpenShift storage class used by Grafana. Example: ocs-storagecluster-ceph-rbd.',
    folderName: 'Grafana folder to create. Example: OpenShift.',
    dashboardsSource: 'Folder path or Git repository containing dashboard JSON files.'
  };

  const rhbkHelp = {
    hostname: 'RHBK hostname or route. Example: https://keycloak.apps.ocp.prod.rhlab.',
    storage: 'OpenShift storage class used by RHBK. Example: ocs-storagecluster-ceph-rbd.',
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
    tokenClaimType: 'Token claim type. Example: String or JSON.'
  };

  const idmHelp = {
    hostname: 'Primary IdM server hostname. Example: idm.server.lab.',
    domain: 'DNS domain for IdM. Example: server.lab.',
    realm: 'Kerberos realm, usually the domain in uppercase. Example: SERVER.LAB.',
    replicaHostname: 'Replica host to install when IdM Replica Install is selected. Example: idm-replica.server.lab.',
    replicaDns: 'Install integrated DNS services on the replica.',
    replicaCa: 'Install certificate services on the replica.',
    dnsForwarders: 'Configure automatic DNS forwarders for IdM DNS.',
    customCertFile: 'Path to the custom IdM certificate file in the generated repo or mounted workspace.',
    customCertKeyFile: 'Path to the private key for the custom IdM certificate.',
    customCertChainFile: 'Path to the certificate chain file for the custom IdM certificate.',
    adminPassword: 'IdM admin password. Stored in generated vault files.',
    directoryManagerPassword: 'Directory Manager password. Stored in generated vault files.'
  };

  const rhelHelp = {
    complianceProfile: 'Compliance profile used by generated RHEL compliance jobs. Example: PCI-DSS.',
    stigProfile: 'STIG profile used by generated RHEL hardening jobs. Example: RHEL 9 STIG.',
    hostname: 'Primary RHEL host to include in the RHEL inventory. Example: rhel01.server.lab.',
    hosts: 'Additional RHEL hosts, one per line. Example: rhel02.server.lab.'
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
    agentNodeStatic: 'Static networking writes NMState config into agent-config.yaml. DHCP uses the MAC/interface only.'
  };

  const renderDefaultComponentConfig = component => (
    <Grid hasGutter>
      {renderTextField('Hostname', `component_config.${component}.hostname`, 'text', defaultComponentHelp.hostname)}
      {renderTextField('Storage', `component_config.${component}.storage`, 'text', defaultComponentHelp.storage)}
    </Grid>
  );

  const renderGrafanaConfig = () => (
    <>
      {renderComponentOptions('grafana', 'Grafana Options', 'Select which Grafana resources to configure.')}
      <Grid hasGutter>
        {renderTextField('Hostname / URL', 'component_config.grafana.hostname', 'text', grafanaHelp.hostname)}
        {renderTextField('Storage Class', 'component_config.grafana.storage', 'text', grafanaHelp.storage)}
        {renderTextField('Folder Name', 'component_config.grafana.folder_name', 'text', grafanaHelp.folderName)}
        {renderTextField('Folder or Git Repo for Dashboards', 'component_config.grafana.dashboards_source', 'text', grafanaHelp.dashboardsSource)}
      </Grid>
    </>
  );

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
      case 'client':
        return (
          <Grid hasGutter>
            {renderTextField('Client ID', 'component_config.rhbk.client', 'text', rhbkHelp.client)}
            {renderTextField('Client Name', 'component_config.rhbk.client_name', 'text', rhbkHelp.clientName)}
            {renderTextField('Redirect URIs', 'component_config.rhbk.client_redirect_uris', 'text', rhbkHelp.redirectUris)}
            {renderTextField('Web Origins', 'component_config.rhbk.client_web_origins', 'text', rhbkHelp.webOrigins)}
          </Grid>
        );
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

  const renderRhbkConfig = () => (
    <>
      {renderComponentOptions('rhbk', 'RHBK Options', 'Select which RHBK resources to configure.')}
      <Grid hasGutter>
        {renderTextField('Hostname / URL', 'component_config.rhbk.hostname', 'text', rhbkHelp.hostname)}
        {renderTextField('Storage Class', 'component_config.rhbk.storage', 'text', rhbkHelp.storage)}
        {renderTextField('Realm', 'component_config.rhbk.realm', 'text', rhbkHelp.realm)}
      </Grid>
      {renderRhbkDetailTabs()}
    </>
  );


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
    skipTls: 'Disable Satellite certificate validation for self-signed or lab certificates.'
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

  const renderSatelliteConfig = () => (
    <>
      {renderComponentOptions('satellite', 'Satellite Options', 'Select which Satellite resources to configure.')}
      <Button variant="link" onClick={() => setShowSatelliteSecrets(!showSatelliteSecrets)}>
        {showSatelliteSecrets ? 'Hide Service Account' : 'Show Service Account'}
      </Button>
      <br /><br />
      <Grid hasGutter>
        {renderTextField('Hostname / URL', 'component_config.satellite.hostname', 'text', satelliteHelp.hostname)}
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('Satellite Deployment Version', satelliteHelp.deploymentVersion)}>
            <select
              value={data.component_config.satellite.deployment_version || '6.19'}
              onChange={e => set('component_config.satellite.deployment_version', e.target.value)}
              style={{ width: '100%', height: '36px' }}
            >
              <option value="6.17">6.17</option>
              <option value="6.18">6.18</option>
              <option value="6.19">6.19</option>
            </select>
          </FormGroup>
        </GridItem>
        {renderTextField('Organization', 'component_config.satellite.organization', 'text', satelliteHelp.organization)}
        {renderTextField('Activation Key', 'component_config.satellite.activation_key', 'text', satelliteHelp.activationKey)}
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
              {data.component_config.satellite.manifest_file
                ? `Selected: ${data.component_config.satellite.manifest_file}. Generated repo path: files/${data.component_config.satellite.manifest_file}.`
                : 'Upload a Red Hat Satellite manifest ZIP. It will be written to the generated repo files/ directory.'}
            </div>
            {data.component_config.satellite.manifest_file && (
              <Button variant="link" onClick={clearSatelliteManifest}>Clear Manifest</Button>
            )}
          </FormGroup>
        </GridItem>
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('Satellite Size Profile', satelliteHelp.sizeProfile)}>
            <select
              value={data.component_config.satellite.size_profile || 'default'}
              onChange={e => set('component_config.satellite.size_profile', e.target.value)}
              style={{ width: '100%', height: '36px' }}
            >
              {(data.component_config.satellite.size || []).map(profile => (
                <option key={profile.name} value={profile.name}>
                  {profile.name} ({profile.min_hosts}-{profile.max_hosts} hosts, {profile.min_ram}GB RAM, {profile.min_cpu} CPU)
                </option>
              ))}
            </select>
          </FormGroup>
        </GridItem>
        {renderTextField('Service Account Username', 'component_config.satellite.service_account_username', 'text', satelliteHelp.serviceAccountUsername)}
        {renderTextField('Service Account Password', 'component_config.satellite.service_account_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.serviceAccountPassword)}
        {renderTextField('Admin Password', 'component_config.satellite.admin_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.adminPassword)}
        <GridItem span={12}>
          <FormGroup label={labelWithHelp('Satellite Storage Mounts', satelliteHelp.reqDirs)}>
            {(data.component_config.satellite.req_dirs || []).map((row, index) => (
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
        <GridItem span={12}>
          <FormGroup label={labelWithHelp('Satellite Dynamic Inventory', satelliteHelp.dynamicInventory)}>
            <Checkbox
              id="satellite-dynamic-inventory"
              label="Create AAP Satellite inventory source"
              isChecked={data.component_config.satellite.dynamic_inventory_enabled}
              onChange={(_, v) => set('component_config.satellite.dynamic_inventory_enabled', v)}
            />
            <div style={{ color: '#6a6e73', fontSize: '13px', marginTop: '6px' }}>
              Created as an inventory source under {data.aap.organization || 'ADO'}-RHEL-Inventory, not as a separate top-level inventory.
            </div>
          </FormGroup>
        </GridItem>
        {data.component_config.satellite.dynamic_inventory_enabled && (
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
                  isChecked={data.component_config.satellite.inventory_overwrite}
                  onChange={(_, v) => set('component_config.satellite.inventory_overwrite', v)}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={4}>
              <FormGroup label={labelWithHelp('Overwrite Vars', satelliteHelp.overwriteVars)}>
                <Checkbox
                  id="satellite-inventory-overwrite-vars"
                  label="Overwrite variables"
                  isChecked={data.component_config.satellite.inventory_overwrite_vars}
                  onChange={(_, v) => set('component_config.satellite.inventory_overwrite_vars', v)}
                />
              </FormGroup>
            </GridItem>
            <GridItem span={4}>
              <FormGroup label={labelWithHelp('Update On Launch', satelliteHelp.updateOnLaunch)}>
                <Checkbox
                  id="satellite-inventory-update-on-launch"
                  label="Update on launch"
                  isChecked={data.component_config.satellite.inventory_update_on_launch}
                  onChange={(_, v) => set('component_config.satellite.inventory_update_on_launch', v)}
                />
              </FormGroup>
            </GridItem>
          </>
        )}
        <GridItem span={6}>
          <FormGroup label={labelWithHelp('TLS Certificate Verification', satelliteHelp.skipTls)}>
            <Checkbox
              id="satellite-skip-tls-verify"
              label="Skip TLS certificate verification for self-signed certificates"
              isChecked={!data.component_config.satellite.validate_certs}
              onChange={(_, v) => set('component_config.satellite.validate_certs', !v)}
            />
          </FormGroup>
        </GridItem>
      </Grid>

    </>
  );

  const renderIdmConfig = () => {
    const selected = data.component_options?.idm || [];
    const showReplica = selected.includes('idm_replica_install');
    const showDns = selected.includes('idm_dns_install');
    const showCustomCert = selected.includes('idm_custom_cert');

    return (
      <>
        {renderComponentOptions('idm', 'IDM Options', 'Select which IDM resources to configure.')}

        <Button variant="link" onClick={() => setShowIdmSecrets(!showIdmSecrets)}>
          {showIdmSecrets ? 'Hide Secrets' : 'Show Secrets'}
        </Button>
        <br /><br />
        <Grid hasGutter>
          {renderTextField('Hostname', 'component_config.idm.hostname', 'text', idmHelp.hostname)}
          {renderTextField('Domain', 'component_config.idm.domain', 'text', idmHelp.domain)}
          {renderTextField('Realm', 'component_config.idm.realm', 'text', idmHelp.realm)}
          {showReplica && renderTextField('IPA Replica Hostname', 'component_config.idm.replica_hostname', 'text', idmHelp.replicaHostname)}
          {showReplica && (
            <>
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Replica DNS', idmHelp.replicaDns)}>
                  <Checkbox
                    id="idm-replica-install-dns"
                    label="Install DNS on replica"
                    isChecked={data.component_config.idm.replica_install_dns}
                    onChange={(_, v) => set('component_config.idm.replica_install_dns', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label={labelWithHelp('Replica Certificate Services', idmHelp.replicaCa)}>
                  <Checkbox
                    id="idm-replica-install-ca"
                    label="Install certificate services on replica"
                    isChecked={data.component_config.idm.replica_install_ca}
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
                  isChecked={data.component_config.idm.auto_forwarders}
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
          {renderTextField('Admin Password', 'component_config.idm.admin_password', showIdmSecrets ? 'text' : 'password', idmHelp.adminPassword)}
          {renderTextField('Directory Manager Password', 'component_config.idm.directory_manager_password', showIdmSecrets ? 'text' : 'password', idmHelp.directoryManagerPassword)}
        </Grid>
      </>
    );
  };

  const toggleComponentOption = (component, option) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_options) copy.component_options = {};

      const current = copy.component_options[component] || [];
      copy.component_options[component] = current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option];

      return copy;
    });
  };

  const setAllComponentOptions = (component, enabled) => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.component_options) copy.component_options = {};
      copy.component_options[component] = enabled ? [...(componentOptionDefaults[component] || [])] : [];
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
    if (group === 'provision') return provisionApps;
    return [];
  };

  const getGroupTitle = group => {
    if (group === 'openshift') return 'OpenShift Applications';
    if (group === 'rhel') return 'RHEL Components';
    if (group === 'patching') return 'Patching Options';
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

  const renderPatchingConfig = () => (
    <>
      {renderGroupComponentOptions(
        'patching',
        'Patching Options',
        'Select which patching-related components to include.'
      )}

    </>
  );

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
          'Provision',
          'Grafana',
          'RHBK',
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

  const renderOpenShiftAdminHtpasswdConfig = () => (
    <Grid hasGutter>
      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Admin HTPasswd Username', openshiftHelp.adminUsername)}>
          <TextInput
            value={data.openshift.admin_username || ''}
            onChange={(_, v) => set('openshift.admin_username', v)}
          />
        </FormGroup>
      </GridItem>

      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Admin HTPasswd Password', openshiftHelp.adminPassword)}>
          <TextInput
            type="password"
            value={data.openshift.admin_password || ''}
            onChange={(_, v) => set('openshift.admin_password', v)}
          />
        </FormGroup>
      </GridItem>

      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Admin HTPasswd Role', openshiftHelp.adminRole)}>
          <TextInput
            value={data.openshift.admin_role || 'cluster-admin'}
            onChange={(_, v) => set('openshift.admin_role', v)}
          />
        </FormGroup>
      </GridItem>
    </Grid>
  );

  const renderOpenShiftConsoleBannerConfig = () => (
    <Grid hasGutter>
      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Console Banner Location', openshiftHelp.bannerLocation)}>
          <TextInput
            value={data.openshift.banner_location || 'BannerTop'}
            onChange={(_, v) => set('openshift.banner_location', v)}
          />
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
          <TextInput
            value={data.openshift.banner_background_color || '#1f7a1f'}
            onChange={(_, v) => set('openshift.banner_background_color', v)}
          />
        </FormGroup>
      </GridItem>

      <GridItem span={6}>
        <FormGroup label={labelWithHelp('Console Banner Text Color', openshiftHelp.bannerTextColor)}>
          <TextInput
            value={data.openshift.banner_text_color || '#ffffff'}
            onChange={(_, v) => set('openshift.banner_text_color', v)}
          />
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <Button variant="secondary" onClick={saveAgentProfile}>Save Profile</Button>
              <Button variant="secondary" onClick={cloneAgentProfile}>Clone Current Profile</Button>
              <Button variant="link" onClick={deleteAgentProfile}>Delete Saved Profile</Button>
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
          <GridItem span={12}>
            <Checkbox
              label="Require root device hints for every node"
              isChecked={config.require_root_device === true}
              onChange={(_, v) => setAgentInstaller('require_root_device', v)}
            />
          </GridItem>
        </Grid>

        <div style={{ fontWeight: 700, margin: '20px 0 8px' }}>Nodes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1180px' }}>
            <thead>
              <tr>
                {['Hostname', 'Role', 'MAC Address', 'Interface', 'Network', 'Static IP', 'Prefix', 'Gateway', 'DNS Servers', 'Disk', 'Labels', 'Taints', ''].map(header => (
                  <th key={header} style={{ textAlign: 'left', padding: '6px', borderBottom: `1px solid ${borderColor}` }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, index) => (
                <tr key={`${node.hostname || 'node'}-${index}`}>
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
                    <TextInput value={node.macAddress || ''} onChange={(_, v) => setAgentNode(index, 'macAddress', v)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.interfaceName || ''} onChange={(_, v) => setAgentNode(index, 'interfaceName', v)} />
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
                    <TextInput value={node.diskDevice || ''} onChange={(_, v) => setAgentNode(index, 'diskDevice', v)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.labels || ''} onChange={(_, v) => setAgentNode(index, 'labels', v)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput value={node.taints || ''} onChange={(_, v) => setAgentNode(index, 'taints', v)} />
                  </td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                    <Button variant="link" onClick={() => removeAgentNode(index)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <Button variant="secondary" onClick={addAgentNode}>Add Node</Button>
          <Button variant="primary" isDisabled={agentInstallerBusy} onClick={validateAgentInstaller}>Validate Configuration</Button>
          <Button variant="secondary" isDisabled={agentInstallerBusy} onClick={generateAgentInstaller}>Generate YAML Preview</Button>
          <Button variant="secondary" isDisabled={agentInstallerBusy} onClick={downloadAgentInstallerZip}>Download ZIP</Button>
          {result?.installConfig && (
            <>
              <Button variant="link" onClick={() => downloadFile('install-config.yaml', result.installConfig)}>Download install-config.yaml</Button>
              <Button variant="link" onClick={() => downloadFile('agent-config.yaml', result.agentConfig)}>Download agent-config.yaml</Button>
            </>
          )}
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

  const renderConfigForm = (panelOverride = null) => {
    const panel = panelOverride || activeConfigPanel || 'all';

    let body;
    switch (panel) {
      case 'all':
        body = renderAllConfig();
        break;
      case 'openshift':
        body = renderOpenShiftGroupConfig();
        break;
      case 'admin_htpasswd':
        body = renderOpenShiftAdminHtpasswdConfig();
        break;
      case 'console_banner':
        body = renderOpenShiftConsoleBannerConfig();
        break;
      case 'agent_installer':
        body = renderAgentInstallerConfig();
        break;
      case 'rhel':
        body = renderRhelConfig();
        break;
      case 'patching':
        body = renderPatchingConfig();
        break;
      case 'provision':
        body = renderProvisionConfig();
        break;
      case 'jira':
        body = renderJiraConfig();
        break;
      case 'grafana':
        body = renderGrafanaConfig();
        break;
      case 'rhbk':
        body = renderRhbkConfig();
        break;
      case 'satellite':
        body = renderSatelliteConfig();
        break;
      case 'idm':
        body = renderIdmConfig();
        break;
      case 'compliance':
        body = renderComplianceConfig();
        break;
      case 'stig':
        body = renderStigConfig();
        break;
      default:
        body = renderDefaultComponentConfig(panel);
        break;
    }

    return (
      <>
        {renderComponentSurveyEnvironments(panel)}
        {body}
      </>
    );
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
        'grafana',
        'rhbk',
        'satellite',
        'idm',
        'kafka',
        'gitlab',
        'pega',
        'aap',
        'compliance',
        'stig'
      ];
    }

    if (selected.includes('openshift')) {
      const tabs = ['openshift'];
      (data.component_options?.openshift || []).forEach(option => {
        const optionTabs = ['admin_htpasswd', 'console_banner', 'agent_installer'];
        if (!optionTabs.includes(option)) {
          return;
        }
        if (!tabs.includes(option)) {
          tabs.push(option);
        }
      });
      (data.component_apps?.openshift || []).forEach(app => {
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

    return selected.filter(component => !groupComponents.includes(component));
  };

  const configTabLabel = tab => {
    if (tab === 'all') return 'All';
    if (tab === 'openshift') return 'OpenShift';
    if (tab === 'admin_htpasswd') return 'Admin HTPasswd';
    if (tab === 'console_banner') return 'Console Banner';
    if (tab === 'agent_installer') return 'Agent Installer';
    if (tab === 'rhel') return 'RHEL';
    if (tab === 'patching') return 'Patching';
    if (tab === 'provision') return 'Provision';
    if (tab === 'rhbk') return 'RHBK';
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <Title headingLevel="h2">Core Environment Information</Title>
                  {importStatus && (
                    <div style={{ color: importStatus.startsWith('Import failed') ? '#c9190b' : mutedTextColor, fontSize: '13px', marginTop: '6px' }}>
                      {importStatus}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={importJsonFile}
                  />
                  <input
                    ref={publishFileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={publishJsonFile}
                  />
                  <Button variant="secondary" onClick={() => importFileRef.current?.click()}>
                    Upload JSON
                  </Button>
                  <Button variant="secondary" onClick={() => publishFileRef.current?.click()}>
                    Upload JSON → Push to Git
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
            </CardBody>
          </Card>

          <br />

          {renderActiveConfigPanel()}

          {renderCredentialConfigCard()}

          <br />

          <Card style={cardStyle}>
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
                        onChange={() => {
                          setData(prev => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            copy.scm_tool = v;
                            if (!copy.git) copy.git = {};
                            if (v === 'bitbucket') {
                              copy.git.username = 'x-token-auth';
                            } else if (!copy.git.username || copy.git.username === 'x-token-auth') {
                              copy.git.username = 'oauth2';
                            }
                            return copy;
                          });
                        }}
                      />
                    )}
                  </FormGroup>
                  {data.scm_tool === 'bitbucket' && (
                    <p style={{ color: mutedTextColor, marginTop: '6px', marginBottom: 0 }}>
                      Bitbucket uses <code>Authorization: Bearer</code> for bootstrap git clone/push, and Source Control credentials use username <code>x-token-auth</code> with the token as the password.
                    </p>
                  )}

                  <br />

                  <Checkbox
                    label="Automatically commit and push generated content to Git"
                    isChecked={data.git.auto_push}
                    onChange={(_, v) => set('git.auto_push', v)}
                  />

                  <br />

                  <Checkbox
                    id="vault-encrypt-files"
                    label="Encrypt preflight JSON with ansible-vault before Git push"
                    isChecked={data.vault?.encrypt !== false}
                    onChange={(_, v) => set('vault.encrypt', v)}
                  />
                  <p style={{ color: mutedTextColor, marginTop: '6px', marginBottom: 0 }}>
                    Only used by <code>Upload JSON → Push to Git</code> / Actions → Push Preflight JSON. Uses the Vault password from Credentials. Does not run bootstrap.
                  </p>

                  <br />

                  <Checkbox
                    id="git-skip-tls-verify"
                    label="Skip TLS/SSL verification for Git (self-signed certificates)"
                    isChecked={data.git.skip_tls_verify !== false}
                    onChange={(_, v) => set('git.skip_tls_verify', v)}
                  />
                  <p style={{ color: mutedTextColor, marginTop: '6px', marginBottom: 0 }}>
                    Default is SSL verification disabled. When checked, local git uses <code>http.sslVerify=false</code>.
                  </p>
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

                  <FormGroup label="Git Token">
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <TextInput
                        type={showGitToken ? 'text' : 'password'}
                        value={data.git.token}
                        onChange={(_, v) => set('git.token', v)}
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

          <Card style={cardStyle}>
            <CardBody>
              <button type="button" onClick={() => data.aap.enabled && setAapOpen(!aapOpen)}
                style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, cursor: data.aap.enabled ? 'pointer' : 'default', fontSize: '20px', color: textColor }}>
                {data.aap.enabled ? (aapOpen ? '−' : '+') : ''} Ansible Automation Platform Configuration
              </button>

              <br /><br />

              <Radio label="Using AAP" name="aap" isChecked={data.aap.enabled} onChange={() => setAapEnabled(true)} />
              <Radio label="Not using AAP" name="aap" isChecked={!data.aap.enabled} onChange={() => setAapEnabled(false)} />

              {data.aap.enabled && aapOpen && (
                <>
                  <br />
                  <Tabs activeKey={activeAapConfigTab} onSelect={(_, key) => setActiveAapConfigTab(key)}>
                    <Tab eventKey="general" title="General" />
                    <Tab eventKey="hub" title="Hub" />
                    <Tab eventKey="galaxy" title="Galaxy" />
                  </Tabs>
                  <br />
                  {activeAapConfigTab === 'general' && (
                    <Grid hasGutter>
                      <GridItem span={6}><FormGroup label="AAP Hostname URL"><TextInput value={data.aap.hostname} onChange={(_, v) => set('aap.hostname', v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="AAP Version"><select value={data.aap.version} onChange={e => set('aap.version', e.target.value)} style={{ width: '100%', padding: '8px' }}><option value="24">2.4</option><option value="25">2.5</option><option value="26">2.6</option></select></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Organization Name"><TextInput value={data.aap.organization} onChange={(_, v) => setAapOrganization(v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Inventory Name"><TextInput value={data.aap.inventory} onChange={(_, v) => set('aap.inventory', v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Project Name"><TextInput value={data.aap.project} onChange={(_, v) => set('aap.project', v)} /></FormGroup></GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Execution Environment">
                          {data.aap.hub_push_ee ? (
                            <select
                              value={data.aap.execution_environment}
                              onChange={e => set('aap.execution_environment', e.target.value)}
                              style={{ width: '100%', padding: '8px' }}
                            >
                              <option value={resolveHubExecutionEnvironmentName(data.aap)}>
                                {resolveHubExecutionEnvironmentName(data.aap)}
                              </option>
                              <option value={DEFAULT_AAP_EXECUTION_ENVIRONMENT}>
                                {DEFAULT_AAP_EXECUTION_ENVIRONMENT}
                              </option>
                            </select>
                          ) : (
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

                      <GridItem span={6}><FormGroup label="Admin Username"><TextInput value={data.aap.admin_username} onChange={(_, v) => set('aap.admin_username', v)} /></FormGroup></GridItem>
                      <GridItem span={6}><FormGroup label="Admin Password"><TextInput type="password" value={data.aap.admin_password} onChange={(_, v) => set('aap.admin_password', v)} /></FormGroup></GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Project sync timeout (seconds)">
                          <TextInput
                            type="number"
                            value={data.aap.project_sync_timeout}
                            onChange={(_, v) => set('aap.project_sync_timeout', Number(v))}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Project sync retries">
                          <TextInput
                            type="number"
                            value={data.aap.project_sync_retries}
                            onChange={(_, v) => set('aap.project_sync_retries', Number(v))}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: 0 }}>
                          Default wait is 45s per sync attempt with 20 retries (5s between attempts). Increase timeout for slow Git remotes. After a successful sync, bootstrap pauses briefly so playbooks are visible before creating job templates.
                        </p>
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
                    </Grid>
                  )}
                  {activeAapConfigTab === 'hub' && (
                    <Grid hasGutter>
                      <GridItem span={12}>
                        <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: '8px' }}>
                          Optional. Leave all Hub actions unchecked for disconnected sites. Bootstrap never manages stock <code>ee-supported-*</code> Controller EEs.
                        </p>
                        <FormGroup label="Collections">
                          <Checkbox
                            label="Update infra.ado collection in validated AAP Hub content"
                            isChecked={data.aap.hub_publish_ado_collection && data.aap.hub_mark_ado_validated}
                            onChange={(_, v) => setAapHubValidated(v)}
                          />
                          <Checkbox
                            label="Force update infra.ado collection in validated content"
                            isChecked={data.aap.hub_force_ado_collection_update}
                            isDisabled={!data.aap.hub_publish_ado_collection}
                            onChange={(_, v) => set('aap.hub_force_ado_collection_update', v)}
                          />
                          <Checkbox
                            label="Update collection only"
                            isChecked={data.aap.hub_update_collection_only}
                            isDisabled={!data.aap.hub_publish_ado_collection}
                            onChange={(_, v) => set('aap.hub_update_collection_only', v)}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <FormGroup label="Execution environment (optional)">
                          <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: '8px' }}>
                            Requires the source image already present locally (for example via <code>podman images</code>). Never pulls from the internet — only tags and pushes the local image to Private Automation Hub.
                          </p>
                          <Checkbox
                            id="aap-hub-push-ee"
                            label="Push local ado-ee image to AAP Hub (optional)"
                            isChecked={data.aap.hub_push_ee === true}
                            onChange={(_, v) => setAapHubPushEe(v)}
                          />
                        </FormGroup>
                      </GridItem>
                      {data.aap.hub_push_ee && (
                        <>
                          <GridItem span={8}>
                            <FormGroup label="Source image (must exist locally)">
                              <TextInput
                                value={data.aap.hub_ee_source_image}
                                onChange={(_, v) => set('aap.hub_ee_source_image', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={4}>
                            <FormGroup label="Hub EE name">
                              <TextInput
                                value={data.aap.hub_ee_name}
                                onChange={(_, v) => setAapHubEeNameField('hub_ee_name', v)}
                              />
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
                                  Hub registry host (optional)
                                  <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                    {' — Defaults to the AAP hostname when empty'}
                                  </span>
                                </span>
                              )}
                            >
                              <TextInput
                                value={data.aap.hub_ee_registry}
                                onChange={(_, v) => set('aap.hub_ee_registry', v)}
                                placeholder="hub.example.com"
                              />
                            </FormGroup>
                          </GridItem>
                          <GridItem span={12}>
                            <Checkbox
                              id="aap-hub-ee-create-ee"
                              label="Create Controller execution environment after push"
                              isChecked={data.aap.hub_ee_create_execution_environment !== false}
                              onChange={(_, v) => set('aap.hub_ee_create_execution_environment', v)}
                            />
                          </GridItem>
                          {data.aap.hub_ee_create_execution_environment !== false && (
                            <GridItem span={6}>
                              <FormGroup
                                label={(
                                  <span>
                                    Controller EE name
                                    <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                      {' — Defaults to Hub EE name when empty'}
                                    </span>
                                  </span>
                                )}
                              >
                                <TextInput
                                  value={data.aap.hub_ee_execution_environment_name}
                                  onChange={(_, v) => setAapHubEeNameField('hub_ee_execution_environment_name', v)}
                                />
                              </FormGroup>
                            </GridItem>
                          )}
                          <GridItem span={12}>
                            <FormGroup label="Hub EE description (optional)">
                              <TextInput
                                value={data.aap.hub_ee_description}
                                onChange={(_, v) => set('aap.hub_ee_description', v)}
                              />
                            </FormGroup>
                          </GridItem>
                        </>
                      )}
                    </Grid>
                  )}
                  {activeAapConfigTab === 'galaxy' && (
                    <Grid hasGutter>
                      <GridItem span={12}>
                        <FormGroup label="Galaxy / Hub credentials">
                          <p style={{ color: mutedTextColor, marginTop: 0, marginBottom: '8px' }}>
                            Optional for disconnected sites. Creates Galaxy API Token credentials, an optional Container Registry credential, attaches Galaxy creds to the organization, and can create a Controller user account.
                          </p>
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
                        </FormGroup>
                      </GridItem>
                      {data.aap.galaxy_setup_enabled && (
                        <>
                          <GridItem span={12}>
                            <FormGroup label="Controller user account (optional)">
                              <Checkbox
                                id="aap-galaxy-user-enabled"
                                label="Create a Controller user with password in this organization"
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
                            <FormGroup
                              label={(
                                <span>
                                  Shared Hub API token
                                  <span style={{ color: mutedTextColor, fontWeight: 400 }}>
                                    {' — used for Hub repo credentials when their token is empty'}
                                  </span>
                                </span>
                              )}
                            >
                              <TextInput
                                type="password"
                                value={data.aap.galaxy_hub_token}
                                onChange={(_, v) => set('aap.galaxy_hub_token', v)}
                              />
                            </FormGroup>
                          </GridItem>
                          {(data.aap.galaxy_credentials || []).map((credential, index) => (
                            <GridItem span={12} key={credential.id || `galaxy-cred-${index}`}>
                              <Card style={{ boxShadow: 'none', border: '1px solid #d2d2d2' }}>
                                <CardBody>
                                  <Grid hasGutter>
                                    <GridItem span={12}>
                                      <Checkbox
                                        id={`aap-galaxy-cred-enabled-${index}`}
                                        label={`Create ${credential.name || 'credential'}`}
                                        isChecked={credential.enabled !== false}
                                        onChange={(_, v) => set(`aap.galaxy_credentials.${index}.enabled`, v)}
                                      />
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
                                          <FormGroup label="API Token (optional override)">
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
                                            label="Attach to organization Galaxy credentials"
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
                </>
              )}
            </CardBody>
          </Card>

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
                      <DropdownItem onClick={() => runEncryptAndPush()}>Push Preflight JSON to Git</DropdownItem>
                      <DropdownItem onClick={resetOutput}>Reset</DropdownItem>
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
                      <Tab eventKey="terminal" title="Terminal Help" />
                    </Tabs>
                  </div>
                )}
              </div>

              <div
                ref={outputRef}
                style={{
                  height: '650px',
                  overflowY: 'auto',
                  backgroundColor: '#151515',
                  color: '#f0f0f0',
                  padding: '14px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  borderRadius: '0 0 6px 6px',
                  border: '1px solid #3c3c3c',
                  borderTop: 'none',
                  fontSize: `${consoleFontSize}px`,
                  lineHeight: '1.45'
                }}
              >
                {renderConsoleContent()}
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
