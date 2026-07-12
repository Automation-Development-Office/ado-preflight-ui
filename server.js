const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

  if (!data.git) data.git = {};
  if (data.git.auto_push === undefined) data.git.auto_push = true;
  if (data.git.token === undefined) data.git.token = '';

  if (!data.vault) data.vault = {};
  if (data.vault.encrypt === undefined) data.vault.encrypt = true;

  if (!data.aap) data.aap = {};
  if (data.aap.enabled === undefined) data.aap.enabled = true;
  if (data.aap.skip_tls_verify === undefined) data.aap.skip_tls_verify = false;
  if (!data.aap.organization) data.aap.organization = 'ADO';
  if (!data.aap.inventory) data.aap.inventory = `${data.aap.organization}-inventory`;
  if (!data.aap.project) data.aap.project = `${data.aap.organization}-project`;
  if (!data.aap.vault_credential_name) data.aap.vault_credential_name = `${data.aap.organization}-vault`;
  if (data.aap.hub_publish_ado_collection === undefined) data.aap.hub_publish_ado_collection = true;
  if (data.aap.hub_mark_ado_validated === undefined) data.aap.hub_mark_ado_validated = true;
  data.aap.hub_mark_ado_validated = data.aap.hub_publish_ado_collection === true;
  if (!Array.isArray(data.aap.additional_credentials)) data.aap.additional_credentials = [];
  data.aap.additional_credentials = data.aap.additional_credentials.map(({ id, ...credential }) => credential);
  if (!data.aap.machine_credential) data.aap.machine_credential = {};
  if (!data.aap.machine_credential.name) data.aap.machine_credential.name = `${data.aap.organization}-machine`;
  if (!data.aap.machine_credential.username) data.aap.machine_credential.username = 'cloud-user';
  if (data.aap.machine_credential.ssh_key_data === undefined) data.aap.machine_credential.ssh_key_data = '';
  if (data.aap.machine_credential.ssh_key_unlock === undefined) data.aap.machine_credential.ssh_key_unlock = '';
  if (data.aap.machine_credential.become_method === undefined) data.aap.machine_credential.become_method = 'sudo';
  if (!data.aap.machine_credential.become_username) data.aap.machine_credential.become_username = 'root';
  if (!data.aap.git_branch) data.aap.git_branch = 'main';

  if (!data.component_config) data.component_config = {};
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

  if (!data.component_config.idm) data.component_config.idm = {};
  delete data.component_config.idm.storage;
  if (data.component_config.idm.replica_hostname === undefined) data.component_config.idm.replica_hostname = '';
  if (data.component_config.idm.replica_install_dns === undefined) data.component_config.idm.replica_install_dns = true;
  if (data.component_config.idm.replica_install_ca === undefined) data.component_config.idm.replica_install_ca = true;
  if (data.component_config.idm.auto_forwarders === undefined) data.component_config.idm.auto_forwarders = true;
  if (data.component_config.idm.custom_cert_file === undefined) data.component_config.idm.custom_cert_file = '';
  if (data.component_config.idm.custom_cert_key_file === undefined) data.component_config.idm.custom_cert_key_file = '';
  if (data.component_config.idm.custom_cert_chain_file === undefined) data.component_config.idm.custom_cert_chain_file = '';

  if (!data.openshift) data.openshift = {};
  if (data.openshift.skip_tls_verify === undefined) data.openshift.skip_tls_verify = true;
  if (data.openshift.token === undefined) data.openshift.token = '';

  return data;
}

function selectedComponentAppsFrom(data) {
  if (Array.isArray(data.selected_component_apps) && data.selected_component_apps.length > 0) {
    return [...new Set(data.selected_component_apps)];
  }

  if (Array.isArray(data.components) && data.components.includes('all')) {
    return [...new Set([...openshiftApps, ...rhelApps, ...patchingApps, ...provisionApps, 'jira'])];
  }

  const out = [];
  const groups = ['openshift', 'rhel', 'patching', 'provision'];

  for (const component of data.components || []) {
    if (groups.includes(component)) {
      const selected = data.component_apps?.[component] || [];
      out.push(...(selected.length > 0 ? selected : [component]));
    } else {
      out.push(component);
    }
  }

  return [...new Set(out.filter(Boolean))];
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

function readConfigNames(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const names = [];
  const text = fs.readFileSync(filePath, 'utf8');
  const namePattern = /^(?:-\s+|\s{2}-\s+)name:\s*(.+?)\s*$/gm;
  let match = namePattern.exec(text);

  while (match) {
    const name = cleanYamlName(match[1]);
    if (name && !names.includes(name)) {
      names.push(name);
    }
    match = namePattern.exec(text);
  }

  return names;
}

function appendListRecap(lines, label, values) {
  lines.push(`${label}:`);

  if (!values || values.length === 0) {
    lines.push('  none');
    return;
  }

  values.forEach(value => lines.push(`  - ${value}`));
}

function buildBootstrapRecap(data, repoDir, selectedComponentApps, collectionInstalled) {
  const controllerDir = path.join(repoDir, 'configs', 'controller');
  const workflowsDir = path.join(repoDir, 'configs', 'workflows');
  const lines = [
    '',
    '=== ADO Bootstrap Recap ===',
    `AAP Server: ${data?.aap?.hostname || 'not configured'}`,
    `Organization: ${data?.aap?.organization || 'not configured'}`,
    `Project Name: ${data?.aap?.project || 'not configured'}`
  ];

  appendListRecap(lines, 'Components', selectedComponentApps);
  appendListRecap(lines, 'Job Templates', readConfigNames(path.join(controllerDir, 'job_templates.yml')));
  appendListRecap(lines, 'Workflow Templates', readConfigNames(path.join(workflowsDir, 'bootstrap_workflows.yml')));
  appendListRecap(lines, 'Credentials', readConfigNames(path.join(controllerDir, 'credentials.yml')));
  appendListRecap(lines, 'Inventories', readConfigNames(path.join(controllerDir, 'inventories.yml')));
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
  const result = readTextFromCandidates([
    process.env.ADO_COLLECTION_README,
    path.join(__dirname, '..', 'ado', 'README.md'),
    path.join(__dirname, '..', 'ado', 'README.me'),
    path.join(__dirname, 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join(__dirname, '..', 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join(process.cwd(), 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/workspace', 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/usr', 'share', 'ansible', 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/opt', 'app-root', 'src', 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/opt', 'app-root', 'collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/opt', 'ado-collections', 'extracted', 'README.md'),
    path.join('/opt', 'ado-collections', 'ansible_collections', 'infra', 'ado', 'README.md'),
    path.join('/opt', 'ado-collections', 'README.md'),
    path.join('/opt', 'app-root', 'ado', 'README.md'),
    path.join('/opt', 'app-root', 'ado', 'README.me'),
    path.join('/workspace', 'README.md'),
    path.join(process.cwd(), 'README.md')
  ]);

  if (!result.text) {
    event(`ADO collection README not found in: ${result.checked.join(', ')}`);
    res.type('text/plain').send(documentationFallback('ADO Collection Documentation', result.checked));
    return;
  }

  res.type('text/plain').send(result.text);
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
    return res.json({
      status: 'failed',
      exitCode: collectionInstallCode,
      repoDir,
      error: 'Collection install failed. Check logs.'
    });
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
    return res.json({
      status: 'failed',
      exitCode: cloneCode || 128,
      repoDir,
      error: 'Git clone failed. Check logs.'
    });
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
  append(bootstrapRecap);
  event(`Bootstrap finished exitCode=${code}`);

  res.json({
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
  });
});

app.use((req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  event(`ADO Preflight UI listening on ${port}`);
});
