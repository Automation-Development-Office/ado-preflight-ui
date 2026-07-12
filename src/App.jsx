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
  Tooltip
} from '@patternfly/react-core';

import adoLogo from '../ado-logo-redhat.png';

const openshiftApps = [
  'aap','acs','acm','cert_manager','console','devspaces',
  'dirsrv','eck','gitops','gitlab','grafana','kafka',
  'oadp','openshift','pega','quay','rhbk'
];

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

const defaults = {
  scm_tool: 'gitlab',
  environment: 'prod',
  domain: 'prod.rhlab',

  ansible: {
    verbosity: 0
  },

  git: {
    auto_push: true,
    token: ''
  },

  components: ['rhel'],

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
    cert_manager: { hostname: '', storage: '' },
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
    openshift_virt: { hostname: '', storage: '' }
  },

  component_options: {
    grafana: [...componentOptionDefaults.grafana],
    rhbk: [...componentOptionDefaults.rhbk],
    satellite: [...componentOptionDefaults.satellite],
    idm: [...componentOptionDefaults.idm],
    rhel: [...componentOptionDefaults.rhel],
    compliance: ['pci_dss'],
    stig: ['rhel_9_stig']
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
    version: '26',
    organization: 'ADO',
    inventory: 'ADO-inventory',
    project: 'ADO-project',
    git_url: 'https://gitlab-git.apps.ocp.prod.rhlab/redhat-lab/bootstrap-sample.git',
    git_branch: 'main',
    execution_environment: 'ee-supported-rhel9',
    vault_credential_name: 'ADO-vault',
    skip_tls_verify: false,
    hub_publish_ado_collection: true,
    hub_mark_ado_validated: true,
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
    token: ''
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
  const [activeAapCredentialTab, setActiveAapCredentialTab] = useState('');
  const [activeRhbkDetailTab, setActiveRhbkDetailTab] = useState('client');
  const [importStatus, setImportStatus] = useState('');
  const [runFinished, setRunFinished] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const outputRef = useRef(null);
  const importFileRef = useRef(null);

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
  }, [preview, events, activeTab]);

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

  const setAapHubValidated = value => {
    setData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.aap) copy.aap = {};
      copy.aap.hub_publish_ado_collection = value;
      copy.aap.hub_mark_ado_validated = value;
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

      return copy;
    });
  };

  const groupComponents = ['openshift', 'rhel', 'patching', 'provision'];

  const selectedComponentAppsFrom = source => {
    if (Array.isArray(source.selected_component_apps) && source.selected_component_apps.length > 0) {
      return [...new Set(source.selected_component_apps)];
    }

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

    (source.components || []).forEach(component => {
      if (expandableGroups.includes(component)) {
        const selected = source.component_apps?.[component] || [];
        out.push(...(selected.length > 0 ? selected : [component]));
      } else {
        out.push(component);
      }
    });

    return [...new Set(out.filter(Boolean))];
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

    const merged = deepMerge(defaults, normalizedInput);

    if (!Array.isArray(merged.components) || merged.components.length === 0) {
      merged.components = ['rhel'];
    }

    merged.components = [...new Set(merged.components.filter(Boolean))];
    merged.component = merged.components.includes('all') ? 'all' : merged.components[0];

    if (!merged.component_apps) merged.component_apps = {};
    groupComponents.forEach(group => {
      if (!Array.isArray(merged.component_apps[group])) {
        merged.component_apps[group] = [];
      }
    });

    if (!merged.component_config) merged.component_config = {};
    if (merged.component_config.idm) {
      delete merged.component_config.idm.storage;
    }
    if (!merged.component_options) merged.component_options = {};
    if (!merged.aap) merged.aap = {};
    if (!Array.isArray(merged.aap.additional_credentials)) merged.aap.additional_credentials = [];
    merged.aap.additional_credentials = merged.aap.additional_credentials.map((credential, index) => ({
      ...credential,
      id: credential.id || `imported-credential-${index + 1}`
    }));
    merged.aap.hub_mark_ado_validated = merged.aap.hub_publish_ado_collection === true;

    if (!merged.aap.machine_credential) merged.aap.machine_credential = { ...defaults.aap.machine_credential };
    if (!merged.git) merged.git = { ...defaults.git };
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
    } catch (err) {
      setImportStatus(`Import failed: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const buildPreflightPayload = () => {
    const payload = JSON.parse(JSON.stringify(data));
    const selectedApps = selectedComponentAppsFrom(payload);
    const allowedConfig = new Set(selectedApps);
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
      if (selectedApps.includes(component)) {
        selectedOptions[component] = options;
      }
    });

    payload.selected_component_apps = selectedApps;
    payload.component_config = selectedConfig;
    payload.component_options = selectedOptions;
    if (payload.aap) {
      payload.aap.hub_mark_ado_validated = payload.aap.hub_publish_ado_collection === true;
      payload.aap.additional_credentials = (payload.aap.additional_credentials || []).map(credential => {
        const { id, ...credentialPayload } = credential;
        return credentialPayload;
      });
    }

    if (!selectedApps.includes('openshift')) {
      delete payload.openshift;
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
      if (!copy.component_config[component]) copy.component_config[component] = { hostname: '' };
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
    const content = activeTab === 'events' ? events : preview;
    const suffix = activeTab === 'events' ? 'events' : 'run';

    downloadFile(`ado-preflight-${data.environment || 'env'}-${suffix}.log`, content);
  };

  const resetOutput = () => {
    setData(defaults);
    setPreview('Click "Run Bootstrap" to generate output.');
    setEvents('');
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
  };

  const previewJson = () => {
    setPreview(JSON.stringify(buildPreflightPayload(), null, 2));
    setActiveTab('logs');
    setActionsOpen(false);
  };

  const toggleRawOutput = () => {
    setShowRawOutput(!showRawOutput);
    setActiveTab('logs');
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
    setShowRawOutput(false);
    setActiveTab('logs');
    setPreview('Starting bootstrap inside container...\n');
    setEvents('Starting bootstrap request...\n');

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
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPreflightPayload())
      });

      const result = await response.json();

      const logs = await fetch('/api/logs');
      const text = await logs.text();

      const eventsResp = await fetch('/api/events');
      const eventsText = await eventsResp.text();

      setPreview(`${text}\n\nRESULT:\n${JSON.stringify(result, null, 2)}`);
      setEvents(eventsText || 'No events were returned.');
    } catch (err) {
      setPreview(`ERROR:\n${err.message}`);
    } finally {
      keepPolling = false;
      clearInterval(poller);
      setRunFinished(true);
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

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span>{label}</span>
        <Tooltip content={help}>
          <button
            type="button"
            aria-label={`${label} help`}
            style={{
              border: 'none',
              background: 'transparent',
              color: isDark ? '#73bcf7' : '#0066cc',
              cursor: 'help',
              fontWeight: 700,
              padding: 0
            }}
          >
            ?
          </button>
        </Tooltip>
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

  const renderDefaultComponentConfig = component => (
    <Grid hasGutter>
      {renderTextField('Hostname', `component_config.${component}.hostname`)}
      {renderTextField('Storage', `component_config.${component}.storage`)}
    </Grid>
  );

  const renderGrafanaConfig = () => (
    <>
      {renderComponentOptions('grafana', 'Grafana Options', 'Select which Grafana resources to configure.')}
      <Grid hasGutter>
        {renderTextField('Hostname / URL', 'component_config.grafana.hostname')}
        {renderTextField('Storage Class', 'component_config.grafana.storage')}
        {renderTextField('Folder Name', 'component_config.grafana.folder_name')}
        {renderTextField('Folder or Git Repo for Dashboards', 'component_config.grafana.dashboards_source')}
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
            {renderTextField('Client ID', 'component_config.rhbk.client')}
            {renderTextField('Client Name', 'component_config.rhbk.client_name')}
            {renderTextField('Redirect URIs', 'component_config.rhbk.client_redirect_uris')}
            {renderTextField('Web Origins', 'component_config.rhbk.client_web_origins')}
          </Grid>
        );
      case 'idp':
        return (
          <Grid hasGutter>
            {renderTextField('IDP Name', 'component_config.rhbk.idp_name')}
            {renderTextField('IDP Alias', 'component_config.rhbk.idp_alias')}
            {renderTextField('IDP Provider', 'component_config.rhbk.idp_provider')}
            {renderTextField('Client ID', 'component_config.rhbk.idp_client_id')}
            {renderTextField('Client Secret', 'component_config.rhbk.idp_client_secret', 'password')}
            {renderTextField('Discovery URL', 'component_config.rhbk.idp_discovery_url')}
          </Grid>
        );
      case 'group_mapper':
        return (
          <Grid hasGutter>
            {renderTextField('Mapper Name', 'component_config.rhbk.group_mapper_name')}
            {renderTextField('Claim Name', 'component_config.rhbk.group_mapper_claim')}
            {renderTextField('Group Path', 'component_config.rhbk.group_mapper_group_path')}
            {renderTextField('Sync Mode', 'component_config.rhbk.group_mapper_sync_mode')}
          </Grid>
        );
      case 'client_scopes':
        return (
          <Grid hasGutter>
            {renderTextField('Client Scope Name', 'component_config.rhbk.client_scope_name')}
            {renderTextField('Protocol', 'component_config.rhbk.client_scope_protocol')}
            {renderTextField('Description', 'component_config.rhbk.client_scope_description')}
          </Grid>
        );
      case 'federation':
        return (
          <Grid hasGutter>
            {renderTextField('Federation Name', 'component_config.rhbk.federation_name')}
            {renderTextField('Provider', 'component_config.rhbk.federation_provider')}
            {renderTextField('LDAP URL', 'component_config.rhbk.federation_ldap_url')}
            {renderTextField('Bind DN', 'component_config.rhbk.federation_bind_dn')}
            {renderTextField('Bind Password', 'component_config.rhbk.federation_bind_password', 'password')}
            {renderTextField('Users DN', 'component_config.rhbk.federation_users_dn')}
          </Grid>
        );
      case 'client_mappers':
        return (
          <Grid hasGutter>
            {renderTextField('Mapper Name', 'component_config.rhbk.client_mapper_name')}
            {renderTextField('Claim Name', 'component_config.rhbk.client_mapper_claim')}
            {renderTextField('User Attribute', 'component_config.rhbk.client_mapper_user_attribute')}
            {renderTextField('Token Claim Type', 'component_config.rhbk.client_mapper_claim_type')}
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
        {renderTextField('Hostname / URL', 'component_config.rhbk.hostname')}
        {renderTextField('Storage Class', 'component_config.rhbk.storage')}
        {renderTextField('Realm', 'component_config.rhbk.realm')}
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
    serviceAccountUsername: 'Satellite service account username for API and inventory operations. Example: svc_aap_satellite.',
    serviceAccountPassword: 'Password for the Satellite service account. Stored in generated vault files.',
    adminPassword: 'Optional Satellite admin password for bootstrap tasks that still require admin access. Stored in generated vault files.',
    dynamicInventory: 'Creates an AAP inventory source that reads hosts from Satellite 6.',
    credentialName: 'AAP credential name for the Satellite service account. Example: ADO Satellite Service Account.',
    inventorySourceName: 'AAP inventory source name. Example: ADO Satellite Dynamic Inventory.',
    inventoryHostFilter: 'Optional Satellite search filter. Example: hostgroup = RHEL9 or organization = Lab.',
    updateCacheTimeout: 'Seconds to reuse cached inventory data before refreshing. Example: 0 disables cache reuse.',
    inventoryVerbosity: 'Inventory source sync verbosity from 0 to 5.',
    overwriteHosts: 'Allow the inventory sync to update existing hosts in the AAP inventory.',
    overwriteVars: 'Allow the inventory sync to update variables on existing AAP hosts.',
    updateOnLaunch: 'Run a Satellite inventory sync automatically when a job using this inventory launches.',
    skipTls: 'Disable Satellite certificate validation for self-signed or lab certificates.'
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
        {renderTextField('Organization', 'component_config.satellite.organization', 'text', satelliteHelp.organization)}
        {renderTextField('Activation Key', 'component_config.satellite.activation_key', 'text', satelliteHelp.activationKey)}
        {renderTextField('Service Account Username', 'component_config.satellite.service_account_username', 'text', satelliteHelp.serviceAccountUsername)}
        {renderTextField('Service Account Password', 'component_config.satellite.service_account_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.serviceAccountPassword)}
        {renderTextField('Admin Password', 'component_config.satellite.admin_password', showSatelliteSecrets ? 'text' : 'password', satelliteHelp.adminPassword)}
        <GridItem span={12}>
          <FormGroup label={labelWithHelp('Satellite Dynamic Inventory', satelliteHelp.dynamicInventory)}>
            <Checkbox
              id="satellite-dynamic-inventory"
              label="Create AAP Satellite inventory source"
              isChecked={data.component_config.satellite.dynamic_inventory_enabled}
              onChange={(_, v) => set('component_config.satellite.dynamic_inventory_enabled', v)}
            />
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

      {renderMachineCredentialConfig()}
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
          {renderTextField('Hostname', 'component_config.idm.hostname')}
          {renderTextField('Domain', 'component_config.idm.domain')}
          {renderTextField('Realm', 'component_config.idm.realm')}
          {showReplica && renderTextField('IPA Replica Hostname', 'component_config.idm.replica_hostname')}
          {showReplica && (
            <>
              <GridItem span={6}>
                <FormGroup label="Replica DNS">
                  <Checkbox
                    id="idm-replica-install-dns"
                    label="Install DNS on replica"
                    isChecked={data.component_config.idm.replica_install_dns}
                    onChange={(_, v) => set('component_config.idm.replica_install_dns', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Replica Certificate Services">
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
              <FormGroup label="DNS Forwarders">
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
              {renderTextField('Custom Certificate File', 'component_config.idm.custom_cert_file')}
              {renderTextField('Custom Certificate Key File', 'component_config.idm.custom_cert_key_file')}
              {renderTextField('Custom Certificate Chain File', 'component_config.idm.custom_cert_chain_file')}
            </>
          )}
          {renderTextField('Admin Password', 'component_config.idm.admin_password', showIdmSecrets ? 'text' : 'password')}
          {renderTextField('Directory Manager Password', 'component_config.idm.directory_manager_password', showIdmSecrets ? 'text' : 'password')}
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

      {renderMachineCredentialConfig()}
    </>
  );

  const renderProvisionConfig = () => (
    <>
      {renderGroupComponentOptions(
        'provision',
        'Provisioning Options',
        'Select which provisioning targets to include.'
      )}
    </>
  );

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
          <FormGroup label="Compliance Profile">
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
          <FormGroup label="STIG Profile">
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

        {renderTextField('Hostname', 'component_config.rhel.hostname')}
      </Grid>

      {renderMachineCredentialConfig()}
    </>
  );

  const renderComplianceConfig = () => (
    <>
      {renderComponentOptions('compliance', 'Compliance Options', 'Select compliance baselines to include.')}
      <Grid hasGutter>
        {renderTextField('Profile', 'component_config.compliance.profile')}
      </Grid>
    </>
  );

  const renderStigConfig = () => (
    <>
      {renderComponentOptions('stig', 'STIG Options', 'Select STIG baselines to include.')}
      <Grid hasGutter>
        {renderTextField('Profile', 'component_config.stig.profile')}
      </Grid>
    </>
  );

  const renderOpenShiftIntegration = () => (
    <>
      <p style={{ color: mutedTextColor }}>This section is opened by clicking <strong>openshift</strong>.</p>
      <Grid hasGutter>
        <GridItem span={6}>
          <FormGroup label="OpenShift API Host">
            <TextInput
              value={data.openshift.api_host}
              onChange={(_, v) => set('openshift.api_host', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={6}>
          <FormGroup label="OpenShift Apps Domain">
            <TextInput
              value={data.openshift.apps_domain}
              onChange={(_, v) => set('openshift.apps_domain', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={12}>
          <FormGroup label="OpenShift TLS Certificate Verification">
            <Checkbox
              id="openshift-skip-tls-verify"
              label="Skip TLS certificate verification for self-signed certificates"
              isChecked={data.openshift.skip_tls_verify}
              onChange={(_, v) => set('openshift.skip_tls_verify', v)}
            />
          </FormGroup>
        </GridItem>

        <GridItem span={12}>
          <FormGroup label="OpenShift API Token">
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
      </Grid>
    </>
  );

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

    switch (panel) {
      case 'all':
        return renderAllConfig();
      case 'openshift':
        return renderOpenShiftGroupConfig();
      case 'rhel':
        return renderRhelConfig();
      case 'patching':
        return renderPatchingConfig();
      case 'provision':
        return renderProvisionConfig();
      case 'jira':
        return renderJiraConfig();
      case 'grafana':
        return renderGrafanaConfig();
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

  const renderInlineMarkdown = text => {
    const parts = String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
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
                        onChange={() => set('scm_tool', v)}
                      />
                    )}
                  </FormGroup>

                  <br />

                  <Checkbox
                    label="Automatically commit and push generated content to Git"
                    isChecked={data.git.auto_push}
                    onChange={(_, v) => set('git.auto_push', v)}
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
                  <Grid hasGutter>
                    <GridItem span={6}><FormGroup label="AAP Hostname URL"><TextInput value={data.aap.hostname} onChange={(_, v) => set('aap.hostname', v)} /></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="AAP Version"><select value={data.aap.version} onChange={e => set('aap.version', e.target.value)} style={{ width: '100%', padding: '8px' }}><option value="24">2.4</option><option value="25">2.5</option><option value="26">2.6</option></select></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="Organization Name"><TextInput value={data.aap.organization} onChange={(_, v) => setAapOrganization(v)} /></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="Inventory Name"><TextInput value={data.aap.inventory} onChange={(_, v) => set('aap.inventory', v)} /></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="Project Name"><TextInput value={data.aap.project} onChange={(_, v) => set('aap.project', v)} /></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="Execution Environment"><TextInput value={data.aap.execution_environment} onChange={(_, v) => set('aap.execution_environment', v)} /></FormGroup></GridItem>
                    <GridItem span={6}><FormGroup label="Vault Credential Name"><TextInput value={data.aap.vault_credential_name} onChange={(_, v) => set('aap.vault_credential_name', v)} /></FormGroup></GridItem>
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
                    <GridItem span={6}><FormGroup label="Vault Password"><TextInput type="password" value={data.aap.vault_password} onChange={(_, v) => set('aap.vault_password', v)} /></FormGroup></GridItem>
                    <GridItem span={6}>
                      <FormGroup label="TLS Certificate Verification">
                        <Checkbox
                          label="Skip TLS certificate verification for self-signed certificates"
                          isChecked={data.aap.skip_tls_verify}
                          onChange={(_, v) => set('aap.skip_tls_verify', v)}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={6}>
                      <FormGroup label="AAP Hub">
                        <Checkbox
                          label="Add infra.ado collection to validated content in AAP Hub"
                          isChecked={data.aap.hub_publish_ado_collection && data.aap.hub_mark_ado_validated}
                          onChange={(_, v) => setAapHubValidated(v)}
                        />
                      </FormGroup>
                    </GridItem>
                  </Grid>

                  {renderAdditionalAapCredentials()}
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
                      <DropdownItem onClick={resetOutput}>Reset</DropdownItem>
                    </DropdownList>
                  </Dropdown>

                  <Tooltip content={showRawOutput ? 'Show highlighted output' : 'Show raw output'}>
                    <Button variant="plain" aria-label="Raw or highlighted output" onClick={toggleRawOutput} style={{ fontSize: '18px' }}>
                      ↗
                    </Button>
                  </Tooltip>

                  <Tooltip content={activeTab === 'events' ? 'Download events log' : 'Download Ansible run log'}>
                    <Button variant="plain" aria-label="Download log" onClick={downloadLog} style={{ fontSize: '18px' }}>
                      ⇩
                    </Button>
                  </Tooltip>
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <Tabs activeKey={activeTab} onSelect={(_, key) => setActiveTab(key)}>
                  <Tab eventKey="logs" title="Logs" />
                  <Tab eventKey="events" title="Events" />
                </Tabs>
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
                  fontSize: '13px',
                  lineHeight: '1.45'
                }}
              >
                {activeTab === 'logs' ? renderOutput() : renderEvents()}
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
