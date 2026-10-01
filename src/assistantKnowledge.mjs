// Deterministic documentation lookup; never invent a role or execute a request.
export function answerQuestion(question, documents) {
  const q = question.trim().toLowerCase();
  const requested = q.match(/infra\.ado\.([a-z0-9_]+)/)?.[1];
  const alias = { install_keycloak: 'install_rhbk', install_keyclaok: 'install_rhbk' };
  // Prefer the role README over molecule/scenario READMEs with the same role name.
  const roleReadme = (role) => documents.find(d => d.path.toLowerCase() === `infra.ado/roles/${role}/readme.md`)
    || documents.find(d => d.path.toLowerCase().includes(`/roles/${role}/readme.md`));

  if (requested) {
    const role = alias[requested] || requested;
    const doc = roleReadme(role);
    if (!doc) return { answer: `I cannot find infra.ado.${requested} in the bundled READMEs. No usage example can be verified for that name.`, documents: [] };
    return { answer: requested !== role
      ? `There is no infra.ado.${requested} role in this bundle. The documented Red Hat Build of Keycloak role is infra.ado.${role}. Here is its README, including its usage examples.`
      : `Here is the bundled README for infra.ado.${role}, including its documented variables and examples.`, documents: [doc] };
  }
  // Not using AAP / local pod playbooks — before the Install AAP matcher.
  if (
    /not using aap|without aap|no[- ]aap|without ansible automation|local playbooks|run playbooks in (the )?pod|walk me through.*(not using|without) aap|show me how to use without aap|show me how to use not using aap/.test(q)
  ) {
    return {
      guide: 'local',
      answer: 'Let’s walk through Not using AAP: generate the playbook repo in this pod, then run the generated playbooks here (no Contoller). Use “Show me” to jump to each form section. After Bootstrap, use each playbook’s Options (state / channel / -e) and Preview ? for a step-through explain.',
      documents: []
    };
  }
  if (/playbook options|per[- ]playbook|common extra vars|step options|freeform -e/.test(q)) {
    return {
      guide: 'local',
      answer: 'Common extra vars sets state=present|absent for every selected playbook. Each step’s Options overrides state for that playbook only, and can set typed fields (ACM/Virt channel, Virt KubeSecondaryDNS) plus freeform -e. Preview commands, then click ? for a step-through explain.',
      documents: []
    };
  }
  if (/fleet management|all clusters|acm console|console plug-?in|multiclusterhub.*(ui|console)|why.*(acm|fleet).*(not|missing|show)/.test(q)) {
    const doc = roleReadme('ocp_acm');
    return {
      answer: 'ACM needs MultiClusterHub Running plus Console plug-ins acm and mce for Fleet Management. infra.ado.ocp_acm waits for Running and enables those plug-ins by default. If install is stuck Uninstalling from a prior delete, present heals that first (ocp_acm_heal_stuck_uninstall) or run state=absent for a thorough hub cleanup, then present again. Refresh the console and open Fleet Management (or All Clusters).',
      documents: doc ? [doc] : []
    };
  }
  if (/acm.*(absent|uninstall|cleanup|stuck)|stuck.*(uninstall|multiclusterhub|mch)/.test(q)) {
    const doc = roleReadme('ocp_acm');
    return {
      answer: 'Use Common extra vars or playbook Options with state=absent. ocp_acm removes MultiClusterHub and related hub objects (MultiClusterEngine, ClusterManager, local-cluster ManagedCluster), clears stuck uninstall finalizers, and drops known ACM validating webhooks whose Service is already gone. Then re-run with state=present.',
      documents: doc ? [doc] : []
    };
  }
  // NFS CSI / NFS StorageClass — before generic term ranking (README must be findable).
  if (
    /nfs[_\s-]?csi|csi[_\s-]?driver[_\s-]?nfs|nfs[_\s-]?storage|synology[_\s-]?nfs|ocp_nfs_storage|install.*nfs|nfs.*storage\s*class|storage\s*class.*nfs/.test(q)
  ) {
    const doc = roleReadme('ocp_nfs_storage');
    return {
      answer: [
        'NFS CSI is under OpenShift Options → Storage class → NFS CSI tab (infra.ado.ocp_nfs_storage).',
        'Enable NFS CSI, set nfs_server + nfs_share (optional StorageClass name, default synology-nfs-csi). Install during Bootstrap is on by default.',
        'Synology iSCSI is the sibling tab under the same Storage class option.',
        'Bootstrap expands to component_options nfs_csi / iscsi_csi for the collection. Contoller / local playbook: playbooks/openshift/ado-install-nfs-csi-bootstrap.yml.',
        'App storage fields (RHBK/Grafana/…) only Look up an existing StorageClass after the driver is installed.',
        'Open the bundled README for exact variables and examples.'
      ].join(' '),
      documents: doc ? [doc] : []
    };
  }
  if (/\baap\b|automation platform/.test(q) && /install|deploy|set ?up/.test(q) && !/\brhel\b|standalone|remove|delete|without|not using/.test(q)) {
    return { guide: 'aap', answer: 'Let’s walk through installing a new AAP instance on OpenShift. Use “Show me” to follow the existing form.', documents: [] };
  }
  const stop = new Set([
    'how', 'can', 'the', 'use', 'does', 'what', 'with', 'show', 'readme', 'examples',
    'please', 'want', 'about', 'for', 'ado', 'infra', 'who', 'won', 'and', 'are',
    'any', 'you', 'me', 'my', 'is', 'to', 'of', 'in', 'on', 'an', 'or', 'do', 'get'
  ]);
  const terms = q.replace(/keyclaok/g, 'keycloak').match(/[a-z0-9_]+/g)?.filter(w => w.length > 2 && !stop.has(w)) || [];
  if (!terms.length) {
    return {
      answer: 'Ask how to install AAP on OpenShift, how to use Not using AAP, NFS CSI / NFS StorageClass, or name an infra.ado role to open its README and examples.',
      documents: []
    };
  }
  const ranked = documents.map(doc => {
    const path = doc.path.toLowerCase();
    // Prefer role READMEs over molecule/scenario READMEs in generic search.
    if (path.includes('/molecule/') || path.includes('/extensions/molecule/')) {
      return { doc, score: 0 };
    }
    const body = (path + '\n' + doc.text).toLowerCase();
    const matches = terms.filter(t => body.includes(t));
    // Require every query term (avoids "who won baseball" false hits on stopword leakage).
    if (matches.length !== terms.length) return { doc, score: 0 };
    const score = matches.reduce((s, t) => s + (path.includes(t) ? 10 : 1), 0);
    return { doc, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.doc);
  return {
    answer: ranked.length
      ? 'These bundled READMEs match your question. Open a document to read its exact instructions and examples. Guided form actions cover Install AAP on OpenShift and Not using AAP. Ask about NFS CSI for StorageClass install help.'
      : 'I could not verify an answer in the bundled ADO / Preflight READMEs. Try an exact role name (for example infra.ado.ocp_nfs_storage), NFS CSI, Install AAP on OpenShift, or Not using AAP.',
    documents: ranked
  };
}
