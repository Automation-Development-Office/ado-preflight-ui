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

function verbosityFlag(level) {
  const normalized = normalizeVerbosity(level);

  if (normalized <= 0) {
    return '';
  }

  return `-${'v'.repeat(normalized)}`;
}

function gitCredentialLine(repoUrl, token) {
  const u = new URL(repoUrl);
  const username = encodeURIComponent('oauth2');
  const password = encodeURIComponent(token);
  return `${u.protocol}//${username}:${password}@${u.host}\n`;
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

function runStream(cmd, args, cwd, eventLabel) {
  return new Promise((resolve) => {
    if (eventLabel) {
      event(eventLabel);
    }

    append(`\n\n$ ${cmd} ${args.join(' ')}\n`);

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      env: {
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

function ensureStarterFiles(repoDir, envName) {
  event('Ensuring required starter files exist');
  append('\n=== Ensuring required starter files exist ===\n');

  writeIfMissing(path.join(repoDir, 'run-ado-scaffolding.yml'), `---
- name: Generate env files, playbooks, and AAP config files
  ansible.builtin.import_playbook: 00-controller-bootstrap.yml
  vars:
    generate_env_vars: true
    generate_env_vars_force: true
    generate_env_vars_use_aap: true
    generate_playbooks: true
    generate_aap_configs: true
    apply_aap_configs: false

- name: Commit and push generated repo when enabled
  hosts: localhost
  gather_facts: false
  connection: local
  tasks:
    - name: Commit and push generated repo
      ansible.builtin.shell: |
        set -e
        git config user.email "{{ generate_playbook_repo_git_email | default('ado-preflight@example.com') }}"
        git config user.name "{{ generate_playbook_repo_git_name | default('ADO Preflight UI') }}"
        git config http.sslVerify false
        git add .
        if git diff --cached --quiet; then
          echo "No generated changes to commit."
        else
          git commit -m "{{ generate_playbook_repo_git_commit_message | default('Generate ADO bootstrap content') }}"
          GIT_SSL_NO_VERIFY=true git -c http.sslVerify=false push origin HEAD
        fi
      args:
        chdir: "{{ playbook_dir }}"
      environment:
        GIT_SSL_NO_VERIFY: "true"
      when: generate_playbook_repo_git_push | default(false) | bool

    - name: Pause for manual Git push
      ansible.builtin.pause:
        prompt: "Playbooks, configs, and vars are generated. Push to Git now, then press ENTER."
      when:
        - generate_playbook_repo_pause_for_push | default(true) | bool
        - not (generate_playbook_repo_git_push | default(false) | bool)

- name: Apply generated AAP config
  ansible.builtin.import_playbook: 00-controller-bootstrap.yml
  vars:
    generate_env_vars: false
    generate_playbooks: false
    generate_aap_configs: false
    apply_aap_configs: true
`);

  writeIfMissing(path.join(repoDir, '00-controller-bootstrap.yml'), `---
- name: Bootstrap generated playbook repo and AAP controller config
  hosts: localhost
  gather_facts: false
  connection: local

  vars_files:
    - group_vars/all/{{ env }}/aap_config_vars.yml
    - group_vars/all/{{ env }}/aap_vault.yml

  vars:
    generate_env_vars: false
    generate_playbooks: false
    generate_aap_configs: true
    apply_aap_configs: true

    target_platform: "{{ component | default('all') }}"
    generate_playbook_repo_component: "{{ generate_env_vars_component | default(component | default('all')) }}"

    playbook_categories:
      - all

    playbook_apps:
      - all

  roles:
    - role: ado.bootstrap.controller_bootstrap
`);

  writeIfMissing(path.join(repoDir, 'inventory'), `localhost ansible_connection=local\n`);

  writeIfMissing(path.join(repoDir, 'ansible.cfg'), `[defaults]
jinja2_native = True
`);

  const varsDir = path.join(repoDir, 'group_vars', 'all', envName);
  fs.mkdirSync(varsDir, { recursive: true });

  writeIfMissing(path.join(varsDir, 'aap_config_vars.yml'), `---
# Placeholder created by ADO Preflight UI.
`);

  writeIfMissing(path.join(varsDir, 'aap_vault.yml'), `---
# Placeholder created by ADO Preflight UI.
`);
}

app.get('/api/logs', (req, res) => {
  res.type('text/plain').send(latestLog);
});

app.get('/api/events', (req, res) => {
  res.type('text/plain').send(latestEvents);
});

app.get('/api/logs/raw', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="ado-preflight-run.log"');
  res.type('text/plain').send(latestLog);
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

  const data = req.body;
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

  const selectedComponentApps = (() => {
    if (Array.isArray(data.components) && data.components.includes('all')) {
      return ['all'];
    }

    const out = [];
    const expandableGroups = ['openshift', 'rhel', 'patching', 'provision'];

    for (const c of data.components || []) {
      if (expandableGroups.includes(c)) {
        out.push(...(data.component_apps?.[c] || []));
      } else {
        out.push(c);
      }
    }

    return [...new Set(out)];
  })();

  const autoGitPush = data?.git?.auto_push !== false;
  const ansibleVerbosity = normalizeVerbosity(data?.ansible?.verbosity ?? data?.verbosity ?? 0);
  const ansibleVerbosityFlag = verbosityFlag(ansibleVerbosity);

  append(`\nSelected Components: ${selectedComponents}\n`);
  append(`Selected Component Apps: ${selectedComponentApps.join(',')}\n`);
  append(`Auto Git Push: ${autoGitPush}\n`);
  append(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}\n`);

  event(`Selected components: ${selectedComponents}`);
  event(`Selected component apps: ${selectedComponentApps.join(',')}`);
  event(`Auto Git Push: ${autoGitPush}`);
  event(`Ansible Verbosity: ${ansibleVerbosity} ${ansibleVerbosityFlag}`);

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
echo "=== Installing ADO Collections ==="
ansible-galaxy collection install ${collectionDir}/ado-*.tar.gz -p /workspace/collections --force

echo ""
echo "=== Installing ansible.controller Collection ==="
ansible-galaxy collection install ${collectionDir}/ansible-controller-*.tar.gz -p /workspace/collections --force

echo ""
echo "=== Installing infra.controller_configuration Collection ==="
ansible-galaxy collection install ${collectionDir}/infra-controller_configuration-*.tar.gz -p /workspace/collections --force --no-deps

echo ""
echo "=== Installing infra.aap_configuration Collection ==="
ansible-galaxy collection install ${collectionDir}/infra-aap_configuration-*.tar.gz -p /workspace/collections --force --no-deps

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
    ['-c', 'http.sslVerify=false', 'clone', repoUrl, repoDir],
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

  event('Writing ado-extra-vars.json');
  fs.writeFileSync(extraVarsPath, JSON.stringify({
    component: selectedComponents,
    generate_env_vars_component: selectedComponents,
    generate_playbook_repo_component: selectedComponents,
    generate_env_vars_components: selectedComponentApps,
    generate_playbook_repo_components: selectedComponentApps,
    generate_aap_config_components: selectedComponentApps,
    component_config: data.component_config || {},
    component_vars: data.component_config || {},
    git_auto_push: autoGitPush,
    ansible_verbosity: ansibleVerbosity,
    ansible_verbosity_flag: ansibleVerbosityFlag
  }, null, 2));

  event('Writing vault password file');
  fs.writeFileSync(
    vaultPassPath,
    data?.aap?.vault_password || data.vault_password || 'redhat123'
  );

  const code = await runStream('bash', ['-lc', `
export ANSIBLE_COLLECTIONS_PATH=/workspace/collections:/usr/share/ansible/collections
export ANSIBLE_COLLECTIONS_PATHS=/workspace/collections:/usr/share/ansible/collections
export ANSIBLE_ROLES_PATH=/workspace/bootstrap-sample/roles:/workspace/collections/ansible_collections/infra/aap_configuration/roles:/usr/share/ansible/roles:/etc/ansible/roles
export ANSIBLE_HOST_KEY_CHECKING=false
export ANSIBLE_FORCE_COLOR=false
export CONTROLLER_VERIFY_SSL=false
export TOWER_VERIFY_SSL=false
export REQUESTS_CA_BUNDLE=
export CURL_CA_BUNDLE=
export PYTHONHTTPSVERIFY=0
export GIT_SSL_NO_VERIFY=true

cd ${repoDir}

git config http.sslVerify false || true

echo ""
echo "=== Effective extra vars ==="
cat ado-extra-vars.json

echo ""
echo "=== Starter files check ==="
ls -l run-ado-scaffolding.yml 00-controller-bootstrap.yml inventory ansible.cfg
ls -l group_vars/all/${envName}/aap_config_vars.yml group_vars/all/${envName}/aap_vault.yml

echo ""
echo "=== Copy infra.aap_configuration roles into repo roles path ==="
mkdir -p /workspace/bootstrap-sample/roles

for role_path in /workspace/collections/ansible_collections/infra/aap_configuration/roles/*; do
  role_name="$(basename "$role_path")"
  fq_role="/workspace/bootstrap-sample/roles/infra.aap_configuration.\${role_name}"

  rm -rf "\${fq_role}"
  mkdir -p "\${fq_role}"
  cp -a "\${role_path}/." "\${fq_role}/"
done

echo ""
echo "=== Run bootstrap scaffolding ==="
ansible-playbook \\
  -c local \\
  -i inventory \\
  run-ado-scaffolding.yml \\
  ${ansibleVerbosityFlag} \\
  -e preflight_json=${preflightFile} \\
  -e @ado-extra-vars.json \\
  -e env=${envName} \\
  -e controller_validate_certs=false \\
  -e controller_verify_ssl=false \\
  -e tower_verify_ssl=false \\
  -e validate_certs=false \\
  -e verify_ssl=false \\
  -e generate_playbook_repo_pause_for_push=false \\
  -e generate_playbook_repo_git_push=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_commit=${autoGitPush ? 'true' : 'false'} \\
  -e generate_playbook_repo_git_commit_message="Generate ADO bootstrap content for ${envName}" \\
  -e generate_env_vars_encrypt_vault_files=false \\
  --vault-password-file .vault_pass
`], workRoot, 'Running ansible-playbook');

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
    gitTokenProvided: Boolean(gitToken)
  });
});

app.use((req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  event(`ADO Preflight UI listening on ${port}`);
});
