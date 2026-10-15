// Curated offline explanations for local/no-AAP ansible-playbook preview commands.
// Never invent role behavior beyond these notes + bundled README lookup.
// When form context is passed, show the caller's actual selections (secrets redacted).

const PLAYBOOK_EXPLAIN = {
  'playbooks/openshift/ado-configure-console-banner-bootstrap.yml': {
    title: 'Configure OpenShift console banner',
    role: 'ocp_console_banner',
    summary:
      'Applies (or removes) the OpenShift web console notification banner on the cluster using the Kubernetes API.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_openshift.yml',
      'group_vars/all/<env>/vars_openshift.yml',
      'group_vars/all/<env>/vault_console.yml',
      'group_vars/all/<env>/vars_console.yml'
    ],
    formSources: [
      'Core Environment → OpenShift (API host / token used as K8S_AUTH_*)',
      'Component Configuration → Console Banner option (banner text, location, colors, state)',
      'Run Bootstrap writes those values into vars_openshift.yml / vars_console.yml (and vaults when encrypted)'
    ],
    commandExtras: [
      'env — which group_vars/all/<env>/ tree the playbook loads (from Environment Type on the form)',
      'state — from group_vars (add / update / delete), written by Run Bootstrap from Banner action — not forced on the CLI'
    ],
    selectionKeys: 'console_banner'
  },
  'playbooks/openshift/ado-create-htpass-user-bootstrap.yml': {
    title: 'Create Admin HTPasswd user',
    role: 'ocp_htpasswd_admin',
    summary: 'Creates or updates an HTPasswd identity provider user for OpenShift console login.',
    varsFiles: [
      'group_vars/all/<env>/vault_admin_htpasswd.yml',
      'group_vars/all/<env>/vars_admin_htpasswd.yml',
      'group_vars/all/<env>/vault_openshift.yml',
      'group_vars/all/<env>/vars_openshift.yml'
    ],
    formSources: [
      'OpenShift Options → Admin HTPasswd (must be explicitly selected)',
      'Login button name (IdP) → htpasswd_idp_name (console login button)',
      'OpenShift admin username / password / htpasswd_users fields',
      'Run Bootstrap materializes vault_admin_htpasswd.yml + vars_admin_htpasswd.yml'
    ],
    commandExtras: [
      'env — group_vars environment directory',
      'state — defaults to present (create/update IdP and users). Pass -e state=absent to delete the HTPasswd identity provider and secret entirely. Form HTPasswd action add/replace/remove manages users when state is present.'
    ],
    selectionKeys: 'htpasswd'
  },
  'playbooks/cert-manager/ado-deploy-and-configure-bootstrap.yml': {
    title: 'Deploy cert-manager',
    role: 'ocp_cert_manager',
    summary:
      'Installs (or removes) the Red Hat cert-manager operator, operand namespace, and optional IdM ACME ClusterIssuer.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_cert_manager.yml',
      'group_vars/all/<env>/vars_cert_manager.yml'
    ],
    formSources: [
      'OpenShift Apps → cert_manager',
      'Component Configuration → Cert Manager (mode IdM ACME / AWS PCA / custom)',
      'Run Bootstrap writes mode, IdM ACME URL, and CA into vars_cert_manager.yml'
    ],
    commandExtras: [
      'env — which group_vars/all/<env>/ tree the playbook loads',
      "state — form Common extra vars (Not using AAP) inserts -e state=present|absent; roles also default to present when omitted. Pass absent to uninstall."
    ],
    selectionKeys: 'cert_manager'
  },
  'playbooks/acm/ado-deploy-and-configure-bootstrap.yml': {
    title: 'Deploy ACM (Advanced Cluster Management)',
    role: 'ocp_acm',
    summary:
      'Installs the ACM operator, creates MultiClusterHub, waits until Running, and enables OpenShift Console plug-ins acm + mce so Fleet Management appears. If a prior uninstall left MCH/MCE Uninstalling, present finishes that cleanup first (ocp_acm_heal_stuck_uninstall). state=absent removes MCH plus MCE/ClusterManager/local-cluster and stuck finalizers.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_acm.yml',
      'group_vars/all/<env>/vars_acm.yml'
    ],
    formSources: [
      'OpenShift Apps → acm',
      'Component Configuration → ACM (channel, policy options)',
      'Not using AAP → Common extra vars (global state) and this playbook’s Options (state override, operator_channel, freeform -e)',
      'Run Bootstrap writes channel/namespace into vars_acm.yml'
    ],
    commandExtras: [
      'env — group_vars environment directory',
      'state — Common extra vars default for every playbook; use this step’s Options to override for ACM only. present installs (heals stuck uninstall first); absent thoroughly removes hub objects',
      'operator_channel — OLM channel (lab default release-2.17); set in Options or group_vars'
    ],
    selectionKeys: 'acm'
  },
  'playbooks/ocp_virtualization/ado-deploy-bootstrap.yml': {
    title: 'Deploy OpenShift Virtualization',
    role: 'ocp_virtualization_install',
    summary:
      'Installs the kubevirt-hyperconverged operator, waits for the hco-operator Deployment, and creates the HyperConverged CR. Optional KubeSecondaryDNS feature gate is set from Options / -e.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_ocp_virtualization.yml',
      'group_vars/all/<env>/vars_ocp_virtualization.yml'
    ],
    formSources: [
      'OpenShift Apps → ocp_virtualization',
      'Not using AAP → Common extra vars (global state) and this playbook’s Options (state, operator_channel, Enable KubeSecondaryDNS, freeform -e)',
      'Run Bootstrap writes namespace/channel into vars_ocp_virtualization.yml'
    ],
    commandExtras: [
      'env — group_vars environment directory',
      'state — Common extra vars default; override per step with Options',
      'operator_channel — usually stable',
      'ocp_virtualization_install_enable_kube_secondary_dns — Options checkbox → HyperConverged featureGates.deployKubeSecondaryDNS'
    ],
    selectionKeys: 'ocp_virtualization'
  },
  'playbooks/mtv/ado-deploy-bootstrap.yml': {
    title: 'Deploy Migration Toolkit for Virtualization',
    role: 'ocp_mtv',
    summary:
      'Installs mtv-operator and ForkliftController in openshift-mtv. Select OpenShift Virtualization on migration targets.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_mtv.yml',
      'group_vars/all/<env>/vars_mtv.yml'
    ],
    formSources: [
      'OpenShift Apps → mtv (Migration Toolkit for Virtualization)',
      'Also select ocp_virtualization when this cluster is a migration target'
    ],
    commandExtras: [
      'env — group_vars environment directory',
      'state — present / absent',
      'operator_channel — default release-v2.12'
    ],
    selectionKeys: 'mtv'
  },
  'playbooks/openshift/ado-install-nfs-csi-bootstrap.yml': {
    title: 'Install NFS CSI storage driver',
    role: 'ocp_nfs_storage',
    summary:
      'Installs the NFS CSI driver (Helm csi-driver-nfs) and creates an NFS-backed StorageClass. Requires nfs_server and nfs_share (or ocp_nfs_storage_* equivalents) in group_vars.',
    varsFiles: [
      'group_vars/all/<env>/infra_config_vars.yml',
      'group_vars/all/<env>/vault_openshift.yml',
      'group_vars/all/<env>/vars_openshift.yml'
    ],
    formSources: [
      'OpenShift Options → Storage class (checkbox)',
      'Component Configuration → Storage class → NFS CSI tab (nfs_server, nfs_share, StorageClass name)',
      'Install during Bootstrap (default on) runs install_nfs_csi.yml during scaffolding',
      'Run Bootstrap also writes ocp_nfs_storage_* into group_vars for Contoller / local playbook ado-install-nfs-csi-bootstrap.yml'
    ],
    commandExtras: [
      'env — group_vars environment directory',
      'ocp_nfs_storage_server / ocp_nfs_storage_share — required for the StorageClass',
      'ocp_nfs_storage_class_name — default synology-nfs-csi'
    ],
    selectionKeys: 'nfs_csi'
  }
};

const SECRET_KEY = /(password|passwd|token|secret|api[_-]?key|kubeconfig|private[_-]?key|ssh[_-]?key|credential|oauth|bearer|vault_pass)/i;
// HTPasswd IdP metadata keys contain "passwd" but are not secrets.
const SECRET_KEY_ALLOW = /^(htpasswd_idp_name|htpasswd_idp|htpasswd_action|htpasswd_secret|htpasswd_mapping_method|htpasswd_remove_all)$/i;

function isSecretKey(key) {
  const name = String(key || '');
  if (SECRET_KEY_ALLOW.test(name)) return false;
  return SECRET_KEY.test(name);
}

function redactValue(key, value) {
  if (isSecretKey(key)) return '(redacted)';
  if (value === null || value === undefined) return '(unset)';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '(empty)';
    // Long opaque tokens that slipped past key naming.
    if (trimmed.length > 80 && /^[A-Za-z0-9+/=._-]+$/.test(trimmed)) return '(redacted)';
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item, i) => (
      typeof item === 'object' && item ? redactObject(item) : redactValue(`${key}[${i}]`, item)
    ));
  }
  if (typeof value === 'object') return redactObject(value);
  return String(value);
}

function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v, i) => redactValue(String(i), v));
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    out[k] = redactValue(k, v);
  });
  return out;
}

function formatScalar(value) {
  if (value === null || value === undefined) return '(unset)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseExtraVars(argv) {
  if (!Array.isArray(argv)) return {};
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '-e' || argv[i + 1] == null) continue;
    const raw = String(argv[i + 1]);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(out, parsed);
        continue;
      }
    } catch {
      /* plain key=value */
    }
    const eq = raw.indexOf('=');
    if (eq > 0) out[raw.slice(0, eq)] = raw.slice(eq + 1);
    else out.raw = raw;
  }
  return out;
}

function playbookFromArgv(argv) {
  if (!Array.isArray(argv)) return '';
  return argv.find(a => String(a).startsWith('playbooks/')) || '';
}

export { playbookFromArgv, parseExtraVars };

function roleReadme(documents, role) {
  if (!role || !Array.isArray(documents)) return [];
  const path = `infra.ado/roles/${role}/README.md`;
  const doc = documents.find(d => d.path.toLowerCase() === path.toLowerCase());
  return doc ? [doc] : [];
}

/** Snapshot of form values that matter for this playbook (secrets redacted). */
export function selectionSnapshot(playbook, form = {}, extrasObj = {}) {
  const ocp = form.openshift || {};
  const opts = form.component_options?.openshift || [];
  const apps = form.component_apps?.openshift || [];
  const env = extrasObj.env || form.environment || form.env || '(unset)';
  const lines = [];

  lines.push(['env', env]);
  lines.push(['Not using AAP', form.aap?.enabled === false]);

  if (Array.isArray(form.components) && form.components.length) {
    lines.push(['components', form.components.join(', ')]);
  }
  if (apps.length) lines.push(['component_apps.openshift', apps.join(', ')]);
  if (opts.length) lines.push(['component_options.openshift', opts.join(', ')]);

  // OpenShift connection (no token)
  if (ocp.api_host || ocp.host) lines.push(['openshift.api_host', ocp.api_host || ocp.host]);
  if (ocp.apps_domain) lines.push(['openshift.apps_domain', ocp.apps_domain]);
  if (ocp.skip_tls_verify !== undefined) lines.push(['openshift.skip_tls_verify', ocp.skip_tls_verify]);
  if (ocp.token) lines.push(['openshift.token', '(redacted)']);

  const known = PLAYBOOK_EXPLAIN[playbook];
  const kind = known?.selectionKeys;

  if (kind === 'console_banner' || opts.includes('console_banner') || playbook.includes('console-banner')) {
    const state = ocp.banner_state || form.component_config?.console_banner?.banner_state || '(from group_vars)';
    lines.push(['banner_state (→ state in group_vars)', state]);
    if (state !== 'delete' && state !== 'absent') {
      lines.push(['banner_text', ocp.banner_text || form.component_config?.console_banner?.banner_text]);
      lines.push(['banner_location', ocp.banner_location || form.component_config?.console_banner?.banner_location]);
      lines.push(['banner_background_color', ocp.banner_background_color || form.component_config?.console_banner?.banner_background_color]);
      lines.push(['banner_text_color', ocp.banner_text_color || form.component_config?.console_banner?.banner_text_color]);
    } else {
      lines.push(['banner_text / colors', '(ignored for delete — all ADO-managed banners removed)']);
    }
  }

  if (kind === 'htpasswd' || opts.includes('admin_htpasswd') || playbook.includes('htpass')) {
    lines.push(['htpasswd_idp_name', ocp.htpasswd_idp_name || 'htpasswd-admin']);
    lines.push(['htpasswd_secret', ocp.htpasswd_secret || `${ocp.htpasswd_idp_name || 'htpasswd-admin'}-secret`]);
    lines.push(['htpasswd_action', ocp.htpasswd_action]);
    lines.push([
      'state',
      'defaults to present; pass -e state=absent to delete the IdP and secret'
    ]);
    lines.push(['admin_username', ocp.admin_username]);
    lines.push(['admin_password', ocp.admin_password ? '(redacted)' : '(unset)']);
    const users = Array.isArray(ocp.htpasswd_users) ? ocp.htpasswd_users : [];
    lines.push([
      'htpasswd_users',
      users.length
        ? users.map(u => ({ name: u?.name || '', password: u?.password ? '(redacted)' : '(unset)' }))
        : '(none)'
    ]);
  }

  if (kind === 'cert_manager' || apps.includes('cert_manager') || playbook.includes('cert-manager')) {
    const cm = form.component_config?.cert_manager || {};
    lines.push(['state', 'Common extra vars (present default) or -e state=absent to uninstall']);
    lines.push(['mode / ocp_cert_manager_mode', cm.mode || '(from group_vars)']);
    lines.push(['idm_acme_directory_url', cm.idm_acme_directory_url]);
    lines.push(['idm_ca_bundle_file', cm.idm_ca_bundle_file]);
    lines.push(['update_default_ingress', cm.update_default_ingress]);
    lines.push(['trust_ca_clusterwide', cm.trust_ca_clusterwide]);
  }

  if (kind === 'acm' || apps.includes('acm') || playbook.includes('/acm/')) {
    const acm = form.component_config?.acm || {};
    lines.push(['state', 'Common extra vars default; Options on this playbook can override']);
    lines.push(['operator_channel / channel', acm.channel || extrasObj.operator_channel || '(from group_vars; lab default release-2.17)']);
    lines.push(['namespace', acm.namespace || 'open-cluster-management']);
    lines.push([
      'Fleet Management UI',
      'Enabled by default after install (Console plug-ins acm + mce). Refresh the OpenShift console → Fleet Management (or All Clusters).'
    ]);
  }

  if (
    kind === 'ocp_virtualization'
    || apps.includes('ocp_virtualization')
    || playbook.includes('ocp_virtualization')
  ) {
    const virt = form.component_config?.ocp_virtualization || {};
    lines.push(['state', 'Common extra vars default; Options on this playbook can override']);
    lines.push(['operator_channel', virt.channel || extrasObj.operator_channel || '(usually stable)']);
    lines.push([
      'ocp_virtualization_install_enable_kube_secondary_dns',
      extrasObj.ocp_virtualization_install_enable_kube_secondary_dns ?? '(Options checkbox; default false)'
    ]);
  }

  // CLI -e extras (already on the preview line)
  Object.entries(extrasObj || {}).forEach(([key, value]) => {
    if (key === 'raw' || key === 'env') return;
    lines.push([`-e ${key}`, redactValue(key, value)]);
  });

  if (form.ansible_extra_args) {
    lines.push(['Additional ansible-playbook options', String(form.ansible_extra_args).trim() || '(none)']);
  }

  return lines
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `• ${k} = ${formatScalar(redactValue(k, v))}`);
}

function formatExplain({
  title,
  summary,
  playbook,
  extras,
  varsFiles,
  formSources,
  commandLine,
  selectionLines
}) {
  const envPlaceholder = '<env>';
  const resolvedFiles = varsFiles.map(f => f.replace(/<env>/g, envPlaceholder));
  const lines = [
    title,
    '',
    summary,
    '',
    `Playbook: ${playbook}`,
    ''
  ];

  if (selectionLines?.length) {
    lines.push('Your current selection (secrets redacted):');
    lines.push(...selectionLines);
    lines.push('');
  }

  lines.push(
    'What the command-line -e values mean:',
    ...(extras.length ? extras.map(e => `• ${e}`) : ['• (none beyond env defaults on the CLI)']),
    '',
    'Where the rest of the variables come from:',
    '1. Run Bootstrap already wrote group_vars from the form (source of truth for no-AAP runs).',
    '2. The playbook vars_files load (when present):',
    ...(resolvedFiles.length ? resolvedFiles.map(f => `   • ${f}`) : ['   • (see playbook vars_files)']),
    '3. Form fields that feed those files:',
    ...(formSources.length ? formSources.map(f => `   • ${f}`) : ['   • Matching Component Configuration / OpenShift fields']),
    '',
    '--vault-password-file .vault_pass decrypts vault_*.yml written during bootstrap.',
    '',
    'Inventory is the generated repo inventory (localhost). Collections come from /workspace/collections installed at bootstrap.',
    '',
    'Preview command:',
    commandLine
  );
  return lines.join('\n');
}

/** Build an ADO Assistant Q/A for a local playbook preview argv list. */
export function explainLocalPlaybookCommand(argv, documents = [], form = null) {
  const playbook = playbookFromArgv(argv);
  const extrasObj = parseExtraVars(argv);
  const known = PLAYBOOK_EXPLAIN[playbook];
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  const commandLine = Array.isArray(argv) ? argv.map(quote).join(' ') : String(argv || '');

  const extras = [];
  Object.entries(extrasObj || {}).forEach(([key, value]) => {
    if (key === 'raw') {
      extras.push(`-e ${value}`);
      return;
    }
    const hint = known?.commandExtras?.find(line => line.startsWith(`${key} `) || line.startsWith(`${key}—`) || line.startsWith(`${key} -`));
    const shown = isSecretKey(key) ? '(redacted)' : JSON.stringify(value);
    extras.push(hint ? `${hint} (CLI value: ${shown})` : `${key} = ${shown}`);
  });
  if (known?.commandExtras) {
    known.commandExtras.forEach(line => {
      const key = line.split(' ')[0];
      if (extrasObj && Object.prototype.hasOwnProperty.call(extrasObj, key)) return;
      if (!extras.some(e => e.startsWith(`${key} `) || e.startsWith(`${key} =`))) extras.push(line);
    });
  }

  const env = extrasObj.env || form?.environment || form?.env || 'dev';
  const varsFiles = (known?.varsFiles || [
    'group_vars/all/<env>/infra_config_vars.yml',
    'group_vars/all/<env>/vars_*.yml and vault_*.yml for this component'
  ]).map(f => f.replace(/<env>/g, env));

  const selectionLines = form ? selectionSnapshot(playbook, form, extrasObj) : [];

  const answer = formatExplain({
    title: known?.title || `Local playbook: ${playbook || 'selected step'}`,
    summary: known?.summary
      || 'Runs this generated bootstrap playbook in the preflight pod against the cluster/API using vars from group_vars (written by Run Bootstrap).',
    playbook: playbook || '(unknown)',
    extras,
    varsFiles,
    formSources: known?.formSources || [
      'Matching component / OpenShift fields on the form',
      'Additional ansible-playbook options (appended to every step when set)'
    ],
    commandLine,
    selectionLines
  });

  return {
    question: `Explain ${playbook || 'this playbook command'}`,
    answer,
    documents: roleReadme(documents, known?.role),
    guide: null,
    playbook: playbook || '',
    env
  };
}

export function explainLocalPlaybookFromDisplayLine(line, documents = [], form = null) {
  const match = String(line || '').match(/playbooks\/[^\s']+\.yml/);
  if (!match) {
    return {
      question: 'Explain this playbook command',
      answer: 'Select Preview commands first, then use the ? icon on a specific ansible-playbook line.',
      documents: [],
      guide: null
    };
  }
  return explainLocalPlaybookCommand(['ansible-playbook', '-i', 'inventory', match[0], '-e', '{}'], documents, form);
}
