const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

process.env.NODE_OPTIONS = '--max-old-space-size=256';

const app = express();
const port = 8080;

const workRoot = '/workspace';
const collectionDir = '/opt/ado-collections';
const uiDir = path.join(__dirname, 'dist');
const packageJson = require('./package.json');

const openshiftApps = [
  'aap', 'acs', 'acm', 'cert_manager', 'console', 'devspaces',
  'dirsrv', 'eck', 'gitops', 'gitlab', 'grafana', 'kafka',
  'oadp', 'openshift', 'pega', 'quay', 'rhbk'
];
const rhelApps = ['rhel', 'satellite', 'idm', 'aap', 'dirsrv', 'eck', 'gitlab', 'grafana', 'kafka', 'rhbk', 'compliance', 'stig'];
const patchingApps = ['patching', 'satellite', 'idm'];
const provisionApps = ['aws_instance', 'openshift_virt'];

app.use(express.json({ limit: '10mb' }));
app.use(express.static(uiDir));

let latestLog = '';
let latestEvents = '';
let latestDebug = {
  repoDir: '',
  preflightPath: '',
  extraVarsPath: '',
  normalizedPayload: null,
  selectedComponents: '',
  selectedComponentApps: [],
  result: null
};

function capText(value, maxLength) {
  if (value.length > maxLength) {
    return value.slice(-maxLength);
  }
  return value;
}

function event(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  latestEvents += line;
  latestEvents = capText(latestEvents, 200000);
  process.stdout.write(line);
}

function append(msg) {
  latestLog += msg;
  latestLog = capText(latestLog, 500000);
  process.stdout.write(msg);
}

function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item));
  }

  if (value && typeof value === 'object') {
    const out = {};

    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('ssh_key') ||
        lower.includes('private_key') ||
        lower.includes('vault')
      ) {
        out[key] = child ? '[redacted]' : child;
      } else {
        out[key] = redactSecrets(child);
      }
    }

    return out;
  }

  return value;
}

function readTextFile(filePath, fallback = '') {
  try {
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (err) {
    return `Unable to read ${filePath}: ${err.message}\n`;
  }

  return fallback;
}

function walkFiles(root, options = {}) {
  const maxEntries = options.maxEntries || 500;
  const maxDepth = options.maxDepth || 5;
  const ignored = new Set(options.ignored || ['.git', 'node_modules', 'collections']);
  const rows = [];

  function walk(current, depth) {
    if (rows.length >= maxEntries || depth > maxDepth || !fs.existsSync(current)) return;

    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
        .filter(entry => !ignored.has(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      rows.push(`${'  '.repeat(depth)}[unreadable] ${current}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      if (rows.length >= maxEntries) break;
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath) || entry.name;
      rows.push(`${entry.isDirectory() ? 'd' : '-'} ${relativePath}`);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(root, 0);

  if (rows.length >= maxEntries) {
    rows.push(`... truncated at ${maxEntries} entries`);
  }

  return rows;
}

function listGeneratedConfigFiles(repoDir) {
  const roots = [
    path.join(repoDir, 'configs'),
    path.join(repoDir, 'playbooks'),
    path.join(repoDir, 'group_vars')
  ];
  const files = [];

  for (const root of roots) {
    for (const row of walkFiles(root, { maxEntries: 300, maxDepth: 8, ignored: ['.git'] })) {
      if (row.startsWith('- ')) {
        const relativeToRoot = row.slice(2);
        files.push(path.join(root, relativeToRoot));
      }
    }
  }

  return files.filter(filePath => /\.(yml|yaml|json|cfg|ini)$/.test(filePath));
}

function buildDebugPayload(kind) {
  const repoDir = latestDebug.repoDir || path.join(workRoot, 'bootstrap-sample');

  if (kind === 'summary') {
    return JSON.stringify({
      repoDir,
      preflightPath: latestDebug.preflightPath,
      extraVarsPath: latestDebug.extraVarsPath,
      selectedComponents: latestDebug.selectedComponents,
      selectedComponentApps: latestDebug.selectedComponentApps,
      result: latestDebug.result,
      logBytes: latestLog.length,
      eventBytes: latestEvents.length
    }, null, 2);
  }

  if (kind === 'preflight') {
    const text = readTextFile(latestDebug.preflightPath);
    if (text) return JSON.stringify(redactSecrets(JSON.parse(text)), null, 2);
    return JSON.stringify(redactSecrets(latestDebug.normalizedPayload || {}), null, 2);
  }

  if (kind === 'extra-vars') {
    const text = readTextFile(latestDebug.extraVarsPath, 'ado-extra-vars.json has not been written yet.\n');
    try {
      return JSON.stringify(redactSecrets(JSON.parse(text)), null, 2);
    } catch (err) {
      return text;
    }
  }

  if (kind === 'tree') {
    if (!fs.existsSync(repoDir)) {
      return `Generated repository does not exist yet: ${repoDir}\n`;
    }

    return [`Repository: ${repoDir}`, '', ...walkFiles(repoDir, { maxEntries: 700, maxDepth: 8 })].join('\n');
  }

  if (kind === 'configs') {
    if (!fs.existsSync(repoDir)) {
      return `Generated repository does not exist yet: ${repoDir}\n`;
    }

    const files = listGeneratedConfigFiles(repoDir).slice(0, 80);
    if (files.length === 0) {
      return `No generated config files found under ${repoDir}/configs, playbooks, or group_vars yet.\n`;
    }

    return files.map(filePath => {
      const rel = path.relative(repoDir, filePath);
      const body = readTextFile(filePath).slice(0, 12000);
      return `===== ${rel} =====\n${body}`;
    }).join('\n\n');
  }

  if (kind === 'runtime') {
    return JSON.stringify({
      uiVersion: process.env.ADO_PREFLIGHT_UI_VERSION || packageJson.version || 'unknown',
      image: process.env.ADO_PREFLIGHT_UI_IMAGE || process.env.IMAGE_NAME || 'ado-preflight-ui',
      imageTag: process.env.ADO_PREFLIGHT_UI_IMAGE_TAG || process.env.IMAGE_TAG || packageJson.version || 'latest',
      podName: process.env.HOSTNAME || 'unknown',
      nodeVersion: process.version,
      cwd: process.cwd(),
      appRoot: __dirname,
      workRoot,
      collectionDir,
      ansibleCollectionsPath: '/workspace/collections:/usr/share/ansible/collections',
      environment: {
        ADO_COLLECTION_ROOT: process.env.ADO_COLLECTION_ROOT || '',
        ADO_COLLECTION_ARCHIVE: process.env.ADO_COLLECTION_ARCHIVE || '',
        ADO_PREFLIGHT_UI_README: process.env.ADO_PREFLIGHT_UI_README || '',
        ADO_COLLECTION_README: process.env.ADO_COLLECTION_README || ''
      }
    }, null, 2);
  }

  if (kind === 'terminal') {
    const podName = process.env.HOSTNAME || '<pod-or-container-name>';
    return [
      'Embedded shell access is intentionally not exposed in the browser.',
      '',
      'Use one of these from your workstation or cluster shell:',
      '',
      'Podman/local container:',
      `  podman exec -it ${podName} /bin/bash`,
      '  podman logs -f <container-name>',
      '',
      'OpenShift/Kubernetes pod:',
      `  oc rsh pod/${podName}`,
      `  oc exec -it pod/${podName} -- /bin/bash`,
      `  oc logs -f pod/${podName}`,
      '',
      'Useful paths inside the container:',
      `  ${repoDir}`,
      '  /workspace/collections',
      '  /opt/ado-collections',
      '',
      'Useful files after a run:',
      `  ${latestDebug.preflightPath || path.join(repoDir, 'ado-preflight-<env>.json')}`,
      `  ${latestDebug.extraVarsPath || path.join(repoDir, 'ado-extra-vars.json')}`,
      `  ${path.join(repoDir, '.vault_pass')}`
    ].join('\n');
  }

  return `Unknown debug tab: ${kind}\n`;
}

function normalizeVerbosity(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  if (parsed < 0) {
    return 0;
  }

  if (parsed > 5) {
    return 5;
  }

  return parsed;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeOrgScopedName(value, org, fallbackSuffix) {
  const prefix = String(org || 'ADO').trim() || 'ADO';
  const fallback = `${prefix}-${fallbackSuffix}`;
  const raw = String(value || fallback).trim() || fallback;
  const cleaned = raw.replace(/\s+/g, '-');

  return cleaned.startsWith(`${prefix}-`) ? cleaned : `${prefix}-${cleaned}`;
}

function verbosityFlag(level) {
  const normalized = normalizeVerbosity(level);

  if (normalized <= 0) {
    return '';
  }

  return `-${'v'.repeat(normalized)}`;
}

function buildAnsibleEnv(skipTlsVerify = false) {
  const ansibleEnv = {
    ...process.env,
    ANSIBLE_FORCE_COLOR: 'false',
    ANSIBLE_HOST_KEY_CHECKING: 'false',
    ANSIBLE_COLLECTIONS_PATH: '/workspace/collections:/usr/share/ansible/collections',
    ANSIBLE_COLLECTIONS_PATHS: '/workspace/collections:/usr/share/ansible/collections',
    CONTROLLER_VERIFY_SSL: 'false',
    TOWER_VERIFY_SSL: 'false',
    REQUESTS_CA_BUNDLE: '',
    CURL_CA_BUNDLE: '',
    PYTHONHTTPSVERIFY: '0',
    GIT_SSL_NO_VERIFY: 'true',
    GIT_TERMINAL_PROMPT: '0'
  };

  if (skipTlsVerify) {
    ansibleEnv.ANSIBLE_TLS_VERIFY = 'false';
  }

  return ansibleEnv;
}

function gitCredentialLine(repoUrl, token) {
  const u = new URL(repoUrl);
  const username = encodeURIComponent('oauth2');
  const password = encodeURIComponent(token);
  return `${u.protocol}//${username}:${password}@${u.host}\n`;
}

function selectedComponentAppsFrom(data) {
  if (Array.isArray(data.components) && data.components.includes('all')) {
    return [...new Set([...openshiftApps, ...rhelApps, ...patchingApps, ...provisionApps, 'jira'])];
  }

  const out = [];
  const groups = ['openshift', 'rhel', 'patching', 'provision'];
  const components = Array.isArray(data.components) ? data.components : [];

  for (const component of components) {
    if (groups.includes(component)) {
      const selected = data.component_apps?.[component] || [];
      out.push(...(selected.length > 0 ? selected : [component]));
    } else {
      out.push(component);
    }
  }

  const derived = [...new Set(out.filter(Boolean))];

  if (derived.length > 0) {
    return derived;
  }

  if (Array.isArray(data.selected_component_apps) && data.selected_component_apps.length > 0) {
    return [...new Set(data.selected_component_apps)];
  }

  return [];
}

function pruneInactiveComponentApps(data) {
  const groups = ['openshift', 'rhel', 'patching', 'provision'];
  const components = Array.isArray(data.components) ? data.components : [];
  const allSelected = components.includes('all');

  if (!data.component_apps) data.component_apps = {};

  for (const group of groups) {
    if (!Array.isArray(data.component_apps[group])) {
      data.component_apps[group] = [];
    }

    if (!allSelected && !components.includes(group)) {
      data.component_apps[group] = [];
    }
  }

  return data;
}

function defaultComponentConfig(component) {
  const config = ['rhel', 'satellite', 'idm', 'compliance', 'stig'].includes(component)
    ? { hostname: '' }
    : { hostname: '', storage: '' };

  if (component === 'satellite') {
    Object.assign(config, {
      organization: '',
      activation_key: '',
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
    });
  }

  if (component === 'idm') {
    Object.assign(config, {
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
    });
  }

  return config;
}

function hydrateSelectedComponentConfigs(data) {
  const selectedComponentApps = selectedComponentAppsFrom(data);
  const allowedConfig = new Set(selectedComponentApps);

  if (!data.component_config) data.component_config = {};

  for (const component of selectedComponentApps) {
    data.component_config[component] = {
      ...defaultComponentConfig(component),
      ...(data.component_config[component] || {})
    };

    if (component === 'satellite' && data.component_config[component].dynamic_inventory_enabled === undefined) {
      data.component_config[component].dynamic_inventory_enabled = true;
    }

    if (component === 'idm') {
      delete data.component_config[component].storage;
    }
  }

  data.component_config = Object.fromEntries(
    Object.entries(data.component_config).filter(([component]) => allowedConfig.has(component))
  );

  return data;
}


function normalizePreflightPayload(input) {
  const data = JSON.parse(JSON.stringify(input || {}));

  if (!Array.isArray(data.components) || data.components.length === 0) {
    if (Array.isArray(data.platform) && data.platform.length > 0) {
      data.components = data.platform.includes('all') ? ['all'] : data.platform;
    } else if (data.component) {
      data.components = [data.component];
    } else {
      data.components = ['all'];
    }
  }

  // Do not set component=all.
  // infra.ado.bootstrap_generate_env_vars treats preflight.component as an exact component list
  // and will generate vars_all.yml instead of expanding platform=all.
  if (data.components.includes('all')) {
    delete data.component;
    data.platform = ['all'];
  } else {
    data.component = data.components[0];
    data.platform = data.components;
  }
  pruneInactiveComponentApps(data);

  if (!data.git) data.git = {};
  if (data.git.auto_push === undefined) data.git.auto_push = true;
  if (data.git.token === undefined) data.git.token = '';

  if (!data.vault) data.vault = {};
  if (data.vault.encrypt === undefined) data.vault.encrypt = true;

  if (!data.aap) data.aap = {};
  if (data.aap.enabled === undefined) data.aap.enabled = true;
  if (data.aap.skip_tls_verify === undefined) data.aap.skip_tls_verify = false;
  if (!data.aap.organization) data.aap.organization = 'ADO';
  data.aap.inventory = normalizeOrgScopedName(data.aap.inventory, data.aap.organization, 'inventory');
  data.aap.project = normalizeOrgScopedName(data.aap.project, data.aap.organization, 'project');
  data.aap.vault_credential_name = normalizeOrgScopedName(data.aap.vault_credential_name, data.aap.organization, 'vault');
  if (data.aap.hub_publish_ado_collection === undefined) data.aap.hub_publish_ado_collection = true;
  if (data.aap.hub_mark_ado_validated === undefined) data.aap.hub_mark_ado_validated = true;
  data.aap.hub_mark_ado_validated = data.aap.hub_publish_ado_collection === true;
  if (!Array.isArray(data.aap.additional_credentials)) data.aap.additional_credentials = [];
  data.aap.additional_credentials = data.aap.additional_credentials.map(({ id, ...credential }) => credential);
  if (!data.aap.machine_credential) data.aap.machine_credential = {};
  data.aap.machine_credential.name = normalizeOrgScopedName(data.aap.machine_credential.name, data.aap.organization, 'machine');
  if (!data.aap.machine_credential.username) data.aap.machine_credential.username = 'cloud-user';
  if (data.aap.machine_credential.ssh_key_data === undefined) data.aap.machine_credential.ssh_key_data = '';
  if (data.aap.machine_credential.ssh_key_unlock === undefined) data.aap.machine_credential.ssh_key_unlock = '';
  if (data.aap.machine_credential.become_method === undefined) data.aap.machine_credential.become_method = 'sudo';
  if (!data.aap.machine_credential.become_username) data.aap.machine_credential.become_username = 'root';
  if (!data.aap.git_branch) data.aap.git_branch = 'main';

  if (!data.component_config) data.component_config = {};
  hydrateSelectedComponentConfigs(data);
  const selectedComponentApps = selectedComponentAppsFrom(data);

  if (selectedComponentApps.includes('satellite')) {
    if (!data.component_config.satellite) data.component_config.satellite = {};
    if (data.component_config.satellite.service_account_username === undefined) {
      data.component_config.satellite.service_account_username = '';
    }
    if (data.component_config.satellite.service_account_password === undefined) {
      data.component_config.satellite.service_account_password = '';
    }
    if (data.component_config.satellite.admin_password === undefined) {
      data.component_config.satellite.admin_password = '';
    }
    if (data.component_config.satellite.validate_certs === undefined) {
      data.component_config.satellite.validate_certs = false;
    }
    if (data.component_config.satellite.dynamic_inventory_enabled === undefined) {
      data.component_config.satellite.dynamic_inventory_enabled = true;
    }
    if (!data.component_config.satellite.credential_name) {
      data.component_config.satellite.credential_name = 'ADO Satellite Service Account';
    }
    if (!data.component_config.satellite.inventory_source_name) {
      data.component_config.satellite.inventory_source_name = 'ADO Satellite Dynamic Inventory';
    }
    if (data.component_config.satellite.inventory_overwrite === undefined) {
      data.component_config.satellite.inventory_overwrite = true;
    }
    if (data.component_config.satellite.inventory_overwrite_vars === undefined) {
      data.component_config.satellite.inventory_overwrite_vars = true;
    }
    if (data.component_config.satellite.inventory_update_on_launch === undefined) {
      data.component_config.satellite.inventory_update_on_launch = true;
    }
    data.component_config.satellite.inventory_update_cache_timeout = normalizeNonNegativeInt(
      data.component_config.satellite.inventory_update_cache_timeout,
      0
    );
    data.component_config.satellite.inventory_verbosity = normalizeVerbosity(
      data.component_config.satellite.inventory_verbosity
    );
    if (data.component_config.satellite.inventory_host_filter === undefined) {
      data.component_config.satellite.inventory_host_filter = '';
    }
  }

  if (selectedComponentApps.includes('idm')) {
    if (!data.component_config.idm) data.component_config.idm = {};
    delete data.component_config.idm.storage;
    if (data.component_config.idm.replica_hostname === undefined) data.component_config.idm.replica_hostname = '';
    if (data.component_config.idm.replica_install_dns === undefined) data.component_config.idm.replica_install_dns = true;
    if (data.component_config.idm.replica_install_ca === undefined) data.component_config.idm.replica_install_ca = true;
    if (data.component_config.idm.auto_forwarders === undefined) data.component_config.idm.auto_forwarders = true;
    if (data.component_config.idm.custom_cert_file === undefined) data.component_config.idm.custom_cert_file = '';
    if (data.component_config.idm.custom_cert_key_file === undefined) data.component_config.idm.custom_cert_key_file = '';
    if (data.component_config.idm.custom_cert_chain_file === undefined) data.component_config.idm.custom_cert_chain_file = '';
  }

  if (!data.openshift) data.openshift = {};
  if (data.openshift.skip_tls_verify === undefined) data.openshift.skip_tls_verify = true;
  if (data.openshift.token === undefined) data.openshift.token = '';
  if (data.openshift.admin_username === undefined) data.openshift.admin_username = 'admin';
  if (data.openshift.admin_password === undefined) data.openshift.admin_password = '';
  if (data.openshift.admin_role === undefined) data.openshift.admin_role = 'cluster-admin';
  if (data.openshift.banner_text === undefined) data.openshift.banner_text = 'Hello! ADO OpenShift';
  if (data.openshift.banner_location === undefined) data.openshift.banner_location = 'BannerTop';
  if (data.openshift.banner_background_color === undefined) data.openshift.banner_background_color = '#1f7a1f';
  if (data.openshift.banner_text_color === undefined) data.openshift.banner_text_color = '#ffffff';

  if (!data.component_config.cert_manager) data.component_config.cert_manager = {};
  if (data.component_config.cert_manager.mode === undefined) data.component_config.cert_manager.mode = 'cert';
  if (data.component_config.cert_manager.tls_crt === undefined) data.component_config.cert_manager.tls_crt = '';
  if (data.component_config.cert_manager.tls_key === undefined) data.component_config.cert_manager.tls_key = '';
  if (data.component_config.cert_manager.idm_acme_directory_url === undefined) data.component_config.cert_manager.idm_acme_directory_url = '';
  if (data.component_config.cert_manager.idm_ca_bundle_file === undefined) data.component_config.cert_manager.idm_ca_bundle_file = '';
  if (data.component_config.cert_manager.awspca_namespace === undefined) data.component_config.cert_manager.awspca_namespace = 'cert-manager';
  if (data.component_config.cert_manager.awspca_secret_name === undefined) data.component_config.cert_manager.awspca_secret_name = 'awspca-creds';
  if (data.component_config.cert_manager.awspca_issuer_name === undefined) data.component_config.cert_manager.awspca_issuer_name = 'awspca-clusterissuer';
  if (data.component_config.cert_manager.awspca_region === undefined) data.component_config.cert_manager.awspca_region = 'us-gov-west-1';
  if (data.component_config.cert_manager.awspca_pca_arn === undefined) data.component_config.cert_manager.awspca_pca_arn = '';
  if (data.component_config.cert_manager.awspca_access_key_id === undefined) data.component_config.cert_manager.awspca_access_key_id = '';
  if (data.component_config.cert_manager.awspca_secret_access_key === undefined) data.component_config.cert_manager.awspca_secret_access_key = '';

  return data;
}

function pruneSelectedPayload(data, selectedComponentApps) {
  const allowedConfig = new Set(selectedComponentApps);
  const componentConfig = {};
  const componentOptions = {};

  for (const [component, config] of Object.entries(data.component_config || {})) {
    if (allowedConfig.has(component)) {
      componentConfig[component] = { ...config };
      if (component === 'idm') {
        delete componentConfig[component].storage;
      }
    }
  }

  for (const [component, options] of Object.entries(data.component_options || {})) {
    if (selectedComponentApps.includes(component)) {
      componentOptions[component] = options;
    }
  }

  data.component_config = componentConfig;
  data.component_options = componentOptions;

  if (!selectedComponentApps.includes('openshift')) {
    delete data.openshift;
  }

  if (!selectedComponentApps.includes('jira') && data.jira) {
    data.jira.enabled = false;
  }

  return data;
}

function configureGitCredentials(repoUrl, token) {
  if (!token) {
    event('No Git token provided; Git push will require existing credentials or anonymous push access');
    return;
  }

  const home = process.env.HOME || '/tmp';
  const credPath = path.join(home, '.git-credentials');

  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(credPath, gitCredentialLine(repoUrl, token), { mode: 0o600 });

  event(`Configured Git credentials for ${new URL(repoUrl).host}`);
}

function runStream(cmd, args, cwd, eventLabel, envOverrides = {}) {
  return new Promise((resolve) => {
    if (eventLabel) {
      event(eventLabel);
    }

    append(`\n\n$ ${cmd} ${args.join(' ')}\n`);

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      env: {
        ...buildAnsibleEnv(),
        ...envOverrides
      }
    });

    child.stdout.on('data', d => append(d.toString()));
    child.stderr.on('data', d => append(d.toString()));

    child.on('close', code => {
      append(`\n[exit code ${code}]\n`);

      if (eventLabel) {
        event(`${eventLabel} finished with exit code ${code}`);
      }

      resolve(code);
    });
  });
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    append(`created: ${filePath}\n`);
    event(`Created starter file ${filePath}`);
  } else {
    append(`exists:  ${filePath}\n`);
    event(`Starter file already exists ${filePath}`);
  }
}

function writeAlways(filePath, content) {
  fs.writeFileSync(filePath, content);
  append(`wrote:   ${filePath}\n`);
  event(`Wrote starter file ${filePath}`);
}

function ensureStarterFiles(repoDir, envName) {
  event('Ensuring required starter files exist');
  append('\n=== Ensuring required starter files exist ===\n');

  writeAlways(path.join(repoDir, 'run-ado-scaffolding.yml'), `---
- name: Generate Bootstrap Repo and Configure AAP
  hosts: localhost
  connection: local
  gather_facts: false

  vars:
    env: "{{ env | default('prod') }}"

    generate_env_vars: true
    generate_env_vars_force: true
    bootstrap_generate_env_vars_force: true
    generate_env_vars_use_aap: true
    generate_env_vars_encrypt_vault_files: true
    bootstrap_generate_env_vars_encrypt_vault_files: true
    bootstrap_generate_env_vars_vault_password_file: "{{ vault_password_file | default('.vault_pass') }}"

    generate_playbooks: true
    generate_aap_configs: true
    apply_aap_configs: true

    bootstrap_generate_playbook_repo_git_mode: push
    bootstrap_generate_playbook_repo_git_url: "{{ generate_playbook_repo_git_url }}"
    bootstrap_generate_playbook_repo_git_branch: "{{ generate_playbook_repo_git_branch | default(aap_git_branch | default('main')) }}"
    bootstrap_generate_playbook_repo_git_message: "Generate ADO bootstrap content"

  vars_files:
    - "group_vars/all/{{ env }}/aap_config_vars.yml"
    - "group_vars/all/{{ env }}/aap_vault.yml"
    - "group_vars/all/{{ env }}/vault_machine_cred.yml"

  roles:
    - role: infra.ado.bootstrap_controller
`);

  writeAlways(path.join(repoDir, '00-controller-bootstrap.yml'), `---
- name: Bootstrap Controller
  hosts: localhost
  connection: local
  gather_facts: false

  vars:
    env: "{{ env | default('prod') }}"

    generate_env_vars: "{{ generate_env_vars | default(true) }}"
    generate_playbooks: "{{ generate_playbooks | default(true) }}"
    generate_aap_configs: "{{ generate_aap_configs | default(true) }}"
    apply_aap_configs: "{{ apply_aap_configs | default(true) }}"

  roles:
    - role: infra.ado.bootstrap_controller
`);

  writeAlways(path.join(repoDir, 'inventory'), `localhost ansible_connection=local
`);

  writeAlways(path.join(repoDir, 'ansible.cfg'), `[defaults]
host_key_checking = False
retry_files_enabled = False
stdout_callback = default
interpreter_python = auto_silent
collections_paths = ./collections:/workspace/collections:/usr/share/ansible/collections
`);
}

function readTextFromCandidates(candidates) {
  const checked = candidates.filter(Boolean);
  const filePath = checked.find(candidate => fs.existsSync(candidate));

  if (!filePath) {
    return { text: '', filePath: '', checked };
  }

  return {
    text: fs.readFileSync(filePath, 'utf8'),
    filePath,
    checked
  };
}

function adoCollectionRoots() {
  ensureAdoCollectionExtracted();

  return [
    process.env.ADO_COLLECTION_ROOT,
    path.join(__dirname, '..', 'ado'),
    path.join(__dirname, 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join(__dirname, '..', 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join(process.cwd(), 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/workspace', 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/usr', 'share', 'ansible', 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/opt', 'app-root', 'src', 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/opt', 'app-root', 'collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/opt', 'ado-collections', 'extracted'),
    path.join('/opt', 'ado-collections', 'ansible_collections', 'infra', 'ado'),
    path.join('/opt', 'app-root', 'ado')
  ].filter(Boolean);
}

function adoCollectionReadmeCandidates() {
  return [
    process.env.ADO_COLLECTION_README,
    ...adoCollectionRoots().flatMap(root => [
      path.join(root, 'README.md'),
      path.join(root, 'README.me')
    ]),
    path.join('/opt', 'ado-collections', 'README.md'),
    path.join('/opt', 'app-root', 'ado', 'README.me'),
    path.join('/workspace', 'README.md'),
    path.join(process.cwd(), 'README.md')
  ];
}

function latestAdoCollectionArchive() {
  const candidates = [
    process.env.ADO_COLLECTION_ARCHIVE,
    path.join(__dirname, 'collections'),
    path.join('/opt', 'ado-collections')
  ].filter(Boolean);

  const archives = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      archives.push(candidate);
      continue;
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      for (const fileName of fs.readdirSync(candidate)) {
        if (/^infra-ado-.*\.tar\.gz$/.test(fileName)) {
          archives.push(path.join(candidate, fileName));
        }
      }
    }
  }

  return archives.sort().pop() || '';
}

function ensureAdoCollectionExtracted() {
  const extractRoot = path.join('/opt', 'ado-collections', 'extracted');
  const expectedReadme = path.join(extractRoot, 'README.md');
  const expectedRoles = path.join(extractRoot, 'roles');

  if (fs.existsSync(expectedReadme) && fs.existsSync(expectedRoles)) {
    return;
  }

  const archive = latestAdoCollectionArchive();
  if (!archive) {
    return;
  }

  try {
    fs.mkdirSync(extractRoot, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', extractRoot], {
      stdio: 'ignore'
    });
    event(`Extracted ADO collection documentation from ${archive}`);
  } catch (err) {
    event(`Failed extracting ADO collection documentation: ${err.message}`);
  }
}

function documentationFallback(title, checkedPaths) {
  return `# ${title}

Documentation was not found in the running container image.

The UI checked these paths:

${checkedPaths.map(candidate => `- \`${candidate}\``).join('\n')}

Rebuild the UI container after copying the documentation into the image, or set the matching environment variable to the README path:

- \`ADO_PREFLIGHT_UI_README\` for UI documentation
- \`ADO_COLLECTION_README\` for ADO collection documentation
`;
}

function cleanYamlName(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function listYamlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath)
    .filter(fileName => /\.(yml|yaml)$/.test(fileName))
    .map(fileName => path.join(dirPath, fileName));
}

function addUniqueName(names, value) {
  const name = cleanYamlName(value);
  if (name && !names.includes(name)) {
    names.push(name);
  }
}

function readConfigNames(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const existingPaths = paths.filter(filePath => filePath && fs.existsSync(filePath));
  if (existingPaths.length === 0) return [];

  const names = [];
  const text = existingPaths
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  const namePattern = /^\s*-\s+name:\s*(.+?)\s*$/gm;
  let match = namePattern.exec(text);

  while (match) {
    addUniqueName(names, match[1]);
    match = namePattern.exec(text);
  }

  return names;
}

function readControllerConfigNames(filePaths, rootKeys) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const keys = Array.isArray(rootKeys) ? rootKeys : [rootKeys];
  const existingPaths = paths.filter(filePath => filePath && fs.existsSync(filePath));
  if (existingPaths.length === 0) return [];

  const names = [];

  existingPaths.forEach(filePath => {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let activeRoot = false;

    lines.forEach(line => {
      const rootMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (rootMatch) {
        activeRoot = keys.includes(rootMatch[1]);
        return;
      }

      if (!activeRoot) return;

      const nameMatch = line.match(/^\s*-\s+name:\s*(.+?)\s*$/);
      if (nameMatch) {
        addUniqueName(names, nameMatch[1]);
      }
    });
  });

  if (names.length > 0) return names;

  return readConfigNames(existingPaths);
}

function appendListRecap(lines, label, values) {
  lines.push(`${label}:`);

  if (!values || values.length === 0) {
    lines.push('  none');
    return;
  }

  values.forEach(value => lines.push(`  - ${value}`));
}

function mergeRecapValues(...groups) {
  const values = [];

  groups.flat().forEach(value => {
    const cleaned = cleanYamlName(String(value || ''));
    if (cleaned && !values.includes(cleaned)) {
      values.push(cleaned);
    }
  });

  return values;
}

function orgScopedName(name, org, suffix) {
  const cleaned = cleanYamlName(name || '');
  if (cleaned) return cleaned;
  return org ? `${org}-${suffix}` : '';
}

function expectedRecapObjects(data, selectedComponentApps) {
  const org = cleanYamlName(data?.aap?.organization || 'ADO');
  const aap = data?.aap || {};
  const config = data?.component_config || {};
  const selected = new Set(selectedComponentApps || []);
  const credentials = [];
  const inventories = [];
  const inventorySources = [];
  const hosts = ['localhost'];

  const add = (list, value) => {
    const cleaned = cleanYamlName(value || '');
    if (cleaned && !list.includes(cleaned)) list.push(cleaned);
  };

  add(credentials, aap.vault_credential_name || orgScopedName('', org, 'vault'));

  if (aap.machine_credential?.name && ['rhel', 'satellite', 'patching'].some(component => selected.has(component))) {
    add(credentials, aap.machine_credential.name);
  }

  add(inventories, aap.inventory || orgScopedName('', org, 'inventory'));

  if (selected.has('rhel') || config.satellite?.dynamic_inventory_enabled) {
    add(inventories, `${org}-RHEL-Inventory`);
  }

  if (selected.has('idm')) {
    add(inventories, `${org}-IDM-Inventory`);
  }

  if (selected.has('satellite')) {
    add(inventories, `${org}-Satellite-Server-Inventory`);
  }

  if (config.satellite?.dynamic_inventory_enabled) {
    add(credentials, config.satellite.credential_name || `${org} Satellite Service Account`);
    add(inventorySources, config.satellite.inventory_source_name || `${org} Satellite Dynamic Inventory`);
  }

  const rhelHosts = [config.rhel?.hostname, ...(Array.isArray(config.rhel?.hosts) ? config.rhel.hosts : [])];
  rhelHosts.forEach(host => add(hosts, host));
  add(hosts, config.satellite?.hostname);
  add(hosts, config.idm?.hostname);
  add(hosts, config.idm?.replica_hostname);
  add(hosts, config.openshift?.api_host || config.openshift?.hostname);

  return { credentials, inventories, inventorySources, hosts };
}

function readFirstConfigName(files, fallback = 'not configured') {
  const names = readConfigNames(files);
  return names[0] || fallback;
}

function buildBootstrapRecap(data, repoDir, selectedComponentApps, collectionInstalled) {
  const controllerDir = path.join(repoDir, 'configs', 'controller');
  const jobTemplatesDir = path.join(repoDir, 'configs', 'job_templates');
  const workflowsDir = path.join(repoDir, 'configs', 'workflows');
  const projectName = readFirstConfigName(
    path.join(controllerDir, 'projects.yml'),
    data?.aap?.project || 'not configured'
  );
  const lines = [
    '',
    '=== ADO Bootstrap Recap ===',
    `AAP Server: ${data?.aap?.hostname || 'not configured'}`,
    `Organization: ${data?.aap?.organization || 'not configured'}`,
    `Project Name: ${projectName}`
  ];

  appendListRecap(lines, 'Components', selectedComponentApps);
  appendListRecap(lines, 'Job Templates', readConfigNames([
    path.join(controllerDir, 'job_templates.yml'),
    ...listYamlFiles(jobTemplatesDir)
  ]));
  appendListRecap(lines, 'Workflow Templates', readConfigNames([
    path.join(workflowsDir, 'bootstrap_workflows.yml'),
    ...listYamlFiles(workflowsDir)
  ]));
  const expectedObjects = expectedRecapObjects(data, selectedComponentApps);
  appendListRecap(lines, 'Credentials', mergeRecapValues(
    readControllerConfigNames(
      path.join(controllerDir, 'credentials.yml'),
      ['controller_bootstrap_controller_credentials', 'controller_credentials']
    ),
    expectedObjects.credentials
  ));
  appendListRecap(lines, 'Inventories', mergeRecapValues(
    readControllerConfigNames(
      path.join(controllerDir, 'inventories.yml'),
      ['controller_bootstrap_controller_inventories', 'controller_inventories']
    ),
    expectedObjects.inventories
  ));
  appendListRecap(lines, 'Inventory Sources', mergeRecapValues(
    readControllerConfigNames(
      path.join(controllerDir, 'inventory_sources.yml'),
      ['controller_bootstrap_controller_inventory_sources', 'controller_inventory_sources']
    ),
    expectedObjects.inventorySources
  ));
  appendListRecap(lines, 'Hosts', mergeRecapValues(
    readControllerConfigNames(
      path.join(controllerDir, 'hosts.yml'),
      ['bootstrap_controller_controller_hosts', 'controller_hosts']
    ),
    expectedObjects.hosts
  ));
  lines.push(`Installed infra.ado collection: ${collectionInstalled ? 'yes' : 'no'}`);
  lines.push('');

  return lines.join('\n');
}

app.get('/api/logs' , (req, res) => {
  res.type('text/plain').send(latestLog);
});

app.get('/api/events', (req, res) => {
  res.type('text/plain').send(latestEvents);
});

app.get('/api/debug/:kind', (req, res) => {
  try {
    const kind = String(req.params.kind || 'summary');
    res.type('text/plain').send(buildDebugPayload(kind));
  } catch (err) {
    event(`Failed reading debug ${req.params.kind}: ${err.message}`);
    res.status(500).type('text/plain').send(`Failed reading debug data: ${err.message}\n`);
  }
});

app.get('/api/logs/raw', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="ado-preflight-run.log"');
  res.type('text/plain').send(latestLog);
});

app.get('/api/ui-version', (req, res) => {
  res.json({
    version: process.env.ADO_PREFLIGHT_UI_VERSION || packageJson.version || 'unknown',
    image: process.env.ADO_PREFLIGHT_UI_IMAGE || process.env.IMAGE_NAME || 'ado-preflight-ui',
    imageTag: process.env.ADO_PREFLIGHT_UI_IMAGE_TAG || process.env.IMAGE_TAG || packageJson.version || 'latest',
    podName: process.env.HOSTNAME || 'unknown',
    nodeVersion: process.version
  });
});

app.get('/api/readme', (req, res) => {
  res.redirect('/api/readme/ui');
});

app.get('/api/readme/ui', (req, res) => {
  const result = readTextFromCandidates([
    process.env.ADO_PREFLIGHT_UI_README,
    path.join(__dirname, 'README.md'),
    path.join(__dirname, '..', 'README.md'),
    path.join(process.cwd(), 'README.md'),
    path.join('/opt', 'app-root', 'src', 'README.md'),
    path.join('/opt', 'app-root', 'README.md'),
    path.join('/workspace', 'ado-preflight-ui', 'README.md')
  ]);

  if (!result.text) {
    event(`UI README not found in: ${result.checked.join(', ')}`);
    res.type('text/plain').send(documentationFallback('ADO Preflight UI Documentation', result.checked));
    return;
  }

  res.type('text/plain').send(result.text);
});

app.get('/api/readme/ado', (req, res) => {
  const result = readTextFromCandidates(adoCollectionReadmeCandidates());

  if (!result.text) {
    event(`ADO collection README not found in: ${result.checked.join(', ')}`);
    res.type('text/plain').send(documentationFallback('ADO Collection Documentation', result.checked));
    return;
  }

  res.type('text/plain').send(result.text);
});

app.get('/api/readme/ado/role/:roleName', (req, res) => {
  const roleName = String(req.params.roleName || '').trim();

  if (!/^[A-Za-z0-9_.-]+$/.test(roleName)) {
    res.status(400).type('text/plain').send('# Invalid role documentation request');
    return;
  }

  const checked = [];

  for (const root of adoCollectionRoots()) {
    const collectionRoot = path.resolve(root);
    const candidate = path.resolve(collectionRoot, 'roles', roleName, 'README.md');
    checked.push(candidate);

    if (!candidate.startsWith(`${collectionRoot}${path.sep}`)) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      res.type('text/plain').send(fs.readFileSync(candidate, 'utf8'));
      return;
    }
  }

  event(`ADO role README not found for ${roleName}: ${checked.join(', ')}`);
  res
    .status(404)
    .type('text/plain')
    .send(documentationFallback(`ADO Role Documentation: ${roleName}`, checked));
});

app.get('/api/collection-versions', (req, res) => {
  try {
    event('Reading collection versions');

    const files = fs.readdirSync(collectionDir)
      .filter(f => f.endsWith('.tar.gz'))
      .sort();

    const collections = files.map(file => {
      const shortName = file.replace(/\.tar\.gz$/, '');
      const match = shortName.match(/^(.+)-([0-9].*)$/);

      return {
        file,
        name: match ? match[1] : shortName,
        version: match ? match[2] : 'unknown'
      };
    });

    res.json({ collections });
  } catch (err) {
    event(`Failed reading collection versions: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bootstrap', async (req, res) => {
  latestLog = '';
  latestEvents = '';
  latestDebug = {
    repoDir: '',
    preflightPath: '',
    extraVarsPath: '',
    normalizedPayload: null,
    selectedComponents: '',
    selectedComponentApps: [],
    result: null
  };

  event('Bootstrap started');

  const data = normalizePreflightPayload(req.body);
  const envName = data.environment || 'prod';
  const repoUrl = data?.aap?.git_url;

  if (!repoUrl) {
    event('Bootstrap failed: missing Project Git Source URL');
    return res.status(400).json({ error: 'Missing Project Git Source URL' });
  }

  const gitToken = data?.git?.token || '';

  const selectedComponents =
    Array.isArray(data.components) && data.components.length > 0
      ? data.components.join(',')
      : (data.component || 'all');

  const selectedComponentApps = selectedComponentAppsFrom(data);
  data.selected_component_apps = selectedComponentApps;
  pruneSelectedPayload(data, selectedComponentApps);
  latestDebug.normalizedPayload = redactSecrets(data);
  latestDebug.selectedComponents = selectedComponents;
  latestDebug.selectedComponentApps = selectedComponentApps;

  const autoGitPush = data?.git?.auto_push !== false;
  const ansibleVerbosity = normalizeVerbosity(data?.ansible?.verbosity ?? data?.verbosity ?? 0);
  const ansibleVerbosityFlag = verbosityFlag(ansibleVerbosity);
  const skipTlsVerify = data?.aap?.skip_tls_verify === true;
  const encryptVaultFiles = data?.vault?.encrypt !== false;
  const bootstrapEnv = buildAnsibleEnv(skipTlsVerify);

  append(`\nSelected Components: ${selectedComponents}\n`);
  append(`Selected Component Apps: ${selectedComponentApps.join(',')}\n`);
  append(`Auto Git Push: ${autoGitPush}\n`);
  append(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}\n`);
  append(`Skip TLS Verification: ${skipTlsVerify}\n`);
  append(`Encrypt Vault Files: ${encryptVaultFiles}\n`);

  event(`Selected components: ${selectedComponents}`);
  event(`Selected component apps: ${selectedComponentApps.join(',')}`);
  event(`Auto Git Push: ${autoGitPush}`);
  event(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}`);
  event(`Skip TLS Verification: ${skipTlsVerify}`);
  event(`Encrypt vault files: ${encryptVaultFiles}`);

  configureGitCredentials(repoUrl, gitToken);

  const repoDir = path.join(workRoot, 'bootstrap-sample');
  const preflightFile = `ado-preflight-${envName}.json`;
  const preflightPath = path.join(repoDir, preflightFile);
  const extraVarsPath = path.join(repoDir, 'ado-extra-vars.json');
  const vaultPassPath = path.join(repoDir, '.vault_pass');
  latestDebug.repoDir = repoDir;
  latestDebug.preflightPath = preflightPath;
  latestDebug.extraVarsPath = extraVarsPath;

  event(`Cleaning repo directory ${repoDir}`);
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(workRoot, { recursive: true });

  const collectionInstallCode = await runStream('bash', ['-lc', `
set -e

rm -rf /workspace/collections
mkdir -p /workspace/collections

echo ""
echo "=== Available Collection Tarballs ==="
ls -l ${collectionDir} || true

echo ""
echo "=== Installing ADO Collection ==="
if ls ${collectionDir}/infra-ado-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install ${collectionDir}/infra-ado-*.tar.gz -p /workspace/collections --force
else
  ansible-galaxy collection install ${collectionDir}/ado-*.tar.gz -p /workspace/collections --force
fi

echo ""
echo "=== Installing ansible.controller Collection ==="
ansible-galaxy collection install ${collectionDir}/ansible-controller-*.tar.gz -p /workspace/collections --force

echo ""
echo "=== Installing awx.awx Collection ==="
if ls ${collectionDir}/awx-awx-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install ${collectionDir}/awx-awx-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "awx-awx tarball not found; skipping"
fi

echo ""
echo "=== Installing infra.controller_configuration Collection ==="
ansible-galaxy collection install ${collectionDir}/infra-controller_configuration-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installing infra.aap_configuration Collection ==="
ansible-galaxy collection install ${collectionDir}/infra-aap_configuration-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installing community.general Collection ==="
ansible-galaxy collection install ${collectionDir}/community-general-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installed Collections ==="
ANSIBLE_COLLECTIONS_PATH=/workspace/collections:/usr/share/ansible/collections \\
ANSIBLE_COLLECTIONS_PATHS=/workspace/collections:/usr/share/ansible/collections \\
ansible-galaxy collection list
`], workRoot, 'Installing collections');

  if (collectionInstallCode !== 0) {
    event(`Bootstrap failed during collection install exitCode=${collectionInstallCode}`);
    latestDebug.result = {
      status: 'failed',
      exitCode: collectionInstallCode,
      repoDir,
      error: 'Collection install failed. Check logs.'
    };
    return res.json(latestDebug.result);
  }

  await runStream(
    'git',
    ['config', '--global', 'user.email', data?.git?.email || 'ado-preflight@example.local'],
    workRoot,
    'Configuring Git user email'
  );

  await runStream(
    'git',
    ['config', '--global', 'user.name', data?.git?.name || 'ADO Preflight UI'],
    workRoot,
    'Configuring Git user name'
  );

  await runStream(
    'git',
    ['config', '--global', 'credential.helper', 'store'],
    workRoot,
    'Configuring Git credential helper'
  );

  await runStream(
    'git',
    ['config', '--global', 'credential.useHttpPath', 'false'],
    workRoot,
    'Configuring Git credential scope'
  );

  const cloneCode = await runStream(
    'git',
    ['-c', 'http.sslVerify=false', 'clone', '--branch', data.aap.git_branch, '--single-branch', repoUrl, repoDir],
    workRoot,
    'Cloning Git repository'
  );

  if (cloneCode !== 0 || !fs.existsSync(repoDir)) {
    event(`Bootstrap failed during git clone exitCode=${cloneCode}`);
    latestDebug.result = {
      status: 'failed',
      exitCode: cloneCode || 128,
      repoDir,
      error: 'Git clone failed. Check logs.'
    };
    return res.json(latestDebug.result);
  }

  event('Git repository cloned');

  ensureStarterFiles(repoDir, envName);

  event(`Writing preflight JSON ${preflightFile}`);
  fs.writeFileSync(preflightPath, JSON.stringify(data, null, 2));

  event('Writing ado-extra-vars.json for debug only; not passed to Ansible');
  fs.writeFileSync(extraVarsPath, JSON.stringify({
    component: selectedComponents,
    components: data.components || ['all'],
    component_apps: data.component_apps || {},
    selected_component_apps: selectedComponentApps,
    generate_env_vars_component: selectedComponents,
    generate_playbook_repo_component: selectedComponents,
    generate_aap_config_component: selectedComponents,
    generate_env_vars_components: selectedComponentApps,
    generate_playbook_repo_components: selectedComponentApps,
    generate_aap_config_components: selectedComponentApps,
    component_config: data.component_config || {},
    component_vars: data.component_config || {},
    component_options: data.component_options || {},
    machine_credential: data.aap.machine_credential || {},
    git_auto_push: autoGitPush,
    skip_tls_verify: skipTlsVerify,
    ansible_tls_verify: skipTlsVerify ? 'false' : 'true',
    ansible_verbosity: ansibleVerbosity,
    ansible_verbosity_flag: ansibleVerbosityFlag,
    encrypt_vault_files: encryptVaultFiles
  }, null, 2));

  event('Writing vault password file');
  fs.writeFileSync(
    vaultPassPath,
    data?.aap?.vault_password || data.vault_password || 'redhat123'
  );

  const code = await runStream('bash', ['-lc', `
export ANSIBLE_COLLECTIONS_PATH=/workspace/collections:/usr/share/ansible/collections
export ANSIBLE_COLLECTIONS_PATHS=/workspace/collections:/usr/share/ansible/collections
export ANSIBLE_HOST_KEY_CHECKING=false
export ANSIBLE_FORCE_COLOR=false
${skipTlsVerify ? 'export ANSIBLE_TLS_VERIFY=false' : ''}
export CONTROLLER_VERIFY_SSL=false
export TOWER_VERIFY_SSL=false
export REQUESTS_CA_BUNDLE=
export CURL_CA_BUNDLE=
export PYTHONHTTPSVERIFY=0
export GIT_SSL_NO_VERIFY=true

cd ${repoDir}

git config http.sslVerify false || true

echo ""
echo "=== Remove old generated bootstrap content ==="
rm -rf group_vars playbooks configs

echo ""
echo "=== Effective preflight JSON ==="
cat ${preflightFile}

echo ""
echo "=== Starter files check ==="
ls -l run-ado-scaffolding.yml 00-controller-bootstrap.yml inventory ansible.cfg

echo ""
echo "=== Run bootstrap scaffolding ==="
ansible-playbook \\
  -c local \\
  -i inventory \\
  run-ado-scaffolding.yml \\
  ${ansibleVerbosityFlag} \\
  -e preflight_json=${preflightFile} \\
  -e env=${envName} \\
  -e controller_validate_certs=false \\
  -e controller_verify_ssl=false \\
  -e tower_verify_ssl=false \\
  -e validate_certs=false \\
  -e verify_ssl=false \\
  -e skip_tls_verify=${skipTlsVerify ? 'true' : 'false'} \\
  -e ansible_tls_verify=${skipTlsVerify ? 'false' : 'true'} \\
  -e generate_playbooks=true \\
  -e generate_aap_configs=true \\
  -e apply_aap_configs=true \\
  -e bootstrap_controller_apply_aap_configs=true \\
  -e generate_playbook_repo_pause_for_push=false \\
  -e generate_playbook_repo_git_push=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_commit=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_mode=${autoGitPush ? 'push' : 'manual'} \\
  -e generate_playbook_repo_git_branch="${data.aap.git_branch}" \\
  -e bootstrap_generate_playbook_repo_git_branch="${data.aap.git_branch}" \\
  -e generate_playbook_repo_git_commit_message="Generate ADO bootstrap content for ${envName}" \\
  -e bootstrap_generate_env_vars_force=true \\
  -e generate_env_vars_force=true \\
  -e generate_env_vars_encrypt_vault_files=${encryptVaultFiles ? 'true' : 'false'} \\
  -e bootstrap_generate_env_vars_encrypt_vault_files=${encryptVaultFiles ? 'true' : 'false'} \\
  -e bootstrap_generate_env_vars_vault_password_file=.vault_pass \\
  --vault-password-file .vault_pass
`], workRoot, 'Running ansible-playbook', bootstrapEnv);

  const bootstrapRecap = buildBootstrapRecap(
    data,
    repoDir,
    selectedComponentApps,
    collectionInstallCode === 0
  );
  event(`Bootstrap finished exitCode=${code}`);

  latestDebug.result = {
    status: code === 0 ? 'complete' : 'failed',
    exitCode: code,
    repoDir,
    preflightFile,
    selectedComponents,
    selectedComponentApps,
    autoGitPush,
    ansibleVerbosity,
    ansibleVerbosityFlag,
    skipTlsVerify,
    encryptVaultFiles,
    bootstrapRecap,
    gitTokenProvided: Boolean(gitToken)
  };

  res.json(latestDebug.result);
});

app.use((req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  event(`ADO Preflight UI listening on ${port}`);
});
