const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { URL } = require('url');

process.env.NODE_OPTIONS = '--max-old-space-size=256';

const app = express();
const port = 8080;

const workRoot = '/workspace';
const collectionDir = '/opt/ado-collections';

function hasAnsiblePlatformCollection() {
  try {
    return fs.readdirSync(collectionDir).some(f => /^ansible-platform-.*\.tar\.gz$/.test(f));
  } catch {
    return false;
  }
}
const uiDir = path.join(__dirname, 'dist');
const packageJson = require('./package.json');

const openshiftApps = [
  'aap', 'acs', 'acm', 'bookstack', 'cert_manager', 'console', 'devspaces',
  'dirsrv', 'eck', 'gitops', 'gitlab', 'grafana', 'kafka', 'netbox',
  'oadp', 'openshift', 'pega', 'quay', 'rhbk'
];
const rhelApps = ['rhel', 'satellite', 'idm', 'aap', 'dirsrv', 'eck', 'gitlab', 'grafana', 'kafka', 'rhbk', 'compliance', 'stig'];
const patchingApps = ['patching', 'satellite', 'idm'];
const awsApps = ['ec2_ami_copy'];
const provisionApps = ['aws_instance', 'openshift_virt'];
const AAP_VERSION_NUMBER = {
  '2.4': '24',
  '2.5': '25',
  '2.6': '26',
  '2.7': '27',
  '24': '24',
  '25': '25',
  '26': '26',
  '27': '27'
};
const AAP_VERSION_DOTTED = {
  '24': '2.4',
  '25': '2.5',
  '26': '2.6',
  '27': '2.7',
  '2.4': '2.4',
  '2.5': '2.5',
  '2.6': '2.6',
  '2.7': '2.7'
};

function aapVersionNumber(raw, fallback = '27') {
  return AAP_VERSION_NUMBER[String(raw || '').trim()] || fallback;
}

function aapDottedVersion(raw, fallback = '2.7') {
  return AAP_VERSION_DOTTED[String(raw || '').trim()] || fallback;
}

function attachAapLicenseRequested(data) {
  if (data?.pre_installs?.install_aap === true) return false;
  return data?.pre_installs?.attach_aap_license === true
    || data?.pre_installs?.aap?.license_only === true
    || data?.component_config?.aap?.license_only === true;
}

function installAapFullRequested(data) {
  return data?.pre_installs?.install_aap === true;
}

function installAapRequested(data) {
  return installAapFullRequested(data)
    || attachAapLicenseRequested(data)
    || (
      data?.component_config?.aap?.install_during_bootstrap === true
      && !attachAapLicenseRequested(data)
    );
}

function aapAppExplicitlySelected(data) {
  const apps = data?.component_apps || {};
  return ['openshift', 'rhel'].some(
    group => Array.isArray(apps[group]) && apps[group].includes('aap')
  );
}

function stripAutoSelectedAapComponent(data) {
  if (aapAppExplicitlySelected(data)) return data;
  if (Array.isArray(data.components)) {
    data.components = data.components.filter(component => component !== 'aap');
  }
  if (Array.isArray(data.selected_component_apps)) {
    data.selected_component_apps = data.selected_component_apps.filter(component => component !== 'aap');
  }
  if (data.component === 'aap') {
    if (Array.isArray(data.components) && data.components.length > 0) {
      data.component = data.components.includes('all') ? 'all' : data.components[0];
    } else {
      delete data.component;
    }
  }
  if (!Array.isArray(data.components) || data.components.length === 0) {
    data.platform = [];
  }
  return data;
}

function normalizeOpenShiftApiHost(raw) {
  let host = String(raw || '').trim();
  if (!host) return '';
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`;
  return host.replace(/\/+$/, '');
}

function parseOpenShiftStorageClasses(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  return items
    .map(item => {
      const name = String(item?.metadata?.name || '').trim();
      const annotations = item?.metadata?.annotations || {};
      const isDefault = String(
        annotations['storageclass.kubernetes.io/is-default-class'] || ''
      ).toLowerCase() === 'true';
      return {
        name,
        default: isDefault,
        provisioner: String(item?.provisioner || ''),
        reclaimPolicy: String(item?.reclaimPolicy || ''),
        volumeBindingMode: String(item?.volumeBindingMode || '')
      };
    })
    .filter(item => item.name)
    .sort((left, right) => {
      if (left.default !== right.default) return left.default ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

function openshiftApiGetJson(apiHost, token, apiPath, skipTls) {
  const base = normalizeOpenShiftApiHost(apiHost);
  if (!base) {
    return Promise.reject(new Error('OpenShift API host is required'));
  }
  const url = new URL(apiPath, `${base}/`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        rejectUnauthorized: !skipTls,
        timeout: 15000
      },
      res => {
        let payload = '';
        res.on('data', chunk => {
          payload += chunk;
          if (payload.length > 2000000) {
            req.destroy();
            reject(new Error('OpenShift response too large'));
          }
        });
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error('OpenShift token was rejected. Check the token and RBAC.'));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`OpenShift API returned HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(payload));
          } catch {
            reject(new Error('OpenShift API returned non-JSON'));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OpenShift API timed out'));
    });
    req.on('error', err => {
      reject(new Error(`OpenShift API request failed: ${err.message}`));
    });
    req.end();
  });
}
const openshiftOptionApps = {
  admin_htpasswd: 'admin_htpasswd',
  console_banner: 'console',
  ldap_auth: 'openshift_ldap_auth',
  oauth_rhbk: 'openshift_oauth_rhbk',
  discover_routes_print: 'openshift_discover_routes_print',
  discover_routes_alt: 'openshift_discover_routes_alt',
  update_pull_secret: 'openshift_update_pull_secret'
};
const rhbkOptionApps = {
  standalone: 'rhbk_standalone',
  realm: 'rhbk_realm',
  client: 'rhbk_client',
  idp: 'rhbk_idp',
  federation: 'rhbk_federation',
  group_mapper: 'rhbk_mapper',
  client_scopes: 'rhbk_client_scopes',
  client_mappers: 'rhbk_client_mappers'
};
const gitlabOptionApps = {
  standalone: 'gitlab_standalone'
};
const grafanaOptionApps = {
  standalone: 'grafana_standalone'
};
const DEFAULT_HUB_EE_IMAGE_NAME = 'ado-ee';

app.use(express.json({ limit: '100mb' }));
app.use(express.static(uiDir));
app.use('/examples', express.static(path.join(__dirname, 'examples')));

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
      if (sensitive) {
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

/** Container registry image names must be lowercase (Hub rejects ADO-ee). */
function normalizeHubImageName(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'ADO-ee' || raw === 'ee') return DEFAULT_HUB_EE_IMAGE_NAME;
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
    || DEFAULT_HUB_EE_IMAGE_NAME;
}

function verbosityFlag(level) {
  const normalized = normalizeVerbosity(level);

  if (normalized <= 0) {
    return '';
  }

  return `-${'v'.repeat(normalized)}`;
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Split freeform ansible-playbook options into argv tokens (supports simple quotes).
function tokenizeAnsibleExtraArgs(input) {
  const tokens = [];
  const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g;
  let match;
  while ((match = re.exec(String(input || ''))) !== null) {
    let token = match[0];
    if (
      (token.startsWith('"') && token.endsWith('"'))
      || (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1);
    }
    if (token) tokens.push(token);
  }
  return tokens;
}

function formatAnsibleExtraArgsForShell(input) {
  return tokenizeAnsibleExtraArgs(input).map(shellSingleQuote).join(' ');
}

function buildAnsibleEnv(skipTlsVerify = false, gitSkipTlsVerify = true) {
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
    GIT_TERMINAL_PROMPT: '0'
  };

  if (gitSkipTlsVerify) {
    ansibleEnv.GIT_SSL_NO_VERIFY = 'true';
  }

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

function usesBearerGitAuth(scmTool) {
  return String(scmTool || '').trim().toLowerCase() === 'bitbucket';
}

function gitBearerExtraHeader(token) {
  return `Authorization: Bearer ${String(token || '').trim()}`;
}

function redactGitArgsForLog(args) {
  return args.map(arg => {
    if (typeof arg !== 'string') return arg;
    return arg
      .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer ***')
      .replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***:***@');
  });
}

function buildGitCloneArgs({
  repoUrl,
  branch,
  repoDir,
  token,
  scmTool,
  gitSkipTlsVerify
}) {
  const args = [];

  if (gitSkipTlsVerify) {
    args.push('-c', 'http.sslVerify=false');
  }

  if (usesBearerGitAuth(scmTool) && token) {
    args.push('-c', `http.extraHeader=${gitBearerExtraHeader(token)}`);
  }

  args.push('clone', '--branch', branch, '--single-branch', repoUrl, repoDir);
  return args;
}

function selectedComponentAppsFrom(data) {
  if (Array.isArray(data.components) && data.components.includes('all')) {
    return [...new Set([...openshiftApps, ...rhelApps, ...patchingApps, ...awsApps, ...provisionApps, 'jira'])];
  }

  const out = [];
  const groups = ['openshift', 'rhel', 'patching', 'aws', 'provision'];
  const components = Array.isArray(data.components) ? data.components : [];

  for (const component of components) {
    if (groups.includes(component)) {
      out.push(component);
      const selected = data.component_apps?.[component] || [];
      out.push(...selected);
    } else {
      out.push(component);
    }
  }

  if (components.includes('openshift')) {
    for (const option of data.component_options?.openshift || []) {
      if (openshiftOptionApps[option]) {
        out.push(openshiftOptionApps[option]);
      }
    }
  }

  if (components.includes('rhbk') || (data.component_apps?.openshift || []).includes('rhbk')) {
    for (const option of data.component_options?.rhbk || []) {
      if (rhbkOptionApps[option]) {
        out.push(rhbkOptionApps[option]);
      }
    }
  }

  const gitlabSelected = components.includes('gitlab')
    || (data.component_apps?.openshift || []).includes('gitlab')
    || (data.component_apps?.rhel || []).includes('gitlab');
  if (gitlabSelected) {
    for (const option of data.component_options?.gitlab || []) {
      if (gitlabOptionApps[option]) out.push(gitlabOptionApps[option]);
    }
  }

  const grafanaSelected = components.includes('grafana')
    || (data.component_apps?.openshift || []).includes('grafana')
    || (data.component_apps?.rhel || []).includes('grafana');
  if (grafanaSelected) {
    for (const option of data.component_options?.grafana || []) {
      if (grafanaOptionApps[option]) out.push(grafanaOptionApps[option]);
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
  const groups = ['openshift', 'rhel', 'patching', 'aws', 'provision'];
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
  if (component === 'aws') {
    return {
      profile: '',
      default_region: 'us-east-1',
      access_key_id: '',
      secret_access_key: '',
      session_token: ''
    };
  }

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
      dynamic_inventory_enabled: false,
      credential_name: 'ADO Satellite Service Account',
      inventory_source_name: 'ADO Satellite Dynamic Inventory',
      inventory_overwrite: true,
      inventory_overwrite_vars: true,
      inventory_update_on_launch: true,
      inventory_update_cache_timeout: 0,
      inventory_verbosity: 0,
      inventory_host_filter: '',
      manifest_file: '',
      manifest_content_base64: '',
      manifest_encoding: 'base64',
      manifest_organization: ''
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
    });
  }

  if (component === 'grafana') {
    Object.assign(config, {
      hostname: 'grafana-ado.server.lab',
      folders: [
        { name: 'Openshift', source_type: 'path', source: '', dashboards_path: 'dashboards', alerts_path: 'alerts' }
      ],
      email: {
        enabled: false,
        host: '',
        port: '587',
        user: '',
        password: '',
        from_address: '',
        from_name: 'Grafana'
      },
      oidc: {
        enabled: false,
        client_id: 'grafana-client',
        client_secret: '',
        issuer: ''
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
    });
  }

  if (component === 'gitlab') {
    Object.assign(config, {
      hostname: 'gitlab-ado.server.lab',
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
    });
  }

  if (component === 'acm') {
    Object.assign(config, {
      namespace: 'open-cluster-management',
      channel: 'release-2.14'
    });
  }

  if (component === 'acs') {
    Object.assign(config, {
      namespace: 'stackrox',
      policies_source_type: 'git',
      policies_source: '',
      reports_source_type: 'git',
      reports_source: ''
    });
  }

  if (component === 'aap') {
    Object.assign(config, {
      license_mode: 'none',
      subscription_manifest_file: '',
      subscription_manifest_content_base64: '',
      rhn_username: '',
      rhn_password: ''
    });
  }

  if (component === 'devspaces') {
    Object.assign(config, {
      namespace: 'openshift-devspaces',
      disable_default_samples: true,
      customize_workspace: false,
      default_devfile_url: '',
      default_workspace_image: '',
      che_image_tag: '',
      dashboard_image: ''
    });
  }

  if (component === 'rhbk') {
    Object.assign(config, {
      clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }],
      group_mapper_name: '',
      group_mapper_claim: 'groups',
      group_mapper_group_path: '',
      group_mapper_sync_mode: 'IMPORT',
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
      standalone_rhn_activation_key: ''
    });
  }

  return config;
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

/** Derive https://host/realms/rhlab from OIDC auth/token URLs. */
function keycloakRealmUrlFromOidcUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    const match = parsed.pathname.match(/(\/realms\/[^/]+)/i);
    if (!match) return '';
    return `${parsed.origin}${match[1]}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

async function fetchKeycloakRealmPublicKey({ authorizationUrl, accessTokenUrl, skipTlsVerify }) {
  const realmUrl = keycloakRealmUrlFromOidcUrl(authorizationUrl)
    || keycloakRealmUrlFromOidcUrl(accessTokenUrl);
  if (!realmUrl) {
    throw new Error(
      'Set Authorization URL or Access token URL first (expected '
      + 'https://<host>/realms/<realm>/protocol/openid-connect/...).'
    );
  }
  const result = await aapGetJson(`${realmUrl}`, { skipTls: skipTlsVerify === true });
  const publicKey = String(result.json?.public_key || '').trim();
  if (!publicKey) {
    throw new Error(`Keycloak responded from ${realmUrl} but public_key was empty`);
  }
  return { realmUrl, publicKey };
}

function aapControllerBase(hostname) {
  const raw = String(hostname || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
}

function aapGetJson(urlString, { token, username, password, skipTls }, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers,
        rejectUnauthorized: !skipTls,
        timeout: timeoutMs,
        auth: (!token && username) ? `${username}:${password || ''}` : undefined
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, json });
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}`));
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AAP ping timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function pingAapController(data) {
  const base = aapControllerBase(data?.aap?.hostname);
  if (!base) {
    throw new Error('AAP Hostname URL is required');
  }
  const token = String(data?.aap?.oauth_token || '').trim();
  const username = String(data?.aap?.admin_username || '').trim();
  const password = String(data?.aap?.admin_password || '').trim();
  if (!token && !(username && password)) {
    throw new Error('AAP OAuth token or admin username/password is required');
  }
  const skipTls = data?.aap?.skip_tls_verify === true;
  const paths = ['/api/controller/v2/ping/', '/api/v2/ping/'];
  let lastErr;
  for (const pingPath of paths) {
    try {
      const result = await aapGetJson(`${base}${pingPath}`, {
        token,
        username,
        password,
        skipTls
      });
      return { ok: true, url: `${base}${pingPath}`, ping: result.json };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('AAP ping failed');
}

function hydrateSelectedComponentConfigs(data) {
  const selectedComponentApps = selectedComponentAppsFrom(data);
  const allowedConfig = new Set([
    ...selectedComponentApps,
    ...(Array.isArray(data.components) ? data.components : [])
  ]);
  if (installAapRequested(data)) allowedConfig.add('aap');

  if (!data.component_config) data.component_config = {};

  const hydrateList = new Set(selectedComponentApps);
  if (installAapRequested(data)) hydrateList.add('aap');
  if (Array.isArray(data.components) && data.components.includes('aws')) {
    hydrateList.add('aws');
  }

  for (const component of hydrateList) {
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

function normalizeAdditionalEnvironments(value) {
  const noneTokens = new Set(['none', 'non', 'n/a', '-', 'null', 'undefined']);
  const raw = Array.isArray(value)
    ? value.join(' ')
    : String(value || '');
  return raw
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => !noneTokens.has(item.toLowerCase()));
}


function aapAuthDownloadTags(data) {
  const auth = data?.aap?.auth || {};
  const tags = [
    { key: 'keycloak_oidc', tag: 'add-auth-keycloak' },
    { key: 'ldap', tag: 'add-auth-ldap' },
    { key: 'keycloak_saml', tag: 'add-auth-keycloak-saml' }
  ];
  return tags.filter(({ key }) => auth[key]?.enabled === true).map(({ tag }) => tag);
}

function activeOnboardTenants(aap) {
  const tenants = aap?.onboard?.tenants;
  if (!Array.isArray(tenants)) return [];
  return tenants.filter(
    tenant => tenant && tenant.enabled !== false && String(tenant.organization || '').trim()
  );
}

function aapOnboardRequested(data) {
  const onboard = data?.aap?.onboard || {};
  if (onboard.enabled !== true) return false;
  return activeOnboardTenants(data?.aap).length > 0;
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

function aapAuthConfigRequested(data) {
  return aapAuthDownloadTags(data).length > 0;
}

function aapStandaloneConfigRequested(data) {
  return aapAuthConfigRequested(data);
}

function aapStandaloneRun(data) {
  return data?.aap?.standalone_run === true
    || data?.aap?.hub_update_collection_only === true;
}

function syncAapStandaloneFields(aap) {
  if (!aap || typeof aap !== 'object') return;
  if (aap.standalone_run === undefined) {
    aap.standalone_run = aap.hub_update_collection_only === true;
  }
  aap.hub_update_collection_only = aap.standalone_run === true;
}

function aapStandaloneWorkSelected(data) {
  return (
    data?.aap?.hub_publish_ado_collection === true
    || data?.aap?.hub_push_ee === true
    || data?.aap?.galaxy_setup_enabled === true
    || aapAuthConfigRequested(data)
    || attachAapLicenseRequested(data)
    || installAapFullRequested(data)
  );
}

function stripInactiveAapSections(data) {
  if (!data?.aap || typeof data.aap !== 'object') return data;

  if (data.aap.auth && typeof data.aap.auth === 'object') {
    Object.entries(data.aap.auth).forEach(([key, value]) => {
      if (!value || value.enabled !== true) {
        delete data.aap.auth[key];
      }
    });
    if (Object.keys(data.aap.auth).length === 0) {
      delete data.aap.auth;
    }
  }

  if (!aapOnboardRequested(data)) {
    delete data.aap.onboard;
  }

  return data;
}

function normalizePreflightPayload(input) {
  const data = JSON.parse(JSON.stringify(input || {}));

  if (!data.aap) data.aap = {};
  // Sync top-level hub → aap early so Hub-only / publish flags are consistent.
  if (data.hub && typeof data.hub === 'object') {
    if (data.hub.update_only !== undefined) {
      data.aap.hub_update_collection_only = data.hub.update_only === true;
    }
    if (data.hub.publish_ado_collection !== undefined) {
      data.aap.hub_publish_ado_collection = data.hub.publish_ado_collection === true;
    }
    if (data.hub.push_ee !== undefined) {
      data.aap.hub_push_ee = data.hub.push_ee === true;
    }
    if (data.hub.hostname && !String(data.aap.hub_hostname || '').trim()) {
      data.aap.hub_hostname = data.hub.hostname;
    }
  }
  if (data.aap.hub_update_collection_only === undefined) data.aap.hub_update_collection_only = false;
  if (data.aap.standalone_run === undefined) {
    data.aap.standalone_run = data.aap.hub_update_collection_only === true;
  }
  syncAapStandaloneFields(data.aap);
  const standaloneRun = aapStandaloneRun(data);
  const hubUpdateCollectionOnly = standaloneRun;

  if (hubUpdateCollectionOnly) {
    // Standalone AAP run: skip component playbooks; apply enabled AAP tabs only.
    data.components = [];
    delete data.component;
    data.platform = [];
    data.component_apps = { openshift: [], rhel: [], patching: [], aws: [], provision: [] };
    data.component_config = {};
    data.component_options = {};
  } else if (!Array.isArray(data.components) || data.components.length === 0) {
    if (Array.isArray(data.platform) && data.platform.length > 0) {
      data.components = data.platform.includes('all') ? ['all'] : data.platform;
    } else if (data.component) {
      data.components = [data.component];
    } else {
      data.components = [];
    }
  }

  // Do not set component=all.
  // infra.ado.bootstrap_generate_env_vars treats preflight.component as an exact component list
  // and will generate vars_all.yml instead of expanding platform=all.
  if (data.components.includes('all')) {
    delete data.component;
    data.platform = ['all'];
  } else if (data.components.length > 0) {
    data.component = data.components[0];
    data.platform = data.components;
  } else {
    delete data.component;
    data.platform = [];
  }
  pruneInactiveComponentApps(data);

  if (!data.git) data.git = {};
  if (data.git.auto_push === undefined) data.git.auto_push = true;
  if (data.git.skip_tls_verify === undefined) data.git.skip_tls_verify = true;
  if (data.git.overwrite_generated === undefined) data.git.overwrite_generated = false;
  if (data.git.token === undefined) data.git.token = '';

  // Normalize additional environments for survey choices (never create group_vars dirs).
  data.additional_environments = normalizeAdditionalEnvironments(data.additional_environments);

  if (!data.vault) data.vault = {};
  if (data.vault.encrypt === undefined) data.vault.encrypt = true;

  if (data.aap.enabled === undefined) data.aap.enabled = true;
  if (data.aap.skip_tls_verify === undefined) data.aap.skip_tls_verify = false;
  if (!data.aap.organization) data.aap.organization = 'ADO';
  data.aap.inventory = normalizeOrgScopedName(data.aap.inventory, data.aap.organization, 'inventory');
  data.aap.project = normalizeOrgScopedName(data.aap.project, data.aap.organization, 'project');
  data.aap.vault_credential_name = normalizeOrgScopedName(data.aap.vault_credential_name, data.aap.organization, 'vault');
  if (data.aap.hub_publish_ado_collection === undefined) data.aap.hub_publish_ado_collection = false;
  if (data.aap.hub_mark_ado_validated === undefined) data.aap.hub_mark_ado_validated = false;
  if (data.aap.hub_force_ado_collection_update === undefined) data.aap.hub_force_ado_collection_update = false;
  data.aap.hub_mark_ado_validated = data.aap.hub_publish_ado_collection === true;
  // Optional Hub EE push — local image by default; hub_ee_pull enables remote ghcr pull first
  if (data.aap.hub_push_ee === undefined) data.aap.hub_push_ee = false;
  // Prefer explicit hub block when present (Download JSON / import shape).
  if (data.hub && typeof data.hub === 'object') {
    if (data.hub.hostname && !String(data.aap.hub_hostname || '').trim()) {
      data.aap.hub_hostname = data.hub.hostname;
    }
    if (data.hub.registry && !String(data.aap.hub_ee_registry || '').trim()) {
      data.aap.hub_ee_registry = data.hub.registry;
    }
    if (data.hub.publish_ado_collection === true) {
      data.aap.hub_publish_ado_collection = true;
      data.aap.hub_mark_ado_validated = true;
    }
    if (data.hub.force_ado_collection_update !== undefined) {
      data.aap.hub_force_ado_collection_update = data.hub.force_ado_collection_update === true;
    }
    if (data.hub.update_only !== undefined) {
      data.aap.hub_update_collection_only = data.hub.update_only === true;
    }
    if (data.hub.push_ee !== undefined) {
      data.aap.hub_push_ee = data.hub.push_ee === true;
    }
    if (data.hub.ee && typeof data.hub.ee === 'object') {
      const ee = data.hub.ee;
      if (ee.source_image) data.aap.hub_ee_source_image = ee.source_image;
      if (ee.name) data.aap.hub_ee_name = ee.name;
      if (ee.tag) data.aap.hub_ee_tag = ee.tag;
      if (ee.pull !== undefined) data.aap.hub_ee_pull = ee.pull === true;
      if (ee.create_execution_environment !== undefined) {
        data.aap.hub_ee_create_execution_environment = ee.create_execution_environment !== false;
      }
      if (ee.execution_environment_name) {
        data.aap.hub_ee_execution_environment_name = ee.execution_environment_name;
      }
      if (ee.description) data.aap.hub_ee_description = ee.description;
    }
  }
  const HUB_EE_BAKED_SOURCE = 'docker-archive:/opt/ado-ee/ado-ee.docker.tar';
  const HUB_EE_REGISTRY_SOURCE = 'ghcr.io/automation-development-office/ado-ee:latest';
  const hubOrg = data.aap.organization || 'ADO';
  // Registry image name must be lowercase (ado-ee). Contoller EE object may stay ORG-ee.
  const defaultHubEeName = DEFAULT_HUB_EE_IMAGE_NAME;
  const defaultControllerEeName = `${String(hubOrg).trim() || 'ADO'}-ee`;
  const defaultHubEeDescription =
    'ADO Contoller execution environment based on the supported RHEL 9 AAP EE. '
    + 'Preloads Ansible collections used by infra.ado bootstrap and lab jobs '
    + '(ansible.controller, ansible.posix, kubernetes.k8s, redhat.openshift, community.general, '
    + 'amazon.aws, and related dependencies) so Contoller can run disconnected without Galaxy pulls.';
  if (
    data.aap.hub_ee_name === undefined
    || !String(data.aap.hub_ee_name || '').trim()
    || data.aap.hub_ee_name === 'ADO-ee'
  ) {
    data.aap.hub_ee_name = defaultHubEeName;
  } else {
    data.aap.hub_ee_name = normalizeHubImageName(data.aap.hub_ee_name);
  }
  if (data.aap.hub_ee_tag === undefined) data.aap.hub_ee_tag = 'latest';
  if (data.aap.hub_ee_registry === undefined) data.aap.hub_ee_registry = '';
  if (data.aap.hub_hostname === undefined) data.aap.hub_hostname = '';
  // Hub hostname required for Hub work — default from AAP hostname host.
  if (!String(data.aap.hub_hostname || '').trim()) {
    data.aap.hub_hostname = hostnameFromUrl(data.aap.hostname);
  } else {
    data.aap.hub_hostname = hostnameFromUrl(data.aap.hub_hostname) || String(data.aap.hub_hostname).trim();
  }
  if (!String(data.aap.hub_ee_registry || '').trim()) {
    data.aap.hub_ee_registry = data.aap.hub_hostname;
  } else {
    data.aap.hub_ee_registry = hostnameFromUrl(data.aap.hub_ee_registry)
      || String(data.aap.hub_ee_registry).trim();
  }
  if (data.aap.hub_ee_pull === undefined) data.aap.hub_ee_pull = false;
  data.aap.hub_ee_pull = data.aap.hub_ee_pull === true;
  // Disconnected default: baked archive. Pull checkbox → ghcr (or keep a custom registry ref).
  {
    const src = String(data.aap.hub_ee_source_image || '').trim();
    if (data.aap.hub_ee_pull) {
      if (!src || src.startsWith('docker-archive:')) {
        data.aap.hub_ee_source_image = HUB_EE_REGISTRY_SOURCE;
      }
    } else if (!src || /^ghcr\.io\//i.test(src)) {
      data.aap.hub_ee_source_image = HUB_EE_BAKED_SOURCE;
    }
  }
  if (data.aap.hub_ee_create_execution_environment === undefined) {
    data.aap.hub_ee_create_execution_environment = true;
  }
  if (
    data.aap.hub_ee_execution_environment_name === undefined
    || !String(data.aap.hub_ee_execution_environment_name || '').trim()
    || data.aap.hub_ee_execution_environment_name === 'ado-ee'
  ) {
    data.aap.hub_ee_execution_environment_name = defaultControllerEeName;
  } else {
    data.aap.hub_ee_execution_environment_name = normalizeOrgScopedName(
      data.aap.hub_ee_execution_environment_name,
      hubOrg,
      'ee'
    );
  }
  if (data.aap.hub_ee_description === undefined || !String(data.aap.hub_ee_description || '').trim()) {
    data.aap.hub_ee_description = defaultHubEeDescription;
  }
  data.hub = {
    name: `${hubOrg}-hub`,
    hostname: data.aap.hub_hostname,
    registry: data.aap.hub_ee_registry,
    publish_ado_collection: data.aap.hub_publish_ado_collection === true,
    force_ado_collection_update: data.aap.hub_force_ado_collection_update === true,
    mark_ado_validated: data.aap.hub_mark_ado_validated === true,
    update_only: data.aap.hub_update_collection_only === true,
    push_ee: data.aap.hub_push_ee === true,
    ee: {
      source_image: data.aap.hub_ee_source_image,
      name: data.aap.hub_ee_name,
      tag: data.aap.hub_ee_tag,
      pull: data.aap.hub_ee_pull === true,
      create_execution_environment: data.aap.hub_ee_create_execution_environment !== false,
      execution_environment_name: data.aap.hub_ee_execution_environment_name,
      description: data.aap.hub_ee_description
    }
  };
  if (data.aap.galaxy_setup_enabled === undefined) data.aap.galaxy_setup_enabled = false;
  // Hub collection / EE / hub-only runs need org + Galaxy/registry creds. Auto-enable
  // when those Hub options are on so Contoller can pull ado-ee without ImagePullBackOff.
  if (
    data.aap.hub_publish_ado_collection === true
    || data.aap.hub_push_ee === true
    || data.aap.hub_update_collection_only === true
  ) {
    data.aap.galaxy_setup_enabled = true;
  }
  if (data.aap.galaxy_hub_token === undefined) data.aap.galaxy_hub_token = '';
  if (!data.aap.galaxy_user_account || typeof data.aap.galaxy_user_account !== 'object') {
    data.aap.galaxy_user_account = {
      enabled: false,
      username: '',
      password: '',
      email: '',
      is_superuser: false
    };
  }
  if (data.aap.galaxy_user_account.enabled === undefined) data.aap.galaxy_user_account.enabled = false;
  if (!Array.isArray(data.aap.galaxy_credentials) || data.aap.galaxy_credentials.length === 0) {
    const org = data.aap.organization || 'ADO';
    const hostname = data.aap.hostname || '';
    const base = String(hostname).replace(/\/+$/, '');
    const hubContent = base ? `${base}/api/galaxy/content` : '';
    data.aap.galaxy_credentials = [
      {
        id: 'validated',
        name: `${org}-validated`,
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
        name: `${org}-published`,
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
        name: `${org}-community`,
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
        name: `${org}-certified`,
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
  }
  if (!data.aap.container_registry_credential || typeof data.aap.container_registry_credential !== 'object') {
    const org = data.aap.organization || 'ADO';
    data.aap.container_registry_credential = {
      enabled: true,
      name: `${org}-EE`,
      credential_type: 'Container Registry',
      host: String(data.aap.hostname || '').replace(/\/+$/, ''),
      username: '',
      password: '',
      verify_ssl: !data.aap.skip_tls_verify
    };
  }
  // If skip_tls_verify is set globally and the registry credential still has verify_ssl=true
  // (e.g. loaded from an old saved JSON), flip it to false so EE pulls work on self-signed clusters.
  if (data.aap.skip_tls_verify === true && data.aap.container_registry_credential.verify_ssl === true) {
    data.aap.container_registry_credential.verify_ssl = false;
  }
  // Galaxy tab mirrors Hub: empty token/password fields fall back to General credentials.
  if (data.aap.galaxy_setup_enabled === true) {
    const generalToken = String(data.aap.oauth_token || '').trim();
    const generalPassword = String(data.aap.admin_password || '').trim();
    const generalUser = String(data.aap.admin_username || 'admin').trim() || 'admin';
    const sharedHubToken = String(data.aap.galaxy_hub_token || '').trim()
      || generalToken
      || generalPassword;
    if (!String(data.aap.galaxy_hub_token || '').trim() && sharedHubToken) {
      data.aap.galaxy_hub_token = sharedHubToken;
    }
    if (Array.isArray(data.aap.galaxy_credentials)) {
      data.aap.galaxy_credentials = data.aap.galaxy_credentials.map((credential) => {
        if (!credential || typeof credential !== 'object') return credential;
        const next = { ...credential };
        if (!String(next.token || '').trim()) {
          next.token = sharedHubToken;
        }
        return next;
      });
    }
    const registry = data.aap.container_registry_credential;
    if (registry && typeof registry === 'object' && registry.enabled !== false) {
      if (!String(registry.username || '').trim()) registry.username = generalUser;
      if (!String(registry.password || '').trim()) {
        registry.password = sharedHubToken || generalPassword;
      }
      if (!String(registry.host || '').trim()) {
        registry.host = String(data.aap.hostname || data.aap.hub_hostname || '')
          .replace(/^https?:\/\//, '')
          .replace(/\/+$/, '');
      }
    }
  }
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
  if (installAapRequested(data)) stripAutoSelectedAapComponent(data);
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
      data.component_config.satellite.dynamic_inventory_enabled = false;
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
    if (!data.component_config.satellite.oidc) {
      data.component_config.satellite.oidc = {};
    }
    if (!data.component_config.satellite.oidc.client_id) {
      data.component_config.satellite.oidc.client_id = 'ado-satellite';
    }
    if (!data.component_config.satellite.oidc.realm) {
      data.component_config.satellite.oidc.realm = 'rhlab';
    }
    if (!data.component_config.satellite.oidc.keycloak_url) {
      data.component_config.satellite.oidc.keycloak_url = 'https://keycloak.apps.ocp.prod.rhlab';
    }
    if (!data.component_config.satellite.oidc.issuer) {
      data.component_config.satellite.oidc.issuer = 'https://keycloak.apps.ocp.prod.rhlab/realms/rhlab';
    }
    if (data.component_config.satellite.oidc.client_secret === undefined) {
      data.component_config.satellite.oidc.client_secret = '';
    }
    if (!data.component_config.satellite.oidc.admin_user) {
      data.component_config.satellite.oidc.admin_user = 'admin';
    }
    if (data.component_config.satellite.oidc.admin_password === undefined) {
      data.component_config.satellite.oidc.admin_password = '';
    }
    if (data.component_config.satellite.oidc.create_client === undefined) {
      data.component_config.satellite.oidc.create_client = true;
    }
    if (data.component_config.satellite.oidc.validate_certs === undefined) {
      data.component_config.satellite.oidc.validate_certs = false;
    }
    const satOptions = data.component_options?.satellite || [];
    if (satOptions.includes('satellite_dynamic_inventory')) {
      if (data.component_config.satellite.dynamic_inventory_enabled === undefined) {
        data.component_config.satellite.dynamic_inventory_enabled = true;
      }
    } else if (data.component_config.satellite.dynamic_inventory_enabled === undefined) {
      data.component_config.satellite.dynamic_inventory_enabled = false;
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
    if (data.component_config.idm.ad_domain === undefined) data.component_config.idm.ad_domain = 'ad.lab';
    if (data.component_config.idm.ad_dc_hostname === undefined) data.component_config.idm.ad_dc_hostname = 'adwindows.ad.lab';
    if (data.component_config.idm.ad_dc_ip === undefined) data.component_config.idm.ad_dc_ip = '192.168.0.61';
    if (data.component_config.idm.ad_admin === undefined) data.component_config.idm.ad_admin = 'Administrator';
    if (data.component_config.idm.ad_admin_password === undefined) data.component_config.idm.ad_admin_password = '';
    if (data.component_config.idm.ad_two_way === undefined) data.component_config.idm.ad_two_way = true;
    if (data.component_config.idm.ad_configure_groups === undefined) data.component_config.idm.ad_configure_groups = true;
    if (data.component_config.idm.ad_map_group === undefined) data.component_config.idm.ad_map_group = '';
    if (data.component_config.idm.ad_map_admins_group === undefined) data.component_config.idm.ad_map_admins_group = '';
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
  data.openshift.agent_installer = normalizeAgentInstaller(data.openshift.agent_installer || {});

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

  if (!data.pre_installs) data.pre_installs = {};
  if (data.pre_installs.install_aap === undefined) data.pre_installs.install_aap = false;
  // Support legacy boolean openshift_agent + new object shape
  if (typeof data.pre_installs.openshift_agent === 'boolean') {
    data.pre_installs.openshift_agent_enabled = data.pre_installs.openshift_agent;
    data.pre_installs.openshift_agent = {
      api_host: '',
      pull_secret: '',
      ssh_public_key: ''
    };
  }
  if (data.pre_installs.openshift_agent_enabled === undefined) {
    data.pre_installs.openshift_agent_enabled = false;
  }
  if (!data.pre_installs.aap || typeof data.pre_installs.aap !== 'object') {
    data.pre_installs.aap = {
      license_mode: 'none',
      subscription_manifest_file: '',
      subscription_manifest_content_base64: '',
      subscription_manifest_encoding: 'base64',
      rhn_username: '',
      rhn_password: ''
    };
  }
  if (!data.pre_installs.openshift_agent || typeof data.pre_installs.openshift_agent !== 'object') {
    data.pre_installs.openshift_agent = {
      api_host: '',
      pull_secret: '',
      ssh_public_key: ''
    };
  }
  if (!data.component_config.aap) data.component_config.aap = {};
  if (data.component_config.aap.replicas === undefined || data.component_config.aap.replicas === null || data.component_config.aap.replicas === '') {
    data.component_config.aap.replicas = 1;
  }
  if (!data.component_config.aap.operator_scope) {
    data.component_config.aap.operator_scope = 'all_namespaces';
  }
  const preAap = data.pre_installs.aap;
  // Contoller/patching against an existing AAP must not inherit a sticky
  // install_during_bootstrap from older payloads. Only Install AAP opts in.
  data.component_config.aap.install_during_bootstrap = data.pre_installs.install_aap === true;
  if (preAap.license_mode && preAap.license_mode !== 'none') {
    data.component_config.aap.license_mode = preAap.license_mode;
  }
  if (preAap.subscription_manifest_file) {
    data.component_config.aap.subscription_manifest_file = preAap.subscription_manifest_file;
  }
  if (preAap.subscription_manifest_content_base64) {
    data.component_config.aap.subscription_manifest_content_base64 = preAap.subscription_manifest_content_base64;
  }
  if (preAap.subscription_manifest_encoding) {
    data.component_config.aap.subscription_manifest_encoding = preAap.subscription_manifest_encoding;
  }
  if (preAap.rhn_username) data.component_config.aap.rhn_username = preAap.rhn_username;
  if (preAap.rhn_password) data.component_config.aap.rhn_password = preAap.rhn_password;

  // Mirror agent summary into agent_installer when enabled
  if (data.pre_installs.openshift_agent_enabled) {
    if (!data.openshift) data.openshift = {};
    if (!data.openshift.agent_installer || typeof data.openshift.agent_installer !== 'object') {
      data.openshift.agent_installer = {};
    }
    const summary = data.pre_installs.openshift_agent;
    if (summary.pull_secret && !data.openshift.agent_installer.pull_secret) {
      data.openshift.agent_installer.pull_secret = summary.pull_secret;
    }
    if (summary.ssh_public_key && !data.openshift.agent_installer.ssh_public_key) {
      data.openshift.agent_installer.ssh_public_key = summary.ssh_public_key;
    }
    if (summary.api_host && !data.openshift.api_host) {
      data.openshift.api_host = summary.api_host;
    }
    // Keep summary in sync with agent installer
    data.pre_installs.openshift_agent = {
      api_host: summary.api_host || data.openshift.api_host || '',
      pull_secret: summary.pull_secret || data.openshift.agent_installer.pull_secret || '',
      ssh_public_key: summary.ssh_public_key || data.openshift.agent_installer.ssh_public_key || ''
    };
  }

  // Ensure selected component configs keep a replicas default for form/CLI builds.
  const replicaSkip = new Set(['rhel', 'satellite', 'idm', 'compliance', 'stig', 'patching']);
  Object.keys(data.component_config || {}).forEach(name => {
    if (replicaSkip.has(name)) return;
    const cfg = data.component_config[name];
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return;
    if (cfg.replicas === undefined || cfg.replicas === null || cfg.replicas === '') {
      cfg.replicas = 1;
    }
  });

  if (data.openshift.htpasswd_action === undefined) data.openshift.htpasswd_action = 'add';
  if (!Array.isArray(data.openshift.htpasswd_users) || data.openshift.htpasswd_users.length === 0) {
    data.openshift.htpasswd_users = [{
      name: data.openshift.admin_username || 'admin',
      password: data.openshift.admin_password || '',
      role: data.openshift.admin_role || 'cluster-admin'
    }];
  } else {
    // Keep legacy single-admin fields synced from first user
    const first = data.openshift.htpasswd_users[0] || {};
    if (first.name) data.openshift.admin_username = first.name;
    if (first.password !== undefined) data.openshift.admin_password = first.password;
    if (first.role) data.openshift.admin_role = first.role;
  }

  if (data.component_config.grafana) {
    if (!Array.isArray(data.component_config.grafana.folders)) {
      data.component_config.grafana.folders = [];
    }
    // Expand first folder into legacy single-folder fields for older playbooks
    if (data.component_config.grafana.folders.length > 0) {
      const firstFolder = data.component_config.grafana.folders[0] || {};
      if (!data.component_config.grafana.folder_name && firstFolder.name) {
        data.component_config.grafana.folder_name = firstFolder.name;
      }
      if (!data.component_config.grafana.dashboards_source && firstFolder.source) {
        data.component_config.grafana.dashboards_source = firstFolder.source;
      }
    }
    if (!data.component_config.grafana.email || typeof data.component_config.grafana.email !== 'object') {
      data.component_config.grafana.email = { enabled: false };
    } else {
      const email = data.component_config.grafana.email;
      // Accept either smtp_* or legacy short keys
      if (email.smtp_host === undefined && email.host !== undefined) email.smtp_host = email.host;
      if (email.smtp_port === undefined && email.port !== undefined) email.smtp_port = email.port;
      if (email.smtp_user === undefined && email.user !== undefined) email.smtp_user = email.user;
      if (email.smtp_password === undefined && email.password !== undefined) email.smtp_password = email.password;
    }
    if (!data.component_config.grafana.oidc || typeof data.component_config.grafana.oidc !== 'object') {
      data.component_config.grafana.oidc = { enabled: false };
    }
  }

  if (data.component_config.rhbk) {
    if (!Array.isArray(data.component_config.rhbk.clients)) {
      data.component_config.rhbk.clients = [];
    }
    // Sync first client into legacy single-client fields
    if (data.component_config.rhbk.clients.length > 0) {
      const firstClient = data.component_config.rhbk.clients[0] || {};
      const clientId = firstClient.id || firstClient.client_id || '';
      if (clientId && !data.component_config.rhbk.client) {
        data.component_config.rhbk.client = clientId;
      }
      if ((firstClient.name || firstClient.client_name) && !data.component_config.rhbk.client_name) {
        data.component_config.rhbk.client_name = firstClient.name || firstClient.client_name;
      }
      if (firstClient.redirect_uris && !data.component_config.rhbk.client_redirect_uris) {
        data.component_config.rhbk.client_redirect_uris = firstClient.redirect_uris;
      }
      if (firstClient.web_origins && !data.component_config.rhbk.client_web_origins) {
        data.component_config.rhbk.client_web_origins = firstClient.web_origins;
      }
    }
  }

  stripInactiveAapSections(data);

  return data;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '')
    .split(/[\n,]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function ipToInt(ip) {
  const parts = String(ip || '').trim().split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const num = Number(part);
    if (num < 0 || num > 255) return null;
    out = ((out << 8) + num) >>> 0;
  }
  return out >>> 0;
}

function parseCidr(cidr) {
  const match = String(cidr || '').trim().match(/^([^/]+)\/(\d{1,2})$/);
  if (!match) return null;
  const base = ipToInt(match[1]);
  const prefix = Number(match[2]);
  if (base === null || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base, prefix, mask, network: base & mask };
}

function ipInCidr(ip, cidr) {
  const parsed = parseCidr(cidr);
  const value = ipToInt(ip);
  if (!parsed || value === null) return false;
  return ((value & parsed.mask) >>> 0) === (parsed.network >>> 0);
}

function normalizeMac(mac) {
  const raw = String(mac || '').trim().toLowerCase();
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
}

function isValidMac(mac) {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(normalizeMac(mac));
}

function parseKernelArguments(value) {
  return String(value || '')
    .split(/\n/)
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        /^(?:operation:\s*)?(append|replace|delete)\s+(?:value:\s*)?(.+)$/i
      );
      if (match) {
        return {
          operation: match[1].toLowerCase(),
          value: match[2].trim()
        };
      }
      return { operation: 'append', value: line };
    })
    .filter(item => item.value);
}

function isValidSshKey(key) {
  return /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(256|384|521))\s+\S+/.test(String(key || '').trim());
}

function yamlQuote(value) {
  const text = String(value ?? '');
  if (text === '') return "''";
  if (/^[A-Za-z0-9_.@/-]+$/.test(text) && !['true', 'false', 'null'].includes(text.toLowerCase())) {
    return text;
  }
  return `'${text.replace(/'/g, "''")}'`;
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value.map(item => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) return `${pad}- {}`;
        const [firstKey, firstValue] = entries[0];
        const first = typeof firstValue === 'object' && firstValue !== null
          ? `${pad}- ${firstKey}:\n${toYaml(firstValue, indent + 4)}`
          : `${pad}- ${firstKey}: ${yamlScalar(firstValue)}`;
        const rest = entries.slice(1).map(([key, child]) => (
          child && typeof child === 'object'
            ? `${pad}  ${key}:\n${toYaml(child, indent + 4)}`
            : `${pad}  ${key}: ${yamlScalar(child)}`
        ));
        return [first, ...rest].join('\n');
      }
      return `${pad}- ${yamlScalar(item)}`;
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, child]) => (
      child && typeof child === 'object'
        ? `${pad}${key}:\n${toYaml(child, indent + 2)}`
        : `${pad}${key}: ${yamlScalar(child)}`
    )).join('\n');
  }

  return `${pad}${yamlScalar(value)}`;
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  if (text.includes('\n')) {
    return `|\n${text.split('\n').map(line => `  ${line}`).join('\n')}`;
  }
  return yamlQuote(text);
}

function parseMaybeYamlList(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .map(line => {
      const [source, mirrors] = line.split(/\s*:\s*/, 2);
      return mirrors ? { source, mirrors: splitList(mirrors) } : { source };
    });
}

function normalizeAgentInstaller(input) {
  const data = JSON.parse(JSON.stringify(input || {}));
  data.topology = data.topology || 'ha';
  data.cluster_name = data.cluster_name || 'ocp-dev';
  data.base_domain = data.base_domain || 'dev.rhlab';
  data.openshift_version = data.openshift_version || '4.16';
  data.platform = data.platform || 'baremetal';
  data.publish = data.publish || 'External';
  data.network_type = data.network_type || 'OVNKubernetes';
  data.machine_network_cidr = data.machine_network_cidr || '192.168.2.0/24';
  data.cluster_network_cidr = data.cluster_network_cidr || '10.128.0.0/14';
  data.cluster_network_host_prefix = normalizeNonNegativeInt(data.cluster_network_host_prefix, 24);
  data.service_network_cidr = data.service_network_cidr || '172.30.0.0/16';
  data.kernel_arguments = String(data.kernel_arguments || '');
  data.nodes = (Array.isArray(data.nodes) ? data.nodes : []).map(node => {
    const next = { ...node };
    next.macAddress = normalizeMac(next.macAddress);
    next.secondaryMacAddress = normalizeMac(next.secondaryMacAddress);
    next.bondEnabled = next.bondEnabled === true;
    next.bondName = String(next.bondName || 'bond0').trim() || 'bond0';
    next.bondMode = String(next.bondMode || 'active-backup').trim() || 'active-backup';
    next.secondaryInterfaceName = String(next.secondaryInterfaceName || 'eno2').trim() || 'eno2';
    return next;
  });
  return data;
}

function validateAgentInstaller(input) {
  const data = normalizeAgentInstaller(input);
  const errors = [];
  const warnings = [];
  const required = [
    ['cluster_name', 'Cluster name is required.'],
    ['base_domain', 'Base domain is required.'],
    ['machine_network_cidr', 'Machine network CIDR is required.'],
    ['cluster_network_cidr', 'Cluster network CIDR is required.'],
    ['service_network_cidr', 'Service network CIDR is required.'],
    ['api_vip', 'API VIP is required.'],
    ['ingress_vip', 'Ingress VIP is required.'],
    ['rendezvous_ip', 'Rendezvous IP is required.'],
    ['pull_secret', 'Pull secret is required.'],
    ['ssh_public_key', 'SSH public key is required.']
  ];

  for (const [key, message] of required) {
    if (!String(data[key] || '').trim()) errors.push(message);
  }

  for (const [key, label] of [
    ['machine_network_cidr', 'Machine network CIDR'],
    ['cluster_network_cidr', 'Cluster network CIDR'],
    ['service_network_cidr', 'Service network CIDR']
  ]) {
    if (!parseCidr(data[key])) errors.push(`${label} is not a valid CIDR.`);
  }

  if (data.api_vip && !ipInCidr(data.api_vip, data.machine_network_cidr)) {
    errors.push('API VIP must be inside the machine network CIDR.');
  }
  if (data.ingress_vip && !ipInCidr(data.ingress_vip, data.machine_network_cidr)) {
    errors.push('Ingress VIP must be inside the machine network CIDR.');
  }
  if (data.rendezvous_ip && !ipInCidr(data.rendezvous_ip, data.machine_network_cidr)) {
    errors.push('Rendezvous IP must be inside the machine network CIDR.');
  }

  try {
    JSON.parse(data.pull_secret || '{}');
  } catch {
    errors.push('Pull secret must be valid JSON.');
  }

  if (data.ssh_public_key && !isValidSshKey(data.ssh_public_key)) {
    errors.push('SSH public key must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-nistp*.');
  }

  const masters = data.nodes.filter(node => node.role === 'master');
  const workers = data.nodes.filter(node => node.role === 'worker');
  if (data.topology === 'sno') {
    if (masters.length !== 1) errors.push('SNO requires exactly one control plane node.');
    if (workers.length > 0) errors.push('SNO cannot include worker nodes.');
  } else if (masters.length < 3) {
    errors.push('HA clusters require at least three control plane nodes.');
  }

  const hostnames = new Set();
  const macs = new Set();
  const ips = new Set([data.api_vip, data.ingress_vip, data.rendezvous_ip].filter(Boolean));

  data.nodes.forEach((node, index) => {
    const label = node.hostname || `node ${index + 1}`;
    if (!node.hostname) errors.push(`Node ${index + 1} hostname is required.`);
    if (node.hostname && hostnames.has(node.hostname)) errors.push(`Duplicate hostname: ${node.hostname}.`);
    if (node.hostname) hostnames.add(node.hostname);

    if (!['master', 'worker'].includes(node.role)) errors.push(`${label} role must be master or worker.`);
    if (!node.macAddress) errors.push(`${label} MAC address is required.`);
    if (node.macAddress && !isValidMac(node.macAddress)) {
      errors.push(
        `${label} MAC address is invalid. Use 12 hex digits (112233445566) or colon-separated form (11:22:33:44:55:66).`
      );
    }
    const normalizedMac = normalizeMac(node.macAddress);
    if (normalizedMac && macs.has(normalizedMac)) errors.push(`Duplicate MAC address: ${node.macAddress}.`);
    if (normalizedMac) macs.add(normalizedMac);

    if (!node.interfaceName) errors.push(`${label} interface name is required.`);
    // Root disk hints are optional (single-disk hosts can omit them).
    if (data.require_root_device && !node.diskDevice) {
      warnings.push(`${label} has no root device hint; enable only if you want a reminder to set one.`);
    }

    if (node.bondEnabled) {
      if (!node.secondaryInterfaceName) {
        errors.push(`${label} secondary interface name is required when bonding is enabled.`);
      }
      if (node.secondaryInterfaceName && node.secondaryInterfaceName === node.interfaceName) {
        errors.push(`${label} secondary interface must differ from the primary interface.`);
      }
      if (!node.secondaryMacAddress) {
        errors.push(`${label} secondary MAC address is required when bonding is enabled.`);
      }
      if (node.secondaryMacAddress && !isValidMac(node.secondaryMacAddress)) {
        errors.push(
          `${label} secondary MAC address is invalid. Use 12 hex digits or colon-separated form.`
        );
      }
      const secondaryMac = normalizeMac(node.secondaryMacAddress);
      if (secondaryMac && macs.has(secondaryMac)) {
        errors.push(`Duplicate MAC address: ${node.secondaryMacAddress}.`);
      }
      if (secondaryMac) macs.add(secondaryMac);
      if (!node.bondName) errors.push(`${label} bond name is required when bonding is enabled.`);
      if (!node.bondMode) errors.push(`${label} bond mode is required when bonding is enabled.`);
    }

    if (node.networkMode === 'static') {
      if (!node.ipAddress) errors.push(`${label} static IP is required.`);
      if (node.ipAddress && !ipInCidr(node.ipAddress, data.machine_network_cidr)) {
        errors.push(`${label} static IP must be inside the machine network CIDR.`);
      }
      if (node.ipAddress && ips.has(node.ipAddress)) errors.push(`Duplicate IP address: ${node.ipAddress}.`);
      if (node.ipAddress) ips.add(node.ipAddress);
      if (!node.gateway || ipToInt(node.gateway) === null) errors.push(`${label} gateway must be a valid IP address.`);
      for (const dns of splitList(node.dnsServers)) {
        if (ipToInt(dns) === null) errors.push(`${label} DNS server is invalid: ${dns}.`);
      }
    }
  });

  const kernelArgs = parseKernelArguments(data.kernel_arguments);
  for (const item of kernelArgs) {
    if (!['append', 'replace', 'delete'].includes(item.operation)) {
      errors.push(`Unsupported kernel argument operation: ${item.operation}.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, config: data };
}

function buildInstallConfig(config) {
  const masters = config.nodes.filter(node => node.role === 'master').length;
  const workers = config.nodes.filter(node => node.role === 'worker').length;
  const doc = {
    apiVersion: 'v1',
    baseDomain: config.base_domain,
    metadata: { name: config.cluster_name },
    compute: [
      {
        name: 'worker',
        replicas: config.topology === 'sno' ? 0 : workers,
        architecture: 'amd64',
        hyperthreading: 'Enabled',
        platform: {}
      }
    ],
    controlPlane: {
      name: 'master',
      replicas: masters,
      architecture: 'amd64',
      hyperthreading: 'Enabled',
      platform: {}
    },
    networking: {
      networkType: config.network_type,
      clusterNetwork: [
        {
          cidr: config.cluster_network_cidr,
          hostPrefix: Number(config.cluster_network_host_prefix || 24)
        }
      ],
      machineNetwork: [{ cidr: config.machine_network_cidr }],
      serviceNetwork: [config.service_network_cidr]
    },
    platform: {
      baremetal: {
        apiVIP: config.api_vip,
        ingressVIPs: [config.ingress_vip]
      }
    },
    publish: config.publish || 'External',
    pullSecret: config.pull_secret,
    sshKey: config.ssh_public_key
  };

  if (config.proxy_http || config.proxy_https || config.proxy_no_proxy) {
    doc.proxy = {};
    if (config.proxy_http) doc.proxy.httpProxy = config.proxy_http;
    if (config.proxy_https) doc.proxy.httpsProxy = config.proxy_https;
    if (config.proxy_no_proxy) doc.proxy.noProxy = config.proxy_no_proxy;
  }
  if (config.additional_trust_bundle) {
    doc.additionalTrustBundlePolicy = 'Proxyonly';
    doc.additionalTrustBundle = config.additional_trust_bundle;
  }
  const imageSources = parseMaybeYamlList(config.disconnected_registry);
  if (imageSources.length > 0) doc.imageContentSources = imageSources;

  return `---\n${toYaml(doc)}\n`;
}

function buildHostNetworkConfig(node) {
  const primaryMac = normalizeMac(node.macAddress);
  const secondaryMac = normalizeMac(node.secondaryMacAddress);
  const bondEnabled = node.bondEnabled === true;
  const bondName = String(node.bondName || 'bond0').trim() || 'bond0';
  const bondMode = String(node.bondMode || 'active-backup').trim() || 'active-backup';
  const isStatic = node.networkMode === 'static';

  if (!bondEnabled && !isStatic) {
    return null;
  }

  if (!bondEnabled) {
    return {
      interfaces: [
        {
          name: node.interfaceName,
          type: 'ethernet',
          state: 'up',
          'mac-address': primaryMac,
          ipv4: {
            enabled: true,
            dhcp: false,
            address: [
              {
                ip: node.ipAddress,
                'prefix-length': Number(node.prefixLength || 24)
              }
            ]
          }
        }
      ],
      'dns-resolver': {
        config: {
          server: splitList(node.dnsServers)
        }
      },
      routes: {
        config: [
          {
            destination: '0.0.0.0/0',
            'next-hop-address': node.gateway,
            'next-hop-interface': node.interfaceName,
            'table-id': 254
          }
        ]
      }
    };
  }

  const slaveInterfaces = [
    {
      name: node.interfaceName,
      type: 'ethernet',
      state: 'up',
      'mac-address': primaryMac,
      ipv4: { enabled: false },
      ipv6: { enabled: false }
    },
    {
      name: node.secondaryInterfaceName,
      type: 'ethernet',
      state: 'up',
      'mac-address': secondaryMac,
      ipv4: { enabled: false },
      ipv6: { enabled: false }
    }
  ];

  const bondInterface = {
    name: bondName,
    type: 'bond',
    state: 'up',
    'mac-address': primaryMac,
    'link-aggregation': {
      mode: bondMode,
      options: {
        miimon: '100'
      },
      port: [node.interfaceName, node.secondaryInterfaceName]
    },
    ipv4: isStatic
      ? {
          enabled: true,
          dhcp: false,
          address: [
            {
              ip: node.ipAddress,
              'prefix-length': Number(node.prefixLength || 24)
            }
          ]
        }
      : {
          enabled: true,
          dhcp: true
        }
  };

  const networkConfig = {
    interfaces: [...slaveInterfaces, bondInterface]
  };

  if (isStatic) {
    networkConfig['dns-resolver'] = {
      config: {
        server: splitList(node.dnsServers)
      }
    };
    networkConfig.routes = {
      config: [
        {
          destination: '0.0.0.0/0',
          'next-hop-address': node.gateway,
          'next-hop-interface': bondName,
          'table-id': 254
        }
      ]
    };
  }

  return networkConfig;
}

function buildKernelArgumentManifests(config) {
  const args = parseKernelArguments(config.kernel_arguments);
  if (args.length === 0) return {};

  const values = args.map(item => item.value);
  const assistedStyle = {
    kernelArguments: args.map(item => ({
      operation: item.operation,
      value: item.value
    }))
  };

  const files = {
    'openshift/99-assisted-kernel-arguments.yaml': `---\n${toYaml(assistedStyle)}\n`
  };

  for (const role of ['master', 'worker']) {
    const doc = {
      apiVersion: 'machineconfiguration.openshift.io/v1',
      kind: 'MachineConfig',
      metadata: {
        name: `99-${role}-kernel-arguments`,
        labels: {
          'machineconfiguration.openshift.io/role': role
        }
      },
      spec: {
        kernelArguments: values
      }
    };
    files[`openshift/99-${role}-kernel-arguments.yaml`] = `---\n${toYaml(doc)}\n`;
  }

  return files;
}

function buildAgentConfig(config) {
  const doc = {
    apiVersion: 'v1alpha1',
    kind: 'AgentConfig',
    metadata: { name: config.cluster_name },
    rendezvousIP: config.rendezvous_ip
  };

  if (config.boot_artifacts_base_url) doc.bootArtifactsBaseURL = config.boot_artifacts_base_url;
  const ntp = splitList(config.ntp_sources);
  if (ntp.length > 0) doc.additionalNTPSources = ntp;

  doc.hosts = config.nodes.map(node => {
    const primaryMac = normalizeMac(node.macAddress);
    const interfaces = [
      {
        name: node.interfaceName,
        macAddress: primaryMac
      }
    ];

    if (node.bondEnabled) {
      interfaces.push({
        name: node.secondaryInterfaceName,
        macAddress: normalizeMac(node.secondaryMacAddress)
      });
    }

    const host = {
      hostname: node.hostname,
      role: node.role,
      interfaces
    };

    if (node.diskDevice) {
      host.rootDeviceHints = { deviceName: node.diskDevice };
    }

    const networkConfig = buildHostNetworkConfig(node);
    if (networkConfig) host.networkConfig = networkConfig;

    const labels = splitList(node.labels);
    if (labels.length > 0) host.labels = Object.fromEntries(labels.map(item => {
      const [key, value = 'true'] = item.split('=');
      return [key.trim(), value.trim()];
    }));

    const taints = splitList(node.taints);
    if (taints.length > 0) host.taints = taints;

    return host;
  });

  return `---\n${toYaml(doc)}\n`;
}

function generateAgentInstallerFiles(input) {
  const validation = validateAgentInstaller(input);
  if (!validation.valid) return validation;
  const config = validation.config;
  const additionalManifests = buildKernelArgumentManifests(config);
  return {
    valid: true,
    errors: [],
    warnings: validation.warnings,
    installConfig: buildInstallConfig(config),
    agentConfig: buildAgentConfig(config),
    additionalManifests,
    kernelArgumentsPreview: additionalManifests['openshift/99-assisted-kernel-arguments.yaml'] || ''
  };
}

/** Extract agent installer config from raw body or nested preflight JSON. */
function extractAgentInstallerInput(body) {
  if (!body || typeof body !== 'object') return {};
  if (body.openshift?.agent_installer && typeof body.openshift.agent_installer === 'object') {
    return body.openshift.agent_installer;
  }
  if (body.agent_installer && typeof body.agent_installer === 'object') {
    return body.agent_installer;
  }
  return body;
}

function buildArchitectHostNode(node, index, machineCidr) {
  const role = node.role === 'worker' ? 'worker' : 'master';
  const hostname = String(node.hostname || `${role}-${index}`).trim() || `${role}-${index}`;
  const ifaceName = String(node.interfaceName || 'eno1').trim() || 'eno1';
  const mac = String(node.macAddress || '').trim();
  const prefix = Number(node.prefixLength) > 0
    ? Number(node.prefixLength)
    : (parseCidr(machineCidr)?.prefix || 24);
  const mode = node.networkMode === 'static' ? 'static' : 'dhcp';
  const primary = {
    type: node.bondEnabled === true ? 'bond' : 'ethernet',
    mode
  };

  if (node.bondEnabled === true) {
    primary.bond = {
      name: String(node.bondName || 'bond0').trim() || 'bond0',
      mode: String(node.bondMode || 'active-backup').trim() || 'active-backup',
      slaves: [
        { name: ifaceName, macAddress: mac },
        {
          name: String(node.secondaryInterfaceName || 'eno2').trim() || 'eno2',
          macAddress: String(node.secondaryMacAddress || '').trim()
        }
      ].filter(s => s.macAddress)
    };
  } else {
    primary.ethernet = { name: ifaceName, macAddress: mac };
  }

  if (mode === 'static' && node.ipAddress) {
    primary.ipv4Cidr = `${node.ipAddress}/${prefix}`;
    if (node.gateway) primary.ipv4Gateway = String(node.gateway).trim();
  }

  const mapped = {
    hostname,
    role,
    primary
  };
  if (node.diskDevice) mapped.rootDevice = String(node.diskDevice).trim();
  return mapped;
}

/**
 * Map Preflight OpenShift agent installer JSON to OpenShift Airgap Architect
 * Bare Metal Agent-Based wizard state (thin adapter — not a UI merge).
 */
function mapPreflightAgentToArchitectState(agentInput) {
  const config = normalizeAgentInstaller(agentInput);
  const versionRaw = String(config.openshift_version || '4.16').trim() || '4.16';
  const channel = versionRaw.includes('.')
    ? versionRaw.split('.').slice(0, 2).join('.')
    : versionRaw;
  const patchVersion = /^\d+\.\d+$/.test(versionRaw) ? `${versionRaw}.0` : versionRaw;
  const now = Date.now();

  const nodes = (config.nodes || []).map((node, index) => (
    buildArchitectHostNode(node, index, config.machine_network_cidr)
  ));

  const mirrorSources = [];
  const disconnected = String(config.disconnected_registry || '').trim();
  if (disconnected) {
    disconnected.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const mirrorMatch = trimmed.match(/mirrors:\s*(\S+)/i);
      const sourceMatch = trimmed.match(/source:\s*(\S+)/i);
      if (sourceMatch) {
        mirrorSources.push({
          source: sourceMatch[1],
          mirrors: mirrorMatch ? [mirrorMatch[1]] : []
        });
      }
    });
  }

  return {
    blueprint: {
      platform: 'Bare Metal',
      arch: 'x86_64',
      baseDomain: config.base_domain || 'example.com',
      clusterName: config.cluster_name || 'ocp-dev',
      version: patchVersion,
      blueprintPullSecretEphemeral: config.pull_secret || '',
      confirmed: true,
      confirmationTimestamp: now
    },
    methodology: {
      method: 'Agent-Based Installer',
      fips: false,
      placeholderValuesEnabled: false
    },
    version: {
      selectedVersion: patchVersion,
      selectedChannel: channel,
      versionConfirmed: true,
      confirmationTimestamp: now,
      manualMinor: '',
      manualPatch: ''
    },
    release: {
      channel,
      patchVersion,
      confirmed: true,
      confirmationTimestamp: now
    },
    globalStrategy: {
      clusterIdentity: {
        clusterName: config.cluster_name || 'ocp-dev',
        baseDomain: config.base_domain || 'example.com'
      },
      networking: {
        machineNetworkV4: config.machine_network_cidr || '192.168.2.0/24',
        clusterNetworkCidr: config.cluster_network_cidr || '10.128.0.0/14',
        clusterNetworkHostPrefix: Number(config.cluster_network_host_prefix) || 24,
        serviceNetworkCidr: config.service_network_cidr || '172.30.0.0/16'
      },
      mirroring: {
        registryFqdn: '',
        sources: mirrorSources
      },
      proxy: {
        httpProxy: config.proxy_http || '',
        httpsProxy: config.proxy_https || '',
        noProxy: config.proxy_no_proxy || ''
      }
    },
    hostInventory: {
      enableIpv6: false,
      apiVip: config.api_vip || '',
      ingressVip: config.ingress_vip || '',
      rendezvousIP: config.rendezvous_ip || '',
      nodes
    },
    credentials: {
      sshPublicKey: config.ssh_public_key || ''
    },
    trust: {
      additionalTrustBundle: config.additional_trust_bundle || ''
    },
    platformConfig: {
      controlPlaneReplicas: nodes.filter(n => n.role === 'master').length || undefined,
      computeReplicas: nodes.filter(n => n.role === 'worker').length || undefined
    },
    operators: {
      selected: []
    },
    imagesetConfig: {},
    exportOptions: {},
    ocMirrorConfig: {},
    // ADO handoff metadata (ignored by Architect generate if unknown)
    adoHandoff: {
      source: 'ado-preflight-ui',
      mappedAt: new Date().toISOString(),
      ntpSources: config.ntp_sources || '',
      bootArtifactsBaseUrl: config.boot_artifacts_base_url || '',
      topology: config.topology || 'ha'
    }
  };
}

function buildOcMirrorImagesetHint(architectState) {
  const channel = architectState?.version?.selectedChannel
    || architectState?.release?.channel
    || '4.16';
  const patch = architectState?.version?.selectedVersion
    || architectState?.release?.patchVersion
    || `${channel}.0`;
  return {
    apiVersion: 'mirror.openshift.io/v2alpha1',
    kind: 'ImageSetConfiguration',
    metadata: {
      name: `ado-preflight-${architectState?.blueprint?.clusterName || 'cluster'}`
    },
    mirror: {
      platform: {
        channels: [
          {
            name: `stable-${channel}`,
            type: 'ocp',
            minVersion: patch,
            maxVersion: patch
          }
        ],
        graph: true
      },
      // Operators expanded by ado-airgap-architect when AIRGAP_ARCHITECT_URL is set.
      operators: []
    },
    hint: {
      platform: 'baremetal',
      installMethod: 'agent',
      ocpVersion: patch,
      note: 'oc-mirror imageset for disconnected install. Preflight owns the form; airgap fills installer pieces.'
    }
  };
}

/** Minimal YAML for ImageSetConfiguration (no js-yaml dependency in preflight). */
function imagesetHintToYaml(hint) {
  const channel = hint?.mirror?.platform?.channels?.[0] || {};
  const name = hint?.metadata?.name || 'ado-preflight-cluster';
  const lines = [
    'apiVersion: mirror.openshift.io/v2alpha1',
    'kind: ImageSetConfiguration',
    'metadata:',
    `  name: ${name}`,
    'mirror:',
    '  platform:',
    '    channels:',
    `    - name: ${channel.name || 'stable-4.16'}`,
    '      type: ocp',
    `      minVersion: ${channel.minVersion || '4.16.0'}`,
    `      maxVersion: ${channel.maxVersion || channel.minVersion || '4.16.0'}`,
    '    graph: true',
    '  operators: []',
    '  additionalImages: []',
    ''
  ];
  return lines.join('\n');
}

function buildLocalAirgapFieldManual(architectState, generated) {
  const cluster = architectState?.blueprint?.clusterName || 'ocp';
  const domain = architectState?.blueprint?.baseDomain || 'example.com';
  const version = architectState?.version?.selectedVersion
    || architectState?.release?.patchVersion
    || '4.16.0';
  return [
    `# ADO Airgap installer pieces — ${cluster}.${domain}`,
    '',
    `OpenShift: ${version}`,
    'Form source: ado-preflight-ui (Agent Installer)',
    'Installer pieces: imageset-config + this manual (+ remote generate when AIRGAP_ARCHITECT_URL is set)',
    '',
    '## Split of responsibility',
    '',
    '- **Preflight UI** — cluster identity, nodes, VIPs, pull secret, SSH, networks (the form).',
    '- **Airgap companion** — disconnected installer assets: oc-mirror imageset, field steps, optional GitLab publish.',
    '',
    '## 1. Mirror (connected jump host)',
    '',
    '```bash',
    'oc mirror --v2 -c imageset-config.yaml --workspace file://./oc-mirror-workspace \\',
    '  docker://registry.example.local/ocp-mirror',
    '```',
    '',
    '## 2. Agent image',
    '',
    'Use preflight-generated `install-config.yaml` + `agent-config.yaml`:',
    '',
    '```bash',
    'openshift-install agent create image --dir .',
    '```',
    '',
    '## 3. Boot + wait',
    '',
    '```bash',
    'openshift-install agent wait-for bootstrap-complete --dir .',
    'openshift-install agent wait-for install-complete --dir .',
    '```',
    '',
    `API VIP: ${architectState?.hostInventory?.apiVip || '(from form)'}`,
    `Ingress VIP: ${architectState?.hostInventory?.ingressVip || '(from form)'}`,
    `Rendezvous: ${architectState?.hostInventory?.rendezvousIP || '(from form)'}`,
    generated?.valid === false ? '' : '',
    ''
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
}

function summarizeArchitectRemoteDiff(localState, remoteResponse) {
  const remoteFiles = remoteResponse?.files || remoteResponse || {};
  const fileNames = remoteFiles && typeof remoteFiles === 'object'
    ? Object.keys(remoteFiles)
    : [];
  return {
    remoteFileCount: fileNames.length,
    remoteFiles: fileNames,
    localCluster: localState?.blueprint?.clusterName || '',
    localVersion: localState?.version?.selectedVersion || localState?.release?.patchVersion || '',
    notes: fileNames.length
      ? 'Airgap companion returned installer piece files (imageset / field manual / YAML).'
      : 'Remote response had no files map; see remote.raw for details.'
  };
}

function postJson(urlString, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      reject(new Error(`Invalid AIRGAP_ARCHITECT_URL: ${err.message}`));
      return;
    }
    const body = JSON.stringify(payload);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json'
        },
        timeout: timeoutMs
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: json
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Architect request timed out after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}

async function mapAirgapArchitectHandoff(body) {
  const agentInput = extractAgentInstallerInput(body);
  const generated = generateAgentInstallerFiles(agentInput);
  const architectState = mapPreflightAgentToArchitectState(
    generated.valid ? normalizeAgentInstaller(agentInput) : agentInput
  );
  const imagesetHint = buildOcMirrorImagesetHint(architectState);

  // Preflight owns the form → install/agent YAML.
  // Airgap fills disconnected installer pieces (imageset + field manual; remote may enrich).
  let imagesetConfigYaml = imagesetHintToYaml(imagesetHint);
  let fieldManual = buildLocalAirgapFieldManual(architectState, generated);

  const result = {
    valid: generated.valid,
    errors: generated.errors || [],
    warnings: [
      ...(generated.warnings || []),
      ...(generated.valid
        ? []
        : ['Agent validation failed; airgap installer pieces still returned for editing.'])
    ],
    mode: 'local',
    role: {
      form: 'ado-preflight-ui',
      installerPieces: 'ado-airgap-architect'
    },
    architectUrl: process.env.AIRGAP_ARCHITECT_URL || null,
    architectState,
    installConfig: generated.installConfig || null,
    agentConfig: generated.agentConfig || null,
    additionalManifests: generated.additionalManifests || {},
    imagesetHint,
    imagesetConfigYaml,
    fieldManual,
    installerPieces: {
      'install-config.yaml': generated.installConfig || '',
      'agent-config.yaml': generated.agentConfig || '',
      'imageset-config.yaml': imagesetConfigYaml,
      'FIELD_MANUAL.md': fieldManual
    },
    remote: null,
    remoteDiffSummary: null
  };

  const baseUrl = String(process.env.AIRGAP_ARCHITECT_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    result.warnings.push(
      'AIRGAP_ARCHITECT_URL unset — using local imageset stub + field manual. '
      + 'Start ado-airgap-architect on :8081 and set AIRGAP_ARCHITECT_URL to enrich installer pieces.'
    );
    return result;
  }

  result.mode = 'remote';
  try {
    const remote = await postJson(`${baseUrl}/api/generate`, { state: architectState });
    result.remote = {
      ok: remote.ok,
      status: remote.status,
      body: remote.body
    };
    result.remoteDiffSummary = summarizeArchitectRemoteDiff(architectState, remote.body);
    if (!remote.ok) {
      result.warnings.push(
        `Airgap companion generate returned HTTP ${remote.status}. Local installer pieces still available.`
      );
    } else {
      const files = remote.body?.files || {};
      // Keep preflight form YAML as source of truth for install/agent.
      // Take disconnected pieces from the companion when present.
      if (files['imageset-config.yaml']) {
        imagesetConfigYaml = files['imageset-config.yaml'];
        result.imagesetConfigYaml = imagesetConfigYaml;
      }
      if (files['FIELD_MANUAL.md']) {
        fieldManual = files['FIELD_MANUAL.md'];
        result.fieldManual = fieldManual;
      }
      result.installerPieces = {
        'install-config.yaml': generated.installConfig || files['install-config.yaml'] || '',
        'agent-config.yaml': generated.agentConfig || files['agent-config.yaml'] || '',
        'imageset-config.yaml': imagesetConfigYaml,
        'FIELD_MANUAL.md': fieldManual,
        ...Object.fromEntries(
          Object.entries(files).filter(([name]) => (
            !['install-config.yaml', 'agent-config.yaml', 'imageset-config.yaml', 'FIELD_MANUAL.md'].includes(name)
          ))
        )
      };
      result.warnings.push(
        `Airgap companion at ${baseUrl} filled installer pieces `
        + `(${Object.keys(result.installerPieces).join(', ')}).`
      );
    }
  } catch (err) {
    result.warnings.push(`Airgap companion generate failed: ${err.message}`);
    result.remote = { ok: false, error: err.message };
  }

  return result;
}

function intToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ].join('.');
}

function remapIpToExample(ip, sourceCidr, exampleNetworkBase = '192.0.2.0', examplePrefix = 24) {
  const value = ipToInt(ip);
  const source = parseCidr(sourceCidr);
  if (value === null || !source) return null;
  const offset = (value - source.network) >>> 0;
  const exampleBase = ipToInt(exampleNetworkBase);
  if (exampleBase === null) return null;
  const hostBits = 32 - examplePrefix;
  const maxHosts = hostBits >= 32 ? 0xffffffff : ((1 << hostBits) >>> 0) - 1;
  const safeOffset = Math.min(offset, maxHosts);
  return intToIp((exampleBase + safeOffset) >>> 0);
}

function exampleMac(index) {
  const n = Number(index) + 1;
  const hex = n.toString(16).padStart(8, '0');
  return `02:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}`;
}

function sanitizeProxyUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return `${url.protocol}//proxy.example.com${url.port ? `:${url.port}` : ''}`;
  } catch {
    return 'http://proxy.example.com:8080';
  }
}

function sanitizeAgentInstallerConfig(config) {
  const source = JSON.parse(JSON.stringify(config || {}));
  const exampleMachineCidr = '192.0.2.0/24';
  const examplePrefix = 24;
  const exampleBase = '192.0.2.0';
  const roleCounts = { master: 0, worker: 0 };

  const sanitized = {
    ...source,
    cluster_name: 'example-cluster',
    base_domain: 'example.com',
    machine_network_cidr: exampleMachineCidr,
    cluster_network_cidr: source.cluster_network_cidr || '10.128.0.0/14',
    service_network_cidr: source.service_network_cidr || '172.30.0.0/16',
    boot_artifacts_base_url: source.boot_artifacts_base_url ? 'http://boot-artifacts.example.com/' : '',
    ntp_sources: source.ntp_sources ? 'ntp.example.com' : '',
    pull_secret: JSON.stringify({
      auths: {
        'cloud.openshift.com': {
          auth: 'REDACTED',
          email: 'redacted@example.com'
        },
        'registry.redhat.io': {
          auth: 'REDACTED',
          email: 'redacted@example.com'
        }
      }
    }, null, 2),
    ssh_public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA redacted@example.com',
    proxy_http: sanitizeProxyUrl(source.proxy_http),
    proxy_https: sanitizeProxyUrl(source.proxy_https),
    proxy_no_proxy: source.proxy_no_proxy
      ? '.example.com,192.0.2.0/24,10.0.0.0/16'
      : '',
    additional_trust_bundle: source.additional_trust_bundle
      ? '-----BEGIN CERTIFICATE-----\nREDACTED_CUSTOMER_CA_BUNDLE\n-----END CERTIFICATE-----\n'
      : '',
    disconnected_registry: source.disconnected_registry
      ? '- source: quay.io/openshift\n  mirrors: registry.example.com/openshift'
      : '',
    kernel_arguments: source.kernel_arguments || '',
    nodes: []
  };

  const usedIps = new Set();
  let nextHostOctet = 30;
  const uniqueExampleIp = preferred => {
    if (preferred && !usedIps.has(preferred)) {
      usedIps.add(preferred);
      return preferred;
    }
    while (nextHostOctet < 250) {
      const candidate = `192.0.2.${nextHostOctet}`;
      nextHostOctet += 1;
      if (!usedIps.has(candidate)) {
        usedIps.add(candidate);
        return candidate;
      }
    }
    return '192.0.2.250';
  };

  sanitized.api_vip = uniqueExampleIp(
    remapIpToExample(source.api_vip, source.machine_network_cidr, exampleBase, examplePrefix) || '192.0.2.20'
  );
  sanitized.ingress_vip = uniqueExampleIp(
    remapIpToExample(source.ingress_vip, source.machine_network_cidr, exampleBase, examplePrefix) || '192.0.2.21'
  );
  sanitized.rendezvous_ip = uniqueExampleIp(
    remapIpToExample(source.rendezvous_ip, source.machine_network_cidr, exampleBase, examplePrefix) || '192.0.2.10'
  );

  sanitized.nodes = (source.nodes || []).map((node, index) => {
    const role = node.role === 'worker' ? 'worker' : 'master';
    roleCounts[role] += 1;
    const hostname = `${role}-${roleCounts[role]}`;
    const remappedIp = node.networkMode === 'static'
      ? uniqueExampleIp(
        remapIpToExample(node.ipAddress, source.machine_network_cidr, exampleBase, examplePrefix)
      )
      : '';

    return {
      ...node,
      hostname,
      macAddress: exampleMac(index * 2),
      secondaryMacAddress: node.bondEnabled ? exampleMac(index * 2 + 1) : '',
      ipAddress: remappedIp,
      gateway: node.networkMode === 'static' ? '192.0.2.1' : '',
      dnsServers: node.networkMode === 'static' ? '192.0.2.53' : '',
      labels: '',
      taints: '',
      interfaceName: node.interfaceName || 'eno1',
      secondaryInterfaceName: node.secondaryInterfaceName || 'eno2',
      bondName: node.bondName || 'bond0',
      bondMode: node.bondMode || 'active-backup'
    };
  });

  return sanitized;
}

function buildSanitizedAgentReadme() {
  return [
    'OpenShift agent installer configs (SANITIZED)',
    '',
    'This ZIP is safe to share for troubleshooting. Customer-identifying values were replaced:',
    '- cluster name / base domain',
    '- hostnames',
    '- MAC addresses',
    '- machine-network IPs / VIPs / gateways / DNS',
    '- pull secret, SSH public key, proxy URLs, CA trust bundle',
    '- disconnected registry mirrors / NTP / boot artifact URLs',
    '- node labels and taints',
    '',
    'Preserved (structure only): topology, roles, interface names, bond settings,',
    'network mode (dhcp/static), disk device hints, kernel arguments, and CIDR shapes',
    'for cluster/service networks when they use default OpenShift ranges.',
    '',
    'Do NOT use these files to install a real cluster. Re-download the normal ZIP',
    'for site deployment.',
    ''
  ].join('\n');
}

function generateSanitizedAgentInstallerFiles(input) {
  const validation = validateAgentInstaller(input);
  if (!validation.valid) return validation;
  const sanitized = sanitizeAgentInstallerConfig(validation.config);
  // Sanitized config uses placeholder secrets that still pass schema checks.
  const sanitizedValidation = validateAgentInstaller(sanitized);
  if (!sanitizedValidation.valid) {
    return {
      valid: false,
      errors: [
        'Failed to build sanitized configs.',
        ...sanitizedValidation.errors
      ],
      warnings: validation.warnings
    };
  }
  const config = sanitizedValidation.config;
  const additionalManifests = buildKernelArgumentManifests(config);
  return {
    valid: true,
    errors: [],
    warnings: [
      ...validation.warnings,
      'Sanitized download redacts customer hostnames, IPs, MACs, secrets, certs, and tokens.'
    ],
    sanitized: true,
    installConfig: buildInstallConfig(config),
    agentConfig: buildAgentConfig(config),
    additionalManifests,
    kernelArgumentsPreview: additionalManifests['openshift/99-assisted-kernel-arguments.yaml'] || '',
    readme: buildSanitizedAgentReadme()
  };
}

const crcTable = (() => {
  const table = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name);
    const dataBuffer = Buffer.from(content);
    const crc = crc32(dataBuffer);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuffer.length, 18);
    local.writeUInt32LE(dataBuffer.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, dataBuffer);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuffer.length, 20);
    central.writeUInt32LE(dataBuffer.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + dataBuffer.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function pruneSelectedPayload(data, selectedComponentApps) {
  const allowedConfig = new Set([
    ...selectedComponentApps,
    ...(Array.isArray(data.components) ? data.components : [])
  ]);
  if (installAapRequested(data)) allowedConfig.add('aap');
  if (
    Array.isArray(data.components)
    && (data.components.includes('all') || data.components.includes('aws'))
  ) {
    allowedConfig.add('aws');
  }
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
    if (allowedConfig.has(component)) {
      componentOptions[component] = options;
    }
  }

  data.component_config = componentConfig;
  data.component_options = componentOptions;

  const keepOpenShiftAuth = installAapFullRequested(data)
    || data?.pre_installs?.openshift_agent_enabled === true
    || allowedConfig.has('openshift');
  if (!keepOpenShiftAuth) {
    delete data.openshift;
  }

  if (!selectedComponentApps.includes('jira') && data.jira) {
    data.jira.enabled = false;
  }

  return data;
}

function configureGitCredentials(repoUrl, token, scmTool = 'gitlab') {
  if (!token) {
    event('No Git token provided; Git push will require existing credentials or anonymous push access');
    return;
  }

  if (usesBearerGitAuth(scmTool)) {
    event(`Configured Bitbucket Bearer token auth for ${new URL(repoUrl).host}`);
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

    const displayArgs = redactGitArgsForLog(args).map(arg => {
      const text = String(arg || '');
      // Avoid dumping multi-hundred-line bash -lc scripts (and their ERROR! strings)
      // into the bootstrap log; keep a short preview for debugging.
      if (text.length > 240 || text.includes('\n')) {
        const preview = text.replace(/\s+/g, ' ').slice(0, 160);
        return `${preview}…[script ${text.length} chars]`;
      }
      return text;
    });
    append(`\n\n$ ${cmd} ${displayArgs.join(' ')}\n`);

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
    bootstrap_hub_update_collection_only: "{{ bootstrap_hub_update_collection_only | default(false) | bool }}"
    bootstrap_generate_env_vars_hub_ado_collection_path: "/workspace/ado-source"

    generate_playbooks: "{{ not (bootstrap_hub_update_collection_only | default(false) | bool) }}"
    generate_aap_configs: "{{ not (bootstrap_hub_update_collection_only | default(false) | bool) }}"
    apply_aap_configs: true
    # Hub-only still applies Hub collection publish + EE push via bootstrap_controller.
    bootstrap_apply_aap_configs: "{{ not (bootstrap_hub_update_collection_only | default(false) | bool) }}"

    bootstrap_generate_playbook_repo_git_mode: "{{ bootstrap_generate_playbook_repo_git_mode | default(generate_playbook_repo_git_mode | default('manual')) }}"
    bootstrap_generate_playbook_repo_git_url: "{{ bootstrap_generate_playbook_repo_git_url | default(generate_playbook_repo_git_url | default('')) }}"
    bootstrap_generate_playbook_repo_git_branch: "{{ bootstrap_generate_playbook_repo_git_branch | default(generate_playbook_repo_git_branch | default(aap_git_branch | default('main'))) }}"
    bootstrap_generate_playbook_repo_git_message: "Generate ADO bootstrap content"
    bootstrap_generate_playbook_repo_write_galaxy_requirements: "{{ bootstrap_generate_playbook_repo_write_galaxy_requirements | default(false) | bool }}"

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
collections_paths = /workspace/collections:./collections:/usr/share/ansible/collections
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

  const useExistingRhelInventory =
    config.patching?.inventory_mode === 'existing'
    || config.rhel?.inventory_mode === 'existing'
    || config.patching?.use_existing_inventory === true
    || config.rhel?.use_existing_inventory === true;
  const existingRhelInventoryName = cleanYamlName(
    config.patching?.inventory_name
    || config.rhel?.inventory_name
    || config.rhel?.existing_inventory_name
    || ''
  );

  if (
    selected.has('rhel')
    || selected.has('patching')
    || config.satellite?.dynamic_inventory_enabled
  ) {
    if (useExistingRhelInventory && existingRhelInventoryName) {
      add(inventories, existingRhelInventoryName);
    } else if (!useExistingRhelInventory) {
      add(inventories, `${org}-RHEL-Inventory`);
    }
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

  const rhelHosts = [
    config.rhel?.hostname,
    ...(Array.isArray(config.rhel?.hosts) ? config.rhel.hosts : []),
    ...((!useExistingRhelInventory && selected.has('patching'))
      ? [config.patching?.hostname, ...(Array.isArray(config.patching?.hosts) ? config.patching.hosts : [])]
      : [])
  ];
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

function buildBootstrapRecap(data, repoDir, selectedComponentApps) {
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
    `AAP Version: ${aapDottedVersion(
      installAapRequested(data)
        ? (data?.component_config?.aap?.deployment_version || data?.aap?.version)
        : data?.aap?.version
    )}`,
    `Install AAP during bootstrap: ${installAapFullRequested(data) ? 'yes' : 'no'}`,
    `Attach AAP license during bootstrap: ${attachAapLicenseRequested(data) ? 'yes' : 'no'}`,
    ...(installAapFullRequested(data)
      ? [
          `AAP operator scope: ${
            data?.component_config?.aap?.operator_scope === 'namespaced'
              ? 'namespaced'
              : 'all_namespaces'
          }`
        ]
      : []),
    `Configure Contoller (Using AAP): ${data?.aap?.enabled !== false && !installAapFullRequested(data) ? 'yes' : 'no'}`,
    `Organization: ${data?.aap?.organization || 'not configured'}`,
    `Project Name: ${projectName}`,
    `AAP Hub collection update: ${data?.aap?.hub_publish_ado_collection ? 'yes' : 'no'}`,
    `AAP Hub/Galaxy requirements.yml: ${
      data?.aap?.hub_publish_ado_collection
        ? 'written (Hub/Galaxy names)'
        : 'local type:dir for vendored infra.ado (org must already have Galaxy creds, or use ADO EE)'
    }`,
    `AAP Hub force update: ${data?.aap?.hub_force_ado_collection_update ? 'yes' : 'no'}`,
    `AAP standalone run: ${aapStandaloneRun(data) ? 'yes (AAP tabs only — skip component playbooks/full Contoller scaffolding)' : 'no'}`,
    `AAP Hub hostname: ${data?.aap?.hub_hostname || data?.hub?.hostname || 'defaults to AAP hostname'}`,
    `AAP Hub repository target: ${data?.aap?.hub_publish_ado_collection ? 'validated' : 'not requested'}`,
    `AAP Hub EE push: ${data?.aap?.hub_push_ee ? 'yes' : 'no (optional; default off)'}`,
    ...(data?.aap?.hub_push_ee
      ? [
          `AAP Hub EE registry: ${data?.aap?.hub_ee_registry || data?.aap?.hub_hostname || 'defaults to AAP hostname'}`,
          `AAP Hub EE pull from remote: ${data?.aap?.hub_ee_pull ? 'yes (ghcr/remote)' : 'no (local image only)'}`,
          `AAP Hub EE source: ${data?.aap?.hub_ee_source_image || '(unset)'}`
        ]
      : []),
    `AAP Galaxy credentials setup: ${data?.aap?.galaxy_setup_enabled ? 'yes' : 'no (optional; default off)'}`,
    `Git SSL verify: ${data?.git?.skip_tls_verify === false ? 'enabled' : 'disabled (default)'}`
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
  lines.push('');

  return lines.join('\n');
}

const RHBK_ZIP_MAX_BYTES = 512 * 1024 * 1024;
const rhbkZipUploadDir = path.join(workRoot, 'uploads', 'rhbk-standalone');

function safeRhbkZipName(raw) {
  const base = path.basename(String(raw || 'rhbk.zip'))
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  const name = base || 'rhbk.zip';
  return name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`;
}

function isRhbkZipUploadPath(candidate) {
  const resolved = path.resolve(String(candidate || ''));
  const root = `${path.resolve(rhbkZipUploadDir)}${path.sep}`;
  return resolved.startsWith(root) && resolved.toLowerCase().endsWith('.zip');
}

app.post('/api/rhbk-standalone-zip', (req, res) => {
  const filename = safeRhbkZipName(req.get('X-Filename') || req.get('x-filename'));
  fs.mkdirSync(rhbkZipUploadDir, { recursive: true });
  const dest = path.join(rhbkZipUploadDir, filename);
  const tmp = `${dest}.partial`;
  let bytes = 0;
  let tooLarge = false;
  const out = fs.createWriteStream(tmp);
  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > RHBK_ZIP_MAX_BYTES && !tooLarge) {
      tooLarge = true;
      req.destroy();
      out.destroy();
      fs.unlink(tmp, () => {});
      if (!res.headersSent) {
        res.status(413).json({ error: 'RHBK zip exceeds 512MB' });
      }
    }
  });
  req.pipe(out);
  out.on('error', err => {
    fs.unlink(tmp, () => {});
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to stage RHBK zip' });
    }
  });
  out.on('finish', () => {
    if (tooLarge || res.headersSent) return;
    try {
      fs.renameSync(tmp, dest);
      res.json({
        filename,
        upload_path: dest,
        repo_path: `files/${filename}`
      });
    } catch (err) {
      fs.unlink(tmp, () => {});
      res.status(500).json({ error: err.message || 'Failed to store RHBK zip' });
    }
  });
});

app.delete('/api/rhbk-standalone-zip', (req, res) => {
  const candidate = req.body?.upload_path;
  if (!isRhbkZipUploadPath(candidate)) {
    return res.status(400).json({ error: 'Invalid upload path' });
  }
  fs.unlink(candidate, () => res.json({ ok: true }));
});

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

app.post('/api/openshift/storageclasses', async (req, res) => {
  const apiHost = String(req.body?.api_host || req.body?.host || '').trim();
  const token = String(req.body?.token || req.body?.api_key || '').trim();
  const skipTls = req.body?.skip_tls_verify !== false;
  if (!apiHost || !token) {
    res.status(400).json({
      error: 'OpenShift API host and token are required to list storage classes.'
    });
    return;
  }

  try {
    const body = await openshiftApiGetJson(
      apiHost,
      token,
      '/apis/storage.k8s.io/v1/storageclasses',
      skipTls
    );
    const storageClasses = parseOpenShiftStorageClasses(body);
    event(`Listed ${storageClasses.length} OpenShift storage classes`);
    res.json({ storageClasses });
  } catch (err) {
    event(`Failed listing OpenShift storage classes: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/openshift-agent/validate', (req, res) => {
  const validation = validateAgentInstaller(req.body);
  res.json({
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings
  });
});

app.post('/api/openshift-agent/generate', (req, res) => {
  const result = generateAgentInstallerFiles(req.body);
  res.status(result.valid ? 200 : 400).json(result);
});

app.post('/api/openshift-agent/download', (req, res) => {
  const result = generateAgentInstallerFiles(req.body);
  if (!result.valid) {
    res.status(400).json(result);
    return;
  }

  const zip = createZip({
    'install-config.yaml': result.installConfig,
    'agent-config.yaml': result.agentConfig,
    ...(result.additionalManifests || {})
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="openshift-agent-configs.zip"');
  res.send(zip);
});

app.post('/api/openshift-agent/download-sanitized', (req, res) => {
  const result = generateSanitizedAgentInstallerFiles(req.body);
  if (!result.valid) {
    res.status(400).json(result);
    return;
  }

  const zip = createZip({
    'README-SANITIZED.txt': result.readme,
    'install-config.yaml': result.installConfig,
    'agent-config.yaml': result.agentConfig,
    ...(result.additionalManifests || {})
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="openshift-agent-configs-sanitized.zip"'
  );
  res.send(zip);
});

app.post('/api/openshift-agent/sanitize-profile', (req, res) => {
  const validation = validateAgentInstaller(req.body || {});
  if (!validation.valid) {
    res.status(400).json(validation);
    return;
  }

  const sanitized = sanitizeAgentInstallerConfig(validation.config);
  const name = String(
    sanitized.profile_name || sanitized.cluster_name || 'example-cluster'
  ).trim() || 'example-cluster';

  res.json({
    valid: true,
    errors: [],
    warnings: [
      'Sanitized profile redacts customer hostnames, IPs, MACs, secrets, certs, and tokens.'
    ],
    profile: {
      kind: 'ado-agent-installer-profile',
      version: 1,
      sanitized: true,
      name: `${name}-sanitized`,
      exported_at: new Date().toISOString(),
      config: {
        ...sanitized,
        profile_name: `${name}-sanitized`
      }
    }
  });
});

app.post('/api/airgap-architect/map', async (req, res) => {
  try {
    const result = await mapAirgapArchitectHandoff(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    event(`Airgap Architect map failed: ${err.message}`);
    res.status(500).json({
      valid: false,
      errors: [err.message],
      warnings: []
    });
  }
});

app.post('/api/aap-ping', async (req, res) => {
  try {
    const data = req.body || {};
    const result = await pingAapController(data);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/keycloak/realm-public-key', async (req, res) => {
  try {
    const body = req.body || {};
    const oidc = body.aap?.auth?.keycloak_oidc || body.keycloak_oidc || body;
    const skipTls = body.skip_tls_verify === true
      || body.aap?.skip_tls_verify === true;
    const result = await fetchKeycloakRealmPublicKey({
      authorizationUrl: oidc.authorization_url || body.authorization_url,
      accessTokenUrl: oidc.access_token_url || body.access_token_url,
      skipTlsVerify: skipTls
    });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
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
  const aapEnabled = data?.aap?.enabled !== false;
  const installAapDuringBootstrap = installAapFullRequested(data);
  const attachAapLicenseDuringBootstrap = attachAapLicenseRequested(data);
  // License-only attach must not skip Using AAP / controller configuration.
  const configureAap = aapEnabled && !installAapDuringBootstrap;

  const standaloneRun = aapStandaloneRun(data);
  const hubUpdateCollectionOnly = standaloneRun;
  const hubPublishRequested = aapEnabled && data?.aap?.hub_publish_ado_collection === true;
  const hubPushEeRequested = aapEnabled && data?.aap?.hub_push_ee === true;
  const gatewayAuthRequested = aapAuthConfigRequested(data);
  const hasAapOAuthToken = Boolean(String(data?.aap?.oauth_token || '').trim());
  const hasAapPasswordAuth = Boolean(
    String(data?.aap?.admin_username || '').trim()
    && String(data?.aap?.admin_password || '').trim()
  );

  if (standaloneRun && !aapStandaloneWorkSelected(data)) {
    event('Bootstrap failed: Standalone AAP run needs at least one AAP tab enabled');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error:
        'Standalone AAP run is enabled on General, but no AAP tab work is selected. '
        + 'Enable Install AAP, License, Hub, Galaxy, or Add authentication options, or turn off Standalone.'
    });
  }

  if ((hubPublishRequested || hubPushEeRequested || hubUpdateCollectionOnly)
    && !String(data?.aap?.hostname || '').trim()) {
    event('Bootstrap failed: Hub work needs General → AAP Hostname URL');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error:
        'Hub collection/EE updates require General → AAP Hostname URL (and Admin password or OAuth token).'
    });
  }

  if ((hubPublishRequested || hubPushEeRequested || hubUpdateCollectionOnly)
    && !String(data?.aap?.hub_hostname || data?.hub?.hostname || '').trim()
    && !hostnameFromUrl(data?.aap?.hostname)) {
    event('Bootstrap failed: Hub work needs Hub hostname');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error:
        'Hub-only / Hub collection/EE updates require Hub hostname on the Hub tab '
        + '(defaults from General → AAP Hostname URL).'
    });
  }

  if (hubPublishRequested && !hasAapOAuthToken && !hasAapPasswordAuth) {
    event('Bootstrap failed: AAP Hub publishing needs AAP OAuth token or admin username/password');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error: 'AAP Hub publishing requires an AAP OAuth Token or Admin Username and Admin Password.'
    });
  }

  if (aapEnabled && !hubPublishRequested) {
    event('Note: Hub collection update is off (optional). Contoller will use whatever infra.ado is already on Hub.');
  }

  const keycloakOidcEnabled = data?.aap?.auth?.keycloak_oidc?.enabled === true;
  if (keycloakOidcEnabled) {
    const oidc = data.aap.auth.keycloak_oidc || {};
    const missing = [];
    if (!String(oidc.key || '').trim()) missing.push('Client ID (KEY)');
    if (!String(oidc.secret || '').trim()) missing.push('Client secret');
    if (!String(oidc.access_token_url || '').trim()) missing.push('Access token URL');
    if (!String(oidc.authorization_url || '').trim()) missing.push('Authorization URL');
    if (!String(oidc.public_key || '').trim()) missing.push('Realm public key (RS256 from Keycloak → Realm Settings → Keys)');
    if (missing.length > 0) {
      event(`Bootstrap failed: Keycloak OIDC missing required fields: ${missing.join(', ')}`);
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error:
          `Keycloak OIDC is enabled but missing: ${missing.join(', ')}. `
          + 'Fill these on Add authentication → Keycloak before Run Bootstrap.'
      });
    }
    if (!hasAapOAuthToken && !hasAapPasswordAuth) {
      event('Bootstrap failed: Keycloak OIDC apply needs AAP OAuth token or admin username/password');
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error:
          'Keycloak OIDC configuration requires General → AAP admin credentials '
          + '(OAuth token or username/password) so bootstrap can apply Gateway authenticators.'
      });
    }
  }

  if (aapOnboardRequested(data) && !keycloakOidcEnabled) {
    event('Bootstrap failed: Onboard tenants require Keycloak OIDC on Add authentication');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error:
        'Onboard tenant organizations require Keycloak OIDC (Add authentication → Keycloak). '
        + 'Enable and configure OIDC, then add tenants on the Onboard tab.'
    });
  }

  if (aapOnboardRequested(data)) {
    const invalidTenants = activeOnboardTenants(data.aap).filter((tenant) => {
      const missing = [];
      if (!String(tenant.admin_groups || '').trim()) missing.push('admin Keycloak group(s)');
      if (!String(tenant.developer_groups || '').trim()) missing.push('developer Keycloak group(s)');
      tenant.__missing = missing;
      return missing.length > 0;
    });
    if (invalidTenants.length > 0) {
      const detail = invalidTenants
        .map(t => `${t.organization || 'tenant'} (${t.__missing.join(', ')})`)
        .join('; ');
      event(`Bootstrap failed: Onboard tenants missing required fields: ${detail}`);
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error: `Onboard tenants missing required fields: ${detail}`
      });
    }
  }

  if (onboardKeycloakGroupsRequested(data.aap)) {
    const kc = data.aap.onboard.keycloak || {};
    const missing = [];
    if (!String(kc.base_url || '').trim()) missing.push('Keycloak base URL');
    if (!String(kc.realm || '').trim()) missing.push('Keycloak realm');
    if (!String(kc.admin_username || '').trim()) missing.push('Keycloak admin username');
    if (!String(kc.admin_password || '').trim()) missing.push('Keycloak admin password');
    if (missing.length > 0) {
      event(`Bootstrap failed: Onboard Keycloak missing: ${missing.join(', ')}`);
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error:
          `Onboard → Keycloak group creation requires: ${missing.join(', ')}. `
          + 'Fill these on the Onboard tab or disable Create Keycloak groups.'
      });
    }
  }

  if (aapAuthConfigRequested(data) && !hasAnsiblePlatformCollection()) {
    event('Bootstrap failed: ansible.platform collection tarball missing (required for Add authentication)');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error:
        'Add authentication requires the ansible.platform collection (ansible-platform-*.tar.gz) '
        + 'in the preflight UI image. Rebuild the container so /opt/ado-collections includes it.'
    });
  }

  if (hubPushEeRequested && !hasAapOAuthToken && !hasAapPasswordAuth) {
    event('Bootstrap failed: AAP Hub EE push needs AAP OAuth token or admin username/password');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error: 'AAP Hub EE push requires an AAP OAuth Token or Admin Username and Admin Password.'
    });
  }

  if (hubPushEeRequested && !String(data?.aap?.hub_ee_source_image || '').trim()) {
    event('Bootstrap failed: AAP Hub EE push needs a source image');
    return res.status(400).json({
      status: 'failed',
      exitCode: 2,
      error: 'AAP Hub EE push requires a source image (aap.hub_ee_source_image).'
    });
  }

  if (installAapDuringBootstrap) {
    const hasOcToken = Boolean(String(data?.openshift?.token || '').trim());
    const hasOcKubeconfig = Boolean(String(data?.openshift?.kubeconfig_content || '').trim());
    const hasOcApiHost = Boolean(String(data?.openshift?.api_host || '').trim());
    if (!hasOcKubeconfig && !(hasOcToken && hasOcApiHost)) {
      event('Bootstrap failed: Install AAP needs OpenShift API host + token (or kubeconfig)');
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error: 'Install AAP is enabled, so OpenShift API host and token (or kubeconfig) are required. Uncheck Install AAP on the Install / Run tab if you only want to configure an existing Contoller (patching / Satellite / IdM).'
      });
    }
  }

  const selectedComponents = hubUpdateCollectionOnly
    ? 'hub_update'
    : (
      Array.isArray(data.components) && data.components.length > 0
        ? data.components.join(',')
        : (data.component || '')
    );

  const selectedComponentApps = selectedComponentAppsFrom(data);
  data.selected_component_apps = selectedComponentApps;
  pruneSelectedPayload(data, selectedComponentApps);
  latestDebug.normalizedPayload = redactSecrets(data);
  latestDebug.selectedComponents = selectedComponents;
  latestDebug.selectedComponentApps = selectedComponentApps;

  const autoGitPush = data?.git?.auto_push !== false;
  const overwriteGenerated = data?.git?.overwrite_generated === true;
  const ansibleVerbosity = normalizeVerbosity(data?.ansible?.verbosity ?? data?.verbosity ?? 0);
  const ansibleVerbosityFlag = verbosityFlag(ansibleVerbosity);
  const ansibleExtraArgsRaw = String(data?.ansible?.extra_args || '').trim();
  const ansibleExtraArgsShell = formatAnsibleExtraArgsForShell(ansibleExtraArgsRaw);
  const skipTlsVerify = data?.aap?.skip_tls_verify === true;
  const gitSkipTlsVerify = data?.git?.skip_tls_verify !== false;
  const encryptVaultFiles = data?.vault?.encrypt !== false;
  const bootstrapEnv = buildAnsibleEnv(skipTlsVerify, gitSkipTlsVerify);

  append(`\nSelected Components: ${selectedComponents}\n`);
  append(`Selected Component Apps: ${selectedComponentApps.join(',')}\n`);
  append(`Auto Git Push: ${autoGitPush}\n`);
  append(`Overwrite Generated Content: ${overwriteGenerated}\n`);
  append(`Additional Environments: ${(data.additional_environments || []).join(' ') || 'none'}\n`);
  append(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}\n`);
  append(`Ansible Extra Args: ${ansibleExtraArgsRaw || '(none)'}\n`);
  append(`Skip TLS Verification: ${skipTlsVerify}\n`);
  append(`Git Skip TLS/SSL Verification: ${gitSkipTlsVerify}\n`);
  append(`AAP Enabled: ${aapEnabled}\n`);
  append(`Install AAP during bootstrap: ${installAapDuringBootstrap}\n`);
  append(`Attach AAP license during bootstrap: ${attachAapLicenseDuringBootstrap}\n`);
  append(`Configure Contoller (Using AAP): ${configureAap}\n`);
  append(`Encrypt Vault Files: ${encryptVaultFiles}\n`);

  event(`Selected components: ${selectedComponents}`);
  event(`Selected component apps: ${selectedComponentApps.join(',')}`);
  event(`Auto Git Push: ${autoGitPush}`);
  event(`Overwrite Generated Content: ${overwriteGenerated}`);
  event(`Additional Environments: ${(data.additional_environments || []).join(' ') || 'none'}`);
  event(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}`);
  event(`Ansible Extra Args: ${ansibleExtraArgsRaw || '(none)'}`);
  event(`Skip TLS Verification: ${skipTlsVerify}`);
  event(`Git Skip TLS/SSL Verification: ${gitSkipTlsVerify}`);
  event(`AAP Enabled: ${aapEnabled}`);
  event(`Install AAP during bootstrap: ${installAapDuringBootstrap}`);
  event(`Attach AAP license during bootstrap: ${attachAapLicenseDuringBootstrap}`);
  event(`Configure Contoller (Using AAP): ${configureAap}`);
  event(`Encrypt vault files: ${encryptVaultFiles}`);

  const willTalkToAap = configureAap
    || hubPublishRequested
    || hubPushEeRequested
    || hubUpdateCollectionOnly;
  if (willTalkToAap && String(data?.aap?.hostname || '').trim()) {
    event('Testing AAP controller connectivity');
    try {
      const ping = await pingAapController(data);
      event(`AAP ping ok: ${ping.url}`);
      append(`AAP ping ok: ${ping.url}\n`);
    } catch (err) {
      event(`Bootstrap failed: AAP connectivity test: ${err.message}`);
      return res.status(400).json({
        status: 'failed',
        exitCode: 2,
        error: `AAP connectivity test failed: ${err.message}`
      });
    }
  }

  const scmTool = String(data?.scm_tool || 'gitlab').trim().toLowerCase();
  const gitUsesBearerAuth = usesBearerGitAuth(scmTool);

  configureGitCredentials(repoUrl, gitToken, scmTool);

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

  const collectionInstallScript = path.join(workRoot, 'install-collections.sh');
  const stageAdoSourceScript = path.join(workRoot, 'stage-ado-source.py');
  const collectionInstallBody = `#!/bin/bash
set -euo pipefail

COLLECTION_DIR="${collectionDir}"
HUB_PUBLISH="${hubPublishRequested ? 'true' : 'false'}"
GATEWAY_AUTH="${gatewayAuthRequested ? 'true' : 'false'}"

rm -rf /workspace/collections
mkdir -p /workspace/collections

echo ""
echo "=== Available Collection Tarballs ==="
ls -l "$COLLECTION_DIR" || true

echo ""
echo "=== Installing ADO Collection ==="
ado_archive="$(find "$COLLECTION_DIR" -maxdepth 1 -name 'infra-ado-*.tar.gz' | sort -V | tail -n 1)"
if [ -z "$ado_archive" ]; then
  legacy_archive="$(find "$COLLECTION_DIR" -maxdepth 1 -name 'ado-*.tar.gz' | sort -V | tail -n 1)"
  if [ -z "$legacy_archive" ]; then
    echo "ERROR: No infra-ado or legacy ado collection tarball found in $COLLECTION_DIR."
    exit 1
  fi
  echo "Installing $legacy_archive"
  ansible-galaxy collection install "$legacy_archive" -p /workspace/collections --force --no-deps
else
  echo "Installing $ado_archive"
  ansible-galaxy collection install "$ado_archive" -p /workspace/collections --force --no-deps
  if [ "$HUB_PUBLISH" = "true" ]; then
    echo ""
    echo "=== Staging ADO collection source for Hub publishing ==="
    rm -rf /workspace/ado-source
    mkdir -p /workspace/ado-source
    tar -xzf "$ado_archive" -C /workspace/ado-source
    python3 "${stageAdoSourceScript}"
  else
    echo "Skipping ADO source staging (Hub collection update not requested)."
    rm -rf /workspace/ado-source
  fi
fi

echo ""
echo "=== Installing ansible.controller Collection ==="
ansible-galaxy collection install "$COLLECTION_DIR"/ansible-controller-*.tar.gz -p /workspace/collections --force

echo ""
echo "=== Installing awx.awx Collection ==="
if ls "$COLLECTION_DIR"/awx-awx-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/awx-awx-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "awx-awx tarball not found; skipping"
fi

echo ""
echo "=== Installing infra.controller_configuration Collection ==="
ansible-galaxy collection install "$COLLECTION_DIR"/infra-controller_configuration-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installing infra.aap_configuration Collection ==="
ansible-galaxy collection install "$COLLECTION_DIR"/infra-aap_configuration-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installing ansible.platform Collection ==="
if ls "$COLLECTION_DIR"/ansible-platform-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/ansible-platform-*.tar.gz -p /workspace/collections --force --no-deps
else
  if [ "$GATEWAY_AUTH" = "true" ]; then
    echo "ERROR: ansible-platform tarball required for Add authentication but not found in $COLLECTION_DIR." >&2
    exit 1
  fi
  echo "ansible-platform tarball not found; skipping"
fi

echo ""
echo "=== Installing ansible.hub Collection ==="
if ls "$COLLECTION_DIR"/ansible-hub-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/ansible-hub-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "ansible-hub tarball not found; skipping"
fi

echo ""
echo "=== Installing kubernetes.core Collection ==="
if ls "$COLLECTION_DIR"/kubernetes-core-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/kubernetes-core-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "kubernetes-core tarball not found in $COLLECTION_DIR (required for Install AAP / OpenShift)" >&2
  exit 1
fi

echo ""
echo "=== Installing redhat.openshift Collection ==="
if ls "$COLLECTION_DIR"/redhat-openshift-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/redhat-openshift-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "redhat-openshift tarball not found in $COLLECTION_DIR (required for Install AAP / OpenShift)" >&2
  exit 1
fi

echo ""
echo "=== Installing community.general Collection ==="
if ls "$COLLECTION_DIR"/community-general-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/community-general-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "community-general tarball not found; skipping"
fi

echo ""
echo "=== Installing containers.podman Collection ==="
if ls "$COLLECTION_DIR"/containers-podman-*.tar.gz >/dev/null 2>&1; then
  ansible-galaxy collection install "$COLLECTION_DIR"/containers-podman-*.tar.gz -p /workspace/collections --force --no-deps
else
  echo "containers-podman tarball not found; skipping"
fi

echo ""
echo "=== Overlay disconnected Hub EE push tasks (baked docker-archive) ==="
PUSH_EE_SRC="\${PUSH_HUB_EE_OVERLAY:-/opt/ado-ee/push_hub_ee.yml}"
if [ -f "\$PUSH_EE_SRC" ]; then
  find /workspace/collections -type f -name 'push_hub_ee.yml' -print -exec cp -f "\$PUSH_EE_SRC" {} \\;
else
  echo "WARN: \$PUSH_EE_SRC missing — Hub EE push may require registry pull"
fi

echo "=== Overlay hub-only Contoller org create (apply_aap_25_plus) ==="
APPLY_AAP_SRC="\${APPLY_AAP_25_PLUS_OVERLAY:-/opt/ado-ee/apply_aap_25_plus.yml}"
SKIP_EE_SRC="\${SKIP_EXISTING_EE_OVERLAY:-/opt/ado-ee/skip_existing_execution_environments.yml}"
if [ -f "\$APPLY_AAP_SRC" ]; then
  find /workspace/collections -type f -name 'apply_aap_25_plus.yml' -print -exec cp -f "\$APPLY_AAP_SRC" {} \\;
else
  echo "WARN: \$APPLY_AAP_SRC missing — hub-only may skip Contoller org create"
fi
if [ -f "\$SKIP_EE_SRC" ]; then
  find /workspace/collections -type d -path '*/infra/ado/roles/bootstrap_controller/tasks' -print -exec cp -f "\$SKIP_EE_SRC" {}/skip_existing_execution_environments.yml \\;
else
  echo "WARN: \$SKIP_EE_SRC missing — existing EE PATCH 403 may stop bootstrap"
fi

echo "=== Overlay AAP smoke test (non-fatal demo JT launch) ==="
SMOKE_TEST_SRC="\${RUN_SMOKE_TEST_OVERLAY:-/opt/ado-ee/run_smoke_test.yml}"
if [ -f "\$SMOKE_TEST_SRC" ]; then
  find /workspace/collections -type f -name 'run_smoke_test.yml' -print -exec cp -f "\$SMOKE_TEST_SRC" {} \\;
else
  echo "WARN: \$SMOKE_TEST_SRC missing — broken Demo JT may fail bootstrap at smoke test"
fi

echo "=== Overlay Galaxy/Hub credentials apply (hub-only) ==="
APPLY_GALAXY_SRC="\${APPLY_GALAXY_HUB_CREDS_OVERLAY:-/opt/ado-ee/apply_galaxy_hub_credentials.yml}"
if [ -f "\$APPLY_GALAXY_SRC" ]; then
  find /workspace/collections -type f -name 'apply_galaxy_hub_credentials.yml' -print -exec cp -f "\$APPLY_GALAXY_SRC" {} \\;
  # Ensure file exists even if older collection tarball lacked it
  DEST_DIR=\$(find /workspace/collections -type d -path '*/infra/ado/roles/bootstrap_controller/tasks' | head -n 1)
  if [ -n "\$DEST_DIR" ] && [ ! -f "\$DEST_DIR/apply_galaxy_hub_credentials.yml" ]; then
    cp -f "\$APPLY_GALAXY_SRC" "\$DEST_DIR/apply_galaxy_hub_credentials.yml"
    echo "\$DEST_DIR/apply_galaxy_hub_credentials.yml"
  fi
else
  echo "WARN: \$APPLY_GALAXY_SRC missing — hub-only may skip Galaxy credential apply"
fi

echo "=== Overlay Gateway auth apply (prefer admin basic auth) ==="
APPLY_GATEWAY_AUTH_SRC="\${APPLY_GATEWAY_AUTH_OVERLAY:-/opt/ado-ee/apply_gateway_auth.yml}"
if [ -f "\$APPLY_GATEWAY_AUTH_SRC" ]; then
  find /workspace/collections -type f -name 'apply_gateway_auth.yml' -print -exec cp -f "\$APPLY_GATEWAY_AUTH_SRC" {} \\;
else
  echo "WARN: \$APPLY_GATEWAY_AUTH_SRC missing — Gateway auth may fail with Controller OAuth token"
fi

echo "=== Overlay gateway_authenticators (disable async for ansible.platform 2.7) ==="
GATEWAY_AUTH_SRC="\${GATEWAY_AUTHENTICATORS_OVERLAY:-/opt/ado-ee/gateway_authenticators_main.yml}"
GATEWAY_MAPS_SRC="\${GATEWAY_AUTHENTICATOR_MAPS_OVERLAY:-/opt/ado-ee/gateway_authenticator_maps_main.yml}"
if [ -f "\$GATEWAY_AUTH_SRC" ]; then
  find /workspace/collections -path '*/infra/aap_configuration/roles/gateway_authenticators/tasks/main.yml' -print -exec cp -f "\$GATEWAY_AUTH_SRC" {} \\;
else
  echo "WARN: \$GATEWAY_AUTH_SRC missing — Gateway authenticator apply may fail (async unsupported)"
fi
if [ -f "\$GATEWAY_MAPS_SRC" ]; then
  find /workspace/collections -path '*/infra/aap_configuration/roles/gateway_authenticator_maps/tasks/main.yml' -print -exec cp -f "\$GATEWAY_MAPS_SRC" {} \\;
else
  echo "WARN: \$GATEWAY_MAPS_SRC missing — Gateway authenticator map apply may fail (async unsupported)"
fi

echo ""
echo "=== Collection install complete ==="
ansible-galaxy collection list
`;

  const stageAdoSourceBody = `import json
from pathlib import Path

source = Path('/workspace/ado-source')
manifest = json.loads((source / 'MANIFEST.json').read_text())
info = manifest.get('collection_info', {})

def q(value):
    return '"' + str(value).replace('"', '\\\\"') + '"'

lines = [
    '---',
    f"namespace: {q(info.get('namespace', 'infra'))}",
    f"name: {q(info.get('name', 'ado'))}",
    f"version: {info.get('version', '1.0.0')}",
    f"readme: {info.get('readme', 'README.md')}",
    'authors:',
]
for author in info.get('authors') or ['Automation Development Office']:
    lines.append(f"  - {q(author)}")
lines.extend([
    'description: >-',
    f"  {info.get('description', 'Automation Development Office collection.')}",
])
if info.get('license_file'):
    lines.append(f"license_file: {info['license_file']}")
elif info.get('license'):
    lines.append('license:')
    for license_name in info['license']:
        lines.append(f"  - {q(license_name)}")
if info.get('tags'):
    lines.append('tags:')
    for tag in info['tags']:
        lines.append(f"  - {tag}")
lines.append('dependencies:')
deps = info.get('dependencies') or {}
if deps:
    for name, version in deps.items():
        lines.append(f"  {q(name)}: {q(version)}")
else:
    lines.append('  {}')
for key in ('repository', 'documentation', 'homepage', 'issues'):
    if info.get(key):
        lines.append(f"{key}: {info[key]}")
(source / 'galaxy.yml').write_text('\\n'.join(lines) + '\\n')
for generated_file in ('MANIFEST.json', 'FILES.json'):
    generated_path = source / generated_file
    if generated_path.exists():
        generated_path.unlink()
`;

  fs.writeFileSync(collectionInstallScript, collectionInstallBody, { mode: 0o755 });
  fs.writeFileSync(stageAdoSourceScript, stageAdoSourceBody);
  const collectionInstallCode = await runStream(
    'bash',
    [collectionInstallScript],
    workRoot,
    'Installing collections'
  );

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

  if (!gitUsesBearerAuth) {
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
  }

  const cloneArgs = buildGitCloneArgs({
    repoUrl,
    branch: data.aap.git_branch,
    repoDir,
    token: gitToken,
    scmTool,
    gitSkipTlsVerify
  });

  const cloneCode = await runStream(
    'git',
    cloneArgs,
    workRoot,
    gitUsesBearerAuth
      ? 'Cloning Git repository with Authorization Bearer header'
      : 'Cloning Git repository',
    buildAnsibleEnv(skipTlsVerify, gitSkipTlsVerify)
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

  if (gitUsesBearerAuth && gitToken) {
    await runStream(
      'git',
      ['config', '--local', 'http.extraHeader', gitBearerExtraHeader(gitToken)],
      repoDir,
      'Configuring local Bitbucket Bearer auth for push'
    );
  }

  ensureStarterFiles(repoDir, envName);

  // Playbook-adjacent collections/ wins over ANSIBLE_COLLECTIONS_PATH in Ansible
  // 2.15+, so a vendored infra.ado from git would shadow the bootstrap tarball.
  const vendoredAdo = path.join(repoDir, 'collections', 'ansible_collections', 'infra', 'ado');
  if (fs.existsSync(vendoredAdo)) {
    event(`Removing vendored infra.ado that shadows bootstrap collection: ${vendoredAdo}`);
    fs.rmSync(vendoredAdo, { recursive: true, force: true });
  }

  event(`Writing preflight JSON ${preflightFile}`);
  fs.writeFileSync(preflightPath, JSON.stringify(data, null, 2));

  event('Writing ado-extra-vars.json for debug only; not passed to Ansible');
  fs.writeFileSync(extraVarsPath, JSON.stringify({
    component: selectedComponents,
    components: data.components || [],
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
    git_overwrite_generated: overwriteGenerated,
    git_skip_tls_verify: gitSkipTlsVerify,
    scm_tool: scmTool,
    git_auth_mode: gitUsesBearerAuth ? 'bearer' : 'basic',
    aap_enabled: configureAap,
    skip_tls_verify: skipTlsVerify,
    ansible_tls_verify: skipTlsVerify ? 'false' : 'true',
    ansible_verbosity: ansibleVerbosity,
    ansible_verbosity_flag: ansibleVerbosityFlag,
    ansible_extra_args: ansibleExtraArgsRaw,
    encrypt_vault_files: encryptVaultFiles,
    bootstrap_hub_update_collection_only: hubUpdateCollectionOnly
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
${gitSkipTlsVerify ? 'export GIT_SSL_NO_VERIFY=true' : 'unset GIT_SSL_NO_VERIFY || true'}

cd ${repoDir}

${gitSkipTlsVerify
  ? 'git config --local http.sslVerify false || true'
  : 'git config --local http.sslVerify true || true'}
${gitUsesBearerAuth && gitToken
  ? `git config --local http.extraHeader ${JSON.stringify(gitBearerExtraHeader(gitToken))} || true`
  : ''}

echo ""
echo "=== Remove playbook-adjacent vendored infra.ado (shadows /workspace/collections) ==="
rm -rf collections/ansible_collections/infra/ado

echo ""
echo "=== Prepare generated bootstrap content ==="
${overwriteGenerated
  ? `echo "Overwrite enabled: removing all group_vars, playbooks, and configs"
rm -rf group_vars playbooks configs`
  : `echo "Overwrite disabled: refreshing only group_vars/all/${envName} (sibling envs preserved)"
rm -rf "group_vars/all/${envName}"
# Shared playbooks/configs are regenerated with force; do not wipe sibling env dirs.
mkdir -p group_vars/all`}

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
  -e aap_version=${aapVersionNumber(
    installAapDuringBootstrap
      ? (data.component_config?.aap?.deployment_version || data?.aap?.version)
      : data?.aap?.version
  )} \\
  -e controller_validate_certs=false \\
  -e controller_verify_ssl=false \\
  -e tower_verify_ssl=false \\
  -e validate_certs=false \\
  -e verify_ssl=false \\
  -e skip_tls_verify=${skipTlsVerify ? 'true' : 'false'} \\
  -e ansible_tls_verify=${skipTlsVerify ? 'false' : 'true'} \\
  -e bootstrap_hub_update_collection_only=${hubUpdateCollectionOnly ? 'true' : 'false'} \\
  -e generate_playbooks=${hubUpdateCollectionOnly ? 'false' : 'true'} \\
  -e generate_aap_configs=${configureAap && !hubUpdateCollectionOnly ? 'true' : 'false'} \\
  -e apply_aap_configs=${configureAap ? 'true' : 'false'} \\
  -e bootstrap_apply_aap_configs=${configureAap && !hubUpdateCollectionOnly ? 'true' : 'false'} \\
  -e bootstrap_controller_apply_aap_configs=${configureAap ? 'true' : 'false'} \\
  -e generate_env_vars_use_aap=${configureAap ? 'true' : 'false'} \\
  -e generate_playbook_repo_pause_for_push=false \\
  -e generate_playbook_repo_git_push=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_commit=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_mode=${autoGitPush ? 'push' : 'manual'} \\
  -e bootstrap_generate_playbook_repo_git_mode=${autoGitPush ? 'push' : 'manual'} \\
  -e generate_playbook_repo_git_url=${JSON.stringify(repoUrl)} \\
  -e bootstrap_generate_playbook_repo_git_url=${JSON.stringify(repoUrl)} \\
  ${gitToken ? `-e generate_playbook_repo_git_token=${JSON.stringify(gitToken)} \\\n  -e bootstrap_generate_playbook_repo_git_token=${JSON.stringify(gitToken)} \\` : ''}
  -e generate_playbook_repo_git_ssl_verify=${gitSkipTlsVerify ? 'false' : 'true'} \\
  -e bootstrap_generate_playbook_repo_git_ssl_verify=${gitSkipTlsVerify ? 'false' : 'true'} \\
  -e generate_playbook_repo_git_auth_mode=${gitUsesBearerAuth ? 'bearer' : 'basic'} \\
  -e bootstrap_generate_playbook_repo_git_auth_mode=${gitUsesBearerAuth ? 'bearer' : 'basic'} \\
  -e generate_playbook_repo_git_branch="${data.aap.git_branch}" \\
  -e bootstrap_generate_playbook_repo_git_branch="${data.aap.git_branch}" \\
  -e generate_playbook_repo_git_commit_message="Generate ADO bootstrap content for ${envName}" \\
  -e bootstrap_generate_env_vars_force=true \\
  -e generate_env_vars_force=true \\
  -e generate_env_vars_encrypt_vault_files=${encryptVaultFiles ? 'true' : 'false'} \\
  -e bootstrap_generate_env_vars_encrypt_vault_files=${encryptVaultFiles ? 'true' : 'false'} \\
  -e bootstrap_generate_env_vars_vault_password_file=.vault_pass \\
  -e bootstrap_generate_playbook_repo_write_galaxy_requirements=${hubPublishRequested ? 'true' : 'false'} \\
  --vault-password-file .vault_pass${ansibleExtraArgsShell ? ` \\\n  ${ansibleExtraArgsShell}` : ''}
`], workRoot, 'Running ansible-playbook', bootstrapEnv);

  const bootstrapRecap = buildBootstrapRecap(
    data,
    repoDir,
    selectedComponentApps
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
    overwriteGenerated,
    ansibleVerbosity,
    ansibleVerbosityFlag,
    ansibleExtraArgs: ansibleExtraArgsRaw,
    skipTlsVerify,
    gitSkipTlsVerify,
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
