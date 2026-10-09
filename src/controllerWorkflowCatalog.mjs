/**
 * View-only Contoller workflow catalog for preflight UI.
 * Mirrors bootstrap_controller/files/workflows seed graphs (not live AAP API).
 * componentKeys = UI / preflight component ids that keep a node when selected.
 * Empty componentKeys = always shown when parent path is active (converge sinks).
 */

/** @typedef {{ id: string, label: string, jobTemplate: string, componentKeys?: string[], kind?: 'jt'|'workflow' }} WfNode */
/** @typedef {{ id: string, name: string, description: string, nodes: WfNode[], edges: { from: string, to: string }[] }} WfGraph */

/** Map UI component → OpenShift workflow node id */
export const OPENSHIFT_NODE_COMPONENTS = {
  'Enable Integrated Image Registry': ['openshift'],
  'Create Admin HTPasswd User': ['console', 'openshift'],
  'Configure LDAP in OpenShift': ['openshift'],
  'Configure Console Banner': ['console'],
  'Deploy ACM': ['acm'],
  'Deploy OpenShift Virtualization': ['ocp_virtualization'],
  'Deploy MTV': ['mtv'],
  'Deploy Web Terminal': ['openshift'],
  'Deploy OpenShift Descheduler': ['openshift'],
  'Deploy OpenShift Compliance Operator': ['ocp_compliance'],
  'Cert Manager Workflow': ['cert_manager', 'rhbk'],
  'RHBK Workflow': ['rhbk'],
  'Configure OAuth/RHBK in OpenShift': ['rhbk'],
  'Grafana Workflow': ['grafana'],
  'Deploy GitLab': ['gitlab'],
  'Deploy Kafka': ['kafka'],
  'Deploy ECK': ['eck'],
  'Quay Workflow': ['quay'],
  'Deploy DevSpaces': ['devspaces'],
  'Dev Hub Workflow': ['dev_hub'],
  'Zabbix Workflow': ['zabbix'],
  'BookStack Workflow': ['bookstack'],
  'MinIO Workflow': ['minio'],
  'NetBox Workflow': ['netbox'],
  'Deploy ACS': ['acs'],
  'Install AAP on OpenShift': ['aap'],
  'Deploy 389ds': ['dirsrv'],
  'Deploy GitOps': ['gitops'],
  'Deploy OADP': ['oadp'],
  'Deploy Pega': ['pega'],
  'Alt Routes Workflow': [],
  'Print ADO Routes': [],
};

/** @type {WfGraph} */
export const OPENSHIFT_WORKFLOW = {
  id: 'ado-openshift-workflow',
  name: 'ADO | OpenShift Workflow',
  description:
    'Contoller workflow after bootstrap sync — cert/RHBK first, then selected apps, then route summary.',
  nodes: [
    { id: 'Enable Integrated Image Registry', label: 'Enable Integrated Image Registry', jobTemplate: 'ADO | Enable Integrated Image Registry', kind: 'jt' },
    { id: 'Create Admin HTPasswd User', label: 'Create Admin HTPasswd User', jobTemplate: 'ADO | Create Admin HTPasswd User', kind: 'jt' },
    { id: 'Configure LDAP in OpenShift', label: 'Configure LDAP in OpenShift', jobTemplate: 'ADO | Configure LDAP in OpenShift', kind: 'jt' },
    { id: 'Configure Console Banner', label: 'Configure Console Banner', jobTemplate: 'ADO | Configure Console Banner', kind: 'jt' },
    { id: 'Deploy ACM', label: 'Deploy ACM', jobTemplate: 'ADO | Deploy ACM', kind: 'jt' },
    { id: 'Deploy OpenShift Virtualization', label: 'Deploy OpenShift Virtualization', jobTemplate: 'ADO | Deploy OpenShift Virtualization', kind: 'jt' },
    { id: 'Deploy MTV', label: 'Deploy MTV', jobTemplate: 'ADO | Deploy MTV', kind: 'jt' },
    { id: 'Deploy Web Terminal', label: 'Deploy Web Terminal', jobTemplate: 'ADO | Deploy Web Terminal', kind: 'jt' },
    { id: 'Deploy OpenShift Descheduler', label: 'Deploy OpenShift Descheduler', jobTemplate: 'ADO | Deploy OpenShift Descheduler', kind: 'jt' },
    { id: 'Deploy OpenShift Compliance Operator', label: 'Deploy OpenShift Compliance Operator', jobTemplate: 'ADO | Deploy OpenShift Compliance Operator', kind: 'jt' },
    { id: 'Cert Manager Workflow', label: 'Cert Manager Workflow', jobTemplate: 'ADO | Cert Manager Workflow', kind: 'workflow' },
    { id: 'RHBK Workflow', label: 'RHBK Workflow', jobTemplate: 'ADO | RHBK Workflow', kind: 'workflow' },
    { id: 'Configure OAuth/RHBK in OpenShift', label: 'Configure OAuth/RHBK in OpenShift', jobTemplate: 'ADO | Configure OAuth/RHBK in OpenShift', kind: 'jt' },
    { id: 'Grafana Workflow', label: 'Grafana Workflow', jobTemplate: 'ADO | Grafana Workflow', kind: 'workflow' },
    { id: 'Deploy GitLab', label: 'Deploy GitLab', jobTemplate: 'ADO | Deploy GitLab', kind: 'jt' },
    { id: 'Deploy Kafka', label: 'Deploy Kafka', jobTemplate: 'ADO | Deploy Kafka', kind: 'jt' },
    { id: 'Deploy ECK', label: 'Deploy ECK', jobTemplate: 'ADO | Deploy ECK', kind: 'jt' },
    { id: 'Quay Workflow', label: 'Quay Workflow', jobTemplate: 'ADO | Quay Workflow', kind: 'workflow' },
    { id: 'Deploy DevSpaces', label: 'Deploy DevSpaces', jobTemplate: 'ADO | Deploy DevSpaces', kind: 'jt' },
    { id: 'Dev Hub Workflow', label: 'Dev Hub Workflow', jobTemplate: 'ADO | Dev Hub Workflow', kind: 'workflow' },
    { id: 'Zabbix Workflow', label: 'Zabbix Workflow', jobTemplate: 'ADO | Zabbix Workflow', kind: 'workflow' },
    { id: 'BookStack Workflow', label: 'BookStack Workflow', jobTemplate: 'ADO | BookStack Workflow', kind: 'workflow' },
    { id: 'MinIO Workflow', label: 'MinIO Workflow', jobTemplate: 'ADO | MinIO Workflow', kind: 'workflow' },
    { id: 'NetBox Workflow', label: 'NetBox Workflow', jobTemplate: 'ADO | NetBox Workflow', kind: 'workflow' },
    { id: 'Deploy ACS', label: 'Deploy ACS', jobTemplate: 'ADO | Deploy ACS', kind: 'jt' },
    { id: 'Install AAP on OpenShift', label: 'Install AAP on OpenShift', jobTemplate: 'ADO | Install AAP on OpenShift', kind: 'jt' },
    { id: 'Deploy 389ds', label: 'Deploy 389ds', jobTemplate: 'ADO | Deploy 389ds', kind: 'jt' },
    { id: 'Deploy GitOps', label: 'Deploy GitOps', jobTemplate: 'ADO | Deploy GitOps', kind: 'jt' },
    { id: 'Deploy OADP', label: 'Deploy OADP', jobTemplate: 'ADO | Deploy OADP', kind: 'jt' },
    { id: 'Deploy Pega', label: 'Deploy Pega', jobTemplate: 'ADO | Deploy Pega', kind: 'jt' },
    { id: 'Alt Routes Workflow', label: 'Alt Routes Workflow', jobTemplate: 'ADO | Alt Routes Workflow', kind: 'workflow' },
    { id: 'Print ADO Routes', label: 'Print ADO Routes', jobTemplate: 'ADO | Deploy Discover Routes and Print', kind: 'jt' },
  ],
  edges: [
    // Parallel early roots → sinks
    ...[
      'Enable Integrated Image Registry',
      'Create Admin HTPasswd User',
      'Configure LDAP in OpenShift',
      'Configure Console Banner',
      'Deploy ACM',
      'Deploy OpenShift Virtualization',
      'Deploy MTV',
      'Deploy Web Terminal',
      'Deploy OpenShift Descheduler',
      'Deploy OpenShift Compliance Operator',
    ].flatMap((id) => [
      { from: id, to: 'Print ADO Routes' },
      { from: id, to: 'Alt Routes Workflow' },
    ]),
    { from: 'Cert Manager Workflow', to: 'RHBK Workflow' },
    { from: 'RHBK Workflow', to: 'Configure OAuth/RHBK in OpenShift' },
    ...[
      'Grafana Workflow',
      'Deploy GitLab',
      'Deploy Kafka',
      'Deploy ECK',
      'Quay Workflow',
      'Deploy DevSpaces',
      'Dev Hub Workflow',
      'Zabbix Workflow',
      'BookStack Workflow',
      'MinIO Workflow',
      'NetBox Workflow',
      'Deploy ACS',
      'Install AAP on OpenShift',
      'Deploy 389ds',
      'Deploy GitOps',
      'Deploy OADP',
      'Deploy Pega',
    ].flatMap((id) => [
      { from: 'Configure OAuth/RHBK in OpenShift', to: id },
      { from: id, to: 'Print ADO Routes' },
      { from: id, to: 'Alt Routes Workflow' },
    ]),
  ],
};

/**
 * Concrete bootstrap steps for the current form. Omitted when the matching
 * option is off (Hub, git push, Contoller apply).
 *
 * @param {{
 *   environment?: string,
 *   usingAap?: boolean,
 *   varsOnly?: boolean,
 *   gitAutoPush?: boolean,
 *   gitUrl?: string,
 *   gitBranch?: string,
 *   aapProject?: string,
 *   aapOrganization?: string,
 *   hubPublishAdo?: boolean,
 *   hubPublishPreflight?: boolean,
 *   hubPushEe?: boolean,
 *   hubOnly?: boolean,
 * }} ctx
 */
export function buildBootstrapSteps(ctx = {}) {
  const env = String(ctx.environment || 'prod').trim() || 'prod';
  const usingAap = ctx.usingAap !== false;
  const varsOnly = ctx.varsOnly === true;
  const hubOnly = ctx.hubOnly === true;
  const gitUrl = String(ctx.gitUrl || '').trim();
  const gitBranch = String(ctx.gitBranch || 'main').trim() || 'main';
  const project = String(ctx.aapProject || 'ADO-project').trim();
  const org = String(ctx.aapOrganization || 'ADO').trim();

  const hubBits = [];
  if (ctx.hubPublishAdo) hubBits.push('publish infra.ado');
  if (ctx.hubPublishPreflight) hubBits.push('publish preflight collections');
  if (ctx.hubPushEe) hubBits.push('push execution environment');
  const hubOn = hubBits.length > 0 || hubOnly;

  /** @type {{ id: string, label: string, detail: string, kind: 'bootstrap' }[]} */
  const steps = [
    {
      id: 'bs-preflight',
      label: 'Write preflight JSON',
      detail: `ado-preflight-${env}.json next to the bootstrap clone (CLI extra var preflight_json)`,
      kind: 'bootstrap',
    },
    {
      id: 'bs-env',
      label: 'Generate env vars and vault',
      detail: `bootstrap_generate_env_vars → group_vars/all/${env}/`,
      kind: 'bootstrap',
    },
  ];

  if (!varsOnly && !hubOnly) {
    steps.push({
      id: 'bs-scaffold',
      label: 'Scaffold component playbooks',
      detail: 'bootstrap_generate_playbook_repo writes playbooks/ for selected components',
      kind: 'bootstrap',
    });
  }

  if (usingAap && !varsOnly && !hubOnly) {
    steps.push({
      id: 'bs-seeds',
      label: 'Generate Contoller JT and workflow seeds',
      detail: `bootstrap_controller writes configs/job_templates and configs/workflows for org ${org}`,
      kind: 'bootstrap',
    });
  }

  if (hubOn) {
    steps.push({
      id: 'bs-hub',
      label: 'Automation Hub',
      detail: hubBits.length
        ? hubBits.join('; ')
        : 'Hub-only run (collection / EE update without full component scaffolding)',
      kind: 'bootstrap',
    });
  }

  if (usingAap && !varsOnly && !hubOnly) {
    steps.push({
      id: 'bs-apply',
      label: 'Apply Contoller objects',
      detail: `Create or update org ${org}, inventory, project ${project}, vault credential, EE, job templates, and workflows`,
      kind: 'bootstrap',
    });
  }

  if (ctx.gitAutoPush === true && gitUrl) {
    steps.push({
      id: 'bs-git',
      label: 'Git push bootstrap repo',
      detail: `${gitUrl}  ·  branch ${gitBranch}`,
      kind: 'bootstrap',
    });
    if (usingAap) {
      steps.push({
        id: 'bs-sync',
        label: 'Contoller project sync',
        detail: `Project ${project} pulls ${gitBranch} from ${gitUrl}`,
        kind: 'bootstrap',
      });
    }
  }

  if (usingAap && !hubOnly) {
    steps.push({
      id: 'bs-launch',
      label: 'Contoller runs workflows and job templates',
      detail: 'ADO | OpenShift Workflow (and other component workflows) after project sync',
      kind: 'bootstrap',
    });
  }

  return steps;
}

/** @deprecated static list — use buildBootstrapSteps */
export const BOOTSTRAP_CHAIN = {
  id: 'ado-bootstrap-chain',
  name: 'Preflight Bootstrap (ansible-playbook)',
  description: 'What Run Bootstrap executes on the preflight pod.',
  steps: [],
};

/**
 * @param {string[]} selectedComponents
 * @param {object} [opts]
 * @param {boolean} [opts.usingAap]
 */
export function filterOpenShiftWorkflow(selectedComponents, opts = {}) {
  const selected = new Set(
    (selectedComponents || []).map((c) => String(c).trim()).filter(Boolean)
  );
  const all = selected.has('all');
  const usingAap = opts.usingAap !== false;

  const nodeActive = (nodeId) => {
    const keys = OPENSHIFT_NODE_COMPONENTS[nodeId];
    if (keys === undefined) return true;
    if (!keys.length) return true; // sink nodes
    if (all) return true;
    return keys.some((k) => selected.has(k));
  };

  // Cert/RHBK spine: keep if any downstream app needs OAuth path or rhbk/cert selected
  const appNodes = OPENSHIFT_WORKFLOW.nodes
    .map((n) => n.id)
    .filter((id) => {
      const keys = OPENSHIFT_NODE_COMPONENTS[id] || [];
      return keys.some((k) =>
        ['grafana', 'gitlab', 'kafka', 'eck', 'quay', 'devspaces', 'dev_hub', 'zabbix',
          'bookstack', 'minio', 'netbox', 'acs', 'aap', 'dirsrv', 'gitops', 'oadp', 'pega'].includes(k)
      );
    });
  const anyApp = all || appNodes.some((id) => nodeActive(id));
  const keepSpine = anyApp || nodeActive('RHBK Workflow') || nodeActive('Cert Manager Workflow');

  let activeIds = new Set(
    OPENSHIFT_WORKFLOW.nodes.map((n) => n.id).filter((id) => {
      if (id === 'Cert Manager Workflow' || id === 'RHBK Workflow' || id === 'Configure OAuth/RHBK in OpenShift') {
        return keepSpine && (all || nodeActive(id) || anyApp);
      }
      return nodeActive(id);
    })
  );

  // Always keep sinks if anything else is active
  if (activeIds.size > 0) {
    activeIds.add('Print ADO Routes');
    activeIds.add('Alt Routes Workflow');
  }

  if (!usingAap) {
    // Still show graph but mark Contoller path as preview-only
  }

  const nodes = OPENSHIFT_WORKFLOW.nodes.filter((n) => activeIds.has(n.id));
  const edges = OPENSHIFT_WORKFLOW.edges.filter(
    (e) => activeIds.has(e.from) && activeIds.has(e.to)
  );

  return {
    ...OPENSHIFT_WORKFLOW,
    nodes,
    edges,
    inactiveCount: OPENSHIFT_WORKFLOW.nodes.length - nodes.length,
  };
}

/**
 * Linear bootstrap steps, then the filtered OpenShift workflow.
 * Last bootstrap step fans out to every Contoller root.
 */
export function buildCombinedPreviewGraph(selectedComponents, ctx = {}) {
  const controller = filterOpenShiftWorkflow(selectedComponents, ctx);
  const steps = buildBootstrapSteps(ctx);
  const usingAap = ctx.usingAap !== false;

  const nodes = steps.map((s) => ({
    id: s.id,
    label: s.label,
    jobTemplate: s.detail,
    kind: 'bootstrap',
  }));

  const edges = [];
  for (let i = 0; i < steps.length - 1; i += 1) {
    edges.push({ from: steps[i].id, to: steps[i + 1].id });
  }

  if (usingAap && controller.nodes.length) {
    nodes.push(...controller.nodes);
    edges.push(...controller.edges);
    const last = steps[steps.length - 1];
    const incoming = new Set(controller.edges.map((e) => e.to));
    const roots = controller.nodes.filter((n) => !incoming.has(n.id));
    const targets = roots.length ? roots : controller.nodes.slice(0, 1);
    if (last) {
      for (const root of targets) {
        edges.push({ from: last.id, to: root.id });
      }
    }
  }

  return {
    name: usingAap
      ? 'Bootstrap then ADO | OpenShift Workflow'
      : 'Bootstrap (no Contoller apply)',
    description: usingAap
      ? 'Every preflight bootstrap step, then the Contoller workflow for the apps selected on this form.'
      : 'Preflight bootstrap only. Contoller job templates are not applied.',
    nodes,
    edges,
    inactiveCount: controller.inactiveCount,
  };
}

/** Layer nodes by longest path from roots (for column layout). */
export function layoutWorkflowLayers(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const incoming = Object.fromEntries([...ids].map((id) => [id, []]));
  const outgoing = Object.fromEntries([...ids].map((id) => [id, []]));
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    outgoing[e.from].push(e.to);
    incoming[e.to].push(e.from);
  }
  const roots = [...ids].filter((id) => incoming[id].length === 0);
  const depth = {};
  const queue = roots.map((id) => [id, 0]);
  while (queue.length) {
    const [id, d] = queue.shift();
    depth[id] = Math.max(depth[id] ?? 0, d);
    for (const next of outgoing[id]) {
      queue.push([next, d + 1]);
    }
  }
  const maxD = Math.max(0, ...Object.values(depth));
  const layers = Array.from({ length: maxD + 1 }, () => []);
  for (const n of graph.nodes) {
    layers[depth[n.id] ?? 0].push(n);
  }
  return layers;
}
